// Random events (spec: Events and the living world, Random events): a seeded scheduler saved with the run. Events
// start at dawn, printed in the Bugle with their district and length, or break in mid-day on 101.5 The Squeeze as a
// card in the feed. Every card names its counter-play. Bad luck never stacks: one harmful event at a time, none
// before Day 6, and none starts on a forecast Storm (a Storm is weather, not an event). The Heat Wave is planned
// ahead each season, so the Radio Jingle's look-ahead sees it coming. Other lanes add theirs with registerEvent
// (land's Hurricane and Health Inspection). Pure and seeded, like the rest of the sim.
import { nextRandom } from './rng.ts';
import { EVENTS, HEAT_WAVE, SEASON_DAYS, SEASON_WEATHER, SEASONS, WEATHER, type Season, type SegmentId, type SupplyId } from './balance.ts';
import type { DistrictId } from './map.ts';
import type { GameState, Weather } from './economy.ts';
import { seasonDay, seasonOf } from './economy.ts';
import { worldOf } from './recipes.ts';
import { yearOf } from './calendar.ts';

type Rng = { seed: number };

export type EventScope = 'bay' | 'district' | 'street' | 'stand';
/** harmful: counts toward the one-at-a-time rule; good: an opportunity; mixed: could go either way (the Food Critic). */
export type EventKind = 'harmful' | 'good' | 'mixed';

/** An event on the calendar: coming (planned ahead, or breaking in later today), or running. */
export interface WorldEvent {
  id: string; // its EventDef
  from: number; // the days it runs, both included
  to: number;
  at?: number; // a mid-day event: the minute it breaks in on its first day
  live?: boolean; // it has started (a dawn event at its first dawn, a mid-day one at its minute)
  district?: DistrictId; // where: the district, the street's district, or the named stand's
  plots?: string[]; // a street's plots, or the one named stand
  kids?: string[]; // Kids' Lemonade Day: the plots with a kid stand on the sidewalk beside them
  raided?: string[]; // ... the kid stands raided
  took?: number; // ... and the walkers past your stands who went to a kid stand instead
  low?: number; // Captain Squawk: the fewest lemons the stand has held since the theft (restocked once it holds more; -1 after)
  stolen?: number; // ... and how many he took
  verdict?: number; // the Food Critic's star change, once given at closing
}

/** Where an event lands. */
export type Placement = Pick<WorldEvent, 'district' | 'plots' | 'kids'>;

export interface EventDef {
  id: string;
  name: string;
  kind: EventKind;
  scope: EventScope;
  when: 'dawn' | 'midday';
  days: number;
  counter: string; // the spec's "How to play it": every card names it
  weight: number; // its odds against the rest when the scheduler rolls (0: never rolled)
  seasons?: Season[]; // the seasons it can roll in (default: any)
  fromDay?: number; // never before this day (a Hurricane is late game)
  lead?: number; // on the calendar this many days before its first day (a Hurricane, forecast 2 days ahead)
  /** Planned instead of rolled: at each season's first dawn, the day it starts this season, or null. */
  plan?(s: GameState, rng: Rng, season: Season): number | null;
  can?(s: GameState): boolean; // could it happen today at all?
  place?(s: GameState, rng: Rng): Placement | null; // where it lands (null: nowhere fits today)
  start?(s: GameState, e: WorldEvent): boolean | void; // as it starts; false calls it off (its stand is gone, say)
  dawn?(s: GameState, e: WorldEvent): void; // each morning it runs, its first included (after the forecast and market roll)
  tick?(s: GameState, e: WorldEvent): void; // each business-hours minute it runs
  close?(s: GameState, e: WorldEvent): void; // at closing, each day it runs
  end?(s: GameState, e: WorldEvent): void; // the dawn after its last day
  over?(s: GameState, e: WorldEvent): boolean; // done early? (Captain Squawk: once the stand is restocked)
  headline(s: GameState, e: WorldEvent): string; // how it's announced: the Bugle at dawn, 101.5 mid-day
  bugle?(s: GameState, e: WorldEvent): [string, string]; // its front-page tapes (default: its name, where and how long)
  shock?: SupplyId; // the Market price it doubles (the Bugle prints the shock and its days left)
  traffic?(s: GameState, e: WorldEvent, plotId: string): number; // a surge on a stand's walkers, on top of marketing (1: none)
  crowd?: { segment: SegmentId; share: number }; // who fills its district, like a festival crowd (the Tourist Bus)
}

