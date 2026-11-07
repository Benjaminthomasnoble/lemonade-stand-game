import { afterEach, describe, expect, it } from 'vitest';
import {
  adsBlocked, appealFor, BRAND_TIERS, CAMPAIGNS, canRunCampaign, couponCut, cupsInStock, demandChain, EVENT_TRAFFIC, eventsOf, expectedDemand,
  expectedPassersby, LOTTIES_CORNER, MARKETING_BLOCKS, MARKETING_TERMS, marketingMultiplier, marketingTerms, migrateSave, nearbyPlots, newGame, newStand,
  openStands, PERKS, PLOT_BY_ID, PLOTS, priceCeiling, RANKS, rivalPrice, runCampaign, salePrice, segmentPriceFit, simulateRestOfDay, sleepUntilDawn,
  TASTE_OFF, tickMinute, type DistrictId, type GameState, type MarketingSource, type RivalId, type SimEvent, type Stand,
} from './economy.ts';

/** A player stand on plotId (the plot changes hands for the test). */
function standOn(s: GameState, plotId: string, level = 1) {
  s.plots[plotId].owner = 'player';
  s.plots[plotId].stand = newStand(level);
  s.plots[plotId].stand!.price = priceCeiling(s, plotId);
  return s.plots[plotId].stand!;
}

/** Plenty of everything, so stock never binds. */
function stockUp(st: Stand) {
  st.inventory.lemons = [{ qty: 2000, day: 1, unitCost: 0.1 }];
  st.inventory.sugar = 8000;
  st.inventory.ice = 20000;
}

/** Every purchasable plot in the district (civic and HQ plots don't count) goes to the player. */
function fullControl(s: GameState, d: DistrictId) {
  for (const p of PLOTS) if (p.district === d && p.type !== 'civic' && p.type !== 'hq') s.plots[p.id].owner = 'player';
}

/** Morning Prep to the next dawn: a business day in fixed weather, then the night. */
function playDay(s: GameState): SimEvent[] {
  s.forecast = { kind: 'hot', temp: 90 };
  openStands(s);
  s.weather = { kind: 'hot', temp: 90 };
  const ev = simulateRestOfDay(s);
  s.raids = [];
  sleepUntilDawn(s);
  return ev;
}

const added: MarketingSource[] = [];
const blocks: typeof MARKETING_BLOCKS = [];
afterEach(() => {
  for (const f of added.splice(0)) MARKETING_TERMS.splice(MARKETING_TERMS.indexOf(f), 1);
  for (const f of blocks.splice(0)) MARKETING_BLOCKS.splice(MARKETING_BLOCKS.indexOf(f), 1);
});
/** A Cease-and-Desist on one district, the way the rivals lane registers its letters. */
function ceaseAndDesist(d: DistrictId) {
  const f = (_s: GameState, district: DistrictId) => district === d;
  blocks.push(f);
  MARKETING_BLOCKS.push(f);
}

