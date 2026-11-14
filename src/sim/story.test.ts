import { describe, expect, it } from 'vitest';
import {
  actOf, averageStopChance, BAY_RIVALS, buyPerimeter, cookieJarPeriod, cookieJarReady, CUPS_PER_PITCHER, dayProfit, eliminate, keepSqueezing, LOTTIES_CORNER, migrateSave, newGame,
  festivalDays, openStand, OUT_OF_TOWNER, outOfTownerAtDawn, planNight, PLOTS, postGuard, rivalsBankrupt, SCHEMES, simulateRestOfDay, sleepUntilDawn, tasteOffResult, threatLevel, TUTORIAL_RAID_DAY,
  type BattleReport, type GameState, type RivalId,
} from './economy.ts';
import { sharedBorders } from './rivalAi.ts';
import { BLENDER_RUSH } from './rivals.ts';
import { startScheme } from './schemes.ts';
import { checkGoals, GOAL_PROVIDERS, goalReward, goalsNow, recipeMatch, salesTarget } from './goals.ts';
import { ownedRecipes } from './recipes.ts';
import { bossBrief, CALL_PRIORITY, LINES, phoneAtClose, phoneCall, phoneCheck, takeCall } from './phone.ts';
import { beginScene, endScene, playingScene, playScene, SCENE_MAX_SECONDS, sceneDef, sceneLine, sceneReady } from './scenes.ts';
import { actBegan, cornerName, cornerSign, rankTenLine, dexGooseLine, LEAN_LINES, leanLine, marisolLine, storyAtClose, storyAtDawn, storyDateline, storyHeadline, taught } from './story.ts';
import { CAMEO_DAYS, FACTIONS, LESSON_DAY, PERIMETERS, PHONE_GRUDGE_JUMP, PHONE_GRUDGE_LINE, RECORD_GAIN, VICTORY_PAINT_SECONDS } from './balance.ts';
import { menuScreen, menuUnlocked } from '../ui/menus.ts';
import { DEFAULT_OPTIONS, defaultKeys } from '../settings.ts';
import { CREW_NAME, crewCall, crewCheer, crewName, grandkid, KID_LOOKS, KID_NAME, kidLook, NAME_MAX, nameDraft, renameCrew, setGrandkid } from './grandkid.ts';
import { battleHeadline, crewOf, fightRaid, raidPartyFor, welcomeDex } from './crew.ts';
import { hqStageOver } from './rivals.ts';
import { bugleHeadline, frontPage } from './media.ts';
import { checkVictory, defaultSettings, endingFor, ENDINGS } from './modes.ts';
import type { BattleInput, BattleResult } from './combat.ts';
import { crewField, kidPanel, pickKid, typeName } from '../ui/grandkid.ts';
import { kidSpec } from '../world/stand.ts';
import { SPECS } from '../world/clay/figure.ts';
import { BRAWL } from '../world/barks.ts';
import { CAMEO_NEWS, cameosAtClose, cameosAtDawn, cameoStories, JUNI_NOBODY, juniGrudgeTip, juniQuietTip, juniRaidTip, PRESTON_CALLS, TILLY_JUDGES } from './cameos.ts';
import type { Raid } from './crew.ts';
import { bayPainted, endVictoryShow, victoryStage, victoryTick } from './victory.ts';
import { BAY_PAGE, victoryShow } from '../ui/ending.ts';

/** Skip straight to the next dawn (the night still runs; the business day doesn't). */
/** The year-1 Summer Fair's last day: its Taste-Off closes Act 1. */
const SUMMER_FAIR_DAY = festivalDays('summerFair', 1).to;

function nextDawn(s: GameState) {
  s.phase = 'report';
  sleepUntilDawn(s);
}
function playDay(s: GameState) {
  s.cash = Math.max(s.cash, 200);
  openStand(s);
  simulateRestOfDay(s);
  sleepUntilDawn(s);
}

describe('story acts', () => {
  it('advance on their climaxes, not on rank', () => {
    const s = newGame(11);
    expect(s.story?.act).toBe(1);
    s.rank = 6; // a rank deep into Act 3's range changes nothing
    expect(actOf(s)).toBe(1);
    s.day = SUMMER_FAIR_DAY;
    nextDawn(s); // the Summer Fair is behind us: Act 2
    expect(actOf(s)).toBe(2);
    expect(storyHeadline(s)).toEqual(['ACT 2!', 'Surf & Turf']);
    expect(storyDateline(s)).toBe('Act 2: Surf & Turf');
    expect(s.phone!.queue.some((c) => c.who === 'blenders' && c.text === LINES.brockFirst)).toBe(true);
    nextDawn(s);
    expect(actOf(s)).toBe(2); // Brock still stands
    expect(storyHeadline(s)).toBeNull();
    eliminate(s, 'blenders', 'buyout');
    eliminate(s, 'coldbrew', 'buyout'); // a boss who falls early exits early
    nextDawn(s);
    expect(actOf(s)).toBe(3);
    nextDawn(s); // one act a dawn, so each climax gets its own morning
    expect(actOf(s)).toBe(4);
  });

  it("Act 1 closes when the Summer Fair's Taste-Off is judged, win or lose", () => {
    const s = newGame(14);
    s.day = SUMMER_FAIR_DAY - 1;
    nextDawn(s); // the fair's last day: the judges set up
    expect(actOf(s)).toBe(1);
    playDay(s); // judged at closing; the next dawn opens Act 2
    const fair = tasteOffResult(s, 'summerFair', 1)!;
    expect(fair).toBeDefined();
    expect(s.day).toBe(SUMMER_FAIR_DAY + 1);
    expect(actOf(s)).toBe(2);
    fair.winner = 'blenders'; // Brock keeps his page: the act's own banner leads the paper
    expect(storyHeadline(s)).toEqual(['ACT 2!', 'Surf & Turf']);
    Object.assign(fair, { winner: 'player', stake: 'strawberry' }); // you took it: the Bugle's Act 1 climax line leads instead
    expect(storyHeadline(s)).toBeNull();
    expect(storyDateline(s)).toBe('Act 2: Surf & Turf');
  });

  it('Sandbox has no acts or scenes; an old save infers its act from the climaxes behind it', () => {
    const sb = newGame(12, { mode: 'sandbox' });
    sb.rank = 5;
    expect(actOf(sb)).toBe(3); // read from rank where there's no story
    expect(storyDateline(sb)).toBe('');
    expect(playScene(sb, 'steward')).toBe(false);
    const old = newGame(13) as Partial<GameState> & GameState;
    old.day = 50;
    old.rivals.blenders.alive = false;
    delete old.story; delete old.goals; delete old.scenes; delete old.phone;
    const loaded = migrateSave(JSON.parse(JSON.stringify(old)))!;
    expect(loaded.story?.act).toBe(3);
    expect(loaded.scenes?.seen).toContain('steward'); // past Day 5: don't replay it
    expect(goalsNow(loaded)).toHaveLength(3);
  });

  it('the Cookie Jar refills once per act; the Epilogue starts the day you keep squeezing', () => {
    const s = newGame(31);
    expect(cookieJarPeriod(s)).toBe('act1');
    expect(actBegan(s)).toBe(1);
    s.day = SUMMER_FAIR_DAY;
    nextDawn(s);
    expect(actBegan(s)).toBe(SUMMER_FAIR_DAY + 1); // saved with the act, e.g. for the Syndicate two weeks into Act 5
    s.cookieJar = ['act1'];
    expect(cookieJarPeriod(s)).toBe('act2');
    expect(cookieJarReady(s)).toBe(true); // a new act, a full jar
    s.rank = 9;
    s.outcome = { result: 'won', how: 'domination', day: s.day };
    expect(keepSqueezing(s)).toBe(true);
    expect(storyDateline(s)).toBe('Epilogue'); // from today, not the next dawn
    expect(cookieJarPeriod(s)).toMatch(/^season/); // after the win, once a season
    checkGoals(s);
    expect(goalsNow(s)[2].text).toMatch(/^Reach Rank 10/); // Lottie names Rank 10 first
    expect(actBegan(newGame(32, { mode: 'sandbox' }))).toBeNull();
  });

  it("the act turns before the Cookie Jar is read: a new act's first dawn has a full jar", () => {
    const s = newGame(33);
    s.day = SUMMER_FAIR_DAY;
    s.cash = -50;
    s.redDays = 3; // the third day In the Red is behind us
    s.cookieJar = ['act1']; // Act 1's jar is spent
    nextDawn(s); // Act 2's first morning
    expect(actOf(s)).toBe(2);
    expect(s.outcome).toBeUndefined();
    expect(s.cash).toBeGreaterThanOrEqual(0);
    expect(s.cookieJar).toEqual(['act1', 'act2']);
    expect(s.news.indexOf('ACT 2: SURF & TURF! Brock wants his sun back.')).toBeLessThan(s.news.findIndex((n) => n.startsWith("Lottie's Cookie Jar!")));
    nextDawn(s);
    expect(actOf(s)).toBe(2); // one act a dawn
  });
});

