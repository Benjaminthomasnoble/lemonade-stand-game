import { describe, expect, it } from 'vitest';
import {
  alert, buildFacility, clientOf, CLOSE, DAWN, defaultSettings, DELIVERY_WINDOW, DIFFICULTY, dismissAlert, eliminate,
  etaMinute, FIGHT_SECONDS_PER_GAME_MINUTE, hhmm, incomingRaids, isMajor, LOTTIES_CORNER, MAX_ALERTS, migrateSave, newGame,
  NIGHT_END, NIGHT_REAL_SECONDS_PER_MINUTE, nightStep, onYou, openStand, PICKUP_MINUTE, planNight, planRaid, PLOTS,
  QUIET_NIGHT_SPEED, quietNight, raidNotice, raidPartyFor, raidPauses, raidStart, raidTargets, REAL_SECONDS_PER_MINUTE,
  SAVE_VERSION, secondsPerMinute, simulateRestOfDay, sleepUntilDawn, startNight, tickMinute, travelMinutes, VIP_STAR_BONUS,
  awayGuards, DAYTIME_RAID_REP, hqPlot, migrateNights, MINUTES_PER_DAY, OPEN, RAID_FIGHT_GUESS, squadHome, squadTrip,
  autoRestock, restockNow, servingsAvailable, postGuard, fireGuard, DEX, TUTORIAL_RAID_DAY, TUTORIAL_CALL, newStand, welcomeDex,
  CUSTOM_RANGE, customDefaults, difficultyOf, fightRaid, repairCost, threatLevel, upgradeStand, festivalDays,
  type BattleReport, type CustomDifficulty, type GameState, type Guard, type Raid, type RivalId, type Settings, type SimEvent,
} from './economy.ts';

/** The Evening at 20:00 of Day 1, with nothing planned for tonight. */
function evening(seed: number, settings: Partial<Settings> = {}): GameState {
  const s = newGame(seed, settings);
  s.phase = 'report';
  s.minute = CLOSE;
  s.raids = [];
  return s;
}

/** A raid on Lottie's Corner that sets out at `leave` and arrives at `at` (minutes; past midnight counts on from 1,440). */
function raidOn(s: GameState, leave: number, at: number, over: Partial<Raid> = {}): Raid {
  const r: Raid = { id: `t${s.nextId++}`, attacker: 'blenders', target: LOTTIES_CORNER, objective: 'shakedown', party: raidPartyFor(s, 'blenders'), detected: true, eta: hhmm(at), leave, at, ...over };
  s.raids.push(r);
  return r;
}

const crew = (n: number, post: string | null): Guard[] =>
  Array.from({ length: n }, (_, i) => ({ id: `g${i}`, name: `Test ${i}`, trait: 'Loyal', level: 5, xp: 0, weapon: 'hatchets', gear: 'pro', post, outUntil: 0, fee: 0 }) as Guard);

