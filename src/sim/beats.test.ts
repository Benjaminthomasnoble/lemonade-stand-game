// The story's beats, day by day and act by act (src/sim/story.ts, scenes.ts, phone.ts, goals.ts): Act 1's
// onboarding (Lottie's stock, the side lot, the Steward, Benny, Skip), then each act's lessons and climaxes.
import { describe, expect, it } from 'vitest';
import {
  BRAND_TIERS, buildClubhouse, buildStand, buyBrand, buyPlot, BUILDING_VALUE_SHARE, CAMPAIGNS, CUPS_PER_PITCHER, expectedCups, isWeakened,
  LOTTIES_CORNER, LOTTIES_SIDE_LOT, nearbyPlots, netWorth, newGame, openStand, PERIMETERS, pitcherNeeds, PLOT_BY_ID, plotPrice, PLOTS,
  seasonOf, servingsAvailable, SIDE_LOT, simulateRestOfDay, sleepUntilDawn, START, stock, threatLevel, type BattleReport, type CampaignId,
  type GameState, type Guard,
} from './economy.ts';
import { goalsNow } from './goals.ts';
import { beginScene, endScene, migrateScenes, playScene, sceneDef, sceneReady, SPEAKERS } from './scenes.ts';
import { bennyPitch, lottieStocks, migrateStory, storyAfterAct, storyAtDawn, taught } from './story.ts';

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

describe('Day 4: Lottie nudges the Wooden Stand', () => {
  const dawnOf = (s: GameState, day: number) => { s.day = day - 1; nextDawn(s); expect(s.day).toBe(day); };
  const nudge = (s: GameState) => s.news.find((n) => n.startsWith('Lottie: "Time that table grew up.'));
  it("says what it does and costs, from the level table, unless you've built one", () => {
    const s = newGame(60);
    dawnOf(s, 4);
    expect(nudge(s)).toBe('Lottie: "Time that table grew up. A Wooden Stand draws 1.5× the walkers and pours 2.5× as fast: $400, back in 2-4 days."');
    expect(goalsNow(s)[1].text).toBe('Build the Wooden Stand');
    const built = newGame(61);
    corner(built).level = 2; // a curious player tapped the table early
    dawnOf(built, 4);
    expect(nudge(built)).toBeUndefined();
    const off = newGame(62, { lessons: false });
    dawnOf(off, 4);
    expect(nudge(off)).toBeUndefined();
  });
});

describe('Benny Buzz and the first sign (Day 7)', () => {
  const day7 = (s: GameState) => { s.day = 6; nextDawn(s); expect(s.day).toBe(7); };
  it('pitches it at dawn, and buying it brings him to paint it (his scene, staged by speaker)', () => {
    const s = newGame(63);
    s.scenes!.seen.push('opening', 'steward', 'dex');
    day7(s);
    expect(s.news).toContain(`Benny Buzz: "You're not selling lemonade. You're selling sunshine in a cup! One sign, $100!"`);
    expect(goalsNow(s).map((g) => g.text)).toContain('Paint your first sign');
    s.cash = 500;
    expect(buyBrand(s)).toBe(true);
    storyAfterAct(s);
    expect(goalsNow(s).map((g) => g.text)).not.toContain('Paint your first sign');
    const sc = beginScene(s)!;
    expect(sc).toMatchObject({ id: 'benny', speaker: 'benny' });
    expect(sc.plot).toBeUndefined(); // at the Corner
    expect(sc.lines.filter((l) => l.who !== 'Lottie').every((l) => l.who === SPEAKERS.benny)).toBe(true);
    expect(sc.lines[0].text).toBe(bennyPitch(1)); // his signature line
    endScene(s, true);
    expect(s.news).toContain('Benny Buzz painted your first sign: +5% foot traffic at every stand.');
    storyAfterAct(s);
    expect(s.scenes!.queue).toHaveLength(0); // once a run
  });

  it("pitches every brand tier and campaign in a slogan, and stays out of Sandbox's scenes", () => {
    for (const t of BRAND_TIERS) expect(bennyPitch(t.tier)).toMatch(/!$/);
    for (const id of Object.keys(CAMPAIGNS) as CampaignId[]) expect(bennyPitch(id)).toMatch(/!$/);
    const sb = newGame(64, { mode: 'sandbox' });
    day7(sb);
    expect(sb.news.some((n) => n.startsWith('Benny Buzz:'))).toBe(true); // the lesson still comes
    sb.cash = 500;
    buyBrand(sb);
    storyAfterAct(sb);
    expect(sb.scenes!.queue).toHaveLength(0);
  });

  it("doesn't paint a sign an older run put up long ago", () => {
    const s = newGame(65);
    s.day = 30;
    s.brandTier = 2;
    delete s.scenes;
    migrateStory(s);
    storyAfterAct(s);
    expect(s.scenes!.queue).toHaveLength(0);
    expect(s.scenes!.seen).toContain('benny');
  });
});

