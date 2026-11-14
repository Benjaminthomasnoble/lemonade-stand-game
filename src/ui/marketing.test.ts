import { describe, expect, it } from 'vitest';
import { LOTTIES_CORNER, newGame, newStand, priceCeiling, runCampaign, type Blocker, type GameState } from '../sim/economy.ts';
import { bookingRow, campaignCards, type CampaignKit } from './marketing.ts';

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

  it("with Lottie's Long Run, a stand campaign's card and booking say the days it really runs", () => {
    const s = prep(4);
    const tips = { ...kit, card: (_art: string, title: string, sub: string, _action: string, tip = '') => `<div><b>${title}</b><i>${sub}</i><q>${tip}</q></div>` };
    const before = campaignCards(tips, s).join('');
    expect(before).toMatch(/<b>Sign kid<\/b><i>\$40 a day<\/i><q>[^<]*\+20% foot traffic today \(L1–L3 stands\)<\/q>/);
    expect(before).toMatch(/<b>Free samples<\/b><i>100 cups<\/i><q>[^<]*\+15% traffic for 3 days<\/q>/);
    s.story!.tips = { held: ['longRun'], hands: [] };
    const cards = campaignCards(tips, s).join('');
    expect(cards).toMatch(/<b>Sign kid<\/b><i>\$40 · 2 days<\/i><q>[^<]*\+20% foot traffic for 2 days \(L1–L3 stands\)\. Long Run: 50% longer<\/q>/);
    expect(cards).toMatch(/<b>Free samples<\/b><i>100 cups · 5 days<\/i><q>[^<]*\+15% traffic for 5 days\. Long Run: 50% longer<\/q>/);
    expect(cards).toContain('<b>Sunny</b><i>$300 a day · Maple Row</i>'); // one district, one day: Long Run leaves it be
    s.phase = 'open';
    expect(bookingRow(s, LOTTIES_CORNER)).toContain('title="Book for tomorrow: $40. +20% foot traffic for 2 days (L1–L3 stands)"');
    s.phase = 'prep';
    expect(runCampaign(s, 'sandwichBoard')).toBe(true);
    expect(s.plots[LOTTIES_CORNER].stand!.campaigns.sandwichBoard).toBe(2); // as the card said
  });

  it('shows a running campaign as done for the day', () => {
    const s = prep(4);
    expect(runCampaign(s, 'sunny')).toBe(true);
    expect(campaignCards(kit, s).join('')).toContain('data-id="sunny" data-testid="campaign-sunny" disabled title="Running today"');
  });
});
