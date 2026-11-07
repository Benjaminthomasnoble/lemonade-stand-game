import { describe, expect, it } from 'vitest';
import {
  buildClubhouse, buyGadget, buyPerimeter, canBuyGadget, canHire, canPromote, detectionChance, dutyXp, equip, GUARD_FEE, hireGuard, LOTTIES_CORNER, migrateSave, newGame, openStand,
  payCrew, planRaid, PLOTS, promote,
  raidOdds, raidTargets, rebuildCost, rebuildStand, refreshRecruits, simulateRestOfDay, sleepUntilDawn, threatLevel, tickMinute, welcomeDex, type BattleReport, type GameState,
} from './economy.ts';
import {
  availableRaiders, guardFighter, holdsStronghold, neighborhoodWatch, raidIsNight, raidIsNightAt, raidRepCost, squadFighters, strongholdTravelMult, towerCovers, type Guard,
} from './crew.ts';
import { CLOSE } from './balance.ts';
import { canScout, isScouted, scoutedSnapshot, scoutWithLookout } from './scouting.ts';

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

describe('detection', () => {
  it('cans and a goose spot 80% by day, 55% at night and 80% under Floodlights', () => {
    const s = newGame(51);
    const ps = s.plots[LOTTIES_CORNER];
    ps.defense.gadgets = ['alarm', 'goose'];
    expect(detectionChance(s, LOTTIES_CORNER, false)).toBe(0.8);
    expect(detectionChance(s, LOTTIES_CORNER, true)).toBe(0.55);
    ps.defense.gadgets = ['alarm', 'goose', 'floodlights'];
    expect(detectionChance(s, LOTTIES_CORNER, true)).toBe(0.8);
  });

  it('caps at 95% before the night penalty, so 120% reads 70% at night', () => {
    const s = newGame(52);
    s.rank = 2;
    welcomeDex(s);
    s.guards[0].trait = 'Eagle Eye';
    s.plots[LOTTIES_CORNER].defense.gadgets = ['alarm', 'goose', 'watchtower'];
    expect(detectionChance(s, LOTTIES_CORNER, false)).toBe(0.95);
    expect(detectionChance(s, LOTTIES_CORNER, true)).toBe(0.7);
  });

  it('an Eagle Eye counts only while on the plot: not Out, not away raiding', () => {
    const s = newGame(53);
    s.rank = 2;
    welcomeDex(s);
    const g = s.guards[0];
    g.trait = 'Eagle Eye';
    expect(detectionChance(s, LOTTIES_CORNER, false)).toBe(0.6);
    expect(detectionChance(s, LOTTIES_CORNER, true)).toBe(0.35);
    g.outUntil = s.day + 1;
    expect(detectionChance(s, LOTTIES_CORNER, false)).toBe(0.5);
    g.outUntil = 0;
    s.raids.push({ id: 'r1', attacker: 'player', target: 'oldtown-0n', objective: 'smash', guards: [g.id], detected: false, eta: '01:00' });
    expect(detectionChance(s, LOTTIES_CORNER, false)).toBe(0.5);
  });
});