describe('the marketing number', () => {
  it('adds every traffic bonus at a stand into one number: an Old Town Kiosk with the Radio Jingle and Sunny walks 700 × 2.3 × 1.47', () => {
    const s = newGame(51);
    s.rank = 4;
    s.brandTier = 3; // the Radio Jingle, +22%
    s.cash = 1000;
    const plot = 'oldtown-2n';
    const st = standOn(s, plot, 3);
    expect(runCampaign(s, 'sunny', plot)).toBe(true); // Sunny the Lemon walks Old Town today: +25%
    expect(marketingTerms(s, 'player', st, plot)).toEqual([
      { id: 'brand', label: BRAND_TIERS[2].name, traffic: 0.22, blocked: false },
      { id: 'sunny', label: 'Sunny the Lemon', traffic: 0.25, blocked: false },
    ]);
    const c = demandChain(s, plot)!;
    expect(c.marketing).toBeCloseTo(1.47, 9);
    expect(Math.round(700 * c.draw * c.marketing)).toBe(2367); // the spec's 700-passerby street
    expect(expectedPassersby(s, plot)).toBeCloseTo(c.traffic * 2.3 * 1.47 * c.season * c.weather, 6);
    expect(marketingMultiplier(s, 'player', s.plots[LOTTIES_CORNER].stand!, LOTTIES_CORNER)).toBeCloseTo(1.22, 9); // Sunny walks Old Town only
  });

  it('lists the brand tier, Groves, a Taste-Off win, perks and campaigns, and they add up to the number', () => {
    const s = newGame(52);
    s.rank = 3;
    s.brandTier = 1;
    const st = s.plots[LOTTIES_CORNER].stand!;
    st.campaigns.sandwichBoard = 1;
    for (const p of PLOTS) if (p.district === 'oldtown' && p.type !== 'civic' && p.type !== 'hq') s.plots[p.id].owner = 'player'; // Town Favorite
    s.world!.boosts.push({ owner: 'player', district: 'maple', from: s.day, to: s.day + 6 }); // a Taste-Off won for Maple Row
    const terms = marketingTerms(s, 'player', st, LOTTIES_CORNER);
    expect(terms.map((t) => [t.id, t.traffic])).toEqual([
      ['brand', BRAND_TIERS[0].traffic], ['calendar', TASTE_OFF.traffic], ['townFavorite', PERKS.townFavorite], ['sandwichBoard', CAMPAIGNS.sandwichBoard.traffic],
    ]);
    expect(terms.find((t) => t.id === 'calendar')!.label).toBe('Taste-Off win');
    const sum = 1 + terms.reduce((a, t) => a + t.traffic, 0);
    expect(marketingMultiplier(s, 'player', st, LOTTIES_CORNER)).toBeCloseTo(sum, 9);
    expect(sum).toBeCloseTo(1 + 0.05 + 0.2 + 0.1 + 0.2, 9); // added, never multiplied
    const c = demandChain(s, LOTTIES_CORNER)!;
    expect(c.terms).toEqual(terms); // the stand panel's breakdown
    expect(c.marketing).toBeCloseTo(sum, 9);
  });

  it('a Cease-and-Desist zeroes your brand tier and campaigns in its district only, and no campaign starts there', () => {
    const s = newGame(53);
    s.rank = 3;
    s.brandTier = 2;
    const corner = s.plots[LOTTIES_CORNER].stand!;
    corner.campaigns.sandwichBoard = 1;
    const away = 'oldtown-2n';
    standOn(s, away);
    ceaseAndDesist('maple');
    expect(adsBlocked(s, 'player', LOTTIES_CORNER)).toBe(true);
    expect(adsBlocked(s, 'player', away)).toBe(false);
    expect(marketingTerms(s, 'player', corner, LOTTIES_CORNER).map((t) => [t.id, t.blocked])).toEqual([['brand', true], ['sandwichBoard', true]]);
    expect(marketingMultiplier(s, 'player', corner, LOTTIES_CORNER)).toBe(1);
    expect(marketingMultiplier(s, 'player', s.plots[away].stand!, away)).toBeCloseTo(1 + BRAND_TIERS[1].traffic, 9);
    expect(canRunCampaign(s, 'freeSamples', LOTTIES_CORNER)).toEqual({ ok: false, why: 'Cease-and-Desist: ads count for nothing here' });
    expect(canRunCampaign(s, 'sandwichBoard', away).ok).toBe(true);
    expect(adsBlocked(s, 'blenders', LOTTIES_CORNER)).toBe(false); // the letter is FizzCo's to you
  });

  it('surges multiply on top: a Viral Video doubles the stand\'s walkers, marketing and all', () => {
    const s = newGame(54);
    s.brandTier = 1;
    const before = expectedPassersby(s, LOTTIES_CORNER);
    eventsOf(s).on.push({ id: 'viralVideo', from: s.day, to: s.day + 1, live: true, plots: [LOTTIES_CORNER], district: 'maple' });
    const c = demandChain(s, LOTTIES_CORNER)!;
    expect(c.surge).toBe(EVENT_TRAFFIC.viralVideo);
    expect(c.surges).toEqual([{ label: 'Viral Video', mult: EVENT_TRAFFIC.viralVideo }]);
    expect(c.marketing).toBeCloseTo(1.05, 9); // not a marketing term
    expect(expectedPassersby(s, LOTTIES_CORNER)).toBeCloseTo(before * EVENT_TRAFFIC.viralVideo, 6);
    expect(c.passersby).toBe(Math.round(c.traffic * c.draw * c.marketing * c.season * c.weather * c.surge * c.lunch));
  });
});

