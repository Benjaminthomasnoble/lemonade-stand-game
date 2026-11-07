import { describe, expect, it } from 'vitest';
import {
  buildClubhouse, canBuildClubhouse, canBuildStand, canHire, CLUBHOUSE, fightRaid, LOTTIES_CORNER, migrateSave, newGame, PLOTS,
  rebuildCost, rebuildStand, refreshRecruits, rosterCap, successScore, type GameState,
} from './economy.ts';
import { allBeds, clubhouses, clubhouseSite, clubOf, reserveAt, waitAt } from './clubhouse.ts';
import { guardOf, henchmenOf } from './fighters.ts';

/** k empty Street plots of yours. */
function lots(s: GameState, k: number): string[] {
  const out = PLOTS.filter((p) => p.type === 'street' && !s.plots[p.id].owner).slice(0, k).map((p) => p.id);
  for (const id of out) s.plots[id].owner = 'player';
  return out;
}

function rich(seed = 1): GameState {
  const s = newGame(seed);
  s.rank = 7;
  s.cash = 1_000_000;
  return s;
}

describe('a Clubhouse on a Street plot', () => {
  it('fills an empty Street plot of yours, one building per plot', () => {
    const s = rich();
    expect(canBuildClubhouse(s)).toEqual({ ok: false, why: 'Needs an empty Street plot of yours' });
    expect(canBuildClubhouse(s, LOTTIES_CORNER)).toEqual({ ok: false, why: 'A stand is here' });
    const prime = PLOTS.find((p) => p.type === 'prime' && !s.plots[p.id].owner)!;
    s.plots[prime.id].owner = 'player';
    expect(canBuildClubhouse(s, prime.id)).toEqual({ ok: false, why: 'Needs a street plot' });
    const [a] = lots(s, 1);
    expect(clubhouseSite(s)).toBe(a);
    expect(buildClubhouse(s)).toBe(true);
    expect(s.plots[a].facility).toEqual({ kind: 'clubhouse', level: 1 });
    expect(canBuildStand(s, a)).toEqual({ ok: false, why: 'A facility is built here' });
    expect(s.news.at(-1)).toBe(`Clubhouse opens at ${PLOTS.find((p) => p.id === a)!.name}: beds for 6 guards. Dex no longer sleeps in the shed.`);
  });

  it('several Clubhouses: each upgrades on its own and their beds add up', () => {
    const s = rich();
    const [a, b] = lots(s, 2);
    expect(rosterCap(s)).toBe(2);
    expect(buildClubhouse(s, a)).toBe(true);
    expect(buildClubhouse(s, b)).toBe(true);
    expect(rosterCap(s)).toBe(2 + 6 + 6);
    expect(buildClubhouse(s, a)).toBe(true);
    expect(rosterCap(s)).toBe(2 + 12 + 6);
    expect(buildClubhouse(s, a)).toBe(true);
    expect(rosterCap(s)).toBe(2 + 24 + 6);
    expect(canBuildClubhouse(s, a)).toEqual({ ok: false, why: 'Top level' });
    expect(clubhouseSite(s)).toBe(b); // no empty lot left: the smallest Clubhouse grows next
    expect(s.plots[a].invested).toBe(2000 + 15000 + 80000);
  });

  it('follows the table: L1 at Rank 2 for $2,000, L2 at Rank 5, L3 at Rank 7', () => {
    const s = newGame(2);
    s.cash = 1_000_000;
    const [a] = lots(s, 1);
    s.rank = 1;
    expect(canBuildClubhouse(s, a)).toMatchObject({ ok: false, why: expect.stringMatching(/^Needs Rank 2/) });
    s.rank = 2;
    const cash = s.cash;
    expect(buildClubhouse(s, a)).toBe(true);
    expect(s.cash).toBe(cash - 2000);
    expect(canBuildClubhouse(s, a)).toMatchObject({ ok: false, why: expect.stringMatching(/^Needs Rank 5/) });
    s.rank = 5;
    expect(buildClubhouse(s, a)).toBe(true);
    expect(canBuildClubhouse(s, a)).toMatchObject({ ok: false, why: expect.stringMatching(/^Needs Rank 7/) });
    s.rank = 7;
    expect(buildClubhouse(s, a)).toBe(true);
    expect(CLUBHOUSE.map((c) => [c.rank, c.cost, c.beds])).toEqual([[2, 2000, 6], [5, 15000, 12], [7, 80000, 24]]);
  });

  it('counts as a building: 75% of its cost stays in the score', () => {
    const s = rich();
    const [a] = lots(s, 1);
    const before = successScore(s);
    buildClubhouse(s, a);
    expect(before - successScore(s)).toBeCloseTo(2000 * 0.25, 0);
  });

  it('can be raided and smashed; while wrecked it houses nobody, and nobody is fired', () => {
    const s = rich();
    const [a] = lots(s, 1);
    buildClubhouse(s, a);
    refreshRecruits(s, true);
    s.guards.push(...Array.from({ length: 8 }, () => guardOf('fists')));
    const raid = { id: 'r1', attacker: 'blenders' as const, target: a, objective: 'smash' as const, party: henchmenOf(6, 5, 'hatchets'), detected: true, eta: '23:00' };
    expect(fightRaid(s, raid, true).outcome).toBe('smashed');
    expect(s.plots[a].facility!.wrecked).toBe(true);
    expect(clubhouses(s)).toEqual([]);
    expect(allBeds(s)).toBe(0);
    expect(s.guards).toHaveLength(8);
    expect(canHire(s, s.recruits[0].id)).toEqual({ ok: false, why: 'Build a Clubhouse to house more guards' });
    expect(rebuildCost(s.plots[a])).toBe(Math.ceil(2000 * 0.15));
    s.phase = 'prep';
    expect(rebuildStand(s, a)).toBe(true);
    expect(allBeds(s)).toBe(6);
  });
});

