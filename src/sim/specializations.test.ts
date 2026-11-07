import { afterEach, describe, expect, it } from 'vitest';
import {
  approveRebuild, approveRepair, buildingHp, buildingInvested, canFitSpec, ceilingFor, currentHp, dailyService, damageAtDawn, fitSpec, hpShare, LOTTIES_CORNER,
  MARKETING_BLOCKS, marketingMultiplier, marketingTerms, migrateSave, nearbyPlots, netWorth, newGame, newStand, PLOT_BY_ID, plotsAtDawn,
  pourRate, priceCeiling, rebuildCost, repairCost, rivalPrice, specsAt, specSlots, STAND_LEVELS, topPriceMods, type DistrictId, type GameState, type SpecId,
} from './economy.ts';

const blocks: typeof MARKETING_BLOCKS = [];
afterEach(() => {
  for (const f of blocks.splice(0)) MARKETING_BLOCKS.splice(MARKETING_BLOCKS.indexOf(f), 1);
});
/** A Cease-and-Desist on one district, the way the rivals lane registers its letters. */
function ceaseAndDesist(d: DistrictId) {
  const f = (_s: GameState, district: DistrictId) => district === d;
  blocks.push(f);
  MARKETING_BLOCKS.push(f);
}

/** Morning Prep with a stand of yours at this level on the plot (Lottie's Corner unless named), and $100,000 to spend. */
function standAt(level: number, plotId = LOTTIES_CORNER, seed = 61): GameState {
  const s = newGame(seed);
  s.day = 30;
  s.rank = 8;
  s.phase = 'prep';
  s.cash = 100_000;
  s.selected = plotId;
  s.plots[plotId].owner = 'player';
  s.plots[plotId].stand = newStand(level);
  s.plots[plotId].stand!.price = priceCeiling(s, plotId);
  return s;
}
/** Another stand of yours on a plot, the same way. */
function alsoAt(s: GameState, plotId: string, level: number) {
  s.plots[plotId].owner = 'player';
  s.plots[plotId].stand = newStand(level);
  s.plots[plotId].stand!.price = priceCeiling(s, plotId);
  return s.plots[plotId].stand!;
}
const fit = (s: GameState, slot: number, id: SpecId, plotId = LOTTIES_CORNER) => fitSpec(s, plotId, slot, id);

