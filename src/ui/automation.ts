// Automation in the clay HUD (spec: Automation): Auto-Restock's switch and stock target on the Morning Prep dock,
// a ticket with the day's automatic spending (what the helpers bought at dawn and will buy at Open), and each
// helper's one-line report in the Ledger. Mounted from hud.ts.
import {
  AUTO_RESTOCK_DAY, helperLines, playerStands, prepPreview, stock, stockCapCups, stockTarget, suggestedTarget,
  type DayStats, type GameState,
} from '../sim/economy.ts';
import { btn, esc, tape } from './recipes.ts';
import * as A from './clay.ts';

const money = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
let crate: string | null = null; // drawn once: the markup stays the same between frames
const crateArt = () => (crate ??= A.crateSVG());

/** The dock's Auto-Restock, from Day 3: the stand's switch and, while it's on, its stock target in cups. */
export function restockControl(s: GameState, plotId: string): string {
  const st = s.plots[plotId]?.stand;
  if (!st || s.day < AUTO_RESTOCK_DAY) return '';
  const on = st.autoRestock;
  const sw = `<button class="cl-auto${on ? ' on' : ''}" data-action="restock" data-testid="auto-restock" aria-pressed="${on}" title="${on
    ? 'Auto-Restock: Lottie stocks this stand every dawn. Tap to buy your own' : 'Auto-Restock is off here. Tap and Lottie stocks it every dawn'}">${tape(on ? 'Auto ✓' : 'Auto')}</button>`;
  if (!on) return sw;
  const own = st.stockTarget !== null && st.stockTarget !== undefined;
  const suggested = suggestedTarget(s, plotId);
  const target = own ? stockTarget(s, plotId) : suggested;
  const cap = stockCapCups(st.level);
  const tip = `Lottie fills this stand to ${target} cups at dawn, at the day's prices. Suggested: ${suggested}, the day's expected sales. It holds ${cap.toLocaleString('en-US')}`;
  return `<span class="cl-acts" title="${esc(tip)}">${sw}${btn('stockTarget', '−', target > 0 ? { ok: true } : { ok: false, why: 'Nothing to stock' }, 'data-delta="-1" aria-label="Lower the stock target"', 'tiny ghost')}<span class="cl-note" data-testid="stock-target">${target.toLocaleString('en-US')} cups</span>${btn('stockTarget', '+', target < cap ? { ok: true } : { ok: false, why: 'The stand is full at that' }, 'data-delta="1" aria-label="Raise the stock target"', 'tiny ghost')}${own ? btn('stockTarget', 'Suggested', { ok: true }, `data-delta="0" title="Back to ${suggested} cups"`, 'tiny ghost') : ''}</span>`;
}

// The preview works out each stand's restock, so it's redone only when something it reads changes.
let memo: { key: string; out: string[] } | null = null;
function previewKey(s: GameState): string {
  const k: (string | number)[] = [s.day, s.phase, s.cash, s.forecast.kind, s.forecast.temp, s.reputation, s.brandTier, JSON.stringify(s.today.auto ?? {})];
  for (const p of playerStands(s)) {
    const st = s.plots[p.id].stand!;
    k.push(p.id, st.level, st.recipe, st.sweetness, st.price, st.autoRestock ? 1 : 0, st.stockTarget ?? -1, st.wrecked ? 1 : 0,
      stock(st, 'lemons'), st.inventory.sugar, st.inventory.ice, Object.keys(st.campaigns).join());
  }
  return k.join('|');
}

/** Morning Prep's preview of the day's automatic spending: a ticket per helper at work today. */
export function autoTickets(s: GameState): string[] {
  if (s.phase !== 'prep') return [];
  const key = previewKey(s);
  if (memo?.key === key) return memo.out;
  const out = prepPreview(s).map((p) => {
    const more = p.pending > 0 ? `+${money(p.pending)} at Open` : '';
    const note = [p.count ? `${p.count} stand${p.count === 1 ? '' : 's'}` : '', more].filter(Boolean).join(' · ');
    const tip = `${p.name} spent ${money(p.spent)} at dawn${more ? `, and buys ${money(p.pending)} more when the stands open` : ''}`;
    return `<div class="cl-ticket" data-testid="auto-${p.id}" title="${esc(tip)}">${crateArt()}<b>${esc(p.name)}: ${money(p.spent)}</b>${note ? `<span class="cl-note">${note}</span>` : ''}</div>`;
  });
  memo = { key, out };
  return out;
}

/** The Ledger's one-line reports, one row per helper that worked that day. */
export function helperRows(t: DayStats): string {
  return helperLines(t).map((h) => `<tr data-testid="ledger-${h.id}"><td>${esc(h.name)}: ${esc(h.line)}</td><td>${money(h.spent)}</td></tr>`).join('');
}
