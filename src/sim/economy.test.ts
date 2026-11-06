import { describe, expect, it } from 'vitest';
import {
  buyChance, buySupply, DAY_END_MIN, newGame, nextDay, openStand, recipeQuality, setPrice,
  simulateRestOfDay, STARTING_CASH, supplyCostPerCup,
} from './economy.ts';

function stockUp(s: ReturnType<typeof newGame>) {
  buySupply(s, 'lemons', 2);
  buySupply(s, 'sugar', 1);
  buySupply(s, 'cups', 1);
  buySupply(s, 'ice', 2);
}

describe('economy', () => {
  it('is deterministic for a seed', () => {
    const run = () => {
      const s = newGame(1234);
      for (let d = 0; d < 5; d++) { stockUp(s); openStand(s); simulateRestOfDay(s); nextDay(s); }
      return JSON.stringify(s);
    };
    expect(run()).toBe(run());
  });

  it('buying supplies costs cash and refuses overspending', () => {
    const s = newGame(1);
    expect(buySupply(s, 'lemons', 1)).toBe(true);
    expect(s.cash).toBeCloseTo(STARTING_CASH - 2.4);
    expect(s.inventory.lemons).toBe(12);
    expect(buySupply(s, 'lemons', 100)).toBe(false);
  });

  it('a sensible first day turns a profit', () => {
    let profitable = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const s = newGame(seed);
      stockUp(s);
      openStand(s);
      simulateRestOfDay(s);
      expect(s.phase).toBe('report');
      expect(s.minute).toBe(DAY_END_MIN);
      expect(s.inventory.ice).toBe(0);
      if (s.cash > STARTING_CASH) profitable++;
    }
    expect(profitable).toBeGreaterThanOrEqual(14);
  });

  it('with no stock everyone who wants lemonade is missed', () => {
    const s = newGame(7);
    openStand(s);
    simulateRestOfDay(s);
    expect(s.today.customers).toBe(0);
    expect(s.today.missed).toBeGreaterThan(0);
    expect(s.reputation).toBeLessThan(0.5);
  });

  it('gouging scares customers away', () => {
    const s = newGame(3);
    const fair = buyChance(s);
    setPrice(s, 3);
    expect(buyChance(s)).toBeLessThan(fair / 4);
  });

  it('the default recipe is good and cheap enough to profit at 50 cents', () => {
    const s = newGame(5);
    expect(recipeQuality(s.recipe, 80)).toBeGreaterThan(0.8);
    expect(supplyCostPerCup(s.recipe)).toBeLessThan(0.25);
  });
});
