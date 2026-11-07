import { describe, expect, it } from 'vitest';
import {
  assetValue, borrow, canBuyPlot, canRaid, checkVictory, eliminate, factionBuyoutPrice, fightRaid, FACTIONS, keepSqueezing,
  loanLimit, LOAN, LOTTIES_CORNER, migrateSave, netWorth, newGame, openStand, PLOTS, raidPartyFor, rebuildCost, rebuildStand,
  SAVE_VERSION, simulateRestOfDay, sleepUntilDawn, successScore, threatLevel, type GameState, type RivalId,
} from './economy.ts';
import { planNight } from './crew.ts';

const RIVALS = Object.keys(FACTIONS) as RivalId[];

/** One business day with whatever is in stock, then the night. */
function day(s: GameState) {
  openStand(s);
  simulateRestOfDay(s);
  sleepUntilDawn(s);
}

describe('difficulty', () => {
  it('Laid Back lowers Threat by 1, never below 1', () => {
    const lb = newGame(1, { difficulty: 'laidback' });
    const cl = newGame(1);
    lb.rank = cl.rank = 6;
    expect(threatLevel(cl)).toBe(3);
    expect(threatLevel(lb)).toBe(2);
    lb.rank = 1;
    expect(threatLevel(lb)).toBe(1);
  });

  it('Laid Back only Busts your stand: a 10% repair, and the plot is never lost', () => {
    const s = newGame(3, { difficulty: 'laidback' });
    const party = raidPartyFor(s, 'blenders').map((f) => ({ ...f, hit: 200, chop: 500, hp: 1000, nerve: 500 }));
    const b = fightRaid(s, { id: 'r1', attacker: 'blenders', target: LOTTIES_CORNER, objective: 'smash', party, detected: true, eta: '23:00' }, true);
    expect(b.outcome).toBe('smashed');
    expect(b.busted).toBe(true);
    const ps = s.plots[LOTTIES_CORNER];
    expect(ps.busted).toBe(true);
    expect(rebuildCost(ps)).toBe(Math.ceil(ps.invested * 0.1));
    for (let i = 0; i < 4; i++) { s.cash = Math.max(s.cash, 50); s.phase = 'report'; sleepUntilDawn(s); }
    expect(s.plots[LOTTIES_CORNER].owner).toBe('player'); // a Wrecked stand would have lapsed by now
    s.cash = 100;
    expect(rebuildStand(s, LOTTIES_CORNER)).toBe(true); // the fix runs overnight
    expect(s.plots[LOTTIES_CORNER].busted).toBe(true);
    s.phase = 'report';
    sleepUntilDawn(s);
    expect(s.plots[LOTTIES_CORNER].busted).toBeUndefined();
    expect(s.plots[LOTTIES_CORNER].stand!.wrecked).toBe(false);
  });

  it('Classic Wrecks your stand, and an unrebuilt plot lapses', () => {
    const s = newGame(3);
    const party = raidPartyFor(s, 'blenders').map((f) => ({ ...f, hit: 200, chop: 500, hp: 1000, nerve: 500 }));
    const b = fightRaid(s, { id: 'r1', attacker: 'blenders', target: LOTTIES_CORNER, objective: 'smash', party, detected: true, eta: '23:00' }, true);
    expect(b.busted).toBeUndefined();
    expect(rebuildCost(s.plots[LOTTIES_CORNER])).toBe(Math.ceil(s.plots[LOTTIES_CORNER].invested * 0.15));
    for (let i = 0; i < 3; i++) { s.cash = Math.max(s.cash, 50); s.phase = 'report'; sleepUntilDawn(s); }
    expect(s.plots[LOTTIES_CORNER].owner).not.toBe('player');
  });
});

