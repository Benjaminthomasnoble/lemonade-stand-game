// The calendar (spec: Events and the living world): fairs and festivals on a
// 56-day year, festival crowds, Event Sponsorship, and the Taste-Offs at the
// Summer Fair and the County Fair, with their prizes and stakes (Strawberry,
// Tilly's Fields). Pure functions over GameState, like the rest of the sim.
import { nextRandom } from './rng.ts';
import {
  FACTIONS, FESTIVAL_CROWD_SHARE, FESTIVALS, PRICE_TOLERANCE, RANKS, RECIPES, SEASON_DAYS, SEASONS, SEGMENTS, SPONSORSHIP, STAND_LEVELS, TASTE_OFF,
  TASTE_OFF_SKILL, TILLY_FAIR_ACT, TILLY_FAIR_YEAR, TILLY_FIELD_BUYOUT, TILLY_WAITS_FOR_FAIR, YEAR_DAYS,
  type FestivalId, type RecipeId, type RivalId, type SegmentId, type Sweetness,
} from './balance.ts';
import { DISTRICT_BY_ID, PLOT_BY_ID, PLOTS, type DistrictId, type FactionId } from './map.ts';
import type { Blocker, GameState, Stand } from './economy.ts';
import { playerStands, seasonDay, seasonOf, selectedStand } from './economy.ts';
import { book } from './ledger.ts'; // the Ledger: each cash movement on its row
import { blenderBar, grantPage, ownedRecipes, ownsRecipe, pageHolder, pagesAtDawn, RECIPE_IDS, worldOf } from './recipes.ts';
import { actOf, isEndless } from './modes.ts';
import { perkActive } from './land.ts'; // land: the Full Control perks
import { eventCrowd, eventsAtClose, eventsAtDawn } from './events.ts';
import { mediaAtClose, mediaAtDawn } from './media.ts';
import { ceaseAndDesistIn } from './schemes.ts';
import { addRivalStars } from './demand.ts'; // a rival's own Reputation: its Taste-Off star

const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const RIVALS = Object.keys(FACTIONS) as RivalId[];
export const FESTIVAL_IDS = Object.keys(FESTIVALS) as FestivalId[];
export type FairId = 'summerFair' | 'countyFair';
export const FAIRS = FESTIVAL_IDS.filter((id) => FESTIVALS[id].fair) as FairId[];
const SWEET: Sweetness[] = ['less', 'classic', 'extra'];

// ---------- dates ----------

export const yearOf = (day: number) => Math.floor((day - 1) / YEAR_DAYS) + 1;

/** The absolute days a festival runs in a given year (year 1 starts on Day 1). */
export function festivalDays(id: FestivalId, year: number): { from: number; to: number } {
  const f = FESTIVALS[id];
  const start = (year - 1) * YEAR_DAYS + SEASONS.indexOf(f.season) * SEASON_DAYS;
  return { from: start + f.from, to: start + f.to };
}

const runsOn = (id: FestivalId, day: number) => {
  const f = FESTIVALS[id], d = seasonDay(day);
  return f.season === seasonOf(day) && d >= f.from && d <= f.to;
};
/** Festivals running on a day. */
export const festivalsOn = (day: number) => FESTIVAL_IDS.filter((id) => runsOn(id, day));
/** Seam for other lanes (Election Day's Citation rules): is this festival on today? */
export const isEventDay = (s: GameState, id: FestivalId, day = s.day) => runsOn(id, day);

/** Festivals starting in the next few days (the week's calendar), soonest first. */
export function upcomingFestivals(s: GameState, days = 7): { id: FestivalId; from: number; to: number }[] {
  const out: { id: FestivalId; from: number; to: number }[] = [];
  for (const year of [yearOf(s.day), yearOf(s.day) + 1]) {
    for (const id of FESTIVAL_IDS) {
      const d = festivalDays(id, year);
      if (d.from > s.day && d.from <= s.day + days) out.push({ id, ...d });
    }
  }
  return out.sort((a, b) => a.from - b.from);
}

// ---------- festival crowds ----------

