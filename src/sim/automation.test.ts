import { describe, expect, it } from 'vitest';
import {
  AUTO_RESTOCK_DAY, autoRestock, automationAtDawn, helperLines, LOTTIES_CORNER, migrateSave, newGame, newStand, nudgeStockTarget, openStands,
  pitcherNeeds, playerStands, prepPreview, priceCeiling, registerHelper, restockGoal, restockOn, restockPlan, servingsAvailable, setRecipe,
  setStockTarget, simulateRestOfDay, sleepUntilDawn, stock, stockCapCups, stockTarget, suggestedTarget, SUPPLIES, tickMinute, toggleAutoRestock,
  unregisterHelper, type GameState, type SupplyId,
} from './economy.ts';

const SUPPLY_IDS = Object.keys(SUPPLIES) as SupplyId[];

/** Business days and nights until dawn of `day`, cash topped up so the run never goes broke. */
function playTo(s: GameState, day: number): void {
  while (s.day < day) {
    s.cash = Math.max(s.cash, 400);
    openStands(s);
    simulateRestOfDay(s);
    sleepUntilDawn(s);
  }
}

/** A second player stand next to the Corner, priced at its ceiling. */
function sideLot(s: GameState): string {
  const id = 'maple-1n';
  s.plots[id].owner = 'player';
  s.plots[id].stand = newStand(1);
  s.plots[id].stand!.price = priceCeiling(s, id);
  return id;
}

/** What a stand's stock is worth at today's market prices. */
const worth = (s: GameState, plotId: string) => {
  const st = s.plots[plotId].stand!;
  return SUPPLY_IDS.reduce((a, id) => a + stock(st, id) * s.market[id], 0);
};

