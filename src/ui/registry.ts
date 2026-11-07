// Land in the clay HUD (spec: Land and territory): the plot card's district
// line (control tier, the next one, what it does, the perk), the Vacant Lot
// label and the sealed-bid controls. Plain markup with the shared clay classes;
// hud.ts mounts it and every button goes through hud's one click listener.
import {
  bidCost, bidGuess, bidSteps, canBid, canListPlot, controlTier, LOTTIES_CORNER, DISTRICT_BY_ID, DISTRICT_PERKS, districtControl, familySilver, majorityDiscount,
  missingPlots, nextTier, PLOT_BY_ID, TIER_EFFECTS, TIER_NAMES, tierAtLeast, type Blocker, type GameState,
} from '../sim/economy.ts';

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const meter = (v: number) => `<span class="cl-snake" style="--v:${Math.max(0, Math.min(1, v)).toFixed(3)}"><i></i></span>`;
const whole = (n: number) => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US');
/** A clay button like hud's: one verb, disabled with its reason as a tooltip. */
const btn = (action: string, label: string, b: Blocker, extra = '', cls = '') =>
  `<button class="cl-b ${cls}" data-action="${action}" ${extra} ${b.ok ? '' : `disabled title="${esc(b.why)}"`}>${label}</button>`;
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

/** A plot on the block: sealed bids until dawn, Skip's read on the rivals, and your bid buttons. */
export function auctionControls(s: GameState, plotId: string): string {
  const a = s.plots[plotId].auction;
  if (!a || a.kind === 'listing') return '';
  const guess = bidGuess(s, plotId);
  const tip = `Sealed bids: nobody sees anyone else's. Bids open at ${whole(a.min)}; the top bid wins and pays at dawn${familySilver(s) < 1 ? ', 10% off with Family Silver' : ''}. Keep the cash on hand.`;
  const steps = bidSteps(a);
  const from = a.bid === undefined ? 0 : Math.max(0, steps.findIndex((v) => v >= a.bid!));
  const bids = steps.slice(from, from + 3).map((v) => {
    const b = canBid(s, plotId, v);
    const cost = bidCost(s, v);
    return btn('bid', `Bid ${whole(v)}`, b, `data-plot="${plotId}" data-amount="${v}"${b.ok && cost !== v ? ` title="You'd pay ${whole(cost)}"` : ''} data-testid="bid"`, a.bid === v ? 'go' : 'ghost');
  }).join('');
  return `<span class="cl-note good" title="${esc(tip)}" data-testid="auction">${a.kind === 'fire' ? 'Fire Sale auction' : 'Auction'}: closes at dawn</span>
    <span class="cl-note" title="Skip Larkin's guess at the top rival bid">${guess ? `Skip: rivals bid ~${whole(guess)}` : 'Skip: no rival can afford it'}</span>
    <span class="cl-acts">${bids}${a.bid !== undefined ? btn('unbid', '✕', { ok: true }, `data-plot="${plotId}" title="Take your bid back"`, 'ghost tiny') : ''}</span>
    ${a.bid !== undefined ? `<span class="cl-note">Your bid: ${whole(a.bid)}</span>` : ''}`;
}

/** Your plot: put it on the block (sealed bids from land value until dawn), or pull it back off. */
export function listingControls(s: GameState, plotId: string): string {
  const ps = s.plots[plotId];
  if (ps.owner !== 'player' || plotId === LOTTIES_CORNER || PLOT_BY_ID[plotId].type === 'hq') return '';
  const guess = bidGuess(s, plotId);
  if (ps.auction?.kind === 'listing') {
    return `<span class="cl-note good" title="Sealed bids from ${whole(ps.auction.min)}. The top bid's cash is yours at dawn, and the plot goes with what's on it. No bids: it stays yours." data-testid="listed">On the block: sells at dawn</span>
      <span class="cl-note" title="Skip Larkin's guess at the top rival bid">${guess ? `Skip: rivals bid ~${whole(guess)}` : 'Skip: no rival can afford it'}</span>
      ${btn('unlistPlot', 'Take it back', { ok: true }, `data-plot="${plotId}"`, 'ghost')}`;
  }
  const b = canListPlot(s, plotId);
  return btn('listPlot', `Sell from ${whole(ps.landValue)}`, b, `data-plot="${plotId}" data-testid="list-plot"${b.ok ? ` title="Sealed bids open at land value and close at dawn. The plot goes with what's built on it, and posted guards head to the Clubhouse."` : ''}`, 'ghost');
}
