import { describe, expect, it } from 'vitest';
import {
  addGrudge, bankTakings, budgetOf, crewAtDawn, FACTIONS, GRUDGE, grudgeToward, growLand, growUpgrades, LOTTIES_CORNER, migrateSave, newGame,
  ownedPlots, planNight, plotBuyout, raidCost, reserveOf, rivalDawn, STAND_LEVELS, type BattleReport, type GameState, type RivalId,
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

describe('rival grudges', () => {
  const dawn = (s: GameState, id: RivalId) => rivalDawn(s, id, { seed: 1 });
  const standOf = (s: GameState, id: RivalId, skip = 0) => ownedPlots(s, id).filter((p) => p.type !== 'hq' && s.plots[p.id].stand)[skip];

  it('rise when another rival raids them, and point that rival\'s own raids', () => {
    const s = newGame(12);
    s.day = 20;
    s.rank = 3;
    (s.rivals.blenders.grudges ??= {}).hollis = 100;
    let raid = null;
    for (let i = 0; i < 400 && !raid; i++) {
      s.raids = [];
      planNight(s);
      raid = s.raids.find((r) => r.attacker === 'blenders' && s.plots[r.target].owner !== 'player') ?? null;
    }
    expect(raid).not.toBeNull();
    expect(s.plots[raid!.target].owner).toBe('hollis');
    expect(grudgeToward(s, 'hollis', 'blenders')).toBeGreaterThanOrEqual(GRUDGE.raided);
  });

  it('rise when another rival smashes their stand', () => {
    const s = newGame(13);
    s.day = 9;
    const p = standOf(s, 'hollis');
    s.plots[p.id].stand!.wrecked = true;
    s.plots[p.id].wreckedDay = 8;
    s.plots[p.id].smashedBy = 'fizzco';
    dawn(s, 'hollis');
    expect(grudgeToward(s, 'hollis', 'fizzco')).toBe(GRUDGE.smashed);
  });

  it('rise when someone takes their land, even after it sat For Sale, but not for a Plot Buyout', () => {
    const s = newGame(14);
    s.rank = 7;
    s.cash = 50_000_000;
    const [a, b, c] = [standOf(s, 'hollis', 0), standOf(s, 'hollis', 1), standOf(s, 'hollis', 2)];
    s.plots[a.id].owner = 'fizzco';
    s.plots[b.id] = { ...s.plots[b.id], owner: null, stand: null };
    dawn(s, 'hollis');
    expect(grudgeToward(s, 'hollis', 'fizzco')).toBe(GRUDGE.land);
    expect(grudgeToward(s, 'hollis', 'player')).toBe(0);
    s.plots[b.id].owner = 'player'; // bought off the For Sale sign
    dawn(s, 'hollis');
    expect(grudgeToward(s, 'hollis', 'player')).toBe(GRUDGE.land);
    s.rivals.hollis.grudge = 0;
    s.rivals.hollis.grudgeSeen = {};
    expect(plotBuyout(s, c.id)).toBe(true);
    dawn(s, 'hollis');
    expect(grudgeToward(s, 'hollis', 'player')).toBe(0);
  });

  it('cool a little on each quiet day, but not the day after a hit', () => {
    const s = newGame(15);
    s.rivals.hollis.grudges = { blenders: 30 };
    s.rivals.hollis.grudge = 20;
    s.rivals.hollis.grudgeSeen = { blenders: 30, player: 20 }; // as angry yesterday
    dawn(s, 'hollis');
    expect(grudgeToward(s, 'hollis', 'blenders')).toBe(30 - GRUDGE.cool);
    expect(grudgeToward(s, 'hollis', 'player')).toBe(20 - GRUDGE.cool);
    addGrudge(s, 'hollis', 'blenders', 10);
    dawn(s, 'hollis');
    expect(grudgeToward(s, 'hollis', 'blenders')).toBe(40 - GRUDGE.cool);
    dawn(s, 'hollis');
    expect(grudgeToward(s, 'hollis', 'blenders')).toBe(40 - 2 * GRUDGE.cool);
  });

  it('a feud between two rivals makes the Bugle', () => {
    const s = newGame(16);
    s.news = [];
    addGrudge(s, 'coldbrew', 'fizzco', GRUDGE.feud);
    expect(s.news.some((n) => n.includes('feud'))).toBe(true);
  });
});