describe('Auto-Restock', () => {
  it('arrives on Day 3, and every dawn tops each stand up to the forecast day\'s expected sales at that day\'s prices', () => {
    const s = newGame(11);
    const st = s.plots[LOTTIES_CORNER].stand!;
    expect(st.autoRestock).toBe(true); // a switch every stand has, on unless it opts out
    playTo(s, 2);
    expect(restockOn(s, st)).toBe(false);
    expect(s.today.auto).toBeUndefined(); // Lottie doesn't buy on Days 1-2
    expect(servingsAvailable(st)).toBe(0);
    playTo(s, AUTO_RESTOCK_DAY);
    expect(restockOn(s, st)).toBe(true);
    expect(s.news.some((n) => n.includes('From today I stock every stand at dawn'))).toBe(true);
    const target = stockTarget(s, LOTTIES_CORNER);
    expect(target).toBe(suggestedTarget(s, LOTTIES_CORNER));
    expect(target).toBeGreaterThan(0);
    expect(servingsAvailable(st)).toBeGreaterThanOrEqual(target);
    expect(servingsAvailable(st)).toBeLessThan(target + 50); // whole packs: never a pack more than it needs
    const book = s.today.auto!.restock!;
    expect(book.spent).toBeCloseTo(worth(s, LOTTIES_CORNER), 1); // bought at this dawn's market prices
    expect(s.today.supplies).toBeCloseTo(book.spent, 6);
    expect(book).toMatchObject({ count: 1, amount: target });
    // The next dawn buys only what the day used: the ice melted, so a full day of it, and the lemons and sugar left over count.
    simulateRestOfDay((openStands(s), s));
    const lemonsLeft = stock(st, 'lemons');
    sleepUntilDawn(s);
    expect(servingsAvailable(st)).toBeGreaterThanOrEqual(stockTarget(s, LOTTIES_CORNER));
    expect(stock(st, 'lemons') - lemonsLeft).toBeLessThan(pitcherNeeds(st).lemons * Math.ceil(stockTarget(s, LOTTIES_CORNER) / 10) + SUPPLIES.lemons.pack);
  });

  it('holds the target you set, within the level\'s stock cap, and a raised target is stocked straight away', () => {
    const s = newGame(12);
    playTo(s, AUTO_RESTOCK_DAY);
    const st = s.plots[LOTTIES_CORNER].stand!;
    setStockTarget(s, LOTTIES_CORNER, 200); // the worked example's 200 cups
    expect(stockTarget(s, LOTTIES_CORNER)).toBe(200);
    expect(servingsAvailable(st)).toBeGreaterThanOrEqual(200);
    setStockTarget(s, LOTTIES_CORNER, 5000);
    expect(stockTarget(s, LOTTIES_CORNER)).toBe(stockCapCups(1)); // an L1 holds 300 cups
    setStockTarget(s, LOTTIES_CORNER, 187);
    nudgeStockTarget(s, LOTTIES_CORNER, 1);
    expect(st.stockTarget).toBe(190); // a step is 10 cups at an L1
    nudgeStockTarget(s, LOTTIES_CORNER, -1);
    nudgeStockTarget(s, LOTTIES_CORNER, -1);
    expect(st.stockTarget).toBe(170);
    playTo(s, AUTO_RESTOCK_DAY + 1);
    expect(stockTarget(s, LOTTIES_CORNER)).toBe(170);
    expect(servingsAvailable(st)).toBeGreaterThanOrEqual(170);
    setStockTarget(s, LOTTIES_CORNER, null); // back to the suggestion
    expect(stockTarget(s, LOTTIES_CORNER)).toBe(suggestedTarget(s, LOTTIES_CORNER));
  });

  it('leaves alone any stand that opts out, and a stand switched back on is stocked at once', () => {
    const s = newGame(13);
    const side = sideLot(s);
    toggleAutoRestock(s, side); // off
    playTo(s, AUTO_RESTOCK_DAY);
    expect(servingsAvailable(s.plots[side].stand!)).toBe(0);
    expect(servingsAvailable(s.plots[LOTTIES_CORNER].stand!)).toBeGreaterThan(0);
    expect(s.today.auto!.restock!.count).toBe(1);
    const spent = s.today.auto!.restock!.spent;
    toggleAutoRestock(s, side); // on again at Morning Prep
    expect(servingsAvailable(s.plots[side].stand!)).toBeGreaterThanOrEqual(stockTarget(s, side));
    expect(s.today.auto!.restock!.spent).toBeGreaterThan(spent);
    openStands(s);
    expect(s.today.auto!.restock!.count).toBe(2); // the Ledger line counts the stands it looked after
  });

  it('spends only the cash there is, stocking the busiest stand first and each one evenly', () => {
    const s = newGame(14);
    const side = sideLot(s);
    playTo(s, AUTO_RESTOCK_DAY);
    s.plots[LOTTIES_CORNER].stand!.inventory = { lemons: [], sugar: 0, ice: 0, sugarCost: 0, iceCost: 0 };
    s.plots[side].stand!.inventory = { lemons: [], sugar: 0, ice: 0, sugarCost: 0, iceCost: 0 };
    s.cash = 8;
    const plan = restockPlan(s, LOTTIES_CORNER);
    expect(plan.cost).toBeLessThanOrEqual(8);
    expect(plan.cups).toBeLessThan(plan.goal);
    const [busy, other] = playerStands(s).map((p) => ({ id: p.id, goal: stockTarget(s, p.id) })).sort((a, b) => b.goal - a.goal).map((g) => g.id);
    automationAtDawn(s);
    expect(s.cash).toBeGreaterThanOrEqual(0);
    const st = s.plots[busy].stand!;
    expect(servingsAvailable(st)).toBeGreaterThan(0);
    expect(servingsAvailable(s.plots[other].stand!)).toBeLessThan(servingsAvailable(st));
    // Evenly: no supply covers more than a pack's worth of cups beyond the one that runs out first.
    const n = pitcherNeeds(st);
    const covers = [Math.floor(stock(st, 'lemons') / n.lemons) * 10, Math.floor(st.inventory.sugar / n.sugar) * 10, Math.floor(st.inventory.ice / n.icePerCup)];
    expect(Math.max(...covers) - Math.min(...covers)).toBeLessThanOrEqual(50);
    s.cash = 0;
    expect(autoRestock(s, busy)).toBe(0);
  });

  it('Morning Prep previews the day\'s automatic spending, and Open buys what Prep changed', () => {
    const s = newGame(15);
    playTo(s, AUTO_RESTOCK_DAY);
    const st = s.plots[LOTTIES_CORNER].stand!;
    const dawn = s.today.auto!.restock!.spent;
    expect(prepPreview(s)).toEqual([{ id: 'restock', name: 'Auto-Restock', count: 1, spent: dawn, pending: 0 }]);
    setRecipe(st, 'frozen'); // twice the ice a cup
    const pending = prepPreview(s)[0].pending;
    expect(pending).toBeGreaterThan(0);
    expect(pending).toBeCloseTo(restockPlan(s, LOTTIES_CORNER).cost, 6);
    openStands(s);
    expect(s.today.auto!.restock!.spent).toBeCloseTo(dawn + pending, 6);
    expect(servingsAvailable(st)).toBeGreaterThanOrEqual(restockPlan(s, LOTTIES_CORNER).goal);
    expect(prepPreview(s)[0].pending).toBe(0); // no more to come once the stands are open
    simulateRestOfDay(s);
    expect(helperLines(s.history[s.history.length - 1])).toEqual([
      { id: 'restock', name: 'Auto-Restock', line: `1 stand to ${s.today.auto!.restock!.amount} cups`, spent: s.today.auto!.restock!.spent },
    ]);
  });

  it('a sold-out card\'s Restock now buys no more than the pour left, and nothing once the market has shut', () => {
    const s = newGame(16);
    playTo(s, AUTO_RESTOCK_DAY);
    const st = s.plots[LOTTIES_CORNER].stand!;
    openStands(s);
    for (let i = 0; i < 400; i++) tickMinute(s);
    st.inventory = { lemons: [], sugar: 0, ice: 0, sugarCost: 0, iceCost: 0 };
    st.pitcherCups = 0;
    expect(restockGoal(s, LOTTIES_CORNER)).toBeLessThanOrEqual(stockTarget(s, LOTTIES_CORNER));
    autoRestock(s, LOTTIES_CORNER);
    expect(servingsAvailable(st)).toBeGreaterThanOrEqual(restockGoal(s, LOTTIES_CORNER));
    simulateRestOfDay(s);
    expect(s.phase).toBe('report');
    expect(restockGoal(s, LOTTIES_CORNER)).toBe(0);
    expect(autoRestock(s, LOTTIES_CORNER)).toBe(0); // and it comes straight back
  });

  it('skips a wrecked stand', () => {
    const s = newGame(17);
    playTo(s, AUTO_RESTOCK_DAY);
    const st = s.plots[LOTTIES_CORNER].stand!;
    st.inventory = { lemons: [], sugar: 0, ice: 0, sugarCost: 0, iceCost: 0 };
    st.wrecked = true;
    s.today.auto = undefined;
    automationAtDawn(s);
    expect(servingsAvailable(st)).toBe(0);
    expect(s.today.auto).toBeUndefined();
  });
});

