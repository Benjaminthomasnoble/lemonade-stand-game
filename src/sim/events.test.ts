import { afterEach, describe, expect, it } from 'vitest';
import {
  appealFor, buySupply, CLOSE, costPerCup, criticChecks, criticVerdict, crowdAt, DISTRICT_BY_ID, EVENT_DEFS, EVENT_TRAFFIC, EVENTS, eventsAtDawn,
  eventsOf, eventTraffic, expectedCups, expectedPassersby, festivalCrowd, FOOD_CRITIC, HEAT_WAVE, heatWaveDay, heatWaveOn, liveEvent, liveEvents,
  LOTTIES_CORNER, mainSegment, marketLines, newGame, newStand, openStand, plannedWeather, PLOT_BY_ID, PLOTS, RANDOM_EVENTS, registerEvent, scorcherKeep,
  SEASON_DAYS, SEASON_WEATHER, SEASONS, SEGMENTS, shineReason, simulateRestOfDay, sleepUntilDawn, SUPPLY_SHOCK, tickMinute, TOURIST_BUS_SHARE,
  forgiveSquawk, iceMachineOn, machineIce, stock,
  bugleHeadline, canRaidKids, DISTRICTS, KIDS_DAY, KIDS_RAID_LINE, kidAppeal, kidsDay, kidsDayGoal, kidStandSale, kidStandsAt, nearbyPlots, OPEN,
  RAID_RANK, raidKidStand, RIVAL_SHARE_CAP, streetAt, weekday, welcomeDex, KIDS_GOAL, expectedDemand, kidsShare,
  type DistrictId, type EventDef, type GameState, type Season, type SegmentId, type Street, type WorldEvent,
} from './economy.ts';
import { nextRandom } from './rng.ts';
import { eventTickets, kidStandCard } from '../ui/events.ts';
import { goalsNow } from './goals.ts';

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
const kidsChance = KIDS_DAY.chance;
afterEach(() => {
  for (const id of added.splice(0)) delete EVENT_DEFS[id];
  for (const d of saved.splice(0)) EVENT_DEFS[d.id] = d;
  Object.assign(HEAT_WAVE.chance, chance);
  KIDS_DAY.chance = kidsChance;
});

/** A quiet Day 7 game: nothing rolls on its own (Heat Waves and Kids' Lemonade Day off too), so a test brings its own event. */
function quietGame(seed: number): GameState {
  only();
  for (const k of SEASONS as Season[]) HEAT_WAVE.chance[k] = 0;
  KIDS_DAY.chance = 0;
  const s = newGame(seed);
  dawnsTo(s, 7);
  return s;
}
/** Put an event on the calendar from the next morning (placed as it starts, unless told where) and go to that dawn. */
function force(s: GameState, id: string, where: Partial<WorldEvent> = {}): WorldEvent {
  const e: WorldEvent = { id, from: s.day + 1, to: s.day + EVENT_DEFS[id].days, ...(EVENT_DEFS[id].when === 'midday' ? { at: 12 * 60 } : {}), ...where };
  eventsOf(s).on.push(e);
  dawn(s, s.day + 1);
  return e;
}
/** Hand the player a Folding Table on the first free street plot of a district. */
function standIn(s: GameState, district: DistrictId): string {
  const p = PLOTS.find((q) => q.district === district && q.type === 'street' && !s.plots[q.id].owner)!;
  s.plots[p.id] = { ...s.plots[p.id], owner: 'player', stand: newStand(1) };
  return p.id;
}
/** Stock a stand for a long day. */
function stockUp(s: GameState, plotId: string): void {
  s.cash = Math.max(s.cash, 5000);
  const st = s.plots[plotId].stand!;
  for (const id of ['lemons', 'sugar', 'ice'] as const) while (buySupply(s, id, 1, st));
}

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

