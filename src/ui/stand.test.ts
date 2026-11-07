import { beforeAll, describe, expect, it } from 'vitest';
import { demandChain, eventsOf, LOTTIES_CORNER, newGame, openStands, priceCeiling, tickMinute, type GameState } from '../sim/economy.ts';
import { standPanel, walkerInfo, walkerLine } from './stand.ts';

// The reaction icons draw on a canvas; Node has none, so they come out blank here.
beforeAll(() => {
  (globalThis as { document?: unknown }).document ??= { createElement: () => ({ getContext: () => null }) };
});

/** Lottie's Corner on Day 3 with Pink at its ceiling and plenty of stock. */
function corner(): GameState {
  const s = newGame(1);
  s.day = 3;
  const st = s.plots[LOTTIES_CORNER].stand!;
  st.recipe = 'pink';
  st.price = priceCeiling(s, LOTTIES_CORNER);
  st.inventory.lemons = [{ qty: 400, day: 3, unitCost: 0.1 }];
  st.inventory.sugar = 1000;
  st.inventory.ice = 2000;
  s.forecast = { kind: 'hot', temp: 88 };
  return s;
}

describe('tap a walker to hear why', () => {
  const s = newGame(1);
  s.plots[LOTTIES_CORNER].stand!.recipe = 'pink';
  const at = (over: Partial<Parameters<typeof walkerLine>[1]>) =>
    walkerLine(s, { plot: LOTTIES_CORNER, at: LOTTIES_CORNER, buys: false, price: 1.57, owner: 'player', ...over });

  it('says what a buyer bought and what they paid', () => {
    expect(at({ buys: true })).toBe('Pink Lemonade, $1.57!');
    expect(at({ buys: true, price: 0.75 })).toBe('Pink Lemonade, 75¢!');
    expect(at({ buys: true, at: 'oldtown-0n', owner: 'fizzco' })).toBe('Soda at FizzCo Beverages');
  });

  it('gives each walk-away its reason', () => {
    expect(at({ reason: 'pricey' })).toBe('Too pricey!');
    expect(at({ reason: 'line' })).toBe('Line too long!');
    expect(at({ reason: 'notThirsty' })).toBe('Not thirsty.');
    expect(at({ reason: 'soldOut' })).toBe('Sold out!');
    // Walking past your stand for a rival's is the reason, whatever happened there.
    expect(at({ at: 'oldtown-0n', owner: 'fizzco', reason: 'notThirsty' })).toBe('Went to a rival!');
    // A walker at a rival's own plot says why they passed that stand.
    expect(at({ plot: 'oldtown-0n', at: 'oldtown-0n', owner: 'fizzco', reason: 'pricey' })).toBe('Too pricey!');
  });

  it('carries who they are and the street\'s icon for it', () => {
    const e = { plot: LOTTIES_CORNER, at: LOTTIES_CORNER, buys: false, price: 1.57, owner: 'player', segment: 'kids' as const };
    expect(walkerInfo(s, { ...e, buys: true })).toEqual({ segment: 'kids', line: 'Pink Lemonade, $1.57!', icon: 'bought' });
    expect(walkerInfo(s, { ...e, reason: 'notThirsty' }).icon).toBe('zzz');
    expect(walkerInfo(s, { ...e, reason: 'soldOut' }).icon).toBe('soldout');
    expect(walkerInfo(s, { ...e, at: 'oldtown-0n', owner: 'fizzco', reason: 'line' })).toEqual({ segment: 'kids', line: 'Went to a rival!', icon: 'rival' });
  });
});

