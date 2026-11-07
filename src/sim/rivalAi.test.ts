import { describe, expect, it } from 'vitest';
import {
  addGrudge, ATTENTION, attentionOf, bankTakings, budgetOf, crewAtDawn, customersTaken, FACTIONS, GRUDGE, grudgeToward, growLand, growUpgrades,
  costPerCup, CUP_COST, LOTTIES_CORNER, migrateSave, netWorth, newGame, newStand, openStand, ownedPlots, PERIMETERS, planNight, plotBuyout, PLOTS,
  fenceRepairCost, henchWage, payWages, raidCost, reserveOf, rivalDawn, simulateRestOfDay, stockCups,
  RIVAL_HIRE_FEE, rivalGuardSpend, sharedBorders, STAND_LEVELS, type BattleReport, type GameState, type RivalId,
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
  it('opens the books with the starting cash split Grow / Guard / Strike, less a reserve from the first dawn', () => {
    const s = newGame(3);
    for (const id of RIVALS) {
      const b = budgetOf(s, id), f = FACTIONS[id];
      expect([b.grow, b.guard, b.strike]).toEqual([f.startCash * f.grow, f.startCash * f.guard, f.startCash * f.strike]);
      bankTakings(s, id);
      const room = f.startCash - reserveOf(s, id);
      expect(b.grow + b.guard + b.strike).toBeCloseTo(room, 0);
      expect(b.grow / room).toBeCloseTo(f.grow, 2);
      expect(b.strike / room).toBeCloseTo(f.strike, 2);
    }
  });

  it('banks each dawn\'s takings by the split, and spending does not count as a loss', () => {
    const s = newGame(4);
    bankTakings(s, 'hollis'); // the first dawn sets the reserve aside
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

describe('rival attention', () => {
  it('rises with Threat, shared borders, the customers you take and Grudge', () => {
    const s = newGame(17);
    const base = attentionOf(s, 'blenders');
    s.rank = 5; // Threat 3
    expect(attentionOf(s, 'blenders')).toBeCloseTo(base + 2 * ATTENTION.threat, 5);
    const pier = PLOTS.find((p) => p.district === 'boardwalk' && !s.plots[p.id].owner && p.type === 'street')!;
    const borders = sharedBorders(s, 'blenders');
    s.plots[pier.id] = { ...s.plots[pier.id], owner: 'player', stand: newStand(1) };
    expect(sharedBorders(s, 'blenders')).toBe(borders + 1);
    const withBorder = attentionOf(s, 'blenders');
    expect(withBorder).toBeGreaterThan(base + 2 * ATTENTION.threat);
    s.plots[pier.id].stand!.day.customers = 300;
    expect(customersTaken(s, 'blenders')).toBe(1); // they sold nothing today
    expect(attentionOf(s, 'blenders')).toBeCloseTo(withBorder + ATTENTION.customers, 5);
    s.rivals.blenders.grudge = 40;
    expect(attentionOf(s, 'blenders')).toBeCloseTo(withBorder + ATTENTION.customers + 40 * ATTENTION.grudge, 5);
  });

  it('the boss with the most Attention sends the raid, and the next-angriest goes when they are broke', () => {
    const s = newGame(18);
    s.day = 20;
    s.rank = 3;
    pastTutorial(s);
    s.rivals.blenders.grudge = 100;
    s.rivals.coldbrew.grudge = 60;
    const raiders = new Set<string>();
    for (let i = 0; i < 6; i++) { const raid = nightsUntilRaid(s); if (raid) raiders.add(raid.attacker); }
    expect([...raiders]).toEqual(['blenders']);
    budgetOf(s, 'blenders').strike = 0;
    raiders.clear();
    for (let i = 0; i < 6; i++) { const raid = nightsUntilRaid(s); if (raid) raiders.add(raid.attacker); }
    expect([...raiders]).toEqual(['coldbrew']);
  });
});

describe('rival net worth', () => {
  it('counts fences at 75% of what went into them, from the first dawn', () => {
    const s = newGame(19);
    for (const p of PLOTS) {
      const ps = s.plots[p.id];
      if (ps.owner && ps.owner !== 'player' && ps.stand && ps.defense.tier) expect(ps.invested).toBeGreaterThanOrEqual(PERIMETERS[0].cost + STAND_LEVELS[0].cost);
    }
  });

  it('never rises from spending: an upgrade or a fence costs a quarter of its price, like yours', () => {
    const s = newGame(20);
    const id: RivalId = 'fizzco';
    s.day = 31;
    budgetOf(s, id).grow = 1e6;
    let nw = netWorth(s, id);
    let cash = s.rivals[id].cash;
    growUpgrades(s, id);
    let spent = cash - s.rivals[id].cash;
    expect(spent).toBeGreaterThan(0);
    expect(netWorth(s, id)).toBeCloseTo(nw - 0.25 * spent, 0);
    budgetOf(s, id).guard = 1e6;
    nw = netWorth(s, id);
    cash = s.rivals[id].cash;
    const fences = ownedPlots(s, id).reduce((a, p) => a + s.plots[p.id].defense.tier, 0);
    const hench = ownedPlots(s, id).reduce((a, p) => a + (s.plots[p.id].garrison ?? 0), 0);
    rivalGuardSpend(s, id, { seed: 1 });
    spent = cash - s.rivals[id].cash;
    const fenceSpend = spent - RIVAL_HIRE_FEE * (ownedPlots(s, id).reduce((a, p) => a + (s.plots[p.id].garrison ?? 0), 0) - hench);
    expect(ownedPlots(s, id).reduce((a, p) => a + s.plots[p.id].defense.tier, 0)).toBeGreaterThan(fences);
    expect(netWorth(s, id)).toBeCloseTo(nw - spent + 0.75 * fenceSpend, 0);
  });
});

describe('rival trade', () => {
  it('rival cups cost what yours do at today\'s Market prices, the cup counted once', () => {
    const s = newGame(21);
    s.market = { lemons: 0.3, sugar: 0.05, ice: 0.02 };
    openStand(s);
    simulateRestOfDay(s);
    const p = ownedPlots(s, 'fizzco').find((q) => (s.plots[q.id].stand?.day.customers ?? 0) > 0)!;
    const st = s.plots[p.id].stand!;
    expect(st.day.cupCosts / st.day.customers).toBeCloseTo(costPerCup(s, st), 2);
    expect(costPerCup(s, st)).toBeCloseTo((5 * 0.3 + 10 * 0.05) / 10 + 3 * 0.02 + CUP_COST, 5);
  });

  it('a rival stand sells out once a full day\'s stock is gone', () => {
    const s = newGame(21);
    openStand(s);
    simulateRestOfDay(s);
    let soldOut = 0;
    for (const p of PLOTS) {
      const ps = s.plots[p.id];
      if (!ps.owner || ps.owner === 'player' || !ps.stand) continue;
      expect(ps.stand.day.customers).toBeLessThanOrEqual(stockCups(ps.stand));
      if (ps.stand.day.walkedPast.soldOut) { soldOut++; expect(ps.stand.day.customers).toBe(stockCups(ps.stand)); }
    }
    expect(soldOut).toBeGreaterThan(0);
    expect(stockCups(newStand(1))).toBe(120); // 60 lemons, 5 a pitcher, 10 cups a pitcher
  });

  it('rivals pay their henchmen your wages out of Guard at dawn, and the ones they can\'t pay walk off', () => {
    const s = newGame(22);
    const id: RivalId = 'coldbrew';
    const posts = ownedPlots(s, id).filter((p) => (s.plots[p.id].garrison ?? 0) > 0);
    const bill = posts.reduce((a, p) => a + (s.plots[p.id].garrison ?? 0) * henchWage(s.plots[p.id]), 0);
    const crew = () => ownedPlots(s, id).reduce((a, p) => a + (s.plots[p.id].garrison ?? 0), 0);
    const all = crew();
    expect(henchWage({ ...s.plots[posts[0].id], stand: newStand(1) })).toBe(15); // a Rookie's wage
    const cash = s.rivals[id].cash;
    budgetOf(s, id).guard = bill;
    expect(payWages(s, id)).toBe(0);
    expect(budgetOf(s, id).guard).toBe(0);
    expect(s.rivals[id].cash).toBe(cash - bill);
    budgetOf(s, id).guard = Math.floor(bill / 2);
    const left = payWages(s, id);
    expect(left).toBeGreaterThan(0);
    expect(crew()).toBe(all - left);
    expect(budgetOf(s, id).guard).toBeGreaterThanOrEqual(0);
  });

  it('a chopped rival fence is patched only with Guard money, at your repair price', () => {
    const s = newGame(23);
    const p = ownedPlots(s, 'sourwood').find((q) => s.plots[q.id].defense.tier > 0)!;
    const ps = s.plots[p.id];
    ps.defense.fenceHp = 1;
    budgetOf(s, 'sourwood').guard = 0;
    rivalGuardSpend(s, 'sourwood', { seed: 1 });
    expect(ps.defense.fenceHp).toBe(1);
    const cost = fenceRepairCost(ps);
    budgetOf(s, 'sourwood').guard = cost;
    rivalGuardSpend(s, 'sourwood', { seed: 1 });
    expect(ps.defense.fenceHp).toBe(PERIMETERS[ps.defense.tier - 1].hp);
    expect(budgetOf(s, 'sourwood').guard).toBe(0);
  });
});
