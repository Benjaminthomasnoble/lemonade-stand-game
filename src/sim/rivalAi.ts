// Rival AI (spec: Rivals, How rivals think). Every dawn each rival banks its
// takings and splits them into Grow, Guard and Strike buckets that roll over:
// Grow buys land and stand upgrades, Guard buys defenses and crew, Strike pays
// for raids. Each rival also keeps a Grudge toward every other faction.
// Pure functions over GameState, like the rest of the sim; every random draw
// goes through a seeded rng that is written back to s.seed.
import {
  BOARDWALK_SEASON, BRAND_TIERS, CUPS_PER_PITCHER, FACTIONS, GEAR, GUARD_BASE, GUARD_WAGE, HENCHMEN, PERIMETERS, RAID_PARTY, RIVAL_RAID_AT, SEASON_DEMAND,
  SEASON_WEATHER, SEASONS, STAND_LEVELS, WEAPONS, WEATHER, type RivalId, type Season, type WeaponId, type WeatherKind,
} from './balance.ts';
import { BORDERS, PLOT_BY_ID, PLOTS, type FactionId, type Plot } from './map.ts';
import { nextRandom, type Rng } from './rng.ts';
import type { GameState, PlotState, Stand } from './economy.ts';
import { hasFoothold, newStand, ownedPlots, pitcherNeeds, rivalPrice, seasonOf } from './economy.ts';
import {
  ATTENTION, BLENDER_RUSH, DIG_IN, GRUDGE, inTruce, NIGHT_SHIFT, OLD_MONEY, RAID_WAGE_NIGHTS, RIVAL_BRAND, RIVAL_HIRE_FEE, RIVAL_LAND_CHANCE,
  RIVAL_RESERVE_DAYS, RIVAL_TRADE, RIVAL_UPGRADE_DAYS,
} from './rivals.ts';
import type { Fighter } from './combat.ts';
import {
  fenceRepairCost, hasBuilding, NO_DEFENSE, raidPartyFor, rivalDefenseSpend, rivalFence, rivalKit, threatLevel, type GuardPurse, type Raid,
} from './crew.ts';
import { hhmm, raidStart, travelMinutes } from './night.ts';
import { restoreHp } from './damage.ts';
import { CALL_PRIORITY, phoneCall, raidCall } from './phone.ts';
import { landFrozen } from './schemes.ts';
import { actOf } from './modes.ts';

export type Bucket = 'grow' | 'guard' | 'strike';
/** Money set aside from a rival's takings, by what it buys. Unspent buckets roll over. */
export interface Budget { grow: number; guard: number; strike: number }
/**
 * A rival's trade calibration: its starting cash, the calibration days so far, its opening stands' margin on an
 * average day of the year, the upkeep and wages over those days, the scale on its stands' margin, yesterday's trade
 * income after upkeep and wages, and each opening stand's first week (by plot id).
 */
export interface TradeBooks {
  base: number; days: number; margin: number; upkeep: number; wages?: number; scale: number; last: number;
  opening?: Record<string, OpeningBooks>;
}

const RIVALS = Object.keys(FACTIONS) as RivalId[];
const BUCKETS: Bucket[] = ['grow', 'guard', 'strike'];
const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------- the dawn budget ----------

/** A rival's buckets (empty for a save from before the budget, until migrateRivals fills them). */
export function budgetOf(s: GameState, id: RivalId): Budget {
  return (s.rivals[id].budget ??= { grow: 0, guard: 0, strike: 0 });
}

