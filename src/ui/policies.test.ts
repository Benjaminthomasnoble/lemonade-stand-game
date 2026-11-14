import { describe, expect, it } from 'vitest';
import {
  LOTTIES_CORNER, newGame, newStand, NO_DEFENSE, PLOT_BY_ID, PLOTS, setPolicy, standCost, toggleAutoRepair, togglePolicyPlot, type DistrictId, type GameState,
} from '../sim/economy.ts';
import { autoRepairToggle } from './damage.ts';
import { btn, esc, whole } from './recipes.ts';
import type { BulkKit } from './bulk.ts';
import { policyAction, policyCards, policyToggle } from './policies.ts';
import { registryScreen } from './registry.ts';
import { autoTickets } from './automation.ts';

/** A bare clay kit: each card is its test id, title, subtitle and buttons. */
const kit: BulkKit = {
  ART: { stand: (l) => `<stand ${l}>`, fence: (t) => `<fence ${t}>` },
  btn, esc, whole,
  card: (_art, title, sub, action, tip = '', extra = '') => `<div ${extra} data-tip="${tip}"><b>${title}</b><i>${sub}</i>${action}</div>`,
};
/** Read a button's data attributes the way the HUD's listener does. */
const data = (html: string, re: RegExp): DOMStringMap => {
  const tag = html.match(re)?.[0] ?? '';
  const out: DOMStringMap = {};
  for (const m of tag.matchAll(/data-([a-z]+)="([^"]*)"/g)) out[m[1]] = m[2];
  return out;
};
const chip = (id: string) => new RegExp(`<button[^>]*data-testid="${id}"[^>]*>`);

/** Morning Prep at Rank 7, managing Lottie's Corner, with a Table on another Maple Row street. */
function tycoon(): { s: GameState; d: DistrictId; other: string } {
  const s = newGame(77);
  s.rank = 7;
  s.phase = 'report'; // set in the Evening, so nothing runs before the test reads it
  s.cash = 1e6;
  const d = PLOT_BY_ID[LOTTIES_CORNER].district;
  const p = PLOTS.find((x) => x.district === d && x.type === 'street' && !s.plots[x.id].owner)!;
  s.plots[p.id] = { ...s.plots[p.id], owner: 'player', stand: newStand(1), invested: standCost(1), defense: NO_DEFENSE() };
  return { s, d, other: p.id };
}

describe("Morning Prep's helper tickets", () => {
  it("each reads its own report and what it spent so far today: Profit set at Prep, its restock on Auto-Restock's", () => {
    const { s, d, other } = tycoon();
    s.day = 20; // the Market and Auto-Restock are open
    s.phase = 'prep';
    for (const id of [LOTTIES_CORNER, other]) Object.assign(s.plots[id].stand!, { autoRestock: false, stockTarget: 50, pitcherCups: 0, inventory: { ...s.plots[id].stand!.inventory, lemons: [], sugar: 0, ice: 0 } });
    delete s.today.auto;
    expect(setPolicy(s, d, 'profit')).toBe(true);
    const tickets = autoTickets(s);
    const title = (id: string) => tickets.find((x) => x.includes(`data-testid="auto-${id}"`))?.match(/title="([^"]*)"/)?.[1];
    expect(title('policies')).toBe('District policies: 1 district, 2 plots, $0.00 so far today');
    expect(title('restock')).toMatch(/^Auto-Restock: [^,]*, \$\d+\.\d\d so far today/);
    expect(tickets.join('')).not.toContain('at dawn');
  });
});

