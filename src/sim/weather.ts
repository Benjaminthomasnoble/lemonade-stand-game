// Weather and the dawn forecast (spec: Weather and seasons; Appendix A's season odds). Each day's real weather is
// rolled from its season's odds two days ahead, and its forecast is read off it: right 80% of the time, otherwise one
// step off on the scale Scorcher, Hot, Warm, Cloudy, Rainy, Storm (Warm for Hot, never Storm for Hot), toward a
// neighbor the season has, picked by the season's odds. Rolling the real weather first keeps the season's odds true.
// The queue holds today and the next 2 days, so the Radio Jingle's (M3) look-ahead reads the forecasts those days
// will wake to; a day that isn't on it (Day 1) follows its forecast by the same rule. Scorcher, Hot and Warm keep
// their temperature bands in every season; the cool seasons shift Cloudy, Rainy and Storm down. economy.ts calls in
// at a new game, each dawn and the open; events.ts's Heat Wave lays its Scorchers on top (plannedWeather, and its
// dawn and open hooks), and the other Scorchers are thinned as their days are rolled (scorcherKeep). Pure and seeded.
import {
  FORECAST_ACCURACY, LOOK_AHEAD_DAYS, SEASON_TEMP_SHIFT, SEASON_WEATHER, TEMP_BANDS, WEATHER, WEATHER_STEPS, type Season, type WeatherKind,
} from './balance.ts';
import { nextRandom, randomRange, type Rng } from './rng.ts';
import type { GameState, Weather } from './economy.ts';
import { seasonOf } from './economy.ts';
import { plannedWeather, scorcherKeep } from './events.ts';

/** One day's weather, rolled ahead: what the day brings, and what its dawn forecast says. */
export interface DayWeather { day: number; weather: Weather; forecast: Weather }

function pickKind(rng: Rng, odds: Partial<Record<WeatherKind, number>>): WeatherKind {
  const entries = Object.entries(odds).filter(([, w]) => (w ?? 0) > 0) as [WeatherKind, number][];
  let r = nextRandom(rng) * entries.reduce((a, [, w]) => a + w, 0);
  for (const [k, w] of entries) { r -= w; if (r <= 0) return k; }
  return entries[entries.length - 1][0];
}

/** A temperature for the kind: a banded kind's own range in every season; Cloudy, Rainy and Storm run cooler off-season. */
export function rollTemp(rng: Rng, kind: WeatherKind, season: Season): number {
  const [lo, hi] = WEATHER[kind].temp;
  return Math.round(randomRange(rng, lo, hi)) + (TEMP_BANDS[kind] ? 0 : SEASON_TEMP_SHIFT[season]);
}

/** A temperature held inside its kind's band (a Hot day never reads 96°F); an unbanded kind's stays as it is. */
export function inBand(kind: WeatherKind, temp: number): number {
  const b = TEMP_BANDS[kind];
  return b ? Math.min(b[1], Math.max(b[0], temp)) : temp;
}

/** A day's weather from its season's odds. */
export function seasonWeather(rng: Rng, season: Season): Weather {
  const kind = pickKind(rng, SEASON_WEATHER[season]);
  return { kind, temp: rollTemp(rng, kind, season) };
}

/** The kinds one step from this one that the season has: Scorcher's only neighbor is Hot, Storm's is Rainy, and Winter has no Scorcher. */
export function neighbors(kind: WeatherKind, season: Season): WeatherKind[] {
  const i = WEATHER_STEPS.indexOf(kind);
  return [WEATHER_STEPS[i - 1], WEATHER_STEPS[i + 1]].filter((k): k is WeatherKind => !!k && (SEASON_WEATHER[season][k] ?? 0) > 0);
}

/** The same sky, ±2°F inside its band: a forecast that's right, or a day that matches its forecast. */
function near(rng: Rng, w: Weather): Weather {
  return { kind: w.kind, temp: inBand(w.kind, w.temp + Math.round(randomRange(rng, -2, 2))) };
}

/** One step off: a neighbor the season has, picked by its odds, at a temperature of its own. Null when there's none. */
function stepOff(rng: Rng, w: Weather, season: Season): Weather | null {
  const next = neighbors(w.kind, season);
  if (!next.length) return null;
  const kind = next.length === 1 ? next[0] : pickKind(rng, Object.fromEntries(next.map((k) => [k, SEASON_WEATHER[season][k]])));
  return { kind, temp: rollTemp(rng, kind, season) };
}

/** Right about `w` 80% of the time, otherwise one step off: a forecast read off a day, or a day that follows a forecast. */
export function oneStep(rng: Rng, w: Weather, season: Season): Weather {
  return nextRandom(rng) < FORECAST_ACCURACY ? near(rng, w) : stepOff(rng, w, season) ?? near(rng, w);
}

