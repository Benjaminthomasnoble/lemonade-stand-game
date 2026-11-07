// Land in the clay HUD (spec: Land and territory): the plot card's district
// line (control tier, the next one, what it does, the perk), the Vacant Lot
// label, the sealed-bid controls, and the Land Registry itself: one paper
// screen with every plot you can buy, open auctions, your deeds and the rival
// plots you could buy out. Plain markup with the shared clay classes; hud.ts
// mounts it and every button goes through hud's one click listener.
import {
  auctionPlots, bidCost, bidGuess, bidSteps, canBid, canBuyPlot, canListPlot, canPlotBuyout, controlTier, DISTRICT_BY_ID, DISTRICT_PERKS, DISTRICTS,
  districtControl, FACILITIES, FACTIONS, familySilver, isWrecked, LOTTIES_CORNER, majorityDiscount, missingPlots, nextTier, PLOT_BY_ID, plotBuyoutPrice,
  plotPrice, PLOTS, purchasablePlots, reachBlocker, SITDOWN_RANK, standLevel, TIER_EFFECTS, TIER_NAMES, tierAtLeast,
  type Blocker, type DistrictId, type GameState, type Plot, type RivalId,
} from '../sim/economy.ts';
import { taught } from '../sim/story.ts';
import * as A from './clay.ts';

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const meter = (v: number) => `<span class="cl-snake" style="--v:${Math.max(0, Math.min(1, v)).toFixed(3)}"><i></i></span>`;
const whole = (n: number) => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US');
const tape = (inner: string, cls = '') => `<span class="cl-tape ${cls}">${inner}</span>`;
/** A clay button like hud's: one verb, disabled with its reason as a tooltip. */
const btn = (action: string, label: string, b: Blocker, extra = '', cls = '') =>
  `<button class="cl-b ${cls}" data-action="${action}" ${extra} ${b.ok ? '' : `disabled title="${esc(b.why)}"`}>${label}</button>`;
const named = (list: { name: string }[]) => (list.length <= 2 ? list.map((p) => p.name).join(' and ') : `${list.length} plots`);
/** Ticket art is drawn once, so renders compare equal and nothing flickers. */
const once = (f: () => string) => { let v: string | undefined; return () => (v ??= f()); };
const ICON = { board: once(A.boardSVG), house: once(A.houseSVG) };

/** A district's tier and plots held ("Majority 8/12"), with the details for a tooltip. */
function districtLine(s: GameState, d: DistrictId) {
  const c = districtControl(s, d);
  const tier = controlTier(s, d);
  const next = nextTier(s, d);
  const perk = DISTRICT_PERKS[d];
  const tip = [
    `${DISTRICT_BY_ID[d].name}: you hold ${c.mine} of ${c.total} plots (${Math.round(c.share * 100)}%)`,
    next ? `${TIER_NAMES[next.tier]} at ${next.at} plots: ${next.more} more` : '',
    tierAtLeast(tier, 'majority') ? `Majority: ${TIER_EFFECTS.majority}` : '',
    tierAtLeast(tier, 'stronghold') ? `Stronghold: ${TIER_EFFECTS.stronghold}` : '',
    tier === 'full' ? `${perk.name}: ${perk.text}` : `Full Control turns on ${perk.name}: ${perk.text}`,
  ].filter(Boolean).join('\n');
  const label = tier === 'none' ? `${c.mine}/${c.total} yours` : `${TIER_NAMES[tier]} ${c.mine}/${c.total}`;
  return { c, tier, next, perk, tip, label };
}

