import { describe, expect, it } from 'vitest';
import {
  AUTO_PRICE, AUTO_PRICE_RANK, AUTO_RESTOCK_DAY, autoRestock, automationAtDawn, bestSetting, costPerCup, expectedCups, helperLines, helpers,
  LOTTIES_CORNER, migrateSave, newGame, newStand, nudgeStockTarget, openStands, owedCups, ownedRecipes, pickRecipe, pitcherNeeds, playerStands, prepPreview,
  priceCeiling, pricingOn, registerHelper, restockGoal, restockOn, restockPlan, serviceLeft, servingsAvailable, setByHand, setPrice, setRecipe, setStockTarget,
  simulateRestOfDay, sleepUntilDawn, stock, stockCapCups, stockTarget, suggestedTarget, SUPPLIES, tickMinute, toggleAutoPrice, toggleAutoRestock,
  unregisterHelper, upgradeStand, type GameState, type Order, type RecipeId, type SupplyId, type Sweetness,
} from './economy.ts';

const SUPPLY_IDS = Object.keys(SUPPLIES) as SupplyId[];
const SWEETS: Sweetness[] = ['less', 'classic', 'extra'];

/** Business days and nights until dawn of `day`, cash topped up so the run never goes broke. */
function playTo(s: GameState, day: number): void {
  while (s.day < day) {
    s.cash = Math.max(s.cash, 400);
    openStands(s);
    simulateRestOfDay(s);
    sleepUntilDawn(s);
  }
}