describe('the ending lean', () => {
  it("Lottie hints at each act's end which ending you lean toward; with nothing on the tally, the stars tip it", () => {
    const s = newGame(51);
    s.reputation = 3.2;
    expect(leanLine(s)).toBe(LEAN_LINES.freshIron); // Act 1: nothing bought out or smashed yet
    s.reputation = 4.3;
    expect(leanLine(s)).toBe(LEAN_LINES.freshBeloved);
    s.tally = { buyouts: 2, smashes: 1, hqs: 0 };
    expect([leanLine(s), endingFor(s)]).toEqual([LEAN_LINES.beloved, 'beloved']);
    s.reputation = 3.9;
    expect([leanLine(s), endingFor(s)]).toEqual([LEAN_LINES.stars, 'iron']); // more buyouts, too few stars
    s.tally = { buyouts: 2, smashes: 1, hqs: 1 };
    s.reputation = 4.8;
    expect([leanLine(s), endingFor(s)]).toEqual([LEAN_LINES.iron, 'iron']); // as many Smashes and HQs as buyouts
    // The dawn an act turns, Lottie says it, right after the act's banner.
    Object.assign(s.story!, { act: 2, since: s.day });
    eliminate(s, 'blenders', 'buyout'); // Act 2's climax: the Blend Shack falls
    nextDawn(s);
    expect(s.story!.act).toBe(3);
    const banner = s.news.findIndex((n) => n.startsWith('ACT 3:'));
    expect(s.news[banner + 1]).toBe(`Lottie: "${LEAN_LINES.iron}"`);
    // Sandbox has no acts, and no hints.
    const t = newGame(52, { mode: 'sandbox' });
    nextDawn(t);
    expect(Object.values(LEAN_LINES).some((l) => t.news.includes(`Lottie: "${l}"`))).toBe(false);
  });
});

describe('story scenes', () => {
  it('wait for Morning Prep, play one a day, and leave a recap when skipped', () => {
    const s = newGame(14);
    s.day = 2;
    nextDawn(s); // Day 3: the Steward's reminder
    expect(s.day).toBe(3);
    expect(sceneReady(s)).toBe(true);
    playScene(s, 'dex'); // a second beat the same day waits
    const sc = beginScene(s)!;
    expect(sc.id).toBe('steward');
    expect(sceneLine(sc, 0)).toBeNull();
    expect(sceneLine(sc, 5)?.who).toBe('Steward');
    expect(sceneLine(sc, 7)?.who).toBe('Lottie');
    expect(sceneReady(s)).toBe(false);
    s.news.length = 0;
    endScene(s, true);
    expect(s.news).toEqual([sc.recap]);
    expect(sc.recap).toMatch(/^A Sourwood Steward knocked over the table/);
    expect(beginScene(s)).toBeNull(); // one scene a day
    expect(playScene(s, 'steward')).toBe(false); // each plays once a run
    openStand(s);
    expect(sceneReady(s)).toBe(false); // never once the stands are open
    nextDawn(s);
    expect(beginScene(s)?.id).toBe('dex');
  });

  it('a scene cut off by a reload counts as seen, and only boss exits play outside the campaign', () => {
    const s = newGame(15);
    s.day = 2;
    nextDawn(s);
    beginScene(s);
    const loaded = migrateSave(JSON.parse(JSON.stringify(s)))!;
    expect(playingScene(loaded)).toBeNull();
    expect(loaded.scenes!.seen).toContain('steward');
    const sb = newGame(16, { mode: 'endless' });
    const exit = { exit: true, seconds: 10, lines: [{ who: 'Brock', text: 'Bro.', at: 1 }], recap: 'Brock leaves town.' };
    expect(playScene(sb, 'exit-blenders', exit)).toBe(true);
    expect(beginScene(sb)?.recap).toBe('Brock leaves town.');
  });

  it("the Steward's scene ends with Vera on the phone, watched or skipped; no scene runs over a minute", () => {
    for (const skipped of [false, true]) {
      const s = newGame(33);
      s.day = 2;
      nextDawn(s);
      s.phone!.queue = s.phone!.queue.filter((c) => c.text !== LINES.brockFirst); // Brock's Day 1 call aside
      beginScene(s);
      expect(s.phone!.queue.some((c) => c.text === LINES.veraSteward)).toBe(false); // not before the scene is over
      endScene(s, skipped);
      expect(takeCall(s)).toMatchObject({ who: 'sourwood', text: LINES.veraSteward });
    }
    const long = sceneDef('fair', { seconds: 300, lines: [{ who: 'Juni', text: 'Hi.', at: 1 }], recap: 'Juni waved.' })!;
    expect(long.seconds).toBe(SCENE_MAX_SECONDS);
  });
});

