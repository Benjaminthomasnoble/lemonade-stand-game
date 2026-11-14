import { describe, expect, it } from 'vitest';
import {
  BULK, bulkGroups, bulkMembers, bulkPlan, FACILITIES, helperLines, LOTTIES_CORNER, newGame, newStand, NO_DEFENSE, PERIMETERS, PLOTS, runBulk,
  STAND_LEVELS, standCost, type DistrictId, type GameState,
  canSetPolicy, districtPolicy, landAtDawn, migrateSave, plotPrice, policiesAtDawn, POLICIES, POLICY, priceCeiling, setPolicy, togglePolicyPlot,
} from './economy.ts';
import { defendPriority } from './autodefend.ts';
import { AUTO_RESTOCK } from './automation.ts';

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

describe('district policies (Rank 7)', () => {
  /** Rank 7 with cash to spend and three Old Town stands: a Kiosk, a Wooden Stand and a Table. */
  function tycoon(seed: number) {
    const s = newGame(seed);
    s.rank = 7;
    s.cash = 2e6;
    const ids = streets(s, 'oldtown', 3);
    give(s, ids[0], 3, 800);
    give(s, ids[1], 2, 300);
    give(s, ids[2], 1, 100);
    return { s, ids };
  }
  /** The next dawn's run, without playing the day (a new day's record for the helpers). */
  const nextDawn = (s: GameState) => { s.day++; delete s.today.auto; policiesAtDawn(s); };

  it('waits for Rank 7, Lemon Tycoon, and takes one policy per district', () => {
    const { s } = tycoon(41);
    s.rank = 6;
    expect(canSetPolicy(s)).toEqual({ ok: false, why: 'Needs Rank 7, Lemon Tycoon' });
    expect(setPolicy(s, 'oldtown', 'profit')).toBe(false);
    s.rank = 7;
    s.phase = 'report'; // set in the Evening: it waits for the dawn
    expect(setPolicy(s, 'oldtown', 'profit')).toBe(true);
    expect(setPolicy(s, 'oldtown', 'fortify')).toBe(true); // the new one replaces it
    expect(s.policies).toEqual({ oldtown: { kind: 'fortify', budget: POLICY.budget } });
    expect(setPolicy(s, 'oldtown', null)).toBe(true);
    expect(districtPolicy(s, 'oldtown')).toBeNull();
  });

  it('Profit puts every stand there on Auto-Price and Auto-Restock, except a plot that opts out', () => {
    const { s, ids } = tycoon(42);
    for (const id of ids) {
      const st = s.plots[id].stand!;
      st.autoPrice = false;
      st.ownCard = true;
      st.autoRestock = false;
      st.stockTarget = 50;
    }
    togglePolicyPlot(s, ids[2]); // this one stays as you set it
    s.phase = 'report';
    setPolicy(s, 'oldtown', 'profit');
    const news = s.news.length;
    nextDawn(s);
    for (const id of ids.slice(0, 2)) expect(s.plots[id].stand).toMatchObject({ autoPrice: true, autoRestock: true, stockTarget: null });
    expect(s.plots[ids[0]].stand!.ownCard).toBeUndefined();
    expect(s.plots[ids[2]].stand).toMatchObject({ autoPrice: false, ownCard: true, autoRestock: false, stockTarget: 50 });
    expect(s.news.slice(news)).toEqual(['Old Town, Profit: 2 stands on Auto-Price and Auto-Restock.']);
    expect(helperLines(s.today).find((h) => h.id === POLICIES)?.line).toBe('1 district, 2 plots');
    nextDawn(s); // nothing new to take: no headline
    expect(s.news.slice(news)).toHaveLength(1);
  });

  it('Fortify turns Auto-Repair and Dex on there and puts up fences within its daily budget', () => {
    const { s, ids } = tycoon(43);
    s.plots[ids[0]].noAutoRepair = true;
    togglePolicyPlot(s, ids[2]);
    s.phase = 'report';
    const picket = PERIMETERS[0].cost, chain = PERIMETERS[1].cost;
    setPolicy(s, 'oldtown', 'fortify', picket * 2);
    const cash = s.cash;
    nextDawn(s);
    expect(ids.map((id) => s.plots[id].defense.tier)).toEqual([1, 1, 0]);
    expect(s.plots[ids[0]].noAutoRepair).toBeUndefined();
    expect(ids.map((id) => defendPriority(s, id))).toEqual([POLICY.priority, POLICY.priority, 0]);
    expect(s.cash).toBe(cash - picket * 2);
    expect(s.news[s.news.length - 1]).toBe(`Old Town, Fortify: 2 new fences, $${picket * 2}.`);
    expect(s.plots[LOTTIES_CORNER].defense.tier).toBe(0); // Maple Row has no policy
    nextDawn(s); // the budget can't reach a Chain-Link
    expect(ids.map((id) => s.plots[id].defense.tier)).toEqual([1, 1, 0]);
    setPolicy(s, 'oldtown', 'fortify', chain); // one a day, the most valuable plot first
    nextDawn(s);
    expect(ids.map((id) => s.plots[id].defense.tier)).toEqual([2, 1, 0]);
    expect(s.today.auto?.[POLICIES]).toMatchObject({ count: 2, amount: 1, spent: chain });
  });

  it('Expand builds on your empty plots, buys open land and upgrades, cheapest first within its budget', () => {
    const { s, ids } = tycoon(44);
    const empty = streets(s, 'oldtown', 1)[0];
    s.plots[empty] = { ...s.plots[empty], owner: 'player', stand: null, invested: 0, defense: NO_DEFENSE() };
    const open = PLOTS.filter((p) => p.district === 'oldtown' && p.type === 'street' && !s.plots[p.id].owner)
      .reduce((a, p) => (plotPrice(s, p.id) < plotPrice(s, a.id) ? p : a)).id;
    const table = standCost(1), wooden = STAND_LEVELS[1].cost, kiosk = STAND_LEVELS[2].cost;
    // A Table on the empty plot ($150), the Table up to Wooden ($400), the Wooden Stand up to a Kiosk ($3,500), then the
    // cheapest land with a Table; the Kiosk's $60,000 Lemon Shack is dearer than all of them and doesn't fit.
    const budget = table + wooden + kiosk + plotPrice(s, open) + table;
    s.phase = 'report';
    setPolicy(s, 'oldtown', 'expand', budget);
    const cash = s.cash, picked = s.selected, news = s.news.length;
    nextDawn(s);
    expect(s.plots[empty].stand?.level).toBe(1);
    expect(s.plots[open]).toMatchObject({ owner: 'player', stand: { level: 1 } });
    expect(levels(s, ids)).toEqual([3, 3, 2]);
    expect(s.cash).toBe(cash - budget);
    expect(s.selected).toBe(picked); // the stand you manage stays picked
    expect(s.news.slice(news).filter((l) => /Expand/.test(l))).toEqual([`Old Town, Expand: 2 new stands and 2 upgrades, $${budget.toLocaleString('en-US')}.`]);
    expect(s.news.slice(news).some((l) => /Congratulations|brand-new/.test(l))).toBe(false); // one headline, not one a purchase
  });

  it('goes to work at once when set at Morning Prep, once a day, and with the dawn through land', () => {
    const { s, ids } = tycoon(45);
    const st = s.plots[ids[1]].stand!;
    st.autoPrice = false;
    st.price = 0.5;
    s.phase = 'prep';
    setPolicy(s, 'oldtown', 'profit');
    expect(st.price).toBe(priceCeiling(s, ids[1])); // Marisol priced it now
    expect(districtPolicy(s, 'oldtown')?.ran).toBe(s.day);
    st.autoPrice = false;
    setPolicy(s, 'oldtown', 'profit', 1000); // a new budget the same day: no second run
    expect(st.autoPrice).toBe(false);
    s.day++;
    landAtDawn(s); // land's dawn hook runs the policies
    expect(st.autoPrice).toBe(true);
    expect(districtPolicy(s, 'oldtown')?.ran).toBe(s.day);
  });

  it("set at Morning Prep, Profit's restock is on Auto-Restock's line once: the helpers' rows add up to the cash spent", () => {
    const { s, ids } = tycoon(46);
    s.day = 20; // the Market and Auto-Restock are open
    for (const id of ids) {
      const st = s.plots[id].stand!;
      st.autoRestock = false;
      st.stockTarget = 50;
      st.inventory.lemons = [];
      st.inventory.sugar = 0;
      st.inventory.ice = 0;
      st.pitcherCups = 0;
    }
    s.phase = 'prep';
    delete s.today.auto;
    const cash = s.cash;
    setPolicy(s, 'oldtown', 'profit');
    const spent = Math.round((cash - s.cash) * 100) / 100;
    expect(spent).toBeGreaterThan(0); // Auto-Restock stocked the three stands at once
    const rows = helperLines(s.today);
    expect(rows.find((h) => h.id === AUTO_RESTOCK)?.spent).toBe(spent);
    expect(rows.find((h) => h.id === POLICIES)?.spent).toBe(0);
    expect(Math.round(rows.reduce((a, h) => a + h.spent, 0) * 100) / 100).toBe(spent);
  });

  it('keeps a saved policy and drops what an older or edited save got wrong', () => {
    const { s, ids } = tycoon(46);
    (s as unknown as { policies: unknown }).policies = {
      oldtown: { kind: 'fortify', budget: -5 }, nowhere: { kind: 'profit', budget: 1 }, campus: { kind: 'chaos', budget: 1 }, downtown: { kind: 'expand', budget: 9000, ran: 'x' },
    };
    (s.plots[ids[0]] as unknown as { noPolicy: unknown }).noPolicy = 'yes';
    s.plots[ids[1]].noPolicy = true;
    const back = migrateSave(JSON.parse(JSON.stringify(s)))!;
    expect(back.policies).toEqual({ oldtown: { kind: 'fortify', budget: POLICY.budget }, downtown: { kind: 'expand', budget: 9000 } });
    expect('noPolicy' in back.plots[ids[0]]).toBe(false);
    expect(back.plots[ids[1]].noPolicy).toBe(true);
    expect(migrateSave(JSON.parse(JSON.stringify(back)))!.policies).toEqual(back.policies); // idempotent
  });
});