export interface EventsState {
  on: WorldEvent[]; // coming and running
  next?: number; // the day the scheduler rolls next
  planned?: number; // the last season (year × 4 + season) whose planned events were planned
  past: { id: string; from: number; to: number; district?: DistrictId }[]; // newest first
}

export const EVENT_DEFS: Record<string, EventDef> = {};
/** Add an event to the pool. Land's Hurricane and Health Inspection register theirs the same way. */
export function registerEvent(def: EventDef): void {
  EVENT_DEFS[def.id] = def;
}

export function eventsOf(s: GameState): EventsState {
  return (worldOf(s).events ??= { on: [], past: [] });
}

const randInt = (rng: Rng, lo: number, hi: number) => lo + Math.floor(nextRandom(rng) * (hi - lo + 1));
export const eventDef = (e: WorldEvent): EventDef | undefined => EVENT_DEFS[e.id];
const runsOn = (e: WorldEvent, day: number) => e.from <= day && e.to >= day;

/** The events running today, in the order they came. */
export function liveEvents(s: GameState): WorldEvent[] {
  const on = s.world?.events?.on;
  return on?.length ? on.filter((e) => e.live && runsOn(e, s.day) && eventDef(e)) : [];
}
/** Today's running event of a kind, if one is on. Every walker asks (Kids' Day), so it walks the list without a closure. */
export function liveEvent(s: GameState, id: string): WorldEvent | undefined {
  const on = s.world?.events?.on;
  if (on) for (const e of on) if (e.id === id && e.live && runsOn(e, s.day)) return e;
  return undefined;
}
/** Days left of an event, today included. */
export const daysLeft = (s: GameState, e: WorldEvent) => e.to - Math.max(s.day, e.from) + 1;
/** The absolute first day of the season a day falls in. */
const seasonStart = (day: number) => day - seasonDay(day) + 1;

/** expectedPassersby's one factor: every running surge on this stand's walkers multiplied (Viral Video ×2, Roadworks ×0.5).
 * Runs for every stand every minute, so it walks the list without building one. */
export function eventTraffic(s: GameState, plotId: string): number {
  const on = s.world?.events?.on;
  if (!on?.length) return 1;
  let m = 1;
  for (const e of on) {
    const t = e.live && runsOn(e, s.day) ? EVENT_DEFS[e.id]?.traffic : undefined;
    if (t) m *= t(s, e, plotId);
  }
  return m;
}

/** The crowd a running event fills a district with (the Tourist Bus), ahead of any festival's. */
export function eventCrowd(s: GameState, district: DistrictId): { segment: SegmentId; share: number } | undefined {
  const on = s.world?.events?.on;
  if (!on?.length) return undefined;
  for (const e of on) {
    const c = e.district === district && e.live && runsOn(e, s.day) ? EVENT_DEFS[e.id]?.crowd : undefined;
    if (c) return c;
  }
  return undefined;
}

// ---------- the one-at-a-time rule ----------

/** One harmful event at a time: one running, or on its way, holds the next back. */
export const harmfulOn = (s: GameState) => !!s.world?.events?.on.some((e) => eventDef(e)?.kind === 'harmful');

// ---------- the scheduler ----------

/** Dawn (calendar's worldAtDawn, after the forecast and the market roll): events run out, the season's planned ones are
 * planned, the day's weather follows any Heat Wave, the scheduler rolls, today's dawn events start, and every running
 * event has its morning. */
export function eventsAtDawn(s: GameState): void {
  const ev = eventsOf(s);
  for (const e of [...ev.on]) if (e.live && (e.to < s.day || eventDef(e)?.over?.(s, e))) retire(s, e, s.day - 1);
  ev.on = ev.on.filter((e) => eventDef(e) && e.to >= s.day && (e.live || e.from >= s.day)); // a def gone, or a start missed
  const rng = { seed: s.seed };
  planSeason(s, ev, rng);
  weatherAtDawn(s, rng);
  roll(s, ev, rng);
  s.seed = rng.seed;
  for (const e of [...ev.on]) {
    if (!e.live && e.from === s.day && eventDef(e)!.when === 'dawn') begin(s, e);
    if (e.live && runsOn(e, s.day)) eventDef(e)!.dawn?.(s, e);
  }
}

/** tickMinute's one call (business hours, once the clock has moved): a mid-day event breaks in at its minute, and the
 * running ones have their minute. */
export function eventsOnTheClock(s: GameState): void {
  const on = s.world?.events?.on;
  if (!on?.length) return;
  for (const e of [...on]) {
    if (!e.live && e.at !== undefined && e.from === s.day && s.minute >= e.at) begin(s, e);
    else if (e.live && runsOn(e, s.day)) eventDef(e)?.tick?.(s, e);
  }
}

