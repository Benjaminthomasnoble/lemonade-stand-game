import { describe, expect, it } from 'vitest';
import {
  appealFor, buildStand, buyBrand, buyPlot, buySupply, canBuyPlot, canUpgradeStand, CLOSE, expectedPassersby, LOTTIES_CORNER,
  maxPacks, netWorth, newGame, openStand, ownedPlots, PLOTS, playerStands, rankFor, runCampaign, selectedStand, setPrice,
  simulateRestOfDay, sleepUntilDawn, START, stock, upgradeStand, type GameState,
} from './economy.ts';

function stockUp(s: GameState) {
  buySupply(s, 'lemons', 2);
  buySupply(s, 'sugar', 2);
  buySupply(s, 'ice', 4);
}

describe('map', () => {
  it('has 116 plots across 8 districts with Lottie\'s Corner owned by the player', () => {
    expect(PLOTS.length).toBe(116);
    const s = newGame(1);
    expect(s.plots[LOTTIES_CORNER].owner).toBe('player');
    expect(ownedPlots(s, 'fizzco').length).toBeGreaterThan(5);
    expect(ownedPlots(s, 'player').length).toBe(1);
  });
});

describe('economy', () => {
  it('is deterministic for a seed', () => {
    const run = () => {
      const s = newGame(1234);
      for (let d = 0; d < 6; d++) { stockUp(s); openStand(s); simulateRestOfDay(s); sleepUntilDawn(s); }
      return JSON.stringify(s);
    };
    expect(run()).toBe(run());
  });

  it('starts at the canon values', () => {
    const s = newGame(1);
    expect(s.cash).toBe(START.cash);
    expect(s.reputation).toBe(3);
    expect(rankFor(netWorth(s)).title).toBe('Sidewalk Squeezer');
    expect(netWorth(s)).toBeGreaterThan(450);
  });

  it('buying supplies costs cash and respects storage', () => {
    const s = newGame(1, { lessons: false }); // lessons on, Lottie stocks the table on Days 1-2 (story.test.ts)
    const st = selectedStand(s);
    expect(buySupply(s, 'lemons', 1)).toBe(true);
    expect(stock(st, 'lemons')).toBe(20);
    expect(s.cash).toBeLessThan(START.cash);
    expect(buySupply(s, 'lemons', maxPacks(s, st, 'lemons') + 1)).toBe(false);
  });

  it('a sensible summer day turns a profit most of the time', () => {
    let profitable = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const s = newGame(seed);
      stockUp(s);
      openStand(s);
      simulateRestOfDay(s);
      expect(s.phase).toBe('report');
      expect(s.minute).toBe(CLOSE);
      expect(selectedStand(s).inventory.ice).toBe(0);
      if (s.cash > START.cash) profitable++;
    }
    expect(profitable).toBeGreaterThanOrEqual(7);
  });

  it('with no stock thirsty people are turned away and reputation drops', () => {
    const s = newGame(7, { lessons: false }); // you buy your own from Day 1
    openStand(s);
    simulateRestOfDay(s);
    expect(s.today.customers).toBe(0);
    expect(s.today.walkedPast.soldOut).toBeGreaterThan(0);
    expect(s.reputation).toBeLessThan(3);
  });

  it('lemons spoil after 3 days', () => {
    const s = newGame(9, { lessons: false }); // you buy your own from Day 1
    buySupply(s, 'lemons', 1);
    for (let d = 0; d < 3; d++) { openStand(s); simulateRestOfDay(s); sleepUntilDawn(s); }
    expect(stock(selectedStand(s), 'lemons')).toBe(0);
    expect(s.today.lemonsSpoiled).toBe(20);
  });

  it('gouging scares customers away', () => {
    const s = newGame(3);
    const fair = appealFor(s, LOTTIES_CORNER, 'families').stopChance; // at the $1.50 ceiling
    setPrice(selectedStand(s), 1.95); // 30% over: three buyers in four walk off
    expect(appealFor(s, LOTTIES_CORNER, 'families').stopChance).toBeCloseTo(fair / 4, 6);
    setPrice(selectedStand(s), 2.1); // 40% over: nobody buys
    expect(appealFor(s, LOTTIES_CORNER, 'families').stopChance).toBeCloseTo(0, 6);
  });

  it('upgrades the stand once you can afford it, gated by rank', () => {
    const s = newGame(11);
    expect(canUpgradeStand(s).ok).toBe(false);
    s.cash = 1000;
    const before = netWorth(s);
    expect(upgradeStand(s)).toBe(true);
    expect(selectedStand(s).level).toBe(2);
    expect(netWorth(s)).toBeCloseTo(before - 400 * 0.25, 1);
    s.cash = 10000;
    expect(upgradeStand(s)).toBe(false); // L3 needs Rank 3
    expect(canUpgradeStand(s)).toEqual({ ok: false, why: 'Needs Rank 3, Block Boss' });
  });

  it('marketing raises foot traffic', () => {
    const s = newGame(12);
    const w = s.weather; // same weather throughout, so only marketing changes
    const base = expectedPassersby(s, LOTTIES_CORNER, w);
    s.cash = 500;
    expect(buyBrand(s)).toBe(true);
    expect(expectedPassersby(s, LOTTIES_CORNER, w)).toBeCloseTo(base * 1.05);
    expect(runCampaign(s, 'sandwichBoard')).toBe(false); // Rank 2
    s.rank = 2;
    expect(runCampaign(s, 'sandwichBoard')).toBe(true);
    expect(expectedPassersby(s, LOTTIES_CORNER, w)).toBeCloseTo(base * 1.25);
    openStand(s); simulateRestOfDay(s); sleepUntilDawn(s);
    expect(expectedPassersby(s, LOTTIES_CORNER, w)).toBeCloseTo(base * 1.05);
  });

  it('buys land on Maple Row and opens a second stand; Old Town needs Rank 2', () => {
    const s = newGame(13);
    s.cash = 2000;
    const lot = PLOTS.find((p) => p.district === 'maple' && p.type === 'street' && !s.plots[p.id].owner)!;
    expect(buyPlot(s, lot.id)).toBe(true);
    expect(buildStand(s, lot.id)).toBe(true);
    expect(playerStands(s).length).toBe(2);
    const ot = PLOTS.find((p) => p.district === 'oldtown' && p.type === 'street' && !s.plots[p.id].owner)!;
    expect(canBuyPlot(s, ot.id)).toEqual({ ok: false, why: 'Needs Rank 2, Corner Hustler' });
  });

  it('rival stands earn money and nearby stands compete for customers', () => {
    const s = newGame(14);
    const before = s.rivals.fizzco.cash;
    openStand(s); simulateRestOfDay(s);
    expect(s.rivals.fizzco.cash).not.toBe(before);
    const busy = PLOTS.filter((p) => s.plots[p.id].owner === 'fizzco' && s.plots[p.id].stand);
    expect(busy.some((p) => s.plots[p.id].stand!.day.customers > 0)).toBe(true);
  });
});