describe('the stand panel', () => {
  it('shows the three steps with the forecast at Morning Prep and the binding cap taped', () => {
    const s = corner();
    const c = demandChain(s, LOTTIES_CORNER)!;
    const html = standPanel(s, LOTTIES_CORNER, false);
    expect(html).toContain('data-testid="stand-panel"');
    expect(html).toContain(`${c.passersby} walk by`);
    expect(html).toContain(`${Math.round(c.stopChance * 100)}% stop`);
    expect(html).toContain(`${c.cups} cups`);
    expect(html).toContain(`<span class="cl-tape">want ${c.demand}</span>`); // demand binds on a hot day
    expect(html).toContain('pour 200');
    expect(html).not.toContain('<table');
    s.forecast = { kind: 'scorcher', temp: 99 };
    expect(standPanel(s, LOTTIES_CORNER, false)).toContain('<span class="cl-tape">pour 200</span>');
  });

  it('opens the math with every number in the chain', () => {
    const s = corner();
    const html = standPanel(s, LOTTIES_CORNER, true);
    for (const row of ['Plot traffic', 'Stand draw', 'Marketing', 'Summer', 'Hot streets', 'Walk by', 'Base stop', 'Hot thirst', 'Curb appeal',
      'Recipe match', 'Sweetness', 'Price fit ($1.57 of $1.57)', 'Reputation', 'Stop', 'Want a cup', 'Pour (20/hour × 10)', 'In stock', 'Cups']) {
      expect(html).toContain(`<td>${row}</td>`);
    }
    expect(html).toContain('<td>400</td>');
    expect(html).toContain('<td>×1.3</td>');
  });

  it('breaks the marketing number into its terms, and names a surge on top', () => {
    const s = corner();
    s.rank = 3;
    s.brandTier = 1;
    s.plots[LOTTIES_CORNER].stand!.campaigns.sandwichBoard = 1;
    eventsOf(s).on.push({ id: 'viralVideo', from: s.day, to: s.day + 1, live: true, plots: [LOTTIES_CORNER], district: 'maple' });
    const html = standPanel(s, LOTTIES_CORNER, true);
    expect(html).toContain('<td>Marketing</td><td>×1.25</td>');
    expect(html).toContain('<td>· Hand-Painted Signs</td><td>+5%</td>');
    expect(html).toContain('<td>· Sandwich-Board Kid</td><td>+20%</td>');
    expect(html).toContain('<td>Viral Video</td><td class="good">×2</td>');
  });

  it('flags a price past the top, and goes live once the stand opens', () => {
    const s = corner();
    s.plots[LOTTIES_CORNER].stand!.price = 1.8;
    expect(standPanel(s, LOTTIES_CORNER, false)).toContain('over the $1.57 top');
    s.plots[LOTTIES_CORNER].stand!.price = 1.57;
    openStands(s);
    s.weather = { kind: 'hot', temp: 88 };
    for (let i = 0; i < 300; i++) tickMinute(s);
    const st = s.plots[LOTTIES_CORNER].stand!;
    const live = standPanel(s, LOTTIES_CORNER, false);
    expect(live).toContain('Today so far');
    expect(live).toContain(`${st.day.passersby} of ~`);
    expect(live).toContain(`${st.day.customers} sold · line `);
    expect(live).toContain('pour left');
  });

  it('carries the mid-day nudges for the stand you manage, while it sells', () => {
    const s = corner();
    expect(standPanel(s, LOTTIES_CORNER, false)).not.toContain('data-testid="nudges"'); // Morning Prep has the dock
    openStands(s);
    s.weather = { kind: 'hot', temp: 88 };
    for (let i = 0; i < 60; i++) tickMinute(s);
    const html = standPanel(s, LOTTIES_CORNER, false);
    expect(html).toContain('data-testid="nudges"');
    for (const a of ['data-action="price" data-delta="-0.05"', 'data-action="price" data-delta="0.05"', 'data-action="priceCeiling"',
      'data-action="recipe" data-id="classic"', 'data-action="recipe" data-id="pink" aria-pressed="true"', 'data-action="sweet" data-value="extra"',
      'data-action="buy" data-id="lemons"', 'data-action="buy" data-id="sugar"', 'data-action="buy" data-id="ice"']) expect(html).toContain(a);
    expect(html).toContain(`top ${'$'}${priceCeiling(s, LOTTIES_CORNER).toFixed(2)}`);
    expect(html).not.toContain('data-action="upgrade"'); // upgrades and land stay Morning Prep only
    s.day = 1; // before Day 2's recipe lesson the tray has the price and stock alone
    expect(standPanel(s, LOTTIES_CORNER, false)).not.toContain('data-action="recipe"');
    expect(standPanel(s, LOTTIES_CORNER, false)).toContain('data-action="priceCeiling"');
    s.day = 3;
    s.selected = 'maple-1n'; // another stand's card has Manage first
    expect(standPanel(s, LOTTIES_CORNER, false)).not.toContain('data-testid="nudges"');
  });
});
