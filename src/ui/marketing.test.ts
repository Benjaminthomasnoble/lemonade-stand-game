import { describe, expect, it } from 'vitest';
import { LOTTIES_CORNER, newGame, newStand, priceCeiling, runCampaign, type Blocker, type GameState } from '../sim/economy.ts';
import { campaignCards, type CampaignKit } from './marketing.ts';

/** A bare clay kit: each card is its title, subtitle and button. */
const kit: CampaignKit = {
  ART: { board: () => '', sample: () => '', lemon: () => '', coin: () => '' },
  btn: (action, label, b: Blocker = { ok: true }, extra = '') => `<button data-action="${action}" ${extra}${b.ok ? '' : ` disabled title="${b.why}"`}>${label}</button>`,
  card: (_art, title, sub, action) => `<div><b>${title}</b><i>${sub}</i>${action}</div>`,
  locked: (b) => !b.ok && /Rank \d/.test(b.why),
  whole: (n) => `$${n.toLocaleString('en-US')}`,
};

/** Morning Prep on Day 8 (past the marketing lesson) at the given rank. */
function prep(rank: number): GameState {
  const s = newGame(81);
  s.day = 8;
  s.rank = rank;
  s.cash = 2000;
  return s;
}

describe("the Grow tab's campaign cards", () => {
  it("shows this stand's campaigns and its district's, with what each costs", () => {
    const cards = campaignCards(kit, prep(4)).join('');
    expect(cards).toContain('<b>Sign kid</b><i>$40 a day</i>');
    expect(cards).toContain('<b>Free samples</b><i>100 cups</i>');
    expect(cards).toContain('<b>Sunny</b><i>$300 a day · Maple Row</i>');
    expect(cards).toContain('<b>Coupons</b><i>−25% · Maple Row</i>');
    for (const id of ['sandwichBoard', 'freeSamples', 'sunny', 'couponBlitz']) expect(cards).toContain(`data-id="${id}" data-testid="campaign-${id}"`);
  });

  it('hides the campaigns the rank has not unlocked, and the Sign kid at a bigger stand', () => {
    expect(campaignCards(kit, prep(2)).join('')).not.toMatch(/Sunny|Coupons/);
    const s = prep(3);
    s.plots[LOTTIES_CORNER].stand = newStand(4);
    s.plots[LOTTIES_CORNER].stand!.price = priceCeiling(s, LOTTIES_CORNER);
    const cards = campaignCards(kit, s).join('');
    expect(cards).not.toContain('Sign kid');
    expect(cards).toContain('Sunny');
    expect(campaignCards(kit, { ...prep(4), day: 5 })).toEqual([]); // before Day 6's lesson
  });

  it('shows a running campaign as done for the day', () => {
    const s = prep(4);
    expect(runCampaign(s, 'sunny')).toBe(true);
    expect(campaignCards(kit, s).join('')).toContain('data-id="sunny" data-testid="campaign-sunny" disabled title="Running today"');
  });
});