describe('boss phone taunts', () => {
  it('ring at most once a game day, the most important first', () => {
    const s = newGame(17);
    phoneCall(s, 'coldbrew', '', { mood: 'warn' });
    phoneCall(s, 'sourwood', LINES.veraThreat, { priority: CALL_PRIORITY.story });
    expect(takeCall(s)?.who).toBe('sourwood');
    expect(takeCall(s)).toBeNull();
    s.day++;
    expect(takeCall(s)?.who).toBe('coldbrew');
    expect(s.phone!.log.map((c) => c.who)).toEqual(['coldbrew', 'sourwood']);
  });

  it('follow Grudge and Threat jumps; Brock taunts from Day 1; the fallen never call', () => {
    const s = newGame(18);
    s.rivals.coldbrew.grudge += 12;
    phoneCheck(s);
    expect(s.phone!.queue.map((c) => c.who)).toContain('coldbrew');
    s.rank = 3; // Threat 1 to 2
    expect(threatLevel(s)).toBe(2);
    phoneCheck(s);
    expect(s.phone!.queue.some((c) => c.who === 'sourwood' && c.text === LINES.veraThreat)).toBe(true);
    expect(phoneCall(s, 'blenders', '', { mood: 'warn' })).toBe(true); // Act 1 too (Ben, 2026-11-08)
    expect(phoneCall(newGame(19, { mode: 'sandbox' }), 'blenders', '', { mood: 'warn' })).toBe(true);
    eliminate(s, 'coldbrew', 'buyout');
    const rang: string[] = [];
    for (let call = takeCall(s); call; call = takeCall(s)) { rang.push(call.who); s.day++; }
    expect(rang).toEqual(['sourwood', 'blenders']);
  });

  it('a Grudge climbing past the line rings without a jump, and the next Bugle has them hang up spoiling for a fight', () => {
    const s = newGame(23);
    const below = PHONE_GRUDGE_LINE - 2, past = PHONE_GRUDGE_LINE + 1;
    expect(past - below).toBeLessThan(PHONE_GRUDGE_JUMP); // no jump: only the line can ring it
    s.rivals.hollis.grudge = below;
    phoneCheck(s); // the climb from the start to just below the line is a jump: set it aside
    s.phone!.queue.length = 0;
    s.rivals.hollis.grudge = past;
    phoneCheck(s);
    expect(s.phone!.queue.map((c) => c.who)).toEqual(['hollis']);
    expect(takeCall(s)).toMatchObject({ who: 'hollis', mood: 'warn' });
    s.rivals.hollis.grudge = past + 2; // already past it: no second call
    phoneCheck(s);
    expect(s.phone!.queue).toEqual([]);
    s.rivals.hollis.grudge = past;
    s.day++;
    expect(bossBrief(s)).toBe(`Bugle: ${FACTIONS.hollis.name} hang up spoiling for a fight.`);
    s.rivals.hollis.grudge = PHONE_GRUDGE_LINE; // at the line is no fight yet
    expect(bossBrief(s)).toBe(`Bugle: ${FACTIONS.hollis.name} keep quiet after the call.`);
  });

  it('a raid on you tonight gets its taunt once its warning is out, never before, and none once it has hit', () => {
    const s = newGame(20, { mode: 'sandbox' });
    s.raids.push({ id: 'r1', attacker: 'blenders', target: LOTTIES_CORNER, objective: 'smash', party: [], detected: true, eta: '22:00' });
    phoneAtClose(s);
    expect(s.phone!.queue[0]).toMatchObject({ who: 'blenders', text: LINES.brockBlend, until: s.day, raid: 'r1' });
    expect(takeCall(s)).toBeNull(); // the raid hasn't set out: no call gives it away
    s.raids[0].warned = true;
    expect(takeCall(s)).toMatchObject({ who: 'blenders', text: LINES.brockBlend });
    buyPerimeter(s, LOTTIES_CORNER);
    s.phone!.queue = [];
    s.phone!.lastDay = undefined;
    phoneAtClose(s);
    expect(s.phone!.queue[0].text).toBe(LINES.brockBlend); // a fence doesn't call off the Rush's line
    expect(LINES.brockBlend).toBe(BLENDER_RUSH.taunt);
    s.raids.length = 0; // it hit (or was called off) before the call rang
    expect(takeCall(s)).toBeNull();
    expect(s.phone!.queue).toEqual([]);
    // The fence line is Brock's raid warning: his mood turns while a stand of yours has a fence.
    s.rivals.blenders.grudge += 10;
    phoneCheck(s);
    expect(s.phone!.queue[0]).toMatchObject({ who: 'blenders', text: LINES.brockFence, mood: 'warn' });
    const t = newGame(20, { mode: 'sandbox' });
    phoneCheck(t);
    t.rivals.blenders.grudge += 10;
    phoneCheck(t);
    expect(t.phone!.queue[0]).toMatchObject({ who: 'blenders', text: '', mood: 'warn' }); // no fence: his own pool
  });

  it("a lesser call waits while tonight's raid call waits for its warning; a raid planned after closing calls at its warning too", () => {
    const s = newGame(21, { mode: 'sandbox' });
    s.raids.push({ id: 'r1', attacker: 'coldbrew', target: LOTTIES_CORNER, objective: 'smash', party: [], detected: true, eta: '23:00' });
    phoneAtClose(s);
    phoneCall(s, 'sourwood', LINES.veraThreat); // a mood call, less important than tonight's raid
    expect(takeCall(s)).toBeNull(); // Vera doesn't take the evening's slot from Juni
    s.raids[0].warned = true;
    expect(takeCall(s)).toMatchObject({ who: 'coldbrew', text: '', mood: 'warn' }); // her own pool fills it in
    expect(s.phone!.log[0].raid).toBe('r1');
    s.raids.length = 0;
    s.day++;
    expect(takeCall(s)).toMatchObject({ who: 'sourwood', text: LINES.veraThreat }); // the rest wait a day
    // A Delivery Raid sets out at a pickup, long after closing: its warning still brings its boss to the phone, once.
    s.day++;
    const pad = PLOTS.find((p) => p.district === 'maple' && p.type === 'street' && !s.plots[p.id].owner)!;
    s.plots[pad.id].owner = 'player';
    s.raids.push({ id: 'r2', attacker: 'blenders', target: pad.id, objective: 'shakedown', party: [], detected: false, eta: '12:30', delivery: true, warned: true });
    expect(takeCall(s)).toMatchObject({ who: 'blenders', text: '', raid: 'r2' }); // not tonight's "blend your stand" line
    s.day++;
    expect(takeCall(s)).toBeNull(); // once
  });

  it("read each boss's Attention from the first dawn: no calls on the first mornings, one when you move in by their turf", () => {
    const camp = newGame(36);
    playDay(camp);
    playDay(camp);
    expect(camp.phone!.queue.filter((c) => c.who !== 'blenders')).toEqual([]); // the first dawn only reads their moods: Days 2 and 3 are quiet but for Brock
    const s = newGame(37, { mode: 'sandbox' });
    playDay(s);
    const rivals = Object.keys(s.rivals) as RivalId[];
    const borders = () => rivals.map((r) => sharedBorders(s, r));
    const before = borders();
    const lot = PLOTS.find((p) => {
      if (s.plots[p.id].owner) return false;
      s.plots[p.id].owner = 'player';
      const more = borders().some((n, i) => n > before[i]);
      s.plots[p.id].owner = null;
      return more;
    })!;
    s.plots[lot.id].owner = 'player'; // land of yours on a boss's border (src/sim/rivalAi.ts): their Attention jumps
    const keen = rivals.filter((r, i) => sharedBorders(s, r) > before[i]);
    s.phone!.queue = s.phone!.queue.filter((c) => c.text !== LINES.brockFirst); // Brock's Day 1 call aside
    expect(takeCall(s)).toBeNull();
    playDay(s);
    // (Vera may ring first about your Threat: more land can lift it.) The boss's own pool fills the line in.
    expect(s.phone!.queue.some((c) => keen.includes(c.who) && c.mood === 'warn' && c.text === '' && !c.raid)).toBe(true);
  });

  it("the rivals' schemes ring the Corner: Juni phones when her smear posters go up", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const s = newGame(seed);
      s.day = 10;
      const job = startScheme(s, 'coldbrew', 'posters')!;
      if (job.caught) { expect(s.phone!.queue).toEqual([]); continue; } // caught in the act: nothing to crow about
      expect(s.news.some((n) => n.startsWith('Juni:'))).toBe(false); // a call now, not a news line
      expect(takeCall(s)).toMatchObject({ who: 'coldbrew', text: SCHEMES.posters.taunt, mood: 'gloat' });
      return;
    }
    throw new Error('no posters went up in 40 seeds');
  });

  it("a daytime raid of yours gets its call at the next dawn, and the Bugle after the call reports the boss's moves", () => {
    const s = newGame(34, { mode: 'sandbox' });
    s.battles.push({ day: s.day, attacker: 'player', defender: 'blenders', target: 'x', outcome: 'robbed' } as BattleReport);
    s.rivals.blenders.grudge += 20;
    phoneCheck(s);
    expect(takeCall(s)).toBeNull(); // "at dawn he calls"
    s.day++;
    expect(takeCall(s)).toMatchObject({ who: 'blenders', text: LINES.brockRent });
    const lot = PLOTS.find((p) => p.type === 'street' && !s.plots[p.id].owner)!;
    s.plots[lot.id].owner = 'blenders'; // Brock grabs a plot after the call
    s.day++;
    s.news.length = 0;
    phoneCheck(s, true); // the next dawn
    expect(s.news).toContain('Bugle: The Boardwalk Blenders grab 1 plot after the call.');
    s.day++;
    expect(bossBrief(s)).toBeNull(); // nobody rang yesterday
  });
});

