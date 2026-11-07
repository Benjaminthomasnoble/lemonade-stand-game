import { afterEach, describe, expect, it } from 'vitest';
import {
  buildClubhouse, CLOSE, hhmm, LOTTIES_CORNER, newGame, nightStep, ownedPlots, PERIMETERS, PLOT_BY_ID, PLOTS, startNight,
  type BattleReport, type GameState, type Guard, type Raid, type SimEvent,
} from './economy.ts';
import { reserveAt } from './clubhouse.ts';
import { fightStatus, startFight, stepFight, watchFights } from './fight.ts';
import { guardOf, henchmenOf } from './fighters.ts';
import { bellEta, bellParty, canRingBell, reserveMinutes, ringTheBell } from './reinforce.ts';
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
