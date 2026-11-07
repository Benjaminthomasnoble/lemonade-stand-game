// Milestone 5: big orders and VIP clients (canon section 15). Local Orders
// from L3 stands, Caterer Trucks, Helicopter VIPs on a Field helipad and Ship
// Contracts at a Dock pier, with Bottling Works making the bottles.
import { BILLBOARD, BRAND_TIERS, CLUBHOUSE, CLUBHOUSE_HP, CUP_COST, CUPS_PER_PITCHER, DELIVERY_WINDOW, FACTIONS, RANKS, RECIPES, type RecipeId, type RivalId } from './balance.ts';
import type { BattleReport } from './crew.ts';
import { scheduleDeliveryRaid } from './night.ts';
import { PLOT_BY_ID, PLOTS, type PlotType } from './map.ts';
import { FIZZCO_PLANT, hasTrophy } from './rivals.ts';
import { nextRandom, type Rng } from './rng.ts';
import type { Blocker, GameState } from './economy.ts';
import { costPerCup, pitcherNeeds, playerStands, stock, useLemons } from './economy.ts';
import { iceMachineOn, machineIce } from './happenings.ts';
import { book, useStock } from './ledger.ts'; // the Ledger: each cash movement on its row
import { buildingInvested, restoreHp } from './damage.ts';
import { isPremium, ownedRecipes, ownsRecipe, premiumPages, recipeCost, worldOf } from './recipes.ts';
import { rivalStars } from './demand.ts';
import { perkActive } from './land.ts'; // land: the Full Control perks
import { festivalDays, festivalsOn, yearOf } from './calendar.ts';

export type FacilityKind = 'bottling' | 'helipad' | 'pier' | 'grove' | 'clubhouse' | 'billboard';
export type OrderTier = 'local' | 'caterer' | 'heli' | 'ship' | 'deal' | 'mega';
/** Tiers delivered by sea (a ship scene at the pier): a Mega Contract's freighters load at the Cargo Terminal too. */
export const bySea = (t: OrderTier) => t === 'ship' || t === 'deal' || t === 'mega';
/** VIP tiers: a chopper or a ship comes to your facility. */
export const isVip = (t: OrderTier) => t === 'heli' || bySea(t);
/** The tiers whose clients call at least every 10 days once their facility stands (a Mega client calls about 1 in 20). */
export const hasFloor = (t: OrderTier): t is FloorTier => t === 'heli' || t === 'ship' || t === 'deal';
type FloorTier = 'heli' | 'ship' | 'deal';

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
  reserved?: boolean; // those bottles came out of stock when the hold began (older saves' holds: they come out at the end)
  loads?: number; // a Supply Deal: its weekly loads, each due a week after the last
  recipe?: RecipeId; // what the client wants bottled (older orders: Classic); a Local Order pours its stand's card
  bid?: OrderBid; // an offer a rival bids for too: the client weighs both when you take it
}

/** A rival's bid for the same contract: its price and the days it needs to deliver. */
export interface OrderBid { rival: RivalId; pay: number; days: number }

// ---------- tunables (starting values; the balance thread replaces these) ----------

export const FACILITIES: Record<FacilityKind, { hp: number[]; names: string[]; costs: number[]; ranks: number[]; on: PlotType[]; blurb: string[] }> = {
  // hp: how much chopping it takes to knock down (Knock it down, buy it up).
  bottling: { hp: [1000, 2500, 6000], names: ['Bottling Works', 'Bottling Works L2', 'Bottling Works L3'], costs: [25000, 100000, 400000], ranks: [5, 6, 7], on: ['industrial'], blurb: ['1,500 bottles a day', '4,000 bottles a day', '12,000 bottles a day'] },
  helipad: { hp: [800, 2000, 5000], names: ['Pad', 'Helipad', 'Heliport'], costs: [50000, 200000, 800000], ranks: [6, 7, 8], on: ['field'], blurb: ['Small choppers: 2,000–4,000 bottles', '4,000–7,000 bottles', 'Big choppers: 7,000–10,000 bottles'] },
  grove: { hp: [800], names: ['Lemon Grove'], costs: [25000], ranks: [5], on: ['field'], blurb: ['+5% foot traffic at all your stands (up to 2 Groves)'] },
  pier: { hp: [1500, 3500, 8000], names: ['Jetty', 'Pier', 'Cargo Terminal'], costs: [250000, 750000, 3000000], ranks: [7, 7, 8], on: ['dock'], blurb: ['Yachts: 10,000–20,000 bottles', 'Cruise ships: 20,000–40,000 bottles', 'Freighters: 40,000–60,000 bottles'] },
  // The crew's beds (combat: clubhouse.ts). Several allowed, each upgrading on its own.
  clubhouse: { hp: CLUBHOUSE_HP, names: ['Clubhouse', 'Clubhouse L2', 'Clubhouse L3'], costs: CLUBHOUSE.map((c) => c.cost), ranks: CLUBHOUSE.map((c) => c.rank), on: ['street'], blurb: CLUBHOUSE.map((c) => `${c.beds} beds for guards`) },
  // demand: your stands within 2 plots +20% traffic, rival stands there −10% appeal (marketing.ts). Needs M4 too.
  billboard: { hp: [BILLBOARD.hp], names: ['Billboard'], costs: [BILLBOARD.cost], ranks: [BILLBOARD.rank], on: ['street', 'prime', 'landmark'], blurb: ['+20% foot traffic at your stands within 2 plots; rival stands there −10% appeal'] },
};
export const BOTTLES_PER_DAY = [1500, 4000, 12000];
/** The bottle and cap that take the cup's place (balance-tables: Supplies). */
export const BOTTLE_CAP = 0.15;
/** A bottle: the recipe's ingredients at today's Market plus the bottle and cap (Classic about $0.31: $0.16 + $0.15). */
export const bottleCost = (s: GameState, recipe: RecipeId = 'classic') => recipeCost(s, recipe) - CUP_COST + BOTTLE_CAP;
/** The recipe an order is bottled in: the client's pick (orders from before recipes: Classic). */
export const orderRecipe = (o: Order): RecipeId => o.recipe ?? 'classic';

