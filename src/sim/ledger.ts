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
import { STAND_LEVELS } from './balance.ts';

export type LedgerRow =
  | 'sales' | 'orders' | 'prizes' | 'loot' | 'cookieJar'
  | 'supplies' | 'upkeep' | 'wages' | 'marketing' | 'repairs' | 'tribute' | 'interest' | 'citations' | 'hire' | 'gear' | 'bottling' | 'other'
  | 'invested' | 'stock' | 'loan';

/** Rows outside Profit: capital spending, stock bought and borrowing. */
export const OFF_PROFIT: readonly LedgerRow[] = ['invested', 'stock', 'loan'];

const round2 = (n: number) => Math.round(n * 100) / 100;
const fine = (n: number) => Math.round(n * 1e6) / 1e6;

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

/** A cash movement on the Other row, named: the Ledger titles the row with what booked it today (the Lavender page, a
 * heckler paid off). */
export function bookOther(s: GameState, amount: number, what: string): void {
  if (!amount) return;
  book(s, 'other', amount);
  const names = (s.today.others ??= []);
  if (!names.includes(what)) names.push(what);
}

/**
 * Stock used up today, at its value (a cup's lemons, sugar and ice; melted ice, spoiled lemons, free samples). It's a
 * cost on Supplies, or on `row` (a Free Sample Day's lemonade is Marketing).
 */
export function useStock(s: GameState, value: number, waste = false, row: LedgerRow = 'supplies'): void {
  if (value <= 0) return;
  const t = s.today;
  // Kept to the millionth, rounded where a row is read: a cup's stock is a fraction of a cent (Pink's $0.1365), and
  // rounding each one to the cent would add up to dollars of cost that never was over a busy day.
  t.stockUsed = fine((t.stockUsed ?? 0) + value);
  if (waste) t.waste = fine((t.waste ?? 0) + value);
  if (row !== 'supplies') (t.stockOn ??= {})[row] = fine((t.stockOn[row] ?? 0) + value);
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

/** A day's row: its cash for a booked row; Supplies (or the row it was used on) also takes the stock used, Stock gives it back. */
export function rowAmount(t: DayStats, row: LedgerRow): number {
  const b = t.books?.[row] ?? 0;
  const elsewhere = Object.values(t.stockOn ?? {}).reduce((a, v) => a + (v ?? 0), 0);
  if (row === 'supplies') return round2(b - (t.stockUsed ?? 0) + elsewhere);
  if (row === 'stock') return round2(b + (t.stockUsed ?? 0));
  const on = t.stockOn?.[row];
  return on ? round2(b - on) : b;
}

/** A day's profit-and-loss rows, each as the Ledger shows it (to the cent): every row but Invested, Stock and Loans. */
function pnlAmounts(t: DayStats): number[] {
  const rows = new Set<LedgerRow>([...ORDER, ...(Object.keys(t.books ?? {}) as LedgerRow[])]);
  return [...rows].filter((row) => !OFF_PROFIT.includes(row)).map((row) => rowAmount(t, row));
}

/** The day's profit: its profit-and-loss rows added up, as shown. Days from before the Ledger use their old totals. */
export function dayProfit(t: DayStats): number {
  if (!t.books) return round2(t.revenue - t.supplies - t.cupCosts - t.upkeep);
  return round2(pnlAmounts(t).reduce((a, v) => a + v, 0));
}

/** The day's change in cash, dawn to dawn (all of its rows). */
export function dayCash(t: DayStats): number {
  return round2(Object.values(t.books ?? {}).reduce((a, v) => a + (v ?? 0), 0));
}

/** The day's profit split in two: what came in (its rows above zero: sales, orders, prizes, loot won) and what went
 * out (its rows below zero), so income − costs = profit. */
export function dayIncomeCosts(t: DayStats): { income: number; costs: number } {
  if (!t.books) return { income: round2(t.revenue), costs: round2(t.supplies + t.cupCosts + t.upkeep) };
  const rows = pnlAmounts(t);
  return { income: round2(rows.filter((a) => a > 0).reduce((a, v) => a + v, 0)), costs: round2(-rows.filter((a) => a < 0).reduce((a, v) => a + v, 0)) };
}

export interface LedgerLine { row: LedgerRow; label: string; amount: number; title?: string }

const money = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dollars = (n: number) => (Number.isInteger(n) ? '$' + n.toLocaleString('en-US') : money(n)); // "at $15", "at $0.26"
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
    if (row === 'supplies') { // every cup poured: those sold at your stands and those poured for Local Orders (n)
      const poured = cups + n, waste = t.waste ?? 0;
      if (poured) label = `Supplies: ${plural(poured, 'cup')} at ${money((-amount - waste) / poured)}`;
      const notes = [n ? `${plural(n, 'cup')} of them poured for orders` : '', waste > 0 ? `Plus ${money(waste)} of stock that melted or spoiled` : ''];
      if (n || waste > 0) title = notes.filter(Boolean).join('. ');
    }
    if (row === 'upkeep' && n) { // "5 Wooden Stands at $15"; mixed levels give each in the title
      const kinds = (t.upkeepLevels ?? []).flatMap((k, i) => (k ? [`${plural(k, STAND_LEVELS[i].name.replace(/^The /, ''))} at ${dollars(STAND_LEVELS[i].upkeep)}`] : []));
      if (kinds.length === 1) label = `Upkeep: ${kinds[0]}`;
      else { label = `Upkeep: ${plural(n, 'stand')}`; if (kinds.length) title = kinds.join(', '); }
    }
    if (row === 'marketing' && n) title = `With ${plural(n, 'free sample')}: their cups and lemonade`;
    if (row === 'wages' && n) label = `Wages: ${plural(n, 'guard')}`;
    if (row === 'stock') title = 'Supplies bought less supplies used: what stays on hand counts in Net Worth';
    if (row === 'other' && t.others?.length) title = t.others.join('. ');
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
