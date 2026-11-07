// Shakedown loot (spec: Defenses, "When a stand falls"; Crew and combat, the
// objectives). A Shakedown takes the till: about one day of that stand's
// profit, both ways, whether Lottie robs a rival stand or a rival robs hers.
// The day is the stand's last full business day (for a raid tonight that's
// today, for a daytime raid yesterday): its sales less what its cups cost
// (supplies and the cup itself) and its upkeep. Never below $0, never more
// than the owner has. A facility has no till, and a Delivery Raid is after
// the cargo, not the till. Pure, like the rest of the sim.
import type { RivalId } from './balance.ts';
import { costPerCup, standLevel, type GameState } from './economy.ts';

const round2 = (n: number) => Math.round(n * 100) / 100;

/** A stand's profit for its day so far: sales less its cups (supplies and the cup itself) and its upkeep. */
export function dayProfit(s: GameState, plotId: string): number {
  const ps = s.plots[plotId], st = ps?.stand;
  if (!st) return 0;
  const cups = ps.owner === 'player' ? st.day.customers * costPerCup(s, st) : st.day.cupCosts; // rivals buy as they pour
  return round2(st.day.revenue - cups - standLevel(st).upkeep);
}

/** Closing time: every stand's day goes in its books, for the Shakedowns to come (economy's closeDay calls this). */
export function closeTills(s: GameState): void {
  for (const id of Object.keys(s.plots)) {
    const st = s.plots[id].stand;
    if (st && s.plots[id].owner) st.lastProfit = dayProfit(s, id);
  }
}

/**
 * What a Shakedown takes from this plot: about a day of its stand's profit
 * (its last full business day; a stand with none yet, what it's made so far
 * today), from $0 up to what the owner has. The Raid Planner shows it.
 */
export function shakedownLoot(s: GameState, plotId: string): number {
  const ps = s.plots[plotId], st = ps?.stand;
  if (!st || !ps.owner) return 0;
  const cash = ps.owner === 'player' ? s.cash : s.rivals[ps.owner as RivalId]?.cash ?? 0;
  return round2(Math.max(0, Math.min(st.lastProfit ?? dayProfit(s, plotId), cash)));
}
