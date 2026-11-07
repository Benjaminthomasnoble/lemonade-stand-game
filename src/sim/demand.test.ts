import { describe, expect, it } from 'vitest';
import {
  appealFor, campaignCost, canRunCampaign, ceilingFor, crowdAt, curbAppeal, dailyService, dayMix, dayMixOn, demandChain, drainQueue, eliminate,
  expectedCups, expectedDemand, groveTraffic,
  FACTIONS, hourMix, HOURLY_TRAFFIC, joinsLine, LOTTIES_CORNER, lunchRush, lunchRushDay, marketingMultiplier, migrateDemand, migrateSave,
  nearbyPlots, newGame, newStand, openStands, peopleAhead, perkTraffic, PLOT_BY_ID, PLOTS, priceCeiling, priceFit, rivalPrice, rivalShare,
  runCampaign, SEGMENTS, segmentPriceFit, serviceLeft, setPrice, simulateRestOfDay, STAND_LEVELS, stockCups, tickMinute, touristPays, withinTwo,
  type DistrictId, type GameState, type RivalId, type SegmentId, type SimEvent, type WeatherKind,
} from './economy.ts';

/** Plenty of everything, so stock never binds. */
function stockUp(s: GameState, plotId: string) {
  const st = s.plots[plotId].stand!;
  st.inventory.lemons = [{ qty: 2000, day: s.day, unitCost: 0.1 }];
  st.inventory.sugar = 8000;
  st.inventory.ice = 20000;
}

/** A player stand on plotId (the plot changes hands for the test). */
function playerStand(s: GameState, plotId: string, level = 1) {
  s.plots[plotId].owner = 'player';
  s.plots[plotId].stand = newStand(level);
  s.plots[plotId].stand!.price = priceCeiling(s, plotId);
  stockUp(s, plotId);
}

/** A rival stand on plotId at its everyday price (starting stands are seeded, so tests place their own). */
function rivalStand(s: GameState, plotId: string, id: RivalId, level = 2) {
  s.plots[plotId].owner = id;
  s.plots[plotId].stand = newStand(level, rivalPrice(id, level, PLOT_BY_ID[plotId]));
}

/** Every purchasable plot in the district (civic and HQ plots don't count) goes to the player. */
function fullControl(s: GameState, d: DistrictId) {
  for (const p of PLOTS) if (p.district === d && p.type !== 'civic' && p.type !== 'hq') s.plots[p.id].owner = 'player';
}

/** Plays one business day in a fixed weather (the forecast and the day agree). */
function playDay(s: GameState, kind: WeatherKind, temp = 90): SimEvent[] {
  s.forecast = { kind, temp };
  openStands(s);
  s.weather = { kind, temp };
  return simulateRestOfDay(s);
}

/** The spec's worked example: Day 3 at Lottie's Corner, Pink at the ceiling, 3.0 stars, no marketing, no rivals. */
function workedExample(seed: number): GameState {
  const s = newGame(seed);
  s.day = 3;
  const st = s.plots[LOTTIES_CORNER].stand!;
  st.recipe = 'pink';
  st.price = priceCeiling(s, LOTTIES_CORNER);
  stockUp(s, LOTTIES_CORNER);
  return s;
}

