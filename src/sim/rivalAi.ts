// Rival AI (spec: Rivals, How rivals think). Every dawn each rival banks its
// takings and splits them into Grow, Guard and Strike buckets that roll over:
// Grow buys land and stand upgrades, Guard buys defenses and crew, Strike pays
// for raids. Pure functions over GameState, like the rest of the sim; every
// random draw goes through a seeded rng that is written back to s.seed.
import { FACTIONS, GUARD_WAGE, HENCHMEN, PERIMETERS, STAND_LEVELS, type RivalId } from './balance.ts';
import { PLOT_BY_ID, PLOTS } from './map.ts';
import { nextRandom, type Rng } from './rng.ts';
import type { GameState } from './economy.ts';
import { hasFoothold, newStand, ownedPlots, rivalPrice } from './economy.ts';
import { inTruce, RAID_WAGE_NIGHTS, RIVAL_HIRE_FEE, RIVAL_LAND_CHANCE, RIVAL_RESERVE_DAYS, RIVAL_UPGRADE_DAYS } from './rivals.ts';
import { NO_DEFENSE, raidPartyFor, threatLevel, type Raid } from './crew.ts';

export type Bucket = 'grow' | 'guard' | 'strike';
/** Money set aside from a rival's takings, by what it buys. Unspent buckets roll over. */
export interface Budget { grow: number; guard: number; strike: number }

const RIVALS = Object.keys(FACTIONS) as RivalId[];
const BUCKETS: Bucket[] = ['grow', 'guard', 'strike'];
const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------- the dawn budget ----------

/** A rival's buckets (empty for a save from before the budget, until migrateRivals fills them). */
export function budgetOf(s: GameState, id: RivalId): Budget {
  return (s.rivals[id].budget ??= { grow: 0, guard: 0, strike: 0 });
}

/** What the rival's plots cost to run each day: stand upkeep. */
export function runningCosts(s: GameState, id: RivalId): number {
  let total = 0;
  for (const p of PLOTS) {
    const ps = s.plots[p.id];
    if (ps.owner === id && ps.stand) total += STAND_LEVELS[ps.stand.level - 1].upkeep;
  }
  return total;
}

/** Cash a rival keeps out of all three buckets, so its spending never puts it in the red. */
export const reserveOf = (s: GameState, id: RivalId) => RIVAL_RESERVE_DAYS * runningCosts(s, id);

/** Keep the buckets inside what the rival can spend (cash above its reserve). `topUp` also hands out cash nobody has earmarked. */
export function fitBudget(s: GameState, id: RivalId, topUp = false): void {
  const b = budgetOf(s, id);
  for (const k of BUCKETS) b[k] = Math.max(0, b[k]);
  const room = Math.max(0, s.rivals[id].cash - reserveOf(s, id));
  const sum = b.grow + b.guard + b.strike;
  if (sum > room || (topUp && sum < room)) {
    for (const k of BUCKETS) b[k] = round2(sum > 0 ? b[k] * (room / sum) : room * FACTIONS[id][k]);
  }
}

/** A new rival's books: its whole starting cash, split by personality. */
export function openBooks(s: GameState, id: RivalId): void {
  const r = s.rivals[id];
  const f = FACTIONS[id];
  r.budget = { grow: round2(r.cash * f.grow), guard: round2(r.cash * f.guard), strike: round2(r.cash * f.strike) };
  r.cashSeen = r.cash;
  fitBudget(s, id);
}

/** Dawn: everything that moved the rival's cash since the last dawn, other than bucket spending (trade, upkeep, loot, rebuilds, sales), goes into the buckets by the split. */
export function bankTakings(s: GameState, id: RivalId): number {
  const r = s.rivals[id];
  const takings = round2(r.cash - (r.cashSeen ?? r.cash));
  const b = budgetOf(s, id);
  for (const k of BUCKETS) b[k] = round2(b[k] + takings * FACTIONS[id][k]);
  fitBudget(s, id, true);
  r.takings = takings;
  r.cashSeen = r.cash;
  return takings;
}

export function canSpend(s: GameState, id: RivalId, bucket: Bucket, amount: number): boolean {
  return amount >= 0 && budgetOf(s, id)[bucket] >= amount && s.rivals[id].cash >= amount;
}

