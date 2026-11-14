import { describe, expect, it } from 'vitest';
import {
  buyPerimeter, CLOSE, checkVictory, LOTTIES_CORNER, LOTTIES_SIDE_LOT, migrateSave, netWorth, newGame, offerSideLot, openStands, PLOTS, RANKS,
  simulateRestOfDay, sleepUntilDawn, startNight, successScore, threatLevel, tickMinute, upgradeStand, type GameState,
} from './economy.ts';
import { investedSliver, scoreCheck } from './score.ts';
import { storyAfterAct } from './story.ts';

/** Business under way: the stands open and a few minutes on the clock. */
function opened(seed: number): GameState {
  const s = newGame(seed, { lessons: false });
  openStands(s);
  for (let i = 0; i < 5; i++) tickMinute(s);
  return s;
}
/** Cash to put the score `by` dollars past `target`. */
const lift = (s: GameState, target: number, by = 1) => { s.cash += target - successScore(s) + by; };

describe('the $525 start', () => {
  it("starts at $525: $150 cash, the $300 Corner and 75% of Lottie's $100 table", () => {
    const s = newGame(1);
    expect(s.plots[LOTTIES_CORNER].invested).toBe(100);
    expect(netWorth(s)).toBe(525);
    expect(successScore(s)).toBe(525);
    expect(s.peakScore).toBe(525);
  });
});

describe('rank-up on the spot', () => {
  it('ranks up the minute the score crosses a threshold, mid-day, and Threat follows the rank', () => {
    const s = opened(2);
    expect(s.rank).toBe(1);
    expect(threatLevel(s)).toBe(1);
    lift(s, RANKS[2].ss);
    tickMinute(s);
    expect(s.phase).toBe('open');
    expect(s.minute).toBeLessThan(CLOSE);
    expect(s.rank).toBe(3);
    expect(s.news.filter((n) => n.startsWith('RANK UP!'))).toEqual([`RANK UP! Charlie is now a ${RANKS[2].title}`]);
    expect(threatLevel(s)).toBe(2);
  });

  it('after a tap (a buyout, a sale), at night when loot lands, and never back down', () => {
    const s = opened(3);
    lift(s, RANKS[1].ss);
    storyAfterAct(s);
    expect(s.rank).toBe(2);
    simulateRestOfDay(s);
    startNight(s);
    lift(s, RANKS[2].ss, 50);
    tickMinute(s);
    expect(s.phase).toBe('night');
    expect(s.rank).toBe(3);
    s.cash = 0; // a slump keeps the rank and its unlocks
    tickMinute(s);
    expect(s.rank).toBe(3);
  });

  it('the next Bugle runs the headline', () => {
    const s = opened(4);
    lift(s, RANKS[1].ss, 200);
    tickMinute(s);
    expect(s.rank).toBe(2);
    simulateRestOfDay(s);
    sleepUntilDawn(s);
    expect(s.world!.paper!.rankUp).toBe(2);
  });
});

describe('Peak Success Score', () => {
  it('keeps the best the run ever reaches, mid-day highs included, with its day', () => {
    const s = opened(5);
    lift(s, 1200);
    tickMinute(s);
    const high = successScore(s);
    expect(s.peakScore).toBe(high);
    expect(s.peakDay).toBe(s.day);
    s.cash -= 400; // gone by closing
    simulateRestOfDay(s);
    expect(successScore(s)).toBeLessThan(high);
    expect(s.peakScore).toBe(high);
  });

  it('is sampled before the Economic win check, so TARGET HIT never sits beside a lower peak', () => {
    const s = newGame(6, { lessons: false, mode: 'sandbox', win: 'economic', target: 1000 });
    s.phase = 'report';
    lift(s, 1000, 10);
    expect(s.peakScore).toBeLessThan(1000);
    expect(checkVictory(s)).toBe(true);
    expect(s.peakScore).toBeGreaterThanOrEqual(1000);
    expect(s.news.at(-1)).toContain('TARGET HIT');
    const dawn = newGame(7, { lessons: false, mode: 'sandbox', win: 'economic', target: 1000 });
    dawn.phase = 'report';
    lift(dawn, 1000, 10);
    sleepUntilDawn(dawn);
    expect(dawn.outcome?.result).toBe('won');
    expect(dawn.peakScore).toBeGreaterThanOrEqual(1000);
    expect(dawn.peakDay).toBe(dawn.day);
  });
});

describe("the Rank badge's invested sliver", () => {
  const prep = (seed: number) => {
    const s = newGame(seed, { lessons: false });
    s.cash = 2000;
    scoreCheck(s);
    return s;
  };

  it('is the 25% a building purchase dips the score by, and fills back in as the score climbs', () => {
    const s = prep(8);
    const before = successScore(s);
    expect(upgradeStand(s, LOTTIES_CORNER)).toBe(true); // a $400 Lemonade Cart
    expect(before - successScore(s)).toBe(100);
    expect(investedSliver(s)).toBe(100);
    s.cash += 60;
    scoreCheck(s);
    expect(investedSliver(s)).toBe(40);
    s.cash += 100;
    scoreCheck(s);
    expect(investedSliver(s)).toBe(0);
  });

  it('never counts real losses: a raid, wages or upkeep leave no stripe', () => {
    const s = prep(9);
    s.cash -= 300;
    scoreCheck(s);
    expect(s.peakScore - successScore(s)).toBe(300);
    expect(investedSliver(s)).toBe(0);
    expect(buyPerimeter(s, LOTTIES_CORNER)).toBe(true); // a fence: building money too
    storyAfterAct(s); // the tap's check
    const dip = s.story!.score!.dip;
    expect(dip).toBeGreaterThan(0);
    s.cash -= 500; // then robbed
    scoreCheck(s);
    expect(investedSliver(s)).toBe(dip); // the stripe stays the fence's, not the loss's
  });

  it('brings no dip for a plot that changes hands, or for a building that came free', () => {
    const s = prep(10);
    const rival = PLOTS.find((p) => s.plots[p.id].owner && s.plots[p.id].owner !== 'player' && s.plots[p.id].invested > 0)!;
    s.plots[rival.id].owner = 'player'; // bought out, building and all
    scoreCheck(s);
    expect(s.story!.score!.dip).toBe(0);
    s.plots[LOTTIES_SIDE_LOT].owner = 'player';
    scoreCheck(s);
    offerSideLot(s); // Lottie's table goes up on the side lot, free
    expect(s.plots[LOTTIES_SIDE_LOT].stand).toBeTruthy();
    scoreCheck(s);
    expect(s.story!.score!.dip).toBe(0);
  });

  it('saves with the run; books that do not read right start over with nothing owed', () => {
    const s = prep(11);
    upgradeStand(s, LOTTIES_CORNER);
    const back = migrateSave(JSON.parse(JSON.stringify(s)))!;
    expect(investedSliver(back)).toBe(100);
    const odd = JSON.parse(JSON.stringify(s));
    odd.story.score = { last: 'x', dip: 5, built: {} };
    expect(migrateSave(odd)!.story!.score).toBeUndefined();
    const old = JSON.parse(JSON.stringify(s));
    delete old.story.score;
    const loaded = migrateSave(old)!;
    expect(investedSliver(loaded)).toBe(0);
    scoreCheck(loaded);
    expect(loaded.story!.score!.dip).toBe(0);
  });
});
