import { describe, expect, it } from 'vitest';
import {
  costPerCup, cupsInStock, demandChain, LOTTIES_CORNER, newGame, newStand, openStands, pitcherNeeds, priceCeiling, RECIPES, repMultiplier,
  rowAmount, simulateRestOfDay, STAND_LEVELS, SUPPLIES, type GameState, type WeatherKind,
} from './economy.ts';

/**
 * The spec's worked example (design-spec: Worked example: a hot Summer day at Lottie's Corner): Day 3, Summer, Lottie's
 * Corner (400 passersby), Pink at Classic Sweetness priced at the ceiling, exactly `cups` cups in stock bought at the
 * Market's base prices, 3.0 stars, no marketing and no rival within 2 plots.
 */
function example(seed: number, kind: WeatherKind = 'hot', temp = 88, level = 1, cups = 200): GameState {
  const s = newGame(seed);
  s.day = 3;
  s.forecast = { kind, temp };
  s.weather = { kind, temp };
  s.market = { lemons: SUPPLIES.lemons.baseUnitPrice, sugar: SUPPLIES.sugar.baseUnitPrice, ice: SUPPLIES.ice.baseUnitPrice };
  const st = s.plots[LOTTIES_CORNER].stand!;
  st.level = level;
  st.hp = STAND_LEVELS[level - 1].hp;
  st.recipe = 'pink';
  st.sweetness = 'classic';
  st.price = priceCeiling(s, LOTTIES_CORNER);
  st.autoRestock = false; // the test stocks it
  const n = pitcherNeeds(st); // a pitcher pours 10 cups
  st.inventory = {
    lemons: [{ qty: (n.lemons * cups) / 10, day: s.day, unitCost: s.market.lemons }], sugar: (n.sugar * cups) / 10, ice: n.icePerCup * cups,
    sugarCost: s.market.sugar, iceCost: s.market.ice,
  };
  st.pitcherCups = 0;
  return s;
}

/** One business day of the example: the Corner's cups and its Ledger rows (the stand's own: sales, supplies, upkeep). */
function play(s: GameState) {
  const { kind, temp } = s.weather;
  openStands(s);
  s.weather = { kind, temp }; // the day's weather is the forecast's
  simulateRestOfDay(s);
  const t = s.today;
  const sales = rowAmount(t, 'sales'), supplies = rowAmount(t, 'supplies'), upkeep = rowAmount(t, 'upkeep');
  return { sold: t.customers, line: t.walkedPast.line, sales, supplies, upkeep, profit: sales + supplies + upkeep, waste: t.waste ?? 0 };
}

/** The averages over `n` seeds (customers are drawn at random each minute). */
function average(n: number, make: (seed: number) => GameState) {
  const days = Array.from({ length: n }, (_, i) => play(make(i + 1)));
  const avg = (k: keyof (typeof days)[0]) => days.reduce((a, d) => a + d[k], 0) / n;
  return { days, sold: avg('sold'), line: avg('line'), sales: avg('sales'), supplies: avg('supplies'), profit: avg('profit'), waste: avg('waste') };
}

