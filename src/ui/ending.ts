// The Domination show on screen (src/sim/victory.ts). While the fight and the last exit play out, nothing extra is up.
// While the Bay paints itself yellow, a clear sheet keeps the menus shut, so you watch. Then the ending plays as the
// Bugle's front page: the campaign's Beloved or Iron Pitcher headline with Lottie's last line, or the plain 'OWNS THE
// BAY' page in Sandbox. Continue brings up the victory screen (hud.ts outcomeScreen).
import { ENDINGS, type GameState } from '../sim/economy.ts';
import { victoryStage } from '../sim/victory.ts';
import { lottieDoodle } from './clay.ts';
import { esc, once, tape } from './recipes.ts';

const lottieArt = once(lottieDoodle);
/** Sandbox's front page (spec: a generic 'OWNS THE BAY' page). */
export const BAY_PAGE: [string, string] = ["LOTTIE'S OWNS THE BAY!", "Every district flies Lottie's colors."];

/** The show's screen while it runs ('' while the screen is the fight's or a scene's); null once it's over. */
export function victoryShow(s: GameState): string | null {
  const stage = victoryStage(s);
  if (!stage) return null;
  if (stage === 'scenes') return '';
  if (stage === 'paint') return '<div class="cl-modal-bg cl-paint" data-testid="victory-paint"></div>';
  const e = s.outcome!.ending ? ENDINGS[s.outcome!.ending] : null;
  const [head, sub] = e ? [e.bugle, ''] : BAY_PAGE;
  return `<div class="cl-modal-bg"><div class="cl-card-big cl-end" data-testid="ending">
    <span class="cl-label">The Citrine Bay Bugle</span>
    ${tape(esc(head), 'cl-big')}
    ${sub ? `<span class="cl-note">${esc(sub)}</span>` : ''}
    ${e ? `<div class="cl-lottie"><span class="cl-doodle">${lottieArt()}</span><span>"${esc(e.lottie)}"</span></div>` : ''}
    <button class="cl-sleep" data-action="victoryNext" data-testid="ending-next"><span>Continue</span></button>
  </div></div>`;
}
