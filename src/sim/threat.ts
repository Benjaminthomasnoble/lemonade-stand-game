// The raids-on-you rules (spec: Threat; Raids on the player; Anti-frustration guarantees), called from crew.ts's
// planNight and fightRaid: how many raids come tonight and who may send them (Respect, truces), what each is after
// and how many plots it hits, its makeup (lookouts from Threat 3, a boss at Threat 5), and the scripted tutorial
// raid that always bounces.
// Pure and seeded, like the rest of the sim.
import {
  FACTIONS, GUARD_BASE, NO_RAID_DAYS, RAID_BOSS, RAID_LEAVE, RAID_TARGETS, RAIDS_PER_WEEK, RIVAL_LOOKOUTS, SMASH_SHARE,
  type RivalId,
} from './balance.ts';
import type { BattleInput, BattleResult, Fighter, Objective } from './combat.ts';
import type { GameState } from './economy.ts';
import { ownedPlots } from './economy.ts';
import { PLOT_BY_ID, type Plot } from './map.ts';
import { nextRandom, type Rng } from './rng.ts';
import { guardFighter, hasBuilding, raidParty, threatLevel, TUTORIAL_RAID_DAY, type Guard, type Raid } from './crew.ts';
import { targetScore } from './rivalAi.ts';
import { HQS } from './rivals.ts';
import { difficulty } from './modes.ts';
import { hhmm, onYou, raidStart, travelMinutes } from './night.ts';

const RIVALS = Object.keys(FACTIONS) as RivalId[];

/** Lottie's first guard, the tutorial raid's wall. */
export const DEX = 'Dex Moody';
/** Brock's call on the day of the first raid (spec: Act 2, First call). */
export const TUTORIAL_CALL = 'Bro. Your stand is in my sun.';

// ---------- how many, and who ----------

/** A rival may raid you tonight: it's still in and isn't backing off after a raid of its you beat. */
export const mayRaidYou = (s: GameState, id: RivalId) => s.rivals[id].alive && s.rivals[id].respectUntil <= s.day + 1;

/** Raids on you per week right now: by Threat (1 / 2 / 3 / 4 / 6), × the difficulty (Laid Back ×0.5, Cutthroat ×1.5,
 * Custom's slider). */
export const weeklyRaids = (s: GameState) => RAIDS_PER_WEEK[threatLevel(s) - 1] * difficulty(s).raids;

/** How many raids come tonight for a nightly mean: a Poisson draw read off one uniform, so several can land on one
 * night, and a busier rate raids on every night a quieter one does. */
export function raidCount(mean: number, u: number): number {
  let k = 0, p = Math.exp(-mean), cdf = p;
  while (u >= cdf && k < 12) { k++; p *= mean / k; cdf += p; }
  return k;
}

/** The tutorial raid has been fought. */
export const tutorialDone = (s: GameState) => s.battles.some((b) => b.defender === 'player');
/** The first raid's night: the night your first Kiosk (Level 3) opens, or Day 15's (after the Summer Fair). */
export const tutorialNight = (s: GameState) => s.day >= TUTORIAL_RAID_DAY || ownedPlots(s, 'player').some((p) => (s.plots[p.id].stand?.level ?? 0) >= 3);

// ---------- raids on you ----------

/** The weakest valuable plot of yours for this rival (value over defense), one nobody's going for yet tonight while
 * there is one. */
function weakest(s: GameState, rival: RivalId, mine: Plot[], taken: Set<string>): Plot {
  const free = mine.filter((p) => !taken.has(p.id));
  const pool = free.length ? free : mine;
  return [...pool].sort((a, b) => targetScore(s, rival, b.id) - targetScore(s, rival, a.id) || a.id.localeCompare(b.id))[0];
}

/** The scripted first raid on you: two Smoothie Bros with bare fists, announced, for a Shakedown, straight at Dex.
 * It always bounces (withDex, tutorialBounce). Brock calls first. */
