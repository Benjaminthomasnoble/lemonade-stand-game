// 101.5 The Squeeze in the clay HUD (spec: Music and sound): a ticket in the feed with Cal Clementine's line on the air.
// In Morning Prep it carries the whole show, and tuneRadio turns the dial through it in place, a line every few seconds,
// so the feed isn't redrawn under the player's finger. "All day" keeps the station on as the soundtrack (kept on this
// device, like the other options). Text-first, so the Captions option (on by default) gates the ticket: captions cover the radio.
import { airedToday, morningShow, radioOn, type GameState } from '../sim/economy.ts';
import * as A from './clay.ts';
import { esc, once } from './recipes.ts';

const KEY = 'lemonade-stand-wars/radio/v1';
/** How long each line of the morning show stays up, in real milliseconds. placeholder: spec gap */
export const RADIO_LINE_MS = 6000;
const art = once(() => A.towerSVG());
let allDay: boolean | undefined;

/** The optional soundtrack: 101.5 all day and night, not only in Morning Prep and from your L3+ stands' radios. */
export function soundtrack(): boolean {
  if (allDay === undefined) {
    try { allDay = localStorage.getItem(KEY) === '1'; } catch { allDay = false; } // blocked storage: off
  }
  return allDay;
}
export function toggleSoundtrack(): void {
  allDay = !soundtrack();
  try { localStorage.setItem(KEY, allDay ? '1' : '0'); } catch { /* blocked storage: this session only */ }
}

/** The day's lines, worked out once a game minute (the HUD draws every frame). */
let memo: { key: string; lines: string[] } = { key: '', lines: [] };
function lines(s: GameState): string[] {
  const key = [s.day, s.phase, s.minute, s.brandTier, s.world?.breaks?.length ?? 0, s.world?.fights?.length ?? 0, s.world?.events?.on.length ?? 0].join('|');
  if (memo.key !== key) memo = { key, lines: (s.phase === 'prep' ? morningShow(s) : airedToday(s).slice(-1)).map((l) => l.text) };
  return memo.lines;
}

/** The feed's 101.5 ticket while the station is on: the line on the air, or in Morning Prep the whole show (tuneRadio turns
 * through it). captions: the Captions option (Options; the HUD passes it). */
export function radioTicket(s: GameState, captions = true): string {
  if (!captions || !radioOn(s, soundtrack())) return '';
  const show = lines(s);
  if (!show.length) return '';
  const all = soundtrack();
  const toggle = `<button class="cl-b ghost tiny" data-action="radio" aria-pressed="${all}" title="${all ? 'Back to mornings and L3+ stand radios' : 'Keep 101.5 on all day'}">All day${all ? ' ✓' : ''}</button>`;
  return `<div class="cl-ticket" data-testid="radio"${s.phase === 'prep' ? ` data-show="${esc(JSON.stringify(show))}"` : ''} title="101.5 The Squeeze, with Cal Clementine">`
    + `${art()}<b>101.5 The Squeeze</b><span class="cl-note" data-testid="radio-line">${esc(show[0])}</span><span class="cl-acts">${toggle}</span></div>`;
}

let tuned: { raw: string; lines: string[] } = { raw: '', lines: [] };
/** Each frame, once the feed is drawn: the morning show's line for this moment, set in place. */
export function tuneRadio(feed: HTMLElement, now: number): void {
  const t = feed.querySelector<HTMLElement>('[data-show]');
  if (!t) return;
  const raw = t.dataset.show ?? '';
  if (raw !== tuned.raw) {
    try { tuned = { raw, lines: JSON.parse(raw) as string[] }; } catch { return; }
  }
  const line = tuned.lines[Math.floor(now / RADIO_LINE_MS) % Math.max(1, tuned.lines.length)];
  const el = t.querySelector<HTMLElement>('[data-testid="radio-line"]');
  if (el && line && el.textContent !== line) el.textContent = line;
}
