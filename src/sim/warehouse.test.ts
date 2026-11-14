import { describe, expect, it } from 'vitest';
import {
  buildFacility, canBuildFacility, cupsInStock, FACILITIES, helperLines, LOTTIES_CORNER, migrateSave, netWorth, newGame, newStand, NO_DEFENSE, OPEN, PLOTS, postsFor,
  restockPlan, standCost, SUPPLIES, sugarRoom, suppliedStands, WAREHOUSE, WAREHOUSE_ID, warehouseAtDawn, warehouseRuns, warehouseValue, type GameState,
} from './economy.ts';
import { warehouseNote } from '../ui/warehouse.ts';

/** Rank 4 with cash, an Old Town street plot for the Warehouse and two Old Town Kiosks (lessons off: the Market is open). */
function depot(seed: number) {
  const s = newGame(seed, { lessons: false });
  s.rank = 4;
  s.cash = 100000;
  s.phase = 'prep';
  const [shed, a, b] = PLOTS.filter((p) => p.district === 'oldtown' && p.type === 'street' && !s.plots[p.id].owner);
  s.plots[shed.id] = { ...s.plots[shed.id], owner: 'player', stand: null, facility: undefined, invested: 0, defense: NO_DEFENSE() };
  for (const p of [a, b]) s.plots[p.id] = { ...s.plots[p.id], owner: 'player', stand: newStand(3), invested: standCost(3), defense: NO_DEFENSE() };
  return { s, shed: shed.id, a: a.id, b: b.id };
}
/** A stand with nothing on the shelf. */
const empty = (s: GameState, id: string) => { s.plots[id].stand!.inventory = { lemons: [], sugar: 0, sugarCost: 0, ice: 0, iceCost: 0 }; s.plots[id].stand!.pitcherCups = 0; };

describe('the Warehouse (Rank 4)', () => {
  it('builds for $15,000 on a Street or Industrial plot of yours, with 3 guard posts', () => {
    const { s, shed } = depot(51);
    s.rank = 3;
    expect(canBuildFacility(s, shed, 'warehouse')).toEqual({ ok: false, why: 'Needs Rank 4, Neighborhood Name' });
    s.rank = 4;
    expect(FACILITIES.warehouse.on).toEqual(['street', 'industrial']);
    const field = PLOTS.find((p) => p.type === 'field')!;
    s.plots[field.id] = { ...s.plots[field.id], owner: 'player', facility: undefined };
    expect(canBuildFacility(s, field.id, 'warehouse').ok).toBe(false);
    expect(buildFacility(s, shed, 'warehouse')).toBe(true);
    expect(s.cash).toBe(100000 - WAREHOUSE.cost);
    expect(s.plots[shed].facility).toMatchObject({ kind: 'warehouse', level: 1 });
    expect(postsFor(s, shed)).toBe(3);
    expect(s.news[s.news.length - 1]).toContain('Warehouse opens at');
    expect(canBuildFacility(s, shed, 'warehouse')).toEqual({ ok: false, why: 'Top level' });
  });

  it("makes market runs while open for the stands in its district; one elsewhere, or with Auto-Restock off, waits", () => {
    const { s, shed, a, b } = depot(53);
    buildFacility(s, shed, 'warehouse');
    s.plots[LOTTIES_CORNER].stand = newStand(3); // Maple Row: no Warehouse there
    s.plots[b].stand!.autoRestock = false; // its own switch leaves it out
    expect(suppliedStands(s)).toEqual([a]);
    for (const id of [a, b, LOTTIES_CORNER]) empty(s, id);
    s.phase = 'open';
    s.minute = OPEN + 1; // between runs
    warehouseRuns(s);
    expect(cupsInStock(s, a)).toBe(0);
    s.minute = OPEN + WAREHOUSE.runEvery;
    const cash = s.cash;
    warehouseRuns(s);
    expect(cupsInStock(s, a)).toBeGreaterThan(0);
    expect(cupsInStock(s, b)).toBe(0);
    expect(cupsInStock(s, LOTTIES_CORNER)).toBe(0);
    expect(s.today.auto?.[WAREHOUSE_ID]).toMatchObject({ count: 1, amount: 1, spent: Math.round((cash - s.cash) * 100) / 100 });
    expect(helperLines(s.today).find((h) => h.id === WAREHOUSE_ID)?.line).toBe('1 stand supplied, 1 market run');
    s.minute += WAREHOUSE.runEvery; // stocked: no run
    warehouseRuns(s);
    expect(s.today.auto?.[WAREHOUSE_ID]?.amount).toBe(1);
  });

  it('stores sugar on a cheap dawn and hands it to its stands on a dear one, as in a Sugar Shortage', () => {
    const { s, shed, a, b } = depot(54);
    buildFacility(s, shed, 'warehouse');
    const base = SUPPLIES.sugar.baseUnitPrice;
    s.market.sugar = base;
    const worth = netWorth(s);
    const cash = s.cash;
    const room = sugarRoom(s, 'oldtown');
    expect(room).toBeGreaterThan(0);
    warehouseAtDawn(s);
    expect(s.warehouses?.[shed]).toEqual({ sugar: room, cost: base });
    expect(s.cash).toBeCloseTo(cash - room * base, 2);
    expect(warehouseValue(s)).toBeCloseTo(room * base, 2);
    expect(netWorth(s)).toBeCloseTo(worth, 2); // stock at cost: the score keeps it
    expect(warehouseNote(s, shed)).toContain(`2 stands supplied · ${room.toLocaleString('en-US')} sugar`);
    // A Sugar Shortage: the Market's sugar costs double, and the stands take the Warehouse's first.
    s.market.sugar = base * 2;
    for (const id of [a, b]) s.plots[id].stand!.inventory.sugar = 0;
    warehouseAtDawn(s);
    for (const id of [a, b]) {
      expect(s.plots[id].stand!.inventory.sugar).toBeGreaterThan(0);
      expect(s.plots[id].stand!.inventory.sugarCost).toBeCloseTo(base, 6);
      expect(restockPlan(s, id).packs.sugar).toBe(0); // Auto-Restock buys none at the doubled price
    }
    const handed = s.plots[a].stand!.inventory.sugar + s.plots[b].stand!.inventory.sugar;
    expect(s.warehouses![shed].sugar).toBe(room - handed);
  });

  it('a smashed Warehouse loses its sugar, and odd saved stores are tidied', () => {
    const { s, shed } = depot(55);
    buildFacility(s, shed, 'warehouse');
    s.market.sugar = SUPPLIES.sugar.baseUnitPrice;
    warehouseAtDawn(s);
    expect(warehouseValue(s)).toBeGreaterThan(0);
    s.plots[shed].facility!.wrecked = true;
    expect(warehouseValue(s)).toBe(0);
    warehouseAtDawn(s);
    expect(s.warehouses?.[shed]).toBeUndefined();
    expect(warehouseNote(s, shed)).toBe('');
    // Saves: a store with no scoops is dropped, a bad cost is set to the normal price, none at all stays none.
    const t = depot(56).s;
    (t as unknown as { warehouses: unknown }).warehouses = { x: { sugar: 'lots' }, y: { sugar: 100, cost: -1 }, z: null };
    migrateSave(t);
    expect(t.warehouses).toEqual({ y: { sugar: 100, cost: SUPPLIES.sugar.baseUnitPrice } });
    const u = depot(57).s;
    migrateSave(u);
    expect(u.warehouses).toBeUndefined();
  });
});
