import { describe, expect, it } from 'vitest';
import {
  buildingInvested, buyGadget, buyPerimeter, LOTTIES_CORNER, newGame, PLOTS, rebuildCost, rebuildStand, upgradeStand,
  type GameState,
} from './economy.ts';

/** Lottie's Corner grown into a Kiosk the normal way: Folding Table ($150), Lemonade Cart ($400), Kiosk ($3,500). */
function kiosk(seed = 1): GameState {
  const s = newGame(seed);
  s.rank = 6;
  s.cash = 100000;
  s.phase = 'prep';
  expect(upgradeStand(s, LOTTIES_CORNER)).toBe(true);
  expect(upgradeStand(s, LOTTIES_CORNER)).toBe(true);
  return s;
}

describe('rebuild and repair cost basis', () => {
  it('a Kiosk built from an empty plot has $4,050 in it: $608 to rebuild, $405 to fix when Busted', () => {
    const s = kiosk();
    const ps = s.plots[LOTTIES_CORNER];
    expect(buildingInvested(ps)).toBe(4050);
    ps.stand!.wrecked = true;
    expect(rebuildCost(ps)).toBe(608);
    ps.busted = true;
    expect(rebuildCost(ps)).toBe(405);
  });

  it('fences and gadgets do not raise the rebuild bill, but still count toward Net Worth', () => {
    const s = kiosk(2);
    const ps = s.plots[LOTTIES_CORNER];
    expect(buyPerimeter(s, LOTTIES_CORNER)).toBe(true);
    expect(buyPerimeter(s, LOTTIES_CORNER)).toBe(true);
    expect(buyGadget(s, LOTTIES_CORNER, 'alarm')).toBe(true);
    expect(ps.invested).toBe(4050 + 150 + 1200 + 100);
    expect(buildingInvested(ps)).toBe(4050);
    ps.stand!.wrecked = true;
    expect(rebuildCost(ps)).toBe(608);
    const cash = s.cash;
    expect(rebuildStand(s, LOTTIES_CORNER)).toBe(true);
    expect(s.cash).toBe(cash - 608);
    expect(ps.invested).toBe(4050 + 150 + 1200 + 100); // the rebuild doesn't touch Net Worth's figure
  });

  it('the starting Folding Table still rebuilds for $23', () => {
    const s = newGame(3);
    s.plots[LOTTIES_CORNER].stand!.wrecked = true;
    expect(rebuildCost(s.plots[LOTTIES_CORNER])).toBe(23);
  });

  it('a facility counts its tiers', () => {
    const s = newGame(4);
    const field = PLOTS.find((p) => p.type === 'field')!;
    const ps = s.plots[field.id];
    ps.owner = 'player';
    ps.facility = { kind: 'helipad', level: 2, wrecked: true };
    ps.invested = 250000 + 9999; // plus whatever fences went up around it
    expect(buildingInvested(ps)).toBe(250000);
    expect(rebuildCost(ps)).toBe(37500);
  });

  it('an empty plot has nothing to rebuild', () => {
    const s = newGame(5);
    const empty = PLOTS.find((p) => !s.plots[p.id].owner && !s.plots[p.id].stand && !s.plots[p.id].facility)!;
    expect(buildingInvested(s.plots[empty.id])).toBe(0);
    expect(rebuildCost(s.plots[empty.id])).toBe(0);
  });
});
