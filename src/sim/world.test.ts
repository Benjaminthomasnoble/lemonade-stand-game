import { describe, expect, it } from 'vitest';
import {
  appealFor, calendarTraffic, canSponsor, costPerCup, crowdAt, eliminate, expectedPassersby, festivalCrowd, festivalDays, festivalsOn,
  FESTIVALS, grantPage, isEventDay, isPremium, LOTTIES_CORNER, marketingMultiplier, migrateSave, migrateWorld, movePage, newGame, newStand,
  openStand, ownedRecipes, PAGE_HOLDERS, pageHolder, pickRecipe, PLOTS, RECIPE_IDS, RECIPES, recipeCost, recipeMatch, SEGMENTS,
  simulateRestOfDay, sleepUntilDawn, sponsorCost, sponsorFestival, sweetnessFit, upcomingFestivals, yearOf,
  type DistrictId, type GameState, type RecipeId, type SegmentId, type Settings, type Sweetness,
} from './economy.ts';

const SEGS = Object.keys(SEGMENTS) as SegmentId[];

/** Hand the player a Folding Table on the first street plot of a district. */
function standIn(s: GameState, district: DistrictId, recipe: RecipeId = 'classic'): string {
  const p = PLOTS.find((q) => q.district === district && q.type === 'street' && s.plots[q.id].owner !== 'player')!;
  s.plots[p.id] = { ...s.plots[p.id], owner: 'player', stand: { ...newStand(1), recipe } };
  return p.id;
}

/** Jump to a day's Morning Prep through the real dawn. */
function dawn(s: GameState, day: number): void {
  s.day = day - 1;
  s.phase = 'report';
  s.raids = [];
  sleepUntilDawn(s);
}

const game = (seed = 1, settings: Partial<Settings> = {}) => newGame(seed, settings);

describe('recipe cards', () => {
  it('ten cards at the spec costs per cup; Sweetness never moves the cost', () => {
    const s = game();
    s.market = { lemons: 0.2, sugar: 0.03, ice: 0.01 };
    const want: Record<RecipeId, number> = {
      classic: 0.21, pink: 0.24, mint: 0.25, strawberry: 0.32, frozen: 0.3, honeyGinger: 0.3, sparkling: 0.32, lavender: 0.4, halfAndHalf: 0.25, secretReserve: 0.45,
    };
    expect(RECIPE_IDS).toHaveLength(10);
    for (const id of RECIPE_IDS) expect(recipeCost(s, id)).toBeCloseTo(want[id], 6);
    const st = s.plots[LOTTIES_CORNER].stand!;
    for (const v of ['less', 'classic', 'extra'] as Sweetness[]) { st.sweetness = v; expect(costPerCup(s, st)).toBeCloseTo(0.21, 6); }
    // Appendix B: lemons +20% and sugar -10% put Pink at about $0.26.
    s.market = { lemons: 0.24, sugar: 0.027, ice: 0.01 };
    expect(recipeCost(s, 'pink')).toBeCloseTo(0.257, 6);
  });

  it('price bonuses, and premium means beyond the starting three and Strawberry', () => {
    const bonus = Object.fromEntries(RECIPE_IDS.map((id) => [id, RECIPES[id].priceBonus]));
    expect(bonus).toEqual({ classic: 0, pink: 0.05, mint: 0.05, strawberry: 0.1, frozen: 0.15, honeyGinger: 0.1, sparkling: 0.15, lavender: 0.25, halfAndHalf: 0.1, secretReserve: 0.3 });
    expect(RECIPE_IDS.filter(isPremium)).toEqual(['frozen', 'honeyGinger', 'sparkling', 'lavender', 'halfAndHalf', 'secretReserve']);
  });

  it('Honey-Ginger is served hot: no ice to buy, none to run out of', () => {
    expect(RECIPES.honeyGinger.icePerCup).toBe(0);
    expect(RECIPES.frozen.icePerCup).toBe(6);
  });
});