describe("Lottie's goals", () => {
  it('always shows exactly 3, with story goals marked, in every mode', () => {
    for (const settings of [{}, { mode: 'sandbox' as const, win: 'economic' as const }, { mode: 'sandbox' as const }, { mode: 'endless' as const }]) {
      const s = newGame(21, settings);
      for (let d = 0; d < 3; d++) {
        const goals = goalsNow(s);
        expect(goals.map((g) => g.slot)).toEqual(['short', 'medium', 'long']);
        expect(goals.every((g) => g.text && !g.done)).toBe(true);
        nextDawn(s);
      }
      expect(goalsNow(s)[2].story ?? false).toBe(!('mode' in settings)); // the campaign's act goal
    }
  });

  it('pay once when ticked off, and scale with the empire', () => {
    const s = newGame(22);
    expect(goalsNow(s)[0].text).toBe('Sell out your first pitcher'); // Lottie stocked the table: price is today's lesson
    expect(s.goals!.slots.short).toBe('lesson-pitcher');
    const cash = s.cash;
    s.today.customers = CUPS_PER_PITCHER;
    checkGoals(s);
    expect(s.cash).toBe(cash + goalReward(s, 'short'));
    expect(s.news.some((n) => n.includes('Sell out your first pitcher'))).toBe(true);
    checkGoals(s);
    expect(s.cash).toBe(cash + goalReward(s, 'short')); // paid once
    expect(s.goals!.slots.short).toBe('sales-1'); // the next goal takes the slot
    // A bigger empire sells more: the day's sales target grows with the stands.
    const one = salesTarget(s);
    const big = newGame(22);
    for (const p of PLOTS.filter((p) => p.district === 'maple' && !big.plots[p.id].owner).slice(0, 4)) {
      big.plots[p.id].owner = 'player';
      big.plots[p.id].stand = structuredClone(big.plots[LOTTIES_CORNER].stand);
    }
    big.goals!.sales = undefined;
    expect(salesTarget(big)).toBeGreaterThan(one * 1.5);
    // Rewards scale with an average recent day's sales.
    big.history.push({ ...big.today, revenue: 4000 }, { ...big.today, revenue: 4000 });
    expect(goalReward(big, 'short')).toBe(400);
    expect(goalReward(big, 'long')).toBe(2000);
  });

  it('never run dry in Endless Summer', () => {
    const s = newGame(23, { mode: 'endless' });
    s.rank = 10;
    for (let i = 0; i < 4; i++) {
      checkGoals(s);
      const goals = goalsNow(s);
      expect(goals.every((g) => !g.done)).toBe(true);
      expect(goals[2].text).toMatch(/^Top your best: \$/);
      s.cash += 1e7; // meet the Peak target; a new one takes its place
      s.peakScore += 1e7;
    }
  });

  it('never sit done in Endless, even when a target is passed off the card or the land runs out', () => {
    const s = newGame(38, { mode: 'endless' });
    s.rank = 9;
    checkGoals(s);
    expect(goalsNow(s)[2].text).toMatch(/^Reach Rank 10/);
    s.cash += 3e8; // past Rank 10 and the first Peak target at once, while Rank 10 is on the card
    checkGoals(s);
    s.rank = 10;
    checkGoals(s);
    expect(goalsNow(s)[2]).toMatchObject({ done: false, text: expect.stringMatching(/^Top your best/) });
    for (const p of PLOTS.filter((p) => ['street', 'prime', 'landmark'].includes(p.type))) {
      s.plots[p.id].owner = 'player'; // no land left for one more stand
      s.plots[p.id].stand ??= structuredClone(s.plots[LOTTIES_CORNER].stand);
    }
    checkGoals(s);
    for (let d = 0; d < 3; d++) {
      expect(goalsNow(s).every((g) => !g.done)).toBe(true);
      expect(goalsNow(s)[1].text).not.toMatch(/stands$/);
      nextDawn(s);
    }
  });

  it("Endless: the Out-of-Towner's date in town takes the medium goal until it's run out of town; each date is a new goal", () => {
    const s = newGame(39);
    for (const id of BAY_RIVALS) s.rivals[id].alive = false; // a won campaign that keeps squeezing, the Bay's land back on the market
    for (const p of PLOTS) {
      const ps = s.plots[p.id];
      if (ps.owner && ps.owner !== 'player') s.plots[p.id] = { ...ps, owner: p.type === 'hq' ? 'player' : null, stand: null, invested: 0, garrison: 0 };
    }
    s.rank = 9;
    s.outcome = { result: 'won', how: 'domination', day: s.day };
    expect(keepSqueezing(s)).toBe(true);
    const towner = OUT_OF_TOWNER.id, run = /^Run Snootwater Springs out of town$/;
    const toTown = () => { while (!s.rivals[towner].alive) { s.day++; outOfTownerAtDawn(s); } checkGoals(s); };
    checkGoals(s);
    expect(goalsNow(s)[1].text).not.toMatch(run); // not before it comes
    const before = s.goals!.slots.medium;
    toTown();
    expect(goalsNow(s)[1]).toMatchObject({ text: expect.stringMatching(run), done: false, progress: 0 });
    expect(s.goals!.slots.medium).not.toBe(before); // it steps in ahead of the goal the card showed
    const theirs = PLOTS.filter((p) => s.plots[p.id].owner === towner);
    s.plots[theirs[0].id] = { ...s.plots[theirs[0].id], owner: 'player' };
    expect(goalsNow(s)[1].progress).toBeCloseTo(1 - (theirs.length - 1) / theirs.length);
    for (const p of theirs) s.plots[p.id] = { ...s.plots[p.id], owner: 'player' }; // its last plot lost: it goes home at dawn
    rivalsBankrupt(s);
    expect(s.rivals[towner].alive).toBe(false);
    checkGoals(s);
    expect(s.news.some((n) => /^✓ Run Snootwater Springs out of town \+\$/.test(n))).toBe(true); // Lottie pays for it
    expect(goalsNow(s)[1].text).not.toMatch(run);
    toTown(); // its next date
    expect(goalsNow(s)[1]).toMatchObject({ text: expect.stringMatching(run), done: false });
  });

  it("the Summer Fair's Taste-Off is Act 1's long goal in its week: a win pays, a loss takes it off the card", () => {
    for (const winner of ['player', 'blenders'] as const) {
      const s = newGame(35);
      s.day = festivalDays('summerFair', 1).from - 1;
      nextDawn(s); // the fair opens
      expect(goalsNow(s)[2]).toMatchObject({ text: `Win the Summer Fair Taste-Off on Day ${SUMMER_FAIR_DAY}`, story: true, done: false });
      s.world!.fairs.push({ fair: 'summerFair', day: s.day, winner } as never); // judged (src/sim/calendar.ts)
      const cash = s.cash;
      checkGoals(s);
      if (winner === 'player') expect(s.cash).toBeGreaterThan(cash);
      else expect(s.cash).toBe(cash);
      expect(goalsNow(s)[2].text).toBe('Learn the trade, one idea a day');
    }
  });

  it('a story goal from another system takes its slot, wears the page icon and pays', () => {
    const s = newGame(35);
    let met = false;
    const kids = { id: 'kids-day', slot: 'medium' as const, goal: () => ({ text: 'Leave them alone until dusk', progress: met ? 1 : 0.5, done: met }) };
    GOAL_PROVIDERS.push(kids);
    try {
      checkGoals(s);
      expect(goalsNow(s)[1]).toMatchObject({ text: 'Leave them alone until dusk', story: true });
      const cash = s.cash;
      met = true;
      checkGoals(s);
      expect(s.cash).toBe(cash + goalReward(s, 'medium'));
      expect(goalsNow(s)[1].text).toBe('Open a second stand'); // back to the goal it stepped in front of
    } finally {
      GOAL_PROVIDERS.splice(GOAL_PROVIDERS.indexOf(kids), 1);
    }
  });

  it('a slot keeps its goal until done; only a lesson or story goal steps in ahead of it', () => {
    const s = newGame(36);
    s.day = LESSON_DAY.upgrade; // the Grow tab is out
    s.plots[LOTTIES_CORNER].stand!.level = 2; // the Wooden Stand is up
    checkGoals(s);
    expect(goalsNow(s)[1].text).toBe('Fence the Corner'); // Day 3's lesson, still open
    s.plots[LOTTIES_CORNER].defense.tier = 1;
    checkGoals(s);
    expect(goalsNow(s)[1].text).toBe('Open a second stand');
    s.rank = 5; // new unlocks rank ahead of it (the Kiosk first), but the card doesn't switch under you
    checkGoals(s);
    expect(goalsNow(s)[1].text).toBe('Open a second stand');
    s.day = LESSON_DAY.marketing; // a lesson does: the sign's, from Day 6
    checkGoals(s);
    expect(goalsNow(s)[1].text).toBe('Paint your first sign');
  });

  it("with the lessons on, the Wooden Stand is Day 5's goal: Days 1-4 show the second stand; lessons off, it follows rank", () => {
    const s = newGame(37);
    s.plots[LOTTIES_CORNER].defense.tier = 1; // Day 3's fence is up
    for (let d = 1; d < LESSON_DAY.upgrade; d++) {
      s.day = d;
      checkGoals(s);
      expect(goalsNow(s)[1].text, `Day ${d}`).toBe('Open a second stand');
      expect(goalsNow(s).some((g) => g.text.includes('Wooden Stand')), `Day ${d}`).toBe(false); // the Grow tab is hidden till Day 5
    }
    s.day = LESSON_DAY.upgrade; // Day 5: the upgrade lesson steps in ahead of the second stand
    checkGoals(s);
    expect(goalsNow(s)[1].text).toBe('Build the Wooden Stand');
    const off = newGame(37, { lessons: false }); // a Rank 1 build, from Day 1
    checkGoals(off);
    expect(goalsNow(off)[1].text).toBe('Build the Wooden Stand');
  });

  it("never forget a goal still on the card, so today's sales goal pays once", () => {
    const s = newGame(37, { mode: 'sandbox', lessons: false });
    s.goals!.done = Array.from({ length: 85 }, (_, i) => `old-${i}`); // a long run's worth of ticked-off goals
    const cash = s.cash;
    s.today.customers = salesTarget(s);
    checkGoals(s);
    checkGoals(s);
    expect(s.cash).toBe(cash + goalReward(s, 'short'));
    expect(s.goals!.done.length).toBeLessThanOrEqual(80);
  });
});

