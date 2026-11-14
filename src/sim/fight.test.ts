import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFight, runBattle, type BattleInput } from './combat.ts';
import {
  atOnce, BOSS_MOVE_SHOWN, canFallBack, canRally, fightCommand, fightFrame, fightStatus, finishFight, FIGHT_BREAK, FIGHT_LEAD_IN, joinFight, liveReport,
  startAssault, startFight, stepFight, watchFights,
} from './fight.ts';
import { battleOf, fencedOf, fighterOf, footholdFor, guardOf, guardsOf, henchmenOf } from './fighters.ts';
import { leftBehind } from './captives.ts';
import { CLOSE, FACTIONS, PERIMETERS } from './balance.ts';
import { PLOT_BY_ID } from './map.ts';
import {
  equip, FIGHT_BUTTONS, nightStep, ownedPlots, raidTargets, refreshRecruits, STAND_HP, welcomeDex, newGame, type GameState, type Raid, type RivalId,
  availableRaiders, awayGuards, DAYTIME_RAID_REP, FIGHT_SECONDS_PER_GAME_MINUTE, openStand, planRaid, squadHome, tickMinute, travelMinutes,
  buildFacility, MINUTES_PER_DAY, NIGHT_END, OPEN, PICKUP_MINUTE, PLOTS, hqPlot,
  buildClubhouse, callBigSqueeze, newStand, planNight, playerWon, RESERVE_MINUTES, startNight, waitingRaids, type BattleReport, type SimEvent,
  canPost, detectionChance, fillable, fillPosts, postAtFirstFree, postGuard, presentGuards, type Blocker,
} from './economy.ts';
import { ringTheBell } from './reinforce.ts';
import { canWaitAt, IN_THE_FIGHT, waitAt } from './clubhouse.ts';
import { setAutoDefend, setDefendPriority, stationByPriority } from './autodefend.ts';

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