describe("Week 2: Skip Larkin's Old Town corner", () => {
  const week2 = (s: GameState, rank = 2) => { s.rank = rank; s.day = 7; nextDawn(s); expect(s.day).toBe(8); };
  const skipQueued = (s: GameState) => s.scenes!.queue.find((q) => q.id === 'skip');
  it('stands Skip on the cheapest open Old Town street plot, with its price, and points the feed there', () => {
    const s = newGame(66);
    s.scenes!.seen.push('opening', 'steward', 'dex', 'benny');
    week2(s);
    const q = skipQueued(s)!;
    const lot = PLOT_BY_ID[q.data!.plot!];
    expect(lot).toMatchObject({ district: 'oldtown', type: 'street' });
    expect(s.plots[lot.id].owner).toBeFalsy();
    const open = PLOTS.filter((p) => p.district === 'oldtown' && p.type === 'street' && !s.plots[p.id].owner);
    expect(Math.min(...open.map((p) => plotPrice(s, p.id)))).toBe(plotPrice(s, lot.id));
    const price = `$${plotPrice(s, lot.id).toLocaleString('en-US')}`;
    expect(q.data!.lines![1].text).toContain(price);
    expect(s.alerts?.some((a) => a.plot === lot.id && a.text.startsWith('Skip:'))).toBe(true);
    expect(goalsNow(s).map((g) => g.text)).toContain('Open a stand in Old Town');
    expect(taught(s, 'land')).toBe(true);
    const sc = beginScene(s)!;
    expect(sc).toMatchObject({ id: 'skip', speaker: 'skip', plot: lot.id }); // the world stages him at that plot
    expect(sc.recap).toContain(price);
  });

  it('waits for Rank 2, and never comes for a player already in Old Town, after Act 1 or outside the campaign', () => {
    const early = newGame(67);
    week2(early, 1);
    expect(skipQueued(early)).toBeUndefined();
    early.rank = 2;
    nextDawn(early);
    expect(skipQueued(early)).toBeDefined();
    const owner = newGame(68);
    const ot = PLOTS.find((p) => p.district === 'oldtown' && p.type === 'street' && !owner.plots[p.id].owner)!;
    owner.plots[ot.id].owner = 'player';
    week2(owner);
    expect(skipQueued(owner)).toBeUndefined();
    const late = newGame(69);
    late.story!.act = 2;
    week2(late);
    expect(skipQueued(late)).toBeUndefined();
    const sb = newGame(70, { mode: 'sandbox' });
    week2(sb);
    expect(sb.scenes!.queue).toHaveLength(0);
  });
});

