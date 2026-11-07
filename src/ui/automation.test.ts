import { describe, expect, it } from 'vitest';
import {
  AUTO_PRICE_RANK, AUTO_RESTOCK_DAY, LOTTIES_CORNER, newGame, openStands, setByHand, setRecipe, setStockTarget, simulateRestOfDay, sleepUntilDawn,
  stockTarget, suggestedTarget, toggleAutoPrice, toggleAutoRestock, type GameState, type Weather,
} from '../sim/economy.ts';
import { autoTickets, helperRows, priceSwitch, restockControl } from './automation.ts';

/** Day 3's Morning Prep, the stands stocked at dawn; `sky` is the day's weather and forecast if given (set on the weather queue the night before). */
function dawnOfDay3(sky?: Weather): GameState {
  const s = newGame(21);
  while (s.day < AUTO_RESTOCK_DAY) {
    s.cash = Math.max(s.cash, 400);
    openStands(s);
    simulateRestOfDay(s);
    if (sky && s.day === AUTO_RESTOCK_DAY - 1) s.weatherQueue = [{ day: AUTO_RESTOCK_DAY, weather: sky, forecast: sky }];
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
    const s = dawnOfDay3({ kind: 'warm', temp: 80 }); // a Warm day: a Scorcher fills an L1's 200-cup pour at dawn, leaving a new card nothing to add
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

describe('Auto-Price on screen', () => {
  it('the price tag has the switch from Rank 3, and Morning Prep shows what Marisol set', () => {
    const s = dawnOfDay3();
    expect(priceSwitch(s, LOTTIES_CORNER)).toBe('');
    s.rank = AUTO_PRICE_RANK;
    s.cash = Math.max(s.cash, 400);
    openStands(s);
    simulateRestOfDay(s);
    s.cash = Math.max(s.cash, 5000);
    sleepUntilDawn(s);
    const st = s.plots[LOTTIES_CORNER].stand!;
    expect(priceSwitch(s, LOTTIES_CORNER)).toContain('data-action="autoPrice" data-testid="auto-price" aria-pressed="true"');
    const ticket = autoTickets(s).find((t) => t.includes('data-testid="auto-price"'))!;
    expect(ticket).toContain('Auto-Price: 1 stand at the top');
    expect(ticket).toContain(`$${st.price.toFixed(2)}`);
    setByHand(s, LOTTIES_CORNER, 'price');
    expect(priceSwitch(s, LOTTIES_CORNER)).toContain('aria-pressed="false"');
    expect(autoTickets(s).find((t) => t.includes('data-testid="auto-price"'))).not.toContain('$'); // no price of hers to show
    toggleAutoPrice(s, LOTTIES_CORNER);
    expect(priceSwitch(s, LOTTIES_CORNER)).toContain('aria-pressed="true"');
  });
});
