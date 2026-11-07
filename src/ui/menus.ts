// The ten paper menus (spec: Menus): Morning Bugle, Ledger, Stand panel, Crew
// roster, Raid Planner, Rivals Corkboard, Order Book, Land Registry, Rank and
// Perks, Lottie's Goals. Each opens from its meter on the top bar, its key
// (Options: Keys), the corner's menu list, or a tap on the thing it describes,
// and none shows before its system unlocks. Most are full-screen paper, which
// pauses the clock (Options); Lottie's Goals is her sticky note and the Stand
// panel is the stand's own card. Clicks go through the HUD's one listener.
// Until other lanes land their screens, the Planner, Corkboard and Registry
// list what they cover and open each one's plot card on the map; Rank and Perks
// shows the rank ladder (Lottie's tips join it later).
import {
  canBuyPlot, DEAL_LOADS, deliveryRaidRisk, FACTIONS, hqPlot, ORDER_TIERS, PLOT_BY_ID, PLOTS, RAID_RANK, RANKS, RECIPES,
  peaceful, plotPrice, raidTargets, rivalStatus, successScore, SUPPLIES, WEATHER, DISTRICT_BY_ID, FESTIVALS, festivalsOn, upcomingFestivals,
  type FestivalId, type GameState, type Goal, type RivalId, type SupplyId,
} from '../sim/economy.ts';
import { MENU_IDS, tempText, type MenuId, type Options } from '../settings.ts';
import { keyName } from './keys.ts';

export type MenuView = MenuId | 'index';

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const whole = (n: number) => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US');
const signed = (n: number) => (n >= 0 ? '+' : '-') + whole(Math.abs(n)).replace('-', '');
const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

export const MENU_LABEL: Record<MenuId, string> = {
  bugle: 'Morning Bugle', ledger: 'Ledger', stand: 'Stand panel', crew: 'Crew roster', planner: 'Raid Planner',
  corkboard: 'Rivals Corkboard', orders: 'Order Book', registry: 'Land Registry', rank: 'Rank and Perks', goals: "Lottie's Goals",
};

/** Full-screen paper: it pauses the clock while it's up (Options: Screens pause). */
export const isFullMenu = (m: MenuView | null): boolean => !!m && m !== 'goals' && m !== 'stand';

/** Land the player could buy now or soon: open plots whose district isn't still rank-locked. */
const forSale = (s: GameState) => PLOTS.filter((p) => {
  if (s.plots[p.id].owner || p.type === 'civic' || p.type === 'hq') return false;
  const b = canBuyPlot(s, p.id);
  return b.ok || !/Rank \d/.test(b.why);
});

/** Nothing appears before its system unlocks. */
export function menuUnlocked(s: GameState, id: MenuId): boolean {
  switch (id) {
    case 'ledger': return s.history.length > 0; // after the first day's books
    case 'crew': return s.guards.length + s.recruits.length > 0;
    case 'planner': return s.rank >= RAID_RANK && !peaceful(s) && s.guards.length > 0;
    case 'corkboard': return s.day >= 2 || s.battles.length > 0;
    case 'orders': return s.offers.length + s.orders.length > 0 || s.rank >= ORDER_TIERS.local.rank;
    case 'registry': return forSale(s).length > 0;
    default: return true; // the paper, the stand, the rank badge and Lottie's goals are there from Day 1
  }
}

/** What the HUD hands over for the menus it draws itself. */
export interface MenuParts {
  head: [string, string]; // today's Bugle headline
  goals: Goal[];
  crew: () => string; // the crew roster and Hiring Hall (hud.ts)
  options: Options;
}

const sheet = (id: MenuView, title: string, body: string) => `<div class="cl-modal-bg"><div class="cl-card-big cl-setup" data-testid="menu-${id}">
    <h1 class="cl-title">${title}</h1>${body}
    <div class="cl-setup-foot"><span></span><button class="cl-link" data-action="menu" data-menu="" data-testid="menu-done">Done</button></div>
  </div></div>`;
const row = (inner: string) => `<div class="cl-row wrap">${inner}</div>`;
const plotButton = (s: GameState, id: string, line: string, tip: string) => {
  const ps = s.plots[id];
  const color = ps.owner === 'player' ? '#F7C948' : ps.owner ? hex(FACTIONS[ps.owner as RivalId].color) : '#FFF1D6';
  return `<button class="cl-b tiny ghost" data-action="inspect" data-plot="${id}" title="${esc(tip)}"><span class="cl-dot" style="background:${color}"></span>${esc(line)}</button>`;
};

/** The corner's list of every menu open so far, each with its key. */
function index(s: GameState, o: Options): string {
  const open = MENU_IDS.filter((id) => menuUnlocked(s, id));
  return sheet('index', 'Menus', row(open.map((id) => `<button class="cl-b" data-action="menu" data-menu="${id}" data-testid="open-${id}" title="Key: ${keyName(o.keys[id])}">${MENU_LABEL[id]} <b>${keyName(o.keys[id])}</b></button>`).join('')));
}

