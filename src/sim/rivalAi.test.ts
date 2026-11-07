import { describe, expect, it } from 'vitest';
import {
  addGrudge, ATTENTION, attentionOf, bankTakings, budgetOf, crewAtDawn, customersTaken, tookCustomer, FACTIONS, GRUDGE, grudgeToward, growLand, growUpgrades,
  costPerCup, CUP_COST, dailyService, LOTTIES_CORNER, migrateSave, netWorth, newGame, newStand, openStand, ownedPlots, PERIMETERS, planNight, plotBuyout, PLOTS,
  fenceRepairCost, henchWage, payWages, raidCost, reserveOf, RIVAL_TRADE, rivalDawn, simulateRestOfDay, sleepUntilDawn, stockCups,
  RIVAL_HIRE_FEE, rivalGuardSpend, sharedBorders, STAND_LEVELS, stockCapCups, grudge, targetScore, FIZZCO_PLANT, FACILITIES, canRaid, groveTraffic, MAX_GROVES,
  GROVE_TRAFFIC, wageBill, runningCosts, yearOfCups, openingYear, standTrade, settleTrade, SEASONS, SEASON_DEMAND, SEASON_WEATHER, BOARDWALK_SEASON,
  WEATHER, WEAPONS, RAID_PARTY, BLENDER_RUSH, blenderRush, pickRaider, raidPartyFor, raidWeight, signatureRaids, rebuildCost, PLAYER_REBUILD_DAYS,
  CLOSE, DIG_IN, fenceFull, fencePrice, hayBales, hhmm, NIGHT_SHIFT, nightShiftStealth, NO_DEFENSE, tauntsAtDawn, eliteStewards,
  BRAND_TIERS, GADGETS, growBrand, marketingMultiplier, RIVAL_BRAND, likeliestTarget, raidStart, travelMinutes, softSpot, successScore, ACT_BY_RANK,
  buildFacility, canBuildFacility, plotBuyoutPrice, tillyFieldRate, TILLY_FIELD_BUYOUT, PICKUP_MINUTE, deliver, threatLevel,
  type BattleReport, type GadgetId, type GameState, type Raid, type RivalId,
} from './economy.ts';
import { boardOrder, corkboardBody } from '../ui/corkboard.ts';
import { menuScreen } from '../ui/menus.ts';
import { DEFAULT_OPTIONS } from '../settings.ts';
import { nextRandom } from './rng.ts';
import { phoneCheck } from './phone.ts';

