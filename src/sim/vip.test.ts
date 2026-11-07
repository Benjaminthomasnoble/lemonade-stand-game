import { describe, expect, it } from 'vitest';
import {
  acceptOrder, BOTTLE_CAP, bottleCost, bottlesOf, ownsRecipe, dealShortfallPerDay, buildFacility, canBuildFacility, CUP_COST, recipeCost, vipAtDawn, DELIVERY_WINDOW, FAILED_ORDER_STARS, LOADING_PER_DAY, LOTTIES_CORNER, newGame,
  nextDue, openStand, owedBy, PICKUP_MINUTE, pickupsAt, pickupsAtClose, PLOTS, simulateRestOfDay, sleepUntilDawn, tripLoad, tripMinutes,
  VIP_STAR_BONUS, type GameState, type Order,
} from './economy.ts';

const day = (s: GameState) => { openStand(s); simulateRestOfDay(s); sleepUntilDawn(s); };

function vipGame(seed: number) {
  const s = newGame(seed);
  s.rank = 7;
  s.reputation = 4.5;
  s.cash = 3_000_000;
  // Hand the player a field (cleared of Hollis's Lemon Grove), a dock and an industrial lot.
  const field = PLOTS.find((p) => p.type === 'field')!;
  const dock = PLOTS.find((p) => p.type === 'dock' && !s.plots[p.id].facility)!;
  const lot = PLOTS.find((p) => p.type === 'industrial' && !s.plots[p.id].owner)!;
  for (const p of [field, dock, lot]) s.plots[p.id] = { ...s.plots[p.id], owner: 'player', stand: null, facility: undefined, invested: 0 };
  return { s, field, dock, lot };
}

/** No rival will raid a pickup (they all respect you): the trips load in peace. */
const noRaids = (s: GameState) => { for (const r of Object.values(s.rivals)) r.respectUntil = 999; };
/** Just the VIP side of a business day: every trip minute, then the closing check, then the next day. */
function trips(s: GameState): void {
  s.phase = 'open';
  for (const m of [PICKUP_MINUTE.ship, PICKUP_MINUTE.heli, PICKUP_MINUTE.heli + DELIVERY_WINDOW]) { s.minute = m; pickupsAt(s); }
  pickupsAtClose(s);
  s.day++;
  s.phase = 'prep';
}
const round = (n: number) => Math.round(n * 100) / 100;
const order = (s: GameState, o: Partial<Order> & Pick<Order, 'id' | 'tier' | 'qty' | 'pay' | 'plot'>): Order => {
  const x: Order = { client: `Client ${o.id}`, due: s.day, expires: s.day, accepted: true, ...o };
  s.orders.push(x);
  return x;
};