function tutorialRaid(s: GameState, rng: Rng, mine: Plot[]): Raid {
  const dex = s.guards.find((g) => g.name === DEX && g.post && s.plots[g.post]?.owner === 'player' && hasBuilding(s.plots[g.post]));
  const target = dex ? PLOT_BY_ID[dex.post!] : weakest(s, 'blenders', mine, new Set());
  const rival: RivalId = s.rivals.blenders.alive ? 'blenders' : RIVALS.find((r) => s.rivals[r].alive) ?? 'blenders';
  const party = raidParty(s, rival, 1, rng).slice(0, 2).map((f) => ({ ...f, weapon: 'fists' as const, hp: 30, hit: 2, chop: 1, nerve: 20 }));
  const leave = RAID_LEAVE.first + Math.floor(nextRandom(rng) * RAID_LEAVE.steps) * 15;
  const at = leave + travelMinutes(s, raidStart(s, rival, target.id), target.id);
  if (rival === 'blenders') s.news.push(`Brock: "${TUTORIAL_CALL}"`); // story: phoneCall(s, 'blenders', TUTORIAL_CALL) once the phone lands
  return { id: `r${s.nextId++}`, attacker: rival, target: target.id, objective: 'shakedown', party, detected: true, eta: hhmm(at), leave, at, tutorial: true };
}

/** One raid on you at a Threat tier: its party, what it's after (Smash 0 / 30 / 60 / 70 / 100% by Threat), how many
 * plots it hits (1, 1, 1, 1–2, 2–3), its lookouts (from Threat 3) and, at Threat 5, its boss. The detection roll
 * waits until they set out (night.ts launch). */
export function raidOnYou(s: GameState, rng: Rng, rival: RivalId, target: Plot, tier: number): Raid {
  const party = raidParty(s, rival, tier, rng);
  const objective: Objective = nextRandom(rng) < SMASH_SHARE[tier - 1] ? 'smash' : 'shakedown';
  const [lo, hi] = RAID_TARGETS[tier - 1];
  const spread = lo + Math.floor(nextRandom(rng) * (hi - lo + 1));
  const leave = RAID_LEAVE.first + Math.floor(nextRandom(rng) * RAID_LEAVE.steps) * 15;
  const at = leave + travelMinutes(s, raidStart(s, rival, target.id), target.id);
  const lookouts = RIVAL_LOOKOUTS.perRaid[tier - 1];
  return {
    id: `r${s.nextId++}`, attacker: rival, target: target.id, objective, party, detected: false, eta: hhmm(at), leave, at,
    ...(spread > 1 ? { spread } : {}), ...(lookouts ? { lookouts } : {}), ...(tier >= 5 ? { led: true } : {}),
  };
}

/** Tonight's raids on you (planNight, at closing): none in the first five days; the scripted tutorial raid on its
 * night (and nothing before it); after that a Poisson count for the week's rate, each from a rival who may raid you,
 * at the weakest valuable plot nobody else is hitting tonight. The bosses settle who actually sends each one
 * (rivalAi signatureRaids) and the multi-plot ones split after that (spreadRaids). */
export function raidsOnYou(s: GameState, rng: Rng): Raid[] {
  const u = nextRandom(rng);
  const mine = ownedPlots(s, 'player').filter((p) => hasBuilding(s.plots[p.id]));
  if (s.day <= NO_RAID_DAYS || !mine.length) return [];
  if (!tutorialDone(s)) return tutorialNight(s) && RIVALS.some((r) => s.rivals[r].alive) ? [tutorialRaid(s, rng, mine)] : [];
  const n = raidCount(weeklyRaids(s) / 7, u);
  const out: Raid[] = [];
  const taken = new Set<string>();
  for (let i = 0; i < n; i++) {
    const rival = pickRival(s, rng);
    if (!rival) break;
    const target = weakest(s, rival, mine, taken);
    taken.add(target.id);
    out.push(raidOnYou(s, rng, rival, target, threatLevel(s)));
  }
  return out;
}

/** Who sends a raid on you, before the bosses settle it: weighted by Grudge, Attention and Strike. */
function pickRival(s: GameState, rng: Rng): RivalId | null {
  const candidates = RIVALS.filter((r) => mayRaidYou(s, r));
  if (!candidates.length) return null;
  const weights = candidates.map((r) => 1 + s.rivals[r].grudge / 10 + s.rivals[r].attention + FACTIONS[r].strike * 4);
  let x = nextRandom(rng) * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < candidates.length; i++) { x -= weights[i]; if (x <= 0) return candidates[i]; }
  return candidates[candidates.length - 1];
}

// ---------- splitting a raid across plots, and its boss ----------

/** A boss at the head of a raid on you: as tough as in their Boss Room. */
export function raidBoss(s: GameState, id: RivalId): Fighter {
  const m = 0.75 + 0.25 * HQS[id].tier;
  return {
    id: `${id}-boss-${s.nextId++}`, name: HQS[id].boss, side: 'att', hp: GUARD_BASE.hp * RAID_BOSS.hp * m, hit: RAID_BOSS.hit * m,
    chop: RAID_BOSS.chop, nerve: RAID_BOSS.nerve, armor: RAID_BOSS.armor, weapon: 'clubs', level: 5,
  };
}

