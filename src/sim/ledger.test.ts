import { describe, expect, it } from 'vitest';
import * as balance from './balance.ts';
import {
  book, bookOther, borrow, buySupply, closeAuctions, costPerCup, dayCash, dayIncomeCosts, dayProfit, FACTIONS, guardWage, hireGuard, LAVENDER, LAVENDER_LOT, ledgerLines,
  LOTTIES_CORNER, makeTruce, migrateSave, newGame, newStand, openLavender, openStands, placeBid, priceCeiling, RECIPES, rowAmount, runCampaign,
  setStockTarget, simulateRestOfDay, SITDOWN_RANK, sleepUntilDawn, successScore, tickMinute, truceCost, upgradeStand, welcomeDex,
  type GameState, type RivalId,
} from './economy.ts';
import { answerCall, CALLS } from './calls.ts';

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
    expect(pnl.find((l) => l.row === 'upkeep')!.label).toBe('Upkeep: 1 Folding Table at $5');
  });

  it("Upkeep gives each level's count and daily price: 5 Wooden Stands at $15, or a mix in its title", () => {
    const s = newGame(24);
    playTo(s, 3);
    s.cash = 5000;
    const st = s.plots[LOTTIES_CORNER].stand!;
    st.level = 2;
    const ids = ['maple-1n', 'maple-2n', 'maple-3n', 'maple-4n'];
    for (const id of ids) { s.plots[id].owner = 'player'; s.plots[id].stand = newStand(2); }
    openStands(s);
    simulateRestOfDay(s);
    const up = () => ledgerLines(s.today).pnl.find((l) => l.row === 'upkeep')!;
    expect(up()).toMatchObject({ label: 'Upkeep: 5 Wooden Stands at $15', amount: -75 }); // Appendix B's Day 12
    sleepUntilDawn(s);
    s.plots[ids[0]].stand!.level = 1;
    openStands(s);
    simulateRestOfDay(s);
    expect(up()).toMatchObject({ label: 'Upkeep: 5 stands', amount: -65, title: '1 Folding Table at $5, 4 Wooden Stands at $15' });
  });

  it("Supplies count every cup poured, a Local Order's too, at the day's cost per cup; a Free Sample Day's cups are Marketing", () => {
    const s = newGame(25);
    playTo(s, 3);
    s.cash = 5000;
    s.rank = 3;
    const st = s.plots[LOTTIES_CORNER].stand!;
    st.level = 3;
    setStockTarget(s, LOTTIES_CORNER, 1800);
    s.orders.push({ id: 'lo', tier: 'local', client: 'Little League Opening Day', qty: 600, pay: 900, due: s.day, expires: s.day, plot: LOTTIES_CORNER, accepted: true });
    openStands(s);
    simulateRestOfDay(s);
    const t = s.today;
    const per = costPerCup(s, st);
    expect(t.counts!.supplies).toBe(600); // the order's cups
    const supplies = ledgerLines(t).pnl.find((l) => l.row === 'supplies')!;
    expect(supplies.label).toBe(`Supplies: ${(t.customers + 600).toLocaleString('en-US')} cups at $${per.toFixed(2)}`);
    expect(supplies.title).toContain('600 cups of them poured for orders');
    expect(-supplies.amount - (t.waste ?? 0)).toBeCloseTo((t.customers + 600) * per, 1);
    // A Free Sample Day: its 100 cups and their lemonade are the campaign's cost, and Supplies stays at the cost per cup.
    sleepUntilDawn(s);
    s.cash = 5000;
    expect(runCampaign(s, 'freeSamples', LOTTIES_CORNER)).toBe(true);
    const day = s.today;
    const cpc = costPerCup(s, st);
    expect(rowAmount(day, 'marketing')).toBeCloseTo(-100 * cpc, 2); // each free cup at the cost per cup, extras and all
    expect(rowAmount(day, 'supplies')).toBe(0); // nothing poured for sale yet
    openStands(s);
    simulateRestOfDay(s);
    const line = ledgerLines(day).pnl.find((l) => l.row === 'supplies')!;
    expect(line.label).toBe(`Supplies: ${day.customers} cups at $${cpc.toFixed(2)}`);
    expect(ledgerLines(day).pnl.find((l) => l.row === 'marketing')!.title).toBe('With 100 free samples: their cups and lemonade');
    expect(dayProfit(day)).toBeCloseTo(ledgerLines(day).pnl.reduce((a, l) => a + l.amount, 0), 6); // the rows still add up
  });

  it("a Free Sample Day pours the stand's own card: 100 Strawberry cups book $0.11 a cup more than Classic on Marketing", () => {
    const sampleDay = (recipe: 'classic' | 'strawberry') => {
      const s = newGame(25);
      playTo(s, 3);
      s.cash = 5000;
      s.rank = 3;
      const st = s.plots[LOTTIES_CORNER].stand!;
      st.recipe = recipe;
      st.inventory = { lemons: [{ qty: 200, day: s.day, unitCost: s.market.lemons }], sugar: 400, ice: 600, sugarCost: s.market.sugar, iceCost: s.market.ice };
      st.pitcherCups = 0;
      const cash = s.cash, booked = dayCash(s.today);
      expect(runCampaign(s, 'freeSamples', LOTTIES_CORNER)).toBe(true);
      return { s, st, cash, booked, marketing: rowAmount(s.today, 'marketing') };
    };
    const classic = sampleDay('classic'), straw = sampleDay('strawberry');
    expect(straw.marketing).toBeCloseTo(-100 * costPerCup(straw.s, straw.st), 2); // the cup, the berries and the lemonade
    expect(straw.marketing - classic.marketing).toBeCloseTo(-100 * RECIPES.strawberry.extraPerCup, 2); // $11 more
    expect(straw.cash - straw.s.cash).toBeCloseTo(100 * (balance.CUP_COST + RECIPES.strawberry.extraPerCup), 2); // cups and berries leave as cash
    expect(dayCash(straw.s.today) - straw.booked).toBeCloseTo(straw.s.cash - straw.cash, 6); // the rows still add up to the cash change
  });

  it('income less costs is profit: rewards and loot count as income, never as negative costs', () => {
    const s = newGame(26);
    openStands(s);
    simulateRestOfDay(s);
    const t = s.today;
    const before = dayIncomeCosts(t);
    book(s, 'prizes', 10); // a goal's reward
    book(s, 'loot', 900); // and the night's Shakedown
    const { income, costs } = dayIncomeCosts(t);
    const pnl = ledgerLines(t).pnl;
    expect(costs).toBeCloseTo(-pnl.filter((l) => l.amount < 0).reduce((a, l) => a + l.amount, 0), 6);
    expect(costs).toBeGreaterThan(0);
    expect(costs).toBe(before.costs); // the old Costs (sales less profit) would have dropped $910 here
    expect(income).toBeCloseTo(before.income + 910, 6);
    expect(income).toBeCloseTo(pnl.filter((l) => l.amount > 0).reduce((a, l) => a + l.amount, 0), 6);
    expect(income - costs).toBeCloseTo(dayProfit(t), 6);
    book(s, 'loot', -1200); // raided back harder
    expect(dayIncomeCosts(t).costs).toBeCloseTo(costs + 300, 6); // the loot row below zero is a cost now
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

  it("a Truce's tribute leaves cash once, mid-day, on the Tribute row: the day's rows still add up, dawn to dawn", () => {
    const s = newGame(21);
    playTo(s, 3);
    s.rank = SITDOWN_RANK; // Rank 4: the sit-downs open
    s.cash = 50_000;
    openStands(s);
    simulateRestOfDay(s);
    sleepUntilDawn(s); // Day 4 starts with the cash, so its dawn-to-dawn change is all booked
    openStands(s);
    for (let i = 0; i < 180; i++) tickMinute(s); // mid-day
    const cost = truceCost(s, 'blenders');
    const before = s.cash;
    expect(makeTruce(s, 'blenders')).toBe(true);
    expect(s.cash).toBe(before - cost); // paid on the spot
    simulateRestOfDay(s);
    sleepUntilDawn(s);
    const day4 = s.history.find((h) => h.day === 4)!;
    expect(rowAmount(day4, 'tribute')).toBe(-cost); // once: the close and the night take nothing more
    expect(dayCash(day4)).toBeCloseTo(s.today.cashAtDawn! - day4.cashAtDawn!, 2);
    expect(ledgerLines(day4).pnl.find((l) => l.row === 'tribute')!.amount).toBe(-cost);
    openStands(s);
    simulateRestOfDay(s);
    expect(rowAmount(s.today, 'tribute')).toBe(0); // and nothing the next day: the Truce runs on what was paid
  });

  it("a save reloaded after the close keeps booking the evening and the night onto that day's row in the history", () => {
    const s = newGame(7);
    const dawn = s.cash;
    openStands(s);
    simulateRestOfDay(s);
    expect(s.today).toBe(s.history.at(-1)); // one record from the close to dawn
    const m = migrateSave(JSON.parse(JSON.stringify(s)))!; // the save at the report phase, loaded
    expect(m.today).toBe(m.history.at(-1));
    book(m, 'repairs', -50); // an evening repair
    book(m, 'loot', 300); // and the night's Shakedown
    sleepUntilDawn(m);
    const day1 = m.history.find((h) => h.day === 1)!;
    expect(rowAmount(day1, 'repairs')).toBe(-50);
    expect(rowAmount(day1, 'loot')).toBe(300);
    expect(dayCash(day1)).toBeCloseTo(m.today.cashAtDawn! - dawn, 2); // its rows still add up to the day's cash, dawn to dawn
    expect(migrateSave(JSON.parse(JSON.stringify(m)))!.today).not.toBe(day1); // Morning Prep: a new day of its own
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
    s.story!.act = 5; // the campaign's auction opens Act 5
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
    expect(ledgerLines(t).pnl.find((l) => l.row === 'other')).toMatchObject({ label: 'Other', title: 'The Lavender page auction' });
  });

  it("the Other row's title names what booked it: a heckler paid off is no Lavender auction", () => {
    const s = newGame(72);
    s.cash = 1e7; // enough for the page and every payoff
    openStands(s);
    const heckle = () => {
      s.calls = { day: s.day, list: [{ id: s.day * 10, kind: 'heckler', at: s.minute, plot: LOTTIES_CORNER, rival: 'blenders', live: true }], mods: {} };
      expect(answerCall(s, 0, { postGuards: () => 0 })).toBe(true); // Pay him off
    };
    heckle();
    const t = s.today;
    expect(rowAmount(t, 'other')).toBe(-CALLS.heckler.payoff);
    expect(ledgerLines(t).pnl.find((l) => l.row === 'other')).toMatchObject({ amount: -CALLS.heckler.payoff, title: 'Paid off a heckler' });
    bookOther(s, -LAVENDER.open, 'The Lavender page auction'); // the page's auction settles the same day
    heckle(); // and a second heckler is paid off: one name each
    expect(t.others).toEqual(['Paid off a heckler', 'The Lavender page auction']);
    expect(ledgerLines(t).pnl.find((l) => l.row === 'other')!.title).toBe('Paid off a heckler. The Lavender page auction');
    expect(rowAmount(t, 'other')).toBe(-(2 * CALLS.heckler.payoff + LAVENDER.open));
    const old = { ...t, others: undefined }; // a day from an older save: the row, no names
    expect(ledgerLines(old).pnl.find((l) => l.row === 'other')!.title).toBeUndefined();
  });
});
