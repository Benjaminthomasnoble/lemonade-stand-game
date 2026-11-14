// Group orders and district presets (spec: Helpers that keep a big empire calm): bulk actions (Rank 3) and district
// policies (Rank 7). Pure functions over GameState, like the rest of the sim.
//
// Bulk actions: "Group orders, such as 'upgrade every Kiosk I can afford'. You still decide: the group and the
// budget." You pick what to do (a stand up a level, or the next fence on a plot), the group (every building of
// yours, every stand of one level, everything of yours in one district, or every plot of yours with no fence) and a
// budget. The order then runs that action on every member it can, cheapest first (on a tie, the stand that made the
// most on its last full day, or the plot with the most sunk into it), as far as the budget and your cash go. Each
// action keeps its own checks: its rank gate, its hours (no upgrades at night, no fences while the stands are open)
// and its price.
//
// District policies: "Profit, Fortify or Expand presets per district. You still decide: one policy per district." The
// spec leaves the presets to the helpers they steer, so each one drives the helpers already in the game, every dawn
// before they run (land's dawn hook), and any plot can opt out:
// - Profit: Marisol's Auto-Price takes every stand there (card, Sweetness and price), and Auto-Restock stocks each to
//   the forecast's expected sales and what its orders owe, so nothing sits on the shelf.
// - Fortify: Auto-Repair looks after every plot there, Dex's Auto-Defend gives each at least POLICY.priority, and
//   the next fences go up, cheapest first, within the district's daily budget.
// - Expand: within the district's daily budget, cheapest first: stands up a level, a Folding Table on your empty
//   plots, and open land with a Table on it.
import { BULK_RANK, PERIMETERS, POLICY, RANKS, STAND_LEVELS } from './balance.ts';
import { DISTRICTS, mapDistricts, onMap, PLOT_BY_ID, PLOTS, plotType, type DistrictId } from './map.ts';
import type { Blocker, GameState, PlotState } from './economy.ts';
import { buildStand, buyPlot, canBuildStand, canBuyPlot, canUpgradeStand, plotPrice, standCost, upgradeStand } from './economy.ts';
import { buyPerimeter, canBuyPerimeter } from './crew.ts';
import { autoPrice, bookHelper, pricingOn, registerHelper, restockTopUp } from './automation.ts';
import { defendPriority, setDefendPriority } from './autodefend.ts';
import { gameOver } from './modes.ts';

const round2 = (n: number) => Math.round(n * 100) / 100;
const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** A plot of yours with something standing on it to upgrade or fence: a stand, or a facility (Wrecked ones too). */
const building = (ps: PlotState | undefined) => ps?.owner === 'player' && !!(ps.stand || ps.facility);

/** Run a check with your cash set aside (a plan counts the cash itself): what's left is its rank, hours and the rest. */
function barCash(s: GameState, check: () => Blocker): Blocker {
  const cash = s.cash;
  s.cash = Number.MAX_SAFE_INTEGER;
  try { return check(); } finally { s.cash = cash; }
}

interface Step { plot: string; cost: number; worth: number }
/** The steps a budget buys, cheapest first (the more worthwhile on a tie, then the map's order), within your cash too. */
function cheapestFirst<T extends Step>(steps: T[], budget: number, cash: number): T[] {
  let left = Math.min(Math.max(0, budget), cash);
  const out: T[] = [];
  for (const st of [...steps].sort((a, b) => a.cost - b.cost || b.worth - a.worth)) {
    if (st.cost > left + 1e-9) continue;
    out.push(st);
    left -= st.cost;
  }
  return out;
}

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