/** Bottles on hand at cost, for the Success Score's stock (spec: "stock at cost"): each recipe at what a bottle of it
 * costs to fill today. */
export function bottleValue(s: GameState): number {
  return (Object.keys(RECIPES) as RecipeId[]).reduce((a, r) => a + bottlesOf(s, r) * bottleCost(s, r), 0);
}

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
/** Pay is per bottle (Local Orders: 1.5× that stand's cup price). Chance: the daily chance a client calls. The tiers with
 * the 10-day floor (VIP_MAX_GAP) have theirs solved so the mean gap, floor and all, is the spec's: (1 − (1 − p)^10) / p
 * comes to 2.95 days for a chopper (about 3), 5.0 for a ship and 7.0 for a Supply Deal. */
export const ORDER_TIERS: Record<OrderTier, { rank: number; stars: number; size: [number, number]; pay: number; days: number; chance: number; label: string }> = {
  local: { rank: 3, stars: 0, size: [300, 1500], pay: 1.5, days: 2, chance: 0.5, label: 'Local Order' },
  caterer: { rank: 5, stars: 0, size: [1000, 5000], pay: 6, days: 3, chance: 0.4, label: 'Caterer Truck' }, // about 2 per 5 days
  heli: { rank: 6, stars: 3.5, size: [2000, 10000], pay: 30, days: 4, chance: 1 / 3, label: 'Helicopter VIP' },
  ship: { rank: 7, stars: 4.0, size: [10000, 60000], pay: 40, days: 7, chance: 0.168, label: 'Ship Contract' }, // 1 in 5 a day made it 4.5
  deal: { rank: 8, stars: 4.0, size: [200000, 200000], pay: 30, days: 28, chance: 0.082, label: 'Supply Deal' }, // 1 in 7 made it 5.5
  // The stretch tier: a Heliport, a Cargo Terminal and 2 premium recipes too (tierOpen). Its freighters load at the Cargo
  // Terminal, 25,000 a day, so the 14 days are about bottling: 150,000 bottles need about 10,700 a day.
  mega: { rank: 9, stars: 4.5, size: [100000, 150000], pay: 100, days: 14, chance: 1 / 20, label: 'Mega Contract' },
};
/** Premium pages a Mega Contract needs in Lottie's book (any won or recovered page beyond Classic, Pink, Mint and Strawberry). */
export const MEGA_PREMIUM_PAGES = 2;
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
/** Rival bids for VIP contracts (spec: VIP clients, "Rivals also bid for contracts, and the client weighs price, delivery
 * time and Reputation; FizzCo, with the Harbor's Docks and bottling plant, bids hardest"). Placeholders, as the spec gives
 * no numbers: the chance each rival bids on a VIP offer, how far under the client's price it goes, the share of the
 * order's window it needs to deliver, and the share of its price it keeps when the job goes to it. */
export const RIVAL_BID = { chance: 0.15, under: 0.05, window: 0.75, margin: 0.05 };
/** FizzCo's bid while it holds the Harbor bottling plant (without it, FizzCo bids like the rest). */
export const FIZZCO_BID = { chance: 0.5, under: 0.15, window: 0.25 };
/** How the client weighs a bid, in stars: its Reputation, a star for each 10% under the client's price, a quarter star
 * off for each day it takes. */
export const BID_WEIGHTS = { tenPercent: 1, day: 0.25 };
/** District perks at Full Control (spec: district perks): Shipping Lane (The Harbor) adds 15% to Ship Contract pay, at
 * each pickup; Old Money (Hilltop) brings VIP offers 50% more often. */
export const SHIPPING_LANE = 0.15;
export const OLD_MONEY_OFFERS = 1.5;
/** Old Money's daily chance for the tiers with the 10-day floor: 50% more calls means gaps a third shorter (2, 3.3 and
 * 4.7 days), and with the floor that takes more than 1.5x the base chance. A Mega client, with no floor, calls
 * OLD_MONEY_OFFERS times as often. */
export const OLD_MONEY_CHANCE: Record<FloorTier, number> = { heli: 0.5, ship: 0.29, deal: 0.187 };
/** Harbor Fest's VIP rush (spec: "extra helicopter and ship offers every Fall"): on each of its days the chance a chopper
 * or a ship client calls (placeholder: the spec gives no number). */
export const HARBOR_FEST_CHANCE = 1;
/** Once a facility tier stands, its client type offers a job at least this often. */
export const VIP_MAX_GAP = 10;
/** A Supply Deal ships in weekly loads (4 of 50,000 bottles). */
export const DEAL_LOADS = 4;
export const GROVE_TRAFFIC = 0.05;
export const MAX_GROVES = 2;
/** Pickup minute: choppers at 5:30 pm, in the golden hour (spec mood scene "The first helicopter"), ships at 10 am (each
 * opens a 2-hour window), a Local Order's cups an hour before closing (while the stand's ice is still in the cooler),
 * Caterer Trucks at closing. */
