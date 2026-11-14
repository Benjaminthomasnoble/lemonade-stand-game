import { describe, expect, it } from 'vitest';
import { COMBAT_RULES, createFight, runBattle, winChance, type BattleEvent, type BattleInput, type BattleResult, type Fighter, type Side } from './combat.ts';
import {
  BOSS_MOVES, canRaid, COMBAT, creditGuards, crewAtDawn, FACTIONS, fightRaid, GUARD_BASE, GUARD_FEE, guardFighter, guardReady, hhmm, hqPlot, HQS, hqSquad,
  hqStageInput, hqStageOver, hqSurvivors, LOTTIES_CORNER, migrateSave, NABBED, newGame, ownedPlots, PERIMETERS, raidInput, raidOdds, raidPartyFor, raidTargets,
  raidBoss, refreshRecruits, resolveNight, rosterCap, squadTrip, STAND_HP, stormHQ, WEAPONS, type BattleReport, type GadgetId, type GameState, type GearId, type Guard, type Raid, type RivalId, type Trait,
  type WeaponId,
} from './economy.ts';
import { fitGarrison, hqOf, knockOut } from './garrison.ts';
import { canSettle, captivesAtDawn, leftBehind, nabLeftBehind, settleCaptive } from './captives.ts';
import { nextRandom } from './rng.ts';
import { startFight, watchFights } from './fight.ts';
import { manorStewards } from './squeeze.ts';
import { footholdFor } from './fighters.ts';

let n = 0;
const fighter = (side: Side, weapon: WeaponId = 'fists', o: Partial<Fighter> = {}): Fighter => ({
  id: `${side}${n++}`, name: '', side, hp: 100, hit: WEAPONS[weapon].hit, chop: WEAPONS[weapon].chop, nerve: GUARD_BASE.nerve, armor: 0, weapon, ...o,
});
const many = (k: number, side: Side, weapon: WeaponId = 'fists', o: Partial<Fighter> = {}) => Array.from({ length: k }, () => fighter(side, weapon, o));
const fight = (o: Partial<BattleInput>): BattleInput =>
  ({ attackers: [], defenders: [], perimeter: 0, fenceHp: 0, gadgets: [], standHp: 0, objective: 'smash', detected: true, ...o });
const fenced = (tier: number) => ({ perimeter: tier, fenceHp: PERIMETERS[tier - 1].hp });
const guard = (o: Partial<Guard> = {}): Guard =>
  ({ id: `g${n++}`, name: 'Test', trait: 'Smooth Talker', level: 1, xp: 0, weapon: 'fists', gear: 'none', post: null, outUntil: 0, fee: 0, ...o });
const asGuard = (side: Side, weapon: WeaponId, gear: GearId = 'none', trait: Trait = 'Smooth Talker', night = false) =>
  guardFighter(guard({ weapon, gear, trait }), side, night);
const of = <T extends BattleEvent['type']>(events: BattleEvent[], type: T) => events.filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type);
const tough = { hp: 100000 }; // soaks everything, so the fight runs long enough to watch

describe('the fence line', () => {
  it('defenders hit 25% harder while any perimeter stands, and lose it at the breach', () => {
    const club = fighter('def', 'clubs', tough);
    const r = runBattle(fight({ attackers: [fighter('att', 'fists', { ...tough, chop: 100 })], defenders: [club], ...fenced(2) }), { seed: 1 });
    const breach = of(r.events, 'breach')[0].t;
    expect(breach).toBe(6); // 500 HP at 100 a chop: the 5th chop, at t = 6
    const swings = of(r.events, 'swing').filter((e) => e.a === club.id);
    expect(swings.filter((e) => e.t <= breach).map((e) => e.dmg)).toEqual([22.5, 22.5, 22.5, 22.5, 22.5]);
    expect(swings.filter((e) => e.t > breach).every((e) => e.dmg === 18)).toBe(true);
  });

  it('a Citrus Fortress Wall makes it +50% in all (added, not multiplied), and no perimeter gives none', () => {
    const wall = runBattle(fight({ attackers: [fighter('att', 'fists', tough)], defenders: [fighter('def', 'clubs', tough)], ...fenced(5) }), { seed: 1 });
    expect(of(wall.events, 'swing')[0].dmg).toBe(27);
    const open = runBattle(fight({ attackers: [fighter('att', 'fists', tough)], defenders: [fighter('def', 'clubs', tough)] }), { seed: 1 });
    expect(of(open.events, 'swing').filter((e) => e.a.startsWith('def')).every((e) => e.dmg === 18)).toBe(true);
  });

  it('it is the defending side that gets it, guards and henchmen alike, and traits stack on top', () => {
    // A Hothead guard: 18 x 1.15 x 1.25 = 25.9 at the fence.
    const rosa = asGuard('def', 'clubs', 'none', 'Hothead');
    const r = runBattle(fight({ attackers: [fighter('att', 'clubs', tough)], defenders: [{ ...rosa, ...tough }], ...fenced(1) }), { seed: 1 });
    expect(of(r.events, 'swing').find((e) => e.a === rosa.id)!.dmg).toBe(25.9);
    // The player's raiders at a rival fence get nothing extra; the henchmen behind it do.
    const raid = runBattle(fight({ attackers: [asGuard('att', 'clubs')], defenders: [fighter('def', 'clubs', tough)], ...fenced(1) }), { seed: 1 });
    expect(of(raid.events, 'swing').filter((e) => e.a.startsWith('def'))[0].dmg).toBe(22.5);
  });
});

describe('Nerve', () => {
  it('guards and henchmen start at 50; a Hothead has 30; Loyal adds nothing', () => {
    expect(GUARD_BASE.nerve).toBe(50);
    expect(asGuard('def', 'fists').nerve).toBe(50);
    expect(asGuard('def', 'fists', 'none', 'Loyal').nerve).toBe(50);
    const hot = asGuard('def', 'clubs', 'none', 'Hothead');
    expect(hot.nerve).toBe(30);
    expect(hot.hit).toBeCloseTo(18 * 1.15);
    const s = newGame(3);
    for (const rank of [1, 4, 7, 10]) {
      s.rank = rank;
      expect(raidPartyFor(s, 'blenders').every((f) => f.nerve === 50)).toBe(true);
    }
  });

  it('defenders roll their plain Nerve, with no hidden bonus', () => {
    let fled = 0;
    const runs = 600;
    for (let seed = 1; seed <= runs; seed++) {
      // One defender drops at the first swing; the other rolls Nerve 50.
      const r = runBattle(fight({ attackers: [fighter('att', 'fists', { ...tough, hit: 1000 })], defenders: [fighter('def'), fighter('def', 'fists', { hp: 1e9 })] }), { seed });
      if (r.fled.length) fled++;
    }
    expect(fled / runs).toBeGreaterThan(0.44);
    expect(fled / runs).toBeLessThan(0.56);
  });

  it('a side rolls once it has lost half its people, rounded down; a lone fighter never does', () => {
    // A one-hit wrecker knocks the defenders out one swing at a time; Nerve 0 always runs.
    const lostBeforeRunning = (size: number) => {
      const r = runBattle(fight({ attackers: [fighter('att', 'fists', { ...tough, hit: 1000 })], defenders: many(size, 'def', 'fists', { nerve: 0, hit: 0 }) }), { seed: 1 });
      const firstFlee = of(r.events, 'flee')[0];
      return firstFlee ? of(r.events, 'ko').filter((e) => e.t <= firstFlee.t).length : null;
    };
    expect(lostBeforeRunning(5)).toBe(2);
    expect(lostBeforeRunning(3)).toBe(1);
    expect(lostBeforeRunning(2)).toBe(1);
    expect(lostBeforeRunning(1)).toBeNull();
    // Each one left rolls once, and Nerve 100 always stands firm.
    const firm = runBattle(fight({ attackers: [fighter('att', 'fists', { ...tough, hit: 1000 })], defenders: many(5, 'def', 'fists', { nerve: 100, hit: 0 }) }), { seed: 1 });
    expect(firm.fled).toEqual([]);
  });

  it("a running fight tells the HUD where each side's one roll comes: half of it down, a late arrival moving the mark", () => {
    const f = createFight(fight({ attackers: many(6, 'att', 'fists', tough), defenders: [fighter('def', 'fists', tough)], joins: [{ t: 2, fighters: many(2, 'att', 'fists', tough) }] }), { seed: 1 });
    expect(f.status()).toMatchObject({ up: { att: 6, def: 1 }, of: { att: 6, def: 1 }, nerveAt: { att: 3, def: null } }); // a lone fighter never rolls
    f.advance(2);
    expect(f.status()).toMatchObject({ of: { att: 8, def: 1 }, nerveAt: { att: 4, def: null } });
    // Once a side has rolled, it never rolls again: no mark.
    const g = createFight(fight({ attackers: many(4, 'att', 'fists', { nerve: 100, hit: 0 }), defenders: [fighter('def', 'fists', { ...tough, hit: 1000 })] }), { seed: 1 });
    expect(g.status().nerveAt.att).toBe(2);
    while (!g.done() && g.status().up.att > 2) g.advance(g.time());
    expect(g.status()).toMatchObject({ up: { att: 2 }, of: { att: 4 }, nerveAt: { att: null } }); // Nerve 100 stood firm
  });

  it('the attackers roll the same way', () => {
    const r = runBattle(fight({ attackers: many(5, 'att', 'fists', { nerve: 0 }), defenders: [fighter('def', 'fists', { ...tough, hit: 1000 })], standHp: 100 }), { seed: 2 });
    expect(of(r.events, 'ko').length).toBe(2);
    expect(r.fled.length).toBe(3);
    expect(r.outcome).toBe('repelled');
  });
});

