import { afterEach, describe, expect, it } from 'vitest';
import {
  AUTO_DEFEND, BORDERS, buildClubhouse, CLOSE, FIGHT_SECONDS_PER_GAME_MINUTE, fightRaid, hhmm, LOTTIES_CORNER, newGame, newStand, nightStep, openStands, ownedPlots,
  detectionChance, PERIMETERS, PLOT_BY_ID, PLOTS, postsFor, raidOdds, RANKS, RIVAL_HELP, simulateRestOfDay, startNight, threatLevel, travelMinutes, type BattleReport, type GameState, type Guard,
  type Raid, type SimEvent,
} from './economy.ts';
import { fitGarrison } from './garrison.ts';
import { autoDefendOn, canAutoDefend, cycleDefendPriority, defendPriority, setAutoDefend, setDefendPriority, stationByPriority } from './autodefend.ts';
import { reserveAt } from './clubhouse.ts';
import { fightStatus, startFight, stepFight, watchFights } from './fight.ts';
import { guardOf, henchmenOf } from './fighters.ts';
import { bellEta, bellParty, canRingBell, reserveMinutes, ringTheBell, rivalHelpFor, sendHelp } from './reinforce.ts';
import { alertCards } from '../ui/alerts.ts';
import { fightBar } from '../ui/fight.ts';

afterEach(() => watchFights(false));

/** An empty Street plot in this district, now yours. */
function lotIn(s: GameState, district: string): string {
  const p = PLOTS.find((x) => x.type === 'street' && x.district === district && !s.plots[x.id].owner)!;
  s.plots[p.id].owner = 'player';
  return p.id;
}
const name = (id: string) => PLOT_BY_ID[id].name;
const guard = (who: string, o: Partial<Guard> = {}) => guardOf('clubs', 'vest', 1, 'Smooth Talker', { name: who, ...o });

/**
 * Lottie's Corner (Maple Row) behind a Chain-Link with Dex on post, and a
 * Clubhouse on Maple Row (Big Lou and Pip), one in Old Town next door
 * (Marnie) and one on Hilltop, too far (Gus).
 */
function bay(seed = 1) {
  const s = newGame(seed);
  s.rank = 7;
  s.cash = 1e6;
  const maple = lotIn(s, 'maple'), oldtown = lotIn(s, 'oldtown'), hilltop = lotIn(s, 'hilltop');
  for (const id of [maple, oldtown, hilltop]) expect(buildClubhouse(s, id)).toBe(true);
  const dex = guard('Dex', { post: LOTTIES_CORNER }), lou = guard('Big Lou', { club: maple }), pip = guard('Pip', { club: maple });
  const marnie = guard('Marnie', { club: oldtown }), gus = guard('Gus', { club: hilltop });
  s.guards = [dex, lou, pip, marnie, gus];
  Object.assign(s.plots[LOTTIES_CORNER].defense, { tier: 2, fenceHp: PERIMETERS[1].hp });
  s.news = [];
  return { s, maple, oldtown, hilltop, dex, lou, pip, marnie, gus };
}

/** Night on the clock and a Blenders raid on Lottie's Corner, warned `notice` minutes before it hits at 02:25. */
function warned(s: GameState, notice = 15, party = henchmenOf(5, 2, 'clubs')): Raid {
  const at = 26 * 60 + 25;
  s.phase = 'report';
  s.minute = CLOSE;
  s.raids = [];
  const r: Raid = { id: `r${s.nextId++}`, attacker: 'blenders', target: LOTTIES_CORNER, objective: 'smash', party, detected: false, eta: hhmm(at), leave: at - 90, at, launched: true, warnAt: at - notice };
  s.raids.push(r);
  startNight(s);
  s.minute = at - notice - 1;
  while (!r.warned) nightStep(s);
  return r;
}

/** Run the night clock until the raid's fight is over (fought at once: nobody watches). */
function hit(s: GameState, r: Raid): BattleReport {
  const ev: SimEvent[] = [];
  while (s.raids.includes(r)) ev.push(...nightStep(s));
  const f = ev.find((e) => e.type === 'fight');
  return (f as { report: BattleReport }).report;
}
const arrived = (b: BattleReport, g: Guard) => b.events.find((e) => e.type === 'at' && e.a === g.id)?.t;