/** Pay from one bucket (it never counts against tomorrow's takings). */
export function spend(s: GameState, id: RivalId, bucket: Bucket, amount: number): void {
  const r = s.rivals[id];
  const b = budgetOf(s, id);
  r.cash = round2(r.cash - amount);
  b[bucket] = round2(Math.max(0, b[bucket] - amount));
  if (r.cashSeen !== undefined) r.cashSeen = round2(r.cashSeen - amount);
}

/** Saves from before the rival AI: open the books from the cash they hold now. Idempotent; runs on every load. */
export function migrateRivals(s: GameState): void {
  for (const id of RIVALS) {
    const r = s.rivals[id];
    if (!r) continue;
    if (!r.budget) { r.budget = { grow: 0, guard: 0, strike: 0 }; fitBudget(s, id, true); }
    r.cashSeen ??= r.cash;
    r.upgradesDue ??= [];
  }
}

// ---------- Grow: stand upgrades and land ----------

/** Every 30 days each stand is owed a level (up to the faction's cap). Grow pays the build cost, cheapest first; an upgrade it can't afford waits. */
export function growUpgrades(s: GameState, id: RivalId): void {
  const r = s.rivals[id];
  const f = FACTIONS[id];
  const due = (r.upgradesDue ??= []);
  if (s.day > 1 && (s.day - 1) % RIVAL_UPGRADE_DAYS === 0) {
    for (const p of ownedPlots(s, id)) {
      const st = s.plots[p.id].stand;
      if (st && st.level + due.filter((x) => x === p.id).length < f.maxLevel) due.push(p.id);
    }
  }
  const valid = (plotId: string) => {
    const ps = s.plots[plotId];
    return ps.owner === id && !!ps.stand && ps.stand.level < f.maxLevel;
  };
  r.upgradesDue = due.filter(valid);
  const cost = (plotId: string) => STAND_LEVELS[s.plots[plotId].stand!.level].cost;
  for (const plotId of [...r.upgradesDue].sort((a, b) => cost(a) - cost(b) || a.localeCompare(b))) {
    const ps = s.plots[plotId];
    if (!valid(plotId) || ps.stand!.wrecked) continue; // a wrecked stand waits for its rebuild
    const c = cost(plotId);
    if (!canSpend(s, id, 'grow', c)) break;
    spend(s, id, 'grow', c);
    const st = ps.stand!;
    st.level += 1;
    st.price = rivalPrice(id, st.level, PLOT_BY_ID[plotId]);
    ps.invested += c;
    r.upgradesDue.splice(r.upgradesDue.indexOf(plotId), 1);
  }
}

/** Some dawns a rival with the Grow money buys the busiest open street or prime plot near its turf and opens a stand. Maple Row is left to the player; First Dibs is respected. */
export function growLand(s: GameState, id: RivalId, rng: Rng): void {
  if (s.day <= 3 || nextRandom(rng) >= RIVAL_LAND_CHANCE) return;
  const f = FACTIONS[id];
  const open = (plotId: string) => {
    const ps = s.plots[plotId];
    return !ps.owner && !(ps.dibs && ps.dibs.who !== id && ps.dibs.until >= s.day);
  };
  const targets = PLOTS.filter((p) => open(p.id) && (p.type === 'street' || p.type === 'prime')
    && (p.district === f.home || hasFoothold(s, id, p.district)) && p.district !== 'maple');
  const p = targets.sort((a, b) => b.baseTraffic - a.baseTraffic)[0];
  if (!p) return;
  const cost = s.plots[p.id].landValue + STAND_LEVELS[0].cost;
  if (!canSpend(s, id, 'grow', cost)) return;
  spend(s, id, 'grow', cost);
  s.plots[p.id] = { owner: id, stand: newStand(1, rivalPrice(id, 1, p)), invested: STAND_LEVELS[0].cost, landValue: s.plots[p.id].landValue, defense: NO_DEFENSE() };
  if (p.district === 'oldtown' || hasFoothold(s, 'player', p.district)) s.news.push(`${f.name} opens a new stand at ${p.name}`);
}

/** One rival's dawn (rivalsAtDawn): bank the takings, then spend Grow. Guard is spent in crewAtDawn, Strike when raids are planned. */
export function rivalDawn(s: GameState, id: RivalId, rng: Rng): void {
  const r = s.rivals[id];
  bankTakings(s, id);
  r.grudge = Math.max(0, r.grudge - 1);
  growUpgrades(s, id);
  growLand(s, id, rng);
  r.attention = threatLevel(s) + (r.grudge > 30 ? 1 : 0);
}

// ---------- Guard: defenses and crew ----------

