// The stand panel (spec: Running the business, "How demand works"): the three demand steps with every number in
// them, the cap that binds taped down, and why people walked past. Forecast values at Morning Prep, live ones
// while open. Mounted inside the plot card for your own stands (hud.ts); exact numbers sit in the math table and
// in title tooltips, the panel itself stays a few words a line.
import {
  BASE_STOP_CHANCE, demandChain, FACTIONS, nearbyPlots, peopleAhead, PERKS, PLOT_BY_ID, RECIPES, seasonOf, serviceLeft, servingsAvailable, WEATHER,
  type DemandChain, type GameState, type RivalId, type SegmentId, type WalkReason,
} from '../sim/economy.ts';
import { emoteUrl, type Emote } from './emotes.ts';
import * as A from './clay.ts';

/** Why people walked past, in the order the panel lists them, with the street's reaction icon for each. */
export const WHY: [WalkReason, Emote, string][] = [
  ['pricey', 'pricey', 'Too pricey'],
  ['line', 'line', 'Line too long'],
  ['notThirsty', 'zzz', 'Not thirsty'],
  ['rival', 'rival', 'Went to a rival'],
  ['soldOut', 'soldout', 'Sold out'],
];

// Props are drawn once so the markup stays the same between frames (their gradient ids are unique per draw).
let icons: { crowd: string; cup: string; crate: string } | null = null;
const icon = () => (icons ??= { crowd: A.crowdSVG(), cup: A.cupSVG(), crate: A.crateSVG() });
const emotes = new Map<Emote, string>();
/** A reaction icon wrapped in an svg, so the clay rows size it like their other props. */
const emote = (k: Emote) => {
  let m = emotes.get(k);
  if (!m) { m = A.svg(`<image href="${emoteUrl(k)}" width="64" height="64"/>`); emotes.set(k, m); }
  return m;
};

const pct = (p: number) => `${Math.round(p * 100)}%`;
const num = (x: number) => (Math.round(x * 100) / 100).toString();
const times = (x: number) => `×${num(x)}`;
const usd = (n: number) => (n < 1 ? `${Math.round(n * 100)}¢` : `$${n.toFixed(2)}`);
const n0 = (n: number) => (Number.isFinite(n) ? Math.round(n).toLocaleString('en-US') : '∞');
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const tape = (inner: string) => `<span class="cl-tape">${inner}</span>`;

// The chain only moves when the stand, the weather or the town does, so it isn't redone every frame.
const memo = new WeakMap<GameState, { key: string; chain: DemandChain | null }>();
function chainFor(s: GameState, plotId: string): DemandChain | null {
  const st = s.plots[plotId]?.stand;
  if (!st) return null;
  const w = s.phase === 'prep' ? s.forecast : s.weather;
  const owned = Object.values(s.plots).reduce((a, p) => a + (p.owner === 'player' ? 1 : 0), 0);
  // The stands within 2 plots share its customers, so any change next door (a new stand, a smash, a price) counts too.
  const block = nearbyPlots(PLOT_BY_ID[plotId]).map((q) => {
    const ps = s.plots[q.id], x = ps.stand;
    return x ? `${ps.owner}:${x.level}:${x.price}:${x.recipe}:${x.sweetness}:${x.wrecked ? 1 : 0}:${JSON.stringify(x.campaigns)}` : '-';
  }).join(',');
  const key = [plotId, s.day, s.phase, w.kind, s.reputation, s.brandTier, servingsAvailable(st), owned, block].join('|');
  const m = memo.get(s);
  if (m && m.key === key) return m.chain;
  const chain = demandChain(s, plotId);
  memo.set(s, { key, chain });
  return chain;
}

