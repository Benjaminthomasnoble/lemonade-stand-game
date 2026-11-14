// The raids-on-you rules (spec: Threat; Raids on the player; Anti-frustration guarantees), called from crew.ts's
// planNight and fightRaid: how many raids come tonight and who may send them (Respect, truces), what each is after
// and how many plots it hits, its makeup (lookouts from Threat 3, a boss at Threat 5), the rivals' raids on each other,
// and the scripted tutorial raid on Night 3: any fence or guard bounces it; undefended it takes the till.
// Pure and seeded, like the rest of the sim.
import {
  BOSS_SCALE, FACTIONS, GUARD_BASE, MAX_QUIET_NIGHTS, NO_RAID_DAYS, RAID_BOSS, RAID_LEAVE, RAID_TARGETS, RAIDS_PER_WEEK, RIVAL_LOOKOUTS, RIVAL_RAID_AT, RIVAL_VS_RIVAL,
  SMASH_SHARE, SYNDICATE_RAIDS_PER_WEEK, SYNDICATE_TIER, type RivalId,
} from './balance.ts';
import type { BattleInput, BattleResult, Fighter, Objective } from './combat.ts';
import type { GameState } from './economy.ts';
import { ownedPlots } from './economy.ts';
import { BORDERS, PLOT_BY_ID, PLOTS, type Plot } from './map.ts';
import { nextRandom, type Rng } from './rng.ts';
import { guardFighter, hasBuilding, raidParty, threatLevel, TUTORIAL_RAID_DAY, type Guard, type Raid } from './crew.ts';
import { canSpend, grudge, raidCost, rivalTarget, spend, targetScore } from './rivalAi.ts';
import { HQS, inTruce } from './rivals.ts';
import { difficulty } from './modes.ts';
import { hhmm, onYou, raidStart, travelMinutes } from './night.ts';
import { syndicateFormed, syndicateLeader, syndicateMembers } from './syndicate.ts';
import { siegeTargets, siegeTonight } from './squeeze.ts';
import { rumorTonight } from './calls.ts';

const RIVALS = Object.keys(FACTIONS) as RivalId[];

/** Lottie's first guard, the tutorial raid's wall. */
export const DEX = 'Dex Moody';

// ---------- how many, and who ----------

/** A rival may raid you tonight: it's still in, isn't backing off after a raid of its you beat (beaten on night D,
 * it sits out nights D+1 to D+R and may come again on D+R+1, R the difficulty's Respect days), and isn't in a Truce
 * (made on Day D, no raids through the night of D+6). */
export const mayRaidYou = (s: GameState, id: RivalId) => s.rivals[id].alive && s.rivals[id].respectUntil <= s.day && !inTruce(s, id);

/** Raids on you per week right now: by Threat (1 / 2 / 3 / 4 / 6), or the Syndicate's 6 once it stands, × the
 * difficulty (Laid Back ×0.5, Cutthroat ×1.5, Custom's slider). */
export const weeklyRaids = (s: GameState) => (syndicateFormed(s) ? SYNDICATE_RAIDS_PER_WEEK : RAIDS_PER_WEEK[threatLevel(s) - 1]) * difficulty(s).raids;

/** How many raids come tonight for a nightly mean: a Poisson draw read off one uniform, so several can land on one
 * night, and a busier rate raids on every night a quieter one does. */
export function raidCount(mean: number, u: number): number {
  let k = 0, p = Math.exp(-mean), cdf = p;
  while (u >= cdf && k < 12) { k++; p *= mean / k; cdf += p; }
  return k;
}

/** The tutorial raid has been fought: a saved flag, so it never comes back once the six-fight log rolls over (a raid
 * on you still on record counts too, for hand-built and old states). */
export const tutorialDone = (s: GameState) => !!s.tutorialRaidDone || s.battles.some((b) => b.defender === 'player');
/** The first raid's night: Night 3 (the Day 3 rumor's). */
export const tutorialNight = (s: GameState) => s.day >= TUTORIAL_RAID_DAY;

// ---------- raids on you ----------

/** The weakest valuable plot of yours for this rival (value over defense) near its turf, one nobody's going for yet
 * tonight while there is one. "Near its turf" is the rule its Corkboard pin follows (rivalAi likeliestTarget): a
 * district where it holds land or its home, or one bordering those; with nothing of yours near, anywhere. So a raid's
 * first plot is the raider's pin, and its other parts and the night's other raids go for the next ones. */