describe('Speed and positions', () => {
  it('Sprinters are 25% faster; the squad reaches the fence together, and the goose takes the first in line', () => {
    const pip = asGuard('att', 'clubs', 'none', 'Sprinter');
    expect(pip.speed).toBeCloseTo(COMBAT.speed * 1.25);
    expect(asGuard('att', 'clubs').speed).toBeCloseTo(COMBAT.speed);
    const squad = [asGuard('att', 'clubs'), asGuard('att', 'clubs'), pip];
    const r = runBattle(fight({ attackers: squad, ...fenced(1), gadgets: ['goose'], standHp: 100 }), { seed: 1 });
    expect(of(r.events, 'stun')).toEqual([{ t: 0, type: 'stun', a: squad[0].id, by: 'goose' }]);
    // Nobody walks in on the fight clock: every first chop comes at contact, but the stunned one's.
    const firstChop = (id: string) => of(r.events, 'chop').find((e) => e.a === id)!.t;
    expect(firstChop(squad[1].id)).toBe(0);
    expect(firstChop(pip.id)).toBe(0);
    expect(firstChop(squad[0].id)).toBe(3);
  });

  it('Speed counts inside the fight: a Sprinter gets to the till first', () => {
    const till = (trait: Trait) =>
      of(runBattle(fight({ attackers: [{ ...asGuard('att', 'clubs', 'none', trait), ...tough }], perimeter: 2, fenceHp: 5, standHp: 800, objective: 'shakedown' }), { seed: 1 }).events, 'grab')[0].t;
    expect(till('Sprinter')).toBeLessThan(till('Smooth Talker'));
  });

  it('every fighter has a position at contact, and walks in legs the replay can follow', () => {
    const squad = [asGuard('att', 'clubs'), asGuard('att', 'clubs', 'none', 'Sprinter')];
    const dex = asGuard('def', 'clubs');
    const r = runBattle(fight({ attackers: squad, defenders: [dex], ...fenced(1), standHp: 100 }), { seed: 1 });
    const at = of(r.events, 'at');
    expect(at.map((e) => e.a).sort()).toEqual([...squad, dex].map((f) => f.id).sort());
    expect(at.every((e) => e.t === 0)).toBe(true);
    expect(at.find((e) => e.a === dex.id)!.z).toBeLessThan(COMBAT.fenceAt); // behind the fence
    for (const f of squad) expect(at.find((e) => e.a === f.id)!.z).toBeCloseTo(COMBAT.fenceAt + COMBAT.reach / 4, 3); // at it, side by side
    expect(at.find((e) => e.a === squad[0].id)!.x).toBe(0); // the first in line takes the middle
    expect(at.every((e) => Number.isFinite(e.x) && Number.isFinite(e.z))).toBe(true);
    // Through the gap to the stand, each leg goes at its walker's Speed.
    const walk = runBattle(fight({ attackers: squad.map((f) => ({ ...f, ...tough })), perimeter: 2, fenceHp: 5, standHp: 800, objective: 'shakedown' }), { seed: 1 });
    const legs = of(walk.events, 'move');
    expect(legs.find((e) => e.a === squad[0].id)!.speed).toBeCloseTo(COMBAT.speed, 3);
    expect(legs.find((e) => e.a === squad[1].id)!.speed).toBeCloseTo(COMBAT.speed * 1.25, 3);
  });

  it('Barbed Wire tangles every raider crossing it at 70% of their Speed, cut or not, and never slows a swing', () => {
    // The same raider on the same 5 HP of fence: through cut wire, the walk to the till takes longer.
    const run = (tier: number) => runBattle(fight({ attackers: [fighter('att', 'clubs', tough)], perimeter: tier, fenceHp: 5, standHp: 800, objective: 'shakedown' }), { seed: 1 });
    const grab = (tier: number) => of(run(tier).events, 'grab')[0].t;
    expect(grab(4)).toBeGreaterThan(grab(2));
    const legs = of(run(4).events, 'move');
    expect(legs[0].speed).toBeCloseTo(COMBAT.speed * 0.7, 3); // in the wire
    expect(legs[1].speed).toBeCloseTo(COMBAT.speed, 3); // and out of it, the leg announced again
    expect(of(run(2).events, 'move').every((e) => Math.abs(e.speed - COMBAT.speed) < 1e-3)).toBe(true);
    // A rival's raiders all share one Speed, and the wire still holds them up.
    const party = (tier: number) => of(runBattle(fight({ attackers: many(4, 'att', 'clubs', tough), perimeter: tier, fenceHp: 5, standHp: 800, objective: 'shakedown' }), { seed: 1 }).events, 'grab')[0].t;
    expect(party(4)).toBeGreaterThan(party(2));
    // Five hatchets still breach 2,500 HP of wire on the full swing rate: 13 chops each, the last at t = 18.
    const r = runBattle(fight({ attackers: many(5, 'att', 'hatchets', { hp: 1000 }), ...fenced(4), standHp: 100 }), { seed: 1 });
    expect(of(r.events, 'breach')[0].t).toBe(18);
  });

  it('everyone swings at the nearest enemy', () => {
    // Behind the fence, the lone guard faces the raider in the middle, the first to arrive.
    const att = many(3, 'att', 'fists', { hp: 1000 });
    const r = runBattle(fight({ attackers: att, defenders: [fighter('def', 'fists', tough)], ...fenced(1), standHp: 100 }), { seed: 1 });
    const early = of(r.events, 'swing').filter((e) => e.a.startsWith('def') && e.t < 5);
    expect(new Set(early.map((e) => e.b))).toEqual(new Set([att[0].id]));
    // In the open, two raiders on two guards pair off rather than gang up.
    const two = many(2, 'def', 'fists', tough);
    const open = runBattle(fight({ attackers: many(2, 'att', 'fists', tough), defenders: two }), { seed: 1 });
    expect(new Set(of(open.events, 'swing').filter((e) => e.a.startsWith('att') && e.t === 0).map((e) => e.b)).size).toBe(2);
  });
});

describe('swings land for exactly Hit or Chop', () => {
  it('the first swing is at t = 0 and then one every 1.5 s, all for full damage', () => {
    const a = fighter('att', 'clubs', tough);
    const r = runBattle(fight({ attackers: [a], defenders: [fighter('def', 'fists', tough)] }), { seed: 1 });
    const mine = of(r.events, 'swing').filter((e) => e.a === a.id);
    expect(mine.slice(0, 4).map((e) => e.t)).toEqual([0, 1.5, 3, 4.5]);
    expect(mine.every((e) => e.dmg === 18)).toBe(true);
  });

  it('weapon checks: 5 hatchets breach 2,500 HP in about 19 s, 5 clubs in about 75 s', () => {
    const breach = (weapon: WeaponId) => of(runBattle(fight({ attackers: many(5, 'att', weapon), perimeter: 2, fenceHp: 2500, standHp: 100 }), { seed: 1 }).events, 'breach')[0].t;
    expect(Math.abs(breach('hatchets') - 18.75)).toBeLessThanOrEqual(1);
    expect(Math.abs(breach('clubs') - 75)).toBeLessThanOrEqual(1.5);
  });

  it('12 clubs cannot Smash a Citrus Palace inside the 60-minute timer; 12 hatchets do it in about 16 s', () => {
    const clubs = runBattle(fight({ attackers: many(12, 'att', 'clubs'), standHp: STAND_HP[4] }), { seed: 1 });
    expect(clubs.outcome).toBe('damaged');
    expect(clubs.standHpLeft).toBeGreaterThan(0);
    expect(clubs.duration).toBe(60);
    const hatchets = runBattle(fight({ attackers: many(12, 'att', 'hatchets'), standHp: STAND_HP[4] }), { seed: 1 });
    expect(hatchets.outcome).toBe('smashed');
    expect(Math.abs(hatchets.duration - 15.6)).toBeLessThanOrEqual(1);
  });

  it('four club guards with first strike chop a Picket Fence down at t = 3: three swings each, at 0, 1.5 and 3', () => {
    const squad = [asGuard('att', 'clubs', 'vest'), asGuard('att', 'clubs', 'vest', 'Hothead'), asGuard('att', 'clubs', 'vest', 'Tough Cookie'), asGuard('att', 'clubs', 'vest')];
    const r = runBattle(fight({ attackers: squad, ...fenced(1), standHp: 800, objective: 'shakedown', detected: false }), { seed: 1 });
    expect(of(r.events, 'breach')[0].t).toBe(3);
    expect(of(r.events, 'chop').filter((e) => e.t === 0).every((e) => e.dmg === 12.5)).toBe(true);
  });

  it('three club guards at 22.5 a hit put 135 into a 140-HP raider in 6 hits, leaving 5', () => {
    const pip = asGuard('att', 'clubs', 'vest');
    expect(pip.hp).toBe(140);
    const bros = many(3, 'def', 'clubs', tough);
    const r = runBattle(fight({ attackers: [pip], defenders: bros, perimeter: 1, fenceHp: 1e6, standHp: 100 }), { seed: 1 });
    const hits = of(r.events, 'swing').filter((e) => e.b === pip.id);
    expect(hits.slice(0, 6).every((e) => e.dmg === 22.5)).toBe(true);
    expect(140 - hits.slice(0, 6).reduce((a, e) => a + e.dmg, 0)).toBe(5);
    expect(hits.slice(0, 6).map((e) => e.t)).toEqual([0, 0, 0, 1.5, 1.5, 1.5]);
  });

  it('Day 24, the whole squad: the goose stuns Dex, first to the fence; the other four breach at t = 3; the Bros are down by 7.5 s', () => {
    // Dex (Loyal), Rosa (Hothead), Big Lou (Tough Cookie), Pip (Sprinter) and Marnie (Night Owl), clubs and vests, at
    // night with a first strike, against a Picket Fence, a Tin-Can Alarm, a Guard Goose and 3 club Bros.
    const names: [string, Trait][] = [['Dex', 'Loyal'], ['Rosa', 'Hothead'], ['Big Lou', 'Tough Cookie'], ['Pip', 'Sprinter'], ['Marnie', 'Night Owl']];
    const squad = names.map(([name, trait]) => guardFighter(guard({ name, trait, weapon: 'clubs', gear: 'vest' }), 'att', true));
    const bros = many(3, 'def', 'clubs');
    const lastDown = (seed: number) => {
      const r = runBattle(fight({ attackers: squad, defenders: bros, ...fenced(1), gadgets: ['alarm', 'goose'], standHp: STAND_HP[2], objective: 'shakedown', detected: false }), { seed });
      expect(of(r.events, 'stun')).toEqual([{ t: 0, type: 'stun', a: squad[0].id, by: 'goose' }]);
      expect(of(r.events, 'breach')[0].t).toBe(3);
      expect(r.outcome).toBe('robbed');
      return Math.max(...bros.map((b) => [...of(r.events, 'ko'), ...of(r.events, 'flee')].find((e) => e.a === b.id)?.t ?? Infinity));
    };
    expect(lastDown(1)).toBe(7.5); // two drop at 7.5 s, and the Nerve roll sends the third running, as in the walkthrough
    for (let seed = 2; seed <= 20; seed++) expect(lastDown(seed)).toBeLessThanOrEqual(9); // when he stands, he drops a swing later
  });

  it('with no dice to roll, every replay of a fight ends the same way', () => {
    const input = fight({ attackers: many(12, 'att', 'hatchets'), standHp: STAND_HP[4] });
    expect(winChance(input, 1, 50)).toBe(1);
    expect(winChance(fight({ attackers: many(12, 'att', 'clubs'), standHp: STAND_HP[4] }), 1, 50)).toBe(0);
    expect(JSON.stringify(runBattle(input, { seed: 4 }))).toBe(JSON.stringify(runBattle(input, { seed: 4 })));
  });
});

