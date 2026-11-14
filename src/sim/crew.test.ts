import { describe, expect, it } from 'vitest';
import {
  buildClubhouse, buyGadget, buyPerimeter, canBuyGadget, canHire, canPromote, detectionChance, dutyXp, equip, GUARD_FEE, hireGuard, LOTTIES_CORNER, migrateSave, newGame, openStand,
  payCrew, planRaid, PLOTS, promote,
  expectedPassersby, raidOdds, raidOddsRange, raidTargets, rebuildCost, rebuildStand, refreshRecruits, RIVAL_HIRE_FEE, servingsAvailable, simulateRestOfDay, sleepUntilDawn,
  threatLevel, tickMinute, toggleAutoRepair, welcomeDex, type GameState,
} from './economy.ts';
import {
  availableRaiders, canPost, dexSquad, fenceRepairCost, fightRaid, fillable, fillPosts, guardFighter, holdsStronghold, neighborhoodWatch, overnightRepairs, postGuard, postsFor,
  canRaid, foughtByDay, henchmanFor, hqOdds, isSpoiled, raidParty, maybeSabotage, raidIsNight, raidIsNightAt, raidRepCost, repairFence, rivalDefenseSpend, rivalKit, spotAssault, squadFighters, strongholdTravelMult, towerCovers,
  type BattleReport, type Guard, type Raid,
} from './crew.ts';
import { AUTO_REPAIR_RANK, CLOSE, GADGETS, GEAR, GUARD_BASE, HENCHMEN, LESSON_DAY, MINUTES_PER_DAY, NIGHT_END, OPEN, PERIMETERS, PLAYER_RAID_LEAVE, RAID_PARTY, RIVAL_KIT, RIVAL_SABOTAGE, STAND_LEVELS, type RivalId } from './balance.ts';
import type { Fighter } from './combat.ts';
import { canGullScout, canScout, gullScout, isScouted, PIER, PIER_GOAL, pierFlightGoal, pierTarget, recordScouting, scoutedSnapshot, scoutWithLookout } from './scouting.ts';
import { checkGoals, goalReward, goalsNow } from './goals.ts';
import { reserveMinutes } from './reinforce.ts';
import { footholdFor, guardOf } from './fighters.ts';
import { BORDERS, DISTRICT_BY_ID, PLOT_BY_ID, withinTwo } from './map.ts';
import { rowAmount } from './ledger.ts';
import { citationRisk, citationRules, holdElection, raidBanEnds, type Platform } from './citations.ts';
import { canAssault, hqPlot, makeTruce, stormHQ, type AssaultResult } from './rivals.ts';
import { nightStep, onTheClock, squadHome, squadTrip, startNight, travelMinutes } from './night.ts';
import { festivalDays } from './calendar.ts';
import { canSaveTemplate, dropTemplate, saveTemplate, switchTemplates, templateAt, templates, templatesOn, TEMPLATES_ID } from './templates.ts';
import { helperLines } from './automation.ts';

/** An empty Street plot of yours, for a Clubhouse. */
const streetLot = (s: GameState) => { const lot = PLOTS.find((p) => p.type === 'street' && !s.plots[p.id].owner)!; s.plots[lot.id].owner = 'player'; return lot.id; };

/** A rival's Guard money for a test: what's left to spend, and whether its trade covers a new henchman's wage. */
function guardPurse(left: number, wages = true) {
  const purse = {
    left,
    pay: (cost: number) => {
      if (cost > purse.left) return false;
      purse.left -= cost;
      return true;
    },
    hire: () => wages && purse.pay(RIVAL_HIRE_FEE),
  };
  return purse;
}

function playDay(s: GameState) {
  openStand(s);
  simulateRestOfDay(s);
  sleepUntilDawn(s);
}

