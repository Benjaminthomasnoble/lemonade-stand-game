import { describe, expect, it } from 'vitest';
import { createFight, runBattle, type BattleInput } from './combat.ts';
import {
  canFallBack, canRally, fightCommand, fightStatus, finishFight, FIGHT_LEAD_IN, joinFight, liveReport, pauseFight, startAssault, startFight, stepFight,
} from './fight.ts';
import { battleOf, fencedOf, fighterOf, guardOf, guardsOf, henchmenOf } from './fighters.ts';
import {
  equip, FIGHT_BUTTONS, ownedPlots, raidTargets, refreshRecruits, STAND_HP, welcomeDex, newGame, type GameState, type Raid, type RivalId,
} from './economy.ts';

/** A crew of five club-and-vest guards, ready to raid. */
function crew(seed: number): GameState {
  const s = newGame(seed);
  s.rank = 3;
  welcomeDex(s);
  s.cash = 1e6;
  s.rank = 6;
  s.guards.push(...Array.from({ length: 4 }, () => guardOf('clubs', 'vest')));
  for (const g of s.guards) equip(s, g.id, 'clubs');
  return s;
}
const raidOn = (s: GameState, target: string, objective: Raid['objective'] = 'smash'): Raid =>
  ({ id: `r${s.nextId++}`, attacker: 'player', target, objective, guards: s.guards.map((g) => g.id), detected: false, eta: '' });
/** Play the live fight in frames of dt real seconds until it ends; the game minutes the clock moved. */
function play(s: GameState, dt = 1 / 60) {
  let minutes = 0, frames = 0;
  let ended;
  const f = s.fight;
  while (s.fight === f && frames++ < 1e6) { const r = stepFight(s, dt); minutes += r.minutes; ended = r.ended ?? ended; }
  return { minutes, ended: ended!, frames };
}