describe('In the Red and the Cookie Jar', () => {
  /** End a day broke and sleep to the next dawn. */
  const brokeDawn = (s: GameState) => { s.phase = 'report'; s.cash = -100; sleepUntilDawn(s); };
  const goBroke = (s: GameState) => { for (let i = 0; i < 4; i++) brokeDawn(s); };

  it('gives 3 days, then Classic\'s Cookie Jar pays once per act, then you are Squeezed Out', () => {
    const s = newGame(5);
    brokeDawn(s);
    expect(s.redDays).toBe(1);
    expect(s.news.some((n) => n.startsWith('IN THE RED'))).toBe(true);
    brokeDawn(s); brokeDawn(s);
    expect(s.redDays).toBe(3);
    brokeDawn(s);
    expect(s.outcome).toBeUndefined();
    expect(s.redDays).toBe(0);
    expect(s.cash).toBeGreaterThan(0); // the Cookie Jar paid the shortfall plus a day of costs
    expect(s.cookieJar).toEqual(['act1']);
    goBroke(s);
    expect(s.outcome?.result).toBe('lost');
    expect(s.outcome?.how).toBe('squeezed');
    const day = s.day;
    openStand(s);
    expect(s.phase).toBe('prep'); // the run is over: nothing moves
    expect(sleepUntilDawn(s)).toBe(false);
    expect(s.day).toBe(day);
  });

  it('never ends a Laid Back run, and Cutthroat has no Cookie Jar', () => {
    const lb = newGame(5, { difficulty: 'laidback' });
    for (let i = 0; i < 3; i++) goBroke(lb);
    expect(lb.outcome).toBeUndefined();
    const ct = newGame(5, { difficulty: 'cutthroat' });
    goBroke(ct);
    expect(ct.outcome?.how).toBe('squeezed');
  });

  it('Runs you Out of Town with no stands and less than a Folding Table', () => {
    const s = newGame(6);
    s.plots[LOTTIES_CORNER].stand = null;
    s.cash = 100;
    day(s);
    expect(s.outcome?.how).toBe('runout');
    const lb = newGame(6, { difficulty: 'laidback' });
    lb.plots[LOTTIES_CORNER].stand = null;
    lb.cash = 100;
    day(lb);
    expect(lb.outcome).toBeUndefined();
  });
});

describe('loans', () => {
  it('lends up to half your non-cash Net Worth without moving your score', () => {
    const s = newGame(9);
    s.phase = 'report';
    const limit = loanLimit(s);
    expect(limit).toBe(Math.floor(assetValue(s) * LOAN.share / 50) * 50);
    const before = netWorth(s);
    expect(borrow(s, limit + 50)).toBe(false);
    expect(borrow(s, limit)).toBe(true);
    expect(netWorth(s)).toBeCloseTo(before, 2);
    expect(loanLimit(s)).toBe(0);
  });

  it('takes weekly payments with interest, and two missed payments cost your cheapest plot', () => {
    const s = newGame(9);
    s.plots[LOTTIES_CORNER].stand!.autoRestock = false; // the dawns' only bills are the loan's and the wages
    s.phase = 'report';
    borrow(s, 200);
    s.cash = 10_000;
    for (let i = 0; i < 6; i++) { s.phase = 'report'; sleepUntilDawn(s); }
    const before = s.cash;
    s.phase = 'report';
    sleepUntilDawn(s); // a week after borrowing
    expect(s.loan!.weeksLeft).toBe(3);
    expect(s.loan!.principal).toBeCloseTo(150, 2);
    expect(before - s.cash).toBeCloseTo(50 + 6 + 15, 2); // a quarter of the loan, 3% interest, Dex's wage
    for (let i = 0; i < 14; i++) { s.cash = 20; s.phase = 'report'; sleepUntilDawn(s); } // enough for wages, not the loan
    expect(s.news.some((n) => n.startsWith('REPOSSESSED'))).toBe(true);
    expect(s.plots[LOTTIES_CORNER].owner).toBe(null);
  });
});