// Festival crowds depend on the day alone, and every passerby asks, so each day's are worked out once.
const dayCrowds = new Map<number, Partial<Record<DistrictId, SegmentId>>>();
/** The crowd an event fills a district with today: a random event's (the Tourist Bus), else a festival's. */
export function crowdAt(s: GameState, district: DistrictId): SegmentId | undefined {
  const event = eventCrowd(s, district); // not in the day cache: it rides on the save, not the calendar
  if (event) return event.segment;
  let crowds = dayCrowds.get(s.day);
  if (!crowds) {
    crowds = {};
    for (const id of festivalsOn(s.day)) { const f = FESTIVALS[id]; if (f.crowd) crowds[f.district] ??= f.crowd; }
    if (dayCrowds.size > 400) dayCrowds.clear();
    dayCrowds.set(s.day, crowds);
  }
  return crowds[district];
}

/** The share of a district's passersby who are its crowd today: a Tourist Bus's 70%, a festival's half. */
export const crowdShareAt = (s: GameState, district: DistrictId) => eventCrowd(s, district)?.share ?? FESTIVAL_CROWD_SHARE;

/** A passerby in a festival district is one of the festival crowd half the time (a Tourist Bus's, 70%). */
export function festivalCrowd(s: GameState, rng: { seed: number }, district: DistrictId): SegmentId | undefined {
  const crowd = crowdAt(s, district);
  return crowd && nextRandom(rng) < crowdShareAt(s, district) ? crowd : undefined;
}

// ---------- traffic: Taste-Off wins and sponsorships, added into the marketing number ----------

export interface Boost { owner: FactionId; district: DistrictId; from: number; to: number }
export interface Sponsorship { festival: FestivalId; district: DistrictId; from: number; to: number }

const standPlots = new WeakMap<Stand, string>();
function plotOfStand(s: GameState, st: Stand): string | undefined {
  const known = standPlots.get(st);
  if (known && s.plots[known]?.stand === st) return known;
  const p = PLOTS.find((q) => s.plots[q.id].stand === st);
  if (p) standPlots.set(st, p.id);
  return p?.id;
}

/** marketingMultiplier's one term: +20% after a Taste-Off win, +50% at sponsored festivals, in that district.
 * A Cease-and-Desist there makes the sponsorship count for nothing (your marketing is blocked; a Taste-Off win isn't marketing). */
export function calendarTraffic(s: GameState, owner: FactionId, st?: Stand): number {
  const w = s.world;
  if (!st || !w || (!w.boosts.length && !w.sponsored.length)) return 0;
  const live = (x: { from: number; to: number }) => x.from <= s.day && x.to >= s.day;
  const won = w.boosts.filter((b) => b.owner === owner && live(b));
  const sponsored = owner === 'player' ? w.sponsored.filter(live) : [];
  if (!won.length && !sponsored.length) return 0;
  const plot = plotOfStand(s, st);
  if (!plot) return 0;
  const d = PLOT_BY_ID[plot].district;
  const backed = sponsored.some((x) => x.district === d) && !underCeaseAndDesist(s, d);
  return (won.some((b) => b.district === d) ? TASTE_OFF.traffic : 0) + (backed ? SPONSORSHIP.traffic : 0);
}

// ---------- Event Sponsorship ----------

/** Word of Mouth (Campus & Arts at Full Control): local campaigns half price everywhere, Event Sponsorship included
 * (land's perkActive). */
export const sponsorHalfPrice = (s: GameState): boolean => perkActive(s, 'wordOfMouth');

/** FizzCo's Cease-and-Desist (src/sim/schemes.ts) blocks your marketing in one district for 3 days; MARKETING_BLOCKS takes
 * any other block. */
export const MARKETING_BLOCKS: ((s: GameState, district: DistrictId) => boolean)[] = [];
export const underCeaseAndDesist = (s: GameState, district: DistrictId): boolean => ceaseAndDesistIn(s, district) || MARKETING_BLOCKS.some((f) => f(s, district));

/** $2,000 for each festival day left, today included ($1,000 with Word of Mouth). */
export function sponsorCost(s: GameState, id: FestivalId): number {
  const days = festivalDays(id, yearOf(s.day)).to - s.day + 1;
  return SPONSORSHIP.perDay * days * (sponsorHalfPrice(s) ? SPONSORSHIP.wordOfMouth : 1);
}
export const isSponsored = (s: GameState, id: FestivalId) => !!s.world?.sponsored.some((x) => x.festival === id && x.to >= s.day);