describe('pricing: one ceiling per stand', () => {
  it('is the level top price × district tolerance × the card bonus, down to the cent', () => {
    expect(ceilingFor(1, 'maple', 'pink')).toBe(1.57); // 1.50 × 1.0 × 1.05 = 1.575
    expect(ceilingFor(2, 'maple', 'pink')).toBe(2.1);
    expect(ceilingFor(1, 'maple', 'classic')).toBe(1.5);
    expect(ceilingFor(1, 'campus', 'mint')).toBe(1.41); // × 0.9
    expect(ceilingFor(2, 'boardwalk', 'classic')).toBe(2.4); // × 1.2
    expect(ceilingFor(4, 'downtown', 'classic')).toBe(5.17); // × 1.15
    expect(ceilingFor(3, 'hilltop', 'classic')).toBe(6); // × 2.0, once
    expect(STAND_LEVELS.map((l) => ceilingFor(l.level, 'oldtown', 'classic'))).toEqual([1.5, 2, 3, 4.5, 7]);
  });

  it('is the same for every customer, and the Corner opens at it', () => {
    const s = newGame(1);
    expect(s.plots[LOTTIES_CORNER].stand!.price).toBe(1.5);
    const ceilings = (Object.keys(SEGMENTS) as SegmentId[]).map((seg) => appealFor(s, LOTTIES_CORNER, seg).ceiling);
    expect(new Set(ceilings)).toEqual(new Set([1.5]));
    s.plots[LOTTIES_CORNER].stand!.recipe = 'pink';
    expect(priceCeiling(s, LOTTIES_CORNER)).toBe(1.57);
  });

  it('prices rival stands off the same ceiling, nudged by personality', () => {
    const s = newGame(1);
    for (const p of PLOTS) {
      const ps = s.plots[p.id];
      if (!ps.stand || ps.owner === 'player') continue;
      const id = ps.owner as RivalId;
      expect(ps.stand.price).toBe(Math.round(priceCeiling(s, p.id) * FACTIONS[id].price * 100) / 100);
    }
    expect(rivalPrice('sourwood', 3, PLOT_BY_ID['hilltop-1s'])).toBe(6);
  });

  it('lets the price tag reach late ceilings', () => {
    expect(ceilingFor(5, 'hilltop', 'classic')).toBe(14);
    const st = newStand(5);
    setPrice(st, 21.84); // an L5 in Hilltop with a +30% card and the Fancy Menu's +20%
    expect(st.price).toBe(21.84);
    setPrice(st, 99);
    expect(st.price).toBe(50);
    setPrice(st, 0);
    expect(st.price).toBe(0.05);
  });

  it('takes the Blender Bar into your Frozen ceiling before it rounds down', () => {
    const s = newGame(1);
    s.plots[LOTTIES_CORNER].stand!.recipe = 'frozen';
    expect(priceCeiling(s, LOTTIES_CORNER)).toBe(1.72); // 1.50 × 1.15 = 1.725
    rivalStand(s, 'maple-5n', 'fizzco');
    s.plots['maple-5n'].stand!.recipe = 'frozen';
    const rival = priceCeiling(s, 'maple-5n');
    eliminate(s, 'blenders', 'hq');
    expect(priceCeiling(s, LOTTIES_CORNER)).toBe(2.07); // 1.725 × 1.2
    expect(priceCeiling(s, 'maple-5n')).toBe(rival); // the perk is yours alone
  });
});

describe('price fit', () => {
  it('is ×1.0 at the ceiling, +1% per 1% under up to +25%, and loses a quarter of buyers per 10% over', () => {
    expect(priceFit(1.5, 1.5)).toBe(1);
    expect(priceFit(1.35, 1.5)).toBeCloseTo(1.1, 6);
    expect(priceFit(1.2, 1.5)).toBeCloseTo(1.2, 6);
    expect(priceFit(0.75, 1.5)).toBeCloseTo(1.25, 6); // capped
    expect(priceFit(0.05, 1.5)).toBeCloseTo(1.25, 6);
    expect(priceFit(1.65, 1.5)).toBeCloseTo(0.75, 6);
    expect(priceFit(1.8, 1.5)).toBeCloseTo(0.5, 6);
    expect(priceFit(1.95, 1.5)).toBeCloseTo(0.25, 6);
    expect(priceFit(2.1, 1.5)).toBeCloseTo(0, 6);
    expect(priceFit(3, 1.5)).toBe(0);
  });

  it('turns the thriftiest away first over the ceiling', () => {
    const at = (seg: SegmentId, over: number) => segmentPriceFit(LOTTIES_CORNER, seg, 1.5 * (1 + over), 1.5);
    expect(at('kids', 0.2)).toBeLessThan(at('students', 0.2));
    expect(at('students', 0.2)).toBeLessThan(at('families', 0.2));
    expect(at('families', 0.2)).toBeLessThan(at('tourists', 0.2));
    expect(at('kids', 0.32)).toBeCloseTo(0, 6);
    expect(at('families', 0.4)).toBeCloseTo(0, 6);
    expect(at('highRollers', 0.4)).toBeCloseTo(0.5, 6); // high rollers keep buying
    for (const seg of Object.keys(SEGMENTS) as SegmentId[]) expect(at(seg, -0.1)).toBeCloseTo(1.1, 6); // under: the same for all
  });

  it('counts "too pricey" only for buyers the price turned away', () => {
    const run = (mult: number) => {
      const s = newGame(5);
      stockUp(s, LOTTIES_CORNER);
      s.plots[LOTTIES_CORNER].stand!.price = Math.round(1.5 * mult * 100) / 100;
      playDay(s, 'warm', 80);
      return s.plots[LOTTIES_CORNER].stand!.day;
    };
    expect(run(1).walkedPast.pricey).toBe(0);
    expect(run(0.8).walkedPast.pricey).toBe(0);
    const over = run(1.2);
    const fair = run(1);
    expect(over.walkedPast.pricey).toBeGreaterThan(0);
    // Buyers lost to price come out of the buyers, not the thirstless: about half of them at +20% here.
    expect(over.customers + over.walkedPast.pricey).toBeGreaterThan(fair.customers * 0.8);
    expect(over.customers).toBeLessThan(fair.customers * 0.75);
  });
});

