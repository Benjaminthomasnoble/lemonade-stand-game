import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  buildClubhouse, expressWindow, fitSpec, LOTTIES_CORNER, newGame, newStand, NO_DEFENSE, ownedPlots, PERIMETERS, PLOT_BY_ID, PLOTS, pourRate,
  STAND_LEVELS, standCost, type GameState, type Raid,
} from '../sim/economy.ts';
import { choiceTip, liveCall } from '../sim/calls.ts';
import { finishFight, startFight, watchFights } from '../sim/fight.ts';
import { guardOf, henchmenOf } from '../sim/fighters.ts';
import { ringTheBell } from '../sim/reinforce.ts';
import { callPicks, levelStats, ownStandActions } from './hud.ts';

describe("the Grow card's level lines", () => {
  it("count the stand's Express Window in its cups an hour, now and after the upgrade, as the stand pours", () => {
    const s = newGame(83);
    s.rank = 8;
    s.phase = 'prep';
    s.cash = 100_000;
    s.plots[LOTTIES_CORNER].stand = newStand(3); // the Kiosk: 120 cups an hour
    const [kiosk, shack] = [STAND_LEVELS[2], STAND_LEVELS[3]];
    const fast = () => expressWindow(s.plots[LOTTIES_CORNER]); // what the Grow card and the Upgrade button pass in
    expect(levelStats(kiosk, 3, fast())).toBe('120 cups/hour · draws ×2.3 · top price $3.00 here · upkeep $60.00/day · holds 1,800 cups');
    expect(fitSpec(s, LOTTIES_CORNER, 0, 'express')).toBe(true);
    expect(levelStats(kiosk, 3, fast())).toBe('156 cups/hour · draws ×2.3 · top price $3.00 here · upkeep $60.00/day · holds 1,800 cups');
    expect(levelStats(kiosk, 3, fast())).toMatch(new RegExp(`^${pourRate(s, LOTTIES_CORNER)} cups/hour`)); // the stand's own pour
    expect(levelStats(shack, 4.5, fast())).toMatch(/^390 cups\/hour/); // the Shack keeps the slot
    expect(levelStats(shack, 4.5)).toMatch(/^300 cups\/hour/); // an empty plot's build buttons: no window yet
  });
});

/** Lottie's Corner (the stand you manage) and a Table of yours on another Maple Row street, with cash for the next steps. */
function twoStands(): { s: GameState; side: string } {
  const s = newGame(91);
  s.rank = 2;
  s.cash = 5000;
  const d = PLOT_BY_ID[LOTTIES_CORNER].district;
  const p = PLOTS.find((x) => x.district === d && x.type === 'street' && !s.plots[x.id].owner)!;
  s.plots[p.id] = { ...s.plots[p.id], owner: 'player', stand: newStand(1), invested: standCost(1), defense: NO_DEFENSE() };
  return { s, side: p.id };
}

const upgrade = `>Upgrade $${STAND_LEVELS[1].cost.toLocaleString('en-US')}</button>`;
const manage = '>Manage</button>';
const fence = `>${PERIMETERS[0].name.split(' ')[0]} $${PERIMETERS[0].cost}</button>`;

describe('the plot card on a stand of yours', () => {
  it('by day: the stand panel, under the upgrade on the stand you manage and Manage on the others', () => {
    const { s, side } = twoStands();
    for (const phase of ['prep', 'open'] as const) {
      s.phase = phase;
      const mine = ownStandActions(s, LOTTIES_CORNER), other = ownStandActions(s, side);
      expect(mine).toContain(upgrade);
      expect(mine).toContain('data-testid="stand-panel"');
      expect(other).toContain(manage);
      expect(other).toContain('data-testid="stand-panel"');
      for (const card of [mine, other]) expect(card).not.toContain('data-testid="fence-here"'); // the fence is on the panel's Defend tab
    }
  });

  it('in the Evening: the upgrade or Manage, and the next fence (no stand panel: the Ledger has the day)', () => {
    const { s, side } = twoStands();
    s.phase = 'report';
    const mine = ownStandActions(s, LOTTIES_CORNER), other = ownStandActions(s, side);
    expect(mine).toContain(upgrade);
    expect(mine).toContain(fence);
    expect(other).toContain(manage);
    expect(other).toContain(fence);
    for (const card of [mine, other]) expect(card).not.toContain('data-testid="stand-panel"');
  });

  it('at night: the fence only', () => {
    const { s, side } = twoStands();
    s.phase = 'night';
    for (const id of [LOTTIES_CORNER, side]) {
      const card = ownStandActions(s, id);
      expect(card).toContain(fence);
      expect(card).not.toContain('Upgrade');
      expect(card).not.toContain(manage);
      expect(card).not.toContain('data-testid="stand-panel"');
    }
  });
});

describe("a day call's card", () => {
  beforeAll(() => watchFights(true)); // as the game does: fights you're in play live
  afterAll(() => watchFights(false));

  it("holds a rumor's Post a guard, with why, while the guard it would post is in the fight", () => {
    // Day 6, 14:00: Brock's raid on the Corner plays live, and word comes that Hollis hits the Kiosk down the street
    // tonight. Pip holds one of its posts; Lou waits at a Clubhouse there till the bell rings him into the fight.
    const s = newGame(41);
    Object.assign(s, { rank: 7, cash: 1e6, phase: 'night', minute: 23 * 60 });
    const home = ownedPlots(s, 'player')[0].id;
    const [kiosk, club] = PLOTS.filter((p) => p.type === 'street' && p.district === PLOT_BY_ID[home].district && !s.plots[p.id].owner).map((p) => p.id);
    s.plots[kiosk] = { ...s.plots[kiosk], owner: 'player', stand: newStand(3) };
    s.plots[club].owner = 'player';
    expect(buildClubhouse(s, club)).toBe(true);
    Object.assign(s, { day: 6, phase: 'open', minute: 14 * 60 });
    const lou = guardOf('clubs', 'vest', 1, 'Smooth Talker', { name: 'Lou', club });
    s.guards = [guardOf('clubs', 'vest', 1, 'Eagle Eye', { name: 'Gus', post: home }), guardOf('clubs', 'vest', 1, 'Smooth Talker', { name: 'Pip', post: kiosk }), lou];
    const raid: Raid = { id: 'ra', attacker: 'blenders', target: home, objective: 'smash', party: henchmenOf(3, 1, 'fists'), detected: true, eta: '14:00', leave: 13 * 60, at: 14 * 60, launched: true, warned: true };
    expect(startFight(s, raid, false)).toBe(true);
    s.calls = { day: s.day, list: [{ id: 61, kind: 'rumor', at: s.minute, plot: kiosk, rival: 'hollis', live: true }], mods: {} };
    const call = liveCall(s)!;
    const tip = `title="${choiceTip(call, 'Post a guard')}"`;
    const post = () => callPicks(s, call).match(/<button [^>]*data-testid="call-1"[^>]*>[^<]*/)?.[0] ?? '';
    expect(post()).toMatch(/>Post a guard$/);
    expect(post()).toContain(tip);
    expect(post()).not.toContain('disabled');
    expect(ringTheBell(s, 'ra')).toBe(true); // Lou sets out for the Corner: he's in the fight
    expect(post()).toMatch(/>Post a guard$/);
    expect(post()).toContain('disabled');
    expect(post()).toContain('title="In the fight"');
    expect(post()).not.toContain(tip);
    finishFight(s);
    expect(lou.post).toBeNull(); // the card never moved him
    expect(post()).toContain(tip);
    expect(post()).not.toContain('disabled');
  });
});