describe('the Lookout', () => {
  const setup = (seed: number) => {
    const s = newGame(seed);
    s.rank = 4;
    welcomeDex(s);
    const dex = s.guards[0];
    dex.level = 3;
    promote(s, dex.id, 'lookout');
    return { s, dex };
  };

  it('adds 25% detection while on the plot, and two Lookouts do not stack', () => {
    const { s, dex } = setup(61);
    expect(detectionChance(s, LOTTIES_CORNER, false)).toBe(0.75);
    expect(detectionChance(s, LOTTIES_CORNER, true)).toBe(0.5);
    s.guards.push({ ...dex, id: 'g2', name: 'Two Eyes' });
    expect(detectionChance(s, LOTTIES_CORNER, false)).toBe(0.75);
  });

  it('scouts a rival plot: its defenses show for 3 days, and the Lookout is off their post that day', () => {
    const { s, dex } = setup(62);
    const target = raidTargets(s)[0].id;
    s.plots[target].defense.gadgets = ['alarm'];
    expect(canScout(s, 'nobody', target).ok).toBe(false);
    expect(canScout(s, dex.id, LOTTIES_CORNER)).toEqual({ ok: false, why: 'Scout a rival plot' });
    expect(scoutWithLookout(s, dex.id, target)).toBe(true);
    expect(scoutedSnapshot(s, target)?.gadgets).toEqual(['alarm']);
    expect(canScout(s, dex.id, target)).toEqual({ ok: false, why: 'Dex scouted today' });
    expect(detectionChance(s, LOTTIES_CORNER, false)).toBe(0.5); // away watching
    expect(availableRaiders(s).some((g) => g.id === dex.id)).toBe(false);
    s.cash = 5000;
    playDay(s);
    expect(availableRaiders(s).some((g) => g.id === dex.id)).toBe(true);
    expect(isScouted(s, target)).toBe(true);
    playDay(s);
    expect(isScouted(s, target)).toBe(true);
    playDay(s);
    expect(isScouted(s, target)).toBe(false);
    expect(s.scouting?.[target]).toBeUndefined();
  });
});

describe('Wreckers and Captains', () => {
  const guard = (over: Partial<Guard> = {}): Guard => ({ id: 'g', name: 'Test Guard', trait: 'Hothead', level: 1, xp: 0, weapon: 'clubs', gear: 'none', post: null, outUntil: 0, fee: 0, ...over });

  it('a Wrecker chops 50% harder, and a Lumberjack Wrecker twice as hard', () => {
    expect(guardFighter(guard(), 'att', false).chop).toBeCloseTo(10);
    expect(guardFighter(guard({ specialty: 'wrecker' }), 'att', false).chop).toBeCloseTo(15);
    expect(guardFighter(guard({ trait: 'Lumberjack' }), 'att', false).chop).toBeCloseTo(15);
    expect(guardFighter(guard({ trait: 'Lumberjack', specialty: 'wrecker' }), 'att', false).chop).toBeCloseTo(20);
  });

  it('a Captain gives the whole side +20 Nerve and +10% Hit, once', () => {
    const plain = squadFighters([guard({ id: 'a' }), guard({ id: 'b', trait: 'Sprinter' })], 'att', false);
    const led = squadFighters([guard({ id: 'a', specialty: 'captain' }), guard({ id: 'b', trait: 'Sprinter' })], 'att', false);
    const twice = squadFighters([guard({ id: 'a', specialty: 'captain' }), guard({ id: 'b', trait: 'Sprinter', specialty: 'captain' })], 'att', false);
    for (let i = 0; i < 2; i++) {
      expect(led[i].nerve).toBe(plain[i].nerve + 20);
      expect(led[i].hit).toBeCloseTo(plain[i].hit * 1.1);
      expect(twice[i].nerve).toBe(led[i].nerve);
    }
  });

  it('a Captain on a raid leads the squad in the fight itself', () => {
    const s = newGame(71);
    s.rank = 6;
    welcomeDex(s);
    const dex = s.guards[0];
    dex.level = 3;
    promote(s, dex.id, 'captain');
    s.guards.push(guard({ id: 'gb', name: 'Bea B', trait: 'Sprinter' }));
    const target = raidTargets(s)[0].id;
    const report = planRaid(s, target, [dex.id, 'gb'], 'shakedown', 'now');
    if (typeof report !== 'object') throw new Error('raid did not run');
    const bea = report.attackers.find((f) => f.id === 'gb')!;
    expect(bea.nerve).toBe(guardFighter(guard({ trait: 'Sprinter' }), 'att', true).nerve + 20);
  });
});

