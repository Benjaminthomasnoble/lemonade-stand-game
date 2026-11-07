// The story's beats, day by day and act by act (src/sim/story.ts, scenes.ts, phone.ts, goals.ts): Act 1's
// onboarding (Lottie's stock, the side lot, the Steward, Benny, Skip), then each act's lessons and climaxes.
import { describe, expect, it } from 'vitest';
import {
  buildStand, buyPlot, BUILDING_VALUE_SHARE, CUPS_PER_PITCHER, expectedCups, LOTTIES_CORNER, LOTTIES_SIDE_LOT, nearbyPlots, netWorth, newGame,
  openStand, PERIMETERS, pitcherNeeds, PLOT_BY_ID, PLOTS, servingsAvailable, SIDE_LOT, simulateRestOfDay, sleepUntilDawn, START, stock,
  threatLevel, type GameState,
} from './economy.ts';
import { goalsNow } from './goals.ts';
import { beginScene, endScene } from './scenes.ts';
import { lottieStocks, storyAfterAct, storyAtDawn, taught } from './story.ts';

/** Skip straight to the next dawn (the night still runs; the business day doesn't). */
function nextDawn(s: GameState) {
  s.phase = 'report';
  sleepUntilDawn(s);
}
function playDay(s: GameState) {
  openStand(s);
  simulateRestOfDay(s);
  sleepUntilDawn(s);
}
const corner = (s: GameState) => s.plots[LOTTIES_CORNER].stand!;

describe("Lottie's stock on Days 1-2", () => {
  it('fills the table to the forecast day, free, while the Market waits for Day 3', () => {
    const s = newGame(41);
    expect(lottieStocks(s)).toBe(true);
    expect(taught(s, 'market')).toBe(false);
    const want = expectedCups(s, LOTTIES_CORNER, s.forecast);
    expect(servingsAvailable(corner(s))).toBeGreaterThanOrEqual(want); // whole pitchers, up to the day's expected sales
    expect(servingsAvailable(corner(s))).toBeLessThan(want + CUPS_PER_PITCHER);
    expect(stock(corner(s), 'ice')).toBeGreaterThan(0);
    expect(s.cash).toBe(START.cash); // her gift: your cash stays put...
    expect(s.today.supplies).toBe(0);
    const bare = newGame(41, { lessons: false });
    expect(netWorth(s)).toBe(netWorth(bare)); // ...and so does Net Worth (the stock costs you nothing)
    playDay(s); // Day 2: she stocks it again at dawn
    expect(s.day).toBe(2);
    expect(servingsAvailable(corner(s))).toBeGreaterThanOrEqual(expectedCups(s, LOTTIES_CORNER, s.forecast));
    expect(s.today.supplies).toBe(0);
    s.plots[LOTTIES_CORNER].stand!.inventory = { lemons: [], sugar: 0, ice: 0, sugarCost: 0, iceCost: 0 };
    playDay(s); // Day 3: from today you buy your own
    expect(s.day).toBe(3);
    expect(taught(s, 'market') && !lottieStocks(s)).toBe(true);
    expect(servingsAvailable(corner(s))).toBe(0);
    expect(s.news.some((n) => n.startsWith('Lottie: "From today'))).toBe(true);
  });

  it('a table built at Morning Prep gets its stock at once, but nobody refills a stand mid-day', () => {
    const s = newGame(42);
    s.cash = 2000;
    const lot = PLOTS.find((p) => p.district === 'maple' && p.type === 'street' && !s.plots[p.id].owner)!;
    expect(buyPlot(s, lot.id) && buildStand(s, lot.id)).toBe(true);
    storyAfterAct(s);
    expect(servingsAvailable(s.plots[lot.id].stand!)).toBeGreaterThan(0);
    openStand(s);
    simulateRestOfDay(s);
    const left = servingsAvailable(corner(s));
    storyAfterAct(s); // the Evening: no top-up
    expect(servingsAvailable(corner(s))).toBe(left);
  });

  it('a stand of yours that runs dry mid-day stays dry: no free refill on Days 1-2', () => {
    const s = newGame(44);
    openStand(s);
    corner(s).inventory = { lemons: [], sugar: 0, ice: 0, sugarCost: 0, iceCost: 0 };
    corner(s).pitcherCups = 0;
    simulateRestOfDay(s);
    expect(s.today.walkedPast.soldOut).toBeGreaterThan(0);
  });

  it('with the lessons off you buy your own from Day 1, and Auto-Restock works from Day 1', () => {
    const s = newGame(43, { lessons: false });
    expect(lottieStocks(s)).toBe(false);
    expect(servingsAvailable(corner(s))).toBe(0);
    corner(s).autoRestock = true;
    openStand(s);
    expect(servingsAvailable(corner(s))).toBeGreaterThan(0);
    expect(s.cash).toBeLessThan(START.cash);
  });
});

