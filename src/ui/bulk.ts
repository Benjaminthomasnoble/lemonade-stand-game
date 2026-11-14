// Bulk orders on the Grow tab (spec: Helpers that keep a big empire calm: "Bulk actions | Rank 3 | Group orders, such
// as 'upgrade every Kiosk I can afford' | The group and the budget"; src/sim/policies.ts). From Rank 3 a row of chips
// picks the job (a level up, or the next fence) and the group, and a card shows the order in words, what it buys
// within the budget, the budget's - and + and Go. Clicks go through the HUD's one listener: data-action="bulkPick"
// changes a choice here, data-action="bulk" sends the order (main.ts runs it). Mounted from hud.ts's Grow sheet;
// plain controls, the UI thread styles them.
import {
  bulkGroups, bulkMembers, bulkOn, bulkPlan, DISTRICT_BY_ID, STAND_LEVELS, STAND_RANK_GATE, type Blocker, type BulkAct, type BulkGroup,
  type BulkOrder, type DistrictId, type GameState,
} from '../sim/economy.ts';
import type { Action } from './hud.ts';

/** The parts of the HUD's clay kit the bulk card draws with. */
export interface BulkKit {
  ART: { stand: (level: number) => string; fence: (tier: number) => string };
  btn: (action: string, label: string, b?: Blocker, extra?: string, cls?: string) => string;
  card: (art: string, title: string, sub: string, action: string, tip?: string, extra?: string) => string;
  esc: (t: string) => string;
  whole: (n: number) => string;
}

/** The budget's steps; past the last one under your cash it's all of it ("every Kiosk I can afford"). */
const BUDGETS = [500, 1000, 2500, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000, 2500000, 5000000, 10000000, 25000000, 50000000];
let pick: BulkOrder = { act: 'upgrade', group: 'all', budget: Infinity };

/** A tap on one of the card's choices: the job, the group or the budget. */
export function pickBulk(d: DOMStringMap): void {
  if (d.act === 'upgrade' || d.act === 'fence') pick = { ...pick, act: d.act };
  if (d.group) pick = { ...pick, group: d.group as BulkGroup };
  if (d.budget) pick = { ...pick, budget: Number(d.budget) };
}

/** Go: the order as the card shows it. */
export function bulkAction(d: DOMStringMap): Action {
  return { type: 'bulk', order: { act: d.act === 'fence' ? 'fence' : 'upgrade', group: d.group as BulkGroup, budget: Number(d.budget) } };
}

const levelName = (l: number) => STAND_LEVELS[l - 1].name.replace(/^The /, '');
const levelOf = (g: BulkGroup) => (g.startsWith('level:') ? Number(g.slice(6)) : 0);
const districtOf = (g: BulkGroup) => (g.startsWith('district:') ? DISTRICT_BY_ID[g.slice(9) as DistrictId]?.name ?? '' : '');

/** A chip's name: All, Kiosks, Old Town, No fence. */
function chipName(g: BulkGroup): string {
  if (g === 'all') return 'All';
  if (g === 'unfenced') return 'No fence';
  return levelOf(g) ? `${levelName(levelOf(g))}s` : districtOf(g);
}

/** The order in words: "Upgrade every Kiosk", "Fence every plot in Old Town". */
export function orderText(o: BulkOrder): string {
  const what = o.act === 'upgrade' ? 'stand' : 'plot';
  const who = o.group === 'all' ? `every ${what}` : o.group === 'unfenced' ? 'every bare plot'
    : levelOf(o.group) ? `every ${levelName(levelOf(o.group))}` : `every ${what} in ${districtOf(o.group)}`;
  return `${o.act === 'upgrade' ? 'Upgrade' : 'Fence'} ${who}`;
}

/** The groups shown for a job: for upgrades, no level that's at the top or whose next one your rank hasn't opened. */
function shownGroups(s: GameState, act: BulkAct): BulkGroup[] {
  return bulkGroups(s, act).filter((g) => act !== 'upgrade' || !levelOf(g) || (STAND_LEVELS[levelOf(g)] && s.rank >= STAND_RANK_GATE[levelOf(g)]));
}

