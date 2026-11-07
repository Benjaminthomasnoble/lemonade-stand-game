// The demand chain (spec: Running the business, "How demand works"; Appendix A, demand constants).
//   1. Passersby = plot traffic × stand draw × marketing × season × weather foot traffic.
//   2. Stop chance = 25% × thirst × appeal, where appeal = curb appeal × recipe match × price fit × Reputation.
//   3. Cups sold = the smallest of demand, service (cups/hour × 10 selling hours) and stock.
// Pure and seeded like the rest of src/sim: no DOM, Date or Math.random. economy.ts runs the business day
// minute by minute and calls these; the forecast and the stand panel use the same rules.
import { nextRandom } from './rng.ts';
import {
  BASE_STOP_CHANCE, HOURLY_TRAFFIC, MAJORITY, MAJORITY_CURB, OPEN, PEAK_BOOST, PRICE_FIT, PRICE_TOLERANCE, RECIPES, RIVAL_SHARE_CAP,
  SEGMENTS, SELLING_HOURS, STAND_LEVELS, type RecipeId, type RivalId, type SegmentId,
} from './balance.ts';
import { DISTRICT_BY_ID, nearbyPlots, PLOT_BY_ID, type DistrictId, type Plot } from './map.ts';
import { districtControl } from './modes.ts';
import { hpCapacity } from './damage.ts';
import type { Appeal, GameState, Stand, Weather } from './economy.ts';
import { appealFor, expectedPassersby, rivalPrice } from './economy.ts';

/** Prices are in cents, and a ceiling rounds down to the cent ($1.575 is a $1.57 ceiling). */
const floorCents = (x: number) => Math.floor(x * 100 + 1e-6) / 100;
const HOURLY_SUM = HOURLY_TRAFFIC.reduce((a, b) => a + b, 0);
const FIRST_HOUR = OPEN / 60;

// ---------- pricing: one ceiling per stand ----------

/** Top-price modifiers from other sections multiply in here (Fancy Menu +20%; the Blender Bar's Frozen +20%). */
export function topPriceMods(s: GameState, plotId: string): number {
  void s; void plotId;
  return 1;
}

/** Ceiling = the level's top price × the district's price tolerance × (1 + the card's price bonus), down to the cent. */
export function ceilingFor(level: number, district: DistrictId, recipe: RecipeId, mods = 1): number {
  return floorCents(STAND_LEVELS[level - 1].topPrice * (PRICE_TOLERANCE[district] ?? 1) * (1 + RECIPES[recipe].priceBonus) * mods);
}

/** The most this stand's crowd will pay, the same for every customer. Rival stands use the same formula. */
export function priceCeiling(s: GameState, plotId: string, st: Stand = s.plots[plotId].stand!): number {
  return ceilingFor(st.level, PLOT_BY_ID[plotId].district, st.recipe, topPriceMods(s, plotId));
}

/**
 * Price fit (spec: Pricing): ×1.0 at the ceiling; each 1% under adds 1% appeal, up to +25%; each 10% over turns
 * away a quarter of buyers. Over the ceiling the thriftiest leave first: a segment's loss scales by the district's
 * tolerance ÷ its own, so in Maple Row kids (×0.8) are gone at +32% and high rollers (×2.0) hang on to +80%.
 */
export function priceFit(price: number, ceiling: number, segTolerance = 1, districtTolerance = 1): number {
  if (ceiling <= 0) return 0;
  const r = price / ceiling;
  if (r <= 1) return 1 + Math.min(PRICE_FIT.underMax, 1 - r);
  return Math.max(0, 1 - PRICE_FIT.overSlope * (districtTolerance / segTolerance) * (r - 1));
}

/** The price fit one segment gives a stand's price. */
export function segmentPriceFit(plotId: string, seg: SegmentId, price: number, ceiling: number): number {
  return priceFit(price, ceiling, SEGMENTS[seg].priceTolerance, PRICE_TOLERANCE[PLOT_BY_ID[plotId].district] ?? 1);
}