describe('perimeters', () => {
  it('HP is 150 / 500 / 1,200 / 2,500 / 5,000, the same table for every plot', () => {
    expect(PERIMETERS.map((p) => p.hp)).toEqual([150, 500, 1200, 2500, 5000]);
    expect(PERIMETERS.map((p) => p.cost)).toEqual([150, 1200, 6000, 25000, 100000]);
    expect(PERIMETERS.map((p) => p.rank)).toEqual([1, 2, 4, 6, 8]);
  });

  it('Stakes and Barbed Wire hurt raiders 2 and 4 HP a second while they stand; Pro Gear takes 20% off', () => {
    expect(PERIMETERS.map((p) => p.breachDps)).toEqual([0, 0, 2, 4, 0]);
    const koAt = (tier: number, armor = 0) => {
      const r = runBattle(fight({ attackers: [fighter('att', 'fists', { hp: 20, armor, chop: 0 })], perimeter: tier, fenceHp: 1e6, standHp: 100 }), { seed: 1 });
      return of(r.events, 'ko')[0];
    };
    expect(koAt(3)).toMatchObject({ t: 9.75, by: 'fence', weapon: 'fence' }); // 20 HP at 2 a second: down in the 40th quarter-second
    expect(koAt(4).t).toBe(4.75);
    expect(koAt(4, 0.2).t).toBe(6);
    expect(koAt(1)).toBeUndefined();
    expect(koAt(5)).toBeUndefined();
  });

  it('the damage stops the instant the perimeter falls', () => {
    const r = runBattle(fight({ attackers: [fighter('att', 'hatchets', { hp: 30 })], perimeter: 3, fenceHp: 120, standHp: 1e6 }), { seed: 1 });
    expect(of(r.events, 'breach')[0].t).toBe(3); // three 40-chops
    expect(r.koed).toEqual([]); // 3.25 s of stakes: 6.5 HP, then nothing
    expect(r.outcome).toBe('damaged');
  });
});

describe('gadgets and objectives', () => {
  it('a Sprinkler Ambush soaks every raider swing and chop, the stand included', () => {
    const r = runBattle(fight({ attackers: [fighter('att', 'clubs', tough)], ...fenced(1), gadgets: ['sprinkler'], standHp: 800 }), { seed: 1 });
    const chops = of(r.events, 'chop');
    expect(chops.some((e) => e.target === 'fence')).toBe(true);
    expect(chops.some((e) => e.target === 'stand')).toBe(true);
    expect(chops.every((e) => e.dmg === 8)).toBe(true);
    const brawl = runBattle(fight({ attackers: [fighter('att', 'clubs', tough)], defenders: [fighter('def', 'clubs', tough)], gadgets: ['sprinkler'] }), { seed: 1 });
    expect(of(brawl.events, 'swing').filter((e) => e.a.startsWith('att')).every((e) => e.dmg === 14.4)).toBe(true);
    expect(of(brawl.events, 'swing').filter((e) => e.a.startsWith('def')).every((e) => e.dmg === 18)).toBe(true); // defenders stay dry
  });

  it('the goose stuns the first raider for 3 s, and the next one too with a Goose Whisperer on the plot', () => {
    const goose = (defenders: Fighter[], gadgets: GadgetId[] = ['goose'], gooseStuns?: number) =>
      of(runBattle(fight({ attackers: many(4, 'att', 'fists', tough), defenders, ...fenced(1), gadgets, standHp: 100, gooseStuns }), { seed: 1 }).events, 'stun').filter((e) => e.by === 'goose');
    expect(goose([asGuard('def', 'fists')]).length).toBe(1);
    expect(goose([asGuard('def', 'fists', 'none', 'Goose Whisperer')]).length).toBe(2);
    expect(goose([asGuard('def', 'fists', 'none', 'Goose Whisperer')], [])).toEqual([]); // no goose, nothing to whisper to
    expect(goose([], ['goose'], 2).length).toBe(2); // Lottie's Tips: geese stun twice
    expect(goose([asGuard('def', 'fists', 'none', 'Goose Whisperer')], ['goose'], 5).length).toBe(2); // never more than twice
    // The slick trips the first three, for 4 s.
    const slick = of(runBattle(fight({ attackers: many(4, 'att', 'fists', tough), ...fenced(1), gadgets: ['slick'], standHp: 100 }), { seed: 1 }).events, 'stun');
    expect(slick.length).toBe(3);
  });

  it('a Goose Whisperer counts only while standing guard there (not KO\'d, not away on a raid)', () => {
    const s = setUpCorner(['goose']);
    const whisperer = guard({ trait: 'Goose Whisperer', post: LOTTIES_CORNER });
    s.guards.push(whisperer);
    const honks = () => of(fightRaid(s, rivalRaid(s), true).events, 'stun').filter((e) => e.by === 'goose').length;
    expect(honks()).toBe(2);
    whisperer.outUntil = s.day + 2;
    expect(honks()).toBe(1);
    whisperer.outUntil = 0;
    s.raids.push({ id: 'away', attacker: 'player', target: 'elsewhere', objective: 'smash', guards: [whisperer.id], detected: false, eta: '01:00' });
    expect(honks()).toBe(1);
  });

  it('at dawn, a Goose Whisperer out on tonight\'s raid is away from her post for the raid on it, whichever comes first', () => {
    for (const mineFirst of [true, false]) {
      const s = setUpCorner(['goose']);
      s.rank = 4;
      const wendy = guard({ name: 'Wendy', trait: 'Goose Whisperer', post: LOTTIES_CORNER, weapon: 'clubs' });
      const rosa = guard({ name: 'Rosa', trait: 'Hothead', post: LOTTIES_CORNER });
      s.guards.push(wendy, rosa);
      const target = raidTargets(s)[0].id;
      s.plots[target].garrison = 0; // nobody home there: she robs it and walks out on her feet
      s.plots[target].defense = { tier: 0, fenceHp: 0, gadgets: [] };
      const mine: Raid = { id: 'mine', attacker: 'player', target, objective: 'shakedown', guards: [wendy.id], detected: false, eta: mineFirst ? '23:00' : '03:00' };
      const theirs = { ...rivalRaid(s), eta: '01:00' };
      s.raids = [mine, theirs];
      resolveNight(s);
      const corner = s.battles.find((b) => b.target === LOTTIES_CORNER)!;
      expect(corner.defenders.map((d) => d.name)).toEqual(['Rosa']);
      expect(of(corner.events, 'stun').filter((e) => e.by === 'goose')).toHaveLength(1);
      expect(s.battles.find((b) => b.target === target)).toMatchObject({ outcome: 'robbed', koed: [] });
      expect(s.battles.find((b) => b.target === target)!.attackers.map((a) => a.name)).toEqual(['Wendy']);
      expect(s.raids).toEqual([]);
    }
  });

  it('a Shakedown takes 10 game minutes at the till, with no defender standing', () => {
    const r = runBattle(fight({ attackers: many(3, 'att'), standHp: 800, objective: 'shakedown' }), { seed: 1 });
    expect(r.outcome).toBe('robbed');
    const grab = of(r.events, 'grab')[0];
    expect(r.duration - grab.t).toBe(10);
    expect(COMBAT.grabMinutes).toBe(10);
  });

  it('the Smash timer counts from the objective, not from contact', () => {
    // 12 clubs take 61.5 s on a Palace; behind a 1,000-HP fence that takes 13.5 s more, they still get their full 60 minutes on it.
    const r = runBattle(fight({ attackers: many(12, 'att', 'clubs'), perimeter: 2, fenceHp: 1000, standHp: STAND_HP[4] }), { seed: 1 });
    const breach = of(r.events, 'breach')[0].t;
    expect(breach).toBe(12);
    const standChops = of(r.events, 'chop').filter((e) => e.target === 'stand');
    expect(standChops[standChops.length - 1].t).toBeLessThan(breach + 60.25);
    expect(standChops[standChops.length - 1].t).toBeGreaterThan(breach + 55);
    expect(r.outcome).toBe('damaged');
  });

  it('raiders who can\'t get through go home after two game hours', () => {
    const r = runBattle(fight({ attackers: many(2, 'att'), ...fenced(5), standHp: 100 }), { seed: 1 });
    expect(r.outcome).toBe('repelled');
    expect(r.duration).toBe(COMBAT.giveUpSeconds);
  });

  it('first strike: an undetected raid deals +25% for the first 5 s, on swings, fence chops and stand chops', () => {
    const chops = (detected: boolean) => of(runBattle(fight({ attackers: [fighter('att', 'clubs', tough)], perimeter: 1, fenceHp: 20, standHp: 800, detected }), { seed: 1 }).events, 'chop');
    const sneaky = chops(false);
    // Two chops break the 20-HP fence (t = 0, 1.5), a short walk, then the stand at t = 3 and 4.5.
    expect(sneaky.filter((e) => e.t < 5).map((e) => [e.t, e.target, e.dmg])).toEqual([[0, 'fence', 12.5], [1.5, 'fence', 12.5], [3, 'stand', 12.5], [4.5, 'stand', 12.5]]);
    expect(sneaky.filter((e) => e.t >= 5).every((e) => e.dmg === 10)).toBe(true);
    expect(chops(true).every((e) => e.dmg === 10)).toBe(true);
    const swings = of(runBattle(fight({ attackers: [fighter('att', 'clubs', tough)], defenders: [fighter('def', 'fists', tough)], detected: false }), { seed: 1 }).events, 'swing').filter((e) => e.a.startsWith('att'));
    expect(swings.map((e) => e.dmg).slice(0, 5)).toEqual([22.5, 22.5, 22.5, 22.5, 18]);
  });
});

