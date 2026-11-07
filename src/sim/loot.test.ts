import { describe, expect, it } from 'vitest';
import {
  buySupply, costPerCup, fightRaid, LOTTIES_CORNER, newGame, openStand, ownedPlots, simulateRestOfDay, sleepUntilDawn, standLevel,
  type GameState, type Raid,
} from './economy.ts';
import { guardOf, henchmenOf } from './fighters.ts';
import { dayProfit, shakedownLoot } from './loot.ts';

/** Day 1 sold and closed: Lottie's Corner and the rival stands have a full day in their books. */
function closed(seed = 3): GameState {
  const s = newGame(seed);
  buySupply(s, 'lemons', 2);
  buySupply(s, 'sugar', 2);
  buySupply(s, 'ice', 4);
  openStand(s);
  simulateRestOfDay(s);
  return s;
}
const rivalStand = (s: GameState) => ownedPlots(s, 'blenders').find((p) => s.plots[p.id].stand && s.plots[p.id].stand!.day.customers > 0)!.id;

describe('Shakedown loot', () => {
  it('is about a day of that stand\'s profit: its sales less what its cups cost and its upkeep', () => {
    const s = closed();
    const mine = s.plots[LOTTIES_CORNER].stand!, theirs = rivalStand(s), st = s.plots[theirs].stand!;
    expect(mine.day.customers).toBeGreaterThan(0);
    expect(dayProfit(s, LOTTIES_CORNER)).toBeCloseTo(mine.day.revenue - mine.day.customers * costPerCup(s, mine) - standLevel(mine).upkeep, 2);
    expect(dayProfit(s, theirs)).toBeCloseTo(st.day.revenue - st.day.cupCosts - standLevel(st).upkeep, 2);
    // Closing put the day in the books.
    expect(mine.lastProfit).toBe(dayProfit(s, LOTTIES_CORNER));
    expect(st.lastProfit).toBe(dayProfit(s, theirs));
    s.rivals.blenders.cash = 1e6;
    expect(shakedownLoot(s, theirs)).toBe(Math.max(0, st.lastProfit!));
  });

  it('takes the last full business day: tonight today\'s, by day yesterday\'s', () => {
    const s = closed();
    const theirs = rivalStand(s);
    s.rivals.blenders.cash = 1e6;
    const today = shakedownLoot(s, theirs);
    expect(today).toBe(Math.max(0, dayProfit(s, theirs)));
    sleepUntilDawn(s);
    openStand(s); // the new day starts from nothing: a raid now takes yesterday's
    expect(s.plots[theirs].stand!.day.revenue).toBe(0);
    expect(shakedownLoot(s, theirs)).toBe(today);
  });

  it('is never below $0 and never more than the owner has; a facility has no till', () => {
    const s = closed();
    const theirs = rivalStand(s);
    s.plots[theirs].stand!.lastProfit = -40;
    expect(shakedownLoot(s, theirs)).toBe(0);
    s.plots[theirs].stand!.lastProfit = 900;
    s.rivals.blenders.cash = 250;
    expect(shakedownLoot(s, theirs)).toBe(250);
    s.rivals.blenders.cash = -10; // In the Red
    expect(shakedownLoot(s, theirs)).toBe(0);
    s.plots[LOTTIES_CORNER].stand!.lastProfit = 800;
    s.cash = 300;
    expect(shakedownLoot(s, LOTTIES_CORNER)).toBe(300);
    const field = Object.keys(s.plots).find((id) => s.plots[id].facility && !s.plots[id].stand);
    if (field) expect(shakedownLoot(s, field)).toBe(0);
  });

  it('moves from the owner\'s cash to the raider\'s, both ways', () => {
    const s = closed();
    sleepUntilDawn(s);
    const theirs = rivalStand(s);
    // Lottie robs a rival stand: a squad nobody there can stop.
    s.plots[theirs].garrison = 0;
    s.plots[theirs].defense = { tier: 0, fenceHp: 0, gadgets: [] };
    s.plots[theirs].stand!.lastProfit = 640;
    s.rivals.blenders.cash = 5000;
    s.guards = Array.from({ length: 5 }, () => guardOf('hatchets', 'pro', 5));
    const cash = s.cash;
    const raid: Raid = { id: 'go', attacker: 'player', target: theirs, objective: 'shakedown', guards: s.guards.map((g) => g.id), detected: false, eta: '' };
    const won = fightRaid(s, raid, true);
    expect(won.outcome).toBe('robbed');
    expect(won.loot).toBe(640);
    expect(s.cash).toBeCloseTo(cash + 640, 2);
    expect(s.rivals.blenders.cash).toBe(5000 - 640);
    // And a rival robs Lottie's Corner the same way.
    s.plots[LOTTIES_CORNER].defense = { tier: 0, fenceHp: 0, gadgets: [] };
    s.plots[LOTTIES_CORNER].stand!.lastProfit = 120;
    s.guards = [];
    const before = s.cash, theirCash = s.rivals.hollis.cash;
    const hit = fightRaid(s, { id: 'in', attacker: 'hollis', target: LOTTIES_CORNER, objective: 'shakedown', party: henchmenOf(4, 3, 'clubs'), detected: false, eta: '' }, true);
    expect(hit.outcome).toBe('robbed');
    expect(hit.loot).toBe(Math.min(120, before));
    expect(s.cash).toBeCloseTo(before - hit.loot, 2);
    expect(s.rivals.hollis.cash).toBeCloseTo(theirCash + hit.loot, 2);
  });

  it('a Delivery Raid is after the cargo, not the till', () => {
    const s = closed();
    s.plots[LOTTIES_CORNER].defense = { tier: 0, fenceHp: 0, gadgets: [] };
    s.plots[LOTTIES_CORNER].stand!.lastProfit = 500;
    const before = s.cash;
    const hit = fightRaid(s, { id: 'dv', attacker: 'hollis', target: LOTTIES_CORNER, objective: 'shakedown', party: henchmenOf(4, 3, 'clubs'), detected: false, eta: '', delivery: true }, true);
    expect(hit.outcome).toBe('robbed');
    expect(hit.loot).toBe(0);
    expect(s.cash).toBe(before);
  });
});
