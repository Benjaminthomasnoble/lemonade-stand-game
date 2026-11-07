// The calendar in the clay HUD (spec: Events and the living world): tickets for
// today's festivals (Event Sponsorship from Rank 5) and the next one coming, the
// Taste-Off sheet with three judges' hints and your entry, the result on the
// day's-end card, and the Bugle's calendar headlines.
import {
  boothCeiling, canSponsor, CONTESTANT_NAME, DISTRICT_BY_ID, entryOf, festivalDays, FESTIVALS, festivalsOn, isSponsored, ownedRecipes,
  RECIPES, seasonDay, SEGMENTS, sponsorCost, sponsorHalfPrice, storyFairs, TASTE_OFF, tasteOffResult, tasteOffToday, upcomingFestivals,
  type FestivalId, type GameState, type Judge, type RecipeId, type SegmentId, type Stake, type Sweetness,
} from '../sim/economy.ts';
import type { Action } from './hud.ts';
import * as A from './clay.ts';
import { bookSheet, btn, card, cents, esc, locked, once, pageHeadline, pitcherArt, tape, whole } from './recipes.ts';

export type WorldTab = 'book' | 'fair';
const SWEET: Sweetness[] = ['less', 'classic', 'extra'];
const rosetteArt = once(() => A.rosetteSVG());
const crowdArt = once(() => A.crowdSVG());
const eggArt = once(() => A.eggSVG());
const cubeArt = once(() => A.cubeSVG());
const judgeArt = once((i: number) => { const h = [['#F6C9A0', '#7CC47F'], ['#B9784F', '#E8704F'], ['#F8D3B0', '#3BB4C1']][i % 3]; return A.svg(A.headBlob(32, 26, 15, h[0], h[1])); });

const FOR: Record<SegmentId, string> = {
  kids: 'For the kids', families: 'For the whole family', seniors: 'For the seniors', students: 'For the students',
  office: 'For the office crowd', tourists: 'For the tourists', workers: 'For the hard workers', highRollers: 'For the high rollers',
};
const SWEET_HINT: Record<Sweetness, string> = { less: 'Not too sweet', classic: 'Just sweet enough', extra: 'Sweet as can be' };
const PRICE_HINT = { bargain: 'Easy on the wallet', fair: 'A fair price', extra: 'Worth a little extra' };
const hint = (j: Judge) => (j.kind === 'recipe' ? FOR[j.segment] : j.kind === 'sweet' ? SWEET_HINT[j.want] : PRICE_HINT[j.band]);
const hintTip = (j: Judge) => (j.kind === 'recipe' ? `Pour a card ${SEGMENTS[j.segment].label.toLowerCase()} love` : j.kind === 'sweet' ? 'Mind the Sweetness' : "Price it against the booth's top price");

/** The Book tab always; the Taste-Off tab on a fair's last morning. */
export function worldTabs(s: GameState, tab: string): string {
  const t = (id: WorldTab, label: string) => `<button class="cl-tab${tab === id ? ' on' : ''}" data-action="tab" data-tab="${id}" data-testid="tab-${id}">${label}</button>`;
  return t('book', 'Book') + (tasteOffToday(s) ? t('fair', 'Taste-Off') : '');
}

export function worldSheet(s: GameState, tab: WorldTab): string {
  return tab === 'book' ? bookSheet(s) : fairSheet(s);
}

/** Three judges' hints, then your answer: a card, a Sweetness setting and a price. */
function fairSheet(s: GameState): string {
  const t = tasteOffToday(s);
  if (!t) return '';
  const e = entryOf(s);
  const top = boothCeiling(s, e.recipe, t.district);
  const judges = t.judges.map((j, i) => card(judgeArt(i), esc(hint(j)), `Judge ${i + 1}`, '', hintTip(j))).join('');
  const pitchers = ownedRecipes(s).map((id) => `<button class="cl-pitch" data-action="entry" data-recipe="${id}" aria-pressed="${e.recipe === id}" title="${esc(RECIPES[id].label)}">${pitcherArt(id)}</button>`).join('');
  const lvl = SWEET.indexOf(e.sweetness);
  const cubes = SWEET.map((v, i) => `<button class="cl-cube" data-action="entry" data-sweet="${v}" aria-pressed="${i <= lvl}" title="Sweetness: ${v}">${cubeArt()}</button>`).join('');
  const price = `<button class="cl-knob cl-minus" data-action="entry" data-delta="-0.05" aria-label="Lower price"></button>
    <div class="cl-chalk${e.price > top + 1e-9 ? ' loss' : ''}" title="The booth's top price is ${cents(top)}"><b data-testid="entry-price">${cents(e.price)}</b></div>
    <button class="cl-knob cl-plus" data-action="entry" data-delta="0.05" aria-label="Raise price"></button>`;
  const prize = `The winner gets +${TASTE_OFF.stars} star, +${Math.round(TASTE_OFF.traffic * 100)}% traffic in ${DISTRICT_BY_ID[t.district].name} for ${TASTE_OFF.days} days and a ${whole(TASTE_OFF.prize)} prize`;
  const stake = t.stake ? `<span class="cl-note" data-testid="taste-off-stake">${STAKE[t.stake]}</span>` : '';
  return `<span class="cl-label" title="${esc(prize)}">${esc(FESTIVALS[t.fair].name)} Taste-Off</span>${stake}<div class="cl-cards">${judges}</div>
    <div class="cl-tray" data-testid="taste-off-entry"><div class="cl-sec cl-recipe"><div class="cl-row wrap">${pitchers}</div><div class="cl-row cl-cubes">${cubes}</div></div>
      <div class="cl-sec cl-price"><div class="cl-row">${price}</div></div></div>
    <span class="cl-note" title="${esc(prize)}">vs ${esc(t.vs.map((c) => CONTESTANT_NAME[c]).join(', '))} · judged at closing</span>`;
}