/** The plan for one action over these plots, within the budget and your cash. */
function actPlan(s: GameState, act: BulkAct, ids: string[], budget: number): BulkPlan {
  const able: Step[] = [];
  let blocked = '';
  for (const id of ids) {
    const ps = s.plots[id];
    const cost = stepCost(ps, act);
    const b = barCash(s, () => CHECK[act](s, id));
    if (cost === null || !b.ok) { blocked ||= b.ok ? 'Nothing left to buy' : b.why; continue; }
    // Payback on a tie: the stand that made the most on its last full day, or the plot with the most in it.
    able.push({ plot: id, cost, worth: act === 'upgrade' ? ps.stand!.lastProfit ?? 0 : ps.invested });
  }
  if (!able.length) return { picks: [], cost: 0, members: 0, why: blocked };
  const picks = cheapestFirst(able, budget, s.cash).map(({ plot, cost }) => ({ plot, cost }));
  const cost = round2(picks.reduce((n, p) => n + p.cost, 0));
  return { picks, cost, members: able.length, why: picks.length ? '' : `Needs ${money(Math.min(...able.map((a) => a.cost)))}` };
}

/** Buy a plan's picks through the action itself (its own checks again). Returns how many went through. */
function buyPicks(s: GameState, act: BulkAct, plan: BulkPlan): number {
  let done = 0;
  for (const p of plan.picks) if (RUN[act](s, p.plot)) done++;
  return done;
}

/** What the order buys right now, cheapest first (best payback on a tie), within its budget and your cash. Changes nothing. */
export function bulkPlan(s: GameState, o: BulkOrder): BulkPlan {
  const none = (why: string): BulkPlan => ({ picks: [], cost: 0, members: 0, why });
  if (!bulkOn(s)) return none(`Needs Rank ${BULK_RANK}, ${RANKS[BULK_RANK - 1].title}`);
  const group = bulkMembers(s, o.act, o.group);
  if (!group.length) return none(o.act === 'upgrade' ? 'No stands in this group' : 'Nothing to fence in this group');
  return actPlan(s, o.act, group, o.budget);
}

/** Run the order: each pick through the action itself, one headline, and its line on the day's Ledger. Returns how
 * many it did. */
export function runBulk(s: GameState, o: BulkOrder): number {
  const before = s.cash;
  const done = buyPicks(s, o.act, bulkPlan(s, o));
  if (!done) return 0;
  const spent = round2(before - s.cash);
  const cur = s.today.auto?.[BULK];
  bookHelper(s, BULK, spent, { count: (cur?.count ?? 0) + done, amount: (cur?.amount ?? 0) + 1 });
  const what = o.act === 'upgrade' ? `${plural(done, 'stand')} up a level` : plural(done, 'new fence');
  s.news.push(`Bulk order: ${what}, ${money(spent)}.`);
  return done;
}

registerHelper({
  id: BULK,
  name: 'Bulk orders',
  unlocked: bulkOn,
  line: (d) => `${plural(d.amount, 'order')}, ${d.count} done`,
});

// ---------- district policies ----------

/** District policies' id in the automation frame: the day's record and its Ledger line. */
export const POLICIES = 'policies';
export type PolicyKind = 'profit' | 'fortify' | 'expand';
export const POLICY_KINDS: PolicyKind[] = ['profit', 'fortify', 'expand'];
export const POLICY_NAMES: Record<PolicyKind, string> = { profit: 'Profit', fortify: 'Fortify', expand: 'Expand' };
/** A district's policy: its preset, what Fortify and Expand may spend there each day, and the last day it ran. */
export interface DistrictPolicy { kind: PolicyKind; budget: number; ran?: number }

export const policyOn = (s: GameState) => s.rank >= POLICY.rank;
export const canSetPolicy = (s: GameState): Blocker =>
  policyOn(s) ? { ok: true } : { ok: false, why: `Needs Rank ${POLICY.rank}, ${RANKS[POLICY.rank - 1].title}` };
/** The district's policy, once Rank 7 has opened them. */
export const districtPolicy = (s: GameState, d: DistrictId): DistrictPolicy | null => (policyOn(s) ? s.policies?.[d] ?? null : null);
/** Does this plot follow its district's policy? Open land does (Expand buys it); a plot of yours unless it opted out. */
export function followsPolicy(s: GameState, plotId: string): boolean {
  const ps = s.plots[plotId];
  return !!ps && !(ps.owner === 'player' && ps.noPolicy) && !!districtPolicy(s, PLOT_BY_ID[plotId].district);
}

