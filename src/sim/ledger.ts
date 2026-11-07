// The Ledger (spec: Business and economy, The Ledger; Appendix B's Day 12). Every cash movement of the day goes
// through book() onto one row, so the day's rows add up to its change in cash, dawn to dawn: Profit, plus what went
// into land and buildings (Invested), into stock (bought less used) and to or from the bank (Loans).
//
// Supplies are what the day used, not what it bought (spec: "187 × $0.24, plus 13 cups of ice melting overnight"):
// each cup sold at the day's cost per cup, plus stock that melted or spoiled. Buying stock is no cost of the day;
// unused lemons and sugar stay on hand and count in Net Worth at cost. A cup's cup, extras and machine ice are paid
// as it pours (the Supplies row's cash); its lemons, sugar and ice come out of stock (stockUsed).
//
// A later cash movement books on the row that fits (book(s, 'citations', -fine)). The Success Score's close each
// day is logged here too, for the Ledger's chart.
import type { DayStats, GameState, Stand } from './economy.ts';
import { costPerCup } from './economy.ts';

export type LedgerRow =
  | 'sales' | 'orders' | 'prizes' | 'loot' | 'cookieJar'
  | 'supplies' | 'upkeep' | 'wages' | 'marketing' | 'repairs' | 'tribute' | 'interest' | 'citations' | 'hire' | 'gear' | 'bottling' | 'other'
  | 'invested' | 'stock' | 'loan';

/** Rows outside Profit: capital spending, stock bought and borrowing. */
export const OFF_PROFIT: readonly LedgerRow[] = ['invested', 'stock', 'loan'];

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * A cash movement (amount: + in, − out) on today's row: the cash moves and the Ledger records it. `n` counts what
 * it was for (stands charged upkeep, guards paid), for the row's label. The old totals follow: stock bought is
 * the day's `supplies`, Invested its `land`, stand upkeep its `upkeep`.
 */
export function book(s: GameState, row: LedgerRow, amount: number, n = 0): void {
  if (!amount && !n) return;
  s.cash = round2(s.cash + amount);
  const t = s.today;
  const b = (t.books ??= {});
  b[row] = round2((b[row] ?? 0) + amount);
  if (n) (t.counts ??= {})[row] = (t.counts[row] ?? 0) + n;
  if (row === 'stock') t.supplies = round2(t.supplies - amount);
  else if (row === 'invested') t.land = round2(t.land - amount);
  else if (row === 'upkeep') t.upkeep = round2(t.upkeep - amount);
}

/** Stock used up today, at its value (a cup's lemons, sugar and ice; melted ice, spoiled lemons, free samples). */
export function useStock(s: GameState, value: number, waste = false): void {
  if (value <= 0) return;
  const t = s.today;
  t.stockUsed = round2((t.stockUsed ?? 0) + value);
  if (waste) t.waste = round2((t.waste ?? 0) + value);
}

/** One cup sold at a stand of yours: the price in, the cup's cash costs out, and its stock at the day's prices. */
export function sellCup(s: GameState, st: Stand, paid: number, cash: number): void {
  book(s, 'sales', paid);
  book(s, 'supplies', -cash);
  useStock(s, costPerCup(s, st) - cash);
}

/** The value of a stand's stock (lemons by batch, sugar and ice at their average cost). */
export function stockValue(st: Stand): number {
  const inv = st.inventory;
  return inv.lemons.reduce((a, b) => a + b.qty * b.unitCost, 0) + inv.sugar * inv.sugarCost + inv.ice * inv.iceCost;
}

/** A day's row: its cash for a booked row; Supplies also takes the stock used, Stock gives it back. */
export function rowAmount(t: DayStats, row: LedgerRow): number {
  const b = t.books?.[row] ?? 0;
  if (row === 'supplies') return round2(b - (t.stockUsed ?? 0));
  if (row === 'stock') return round2(b + (t.stockUsed ?? 0));
  return b;
}

/** The day's profit: every row but Invested, Stock and Loans. Days from before the Ledger use their old totals. */
export function dayProfit(t: DayStats): number {
  if (!t.books) return round2(t.revenue - t.supplies - t.cupCosts - t.upkeep);
  let p = 0;
  for (const row of Object.keys(t.books) as LedgerRow[]) if (!OFF_PROFIT.includes(row)) p += t.books[row] ?? 0;
  return round2(p - (t.stockUsed ?? 0));
}

