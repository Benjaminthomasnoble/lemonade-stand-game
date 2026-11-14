import { describe, expect, it } from 'vitest';
import { expressWindow, fitSpec, LOTTIES_CORNER, newGame, newStand, pourRate, STAND_LEVELS } from '../sim/economy.ts';
import { levelStats } from './hud.ts';

describe("the Grow card's level lines", () => {
  it("count the stand's Express Window in its cups an hour, now and after the upgrade, as the stand pours", () => {
    const s = newGame(83);
    s.rank = 8;
    s.phase = 'prep';
    s.cash = 100_000;
    s.plots[LOTTIES_CORNER].stand = newStand(3); // the Kiosk: 120 cups an hour
    const [kiosk, shack] = [STAND_LEVELS[2], STAND_LEVELS[3]];
    const fast = () => expressWindow(s.plots[LOTTIES_CORNER]); // what the Grow card and the Upgrade button pass in
    expect(levelStats(kiosk, 3, fast())).toBe('120 cups/hour · draws ×2.3 · top price $3.00 here · upkeep $60.00/day · holds 1,800 cups');
    expect(fitSpec(s, LOTTIES_CORNER, 0, 'express')).toBe(true);
    expect(levelStats(kiosk, 3, fast())).toBe('156 cups/hour · draws ×2.3 · top price $3.00 here · upkeep $60.00/day · holds 1,800 cups');
    expect(levelStats(kiosk, 3, fast())).toMatch(new RegExp(`^${pourRate(s, LOTTIES_CORNER)} cups/hour`)); // the stand's own pour
    expect(levelStats(shack, 4.5, fast())).toMatch(/^390 cups\/hour/); // the Shack keeps the slot
    expect(levelStats(shack, 4.5)).toMatch(/^300 cups\/hour/); // an empty plot's build buttons: no window yet
  });
});