/** The perks at work at this stand, as math-table rows. */
function perkRows(c: DemandChain): [string, string][] {
  const rows: [string, string][] = [];
  if (c.perks.majority) rows.push(['Majority here', 'sales +10%']);
  if (c.perks.townFavorite) rows.push(['Town Favorite', `walkers +${pct(PERKS.townFavorite)}`]);
  if (c.perks.orchardFresh) rows.push(['Orchard Fresh', `walkers +${pct(PERKS.orchardFresh)}`]);
  if (c.perks.powerLunch) rows.push(['Power Lunch', `lunch ${times(PERKS.powerLunch.mult)}`]);
  if (c.perks.touristTrap) rows.push(['Tourist Trap', `tourists pay +${pct(PERKS.touristTrap)}`]);
  return rows;
}

/** Every number in the three steps, as the books table under "See the math". */
function mathTable(s: GameState, plotId: string, c: DemandChain): string {
  const w = s.phase === 'prep' ? s.forecast : s.weather;
  const season = seasonOf(s.day);
  const rows: [string, string, string?][] = [
    ['Plot traffic', n0(c.traffic)],
    ['Stand draw', times(c.draw)],
    ['Marketing', times(c.marketing)],
    [`${season[0].toUpperCase()}${season.slice(1)}`, times(c.season)],
    [`${WEATHER[w.kind].label} streets`, times(c.weather)],
    ...(c.lunch !== 1 ? [['Lunch rush', times(c.lunch)] as [string, string]] : []),
    ['Walk by', n0(c.passersby), 'good'],
    ...(c.kept < 1 ? [['Kept from rivals', pct(c.kept)] as [string, string]] : []),
    ...(c.inflow > 0 ? [['From next door', `+${n0(c.inflow)}`] as [string, string]] : []),
    ['Base stop', pct(BASE_STOP_CHANCE)],
    [`${WEATHER[w.kind].label} thirst`, times(c.thirst)],
    ['Curb appeal', times(c.curb)],
    ['Recipe match', times(c.recipe)],
    ['Sweetness', times(c.sweet)],
    [`Price fit (${usd(c.price)} of ${usd(c.ceiling)})`, times(c.priceFit)],
    ['Reputation', times(c.reputation)],
    ['Stop', pct(c.stopChance), 'good'],
    ['Want a cup', n0(c.demand)],
    [`Pour (${c.pourRate}/hour × 10)`, n0(c.service)],
    ...(Number.isFinite(c.stock) ? [['In stock', n0(c.stock)] as [string, string]] : []),
    ['Cups', n0(c.cups), 'good'],
    ...perkRows(c),
  ];
  void plotId;
  return `<table class="cl-books">${rows.map(([k, v, cls]) => `<tr><td>${esc(k)}</td><td${cls ? ` class="${cls}"` : ''}>${v}</td></tr>`).join('')}</table>`;
}

/**
 * The panel for one of your stands. `math` opens the books table. Live while open: walkers and cups so far,
 * the line right now, and what's left to pour; the chain's numbers are today's expected totals.
 */