describe('the night on the clock', () => {
  it('the Evening holds at 20:00, then the night runs minute by minute to 07:00 and dawn opens Morning Prep', () => {
    const s = evening(3);
    expect(tickMinute(s)).toEqual([]);
    expect(s.minute).toBe(CLOSE);
    expect(startNight(s)).toBe(true);
    expect(s.phase).toBe('night');
    let ticks = 0, dawn = 0;
    while (s.phase === 'night' && ticks < 2000) { ticks++; dawn += tickMinute(s).filter((e) => e.type === 'dawn').length; }
    expect(ticks).toBe(NIGHT_END - CLOSE); // 11 game hours
    expect(dawn).toBe(1);
    expect(s).toMatchObject({ phase: 'prep', day: 2, minute: DAWN });
  });

  it('watching the night and sleeping through it end the same', () => {
    const a = evening(12), b = evening(12);
    for (const s of [a, b]) { raidOn(s, 21 * 60, 22 * 60 + 30, { detected: false }); raidOn(s, 22 * 60, 23 * 60, { attacker: 'sourwood', objective: 'smash' }); }
    startNight(a);
    while (a.phase === 'night') tickMinute(a);
    expect(sleepUntilDawn(b)).toBe(true);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('Sleep till dawn stops at a raid warning, then carries on through the fight to dawn', () => {
    const s = evening(4);
    const r = raidOn(s, 21 * 60, 22 * 60);
    const ev: SimEvent[] = [];
    expect(sleepUntilDawn(s, true, ev)).toBe(false);
    expect(s).toMatchObject({ phase: 'night', minute: 21 * 60 });
    const warning = ev.flatMap((e) => (e.type === 'alert' ? [e.alert] : []));
    expect(warning).toHaveLength(1);
    expect(warning[0]).toMatchObject({ kind: 'raid', raid: r.id, plot: LOTTIES_CORNER });
    expect(warning[0].text).toBe("RAID WARNING! The Boardwalk Blenders are heading for Lottie's Corner, ETA 10:00pm.");
    expect(s.news).toContain(warning[0].text);
    const rest: SimEvent[] = [];
    expect(sleepUntilDawn(s, true, rest)).toBe(true);
    expect(rest.filter((e) => e.type === 'fight')).toHaveLength(1);
    expect(s).toMatchObject({ phase: 'prep', day: 2 });
    expect(s.battles[0]).toMatchObject({ day: 1, attacker: 'blenders', target: LOTTIES_CORNER });
  });

  it("a detected raid warns as it sets out; an undetected one at the difficulty's minimum notice", () => {
    let early = 0;
    for (const difficulty of ['laidback', 'classic', 'cutthroat'] as const) {
      let late = 0;
      for (let seed = 1; seed <= 12; seed++) {
        const s = evening(seed, { difficulty });
        const r = raidOn(s, 21 * 60, 23 * 60, { detected: false });
        expect(sleepUntilDawn(s, true)).toBe(false);
        expect(r.warned).toBe(true);
        if (r.detected) { early++; expect(s.minute).toBe(21 * 60); }
        else { late++; expect(s.minute).toBe(23 * 60 - DIFFICULTY[difficulty].notice); }
      }
      expect(late).toBeGreaterThan(0);
    }
    expect(early).toBeGreaterThan(0);
    expect([30, 15, 5].map((n, i) => n === raidNotice(newGame(1, { difficulty: (['laidback', 'classic', 'cutthroat'] as const)[i] })))).toEqual([true, true, true]);
  });

  it('raids hit one by one at their minute, in ETA order', () => {
    const s = evening(5);
    const late = raidOn(s, 21 * 60, 23 * 60 + 30);
    const early = raidOn(s, 21 * 60 + 30, 22 * 60 + 15);
    const hit: Record<string, number> = {};
    startNight(s);
    while (s.phase === 'night') for (const e of tickMinute(s)) if (e.type === 'fight') hit[e.raid.id] = s.minute;
    expect(hit).toEqual({ [early.id]: 22 * 60 + 15, [late.id]: 23 * 60 + 30 });
    expect(s.raids).toEqual([]);
  });

  it('your raid tonight sets out at 01:00 and fights when it gets there', () => {
    const s = evening(8);
    s.rank = 6;
    s.guards = crew(3, null);
    const target = raidTargets(s)[0];
    expect(planRaid(s, target.id, ['g0', 'g1'], 'smash', 'tonight')).toBe(true);
    const r = s.raids[0];
    const trip = travelMinutes(s, LOTTIES_CORNER, target.id);
    expect([r.leave, r.at, r.eta]).toEqual([25 * 60, 25 * 60 + trip, hhmm(25 * 60 + trip)]);
    let at = 0;
    startNight(s);
    while (s.phase === 'night') for (const e of tickMinute(s)) if (e.type === 'fight' && e.raid.attacker === 'player') at = s.minute;
    expect(at).toBe(25 * 60 + trip);
    expect(s.battles[0]).toMatchObject({ attacker: 'player', target: target.id });
  });

  it('the HUD only hears of raids it has been warned of', () => {
    const s = evening(6);
    const r = raidOn(s, 21 * 60, 22 * 60);
    expect(incomingRaids(s)).toEqual([]);
    startNight(s);
    while (!r.warned) nightStep(s);
    expect(s.minute).toBe(21 * 60);
    expect(incomingRaids(s)).toEqual([r]);
  });

  it('rival raids set out after closing and travel 1–3 game hours by distance', () => {
    const s = newGame(21);
    s.day = 30;
    s.rank = 6;
    s.battles.push({ defender: 'player', day: 1 } as GameState['battles'][number]); // past the tutorial raid
    let mine = 0;
    for (let i = 0; i < 60; i++) {
      s.raids = [];
      planNight(s);
      for (const r of s.raids) {
        expect(r.leave).toBeGreaterThanOrEqual(CLOSE);
        expect(r.at).toBeLessThan(NIGHT_END);
        expect(r.eta).toBe(hhmm(r.at!));
        expect(etaMinute(r.eta)).toBe(r.at);
        expect(r.warned).toBeFalsy();
        if (!onYou(s, r)) continue;
        mine++;
        expect(r.at! - r.leave!).toBe(travelMinutes(s, raidStart(s, r.attacker as RivalId, r.target), r.target));
      }
      expect(incomingRaids(s)).toEqual([]); // nobody is warned at closing: warnings come as they set out
    }
    expect(mine).toBeGreaterThan(5);
    let lo = Infinity, hi = 0;
    for (const a of PLOTS) for (const b of PLOTS) { const t = travelMinutes(s, a.id, b.id); lo = Math.min(lo, t); hi = Math.max(hi, t); if (t % 5) throw new Error(`${t} minutes`); }
    expect(lo).toBe(60);
    expect(hi).toBeLessThanOrEqual(180);
    expect(hi).toBeGreaterThanOrEqual(150);
  });

  it('the clock: about 18 real seconds a game hour by day and 8 at night, quiet nights 3×, fight speed for a countdown', () => {
    const s = newGame(2);
    expect(secondsPerMinute(s, 1)).toBe(Infinity); // only Morning Prep waits
    openStand(s);
    expect(secondsPerMinute(s, 1) * 60).toBeCloseTo(17.5);
    expect(secondsPerMinute(s, 3)).toBeCloseTo(REAL_SECONDS_PER_MINUTE / 3);
    expect(secondsPerMinute(s, 0)).toBe(Infinity);
    expect(secondsPerMinute(s, 3, { fighting: true })).toBe(FIGHT_SECONDS_PER_GAME_MINUTE); // a brawl on screen
    const n = evening(2);
    expect(secondsPerMinute(n, 1)).toBe(Infinity); // the Evening
    startNight(n);
    expect(secondsPerMinute(n, 1) * 60).toBeCloseTo(8);
    expect((NIGHT_END - CLOSE) * secondsPerMinute(n, 1)).toBeCloseTo(88); // about 1.5 real minutes
    expect(secondsPerMinute(n, 1, { quiet: true })).toBeCloseTo(NIGHT_REAL_SECONDS_PER_MINUTE / QUIET_NIGHT_SPEED);
    const r = raidOn(n, CLOSE + 1, CLOSE + 60);
    nightStep(n);
    expect(r.warned).toBe(true);
    // From the warning to the fight the clock runs at fight speed, whatever the speed or the quiet-night switch.
    expect(secondsPerMinute(n, 1, { quiet: true })).toBe(FIGHT_SECONDS_PER_GAME_MINUTE);
    expect(secondsPerMinute(n, 3)).toBe(FIGHT_SECONDS_PER_GAME_MINUTE);
    while (r.at! - n.minute > raidNotice(n)) nightStep(n);
    expect(secondsPerMinute(n, 3)).toBe(FIGHT_SECONDS_PER_GAME_MINUTE); // the last minutes of notice too
    while (n.raids.includes(r)) nightStep(n);
    expect(secondsPerMinute(n, 1) * 60).toBeCloseTo(8); // fought: night speed again
  });

  it("a detected raid's whole countdown runs at fight speed: its ETA in game minutes is that many real seconds", () => {
    const s = evening(15, { difficulty: 'cutthroat' }); // no auto-pause on Cutthroat
    const r = raidOn(s, CLOSE + 30, CLOSE + 30 + 105);
    startNight(s);
    let real = 0;
    while (s.raids.includes(r)) { if (r.warned) real += secondsPerMinute(s, 3, { quiet: true }); nightStep(s); }
    expect(real).toBeCloseTo(105 * FIGHT_SECONDS_PER_GAME_MINUTE); // 105 real seconds, at 3× and on a quiet night
  });

  it('a quiet night lasts until an alert comes in, and is quiet again once the raid is fought or the card put away', () => {
    const s = evening(14);
    s.minute = 15 * 60;
    alert(s, { kind: 'soldout', text: 'Sold out at the Corner!', plot: LOTTIES_CORNER }); // this afternoon's card
    s.minute = CLOSE;
    expect(quietNight(s)).toBe(false); // the Evening: the clock isn't running
    startNight(s);
    expect(quietNight(s)).toBe(true);
    const r = raidOn(s, CLOSE + 30, CLOSE + 90);
    while (!r.warned) nightStep(s);
    expect(quietNight(s)).toBe(false);
    expect(secondsPerMinute(s, 1, { quiet: true })).toBe(FIGHT_SECONDS_PER_GAME_MINUTE); // the countdown to the fight
    while (s.raids.includes(r)) nightStep(s);
    expect(quietNight(s)).toBe(true); // fought: the 3× comes back
    expect(secondsPerMinute(s, 1, { quiet: true })).toBeCloseTo(NIGHT_REAL_SECONDS_PER_MINUTE / QUIET_NIGHT_SPEED);
    expect(secondsPerMinute(s, 1, { quiet: false })).toBeCloseTo(NIGHT_REAL_SECONDS_PER_MINUTE); // the setting off
    const note = alert(s, { kind: 'note', text: 'Something stirs on Maple Row' });
    expect(quietNight(s)).toBe(false); // any alert ends the quiet
    dismissAlert(s, note.id);
    expect(quietNight(s)).toBe(true);
  });

  it('raid warnings pause by default, except on Cutthroat', () => {
    expect(raidPauses(defaultSettings())).toBe(true);
    expect(raidPauses(defaultSettings({ difficulty: 'laidback' }))).toBe(true);
    expect(raidPauses(defaultSettings({ difficulty: 'cutthroat' }))).toBe(false);
    expect(raidPauses(defaultSettings({ difficulty: 'cutthroat', raidPause: true }))).toBe(true);
  });
});

describe('the alert feed', () => {
  it('keeps 8 cards, the small ones going first, and dawn clears the night', () => {
    const s = evening(9);
    alert(s, { kind: 'delivery', text: 'big' });
    for (let i = 0; i < 10; i++) alert(s, { kind: 'soldout', text: `n${i}`, plot: LOTTIES_CORNER });
    expect(s.alerts).toHaveLength(MAX_ALERTS);
    expect(s.alerts![0].text).toBe('big');
    expect(s.alerts!.at(-1)!.text).toBe('n9');
    dismissAlert(s, s.alerts![1].id);
    expect(s.alerts).toHaveLength(MAX_ALERTS - 1);
    sleepUntilDawn(s);
    expect(s.alerts).toEqual([]);
  });

  it("Restock now buys while the stands are open; after closing it, and Auto-Restock, return and buy nothing", () => {
    const empty = (s: GameState) => { const inv = s.plots[LOTTIES_CORNER].stand!.inventory; inv.lemons = []; inv.sugar = 0; inv.ice = 0; };
    const s = newGame(21);
    s.cash = 500;
    openStand(s);
    empty(s);
    alert(s, { kind: 'soldout', text: "Sold out at Lottie's Corner!", plot: LOTTIES_CORNER });
    expect(restockNow(s, LOTTIES_CORNER)).toBe(true);
    expect(s.cash).toBeLessThan(500);
    expect(servingsAvailable(s.plots[LOTTIES_CORNER].stand!)).toBeGreaterThan(0);
    expect(s.alerts!.some((a) => a.kind === 'soldout')).toBe(false);
    for (const phase of ['report', 'night'] as const) {
      empty(s);
      alert(s, { kind: 'soldout', text: "Sold out at Lottie's Corner!", plot: LOTTIES_CORNER });
      s.phase = phase;
      s.minute = phase === 'report' ? CLOSE : CLOSE + 90;
      const cash = s.cash;
      expect(restockNow(s, LOTTIES_CORNER)).toBe(false);
      autoRestock(s, LOTTIES_CORNER); // returns: no spinning on a buy that can't happen
      expect(s.cash).toBe(cash);
      expect(servingsAvailable(s.plots[LOTTIES_CORNER].stand!)).toBe(0);
      expect(s.alerts!.filter((a) => a.kind === 'soldout')).toHaveLength(1); // the card stays (it offers no Restock now)
      dismissAlert(s, s.alerts!.find((a) => a.kind === 'soldout')!.id);
      s.phase = 'open';
    }
  });

  it('with no cash Restock now buys nothing and the card stays', () => {
    const s = newGame(22);
    openStand(s);
    const inv = s.plots[LOTTIES_CORNER].stand!.inventory;
    inv.lemons = []; inv.sugar = 0; inv.ice = 0;
    s.cash = 0;
    alert(s, { kind: 'soldout', text: "Sold out at Lottie's Corner!", plot: LOTTIES_CORNER });
    expect(restockNow(s, LOTTIES_CORNER)).toBe(false);
    expect(s.alerts).toHaveLength(1);
  });

  it('a raid card goes when its raid hits', () => {
    const s = evening(10);
    raidOn(s, 21 * 60, 22 * 60);
    startNight(s);
    while (s.minute < 21 * 60) nightStep(s);
    expect(s.alerts).toHaveLength(1);
    while (s.minute < 22 * 60) nightStep(s);
    expect(s.alerts).toEqual([]);
  });
});

describe('the tutorial raid', () => {
  /** The Evening of Day 15 (the night after the Summer Fair): Dex on the Corner, a second stand on Maple Row. */
  function fairNight(seed: number): { s: GameState; side: string } {
    const s = evening(seed);
    s.day = TUTORIAL_RAID_DAY;
    s.rank = 3; // Threat 2: a normal raid could be a Smash
    welcomeDex(s);
    const side = PLOTS.find((p) => p.district === 'maple' && p.type === 'street' && !s.plots[p.id].owner)!.id;
    s.plots[side] = { ...s.plots[side], owner: 'player', stand: newStand(1) };
    postGuard(s, s.guards.find((g) => g.name === DEX)!.id, LOTTIES_CORNER);
    planNight(s);
    return { s, side };
  }
  const tutorialRaid = (s: GameState) => s.raids.find((r) => r.tutorial)!;
  const dexOf = (s: GameState) => s.guards.find((g) => g.name === DEX);

  it("Brock's Smoothie Bros come, announced, for a Shakedown, and Brock calls first", () => {
    const { s } = fairNight(1);
    const r = tutorialRaid(s);
    expect(r).toMatchObject({ attacker: 'blenders', target: LOTTIES_CORNER, objective: 'shakedown', detected: true, tutorial: true });
    expect(r.party).toHaveLength(2);
    expect(s.news).toContain(`Brock: "${TUTORIAL_CALL}"`);
  });

  it('bounces wherever Dex is: moved off after the warning, out of action, or let go, with no fence', () => {
    const moves: ((s: GameState, side: string) => void)[] = [
      (s, side) => postGuard(s, dexOf(s)!.id, side), // the plot card's +shield, after the warning
      (s) => postGuard(s, dexOf(s)!.id, null),
      (s) => { dexOf(s)!.outUntil = s.day + 2; }, // knocked out
      (s) => fireGuard(s, dexOf(s)!.id),
    ];
    let n = 0;
    for (const move of moves) {
      for (let seed = 1; seed <= 10; seed++) {
        const { s, side } = fairNight(seed);
        const r = tutorialRaid(s);
        startNight(s);
        while (!r.warned) nightStep(s);
        move(s, side);
        while (s.raids.includes(r)) nightStep(s);
        const b = s.battles.find((x) => x.defender === 'player')!;
        expect(b.outcome).toBe('repelled');
        expect(b.loot).toBe(0);
        expect(b.defenders.some((f) => f.name === DEX)).toBe(true);
        expect(s.plots[LOTTIES_CORNER].stand!.wrecked).toBeFalsy();
        n++;
      }
    }
    expect(n).toBe(40);
  });
});

describe('Delivery Raids', () => {
  /** Rank 7 with a Helipad (5,000 bottles a day: one trip) and a 4,000-bottle chopper order due at 14:00 today. */
  function pickupGame(seed: number) {
    const s = newGame(seed, { lessons: false }); // no Day-1 stock from Lottie (src/sim/story.ts) to sell out by the pickup
    s.rank = 7;
    s.reputation = 4.5;
    s.cash = 3_000_000;
    const field = PLOTS.find((p) => p.type === 'field')!.id; // cleared of Hollis's Lemon Grove
    s.plots[field] = { ...s.plots[field], owner: 'player', stand: null, facility: undefined, invested: 0 };
    buildFacility(s, field, 'helipad');
    buildFacility(s, field, 'helipad'); // world: the Helipad tier loads 5,000 a day, so the order goes in one trip
    s.bottles = 6000;
    s.orders.push({ id: 'vip', tier: 'heli', client: 'Test Star', qty: 4000, pay: 15000, due: s.day, expires: s.day, plot: field, accepted: true });
    openStand(s);
    return { s, field };
  }
  /** The first seed whose pickup draws a Delivery Raid, played to the minute after the chopper lands. */
  function raidedPickup() {
    for (let seed = 1; seed < 80; seed++) {
      const g = pickupGame(seed);
      const ev: SimEvent[] = [];
      while (g.s.minute <= PICKUP_MINUTE.heli) ev.push(...tickMinute(g.s));
      const r = g.s.raids.find((x) => x.delivery);
      if (r) return { ...g, seed, r, ev };
    }
    throw new Error('no Delivery Raid in 80 seeds');
  }
  const play = (s: GameState, r: Raid) => { const ev: SimEvent[] = []; while (s.raids.includes(r)) ev.push(...tickMinute(s)); return ev; };

  it('is warned and fought during loading; overrun, the order fails and costs a star', () => {
    const { s, r, ev, field } = raidedPickup();
    expect(r).toMatchObject({ target: field, order: 'vip', leave: PICKUP_MINUTE.heli });
    expect(r.at! - r.leave!).toBeGreaterThanOrEqual(60);
    expect(r.at! - r.leave!).toBeLessThan(DELIVERY_WINDOW);
    expect(ev.some((e) => e.type === 'pickup' && e.order.id === 'vip' && e.ok)).toBe(true); // the chopper lands and loads
    expect(s.orders.some((o) => o.id === 'vip')).toBe(true); // still loading
    r.party = r.party!.map((f) => ({ ...f, hit: 200, chop: 500, hp: 1000, nerve: 500 }));
    const rep = s.reputation;
    const all = [...ev, ...play(s, r)];
    const cards = all.flatMap((e) => (e.type === 'alert' ? [e.alert] : []));
    expect(cards.map((a) => a.kind)).toEqual(['vip', 'delivery']); // the client's first chopper, then the raid's warning
    const warning = cards.filter((a) => a.kind === 'delivery');
    expect(warning[0]).toMatchObject({ kind: 'delivery', raid: r.id, plot: field });
    expect(warning[0].text).toMatch(/^DELIVERY RAID! .+ are coming for the pickup at .+, ETA \d+:\d\d(am|pm)\.$/);
    expect(all.some((e) => e.type === 'fight' && e.raid === r && e.report.outcome === 'robbed')).toBe(true);
    expect(s.orders.some((o) => o.id === 'vip')).toBe(false);
    expect(s.reputation).toBeCloseTo(rep - 0.3);
    expect(s.bottles).toBe(2000);
    expect(s.news.some((n) => n.startsWith('Order fell through: Test Star.'))).toBe(true);
  });

  it('held off, the load goes out and pays', () => {
    const { s, r, field } = raidedPickup();
    s.guards = crew(6, field);
    r.party = r.party!.map((f) => ({ ...f, hit: 0.1, chop: 0, hp: 1, nerve: 1 }));
    const rep = s.reputation;
    const ev = play(s, r);
    expect(ev.some((e) => e.type === 'fight' && e.report.outcome !== 'robbed')).toBe(true);
    expect(s.orders.some((o) => o.id === 'vip')).toBe(false);
    expect(s.bottles).toBe(2000);
    expect(s.reputation).toBeCloseTo(rep + VIP_STAR_BONUS);
    expect(s.news.some((n) => n.includes('Test Star picks up 4,000 bottles'))).toBe(true);
  });

  it('Finish the day stops at the warning', () => {
    const { seed, r } = raidedPickup();
    const { s } = pickupGame(seed);
    s.seenClients = ['Test Star']; // a regular: the first-visit stop doesn't come first
    const ev = simulateRestOfDay(s, true);
    expect(s.phase).toBe('open');
    expect(ev.at(-1)).toMatchObject({ type: 'alert', alert: { kind: 'delivery' } });
    expect(s.minute).toBe(Math.max(r.warnAt!, r.leave! + 1)); // it sets out with the chopper and warns on the clock
  });

  it('called off mid-loading (the rival went under), the load goes out at once and is not raided again', () => {
    const { s, r } = raidedPickup();
    expect(s.heldPickups).toEqual(['vip']);
    const cash = s.cash, rep = s.reputation;
    eliminate(s, r.attacker as RivalId, 'bankrupt');
    expect(s.raids.includes(r)).toBe(false);
    tickMinute(s);
    expect(s.orders.some((o) => o.id === 'vip')).toBe(false);
    expect(s.heldPickups).toEqual([]);
    expect(s.bottles).toBe(2000);
    expect(s.cash).toBeGreaterThanOrEqual(cash + 15000 - 1);
    expect(s.reputation).toBeCloseTo(rep + VIP_STAR_BONUS);
    simulateRestOfDay(s); // closing: nothing left to deliver, nothing rolled again
    expect(s.raids.some((x) => x.delivery)).toBe(false);
    expect(s.news.filter((n) => n.includes('Test Star picks up'))).toHaveLength(1);
  });

  it('while the Syndicate stands, every Harbor Fest pickup draws one', () => {
    const fest = festivalDays('harborFest', 2).from;
    for (let seed = 1; seed <= 6; seed++) {
      const { s } = pickupGame(seed);
      s.day = fest;
      s.syndicate = { formed: fest - 1 };
      for (const o of s.orders) Object.assign(o, { due: fest, expires: fest });
      while (s.minute <= PICKUP_MINUTE.heli) tickMinute(s);
      expect(s.raids.some((x) => x.delivery)).toBe(true);
    }
  });

  it('no rival in a Truce with you sends one', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { s } = pickupGame(seed);
      for (const id of Object.keys(s.rivals) as RivalId[]) Object.assign(s.rivals[id], { truceUntil: s.day, respectUntil: 0 });
      while (s.minute <= PICKUP_MINUTE.heli) tickMinute(s);
      expect(s.raids.some((x) => x.delivery)).toBe(false);
    }
  });

  it('a pickup still loading keeps loading across a save', () => {
    const { s, r } = raidedPickup();
    const old = JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
    delete old.heldPickups; // a save from before the hold was kept
    const m = migrateSave(old)!;
    expect(m.heldPickups).toEqual(['vip']);
    const mr = m.raids.find((x) => x.id === r.id)!;
    mr.party = mr.party!.map((f) => ({ ...f, hit: 200, chop: 500, hp: 1000, nerve: 500 }));
    play(m, mr);
    expect(m.orders.some((o) => o.id === 'vip')).toBe(false);
    expect(m.news.some((n) => n.startsWith('Order fell through: Test Star.'))).toBe(true);
  });
});

