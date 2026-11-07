import { describe, expect, it } from 'vitest';
import {
  bigSqueezeGoal, callBigSqueeze, canAssault, canCallBigSqueeze, CLOSE, HQS, hqPlot, isWeakened, manorStewards, migrateSave, newGame, newStand,
  onYou, planNight, PLOTS, raidsCounted, rivalsBankrupt, siegeDone, siegeFought, siegeTargets, siegeTonight, sleepUntilDawn, SQUEEZE_READY,
  squeezeAtDawn, squeezedHq, stormHQ, syndicateFormed, type BattleReport, type GameState, type Guard, type Mode, type Raid, type RivalId,
} from './economy.ts';

const RIVALS: RivalId[] = ['sourwood', 'fizzco', 'hollis', 'coldbrew', 'blenders'];

/** Morning Prep on Day 136 of a Classic campaign at Rank 9: every rival flush, `stands` stands of yours. */
function finale(seed = 3, stands = 6, mode: Mode = 'campaign'): GameState {
  const s = newGame(seed, { mode });
  Object.assign(s, { day: 136, rank: 9, tutorialRaidDone: true, raids: [] });
  for (const id of RIVALS) Object.assign(s.rivals[id], { cash: 1e7, budget: { grow: 0, guard: 0, strike: 1e6 } });
  const side = PLOTS.filter((p) => (p.district === 'maple' || p.district === 'oldtown') && p.type === 'street' && !s.plots[p.id].owner);
  for (const p of side.slice(0, stands - 1)) s.plots[p.id] = { ...s.plots[p.id], owner: 'player', stand: newStand(2) };
  return s;
}
/** Closing time: the night's raids get planned. */
const closing = (s: GameState) => { Object.assign(s, { phase: 'report', minute: CLOSE }); planNight(s); return s.raids.filter((r) => onYou(s, r)); };
const report = (outcome: BattleReport['outcome']) => ({ outcome }) as BattleReport;
const siegeRaid = { siege: true } as Raid;
/** One siege night scored straight from its fights' outcomes, then its dawn. */
function night(s: GameState, ...outcomes: BattleReport['outcome'][]) {
  for (const o of outcomes) siegeFought(s, siegeRaid, report(o));
  s.day++;
  squeezeAtDawn(s);
}

describe('the Big Squeeze goal and button', () => {
  it('from Rank 9 of the campaign Lottie posts one goal with no timer, and says so once; never in Sandbox or Endless', () => {
    const s = finale();
    s.rank = 8;
    expect(bigSqueezeGoal(s)).toBeNull();
    expect(canCallBigSqueeze(s)).toEqual({ ok: false, why: 'Needs Rank 9, Bay Kingpin' });
    squeezeAtDawn(s);
    expect(s.squeeze).toBeUndefined();
    s.rank = 9;
    expect(bigSqueezeGoal(s)).toEqual({ text: 'Call the Big Squeeze', progress: 0, done: false });
    squeezeAtDawn(s);
    squeezeAtDawn(s);
    expect(s.news.filter((n) => n === `Lottie: "${SQUEEZE_READY}"`)).toHaveLength(1);
    expect(SQUEEZE_READY).toBe("When you're ready, kid. Not a minute before.");
    for (const mode of ['sandbox', 'endless'] as Mode[]) {
      const other = finale(3, 6, mode);
      expect(bigSqueezeGoal(other)).toBeNull();
      expect(canCallBigSqueeze(other)).toEqual({ ok: false, why: 'Story campaign only' });
      squeezeAtDawn(other);
      expect(other.squeeze).toBeUndefined();
    }
  });

  it('is called at Morning Prep, not during a Truce with Vera, and only once', () => {
    const s = finale();
    s.phase = 'open';
    expect(canCallBigSqueeze(s)).toEqual({ ok: false, why: 'Call it at Morning Prep' });
    expect(callBigSqueeze(s)).toBe(false);
    s.phase = 'prep';
    s.rivals.sourwood.truceUntil = s.day + 2;
    expect(canCallBigSqueeze(s)).toEqual({ ok: false, why: 'Truce with Vera until day 138' });
    s.rivals.sourwood.truceUntil = 0;
    expect(canCallBigSqueeze(s)).toEqual({ ok: true });
    expect(callBigSqueeze(s)).toBe(true);
    expect(s.squeeze).toMatchObject({ called: 136, nights: 0, held: 0, lost: 0 });
    expect(siegeTonight(s)).toBe(true);
    expect(canCallBigSqueeze(s)).toEqual({ ok: false, why: 'Called already' });
    expect(bigSqueezeGoal(s)).toEqual({ text: 'Hold the siege: night 1 of 7', progress: 0, done: false });
  });

  it("names tonight's 2–3 targets among your stands, on the alert feed and in the Bugle, and forms the Pact if it must", () => {
    const counts = new Set<number>();
    for (let seed = 1; seed <= 30; seed++) {
      const s = finale(seed);
      expect(syndicateFormed(s)).toBe(false);
      callBigSqueeze(s);
      expect(syndicateFormed(s)).toBe(true); // Vera calls in the Pact to hold her Manor
      expect(s.alerts!.some((a) => a.text.startsWith('Bugle: PACT IS BACK'))).toBe(true);
      const targets = siegeTargets(s);
      counts.add(targets.length);
      expect(new Set(targets).size).toBe(targets.length);
      for (const t of targets) expect(s.plots[t]).toMatchObject({ owner: 'player' });
      const card = s.alerts!.find((a) => a.text.startsWith('Siege targets: '))!;
      expect(card).toMatchObject({ kind: 'note', plot: targets[0] });
      expect(s.news.some((n) => n.startsWith('Bugle: Siege night 1 of 7: the Pact circles '))).toBe(true);
      expect(s.news).toContain('Bugle: THE BIG SQUEEZE: LOTTIE CALLS OUT SOURWOOD MANOR');
    }
    expect([...counts].sort()).toEqual([2, 3]);
    const one = finale(3, 1); // Lottie's Corner alone
    callBigSqueeze(one);
    expect(siegeTargets(one)).toHaveLength(1);
  });
});