/** Set a raid's target and its arrival from where the raider sets out. */
function aim(s: GameState, r: Raid, target: string): void {
  r.target = target;
  r.at = r.leave! + travelMinutes(s, raidStart(s, r.attacker as RivalId, target), target);
  r.eta = hhmm(r.at);
}

/**
 * planNight's last step, once the bosses have settled who sends what (rivalAi signatureRaids): two raids tonight never
 * go for the same plot while you have another; a raid on several plots splits its party between them (each part
 * warned and fought on its own, all of them one raid: `group`); and a boss-led raid gets its boss, with the first part.
 */
export function spreadRaids(s: GameState): void {
  const mine = ownedPlots(s, 'player').filter((p) => hasBuilding(s.plots[p.id]));
  const tonight = s.raids.filter((r) => onYou(s, r) && !r.launched && !r.delivery && !r.tutorial && r.party?.length && r.leave !== undefined);
  const taken = new Set<string>();
  for (const r of tonight) {
    if (taken.has(r.target)) {
      const next = weakest(s, r.attacker as RivalId, mine, taken);
      if (!taken.has(next.id)) aim(s, r, next.id);
    }
    taken.add(r.target);
  }
  for (const r of tonight) {
    const n = Math.min(r.spread ?? 1, r.party!.length);
    delete r.spread;
    if (r.led) r.party = [raidBoss(s, r.attacker as RivalId), ...r.party!];
    delete r.led;
    if (n < 2) continue;
    const targets = [r.target];
    while (targets.length < n) {
      const next = weakest(s, r.attacker as RivalId, mine, taken);
      if (taken.has(next.id)) break; // every plot of yours is already somebody's target tonight
      taken.add(next.id);
      targets.push(next.id);
    }
    if (targets.length < 2) continue;
    const parts = targets.map(() => [] as Fighter[]);
    r.party!.forEach((f, i) => parts[i % parts.length].push(f)); // dealt round the parts: the boss stays with the first
    r.group = r.id;
    r.party = parts[0];
    for (let i = 1; i < targets.length; i++) {
      const part: Raid = { ...r, id: `r${s.nextId++}`, party: parts[i] };
      aim(s, part, targets[i]);
      s.raids.push(part);
    }
  }
}

/** The raid's lookouts cut the target's chance to spot it coming (night.ts launch rolls detection with this). */
export const lookoutStealth = (r: Raid) => (r.lookouts ?? 0) * RIVAL_LOOKOUTS.stealth;

/** How many raids a list holds, a raid on several plots counted once (its parts share a group). */
export const raidsCounted = (raids: Raid[]) => new Set(raids.map((r) => r.group ?? r.id)).size;

// ---------- the tutorial raid ----------

/** Dex as he fights for the tutorial raid: himself, or (let go since) the lanky teen in his first-day kit. */
function dexFighter(s: GameState, raid: Raid, night: boolean): Fighter {
  const dex = s.guards.find((g) => g.name === DEX);
  const standIn: Guard = { id: 'dex-moody', name: DEX, trait: 'Loyal', level: 1, xp: 0, weapon: 'fists', gear: 'none', post: raid.target, outUntil: 0, fee: 0 };
  return guardFighter(dex ?? standIn, 'def', night);
}

/** battleInput's defenders: the tutorial raid always finds Dex at the stand, wherever he's posted (moved off after the
 * warning, out of action, or let go), so it bounces off him and the fence. Every other raid fights who's there. */
export function withDex(s: GameState, raid: Raid, defenders: Fighter[], night: boolean): Fighter[] {
  if (!raid.tutorial) return defenders;
  const dex = s.guards.find((g) => g.name === DEX);
  if (dex && defenders.some((f) => f.id === dex.id)) return defenders;
  return [dexFighter(s, raid, night), ...defenders];
}

/** fightRaid's tutorial branch: the first raid on you ends repelled whatever the dice did (with Dex there it all but
 * always does on its own), the stand untouched. */
export function tutorialBounce(input: BattleInput, res: BattleResult): void {
  if (res.outcome === 'repelled') return;
  res.winner = 'def';
  res.outcome = 'repelled';
  res.standHpLeft = input.standHp;
}