describe('where a card shines', () => {
  it('Pink shines for every customer at Lottie\'s Corner; Classic shines nowhere', () => {
    const s = game();
    const st = s.plots[LOTTIES_CORNER].stand!;
    st.recipe = 'pink';
    for (const seg of SEGS) expect(appealFor(s, LOTTIES_CORNER, seg).recipeMatch).toBe(1.2);
    st.recipe = 'classic';
    for (const seg of SEGS) expect(appealFor(s, LOTTIES_CORNER, seg).recipeMatch).toBe(1);
    expect(recipeMatch(s, LOTTIES_CORNER, 'mint')).toBe(1);
    expect(recipeMatch(s, standIn(s, 'campus'), 'mint')).toBe(1.2);
    expect(recipeMatch(s, standIn(s, 'boardwalk'), 'mint')).toBe(1.2);
  });

  it('districts, seasons and Heat-Wave cards, never stacking', () => {
    const s = game();
    const beach = standIn(s, 'boardwalk'), office = standIn(s, 'downtown'), groves = standIn(s, 'groves');
    s.day = 3; // summer
    expect(recipeMatch(s, beach, 'frozen')).toBe(1.2); // its district and its season: still 1.2
    expect(recipeMatch(s, LOTTIES_CORNER, 'frozen')).toBe(1.2);
    expect(recipeMatch(s, office, 'halfAndHalf')).toBe(1.2);
    expect(recipeMatch(s, office, 'honeyGinger')).toBe(1);
    s.day = 17; // fall
    expect(recipeMatch(s, LOTTIES_CORNER, 'frozen')).toBe(1);
    expect(recipeMatch(s, beach, 'frozen')).toBe(1.2);
    expect(recipeMatch(s, office, 'halfAndHalf')).toBe(1);
    expect(recipeMatch(s, groves, 'halfAndHalf')).toBe(1.2);
    expect(recipeMatch(s, office, 'sparkling')).toBe(1.2);
    s.day = 33; // winter
    expect(recipeMatch(s, office, 'honeyGinger')).toBe(1.2);
    expect(recipeMatch(s, standIn(s, 'hilltop'), 'lavender')).toBe(1.2);
    for (const id of [beach, office, LOTTIES_CORNER]) expect(recipeMatch(s, id, 'secretReserve')).toBe(1.3);
  });

  it('rival stands take no recipe or Sweetness effects', () => {
    const s = game();
    const rival = PLOTS.find((p) => s.plots[p.id].owner === 'blenders' && s.plots[p.id].stand)!;
    s.plots[rival.id].stand!.sweetness = 'extra';
    const a = appealFor(s, rival.id, 'kids');
    expect([a.recipeMatch, a.sweetMatch]).toEqual([1, 1]);
  });

  it('a festival crowd makes its favorites shine there', () => {
    const s = game();
    const plot = standIn(s, 'oldtown', 'classic');
    s.day = 7;
    expect(recipeMatch(s, plot)).toBe(1);
    s.day = 10; // the Summer Fair fills Old Town with families, who love Pink and Classic
    expect(recipeMatch(s, plot)).toBe(1.2);
    expect(recipeMatch(s, plot, 'mint')).toBe(1);
  });
});

describe('the Sweetness dial', () => {
  it('Classic is neutral; Extra +10% kids, -10% seniors and office workers; Less the reverse', () => {
    for (const seg of SEGS) expect(sweetnessFit(seg, 'classic')).toBe(1);
    const extra = Object.fromEntries(SEGS.map((g) => [g, sweetnessFit(g, 'extra')]));
    const less = Object.fromEntries(SEGS.map((g) => [g, sweetnessFit(g, 'less')]));
    expect(extra).toEqual({ kids: 1.1, families: 1, seniors: 0.9, students: 1, office: 0.9, tourists: 1, workers: 1, highRollers: 1 });
    expect(less).toEqual({ kids: 0.9, families: 1, seniors: 1.1, students: 1, office: 1.1, tourists: 1, workers: 1, highRollers: 1 });
    const s = game();
    s.plots[LOTTIES_CORNER].stand!.sweetness = 'extra';
    expect(appealFor(s, LOTTIES_CORNER, 'kids').sweetMatch).toBe(1.1);
    expect(appealFor(s, LOTTIES_CORNER, 'seniors').sweetMatch).toBe(0.9);
  });
});

describe('segment favorites', () => {
  it('match the spec table', () => {
    expect(Object.fromEntries(SEGS.map((g) => [g, SEGMENTS[g].favorites]))).toEqual({
      kids: ['pink', 'strawberry'], families: ['pink', 'classic'], seniors: ['honeyGinger', 'classic'], students: ['mint', 'frozen'],
      office: ['sparkling'], tourists: ['strawberry', 'frozen'], workers: ['halfAndHalf'], highRollers: ['lavender', 'secretReserve'],
    });
  });
});

