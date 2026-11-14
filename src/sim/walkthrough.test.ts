// The spec's worked combat examples and the canon combat anchors, as seeded
// scenarios (spec: Defenses, "How a stand holds off a raid" (Day 26); Crew
// and combat, "A night Shakedown" (Day 24) and "Weapons and padding"; canon
// section 12). Tolerances: timings ±1 s, money ±5%, win rates ±5 points over
// at least 400 fights. it.fails marks a step the sim doesn't match yet (the
// numbers it gives are in the comment: that's a design call, not a test to
// bend), and it.todo a step that waits on another lane's work.
import { describe, expect, it } from 'vitest';
import { runBattle, winChance, type BattleEvent, type BattleInput, type BattleResult, type Fighter } from './combat.ts';
import {
  awayGuards, buildClubhouse, buySupply, CLOSE, creditGuards, DAYTIME_RAID_REP, detectionChance, DIFFICULTY, emptyPosts, fenceRepairCost, fightRaid, GEAR,
  guardFighter, hhmm, isMajor, LOTTIES_CORNER, NABBED, newGame, nightStep, openStand, ownedPlots, PERIMETERS, planRaid, PLOT_BY_ID, PLOTS, raidInput, raidNotice, raidOdds,
  simulateRestOfDay, SQUAD_CAP, squadTrip, STAND_HP, startNight, threatLevel, tickMinute, travelMinutes, WEAPONS, type Alert, type BattleReport,
  type GameState, type GadgetId, type Guard, type Raid, type SimEvent, type Trait,
} from './economy.ts';
import { DEFAULT_OPTIONS, autoPauses } from '../settings.ts';
import { battleOf, fencedOf, footholdFor, guardOf, guardsOf, henchmenOf, partyOf } from './fighters.ts';
import { shakedownLoot } from './loot.ts';
import { ringTheBell } from './reinforce.ts';
import { leftBehind, nabLeftBehind } from './captives.ts';
import { nextRandom } from './rng.ts';
import { raidOddsRange } from './crew.ts';
import { gullScout, isScouted, scoutedSnapshot } from './scouting.ts';

const of = <T extends BattleEvent['type']>(events: BattleEvent[], type: T) => events.filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type);
const near = (got: number, want: number, by: number) => expect(Math.abs(got - want)).toBeLessThanOrEqual(by);
/** The fight writes each blow to a tenth of a point. */
const blow = (dmg: number, want: number) => Math.abs(dmg - want) <= 0.05 + 1e-9;
const kit = (name: string, trait: Trait, o: Partial<Guard> = {}) => guardOf('clubs', 'vest', 1, trait, { name, ...o });
/** Dice from this seed on whose first roll misses a detection chance of p (the walkthroughs' raids go unseen). */
const missing = (p: number, from: number) => { let x = from; while (nextRandom({ seed: x }) < p) x++; return x; };

// ---------- Day 26: how a stand holds off a raid ----------

/**
 * Day 26 on Classic, Threat 2. Lottie's Corner is a Kiosk with Chain-Link, a
 * Tin-Can Alarm and a Guard Goose; Dex (Loyal) and Rosa (Hothead) guard it
 * with clubs and Padded Vests, and Big Lou, Pip and Marnie wait at the
 * Maple Row Clubhouse. Brock sends 5 Smoothie Bros on a Shakedown, 2 with
 * paddleboards (club tier) and 3 with fists, to hit at 02:25.
 */
