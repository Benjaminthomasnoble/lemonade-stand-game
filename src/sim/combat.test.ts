import { describe, expect, it } from 'vitest';
import { COMBAT_RULES } from './combat.ts';
import { LOTTIES_CORNER, migrateSave, newGame } from './economy.ts';

describe('saves', () => {
  it('an old save keeps each fence at its share of full HP on the spec table, and only once', () => {
    const s = newGame(3);
    expect(s.combatRules).toBe(COMBAT_RULES);
    // Old table: 280 / 500 / 800 / 1,150 / 3,000 HP. Full Picket, half Chain-Link, half Stakes, full Wire, a 3/4 Wall, no fence.
    const old = [[1, 280], [2, 250], [3, 400], [4, 1150], [5, 2250], [0, 0]];
    const ids = Object.keys(s.plots).slice(0, old.length);
    ids.forEach((id, i) => { s.plots[id].defense = { tier: old[i][0], fenceHp: old[i][1], gadgets: [] }; });
    delete s.combatRules;
    const loaded = migrateSave(JSON.parse(JSON.stringify(s)))!;
    expect(ids.map((id) => loaded.plots[id].defense.fenceHp)).toEqual([150, 250, 600, 2500, 3750, 0]);
    expect(loaded.combatRules).toBe(COMBAT_RULES);
    const again = migrateSave(JSON.parse(JSON.stringify(loaded)))!;
    expect(ids.map((id) => again.plots[id].defense.fenceHp)).toEqual([150, 250, 600, 2500, 3750, 0]);
  });

  it('a save from this build loads its fences as they were', () => {
    const s = newGame(3);
    s.plots[LOTTIES_CORNER].defense = { tier: 3, fenceHp: 800, gadgets: [] };
    const loaded = migrateSave(JSON.parse(JSON.stringify(s)))!;
    for (const id of Object.keys(s.plots)) expect(loaded.plots[id].defense.fenceHp).toBe(s.plots[id].defense.fenceHp);
    expect(loaded.plots[LOTTIES_CORNER].defense.fenceHp).toBe(800);
  });
});
