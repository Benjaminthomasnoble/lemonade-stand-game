// Milestone 5: big orders and VIP clients (canon section 15). Local Orders
// from L3 stands, Caterer Trucks, Helicopter VIPs on a Field helipad and Ship
// Contracts at a Dock pier, with Bottling Works making the bottles.
import { FACTIONS, RANKS, type RivalId } from './balance.ts';
import { fightRaid, raidPartyFor, threatLevel, type BattleReport } from './crew.ts';
import { PLOT_BY_ID, PLOTS, type PlotType } from './map.ts';
import { nextRandom, type Rng } from './rng.ts';
import type { Blocker, GameState } from './economy.ts';
import { costPerCup, playerStands } from './economy.ts';

export type FacilityKind = 'bottling' | 'helipad' | 'pier';
export type OrderTier = 'local' | 'caterer' | 'heli' | 'ship';

export interface Facility { kind: FacilityKind; level: number }

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

export const FACILITIES: Record<FacilityKind, { names: string[]; costs: number[]; ranks: number[]; on: PlotType[]; blurb: string[] }> = {
  bottling: { names: ['Bottling Works', 'Bottling Works L2', 'Bottling Works L3'], costs: [20000, 80000, 300000], ranks: [5, 6, 8], on: ['street', 'prime', 'industrial'], blurb: ['1,500 bottles a day', '4,000 bottles a day', '12,000 bottles a day'] },
  helipad: { names: ['Pad', 'Helipad', 'Heliport'], costs: [25000, 120000, 500000], ranks: [6, 7, 8], on: ['field'], blurb: ['Small choppers: up to 4,000 bottles', 'Up to 7,000 bottles', 'Big choppers: up to 10,000 bottles'] },
  pier: { names: ['Jetty', 'Pier', 'Cargo Terminal'], costs: [60000, 250000, 1000000], ranks: [7, 7, 8], on: ['dock'], blurb: ['Yachts: up to 20,000 bottles', 'Cruise ships: up to 40,000 bottles', 'Freighters: up to 60,000 bottles'] },
};
export const BOTTLES_PER_DAY = [1500, 4000, 12000];
export const BOTTLE_COST = 0.3; // ingredients and the bottle
export const RETAIL = 1.0; // what a bottle of lemonade fetches on the street
export const ORDER_TIERS: Record<OrderTier, { rank: number; stars: number; size: [number, number]; mult: [number, number]; days: [number, number]; chance: number; label: string }> = {
  local: { rank: 3, stars: 0, size: [300, 1500], mult: [1.5, 1.5], days: [2, 2], chance: 0.35, label: 'Local Order' },
  caterer: { rank: 5, stars: 0, size: [1000, 5000], mult: [2, 2], days: [2, 3], chance: 0.3, label: 'Caterer Truck' },
  heli: { rank: 6, stars: 3.5, size: [2000, 10000], mult: [3, 4], days: [3, 5], chance: 0.3, label: 'Helicopter VIP' },
  ship: { rank: 7, stars: 4.0, size: [10000, 60000], mult: [3, 5], days: [4, 7], chance: 0.2, label: 'Ship Contract' },
};
export const HELI_SIZE_CAP = [4000, 7000, 10000];
export const SHIP_SIZE_CAP = [20000, 40000, 60000];
export const VIP_STAR_BONUS = 0.2;
export const FAILED_ORDER_STARS = 0.3;
export const DELIVERY_RAID_THREAT = 3;
export const DELIVERY_RAID_CHANCE = 0.3;
export const MAX_OFFERS = 4;
/** Pickup minute: choppers at 2 pm, ships at 10 am. */
export const PICKUP_MINUTE: Record<OrderTier, number> = { local: 20 * 60, caterer: 20 * 60, heli: 14 * 60, ship: 10 * 60 };

