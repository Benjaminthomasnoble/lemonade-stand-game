// The story's beats, day by day and act by act (src/sim/story.ts, scenes.ts, phone.ts, goals.ts): Act 1's
// onboarding (Lottie's stock, the side lot, the Steward, Benny, Skip), then each act's lessons and climaxes.
import { describe, expect, it } from 'vitest';
import {
  buildStand, buyPlot, CUPS_PER_PITCHER, expectedCups, LOTTIES_CORNER, netWorth, newGame, openStand, PLOTS, servingsAvailable,
  simulateRestOfDay, sleepUntilDawn, START, stock, type GameState,
} from './economy.ts';
import { lottieStocks, storyAfterAct, taught } from './story.ts';

/** Skip straight to the next dawn (the night still runs; the business day doesn't). */
function nextDawn(s: GameState) {
  s.phase = 'report';
  sleepUntilDawn(s);
}
function playDay(s: GameState) {
  openStand(s);
  simulateRestOfDay(s);
  sleepUntilDawn(s);
}
const corner = (s: GameState) => s.plots[LOTTIES_CORNER].stand!;

describe("Lottie's stock on Days 1-2", () => {
  it('fills the table to the forecast day, free, while the Market waits for Day 3', () => {
    const s = newGame(41);
    expect(lottieStocks(s)).toBe(true);
    expect(taught(s, 'market')).toBe(false);
    const want = expectedCups(s, LOTTIES_CORNER, s.forecast);
    expect(servingsAvailable(corner(s))).toBeGreaterThanOrEqual(want); // whole pitchers, up to the day's expected sales
    expect(servingsAvailable(corner(s))).toBeLessThan(want + CUPS_PER_PITCHER);
    expect(stock(corner(s), 'ice')).toBeGreaterThan(0);
    expect(s.cash).toBe(START.cash); // her gift: your cash stays put...
    expect(s.today.supplies).toBe(0);
    const bare = newGame(41, { lessons: false });
    expect(netWorth(s)).toBe(netWorth(bare)); // ...and so does Net Worth (the stock costs you nothing)
    playDay(s); // Day 2: she stocks it again at dawn
    expect(s.day).toBe(2);
    expect(servingsAvailable(corner(s))).toBeGreaterThanOrEqual(expectedCups(s, LOTTIES_CORNER, s.forecast));
    expect(s.today.supplies).toBe(0);
    s.plots[LOTTIES_CORNER].stand!.inventory = { lemons: [], sugar: 0, ice: 0, sugarCost: 0, iceCost: 0 };
    playDay(s); // Day 3: from today you buy your own
    expect(s.day).toBe(3);
    expect(taught(s, 'market') && !lottieStocks(s)).toBe(true);
    expect(servingsAvailable(corner(s))).toBe(0);
    expect(s.news.some((n) => n.startsWith('Lottie: "From today'))).toBe(true);
  });

  it('a table built at Morning Prep gets its stock at once, but nobody refills a stand mid-day', () => {
    const s = newGame(42);
    s.cash = 2000;
    const lot = PLOTS.find((p) => p.district === 'maple' && p.type === 'street' && !s.plots[p.id].owner)!;
    expect(buyPlot(s, lot.id) && buildStand(s, lot.id)).toBe(true);
    storyAfterAct(s);
    expect(servingsAvailable(s.plots[lot.id].stand!)).toBeGreaterThan(0);
    openStand(s);
    simulateRestOfDay(s);
    const left = servingsAvailable(corner(s));
    storyAfterAct(s); // the Evening: no top-up
    expect(servingsAvailable(corner(s))).toBe(left);
  });

  it('with the lessons off you buy your own from Day 1, and Auto-Restock works from Day 1', () => {
    const s = newGame(43, { lessons: false });
    expect(lottieStocks(s)).toBe(false);
    expect(servingsAvailable(corner(s))).toBe(0);
    corner(s).autoRestock = true;
    openStand(s);
    expect(servingsAvailable(corner(s))).toBeGreaterThan(0);
    expect(s.cash).toBeLessThan(START.cash);
  });
});
