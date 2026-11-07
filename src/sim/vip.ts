// Milestone 5: big orders and VIP clients (canon section 15). Local Orders
// from L3 stands, Caterer Trucks, Helicopter VIPs on a Field helipad and Ship
// Contracts at a Dock pier, with Bottling Works making the bottles.
import { RANKS } from './balance.ts';
import type { BattleReport } from './crew.ts';
import { scheduleDeliveryRaid } from './night.ts';
import { PLOT_BY_ID, PLOTS, type PlotType } from './map.ts';
import { hasTrophy } from './rivals.ts';
import { nextRandom, type Rng } from './rng.ts';
import type { Blocker, GameState } from './economy.ts';
import { costPerCup, playerStands } from './economy.ts';
import { restoreHp } from './damage.ts';

export type FacilityKind = 'bottling' | 'helipad' | 'pier' | 'grove';
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
}

// ---------- tunables (starting values; the balance thread replaces these) ----------

export const FACILITIES: Record<FacilityKind, { hp: number[]; names: string[]; costs: number[]; ranks: number[]; on: PlotType[]; blurb: string[] }> = {
  // hp: how much chopping it takes to knock down (Knock it down, buy it up).
  bottling: { hp: [1000, 2500, 6000], names: ['Bottling Works', 'Bottling Works L2', 'Bottling Works L3'], costs: [25000, 100000, 400000], ranks: [5, 6, 7], on: ['industrial'], blurb: ['1,500 bottles a day', '4,000 bottles a day', '12,000 bottles a day'] },
  helipad: { hp: [800, 2000, 5000], names: ['Pad', 'Helipad', 'Heliport'], costs: [50000, 200000, 800000], ranks: [6, 7, 8], on: ['field'], blurb: ['Small choppers: 2,000–4,000 bottles', '4,000–7,000 bottles', 'Big choppers: 7,000–10,000 bottles'] },
  grove: { hp: [800], names: ['Lemon Grove'], costs: [25000], ranks: [5], on: ['field'], blurb: ['+5% foot traffic at all your stands (up to 2 Groves)'] },
  pier: { hp: [1500, 3500, 8000], names: ['Jetty', 'Pier', 'Cargo Terminal'], costs: [250000, 750000, 3000000], ranks: [7, 7, 8], on: ['dock'], blurb: ['Yachts: 10,000–20,000 bottles', 'Cruise ships: 20,000–40,000 bottles', 'Freighters: 40,000–60,000 bottles'] },
};
export const BOTTLES_PER_DAY = [1500, 4000, 12000];
export const BOTTLE_COST = 0.21 + 0.15; // a Classic cup's ingredients plus the bottle and cap
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
export const VIP_STAR_BONUS = 0.2;
export const FAILED_ORDER_STARS = 0.3;
export const DELIVERY_RAID_THREAT = 3;
export const DELIVERY_RAID_CHANCE = 0.3;
export const MAX_OFFERS = 4;
/** Once a facility tier stands, its client type offers a job at least this often. */
export const VIP_MAX_GAP = 10;
/** A Supply Deal ships in weekly loads. */
export const DEAL_LOADS = 4;
export const GROVE_TRAFFIC = 0.05;
export const MAX_GROVES = 2;
/** Pickup minute: choppers at 2 pm, ships at 10 am. */
export const PICKUP_MINUTE: Record<OrderTier, number> = { local: 20 * 60, caterer: 20 * 60, heli: 14 * 60, ship: 10 * 60, deal: 10 * 60 };

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

