// Lottie's recipe book (spec: Recipe cards; Narrative, Recipe pages): ten
// cards, who holds each missing page and how it comes home, where each card
// shines, the Sweetness dial and the Blender Bar. Pure functions over GameState.
import {
  BLENDER_BAR_TOP_PRICE, BOARDWALK_SEASON, CUP_COST, CUPS_PER_PITCHER, RECIPES, SEASON_DEMAND, SEGMENTS, SHINE_MATCH, SWEETNESS_SHIFT,
  type RecipeId, type RivalId, type SegmentId, type Sweetness,
} from './balance.ts';
import { PLOT_BY_ID, type DistrictId } from './map.ts';
import type { GameState, Stand } from './economy.ts';
import { seasonOf } from './economy.ts';
import { hasTrophy } from './rivals.ts';
import { inPlay } from './land.ts';
import { crowdAt, setupTasteOff, type Boost, type Sponsorship, type TasteOff, type TasteOffResult } from './calendar.ts';
import { heatWaveDay, type BreakIn, type EventsState } from './events.ts';
import { newsroomNow, type FightNote, type Newsroom } from './media.ts';
import { provideKidsGoal } from './happenings.ts';
import { migrateOrders } from './vip.ts';
import { playScene } from './scenes.ts'; // story: a page won outright plays its scene at the next lull

export const RECIPE_IDS = Object.keys(RECIPES) as RecipeId[];
/** Classic, Pink and Mint: the 3 pages Lottie kept. */
export const START_RECIPES = RECIPE_IDS.filter((id) => RECIPES[id].start);

/** A page's holder: a rival boss, or (Lavender) Vera's old harp teacher. */
export type PageHolder = RivalId | 'harpTeacher';
/** Who holds each stolen page at the start (spec: Recipe pages). */
export const PAGE_HOLDERS: Partial<Record<RecipeId, PageHolder>> = {
  strawberry: 'blenders', frozen: 'blenders', honeyGinger: 'coldbrew', halfAndHalf: 'hollis', lavender: 'harpTeacher', sparkling: 'fizzco', secretReserve: 'sourwood',
};

/** The world lane's saved state: the recipe book, the calendar's Taste-Offs, boosts and sponsorships. */
export interface WorldState {
  pages: RecipeId[]; // pages in Lottie's book: the cards you can pour
  holders: Partial<Record<RecipeId, PageHolder>>; // who holds each page still missing
  homed?: Partial<Record<RecipeId, number>>; // the morning whose Bugle leads with each page that came home
  fairs: TasteOffResult[]; // every Taste-Off so far, oldest first
  tasteOff?: TasteOff; // today's, set up at dawn and judged at closing
  boosts: Boost[]; // Taste-Off wins: +20% traffic in a district for 7 days
  sponsored: Sponsorship[]; // festivals the player sponsors
  tillyWon?: boolean; // out-brewed Tilly at the County Fair: she sells Fields at 1.5×
  events?: EventsState; // random events: coming, running and past (events.ts)
  breaks?: BreakIn[]; // mid-day events as they broke in on 101.5 (today's and yesterday's)
  paper?: Newsroom; // the Bugle's notes from this dawn (media.ts)
  fights?: FightNote[]; // the latest fights, rival-vs-rival included, for the paper and the radio
  newsMark?: [number, string]; // where s.news stood at closing: the morning wire is what came after (media.ts)
  shamed?: number; // the last day you raided a kid stand (Kids' Lemonade Day): Lottie's respect, lost (story reads it)
  jinglesOff?: Partial<Record<RivalId, number>>; // 101.5: eliminated rivals' retired jingles, the morning show that airs the silence (radio.ts)
  humDay?: number; // Harbor Fest: the last day Lottie swore she wasn't humming along to the ships' horns (vip.ts)
}

/** Fills in the world state for new games and old saves (idempotent; migrateSave calls it on every load). */
export function migrateWorld(s: GameState): GameState {
  const w = (s.world ??= { pages: [], holders: { ...PAGE_HOLDERS }, fairs: [], boosts: [], sponsored: [] });
  w.pages ??= [];
  w.holders ??= { ...PAGE_HOLDERS };
  w.fairs ??= [];
  w.boosts ??= [];
  w.sponsored ??= [];
  w.events ??= { on: [], past: [] };
  w.paper ??= newsroomNow(s); // the Bugle's first notes: tomorrow's paper reports what changes from here
  for (const id of START_RECIPES) if (!w.pages.includes(id)) w.pages.push(id);
  for (const id of RECIPE_IDS) {
    if (w.pages.includes(id)) delete w.holders[id];
    else w.holders[id] ??= PAGE_HOLDERS[id];
  }
  // Older saves: a rival already out of the game has handed its pages back.
  for (const id of RECIPE_IDS) {
    const h = w.holders[id];
    if (h && h !== 'harpTeacher' && s.rivals[h] && !s.rivals[h].alive && inPlay(s, h)) grantPage(s, id, true); // land: a rival a Sandbox left out never fell: its page comes from a fair
  }
  if (!w.tasteOff && s.phase !== 'report') setupTasteOff(s); // loaded on a Taste-Off morning
  provideKidsGoal(); // Kids' Lemonade Day's goal on Lottie's card (happenings.ts)
  migrateOrders(s); // VIP orders from before recipes and loading rates (vip.ts)
  return s;
}