export const PICKUP_MINUTE: Record<OrderTier, number> = { local: 19 * 60, caterer: 20 * 60, heli: 17 * 60 + 30, ship: 10 * 60, deal: 10 * 60, mega: 10 * 60 };

const CLIENTS: Record<OrderTier, string[]> = {
  local: ['the Maple Row Block Party', 'Little League Opening Day', 'the Old Town Bake Sale', 'the Campus Book Fair', 'a Fire Station Open House'],
  caterer: ['Bayside Catering Co.', 'Dot\'s Diner (big weekend)', 'the Hilltop Garden Club', 'Harbor Fest Food Tent'],
  heli: ['a movie star\'s pool party', 'a tech mogul\'s rooftop launch', 'a celebrity wedding', 'the music festival VIP tent', 'the Governor\'s Gala'],
  deal: ['Gulfstream Grocers', 'the Tri-County School Board', 'Cruise Line Provisioning Co.', 'the Bayside Ballpark'],
  ship: ['the Citrine Bay Regatta', 'the S.S. Sunny Disposition (cruise line)', 'an overseas export deal', 'the Bay Centennial flotilla'],
  mega: ["the Governor's Gala", 'the Bay Centennial', "the Tri-County World's Fair", 'a royal yacht wedding'],
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

/**
 * A Lemon Grove of yours makes way for the helipad line: a Field holds one building, and Hollis's Fields come with
 * Groves (so a Field bought out from Tilly can still take a Pad). A Wrecked Grove is rebuilt first (canBuildFacility).
 */
export function replacesGrove(s: GameState, plotId: string, kind: FacilityKind): boolean {
  const ps = s.plots[plotId];
  return kind === 'helipad' && ps?.owner === 'player' && ps.facility?.kind === 'grove';
}

export function canBuildFacility(s: GameState, plotId: string, kind: FacilityKind): Blocker {
  const p = PLOT_BY_ID[plotId];
  const ps = s.plots[plotId];
  const f = FACILITIES[kind];
  if (ps.owner !== 'player') return { ok: false, why: 'Buy the plot first' };
  if (!f.on.includes(p.type)) return { ok: false, why: `Needs a ${f.on.join(' or ')} plot` };
  if (ps.stand) return { ok: false, why: 'A stand is here' };
  if (ps.facility && ps.facility.kind !== kind && !replacesGrove(s, plotId, kind)) return { ok: false, why: 'Something else is built here' };
  if (ps.facility?.wrecked) return { ok: false, why: 'Rebuild it first' };
  const lvl = ps.facility?.kind === kind ? ps.facility.level : 0;
  if (lvl >= f.names.length) return { ok: false, why: 'Top level' };
  if (kind === 'grove' && !lvl && PLOTS.filter((q) => s.plots[q.id].owner === 'player' && s.plots[q.id].facility?.kind === 'grove').length >= MAX_GROVES) return { ok: false, why: `Up to ${MAX_GROVES} Lemon Groves` };
  if (s.rank < f.ranks[lvl]) return { ok: false, why: `Needs Rank ${f.ranks[lvl]}, ${RANKS[f.ranks[lvl] - 1].title}` };
  if (kind === 'billboard' && s.brandTier < BILLBOARD.brandTier) return { ok: false, why: `Needs M${BILLBOARD.brandTier}, ${BRAND_TIERS[BILLBOARD.brandTier - 1].name}` }; // demand
  if (s.phase === 'open') return { ok: false, why: 'Build after closing or at Morning Prep' };
  if (s.cash < f.costs[lvl]) return { ok: false, why: `Needs ${money(f.costs[lvl])}` };
  return { ok: true };
}

export function buildFacility(s: GameState, plotId: string, kind: FacilityKind): boolean {
  if (!canBuildFacility(s, plotId, kind).ok) return false;
  const ps = s.plots[plotId];
  const swap = replacesGrove(s, plotId, kind);
  const lvl = ps.facility?.kind === kind ? ps.facility.level : 0;
  const cost = FACILITIES[kind].costs[lvl];
  book(s, 'invested', -cost);
  if (swap) ps.invested = Math.max(0, ps.invested - buildingInvested(ps)); // the Grove leaves the books; its fence stays
  ps.invested += cost;
  restoreHp(s, plotId); // the new tier comes up at full HP; a repair queued for the old one is paid back (damage.ts)
  ps.facility = { kind, level: lvl + 1 };
  s.news.push(`${FACILITIES[kind].names[lvl]} opens at ${PLOT_BY_ID[plotId].name}!${swap ? ' The Lemon Grove makes way.' : ''}${kind === 'helipad' ? ' The rich folks can fly in now.' : kind === 'pier' ? ' Ships can dock for your lemonade.' : kind === 'grove' ? ' Grown in Citrine Bay: more folks stop by every stand.' : ''}`);
  if (kind === 'pier') firstDeal(s);
  return true;
}

/** The first Supply Deal is offered the day the Cargo Terminal opens, not at the next dawn (later ones come about 1 in 7
 * days, never more than 10 apart: vipAtDawn). */
function firstDeal(s: GameState): void {
  if (s.lastOffer?.deal !== undefined || !tierOpen(s, 'deal').ok) return;
  const rng = { seed: s.seed };
  makeOffer(s, 'deal', rng);
  s.seed = rng.seed;
}

export const bottlingCapacity = (s: GameState) => Math.round(facilityPlots(s, 'bottling').reduce((a, p) => a + BOTTLES_PER_DAY[s.plots[p.id].facility!.level - 1], 0) * (hasTrophy(s, 'fizzco') ? 1.25 : 1));

// ---------- offers ----------

export function tierOpen(s: GameState, tier: OrderTier): Blocker {
  const t = ORDER_TIERS[tier];
  if (s.rank < t.rank) return { ok: false, why: `Rank ${t.rank}` };
  if (s.reputation < t.stars) return { ok: false, why: `${t.stars.toFixed(1)} stars` };
  if (tier === 'local' && !kiosks(s).length) return { ok: false, why: 'an L3 Kiosk' };
  if (tier === 'caterer' && !facilityPlots(s, 'bottling').length) return { ok: false, why: 'a Bottling Works' };
  if (tier === 'heli' && !facilityPlots(s, 'helipad').length) return { ok: false, why: 'a Helipad on a Field plot' };
  if (tier === 'ship' && !facilityPlots(s, 'pier').length) return { ok: false, why: 'a Pier on a Dock plot' };
  if ((tier === 'deal' || tier === 'mega') && bestLevel(s, 'pier') < 3) return { ok: false, why: 'a Cargo Terminal' };
  if (tier === 'mega' && bestLevel(s, 'helipad') < 3) return { ok: false, why: 'a Heliport' };
  if (tier === 'mega' && premiumPages(s) < MEGA_PREMIUM_PAGES) return { ok: false, why: `${MEGA_PREMIUM_PAGES} premium recipes` };
  return { ok: true };
}

/** The facility of a line with the highest tier (the first such): its orders come in its sizes and load at its rate. */
function bestFacility(s: GameState, kind: 'helipad' | 'pier'): string | undefined {
  const lvl = bestLevel(s, kind);
  return facilityPlots(s, kind).find((p) => s.plots[p.id].facility!.level === lvl)?.id;
}

/** Your working L3+ stands: each can take Local Orders. */
const kiosks = (s: GameState) => playerStands(s).filter((p) => s.plots[p.id].stand!.level >= 3 && !s.plots[p.id].stand!.wrecked).map((p) => p.id);

function rollOffer(s: GameState, tier: OrderTier, rng: Rng): Order {
  const t = ORDER_TIERS[tier];
  const [lo, hi] = tier === 'heli' ? HELI_SIZES[bestLevel(s, 'helipad') - 1] : tier === 'ship' ? SHIP_SIZES[bestLevel(s, 'pier') - 1] : t.size;
  const qty = Math.round((lo + (hi - lo) * nextRandom(rng)) / 100) * 100;
  // A Local Order goes to one L3+ stand: it pays 1.5x that stand's price and is poured from its stock.
  const ks = tier === 'local' ? kiosks(s) : [];
  const local = ks.length ? ks[Math.floor(nextRandom(rng) * ks.length)] : undefined;
  const stand = local ? s.plots[local].stand! : undefined;
  const unit = stand ? stand.price * t.pay : t.pay;
  const plot = tier === 'heli' ? bestFacility(s, 'helipad') : bySea(tier) ? bestFacility(s, 'pier') : local;
  const clients = CLIENTS[tier];
  const o: Order = {
    id: `o${s.nextId++}`, tier, client: clients[Math.floor(nextRandom(rng) * clients.length)], qty,
    pay: Math.round(qty * unit), due: s.day + t.days, expires: s.day + 1, plot, accepted: false,
  };
  if (stand) o.recipe = stand.recipe; // the stand's card
  else { // any recipe in Lottie's book (spec: a Bottling Works fills bottles of any recipe you own); a Mega client, a premium one
    const owned = ownedRecipes(s), premium = owned.filter(isPremium);
    const book = tier === 'mega' && premium.length ? premium : owned;
    o.recipe = book[Math.floor(nextRandom(rng) * book.length)];
  }
  if (isVip(tier)) rollBid(s, o, rng);
  return o;
}

/** FizzCo bids hardest while its Harbor bottling plant stands. */
const fizzcoPlant = (s: GameState) => {
  const ps = s.plots[FIZZCO_PLANT];
  return ps?.owner === 'fizzco' && ps.facility?.kind === 'bottling' && !ps.facility.wrecked;
};
const bidTerms = (s: GameState, r: RivalId) => (r === 'fizzco' && fizzcoPlant(s) ? { ...RIVAL_BID, ...FIZZCO_BID } : RIVAL_BID);
/** A bidder's Reputation: the rival's own stars (demand.ts). */
export const rivalBidStars = (s: GameState, r: RivalId) => rivalStars(s, r);
/** A live bid: its rival is still in business. */
export const liveBid = (s: GameState, o: Order) => (o.bid && s.rivals[o.bid.rival]?.alive ? o.bid : undefined);

/** What the client makes of a bid, in stars: Reputation, plus its price under the client's, less the days it takes. */
export function bidValue(o: Order, stars: number, pay: number, days: number): number {
  return stars + BID_WEIGHTS.tenPercent * 10 * (1 - pay / o.pay) - BID_WEIGHTS.day * days;
}

/** Days you'd take to load an offer, counting today: your facility's daily rate, your spare bottles of its recipe, and
 * what bottling adds each dawn (past its window: one day late). A Supply Deal ships on its weekly schedule whoever has it. */
export function yourDays(s: GameState, o: Order): number {
  const window = ORDER_TIERS[o.tier].days;
  if (o.tier === 'deal') return window;
  const f = o.plot ? s.plots[o.plot]?.facility : undefined;
  const line = f && !f.wrecked ? lineOf(f) : null;
  const rate = line ? LOADING_PER_DAY[line][f!.level - 1] ?? 0 : 0;
  const r = orderRecipe(o);
  const spare = bottlesOf(s, r) - s.orders.filter((x) => x.tier !== 'local' && orderRecipe(x) === r).reduce((a, x) => a + bottlesLeft(x), 0);
  const make = ownsRecipe(s, r) ? bottlingCapacity(s) : 0;
  for (let k = 1; k <= window; k++) if (Math.min(k * rate, Math.max(0, spare) + (k - 1) * make) >= o.qty) return k;
  return window + 1;
}

/** Rivals bid for a VIP offer: each that's in business may, and the client keeps the strongest bid. */
function rollBid(s: GameState, o: Order, rng: Rng): void {
  let best: OrderBid | undefined, top = -Infinity;
  for (const r of Object.keys(FACTIONS) as RivalId[]) {
    if (!s.rivals[r]?.alive) continue;
    const t = bidTerms(s, r);
    if (nextRandom(rng) >= t.chance) continue;
    const days = o.tier === 'deal' ? ORDER_TIERS.deal.days : Math.max(1, Math.ceil(ORDER_TIERS[o.tier].days * t.window));
    const bid: OrderBid = { rival: r, pay: Math.round(o.pay * (1 - t.under)), days };
    const v = bidValue(o, rivalBidStars(s, r), bid.pay, bid.days);
    if (v > top) { best = bid; top = v; }
  }
  if (best) o.bid = best;
}

/** An offer with a rival's bid leaves the book without you (lost, turned down or let go): the rival does the job and keeps
 * its margin. No star is lost. */
function rivalTakesJob(s: GameState, o: Order): void {
  const b = liveBid(s, o);
  if (b) s.rivals[b.rival].cash = Math.round((s.rivals[b.rival].cash + b.pay * RIVAL_BID.margin) * 100) / 100;
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
    book(s, 'bottling', -round2(make * cost)); // the Ledger's Bottling row, at today's cost
  }
  for (const o of s.offers) if (o.expires < s.day) rivalTakesJob(s, o); // an offer let go: a rival who bid does the job
  s.offers = s.offers.filter((o) => o.expires >= s.day);
  const last = (s.lastOffer ??= {});
  for (const tier of Object.keys(ORDER_TIERS) as OrderTier[]) {
    if (!tierOpen(s, tier).ok) { delete last[tier]; continue; }
    // VIP tiers: the first Supply Deal comes as soon as the Cargo Terminal stands, and no chopper, ship or Supply Deal client
    // goes 10 days without a call (Mega clients have no floor: about 1 in 20 days).
    if (hasFloor(tier) && last[tier] === undefined && tier !== 'deal') last[tier] = s.day;
    const due = hasFloor(tier) && (last[tier] === undefined || s.day - last[tier]! >= VIP_MAX_GAP);
    if (!due && nextRandom(rng) >= offerChance(s, tier)) continue;
    makeOffer(s, tier, rng);
  }
  s.seed = rng.seed;
}

