// Milestone 5: big orders and VIP clients (canon section 15). Local Orders
// from L3 stands, Caterer Trucks, Helicopter VIPs on a Field helipad and Ship
// Contracts at a Dock pier, with Bottling Works making the bottles.
import { CLUBHOUSE, CLUBHOUSE_HP, CUP_COST, DELIVERY_WINDOW, RANKS, type RecipeId } from './balance.ts';
import type { BattleReport } from './crew.ts';
import { scheduleDeliveryRaid } from './night.ts';
import { PLOT_BY_ID, PLOTS, type PlotType } from './map.ts';
import { hasTrophy } from './rivals.ts';
import { nextRandom, type Rng } from './rng.ts';
import type { Blocker, GameState } from './economy.ts';
import { costPerCup, playerStands } from './economy.ts';
import { restoreHp } from './damage.ts';
import { ownedRecipes, ownsRecipe, recipeCost } from './recipes.ts';

export type FacilityKind = 'bottling' | 'helipad' | 'pier' | 'grove' | 'clubhouse';
export type OrderTier = 'local' | 'caterer' | 'heli' | 'ship' | 'deal';
/** Tiers delivered by sea (a ship scene at the pier). */
export const bySea = (t: OrderTier) => t === 'ship' || t === 'deal';
/** VIP tiers: a chopper or a ship comes to your facility. */
export const isVip = (t: OrderTier) => t === 'heli' || bySea(t);

export interface Facility { kind: FacilityKind; level: number; wrecked?: boolean; hp?: number } // hp: as a Stand's (damage.ts)

export interface Order {
  id: string;
  tier: OrderTier;
  client: string;
  qty: number;
  pay: number; // total
  due: number; // day the pickup happens
  expires: number; // offers vanish after this day
  plot?: string; // pickup point
  accepted: boolean;
  loaded?: number; // VIP orders: bottles loaded so far (each pickup pays for its own load)
  loading?: number; // the bottles on the trip a Delivery Raid is holding, until it's fought
  loads?: number; // a Supply Deal: its weekly loads, each due a week after the last
  recipe?: RecipeId; // what the client wants bottled (older orders: Classic); a Local Order pours its stand's card
}

// ---------- tunables (starting values; the balance thread replaces these) ----------

export const FACILITIES: Record<FacilityKind, { hp: number[]; names: string[]; costs: number[]; ranks: number[]; on: PlotType[]; blurb: string[] }> = {
  // hp: how much chopping it takes to knock down (Knock it down, buy it up).
  bottling: { hp: [1000, 2500, 6000], names: ['Bottling Works', 'Bottling Works L2', 'Bottling Works L3'], costs: [25000, 100000, 400000], ranks: [5, 6, 7], on: ['industrial'], blurb: ['1,500 bottles a day', '4,000 bottles a day', '12,000 bottles a day'] },
  helipad: { hp: [800, 2000, 5000], names: ['Pad', 'Helipad', 'Heliport'], costs: [50000, 200000, 800000], ranks: [6, 7, 8], on: ['field'], blurb: ['Small choppers: 2,000–4,000 bottles', '4,000–7,000 bottles', 'Big choppers: 7,000–10,000 bottles'] },
  grove: { hp: [800], names: ['Lemon Grove'], costs: [25000], ranks: [5], on: ['field'], blurb: ['+5% foot traffic at all your stands (up to 2 Groves)'] },
  pier: { hp: [1500, 3500, 8000], names: ['Jetty', 'Pier', 'Cargo Terminal'], costs: [250000, 750000, 3000000], ranks: [7, 7, 8], on: ['dock'], blurb: ['Yachts: 10,000–20,000 bottles', 'Cruise ships: 20,000–40,000 bottles', 'Freighters: 40,000–60,000 bottles'] },
  // The crew's beds (combat: clubhouse.ts). Several allowed, each upgrading on its own.
  clubhouse: { hp: CLUBHOUSE_HP, names: ['Clubhouse', 'Clubhouse L2', 'Clubhouse L3'], costs: CLUBHOUSE.map((c) => c.cost), ranks: CLUBHOUSE.map((c) => c.rank), on: ['street'], blurb: CLUBHOUSE.map((c) => `${c.beds} beds for guards`) },
};
export const BOTTLES_PER_DAY = [1500, 4000, 12000];
/** The bottle and cap that take the cup's place (balance-tables: Supplies). */
export const BOTTLE_CAP = 0.15;
/** A bottle: the recipe's ingredients at today's Market plus the bottle and cap (Classic about $0.31: $0.16 + $0.15). */
export const bottleCost = (s: GameState, recipe: RecipeId = 'classic') => recipeCost(s, recipe) - CUP_COST + BOTTLE_CAP;
/** The recipe an order is bottled in: the client's pick (orders from before recipes: Classic). */
export const orderRecipe = (o: Order): RecipeId => o.recipe ?? 'classic';

