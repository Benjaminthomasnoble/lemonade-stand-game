import { afterEach, describe, expect, it } from 'vitest';
import {
  BRAND_TIERS, eventsOf, FORECAST_ACCURACY, forecastAhead, forecastDays, HEAT_WAVE, inBand, lookAhead, migrateSave, migrateWeather, neighbors, newGame,
  oneStep, openStands, rollDay, SEASON_TEMP_SHIFT, SEASON_WEATHER, seasonOf, SEASONS, sleepUntilDawn, TEMP_BANDS, WEATHER, WEATHER_STEPS, weatherAtOpen,
  type GameState, type Season, type Weather, type WeatherKind,
} from './economy.ts';
import { nextRandom } from './rng.ts';

const chance = { ...HEAT_WAVE.chance };
afterEach(() => { Object.assign(HEAT_WAVE.chance, chance); });

/** A new game with Heat Waves off: they force and thin Scorchers on top of the queue (events.ts), and these tests read the queue itself. */
function calmGame(seed: number): GameState {
  for (const k of SEASONS) HEAT_WAVE.chance[k] = 0;
  return newGame(seed);
}

/** The next dawn, through the real night (these tests skip the business days). */
function dawn(s: GameState): void {
  s.cash = Math.max(s.cash, 1000);
  s.phase = 'report';
  s.raids = [];
  if (!sleepUntilDawn(s)) throw new Error(`no dawn after Day ${s.day}`);
}

const steps = (a: WeatherKind, b: WeatherKind) => Math.abs(WEATHER_STEPS.indexOf(a) - WEATHER_STEPS.indexOf(b));
const firstDay = (season: Season) => Array.from({ length: 60 }, (_, i) => i + 1).find((d) => seasonOf(d) === season)!;
/** Seeds whose first draw keeps a forecast (a hit) or misses it. */
const HIT = Array.from({ length: 100 }, (_, k) => k).find((k) => nextRandom({ seed: k }) < FORECAST_ACCURACY)!;
const MISS = Array.from({ length: 100 }, (_, k) => k).find((k) => nextRandom({ seed: k }) >= FORECAST_ACCURACY)!;

describe('the dawn forecast', () => {
  it('rolls the day from its season\'s odds, then reads the forecast off it: right 80% of the time, else one step to a kind the season has', () => {
    const s = calmGame(1);
    const n = 20000;
    for (const season of SEASONS) {
      const rng = { seed: 4242 };
      const kinds: Partial<Record<WeatherKind, number>> = {};
      let right = 0, far = 0, absent = 0;
      for (let i = 0; i < n; i++) {
        const d = rollDay(s, rng, firstDay(season));
        kinds[d.weather.kind] = (kinds[d.weather.kind] ?? 0) + 1;
        if (d.forecast.kind === d.weather.kind) right++;
        else if (steps(d.forecast.kind, d.weather.kind) !== 1) far++;
        if (!SEASON_WEATHER[season][d.forecast.kind]) absent++;
      }
      expect(Math.abs(right / n - FORECAST_ACCURACY)).toBeLessThan(0.01);
      expect(far).toBe(0); // a miss is exactly one step off: never Storm for Hot
      expect(absent).toBe(0); // and never a kind the season doesn't have (no Scorcher in Winter)
      for (const [k, p] of Object.entries(SEASON_WEATHER[season])) expect(Math.abs((kinds[k as WeatherKind] ?? 0) / n - p)).toBeLessThan(0.012); // Appendix A's odds hold
    }
  });

  it('misses Hot as Warm or Scorcher by the season\'s odds, Scorcher only as Hot and Storm only as Rainy; Winter has no Scorcher', () => {
    const misses = (season: Season, w: Weather, n = 6000) => {
      const rng = { seed: 77 };
      const out: Partial<Record<WeatherKind, number>> = {};
      for (let i = 0; i < n; i++) { const f = oneStep(rng, w, season); if (f.kind !== w.kind) out[f.kind] = (out[f.kind] ?? 0) + 1; }
      return out;
    };
    const hot = misses('summer', { kind: 'hot', temp: 90 });
    expect(Object.keys(hot).sort()).toEqual(['scorcher', 'warm']);
    expect(hot.warm! / hot.scorcher!).toBeGreaterThan(1.6); // Warm 30% against Scorcher 15%: about twice as often
    expect(hot.warm! / hot.scorcher!).toBeLessThan(2.5);
    expect(Object.keys(misses('winter', { kind: 'hot', temp: 90 }))).toEqual(['warm']);
    expect(neighbors('hot', 'winter')).toEqual(['warm']);
    expect(Object.keys(misses('summer', { kind: 'scorcher', temp: 99 }))).toEqual(['hot']);
    expect(Object.keys(misses('fall', { kind: 'storm', temp: 52 }))).toEqual(['rainy']);
    expect(neighbors('cloudy', 'spring')).toEqual(['warm', 'rainy']);
  });

  it('keeps a hit\'s temperature within 2°F, and rolls a miss\'s from its own kind\'s range', () => {
    const rng = { seed: 5 };
    const w: Weather = { kind: 'warm', temp: 78 };
    for (let i = 0; i < 3000; i++) {
      const f = oneStep(rng, w, 'summer');
      if (f.kind === 'warm') expect(Math.abs(f.temp - 78)).toBeLessThanOrEqual(2);
      else {
        expect(['hot', 'cloudy']).toContain(f.kind);
        const [lo, hi] = WEATHER[f.kind].temp;
        expect(f.temp).toBeGreaterThanOrEqual(lo);
        expect(f.temp).toBeLessThanOrEqual(hi);
      }
    }
  });
});

