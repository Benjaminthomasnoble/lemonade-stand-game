// The story's beats, day by day and act by act (src/sim/story.ts, scenes.ts, phone.ts, goals.ts): Act 1's
// onboarding (Lottie's stock, the side lot, the Steward, Benny, Skip), then each act's lessons and climaxes.
import { describe, expect, it } from 'vitest';
import {
  BRAND_TIERS, buildClubhouse, buildStand, buyBrand, buyPlot, BUILDING_VALUE_SHARE, CAMPAIGNS, CUPS_PER_PITCHER, expectedCups, isWeakened,
  LOTTIES_CORNER, LOTTIES_SIDE_LOT, nearbyPlots, netWorth, newGame, openStand, PERIMETERS, pitcherNeeds, PLOT_BY_ID, plotPrice, PLOTS,
  seasonOf, servingsAvailable, SIDE_LOT, simulateRestOfDay, sleepUntilDawn, START, stock, threatLevel, type BattleReport, type CampaignId,
  type GameState, type Guard, type RivalId,
} from './economy.ts';
import { answerOffer, beatsAtDawn, CHOPPER_BOTTLES, HANDSHAKE_DAY, JUNI_CALLS_BY, MOVIE_STAR, OFFER_DAYS, REGATTA, scriptedRaider, storyOffer, TEA_DAY } from './beats.ts';
import { exitScene, INVOICE } from './exits.ts';
import { movePage } from './recipes.ts';
import { ceaseAndDesist } from './schemes.ts';
import { goalsNow } from './goals.ts';
import { juniTips, LINES, takeCall } from './phone.ts';
import { eliminate, hqPlot, inTruce, truceCost } from './rivals.ts';
import { beginScene, endScene, migrateScenes, playScene, replyScene, sceneDef, sceneReady, SPEAKERS } from './scenes.ts';
import { acceptOrder, buildFacility, ORDER_TIERS, orderRecipe, stockBottles, VIP_MAX_GAP, type Order } from './vip.ts';
import { bennyPitch, lottieStocks, migrateStory, storyAfterAct, storyAtDawn, storyHeadline, taught } from './story.ts';

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

describe("Lottie's stock on Day 1", () => {
  it('fills the table to the forecast day, free, while the Market waits for Day 2', () => {
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
    s.plots[LOTTIES_CORNER].stand!.inventory = { lemons: [], sugar: 0, ice: 0, sugarCost: 0, iceCost: 0 };
    corner(s).autoRestock = false; // Auto-Restock would stock it at Day 2's dawn, paid (automation.ts)
    playDay(s); // Day 2: from today you buy your own (Ben, 2026-11-08: buying has to cost something)
    expect(s.day).toBe(2);
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
    expect(buyPlot(s, LOTTIES_SIDE_LOT)).toBe(true); // a Rank 1 buy from Day 1: its $300 land value, less Majority's 10% (the rest of Maple Row is yours)
    expect(s.cash).toBe(730);
    s.day = 2;
    nextDawn(s);
    const ps = s.plots[LOTTIES_SIDE_LOT];
    expect(ps.landValue).toBeGreaterThan(SIDE_LOT.land);
    expect(ps.landValue).toBeLessThanOrEqual(SIDE_LOT.land * 2);
    expect(ps.stand?.level).toBe(1); // her table goes up on it
    expect(ps.dibs).toBeUndefined();
  });
});