describe('local campaigns', () => {
  it('Sunny the Lemon walks one district a day: +25% at every stand of yours there for $300, renewed day by day', () => {
    const s = newGame(61);
    s.rank = 3;
    s.cash = 2000;
    const a = 'oldtown-2n', b = 'oldtown-7s'; // two stands in Old Town, far apart
    standOn(s, a);
    standOn(s, b);
    const m = (id: string) => marketingMultiplier(s, 'player', s.plots[id].stand!, id);
    const before = [m(a), m(b), m(LOTTIES_CORNER)];
    expect(runCampaign(s, 'sunny', a)).toBe(true);
    expect(s.cash).toBe(1700);
    expect(m(a)).toBeCloseTo(before[0] + 0.25, 9);
    expect(m(b)).toBeCloseTo(before[1] + 0.25, 9);
    expect(m(LOTTIES_CORNER)).toBeCloseTo(before[2], 9); // Maple Row sees no mascot
    expect(marketingTerms(s, 'player', s.plots[b].stand!, b).find((t) => t.id === 'sunny')).toEqual({ id: 'sunny', label: 'Sunny the Lemon', traffic: 0.25, blocked: false });
    expect(canRunCampaign(s, 'sunny', LOTTIES_CORNER)).toEqual({ ok: false, why: 'Sunny walks Old Town today' }); // there's only one Sunny
    expect(canRunCampaign(s, 'sunny', b)).toEqual({ ok: false, why: 'Running today' });
    s.day++; // tomorrow the walk is over, and Sunny can go anywhere again
    expect(m(a)).toBeCloseTo(before[0], 9);
    expect(canRunCampaign(s, 'sunny', LOTTIES_CORNER).ok).toBe(true);
    s.rank = 2;
    expect(canRunCampaign(s, 'sunny', a)).toEqual({ ok: false, why: `Needs Rank 3, ${RANKS[2].title}` });
    s.rank = 3;
    fullControl(s, 'campus'); // Word of Mouth: half price
    const cash = s.cash;
    expect(runCampaign(s, 'sunny', a)).toBe(true);
    expect(s.cash).toBe(cash - 150);
  });

  it('Sunny counts for nothing under a Cease-and-Desist, and never starts there', () => {
    const s = newGame(62);
    s.rank = 3;
    s.cash = 1000;
    const a = 'oldtown-2n';
    standOn(s, a);
    expect(runCampaign(s, 'sunny', a)).toBe(true);
    ceaseAndDesist('oldtown');
    expect(marketingTerms(s, 'player', s.plots[a].stand!, a).find((t) => t.id === 'sunny')!.blocked).toBe(true);
    s.day++;
    expect(canRunCampaign(s, 'sunny', a)).toEqual({ ok: false, why: 'Cease-and-Desist: ads count for nothing here' });
  });

  it('a Coupon Blitz sells at 75% of the price in one district for a day, at ×1.4 appeal in place of what the cut would win', () => {
    const s = newGame(63);
    s.rank = 4;
    const plot = 'oldtown-2n';
    const st = standOn(s, plot);
    stockUp(st);
    for (const q of nearbyPlots(PLOT_BY_ID[plot])) if (q.id !== plot) s.plots[q.id].stand = null; // a quiet block
    const before = appealFor(s, plot, 'families', s.forecast);
    expect(before.priceFit).toBe(1); // at the ceiling
    const cash = s.cash;
    expect(runCampaign(s, 'couponBlitz', plot)).toBe(true);
    expect(s.cash).toBe(cash); // the cut is its cost
    expect(couponCut(s, plot)).toBe(0.25);
    expect(salePrice(s, plot)).toBe(Math.round(st.price * 0.75 * 100) / 100);
    expect(st.price).toBe(priceCeiling(s, plot)); // the price tag stays put
    const a = appealFor(s, plot, 'families', s.forecast);
    expect(a.priceFit).toBeCloseTo(1.4, 9);
    expect(segmentPriceFit(plot, 'families', salePrice(s, plot), a.ceiling)).toBeCloseTo(1.25, 2); // what the cut alone would win
    expect(a.stopChance).toBeCloseTo(before.stopChance * 1.4, 9);
    expect(couponCut(s, LOTTIES_CORNER)).toBe(0); // Maple Row pays full price
    expect(canRunCampaign(s, 'couponBlitz', plot)).toEqual({ ok: false, why: 'Running today' });
    expect(canRunCampaign(s, 'couponBlitz', LOTTIES_CORNER).ok).toBe(true); // another district may blitz the same day
    const coupon = salePrice(s, plot);
    const sales = playDay(s).filter((e): e is Extract<SimEvent, { type: 'passerby' }> => e.type === 'passerby' && e.at === plot && e.buys);
    expect(sales.length).toBeGreaterThan(0);
    for (const e of sales) expect(e.price).toBe(coupon);
    expect(couponCut(s, plot)).toBe(0); // one day only
  });

  it('a blitzed stand takes the split from a rival stand nearby by its ×1.4 appeal', () => {
    const s = newGame(64);
    s.rank = 4;
    const plot = 'oldtown-2n', next = 'oldtown-3s';
    for (const q of nearbyPlots(PLOT_BY_ID[plot])) { s.plots[q.id].stand = null; s.plots[q.id].owner = null; }
    stockUp(standOn(s, plot));
    stockUp(standOn(s, 'oldtown-2s'));
    const rival: RivalId = 'fizzco';
    s.plots[next].owner = rival;
    s.plots[next].stand = newStand(1, rivalPrice(rival, 1, PLOT_BY_ID[next]));
    const keptBefore = expectedDemand(s, plot).kept;
    const theirsBefore = expectedDemand(s, next).visitors;
    expect(runCampaign(s, 'couponBlitz', plot)).toBe(true);
    expect(expectedDemand(s, plot).kept).toBeGreaterThan(keptBefore + 0.02);
    expect(expectedDemand(s, next).visitors).toBeLessThan(theirsBefore);
  });

  it('Free Sample Day hands out 100 cups for +0.1 star, one at a time across your empire', () => {
    const s = newGame(65);
    s.rank = 2;
    const corner = s.plots[LOTTIES_CORNER].stand!;
    stockUp(corner);
    const away = 'oldtown-2n';
    stockUp(standOn(s, away));
    const cups = cupsInStock(s, LOTTIES_CORNER), rep = s.reputation;
    expect(runCampaign(s, 'freeSamples', LOTTIES_CORNER)).toBe(true);
    expect(cupsInStock(s, LOTTIES_CORNER)).toBeLessThanOrEqual(cups - 100);
    expect(s.reputation).toBeCloseTo(rep + 0.1, 9);
    expect(corner.campaigns.freeSamples).toBe(3);
    expect(canRunCampaign(s, 'freeSamples', away)).toEqual({ ok: false, why: "Running at Lottie's Corner" }); // its star can't be farmed
    expect(canRunCampaign(s, 'sandwichBoard', away).ok).toBe(true); // other campaigns stack fine
    corner.campaigns = {}; // it's over
    expect(canRunCampaign(s, 'freeSamples', away).ok).toBe(true);
  });

  it('no campaign runs at a Wrecked or Busted stand', () => {
    const s = newGame(66);
    s.rank = 4;
    s.cash = 1000;
    const ps = s.plots[LOTTIES_CORNER];
    stockUp(ps.stand!);
    ps.stand!.wrecked = true;
    expect(canRunCampaign(s, 'sandwichBoard', LOTTIES_CORNER)).toEqual({ ok: false, why: 'Rebuild it first' });
    expect(canRunCampaign(s, 'freeSamples', LOTTIES_CORNER)).toEqual({ ok: false, why: 'Rebuild it first' });
    expect(canRunCampaign(s, 'sunny', LOTTIES_CORNER)).toEqual({ ok: false, why: 'No open stand here' }); // its only stand in Maple Row
    ps.busted = true;
    expect(canRunCampaign(s, 'sandwichBoard', LOTTIES_CORNER)).toEqual({ ok: false, why: 'Fix it first' });
    stockUp(standOn(s, 'maple-4s'));
    expect(canRunCampaign(s, 'sunny', LOTTIES_CORNER).ok).toBe(true); // another stand of yours there still sells
  });
});