describe('segments and the line', () => {
  it('peak in the spec\'s hours', () => {
    expect(SEGMENTS.kids.peaks).toEqual([[13, 17]]);
    expect(SEGMENTS.families.peaks).toEqual([[17, 20]]);
    expect(SEGMENTS.seniors.peaks).toEqual([[8, 11]]);
    expect(SEGMENTS.students.peaks).toEqual([[12, 18]]);
    expect(SEGMENTS.office.peaks).toEqual([[8, 9], [12, 14]]);
    expect(SEGMENTS.tourists.peaks).toEqual([[11, 17]]);
    expect(SEGMENTS.workers.peaks).toEqual([[12, 13], [17, 18]]);
    expect(SEGMENTS.highRollers.peaks).toEqual([[14, 19]]);
    const share = (d: DistrictId, h: number, seg: SegmentId) => hourMix(d, h).find(([x]) => x === seg)![1];
    expect(share('maple', 9, 'seniors')).toBeGreaterThan(share('maple', 15, 'seniors'));
    expect(share('maple', 15, 'kids')).toBeGreaterThan(share('maple', 9, 'kids'));
    expect(share('maple', 18, 'families')).toBeGreaterThan(share('maple', 12, 'families'));
    expect(share('oldtown', 13, 'office')).toBeGreaterThan(share('oldtown', 15, 'office'));
    expect(share('downtown', 8, 'office')).toBeGreaterThan(share('downtown', 9, 'office'));
    for (let h = 8; h < 20; h++) expect(hourMix('oldtown', h).reduce((a, [, x]) => a + x, 0)).toBeCloseTo(1, 9);
  });

  it('pours at most cups an hour × 10 selling hours a day', () => {
    const s = newGame(1);
    expect(STAND_LEVELS.map((l) => { s.plots[LOTTIES_CORNER].stand!.level = l.level; return dailyService(s, LOTTIES_CORNER); })).toEqual([200, 500, 1200, 3000, 7000]);
  });

  it('matches the worked example: 187 wanted on a hot day, 200 poured on a Scorcher with a line walking off', () => {
    let hot = 0, scorch = 0, scorchLine = 0, rainy = 0;
    const n = 4;
    for (let seed = 1; seed <= n; seed++) {
      const a = workedExample(seed); playDay(a, 'hot', 88); hot += a.plots[LOTTIES_CORNER].stand!.day.customers / n;
      const b = workedExample(seed); playDay(b, 'scorcher', 99);
      scorch += b.plots[LOTTIES_CORNER].stand!.day.customers / n; scorchLine += b.plots[LOTTIES_CORNER].stand!.day.walkedPast.line / n;
      const c = workedExample(seed); playDay(c, 'rainy', 60); rainy += c.plots[LOTTIES_CORNER].stand!.day.customers / n;
    }
    expect(hot).toBeGreaterThan(165);
    expect(hot).toBeLessThan(195);
    expect(scorch).toBeGreaterThan(192);
    expect(scorch).toBeLessThanOrEqual(200);
    expect(scorchLine).toBeGreaterThan(10);
    expect(rainy).toBeGreaterThan(40);
    expect(rainy).toBeLessThan(62);
    const f = workedExample(1);
    f.forecast = { kind: 'scorcher', temp: 99 };
    expect(expectedCups(f, LOTTIES_CORNER)).toBe(200); // the forecast uses the same cap
    expect(expectedDemand(f, LOTTIES_CORNER).demand).toBeGreaterThan(200);
  });

  it('has buyers join only when the people ahead are within their patience', () => {
    const st = newStand(1);
    st.queue = 3;
    expect(peopleAhead(st)).toBe(3);
    expect(joinsLine(st, 'office')).toBe(true); // office workers accept 3 ahead
    expect(joinsLine(st, 'highRollers')).toBe(false); // high rollers accept 2
    st.queue = 3.4;
    expect(joinsLine(st, 'office')).toBe(false); // someone is still being served
    st.queue = 10;
    expect(joinsLine(st, 'seniors')).toBe(true);
    expect(joinsLine(st, 'tourists')).toBe(false);
    st.queue = 11;
    expect(joinsLine(st, 'seniors')).toBe(false);
  });

  it('moves the line at the pour rate and stops pouring at the day\'s service', () => {
    const s = newGame(1);
    const st = s.plots[LOTTIES_CORNER].stand!;
    st.queue = 30;
    for (let m = 0; m < 60; m++) drainQueue(s, LOTTIES_CORNER);
    expect(st.queue).toBeCloseTo(10, 6); // 20 cups an hour
    st.level = 2;
    for (let m = 0; m < 12; m++) drainQueue(s, LOTTIES_CORNER);
    expect(st.queue).toBe(0); // 50 cups an hour clears the rest
    st.level = 1;
    st.day.customers = 199;
    expect(serviceLeft(s, LOTTIES_CORNER)).toBe(1);
    st.day.customers = 200;
    expect(serviceLeft(s, LOTTIES_CORNER)).toBe(0);
  });
});