export function standPanel(s: GameState, plotId: string, math: boolean): string {
  const st = s.plots[plotId]?.stand;
  const c = chainFor(s, plotId);
  if (!st || !c || st.wrecked) return '';
  const I = icon();
  const open = s.phase === 'open';
  const step1 = `Walk by: ${n0(c.traffic)} × ${num(c.draw)} draw × ${num(c.marketing)} marketing × ${num(c.season)} season × ${num(c.weather)} weather${c.lunch !== 1 ? ` × ${num(c.lunch)} lunch` : ''}`;
  const step2 = `Stop: 25% × ${num(c.thirst)} thirst × ${num(c.curb)} curb × ${num(c.recipe)} recipe × ${num(c.sweet)} sweetness × ${num(c.priceFit)} price (${usd(c.price)} of ${usd(c.ceiling)}) × ${num(c.reputation)} stars`;
  const caps: [string, number, boolean][] = open
    ? [['pour left', serviceLeft(s, plotId), serviceLeft(s, plotId) <= 0], ['stock', servingsAvailable(st), servingsAvailable(st) <= 0]]
    : [['want', c.demand, c.binding === 'demand'], ['pour', c.service, c.binding === 'service'], ['stock', c.stock, c.binding === 'stock']];
  const capRow = caps.map(([k, v, bind]) => (bind ? tape(`${k} ${n0(v)}`) : `${k} ${n0(v)}`)).join(' · ');
  const step3 = `Cups: the smallest of want ${n0(c.demand)}, pour ${n0(c.service)} (${c.pourRate} an hour × 10) and stock ${n0(c.stock)}`;
  const d = st.day;
  const why = WHY.filter(([r]) => d.walkedPast[r] > 0)
    .map(([r, e, label]) => `<span title="${label}: ${d.walkedPast[r]}">${emote(e)}${d.walkedPast[r]}</span>`).join('');
  const whyWhen = open ? 'Today' : 'Yesterday';
  const over = st.price > c.ceiling + 1e-9;
  return `<div class="cl-planner" data-testid="stand-panel">
    <b title="${open ? 'Live: so far today, with what the day should bring' : `Forecast for ${WEATHER[s.forecast.kind].label.toLowerCase()} weather`}">${open ? 'Today so far' : 'Today\'s odds'}</b>
    <span class="cl-bars">
      <span title="${esc(step1)}">${I.crowd}${open ? `${n0(d.passersby)} of ~${n0(c.passersby)} walked by` : `${n0(c.passersby)} walk by`}</span>
      <span title="${esc(step2)}">${I.cup}${pct(c.stopChance)} stop${over ? ` · over the ${usd(c.ceiling)} top` : ''}</span>
      <span title="${esc(step3)}">${I.crate}${open ? `${n0(d.customers)} sold · line ${peopleAhead(st)}` : `${n0(c.cups)} cups`}</span>
    </span>
    <span class="cl-note">${capRow}</span>
    ${why ? `<span class="cl-bars" title="${whyWhen}: why people walked past"><span>${why}</span></span>` : ''}
    <button class="cl-link" data-action="standMath">${math ? 'Hide the math' : 'See the math'}</button>
    ${math ? mathTable(s, plotId, c) : ''}
  </div>`;
}

/**
 * What a tapped walker says (spec: tap a walker in Street View to hear why): what they bought and for how much,
 * or why they walked past your stand. Captured when they set off, so it stays true while they walk.
 */
export function walkerLine(s: GameState, e: { plot: string; at: string; buys: boolean; reason?: WalkReason; price: number; owner: string }): string {
  const f = FACTIONS[e.owner as RivalId];
  if (e.buys) {
    if (f) return `${f.product} at ${f.name}`;
    const st = s.plots[e.at]?.stand;
    return `${st ? RECIPES[st.recipe].label : 'Lemonade'}, ${usd(e.price)}!`;
  }
  // Passing your stand for a rival's is the reason, whatever happened over there.
  const reason = walkerReason(s, e);
  const why = WHY.find(([r]) => r === reason)?.[2] ?? 'Not today';
  return reason === 'notThirsty' ? `${why}.` : `${why}!`;
}

type Walk = Parameters<typeof walkerLine>[1] & { segment: SegmentId };
const walkerReason = (s: GameState, e: Omit<Walk, 'segment'>): WalkReason | undefined =>
  FACTIONS[e.owner as RivalId] && s.plots[e.plot]?.owner === 'player' ? 'rival' : e.reason;

/** What a walker carries for a tap: who they are, their line and the street's reaction icon for it. */
export interface WalkerInfo { segment: SegmentId; line: string; icon: Emote }
export function walkerInfo(s: GameState, e: Walk): WalkerInfo {
  const reason = e.buys ? undefined : walkerReason(s, e);
  return { segment: e.segment, line: walkerLine(s, e), icon: WHY.find(([r]) => r === reason)?.[1] ?? 'bought' };
}