/**
 * Stop chance = 25% × thirst × appeal, capped at 95%. `wouldStop` is the chance at the ceiling, so over it the
 * gap between the two is exactly the buyers lost to price ("too pricey"); everyone else just isn't thirsty.
 */
export function stopOdds(thirst: number, appealBeforePrice: number, fit: number): { stopChance: number; wouldStop: number } {
  const wouldStop = Math.min(0.95, Math.max(0, BASE_STOP_CHANCE * thirst * appealBeforePrice * Math.max(1, fit)));
  return { wouldStop, stopChance: wouldStop * Math.min(1, fit) };
}

// ---------- curb appeal and Majority ----------

/** Majority: the player holds 51%+ of the district's purchasable plots (civic and HQ plots don't count). */
export function majorityHeld(s: GameState, d: DistrictId): boolean {
  return districtControl(s, d).share >= MAJORITY;
}

/**
 * Curb appeal is ×1.0 at every stand level (a level pays off through draw, service and top price). Majority pushes
 * it: your stands in a district you hold 51%+ of sell 10% more, and rival stands there lose 10% appeal.
 * Billboards (rival stands within 2 plots −10%) multiply in here too.
 */
export function curbAppeal(s: GameState, plotId: string): number {
  let curb = 1;
  if (majorityHeld(s, PLOT_BY_ID[plotId].district)) curb *= s.plots[plotId].owner === 'player' ? MAJORITY_CURB.player : MAJORITY_CURB.rival;
  return curb;
}

// ---------- who walks by, hour by hour ----------

const inPeak = (seg: SegmentId, hour: number) => SEGMENTS[seg].peaks.some(([a, b]) => hour >= a && hour < b);
const hourMixes = new Map<string, [SegmentId, number][]>();
/** The crowd mix in one clock hour: the district's mix, with segments in their peak hours ×1.8. Shares sum to 1. */
export function hourMix(d: DistrictId, hour: number): [SegmentId, number][] {
  const key = d + hour;
  let m = hourMixes.get(key);
  if (!m) {
    const raw = (Object.entries(DISTRICT_BY_ID[d].mix) as [SegmentId, number][]).map(([seg, x]) => [seg, x * (inPeak(seg, hour) ? PEAK_BOOST : 1)] as [SegmentId, number]);
    const total = raw.reduce((a, [, x]) => a + x, 0);
    m = raw.map(([seg, x]) => [seg, x / total]);
    hourMixes.set(key, m);
  }
  return m;
}

const dayMixes = new Map<DistrictId, [SegmentId, number][]>();
/** The whole day's mix: each hour's mix weighted by that hour's share of the day's traffic. */
export function dayMix(d: DistrictId): [SegmentId, number][] {
  let m = dayMixes.get(d);
  if (!m) {
    const acc = new Map<SegmentId, number>();
    HOURLY_TRAFFIC.forEach((w, i) => { for (const [seg, x] of hourMix(d, FIRST_HOUR + i)) acc.set(seg, (acc.get(seg) ?? 0) + (x * w) / HOURLY_SUM); });
    m = [...acc.entries()];
    dayMixes.set(d, m);
  }
  return m;
}

/** Draw one passerby's segment for a clock hour. */
export function drawSegment(rng: { seed: number }, d: DistrictId, hour: number): SegmentId {
  const mix = hourMix(d, hour);
  let r = nextRandom(rng);
  for (const [seg, x] of mix) { r -= x; if (r <= 0) return seg; }
  return mix[mix.length - 1][0];
}

// ---------- splitting customers between stands within 2 plots ----------

type Option = { id: string; a: Appeal };
const appealSum = (xs: Option[]) => xs.reduce((t, x) => t + x.a.appeal, 0);