type Day = GameState['history'][number];
const costsOf = (d: Day) => d.supplies + d.cupCosts + d.upkeep + d.tax;
const profitOf = (d: Day) => d.revenue - costsOf(d);

/** Daily profit as bars around zero and the Success Score as a line, the last 30 days. */
function charts(s: GameState): string {
  const days = s.history.slice(-30);
  if (!days.length) return '';
  const W = 300, H = 70, n = days.length, bw = W / n;
  const profit = days.map(profitOf), most = Math.max(1, ...profit.map(Math.abs));
  const bars = profit.map((p, i) => {
    const h = (Math.abs(p) / most) * (H / 2 - 2);
    return `<rect x="${(i * bw + bw * 0.15).toFixed(1)}" y="${(p >= 0 ? H / 2 - h : H / 2).toFixed(1)}" width="${(bw * 0.7).toFixed(1)}" height="${Math.max(1, h).toFixed(1)}" rx="1.5" fill="${p >= 0 ? '#7CC47F' : '#E8704F'}"><title>Day ${days[i].day}: ${signed(p)}</title></rect>`;
  }).join('');
  // The score at each day's close: the next day's opening score, and today's for the last one.
  const score = days.map((_, i) => days[i + 1]?.scoreBefore ?? successScore(s)), top = Math.max(1, ...score);
  const pts = score.map((v, i) => `${(i * bw + bw / 2).toFixed(1)},${(H - 3 - (v / top) * (H - 8)).toFixed(1)}`).join(' ');
  const dots = score.map((v, i) => `<circle cx="${(i * bw + bw / 2).toFixed(1)}" cy="${(H - 3 - (v / top) * (H - 8)).toFixed(1)}" r="2.2" fill="#2E2A4F"><title>Day ${days[i].day}: ${whole(v)}</title></circle>`).join('');
  const svg = (inner: string, label: string) => `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${label}" style="max-width:${W * 1.6}px;background:#fffdf6;border-radius:8px">${inner}</svg>`;
  return `${row(`<span class="cl-label" title="Each day's sales minus supplies, cups, upkeep and tax">Profit a day</span>`)}
    ${svg(`<line x1="0" y1="${H / 2}" x2="${W}" y2="${H / 2}" stroke="#2E2A4F" stroke-opacity=".25"/>${bars}`, 'Profit each day')}
    ${row(`<span class="cl-label" title="Your Success Score at each day's close">Success Score</span>`)}
    ${svg(`<polyline points="${pts}" fill="none" stroke="#2E2A4F" stroke-width="2" stroke-linejoin="round"/>${dots}`, 'Success Score each day')}`;
}

function ledger(s: GameState): string {
  const days = s.history.slice(-7).reverse();
  const table = `<table class="cl-books"><tr><td><b>Day</b></td><td><b>Cups · Sales · Costs · Profit</b></td></tr>${days.map((d) => `<tr><td>Day ${d.day}</td><td>${d.customers} · ${whole(d.revenue)} · ${whole(costsOf(d))} · <b class="${profitOf(d) >= 0 ? 'good' : 'bad'}">${signed(profitOf(d))}</b></td></tr>`).join('')}</table>`;
  return sheet('ledger', 'Ledger', `${charts(s)}${table}`);
}

function orders(s: GameState): string {
  const card = (o: GameState['offers'][number], waiting: boolean) => {
    const unit = o.tier === 'local' ? 'cups' : 'bottles';
    const stand = o.plot ? s.plots[o.plot]?.stand : undefined;
    const recipe = RECIPES[o.tier === 'local' && stand ? stand.recipe : 'classic'].label; // bottles are bottled Classic
    const due = o.tier === 'deal' ? `${DEAL_LOADS} weekly loads` : `day ${o.due}`;
    const risk = deliveryRaidRisk(s, o);
    const acts = waiting ? `<span class="cl-acts"><button class="cl-b go" data-action="accept" data-id="${o.id}">Take it</button><button class="cl-b ghost" data-action="decline" data-id="${o.id}" title="No thanks">✕</button></span>` : '';
    return `<div class="cl-ticket order${risk ? ' warn' : ''}" data-testid="order-card" title="${esc(`${ORDER_TIERS[o.tier].label} for ${o.client}${waiting ? `; offer good till day ${o.expires}` : '; accepted'}`)}">
      <b>${esc(o.client)}: ${whole(o.pay)}</b><span class="cl-note">${o.qty.toLocaleString('en-US')} ${unit} of ${recipe} · ${due}${risk ? ' · Delivery Raid possible' : ''}</span>${acts}</div>`;
  };
  const body = [...s.offers.map((o) => card(o, true)), ...s.orders.map((o) => card(o, false))].join('');
  return sheet('orders', 'Order Book', body || row('<span class="cl-note">No offers yet. They come with the Bugle.</span>'));
}