describe('Lemon Blight and Sugar Shortage', () => {
  it('lemons ×2 for 5 days on top of the daily swing: every buyer pays it, about 10¢ more a cup, and the Bugle counts it down', () => {
    const s = quietGame(41);
    const e = force(s, 'lemonBlight');
    expect(e.to - e.from + 1).toBe(RANDOM_EVENTS.lemonBlight.days);
    expect(s.news.some((n) => n.startsWith('LEMON BLIGHT!') && n.includes('Buy daily (lemons spoil in 3 days) and nudge prices up'))).toBe(true);
    for (let d = e.from; d <= e.to; d++) {
      if (d > e.from) dawn(s, d);
      expect(s.market.lemons).toBeGreaterThanOrEqual(0.2 * 0.8 * SUPPLY_SHOCK - 1e-9);
      expect(s.market.lemons).toBeLessThanOrEqual(0.2 * 1.2 * SUPPLY_SHOCK + 1e-9);
      expect(marketLines(s)[0].shock).toEqual({ name: 'Lemon Blight', left: e.to - d + 1 });
      const cash = s.cash;
      buySupply(s, 'lemons', 1);
      expect(cash - s.cash).toBeCloseTo(20 * s.market.lemons, 2); // the player pays the doubled price
    }
    const st = s.plots[LOTTIES_CORNER].stand!;
    const blighted = costPerCup(s, st);
    s.market.lemons /= SUPPLY_SHOCK;
    expect(blighted - costPerCup(s, st)).toBeCloseTo(0.1, 1); // "about $0.10 more a cup"
    dawn(s, e.to + 1);
    expect(liveEvent(s, 'lemonBlight')).toBeUndefined();
    expect(s.market.lemons).toBeLessThanOrEqual(0.24 + 1e-9);
    expect(marketLines(s)[0].shock).toBeUndefined();
  });

  it('Sugar Shortage doubles sugar; both are harmful, so they never run together', () => {
    const s = quietGame(42);
    const e = force(s, 'sugarShortage');
    expect(s.market.sugar).toBeGreaterThanOrEqual(0.03 * 0.8 * SUPPLY_SHOCK - 1e-9);
    expect(marketLines(s)[1].shock).toEqual({ name: 'Sugar Shortage', left: 5 });
    expect(EVENT_DEFS.sugarShortage.counter).toBe('Sugar keeps: a stocked Warehouse rides it out');
    expect(EVENT_DEFS.lemonBlight.kind).toBe('harmful');
    expect(EVENT_DEFS.sugarShortage.kind).toBe('harmful');
    dawn(s, e.to + 1);
    expect(s.market.sugar).toBeLessThanOrEqual(0.036 + 1e-9);
  });
});

describe('traffic surges', () => {
  it('Viral Video: one of your stands ×2 from the minute it breaks in, for 2 days; the odds and Auto-Restock see it', () => {
    const s = quietGame(43);
    const e = force(s, 'viralVideo');
    expect(e.live).toBeFalsy();
    expect(eventTraffic(s, LOTTIES_CORNER)).toBe(1);
    openStand(s);
    while (s.minute < e.at!) tickMinute(s);
    expect(e.plots).toEqual([LOTTIES_CORNER]); // placed on one of your stands
    expect(eventTraffic(s, LOTTIES_CORNER)).toBe(EVENT_TRAFFIC.viralVideo);
    expect(s.news.some((n) => n.startsWith('VIRAL VIDEO!') && n.includes('Stock deep, raise the price'))).toBe(true);
    const rival = PLOTS.find((p) => s.plots[p.id].owner && s.plots[p.id].owner !== 'player')!.id;
    expect(eventTraffic(s, rival)).toBe(1);
    simulateRestOfDay(s);
    dawn(s, e.to);
    const surge = expectedPassersby(s, LOTTIES_CORNER, s.forecast);
    const cups = expectedCups(s, LOTTIES_CORNER);
    e.live = false;
    expect(surge).toBeCloseTo(2 * expectedPassersby(s, LOTTIES_CORNER, s.forecast), 6);
    expect(cups).toBeGreaterThanOrEqual(expectedCups(s, LOTTIES_CORNER));
    e.live = true;
    dawn(s, e.to + 1);
    expect(eventTraffic(s, LOTTIES_CORNER)).toBe(1);
  });

  it('Celebrity Sighting ×2 in a district for a day, rivals included', () => {
    const s = quietGame(44);
    force(s, 'celebrity', { district: 'downtown' });
    const there = PLOTS.filter((p) => p.district === 'downtown' && s.plots[p.id].stand);
    expect(there.length).toBeGreaterThan(0);
    for (const p of there) expect(eventTraffic(s, p.id)).toBe(EVENT_TRAFFIC.celebrity);
    expect(eventTraffic(s, LOTTIES_CORNER)).toBe(1);
    expect(EVENT_DEFS.celebrity.counter).toBe('Send Sunny the Lemon');
  });

  it('a Parade Route ×2 and Roadworks ×0.5 on a street: 4-6 adjacent columns of one district, both sides', () => {
    for (const [id, mult, days] of [['parade', EVENT_TRAFFIC.parade, 1], ['roadworks', EVENT_TRAFFIC.roadworks, 3]] as const) {
      for (let seed = 50; seed < 56; seed++) {
        const s = quietGame(seed);
        const e = force(s, id);
        expect(e.to - e.from + 1).toBe(days);
        const plots = e.plots!.map((pid) => PLOT_BY_ID[pid]);
        const district = plots[0].district;
        const cols = [...new Set(plots.map((p) => p.col))].sort((a, b) => a - b);
        expect(cols.length).toBeGreaterThanOrEqual(Math.min(4, DISTRICT_BY_ID[district].cols));
        expect(cols.length).toBeLessThanOrEqual(6);
        expect(cols[cols.length - 1] - cols[0] + 1).toBe(cols.length); // adjacent
        expect(e.plots!.sort()).toEqual(PLOTS.filter((p) => p.district === district && cols.includes(p.col)).map((p) => p.id).sort());
        for (const p of PLOTS) expect(eventTraffic(s, p.id)).toBe(e.plots!.includes(p.id) ? mult : 1); // rivals' stands too
      }
    }
    expect(EVENT_DEFS.roadworks.kind).toBe('harmful');
  });

  it('a street lands through one of your stands when its district has one', () => {
    let through = 0;
    for (let seed = 60; seed < 80; seed++) {
      const s = quietGame(seed);
      const e = force(s, 'parade');
      if (e.district === 'maple') { through++; expect(e.plots).toContain(LOTTIES_CORNER); }
    }
    expect(through).toBeGreaterThan(5); // most of them: Maple Row is the only district you sell in
  });
});