/** How likely a tier's client calls at dawn (spec: Offers, about 1 per 2 / 2.5 / 3 / 5 / 7 / 20 days, the 10-day floor
 * included): VIP clients 50% more often with Old Money (OLD_MONEY_CHANCE), and choppers and ships every day of Harbor Fest. */
export function offerChance(s: GameState, tier: OrderTier): number {
  const base = !isVip(tier) || !oldMoney(s) ? ORDER_TIERS[tier].chance : hasFloor(tier) ? OLD_MONEY_CHANCE[tier] : ORDER_TIERS[tier].chance * OLD_MONEY_OFFERS;
  return (tier === 'heli' || tier === 'ship') && harborFestOn(s) ? Math.max(base, HARBOR_FEST_CHANCE) : base;
}

/** The Harbor's perk, Shipping Lane: live while you hold every plot there (land's perkActive). */
export const shippingLane = (s: GameState) => perkActive(s, 'shippingLane');
/** Hilltop's perk, Old Money: live while you hold every plot there (land's perkActive). */
export const oldMoney = (s: GameState) => perkActive(s, 'oldMoneyVip');
/** Harbor Fest runs today: the Fall VIP rush. */
export const harborFestOn = (s: GameState) => festivalsOn(s.day).includes('harborFest');
/** Act 5's Harbor Fest (spec: "choppers and ships queue for the Fall VIP rush while Syndicate crews go after every
 * delivery"): once the Syndicate has formed, a Syndicate crew tries a Delivery Raid on every VIP pickup during the Fest,
 * with the usual warning, in place of the usual 30% at Threat 3+. Seam for nights: the Delivery Raid roll (night.ts
 * scheduleDeliveryRaid) passes syndicateFormed(s) and sends the crew; until the Syndicate exists nothing passes true. */