function day26(o: { bell?: boolean; picket?: boolean; dice?: number } = {}) {
  const s = newGame(26);
  s.rank = 4;
  s.day = 26;
  s.cash = 5000;
  const lc = s.plots[LOTTIES_CORNER];
  lc.stand!.level = 3;
  lc.defense = o.picket ? { tier: 1, fenceHp: PERIMETERS[0].hp, gadgets: [] } : { tier: 2, fenceHp: PERIMETERS[1].hp, gadgets: ['alarm', 'goose'] };
  lc.stand!.lastProfit = 800; // the walkthrough's Kiosk: about $800 a day (whether the sim's Kiosk makes that is tested below)
  const club = PLOTS.find((p) => p.district === 'maple' && p.type === 'street' && !s.plots[p.id].owner)!.id;
  s.plots[club].owner = 'player';
  buildClubhouse(s, club);
  const dex = kit('Dex', 'Loyal', { post: LOTTIES_CORNER }), rosa = kit('Rosa', 'Hothead', { post: LOTTIES_CORNER });
  s.guards = o.picket ? [dex] : [dex, rosa, kit('Big Lou', 'Tough Cookie', { club }), kit('Pip', 'Sprinter', { club }), kit('Marnie', 'Night Owl', { club })];
  const clubs = henchmenOf(2, 2, 'clubs'), fists = henchmenOf(3, 2, 'fists');
  const at = 26 * 60 + 25;
  s.phase = 'report';
  s.minute = CLOSE;
  s.raids = [];
  const raid: Raid = { id: 'brock', attacker: 'blenders', target: LOTTIES_CORNER, objective: 'shakedown', party: [...clubs, ...fists], detected: false, eta: hhmm(at), leave: at - 75, at };
  s.raids.push(raid);
  startNight(s);
  s.minute = raid.leave! - 1;
  s.seed = missing(detectionChance(s, LOTTIES_CORNER, true), o.dice ?? 14); // the roll misses as they set out
  const events: SimEvent[] = [];
  while (!raid.warned) events.push(...nightStep(s));
  const warning = events.flatMap((e) => (e.type === 'alert' ? [e.alert] : []))[0] as Alert;
  const warnedAt = s.minute;
  const rang = o.bell ? ringTheBell(s, raid.id) : false;
  const news = s.news.at(-1);
  const cash = s.cash;
  while (s.raids.includes(raid)) events.push(...nightStep(s));
  const report = (events.find((e) => e.type === 'fight') as { report: BattleReport }).report;
  return { s, raid, at, warning, warnedAt, rang, news, cash, report, dex, rosa, clubs, fists, club };
}