describe('lessons and Dex', () => {
  it("Day 2's recipe goal is met by the best card in your book, not one you don't have yet", () => {
    const s = newGame(32);
    s.day = 1;
    nextDawn(s);
    const st = s.plots[s.selected].stand!;
    let best = -1, pick = { recipe: st.recipe, sweetness: st.sweetness };
    for (const recipe of ownedRecipes(s)) for (const sweetness of ['less', 'classic', 'extra'] as const) {
      Object.assign(st, { recipe, sweetness });
      const c = averageStopChance(s, s.selected, s.forecast);
      if (c > best) { best = c; pick = { recipe, sweetness }; }
    }
    Object.assign(st, pick);
    expect(recipeMatch(s)).toBeCloseTo(1);
    expect(ownedRecipes(s)).toContain(st.recipe);
  });

  it('teach one system a day, unless switched off', () => {
    const s = newGame(24);
    expect(taught(s, 'recipes')).toBe(false);
    s.day = 2;
    expect(taught(s, 'recipes')).toBe(true);
    expect(taught(s, 'market')).toBe(true); // you buy your own from Day 2
    expect(taught(s, 'threat')).toBe(false);
    s.day = 3;
    expect(taught(s, 'threat') && taught(s, 'defense')).toBe(true); // Threat lemons and the Picket Fence come together, before Night 3's raid
    expect(taught(s, 'upgrade')).toBe(false);
    s.day = 5;
    expect(taught(s, 'upgrade')).toBe(true);
    expect(taught(newGame(25, { lessons: false }), 'land')).toBe(true);
    s.settings.lessons = false; // the Options switch, mid-run: every button follows rank alone
    expect(taught(s, 'land')).toBe(true);
  });

  it("the Land Registry menu waits for Week 2's land lesson; with lessons off it opens with land for sale", () => {
    const s = newGame(33);
    expect(menuUnlocked(s, 'registry')).toBe(false); // Maple Row's plots still sell from a tap on the map
    expect(menuScreen(s, 'index', { head: ['', ''], goals: [], crew: () => '', options: { ...DEFAULT_OPTIONS, keys: defaultKeys() } })).not.toContain('data-menu="registry"');
    s.day = LESSON_DAY.land;
    expect(menuUnlocked(s, 'registry')).toBe(true);
    expect(menuUnlocked(newGame(34, { lessons: false }), 'registry')).toBe(true);
  });

  it("Dex taking his post himself ticks the lesson off unpaid, and the tutorial raid goes straight at Dex's post", () => {
    const s = newGame(29);
    const lot = PLOTS.find((p) => p.district === 'maple' && p.type === 'street' && !s.plots[p.id].owner)!;
    s.plots[lot.id].owner = 'player';
    s.plots[lot.id].stand = structuredClone(s.plots[LOTTIES_CORNER].stand);
    s.day = 3;
    s.tutorialRaidDone = false;
    nextDawn(s);
    s.news.length = 0;
    openStand(s);
    simulateRestOfDay(s); // nobody stations him
    const dex = s.guards.find((g) => g.name === 'Dex Moody')!;
    expect(dex.post).toBe(LOTTIES_CORNER);
    expect(s.alerts!.find((a) => a.text.startsWith('Dex: "Nobody posted me.'))).toMatchObject({ kind: 'note', plot: LOTTIES_CORNER }); // Go There: his post
    expect(s.goals!.done).toContain('lesson-dex');
    expect(s.news.some((n) => n.startsWith('✓ Station Dex'))).toBe(false); // nobody stationed him: no reward
    postGuard(s, dex.id, lot.id);
    s.day = TUTORIAL_RAID_DAY;
    s.raids = [];
    planNight(s);
    expect(s.raids.find((r) => s.plots[r.target].owner === 'player')).toMatchObject({ attacker: 'blenders', target: lot.id, detected: true });
  });

  it('Dex joins on Day 4, not at the first rank-up, and takes the Corner himself if nobody stations him', () => {
    const s = newGame(26);
    s.cash = 2500; // enough Success Score for Rank 2 at the first closing
    playDay(s);
    expect(s.rank).toBeGreaterThanOrEqual(2);
    expect(s.guards).toHaveLength(0);
    expect(s.recruits.length).toBeGreaterThan(0); // the Hiring Hall opens with the rank
    s.day = 3;
    nextDawn(s);
    const dex = s.guards.find((g) => g.name === 'Dex Moody')!;
    expect(dex.post).toBeNull(); // stationing him is today's lesson
    expect(s.alerts!.find((a) => a.text.startsWith('Dex Moody joins'))).toMatchObject({ kind: 'note', plot: LOTTIES_CORNER });
    expect(s.goals!.slots.short).toBe('lesson-dex');
    expect(s.scenes!.queue.map((q) => q.id)).toContain('dex');
    playDay(s);
    expect(dex.post).toBe(LOTTIES_CORNER);
    const t = newGame(27, { lessons: false });
    t.day = 3;
    nextDawn(t);
    expect(t.guards.find((g) => g.name === 'Dex Moody')?.post).toBe(t.selected);
  });

  it("Day 3's side lot lands as a card whose Go There opens it", () => {
    const s = newGame(31);
    s.day = 2;
    nextDawn(s);
    const card = s.alerts!.find((a) => a.text.startsWith('Side lot by the Corner'))!;
    expect(card).toMatchObject({ kind: 'note', day: 3 });
    expect(s.plots[card.plot!].dibs).toMatchObject({ who: 'player', table: true });
  });

  it('stationing Dex on his day ticks the lesson off', () => {
    const s = newGame(28);
    s.day = 3;
    nextDawn(s);
    const dex = s.guards.find((g) => g.name === 'Dex Moody')!;
    const cash = s.cash;
    postGuard(s, dex.id, LOTTIES_CORNER);
    checkGoals(s);
    expect(s.cash).toBeGreaterThan(cash);
    storyAtDawn(s); // safe to run again
    expect(goalsNow(s)).toHaveLength(3);
  });

  it("menus wait for their lessons: the Hiring Hall for Dex's day, the rank badge for its own, the Bugle's forecast for Day 2", () => {
    const s = newGame(36);
    s.cash = 2500;
    playDay(s); // Rank 2 at the first closing: recruits wait in the Hiring Hall
    expect(s.rank).toBeGreaterThanOrEqual(2);
    expect(s.recruits.length).toBeGreaterThan(0);
    for (; s.day < LESSON_DAY.crew; nextDawn(s)) {
      expect(menuUnlocked(s, 'crew')).toBe(false);
      expect(menuUnlocked(s, 'rank')).toBe(s.day >= LESSON_DAY.rank);
    }
    expect(menuUnlocked(s, 'crew')).toBe(true);
    const t = newGame(37);
    const parts = { head: ['', ''] as [string, string], goals: [], crew: () => '', options: { ...DEFAULT_OPTIONS, keys: defaultKeys() } };
    expect(menuScreen(t, 'bugle', parts)).not.toContain('4 days in 5'); // Day 1: no forecast yet
    t.day = LESSON_DAY.forecast;
    expect(menuScreen(t, 'bugle', parts)).toContain('4 days in 5');
  });

  it('an unpaid Dex stays (Loyal never quits) and joins once a run; an unpaid hire quits instead', () => {
    const s = newGame(35);
    s.day = 3;
    nextDawn(s); // Day 4: Dex joins
    const dex = s.guards.find((g) => g.name === 'Dex Moody')!;
    Object.assign(dex, { level: 3, xp: 9, weapon: 'clubs', gear: 'vest', post: LOTTIES_CORNER });
    const was = structuredClone(dex);
    s.cash = 0; // below his wage
    nextDawn(s); // Day 5
    const kept = ({ id, name, level, weapon, gear, trait }: typeof was) => ({ id, name, level, weapon, gear, trait });
    expect(s.guards.map(kept)).toEqual([kept(was)]); // the same Dex: his level and kit (a night's duty may add XP)
    expect(s.news).toContain(`${was.name} stays on without pay. "Loyal to the last drop, Miss Lottie."`);
    expect(s.news.some((n) => n.includes('quits'))).toBe(false);
    expect(s.alerts!.some((a) => a.text.startsWith('Dex Moody joins') && a.day === s.day)).toBe(false); // no fresh Dex
    expect(s.story!.dexJoined).toBe(true);
    const hire = { ...was, id: 'g99', name: 'Rosa', trait: 'Hothead' as const, post: null };
    s.guards.push(hire);
    s.cash = 0;
    nextDawn(s);
    expect(s.guards.map((g) => g.id)).toEqual([was.id]); // the hire walks, Dex stays
    expect(s.news).toContain(`${hire.name} quits: "No pay, no play."`);
    const old = migrateSave(JSON.parse(JSON.stringify({ ...s, story: { act: 1, since: 1 } })))!; // a save from before the flag
    expect(old.story!.dexJoined).toBe(true);
  });
});

