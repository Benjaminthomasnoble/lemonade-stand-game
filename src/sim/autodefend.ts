// Dex's Auto-Defend (spec: Automation, "Dex's Auto-Defend | Rank 4 | Sending
// reinforcements and stationing guards | Each plot's priority"; Defenses,
// "Dex's Auto-Defend (Rank 4) rings it for you"). From Rank 4 it is a switch.
// When a raid on one of your plots is warned, Dex rings the bell under the
// normal rules (reinforce.ts): the Clubhouse reserve in range sets out. Each
// Evening he posts the idle reserve on your plots by the priority you give
// each one, highest first, within each plot's guard posts; a plot at priority
// 0 (the default) is left to the bell. Auto-Restock's shape: a switch, a target
// per plot, an opt-out and a one-line report. Pure, like the rest of the sim.
import { AUTO_DEFEND, RANKS, STAND_LEVELS } from './balance.ts';
import { PLOT_BY_ID, PLOTS } from './map.ts';
import { awayOnRaid } from './clubhouse.ts';
import { guardReady, postGuard, type Raid } from './crew.ts';
import { canRingBell, ringTheBell } from './reinforce.ts';
import type { Blocker, GameState } from './economy.ts';

/** Is Dex's Auto-Defend on? (A switch from Rank 4.) */
export const autoDefendOn = (s: GameState): boolean => !!s.autoDefend && s.rank >= AUTO_DEFEND.rank;

/** Can you switch it on? */
export const canAutoDefend = (s: GameState): Blocker =>
  s.rank >= AUTO_DEFEND.rank ? { ok: true } : { ok: false, why: `Needs Rank ${AUTO_DEFEND.rank}, ${RANKS[AUTO_DEFEND.rank - 1].title}` };

/** Flip the switch. */
export function setAutoDefend(s: GameState, on: boolean): boolean {
  if (on && !canAutoDefend(s).ok) return false;
  if (on) s.autoDefend = true; else delete s.autoDefend;
  return true;
}

/** Dex's priority for one of your plots: 0 (the default: left to the bell) up to AUTO_DEFEND.top. */
export const defendPriority = (s: GameState, plotId: string): number => (s.plots[plotId]?.owner === 'player' ? s.plots[plotId].defendPriority ?? 0 : 0);

/** Set a plot's priority, 0 to AUTO_DEFEND.top (the plot card's pips; land's Fortify raises it). Yours only. */
export function setDefendPriority(s: GameState, plotId: string, n: number): boolean {
  const ps = s.plots[plotId];
  if (ps?.owner !== 'player') return false;
  const v = Math.max(0, Math.min(AUTO_DEFEND.top, Math.round(n)));
  if (v) ps.defendPriority = v; else delete ps.defendPriority;
  return true;
}

/** One pip more (past the top, back to none). */
export const cycleDefendPriority = (s: GameState, plotId: string) => setDefendPriority(s, plotId, (defendPriority(s, plotId) + 1) % (AUTO_DEFEND.top + 1));

/** A plot's guard posts (crew's postsFor once guard-posts-cap merges): a stand's level sets 1, 2, 3, 4 or 6; other
 * buildings and an HQ have AUTO_DEFEND.buildingPosts; a bare lot has none. */
export function postsAt(s: GameState, plotId: string): number {
  const ps = s.plots[plotId];
  if (ps?.stand) return STAND_LEVELS[ps.stand.level - 1].guardPosts;
  return ps?.facility || PLOT_BY_ID[plotId]?.type === 'hq' ? AUTO_DEFEND.buildingPosts : 0;
}

/**
 * The Evening: Dex posts the idle reserve (fit, off post, not away on a raid), the most seasoned first, on your plots
 * by priority, highest first (then the plot worth most), filling each one's free posts. Returns how many he posted.
 */
export function stationByPriority(s: GameState): number {
  if (!autoDefendOn(s)) return 0;
  const away = awayOnRaid(s);
  const idle = s.guards.filter((g) => !g.post && guardReady(s, g) && !away.has(g.id)).sort((a, b) => b.level - a.level);
  const worth = (id: string) => s.plots[id].invested + s.plots[id].landValue;
  const plots = PLOTS.filter((p) => defendPriority(s, p.id) > 0)
    .sort((a, b) => defendPriority(s, b.id) - defendPriority(s, a.id) || worth(b.id) - worth(a.id) || a.id.localeCompare(b.id));
  let posted = 0;
  for (const p of plots) {
    for (let free = postsAt(s, p.id) - s.guards.filter((g) => g.post === p.id).length; free > 0 && idle.length; free--) {
      postGuard(s, idle.shift()!.id, p.id);
      posted++;
    }
  }
  if (posted) s.news.push(`Dex posts ${posted} guard${posted === 1 ? '' : 's'} for the night.`);
  return posted;
}

/** A raid on one of your plots is warned: with Auto-Defend on, Dex rings the bell (once a raid, with a reserve in range). */
export function autoDefendOnWarning(s: GameState, raid: Raid): boolean {
  return autoDefendOn(s) && canRingBell(s, raid.id) && ringTheBell(s, raid.id, true);
}
