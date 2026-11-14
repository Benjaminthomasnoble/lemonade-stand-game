// Group orders and the buildings that run a district for you (spec: Helpers that keep a big empire calm): bulk
// actions (Rank 3). Pure functions over GameState, like the rest of the sim.
//
// Bulk actions: "Group orders, such as 'upgrade every Kiosk I can afford'. You still decide: the group and the
// budget." You pick what to do (a stand up a level, or the next fence on a plot), the group (every building of
// yours, every stand of one level, everything of yours in one district, or every plot of yours with no fence) and a
// budget. The order then runs that action on every member it can, cheapest first (on a tie, the stand that made the
// most on its last full day, or the plot with the most sunk into it), as far as the budget and your cash go. Each
// action keeps its own checks: its rank gate, its hours (no upgrades at night, no fences while the stands are open)
// and its price.
import { BULK_RANK, PERIMETERS, RANKS, STAND_LEVELS } from './balance.ts';
import { mapDistricts, PLOT_BY_ID, PLOTS, type DistrictId } from './map.ts';
import type { Blocker, GameState, PlotState } from './economy.ts';
import { canUpgradeStand, upgradeStand } from './economy.ts';
import { buyPerimeter, canBuyPerimeter } from './crew.ts';
import { bookHelper, registerHelper } from './automation.ts';

const round2 = (n: number) => Math.round(n * 100) / 100;
const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

// ---------- bulk actions ----------

/** Bulk orders' id in the automation frame (automation.ts): the day's record and its Ledger line. */
export const BULK = 'bulk';
export const bulkOn = (s: GameState) => s.rank >= BULK_RANK;

/** What a bulk order does to each member: a stand up one level, or a plot's next fence. */
export type BulkAct = 'upgrade' | 'fence';
/** Who it does it to: every building of yours, every plot of yours with no fence, every stand of one level
 * (`level:3`, the Kiosks) or everything of yours in one district (`district:maple`). */
export type BulkGroup = 'all' | 'unfenced' | `level:${number}` | `district:${DistrictId}`;
export interface BulkOrder { act: BulkAct; group: BulkGroup; budget: number }
export interface BulkPick { plot: string; cost: number }
/** What an order would buy now: the picks in the order they're bought, their cost, how many members could take the
 * action at all (cash aside), and why nothing would be bought. */
export interface BulkPlan { picks: BulkPick[]; cost: number; members: number; why: string }

/** A plot of yours with something standing on it to upgrade or fence: a stand, or a facility (Wrecked ones too). */
const building = (ps: PlotState | undefined) => ps?.owner === 'player' && !!(ps.stand || ps.facility);

function inGroup(s: GameState, plotId: string, g: BulkGroup): boolean {
  const ps = s.plots[plotId];
  if (!building(ps)) return false;
  if (g === 'all') return true;
  if (g === 'unfenced') return ps.defense.tier === 0;
  const [kind, v] = g.split(':');
  if (kind === 'level') return ps.stand?.level === Number(v);
  return kind === 'district' && PLOT_BY_ID[plotId].district === v;
}

/** The members of a group that the action could reach: an upgrade needs a stand, a fence any building. */
export function bulkMembers(s: GameState, act: BulkAct, g: BulkGroup): string[] {
  return PLOTS.filter((p) => inGroup(s, p.id, g) && (act === 'fence' || !!s.plots[p.id].stand)).map((p) => p.id);
}

/** The groups an action can be ordered for now: every building, then each level and each district where you have
 * one, then (for fences) the plots with none. Each holds at least one member. */
export function bulkGroups(s: GameState, act: BulkAct): BulkGroup[] {
  const levels = new Set<number>(), districts = new Set<DistrictId>();
  let bare = false;
  for (const p of PLOTS) {
    const ps = s.plots[p.id];
    if (!building(ps) || (act === 'upgrade' && !ps.stand)) continue;
    if (ps.stand) levels.add(ps.stand.level);
    districts.add(p.district);
    if (!ps.defense.tier) bare = true;
  }
  if (!districts.size) return [];
  const out: BulkGroup[] = ['all'];
  for (const l of [...levels].sort((a, b) => a - b)) out.push(`level:${l}`);
  for (const d of mapDistricts(s)) if (districts.has(d.id)) out.push(`district:${d.id}`);
  if (act === 'fence' && bare) out.push('unfenced');
  return out;
}