/** A second player stand next to the Corner (or at `id`), priced at its ceiling. */
function sideLot(s: GameState, id = 'maple-1n'): string {
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
  it('arrives on Day 2, and every dawn tops each stand up to the forecast day\'s expected sales at that day\'s prices', () => {
    const s = newGame(11);
    const st = s.plots[LOTTIES_CORNER].stand!;
    expect(st.autoRestock).toBe(true); // a switch every stand has, on unless it opts out
    expect(restockOn(s, st)).toBe(false);
    expect(s.today.auto).toBeUndefined(); // nothing bought on Day 1: Lottie stocks the table for free (story.ts)
    openStands(s); simulateRestOfDay(s);
    st.inventory = { lemons: [], sugar: 0, ice: 0, sugarCost: 0, iceCost: 0 }; // her gift gone, Day 2's dawn buys it all
    playTo(s, AUTO_RESTOCK_DAY);
    expect(restockOn(s, st)).toBe(true);
    expect(s.news.some((n) => n.startsWith('Lottie: "From today'))).toBe(true); // the Market's lesson (story.ts)
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
    expect(prepPreview(s)).toEqual([{ id: 'restock', name: 'Auto-Restock', count: 1, spent: dawn, pending: 0, at: 'Open', line: `1 stand to ${s.today.auto!.restock!.amount} cups` }]);
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

  it("stocks a stand for its Local Order too: a 300-cup order at an L3 on the suggested target is poured by its deadline", () => {
    const s = newGame(41);
    playTo(s, AUTO_RESTOCK_DAY);
    s.rank = 3;
    s.cash = 20_000;
    const st = s.plots[LOTTIES_CORNER].stand!;
    st.level = 3;
    playTo(s, AUTO_RESTOCK_DAY + 1); // a day as a Kiosk, then a fresh dawn
    expect(st.stockTarget).toBeNull(); // on the suggestion
    const walkIns = suggestedTarget(s, LOTTIES_CORNER);
    expect(owedCups(s, LOTTIES_CORNER)).toBe(0);
    // Accepted the day after it was offered: two days to pour 300 cups, each an hour before closing.
    const o: Order = { id: 'lo', tier: 'local', client: 'the Maple Row Block Party', qty: 300, pay: Math.round(300 * st.price * 1.5), due: s.day + 1, expires: s.day, plot: LOTTIES_CORNER, accepted: true };
    s.orders.push(o);
    expect(owedCups(s, LOTTIES_CORNER)).toBe(300);
    expect(owedCups(s, 'maple-1n')).toBe(0); // only the stand that pours it
    expect(suggestedTarget(s, LOTTIES_CORNER)).toBe(Math.min(stockCapCups(3), walkIns + 300));
    expect(restockPlan(s, LOTTIES_CORNER).goal).toBe(stockTarget(s, LOTTIES_CORNER)); // Open stocks for it
    while (s.day <= o.due) {
      openStands(s);
      if (s.day === o.due) { // Restock now, mid-day, fills for the order as well as the pour left
        for (let i = 0; i < 120; i++) tickMinute(s);
        expect(restockGoal(s, LOTTIES_CORNER)).toBe(Math.min(stockTarget(s, LOTTIES_CORNER), serviceLeft(s, LOTTIES_CORNER) + owedCups(s, LOTTIES_CORNER)));
      }
      simulateRestOfDay(s);
      s.cash = Math.max(s.cash, 5000);
      sleepUntilDawn(s);
    }
    expect(o.loaded).toBe(300);
    expect(s.orders).not.toContain(o);
    expect(s.news.some((n) => n.startsWith('Order fell through'))).toBe(false);
    expect(owedCups(s, LOTTIES_CORNER)).toBe(0); // and the target goes back to the walk-in sales
    expect(suggestedTarget(s, LOTTIES_CORNER)).toBe(Math.min(stockCapCups(3), expectedCups(s, LOTTIES_CORNER, s.forecast)));
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

/** One business day and night, with cash enough that nothing runs short at the next dawn. */
function nextDawn(s: GameState): void {
  s.cash = Math.max(s.cash, 400);
  openStands(s);
  simulateRestOfDay(s);
  s.cash = Math.max(s.cash, 5000);
  sleepUntilDawn(s);
}

/** What a card and Sweetness should make at a stand on the forecast day, priced at its top. */
function profitOf(s: GameState, plotId: string, recipe: RecipeId, sweetness: Sweetness): number {
  const c = structuredClone(s);
  const st = c.plots[plotId].stand!;
  st.recipe = recipe;
  st.sweetness = sweetness;
  st.price = priceCeiling(c, plotId, st);
  return expectedCups(c, plotId, c.forecast) * (st.price - costPerCup(c, st));
}

describe("Marisol's Auto-Price", () => {
  it('waits for Rank 3, then each dawn gives every stand the card and Sweetness that should make the most, priced at the top', () => {
    const s = newGame(31);
    const side = sideLot(s, 'maple-5n'); // out of the Corner's reach, so each pick is the best on the street she leaves
    playTo(s, AUTO_RESTOCK_DAY);
    expect(s.today.auto!.price).toBeUndefined(); // below Rank 3 you price your own stands
    expect(prepPreview(s).map((p) => p.id)).toEqual(['restock']);
    s.rank = AUTO_PRICE_RANK;
    for (const id of [LOTTIES_CORNER, side]) setPrice(s.plots[id].stand!, 0.5);
    nextDawn(s);
    for (const id of [LOTTIES_CORNER, side]) {
      const st = s.plots[id].stand!;
      expect(st.price).toBe(priceCeiling(s, id));
      const mine = profitOf(s, id, st.recipe, st.sweetness);
      for (const r of ownedRecipes(s)) for (const v of SWEETS) expect(profitOf(s, id, r, v)).toBeLessThanOrEqual(mine + 1e-9);
      expect(restockPlan(s, id).cost).toBe(0); // Auto-Restock came after and stocked the card she picked
    }
    expect(helpers().map((h) => h.id).slice(0, 2)).toEqual([AUTO_PRICE, 'restock']);
    const book = s.today.auto!.price!;
    expect(book).toMatchObject({ spent: 0, count: 2 });
    expect(helperLines(s.today)[0]).toEqual({
      id: AUTO_PRICE, name: 'Auto-Price', spent: 0, line: `2 stands at the top${book.amount ? `, ${book.amount} new card${book.amount === 1 ? '' : 's'}` : ''}`,
    });
    nextDawn(s);
    expect(s.news.filter((n) => n.includes('Each morning I price every stand'))).toHaveLength(1); // she says it once
    expect(s.today.auto!.price).toMatchObject({ spent: 0, count: 2 });
  });

  it('a price set by hand takes the stand off Auto-Price; a card picked by hand stays, priced at its top', () => {
    const s = newGame(32);
    const side = sideLot(s);
    playTo(s, AUTO_RESTOCK_DAY);
    s.rank = AUTO_PRICE_RANK;
    nextDawn(s);
    const st = s.plots[LOTTIES_CORNER].stand!;
    const ss = s.plots[side].stand!;
    const other = ownedRecipes(s).find((r) => r !== st.recipe)!;
    pickRecipe(s, st, other);
    setByHand(s, LOTTIES_CORNER, 'card');
    expect(st.ownCard).toBe(true);
    expect(pricingOn(s, st)).toBe(true);
    expect(st.price).toBe(priceCeiling(s, LOTTIES_CORNER));
    const sweet = st.sweetness;
    setPrice(ss, 0.95);
    setByHand(s, side, 'price');
    expect(pricingOn(s, ss)).toBe(false);
    openStands(s);
    expect(ss.price).toBe(0.95); // the stands open with the price you set
    simulateRestOfDay(s);
    s.cash = 5000;
    sleepUntilDawn(s);
    expect([st.recipe, st.sweetness]).toEqual([other, sweet]);
    expect(st.price).toBe(priceCeiling(s, LOTTIES_CORNER));
    expect(ss.price).toBe(0.95);
    expect(s.today.auto!.price).toEqual({ spent: 0, count: 1, amount: 0 });
    // Switched back on at Morning Prep, Marisol sets the whole stand at once.
    toggleAutoPrice(s, side);
    expect(pricingOn(s, ss)).toBe(true);
    expect(ss.price).toBe(priceCeiling(s, side));
    expect(ss.recipe).toBe(bestSetting(s, side).recipe);
    toggleAutoPrice(s, LOTTIES_CORNER);
    expect(pricingOn(s, st)).toBe(false);
    toggleAutoPrice(s, LOTTIES_CORNER);
    expect(st.ownCard).toBe(false); // the card is hers to pick again
    const best = bestSetting(s, LOTTIES_CORNER);
    expect([st.recipe, st.sweetness, st.price]).toEqual([best.recipe, best.sweetness, priceCeiling(s, LOTTIES_CORNER)]);
  });

  it("weighs next-door stands against last night's street, then sets them all: their order never changes a pick", () => {
    for (const [seed, dear] of [[31, 0], [35, 1]] as const) {
      const s = newGame(seed);
      const side = sideLot(s); // next door to the Corner: the two split their walkers by appeal
      playTo(s, AUTO_RESTOCK_DAY);
      s.rank = AUTO_PRICE_RANK;
      nextDawn(s);
      // Last night's street: one stand's Pink far over its top at $3, so the other (Classic at 50¢) drew the walkers.
      // Whichever she set first, its new price would swing the other's best Sweetness.
      [LOTTIES_CORNER, side].forEach((id, i) => {
        const st = s.plots[id].stand!;
        Object.assign(st, { recipe: i === dear ? 'pink' : 'classic', sweetness: 'classic', ownCard: false, autoPrice: true });
        setPrice(st, i === dear ? 3 : 0.5);
      });
      const night = structuredClone(s);
      const picks = [LOTTIES_CORNER, side].map((id) => bestSetting(night, id));
      helpers().find((h) => h.id === AUTO_PRICE)!.atDawn!(s);
      [LOTTIES_CORNER, side].forEach((id, i) => {
        const st = s.plots[id].stand!;
        expect([st.recipe, st.sweetness, st.price]).toEqual([picks[i].recipe, picks[i].sweetness, priceCeiling(s, id)]);
      });
    }
  });

  it('follows the ceiling: an upgrade re-posts the price, and the stands open at the top', () => {
    const s = newGame(33);
    playTo(s, AUTO_RESTOCK_DAY);
    s.rank = AUTO_PRICE_RANK;
    nextDawn(s);
    const st = s.plots[LOTTIES_CORNER].stand!;
    const before = st.price;
    s.cash = 10000;
    expect(upgradeStand(s, LOTTIES_CORNER)).toBe(true);
    expect(st.price).toBe(priceCeiling(s, LOTTIES_CORNER));
    expect(st.price).toBeGreaterThan(before);
    st.price = 1; // anything Morning Prep moved behind her back
    openStands(s);
    expect(st.price).toBe(priceCeiling(s, LOTTIES_CORNER));
  });

  it('skips a wrecked stand, and does nothing below Rank 3', () => {
    const s = newGame(34);
    playTo(s, AUTO_RESTOCK_DAY);
    const st = s.plots[LOTTIES_CORNER].stand!;
    setPrice(st, 0.5);
    setByHand(s, LOTTIES_CORNER, 'price'); // no Marisol yet: nothing to opt out of
    expect(st.autoPrice).toBe(true);
    toggleAutoPrice(s, LOTTIES_CORNER);
    expect(st.autoPrice).toBe(true);
    expect(st.price).toBe(0.5);
    s.rank = AUTO_PRICE_RANK;
    st.wrecked = true;
    s.today.auto = undefined;
    automationAtDawn(s);
    expect(st.price).toBe(0.5);
    expect(s.today.auto).toBeUndefined(); // no line for her, nor for Auto-Restock
  });

  it('older saves: a run past Rank 3 keeps its own prices until switched on; an earlier run gets Auto-Price', () => {
    const s = newGame(35);
    const old = JSON.parse(JSON.stringify(s)) as GameState;
    for (const ps of Object.values(old.plots)) if (ps.stand) delete ps.stand.autoPrice;
    expect(migrateSave(JSON.parse(JSON.stringify(old)))!.plots[LOTTIES_CORNER].stand!.autoPrice).toBe(true);
    old.rank = AUTO_PRICE_RANK;
    const m = migrateSave(old)!;
    expect(pricingOn(m, m.plots[LOTTIES_CORNER].stand!)).toBe(false);
    const rival = Object.values(m.plots).find((ps) => ps.stand && ps.owner && ps.owner !== 'player')!;
    expect(rival.stand!.autoPrice).toBe(true); // a rival stand you take later comes with it on
    const again = migrateSave(JSON.parse(JSON.stringify(m)))!;
    expect(again.plots[LOTTIES_CORNER].stand!.autoPrice).toBe(false);
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
      expect(helperLines(s.today).map((h) => h.line)).toContain('1 plot');
      expect(prepPreview(s).map((p) => p.name)).toContain('Test Helper');
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