function rank(s: GameState): string {
  const ss = successScore(s);
  const rows = RANKS.map((r) => {
    const now = r.rank === s.rank, next = r.rank === s.rank + 1;
    return `<tr${now ? ' class="good"' : ''}><td>${now ? '<b>' : ''}R${r.rank} ${esc(r.title)}${now ? '</b>' : ''}</td><td>${whole(r.ss)}${next ? ` (${whole(r.ss - ss)} to go)` : ''}</td></tr>`;
  }).join('');
  return sheet('rank', 'Rank and Perks', `${row(`<span class="cl-note" title="Your best: ${whole(s.peakScore)}">Success Score ${whole(ss)}</span>`)}<table class="cl-books">${rows}</table>`);
}

function bugle(s: GameState, p: MenuParts): string {
  const w = s.forecast;
  const pack = (id: SupplyId) => s.market[id] * SUPPLIES[id].pack;
  const market = (Object.keys(SUPPLIES) as SupplyId[]).map((id) => `${SUPPLIES[id].label} ${pack(id) < 1 ? `${Math.round(pack(id) * 100)}¢` : `$${pack(id).toFixed(2)}`}`).join(' · ');
  const fights = s.battles.filter((b) => b.day === s.day - 1).length;
  // Today's events and the week's calendar, each with its district and length (spec: the Bugle prints them).
  const where = (id: FestivalId) => DISTRICT_BY_ID[FESTIVALS[id].district].name;
  const today = festivalsOn(s.day).map((id) => { const f = FESTIVALS[id], n = f.to - f.from + 1; return `Today: ${f.name}, ${where(id)}${n > 1 ? `, ${n} days` : ''}`; });
  const week = upcomingFestivals(s).map((x) => `${x.from === x.to ? `Day ${x.from}` : `Days ${x.from}-${x.to}`}: ${FESTIVALS[x.id].name}, ${where(x.id)}`);
  return sheet('bugle', 'The Citrine Bay Bugle', `${row(`<span class="cl-note">Morning edition · Day ${s.day}</span>`)}
    <span class="cl-tape cl-big">${esc(p.head[0])}</span><span class="cl-tape cl-sub">${esc(p.head[1])}</span>
    ${row(`<span class="cl-note" title="The forecast is right about 4 days in 5">${WEATHER[w.kind].label}, ${tempText(p.options, w.temp)}</span>`)}
    ${row(`<span class="cl-note" title="Market prices a pack today">${market}</span>`)}
    ${[...today, ...week].map((line) => row(`<span class="cl-note" data-testid="bugle-calendar">${esc(line)}</span>`)).join('')}
    ${fights ? row(`<span class="cl-note">${fights} fight${fights === 1 ? '' : 's'} last night</span>`) : ''}
    ${s.offers.length ? row(`<button class="cl-b go" data-action="menu" data-menu="orders">${s.offers.length} offer${s.offers.length === 1 ? '' : 's'} waiting</button>`) : ''}`);
}

function planner(s: GameState): string {
  const home = PLOT_BY_ID[s.selected];
  const near = raidTargets(s).sort((a, b) => Math.hypot(a.x - home.x, a.z - home.z) - Math.hypot(b.x - home.x, b.z - home.z)).slice(0, 12);
  return sheet('planner', 'Raid Planner', row(near.map((p) => plotButton(s, p.id, p.name, `${FACTIONS[s.plots[p.id].owner as RivalId].name} · ${DISTRICT_BY_ID[p.district].name}`)).join('') || '<span class="cl-note">Nothing to hit right now</span>'));
}

function corkboard(s: GameState): string {
  const rivals = (Object.keys(s.rivals) as RivalId[]).filter((id) => s.rivals[id].alive).map((id) => {
    const st = rivalStatus(s, id);
    return plotButton(s, hqPlot(id).id, `${FACTIONS[id].name}: ${st.weakened ? 'Weakened!' : `${st.plots} plots`}${st.truce ? ' · truce' : ''}`, `Worth about ${whole(st.worth)}; peak ${st.peak} plots${st.truce ? `; truce to day ${st.truce}` : ''}`);
  });
  return sheet('corkboard', 'Rivals Corkboard', row(rivals.join('') || '<span class="cl-note">Every rival is out!</span>'));
}

function registry(s: GameState): string {
  const plots = forSale(s).sort((a, b) => plotPrice(s, a.id) - plotPrice(s, b.id)).slice(0, 12);
  return sheet('registry', 'Land Registry', row(plots.map((p) => plotButton(s, p.id, `${p.name} · ${whole(plotPrice(s, p.id))}`, `${DISTRICT_BY_ID[p.district].name} · ~${p.baseTraffic} passersby a day`)).join('')));
}

/** The full-screen paper for `view` (empty for the Goals note and the Stand panel, which live on the map). */
export function menuScreen(s: GameState, view: MenuView, p: MenuParts): string {
  switch (view) {
    case 'index': return index(s, p.options);
    case 'ledger': return ledger(s);
    case 'orders': return orders(s);
    case 'rank': return rank(s);
    case 'bugle': return bugle(s, p);
    case 'crew': return sheet('crew', 'Crew roster', p.crew());
    case 'planner': return planner(s);
    case 'corkboard': return corkboard(s);
    case 'registry': return registry(s);
    default: return '';
  }
}