/** What the rival pays to run each day: its stands' upkeep (charged at closing) and its henchmen's wages (paid at dawn). */
export function runningCosts(s: GameState, id: RivalId): number {
  let total = 0;
  for (const p of PLOTS) {
    const ps = s.plots[p.id];
    if (ps.owner === id && ps.stand) total += STAND_LEVELS[ps.stand.level - 1].upkeep;
  }
  return total + wageBill(s, id);
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

/** A new rival's books: its whole starting cash, split by personality (the first dawn sets the reserve aside). */
export function openBooks(s: GameState, id: RivalId): void {
  const r = s.rivals[id];
  const f = FACTIONS[id];
  r.budget = { grow: round2(r.cash * f.grow), guard: round2(r.cash * f.guard), strike: round2(r.cash * f.strike) };
  r.cashSeen = r.cash;
  r.held = ownedPlots(s, id).map((p) => p.id);
  r.trade = { base: r.cash, days: 0, margin: 0, upkeep: 0, wages: 0, scale: 1, last: 0 };
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

/**
 * Strike takes on a cost that already came off the rival's cash and so off its takings (a price war's lost margin):
 * Grow and Guard get back their share of it. False, and nothing moves, when Strike can't cover it.
 */
export function chargeStrike(s: GameState, id: RivalId, amount: number): boolean {
  if (amount <= 0) return true;
  const b = budgetOf(s, id), f = FACTIONS[id];
  const back = round2(amount * (f.grow + f.guard));
  if (b.strike < back) return false;
  b.strike = round2(b.strike - back);
  b.grow = round2(b.grow + amount * f.grow);
  b.guard = round2(b.guard + amount * f.guard);
  return true;
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
    r.grudges ??= {};
    r.held ??= ownedPlots(s, id).map((p) => p.id);
    r.trade ??= { base: Math.max(0, r.cash), days: 0, margin: 0, upkeep: 0, wages: 0, scale: 1, last: 0 };
    r.trade.wages ??= 0;
  }
  s.schemes ??= [];
}

// ---------- trade: about 1% of cash a day ----------

/** How the weather moves a stand's trade: more people pass by, and more of them stop, when it's hot. */
const weatherPull = (w: WeatherKind) => WEATHER[w].traffic * WEATHER[w].thirst;
/** How the seasons move a plot's trade (the Boardwalk swings harder). */
const seasonTable = (plotId: string) => (PLOT_BY_ID[plotId]?.district === 'boardwalk' ? BOARDWALK_SEASON : SEASON_DEMAND);

/**
 * A stand's average cups a day over a year: `demand` cups for each unit of season-and-weather pull, through each
 * season's usual weather, never more than it stocks (`cap`).
 */
export function yearOfCups(table: Record<Season, number>, demand: number, cap: number): number {
  let sum = 0;
  for (const k of SEASONS) {
    for (const [w, p] of Object.entries(SEASON_WEATHER[k]) as [WeatherKind, number][]) sum += p * Math.min(cap, demand * table[k] * weatherPull(w));
  }
  return sum / SEASONS.length;
}

/**
 * One rival stand's trade yesterday: what its customers paid less what the cups cost, the cups it sold and the ones
 * it would have sold with stock left (sold plus those turned away by a sell-out), its stock, and the day's pull.
 */
export interface StandTrade { id: string; margin: number; cups: number; wanted: number; cap: number; level: number; pull: number }

/**
 * An opening stand's first week, for the trade scale: its level and stock, its demand per unit of pull summed over
 * the days it traded, and the margin and cups it sold.
 */
export interface OpeningBooks { level: number; cap: number; demand: number; days: number; margin: number; cups: number }

/** An opening stand's average demand per unit of season-and-weather pull. */
const demandOf = (o: OpeningBooks) => (o.days > 0 ? o.demand / o.days : 0);
/** An opening stand's margin on an average day of the year, at the level it opened with. */
export const openingYear = (plotId: string, o: OpeningBooks) => (o.cups > 0 ? (o.margin / o.cups) * yearOfCups(seasonTable(plotId), demandOf(o), o.cap) : 0);

/** Yesterday's trade at a rival's stands (s.weather is still yesterday's at dawn), all stands' margin together, and their upkeep. */
export function standTrade(s: GameState, id: RivalId): { margin: number; upkeep: number; stands: StandTrade[] } {
  const season = seasonOf(s.day - 1);
  const stands: StandTrade[] = [];
  let upkeep = 0;
  for (const p of ownedPlots(s, id)) {
    const st = s.plots[p.id].stand;
    if (!st) continue;
    stands.push({
      id: p.id, margin: round2(st.day.revenue - st.day.cupCosts), cups: st.day.customers, wanted: st.day.customers + st.day.walkedPast.soldOut,
      cap: stockCups(st), level: st.level, pull: seasonTable(p.id)[season] * weatherPull(s.weather.kind),
    });
    upkeep += STAND_LEVELS[st.level - 1].upkeep;
  }
  return { margin: round2(stands.reduce((a, x) => a + x.margin, 0)), upkeep, stands };
}

/** A calibration day: note each stand's demand and margin, and return the opening stands' margin on an average day of the year. */
function noteOpeningDay(t: TradeBooks, stands: StandTrade[]): number {
  const opening = (t.opening ??= {});
  for (const x of stands) {
    const o = (opening[x.id] ??= { level: x.level, cap: x.cap, demand: 0, days: 0, margin: 0, cups: 0 });
    o.level = x.level;
    o.cap = x.cap;
    if (x.cups <= 0 || !(x.pull > 0)) continue;
    o.demand = round2(o.demand + x.wanted / x.pull);
    o.days++;
    o.margin = round2(o.margin + x.margin);
    o.cups += x.cups;
  }
  return round2(Object.entries(opening).reduce((a, [plotId, o]) => a + openingYear(plotId, o), 0));
}

/**
 * Dawn: a rival's trade is its stands' margin times its trade scale, so its trade nets about 1% of its cash a day.
 * The scale is set over its first week: enough for its opening stands to net 1% of its starting cash on an average
 * day of the year (their demand through the seasons and the weather, capped by their stock) after their upkeep and
 * its henchmen's wages. A scale over 1 (the bigger trade an old-money family's stands front) covers only what each
 * opening stand sells at the level it opened with: a stand it adds later, or the extra an upgrade brings, earns the
 * plain margin. A smashed stand earns nothing and a bigger one earns more.
 * Returns yesterday's trade income after upkeep and wages.
 */
export function settleTrade(s: GameState, id: RivalId): number {
  const r = s.rivals[id];
  const trade = standTrade(s, id);
  const wages = wageBill(s, id);
  const t = (r.trade ??= { base: Math.max(0, r.cash), days: 0, margin: 0, upkeep: 0, wages: 0, scale: 1, last: 0 });
  if (t.days < RIVAL_TRADE.days && trade.margin > 0) {
    t.days++;
    t.upkeep += trade.upkeep;
    t.wages = (t.wages ?? 0) + wages;
    t.margin = noteOpeningDay(t, trade.stands);
    const want = RIVAL_TRADE.share * t.base + (t.upkeep + t.wages) / t.days;
    if (t.margin > 0) t.scale = Math.round(Math.min(RIVAL_TRADE.ceiling, Math.max(RIVAL_TRADE.floor, want / t.margin)) * 1e4) / 1e4;
  }
  let kept = trade.margin * Math.min(1, t.scale);
  if (t.scale > 1) {
    for (const x of trade.stands) {
      const o = t.opening?.[x.id];
      if (!o || x.margin <= 0) continue;
      // An upgraded opening stand keeps the bonus only on what it would sell at its opening level, in this season and weather.
      const first = x.level > o.level && o.cups > 0 ? (o.margin / o.cups) * Math.min(o.cap, demandOf(o) * x.pull) : x.margin;
      kept += (t.scale - 1) * Math.min(x.margin, first);
    }
  }
  kept = round2(kept);
  r.cash = round2(r.cash + kept - trade.margin); // the stands already banked the plain margin as they poured
  t.last = round2(kept - trade.upkeep - wages);
  return t.last;
}

/** The share of a stand's margin its rival keeps as trade: its trade scale, over 1 only on an opening stand at its opening level. */
export function keptShare(s: GameState, id: RivalId, plotId: string): number {
  const t = s.rivals[id].trade;
  if (!t) return 1;
  if (t.scale <= 1) return t.scale;
  const o = t.opening?.[plotId], st = s.plots[plotId]?.stand;
  return o && st && st.level <= o.level ? t.scale : 1;
}

// ---------- Grudge toward every faction ----------

/** How angry rival `id` is with faction `at` (0..100). The one toward the player is RivalState.grudge. */
export function grudgeToward(s: GameState, id: RivalId, at: FactionId): number {
  const r = s.rivals[id];
  return at === 'player' ? r.grudge : (r.grudges?.[at as RivalId] ?? 0);
}

/** Seam for taunts and rival-versus-rival raids: rival `from`'s Grudge toward faction `to`. */
export const grudge = (s: GameState, from: RivalId, to: FactionId) => grudgeToward(s, from, to);

function setGrudge(s: GameState, id: RivalId, at: FactionId, n: number): void {
  const r = s.rivals[id];
  const g = Math.round(Math.min(100, Math.max(0, n)) * 100) / 100;
  if (at === 'player') r.grudge = g;
  else (r.grudges ??= {})[at as RivalId] = g;
}

/** Rival `id` holds `n` more Grudge toward `at`. A new feud between two rivals makes the Bugle (once, until it cools well off). */
export function addGrudge(s: GameState, id: RivalId, at: FactionId, n: number): void {
  if (at === id || !s.rivals[id]?.alive) return;
  const was = grudgeToward(s, id, at);
  setGrudge(s, id, at, was + n);
  const cooledOff = (s.rivals[id].grudgeSeen?.[at] ?? 0) < GRUDGE.feud - 10;
  if (at !== 'player' && cooledOff && was < GRUDGE.feud && grudgeToward(s, id, at) >= GRUDGE.feud) {
    s.news.push(`Bugle: ${FACTIONS[id].name} declare a feud on ${FACTIONS[at as RivalId].name}`);
  }
}

/** Seam for auctions: whoever outbids a rival earns its Grudge. */
export const outbidBy = (s: GameState, loser: RivalId, winner: FactionId) => addGrudge(s, loser, winner, GRUDGE.outbid);

/** Dawn: stands smashed last night by another rival (your smashes count in fightRaid). */
function noteSmashes(s: GameState, id: RivalId): void {
  for (const p of ownedPlots(s, id)) {
    const ps = s.plots[p.id];
    if (ps.wreckedDay === s.day - 1 && ps.smashedBy && ps.smashedBy !== 'player') addGrudge(s, id, ps.smashedBy, GRUDGE.smashed);
  }
}

/** Dawn: land they held yesterday that someone else holds now (directly, or bought after it went For Sale). A Plot Buyout is a sale, not a taking. */
function noteLandTaken(s: GameState, id: RivalId): void {
  const r = s.rivals[id];
  const now = ownedPlots(s, id).map((p) => p.id);
  const lost = [...(r.lost ?? [])];
  for (const plotId of r.held ?? now) if (!now.includes(plotId) && !lost.includes(plotId)) lost.push(plotId);
  const forSale: string[] = [];
  for (const plotId of lost) {
    const owner = s.plots[plotId].owner;
    if (owner === id) continue;
    if (owner) addGrudge(s, id, owner, GRUDGE.land);
    else forSale.push(plotId);
  }
  r.lost = forSale.slice(-8);
  r.held = now;
}

/** Dawn: a Grudge that didn't rise since yesterday cools a little. */
function coolGrudges(s: GameState, id: RivalId): void {
  const seen = (s.rivals[id].grudgeSeen ??= {});
  for (const at of ['player', ...RIVALS.filter((x) => x !== id)] as FactionId[]) {
    const g = grudgeToward(s, id, at);
    if (g <= (seen[at] ?? 0)) setGrudge(s, id, at, g - GRUDGE.cool);
    seen[at] = grudgeToward(s, id, at);
  }
}

/**
 * Seam for planNight: how tempting a plot is for `attacker` to raid, its worth over its defense (fence, gadgets, and
 * your posted guards or a rival's garrison). 0 when it can't be raided: its own, empty, or another rival's HQ.
 */
export function targetScore(s: GameState, attacker: RivalId, plotId: string): number {
  const ps = s.plots[plotId];
  if (!ps?.owner || ps.owner === attacker || !hasBuilding(ps)) return 0;
  if (ps.owner !== 'player' && PLOT_BY_ID[plotId].type === 'hq') return 0;
  return worthOverDefense(s, plotId);
}

/** A plot's land and buildings over its defense: fence, gadgets, and your posted guards or a rival's garrison. */
function worthOverDefense(s: GameState, plotId: string): number {
  const ps = s.plots[plotId];
  const guards = ps.owner === 'player' ? s.guards.filter((g) => g.post === plotId).length : ps.garrison ?? 0;
  return (ps.invested + ps.landValue) / (1 + ps.defense.tier * 2 + guards * 3 + ps.defense.gadgets.length);
}

/**
 * For your raids, on the Rivals Corkboard: a rival's weakest valuable building by the same worth-over-defense rule
 * (never its HQ), ties to the lower plot id.
 */
export function softSpot(s: GameState, victim: RivalId): Plot | null {
  const score = (p: Plot) => worthOverDefense(s, p.id);
  return PLOTS.filter((p) => s.plots[p.id].owner === victim && p.type !== 'hq' && hasBuilding(s.plots[p.id]))
    .sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id))[0] ?? null;
}

