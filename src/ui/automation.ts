// Automation in the clay HUD (spec: Automation): Auto-Restock's switch and stock target and Auto-Price's switch on
// the Morning Prep dock, a ticket per helper with the day's automatic spending (what they bought at dawn and will
// buy at Open) or what they set, and each helper's one-line report in the Ledger. Mounted from hud.ts.
import {
  AUTO_PRICE, AUTO_PRICE_RANK, autoRepairReserve, autoRepairs, currentHp, helperLines, isWrecked, owedCups, playerStands, PLOTS, prepPreview, priceNote,
  pricingOn, restockOpen, stock, stockCapCups, stockTarget, suggestedTarget, type DayStats, type GameState,
} from '../sim/economy.ts';
import { btn, esc, tape } from './recipes.ts';
import * as A from './clay.ts';

const money = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Each helper's own prop, drawn once so the markup stays the same between frames. */
const HELPER_ART: Record<string, () => string> = {
  restock: A.crateSVG, price: A.tagSVG, repair: A.hammerSVG, bulk: A.moneyBagSVG, policies: A.mapSVG,
  warehouse: A.shedSVG, defend: A.shieldSVG, templates: A.raidSVG,
};
const drawn = new Map<string, string>();
const helperArt = (id: string) => { let v = drawn.get(id); if (v === undefined) { v = (HELPER_ART[id] ?? A.crateSVG)(); drawn.set(id, v); } return v; };

/** The dock's Auto-Restock, from Day 2: the stand's switch and, while it's on, its stock target in cups. */
export function restockControl(s: GameState, plotId: string): string {
  const st = s.plots[plotId]?.stand;
  if (!st || !restockOpen(s)) return ''; // hidden till it comes (Day 2, lessons on or off: automation.ts)
  const on = st.autoRestock;
  const sw = `<button class="cl-auto${on ? ' on' : ''}" data-action="restock" data-testid="auto-restock" aria-pressed="${on}" title="${on
    ? 'Auto-Restock: Lottie stocks this stand every dawn. Tap to buy your own' : 'Auto-Restock is off here. Tap and Lottie stocks it every dawn'}">${tape(on ? `Auto ${A.glyph('check')}` : 'Auto')}</button>`;
  if (!on) return sw;
  const own = st.stockTarget !== null && st.stockTarget !== undefined;
  const suggested = suggestedTarget(s, plotId);
  const target = own ? stockTarget(s, plotId) : suggested;
  const cap = stockCapCups(st.level);
  const owed = owedCups(s, plotId); // a Local Order pours from this stand's stock at 7 pm
  const why = owed ? `the day's expected sales and ${owed.toLocaleString('en-US')} cups owed to orders` : "the day's expected sales";
  const tip = `Lottie fills this stand to ${target} cups at dawn, at the day's prices. Suggested: ${suggested}, ${why}. It holds ${cap.toLocaleString('en-US')}`;
  return `<span class="cl-acts" title="${esc(tip)}">${sw}${btn('stockTarget', '−', target > 0 ? { ok: true } : { ok: false, why: 'Nothing to stock' }, 'data-delta="-1" aria-label="Lower the stock target"', 'tiny ghost')}<span class="cl-note" data-testid="stock-target">${target.toLocaleString('en-US')} cups</span>${btn('stockTarget', '+', target < cap ? { ok: true } : { ok: false, why: 'The stand is full at that' }, 'data-delta="1" aria-label="Raise the stock target"', 'tiny ghost')}${own ? btn('stockTarget', 'Suggested', { ok: true }, `data-delta="0" title="Back to ${suggested} cups"`, 'tiny ghost') : ''}</span>`;
}