describe('knockouts', () => {
  it('a KO names the blow that landed it: the striker and their weapon, or the fence', () => {
    const r = runBattle(fight({ attackers: [fighter('att', 'hatchets', { hp: 1000 })], defenders: [fighter('def', 'fists', { hp: 40 }), fighter('def', 'clubs', { hp: 40 })] }), { seed: 1 });
    for (const ko of of(r.events, 'ko')) {
      expect(ko.weapon).toBe('hatchets');
      expect(ko.by).toMatch(/^att/);
    }
    expect(r.hatchetKos).toEqual(r.koed);
  });

  it('guards are Out 2 days only when a hatchet landed the knockout blow', () => {
    const s = newGame(1);
    const a = guard(), b = guard();
    s.guards.push(a, b);
    const input = fight({ attackers: [fighter('att', 'hatchets'), fighter('att', 'clubs')], defenders: [guardFighter(a, 'def', true), guardFighter(b, 'def', true)] });
    creditGuards(s, input, { koed: [a.id, b.id], hatchetKos: [a.id], winner: 'att' });
    expect(a.outUntil).toBe(s.day + 3); // Out 2 days
    expect(b.outUntil).toBe(s.day + 2); // a club did it: Out 1 day, hatchets or not on their side
  });

  it('stakes and wire are never a hatchet KO', () => {
    const r = runBattle(fight({ attackers: [fighter('att', 'hatchets', { hp: 10, chop: 0 })], defenders: [fighter('def', 'hatchets', { hp: 1000, hit: 0 })], ...fenced(4), standHp: 100 }), { seed: 1 });
    expect(r.koed.length).toBe(1);
    expect(r.hatchetKos).toEqual([]);
  });
});

describe('Butterfingers', () => {
  it('drops the weapon in about 1 fight in 10, then finishes on fists', () => {
    let drops = 0;
    const runs = 1000;
    for (let seed = 1; seed <= runs; seed++) {
      const g = asGuard('att', 'clubs', 'none', 'Butterfingers');
      const r = runBattle(fight({ attackers: [{ ...g, ...tough }], defenders: [fighter('def', 'fists', tough)] }), { seed });
      const drop = of(r.events, 'drop')[0];
      if (!drop) continue;
      drops++;
      const swings = of(r.events, 'swing').filter((e) => e.a === g.id);
      expect(swings.filter((e) => e.t < drop.t).every((e) => e.dmg === 18)).toBe(true);
      expect(swings.filter((e) => e.t >= drop.t).every((e) => e.dmg === 10)).toBe(true);
      expect(drop.t).toBeLessThanOrEqual(3); // on one of the first three swings
    }
    expect(drops / runs).toBeGreaterThan(0.075);
    expect(drops / runs).toBeLessThan(0.125);
  });

  it('fists keep the level and trait scaling, nobody else drops anything, and the weapon is still theirs after', () => {
    const g = guard({ trait: 'Butterfingers', weapon: 'hatchets', level: 3 });
    let seen = false;
    for (let seed = 1; seed <= 300 && !seen; seed++) {
      const f = guardFighter(g, 'att', false);
      const r = runBattle(fight({ attackers: [{ ...f, ...tough }], defenders: [fighter('def', 'fists', tough)] }), { seed });
      const drop = of(r.events, 'drop')[0];
      if (!drop) continue;
      seen = true;
      const after = of(r.events, 'swing').filter((e) => e.a === f.id && e.t >= drop.t);
      expect(after[0].dmg).toBe(12); // fists 10 x 1.2 at level 3
    }
    expect(seen).toBe(true);
    expect(g.weapon).toBe('hatchets');
    const plain = runBattle(fight({ attackers: many(3, 'att', 'clubs', tough), defenders: [fighter('def', 'fists', tough)] }), { seed: 5 });
    expect(of(plain.events, 'drop')).toEqual([]);
  });
});

describe('the Raid Planner\'s odds', () => {
  /** A rival Kiosk with a Picket Fence and 3 henchmen whose weapons are drawn fresh each fight (most fists, some clubs). */
  function kiosk() {
    const s = newGame(24);
    s.rank = 4;
    const id = raidTargets(s).find((p) => s.plots[p.id].stand)!.id;
    const ps = s.plots[id];
    ps.stand!.level = 2;
    ps.defense = { tier: 1, fenceHp: PERIMETERS[0].hp, gadgets: ['alarm'] };
    ps.garrison = 3;
    s.guards = [guard({ weapon: 'clubs' }), guard({ weapon: 'clubs' }), guard(), guard()];
    footholdFor(s, id); // crew: raids need a Foothold in the target's district
    return { s, id, ids: s.guards.map((g) => g.id) };
  }

  it('land near what the raid wins when it\'s fought: each run draws its own garrison, detection roll and help', () => {
    const { s, id, ids } = kiosk();
    const odds = raidOdds(s, id, ids, 'shakedown', true);
    const trip = squadTrip(s, id, 'tonight'); // set out at 01:00, there after the walk: a spotted raid meets the help sent
    let won = 0;
    const runs = 300;
    for (let seed = 1; seed <= runs; seed++) {
      const t = JSON.parse(JSON.stringify(s)) as GameState;
      t.seed = seed;
      const raid: Raid = { id: `r${seed}`, attacker: 'player', target: id, objective: 'shakedown', guards: ids, detected: false, eta: hhmm(trip.at), leave: trip.leave, at: trip.at };
      if (fightRaid(t, raid, true).outcome === 'robbed') won++;
    }
    expect(Math.abs(odds - won / runs)).toBeLessThanOrEqual(0.1);
    expect(odds).toBeGreaterThan(0.05);
    expect(odds).toBeLessThan(0.95);
  });

  it('read the same from day to day, and leave the game\'s dice and ids alone', () => {
    const { s, id, ids } = kiosk();
    const seed = s.seed, nextId = s.nextId;
    const odds = raidOdds(s, id, ids, 'shakedown', true);
    expect(s.seed).toBe(seed);
    expect(s.nextId).toBe(nextId);
    s.day++;
    s.seed = 12345;
    expect(raidOdds(s, id, ids, 'shakedown', true)).toBe(odds);
  });

  it('a plot with a raid of yours playing live there is already planned', () => {
    const { s, id, ids } = kiosk();
    expect(canRaid(s, id, ids.slice(2)).ok).toBe(true);
    s.fight = { id: 'f1', raid: { id: 'live', attacker: 'player', target: id, objective: 'shakedown', guards: ids.slice(0, 2), detected: false, eta: '' }, night: false, input: fight({}), seed: 1, t: 0, ticked: 0, commands: [], side: 'att' };
    expect(canRaid(s, id, ids.slice(2))).toEqual({ ok: false, why: 'Already planned' });
  });
});