describe('the Grandkid and the crew', () => {
  it('the Grandkid is Charlie Puckett until the New Game screen says otherwise; the name, pronouns and look save with the run', () => {
    const s = newGame(41);
    expect(grandkid(s)).toMatchObject({ name: KID_NAME, first: 'Charlie', pronouns: 'they', kin: 'grandkid', their: 'their', look: 0 });
    expect(kidLook(s)).toEqual(KID_LOOKS[0]);
    const st = defaultSettings();
    expect(kidPanel(st)).toContain(`value="${KID_NAME}"`);
    expect(kidPanel(st)).toContain(`value="${CREW_NAME}"`);
    expect(kidPanel(st).match(/data-key="kid.look"/g)).toHaveLength(KID_LOOKS.length);
    expect(kidPanel(st)).toContain('class="cl-pick on" data-action="pick" data-key="kid.look" data-value="0"');
    typeName(st, 'kid', 'Sam "<b>" Rivera'); // a name field takes each letter as typed, with no markup
    pickKid(st, 'pronouns', 'she');
    pickKid(st, 'look', '3');
    pickKid(st, 'look', '99'); // no such look: the last one stays
    expect(st.grandkid).toEqual({ name: 'Sam b Rivera', pronouns: 'she', look: 3 });
    expect(kidPanel(st)).toContain('value="Sam b Rivera"');
    expect(kidPanel(st)).toContain('data-value="she" aria-pressed="true"');
    typeName(st, 'kid', ' Sam  Rivera ');
    const t2 = newGame(42, st);
    expect(grandkid(t2)).toMatchObject({ name: 'Sam Rivera', first: 'Sam', pronouns: 'she', kin: 'granddaughter', their: 'her', look: 3 });
    expect(kidLook(t2)).toEqual(KID_LOOKS[3]);
    const back = migrateSave(JSON.parse(JSON.stringify(t2)))!;
    expect(grandkid(back).name).toBe('Sam Rivera');
    expect(grandkid(migrateSave(JSON.parse(JSON.stringify({ ...t2, settings: { ...t2.settings, grandkid: undefined } })))!).name).toBe(KID_NAME);
    expect(nameDraft('x'.repeat(40))).toHaveLength(NAME_MAX); // short enough for a phone's alert card
    setGrandkid(st, { name: '   ' });
    expect(grandkid(st).name).toBe(KID_NAME); // a blank name is Charlie again
  });

  it('the grandkid at your stands wears the New Game look: its skin and hair on the clay kid, cap, apron and freckles kept', () => {
    const s = newGame(46, defaultSettings({ grandkid: { name: 'Sam Rivera', pronouns: 'she', look: 3 } }));
    expect(kidSpec(kidLook(s))).toEqual({ ...SPECS.kid, skin: KID_LOOKS[3].skin, hairColor: KID_LOOKS[3].hairColor });
    expect(kidSpec(kidLook(newGame(47)))).toEqual(SPECS.kid); // look 0 is the clay kid as drawn
    expect(kidSpec()).toEqual(SPECS.kid);
  });

  it("the story uses them: Lottie's opening line, the Bugle's Day 1 and rank-up stories, and the rank-up toast", () => {
    const st = defaultSettings({ grandkid: { name: 'Sam Rivera', pronouns: 'he', look: 1 } });
    const s = newGame(43, st);
    expect(bugleHeadline(s)).toEqual(["SCHOOL'S OUT!", 'Sam opens on Maple Row']);
    expect(frontPage(s).headline).toEqual(["SCHOOL'S OUT!", 'Sam opens on Maple Row']);
    const sc = beginScene(s)!;
    expect(sc.id).toBe('opening');
    expect(sc.lines[0].text).toBe('Sam! My folding table. My pitcher. And three pages.');
    expect(playingScene(s)!.lines[0].text).toBe(sc.lines[0].text);
    expect(sc.replies).toContain('Okay, Grandma. One town, coming up.'); // the Grandkid's signature quick reply
    endScene(s, true);
    s.cash = 5000; // a rank-up at close
    playDay(s);
    expect(s.news.some((n) => n.startsWith('RANK UP! Sam is now a '))).toBe(true);
    expect(s.world!.paper?.rankUp).toBeGreaterThan(1);
    const all = JSON.stringify(frontPage(s));
    expect(all).toContain('Sam now a ');
  });

  it('the crew is The Peel Patrol until renamed, and every crew-facing line names it; a name never carries markup', () => {
    const s = newGame(44);
    expect(crewName(s)).toBe(CREW_NAME);
    welcomeDex(s);
    const theirs = PLOTS.find((p) => s.plots[p.id].owner === 'blenders' && s.plots[p.id].stand)!.id;
    const raid = (id: string) => fightRaid(s, { id, attacker: 'player', target: theirs, objective: 'smash', guards: s.guards.map((g) => g.id), detected: false, eta: '' }, true);
    const first = raid('r1');
    expect(first.crew).toBe(CREW_NAME);
    expect(battleHeadline(first)).toContain(CREW_NAME);
    expect(s.news).toContain(battleHeadline(first));
    renameCrew(s, '  Sour <Patch> Kids ');
    expect(s.settings.crew).toBe('  Sour Patch Kids ');
    expect(crewName(s)).toBe('Sour Patch Kids');
    expect(crewField(s)).toContain('value="  Sour Patch Kids "');
    for (const g of s.guards) g.outUntil = 0;
    const second = raid('r2');
    expect(crewOf(second)).toBe('Sour Patch Kids');
    expect(battleHeadline(second)).toContain('Sour Patch Kids');
    expect(battleHeadline(first)).toContain(CREW_NAME); // an old report keeps the name it fought under
    expect(battleHeadline({ ...first, crew: undefined })).toContain(CREW_NAME); // a save from before the name
    nextDawn(s);
    expect(JSON.stringify(frontPage(s)).toLowerCase()).toContain('sour patch kids'); // the Bugle's raid story
    // HQ capture news (rivals.ts), with the name on the Boss Room's report.
    const reports: BattleReport[] = [];
    const input = { attackers: [], defenders: [], objective: 'smash', perimeter: 0 } as unknown as BattleInput;
    const res = { winner: 'att', outcome: 'smashed', events: [], duration: 1, koed: [], fled: [] } as unknown as BattleResult;
    expect(hqStageOver(s, 'blenders', 'boss', input, res, reports)).toBe('won');
    expect(reports[0].crew).toBe('Sour Patch Kids');
    expect(s.news.some((n) => /Sour Patch Kids takes .+!$/.test(n))).toBe(true);
    expect(battleHeadline(reports[0])).toContain('Sour Patch Kids storms');
    renameCrew(s, '');
    expect(crewName(s)).toBe(CREW_NAME); // blank: The Peel Patrol again
    const st = defaultSettings();
    typeName(st, 'crew', 'Lemon Heads');
    expect(crewName(newGame(45, st))).toBe('Lemon Heads'); // named on the New Game screen
  });

  it('your crew cheers its own name when it wins a fight: "Peel Patrol!" until renamed, never a rival\'s line', () => {
    const s = newGame(48);
    expect(BRAWL.win.player).toContain('Peel Patrol!'); // the fight cloud's cheer (world/barks.ts) that names the crew
    expect(BRAWL.win.player.map((t) => crewCheer(s, t))).toEqual(BRAWL.win.player);
    renameCrew(s, 'Sour Patch Kids');
    expect(crewCheer(s, 'Peel Patrol!')).toBe('Sour Patch Kids!');
    expect(BRAWL.win.player.map((t) => crewCheer(s, t))).not.toContain('Peel Patrol!');
    expect(crewCheer(s, 'Squeeze!')).toBe('Squeeze!'); // the other cheers stay
    renameCrew(s, 'the Rind Gang');
    expect(crewCheer(s, 'Peel Patrol!')).toBe('Rind Gang!'); // shouted without "The", as Dex says it
    expect(crewCall(s)).toBe('Rind Gang');
    expect(dexGooseLine(s)).toMatch(/^Rind Gang, hold the line!/);
  });
});