describe('VIP first arrivals', () => {
  /** Rank 7 with a helipad and a pier, and orders due today. */
  function vipDay(orders: { id: string; tier: 'heli' | 'ship'; client: string }[]) {
    const s = newGame(5);
    s.rank = 7;
    s.reputation = 4.5;
    s.cash = 3_000_000;
    s.rivals.blenders.respectUntil = s.rivals.coldbrew.respectUntil = s.rivals.fizzco.respectUntil = s.rivals.hollis.respectUntil = s.rivals.sourwood.respectUntil = 99;
    const field = PLOTS.find((p) => p.type === 'field')!.id; // cleared of Hollis's Lemon Grove
    const dock = PLOTS.find((p) => p.type === 'dock' && !s.plots[p.id].facility)!.id;
    for (const id of [field, dock]) s.plots[id] = { ...s.plots[id], owner: 'player', stand: null, facility: undefined, invested: 0 };
    buildFacility(s, field, 'helipad');
    buildFacility(s, dock, 'pier');
    s.bottles = 100_000;
    for (const o of orders) s.orders.push({ ...o, qty: 2000, pay: 6000, due: s.day, expires: s.day, plot: o.tier === 'heli' ? field : dock, accepted: true });
    openStand(s);
    return { s, field, dock };
  }
  const vipCards = (ev: SimEvent[]) => ev.flatMap((e) => (e.type === 'alert' && e.alert.kind === 'vip' ? [e.alert] : []));

  it("is a major alert that stops Finish the day; the client is a regular after that, even after a skip", () => {
    const { s, dock, field } = vipDay([{ id: 'ship1', tier: 'ship', client: 'the Bay Centennial flotilla' }, { id: 'heli1', tier: 'heli', client: 'a celebrity wedding' }]);
    let ev = simulateRestOfDay(s, true);
    expect(s.minute).toBe(PICKUP_MINUTE.ship + 1);
    expect(vipCards(ev)).toEqual([expect.objectContaining({ kind: 'vip', plot: dock, order: 'ship1', text: 'First ship in: the Bay Centennial flotilla!' })]);
    expect(isMajor(vipCards(ev)[0])).toBe(true);
    ev = simulateRestOfDay(s, true);
    expect(s.minute).toBe(PICKUP_MINUTE.heli + 1);
    expect(vipCards(ev)).toEqual([expect.objectContaining({ plot: field, order: 'heli1', text: 'First chopper in: a celebrity wedding!' })]);
    expect(s.seenClients).toEqual(['the Bay Centennial flotilla', 'a celebrity wedding']);
    simulateRestOfDay(s, true);
    expect(s.phase).toBe('report');
    sleepUntilDawn(s);
    // Tomorrow the wedding planners come back: a regular, no stop.
    s.orders.push({ id: 'heli2', tier: 'heli', client: 'a celebrity wedding', qty: 2000, pay: 6000, due: s.day, expires: s.day, plot: field, accepted: true });
    openStand(s);
    ev = simulateRestOfDay(s, true);
    expect(s.phase).toBe('report');
    expect(vipCards(ev)).toEqual([]);
    expect(ev.some((e) => e.type === 'pickup' && e.order.id === 'heli2' && e.ok)).toBe(true);
  });

  it('every VIP card carries the scene Watch plays; a regular lands with a small card that never pauses', () => {
    const { s, field } = vipDay([{ id: 'heli1', tier: 'heli', client: 'a celebrity wedding' }]);
    const scene = { kind: 'heli', big: false, client: 'a celebrity wedding' };
    expect(vipCards(simulateRestOfDay(s))[0].scene).toEqual(scene);
    sleepUntilDawn(s);
    s.orders.push({ id: 'heli2', tier: 'heli', client: 'a celebrity wedding', qty: 2000, pay: 6000, due: s.day, expires: s.day, plot: field, accepted: true });
    openStand(s);
    const news = s.news.length;
    const cards = simulateRestOfDay(s, true).flatMap((e) => (e.type === 'alert' && e.alert.kind === 'pickup' ? [e.alert] : []));
    expect(s.phase).toBe('report'); // it never stops the skip
    expect(cards).toEqual([expect.objectContaining({ plot: field, order: 'heli2', text: 'Chopper in: a celebrity wedding', scene })]);
    expect(isMajor(cards[0])).toBe(false);
    expect(s.news.slice(news).filter((n) => n.includes('Chopper in'))).toEqual([]); // the pickup's own news line tells it
  });

  it("a Supply Deal's weekly loads are one client", () => {
    const { s } = vipDay([{ id: 'd-1', tier: 'ship', client: 'Gulfstream Grocers (load 1 of 4)' }]);
    expect(clientOf(s.orders[0])).toBe('Gulfstream Grocers');
    const first = vipCards(simulateRestOfDay(s));
    expect(first.map((a) => a.text)).toEqual(['First ship in: Gulfstream Grocers!']);
    sleepUntilDawn(s);
    s.orders.push({ id: 'd-2', tier: 'ship', client: 'Gulfstream Grocers (load 2 of 4)', qty: 2000, pay: 6000, due: s.day, expires: s.day, plot: first[0].plot, accepted: true });
    openStand(s);
    const ev = simulateRestOfDay(s);
    expect(ev.some((e) => e.type === 'pickup' && e.order.id === 'd-2' && e.ok)).toBe(true);
    expect(vipCards(ev)).toEqual([]);
  });
});

