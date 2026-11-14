import { describe, expect, it } from 'vitest';
import { book, bookOther, dayIncomeCosts, newGame, openStands, simulateRestOfDay, sleepUntilDawn, type GameState } from '../sim/economy.ts';
import { booksRows, scoreLine } from './ledger.ts';
import { menuScreen } from './menus.ts';
import { DEFAULT_OPTIONS, defaultKeys } from '../settings.ts';

function day3(): GameState {
  const s = newGame(31);
  while (s.day < 3) { s.cash = Math.max(s.cash, 400); openStands(s); simulateRestOfDay(s); sleepUntilDawn(s); }
  openStands(s);
  simulateRestOfDay(s);
  return s;
}

describe('the Ledger on screen', () => {
  it('lists each row with its count and price, losses in red, Profit, then stock and the day\'s cash', () => {
    const s = day3();
    const t = s.today;
    const html = booksRows(t);
    expect(html).toContain(`<td>Sales: ${t.customers} cups at $`);
    expect(html).toContain('<td>Supplies: ');
    expect(html).toContain('<td>Upkeep: 1 Folding Table at $5</td><td class="bad">-$5.00</td>');
    expect(html).toContain('data-testid="row-wages"'); // shown at $0 too
    expect(html).toContain('data-testid="row-profit"');
    expect(html).toContain('data-testid="row-stock"'); // Auto-Restock bought more than the day used
    expect(html).toContain('data-testid="row-cash"');
    expect(html).not.toContain('row-tribute'); // a row at $0 that isn't always shown stays hidden
  });

  it('the Other row says what booked it when you point at it', () => {
    const s = day3();
    bookOther(s, -8, 'Paid off a heckler');
    expect(booksRows(s.today)).toContain('<tr data-testid="row-other" title="Paid off a heckler"><td>Other</td><td class="bad">-$8.00</td></tr>');
  });

  it("the Ledger menu's days give income, costs and profit off the rows: a night's loot is income, not a cost below zero", () => {
    const s = day3();
    book(s, 'loot', 900);
    const t = s.today;
    const { income, costs } = dayIncomeCosts(t);
    const html = menuScreen(s, 'ledger', { head: ['', ''], goals: [], crew: () => '', options: { ...DEFAULT_OPTIONS, keys: defaultKeys() } });
    expect(html).toContain('<b>Cups · Income · Costs · Profit</b>');
    const whole = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
    expect(html).toContain(`<td>Day ${t.day}</td><td>${t.customers} · ${whole(income)} · ${whole(costs)} · `);
    expect(costs).toBeGreaterThan(0);
    expect(income).toBeGreaterThan(900);
  });

  it('charts the Success Score from Day 1, with a dot where each rank came and the peak', () => {
    const s = newGame(32);
    expect(scoreLine(s)).toBe('');
    s.scores = [null, 900, 1600, 1550];
    const svg = scoreLine(s);
    expect(svg.match(/<polyline points="([^"]+)"/)![1].split(' ')).toHaveLength(3);
    expect(svg).toContain('<title>Day 3: Corner Hustler</title>');
    expect(svg).toContain('<title>Peak, day 3: 1,600</title>');
  });
});