/** The district line on a plot card: tier and plots held, the next tier, the effects and the perk (details in the tooltip). */
export function controlNote(s: GameState, plotId: string): string {
  const p = PLOT_BY_ID[plotId];
  if (p.type === 'civic') return '';
  const { c, tier, next, perk, tip, label } = districtLine(s, p.district);
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

/** Your plot: put it on the block (sealed bids from land value until dawn), or pull it back off. Selling opens with the Registry. */
export function listingControls(s: GameState, plotId: string): string {
  const ps = s.plots[plotId];
  if (ps.owner !== 'player' || plotId === LOTTIES_CORNER || PLOT_BY_ID[plotId].type === 'hq' || (!registryOpen(s) && !ps.auction)) return '';
  const guess = bidGuess(s, plotId);
  if (ps.auction?.kind === 'listing') {
    return `<span class="cl-note good" title="Sealed bids from ${whole(ps.auction.min)}. The top bid's cash is yours at dawn, and the plot goes with what's on it. No bids: it stays yours." data-testid="listed">On the block: sells at dawn</span>
      <span class="cl-note" title="Skip Larkin's guess at the top rival bid">${guess ? `Skip: rivals bid ~${whole(guess)}` : 'Skip: no rival can afford it'}</span>
      ${btn('unlistPlot', 'Take it back', { ok: true }, `data-plot="${plotId}"`, 'ghost')}`;
  }
  const b = canListPlot(s, plotId);
  return btn('listPlot', `Sell from ${whole(ps.landValue)}`, b, `data-plot="${plotId}" data-testid="list-plot"${b.ok ? ` title="Sealed bids open at land value and close at dawn. The plot goes with what's built on it, and posted guards head to the Clubhouse."` : ''}`, 'ghost');
}

// ---------- the Land Registry (spec: Menus; Land and territory) ----------

export type RegistryTab = 'buy' | 'auctions' | 'mine' | 'rivals';
const TAB_LABEL: Record<RegistryTab, string> = { buy: 'For Sale', auctions: 'Auctions', mine: 'Yours', rivals: 'Rivals' };

/** Town Hall and the Registry of Deeds: tap it on the map for the Land Registry. */
export const TOWN_HALL = PLOTS.find((p) => p.name === 'Town Hall and Registry')!.id;

/**
 * Week 2's land lesson opens the Land Registry (spec: Onboarding, "Week 2 |
 * Land | The Land Registry"; story.ts taught). Before that, Maple Row's For
 * Sale signs and plot cards do the buying. With the lessons off it is open from
 * Day 1.
 */
export const registryOpen = (s: GameState) => taught(s, 'land');

/** The tabs with something behind them: Auctions while any are open, Rivals from Rank 4 (Plot Buyouts). */
export function registryTabs(s: GameState): RegistryTab[] {
  return [
    'buy',
    ...(auctionPlots(s).length ? ['auctions' as const] : []),
    'mine',
    ...(s.rank >= SITDOWN_RANK ? ['rivals' as const] : []),
  ];
}

const TYPE_LABEL: Partial<Record<Plot['type'], string>> = { street: 'Street plot', prime: 'Prime plot, traffic ×3', landmark: 'Landmark, traffic ×5', field: 'Field', dock: 'Dock', industrial: 'Industrial', hq: 'Headquarters' };
/** A plot's name as a link: like any menu's list, it puts the Registry away, flies there and opens the plot's card. */
const goTo = (s: GameState, id: string) => {
  const p = PLOT_BY_ID[id];
  const tip = ['Show on the map', TYPE_LABEL[p.type], `~${p.baseTraffic} passersby a day`, `land ${whole(s.plots[id].landValue)}`].filter(Boolean).join(', ');
  return `<button class="cl-link" data-action="inspect" data-plot="${id}" title="${esc(tip)}">${esc(p.name)}</button>`;
};
const row = (left: string, right: string, cls = '') => `<tr${cls ? ` class="${cls}"` : ''}><td>${left}</td><td>${right}</td></tr>`;
const districtRow = (s: GameState, d: DistrictId) => {
  const l = districtLine(s, d);
  return row(`<b>${esc(DISTRICT_BY_ID[d].name)}</b>`, `<span title="${esc(l.tip)}">${l.label}${meter(l.c.share)}</span>`);
};
const table = (rows: string[]) => `<table class="cl-books">${rows.join('')}</table>`;
const playerDibs = (s: GameState, id: string) => { const d = s.plots[id].dibs; return !!d && d.who === 'player' && d.until >= s.day; };

/** "Fire Sale to day 12", "Side lot today", "First Dibs today": what only you can buy, and until when. */
function dibsTag(s: GameState, id: string): string {
  if (!playerDibs(s, id)) return '';
  const d = s.plots[id].dibs!;
  const label = d.price === undefined ? 'First Dibs' : d.table ? 'Side lot' : 'Fire Sale';
  return ` <span class="cl-note good" title="Only you can buy it ${d.until > s.day ? `through day ${d.until}` : 'today'}">${label} ${d.until > s.day ? `to day ${d.until}` : 'today'}</span>`;
}

/** One plot for sale: the same Buy as its For Sale sign, or why someone else has it first. */
function buyRow(s: GameState, id: string): string {
  const ps = s.plots[id];
  if (ps.dibs && ps.dibs.who !== 'player') return row(goTo(s, id), `<span class="cl-note bad" title="Only they can buy it today">First Dibs: ${esc(FACTIONS[ps.dibs.who as RivalId].name)}</span>`);
  const b = canBuyPlot(s, id);
  const pt = priceTip(s, id);
  return row(goTo(s, id) + dibsTag(s, id), btn('buyPlot', `Buy ${whole(plotPrice(s, id))}`, b, `data-plot="${id}" data-testid="registry-buy"${b.ok && pt ? ` title="${esc(pt)}"` : ''}`, 'go tiny'));
}

/**
 * For Sale: every open plot by district, cheapest first (your First Dibs and
 * Fire Sale plots on top). A district you can't reach yet shows why in one row;
 * one still locked by rank stays hidden.
 */
function buyTab(s: GameState): string {
  const rows: string[] = [];
  for (const d of DISTRICTS) {
    const open = purchasablePlots(d.id).filter((p) => !s.plots[p.id].owner && !s.plots[p.id].auction);
    const reach = reachBlocker(s, d.id);
    const list = reach.ok ? open : open.filter((p) => playerDibs(s, p.id));
    const later = open.length - list.length;
    const rankLocked = !reach.ok && /Rank \d/.test(reach.why);
    if (!list.length && (!later || rankLocked)) continue;
    rows.push(districtRow(s, d.id));
    const order = (p: Plot) => (playerDibs(s, p.id) ? -1e12 : 0) + plotPrice(s, p.id);
    for (const p of [...list].sort((a, b) => order(a) - order(b))) rows.push(buyRow(s, p.id));
    if (later && !reach.ok && !rankLocked) rows.push(row(`${later} more plot${later === 1 ? '' : 's'}`, `<span class="cl-note bad" title="${esc(reach.why)}">Foothold next door first</span>`));
  }
  return rows.length ? table(rows) : '<span class="cl-note">Nothing for sale right now</span>';
}

/** Auctions: each plot under sealed bids, with the plot card's bid buttons; your own listings with Take it back. */
function auctionsTab(s: GameState): string {
  const lots = auctionPlots(s).map((p) => {
    const mine = s.plots[p.id].auction!.kind === 'listing';
    return `<div class="cl-planner" data-testid="registry-lot">${goTo(s, p.id)}<span class="cl-note">${esc(DISTRICT_BY_ID[p.district].name)}</span>${mine ? listingControls(s, p.id) : auctionControls(s, p.id)}</div>`;
  });
  return lots.join('') || '<span class="cl-note">No auctions today</span>';
}

/** What a deed of yours holds, in a word or two. */
function holding(s: GameState, id: string): string {
  const ps = s.plots[id];
  if (isWrecked(ps)) return `<span class="cl-note bad">${ps.busted ? 'Busted' : 'Wrecked'}</span>`;
  if (PLOT_BY_ID[id].type === 'hq') return '<span class="cl-note good">Trophy</span>';
  if (ps.stand) return `<span class="cl-note">L${ps.stand.level} ${esc(standLevel(ps.stand).name)}</span>`;
  if (ps.facility) return `<span class="cl-note">${esc(FACILITIES[ps.facility.kind].names[ps.facility.level - 1])}</span>`;
  return '<span class="cl-note" title="Counts for land value and control. Sells nothing, costs no upkeep.">Vacant Lot</span>';
}

/** Sell from the list: the same listing as the plot card, in a compact button. */
function sellCell(s: GameState, id: string): string {
  const ps = s.plots[id];
  if (id === LOTTIES_CORNER || PLOT_BY_ID[id].type === 'hq') return '';
  if (ps.auction?.kind === 'listing') return ` <span class="cl-note good" data-testid="listed" title="Sealed bids close at dawn">On the block</span>${btn('unlistPlot', 'Take back', { ok: true }, `data-plot="${id}"`, 'ghost tiny')}`;
  const b = canListPlot(s, id);
  return ` ${btn('listPlot', `Sell from ${whole(ps.landValue)}`, b, `data-plot="${id}" data-testid="registry-sell"${b.ok ? ' title="Sealed bids open at land value and close at dawn. The plot goes with what is built on it."' : ''}`, 'ghost tiny')}`;
}

/** Yours: your deeds by district with each district's control, Vacant Lots flagged, and a Sell button on each. */
function mineTab(s: GameState): string {
  const rows: string[] = [];
  let count = 0, land = 0;
  for (const d of DISTRICTS) {
    const mine = PLOTS.filter((p) => p.district === d.id && p.type !== 'civic' && s.plots[p.id].owner === 'player');
    if (!mine.length) continue;
    rows.push(districtRow(s, d.id));
    for (const p of mine) {
      rows.push(row(goTo(s, p.id), holding(s, p.id) + sellCell(s, p.id)));
      count++;
      land += s.plots[p.id].landValue;
    }
  }
  return `<span class="cl-note" title="Every plot adds its land value to your Success Score">${count} plot${count === 1 ? '' : 's'}, land ${whole(land)}</span>${table(rows)}`;
}

/** Rivals (Rank 4+): every rival plot with its Plot Buyout price, by faction. HQs are captured, never bought. */
function rivalsTab(s: GameState): string {
  const rows: string[] = [];
  for (const id of Object.keys(FACTIONS) as RivalId[]) {
    if (!s.rivals[id].alive) continue;
    const plots = PLOTS.filter((p) => p.type !== 'hq' && s.plots[p.id].owner === id);
    if (!plots.length) continue;
    rows.push(row(`<b>${esc(FACTIONS[id].name)}</b>`, `${plots.length} plot${plots.length === 1 ? '' : 's'}`));
    for (const p of plots) rows.push(row(goTo(s, p.id), btn('plotBuyout', `Buy it ${whole(plotBuyoutPrice(s, p.id))}`, canPlotBuyout(s, p.id), `data-plot="${p.id}" data-testid="registry-buyout"`, 'tiny')));
  }
  return rows.length ? table(rows) : '<span class="cl-note">No rival land left</span>';
}

/**
 * The Land Registry menu (src/ui/menus.ts; the HUD draws it when hud.menu is
 * 'registry'): a paper screen over the world with For Sale, Auctions, Yours
 * and (Rank 4+) Rivals. Done puts it away like every other menu.
 */
export function registryScreen(s: GameState, want: RegistryTab): string {
  const tabs = registryTabs(s);
  const tab = tabs.includes(want) ? want : 'buy';
  const body = { buy: buyTab, auctions: auctionsTab, mine: mineTab, rivals: rivalsTab }[tab](s);
  return `<div class="cl-modal-bg"><div class="cl-card-big cl-registry" data-testid="menu-registry">
    <div class="cl-end-day" title="Skip Larkin keeps the deeds at Town Hall">${tape('Land Registry')}</div>
    <div class="cl-tabs">${tabs.map((t) => `<button class="cl-tab${t === tab ? ' on' : ''}" data-action="registry" data-tab="${t}" data-testid="registry-tab-${t}">${TAB_LABEL[t]}</button>`).join('')}</div>
    ${body}
    <div class="cl-setup-foot"><span></span><button class="cl-link" data-action="menu" data-menu="" data-testid="menu-done">Done</button></div>
  </div></div>`;
}

/** The Town Hall plot card's button. */
export const registryButton = (s: GameState) => (registryOpen(s) ? btn('registry', 'Land Registry', { ok: true }, 'data-tab="buy" data-testid="open-registry"', 'go') : '');

/** In the Red: list a plot for cash (opens Yours), when there's one you can sell. */
export const sellPlotButton = (s: GameState) =>
  registryOpen(s) && PLOTS.some((p) => canListPlot(s, p.id).ok) ? btn('registry', 'Sell a plot', { ok: true }, 'data-tab="mine" data-testid="sell-a-plot"', 'ghost') : '';

/** Morning feed tickets: plots at auction, and plots only you can buy (First Dibs, a Fire Sale). */
export function landTickets(s: GameState): string[] {
  if (!registryOpen(s)) return [];
  const t: string[] = [];
  const lots = auctionPlots(s).filter((p) => s.plots[p.id].auction!.kind !== 'listing');
  if (lots.length) {
    const bid = lots.filter((p) => s.plots[p.id].auction!.bid !== undefined).length;
    t.push(`<div class="cl-ticket" data-testid="auction-ticket" title="Sealed bids close at dawn${bid ? `. You've bid on ${bid}` : ''}">${ICON.board()}<b>${lots.length === 1 ? `Auction: ${esc(lots[0].name)}` : `${lots.length} plots at auction`}</b>${btn('registry', 'See bids', { ok: true }, 'data-tab="auctions"')}</div>`);
  }
  const dibs = PLOTS.filter((p) => playerDibs(s, p.id) && !s.plots[p.id].owner && !s.plots[p.id].dibs!.table);
  if (dibs.length) {
    const fire = dibs.filter((p) => s.plots[p.id].dibs!.price !== undefined);
    const until = Math.min(...dibs.map((p) => s.plots[p.id].dibs!.until));
    const label = fire.length ? `Fire Sale: ${fire.length} plot${fire.length === 1 ? '' : 's'}` : `First Dibs: ${esc(named(dibs))}`;
    t.push(`<div class="cl-ticket good" data-testid="dibs-ticket" title="Only you can buy ${until > s.day ? `through day ${until}` : 'today'}; then sealed bids">${ICON.house()}<b>${label}</b>${btn('registry', 'See them', { ok: true }, 'data-tab="buy"')}</div>`);
  }
  return t;
}