export function worldOf(s: GameState): WorldState {
  return s.world ?? migrateWorld(s).world!;
}

export const ownsRecipe = (s: GameState, id: RecipeId) => (s.world?.pages ?? START_RECIPES).includes(id);
/** The cards in Lottie's book, in book order. */
export const ownedRecipes = (s: GameState) => RECIPE_IDS.filter((id) => ownsRecipe(s, id));
/** Who holds a page you don't have yet (null once it's in the book). */
export function pageHolder(s: GameState, id: RecipeId): PageHolder | null {
  return ownsRecipe(s, id) ? null : s.world?.holders[id] ?? PAGE_HOLDERS[id] ?? null;
}
/** Premium pages (Mega Contracts): any won or recovered page beyond the starting three and Strawberry. */
export const isPremium = (id: RecipeId) => !RECIPES[id].start && id !== 'strawberry';
export const premiumPages = (s: GameState) => ownedRecipes(s).filter(isPremium).length;

/** The line each page posts as it comes home (the HUD's toast; the next morning's Bugle leads with the page too). */
const PAGE_HOME: Record<RecipeId, string> = {
  classic: '', pink: '', mint: '',
  strawberry: 'The Strawberry page comes home! Lottie: "Berries go in last. Brock never learned."',
  frozen: 'The Frozen Lemonade page comes home, still framed over Brock\'s blenders.',
  honeyGinger: 'Honey-Ginger Hot Lemonade comes home, peeled out of Juni\'s register.',
  halfAndHalf: 'Tilly hands over Hollis Half-and-Half. Lottie: "Tea in my lemonade. Fine. It\'s good."',
  lavender: 'The Lavender page comes home. Lottie: "Vera paid for harp lessons with my recipe!"',
  sparkling: 'Sparkling Lemonade comes home, still laminated from the FizzCo boardroom.',
  secretReserve: 'Lottie\'s Secret Reserve, sealed for 40 years: "Open together."',
};

/**
 * The scenes for the pages the campaign wins outright, at the next lull (story's playScene; campaign only). Strawberry
 * comes home that way only at the Summer Fair, so its scene is Act 1's climax: Brock swears revenge on 101.5. A page a
 * fallen rival hands back gets no scene of its own: Lottie names it in their exit scene (exits.ts).
 */
const PAGE_SCENES: Partial<Record<RecipeId, [string, string][]>> = {
  strawberry: [['Brock, on 101.5', "This isn't over, bro! You hear me?"], ['Lottie', 'Berries go in last, Brock. Always last.'], ['Lottie', 'Kids and tourists love it. Try the Boardwalk.']],
  lavender: [['Lottie', 'Vera traded my Lavender page for harp lessons.'], ['Lottie', 'In 1980. She never could play.'], ['Lottie', 'High rollers love it. Try the Hilltop.']],
};
const SCENE_STEP = 4.2;

/** A page won outright: its short scene waits for the next lull. Returns false if it won't play (Sandbox, or none). */
export function pageScene(s: GameState, id: RecipeId): boolean {
  const said = PAGE_SCENES[id];
  if (!said) return false;
  const lines = said.map(([who, text], i) => ({ who, text, at: 0.5 + i * SCENE_STEP }));
  return playScene(s, `page-${id}`, { lines, recap: PAGE_HOME[id], seconds: lines[lines.length - 1].at + 4 });
}

/** A page comes home and becomes a recipe card. Idempotent; returns false if it was already in the book. quiet: no news
 * (an older save catching up); scene false: the rival who held it just fell, and their exit scene names it. */
export function grantPage(s: GameState, id: RecipeId, quiet = false, scene = true): boolean {
  const w = worldOf(s);
  if (w.pages.includes(id)) return false;
  w.pages.push(id);
  delete w.holders[id];
  if (quiet) return true;
  (w.homed ??= {})[id] = s.day + 1; // tomorrow's paper (pagesAtDawn moves overnight ones to this morning's)
  s.news.push(PAGE_HOME[id]);
  if (scene) pageScene(s, id);
  return true;
}

/** Dawn: a page that came home overnight or at dawn (a rival gone bust) leads this morning's Bugle, not tomorrow's. */
export function pagesAtDawn(s: GameState): void {
  const homed = s.world?.homed;
  if (!homed) return;
  for (const id of RECIPE_IDS) if (homed[id] === s.day + 1) homed[id] = s.day;
}