describe("Day 1's opening scene", () => {
  it('opens the campaign at the first Morning Prep: the table, the pitcher, three pages and a spare', () => {
    const s = newGame(71);
    expect(sceneReady(s)).toBe(true);
    const sc = beginScene(s)!;
    expect(sc.id).toBe('opening');
    expect(sc.world).toBeUndefined(); // captions, with Lottie saying her lines at the Corner
    expect(sc.lines.some((l) => l.text === 'When life gives you lemons, you take the whole town.')).toBe(true);
    expect(sc.replies).toContain('Okay, Grandma. One town, coming up.');
    endScene(s, true);
    expect(s.news.at(-1)).toBe('Lottie handed you her folding table, her pitcher and her 3 recipe pages: Classic, Pink and Mint.');
    expect(goalsNow(s)[0].text).toBe('Sell out your first pitcher'); // it ends on the pricing lesson
    expect(newGame(72, { mode: 'sandbox' }).scenes!.queue).toHaveLength(0);
  });

  it('plays on Day 1 or not at all: a run moved on from Day 1 drops it, unplayed and without a recap', () => {
    const s = newGame(73);
    s.day = 12; // e.g. an older save rebuilt from a fresh run (src/sim/legacy.ts)
    expect(sceneReady(s)).toBe(false);
    expect(beginScene(s)).toBeNull();
    migrateScenes(s);
    expect(s.scenes!.queue).toHaveLength(0);
    expect(s.scenes!.seen).toContain('opening');
    expect(s.news).not.toContain('Lottie handed you her folding table, her pitcher and her 3 recipe pages: Classic, Pink and Mint.');
    expect(playScene(s, 'opening')).toBe(false);
  });
});

describe('townsfolk scenes, staged by speaker', () => {
  it("let any lane queue a speaker's scene at a plot, and keep its speaker, plot and lines", () => {
    const s = newGame(74);
    s.scenes!.queue = []; // past the opening
    const lines = [{ who: SPEAKERS.budd, text: "I'm not mad. I'm writing you a Citation. Is that Mint?", at: 3 }];
    expect(playScene(s, 'citation-12', { speaker: 'budd', plot: LOTTIES_SIDE_LOT, lines, recap: 'Sheriff Budd wrote you a Citation.', seconds: 9 })).toBe(true);
    expect(beginScene(s)).toMatchObject({ id: 'citation-12', speaker: 'budd', plot: LOTTIES_SIDE_LOT, lines, seconds: 9 });
    expect(sceneDef('budd')).toMatchObject({ speaker: 'budd' }); // ready-made: the first Citation...
    expect(sceneDef('fontaine')).toMatchObject({ speaker: 'fontaine' }); // ...and Vera's fine from Town Hall
  });
});

/** A raid of yours on a Blenders stand, as the battle log keeps it. */
function raidOn(s: GameState, objective: 'smash' | 'shakedown', target: string, won = true): BattleReport {
  return {
    day: s.day, attacker: 'player', defender: 'blenders', target, objective, outcome: won ? (objective === 'smash' ? 'smashed' : 'robbed') : 'repelled',
    loot: 0, attackers: [], defenders: [], perimeter: 0, standLevel: 1, events: [], duration: 0, koed: [], fled: [],
  };
}
/** Brock's first raid on you (the tutorial raid), repelled. */
const tutorialRaid = (s: GameState): BattleReport => ({ ...raidOn(s, 'smash', LOTTIES_CORNER, false), attacker: 'blenders', defender: 'player' });
/** A crew of n, Dex first. */
const crew = (n: number, weapon: Guard['weapon'] = 'fists'): Guard[] =>
  Array.from({ length: n }, (_, i) => ({ id: `g${i}`, name: i ? `Guard ${i}` : 'Dex Moody', trait: 'Loyal', level: 1, xp: 0, weapon, gear: 'none', post: null, outUntil: 0, fee: 0 }));