describe('temperature bands', () => {
  it('Scorcher 95°F and up, Hot 85-94°F and Warm 72-84°F in every season, forecasts too; the cool seasons shift Cloudy, Rainy and Storm down', () => {
    expect(TEMP_BANDS).toEqual({ scorcher: [95, Infinity], hot: [85, 94], warm: [72, 84] });
    const s = calmGame(2);
    for (const season of SEASONS) {
      const rng = { seed: 99 };
      const seen: Partial<Record<WeatherKind, [number, number]>> = {};
      for (let i = 0; i < 6000; i++) {
        const d = rollDay(s, rng, firstDay(season));
        for (const w of [d.weather, d.forecast]) {
          const band = TEMP_BANDS[w.kind];
          if (band) {
            expect(w.temp).toBeGreaterThanOrEqual(band[0]);
            expect(w.temp).toBeLessThanOrEqual(band[1]);
          }
        }
        const t = (seen[d.weather.kind] ??= [Infinity, -Infinity]);
        t[0] = Math.min(t[0], d.weather.temp);
        t[1] = Math.max(t[1], d.weather.temp);
      }
      for (const k of ['cloudy', 'rainy', 'storm'] as WeatherKind[]) {
        if (!seen[k]) continue;
        const [lo, hi] = WEATHER[k].temp;
        expect(seen[k]![0]).toBeGreaterThanOrEqual(lo + SEASON_TEMP_SHIFT[season]);
        expect(seen[k]![1]).toBeLessThanOrEqual(hi + SEASON_TEMP_SHIFT[season]);
      }
      if (seen.hot) expect(seen.hot[0]).toBe(85); // a Winter Hot day is still 85°F or more
    }
    expect(inBand('hot', 96)).toBe(94);
    expect(inBand('warm', 70)).toBe(72);
    expect(inBand('cloudy', 80)).toBe(80);
  });
});