describe('HQ assaults', () => {
  /** A Weakened rival, and a crew of k guards to storm its HQ. */
  function hqGame(id: RivalId, k: number, weapon: WeaponId, gear: GearId, level: number, seed = 1): GameState {
    const s = newGame(seed);
    s.rank = 10;
    s.cash = 1e9;
    s.day = 78; // after the County Fair: Tilly can be stormed
    for (const p of ownedPlots(s, id).filter((p) => p.type !== 'hq').slice(1)) s.plots[p.id] = { ...s.plots[p.id], owner: null, stand: null };
    if (id === 'sourwood') s.squeeze = { called: s.day - 7, nights: 7, held: 0, lost: 0, done: s.day }; // the campaign opens the Manor with the Big Squeeze
    s.guards = Array.from({ length: k }, () => guard({ weapon, gear, level }));
    return s;
  }
  /** What a fighter had left at the end of a stage, from its report: every swing that landed on them, less padding. */
  const hpAfter = (r: BattleReport, id: string) => {
    const f = r.attackers.find((x) => x.id === id)!;
    return f.hp - of(r.events, 'swing').filter((e) => e.b === id).reduce((a, e) => a + e.dmg, 0) * (1 - f.armor);
  };

  it('the squad carries its real HP from stage to stage; the knocked-out and the runners stay out', () => {
    let carried = 0, dropped = 0;
    const runs: [RivalId, number, WeaponId, GearId, number][] = [['blenders', 5, 'clubs', 'none', 2], ['sourwood', 12, 'hatchets', 'pro', 4]];
    for (const [id, k, weapon, gear, level] of runs) for (const seed of [1, 2, 3]) {
      const s = hqGame(id, k, weapon, gear, level, seed);
      const r = stormHQ(s, id, s.guards.map((g) => g.id));
      if (!r) throw new Error('no assault');
      for (let i = 0; i + 1 < r.reports.length; i++) {
        const [was, next] = [r.reports[i], r.reports[i + 1]];
        const fit = was.attackers.filter((f) => !was.koed.includes(f.id) && !was.fled.includes(f.id));
        expect(next.attackers.map((f) => f.id)).toEqual(fit.map((f) => f.id));
        dropped += was.attackers.length - fit.length;
        for (const f of next.attackers) {
          expect(f.hp).toBeCloseTo(hpAfter(was, f.id), 6);
          if (f.hp < was.attackers.find((x) => x.id === f.id)!.hp) carried++;
        }
      }
    }
    expect(carried).toBeGreaterThan(0); // bruised guards walk into the next room bruised
    expect(dropped).toBeGreaterThan(0);
  });

  it('every fight reports what each fighter has left, and the survivors take exactly that on', () => {
    const club = fighter('def', 'clubs', { ...tough, nerve: 1000 });
    const [a, b] = many(2, 'att', 'fists', { hp: 2000 });
    const res = runBattle(fight({ attackers: [a, b], defenders: [club], objective: 'shakedown' }), { seed: 1 });
    const taken = (id: string) => of(res.events, 'swing').filter((e) => e.b === id).length * WEAPONS.clubs.hit;
    expect(taken(a.id)).toBeGreaterThan(0);
    expect(res.hpLeft[a.id]).toBe(2000 - taken(a.id));
    expect(res.hpLeft[club.id]).toBe(tough.hp - of(res.events, 'swing').filter((e) => e.b === club.id).reduce((x, e) => x + e.dmg, 0));
    const next = hqSurvivors(fight({ attackers: [a, b] }), { ...res, koed: [b.id] });
    expect(next).toEqual([{ ...a, hp: res.hpLeft[a.id] }]);
  });

  it('the Boss Room brings the boss and their move, timed, and nothing happens to the squad before the fight', () => {
    const want: Partial<Record<RivalId, string[]>> = { blenders: ['rush'], coldbrew: ['espresso'], hollis: ['bales'], fizzco: ['takeover'], sourwood: ['cane', 'call'] }; // the Out-of-Towner has no HQ
    for (const id of Object.keys(want) as RivalId[]) {
      const s = hqGame(id, 6, 'clubs', 'vest', 3);
      const squad = hqSquad(s, id, s.guards.map((g) => g.id));
      const input = hqStageInput(s, id, 'boss', squad, { seed: 5 });
      const boss = input.defenders[0];
      expect(boss.id).toContain('-boss-');
      expect(input.bossMoves!.map((m) => m.type)).toEqual(want[id]);
      expect(input.bossMoves!.every((m) => m.by === boss.id && m.t >= 0)).toBe(true);
      expect(input.attackers).toEqual(squad);
      expect(input.defenders).toHaveLength(1 + 1 + Math.ceil(HQS[id].tier / 2));
      expect(input.perimeter).toBe(0);
    }
    const s = hqGame('sourwood', 6, 'clubs', 'vest', 3);
    const vera = hqStageInput(s, 'sourwood', 'boss', hqSquad(s, 'sourwood', s.guards.map((g) => g.id)), { seed: 5 });
    const call = vera.bossMoves!.find((m) => m.type === 'call')!;
    expect(call.type === 'call' && call.fighters.length).toBe(manorStewards(s, 'sourwood')); // nights' count: 3, more after a siege
    expect(call.t).toBe(BOSS_MOVES.sourwood.at);
  });

  it('Blender Rush: Brock knocks the 3 guards nearest him flat for 4 seconds', () => {
    const brock = fighter('def', 'clubs', { ...tough, id: 'brock', nerve: 1000 });
    const squad = many(5, 'att', 'clubs', tough);
    const r = runBattle(fight({ attackers: squad, defenders: [brock], objective: 'shakedown', bossMoves: [{ t: 0, by: 'brock', type: 'rush', count: 3, stun: 4 }] }), { seed: 1 });
    expect(of(r.events, 'boss')).toEqual([{ t: 0, type: 'boss', a: 'brock', move: 'rush' }]);
    const flat = of(r.events, 'stun').filter((e) => e.by === 'rush').map((e) => e.a);
    expect(flat).toEqual(squad.slice(0, 3).map((f) => f.id)); // the middle of the line and the two beside it
    for (const f of squad) {
      const first = of(r.events, 'swing').find((e) => e.a === f.id)!.t;
      if (flat.includes(f.id)) expect(first).toBe(4);
      else expect(first).toBeLessThan(1); // the two on the ends step in and swing
    }
  });

  it('Espresso Shot: the crew swings every second instead of every 1.5 for 10 seconds', () => {
    const juni = fighter('def', 'clubs', { ...tough, id: 'juni', nerve: 1000 });
    const barista = fighter('def', 'clubs', { ...tough, nerve: 1000 });
    const r = runBattle(fight({
      attackers: many(2, 'att', 'fists', tough), defenders: [juni, barista], objective: 'shakedown',
      bossMoves: [{ t: 3, by: 'juni', type: 'espresso', seconds: 10, boost: 0.5 }],
    }), { seed: 1 });
    const times = of(r.events, 'swing').filter((e) => e.a === barista.id && e.t < 20).map((e) => e.t);
    expect(times).toEqual([0, 1.5, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14.5, 16, 17.5, 19]);
    // the raiders keep their pace
    expect(of(r.events, 'swing').filter((e) => e.a.startsWith('att') && e.t < 6).map((e) => e.t)).toEqual([0, 0, 1.5, 1.5, 3, 3, 4.5, 4.5]);
  });

  it('Hay Bale Wall: the guard nearest Tilly chops through a bale before swinging at anyone, while she swings over it', () => {
    const tilly = fighter('def', 'clubs', { ...tough, id: 'tilly', nerve: 1000 });
    const squad = many(2, 'att', 'hatchets', tough);
    const walled = squad[0].id;
    const r = runBattle(fight({ attackers: squad, defenders: [tilly], objective: 'shakedown', bossMoves: [{ t: 0, by: 'tilly', type: 'bales', count: 1, hp: 100 }] }), { seed: 1 });
    expect(of(r.events, 'bale')).toEqual([{ t: 0, type: 'bale', a: walled, hp: 100 }, { t: 3, type: 'bale', a: walled, hp: 0 }]);
    expect(of(r.events, 'chop').filter((e) => e.target === 'bale').map((e) => [e.a, e.t, e.dmg])).toEqual([[walled, 0, 40], [walled, 1.5, 40], [walled, 3, 40]]);
    expect(of(r.events, 'swing').find((e) => e.a === walled)!.t).toBe(4.5);
    expect(of(r.events, 'swing').find((e) => e.a === squad[1].id)!.t).toBe(0);
    expect(of(r.events, 'swing').some((e) => e.a === 'tilly' && e.b === walled && e.t < 3)).toBe(true);
  });

  it('Hostile Takeover: mid-fight, 2 guards switch sides and turn on their old crew, but never a Loyal one', () => {
    const preston = fighter('def', 'clubs', { ...tough, id: 'preston', nerve: 1000 });
    const squad = [fighter('att', 'clubs', { ...tough, trait: 'Loyal' }), ...many(4, 'att', 'clubs', tough)];
    const r = runBattle(fight({ attackers: squad, defenders: [preston], objective: 'shakedown', bossMoves: [{ t: 6, by: 'preston', type: 'takeover', count: 2 }] }), { seed: 1 });
    const turned = of(r.events, 'turn');
    expect(turned.map((e) => [e.t, e.side])).toEqual([[6, 'def'], [6, 'def']]);
    const ids = turned.map((e) => e.a);
    expect(ids).not.toContain(squad[0].id);
    const mine = squad.map((f) => f.id).filter((id) => !ids.includes(id));
    for (const id of ids) {
      const swings = of(r.events, 'swing').filter((e) => e.a === id);
      expect(swings.filter((e) => e.t < 6).every((e) => e.b === 'preston')).toBe(true);
      expect(swings.filter((e) => e.t >= 6).every((e) => mine.includes(e.b))).toBe(true);
      expect(swings.some((e) => e.t >= 6)).toBe(true);
    }
    expect(of(r.events, 'swing').some((e) => mine.includes(e.a) && ids.includes(e.b))).toBe(true);
  });

  it('Old Money: the cane knocks the nearest guard\'s weapon away, and the Stewards come in mid-fight', () => {
    const vera = fighter('def', 'clubs', { ...tough, id: 'vera', nerve: 1000 });
    const stewards = many(2, 'def', 'clubs', { ...tough, nerve: 1000 });
    const squad = many(3, 'att', 'hatchets', tough);
    const r = runBattle(fight({
      attackers: squad, defenders: [vera], objective: 'shakedown',
      bossMoves: [{ t: 3, by: 'vera', type: 'cane' }, { t: 6, by: 'vera', type: 'call', fighters: stewards }],
    }), { seed: 1 });
    expect(of(r.events, 'boss').map((e) => [e.t, e.move])).toEqual([[3, 'cane'], [6, 'call']]);
    const drop = of(r.events, 'drop');
    expect(drop.map((e) => e.t)).toEqual([3]);
    const swings = of(r.events, 'swing').filter((e) => e.a === drop[0].a);
    expect(swings.filter((e) => e.t < 3).every((e) => e.dmg === WEAPONS.hatchets.hit)).toBe(true);
    expect(swings.filter((e) => e.t >= 3).every((e) => e.dmg === WEAPONS.fists.hit)).toBe(true);
    expect(of(r.events, 'at').filter((e) => e.t === 6).map((e) => e.a)).toEqual(stewards.map((f) => f.id));
    const theirs = of(r.events, 'swing').filter((e) => stewards.some((f) => f.id === e.a));
    expect(theirs.length).toBeGreaterThan(0);
    expect(theirs.every((e) => e.t >= 6)).toBe(true);
  });

  it('a boss knocked out before their move never makes it', () => {
    const brock = fighter('def', 'clubs', { id: 'brock', hp: 10, nerve: 1000 });
    const r = runBattle(fight({
      attackers: many(3, 'att', 'hatchets', tough), defenders: [brock, fighter('def', 'fists', { ...tough, nerve: 1000 })], objective: 'shakedown',
      bossMoves: [{ t: 3, by: 'brock', type: 'rush', count: 3, stun: 4 }],
    }), { seed: 1 });
    expect(of(r.events, 'ko').find((e) => e.a === 'brock')!.t).toBeLessThan(3);
    expect(of(r.events, 'boss')).toEqual([]);
    expect(of(r.events, 'stun')).toEqual([]);
  });

  it('at FizzCo Tower Preston turns 2 guards who aren\'t Loyal, and an all-Loyal squad stays together', () => {
    const turns = (loyal: boolean) => {
      let n = 0, wrong = 0;
      for (const seed of [1, 2, 3, 4, 5]) {
        const s = hqGame('fizzco', 12, 'hatchets', 'pro', 4, seed);
        s.guards.forEach((g, i) => { g.trait = loyal || i % 2 ? 'Loyal' : 'Smooth Talker'; });
        const r = stormHQ(s, 'fizzco', s.guards.map((g) => g.id));
        const room = r ? r.reports.find((x) => x.hq === 'boss') : undefined;
        for (const e of room ? of(room.events, 'turn') : []) { n++; if (s.guards.find((g) => g.id === e.a)!.trait === 'Loyal') wrong++; }
      }
      return { n, wrong };
    };
    const mixed = turns(false);
    expect(mixed.n).toBeGreaterThan(0);
    expect(mixed.wrong).toBe(0);
    expect(turns(true).n).toBe(0);
  });

  it('the Manor the Big Squeeze left: the Gate at its HP, Yard elites benched, and Old Money calls in the Stewards it added', () => {
    const s = hqGame('sourwood', 12, 'hatchets', 'pro', 5);
    const squad = hqSquad(s, 'sourwood', s.guards.map((g) => g.id));
    const rng = { seed: 9 };
    expect(hqStageInput(s, 'sourwood', 'gate', squad, rng).standHp).toBe(HQS.sourwood.gate);
    s.squeeze = { ...s.squeeze, held: 7, lost: 2 }; // seven nights held, two plots lost
    expect(hqStageInput(s, 'sourwood', 'gate', squad, rng).standHp).toBe(1500);
    expect(hqStageInput(s, 'sourwood', 'yard', squad, rng).defenders).toHaveLength(HQS.sourwood.yard - 7);
    const room = hqStageInput(s, 'sourwood', 'boss', squad, rng);
    expect(room.defenders).toHaveLength(1 + 1 + Math.ceil(HQS.sourwood.tier / 2)); // Vera and her bodyguards at the start
    const call = room.bossMoves!.find((m) => m.type === 'call')!;
    expect(call.type === 'call' && call.fighters.length).toBe(3 + 2);
    // The report names the Stewards who came in among the room's defenders.
    const res = runBattle(room, { seed: 4 });
    const came = call.type === 'call' ? call.fighters.filter((f) => res.events.some((e) => e.type === 'at' && e.a === f.id)) : [];
    const reports: BattleReport[] = [];
    hqStageOver(s, 'sourwood', 'boss', room, res, reports);
    expect(came.length).toBeGreaterThan(0);
    expect(reports[0].defenders).toEqual([...room.defenders, ...came]);
  });
});