describe('VIP clients', () => {
  it('facilities need the right land and rank', () => {
    const { s, field, dock, lot } = vipGame(1);
    expect(canBuildFacility(s, field.id, 'pier').ok).toBe(false);
    expect(buildFacility(s, field.id, 'helipad')).toBe(true);
    expect(buildFacility(s, dock.id, 'pier')).toBe(true);
    expect(buildFacility(s, lot.id, 'bottling')).toBe(true);
    expect(canBuildFacility(s, LOTTIES_CORNER, 'bottling').ok).toBe(false); // a stand is there
    s.rank = 5;
    expect(canBuildFacility(s, field.id, 'helipad')).toEqual({ ok: false, why: 'Needs Rank 7, Lemon Tycoon' });
  });

  it('helicopter and ship orders arrive, get bottled and pay out', () => {
    const { s, field, dock, lot } = vipGame(2);
    buildFacility(s, field.id, 'helipad');
    buildFacility(s, dock.id, 'pier');
    buildFacility(s, lot.id, 'bottling');
    buildFacility(s, lot.id, 'bottling');
    buildFacility(s, lot.id, 'bottling');
    let paid = 0, vip = 0;
    for (let d = 0; d < 30; d++) {
      for (const o of [...s.offers]) { acceptOrder(s, o.id); if (o.tier === 'heli' || o.tier === 'ship') vip++; }
      openStand(s);
      simulateRestOfDay(s);
      sleepUntilDawn(s);
      s.cash = Math.max(s.cash, 1_000_000);
      s.reputation = 4.5; // nobody is minding the stands in this test
    }
    expect(vip).toBeGreaterThan(1);
    paid = s.news.filter((n) => n.includes('picks up')).length;
    expect(paid).toBeGreaterThan(1);
    expect(s.lifetimeCups).toBeGreaterThan(2000);
  });

  it('each facility tier loads its daily rate: a Pad takes 2,000 bottles a day, and each pickup pays for its own load', () => {
    const { s, field } = vipGame(5);
    noRaids(s);
    buildFacility(s, field.id, 'helipad');
    const pad = s.plots[field.id].facility!;
    expect([tripMinutes(pad), tripLoad(pad)]).toEqual([[PICKUP_MINUTE.heli], 2000]);
    s.bottles = 10000;
    const o = order(s, { id: 'star', tier: 'heli', client: 'a movie star', qty: 4000, pay: 120000, due: s.day + 3, plot: field.id });
    const cash = s.cash, rep = s.reputation;
    trips(s);
    expect(o.loaded).toBe(2000);
    expect(s.bottles).toBe(8000);
    expect(s.cash).toBe(cash + 60000);
    expect(s.news.at(-1)).toBe('a movie star picks up 2,000 bottles: $60,000! 2,000 of 4,000 loaded.');
    expect(s.reputation).toBe(rep); // not delivered yet
    trips(s);
    expect(s.orders).toEqual([]);
    expect(s.cash).toBe(cash + 120000);
    expect(s.news.at(-1)).toBe('a movie star picks up 2,000 bottles: $60,000! Order complete!');
    expect(s.reputation).toBeCloseTo(rep + VIP_STAR_BONUS);
    // The Helipad tier loads the spec's 5,000 bottles of Pink in one pickup.
    buildFacility(s, field.id, 'helipad');
    expect(tripLoad(s.plots[field.id].facility!)).toBe(5000);
    order(s, { id: 'pink', tier: 'heli', qty: 5000, pay: 150000, due: s.day + 4, plot: field.id });
    trips(s);
    expect(s.orders).toEqual([]);
  });

  it('a Heliport flies 2 trips a day; a pier shares its daily rate between orders, oldest first', () => {
    const { s, field, dock } = vipGame(6);
    noRaids(s);
    s.rank = 8;
    for (let i = 0; i < 3; i++) buildFacility(s, field.id, 'helipad');
    buildFacility(s, dock.id, 'pier');
    const port = s.plots[field.id].facility!;
    expect(tripMinutes(port)).toEqual([PICKUP_MINUTE.heli, PICKUP_MINUTE.heli + DELIVERY_WINDOW]);
    expect(tripLoad(port) * 2).toBe(LOADING_PER_DAY.helipad[2]);
    s.bottles = 100000;
    const a = order(s, { id: 'a', tier: 'heli', qty: 10000, pay: 300000, due: s.day + 4, plot: field.id });
    const b = order(s, { id: 'b', tier: 'heli', qty: 10000, pay: 300000, due: s.day + 4, plot: field.id });
    s.phase = 'open';
    s.minute = PICKUP_MINUTE.heli;
    pickupsAt(s);
    expect([a.loaded, b.loaded]).toEqual([10000, undefined]);
    s.minute = PICKUP_MINUTE.heli + DELIVERY_WINDOW; // the second trip
    pickupsAt(s);
    expect(b.loaded).toBe(10000);
    expect(s.orders).toEqual([]);
    // A Jetty loads 5,000 a day: the first order takes 4,000 of it, the next one what's left.
    const c = order(s, { id: 'c', tier: 'ship', qty: 4000, pay: 160000, due: s.day + 7, plot: dock.id });
    const d = order(s, { id: 'd', tier: 'ship', qty: 4000, pay: 160000, due: s.day + 7, plot: dock.id });
    s.minute = PICKUP_MINUTE.ship;
    pickupsAt(s);
    expect([c.loaded, d.loaded]).toEqual([4000, 1000]);
  });

  it('a failed order costs 0.3 star once and only the unloaded pay: earlier pickups stay paid', () => {
    const { s, field } = vipGame(7);
    noRaids(s);
    buildFacility(s, field.id, 'helipad');
    s.bottles = 2000; // and no Bottling Works to make more
    const o = order(s, { id: 'x', tier: 'heli', client: 'a celebrity wedding', qty: 4000, pay: 120000, due: s.day + 1, plot: field.id });
    const cash = s.cash, rep = s.reputation;
    trips(s);
    expect(o.loaded).toBe(2000);
    trips(s); // the deadline: nothing more was ready
    expect(s.orders).toEqual([]);
    expect(s.cash).toBe(cash + 60000);
    expect(s.reputation).toBeCloseTo(rep - FAILED_ORDER_STARS);
    expect(s.news.at(-1)).toBe('Order fell through: a celebrity wedding. Only 2,000 of 4,000 bottles were loaded in time. (−0.3 star, $60,000 unpaid)');
  });

  it('a smashed helipad loads nothing, and the order falls through at its deadline', () => {
    const { s, field } = vipGame(8);
    noRaids(s);
    buildFacility(s, field.id, 'helipad');
    s.bottles = 5000;
    order(s, { id: 'x', tier: 'heli', client: 'the Governor\'s Gala', qty: 2000, pay: 60000, due: s.day, plot: field.id });
    s.plots[field.id].facility!.wrecked = true;
    const rep = s.reputation;
    trips(s);
    expect(s.bottles).toBe(5000);
    expect(s.reputation).toBeCloseTo(rep - FAILED_ORDER_STARS);
    expect(s.news.at(-1)).toBe("Order fell through: the Governor's Gala. The helipad was smashed. (−0.3 star)");
  });

  it('only helicopter deliveries add 0.2 star; ships and Supply Deals add none', () => {
    const { s, field, dock } = vipGame(9);
    noRaids(s);
    buildFacility(s, field.id, 'helipad');
    buildFacility(s, dock.id, 'pier');
    s.bottles = 10000;
    order(s, { id: 'yacht', tier: 'ship', qty: 5000, pay: 200000, due: s.day + 7, plot: dock.id });
    const rep = s.reputation;
    trips(s);
    expect(s.orders).toEqual([]);
    expect(s.reputation).toBe(rep);
    order(s, { id: 'chopper', tier: 'heli', qty: 2000, pay: 60000, due: s.day + 4, plot: field.id });
    trips(s);
    expect(s.reputation).toBeCloseTo(rep + VIP_STAR_BONUS);
  });

  it("a bottle costs the recipe's ingredients at today's Market plus a $0.15 bottle and cap, charged at dawn", () => {
    const { s, lot } = vipGame(11);
    s.market = { lemons: 0.20, sugar: 0.03, ice: 0.01 }; // the Market at normal
    expect(round(bottleCost(s))).toBe(0.31); // spec: $0.16 of Classic ingredients plus $0.15
    expect(bottleCost(s, 'pink')).toBeCloseTo(recipeCost(s, 'pink') - CUP_COST + BOTTLE_CAP);
    buildFacility(s, lot.id, 'bottling');
    order(s, { id: 'truck', tier: 'caterer', qty: 1000, pay: 6000, due: s.day + 3, plot: undefined });
    const cash = s.cash;
    s.market = { lemons: 0.24, sugar: 0.03, ice: 0.01 }; // lemons up 20% this morning
    const each = bottleCost(s);
    vipAtDawn(s);
    expect(s.bottles).toBe(1000);
    expect(s.cash).toBeCloseTo(cash - 1000 * each);
    expect(s.today.supplies).toBeCloseTo(1000 * each);
  });

  it("orders name a recipe from Lottie's book, and bottles are filled and stocked per recipe", () => {
    const { s, field, lot } = vipGame(12);
    noRaids(s);
    buildFacility(s, field.id, 'helipad');
    buildFacility(s, lot.id, 'bottling'); // 1,500 a day
    const picks = new Set<string>();
    for (let i = 0; i < 30; i++) {
      s.offers = [];
      s.lastOffer = {}; // every tier is due a call
      vipAtDawn(s);
      for (const o of s.offers) if (o.tier === 'heli' || o.tier === 'caterer') picks.add(o.recipe!);
    }
    expect(picks.size).toBeGreaterThan(1);
    expect([...picks].every((r) => ownsRecipe(s, r as 'classic'))).toBe(true);
    s.offers = [];
    s.bottles = 3000; // bottles from before recipes: all Classic
    expect([bottlesOf(s, 'classic'), bottlesOf(s, 'pink')]).toEqual([3000, 0]);
    const o = order(s, { id: 'pink', tier: 'heli', qty: 2000, pay: 60000, due: s.day + 4, plot: field.id, recipe: 'pink' });
    trips(s);
    expect(o.loaded).toBeUndefined(); // Classic doesn't fill a Pink order
    const cash = s.cash;
    vipAtDawn(s);
    expect([bottlesOf(s, 'pink'), bottlesOf(s, 'classic'), s.bottles]).toEqual([1500, 3000, 4500]);
    expect(s.cash).toBeCloseTo(cash - 1500 * bottleCost(s, 'pink'));
    trips(s);
    expect(o.loaded).toBe(1500);
    expect([bottlesOf(s, 'pink'), bottlesOf(s, 'classic')]).toEqual([0, 3000]);
  });

  it('an order with no bottles fails and costs a star', () => {
    const { s, field } = vipGame(3);
    buildFacility(s, field.id, 'helipad');
    s.orders.push({ id: 'x', tier: 'heli', client: 'test', qty: 5000, pay: 15000, due: s.day, expires: s.day, plot: field.id, accepted: true });
    const rep = s.reputation;
    day(s);
    expect(s.reputation).toBeLessThan(rep);
    expect(s.orders).toHaveLength(0);
  });

  it('Supply Deals ship in 4 weekly loads of 50,000, $1.5M a load, paid at each pickup; several can run at once', () => {
    const { s, dock, lot } = vipGame(4);
    noRaids(s);
    s.rank = 8;
    s.cash = 10_000_000;
    for (let i = 0; i < 3; i++) buildFacility(s, dock.id, 'pier');
    expect(s.plots[dock.id].facility!.level).toBe(3); // the Cargo Terminal
    const deal = (n: string) => ({ id: n, tier: 'deal' as const, client: n, qty: 200000, pay: 6000000, due: s.day + 28, expires: s.day + 1, plot: dock.id, accepted: false });
    s.offers.push(deal('a'));
    expect(dealShortfallPerDay(s, s.offers[0])).toBeGreaterThan(0); // no bottling yet
    for (let i = 0; i < 3; i++) buildFacility(s, lot.id, 'bottling');
    expect(dealShortfallPerDay(s, s.offers[0])).toBeLessThanOrEqual(0); // 12,000 a day covers ~7,143
    acceptOrder(s, 'a');
    s.offers.push(deal('b'));
    acceptOrder(s, 'b');
    expect(s.orders.map((o) => [o.id, o.loads])).toEqual([['a', 4], ['b', 4]]); // one order each, not one per load
    const [a, b] = s.orders;
    const start = s.day;
    expect([6, 7, 13, 14, 28].map((d) => owedBy(a, start + d))).toEqual([0, 50000, 50000, 100000, 200000]);
    expect([0, 7, 8, 27].map((d) => nextDue(a, start + d))).toEqual([start + 7, start + 7, start + 14, start + 28]);
    s.bottles = 400000;
    const cash = s.cash;
    for (let d = 0; d < 7; d++) trips(s);
    // The Cargo Terminal loads 25,000 a day: each deal's first load went out in 2 pickups, and no more than that.
    expect([a.loaded, b.loaded]).toEqual([50000, 50000]);
    expect(s.cash).toBe(cash + 2 * 1500000);
    for (let d = 0; d < 21; d++) trips(s);
    expect(s.orders).toEqual([]);
    expect(s.cash).toBe(cash + 2 * 6000000);
  });

  it("a Supply Deal's short week ends the deal for 0.3 star, once; the loads already shipped stay paid", () => {
    const { s, dock } = vipGame(10);
    noRaids(s);
    s.rank = 8;
    s.cash = 10_000_000;
    for (let i = 0; i < 3; i++) buildFacility(s, dock.id, 'pier');
    s.offers.push({ id: 'd', tier: 'deal', client: 'Gulfstream Grocers', qty: 200000, pay: 6000000, due: s.day + 28, expires: s.day + 1, plot: dock.id, accepted: false });
    acceptOrder(s, 'd');
    s.bottles = 50000; // week 1's load, and not a bottle more
    const cash = s.cash, rep = s.reputation;
    for (let d = 0; d < 14; d++) trips(s);
    expect(s.orders).toHaveLength(1); // week 2's load is due by the end of its 7th day
    trips(s);
    expect(s.orders).toEqual([]);
    expect(s.cash).toBe(cash + 1500000);
    expect(s.reputation).toBeCloseTo(rep - FAILED_ORDER_STARS);
    expect(s.news.filter((n) => n.startsWith('Order fell through'))).toEqual(['Order fell through: Gulfstream Grocers. Only 50,000 of 100,000 bottles were loaded in time. (−0.3 star, $4,500,000 unpaid)']);
  });
});