function weakest(s: GameState, rival: RivalId, mine: Plot[], taken: Set<string>): Plot {
  const free = mine.filter((p) => !taken.has(p.id));
  const pool = free.length ? free : mine;
  const turf = new Set<string>([FACTIONS[rival].home, ...PLOTS.filter((p) => s.plots[p.id].owner === rival).map((p) => p.district)]);
  const near = pool.filter((p) => turf.has(p.district) || BORDERS[p.district].some((d) => turf.has(d)));
  return [...(near.length ? near : pool)].sort((a, b) => targetScore(s, rival, b.id) - targetScore(s, rival, a.id) || a.id.localeCompare(b.id))[0];
}

/** The scripted first raid on you, on Night 3: two Smoothie Bros with bare fists, announced, for a Shakedown, at the
 * plot the Day 3 rumor named (`told`: the Corner), else Dex's post or your weakest plot. Any fence or guard bounces
 * it; undefended it takes the till (tutorialBounce). Brock has phoned since Day 1 (phone.ts). */
function tutorialRaid(s: GameState, rng: Rng, mine: Plot[], rival: RivalId, told?: Plot): Raid {
  const dex = s.guards.find((g) => g.name === DEX && g.post && s.plots[g.post]?.owner === 'player' && hasBuilding(s.plots[g.post]));
  const target = told ?? (dex ? PLOT_BY_ID[dex.post!] : weakest(s, rival, mine, new Set()));
  const party = raidParty(s, rival, 1, rng).slice(0, 2).map((f) => ({ ...f, weapon: 'fists' as const, hp: 30, hit: 2, chop: 1, nerve: 20 }));
  const leave = RAID_LEAVE.first + Math.floor(nextRandom(rng) * RAID_LEAVE.steps) * 15;
  const at = leave + travelMinutes(s, raidStart(s, rival, target.id), target.id);
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

/** Tonight's raids on you (planNight, at closing): none on Nights 1-2 (NO_RAID_DAYS); the scripted tutorial raid on
 * Night 3 (and nothing before it); on a Big Squeeze siege night, the one strike on its named targets; after that a
 * Poisson count for the week's rate, at least one once MAX_QUIET_NIGHTS have gone by without a raid, each from a rival
 * who may raid you, at the weakest valuable plot nobody else is hitting tonight. A rumor answered today (calls.ts)
 * makes the night's first raid its gang at its plot: it adds a raid only on a night the count gave none. The bosses
 * settle who actually sends each one (rivalAi signatureRaids) and the multi-plot ones split after that (spreadRaids). */
export function raidsOnYou(s: GameState, rng: Rng): Raid[] {
  const u = nextRandom(rng);
  const mine = ownedPlots(s, 'player').filter((p) => hasBuilding(s.plots[p.id]));
  if (s.day <= NO_RAID_DAYS || !mine.length) return [];
  const rumor = rumorTonight(s); // a day call's rumor (calls.ts): that rival comes for that plot tonight
  const rumored = rumor && mayRaidYou(s, rumor.rival) && mine.some((p) => p.id === rumor.plot) ? rumor : undefined;
  if (!tutorialDone(s)) {
    // Brock's Bros, at the plot today's answered rumor named (Day 3's is the Corner), sent by the rumor's gang when it
    // may come; if the Blenders are out or in a Truce with you, the next rival who may raid sends the same two.
    const told = rumor ? mine.find((p) => p.id === rumor.plot) : undefined;
    const rival = rumored?.rival ?? (['blenders', ...RIVALS] as RivalId[]).find((r) => mayRaidYou(s, r));
    return tutorialNight(s) && rival ? [tutorialRaid(s, rng, mine, rival, told)] : [];
  }
  if (siegeTonight(s)) return siegeStrike(s, rng);
  const pact = syndicateFormed(s);
  // Its first strike comes the night the Syndicate forms; and after too many quiet nights in a row, somebody comes.
  const quiet = s.day - (s.lastRaidOnYou ?? s.day);
  const due = quiet > MAX_QUIET_NIGHTS[s.settings.difficulty] ? 1 : 0;
  const n = Math.max(pact && s.syndicate!.formed === s.day ? 1 : 0, due, raidCount(weeklyRaids(s) / 7, u));
  const out: Raid[] = [];
  const taken = new Set<string>();
  for (let i = 0; i < Math.max(n, rumored ? 1 : 0); i++) {
    const told = i === 0 && !!rumored; // flagged, so the bosses keep its gang and plot (rivalAi signatureRaids)
    const owed = due > 0 && !rumored && !out.length; // the cap's raid (a rumored one already comes): flagged, so it comes paid or not
    const rival = told ? rumored.rival : pickRival(s, rng);
    if (!rival) break;
    const target = told ? PLOT_BY_ID[rumored.plot] : weakest(s, rival, mine, taken);
    const raid = pact ? syndicateStrike(s, rng, rival, target, told || owed) : raidOnYou(s, rng, rival, target, threatLevel(s));
    if (!raid) continue;
    if (told) raid.rumor = true;
    if (owed) raid.due = true;
    taken.add(target.id);
    out.push(raid);
  }
  return out;
}

/** A Syndicate strike, sent by one of its members (`rival`, who may raid you): Threat 5's raid whatever the Threat,
 * always a Smash, flagged for combat's hooks. Paid from the sender's Strike, or short of it from the Pact's (the leader
 * first); null when nobody in it can pay (the bosses settle no Syndicate strike in signatureRaids), unless it must
 * come (`house`: a rumored raid, or the quiet-night cap's), when it's on the house. */
function syndicateStrike(s: GameState, rng: Rng, rival: RivalId, target: Plot, house = false): Raid | null {
  const raid: Raid = { ...raidOnYou(s, rng, rival, target, SYNDICATE_TIER), objective: 'smash', syndicate: true };
  const cost = raidCost(s, rival, raid.party!.length, SYNDICATE_TIER);
  const payer = [rival, syndicateLeader(s), ...syndicateMembers(s)].find((id): id is RivalId => !!id && canSpend(s, id, 'strike', cost));
  if (!payer) return house ? raid : null;
  spend(s, payer, 'strike', cost);
  return raid;
}

/** A Big Squeeze siege night's raid (squeeze.ts): one Syndicate strike on the targets named at dawn that still stand,
 * its party dealt among them with the sender's boss at the head of the first. The Pact is all in: whoever isn't in a
 * Truce with you may send it, backing off or not, and it comes whether or not anyone's Strike can pay for it. */
function siegeStrike(s: GameState, rng: Rng): Raid[] {
  const targets = siegeTargets(s).filter((id) => s.plots[id]?.owner === 'player' && hasBuilding(s.plots[id]));
  const senders = syndicateMembers(s).filter((id) => !inTruce(s, id));
  if (!targets.length || !senders.length) return [];
  const rival = weighted(rng, senders, (r) => 1 + s.rivals[r].grudge / 10 + s.rivals[r].attention + FACTIONS[r].strike * 4);
  const { spread: _spread, led: _led, ...raid } = raidOnYou(s, rng, rival, PLOT_BY_ID[targets[0]], SYNDICATE_TIER);
  const cost = raidCost(s, rival, raid.party!.length, SYNDICATE_TIER);
  const payer = [rival, syndicateLeader(s), ...syndicateMembers(s)].find((id): id is RivalId => !!id && canSpend(s, id, 'strike', cost));
  if (payer) spend(s, payer, 'strike', cost);
  const parts = targets.map(() => [] as Fighter[]);
  [raidBoss(s, rival), ...raid.party!].forEach((f, i) => parts[i % parts.length].push(f));
  return targets.map((target, i) => {
    const part: Raid = { ...raid, id: i ? `r${s.nextId++}` : raid.id, objective: 'smash', party: parts[i], syndicate: true, siege: true, ...(targets.length > 1 ? { group: raid.id } : {}) };
    aim(s, part, target);
    return part;
  });
}

/** Who sends a raid on you, before the bosses settle it: weighted by Grudge, Attention and Strike. */
function pickRival(s: GameState, rng: Rng): RivalId | null {
  const candidates = RIVALS.filter((r) => mayRaidYou(s, r));
  if (!candidates.length) return null;
  return weighted(rng, candidates, (r) => 1 + s.rivals[r].grudge / 10 + s.rivals[r].attention + FACTIONS[r].strike * 4);
}

function weighted<T>(rng: Rng, items: T[], weight: (x: T) => number): T {
  const weights = items.map(weight);
  let x = nextRandom(rng) * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < items.length; i++) { x -= weights[i]; if (x <= 0) return items[i]; }
  return items[items.length - 1];
}