/** The open stands within 2 plots of p, split into the home owner's and everyone else's. */
function standsNear(s: GameState, p: Plot, appealOf: (plotId: string) => Appeal): { own: Option[]; rivals: Option[] } {
  const owner = s.plots[p.id].owner;
  const own: Option[] = [], rivals: Option[] = [];
  for (const q of nearbyPlots(p)) {
    const st = s.plots[q.id].stand;
    if (!st || st.wrecked) continue;
    (s.plots[q.id].owner === owner ? own : rivals).push({ id: q.id, a: appealOf(q.id) });
  }
  return { own, rivals };
}

/** The share of a plot's passersby that rival stands within 2 plots take: their appeal share, never more than 35%. */
export function rivalShare(own: Option[], rivals: Option[]): number {
  if (!rivals.length) return 0;
  const wo = appealSum(own), wr = appealSum(rivals);
  return wo + wr > 0 ? Math.min(RIVAL_SHARE_CAP, wr / (wo + wr)) : 0;
}

/**
 * Where one passerby of plot p goes. Stands within 2 plots split passing customers by appeal, whoever owns them;
 * customers shared with the home owner's other stands stay with that owner, and rival stands take at most 35%.
 */
export function chooseStand(s: GameState, p: Plot, rng: { seed: number }, appealOf: (plotId: string) => Appeal): Option {
  const { own, rivals } = standsNear(s, p, appealOf);
  const home = own.find((x) => x.id === p.id) ?? { id: p.id, a: appealOf(p.id) };
  if (own.length + rivals.length <= 1) return home;
  const pool = rivals.length && nextRandom(rng) < rivalShare(own, rivals) ? rivals : own;
  if (pool.length === 1) return pool[0];
  const total = appealSum(pool);
  if (total <= 0) return home; // nothing here appeals: they walk on past their own stand
  let r = nextRandom(rng) * total;
  for (const x of pool) { r -= x.a.appeal; if (r <= 0) return x; }
  return pool[pool.length - 1];
}

/** The expected share of plot q's passersby that end up at the stand on plot `to` (the same rule as chooseStand). */
function shareTo(s: GameState, q: Plot, to: string, appealOf: (plotId: string) => Appeal): number {
  const { own, rivals } = standsNear(s, q, appealOf);
  if (own.length + rivals.length <= 1) return to === q.id ? 1 : 0;
  const rs = rivalShare(own, rivals);
  const toOwner = s.plots[to].owner === s.plots[q.id].owner;
  const pool = toOwner ? own : rivals;
  const mine = pool.find((x) => x.id === to);
  if (!mine) return 0;
  const k = toOwner ? 1 - rs : rs;
  if (pool.length === 1) return k;
  const total = appealSum(pool);
  return total > 0 ? (k * mine.a.appeal) / total : to === q.id ? k : 0;
}

// ---------- service and the line ----------

/**
 * Cups an hour the stand pours: a Damaged stand pours its HP share, in whole cups (damage.ts). Seam: the Express
 * Window's +30% multiplies in here when stand specializations land.
 */
export function pourRate(s: GameState, plotId: string): number {
  const ps = s.plots[plotId];
  return hpCapacity(ps, STAND_LEVELS[ps.stand!.level - 1].capacityPerHour);
}

/** The most a stand pours in a day: cups an hour × 10 effective selling hours (L1 200, L2 500, L3 1,200, L4 3,000, L5 7,000). */
export function dailyService(s: GameState, plotId: string): number {
  return pourRate(s, plotId) * SELLING_HOURS;
}

/** People ahead of a newcomer in the stand's line. */
export const peopleAhead = (st: Stand) => Math.ceil((st.queue ?? 0) - 1e-9);

/** A buyer joins the line only if the people ahead are within their segment's patience (seniors wait behind 10, high rollers 2). */
export const joinsLine = (st: Stand, seg: SegmentId) => peopleAhead(st) <= SEGMENTS[seg].patience;