/** Closing (calendar's worldAtClose): each running event has its evening (the Food Critic's verdict). */
export function eventsAtClose(s: GameState): void {
  for (const e of liveEvents(s)) eventDef(e)!.close?.(s, e);
}

/** An event starts: placed if it isn't yet, announced (the Bugle's events, a toast, 101.5 for a mid-day one). */
function begin(s: GameState, e: WorldEvent): void {
  const d = eventDef(e)!;
  const ev = eventsOf(s);
  if (d.place && !e.district && !e.plots && !e.kids) {
    const rng = { seed: s.seed };
    const where = d.place(s, rng);
    s.seed = rng.seed;
    if (!where) { ev.on = ev.on.filter((x) => x !== e); return; }
    Object.assign(e, where);
  }
  e.live = true;
  if (d.start?.(s, e) === false) { ev.on = ev.on.filter((x) => x !== e); return; }
  const line = d.headline(s, e);
  s.news.push(line);
  if (d.when === 'midday') breakIn(s, line);
}

/** An event is over: its end hook runs and it goes in the record. */
export function retire(s: GameState, e: WorldEvent, last = s.day): void {
  const ev = eventsOf(s);
  ev.on = ev.on.filter((x) => x !== e);
  eventDef(e)?.end?.(s, e);
  ev.past.unshift({ id: e.id, from: e.from, to: Math.max(e.from, Math.min(e.to, last)), ...(e.district ? { district: e.district } : {}) });
  ev.past.length = Math.min(ev.past.length, 40);
}

function schedule(s: GameState, d: EventDef, where: Placement, from: number, rng: Rng): WorldEvent {
  const e: WorldEvent = { id: d.id, from, to: from + d.days - 1, ...where };
  if (d.when === 'midday') e.at = Math.round(randInt(rng, EVENTS.midday[0], EVENTS.midday[1]) / 5) * 5;
  eventsOf(s).on.push(e);
  return e;
}

/** About one event every 5–7 days from Day 6: a weighted pick of whatever can happen today. */
function roll(s: GameState, ev: EventsState, rng: Rng): void {
  if (s.day < EVENTS.firstDay) return;
  ev.next ??= s.day + randInt(rng, 0, EVENTS.firstSpread);
  if (s.day < ev.next) return;
  const season = seasonOf(s.day);
  const held = harmfulOn(s), storm = s.forecast.kind === 'storm';
  let pool = Object.values(EVENT_DEFS).filter((d) => d.weight > 0 && !d.plan && (!d.seasons || d.seasons.includes(season))
    && s.day >= (d.fromDay ?? 0) && !(d.kind === 'harmful' && (held || (storm && !d.lead)))
    && !ev.on.some((e) => e.id === d.id) && (d.can?.(s) ?? true));
  while (pool.length) {
    let r = nextRandom(rng) * pool.reduce((a, d) => a + d.weight, 0);
    let d = pool[pool.length - 1];
    for (const x of pool) { r -= x.weight; if (r <= 0) { d = x; break; } }
    const where = d.place ? d.place(s, rng) : {};
    if (where) {
      schedule(s, d, where, s.day + (d.lead ?? 0), rng);
      ev.next = s.day + randInt(rng, EVENTS.gap[0], EVENTS.gap[1]);
      return;
    }
    pool = pool.filter((x) => x !== d);
  }
  ev.next = s.day + 1; // nothing fits today: try again tomorrow
}

/** Each season's first dawn (or the first one seen in it): planned events pick their day. They're placed as they start. */
function planSeason(s: GameState, ev: EventsState, rng: Rng): void {
  const season = seasonOf(s.day);
  const key = yearOf(s.day) * 4 + SEASONS.indexOf(season);
  if (ev.planned === key) return;
  ev.planned = key;
  for (const d of Object.values(EVENT_DEFS)) {
    if (!d.plan || ev.on.some((e) => e.id === d.id)) continue;
    const day = d.plan(s, rng, season);
    if (day !== null) schedule(s, d, {}, day, rng);
  }
}

/** A planned day inside this season's window, never before Day 6 and never so soon the look-ahead misses it (and, given a
 * rule, only on a day it allows: Kids' Lemonade Day's weekday). */