/** Set a district's policy (null: none), and its daily budget for Fortify and Expand. At Morning Prep a new preset
 * goes to work at once, once a day per district; otherwise from the next dawn. */
export function setPolicy(s: GameState, d: DistrictId, kind: PolicyKind | null, budget?: number): boolean {
  if (!canSetPolicy(s).ok || !onMap(s, d) || (kind && !POLICY_KINDS.includes(kind))) return false;
  const all = (s.policies ??= {});
  const prev = all[d];
  if (!kind) { delete all[d]; return true; }
  const b = budget !== undefined && Number.isFinite(budget) && budget >= 0 ? Math.round(budget) : prev?.budget ?? POLICY.budget;
  all[d] = { kind, budget: b, ...(prev?.kind === kind && prev.ran !== undefined ? { ran: prev.ran } : {}) };
  if (s.phase === 'prep' && all[d]!.ran !== s.day) runPolicies(s, [d], false);
  return true;
}

/** Leave a plot of yours out of its district's policy, or take it back in. */
export function togglePolicyPlot(s: GameState, plotId: string): boolean {
  const ps = s.plots[plotId];
  if (ps?.owner !== 'player' || !policyOn(s)) return false;
  if (ps.noPolicy) delete ps.noPolicy; else ps.noPolicy = true;
  return true;
}

/** Your plots in a district that follow its policy. */
const following = (s: GameState, d: DistrictId) => PLOTS.filter((p) => p.district === d && s.plots[p.id].owner === 'player' && followsPolicy(s, p.id)).map((p) => p.id);

/** A preset's run: the plots it looked after, what it spent, its headline. */
interface Steered { steered: number; spent: number; line: string }

/** Profit: Auto-Price and Auto-Restock take every stand there, the stock target back to the forecast's sales. At
 * dawn they then run as usual; set at Morning Prep, they set a stand now. */
function profit(s: GameState, d: DistrictId, dawn: boolean): Steered {
  let steered = 0, taken = 0;
  const before = s.cash;
  for (const id of following(s, d)) {
    const st = s.plots[id].stand;
    if (!st || st.wrecked) continue;
    steered++;
    if (pricingOn(s, st) && !st.ownCard && st.autoRestock && (st.stockTarget ?? null) === null) continue;
    taken++;
    st.autoPrice = true;
    delete st.ownCard;
    st.autoRestock = true;
    st.stockTarget = null;
    if (!dawn) { autoPrice(s, id); restockTopUp(s, id); }
  }
  return { steered, spent: round2(before - s.cash), line: taken ? `${plural(taken, 'stand')} on Auto-Price and Auto-Restock` : '' };
}

/** Fortify: Auto-Repair on every plot there, Dex's priority at least POLICY.priority, and the next fences within the budget. */
function fortify(s: GameState, d: DistrictId, budget: number): Steered {
  const ids = following(s, d).filter((id) => building(s.plots[id]));
  for (const id of ids) {
    delete s.plots[id].noAutoRepair;
    if (defendPriority(s, id) < POLICY.priority) setDefendPriority(s, id, POLICY.priority);
  }
  const before = s.cash;
  const bought = buyPicks(s, 'fence', actPlan(s, 'fence', ids, budget));
  return { steered: ids.length, spent: round2(before - s.cash), line: bought ? plural(bought, 'new fence') : '' };
}

/** Plots Expand puts a stand on: streets and the like, never the lots kept for facilities (Industrial, Fields, Docks). */
const STAND_LAND = new Set(['street', 'prime', 'landmark']);

/** Expand: within the budget, cheapest first, stands up a level, a Folding Table on your empty plots, and open land
 * with a Table on it. */
