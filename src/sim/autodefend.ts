// Dex's Auto-Defend (spec: Automation, "Dex's Auto-Defend | Rank 4 | Sending
// reinforcements and stationing guards | Each plot's priority"; Defenses,
// "Dex's Auto-Defend (Rank 4) rings it for you"). From Rank 4 it is a switch.
// When a raid on one of your plots is warned, Dex rings the bell under the
// normal rules (reinforce.ts): the Clubhouse reserve in range sets out. Each
// Evening he posts the idle reserve on your plots by the priority you give
// each one, highest first, within each plot's guard posts (crew's postsFor);
// a plot at priority 0 (the default) is left to the bell. Auto-Restock's
// shape: a switch, a target per plot, an opt-out and a one-line report, as a
// helper in the automation frame (automation.ts): his posts and bells are the
// day's Ledger line. Pure, like the rest of the sim.
import { AUTO_DEFEND, RANKS } from './balance.ts';
import { PLOTS } from './map.ts';
import { awayOnRaid } from './clubhouse.ts';
import { guardReady, postGuard, postsFor, type Raid } from './crew.ts';
import { canRingBell, ringTheBell } from './reinforce.ts';
import { bookHelper, registerHelper, type HelperDay } from './automation.ts';
import type { Blocker, GameState } from './economy.ts';

/** Auto-Defend's id in the automation frame (automation.ts): its Ledger line. */
export const AUTO_DEFEND_ID = 'defend';

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
    for (let free = postsFor(s, p.id) - s.guards.filter((g) => g.post === p.id).length; free > 0 && idle.length; free--) {
      postGuard(s, idle.shift()!.id, p.id);
      posted++;
    }
  }
  if (posted) { s.news.push(`Dex posts ${posted} guard${posted === 1 ? '' : 's'} for the night.`); bookDex(s, posted, 0); }
  return posted;
}

/** A raid on one of your plots is warned: with Auto-Defend on, Dex rings the bell (once a raid, with a reserve in range). */
export function autoDefendOnWarning(s: GameState, raid: Raid): boolean {
  if (!(autoDefendOn(s) && canRingBell(s, raid.id) && ringTheBell(s, raid.id, true))) return false;
  bookDex(s, 0, 1);
  return true;
}

/** Dex's day on the Ledger: everything he did (count: each guard posted, each bell rung), the bells among it (amount). */
function bookDex(s: GameState, posted: number, rang: number): void {
  const d = s.today.auto?.[AUTO_DEFEND_ID];
  bookHelper(s, AUTO_DEFEND_ID, 0, { count: (d?.count ?? 0) + posted + rang, amount: (d?.amount ?? 0) + rang });
}

/** The Ledger's line for Dex's day: "3 guards posted, bell rung once". */
export function defendLine(d: HelperDay): string {
  const posted = d.count - d.amount, rang = d.amount;
  const line = [posted ? `${posted} guard${posted === 1 ? '' : 's'} posted` : '', rang ? `bell rung ${rang === 1 ? 'once' : rang === 2 ? 'twice' : `${rang} times`}` : '']
    .filter(Boolean).join(', ');
  return line.charAt(0).toUpperCase() + line.slice(1);
}

// A helper in the automation frame: no dawn run and nothing spent (Dex works in the Evening and at a warning), and
// what he did is its Ledger line.
registerHelper({ id: AUTO_DEFEND_ID, name: 'Auto-Defend', unlocked: autoDefendOn, line: defendLine });
