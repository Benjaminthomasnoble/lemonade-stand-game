// Automation (spec: Automation; Helpers that keep a big empire calm). Every helper is a switch, a target you set
// and a one-line Ledger report; any single stand can opt out, and Morning Prep previews the day's automatic
// spending. Auto-Restock is the first (Day 3): it tops each stand up to its stock target every dawn, at that day's
// market price, within the stand's stock cap and your cash.
//
// A later helper (Auto-Repair, Dex's Auto-Defend, bulk actions) keeps its own switch and opt-out, like
// Stand.autoRestock, and registers here with registerHelper to get its dawn run, its Ledger line and its share of
// the Prep preview. A helper that spends at another hour books it with bookHelper.
import { AUTO_RESTOCK_DAY, CUPS_PER_PITCHER, SUPPLIES, type SupplyId } from './balance.ts';
import type { DayStats, GameState, Stand } from './economy.ts';
import { buySupply, expectedCups, iceMachineOn, maxPacks, pitcherNeeds, playerStands, stock, storageFor } from './economy.ts';
import { serviceLeft, stockCapCups } from './demand.ts';
import { gameOver } from './modes.ts';

/** What a helper did today: what it spent, how many stands it looked after and how much it handled (cups, for Auto-Restock). */
export interface HelperDay { spent: number; count: number; amount: number }

export interface Helper {
  id: string;
  /** Its name on the Ledger line and the Prep ticket. */
  name: string;
  unlocked(s: GameState): boolean;
  /** The dawn run, once the market and the forecast are in: the day's automatic work and what it cost. */
  atDawn?(s: GameState): HelperDay | null;
  /** What it will still spend today (Morning Prep's preview); what it spent already is in the day's record. */
  pending?(s: GameState): number;
  /** The one-line Ledger report. */
  line(d: HelperDay): string;
}

// The helpers, in the order they arrive. The list hangs off the function itself, so a module that registers
// while the sim's modules are still loading each other finds it ready.
function registry(): Helper[] {
  const r = registry as { list?: Helper[] };
  return (r.list ??= []);
}
/** Add a helper (or replace the one with its id). */
export function registerHelper(h: Helper): void {
  const list = registry();
  const i = list.findIndex((x) => x.id === h.id);
  if (i >= 0) list[i] = h; else list.push(h);
}
export function unregisterHelper(id: string): void {
  const list = registry();
  const i = list.findIndex((x) => x.id === id);
  if (i >= 0) list.splice(i, 1);
}
export const helpers = (): readonly Helper[] => registry();

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Add to a helper's line for today: spending outside its dawn run (a top-up at Open, a repair approved at night). */
export function bookHelper(s: GameState, id: string, spent: number, d: Partial<Omit<HelperDay, 'spent'>> = {}): void {
  if (spent <= 0 && !d.count) return;
  const book = (s.today.auto ??= {});
  const cur = book[id] ?? { spent: 0, count: 0, amount: 0 };
  book[id] = { spent: round2(cur.spent + spent), count: d.count ?? cur.count, amount: d.amount ?? cur.amount };
}

/** Every unlocked helper's dawn run (the last thing at dawn: after the market, the forecast and the night's bills). */
export function automationAtDawn(s: GameState): void {
  if (gameOver(s)) return;
  for (const h of helpers()) {
    if (!h.unlocked(s) || !h.atDawn) continue;
    const d = h.atDawn(s);
    if (d) bookHelper(s, h.id, d.spent, { count: d.count, amount: d.amount });
  }
}

/** The Ledger's one-line reports for a day. */
export function helperLines(t: DayStats): { id: string; name: string; line: string; spent: number }[] {
  const out: { id: string; name: string; line: string; spent: number }[] = [];
  for (const h of helpers()) {
    const d = t.auto?.[h.id];
    if (d) out.push({ id: h.id, name: h.name, line: h.line(d), spent: d.spent });
  }
  return out;
}

/** Morning Prep's preview: per helper at work today, what it spent at dawn and what it will spend at Open. */
export function prepPreview(s: GameState): { id: string; name: string; count: number; spent: number; pending: number }[] {
  const out: { id: string; name: string; count: number; spent: number; pending: number }[] = [];
  for (const h of helpers()) {
    if (!h.unlocked(s)) continue;
    const d = s.today.auto?.[h.id];
    const pending = h.pending ? round2(h.pending(s)) : 0;
    if (d || pending > 0) out.push({ id: h.id, name: h.name, count: d?.count ?? 0, spent: d?.spent ?? 0, pending });
  }
  return out;
}