describe("the tone guide's lines on triggers that exist", () => {
  it("Dex shouts at Honkers when the goose at his post stuns a raider, by your crew's name, once a day", () => {
    const s = newGame(61);
    welcomeDex(s);
    const dex = s.guards[0];
    dex.post = LOTTIES_CORNER;
    s.plots[LOTTIES_CORNER].defense = { tier: 1, fenceHp: PERIMETERS[0].hp, gadgets: ['goose'] };
    const raid = () => fightRaid(s, { id: `r${s.nextId++}`, attacker: 'blenders', target: LOTTIES_CORNER, objective: 'smash', party: raidPartyFor(s, 'blenders').slice(0, 3), detected: true, eta: '23:00' }, true);
    const said = (text: string) => (s.alerts ?? []).filter((a) => a.text === `Dex: "${text}"`).length;
    const line = 'Peel Patrol, hold the line! Not you, Honkers. You hold that line over there.';
    expect(dexGooseLine(s)).toBe(line); // the spec's line, from The Peel Patrol
    const b = raid();
    expect(b.events.some((e) => e.type === 'stun' && e.by === 'goose')).toBe(true);
    expect(said(line)).toBe(1);
    raid();
    expect(said(line)).toBe(1); // once a day
    renameCrew(s, 'Lemon Heads');
    s.day++;
    dex.outUntil = 0;
    raid();
    expect(said('Lemon Heads, hold the line! Not you, Honkers. You hold that line over there.')).toBe(1);
    s.day++;
    dex.outUntil = 0;
    dex.post = null; // Dex is somewhere else: Honkers holds the line alone
    raid();
    expect((s.alerts ?? []).filter((a) => a.day === s.day && a.text.startsWith('Dex: "Lemon Heads'))).toHaveLength(0);
  });

  it("a record day: Marisol says the real percentage; her first in the campaign is a visit with the Ledger", () => {
    const close = (s: GameState, revenue: number) => {
      s.history.push({ ...structuredClone(s.today), day: s.day, revenue, supplies: 0, cupCosts: 0, upkeep: 0, books: { sales: revenue }, stockUsed: 0, stockOn: {} });
      storyAtClose(s);
      s.day++;
    };
    const s = newGame(62);
    close(s, 100);
    expect(s.story!.bestDay).toBe(100);
    close(s, 100 * (1 + RECORD_GAIN) - 1); // up, but not by enough
    expect(s.scenes!.queue.some((q) => q.id === 'marisol')).toBe(false);
    close(s, 150);
    const visit = s.scenes!.queue.find((q) => q.id === 'marisol')!;
    expect(sceneDef(visit.id, visit.data)).toMatchObject({ speaker: 'marisol', until: s.day });
    expect(visit.data!.lines!.map((l) => l.text)).toEqual([`Profit's up ${Math.round((150 / 109 - 1) * 100)} percent.`, "Please don't celebrate by buying another goose.", 'Marisol keeps our books, kid. Mind her.']);
    close(s, 200); // the next record: her line in the news
    expect(s.news).toContain(`Marisol: "${marisolLine(33)}"`);
    expect(s.story!.bestDay).toBe(200);
    // Sandbox: no scenes, just her line; a save from before the record keeping takes its best day off the books.
    const t = newGame(63, { mode: 'sandbox' });
    close(t, 80);
    close(t, 120);
    expect(t.news).toContain(`Marisol: "${marisolLine(50)}"`);
    const old = migrateSave(JSON.parse(JSON.stringify({ ...t, story: { act: 1, since: 1 } })))!;
    expect(old.story!.bestDay).toBe(Math.max(...t.history.map(dayProfit)));
  });

  it("Tilly's line when you raid a Hollis plot; Brock's fence line rides his warnings", () => {
    const s = newGame(64);
    welcomeDex(s);
    phoneCheck(s, true); // the phone notes every boss's mood
    const theirs = PLOTS.find((p) => s.plots[p.id].owner === 'hollis' && p.type !== 'hq')!.id;
    fightRaid(s, { id: 'h1', attacker: 'player', target: theirs, objective: 'smash', guards: s.guards.map((g) => g.id), detected: false, eta: '' }, true);
    phoneCheck(s, true);
    expect(s.phone!.queue.some((c) => c.who === 'hollis' && c.text === LINES.tillyRaided)).toBe(true);
    expect(LINES.brockFence).toBe('Your fence is cute, bro. My guys are gonna do pull-ups on it.'); // tested with his warnings above
  });
});

describe('Endless: beaten bosses cameo', () => {
  const BEATEN: RivalId[] = ['blenders', 'coldbrew', 'hollis', 'fizzco'];
  const calls = (s: GameState, who: RivalId) => (s.phone?.queue ?? []).filter((c) => c.who === who && c.tip).map((c) => c.text);

  it('the beaten bosses take turns, each in a way that fits their exit', () => {
    const s = newGame(71, { mode: 'endless' });
    for (const r of BEATEN) eliminate(s, r, 'buyout');
    s.raids = [];
    s.rivals.sourwood.grudge = 10;
    const d0 = s.day;
    const closeOn = (day: number) => { s.day = day; cameosAtClose(s); };
    closeOn(d0); // noted as they fall: nobody cameos the day of their own exit
    closeOn(d0 + CAMEO_DAYS - 1);
    expect(s.story!.cameoDay).toBeUndefined();
    closeOn(d0 + CAMEO_DAYS); // Brock's surf school makes tomorrow's Bugle
    expect(cameoStories(s)).toEqual([]);
    s.day++;
    expect(cameoStories(s)).toEqual([["SURF'S UP!", "Brock Bodine's surf school opens for the season", `Brock Bodine's surf school opens for the season: "The ocean never raided anybody, bro."`, 3.4]]);
    closeOn(d0 + CAMEO_DAYS + 1);
    expect(s.story!.cameoDay).toBe(d0 + CAMEO_DAYS); // one every CAMEO_DAYS days
    closeOn(d0 + 2 * CAMEO_DAYS); // Juni phones in as an informant (Vera's quiet), tomorrow, from out of the game
    expect(calls(s, 'coldbrew')).toEqual([juniQuietTip('sourwood')]);
    expect(s.phone!.queue.find((c) => c.who === 'coldbrew')!.from).toBe(s.day + 1);
    closeOn(d0 + 3 * CAMEO_DAYS); // Tilly the judge
    expect(s.story!.cameoNews).toEqual({ day: s.day + 1, who: 'hollis', n: 0 });
    closeOn(d0 + 4 * CAMEO_DAYS); // Preston, from the tow truck
    expect(calls(s, 'fizzco')).toEqual([PRESTON_CALLS[0]]);
    closeOn(d0 + 5 * CAMEO_DAYS); // round again, with Brock's next line
    s.day++;
    expect(cameoStories(s)[0][0]).toBe(CAMEO_NEWS.blenders![1][0]);
    s.day--;
    // Juni's next turn: tonight's raid on you rings tonight, before its warning is out.
    s.phone!.queue = [];
    s.raids = [{ id: 'v1', attacker: 'sourwood', target: LOTTIES_CORNER, objective: 'smash', party: [], detected: false, eta: '23:30' } as Raid];
    closeOn(d0 + 6 * CAMEO_DAYS);
    expect(calls(s, 'coldbrew')).toEqual([juniRaidTip('sourwood', LOTTIES_CORNER)]);
    expect(juniRaidTip('sourwood', LOTTIES_CORNER)).toBe("Vera's crew hits the Corner tonight. You didn't hear it from me.");
    expect(s.phone!.queue[0]).toMatchObject({ until: s.day, priority: CALL_PRIORITY.story });
    expect(takeCall(s)?.text).toBe(juniRaidTip('sourwood', LOTTIES_CORNER)); // she's out of the game, and still rings
    // With a grudge past the phone's 30 she names it; with nobody left, she says so.
    expect(juniGrudgeTip('sourwood')).toBe('Psst. Vera has it in for you. Lock up. Consider me decaf.');
    expect(JUNI_NOBODY).toMatch(/^Nobody left/);
  });

  it("Tilly rings the County Fair's judging morning; none of it outside Endless", () => {
    const s = newGame(72, { mode: 'endless' });
    const fair = () => { s.world!.tasteOff = { fair: 'countyFair', day: s.day, district: 'groves', judges: [], vs: ['local'], entry: {} }; };
    fair();
    cameosAtDawn(s);
    expect(calls(s, 'hollis')).toEqual([]); // she's still in the game: she enters, not judges
    eliminate(s, 'hollis', 'buyout');
    fair();
    cameosAtDawn(s);
    expect(calls(s, 'hollis')).toEqual([TILLY_JUDGES]);
    // Sandbox and a story run before Keep squeezing: no cameos; the Epilogue has them.
    for (const mode of ['sandbox', 'campaign'] as const) {
      const t = newGame(73, { mode });
      for (const r of BEATEN) eliminate(t, r, 'buyout');
      t.raids = [];
      for (let d = 0; d <= 3 * CAMEO_DAYS; d++) { cameosAtClose(t); t.day++; }
      expect(t.story!.cameos).toBeUndefined();
      if (mode === 'campaign') {
        t.endlessSince = t.day;
        for (let d = 0; d <= CAMEO_DAYS; d++) { cameosAtClose(t); t.day++; }
        expect(t.story!.cameoNews).toMatchObject({ who: 'blenders', n: 0 });
      }
    }
  });

  it("a cameo at closing makes the next morning's Bugle", () => {
    const s = newGame(74, { mode: 'endless' });
    eliminate(s, 'blenders', 'buyout');
    s.story!.cameos = { blenders: { day: s.day - CAMEO_DAYS, n: 0 } };
    playDay(s);
    const page = frontPage(s);
    // It leads a quiet morning; here the news of Brock's fall leads, and it prints as a brief.
    expect(page.headline[0] === "SURF'S UP!" || page.briefs.includes(`Brock Bodine's surf school opens for the season: "The ocean never raided anybody, bro."`)).toBe(true);
  });
});

