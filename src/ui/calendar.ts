// The calendar in the clay HUD (spec: Events and the living world): tickets for
// today's festivals (Event Sponsorship from Rank 5) and the next one coming,
// the Bugle's festival headlines, and the world lane's prep tabs.
import {
  canSponsor, DISTRICT_BY_ID, FESTIVALS, festivalsOn, isSponsored, seasonDay, SEGMENTS, sponsorCost, upcomingFestivals,
  type FestivalId, type GameState,
} from '../sim/economy.ts';
import type { Action } from './hud.ts';
import * as A from './clay.ts';
import { bookSheet, btn, esc, locked, once, tape, whole } from './recipes.ts';

export type WorldTab = 'book';
const crowdArt = once(() => A.crowdSVG());
const eggArt = once(() => A.eggSVG());

/** The Book tab. */
export function worldTabs(_s: GameState, tab: string): string {
  const t = (id: WorldTab, label: string) => `<button class="cl-tab${tab === id ? ' on' : ''}" data-action="tab" data-tab="${id}" data-testid="tab-${id}">${label}</button>`;
  return t('book', 'Book');
}

export function worldSheet(s: GameState, _tab: WorldTab): string {
  return bookSheet(s);
}

/** Morning tickets: today's festivals (with Sponsor), and the next one on the calendar. */
export function calendarTickets(s: GameState): string[] {
  const out: string[] = [];
  for (const id of festivalsOn(s.day)) {
    const f = FESTIVALS[id];
    const b = canSponsor(s, id);
    const action = isSponsored(s, id) ? tape('Sponsored') : locked(b) ? '' : btn('sponsor', `Sponsor ${whole(sponsorCost(s, id))}`, b, `data-festival="${id}" data-testid="sponsor"`);
    const tip = `${f.name}, ${DISTRICT_BY_ID[f.district].name}: day ${seasonDay(s.day) - f.from + 1} of ${f.to - f.from + 1}${f.crowd ? `. ${SEGMENTS[f.crowd].label} fill the street` : ''}`;
    out.push(`<div class="cl-ticket" data-testid="festival" title="${esc(tip)}">${crowdArt()}<b>${esc(f.name)}</b>${action}</div>`);
  }
  const next = upcomingFestivals(s)[0];
  if (next) {
    const f = FESTIVALS[next.id];
    out.push(`<div class="cl-ticket" title="${esc(`${f.name} in ${DISTRICT_BY_ID[f.district].name}, ${next.from === next.to ? `day ${next.from}` : `days ${next.from}-${next.to}`}`)}">${eggArt()}<b>Soon: ${esc(f.name)}, day ${next.from}</b></div>`);
  }
  return out;
}

/** The Bugle's calendar headlines (big tape, small tape), ahead of the weather ones. */
export function calendarHeadline(s: GameState): [string, string] | null {
  const opening = festivalsOn(s.day).find((id) => FESTIVALS[id].from === seasonDay(s.day));
  if (!opening) return null;
  const f = FESTIVALS[opening];
  const n = f.to - f.from + 1;
  return [`${f.name.toUpperCase()}!`, `${DISTRICT_BY_ID[f.district].name}, ${n === 1 ? 'today only' : `${n} days`}`];
}

/** The world lane's buttons, read off the clicked element's data attributes. */
export function worldAction(d: DOMStringMap): Action {
  return { type: 'sponsor', festival: d.festival as FestivalId };
}