const STAKE: Record<Stake, string> = { strawberry: 'Brock stakes his Strawberry page', tilly: 'Win, and Tilly sells Fields at 1.5x' };

/** One line of the week's calendar: the days, the name and the district. */
function calendarLine(x: { id: FestivalId; from: number; to: number }): string {
  const f = FESTIVALS[x.id];
  return `${x.from === x.to ? `Day ${x.from}` : `Days ${x.from}-${x.to}`}: ${f.name}, ${DISTRICT_BY_ID[f.district].name}`;
}

/** Morning tickets: the Taste-Off, today's festivals (district, day of how many, Sponsor), and the week's calendar. */
export function calendarTickets(s: GameState): string[] {
  const out: string[] = [];
  const t = tasteOffToday(s);
  if (t) out.push(`<div class="cl-ticket good" data-testid="taste-off" title="${esc(`${FESTIVALS[t.fair].name} Taste-Off in ${DISTRICT_BY_ID[t.district].name}, judged at closing`)}">${rosetteArt()}<b>Taste-Off today!</b>${btn('tab', 'Enter', { ok: true }, 'data-tab="fair"')}</div>`);
  for (const id of festivalsOn(s.day)) {
    const f = FESTIVALS[id];
    const b = canSponsor(s, id);
    const half = sponsorHalfPrice(s) ? ' title="Word of Mouth: half price"' : '';
    const action = isSponsored(s, id) ? tape('Sponsored') : locked(b) ? '' : btn('sponsor', `Sponsor ${whole(sponsorCost(s, id))}`, b, `data-festival="${id}" data-testid="sponsor"${b.ok ? half : ''}`);
    const length = f.to - f.from + 1;
    const when = length === 1 ? 'today only' : `day ${seasonDay(s.day) - f.from + 1} of ${length}`;
    const tip = `${f.name}, ${DISTRICT_BY_ID[f.district].name}, ${when}${f.crowd ? `. ${SEGMENTS[f.crowd].label} fill the street` : ''}`;
    out.push(`<div class="cl-ticket" data-testid="festival" title="${esc(tip)}">${crowdArt()}<b>${esc(f.name)}</b><span class="cl-note">${esc(`${DISTRICT_BY_ID[f.district].name}, ${when}`)}</span>${action}</div>`);
  }
  const week = upcomingFestivals(s);
  if (week.length) out.push(`<div class="cl-ticket" data-testid="calendar" title="The week's calendar">${eggArt()}<b>This week</b>${week.map((x) => `<span class="cl-note">${esc(calendarLine(x))}</span>`).join('')}</div>`);
  return out;
}

/** The day's-end card: how today's Taste-Off went. */
export function tasteOffLine(s: GameState, day: number): string {
  const r = s.world?.fairs.find((x) => x.day === day);
  if (!r) return '';
  const tip = `Your marks ${r.marks.map((m) => `×${m}`).join(' ')} = ${r.score.toFixed(2)}; best rival ${r.best.toFixed(2)}`;
  const line = r.winner === 'player' ? 'You won the Taste-Off!' : `${CONTESTANT_NAME[r.winner]} won the Taste-Off`;
  return `<div class="cl-lottie" data-testid="taste-off-result" title="${esc(tip)}"><span class="cl-doodle">${rosetteArt()}</span><span>${line}</span></div>`;
}

/** The Bugle's world headlines (big tape, small tape), ahead of the weather ones: the fairs, pages coming home, festivals. */
export function calendarHeadline(s: GameState): [string, string] | null {
  const campaign = storyFairs(s);
  const act1 = tasteOffResult(s, 'summerFair', 1);
  if (campaign && act1?.stake === 'strawberry' && act1.winner === 'player' && s.day === act1.day + 1) return ['FOLDING TABLE STUNS', 'Smoothie Empire at Summer Fair'];
  const page = pageHeadline(s);
  if (page) return page;
  if (campaign && s.day === festivalDays('summerFair', 1).to - 2 && s.rivals.blenders.alive) return ['TASTE-OFF IN 2 DAYS', 'Bodine not worried, bro'];
  const t = tasteOffToday(s);
  if (t) return ['TASTE-OFF TODAY!', `${FESTIVALS[t.fair].name}, ${DISTRICT_BY_ID[t.district].name}`];
  const opening = festivalsOn(s.day).find((id) => FESTIVALS[id].from === seasonDay(s.day));
  if (!opening) return null;
  const f = FESTIVALS[opening];
  const n = f.to - f.from + 1;
  return [`${f.name.toUpperCase()}!`, `${DISTRICT_BY_ID[f.district].name}, ${n === 1 ? 'today only' : `${n} days`}`];
}

/** The world lane's buttons, read off the clicked element's data attributes. */
export function worldAction(d: DOMStringMap): Action {
  if (d.action === 'sponsor') return { type: 'sponsor', festival: d.festival as FestivalId };
  return { type: 'entry', recipe: d.recipe as RecipeId | undefined, sweetness: d.sweet as Sweetness | undefined, delta: d.delta ? Number(d.delta) : undefined };
}
