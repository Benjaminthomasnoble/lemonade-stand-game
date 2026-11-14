// The Ledger on screen (spec: The Ledger): the day's profit-and-loss rows, losses in red ink, Profit, then what went
// into land, stock and loans and the day's change in cash; and the Success Score charted across the whole run, with
// its rank-ups and peak. The rows mount in the evening books (hud.ts), the chart in the Ledger menu (menus.ts).
import { dayCash, dayProfit, ledgerLines, RANKS, type DayStats, type GameState, type LedgerLine } from '../sim/economy.ts';

const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const money = (n: number) => (n < -0.004 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ink = (n: number) => (n < -0.004 ? 'bad' : n > 0.004 ? 'good' : '');
const whole = (n: number) => Math.round(n).toLocaleString('en-US');

const tr = (l: LedgerLine) => `<tr data-testid="row-${l.row}"${l.title ? ` title="${esc(l.title)}"` : ''}><td>${esc(l.label)}</td><td class="${ink(l.amount)}">${money(l.amount)}</td></tr>`;

/** The day's books: each row with its count and unit price, Profit, then Invested, Into stock, Loans and the cash. */
export function booksRows(t: DayStats): string {
  const { pnl, below } = ledgerLines(t);
  const profit = dayProfit(t);
  const cash = t.books ? `<tr data-testid="row-cash" title="Profit, plus the rows under it"><td>Cash</td><td class="${ink(dayCash(t))}">${money(dayCash(t))}</td></tr>` : '';
  return `${pnl.map(tr).join('')}<tr data-testid="row-profit"><td><b>Profit</b></td><td class="${ink(profit)}"><b>${money(profit)}</b></td></tr>${below.map(tr).join('')}${below.length ? cash : ''}`;
}

/** The Success Score at each day's close, Day 1 to today: a dot where a rank came, a star at the peak. */
export function scoreLine(s: GameState): string {
  const log = (s.scores ?? []).map((v, i) => ({ day: i + 1, v })).filter((p): p is { day: number; v: number } => p.v !== null);
  if (!log.length) return '';
  const W = 300, H = 70;
  const first = log[0].day, last = log[log.length - 1].day, span = Math.max(1, last - first);
  const top = Math.max(1, ...log.map((p) => p.v));
  const x = (day: number) => (log.length === 1 ? W / 2 : 4 + ((day - first) / span) * (W - 8));
  const y = (v: number) => H - 3 - (v / top) * (H - 8);
  const pts = log.map((p) => `${x(p.day).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const marks: string[] = [];
  for (const r of RANKS.slice(1)) {
    const hit = log.find((p) => p.v >= r.ss);
    if (hit) marks.push(`<circle cx="${x(hit.day).toFixed(1)}" cy="${y(hit.v).toFixed(1)}" r="3.2" class="cl-dot-rank"><title>Day ${hit.day}: ${esc(r.title)}</title></circle>`);
  }
  const peak = log.reduce((a, p) => (p.v > a.v ? p : a), log[0]);
  marks.push(`<circle cx="${x(peak.day).toFixed(1)}" cy="${y(peak.v).toFixed(1)}" r="3.6" class="cl-dot-peak"><title>Peak, day ${peak.day}: ${whole(peak.v)}</title></circle>`);
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Success Score each day" data-testid="score-chart" class="cl-chart"><polyline points="${pts}" class="cl-line"><title>Day ${first} to ${last}</title></polyline>${marks.join('')}</svg>`;
}
