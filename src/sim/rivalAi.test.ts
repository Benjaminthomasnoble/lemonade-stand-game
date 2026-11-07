import { describe, expect, it } from 'vitest';
import {
  bankTakings, budgetOf, crewAtDawn, FACTIONS, growLand, growUpgrades, LOTTIES_CORNER, migrateSave, newGame, ownedPlots, planNight,
  raidCost, reserveOf, STAND_LEVELS, type BattleReport, type GameState, type RivalId,
} from './economy.ts';
import { nextRandom } from './rng.ts';

const RIVALS = Object.keys(FACTIONS) as RivalId[];
const levels = (s: GameState, id: RivalId) => ownedPlots(s, id).map((p) => s.plots[p.id].stand?.level ?? 0);
/** A seed whose first draw is under p (to force a dawn's land roll). */
function seedUnder(p: number): number {
  for (let seed = 1; ; seed++) if (nextRandom({ seed }) < p) return seed;
}
/** Pretend the tutorial raid already happened, so the next raids are ordinary ones. */
function pastTutorial(s: GameState): void {
  s.battles.push({ day: 1, attacker: 'blenders', defender: 'player', target: LOTTIES_CORNER } as BattleReport);
}
/** Plan nights until a raid on the player comes (or give up). */
function nightsUntilRaid(s: GameState, tries = 300) {
  for (let i = 0; i < tries; i++) {
    s.raids = [];
    planNight(s);
    const raid = s.raids.find((r) => r.attacker !== 'player' && s.plots[r.target].owner === 'player');
    if (raid) return raid;
  }
  return null;
}