// ---------- rivals raiding each other ----------

/** Rival-vs-rival raids a week: of all rival raids, the share aimed at other rivals (30% at Threat 1–3, 15% at
 * Threat 4, none once the Syndicate forms) over the raids on you, so share / (1 − share) × your weekly rate. */
export function feudRaids(s: GameState): number {
  const share = syndicateFormed(s) ? 0 : RIVAL_VS_RIVAL[threatLevel(s) - 1];
  return (weeklyRaids(s) * share) / (1 - share);
}

/** Tonight's raids between rivals (planNight): a Poisson count at the feud rate. Grudge picks who goes (each boss at
 * most once a night) and where (rivalAi rivalTarget: the faction it's angriest with, near its turf); the bosses pay
 * for them (signatureRaids). Always a Smash at 02:00, with the next Threat tier's crew (at most tier 3). */
export function rivalRaids(s: GameState, rng: Rng): Raid[] {
  const u = nextRandom(rng);
  const open = RIVALS.filter((r) => s.rivals[r].alive);
  const out: Raid[] = [];
  if (open.length < 2) return out;
  const tier = Math.min(3, threatLevel(s) + 1);
  for (let n = raidCount(feudRaids(s) / 7, u); n > 0 && open.length; n--) {
    const a = weighted(rng, open, (r) => 1 + Math.max(0, ...RIVALS.map((b) => (b !== r && s.rivals[b].alive ? grudge(s, r, b) : 0))) / 10);
    open.splice(open.indexOf(a), 1);
    const t = rivalTarget(s, a);
    if (!t) continue;
    out.push({
      id: `r${s.nextId++}`, attacker: a, target: t.id, objective: 'smash', party: raidParty(s, a, tier, rng), detected: true,
      eta: hhmm(RIVAL_RAID_AT), leave: RIVAL_RAID_AT - travelMinutes(s, raidStart(s, a, t.id), t.id), at: RIVAL_RAID_AT,
    });
  }
  return out;
}