describe('the weather queue', () => {
  it('Day 1 runs off its forecast; from the first dawn it holds today and the next 2 days, and each dawn shifts it and rolls one more', () => {
    const s = calmGame(5);
    expect(s.weatherQueue).toEqual([]);
    expect(forecastDays(s)).toEqual([]);
    openStands(s);
    expect(steps(s.weather.kind, s.forecast.kind)).toBeLessThanOrEqual(1);
    dawn(s);
    expect(s.weatherQueue!.map((d) => d.day)).toEqual([2, 3, 4]);
    expect(s.forecast).toEqual(s.weatherQueue![0].forecast);
    const [, d3, d4] = s.weatherQueue!;
    dawn(s);
    expect(s.weatherQueue!.map((d) => d.day)).toEqual([3, 4, 5]);
    expect(s.weatherQueue!.slice(0, 2)).toEqual([d3, d4]); // the days as they were rolled
    expect(s.forecast).toEqual(d3.forecast);
  });

  it('the open brings the day as rolled while its forecast stands, drawing nothing; a forecast changed since dawn is followed by the same rule', () => {
    const s = calmGame(8);
    dawn(s);
    const today = s.weatherQueue![0];
    const rng = { seed: s.seed };
    expect(weatherAtOpen(s, rng)).toEqual(today.weather);
    expect(rng.seed).toBe(s.seed);
    openStands(s);
    expect(s.weather).toEqual(today.weather);
    const t = calmGame(8);
    dawn(t);
    t.forecast = { kind: 'storm', temp: 60 }; // a forecast changed since dawn (a test's, or an event's)
    expect(weatherAtOpen(t, { seed: HIT }).kind).toBe('storm');
    expect(weatherAtOpen(t, { seed: MISS }).kind).toBe('rainy'); // a Storm's only neighbor
  });

  it('the 2-day look-ahead is the forecasts those days wake to, on the Bugle once you own the Radio Jingle (M3)', () => {
    const s = calmGame(13);
    dawn(s);
    expect(lookAhead(s)).toEqual([]);
    s.brandTier = BRAND_TIERS[2].tier;
    for (let i = 0; i < 20; i++) {
      const ahead = forecastDays(s);
      expect(ahead.map((a) => a.day)).toEqual([s.day + 1, s.day + 2]);
      expect(lookAhead(s).map((a) => a.weather)).toEqual(ahead.map((a) => a.forecast));
      const [tomorrow, after] = ahead;
      dawn(s);
      expect(s.forecast).toEqual(tomorrow.forecast);
      expect(forecastAhead(s, after.day)).toEqual(after.forecast); // no revisions as the day nears
    }
  });

  it('a Heat Wave planned for a coming day shows its Scorcher, and the days rolled after it are Scorchers, forecast as such', () => {
    const s = calmGame(21);
    dawn(s);
    const wave = { id: 'heatWave', from: s.day + 2, to: s.day + 4 };
    eventsOf(s).on.push(wave);
    expect(forecastAhead(s, wave.from)!.kind).toBe('scorcher');
    dawn(s);
    for (const d of s.weatherQueue!.filter((x) => x.day > wave.from && x.day <= wave.to)) {
      expect(d.weather.kind).toBe('scorcher');
      expect(d.forecast.kind).toBe('scorcher');
    }
    dawn(s);
    expect(s.day).toBe(wave.from);
    expect(s.forecast.kind).toBe('scorcher');
  });

  it('rides in the save; a save from before it plays on and gets one at its next dawn; a load draws nothing', () => {
    const s = calmGame(34);
    dawn(s);
    const m = migrateSave(JSON.parse(JSON.stringify(s)))!;
    expect(m.weatherQueue).toEqual(s.weatherQueue);
    expect(m.seed).toBe(s.seed);
    const old = JSON.parse(JSON.stringify(s));
    delete old.weatherQueue;
    const o = migrateSave(old)!;
    expect(o.weatherQueue).toEqual([]);
    expect(o.seed).toBe(s.seed);
    openStands(o);
    expect(steps(o.weather.kind, o.forecast.kind)).toBeLessThanOrEqual(1); // off its forecast, as a new game's Day 1
    dawn(o);
    expect(o.weatherQueue!.map((d) => d.day)).toEqual([o.day, o.day + 1, o.day + 2]);
    // An odd entry is dropped with everything after it (rolled again at the next dawn), and a day gone by drops off.
    const odd = JSON.parse(JSON.stringify(s)) as GameState;
    (odd.weatherQueue![1].weather as unknown as { kind: string }).kind = 'snow';
    migrateWeather(odd);
    expect(odd.weatherQueue).toEqual(s.weatherQueue!.slice(0, 1));
    const later = JSON.parse(JSON.stringify(s)) as GameState;
    later.day += 1;
    migrateWeather(later);
    expect(later.weatherQueue).toEqual(s.weatherQueue!.slice(1));
  });
});
