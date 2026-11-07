// Land in the clay HUD (spec: Land and territory): the plot card's district
// line (control tier, the next one, what it does, the perk) and the Vacant Lot
// label. Plain markup with the shared clay classes; hud.ts mounts it and every
// button goes through hud's one click listener.
import {
  controlTier, DISTRICT_BY_ID, DISTRICT_PERKS, districtControl, familySilver, majorityDiscount, missingPlots, nextTier, PLOT_BY_ID,
  TIER_EFFECTS, TIER_NAMES, tierAtLeast, type GameState,
} from '../sim/economy.ts';

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const meter = (v: number) => `<span class="cl-snake" style="--v:${Math.max(0, Math.min(1, v)).toFixed(3)}"><i></i></span>`;
const whole = (n: number) => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US');
const named = (list: { name: string }[]) => (list.length <= 2 ? list.map((p) => p.name).join(' and ') : `${list.length} plots`);

/** The district line on a plot card: tier and plots held, the next tier, the effects and the perk (details in the tooltip). */
export function controlNote(s: GameState, plotId: string): string {
  const p = PLOT_BY_ID[plotId];
  if (p.type === 'civic') return '';
  const d = DISTRICT_BY_ID[p.district];
  const c = districtControl(s, p.district);
  const tier = controlTier(s, p.district);
  const next = nextTier(s, p.district);
  const perk = DISTRICT_PERKS[p.district];
  const tip = [
    `${d.name}: you hold ${c.mine} of ${c.total} plots (${Math.round(c.share * 100)}%)`,
    next ? `${TIER_NAMES[next.tier]} at ${next.at} plots: ${next.more} more` : '',
    tierAtLeast(tier, 'majority') ? `Majority: ${TIER_EFFECTS.majority}` : '',
    tierAtLeast(tier, 'stronghold') ? `Stronghold: ${TIER_EFFECTS.stronghold}` : '',
    tier === 'full' ? `${perk.name}: ${perk.text}` : `Full Control turns on ${perk.name}: ${perk.text}`,
  ].filter(Boolean).join('\n');
  const label = tier === 'none' ? `${c.mine}/${c.total} yours` : `${TIER_NAMES[tier]} ${c.mine}/${c.total}`;
  const step = next && tier !== 'none' ? `, ${next.more} to ${TIER_NAMES[next.tier]}` : '';
  const lost = tier !== 'full' && (s.perksLost ?? []).includes(perk.id);
  return `<span class="cl-note${tier === 'full' ? ' good' : ''}" title="${esc(tip)}" data-testid="control">${label}${step}${meter(c.share)}</span>`
    + (tier === 'full' ? `<span class="cl-note good" title="${esc(perk.text)}">${esc(perk.name)} is on</span>` : '')
    + (lost ? `<span class="cl-note bad" title="${esc(perk.name)} is off until you hold every plot here again">Win back ${esc(named(missingPlots(s, p.district)))}</span>` : '');
}

/** An owned plot with no building: it counts for land value and control, but sells nothing and costs no upkeep. */
export function vacantNote(s: GameState, plotId: string): string {
  const ps = s.plots[plotId];
  const p = PLOT_BY_ID[plotId];
  if (!ps.owner || ps.stand || ps.facility || p.type === 'hq' || p.type === 'civic') return '';
  return `<span class="cl-note" title="Counts for land value and control. Sells nothing, costs no upkeep, can't be Wrecked: it changes hands only by sale or buyout.">Vacant Lot</span>`;
}

/** Everything land adds to a plot card under its name. */
export const landNotes = (s: GameState, plotId: string) => vacantNote(s, plotId) + controlNote(s, plotId);

/** The Buy button's tooltip when a discount applies: "Land $1,000, −10% for your Majority". Empty when you pay the plain price. */
export function priceTip(s: GameState, plotId: string): string {
  const ps = s.plots[plotId];
  const dibs = ps.dibs?.who === 'player' && ps.dibs.until >= s.day && ps.dibs.price !== undefined;
  const parts = [
    dibs ? `${ps.dibs!.table ? "Lottie's price" : 'Fire Sale'} ${whole(ps.dibs!.price!)} (land ${whole(ps.landValue)})` : `Land ${whole(ps.landValue)}`,
    majorityDiscount(s, PLOT_BY_ID[plotId].district) < 1 ? '−10% for your Majority' : '',
    familySilver(s) < 1 ? '−10% Family Silver' : '',
  ].filter(Boolean);
  return parts.length > 1 || dibs ? parts.join(', ') : '';
}