beforeAll(() => watchFights(true)); // as the game does: fights you're in play live
afterAll(() => watchFights(false));

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

  it('the pause holds the fight and the clock: no time, no step', () => {
    const s = crew(22);
    const target = raidTargets(s)[0];
    startFight(s, raidOn(s, target.id), false);
    stepFight(s, FIGHT_LEAD_IN + 4);
    const before = JSON.stringify(s.fight);
    expect(stepFight(s, 0)).toEqual({ minutes: 0 });
    expect(JSON.stringify(s.fight)).toBe(before);
    expect(fightStatus(s)!.clock).toBeCloseTo(4);
  });

  it('a frame of the game loop: paused, the fight and the clock hold; running, both move a minute a fight-second', () => {
    const s = crew(22);
    const target = raidTargets(s).find((p) => s.plots[p.id].stand?.level === 1)!.id;
    s.plots[target].defense = { tier: 5, fenceHp: 5000, gadgets: [] }; // a long fight
    openStand(s);
    expect(startFight(s, raidOn(s, target), false)).toBe(true);
    const minute = s.minute, t = s.fight!.t;
    for (let i = 0; i < 600; i++) expect(fightFrame(s, 1 / 60, true)).toBeNull(); // ten paused seconds
    expect(s.fight!.t).toBe(t);
    expect(s.minute).toBe(minute);
    let ticked = 0;
    const seen: number[] = [];
    for (let i = 0; i < 60 * (FIGHT_LEAD_IN + 10); i++) ticked += fightFrame(s, 1 / 60, false, (ev) => seen.push(ev.length))!.minutes;
    expect(s.fight!.t).toBeCloseTo(10, 6);
    expect(ticked).toBe(10); // the walk in moves nothing, then a game minute every fight-second
    expect(s.minute).toBe(minute + 10);
    expect(seen.length).toBe(10); // each minute's events, for the 3D view
    expect(fightFrame({ ...s, fight: undefined } as GameState, 1, false)).toBeNull(); // no fight on: nothing to run
  });

  it('a live fight still going at 07:00 holds dawn: that night\'s report, a day Out for a KO, the squad home in the morning', () => {
    const s = crew(29);
    const target = raidTargets(s).find((p) => s.plots[p.id].stand?.level === 1)!.id;
    s.plots[target].defense = { tier: 3, fenceHp: 1200, gadgets: [] }; // half a minute of chopping under the stakes
    s.plots[target].garrison = 2;
    s.phase = 'night';
    s.minute = NIGHT_END - 11;
    const night = s.day;
    const travel = travelMinutes(s, squadHome(s, target), target);
    const raid: Raid = { ...raidOn(s, target), eta: '06:50', leave: NIGHT_END - 10 - travel, at: NIGHT_END - 10, launched: true };
    s.raids.push(raid);
    let ended, held = 0;
    for (let frames = 0; s.phase === 'night' && frames < 1e5; frames++) {
      if (!s.fight) { tickMinute(s); continue; }
      ended = fightFrame(s, 1 / 30, false)?.ended ?? ended;
      if (s.fight && s.minute >= NIGHT_END) { held++; expect(s.phase).toBe('night'); expect(s.minute).toBe(NIGHT_END); }
    }
    expect(ended).toBeTruthy();
    expect(ended!.duration).toBeGreaterThan(10); // contact at 06:50, still brawling past 07:00
    expect(held).toBeGreaterThan(0);
    expect(s.phase).toBe('prep');
    expect(s.day).toBe(night + 1);
    expect(ended!.day).toBe(night);
    const knocked = ended!.koed.filter((id) => s.guards.some((g) => g.id === id) && !s.captives?.some((c) => c.id === id));
    expect(knocked.length).toBeGreaterThan(0);
    for (const id of knocked) expect(s.guards.find((g) => g.id === id)!.outUntil).toBe(night + 2); // Out the one day
    // The walk home is timed from contact, so the squad gets in this morning, as if it was fought at once.
    expect(raid.back).toBe(NIGHT_END - 10 + Math.ceil(ended!.duration / FIGHT_SECONDS_PER_GAME_MINUTE) + travel - MINUTES_PER_DAY);
    expect(raid.back).toBeLessThan(OPEN + 3 * 60);
    openStand(s);
    for (let m = 0; s.minute < raid.back! && m < MINUTES_PER_DAY; m++) tickMinute(s);
    expect(awayGuards(s).size).toBe(0);
  });

  it('nobody watching, a skip, or a fight you are not in: fought at once', () => {
    const s = crew(27);
    const [t1, t2] = raidTargets(s);
    expect(typeof atOnce(() => startFight(s, raidOn(s, t1.id), false))).toBe('object');
    const theirs: Raid = { id: 'rx', attacker: 'coldbrew', target: t2.id, objective: 'smash', party: henchmenOf(3, 1, 'fists'), detected: true, eta: '23:00' };
    expect(typeof startFight(s, theirs, true)).toBe('object');
    expect(s.fight).toBeUndefined();
  });

  it('a raid on you arriving on the night clock plays live, then reports', () => {
    const s = crew(28);
    const home = ownedPlots(s, 'player')[0].id;
    s.phase = 'night';
    s.minute = 23 * 60;
    s.raids.push({ id: 'rn', attacker: 'blenders', target: home, objective: 'smash', party: henchmenOf(2, 1, 'fists'), detected: true, eta: '23:01', leave: 22 * 60, at: 23 * 60 + 1, launched: true, warned: true });
    expect(nightStep(s).some((e) => e.type === 'fight')).toBe(false); // no instant result: it's on screen
    expect(s.fight?.raid.id).toBe('rn');
    expect(s.fight?.side).toBe('def');
    expect(s.raids.some((r) => r.id === 'rn')).toBe(false);
    const { ended } = play(s);
    expect(ended.attacker).toBe('blenders');
    expect(s.battles[0]).toBe(ended);
  });

  it('your raid sent now walks there, plays live as it arrives, and the squad walks home after', () => {
    const s = crew(29);
    const target = raidTargets(s).find((p) => s.plots[p.id].stand?.level === 1)!.id;
    footholdFor(s, target); // crew: raids need a Foothold in the target's district
    expect(planRaid(s, target, s.guards.map((g) => g.id), 'smash', 'now')).toBe(true); // nothing fought yet: they set out
    expect(s.fight).toBeUndefined();
    openStand(s);
    let reported = false;
    while (!s.fight && s.phase === 'open') reported = tickMinute(s).some((e) => e.type === 'fight') || reported;
    expect(reported).toBe(false); // no instant result: it's on screen
    const raid = s.fight!.raid, start = s.minute;
    expect(start).toBe(raid.at);
    expect(availableRaiders(s)).toEqual([]); // in the fight: nobody free to send
    const rep = s.reputation;
    const { ended } = play(s); // the clock isn't moved here: the walk home is timed from contact all the same
    expect(raid.back).toBe(start + Math.ceil(ended.duration / FIGHT_SECONDS_PER_GAME_MINUTE) + travelMinutes(s, squadHome(s, target), target));
    expect(awayGuards(s).size).toBeGreaterThan(0); // walking home: their posts sit empty
    expect(s.reputation).toBe(Math.max(1, Math.round((rep - DAYTIME_RAID_REP.smash) * 100) / 100)); // customers saw it
  });

  it('a Delivery Raid fought live holds the load until the fight ends, then settles it', () => {
    // Rank 7, a helipad and a 4,000-bottle chopper order due today: the first seed whose pickup draws a Delivery Raid.
    let s: GameState | undefined;
    for (let seed = 1; seed < 80 && !s?.raids.some((r) => r.delivery); seed++) {
      s = newGame(seed);
      s.rank = 7;
      s.reputation = 4.5;
      s.cash = 3_000_000;
      const field = PLOTS.find((p) => p.type === 'field')!.id;
      s.plots[field] = { ...s.plots[field], owner: 'player', stand: null, facility: undefined, invested: 0 };
      buildFacility(s, field, 'helipad');
      s.bottles = 6000;
      s.orders.push({ id: 'vip', tier: 'heli', client: 'Test Star', qty: 4000, pay: 15000, due: s.day, expires: s.day, plot: field, accepted: true });
      openStand(s);
      while (s.minute <= PICKUP_MINUTE.heli) tickMinute(s);
    }
    const raid = s!.raids.find((r) => r.delivery)!;
    raid.party = raid.party!.map((f) => ({ ...f, hit: 200, chop: 500, hp: 1000, nerve: 500 })); // they overrun it
    while (!s!.fight && s!.phase === 'open') tickMinute(s!);
    expect(s!.fight?.raid.id).toBe(raid.id);
    expect(s!.heldPickups).toEqual(['vip']); // still loading while they brawl
    tickMinute(s!); // the fight moves the clock a minute at a time
    expect(s!.heldPickups).toEqual(['vip']);
    expect(s!.orders.some((o) => o.id === 'vip')).toBe(true);
    const { ended } = play(s!);
    expect(ended).toMatchObject({ delivery: true, outcome: 'robbed' });
    expect(s!.heldPickups).toEqual([]);
    expect(s!.orders.some((o) => o.id === 'vip')).toBe(false);
    expect(s!.bottles).toBe(4000); // world: a Pad loads 2,000 bottles a trip, and the raiders make off with that load (vip.ts)
    expect(s!.news.some((n) => n.startsWith('Order fell through: Test Star.'))).toBe(true);
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

  it('a save with a guard rung into the fight he was already in (the old bell) loads with him in it once: one fight, named and paid once', () => {
    const s = newGame(7);
    const home = ownedPlots(s, 'player')[0].id;
    s.guards = [guardOf('clubs', 'vest', 2, 'Smooth Talker', { post: home, name: 'Dex' })];
    startFight(s, { id: 'rl', attacker: 'blenders', target: home, objective: 'smash', party: henchmenOf(3, 1, 'fists'), detected: true, eta: '' }, true);
    stepFight(s, FIGHT_LEAD_IN + 1);
    const plain = JSON.parse(JSON.stringify(s)) as GameState;
    s.fight!.commands.push({ t: 2, type: 'join', fighters: s.fight!.input.defenders }); // the bell before it checked who's in the fight
    const old = JSON.parse(JSON.stringify(s)) as GameState; // saved then, loaded now
    expect(liveReport(old)!.joins).toEqual([]); // the 3D view brings nobody in again
    const a = play(plain).ended, b = play(old).ended;
    expect(b).toEqual(a); // the fight without the copy, to the last swing
    expect(b.defenders.map((f) => f.id)).toEqual([s.guards[0].id]);
    expect(b.joins).toBeUndefined();
    expect(JSON.stringify(old)).toBe(JSON.stringify(plain)); // his XP and his KO, once
  });

  it('a raid of yours that lands while a fight is on screen is fought at once (raids on you wait their turn)', () => {
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

describe('fights on you play one after another', () => {
  /** Night at 23:00: Lottie's Corner and a Wooden Stand down the street, a guard on each, a Clubhouse on the same
   * street with Big Lou waiting in it, and a raid on each stand due at 23:01. */
  function twoRaids(seed = 41) {
    const s = newGame(seed);
    Object.assign(s, { rank: 7, cash: 1e6, phase: 'night', minute: 23 * 60 });
    const home = ownedPlots(s, 'player')[0].id;
    const [second, club] = PLOTS.filter((p) => p.type === 'street' && p.district === PLOT_BY_ID[home].district && !s.plots[p.id].owner).map((p) => p.id);
    s.plots[second] = { ...s.plots[second], owner: 'player', stand: newStand(1) };
    s.plots[club].owner = 'player';
    expect(buildClubhouse(s, club)).toBe(true);
    const lou = guardOf('clubs', 'vest', 1, 'Smooth Talker', { name: 'Big Lou', club });
    s.guards = [guardOf('clubs', 'vest', 1, 'Smooth Talker', { post: home }), guardOf('clubs', 'vest', 1, 'Smooth Talker', { post: second }), lou];
    const raid = (id: string, attacker: RivalId, target: string): Raid =>
      ({ id, attacker, target, objective: 'smash', party: henchmenOf(3, 1, 'fists'), detected: true, eta: '23:01', leave: 22 * 60, at: 23 * 60 + 1, launched: true, warned: true });
    s.raids.push(raid('ra', 'blenders', home), raid('rb', 'coldbrew', second));
    return { s, home, second, lou };
  }

  it('two raids landing together: the second waits at its plot, named on the fight bar, and goes in live as the first ends', () => {
    const { s, second } = twoRaids();
    const ev = nightStep(s);
    expect(ev.some((e) => e.type === 'fight')).toBe(false); // nothing fought at once
    expect(s.fight?.raid.id).toBe('ra');
    expect(waitingRaids(s).map((r) => r.id)).toEqual(['rb']);
    expect(fightStatus(s)!.next).toBe(second);
    let first: BattleReport | undefined;
    for (let i = 0; !first && i < 1e5; i++) {
      first = fightFrame(s, 1 / 30, false, (e) => expect(e.some((x) => x.type === 'fight')).toBe(false))?.ended;
      if (!first) expect(s.fight!.raid.id).toBe('ra'); // the second never cuts in
    }
    const end = 23 * 60 + 1 + Math.round(first!.duration / FIGHT_SECONDS_PER_GAME_MINUTE);
    expect(s.minute).toBe(end); // the clock ran the whole first fight
    expect(s.fight).toMatchObject({ raid: { id: 'rb' }, side: 'def', start: end }); // in at the minute the first ended
    expect(fightStatus(s)!.next).toBeUndefined();
    expect(waitingRaids(s)).toEqual([]);
    const { ended } = play(s);
    expect(ended).toMatchObject({ attacker: 'coldbrew', target: second, day: first!.day });
    expect(s.battles.slice(0, 2)).toEqual([ended, first]);
    expect(s.fight).toBeUndefined();
  });

  it('the bell rung on a raid waiting its turn: its reserve still gets there at its own minute', () => {
    const { s, lou } = twoRaids();
    nightStep(s);
    expect(ringTheBell(s, 'rb')).toBe(true); // warned and waiting: the bell answers it
    expect(s.fight!.raid.bell).toBeUndefined(); // not the fight on screen
    const due = 23 * 60 + 1 + RESERVE_MINUTES.same;
    let first: BattleReport | undefined;
    for (let i = 0; !first && i < 1e5; i++) first = fightFrame(s, 1 / 30, false)?.ended;
    const contact = s.fight!.start!;
    const { ended } = play(s);
    const at = ended.events.find((e) => e.type === 'at' && e.a === lou.id)?.t;
    expect(at).toBe(Math.max(0, due - contact) * FIGHT_SECONDS_PER_GAME_MINUTE); // contact moved; the walk didn't
  });

  it('nobody watching (a skip, or Sleep), the raid waiting its turn is fought at once', () => {
    const { s } = twoRaids();
    nightStep(s);
    expect(waitingRaids(s)).toHaveLength(1);
    const reports = atOnce(() => finishFight(s));
    expect(reports.map((b) => b.attacker)).toEqual(['blenders']);
    expect(s.fight).toBeUndefined();
    expect(waitingRaids(s)).toEqual([]);
    expect(s.battles.map((b) => b.attacker).sort()).toEqual(['blenders', 'coldbrew']);
  });

  it('finishFight (the skips) settles the fight on screen and the raids waiting behind it', () => {
    const { s } = twoRaids();
    nightStep(s);
    const reports = finishFight(s);
    expect(reports.map((b) => b.attacker)).toEqual(['blenders', 'coldbrew']);
    expect(s.fight).toBeUndefined();
    expect(s.raids.filter((r) => r.attacker !== 'player')).toEqual([]);
  });

  it('a reload with a raid waiting picks it up where it was', () => {
    const { s } = twoRaids();
    nightStep(s);
    stepFight(s, FIGHT_LEAD_IN + 2);
    const b = JSON.parse(JSON.stringify(s)) as GameState;
    expect(fightStatus(b)!.next).toBe(fightStatus(s)!.next);
    play(s);
    play(b);
    expect(b.fight?.raid.id).toBe('rb');
    expect(JSON.stringify(b)).toBe(JSON.stringify(s));
  });

  it('a siege night: each part of the strike plays live in turn, and every one is scored by dawn', () => {
    for (let seed = 1; seed <= 3; seed++) {
      const s = newGame(seed, { mode: 'campaign' });
      Object.assign(s, { day: 136, rank: 9, tutorialRaidDone: true, raids: [], story: { act: 5, since: 106 } });
      for (const id of ['sourwood', 'fizzco', 'hollis', 'coldbrew', 'blenders'] as RivalId[]) Object.assign(s.rivals[id], { cash: 1e7, budget: { grow: 0, guard: 0, strike: 1e6 } });
      const side = PLOTS.filter((p) => (p.district === 'maple' || p.district === 'oldtown') && p.type === 'street' && !s.plots[p.id].owner);
      for (const p of side.slice(0, 5)) s.plots[p.id] = { ...s.plots[p.id], owner: 'player', stand: newStand(2) };
      expect(callBigSqueeze(s)).toBe(true);
      Object.assign(s, { phase: 'report', minute: CLOSE });
      planNight(s);
      const parts = s.raids.filter((r) => r.siege);
      expect(parts.length).toBeGreaterThanOrEqual(2);
      startNight(s);
      const live: BattleReport[] = [];
      let waited = 0;
      const atOnceOnYou = (e: SimEvent[]) => e.filter((x) => x.type === 'fight' && x.report.defender === 'player');
      for (let frames = 0; s.phase === 'night' && frames < 1e6; frames++) {
        if (!s.fight) { expect(atOnceOnYou(tickMinute(s))).toEqual([]); continue; }
        if (fightStatus(s)!.next) waited++;
        const r = fightFrame(s, 0.5, false, (e) => expect(atOnceOnYou(e)).toEqual([]));
        if (r?.ended) live.push(r.ended);
      }
      expect(s.phase).toBe('prep');
      const sieged = live.filter((b) => parts.some((p) => p.target === b.target));
      expect(sieged.length).toBe(parts.length); // every part, live
      expect(waited).toBeGreaterThan(0); // close enough together that some waited their turn
      const smashed = sieged.filter((b) => b.outcome === 'smashed').length;
      expect(s.squeeze).toMatchObject({ nights: 1, held: sieged.every((b) => b.outcome === 'repelled') ? 1 : 0, lost: smashed });
    }
  });
});

describe('a guard is in one fight at a time', () => {
  /**
   * Gus stands the Corner's post and is on tonight's raid (or HQ Assault on the Blend Shack), Pip with him unless he
   * goes alone. Cold Brew land at the Corner a minute before the squad sets out at 01:00: tanky raiders at a Fortress
   * wall, a fight still on when the squad gets where it's going. Played as the game plays it, till that fight is over.
   */
  function heldAtHisPost(alone: boolean, hq = false) {
    const s = newGame(1);
    Object.assign(s, { rank: 10, cash: 1e6 });
    if (hq) for (const p of ownedPlots(s, 'blenders').filter((p) => p.type !== 'hq').slice(1)) s.plots[p.id] = { ...s.plots[p.id], owner: null, stand: null }; // Weakened
    const home = ownedPlots(s, 'player')[0].id;
    const gus = guardOf('hatchets', 'pro', 5, 'Smooth Talker', { post: home, name: 'Gus' });
    const pip = guardOf('hatchets', 'pro', 5, 'Smooth Talker', { name: 'Pip' });
    s.guards = alone ? [gus] : [gus, pip];
    const trip = (id: string) => travelMinutes(s, squadHome(s, id), id);
    const target = hq ? hqPlot('blenders').id : raidTargets(s).filter((p) => s.plots[p.id].stand).sort((a, b) => trip(a.id) - trip(b.id))[0].id;
    if (!hq) footholdFor(s, target);
    Object.assign(s, { phase: 'report', minute: CLOSE });
    expect(planRaid(s, target, s.guards.map((g) => g.id), hq ? 'hq' : 'smash', 'tonight')).toBe(true);
    const mine = s.raids.find((r) => r.attacker === 'player')!;
    const owner = s.plots[target].owner as RivalId, grudge = s.rivals[owner].grudge;
    s.plots[home].defense = { tier: 5, fenceHp: 5000, gadgets: [] }; // a long fight
    const party = henchmenOf(3, 3, 'hatchets').map((f) => ({ ...f, hp: 5000, nerve: 1000, chop: 1 }));
    const theirs: Raid = { id: 'rr', attacker: 'coldbrew', target: home, objective: 'smash', party, detected: true, eta: '00:59', leave: mine.leave! - 60, at: mine.leave! - 1, launched: true, warned: true };
    s.raids.push(theirs);
    startNight(s);
    const atOnce: BattleReport[] = []; // fights reported while he's at the Corner
    const look = (ev: SimEvent[]) => { for (const e of ev) if (e.type === 'fight' && s.fight?.raid === theirs) atOnce.push(e.report); };
    let held: BattleReport | undefined;
    for (let frames = 0; !held && frames < 1e5; frames++) {
      if (!s.fight) { look(tickMinute(s)); continue; }
      const ended = fightFrame(s, 0.25, false, look)?.ended;
      if (ended?.target === home) held = ended;
    }
    return { s, gus, pip, mine, target, held: held!, atOnce, grudge: () => s.rivals[owner].grudge - grudge };
  }

  it('a guard still defending his post as his squad sets out stays behind: it goes without him, or not at all', () => {
    for (const hq of [false, true]) {
      const { s, gus, pip, mine, held, atOnce } = heldAtHisPost(false, hq);
      expect(held.defenders.filter((f) => f.id === gus.id)).toHaveLength(1); // he held the Corner
      expect(mine.guards).toEqual([pip.id]); // and Pip went without him
      expect(atOnce.length).toBeGreaterThan(0); // fought at once while Gus was still at the Corner
      for (const b of atOnce) expect(b.attackers.map((f) => f.id)).toEqual([pip.id]);
      expect(s.battles.filter((b) => [...b.attackers, ...b.defenders].some((f) => f.id === gus.id))).toEqual([held]);
    }
    const { s, mine, target, atOnce, grudge } = heldAtHisPost(true);
    expect(s.raids).not.toContain(mine);
    expect(s.news).toContain(`Raid on ${PLOT_BY_ID[target].name} called off: nobody fit to go.`);
    expect(atOnce).toEqual([]);
    expect(s.battles.some((b) => b.target === target)).toBe(false); // no fight there,
    expect(grudge()).toBe(0); // and no Grudge
  });
});

describe('a guard in the fight playing live stays where he is till it ends', () => {
  const held: Blocker = { ok: false, why: IN_THE_FIGHT };
  /** Brock's raid on the Corner playing live (`raiders` with fists), at 23:00 or (`day`) on Day 6 at 14:00: Gus (Eagle
   * Eye) holds its post, Pip a Kiosk down the street, and Lou waits at one of two Clubhouses on the same street. */
  function brawl(day = false, raiders = 3) {
    const s = newGame(41);
    Object.assign(s, { rank: 7, cash: 1e6, phase: 'night', minute: 23 * 60 });
    const home = ownedPlots(s, 'player')[0].id;
    const [kiosk, club, club2] = PLOTS.filter((p) => p.type === 'street' && p.district === PLOT_BY_ID[home].district && !s.plots[p.id].owner).map((p) => p.id);
    s.plots[kiosk] = { ...s.plots[kiosk], owner: 'player', stand: newStand(3) };
    for (const c of [club, club2]) { s.plots[c].owner = 'player'; expect(buildClubhouse(s, c)).toBe(true); }
    if (day) Object.assign(s, { day: 6, phase: 'open', minute: 14 * 60 });
    const gus = guardOf('clubs', 'vest', 1, 'Eagle Eye', { name: 'Gus', post: home });
    const pip = guardOf('clubs', 'vest', 1, 'Smooth Talker', { name: 'Pip', post: kiosk });
    const lou = guardOf('clubs', 'vest', 1, 'Smooth Talker', { name: 'Lou', club });
    s.guards = [gus, pip, lou];
    const raid: Raid = { id: 'ra', attacker: 'blenders', target: home, objective: 'smash', party: henchmenOf(raiders, 1, 'fists'), detected: true, eta: day ? '14:00' : '23:00', leave: s.minute - 60, at: s.minute, launched: true, warned: true };
    expect(startFight(s, raid, !day)).toBe(true);
    return { s, home, kiosk, club, club2, gus, pip, lou };
  }

  it("no post, no Clubhouse, no All here and no Auto-Defend moves him; the rest of the crew moves, and he does once it's over", () => {
    const { s, home, kiosk, club, club2, gus, pip, lou } = brawl();
    const seen = detectionChance(s, kiosk, true);
    // Gus brawls at the Corner: not to the Kiosk, the reserve or a Clubhouse, and All here would bring Lou, not him.
    expect(canPost(s, gus.id, kiosk)).toEqual(held);
    expect(canPost(s, gus.id, null)).toEqual(held);
    expect(postGuard(s, gus.id, kiosk)).toBe(false);
    expect(postAtFirstFree(s, gus.id, [kiosk, club])).toBeNull();
    expect(canWaitAt(s, gus.id, club)).toEqual(held);
    expect(waitAt(s, gus.id, club)).toBe(false);
    expect([fillable(s, kiosk), fillable(s, kiosk, true)]).toEqual([1, 2]);
    // Rung, Lou is in it too, from the moment he sets out: All here has nobody left to bring.
    expect(ringTheBell(s, 'ra')).toBe(true);
    expect(canPost(s, lou.id, kiosk)).toEqual(held);
    expect(canWaitAt(s, lou.id, club2)).toEqual(held);
    expect(waitAt(s, lou.id, club2)).toBe(false);
    expect(fillPosts(s, kiosk)).toBe(0);
    // Pip isn't in it: he moves as ever, and Dex's Auto-Defend posts him again, not Lou.
    expect(postGuard(s, pip.id, null)).toBe(true);
    expect(waitAt(s, pip.id, club2)).toBe(true);
    expect(setAutoDefend(s, true)).toBe(true);
    expect(setDefendPriority(s, kiosk, 1)).toBe(true);
    expect(stationByPriority(s)).toBe(1);
    expect([gus.post, pip.post, lou.post, lou.club]).toEqual([home, kiosk, null, club]);
    expect(presentGuards(s, kiosk)).toEqual([pip]); // Gus's Eagle Eye spots raids at the Corner only
    expect(detectionChance(s, kiosk, true)).toBe(seen);
    play(s);
    expect(s.fight).toBeUndefined();
    expect(canPost(s, gus.id, kiosk)).toEqual({ ok: true });
    expect(postGuard(s, gus.id, kiosk)).toBe(true);
    expect(waitAt(s, lou.id, club2)).toBe(true);
    expect([gus.post, lou.club]).toEqual([kiosk, club2]);
  });

  it("one a game saved before that loads posted away mid-fight watches the fight's plot, not his new post, till it ends", () => {
    const { s, home, kiosk, gus, pip } = brawl(false, 1); // one raider: Gus comes out of it on his feet
    const seen = detectionChance(s, kiosk, true);
    gus.post = kiosk; // as a save from before canPost held him can load him (reinforce.test.ts has one sent off post)
    expect(presentGuards(s, kiosk)).toEqual([pip]); // still brawling at the Corner: his Eagle Eye isn't on the Kiosk
    expect(presentGuards(s, home)).toEqual([]);
    expect(detectionChance(s, kiosk, true)).toBe(seen);
    play(s);
    expect(s.fight).toBeUndefined();
    expect(presentGuards(s, kiosk)).toEqual([gus, pip]); // the fight over, he's at his post
    expect(detectionChance(s, kiosk, true)).toBeGreaterThan(seen);
  });

  it('an HQ assault holds its squad at every door; a guard left at home moves, and they do once the last door is fought', () => {
    const s = newGame(4);
    Object.assign(s, { rank: 10, cash: 1e9 });
    for (const p of ownedPlots(s, 'blenders').filter((p) => p.type !== 'hq').slice(1)) s.plots[p.id] = { ...s.plots[p.id], owner: null, stand: null }; // Weakened
    const home = ownedPlots(s, 'player')[0].id;
    s.guards = Array.from({ length: 9 }, () => guardOf('hatchets', 'pro', 5));
    const [lead, left] = [s.guards[0], s.guards[8]];
    expect(startAssault(s, 'blenders', s.guards.slice(0, 8).map((g) => g.id))).toBe(true);
    expect(canPost(s, lead.id, home)).toEqual(held);
    expect(postGuard(s, lead.id, home)).toBe(false);
    expect(postGuard(s, left.id, home)).toBe(true);
    expect(postGuard(s, left.id, null)).toBe(true);
    const doors: string[] = [];
    for (let i = 0; i < 4 && s.fight; i++) {
      doors.push(s.fight.hq!.stage);
      for (const f of s.fight.input.attackers) expect(canPost(s, f.id, null)).toEqual(held);
      play(s);
    }
    expect(doors).toEqual(['gate', 'yard', 'boss']);
    expect(s.fight).toBeUndefined();
    expect(postGuard(s, lead.id, home)).toBe(true);
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
    const target = raidTargets(s)[0].id;
    s.plots[target].defense = { tier: 5, fenceHp: 5000, gadgets: [] }; // a long fight,
    s.plots[target].garrison = 0; // with nobody behind the fence to drop two guards and rout the rest, whatever the dice
    startFight(s, raidOn(s, target), false);
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

  it.each([4, 5])('Fall Back on defense behind a T%i fence: the raiders never reach the stand, but the fight is theirs', (tier) => {
    const input = battleOf({ attackers: henchmenOf(3, 1, 'clubs'), defenders: guardsOf(2, 'def', 'clubs', 'vest'), ...fencedOf(tier), standHp: STAND_HP[0], objective: 'shakedown' });
    expect(runBattle(input, { seed: 1 }).winner).toBe('def'); // standing their ground, the guards win it
    const gaveUp = runBattle(input, { seed: 1 }, [{ t: 0, type: 'fallBack', side: 'def' }]);
    expect(gaveUp).toMatchObject({ outcome: 'repelled', fellBack: 'def', winner: 'att' }); // still at the fence when their time ran out
    expect(leftBehind(input.attackers, gaveUp)).toEqual([]); // and nobody stayed behind to nab anyone
  });

  it.each([0, 5])('guards who Fall Back (fence T%i) have lost: the raiders feel no Respect, the guards earn a loser\'s XP, and the news says so', (tier) => {
    const s = crew(34);
    const home = ownedPlots(s, 'player')[0].id;
    s.plots[home].defense = tier ? { tier, fenceHp: PERIMETERS[tier - 1].hp, gadgets: [] } : { tier: 0, fenceHp: 0, gadgets: [] };
    for (const g of s.guards) g.post = home;
    const xp = new Map(s.guards.map((g) => [g.id, g.xp]));
    const respect = s.rivals.blenders.respectUntil;
    const raid: Raid = { id: 'rfb', attacker: 'blenders', target: home, objective: 'smash', party: henchmenOf(3, 1, 'clubs'), detected: true, eta: '' };
    expect(startFight(s, raid, true)).toBe(true);
    expect(s.fight!.side).toBe('def');
    expect(fightCommand(s, 'fallBack')).toBe(true);
    const { ended } = play(s);
    expect(ended.fellBack).toBe('def');
    expect(ended.outcome).toBe(tier ? 'repelled' : 'smashed');
    expect(s.rivals.blenders.respectUntil).toBe(respect); // they don't back off from guards who left
    const fought = ended.defenders.filter((d) => xp.has(d.id));
    expect(fought.length).toBe(s.guards.length);
    for (const d of fought) expect(s.guards.find((g) => g.id === d.id)!.xp).toBe(xp.get(d.id)! + 1);
    const line = s.news.find((n) => n.includes('fall back'))!;
    if (tier) expect(line).toBe(`Your guards fall back from ${PLOT_BY_ID[home].name}, and ${FACTIONS.blenders.name} leave empty-handed.`);
    else expect(line).toMatch(/^Your guards fall back\. /);
    expect(s.world!.fights![0]).toMatchObject({ attacker: 'blenders', defender: 'player', outcome: ended.outcome, fellBack: 'def' }); // the Bugle's note
    expect(playerWon(ended)).toBe(false);
    expect(s.captives ?? []).toEqual([]);
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

  it('the squad walks into the Yard with the HP the Gate left them', () => {
    const s = rich(7, 'blenders');
    for (const g of s.guards) { g.level = 2; g.weapon = 'clubs'; g.gear = 'none'; }
    expect(startAssault(s, 'blenders', s.guards.slice(0, 5).map((g) => g.id))).toBe(true);
    const gate = s.fight!.input;
    const { ended } = play(s);
    expect(s.fight?.hq?.stage).toBe('yard');
    const yard = s.fight!.input.attackers;
    expect(yard.map((f) => f.id)).toEqual(gate.attackers.filter((f) => !ended.koed.includes(f.id) && !ended.fled.includes(f.id)).map((f) => f.id));
    let bruised = 0;
    for (const f of yard) {
      const was = gate.attackers.find((x) => x.id === f.id)!;
      const taken = ended.events.reduce((a, e) => a + (e.type === 'swing' && e.b === f.id ? e.dmg : 0), 0) * (1 - was.armor);
      expect(f.hp).toBeCloseTo(was.hp - taken, 6);
      if (taken > 0) bruised++;
    }
    expect(bruised).toBeGreaterThan(0);
  });

  it('names the boss\'s move on the fight bar as it goes off', () => {
    const s = rich(8, 'blenders');
    expect(startAssault(s, 'blenders', s.guards.slice(0, 12).map((g) => g.id))).toBe(true);
    play(s); // the Gate
    play(s); // the Yard
    expect(s.fight?.hq?.stage).toBe('boss');
    stepFight(s, FIGHT_LEAD_IN + FIGHT_BREAK + 0.5); // in the door: Brock charges at contact
    expect(fightStatus(s)!.bossMove).toBe('Blender Rush');
    stepFight(s, BOSS_MOVE_SHOWN);
    expect(fightStatus(s)?.bossMove).toBeUndefined();
  });

  it('planned in the Raid Planner, it goes live when it gets to the gate, and the squad walks home after', () => {
    const s = rich(9, 'blenders');
    s.reputation = 4;
    const hq = hqPlot('blenders').id;
    const ids = s.guards.slice(0, 12).map((g) => g.id);
    expect(planRaid(s, hq, ids, 'hq', 'now')).toBe(true);
    const raid = s.raids.find((r) => r.assault)!;
    openStand(s);
    while (!s.fight && s.minute < CLOSE) tickMinute(s);
    expect(s.minute).toBe(raid.at);
    expect(s.fight).toMatchObject({ night: false, hq: { rival: 'blenders', stage: 'gate' } });
    expect(s.fight!.raid).toBe(raid);
    expect(s.fight!.input.detected).toBe(raid.detected); // rolled at the HQ: unseen, they strike first
    const stages: string[] = [];
    for (let i = 0; i < 4 && s.fight; i++) { stages.push(s.fight.hq!.stage); expect(s.fight.night).toBe(false); play(s); }
    expect(stages).toEqual(['gate', 'yard', 'boss']);
    expect(s.rivals.blenders.alive).toBe(false);
    expect(s.reputation).toBeCloseTo(3.8, 5); // by day: a Smash's stars
    expect(s.raids.find((r) => r.id === raid.id)!.back).toBeGreaterThan(s.minute);
    expect(awayGuards(s)).toEqual(new Set(ids)); // walking home
  });
});

describe('fighters', () => {
  it('builds plain fighters and guards', () => {
    expect(fighterOf('att', 'clubs').hit).toBe(18);
    expect(guardsOf(1, 'def', 'clubs', 'vest')[0].hp).toBe(140);
  });
});