describe('the Day 3 Steward', () => {
  /** Day 2's stock (bought that morning, so nothing spoils overnight), then Day 3's dawn. */
  const day5 = (s: GameState, lemons = 40, sugar = 100) => {
    s.day = 2;
    corner(s).autoRestock = false; // Auto-Restock would top the table up after the spill, at the dawn's end (automation.ts)
    corner(s).inventory = { lemons: lemons ? [{ qty: lemons, day: 2, unitCost: 0.2 }] : [], sugar, ice: 0, sugarCost: 0.03, iceCost: 0 };
    nextDawn(s);
    expect(s.day).toBe(3);
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

describe('Day 5: Lottie nudges the Wooden Stand', () => {
  const dawnOf = (s: GameState, day: number) => { s.day = day - 1; nextDawn(s); expect(s.day).toBe(day); };
  const nudge = (s: GameState) => s.news.find((n) => n.startsWith('Lottie: "Time that table grew up.'));
  it("says what it does and costs, from the level table, unless you've built one", () => {
    const s = newGame(60);
    s.plots[LOTTIES_CORNER].defense.tier = 1; // Day 3's fence is up, so the stand is the next goal
    dawnOf(s, 5);
    expect(nudge(s)).toBe('Lottie: "Time that table grew up. A Wooden Stand draws 1.5× the walkers and pours 2.5× as fast: $400, back in 2-4 days."');
    expect(goalsNow(s)[1].text).toBe('Build the Wooden Stand');
    const built = newGame(61);
    corner(built).level = 2; // a curious player tapped the table early
    dawnOf(built, 5);
    expect(nudge(built)).toBeUndefined();
    const off = newGame(62, { lessons: false });
    dawnOf(off, 5);
    expect(nudge(off)).toBeUndefined();
  });
});

describe('Benny Buzz and the first sign (Day 6)', () => {
  const day7 = (s: GameState) => { s.day = 5; nextDawn(s); expect(s.day).toBe(6); };
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

  it("Mayor Fontaine brings Vera's first fine to the Corner himself (rivals' Old Money)", () => {
    const s = newGame(75);
    s.scenes!.queue = [];
    beatsAtDawn(s);
    expect(s.scenes!.queue.some((q) => q.id === 'fontaine')).toBe(false); // no fine, no visit
    s.schemes = [{ kind: 'fine', by: 'sourwood', day: s.day, until: s.day, plots: [], price: 120, done: true }];
    beatsAtDawn(s);
    const sc = beginScene(s)!;
    expect(sc).toMatchObject({ id: 'fontaine', speaker: 'fontaine' });
    expect(sc.recap).toBe("Mayor Fontaine delivered one of Vera's fines: $120.");
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
    const lot = PLOTS.find((p) => p.district === 'maple' && p.type === 'street' && !s.plots[p.id].owner)!;
    s.plots[lot.id].owner = 'player'; // a Clubhouse fills an empty Street plot of yours
    expect(buildClubhouse(s, lot.id)).toBe(true);
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

describe('boss exit scenes', () => {
  const exitOf = (s: GameState, id: string) => s.scenes!.queue.find((q) => q.id === `exit-${id}`);
  it('play in every mode once a boss is out, opening on the route, one a day, and leave a recap when skipped', () => {
    for (const mode of ['campaign', 'sandbox', 'endless'] as const) {
      const s = newGame(90, { mode });
      s.scenes!.queue = []; // the campaign's Day 1 opening
      eliminate(s, 'fizzco', 'buyout');
      eliminate(s, 'coldbrew', 'bankrupt');
      expect(exitOf(s, 'fizzco')!.data!.lines![0].text).toBe('Fine. Sold. After hard haggling, I want that noted.');
      expect(exitOf(s, 'fizzco')!.data!.lines!.some((l) => l.text === "Let's circle back!")).toBe(true);
      expect(sceneReady(s)).toBe(true);
      const first = beginScene(s)!;
      expect(first.id).toBe('exit-fizzco');
      expect(first.seconds).toBeLessThan(60);
      endScene(s, true);
      expect(s.news).toContain(first.recap);
      expect(sceneReady(s)).toBe(false); // one scene a day: Juni's waits for tomorrow
      nextDawn(s);
      expect(beginScene(s)?.id).toBe('exit-coldbrew');
      eliminate(s, 'fizzco', 'hq'); // once a run
      expect(exitOf(s, 'fizzco')).toBeUndefined();
    }
    const juni = newGame(91, { mode: 'sandbox' });
    eliminate(juni, 'coldbrew', 'buyout');
    expect(exitOf(juni, 'coldbrew')!.data!.lines!.map((l) => l.text)).toEqual(expect.arrayContaining(['In small bills, for authenticity.', 'I sold out to a soda company. Never again.']));
  });

  it('Act 2 climax: the Blend Shack falls, Brock leaves for his surf school, the Frozen page comes home, then Act 3', () => {
    const s = newGame(92);
    s.day = 14;
    nextDawn(s);
    s.scenes!.queue = [];
    eliminate(s, 'blenders', 'hq');
    const lines = exitOf(s, 'blenders')!.data!.lines!;
    expect(lines[0].text).toBe('You stormed the Shack, bro. The SHACK.');
    expect(lines.some((l) => l.text === "I'm opening a surf school. The ocean never raided anybody, bro.")).toBe(true);
    expect(lines.some((l) => l.who === 'Lottie' && /Frozen Lemonade/.test(l.text))).toBe(true);
    expect(s.world!.pages).toContain('frozen');
    expect(s.plots[hqPlot('blenders').id].owner).toBe('player');
    expect(s.news.some((n) => n.includes('Blender Bar'))).toBe(true);
    expect(s.news.some((n) => n.startsWith('FIRE SALE'))).toBe(true);
    expect(s.story!.act).toBe(2);
    nextDawn(s);
    expect(s.story!.act).toBe(3);
    expect(s.news.some((n) => n.startsWith('ACT 3:'))).toBe(true);
  });

  it("Act 3 climax: Juni slides over FizzCo's invoice, with any Truce tribute you paid Preston on it", () => {
    const s = newGame(93);
    s.story!.tribute = 1200;
    let sc = exitScene(s, 'coldbrew', 'hq');
    expect(sc.lines.map((l) => l.text)).toEqual(expect.arrayContaining([INVOICE, 'Line two: your $1,200 Truce. You paid for it too.']));
    expect(sc.recap).toMatch(/\$1,200 Truce tribute to Preston/);
    delete s.story!.tribute;
    sc = exitScene(s, 'coldbrew', 'buyout');
    expect(sc.lines[0].text).toBe('In small bills, for authenticity.');
    expect(sc.lines.some((l) => l.text.startsWith('Line two'))).toBe(false);
    expect(sc.lines.some((l) => l.text === INVOICE)).toBe(true);
    s.rivals.fizzco.alive = false; // FizzCo gone first: Juni's plain exit
    expect(exitScene(s, 'coldbrew', 'hq').lines.some((l) => l.text === INVOICE)).toBe(false);
    expect(exitScene(newGame(93, { mode: 'sandbox' }), 'coldbrew', 'hq').lines.some((l) => l.text === INVOICE)).toBe(false);
  });
});

describe('Act 3: the handshake and the night flight', () => {
  /** A campaign in Act 3, `days` days in, at Rank 4 with cash for a tribute. */
  const act3 = (seed: number, days = 0) => {
    const s = newGame(seed);
    s.scenes!.queue = [];
    s.story!.act = 3;
    s.story!.since = s.day - days;
    s.rank = 4;
    s.cash = 50000;
    s.battles = [];
    return s;
  };
  const queuedCall = (s: GameState, text: string) => s.phone!.queue.some((c) => c.text === text);

  it("Preston phones from Dot's a few days in; shaking on it buys a 7-day Truce, and the tribute is kept for the invoice", () => {
    const s = act3(100, HANDSHAKE_DAY - 2);
    nextDawn(s);
    expect(s.story!.offer).toBeUndefined(); // not yet
    nextDawn(s);
    expect(s.story!.offer).toMatchObject({ from: 'fizzco' });
    expect(queuedCall(s, LINES.prestonTruce)).toBe(true);
    const offer = storyOffer(s)!;
    expect(offer.cost).toBe(truceCost(s, 'fizzco'));
    expect(offer.why).toBeUndefined();
    expect(answerOffer(s, true)).toBe(true);
    expect(inTruce(s, 'fizzco')).toBe(true);
    expect(s.story!.tribute).toBe(offer.cost);
    expect(s.news).toContain('Lottie: "That\'s a Sit-down, kid. Call one yourself from any boss\'s HQ card."');
    expect(storyOffer(s)).toBeNull();
    expect(exitScene(s, 'coldbrew', 'hq').lines.some((l) => l.text.includes(`your $${offer.cost.toLocaleString('en-US')} Truce`))).toBe(true);
  });

  it('a No, an offer left standing, Rank 3 or another mode: no Truce, and he asks once a run', () => {
    const no = act3(101, HANDSHAKE_DAY);
    nextDawn(no);
    expect(answerOffer(no, false)).toBe(true);
    expect(inTruce(no, 'fizzco')).toBe(false);
    expect(no.story!.tribute).toBeUndefined();
    expect(no.news).toContain('Preston: "No? I\'ll pencil you in for later."');
    const left = act3(102, HANDSHAKE_DAY);
    nextDawn(left);
    left.phase = 'open';
    expect(storyOffer(left)).toBeNull(); // Sit-downs happen at Morning Prep
    for (let d = 0; d < OFFER_DAYS; d++) nextDawn(left);
    expect(left.story!.offer).toBeUndefined();
    expect(left.story!.asked).toBe(true);
    const low = act3(103, HANDSHAKE_DAY);
    low.rank = 3;
    nextDawn(low);
    expect(low.story!.offer).toBeUndefined();
    const sandbox = newGame(104, { mode: 'sandbox' });
    sandbox.rank = 4;
    nextDawn(sandbox);
    expect(sandbox.story?.offer).toBeUndefined();
  });

  it("the morning after Cold Brew's first raid on you, Squawk's night flight plays and then Juni calls", () => {
    const s = act3(105, 1);
    s.battles.unshift({ ...tutorialRaid(s), attacker: 'coldbrew' });
    nextDawn(s);
    expect(sceneReady(s)).toBe(true);
    const sc = beginScene(s)!;
    expect(sc.id).toBe('nightFlight');
    expect(sc.lines[0]).toMatchObject({ who: 'Captain Squawk', text: 'SQUAWK! Three a.m.! Beanies at your stand!' });
    endScene(s, false);
    expect(s.phone!.queue.some((c) => c.who === 'coldbrew' && c.text === LINES.juniAct3)).toBe(true);
    const quiet = act3(106, JUNI_CALLS_BY - 1); // no raid of hers a week in: she calls anyway
    nextDawn(quiet);
    expect(queuedCall(quiet, LINES.juniAct3)).toBe(true);
    expect(quiet.scenes!.queue.some((q) => q.id === 'nightFlight')).toBe(false);
  });
});

describe("Juni's tips, the first chopper and the first ship", () => {
  /** A campaign at Rank 6 with Cold Brew out of the game (Act 4). */
  const act4 = (seed: number) => {
    const s = newGame(seed);
    s.scenes!.queue = [];
    s.story!.act = 4;
    s.story!.since = s.day;
    s.rank = 6;
    s.rivals.coldbrew.alive = false;
    s.phone!.queue = [];
    return s;
  };
  const offer = (s: GameState, tier: 'heli' | 'ship', plot = LOTTIES_CORNER): Order => {
    const o: Order = { id: `o${s.nextId++}`, tier, client: tier === 'heli' ? "the Governor's Gala" : 'an overseas export deal', qty: tier === 'heli' ? 2500 : 15000, pay: 0, due: s.day + 5, expires: s.day + 2, plot, accepted: false };
    o.pay = o.qty * ORDER_TIERS[tier].pay;
    s.offers.push(o);
    return o;
  };

  it('Juni phones ahead of a FizzCo raid on you tonight, from out of the game, and stops once FizzCo falls', () => {
    const s = act4(110);
    s.raids.push({ id: 'r9', attacker: 'fizzco', target: LOTTIES_CORNER, objective: 'smash', detected: false, eta: '23:30' });
    juniTips(s);
    const tip = s.phone!.queue.find((c) => c.who === 'coldbrew')!;
    expect(tip.text).toBe("FizzCo's crew hits the Corner tonight. You didn't hear it from me.");
    s.phase = 'report';
    expect(takeCall(s)?.text).toBe(tip.text); // the day's one call, before the raid's warning is out
    const done = act4(111);
    done.rivals.fizzco.alive = false;
    done.raids.push({ id: 'r9', attacker: 'blenders', target: LOTTIES_CORNER, objective: 'smash', detected: false, eta: '23:30' });
    juniTips(done);
    expect(done.phone!.queue.some((c) => c.who === 'coldbrew')).toBe(false);
  });

  /** A facility of yours on the first free plot of its type: a Pad on a Field, a Jetty on a Dock. */
  const site = (s: GameState, kind: 'helipad' | 'pier') => {
    const p = kind === 'helipad' ? PLOTS.find((x) => x.type === 'field')! : PLOTS.find((x) => x.type === 'dock' && !s.plots[x.id].facility)!; // a field cleared of Hollis's Lemon Grove
    s.plots[p.id] = { ...s.plots[p.id], owner: 'player', stand: null, facility: undefined, invested: 0 };
    s.cash = 3_000_000;
    expect(buildFacility(s, p.id, kind)).toBe(true);
    return p.id;
  };
  /** Lottie's line on the feed (its card also lands in the news, which a test run keeps). */
  const wind = (s: GameState) => s.news.filter((n) => n === 'Lottie: "That horn? Just the wind, kid. Just the wind."').length;

  it("the first chopper is a movie star's 4,000 bottles of Pink, called to you alone; only the first is scripted", () => {
    const s = act4(112);
    s.reputation = 4;
    const pad = site(s, 'helipad');
    s.lastOffer = { heli: s.day - VIP_MAX_GAP }; // the chopper calls at the next dawn (vip.ts)
    nextDawn(s);
    const o = s.offers.find((x) => x.tier === 'heli')!;
    expect(o).toMatchObject({ client: MOVIE_STAR, qty: CHOPPER_BOTTLES, pay: 120000, recipe: 'pink', plot: pad });
    expect(o.bid).toBeUndefined();
    expect(s.news).toContain('VIP call! A movie star wants 4,000 bottles of Pink for a pool party: $120,000.');
    expect(s.news.filter((n) => n.startsWith('VIP call!'))).toHaveLength(1); // vip.ts's line gave way to it
    expect(s.news.some((n) => n.startsWith('Lottie: "A chopper, kid!'))).toBe(true);
    const next = offer(s, 'heli');
    next.bid = { rival: 'fizzco', pay: Math.round(next.pay * 0.85), days: 1 };
    beatsAtDawn(s);
    expect(next).toMatchObject({ client: "the Governor's Gala", bid: { rival: 'fizzco' } }); // a later chopper keeps its client and bid
    // A rival's bid on the first offer: vip.ts's line (bid and all) gives way, and the movie star calls you alone.
    const t = act4(115);
    t.reputation = 4;
    const bid = offer(t, 'heli');
    bid.bid = { rival: 'fizzco', pay: Math.round(bid.pay * 0.85), days: 1 };
    t.news.push("VIP call! the Governor's Gala wants 2,500 bottles for $75,000. FizzCo Beverages bids $63,750.");
    beatsAtDawn(t);
    expect(bid.bid).toBeUndefined();
    expect(t.news.filter((n) => n.startsWith('VIP call!'))).toEqual(['VIP call! A movie star wants 4,000 bottles of Pink for a pool party: $120,000.']);
  });

  it('Juni warns that FizzCo will hit the pad on the day the chopper first loads, and FizzCo is the first trip’s raider', () => {
    const s = act4(116);
    s.reputation = 4;
    expect(threatLevel(s)).toBeGreaterThanOrEqual(3);
    const o = offer(s, 'heli', site(s, 'helipad'));
    beatsAtDawn(s);
    expect(o.client).toBe(MOVIE_STAR);
    expect(acceptOrder(s, o.id)).toBe(true);
    const tip = () => s.phone!.queue.filter((c) => c.who === 'coldbrew' && c.text === LINES.juniPad && c.tip).length;
    storyAfterAct(s);
    expect(tip()).toBe(0); // no Pink bottled yet: nothing loads today
    stockBottles(s, 'pink', 2500);
    storyAfterAct(s); // the tap after bottles are ready (or the next dawn's bottling)
    expect(tip()).toBe(1);
    storyAfterAct(s);
    expect(tip()).toBe(1); // once a day
    expect(scriptedRaider(s, o)).toBe('fizzco');
    o.loaded = 2000; // the first trip went out: later trips take the usual roll
    expect(scriptedRaider(s, o)).toBeNull();
    const calm = act4(117); // FizzCo's Respect for you: no tip, no scripted raid
    calm.reputation = 4;
    const c = offer(calm, 'heli', site(calm, 'helipad'));
    beatsAtDawn(calm);
    acceptOrder(calm, c.id);
    stockBottles(calm, 'pink', 4000);
    calm.rivals.fizzco.respectUntil = calm.day + 5;
    storyAfterAct(calm);
    expect(calm.phone!.queue.some((x) => x.text === LINES.juniPad)).toBe(false);
    expect(scriptedRaider(calm, c)).toBeNull();
  });

  it('the first ship is the Regatta flagship, and at its first docking Lottie blames the wind', () => {
    const s = act4(113);
    s.rank = 7;
    s.reputation = 4.5;
    for (const r of Object.values(s.rivals)) r.respectUntil = 999; // no Delivery Raids: the trips load in peace
    const jetty = site(s, 'pier');
    s.lastOffer = { ship: s.day - VIP_MAX_GAP };
    nextDawn(s);
    const o = s.offers.find((x) => x.tier === 'ship')!;
    expect(o).toMatchObject({ client: REGATTA, plot: jetty });
    expect(o.bid).toBeUndefined();
    expect(s.news.some((n) => n.startsWith("Ship Contract! The Regatta's flagship wants"))).toBe(true);
    expect(acceptOrder(s, o.id)).toBe(true);
    stockBottles(s, orderRecipe(o), o.qty); // bottled ahead: the Jetty loads 5,000 a day
    storyAfterAct(s);
    expect(wind(s)).toBe(0); // not before it docks
    openStand(s);
    simulateRestOfDay(s);
    expect(o.loaded).toBe(5000);
    expect(wind(s)).toBe(1);
    nextDawn(s);
    openStand(s);
    simulateRestOfDay(s);
    expect(o.loaded).toBe(10000);
    expect(wind(s)).toBe(1); // the first docking only
    // A contract that leaves the book in one trip (a small load) still docked; one that fell through unloaded never did.
    const one = act4(118);
    one.rank = 7;
    one.reputation = 4.5;
    for (const r of Object.values(one.rivals)) r.respectUntil = 999;
    const small = offer(one, 'ship', site(one, 'pier'));
    small.qty = 3000;
    beatsAtDawn(one);
    acceptOrder(one, small.id);
    stockBottles(one, orderRecipe(small), 3000);
    storyAfterAct(one);
    openStand(one);
    simulateRestOfDay(one);
    expect(one.orders).not.toContain(small);
    expect(wind(one)).toBe(1);
    const dry = act4(119);
    dry.rank = 7;
    dry.reputation = 4.5;
    const late = offer(dry, 'ship', site(dry, 'pier'));
    beatsAtDawn(dry);
    acceptOrder(dry, late.id);
    late.due = dry.day; // due today with no bottles: it falls through at closing
    storyAfterAct(dry);
    openStand(dry);
    simulateRestOfDay(dry);
    expect(dry.orders).not.toContain(late);
    nextDawn(dry);
    openStand(dry);
    simulateRestOfDay(dry);
    expect(wind(dry)).toBe(0);
    const old = newGame(114); // an older save that had VIP offers already keeps its own
    delete old.story!.vip;
    old.lastOffer = { heli: 3 };
    migrateStory(old);
    expect(old.story!.vip).toEqual({ heli: '' });
  });
});

describe('Acts 4 and 5: FizzCo falls, tea at the Manor', () => {
  const exitOf = (s: GameState, id: string) => s.scenes!.queue.find((q) => q.id === `exit-${id}`);
  /** A campaign in Act 4 or 5: the earlier climaxes behind it, at the rank its HQ assault needs. */
  const lateAct = (seed: number, act: 4 | 5) => {
    const s = newGame(seed);
    s.day = 89;
    for (const r of ['blenders', 'coldbrew', ...(act === 5 ? ['fizzco'] : [])] as RivalId[]) eliminate(s, r, 'buyout');
    s.day = 90; // their pages came home yesterday
    Object.assign(s.story!, { act, since: s.day });
    s.rank = act === 4 ? 8 : 9;
    s.cash = 50000;
    s.scenes!.queue = [];
    return s;
  };

  it('Act 4 climax: FizzCo Tower falls, Preston leaves in a tow truck, Sparkling comes home, the C&Ds stop, then Act 5', () => {
    const s = lateAct(110, 4);
    eliminate(s, 'fizzco', 'hq');
    const lines = exitOf(s, 'fizzco')!.data!.lines!.map((l) => l.text);
    expect(lines[0]).toBe("You can't storm a Tower! That's not in the plan!");
    expect(lines).toEqual(expect.arrayContaining(["Yes, I'm in a tow truck. It's a strategic pivot.", "Let's circle back!", 'And my Sparkling Lemonade page comes home.']));
    expect(s.world!.pages).toContain('sparkling');
    expect(s.news.some((n) => n.includes('Bottling Line'))).toBe(true);
    expect(ceaseAndDesist(s, 'downtown')).toBeNull(); // FizzCo's lawyers are out of the game
    expect(s.story!.act).toBe(4);
    nextDawn(s);
    expect(s.story!.act).toBe(5);
    expect(s.news).toContain('ACT 5: THE BIG SQUEEZE! Sourwood Manor is watching.');
    expect(storyHeadline(s)).toEqual(['ACT 5!', 'The Big Squeeze']);
    expect(s.phone!.queue.some((c) => c.who === 'sourwood' && c.text === LINES.veraAct5)).toBe(true);
  });

  it('tea at the Manor: days into Act 5, or the morning after the Lavender auction, Vera offers to buy you out; every reply is a no', () => {
    const s = lateAct(111, 5);
    const tea = (x: GameState) => x.scenes!.queue.some((q) => q.id === 'tea');
    while (s.day < s.story!.since + TEA_DAY - 1) { nextDawn(s); expect(tea(s)).toBe(false); }
    nextDawn(s);
    expect(tea(s)).toBe(true);
    s.scenes!.queue = s.scenes!.queue.filter((q) => q.id === 'tea');
    delete s.scenes!.lastDay;
    const sc = beginScene(s)!;
    expect(sc.id).toBe('tea');
    expect(sc.replies).toEqual(['No', 'No, thank you', "Absolutely not, ma'am."]);
    const before = JSON.stringify([s.cash, s.plots, s.rivals, s.outcome]);
    replyScene(s, "Absolutely not, ma'am.");
    endScene(s, false);
    expect(JSON.stringify([s.cash, s.plots, s.rivals, s.outcome])).toBe(before); // the reply changes nothing
    nextDawn(s);
    expect(tea(s)).toBe(false); // once a run
    // Land's Lavender auction (when it lands): the page leaves the harp teacher, and tea is the next morning.
    const t = lateAct(112, 5);
    t.story!.since = t.day - 1;
    nextDawn(t);
    expect(tea(t)).toBe(false);
    movePage(t, 'lavender', 'sourwood');
    nextDawn(t);
    expect(tea(t)).toBe(true);
  });
});
