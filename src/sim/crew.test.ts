import { describe, expect, it } from 'vitest';
import {
  buildClubhouse, buyGadget, buyPerimeter, canHire, equip, hireGuard, LOTTIES_CORNER, newGame, openStand, planRaid, raidOdds,
  raidTargets, rebuildCost, rebuildStand, simulateRestOfDay, sleepUntilDawn, threatLevel, welcomeDex, type GameState,
} from './economy.ts';

function playDay(s: GameState) {
  openStand(s);
  simulateRestOfDay(s);
  sleepUntilDawn(s);
}

describe('crew and raids', () => {
  it('Dex joins at Rank 2 and the Hiring Hall opens', () => {
    const s = newGame(5);
    expect(s.guards).toHaveLength(0);
    s.rank = 2;
    welcomeDex(s);
    expect(s.guards.map((g) => g.name)).toContain('Dex Moody');
    expect(s.recruits.length).toBe(4);
    s.cash = 10000;
    expect(hireGuard(s, s.recruits[0].id)).toBe(true);
    expect(canHire(s, s.recruits[0].id)).toEqual({ ok: false, why: 'Build a Clubhouse to house more guards' });
    expect(buildClubhouse(s)).toBe(true);
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
    buildClubhouse(s);
    for (const r of [...s.recruits]) hireGuard(s, r.id);
    for (const g of s.guards) { equip(s, g.id, 'hatchets'); equip(s, g.id, 'pro'); }
    const target = raidTargets(s).find((p) => s.plots[p.id].stand!.level === 1)!;
    const ids = s.guards.map((g) => g.id);
    expect(raidOdds(s, target.id, ids, 'smash', false)).toBeGreaterThan(0.8);
    const report = planRaid(s, target.id, ids, 'smash', 'now');
    expect(typeof report).toBe('object');
    if (typeof report === 'object' && report.outcome === 'smashed') {
      expect(s.plots[target.id].stand!.wrecked).toBe(true);
      openStand(s);
      simulateRestOfDay(s);
      expect(s.plots[target.id].stand!.day.customers).toBe(0);
    }
  });

  it('rebuilding a wrecked stand costs 30% of what went into it', () => {
    const s = newGame(9);
    s.plots[LOTTIES_CORNER].stand!.wrecked = true;
    s.cash = 500;
    expect(rebuildCost(s.plots[LOTTIES_CORNER])).toBe(45);
    expect(rebuildStand(s, LOTTIES_CORNER)).toBe(true);
    expect(s.cash).toBe(455);
  });

  it('the night is deterministic', () => {
    const a = newGame(11), b = newGame(11);
    for (let d = 0; d < 12; d++) { playDay(a); playDay(b); }
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