describe('Day 26: a stand holds off a raid (Classic, Threat 2)', () => {
  it('detection is 50% + 15% cans + 15% goose − 25% at night = 55%', () => {
    const { s } = day26();
    expect(threatLevel(s)).toBe(2);
    expect(detectionChance(s, LOTTIES_CORNER, true)).toBeCloseTo(0.55, 10);
  });

  it('the roll misses, so the card gives the 15-minute minimum and the game pauses', () => {
    const { s, at, warning, warnedAt } = day26();
    expect(raidNotice(s)).toBe(15);
    expect(at - warnedAt).toBe(15);
    expect(warning.kind).toBe('raid');
    expect(isMajor(warning)).toBe(true);
    expect(autoPauses(DEFAULT_OPTIONS, s, 'raid')).toBe(true);
  });

  it('Ring the Bell: Big Lou, Pip and Marnie leave the Maple Row Clubhouse, 30 game minutes out', () => {
    const { rang, news, club, report } = day26({ bell: true });
    expect(rang).toBe(true);
    expect(news).toBe(`Ding-ding! Big Lou, Pip and Marnie leave ${PLOT_BY_ID[club].name}, 30 min out.`);
    expect(report.joins?.map((j) => [j.t, j.fighters.map((f) => f.name)])).toEqual([[15, ['Big Lou', 'Pip', 'Marnie']]]); // 15 s in
  });

  it('02:25 HONK: the goose stuns the first Bro for 3 s; the rest chop the Chain-Link with their first strike', () => {
    const { report, clubs, fists } = day26({ bell: true });
    const stun = of(report.events, 'stun');
    expect(stun).toEqual([{ t: 0, type: 'stun', a: stun[0].a, by: 'goose' }]);
    const stunned = stun[0].a;
    expect(Math.min(...[...of(report.events, 'chop'), ...of(report.events, 'swing')].filter((e) => e.a === stunned).map((e) => e.t))).toBeGreaterThanOrEqual(3);
    const chops = of(report.events, 'chop').filter((e) => e.target === 'fence');
    const base = (id: string) => [...clubs, ...fists].find((f) => f.id === id)!.chop;
    expect(chops.filter((e) => e.t < 5).every((e) => blow(e.dmg, base(e.a) * 1.25))).toBe(true);
    expect(chops.filter((e) => e.t >= 5).every((e) => blow(e.dmg, base(e.a)))).toBe(true);
  });

  it('fence line: Dex swings through the mesh at 22.5 a hit (18 plus 25%), and Rosa, a Hothead, a bit harder', () => {
    const { report, dex, rosa } = day26({ bell: true });
    const hits = (g: Guard) => of(report.events, 'swing').filter((e) => e.a === g.id && e.t < 5).map((e) => e.dmg);
    expect(new Set(hits(dex))).toEqual(new Set([22.5]));
    expect(blow(hits(rosa)[0], 18 * 1.15 * 1.25)).toBe(true);
  });

  it('both paddleboard Bros drop within 8 s; 2 of 5 down counts as half, the other 3 roll Nerve and one runs', () => {
    const { report, clubs } = day26({ bell: true });
    const ko = (f: Fighter) => of(report.events, 'ko').find((e) => e.a === f.id)?.t ?? Infinity;
    expect(Math.max(...clubs.map(ko))).toBeLessThanOrEqual(8 + 1);
    const second = of(report.events, 'ko')[1].t;
    expect(of(report.events, 'flee').map((e) => e.t)).toEqual([second]); // the check comes as the second one drops
    expect(report.fled).toHaveLength(1);
  });

  it('the last 2 keep chopping until they drop at 15 s, the fence still at about 260 HP', () => {
    const { s, report } = day26({ bell: true });
    const kos = of(report.events, 'ko').map((e) => e.t);
    near(kos[kos.length - 1], 15, 1);
    near(s.plots[LOTTIES_CORNER].defense.fenceHp, 260, 260 * 0.05);
    expect(report.outcome).toBe('repelled');
  });

  it('aftermath: the reserves jog in to 4 Bros seeing stars', () => {
    const { report, raid } = day26({ bell: true });
    expect(report.koed.filter((id) => raid.party!.some((f) => f.id === id))).toHaveLength(4);
  });

  it('aftermath: each of the 4 KO\'d Bros has a 10% chance to be Nabbed', () => {
    const { s, report } = day26({ bell: true });
    const bros = leftBehind(report.attackers, report); // beaten off: they're left behind
    expect(bros).toHaveLength(4);
    expect(NABBED.chance).toBe(0.1);
    expect((s.captives ?? []).every((c) => c.from === 'blenders' && c.by === 'player')).toBe(true); // tonight's dice
    // Over 500 nights' dice, the four rolls nab 10% of them.
    const t = newGame(26);
    let nabbed = 0;
    for (let seed = 1; seed <= 500; seed++) {
      t.seed = seed;
      delete t.captives;
      nabbed += nabLeftBehind(t, 'blenders', 'player', bros, LOTTIES_CORNER).length;
    }
    near(nabbed / 2000, 0.1, 0.02);
  });

  // PERIMETERS[1].repair: the Chain-Link's flat $120 for the night's one raid (crew's fence-repair-overnight-flat).
  it('aftermath: the night costs $120 of fence repair', () => {
    const { s } = day26({ bell: true });
    near(fenceRepairCost(s.plots[LOTTIES_CORNER]), 120, 120 * 0.05);
  });

  it('aftermath: Brock\'s Respect cooldown keeps him away for 3 days', () => {
    const { s } = day26({ bell: true });
    expect(DIFFICULTY.classic.respectDays).toBe(3);
    expect(s.rivals.blenders.respectUntil).toBe(s.day + 1 + 3);
  });

  it('with only a Picket Fence and Dex, the raid gets in and takes about $800, a day of the Kiosk\'s profit', () => {
    const { s, report, cash } = day26({ picket: true });
    expect(report.outcome).toBe('robbed');
    near(report.loot, 800, 800 * 0.05);
    expect(s.cash).toBe(cash - report.loot);
  });

  // Measured: a Kiosk on Lottie's Corner at 3.3 stars makes about $633 on a warm day at Auto-Price's $3.00 ceiling
  // (248 cups), and about $512 priced by hand at $2.10 (302 cups). The day of profit a Shakedown takes is the demand
  // model's to set.
  it.fails('... and a day of the Kiosk\'s profit is about $800', () => {
    const s = newGame(26);
    s.rank = 4; s.cash = 1e5; s.reputation = 3.3; s.day = 20;
    s.plots[LOTTIES_CORNER].stand!.level = 3; // Auto-Price (from Rank 3) posts it at its ceiling as it opens
    buySupply(s, 'lemons', 10); buySupply(s, 'sugar', 10); buySupply(s, 'ice', 20);
    openStand(s);
    simulateRestOfDay(s);
    near(shakedownLoot(s, LOTTIES_CORNER), 800, 800 * 0.05);
  });
});

