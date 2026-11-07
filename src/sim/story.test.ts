import { describe, expect, it } from 'vitest';
import {
  actOf, averageStopChance, buyPerimeter, cookieJarPeriod, cookieJarReady, CUPS_PER_PITCHER, eliminate, keepSqueezing, LOTTIES_CORNER, migrateSave, newGame,
  festivalDays, openStand, planNight, PLOTS, postGuard, SCHEMES, simulateRestOfDay, sleepUntilDawn, tasteOffResult, threatLevel, TUTORIAL_RAID_DAY,
  type BattleReport, type GameState, type RivalId,
} from './economy.ts';
import { sharedBorders } from './rivalAi.ts';
import { startScheme } from './schemes.ts';
import { checkGoals, GOAL_PROVIDERS, goalReward, goalsNow, recipeMatch, salesTarget } from './goals.ts';
import { ownedRecipes } from './recipes.ts';
import { bossBrief, CALL_PRIORITY, LINES, phoneAtClose, phoneCall, phoneCheck, takeCall } from './phone.ts';
import { beginScene, endScene, playingScene, playScene, SCENE_MAX_SECONDS, sceneDef, sceneLine, sceneReady } from './scenes.ts';
import { actBegan, storyAtDawn, storyDateline, storyHeadline, taught } from './story.ts';
import { LESSON_DAY } from './balance.ts';
import { menuScreen, menuUnlocked } from '../ui/menus.ts';
import { DEFAULT_OPTIONS, defaultKeys } from '../settings.ts';

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
});

describe('story scenes', () => {
  it('wait for Morning Prep, play one a day, and leave a recap when skipped', () => {
    const s = newGame(14);
    s.day = 4;
    nextDawn(s); // Day 5: the Steward's reminder
    expect(s.day).toBe(5);
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
    s.day = 4;
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
      s.day = 4;
      nextDawn(s);
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

  it('follow Grudge and Threat jumps; Brock waits for Act 2 in the campaign; the fallen never call', () => {
    const s = newGame(18);
    s.rivals.coldbrew.grudge += 12;
    phoneCheck(s);
    expect(s.phone!.queue.map((c) => c.who)).toContain('coldbrew');
    s.rank = 3; // Threat 1 to 2
    expect(threatLevel(s)).toBe(2);
    phoneCheck(s);
    expect(s.phone!.queue.some((c) => c.who === 'sourwood' && c.text === LINES.veraThreat)).toBe(true);
    expect(phoneCall(s, 'blenders', '', { mood: 'warn' })).toBe(false); // Act 1
    expect(phoneCall(newGame(19, { mode: 'sandbox' }), 'blenders', '', { mood: 'warn' })).toBe(true);
    eliminate(s, 'coldbrew', 'buyout');
    const rang: string[] = [];
    for (let call = takeCall(s); call; call = takeCall(s)) { rang.push(call.who); s.day++; }
    expect(rang).toEqual(['sourwood']);
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
    expect(s.phone!.queue[0].text).toBe(LINES.brockFence);
    s.raids.length = 0; // it hit (or was called off) before the call rang
    expect(takeCall(s)).toBeNull();
    expect(s.phone!.queue).toEqual([]);
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
    expect(camp.phone!.queue).toEqual([]); // the first dawn only reads their moods: Days 2 and 3 are quiet
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
      expect(goalsNow(s)[1].text).toBe('Build the Wooden Stand'); // back to the lesson it stepped in front of
    } finally {
      GOAL_PROVIDERS.splice(GOAL_PROVIDERS.indexOf(kids), 1);
    }
  });

  it('a slot keeps its goal until done; only a lesson or story goal steps in ahead of it', () => {
    const s = newGame(36);
    s.plots[LOTTIES_CORNER].stand!.level = 2; // the Wooden Stand is up
    checkGoals(s);
    expect(goalsNow(s)[1].text).toBe('Open a second stand');
    s.rank = 5; // new unlocks rank ahead of it (the Kiosk first), but the card doesn't switch under you
    checkGoals(s);
    expect(goalsNow(s)[1].text).toBe('Open a second stand');
    s.day = 5; // Day 5's lesson does
    checkGoals(s);
    expect(goalsNow(s)[1].text).toBe('Fence the Corner');
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
    expect(taught(s, 'upgrade')).toBe(false);
    s.day = 4;
    expect(taught(s, 'upgrade')).toBe(true);
    expect(taught(s, 'threat')).toBe(false);
    s.day = 5;
    expect(taught(s, 'threat') && taught(s, 'defense')).toBe(true); // Threat lemons and the Picket Fence come together
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
    s.day = 5;
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

  it('Dex joins on Day 6, not at the first rank-up, and takes the Corner himself if nobody stations him', () => {
    const s = newGame(26);
    s.cash = 2500; // enough Success Score for Rank 2 at the first closing
    playDay(s);
    expect(s.rank).toBeGreaterThanOrEqual(2);
    expect(s.guards).toHaveLength(0);
    expect(s.recruits.length).toBeGreaterThan(0); // the Hiring Hall opens with the rank
    s.day = 5;
    nextDawn(s);
    const dex = s.guards.find((g) => g.name === 'Dex Moody')!;
    expect(dex.post).toBeNull(); // stationing him is today's lesson
    expect(s.alerts!.find((a) => a.text.startsWith('Dex Moody joins'))).toMatchObject({ kind: 'note', plot: LOTTIES_CORNER });
    expect(s.goals!.slots.short).toBe('lesson-dex');
    expect(s.scenes!.queue.map((q) => q.id)).toContain('dex');
    playDay(s);
    expect(dex.post).toBe(LOTTIES_CORNER);
    const t = newGame(27, { lessons: false });
    t.day = 5;
    nextDawn(t);
    expect(t.guards.find((g) => g.name === 'Dex Moody')?.post).toBe(t.selected);
  });

  it("Day 3's land lesson lands as a card whose Go There opens the side lot", () => {
    const s = newGame(31);
    s.day = 2;
    nextDawn(s);
    const card = s.alerts!.find((a) => a.text.startsWith('Side lot by the Corner'))!;
    expect(card).toMatchObject({ kind: 'note', day: 3 });
    expect(s.plots[card.plot!].dibs).toMatchObject({ who: 'player', table: true });
  });

  it('stationing Dex on his day ticks the lesson off', () => {
    const s = newGame(28);
    s.day = 5;
    nextDawn(s);
    const dex = s.guards.find((g) => g.name === 'Dex Moody')!;
    const cash = s.cash;
    postGuard(s, dex.id, LOTTIES_CORNER);
    checkGoals(s);
    expect(s.cash).toBeGreaterThan(cash);
    storyAtDawn(s); // safe to run again
    expect(goalsNow(s)).toHaveLength(3);
  });
});
