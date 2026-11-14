// The Warehouse (spec: VIP clients, Bulk production: "Warehouse | 4 | 15,000 | Street or Industrial | Stores bottles and
// supplies; auto-supplies stands in its district"; Helpers: "Warehouse | Rank 4 | Supplying every stand in its district |
// Where to build it"). It is a facility (FACILITIES in vip.ts), so fences, gadgets, its 3 guard posts, raids, smashing and
// rebuilds come with PlotState.facility. Here is what it does for the stands of yours in its district:
// - Market runs: while open, a stand there that holds less than an hour's pour is topped up to what it can still sell,
//   at the Market's price (without one, Auto-Restock stocks a stand at dawn and at opening only).
// - The sugar store ("Sugar keeps: a stocked Warehouse rides it out"): on a dawn the Market's sugar is at or under its
//   normal price, the Warehouse fills up for WAREHOUSE.sugarDays days of its stands' sugar; on a dearer dawn (a Sugar
//   Shortage) those stands take the stored sugar first, at what it cost, before Auto-Restock buys the rest.
// Each stand's Auto-Restock switch is its opt-out. Caterer Trucks need a standing Warehouse (vip.ts tierOpen) and load
// at one (truckWarehouse: the order's plot), so a raid there can stop the pickup as at a pad or pier. Bottles bank in
// the bay's one pool between pickups (vip.ts s.bottles): the Warehouse holds no bottles of its own and loses none.
import { CUPS_PER_PITCHER, OPEN, SUPPLIES, WAREHOUSE } from './balance.ts';
import type { DistrictId } from './map.ts';
import type { GameState } from './economy.ts';
import { cupsInStock, pitcherNeeds, playerStands, storageFor } from './economy.ts';
import { autoRestock, bookHelper, registerHelper, restockGoal, restockOn, stockTarget } from './automation.ts';
import { pourRate, serviceLeft } from './demand.ts';
import { facilityPlots } from './vip.ts';
import { book } from './ledger.ts';
import { inspectorClosed } from './damage.ts';
import { gameOver } from './modes.ts';

/** A Warehouse's store: scoops of sugar and what one cost, on average. */
export interface WarehouseStock { sugar: number; cost: number }

export const WAREHOUSE_ID = 'warehouse';
const round2 = (n: number) => Math.round(n * 100) / 100;
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

/** Your standing Warehouses (not Wrecked). */
export const warehouses = (s: GameState) => facilityPlots(s, WAREHOUSE_ID);

/** Where a Caterer Truck loads: the standing Warehouse nearest your working stands (the least road to them all), or
 * the first with no stand to go by. None while no Warehouse stands. */
export function truckWarehouse(s: GameState): string | undefined {
  const sheds = warehouses(s);
  const stands = playerStands(s).filter((p) => !s.plots[p.id].stand!.wrecked);
  let best = sheds[0], far = Infinity;
  if (stands.length) for (const w of sheds) {
    const d = stands.reduce((a, p) => a + Math.hypot(p.x - w.x, p.z - w.z), 0);
    if (d < far - 1e-9) { best = w; far = d; }
  }
  return best?.id;
}

/** The stands a Warehouse supplies: yours in a district with one of your standing Warehouses (or in `d`), Auto-Restock
 * on, not Wrecked. */
export function suppliedStands(s: GameState, d?: DistrictId): string[] {
  const ds = new Set(warehouses(s).map((p) => p.district));
  if (!ds.size || (d && !ds.has(d))) return [];
  return playerStands(s).filter((p) => (d ? p.district === d : ds.has(p.district)) && !s.plots[p.id].stand!.wrecked && restockOn(s, s.plots[p.id].stand!)).map((p) => p.id);
}

/** Scoops of sugar a stand's goal needs beyond what it holds, within its storage. */
export function sugarFor(s: GameState, plotId: string): number {
  const st = s.plots[plotId].stand!;
  const per = pitcherNeeds(st).sugar;
  if (per <= 0) return 0;
  const pitchers = Math.ceil(Math.max(0, restockGoal(s, plotId) - st.pitcherCups) / CUPS_PER_PITCHER);
  return Math.max(0, Math.min(storageFor(st, 'sugar'), pitchers * per) - st.inventory.sugar);
}

/** How much sugar a district's Warehouses store: WAREHOUSE.sugarDays days of its stands' targets, in whole packs. */
export function sugarRoom(s: GameState, d: DistrictId): number {
  let scoops = 0;
  for (const id of suppliedStands(s, d)) scoops += Math.ceil(stockTarget(s, id) / CUPS_PER_PITCHER) * pitcherNeeds(s.plots[id].stand!).sugar;
  const pack = SUPPLIES.sugar.pack;
  return Math.ceil((scoops * WAREHOUSE.sugarDays) / pack) * pack;
}

/** A Warehouse's store (an empty one if it has none yet). */
const stockAt = (s: GameState, plotId: string): WarehouseStock => ((s.warehouses ??= {})[plotId] ??= { sugar: 0, cost: 0 });