describe('a live fight', () => {
  it('stepping a tick at a time gives exactly the fight runBattle runs to the end', () => {
    const input: BattleInput = battleOf({ attackers: henchmenOf(5, 2, 'clubs'), defenders: guardsOf(2, 'def', 'clubs', 'vest'), ...fencedOf(2), standHp: STAND_HP[2], objective: 'shakedown', detected: false });
    const whole = runBattle(input, { seed: 7 });
    const fight = createFight(input, { seed: 7 });
    for (let t = 0; !fight.done(); t += 0.37) fight.advance(t);
    expect(fight.result()).toEqual(whole);
    expect(fight.time()).toBe(whole.duration);
  });

  it('runs at 1 game minute per fight-second, starts after the walk in, and moves the clock by the fight length', () => {
    const s = crew(21);
    const target = raidTargets(s).find((p) => s.plots[p.id].stand?.level === 1)!;
    expect(startFight(s, raidOn(s, target.id), false)).toBe(true);
    expect(s.fight!.t).toBe(-FIGHT_LEAD_IN);
    // While they walk in the clock waits.
    expect(stepFight(s, FIGHT_LEAD_IN - 0.01).minutes).toBe(0);
    // Then a game minute for every second of fight.
    let first = 0;
    for (let i = 0; i < 100; i++) first += stepFight(s, 0.01).minutes; // 1 s more: 0.99 s of fight
    expect(first).toBe(0);
    expect(stepFight(s, 0.02).minutes).toBe(1);
    const { minutes, ended } = play(s);
    expect(ended).toBeTruthy();
    expect(1 + minutes).toBe(Math.round(ended.duration));
    expect(s.battles[0]).toBe(ended);
    expect(s.fight).toBeUndefined();
  });

  it('pausing holds the fight and the clock', () => {
    const s = crew(22);
    const target = raidTargets(s)[0];
    startFight(s, raidOn(s, target.id), false);
    stepFight(s, FIGHT_LEAD_IN + 4);
    const before = JSON.stringify(s.fight);
    pauseFight(s);
    expect(stepFight(s, 30)).toEqual({ minutes: 0 });
    expect(JSON.stringify({ ...s.fight, paused: undefined })).toBe(before);
    expect(fightStatus(s)!.paused).toBe(true);
    pauseFight(s);
    expect(fightStatus(s)!.paused).toBe(false);
  });

  it('picks up mid-brawl after a reload, the same fight to the last swing', () => {
    const a = crew(23);
    const target = raidTargets(a).find((p) => a.plots[p.id].stand?.level === 1)!;
    startFight(a, raidOn(a, target.id, 'shakedown'), false);
    stepFight(a, FIGHT_LEAD_IN + 3.3);
    fightCommand(a, 'rally');
    stepFight(a, 1.1);
    const b = JSON.parse(JSON.stringify(a)) as GameState; // a save and a load
    const ra = play(a, 0.05).ended, rb = play(b, 0.2).ended;
    expect(rb).toEqual(ra);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it('a second fight while one is on screen is fought at once', () => {
    const s = crew(24);
    const [t1, t2] = raidTargets(s);
    expect(startFight(s, raidOn(s, t1.id), false)).toBe(true);
    const r = startFight(s, { ...raidOn(s, t2.id), guards: [] }, false);
    expect(typeof r).toBe('object');
    expect(s.fight!.raid.target).toBe(t1.id);
  });

  it('the 3D view gets a report whose events grow as it runs, and that becomes the final report', () => {
    const s = crew(25);
    startFight(s, raidOn(s, raidTargets(s)[0].id), false);
    const view = liveReport(s)!;
    expect(view.duration).toBe(Infinity);
    stepFight(s, FIGHT_LEAD_IN + 2);
    const seen = view.events.length;
    expect(seen).toBeGreaterThan(0);
    const { ended } = play(s);
    expect(view.events.length).toBeGreaterThan(seen);
    expect(view.duration).toBe(ended.duration);
    expect(view.outcome).toBe(ended.outcome);
  });

  it('finishFight settles it now (skipping the day or sleeping does not wait)', () => {
    const s = crew(26);
    startFight(s, raidOn(s, raidTargets(s)[0].id), false);
    stepFight(s, FIGHT_LEAD_IN + 1);
    const [r] = finishFight(s);
    expect(s.fight).toBeUndefined();
    expect(s.battles[0]).toBe(r);
  });
});

describe('the fight buttons', () => {
  /** A fight where the raiders' Nerve check comes at a known moment: 4 fists against 2 clubs over a fence. */
  const nerveFight = () => battleOf({ attackers: henchmenOf(4, 1, 'fists'), defenders: guardsOf(2, 'def', 'clubs', 'vest'), ...fencedOf(2), standHp: STAND_HP[1] });

  it('Rally lifts Nerve by 20 for 10 seconds: fewer run if the check lands inside it', () => {
    let fewer = 0, more = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const input = nerveFight();
      const plain = runBattle(input, { seed });
      const rallied = runBattle(input, { seed }, [{ t: 0, type: 'rally', side: 'att' }, { t: 9.75, type: 'rally', side: 'att' }]);
      const ran = (r: typeof plain) => r.fled.filter((id) => id.startsWith('h')).length;
      if (ran(rallied) < ran(plain)) fewer++;
      if (ran(rallied) > ran(plain)) more++;
    }
    expect(fewer).toBeGreaterThan(5);
    expect(more).toBe(0);
  });

  it('a Rally that ends before the check does nothing', () => {
    const input = nerveFight();
    const plain = runBattle(input, { seed: 3 });
    const early = runBattle(input, { seed: 3 }, [{ t: 0, type: 'rally', side: 'def' }]);
    expect(early.fled).toEqual(plain.fled);
    expect(early.events.find((e) => e.type === 'rally')).toEqual({ t: 0, type: 'rally', side: 'def' });
  });

  it('Rally is every 30 seconds, Fall Back once a fight', () => {
    const s = crew(31);
    s.plots[raidTargets(s)[0].id].defense = { tier: 5, fenceHp: 5000, gadgets: [] }; // a long fight
    startFight(s, raidOn(s, raidTargets(s)[0].id), false);
    expect(canRally(s)).toBe(true);
    expect(fightCommand(s, 'rally')).toBe(true);
    expect(canRally(s)).toBe(false);
    stepFight(s, FIGHT_LEAD_IN + FIGHT_BUTTONS.rally.every - 1);
    expect(fightCommand(s, 'rally')).toBe(false);
    stepFight(s, 1.01);
    expect(canRally(s)).toBe(true);
    expect(canFallBack(s)).toBe(true);
    expect(fightCommand(s, 'fallBack')).toBe(true);
    expect(canFallBack(s)).toBe(false);
    expect(fightCommand(s, 'fallBack')).toBe(false);
  });

  it('Fall Back on a raid: everyone standing goes home with the KO\'d, and the raid is lost', () => {
    const s = crew(32);
    const target = raidTargets(s)[0];
    startFight(s, raidOn(s, target.id), false);
    stepFight(s, FIGHT_LEAD_IN + 2);
    fightCommand(s, 'fallBack');
    const { ended } = play(s);
    expect(ended.outcome).toBe('repelled');
    const ids = s.guards.map((g) => g.id);
    const standing = ids.filter((id) => !ended.koed.includes(id));
    expect(ended.fled.filter((id) => ids.includes(id)).sort()).toEqual(standing.sort());
    expect(ended.duration).toBeLessThanOrEqual(2.25);
  });

  it('Fall Back on defense: the guards leave and the raiders go on to the objective unopposed', () => {
    const input = battleOf({ attackers: henchmenOf(2, 1, 'fists'), defenders: guardsOf(2, 'def', 'clubs', 'vest'), standHp: STAND_HP[0], objective: 'smash' });
    const held = runBattle(input, { seed: 4 });
    const gaveUp = runBattle(input, { seed: 4 }, [{ t: 1, type: 'fallBack', side: 'def' }]);
    expect(held.outcome).toBe('repelled');
    expect(gaveUp.outcome).toBe('smashed');
    expect(gaveUp.fellBack).toBe('def');
    expect(gaveUp.koed.some((id) => input.defenders.some((d) => d.id === id))).toBe(false);
  });

  it('fighters can join mid-fight', () => {
    const late = guardsOf(5, 'def', 'hatchets', 'pro');
    const input = battleOf({ attackers: henchmenOf(5, 2, 'clubs'), defenders: guardsOf(1, 'def', 'clubs', 'vest'), standHp: STAND_HP[2], objective: 'shakedown' });
    const alone = runBattle(input, { seed: 5 });
    const helped = runBattle({ ...input, joins: [{ t: 6, fighters: late }] }, { seed: 5 });
    expect(alone.winner).toBe('att');
    expect(helped.events.filter((e) => e.type === 'at' && e.t === 6).map((e) => (e as { a: string }).a)).toEqual(late.map((f) => f.id));
    expect(helped.events.some((e) => e.type === 'swing' && late.some((f) => f.id === e.a))).toBe(true);
    expect(helped.winner).toBe('def');
  });

  it('joinFight sends help into the live fight', () => {
    const s = crew(33);
    s.rank = 6;
    const rival = ownedPlots(s, 'blenders').find((p) => s.plots[p.id].stand)!;
    const raid: Raid = { id: 'rv', attacker: 'blenders', target: ownedPlots(s, 'player')[0].id, objective: 'smash', party: henchmenOf(4, 2, 'clubs'), detected: true, eta: '' };
    expect(rival).toBeTruthy();
    startFight(s, raid, false);
    expect(s.fight!.side).toBe('def');
    expect(joinFight(s, guardsOf(2, 'def', 'clubs'), 5)).toBe(true);
    expect(s.fight!.commands[0]).toMatchObject({ type: 'join', t: 5 });
  });
});

describe('a live HQ assault', () => {
  function rich(seed: number, id: RivalId) {
    const s = newGame(seed);
    s.rank = 10; s.cash = 1e9;
    for (const p of ownedPlots(s, id).filter((p) => p.type !== 'hq').slice(1)) s.plots[p.id] = { ...s.plots[p.id], owner: null, stand: null };
    for (let i = 0; i < 4; i++) { refreshRecruits(s, true); for (const r of [...s.recruits]) { s.guards.push({ ...r, post: null }); } }
    for (const g of s.guards) { g.level = 5; g.weapon = 'hatchets'; g.gear = 'pro'; }
    return s;
  }

  it('fights the Gate, the Yard and the Boss Room live, one after another', () => {
    const s = rich(4, 'blenders');
    const ids = s.guards.slice(0, 12).map((g) => g.id);
    expect(startAssault(s, 'blenders', ids)).toBe(true);
    const stages: string[] = [];
    for (let i = 0; i < 4 && s.fight; i++) { stages.push(s.fight.hq!.stage); play(s); }
    expect(stages).toEqual(['gate', 'yard', 'boss']);
    expect(s.rivals.blenders.alive).toBe(false);
    expect(s.battles[0].hq).toBe('boss');
  });

  it('a lone rookie stalls at the Gate', () => {
    const s = rich(5, 'blenders');
    s.guards.push(guardOf('fists'));
    startAssault(s, 'blenders', [s.guards[s.guards.length - 1].id]);
    play(s);
    expect(s.rivals.blenders.alive).toBe(true);
    expect(s.battles[0].hq).toBe('gate');
    expect(s.battles[0].outcome).toBe('repelled');
  });

  it('only one fight at a time', () => {
    const s = rich(6, 'blenders');
    startAssault(s, 'blenders', [s.guards[0].id]);
    expect(startAssault(s, 'blenders', [s.guards[1].id])).toBe(false);
  });
});

describe('fighters', () => {
  it('builds plain fighters and guards', () => {
    expect(fighterOf('att', 'clubs').hit).toBe(18);
    expect(guardsOf(1, 'def', 'clubs', 'vest')[0].hp).toBe(140);
  });
});