// ---------- Auto-Restock ----------

export const AUTO_RESTOCK = 'restock';

/** Is this stand's Auto-Restock at work? Its switch is on (the default; any stand can opt out) and it's Day 3 or later. */
export const restockOn = (s: GameState, st: Stand) => st.autoRestock && s.day >= AUTO_RESTOCK_DAY;

/** The suggested target: the forecast day's expected sales, within the level's stock cap. */
export function suggestedTarget(s: GameState, plotId: string): number {
  const st = s.plots[plotId]?.stand;
  return st ? Math.min(stockCapCups(st.level), expectedCups(s, plotId, s.forecast)) : 0;
}

/** The stand's stock target in cups: the player's own if set, else the suggestion; never past the stock cap. */
export function stockTarget(s: GameState, plotId: string): number {
  const st = s.plots[plotId]?.stand;
  if (!st) return 0;
  const own = st.stockTarget;
  return own === null || own === undefined ? suggestedTarget(s, plotId) : Math.min(stockCapCups(st.level), Math.max(0, own));
}

/** A tap of the target's - or +: a thirtieth of the level's stock (10 cups at an L1, 350 at an L5). */
export const targetStep = (level: number) => stockCapCups(level) / 30;

/** What a restock fills to now: the target before the stands open, no more than the pour left once they have. */
export function restockGoal(s: GameState, plotId: string): number {
  const st = s.plots[plotId]?.stand;
  if (!st || st.wrecked) return 0;
  if (s.phase === 'prep') return stockTarget(s, plotId);
  return s.phase === 'open' ? Math.min(stockTarget(s, plotId), serviceLeft(s, plotId)) : 0;
}

export interface RestockPlan { goal: number; cups: number; packs: Record<SupplyId, number>; cost: number }

/**
 * What a restock buys: a pack at a time of whichever supply runs out first, until the stand holds its goal in cups,
 * within its storage and the cash on hand (`cash`: what's left for it). Nothing changes; autoRestock buys it.
 */
export function restockPlan(s: GameState, plotId: string, cash = s.cash): RestockPlan {
  const st = s.plots[plotId]?.stand;
  const packs: Record<SupplyId, number> = { lemons: 0, sugar: 0, ice: 0 };
  if (!st) return { goal: 0, cups: 0, packs, cost: 0 };
  const goal = restockGoal(s, plotId);
  const n = pitcherNeeds(st);
  const per: Record<SupplyId, number> = { lemons: n.lemons, sugar: n.sugar, ice: iceMachineOn(s, plotId) ? 0 : n.icePerCup }; // world: an ice machine makes its own
  const have: Record<SupplyId, number> = { lemons: stock(st, 'lemons'), sugar: st.inventory.sugar, ice: st.inventory.ice };
  const ids = Object.keys(SUPPLIES) as SupplyId[];
  // The cups each supply covers (servingsAvailable is the smallest): lemons and sugar go by the pitcher, ice by the cup.
  const covers = (id: SupplyId) => per[id] <= 0 ? Infinity
    : id === 'ice' ? Math.floor(have.ice / per.ice) : st.pitcherCups + Math.floor(have[id] / per[id]) * CUPS_PER_PITCHER;
  let cost = 0;
  for (;;) {
    let low = ids[0];
    for (const id of ids) if (covers(id) < covers(low)) low = id;
    if (covers(low) >= goal) break;
    const sp = SUPPLIES[low];
    const price = round2(sp.pack * s.market[low]);
    if (have[low] + sp.pack > storageFor(st, low) || cost + price > cash + 1e-9) break;
    have[low] += sp.pack;
    packs[low]++;
    cost = round2(cost + price);
  }
  return { goal, cups: Math.min(...ids.map(covers)), packs, cost };
}