// ---------- Day 24: a night Shakedown ----------

const SQUAD: [string, Trait][] = [['Dex', 'Loyal'], ['Rosa', 'Hothead'], ['Big Lou', 'Tough Cookie'], ['Pip', 'Sprinter'], ['Marnie', 'Night Owl']];

/** The Day 24 fight as the walkthrough tells it: the squad at night with first strike against 3 club Bros (18 a hit)
 * behind a Picket Fence, a Tin-Can Alarm and a Guard Goose, on a Kiosk. */
function day24Fight(seed = 1): { input: BattleInput; res: BattleResult; squad: Fighter[]; bros: Fighter[] } {
  const squad = SQUAD.map(([name, trait]) => guardFighter(kit(name, trait), 'att', true));
  const bros = henchmenOf(3, 1, 'clubs', 'def');
  const input: BattleInput = { attackers: squad, defenders: bros, ...fencedOf(1), gadgets: ['alarm', 'goose'], standHp: STAND_HP[2], objective: 'shakedown', detected: false };
  return { input, res: runBattle(input, { seed }), squad, bros };
}

/** Day 24 in the game: Rank 4 at 3.3 stars, the five with clubs and vests, and a Blenders Kiosk on the Boardwalk
 * behind a Picket Fence, a Tin-Can Alarm and a Guard Goose, with 3 Bros on guard. */
function day24(): { s: GameState; kiosk: string } {
  const s = newGame(24);
  s.rank = 4;
  s.day = 24;
  s.reputation = 3.3;
  // The map has no Prime plot on the Boardwalk: the Blenders' stand nearest the boardwalk's landmark stands in for it.
  const kiosk = ownedPlots(s, 'blenders').find((p) => PLOT_BY_ID[p.id].district === 'boardwalk' && s.plots[p.id].stand)!.id;
  const ps = s.plots[kiosk];
  ps.stand!.level = 3;
  ps.defense = { tier: 1, fenceHp: PERIMETERS[0].hp, gadgets: ['alarm', 'goose'] };
  ps.garrison = 3;
  s.guards = SQUAD.map(([name, trait]) => kit(name, trait));
  footholdFor(s, kiosk); // crew: raids need a Foothold, a lot of yours on the Boardwalk
  return { s, kiosk };
}

/** Day 24 at 20:00 in the Raid Planner, with Dex and Rosa posted at the Corner. */
function day24Trip(): { s: GameState; kiosk: string } {
  const day = day24();
  const [dex, rosa] = day.s.guards;
  dex.post = rosa.post = LOTTIES_CORNER;
  day.s.phase = 'report';
  day.s.minute = CLOSE;
  return day;
}