export const syndicateFestRaid = (s: GameState, o: Order, syndicateFormed: boolean) => syndicateFormed && isVip(o.tier) && harborFestOn(s);
/** Harbor Fest: every ship's horn plays Lottie's Theme, and Lottie swears she isn't humming along (spec: Act 5, Harbor
 * Fest). Her line for each day of the Fest, said at the day's first ship pickup. */
export const FEST_HUMS = [
  'Lottie: "Every horn in the harbor is honking my song. I am not humming along."',
  'Lottie: "That is not humming. That is the wind off the water."',
  'Lottie: "Fine. One hum. You tell nobody."',
];
/** A ship (or a Supply Deal's freighter) loads during Harbor Fest: Lottie's line for the day, once. */
function festHum(s: GameState): void {
  const w = worldOf(s);
  if (!harborFestOn(s) || w.humDay === s.day) return;
  w.humDay = s.day;
  s.news.push(FEST_HUMS[Math.min(s.day - festivalDays('harborFest', yearOf(s.day)).from, FEST_HUMS.length - 1)]);
}
/** A pickup's pay, with Shipping Lane's 15% on a Ship Contract (a Supply Deal keeps its $1.5M a load). */
const withLane = (s: GameState, o: Order, pay: number) => (o.tier === 'ship' && shippingLane(s) ? Math.round(pay * (1 + SHIPPING_LANE)) : pay);