describe('the Tourist Bus', () => {
  it('fills a district with tourists (70%) and +50% traffic for a day: Strawberry shines there', () => {
    const s = quietGame(45);
    force(s, 'touristBus', { district: 'oldtown' });
    expect(crowdAt(s, 'oldtown')).toBe('tourists');
    expect(crowdAt(s, 'maple')).toBeUndefined();
    const rng = { seed: 7 };
    let tourists = 0;
    for (let i = 0; i < 4000; i++) if (festivalCrowd(s, rng, 'oldtown') === 'tourists') tourists++;
    expect(tourists / 4000).toBeCloseTo(TOURIST_BUS_SHARE, 1);
    expect(shineReason(s, 'oldtown', 'strawberry')).toBe('crowd');
    const p = PLOTS.find((q) => q.district === 'oldtown' && s.plots[q.id].stand)!;
    expect(eventTraffic(s, p.id)).toBe(EVENT_TRAFFIC.touristBus);
    dawn(s, s.day + 1);
    expect(crowdAt(s, 'oldtown')).not.toBe('tourists'); // the Summer Fair's families again
  });
});

describe('event tickets in the feed', () => {
  it('each names its counter-play, with the buttons that play it; a dawn one shows on its first day', () => {
    const s = quietGame(48);
    const e = force(s, 'viralVideo');
    expect(eventTickets(s).join('')).not.toContain('data-event="viralVideo"'); // not before it breaks in
    openStand(s);
    while (s.minute < e.at!) tickMinute(s);
    const card = eventTickets(s).join('');
    expect(card).toContain('data-event="viralVideo"');
    expect(card).toContain('Stock deep, raise the price');
    expect(card).toContain(`data-action="goto" data-plot="${LOTTIES_CORNER}"`);
    expect(card).toContain(`data-action="restockNow" data-plot="${LOTTIES_CORNER}"`);
    simulateRestOfDay(s);
    dawn(s, e.to);
    expect(eventTickets(s).join('')).toContain('data-event="viralVideo"'); // its second day too
    const r = force(s, 'roadworks');
    expect(eventTickets(s).join('')).toContain('Run campaigns elsewhere');
    expect(eventTickets(s).join('')).toContain('class="cl-ticket red"');
    dawn(s, r.from + 1);
    expect(eventTickets(s).join('')).not.toContain('data-event="roadworks"'); // the Bugle keeps count from here
  });
});