/** Top a stand up to its goal now, at today's market prices. Returns what it spent. */
export function autoRestock(s: GameState, plotId: string): number {
  const st = s.plots[plotId]?.stand;
  if (!st) return 0;
  const plan = restockPlan(s, plotId);
  const before = s.cash;
  for (const id of Object.keys(plan.packs) as SupplyId[]) {
    const k = Math.min(plan.packs[id], maxPacks(s, st, id));
    if (k > 0) buySupply(s, id, k, st);
  }
  return round2(before - s.cash);
}

/** Auto-Restock's own top-up of one stand (switched on, a target raised): bought and put on its Ledger line. */
export function restockTopUp(s: GameState, plotId: string): number {
  const st = s.plots[plotId]?.stand;
  if (!st || s.plots[plotId].owner !== 'player' || !restockOn(s, st)) return 0;
  const spent = autoRestock(s, plotId);
  bookHelper(s, AUTO_RESTOCK, spent);
  return spent;
}

/** The stands opening: Auto-Restock tops up whatever changed since dawn (a new card, a lower price, a stand switched on). */
export function restockAtOpen(s: GameState): void {
  if (s.day < AUTO_RESTOCK_DAY) return;
  let spent = 0, count = 0, amount = 0;
  for (const p of playerStands(s)) {
    const st = s.plots[p.id].stand!;
    if (!restockOn(s, st) || st.wrecked) continue;
    count++;
    amount += stockTarget(s, p.id);
    spent += autoRestock(s, p.id);
  }
  bookHelper(s, AUTO_RESTOCK, round2(spent), count ? { count, amount } : {});
}

/** Flip a stand's Auto-Restock switch; switched on before closing, it stocks the stand straight away. */
export function toggleAutoRestock(s: GameState, plotId: string): void {
  const st = s.plots[plotId]?.stand;
  if (!st) return;
  st.autoRestock = !st.autoRestock;
  restockTopUp(s, plotId);
}

/** Set a stand's stock target in cups (null: back to the suggestion). A higher target is stocked straight away. */
export function setStockTarget(s: GameState, plotId: string, cups: number | null): void {
  const st = s.plots[plotId]?.stand;
  if (!st) return;
  st.stockTarget = cups === null ? null : Math.round(Math.min(stockCapCups(st.level), Math.max(0, cups)));
  restockTopUp(s, plotId);
}

/** Nudge the target a step down or up, landing on the step's multiples (187 goes to 190 or 180 at an L1). */
export function nudgeStockTarget(s: GameState, plotId: string, dir: 1 | -1): void {
  const st = s.plots[plotId]?.stand;
  if (!st) return;
  const step = targetStep(st.level);
  const now = stockTarget(s, plotId);
  const next = dir > 0 ? Math.floor(now / step + 1e-9) * step + step : Math.ceil(now / step - 1e-9) * step - step;
  setStockTarget(s, plotId, next);
}

registerHelper({
  id: AUTO_RESTOCK,
  name: 'Auto-Restock',
  unlocked: (s) => s.day >= AUTO_RESTOCK_DAY,
  atDawn(s) {
    if (s.day === AUTO_RESTOCK_DAY) s.news.push('Lottie: "From today I stock every stand at dawn. Set each one\'s target, or switch it off."');
    const on = playerStands(s).filter((p) => { const st = s.plots[p.id].stand!; return restockOn(s, st) && !st.wrecked; });
    if (!on.length) return null;
    // Short of cash, the stands that sell the most are stocked first.
    const goals = on.map((p) => ({ id: p.id, goal: stockTarget(s, p.id) })).sort((a, b) => b.goal - a.goal);
    let spent = 0;
    for (const g of goals) spent += autoRestock(s, g.id);
    return { spent: round2(spent), count: on.length, amount: goals.reduce((a, g) => a + g.goal, 0) };
  },
  pending(s) { // what restockAtOpen will buy, stand by stand from the same cash
    if (s.phase !== 'prep') return 0;
    let cash = s.cash, cost = 0;
    for (const p of playerStands(s)) {
      const st = s.plots[p.id].stand!;
      if (!restockOn(s, st) || st.wrecked) continue;
      const c = restockPlan(s, p.id, cash).cost;
      cash -= c;
      cost += c;
    }
    return cost;
  },
  line: (d) => (d.count ? `${d.count} stand${d.count === 1 ? '' : 's'} to ${d.amount.toLocaleString('en-US')} cups` : 'topped up'),
});