const RIVALS = Object.keys(FACTIONS) as RivalId[];
const levels = (s: GameState, id: RivalId) => ownedPlots(s, id).map((p) => s.plots[p.id].stand?.level ?? 0);
/** A seed whose first draw is under p (to force a dawn's land roll). */
function seedUnder(p: number): number {
  for (let seed = 1; ; seed++) if (nextRandom({ seed }) < p) return seed;
}
/** Rank `rank`, with the campaign's act to match: the campaign's act is the story's (src/sim/story.ts), not rank's. */
const atRank = (s: GameState, rank: number) => { s.rank = rank; s.story!.act = ACT_BY_RANK[rank - 1]; };
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

  it('the small gangs stay small: a Level 3 waits while Grow saves its $3,500', () => {
    const s = newGame(13);
    const id: RivalId = 'coldbrew';
    const stands = ownedPlots(s, id).filter((p) => s.plots[p.id].stand).length;
    s.day = 31;
    budgetOf(s, id).grow = STAND_LEVELS[2].cost - 1;
    growUpgrades(s, id);
    expect(s.rivals[id].upgradesDue!.length).toBe(stands);
    expect(budgetOf(s, id).grow).toBe(STAND_LEVELS[2].cost - 1);
    s.day = 32;
    budgetOf(s, id).grow = STAND_LEVELS[2].cost;
    growUpgrades(s, id);
    expect(levels(s, id).filter((l) => l === 3).length).toBe(1);
    expect(s.rivals[id].upgradesDue!.length).toBe(stands - 1);
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

  it('Grow pays to rebuild a smashed stand: an empty Grow lets it go For Sale', () => {
    const smashed = (grow: number) => {
      const s = newGame(11);
      s.day = 12;
      const plot = ownedPlots(s, 'sourwood').find((p) => p.type !== 'hq' && s.plots[p.id].stand)!;
      const ps = s.plots[plot.id];
      ps.stand!.wrecked = true; ps.wreckedDay = s.day; ps.smashedBy = 'player';
      for (const id of RIVALS) budgetOf(s, id).guard = 0;
      budgetOf(s, 'sourwood').grow = grow;
      s.seed = seedUnder(FACTIONS.sourwood.rebuild);
      return { s, plot: plot.id, cost: rebuildCost(ps), cash: s.rivals.sourwood.cash };
    };
    const broke = smashed(0);
    crewAtDawn(broke.s);
    expect(broke.s.plots[broke.plot].owner).toBeNull();
    expect(broke.s.plots[broke.plot].dibs?.who).toBe('player');
    expect(broke.s.rivals.sourwood.cash).toBe(broke.cash);
    const flush = smashed(10_000);
    crewAtDawn(flush.s);
    expect(flush.s.plots[flush.plot].owner).toBe('sourwood');
    expect(flush.s.plots[flush.plot].repair?.rebuild).toBe(true); // booked: built overnight, open at the next dawn (damage.ts)
    expect(budgetOf(flush.s, 'sourwood').grow).toBeCloseTo(10_000 - flush.cost, 2);
    expect(flush.s.rivals.sourwood.cash).toBeCloseTo(flush.cash - flush.cost, 2);
    expect(bankTakings(flush.s, 'sourwood')).toBe(0); // a rebuild is Grow spending, not tomorrow's loss
  });

  it('a rival\'s First Dibs buy comes out of Grow', () => {
    const lapsed = (grow: number) => {
      const s = newGame(12);
      s.day = 12;
      const ps = s.plots[LOTTIES_CORNER];
      ps.stand!.wrecked = true; ps.wreckedDay = s.day - PLAYER_REBUILD_DAYS - 1; ps.smashedBy = 'fizzco';
      for (const id of RIVALS) budgetOf(s, id).guard = 0;
      budgetOf(s, 'fizzco').grow = grow;
      return { s, land: ps.landValue, cash: s.rivals.fizzco.cash };
    };
    const broke = lapsed(0);
    crewAtDawn(broke.s);
    expect(broke.s.plots[LOTTIES_CORNER].owner).toBeNull();
    expect(broke.s.plots[LOTTIES_CORNER].dibs).toBeUndefined();
    expect(broke.s.rivals.fizzco.cash).toBe(broke.cash);
    const flush = lapsed(1e5);
    crewAtDawn(flush.s);
    expect(flush.s.plots[LOTTIES_CORNER].owner).toBe('fizzco');
    expect(budgetOf(flush.s, 'fizzco').grow).toBeCloseTo(1e5 - flush.land, 2);
    expect(flush.s.rivals.fizzco.cash).toBeCloseTo(flush.cash - flush.land, 2);
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
    // Passers-by at the Blenders' stands who bought from you instead: a quarter of them today.
    const theirs = ownedPlots(s, 'blenders').filter((p) => s.plots[p.id].stand);
    for (const p of theirs) s.plots[p.id].stand!.day.passersby = 40;
    for (let i = 0; i < theirs.length * 10; i++) tookCustomer(s, 'blenders');
    expect(customersTaken(s, 'blenders')).toBeCloseTo(0.25, 5);
    expect(attentionOf(s, 'blenders')).toBeCloseTo(withBorder + 0.25 * ATTENTION.customers, 0);
    s.rivals.blenders.grudge = 40;
    expect(attentionOf(s, 'blenders')).toBeCloseTo(withBorder + 0.25 * ATTENTION.customers + 40 * ATTENTION.grudge, 0);
    s.day += 2; // two days on, that day's customers are old news
    expect(customersTaken(s, 'blenders')).toBe(0);
  });

  it('scores raid targets by worth over defense, never their own land or a rival HQ', () => {
    const s = newGame(16);
    const own = ownedPlots(s, 'fizzco')[0];
    expect(targetScore(s, 'fizzco', own.id)).toBe(0);
    const hq = PLOTS.find((p) => p.type === 'hq' && s.plots[p.id].owner === 'hollis')!;
    expect(targetScore(s, 'fizzco', hq.id)).toBe(0);
    expect(targetScore(s, 'fizzco', LOTTIES_CORNER)).toBeGreaterThan(0); // your Corner is fair game
    const theirs = ownedPlots(s, 'hollis').find((p) => p.type !== 'hq' && s.plots[p.id].stand)!;
    const open = targetScore(s, 'fizzco', theirs.id);
    s.plots[theirs.id].garrison = (s.plots[theirs.id].garrison ?? 0) + 2;
    expect(targetScore(s, 'fizzco', theirs.id)).toBeLessThan(open);
    addGrudge(s, 'fizzco', 'hollis', 30);
    expect(grudge(s, 'fizzco', 'hollis')).toBe(30);
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

describe('Delivery Raids: Attention picks the sender and Strike pays', () => {
  /** Rank 7, a Pad on one of Hollis's Fields and a 4,000-bottle chopper picking up today; `setup` runs before the day opens. */
  function pickup(seed: number, setup: (s: GameState) => void = () => {}) {
    const s = newGame(seed);
    atRank(s, 7);
    s.reputation = 4.5;
    s.cash = 3_000_000;
    pastTutorial(s);
    const field = PLOTS.find((p) => p.district === 'groves' && p.type === 'field')!.id;
    s.plots[field] = { ...s.plots[field], owner: 'player', garrison: 0 };
    buildFacility(s, field, 'helipad');
    buildFacility(s, field, 'helipad'); // the Helipad tier loads 5,000 a day, so the order goes in one trip
    s.bottles = 6000;
    s.orders.push({ id: 'vip', tier: 'heli', client: 'Test Star', qty: 4000, pay: 15000, due: s.day, expires: s.day, plot: field, accepted: true });
    setup(s);
    openStand(s);
    s.minute = PICKUP_MINUTE.heli; // the chopper lands and the loading starts
    deliver(s, s.orders.find((o) => o.id === 'vip')!);
    return { s, raid: s.raids.find((r) => r.delivery) };
  }
  const strikes = (s: GameState) => RIVALS.map((id) => budgetOf(s, id).strike);

  it('a crew comes for the pad only when a boss\'s Strike can pay for it', () => {
    let raided = 0;
    for (let seed = 1; seed <= 40; seed++) if (pickup(seed).raid) raided++;
    expect(raided).toBeGreaterThan(0); // some pickups draw a Delivery Raid...
    for (let seed = 1; seed <= 40; seed++) {
      const { s, raid } = pickup(seed, (g) => { for (const id of RIVALS) budgetOf(g, id).strike = 0; });
      expect(raid).toBeUndefined(); // ...but nobody can pay for one now
      expect(s.orders.some((o) => o.id === 'vip')).toBe(false); // the chopper took its load
    }
  });

  it('the boss with by far the most Attention sends it, Strike pays its wages, and a boss backing off sits it out', () => {
    const sent = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      let before: number[] = [];
      const { s, raid } = pickup(seed, (g) => { g.rivals.hollis.attention = 40; before = strikes(g); });
      if (!raid) continue;
      sent.add(raid.attacker);
      expect(budgetOf(s, 'hollis').strike).toBeCloseTo(before[RIVALS.indexOf('hollis')] - raidCost(s, 'hollis', raid.party!.length), 2);
    }
    expect([...sent]).toEqual(['hollis']); // Tilly rarely raids, but her eyes are on your pad
    sent.clear();
    for (let seed = 1; seed <= 60; seed++) {
      const { raid } = pickup(seed, (g) => { g.rivals.hollis.attention = 40; g.rivals.hollis.respectUntil = g.day + 1; });
      if (raid) sent.add(raid.attacker);
    }
    expect(sent.size).toBeGreaterThan(0);
    expect(sent.has('hollis')).toBe(false);
  });

  it('a Blenders crew for the pad is a Blender Rush', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const { s, raid } = pickup(seed, (g) => { g.rivals.blenders.attention = 40; });
      if (!raid) continue;
      expect(raid.attacker).toBe('blenders');
      expect(raid.party!.length).toBe(RAID_PARTY[threatLevel(s) - 1].size[1]);
      expect(raid.party!.some((f) => f.weapon === 'hatchets')).toBe(false);
      return;
    }
    throw new Error('no Delivery Raid in 60 seeds');
  });
});

describe('Blender Rush', () => {
  const tierAt = (s: GameState) => Math.min(5, Math.max(1, Math.ceil(s.rank / 2)));

  it('the Blenders send the most raids on you: a boss\'s Strike share adds to its Attention', () => {
    const s = newGame(40);
    s.day = 20;
    for (const id of RIVALS) { s.rivals[id].attention = 1.5; budgetOf(s, id).strike = 1e6; s.rivals[id].cash = Math.max(s.rivals[id].cash, 1e6); }
    expect(raidWeight(s, 'blenders') - raidWeight(s, 'hollis')).toBeCloseTo(ATTENTION.strike * (FACTIONS.blenders.strike - FACTIONS.hollis.strike), 5);
    const sent: Record<string, number> = {};
    for (let seed = 1; seed <= 400; seed++) { const id = pickRaider(s, { seed }, 3)!; sent[id] = (sent[id] ?? 0) + 1; }
    for (const id of RIVALS.filter((r) => r !== 'blenders')) expect(sent.blenders).toBeGreaterThan(sent[id] ?? 0);
    expect(sent.blenders / 400).toBeGreaterThan(0.3);
  });

  it('a Blender Rush comes at the top of the Threat range, every weapon one tier toward fists, at half the wages', () => {
    const s = newGame(41);
    for (const rank of [1, 5, 7, 9]) {
      s.rank = rank;
      const tier = tierAt(s);
      const planned = raidPartyFor(s, 'blenders');
      const rush = blenderRush(s, planned, tier);
      expect(rush.length).toBe(RAID_PARTY[tier - 1].size[1]);
      expect(new Set(rush.map((f) => f.id)).size).toBe(rush.length);
      expect(rush.some((f) => f.weapon === 'hatchets')).toBe(false);
      rush.forEach((f, i) => {
        const was = planned[i % planned.length];
        expect(f.weapon).toBe(({ hatchets: 'clubs', clubs: 'fists', fists: 'fists' } as const)[was.weapon]);
        expect(f.hit / WEAPONS[f.weapon].hit).toBeCloseTo(was.hit / WEAPONS[was.weapon].hit, 5); // same henchman, lesser weapon
        expect(f.hp).toBe(was.hp);
      });
      if (tier <= 3) expect(rush.every((f) => f.weapon === 'fists')).toBe(true);
      expect(raidCost(s, 'blenders', 10, tier)).toBe(Math.round(raidCost(s, 'hollis', 10, tier) * BLENDER_RUSH.cost));
    }
  });

  it('Brock phones before each Blender Rush on you', () => {
    const s = newGame(42);
    s.day = 20;
    s.story!.act = 2; // Day 20 is Act 2, when Brock's calls start (src/sim/story.ts)
    s.rank = 5;
    pastTutorial(s);
    for (const id of RIVALS) budgetOf(s, id).strike = 0;
    budgetOf(s, 'blenders').strike = 1e5;
    const raid = nightsUntilRaid(s)!;
    expect(raid.attacker).toBe('blenders');
    expect(raid.party!.length).toBe(RAID_PARTY[tierAt(s) - 1].size[1]);
    expect(raid.party!.every((f) => f.weapon === 'fists')).toBe(true);
    expect(s.rivals.blenders.rush).toBe(s.day);
    expect(s.phone!.queue.some((c) => c.who === 'blenders' && c.text === BLENDER_RUSH.taunt && c.raid === raid.id)).toBe(true); // rings once it's spotted (src/sim/phone.ts)
    expect(budgetOf(s, 'blenders').strike).toBeCloseTo(1e5 - raidCost(s, 'blenders', raid.party!.length), 2);
  });

  it('changes who raids and how the party looks, not how many raids come', () => {
    const s = newGame(43);
    s.day = 20;
    s.rank = 5;
    pastTutorial(s);
    for (let i = 0; i < 300; i++) {
      const night = JSON.parse(JSON.stringify(s)) as GameState;
      s.raids = [];
      planNight(s);
      const onYou = (g: GameState) => g.raids.filter((r) => r.attacker !== 'player' && g.plots[r.target].owner === 'player');
      if (!onYou(s).length || onYou(s)[0].attacker !== 'blenders') continue;
      budgetOf(night, 'blenders').strike = 0; // the same night with the Blenders broke: someone else comes
      night.raids = [];
      planNight(night);
      expect(onYou(night).length).toBe(onYou(s).length);
      expect(onYou(night)[0].attacker).not.toBe('blenders');
      return;
    }
    throw new Error('no Blender Rush in 300 nights');
  });

  it('the Blenders raid other rivals the same way', () => {
    const s = newGame(44);
    s.rank = 3;
    const target = ownedPlots(s, 'hollis').find((p) => s.plots[p.id].stand)!;
    budgetOf(s, 'blenders').strike = 1e5;
    s.raids = [{ id: 'r1', attacker: 'blenders', target: target.id, objective: 'smash', party: raidPartyFor(s, 'blenders').slice(0, 2), detected: true, eta: '02:00' }];
    signatureRaids(s);
    const tier = Math.min(3, tierAt(s) + 1);
    expect(s.raids.length).toBe(1);
    expect(s.raids[0].party!.length).toBe(RAID_PARTY[tier - 1].size[1]);
    expect(s.raids[0].party!.every((f) => f.weapon === 'fists')).toBe(true);
    expect(s.news.some((n) => n.startsWith('Brock:'))).toBe(false); // he only phones you
  });
});

describe('Old Money: elite Stewards', () => {
  it('each Steward comes one henchman level up, in that level\'s gear, every weapon one tier toward hatchets', () => {
    const s = newGame(61);
    s.rank = 6;
    const party = raidPartyFor(s, 'sourwood');
    const elite = eliteStewards(party);
    const up = { fists: 'clubs', clubs: 'hatchets', hatchets: 'hatchets' } as const;
    elite.forEach((f, i) => {
      expect(f.level).toBe(Math.min(5, (party[i].level ?? 1) + 1));
      expect(f.weapon).toBe(up[party[i].weapon]);
      expect(f.hp).toBeGreaterThan(party[i].hp);
      expect(f.hit).toBeGreaterThanOrEqual(party[i].hit);
      expect(f.id).toBe(party[i].id);
    });
  });

  it('Vera sends them on her raids on you from Act 5 (Rank 9): on Classic, every Steward a hatchet', () => {
    const raidBy = (rank: number) => {
      const s = newGame(62);
      s.day = 120;
      atRank(s, rank);
      pastTutorial(s);
      for (const id of RIVALS) budgetOf(s, id).strike = 0;
      s.rivals.sourwood.cash = 1e7;
      budgetOf(s, 'sourwood').strike = 1e6;
      const raid = nightsUntilRaid(s)!;
      expect(raid.attacker).toBe('sourwood');
      return raid.party!;
    };
    expect(raidBy(9).filter((f) => !f.id.startsWith('sourwood-boss')).every((f) => f.weapon === 'hatchets' && f.level === 5)).toBe(true); // Threat 5 alone is half clubs; Vera herself leads it (threat.ts raidBoss)
    const act4 = raidBy(8);
    expect(act4.every((f) => f.level === 4)).toBe(true); // Threat 4's henchmen, not one up
    expect(act4.some((f) => f.weapon !== 'hatchets')).toBe(true);
  });
});

describe('Night Shift', () => {
  /** A raid by `attacker` setting out for Lottie's Corner at 21:00 on Day 1: has the watch spotted it by its warning? */
  function spotted(seed: number, attacker: RivalId, gadgets: GadgetId[] = []): boolean {
    const s = newGame(seed);
    s.phase = 'report';
    s.minute = CLOSE;
    s.plots[LOTTIES_CORNER].defense.gadgets = gadgets;
    const r: Raid = { id: 'ns', attacker, target: LOTTIES_CORNER, objective: 'shakedown', party: raidPartyFor(s, attacker), detected: false, eta: hhmm(23 * 60), leave: 21 * 60, at: 23 * 60 };
    s.raids = [r];
    sleepUntilDawn(s, true); // stops at the warning
    return r.detected;
  }

  it('Cold Brew\'s night raids take 25 more off your detection, and Floodlights only win back the night', () => {
    const seeds = Array.from({ length: 40 }, (_, i) => i + 1);
    const count = (attacker: RivalId, gadgets: GadgetId[] = []) => seeds.filter((seed) => spotted(seed, attacker, gadgets)).length;
    expect(count('coldbrew')).toBe(0); // 50% to spot a raid, less 25 at night, less 25 for the Night Shift
    expect(count('blenders')).toBeGreaterThan(3); // 25%
    expect(count('coldbrew', ['floodlights'])).toBeGreaterThan(3); // 25%: the lights cancel the night, not the Night Shift
    const s = newGame(1);
    const raid = { attacker: 'coldbrew' } as Raid;
    expect(nightShiftStealth(s, raid)).toBe(0); // by day
    s.phase = 'night';
    expect(nightShiftStealth(s, raid)).toBe(NIGHT_SHIFT.stealth);
    expect(nightShiftStealth(s, { attacker: 'blenders' } as Raid)).toBe(0);
  });

  it('Juni phones the morning after a Cold Brew Sabotage spoils your stock, not after a plain raid', () => {
    const s = newGame(2);
    s.day = 30;
    const fight = { day: 29, attacker: 'coldbrew', defender: 'player', target: LOTTIES_CORNER, outcome: 'robbed' } as BattleReport;
    s.battles.push(fight);
    tauntsAtDawn(s);
    expect(s.phone?.queue ?? []).toEqual([]);
    s.battles.push({ ...fight, sabotage: true } as BattleReport);
    tauntsAtDawn(s);
    expect(s.phone!.queue).toMatchObject([{ who: 'coldbrew', text: NIGHT_SHIFT.taunt, mood: 'gloat', day: 30 }]);
  });
});

describe('Dig In', () => {
  /** Hollis with its fences torn down and Guard money to rebuild them; nobody else spends. */
  function bare(seed: number) {
    const s = newGame(seed);
    for (const id of RIVALS) budgetOf(s, id).guard = 0;
    for (const p of ownedPlots(s, 'hollis')) s.plots[p.id].defense = NO_DEFENSE();
    s.rivals.hollis.cash = 1e6;
    budgetOf(s, 'hollis').guard = 100_000;
    return s;
  }

  it('Hollis fences for 60% of your price, with hay bales that add half the fence\'s HP, and fences every Field it holds', () => {
    const s = bare(21);
    const before = Object.fromEntries(ownedPlots(s, 'hollis').map((p) => [p.id, { invested: s.plots[p.id].invested, garrison: s.plots[p.id].garrison ?? 0 }]));
    rivalGuardSpend(s, 'hollis', { seed: 1 });
    rivalGuardSpend(s, 'hollis', { seed: 1 }); // a fence goes up one tier a dawn
    let paid = 0;
    for (const p of ownedPlots(s, 'hollis')) {
      const ps = s.plots[p.id];
      const fences = Array.from({ length: ps.defense.tier }, (_, i) => fencePrice('hollis', i + 1)).reduce((a, b) => a + b, 0);
      const gadgets = ps.defense.gadgets.reduce((a, g) => a + GADGETS[g].cost, 0); // crew's kit: once a stand's fence is up, its gadgets
      paid += fences + gadgets + ((ps.garrison ?? 0) - before[p.id].garrison) * RIVAL_HIRE_FEE;
      expect(ps.invested - before[p.id].invested).toBe(fences + gadgets);
      if (!ps.defense.tier) continue;
      expect(ps.defense.fenceHp).toBe(Math.round(PERIMETERS[ps.defense.tier - 1].hp * DIG_IN.hp));
      expect(hayBales(s, p.id)).toBe(true);
    }
    expect(100_000 - budgetOf(s, 'hollis').guard).toBeCloseTo(paid, 2);
    const fields = ownedPlots(s, 'hollis').filter((p) => p.type === 'field');
    expect(fields.length).toBeGreaterThan(0);
    for (const p of fields) expect(s.plots[p.id].defense.tier).toBe(DIG_IN.fieldTier);
    expect(fencePrice('hollis', 2)).toBe(Math.ceil(PERIMETERS[1].cost * DIG_IN.cost));
    expect(fencePrice('fizzco', 2)).toBe(PERIMETERS[1].cost);
    expect(hayBales(s, LOTTIES_CORNER)).toBe(false);
  });

  it('a chopped Hollis fence is patched back up to its bales, at Dig In\'s price', () => {
    const s = bare(22);
    rivalGuardSpend(s, 'hollis', { seed: 1 });
    rivalGuardSpend(s, 'hollis', { seed: 1 });
    const p = ownedPlots(s, 'hollis').find((q) => q.type === 'field')!; // fenced as high as a Field goes
    const ps = s.plots[p.id];
    const full = fenceFull(ps);
    ps.defense.fenceHp = full / 2;
    const guard = budgetOf(s, 'hollis').guard;
    rivalGuardSpend(s, 'hollis', { seed: 1 });
    expect(ps.defense.fenceHp).toBe(full);
    expect(guard - budgetOf(s, 'hollis').guard).toBeGreaterThanOrEqual(Math.ceil(PERIMETERS[ps.defense.tier - 1].repair * DIG_IN.cost)); // crew's flat repair
  });

  it('Tilly phones the morning after you raid her (the phone reads her Grudge jump)', () => {
    const s = newGame(23);
    s.day = 20;
    phoneCheck(s); // the phone notes her Grudge
    const target = ownedPlots(s, 'hollis').find((p) => p.type !== 'hq')!.id;
    s.battles.push({ day: 19, attacker: 'player', defender: 'hollis', target, outcome: 'repelled' } as BattleReport);
    addGrudge(s, 'hollis', 'player', GRUDGE.raided);
    tauntsAtDawn(s);
    phoneCheck(s, true);
    expect(s.phone!.queue.filter((c) => c.who === 'hollis').map((c) => c.text)).toEqual(["Bring all the hatchets you want. I've got hay bales till Tuesday."]);
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

  it('a rival stand sells one full stock a day at most, and with a day and a half of stock its pour gives out first', () => {
    const s = newGame(21);
    openStand(s);
    simulateRestOfDay(s);
    for (const p of PLOTS) {
      const ps = s.plots[p.id];
      if (!ps.owner || ps.owner === 'player' || !ps.stand) continue;
      expect(ps.stand.day.customers).toBeLessThanOrEqual(Math.min(stockCups(ps.stand), dailyService(s, p.id)));
      expect(ps.stand.day.walkedPast.soldOut).toBe(0);
    }
    expect(STAND_LEVELS.map((l) => stockCups(newStand(l.level)))).toEqual(STAND_LEVELS.map((l) => stockCapCups(l.level)));
    expect(stockCups(newStand(1))).toBe(300); // the spec's 300 cups: 160 lemons at 5 a pitcher and 300 scoops at 10, 10 cups a pitcher
  });

  it('rivals pay their henchmen your wages out of their cash at dawn, and the ones they can\'t pay walk off', () => {
    const s = newGame(22);
    const id: RivalId = 'coldbrew';
    const posts = ownedPlots(s, id).filter((p) => (s.plots[p.id].garrison ?? 0) > 0);
    const bill = posts.reduce((a, p) => a + (s.plots[p.id].garrison ?? 0) * henchWage(s.plots[p.id]), 0);
    const crew = () => ownedPlots(s, id).reduce((a, p) => a + (s.plots[p.id].garrison ?? 0), 0);
    const all = crew();
    expect(henchWage({ ...s.plots[posts[0].id], stand: newStand(1) })).toBe(15); // a Rookie's wage
    expect(wageBill(s, id)).toBe(bill);
    expect(reserveOf(s, id)).toBe(2 * runningCosts(s, id)); // wages are a running cost, like upkeep
    s.rivals[id].cash = bill;
    expect(payWages(s, id)).toBe(0);
    expect(s.rivals[id].cash).toBe(0);
    expect(crew()).toBe(all);
    s.rivals[id].cash = Math.floor(bill / 2);
    const left = payWages(s, id);
    expect(left).toBeGreaterThan(0);
    expect(crew()).toBe(all - left);
    expect(s.rivals[id].cash).toBeGreaterThanOrEqual(0);
  });

  it('wages come off the takings the buckets get, like upkeep', () => {
    const s = newGame(22);
    const id: RivalId = 'coldbrew';
    bankTakings(s, id);
    const bill = wageBill(s, id);
    s.rivals[id].cash += 1000;
    payWages(s, id);
    expect(bankTakings(s, id)).toBeCloseTo(1000 - bill, 2);
  });

  it('hires a henchman only while Guard\'s share of the day\'s trade covers his wage', () => {
    const s = newGame(22);
    const id: RivalId = 'coldbrew';
    const crew = () => ownedPlots(s, id).reduce((a, p) => a + (s.plots[p.id].garrison ?? 0), 0);
    for (const p of ownedPlots(s, id)) {
      s.plots[p.id].defense = { ...s.plots[p.id].defense, tier: PERIMETERS.length, fenceHp: PERIMETERS[PERIMETERS.length - 1].hp };
      s.plots[p.id].garrison = 0;
    }
    s.rivals[id].cash = 1e6;
    budgetOf(s, id).guard = 1e6;
    s.rivals[id].trade = { ...s.rivals[id].trade!, days: RIVAL_TRADE.days, wages: 0, last: 0 };
    rivalGuardSpend(s, id, { seed: 1 });
    expect(crew()).toBe(0); // a day that nets nothing hires nobody
    s.rivals[id].trade!.last = 100; // Guard's 25% is $25: one Rookie at $15
    rivalGuardSpend(s, id, { seed: 1 });
    expect(crew()).toBe(1);
    expect(wageBill(s, id)).toBeLessThanOrEqual(FACTIONS[id].guard * (100 + wageBill(s, id)));
    s.rivals[id].trade!.last = 100_000;
    rivalGuardSpend(s, id, { seed: 1 });
    expect(crew()).toBeGreaterThan(1);
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

describe('rival cash growth', () => {
  /** Play `days` days (the player just opens), returning each rival's trade income as a share of its starting cash after the first week. */
  function play(s: GameState, days: number): Record<string, number[]> {
    const income: Record<string, number[]> = {};
    for (let d = 0; d < days; d++) {
      s.cash = Math.max(s.cash, 500);
      openStand(s);
      simulateRestOfDay(s);
      sleepUntilDawn(s);
      for (const id of RIVALS) if (s.day > RIVAL_TRADE.days + 1) (income[id] ??= []).push(s.rivals[id].trade!.last / FACTIONS[id].startCash);
    }
    return income;
  }
  const pullOf = (table: Record<string, number>) =>
    SEASONS.reduce((a, k) => a + table[k] * Object.entries(SEASON_WEATHER[k]).reduce((b, [w, p]) => b + p! * WEATHER[w as keyof typeof WEATHER].traffic * WEATHER[w as keyof typeof WEATHER].thirst, 0), 0) / SEASONS.length;

  it('a stand\'s year of cups follows the seasons and each season\'s weather, and never passes its stock', () => {
    expect(yearOfCups(SEASON_DEMAND, 100, Infinity)).toBeCloseTo(100 * pullOf(SEASON_DEMAND), 6);
    expect(yearOfCups(BOARDWALK_SEASON, 100, Infinity)).toBeCloseTo(100 * pullOf(BOARDWALK_SEASON), 6);
    expect(yearOfCups(SEASON_DEMAND, 100, 60)).toBeLessThan(60);
    expect(yearOfCups(SEASON_DEMAND, 100, 60)).toBeLessThan(yearOfCups(SEASON_DEMAND, 100, Infinity));
    expect(yearOfCups(SEASON_DEMAND, 0, 60)).toBe(0);
  });

  it('the first week sets the scale so the opening stands net 1% of the starting cash on an average day, wages and upkeep paid', () => {
    const s = newGame(24);
    const income = play(s, 14);
    for (const id of RIVALS) {
      const t = s.rivals[id].trade!;
      expect(t.days).toBe(RIVAL_TRADE.days);
      expect(t.margin).toBeCloseTo(Object.entries(t.opening!).reduce((a, [plotId, o]) => a + openingYear(plotId, o), 0), 1);
      const want = RIVAL_TRADE.share * t.base + (t.upkeep + (t.wages ?? 0)) / t.days;
      expect(t.scale * t.margin).toBeCloseTo(want, -1);
      // Summer is the best season, so its days beat the yearly 1%, but not by miles: the Boardwalk's summer boom
      // (the Blenders) runs near 5% now that a day and a half of stock no longer caps it.
      const mean = income[id].reduce((a, b) => a + b, 0) / income[id].length;
      expect(mean).toBeGreaterThan(0.002);
      expect(mean).toBeLessThan(0.06);
    }
    expect(RIVALS.filter((id) => s.rivals[id].trade!.scale < 1).length).toBeGreaterThanOrEqual(2); // the small gangs carry overheads
    expect(s.rivals.sourwood.trade!.scale).toBeGreaterThan(1); // old money fronts more than its stands pour
  });

  it('an opening stand\'s demand counts the customers a sell-out turned away', () => {
    const s = newGame(24);
    openStand(s);
    simulateRestOfDay(s);
    const w = WEATHER[s.weather.kind];
    // A day and a half of stock outlasts the pour, so a sell-out is set by hand: 40 buyers turned away at each stand.
    const sold = PLOTS.filter((p) => s.plots[p.id].owner === 'blenders' && (s.plots[p.id].stand?.day.customers ?? 0) > 0);
    for (const p of sold) s.plots[p.id].stand!.day.walkedPast.soldOut += 40;
    expect(sold.length).toBeGreaterThan(0);
    const day = Object.fromEntries(sold.map((p) => [p.id, { ...s.plots[p.id].stand!.day, walkedPast: { ...s.plots[p.id].stand!.day.walkedPast } }]));
    sleepUntilDawn(s);
    for (const p of sold) {
      const o = s.rivals.blenders.trade!.opening![p.id];
      const pull = (p.district === 'boardwalk' ? BOARDWALK_SEASON : SEASON_DEMAND).summer * w.traffic * w.thirst;
      expect(o.days).toBe(1);
      expect(o.cups).toBe(day[p.id].customers);
      expect(o.demand).toBeCloseTo((day[p.id].customers + day[p.id].walkedPast.soldOut) / pull, 1);
    }
  });

  it('after the first week the scale stays put, a scale under 1 keeps that share of every stand, and a smashed stand earns nothing', () => {
    const s = newGame(24);
    play(s, RIVAL_TRADE.days + 1);
    const id: RivalId = 'blenders';
    const t = s.rivals[id].trade!;
    expect(t.scale).toBeLessThan(1);
    const scale = t.scale;
    const smashed = ownedPlots(s, id).find((p) => s.plots[p.id].stand)!;
    s.plots[smashed.id].stand!.wrecked = true;
    openStand(s);
    simulateRestOfDay(s);
    s.day++;
    const trade = standTrade(s, id);
    expect(trade.stands.find((x) => x.id === smashed.id)!.margin).toBe(0);
    const cash = s.rivals[id].cash;
    const net = settleTrade(s, id);
    expect(t.scale).toBe(scale);
    expect(s.rivals[id].cash).toBeCloseTo(cash - trade.margin * (1 - scale), 1);
    expect(net).toBeCloseTo(trade.margin * scale - trade.upkeep - wageBill(s, id), 1);
  });

  it('a scale over 1 covers only the opening stands, and an upgrade\'s extra earns the plain margin', () => {
    const s = newGame(24);
    play(s, RIVAL_TRADE.days + 1);
    const id: RivalId = 'sourwood';
    const t = s.rivals[id].trade!;
    expect(t.scale).toBeGreaterThan(1);
    openStand(s);
    simulateRestOfDay(s);
    s.day++;
    const trade = standTrade(s, id);
    const opening = t.opening!;
    // The opening stands at their opening level have their whole margin scaled; a stand bought since has its plain margin.
    const scaled = trade.stands.filter((x) => opening[x.id] && x.level <= opening[x.id].level).reduce((a, x) => a + x.margin, 0);
    expect(scaled).toBeGreaterThan(0);
    let cash = s.rivals[id].cash;
    settleTrade(s, id);
    expect(s.rivals[id].cash).toBeCloseTo(cash + scaled * (t.scale - 1), 0);
    // Stands it added later: the plain margin.
    s.rivals[id].cash = cash;
    t.opening = {};
    settleTrade(s, id);
    expect(s.rivals[id].cash).toBeCloseTo(cash, 1);
    // An opening stand upgraded since: the bonus covers what it would sell at its opening level.
    const x = trade.stands.find((q) => q.margin > 0 && opening[q.id])!;
    const o = { ...opening[x.id], level: x.level - 1 };
    t.opening = { [x.id]: o };
    s.rivals[id].cash = cash;
    settleTrade(s, id);
    const first = (o.margin / o.cups) * Math.min(o.cap, (o.demand / o.days) * x.pull);
    expect(s.rivals[id].cash).toBeCloseTo(cash + (t.scale - 1) * Math.min(x.margin, first), 0);
    cash = s.rivals[id].cash;
    expect(cash).toBeGreaterThan(0);
  });

  it('a save from before the trade books calibrates on its next week', () => {
    const s = newGame(24);
    for (const id of RIVALS) delete s.rivals[id].trade;
    const loaded = migrateSave(JSON.parse(JSON.stringify(s)))!;
    for (const id of RIVALS) expect(loaded.rivals[id].trade).toMatchObject({ base: loaded.rivals[id].cash, days: 0, scale: 1 });
    expect(JSON.stringify(migrateSave(JSON.parse(JSON.stringify(loaded)))!.rivals)).toBe(JSON.stringify(loaded.rivals));
  });
});

describe('rival start holdings', () => {
  it('FizzCo starts with the Harbor bottling plant and its Bottling Works; the Old Cannery is open', () => {
    const s = newGame(25);
    const plant = PLOTS.find((p) => p.id === FIZZCO_PLANT)!;
    expect(plant.name).toBe('FizzCo Bottling Plant');
    expect(s.plots[plant.id].owner).toBe('fizzco');
    expect(s.plots[plant.id].facility).toEqual({ kind: 'bottling', level: 1 });
    expect(s.plots[plant.id].invested).toBe(FACILITIES.bottling.costs[0]);
    expect(s.rivals.fizzco.peakPlots).toBe(ownedPlots(s, 'fizzco').length); // counted for Weakened
    expect(ownedPlots(s, 'fizzco').map((p) => p.id)).toContain(plant.id);
    const cannery = PLOTS.find((p) => p.name === 'Old Cannery')!;
    expect(s.plots[cannery.id].owner).toBeNull();
    for (const p of PLOTS.filter((q) => q.district === 'harbor' && q.type === 'dock')) expect(s.plots[p.id].owner).toBe('fizzco');
  });

  it('every one of Hollis\'s six Fields holds a Lemon Grove you can smash', () => {
    const s = newGame(26);
    s.rank = 9;
    const fields = PLOTS.filter((p) => p.district === 'groves' && p.type === 'field');
    expect(fields.length).toBe(6);
    for (const p of fields) {
      expect(s.plots[p.id].owner).toBe('hollis');
      expect(s.plots[p.id].facility).toEqual({ kind: 'grove', level: 1 });
      expect(s.plots[p.id].invested).toBe(FACILITIES.grove.costs[0]);
      expect(canRaid(s, p.id, [s.guards[0]?.id ?? 'g1'])).not.toEqual({ ok: false, why: 'Pick a rival stand or facility' });
    }
  });

  it('only two Lemon Groves add traffic, even when you take more from Hollis', () => {
    const s = newGame(27);
    const fields = PLOTS.filter((p) => p.district === 'groves' && p.type === 'field').slice(0, 3);
    for (const p of fields) s.plots[p.id].owner = 'player';
    expect(groveTraffic(s)).toBeCloseTo(MAX_GROVES * GROVE_TRAFFIC, 5);
  });

  it('a Field bought out from Hollis, Grove and all, still takes the helipad line: the Pad replaces the Grove', () => {
    const s = newGame(28);
    atRank(s, 7);
    s.cash = 5_000_000;
    const fields = PLOTS.filter((p) => p.district === 'groves' && p.type === 'field');
    for (const [i, p] of fields.entries()) {
      if (i === fields.length - 1) { // won over at the County Fair, Tilly sells the last Field at 1.5x
        s.world!.tillyWon = true;
        expect(tillyFieldRate(s, p.id)).toBe(TILLY_FIELD_BUYOUT);
      }
      const paid = plotBuyoutPrice(s, p.id);
      expect(plotBuyout(s, p.id)).toBe(true);
      expect(s.plots[p.id].facility).toEqual({ kind: 'grove', level: 1 }); // the Grove comes with the Field
      s.plots[p.id].defense = { tier: 1, fenceHp: PERIMETERS[0].hp, gadgets: [] }; // and a fence of yours stays on the books
      s.plots[p.id].invested += PERIMETERS[0].cost;
      expect(canBuildFacility(s, p.id, 'helipad')).toEqual({ ok: true });
      expect(canBuildFacility(s, p.id, 'pier').ok).toBe(false);
      const cash = s.cash;
      expect(buildFacility(s, p.id, 'helipad')).toBe(true);
      expect(s.plots[p.id].facility).toEqual({ kind: 'helipad', level: 1 });
      expect(s.plots[p.id].invested).toBe(PERIMETERS[0].cost + FACILITIES.helipad.costs[0]); // the Grove's $25,000 leaves the books
      expect(s.cash).toBe(cash - FACILITIES.helipad.costs[0]);
      expect(paid).toBeGreaterThan(0);
    }
    expect(groveTraffic(s)).toBe(0);
    // A Wrecked Grove is rebuilt first, and a Grove that isn't yours can't be swapped.
    const lawn = PLOTS.find((p) => p.district === 'groves' && p.type === 'field')!;
    s.plots[lawn.id].facility = { kind: 'grove', level: 1, wrecked: true };
    expect(canBuildFacility(s, lawn.id, 'helipad')).toEqual({ ok: false, why: 'Rebuild it first' });
    s.plots[lawn.id].facility = { kind: 'grove', level: 1 };
    s.plots[lawn.id].owner = 'hollis';
    expect(canBuildFacility(s, lawn.id, 'helipad')).toEqual({ ok: false, why: 'Buy the plot first' });
  });
});

describe('likeliest targets near their turf', () => {
  /** Lottie also holds a stand on a Hilltop street: far richer than her Corner, and far from the Blenders. */
  function hilltop(seed: number) {
    const s = newGame(seed);
    const h = PLOTS.find((p) => p.district === 'hilltop' && p.type === 'street' && !s.plots[p.id].owner)!.id;
    s.plots[h] = { ...s.plots[h], owner: 'player', stand: newStand(1, 1), invested: STAND_LEVELS[0].cost };
    return { s, h };
  }

  it('pin the weakest valuable stand near the raider\'s turf: a richer stand far away is passed over', () => {
    const { s, h } = hilltop(90);
    expect(targetScore(s, 'blenders', h)).toBeGreaterThan(targetScore(s, 'blenders', LOTTIES_CORNER));
    expect(likeliestTarget(s, 'blenders')!.id).toBe(LOTTIES_CORNER); // Maple Row borders the Blenders' Old Town stand
    expect(likeliestTarget(s, 'sourwood')!.id).toBe(h); // Hilltop is Vera's home
    s.plots[LOTTIES_CORNER].stand = null; // nothing of yours near the Blenders: your best anywhere
    s.plots[LOTTIES_CORNER].facility = undefined;
    expect(likeliestTarget(s, 'blenders')!.id).toBe(h);
    s.plots[h].stand = null;
    expect(likeliestTarget(s, 'blenders')).toBeNull(); // nothing left to raid
  });

  it('value over defense, ties to the lower plot id, the same rule against a rival', () => {
    const s = newGame(91);
    const [a, b] = PLOTS.filter((p) => p.district === 'maple' && p.type === 'street' && !s.plots[p.id].owner).slice(0, 2).map((p) => p.id);
    for (const id of [a, b]) s.plots[id] = { ...s.plots[id], owner: 'player', stand: newStand(1, 1), invested: 50_000, landValue: 1000 };
    expect(likeliestTarget(s, 'coldbrew')!.id).toBe([a, b].sort()[0]);
    s.plots[[a, b].sort()[0]].defense.tier = 1; // a fence on it
    expect(likeliestTarget(s, 'coldbrew')!.id).toBe([a, b].sort()[1]);
    const pin = likeliestTarget(s, 'blenders', 'hollis')!;
    expect(s.plots[pin.id].owner).toBe('hollis');
    expect(pin.type).not.toBe('hq');
    expect(likeliestTarget(s, 'blenders', 'hollis')).toEqual(pin); // the same pin every time
  });

  it('a night raid on you goes for the raider\'s pin, setting out on the night clock from its own turf', () => {
    const raidBy = (rival: RivalId) => {
      const { s, h } = hilltop(92);
      s.day = 20;
      s.rank = 3;
      pastTutorial(s);
      for (const id of RIVALS) budgetOf(s, id).strike = 0;
      s.rivals[rival].cash = 1e7;
      budgetOf(s, rival).strike = 1e6;
      const raid = nightsUntilRaid(s)!;
      expect(raid.attacker).toBe(rival);
      expect(raid.target).toBe(likeliestTarget(s, rival)!.id);
      if (raid.leave !== undefined) expect(raid.at).toBe(raid.leave + travelMinutes(s, raidStart(s, rival, raid.target), raid.target));
      return { raid, h };
    };
    expect(raidBy('blenders').raid.target).toBe(LOTTIES_CORNER);
    const vera = raidBy('sourwood');
    expect(vera.raid.target).toBe(vera.h);
  });
});

describe('Rivals Corkboard', () => {
  /** One boss's photo on the board. */
  const pinOf = (html: string, id: RivalId) => {
    const at = html.indexOf(`data-testid="cork-${id}"`);
    const next = html.indexOf('<div class="cl-card"', at);
    return at < 0 ? '' : html.slice(at, next < 0 ? undefined : next);
  };
  /** The paper menu as the HUD draws it (its key, its Threat meter or the corner's list open it). */
  const board = (s: GameState) => menuScreen(s, 'corkboard', { head: ['', ''], goals: [], crew: () => '', options: DEFAULT_OPTIONS });

  it('pins every surviving boss, highest Success Score first, each with the raid\'s own likeliest target', () => {
    const s = newGame(95);
    const html = board(s);
    expect(html).toContain('data-testid="menu-corkboard"');
    expect(html).toContain(corkboardBody(s).slice(0, 40)); // the menu's sheet holds the board, your score on top
    expect(html).toContain('data-action="menu" data-menu="" data-testid="menu-done"'); // Done puts it away, like every menu
    const order = boardOrder(s);
    expect(order).toEqual([...RIVALS].sort((a, b) => successScore(s, b) - successScore(s, a) || a.localeCompare(b)));
    const at = order.map((id) => html.indexOf(`data-testid="cork-${id}"`));
    at.forEach((x, i) => expect(x).toBeGreaterThan(i ? at[i - 1] : 0));
    for (const id of RIVALS) {
      const t = likeliestTarget(s, id)!;
      expect(pinOf(html, id)).toContain(`data-action="inspect" data-plot="${t.id}" data-testid="cork-target"`); // flies there
      expect(pinOf(html, id)).toContain(`Eyeing ${t.name}`);
    }
  });

  it('stamps a Weakened boss, notes a Truce and a broke boss, and takes down a fallen one', () => {
    const s = newGame(96);
    s.rivals.blenders.peakPlots = 100; // down to 40% or less of its peak plots
    s.rivals.hollis.truceUntil = s.day + 5;
    budgetOf(s, 'coldbrew').strike = 0;
    s.rivals.fizzco.alive = false;
    const html = board(s);
    expect(pinOf(html, 'blenders')).toContain('data-testid="cork-weakened"');
    expect(pinOf(html, 'sourwood')).not.toContain('WEAKENED');
    expect(pinOf(html, 'hollis')).toContain(`Truce to Day ${s.day + 5}`);
    expect(pinOf(html, 'coldbrew')).toContain('Broke');
    expect(pinOf(html, 'sourwood')).not.toContain('Broke');
    expect(html).not.toContain('data-testid="cork-fizzco"');
    for (const id of RIVALS) s.rivals[id].alive = false;
    expect(board(s)).toContain('Every rival is out of business');
  });

  it('red string toward each faction a boss holds a Grudge against, thicker with more Grudge', () => {
    const s = newGame(97);
    s.rivals.blenders.grudge = GRUDGE.feud; // a feud with you: five pips
    addGrudge(s, 'blenders', 'hollis', GRUDGE.raided); // one raid's worth: one pip
    const strings = pinOf(board(s), 'blenders');
    expect(strings).toContain(`Brock's Grudge toward Lottie's: ${GRUDGE.feud}">Lottie's</span><span class="cl-pips">${'<i class="on"></i>'.repeat(5)}</span>`);
    expect(strings).toContain(`toward Hollis: ${GRUDGE.raided}">Hollis</span><span class="cl-pips"><i class="on"></i>${'<i class=""></i>'.repeat(4)}</span>`);
    expect(pinOf(board(s), 'sourwood')).not.toContain('cork-strings'); // no Grudge, no string
  });

  it('from Rank 3, pins each rival\'s weakest valuable stand for your Raid Planner (never its HQ), and always their HQ', () => {
    const s = newGame(98);
    expect(pinOf(board(s), 'hollis')).not.toContain('Raid '); // the Raid Planner opens at Rank 3
    s.rank = 3;
    const soft = softSpot(s, 'hollis')!;
    expect(soft.type).not.toBe('hq');
    expect(s.plots[soft.id].owner).toBe('hollis');
    const pin = pinOf(board(s), 'hollis');
    expect(pin).toContain(`data-action="inspect" data-plot="${soft.id}"`);
    expect(pin).toContain(`Raid ${soft.name}`);
    const hq = PLOTS.find((p) => p.type === 'hq' && s.plots[p.id].owner === 'hollis')!;
    expect(pin).toContain(`data-plot="${hq.id}"`);
    s.plots[soft.id].garrison = 50; // a crowd of Farmhands moves in: another stand is softer now
    expect(softSpot(s, 'hollis')!.id).not.toBe(soft.id);
  });
});

describe('rival brand tiers', () => {
  it('Grow buys the next tier at your price once your Rank opens it, and its stands draw more; the Bugle reports it', () => {
    const s = newGame(70);
    s.rank = 4;
    const r = s.rivals.fizzco;
    expect(r.brandTier).toBe(2);
    r.cash = 1e6;
    budgetOf(s, 'fizzco').grow = BRAND_TIERS[2].cost; // FizzCo pays as soon as Grow covers the price
    const st = ownedPlots(s, 'fizzco').map((p) => s.plots[p.id].stand).find((x) => !!x)!;
    const before = marketingMultiplier(s, 'fizzco', st);
    growBrand(s, 'fizzco');
    expect(r.brandTier).toBe(3);
    expect(budgetOf(s, 'fizzco').grow).toBe(0);
    expect(r.cash).toBe(1e6 - BRAND_TIERS[2].cost);
    expect(marketingMultiplier(s, 'fizzco', st)).toBeCloseTo(before + BRAND_TIERS[2].traffic - BRAND_TIERS[1].traffic, 5);
    expect(s.news.at(-1)).toBe(`Bugle: ${FACTIONS.fizzco.name} put up Radio Jingle`);
    budgetOf(s, 'fizzco').grow = 1e6;
    growBrand(s, 'fizzco');
    expect(r.brandTier).toBe(3); // Billboards & TV Spot waits for your Rank 7
    s.rank = 8;
    growBrand(s, 'fizzco');
    growBrand(s, 'fizzco');
    expect(r.brandTier).toBe(5);
  });

  it('the others keep twice the price in Grow and stop at their cap: the Blenders never pass Flyers', () => {
    const s = newGame(71);
    s.rank = 10;
    for (const id of RIVALS) s.rivals[id].cash = 1e7;
    const b = budgetOf(s, 'sourwood');
    b.grow = BRAND_TIERS[1].cost * 2 - 1;
    growBrand(s, 'sourwood');
    expect(s.rivals.sourwood.brandTier).toBe(1);
    b.grow = BRAND_TIERS[1].cost * 2;
    growBrand(s, 'sourwood');
    expect(s.rivals.sourwood.brandTier).toBe(2);
    expect(b.grow).toBe(BRAND_TIERS[1].cost);
    for (const id of RIVALS) {
      budgetOf(s, id).grow = 5e6;
      for (let i = 0; i < 6; i++) growBrand(s, id);
      expect(s.rivals[id].brandTier).toBe(RIVAL_BRAND.cap[id]);
    }
    expect(s.rivals.blenders.brandTier).toBe(2);
    expect(Math.max(...RIVALS.map((id) => RIVAL_BRAND.cap[id]))).toBe(RIVAL_BRAND.cap.fizzco); // FizzCo spends the most
  });

  it('come with the dawn\'s Grow spending', () => {
    const s = newGame(72);
    s.rank = 4;
    s.day = 20;
    s.rivals.fizzco.cash = 1e7;
    budgetOf(s, 'fizzco').grow = 1e6;
    rivalDawn(s, 'fizzco', { seed: 9 });
    expect(s.rivals.fizzco.brandTier).toBe(3);
  });
});