/** The budget a step down or up: the steps under your cash, then all of it. Null: no further. */
function budgetStep(budget: number, cash: number, dir: 1 | -1): number | null {
  const steps = [...BUDGETS.filter((b) => b < cash), Infinity];
  let i = steps.findIndex((b) => b >= budget);
  if (i < 0) i = steps.length - 1;
  const j = steps[i] === budget ? i + dir : dir > 0 ? i : i - 1;
  return j >= 0 && j < steps.length ? steps[j] : null;
}

/** The Grow tab's bulk order, from Rank 3: the chips for the job and the group, then the order's card. */
export function bulkCards(k: BulkKit, s: GameState): string[] {
  if (!bulkOn(s)) return [];
  const acts = (['upgrade', 'fence'] as BulkAct[]).filter((a) => shownGroups(s, a).length);
  if (!acts.length) return [];
  const act = acts.includes(pick.act) ? pick.act : acts[0];
  const groups = shownGroups(s, act);
  const order: BulkOrder = { act, group: groups.includes(pick.group) ? pick.group : 'all', budget: pick.budget };
  const chip = (attr: string, label: string, on: boolean, tip: string) =>
    `<button class="cl-tab small${on ? ' on' : ''}" data-action="bulkPick" ${attr} aria-pressed="${on}" title="${k.esc(tip)}">${label}</button>`;
  const jobs = acts.map((a) => chip(`data-act="${a}" data-testid="bulk-${a}"`, a === 'upgrade' ? 'Upgrade' : 'Fence', a === act,
    a === 'upgrade' ? 'Each stand up one level' : 'Each plot its next fence')).join('');
  const which = groups.map((g) => {
    const n = bulkMembers(s, act, g).length;
    return chip(`data-group="${g}"`, chipName(g), g === order.group, `${orderText({ ...order, group: g })}: ${n} of yours`);
  }).join('');
  const picker = `<div class="cl-slots" data-testid="bulk-picks"><span class="cl-label">Bulk</span>${jobs}<span class="cl-shop">${which}</span></div>`;

  const plan = bulkPlan(s, order);
  const all = !Number.isFinite(order.budget);
  const label = all ? 'All cash' : k.whole(order.budget);
  const down = budgetStep(order.budget, s.cash, -1), up = budgetStep(order.budget, s.cash, 1);
  const stepBtn = (to: number | null, glyph: string, name: string) => k.btn('bulkPick', glyph, to === null ? { ok: false, why: name === 'Less' ? 'The smallest budget' : 'All your cash already' } : { ok: true },
    `data-budget="${to}" aria-label="${name}"${to === null ? '' : ` title="Budget: ${Number.isFinite(to) ? k.whole(to) : 'all your cash'}"`}`, 'tiny ghost');
  const budget = `${stepBtn(down, '−', 'Less')}<span class="cl-note" data-testid="bulk-budget">${label}</span>${stepBtn(up, '+', 'More')}`;
  const ok: Blocker = plan.picks.length ? { ok: true } : { ok: false, why: plan.why };
  const go = k.btn('bulk', 'Go', ok, `data-act="${order.act}" data-group="${order.group}" data-budget="${order.budget}" data-testid="bulk-go"`, 'go');
  const sub = plan.picks.length ? `${plan.picks.length} of ${plan.members} · ${k.whole(plan.cost)}` : plan.why;
  const art = act === 'fence' ? k.ART.fence(order.group === 'unfenced' ? 1 : 2) : k.ART.stand(Math.min(5, (levelOf(order.group) || 2) + 1));
  const tip = plan.picks.length
    ? `${orderText(order)}: ${plan.picks.length} of the ${plan.members} that can, cheapest first, for ${k.whole(plan.cost)}. Budget: ${all ? 'all your cash' : label}`
    : `${orderText(order)}: ${plan.why}`;
  return [picker, k.card(art, orderText(order), sub, `<span class="cl-acts">${budget}${go}</span>`, tip, 'data-testid="bulk"')];
}

/** Tests: back to the first order (upgrade every stand, all your cash). */
export function resetBulk(): void {
  pick = { act: 'upgrade', group: 'all', budget: Infinity };
}