describe('your raids travel', () => {
  /** Rank 6, the Evening of Day 8: three level-5 guards posted at Lottie's Corner, and a rival stand to hit. */
  function crewed(seed: number) {
    const s = evening(seed);
    s.day = 8;
    s.rank = 6;
    s.guards = crew(3, LOTTIES_CORNER);
    const target = raidTargets(s)[0].id;
    return { s, target, trip: travelMinutes(s, LOTTIES_CORNER, target) };
  }
  /** Run the clock through the night (from the Evening): each fight's minute and report, by raid. */
  function night(s: GameState, each?: () => void) {
    const fights: Record<string, { minute: number; report: BattleReport }> = {};
    startNight(s);
    while (s.phase === 'night') { for (const e of tickMinute(s)) if (e.type === 'fight') fights[e.raid.id] = { minute: s.minute, report: e.report }; each?.(); }
    return fights;
  }
  const ids = (b: BattleReport) => b.defenders.map((f) => f.id).sort();

  it('about 1.5 game hours from Maple Row to the Boardwalk, and 1–3 hours each way anywhere', () => {
    const s = newGame(1);
    const pier = PLOTS.find((p) => p.district === 'boardwalk' && p.type === 'landmark')!;
    const t = Math.min(...PLOTS.filter((p) => p.district === 'maple').map((p) => travelMinutes(s, p.id, pier.id)));
    expect(t).toBeGreaterThanOrEqual(85);
    expect(t).toBeLessThanOrEqual(100);
    const { s: c, target, trip } = crewed(2);
    expect(squadTrip(c, target, 'tonight')).toEqual({ leave: 25 * 60, at: 25 * 60 + trip, back: 25 * 60 + 2 * trip + RAID_FIGHT_GUESS, travel: trip });
    expect(squadHome(c, target)).toBe(LOTTIES_CORNER); // no Clubhouse on a plot yet
  });

  it("tonight's squad leaves its posts at 01:00; a raid on them meanwhile finds them empty until the squad is home", () => {
    const { s, target, trip } = crewed(4);
    expect(planRaid(s, target, ['g0', 'g1'], 'shakedown', 'tonight')).toBe(true);
    const mine = s.raids[0];
    const before = raidOn(s, 23 * 60, 24 * 60 + 30); // 00:30, before they set out
    const during = raidOn(s, 25 * 60 + trip - 30, 25 * 60 + trip + 30); // while they're out
    const awayAt: Record<number, string[]> = {};
    const fights = night(s, () => { if ([24 * 60 + 59, 25 * 60].includes(s.minute)) awayAt[s.minute] = [...awayGuards(s)].sort(); });
    expect(awayAt).toEqual({ [24 * 60 + 59]: [], [25 * 60]: ['g0', 'g1'] });
    expect(fights[mine.id].minute).toBe(25 * 60 + trip);
    expect(ids(fights[before.id].report)).toEqual(['g0', 'g1', 'g2']);
    expect(ids(fights[during.id].report)).toEqual(['g2']);
    expect(mine.back).toBe(25 * 60 + trip + Math.ceil(fights[mine.id].report.duration / FIGHT_SECONDS_PER_GAME_MINUTE) + trip);
    expect(s.raids.includes(mine) ? mine.back! > DAWN : true).toBe(true); // home by dawn, or in this morning (below)
  });

  it('a raid sent now leaves as the stands open, fights on arrival, and costs Reputation only then', () => {
    const { s, target, trip } = crewed(5);
    s.phase = 'prep';
    s.minute = DAWN;
    const rep = s.reputation;
    expect(planRaid(s, target, ['g0', 'g1'], 'smash', 'now')).toBe(true);
    const r = s.raids[0];
    expect([r.leave, r.at]).toEqual([OPEN, OPEN + trip]);
    expect(awayGuards(s).size).toBe(0); // they hold their posts at Morning Prep
    openStand(s);
    expect(s.reputation).toBe(rep);
    let fought = 0;
    while (!fought) for (const e of tickMinute(s)) if (e.type === 'fight') fought = s.minute;
    expect(fought).toBe(OPEN + trip);
    expect(s.reputation).toBeCloseTo(rep - DAYTIME_RAID_REP.smash, 5);
    expect([...awayGuards(s)].sort()).toEqual(['g0', 'g1']); // walking home
    while (s.raids.includes(r)) tickMinute(s);
    expect(s.minute).toBe(r.back);
    expect(awayGuards(s).size).toBe(0);
  });

  it('with nobody fit to go at departure the raid is called off: no fight, no Grudge', () => {
    const { s, target } = crewed(6);
    const rival = s.plots[target].owner as RivalId;
    planRaid(s, target, ['g0', 'g1'], 'smash', 'tonight');
    const grudge = s.rivals[rival].grudge;
    s.guards[0].outUntil = s.guards[1].outUntil = s.day + 2; // knocked out before 01:00
    const fights = night(s);
    expect(Object.keys(fights)).toEqual([]);
    expect(s.rivals[rival].grudge).toBe(grudge);
    expect(s.battles.some((b) => b.attacker === 'player')).toBe(false);
    expect(s.news.some((n) => n.includes('called off'))).toBe(true);
  });

  it('a squad member out of action stays home; the rest go', () => {
    const { s, target } = crewed(7);
    planRaid(s, target, ['g0', 'g1'], 'smash', 'tonight');
    const r = s.raids[0];
    s.guards[0].outUntil = s.day + 2;
    night(s);
    expect(r.guards).toEqual(['g1']);
    expect(s.battles.find((b) => b.attacker === 'player')!.attackers.map((f) => f.id)).toEqual(['g1']);
  });

  it('nothing left to hit when they get there: the squad turns back without a fight', () => {
    const { s, target, trip } = crewed(9);
    planRaid(s, target, ['g0'], 'smash', 'tonight');
    const r = s.raids[0];
    s.plots[target].stand = null;
    delete s.plots[target].facility;
    let back = 0;
    const fights = night(s, () => { if (!back && r.back) back = r.back; });
    expect(fights[r.id]).toBeUndefined();
    expect(back).toBe(25 * 60 + 2 * trip);
  });

  it('sent so late in the night that it gets there after 07:00, it fights in the morning, in daylight', () => {
    const { s, target, trip } = crewed(11);
    startNight(s);
    while (s.minute < NIGHT_END - 30) nightStep(s);
    expect(planRaid(s, target, ['g0'], 'smash', 'tonight')).toBe(true);
    const r = s.raids.find((x) => x.attacker === 'player')!;
    expect([r.leave, r.at]).toEqual([NIGHT_END - 30, NIGHT_END - 30 + trip]);
    sleepUntilDawn(s);
    expect(s.battles.some((b) => b.attacker === 'player')).toBe(false); // dawn doesn't fight it
    expect(r.at).toBe(NIGHT_END - 30 + trip - MINUTES_PER_DAY);
    expect(awayGuards(s).has('g0')).toBe(true);
    openStand(s);
    let fought = 0;
    while (!fought) for (const e of tickMinute(s)) if (e.type === 'fight') fought = s.minute;
    expect(fought).toBe(Math.max(OPEN + 1, r.at!));
  });

  it('a squad still walking home at dawn gets in that morning', () => {
    const { s, target } = crewed(10);
    s.raids.push({ id: 'late', attacker: 'player', target, objective: 'smash', guards: ['g0'], detected: true, eta: hhmm(NIGHT_END - 30), leave: NIGHT_END - 90, at: NIGHT_END - 30, launched: true, back: NIGHT_END + 50 });
    sleepUntilDawn(s);
    expect(s.raids.find((r) => r.id === 'late')?.back).toBe(DAWN + 50);
    expect([...awayGuards(s)]).toEqual(['g0']);
    expect(s.battles.some((b) => b.attacker === 'player')).toBe(false); // dawn never fights a squad that's walking home
    openStand(s);
    tickMinute(s);
    expect(s.raids.some((r) => r.id === 'late')).toBe(false);
    expect(awayGuards(s).size).toBe(0);
  });
});