describe('Act 2: Dex pushes for a Clubhouse, then the payback', () => {
  /** Day 15's dawn: the Summer Fair is behind you, and Act 2 begins. */
  const act2 = (seed: number) => {
    const s = newGame(seed);
    s.day = 14;
    nextDawn(s);
    expect(s.story!.act).toBe(2);
    return s;
  };
  const medium = (s: GameState) => { storyAfterAct(s); return goalsNow(s)[1]; };
  const blenderStands = (s: GameState) => PLOTS.filter((p) => s.plots[p.id].owner === 'blenders' && s.plots[p.id].stand).map((p) => p.id);

  it("Dex asks on Act 2's first morning; a Clubhouse and a squad of 5 are the story goals, in order", () => {
    const s = act2(80);
    expect(s.news).toContain('Dex: "The shed sleeps one, Miss Lottie. A Clubhouse sleeps six. Just saying."');
    expect(medium(s)).toMatchObject({ text: 'Build Dex a Clubhouse', story: true, done: false });
    s.cash = 5000;
    s.rank = Math.max(s.rank, 3);
    expect(buildClubhouse(s)).toBe(true);
    expect(medium(s)).toMatchObject({ text: 'Hire a squad of 5', story: true });
    s.guards = crew(4);
    expect(medium(s).text).toBe('Hire a squad of 5');
    s.guards = crew(5);
    expect(medium(s).text).not.toBe('Hire a squad of 5');
    const built = newGame(81); // a run that already has its Clubhouse hears no push
    built.clubhouse = 1;
    built.day = 14;
    nextDawn(built);
    expect(built.story!.act).toBe(2);
    expect(built.news.some((n) => n.startsWith('Dex: "The shed'))).toBe(false);
    expect(goalsNow(newGame(82, { mode: 'sandbox' })).some((g) => g.text === 'Build Dex a Clubhouse')).toBe(false);
  });

  it('after Brock’s first raid: clubs for Dex, a Shakedown on one Blenders stand, a Smash on another', () => {
    const s = act2(83);
    s.clubhouse = 1;
    s.guards = crew(5);
    s.battles = [];
    expect(medium(s).text).not.toBe('Buy clubs for Dex'); // not before the first raid on you
    s.battles.unshift(tutorialRaid(s));
    expect(medium(s).text).toBe('Buy clubs for Dex');
    s.guards[0].weapon = 'clubs';
    expect(medium(s).text).toBe('Shake down a Blenders stand');
    const [a, b] = blenderStands(s);
    s.battles.unshift(raidOn(s, 'shakedown', a, false)); // a bounced raid doesn't count
    expect(medium(s).text).toBe('Shake down a Blenders stand');
    s.battles.unshift(raidOn(s, 'shakedown', a));
    expect(medium(s).text).toBe('Smash another Blenders stand');
    s.battles.unshift(raidOn(s, 'smash', a)); // the same stand isn't "another"
    expect(medium(s).text).toBe('Smash another Blenders stand');
    s.battles.unshift(raidOn(s, 'smash', b));
    expect(medium(s).text).not.toMatch(/Blenders stand|clubs/);
    expect(s.story!.payback).toEqual({ shakedown: a, smash: b });
    for (let i = 0; i < 6; i++) s.battles.unshift(tutorialRaid(s)); // the log keeps 6; the story remembers
    s.battles.length = 6;
    expect(goalsNow(s).some((g) => /Blenders stand/.test(g.text))).toBe(false);
  });

  it('winter empties the Boardwalk: Lottie says so, and getting the Blenders Weakened is the goal', () => {
    const s = act2(84);
    s.clubhouse = 1;
    s.guards = crew(5, 'clubs');
    s.story!.payback = { shakedown: 'x', smash: 'y' };
    s.day = 28;
    nextDawn(s);
    expect(seasonOf(s.day)).toBe('winter');
    expect(s.news).toContain('Lottie: "Nobody buys a smoothie in sleet."');
    expect(medium(s)).toMatchObject({ text: 'Get the Blenders Weakened', story: true, done: false });
    s.rivals.blenders.outsoldDays = 7; // outsold 2x for 7 days running
    expect(isWeakened(s, 'blenders')).toBe(true);
    expect(medium(s).text).not.toBe('Get the Blenders Weakened');
  });
});