/** Is a plot near a faction's turf: in a district where it holds land (or its home), or in one bordering those? */
const nearTurf = (turf: Set<string>, p: Plot) => turf.has(p.district) || BORDERS[p.district].some((d) => turf.has(d));
/** Highest targetScore first, ties to the lower plot id: one fixed order, so the Corkboard and the raids agree. */
const byScore = (s: GameState, attacker: RivalId) => (a: Plot, b: Plot) => targetScore(s, attacker, b.id) - targetScore(s, attacker, a.id) || a.id.localeCompare(b.id);

/**
 * The likeliest target of `attacker`'s next raid on `victim` (spec: "the weakest valuable stand near their turf,
 * meaning the highest value divided by defense"): the victim's building with the best targetScore in a district where
 * the attacker holds land or one bordering those, or the victim's best anywhere when nothing of theirs is near.
 * Deterministic, so the Rivals Corkboard pins exactly what the raid goes for.
 */
export function likeliestTarget(s: GameState, attacker: RivalId, victim: FactionId = 'player'): Plot | null {
  const turf = turfOf(s, attacker);
  const theirs = PLOTS.filter((p) => s.plots[p.id].owner === victim && targetScore(s, attacker, p.id) > 0);
  const near = theirs.filter((p) => nearTurf(turf, p));
  return (near.length ? near : theirs).sort(byScore(s, attacker))[0] ?? null;
}