export function planDay(s: GameState, rng: Rng, window: [number, number], days: number, allows?: (day: number) => boolean): number | null {
  const start = seasonStart(s.day);
  const first = Math.max(start + window[0] - 1, s.day + EVENTS.lookAhead, EVENTS.firstDay);
  const last = start + Math.min(window[1], SEASON_DAYS - days + 1) - 1;
  if (!allows) return first <= last ? randInt(rng, first, last) : null;
  const ok: number[] = [];
  for (let d = first; d <= last; d++) if (allows(d)) ok.push(d);
  return ok.length ? ok[randInt(rng, 0, ok.length - 1)] : null;
}

// ---------- the Heat Wave: the weather it brings, and the Scorchers it borrows ----------

/** Is a Heat Wave on (or planned) for a day? Today's makes Frozen Lemonade shine (recipes' heatWaveOn). */
export const heatWaveDay = (s: GameState, day = s.day) => !!s.world?.events?.on.some((e) => e.id === 'heatWave' && runsOn(e, day));

/** Each season's Scorchers outside a Heat Wave are kept this often, so the waves' 3-day runs leave the weather table's
 * Scorcher odds (15/3/0/2%) right on average: n·p = k·q + (n − k·q)·p·keep. */
export function scorcherKeep(season: Season): number {
  const p = SEASON_WEATHER[season].scorcher ?? 0, q = HEAT_WAVE.chance[season], n = SEASON_DAYS, k = HEAT_WAVE.days;
  if (!p || !q) return 1;
  return Math.min(1, Math.max(0, (n * p - k * q) / ((n - k * q) * p)));
}

const cooler = (w: Weather): Weather => ({ kind: 'hot', temp: Math.min(WEATHER.hot.temp[1], Math.max(WEATHER.hot.temp[0], w.temp - 10)) });

/** Dawn's forecast: a Heat Wave day is a Scorcher; any other Scorcher is thinned (scorcherKeep). */
function weatherAtDawn(s: GameState, rng: Rng): void {
  let w = s.forecast;
  if (heatWaveDay(s)) {
    if (w.kind !== 'scorcher') w = { kind: 'scorcher', temp: randInt(rng, WEATHER.scorcher.temp[0], WEATHER.scorcher.temp[1]) };
  } else if (w.kind === 'scorcher' && nextRandom(rng) >= scorcherKeep(seasonOf(s.day))) w = cooler(w);
  if (w === s.forecast) return;
  s.forecast = w;
  s.weather = w;
  s.today.weather = w;
}

/** openStands' one call, on the day's real weather: a Heat Wave day is a Scorcher whatever the roll, and a Scorcher the
 * forecast didn't call is thinned like the dawn's. */
export function eventWeather(s: GameState, w: Weather): Weather {
  if (heatWaveDay(s)) return w.kind === 'scorcher' ? w : { kind: 'scorcher', temp: s.forecast.kind === 'scorcher' ? s.forecast.temp : WEATHER.scorcher.temp[0] };
  if (w.kind !== 'scorcher' || s.forecast.kind === 'scorcher') return w;
  const rng = { seed: s.seed };
  const keep = nextRandom(rng) < scorcherKeep(seasonOf(s.day));
  s.seed = rng.seed;
  return keep ? w : cooler(w);
}

/** The look-ahead's seam (demand's forecastDays and the Radio Jingle's 2-day forecast): what a coming day is known to bring.
 * A planned Heat Wave day is a Scorcher; anything else is still the season's guess (null). */
export function plannedWeather(s: GameState, day: number): Weather | null {
  return heatWaveDay(s, day) ? { kind: 'scorcher', temp: Math.round((WEATHER.scorcher.temp[0] + WEATHER.scorcher.temp[1]) / 2) } : null;
}

registerEvent({
  id: 'heatWave', name: 'Heat Wave', kind: 'good', scope: 'bay', when: 'dawn', days: HEAT_WAVE.days,
  counter: 'Extra ice, higher prices, Frozen', weight: 0,
  plan: (s, rng, season) => (nextRandom(rng) < HEAT_WAVE.chance[season] ? planDay(s, rng, HEAT_WAVE.window[season], HEAT_WAVE.days) : null),
  headline: (_s, e) => `HEAT WAVE! ${e.to - e.from + 1} Scorchers in a row, all over the bay. Extra ice, higher prices, Frozen!`,
});

// ---------- 101.5 The Squeeze breaks in (media.ts reads these) ----------

/** A mid-day break-in for the radio: the line and the minute it aired. */
export interface BreakIn { day: number; minute: number; text: string }
function breakIn(s: GameState, text: string): void {
  const w = worldOf(s);
  (w.breaks ??= []).push({ day: s.day, minute: s.minute, text });
  w.breaks = w.breaks.filter((b) => b.day >= s.day - 1).slice(-8);
}