describe('the siege', () => {
  it('each siege night brings one Syndicate strike, split over exactly the named targets, boss-led, all Smash', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = finale(seed);
      callBigSqueeze(s);
      const targets = siegeTargets(s);
      const raids = closing(s);
      expect(raidsCounted(raids)).toBe(1);
      expect(raids.map((r) => r.target).sort()).toEqual([...targets].sort());
      for (const r of raids) expect(r).toMatchObject({ siege: true, syndicate: true, objective: 'smash', attacker: raids[0].attacker });
      expect(raids[0].party![0].name).toBe(HQS[raids[0].attacker as RivalId].boss);
      expect(raids.flatMap((r) => r.party!).length).toBeGreaterThanOrEqual(13); // 12–20 and the boss
    }
  });

  it('the Pact is all in: a beaten member still strikes; a Truce keeps one out; with all of them in one, none comes', () => {
    const s = finale(5);
    callBigSqueeze(s);
    for (const id of RIVALS) s.rivals[id].respectUntil = s.day + 3; // all beaten last night
    expect(closing(structuredClone(s)).length).toBeGreaterThan(0);
    for (const id of RIVALS.filter((x) => x !== 'blenders')) s.rivals[id].truceUntil = s.day + 3;
    for (let i = 0; i < 10; i++) {
      const t = structuredClone(s);
      t.seed = i * 7919 + 1;
      expect(new Set(closing(t).map((r) => r.attacker))).toEqual(new Set(['blenders']));
    }
    s.rivals.blenders.truceUntil = s.day + 3;
    expect(closing(s)).toEqual([]);
  });

  it('a night counts as held only if the strike came and every fight at the targets was won; a smashed target adds a Steward', () => {
    const s = finale(7);
    callBigSqueeze(s);
    night(s, 'repelled', 'repelled');
    expect(s.squeeze).toMatchObject({ nights: 1, held: 1, lost: 0 });
    expect(s.news).toContain("Bugle: The siege lines hold! Sourwood Manor's Gate is down to 4,500 HP");
    expect(s.news.some((n) => n.startsWith('Bugle: Siege night 2 of 7: '))).toBe(true);
    expect(squeezedHq(s, 'sourwood')).toMatchObject({ gate: 4500, yard: HQS.sourwood.yard - 1 });
    night(s, 'repelled', 'smashed');
    expect(s.squeeze).toMatchObject({ nights: 2, held: 1, lost: 1 });
    expect(s.news).toContain('Bugle: The Pact breaks through: Vera hires 1 more Steward');
    expect(manorStewards(s, 'sourwood')).toBe(4);
    night(s, 'damaged'); // hurt but standing: not held, not lost
    expect(s.squeeze).toMatchObject({ nights: 3, held: 1, lost: 1 });
    night(s); // nobody came: nothing to hold
    expect(s.squeeze).toMatchObject({ nights: 4, held: 1 });
    expect(s.news).toContain('Bugle: A quiet night on the siege lines');
    expect(bigSqueezeGoal(s)).toEqual({ text: 'Hold the siege: night 5 of 7', progress: 4 / 7, done: false });
    night(s, 'repelled');
    night(s, 'repelled', 'repelled', 'repelled');
    expect(siegeDone(s)).toBe(false);
    night(s, 'smashed', 'smashed');
    expect(s.squeeze).toMatchObject({ nights: 7, held: 3, lost: 3, done: 143 });
    expect(siegeDone(s)).toBe(true);
    expect(siegeTonight(s)).toBe(false);
    expect(siegeTargets(s)).toEqual([]);
    expect(s.alerts!.at(-1)).toMatchObject({ kind: 'note', text: 'The siege is over: storm Sourwood Manor', plot: hqPlot('sourwood').id });
    expect(bigSqueezeGoal(s)).toEqual({ text: 'Storm Sourwood Manor', progress: 1, done: false });
    expect(squeezedHq(s, 'sourwood')).toMatchObject({ gate: 3500, yard: HQS.sourwood.yard - 3 });
    expect(manorStewards(s, 'sourwood')).toBe(6);
    squeezeAtDawn(s); // over is over
    expect(s.squeeze!.nights).toBe(7);
    expect(migrateSave(JSON.parse(JSON.stringify(s)))!.squeeze).toEqual(s.squeeze);
  });

  it('seven good nights leave the Gate at 1,500 of its 5,000 and seven Yard elites benched', () => {
    const s = finale();
    callBigSqueeze(s);
    for (let n = 0; n < 7; n++) night(s, 'repelled', 'repelled');
    expect(squeezedHq(s, 'sourwood')).toMatchObject({ gate: 1500, yard: HQS.sourwood.yard - 7 });
    expect(HQS.sourwood.gate).toBe(5000);
    s.squeeze!.held = 9; // more than seven can't take it lower
    expect(squeezedHq(s, 'sourwood').gate).toBe(1500);
  });

  it('on the night clock, every fight at the targets is scored by dawn', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const s = finale(seed);
      callBigSqueeze(s);
      const raids = closing(s);
      expect(sleepUntilDawn(s)).toBe(true);
      const fights = s.battles.filter((b) => b.day === 136 && b.defender === 'player');
      expect(fights).toHaveLength(raids.length);
      const smashed = fights.filter((b) => b.outcome === 'smashed').length;
      expect(s.squeeze).toMatchObject({ nights: 1, held: fights.every((b) => b.outcome === 'repelled') ? 1 : 0, lost: smashed });
      expect(siegeTargets(s).length).toBeGreaterThan(0); // night 2's, named at dawn
    }
  });
});