describe('rival henchmen after a fight', () => {
  /** A Blenders stand holding `garrison`, and a squad of `k` kitted Legends to raid it. */
  function blenders(seed: number, garrison: number, k = 5) {
    const s = newGame(seed);
    s.rank = 6;
    const plot = ownedPlots(s, 'blenders').find((p) => s.plots[p.id].stand && p.type !== 'hq')!.id;
    Object.assign(s.plots[plot], { garrison, defense: { tier: 0, fenceHp: 0, gadgets: [] } });
    s.guards = Array.from({ length: k }, () => guard({ weapon: 'hatchets', gear: 'pro', level: 5 }));
    const raid = (objective: 'smash' | 'shakedown'): Raid => ({ id: `r${s.nextId++}`, attacker: 'player', target: plot, objective, guards: s.guards.map((g) => g.id), detected: false, eta: '' });
    return { s, plot, raid };
  }

  it("knocked out defending their plot, they're Out a day (two after a hatchet KO), then back on guard", () => {
    const { s, plot } = blenders(1, 4);
    knockOut(s, plot, ['a', 'b', 'c'], ['c']);
    expect(s.plots[plot].garrison).toBe(4); // still on its books
    const fit = () => fitGarrison(s, plot);
    expect(fit()).toBe(1);
    s.day++;
    expect(fit()).toBe(1); // the next day: all three seeing stars
    s.day++;
    expect(fit()).toBe(3); // a day out, and back
    s.day++;
    expect(fit()).toBe(4); // two after the hatchet
    knockOut(s, plot, ['d']);
    expect(s.plots[plot].garrisonOut).toEqual([{ n: 1, back: s.day + 2 }]); // the fit drop off the list
  });

  it('the next raid meets only the fit ones, and a fight costs the rival nobody for good', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { s, plot, raid } = blenders(seed, 3, 2);
      s.plots[plot].stand!.level = 3; // 3 guard posts (crew's postsFor): the whole garrison stands guard
      const b = fightRaid(s, raid('shakedown'), true);
      const ko = b.koed.filter((id) => b.defenders.some((f) => f.id === id)).length;
      if (!ko) continue;
      expect(s.plots[plot].garrison).toBe(3);
      expect(raidInput(s, raid('shakedown'), true, { seed: 9 }).defenders).toHaveLength(3 - ko);
      s.day += 3;
      expect(raidInput(s, raid('shakedown'), true, { seed: 9 }).defenders).toHaveLength(3);
      return;
    }
    throw new Error('nobody knocked out');
  });

  it('a smash scatters nobody: they stay on the plot, and if it lapses they go home to their HQ', () => {
    const { s, plot, raid } = blenders(2, 3, 6);
    const b = fightRaid(s, raid('smash'), true);
    expect(b.outcome).toBe('smashed');
    expect(s.plots[plot].garrison).toBe(3);
    const hq = hqPlot('blenders').id;
    const before = s.plots[hq].garrison ?? 0;
    s.rivals.blenders.cash = 0; // can't rebuild: it lapses at dawn
    s.day++;
    crewAtDawn(s);
    expect(s.plots[plot].owner).toBeNull();
    expect(s.plots[hq].garrison).toBe(before + 3);
    expect(fitGarrison(s, hq)).toBe(before + 3 - b.koed.filter((id) => b.defenders.some((f) => f.id === id)).length);
  });
});