/** Guard spending at dawn (crewAtDawn): fences and henchmen on the three best stands, paid from the Guard bucket. */
export function rivalGuardSpend(s: GameState, id: RivalId, rng: Rng): void {
  void rng;
  if (!s.rivals[id].alive) return;
  fitBudget(s, id);
  const plots = ownedPlots(s, id).filter((p) => s.plots[p.id].stand).sort((a, b) => s.plots[b.id].invested - s.plots[a.id].invested);
  for (const p of plots.slice(0, 3)) {
    const ps = s.plots[p.id];
    const next = PERIMETERS[ps.defense.tier];
    if (next && next.tier <= Math.ceil(ps.stand!.level / 1.5) + 1 && canSpend(s, id, 'guard', next.cost)) {
      spend(s, id, 'guard', next.cost);
      ps.defense = { ...ps.defense, tier: next.tier, fenceHp: next.hp };
    } else if ((ps.garrison ?? 0) < ps.stand!.level + 1 && canSpend(s, id, 'guard', RIVAL_HIRE_FEE)) {
      spend(s, id, 'guard', RIVAL_HIRE_FEE);
      ps.garrison = (ps.garrison ?? 0) + 1;
    } else if (ps.defense.tier) {
      ps.defense.fenceHp = PERIMETERS[ps.defense.tier - 1].hp;
    }
  }
}

// ---------- Strike: who raids, and what it costs ----------

/** A raid costs the rival a night's wages for each henchman it sends, at the strength it sends them. */
export function raidCost(s: GameState, id: RivalId, size: number, tier = threatLevel(s)): number {
  void s; void id;
  return Math.round(size * GUARD_WAGE[HENCHMEN[tier - 1].level - 1] * RAID_WAGE_NIGHTS);
}

/** How keen a boss is to raid the player tonight: 0 when they can't (out, backing off after a beaten raid, or in a Truce). */
export function raidWeight(s: GameState, id: RivalId): number {
  const r = s.rivals[id];
  if (!r.alive || r.respectUntil > s.day + 1 || inTruce(s, id)) return 0;
  return Math.max(0.1, r.attention);
}

/** The boss who sends tonight's raid on the player: the keenest one whose Strike can pay for it. A broke boss is skipped and the next one goes. */
export function pickRaider(s: GameState, rng: Rng, size: number): RivalId | null {
  let best: RivalId | null = null;
  let top = -Infinity;
  for (const id of RIVALS) {
    const keen = raidWeight(s, id) + nextRandom(rng); // near-ties go either way
    if (raidWeight(s, id) <= 0 || !canSpend(s, id, 'strike', raidCost(s, id, size))) continue;
    if (keen > top) { top = keen; best = id; }
  }
  return best;
}

/**
 * planNight's last line: settle tonight's rival raids. The raid on the player goes to the keenest boss who can
 * pay for it, and every rival raid is paid from its Strike bucket; one nobody can pay for is called off. The
 * tutorial raid is on the house. Returns any extra raids to add (none yet).
 */
export function signatureRaids(s: GameState): Raid[] {
  const rng = { seed: s.seed };
  const threat = threatLevel(s);
  const tutorial = !s.battles.some((b) => b.defender === 'player');
  const kept: Raid[] = [];
  for (const raid of s.raids) {
    const attacker = raid.attacker as RivalId;
    if (raid.attacker === 'player' || raid.delivery || !raid.party) { kept.push(raid); continue; }
    if (s.plots[raid.target].owner === 'player') {
      if (tutorial) { kept.push(raid); continue; }
      const size = raid.party.length;
      const raider = pickRaider(s, rng, size);
      if (!raider) continue; // every boss is broke tonight
      if (raider !== attacker) {
        s.seed = rng.seed;
        raid.party = raidPartyFor(s, raider).slice(0, size);
        rng.seed = s.seed;
        raid.attacker = raider;
      }
      spend(s, raider, 'strike', raidCost(s, raider, raid.party.length, threat));
      kept.push(raid);
    } else {
      const cost = raidCost(s, attacker, raid.party.length, Math.min(3, threat + 1));
      if (!s.rivals[attacker]?.alive || !canSpend(s, attacker, 'strike', cost)) continue;
      spend(s, attacker, 'strike', cost);
      kept.push(raid);
    }
  }
  s.raids.splice(0, s.raids.length, ...kept); // in place: planNight pushes the extras onto this same list
  s.seed = rng.seed;
  return [];
}
