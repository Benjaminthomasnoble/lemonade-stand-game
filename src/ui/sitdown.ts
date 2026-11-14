// Sit-downs at Dot's Diner on the HUD (rivals: src/sim/rivals.ts). A rival HQ's
// card offers the Truce and the Faction Buyout; a rival plot's card offers its
// Plot Buyout. Under either, the Smooth Talkers on your crew: tap one to bring
// them along as negotiator (every deal comes down), tap again to go alone.
// Brock and Tilly sell at their price; Juni and Preston hear your offer, then
// counter, and you shake on it or hold firm. Mounted from hud.ts, drawn with
// its clay kit.
import {
  BOSS_NAME, canFactionBuyout, canHoldFirm, canPlotBuyout, canTruce, caveChance, FACILITIES, factionBuyoutPrice, guardReady, haggleOffer, haggles,
  haggling, plotBuyoutPrice, SITDOWN_RANK, SMOOTH_TALKER, STAND_LEVELS, TRUCE_DAYS, truceCost, type Blocker, type GameState, type Guard,
  type PlotState, type RivalId,
} from '../sim/economy.ts';
import type { Action } from './hud.ts';

/** The parts of the HUD's clay kit the Sit-down controls draw with. */
export interface SitKit {
  btn: (action: string, label: string, b?: Blocker, extra?: string, cls?: string) => string;
  tape: (inner: string, cls?: string) => string;
  locked: (b: Blocker) => boolean;
  esc: (t: string) => string;
  whole: (n: number) => string;
  face: (s: GameState, g: Guard) => string;
}

/** The Smooth Talkers on your crew, to bring to Dot's Diner: tap one to bring them, tap again to go alone. */
export function negotiatorRow(k: SitKit, s: GameState): string {
  const talkers = s.guards.filter((g) => g.trait === SMOOTH_TALKER.trait);
  if (!talkers.length) return '';
  const cut = `${Math.round(SMOOTH_TALKER.cut * 100)}% off every deal`;
  const faces = talkers.map((g) => {
    const fit = guardReady(s, g), on = fit && s.negotiator === g.id;
    const tip = !fit ? `${g.name} is knocked out until Day ${g.outUntil}` : on ? `${g.name} talks ${cut}. Tap to go alone` : `Bring ${g.name}: ${cut}`;
    return `<button class="cl-pick${on ? ' on' : ''}" data-action="negotiator" data-id="${on ? '' : g.id}" aria-pressed="${on}" ${fit ? '' : 'disabled'} title="${k.esc(tip)}">${k.face(s, g)}</button>`;
  }).join('');
  return `<div class="cl-squad" data-testid="negotiator">${k.tape('Negotiator')}${faces}</div>`;
}

/** The Faction Buyout: their price, or a haggler's round (your offer; then their counter, or holding firm). */
function buyout(k: SitKit, s: GameState, id: RivalId): string {
  const fb = canFactionBuyout(s, id);
  if (k.locked(fb)) return '';
  const price = factionBuyoutPrice(s, id);
  const who = `data-rival="${id}"`;
  if (price === null || !haggles(id)) return k.btn('factionBuyout', price === null ? 'Buy them out' : `Buy out ${k.whole(price)}`, fb, `${who} data-testid="faction-buyout"`);
  const offer = haggleOffer(s, id);
  if (!haggling(s, id)) return k.btn('haggle', `Offer ${k.whole(offer)}`, fb, `${who} data-move="offer" data-testid="faction-buyout" title="${BOSS_NAME[id]} will counter"`);
  const odds = `${Math.round(caveChance(s, id) * 100)}% ${BOSS_NAME[id]} takes it, or walks out till tomorrow`;
  return k.btn('factionBuyout', `Shake on ${k.whole(price)}`, fb, `${who} data-testid="faction-buyout"`, 'go')
    + k.btn('haggle', `Hold ${k.whole(offer)}`, canHoldFirm(s, id), `${who} data-move="firm" data-testid="haggle-firm" title="${k.esc(odds)}"`);
}

/** A rival HQ's Sit-downs: a Truce, and the Faction Buyout once it opens. */
export function sitDown(k: SitKit, s: GameState, id: RivalId): string {
  if (s.rank < SITDOWN_RANK) return '';
  const tb = canTruce(s, id);
  const truce = k.locked(tb) ? '' : k.btn('truce', `Truce ${k.whole(truceCost(s, id))}`, tb, `data-rival="${id}" data-testid="truce" title="${TRUCE_DAYS} days of peace. Their Grudge sets the tribute"`);
  const buy = buyout(k, s, id);
  return truce || buy ? `<div class="cl-acts">${truce}${buy}</div>${negotiatorRow(k, s)}` : '';
}

/** A rival plot's Plot Buyout at their price, and who you bring to ask. */
export function plotBuyoutRow(k: SitKit, s: GameState, plotId: string): string {
  const pb = canPlotBuyout(s, plotId);
  if (s.rank < SITDOWN_RANK || k.locked(pb)) return '';
  return k.btn('plotBuyout', `Buy it ${k.whole(plotBuyoutPrice(s, plotId))}`, pb, `data-plot="${plotId}" data-testid="plot-buyout"`) + negotiatorRow(k, s);
}

/** For a Fire Sale plot's card: the bought-out rival's building that comes with the plot. */
export function keptNote(ps: PlotState): string {
  const k = ps.owner ? undefined : ps.kept;
  const name = k?.facility ? FACILITIES[k.facility.kind].names[k.facility.level - 1] : k?.stand ? STAND_LEVELS[k.stand.level - 1].name.replace(/^The /, '') : '';
  return name ? `<span class="cl-note good">${name} included</span>` : '';
}

/** The Sit-down buttons' actions, read off the clicked element's data attributes. */
export function sitdownAction(d: DOMStringMap): Action {
  if (d.action === 'haggle') return { type: 'haggle', rival: d.rival as RivalId, move: d.move === 'firm' ? 'firm' : 'offer' };
  return { type: 'negotiator', id: d.id || null };
}
