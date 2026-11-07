import { describe, expect, it } from 'vitest';
import {
  AUTO_RESTOCK_DAY, LOTTIES_CORNER, newGame, openStands, setRecipe, setStockTarget, simulateRestOfDay, sleepUntilDawn, stockTarget, suggestedTarget,
  toggleAutoRestock, type GameState,
} from '../sim/economy.ts';
import { autoTickets, helperRows, restockControl } from './automation.ts';

function dawnOfDay3(): GameState {
  const s = newGame(21);
  while (s.day < AUTO_RESTOCK_DAY) {
    s.cash = Math.max(s.cash, 400);
    openStands(s);
    simulateRestOfDay(s);
    sleepUntilDawn(s);
  }
  return s;
}

describe('Auto-Restock on screen', () => {
  it('the dock has the switch and the stock target from Day 3, and nothing before', () => {
    const s = newGame(21);
    expect(restockControl(s, LOTTIES_CORNER)).toBe('');
    const d3 = dawnOfDay3();
    const html = restockControl(d3, LOTTIES_CORNER);
    expect(html).toContain('data-action="restock"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain(`${suggestedTarget(d3, LOTTIES_CORNER)} cups`);
    expect(html).toContain('data-action="stockTarget" data-delta="-1"');
    expect(html).toContain('data-action="stockTarget" data-delta="1"');
    expect(html).not.toContain('Suggested</button>'); // on the suggestion already
    setStockTarget(d3, LOTTIES_CORNER, 200);
    const own = restockControl(d3, LOTTIES_CORNER);
    expect(own).toContain('200 cups');
    expect(own).toContain('data-delta="0"'); // back to the suggestion
    toggleAutoRestock(d3, LOTTIES_CORNER);
    const off = restockControl(d3, LOTTIES_CORNER);
    expect(off).toContain('aria-pressed="false"');
    expect(off).not.toContain('stockTarget');
  });

  it('Morning Prep shows what Lottie spent at dawn and what Open adds; the Ledger reports it in one line', () => {
    const s = dawnOfDay3();
    const spent = s.today.auto!.restock!.spent;
    const [ticket] = autoTickets(s);
    expect(ticket).toContain('data-testid="auto-restock"');
    expect(ticket).toContain(`Auto-Restock: $${spent.toFixed(2)}`);
    expect(ticket).toContain('1 stand');
    expect(ticket).not.toContain('at Open');
    setRecipe(s.plots[LOTTIES_CORNER].stand!, 'frozen');
    expect(autoTickets(s)[0]).toMatch(/\+\$\d+\.\d\d at Open/);
    openStands(s);
    expect(autoTickets(s)).toEqual([]); // a Morning Prep ticket
    const atOpen = stockTarget(s, LOTTIES_CORNER);
    simulateRestOfDay(s);
    const row = helperRows(s.history[s.history.length - 1]);
    expect(row).toContain(`Auto-Restock: 1 stand to ${atOpen} cups`);
    expect(row).toContain(`$${s.today.auto!.restock!.spent.toFixed(2)}`);
  });
});
