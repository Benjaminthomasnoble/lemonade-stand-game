import { describe, expect, it } from 'vitest';
import {
  buildClubhouse, buyGadget, buyPerimeter, canHire, canPromote, dutyXp, equip, GUARD_FEE, hireGuard, LOTTIES_CORNER, migrateSave, newGame, openStand,
  payCrew, planRaid, promote,
  raidOdds, raidTargets, rebuildCost, rebuildStand, refreshRecruits, simulateRestOfDay, sleepUntilDawn, threatLevel, tickMinute, welcomeDex, type BattleReport, type GameState,
  PLOTS,
} from './economy.ts';

/** An empty Street plot of yours, for a Clubhouse. */
const streetLot = (s: GameState) => { const lot = PLOTS.find((p) => p.type === 'street' && !s.plots[p.id].owner)!; s.plots[lot.id].owner = 'player'; return lot.id; };

function playDay(s: GameState) {
  openStand(s);
  simulateRestOfDay(s);
  sleepUntilDawn(s);
}

describe('crew and raids', () => {
  it('Dex joins free and the Hiring Hall opens at Rank 2', () => { // he joins on Day 6 (story.test.ts)
    const s = newGame(5);
    expect(s.guards).toHaveLength(0);
    s.rank = 2;
    welcomeDex(s);
    expect(s.guards.map((g) => g.name)).toContain('Dex Moody');
    expect(s.recruits.length).toBe(6);
    s.cash = 10000;
    expect(hireGuard(s, s.recruits[0].id)).toBe(true);
    expect(canHire(s, s.recruits[0].id)).toEqual({ ok: false, why: 'Build a Clubhouse to house more guards' });
    expect(buildClubhouse(s, streetLot(s))).toBe(true);
    expect(canHire(s, s.recruits[0].id).ok).toBe(true);
  });

  it('defenses follow the rank gates', () => {
    const s = newGame(6);
    s.cash = 5000;
    expect(buyPerimeter(s, LOTTIES_CORNER)).toBe(true); // Picket at Rank 1
    expect(s.plots[LOTTIES_CORNER].defense.tier).toBe(1);
    expect(buyPerimeter(s, LOTTIES_CORNER)).toBe(false); // Chain-Link needs Rank 2
    expect(buyGadget(s, LOTTIES_CORNER, 'alarm')).toBe(false);
    s.rank = 2;
    expect(buyGadget(s, LOTTIES_CORNER, 'alarm')).toBe(true);
    expect(buyGadget(s, LOTTIES_CORNER, 'goose')).toBe(true);
    expect(buyGadget(s, LOTTIES_CORNER, 'slick')).toBe(false); // Rank 4 and no slot
  });

  it('no raids on the player in days 1-5, then they come', () => {
    const s = newGame(7);
    s.reputation = 4;
    let early = 0, later = 0;
    for (let d = 0; d < 40; d++) {
      s.cash = Math.max(s.cash, 200); // stay out of the red: this test is about raids, not going broke
      openStand(s);
      simulateRestOfDay(s);
      const incoming = s.raids.filter((r) => r.attacker !== 'player' && s.plots[r.target].owner === 'player').length;
      if (s.day <= 5) early += incoming; else later += incoming;
      sleepUntilDawn(s);
      for (const p of Object.keys(s.plots)) if (s.plots[p].owner === 'player' && s.plots[p].stand?.wrecked) { s.cash += 1000; rebuildStand(s, p); }
    }
    expect(early).toBe(0);
    expect(later).toBeGreaterThan(1);
    expect(threatLevel(s)).toBeGreaterThanOrEqual(1);
  });

  it('a player raid can wreck a rival stand, and wrecked stands sell nothing', () => {
    const s = newGame(8);
    s.rank = 3;
    welcomeDex(s);
    s.cash = 100000;
    s.rank = 6;
    buildClubhouse(s, streetLot(s));
    for (const r of [...s.recruits]) hireGuard(s, r.id);
    for (const g of s.guards) { equip(s, g.id, 'hatchets'); equip(s, g.id, 'pro'); }
    const target = raidTargets(s).find((p) => s.plots[p.id].stand?.level === 1)!;
    const ids = s.guards.map((g) => g.id);
    expect(raidOdds(s, target.id, ids, 'smash', false)).toBeGreaterThan(0.8);
    expect(planRaid(s, target.id, ids, 'smash', 'now')).toBe(true); // the squad travels (nights): it fights on arrival
    openStand(s);
    let report: BattleReport | undefined;
    while (!report && s.phase === 'open') for (const e of tickMinute(s)) if (e.type === 'fight') report = e.report;
    expect(report).toBeDefined();
    if (report?.outcome === 'smashed') {
      expect(s.plots[target.id].stand!.wrecked).toBe(true);
      const sold = s.plots[target.id].stand!.day.customers;
      simulateRestOfDay(s);
      expect(s.plots[target.id].stand!.day.customers).toBe(sold);
    }
  });

  it('rebuilding a wrecked stand costs 15% of what went into it', () => {
    const s = newGame(9);
    s.plots[LOTTIES_CORNER].stand!.wrecked = true;
    s.cash = 500;
    expect(rebuildCost(s.plots[LOTTIES_CORNER])).toBe(23);
    expect(rebuildStand(s, LOTTIES_CORNER)).toBe(true);
    expect(s.cash).toBe(477);
  });

  it('the night is deterministic', () => {
    const a = newGame(11), b = newGame(11);
    for (let d = 0; d < 12; d++) { playDay(a); playDay(b); }
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('the Hiring Hall', () => {
  it('lists 6 recruits with faces, fees by level, and refreshes every 7 days', () => {
    const s = newGame(21);
    s.rank = 2;
    welcomeDex(s);
    expect(s.recruits).toHaveLength(6);
    for (const r of s.recruits) {
      expect(typeof r.face).toBe('number');
      expect(r.fee).toBe(GUARD_FEE[r.level - 1]);
    }
    s.cash = 10000;
    buildClubhouse(s);
    hireGuard(s, s.recruits[0].id);
    const left = s.recruits.map((r) => r.id);
    for (let d = 0; d < 6; d++) { s.cash = Math.max(s.cash, 500); playDay(s); }
    expect(s.recruits.map((r) => r.id)).toEqual(left); // no early refill
    s.cash = Math.max(s.cash, 500);
    playDay(s);
    expect(s.recruits).toHaveLength(6);
    expect(s.recruits.some((r) => left.includes(r.id))).toBe(false);
  });

  it('recruits come at any level, likelier higher at higher Ranks', () => {
    const s = newGame(22);
    const levels = (rank: number) => {
      s.rank = rank;
      const out: number[] = [];
      for (let i = 0; i < 40; i++) { refreshRecruits(s, true); out.push(...s.recruits.map((r) => r.level)); }
      return out;
    };
    const low = levels(2), high = levels(9);
    expect(Math.max(...low)).toBeLessThanOrEqual(2);
    expect(high).toContain(5);
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(high)).toBeGreaterThan(mean(low) + 1);
  });

  it('an older save with four recruits gets a full Hall at the next dawn', () => {
    const s = newGame(23);
    s.rank = 2;
    welcomeDex(s);
    s.recruits = s.recruits.slice(0, 4);
    delete s.recruitDay;
    const loaded = migrateSave(JSON.parse(JSON.stringify(s)))!;
    expect(loaded).not.toBeNull();
    playDay(loaded);
    expect(loaded.recruits).toHaveLength(6);
  });
});

describe('wages and duty', () => {
  it('a posted guard climbs about a level per 35 days on duty; the reserve and the Out do not', () => {
    const s = newGame(31);
    s.rank = 2;
    welcomeDex(s);
    const dex = s.guards[0];
    expect(dex.post).toBe(LOTTIES_CORNER);
    const reserve = { ...dex, id: 'gr', name: 'Res Erve', trait: 'Hothead' as const, post: null };
    const out = { ...dex, id: 'go', name: 'Out Cold', trait: 'Sprinter' as const, outUntil: 999 };
    s.guards.push(reserve, out);
    const dawn = () => { s.day++; dutyXp(s); };
    for (let d = 0; d < 34; d++) dawn();
    expect(dex.level).toBe(1);
    dawn();
    expect(dex.level).toBe(2);
    expect(reserve.xp).toBe(0);
    expect(out.xp).toBe(0);
    for (let d = 0; d < 34; d++) dawn();
    expect(dex.level).toBe(2);
    dawn();
    expect(dex.level).toBe(3);
  });

  it('pays wages guard by guard: the unpaid quit, Loyal guards stay on unpaid, cash never goes below $0', () => {
    const s = newGame(32);
    s.rank = 2;
    welcomeDex(s);
    const dex = s.guards[0]; // Loyal, $15 a day
    s.guards.push({ ...dex, id: 'ga', name: 'Ann A', trait: 'Hothead', level: 1, post: null }, { ...dex, id: 'gb', name: 'Bob B', trait: 'Sprinter', level: 2, post: null });
    s.cash = 20;
    payCrew(s);
    expect(s.cash).toBe(5); // Ann's $15 is paid; Bob's $25 isn't, and Dex waits his turn
    expect(s.guards.map((g) => g.id)).toEqual([dex.id, 'ga']);
    expect(s.today.upkeep).toBe(15);
    s.cash = 0;
    payCrew(s);
    expect(s.guards.map((g) => g.name)).toEqual(['Dex Moody']);
    expect(s.cash).toBe(0);
  });
});

describe('specialists', () => {
  it('a Level 3 guard takes one specialty for good: Lookout and Wrecker at Rank 4, Captain at Rank 6', () => {
    const s = newGame(41);
    s.rank = 3;
    welcomeDex(s);
    const dex = s.guards[0];
    expect(canPromote(s, dex.id, 'lookout')).toEqual({ ok: false, why: 'Needs Rank 4, Neighborhood Name' });
    s.rank = 4;
    expect(canPromote(s, dex.id, 'lookout')).toEqual({ ok: false, why: 'Needs a Level 3 Veteran' });
    dex.level = 3;
    expect(canPromote(s, dex.id, 'captain').ok).toBe(false);
    expect(promote(s, dex.id, 'lookout')).toBe(true);
    expect(dex.specialty).toBe('lookout');
    s.rank = 6;
    expect(canPromote(s, dex.id, 'captain')).toEqual({ ok: false, why: 'Already a Lookout' });
    const loaded = migrateSave(JSON.parse(JSON.stringify(s)))!;
    expect(loaded.guards[0].specialty).toBe('lookout');
  });
});