// ---------- splitting a raid across plots, and its boss ----------

/** A boss at the head of a raid on you: as tough as in their Boss Room. */
export function raidBoss(s: GameState, id: RivalId): Fighter {
  const m = BOSS_SCALE(HQS[id].tier);
  return {
    id: `${id}-boss-${s.nextId++}`, name: HQS[id].boss, side: 'att', hp: GUARD_BASE.hp * RAID_BOSS.hp * m, hit: RAID_BOSS.hit * m,
    chop: RAID_BOSS.chop, nerve: RAID_BOSS.nerve, armor: RAID_BOSS.armor, weapon: 'clubs', level: 5, boss: true,
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

/** Saves: the tutorial flag for an older save (the battle log or the day says whether the first raid has been), and a
 * tutorial raid it had planned tonight is marked so it still bounces. A run begun since carries its own flag (false
 * from newGame), which this leaves be. Safe to run on every load. */
export function migrateThreat(s: GameState): void {
  if (s.tutorialRaidDone !== undefined) return;
  s.tutorialRaidDone = tutorialDone(s) || s.day > TUTORIAL_RAID_DAY;
  if (s.tutorialRaidDone) return;
  const old = s.raids.find((r) => onYou(s, r) && r.party?.length === 2 && r.party.every((f) => f.hp === 30 && f.weapon === 'fists'));
  if (old) old.tutorial = true;
}

/** Dawn: any raid on you now on record means the tutorial is behind you, before the log can roll it off. */
export function threatAtDawn(s: GameState): void {
  if (!s.tutorialRaidDone && tutorialDone(s)) s.tutorialRaidDone = true;
}

/** Dex as he fights for the tutorial raid: himself, or (let go since) the lanky teen in his first-day kit. */
function dexFighter(s: GameState, raid: Raid, night: boolean): Fighter {
  const dex = s.guards.find((g) => g.name === DEX);
  const standIn: Guard = { id: 'dex-moody', name: DEX, trait: 'Loyal', level: 1, xp: 0, weapon: 'fists', gear: 'none', post: raid.target, outUntil: 0, fee: 0 };
  return guardFighter(dex ?? standIn, 'def', night);
}

/** battleInput's defenders: once Dex is on your crew, the tutorial raid finds him at the stand wherever he's posted.
 * Before he joins (the raid comes on Night 3, Dex on Day 4) it fights who's there: a fence, or nobody. */
export function withDex(s: GameState, raid: Raid, defenders: Fighter[], night: boolean): Fighter[] {
  if (!raid.tutorial) return defenders;
  const dex = s.guards.find((g) => g.name === DEX);
  if (!dex || defenders.some((f) => f.id === dex.id)) return defenders;
  return [dexFighter(s, raid, night), ...defenders];
}

/** fightRaid's tutorial branch: the first raid on you bounces whatever the dice did if you defended the plot at all
 * (a fence, or anyone standing guard), the stand untouched. Undefended, Brock's Bros take the till: the first lesson
 * in what a night costs. Guards who Fall Back get no bounce: they gave the fight up, and it plays out as it fell.
 * Either way the run's tutorial is done. */
export function tutorialBounce(s: GameState, input: BattleInput, res: BattleResult): void {
  s.tutorialRaidDone = true;
  if (res.outcome === 'repelled' || res.fellBack) return;
  if (!input.perimeter && !input.defenders.length) return;
  res.winner = 'def';
  res.outcome = 'repelled';
  res.standHpLeft = input.standHp;
}