describe('stand specialization slots', () => {
  it('a Kiosk opens one slot for $2,000 and a Citrus Palace a second for $40,000', () => {
    expect([1, 2, 3, 4, 5].map(specSlots)).toEqual([0, 0, 1, 1, 2]);
    expect(canFitSpec(standAt(2), LOTTIES_CORNER, 0, 'express')).toEqual({ ok: false, why: 'Opens at The Kiosk' });
    const s = standAt(3);
    expect(canFitSpec(s, LOTTIES_CORNER, 1, 'express')).toEqual({ ok: false, why: 'Opens at The Citrus Palace' });
    const ps = s.plots[LOTTIES_CORNER];
    const invested = ps.invested, worth = netWorth(s), booked = s.today.books?.invested ?? 0;
    expect(fit(s, 0, 'express')).toBe(true);
    expect(s.cash).toBe(98_000);
    expect(s.today.books!.invested).toBe(booked - 2000); // the Ledger's Invested row
    expect(ps.invested).toBe(invested + 2000); // building value: Net Worth counts 75% of it
    expect(netWorth(s)).toBeCloseTo(worth - 500, 6);
    expect(specsAt(ps)).toEqual(['express']);
    expect(s.news).toContain(`${PLOT_BY_ID[LOTTIES_CORNER].name} gets an Express Window!`);
    const palace = standAt(5);
    palace.cash = 50_000;
    expect(fit(palace, 1, 'fancy')).toBe(true); // the second slot can go first
    expect(palace.cash).toBe(10_000);
    palace.cash = 1500;
    expect(canFitSpec(palace, LOTTIES_CORNER, 0, 'express')).toEqual({ ok: false, why: 'Needs $2,000' });
    expect(specsAt(palace.plots[LOTTIES_CORNER])).toEqual(['fancy']);
  });

  it("each slot holds one, one specialization can't fill both, and a swap costs the slot's price again", () => {
    const s = standAt(5);
    const ps = s.plots[LOTTIES_CORNER];
    expect(fit(s, 0, 'express')).toBe(true);
    expect(canFitSpec(s, LOTTIES_CORNER, 0, 'express')).toEqual({ ok: false, why: 'Fitted' });
    expect(canFitSpec(s, LOTTIES_CORNER, 1, 'express')).toEqual({ ok: false, why: 'In slot 1' });
    expect(fit(s, 1, 'roof')).toBe(true);
    expect(specsAt(ps)).toEqual(['express', 'roof']);
    const cash = s.cash, invested = ps.invested, worth = netWorth(s);
    expect(fit(s, 0, 'fortified')).toBe(true); // a swap
    expect(s.cash).toBe(cash - 2000);
    expect(ps.invested).toBe(invested); // it replaces the Express Window: no new building value
    expect(netWorth(s)).toBeCloseTo(worth - 2000, 6);
    expect(specsAt(ps)).toEqual(['fortified', 'roof']);
    expect(s.news.at(-1)).toBe(`${PLOT_BY_ID[LOTTIES_CORNER].name} swaps its Express Window for a Fortified Frame.`);
    expect(fit(s, 1, 'express')).toBe(true); // the Express Window again, now in slot 2
    expect(s.cash).toBe(cash - 42_000);
  });

  it('are fitted at Morning Prep, on a standing stand of yours', () => {
    const s = standAt(3);
    const ps = s.plots[LOTTIES_CORNER];
    s.phase = 'open';
    expect(canFitSpec(s, LOTTIES_CORNER, 0, 'fancy')).toEqual({ ok: false, why: 'Fit during Morning Prep' });
    expect(fit(s, 0, 'fancy')).toBe(false);
    s.phase = 'prep';
    ps.stand!.wrecked = true;
    expect(canFitSpec(s, LOTTIES_CORNER, 0, 'fancy')).toEqual({ ok: false, why: 'Rebuild it first' });
    ps.busted = true;
    expect(canFitSpec(s, LOTTIES_CORNER, 0, 'fancy')).toEqual({ ok: false, why: 'Fix it first' });
    ps.stand!.wrecked = false;
    delete ps.busted;
    ps.owner = 'hollis';
    expect(canFitSpec(s, LOTTIES_CORNER, 0, 'fancy')).toEqual({ ok: false, why: 'Not your stand' });
    expect(canFitSpec(s, 'maple-5s', 0, 'fancy')).toEqual({ ok: false, why: 'Not your stand' }); // no stand there
    ps.owner = 'player';
    s.cash = 1999;
    expect(canFitSpec(s, LOTTIES_CORNER, 0, 'fancy')).toEqual({ ok: false, why: 'Needs $2,000' });
    expect(canFitSpec(s, LOTTIES_CORNER, 2, 'fancy')).toEqual({ ok: false, why: 'No such slot' });
  });

  it("stay with the stand: a rebuild keeps them, a plot that goes For Sale loses them, and they work only while it's yours", () => {
    const plot = 'maple-3s';
    const s = standAt(3, plot);
    const ps = s.plots[plot];
    expect(fit(s, 0, 'fortified', plot)).toBe(true);
    ps.stand!.wrecked = true;
    ps.wreckedDay = s.day;
    s.phase = 'report';
    expect(approveRebuild(s, plot)).toBe(true);
    expect(ps.repair).toMatchObject({ rebuild: true, hp: 1200 }); // it comes back up Fortified
    damageAtDawn(s);
    expect(ps.stand!.wrecked).toBe(false);
    expect(specsAt(ps)).toEqual(['fortified']);
    expect(currentHp(ps)).toBe(1200);
    // Passed to a rival (a sale, a takeover), the stand keeps its fittings idle; back with you, they work again.
    ps.owner = 'hollis';
    expect(specsAt(ps)).toEqual([]);
    expect(buildingHp(ps)).toBe(800);
    ps.owner = 'player';
    expect(buildingHp(ps)).toBe(1200);
    // Smashed and never rebuilt: the plot goes For Sale with nothing on it.
    ps.stand!.wrecked = true;
    ps.wreckedDay = s.day - 2;
    plotsAtDawn(s, { seed: s.seed });
    expect(s.plots[plot].owner).not.toBe('player');
    expect(s.plots[plot].stand).toBeNull();
  });

  it("are part of the building: a Wrecked or Damaged stand's rebuild and repair count what its slots cost", () => {
    const plot = 'maple-3s';
    const s = standAt(3, plot);
    const ps = s.plots[plot];
    expect(buildingInvested(ps)).toBe(4050); // a Kiosk built on an empty plot: $150 + $400 + $3,500
    expect(rebuildCost(ps)).toBe(608);
    expect(fit(s, 0, 'fortified', plot)).toBe(true);
    expect(buildingInvested(ps)).toBe(6050); // plus the slot's $2,000
    ps.stand!.hp = 600; // half of the Fortified Kiosk's 1,200
    expect(repairCost(s, plot)).toBe(454); // 15% of $6,050 × half
    expect(rebuildCost(ps)).toBe(908); // 15% of $6,050
    expect(fit(s, 0, 'express', plot)).toBe(true); // a swap replaces what was there
    expect(buildingInvested(ps)).toBe(6050);
    const palace = standAt(5, plot);
    const both = palace.plots[plot];
    const levels = buildingInvested(both);
    fit(palace, 0, 'fancy', plot);
    fit(palace, 1, 'roof', plot);
    expect(buildingInvested(both)).toBe(levels + 42_000);
    both.stand!.wrecked = true;
    expect(rebuildCost(both)).toBe(Math.ceil((levels + 42_000) * 0.15));
  });

  it('saves keep the slots; a save from before them loads with empty slots, and odd entries are dropped', () => {
    const s = standAt(5);
    fit(s, 0, 'express');
    fit(s, 1, 'fancy');
    expect(migrateSave(JSON.parse(JSON.stringify(s)))!.plots[LOTTIES_CORNER].stand!.specs).toEqual(['express', 'fancy']);
    const old = JSON.parse(JSON.stringify(s));
    delete old.plots[LOTTIES_CORNER].stand.specs;
    const m = migrateSave(old)!;
    expect(m.plots[LOTTIES_CORNER].stand!.specs).toBeUndefined();
    expect(specsAt(m.plots[LOTTIES_CORNER])).toEqual([]);
    const odd = JSON.parse(JSON.stringify(s));
    odd.plots[LOTTIES_CORNER].stand.specs = ['laser', 'roof', 'fancy'];
    expect(migrateSave(odd)!.plots[LOTTIES_CORNER].stand!.specs).toEqual([null, 'roof']);
  });
});