describe('the automation frame', () => {
  it('runs a registered helper at dawn and gives it a one-line Ledger report', () => {
    registerHelper({
      id: 'test', name: 'Test Helper', unlocked: (s) => s.day >= 2,
      atDawn: (s) => { s.cash -= 5; return { spent: 5, count: playerStands(s).length, amount: 0 }; },
      line: (d) => `${d.count} plot${d.count === 1 ? '' : 's'}`,
    });
    try {
      const s = newGame(18);
      playTo(s, 2);
      expect(s.today.auto!.test).toEqual({ spent: 5, count: 1, amount: 0 });
      expect(helperLines(s.today).map((h) => h.line)).toEqual(['1 plot']);
      expect(prepPreview(s).map((p) => p.name)).toEqual(['Test Helper']);
    } finally {
      unregisterHelper('test');
    }
  });

  it('older saves get Auto-Restock on every stand, with the suggested target; a save made since keeps its opt-outs', () => {
    const s = newGame(19);
    const side = sideLot(s);
    const old = JSON.parse(JSON.stringify(s)) as GameState;
    for (const ps of Object.values(old.plots)) if (ps.stand) { ps.stand.autoRestock = false; delete ps.stand.stockTarget; }
    const m = migrateSave(old)!;
    expect(m.plots[LOTTIES_CORNER].stand!.autoRestock).toBe(true);
    expect(m.plots[LOTTIES_CORNER].stand!.stockTarget).toBeNull();
    toggleAutoRestock(s, side);
    const again = migrateSave(JSON.parse(JSON.stringify(s)))!;
    expect(again.plots[side].stand!.autoRestock).toBe(false);
    expect(again.plots[LOTTIES_CORNER].stand!.autoRestock).toBe(true);
  });
});