describe('the Nabbed', () => {
  /** The first seed from which the next k rolls all nab. */
  const nabbing = (k = 1) => { for (let x = 1; ; x++) { const r = { seed: x }; if (Array.from({ length: k }, () => nextRandom(r)).every((v) => v < NABBED.chance)) return x; } };
  /** Rank 4, Day 30, and these guards on the crew. */
  function crewOf(...names: [string, Trait?][]) {
    const s = newGame(5);
    s.rank = 4;
    s.cash = 5000;
    s.day = 30;
    s.guards = names.map(([name, trait]) => guard({ name, trait: trait ?? 'Smooth Talker', level: 2 }));
    return s;
  }
  const clone = (s: GameState) => JSON.parse(JSON.stringify(s)) as GameState;

  it("a beaten raid leaves its KO'd behind; winners, a raid that holds the field and one that Falls Back carry theirs home", () => {
    const party = many(3, 'att');
    const koed = party.slice(0, 2).map((f) => f.id);
    expect(leftBehind(party, { outcome: 'repelled', koed }).map((f) => f.id)).toEqual(koed);
    for (const outcome of ['smashed', 'robbed', 'damaged'] as const) expect(leftBehind(party, { outcome, koed })).toEqual([]);
    // A real Fall Back: one raider is down when the rest turn for home, and they carry him.
    const weak = fighter('att', 'fists', { hp: 20 });
    const input = fight({ attackers: [weak, ...many(2, 'att', 'fists', tough)], defenders: many(2, 'def', 'clubs', tough), standHp: STAND_HP[0] });
    const res = runBattle(input, { seed: 3 }, [{ t: 8, type: 'fallBack', side: 'att' }]);
    expect(res).toMatchObject({ outcome: 'repelled', fellBack: 'att' });
    expect(res.koed).toContain(weak.id);
    expect(leftBehind(input.attackers, res)).toEqual([]);
  });

  it('a beaten boss-led raid never nabs the boss: he always gets away, his crew carrying him off', () => {
    const s = crewOf(['Pip Quill']);
    const boss = raidBoss(s, 'blenders');
    expect(boss.boss).toBe(true);
    const bro = fighter('att', 'fists', { level: 1 });
    const left = leftBehind([boss, bro], { outcome: 'repelled', koed: [boss.id, bro.id] });
    expect(left).toEqual([bro]);
    s.seed = nabbing(); // the roll lands
    expect(nabLeftBehind(s, 'blenders', 'player', left, LOTTIES_CORNER).map((c) => c.guard!.level)).toEqual([1]);
    // Fought for real: Brock leads Level 1 Bros into three Legends, and goes down. Bros are Nabbed now and then; Brock never.
    let beaten = 0, nabbed = 0;
    for (let seed = 1; beaten < 30 && seed < 400; seed++) {
      const t = crewOf(['Pip Quill'], ['Rosa Vance'], ['Tank Brickman']);
      t.seed = seed;
      for (const g of t.guards) Object.assign(g, { level: 5, weapon: 'hatchets', gear: 'pro', post: LOTTIES_CORNER });
      const lead = raidBoss(t, 'blenders');
      const raid: Raid = { id: 'rb', attacker: 'blenders', target: LOTTIES_CORNER, objective: 'smash', party: [lead, ...many(3, 'att', 'fists', { level: 1 })], detected: true, eta: '23:00' };
      const report = fightRaid(t, raid, true);
      if (report.outcome !== 'repelled' || !report.koed.includes(lead.id)) continue;
      beaten++;
      nabbed += t.captives?.length ?? 0;
      expect((t.captives ?? []).map((c) => c.guard!.level).filter((l) => l !== 1)).toEqual([]);
    }
    expect(beaten).toBe(30);
    expect(nabbed).toBeGreaterThan(0);
  });

  it('each one left behind is Nabbed on a 10% roll, both ways, and never in a fight between rivals', () => {
    const s = crewOf(['Pip Quill']);
    const bros = many(400, 'att', 'fists', { level: 2 });
    const got = nabLeftBehind(s, 'blenders', 'player', bros, LOTTIES_CORNER);
    expect(got.length / 400).toBeGreaterThan(NABBED.chance - 0.04);
    expect(got.length / 400).toBeLessThan(NABBED.chance + 0.04);
    expect(s.captives).toEqual(got);
    expect(got.every((c) => c.from === 'blenders' && c.by === 'player' && c.guard!.level === 2)).toBe(true);
    const seed = s.seed;
    expect(nabLeftBehind(s, 'blenders', 'hollis', bros, LOTTIES_CORNER)).toEqual([]); // rival against rival: nobody holds anybody
    expect(s.seed).toBe(seed);
  });

  it('a raider you nab: their side pays their hire fee, you let them go for +0.05 star, or they join you as a Former Rival', () => {
    const s = crewOf(['Pip Quill']);
    s.seed = nabbing();
    const [c] = nabLeftBehind(s, 'blenders', 'player', many(1, 'att', 'clubs', { level: 3 }), LOTTIES_CORNER, []);
    expect(c.guard).toMatchObject({ level: 3, fee: GUARD_FEE[2], weapon: 'fists', post: null, outUntil: s.day + 2 }); // seeing stars a day
    expect(s.alerts!.at(-1)!.text).toBe('You nabbed a Smoothie Bro.');
    expect(canSettle(s, c.id, 'pay').ok).toBe(false); // they're yours: nothing to pay

    const ransom = clone(s);
    const theirs = ransom.rivals.blenders.cash;
    expect(settleCaptive(ransom, c.id, 'ransom')).toBe(true);
    expect(ransom.cash).toBe(s.cash + GUARD_FEE[2]);
    expect(ransom.today.books?.loot).toBe((s.today.books?.loot ?? 0) + GUARD_FEE[2]); // the Ledger's Loot row
    expect(ransom.rivals.blenders.cash).toBe(theirs - GUARD_FEE[2]);
    expect(ransom.captives).toBeUndefined();
    const broke = clone(s);
    broke.rivals.blenders.budget = { grow: 0, guard: 0, strike: 0 };
    expect(canSettle(broke, c.id, 'ransom')).toEqual({ ok: false, why: "The Boardwalk Blenders can't pay" });

    const release = clone(s);
    expect(settleCaptive(release, c.id, 'release')).toBe(true);
    expect(release.reputation).toBeCloseTo(s.reputation + NABBED.release, 10);
    expect(release.guards).toHaveLength(1);

    const recruit = clone(s);
    expect(settleCaptive(recruit, c.id, 'recruit')).toBe(true);
    expect(recruit.guards.at(-1)).toMatchObject({ id: c.id, name: c.guard!.name, trait: 'Former Rival', oldFaction: 'blenders', level: 3 });
    expect(recruit.news.at(-1)).toBe(`${c.guard!.name} (Former Rival) joins the crew.`);
    expect(recruit.captives).toBeUndefined();
  });

  it("a Loyal captive won't come over, and a full roster has no bed for one", () => {
    const s = crewOf(['Pip Quill']);
    s.seed = nabbing();
    const [c] = nabLeftBehind(s, 'coldbrew', 'player', many(1, 'att'), LOTTIES_CORNER);
    c.guard!.trait = 'Loyal';
    expect(canSettle(s, c.id, 'recruit')).toEqual({ ok: false, why: "Loyal: won't switch sides" });
    expect(canSettle(s, c.id, 'release').ok).toBe(true);
    c.guard!.trait = 'Hothead';
    expect(canSettle(s, c.id, 'recruit').ok).toBe(true);
    while (s.guards.length < rosterCap(s)) s.guards.push(guard());
    expect(canSettle(s, c.id, 'recruit')).toEqual({ ok: false, why: 'No bed free' });
  });

  it('a guard of yours a rival nabs is held for their hire fee, off post and Out; pay, and they come home', () => {
    const s = crewOf(['Pip Quill']);
    const [pip] = s.guards;
    pip.post = LOTTIES_CORNER;
    pip.outUntil = s.day + 2; // the KO: back in two days
    s.seed = nabbing();
    const [c] = nabLeftBehind(s, 'player', 'blenders', [guardFighter(pip, 'att', true)], hqPlot('blenders').id);
    expect(c).toMatchObject({ id: pip.id, from: 'player', by: 'blenders', until: s.day + 1 + NABBED.days, back: s.day + 2 });
    expect(pip.post).toBeNull();
    expect(s.alerts!.at(-1)!.text).toBe(`Smoothie Bros nabbed Pip! Ransom: $${GUARD_FEE[1]}.`);
    s.day += 2;
    expect(guardReady(s, pip)).toBe(false); // over the KO, still held
    expect(canSettle(s, pip.id, 'ransom').ok).toBe(false);
    s.cash = 100;
    expect(canSettle(s, pip.id, 'pay')).toEqual({ ok: false, why: `Needs $${GUARD_FEE[1]}` });
    s.cash = 1000;
    const theirs = s.rivals.blenders.cash;
    const hired = s.today.books?.hire ?? 0;
    expect(settleCaptive(s, pip.id, 'pay')).toBe(true);
    expect(s.cash).toBe(1000 - GUARD_FEE[1]);
    expect(s.today.books?.hire).toBe(hired - GUARD_FEE[1]); // the Ledger's Hire row
    expect(s.rivals.blenders.cash).toBe(theirs + GUARD_FEE[1]);
    expect(guardReady(s, pip)).toBe(true);
    expect(s.captives).toBeUndefined();
  });

  it('unpaid when the days run out, a guard goes over to the rival and a Loyal one walks home; so does one held by a rival that is finished', () => {
    const s = crewOf(['Pip Quill'], ['Rosa Lark', 'Loyal'], ['Marnie Hobbs']);
    const [pip, rosa, marnie] = s.guards;
    s.seed = nabbing(3);
    nabLeftBehind(s, 'player', 'blenders', [pip, rosa].map((g) => guardFighter(g, 'att', true)), hqPlot('blenders').id);
    s.seed = nabbing();
    nabLeftBehind(s, 'player', 'hollis', [guardFighter(marnie, 'att', true)], hqPlot('hollis').id);
    expect(s.captives).toHaveLength(3);
    const hq = hqOf(s, 'blenders')!;
    const before = s.plots[hq].garrison ?? 0;
    s.rivals.hollis.alive = false; // finished before the deadline: Marnie walks home at the next dawn
    s.day++;
    captivesAtDawn(s);
    expect(s.captives).toHaveLength(2);
    expect(guardReady(s, marnie)).toBe(true);
    for (let d = 2; d <= NABBED.days; d++) { s.day++; captivesAtDawn(s); }
    expect(s.captives).toHaveLength(2); // still waiting on the ransom
    s.day++;
    captivesAtDawn(s);
    expect(s.guards.map((g) => g.name)).toEqual(['Rosa Lark', 'Marnie Hobbs']);
    expect(guardReady(s, rosa)).toBe(true);
    expect(s.plots[hq].garrison).toBe(before + 1); // Pip's a henchman now
    expect(s.news).toContain('Nobody paid: Pip Quill goes over to The Boardwalk Blenders.');
    expect(s.news).toContain("Rosa Lark won't switch sides, and walks home.");
    expect(s.captives).toBeUndefined();
  });

  it("a raid on you that's beaten off leaves its KO'd in your hands now and then", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const s = setUpCorner([]);
      s.rank = 4;
      s.guards = Array.from({ length: 3 }, () => guard({ weapon: 'hatchets', gear: 'pro', level: 5, post: LOTTIES_CORNER }));
      s.seed = seed;
      const raid = rivalRaid(s);
      const b = fightRaid(s, raid, true);
      if (!s.captives) continue;
      expect(b.outcome).toBe('repelled');
      expect(s.captives.length).toBeLessThanOrEqual(b.koed.filter((id) => raid.party.some((f) => f.id === id)).length);
      expect(s.captives.every((c) => c.from === 'blenders' && c.by === 'player' && c.guard)).toBe(true);
      return;
    }
    throw new Error('nobody nabbed');
  });

  it("a beaten HQ assault leaves its KO'd behind from every room it fought through, unless it Falls Back", () => {
    const s = newGame(1);
    s.rank = 10;
    s.guards = ['Ann Hobbs', 'Bo Lark', 'Cy Quill'].map((name) => guard({ name }));
    const squad = s.guards.map((g) => guardFighter(g, 'att', false));
    const [a, b, c] = squad.map((f) => f.id);
    const gate = { attackers: squad, koed: [a] } as unknown as BattleReport; // Ann went down at the Gate
    const input = fight({ attackers: squad.slice(1), defenders: many(2, 'def'), objective: 'smash' });
    const lost: BattleResult = { winner: 'def', outcome: 'repelled', fenceHpLeft: 0, standHpLeft: 0, koed: [b], fled: [c], hatchetKos: [], hpLeft: {}, duration: 9, events: [] };
    const held = clone(s);
    held.seed = nabbing(2);
    expect(hqStageOver(held, 'blenders', 'yard', input, lost, [gate])).toBe('lost');
    expect(held.captives!.map((x) => x.id)).toEqual([a, b]);
    const ran = clone(s);
    ran.seed = nabbing(2);
    expect(hqStageOver(ran, 'blenders', 'yard', input, { ...lost, fellBack: 'att' }, [gate])).toBe('lost');
    expect(ran.captives).toBeUndefined();
  });

  it('captives keep in a save, and a list that is not one goes', () => {
    const s = crewOf(['Pip Quill']);
    s.seed = nabbing();
    nabLeftBehind(s, 'blenders', 'player', many(1, 'att'), LOTTIES_CORNER);
    const loaded = migrateSave(clone(s))!;
    expect(loaded.captives).toEqual(s.captives);
    const bad = clone(s) as unknown as Record<string, unknown>;
    bad.captives = 'nobody';
    expect(migrateSave(bad)!.captives).toBeUndefined();
  });
});