describe('Ring the Bell', () => {
  it('with no Clubhouse there is no reserve', () => {
    const s = newGame(2);
    s.guards = [guard('Big Lou'), guard('Pip')];
    const r = warned(s);
    expect(bellParty(s, LOTTIES_CORNER)).toEqual([]);
    expect(canRingBell(s, r.id)).toBe(false);
    expect(ringTheBell(s, r.id)).toBe(false);
  });

  it('reaches plots in the same district in 30 minutes and a bordering one in 60; further is out of range', () => {
    const { s, maple, oldtown, hilltop, lou, pip, marnie } = bay();
    expect(reserveMinutes(s, maple, LOTTIES_CORNER)).toBe(30);
    expect(reserveMinutes(s, oldtown, LOTTIES_CORNER)).toBe(60);
    expect(reserveMinutes(s, hilltop, LOTTIES_CORNER)).toBeNull();
    expect(bellParty(s, LOTTIES_CORNER)).toEqual([
      { club: maple, minutes: 30, guards: [lou, pip] },
      { club: oldtown, minutes: 60, guards: [marnie] },
    ]);
  });

  it('rings once a raid, on a warned raid on you: the reserve in range sets out now', () => {
    const { s, maple, oldtown, hilltop, lou, pip, marnie, gus } = bay();
    const r = warned(s);
    const now = s.minute;
    expect(canRingBell(s, r.id)).toBe(true);
    expect(ringTheBell(s, r.id)).toBe(true);
    expect(r.bell).toEqual([{ id: lou.id, at: now + 30 }, { id: pip.id, at: now + 30 }, { id: marnie.id, at: now + 60 }]);
    expect(s.news.at(-1)).toBe(`Ding-ding! Big Lou and Pip leave ${name(maple)}, 30 min out; Marnie leaves ${name(oldtown)}, 60 min out.`);
    expect(canRingBell(s, r.id)).toBe(false); // once per raid
    expect(ringTheBell(s, r.id)).toBe(false);
    expect(reserveAt(s, maple)).toEqual([]); // on their way
    expect(reserveAt(s, hilltop)).toEqual([gus]);
    expect(bellEta(s, r.id)).toBe(30);
    nightStep(s);
    expect(bellEta(s, r.id)).toBe(29);
  });

  it('defense only: not before the warning, not on your own raid, not on a raid between rivals', () => {
    const { s } = bay();
    const r = warned(s, 15);
    r.warned = false;
    expect(canRingBell(s, r.id)).toBe(false);
    r.warned = true;
    const theirs = ownedPlots(s, 'hollis')[0].id;
    s.raids.push(
      { id: 'mine', attacker: 'player', target: ownedPlots(s, 'blenders')[0].id, objective: 'smash', guards: [], detected: false, eta: '02:00', warned: true },
      { id: 'feud', attacker: 'blenders', target: theirs, objective: 'smash', party: henchmenOf(2, 1, 'fists'), detected: false, eta: '02:00', warned: true },
    );
    expect(canRingBell(s, 'mine')).toBe(false);
    expect(canRingBell(s, 'feud')).toBe(false);
    expect(canRingBell(s, 'nope')).toBe(false);
    expect(canRingBell(s, r.id)).toBe(true);
  });

  it('after a 15-minute warning a 30-minute trip lands 15 seconds into the fight, and can swing it', () => {
    const alone = bay(), helped = bay();
    const ra = warned(alone.s, 15, henchmenOf(5, 1, 'clubs')), rh = warned(helped.s, 15, henchmenOf(5, 1, 'clubs'));
    expect(ringTheBell(helped.s, rh.id)).toBe(true);
    const lost = hit(alone.s, ra), held = hit(helped.s, rh);
    expect(held.joins).toEqual([
      { t: 15, fighters: [expect.objectContaining({ id: helped.lou.id }), expect.objectContaining({ id: helped.pip.id })] },
      { t: 45, fighters: [expect.objectContaining({ id: helped.marnie.id })] },
    ]);
    expect(arrived(held, helped.lou)).toBe(15);
    expect(arrived(held, helped.pip)).toBe(15);
    expect(lost.outcome).toBe('smashed');
    expect(held.outcome).toBe('repelled');
    expect(helped.lou.xp).toBeGreaterThan(0); // they fought: the credit is theirs
    expect(arrived(held, helped.marnie)).toBeUndefined(); // the fight was over: Marnie jogs in to the aftermath
    expect(helped.marnie.xp).toBe(0);
    // When the raid is done they're back at their Clubhouses.
    expect(reserveAt(helped.s, helped.maple).map((g) => g.id).sort()).toEqual([helped.lou.id, helped.pip.id].filter((id) => helped.s.guards.find((g) => g.id === id)!.outUntil <= helped.s.day).sort());
    expect(reserveAt(helped.s, helped.oldtown)).toEqual([helped.marnie]);
  });

  it('a detected raid gives them time to get there first: they start in the fight', () => {
    const { s, lou, pip, marnie } = bay();
    const r = warned(s, 45);
    ringTheBell(s, r.id);
    const b = hit(s, r);
    expect(b.defenders.map((f) => f.name)).toEqual(['Dex', 'Big Lou', 'Pip']);
    expect(arrived(b, lou)).toBe(0);
    expect(arrived(b, pip)).toBe(0);
    expect(b.joins?.map((j) => [j.t, j.fighters.map((f) => f.id)])).toEqual([[15, [marnie.id]]]);
  });

  it('a guard posted somewhere else since, or KO\'d, does not come', () => {
    const { s, lou, pip } = bay();
    const r = warned(s, 45);
    ringTheBell(s, r.id);
    pip.post = ownedPlots(s, 'player').find((p) => p.id !== LOTTIES_CORNER)?.id ?? 'elsewhere';
    lou.outUntil = s.day + 1;
    const b = hit(s, r);
    expect(b.defenders.map((f) => f.name)).toEqual(['Dex']);
  });

  it('rung while the fight is on: they join as they arrive, and count in the head count', () => {
    watchFights(true);
    const { s, lou, pip, marnie } = bay(3);
    Object.assign(s.plots[LOTTIES_CORNER].defense, { tier: 3, fenceHp: PERIMETERS[2].hp });
    const r = warned(s, 15, henchmenOf(6, 3, 'clubs'));
    while (!s.fight) nightStep(s);
    expect(s.fight.raid).toBe(r);
    expect(fightBar({ tape: (x) => x, ART: { raid: () => '', shield: () => '' } }, s)).toContain('data-testid="fight-bell"');
    stepFight(s, 5); // 1.5 s into the fight
    expect(ringTheBell(s, r.id)).toBe(true);
    expect(fightBar({ tape: (x) => x, ART: { raid: () => '', shield: () => '' } }, s)).not.toContain('fight-bell');
    expect(s.fight.commands.map((c) => [c.type, c.t])).toEqual([['join', 31.5], ['join', 61.5]]);
    const f = s.fight;
    let ended: BattleReport | undefined, before = 0, after = 0;
    while (!ended) {
      const t = f.t;
      ended = stepFight(s, 0.25).ended;
      if (!ended && t < 31 && f.t >= 31) before = fightStatus(s)!.up.def;
      if (!ended && t < 32 && f.t >= 32) after = fightStatus(s)!.up.def;
    }
    expect(arrived(ended, lou)).toBe(31.5);
    expect(arrived(ended, pip)).toBe(31.5);
    expect(after).toBe(before + 2); // the arrivals stand with their side
    expect(ended.joins?.map((j) => j.t)).toEqual([31.5, 61.5]);
    expect(lou.xp).toBeGreaterThan(0);
    expect(arrived(ended, marnie) === undefined).toBe(marnie.xp === 0);
  });

  it('not on your own raid', () => {
    watchFights(true);
    const { s } = bay();
    const target = ownedPlots(s, 'blenders').find((p) => s.plots[p.id].stand)!.id;
    startFight(s, { id: 'mine', attacker: 'player', target, objective: 'smash', guards: [s.guards[0].id], detected: false, eta: '' }, false);
    expect(s.fight?.side).toBe('att');
    expect(canRingBell(s, 'mine')).toBe(false);
    expect(fightBar({ tape: (x) => x, ART: { raid: () => '', shield: () => '' } }, s)).not.toContain('fight-bell');
  });
});

