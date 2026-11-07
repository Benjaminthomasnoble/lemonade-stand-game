// The story's pieces of the HUD, mounted from hud.ts: Lottie's goal card at the
// right edge (spec "Lottie's Goals": always 3, story goals wear a page icon) and
// the ticket of a playing scene, first in the left feed (its caption, the
// Grandkid's quick replies and Skip). Lessons gate the other panels' buttons:
// see taught() in src/sim/story.ts.
import type { GameState, Goal } from '../sim/economy.ts';
import { storyOffer } from '../sim/beats.ts';
import { FACTIONS } from '../sim/balance.ts';
import { goalsNow } from '../sim/goals.ts';
import { playingScene, sceneLine } from '../sim/scenes.ts';
import { glyph, INK, S, svg } from './clay.ts';

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const whole = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const meter = (v: number, cls = '') => `<span class="cl-snake ${cls}" style="--v:${Math.max(0, Math.min(1, v)).toFixed(3)}"><i></i></span>`;

/** A story goal's mark: a page with a folded corner and two lines of writing. */
const PAGE = svg(`<path d="M15 6h24l11 11v41H15z" fill="#fffdf6" ${S}/><path d="M39 6v11h11" fill="#f6ead0" ${S}/><path d="M22 30h21M22 39h21M22 48h12" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/>`)
  .replace('<svg ', '<svg width="1.1em" height="1.1em" ');
const mark = (g: Goal) => (g.done ? glyph('check') : g.story ? PAGE : glyph('dot'));

/** Lottie's goal card: the first goal still open, and all 3 when it's tapped open. Exact numbers live in the tooltip. */
export function goalCard(s: GameState, open: boolean, doodle: string): string {
  const goals = goalsNow(s);
  const goal = goals.find((g) => !g.done) ?? goals[0];
  const tip = goals.map((g) => `${g.text}: ${g.done ? 'done' : `${Math.round(g.progress * 100)}%`}${g.reward ? `, pays ${whole(g.reward)}` : ''}`).join('\n');
  return `<button class="cl-sticky${open ? ' open' : ''}" data-action="goals" data-testid="goals" title="${esc(`Lottie's goals\n${tip}`)}">
          <span class="cl-doodle">${doodle}</span><span class="cl-goal">${goal.story ? `${PAGE} ` : ''}${esc(goal.text)}</span>${meter(goal.progress, 'cl-pencil')}
          ${open ? `<span class="cl-goals">${goals.map((g) => `<span class="${g.done ? 'done' : ''}">${mark(g)} ${esc(g.text)}</span>`).join('')}</span>` : ''}
        </button>`;
}

/** The playing scene's ticket: who's speaking, the Grandkid's replies, and Skip. `t` is seconds into the scene. */
export function sceneTicket(s: GameState, t: number, doodle: string): string {
  const sc = playingScene(s);
  if (!sc) return '';
  const line = sceneLine(sc, t);
  const replied = s.scenes?.playing?.reply;
  const replies = replied ? '' : (sc.replies ?? []).map((r) => `<button class="cl-b ghost tiny" data-action="sceneReply" data-text="${esc(r)}">${esc(r)}</button>`).join('');
  const said = line ? `${esc(line.who)}: “${esc(line.text)}”` : '…';
  return `<div class="cl-ticket" data-testid="scene">${doodle}<b>${said}</b>
    <span class="cl-acts">${replies}<button class="cl-b ghost tiny" data-action="skipScene" data-testid="skip-scene">Skip</button></span></div>`;
}

/** A boss's offer to answer this Morning Prep (Act 3: Preston's Truce at Dot's): the tribute, Shake on it or No thanks. */
export function offerTicket(s: GameState): string {
  const o = storyOffer(s);
  if (!o) return '';
  const tip = `No raids either way for 7 days. Break it: -1 star, and no Truces for 14 days.`;
  return `<div class="cl-ticket" data-testid="story-offer" title="${esc(tip)}"><b>${esc(FACTIONS[o.from].boss.split(' ')[0])}: Truce at Dot's, ${whole(o.cost)}?</b>
    <span class="cl-acts"><button class="cl-b tiny" data-action="storyOffer" data-accept="1"${o.why ? ` disabled title="${esc(o.why)}"` : ''}>Shake on it</button><button class="cl-b ghost tiny" data-action="storyOffer" data-accept="0">No thanks</button></span></div>`;
}

/** Put the scene's ticket first in the left feed (it shows in any phase while the scene plays). */
export function withScene(feed: string, ticket: string): string {
  if (!ticket) return feed;
  const open = '<div class="cl-feed">';
  return feed.startsWith(open) ? open + ticket + feed.slice(open.length) : `${open}${ticket}</div>${feed}`;
}