describe("Lottie's side lot (Day 3)", () => {
  it('is a fixed plot next to the Corner: $300 land and 300 passersby', () => {
    const lot = PLOT_BY_ID[LOTTIES_SIDE_LOT];
    expect(lot).toMatchObject({ name: "Lottie's Side Lot", district: 'maple', type: 'street', baseLand: SIDE_LOT.land, baseTraffic: SIDE_LOT.traffic });
    expect(nearbyPlots(PLOT_BY_ID[LOTTIES_CORNER])).toContain(lot); // right beside it
    expect(newGame(45).plots[LOTTIES_SIDE_LOT].landValue).toBe(300);
  });

  it("sells for $300 with a table on Day 3: cash becomes land, with no windfall but the table's share", () => {
    const s = newGame(46);
    s.day = 2;
    nextDawn(s);
    expect(s.plots[LOTTIES_SIDE_LOT].dibs).toMatchObject({ who: 'player', price: SIDE_LOT.price, table: true });
    expect(s.news).toContain('Lottie: "Two tables, twice the trouble. You\'ll love it."');
    s.cash = 400;
    const before = netWorth(s);
    expect(buyPlot(s, LOTTIES_SIDE_LOT)).toBe(true);
    expect(s.cash).toBe(100);
    expect(s.plots[LOTTIES_SIDE_LOT].stand?.level).toBe(1);
    // The land is worth what you paid, give or take Maple Row's first growth (the Corner's own table develops it).
    const ps = s.plots[LOTTIES_SIDE_LOT];
    expect(ps.landValue - SIDE_LOT.price).toBeLessThan(SIDE_LOT.price * 0.05);
    expect(netWorth(s) - before).toBeCloseTo(ps.landValue - SIDE_LOT.price + BUILDING_VALUE_SHARE * ps.invested, 2);
  });

  it("grows with Maple Row like any plot, and a lot you bought early gets Lottie's table anyway", () => {
    const s = newGame(47);
    for (const p of PLOTS.filter((q) => q.district === 'maple' && q.type === 'street' && !s.plots[q.id].owner && q.id !== LOTTIES_SIDE_LOT)) {
      s.plots[p.id].owner = 'player';
      s.plots[p.id].stand = structuredClone(s.plots[LOTTIES_CORNER].stand);
      s.plots[p.id].stand!.level = 4;
    }
    s.cash = 1000;
    expect(buyPlot(s, LOTTIES_SIDE_LOT)).toBe(true); // a Rank 1 buy from Day 1, at its $300 land value
    expect(s.cash).toBe(700);
    s.day = 2;
    nextDawn(s);
    const ps = s.plots[LOTTIES_SIDE_LOT];
    expect(ps.landValue).toBeGreaterThan(SIDE_LOT.land);
    expect(ps.landValue).toBeLessThanOrEqual(SIDE_LOT.land * 2);
    expect(ps.stand?.level).toBe(1); // her table goes up on it
    expect(ps.dibs).toBeUndefined();
  });
});

describe('the Day 5 Steward', () => {
  /** Day 4's stock (bought that morning, so nothing spoils overnight), then Day 5's dawn. */
  const day5 = (s: GameState, lemons = 40, sugar = 100) => {
    s.day = 4;
    corner(s).inventory = { lemons: lemons ? [{ qty: lemons, day: 4, unitCost: 0.2 }] : [], sugar, ice: 0, sugarCost: 0.03, iceCost: 0 };
    nextDawn(s);
    expect(s.day).toBe(5);
  };
  it('kicks over the table at dawn: a scene, not a raid, that spills one pitcher', () => {
    const s = newGame(48);
    const st = corner(s);
    const lemons = 40, sugar = 100;
    const rep = s.reputation, threat = threatLevel(s), battles = s.battles.length;
    day5(s);
    expect(s.scenes!.queue.map((q) => q.id)).toContain('steward');
    const n = pitcherNeeds(st);
    expect(stock(st, 'lemons')).toBe(lemons - n.lemons); // 10 cups' worth: Classic's 5 lemons and 10 scoops
    expect(st.inventory.sugar).toBe(sugar - n.sugar);
    expect(s.battles.length).toBe(battles); // no fight...
    expect(s.reputation).toBe(rep); // ...no Reputation or Threat change...
    expect(threatLevel(s)).toBe(threat);
    expect(s.raids.some((r) => s.plots[r.target].owner === 'player')).toBe(false); // ...and no raids on you yet
    expect(goalsNow(s)[1].text).toBe('Fence the Corner');
    storyAtDawn(s); // once a run
    expect(stock(st, 'lemons')).toBe(lemons - n.lemons);
    const sc = beginScene(s)!;
    expect(sc.id).toBe('steward');
    endScene(s, true);
    expect(s.news).toContain('A Sourwood Steward knocked over the table "as a reminder": one pitcher spilled. Lottie wants a fence.');
  });

  it('spills what little is left, steps over a fence, and never comes in Sandbox', () => {
    const s = newGame(49);
    s.plots[LOTTIES_CORNER].defense = { tier: 1, fenceHp: PERIMETERS[0].hp, gadgets: [] };
    day5(s, 2, 0);
    expect(stock(corner(s), 'lemons')).toBe(0);
    expect(s.scenes!.queue.map((q) => q.id)).toContain('steward');
    const bare = newGame(51);
    day5(bare, 0, 0); // nothing on the table: the scene plays, and its recap spills nothing
    expect(bare.scenes!.queue.find((q) => q.id === 'steward')?.data?.recap).toBe('A Sourwood Steward knocked over the table "as a reminder". Lottie wants a fence.');
    const sb = newGame(50, { mode: 'sandbox' });
    day5(sb);
    expect(stock(corner(sb), 'lemons')).toBe(40);
    expect(sb.scenes!.queue).toHaveLength(0);
  });
});