export function canSponsor(s: GameState, id: FestivalId): Blocker {
  if (s.rank < SPONSORSHIP.rank) return { ok: false, why: `Needs Rank ${SPONSORSHIP.rank}, ${RANKS[SPONSORSHIP.rank - 1].title}` };
  if (!runsOn(id, s.day)) return { ok: false, why: 'Only while the festival runs' };
  if (isSponsored(s, id)) return { ok: false, why: 'Sponsored' };
  if (s.phase !== 'prep') return { ok: false, why: 'Sponsor during Morning Prep' };
  const d = FESTIVALS[id].district;
  if (!playerStands(s).some((p) => p.district === d)) return { ok: false, why: `No stand of yours in ${DISTRICT_BY_ID[d].name}` };
  if (underCeaseAndDesist(s, d)) return { ok: false, why: `Cease-and-Desist: your ads count for nothing in ${DISTRICT_BY_ID[d].name}` };
  const cost = sponsorCost(s, id);
  if (s.cash < cost) return { ok: false, why: `Needs $${cost.toLocaleString('en-US')}` };
  return { ok: true };
}

/** Sponsor a festival for the rest of its run, paid up front. */
export function sponsorFestival(s: GameState, id: FestivalId): boolean {
  if (!canSponsor(s, id).ok) return false;
  const cost = sponsorCost(s, id);
  const f = FESTIVALS[id];
  book(s, 'marketing', -cost);
  worldOf(s).sponsored.push({ festival: id, district: f.district, from: s.day, to: festivalDays(id, yearOf(s.day)).to });
  s.news.push(`Lottie's Lemonade sponsors the ${f.name}: +${Math.round(SPONSORSHIP.traffic * 100)}% traffic at your ${DISTRICT_BY_ID[f.district].name} stands!`);
  return true;
}

// ---------- Taste-Offs ----------

export type PriceBand = 'bargain' | 'fair' | 'extra';
export const PRICE_BANDS: PriceBand[] = ['bargain', 'fair', 'extra'];
/** Each judge's hint points at recipe match (a segment's favorites), Sweetness or price fit. */
export type Judge = { kind: 'recipe'; segment: SegmentId } | { kind: 'sweet'; want: Sweetness } | { kind: 'price'; band: PriceBand };
export type Contestant = RivalId | 'local'; // 'local': Dot's Diner, when no rival enters
export type Stake = 'strawberry' | 'tilly';
export interface TasteOffEntry { recipe?: RecipeId; sweetness?: Sweetness; price?: number }
export interface TasteOff { fair: FairId; day: number; district: DistrictId; judges: Judge[]; vs: Contestant[]; stake?: Stake; entry: TasteOffEntry }
export interface TasteOffResult {
  fair: FairId; day: number; district: DistrictId; winner: 'player' | Contestant; vs: Contestant[]; stake?: Stake;
  score: number; best: number; marks: number[]; entry: Required<TasteOffEntry>;
}
/** First names for news lines and the HUD. */
export const CONTESTANT_NAME: Record<Contestant, string> = { blenders: 'Brock', hollis: 'Tilly', fizzco: 'Preston', coldbrew: 'Juni', sourwood: 'Vera', local: 'Dot' };

/** Act 1's climax uses the spec's own three hints: for the kids, not too sweet, worth a little extra. */
const ACT1_JUDGES: Judge[] = [{ kind: 'recipe', segment: 'kids' }, { kind: 'sweet', want: 'less' }, { kind: 'price', band: 'extra' }];

/** Today's Taste-Off, if one is waiting to be judged. */
export function tasteOffToday(s: GameState): TasteOff | undefined {
  const t = s.world?.tasteOff;
  return t && t.day === s.day ? t : undefined;
}

/** The most recent result for a fair (or that fair in a given year): story's seam for goals and scenes. */
export function tasteOffResult(s: GameState, fair: FairId, year?: number): TasteOffResult | undefined {
  const all = (s.world?.fairs ?? []).filter((r) => r.fair === fair && (year === undefined || yearOf(r.day) === year));
  return all[all.length - 1];
}

