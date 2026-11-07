// The Rivals Corkboard once the Pact stands (spec: The Syndicate: "The Corkboard ties every string to your photo, the
// Bugle prints PACT IS BACK"). Your photo goes up over the bosses' and each member's red string runs to it alone: a pip
// at least, since they're all in on it, and more with their Grudge toward you. The strings between bosses come down
// with their feuds (threat.ts: no rival raids rivals while it stands). The rivals' board (corkboard.ts) asks here;
// nothing changes on it before the Pact forms.
import { GRUDGE, grudgeToward, HQS, syndicateFormed, syndicateLeader, syndicateMembers, type GameState, type RivalId } from '../sim/economy.ts';
import * as A from './clay.ts';

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const pips = (n: number, of: number) => `<span class="cl-pips">${Array.from({ length: of }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`;
/** Grudge per pip of red string, as on the rest of the board: five pips is a feud. */
const PIP = GRUDGE.feud / 5;
/** Whose face your photo shows. */
export const YOUR_PHOTO = "Lottie's grandkid";

/** Your photo, pinned over the bosses while the Pact stands (empty before): every string on the board ends here. */
export function pactPhoto(s: GameState): string {
  if (!syndicateFormed(s)) return '';
  const n = syndicateMembers(s).length;
  const lead = syndicateLeader(s);
  const tip = `The Pact: ${n} boss${n === 1 ? '' : 'es'} against you${lead ? `, led by ${HQS[lead].boss}` : ''}`;
  return `<div class="cl-card" data-big data-testid="cork-player" title="${esc(tip)}">
    <span class="cl-pic">${A.faceSVG(YOUR_PHOTO)}</span>
    <span class="cl-txt"><b>You · Lottie's</b><i>Everyone but the kid: ${n} in the Pact</i></span></div>`;
}

/** A member's one red string while the Pact stands, to your photo (null before it forms: the board draws its own). */
export function pactStrings(s: GameState, id: RivalId, boss: string): string | null {
  if (!syndicateFormed(s)) return null;
  const g = grudgeToward(s, id, 'player');
  const n = Math.max(1, Math.min(5, Math.round(g / PIP)));
  return `<span class="cl-row wrap" data-testid="cork-strings"><span class="cl-note" title="${esc(`${boss} is in the Pact against you. Grudge toward you: ${Math.round(g)}`)}">Lottie's</span>${pips(n, 5)}</span>`;
}