function expand(s: GameState, d: DistrictId, budget: number): Steered {
  type Grow = Step & { how: 'upgrade' | 'build' | 'land' };
  const steps: Grow[] = [];
  const table = standCost(1);
  for (const p of PLOTS) {
    if (p.district !== d || !followsPolicy(s, p.id)) continue;
    const ps = s.plots[p.id];
    if (ps.owner === 'player' && ps.stand) {
      const cost = stepCost(ps, 'upgrade');
      if (cost !== null && barCash(s, () => canUpgradeStand(s, p.id)).ok) steps.push({ plot: p.id, cost, worth: ps.stand.lastProfit ?? 0, how: 'upgrade' });
    } else if (STAND_LAND.has(plotType(s, p))) {
      if (ps.owner === 'player' && barCash(s, () => canBuildStand(s, p.id, 1)).ok) steps.push({ plot: p.id, cost: table, worth: 0, how: 'build' });
      else if (!ps.owner && barCash(s, () => canBuyPlot(s, p.id)).ok) steps.push({ plot: p.id, cost: plotPrice(s, p.id) + table, worth: 0, how: 'land' });
    }
  }
  const before = s.cash;
  let ups = 0, built = 0;
  for (const st of cheapestFirst(steps, budget, s.cash)) {
    if (st.how === 'upgrade') { if (upgradeStand(s, st.plot, true)) ups++; continue; }
    if (st.how === 'land' && !buyPlot(s, st.plot, true)) continue;
    if (buildStand(s, st.plot, 1, true)) built++;
  }
  const line = [built ? plural(built, 'new stand') : '', ups ? plural(ups, 'upgrade') : ''].filter(Boolean).join(' and ');
  return { steered: following(s, d).length, spent: round2(before - s.cash), line };
}

/** Run these districts' policies now: each one's work, its headline if it bought or changed anything, and the day's
 * Ledger line. `dawn`: the morning run, before Auto-Price and Auto-Restock. */
function runPolicies(s: GameState, ds: DistrictId[], dawn: boolean): void {
  let n = 0, steered = 0, spent = 0;
  for (const d of ds) {
    const pol = districtPolicy(s, d);
    if (!pol || !onMap(s, d) || pol.ran === s.day) continue;
    pol.ran = s.day;
    const r = pol.kind === 'profit' ? profit(s, d, dawn) : pol.kind === 'fortify' ? fortify(s, d, pol.budget) : expand(s, d, pol.budget);
    n++;
    steered += r.steered;
    spent += r.spent;
    if (r.line) {
      const name = DISTRICTS.find((x) => x.id === d)!.name;
      s.news.push(`${name}, ${POLICY_NAMES[pol.kind]}: ${r.line}${pol.kind === 'profit' ? '' : `, ${money(r.spent)}`}.`);
    }
  }
  if (!n) return;
  const cur = s.today.auto?.[POLICIES];
  bookHelper(s, POLICIES, round2(spent), { count: (cur?.count ?? 0) + steered, amount: (cur?.amount ?? 0) + n }); // count: the plots looked after
}

/** Dawn (land's hook, before the helpers they steer): every district's policy goes to work. */
export function policiesAtDawn(s: GameState): void {
  if (!policyOn(s) || gameOver(s) || !s.policies) return;
  runPolicies(s, DISTRICTS.map((d) => d.id).filter((d) => s.policies![d]), true);
}

registerHelper({
  id: POLICIES,
  name: 'District policies',
  unlocked: policyOn,
  line: (d) => `${plural(d.amount, 'district')}, ${plural(d.count, 'plot')}`,
});

/** Fill in or clean up what an older or edited save carries (idempotent; migrateLand calls it on every load). */
export function migratePolicies(s: GameState): void {
  const all = s.policies as Record<string, Partial<DistrictPolicy> | undefined> | undefined;
  if (all !== undefined && (typeof all !== 'object' || all === null)) delete s.policies;
  else if (all) {
    for (const [d, p] of Object.entries(all)) {
      if (!DISTRICTS.some((x) => x.id === d) || !p || typeof p !== 'object' || !POLICY_KINDS.includes(p.kind as PolicyKind)) { delete all[d]; continue; }
      if (typeof p.budget !== 'number' || !Number.isFinite(p.budget) || p.budget < 0) p.budget = POLICY.budget;
      if (p.ran !== undefined && typeof p.ran !== 'number') delete p.ran;
    }
  }
  for (const p of PLOTS) {
    const ps = s.plots[p.id];
    if (ps && 'noPolicy' in ps && ps.noPolicy !== true) delete ps.noPolicy;
  }
}