describe('Honey-Ginger in Winter', () => {
  it('takes no Winter penalty, on the Boardwalk too', () => {
    const s = game();
    const beach = standIn(s, 'boardwalk');
    const w = { kind: 'warm' as const, temp: 75 };
    s.day = 30;
    const corner = s.plots[LOTTIES_CORNER].stand!;
    const classic = expectedPassersby(s, LOTTIES_CORNER, w), beachClassic = expectedPassersby(s, beach, w);
    corner.recipe = 'honeyGinger';
    s.plots[beach].stand!.recipe = 'honeyGinger';
    expect(expectedPassersby(s, LOTTIES_CORNER, w) / classic).toBeCloseTo(1 / 0.6, 6);
    expect(expectedPassersby(s, beach, w) / beachClassic).toBeCloseTo(1 / 0.4, 6);
    s.day = 3; // summer: no difference
    const summer = expectedPassersby(s, LOTTIES_CORNER, w);
    corner.recipe = 'classic';
    expect(expectedPassersby(s, LOTTIES_CORNER, w)).toBeCloseTo(summer, 6);
  });
});

describe('the Blender Bar', () => {
  it('raises Frozen\'s top price 20% once the Blend Shack is yours', () => {
    const s = game();
    const st = s.plots[LOTTIES_CORNER].stand!;
    st.recipe = 'frozen';
    const before = appealFor(s, LOTTIES_CORNER, 'families').topPrice;
    st.recipe = 'classic';
    const classic = appealFor(s, LOTTIES_CORNER, 'families').topPrice;
    eliminate(s, 'blenders', 'hq');
    expect(appealFor(s, LOTTIES_CORNER, 'families').topPrice).toBeCloseTo(classic, 6);
    st.recipe = 'frozen';
    expect(appealFor(s, LOTTIES_CORNER, 'families').topPrice / before).toBeCloseTo(1.2, 6);
  });
});

describe("Lottie's recipe book", () => {
  it('starts with Classic, Pink and Mint; the rest name their holders', () => {
    const s = game();
    expect(ownedRecipes(s)).toEqual(['classic', 'pink', 'mint']);
    expect(Object.fromEntries(RECIPE_IDS.map((id) => [id, pageHolder(s, id)]))).toEqual({
      classic: null, pink: null, mint: null, strawberry: 'blenders', frozen: 'blenders', honeyGinger: 'coldbrew', sparkling: 'fizzco',
      lavender: 'harpTeacher', halfAndHalf: 'hollis', secretReserve: 'sourwood',
    });
    const st = s.plots[LOTTIES_CORNER].stand!;
    expect(pickRecipe(s, st, 'frozen')).toBe(false);
    expect(st.recipe).toBe('classic');
    expect(pickRecipe(s, st, 'mint')).toBe(true);
    expect(st.recipe).toBe('mint');
  });

  it('a rival out of the game, by any route, hands its pages back', () => {
    const routes = { blenders: 'hq', coldbrew: 'buyout', hollis: 'bankrupt', fizzco: 'buyout', sourwood: 'hq' } as const;
    const s = game();
    for (const [id, how] of Object.entries(routes) as [keyof typeof routes, (typeof routes)[keyof typeof routes]][]) {
      s.news.length = 0;
      eliminate(s, id, how);
      for (const r of RECIPE_IDS.filter((r) => PAGE_HOLDERS[r] === id)) expect(ownedRecipes(s)).toContain(r);
      expect(s.news.some((n) => /comes home|hands over|sealed/.test(n))).toBe(true);
    }
    expect(ownedRecipes(s)).toHaveLength(9);
    expect(pageHolder(s, 'lavender')).toBe('harpTeacher');
  });

  it('an outbid Lavender moves to the winner\'s HQ and comes home when it falls', () => {
    const s = game();
    movePage(s, 'lavender', 'fizzco');
    expect(pageHolder(s, 'lavender')).toBe('fizzco');
    eliminate(s, 'fizzco', 'buyout');
    expect(ownedRecipes(s)).toContain('lavender');
    expect(grantPage(s, 'lavender')).toBe(false); // idempotent
  });

  it('old saves get the book, quietly recover pages of fallen rivals, and migrate idempotently', () => {
    const s = game();
    eliminate(s, 'coldbrew', 'buyout');
    const old = JSON.parse(JSON.stringify(s)) as GameState;
    delete old.world;
    old.news = [];
    const back = migrateSave(old)!;
    expect(back).not.toBeNull();
    expect(ownedRecipes(back)).toEqual(['classic', 'pink', 'mint', 'honeyGinger']);
    expect(back.news).toEqual([]);
    const once = JSON.stringify(back);
    migrateWorld(back);
    expect(JSON.stringify(back)).toBe(once);
  });
});

