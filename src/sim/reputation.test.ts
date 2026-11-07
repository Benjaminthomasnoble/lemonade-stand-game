import { describe, expect, it } from 'vitest';
import {
  addRivalStars, appealFor, driftReputation, emptyHanded, LOTTIES_CORNER, migrateSave, newGame, newStand, openStands, PLOT_BY_ID, REP_DRIFT,
  repMultiplier, reputationAtClose, reputationTarget, rivalBidStars, rivalEmptyHanded, rivalPrice, rivalReputationTarget, rivalStars, simulateRestOfDay,
  type GameState, type RivalId,
} from './economy.ts';

/** The player's stands at these levels: Lottie's Corner first, then the next plots that change hands for the test. */
function standsAt(s: GameState, levels: number[]): void {
  const plots = [LOTTIES_CORNER, 'maple-1n', 'maple-2n', 'maple-3n', 'maple-2s'];
  levels.forEach((lv, i) => {
    s.plots[plots[i]].owner = 'player';
    s.plots[plots[i]].stand = newStand(lv);
  });
}

/** Today's buyers and walk-pasts, as the day's counts. */
function today(s: GameState, sold: number, w: Partial<GameState['today']['walkedPast']>): void {
  s.today.customers = sold;
  s.today.walkedPast = { notThirsty: 0, pricey: 0, line: 0, soldOut: 0, rival: 0, ...w };
}

describe('Reputation drifts each night', () => {
  it('toward 3.0 stars plus 0.4 per average stand level above L1, capped at 4.6', () => {
    const at = (levels: number[]) => {
      const s = newGame(41);
      today(s, 100, {});
      standsAt(s, levels);
      return reputationTarget(s);
    };
    expect(at([1])).toBeCloseTo(3.0, 9);
    expect(at([2])).toBeCloseTo(3.4, 9);
    expect(at([3])).toBeCloseTo(3.8, 9);
    expect(at([4])).toBeCloseTo(4.2, 9);
    expect(at([5])).toBeCloseTo(4.6, 9);
    expect(at([5, 1])).toBeCloseTo(3.8, 9); // the average: one Palace and one Folding Table make an L3
    expect(at([2, 2, 3, 2])).toBeCloseTo(3.5, 9); // the 3.5-star helicopter gate needs an average of L2.25
    expect(at([4, 3])).toBeCloseTo(4.0, 9); // and the 4.0 ship gate L3.5
    expect(at([5, 5, 5, 5, 5])).toBe(REP_DRIFT.cap);
  });

  it('less 0.1 star per 10% of would-be buyers who left empty-handed: too pricey, line too long, sold out', () => {
    const s = newGame(42);
    standsAt(s, [2]);
    today(s, 70, { pricey: 10, line: 10, soldOut: 10 });
    expect(emptyHanded(s.today)).toBeCloseTo(0.3, 9);
    expect(reputationTarget(s)).toBeCloseTo(3.4 - 0.3, 9); // 30% walk-aways lower the target 0.3
    today(s, 70, { notThirsty: 500, rival: 200 }); // not thirsty and gone to a rival don't count
    expect(reputationTarget(s)).toBeCloseTo(3.4, 9);
    today(s, 0, { notThirsty: 80 }); // no would-be buyers: no drop
    expect(emptyHanded(s.today)).toBe(0);
    expect(reputationTarget(s)).toBeCloseTo(3.4, 9);
  });

  it('5% of the gap a night, within 1-5 stars; the target is on the day\'s books', () => {
    const s = newGame(43);
    standsAt(s, [3]);
    today(s, 100, {});
    s.reputation = 3.0;
    driftReputation(s);
    expect(s.reputation).toBeCloseTo(3.0 + 0.05 * 0.8, 9);
    expect(s.today.repTarget).toBe(3.8);
    s.reputation = 5;
    driftReputation(s);
    expect(s.reputation).toBeCloseTo(5 - 0.05 * 1.2, 9); // drifts down from above the target too
    // A long run of the same nights closes in on the target and never passes it.
    s.reputation = 3.0;
    for (let n = 0; n < 200; n++) driftReputation(s);
    expect(s.reputation).toBeGreaterThan(3.79);
    expect(s.reputation).toBeLessThanOrEqual(3.8);
    // A hair short, the four-decimal rounding never stalls it: 0.0004 below closes in four nights.
    s.reputation = 3.7996;
    for (let n = 0; n < 3; n++) driftReputation(s);
    expect(s.reputation).toBe(3.7999);
    driftReputation(s);
    expect(s.reputation).toBe(3.8);
    driftReputation(s);
    expect(s.reputation).toBe(3.8);
    // About 19 nights from 3.0 to the 3.5 helicopter gate on an average of L3.
    s.reputation = 3.0;
    let nights = 0;
    while (s.reputation < 3.5) { driftReputation(s); nights++; }
    expect(nights).toBe(20);
  });

  it('a day at an L1 with nothing to sell: every buyer turned away, the target falls to 2.0 and Reputation 0.05', () => {
    const s = newGame(7);
    const st = s.plots[LOTTIES_CORNER].stand!;
    st.inventory = { lemons: [], sugar: 0, ice: 0, sugarCost: 0, iceCost: 0 };
    st.pitcherCups = 0;
    st.autoRestock = false;
    openStands(s);
    simulateRestOfDay(s);
    expect(s.today.customers).toBe(0);
    expect(s.today.walkedPast.soldOut).toBeGreaterThan(0);
    expect(s.today.repTarget).toBe(2);
    expect(s.reputation).toBeCloseTo(2.95, 9);
    expect(s.today.reputationAfter).toBe(s.reputation);
  });

  it('a good day at an L1 holds 3.0: the stand\'s level sets the target, not how pleased the buyers were', () => {
    const s = newGame(44);
    const st = s.plots[LOTTIES_CORNER].stand!;
    st.inventory = { lemons: [{ qty: 400, day: s.day, unitCost: 0.2 }], sugar: 1500, ice: 5000, sugarCost: 0.03, iceCost: 0.01 };
    openStands(s);
    simulateRestOfDay(s);
    const t = s.today;
    expect(t.customers).toBeGreaterThan(40);
    expect(t.satisfaction).toBeGreaterThan(0.5);
    expect(t.repTarget).toBeCloseTo(3.0 - emptyHanded(t), 2);
    expect(s.reputation).toBeLessThanOrEqual(3.0);
  });
});

