// Dex's Auto-Defend on the HUD (combat: src/sim/autodefend.ts). From Rank 4
// the Crew tab has its switch. With it on, each plot of yours with guard posts
// shows Dex's priority for it as pips on its card: more pips, filled first
// each Evening; a tap adds one (past the top, back to none). Mounted from
// hud.ts on the HUD's existing classes.
import { AUTO_DEFEND } from '../sim/balance.ts';
import { autoDefendOn, defendPriority } from '../sim/autodefend.ts';
import { postsFor } from '../sim/crew.ts';
import type { GameState } from '../sim/economy.ts';

const pips = (n: number, of: number) => `<span class="cl-pips">${Array.from({ length: of }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`;

/** The Crew tab's switch, from Rank 4. */
export function autoDefendSwitch(s: GameState): string {
  if (s.rank < AUTO_DEFEND.rank) return '';
  const on = autoDefendOn(s);
  return `<button class="cl-toggle${on ? ' on' : ''}" data-action="autodefend" data-testid="auto-defend" aria-pressed="${on}" title="Dex rings the bell when a raid is warned, and each evening posts the reserve by your plots' priority"><i></i>Dex's Auto-Defend</button>`;
}

/** A plot card's priority pips, while Auto-Defend is on and the plot has guard posts. */
export function defendPriorityHere(s: GameState, plotId: string, tape: (inner: string, cls?: string) => string): string {
  if (!autoDefendOn(s) || s.plots[plotId]?.owner !== 'player' || !postsFor(s, plotId)) return '';
  const n = defendPriority(s, plotId);
  const tip = n ? `Dex's priority here: ${n} of ${AUTO_DEFEND.top}. Its posts fill first each evening.` : "Dex's priority here: none. Left to the bell.";
  return `<button class="cl-auto${n ? ' on' : ''}" data-action="priority" data-plot="${plotId}" data-testid="defend-priority" title="${tip} Tap to raise.">${tape(`Dex ${pips(n, AUTO_DEFEND.top)}`)}</button>`;
}
