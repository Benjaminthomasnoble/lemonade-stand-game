import { describe, expect, it } from 'vitest';
import { LOTTIES_CORNER, newGame, openStands, simulateRestOfDay, sleepUntilDawn, tickMinute, fillPosts, type GameState } from './economy.ts';
import { answerCall, callChoices, callLine, CALLS, callTraffic, liveCall } from './calls.ts';
import { eventTraffic } from './events.ts';
import { onYou } from './night.ts';

const crew = (s: GameState) => ({ postGuards: (p: string) => fillPosts(s, p) });
/** Run the clock until a call breaks in (or the day ends). */
function toCall(s: GameState) {
  while (s.phase === 'open' && !liveCall(s)) tickMinute(s);
  return liveCall(s);
}

describe('day calls', () => {
  it("Day 1's call is a rival undercutting you, and every choice costs something", () => {
    const s = newGame(5);
    openStands(s);
    const call = toCall(s)!;
    expect(call.kind).toBe('undercut');
    expect(call.rival).toBeTruthy();
    expect(callLine(s, call)).toMatch(/slashed their prices/);
    const choices = callChoices(s, call);
    expect(choices.map((c) => c.label)).toEqual([expect.stringMatching(/^Cut to/), 'Free samples', 'Hold firm']);
    expect(choices[1].cost).toBe(CALLS.undercut.samples);
    const cash = s.cash;
    expect(answerCall(s, 1, crew(s))).toBe(true);
    expect(s.cash).toBeCloseTo(cash - CALLS.undercut.samples, 2);
    expect(callTraffic(s, call.plot)).toBeCloseTo(CALLS.undercut.samplesTraffic);
    expect(eventTraffic(s, call.plot)).toBeCloseTo(CALLS.undercut.samplesTraffic);
    expect(liveCall(s)).toBeUndefined();
  });

  it('a call nobody answers lapses and changes nothing (tests and Finish the day run the same numbers)', () => {
    const a = newGame(9), b = newGame(9);
    for (const s of [a, b]) { openStands(s); simulateRestOfDay(s); }
    expect(a.cash).toBe(b.cash);
    expect(a.calls!.list.every((c) => c.picked === -1)).toBe(true);
    expect(callTraffic(a, LOTTIES_CORNER)).toBe(1);
  });

  it('two calls a day from Day 2, spread over the day', () => {
    const s = newGame(12);
    openStands(s); simulateRestOfDay(s); sleepUntilDawn(s);
    openStands(s);
    tickMinute(s);
    expect(s.calls!.list).toHaveLength(2);
    expect(s.calls!.list[0].at).toBeLessThan(s.calls!.list[1].at);
  });

  it("an answered rumor brings that rival to that plot tonight; a fence choice buys the fence", () => {
    const s = newGame(21);
    s.day = 3;
    s.tutorialRaidDone = true;
    s.cash = 1000;
    openStands(s);
    let call = toCall(s);
    while (call && call.kind !== 'rumor') { answerCall(s, callChoices(s, call).length - 1, crew(s)); call = toCall(s); }
    expect(call?.kind).toBe('rumor');
    expect(call!.plot).toBe(LOTTIES_CORNER);
    expect(callChoices(s, call!)[0].label).toMatch(/fence$/);
    const cash = s.cash;
    expect(answerCall(s, 0, crew(s))).toBe(true);
    expect(s.plots[LOTTIES_CORNER].defense.tier).toBe(1);
    expect(cash - s.cash).toBeCloseTo(Math.ceil(150 * CALLS.rumor.rush), 6); // a Picket rushed in
    while (s.phase === 'open') tickMinute(s);
    const raid = s.raids.find((r) => onYou(s, r));
    expect(raid).toBeTruthy();
  });

  it('after the first raid, a raid on you comes at least every third night on Classic', () => {
    const s = newGame(31);
    s.tutorialRaidDone = true;
    s.day = 10;
    s.lastRaidOnYou = 7;
    s.cash = 500;
    openStands(s);
    simulateRestOfDay(s);
    expect(s.raids.some((r) => onYou(s, r))).toBe(true);
    expect(s.lastRaidOnYou).toBe(10);
  });
});