/** A new offer in the Order Book. One left unanswered never holds the next back (each tier calls at its own rate), and
 * a full book lets its oldest offer go, a day early, to make room. */
function makeOffer(s: GameState, tier: OrderTier, rng: Rng): Order {
  const o = rollOffer(s, tier, rng);
  if (s.offers.length >= MAX_OFFERS) rivalTakesJob(s, s.offers.shift()!);
  s.offers.push(o);
  (s.lastOffer ??= {})[tier] = s.day;
  const bid = o.bid ? ` ${FACTIONS[o.bid.rival].name} bids ${money(o.bid.pay)}.` : '';
  if (tier === 'deal') s.news.push(`Supply Deal! ${o.client} wants ${o.qty.toLocaleString('en-US')} bottles over ${ORDER_TIERS.deal.days} days for ${money(o.pay)}, shipped weekly from your Cargo Terminal.${bid}`);
  else if (tier === 'mega') s.news.push(`Mega Contract! ${o.client} wants ${o.qty.toLocaleString('en-US')} bottles of ${RECIPES[orderRecipe(o)].label} in ${ORDER_TIERS.mega.days} days for ${money(o.pay)}, loaded at your Cargo Terminal.${bid}`);
  else if (isVip(tier)) s.news.push(`VIP call! ${o.client} wants ${o.qty.toLocaleString('en-US')} bottles for ${money(o.pay)}.${bid}`);
  return o;
}

/** Take an offer. When a rival bid for it too, the client weighs both bids: price, delivery time and Reputation (ties go
 * to you). `match` bids the rival's price. A lost bid costs no star: the job just goes to the rival. */
export function acceptOrder(s: GameState, id: string, match = false): boolean {
  const i = s.offers.findIndex((o) => o.id === id);
  if (i < 0) return false;
  const o = s.offers[i];
  const bid = liveBid(s, o);
  if (bid) {
    const price = match ? Math.min(o.pay, bid.pay) : o.pay;
    const you = bidValue(o, s.reputation, price, yourDays(s, o));
    const them = bidValue(o, rivalBidStars(s, bid.rival), bid.pay, bid.days);
    if (you < them) {
      s.offers.splice(i, 1);
      rivalTakesJob(s, o);
      const days = o.tier === 'deal' ? '' : `, ${bid.days} day${bid.days === 1 ? '' : 's'}`;
      s.news.push(`Lost the bid: ${o.client} went with ${FACTIONS[bid.rival].name} (${money(bid.pay)}${days}).`);
      return false;
    }
    s.news.push(`${o.client} picks you over ${FACTIONS[bid.rival].name}${price < o.pay ? ` at ${money(price)}` : ''}!`);
    o.pay = price;
  }
  delete o.bid;
  s.offers.splice(i, 1);
  o.accepted = true;
  if (o.tier === 'deal') o.loads = DEAL_LOADS; // weekly loads from the Cargo Terminal, paid at each pickup
  s.orders.push(o);
  return true;
}

export function declineOrder(s: GameState, id: string): void {
  for (const o of s.offers) if (o.id === id) rivalTakesJob(s, o);
  s.offers = s.offers.filter((o) => o.id !== id);
}

/** For a Supply Deal or a Mega Contract offer: bottles a day it needs on top of what bottling is already committed to (≤ 0
 * means it's covered). */
export function dealShortfallPerDay(s: GameState, o: Order): number {
  const perDay = o.qty / ORDER_TIERS[o.tier].days;
  const committed = s.orders.filter((x) => x.tier !== 'local').reduce((a, x) => a + bottlesLeft(x) / Math.max(1, x.due - s.day), 0);
  const r = orderRecipe(o);
  const spare = bottlesOf(s, r) - s.orders.filter((x) => x.tier !== 'local' && orderRecipe(x) === r).reduce((a, x) => a + bottlesLeft(x), 0);
  return Math.ceil(perDay + committed - bottlingCapacity(s) - Math.max(0, spare) / ORDER_TIERS[o.tier].days);
}

/** The long orders an offer card weighs against your bottling: a Supply Deal's 28 days, a Mega Contract's 14. */
export const paced = (o: Order) => o.tier === 'deal' || o.tier === 'mega';