describe('Day 24: a night Shakedown (Rank 4, Threat 2, 3.3 stars)', () => {
  it('the squad is the Rank 4 cap of 5, each with clubs and a Padded Vest: $350 a guard, $1,750 in all', () => {
    expect(SQUAD_CAP(4)).toBe(5);
    expect(WEAPONS.clubs.cost + GEAR.vest.cost).toBe(350);
    expect(SQUAD.length * (WEAPONS.clubs.cost + GEAR.vest.cost)).toBe(1750);
  });

  // Measured: unscouted, the Planner tries the Kiosk in its rival's kit a size up and a size down, help counted, and
  // reads 0–100% (0–99.8% over 400 runs). A size up (L4) is a Chain-Link Fence, and 500 HP of fence alone holds the
  // five off every time; a size down (L2: a Picket Fence, a Tin-Can Alarm, 3 henchmen with fists or clubs) barely
  // slows them. Their own row, which the Kiosk has, is the scouted 80% below.
  it.fails('unscouted, the Planner reads 40–85% (crew: raid-planner-unscouted-ranges)', () => {
    const { s, kiosk } = day24();
    const [lo, hi] = raidOddsRange(s, kiosk, s.guards.map((g) => g.id), 'shakedown', true);
    near(lo, 0.4, 0.05);
    near(hi, 0.85, 0.05);
  });

  it('unscouted, the range holds the win chance that Gull Flight settles on for 3 days', () => {
    const { s, kiosk } = day24();
    const ids = s.guards.map((g) => g.id);
    const [lo, hi] = raidOddsRange(s, kiosk, ids, 'shakedown', true);
    const real = raidOdds(s, kiosk, ids, 'shakedown', true);
    expect(lo).toBeLessThan(hi);
    expect(real).toBeGreaterThanOrEqual(lo);
    expect(real).toBeLessThanOrEqual(hi);
    expect(isScouted(s, kiosk)).toBe(false);
    expect(gullScout(s, kiosk)).toBe(true);
    expect(scoutedSnapshot(s, kiosk)).toMatchObject({ tier: 1, gadgets: ['alarm', 'goose'], garrison: 3, until: s.day + 2 });
  });

  // The Planner reads 80% (83% over 400 runs). Each of its runs fights its own draw of the garrison the sim posts at a
  // rival L3 Kiosk (crew's kit row: 3 Bros with clubs at 18 a hit, no vests) and rolls the 55% detection. A raid that's
  // spotted loses its first strike (83% won), and about one time in three (RIVAL_HELP at Threat 2) also meets one
  // henchman sent from the Blenders' L2 stand next door, there by contact (26% won): spotted, it wins 66%. Unseen, as
  // the walkthrough has it, the squad wins all 400 (see raidInput below).
  it('scouted (Picket Fence, Tin-Can Alarm, Guard Goose, 3 Bros), the win chance settles at 81%', () => {
    const { s, kiosk } = day24();
    near(raidOdds(s, kiosk, s.guards.map((g) => g.id), 'shakedown', true), 0.81, 0.05);
  });

  it('the Planner\'s figure is what the raid wins when it\'s fought, each fight with its own garrison, detection roll and help', () => {
    const { s, kiosk } = day24();
    const trip = squadTrip(s, kiosk, 'tonight');
    let won = 0, helped = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const t = JSON.parse(JSON.stringify(s)) as GameState;
      const raid: Raid = { id: 'odds', attacker: 'player', target: kiosk, objective: 'shakedown', guards: t.guards.map((g) => g.id), detected: false, eta: '', leave: trip.leave, at: trip.at };
      const rng = { seed };
      const input = raidInput(t, raid, true, rng);
      if (raid.help) helped++;
      if (runBattle(input, rng).winner === 'att') won++;
    }
    expect(helped).toBeGreaterThan(40); // about one spotted raid in three meets help
    near(raidOdds(s, kiosk, s.guards.map((g) => g.id), 'shakedown', true, 400), won / 400, 0.05);
  });

  // Measured: a Blenders Kiosk on the Boardwalk makes about $1,553 on a hot day (823 cups at $2.16, the rival's price).
  it.fails('expected loot is about $2,400, one day of the Kiosk\'s profit', () => {
    const { s, kiosk } = day24();
    buySupply(s, 'lemons', 2); buySupply(s, 'sugar', 2); buySupply(s, 'ice', 4);
    openStand(s);
    simulateRestOfDay(s);
    near(shakedownLoot(s, kiosk), 2400, 2400 * 0.05);
  });

  // The squad sets out from the Clubhouse its guards wait at, else the Corner (squadHome). Day 24 doesn't say
  // where its Maple Row Clubhouse stands: from Maple Row's Street plots the trip runs 85-100 game minutes (100 from the
  // first one, where the Day 26 scene puts it, and the Planner would flag 04:40), and from the Corner it's the
  // walkthrough's 90. So this squad, with no Clubhouse, sets out from the Corner.
  it('they leave at 01:00 on a 1.5-game-hour trip, and the Planner flags the Corner\'s posts empty until about 04:20', () => {
    const { s, kiosk } = day24Trip();
    const ids = s.guards.map((g) => g.id);
    const trip = squadTrip(s, kiosk, 'tonight', ids);
    expect(hhmm(trip.leave)).toBe('01:00');
    expect(trip.travel).toBe(90);
    expect(travelMinutes(s, LOTTIES_CORNER, kiosk)).toBe(90);
    near(trip.back, 28 * 60 + 20, 1);
    expect(emptyPosts(s, ids).map((g) => g.name)).toEqual(['Dex', 'Rosa']);
  });

  // Measured: out at 01:00 and home at 04:20 (the walk home is timed from the fight: contact at 02:30, the fight,
  // then 90 minutes back).
  it('the squad is home by 04:20, and the Corner\'s posts are filled again', () => {
    const { s, kiosk } = day24Trip();
    const dex = s.guards[0];
    expect(planRaid(s, kiosk, s.guards.map((g) => g.id), 'shakedown', 'tonight')).toBe(true);
    startNight(s);
    let left = 0, home = 0;
    while (s.minute < 30 * 60 && !home) {
      nightStep(s);
      const away = awayGuards(s).has(dex.id);
      if (away && !left) left = s.minute;
      if (!away && left) home = s.minute;
    }
    expect(hhmm(left)).toBe('01:00');
    expect(home).toBeGreaterThan(0);
    expect(home).toBeLessThanOrEqual(28 * 60 + 20);
  });

  it('detection is 55% and misses: no warning, no help, and the squad gets a first strike (+25% for 5 s)', () => {
    const { s, kiosk } = day24();
    expect(detectionChance(s, kiosk, true)).toBeCloseTo(0.55, 10);
    const { res, squad } = day24Fight();
    const chops = of(res.events, 'chop').filter((e) => e.target === 'fence');
    const base = (id: string) => squad.find((f) => f.id === id)!.chop;
    expect(chops.length).toBeGreaterThan(0);
    expect(chops.every((e) => blow(e.dmg, base(e.a) * (e.t < 5 ? 1.25 : 1)))).toBe(true);
  });

  // The squad reaches the fence together, in its line-up's order, so the first guard to the fence is Dex.
  it('breach: the goose stuns the first guard to the fence, Dex, for 3 s, and the other 4 chop the 150-HP Picket in 3 s', () => {
    const { res, squad } = day24Fight();
    expect(of(res.events, 'stun')).toEqual([{ t: 0, type: 'stun', a: squad.find((f) => f.name === 'Dex')!.id, by: 'goose' }]);
    expect(of(res.events, 'breach')[0].t).toBe(3);
    const dex = squad.find((f) => f.name === 'Dex')!.id;
    const chops = of(res.events, 'chop').filter((e) => e.target === 'fence');
    expect(Math.min(...chops.filter((e) => e.a === dex).map((e) => e.t))).toBe(3); // seeing stars till then
    expect(chops.filter((e) => e.a !== dex).reduce((a, e) => a + e.dmg, 0)).toBeGreaterThanOrEqual(150); // the other 4 do it
  });

  it('the Bros swing over the fence at 22.5 a hit (18 plus their fence-line bonus)', () => {
    const { res, bros } = day24Fight();
    const breach = of(res.events, 'breach')[0].t;
    const hits = of(res.events, 'swing').filter((e) => bros.some((b) => b.id === e.a));
    expect(hits.filter((e) => e.t <= breach).every((e) => e.dmg === 22.5)).toBe(true); // the swing as the fence goes still had it
    expect(hits.filter((e) => e.t > breach).every((e) => e.dmg === 18)).toBe(true);
  });

  it('brawl: it\'s 5 against 3 with the Bros\' bonus gone, and the last Bro is down at 7.5 s', () => {
    const { res, bros } = day24Fight();
    const down = bros.map((b) => [...of(res.events, 'ko'), ...of(res.events, 'flee')].find((e) => e.a === b.id)!.t);
    near(Math.max(...down), 7.5, 1);
    expect(res.fled).toHaveLength(1); // one bolts for the pier
  });

  // Measured: each Bro swings at the guard across the fence from it, so Dex, Rosa and Big Lou take 67.5 each before
  // the breach and Pip takes none; the squad spreads its swings the same way, so two Bros drop together at 7.5 s
  // (none at 4.5 s), the Nerve roll sends the third running, and Pip is never KO'd.
  it.fails('... the Bros leave Pip on 5 HP; the first drops at 4.5 s, and the last, having KO\'d Pip, at 7.5 s', () => {
    const { res, bros, squad } = day24Fight();
    const pip = squad.find((f) => f.name === 'Pip')!.id;
    const breach = of(res.events, 'breach')[0].t;
    near(140 - of(res.events, 'swing').filter((e) => e.b === pip && e.t <= breach).reduce((a, e) => a + e.dmg, 0), 5, 0.5);
    const kos = of(res.events, 'ko').filter((e) => bros.some((b) => b.id === e.a)).map((e) => e.t);
    near(kos[0], 4.5, 1);
    expect(res.koed).toContain(pip);
  });

  it('objective: with no Bro standing, the squad spends 10 game minutes at the till', () => {
    const { res } = day24Fight();
    expect(res.outcome).toBe('robbed');
    near(res.duration - of(res.events, 'grab')[0].t, 10, 1);
  });

  it('... and walks out at 02:48 (18 game minutes after contact at 02:30)', () => {
    const { res } = day24Fight();
    near(res.duration, 18, 1);
  });

  it('aftermath: a guard KO\'d by a club is Out for 1 day, by a hatchet 2', () => {
    const s = newGame(24);
    const [pip, lou] = [kit('Pip', 'Sprinter'), kit('Big Lou', 'Tough Cookie')];
    s.guards = [pip, lou];
    const input = battleOf({ attackers: [guardFighter(pip, 'att', true), guardFighter(lou, 'att', true)] });
    creditGuards(s, input, { koed: [pip.id, lou.id], hatchetKos: [lou.id], winner: 'att' });
    expect(pip.outUntil).toBe(s.day + 2); // misses tomorrow
    expect(lou.outUntil).toBe(s.day + 3); // misses two days
  });

  it('aftermath: nobody was left behind, so nobody can be Nabbed', () => {
    const { res, squad } = day24Fight();
    expect(res.winner).toBe('att');
    expect(leftBehind(squad, res)).toEqual([]);
    expect(leftBehind(squad, { ...res, koed: [squad[3].id] })).toEqual([]); // a KO'd Pip wobbles home with the squad
    const { s, kiosk } = day24();
    s.guards = SQUAD.map(([name, trait]) => guardOf('hatchets', 'pro', 5, trait, { name })); // a sure win, to read the aftermath
    const won = fightRaid(s, { id: 'n', attacker: 'player', target: kiosk, objective: 'shakedown', guards: s.guards.map((g) => g.id), detected: false, eta: '01:00' }, true);
    expect(won.outcome).toBe('robbed');
    expect(s.captives).toBeUndefined();
  });

  it('Reputation doesn\'t move at night; by day the same raid costs 0.1 star. Brock\'s Grudge jumps', () => {
    const night = day24(), day = day24();
    for (const { s } of [night, day]) s.guards = SQUAD.map(([name, trait]) => guardOf('hatchets', 'pro', 5, trait, { name })); // a sure win, to read the books
    const grudge = night.s.rivals.blenders.grudge;
    const ids = night.s.guards.map((g) => g.id);
    const won = fightRaid(night.s, { id: 'n', attacker: 'player', target: night.kiosk, objective: 'shakedown', guards: ids, detected: false, eta: '01:00' }, true);
    expect(won.outcome).toBe('robbed');
    expect(night.s.reputation).toBe(3.3);
    expect(night.s.rivals.blenders.grudge).toBe(Math.min(100, grudge + 20));
    expect(DAYTIME_RAID_REP.raid).toBe(0.1);
    expect(planRaid(day.s, day.kiosk, day.s.guards.map((g) => g.id), 'shakedown', 'now')).toBe(true); // they walk there
    openStand(day.s);
    let report: BattleReport | undefined;
    while (!report && day.s.phase === 'open') for (const e of tickMinute(day.s)) if (e.type === 'fight') report = e.report;
    expect(report).toMatchObject({ outcome: 'robbed' });
    expect(day.s.reputation).toBe(3.2);
  });
});