describe('the calendar', () => {
  it('repeats every 56 days', () => {
    expect([1, 56, 57, 113].map(yearOf)).toEqual([1, 1, 2, 3]);
    expect([1, 2, 3].map((y) => festivalDays('summerFair', y))).toEqual([{ from: 8, to: 14 }, { from: 64, to: 70 }, { from: 120, to: 126 }]);
    expect([1, 2].map((y) => festivalDays('countyFair', y))).toEqual([{ from: 15, to: 21 }, { from: 71, to: 77 }]);
    expect(festivalDays('foundersDay', 3)).toEqual({ from: 120, to: 120 });
    expect(festivalsOn(8)).toEqual(expect.arrayContaining(['summerFair', 'foundersDay']));
    expect(festivalsOn(4)).toContain('surfContest');
    const s = game();
    expect(isEventDay(s, 'electionDay', 54)).toBe(true);
    expect(isEventDay(s, 'electionDay', 55)).toBe(false);
    expect(upcomingFestivals(s)[0]).toEqual({ id: 'surfContest', from: 4, to: 6 });
    for (const f of Object.values(FESTIVALS)) expect(f.from >= 1 && f.to <= 14 && f.from <= f.to).toBe(true);
  });

  it('festivals fill their district with their crowd, half the passersby', () => {
    const s = game();
    expect([10, 7].map((d) => { s.day = d; return crowdAt(s, 'oldtown'); })).toEqual(['families', undefined]);
    s.day = 24; expect(crowdAt(s, 'campus')).toBe('students'); // Homecoming
    s.day = 49; expect(crowdAt(s, 'boardwalk')).toBe('students'); // joggers at the Spring Marathon
    s.day = 26; expect(crowdAt(s, 'harbor')).toBe('workers');
    s.day = 10;
    const rng = { seed: 7 };
    let n = 0;
    for (let i = 0; i < 4000; i++) if (festivalCrowd(s, rng, 'oldtown')) n++;
    expect(n / 4000).toBeGreaterThan(0.45);
    expect(n / 4000).toBeLessThan(0.55);
    expect(festivalCrowd(s, rng, 'maple')).toBeUndefined();
  });

  it('a festival shifts who walks past an Old Town stand', () => {
    const families = (day: number) => {
      const s = game(3);
      const plot = standIn(s, 'oldtown');
      dawn(s, day);
      openStand(s);
      const walkers = simulateRestOfDay(s).filter((e) => e.type === 'passerby' && e.plot === plot) as { segment: SegmentId }[];
      return walkers.filter((e) => e.segment === 'families').length / walkers.length;
    };
    expect(families(10)).toBeGreaterThan(families(6) + 0.2);
  });
});

describe('Event Sponsorship', () => {
  it('Rank 5, while the festival runs, $2,000 a day left, +50% traffic for your stands there', () => {
    const s = game();
    const plot = standIn(s, 'oldtown');
    dawn(s, 10);
    expect(canSponsor(s, 'summerFair')).toEqual({ ok: false, why: 'Needs Rank 5, District Big Shot' });
    s.rank = 5;
    s.cash = 50000;
    expect(canSponsor(s, 'surfContest').ok).toBe(false); // not running today
    expect(sponsorCost(s, 'summerFair')).toBe(2000 * 5);
    const corner = s.plots[LOTTIES_CORNER].stand!, there = s.plots[plot].stand!;
    const before = marketingMultiplier(s, 'player', there);
    expect(sponsorFestival(s, 'summerFair')).toBe(true);
    expect(s.cash).toBe(40000);
    expect(s.today.supplies).toBe(10000);
    expect(marketingMultiplier(s, 'player', there) - before).toBeCloseTo(0.5, 6);
    expect(calendarTraffic(s, 'player', corner)).toBe(0); // Maple Row isn't the festival's district
    expect(canSponsor(s, 'summerFair')).toEqual({ ok: false, why: 'Sponsored' });
    dawn(s, 15);
    expect(calendarTraffic(s, 'player', there)).toBe(0);
    const t = game();
    t.rank = 5; t.cash = 50000;
    dawn(t, 10);
    expect(canSponsor(t, 'summerFair').ok).toBe(false); // no stand in Old Town
  });
});