/** Bottles of one recipe on hand. s.bottles counts them all and s.bottleStock holds each recipe but Classic, which is the
 * rest: older saves, whose bottles were all Classic, need no migration. */
export function bottlesOf(s: GameState, recipe: RecipeId): number {
  if (recipe !== 'classic') return Math.min(s.bottleStock?.[recipe] ?? 0, s.bottles);
  let others = 0;
  for (const n of Object.values(s.bottleStock ?? {})) others += n ?? 0;
  return Math.max(0, s.bottles - others);
}
/** Bottles of a recipe into stock (n < 0 takes them out). */
export function stockBottles(s: GameState, recipe: RecipeId, n: number): void {
  s.bottles = Math.max(0, s.bottles + n);
  if (recipe === 'classic') return;
  const m = (s.bottleStock ??= {});
  const left = Math.max(0, (m[recipe] ?? 0) + n);
  if (left) m[recipe] = left; else delete m[recipe];
}
/** Pay is per bottle (Local Orders: 1.5× that stand's cup price). Chance = offers per day. */
export const ORDER_TIERS: Record<OrderTier, { rank: number; stars: number; size: [number, number]; pay: number; days: number; chance: number; label: string }> = {
  local: { rank: 3, stars: 0, size: [300, 1500], pay: 1.5, days: 2, chance: 0.5, label: 'Local Order' },
  caterer: { rank: 5, stars: 0, size: [1000, 5000], pay: 6, days: 3, chance: 0.4, label: 'Caterer Truck' }, // about 2 per 5 days
  heli: { rank: 6, stars: 3.5, size: [2000, 10000], pay: 30, days: 4, chance: 1 / 3, label: 'Helicopter VIP' },
  ship: { rank: 7, stars: 4.0, size: [10000, 60000], pay: 40, days: 7, chance: 1 / 5, label: 'Ship Contract' },
  deal: { rank: 8, stars: 4.0, size: [200000, 200000], pay: 30, days: 28, chance: 1 / 7, label: 'Supply Deal' },
};
/** Order sizes served by each facility tier. */
export const HELI_SIZES: [number, number][] = [[2000, 4000], [4000, 7000], [7000, 10000]];
export const SHIP_SIZES: [number, number][] = [[10000, 20000], [20000, 40000], [40000, 60000]];
/** A delivered helicopter order (ships and Supply Deals add none). */
export const VIP_STAR_BONUS = 0.2;
/** A failed or overrun order, once, whatever was loaded before it fell through. */
export const FAILED_ORDER_STARS = 0.3;
/** Bottles each facility tier loads a day (spec: VIP facilities): Pad, Helipad, Heliport; Jetty, Pier, Cargo Terminal. */
export const LOADING_PER_DAY: Record<'helipad' | 'pier', number[]> = { helipad: [2000, 5000, 20000], pier: [5000, 10000, 25000] };
/** Trips a day: the Heliport's bigger choppers make 2, the second a pickup window after the first. */
export const TRIPS_PER_DAY: Record<'helipad' | 'pier', number[]> = { helipad: [1, 1, 2], pier: [1, 1, 1] };
export const DELIVERY_RAID_THREAT = 3;
export const DELIVERY_RAID_CHANCE = 0.3;
export const MAX_OFFERS = 4;
/** Once a facility tier stands, its client type offers a job at least this often. */
export const VIP_MAX_GAP = 10;
/** A Supply Deal ships in weekly loads (4 of 50,000 bottles). */
export const DEAL_LOADS = 4;
export const GROVE_TRAFFIC = 0.05;
export const MAX_GROVES = 2;
/** Pickup minute: choppers at 5:30 pm, in the golden hour (spec mood scene "The first helicopter"), ships at 10 am (each
 * opens a 2-hour window; Caterer Trucks and Local Orders at closing). */