describe('the Express Window and the Fancy Menu', () => {
  it('Express Window: ×1.3 cups an hour (L3 156, L4 390, L5 910), times the HP share of a Damaged stand', () => {
    for (const [level, cups] of [[3, 156], [4, 390], [5, 910]]) {
      const s = standAt(level);
      expect(pourRate(s, LOTTIES_CORNER)).toBe(STAND_LEVELS[level - 1].capacityPerHour);
      fit(s, 0, 'express');
      expect(pourRate(s, LOTTIES_CORNER)).toBe(cups);
      expect(dailyService(s, LOTTIES_CORNER)).toBe(cups * 10); // the most it sells in a day, and the line moves at it
    }
    const s = standAt(3);
    fit(s, 0, 'express');
    s.plots[LOTTIES_CORNER].stand!.hp = 480; // 60% HP
    expect(pourRate(s, LOTTIES_CORNER)).toBe(Math.floor(156 * 0.6)); // 93 cups an hour
  });

  it('Fancy Menu: ×1.2 top price, then the district and the card as usual; Auto-Price follows it', () => {
    const s = standAt(3);
    const st = s.plots[LOTTIES_CORNER].stand!;
    st.autoPrice = true;
    const before = priceCeiling(s, LOTTIES_CORNER);
    expect(fit(s, 0, 'fancy')).toBe(true);
    expect(topPriceMods(s, LOTTIES_CORNER)).toBeCloseTo(1.2, 9);
    expect(priceCeiling(s, LOTTIES_CORNER)).toBe(ceilingFor(3, 'maple', st.recipe, 1.2));
    expect(priceCeiling(s, LOTTIES_CORNER)).toBeGreaterThan(before);
    expect(st.price).toBe(priceCeiling(s, LOTTIES_CORNER)); // Auto-Price reposts at the new ceiling
    // The L5's $7.00 top becomes $8.40 before the district: Hilltop's Citrus Palace.
    const h = standAt(5, 'hilltop-1s');
    const hst = h.plots['hilltop-1s'].stand!;
    const plain = ceilingFor(5, 'hilltop', hst.recipe);
    fit(h, 0, 'fancy', 'hilltop-1s');
    expect(priceCeiling(h, 'hilltop-1s')).toBe(ceilingFor(5, 'hilltop', hst.recipe, 1.2));
    expect(priceCeiling(h, 'hilltop-1s')).toBeCloseTo(plain * 1.2, 1);
    h.plots['hilltop-1s'].owner = 'fizzco'; // a rival's stand takes none
    expect(topPriceMods(h, 'hilltop-1s')).toBe(1);
  });
});

