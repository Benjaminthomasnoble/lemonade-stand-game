// Buildings and their damage (spec: Stands, "Damage, repairs and rebuilds"; Defenses, "When a stand falls"; canon:
// Knock it down, buy it up). Rebuilds and repairs cost a share of what was invested in the building itself: a
// stand's level steps or a facility's tiers, never the plot's fences and gadgets. Pure functions over GameState,
// like the rest of the sim.
import { STAND_LEVELS } from './balance.ts';
import type { PlotState } from './economy.ts';
import { FACILITIES } from './vip.ts';

/**
 * What was invested in the building on a plot: the base for its rebuild and repair costs. A stand counts its level
 * steps (a Kiosk built on an empty plot: $150 + $400 + $3,500 = $4,050), a facility its tiers. Fences and gadgets
 * have their own repair rule (Defenses), and the plot's `invested` (Net Worth's figure, which counts them) is untouched.
 */
export function buildingInvested(ps: PlotState): number {
  if (ps.stand) return STAND_LEVELS.slice(0, ps.stand.level).reduce((a, l) => a + l.cost, 0);
  if (ps.facility) return FACILITIES[ps.facility.kind].costs.slice(0, ps.facility.level).reduce((a, c) => a + c, 0);
  return 0;
}

/** A cost in whole dollars, rounded up (a share that lands a hair over a whole number from float noise stays put). */
export const dollarsUp = (n: number) => Math.max(0, Math.ceil(n - 1e-6));