describe("Juni's Grapevine", () => {
  it('with the Grindhouse taken, a raid on you is warned 1 game hour earlier, detected or not', () => {
    const s = evening(12);
    s.plots[hqPlot('coldbrew').id].owner = 'player';
    const seen = raidOn(s, 23 * 60, 24 * 60);
    startNight(s);
    while (!seen.warned) nightStep(s);
    expect(s.minute).toBe(22 * 60); // an hour before they set out
    expect(seen.at! - s.minute).toBe(120);
    // Missed as they set out: the minimum notice, an hour sooner (23:45 less an hour).
    const o = evening(13);
    o.plots[hqPlot('coldbrew').id].owner = 'player';
    o.raids.push({ id: 'old', attacker: 'blenders', target: LOTTIES_CORNER, objective: 'smash', party: raidPartyFor(o, 'blenders'), detected: false, eta: '00:00', leave: 23 * 60 });
    migrateNights(o);
    expect(o.raids[0].warnAt).toBe(24 * 60 - raidNotice(o) - 60);
  });

  it('only for raids on you, and never before the clock', () => {
    const s = evening(14);
    s.plots[hqPlot('coldbrew').id].owner = 'player';
    s.rank = 6;
    s.guards = crew(1, null);
    const rival = raidOn(s, 23 * 60, 24 * 60, { attacker: 'hollis', target: raidTargets(s).find((p) => s.plots[p.id].owner === 'blenders')!.id });
    planRaid(s, raidTargets(s)[0].id, ['g0'], 'smash', 'tonight');
    const mine = s.raids.find((r) => r.attacker === 'player')!;
    const late = raidOn(s, CLOSE + 10, CLOSE + 70);
    startNight(s);
    nightStep(s);
    expect(late.warned).toBe(true); // straight away: it can't be heard of before the night began
    while (s.minute < 23 * 60 - 1) nightStep(s);
    expect(rival.launched).toBeFalsy();
    while (s.minute < 25 * 60 - 1) nightStep(s);
    expect(mine.launched).toBeFalsy();
    nightStep(s);
    expect(mine.launched).toBe(true);
  });
});

