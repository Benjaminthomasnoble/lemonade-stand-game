import { describe, expect, it } from 'vitest';
import {
  BAY_RIVALS, budgetOf, callBigSqueeze, LOTTIES_CORNER, mayRaidYou, newGame, newStand, openStands, PLOTS, siegeTonight, simulateRestOfDay, sleepUntilDawn,
  tickMinute, fillPosts, callCrew, type GameState,
} from './economy.ts';
import { answerCall, callChoices, callLine, CALLS, CALLS_PER_DAY, callTraffic, liveCall, planCalls, type DayCall } from './calls.ts';
import { guardOf } from './fighters.ts';
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
/** Morning Prep on Day 136 of a Classic campaign at Rank 9, in Act 5: the Corner and five Maple Row stands, every rival flush. */
function finale(seed: number): GameState {
  const s = newGame(seed, { mode: 'campaign' });
  Object.assign(s, { day: 136, rank: 9, tutorialRaidDone: true, lastRaidOnYou: 135, story: { act: 5, since: 106 } });
  for (const id of BAY_RIVALS) Object.assign(s.rivals[id], { cash: 1e7, budget: { grow: 0, guard: 0, strike: 1e6 } });
  for (const p of PLOTS.filter((x) => x.district === 'maple' && x.type === 'street' && !s.plots[x.id].owner).slice(0, 5)) {
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

  it('a rumor offers Post a guard only when a free guard would take a post there; a pick that moves nobody keeps the call', () => {
    // Gus holds the Corner's one post and Lou waits off post: word comes that Brock's Bros hit the Corner tonight.
    const s = newGame(5);
    openStands(s);
    const gus = guardOf('clubs', 'vest', 1, 'Loyal', { name: 'Gus', post: LOTTIES_CORNER });
    const lou = guardOf('clubs', 'vest', 1, 'Loyal', { name: 'Lou' });
    s.guards = [gus, lou];
    s.calls = { day: s.day, list: [{ id: 11, kind: 'rumor', at: s.minute, plot: LOTTIES_CORNER, rival: 'blenders', live: true }], mods: {} };
    const call = liveCall(s)!;
    const labels = (c?: Parameters<typeof callChoices>[2]) => callChoices(s, call, c).map((x) => x.label);
    expect(labels(callCrew(s))).toEqual(['Rush a Picket fence', 'Bring it on']); // the post is taken: Lou has nowhere to go
    // A card drawn without the crew's count offers it to any free guard, but the pick moves nobody: the call waits on.
    expect(labels()).toEqual(['Rush a Picket fence', 'Post a guard', 'Bring it on']);
    expect(answerCall(s, 1, crew(s))).toBe(false);
    expect([liveCall(s), s.calls.rumor, lou.post]).toEqual([call, undefined, null]);
    s.plots[LOTTIES_CORNER].stand!.level = 2; // a Wooden Stand: two posts
    expect(labels(callCrew(s))).toEqual(['Rush a Picket fence', 'Post a guard', 'Bring it on']);
    expect(answerCall(s, 1, callCrew(s))).toBe(true);
    expect([lou.post, s.calls.rumor, liveCall(s)]).toEqual([LOTTIES_CORNER, { day: s.day, rival: 'blenders', plot: LOTTIES_CORNER }, undefined]);
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

  it('two calls on every business day after Day 1, and no rumor while every gang is backing off', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const s = day10(seed);
      for (const id of BAY_RIVALS) s.rivals[id].respectUntil = s.day + 2; // you beat them all last night
      openStands(s);
      planCalls(s);
      expect(s.calls!.list.map((c) => c.kind)).toHaveLength(CALLS_PER_DAY);
      expect(s.calls!.list.some((c) => c.kind === 'rumor')).toBe(false);
    }
  });

  it("no rumor on a Big Squeeze siege day: that dawn named the night's targets", () => {
    let rumors = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const plain = finale(seed); // the same day with no siege called deals rumors on some seeds
      openStands(plain);
      planCalls(plain);
      if (plain.calls!.list.some((c) => c.kind === 'rumor')) rumors++;
      const s = finale(seed);
      expect(callBigSqueeze(s)).toBe(true);
      openStands(s);
      planCalls(s);
      expect(siegeTonight(s)).toBe(true);
      expect(s.calls!.list).toHaveLength(CALLS_PER_DAY);
      expect(s.calls!.list.some((c) => c.kind === 'rumor')).toBe(false);
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