/**
 * A day rolled ahead. A Heat Wave planned for it is a Scorcher, forecast as one; any other day comes from its season's
 * odds, with its forecast read off it. The Heat Waves' Scorchers come on top of those odds, so any other Scorcher is
 * kept only so often (events.ts scorcherKeep), else it comes in Hot. It's thinned once, here, before its forecast is
 * read: the look-ahead, the dawn and the day itself then all read the same sky, and never two steps apart.
 */
export function rollDay(s: GameState, rng: Rng, day: number): DayWeather {
  const season = seasonOf(day);
  const planned = plannedWeather(s, day);
  if (planned) {
    const weather = { kind: planned.kind, temp: rollTemp(rng, planned.kind, season) };
    return { day, weather, forecast: near(rng, weather) };
  }
  let weather = seasonWeather(rng, season);
  const keep = scorcherKeep(season);
  if (weather.kind === 'scorcher' && keep < 1 && nextRandom(rng) >= keep) weather = { kind: 'hot', temp: inBand('hot', weather.temp - 10) };
  return { day, weather, forecast: oneStep(rng, weather, season) };
}

/**
 * The queue at today and the next 2 days: past days drop off and each missing day is rolled onto the end. It starts at
 * the first dawn (a new game's Day 1 runs off its forecast, as it always has) and at the first dawn after loading a save
 * from before it.
 */
export function fillWeather(s: GameState, rng: Rng): DayWeather[] {
  const q = (s.weatherQueue ?? []).filter((d) => d.day >= s.day);
  let next = q.length ? q[q.length - 1].day + 1 : s.day;
  while (next <= s.day + LOOK_AHEAD_DAYS) q.push(rollDay(s, rng, next++));
  s.weatherQueue = q;
  return q;
}

/** Dawn: today's forecast off the queue, with a new day rolled onto its end. */
export function forecastAtDawn(s: GameState, rng: Rng): Weather {
  const today = fillWeather(s, rng)[0];
  return { ...today.forecast };
}

const same = (a: Weather, b: Weather) => a.kind === b.kind && a.temp === b.temp;

/**
 * The open: the day's real weather. While the dawn forecast stands it is the day as rolled; when the day wasn't rolled
 * (Day 1, a save from before the queue) or something changed its forecast since (a Heat Wave's Scorcher), the day
 * follows the forecast by the same rule: right 80% of the time, otherwise one step off.
 */
export function weatherAtOpen(s: GameState, rng: Rng): Weather {
  const today = s.weatherQueue?.find((d) => d.day === s.day);
  if (today && same(today.forecast, s.forecast)) return { ...today.weather };
  return oneStep(rng, s.forecast, seasonOf(s.day));
}

/** A coming day's forecast as its dawn will read it, or null when it isn't rolled yet. A Heat Wave planned since it was
 * rolled shows its Scorcher. The Bugle's look-ahead and Cal's two-day read this (media.ts lookAhead). */
export function forecastAhead(s: GameState, day: number): Weather | null {
  const f = s.weatherQueue?.find((d) => d.day === day)?.forecast ?? null;
  const p = plannedWeather(s, day);
  return p && f?.kind !== p.kind ? p : f;
}

/** The next `n` days' forecasts (the Radio Jingle's 2-day look-ahead), the ones rolled so far. */
export function forecastDays(s: GameState, n = LOOK_AHEAD_DAYS): { day: number; forecast: Weather }[] {
  const out: { day: number; forecast: Weather }[] = [];
  for (let day = s.day + 1; day <= s.day + n; day++) {
    const forecast = forecastAhead(s, day);
    if (forecast) out.push({ day, forecast });
  }
  return out;
}

const okWeather = (w: unknown): w is Weather => {
  const x = w as Weather | null;
  return !!x && typeof x === 'object' && x.kind in WEATHER && typeof x.temp === 'number' && Number.isFinite(x.temp);
};

/**
 * A save's queue, checked: the days from today on, one after another, while the entries hold up. A save from before
 * the queue has none, and its next dawn rolls them (until then its day runs off its forecast). Draws nothing, so a
 * load plays on as the save would have.
 */
export function migrateWeather(s: GameState): void {
  const kept: DayWeather[] = [];
  for (const d of Array.isArray(s.weatherQueue) ? s.weatherQueue : []) {
    if (!d || typeof d.day !== 'number' || d.day < s.day) continue; // gone by
    if (d.day !== s.day + kept.length || !okWeather(d.weather) || !okWeather(d.forecast)) break; // a gap or an odd entry: rolled again from there
    kept.push(d);
  }
  s.weatherQueue = kept;
}