/** The day's change in cash, dawn to dawn (all of its rows). */
export function dayCash(t: DayStats): number {
  return round2(Object.values(t.books ?? {}).reduce((a, v) => a + (v ?? 0), 0));
}

export interface LedgerLine { row: LedgerRow; label: string; amount: number; title?: string }

const money = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const plural = (n: number, one: string, many = one + 's') => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

const LABEL: Record<LedgerRow, string> = {
  sales: 'Sales', orders: 'Orders', prizes: 'Prizes and rewards', loot: 'Raid loot', cookieJar: "Lottie's Cookie Jar",
  supplies: 'Supplies', upkeep: 'Upkeep', wages: 'Wages', marketing: 'Marketing', repairs: 'Repairs and rebuilds',
  tribute: 'Truce tribute', interest: 'Loan interest', citations: 'Citations', hire: 'Hire fees', gear: 'Weapons and gear',
  bottling: 'Bottling', other: 'Other', invested: 'Invested', stock: 'Into stock', loan: 'Loans',
};
/** Shown every day, even at $0. */
const ALWAYS: LedgerRow[] = ['sales', 'orders', 'supplies', 'upkeep', 'wages'];
const ORDER: LedgerRow[] = [
  'sales', 'orders', 'prizes', 'loot', 'cookieJar', 'supplies', 'upkeep', 'wages', 'marketing', 'repairs', 'tribute', 'interest',
  'citations', 'hire', 'gear', 'bottling', 'other',
];

/** The profit-and-loss rows for a day: count and unit price where a row has one; then the rows below Profit. */
export function ledgerLines(t: DayStats): { pnl: LedgerLine[]; below: LedgerLine[] } {
  const cups = t.customers;
  const line = (row: LedgerRow): LedgerLine => {
    const amount = rowAmount(t, row);
    const n = t.counts?.[row] ?? 0;
    let label = LABEL[row], title: string | undefined;
    if (row === 'sales' && cups) label = `Sales: ${plural(cups, 'cup')} at ${money(amount / cups)}`;
    if (row === 'supplies' && cups) {
      const waste = t.waste ?? 0;
      label = `Supplies: ${plural(cups, 'cup')} at ${money((-amount - waste) / cups)}`;
      if (waste > 0) title = `Plus ${money(waste)} of stock that melted or spoiled`;
    }
    if (row === 'upkeep' && n) label = `Upkeep: ${plural(n, 'stand')}`;
    if (row === 'wages' && n) label = `Wages: ${plural(n, 'guard')}`;
    if (row === 'stock') title = 'Supplies bought less supplies used: what stays on hand counts in Net Worth';
    if (row === 'other') title = 'The Lavender page auction';
    return { row, label, amount, title };
  };
  const has = (row: LedgerRow) => Math.abs(rowAmount(t, row)) >= 0.005;
  if (!t.books) { // a day from before the Ledger: its old totals
    const costs = round2(t.supplies + t.cupCosts + t.upkeep);
    return { pnl: [{ row: 'sales', label: LABEL.sales, amount: t.revenue }, { row: 'supplies', label: 'Supplies, cups and upkeep', amount: -costs }], below: [] };
  }
  return {
    pnl: ORDER.filter((row) => ALWAYS.includes(row) || has(row)).map(line),
    below: OFF_PROFIT.filter(has).map(line),
  };
}

// ---------- the Success Score, day by day ----------

/** Log the score at a day's close (the Ledger's chart, across the whole run). */
export function logScore(s: GameState, score: number): void {
  const log = (s.scores ??= []);
  while (log.length < s.day - 1) log.push(null);
  log[s.day - 1] = Math.round(score);
}

/**
 * Every load (idempotent). From the close to dawn, today is also history's last day: one record the evening's and the
 * night's movements keep booking onto. A save holds two copies of it, so a load ties them back together. An older
 * save also gets the closing scores its history still knows (each day's close is the next day's opening).
 */
export function migrateLedger(s: GameState): void {
  const last = s.history?.[s.history.length - 1];
  if (last && s.today && last !== s.today && last.day === s.today.day) s.history[s.history.length - 1] = s.today;
  if (s.scores) return;
  const log: (number | null)[] = [];
  const days = [...s.history];
  if (s.today && !days.includes(s.today)) days.push(s.today);
  for (let i = 0; i + 1 < days.length; i++) {
    if (days[i + 1].day !== days[i].day + 1) continue;
    while (log.length < days[i].day - 1) log.push(null);
    log[days[i].day - 1] = Math.round(days[i + 1].scoreBefore);
  }
  s.scores = log;
}