describe('the Food Critic', () => {
  it('names one of your stands at dawn and gives the verdict at closing', () => {
    const s = quietGame(46);
    const e = force(s, 'foodCritic');
    expect(e.plots).toEqual([LOTTIES_CORNER]);
    expect(s.news.some((n) => n.startsWith('FOOD CRITIC!') && n.includes("Lottie's Corner"))).toBe(true);
    stockUp(s, LOTTIES_CORNER);
    openStand(s);
    simulateRestOfDay(s);
    expect(e.verdict).toBe(criticVerdict(criticChecks(s, LOTTIES_CORNER)));
    expect(s.today.reputationAfter).toBe(s.reputation);
    expect(s.news.some((n) => /^CRITIC (RAVES|SHRUGS|PANS)/.test(n))).toBe(true);
  });

  it('three checks: a short line, a fair price for the main segment, a card it loves or that shines; 3 = +0.1, 2 = 0, fewer = −0.1', () => {
    const s = quietGame(47);
    const plot = standIn(s, 'downtown');
    const st = s.plots[plot].stand!;
    expect(mainSegment('downtown')).toBe('office');
    expect(mainSegment('maple')).toBe('kids');
    st.day.passersby = 400;
    st.day.customers = 120;
    st.day.walkedPast.line = 19; // under 5%
    st.recipe = 'classic';
    st.price = appealFor(s, plot, 'office').fairPrice;
    const c = criticChecks(s, plot);
    expect(c).toEqual({ tasted: true, line: true, price: true, recipe: false }); // office workers love Sparkling, not Classic
    expect(criticVerdict(c)).toBe(0);
    expect(criticVerdict({ ...c, recipe: true })).toBe(FOOD_CRITIC.stars);
    expect(SEGMENTS.office.favorites).toContain('sparkling');
    st.day.walkedPast.line = 20; // 5%: too long
    expect(criticChecks(s, plot).line).toBe(false);
    expect(criticVerdict(criticChecks(s, plot))).toBe(-FOOD_CRITIC.stars);
    st.price += 0.05;
    expect(criticChecks(s, plot).price).toBe(false);
    expect(criticVerdict({ tasted: false, line: true, price: true, recipe: true })).toBe(-FOOD_CRITIC.stars); // nothing to taste
  });
});

describe('the L4+ ice machine and the Power Outage', () => {
  const clone = (s: GameState) => JSON.parse(JSON.stringify(s)) as GameState;

  it('an L4+ stand makes its ice as it pours, at the Market price: never warm, and it keeps its ice overnight', () => {
    const base = quietGame(61);
    const corner = base.plots[LOTTIES_CORNER].stand!;
    corner.level = 4;
    stockUp(base, LOTTIES_CORNER);
    expect(iceMachineOn(base, LOTTIES_CORNER)).toBe(true);
    const iced = clone(base), machine = clone(base), dark = clone(base);
    machine.plots[LOTTIES_CORNER].stand!.inventory.ice = 0;
    dark.plots[LOTTIES_CORNER].stand!.inventory.ice = 0;
    eventsOf(dark).on.push({ id: 'powerOutage', from: dark.day, to: dark.day, live: true, district: 'maple' });
    expect(iceMachineOn(dark, LOTTIES_CORNER)).toBe(false);
    for (const s of [iced, machine, dark]) { openStand(s); simulateRestOfDay(s); }
    const day = (s: GameState) => s.plots[LOTTIES_CORNER].stand!.day;
    expect(day(machine).customers).toBeGreaterThan(50);
    expect(day(machine).satisfaction).toBe(day(iced).satisfaction); // never warm
    expect(day(dark).satisfaction).toBeLessThan(day(iced).satisfaction); // warm cups in the dark
    const cups = day(machine).customers; // the ice goes on each cup's cost: 3 cubes a Classic (the day's books round each cup to the cent)
    expect(Math.abs(day(machine).cupCosts - day(iced).cupCosts - cups * 3 * machine.market.ice)).toBeLessThan(0.006 * cups);
    expect(iced.plots[LOTTIES_CORNER].stand!.inventory.ice).toBeGreaterThan(0); // nothing melts overnight
    expect(iced.today.iceMelted).toBe(0);
    const st = machine.plots[LOTTIES_CORNER].stand!;
    st.inventory.ice = 1;
    expect(machineIce(machine, LOTTIES_CORNER, st, 3)).toBeCloseTo(2 * machine.market.ice, 9); // it tops up what the cooler lacks
    expect(st.inventory.ice).toBe(3);
    expect(machineIce(machine, LOTTIES_CORNER, st, 3)).toBe(0);
  });

  it('Auto-Restock buys no ice for a machine; under a Power Outage it buys Market ice, and the leftovers melt that night', () => {
    const s = quietGame(62);
    const st = s.plots[LOTTIES_CORNER].stand!;
    st.level = 4;
    st.autoRestock = true;
    st.inventory.ice = 0;
    const calm = clone(s);
    calm.cash = 50000;
    openStand(calm);
    expect(calm.plots[LOTTIES_CORNER].stand!.inventory.ice).toBe(0);
    const e = force(s, 'powerOutage');
    expect(e.district).toBe('maple'); // where your machines are
    expect(EVENT_DEFS.powerOutage.kind).toBe('harmful');
    expect(s.news.some((n) => n.startsWith('POWER OUTAGE!') && n.includes('Buy Market ice for those stands'))).toBe(true);
    expect(eventTickets(s).join('')).toContain(`data-action="restockNow" data-plot="${LOTTIES_CORNER}"`);
    s.cash = 50000;
    openStand(s);
    expect(st.inventory.ice).toBeGreaterThan(0); // Auto-Restock covers it
    simulateRestOfDay(s);
    expect(st.inventory.ice).toBe(0); // melted
    expect(s.today.iceMelted).toBeGreaterThan(0);
    dawn(s, s.day + 1);
    expect(iceMachineOn(s, LOTTIES_CORNER)).toBe(true);
  });

  it('no outage without a machine to stop', () => {
    const s = quietGame(63);
    expect(EVENT_DEFS.powerOutage.can!(s)).toBe(false);
    s.plots[LOTTIES_CORNER].stand!.level = 4;
    expect(EVENT_DEFS.powerOutage.can!(s)).toBe(true);
  });
});