/** The campaign's scripted fairs (Brock's stake, Tilly's duel). Sandbox and Endless Summer play open fairs instead. */
export const storyFairs = (s: GameState) => s.settings.mode === 'campaign' && !isEndless(s);

function contestants(s: GameState, fair: FairId, district: DistrictId): { vs: Contestant[]; stake?: Stake } {
  const campaign = storyFairs(s);
  const year = yearOf(s.day);
  // Act 1: Brock stakes his Strawberry page against one of Lottie's pies.
  if (campaign && fair === 'summerFair' && year === 1 && s.rivals.blenders.alive) return { vs: ['blenders'], stake: 'strawberry' };
  // The Act 4 edition (Days 71-77 on target pacing), and each County Fair after it until she's won over: out-brew Tilly.
  if (campaign && fair === 'countyFair' && actOf(s) >= TILLY_FAIR_ACT && s.rivals.hollis.alive && !s.world?.tillyWon) return { vs: ['hollis'], stake: 'tilly' };
  const vs = RIVALS.filter((id) => s.rivals[id]?.alive && PLOTS.some((p) => p.district === district && s.plots[p.id].owner === id && s.plots[p.id].stand && !s.plots[p.id].stand!.wrecked));
  return { vs: vs.length ? vs : ['local'] };
}

function pickJudges(s: GameState, rng: { seed: number }, fair: FairId, district: DistrictId): Judge[] {
  const owned = ownedRecipes(s);
  const crowd = FESTIVALS[fair].crowd;
  const segs = [...new Set([...(crowd ? [crowd] : []), ...(Object.keys(DISTRICT_BY_ID[district].mix) as SegmentId[])])]
    .filter((seg) => SEGMENTS[seg].favorites.some((r) => owned.includes(r))); // always a hint you can answer
  const pickOne = <T>(list: T[]) => list[Math.floor(nextRandom(rng) * list.length)];
  return [
    { kind: 'recipe', segment: pickOne(segs.length ? segs : ['families']) },
    { kind: 'sweet', want: pickOne(SWEET) },
    { kind: 'price', band: pickOne(PRICE_BANDS) },
  ];
}

/** At dawn on a fair's last day: three judges, their hints and who enters against you. */
export function setupTasteOff(s: GameState): void {
  const w = worldOf(s);
  const fair = FAIRS.find((id) => runsOn(id, s.day) && seasonDay(s.day) === FESTIVALS[id].to);
  if (!fair || w.tasteOff?.day === s.day || w.fairs.some((r) => r.day === s.day)) return;
  const district = FESTIVALS[fair].district;
  const { vs, stake } = contestants(s, fair, district);
  const rng = { seed: s.seed };
  const judges = stake === 'strawberry' ? ACT1_JUDGES.map((j) => ({ ...j })) : pickJudges(s, rng, fair, district);
  s.seed = rng.seed;
  w.tasteOff = { fair, day: s.day, district, judges, vs, ...(stake ? { stake } : {}), entry: {} };
}

/** What you'll enter: whatever you've set at the fair, else the selected stand's card, Sweetness and price. */
export function entryOf(s: GameState): Required<TasteOffEntry> {
  const e = tasteOffToday(s)?.entry ?? {};
  const st = selectedStand(s);
  const recipe = e.recipe && ownsRecipe(s, e.recipe) ? e.recipe : ownsRecipe(s, st.recipe) ? st.recipe : 'classic';
  return { recipe, sweetness: e.sweetness ?? st.sweetness, price: e.price ?? st.price };
}

/** Change today's entry: a card from the book, a Sweetness setting, or the price by a nudge. */
export function setTasteOffEntry(s: GameState, change: { recipe?: RecipeId; sweetness?: Sweetness; delta?: number }): boolean {
  const t = tasteOffToday(s);
  if (!t || s.phase === 'report') return false;
  if (change.recipe && !ownsRecipe(s, change.recipe)) return false;
  const now = entryOf(s);
  if (change.recipe) t.entry.recipe = change.recipe;
  if (change.sweetness) t.entry.sweetness = change.sweetness;
  if (change.delta) t.entry.price = clamp(round2(now.price + change.delta), 0.05, 20);
  return true;
}

