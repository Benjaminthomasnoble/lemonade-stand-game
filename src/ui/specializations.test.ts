import { describe, expect, it } from 'vitest';
import { fitSpec, LOTTIES_CORNER, newGame, newStand, priceCeiling, type GameState } from '../sim/economy.ts';
import { specCards, type SpecKit } from './specializations.ts';

/** A bare clay kit: each card is its test id, title, subtitle and buttons. */
const kit: SpecKit = {
  card: (_art, title, sub, action, tip = '', extra = '') => `<div ${extra} data-tip="${tip}"><b>${title}</b><i>${sub}</i>${action}</div>`,
  whole: (n) => `$${n.toLocaleString('en-US')}`,
};

/** Morning Prep with Lottie's Corner at this level and cash to spend. */
function prep(level: number): GameState {
  const s = newGame(83);
  s.day = 30;
  s.rank = 8;
  s.phase = 'prep';
  s.cash = 100_000;
  s.plots[LOTTIES_CORNER].stand = newStand(level);
  s.plots[LOTTIES_CORNER].stand!.price = priceCeiling(s, LOTTIES_CORNER);
  return s;
}
/** The button for a specialization in a slot (1 or 2). */
const button = (html: string, slot: number, id: string) => html.match(new RegExp(`<button[^>]*data-testid="spec-${slot}-${id}"[^>]*>`))?.[0] ?? '';

describe("the Grow tab's specialization slots", () => {
  it('shows none below The Kiosk, one slot at L3 and L4, two at the Citrus Palace', () => {
    expect(specCards(kit, prep(2))).toEqual([]);
    expect(specCards(kit, prep(3))).toHaveLength(1);
    expect(specCards(kit, prep(4))).toHaveLength(1);
    const two = specCards(kit, prep(5)).join('');
    expect(two).toContain('<b>Slot 1: empty</b><i>Fit one for $2,000</i>');
    expect(two).toContain('<b>Slot 2: empty</b><i>Fit one for $40,000</i>');
  });

  it('offers all four in an empty slot, each with its effect and where it shines', () => {
    const html = specCards(kit, prep(3)).join('');
    for (const id of ['express', 'fancy', 'fortified', 'roof']) {
      expect(button(html, 1, id)).toMatch(/data-action="spec" data-slot="0"/);
      expect(button(html, 1, id)).not.toContain('disabled');
    }
    expect(button(html, 1, 'express')).toContain('title="Express Window: +30% service (cups/hour). Best on a stand with a line out the door. Fit it for $2,000"');
    expect(button(html, 1, 'fancy')).toContain('Best on rich crowds: Downtown, The Boardwalk, Hilltop Estates');
    expect(button(html, 1, 'fortified')).toContain('Best on a front-line stand rivals keep targeting');
    expect(button(html, 1, 'roof')).toContain('+15% traffic to your stands within 2 plots. Best on the middle of your own cluster');
  });

  it('shows what a slot holds, offers a swap for the slot price, and keeps one specialization to one slot', () => {
    const s = prep(5);
    fitSpec(s, LOTTIES_CORNER, 0, 'express');
    const html = specCards(kit, s).join('');
    expect(html).toContain('<b>Slot 1: Express Window</b><i>+30% service (cups/hour)</i>');
    expect(button(html, 1, 'express')).toMatch(/aria-pressed="true" title="[^"]*Fitted here" disabled/);
    expect(button(html, 1, 'fancy')).toContain('Swap it in for $2,000');
    expect(button(html, 2, 'express')).toMatch(/In slot 1" disabled/);
    expect(button(html, 2, 'roof')).toContain('Fit it for $40,000');
    s.phase = 'open';
    expect(button(specCards(kit, s).join(''), 2, 'roof')).toMatch(/Fit during Morning Prep" disabled/);
  });

  it("shows nothing for a stand that isn't yours", () => {
    const s = prep(5);
    s.plots[LOTTIES_CORNER].owner = 'hollis';
    expect(specCards(kit, s)).toEqual([]);
  });
});