describe('who gets the customers', () => {
  it('starts curb appeal at ×1.0 at every stand level', () => {
    const s = newGame(1);
    for (const l of STAND_LEVELS) {
      s.plots[LOTTIES_CORNER].stand!.level = l.level;
      expect(appealFor(s, LOTTIES_CORNER, 'families').curb).toBe(1);
      expect(curbAppeal(s, 'oldtown-0n')).toBe(1);
    }
  });

  it('counts stands within 2 plots across the street and across district lines', () => {
    const P = PLOT_BY_ID;
    expect(withinTwo(P['maple-5n'], P['oldtown-0n'])).toBe(true); // next door, over the district line
    expect(withinTwo(P['maple-5n'], P['oldtown-1n'])).toBe(true); // two along
    expect(withinTwo(P['maple-4n'], P['oldtown-0n'])).toBe(true);
    expect(withinTwo(P['maple-5n'], P['oldtown-2n'])).toBe(false); // three along
    expect(withinTwo(P['maple-5n'], P['oldtown-0s'])).toBe(true); // across the street, one along
    expect(withinTwo(P['maple-5n'], P['oldtown-1s'])).toBe(false); // across and two along
    expect(withinTwo(P['oldtown-7n'], P['downtown-0n'])).toBe(true);
    expect(withinTwo(P['boardwalk-7n'], P['harbor-0n'])).toBe(true);
    expect(withinTwo(P['maple-0n'], P['groves-0n'])).toBe(false); // a different street
    expect(withinTwo(P['groves-7n'], P['campus-0n'])).toBe(true);
    const near = nearbyPlots(P['maple-5n']).map((p) => p.id);
    expect(near).toContain('oldtown-0n');
    expect(near).toContain('maple-5n');
    for (const p of PLOTS) for (const q of nearbyPlots(p)) expect(nearbyPlots(q)).toContain(p); // symmetric
  });

  it('lets rival neighbours take at most 35% of a stand\'s passersby', () => {
    const s = newGame(2);
    playerStand(s, 'maple-5n');
    rivalStand(s, 'oldtown-0n', 'fizzco'); // FizzCo and the Blenders, over the Old Town line
    rivalStand(s, 'oldtown-0s', 'blenders');
    const f = expectedDemand(s, 'maple-5n');
    expect(f.kept).toBeGreaterThanOrEqual(0.65 - 1e-9);
    expect(f.kept).toBeLessThan(0.7); // they are strong enough to take the full 35%
    playDay(s, 'warm', 80);
    const d = s.plots['maple-5n'].stand!.day;
    expect(d.walkedPast.rival / d.passersby).toBeGreaterThan(0.25);
    expect(d.walkedPast.rival / d.passersby).toBeLessThan(0.42);
    const strong = { id: 'x', a: appealFor(s, 'oldtown-0n', 'families') };
    const weak = { id: 'y', a: { ...appealFor(s, 'maple-5n', 'families'), appeal: 0.01 } };
    expect(rivalShare([weak], [strong, strong])).toBe(0.35);
    expect(rivalShare([weak], [])).toBe(0);
  });

  it('follows the street through the day: a stand wrecked mid-day takes nobody after, a new one starts at once', () => {
    const s = newGame(2);
    playerStand(s, 'maple-5n');
    rivalStand(s, 'oldtown-0n', 'fizzco');
    s.forecast = { kind: 'warm', temp: 80 };
    openStands(s);
    s.weather = { kind: 'warm', temp: 80 };
    const d = s.plots['maple-5n'].stand!.day;
    for (let i = 0; i < 200; i++) tickMinute(s);
    expect(d.walkedPast.rival).toBeGreaterThan(0);
    for (const q of nearbyPlots(PLOT_BY_ID['maple-5n'])) {
      const ps = s.plots[q.id];
      if (ps.stand && ps.owner !== 'player') ps.stand.wrecked = true;
    }
    const before = d.walkedPast.rival;
    for (let i = 0; i < 200; i++) tickMinute(s);
    expect(d.walkedPast.rival).toBe(before);
    rivalStand(s, 'oldtown-0s', 'blenders');
    for (let i = 0; i < 150; i++) tickMinute(s);
    expect(d.walkedPast.rival).toBeGreaterThan(before);
  });

  it('sells a table rebuilt mid-day as itself, not as the stand it replaced', () => {
    const s = newGame(2);
    playerStand(s, 'maple-5n', 3);
    s.forecast = { kind: 'warm', temp: 80 };
    openStands(s);
    s.weather = { kind: 'warm', temp: 80 };
    for (let i = 0; i < 120; i++) tickMinute(s);
    const old = s.plots['maple-5n'].stand!;
    expect(old.day.customers).toBeGreaterThan(0);
    // A Folding Table at the old $3.00 price: double its ceiling, so nobody buys.
    s.plots['maple-5n'].stand = newStand(1, old.price);
    stockUp(s, 'maple-5n');
    const table = s.plots['maple-5n'].stand!;
    for (let i = 0; i < 120; i++) tickMinute(s);
    expect(table.day.customers).toBe(0);
    expect(table.day.walkedPast.pricey).toBeGreaterThan(0);
  });

  it('never loses customers to your own stands', () => {
    const s = newGame(3);
    stockUp(s, LOTTIES_CORNER);
    playerStand(s, 'maple-1n');
    playerStand(s, 'maple-3n');
    playDay(s, 'hot', 88);
    expect(s.today.walkedPast.rival).toBe(0);
    for (const id of [LOTTIES_CORNER, 'maple-1n', 'maple-3n']) expect(s.plots[id].stand!.day.walkedPast.rival).toBe(0);
    expect(expectedDemand(s, LOTTIES_CORNER).kept).toBe(1);
  });

  it('forecasts what the day sells', () => {
    let sold = 0, forecast = 0;
    for (let seed = 10; seed < 14; seed++) {
      const s = newGame(seed);
      stockUp(s, LOTTIES_CORNER);
      playerStand(s, 'maple-5n');
      rivalStand(s, 'oldtown-0n', 'fizzco');
      s.forecast = { kind: 'warm', temp: 80 };
      forecast += expectedCups(s, 'maple-5n') + expectedCups(s, LOTTIES_CORNER);
      playDay(s, 'warm', 80);
      sold += s.plots['maple-5n'].stand!.day.customers + s.plots[LOTTIES_CORNER].stand!.day.customers;
    }
    expect(sold / forecast).toBeGreaterThan(0.9);
    expect(sold / forecast).toBeLessThan(1.1);
  });

  it('counts a festival crowd in the forecast, half of every passerby there', () => {
    const s = newGame(1);
    s.day = 10;
    expect(crowdAt(s, 'oldtown')).toBe('families');
    const plain = new Map(dayMix('oldtown'));
    const mix = new Map(dayMixOn(s, 'oldtown'));
    expect([...mix.values()].reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    expect(mix.get('families')).toBeCloseTo(0.5 + 0.5 * (plain.get('families') ?? 0), 9);
    for (const [seg, x] of plain) if (seg !== 'families') expect(mix.get(seg)).toBeCloseTo(x / 2, 9);
    s.day = 7;
    expect(dayMixOn(s, 'oldtown')).toBe(dayMix('oldtown'));
  });

  it('gives Majority (51%+ of a district): your stands +10% sales, rivals there −10% appeal', () => {
    const s = newGame(1);
    s.plots['maple-0n'].owner = 'fizzco';
    s.plots['maple-0n'].stand = newStand(1, rivalPrice('fizzco', 1, PLOT_BY_ID['maple-0n']));
    const before = appealFor(s, LOTTIES_CORNER, 'families').stopChance;
    const rivalBefore = appealFor(s, 'maple-0n', 'families').appeal;
    for (const id of ['maple-1n', 'maple-1s', 'maple-2n', 'maple-3n', 'maple-3s']) s.plots[id].owner = 'player'; // 6 of 12
    expect(curbAppeal(s, LOTTIES_CORNER)).toBe(1);
    s.plots['maple-4s'].owner = 'player'; // 7 of 12 = 58%
    expect(curbAppeal(s, LOTTIES_CORNER)).toBe(1.1);
    expect(appealFor(s, LOTTIES_CORNER, 'families').stopChance).toBeCloseTo(before * 1.1, 9);
    expect(appealFor(s, 'maple-0n', 'families').appeal).toBeCloseTo(rivalBefore * 0.9, 9);
    expect(curbAppeal(s, 'oldtown-0n')).toBe(1); // only in the district you hold
  });
});

describe('district perks at Full Control', () => {
  it('Town Favorite (Old Town): +10% traffic at your stands in Old Town and Maple Row', () => {
    const s = newGame(1);
    playerStand(s, 'boardwalk-1n');
    const corner = marketingMultiplier(s, 'player', s.plots[LOTTIES_CORNER].stand!, LOTTIES_CORNER);
    fullControl(s, 'oldtown');
    expect(perkTraffic(s, 'player', LOTTIES_CORNER)).toBeCloseTo(0.1, 9);
    expect(perkTraffic(s, 'player', 'oldtown-2n')).toBeCloseTo(0.1, 9);
    expect(perkTraffic(s, 'player', 'boardwalk-1n')).toBe(0);
    expect(perkTraffic(s, 'fizzco', 'maple-0n')).toBe(0);
    expect(marketingMultiplier(s, 'player', s.plots[LOTTIES_CORNER].stand!, LOTTIES_CORNER)).toBeCloseTo(corner + 0.1, 9);
    s.plots['oldtown-2n'].owner = null; // lose one plot and it switches off
    expect(perkTraffic(s, 'player', LOTTIES_CORNER)).toBe(0);
  });

  it('Orchard Fresh (the Groves): +10% traffic at every stand you own', () => {
    const s = newGame(1);
    playerStand(s, 'boardwalk-1n');
    fullControl(s, 'groves');
    expect(perkTraffic(s, 'player', LOTTIES_CORNER)).toBeCloseTo(0.1, 9);
    expect(perkTraffic(s, 'player', 'boardwalk-1n')).toBeCloseTo(0.1, 9);
    expect(perkTraffic(s, 'blenders', 'boardwalk-0n')).toBe(0);
    fullControl(s, 'oldtown');
    expect(perkTraffic(s, 'player', LOTTIES_CORNER)).toBeCloseTo(0.2, 9); // they add into the marketing number
  });

  it('Power Lunch (Downtown): the lunch rush is ×1.5 at your stands in Downtown and Old Town', () => {
    const s = newGame(1);
    playerStand(s, 'oldtown-2n');
    for (const q of nearbyPlots(PLOT_BY_ID['oldtown-2n'])) if (q.id !== 'oldtown-2n') s.plots[q.id].stand = null; // a quiet block
    expect(lunchRush(s, 'oldtown-2n', 12)).toBe(1);
    const warm = { kind: 'warm', temp: 80 } as const;
    const before = expectedDemand(s, 'oldtown-2n', warm).visitors;
    fullControl(s, 'downtown');
    expect(lunchRush(s, 'oldtown-2n', 12)).toBe(1.5);
    expect(lunchRush(s, 'oldtown-2n', 13)).toBe(1.5);
    expect(lunchRush(s, 'oldtown-2n', 14)).toBe(1);
    expect(lunchRush(s, 'oldtown-2n', 11)).toBe(1);
    expect(lunchRush(s, LOTTIES_CORNER, 12)).toBe(1); // Maple Row has no lunch crowd to speak of
    expect(lunchRush(s, 'oldtown-0n', 12)).toBe(1); // rivals don't get it
    const sum = HOURLY_TRAFFIC.reduce((a, b) => a + b, 0);
    expect(lunchRushDay(s, 'oldtown-2n')).toBeCloseTo(1 + (0.5 * (HOURLY_TRAFFIC[4] + HOURLY_TRAFFIC[5])) / sum, 9);
    expect(expectedDemand(s, 'oldtown-2n', warm).visitors).toBeCloseTo(before * lunchRushDay(s, 'oldtown-2n'), 6);
  });

  it('Power Lunch surges the street itself at lunch, not just the forecast', () => {
    const lunchWalkers = (on: boolean) => {
      let n = 0;
      for (let seed = 1; seed <= 6; seed++) {
        const s = newGame(seed);
        playerStand(s, 'oldtown-2n');
        if (on) fullControl(s, 'downtown');
        s.forecast = { kind: 'warm', temp: 80 };
        openStands(s);
        s.weather = { kind: 'warm', temp: 80 };
        const d = s.plots['oldtown-2n'].stand!.day;
        while (s.minute < 12 * 60) tickMinute(s);
        const before = d.passersby;
        while (s.minute < 14 * 60) tickMinute(s);
        n += d.passersby - before;
      }
      return n;
    };
    const ratio = lunchWalkers(true) / lunchWalkers(false);
    expect(ratio).toBeGreaterThan(1.4);
    expect(ratio).toBeLessThan(1.6);
  });

  it('Tourist Trap (the Boardwalk): tourists pay +20% for every cup at your stands', () => {
    const s = newGame(4);
    playerStand(s, 'oldtown-2n');
    fullControl(s, 'boardwalk');
    expect(touristPays(s, 'oldtown-2n', 'tourists')).toBe(1.2);
    expect(touristPays(s, 'oldtown-2n', 'families')).toBe(1);
    expect(touristPays(s, 'oldtown-0n', 'tourists')).toBe(1);
    const price = s.plots['oldtown-2n'].stand!.price;
    const sales = playDay(s, 'hot', 90).filter((e): e is Extract<SimEvent, { type: 'passerby' }> => e.type === 'passerby' && e.at === 'oldtown-2n' && e.buys);
    const tourists = sales.filter((e) => e.segment === 'tourists');
    expect(tourists.length).toBeGreaterThan(0);
    for (const e of tourists) expect(e.price).toBe(Math.round(price * 1.2 * 100) / 100);
    for (const e of sales.filter((x) => x.segment !== 'tourists')) expect(e.price).toBe(price);
    expect(s.plots['oldtown-2n'].stand!.day.revenue).toBeCloseTo(sales.reduce((a, e) => a + e.price, 0), 6);
  });

  it('Word of Mouth (Campus & Arts): local campaigns cost half', () => {
    const s = newGame(1);
    s.rank = 2;
    s.cash = 100;
    stockUp(s, LOTTIES_CORNER);
    expect(campaignCost(s, 'sandwichBoard')).toEqual({ cash: 40, samples: 0, half: false });
    fullControl(s, 'campus');
    expect(campaignCost(s, 'sandwichBoard')).toEqual({ cash: 20, samples: 0, half: true });
    expect(campaignCost(s, 'freeSamples').samples).toBe(15);
    s.cash = 25;
    expect(canRunCampaign(s, 'sandwichBoard').ok).toBe(true);
    expect(runCampaign(s, 'sandwichBoard')).toBe(true);
    expect(s.cash).toBe(5);
  });
});

describe('the stand panel\'s demand chain', () => {
  it('shows every number in the three steps', () => {
    const s = workedExample(1);
    s.forecast = { kind: 'hot', temp: 88 };
    const c = demandChain(s, LOTTIES_CORNER)!;
    expect(c.passersby).toBe(480); // 400 × 1.0 × 1.0 × 1.2 Summer × 1.0
    expect([c.traffic, c.draw, c.marketing, c.season, c.weather, c.lunch]).toEqual([400, 1, 1, 1.2, 1, 1]);
    expect([c.base, c.thirst, c.curb, c.reputation]).toEqual([0.25, 1.3, 1, 1]);
    expect(c.priceFit).toBe(1);
    expect(c.ceiling).toBe(1.57);
    expect(c.kept).toBe(1);
    expect(c.service).toBe(200);
    expect(c.demand).toBe(Math.round(expectedDemand(s, LOTTIES_CORNER).demand));
    expect(c.cups).toBe(Math.min(c.demand, c.service, c.stock));
    expect(c.binding).toBe('demand');
    s.forecast = { kind: 'scorcher', temp: 99 };
    expect(demandChain(s, LOTTIES_CORNER)!.binding).toBe('service');
    s.plots[LOTTIES_CORNER].stand!.inventory.lemons = [{ qty: 25, day: 3, unitCost: 0.1 }];
    const low = demandChain(s, LOTTIES_CORNER)!;
    expect(low.stock).toBe(50);
    expect([low.cups, low.binding]).toEqual([50, 'stock']);
    rivalStand(s, 'oldtown-0n', 'fizzco');
    expect(demandChain(s, 'oldtown-0n')!.stock).toBe(stockCups(s.plots['oldtown-0n'].stand!)); // one full stock a day
  });

  it('takes the season from the card: Honey-Ginger keeps its crowd in Winter', () => {
    const s = workedExample(1);
    s.day = 30; // Winter
    expect(demandChain(s, LOTTIES_CORNER)!.season).toBe(0.6);
    s.plots[LOTTIES_CORNER].stand!.recipe = 'honeyGinger';
    expect(demandChain(s, LOTTIES_CORNER)!.season).toBe(1);
  });

  it('names the perks at work', () => {
    const s = newGame(1);
    playerStand(s, 'oldtown-2n');
    expect(demandChain(s, LOTTIES_CORNER)!.perks).toEqual({ townFavorite: false, orchardFresh: false, powerLunch: false, touristTrap: false, majority: false });
    for (const d of ['oldtown', 'groves', 'downtown', 'boardwalk'] as DistrictId[]) fullControl(s, d);
    const corner = demandChain(s, LOTTIES_CORNER)!;
    expect(corner.perks).toEqual({ townFavorite: true, orchardFresh: true, powerLunch: false, touristTrap: true, majority: false });
    expect(corner.marketing).toBeCloseTo(1.2 + groveTraffic(s), 9); // and the Lemon Groves on Hollis's Fields, now yours
    const oldtown = demandChain(s, 'oldtown-2n')!;
    expect(oldtown.perks).toEqual({ townFavorite: true, orchardFresh: true, powerLunch: true, touristTrap: true, majority: true });
    expect(oldtown.lunch).toBeGreaterThan(1);
    expect(oldtown.curb).toBe(1.1);
  });
});

describe('saves', () => {
  it('fill the line and reprice old rival stands, idempotently', () => {
    const s = newGame(1);
    s.plots[LOTTIES_CORNER].stand!.price = 0.75;
    for (const ps of Object.values(s.plots)) if (ps.stand) { delete ps.stand.queue; if (ps.owner !== 'player') ps.stand.price = 0.68; }
    const old = JSON.parse(JSON.stringify(s));
    const m = migrateSave(old)!;
    expect(m).not.toBeNull();
    expect(m.plots[LOTTIES_CORNER].stand!.queue).toBe(0);
    expect(m.plots[LOTTIES_CORNER].stand!.price).toBe(0.75); // the player's own price stays
    expect(m.plots['oldtown-0n'].stand!.price).toBe(rivalPrice('fizzco', 2, PLOT_BY_ID['oldtown-0n']));
    m.plots['oldtown-0n'].stand!.price = 2.5; // a later price change survives another load
    migrateDemand(m);
    expect(m.plots['oldtown-0n'].stand!.price).toBe(2.5);
  });
});