/** The booth's top price: your best stand's top price × the card's price bonus × the district's tolerance. */
export function boothCeiling(s: GameState, recipe: RecipeId, district: DistrictId): number {
  const level = Math.max(1, ...playerStands(s).map((p) => s.plots[p.id].stand!.level));
  return STAND_LEVELS[level - 1].topPrice * (1 + RECIPES[recipe].priceBonus) * (PRICE_TOLERANCE[district] ?? 1) * blenderBar(s, recipe); // demand: the district tolerance table
}

/** 0 bargain, 1 fair, 2 worth a little extra, 3 over the top price. */
export function priceBand(price: number, ceiling: number): number {
  const i = TASTE_OFF.bands.findIndex((b) => price <= ceiling * b + 1e-9);
  return i < 0 ? 3 : i;
}

/** One judge's mark for an entry: the demand model in miniature. */
export function judgeMark(j: Judge, e: Required<TasteOffEntry>, ceiling: number): number {
  const byGap = (gap: number) => (gap === 0 ? TASTE_OFF.hit : gap === 1 ? TASTE_OFF.near : TASTE_OFF.miss);
  if (j.kind === 'recipe') return SEGMENTS[j.segment].favorites.includes(e.recipe) ? TASTE_OFF.recipeHit : TASTE_OFF.near;
  if (j.kind === 'sweet') return byGap(Math.abs(SWEET.indexOf(j.want) - SWEET.indexOf(e.sweetness)));
  const band = priceBand(e.price, ceiling);
  return band === 3 ? TASTE_OFF.miss : byGap(Math.abs(band - PRICE_BANDS.indexOf(j.band)));
}

const score = (marks: number[]) => Math.round(marks.reduce((a, b) => a * b, 1) * 10000) / 10000;

/** Rivals' tongues are rolled per judge: a hit, near it, or a miss. */
function rivalScore(rng: { seed: number }, c: Contestant, judges: Judge[]): number {
  const p = TASTE_OFF_SKILL[c];
  return score(judges.map((j) => {
    const r = nextRandom(rng);
    return r < p ? (j.kind === 'recipe' ? TASTE_OFF.recipeHit : TASTE_OFF.hit) : r < p + (1 - p) * TASTE_OFF.nearShare ? TASTE_OFF.near : TASTE_OFF.miss;
  }));
}

/** Sandbox and Endless: a missing page a fair win brings home: Strawberry, or one whose holder isn't on the map (the harp teacher's Lavender). */
export function fairWinPage(s: GameState, id: RecipeId): boolean {
  const h = pageHolder(s, id);
  return !!h && !storyFairs(s) && (id === 'strawberry' || h === 'harpTeacher' || !(h in s.rivals));
}

/** One page per fair win, Strawberry first. */
function fairPage(s: GameState): void {
  const id = RECIPE_IDS.find((x) => fairWinPage(s, x));
  if (id) grantPage(s, id);
}