describe('winning', () => {
  /** Take every plot no living rival holds. */
  const ownTheBay = (s: GameState) => {
    for (const p of PLOTS) {
      const o = s.plots[p.id].owner;
      if (p.type !== 'civic' && (!o || o === 'player' || !s.rivals[o as RivalId].alive)) s.plots[p.id].owner = 'player';
    }
  };

  it('Domination needs every rival out and a Majority in every district', () => {
    const s = newGame(11);
    ownTheBay(s);
    expect(checkVictory(s)).toBe(false); // rivals still standing
    for (const r of RIVALS.filter((x) => x !== 'sourwood')) eliminate(s, r, 'bankrupt');
    expect(s.outcome).toBeUndefined();
    ownTheBay(s);
    s.tally = { buyouts: 4, smashes: 1, hqs: 1 };
    s.reputation = 4.2;
    eliminate(s, 'sourwood', 'hq'); // their plots go to the Fire Sale
    ownTheBay(s);
    checkVictory(s);
    expect(s.outcome).toMatchObject({ result: 'won', how: 'domination', ending: 'beloved' });
    expect(keepSqueezing(s)).toBe(true);
    expect(s.endlessSince).toBe(s.day);
    day(s); // the clock keeps running in Endless Summer
    expect(s.outcome?.result).toBe('won');
  });

  it('the Iron Pitcher is the ending for smashers', () => {
    const s = newGame(11);
    for (const r of RIVALS) eliminate(s, r, 'hq');
    s.tally = { buyouts: 1, smashes: 3, hqs: 5 };
    ownTheBay(s);
    checkVictory(s);
    expect(s.outcome?.ending).toBe('iron');
  });

  it('Sandbox can win on Success Score, Endless never ends in a win', () => {
    const s = newGame(12, { mode: 'sandbox', win: 'economic', target: 2000 });
    expect(checkVictory(s)).toBe(false);
    s.cash = 5000;
    expect(successScore(s)).toBeGreaterThan(2000);
    expect(checkVictory(s)).toBe(true);
    expect(s.outcome?.how).toBe('economic');
    expect(s.outcome?.ending).toBeUndefined();
    const e = newGame(12, { mode: 'endless' });
    for (const r of RIVALS) eliminate(e, r, 'hq');
    ownTheBay(e);
    expect(checkVictory(e)).toBe(false);
  });
});

describe('Sandbox', () => {
  it('Peaceful has no raids, no HQ assaults, and Vera sells at 3x', () => {
    const s = newGame(13, { mode: 'sandbox', peaceful: true });
    const c = newGame(13);
    s.rank = c.rank = 9;
    expect(factionBuyoutPrice(c, 'sourwood')).toBeNull();
    expect(factionBuyoutPrice(s, 'sourwood')).toBeGreaterThan(0);
    const rivalStand = PLOTS.find((p) => s.plots[p.id].owner === 'blenders' && s.plots[p.id].stand)!;
    expect(canRaid(s, rivalStand.id, ['g1']).ok).toBe(false);
    s.day = 30;
    for (let i = 0; i < 30; i++) planNight(s);
    expect(s.raids.length).toBe(0);
  });

  it('opens the border rule at Rank 2', () => {
    const s = newGame(14, { mode: 'sandbox' });
    const c = newGame(14);
    s.rank = c.rank = 2;
    s.cash = c.cash = 1e6;
    const oldTown = PLOTS.find((p) => p.district === 'oldtown' && p.type === 'street' && !s.plots[p.id].owner)!;
    // Old Town borders Maple Row: Rank 2 opens it in both modes. Nothing farther yet.
    expect(canBuyPlot(s, oldTown.id).ok).toBe(true);
    s.plots[oldTown.id].owner = 'player';
    c.plots[oldTown.id].owner = 'player';
    const campus = PLOTS.find((p) => p.district === 'campus' && p.type === 'street' && !s.plots[p.id].owner)!;
    expect(canBuyPlot(s, campus.id).ok).toBe(true);
    expect(canBuyPlot(c, campus.id).ok).toBe(false); // the campaign waits for Rank 3
  });
});

describe('saves', () => {
  it('migrates a version 7 save to a Classic campaign', () => {
    const old = JSON.parse(JSON.stringify(newGame(15))) as Record<string, unknown>;
    old.version = 7;
    delete old.settings;
    const s = migrateSave(old)!;
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.settings).toMatchObject({ mode: 'campaign', difficulty: 'classic' });
    expect(migrateSave({ version: 6 })).toBeNull();
  });
});