describe('Former Rival', () => {
  /** A Smoothie Bro nabbed off a beaten raid and recruited: a Former Rival of the Blenders, with clubs. */
  function exBro(): { s: GameState; ex: Guard } {
    const s = newGame(4);
    s.rank = 6;
    s.cash = 5000;
    s.guards = [];
    let x = 1;
    while (nextRandom({ seed: x }) >= NABBED.chance) x++;
    s.seed = x;
    const [c] = nabLeftBehind(s, 'blenders', 'player', many(1, 'att', 'clubs', { level: 2 }), LOTTIES_CORNER);
    c.guard!.trait = 'Hothead'; // whatever they rolled, as long as it isn't Loyal
    settleCaptive(s, c.id, 'recruit');
    const ex = s.guards[0];
    ex.weapon = 'clubs';
    ex.outUntil = 0;
    return { s, ex };
  }
  const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 9);

  it('a recruited captive hits and chops 10% harder against their old faction: raids on its plots, its raids on you, its HQ', () => {
    const { s, ex } = exBro();
    expect(ex).toMatchObject({ trait: 'Former Rival', oldFaction: 'blenders' });
    const plain = guardFighter(ex, 'att', false);
    const vs = guardFighter(ex, 'att', false, 'blenders');
    near(vs.hit, plain.hit * 1.1);
    near(vs.chop, plain.chop * 1.1);
    expect(guardFighter(ex, 'att', false, 'hollis')).toMatchObject({ hit: plain.hit, chop: plain.chop });
    const theirPlot = (r: RivalId) => ownedPlots(s, r).find((p) => s.plots[p.id].stand && p.type !== 'hq')!.id;
    const ours = (target: string): Raid => ({ id: `r${s.nextId++}`, attacker: 'player', target, objective: 'smash', guards: [ex.id], detected: false, eta: '' });
    near(raidInput(s, ours(theirPlot('blenders')), false, { seed: 1 }).attackers[0].hit, plain.hit * 1.1);
    near(raidInput(s, ours(theirPlot('hollis')), false, { seed: 1 }).attackers[0].hit, plain.hit);
    ex.post = LOTTIES_CORNER;
    const theirs = (attacker: RivalId): Raid => ({ id: `r${s.nextId++}`, attacker, target: LOTTIES_CORNER, objective: 'smash', party: many(2, 'att'), detected: true, eta: '' });
    near(raidInput(s, theirs('blenders'), true, { seed: 1 }).defenders[0].hit, plain.hit * 1.1);
    near(raidInput(s, theirs('coldbrew'), true, { seed: 1 }).defenders[0].hit, plain.hit);
    ex.post = null; // in the Clubhouse reserve: the bell brings them, and they have it too
    const rung = raidInput(s, { ...theirs('blenders'), bell: [{ id: ex.id, at: s.minute }] }, true, { seed: 1 });
    near(rung.defenders.find((f) => f.id === ex.id)!.hit, plain.hit * 1.1);
    near(hqSquad(s, 'blenders', [ex.id])[0].hit, plain.hit * 1.1);
    near(hqSquad(s, 'sourwood', [ex.id])[0].hit, plain.hit);
  });

  it("the Hiring Hall's recruits never roll it, and every other trait still turns up", () => {
    const s = newGame(9);
    s.rank = 2;
    const traits = new Set<string>();
    for (let i = 0; i < 200; i++) { refreshRecruits(s, true); for (const r of s.recruits) traits.add(r.trait); }
    expect(traits.has('Former Rival')).toBe(false);
    expect(traits.size).toBe(12);
  });

  it('a Former Rival from an old save gets an old faction, and keeps it', () => {
    const s = newGame(9);
    s.guards = [guard({ id: 'g42', trait: 'Former Rival' }), guard({ trait: 'Hothead' })];
    const loaded = migrateSave(JSON.parse(JSON.stringify(s)))!;
    const was = loaded.guards[0].oldFaction!;
    expect(Object.keys(FACTIONS)).toContain(was);
    expect(loaded.guards[1].oldFaction).toBeUndefined();
    expect(migrateSave(JSON.parse(JSON.stringify(loaded)))!.guards[0].oldFaction).toBe(was);
  });
});

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

  it("an old save's bosses get their flag: a boss-led raid tonight, and a boss in a fight saved mid-brawl", () => {
    const s = newGame(3);
    const lead = raidBoss(s, 'hollis');
    const raid: Raid = { id: 'rb', attacker: 'hollis', target: LOTTIES_CORNER, objective: 'smash', party: [lead, ...many(2, 'att')], detected: true, eta: '23:00' };
    s.raids.push(raid);
    const old = JSON.parse(JSON.stringify(s)) as GameState;
    for (const f of old.raids[0].party!) delete f.boss;
    const loaded = migrateSave(old)!;
    expect(loaded.raids[0].party!.map((f) => !!f.boss)).toEqual([true, false, false]);
    expect(migrateSave(JSON.parse(JSON.stringify(loaded)))!.raids[0].party!.map((f) => !!f.boss)).toEqual([true, false, false]);
    watchFights(true);
    try {
      const live = newGame(4);
      const brock = raidBoss(live, 'blenders');
      expect(startFight(live, { id: 'rl', attacker: 'blenders', target: LOTTIES_CORNER, objective: 'smash', party: [brock, ...many(2, 'att')], detected: true, eta: '23:00' }, true)).toBe(true);
      const mid = JSON.parse(JSON.stringify(live)) as GameState;
      for (const f of [...mid.fight!.raid.party!, ...mid.fight!.input.attackers]) delete f.boss;
      const back = migrateSave(mid)!;
      expect(back.fight!.input.attackers.filter((f) => f.boss).map((f) => f.id)).toEqual([brock.id]);
      expect(back.fight!.raid.party!.filter((f) => f.boss).map((f) => f.id)).toEqual([brock.id]);
    } finally {
      watchFights(false);
    }
  });

  it('a save from this build loads its fences as they were', () => {
    const s = newGame(3);
    s.plots[LOTTIES_CORNER].defense = { tier: 3, fenceHp: 800, gadgets: [] };
    const loaded = migrateSave(JSON.parse(JSON.stringify(s)))!;
    for (const id of Object.keys(s.plots)) expect(loaded.plots[id].defense.fenceHp).toBe(s.plots[id].defense.fenceHp);
    expect(loaded.plots[LOTTIES_CORNER].defense.fenceHp).toBe(800);
  });
});

function setUpCorner(gadgets: GadgetId[]): GameState {
  const s = newGame(12);
  const ps = s.plots[LOTTIES_CORNER];
  ps.defense = { tier: 1, fenceHp: PERIMETERS[0].hp, gadgets };
  return s;
}
function rivalRaid(s: GameState) {
  return { id: `r${s.nextId++}`, attacker: 'blenders' as const, target: LOTTIES_CORNER, objective: 'smash' as const, party: many(3, 'att', 'fists'), detected: true, eta: '23:00' };
}