/** Rival-versus-rival targets: Grudge picks the faction (the one the attacker is angriest with, if any), then the weakest valuable building of theirs near the attacker's turf. */
export function rivalTarget(s: GameState, attacker: RivalId): Plot | null {
  const turf = turfOf(s, attacker);
  const near = (p: Plot) => nearTurf(turf, p);
  const anger = (p: Plot) => grudgeToward(s, attacker, s.plots[p.id].owner!);
  const targets = PLOTS.filter((p) => {
    const o = s.plots[p.id].owner;
    return !!o && o !== 'player' && o !== attacker && s.rivals[o as RivalId].alive && p.type !== 'hq' && hasBuilding(s.plots[p.id]) && near(p);
  });
  const top = Math.max(0, ...targets.map(anger));
  const pool = top > 0 ? targets.filter((p) => anger(p) === top) : targets;
  return pool.sort(byScore(s, attacker))[0] ?? null;
}

// ---------- Grow: stand upgrades and land ----------

/**
 * Every 30 days each stand is owed a level (up to the faction's cap). Grow pays the build cost, cheapest first; an upgrade it
 * can't afford waits. The small gangs stay small: on about $50 a day of Grow, Cold Brew and the Blenders save for a Level 3
 * ($3,500, your price) for about 70 days, so their stands rise slower than every 30 days and never reach Level 4.
 */
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
    st.price = rivalPrice(id, st.level, PLOT_BY_ID[plotId], s); // a price war's cut stays on
    ps.invested += c;
    restoreHp(s, plotId); // the new level comes up at full HP (damage.ts)
    r.upgradesDue.splice(r.upgradesDue.indexOf(plotId), 1);
  }
}

