// Nabbed (spec: Nobody dies, "Each KO'd attacker left behind has a 10% chance
// to be Nabbed. The captor can ransom them for their hire fee, release them
// for +0.05 star, or recruit them as a Former Rival (Loyal guards refuse)";
// "It works both ways: rivals can nab your guards and ask you for a ransom").
// Winners carry their KO'd home, and so does a side that Falls Back, or a raid
// that holds the field when its time runs out; a beaten raid leaves its KO'd
// behind, and each rolls the chance, wherever you're one side of the fight.
//
// A henchman you nab waits in your Crew tab until you choose: their side pays
// their hire fee to get them back, you let them go, or they come over as a
// Former Rival (+10% Hit and Chop against their old faction), unless they're
// Loyal. Henchmen have no traits of their own, so a nabbed one rolls a
// recruit's (who they'd be on your crew). A guard of yours a rival nabs stays
// on your roster, Out while held: pay their hire fee within a few days, or they
// go over to the rival; a Loyal guard won't, and walks home. Pure, like the
// rest of the sim.
import { FACTIONS, GUARD_FEE, HIRE_RANK, NABBED, RANKS, TRAITS, type RivalId, type Trait } from './balance.ts';
import type { BattleResult, Fighter } from './combat.ts';
import type { FactionId } from './map.ts';
import { nextRandom, type Rng } from './rng.ts';
import { makeGuard, rosterCap, type Guard } from './crew.ts';
import { backOnGuard, hqOf } from './garrison.ts';
import { canSpend, spend } from './rivalAi.ts';
import { alert } from './alerts.ts';
import type { Blocker, GameState } from './economy.ts';

/** A KO'd raider left behind, held by the side they raided. */
export interface Captive {
  id: string; // your guard's id (a rival holds them), or the henchman's as they'd join your crew
  from: FactionId; // the side they fought for
  by: FactionId; // who holds them
  day: number; // Nabbed that day
  until?: number; // your guard: unpaid by this dawn, they go over to the rival (a Loyal one walks home)
  back?: number; // your guard: their day back from the KO, once home
  guard?: Guard; // a henchman you hold: who they'd be on your crew (a Loyal one won't switch sides)
}

export type CaptiveChoice = 'ransom' | 'release' | 'recruit' | 'pay';

const round2 = (n: number) => Math.round(n * 100) / 100;
const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const RIVALS = Object.keys(FACTIONS) as RivalId[];
/** A rival's henchman, one of them: "Smoothie Bros" makes a "Smoothie Bro". */
export const henchmanWord = (r: RivalId) => FACTIONS[r].henchmen.replace(/s$/, '');

/** A recruit's trait: anything but Former Rival, which only a captive who comes over has (a reroll keeps the rest even). */
export function recruitTrait(rng: Rng): Trait {
  for (;;) {
    const t = TRAITS[Math.floor(nextRandom(rng) * TRAITS.length)];
    if (t !== 'Former Rival') return t;
  }
}

/** A captive's ransom: their hire fee by level ($50–$2,500). */
export const ransomFor = (level: number) => GUARD_FEE[Math.min(5, Math.max(1, Math.round(level))) - 1];

/**
 * The KO'd raiders a fight leaves behind: none when the raid won, held the field as its time ran out (no defender
 * standing to nab anyone), or Fell Back carrying them. `earlier`: raiders KO'd in rooms already fought (an HQ).
 */
export function leftBehind(attackers: Fighter[], res: Pick<BattleResult, 'outcome' | 'koed' | 'fellBack'>, earlier: Fighter[] = []): Fighter[] {
  if (res.outcome !== 'repelled' || res.fellBack === 'att') return [];
  return [...earlier, ...attackers.filter((f) => res.koed.includes(f.id))];
}