function rollOffer(s: GameState, tier: OrderTier, rng: Rng): Order {
  const t = ORDER_TIERS[tier];
  const [lo, hi] = tier === 'heli' ? HELI_SIZES[bestLevel(s, 'helipad') - 1] : tier === 'ship' ? SHIP_SIZES[bestLevel(s, 'pier') - 1] : t.size;
  const terminal = facilityPlots(s, 'pier').find((p) => s.plots[p.id].facility!.level >= 3)?.id;
  const qty = Math.round((lo + (hi - lo) * nextRandom(rng)) / 100) * 100;
  const unit = tier === 'local' ? localPrice(s) * t.pay : t.pay;
  const days = t.days;
  const plot = tier === 'heli' ? facilityPlots(s, 'helipad')[0]?.id : tier === 'ship' ? facilityPlots(s, 'pier')[0]?.id : tier === 'deal' ? terminal : undefined;
  const clients = CLIENTS[tier];
  return {
    id: `o${s.nextId++}`, tier, client: clients[Math.floor(nextRandom(rng) * clients.length)], qty,
    pay: Math.round(qty * unit), due: s.day + days, expires: s.day + 1, plot, accepted: false,
  };
}

function localPrice(s: GameState): number {
  const stands = playerStands(s).map((p) => s.plots[p.id].stand!).filter((st) => st.level >= 3);
  return stands.length ? Math.max(...stands.map((st) => st.price)) : 1;
}

/** At dawn: production, expiring offers, new offers. */
export function vipAtDawn(s: GameState): void {
  const rng = { seed: s.seed };
  // Bottling runs only while an accepted order still needs bottles.
  const need = s.orders.filter((o) => o.tier !== 'local').reduce((a, o) => a + o.qty, 0) - s.bottles;
  if (need > 0) {
    const make = Math.min(need, bottlingCapacity(s), Math.floor(Math.max(0, s.cash) / BOTTLE_COST));
    if (make > 0) {
      s.bottles += make;
      s.cash = round2(s.cash - make * BOTTLE_COST);
      s.today.supplies = round2(s.today.supplies + make * BOTTLE_COST);
    }
  }
  s.offers = s.offers.filter((o) => o.expires >= s.day);
  const last = (s.lastOffer ??= {});
  for (const tier of Object.keys(ORDER_TIERS) as OrderTier[]) {
    if (!tierOpen(s, tier).ok) { delete last[tier]; continue; }
    if (s.offers.length >= MAX_OFFERS || s.offers.some((o) => o.tier === tier)) continue;
    // VIP tiers: the first Supply Deal comes as soon as the Cargo Terminal stands, and no VIP tier goes 10 days without a call.
    if (isVip(tier) && last[tier] === undefined && tier !== 'deal') last[tier] = s.day;
    const due = isVip(tier) && (last[tier] === undefined || s.day - last[tier]! >= VIP_MAX_GAP);
    const roll = nextRandom(rng);
    if (!due && roll >= ORDER_TIERS[tier].chance) continue;
    const o = rollOffer(s, tier, rng);
    s.offers.push(o);
    last[tier] = s.day;
    if (tier === 'deal') s.news.push(`Supply Deal! ${o.client} wants ${o.qty.toLocaleString('en-US')} bottles over ${ORDER_TIERS.deal.days} days for ${money(o.pay)}, shipped weekly from your Cargo Terminal.`);
    else if (isVip(tier)) s.news.push(`VIP call! ${o.client} wants ${o.qty.toLocaleString('en-US')} bottles for ${money(o.pay)}.`);
  }
  s.seed = rng.seed;
}

export function acceptOrder(s: GameState, id: string): boolean {
  const i = s.offers.findIndex((o) => o.id === id);
  if (i < 0) return false;
  const o = s.offers.splice(i, 1)[0];
  o.accepted = true;
  if (o.tier === 'deal') {
    // Weekly loads from the Cargo Terminal, paid at each pickup.
    for (let k = 1; k <= DEAL_LOADS; k++) {
      s.orders.push({ ...o, id: `${o.id}-${k}`, qty: Math.round(o.qty / DEAL_LOADS), pay: Math.round(o.pay / DEAL_LOADS), due: s.day + Math.round((ORDER_TIERS.deal.days / DEAL_LOADS) * k), client: `${o.client} (load ${k} of ${DEAL_LOADS})` });
    }
    return true;
  }
  s.orders.push(o);
  return true;
}