describe('Captain Squawk', () => {
  /**
   * A day on the clock up to the gull's minute, with yesterday's lemons and a fresh delivery this morning. Nobody buys
   * at the morning's sky-high price, so this morning's 40 are still whole when he comes; then the price is back.
   */
  function squawk(seed: number): { s: GameState; e: WorldEvent } {
    const s = quietGame(seed);
    const e = force(s, 'captainSquawk');
    const st = s.plots[LOTTIES_CORNER].stand!;
    s.cash = 5000;
    st.inventory.lemons = [{ qty: 20, day: s.day - 1, unitCost: 0.2 }, { qty: 40, day: s.day, unitCost: 0.2 }];
    while (buySupply(s, 'sugar', 1, st));
    const price = st.price;
    st.price = 50;
    openStand(s);
    while (s.minute < e.at!) tickMinute(s);
    st.price = price;
    return { s, e };
  }

  it('steals the newest lemon delivery at his minute; the stand stays short until restocked', () => {
    const { s, e } = squawk(64);
    const st = s.plots[LOTTIES_CORNER].stand!;
    expect(e.stolen).toBe(40);
    expect(stock(st, 'lemons')).toBeLessThanOrEqual(20);
    expect(s.news).toContain("SQUAWK! Captain Squawk flies off with 40 lemons from Lottie's Corner. Restock; forgive him.");
    expect(s.world!.breaks!.at(-1)!.text).toContain('SQUAWK!'); // a mid-day break-in on 101.5
    const card = eventTickets(s).join('');
    expect(card).toContain('data-event="captainSquawk"');
    expect(card).toContain(`data-action="restockNow" data-plot="${LOTTIES_CORNER}"`);
    expect(card).toContain('data-action="forgive"');
    for (let i = 0; i < 30; i++) tickMinute(s);
    expect(EVENT_DEFS.captainSquawk.over!(s, e)).toBe(false); // selling only takes it lower
    buySupply(s, 'lemons', 1, st);
    expect(EVENT_DEFS.captainSquawk.over!(s, e)).toBe(true);
    expect(eventTickets(s).join('')).not.toContain('data-event="captainSquawk"');
    tickMinute(s);
    expect(e.low).toBe(-1); // restocked for good, however low it sells
    simulateRestOfDay(s);
    dawn(s, s.day + 1);
    expect(liveEvent(s, 'captainSquawk')).toBeUndefined();
    expect(eventsOf(s).past[0].id).toBe('captainSquawk');
  });

  it("Forgive him puts the card away; no lemons, no theft", () => {
    const { s, e } = squawk(65);
    expect(forgiveSquawk(s, LOTTIES_CORNER)).toBe(true);
    expect(eventTickets(s).join('')).not.toContain('data-event="captainSquawk"');
    expect(forgiveSquawk(s, LOTTIES_CORNER)).toBe(false);
    expect(e.stolen).toBe(40);
    const t = quietGame(66);
    const f = force(t, 'captainSquawk');
    t.plots[LOTTIES_CORNER].stand!.inventory.lemons = [];
    openStand(t);
    while (t.minute < f.at!) tickMinute(t);
    expect(liveEvent(t, 'captainSquawk')).toBeUndefined(); // called off
    expect(EVENT_DEFS.captainSquawk.kind).toBe('harmful');
  });
});

