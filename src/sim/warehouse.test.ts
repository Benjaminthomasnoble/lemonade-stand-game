import { describe, expect, it } from 'vitest';
import {
  AUTO_RESTOCK_DAY, buildFacility, canBuildFacility, cupsInStock, FACILITIES, helperLines, LOTTIES_CORNER, migrateSave, netWorth, newGame, newStand, NO_DEFENSE, OPEN, PLOTS, postsFor,
  restockPlan, standCost, SUPPLIES, sugarRoom, suppliedStands, tierOpen, WAREHOUSE, WAREHOUSE_ID, warehouseAtDawn, warehouseRuns, warehouseValue, type GameState,
  bottlesOf, CLOSE, DELIVERY_RAID_CHANCE, deliveryRaidRisk, FAILED_ORDER_STARS, pickupsAtClose, PLOT_BY_ID, raidFought, runNight, threatLevel, truckWarehouse,
  plotWorth, vipAtDawn, type BattleReport, type Order,
} from './economy.ts';
import { nextRandom } from './rng.ts';
import { warehouseNote } from '../ui/warehouse.ts';
import { orderTicket, orderWhen } from '../ui/orders.ts';

/** Rank 4 with cash, an Old Town street plot for the Warehouse and two Old Town Kiosks (lessons off: the Market is open). */
function depot(seed: number) {
  const s = newGame(seed, { lessons: false });
  s.rank = 4;
  s.day = AUTO_RESTOCK_DAY; // Auto-Restock has come (automation.ts restockOpen), as it has in any Rank 4 game
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

  it('Caterer Trucks call only while a Warehouse and a Bottling Works both stand', () => {
    const { s, shed } = depot(52);
    s.rank = 5;
    const lot = PLOTS.find((p) => p.type === 'industrial' && !s.plots[p.id].owner)!;
    s.plots[lot.id] = { ...s.plots[lot.id], owner: 'player', stand: null, facility: undefined, invested: 0 };
    buildFacility(s, lot.id, 'bottling');
    expect(tierOpen(s, 'caterer')).toEqual({ ok: false, why: 'a Warehouse' });
    buildFacility(s, shed, 'warehouse');
    expect(tierOpen(s, 'caterer')).toEqual({ ok: true });
    s.plots[shed].facility!.wrecked = true; // smashed: no Caterer calls till it's rebuilt
    expect(tierOpen(s, 'caterer')).toEqual({ ok: false, why: 'a Warehouse' });
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
    expect(plotWorth(s, shed)).toBeCloseTo(s.plots[shed].landValue + 0.75 * WAREHOUSE.cost + room * base, 2); // and so does the bank
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

  it('Caterer Trucks load at the Warehouse nearest your stands, or the first, from the bay\'s one pool of bottles', () => {
    const { s, shed, a, b } = depot(57);
    s.rank = 5;
    const far = PLOTS.find((p) => p.district === 'maple' && p.type === 'street' && !s.plots[p.id].owner)!.id; // Maple Row: before Old Town on the map
    const works = PLOTS.find((p) => p.type === 'industrial' && !s.plots[p.id].owner)!.id;
    s.plots[far] = { ...s.plots[far], owner: 'player', stand: null, facility: undefined, invested: 0, defense: NO_DEFENSE() };
    s.plots[works] = { ...s.plots[works], owner: 'player', stand: null, facility: undefined, invested: 0, defense: NO_DEFENSE() };
    expect(truckWarehouse(s)).toBeUndefined();
    for (const [id, kind] of [[far, 'warehouse'], [shed, 'warehouse'], [works, 'bottling']] as const) expect(buildFacility(s, id, kind)).toBe(true);
    expect(truckWarehouse(s)).toBe(shed); // the Old Town Kiosks are next door; Maple Row is across town
    // The next Caterer Truck to call names it, with no new dice: it loads there at closing.
    let truck: Order | undefined;
    for (let i = 0; i < 40 && !truck; i++) { s.day++; vipAtDawn(s); truck = s.offers.find((o) => o.tier === 'caterer'); }
    expect(truck?.plot).toBe(shed);
    expect(orderWhen(s, truck!, true)).toBe(`day ${truck!.due} at ${PLOT_BY_ID[shed].name}`);
    for (const id of [a, b, LOTTIES_CORNER]) s.plots[id].stand!.wrecked = true; // no working stand to go by: the first
    expect(truckWarehouse(s)).toBe(far);
    s.plots[far].facility!.wrecked = true;
    expect(truckWarehouse(s)).toBe(shed);
  });

  it('a smashed or lost Warehouse stops its Caterer Truck at closing, as at a pad or pier; one with no Warehouse loads as before', () => {
    const { s, shed } = depot(58);
    s.rank = 4; // Threat 2: no Delivery Raids yet
    buildFacility(s, shed, 'warehouse');
    const truck = (id: string, plot?: string): Order => {
      const o: Order = { id, tier: 'caterer', client: `Truck ${id}`, qty: 1000, pay: 6000, due: s.day, expires: s.day, accepted: true, recipe: 'classic', plot };
      s.orders.push(o);
      return o;
    };
    s.phase = 'open';
    s.minute = CLOSE;
    s.bottles = 1000;
    const cash = s.cash, rep = s.reputation;
    truck('t1', shed);
    expect(orderTicket(s, s.orders[0])).toContain(`1,000 ready, loads at ${PLOT_BY_ID[shed].name} at closing`);
    pickupsAtClose(s);
    expect([s.orders, s.bottles, s.cash]).toEqual([[], 0, cash + 6000]);
    expect(s.news.at(-1)).toBe('Truck t1 picks up 1,000 bottles: $6,000!');
    s.bottles = 1000;
    s.plots[shed].facility!.wrecked = true;
    truck('t2', shed);
    pickupsAtClose(s);
    expect([s.orders, s.bottles]).toEqual([[], 1000]); // the bottles stay in the pool
    expect(s.reputation).toBeCloseTo(rep - FAILED_ORDER_STARS);
    expect(s.news.at(-1)).toBe('Order fell through: Truck t2. The Warehouse was smashed. (−0.3 star)');
    s.plots[shed] = { ...s.plots[shed], owner: null, facility: undefined };
    truck('t3', shed);
    pickupsAtClose(s);
    expect(s.news.at(-1)).toBe('Order fell through: Truck t3. The Warehouse is gone. (−0.3 star)');
    // A truck taken before trucks loaded at a Warehouse names none: it loads from the pool, Warehouse or not.
    const seed = s.seed;
    s.rank = 8; // Threat 4 too: no Delivery Raid roll for it
    const old = truck('t4');
    expect(deliveryRaidRisk(s, old)).toBe(false);
    pickupsAtClose(s);
    expect([s.orders, s.bottles, s.seed]).toEqual([[], 0, seed]);
    expect(old.loaded).toBe(1000);
    // Saves: a truck naming a plot not on the map loads as before too.
    const t = depot(59).s;
    t.orders.push({ id: 'x', tier: 'caterer', client: 'x', qty: 1000, pay: 6000, due: t.day + 1, expires: t.day, accepted: true, plot: 'nowhere' });
    t.offers.push({ id: 'y', tier: 'caterer', client: 'y', qty: 1000, pay: 6000, due: t.day + 3, expires: t.day, accepted: false, plot: shed });
    migrateSave(t);
    migrateSave(t);
    expect([t.orders[0].plot, t.offers[0].plot]).toEqual([undefined, shed]);
  });

  it('from Threat 3 a Delivery Raid can hit a Caterer Truck at its Warehouse: the hold takes its bottles, then they go out or go with the raiders', () => {
    const { s, shed } = depot(60);
    s.rank = 5;
    expect(threatLevel(s)).toBe(3);
    buildFacility(s, shed, 'warehouse');
    /** The next Delivery Raid roll hits (30%). */
    const rollsARaid = () => { for (let seed = 1; ; seed++) { const r = { seed }; if (nextRandom(r) < DELIVERY_RAID_CHANCE) { s.seed = seed; return; } } };
    const settle = (o: Order, outcome: BattleReport['outcome']) => {
      const r = s.raids.find((x) => x.delivery && x.order === o.id)!;
      s.raids = s.raids.filter((x) => x !== r);
      raidFought(s, r, { outcome, attacker: r.attacker, defender: 'player', target: shed } as BattleReport, true);
    };
    const truck = (id: string): Order => {
      const o: Order = { id, tier: 'caterer', client: `Truck ${id}`, qty: 1000, pay: 6000, due: s.day, expires: s.day, accepted: true, recipe: 'classic', plot: shed };
      s.orders.push(o);
      return o;
    };
    const closing = () => { s.phase = 'open'; s.minute = CLOSE; pickupsAtClose(s); };
    const t1 = truck('t1');
    expect(deliveryRaidRisk(s, t1)).toBe(true);
    s.bottles = 1000;
    rollsARaid();
    closing();
    expect(s.heldPickups).toEqual(['t1']);
    expect(s.raids.find((r) => r.delivery && r.order === 't1')?.target).toBe(shed);
    expect([t1.loading, t1.reserved, s.bottles, s.orders]).toEqual([1000, true, 0, [t1]]);
    expect(orderTicket(s, t1)).toContain('1,000 ready'); // on the way out
    const cash = s.cash;
    settle(t1, 'repelled'); // beaten off: the cargo gets through
    expect([s.orders, s.bottles, s.cash, s.heldPickups]).toEqual([[], 0, cash + 6000, []]);
    expect(t1.loading ?? t1.reserved).toBeUndefined();
    const t2 = truck('t2');
    s.bottles = 1500;
    rollsARaid();
    closing();
    const rep = s.reputation;
    settle(t2, 'robbed');
    expect([s.orders, s.bottles, bottlesOf(s, 'classic')]).toEqual([[], 500, 500]);
    expect(s.reputation).toBeCloseTo(rep - FAILED_ORDER_STARS);
    expect(s.news.some((n) => n.includes('overran the Warehouse during loading'))).toBe(true);
    // On the night's clock: the raid set out at closing is fought in the dark, and the hold settles before dawn.
    truck('t3');
    s.bottles = 1000;
    rollsARaid();
    closing();
    expect(s.heldPickups).toEqual(['t3']);
    s.phase = 'report';
    expect(runNight(s)).toBe(true);
    expect(s.heldPickups).toEqual([]);
    expect(s.orders).toEqual([]);
    expect(s.battles.at(-1)).toMatchObject({ delivery: true, target: shed });
  });
});