/** A member's price for the action: its next level, or its next fence (null: it has none to go). */
function stepCost(ps: PlotState, act: BulkAct): number | null {
  if (act === 'upgrade') return ps.stand ? STAND_LEVELS[ps.stand.level]?.cost ?? null : null;
  return PERIMETERS[ps.defense.tier]?.cost ?? null;
}

const CHECK: Record<BulkAct, (s: GameState, plotId: string) => Blocker> = {
  upgrade: (s, id) => canUpgradeStand(s, id),
  fence: (s, id) => canBuyPerimeter(s, id),
};
const RUN: Record<BulkAct, (s: GameState, plotId: string) => boolean> = {
  upgrade: (s, id) => upgradeStand(s, id, true), // one headline for the whole order
  fence: (s, id) => buyPerimeter(s, id),
};

/** The action's own check with the price left out (the plan counts the cash itself): its rank, hours and the rest. */
function checkBarCash(s: GameState, act: BulkAct, plotId: string): Blocker {
  const cash = s.cash;
  s.cash = Number.MAX_SAFE_INTEGER;
  try { return CHECK[act](s, plotId); } finally { s.cash = cash; }
}

/** What the order buys right now, cheapest first (best payback on a tie), within its budget and your cash. Changes nothing. */
export function bulkPlan(s: GameState, o: BulkOrder): BulkPlan {
  const none = (why: string, members = 0): BulkPlan => ({ picks: [], cost: 0, members, why });
  if (!bulkOn(s)) return none(`Needs Rank ${BULK_RANK}, ${RANKS[BULK_RANK - 1].title}`);
  const group = bulkMembers(s, o.act, o.group);
  if (!group.length) return none(o.act === 'upgrade' ? 'No stands in this group' : 'Nothing to fence in this group');
  const able: { plot: string; cost: number; worth: number }[] = [];
  let blocked = '';
  for (const id of group) {
    const ps = s.plots[id];
    const cost = stepCost(ps, o.act);
    const b = checkBarCash(s, o.act, id);
    if (cost === null || !b.ok) { blocked ||= b.ok ? 'Nothing left to buy' : b.why; continue; }
    // Payback on a tie: the stand that made the most on its last full day, or the plot with the most in it.
    able.push({ plot: id, cost, worth: o.act === 'upgrade' ? ps.stand!.lastProfit ?? 0 : ps.invested });
  }
  if (!able.length) return none(blocked);
  able.sort((a, b) => a.cost - b.cost || b.worth - a.worth); // stable: the map's order last
  let left = Math.min(Math.max(0, o.budget), s.cash);
  const picks: BulkPick[] = [];
  for (const a of able) {
    if (a.cost > left + 1e-9) continue;
    picks.push({ plot: a.plot, cost: a.cost });
    left -= a.cost;
  }
  const cost = round2(picks.reduce((n, p) => n + p.cost, 0));
  return { picks, cost, members: able.length, why: picks.length ? '' : `Needs ${money(able[0].cost)}` };
}

/** Run the order: each pick through the action itself (its own checks again), one headline, and its line on the
 * day's Ledger. Returns how many it did. */
export function runBulk(s: GameState, o: BulkOrder): number {
  const plan = bulkPlan(s, o);
  const before = s.cash;
  let done = 0;
  for (const p of plan.picks) if (RUN[o.act](s, p.plot)) done++;
  if (!done) return 0;
  const spent = round2(before - s.cash);
  const cur = s.today.auto?.[BULK];
  bookHelper(s, BULK, spent, { count: (cur?.count ?? 0) + done, amount: (cur?.amount ?? 0) + 1 });
  const what = o.act === 'upgrade' ? `${done} stand${done === 1 ? '' : 's'} up a level` : `${done} new fence${done === 1 ? '' : 's'}`;
  s.news.push(`Bulk order: ${what}, ${money(spent)}.`);
  return done;
}

registerHelper({
  id: BULK,
  name: 'Bulk orders',
  unlocked: bulkOn,
  line: (d) => `${d.amount} order${d.amount === 1 ? '' : 's'}, ${d.count} done`,
});