describe('saves', () => {
  it("an older save's raids get their minutes, once", () => {
    const s = evening(31);
    s.raids.push({ id: 'old', attacker: 'blenders', target: LOTTIES_CORNER, objective: 'smash', party: raidPartyFor(s, 'blenders'), detected: false, eta: '23:40' });
    const old = JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
    delete old.alerts;
    delete old.alertSeq;
    const m = migrateSave(old)!;
    expect(m.version).toBe(SAVE_VERSION);
    expect(m.alerts).toEqual([]);
    expect(m.raids[0]).toMatchObject({ at: 23 * 60 + 40, launched: true, warnAt: 23 * 60 + 25 });
    expect(m.raids[0].leave).toBeGreaterThanOrEqual(CLOSE);
    expect(JSON.stringify(migrateSave(JSON.parse(JSON.stringify(m))))).toBe(JSON.stringify(m));
    expect(sleepUntilDawn(m, true)).toBe(false); // it plays on: warned at its notice
    expect(m.minute).toBe(23 * 60 + 25);
  });
});

describe('Custom difficulty', () => {
  const custom = (c: Partial<CustomDifficulty> = {}): Partial<Settings> => ({ difficulty: 'custom', custom: { ...customDefaults(), ...c } });
  const tough = (s: GameState) => raidPartyFor(s, 'blenders').map((f) => ({ ...f, hit: 200, chop: 500, hp: 1000, nerve: 500 }));

  it("starts from Classic; each slider stays between Laid Back's and Cutthroat's", () => {
    expect(difficultyOf(defaultSettings({ difficulty: 'custom' }))).toMatchObject({ raids: 1, notice: 15, respectDays: 3, bustOnly: false, cookieJar: 'perAct', threat: 0, canLose: true });
    const wild = { raids: 9, notice: 1, respectDays: Number.NaN, bustOnly: true, cookieJar: 'always' } as CustomDifficulty;
    expect(difficultyOf(defaultSettings({ difficulty: 'custom', custom: wild }))).toMatchObject({ raids: 1.5, notice: 5, respectDays: 1, bustOnly: true, cookieJar: 'always', canLose: false });
    expect(difficultyOf(defaultSettings({ difficulty: 'custom', custom: { ...customDefaults(), raids: 0.1, notice: 99, respectDays: 9, cookieJar: 'sometimes' as 'never' } })))
      .toMatchObject({ raids: 0.5, notice: 30, respectDays: 5, cookieJar: 'perAct' });
    const { laidback: lb, cutthroat: ct } = DIFFICULTY;
    expect([CUSTOM_RANGE.raids[0], CUSTOM_RANGE.raids[1]]).toEqual([lb.raids, ct.raids]);
    expect([CUSTOM_RANGE.notice[0], CUSTOM_RANGE.notice[1]]).toEqual([ct.notice, lb.notice]);
    expect([CUSTOM_RANGE.respectDays[0], CUSTOM_RANGE.respectDays[1]]).toEqual([ct.respectDays, lb.respectDays]);
    expect(difficultyOf(defaultSettings({ difficulty: 'laidback', custom: wild }))).toBe(lb); // the sliders only count on Custom
  });

  it('Threat takes no nudge, and an undetected raid warns at the notice slider', () => {
    const c = newGame(1, custom({ notice: 25 })), lb = newGame(1, { difficulty: 'laidback' });
    c.rank = lb.rank = 6;
    expect([threatLevel(c), threatLevel(lb)]).toEqual([3, 2]);
    expect(raidNotice(c)).toBe(25);
    let late = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const s = evening(seed, custom({ notice: 25 }));
      const r = raidOn(s, 21 * 60, 23 * 60, { detected: false });
      expect(sleepUntilDawn(s, true)).toBe(false);
      if (!r.detected) { late++; expect(s.minute).toBe(23 * 60 - 25); }
    }
    expect(late).toBeGreaterThan(0);
  });

  it('raids on you follow the slider, and at its defaults Custom raids as Classic does', () => {
    const raided = (settings: Partial<Settings>) => {
      const hit: number[] = [];
      for (let seed = 1; seed <= 60; seed++) {
        const s = evening(seed, settings);
        s.day = 10;
        s.rank = 4;
        s.battles.push({ day: 1, attacker: 'blenders', defender: 'player', target: LOTTIES_CORNER, outcome: 'repelled' } as BattleReport); // past the tutorial raid
        planNight(s);
        if (s.raids.some((r) => onYou(s, r))) hit.push(seed);
      }
      return hit;
    };
    const few = raided(custom({ raids: 0.5 })), many = raided(custom({ raids: 1.5 }));
    expect(few.every((seed) => many.includes(seed))).toBe(true); // the same nights' dice: ×0.5 raids a subset of ×1.5's
    expect(many.length).toBeGreaterThan(few.length * 2);
    expect(raided(custom())).toEqual(raided({ difficulty: 'classic' }));
  });

  it('Busted-only and the Respect cooldown come from the sliders', () => {
    const smash = (s: GameState) => fightRaid(s, { id: 'r1', attacker: 'blenders', target: LOTTIES_CORNER, objective: 'smash', party: tough(s), detected: true, eta: '23:00' }, true);
    const bust = newGame(3, custom({ bustOnly: true }));
    expect(smash(bust)).toMatchObject({ outcome: 'smashed', busted: true });
    expect(bust.plots[LOTTIES_CORNER].busted).toBe(true);
    const wreck = newGame(3, custom());
    expect(smash(wreck).busted).toBeUndefined();
    expect(wreck.plots[LOTTIES_CORNER].busted).toBeUndefined();
    const s = newGame(4, custom({ respectDays: 5 }));
    s.guards = crew(4, LOTTIES_CORNER);
    const weak = raidPartyFor(s, 'blenders').slice(0, 1).map((f) => ({ ...f, hit: 1, chop: 1, hp: 1, nerve: 1 }));
    expect(fightRaid(s, { id: 'r2', attacker: 'blenders', target: LOTTIES_CORNER, objective: 'smash', party: weak, detected: true, eta: '23:00' }, true).outcome).toBe('repelled');
    expect(s.rivals.blenders.respectUntil).toBe(s.day + 1 + 5);
  });

  it("Busted-only caps a Damaged stand's repair at the Busted fix, as on Laid Back", () => {
    const repairAt40 = (c: Partial<CustomDifficulty>) => {
      const s = newGame(9, custom(c));
      s.rank = 6; s.cash = 100000; s.phase = 'prep';
      upgradeStand(s, LOTTIES_CORNER);
      upgradeStand(s, LOTTIES_CORNER);
      s.plots[LOTTIES_CORNER].stand!.hp = 40;
      return repairCost(s, LOTTIES_CORNER);
    };
    expect(repairAt40({ bustOnly: true })).toBe(405);
    expect(repairAt40({})).toBeGreaterThan(405);
  });

  it('the Cookie Jar slider: Always never ends the run; Never squeezes you out after 3 days In the Red', () => {
    const brokeDawn = (s: GameState) => { s.phase = 'report'; s.cash = -100; sleepUntilDawn(s); };
    const always = newGame(5, custom({ cookieJar: 'always' }));
    for (let i = 0; i < 8; i++) brokeDawn(always);
    expect(always.outcome).toBeUndefined();
    const never = newGame(5, custom({ cookieJar: 'never' }));
    for (let i = 0; i < 4; i++) brokeDawn(never);
    expect(never.outcome?.how).toBe('squeezed');
  });

  it('a Custom run saves its sliders', () => {
    const s = newGame(6, custom({ raids: 1.3, notice: 10, bustOnly: true }));
    const back = migrateSave(JSON.parse(JSON.stringify(s)))!;
    expect(back.settings.custom).toEqual({ ...customDefaults(), raids: 1.3, notice: 10, bustOnly: true });
    expect(raidNotice(back)).toBe(10);
  });
});
