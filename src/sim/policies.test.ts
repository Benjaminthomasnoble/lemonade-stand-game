import { describe, expect, it } from 'vitest';
import {
  BULK, bulkGroups, bulkMembers, bulkPlan, FACILITIES, helperLines, LOTTIES_CORNER, newGame, newStand, NO_DEFENSE, PERIMETERS, PLOTS, runBulk,
  STAND_LEVELS, standCost, type DistrictId, type GameState,
} from './economy.ts';

const streets = (s: GameState, d: DistrictId, n: number) => PLOTS.filter((p) => p.district === d && p.type === 'street' && !s.plots[p.id].owner).slice(0, n).map((p) => p.id);
/** Hand the player a plot with a stand of this level on it (tests skip the buying and building). */
function give(s: GameState, id: string, level: number, lastProfit = 0) {
  const stand = newStand(level);
  stand.lastProfit = lastProfit;
  s.plots[id] = { ...s.plots[id], owner: 'player', stand, invested: standCost(level), defense: NO_DEFENSE() };
}
const levels = (s: GameState, ids: string[]) => ids.map((id) => s.plots[id].stand!.level);

describe('bulk orders (Rank 3)', () => {
  it('waits for Rank 3, Block Boss', () => {
    const s = newGame(31);
    s.cash = 1e6;
    expect(bulkPlan(s, { act: 'upgrade', group: 'all', budget: Infinity })).toMatchObject({ picks: [], why: 'Needs Rank 3, Block Boss' });
    expect(runBulk(s, { act: 'upgrade', group: 'all', budget: Infinity })).toBe(0);
    expect(s.plots[LOTTIES_CORNER].stand!.level).toBe(1);
  });

  it('upgrades every Kiosk you can afford, the busiest first, with one headline and a Ledger line', () => {
    const s = newGame(32);
    s.rank = 5; // The Lemon Shack opens at Rank 5
    const kiosks = streets(s, 'oldtown', 3);
    kiosks.forEach((id, i) => give(s, id, 3, [200, 900, 500][i]));
    const shack = STAND_LEVELS[3].cost;
    s.cash = shack * 2 + 1000; // two of the three
    const order = { act: 'upgrade' as const, group: 'level:3' as const, budget: Infinity };
    const plan = bulkPlan(s, order);
    expect(plan).toMatchObject({ members: 3, cost: shack * 2, why: '' });
    expect(plan.picks.map((p) => p.plot)).toEqual([kiosks[1], kiosks[2]]); // $900 and $500 a day beat $200
    const news = s.news.length;
    expect(runBulk(s, order)).toBe(2);
    expect(levels(s, kiosks)).toEqual([3, 4, 4]);
    expect(s.cash).toBe(1000);
    expect(s.news.slice(news)).toEqual([`Bulk order: 2 stands up a level, $${(shack * 2).toLocaleString('en-US')}.`]); // no makeover line for each
    expect(s.today.auto?.[BULK]).toEqual({ spent: shack * 2, count: 2, amount: 1 });
    expect(helperLines(s.today).find((h) => h.id === BULK)?.line).toBe('1 order, 2 done');
    expect(s.plots[LOTTIES_CORNER].stand!.level).toBe(1); // the Table isn't a Kiosk
  });

  it('keeps to the budget, and says what the cheapest one needs', () => {
    const s = newGame(33);
    s.rank = 5;
    s.cash = 1e6;
    const kiosks = streets(s, 'oldtown', 2);
    kiosks.forEach((id) => give(s, id, 3));
    const shack = STAND_LEVELS[3].cost;
    expect(bulkPlan(s, { act: 'upgrade', group: 'level:3', budget: shack + 5000 }).picks).toHaveLength(1);
    expect(bulkPlan(s, { act: 'upgrade', group: 'level:3', budget: shack - 1 })).toMatchObject({ picks: [], members: 2, why: `Needs $${shack.toLocaleString('en-US')}` });
    s.cash = 100; // the cash is a budget too
    expect(bulkPlan(s, { act: 'upgrade', group: 'level:3', budget: Infinity })).toMatchObject({ picks: [], why: `Needs $${shack.toLocaleString('en-US')}` });
  });

  it('goes cheapest first across a district, and leaves out what the rank has not opened', () => {
    const s = newGame(34);
    s.rank = 3; // a Kiosk can't become a Lemon Shack yet
    s.cash = 20000; // and the order's upgrades don't lift you to Rank 5
    const [a, b, c] = streets(s, 'oldtown', 3);
    give(s, a, 3);
    give(s, b, 2);
    give(s, c, 1);
    const order = { act: 'upgrade' as const, group: 'district:oldtown' as const, budget: STAND_LEVELS[1].cost + 100 };
    expect(bulkPlan(s, order)).toMatchObject({ members: 2, picks: [{ plot: c, cost: STAND_LEVELS[1].cost }] }); // the $400 Wooden Stand first; the $3,500 Kiosk doesn't fit
    runBulk(s, { ...order, budget: Infinity });
    expect(levels(s, [a, b, c])).toEqual([3, 3, 2]);
    expect(bulkPlan(s, { act: 'upgrade', group: 'level:3', budget: Infinity })).toMatchObject({ picks: [], why: 'Needs Rank 5, District Big Shot' });
  });

  it("keeps each action's hours: no upgrades at night, no fences while the stands are open", () => {
    const s = newGame(35);
    s.rank = 3;
    s.cash = 1e6;
    give(s, streets(s, 'oldtown', 1)[0], 1);
    s.phase = 'night';
    expect(bulkPlan(s, { act: 'upgrade', group: 'all', budget: Infinity })).toMatchObject({ picks: [], why: 'Too late tonight: upgrade tomorrow' });
    s.phase = 'open';
    expect(bulkPlan(s, { act: 'fence', group: 'all', budget: Infinity })).toMatchObject({ picks: [], why: 'Build after closing or at Morning Prep' });
    expect(bulkPlan(s, { act: 'upgrade', group: 'all', budget: Infinity }).picks).toHaveLength(2); // upgrades are instant mid-day
    s.phase = 'report';
    expect(bulkPlan(s, { act: 'fence', group: 'all', budget: Infinity }).picks).toHaveLength(2); // the Evening builds
  });

  it('fences every plot without one, the most valuable first, and leaves the fenced plots alone', () => {
    const s = newGame(36);
    s.rank = 4;
    s.cash = 1e6;
    const [a, b, c] = streets(s, 'oldtown', 3);
    give(s, a, 3);
    give(s, b, 2);
    give(s, c, 1);
    s.plots[c].defense.tier = 1; // a Picket Fence already
    s.plots[c].defense.fenceHp = PERIMETERS[0].hp;
    const picket = PERIMETERS[0].cost;
    s.cash = picket * 4 + 50; // Lottie's Corner, a and b take a Picket each; three fit
    expect(bulkMembers(s, 'fence', 'unfenced')).toEqual(expect.arrayContaining([LOTTIES_CORNER, a, b]));
    expect(bulkMembers(s, 'fence', 'unfenced')).not.toContain(c);
    const plan = bulkPlan(s, { act: 'fence', group: 'unfenced', budget: picket * 2 });
    expect(plan.picks.map((p) => p.plot)).toEqual([a, b]); // the Kiosk ($4,050 in it) and the Wooden Stand ($550) beat Lottie's $150 Table
    expect(runBulk(s, { act: 'fence', group: 'unfenced', budget: Infinity })).toBe(3);
    expect([LOTTIES_CORNER, a, b, c].map((id) => s.plots[id].defense.tier)).toEqual([1, 1, 1, 1]);
    expect(s.plots[a].defense.fenceHp).toBe(PERIMETERS[0].hp);
    expect(s.news[s.news.length - 1]).toBe(`Bulk order: 3 new fences, $${picket * 3}.`);
    // Every plot then goes up a fence, the cheapest wall first.
    s.cash = 1e6;
    expect(runBulk(s, { act: 'fence', group: 'all', budget: PERIMETERS[1].cost * 2 })).toBe(2);
    expect(s.today.auto?.[BULK]).toMatchObject({ count: 5, amount: 2 });
    expect(helperLines(s.today).find((h) => h.id === BULK)?.line).toBe('2 orders, 5 done');
  });

  it('lists the groups that hold something: levels and districts you have, and bare plots for fences', () => {
    const s = newGame(37);
    s.rank = 3;
    const [a] = streets(s, 'oldtown', 1);
    give(s, a, 3);
    expect(bulkGroups(s, 'upgrade')).toEqual(['all', 'level:1', 'level:3', 'district:maple', 'district:oldtown']);
    expect(bulkGroups(s, 'fence')).toEqual(['all', 'level:1', 'level:3', 'district:maple', 'district:oldtown', 'unfenced']);
    // A facility takes a fence but no upgrade.
    const [d] = PLOTS.filter((p) => p.type === 'industrial' && !s.plots[p.id].owner).map((p) => p.id);
    s.plots[d] = { ...s.plots[d], owner: 'player', stand: null, facility: { kind: 'bottling', level: 1 }, invested: FACILITIES.bottling.costs[0], defense: NO_DEFENSE() };
    expect(bulkMembers(s, 'fence', 'all')).toContain(d);
    expect(bulkMembers(s, 'upgrade', 'all')).not.toContain(d);
    const none = newGame(38);
    none.plots[LOTTIES_CORNER].stand = null;
    expect(bulkGroups(none, 'upgrade')).toEqual([]);
    expect(bulkPlan({ ...none, rank: 3 }, { act: 'upgrade', group: 'all', budget: 100 }).why).toBe('No stands in this group');
  });
});
