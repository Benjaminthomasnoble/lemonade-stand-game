// District policies in the clay HUD (spec: Automation, "District policies | Rank 7 | Profit, Fortify or Expand presets
// per district | One policy per district"; src/sim/policies.ts). From Rank 7 the Grow tab picks the policy for the
// district of the stand you manage, with Fortify's and Expand's daily budget; the Land Registry's Yours tab has the
// same chips on each district you hold land in; the plot card has each plot's switch to leave it out. Clicks go
// through the HUD's one listener (data-action="policy" and "policyPlot"). Mounted from hud.ts and registry.ts; plain
// controls, the UI thread styles them.
import {
  DISTRICT_BY_ID, districtPolicy, PLOT_BY_ID, policyOn, POLICY_KINDS, POLICY_NAMES, type DistrictId, type DistrictPolicy, type GameState,
  type PolicyKind,
} from '../sim/economy.ts';
import type { Action } from './hud.ts';
import type { BulkKit } from './bulk.ts';
import { btn, esc, whole } from './recipes.ts';

/** What each preset steers, in a few words, and in full for the tooltip. */
const WHAT: Record<PolicyKind, string> = { profit: 'Auto-Price and Auto-Restock', fortify: 'Fences, repairs and Dex', expand: 'Land and upgrades' };
const TIP: Record<PolicyKind, string> = {
  profit: "Every dawn Marisol prices each stand here and Lottie stocks it to the day's sales",
  fortify: 'Every dawn Auto-Repair looks after each plot here, Dex guards them first and the next fences go up, within the budget',
  expand: 'Every dawn, within the budget, cheapest first: stands up a level, Tables on your empty plots, and open land with a Table',
};
/** The daily budget's steps. */
const STEPS = [5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000, 2500000, 5000000];

/** Off, Profit, Fortify, Expand for one district; `ids` gives each chip its test id (the Grow tab's). */
function chips(s: GameState, d: DistrictId, ids: boolean): string {
  const name = DISTRICT_BY_ID[d].name, pol = districtPolicy(s, d);
  return [null, ...POLICY_KINDS].map((kind) => {
    const on = (pol?.kind ?? null) === kind;
    const tip = kind ? `${name}: ${POLICY_NAMES[kind]}. ${TIP[kind]}` : `${name}: no policy`;
    return `<button class="cl-tab small${on ? ' on' : ''}" data-action="policy" data-district="${d}" data-kind="${kind ?? ''}"${ids ? ` data-testid="policy-${kind ?? 'off'}"` : ''} aria-pressed="${on}" title="${esc(tip)}">${kind ? POLICY_NAMES[kind] : 'Off'}</button>`;
  }).join('');
}

/** Fortify's and Expand's daily budget: − the amount +. */
function stepper(d: DistrictId, pol: DistrictPolicy, ids: boolean): string {
  const down = [...STEPS].reverse().find((b) => b < pol.budget) ?? null, up = STEPS.find((b) => b > pol.budget) ?? null;
  const step = (to: number | null, glyph: string, label: string) => btn('policy', glyph, to === null ? { ok: false, why: label === 'Less' ? 'The smallest budget' : 'The biggest budget' } : { ok: true },
    `data-district="${d}" data-kind="${pol.kind}" data-budget="${to}" aria-label="${label}"${to === null ? '' : ` title="${whole(to)} a day"`}`, 'tiny ghost');
  return `${step(down, '−', 'Less')}<span class="cl-note"${ids ? ' data-testid="policy-budget"' : ''}>${whole(pol.budget)}</span>${step(up, '+', 'More')}`;
}

/** The Grow tab's policy row for the district of the stand you manage, and its card once one is set. */
export function policyCards(k: BulkKit, s: GameState): string[] {
  const p = PLOT_BY_ID[s.selected];
  if (!policyOn(s) || !p || s.plots[s.selected]?.owner !== 'player') return [];
  const d = p.district, pol = districtPolicy(s, d);
  const picker = `<div class="cl-slots" data-testid="policy-picks"><span class="cl-label">Policy</span>${chips(s, d, true)}</div>`;
  if (!pol) return [picker];
  const art = pol.kind === 'fortify' ? k.ART.fence(3) : k.ART.stand(pol.kind === 'expand' ? 2 : 3);
  const title = `${DISTRICT_BY_ID[d].name}: ${POLICY_NAMES[pol.kind]}`;
  if (pol.kind === 'profit') return [picker, k.card(art, title, WHAT.profit, '', TIP.profit, 'data-testid="policy"')];
  return [picker, k.card(art, title, `${WHAT[pol.kind]} · ${whole(pol.budget)} a day`, `<span class="cl-acts">${stepper(d, pol, true)}</span>`, TIP[pol.kind], 'data-testid="policy"')];
}

/** The Land Registry's Yours tab, under each district you hold land in: its policy chips and budget. */
export function policyRow(s: GameState, d: DistrictId): string {
  if (!policyOn(s)) return '';
  const pol = districtPolicy(s, d);
  const budget = pol && pol.kind !== 'profit' ? ` ${stepper(d, pol, false)}` : '';
  return `<tr data-testid="registry-policy"><td>Policy</td><td>${chips(s, d, false)}${budget}</td></tr>`;
}

/** The plot card's switch: this plot of yours follows its district's policy, or is left out of it. */
export function policyToggle(s: GameState, plotId: string): string {
  const ps = s.plots[plotId];
  const d = PLOT_BY_ID[plotId]?.district;
  const pol = d ? districtPolicy(s, d) : null;
  if (ps?.owner !== 'player' || !pol) return '';
  const on = !ps.noPolicy, name = POLICY_NAMES[pol.kind], where = DISTRICT_BY_ID[d!].name;
  const tip = on ? `${where}'s ${name} policy looks after this plot. Tap to leave it out` : `Left out of ${where}'s ${name} policy. Tap to take it back in`;
  return `<button class="cl-toggle${on ? ' on' : ''}" data-action="policyPlot" data-plot="${plotId}" data-testid="policy-plot" aria-pressed="${on}" title="${esc(tip)}"><i></i>${name} policy</button>`;
}

/** A policy chip, a budget step or a plot's switch, read off the clicked button. */
export function policyAction(d: DOMStringMap): Action {
  if (d.action === 'policyPlot') return { type: 'policyPlot', plot: d.plot! };
  return { type: 'policy', district: d.district as DistrictId, kind: (d.kind || null) as PolicyKind | null, ...(d.budget ? { budget: Number(d.budget) } : {}) };
}