describe('the reserve', () => {
  it('guards off post wait at a specific Clubhouse; the KO\'d and raiders are not in it', () => {
    const s = rich();
    const [a, b] = lots(s, 2);
    buildClubhouse(s, a);
    buildClubhouse(s, b);
    const [x, y, z, w] = [guardOf('clubs'), guardOf('clubs'), guardOf('clubs'), guardOf('clubs', 'none', 1, 'Smooth Talker', { post: LOTTIES_CORNER })];
    s.guards.push(x, y, z, w);
    expect(clubOf(s, x)).toBe(a); // your first Clubhouse
    expect(waitAt(s, y.id, b)).toBe(true);
    expect(waitAt(s, w.id, b)).toBe(true); // off post now
    expect(w.post).toBeNull();
    expect(reserveAt(s, a).map((g) => g.id)).toEqual([x.id, z.id]);
    expect(reserveAt(s, b).map((g) => g.id)).toEqual([y.id, w.id]);
    z.outUntil = s.day + 1; // knocked out
    s.raids.push({ id: 'r9', attacker: 'player', target: LOTTIES_CORNER, objective: 'smash', guards: [w.id], detected: true, eta: '23:00' });
    expect(reserveAt(s, a).map((g) => g.id)).toEqual([x.id]);
    expect(reserveAt(s, b).map((g) => g.id)).toEqual([y.id]);
    s.plots[b].facility!.wrecked = true; // they move to a Clubhouse still standing
    expect(clubOf(s, y)).toBe(a);
    expect(waitAt(s, x.id, b)).toBe(false);
  });
});

describe('old saves', () => {
  it('the one Clubhouse level moves onto an empty Street plot, cost and all', () => {
    const s = rich();
    const [a] = lots(s, 1);
    s.clubhouse = 2;
    const loaded = migrateSave(JSON.parse(JSON.stringify(s)))!;
    expect(loaded.clubhouse).toBeUndefined();
    expect(loaded.plots[a].facility).toEqual({ kind: 'clubhouse', level: 2 });
    expect(loaded.plots[a].invested).toBe(17000);
    expect(rosterCap(loaded)).toBe(2 + 12);
    const again = migrateSave(JSON.parse(JSON.stringify(loaded)))!;
    expect(again.plots).toEqual(loaded.plots);
  });

  it('with no empty Street plot, it is paid back', () => {
    const s = rich();
    s.clubhouse = 1;
    const cash = s.cash;
    const loaded = migrateSave(JSON.parse(JSON.stringify(s)))!;
    expect(loaded.cash).toBe(cash + 2000);
    expect(clubhouses(loaded)).toEqual([]);
  });
});
