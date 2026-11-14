// Lottie's Tips on screen (spec "Success Score and ranks"): a rank-up's hand of three waits at the top of the left
// feed, in any phase, until you keep one, and the Rank and Perks menu shows the same hand and every tip you keep.
// Each tip is one tap (data-action="tip", through the HUD's one listener). Plain clay for now; the UI thread can fan
// the hand into cards. The sim side is src/sim/perks.ts.
import { TIPS, type TipId } from '../sim/balance.ts';
import type { GameState } from '../sim/economy.ts';
import { tipHand, tipsHeld } from '../sim/perks.ts';

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

/** One tip to keep: its name, and what it does underneath. */
const pick = (id: TipId) =>
  `<button class="cl-b tiny go" data-action="tip" data-id="${id}" data-testid="tip-${id}" title="${esc(`${TIPS[id].name}: ${TIPS[id].text}. Yours for good.`)}">${esc(TIPS[id].name)} <i class="cl-cost-in">${esc(TIPS[id].text)}</i></button>`;

/** The feed's ticket while a hand waits (Lottie's picture first). */
export function perksTicket(s: GameState, art: string): string {
  const h = tipHand(s);
  if (!h) return '';
  return `<div class="cl-ticket cl-call" data-testid="tips" data-rank="${h.rank}">${art}<b>Rank ${h.rank}: keep one tip</b><span class="cl-acts">${h.cards.map(pick).join('')}</span></div>`;
}

/** The Rank and Perks menu's part: the hand waiting, then the tips you keep (what each does on hover). */
export function perksSheet(s: GameState): string {
  const h = tipHand(s), held = tipsHeld(s);
  const hand = h ? `<div class="cl-row wrap"><span class="cl-label">Rank ${h.rank}: keep one</span>${h.cards.map(pick).join('')}</div>` : '';
  const kept = held.length ? `<div class="cl-row wrap"><span class="cl-label">Lottie's tips</span>${held.map((id) => `<span class="cl-tipcard" title="${esc(TIPS[id].text)}"><b>${esc(TIPS[id].name)}</b><i>${esc(TIPS[id].text)}</i></span>`).join('')}</div>` : '';
  return hand + kept;
}
