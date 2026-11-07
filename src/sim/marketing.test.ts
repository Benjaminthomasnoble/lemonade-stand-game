import { afterEach, describe, expect, it } from 'vitest';
import {
  adsBlocked, BRAND_TIERS, CAMPAIGNS, canRunCampaign, demandChain, EVENT_TRAFFIC, eventsOf, expectedPassersby, LOTTIES_CORNER, MARKETING_BLOCKS,
  MARKETING_TERMS, marketingMultiplier, marketingTerms, newGame, newStand, PERKS, PLOTS, priceCeiling, TASTE_OFF, type DistrictId,
  type GameState, type MarketingSource,
} from './economy.ts';

/** A player stand on plotId (the plot changes hands for the test). */
function standOn(s: GameState, plotId: string, level = 1) {
  s.plots[plotId].owner = 'player';
  s.plots[plotId].stand = newStand(level);
  s.plots[plotId].stand!.price = priceCeiling(s, plotId);
  return s.plots[plotId].stand!;
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
    const sunny: MarketingSource = (g, owner, add, _st, plotId) => { // the seam a district campaign plugs into (Sunny: +25%)
      if (owner === 'player' && plotId?.startsWith('oldtown')) add('sunny', 'Sunny the Lemon', 0.25, adsBlocked(g, owner, plotId));
    };
    added.push(sunny);
    MARKETING_TERMS.push(sunny);
    const plot = 'oldtown-2n';
    const st = standOn(s, plot, 3);
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
