import { describe, expect, it } from 'vitest';
import {
  appealFor, costPerCup, eliminate, expectedPassersby, grantPage, isPremium, LOTTIES_CORNER, migrateSave, migrateWorld, movePage, newGame,
  newStand, ownedRecipes, PAGE_HOLDERS, pageHolder, pickRecipe, PLOTS, RECIPE_IDS, RECIPES, recipeCost, recipeMatch, SEGMENTS, sweetnessFit,
  type DistrictId, type GameState, type RecipeId, type SegmentId, type Settings, type Sweetness,
} from './economy.ts';

const SEGS = Object.keys(SEGMENTS) as SegmentId[];

/** Hand the player a Folding Table on the first street plot of a district. */
function standIn(s: GameState, district: DistrictId, recipe: RecipeId = 'classic'): string {
  const p = PLOTS.find((q) => q.district === district && q.type === 'street' && s.plots[q.id].owner !== 'player')!;
  s.plots[p.id] = { ...s.plots[p.id], owner: 'player', stand: { ...newStand(1), recipe } };
  return p.id;
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
