import { describe, expect, it } from 'vitest';
import {
  actOf, appealFor, boothCeiling, buySupply, calendarTraffic, maxPacks, pitcherNeeds, priceCeiling, canAssault, canFactionBuyout, canSponsor, CLOSE, costPerCup, crowdAt, eliminate, entryOf,
  eventsOf, expectedPassersby, festivalCrowd, festivalDays, festivalsOn, FESTIVALS, grantPage, hqPlot, isEventDay, isPremium, judgeMark, LOTTIES_CORNER,
  marketingMultiplier, migrateSave, migrateWorld, movePage, newGame, newStand, openStand, ownedRecipes, PAGE_HOLDERS, pageHolder, pagesInTheBugle,
  pickRecipe, PLOTS, plotBuyoutPrice, PRICE_BANDS, priceBand, RECIPE_IDS, RECIPES, recipeCost, recipeMatch, rivalReputationTarget, rivalStars, SEGMENTS, setTasteOffEntry,
  simulateRestOfDay, sleepUntilDawn, sponsorCost, sponsorFestival, sweetnessFit, TASTE_OFF, TASTE_OFF_SKILL, tasteOffResult, tasteOffToday,
  tickMinute, tillyWaits, upcomingFestivals, worldOf, yearOf, sponsorHalfPrice, underCeaseAndDesist, DISTRICTS, MARKETING_BLOCKS, bugleHeadline, frontPage,
  campaignCost, DISTRICT_CAMPAIGNS, PERKS, SPONSORSHIP,
  type DistrictId, type GameState, type RecipeId, type SegmentId, type Settings, type Sweetness,
} from './economy.ts';
import { calendarTickets, worldSheet } from '../ui/calendar.ts';
import { bookSheet, recipeRow } from '../ui/recipes.ts';
import { beginScene } from './scenes.ts';

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

/** Open and run straight to closing time (the judges taste at closing). */
function close(s: GameState): void {
  openStand(s);
  s.minute = CLOSE - 1;
  tickMinute(s);
}

/** Answer all three judges' hints exactly. */
function ace(s: GameState): void {
  const t = tasteOffToday(s)!;
  for (const j of t.judges) {
    if (j.kind === 'recipe') setTasteOffEntry(s, { recipe: SEGMENTS[j.segment].favorites.find((r) => ownedRecipes(s).includes(r))! });
    if (j.kind === 'sweet') setTasteOffEntry(s, { sweetness: j.want });
  }
  const price = t.judges.find((j) => j.kind === 'price')!;
  const top = boothCeiling(s, entryOf(s).recipe, t.district);
  const target = [0.5, 0.75, 0.95][PRICE_BANDS.indexOf((price as { band: (typeof PRICE_BANDS)[number] }).band)] * top;
  setTasteOffEntry(s, { delta: Math.round((target - entryOf(s).price) * 100) / 100 });
}

/** Answer every hint wrong: the wrong card, the far Sweetness, and over the booth's top price. */
function flub(s: GameState): void {
  const t = tasteOffToday(s)!;
  for (const j of t.judges) {
    if (j.kind === 'recipe') setTasteOffEntry(s, { recipe: ownedRecipes(s).find((r) => !SEGMENTS[j.segment].favorites.includes(r))! });
    if (j.kind === 'sweet') setTasteOffEntry(s, { sweetness: j.want === 'extra' ? 'less' : 'extra' });
  }
  setTasteOffEntry(s, { delta: 5 });
}

