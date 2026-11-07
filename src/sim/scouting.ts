// Scouting (spec: Raids, the Raid Planner and Gull Flight). A Lookout spends
// the day watching a rival plot, and what they saw stays good for 3 days: the
// fence, the gadgets and the henchmen on its posts. Gull Flight (Squawk over a
// plot) will write the same snapshot with by: 'gull'. Pure and seeded like the
// rest of the sim.
import { SCOUT_DAYS, type GadgetId } from './balance.ts';
import type { Blocker, GameState } from './economy.ts';
import { guardReady, postsFor, type Guard } from './crew.ts';
import { PLOT_BY_ID } from './map.ts';

/** What a scout saw on a rival plot, and how long it stays fresh. */
export interface Scouted {
  day: number; // when it was scouted
  until: number; // the last day it counts
  by: 'lookout' | 'gull';
  tier: number; // perimeter
  gadgets: GadgetId[];
  garrison: number; // henchmen on its posts
}

/** The snapshot of a rival plot while it's fresh, or null. */
export function scoutedSnapshot(s: GameState, plotId: string): Scouted | null {
  const sc = s.scouting?.[plotId];
  return sc && sc.until >= s.day ? sc : null;
}
export const isScouted = (s: GameState, plotId: string) => !!scoutedSnapshot(s, plotId);

/** A Lookout out scouting is away from their post through the business day (Morning Prep and open hours), back by the Evening. */
export const scoutingToday = (s: GameState, g: Guard) => g.scoutDay === s.day && (s.phase === 'prep' || s.phase === 'open');

export function canScout(s: GameState, guardId: string, plotId: string): Blocker {
  const g = s.guards.find((x) => x.id === guardId);
  const ps = s.plots[plotId];
  if (!g || g.specialty !== 'lookout') return { ok: false, why: 'Scouting needs a Lookout' };
  if (!guardReady(s, g)) return { ok: false, why: `${g.name.split(' ')[0]} is Out` };
  if (g.scoutDay === s.day) return { ok: false, why: `${g.name.split(' ')[0]} scouted today` };
  if (s.raids.some((r) => r.attacker === 'player' && r.guards?.includes(g.id))) return { ok: false, why: `${g.name.split(' ')[0]} raids tonight` };
  if (!ps?.owner || ps.owner === 'player') return { ok: false, why: 'Scout a rival plot' };
  if (s.phase === 'report' || s.phase === 'night') return { ok: false, why: 'Scout by day' };
  return { ok: true };
}

/** The first Lookout free to scout this plot today, if any. */
export const freeLookout = (s: GameState, plotId: string) => s.guards.find((g) => canScout(s, g.id, plotId).ok);

/** Send a Lookout to watch a rival plot: its defenses show for 3 days; the Lookout is off their post and out of raids today. */
export function scoutWithLookout(s: GameState, guardId: string, plotId: string): boolean {
  if (!canScout(s, guardId, plotId).ok) return false;
  const g = s.guards.find((x) => x.id === guardId)!;
  g.scoutDay = s.day;
  recordScouting(s, plotId, 'lookout');
  const sc = s.scouting![plotId];
  const what = [sc.tier ? 'a fence' : 'no fence', `${sc.gadgets.length} gadget${sc.gadgets.length === 1 ? '' : 's'}`, `${sc.garrison} henchm${sc.garrison === 1 ? 'an' : 'en'}`];
  s.news.push(`${g.name} scouts ${PLOT_BY_ID[plotId].name}: ${what.join(', ')}.`);
  return true;
}

/** Write a fresh snapshot of a plot's defenses (Lookouts now, Gull Flight later). */
export function recordScouting(s: GameState, plotId: string, by: Scouted['by']): void {
  const ps = s.plots[plotId];
  (s.scouting ??= {})[plotId] = { day: s.day, until: s.day + SCOUT_DAYS - 1, by, tier: ps.defense.tier, gadgets: [...ps.defense.gadgets], garrison: Math.min(ps.garrison ?? 0, postsFor(s, plotId)) };
}

/** At dawn: stale scouting reports are dropped. */
export function scoutingAtDawn(s: GameState): void {
  if (!s.scouting) return;
  for (const [id, sc] of Object.entries(s.scouting)) if (sc.until < s.day) delete s.scouting[id];
}
