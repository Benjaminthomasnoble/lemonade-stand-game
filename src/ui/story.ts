// The story's pieces of the HUD, mounted from hud.ts: Lottie's goal card at the
// right edge (spec "Lottie's Goals": always 3, story goals wear a page icon) and
// the ticket of a playing scene, first in the left feed (its caption, the
// Grandkid's quick replies and Skip). Lessons gate the other panels' buttons:
// see taught() in src/sim/story.ts.
import type { GameState, Goal } from '../sim/economy.ts';
import { storyOffer } from '../sim/beats.ts';
import { FACTIONS, type RivalId } from '../sim/balance.ts';
import { festivalDays, yearOf } from '../sim/calendar.ts';
import { ACT_CLIMAX, hasStory, storyAct } from '../sim/story.ts';
import { goalsNow } from '../sim/goals.ts';
import { inPlay } from '../sim/land.ts';
import { playingScene, sceneLine } from '../sim/scenes.ts';
import { glyph, handshakeSVG, headBlob, INK, S, svg } from './clay.ts';
let HANDSHAKE = '';

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
  return `<div class="cl-ticket" data-testid="story-offer" title="${esc(tip)}">${HANDSHAKE ||= handshakeSVG()}<b>${esc(FACTIONS[o.from].boss.split(' ')[0])}: Truce at Dot's, ${whole(o.cost)}?</b>
    <span class="cl-acts"><button class="cl-b tiny" data-action="storyOffer" data-accept="1"${o.why ? ` disabled title="${esc(o.why)}"` : ''}>Shake on it</button><button class="cl-b ghost tiny" data-action="storyOffer" data-accept="0">No thanks</button></span></div>`;
}

/** Put the scene's ticket first in the left feed (it shows in any phase while the scene plays). */
export function withScene(feed: string, ticket: string): string {
  if (!ticket) return feed;
  const open = '<div class="cl-feed">';
  return feed.startsWith(open) ? open + ticket + feed.slice(open.length) : `${open}${ticket}</div>${feed}`;
}

// ---------- the boss board (Ben, 2026-11-08: "WHY am I playing?") ----------
/** The five bosses in the order the story beats them (Hollis falls between Cold Brew and FizzCo, off the acts). */
export const BOSS_ORDER: RivalId[] = ['blenders', 'coldbrew', 'hollis', 'fizzco', 'sourwood'];
const BOSS_SHORT: Record<RivalId, string> = { blenders: 'Brock', coldbrew: 'Juni', hollis: 'Tilly', fizzco: 'Preston', sourwood: 'Vera', snootwater: 'Sterling' };

/** Who's next: the act's climax rival in the campaign (Act 1: Brock at the Summer Fair), else the first boss still in. */
export function nextBoss(s: GameState): RivalId | null {
  if (hasStory(s) && s.story && s.story.epilogue === undefined) {
    const r = s.story.act === 1 ? 'blenders' : ACT_CLIMAX[s.story.act - 1];
    if (r && s.rivals[r].alive) return r;
  }
  return BOSS_ORDER.find((r) => s.rivals[r].alive) ?? null;
}

/** Days to the Summer Fair's Taste-Off (its last day), while Act 1 runs; null otherwise. */
export function fairIn(s: GameState): number | null {
  if (!hasStory(s) || storyAct(s) !== 1) return null;
  const d = festivalDays('summerFair', yearOf(s.day)).to - s.day;
  return d >= 0 ? d : null;
}

/** The boss board: five clay heads in their gang colours, crossed out as each falls, the next one ringed, and (Act 1)
 * the days to the Summer Fair. The whole goal of the run at a glance; the words live in the tooltip. */
export function bossBoard(s: GameState, opens: string): string {
  const next = nextBoss(s);
  const board = BOSS_ORDER.filter((r) => inPlay(s, r)); // land: a Sandbox map's picks only
  const left = board.filter((r) => s.rivals[r].alive).length;
  const fair = fairIn(s);
  const heads = board.map((r) => {
    const out = !s.rivals[r].alive;
    const col = '#' + FACTIONS[r].color.toString(16).padStart(6, '0');
    return `<span class="cl-boss${out ? ' out' : ''}${r === next ? ' next' : ''}" data-boss="${r}">${svg(headBlob(32, 30, 17, '#F6C9A0', col))}${out ? '<i class="x"></i>' : ''}</span>`;
  }).join('');
  const who = next ? `${FACTIONS[next].boss} (${FACTIONS[next].name})` : '';
  const tip = `Beat all ${['', 'one', 'two', 'three', 'four', 'five'][board.length]} drink gangs and win back Grandma's stolen recipes. ${left} of ${board.length} still standing.${next ? `\nNext: ${who}${fair !== null ? `, at the Summer Fair Taste-Off ${fair ? `in ${fair} day${fair > 1 ? 's' : ''}` : 'today'}` : ''}.` : ''}`;
  const tag = fair !== null ? `<span class="cl-fairtag">${fair ? `Fair ${fair}d` : 'Fair today!'}</span>` : next ? `<span class="cl-fairtag">${BOSS_SHORT[next]}</span>` : '';
  return `<div class="cl-chip cl-bosses" data-testid="bosses" title="${esc(tip)}"${opens}>${heads}${tag}</div>`;
}