describe('day and night raids', () => {
  const crew = (seed: number) => {
    const s = newGame(seed);
    s.rank = 4;
    s.reputation = 4;
    welcomeDex(s);
    s.guards.push({ ...s.guards[0], id: 'gb', name: 'Bea B', trait: 'Gentle Giant', post: null });
    return s;
  };

  it('the minute the fight happens decides: 08:00-20:00 is day; Morning Prep and the Evening are night', () => {
    expect([7 * 60, 8 * 60, 19 * 60 + 59, 20 * 60, 25 * 60].map(raidIsNightAt)).toEqual([true, false, false, true, true]);
    const s = crew(81);
    expect(s.phase).toBe('prep');
    expect(raidIsNight(s)).toBe(true);
    expect(raidRepCost(s, ['gb', s.guards[0].id], 'smash')).toBe(0); // a fight at Morning Prep (an HQ assault) costs nothing
  });

  it('by day customers see it as it lands: 0.1 star, 0.2 for a Smash; none when Gentle Giants go alone', () => {
    const s = crew(82);
    openStand(s);
    s.minute = 12 * 60;
    expect(raidIsNight(s)).toBe(false);
    const [a, b] = raidTargets(s).map((p) => p.id);
    expect(raidRepCost(s, [s.guards[0].id], 'shakedown')).toBe(0.1);
    expect(raidRepCost(s, [s.guards[0].id, 'gb'], 'smash')).toBe(0.2);
    expect(raidRepCost(s, ['gb'], 'smash')).toBe(0);
    planRaid(s, a, ['gb'], 'smash', 'now');
    planRaid(s, b, [s.guards[0].id], 'smash', 'now');
    expect(s.reputation).toBe(4); // nothing until they get there
    let fights = 0;
    while (fights < 2 && s.minute < CLOSE) for (const e of tickMinute(s)) if (e.type === 'fight') fights++;
    expect(fights).toBe(2);
    expect(s.reputation).toBeCloseTo(3.8, 5); // the Giant's raid cost nothing, the other a Smash's 0.2
  });

  it('a Sneaky raider takes 25 more points off, once, down to 0%, and the planner knows', () => {
    const s = crew(83);
    s.guards[0].trait = 'Sneaky';
    const sneak = s.guards[0].id;
    const target = raidTargets(s).find((p) => !s.plots[p.id].defense.gadgets.length)!.id;
    expect(detectionChance(s, target, false, true)).toBe(0.25);
    expect(detectionChance(s, target, true, true)).toBe(0);
    s.plots[target].defense.gadgets = ['alarm', 'goose'];
    expect(detectionChance(s, target, true, true)).toBe(0.3);
    s.plots[target].defense.gadgets = [];
    expect(planRaid(s, target, [sneak, 'gb'], 'shakedown', 'tonight')).toBe(true);
    const raid = s.raids.find((r) => r.attacker === 'player')!;
    openStand(s);
    simulateRestOfDay(s);
    sleepUntilDawn(s);
    expect(raid.detected).toBe(false); // 0% at night with a Sneaky raider
  });

  it('Gentle Giants have +50% HP and 30% less Hit', () => {
    const f = guardFighter({ id: 'gg', name: 'Gentle G', trait: 'Gentle Giant', level: 1, xp: 0, weapon: 'clubs', gear: 'none', post: null, outUntil: 0, fee: 0 }, 'att', false);
    expect(f.hp).toBeCloseTo(150);
    expect(f.hit).toBeCloseTo(18 * 0.7);
  });
});