// ---------- weapons and padding ----------

describe('weapon checks', () => {
  // The chop arithmetic on a 2,500-HP fence that doesn't bite back, as the combat check runs it. The real Barbed Wire
  // also stings whoever chops it (4 HP a second): hatchets still breach it in 18 s, but its sting KOs all 5 club guards
  // (100 HP each) first, so they never get through.
  const breach = (weapon: 'hatchets' | 'clubs') =>
    of(runBattle(battleOf({ attackers: guardsOf(5, 'att', weapon), perimeter: 2, fenceHp: PERIMETERS[3].hp, standHp: STAND_HP[4] }), { seed: 1 }).events, 'breach')[0].t;

  it('5 hatchets breach Barbed Wire (2,500 HP) in 19 s', () => {
    expect(PERIMETERS[3].hp).toBe(2500);
    near(breach('hatchets'), 19, 1);
  });

  // Measured: 73.5 s. Each swing lands on the beat, the first at contact, so 50 swings of 10 take 49 × 1.5 s.
  it.fails('5 clubs take 75 s', () => {
    near(breach('clubs'), 75, 1);
  });

  it('12 clubs can\'t Smash a Citrus Palace (5,000 HP) inside the 60-game-minute timer; 12 hatchets do it in 16 s', () => {
    const clubs = runBattle(battleOf({ attackers: guardsOf(12, 'att', 'clubs'), standHp: STAND_HP[4] }), { seed: 1 });
    expect(STAND_HP[4]).toBe(5000);
    expect(clubs.outcome).toBe('damaged');
    expect(clubs.duration).toBe(60);
    const hatchets = runBattle(battleOf({ attackers: guardsOf(12, 'att', 'hatchets'), standHp: STAND_HP[4] }), { seed: 1 });
    expect(hatchets.outcome).toBe('smashed');
    near(hatchets.duration, 16, 1);
  });
});