describe("Kids' Lemonade Day", () => {
  it('is planned in Summer only, on a weekday between season days 3 and 12: at most once a year', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(weekday)).toEqual([true, true, true, true, true, false, false, true]); // Day 1 is a Monday
    const s = newGame(70);
    const plan = EVENT_DEFS.kidsDay.plan!;
    KIDS_DAY.chance = 1;
    const year = SEASON_DAYS * SEASONS.length;
    for (const start of [1, 1 + year, 1 + 2 * year]) {
      s.day = start;
      const days = new Set<number>();
      for (let seed = 1; seed <= 60; seed++) days.add(plan(s, { seed }, 'summer')!);
      for (const d of days) {
        expect(weekday(d)).toBe(true);
        expect(d - start + 1).toBeGreaterThanOrEqual(KIDS_DAY.window[0]);
        expect(d - start + 1).toBeLessThanOrEqual(KIDS_DAY.window[1]);
        expect(d).toBeGreaterThanOrEqual(EVENTS.firstDay);
      }
      expect(days.size).toBeGreaterThan(3);
      for (const season of ['fall', 'winter', 'spring'] as Season[]) expect(plan(s, { seed: 5 }, season)).toBeNull();
    }
    KIDS_DAY.chance = 0;
    s.day = 1;
    expect(plan(s, { seed: 5 }, 'summer')).toBeNull();
  });

  it('comes once each Summer through the real dawns', () => {
    only();
    for (const k of SEASONS as Season[]) HEAT_WAVE.chance[k] = 0;
    KIDS_DAY.chance = 1;
    const s = newGame(71);
    const year = SEASON_DAYS * SEASONS.length;
    dawnsTo(s, SEASON_DAYS + 1);
    dawn(s, year);
    dawnsTo(s, year + SEASON_DAYS + 1);
    const seen = eventsOf(s).past.filter((p) => p.id === 'kidsDay').map((p) => p.from).sort((a, b) => a - b);
    expect(seen.length).toBe(2);
    expect(seen[0]).toBeLessThanOrEqual(SEASON_DAYS);
    expect(seen[1]).toBeGreaterThan(year);
    for (const d of seen) expect(weekday(d)).toBe(true);
  });

  it('puts a kid stand in every district, the one where you sell within 2 plots of your stand', () => {
    const s = quietGame(72);
    const e = force(s, 'kidsDay');
    expect(e.live).toBe(true);
    expect(EVENT_DEFS.kidsDay.kind).toBe('mixed'); // never holds back a harmful event
    expect(e.kids!.length).toBe(DISTRICTS.length * KIDS_DAY.perDistrict);
    expect(new Set(e.kids!.map((k) => PLOT_BY_ID[k].district)).size).toBe(DISTRICTS.length);
    for (const k of e.kids!) expect(s.plots[k].stand ?? s.plots[k].facility).toBeUndefined(); // a free lot, never on a stand
    const next = kidStandsAt(s, LOTTIES_CORNER);
    expect(next.length).toBe(1);
    expect(nearbyPlots(PLOT_BY_ID[LOTTIES_CORNER]).map((p) => p.id)).toContain(next[0]);
    expect(s.news).toContain("KIDS' LEMONADE DAY! Kid stands pop up on sidewalks all over the bay. Lottie: leave them alone until dusk.");
    expect(bugleHeadline(s)).toEqual(["KIDS' LEMONADE DAY!", 'Kid stands all over the bay']);
    const card = eventTickets(s).join('');
    expect(card).toContain('data-event="kidsDay"');
    expect(card).toContain(`data-action="goto" data-plot="${next[0]}"`);
    const far = PLOTS.find((p) => p.district === 'hilltop' && !e.kids!.some((k) => nearbyPlots(p).some((q) => q.id === k)));
    if (far) expect(kidStandsAt(s, far.id)).toEqual([]);
    dawn(s, s.day + 1);
    expect(kidsDay(s)).toBeUndefined();
    expect(kidStandsAt(s, LOTTIES_CORNER)).toEqual([]);
  });

  it('a kid stand splits the walkers near it like any stand: with the rival stands there, their appeal share, at most 35%', () => {
    const s = quietGame(73);
    const p = PLOT_BY_ID[LOTTIES_CORNER];
    const seg: SegmentId = 'kids';
    const street = () => streetAt(s, p, (id) => appealFor(s, id, seg));
    const idle = { seed: 9 };
    const plain = street();
    expect(kidStandSale(s, p, idle, 'families', plain)).toBe(plain); // no Kids' Day: the street as it was, nothing drawn
    expect(idle.seed).toBe(9);
    force(s, 'kidsDay');
    s.phase = 'open';
    const kids = kidStandsAt(s, p.id);
    const theirs = kids.reduce((t, k) => t + kidAppeal(k, seg), 0);
    /** The odds a walker goes to the kids, and to rival stands: the non-own side's appeal share, capped, split by appeal. */
    const odds = (st: Street) => {
      const others = st.rivalTotal + theirs;
      const share = Math.min(RIVAL_SHARE_CAP, others / (st.ownTotal + others));
      return { kids: (share * theirs) / others, rivals: (share * st.rivalTotal) / others };
    };
    /** n walkers past Lottie's: how many go to the kids, and to rival stands (chooseOn's first draw). */
    const walk = (st: Street, n: number) => {
      const rng = { seed: 123 };
      let toKids = 0, toRivals = 0;
      for (let i = 0; i < n; i++) {
        const w = kidStandSale(s, p, rng, seg, st);
        if ('type' in w) toKids++;
        else if (w.rivals.length && nextRandom(rng) < w.share) toRivals++;
      }
      return { kids: toKids / n, rivals: toRivals / n, went: toKids };
    };
    const here = street();
    const want = odds(here);
    expect(want.kids).toBeGreaterThan(0.1);
    const before = s.today.walkedPast.rival;
    const got = walk(here, 3000);
    expect(Math.abs(got.kids - want.kids)).toBeLessThan(0.03);
    expect(Math.abs(got.rivals - want.rivals)).toBeLessThan(0.03);
    expect(kidsDay(s)!.took).toBe(got.went); // yours: counted as walked past to a rival
    expect(s.today.walkedPast.rival - before).toBe(got.went);
    // In a crowded rival block the kids join the rivals' side: together they still take 35%, split by appeal.
    const block: Street = { ...here, rivals: [{ id: 'rival', a: { ...here.home.a, appeal: 2 * here.ownTotal } }], rivalTotal: 2 * here.ownTotal, share: RIVAL_SHARE_CAP };
    const crowd = walk(block, 4000);
    expect(Math.abs(crowd.kids + crowd.rivals - RIVAL_SHARE_CAP)).toBeLessThan(0.03);
    expect(Math.abs(crowd.kids - odds(block).kids)).toBeLessThan(0.02);
    expect(kidAppeal(LOTTIES_CORNER, 'kids')).toBeCloseTo(1.25, 9); // a Folding Table at $0.50, well under Maple Row's L1 ceiling: +25%
  });

  it('the forecast sees the kid stands: the prep odds and Auto-Restock count on what they leave you', () => {
    const s = quietGame(75);
    const p = PLOT_BY_ID[LOTTIES_CORNER];
    const e = force(s, 'kidsDay');
    const kids = kidStandsAt(s, p.id);
    expect(kids.length).toBe(1);
    const seg: SegmentId = 'kids';
    const appealOf = (id: string) => appealFor(s, id, seg, s.forecast);
    const here = streetAt(s, p, appealOf);
    const theirs = kidAppeal(kids[0], seg);
    const cut = Math.min(RIVAL_SHARE_CAP, (here.rivalTotal + theirs) / (here.ownTotal + here.rivalTotal + theirs));
    expect(kidsShare(s, p, p.id, seg, appealOf, 1 - here.share)).toBeCloseTo(1 - cut, 9); // what the owner keeps
    const withKids = expectedDemand(s, LOTTIES_CORNER);
    const cups = expectedCups(s, LOTTIES_CORNER);
    e.raided = [...e.kids!]; // the same morning with every kid stand gone
    const without = expectedDemand(s, LOTTIES_CORNER);
    expect(withKids.demand).toBeLessThan(without.demand * 0.95);
    expect(withKids.kept).toBeLessThan(without.kept);
    expect(cups).toBeLessThanOrEqual(expectedCups(s, LOTTIES_CORNER));
    e.raided = [];
    s.plots[LOTTIES_CORNER].stand!.autoRestock = true;
    s.cash = 5000;
    openStand(s); // Auto-Restock buys for the forecast with the kids in it
    const st = s.plots[LOTTIES_CORNER].stand!;
    expect(stock(st, 'lemons')).toBeLessThanOrEqual(Math.ceil(Math.ceil(cups * 1.2) / 10) * 5 + 20);
  });

  it("takes walkers through a real day, and the goal on Lottie's card fills to dusk and pays", () => {
    const s = quietGame(74);
    const e = force(s, 'kidsDay');
    const goal = 'Leave the kid stands alone until dusk';
    expect(kidsDayGoal(s)).toEqual({ text: goal, progress: 0, done: false });
    expect(goalsNow(s)[1]).toMatchObject({ text: goal, story: true, slot: 'medium' }); // it steps into the medium slot
    stockUp(s, LOTTIES_CORNER);
    openStand(s);
    while (s.minute < (OPEN + CLOSE) / 2) tickMinute(s);
    expect(kidsDayGoal(s)!.progress).toBeCloseTo(0.5, 2);
    simulateRestOfDay(s);
    expect(kidsDayGoal(s)).toEqual({ text: goal, progress: 1, done: true });
    expect(s.goals!.done).toContain(`${KIDS_GOAL}:${goal}`); // ticked off at closing, and paid
    expect(s.news.some((n) => n.startsWith(`✓ ${goal} +$`))).toBe(true);
    expect(e.took).toBeGreaterThan(20);
    expect(s.plots[LOTTIES_CORNER].stand!.day.walkedPast.rival).toBeGreaterThanOrEqual(e.took!);
    expect(kidStandCard(s, e.kids![0])).toBe(''); // packed up at dusk
    expect(canRaidKids(s, e.kids![0])).toEqual({ ok: false, why: 'Raids unlock at Rank 3' });
    s.rank = RAID_RANK;
    expect(canRaidKids(s, e.kids![0])).toEqual({ ok: false, why: 'They packed up at dusk' });
    dawn(s, s.day + 1);
    expect(kidsDayGoal(s)).toBeNull();
    expect(goalsNow(s)[1].text).not.toBe(goal);
    force(s, 'kidsDay'); // next year's: a new goal, shown and paid again
    expect(s.goals!.done).not.toContain(`${KIDS_GOAL}:${goal}`);
    expect(goalsNow(s)[1].text).toBe(goal);
  });

  it("a raid costs 0.5 star, tomorrow's front page and Lottie's respect, and the Raid Planner shows it in red first", () => {
    const s = quietGame(75);
    const e = force(s, 'kidsDay');
    const kid = kidStandsAt(s, LOTTIES_CORNER)[0];
    expect(canRaidKids(s, kid)).toEqual({ ok: false, why: `Raids unlock at Rank ${RAID_RANK}` });
    expect(kidStandCard(s, kid)).toContain('data-testid="kid-stand"');
    expect(kidStandCard(s, kid)).not.toContain('kid-raid'); // hidden while raids are locked
    s.rank = RAID_RANK;
    s.guards = [];
    expect(canRaidKids(s, kid)).toEqual({ ok: false, why: 'No guards free' });
    welcomeDex(s);
    expect(canRaidKids(s, kid)).toEqual({ ok: true });
    const plain = PLOTS.find((q) => !e.kids!.includes(q.id))!.id;
    expect(canRaidKids(s, plain)).toEqual({ ok: false, why: 'No kid stand here' });
    const card = kidStandCard(s, kid);
    expect(card).toContain(`<span class="cl-note bad" data-testid="kid-cost">−${KIDS_DAY.stars}<svg class="cl-ico"`); // a clay star
    expect(card).toContain(`</svg>, front page, Lottie's respect</span>`);
    expect(card.indexOf('kid-cost')).toBeLessThan(card.indexOf('Kid stand</b>')); // the cost comes first
    expect(card).toContain(`data-action="kidRaid" data-plot="${kid}"`);
    const rep = s.reputation;
    expect(raidKidStand(s, kid)).toBe(true);
    expect(s.reputation).toBeCloseTo(Math.max(1, rep - KIDS_DAY.stars), 9);
    expect(e.raided).toEqual([kid]);
    expect(kidStandsAt(s, LOTTIES_CORNER)).not.toContain(kid); // its walkers come back
    expect(s.news).toContain(`Lottie: "${KIDS_RAID_LINE}" (−${KIDS_DAY.stars} star)`);
    expect(KIDS_RAID_LINE).toBe('We do not rob seven-year-olds in this family. Put the pitcher back.');
    expect(s.world!.shamed).toBe(s.day);
    expect(kidsDayGoal(s)).toBeNull(); // the goal's gone, from Lottie's card too
    expect(goalsNow(s).map((g) => g.text)).not.toContain('Leave the kid stands alone until dusk');
    expect(raidKidStand(s, kid)).toBe(false);
    expect(kidStandCard(s, kid)).toContain('Kid stand raided');
    stockUp(s, LOTTIES_CORNER);
    openStand(s);
    simulateRestOfDay(s);
    dawn(s, s.day + 1);
    expect(bugleHeadline(s)).toEqual(["GRANDKID RAIDS KIDS' STAND", 'Seven-year-old left in tears']);
  });
});
