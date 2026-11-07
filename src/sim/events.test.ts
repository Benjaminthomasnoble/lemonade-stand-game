import { afterEach, describe, expect, it } from 'vitest';
import {
  CLOSE, EVENT_DEFS, EVENTS, eventsAtDawn, eventsOf, HEAT_WAVE, heatWaveDay, heatWaveOn, liveEvent, liveEvents, newGame, openStand,
  plannedWeather, registerEvent, scorcherKeep, SEASON_DAYS, SEASON_WEATHER, SEASONS, shineReason, sleepUntilDawn, tickMinute,
  type EventDef, type GameState, type Season,
} from './economy.ts';

/** Jump to a day's Morning Prep through the real dawn (with cash to spare: these tests skip the business days). */
function dawn(s: GameState, day: number): void {
  s.cash = Math.max(s.cash, 1000);
  s.day = day - 1;
  s.phase = 'report';
  s.raids = [];
  if (!sleepUntilDawn(s)) throw new Error(`no dawn on day ${day}`);
}

/** Every dawn from the current day up to a day. */
function dawnsTo(s: GameState, day: number): void {
  while (s.day < day) dawn(s, s.day + 1);
}

const added: string[] = [];
/** A test event in the pool for one test. */
function testEvent(def: Partial<EventDef> & { id: string }): EventDef {
  const d: EventDef = { name: def.id, kind: 'good', scope: 'bay', when: 'dawn', days: 1, counter: 'Play it', weight: 1, headline: () => `${def.id} today`, ...def };
  registerEvent(d);
  added.push(d.id);
  return d;
}
/** Only these events in the pool (the rest are set aside for the test). */
function only(...ids: string[]): void {
  for (const d of Object.values(EVENT_DEFS)) if (!ids.includes(d.id) && !d.plan) { saved.push({ ...d }); d.weight = 0; }
}
const saved: EventDef[] = [];
const chance = { ...HEAT_WAVE.chance };
afterEach(() => {
  for (const id of added.splice(0)) delete EVENT_DEFS[id];
  for (const d of saved.splice(0)) EVENT_DEFS[d.id] = d;
  Object.assign(HEAT_WAVE.chance, chance);
});

describe('the random events scheduler', () => {
  it('nothing before Day 6, then about one event every 5-7 days', () => {
    only('tick');
    testEvent({ id: 'tick', weight: 100 });
    const s = newGame(11);
    dawnsTo(s, 5);
    expect(eventsOf(s).on.filter((e) => e.id === 'tick')).toEqual([]);
    expect(eventsOf(s).next).toBeUndefined(); // the scheduler hasn't even looked yet
    const starts: number[] = [];
    while (s.day < 60) {
      dawn(s, s.day + 1);
      if (liveEvent(s, 'tick')?.from === s.day) starts.push(s.day);
    }
    expect(starts[0]).toBeGreaterThanOrEqual(EVENTS.firstDay);
    expect(starts[0]).toBeLessThanOrEqual(EVENTS.firstDay + EVENTS.firstSpread);
    for (let i = 1; i < starts.length; i++) {
      expect(starts[i] - starts[i - 1]).toBeGreaterThanOrEqual(EVENTS.gap[0]);
      expect(starts[i] - starts[i - 1]).toBeLessThanOrEqual(EVENTS.gap[1]);
    }
    expect(starts.length).toBeGreaterThanOrEqual(7);
  });

  it('registerEvent adds to the pool; the pick is seeded and saved with the run', () => {
    only('a', 'b');
    testEvent({ id: 'a', weight: 1 });
    testEvent({ id: 'b', weight: 1 });
    const run = () => { const s = newGame(5); dawnsTo(s, 30); return eventsOf(s).past.map((p) => `${p.id}@${p.from}`); };
    const one = run();
    expect(one.length).toBeGreaterThan(2);
    expect(run()).toEqual(one); // same seed, same events
    const s = newGame(5);
    dawnsTo(s, 12);
    const copy = JSON.parse(JSON.stringify(s)) as GameState;
    dawnsTo(s, 30);
    dawnsTo(copy, 30);
    expect(eventsOf(copy).past).toEqual(eventsOf(s).past); // a save carries the schedule
  });

  it('bad luck never stacks: one harmful event at a time, and none starts on a forecast Storm', () => {
    only('flu', 'mumps', 'fair');
    testEvent({ id: 'flu', kind: 'harmful', days: 6, weight: 5 });
    testEvent({ id: 'mumps', kind: 'harmful', days: 6, weight: 5 });
    testEvent({ id: 'fair', kind: 'good', days: 1, weight: 1 });
    const s = newGame(3);
    for (let d = 2; d <= 120; d++) {
      dawn(s, d);
      const harmful = liveEvents(s).filter((e) => EVENT_DEFS[e.id].kind === 'harmful');
      expect(harmful.length).toBeLessThanOrEqual(1);
      if (harmful[0]?.from === s.day) expect(s.forecast.kind).not.toBe('storm');
    }
    // A forecast Storm holds a harmful start back; the good one can still come.
    const t = newGame(4);
    dawnsTo(t, 8);
    const ev = eventsOf(t);
    ev.on = [];
    for (let i = 0; i < 20; i++) {
      ev.next = t.day;
      t.forecast = { kind: 'storm', temp: 60 };
      eventsAtDawn(t);
      expect(ev.on.some((e) => EVENT_DEFS[e.id]?.kind === 'harmful')).toBe(false);
    }
    expect(ev.on.some((e) => e.id === 'fair')).toBe(true);
  });

  it('a mid-day event breaks in at its minute, on 101.5 and in the news', () => {
    only('flash');
    testEvent({ id: 'flash', when: 'midday', weight: 1, headline: () => 'FLASH! Something happened' });
    const s = newGame(9);
    dawnsTo(s, 6);
    while (!eventsOf(s).on.some((e) => e.id === 'flash')) dawn(s, s.day + 1);
    const e = eventsOf(s).on.find((x) => x.id === 'flash')!;
    expect(e.live).toBeFalsy();
    expect(e.at).toBeGreaterThanOrEqual(EVENTS.midday[0]);
    expect(e.at).toBeLessThanOrEqual(EVENTS.midday[1]);
    expect(s.news.join('\n')).not.toContain('FLASH!'); // mid-day events don't use the Bugle
    openStand(s);
    while (s.minute < e.at!) tickMinute(s);
    expect(e.live).toBe(true);
    expect(s.news).toContain('FLASH! Something happened');
    expect(s.world!.breaks!.at(-1)).toEqual({ day: s.day, minute: e.at, text: 'FLASH! Something happened' });
    s.minute = CLOSE - 1;
    tickMinute(s);
  });
});