describe('each rival keeps its own Reputation', () => {
  /** Hollis's stands only at these levels: every other Hollis stand changes hands for the test. */
  function hollisAt(s: GameState, levels: number[]): string[] {
    for (const ps of Object.values(s.plots)) if (ps.owner === 'hollis' && ps.stand) ps.owner = null;
    const plots = ['oldtown-0n', 'oldtown-2n', 'oldtown-3s', 'maple-0n'];
    return levels.map((lv, i) => {
      s.plots[plots[i]].owner = 'hollis';
      s.plots[plots[i]].stand = newStand(lv, rivalPrice('hollis', lv, PLOT_BY_ID[plots[i]]));
      return plots[i];
    });
  }

  it('starts at 3.0 stars, and its stands sell on its own stars: ×0.7 at 1 star to ×1.3 at 5', () => {
    const s = newGame(45);
    const [plot] = hollisAt(s, [2]);
    for (const id of Object.keys(s.rivals) as RivalId[]) expect(rivalStars(s, id)).toBe(3);
    const at3 = appealFor(s, plot, 'families').stopChance;
    s.rivals.hollis.reputation = 5;
    expect(appealFor(s, plot, 'families').stopChance).toBeCloseTo(at3 * repMultiplier(5) / repMultiplier(3), 9);
    s.rivals.hollis.reputation = 1;
    expect(appealFor(s, plot, 'families').stopChance).toBeCloseTo(at3 * repMultiplier(1) / repMultiplier(3), 9);
    expect(rivalBidStars(s, 'hollis')).toBe(1); // a contract client weighs the same stars
  });

  it("drifts each night by your rule: toward 3.0 + 0.4 per average stand level above L1, less its own day's walk-aways", () => {
    const s = newGame(46);
    const plots = hollisAt(s, [3, 2]);
    expect(rivalReputationTarget(s, 'hollis')).toBeCloseTo(3.6, 9); // an average of L2.5
    const [a, b] = plots.map((p) => s.plots[p].stand!.day);
    a.customers = 50;
    a.walkedPast = { notThirsty: 300, pricey: 10, line: 0, soldOut: 0, rival: 40 };
    b.customers = 20;
    b.walkedPast = { notThirsty: 100, pricey: 0, line: 10, soldOut: 10, rival: 0 };
    expect(rivalEmptyHanded(s, 'hollis')).toBeCloseTo(0.3, 9); // 30 of 100 would-be buyers, over both stands
    expect(rivalReputationTarget(s, 'hollis')).toBeCloseTo(3.3, 9);
    s.rivals.hollis.reputation = 3.0;
    s.rivals.fizzco.alive = false;
    const fizz = rivalStars(s, 'fizzco');
    reputationAtClose(s);
    expect(rivalStars(s, 'hollis')).toBeCloseTo(3.0 + 0.05 * 0.3, 9);
    expect(rivalStars(s, 'fizzco')).toBe(fizz); // out of business: no drift
    s.rivals.hollis.reputation = 4.9;
    reputationAtClose(s);
    expect(rivalStars(s, 'hollis')).toBeCloseTo(4.9 - 0.05 * 1.6, 9); // down from above, as yours does
  });

  it('a played day moves every rival from its stands, and a Taste-Off star lands within 1-5', () => {
    const s = newGame(47);
    openStands(s);
    simulateRestOfDay(s);
    for (const id of Object.keys(s.rivals) as RivalId[]) {
      expect(rivalStars(s, id)).toBeCloseTo(3 + 0.05 * (rivalReputationTarget(s, id) - 3), 3);
    }
    const brock = rivalStars(s, 'blenders');
    addRivalStars(s, 'blenders', 0.1); // a Taste-Off won (calendar.ts)
    expect(rivalStars(s, 'blenders')).toBeCloseTo(brock + 0.1, 9);
    s.rivals.coldbrew.reputation = 4.95;
    addRivalStars(s, 'coldbrew', 0.1);
    expect(rivalStars(s, 'coldbrew')).toBe(5);
    s.rivals.hollis.reputation = 1.05;
    addRivalStars(s, 'hollis', -0.1);
    expect(rivalStars(s, 'hollis')).toBe(1);
  });

  it('gives a save from before rival stars 3.0 each, and keeps them after', () => {
    const s = newGame(48);
    s.rivals.sourwood.reputation = 4.2;
    const old = JSON.parse(JSON.stringify(s));
    for (const r of Object.values(old.rivals) as { reputation?: number }[]) delete r.reputation;
    const m = migrateSave(old)!;
    for (const id of Object.keys(m.rivals) as RivalId[]) expect(m.rivals[id].reputation).toBe(3);
    expect(migrateSave(JSON.parse(JSON.stringify(s)))!.rivals.sourwood.reputation).toBe(4.2);
  });
});
