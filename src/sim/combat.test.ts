import { describe, expect, it } from 'vitest';
import { COMBAT_RULES, runBattle, winChance, type BattleEvent, type BattleInput, type Fighter, type Side } from './combat.ts';
import {
  COMBAT, fightRaid, GUARD_BASE, guardFighter, LOTTIES_CORNER, migrateSave, newGame, PERIMETERS, raidPartyFor, STAND_HP, WEAPONS,
  type GadgetId, type GameState, type GearId, type Guard, type Trait, type WeaponId,
} from './economy.ts';

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

  it('the attackers roll the same way', () => {
    const r = runBattle(fight({ attackers: many(5, 'att', 'fists', { nerve: 0 }), defenders: [fighter('def', 'fists', { ...tough, hit: 1000 })], standHp: 100 }), { seed: 2 });
    expect(of(r.events, 'ko').length).toBe(2);
    expect(r.fled.length).toBe(3);
    expect(r.outcome).toBe('repelled');
  });
});

describe('Speed and positions', () => {
  it('Sprinters are 25% faster, reach the fence first and take the goose', () => {
    const pip = asGuard('att', 'clubs', 'none', 'Sprinter');
    expect(pip.speed).toBeCloseTo(COMBAT.speed * 1.25);
    expect(asGuard('att', 'clubs').speed).toBeCloseTo(COMBAT.speed);
    const squad = [asGuard('att', 'clubs'), asGuard('att', 'clubs'), pip];
    const r = runBattle(fight({ attackers: squad, ...fenced(1), gadgets: ['goose'], standHp: 100 }), { seed: 1 });
    const stun = of(r.events, 'stun');
    expect(stun).toEqual([{ t: 0, type: 'stun', a: pip.id, by: 'goose' }]);
    // The others walk the last plot-length in 0.6 s behind her (3 s against 2.4 s), so their first chops come later.
    const firstChop = (id: string) => of(r.events, 'chop').find((e) => e.a === id)!.t;
    expect(firstChop(squad[0].id)).toBe(0.75);
    expect(firstChop(pip.id)).toBe(3); // stunned for 3 seconds
  });

  it('every fighter has a position at contact, and walks in legs the replay can follow', () => {
    const squad = [asGuard('att', 'clubs'), asGuard('att', 'clubs', 'none', 'Sprinter')];
    const dex = asGuard('def', 'clubs');
    const r = runBattle(fight({ attackers: squad, defenders: [dex], ...fenced(1), standHp: 100 }), { seed: 1 });
    const at = of(r.events, 'at');
    expect(at.map((e) => e.a).sort()).toEqual([...squad, dex].map((f) => f.id).sort());
    expect(at.every((e) => e.t === 0)).toBe(true);
    expect(at.find((e) => e.a === dex.id)!.z).toBeLessThan(COMBAT.fenceAt); // behind the fence
    const pipAt = at.find((e) => e.a === squad[1].id)!, slowAt = at.find((e) => e.a === squad[0].id)!;
    expect(pipAt.z).toBeCloseTo(COMBAT.fenceAt + COMBAT.reach / 4, 3);
    expect(slowAt.z).toBeGreaterThan(pipAt.z); // still on the way in
    expect(of(r.events, 'move').some((e) => e.a === squad[0].id && e.t === 0)).toBe(true);
    expect(at.every((e) => Number.isFinite(e.x) && Number.isFinite(e.z))).toBe(true);
  });

  it('Barbed Wire slows the walk in by 30%, not the swings', () => {
    const lagAt = (tier: number) => {
      const squad = [asGuard('att', 'hatchets', 'pro'), asGuard('att', 'hatchets', 'pro', 'Sprinter')];
      const r = runBattle(fight({ attackers: squad, ...fenced(tier), standHp: 100 }), { seed: 1 });
      return of(r.events, 'chop').find((e) => e.a === squad[0].id)!.t;
    };
    expect(lagAt(2)).toBe(0.75); // 0.6 s behind the Sprinter
    expect(lagAt(4)).toBe(1); // 0.6 / 0.7 = 0.86 s behind
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

  it('Day 24: four club guards with first strike chop a Picket Fence down at t = 3', () => {
    const squad = [asGuard('att', 'clubs', 'vest'), asGuard('att', 'clubs', 'vest', 'Hothead'), asGuard('att', 'clubs', 'vest', 'Tough Cookie'), asGuard('att', 'clubs', 'vest')];
    const r = runBattle(fight({ attackers: squad, ...fenced(1), standHp: 800, objective: 'shakedown', detected: false }), { seed: 1 });
    expect(of(r.events, 'breach')[0].t).toBe(3);
    expect(of(r.events, 'chop').filter((e) => e.t === 0).every((e) => e.dmg === 12.5)).toBe(true);
  });

  it('Day 24: three club Bros at 22.5 a hit leave a 140-HP guard on 5 HP after 6 hits', () => {
    const pip = asGuard('att', 'clubs', 'vest');
    expect(pip.hp).toBe(140);
    const bros = many(3, 'def', 'clubs', tough);
    const r = runBattle(fight({ attackers: [pip], defenders: bros, perimeter: 1, fenceHp: 1e6, standHp: 100 }), { seed: 1 });
    const hits = of(r.events, 'swing').filter((e) => e.b === pip.id);
    expect(hits.slice(0, 6).every((e) => e.dmg === 22.5)).toBe(true);
    expect(hits.length).toBeGreaterThanOrEqual(6);
    expect(140 - hits.slice(0, 6).reduce((a, e) => a + e.dmg, 0)).toBe(5);
    expect(hits.slice(0, 6).map((e) => e.t)).toEqual([0, 0, 0, 1.5, 1.5, 1.5]);
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

function setUpCorner(gadgets: GadgetId[]): GameState {
  const s = newGame(12);
  const ps = s.plots[LOTTIES_CORNER];
  ps.defense = { tier: 1, fenceHp: PERIMETERS[0].hp, gadgets };
  return s;
}
function rivalRaid(s: GameState) {
  return { id: `r${s.nextId++}`, attacker: 'blenders' as const, target: LOTTIES_CORNER, objective: 'smash' as const, party: many(3, 'att', 'fists'), detected: true, eta: '23:00' };
}