describe('the warning card', () => {
  it('offers Ring the Bell while a reserve is in range, then says when help gets there', () => {
    const { s } = bay();
    const r = warned(s);
    expect(alertCards(s)[0]).toContain(`data-action="bell" data-raid="${r.id}"`);
    expect(alertCards(s)[0]).not.toContain('data-action="perimeter"');
    ringTheBell(s, r.id);
    expect(alertCards(s)[0]).not.toContain('data-action="bell"');
    expect(alertCards(s)[0]).toContain('Help in 30 min');
  });
});

describe('rivals send help', () => {
  /** A Blenders stand on the Boardwalk, their other garrisons emptied but one plot nearby holding `garrison`; rank 6 is Threat 3. */
  function spotted(garrison: number, rank = 6, seed = 1) {
    const s = newGame(seed);
    s.rank = rank;
    const theirs = ownedPlots(s, 'blenders');
    const target = theirs.find((p) => s.plots[p.id].stand && p.type !== 'hq' && p.district === 'boardwalk')!;
    for (const p of theirs) s.plots[p.id].garrison = 0;
    const near = theirs.find((p) => p.id !== target.id && p.district === target.district)!;
    s.plots[near.id].garrison = garrison;
    s.guards = Array.from({ length: 3 }, (_, i) => guard(`G${i}`));
    s.news = [];
    return { s, target: target.id, near: near.id };
  }
  /** Your raid on it: it set out `lead` game minutes before contact. */
  const raidOn = (s: GameState, target: string, lead: number, detected = true): Raid => ({
    id: `r${s.nextId++}`, attacker: 'player', target, objective: 'smash', guards: s.guards.map((g) => g.id), detected, eta: '', leave: 1500 - lead, at: 1500,
  });
  const bare = () => ({ attackers: [], defenders: [], perimeter: 0, fenceHp: 0, gadgets: [], standHp: 0, objective: 'smash' as const, detected: true });

  it('a spotted raid brings half the garrison of their plots nearby, up to the cap by Threat', () => {
    for (const [garrison, rank, want] of [[4, 6, 2], [6, 6, 2], [3, 6, 1], [1, 6, 0], [6, 10, 3], [6, 1, 1]]) {
      const { s, target, near } = spotted(garrison, rank);
      expect(RIVAL_HELP.cap[threatLevel(s) - 1]).toBe(rank === 10 ? 3 : rank === 6 ? 2 : 1);
      const r = raidOn(s, target, 600);
      const input = sendHelp(s, r, bare(), { seed: 1 });
      expect(input.defenders).toHaveLength(want);
      expect(s.plots[near].garrison).toBe(garrison - want); // they've left their plot
      expect(r.help ?? []).toEqual(want ? [{ from: near, ids: input.defenders.map((f) => f.id) }] : []);
      if (want) expect(s.news.at(-1)).toBe(`Spotted! The Boardwalk Blenders send ${want} to ${name(target)}.`);
    }
  });

  it('they walk over from their plot: there by contact they start in the fight, else they join as they arrive', () => {
    const { s, target, near } = spotted(4);
    const walk = travelMinutes(s, near, target);
    const early = sendHelp(s, raidOn(s, target, walk + 30), bare(), { seed: 1 });
    expect(early.defenders).toHaveLength(2);
    expect(early.joins).toBeUndefined();
    const t = spotted(4);
    const late = sendHelp(t.s, raidOn(t.s, t.target, 20), bare(), { seed: 1 });
    expect(late.defenders).toHaveLength(0);
    expect(late.joins).toEqual([{ t: (walk - 20) * FIGHT_SECONDS_PER_GAME_MINUTE, fighters: expect.any(Array) }]);
    expect(late.joins![0].fighters).toHaveLength(2);
  });

  it('no help for a raid they never saw coming, and none from too far away', () => {
    const { s, target, near } = spotted(4);
    const r = raidOn(s, target, 600, false);
    expect(sendHelp(s, r, bare(), { seed: 1 }).defenders).toEqual([]);
    expect(s.plots[near].garrison).toBe(4);
    expect(r.help).toBeUndefined();
    // Their only other garrison is two districts away: out of range.
    const t = spotted(0);
    const district = PLOT_BY_ID[t.target].district;
    const far = PLOTS.find((p) => p.district !== district && !BORDERS[district].includes(p.district) && p.type !== 'hq')!;
    Object.assign(t.s.plots[far.id], { owner: 'blenders', garrison: 6 });
    expect(rivalHelpFor(t.s, raidOn(t.s, t.target, 600), { seed: 1 })).toEqual([]);
  });

  it('after the fight the help walks home, its knocked-out Out a day or two there, and the target keeps its own', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const { s, target, near } = spotted(4, 6, seed);
      s.plots[target].garrison = 2;
      Object.assign(s.plots[target].defense, { gadgets: ['alarm', 'watchtower'] }); // spotted by day 95% of the time
      s.guards = Array.from({ length: 4 }, (_, i) => guard(`G${i}`, { weapon: 'hatchets', gear: 'pro', level: 5 }));
      const r = raidOn(s, target, 600);
      const report = fightRaid(s, r, false);
      if (!r.detected) continue;
      const helpers = report.defenders.slice(2); // after the target's own two
      expect(helpers).toHaveLength(2);
      const ownKo = report.koed.filter((id) => report.defenders.slice(0, 2).some((f) => f.id === id)).length;
      const helpKo = report.koed.filter((id) => helpers.some((f) => f.id === id)).length;
      expect(ownKo + helpKo).toBeGreaterThan(0);
      expect(s.plots[target].garrison).toBe(2); // a smash scatters nobody, and the knocked-out stay on its books
      expect(fitGarrison(s, target)).toBe(2 - ownKo);
      expect(s.plots[near].garrison).toBe(4);
      expect(fitGarrison(s, near)).toBe(4 - helpKo);
      s.day += 3; // two days at most, then all back on guard
      expect([fitGarrison(s, target), fitGarrison(s, near)]).toEqual([2, 4]);
      expect(r.help).toBeUndefined();
      return;
    }
    throw new Error('never spotted');
  });

  it("the Raid Planner's odds count the help a spotted raid would meet", () => {
    const quiet = spotted(0);
    const busy = spotted(8, 10);
    quiet.s.rank = 10;
    for (const { s, target } of [quiet, busy]) {
      Object.assign(s.plots[target].defense, { gadgets: ['alarm', 'watchtower'] });
      s.plots[target].garrison = 1;
      s.guards = Array.from({ length: 3 }, (_, i) => guard(`G${i}`, { weapon: 'clubs', gear: 'none' })); // 3 Rookies with clubs: one Bro is easy, four aren't
    }
    const odds = (x: typeof quiet) => raidOdds(x.s, x.target, x.s.guards.map((g) => g.id), 'smash', false, 200);
    expect(odds(busy)).toBeLessThan(odds(quiet) - 0.1);
  });
});

