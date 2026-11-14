// The demand chain (spec: Running the business, "How demand works"; Appendix A, demand constants).
//   1. Passersby = plot traffic × stand draw × marketing × season × weather foot traffic.
//   2. Stop chance = 25% × thirst × appeal, where appeal = curb appeal × recipe match × price fit × Reputation.
//   3. Cups sold = the smallest of demand, service (cups/hour × 10 selling hours) and stock.
// Pure and seeded like the rest of src/sim: no DOM, Date or Math.random. economy.ts runs the business day
// minute by minute and calls these; the forecast and the stand panel use the same rules.
import { nextRandom } from './rng.ts';
import {
  AUTO_PRICE_RANK, BASE_STOP_CHANCE, BRAND_TIERS, CAMPAIGNS, DISTRICT_CAMPAIGNS, HOURLY_TRAFFIC, MAJORITY_CURB, OPEN, PEAK_BOOST, PERKS,
  PRICE_FIT, PRICE_TOLERANCE, RECIPES, REP_DRIFT, repMultiplier, RIVAL_SHARE_CAP, SEGMENTS, SELLING_HOURS, SPONSORSHIP, STAND_LEVELS, TASTE_OFF, WEATHER,
  type CampaignId, type DistrictCampaignId, type LocalCampaignId, type RecipeId, type RivalId, type SegmentId,
} from './balance.ts';
import { DISTRICT_BY_ID, nearbyPlots, PLOT_BY_ID, type DistrictId, type FactionId, type Plot } from './map.ts';
import { controlTier, perkActive, tierAtLeast } from './land.ts'; // land: control tiers and the Full Control perks
import { hpCapacity } from './damage.ts';
import type { Appeal, DayStats, GameState, Stand, Weather } from './economy.ts';
import { appealFor, cupsInStock, expectedPassersby, rivalPrice } from './economy.ts';
import { migrateLedger } from './ledger.ts';
import { blenderBar, seasonDemand } from './recipes.ts';
import { calendarTraffic, crowdAt, crowdShareAt, underCeaseAndDesist } from './calendar.ts';
import { eventDef, eventTraffic, liveEvents } from './events.ts';
import { kidsShare } from './happenings.ts';
import { groveTraffic } from './vip.ts';
import { adBlitzBoost } from './schemes.ts';
import { stockCups } from './rivalAi.ts';
import { isSpoiled } from './crew.ts';
import { billboardCurb, billboardTerms, campaignTerms, couponCut, migrateMarketing, salePrice } from './marketing.ts';
import { expressWindow, fancyMenu, migrateSpecs, roofTerms } from './specializations.ts';
import { migrateWeather } from './weather.ts';
import { chattyRegulars, freshPaint, sweetTalk } from './perks.ts';

/** Prices are in cents, and a ceiling rounds down to the cent ($1.575 is a $1.57 ceiling). */
const floorCents = (x: number) => Math.floor(x * 100 + 1e-6) / 100;
const HOURLY_SUM = HOURLY_TRAFFIC.reduce((a, b) => a + b, 0);
const FIRST_HOUR = OPEN / 60;

// ---------- pricing: one ceiling per stand ----------

/**
 * Top-price modifiers from other sections multiply in here, before the ceiling rounds down to the cent: the Blender
 * Bar's Frozen +20% (world) and the Fancy Menu's +20% (specializations.ts). Rival stands take none.
 */
export function topPriceMods(s: GameState, plotId: string, st: Stand | null | undefined = s.plots[plotId]?.stand): number {
  if (s.plots[plotId]?.owner !== 'player' || !st) return 1;
  return blenderBar(s, st.recipe) * fancyMenu(st) * sweetTalk(s); // Sweet Talk: Lottie's tip (perks.ts)
}

/** Ceiling = the level's top price × the district's price tolerance × (1 + the card's price bonus), down to the cent. */
export function ceilingFor(level: number, district: DistrictId, recipe: RecipeId, mods = 1): number {
  return floorCents(STAND_LEVELS[level - 1].topPrice * (PRICE_TOLERANCE[district] ?? 1) * (1 + RECIPES[recipe].priceBonus) * mods);
}