const CLIENTS: Record<OrderTier, string[]> = {
  local: ['the Maple Row Block Party', 'Little League Opening Day', 'the Old Town Bake Sale', 'the Campus Book Fair', 'a Fire Station Open House'],
  caterer: ['Bayside Catering Co.', 'Dot\'s Diner (big weekend)', 'the Hilltop Garden Club', 'Harbor Fest Food Tent'],
  heli: ['a movie star\'s pool party', 'a tech mogul\'s rooftop launch', 'a celebrity wedding', 'the music festival VIP tent', 'the Governor\'s Gala'],
  ship: ['the Citrine Bay Regatta', 'the S.S. Sunny Disposition (cruise line)', 'an overseas export deal', 'the Bay Centennial flotilla'],
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

// ---------- facilities ----------

export function facilityPlots(s: GameState, kind: FacilityKind) {
  return PLOTS.filter((p) => s.plots[p.id].owner === 'player' && s.plots[p.id].facility?.kind === kind);
}
const bestLevel = (s: GameState, kind: FacilityKind) => Math.max(0, ...facilityPlots(s, kind).map((p) => s.plots[p.id].facility!.level));

export function facilityFor(type: PlotType): FacilityKind | null {
  for (const k of Object.keys(FACILITIES) as FacilityKind[]) if (FACILITIES[k].on.includes(type)) return k;
  return null;
}

export function canBuildFacility(s: GameState, plotId: string, kind: FacilityKind): Blocker {
  const p = PLOT_BY_ID[plotId];
  const ps = s.plots[plotId];
  const f = FACILITIES[kind];
  if (ps.owner !== 'player') return { ok: false, why: 'Buy the plot first' };
  if (!f.on.includes(p.type)) return { ok: false, why: `Needs a ${f.on.join(' or ')} plot` };
  if (ps.stand) return { ok: false, why: 'A stand is here' };
  if (ps.facility && ps.facility.kind !== kind) return { ok: false, why: 'Something else is built here' };
  const lvl = ps.facility?.level ?? 0;
  if (lvl >= 3) return { ok: false, why: 'Top level' };
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
  ps.facility = { kind, level: lvl + 1 };
  s.news.push(`${FACILITIES[kind].names[lvl]} opens at ${PLOT_BY_ID[plotId].name}!${kind === 'helipad' ? ' The rich folks can fly in now.' : kind === 'pier' ? ' Ships can dock for your lemonade.' : ''}`);
  return true;
}

export const bottlingCapacity = (s: GameState) => facilityPlots(s, 'bottling').reduce((a, p) => a + BOTTLES_PER_DAY[s.plots[p.id].facility!.level - 1], 0);

// ---------- offers ----------

export function tierOpen(s: GameState, tier: OrderTier): Blocker {
  const t = ORDER_TIERS[tier];
  if (s.rank < t.rank) return { ok: false, why: `Rank ${t.rank}` };
  if (s.reputation < t.stars) return { ok: false, why: `${t.stars.toFixed(1)} stars` };
  if (tier === 'local' && !playerStands(s).some((p) => s.plots[p.id].stand!.level >= 3 && !s.plots[p.id].stand!.wrecked)) return { ok: false, why: 'an L3 Kiosk' };
  if (tier === 'caterer' && !facilityPlots(s, 'bottling').length) return { ok: false, why: 'a Bottling Works' };
  if (tier === 'heli' && !facilityPlots(s, 'helipad').length) return { ok: false, why: 'a Helipad on a Field plot' };
  if (tier === 'ship' && !facilityPlots(s, 'pier').length) return { ok: false, why: 'a Pier on a Dock plot' };
  return { ok: true };
}

function rollOffer(s: GameState, tier: OrderTier, rng: Rng): Order {
  const t = ORDER_TIERS[tier];
  let [lo, hi] = t.size;
  if (tier === 'heli') hi = Math.min(hi, HELI_SIZE_CAP[bestLevel(s, 'helipad') - 1]);
  if (tier === 'ship') hi = Math.min(hi, SHIP_SIZE_CAP[bestLevel(s, 'pier') - 1]);
  const qty = Math.round((lo + (hi - lo) * nextRandom(rng)) / 100) * 100;
  const mult = t.mult[0] + (t.mult[1] - t.mult[0]) * nextRandom(rng);
  const unit = tier === 'local' ? localPrice(s) : RETAIL;
  const days = t.days[0] + Math.floor(nextRandom(rng) * (t.days[1] - t.days[0] + 1));
  const plot = tier === 'heli' ? facilityPlots(s, 'helipad')[0]?.id : tier === 'ship' ? facilityPlots(s, 'pier')[0]?.id : undefined;
  const clients = CLIENTS[tier];
  return {
    id: `o${s.nextId++}`, tier, client: clients[Math.floor(nextRandom(rng) * clients.length)], qty,
    pay: Math.round(qty * unit * mult), due: s.day + days, expires: s.day + 1, plot, accepted: false,
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
  for (const tier of Object.keys(ORDER_TIERS) as OrderTier[]) {
    if (s.offers.length >= MAX_OFFERS || !tierOpen(s, tier).ok) continue;
    if (s.offers.some((o) => o.tier === tier) || nextRandom(rng) >= ORDER_TIERS[tier].chance) continue;
    const o = rollOffer(s, tier, rng);
    s.offers.push(o);
    if (tier === 'heli' || tier === 'ship') s.news.push(`VIP call! ${o.client} wants ${o.qty.toLocaleString('en-US')} bottles for ${money(o.pay)}.`);
  }
  s.seed = rng.seed;
}

export function acceptOrder(s: GameState, id: string): boolean {
  const i = s.offers.findIndex((o) => o.id === id);
  if (i < 0) return false;
  const o = s.offers.splice(i, 1)[0];
  o.accepted = true;
  s.orders.push(o);
  return true;
}

export function declineOrder(s: GameState, id: string): void {
  s.offers = s.offers.filter((o) => o.id !== id);
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

function deliver(s: GameState, o: Order): Pickup {
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
  if (s.bottles < o.qty) return fail(`Only ${s.bottles.toLocaleString('en-US')} of ${o.qty.toLocaleString('en-US')} bottles were ready.`);
  let raid: BattleReport | undefined;
  if ((o.tier === 'heli' || o.tier === 'ship') && o.plot && threatLevel(s) >= DELIVERY_RAID_THREAT) {
    const rng = { seed: s.seed };
    const roll = nextRandom(rng);
    const rivals = (Object.keys(FACTIONS) as RivalId[]).filter((r) => s.rivals[r].alive);
    const rival = rivals[Math.floor(nextRandom(rng) * rivals.length)];
    s.seed = rng.seed;
    if (roll < DELIVERY_RAID_CHANCE && rival) {
      raid = fightRaid(s, { id: `r${s.nextId++}`, attacker: rival, target: o.plot, objective: 'shakedown', party: raidPartyFor(s, rival), detected: true, eta: '', delivery: true }, false);
      if (raid.outcome === 'robbed') {
        s.bottles = Math.max(0, s.bottles - o.qty);
        const p = fail(`${FACTIONS[rival].name} overran the ${o.tier === 'heli' ? 'helipad' : 'pier'} during loading.`);
        return { ...p, raid };
      }
    }
  }
  s.bottles -= o.qty;
  s.cash = round2(s.cash + o.pay);
  s.today.revenue = round2(s.today.revenue + o.pay);
  if (o.tier === 'heli' || o.tier === 'ship') s.reputation = Math.min(5, Math.round((s.reputation + VIP_STAR_BONUS) * 100) / 100);
  s.lifetimeCups += o.qty;
  s.news.push(`${o.tier === 'heli' ? '🚁' : o.tier === 'ship' ? '🚢' : '🚚'} ${o.client} picks up ${o.qty.toLocaleString('en-US')} bottles: ${money(o.pay)}!`);
  return { order: o, ok: true, raid };
}