describe('district control on defense', () => {
  /** Hands you the first n purchasable plots of a district (all of them by default). */
  const own = (s: GameState, d: string, n = Infinity) => {
    for (const p of PLOTS.filter((q) => q.district === d && q.type !== 'civic' && q.type !== 'hq').slice(0, n)) s.plots[p.id].owner = 'player';
  };

  it('Neighborhood Watch: Maple Row at Full Control rings a free Tin-Can on every Maple plot and adds 10% everywhere', () => {
    const s = newGame(91);
    s.rank = 4;
    s.cash = 5000;
    const rival = PLOTS.find((p) => s.plots[p.id].owner === 'blenders' && p.type !== 'hq')!.id;
    const rivalSeen = detectionChance(s, rival, false);
    expect(detectionChance(s, LOTTIES_CORNER, false)).toBe(0.5);
    own(s, 'maple', 11); // 11 of 12: a Stronghold, not yet Full Control
    expect(neighborhoodWatch(s)).toBe(false);
    expect(detectionChance(s, LOTTIES_CORNER, false)).toBe(0.6);
    own(s, 'maple');
    expect(neighborhoodWatch(s)).toBe(true);
    expect(detectionChance(s, LOTTIES_CORNER, false)).toBe(0.85); // 50 + free alarm 15 + Watch 10 + Stronghold 10
    expect(detectionChance(s, LOTTIES_CORNER, true)).toBe(0.6);
    expect(canBuyGadget(s, LOTTIES_CORNER, 'alarm')).toEqual({ ok: false, why: 'Neighborhood Watch rings one here' });
    expect(canBuyGadget(s, LOTTIES_CORNER, 'goose').ok).toBe(true); // the free one takes no slot
    s.plots[LOTTIES_CORNER].defense.gadgets = ['alarm'];
    expect(detectionChance(s, LOTTIES_CORNER, false)).toBe(0.85); // a bought one doesn't ring twice
    s.plots['harbor-1n'].owner = 'player';
    expect(detectionChance(s, 'harbor-1n', false)).toBe(0.6); // +10% anywhere, but the free alarm is Maple Row's
    expect(detectionChance(s, rival, false)).toBe(rivalSeen); // rivals get nothing from it
  });

  it('a Stronghold (75%+) spots raids on your plots there 10% more and halves reinforcement travel', () => {
    const s = newGame(92);
    own(s, 'maple', 8); // 8 of 12
    expect(holdsStronghold(s, 'maple')).toBe(false);
    expect(strongholdTravelMult(s, 'maple')).toBe(1);
    expect(detectionChance(s, LOTTIES_CORNER, false)).toBe(0.5);
    own(s, 'maple', 9); // 9 of 12 = 75%
    expect(holdsStronghold(s, 'maple')).toBe(true);
    expect(strongholdTravelMult(s, 'maple')).toBe(0.5);
    expect(strongholdTravelMult(s, 'harbor')).toBe(1);
    expect(detectionChance(s, LOTTIES_CORNER, false)).toBe(0.6);
    expect(detectionChance(s, LOTTIES_CORNER, true)).toBe(0.35);
    s.plots['harbor-1n'].owner = 'player';
    expect(detectionChance(s, 'harbor-1n', false)).toBe(0.5);
  });
});

describe('the Watchtower', () => {
  it('covers its plot and its owner\'s plots within 2, once, and nothing past them', () => {
    const s = newGame(93);
    expect(LOTTIES_CORNER).toBe('maple-2s');
    for (const id of ['maple-0n', 'maple-1n', 'maple-4s', 'maple-5n']) s.plots[id].owner = 'player';
    s.plots[LOTTIES_CORNER].defense.gadgets = ['watchtower'];
    expect(detectionChance(s, LOTTIES_CORNER, false)).toBe(0.8);
    expect(detectionChance(s, 'maple-0n', false)).toBe(0.8); // two lots along, across the street
    expect(detectionChance(s, 'maple-4s', false)).toBe(0.8);
    expect(detectionChance(s, 'maple-5n', false)).toBe(0.5); // three along: out of range
    s.plots['maple-1n'].defense.gadgets = ['watchtower']; // a second tower in range doesn't stack
    expect(detectionChance(s, 'maple-0n', false)).toBe(0.8);
    expect(detectionChance(s, LOTTIES_CORNER, false)).toBe(0.8);
    s.plots['maple-3n'].owner = 'blenders'; // a rival's lot inside the radius gets nothing from yours
    expect(towerCovers(s, 'maple-3n')).toBe(false);
    expect(detectionChance(s, 'maple-3n', false)).toBe(0.5);
    s.plots['maple-3s'].owner = 'blenders';
    s.plots['maple-3s'].defense.gadgets = ['watchtower']; // ...but theirs watches their own
    expect(detectionChance(s, 'maple-3n', false)).toBe(0.8);
    expect(towerCovers(s, 'maple-5n')).toBe(false);
  });
});
