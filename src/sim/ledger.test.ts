import { describe, expect, it } from 'vitest';
import * as balance from './balance.ts';
import {
  borrow, buySupply, closeAuctions, costPerCup, dayCash, dayProfit, FACTIONS, guardWage, hireGuard, LAVENDER, LAVENDER_LOT, ledgerLines,
  LOTTIES_CORNER, migrateSave, newGame, newStand, openLavender, openStands, placeBid, priceCeiling, rowAmount, runCampaign,
  simulateRestOfDay, sleepUntilDawn, successScore, upgradeStand, welcomeDex,
  type GameState, type RivalId,
} from './economy.ts';

/** Business days and nights until dawn of `day`, cash topped up so the run never goes broke. */
function playTo(s: GameState, day: number): void {
  while (s.day < day) {
    s.cash = Math.max(s.cash, 400);
    openStands(s);
    simulateRestOfDay(s);
    sleepUntilDawn(s);
  }
}

const bare = (s: GameState) => {
  const st = s.plots[LOTTIES_CORNER].stand!;
  st.autoRestock = false;
  st.inventory = { lemons: [], sugar: 0, ice: 0, sugarCost: 0, iceCost: 0 };
  st.pitcherCups = 0;
  return st;
};

describe('the Ledger', () => {
  it('pays a guard\'s wage once: one Folding Table, Dex the only guard, a day with no sales costs $15 + $5', () => {
    const s = newGame(12345);
    playTo(s, 3);
    welcomeDex(s);
    expect(s.guards).toHaveLength(1);
    const wage = guardWage(s.guards[0]);
    expect(wage).toBe(15);
    bare(s);
    openStands(s);
    simulateRestOfDay(s);
    s.cash = 100;
    sleepUntilDawn(s); // the wage leaves at dawn
    bare(s);
    const cash = s.today.cashAtDawn!;
    openStands(s);
    simulateRestOfDay(s); // and the stand's upkeep at closing, nothing more
    const t = s.today;
    expect(t.customers).toBe(0);
    expect(t.books!.wages).toBe(-15);
    expect(t.books!.upkeep).toBe(-5);
    expect(t.upkeep).toBe(5); // stand upkeep only
    expect(s.cash).toBeCloseTo(cash - 20, 6);
    expect(dayProfit(t)).toBeCloseTo(-20, 6);
    const { pnl } = ledgerLines(t);
    expect(pnl.find((l) => l.row === 'wages')!.label).toBe('Wages: 1 guard');
    expect(pnl.find((l) => l.row === 'upkeep')!.label).toBe('Upkeep: 1 stand');
  });

  it('every cash movement lands on one row: each day\'s rows add up to its change in cash, dawn to dawn', () => {
    const s = newGame(21);
    playTo(s, 3);
    s.cash = 5000;
    const side = 'maple-1n'; // land, a stand, an upgrade, a campaign, a hire and gear, a loan
    s.plots[side].owner = 'player';
    s.plots[side].stand = newStand(1);
    s.plots[side].stand!.price = priceCeiling(s, side);
    s.rank = 3;
    welcomeDex(s);
    for (let d = 0; d < 8; d++) {
      if (d === 1) upgradeStand(s, LOTTIES_CORNER);
      if (d === 2) runCampaign(s, 'sandwichBoard', LOTTIES_CORNER);
      if (d === 3 && s.recruits.length) hireGuard(s, s.recruits[0].id);
      if (d === 4) borrow(s, 200);
      openStands(s);
      simulateRestOfDay(s);
      sleepUntilDawn(s);
    }
    const days = s.history.filter((h) => h.day >= 4); // from the first day this test leaves the cash alone
    expect(days.length).toBeGreaterThan(6);
    for (let i = 0; i + 1 < days.length; i++) {
      if (days[i + 1].day !== days[i].day + 1) continue;
      expect(dayCash(days[i])).toBeCloseTo(days[i + 1].cashAtDawn! - days[i].cashAtDawn!, 1);
      const rows = ledgerLines(days[i]);
      const sum = [...rows.pnl, ...rows.below].reduce((a, l) => a + l.amount, 0);
      expect(sum).toBeCloseTo(dayCash(days[i]), 1); // the rows shown add up too (rows at $0 aside)
    }
    const all = new Set(s.history.flatMap((h) => Object.keys(h.books ?? {})));
    for (const row of ['sales', 'supplies', 'stock', 'upkeep', 'wages', 'invested', 'marketing', 'loan']) expect(all.has(row)).toBe(true);
  });

  it('Supplies are what the day used: cups sold at the day\'s cost per cup, plus stock that melted; deep stocking costs nothing', () => {
    const s = newGame(22);
    playTo(s, 3);
    s.cash = 2000;
    s.plots[LOTTIES_CORNER].stand!.price = Math.round(priceCeiling(s, LOTTIES_CORNER) * 115) / 100; // 15% over: the day sells less than Auto-Restock stocked, so ice is left to melt
    const deep = structuredClone(s);
    const st = deep.plots[LOTTIES_CORNER].stand!;
    while (buySupply(deep, 'sugar', 1, st)); // a cellar of sugar keeps: no cost of the day
    for (const g of [s, deep]) { openStands(g); simulateRestOfDay(g); }
    const t = s.today;
    const per = costPerCup(s, s.plots[LOTTIES_CORNER].stand!);
    expect(t.customers).toBeGreaterThan(50);
    expect(t.iceMelted).toBeGreaterThan(0);
    expect(t.waste).toBeGreaterThan(0);
    expect(rowAmount(t, 'supplies')).toBeCloseTo(-(t.customers * per) - t.waste!, 0);
    expect(ledgerLines(t).pnl.find((l) => l.row === 'supplies')!.label).toBe(`Supplies: ${t.customers} cups at $${per.toFixed(2)}`);
    expect(ledgerLines(t).pnl.find((l) => l.row === 'sales')!.label).toMatch(new RegExp(`^Sales: ${t.customers} cups at \\$\\d+\\.\\d\\d$`));
    expect(deep.today.supplies).toBeGreaterThan(t.supplies); // it bought more
    expect(dayProfit(deep.today)).toBeCloseTo(dayProfit(t), 6); // and made the same
    expect(rowAmount(deep.today, 'stock')).toBeLessThan(rowAmount(t, 'stock')); // the difference went into stock
  });

  it('has no property tax, and charts the Success Score at every close from Day 1', () => {
    expect('PROPERTY_TAX_WEEKLY' in balance).toBe(false);
    const s = newGame(23);
    expect('tax' in s.today).toBe(false);
    playTo(s, 5);
    expect(s.scores).toHaveLength(4);
    expect(s.scores!.every((v) => typeof v === 'number' && v > 0)).toBe(true);
    openStands(s);
    simulateRestOfDay(s);
    expect(s.scores![4]).toBe(Math.round(successScore(s)));
    // An older save: the closes its history still knows.
    const old = JSON.parse(JSON.stringify(s)) as GameState;
    delete old.scores;
    const m = migrateSave(old)!;
    expect(m.scores).toEqual(s.history.slice(1).map((h) => Math.round(h.scoreBefore))); // each close is the next opening
  });

  it('the Lavender page goes on the Other row: a cost of the day, not Invested', () => {
    const s = newGame(71);
    s.rank = 8;
    s.cash = 1e7;
    for (const id of Object.keys(FACTIONS) as RivalId[]) s.rivals[id].cash = 0; // nobody else can bid
    openLavender(s);
    expect(placeBid(s, LAVENDER_LOT, LAVENDER.open)).toBe(true);
    s.day++;
    closeAuctions(s);
    expect(s.lavender?.winner).toBe('player');
    const t = s.today;
    expect(rowAmount(t, 'other')).toBe(-LAVENDER.open);
    expect(rowAmount(t, 'invested')).toBe(0);
    expect(dayProfit(t)).toBe(-LAVENDER.open);
    expect(ledgerLines(t).pnl.find((l) => l.row === 'other')?.label).toBe('Other');
  });
});