describe('the Fortified Frame', () => {
  it('+50% max HP: L3 800 to 1,200, L4 2,000 to 3,000, L5 5,000 to 7,500', () => {
    for (const [level, hp] of [[3, 1200], [4, 3000], [5, 7500]]) {
      const s = standAt(level);
      const ps = s.plots[LOTTIES_CORNER];
      expect(buildingHp(ps)).toBe(STAND_LEVELS[level - 1].hp);
      fit(s, 0, 'fortified');
      expect(buildingHp(ps)).toBe(hp);
      expect(currentHp(ps)).toBe(hp); // a stand at full HP stays full
    }
  });

  it('fitted or swapped out, it keeps the HP share, and a repair booked tonight still ends at full', () => {
    const s = standAt(3);
    const ps = s.plots[LOTTIES_CORNER];
    ps.stand!.hp = 400;
    fit(s, 0, 'fortified');
    expect(currentHp(ps)).toBe(600);
    expect(hpShare(ps)).toBeCloseTo(0.5, 9);
    fit(s, 0, 'express'); // swapped out
    expect(currentHp(ps)).toBe(400);
    expect(buildingHp(ps)).toBe(800);
    ps.stand!.hp = 301;
    expect(approveRepair(s, LOTTIES_CORNER)).toBe(true);
    expect(ps.repair!.hp).toBe(499);
    const cost = ps.repair!.cost;
    fit(s, 0, 'fortified');
    expect(currentHp(ps)).toBe(452);
    expect(ps.repair).toMatchObject({ hp: 748, cost }); // the same bill, for the bigger frame's points
    damageAtDawn(s);
    expect(currentHp(ps)).toBe(1200);
    expect(ps.stand!.hp).toBeUndefined();
  });
});

describe('the Billboard Roof', () => {
  const roof = (s: GameState, plotId: string) => marketingTerms(s, s.plots[plotId].owner!, s.plots[plotId].stand!, plotId).find((t) => t.id === 'roof');

  it('adds +15% traffic at each of your stands within 2 plots, its own included, and Roofs add up', () => {
    const near = (id: string) => nearbyPlots(PLOT_BY_ID[id]).map((p) => p.id);
    expect(near(LOTTIES_CORNER)).toContain('maple-3s');
    expect(near('maple-3s')).toContain('maple-5s');
    expect(near(LOTTIES_CORNER)).not.toContain('maple-5s');
    const s = standAt(3);
    alsoAt(s, 'maple-3s', 3);
    alsoAt(s, 'maple-5s', 1);
    expect(fit(s, 0, 'roof')).toBe(true);
    expect(roof(s, LOTTIES_CORNER)).toEqual({ id: 'roof', label: 'Billboard Roof', traffic: 0.15, blocked: false });
    expect(roof(s, 'maple-3s')?.traffic).toBe(0.15);
    expect(roof(s, 'maple-5s')).toBeUndefined(); // 3 plots away
    const before = marketingMultiplier(s, 'player', s.plots['maple-3s'].stand!, 'maple-3s');
    expect(fit(s, 0, 'roof', 'maple-3s')).toBe(true);
    expect(roof(s, 'maple-3s')).toEqual({ id: 'roof', label: '2 Billboard Roofs', traffic: 0.3, blocked: false });
    expect(marketingMultiplier(s, 'player', s.plots['maple-3s'].stand!, 'maple-3s')).toBeCloseTo(before + 0.15, 9); // added, never multiplied
    expect(roof(s, 'maple-5s')?.traffic).toBe(0.15);
  });

  it("counts nothing from a Wrecked roof; rival stands get nothing; a Cease-and-Desist blocks it", () => {
    const s = standAt(3);
    alsoAt(s, 'maple-3s', 1);
    fit(s, 0, 'roof');
    s.plots['maple-2n'].owner = 'hollis';
    s.plots['maple-2n'].stand = newStand(2, rivalPrice('hollis', 2, PLOT_BY_ID['maple-2n']));
    expect(nearbyPlots(PLOT_BY_ID['maple-2n']).map((p) => p.id)).toContain(LOTTIES_CORNER);
    expect(roof(s, 'maple-2n')).toBeUndefined();
    ceaseAndDesist('maple');
    expect(roof(s, 'maple-3s')).toMatchObject({ traffic: 0.15, blocked: true });
    blocks.splice(0).forEach((f) => MARKETING_BLOCKS.splice(MARKETING_BLOCKS.indexOf(f), 1));
    s.plots[LOTTIES_CORNER].stand!.wrecked = true;
    expect(roof(s, 'maple-3s')).toBeUndefined();
  });
});
