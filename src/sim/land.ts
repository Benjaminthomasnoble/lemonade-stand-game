// Land and territory (spec: Land and territory; canon section 9): where you may
// buy, what lifts land prices, district control tiers and the Full Control
// perks. Pure functions over GameState, like the rest of the sim.
import { DISTRICT_RANK, RANKS } from './balance.ts';
import { BORDERS, type DistrictId, type Plot } from './map.ts';
import type { Blocker, GameState } from './economy.ts';
import { hasFoothold } from './economy.ts';

/** Civic buildings and HQs are never bought, so they count toward neither control nor development. */
export const isPurchasable = (p: Plot) => p.type !== 'civic' && p.type !== 'hq';

// ---------- where you can buy ----------

/**
 * The rank and reach rules for buying on the spot (First Dibs skips them).
 * Campaign and Endless: Maple Row from Day 1 and Old Town from Rank 2, with no
 * border needed; every other district from Rank 3, where you hold a Foothold or
 * next to one. Sandbox: the start district from Day 1, and the border rule
 * everywhere else from Rank 2.
 */
export function reachBlocker(s: GameState, d: DistrictId): Blocker {
  const sandbox = s.settings.mode === 'sandbox';
  const gate = sandbox ? (d === 'maple' ? 1 : 2) : DISTRICT_RANK[d] ?? 3;
  if (s.rank < gate) return { ok: false, why: `Needs Rank ${gate}, ${RANKS[gate - 1].title}` };
  if (d === 'maple' || (!sandbox && d === 'oldtown')) return { ok: true };
  if (hasFoothold(s, 'player', d) || BORDERS[d].some((b) => hasFoothold(s, 'player', b))) return { ok: true };
  return { ok: false, why: 'Get a Foothold in a bordering district first' };
}