/** Your guard is held: off post and Out till the rival gives up on the ransom. */
function holdGuard(s: GameState, id: string, by: RivalId): Captive | null {
  const g = s.guards.find((x) => x.id === id);
  if (!g) return null;
  const until = s.day + 1 + NABBED.days;
  const c: Captive = { id, from: 'player', by, day: s.day, until, back: g.outUntil };
  g.post = null;
  g.outUntil = Math.max(g.outUntil, until);
  return c;
}

/** A henchman you hold, as they'd be on your crew: a name, their level and a recruit's trait; seeing stars from the KO. */
function holdHenchman(s: GameState, f: Fighter, from: RivalId, axed: boolean, rng: Rng): Captive {
  const g = makeGuard(s, rng, Math.min(5, Math.max(1, f.level ?? 1)));
  g.outUntil = s.day + 1 + (axed ? 2 : 1);
  return { id: g.id, from, by: 'player', day: s.day, guard: g };
}

/**
 * The aftermath's Nabbed roll: each raider left behind is Nabbed on NABBED.chance by the side they raided. Only where
 * you're one side of the fight (rivals don't hold each other's). Returns who was Nabbed.
 */
export function nabLeftBehind(s: GameState, from: FactionId, by: FactionId, left: Fighter[], plot: string, hatchetKos: string[] = []): Captive[] {
  if (!left.length || from === by || (from !== 'player' && by !== 'player')) return [];
  const rng = { seed: s.seed };
  const got: Captive[] = [];
  for (const f of left) {
    if (nextRandom(rng) >= NABBED.chance) continue;
    const c = from === 'player' ? holdGuard(s, f.id, by as RivalId) : holdHenchman(s, f, from as RivalId, hatchetKos.includes(f.id), rng);
    if (c) got.push(c);
  }
  s.seed = rng.seed;
  if (!got.length) return got;
  (s.captives ??= []).push(...got);
  if (from === 'player') {
    for (const c of got) alert(s, { kind: 'note', text: `${FACTIONS[by as RivalId].henchmen} nabbed ${captiveGuard(s, c)!.name.split(' ')[0]}! Ransom: ${money(ransomOf(s, c))}.`, plot });
  } else {
    const r = from as RivalId;
    alert(s, { kind: 'note', text: `You nabbed ${got.length === 1 ? `a ${henchmanWord(r)}` : `${got.length} ${FACTIONS[r].henchmen}`}.`, plot });
  }
  return got;
}

/** Who a captive is: the henchman as they'd join you, or your guard on the roster. */
export const captiveGuard = (s: GameState, c: Captive): Guard | undefined => c.guard ?? s.guards.find((g) => g.id === c.id);

/** A captive's ransom, by their level now. */
export const ransomOf = (s: GameState, c: Captive): number => ransomFor(captiveGuard(s, c)?.level ?? 1);

/** Dawns left to pay a rival for your guard. */
export const daysToPay = (s: GameState, c: Captive): number => Math.max(0, (c.until ?? s.day) - s.day);

/** Can you make this choice for this captive? Ransom, release or recruit one you hold; pay for one of yours. */
export function canSettle(s: GameState, id: string, choice: CaptiveChoice): Blocker {
  const c = s.captives?.find((x) => x.id === id);
  const g = c && captiveGuard(s, c);
  if (!c || !g) return { ok: false, why: 'Gone' };
  const fee = ransomOf(s, c);
  if (c.by !== 'player') {
    if (choice !== 'pay') return { ok: false, why: `${FACTIONS[c.by as RivalId].henchmen} hold them` };
    return s.cash >= fee ? { ok: true } : { ok: false, why: `Needs ${money(fee)}` };
  }
  const from = c.from as RivalId;
  switch (choice) {
    case 'ransom':
      if (!s.rivals[from]?.alive) return { ok: false, why: `${FACTIONS[from].name} are finished` };
      return canSpend(s, from, 'guard', fee) ? { ok: true } : { ok: false, why: `${FACTIONS[from].name} can't pay` };
    case 'release': return { ok: true };
    case 'recruit':
      if (g.trait === 'Loyal') return { ok: false, why: "Loyal: won't switch sides" };
      if (s.rank < HIRE_RANK) return { ok: false, why: `Needs Rank ${HIRE_RANK}, ${RANKS[HIRE_RANK - 1].title}` };
      return s.guards.length < rosterCap(s) ? { ok: true } : { ok: false, why: 'No bed free' };
    default: return { ok: false, why: "They're yours" };
  }
}