/** Bottles an order still has to load. */
export const bottlesLeft = (o: Order) => Math.max(0, o.qty - (o.loaded ?? 0) - (o.reserved ? o.loading ?? 0 : 0)); // a held trip's are on the way
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
 * trip's load; a Local Order's stand pours its cups an hour before closing, each day until it's due. */
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
  for (const o of [...s.orders]) {
    if (o.tier === 'local') { if (s.minute === PICKUP_MINUTE.local && o.due >= s.day) { const p = pour(s, o); if (p) out.push(p); } continue; }
    if (!isVip(o.tier) && o.due === s.day && PICKUP_MINUTE[o.tier] === s.minute) out.push(handOver(s, o));
  }
  return out;
}

/** At closing: Caterer Trucks due today go out, and an order short of what it owes by tonight (all of it on its deadline, a
 * Supply Deal's load at the end of each week) falls through. */
export function pickupsAtClose(s: GameState): Pickup[] {
  const out: Pickup[] = [];
  for (const o of [...s.orders]) {
    if (s.heldPickups?.includes(o.id)) continue; // a Delivery Raid is still out on its trip: that settles it first
    if (o.tier === 'caterer') { if (o.due <= s.day) out.push(handOver(s, o)); continue; }
    const owed = owedBy(o, s.day);
    if ((o.loaded ?? 0) < owed) out.push(failOrder(s, o, o.tier === 'local' ? cupsWhy(s, o) : shortWhy(s, o, owed)));
  }
  return out;
}

/** One trip of an order (night.ts calls it again to settle a Delivery Raid's hold: the held load goes out, or the order
 * fails). A Local Order pours what its stand can; a Caterer Truck goes out in one go. */
export function deliver(s: GameState, o: Order): Pickup | null {
  if (o.tier === 'local') return pour(s, o);
  if (!isVip(o.tier)) return handOver(s, o);
  const f = o.plot ? s.plots[o.plot].facility : undefined;
  return trip(s, o, f && !f.wrecked ? tripLoad(f) : 0)?.pickup ?? null;
}

/** The client loads up to `room` bottles, as many as are ready, and pays for them; the last load completes the order (a
 * helicopter order adds 0.2 star). A Delivery Raid rolled on the trip holds it until the raid is fought: its bottles come
 * out of stock as the hold starts (nobody else loads them meanwhile), and go out, or go with the raiders, when it's over. */
function trip(s: GameState, o: Order, room: number): { pickup: Pickup; load: number } | null {
  const n = o.loading ?? Math.min(room, loadCap(o, s.day) - (o.loaded ?? 0), bottlesOf(s, orderRecipe(o)));
  if (n <= 0) return null;
  o.loading = n;
  const held = scheduleDeliveryRaid(s, o, (why) => failOrder(s, o, why)); // nights: a Delivery Raid is warned and fought on the clock
  if (held) {
    if (!o.reserved && s.heldPickups?.includes(o.id)) { stockBottles(s, orderRecipe(o), -n); o.reserved = true; }
    return { pickup: held, load: n };
  }
  const reserved = o.reserved; // taken out of stock when the hold began (an older save's hold takes them now)
  delete o.loading;
  delete o.reserved;
  const before = o.loaded ?? 0;
  o.loaded = before + n;
  const pay = withLane(s, o, payFor(o, o.loaded) - payFor(o, before));
  if (!reserved) stockBottles(s, orderRecipe(o), -n);
  book(s, 'orders', pay);
  s.today.revenue = round2(s.today.revenue + pay);
  s.lifetimeCups += n;
  const done = o.loaded >= o.qty;
  if (done) {
    s.orders = s.orders.filter((x) => x !== o);
    if (o.tier === 'heli') s.reputation = Math.min(5, Math.round((s.reputation + VIP_STAR_BONUS) * 100) / 100);
  }
  const tally = done ? (before ? ' Order complete!' : '') : ` ${o.loaded.toLocaleString('en-US')} of ${o.qty.toLocaleString('en-US')} loaded.`;
  s.news.push(`${o.client} picks up ${n.toLocaleString('en-US')} bottles: ${money(pay)}!${tally}`);
  if (o.tier !== 'heli') festHum(s); // the ship sails in tooting Lottie's Theme
  return { pickup: { order: o, ok: true }, load: n };
}

/** The last day a facility's trips can have `bottles` loaded: today's trips still to come first (all of them at Morning
 * Prep; mid-day, the ones from this minute on, since a minute's pickups run before its clock moves; none after closing),
 * then its daily rate. */
function lastLoadDay(s: GameState, f: Facility, rate: number, bottles: number): number {
  const trips = s.phase === 'prep' ? tripMinutes(f).length : s.phase === 'open' ? tripMinutes(f).filter((m) => m >= s.minute).length : 0;
  const today = trips * tripLoad(f);
  return bottles <= today ? s.day : s.day + Math.ceil((bottles - today) / rate);
}

/** Orders from older saves (the save version stays 8): a VIP order that names no recipe was taken when a whole order loaded
 * in one go on its deadline. It's Classic, and since a facility now loads its daily rate, its deadline moves out to the
 * first day its facility can have it all loaded, the orders ahead of it first, as the clients load. A Supply Deal in
 * weekly loads keeps its weeks. migrateWorld calls it on every load; idempotent (a migrated order names its recipe). */