function withSkill<T>(skill: number, f: () => T): T {
  const saved = { ...TASTE_OFF_SKILL };
  for (const k of Object.keys(TASTE_OFF_SKILL) as (keyof typeof TASTE_OFF_SKILL)[]) TASTE_OFF_SKILL[k] = skill;
  try { return f(); } finally { Object.assign(TASTE_OFF_SKILL, saved); }
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

  it('every card pours the same stock, so switching cards wastes none (the extras are in the cost per cup)', () => {
    const st = newStand(1);
    const classic = pitcherNeeds(st);
    expect(classic).toEqual({ lemons: 5, sugar: 10, icePerCup: 3 });
    for (const id of RECIPE_IDS) { st.recipe = id; expect(pitcherNeeds(st)).toEqual(classic); }
  });

  it('the card never moves Reputation: a Classic L1 stand with no walk-aways ends 14 days at 3.0 stars or more', () => {
    for (const recipe of ['classic', 'pink'] as RecipeId[]) {
      const s = game(5);
      eventsOf(s).next = Infinity; // no random events: a Tourist Bus or a Viral Video would crowd the quiet street
      // A quiet Maple Row street, so the line never runs past anyone's patience; the Corner's table is packed away.
      const quiet = PLOTS.filter((p) => p.district === 'maple' && p.type === 'street' && !s.plots[p.id].owner).sort((a, b) => a.baseTraffic - b.baseTraffic)[0].id;
      s.plots[LOTTIES_CORNER].stand = null;
      s.plots[quiet] = { ...s.plots[quiet], owner: 'player', stand: { ...newStand(1), recipe } };
      s.selected = quiet;
      s.cash = 10_000;
      let walked = 0, sat = 0;
      for (let d = 0; d < 14; d++) {
        const st = s.plots[quiet].stand!;
        st.price = priceCeiling(s, quiet);
        openStand(s);
        while (s.phase === 'open') { // a full cooler, topped up every game hour
          if (s.minute % 60 === 0) for (const id of ['lemons', 'sugar', 'ice'] as const) buySupply(s, id, maxPacks(s, st, id), st);
          tickMinute(s);
        }
        walked += s.today.walkedPast.line + s.today.walkedPast.soldOut;
        sat += s.today.satisfaction / 14;
        s.raids = [];
        sleepUntilDawn(s);
      }
      expect(walked).toBeLessThanOrEqual(2); // one on a Scorcher's peak, at most
      expect(sat).toBeGreaterThan(0.5); // a full cup at the ceiling: the same for every card
      expect(s.reputation).toBeGreaterThanOrEqual(3);
    }
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
    // The ceiling is in cents (demand: rounded down), so 20% lands within a cent: $1.72 to $2.07.
    expect(appealFor(s, LOTTIES_CORNER, 'families').topPrice / before).toBeCloseTo(1.2, 2);
  });

  it('comes with the Blenders\' fall on every route, a bust included', () => {
    for (const how of ['hq', 'buyout', 'bankrupt'] as const) {
      const s = game();
      const st = s.plots[LOTTIES_CORNER].stand!;
      st.recipe = 'frozen';
      const before = appealFor(s, LOTTIES_CORNER, 'families').topPrice;
      eliminate(s, 'blenders', how);
      expect(ownedRecipes(s)).toContain('frozen');
      expect(appealFor(s, LOTTIES_CORNER, 'families').topPrice / before).toBeCloseTo(1.2, 2);
    }
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

  it("a page won outright plays its short scene at the next lull; a fallen rival's pages are named in their exit scene", () => {
    const s = game();
    grantPage(s, 'lavender'); // won at the Hilltop auction (src/sim/auction.ts)
    expect(s.news.at(-1)).toContain('The Lavender page comes home');
    const page = s.scenes!.queue.find((q) => q.id === 'page-lavender')!.data!;
    expect(page.lines!.map((l) => l.text)).toEqual(['Vera traded my Lavender page for harp lessons.', 'In 1980. She never could play.', 'High rollers love it. Try the Hilltop.']);
    expect(page.seconds).toBeLessThanOrEqual(20);
    expect(page.recap).toBe(s.news.at(-1)); // skipped, it leaves the page's line
    eliminate(s, 'blenders', 'buyout'); // Strawberry and Frozen come home in Brock's exit scene, not scenes of their own
    expect(s.scenes!.queue.map((q) => q.id).filter((id) => id.startsWith('page-'))).toEqual(['page-lavender']);
    expect(s.scenes!.queue.find((q) => q.id === 'exit-blenders')!.data!.lines!.at(-1)!.text).toMatch(/Strawberry.*Frozen.*come home/);
    const sb = game(2, { mode: 'sandbox' }); // Sandbox: the line, and no scene
    grantPage(sb, 'lavender');
    expect(sb.news.at(-1)).toContain('The Lavender page comes home');
    expect(sb.scenes?.queue ?? []).toEqual([]);
  });

  it('the next Bugle leads with a page that comes home; one from a rival gone bust at dawn makes that morning\'s', () => {
    const s = game();
    eliminate(s, 'coldbrew', 'buyout'); // at Morning Prep, after the paper
    expect(pagesInTheBugle(s)).toEqual([]);
    expect(bugleHeadline(s)).toEqual(["SCHOOL'S OUT!", 'Charlie opens on Maple Row']);
    dawn(s, 2);
    expect(pagesInTheBugle(s)).toEqual(['honeyGinger']);
    expect(bugleHeadline(s)).toEqual(['PAGE COMES HOME!', 'Honey-Ginger Hot Lemonade back in the book']);
    expect(frontPage(s).briefs).toContain('The Cold Brew Collective are out of business.');
    dawn(s, 3);
    expect(bugleHeadline(s)[0]).not.toMatch(/PAGE/);
    s.rivals.fizzco.cash = -1;
    s.rivals.fizzco.brokeDays = 6;
    dawn(s, 4); // the seventh dawn in the red: FizzCo goes bust before the paper prints
    expect(s.rivals.fizzco.alive).toBe(false);
    expect(pagesInTheBugle(s)).toEqual(['sparkling']);
    expect(bugleHeadline(s)).toEqual(['PAGE COMES HOME!', 'Sparkling Lemonade back in the book']);
    eliminate(s, 'blenders', 'hq'); // two pages at once
    dawn(s, 5);
    expect(bugleHeadline(s)).toEqual(['PAGES COME HOME!', 'Strawberry and Frozen back in the book']);
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
    expect(back.world!.homed).toBeUndefined(); // quietly: no headline for an old save
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
    const booked = s.today.books?.marketing ?? 0;
    expect(sponsorFestival(s, 'summerFair')).toBe(true);
    expect(s.cash).toBe(40000);
    expect(booked - s.today.books!.marketing!).toBeCloseTo(10000, 6); // the Ledger's marketing row
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

  it('half price ($1,000 a day) with Campus & Arts at Full Control (Word of Mouth)', () => {
    const s = game();
    standIn(s, 'oldtown');
    dawn(s, 10);
    s.rank = 5; s.cash = 50000;
    expect(sponsorHalfPrice(s)).toBe(false);
    const campus = PLOTS.filter((p) => p.district === 'campus' && p.type !== 'civic' && p.type !== 'hq');
    for (const p of campus.slice(1)) s.plots[p.id].owner = 'player';
    expect(sponsorHalfPrice(s)).toBe(false); // one plot short of Full Control
    s.plots[campus[0].id].owner = 'player';
    expect(sponsorHalfPrice(s)).toBe(true);
    expect(sponsorCost(s, 'summerFair')).toBe(1000 * 5);
    expect(calendarTickets(s).join('')).toContain('Sponsor $5,000');
    expect(sponsorFestival(s, 'summerFair')).toBe(true);
    expect(s.cash).toBe(45000);
  });

  it("Word of Mouth's half is one number: the sponsorship and a local campaign both read PERKS.wordOfMouth", () => {
    const s = game();
    standIn(s, 'oldtown');
    dawn(s, 10);
    for (const p of PLOTS.filter((q) => q.district === 'campus' && q.type !== 'civic' && q.type !== 'hq')) s.plots[p.id].owner = 'player';
    const was = PERKS.wordOfMouth;
    try {
      PERKS.wordOfMouth = 0.25; // a retune moves both
      expect(sponsorCost(s, 'summerFair')).toBe(SPONSORSHIP.perDay * 0.25 * 5);
      expect(campaignCost(s, 'sunny').cash).toBe(DISTRICT_CAMPAIGNS.sunny.costPerDay! * 0.25); // $300 a day
    } finally {
      PERKS.wordOfMouth = was;
    }
    expect(sponsorCost(s, 'summerFair')).toBe(1000 * 5);
  });

  it('a Cease-and-Desist in the district makes it count for nothing', () => {
    const s = game();
    const plot = standIn(s, 'oldtown');
    dawn(s, 10);
    s.rank = 5; s.cash = 50000;
    sponsorFestival(s, 'summerFair');
    const there = s.plots[plot].stand!;
    expect(calendarTraffic(s, 'player', there)).toBe(0.5);
    expect(DISTRICTS.some((d) => underCeaseAndDesist(s, d.id))).toBe(false); // none yet: FizzCo's letters start in Act 4 (schemes.ts ceaseAndDesist), so the test posts one
    const letter = (_s: GameState, d: DistrictId) => d === 'oldtown';
    MARKETING_BLOCKS.push(letter);
    try {
      expect(calendarTraffic(s, 'player', there)).toBe(0);
      const u = game();
      standIn(u, 'oldtown');
      dawn(u, 10);
      u.rank = 5; u.cash = 50000;
      expect(canSponsor(u, 'summerFair')).toEqual({ ok: false, why: 'Cease-and-Desist: your ads count for nothing in Old Town' });
    } finally { MARKETING_BLOCKS.splice(MARKETING_BLOCKS.indexOf(letter), 1); }
    expect(calendarTraffic(s, 'player', there)).toBe(0.5); // the letter runs out: the sponsorship counts again
  });
});

describe('Taste-Offs', () => {
  it('judges mark the card, the Sweetness and the price', () => {
    const e = { recipe: 'pink' as RecipeId, sweetness: 'less' as Sweetness, price: 1.5 };
    expect(judgeMark({ kind: 'recipe', segment: 'kids' }, e, 1.575)).toBe(1.2);
    expect(judgeMark({ kind: 'recipe', segment: 'office' }, e, 1.575)).toBe(1);
    expect(['less', 'classic', 'extra'].map((want) => judgeMark({ kind: 'sweet', want: want as Sweetness }, e, 1.575))).toEqual([1.1, 1, 0.85]);
    expect([0.5, 1.2, 1.5, 1.7].map((p) => priceBand(p, 1.575))).toEqual([0, 1, 2, 3]);
    expect(PRICE_BANDS.map((band) => judgeMark({ kind: 'price', band }, e, 1.575))).toEqual([0.85, 1, 1.1]);
    expect(judgeMark({ kind: 'price', band: 'extra' }, { ...e, price: 1.7 }, 1.575)).toBe(0.85); // over the top price
  });

  it('only on a fair\'s last day; Act 1 is Brock with the spec\'s three hints', () => {
    const s = game();
    dawn(s, 13);
    expect(tasteOffToday(s)).toBeUndefined();
    dawn(s, 14);
    const t = tasteOffToday(s)!;
    expect([t.fair, t.vs, t.stake]).toEqual(['summerFair', ['blenders'], 'strawberry']);
    expect(t.judges).toEqual([{ kind: 'recipe', segment: 'kids' }, { kind: 'sweet', want: 'less' }, { kind: 'price', band: 'extra' }]);
    const st = s.plots[LOTTIES_CORNER].stand!;
    expect(entryOf(s)).toEqual({ recipe: st.recipe, sweetness: st.sweetness, price: st.price });
    expect(setTasteOffEntry(s, { recipe: 'frozen' })).toBe(false); // not in the book
    setTasteOffEntry(s, { recipe: 'pink', sweetness: 'less', delta: 0.1 });
    expect(entryOf(s)).toEqual({ recipe: 'pink', sweetness: 'less', price: Math.round((st.price + 0.1) * 100) / 100 });
    dawn(s, 21);
    expect(tasteOffToday(s)!.fair).toBe('countyFair');
  });

  it('win the Summer Fair: Strawberry, a star, the prize, +20% Old Town traffic for 7 days', () => {
    const s = game(4);
    const plot = standIn(s, 'oldtown');
    dawn(s, 14);
    ace(s);
    const rep = s.reputation, cash = s.cash;
    s.scenes!.queue = []; // past Dex's arrival (the jump to Day 14 queued it)
    close(s);
    const r = tasteOffResult(s, 'summerFair', 1)!;
    expect(r.winner).toBe('player');
    expect(r.score).toBeCloseTo(1.2 * 1.1 * 1.1, 6);
    expect(ownedRecipes(s)).toContain('strawberry');
    // Act 1's climax scene waits for the morning: Brock swears revenge on 101.5, and Lottie has her page back.
    const climax = s.scenes!.queue.find((q) => q.id === 'page-strawberry')!.data!;
    expect(climax.lines!.map((l) => [l.who, l.text])).toEqual([
      ['Brock, on 101.5', "This isn't over, bro! You hear me?"], ['Lottie', 'Berries go in last, Brock. Always last.'], ['Lottie', 'Kids and tourists love it. Try the Boardwalk.'],
    ]);
    expect(s.today.books!.prizes).toBeGreaterThanOrEqual(TASTE_OFF.prize); // the Ledger's prizes row (a goal's reward may share it)
    expect(s.cash - cash).toBeGreaterThan(TASTE_OFF.prize - 100); // the prize, less the day's upkeep
    expect(s.reputation).toBeGreaterThan(rep + 0.05);
    sleepUntilDawn(s);
    expect(beginScene(s)?.id).toBe('page-strawberry'); // Act 2's first Morning Prep
    expect(calendarTraffic(s, 'player', s.plots[plot].stand!)).toBeCloseTo(0.2, 6);
    expect(calendarTraffic(s, 'player', s.plots[LOTTIES_CORNER].stand!)).toBe(0);
    dawn(s, 22);
    expect(calendarTraffic(s, 'player', s.plots[plot].stand!)).toBe(0);
  });

  it('lose it, and Strawberry waits at the Blend Shack while Brock takes the star and the prize', () => {
    const s = game(4);
    dawn(s, 14);
    flub(s);
    const brock = s.rivals.blenders.cash;
    withSkill(1, () => close(s));
    expect(tasteOffResult(s, 'summerFair')!.winner).toBe('blenders');
    expect(pageHolder(s, 'strawberry')).toBe('blenders');
    expect(s.rivals.blenders.cash).toBeGreaterThan(brock + TASTE_OFF.prize - 1000); // the prize, less a day's upkeep
    expect(rivalStars(s, 'blenders')).toBeCloseTo(3 + 0.05 * (rivalReputationTarget(s, 'blenders') - 3) + TASTE_OFF.stars, 3); // the night's drift, then the star
    expect(worldOf(s).boosts).toEqual([{ owner: 'blenders', district: 'oldtown', from: 15, to: 21 }]);
    expect(s.news.some((n) => n.includes('Blend Shack'))).toBe(true);
    expect(s.scenes!.queue.some((q) => q.id === 'page-strawberry')).toBe(false);
  });

  it('ties go to the player', () => {
    const s = game(5);
    dawn(s, 14);
    ace(s);
    withSkill(1, () => close(s)); // Brock aces it too
    const r = tasteOffResult(s, 'summerFair')!;
    expect(r.best).toBe(r.score);
    expect(r.winner).toBe('player');
  });

  it('Sandbox: any fair win brings Strawberry, then a page whose holder is off the map', () => {
    const s = game(6, { mode: 'sandbox', peaceful: true }); // Taste-Offs run even in Peaceful
    const wins: RecipeId[][] = [];
    for (const day of [14, 21, 70]) {
      dawn(s, day);
      const t = tasteOffToday(s)!;
      expect(t.stake).toBeUndefined();
      expect(t.vs.length).toBeGreaterThan(0);
      ace(s);
      withSkill(0, () => close(s));
      wins.push(ownedRecipes(s));
    }
    expect(wins[0]).toContain('strawberry');
    expect(wins[1]).toContain('lavender');
    expect(wins[2]).toHaveLength(5);
  });

  it('Endless Summer after a campaign win plays open fairs, and Tilly waits no more', () => {
    const s = game(6);
    s.endlessSince = 1;
    dawn(s, 14);
    expect(tasteOffToday(s)!.stake).toBeUndefined(); // no Act 1 stake once the story is over
    ace(s);
    withSkill(0, () => close(s));
    expect(ownedRecipes(s)).toContain('strawberry');
    s.rank = 7;
    expect(tillyWaits(s, 'hollis', 'buyout')).toBeNull();
  });

  it('with no rival stand in the district, Dot\'s Diner enters', () => {
    const s = game(7, { mode: 'sandbox' });
    for (const p of PLOTS) if (p.district === 'groves' && s.plots[p.id].owner !== 'player') s.plots[p.id].stand = null;
    dawn(s, 21);
    expect(tasteOffToday(s)!.vs).toEqual(['local']);
  });
});

describe('Tilly and the County Fair', () => {
  /** A campaign at Rank 7 with Hollis Weakened. */
  function tillyGame(seed = 8) {
    const s = game(seed);
    s.rank = 7;
    s.cash = 50_000_000;
    s.rivals.hollis.outsoldDays = 7;
    return s;
  }

  it('the Act 4 County Fair is a duel with Tilly; win it and her Fields sell at 1.5x', () => {
    const s = tillyGame();
    s.rank = 4; // Act 2: year 1's County Fair is an open fair, and beating Tilly there wins nothing from her
    dawn(s, 21);
    expect(actOf(s)).toBe(2);
    expect(tasteOffToday(s)!.stake).toBeUndefined();
    ace(s);
    withSkill(0, () => close(s));
    expect(worldOf(s).tillyWon).toBeFalsy();
    s.rank = 7; s.story!.act = 4; // Act 4 (Fields & Fizz): the campaign's act is the story's (src/sim/story.ts), not rank's
    dawn(s, 77);
    const t = tasteOffToday(s)!;
    expect([t.vs, t.stake]).toEqual([['hollis'], 'tilly']);
    const field = PLOTS.find((p) => p.type === 'field' && s.plots[p.id].owner === 'hollis')!;
    const street = PLOTS.find((p) => p.type === 'street' && p.district === 'groves' && s.plots[p.id].owner === 'hollis')!;
    const fieldBefore = plotBuyoutPrice(s, field.id), streetBefore = plotBuyoutPrice(s, street.id);
    ace(s);
    withSkill(0, () => close(s));
    expect(worldOf(s).tillyWon).toBe(true);
    expect(plotBuyoutPrice(s, field.id)).toBe(Math.round(fieldBefore * 1.5 / 2.5));
    expect(plotBuyoutPrice(s, street.id)).toBe(streetBefore);
  });

  it('the duel waits for Act 4, and comes back each County Fair until Tilly is won over', () => {
    const s = tillyGame();
    s.rank = 6; s.story!.act = 3; // still Act 3 on Day 77: an open fair, Tilly entering like anyone with a stand there
    dawn(s, 77);
    expect(actOf(s)).toBe(3);
    expect(tasteOffToday(s)!.stake).toBeUndefined();
    close(s);
    s.rank = 7; s.story!.act = 4;
    dawn(s, 133); // year 3's County Fair, now in Act 4
    expect(tasteOffToday(s)).toMatchObject({ vs: ['hollis'], stake: 'tilly' });
    flub(s);
    withSkill(1, () => close(s));
    expect(worldOf(s).tillyWon).toBeFalsy();
    expect(s.news.some((n) => n.includes('next year'))).toBe(true);
    dawn(s, 189);
    expect(tasteOffToday(s)!.stake).toBe('tilly');
  });

  it('outside the campaign, beating Tilly at any County Fair wins her over', () => {
    const s = game(9, { mode: 'sandbox' });
    dawn(s, 21);
    expect(tasteOffToday(s)!.vs).toContain('hollis');
    ace(s);
    withSkill(0, () => close(s));
    expect(worldOf(s).tillyWon).toBe(true);
  });

  it('in the campaign Tilly waits for the County Fair before selling out or falling', () => {
    const s = tillyGame();
    dawn(s, 60);
    expect(canFactionBuyout(s, 'hollis')).toEqual({ ok: false, why: "Tilly won't talk business until the County Fair" });
    expect(canAssault(s, 'hollis', ['g1'])).toEqual({ ok: false, why: "Tilly won't budge until the County Fair" });
    expect(tillyWaits(s, 'blenders', 'buyout')).toBeNull();
    dawn(s, 77);
    expect(canFactionBuyout(s, 'hollis').ok).toBe(false); // the Fair's last day: the duel comes first
    close(s);
    sleepUntilDawn(s);
    s.rivals.hollis.outsoldDays = 7;
    expect(canFactionBuyout(s, 'hollis')).toEqual({ ok: true });
    const later = tillyGame();
    dawn(later, 80); // an old save that never held the duel: the normal rules apply after the Fair
    expect(tillyWaits(later, 'hollis', 'buyout')).toBeNull();
    const sandbox = game(10, { mode: 'sandbox' });
    sandbox.rank = 7;
    expect(tillyWaits(sandbox, 'hollis', 'assault')).toBeNull();
    expect(hqPlot('hollis').district).toBe('groves');
  });
});

describe('what the player sees', () => {
  it('the Morning Prep pitchers: only the cards in the book, starred where they shine at this stand', () => {
    const s = game();
    const pitchers = () => [...recipeRow(s).matchAll(/<button class="cl-pitch"[^>]*data-id="(\w+)"[^>]*>(.*?)<\/button>/gs)];
    expect(pitchers().map((m) => m[1])).toEqual(['classic', 'pink', 'mint']);
    // Lottie's Corner is on Maple Row: Pink shines there, Classic and Mint don't.
    expect(pitchers().filter((m) => m[2].includes('cl-shine')).map((m) => m[1])).toEqual(['pink']);
    expect(recipeRow(s)).toMatch(/Pink Lemonade:[^"]*Shines: Maple Row[^"]*Here today it shines in this district/);
    grantPage(s, 'strawberry', true);
    expect(pitchers().map((m) => m[1])).toEqual(['classic', 'pink', 'mint', 'strawberry']);
  });

  it("Lottie's book: ten pages, the missing ones naming who holds them", () => {
    const s = game();
    const book = bookSheet(s);
    expect(book).toContain("Lottie's book 3/10");
    expect(book.match(/data-page="missing"/g)).toHaveLength(7);
    expect(book).toContain('Brock stakes it at the Summer Fair');
    expect(book).toContain("Taped inside Juni's register");
    expect(bookSheet(game(2, { mode: 'sandbox' }))).toContain('Win any Taste-Off for it'); // Strawberry and Lavender come from fair wins there
  });

  it("the Bugle's calendar: the week ahead with each event's days and district, today's with its length", () => {
    const s = game();
    const week = worldSheet(s, 'bugle');
    expect(week).toContain('data-testid="calendar"');
    expect(week).toContain('This week');
    expect(week).toContain('Days 4-6: Surf Contest, The Boardwalk');
    expect(week).toContain('Days 8-14: Summer Fair, Old Town');
    expect(week).toContain("Day 8: Founders' Day, Downtown");
    dawn(s, 5);
    const today = calendarTickets(s).join('');
    expect(today).toContain('data-testid="festival"');
    expect(today).toContain('The Boardwalk, day 2 of 3');
    expect(today).not.toContain('data-testid="sponsor"'); // Event Sponsorship stays hidden until Rank 5
    dawn(s, 4);
    s.world!.paper!.moves = []; // a rival's new stand would lead
    s.world!.paper!.wire = [];
    expect(bugleHeadline(s)).toEqual(['SURF CONTEST!', 'The Boardwalk, 3 days']);
    dawn(s, 3);
    expect(frontPage(s).briefs).toContain('Surf Contest opens tomorrow in The Boardwalk.');
  });

  it("the Summer Fair's front pages: the countdown, the day itself, and Brock's defeat", () => {
    const s = game(4);
    dawn(s, 12);
    // A rival's new stand is in the paper too (it would lead any other morning): the countdown leads.
    const fizz = PLOTS.find((p) => s.plots[p.id].owner === 'fizzco' && s.plots[p.id].stand)!;
    s.world!.paper!.moves = [{ rival: 'fizzco', gained: [fizz.id], lost: [] }];
    expect(bugleHeadline(s)).toEqual(['TASTE-OFF IN 2 DAYS', "Bodine 'not worried, bro'"]);
    expect(frontPage(s).briefs).toContain(`FizzCo Beverages open a stand at ${fizz.name.replace(/ lot /, ' ')}.`);
    dawn(s, 14);
    expect(bugleHeadline(s)).toEqual(['TASTE-OFF TODAY!', 'Summer Fair, Old Town']);
    const sheet = worldSheet(s, 'fair');
    for (const line of ['Brock stakes his Strawberry page', 'For the kids', 'Not too sweet', 'Worth a little extra', `$${TASTE_OFF.prize} prize`]) expect(sheet).toContain(line);
    ace(s);
    close(s);
    sleepUntilDawn(s);
    expect(bugleHeadline(s)).toEqual(['FOLDING TABLE STUNS', 'Smoothie Empire at Summer Fair']);
    dawn(s, 16);
    expect(bugleHeadline(s)[0]).not.toMatch(/TASTE-OFF|FOLDING/); // the fair is over
  });
});