describe('crew and raids', () => {
  it('Dex joins free and the Hiring Hall opens at Rank 2', () => { // he joins on Day 4 (story.test.ts)
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

  it('no raids on the player on nights 1-2, then they come, never more than 2 quiet nights in a row', () => {
    const s = newGame(7);
    s.reputation = 4;
    s.plots[LOTTIES_CORNER].stand!.autoRestock = false; // a bare stand all along: this test is about raids
    let early = 0, later = 0, lastNight = 3, maxQuiet = 0;
    for (let d = 0; d < 40; d++) {
      s.cash = Math.max(s.cash, 200); // stay out of the red: this test is about raids, not going broke
      openStand(s);
      simulateRestOfDay(s);
      const incoming = s.raids.filter((r) => r.attacker !== 'player' && s.plots[r.target].owner === 'player').length;
      if (s.day <= 2) early += incoming; else later += incoming;
      if (incoming) lastNight = s.day;
      if (s.day > 3) maxQuiet = Math.max(maxQuiet, s.day - lastNight - 1);
      sleepUntilDawn(s);
      for (const p of Object.keys(s.plots)) if (s.plots[p].owner === 'player' && s.plots[p].stand?.wrecked) { s.cash += 1000; rebuildStand(s, p); }
    }
    expect(early).toBe(0);
    expect(later).toBeGreaterThan(10);
    expect(maxQuiet).toBeLessThanOrEqual(2 + 3); // the cap, plus a Respect stretch when every rival is backing off
    expect(threatLevel(s)).toBeGreaterThanOrEqual(1);
  }, 90_000); // 40 whole days: about 15 s alone, much longer while other checks share the machine

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
    footholdFor(s, target.id); // raids need a Foothold in the target's district
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
    expect(rebuildCost(s.plots[LOTTIES_CORNER])).toBe(15); // Lottie's table counts as $100
    expect(rebuildStand(s, LOTTIES_CORNER)).toBe(true);
    expect(s.cash).toBe(485);
  });

  it('the night is deterministic', () => {
    const a = newGame(11), b = newGame(11);
    for (let d = 0; d < 12; d++) { playDay(a); playDay(b); }
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  }, 90_000); // 12 whole days twice: about 15 s alone, much longer while other checks share the machine
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
    expect(rowAmount(s.today, 'wages')).toBe(-15); // the Ledger's Wages row, one guard paid
    expect(s.today.counts?.wages).toBe(1);
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
    s.raids.push({ id: 'r1', attacker: 'player', target: 'oldtown-0n', objective: 'smash', guards: [g.id], detected: false, eta: '02:00', leave: 25 * 60, at: 26 * 60 });
    expect(detectionChance(s, LOTTIES_CORNER, false)).toBe(0.6); // planned: still on the plot until it sets out
    s.raids[0].leave = s.minute;
    expect(detectionChance(s, LOTTIES_CORNER, false)).toBe(0.5);
    const [r] = s.raids.splice(0); // there and fought live (fight.ts): off the raid clock, in the fight
    s.fight = { id: 'f1', raid: r, night: false, seed: 1, t: 0, ticked: 0, commands: [], side: 'att',
      input: { attackers: [], defenders: [], perimeter: 0, fenceHp: 0, gadgets: [], standHp: 0, objective: 'smash', detected: false } };
    expect(detectionChance(s, LOTTIES_CORNER, false)).toBe(0.5);
    delete s.fight;
    expect(detectionChance(s, LOTTIES_CORNER, false)).toBe(0.6);
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

  it('Gull Flight: Squawk circles any rival plot at any hour, and the snapshot is good for 3 days', () => {
    const s = newGame(64);
    const target = raidTargets(s)[0].id;
    s.plots[target].defense.gadgets = ['goose'];
    expect(canGullScout(s, LOTTIES_CORNER)).toEqual({ ok: false, why: 'Circle a rival plot' });
    s.phase = 'night';
    s.minute = 25 * 60;
    expect(gullScout(s, target)).toBe(true);
    expect(scoutedSnapshot(s, target)).toMatchObject({ by: 'gull', day: s.day, until: s.day + 2, gadgets: ['goose'] });
    expect(s.news.at(-1)).toMatch(/^Captain Squawk circles .*: .*1 gadget/);
    const news = s.news.length;
    expect(gullScout(s, target)).toBe(false); // scouted today already: no second line
    expect(s.news).toHaveLength(news);
    s.day += 3;
    expect(isScouted(s, target)).toBe(false);
    expect(gullScout(s, target)).toBe(true);
  });

  it("unscouted, the win chance is a range from its rival's kit a size up to a size down, never bare, with the real odds inside", () => {
    const s = newGame(65);
    s.rank = 4;
    s.guards = Array.from({ length: 3 }, (_, i) => guardOf('clubs', 'vest', 1, 'Hothead', { id: `r${i}`, name: `Raider ${i}` }));
    const ids = s.guards.map((g) => g.id);
    const target = raidTargets(s).find((p) => s.plots[p.id].stand)!.id;
    const ps = s.plots[target];
    ps.stand!.level = 2; // a Wooden Stand: its rival builds toward a Picket Fence, a Tin-Can Alarm and 2 henchmen
    ps.defense = { tier: 1, fenceHp: PERIMETERS[0].hp, gadgets: ['alarm'] };
    ps.garrison = 1;
    const before = JSON.stringify(ps), id = s.nextId;
    const kitted = (k: (typeof RIVAL_KIT)[number]) =>
      raidOdds(s, target, ids, 'smash', true, undefined, { tier: k.fence, gadgets: k.gadgets.slice(0, 2), garrison: postsFor(s, target), kit: k });
    const up = kitted(RIVAL_KIT[2]), down = kitted(RIVAL_KIT[0]); // a Kiosk's kit, and a Cart's
    const real = raidOdds(s, target, ids, 'smash', true);
    const bare = raidOdds(s, target, ids, 'smash', true, undefined, { tier: 0, gadgets: [], garrison: 0 });
    expect(JSON.stringify(ps)).toBe(before); // a guess is a pure read
    expect(s.nextId).toBe(id);
    expect(up).toBeLessThan(down);
    const [lo, hi] = raidOddsRange(s, target, ids, 'smash', true);
    expect([lo, hi]).toEqual([Math.min(up, real), Math.max(down, real)]);
    expect(lo).toBeLessThan(real);
    expect(hi).toBeGreaterThan(real);
    expect(hi).toBeLessThan(bare); // never bare: a rival stand has at least its row's fence
    // A Cart has no size down: its own kit is the soft end.
    ps.stand!.level = 1;
    expect(raidOddsRange(s, target, ids, 'smash', true)[1]).toBe(Math.max(kitted(RIVAL_KIT[0]), raidOdds(s, target, ids, 'smash', true)));
    // Whatever the rival did past its kit, the real odds stay inside the range.
    ps.stand!.level = 2;
    ps.garrison = 9;
    ps.defense = { tier: 4, fenceHp: PERIMETERS[3].hp, gadgets: ['alarm', 'goose', 'slick'] };
    expect(raidOddsRange(s, target, ids, 'smash', true)[0]).toBe(raidOdds(s, target, ids, 'smash', true));
  });

  it("scouts a target by day, then leads tonight's Sabotage on it: free for raids from the Evening", () => {
    const { s, dex } = setup(66);
    s.cash = 5000;
    const target = raidTargets(s).find((p) => s.plots[p.id].stand)!.id;
    footholdFor(s, target);
    expect(scoutWithLookout(s, dex.id, target)).toBe(true);
    openStand(s);
    expect(availableRaiders(s).map((g) => g.id)).not.toContain(dex.id); // watching the plot all day
    simulateRestOfDay(s);
    expect(s.phase).toBe('report');
    expect(availableRaiders(s).map((g) => g.id)).toContain(dex.id); // the Evening: back from scouting
    expect(canRaid(s, target, [dex.id], 'sabotage')).toEqual({ ok: true });
    expect(planRaid(s, target, [dex.id], 'sabotage', 'tonight')).toBe(true);
  });

  it('scouts by day only, and is back on post for the night', () => {
    const { s, dex } = setup(63);
    const target = raidTargets(s)[0].id;
    expect(scoutWithLookout(s, dex.id, target)).toBe(true);
    expect(detectionChance(s, LOTTIES_CORNER, true)).toBe(0.25); // away watching: 50% less the night's 25
    s.phase = 'night';
    s.minute = 23 * 60;
    expect(detectionChance(s, LOTTIES_CORNER, true)).toBe(0.5); // back: 75% less 25
    delete dex.scoutDay;
    expect(canScout(s, dex.id, target)).toEqual({ ok: false, why: 'Scout by day' });
  });

  it('holds the post until their raid sets out, and is away till the squad is home', () => {
    const { s, dex } = setup(64);
    const target = raidTargets(s)[0].id;
    s.raids.push({ id: 'rx', attacker: 'player', target, objective: 'smash', guards: [dex.id], detected: false, eta: '02:00', leave: 25 * 60, at: 26 * 60 });
    expect(detectionChance(s, LOTTIES_CORNER, false)).toBe(0.75); // planned, not gone
    s.phase = 'night';
    s.minute = 23 * 60;
    expect(detectionChance(s, LOTTIES_CORNER, true)).toBe(0.5);
    s.minute = 25 * 60;
    expect(detectionChance(s, LOTTIES_CORNER, true)).toBe(0.25); // set out: the post stands empty
    s.raids[0].back = 28 * 60;
    s.minute = 27 * 60;
    expect(detectionChance(s, LOTTIES_CORNER, true)).toBe(0.25); // walking home: still empty
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
    footholdFor(s, target);
    expect(planRaid(s, target, [dex.id, 'gb'], 'shakedown', 'now')).toBe(true); // the squad travels (nights): it fights on arrival
    openStand(s);
    let report: BattleReport | undefined;
    while (!report && s.phase === 'open') for (const e of tickMinute(s)) if (e.type === 'fight') report = e.report;
    if (!report) throw new Error('raid did not run');
    const bea = report.attackers.find((f) => f.id === 'gb')!;
    expect(bea.nerve).toBe(guardFighter(guard({ trait: 'Sprinter' }), 'att', false).nerve + 20);
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
    footholdFor(s, a);
    footholdFor(s, b);
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

  it('a raid that gets there at 20:00 sharp is a night raid, as the Planner said: no star, night odds', () => {
    const s = crew(84);
    openStand(s);
    const target = raidTargets(s)[0].id;
    footholdFor(s, target);
    const ids = [s.guards[0].id];
    s.minute = CLOSE - squadTrip(s, target, 'now', ids).travel; // sent now, it gets there as the stands close
    expect(squadTrip(s, target, 'now', ids).at).toBe(CLOSE);
    expect(raidRepCost(s, ids, 'smash', raidIsNightAt(CLOSE))).toBe(0);
    expect(planRaid(s, target, ids, 'smash', 'now')).toBe(true);
    while (s.minute < CLOSE - 1) tickMinute(s);
    s.minute = CLOSE; // tickMinute's own order: the clock moves on, raids land, and only then do the stands close
    const stars = s.reputation;
    const report = onTheClock(s).flatMap((e) => (e.type === 'fight' ? [e.report] : []))[0];
    expect(report?.target).toBe(target);
    expect(report.night).toBe(true);
    expect(s.reputation).toBe(stars);
  });

  it('a Sneaky raider takes 25 more points off, once, down to 0%, and the planner knows', () => {
    const s = crew(83);
    s.guards[0].trait = 'Sneaky';
    const sneak = s.guards[0].id;
    const target = raidTargets(s).find((p) => !s.plots[p.id].defense.gadgets.length)!.id;
    footholdFor(s, target);
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
    const club = PLOTS.find((p) => p.district === 'maple' && p.type === 'street' && p.id !== LOTTIES_CORNER)!.id;
    const over = PLOTS.find((p) => p.district === BORDERS.maple[0] && p.type === 'street')!.id;
    expect([reserveMinutes(s, club, LOTTIES_CORNER), reserveMinutes(s, over, LOTTIES_CORNER)]).toEqual([30, 60]);
    own(s, 'maple', 9); // 9 of 12 = 75%
    expect(holdsStronghold(s, 'maple')).toBe(true);
    expect(strongholdTravelMult(s, 'maple')).toBe(0.5);
    expect(strongholdTravelMult(s, 'harbor')).toBe(1);
    expect([reserveMinutes(s, club, LOTTIES_CORNER), reserveMinutes(s, over, LOTTIES_CORNER)]).toEqual([15, 30]); // Ring the Bell gets there in half the time
    expect(detectionChance(s, LOTTIES_CORNER, false)).toBe(0.6);
    expect(detectionChance(s, LOTTIES_CORNER, true)).toBe(0.35);
    s.plots['harbor-1n'].owner = 'player';
    expect(detectionChance(s, 'harbor-1n', false)).toBe(0.5);
  });
});

describe('the Watchtower', () => {
  it('covers its plot and its owner\'s plots within 2, once, and nothing past them', () => {
    // Only plots that are "within 2" however neighbors are counted: two along the same side, or across and one along.
    const s = newGame(93);
    expect(LOTTIES_CORNER).toBe('maple-2s');
    for (const id of ['maple-0s', 'maple-1n', 'maple-4s', 'maple-5s', 'maple-5n']) s.plots[id].owner = 'player';
    s.plots[LOTTIES_CORNER].defense.gadgets = ['watchtower'];
    expect(detectionChance(s, LOTTIES_CORNER, false)).toBe(0.8);
    expect(detectionChance(s, 'maple-0s', false)).toBe(0.8); // two lots along
    expect(detectionChance(s, 'maple-4s', false)).toBe(0.8);
    expect(detectionChance(s, 'maple-1n', false)).toBe(0.8); // across the street and one along
    expect(detectionChance(s, 'maple-5s', false)).toBe(0.5); // three along: out of range
    expect(detectionChance(s, 'maple-5n', false)).toBe(0.5);
    s.plots['maple-1n'].defense.gadgets = ['watchtower']; // a second tower in range doesn't stack
    expect(detectionChance(s, 'maple-0s', false)).toBe(0.8);
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

describe('overnight repairs', () => {
  const bro = (i: number): Fighter => ({ id: `b${i}`, name: `Bro ${i}`, side: 'att', hp: 100, hit: 10, chop: 10, nerve: 50, armor: 0, weapon: 'fists' });
  const raidOn = (s: GameState, target: string, n = 2): Raid => ({
    id: `r${s.nextId++}`, attacker: 'blenders', target, objective: 'smash', party: Array.from({ length: n }, (_, i) => bro(i)), detected: true, eta: '01:00',
  });
  const slipped = (r: ReturnType<typeof fightRaid>) => r.events.filter((e) => e.type === 'stun' && e.by === 'slick').length;

  it('every raid on a fenced plot, won or lost, costs its flat repair overnight', () => {
    const s = newGame(95);
    s.cash = 1000;
    expect(buyPerimeter(s, LOTTIES_CORNER)).toBe(true);
    const ps = s.plots[LOTTIES_CORNER];
    fightRaid(s, raidOn(s, LOTTIES_CORNER), true);
    fightRaid(s, raidOn(s, LOTTIES_CORNER), true);
    expect(ps.defense.repairs).toBe(2);
    expect(fenceRepairCost(ps)).toBe(2 * PERIMETERS[0].repair);
    const cash = s.cash, repairs = rowAmount(s.today, 'repairs');
    overnightRepairs(s);
    expect(s.cash).toBe(cash - 30);
    expect(rowAmount(s.today, 'repairs')).toBe(repairs - 30); // the Ledger's Repairs row
    expect(ps.defense.fenceHp).toBe(PERIMETERS[0].hp);
    expect(fenceRepairCost(ps)).toBe(0);
  });

  it('a Slick goes off once, then waits for its $25 reset; short of cash, repairs wait too', () => {
    const s = newGame(96);
    s.rank = 4;
    s.cash = 2000;
    buyPerimeter(s, LOTTIES_CORNER);
    expect(buyGadget(s, LOTTIES_CORNER, 'slick')).toBe(true);
    const ps = s.plots[LOTTIES_CORNER];
    expect(slipped(fightRaid(s, raidOn(s, LOTTIES_CORNER, 4), true))).toBe(3);
    expect(ps.defense.slickSprung).toBe(true);
    expect(slipped(fightRaid(s, raidOn(s, LOTTIES_CORNER, 4), true))).toBe(0); // the same night: already spent
    s.cash = 10;
    ps.defense.fenceHp = 100;
    overnightRepairs(s);
    expect(ps.defense.fenceHp).toBe(100);
    expect(ps.defense.slickSprung).toBe(true);
    expect(s.cash).toBe(10);
    expect(s.news.at(-1)).toContain('No cash for the overnight repairs');
    s.cash = 100;
    expect(repairFence(s, LOTTIES_CORNER)).toBe(true); // two raids' worth
    expect(s.cash).toBe(70);
    expect(ps.defense.fenceHp).toBe(PERIMETERS[0].hp);
    overnightRepairs(s);
    expect(ps.defense.slickSprung).toBeUndefined();
    expect(s.cash).toBe(45);
    expect(slipped(fightRaid(s, raidOn(s, LOTTIES_CORNER, 4), true))).toBe(3);
  });

  it("from Rank 3 a plot Auto-Repair skips keeps its chopped fence and sprung Slick for you; below it, every fence is mended", () => {
    const s = newGame(98);
    s.rank = 4;
    s.cash = 2000;
    buyPerimeter(s, LOTTIES_CORNER);
    buyGadget(s, LOTTIES_CORNER, 'slick');
    const ps = s.plots[LOTTIES_CORNER];
    fightRaid(s, raidOn(s, LOTTIES_CORNER, 4), true);
    expect(ps.defense.slickSprung).toBe(true);
    expect(toggleAutoRepair(s, LOTTIES_CORNER)).toBe(true); // Plots to skip
    const cash = s.cash, hp = ps.defense.fenceHp, bill = fenceRepairCost(ps);
    expect(bill).toBeGreaterThan(0);
    overnightRepairs(s);
    expect(s.cash).toBe(cash); // nothing paid for the skipped plot
    expect(ps.defense.fenceHp).toBe(hp);
    expect(fenceRepairCost(ps)).toBe(bill);
    expect(ps.defense.slickSprung).toBe(true);
    expect(repairFence(s, LOTTIES_CORNER)).toBe(true); // patched by hand
    expect(ps.defense.fenceHp).toBe(PERIMETERS[0].hp);
    expect(toggleAutoRepair(s, LOTTIES_CORNER)).toBe(true); // taken back on
    overnightRepairs(s);
    expect(ps.defense.slickSprung).toBeUndefined();
    // Below Rank 3 there's no Auto-Repair, so no skip list: the flat repair runs every night, a skip left over or not.
    const low = newGame(99);
    low.rank = AUTO_REPAIR_RANK - 1;
    low.cash = 1000;
    buyPerimeter(low, LOTTIES_CORNER);
    fightRaid(low, raidOn(low, LOTTIES_CORNER), true);
    low.plots[LOTTIES_CORNER].noAutoRepair = true;
    const before = low.cash;
    overnightRepairs(low);
    expect(low.cash).toBe(before - PERIMETERS[0].repair);
    expect(fenceRepairCost(low.plots[LOTTIES_CORNER])).toBe(0);
    expect(low.plots[LOTTIES_CORNER].defense.fenceHp).toBe(PERIMETERS[0].hp);
  });

  it('a rival pays its repairs from its Guard money; overnight repairs leave its plots alone', () => {
    const s = newGame(97);
    const id = PLOTS.find((p) => s.plots[p.id].owner === 'blenders' && s.plots[p.id].stand && p.type !== 'hq')!.id;
    const ps = s.plots[id];
    ps.defense = { tier: 2, fenceHp: 100, gadgets: ['slick'], repairs: 2, slickSprung: true };
    s.rivals.blenders.cash = 1000;
    overnightRepairs(s);
    expect(ps.defense.fenceHp).toBe(100);
    expect(s.rivals.blenders.cash).toBe(1000);
    const purse = guardPurse(2 * PERIMETERS[1].repair + 25, false);
    rivalDefenseSpend(s, 'blenders', purse);
    expect(ps.defense.fenceHp).toBe(PERIMETERS[1].hp);
    expect(ps.defense.repairs).toBeUndefined();
    expect(ps.defense.slickSprung).toBeUndefined();
    expect(purse.left).toBe(0); // the flat fee for each of the 2 raids, and the Slick's $25
    ps.defense.fenceHp = 50;
    ps.defense.repairs = 1;
    rivalDefenseSpend(s, 'blenders', guardPurse(PERIMETERS[1].repair - 1, false));
    expect(ps.defense.fenceHp).toBe(50); // short of the repair, the fence stays chopped
  });

  it('an old save\'s chopped fence is queued for the next overnight repair', () => {
    const s = newGame(98);
    s.cash = 500;
    buyPerimeter(s, LOTTIES_CORNER);
    s.plots[LOTTIES_CORNER].defense.fenceHp = 40;
    const loaded = migrateSave(JSON.parse(JSON.stringify(s)))!;
    expect(loaded.plots[LOTTIES_CORNER].defense.repairs).toBe(1);
    expect(migrateSave(JSON.parse(JSON.stringify(loaded)))!.plots[LOTTIES_CORNER].defense.repairs).toBe(1);
    playDay(loaded);
    expect(loaded.plots[LOTTIES_CORNER].defense.fenceHp).toBe(PERIMETERS[0].hp);
  });
});

describe('guard posts', () => {
  const crew = (seed: number, n: number) => {
    const s = newGame(seed);
    s.rank = 4;
    s.cash = 50000;
    welcomeDex(s);
    for (let i = 1; i < n; i++) {
      s.guards.push({ id: `p${i}`, name: `Post ${i}`, trait: 'Tough Cookie', level: 1, xp: 0, weapon: 'clubs', gear: 'none', post: null, outUntil: 0, fee: 0 });
    }
    return s;
  };

  it('a stand\'s level sets its posts (1, 2, 3, 4, 6), other buildings have 3 and a bare lot none', () => {
    const s = newGame(100);
    const ps = s.plots[LOTTIES_CORNER];
    expect([1, 2, 3, 4, 5].map((level) => { ps.stand!.level = level; return postsFor(s, LOTTIES_CORNER); })).toEqual([1, 2, 3, 4, 6]);
    s.plots['maple-1n'] = { ...s.plots['maple-1n'], owner: 'player', facility: { kind: 'bottling', level: 1 } };
    expect(postsFor(s, 'maple-1n')).toBe(3);
    s.plots['maple-0n'].owner = 'player';
    expect(postsFor(s, 'maple-0n')).toBe(0);
  });

  it('posting stops at the cap; a new hire waits at the Clubhouse when the posts are full', () => {
    const s = crew(101, 3);
    const [dex, a, b] = s.guards;
    expect(dex.post).toBe(LOTTIES_CORNER); // the Folding Table's one post
    expect(canPost(s, a.id, LOTTIES_CORNER)).toEqual({ ok: false, why: 'All 1 post taken' });
    expect(postGuard(s, a.id, LOTTIES_CORNER)).toBe(false);
    s.plots[LOTTIES_CORNER].stand!.level = 2;
    expect(postGuard(s, a.id, LOTTIES_CORNER)).toBe(true);
    expect(canPost(s, b.id, LOTTIES_CORNER)).toEqual({ ok: false, why: 'All 2 posts taken' });
    s.plots['maple-0n'].owner = 'player';
    expect(canPost(s, b.id, 'maple-0n')).toEqual({ ok: false, why: 'No guard posts on a bare lot' });
    expect(postGuard(s, a.id, null)).toBe(true); // the reserve is always open
    refreshRecruits(s, true);
    const hire = s.recruits[0].id;
    postGuard(s, b.id, LOTTIES_CORNER);
    expect(buildClubhouse(s, streetLot(s))).toBe(true); // beds for the hire
    expect(hireGuard(s, hire)).toBe(true);
    expect(s.guards.find((g) => g.id === hire)!.post).toBeNull();
    expect(s.news.at(-1)).toContain('waits at the Clubhouse');
  });

  it("Dex's lesson day: nobody posts him and the Corner's one post is taken, so he stays in the reserve", () => {
    const s = newGame(107);
    s.day = LESSON_DAY.crew - 1;
    s.phase = 'report';
    sleepUntilDawn(s); // Dex joins unposted: stationing him is today's lesson
    const dex = s.guards.find((g) => g.name === 'Dex Moody')!;
    expect(dex.post).toBeNull();
    s.guards.push({ id: 'gus', name: 'Gus Puddle', trait: 'Tough Cookie', level: 1, xp: 0, weapon: 'clubs', gear: 'none', post: null, outUntil: 0, fee: 0 });
    expect(postGuard(s, 'gus', LOTTIES_CORNER)).toBe(true); // the Folding Table's one post
    s.cash = Math.max(s.cash, 200);
    openStand(s);
    simulateRestOfDay(s); // nobody stations Dex
    expect(dex.post).toBeNull();
    expect(s.guards.filter((g) => g.post === LOTTIES_CORNER).map((g) => g.id)).toEqual(['gus']);
    expect(s.alerts!.some((a) => a.text === `Dex: "Nobody posted me, and the posts are full. I'm in the reserve."`)).toBe(true);
    expect(s.goals!.done).toContain('lesson-dex');
  });

  it('"fill the posts" takes the reserve first, never a guard from a plot a warned raid is heading for', () => {
    const s = crew(102, 5);
    const [, a, b, c, d] = s.guards;
    s.plots['maple-1s'] = { ...s.plots['maple-1s'], owner: 'player', facility: { kind: 'bottling', level: 1 } };
    s.plots['maple-3s'] = { ...s.plots['maple-3s'], owner: 'player', facility: { kind: 'bottling', level: 1 } };
    postGuard(s, a.id, 'maple-1s');
    postGuard(s, b.id, 'maple-3s');
    s.raids.push({ id: 'r9', attacker: 'blenders', target: 'maple-3s', objective: 'smash', party: [], detected: true, eta: '23:00', warned: true });
    s.plots[LOTTIES_CORNER].stand!.level = 5; // 6 posts, Dex holds one
    expect(fillable(s, LOTTIES_CORNER)).toBe(3); // c and d from the reserve, a from quiet maple-1s; b stays put
    expect(fillPosts(s, LOTTIES_CORNER)).toBe(3);
    expect([c.post, d.post, a.post, b.post]).toEqual([LOTTIES_CORNER, LOTTIES_CORNER, LOTTIES_CORNER, 'maple-3s']);
    expect(fillable(s, LOTTIES_CORNER)).toBe(0);
  });

  it('old saves keep the first guards on a full plot and send the rest to the Clubhouse', () => {
    const s = crew(103, 4);
    for (const g of s.guards) g.post = LOTTIES_CORNER;
    s.guards[3].post = 'oldtown-1s'; // a rival's plot
    const loaded = migrateSave(JSON.parse(JSON.stringify(s)))!;
    expect(loaded.guards.map((g) => g.post)).toEqual([LOTTIES_CORNER, null, null, null]);
  });

  it('rival garrisons never outnumber their posts', () => {
    for (const seed of [104, 105, 106]) {
      const s = newGame(seed);
      for (let d = 0; d < 6; d++) playDay(s);
      for (const p of PLOTS) {
        const ps = s.plots[p.id];
        if (ps.owner && ps.owner !== 'player' && ps.stand) expect(ps.garrison ?? 0).toBeLessThanOrEqual(postsFor(s, p.id));
      }
    }
  });
});

describe('rival plot defenses', () => {
  /** A rival's best plot, stripped bare and made a Kiosk, with deep pockets. */
  const kiosk = (seed: number) => {
    const s = newGame(seed);
    const id = PLOTS.find((p) => s.plots[p.id].owner === 'blenders' && s.plots[p.id].stand && p.type !== 'hq')!.id;
    const ps = s.plots[id];
    ps.stand!.level = 3;
    ps.defense = { tier: 0, fenceHp: 0, gadgets: [] };
    ps.garrison = 0;
    ps.invested = 1e7;
    s.rivals.blenders.cash = 1e6;
    return { s, id, ps };
  };

  it('a Kiosk builds toward the spec\'s kit one step a dawn: a Picket, 3 henchmen, then cans and a goose', () => {
    const { s, ps } = kiosk(110);
    const steps: string[] = [];
    for (let i = 0; i < 7; i++) {
      rivalDefenseSpend(s, 'blenders', guardPurse(1e6));
      steps.push(`${ps.defense.tier}/${ps.defense.gadgets.join('+')}/${ps.garrison}`);
    }
    expect(steps).toEqual(['1//0', '1//1', '1//2', '1//3', '1/alarm/3', '1/alarm+goose/3', '1/alarm+goose/3']);
  });

  it('short of the next step, the money goes to the one after it; nothing past the Guard money', () => {
    const { s, ps } = kiosk(111);
    const purse = guardPurse(120);
    rivalDefenseSpend(s, 'blenders', purse);
    expect(purse.left).toBe(20); // no Picket for $120 and no henchman for his fee, but a Tin-Can for $100
    expect(ps.defense.tier).toBe(0);
    expect(ps.garrison).toBe(0);
    expect(ps.defense.gadgets).toEqual(['alarm']);
    rivalDefenseSpend(s, 'blenders', guardPurse(1e6, false)); // a Picket, and no henchman its trade can't pay
    rivalDefenseSpend(s, 'blenders', guardPurse(1e6, false));
    expect([ps.defense.tier, ps.garrison, ps.defense.gadgets.join('+')]).toEqual([1, 0, 'alarm+goose']);
  });

  it('only the 3 most valuable plots get the money', () => {
    const s = newGame(112);
    const mine = PLOTS.filter((p) => s.plots[p.id].owner === 'blenders' && s.plots[p.id].stand && p.type !== 'hq').slice(0, 4);
    expect(mine.length).toBe(4);
    mine.forEach((p, i) => Object.assign(s.plots[p.id], { invested: 1e6 - i, garrison: 0, defense: { tier: 0, fenceHp: 0, gadgets: [] } }));
    s.rivals.blenders.cash = 1e6;
    rivalDefenseSpend(s, 'blenders', guardPurse(1e6));
    expect(mine.map((p) => s.plots[p.id].defense.tier)).toEqual([1, 1, 1, 0]);
  });

  it('a new game opens some fenced rival stands with their kit\'s first gadget, counted as investment', () => {
    let opened = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const s = newGame(seed);
      for (const p of PLOTS) {
        const ps = s.plots[p.id];
        if (!ps.owner || ps.owner === 'player' || !ps.stand) continue;
        const base = STAND_LEVELS.slice(0, ps.stand.level).reduce((a, l) => a + l.cost, 0);
        const fence = ps.defense.tier ? PERIMETERS[0].cost : 0;
        if (!ps.defense.gadgets.length) { expect(ps.invested).toBe(base + fence); continue; }
        opened++;
        expect(ps.defense.tier).toBe(1); // only the fenced ones
        expect(ps.defense.gadgets).toEqual([rivalKit(ps).gadgets[0]]);
        expect(ps.invested).toBe(base + fence + GADGETS[ps.defense.gadgets[0]].cost);
      }
    }
    expect(opened).toBeGreaterThan(0);
  });

  it('the garrison fights with its kit row\'s weapons and padding, never more than its posts', () => {
    const { s, id, ps } = kiosk(113);
    ps.garrison = 9;
    s.rank = 4;
    welcomeDex(s);
    const report = fightRaid(s, { id: 'r1', attacker: 'player', target: id, objective: 'shakedown', guards: [s.guards[0].id], detected: false, eta: '01:00' }, true);
    expect(report.defenders).toHaveLength(3);
    expect(report.defenders.every((f) => f.weapon === 'clubs' && f.hp === GUARD_BASE.hp && f.armor === 0 && f.nerve === GUARD_BASE.nerve)).toBe(true);
  });
});

describe('rival henchmen', () => {
  const share = (fs: Fighter[], weapon: string) => fs.filter((f) => f.weapon === weapon).length / fs.length;

  it('a Threat 4 raiding party comes in Pro Gear, four in five with hatchets; at home the tier keeps its vests', () => {
    const s = newGame(120);
    const rng = { seed: 7 };
    const raiders = Array.from({ length: 40 }, () => raidParty(s, 'fizzco', 4, rng)).flat();
    const home = Array.from({ length: 400 }, (_, i) => henchmanFor(s, 'fizzco', 4, rng, i)); // an HQ's defenders, its help
    expect(raiders.every((f) => f.level === 4 && f.gear === 'pro' && f.armor === GEAR.pro.armor)).toBe(true);
    expect(share(raiders, 'fists')).toBe(0);
    expect(share(raiders, 'hatchets')).toBeGreaterThan(0.72);
    expect(share(raiders, 'hatchets')).toBeLessThan(0.88);
    expect(home.every((f) => f.level === 4 && f.gear === 'vest' && f.armor === GEAR.vest.armor)).toBe(true);
    expect(share(home, 'fists')).toBeGreaterThan(0);
    expect(share(home, 'hatchets')).toBeGreaterThan(0.22);
    expect(share(home, 'hatchets')).toBeLessThan(0.38);
    // At every other Threat a raider is kitted as the tier's henchmen are at home.
    for (const t of [1, 2, 3, 5]) expect([RAID_PARTY[t - 1].gear, RAID_PARTY[t - 1].weapons]).toEqual([HENCHMEN[t - 1].gear, HENCHMEN[t - 1].weapons]);
  });
});

describe('Sabotage', () => {
  const saboteurs = (seed: number) => {
    const s = newGame(seed);
    s.rank = 4;
    s.cash = 5000;
    welcomeDex(s);
    s.guards.push({ id: 'sn', name: 'Sly Sneak', trait: 'Sneaky', level: 3, xp: 0, weapon: 'clubs', gear: 'vest', post: null, outUntil: 0, fee: 0 });
    for (let i = 0; i < 3; i++) s.guards.push({ id: `m${i}`, name: `Muscle ${i}`, trait: 'Tough Cookie', level: 3, xp: 0, weapon: 'clubs', gear: 'vest', post: null, outUntil: 0, fee: 0 });
    const target = PLOTS.find((p) => s.plots[p.id].owner === 'blenders' && s.plots[p.id].stand && p.type !== 'hq')!.id;
    s.plots[target].defense = { tier: 0, fenceHp: 0, gadgets: [] };
    s.plots[target].garrison = 0;
    footholdFor(s, target);
    return { s, target, muscle: ['m0', 'm1', 'm2'] };
  };

  it('opens at Rank 4, needs a stand and a Lookout or a Sneaky guard, and costs 0.1 star by day', () => {
    const { s, target, muscle } = saboteurs(120);
    s.rank = 3;
    expect(canRaid(s, target, ['sn'], 'sabotage')).toEqual({ ok: false, why: 'Sabotage unlocks at Rank 4, Neighborhood Name' });
    s.rank = 4;
    expect(canRaid(s, target, muscle, 'sabotage')).toEqual({ ok: false, why: 'Sabotage needs a Lookout or a Sneaky guard' });
    expect(canRaid(s, target, [...muscle, 'sn'], 'sabotage').ok).toBe(true);
    s.guards[1].trait = 'Tough Cookie';
    s.guards[1].specialty = 'lookout';
    expect(canRaid(s, target, [...muscle, s.guards[1].id], 'sabotage').ok).toBe(true);
    expect(raidRepCost(s, ['sn'], 'sabotage', false)).toBe(0.1);
    expect(raidRepCost(s, ['sn'], 'sabotage', true)).toBe(0);
  });

  it('a won Sabotage takes nothing, spoils the stock and shuts the stand for its next day only', () => {
    const { s, target, muscle } = saboteurs(121);
    expect(planRaid(s, target, [...muscle, 'sn'], 'sabotage', 'tonight')).toBe(true);
    openStand(s);
    simulateRestOfDay(s);
    sleepUntilDawn(s);
    const b = s.battles.find((x) => x.target === target)!;
    expect(b.sabotage).toBe(true);
    expect(b.outcome).toBe('robbed');
    expect(b.loot).toBe(0);
    expect(s.news.join(' ')).toContain('SABOTAGE!');
    expect(isSpoiled(s, s.plots[target])).toBe(true);
    expect(expectedPassersby(s, target)).toBe(0);
    expect(canRaid(s, target, [...muscle, 'sn'], 'sabotage')).toEqual({ ok: false, why: 'Their stock is already spoiled' });
    openStand(s);
    simulateRestOfDay(s);
    expect(s.plots[target].stand!.day.customers).toBe(0);
    sleepUntilDawn(s);
    expect(isSpoiled(s, s.plots[target])).toBe(false);
    expect(expectedPassersby(s, target)).toBeGreaterThan(0);
  });

  it("a Sabotage whose Lookout or Sneaky guard is KO'd before it sets out is called off: the stock is safe", () => {
    const { s, target, muscle } = saboteurs(128);
    expect(planRaid(s, target, [...muscle, 'sn'], 'sabotage', 'tonight')).toBe(true);
    s.guards.find((g) => g.id === 'sn')!.outUntil = s.day + 2; // KO'd before 01:00, as a raid on you leaves them
    openStand(s);
    simulateRestOfDay(s);
    sleepUntilDawn(s);
    expect(s.battles.some((b) => b.attacker === 'player' && b.target === target)).toBe(false);
    expect(s.news).toContain(`Sabotage on ${PLOT_BY_ID[target].name} called off: no Lookout or Sneaky guard fit to go.`);
    expect(isSpoiled(s, s.plots[target])).toBe(false);
    expect(s.plots[target].stand!.spoiledDay ?? 0).toBeLessThan(s.day);
  });

  it('a Sabotage sent now lands by day: customers see it, and the stand sells nothing its next day', () => {
    const { s, target, muscle } = saboteurs(124);
    expect(s.phase).toBe('prep');
    const stars = s.reputation;
    expect(planRaid(s, target, [...muscle, 'sn'], 'sabotage', 'now')).toBe(true); // it sets out as the stands open
    openStand(s);
    let b: BattleReport | undefined;
    while (!b && s.minute < CLOSE) for (const e of tickMinute(s)) if (e.type === 'fight') b = e.report;
    expect([b?.outcome, b?.sabotage]).toEqual(['robbed', true]);
    expect(s.reputation).toBeCloseTo(stars - 0.1, 5); // customers see a daytime raid
    expect(isSpoiled(s, s.plots[target])).toBe(false); // today's stock was already out
    expect(s.plots[target].stand!.spoiledDay).toBe(s.day + 1);
    simulateRestOfDay(s);
    sleepUntilDawn(s);
    expect(isSpoiled(s, s.plots[target])).toBe(true);
    openStand(s);
    simulateRestOfDay(s);
    expect(s.plots[target].stand!.day.customers).toBe(0);
    sleepUntilDawn(s);
    expect(isSpoiled(s, s.plots[target])).toBe(false);
  });

  it('the tutorial raid is never a Sabotage, and Peaceful has none at all', () => {
    const rates = { ...RIVAL_SABOTAGE };
    for (const r of Object.keys(RIVAL_SABOTAGE) as RivalId[]) RIVAL_SABOTAGE[r] = 1; // any raid that can be a Sabotage is one
    try {
      const s = newGame(126);
      s.rank = 4;
      s.reputation = 4;
      welcomeDex(s);
      for (let d = 0; d < 30 && !s.battles.some((b) => b.defender === 'player'); d++) {
        s.cash = Math.max(s.cash, 500);
        openStand(s);
        simulateRestOfDay(s);
        for (const r of s.raids) if (r.attacker !== 'player' && s.plots[r.target].owner === 'player') expect(r.sabotage).toBeUndefined();
        sleepUntilDawn(s);
      }
      expect(s.battles.some((b) => b.defender === 'player')).toBe(true);
    } finally {
      Object.assign(RIVAL_SABOTAGE, rates);
    }
    const calm = newGame(127);
    calm.settings.mode = 'sandbox';
    calm.settings.peaceful = true;
    calm.rank = 4;
    expect(canRaid(calm, PLOTS.find((p) => calm.plots[p.id].owner === 'blenders' && calm.plots[p.id].stand && p.type !== 'hq')!.id, ['x'], 'sabotage'))
      .toEqual({ ok: false, why: 'Peaceful: no raids in this Sandbox' });
  }, 90_000); // up to 30 whole days

  it('rivals sabotage your stands from Rank 4, Cold Brew most of all', () => {
    const s = newGame(122);
    const raid = (attacker: Raid['attacker']): Raid => ({ id: 'x', attacker, target: LOTTIES_CORNER, objective: 'smash', party: [], detected: true, eta: '01:00' });
    const share = (attacker: Raid['attacker']) => {
      let n = 0;
      for (let i = 0; i < 2000; i++) { const r = raid(attacker); maybeSabotage(s, r, { seed: i * 7919 }); if (r.sabotage) n++; }
      return n / 2000;
    };
    s.rank = 3;
    expect(share('coldbrew')).toBe(0);
    s.rank = 4;
    expect(share('coldbrew')).toBeCloseTo(0.4, 1);
    expect(share('fizzco')).toBeCloseTo(0.1, 1);
  });

  it('a Sabotage on your stand empties its stock and closes it tomorrow, with no cash taken', () => {
    const s = newGame(123);
    s.rank = 4;
    openStand(s);
    simulateRestOfDay(s);
    const st = s.plots[LOTTIES_CORNER].stand!;
    st.inventory.sugar = 50;
    const cash = s.cash;
    const bros: Fighter[] = [0, 1, 2].map((i) => ({ id: `c${i}`, name: `Barista ${i}`, side: 'att', hp: 100, hit: 18, chop: 10, nerve: 50, armor: 0, weapon: 'clubs' }));
    const report = fightRaid(s, { id: 'r1', attacker: 'coldbrew', target: LOTTIES_CORNER, objective: 'shakedown', sabotage: true, party: bros, detected: false, eta: '02:00' }, true);
    expect(report.outcome).toBe('robbed');
    expect(s.cash).toBe(cash);
    expect(servingsAvailable(st)).toBe(0);
    expect(st.spoiledDay).toBe(s.day + 1);
    expect(s.news.at(-1)).toContain('spoil the stock');
  });
});

describe("Sheriff Budd's Citation", () => {
  /** Rank 5, under the line, a week of sales averaging $500 and $2,000 in the till; the targets are rival stands, and
   * the player holds a lot in each one's district (raids need a Foothold). */
  const cited = (seed: number, stars = 1.8) => {
    const s = newGame(seed);
    s.rank = 5;
    s.reputation = stars;
    welcomeDex(s);
    s.guards.push({ ...s.guards[0], id: 'gb', name: 'Bea B', trait: 'Gentle Giant', post: null });
    s.history = [400, 500, 600, 500, 450, 550, 500].map((revenue, i) => ({ ...s.today, day: i + 1, revenue }));
    s.cash = 2000;
    const [a, b] = raidTargets(s).map((p) => p.id);
    footholdFor(s, a);
    footholdFor(s, b);
    return { s, a, b };
  };

  it('below 2.0 stars a daytime raid costs about a day of sales and bans raids for the rest of today and 2 more days', () => {
    const { s, a, b } = cited(91);
    openStand(s);
    s.minute = 9 * 60; // the walk is 1-3 hours: it lands by day
    expect(citationRisk(s, true)).toEqual({ fine: 500, banDays: 2, stars: 2 });
    expect(planRaid(s, a, [s.guards[0].id], 'shakedown', 'now')).toBe(true);
    expect(s.cash).toBe(1500);
    const day = s.day;
    expect(raidBanEnds(s)).toBe(day + 3);
    expect(canRaid(s, b, ['gb'], 'smash')).toEqual({ ok: false, why: `Citation: no raids till Day ${day + 3}` });
    expect(s.alerts?.at(-1)?.text).toBe(`Sheriff Budd's Citation: $500, no raids till Day ${day + 3}.`);
    expect(rowAmount(s.today, 'citations')).toBe(-500); // on the Ledger's Citations row
    expect(s.scenes?.queue.some((q) => q.id === 'budd')).toBe(true); // she brings the first one herself
    expect(s.citations?.written).toEqual([{ day, fine: 500, target: a }]);
    s.day = day + 2;
    expect(canRaid(s, b, ['gb'], 'smash').ok).toBe(false);
    s.day = day + 3;
    expect(canRaid(s, b, ['gb'], 'smash')).toEqual({ ok: true });
  });

  it('night raids, raids that land after dark, and raids at 2.0 stars are never cited', () => {
    const { s, a, b } = cited(92);
    expect(planRaid(s, a, [s.guards[0].id], 'shakedown', 'tonight')).toBe(true);
    openStand(s);
    s.minute = CLOSE - 30; // sent now, it lands after 20:00
    expect(planRaid(s, b, ['gb'], 'smash', 'now')).toBe(true);
    expect(s.cash).toBe(2000);
    expect(s.citations).toBeUndefined();
    const { s: t, a: c } = cited(93, 2);
    openStand(t);
    t.minute = 9 * 60;
    expect(citationRisk(t, true)).toBeNull();
    expect(planRaid(t, c, [t.guards[0].id], 'smash', 'now')).toBe(true);
    expect(t.cash).toBe(2000);
  });

  it("the ban calls off your raids still waiting to set out: tonight's raid stays home", () => {
    const { s, a, b } = cited(91);
    openStand(s);
    s.minute = 9 * 60;
    expect(planRaid(s, b, ['gb'], 'shakedown', 'tonight')).toBe(true); // a night raid is never cited
    expect(s.citations).toBeUndefined();
    expect(planRaid(s, a, [s.guards[0].id], 'shakedown', 'now')).toBe(true); // by day, under the line: cited
    expect(s.raids.filter((r) => r.attacker === 'player').map((r) => r.target)).toEqual([a]);
    expect(s.news).toContain(`Sheriff Budd's ban: the raid on ${PLOT_BY_ID[b].name} is called off.`);
    const events = simulateRestOfDay(s);
    expect(sleepUntilDawn(s, false, events)).toBe(true);
    const ours = events.flatMap((e) => (e.type === 'fight' && e.report.attacker === 'player' ? [e.report] : []));
    expect(ours.map((r) => [r.target, !!r.night])).toEqual([[a, false]]); // today's raid, and no fight of yours tonight
  });

  it('a raid sent so late tonight that it gets there after 07:00 waits for the stands: a daytime raid, star and Citation', () => {
    const { s, a } = cited(91);
    s.phase = 'night' as GameState['phase']; // late in the night, as startNight leaves it
    s.minute = MINUTES_PER_DAY + 6 * 60 + 10; // 06:10: any walk ends after 07:00
    const trip = squadTrip(s, a, 'tonight', [s.guards[0].id]);
    expect(trip.at).toBeGreaterThan(NIGHT_END);
    expect(foughtByDay(trip.at)).toBe(true);
    expect(foughtByDay(NIGHT_END)).toBe(false); // 07:00 itself is still the night's clock
    expect(planRaid(s, a, [s.guards[0].id], 'shakedown', 'tonight')).toBe(true);
    expect(s.cash).toBe(1500);
    expect(s.citations?.written).toEqual([{ day: s.day, fine: 500, target: a }]);
    sleepUntilDawn(s);
    openStand(s);
    const before = s.reputation;
    let report: BattleReport | undefined;
    while (!report && s.phase === 'open') for (const e of tickMinute(s)) if (e.type === 'fight') report = e.report;
    expect(report?.target).toBe(a);
    expect(report?.night).toBeUndefined(); // by day, as the stands open
    expect(s.reputation).toBe(Math.round((before - 0.1) * 100) / 100);
  });

  it('reads the stars before a broken truce costs one, never fines more than the till, and bans HQ assaults too', () => {
    const { s, a } = cited(94, 2.4);
    makeTruce(s, s.plots[a].owner as RivalId);
    openStand(s);
    s.minute = 9 * 60;
    expect(planRaid(s, a, [s.guards[0].id], 'smash', 'now')).toBe(true);
    expect(s.reputation).toBeLessThan(2); // the broken truce took a star, after Sheriff Budd looked
    expect(s.citations).toBeUndefined();
    const { s: t, a: c } = cited(95);
    t.cash = 120;
    openStand(t);
    t.minute = 9 * 60;
    expect(planRaid(t, c, [t.guards[0].id], 'smash', 'now')).toBe(true);
    expect(t.cash).toBe(0);
    t.rivals.blenders.outsoldDays = 99; // Weakened
    t.phase = 'prep';
    expect(canAssault(t, 'blenders', ['gb'])).toEqual({ ok: false, why: `Citation: no raids till Day ${t.day + 3}` });
  });

  it('Election Day can move the line for a year, and old saves load clean', () => {
    const s = newGame(96);
    const rules = (platform: Platform) => { s.citations = { election: { day: s.day, platform, until: s.day + 55 } }; return citationRules(s).stars; };
    expect([rules('same'), rules('tough'), rules('soft')]).toEqual([2, 2.5, 1.5]);
    s.citations!.election!.until = s.day - 1; // a year on, the base rule is back until the vote
    expect(citationRules(s).stars).toBe(2);
    const votes = { same: 0, tough: 0, soft: 0 };
    for (let i = 0; i < 300; i++) votes[holdElection(newGame(i), { seed: i * 7919 + 1 })]++;
    expect(votes.same).toBeGreaterThan(votes.tough); // 2 : 1 : 1
    expect(votes.tough).toBeGreaterThan(30);
    expect(votes.soft).toBeGreaterThan(30);
    const t = newGame(97);
    let tough = 0;
    for (let i = 0; i < 300; i++) {
      t.citations = { written: Array.from({ length: 6 }, (_, j) => ({ day: t.day, fine: 10, target: `x${j}` })) };
      if (holdElection(t, { seed: i * 7919 + 1 }) === 'tough') tough++;
    }
    expect(tough / 300).toBeGreaterThan(0.6); // six Citations this year: 7 of 10 weights
    const old = JSON.parse(JSON.stringify(newGame(98)));
    old.citations = { banUntil: '3', written: 'lots', election: { day: 1, platform: 'anarchy', until: 9 } };
    expect(migrateSave(old)?.citations).toEqual({ written: [] });
  });

  it('the vote happens at dawn on Election Day, and the Bugle prints it', () => {
    const s = newGame(99);
    const day = festivalDays('electionDay', 1).from;
    s.day = day - 1;
    s.phase = 'report';
    sleepUntilDawn(s);
    expect(s.day).toBe(day);
    expect(s.citations?.election?.day).toBe(day);
    expect(s.news.some((l) => l.startsWith('ELECTION DAY: Mayor Fontaine'))).toBe(true);
  });
});

describe('the Raid Planner squad', () => {
  it('Dex fills it to the cap: unposted guards first, the strongest first, never one a warned raid needs at home', () => {
    const s = newGame(111);
    s.rank = 3; // a squad of 5
    const g = (id: string, weapon: Guard['weapon'], gear: Guard['gear'], level: number, post: string | null = null) => guardOf(weapon, gear, level, 'Loyal', { id, name: id, post });
    s.plots['maple-3s'] = { ...s.plots['maple-3s'], owner: 'player', facility: { kind: 'bottling', level: 1 } };
    s.guards = [
      g('fists', 'fists', 'none', 1), g('clubs', 'clubs', 'vest', 1), g('vet', 'clubs', 'vest', 4), g('posted', 'hatchets', 'vest', 4, LOTTIES_CORNER),
      g('postedWeak', 'fists', 'none', 1, LOTTIES_CORNER), g('home', 'hatchets', 'pro', 5, 'maple-3s'), g('hurt', 'hatchets', 'pro', 5),
    ];
    s.guards[6].outUntil = s.day + 2; // Out: not ready
    s.raids.push({ id: 'r9', attacker: 'blenders', target: 'maple-3s', objective: 'smash', party: [], detected: true, eta: '23:00', warned: true });
    expect(dexSquad(s)).toEqual(['vet', 'clubs', 'fists', 'posted', 'postedWeak']);
    s.guards = s.guards.slice(0, 2);
    expect(dexSquad(s)).toEqual(['clubs', 'fists']);
    s.rank = 7;
    s.guards = Array.from({ length: 14 }, (_, i) => g(`x${i}`, 'clubs', 'vest', 1));
    expect(dexSquad(s)).toHaveLength(12); // the Rank 7 cap
  });
});

describe('raid templates (Rank 6)', () => {
  /** Rank 6, three guards, two rival stands, and a lot of yours in each one's district (raids need a Foothold). */
  const sixth = (seed: number) => {
    const s = newGame(seed);
    s.rank = 6;
    s.guards = ['Rosa Reyes', 'Bo Banks', 'Kit Kim'].map((name, i) => guardOf('clubs', 'vest', 2, 'Loyal', { id: `g${i}`, name }));
    const [a, b] = raidTargets(s).filter((p) => s.plots[p.id].stand).map((p) => p.id);
    for (const t of [a, b]) footholdFor(s, t);
    return { s, a, b };
  };
  const line = (s: GameState) => helperLines(s.today).find((l) => l.id === TEMPLATES_ID)?.line;

  it('saves a squad and objective named for its lead, up to 3, from Rank 6', () => {
    const { s, a } = sixth(121);
    s.rank = 5;
    expect(canSaveTemplate(s, ['g0'], 'smash')).toEqual({ ok: false, why: 'Raid templates unlock at Rank 6' });
    s.rank = 6;
    expect(saveTemplate(s, ['g0', 'g1'], 'smash', a)?.name).toBe("Rosa's Smash");
    expect(canSaveTemplate(s, ['g1', 'g0'], 'smash')).toEqual({ ok: false, why: 'Already saved' }); // the same squad, in any order
    expect(saveTemplate(s, ['g0'], 'smash')?.name).toBe("Rosa's Smash 2");
    expect(saveTemplate(s, ['g2'], 'shakedown')?.name).toBe("Kit's Shakedown");
    expect(canSaveTemplate(s, ['g1'], 'smash')).toEqual({ ok: false, why: '3 saved: drop one first' });
    expect(dropTemplate(s, templates(s)[1].id)).toBe(true);
    expect(templates(s).map((t) => t.name)).toEqual(["Rosa's Smash", "Kit's Shakedown"]);
    expect(canSaveTemplate(s, [], 'smash')).toEqual({ ok: false, why: 'Pick your squad first' });
  });

  it("a raid sent with one aims it at that plot and counts on the Ledger's line; the switch turns them off", () => {
    const { s, a, b } = sixth(122);
    const t = saveTemplate(s, ['g0', 'g1'], 'shakedown', a)!;
    expect(templateAt(s, a)).toBe(t);
    expect(planRaid(s, b, ['g1', 'g0'], 'shakedown', 'tonight')).toBe(true);
    expect(t.target).toBe(b); // re-aimed: the Planner opens with it there now
    expect(templateAt(s, a)).toBeUndefined();
    expect(line(s)).toBe('1 raid sent');
    expect(planRaid(s, a, ['g2'], 'smash', 'tonight')).toBe(true); // no template: not counted
    expect(line(s)).toBe('1 raid sent');
    expect(switchTemplates(s)).toBe(true);
    expect(templatesOn(s)).toBe(false);
    expect(templateAt(s, b)).toBeUndefined(); // off: the Planner opens with Dex's squad
    expect(canSaveTemplate(s, ['g2'], 'sabotage')).toEqual({ ok: false, why: 'Raid templates are switched off' });
    switchTemplates(s);
    expect(templateAt(s, b)).toBe(t);
  });

  it('saves keep them; loading drops a broken one, and does it once', () => {
    const { s, a } = sixth(123);
    saveTemplate(s, ['g0'], 'smash', a);
    const back = JSON.parse(JSON.stringify(s)) as GameState;
    (back.raidTemplates!.list as unknown[]).push({ id: 'bad' }, 'junk');
    migrateSave(back);
    expect(back.raidTemplates!.list).toEqual(s.raidTemplates!.list);
    migrateSave(back);
    expect(back.raidTemplates!.list).toEqual(s.raidTemplates!.list);
  });
});

describe('raids need a Foothold', () => {
  it("only on a rival plot in a district where you hold a plot; the Planner's reason names it", () => {
    const s = newGame(131);
    s.rank = 3;
    welcomeDex(s);
    const target = raidTargets(s).find((p) => p.district !== 'maple' && s.plots[p.id].stand)!;
    const dex = [s.guards[0].id];
    expect(canRaid(s, target.id, dex)).toEqual({ ok: false, why: `Get a Foothold in ${DISTRICT_BY_ID[target.district].name} first` });
    expect(planRaid(s, target.id, dex, 'smash', 'tonight')).toBe(false);
    const lot = footholdFor(s, target.id); // a bare lot of yours there is enough
    expect(canRaid(s, target.id, dex)).toEqual({ ok: true });
    s.plots[lot].owner = null;
    expect(canRaid(s, target.id, dex).ok).toBe(false);
  });
});

describe("Act 2: Squawk's flight over the Pier", () => {
  /** The campaign on Day 20, Act 2 since Day 19 (its first morning was Dex's Clubhouse push). */
  const act2 = (seed: number) => {
    const s = newGame(seed);
    s.day = 20;
    s.story = { ...s.story!, act: 2, since: 19 };
    return s;
  };
  const byPier = (id: string) => withinTwo(PLOT_BY_ID[PIER], PLOT_BY_ID[id]);

  it('is the short story goal until Squawk circles a Blenders plot by the Pier, and pays once', () => {
    const s = act2(141);
    checkGoals(s, false);
    expect(goalsNow(s)[0]).toMatchObject({ text: PIER_GOAL, story: true, done: false });
    const target = pierTarget(s)!;
    expect(s.plots[target]).toMatchObject({ owner: 'blenders', stand: expect.anything() }); // a stand by the Pier
    expect(byPier(target)).toBe(true);
    const far = PLOTS.find((p) => s.plots[p.id].owner === 'blenders' && !byPier(p.id))!.id;
    expect(gullScout(s, far)).toBe(true); // a Blenders stand up the beach: scouted, but not the Pier
    expect(s.pierFlight).toBeUndefined();
    const cash = s.cash, reward = goalReward(s, 'short');
    expect(gullScout(s, target)).toBe(true);
    expect(s.pierFlight).toBe(20);
    expect(s.news.slice(-2)).toEqual([expect.stringMatching(/^Captain Squawk circles /), 'Lottie: "Good bird. Now we know what Brock\'s got."']);
    expect(pierTarget(s)).toBeNull();
    checkGoals(s);
    expect(s.cash).toBe(cash + reward);
    expect(s.news.at(-1)).toBe(`✓ ${PIER_GOAL} +$${reward}`);
    expect(goalsNow(s)[0].text).toMatch(/^Sell [\d,]+ cups today$/); // the day's sales goal is back
    const back = JSON.parse(JSON.stringify(s)) as GameState;
    migrateSave(back);
    expect(back.pierFlight).toBe(20);
    expect(pierFlightGoal(back)).toEqual({ text: PIER_GOAL, progress: 1, done: true });
  });

  it("Lottie sends him on the act's second morning; a plot a Lookout watched today still counts", () => {
    const s = act2(142);
    s.day = 19;
    expect(pierFlightGoal(s)).toBeNull(); // the act's first morning
    s.phase = 'report';
    sleepUntilDawn(s);
    expect(s.day).toBe(20);
    expect(s.news).toContain('Lottie: "Squawk! Go see what Brock keeps by the Pier."');
    const target = pierTarget(s)!;
    recordScouting(s, target, 'lookout');
    expect(gullScout(s, target)).toBe(false); // today's snapshot stands...
    expect(s.pierFlight).toBe(20); // ...and the flight is flown
  });

  it('only in the campaign, only in Act 2, and only while Brock stands', () => {
    const sb = newGame(143, { mode: 'sandbox' });
    sb.day = 20;
    expect(pierFlightGoal(sb)).toBeNull();
    const shack = PLOTS.find((p) => p.name === 'The Blend Shack')!.id;
    expect(gullScout(sb, shack)).toBe(true);
    expect(sb.pierFlight).toBeUndefined();
    const s = act2(144);
    s.story!.act = 3;
    expect(pierFlightGoal(s)).toBeNull();
    s.story!.act = 2;
    for (const p of PLOTS) if (s.plots[p.id].owner === 'blenders' && s.plots[p.id].stand && byPier(p.id)) s.plots[p.id].owner = null;
    expect(pierTarget(s)).toBe(shack); // no stand by the Pier: the Blend Shack next door
    s.rivals.blenders.alive = false;
    expect(pierFlightGoal(s)).toBeNull();
  });
});

describe('HQ Assault from the Raid Planner', () => {
  /** Rank 7, twelve kitted raiders, and Brock down to the Blend Shack and one stand: Weakened. */
  const weakened = (seed: number) => {
    const s = newGame(seed);
    s.rank = 7;
    s.cash = 1e6;
    s.guards = Array.from({ length: 12 }, (_, i) => guardOf('hatchets', 'pro', 5, 'Loyal', { id: `h${i}`, name: `Raider ${i}` }));
    for (const p of PLOTS.filter((q) => s.plots[q.id].owner === 'blenders' && q.type !== 'hq').slice(1)) s.plots[p.id] = { ...s.plots[p.id], owner: null, stand: null };
    return { s, hq: hqPlot('blenders').id, ids: s.guards.map((g) => g.id) };
  };

  it("on a rival's HQ its one objective is HQ Assault, under the HQ's rules: Weakened is its gate, no Foothold", () => {
    const { s, hq, ids } = weakened(151);
    expect(PLOTS.some((p) => p.district === PLOT_BY_ID[hq].district && s.plots[p.id].owner === 'player')).toBe(false); // nothing of yours on the Boardwalk
    expect(canRaid(s, hq, ids, 'hq')).toEqual({ ok: true });
    expect(canRaid(s, hq, ids, 'smash')).toEqual({ ok: false, why: 'An HQ falls only to an HQ Assault' });
    const stand = PLOTS.find((p) => s.plots[p.id].owner === 'blenders' && p.type !== 'hq')!.id;
    expect(canRaid(s, stand, ids, 'hq')).toEqual({ ok: false, why: "Plan an HQ Assault at the rival's HQ" });
    expect(canRaid(s, hq, [], 'hq')).toEqual({ ok: false, why: 'Pick your squad' });
    expect(canRaid(s, hq, [...ids, 'h12'], 'hq')).toEqual({ ok: false, why: 'Squad cap is 12' });
    expect(canSaveTemplate(s, ids, 'hq')).toEqual({ ok: false, why: 'An HQ falls once: no template' });
    expect(saveTemplate(s, ids, 'hq', hq)).toBeNull();
    const strong = newGame(152);
    strong.rank = 7;
    expect(canRaid(strong, hq, ids, 'hq')).toEqual({ ok: false, why: 'Only once they are Weakened' });
    s.phase = 'open'; // no longer only at Morning Prep
    expect(canAssault(s, 'blenders', ids)).toEqual({ ok: true });
    expect(planRaid(s, hq, ids, 'hq', 'tonight')).toBe(true);
    expect(s.raids.find((r) => r.attacker === 'player')).toMatchObject({ target: hq, objective: 'smash', assault: true, leave: PLAYER_RAID_LEAVE });
    expect(canRaid(s, hq, ids, 'hq')).toEqual({ ok: false, why: 'Already planned' });
  });

  it('it travels on the raid clock and storms the Gate, the Yard and the Boss Room when it gets there; Sneaky by night goes unseen', () => {
    const { s, hq, ids } = weakened(153);
    s.guards[0].trait = 'Sneaky';
    expect(detectionChance(s, hq, true, true)).toBe(0); // the HQ's 50%, less 25 at night and 25 for a Sneaky raider
    expect(planRaid(s, hq, ids, 'hq', 'tonight')).toBe(true);
    const raid = s.raids.find((r) => r.assault)!;
    openStand(s);
    simulateRestOfDay(s);
    expect(s.rivals.blenders.alive).toBe(true); // nothing until it gets there
    sleepUntilDawn(s);
    expect(raid.detected).toBe(false); // unseen: they strike first at the Gate
    expect(s.rivals.blenders.alive).toBe(false);
    expect(s.plots[hq].owner).toBe('player');
    expect(s.battles[0]).toMatchObject({ hq: 'boss', outcome: 'smashed', target: hq });
  });

  it("by day customers see it: a Smash's 0.2 stars; then the squad walks home", () => {
    const { s, hq, ids } = weakened(154);
    s.reputation = 4;
    expect(raidRepCost(s, ids, 'hq', false)).toBe(0.2);
    expect(planRaid(s, hq, ids, 'hq', 'now')).toBe(true);
    const raid = s.raids.find((r) => r.assault)!;
    expect(raid.leave).toBe(OPEN); // from Morning Prep it sets out as the stands open
    openStand(s);
    let report: BattleReport | undefined;
    while (!report && s.minute < CLOSE) for (const e of tickMinute(s)) if (e.type === 'fight' && e.raid === raid) report = e.report;
    expect(s.minute).toBe(raid.at);
    expect(report).toMatchObject({ hq: 'boss', target: hq });
    expect(s.reputation).toBeCloseTo(3.8, 5);
    expect(raid.back).toBeGreaterThan(s.minute); // walking home: still away
    expect(availableRaiders(s)).toEqual([]);
  });

  it('fought at once, the squad walks home after the last stage: every stage counts, as when it is watched', () => {
    const { s, hq, ids } = weakened(157);
    expect(planRaid(s, hq, ids, 'hq', 'tonight')).toBe(true);
    const raid = s.raids.find((r) => r.assault)!;
    openStand(s);
    simulateRestOfDay(s);
    startNight(s);
    while (s.minute < raid.at! - 1) nightStep(s);
    // The same assault fought on a twin, stage by stage, as the raid clock fights it at once (night.ts arrive, fight.ts reachHQ).
    const twin: GameState = JSON.parse(JSON.stringify(s));
    twin.minute++;
    const sent = twin.raids.find((r) => r.assault)!;
    spotAssault(twin, sent, true);
    const { reports } = stormHQ(twin, 'blenders', sent.guards!, sent) as AssaultResult;
    expect(reports.map((b) => b.hq)).toEqual(['gate', 'yard', 'boss']);
    nightStep(s);
    expect(s.rivals.blenders.alive).toBe(false);
    const walk = travelMinutes(s, squadHome(s, hq, ids), hq);
    const fought = reports.reduce((m, b) => m + Math.ceil(b.duration), 0);
    expect(fought).toBeGreaterThan(Math.ceil(reports[2].duration)); // the Gate and the Yard took time too
    expect(s.raids.find((r) => r.assault)?.back).toBe(raid.at! + fought + walk);
  });

  it("a rival no longer Weakened when the squad gets there: it turns back, and the HQ stands", () => {
    const s = newGame(158);
    s.rank = 7;
    s.guards = Array.from({ length: 12 }, (_, i) => guardOf('hatchets', 'pro', 5, 'Loyal', { id: `h${i}`, name: `Raider ${i}` }));
    const hq = hqPlot('blenders').id, ids = s.guards.map((g) => g.id);
    s.rivals.blenders.outsoldDays = 7; // outsold 2x for a week: Weakened
    expect(planRaid(s, hq, ids, 'hq', 'tonight')).toBe(true);
    const raid = s.raids.find((r) => r.assault)!;
    openStand(s);
    simulateRestOfDay(s);
    s.rivals.blenders.outsoldDays = 0; // a day they kept up: not Weakened any more
    expect(canAssault(s, 'blenders', ids)).toEqual({ ok: false, why: 'Only once they are Weakened' });
    sleepUntilDawn(s);
    expect(s.rivals.blenders.alive).toBe(true);
    expect(s.plots[hq].owner).toBe('blenders');
    expect(s.news).toContain(`The Boardwalk Blenders aren't Weakened any more: your squad turned back from ${PLOT_BY_ID[hq].name}.`);
    expect(s.battles.some((b) => b.hq)).toBe(false);
    expect(raid.back).toBe(raid.at! + (raid.at! - raid.leave!)); // the walk there, back again
  });

  it('a rival gone before it gets there: the squad turns back', () => {
    const { s, hq, ids } = weakened(155);
    planRaid(s, hq, ids, 'hq', 'now');
    const raid = s.raids.find((r) => r.assault)!;
    openStand(s);
    s.rivals.blenders.alive = false;
    while (s.minute < raid.at!) tickMinute(s);
    expect(s.news).toContain(`Your squad found nothing to raid at ${PLOT_BY_ID[hq].name} and turned back.`);
    expect(raid.back).toBeGreaterThan(s.minute);
    expect(s.battles).toEqual([]);
  });

  it("the Planner's odds on it are a pure read: its own dice, every stage, nothing changed", () => {
    const { s, ids } = weakened(156);
    const before = JSON.stringify(s);
    const full = hqOdds(s, 'blenders', ids, true);
    expect(JSON.stringify(s)).toBe(before);
    expect(hqOdds(s, 'blenders', ids, true)).toBe(full); // the same dice each time
    expect(full).toBeGreaterThan(0.8);
    s.guards.push(guardOf('fists', 'none', 1, 'Loyal', { id: 'rookie', name: 'Rookie' }));
    expect(hqOdds(s, 'blenders', ['rookie'], true)).toBe(0); // a lone rookie never gets past the Gate
    expect(hqOdds(s, 'blenders', [], true)).toBe(0);
  });
});