/** The pages this morning's Bugle leads with. */
export const pagesInTheBugle = (s: GameState): RecipeId[] => RECIPE_IDS.filter((id) => s.world?.homed?.[id] === s.day);

/** Called from eliminate() on every route (HQ captured, Faction Buyout, 7 days bankrupt): their pages come home, named
 * in the boss's exit scene that follows (exits.ts). */
export function recoverPage(s: GameState, rival: RivalId): void {
  const w = worldOf(s);
  for (const id of RECIPE_IDS) if (w.holders[id] === rival) grantPage(s, id, false, false);
}

/** A page changes hands (the Lavender auction: outbid, it moves to the winner's HQ). */
export function movePage(s: GameState, id: RecipeId, holder: PageHolder): void {
  const w = worldOf(s);
  if (!w.pages.includes(id)) w.holders[id] = holder;
}

/** Pour a card at a stand, if it's in the book. */
export function pickRecipe(s: GameState, st: Stand, id: RecipeId): boolean {
  if (!ownsRecipe(s, id)) return false;
  st.recipe = id;
  return true;
}

// ---------- where a card shines, the Sweetness dial and the Blender Bar ----------

export type ShineReason = 'everywhere' | 'district' | 'season' | 'heatWave' | 'crowd';

/** A Heat Wave is on today (events.ts): Frozen Lemonade shines everywhere. */
export const heatWaveOn = (s: GameState): boolean => heatWaveDay(s);

/** Why a card shines at a stand in this district today, or null. */
export function shineReason(s: GameState, district: DistrictId, id: RecipeId): ShineReason | null {
  const r = RECIPES[id];
  if (r.everywhere) return 'everywhere';
  if (r.shines.includes(district)) return 'district';
  if (r.season === seasonOf(s.day)) return 'season';
  if (r.heatWave && heatWaveOn(s)) return 'heatWave';
  const crowd = crowdAt(s, district);
  if (crowd && SEGMENTS[crowd].favorites.includes(id)) return 'crowd';
  return null;
}

/** One number per stand, for every customer there: ×1.2 where the card shines, ×1.3 for the Secret Reserve, else ×1. */
export function recipeMatch(s: GameState, plotId: string, id?: RecipeId): number {
  const ps = s.plots[plotId];
  if (ps?.owner !== 'player' || !ps.stand) return 1;
  const card = id ?? ps.stand.recipe;
  return shineReason(s, PLOT_BY_ID[plotId].district, card) ? RECIPES[card].everywhere ?? SHINE_MATCH : 1;
}

/** Classic is neutral; Extra wins kids and costs seniors and office workers 10%; Less does the reverse. */
export function sweetnessFit(seg: SegmentId, v: Sweetness): number {
  const want = SEGMENTS[seg].sweet;
  if (want === 'classic' || v === 'classic') return 1;
  return v === want ? 1 + SWEETNESS_SHIFT : 1 - SWEETNESS_SHIFT;
}

/** The Blend Shack Trophy: Frozen Lemonade's top price rises 20% once the Blenders are out, on every route (HQ captured,
 * Faction Buyout, 7 days bankrupt: canon, Elimination), so a bust whose HQ stands empty still lifts it. */
export const blenderBar = (s: GameState, id: RecipeId) =>
  (id === 'frozen' && (hasTrophy(s, 'blenders') || (s.rivals.blenders?.alive === false && inPlay(s, 'blenders'))) ? BLENDER_BAR_TOP_PRICE : 1); // land: never from a rival a Sandbox left out

const NEUTRAL = Object.freeze({ match: 1, sweet: 1, top: 1 });
/** appealFor's one call: the card's match, the Sweetness factor for this segment and the top-price perk (rivals: all 1). */
export function cardFit(s: GameState, plotId: string, seg: SegmentId): { match: number; sweet: number; top: number } {
  const ps = s.plots[plotId];
  if (ps.owner !== 'player' || !ps.stand) return NEUTRAL;
  return { match: recipeMatch(s, plotId), sweet: sweetnessFit(seg, ps.stand.sweetness), top: blenderBar(s, ps.stand.recipe) };
}

/** Season demand at a stand: Honey-Ginger Hot Lemonade takes no Winter penalty (×1, the Boardwalk too). */
export function seasonDemand(s: GameState, plotId: string): number {
  const season = seasonOf(s.day);
  if (season === 'winter' && s.plots[plotId].stand?.recipe === 'honeyGinger') return 1;
  return (PLOT_BY_ID[plotId].district === 'boardwalk' ? BOARDWALK_SEASON : SEASON_DEMAND)[season];
}

/** Cost of one cup of a card at today's market (lemons, sugar and ice move with it; the cup and extras are flat). */
export function recipeCost(s: GameState, id: RecipeId): number {
  const r = RECIPES[id];
  return (r.lemonsPerPitcher * s.market.lemons + r.sugarPerPitcher * s.market.sugar) / CUPS_PER_PITCHER + r.icePerCup * s.market.ice + r.extraPerCup + CUP_COST;
}