/** Cups the stand can still pour today: the day's service less what it has sold. At 0, every buyer walks off "line too long". */
export function serviceLeft(s: GameState, plotId: string): number {
  return Math.max(0, dailyService(s, plotId) - s.plots[plotId].stand!.day.customers);
}

/** The line moves at the stand's pour rate (cups an hour). Call once a game minute while open. */
export function drainQueue(s: GameState, plotId: string): void {
  const st = s.plots[plotId].stand!;
  if (!st.queue) return;
  const left = st.queue - pourRate(s, plotId) / 60;
  st.queue = left > 1e-9 ? left : 0; // a finished line is exactly empty
}

// ---------- the forecast ----------

/** Memoized appeal by plot and segment for one weather (one forecast). */
function appealMemo(s: GameState, w: Weather) {
  const m = new Map<string, Appeal>();
  return (plotId: string, seg: SegmentId) => {
    const k = plotId + '|' + seg;
    let a = m.get(k);
    if (!a) { a = appealFor(s, plotId, seg, w); m.set(k, a); }
    return a;
  };
}

export interface DemandForecast {
  /** People expected to look at this stand today: its own passersby it keeps plus those it wins from stands nearby. */
  visitors: number;
  /** Of those, the cups wanted (before service and stock). */
  demand: number;
  /** The share of its own passersby the owner keeps (1 alone; at least 65% in a rival block). */
  kept: number;
  /** Visitors who came from other plots' passersby. */
  inflow: number;
  /** Visitor-weighted averages of the per-segment factors. */
  recipe: number; sweet: number; priceFit: number;
}

/** Expected demand at a stand for a day's weather, by the same split, segment, price and stop rules the day runs on. */
export function expectedDemand(s: GameState, plotId: string, w: Weather = s.forecast): DemandForecast {
  const out: DemandForecast = { visitors: 0, demand: 0, kept: 1, inflow: 0, recipe: 1, sweet: 1, priceFit: 1 };
  const st = s.plots[plotId]?.stand;
  if (!st || st.wrecked) return out;
  const memo = appealMemo(s, w);
  const p = PLOT_BY_ID[plotId];
  let recipe = 0, sweet = 0, fit = 0, ownPeople = 0, ownKept = 0;
  for (const q of nearbyPlots(p)) {
    const qs = s.plots[q.id].stand;
    if (!qs || qs.wrecked) continue;
    const passersby = expectedPassersby(s, q.id, w);
    for (const [seg, x] of dayMix(q.district)) {
      const people = passersby * x;
      const share = shareTo(s, q, plotId, (id) => memo(id, seg));
      if (q.id === plotId) {
        ownPeople += people;
        // Kept by the owner: this stand's share plus the owner's other stands' shares.
        const { own, rivals } = standsNear(s, q, (id) => memo(id, seg));
        ownKept += people * (1 - rivalShare(own, rivals));
      }
      if (share <= 0) continue;
      const a = memo(plotId, seg);
      const v = people * share;
      out.visitors += v;
      if (q.id !== plotId) out.inflow += v;
      out.demand += v * a.stopChance;
      recipe += v * a.recipeMatch; sweet += v * a.sweetMatch; fit += v * a.priceFit;
    }
  }
  if (ownPeople > 0) out.kept = ownKept / ownPeople;
  if (out.visitors > 0) { out.recipe = recipe / out.visitors; out.sweet = sweet / out.visitors; out.priceFit = fit / out.visitors; }
  return out;
}

// ---------- saves ----------

/** Fills this lane's new fields on older saves (idempotent). Old rival stands priced off the old curve move to their ceiling. */
export function migrateDemand(s: GameState): void {
  for (const [id, ps] of Object.entries(s.plots)) {
    const st = ps.stand;
    if (!st || st.queue !== undefined) continue;
    st.queue = 0;
    if (ps.owner && ps.owner !== 'player' && PLOT_BY_ID[id]) st.price = rivalPrice(ps.owner as RivalId, st.level, PLOT_BY_ID[id]);
  }
}