export function migrateOrders(s: GameState): void {
  const legacy = new Set(s.orders.filter((o) => isVip(o.tier) && !o.recipe));
  const ahead: Record<string, number> = {}; // bottles still to load at each facility, oldest order first
  for (const o of s.orders) {
    const f = o.plot ? s.plots[o.plot]?.facility : undefined;
    const line = f ? lineOf(f) : null;
    if (!isVip(o.tier) || !o.plot || !f || !line) continue;
    ahead[o.plot] = (ahead[o.plot] ?? 0) + (o.loads ? Math.max(0, loadCap(o, s.day) - (o.loaded ?? 0)) : bottlesLeft(o));
    const rate = LOADING_PER_DAY[line][f.level - 1] ?? 0;
    if (!legacy.has(o) || o.loads || rate <= 0) continue;
    o.due = Math.max(o.due, lastLoadDay(s, f, rate, ahead[o.plot]));
  }
  for (const o of [...legacy, ...s.offers.filter((x) => isVip(x.tier) && !x.recipe)]) o.recipe = 'classic';
}

/** Delivery Raid overran the trip (night.ts): the raiders make off with the bottles being loaded (out of stock since the
 * hold began; an older save's hold takes them now). */
export function loseLoad(s: GameState, o: Order): void {
  if (!o.reserved) stockBottles(s, orderRecipe(o), -(o.loading ?? bottlesLeft(o)));
  delete o.loading;
  delete o.reserved;
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

/** The stand a Local Order is poured at (one from before Local Orders named a stand: your first working Kiosk). */
export const localStand = (s: GameState, o: Order) => o.plot ?? kiosks(s)[0];

/** A Local Order's cups, an hour before closing on each day until it's due: poured at its stand from the stand's own stock
 * (the pitcher on hand, then whole pitchers from its lemons and sugar, each cup with its ice, an ice machine making what
 * the cooler lacks), the cup and the card's extra paid as they go, and the client paying for each cup. The order goes in
 * the day's books, not the stand's till: a Shakedown takes a day of its walk-in profit (loot.ts). A Warehouse will top
 * the stand up (seam: no Warehouse on main yet). */
function pour(s: GameState, o: Order): Pickup | null {
  const plot = localStand(s, o);
  const ps = plot ? s.plots[plot] : undefined;
  const st = ps?.owner === 'player' ? ps.stand : null;
  if (!plot || !st || st.wrecked) return null;
  const n = pitcherNeeds(st);
  const ice = RECIPES[st.recipe].icePerCup;
  const pitchers = Math.min(Math.floor(stock(st, 'lemons') / n.lemons), n.sugar > 0 ? Math.floor(st.inventory.sugar / n.sugar) : Infinity);
  const cooler = iceMachineOn(s, plot) || ice <= 0 ? Infinity : Math.floor(st.inventory.ice / ice);
  const cups = Math.min(bottlesLeft(o), st.pitcherCups + pitchers * CUPS_PER_PITCHER, cooler);
  if (cups <= 0) return null;
  const mixed = Math.ceil(Math.max(0, cups - st.pitcherCups) / CUPS_PER_PITCHER);
  useLemons(st, mixed * n.lemons);
  st.inventory.sugar -= mixed * n.sugar;
  st.pitcherCups += mixed * CUPS_PER_PITCHER - cups; // what's left in the last pitcher sells as usual
  const made = machineIce(s, plot, st, cups * ice);
  st.inventory.ice = Math.max(0, st.inventory.ice - cups * ice);
  const cost = round2(cups * (CUP_COST + RECIPES[st.recipe].extraPerCup) + made);
  const before = o.loaded ?? 0;
  o.loaded = before + cups;
  const pay = payFor(o, o.loaded) - payFor(o, before);
  s.today.revenue = round2(s.today.revenue + pay);
  book(s, 'orders', pay);
  book(s, 'supplies', -cost, cups); // the cups, the card's extra and machine ice, paid as they pour (counted on the Supplies line)
  useStock(s, round2(cups * costPerCup(s, st) - cost)); // their lemons, sugar and ice, at the day's cost per cup
  s.lifetimeCups += cups;
  const done = o.loaded >= o.qty;
  if (done) s.orders = s.orders.filter((x) => x !== o);
  s.news.push(`${done && !before ? 'Delivered' : 'Poured'} ${cups.toLocaleString('en-US')} cups for ${o.client}: ${money(pay)}!${done ? '' : ` ${o.loaded.toLocaleString('en-US')} of ${o.qty.toLocaleString('en-US')} made.`}`);
  return { order: o, ok: true };
}

/** Why a Local Order fell short on its deadline. */
function cupsWhy(s: GameState, o: Order): string {
  const plot = localStand(s, o);
  const st = plot && s.plots[plot].owner === 'player' ? s.plots[plot].stand : null;
  if (!st) return 'Its stand is gone.';
  if (st.wrecked) return 'Its stand was smashed.';
  return `Only ${(o.loaded ?? 0).toLocaleString('en-US')} of ${o.qty.toLocaleString('en-US')} cups were made in time.`;
}

/** Caterer Trucks: the whole order in one go, at closing. */
function handOver(s: GameState, o: Order): Pickup {
  const ready = bottlesOf(s, orderRecipe(o));
  if (ready < o.qty) return failOrder(s, o, `Only ${ready.toLocaleString('en-US')} of ${o.qty.toLocaleString('en-US')} bottles were ready.`);
  s.orders = s.orders.filter((x) => x !== o);
  stockBottles(s, orderRecipe(o), -o.qty);
  o.loaded = o.qty;
  book(s, 'orders', o.pay);
  s.today.revenue = round2(s.today.revenue + o.pay);
  s.lifetimeCups += o.qty;
  s.news.push(`${o.client} picks up ${o.qty.toLocaleString('en-US')} bottles: ${money(o.pay)}!`);
  return { order: o, ok: true };
}