describe('Sourwood Manor in the campaign', () => {
  const squad = (s: GameState, n = 12) => {
    s.guards = Array.from({ length: n }, (_, i): Guard => ({ id: `g${i}`, name: `G${i}`, trait: 'Loyal', level: 5, xp: 0, weapon: 'hatchets', gear: 'pro', post: null, outUntil: 0, fee: 0 }));
    return s.guards.map((g) => g.id);
  };

  it("can't be stormed before the siege is done; after it, Weakened or not; Sandbox keeps the Weakened rule", () => {
    const s = finale();
    s.cash = 1000; // nowhere near Vera's worth: she isn't Weakened
    const ids = squad(s);
    expect(isWeakened(s, 'sourwood')).toBe(false);
    expect(canAssault(s, 'sourwood', ids)).toEqual({ ok: false, why: 'Call the Big Squeeze first' });
    callBigSqueeze(s);
    night(s, 'repelled');
    night(s, 'repelled');
    expect(canAssault(s, 'sourwood', ids)).toEqual({ ok: false, why: 'After the siege: night 3 of 7' });
    for (let n = 0; n < 5; n++) night(s, 'repelled');
    expect(isWeakened(s, 'sourwood')).toBe(false);
    expect(canAssault(s, 'sourwood', ids)).toEqual({ ok: true });
    expect(canAssault(s, 'fizzco', ids)).toEqual({ ok: false, why: 'Only once they are Weakened' }); // the other HQs as before
    const sandbox = finale(3, 6, 'sandbox');
    sandbox.cash = 1000;
    expect(canAssault(sandbox, 'sourwood', squad(sandbox))).toEqual({ ok: false, why: 'Only once they are Weakened' });
    expect(squeezedHq(sandbox, 'sourwood')).toBe(HQS.sourwood);
    expect(manorStewards(sandbox, 'sourwood')).toBe(3);
  });

  it('the assault fights the Manor the siege left: the Yard short its benched elites, a Steward more for each plot lost', () => {
    let boss = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const s = finale(seed);
      callBigSqueeze(s);
      for (let n = 0; n < 7; n++) night(s, ...(n < 2 ? ['smashed'] as const : ['repelled'] as const));
      expect(s.squeeze).toMatchObject({ held: 5, lost: 2 });
      const res = stormHQ(s, 'sourwood', squad(s));
      expect(res).not.toBe(false);
      if (!res) continue;
      expect(res.reports[0].hq).toBe('gate');
      if (res.reports[1]) expect(res.reports[1].defenders).toHaveLength(HQS.sourwood.yard - 5);
      if (res.reports[2]) { boss++; expect(res.reports[2].defenders).toHaveLength(1 + 3 + 5); } // Vera, 3 bodyguards, 3 + 2 Stewards
      if (res.won) expect(s.rivals.sourwood.alive).toBe(false); // the same HQ elimination the finale's scene waits for
      else expect(canAssault(s, 'sourwood', s.guards.map((g) => g.id)).ok).toBe(true); // regroup and come back
    }
    expect(boss).toBeGreaterThan(0);
  });

  it('Vera never goes bust in the campaign; in Sandbox she does', () => {
    for (const mode of ['campaign', 'sandbox'] as Mode[]) {
      const s = finale(3, 6, mode);
      Object.assign(s.rivals.sourwood, { cash: -1, brokeDays: 6 });
      rivalsBankrupt(s);
      expect(s.rivals.sourwood.alive).toBe(mode === 'campaign');
    }
  });
});