/** At closing on a fair's last day: the judges taste, the winner takes the star, the traffic and the prize. */
function judgeTasteOff(s: GameState, t: TasteOff): TasteOffResult {
  const w = worldOf(s);
  const entry = entryOf(s);
  const marks = t.judges.map((j) => judgeMark(j, entry, boothCeiling(s, entry.recipe, t.district)));
  const mine = score(marks);
  const rng = { seed: s.seed };
  let best = 0, top: Contestant | null = null;
  for (const c of t.vs) {
    const sc = rivalScore(rng, c, t.judges);
    if (sc > best) { best = sc; top = c; }
  }
  s.seed = rng.seed;
  const winner: 'player' | Contestant = top && best > mine ? top : 'player'; // ties go to the newcomer
  const result: TasteOffResult = { fair: t.fair, day: s.day, district: t.district, winner, vs: t.vs, ...(t.stake ? { stake: t.stake } : {}), score: mine, best, marks, entry };
  w.fairs.push(result);
  delete w.tasteOff;
  const fair = FESTIVALS[t.fair].name;
  if (winner !== 'local') w.boosts.push({ owner: winner, district: t.district, from: s.day + 1, to: s.day + TASTE_OFF.days });
  if (winner === 'player') {
    s.reputation = clamp(round2(s.reputation + TASTE_OFF.stars), 1, 5);
    s.today.reputationAfter = s.reputation;
    book(s, 'prizes', TASTE_OFF.prize); // fair prizes
    s.news.push(`TASTE-OFF! Lottie's Lemonade wins the ${fair}: +${TASTE_OFF.stars} star and a $${TASTE_OFF.prize} prize!`);
  } else if (winner === 'local') {
    s.news.push(`TASTE-OFF: Dot's Diner wins the ${fair}. The locals cheer.`);
  } else {
    addRivalStars(s, winner, TASTE_OFF.stars);
    s.rivals[winner].cash = round2(s.rivals[winner].cash + TASTE_OFF.prize);
    s.news.push(`TASTE-OFF: ${FACTIONS[winner].name} win the ${fair}.`);
  }
  if (t.stake === 'strawberry') {
    if (winner === 'player') grantPage(s, 'strawberry'); // Act 1's climax scene: Brock swears revenge on 101.5 (recipes.ts)
    else s.news.push('Brock keeps the Strawberry page at the Blend Shack. "Undefeated, bro!"');
  } else if (t.stake === 'tilly') {
    s.news.push(winner === 'player' ? 'Tilly tips her hat: "You out-brewed me, sugar. Come buy a Field at a friendly price."' : 'Tilly takes the County Fair: "Come back next year, sugar."');
  } else if (winner === 'player' && !storyFairs(s)) fairPage(s);
  // Tilly is won over by the Act 4 duel; outside the campaign's story, by beating her at any County Fair.
  if (winner === 'player' && t.fair === 'countyFair' && t.vs.includes('hollis') && (t.stake === 'tilly' || !storyFairs(s))) w.tillyWon = true;
  return result;
}

// ---------- Tilly and the County Fair ----------

export const tillyDuelHeld = (s: GameState) => !!s.world?.fairs.some((r) => r.stake === 'tilly');

/** Won over at the County Fair, Tilly sells her Fields at 1.5× land value instead of 2.5×. */
export function tillyFieldRate(s: GameState, plotId: string): number | undefined {
  return s.world?.tillyWon && s.plots[plotId].owner === 'hollis' && PLOT_BY_ID[plotId].type === 'field' ? TILLY_FIELD_BUYOUT : undefined;
}

/** Campaign: until the Act 4 County Fair has run its Taste-Off, Tilly neither sells out nor falls to an assault. */
export function tillyWaits(s: GameState, id: RivalId, what: 'buyout' | 'assault'): Blocker | null {
  if (id !== 'hollis' || !TILLY_WAITS_FOR_FAIR || !storyFairs(s) || !s.rivals.hollis.alive) return null;
  if (tillyDuelHeld(s) || s.day > festivalDays('countyFair', TILLY_FAIR_YEAR).to) return null;
  return { ok: false, why: what === 'buyout' ? "Tilly won't talk business until the County Fair" : "Tilly won't budge until the County Fair" };
}

// ---------- the two hooks ----------

/** Dawn: boosts and sponsorships run out; pages home overnight make this Bugle; on a fair's last day the Taste-Off is set
 * up; then the random events have their morning (events.ts). */
export function worldAtDawn(s: GameState): void {
  const w = worldOf(s);
  w.boosts = w.boosts.filter((b) => b.to >= s.day);
  w.sponsored = w.sponsored.filter((x) => x.to >= s.day);
  if (w.tasteOff && w.tasteOff.day < s.day) delete w.tasteOff;
  pagesAtDawn(s);
  setupTasteOff(s);
  mediaAtDawn(s);
  eventsAtDawn(s);
}

/** Closing: judge today's Taste-Off (it makes its own story in the Bugle); then the newsroom marks the day's news, so the
 * events' evening (the Food Critic's verdict) makes tomorrow's wire. */
export function worldAtClose(s: GameState): void {
  const t = tasteOffToday(s);
  if (t) judgeTasteOff(s, t);
  mediaAtClose(s);
  eventsAtClose(s);
}