/** Some dawns a rival with the Grow money buys the busiest open street or prime plot near its turf and opens a stand. Maple Row is left to the player; First Dibs and auctions are respected. */
export function growLand(s: GameState, id: RivalId, rng: Rng): void {
  if (s.day <= 3 || nextRandom(rng) >= RIVAL_LAND_CHANCE) return;
  const f = FACTIONS[id];
  const open = (plotId: string) => {
    const ps = s.plots[plotId];
    return !ps.owner && !ps.auction && !ps.dibs && !landFrozen(s, plotId); // land: First Dibs, then a sealed-bid auction (auction.ts); never off the shelf meanwhile
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

/**
 * Grow buys the rival's next brand tier (RIVAL_BRAND): your price, opened by your Rank, up to the faction's cap, and
 * only while Grow holds the faction's `save` times the price. The Bugle reports it.
 */
export function growBrand(s: GameState, id: RivalId): void {
  const r = s.rivals[id];
  const next = BRAND_TIERS[r.brandTier];
  if (!next || next.tier > RIVAL_BRAND.cap[id] || next.rank > s.rank) return;
  if (!canSpend(s, id, 'grow', next.cost * RIVAL_BRAND.save[id])) return;
  spend(s, id, 'grow', next.cost);
  r.brandTier = next.tier;
  s.news.push(`Bugle: ${FACTIONS[id].name} put up ${next.name}`);
}

/** One rival's dawn (rivalsAtDawn): grudges from the night, yesterday's trade, wages, bank the takings, then spend Grow. Guard is spent in crewAtDawn, Strike when raids are planned and on schemes. */
export function rivalDawn(s: GameState, id: RivalId, rng: Rng): void {
  const r = s.rivals[id];
  noteSmashes(s, id);
  noteLandTaken(s, id);
  coolGrudges(s, id);
  settleTrade(s, id);
  payWages(s, id);
  bankTakings(s, id);
  growUpgrades(s, id);
  growLand(s, id, rng);
  growBrand(s, id);
  r.held = ownedPlots(s, id).map((p) => p.id);
  r.attention = attentionOf(s, id);
}

// ---------- same costs as yours: wages, repairs, stock ----------

/** The strength of the henchmen guarding a rival plot (the tier garrisonFighters fields there). */
export const garrisonTier = (ps: PlotState) => rivalKit(ps).level;
/** A rival henchman's daily wage: what you'd pay a guard of the same level. */
export const henchWage = (ps: PlotState) => GUARD_WAGE[HENCHMEN[garrisonTier(ps) - 1].level - 1];

/** What a rival's henchmen draw each day, all posts together. */
export function wageBill(s: GameState, id: RivalId): number {
  let total = 0;
  for (const p of ownedPlots(s, id)) total += (s.plots[p.id].garrison ?? 0) * henchWage(s.plots[p.id]);
  return total;
}

/**
 * Dawn: a rival pays its henchmen the wages you pay your guards, out of its cash like yours (a running cost, so it
 * comes off the takings), best plots first. Anyone it can't pay walks off the job. Returns how many left.
 */
export function payWages(s: GameState, id: RivalId): number {
  const r = s.rivals[id];
  const value = (plotId: string) => s.plots[plotId].invested + s.plots[plotId].landValue;
  const posts = ownedPlots(s, id).filter((p) => (s.plots[p.id].garrison ?? 0) > 0).sort((a, b) => value(b.id) - value(a.id) || a.id.localeCompare(b.id));
  let left = 0;
  for (const p of posts) {
    const ps = s.plots[p.id];
    const wage = henchWage(ps);
    let kept = 0;
    for (let i = 0; i < (ps.garrison ?? 0); i++) {
      if (r.cash >= wage) { r.cash = round2(r.cash - wage); kept++; } else left++;
    }
    ps.garrison = kept;
  }
  return left;
}

/** Cups a rival stand can sell in a day: one full stock of lemons and sugar, as its storage holds (it restocks each morning). */
export function stockCups(st: Stand): number {
  const n = pitcherNeeds(st);
  const room = STAND_LEVELS[st.level - 1].storage;
  const pitchers = Math.min(Math.floor(room.lemons / n.lemons), n.sugar > 0 ? Math.floor(room.sugar / n.sugar) : Infinity);
  return pitchers * CUPS_PER_PITCHER;
}

// ---------- Guard: defenses and crew ----------

// ---------- Dig In: Hollis's cheap, tough fences ----------

/** What a rival pays for a fence of `tier`: your price, or Dig In's share of it for Hollis. */
export const fencePrice = (id: RivalId, tier: number) => Math.ceil(PERIMETERS[tier - 1].cost * (id === 'hollis' ? DIG_IN.cost : 1));
/** A plot's fence at full HP: the tier's HP, and half again on Hollis land, where hay bales are stacked behind it. */
export function fenceFull(ps: PlotState): number {
  const per = PERIMETERS[ps.defense.tier - 1];
  return per ? Math.round(per.hp * (ps.owner === 'hollis' ? DIG_IN.hp : 1)) : 0;
}
/** Hay bales behind the fence (Dig In): a Hollis fence still standing. The art thread stacks bales where this is true. */
export function hayBales(s: GameState, plotId: string): boolean {
  const ps = s.plots[plotId];
  return ps?.owner === 'hollis' && ps.defense.tier > 0 && ps.defense.fenceHp > 0;
}
/** Patching a chopped rival fence back to full: your repair price (crew's flat fee a raid), at Dig In's share and up to the
 * bales for Hollis. */
function patchCost(id: RivalId, ps: PlotState): number {
  return id === 'hollis' ? Math.ceil(fenceRepairCost(ps, fenceFull(ps)) * DIG_IN.cost) : fenceRepairCost(ps);
}

/**
 * Guard spending at dawn (crewAtDawn), all from the Guard bucket. What it buys is crew's call (crew.ts
 * rivalDefenseSpend): first the repairs (the same flat repair price as yours), then each of the three best plots' next
 * step toward its kit. A henchman is hired only while Guard's share of what the rival's trade nets each day covers his
 * wage, which then comes out of its cash every dawn. Hollis digs in: its fences cost less and carry hay bales, and it
 * fences every Field it holds too (it holds the Field land).
 */
export function rivalGuardSpend(s: GameState, id: RivalId, rng: Rng): void {
  void rng;
  const r = s.rivals[id];
  if (!r.alive) return;
  fitBudget(s, id);
  const affords = (wage: number) => {
    const t = r.trade;
    const extra = Math.max(0, wageBill(s, id) - (t?.days ? (t.wages ?? 0) / t.days : 0)); // wages beyond the crew it opened with
    return extra + wage <= FACTIONS[id].guard * Math.max(0, (t?.last ?? 0) + extra);
  };
  const pay = (cost: number) => {
    if (!canSpend(s, id, 'guard', cost)) return false;
    spend(s, id, 'guard', cost);
    return true;
  };
  const purse: GuardPurse = {
    pay, hire: (ps) => affords(henchWage(ps)) && pay(RIVAL_HIRE_FEE),
    fencePrice: (tier) => fencePrice(id, tier), fenceFull, patchCost: (ps) => patchCost(id, ps), // Dig In for Hollis
  };
  rivalDefenseSpend(s, id, purse);
  if (id === 'hollis') for (const p of ownedPlots(s, id).filter((q) => q.type === 'field')) rivalFence(s.plots[p.id], DIG_IN.fieldTier, purse);
}

// ---------- Night Shift: Cold Brew's quiet nights ----------

/** What Night Shift takes off your detection roll as a raid on you sets out at night (night.ts): Cold Brew's raids only. */
export function nightShiftStealth(s: GameState, r: Raid): number {
  return r.attacker === 'coldbrew' && s.phase === 'night' ? NIGHT_SHIFT.stealth : 0;
}

/**
 * Dawn: Juni phones the Corner after a Cold Brew Sabotage spoiled your stock last night (crew's raid objective; this
 * picks it up once it merges). Tilly's line after you raid her is the phone's own: src/sim/phone.ts reads her Grudge jump.
 */
export function tauntsAtDawn(s: GameState): void {
  const spoiled = s.battles.some((b) => b.day === s.day - 1 && !b.hq && b.attacker === 'coldbrew' && b.defender === 'player' && b.outcome === 'robbed' && (b as { sabotage?: boolean }).sabotage);
  if (spoiled) phoneCall(s, 'coldbrew', NIGHT_SHIFT.taunt, { mood: 'gloat', priority: CALL_PRIORITY.raid });
}

// ---------- Attention: who comes for you ----------

/** Districts a rival holds land in, plus its home. */
function turfOf(s: GameState, id: RivalId): Set<string> {
  const turf = new Set<string>(PLOTS.filter((p) => s.plots[p.id].owner === id).map((p) => p.district));
  turf.add(FACTIONS[id].home);
  return turf;
}

/** Districts where you hold land on or beside a rival's turf. */
export function sharedBorders(s: GameState, id: RivalId): number {
  const turf = turfOf(s, id);
  const mine = new Set(PLOTS.filter((p) => s.plots[p.id].owner === 'player').map((p) => p.district));
  return [...mine].filter((d) => turf.has(d) || BORDERS[d].some((e) => turf.has(e))).length;
}

/** passerby: someone walking past a rival's stand bought from you instead (Attention: the customers you take). */
export function tookCustomer(s: GameState, id: RivalId): void {
  const r = s.rivals[id];
  if (!r) return;
  if (r.taken?.day !== s.day) r.taken = { day: s.day, n: 0 };
  r.taken.n++;
}

/** The share of passers-by at a rival's stands on the last day of trade who bought from you instead (0..1). */
export function customersTaken(s: GameState, id: RivalId): number {
  const t = s.rivals[id].taken;
  if (!t || t.day < s.day - 1) return 0; // dawn reads yesterday's, the night plan today's
  let passed = 0;
  for (const p of ownedPlots(s, id)) passed += s.plots[p.id].stand?.day.passersby ?? 0;
  return passed > 0 ? Math.min(1, t.n / passed) : 0;
}

/** A boss's Attention on you (spec: How rivals think): it rises with Threat, shared borders, the customers you take and Grudge. */
export function attentionOf(s: GameState, id: RivalId): number {
  if (!s.rivals[id].alive) return 0;
  const a = ATTENTION.threat * threatLevel(s) + ATTENTION.border * sharedBorders(s, id)
    + ATTENTION.customers * customersTaken(s, id) + ATTENTION.grudge * s.rivals[id].grudge;
  return Math.round(a * 10) / 10;
}

// ---------- Strike: who raids, and what it costs ----------

/** A raid costs the rival a night's wages for each henchman it sends, at the strength it sends them (a Blender Rush comes cheap). */
export function raidCost(s: GameState, id: RivalId, size: number, tier = threatLevel(s)): number {
  void s;
  return Math.round(size * GUARD_WAGE[HENCHMEN[tier - 1].level - 1] * RAID_WAGE_NIGHTS * (id === 'blenders' ? BLENDER_RUSH.cost : 1));
}

/** How many henchmen a boss sends on a raid planned with `size`: the Blenders always come at the top of the Threat range. */
export const raidSize = (id: RivalId, size: number, tier: number) => (id === 'blenders' ? Math.max(size, RAID_PARTY[tier - 1].size[1]) : size);

/**
 * How keen a boss is to raid the player tonight: its Attention plus its Strike share (the Blenders raid most often).
 * 0 when they can't: out, backing off after a beaten raid, or in a Truce.
 */
export function raidWeight(s: GameState, id: RivalId): number {
  const r = s.rivals[id];
  if (!r.alive || r.respectUntil > s.day || inTruce(s, id)) return 0; // Respect: back on night D+R+1 (threat.ts mayRaidYou)
  return Math.max(0.1, r.attention + ATTENTION.strike * FACTIONS[id].strike);
}

/** The boss who sends tonight's raid on the player: the one with the most Attention whose Strike can pay for it. A broke boss is skipped and the next-angriest goes. */
export function pickRaider(s: GameState, rng: Rng, size: number): RivalId | null {
  const tier = threatLevel(s);
  let best: RivalId | null = null;
  let top = -Infinity;
  for (const id of RIVALS) {
    const keen = raidWeight(s, id) + nextRandom(rng) * ATTENTION.jitter; // near-ties go either way
    if (raidWeight(s, id) <= 0 || !canSpend(s, id, 'strike', raidCost(s, id, raidSize(id, size, tier), tier))) continue;
    if (keen > top) { top = keen; best = id; }
  }
  return best;
}

const FISTWARD: Record<WeaponId, WeaponId> = { hatchets: 'clubs', clubs: 'fists', fists: 'fists' };
const HATCHETWARD: Record<WeaponId, WeaponId> = { fists: 'clubs', clubs: 'hatchets', hatchets: 'hatchets' };

/** Old Money's elite Stewards: each henchman one level higher (with that level's gear) and every weapon one tier toward hatchets. */
export function eliteStewards(party: Fighter[]): Fighter[] {
  return party.map((f) => {
    const h = HENCHMEN[Math.min(HENCHMEN.length, (f.level ?? 1) + 1) - 1];
    const weapon = HATCHETWARD[f.weapon];
    const m = 1 + 0.1 * (h.level - 1);
    return { ...f, level: h.level, gear: h.gear, armor: GEAR[h.gear].armor, weapon, hp: (GUARD_BASE.hp + GEAR[h.gear].hp) * m, hit: WEAPONS[weapon].hit * m, chop: WEAPONS[weapon].chop * m };
  });
}

/**
 * Blender Rush: the Blenders' party for a raid at Threat tier `tier`, filled to the top of the tier's range with
 * Smoothie Bros like the ones planned, and every weapon one tier toward fists (their strength stays the tier's).
 */
export function blenderRush(s: GameState, party: Fighter[], tier: number): Fighter[] {
  if (!party.length) return party;
  const size = raidSize('blenders', party.length, tier);
  return Array.from({ length: size }, (_, i) => {
    const f = party[i % party.length];
    const weapon = FISTWARD[f.weapon];
    const m = f.hit / WEAPONS[f.weapon].hit; // the henchman's level bonus
    return {
      ...f, id: i < party.length ? f.id : `blenders-att-${s.nextId++}`, name: f.name.replace(/#\d+$/, `#${i + 1}`),
      weapon, hit: WEAPONS[weapon].hit * m, chop: WEAPONS[weapon].chop * m,
    };
  });
}

/**
 * planNight's last line: settle tonight's rival raids. Each boss's Attention is updated from today's trade, the
 * raid on the player goes to the keenest boss who can pay for it, and every rival raid is paid from its Strike
 * bucket; one nobody can pay for is called off. The tutorial raid is on the house. A Blenders raid is a Blender
 * Rush (a big, cheap, fist-heavy party), and Brock phones before one on you. A raid on another rival goes where
 * the attacker's Grudge points, and the target's Grudge toward the attacker rises. Returns any extra raids to add
 * (none yet).
 */
export function signatureRaids(s: GameState): Raid[] {
  const rng = { seed: s.seed };
  const threat = threatLevel(s);
  for (const id of RIVALS) s.rivals[id].attention = attentionOf(s, id);
  const kept: Raid[] = [];
  for (const raid of s.raids) {
    const attacker = raid.attacker as RivalId;
    if (raid.attacker === 'player' || raid.delivery || !raid.party) { kept.push(raid); continue; }
    if (s.plots[raid.target].owner === 'player') {
      if (raid.tutorial || raid.syndicate) { kept.push(raid); continue; } // the scripted first raid, and the Syndicate's strikes (threat.ts)
      const size = raid.party.length;
      const raider = pickRaider(s, rng, size);
      if (!raider) continue; // every boss is broke tonight
      const target = likeliestTarget(s, raider)?.id ?? raid.target; // the weakest valuable stand near their turf: the Corkboard's pin
      if (raider !== attacker) {
        s.seed = rng.seed;
        raid.party = raidPartyFor(s, raider).slice(0, size);
        rng.seed = s.seed;
        raid.attacker = raider;
      }
      if (raider !== attacker || target !== raid.target) {
        raid.target = target;
        if (raid.leave !== undefined) { // the night clock: they set out at the same minute, from their own turf
          raid.at = raid.leave + travelMinutes(s, raidStart(s, raider, raid.target), raid.target);
          raid.eta = hhmm(raid.at);
        }
      }
      if (raider === 'blenders') {
        raid.party = blenderRush(s, raid.party, threat);
        s.rivals.blenders.rush = s.day;
        raidCall(s, raid); // Brock phones before the Rush (src/sim/phone.ts rings it once the raid is spotted)
      }
      const elite = raider === 'sourwood' && actOf(s) >= OLD_MONEY.act; // Old Money: Vera sends her elite Stewards
      if (elite) raid.party = eliteStewards(raid.party);
      spend(s, raider, 'strike', raidCost(s, raider, raid.party.length, elite ? Math.min(5, threat + 1) : threat));
      kept.push(raid);
    } else {
      const tier = Math.min(3, threat + 1);
      if (attacker === 'blenders') raid.party = blenderRush(s, raid.party, tier);
      const cost = raidCost(s, attacker, raid.party.length, tier);
      if (!s.rivals[attacker]?.alive || !canSpend(s, attacker, 'strike', cost)) continue;
      const target = rivalTarget(s, attacker);
      if (!target) continue;
      spend(s, attacker, 'strike', cost);
      raid.target = target.id;
      if (raid.leave !== undefined) raid.leave = (raid.at ?? RIVAL_RAID_AT) - travelMinutes(s, raidStart(s, attacker, target.id), target.id);
      addGrudge(s, s.plots[target.id].owner as RivalId, attacker, GRUDGE.raided);
      kept.push(raid);
    }
  }
  s.raids.splice(0, s.raids.length, ...kept); // in place: planNight pushes the extras onto this same list
  s.seed = rng.seed;
  return [];
}