/** The price tag's Auto-Price switch, from Rank 3: Marisol sets this stand's price, card and Sweetness each dawn. */
export function priceSwitch(s: GameState, plotId: string): string {
  const st = s.plots[plotId]?.stand;
  if (!st || s.rank < AUTO_PRICE_RANK) return '';
  const on = pricingOn(s, st);
  const tip = !on ? 'Auto-Price is off: you price this stand. Tap and Marisol takes it over each dawn'
    : st.ownCard ? 'Auto-Price: Marisol prices your card at the top. Change the price and she lets go'
    : 'Auto-Price: each dawn Marisol picks the card and Sweetness for the forecast and prices it at the top. Set it by hand and she lets go';
  return `<button class="cl-auto${on ? ' on' : ''}" data-action="autoPrice" data-testid="auto-price" aria-pressed="${on}" title="${esc(tip)}">${tape(on ? `Auto ${A.glyph('check')}` : 'Auto')}</button>`;
}

// The preview works out each stand's restock, so it's redone only when something it reads changes.
let memo: { key: string; out: string[] } | null = null;
function previewKey(s: GameState): string {
  const k: (string | number)[] = [s.day, s.phase, s.cash, s.rank, s.selected, s.forecast.kind, s.forecast.temp, s.reputation, s.brandTier, JSON.stringify(s.today.auto ?? {})];
  for (const p of playerStands(s)) {
    const st = s.plots[p.id].stand!;
    k.push(p.id, st.level, st.recipe, st.sweetness, st.price, st.autoRestock ? 1 : 0, st.stockTarget ?? -1, st.autoPrice === false ? 0 : 1, st.ownCard ? 1 : 0,
      st.wrecked ? 1 : 0, stock(st, 'lemons'), st.inventory.sugar, st.inventory.ice, Object.keys(st.campaigns).join());
  }
  for (const p of PLOTS) { // Auto-Repair's closing bill: each building's HP, a fall, what's booked and the plots it looks after (skips and Fortify)
    const ps = s.plots[p.id];
    if (ps.owner === 'player' && (ps.stand || ps.facility)) k.push(p.id, currentHp(ps), isWrecked(ps) ? 1 : 0, ps.repair?.cost ?? 0, autoRepairs(s, p.id) ? 1 : 0);
  }
  k.push(autoRepairReserve(s)); // and the wages and loan payment it keeps back
  return k.join('|');
}

/** Morning Prep's preview: a ticket per helper at work today, with what it spent so far and will spend later (at Open,
 * or at closing for Auto-Repair), or what it set. */
export function autoTickets(s: GameState): string[] {
  if (s.phase !== 'prep') return [];
  const key = previewKey(s);
  if (memo?.key === key) return memo.out;
  const out = prepPreview(s).map((p) => {
    if (p.id === AUTO_PRICE) { // nothing spent: what Marisol set, for the stand you're managing
      const note = priceNote(s, s.selected);
      return `<div class="cl-ticket" data-testid="auto-${p.id}" title="${esc(`${p.name}: ${p.line}`)}">${helperArt(p.id)}<b>${esc(p.name)}: ${esc(p.line)}</b>${note ? `<span class="cl-note">${esc(note)}</span>` : ''}</div>`;
    }
    const more = p.pending > 0 ? `+${money(p.pending)} at ${p.at}` : '';
    const note = [p.count ? `${p.count} stand${p.count === 1 ? '' : 's'}` : '', more].filter(Boolean).join(' · ');
    // Its own report (a helper may have worked at dawn or since: a policy set at Prep, a target raised), then the money.
    const later = p.at === 'Open' ? 'when the stands open' : `at ${p.at}`;
    const tip = `${p.name}: ${p.line ? `${p.line}, ` : ''}${money(p.spent)} so far today${more ? `; ${money(p.pending)} more ${later}` : ''}`;
    return `<div class="cl-ticket" data-testid="auto-${p.id}" title="${esc(tip)}">${helperArt(p.id)}<b>${esc(p.name)}: ${money(p.spent)}</b>${note ? `<span class="cl-note">${note}</span>` : ''}</div>`;
  });
  memo = { key, out };
  return out;
}

/** The Ledger's one-line reports, one row per helper that worked that day. */
export function helperRows(t: DayStats): string {
  return helperLines(t).map((h) => `<tr data-testid="ledger-${h.id}"><td>${esc(h.name)}: ${esc(h.line)}</td><td>${money(h.spent)}</td></tr>`).join('');
}
