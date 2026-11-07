import { describe, expect, it } from 'vitest';
import {
  bigSqueezeGoal, callBigSqueeze, canAssault, canCallBigSqueeze, CLOSE, eliminate, HQS, hqPlot, isWeakened, manorStewards, migrateSave, newGame, newStand,
  NIGHT_END, nightStep, onYou, planNight, PLOTS, raidsCounted, rivalsBankrupt, siegeDone, siegeFought, siegeTargets, siegeTonight, sleepUntilDawn, SQUEEZE_READY, startNight,
  squeezeAtDawn, squeezedHq, stormHQ, SYNDICATE_CALL, syndicateFormed, type BattleReport, type GameState, type Guard, type Mode, type Raid, type RivalId,
  bugleNews, hqStageInput, PLOT_BY_ID,
} from './economy.ts';
import { checkGoals, goalReward, goalsNow } from './goals.ts';
import { CALL_PRIORITY } from './phone.ts';
import { stepFight, watchFights } from './fight.ts';

const RIVALS: RivalId[] = ['sourwood', 'fizzco', 'hollis', 'coldbrew', 'blenders'];

/** Morning Prep on Day 136 of a Classic campaign at Rank 9, a month into Act 5: every rival flush, `stands` stands of yours. */
function finale(seed = 3, stands = 6, mode: Mode = 'campaign'): GameState {
  const s = newGame(seed, { mode });
  Object.assign(s, { day: 136, rank: 9, tutorialRaidDone: true, raids: [], story: { act: 5, since: 106 } });
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
  it('opens from Rank 9 in Act 5 of the campaign, and Lottie says so once; never in Sandbox or Endless', () => {
    const s = finale();
    s.rank = 8;
    expect(canCallBigSqueeze(s)).toEqual({ ok: false, why: 'Needs Rank 9, Bay Kingpin' });
    squeezeAtDawn(s);
    expect(s.squeeze).toBeUndefined();
    s.rank = 9;
    s.story = { act: 4, since: 80 }; // FizzCo still stands
    expect(canCallBigSqueeze(s)).toEqual({ ok: false, why: 'Opens in Act 5' });
    squeezeAtDawn(s);
    expect(s.squeeze).toBeUndefined();
    s.story = { act: 5, since: 106 };
    expect(canCallBigSqueeze(s)).toEqual({ ok: true });
    expect(bigSqueezeGoal(s)).toBeNull(); // the card shows story's own Act 5 goal until the call
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

  it('Vera answers on the phone: with the Pact standing, her own call; if she calls it in, her follow-up is the answer', () => {
    const s = finale();
    s.syndicate = { formed: 120 };
    callBigSqueeze(s);
    expect(s.phone!.queue[0]).toMatchObject({ who: 'sourwood', text: '', mood: 'warn', priority: CALL_PRIORITY.story });
    const fresh = finale();
    callBigSqueeze(fresh);
    expect(fresh.phone!.queue.filter((c) => c.who === 'sourwood')).toEqual([expect.objectContaining({ text: SYNDICATE_CALL, priority: CALL_PRIORITY.story })]);
  });

  it("Lottie's card: story's Call the Big Squeeze, then each siege night, then the storm, ticked off once as Vera falls", () => {
    const s = finale();
    checkGoals(s);
    expect(goalsNow(s)[2]).toMatchObject({ text: 'Call the Big Squeeze', story: true, done: false });
    callBigSqueeze(s);
    checkGoals(s);
    expect(goalsNow(s)[2]).toMatchObject({ text: 'Hold the siege: night 1 of 7', story: true, progress: 0 });
    for (let n = 0; n < 7; n++) { night(s, 'repelled'); checkGoals(s); }
    expect(goalsNow(s)[2]).toMatchObject({ text: 'Storm Sourwood Manor', story: true, done: false });
    eliminate(s, 'sourwood', 'hq'); // stormHQ's win
    const reward = goalReward(s, 'long');
    checkGoals(s);
    const paid = s.news.filter((n) => n.startsWith('✓ Storm Sourwood Manor +$'));
    expect(paid).toHaveLength(1);
    expect(paid[0]).toBe(`✓ Storm Sourwood Manor +$${Math.round(reward).toLocaleString('en-US')}`);
    checkGoals(s);
    expect(s.news.filter((n) => n.startsWith('✓ Storm Sourwood Manor'))).toHaveLength(1); // once
    expect(s.goals!.done).toContain('big-squeeze:Storm Sourwood Manor');
    expect(s.goals!.done).not.toContain('act-5'); // story's own Act 5 goal doesn't pay it again
    expect(goalsNow(s)[2].text).not.toMatch(/Squeeze|Sourwood/);
    expect(bigSqueezeGoal(finale(3, 6, 'sandbox'))).toBeNull();
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

describe('the Big Squeeze in the Bugle', () => {
  const place = (id: string) => PLOT_BY_ID[id].name.replace(/ lot /, ' ');
  it("leads the front page the day you call it, each siege dawn with that night's targets, and the morning it ends", () => {
    const s = finale();
    callBigSqueeze(s); // Vera calls in the Pact too: its line rides along as the first brief
    let paper = bugleNews(s);
    expect(paper.headline).toEqual(['THE BIG SQUEEZE!', 'Lottie calls out Sourwood Manor']);
    expect(paper.briefs[0]).toBe('Pact is back: Sourwood signs up everyone but the kid.');
    night(s, 'repelled');
    paper = bugleNews(s);
    const names = siegeTargets(s).map(place);
    expect(paper.headline[0]).toBe('SIEGE NIGHT 2!');
    for (const n of names) expect(paper.headline[1]).toContain(n);
    expect(paper.briefs).not.toContain('Pact is back: Sourwood signs up everyone but the kid.'); // that was yesterday's
    for (let n = 0; n < 6; n++) night(s, 'repelled');
    expect(siegeDone(s)).toBe(true);
    expect(bugleNews(s).headline).toEqual(['SIEGE OVER!', "Sourwood Manor's Gate at 1,500 HP"]);
    s.day++;
    expect(bugleNews(s).headline[0]).not.toMatch(/SIEGE|SQUEEZE|PACT/); // and then the paper moves on
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
    expect(bigSqueezeGoal(s)).toEqual({ text: 'Storm Sourwood Manor', progress: 0, done: false });
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
    expect(hqStageInput(s, 'sourwood', 'gate', [], { seed: 1 }).standHp).toBe(1500); // the storm's Gate fight starts there
    expect(hqStageInput(s, 'sourwood', 'yard', [], { seed: 1 }).defenders).toHaveLength(HQS.sourwood.yard - 7);
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

  it('a siege fight played live (the game watching) is scored as it ends', () => {
    watchFights(true);
    try {
      for (let seed = 1; seed <= 4; seed++) {
        const s = finale(seed);
        callBigSqueeze(s);
        closing(s);
        startNight(s);
        while (!s.fight && s.minute < NIGHT_END) nightStep(s);
        expect(s.fight?.raid.siege).toBe(true);
        const before = { fought: 0, repelled: 0, fell: 0, ...s.squeeze!.tonight };
        let ended: BattleReport | undefined;
        for (let i = 0; !ended && i < 1e5; i++) ended = stepFight(s, 0.5).ended;
        expect(s.squeeze!.tonight).toEqual({
          fought: before.fought + 1,
          repelled: before.repelled + (ended!.outcome === 'repelled' ? 1 : 0),
          fell: before.fell + (ended!.outcome === 'smashed' ? 1 : 0),
        });
      }
    } finally {
      watchFights(false);
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
