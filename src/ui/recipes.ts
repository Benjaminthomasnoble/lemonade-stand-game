// Lottie's recipe book in the clay HUD (spec: Recipe cards; Recipe pages): the
// dock's pitchers for the cards you own, a star on any that shines at this stand
// today, and the Book sheet with every page and who holds the rest. Also the few
// clay-markup helpers the world lane's panels share (the same markup as hud.ts).
import {
  DISTRICT_BY_ID, fairWinPage, hqPlot, ownedRecipes, PAGE_HOLDERS, pageHolder, PLOT_BY_ID, RECIPE_IDS, RECIPES, recipeCost, selectedStand,
  shineReason, tasteOffResult, type Blocker, type GameState, type PageHolder, type RecipeId, type ShineReason,
} from '../sim/economy.ts';
import * as A from './clay.ts';

export const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
export const tape = (inner: string, cls = '') => `<span class="cl-tape ${cls}">${inner}</span>`;
const money = (n: number) => (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const whole = (n: number) => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US');
export const cents = (n: number) => (n < 1 ? `${Math.round(n * 100)}¢` : money(n));
/** A locked thing stays hidden (no greyed "Needs Rank 5" rows). */
export const locked = (b: Blocker) => !b.ok && /Rank \d/.test(b.why);
export function btn(action: string, label: string, b: Blocker = { ok: true }, extra = '', cls = '') {
  return `<button class="cl-b ${cls}" data-action="${action}" ${extra} ${b.ok ? '' : `disabled title="${esc(b.why)}"`}>${label}</button>`;
}
export const card = (art: string, title: string, sub: string, action: string, tip = '', extra = '') => `<div class="cl-card" ${tip ? `title="${esc(tip)}"` : ''} ${extra}><span class="cl-pic">${art}</span><span class="cl-txt"><b>${title}</b>${sub ? `<i>${sub}</i>` : ''}</span>${action}</div>`;
/** Props are drawn once and reused, so renders compare equal and nothing flickers. */
export const once = <T extends unknown[]>(f: (...a: T) => string) => { const m = new Map<string, string>(); return (...a: T) => { const k = JSON.stringify(a); if (!m.has(k)) m.set(k, f(...a)); return m.get(k)!; }; };

/** Each card's pitcher colour. */
export const RECIPE_COLOR: Record<RecipeId, string> = {
  classic: '#F7C948', pink: '#F49AB8', mint: '#86D39A', strawberry: '#E8546B', frozen: '#BFE9F5', honeyGinger: '#E0A84C',
  sparkling: '#F3EFB4', lavender: '#B79CE0', halfAndHalf: '#C98A4B', secretReserve: '#FFD86B',
};
export const pitcherArt = once((id: RecipeId) => A.pitcherSVG(RECIPE_COLOR[id]));
const starArt = once(() => A.starSVG(true));
const blankArt = once(() => A.cardSVG());

const REASON: Record<ShineReason, string> = {
  everywhere: 'it shines everywhere', district: 'it shines in this district', season: 'it shines this season', heatWave: 'it shines in the Heat Wave', crowd: 'the crowd here loves it',
};

/** Where a card shines, in a few words ('' for Classic, the baseline). */
export function shineText(id: RecipeId): string {
  const r = RECIPES[id];
  if (r.everywhere) return 'Shines everywhere';
  const parts = [...r.shines.map((d) => DISTRICT_BY_ID[d].name), ...(r.season ? [r.season[0].toUpperCase() + r.season.slice(1)] : []), ...(r.heatWave ? ['Heat Waves'] : [])];
  return parts.length ? `Shines: ${parts.join(', ')}` : '';
}

/** The dock's pitchers: only the cards in the book, starred where they shine at this stand today. */
export function recipeRow(s: GameState): string {
  const st = selectedStand(s);
  const district = PLOT_BY_ID[s.selected].district;
  const ids = ownedRecipes(s);
  return `<div class="cl-row${ids.length > 5 ? ' wrap' : ''}">${ids.map((id) => {
    const why = shineReason(s, district, id);
    const r = RECIPES[id];
    const tip = `${r.label}: ${r.blurb}.${shineText(id) ? ` ${shineText(id)}.` : ''}${why ? ` Here today ${REASON[why]}!` : ''} ${cents(recipeCost(s, id))} a cup`;
    return `<button class="cl-pitch" data-action="recipe" data-id="${id}" aria-pressed="${st.recipe === id}" title="${esc(tip)}">${pitcherArt(id)}${why ? `<span class="cl-shine">${starArt()}</span>` : ''}</button>`;
  }).join('')}</div>`;
}

const HELD_BY: Partial<Record<RecipeId, string>> = {
  frozen: "Framed over Brock's blenders", honeyGinger: "Taped inside Juni's register", halfAndHalf: 'Tilly put her own name on it',
  lavender: "Vera's old harp teacher has it", sparkling: "Laminated in Preston's boardroom", secretReserve: 'Vera keeps it sealed',
};
const HOW_HOME: Partial<Record<RecipeId, string>> = {
  strawberry: 'Win the Summer Fair Taste-Off, or knock out the Blenders', frozen: 'Comes home when the Blenders are out',
  honeyGinger: 'Comes home when the Cold Brew Collective is out', halfAndHalf: 'Comes home when Hollis is beaten or bought out',
  lavender: 'The Hilltop estate auction, at Rank 8', sparkling: 'Comes home when FizzCo Tower falls or sells', secretReserve: "Waits in Sourwood Manor's Boss Room",
};
function holderLine(s: GameState, id: RecipeId, h: PageHolder): string {
  if (fairWinPage(s, id)) return 'Win any Taste-Off for it';
  if (id === 'strawberry') return !tasteOffResult(s, 'summerFair', 1) && s.day <= 14 ? 'Brock stakes it at the Summer Fair' : 'Waits at the Blend Shack';
  if (h !== PAGE_HOLDERS[id] && h !== 'harpTeacher') return `At ${hqPlot(h).name}`;
  return HELD_BY[id] ?? '';
}

/** The Book sheet: the 10 pages, the ones you have as cards to pour, the rest with who holds them. */
export function bookSheet(s: GameState): string {
  const st = selectedStand(s);
  const pages = RECIPE_IDS.map((id) => {
    const r = RECIPES[id];
    const h = pageHolder(s, id);
    if (h) return card(blankArt(), esc(r.label), esc(holderLine(s, id, h)), '', fairWinPage(s, id) ? 'Any Taste-Off win brings it home' : HOW_HOME[id] ?? '', 'data-page="missing"');
    const pour = st.recipe === id ? tape('Pouring') : btn('recipe', 'Pour', { ok: true }, `data-id="${id}"`);
    return card(pitcherArt(id), esc(r.label), esc(shineText(id) || r.blurb), pour, `${r.blurb}. ${cents(recipeCost(s, id))} a cup, +${Math.round(r.priceBonus * 100)}% price`);
  });
  return `<span class="cl-label">Lottie's book ${ownedRecipes(s).length}/${RECIPE_IDS.length}</span><div class="cl-cards" data-testid="recipe-book">${pages.join('')}</div>`;
}