// ---------- the canon anchors ----------

describe('the canon combat anchors (400 fights each)', () => {
  const fists3 = () => henchmenOf(3, 1, 'fists');

  it('a Threat 1 raid (3 fists) usually beats an undefended L1 stand', () => {
    expect(winChance(battleOf({ attackers: fists3(), standHp: STAND_HP[0], detected: false }), 1, 400)).toBeGreaterThanOrEqual(0.75);
  });

  // Measured: the raid fails 78% of the time (3 fists, detected or not), and 92% for real Threat 1 parties of 2-3.
  it.fails('... and fails about 60% of the time against a Picket Fence and 1 guard with fists', () => {
    const lost = 1 - winChance(battleOf({ attackers: fists3(), defenders: guardsOf(1, 'def', 'fists'), ...fencedOf(1), standHp: STAND_HP[0], detected: false }), 2, 400);
    near(lost, 0.6, 0.05);
  });

  // Measured: the defense holds 100% of 400 real Threat 4 raids (8-12, clubs and hatchets) on a P4 or P5 plot with
  // 5 hatchet guards in Pro Gear and a goose, a slick and a sprinkler.
  it.fails('a kitted L5 plot (P4 or P5, 4-6 hatchet guards in Pro Gear, 2-3 gadgets) holds against a Threat 4 raid about 75% of the time', () => {
    const gadgets: GadgetId[] = ['goose', 'slick', 'sprinkler'];
    let holds = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const tier = seed % 2 ? 4 : 5;
      const r = runBattle(battleOf({ attackers: partyOf(4, seed), defenders: guardsOf(5, 'def', 'hatchets', 'pro'), ...fencedOf(tier), gadgets, standHp: STAND_HP[4], objective: seed % 10 < 7 ? 'smash' : 'shakedown', detected: seed % 5 < 2 }), { seed });
      if (r.winner === 'def') holds++;
    }
    near(holds / 400, 0.75, 0.05);
  });
});