describe("Dex's Auto-Defend", () => {
  /** A plot of yours in this district with a stand on it. */
  function standIn(s: GameState, district: string, level = 1): string {
    const p = PLOTS.find((x) => x.district === district && x.type !== 'hq' && !s.plots[x.id].owner)!;
    Object.assign(s.plots[p.id], { owner: 'player', stand: newStand(level) });
    return p.id;
  }

  it('is a switch from Rank 4, off until you flip it', () => {
    const s = newGame(1);
    s.rank = AUTO_DEFEND.rank - 1;
    expect(canAutoDefend(s)).toEqual({ ok: false, why: `Needs Rank 4, ${RANKS[3].title}` });
    expect(setAutoDefend(s, true)).toBe(false);
    s.rank = AUTO_DEFEND.rank;
    expect(autoDefendOn(s)).toBe(false);
    expect(setAutoDefend(s, true)).toBe(true);
    expect(autoDefendOn(s)).toBe(true);
    setAutoDefend(s, false);
    expect(s.autoDefend).toBeUndefined();
  });

  it('when a raid on you is warned, Dex rings the bell: the reserve in range sets out at once', () => {
    const { s, maple, oldtown, lou, pip, marnie } = bay();
    setAutoDefend(s, true);
    const r = warned(s, 15);
    expect(r.bell!.map((b) => [b.id, b.at - s.minute])).toEqual([[lou.id, 30], [pip.id, 30], [marnie.id, 60]]); // Gus on Hilltop is out of range
    expect(s.news.slice(-2)).toEqual([
      "RAID WARNING! The Boardwalk Blenders are heading for Lottie's Corner, ETA 2:25am.",
      `Ding-ding! Dex rings the bell. Big Lou and Pip leave ${name(maple)}, 30 min out; Marnie leaves ${name(oldtown)}, 60 min out.`,
    ]);
    expect(canRingBell(s, r.id)).toBe(false); // once a raid
    expect(alertCards(s).join('')).toContain('Help in 30 min');
    // They join the fight as they arrive, 15 fight-seconds in, like a bell you rang yourself.
    const b = hit(s, r);
    if (b.duration > 15) expect(arrived(b, lou)).toBeCloseTo(15 * FIGHT_SECONDS_PER_GAME_MINUTE, 6);
  });

  it('off, Dex leaves the bell to you', () => {
    const { s } = bay();
    const r = warned(s, 15);
    expect(r.bell).toBeUndefined();
    expect(canRingBell(s, r.id)).toBe(true);
  });

  it("each Evening Dex posts the idle reserve by priority, highest first, the most seasoned first, within each plot's posts", () => {
    const s = newGame(3);
    s.rank = 4;
    setAutoDefend(s, true);
    const kiosk = standIn(s, 'maple', 3), wooden = standIn(s, 'maple', 2), lot = lotIn(s, 'maple');
    s.cash = 1e6;
    buildClubhouse(s, lot);
    expect([postsFor(s, kiosk), postsFor(s, wooden), postsFor(s, LOTTIES_CORNER), postsFor(s, lot)]).toEqual([3, 2, 1, 3]); // crew's posts
    const [a, b, c, d, e, f, g, ko, raider, held] = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'Ko', 'Raider', 'Held'].map((n, i) => guard(n, { level: [3, 3, 2, 2, 1, 1, 1, 5, 5, 1][i] }));
    held.post = wooden; // already there: one post left
    ko.outUntil = s.day + 1;
    s.guards = [g, f, e, d, c, b, a, ko, raider, held];
    s.raids = [{ id: 'mine', attacker: 'player', target: 'oldtown-1s', objective: 'smash', guards: [raider.id], detected: false, eta: '23:00' }];
    setDefendPriority(s, kiosk, 1);
    setDefendPriority(s, wooden, 3);
    setDefendPriority(s, LOTTIES_CORNER, 2);
    s.news = [];
    expect(stationByPriority(s)).toBe(5);
    const at = (x: Guard) => x.post;
    expect([b, a].map(at).sort()).toEqual([LOTTIES_CORNER, wooden].sort()); // the two Veterans to the top two
    expect(s.guards.filter((x) => x.post === wooden).length).toBe(2);
    expect([d, c, g].map(at)).toEqual([kiosk, kiosk, kiosk]); // then priority 1, best first
    expect([f, e, ko, raider].map(at)).toEqual([null, null, null, null]); // the rest wait: KO'd and raiding guards stay put
    expect(s.guards.filter((x) => x.post === lot)).toEqual([]); // the Clubhouse is left to the bell
    expect(s.news).toEqual(['Dex posts 5 guards for the night.']);
    expect(stationByPriority(s)).toBe(0); // every post is full
    setAutoDefend(s, false);
    setDefendPriority(s, lot, 3);
    expect(stationByPriority(s)).toBe(0);
  });

  it('runs as the stands close, before the night is planned', () => {
    const s = newGame(4);
    s.rank = 4;
    setAutoDefend(s, true);
    setDefendPriority(s, LOTTIES_CORNER, 1);
    const pip = guard('Pip');
    s.guards = [pip];
    openStands(s);
    simulateRestOfDay(s);
    expect(s.phase).toBe('report');
    expect(pip.post).toBe(LOTTIES_CORNER);
  });

  it("each plot's priority is 0 to 3 and yours alone (land's Fortify raises it through setDefendPriority)", () => {
    const s = newGame(1);
    expect(defendPriority(s, LOTTIES_CORNER)).toBe(0);
    expect(setDefendPriority(s, LOTTIES_CORNER, 9)).toBe(true);
    expect(defendPriority(s, LOTTIES_CORNER)).toBe(AUTO_DEFEND.top);
    expect(cycleDefendPriority(s, LOTTIES_CORNER)).toBe(true);
    expect(defendPriority(s, LOTTIES_CORNER)).toBe(0);
    expect(s.plots[LOTTIES_CORNER].defendPriority).toBeUndefined();
    cycleDefendPriority(s, LOTTIES_CORNER);
    expect(defendPriority(s, LOTTIES_CORNER)).toBe(1);
    const theirs = ownedPlots(s, 'blenders')[0].id;
    expect(setDefendPriority(s, theirs, 2)).toBe(false);
    expect(defendPriority(s, theirs)).toBe(0);
  });
});