const drop = (s: GameState, c: Captive) => {
  s.captives = (s.captives ?? []).filter((x) => x !== c);
  if (!s.captives.length) delete s.captives;
};

/** Settle a captive: their side's ransom, letting them go (+0.05 star), recruiting them, or paying for your own. */
export function settleCaptive(s: GameState, id: string, choice: CaptiveChoice): boolean {
  if (!canSettle(s, id, choice).ok) return false;
  const c = s.captives!.find((x) => x.id === id)!;
  const g = captiveGuard(s, c)!;
  const fee = ransomOf(s, c);
  const first = g.name.split(' ')[0];
  if (choice === 'pay') {
    const by = c.by as RivalId;
    s.cash = round2(s.cash - fee);
    s.rivals[by].cash = round2(s.rivals[by].cash + fee);
    g.outUntil = c.back ?? 0;
    s.news.push(`${first} is home: ${money(fee)} to ${FACTIONS[by].name}.`);
  } else if (choice === 'ransom') {
    const from = c.from as RivalId;
    spend(s, from, 'guard', fee);
    s.cash = round2(s.cash + fee);
    s.news.push(`${FACTIONS[from].name} pay ${money(fee)} to get ${first} back.`);
  } else if (choice === 'release') {
    s.reputation = Math.min(5, Math.max(1, round2(s.reputation + NABBED.release)));
    s.today.reputationAfter = s.reputation;
    s.news.push(`You let ${first} go. Folks like a good sport.`);
  } else {
    g.trait = 'Former Rival';
    g.oldFaction = c.from as RivalId;
    s.guards.push(g);
    s.news.push(`${g.name} (Former Rival) joins the crew.`);
  }
  drop(s, c);
  return true;
}

/**
 * Dawn: a rival who's waited its days for your ransom gives up. A guard who isn't Loyal goes over to it (a henchman
 * more at its HQ); a Loyal one walks home. A guard held by a rival that's finished walks home too, and one you let go
 * of meanwhile is off the list. Henchmen you hold wait for your choice.
 */
export function captivesAtDawn(s: GameState): void {
  for (const c of [...(s.captives ?? [])]) {
    if (c.by === 'player') continue;
    const by = c.by as RivalId;
    const g = s.guards.find((x) => x.id === c.id);
    if (!g) { drop(s, c); continue; }
    const finished = !s.rivals[by]?.alive;
    if (!finished && s.day < (c.until ?? 0)) continue;
    drop(s, c);
    if (finished || g.trait === 'Loyal') {
      g.outUntil = c.back ?? 0;
      s.news.push(finished ? `${g.name} walks home: ${FACTIONS[by].name} are finished.` : `${g.name} won't switch sides, and walks home.`);
      continue;
    }
    s.guards = s.guards.filter((x) => x !== g);
    const hq = hqOf(s, by);
    if (hq) backOnGuard(s, by, hq, 1);
    s.news.push(`Nobody paid: ${g.name} goes over to ${FACTIONS[by].name}.`);
  }
}

/**
 * Saves: a captives list that isn't one goes, and a Former Rival from before the Nabbed (the Hiring Hall could roll
 * one) gets an old faction, picked from their id. Idempotent; runs on every load.
 */
export function migrateCaptives(s: GameState): void {
  if (s.captives !== undefined && !Array.isArray(s.captives)) delete s.captives;
  for (const g of [...(s.guards ?? []), ...(s.recruits ?? [])]) {
    if (g.trait !== 'Former Rival' || g.oldFaction) continue;
    let h = 0;
    for (const ch of g.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    g.oldFaction = RIVALS[h % RIVALS.length];
  }
}
