import { describe, expect, it } from 'vitest';
import {
  appealFor, buySupply, CLOSE, maxPacks, netWorth, newGame, openStand, rankFor, setPrice, simulateRestOfDay,
  sleepUntilDawn, START, stock, type GameState,
} from './economy.ts';

function stockUp(s: GameState) {
  buySupply(s, 'lemons', 2);
  buySupply(s, 'sugar', 2);
  buySupply(s, 'ice', 4);
}

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
    const s = newGame(1);
    expect(buySupply(s, 'lemons', 1)).toBe(true);
    expect(stock(s, 'lemons')).toBe(20);
    expect(s.cash).toBeLessThan(START.cash);
    const room = maxPacks(s, 'lemons');
    expect(buySupply(s, 'lemons', room + 1)).toBe(false);
  });

  it('a sensible summer day turns a profit most of the time', () => {
    let profitable = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const s = newGame(seed);
      stockUp(s);
      openStand(s);
      simulateRestOfDay(s);
      expect(s.phase).toBe('report');
      expect(s.minute).toBe(CLOSE);
      expect(s.inventory.ice).toBe(0);
      if (s.cash > START.cash) profitable++;
    }
    expect(profitable).toBeGreaterThanOrEqual(14);
  });

  it('with no stock thirsty people are turned away and reputation drops', () => {
    const s = newGame(7);
    openStand(s);
    simulateRestOfDay(s);
    expect(s.today.customers).toBe(0);
    expect(s.today.walkedPast.soldOut).toBeGreaterThan(0);
    expect(s.reputation).toBeLessThan(3);
  });

  it('lemons spoil after 3 days', () => {
    const s = newGame(9);
    buySupply(s, 'lemons', 1);
    for (let d = 0; d < 3; d++) { openStand(s); simulateRestOfDay(s); sleepUntilDawn(s); }
    expect(stock(s, 'lemons')).toBe(0);
    expect(s.today.lemonsSpoiled).toBe(20);
  });

  it('gouging scares customers away', () => {
    const s = newGame(3);
    const fair = appealFor(s, 'families').stopChance;
    setPrice(s, 1.45);
    expect(appealFor(s, 'families').stopChance).toBeLessThan(fair / 4);
  });
});