describe('booking campaigns for tomorrow', () => {
  /** Lottie's Corner at noon on a hot day, with plenty of stock. */
  function midday(seed: number): GameState {
    const s = newGame(seed);
    s.rank = 4;
    s.cash = 2000;
    stockUp(s.plots[LOTTIES_CORNER].stand!);
    s.forecast = { kind: 'hot', temp: 90 };
    openStands(s);
    while (s.minute < 12 * 60) tickMinute(s);
    return s;
  }

  it('books the Sign kid during business hours: paid now, counted in tomorrow\'s odds, on at the next open', () => {
    const s = midday(71);
    const corner = s.plots[LOTTIES_CORNER].stand!;
    const today = marketingMultiplier(s, 'player', corner, LOTTIES_CORNER);
    expect(canRunCampaign(s, 'sandwichBoard').ok).toBe(true);
    const cash = s.cash;
    expect(runCampaign(s, 'sandwichBoard')).toBe(true);
    expect(s.cash).toBe(cash - 40);
    expect(corner.campaigns.sandwichBoard).toBeUndefined(); // not today
    expect(marketingMultiplier(s, 'player', corner, LOTTIES_CORNER)).toBe(today);
    expect(canRunCampaign(s, 'sandwichBoard')).toEqual({ ok: false, why: 'Booked for tomorrow' });
    simulateRestOfDay(s);
    expect(canRunCampaign(s, 'sandwichBoard')).toEqual({ ok: false, why: 'Plan campaigns during Morning Prep' }); // after closing
    s.raids = [];
    sleepUntilDawn(s);
    expect(s.phase).toBe('prep');
    expect(marketingTerms(s, 'player', corner, LOTTIES_CORNER).map((t) => t.id)).toContain('sandwichBoard'); // Morning Prep's odds count it
    expect(canRunCampaign(s, 'sandwichBoard')).toEqual({ ok: false, why: 'Booked for today' });
    const paid = s.cash;
    openStands(s);
    expect(corner.campaigns.sandwichBoard).toBe(1);
    expect(s.marketing!.booked).toEqual([]);
    expect(s.cash).toBeLessThanOrEqual(paid); // not charged twice (Auto-Restock may buy)
    expect(s.today.books?.marketing ?? 0).toBe(0); // today's books carry no new campaign fee
  });

  it('books Sunny and a Coupon Blitz for tomorrow too', () => {
    const s = midday(72);
    const corner = s.plots[LOTTIES_CORNER].stand!;
    const today = marketingMultiplier(s, 'player', corner, LOTTIES_CORNER);
    expect(runCampaign(s, 'sunny', LOTTIES_CORNER)).toBe(true);
    expect(runCampaign(s, 'couponBlitz', LOTTIES_CORNER)).toBe(true);
    expect(marketingMultiplier(s, 'player', corner, LOTTIES_CORNER)).toBe(today);
    expect(couponCut(s, LOTTIES_CORNER)).toBe(0);
    expect(canRunCampaign(s, 'sunny', 'oldtown-2n')).toEqual({ ok: false, why: 'Pick a stand' });
    expect(canRunCampaign(s, 'sunny', LOTTIES_CORNER)).toEqual({ ok: false, why: 'Booked for tomorrow' });
    simulateRestOfDay(s);
    s.raids = [];
    sleepUntilDawn(s);
    expect(marketingMultiplier(s, 'player', corner, LOTTIES_CORNER)).toBeCloseTo(today + 0.25, 9);
    expect(couponCut(s, LOTTIES_CORNER)).toBe(0.25);
    openStands(s);
    expect(couponCut(s, LOTTIES_CORNER)).toBe(0.25);
  });

  it('calls a booking off at the open when it can\'t start, and pays it back', () => {
    const s = midday(73);
    const corner = s.plots[LOTTIES_CORNER].stand!;
    expect(runCampaign(s, 'sandwichBoard')).toBe(true);
    simulateRestOfDay(s);
    s.raids = [];
    sleepUntilDawn(s);
    corner.level = 4; // grown past the Sign kid overnight
    s.news = [];
    openStands(s);
    expect(corner.campaigns.sandwichBoard).toBeUndefined();
    expect(s.today.books?.marketing).toBe(40); // the $40 came back
    expect(s.news.some((n) => /Sandwich-Board Kid at Lottie's Corner is off .*\$40 back/.test(n))).toBe(true);
  });

  it('a booked Free Sample Day hands out its cups at the open, and Auto-Restock buys them', () => {
    const s = midday(74);
    const corner = s.plots[LOTTIES_CORNER].stand!;
    expect(runCampaign(s, 'freeSamples')).toBe(true);
    expect(corner.campaigns.freeSamples).toBeUndefined();
    expect(canRunCampaign(s, 'freeSamples')).toEqual({ ok: false, why: 'Booked for tomorrow' });
    simulateRestOfDay(s);
    s.raids = [];
    sleepUntilDawn(s);
    const rep = s.reputation;
    openStands(s);
    expect(corner.campaigns.freeSamples).toBe(3);
    expect(s.reputation).toBeCloseTo(rep + 0.1, 9);
  });

  it('keeps the bookings in a save', () => {
    const s = midday(75);
    expect(runCampaign(s, 'sandwichBoard')).toBe(true);
    const back = migrateSave(JSON.parse(JSON.stringify(s)));
    expect(back!.marketing!.booked).toEqual(s.marketing!.booked);
    const old = JSON.parse(JSON.stringify(s));
    delete old.marketing;
    expect(migrateSave(old)!.marketing).toBeUndefined(); // an older run simply has none
  });
});