describe('rival dawn budget', () => {
  it('opens the books with the starting cash split Grow / Guard / Strike', () => {
    const s = newGame(3);
    for (const id of RIVALS) {
      const b = budgetOf(s, id), f = FACTIONS[id];
      const room = f.startCash - reserveOf(s, id);
      expect(b.grow + b.guard + b.strike).toBeCloseTo(room, 0);
      expect(b.grow / room).toBeCloseTo(f.grow, 2);
      expect(b.strike / room).toBeCloseTo(f.strike, 2);
    }
  });

  it('banks each dawn\'s takings by the split, and spending does not count as a loss', () => {
    const s = newGame(4);
    const before = { ...budgetOf(s, 'hollis') };
    s.rivals.hollis.cash += 1000;
    expect(bankTakings(s, 'hollis')).toBe(1000);
    const b = budgetOf(s, 'hollis');
    expect(b.grow - before.grow).toBeCloseTo(400, 1);
    expect(b.guard - before.guard).toBeCloseTo(500, 1);
    expect(b.strike - before.strike).toBeCloseTo(100, 1);
    // Grow money spent on a stand is not tomorrow's loss.
    s.day = 10;
    const plots = ownedPlots(s, 'hollis').length;
    growLand(s, 'hollis', { seed: seedUnder(0.25) });
    expect(ownedPlots(s, 'hollis').length).toBe(plots + 1);
    expect(bankTakings(s, 'hollis')).toBe(0);
  });

  it('Grow pays the 30-day upgrades, cheapest first, and one it cannot afford waits', () => {
    const s = newGame(5);
    const id: RivalId = 'blenders';
    s.rivals[id].cash = 1e6;
    const owed = ownedPlots(s, id).filter((p) => (s.plots[p.id].stand?.level ?? 99) < FACTIONS[id].maxLevel);
    const cheapest = Math.min(...owed.map((p) => STAND_LEVELS[s.plots[p.id].stand!.level].cost));
    const before = levels(s, id);
    const invested = ownedPlots(s, id).reduce((a, p) => a + s.plots[p.id].invested, 0);
    s.day = 31;
    budgetOf(s, id).grow = cheapest;
    growUpgrades(s, id);
    const after = levels(s, id);
    expect(after.filter((l, i) => l === before[i] + 1).length).toBe(1);
    expect(budgetOf(s, id).grow).toBe(0);
    expect(s.rivals[id].cash).toBe(1e6 - cheapest);
    expect(ownedPlots(s, id).reduce((a, p) => a + s.plots[p.id].invested, 0)).toBe(invested + cheapest);
    expect(s.rivals[id].upgradesDue!.length).toBe(owed.length - 1);
    // The waiting upgrades go through on a later dawn once Grow can pay.
    s.day = 35;
    budgetOf(s, id).grow = 1e6;
    growUpgrades(s, id);
    expect(s.rivals[id].upgradesDue).toEqual([]);
    expect(levels(s, id).filter((l, i) => l === before[i] + 1).length).toBe(owed.length);
  });

  it('buys land only with Grow money', () => {
    const s = newGame(6);
    s.day = 10;
    const id: RivalId = 'fizzco';
    const plots = ownedPlots(s, id).length;
    budgetOf(s, id).grow = 0;
    growLand(s, id, { seed: seedUnder(0.25) });
    expect(ownedPlots(s, id).length).toBe(plots);
    budgetOf(s, id).grow = 1e6;
    const cash = s.rivals[id].cash;
    growLand(s, id, { seed: seedUnder(0.25) });
    expect(ownedPlots(s, id).length).toBe(plots + 1);
    expect(1e6 - budgetOf(s, id).grow).toBeCloseTo(cash - s.rivals[id].cash, 2);
  });

  it('Guard pays for fences and henchmen, and an empty Guard buys nothing', () => {
    const s = newGame(7);
    const kit = (id: RivalId) => ownedPlots(s, id).map((p) => `${s.plots[p.id].defense.tier}/${s.plots[p.id].garrison ?? 0}`).join();
    const was = RIVALS.map(kit);
    for (const id of RIVALS) budgetOf(s, id).guard = 0;
    crewAtDawn(s);
    expect(RIVALS.map(kit)).toEqual(was);
    const cash = s.rivals.sourwood.cash;
    budgetOf(s, 'sourwood').guard = 100_000;
    crewAtDawn(s);
    expect(kit('sourwood')).not.toBe(was[RIVALS.indexOf('sourwood')]);
    expect(100_000 - budgetOf(s, 'sourwood').guard).toBeCloseTo(cash - s.rivals.sourwood.cash, 2);
  });

  it('Strike pays for raids: a broke boss is skipped, and nobody raids when every boss is broke', () => {
    const s = newGame(8);
    s.day = 20;
    s.rank = 3;
    pastTutorial(s);
    for (const id of RIVALS) budgetOf(s, id).strike = 0;
    budgetOf(s, 'hollis').strike = 10_000;
    const raid = nightsUntilRaid(s);
    expect(raid?.attacker).toBe('hollis');
    expect(budgetOf(s, 'hollis').strike).toBeLessThanOrEqual(10_000 - raidCost(s, 'hollis', raid!.party!.length));
    budgetOf(s, 'hollis').strike = 0;
    expect(nightsUntilRaid(s, 150)).toBeNull();
    expect(s.raids.filter((r) => r.attacker !== 'player')).toEqual([]);
  });

  it('the tutorial raid is on the house', () => {
    const s = newGame(9);
    s.day = 15;
    for (const id of RIVALS) budgetOf(s, id).strike = 0;
    planNight(s);
    expect(s.raids.some((r) => r.attacker === 'blenders' && s.plots[r.target].owner === 'player')).toBe(true);
  });

  it('a save from before the budget opens its books on load, and loading again changes nothing', () => {
    const s = newGame(10);
    for (const id of RIVALS) { delete s.rivals[id].budget; delete s.rivals[id].cashSeen; delete s.rivals[id].upgradesDue; }
    const loaded = migrateSave(JSON.parse(JSON.stringify(s)))!;
    for (const id of RIVALS) {
      const b = loaded.rivals[id].budget!;
      expect(b.grow + b.guard + b.strike).toBeCloseTo(loaded.rivals[id].cash - reserveOf(loaded, id), 0);
      expect(loaded.rivals[id].cashSeen).toBe(loaded.rivals[id].cash);
    }
    const again = migrateSave(JSON.parse(JSON.stringify(loaded)))!;
    expect(JSON.stringify(again.rivals)).toBe(JSON.stringify(loaded.rivals));
  });
});