describe('the Domination show', () => {
  /** Every rival out, every purchasable plot yours: the win lands as the last plot changes hands. */
  const conquer = (s: GameState) => {
    for (const r of ['blenders', 'coldbrew', 'hollis', 'fizzco', 'sourwood'] as RivalId[]) eliminate(s, r, 'buyout');
    for (const p of PLOTS) if (p.type !== 'civic' && p.type !== 'hq') s.plots[p.id].owner = 'player';
    expect(checkVictory(s)).toBe(true);
  };

  it('waits on the fight and the last exits, at any hour; then the Bay paints; then the ending; then the victory screen', () => {
    const s = newGame(81);
    playScene(s, 'marisol', { until: s.day + 9 }); // a scene that isn't an exit waits its turn
    conquer(s);
    expect(s.outcome).toMatchObject({ result: 'won', how: 'domination', ending: endingFor(s), stage: 'scenes' });
    expect(bayPainted(s)).toBe(false);
    expect(victoryShow(s)).toBe(''); // nothing over the screen while the fight and the exits play
    // A fight on screen (main.ts passes free = false): the show waits.
    s.phase = 'night';
    expect(victoryTick(s, false, 1)).toBe(false);
    // The exits play now, at night too, ahead of the queue: the finale among them.
    const played: string[] = [];
    while (sceneReady(s)) {
      played.push(beginScene(s)!.lines[0].who);
      expect(victoryTick(s, true, 1)).toBe(false); // an exit is playing
      endScene(s, false);
    }
    expect(played).toHaveLength(5);
    expect(played).toContain('Vera');
    expect(s.scenes!.queue.map((q) => q.id)).toEqual(['opening', 'marisol']); // Day 1's opening, too, waits
    // The paint: every plot turns lemon, and the menus stay shut while it runs.
    expect(victoryTick(s, true, 0.1)).toBe(true);
    expect(victoryStage(s)).toBe('paint');
    expect(bayPainted(s)).toBe(true);
    expect(victoryShow(s)).toContain('data-testid="victory-paint"');
    let t = 0;
    while (!victoryTick(s, true, 0.5)) t += 0.5;
    expect(t + 0.5).toBeCloseTo(VICTORY_PAINT_SECONDS, 5);
    // The ending: the Bugle's front page and Lottie's last line.
    expect(victoryStage(s)).toBe('ending');
    const e = ENDINGS[s.outcome!.ending!];
    const card = victoryShow(s)!;
    expect(card).toContain('data-testid="ending"');
    expect(card).toContain('data-action="victoryNext"');
    expect(card).toContain(e.bugle);
    expect(card).toContain(e.lottie);
    endVictoryShow(s); // Continue: the victory screen
    expect(victoryShow(s)).toBeNull();
    expect(bayPainted(s)).toBe(true); // the Bay stays lemon
    expect(sceneReady(s)).toBe(false); // the rest of the queue waits for Keep squeezing
  });

  it("Sandbox's plain front page; an economic win and a loss go straight to their screens; Keep squeezing ends a show", () => {
    const s = newGame(82, { mode: 'sandbox' });
    conquer(s);
    while (sceneReady(s)) { beginScene(s); endScene(s, true); }
    victoryTick(s, true, 0);
    victoryTick(s, true, VICTORY_PAINT_SECONDS);
    expect(victoryShow(s)).toContain(BAY_PAGE[0]);
    expect(victoryShow(s)).not.toContain('cl-lottie');
    const econ = newGame(83, { mode: 'sandbox', win: 'economic', target: 1 });
    expect(checkVictory(econ)).toBe(true);
    expect(econ.outcome!.stage).toBeUndefined();
    expect(victoryShow(econ)).toBeNull();
    expect(victoryTick(econ, true, 9)).toBe(false);
    // Keep squeezing straight from a show still running (a bot, an older build's button): the show is over.
    const k = newGame(84);
    conquer(k);
    expect(keepSqueezing(k)).toBe(true);
    expect(victoryStage(k)).toBeUndefined();
    expect(bayPainted(k)).toBe(true);
  });
});


describe('the Epilogue', () => {
  it("the Corner's sign flips each dawn between Lottie & Vera's and Vera & Lottie's; Lottie names Rank 10", () => {
    const s = newGame(91);
    expect(cornerSign(s)).toBeNull();
    s.outcome = { result: 'won', how: 'domination', day: s.day, ending: 'beloved' };
    expect(cornerSign(s)).toBeNull(); // the victory screen: not yet
    expect(keepSqueezing(s)).toBe(true);
    expect(s.news).toContain(`Lottie: "${rankTenLine()}"`);
    expect(rankTenLine()).toBe('Rank 10 next, kid: The Big Squeeze. $200,000,000.');
    const signs: (string | null)[] = [];
    for (let i = 0; i < 3; i++) { signs.push(cornerSign(s)); s.day++; }
    expect(signs).toEqual(["Lottie & Vera's", "Vera & Lottie's", "Lottie & Vera's"]);
    expect(cornerName(s, LOTTIES_CORNER)).toBe("Vera & Lottie's Corner");
    expect(cornerName(s, PLOTS.find((p) => p.id !== LOTTIES_CORNER)!.id)).toBeNull();
    // Rank 10 already: no line. Sandbox and Endless Summer: no reconciliation, no sign.
    const top = newGame(92);
    top.rank = 10;
    top.outcome = { result: 'won', how: 'domination', day: top.day };
    keepSqueezing(top);
    expect(top.news).not.toContain(`Lottie: "${rankTenLine()}"`);
    expect(cornerSign(top)).toBe("Lottie & Vera's");
    const sb = newGame(93, { mode: 'sandbox' });
    sb.outcome = { result: 'won', how: 'domination', day: sb.day };
    keepSqueezing(sb);
    expect([cornerSign(sb), cornerName(sb, LOTTIES_CORNER)]).toEqual([null, null]);
  });
});
