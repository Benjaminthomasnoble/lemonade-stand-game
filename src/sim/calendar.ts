// The calendar (spec: Events and the living world): fairs and festivals on a
// 56-day year, festival crowds and Event Sponsorship. Pure functions over
// GameState, like the rest of the sim.
import { nextRandom } from './rng.ts';
import { FESTIVAL_CROWD_SHARE, FESTIVALS, RANKS, SEASON_DAYS, SEASONS, SPONSORSHIP, YEAR_DAYS, type FestivalId, type SegmentId } from './balance.ts';
import { DISTRICT_BY_ID, PLOT_BY_ID, PLOTS, type DistrictId, type FactionId } from './map.ts';
import type { Blocker, GameState, Stand } from './economy.ts';
import { playerStands, seasonDay, seasonOf } from './economy.ts';
import { worldOf } from './recipes.ts';

const round2 = (n: number) => Math.round(n * 100) / 100;
export const FESTIVAL_IDS = Object.keys(FESTIVALS) as FestivalId[];

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
/** The crowd an event fills a district with today (festivals now; random events add theirs). */
export function crowdAt(s: GameState, district: DistrictId): SegmentId | undefined {
  let crowds = dayCrowds.get(s.day);
  if (!crowds) {
    crowds = {};
    for (const id of festivalsOn(s.day)) { const f = FESTIVALS[id]; if (f.crowd) crowds[f.district] ??= f.crowd; }
    if (dayCrowds.size > 400) dayCrowds.clear();
    dayCrowds.set(s.day, crowds);
  }
  return crowds[district];
}

/** A passerby in a festival district is one of the festival crowd half the time. */
export function festivalCrowd(s: GameState, rng: { seed: number }, district: DistrictId): SegmentId | undefined {
  const crowd = crowdAt(s, district);
  return crowd && nextRandom(rng) < FESTIVAL_CROWD_SHARE ? crowd : undefined;
}

// ---------- traffic: sponsorships, added into the marketing number ----------

export interface Sponsorship { festival: FestivalId; district: DistrictId; from: number; to: number }

const standPlots = new WeakMap<Stand, string>();
function plotOfStand(s: GameState, st: Stand): string | undefined {
  const known = standPlots.get(st);
  if (known && s.plots[known]?.stand === st) return known;
  const p = PLOTS.find((q) => s.plots[q.id].stand === st);
  if (p) standPlots.set(st, p.id);
  return p?.id;
}

/** marketingMultiplier's one term: +50% for your stands in a sponsored festival's district. */
export function calendarTraffic(s: GameState, owner: FactionId, st?: Stand): number {
  const w = s.world;
  if (!st || !w || owner !== 'player' || !w.sponsored.length) return 0;
  const live = w.sponsored.filter((x) => x.from <= s.day && x.to >= s.day);
  if (!live.length) return 0;
  const plot = plotOfStand(s, st);
  if (!plot) return 0;
  const d = PLOT_BY_ID[plot].district;
  return live.some((x) => x.district === d) ? SPONSORSHIP.traffic : 0;
}

// ---------- Event Sponsorship ----------

/** $2,000 for each festival day left, today included. */
export function sponsorCost(s: GameState, id: FestivalId): number {
  return SPONSORSHIP.perDay * (festivalDays(id, yearOf(s.day)).to - s.day + 1);
}
export const isSponsored = (s: GameState, id: FestivalId) => !!s.world?.sponsored.some((x) => x.festival === id && x.to >= s.day);

export function canSponsor(s: GameState, id: FestivalId): Blocker {
  if (s.rank < SPONSORSHIP.rank) return { ok: false, why: `Needs Rank ${SPONSORSHIP.rank}, ${RANKS[SPONSORSHIP.rank - 1].title}` };
  if (!runsOn(id, s.day)) return { ok: false, why: 'Only while the festival runs' };
  if (isSponsored(s, id)) return { ok: false, why: 'Sponsored' };
  if (s.phase !== 'prep') return { ok: false, why: 'Sponsor during Morning Prep' };
  const d = FESTIVALS[id].district;
  if (!playerStands(s).some((p) => p.district === d)) return { ok: false, why: `No stand of yours in ${DISTRICT_BY_ID[d].name}` };
  const cost = sponsorCost(s, id);
  if (s.cash < cost) return { ok: false, why: `Needs $${cost.toLocaleString('en-US')}` };
  return { ok: true };
}

/** Sponsor a festival for the rest of its run, paid up front. */
export function sponsorFestival(s: GameState, id: FestivalId): boolean {
  if (!canSponsor(s, id).ok) return false;
  const cost = sponsorCost(s, id);
  const f = FESTIVALS[id];
  s.cash = round2(s.cash - cost);
  s.today.supplies = round2(s.today.supplies + cost); // ledger: marketing
  worldOf(s).sponsored.push({ festival: id, district: f.district, from: s.day, to: festivalDays(id, yearOf(s.day)).to });
  s.news.push(`Lottie's Lemonade sponsors the ${f.name}: +${Math.round(SPONSORSHIP.traffic * 100)}% traffic at your ${DISTRICT_BY_ID[f.district].name} stands!`);
  return true;
}

// ---------- the hook ----------

/** Dawn: sponsorships run out. */
export function worldAtDawn(s: GameState): void {
  const w = worldOf(s);
  w.sponsored = w.sponsored.filter((x) => x.to >= s.day);
}