describe("the Grow tab's district policy", () => {
  it('waits for Rank 7', () => {
    const { s } = tycoon();
    s.rank = 6;
    expect(policyCards(kit, s)).toEqual([]);
    expect(policyToggle(s, LOTTIES_CORNER)).toBe('');
  });

  it("picks the policy for the managed stand's district, then shows what it steers", () => {
    const { s, d } = tycoon();
    let html = policyCards(kit, s).join('');
    expect(html).toContain('data-testid="policy-picks"><span class="cl-label">Policy</span>');
    expect(html.match(chip('policy-off'))![0]).toContain('cl-tab small on');
    expect(html).not.toContain('data-testid="policy"'); // no card until one is set
    const pick = policyAction(data(html, chip('policy-profit')));
    expect(pick).toEqual({ type: 'policy', district: d, kind: 'profit' });
    if (pick.type !== 'policy') throw new Error('not a policy');
    expect(setPolicy(s, pick.district, pick.kind, pick.budget)).toBe(true);
    html = policyCards(kit, s).join('');
    expect(html.match(chip('policy-profit'))![0]).toContain('aria-pressed="true"');
    expect(html).toContain('<b>Maple Row: Profit</b><i>Auto-Price and Auto-Restock</i>');
    expect(html).not.toContain('data-testid="policy-budget"'); // Profit spends nothing of its own
    const off = policyAction(data(html, chip('policy-off')));
    expect(off).toEqual({ type: 'policy', district: d, kind: null });
  });

  it("steps Fortify's and Expand's daily budget", () => {
    const { s, d } = tycoon();
    setPolicy(s, d, 'fortify');
    let html = policyCards(kit, s).join('');
    expect(html).toContain('<b>Maple Row: Fortify</b><i>Fences, repairs and Dex · $50,000 a day</i>');
    expect(html).toContain('data-testid="policy-budget">$50,000<');
    const less = policyAction(data(html, /<button[^>]*aria-label="Less"[^>]*>/));
    expect(less).toEqual({ type: 'policy', district: d, kind: 'fortify', budget: 25000 });
    expect(data(html, /<button[^>]*aria-label="More"[^>]*>/).budget).toBe('100000');
    setPolicy(s, d, 'expand', 5000000);
    html = policyCards(kit, s).join('');
    expect(html).toContain('<i>Land and upgrades · $5,000,000 a day</i>');
    expect(html.match(/<button[^>]*aria-label="More"[^>]*>/)![0]).toContain('disabled title="The biggest budget"');
  });

  it("puts a switch on each plot of yours in the district, to leave it out", () => {
    const { s, d, other } = tycoon();
    expect(policyToggle(s, other)).toBe(''); // no policy, no switch
    setPolicy(s, d, 'fortify');
    const html = policyToggle(s, other);
    expect(html).toContain('<button class="cl-toggle on" data-action="policyPlot"');
    expect(html).toContain('<i></i>Fortify policy</button>');
    const a = policyAction(data(html, /<button[^>]*>/));
    expect(a).toEqual({ type: 'policyPlot', plot: other });
    togglePolicyPlot(s, other);
    expect(policyToggle(s, other)).toContain('<button class="cl-toggle" data-action="policyPlot"');
    expect(policyToggle(s, other)).toContain('aria-pressed="false"');
    // A rival's plot there has no switch.
    const theirs = PLOTS.find((x) => x.district === d && s.plots[x.id].owner && s.plots[x.id].owner !== 'player');
    if (theirs) expect(policyToggle(s, theirs.id)).toBe('');
  });

  it("holds a Fortify plot's Auto-Repair switch on, and gives your skip back when the plot leaves it", () => {
    const { s, d, other } = tycoon();
    toggleAutoRepair(s, other); // skipped first
    expect(autoRepairToggle(s, other)).toContain('aria-pressed="false" title="Auto-Repair skips this plot. Tap to turn it on"');
    setPolicy(s, d, 'fortify');
    const held = autoRepairToggle(s, other);
    expect(held).toContain('<button class="cl-toggle on" data-action="autoRepair"');
    expect(held).toContain('aria-pressed="true" disabled title="Fortify keeps this on"');
    togglePolicyPlot(s, other);
    expect(autoRepairToggle(s, other)).toContain('aria-pressed="false" title="Auto-Repair skips this plot. Tap to turn it on"');
  });

  it("puts the same chips on each district in the Land Registry's Yours tab", () => {
    const { s, d } = tycoon();
    s.rank = 6;
    expect(registryScreen(s, 'mine')).not.toContain('registry-policy');
    s.rank = 7;
    let html = registryScreen(s, 'mine');
    const row = html.match(/<tr data-testid="registry-policy">.*?<\/tr>/)![0];
    expect(row).toContain(`data-action="policy" data-district="${d}" data-kind="expand"`);
    expect(row).not.toContain('data-testid="policy-'); // the Grow tab's test ids stay unique
    expect(row).not.toContain('aria-label="Less"'); // no budget until Fortify or Expand
    setPolicy(s, d, 'expand');
    html = registryScreen(s, 'mine');
    expect(html.match(/<tr data-testid="registry-policy">.*?<\/tr>/)![0]).toContain('<span class="cl-note">$50,000</span>');
  });
});
