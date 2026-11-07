import { describe, expect, it } from 'vitest';
import {
  acceptOrder, BOTTLE_CAP, bottleCost, bottlesOf, bottleValue, buildFacility, canBuildFacility, costPerCup, CUP_COST, dealShortfallPerDay, declineOrder,
  DELIVERY_WINDOW, FAILED_ORDER_STARS, FEST_HUMS, FESTIVALS, festivalsOn, FIZZCO_BID, FIZZCO_PLANT, harborFestOn, LOADING_PER_DAY, LOTTIES_CORNER, MAX_OFFERS,
  netWorth, newGame, newStand, nextDue, offerChance, OLD_MONEY_OFFERS, oldMoney, openStand, ORDER_TIERS, owedBy, ownsRecipe, PICKUP_MINUTE, pickupsAt,
  pickupsAtClose, playerStands, PLOT_BY_ID, PLOTS, recipeCost, RIVAL_BID, shippingLane, simulateRestOfDay, sleepUntilDawn, stock, successScore, syndicateFestRaid,
  tripLoad, tripMinutes, VIP_MAX_GAP, VIP_STAR_BONUS, vipAtDawn, YEAR_DAYS, yourDays, type GameState, type Order, type OrderBid,
  grantPage, isPremium, MEGA_PREMIUM_PAGES, RECIPES, tierOpen,
} from './economy.ts';
import { rowAmount } from './ledger.ts';
import { bottleStock, orderGoods, orderTicket, orderWhen } from '../ui/orders.ts';
import { menuScreen } from '../ui/menus.ts';
import { DEFAULT_OPTIONS, defaultKeys } from '../settings.ts';

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
    s.plots[LOTTIES_CORNER].stand!.autoRestock = false; // the stand stays bare: the cups here are bottled
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

  it("a VIP pickup counts in the day's sales, next to the stands' cups", () => {
    const { s, field } = vipGame(28);
    noRaids(s);
    buildFacility(s, field.id, 'helipad');
    s.bottles = 2000;
    const o = order(s, { id: 'sales', tier: 'heli', qty: 2000, pay: 60000, due: s.day, plot: field.id });
    openStand(s);
    simulateRestOfDay(s);
    expect(o.loaded).toBe(2000);
    const t = s.history.at(-1)!;
    const stands = playerStands(s).reduce((a, p) => a + s.plots[p.id].stand!.day.revenue, 0);
    expect(t.revenue).toBe(round(stands + 60000));
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
    expect(rowAmount(s.today, 'bottling')).toBeCloseTo(-1000 * each); // the Ledger's Bottling row
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

  it('the Order Book card names the recipe and flags a possible Delivery Raid; a job you took shows its loading', () => {
    const { s, field, dock } = vipGame(13);
    buildFacility(s, field.id, 'helipad');
    buildFacility(s, dock.id, 'pier');
    s.offers.push({ id: 'o1', tier: 'heli', client: 'a movie star\'s pool party', qty: 3000, pay: 90000, due: s.day + 4, expires: s.day + 1, plot: field.id, accepted: false, recipe: 'pink' });
    const parts = { head: ['HOT ONE!', 'Thirsty town expected'] as [string, string], goals: [], crew: () => '', options: { ...DEFAULT_OPTIONS, keys: defaultKeys() } };
    let book = menuScreen(s, 'orders', parts);
    expect(book).toContain(`3,000 bottles of Pink Lemonade · day ${s.day + 4} · Delivery Raid possible`); // Rank 7: Threat 3 and up
    expect(orderGoods(s, s.offers[0])).toBe('3,000 bottles of Pink Lemonade');
    acceptOrder(s, 'o1');
    s.bottleStock = { pink: 1000 };
    s.bottles = 1500;
    s.orders[0].loaded = 1000;
    expect(orderWhen(s, s.orders[0], false)).toBe(`1,000 of 3,000 loaded · next due day ${s.day + 4}`);
    book = menuScreen(s, 'orders', parts);
    expect(book).toContain(`3,000 bottles of Pink Lemonade · 1,000 of 3,000 loaded · next due day ${s.day + 4}`);
    const ticket = orderTicket(s, s.orders[0]);
    expect(ticket).toContain(`<b>Due day ${s.day + 4}</b>`);
    expect(ticket).toContain('--v:0.333');
    expect(ticket).toContain('2,000 to load, 1,000 ready');
    expect(bottleStock(s)).toBe('500 Classic Lemonade, 1,000 Pink Lemonade');
    s.offers.push({ id: 'd', tier: 'deal', client: 'Gulfstream Grocers', qty: 200000, pay: 6000000, due: s.day + 28, expires: s.day + 1, plot: dock.id, accepted: false, recipe: 'mint' });
    expect(orderWhen(s, s.offers[0], true)).toBe(`4 weekly loads to day ${s.day + 28}`);
  });

  it('offers left unanswered never hold the next back: each tier calls at its own rate, and every 10 days at the least', () => {
    const { s, field, dock, lot } = vipGame(14);
    buildFacility(s, field.id, 'helipad');
    buildFacility(s, dock.id, 'pier');
    buildFacility(s, lot.id, 'bottling');
    const days = 600;
    const calls: Record<string, Set<string>> = { caterer: new Set(), heli: new Set(), ship: new Set() };
    for (let d = 0; d < days; d++) {
      s.day++;
      vipAtDawn(s); // nobody answers: the offers sit there until they lapse
      for (const o of s.offers) calls[o.tier]?.add(o.id);
      expect(s.offers.length).toBeLessThanOrEqual(MAX_OFFERS);
    }
    const per = (t: string) => calls[t].size / days;
    expect(per('caterer')).toBeCloseTo(ORDER_TIERS.caterer.chance, 1); // about 2 per 5 days
    expect(per('heli')).toBeGreaterThan(0.3); // about 1 per 3 days
    expect(per('ship')).toBeGreaterThan(0.2); // about 1 per 5 days, with the 10-day floor on top
    expect(s.day - s.lastOffer!.ship!).toBeLessThan(VIP_MAX_GAP);
  });

  it('the first Supply Deal comes the day the Cargo Terminal opens, then about 1 in 7 days, never more than 10 apart', () => {
    const { s, dock } = vipGame(15);
    s.rank = 8;
    s.cash = 10_000_000;
    s.phase = 'prep';
    buildFacility(s, dock.id, 'pier');
    buildFacility(s, dock.id, 'pier');
    expect(s.offers.some((o) => o.tier === 'deal')).toBe(false);
    buildFacility(s, dock.id, 'pier'); // the Cargo Terminal, at Morning Prep
    expect(s.offers.filter((o) => o.tier === 'deal')).toHaveLength(1);
    expect(s.lastOffer!.deal).toBe(s.day);
    expect(s.news.at(-1)).toMatch(/^Supply Deal! .+ wants 200,000 bottles over 28 days for \$6,000,000, shipped weekly from your Cargo Terminal\.( .+ bids \$[\d,]+\.)?$/);
    const days: number[] = [s.day];
    for (let d = 0; d < 1400; d++) {
      s.day++;
      vipAtDawn(s);
      if (s.lastOffer!.deal === s.day) days.push(s.day);
    }
    const gaps = days.slice(1).map((d, i) => d - days[i]);
    expect(Math.max(...gaps)).toBeLessThanOrEqual(VIP_MAX_GAP);
    expect(1400 / gaps.length).toBeGreaterThan(4.5); // 1 in 7 a day, and the floor at 10: about 5.5 days apart
    expect(1400 / gaps.length).toBeLessThan(7);
  });

  it("a Local Order goes to one of your L3+ stands, pays 1.5x that stand's price, and pours its card", () => {
    const { s } = vipGame(23);
    const [home] = playerStands(s);
    const spare = PLOTS.find((p) => p.type === 'street' && !s.plots[p.id].owner)!;
    const small = PLOTS.find((p) => p.type === 'street' && !s.plots[p.id].owner && p.id !== spare.id)!;
    Object.assign(s.plots[home.id].stand!, { level: 3, price: 2, recipe: 'pink' });
    s.plots[spare.id] = { ...s.plots[spare.id], owner: 'player', stand: newStand(4, 1.6) };
    s.plots[small.id] = { ...s.plots[small.id], owner: 'player', stand: newStand(2, 3) };
    const seen = new Set<string>(), at = new Set<string>();
    for (let d = 0; d < 60; d++) {
      s.day++;
      vipAtDawn(s);
      for (const o of s.offers.filter((x) => x.tier === 'local' && !seen.has(x.id))) {
        seen.add(o.id);
        at.add(o.plot!);
        const st = s.plots[o.plot!].stand!;
        expect(st.level).toBeGreaterThanOrEqual(3); // never the L2 stand
        expect(o.pay).toBe(Math.round(o.qty * st.price * 1.5));
        expect(o.recipe).toBe(st.recipe);
      }
    }
    expect([...at].sort()).toEqual([home.id, spare.id].sort()); // either Kiosk can get the call
    expect(seen.size).toBeGreaterThan(15); // about 1 in 2 days
    expect(ORDER_TIERS.local.pay).toBe(1.5);
  });

  it("a Local Order's cups are poured from its stand's own stock an hour before closing, and the client pays for each", () => {
    const { s } = vipGame(24);
    const [home] = playerStands(s);
    const st = s.plots[home.id].stand!;
    Object.assign(st, { level: 3, price: 1, recipe: 'classic', pitcherCups: 4 });
    st.inventory.lemons = [{ qty: 400, day: s.day, unitCost: 0.2 }];
    st.inventory.sugar = 1000;
    st.inventory.ice = 900; // 300 cups' worth
    const o = order(s, { id: 'l1', tier: 'local', qty: 300, pay: 450, plot: home.id, due: s.day + 2 });
    const cash = s.cash, sales = s.today.revenue, supplies = rowAmount(s.today, 'supplies'), orders = rowAmount(s.today, 'orders');
    s.phase = 'open';
    s.minute = PICKUP_MINUTE.local - 1;
    expect(pickupsAt(s)).toEqual([]); // not before 7 pm
    s.minute = PICKUP_MINUTE.local;
    expect(pickupsAt(s)).toHaveLength(1);
    expect(o.loaded).toBe(300);
    expect(s.orders).not.toContain(o);
    // 4 cups from the pitcher on hand, then 30 pitchers (150 lemons, 300 sugar); 4 cups stay in the last pitcher.
    expect(stock(st, 'lemons')).toBe(250);
    expect(st.inventory.sugar).toBe(700);
    expect(st.pitcherCups).toBe(4);
    expect(st.inventory.ice).toBe(0);
    expect(s.today.revenue).toBe(round(sales + 450));
    expect(rowAmount(s.today, 'orders')).toBe(round(orders + 450)); // the Ledger: the Orders row, and each cup on Supplies
    expect(rowAmount(s.today, 'supplies')).toBeCloseTo(supplies - 300 * costPerCup(s, st), 2);
    expect(st.day.revenue).toBe(0); // the stand's till keeps its walk-in day: that's what a Shakedown takes
    expect(s.cash).toBe(round(cash + 450 - 300 * CUP_COST));
    expect(s.news.at(-1)).toBe(`Delivered 300 cups for ${o.client}: $450!`);
    expect(orderWhen(s, { ...o, accepted: false, loaded: 0 }, true)).toBe(`day ${o.due} at ${PLOT_BY_ID[home.id].name}`);
  });

  it('a Local Order short of stock pours what it can each day, and falls through on its deadline for 0.3 star, once', () => {
    const { s } = vipGame(25);
    const [home] = playerStands(s);
    const st = s.plots[home.id].stand!;
    Object.assign(st, { level: 3, price: 1, recipe: 'classic', pitcherCups: 0 });
    st.inventory.lemons = [{ qty: 50, day: s.day, unitCost: 0.2 }]; // 10 pitchers: 100 cups
    st.inventory.sugar = 1000;
    st.inventory.ice = 2400;
    const o = order(s, { id: 'l2', tier: 'local', qty: 300, pay: 450, plot: home.id, due: s.day + 1 });
    const rep = s.reputation;
    s.phase = 'open';
    s.minute = PICKUP_MINUTE.local;
    pickupsAt(s);
    expect(o.loaded).toBe(100);
    expect(s.news.at(-1)).toBe(`Poured 100 cups for ${o.client}: $150! 100 of 300 made.`);
    expect(orderWhen(s, o, false)).toBe(`100 of 300 made at ${PLOT_BY_ID[home.id].name} · due day ${o.due}`);
    expect(orderTicket(s, o)).toContain('--v:0.333');
    pickupsAtClose(s); // not due yet
    expect(s.orders).toContain(o);
    s.day++;
    pickupsAt(s); // nothing left to pour with
    pickupsAtClose(s);
    expect(s.orders).not.toContain(o);
    expect(s.reputation).toBe(round(rep - FAILED_ORDER_STARS));
    expect(s.news.at(-1)).toBe(`Order fell through: ${o.client}. Only 100 of 300 cups were made in time. (−0.3 star, $300 unpaid)`);
  });

  it('a Local Order at a smashed stand makes nothing and falls through on its deadline', () => {
    const { s } = vipGame(26);
    const [home] = playerStands(s);
    const st = s.plots[home.id].stand!;
    Object.assign(st, { level: 3, wrecked: true });
    const o = order(s, { id: 'l3', tier: 'local', qty: 300, pay: 450, plot: home.id, due: s.day });
    s.phase = 'open';
    s.minute = PICKUP_MINUTE.local;
    expect(pickupsAt(s)).toEqual([]);
    pickupsAtClose(s);
    expect(o.loaded ?? 0).toBe(0);
    expect(s.news.at(-1)).toBe(`Order fell through: ${o.client}. Its stand was smashed. (−0.3 star)`);
  });

  it('a Local Order goes out on a real business day before the ice melts', () => {
    const { s } = vipGame(27);
    const [home] = playerStands(s);
    const st = s.plots[home.id].stand!;
    Object.assign(st, { level: 3, price: 1 });
    st.inventory.lemons = [{ qty: 400, day: s.day, unitCost: 0.2 }];
    st.inventory.sugar = 1000;
    st.inventory.ice = 2400;
    const o = order(s, { id: 'l4', tier: 'local', qty: 300, pay: 450, plot: home.id, due: s.day });
    openStand(s);
    simulateRestOfDay(s);
    expect(s.orders).not.toContain(o);
    expect(o.loaded).toBe(300);
    expect(s.history.at(-1)!.revenue).toBeGreaterThanOrEqual(450); // the order is part of the day's sales
  });

  it('rivals bid for VIP contracts, and FizzCo bids hardest while it holds the Harbor bottling plant', () => {
    const { s, field } = vipGame(31);
    buildFacility(s, field.id, 'helipad');
    expect(s.plots[FIZZCO_PLANT]).toMatchObject({ owner: 'fizzco', facility: { kind: 'bottling' } });
    const seen = new Set<string>();
    const tally = () => {
      const bids: Record<string, number> = {};
      for (let d = 0; d < 300; d++) {
        s.day++;
        vipAtDawn(s);
        for (const o of s.offers.filter((x) => x.tier === 'heli' && !seen.has(x.id))) {
          seen.add(o.id);
          if (!o.bid) continue;
          bids[o.bid.rival] = (bids[o.bid.rival] ?? 0) + 1;
          const t = o.bid.rival === 'fizzco' && !s.plots[FIZZCO_PLANT].facility!.wrecked ? FIZZCO_BID : RIVAL_BID;
          expect(o.bid.pay).toBe(Math.round(o.pay * (1 - t.under)));
          expect(o.bid.days).toBe(Math.ceil(ORDER_TIERS.heli.days * t.window));
        }
      }
      return bids;
    };
    const before = seen.size;
    const withPlant = tally();
    const calls = seen.size - before;
    expect(withPlant.fizzco).toBeGreaterThan(calls * 0.35); // about half the calls
    for (const r of ['sourwood', 'hollis', 'coldbrew', 'blenders']) expect(withPlant[r] ?? 0).toBeLessThan(withPlant.fizzco / 3);
    s.plots[FIZZCO_PLANT].facility!.wrecked = true; // knocked out: FizzCo bids like the rest
    const without = tally();
    expect(without.fizzco ?? 0).toBeLessThan(withPlant.fizzco / 3);
    expect(without.sourwood).toBeGreaterThan(0);
  });

  it('the client weighs price, delivery time and Reputation: FizzCo undercuts you, and matching its price wins it back', () => {
    const { s, field } = vipGame(32);
    buildFacility(s, field.id, 'helipad'); // a Pad: 2,000 bottles a day
    s.bottles = 20000;
    s.rivals.fizzco.reputation = 3.5; // each bidder's own stars (demand.ts: rivalStars)
    s.rivals.sourwood.reputation = 4;
    const offer = (id: string, bid: OrderBid): Order => {
      const o: Order = { id, tier: 'heli', client: `Client ${id}`, qty: 4000, pay: 120000, due: s.day + 4, expires: s.day + 1, plot: field.id, accepted: false, recipe: 'classic', bid };
      s.offers.push(o);
      return o;
    };
    const fizz: OrderBid = { rival: 'fizzco', pay: 102000, days: 1 };
    const a = offer('a', fizz);
    expect(yourDays(s, a)).toBe(2);
    // You: 4.5 stars at full price over 2 days = 4.0. FizzCo: 3.5 stars, +1.5 for 15% under, -0.25 for 1 day = 4.75.
    const cash = s.rivals.fizzco.cash, rep = s.reputation;
    expect(acceptOrder(s, 'a')).toBe(false);
    expect(s.offers).not.toContain(a);
    expect(s.orders).toEqual([]);
    expect(s.reputation).toBe(rep); // a lost bid costs no star
    expect(s.rivals.fizzco.cash).toBe(round(cash + 102000 * RIVAL_BID.margin)); // the job, and its margin, go to FizzCo
    expect(s.news.at(-1)).toBe('Lost the bid: Client a went with FizzCo Beverages ($102,000, 1 day).');
    // Match its price: 4.5 + 1.5 - 0.5 = 5.5 beats 4.75.
    const b = offer('b', fizz);
    expect(acceptOrder(s, 'b', true)).toBe(true);
    expect(s.orders).toContain(b);
    expect(b.pay).toBe(102000);
    expect(b.bid).toBeUndefined();
    expect(s.news.at(-1)).toBe('Client b picks you over FizzCo Beverages at $102,000!');
    // Reputation counts: Sourwood's softer bid loses to 4.5 stars at full price, and beats 3.0.
    const sour: OrderBid = { rival: 'sourwood', pay: 114000, days: 3 };
    offer('c', sour);
    expect(acceptOrder(s, 'c')).toBe(true); // you 4.5 - 0.5 = 4.0; Sourwood 4 + 0.5 - 0.75 = 3.75
    s.reputation = 3;
    offer('d', sour);
    expect(acceptOrder(s, 'd')).toBe(false); // you 3 - 0.5 = 2.5
    // Turning an offer down, or letting it lapse, leaves the job to the rival who bid; one out of business takes nothing.
    const sourCash = s.rivals.sourwood.cash;
    offer('e', sour);
    declineOrder(s, 'e');
    expect(s.rivals.sourwood.cash).toBe(round(sourCash + 114000 * RIVAL_BID.margin));
    s.rivals.fizzco.alive = false;
    offer('f', fizz);
    expect(acceptOrder(s, 'f')).toBe(true);
  });

  it('the Order Book card shows a rival bid and a Match button', () => {
    const { s, field } = vipGame(33);
    buildFacility(s, field.id, 'helipad');
    s.bottles = 10000;
    s.offers.push({ id: 'o9', tier: 'heli', client: 'a pop star', qty: 4000, pay: 120000, due: s.day + 4, expires: s.day + 1, plot: field.id, accepted: false, recipe: 'classic', bid: { rival: 'fizzco', pay: 102000, days: 1 } });
    const parts = { head: ['HOT ONE!', 'Thirsty town expected'] as [string, string], goals: [], crew: () => '', options: { ...DEFAULT_OPTIONS, keys: defaultKeys() } };
    const book = menuScreen(s, 'orders', parts);
    expect(book).toContain(' · FizzCo Beverages bids $102,000, 1 day (you: 2 days)');
    expect(book).toContain('data-action="match" data-id="o9"');
    expect(book).toContain('>Match $102,000</button>');
    s.rivals.fizzco.alive = false; // out of business: the bid is gone
    expect(menuScreen(s, 'orders', parts)).not.toContain('data-action="match"');
  });

  it('Shipping Lane: Full Control of The Harbor adds 15% to Ship Contract pay at each pickup', () => {
    const { s, field, dock } = vipGame(34);
    noRaids(s);
    buildFacility(s, dock.id, 'pier'); // a Jetty: 5,000 bottles a day
    buildFacility(s, field.id, 'helipad');
    s.bottles = 20000;
    const ship = order(s, { id: 'cruise', tier: 'ship', qty: 10000, pay: 400000, due: s.day + 6, plot: dock.id });
    const cash = s.cash;
    trips(s);
    expect(s.cash).toBe(cash + 200000); // no lane yet
    for (const p of PLOTS) if (p.district === 'harbor' && p.type !== 'civic' && p.type !== 'hq') s.plots[p.id].owner = 'player';
    expect(shippingLane(s)).toBe(true);
    const chopper = order(s, { id: 'star', tier: 'heli', qty: 2000, pay: 60000, due: s.day + 3, plot: field.id });
    trips(s);
    expect(s.orders).not.toContain(ship);
    expect(s.orders).not.toContain(chopper);
    expect(s.cash).toBe(cash + 200000 + 230000 + 60000); // the ship's second load +15%, the chopper as it was
    expect(s.news).toContain('Client cruise picks up 5,000 bottles: $230,000! Order complete!');
    s.offers.push({ id: 'o7', tier: 'ship', client: 'a cruise line', qty: 10000, pay: 400000, due: s.day + 7, expires: s.day + 1, plot: dock.id, accepted: false, recipe: 'classic' });
    const parts = { head: ['HOT ONE!', 'Thirsty town expected'] as [string, string], goals: [], crew: () => '', options: { ...DEFAULT_OPTIONS, keys: defaultKeys() } };
    expect(menuScreen(s, 'orders', parts)).toContain(`10,000 bottles of Classic Lemonade · day ${s.day + 7} · Delivery Raid possible · Shipping Lane +15%`);
  });

  it('Old Money: Full Control of Hilltop brings VIP offers 50% more often', () => {
    const { s, field } = vipGame(35);
    buildFacility(s, field.id, 'helipad');
    for (const t of ['caterer', 'heli', 'ship', 'deal'] as const) expect(offerChance(s, t)).toBe(ORDER_TIERS[t].chance);
    for (const p of PLOTS) if (p.district === 'hilltop' && p.type !== 'civic' && p.type !== 'hq') s.plots[p.id].owner = 'player';
    expect(oldMoney(s)).toBe(true);
    for (const t of ['heli', 'ship', 'deal'] as const) expect(offerChance(s, t)).toBeCloseTo(ORDER_TIERS[t].chance * OLD_MONEY_OFFERS);
    expect(offerChance(s, 'caterer')).toBe(ORDER_TIERS.caterer.chance); // a Caterer Truck is no VIP
    const seen = new Set<string>();
    let days = 0;
    while (days < 400) {
      s.day++;
      if (festivalsOn(s.day).includes('harborFest')) continue; // the Fest's rush is its own test
      days++;
      vipAtDawn(s);
      for (const o of s.offers) if (o.tier === 'heli') seen.add(o.id);
    }
    expect(seen.size / days).toBeGreaterThan(0.44); // about 1 in 2 days, up from 1 in 3
    expect(seen.size / days).toBeLessThan(0.58);
  });

  it('Harbor Fest brings the Fall VIP rush: choppers and ships call on every day of it', () => {
    const { s, field, dock } = vipGame(36);
    buildFacility(s, field.id, 'helipad');
    buildFacility(s, dock.id, 'pier');
    let fest = 0;
    for (let d = 0; d < YEAR_DAYS; d++) {
      s.day++;
      vipAtDawn(s);
      if (!harborFestOn(s)) continue;
      fest++;
      expect(s.lastOffer!.heli).toBe(s.day);
      expect(s.lastOffer!.ship).toBe(s.day);
      expect(offerChance(s, 'caterer')).toBe(ORDER_TIERS.caterer.chance);
    }
    expect(fest).toBe(FESTIVALS.harborFest.to - FESTIVALS.harborFest.from + 1);
  });

  it("Act 5's Harbor Fest: once the Syndicate has formed, a crew goes after every VIP pickup of the Fest", () => {
    const { s, field, dock } = vipGame(39);
    const heli = order(s, { id: 'star', tier: 'heli', qty: 2000, pay: 60000, due: s.day + 60, plot: field.id });
    const ship = order(s, { id: 'cruise', tier: 'ship', qty: 10000, pay: 400000, due: s.day + 60, plot: dock.id });
    const tent = order(s, { id: 'tent', tier: 'caterer', qty: 500, pay: 1000, due: s.day + 60 });
    expect(syndicateFestRaid(s, heli, true)).toBe(false); // no Fest today: the usual 30% at Threat 3+
    while (!harborFestOn(s)) s.day++;
    expect([heli, ship, tent].map((o) => syndicateFestRaid(s, o, true))).toEqual([true, true, false]); // a Caterer Truck is no VIP
    expect(syndicateFestRaid(s, ship, false)).toBe(false); // no Syndicate: nights passes syndicateFormed(s) once it exists
  });

  it("Harbor Fest: Lottie swears she isn't humming along to the ships' horns, a line for each day of the Fest", () => {
    const { s, field, dock } = vipGame(40);
    noRaids(s);
    buildFacility(s, dock.id, 'pier'); // 10,000 bottles a day: both of a day's ships load on its one trip
    buildFacility(s, field.id, 'helipad');
    while (!harborFestOn(s)) s.day++;
    s.bottles = 100000;
    const hums = () => s.news.filter((n) => FEST_HUMS.includes(n));
    order(s, { id: 'star', tier: 'heli', qty: 2000, pay: 60000, due: s.day, plot: field.id });
    for (let d = 0; d < FEST_HUMS.length; d++) {
      order(s, { id: `cruise${d}`, tier: 'ship', qty: 4000, pay: 160000, due: s.day, plot: dock.id });
      order(s, { id: `liner${d}`, tier: 'ship', qty: 4000, pay: 160000, due: s.day, plot: dock.id });
      trips(s);
    }
    expect(s.orders).toEqual([]);
    expect(hums()).toEqual(FEST_HUMS); // once a day, at the first ship (a chopper's rotors play no theme)
    order(s, { id: 'late', tier: 'ship', qty: 4000, pay: 160000, due: s.day, plot: dock.id });
    trips(s); // the Fest is over
    expect(hums()).toEqual(FEST_HUMS);
  });

  it('bottles on hand count in the Success Score at cost', () => {
    const { s } = vipGame(37);
    const worth = netWorth(s);
    s.bottles = 1500;
    s.bottleStock = { pink: 500 };
    expect(bottleValue(s)).toBeCloseTo(1000 * bottleCost(s, 'classic') + 500 * bottleCost(s, 'pink'), 6);
    expect(netWorth(s)).toBeCloseTo(worth + bottleValue(s), 1);
    expect(successScore(s)).toBe(Math.floor(netWorth(s)));
  });

  it('helicopter VIPs pay $30 a bottle and ships $40 (the VIP table; design-spec line 632 says $12 and $15)', () => {
    expect([ORDER_TIERS.heli.pay, ORDER_TIERS.ship.pay]).toEqual([30, 40]);
    const { s, field, dock } = vipGame(38);
    buildFacility(s, field.id, 'helipad');
    buildFacility(s, dock.id, 'pier');
    const got = new Map<string, Order>();
    for (let d = 0; d < 40; d++) {
      s.day++;
      vipAtDawn(s);
      for (const o of s.offers) got.set(o.id, o);
    }
    const heli = [...got.values()].filter((o) => o.tier === 'heli'), ship = [...got.values()].filter((o) => o.tier === 'ship');
    expect(heli.length).toBeGreaterThan(0);
    expect(ship.length).toBeGreaterThan(0);
    for (const o of heli) expect(o.pay).toBe(o.qty * 30); // a Pad's 2,000-4,000 bottles: $60,000-$120,000
    for (const o of ship) expect(o.pay).toBe(o.qty * 40); // a Jetty's 10,000-20,000: $400,000-$800,000
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

/** A Rank 9 business with a Heliport, a Cargo Terminal, an L3 Bottling Works and two premium pages (Frozen, Lavender). */
function megaGame(seed: number) {
  const g = vipGame(seed);
  const { s, field, dock, lot } = g;
  Object.assign(s, { rank: 9, reputation: 4.6, cash: 20_000_000, phase: 'prep' });
  for (let i = 0; i < 3; i++) { buildFacility(s, field.id, 'helipad'); buildFacility(s, dock.id, 'pier'); buildFacility(s, lot.id, 'bottling'); }
  grantPage(s, 'frozen', true);
  grantPage(s, 'lavender', true);
  s.offers = []; // the Cargo Terminal's first Supply Deal
  return g;
}
const mega = (s: GameState, dock: string, o: Partial<Order> & Pick<Order, 'id' | 'qty'>) =>
  order(s, { tier: 'mega', pay: o.qty * 100, plot: dock, recipe: 'frozen', ...o });

describe('Mega Contracts', () => {
  it('need Rank 9, 4.5 stars, a Heliport, a Cargo Terminal and 2 premium recipes', () => {
    const { s, field, dock } = vipGame(41);
    Object.assign(s, { rank: 8, reputation: 4.6, cash: 20_000_000, phase: 'prep' });
    expect(tierOpen(s, 'mega')).toEqual({ ok: false, why: 'Rank 9' });
    s.rank = 9;
    s.reputation = 4.4;
    expect(tierOpen(s, 'mega')).toEqual({ ok: false, why: '4.5 stars' });
    s.reputation = 4.6;
    expect(tierOpen(s, 'mega')).toEqual({ ok: false, why: 'a Cargo Terminal' });
    for (let i = 0; i < 3; i++) buildFacility(s, dock.id, 'pier');
    buildFacility(s, field.id, 'helipad');
    buildFacility(s, field.id, 'helipad');
    expect(tierOpen(s, 'mega')).toEqual({ ok: false, why: 'a Heliport' }); // a Helipad is not enough
    buildFacility(s, field.id, 'helipad');
    expect(tierOpen(s, 'mega')).toEqual({ ok: false, why: `${MEGA_PREMIUM_PAGES} premium recipes` });
    grantPage(s, 'strawberry', true); // no premium page
    grantPage(s, 'frozen', true);
    expect(tierOpen(s, 'mega').ok).toBe(false);
    grantPage(s, 'lavender', true);
    expect(tierOpen(s, 'mega')).toEqual({ ok: true });
  });

  it('a client calls about 1 in 20 days, with no 10-day floor: 100,000-150,000 bottles of a premium recipe in 14 days at $100 a bottle', () => {
    const { s, dock } = megaGame(42);
    const days = 4000;
    const calls: number[] = [];
    for (let d = 0; d < days; d++) {
      s.day++;
      s.news = [];
      vipAtDawn(s);
      if (s.lastOffer!.mega !== s.day) continue;
      calls.push(s.day);
      const o = s.offers.find((x) => x.tier === 'mega' && x.expires === s.day + 1)!;
      expect(o.qty).toBeGreaterThanOrEqual(100000);
      expect(o.qty).toBeLessThanOrEqual(150000);
      expect(o.pay).toBe(o.qty * 100);
      expect(o.due).toBe(s.day + 14);
      expect(o.plot).toBe(dock.id); // its freighters load at the Cargo Terminal
      expect(isPremium(o.recipe!)).toBe(true);
      const line = `Mega Contract! ${o.client} wants ${o.qty.toLocaleString('en-US')} bottles of ${RECIPES[o.recipe!].label} in 14 days for $${o.pay.toLocaleString('en-US')}, loaded at your Cargo Terminal.`;
      expect(s.news.some((n) => n === line || n.startsWith(`${line} `))).toBe(true);
    }
    expect(calls.length / days).toBeGreaterThan(0.04);
    expect(calls.length / days).toBeLessThan(0.06);
    const gaps = calls.slice(1).map((d, i) => d - calls[i]);
    expect(Math.max(...gaps)).toBeGreaterThan(VIP_MAX_GAP); // no floor
  });

  it('loads 25,000 bottles a day at the Cargo Terminal over several days, each pickup paid at $100 a bottle', () => {
    const { s, dock } = megaGame(43);
    noRaids(s);
    s.bottles = 150000;
    s.bottleStock = { frozen: 120000 }; // and 30,000 Classic
    const o = mega(s, dock.id, { id: 'gala', qty: 100000, due: s.day + 13 });
    const cash = s.cash, rep = s.reputation;
    trips(s);
    expect(o.loaded).toBe(25000);
    expect(s.cash).toBe(cash + 2500000);
    expect(s.news).toContain('Client gala picks up 25,000 bottles: $2,500,000! 25,000 of 100,000 loaded.');
    for (let d = 0; d < 3; d++) trips(s);
    expect(s.orders).not.toContain(o);
    expect(s.cash).toBe(cash + 10000000);
    expect(s.reputation).toBe(rep); // a freighter adds no star
    expect(bottlesOf(s, 'frozen')).toBe(20000);
    expect(bottlesOf(s, 'classic')).toBe(30000); // the Classic stock stays put
  });

  it('a Mega Contract short at its deadline falls through for 0.3 star, once; the loads already picked up stay paid', () => {
    const { s, dock } = megaGame(44);
    noRaids(s);
    s.bottles = 30000;
    s.bottleStock = { frozen: 30000 };
    mega(s, dock.id, { id: 'gala', qty: 100000, due: s.day + 1 });
    const cash = s.cash, rep = s.reputation;
    trips(s);
    trips(s);
    expect(s.orders).toEqual([]);
    expect(s.cash).toBe(cash + 3000000);
    expect(s.reputation).toBeCloseTo(rep - FAILED_ORDER_STARS);
    expect(s.news.filter((n) => n.startsWith('Order fell through'))).toEqual(['Order fell through: Client gala. Only 30,000 of 100,000 bottles were loaded in time. (−0.3 star, $7,000,000 unpaid)']);
  });

  it('rivals bid for them, Old Money counts them as VIP, the Order Book flags a Delivery Raid, and Syndicate crews go after them at the Fest', () => {
    const { s, dock } = megaGame(45);
    let bid: OrderBid | undefined;
    for (let d = 0; d < 2000 && !bid; d++) {
      s.day++;
      vipAtDawn(s);
      bid = s.offers.find((o) => o.tier === 'mega' && o.bid)?.bid;
    }
    expect(bid).toBeDefined();
    const t = bid!.rival === 'fizzco' ? FIZZCO_BID : RIVAL_BID;
    expect(bid!.days).toBe(Math.ceil(ORDER_TIERS.mega.days * t.window));
    expect(offerChance(s, 'mega')).toBe(ORDER_TIERS.mega.chance);
    for (const p of PLOTS) if (p.district === 'hilltop' && p.type !== 'civic' && p.type !== 'hq') s.plots[p.id].owner = 'player';
    expect(offerChance(s, 'mega')).toBeCloseTo(ORDER_TIERS.mega.chance * OLD_MONEY_OFFERS);
    s.offers = [{ id: 'm', tier: 'mega', client: "the Governor's Gala", qty: 150000, pay: 15000000, due: s.day + 14, expires: s.day + 1, plot: dock.id, accepted: false, recipe: 'lavender' }];
    const parts = { head: ['HOT ONE!', 'Thirsty town expected'] as [string, string], goals: [], crew: () => '', options: { ...DEFAULT_OPTIONS, keys: defaultKeys() } };
    expect(menuScreen(s, 'orders', parts)).toContain(`150,000 bottles of Lavender Lemonade · day ${s.day + 14} · Delivery Raid possible`);
    expect(dealShortfallPerDay(s, s.offers[0])).toBeLessThanOrEqual(0); // 12,000 a day covers about 10,700
    s.plots[PLOTS.find((p) => s.plots[p.id].owner === 'player' && s.plots[p.id].facility?.kind === 'bottling')!.id].facility!.level = 2;
    expect(dealShortfallPerDay(s, s.offers[0])).toBe(Math.ceil(150000 / 14 - 4000));
    while (!harborFestOn(s)) s.day++;
    expect(syndicateFestRaid(s, s.offers[0], true)).toBe(true);
    expect(offerChance(s, 'mega')).toBeLessThan(1); // the Fest's rush is choppers and ships
  });
});