describe('holding out against the Syndicate', () => {
  /** Night on the clock and these raids on you, all warned `notice` minutes before they hit at 02:25. */
  function warnAll(s: GameState, raids: Raid[], notice: number): void {
    const at = 26 * 60 + 25;
    s.phase = 'report';
    s.minute = CLOSE;
    s.raids = raids.map((r) => Object.assign(r, { eta: hhmm(at), leave: at - 90, at, launched: true, warnAt: at - notice }));
    startNight(s);
    s.minute = at - notice - 1;
    while (raids.some((r) => !r.warned)) nightStep(s);
  }

  it('a strike on three plots: each part warned rings its own bell, from the Clubhouses in or beside its district', () => {
    const { s, lou, pip, marnie, gus } = bay();
    setAutoDefend(s, true);
    const hill = PLOTS.find((x) => x.district === 'hilltop' && x.type !== 'hq' && !s.plots[x.id].owner)!.id;
    const harbor = PLOTS.find((x) => x.district === 'harbor' && x.type !== 'hq' && !s.plots[x.id].owner)!.id;
    for (const id of [hill, harbor]) Object.assign(s.plots[id], { owner: 'player', stand: newStand(1) });
    // One strike's parts, each its own raid (nights' strikes tie them with a shared group).
    const parts = [LOTTIES_CORNER, hill, harbor].map((target): Raid => ({
      id: `r${s.nextId++}`, attacker: 'sourwood', target, objective: 'smash', party: henchmenOf(6, 5, 'hatchets'), detected: true, eta: '', syndicate: true,
    }));
    warnAll(s, parts, 90);
    expect(parts[0].bell!.map((b) => b.id)).toEqual([lou.id, pip.id, marnie.id]); // Maple Row's Clubhouse and Old Town's next door
    expect(parts[1].bell!.map((b) => b.id)).toEqual([gus.id]); // Hilltop's own
    expect(parts[2].bell).toBeUndefined(); // no Clubhouse in or beside the Harbor
    // Warned 90 minutes out, the help is there before contact.
    const b = hit(s, parts[0]);
    expect(b.defenders.map((f) => f.id)).toEqual(expect.arrayContaining([lou.id, pip.id, marnie.id]));
  });

  it('a Watchtower on the plot spots a strike 30% more often, and its warning shows who is coming', () => {
    const { s } = bay();
    const plain = detectionChance(s, LOTTIES_CORNER, true);
    s.plots[LOTTIES_CORNER].defense.gadgets.push('watchtower');
    expect(detectionChance(s, LOTTIES_CORNER, true) - plain).toBeCloseTo(0.3, 6);
    const r: Raid = { id: `r${s.nextId++}`, attacker: 'sourwood', target: LOTTIES_CORNER, objective: 'smash', party: henchmenOf(6, 5, 'hatchets'), detected: true, eta: '', syndicate: true };
    warnAll(s, [r], 60);
    const card = alertCards(s).find((c) => c.includes(`data-raid="${r.id}"`))!;
    expect(card).toContain('cl-vs'); // the makeup: what they're after, then each raider's weapon
    expect(card).toContain('6 coming for a smash: hatchets, hatchets, hatchets, hatchets, hatchets, hatchets.');
  });

  it("a Citrus Fortress Wall takes 5,000 HP of chopping, and its defenders hit 50% harder while it stands", () => {
    const { s, dex } = bay();
    s.guards = [dex];
    Object.assign(s.plots[LOTTIES_CORNER].defense, { tier: 5, fenceHp: PERIMETERS[4].hp });
    expect(PERIMETERS[4].hp).toBe(5000);
    const r: Raid = { id: 'r-syn', attacker: 'sourwood', target: LOTTIES_CORNER, objective: 'smash', party: henchmenOf(12, 5, 'hatchets'), detected: true, eta: '02:25', syndicate: true };
    const b = fightRaid(s, r, true);
    const breach = b.events.find((e) => e.type === 'breach');
    const chopped = b.events.reduce((a, e) => a + (e.type === 'chop' && e.target === 'fence' && (!breach || e.t <= breach.t) ? e.dmg : 0), 0);
    if (breach) expect(chopped).toBeGreaterThanOrEqual(5000 - 1e-6); else expect(chopped).toBeLessThan(5000);
    const hitOf = b.defenders.find((f) => f.id === dex.id)!.hit;
    const swings = b.events.filter((e): e is Extract<typeof e, { type: 'swing' }> => e.type === 'swing' && e.a === dex.id);
    const before = swings.filter((e) => !breach || e.t < breach.t), after = swings.filter((e) => breach && e.t > breach.t);
    expect(before.length).toBeGreaterThan(0);
    for (const e of before) expect(e.dmg).toBeCloseTo(hitOf * 1.5, 1);
    for (const e of after) expect(e.dmg).toBeCloseTo(hitOf, 1);
  });
});