export const PICKUP_MINUTE: Record<OrderTier, number> = { local: 20 * 60, caterer: 20 * 60, heli: 17 * 60 + 30, ship: 10 * 60, deal: 10 * 60 };

const CLIENTS: Record<OrderTier, string[]> = {
  local: ['the Maple Row Block Party', 'Little League Opening Day', 'the Old Town Bake Sale', 'the Campus Book Fair', 'a Fire Station Open House'],
  caterer: ['Bayside Catering Co.', 'Dot\'s Diner (big weekend)', 'the Hilltop Garden Club', 'Harbor Fest Food Tent'],
  heli: ['a movie star\'s pool party', 'a tech mogul\'s rooftop launch', 'a celebrity wedding', 'the music festival VIP tent', 'the Governor\'s Gala'],
  deal: ['Gulfstream Grocers', 'the Tri-County School Board', 'Cruise Line Provisioning Co.', 'the Bayside Ballpark'],
  ship: ['the Citrine Bay Regatta', 'the S.S. Sunny Disposition (cruise line)', 'an overseas export deal', 'the Bay Centennial flotilla'],
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

// ---------- facilities ----------

export function facilityPlots(s: GameState, kind: FacilityKind) {
  return PLOTS.filter((p) => s.plots[p.id].owner === 'player' && s.plots[p.id].facility?.kind === kind && !s.plots[p.id].facility!.wrecked);
}
const bestLevel = (s: GameState, kind: FacilityKind) => Math.max(0, ...facilityPlots(s, kind).map((p) => s.plots[p.id].facility!.level));

export function facilityFor(type: PlotType): FacilityKind | null {
  return facilitiesFor(type)[0] ?? null;
}
/** Every facility that can go on a plot type (Fields take a Helipad or a Lemon Grove). */
export const facilitiesFor = (type: PlotType) => (Object.keys(FACILITIES) as FacilityKind[]).filter((k) => FACILITIES[k].on.includes(type));

/** Lemon Groves add foot traffic at all your stands: +5% each, +10% with the Hollis Orchards trophy. */
export function groveTraffic(s: GameState): number {
  return Math.min(MAX_GROVES, facilityPlots(s, 'grove').length) * GROVE_TRAFFIC * (hasTrophy(s, 'hollis') ? 2 : 1); // up to 2 count, even taken from Hollis
}

export function canBuildFacility(s: GameState, plotId: string, kind: FacilityKind): Blocker {
  const p = PLOT_BY_ID[plotId];
  const ps = s.plots[plotId];
  const f = FACILITIES[kind];
  if (ps.owner !== 'player') return { ok: false, why: 'Buy the plot first' };
  if (!f.on.includes(p.type)) return { ok: false, why: `Needs a ${f.on.join(' or ')} plot` };
  if (ps.stand) return { ok: false, why: 'A stand is here' };
  if (ps.facility && ps.facility.kind !== kind) return { ok: false, why: 'Something else is built here' };
  if (ps.facility?.wrecked) return { ok: false, why: 'Rebuild it first' };
  const lvl = ps.facility?.level ?? 0;
  if (lvl >= f.names.length) return { ok: false, why: 'Top level' };
  if (kind === 'grove' && !lvl && PLOTS.filter((q) => s.plots[q.id].owner === 'player' && s.plots[q.id].facility?.kind === 'grove').length >= MAX_GROVES) return { ok: false, why: `Up to ${MAX_GROVES} Lemon Groves` };
  if (s.rank < f.ranks[lvl]) return { ok: false, why: `Needs Rank ${f.ranks[lvl]}, ${RANKS[f.ranks[lvl] - 1].title}` };
  if (s.phase === 'open') return { ok: false, why: 'Build after closing or at Morning Prep' };
  if (s.cash < f.costs[lvl]) return { ok: false, why: `Needs ${money(f.costs[lvl])}` };
  return { ok: true };
}

export function buildFacility(s: GameState, plotId: string, kind: FacilityKind): boolean {
  if (!canBuildFacility(s, plotId, kind).ok) return false;
  const ps = s.plots[plotId];
  const lvl = ps.facility?.level ?? 0;
  const cost = FACILITIES[kind].costs[lvl];
  s.cash = round2(s.cash - cost);
  s.today.land = round2(s.today.land + cost);
  ps.invested += cost;
  restoreHp(s, plotId); // the new tier comes up at full HP; a repair queued for the old one is paid back (damage.ts)
  ps.facility = { kind, level: lvl + 1 };
  s.news.push(`${FACILITIES[kind].names[lvl]} opens at ${PLOT_BY_ID[plotId].name}!${kind === 'helipad' ? ' The rich folks can fly in now.' : kind === 'pier' ? ' Ships can dock for your lemonade.' : kind === 'grove' ? ' Grown in Citrine Bay: more folks stop by every stand.' : ''}`);
  return true;
}

export const bottlingCapacity = (s: GameState) => Math.round(facilityPlots(s, 'bottling').reduce((a, p) => a + BOTTLES_PER_DAY[s.plots[p.id].facility!.level - 1], 0) * (hasTrophy(s, 'fizzco') ? 1.25 : 1));

// ---------- offers ----------

export function tierOpen(s: GameState, tier: OrderTier): Blocker {
  const t = ORDER_TIERS[tier];
  if (s.rank < t.rank) return { ok: false, why: `Rank ${t.rank}` };
  if (s.reputation < t.stars) return { ok: false, why: `${t.stars.toFixed(1)} stars` };
  if (tier === 'local' && !playerStands(s).some((p) => s.plots[p.id].stand!.level >= 3 && !s.plots[p.id].stand!.wrecked)) return { ok: false, why: 'an L3 Kiosk' };
  if (tier === 'caterer' && !facilityPlots(s, 'bottling').length) return { ok: false, why: 'a Bottling Works' };
  if (tier === 'heli' && !facilityPlots(s, 'helipad').length) return { ok: false, why: 'a Helipad on a Field plot' };
  if (tier === 'ship' && !facilityPlots(s, 'pier').length) return { ok: false, why: 'a Pier on a Dock plot' };
  if (tier === 'deal' && bestLevel(s, 'pier') < 3) return { ok: false, why: 'a Cargo Terminal' };
  return { ok: true };
}

/** The facility of a line with the highest tier (the first such): its orders come in its sizes and load at its rate. */
function bestFacility(s: GameState, kind: 'helipad' | 'pier'): string | undefined {
  const lvl = bestLevel(s, kind);
  return facilityPlots(s, kind).find((p) => s.plots[p.id].facility!.level === lvl)?.id;
}

function rollOffer(s: GameState, tier: OrderTier, rng: Rng): Order {
  const t = ORDER_TIERS[tier];
  const [lo, hi] = tier === 'heli' ? HELI_SIZES[bestLevel(s, 'helipad') - 1] : tier === 'ship' ? SHIP_SIZES[bestLevel(s, 'pier') - 1] : t.size;
  const qty = Math.round((lo + (hi - lo) * nextRandom(rng)) / 100) * 100;
  const unit = tier === 'local' ? localPrice(s) * t.pay : t.pay;
  const days = t.days;
  const plot = tier === 'heli' ? bestFacility(s, 'helipad') : bySea(tier) ? bestFacility(s, 'pier') : undefined;
  const clients = CLIENTS[tier];
  const o: Order = {
    id: `o${s.nextId++}`, tier, client: clients[Math.floor(nextRandom(rng) * clients.length)], qty,
    pay: Math.round(qty * unit), due: s.day + days, expires: s.day + 1, plot, accepted: false,
  };
  if (tier !== 'local') { // any recipe in Lottie's book (spec: a Bottling Works fills bottles of any recipe you own)
    const book = ownedRecipes(s);
    o.recipe = book[Math.floor(nextRandom(rng) * book.length)];
  }
  return o;
}

function localPrice(s: GameState): number {
  const stands = playerStands(s).map((p) => s.plots[p.id].stand!).filter((st) => st.level >= 3);
  return stands.length ? Math.max(...stands.map((st) => st.price)) : 1;
}

/** At dawn: production, expiring offers, new offers. */
export function vipAtDawn(s: GameState): void {
  const rng = { seed: s.seed };
  // Bottling runs only while an accepted order still needs bottles: each recipe the orders want, the soonest due first,
  // at its own cost (a page that has left the book can't be bottled).
  let room = bottlingCapacity(s);
  const want = new Map<RecipeId, number>();
  for (const o of s.orders.filter((x) => x.tier !== 'local').sort((a, b) => nextDue(a, s.day) - nextDue(b, s.day))) {
    want.set(orderRecipe(o), (want.get(orderRecipe(o)) ?? 0) + bottlesLeft(o));
  }
  for (const [recipe, n] of want) {
    const cost = bottleCost(s, recipe);
    const make = ownsRecipe(s, recipe) ? Math.min(n - bottlesOf(s, recipe), room, Math.floor(Math.max(0, s.cash) / cost)) : 0;
    if (make <= 0) continue;
    stockBottles(s, recipe, make);
    room -= make;
    s.cash = round2(s.cash - make * cost);
    s.today.supplies = round2(s.today.supplies + make * cost);
  }
  s.offers = s.offers.filter((o) => o.expires >= s.day);
  const last = (s.lastOffer ??= {});
  for (const tier of Object.keys(ORDER_TIERS) as OrderTier[]) {
    if (!tierOpen(s, tier).ok) { delete last[tier]; continue; }
    // VIP tiers: the first Supply Deal comes as soon as the Cargo Terminal stands, and no VIP tier goes 10 days without a call.
    if (isVip(tier) && last[tier] === undefined && tier !== 'deal') last[tier] = s.day;
    const due = isVip(tier) && (last[tier] === undefined || s.day - last[tier]! >= VIP_MAX_GAP);
    if (!due && nextRandom(rng) >= offerChance(s, tier)) continue;
    makeOffer(s, tier, rng);
  }
  s.seed = rng.seed;
}

/** How likely a tier's client calls at dawn (spec: Offers, about 1 per 2 / 2.5 / 3 / 5 / 7 days). */
export const offerChance = (_s: GameState, tier: OrderTier) => ORDER_TIERS[tier].chance;

/** A new offer in the Order Book. One left unanswered never holds the next back (each tier calls at its own rate), and
 * a full book lets its oldest offer go, a day early, to make room. */
function makeOffer(s: GameState, tier: OrderTier, rng: Rng): Order {
  const o = rollOffer(s, tier, rng);
  if (s.offers.length >= MAX_OFFERS) s.offers.shift();
  s.offers.push(o);
  (s.lastOffer ??= {})[tier] = s.day;
  if (tier === 'deal') s.news.push(`Supply Deal! ${o.client} wants ${o.qty.toLocaleString('en-US')} bottles over ${ORDER_TIERS.deal.days} days for ${money(o.pay)}, shipped weekly from your Cargo Terminal.`);
  else if (isVip(tier)) s.news.push(`VIP call! ${o.client} wants ${o.qty.toLocaleString('en-US')} bottles for ${money(o.pay)}.`);
  return o;
}

export function acceptOrder(s: GameState, id: string): boolean {
  const i = s.offers.findIndex((o) => o.id === id);
  if (i < 0) return false;
  const o = s.offers.splice(i, 1)[0];
  o.accepted = true;
  if (o.tier === 'deal') o.loads = DEAL_LOADS; // weekly loads from the Cargo Terminal, paid at each pickup
  s.orders.push(o);
  return true;
}

export function declineOrder(s: GameState, id: string): void {
  s.offers = s.offers.filter((o) => o.id !== id);
}

/** For a Supply Deal offer: bottles a day it needs on top of what bottling is already committed to (≤ 0 means it's covered). */
export function dealShortfallPerDay(s: GameState, o: Order): number {
  const perDay = o.qty / ORDER_TIERS.deal.days;
  const committed = s.orders.filter((x) => x.tier !== 'local').reduce((a, x) => a + bottlesLeft(x) / Math.max(1, x.due - s.day), 0);
  const r = orderRecipe(o);
  const spare = bottlesOf(s, r) - s.orders.filter((x) => x.tier !== 'local' && orderRecipe(x) === r).reduce((a, x) => a + bottlesLeft(x), 0);
  return Math.ceil(perDay + committed - bottlingCapacity(s) - Math.max(0, spare) / ORDER_TIERS.deal.days);
}

/** Bottles an order still has to load. */
export const bottlesLeft = (o: Order) => Math.max(0, o.qty - (o.loaded ?? 0));
/** Bottles the accepted orders still need. */
export const bottlesNeeded = (s: GameState) => s.orders.filter((o) => o.tier !== 'local').reduce((a, o) => a + bottlesLeft(o), 0);

// ---------- pickups ----------

export interface Pickup { order: Order; ok: boolean; raid?: BattleReport }

type Line = 'helipad' | 'pier';
const lineOf = (f: Facility): Line | null => (f.kind === 'helipad' || f.kind === 'pier' ? f.kind : null);

/** The minutes a facility's clients land or dock to load, each opening a 2-hour window: one trip a day, two at a Heliport. */
export function tripMinutes(f: Facility): number[] {
  const line = lineOf(f);
  if (!line) return [];
  const at = PICKUP_MINUTE[line === 'helipad' ? 'heli' : 'ship'];
  return Array.from({ length: TRIPS_PER_DAY[line][f.level - 1] ?? 1 }, (_, i) => at + i * DELIVERY_WINDOW);
}
/** What one trip can load: the facility's daily rate, split over its trips. */
export function tripLoad(f: Facility): number {
  const line = lineOf(f);
  return line ? Math.floor((LOADING_PER_DAY[line][f.level - 1] ?? 0) / (TRIPS_PER_DAY[line][f.level - 1] ?? 1)) : 0;
}

/** A Supply Deal's first day (its last load is due 28 days on). */
const dealStart = (o: Order) => o.due - ORDER_TIERS.deal.days;
const dealWeek = (o: Order) => ORDER_TIERS.deal.days / (o.loads ?? 1);
/** Bottles an order must have loaded by the end of a day: all of them on its deadline; a Supply Deal's loads one a week. */
export function owedBy(o: Order, day: number): number {
  if (!o.loads) return day >= o.due ? o.qty : 0;
  const weeks = Math.min(o.loads, Math.floor((day - dealStart(o)) / dealWeek(o)));
  return weeks > 0 ? Math.round((o.qty * weeks) / o.loads) : 0;
}
/** How far an order may have loaded by a day: a Supply Deal ships this week's load, not next week's. */
function loadCap(o: Order, day: number): number {
  if (!o.loads) return o.qty;
  const week = Math.min(o.loads, Math.max(1, Math.ceil((day - dealStart(o)) / dealWeek(o))));
  return Math.round((o.qty * week) / o.loads);
}
/** The day the order's next bottles are due: its deadline, or the end of a Supply Deal's week. */
export function nextDue(o: Order, day: number): number {
  if (!o.loads) return o.due;
  return Math.min(o.due, dealStart(o) + Math.max(1, Math.ceil((day - dealStart(o)) / dealWeek(o))) * dealWeek(o));
}
/** The pay for the first n bottles (each pickup is paid for its own load; rounding never adds up to more than the order). */
const payFor = (o: Order, n: number) => Math.round((o.pay * n) / o.qty);

/** Called every game minute while open: at each facility's trip minutes its clients load, oldest order first, up to the
 * trip's load; Caterer Trucks and Local Orders go out at their minute. */
export function pickupsAt(s: GameState): Pickup[] {
  const out: Pickup[] = [];
  for (const line of ['pier', 'helipad'] as const) {
    for (const p of facilityPlots(s, line)) {
      const f = s.plots[p.id].facility!;
      if (!tripMinutes(f).includes(s.minute)) continue;
      let room = tripLoad(f);
      for (const o of s.orders.filter((x) => x.plot === p.id && isVip(x.tier) && x.due >= s.day && !s.heldPickups?.includes(x.id))) {
        if (room <= 0) break;
        const t = trip(s, o, room);
        if (!t) continue;
        out.push(t.pickup);
        room -= t.load;
      }
    }
  }
  for (const o of [...s.orders]) if (!isVip(o.tier) && o.due === s.day && PICKUP_MINUTE[o.tier] === s.minute) out.push(handOver(s, o));
  return out;
}

/** At closing: Local Orders and Caterer Trucks still due go out, and a VIP order short of what it owes by tonight (all of it
 * on its deadline, a Supply Deal's load at the end of each week) falls through. */
export function pickupsAtClose(s: GameState): Pickup[] {
  const out: Pickup[] = [];
  for (const o of [...s.orders]) {
    if (s.heldPickups?.includes(o.id)) continue; // a Delivery Raid is still out on its trip: that settles it first
    if (!isVip(o.tier)) { if (o.due <= s.day) out.push(handOver(s, o)); continue; }
    const owed = owedBy(o, s.day);
    if ((o.loaded ?? 0) < owed) out.push(failOrder(s, o, shortWhy(s, o, owed)));
  }
  return out;
}

/** One trip of an order (night.ts calls it again to settle a Delivery Raid's hold: the held load goes out, or the order
 * fails). Local Orders and Caterer Trucks go out in one go. */
export function deliver(s: GameState, o: Order): Pickup | null {
  if (!isVip(o.tier)) return handOver(s, o);
  const f = o.plot ? s.plots[o.plot].facility : undefined;
  return trip(s, o, f && !f.wrecked ? tripLoad(f) : 0)?.pickup ?? null;
}

/** The client loads up to `room` bottles, as many as are ready, and pays for them; the last load completes the order (a
 * helicopter order adds 0.2 star). A Delivery Raid rolled on the trip holds it until the raid is fought. */
function trip(s: GameState, o: Order, room: number): { pickup: Pickup; load: number } | null {
  const n = o.loading ?? Math.min(room, loadCap(o, s.day) - (o.loaded ?? 0), bottlesOf(s, orderRecipe(o)));
  if (n <= 0) return null;
  o.loading = n;
  const held = scheduleDeliveryRaid(s, o, (why) => failOrder(s, o, why)); // nights: a Delivery Raid is warned and fought on the clock
  if (held) return { pickup: held, load: n };
  delete o.loading;
  const before = o.loaded ?? 0;
  o.loaded = before + n;
  const pay = payFor(o, o.loaded) - payFor(o, before);
  stockBottles(s, orderRecipe(o), -n);
  s.cash = round2(s.cash + pay);
  s.today.revenue = round2(s.today.revenue + pay);
  s.lifetimeCups += n;
  const done = o.loaded >= o.qty;
  if (done) {
    s.orders = s.orders.filter((x) => x !== o);
    if (o.tier === 'heli') s.reputation = Math.min(5, Math.round((s.reputation + VIP_STAR_BONUS) * 100) / 100);
  }
  const tally = done ? (before ? ' Order complete!' : '') : ` ${o.loaded.toLocaleString('en-US')} of ${o.qty.toLocaleString('en-US')} loaded.`;
  s.news.push(`${o.client} picks up ${n.toLocaleString('en-US')} bottles: ${money(pay)}!${tally}`);
  return { pickup: { order: o, ok: true }, load: n };
}

/** Delivery Raid overran the trip (night.ts): the raiders make off with the bottles being loaded. */
export function loseLoad(s: GameState, o: Order): void {
  stockBottles(s, orderRecipe(o), -(o.loading ?? bottlesLeft(o)));
  delete o.loading;
}

/** Why a VIP order fell short at closing. */
function shortWhy(s: GameState, o: Order, owed: number): string {
  const ps = o.plot ? s.plots[o.plot] : undefined;
  const where = o.tier === 'heli' ? 'helipad' : 'pier';
  if (!ps?.facility || ps.owner !== 'player') return `The ${where} is gone.`;
  if (ps.facility.wrecked) return `The ${where} was smashed.`;
  return `Only ${(o.loaded ?? 0).toLocaleString('en-US')} of ${owed.toLocaleString('en-US')} bottles were loaded in time.`;
}

/** A failed or overrun order: 0.3 star, once, and the pay for the bottles not yet loaded; earlier pickups stay paid (a
 * Supply Deal's later loads go with it). */
function failOrder(s: GameState, o: Order, why: string): Pickup {
  s.orders = s.orders.filter((x) => x !== o);
  delete o.loading;
  s.reputation = Math.max(1, Math.round((s.reputation - FAILED_ORDER_STARS) * 100) / 100);
  const unpaid = o.pay - payFor(o, o.loaded ?? 0);
  s.news.push(`Order fell through: ${o.client}. ${why} (−${FAILED_ORDER_STARS} star${o.loaded ? `, ${money(unpaid)} unpaid` : ''})`);
  return { order: o, ok: false };
}

/** Local Orders and Caterer Trucks: the whole order in one go. */
function handOver(s: GameState, o: Order): Pickup {
  if (o.tier === 'local') {
    const st = playerStands(s).map((p) => s.plots[p.id].stand!).find((x) => x.level >= 3 && !x.wrecked);
    if (!st) return failOrder(s, o, 'No working Kiosk to make it.');
    s.orders = s.orders.filter((x) => x !== o);
    const cost = round2(o.qty * costPerCup(s, st));
    s.cash = round2(s.cash - cost + o.pay);
    s.today.supplies = round2(s.today.supplies + cost);
    s.today.revenue = round2(s.today.revenue + o.pay);
    s.news.push(`Delivered ${o.qty} cups to ${o.client}: ${money(o.pay)}!`);
    return { order: o, ok: true };
  }
  const ready = bottlesOf(s, orderRecipe(o));
  if (ready < o.qty) return failOrder(s, o, `Only ${ready.toLocaleString('en-US')} of ${o.qty.toLocaleString('en-US')} bottles were ready.`);
  s.orders = s.orders.filter((x) => x !== o);
  stockBottles(s, orderRecipe(o), -o.qty);
  o.loaded = o.qty;
  s.cash = round2(s.cash + o.pay);
  s.today.revenue = round2(s.today.revenue + o.pay);
  s.lifetimeCups += o.qty;
  s.news.push(`${o.client} picks up ${o.qty.toLocaleString('en-US')} bottles: ${money(o.pay)}!`);
  return { order: o, ok: true };
}