describe('the worked example: a hot Summer day at Lottie\'s Corner', () => {
  it('works each step on the expected numbers: 480 passersby, a 39% stop chance, 187 cups, $243.32 profit', () => {
    const s = example(1);
    const st = s.plots[LOTTIES_CORNER].stand!;
    const c = demandChain(s, LOTTIES_CORNER)!;
    // 1. Passersby: 400 × 1.0 draw × 1.0 marketing × 1.2 Summer × 1.0 weather traffic.
    expect([c.traffic, c.draw, c.marketing, c.season, c.weather, c.lunch, c.kept]).toEqual([400, 1, 1, 1.2, 1, 1, 1]);
    expect(c.passersby).toBe(480);
    // 2. Stop chance: 25% × 1.3 Hot thirst × 1.2 Pink in Maple Row × 1.0 curb × 1.0 Reputation × 1.0 price fit at the ceiling.
    expect([c.base, c.thirst, c.curb, c.sweet, c.priceFit, c.reputation]).toEqual([0.25, 1.3, 1, 1, 1, 1]);
    expect(c.recipe).toBeCloseTo(1.2, 9);
    expect(c.stopChance).toBeCloseTo(0.39, 9);
    expect([c.price, c.ceiling]).toEqual([1.57, 1.57]); // the $1.575 ceiling, to the cent
    // 3. Cups: demand 187, service 20 an hour × 10 hours, 200 in stock: it sells 187.
    expect([c.demand, c.service, c.stock, c.cups, c.binding]).toEqual([187, 200, 200, 187, 'demand']);
    expect(cupsInStock(s, LOTTIES_CORNER)).toBe(200);
    // 4. The money at 187 cups: Pink costs $0.24 a cup, and the 13 cups' ice left at closing melts ($0.03 a cup).
    const per = costPerCup(s, st);
    const icePerCup = RECIPES.pink.icePerCup * SUPPLIES.ice.baseUnitPrice;
    expect(per).toBeCloseTo(0.24, 9);
    expect(icePerCup).toBeCloseTo(0.03, 9);
    const revenue = 187 * c.price, supplies = 187 * per + (200 - 187) * icePerCup, upkeep = STAND_LEVELS[0].upkeep;
    expect(revenue).toBeCloseTo(293.59, 6);
    expect(supplies).toBeCloseTo(45.27, 6);
    expect(upkeep).toBe(5);
    expect(revenue - supplies - upkeep).toBeCloseTo(243.32, 6);
  });

  it('plays out that way on the Ledger: every seed\'s rows are its cups at those prices, and the average is the example', () => {
    const run = average(12, (seed) => example(seed));
    for (const d of run.days) {
      expect(d.sales).toBeCloseTo(d.sold * 1.57, 2);
      expect(d.supplies).toBeCloseTo(-(d.sold * 0.24 + (200 - d.sold) * 0.03), 2); // cups sold, plus the ice that melted
      expect(d.upkeep).toBe(-5);
    }
    expect(Math.abs(run.sold - 187)).toBeLessThan(6);
    expect(Math.abs(run.sales - 293.59)).toBeLessThan(10);
    expect(Math.abs(-run.supplies - 45.27)).toBeLessThan(1.5);
    expect(Math.abs(run.profit - 243.32)).toBeLessThan(10);
  });

  it('on a Scorcher the same table draws about 230 and pours 200, and the rest leave "line too long"', () => {
    const f = example(1, 'scorcher', 99);
    const c = demandChain(f, LOTTIES_CORNER)!;
    expect(c.demand).toBe(230);
    expect([c.cups, c.binding]).toEqual([200, 'service']);
    const run = average(8, (seed) => example(seed, 'scorcher', 99));
    expect(run.days.every((d) => d.sold === 200)).toBe(true);
    expect(run.line).toBeGreaterThan(20); // about 30, more when the rush bunches up
    expect(run.line).toBeLessThan(50);
  });

  it('an L2 Wooden Stand there sells about 280 cups at $2.10, clears about $505 and repays its $400 in under 2 such days', () => {
    const make = (seed: number) => example(seed, 'hot', 88, 2, 300);
    const c = demandChain(make(1), LOTTIES_CORNER)!;
    expect([c.price, c.draw, c.service]).toEqual([2.1, 1.5, 500]);
    expect(c.demand).toBe(281);
    const run = average(12, make);
    expect(Math.abs(run.sold - 280)).toBeLessThan(10);
    expect(Math.abs(run.profit - 505)).toBeLessThan(25);
    expect(2 * run.profit).toBeGreaterThan(STAND_LEVELS[1].cost);
  });

  it('on a Rainy day it sells about 50 cups, and stocking 200 melts about $4.50 of ice', () => {
    const c = demandChain(example(1, 'rainy', 60), LOTTIES_CORNER)!;
    expect(c.demand).toBe(50);
    const run = average(12, (seed) => example(seed, 'rainy', 60));
    expect(Math.abs(run.sold - 50)).toBeLessThan(5);
    expect(Math.abs(run.waste - 4.5)).toBeLessThan(0.2); // 150 cups' ice × $0.03
  });
});

describe('Appendix B: a summer day (Day 12)', () => {
  it('5 Wooden Stands in Maple Row, Pink at $2.10, 3.2 stars and Hand-Painted Signs: the Corner draws about 304 cups', () => {
    const s = newGame(5);
    s.day = 12;
    s.rank = 3;
    s.reputation = 3.2;
    s.brandTier = 1;
    s.forecast = s.weather = { kind: 'hot', temp: 91 };
    s.market = { lemons: SUPPLIES.lemons.baseUnitPrice * 1.2, sugar: SUPPLIES.sugar.baseUnitPrice * 0.9, ice: SUPPLIES.ice.baseUnitPrice };
    const plots = [LOTTIES_CORNER, 'maple-0n', 'maple-0s', 'maple-1n', 'maple-1s']; // four others with 260-350 passersby
    for (const id of plots) {
      const ps = s.plots[id];
      ps.owner = 'player';
      ps.stand = newStand(2);
      Object.assign(ps.stand, { recipe: 'pink', sweetness: 'classic', autoRestock: false });
      ps.stand.price = priceCeiling(s, id);
      ps.stand.inventory = { lemons: [{ qty: 400, day: 12, unitCost: s.market.lemons }], sugar: 800, ice: 3000, sugarCost: s.market.sugar, iceCost: s.market.ice };
    }
    const c = demandChain(s, LOTTIES_CORNER)!;
    // 400 passersby × 1.5 draw × 1.05 signs × 1.2 Summer × 1.3 thirst × 25% stop × 1.2 Pink × 1.03 Reputation ≈ 304 cups.
    expect([c.price, c.draw, c.marketing, c.season, c.thirst, c.base]).toEqual([2.1, 1.5, 1.05, 1.2, 1.3, 0.25]);
    expect(c.reputation).toBeCloseTo(repMultiplier(3.2), 9);
    expect(c.reputation).toBeCloseTo(1.03, 9);
    expect(c.passersby).toBe(756);
    expect(Math.round(c.passersby * c.stopChance)).toBe(304);
    // Its neighbors share its walkers by appeal, but customers shared with your own stands stay yours: the five
    // stands' demand is what each would draw alone.
    const chains = plots.map((id) => demandChain(s, id)!);
    const alone = chains.reduce((a, x) => a + x.passersby * x.stopChance, 0);
    const shared = chains.reduce((a, x) => a + x.demand, 0);
    expect(Math.abs(shared - alone)).toBeLessThan(plots.length); // whole cups each
    // The day's cost per cup with lemons up 20% and sugar down 10%: $0.26 instead of $0.24.
    expect(costPerCup(s, s.plots[LOTTIES_CORNER].stand!).toFixed(2)).toBe('0.26');
    expect(STAND_LEVELS[1].upkeep * plots.length).toBe(75);
  });
});
