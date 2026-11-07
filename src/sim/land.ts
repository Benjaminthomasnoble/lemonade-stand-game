// Land and territory (spec: Land and territory; canon section 9): where you may
// buy, what lifts land prices, district control tiers and the Full Control
// perks. Pure functions over GameState, like the rest of the sim.
import { DISTRICT_RANK, FACILITY_DEVELOPMENT, RANKS } from './balance.ts';
import { BORDERS, PLOTS, type DistrictId, type Plot } from './map.ts';
import type { Blocker, GameState } from './economy.ts';
import { hasFoothold } from './economy.ts';

/** Civic buildings and HQs are never bought, so they count toward neither control nor development. */
export const isPurchasable = (p: Plot) => p.type !== 'civic' && p.type !== 'hq';

const BUYABLE = new Map<DistrictId, Plot[]>();
/** A district's purchasable plots (Maple Row 12, Old Town 12, Campus & Arts 13, Downtown 17, The Boardwalk 15, The Harbor 14, The Groves 15, Hilltop Estates 9). */
export function purchasablePlots(d: DistrictId): Plot[] {
  let list = BUYABLE.get(d);
  if (!list) { list = PLOTS.filter((p) => p.district === d && isPurchasable(p)); BUYABLE.set(d, list); }
  return list;
}

// ---------- land prices ----------

/** Development = every faction's stand levels in the district (each facility tier counts 2) ÷ (4 × its purchasable plots), capped at 1. */
export function development(s: GameState, d: DistrictId): number {
  const plots = purchasablePlots(d);
  const levels = plots.reduce((a, p) => a + (s.plots[p.id].stand?.level ?? 0) + FACILITY_DEVELOPMENT * (s.plots[p.id].facility?.level ?? 0), 0);
  return plots.length ? Math.min(1, levels / (4 * plots.length)) : 0;
}

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