export function declineOrder(s: GameState, id: string): void {
  s.offers = s.offers.filter((o) => o.id !== id);
}

/** For a Supply Deal offer: bottles a day it needs on top of what bottling is already committed to (≤ 0 means it's covered). */
export function dealShortfallPerDay(s: GameState, o: Order): number {
  const perDay = o.qty / ORDER_TIERS.deal.days;
  const committed = s.orders.filter((x) => x.tier === 'deal').length / DEAL_LOADS * perDay
    + s.orders.filter((x) => x.tier !== 'local' && x.tier !== 'deal').reduce((a, x) => a + x.qty / Math.max(1, x.due - s.day), 0);
  return Math.ceil(perDay + committed - bottlingCapacity(s) - Math.max(0, s.bottles - bottlesNeeded(s)) / ORDER_TIERS.deal.days);
}

export const bottlesNeeded = (s: GameState) => s.orders.filter((o) => o.tier !== 'local').reduce((a, o) => a + o.qty, 0);

// ---------- pickups ----------

export interface Pickup { order: Order; ok: boolean; raid?: BattleReport }

/** Called every game minute while open: orders due today get picked up at their time. */
export function pickupsAt(s: GameState): Pickup[] {
  const out: Pickup[] = [];
  for (const o of [...s.orders]) {
    if (o.due !== s.day || PICKUP_MINUTE[o.tier] !== s.minute) continue;
    out.push(deliver(s, o));
  }
  return out;
}

/** Orders still due today at closing (local orders, and anything a mid-day pickup missed). */
export function pickupsAtClose(s: GameState): Pickup[] {
  return s.orders.filter((o) => o.due <= s.day).map((o) => deliver(s, o));
}

export function deliver(s: GameState, o: Order): Pickup {
  s.orders = s.orders.filter((x) => x !== o);
  const fail = (why: string): Pickup => {
    s.reputation = Math.max(1, Math.round((s.reputation - FAILED_ORDER_STARS) * 100) / 100);
    s.news.push(`Order fell through: ${o.client}. ${why} (−${FAILED_ORDER_STARS} star)`);
    return { order: o, ok: false };
  };
  if (o.tier === 'local') {
    const st = playerStands(s).map((p) => s.plots[p.id].stand!).find((x) => x.level >= 3 && !x.wrecked);
    if (!st) return fail('No working Kiosk to make it.');
    const cost = round2(o.qty * costPerCup(s, st));
    s.cash = round2(s.cash - cost + o.pay);
    s.today.supplies = round2(s.today.supplies + cost);
    s.today.revenue = round2(s.today.revenue + o.pay);
    s.news.push(`Delivered ${o.qty} cups to ${o.client}: ${money(o.pay)}!`);
    return { order: o, ok: true };
  }
  if (o.plot && s.plots[o.plot].facility?.wrecked) return fail(`The ${o.tier === 'heli' ? 'helipad' : 'pier'} was smashed.`);
  if (s.bottles < o.qty) return fail(`Only ${s.bottles.toLocaleString('en-US')} of ${o.qty.toLocaleString('en-US')} bottles were ready.`);
  const held = scheduleDeliveryRaid(s, o, fail); // nights: a Delivery Raid is warned and fought on the clock
  if (held) return held;
  s.bottles -= o.qty;
  s.cash = round2(s.cash + o.pay);
  s.today.revenue = round2(s.today.revenue + o.pay);
  if (o.tier === 'heli' || o.tier === 'ship') s.reputation = Math.min(5, Math.round((s.reputation + VIP_STAR_BONUS) * 100) / 100);
  s.lifetimeCups += o.qty;
  s.news.push(`${o.tier === 'heli' ? '🚁' : bySea(o.tier) ? '🚢' : '🚚'} ${o.client} picks up ${o.qty.toLocaleString('en-US')} bottles: ${money(o.pay)}!`);
  return { order: o, ok: true };
}