/** The sugar in your standing Warehouses, at cost (the Success Score's stock at cost). */
export function warehouseValue(s: GameState): number {
  if (!s.warehouses) return 0;
  return round2(warehouses(s).reduce((a, p) => a + (s.warehouses![p.id] ? s.warehouses![p.id]!.sugar * s.warehouses![p.id]!.cost : 0), 0));
}

/**
 * Dawn (vipAtDawn calls it, after the day's Market shocks and before Auto-Restock buys): a store whose Warehouse is gone
 * (smashed, sold, bought out) is lost with it; then each district's Warehouses stock up on a cheap day, or hand their
 * stands the stored sugar on a dear one.
 */
export function warehouseAtDawn(s: GameState): void {
  const standing = warehouses(s);
  if (s.warehouses) for (const id of Object.keys(s.warehouses)) if (!standing.some((p) => p.id === id)) delete s.warehouses[id];
  if (!standing.length || gameOver(s)) return;
  const pack = SUPPLIES.sugar.pack, price = s.market.sugar;
  const dear = price > SUPPLIES.sugar.baseUnitPrice + 1e-9;
  let spent = 0;
  for (const d of new Set(standing.map((p) => p.district))) {
    const sheds = standing.filter((p) => p.district === d).map((p) => stockAt(s, p.id));
    if (dear) {
      // Biggest target first, as Auto-Restock stocks them short of cash.
      for (const id of suppliedStands(s, d).map((x) => ({ x, goal: stockTarget(s, x) })).sort((a, b) => b.goal - a.goal).map((g) => g.x)) {
        let need = sugarFor(s, id);
        const inv = s.plots[id].stand!.inventory;
        for (const w of sheds) {
          const give = Math.min(need, w.sugar);
          if (give <= 0) continue;
          inv.sugarCost = (inv.sugar * inv.sugarCost + give * w.cost) / (inv.sugar + give);
          inv.sugar += give;
          w.sugar -= give;
          need -= give;
        }
      }
      continue;
    }
    const room = sugarRoom(s, d) / sheds.length;
    for (const w of sheds) {
      const packs = Math.min(Math.floor((room - w.sugar) / pack), Math.floor(Math.max(0, s.cash) / (pack * price) + 1e-9));
      if (packs <= 0) continue;
      const qty = packs * pack, cost = round2(qty * price);
      book(s, 'stock', -cost); // stock bought, like any supply (the Ledger's Supplies are what the stands use)
      w.cost = (w.sugar * w.cost + qty * price) / (w.sugar + qty);
      w.sugar += qty;
      spent += cost;
    }
  }
  bookHelper(s, WAREHOUSE_ID, round2(spent), { count: suppliedStands(s).length });
}

/**
 * Every game minute while open (tickMinute calls it): each WAREHOUSE.runEvery minutes, a market run for each stand a
 * Warehouse supplies that holds less than an hour's pour and can still sell, topped up to what it can sell by closing
 * (Auto-Restock's goal), at the Market's price.
 */
export function warehouseRuns(s: GameState): void {
  if (s.phase !== 'open' || s.minute === OPEN || (s.minute - OPEN) % WAREHOUSE.runEvery !== 0) return;
  const ids = suppliedStands(s);
  if (!ids.length) return;
  let spent = 0, runs = 0;
  for (const id of ids) {
    if (inspectorClosed(s, s.plots[id]) || serviceLeft(s, id) <= 0 || cupsInStock(s, id) >= pourRate(s, id)) continue;
    const before = s.cash;
    autoRestock(s, id);
    if (s.cash < before - 1e-9) { runs++; spent += before - s.cash; }
  }
  if (!runs) return;
  bookHelper(s, WAREHOUSE_ID, round2(spent), { count: ids.length, amount: (s.today.auto?.[WAREHOUSE_ID]?.amount ?? 0) + runs });
}

registerHelper({
  id: WAREHOUSE_ID,
  name: 'Warehouse',
  unlocked: (s) => warehouses(s).length > 0,
  line: (d) => [d.count ? `${plural(d.count, 'stand')} supplied` : 'sugar stored', d.amount ? plural(d.amount, 'market run') : ''].filter(Boolean).join(', '),
});

/** Older saves and odd data (idempotent; migrateLand calls it): stores with a number of scoops and a cost, or none. */
export function migrateWarehouses(s: GameState): void {
  const w = s.warehouses as unknown;
  if (w === undefined) return;
  if (!w || typeof w !== 'object') { delete s.warehouses; return; }
  for (const [id, v] of Object.entries(w as Record<string, unknown>)) {
    const x = v as Partial<WarehouseStock> | null;
    if (!x || typeof x !== 'object' || !Number.isFinite(x.sugar) || x.sugar! < 0) { delete s.warehouses![id]; continue; }
    if (!Number.isFinite(x.cost) || x.cost! < 0) x.cost = SUPPLIES.sugar.baseUnitPrice;
  }
}
