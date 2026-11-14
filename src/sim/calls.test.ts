import { describe, expect, it } from 'vitest';
import {
  BAY_RIVALS, budgetOf, LOTTIES_CORNER, mayRaidYou, newGame, newStand, openStands, PLOTS, simulateRestOfDay, sleepUntilDawn, tickMinute, fillPosts,
  type GameState,
} from './economy.ts';
import { answerCall, callChoices, callLine, CALLS, callTraffic, liveCall, planCalls, type DayCall } from './calls.ts';
import { eventTraffic } from './events.ts';
import { onYou } from './night.ts';

const crew = (s: GameState) => ({ postGuards: (p: string) => fillPosts(s, p) });
/** Run the clock until a call breaks in (or the day ends). */
function toCall(s: GameState) {
  while (s.phase === 'open' && !liveCall(s)) tickMinute(s);
  return liveCall(s);
}
/** Day 10 of a Sandbox run, past the first raid, at Rank 3: the Corner and three more stands of yours on Maple Row, every rival in. */
function day10(seed: number): GameState {
  const s = newGame(seed, { mode: 'sandbox' });
  Object.assign(s, { day: 10, tutorialRaidDone: true, lastRaidOnYou: 9, rank: 3, cash: 5000 });
  for (const p of PLOTS.filter((x) => x.district === 'maple' && x.type === 'street' && !s.plots[x.id].owner).slice(0, 3)) {
    s.plots[p.id] = { ...s.plots[p.id], owner: 'player', stand: newStand(2) };
  }
  return s;
}
/** Play the day to closing, answering each call with its last choice and a rumor with choice `pick`: the rumor, if one came. */
function playDay(s: GameState, pick: number): DayCall | undefined {
  openStands(s);
  let rumor: DayCall | undefined;
  for (let call = toCall(s); call; call = toCall(s)) {
    const last = callChoices(s, call).length - 1;
    if (call.kind === 'rumor') rumor = { ...call };
    expect(answerCall(s, call.kind === 'rumor' ? Math.min(pick, last) : last, crew(s))).toBe(true);
  }
  return rumor;
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

  it('any answer brings that gang to that plot, out of four stands and five rivals, even with every Strike empty', () => {
    let rumors = 0;
    for (let seed = 1; rumors < 6 && seed <= 60; seed++) {
      const s = day10(seed);
      const broke = rumors % 2 === 1; // every other rumor day, no boss can pay for a raid
      if (broke) for (const id of BAY_RIVALS) budgetOf(s, id).strike = 0;
      const rumor = playDay(s, rumors % 3); // rush the fence, then Bring it on, then the fence again...
      if (!rumor) continue;
      rumors++;
      expect(s.phase).not.toBe('open');
      const raids = s.raids.filter((r) => onYou(s, r));
      expect(raids.some((r) => r.attacker === rumor.rival && r.target === rumor.plot)).toBe(true);
      if (broke) expect(raids.every((r) => r.attacker === rumor.rival)).toBe(true); // the others are called off; the rumored one is on the house
    }
    expect(rumors).toBe(6);
  });

  it('a rumor names only a gang that may raid you tonight: none in a Truce or backing off', () => {
    let rumors = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const free = day10(seed);
      openStands(free);
      planCalls(free);
      if (!free.calls!.list.some((c) => c.kind === 'rumor')) continue;
      rumors++;
      const s = day10(seed);
      for (const id of BAY_RIVALS.filter((r) => r !== 'hollis')) s.rivals[id].respectUntil = s.day + 2; // beaten last night
      s.rivals.coldbrew.truceUntil = s.day + 3;
      openStands(s);
      planCalls(s);
      expect(BAY_RIVALS.filter((r) => mayRaidYou(s, r))).toEqual(['hollis']);
      expect(s.calls!.list.find((c) => c.kind === 'rumor')?.rival).toBe('hollis');
      const none = day10(seed); // and with nobody left who may come, no rumor at all
      for (const id of BAY_RIVALS) none.rivals[id].truceUntil = none.day;
      openStands(none);
      planCalls(none);
      expect(none.calls!.list.some((c) => c.kind === 'rumor')).toBe(false);
    }
    expect(rumors).toBeGreaterThan(5);
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