/** The most this stand's crowd will pay, the same for every customer. Rival stands use the same formula. */
export function priceCeiling(s: GameState, plotId: string, st: Stand = s.plots[plotId].stand!): number {
  return ceilingFor(st.level, PLOT_BY_ID[plotId].district, st.recipe, topPriceMods(s, plotId, st));
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

// ---------- curb appeal, Majority and the district perks ----------

/** Majority: the player holds 51%+ of the district's purchasable plots (land's control tiers: civic and HQ plots don't count). */
export const majorityHeld = (s: GameState, d: DistrictId): boolean => tierAtLeast(controlTier(s, d), 'majority');

/**
 * Full Control: the player holds every purchasable plot (land's controlTier), so the district's perk is on (live: lose
 * one plot and it switches off). Demand's own perks ask land's perkActive; vip.ts reads this for Shipping Lane and Old Money.
 */
export const fullControl = (s: GameState, d: DistrictId): boolean => controlTier(s, d) === 'full';

/**
 * Curb appeal is ×1.0 at every stand level (a level pays off through draw, service and top price). Majority pushes
 * it: your stands in a district you hold 51%+ of sell 10% more, and rival stands there lose 10% appeal.
 * Billboards (rival stands within 2 plots −10%) multiply in here too, and the stand panel's curb row is this number.
 */
export function curbAppeal(s: GameState, plotId: string): number {
  let curb = 1;
  if (majorityHeld(s, PLOT_BY_ID[plotId].district)) curb *= s.plots[plotId].owner === 'player' ? MAJORITY_CURB.player : MAJORITY_CURB.rival;
  curb *= billboardCurb(s, plotId); // another owner's Billboard within 2 plots: ×0.9 (marketing.ts)
  curb *= freshPaint(s, s.plots[plotId].owner); // Fresh Paint: Lottie's tip, +5% at yours (perks.ts)
  return curb;
}

/** The perks' terms in the marketing number: Orchard Fresh (+10% at all your stands) and Town Favorite (+10% in Old Town and Maple Row). */
export function perkTraffic(s: GameState, owner: FactionId, plotId?: string): number {
  let t = 0;
  perkTerms(s, owner, (_id, _label, traffic) => { t += traffic; }, plotId);
  return t;
}

function perkTerms(s: GameState, owner: FactionId, add: MarketingAdd, plotId?: string): void {
  if (owner !== 'player') return;
  if (perkActive(s, 'orchardFresh')) add('orchardFresh', 'Orchard Fresh', PERKS.orchardFresh);
  const d = plotId ? PLOT_BY_ID[plotId]?.district : undefined;
  if ((d === 'oldtown' || d === 'maple') && perkActive(s, 'townFavorite')) add('townFavorite', 'Town Favorite', PERKS.townFavorite);
}

// ---------- the marketing number (spec: How marketing stacks) ----------

/** One traffic bonus at a stand (0.2 is +20%). A blocked one counts for nothing: a Cease-and-Desist is on its district. */
export interface MarketingTerm { id: string; label: string; traffic: number; blocked: boolean }
export type MarketingAdd = (id: string, label: string, traffic: number, blocked?: boolean) => void;
export type MarketingSource = (s: GameState, owner: FactionId, add: MarketingAdd, st?: Stand, plotId?: string) => void;

/** Your brand tier, campaigns and Billboards count for nothing in a district under a Cease-and-Desist (calendar.ts's seam). */
export const adsBlocked = (s: GameState, owner: FactionId, plotId?: string): boolean =>
  owner === 'player' && !!plotId && underCeaseAndDesist(s, PLOT_BY_ID[plotId].district);

/**
 * Every traffic bonus reaching a stand adds into one marketing number, in the order the stand panel lists them.
 * Surges written ×2 (Viral Video, Parade Route; Roadworks ×0.5) multiply on top, in expectedPassersby. A new
 * source adds one entry here. A Coupon Blitz is appeal, not traffic (marketing.ts).
 */
export const MARKETING_TERMS: MarketingSource[] = [
  (s, owner, add, _st, plotId) => { // the brand tier: each replaces the last
    const tier = owner === 'player' ? s.brandTier : s.rivals[owner as RivalId]?.brandTier ?? 0;
    if (tier) add('brand', BRAND_TIERS[tier - 1].name, BRAND_TIERS[tier - 1].traffic, adsBlocked(s, owner, plotId));
  },
  (s, owner, add) => { // the Lemon Groves, +5% each at all your stands (vip.ts)
    const g = owner === 'player' ? groveTraffic(s) : 0;
    if (g) add('groves', 'Lemon Groves', g);
  },
  (s, owner, add, st) => { // a Taste-Off win (rivals too) and an Event Sponsorship, in that district (calendar.ts)
    const c = calendarTraffic(s, owner, st);
    if (c) add('calendar', c === TASTE_OFF.traffic ? 'Taste-Off win' : c === SPONSORSHIP.traffic ? 'Event Sponsorship' : 'Taste-Off win and sponsorship', c);
  },
  (s, owner, add, _st, plotId) => perkTerms(s, owner, add, plotId), // Orchard Fresh, Town Favorite
  (s, owner, add, st, plotId) => { // the stand's own campaigns
    if (!st) return;
    for (const id in st.campaigns) {
      const c = CAMPAIGNS[id as CampaignId];
      if (c && (st.campaigns[id as CampaignId] ?? 0) > 0) add(id, c.name, c.traffic, adsBlocked(s, owner, plotId));
    }
  },
  (s, owner, add, st, plotId) => campaignTerms(s, owner, add, st, plotId), // Sunny's walk, and a campaign booked for today (marketing.ts)
  (s, owner, add, _st, plotId) => billboardTerms(s, owner, add, plotId), // +20% for each of its owner's Billboards within 2 plots (marketing.ts)
  (s, owner, add, _st, plotId) => roofTerms(s, owner, add, plotId), // +15% for each Billboard Roof of yours within 2 plots (specializations.ts)
  (s, owner, add, st) => { // FizzCo's ad blitz: its mascot works one district (schemes.ts)
    const b = adBlitzBoost(s, owner, st);
    if (b) add('blitz', "FizzCo's mascot", b);
  },
  (s, owner, add) => chattyRegulars(s, owner, add), // Chatty Regulars: Lottie's tip, +5% at all your stands (perks.ts)
];

const standPlots = new WeakMap<Stand, string>();
/** The plot a stand stands on, for a caller that names only the stand (stands don't move, so it's kept). */
function plotOf(s: GameState, st?: Stand): string | undefined {
  if (!st) return undefined;
  const known = standPlots.get(st);
  if (known && s.plots[known]?.stand === st) return known;
  for (const id in s.plots) if (s.plots[id].stand === st) { standPlots.set(st, id); return id; }
  return undefined;
}

/** The marketing number: 1 + every traffic bonus at this stand. It runs for every stand every minute, so it builds no list. */
export function marketingMultiplier(s: GameState, owner: FactionId, st?: Stand, plotId = plotOf(s, st)): number {
  let m = 1;
  const add: MarketingAdd = (_id, _label, traffic, blocked) => { if (!blocked) m += traffic; };
  for (const source of MARKETING_TERMS) source(s, owner, add, st, plotId);
  return m;
}

/** The marketing number's terms at a stand, as the stand panel lists them. */
export function marketingTerms(s: GameState, owner: FactionId, st?: Stand, plotId = plotOf(s, st)): MarketingTerm[] {
  const out: MarketingTerm[] = [];
  const add: MarketingAdd = (id, label, traffic, blocked = false) => { out.push({ id, label, traffic, blocked }); };
  for (const source of MARKETING_TERMS) source(s, owner, add, st, plotId);
  return out;
}

/** Today's surges on a stand's walkers (world events), each multiplying on top of the marketing number. */
export function surges(s: GameState, plotId: string): { label: string; mult: number }[] {
  const out: { label: string; mult: number }[] = [];
  for (const e of liveEvents(s)) {
    const d = eventDef(e);
    const m = d?.traffic?.(s, e, plotId);
    if (d && m !== undefined && m !== 1) out.push({ label: d.name, mult: m });
  }
  return out;
}

/** Power Lunch (Downtown at Full Control): the lunch rush is ×1.5 at your stands in Downtown and Old Town. A surge on top, not marketing. */
export function lunchRush(s: GameState, plotId: string, hour: number): number {
  const L = PERKS.powerLunch;
  if (hour < L.from || hour >= L.to || s.plots[plotId].owner !== 'player') return 1;
  const d = PLOT_BY_ID[plotId].district;
  if (d !== 'downtown' && d !== 'oldtown') return 1;
  return perkActive(s, 'powerLunch') ? L.mult : 1;
}

/** The lunch rush over a whole day's traffic (×1.1 with Power Lunch), for forecasts. */
export function lunchRushDay(s: GameState, plotId: string): number {
  return HOURLY_TRAFFIC.reduce((a, w, i) => a + w * lunchRush(s, plotId, FIRST_HOUR + i), 0) / HOURLY_SUM;
}

/** Tourist Trap (the Boardwalk at Full Control): tourists pay +20% for every cup at your stands, everywhere. */
export function touristPays(s: GameState, plotId: string, seg: SegmentId): number {
  return seg === 'tourists' && s.plots[plotId].owner === 'player' && perkActive(s, 'touristTrap') ? 1 + PERKS.touristTrap : 1;
}

/**
 * What a local campaign costs today: Word of Mouth (Campus & Arts at Full Control) halves the dollars, the free cups,
 * or a Coupon Blitz's price cut (−12.5% for the same ×1.4 appeal: placeholder, spec gap).
 */
export function campaignCost(s: GameState, id: LocalCampaignId): { cash: number; samples: number; cut: number; half: boolean } {
  const c: { costPerDay?: number; samples?: number; priceCut?: number } = id in DISTRICT_CAMPAIGNS ? DISTRICT_CAMPAIGNS[id as DistrictCampaignId] : CAMPAIGNS[id as CampaignId];
  const half = perkActive(s, 'wordOfMouth');
  const k = half ? PERKS.wordOfMouth : 1;
  return { cash: (c.costPerDay ?? 0) * k, samples: Math.ceil((c.samples ?? 0) * k), cut: (c.priceCut ?? 0) * k, half };
}

// ---------- who walks by, hour by hour ----------

const inPeak = (seg: SegmentId, hour: number) => SEGMENTS[seg].peaks.some(([a, b]) => hour >= a && hour < b);
const hourMixes = new Map<DistrictId, [SegmentId, number][][]>();
/** The crowd mix in one clock hour: the district's mix, with segments in their peak hours ×1.8. Shares sum to 1. */
export function hourMix(d: DistrictId, hour: number): [SegmentId, number][] {
  let byHour = hourMixes.get(d);
  if (!byHour) { byHour = []; hourMixes.set(d, byHour); }
  let m = byHour[hour];
  if (!m) {
    const raw = (Object.entries(DISTRICT_BY_ID[d].mix) as [SegmentId, number][]).map(([seg, x]) => [seg, x * (inPeak(seg, hour) ? PEAK_BOOST : 1)] as [SegmentId, number]);
    const total = raw.reduce((a, [, x]) => a + x, 0);
    m = raw.map(([seg, x]) => [seg, x / total]);
    byHour[hour] = m;
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

/**
 * The day's mix as the forecast sees it: on a festival day half of every passerby in that district is the festival
 * crowd (world: crowdShareAt, a Tourist Bus's 70%), the same draw the business day makes.
 */
export function dayMixOn(s: GameState, d: DistrictId): [SegmentId, number][] {
  const crowd = crowdAt(s, d);
  if (!crowd) return dayMix(d);
  const share = crowdShareAt(s, d);
  const mix = dayMix(d).map(([seg, x]) => [seg, x * (1 - share) + (seg === crowd ? share : 0)] as [SegmentId, number]);
  if (!mix.some(([seg]) => seg === crowd)) mix.push([crowd, share]);
  return mix;
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
    if (!st || st.wrecked || isSpoiled(s, s.plots[q.id])) continue; // crew: a Sabotaged stand sells nothing today
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

/** One plot's street worked out for a passerby: its stands, the rivals' share and each side's total appeal. */
export interface Street { home: Option; own: Option[]; rivals: Option[]; share: number; ownTotal: number; rivalTotal: number }

/** The street a passerby of plot p walks. It holds while the stands near it and their appeal do (economy.ts keeps one a day). */
export function streetAt(s: GameState, p: Plot, appealOf: (plotId: string) => Appeal): Street {
  const { own, rivals } = standsNear(s, p, appealOf);
  const home = own.find((x) => x.id === p.id) ?? { id: p.id, a: appealOf(p.id) };
  return { home, own, rivals, share: rivalShare(own, rivals), ownTotal: appealSum(own), rivalTotal: appealSum(rivals) };
}

/**
 * Where one passerby goes. Stands within 2 plots split passing customers by appeal, whoever owns them;
 * customers shared with the home owner's other stands stay with that owner, and rival stands take at most 35%.
 */
export function chooseOn(street: Street, rng: { seed: number }): Option {
  const { home, own, rivals } = street;
  if (own.length + rivals.length <= 1) return home;
  const toRivals = rivals.length > 0 && nextRandom(rng) < street.share;
  const pool = toRivals ? rivals : own;
  if (pool.length === 1) return pool[0];
  const total = toRivals ? street.rivalTotal : street.ownTotal;
  if (total <= 0) return home; // nothing here appeals: they walk on past their own stand
  let r = nextRandom(rng) * total;
  for (const x of pool) { r -= x.a.appeal; if (r <= 0) return x; }
  return pool[pool.length - 1];
}

/** The expected share of plot q's passersby that end up at the stand on plot `to` (the same rule as chooseOn). */
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
 * Cups an hour the stand pours: the level's, ×1.3 behind an Express Window of yours (specializations.ts), and a
 * Damaged stand pours its HP share of that, in whole cups (damage.ts).
 */
export function pourRate(s: GameState, plotId: string): number {
  const ps = s.plots[plotId];
  return hpCapacity(ps, Math.round(STAND_LEVELS[ps.stand!.level - 1].capacityPerHour * expressWindow(ps)));
}

/** The most a stand pours in a day: cups an hour × 10 effective selling hours (L1 200, L2 500, L3 1,200, L4 3,000, L5 7,000). */
export function dailyService(s: GameState, plotId: string): number {
  return pourRate(s, plotId) * SELLING_HOURS;
}

/** The cups of stock a level holds, one and a half days at full pour: 300 / 750 / 1,800 / 4,500 / 10,500 (spec: Stands). */
export function stockCapCups(level: number): number {
  return STAND_LEVELS[level - 1].stock;
}

/**
 * People ahead of a newcomer in the stand's line. Mid-minute, `perMinute` is what the stand still pours before the
 * minute is out: a minute's walkers arrive together, so a buyer counts only the people the stand won't have served
 * by then (an L5 pours nearly 12 cups a minute, and a peak minute's dozen buyers never really stand in a line).
 */
export const peopleAhead = (st: Stand, perMinute = 0) => Math.max(0, Math.ceil((st.queue ?? 0) - perMinute - 1e-9));

/** A buyer joins the line only if the people ahead are within their segment's patience (seniors wait behind 10, high rollers 2). */
export const joinsLine = (st: Stand, seg: SegmentId, perMinute = 0) => peopleAhead(st, perMinute) <= SEGMENTS[seg].patience;

/** Cups the stand can still pour today: the day's service less what it has sold. At 0, every buyer walks off "line too long". */
export function serviceLeft(s: GameState, plotId: string): number {
  return Math.max(0, dailyService(s, plotId) - s.plots[plotId].stand!.day.customers);
}

/**
 * The line moves at the stand's pour rate (cups an hour). Call once a game minute while open, after the minute's
 * walkers: what's left is the line waiting into the next minute, the one the queue counter shows.
 */
export function drainQueue(s: GameState, plotId: string): void {
  const st = s.plots[plotId].stand!;
  if (!st.queue) return;
  const left = st.queue - pourRate(s, plotId) / 60;
  st.queue = left > 1e-9 ? left : 0; // a finished line is exactly empty
}

// ---------- the forecast and the stand panel ----------

/** Memoized appeal by plot and segment for one weather (one forecast or panel draw). */
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
  /** Of those kept, the people who walk on to the owner's other stands within 2 plots (they stay the owner's). */
  toOwn: number;
  /** Visitors who came from other plots' passersby. */
  inflow: number;
  /** Visitor-weighted averages of the per-segment factors. */
  recipe: number; sweet: number; priceFit: number;
}

/** Expected demand at a stand for a day's weather, by the same split, segment, price and stop rules the day runs on. */
export function expectedDemand(s: GameState, plotId: string, w: Weather = s.forecast): DemandForecast {
  const out: DemandForecast = { visitors: 0, demand: 0, kept: 1, toOwn: 0, inflow: 0, recipe: 1, sweet: 1, priceFit: 1 };
  const st = s.plots[plotId]?.stand;
  if (!st || st.wrecked || isSpoiled(s, s.plots[plotId])) return out; // crew: a Sabotaged stand sells nothing today
  const memo = appealMemo(s, w);
  const p = PLOT_BY_ID[plotId];
  let recipe = 0, sweet = 0, fit = 0, ownPeople = 0, ownKept = 0, ownStay = 0;
  for (const q of nearbyPlots(p)) {
    const qs = s.plots[q.id].stand;
    if (!qs || qs.wrecked) continue;
    const passersby = expectedPassersby(s, q.id, w) * lunchRushDay(s, q.id);
    for (const [seg, x] of dayMixOn(s, q.district)) {
      const people = passersby * x;
      const share = kidsShare(s, q, plotId, seg, (id) => memo(id, seg), shareTo(s, q, plotId, (id) => memo(id, seg))); // world: Kids' Lemonade Day's kid stands take their part
      if (q.id === plotId) {
        ownPeople += people;
        // Kept by the owner: this stand's share plus the owner's other stands' shares.
        const { own, rivals } = standsNear(s, q, (id) => memo(id, seg));
        ownKept += people * kidsShare(s, q, q.id, seg, (id) => memo(id, seg), 1 - rivalShare(own, rivals));
      }
      if (share <= 0) continue;
      const a = memo(plotId, seg);
      const v = people * share;
      out.visitors += v;
      if (q.id !== plotId) out.inflow += v; else ownStay += v;
      out.demand += v * a.stopChance;
      recipe += v * a.recipeMatch; sweet += v * a.sweetMatch; fit += v * a.priceFit;
    }
  }
  if (ownPeople > 0) out.kept = ownKept / ownPeople;
  out.toOwn = Math.max(0, ownKept - ownStay);
  if (out.visitors > 0) { out.recipe = recipe / out.visitors; out.sweet = sweet / out.visitors; out.priceFit = fit / out.visitors; }
  return out;
}

export type Binding = 'demand' | 'service' | 'stock';

/** Every number in the three demand steps, for the stand panel (forecast at Morning Prep, today's weather while open). */
export interface DemandChain {
  // 1. Passersby
  traffic: number; draw: number; marketing: number; season: number; weather: number; surge: number; lunch: number; passersby: number;
  /** The marketing number's terms, and the surges multiplying on top. */
  terms: MarketingTerm[]; surges: { label: string; mult: number }[];
  /** Walk by × kept − toOwn (to your stands next door) + inflow (from next door) = visitors, the people at this stand. */
  kept: number; toOwn: number; inflow: number; visitors: number;
  // 2. Stop chance
  base: number; thirst: number; curb: number; recipe: number; sweet: number; priceFit: number; reputation: number; stopChance: number;
  /** What a cup sells for (a Coupon Blitz's `coupon` cut off the stand's price) and the stand's ceiling. */
  price: number; coupon: number; ceiling: number;
  // 3. Cups sold
  demand: number; pourRate: number; service: number; stock: number; cups: number; binding: Binding;
  /** Perks at work at this stand. */
  perks: { townFavorite: boolean; orchardFresh: boolean; powerLunch: boolean; touristTrap: boolean; majority: boolean };
}

export function demandChain(s: GameState, plotId: string, w: Weather = s.phase === 'prep' ? s.forecast : s.weather): DemandChain | null {
  const ps = s.plots[plotId];
  const st = ps?.stand;
  if (!st) return null;
  const p = PLOT_BY_ID[plotId];
  const owner = ps.owner!;
  const f = expectedDemand(s, plotId, w);
  const passersby = expectedPassersby(s, plotId, w);
  const lunch = lunchRushDay(s, plotId);
  const service = dailyService(s, plotId);
  const stock = owner === 'player' ? cupsInStock(s, plotId) : stockCups(st); // a rival sells one full stock a day (rivalAi.ts)
  const demand = Math.round(f.demand);
  const cups = Math.min(demand, service, stock);
  const binding: Binding = cups === demand ? 'demand' : cups === service ? 'service' : 'stock';
  return {
    traffic: p.baseTraffic, draw: STAND_LEVELS[st.level - 1].draw, marketing: marketingMultiplier(s, owner, st, plotId),
    season: seasonDemand(s, plotId), weather: WEATHER[w.kind].traffic, surge: eventTraffic(s, plotId), lunch,
    terms: marketingTerms(s, owner, st, plotId), surges: surges(s, plotId),
    passersby: Math.round(passersby * lunch), kept: f.kept, toOwn: Math.round(f.toOwn), inflow: Math.round(f.inflow), visitors: Math.round(f.visitors),
    base: BASE_STOP_CHANCE, thirst: WEATHER[w.kind].thirst, curb: curbAppeal(s, plotId), recipe: f.recipe, sweet: f.sweet, priceFit: f.priceFit,
    reputation: repMultiplier(owner === 'player' ? s.reputation : rivalStars(s, owner as RivalId)), stopChance: f.visitors > 0 ? f.demand / f.visitors : 0,
    price: salePrice(s, plotId, st), coupon: couponCut(s, plotId), ceiling: priceCeiling(s, plotId, st),
    demand, pourRate: pourRate(s, plotId), service, stock, cups, binding,
    perks: {
      townFavorite: owner === 'player' && (p.district === 'oldtown' || p.district === 'maple') && perkActive(s, 'townFavorite'),
      orchardFresh: owner === 'player' && perkActive(s, 'orchardFresh'),
      powerLunch: lunch > 1,
      touristTrap: owner === 'player' && perkActive(s, 'touristTrap'),
      majority: majorityHeld(s, p.district),
    },
  };
}

// ---------- reputation ----------

/** The share of would-be buyers who left empty-handed today (too pricey, line too long, sold out); 0 with none. */
export function emptyHanded(t: DayStats): number {
  const w = t.walkedPast;
  const lost = w.pricey + w.line + w.soldOut;
  return lost + t.customers > 0 ? lost / (lost + t.customers) : 0;
}

/** The levels of an owner's stands: every stand counts, a wrecked one too. */
const standLevels = (s: GameState, owner: FactionId) => Object.values(s.plots).filter((ps) => ps.owner === owner && ps.stand).map((ps) => ps.stand!.level);

/** 3.0 stars plus 0.4 per average stand level above L1, capped at 4.6, less 0.1 star per 10% who left empty-handed. */
function driftTarget(levels: number[], empty: number): number {
  const avg = levels.length ? levels.reduce((a, b) => a + b, 0) / levels.length : 1;
  return Math.min(REP_DRIFT.cap, REP_DRIFT.base + REP_DRIFT.perLevel * (avg - 1)) - REP_DRIFT.dropPerShare * empty;
}

/**
 * Where Reputation drifts tonight: 3.0 stars plus 0.4 per average level of your stands above L1 (every stand
 * counts, a wrecked one too), capped at 4.6, less 0.1 star per 10% of the day's would-be buyers who left empty-handed.
 */
export function reputationTarget(s: GameState, t: DayStats = s.today): number {
  return driftTarget(standLevels(s, 'player'), emptyHanded(t));
}

const REP_GRAIN = 1e-4; // Reputation keeps four decimals
/** Stars kept within 1–5, to four decimals. */
const toStars = (x: number) => Math.min(REP_DRIFT.max, Math.max(REP_DRIFT.min, Math.round(x * 1e4) / 1e4));

/** One night's drift: 5% of the gap to the target, and at least 0.0001 (or onto it), so a hair short still gets there. */
function drifted(stars: number, target: number): number {
  const gap = target - stars;
  const step = Math.abs(gap) <= REP_GRAIN ? gap : Math.sign(gap) * Math.max(REP_GRAIN, Math.abs(REP_DRIFT.rate * gap));
  return toStars(stars + step);
}

/**
 * The nightly drift, at closing: 5% of the way to the target, within 1-5 stars. Reputation keeps four decimals, so
 * a night moves it at least 0.0001 toward the target (or onto it): a hair short, it still gets there.
 */
export function driftReputation(s: GameState, t: DayStats = s.today): void {
  const target = reputationTarget(s, t);
  t.repTarget = Math.round(target * 100) / 100;
  s.reputation = drifted(s.reputation, target);
}

// ---------- rival Reputation: the same stars, by the same rules ----------

/** A rival's Reputation, 1–5 stars: 3.0 until its first night (and in a save from before rivals had stars). */
export const rivalStars = (s: GameState, id: RivalId): number => s.rivals[id]?.reputation ?? REP_DRIFT.base;

/** Stars on or off a rival, within 1–5 (a Taste-Off win gives the winner +0.1, rivals included). */
export function addRivalStars(s: GameState, id: RivalId, delta: number): void {
  const r = s.rivals[id];
  if (r) r.reputation = toStars(rivalStars(s, id) + delta);
}

/** A rival's share of would-be buyers who left its stands empty-handed today, counted as yours are. */
export function rivalEmptyHanded(s: GameState, id: RivalId): number {
  let lost = 0, customers = 0;
  for (const ps of Object.values(s.plots)) {
    if (ps.owner !== id || !ps.stand) continue;
    const w = ps.stand.day.walkedPast;
    lost += w.pricey + w.line + w.soldOut;
    customers += ps.stand.day.customers;
  }
  return lost + customers > 0 ? lost / (lost + customers) : 0;
}

/** Where a rival's stars drift tonight: your rule, from its own stands and its own day. */
export const rivalReputationTarget = (s: GameState, id: RivalId): number => driftTarget(standLevels(s, id), rivalEmptyHanded(s, id));

/** At closing everyone's Reputation drifts: yours, then each rival still in business. */
export function reputationAtClose(s: GameState, t: DayStats = s.today): void {
  driftReputation(s, t);
  for (const id of Object.keys(s.rivals) as RivalId[]) {
    const r = s.rivals[id];
    if (r.alive) r.reputation = drifted(rivalStars(s, id), rivalReputationTarget(s, id));
  }
}

// ---------- saves ----------

/**
 * Fills this lane's new fields on older saves (idempotent). Old rival stands priced off the old curve move to their
 * ceiling. Auto-Restock was a switch you turned on; now every stand has it unless it opts out, so a save from before
 * stock targets (no stockTarget field) gets the switch on and the suggested target. Auto-Price is new: a run past
 * Rank 3 priced its stands by hand, so they keep their prices until switched on; an earlier run (and every rival
 * stand, should you take one) gets it on.
 */
export function migrateDemand(s: GameState): void {
  migrateLedger(s); // the Ledger's score log, from what the history still knows
  migrateMarketing(s); // district campaigns and bookings (marketing.ts)
  migrateSpecs(s); // stand specializations: empty slots on older saves (specializations.ts)
  migrateWeather(s); // the weather queue, checked; a save from before it gets one at its next dawn (weather.ts)
  for (const r of Object.values(s.rivals ?? {})) r.reputation ??= REP_DRIFT.base; // rivals' own stars start at 3.0
  for (const [id, ps] of Object.entries(s.plots)) {
    const st = ps.stand;
    if (!st) continue;
    if (st.stockTarget === undefined) { st.stockTarget = null; st.autoRestock = true; }
    if (st.autoPrice === undefined) st.autoPrice = s.rank < AUTO_PRICE_RANK || ps.owner !== 'player';
    if (st.queue !== undefined) continue;
    st.queue = 0;
    if (ps.owner && ps.owner !== 'player' && PLOT_BY_ID[id]) st.price = rivalPrice(ps.owner as RivalId, st.level, PLOT_BY_ID[id]);
  }
}