describe('the Heat Wave', () => {
  it('3 Scorchers in a row: the forecast and the weather, 95°F and up, announced with its counter-play', () => {
    HEAT_WAVE.chance.summer = 1;
    const s = newGame(21);
    dawn(s, 2);
    const wave = eventsOf(s).on.find((e) => e.id === 'heatWave')!;
    expect(wave.from).toBeGreaterThanOrEqual(6);
    expect(wave.to - wave.from + 1).toBe(3);
    expect(wave.to).toBeLessThanOrEqual(SEASON_DAYS);
    dawnsTo(s, wave.from - 2);
    expect(plannedWeather(s, wave.from)?.kind).toBe('scorcher'); // the Radio Jingle's look-ahead sees it coming
    expect(plannedWeather(s, wave.from - 1)).toBeNull();
    for (let d = wave.from; d <= wave.to; d++) {
      dawn(s, d);
      expect(s.forecast.kind).toBe('scorcher');
      expect(s.forecast.temp).toBeGreaterThanOrEqual(95);
      expect(heatWaveOn(s)).toBe(true);
      if (d === wave.from) expect(s.news.some((n) => n.startsWith('HEAT WAVE! 3 Scorchers') && n.includes('Extra ice, higher prices, Frozen'))).toBe(true);
      openStand(s);
      expect(s.weather.kind).toBe('scorcher'); // whatever the 80% roll says
    }
    dawn(s, wave.to + 1);
    expect(heatWaveOn(s)).toBe(false);
    expect(eventsOf(s).past[0]).toMatchObject({ id: 'heatWave', from: wave.from, to: wave.to });
  });

  it('Frozen Lemonade shines in a Heat Wave, even out of Summer', () => {
    HEAT_WAVE.chance.fall = 1;
    const s = newGame(22);
    dawn(s, 15); // Fall's first dawn plans its wave
    const wave = eventsOf(s).on.find((e) => e.id === 'heatWave' && e.from >= 15)!;
    expect(wave.from).toBeLessThanOrEqual(15 + HEAT_WAVE.window.fall[1] - 1);
    expect(shineReason(s, 'campus', 'frozen')).toBeNull();
    dawn(s, wave.from);
    expect(shineReason(s, 'campus', 'frozen')).toBe('heatWave');
  });

  it('mostly Summer, sometimes early Fall or late Spring, never Winter', () => {
    expect(HEAT_WAVE.chance.winter).toBe(0);
    expect(HEAT_WAVE.chance.summer).toBeGreaterThan(HEAT_WAVE.chance.fall + HEAT_WAVE.chance.spring);
    HEAT_WAVE.chance.winter = 0;
    const s = newGame(23);
    for (let d = 29; d <= 42; d++) { dawn(s, d); expect(heatWaveDay(s)).toBe(false); }
  });

  it("keeps the weather table's Scorcher odds on average", () => {
    for (const season of SEASONS as Season[]) {
      const p = SEASON_WEATHER[season].scorcher ?? 0, q = HEAT_WAVE.chance[season], n = SEASON_DAYS, k = HEAT_WAVE.days;
      expect(k * q + (n - k * q) * p * scorcherKeep(season)).toBeCloseTo(n * p, 6);
    }
    // At dawn, a Scorcher outside a wave is kept at that rate (the rest turn Hot).
    const s = newGame(24);
    dawnsTo(s, 3);
    eventsOf(s).on = [];
    let kept = 0;
    for (let i = 0; i < 3000; i++) {
      s.forecast = { kind: 'scorcher', temp: 99 };
      eventsAtDawn(s);
      if (s.forecast.kind === 'scorcher') kept++;
      else expect(s.forecast).toEqual({ kind: 'hot', temp: 89 });
      eventsOf(s).on = [];
    }
    expect(kept / 3000).toBeCloseTo(scorcherKeep('summer'), 1);
  });
});
