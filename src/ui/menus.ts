// The ten paper menus (spec: Menus): Morning Bugle, Ledger, Stand panel, Crew
// roster, Raid Planner, Rivals Corkboard, Order Book, Land Registry, Rank and
// Perks, Lottie's Goals. Each opens from its meter on the top bar, its key
// (Options: Keys), the corner's menu list, or a tap on the thing it describes,
// and none shows before its system unlocks. Most are full-screen paper, which
// pauses the clock (Options); Lottie's Goals is her sticky note and the Stand
// panel is the stand's own card. Clicks go through the HUD's one listener.
// The Morning Bugle is world's front page (src/ui/bugle.ts) and the Corkboard
// the rivals lane's board (corkboard.ts); the Land Registry is the land lane's
// screen (registry.ts, which hud.ts draws). The Raid Planner lists the nearest
// targets and mounts crew's planner (src/ui/raidPlanner.ts) for the one picked,
// the same panel as on its plot card; Rank and Perks shows the rank ladder,
// a rank-up's hand of Lottie's Tips to pick from and the tips you keep (src/ui/perks.ts).
import { glyph } from './clay.ts';
import {
  deliveryRaidRisk, FACTIONS, ORDER_TIERS, PLOT_BY_ID, RAID_RANK, RANKS, RECIPES,
  dayIncomeCosts, dayProfit, peaceful, raidTargets, successScore, DISTRICT_BY_ID, FESTIVALS, festivalsOn, siegeNight, siegeTargets,
  type FestivalId, type GameState, type Goal, type RivalId,
} from '../sim/economy.ts';
import { MENU_IDS, type MenuId, type Options } from '../settings.ts';
import { keyName } from './keys.ts';
import { bugleSheet } from './bugle.ts';
import { corkboardBody } from './corkboard.ts';
import { matchButton, orderNote, orderWhen, recipeOf } from './orders.ts';
import { registryOpen } from './registry.ts';
import { taught } from '../sim/story.ts';
import { scoreLine } from './ledger.ts';
import { perksSheet } from './perks.ts';

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

/** Nothing appears before its system unlocks. */
export function menuUnlocked(s: GameState, id: MenuId): boolean {
  switch (id) {
    case 'ledger': return s.history.length > 0; // after the first day's books
    case 'crew': return s.guards.length > 0 || (s.recruits.length > 0 && taught(s, 'crew')); // the Hiring Hall waits for Day 6's lesson
    case 'planner': return s.rank >= RAID_RANK && !peaceful(s) && s.guards.length > 0;
    case 'corkboard': return s.day >= 2 || s.battles.length > 0;
    case 'orders': return s.offers.length + s.orders.length > 0 || s.rank >= ORDER_TIERS.local.rank;
    case 'registry': return registryOpen(s); // Week 2's land lesson (src/ui/registry.ts draws it; story.ts taught)
    case 'rank': return taught(s, 'rank'); // with its badge on the top bar (the rank lesson, src/sim/story.ts)
    default: return true; // the paper, the stand and Lottie's goals are there from Day 1
  }
}

/** What the HUD hands over for the menus it draws itself. */
export interface MenuParts {
  head: [string, string]; // today's Bugle headline (the Bugle menu prints world's front page, which carries it too)
  goals: Goal[];
  crew: () => string; // the crew roster and Hiring Hall (hud.ts)
  options: Options;
  /** The Raid Planner's pick (the HUD keeps it) and crew's planner panel for a plot (src/ui/raidPlanner.ts). */
  plan?: { target: string | null; panel: (plotId: string) => string };
}

const sheet = (id: MenuView, title: string, body: string) => `<div class="cl-modal-bg"><div class="cl-card-big cl-setup" data-testid="menu-${id}">
    <h1 class="cl-title">${title}</h1>${body}
    <div class="cl-setup-foot"><span></span><button class="cl-link" data-action="menu" data-menu="" data-testid="menu-done">Done</button></div>
  </div></div>`;
const row = (inner: string) => `<div class="cl-row wrap">${inner}</div>`;
const plotButton = (s: GameState, id: string, line: string, tip: string, action = 'inspect', on = false) => {
  const ps = s.plots[id];
  const color = ps.owner === 'player' ? '#F7C948' : ps.owner ? hex(FACTIONS[ps.owner as RivalId].color) : '#FFF1D6';
  const pressed = action === 'inspect' ? '' : ` aria-pressed="${on}"`;
  return `<button class="cl-b tiny ${on ? 'go' : 'ghost'}" data-action="${action}" data-plot="${id}" title="${esc(tip)}"${pressed}><span class="cl-dot" style="background:${color}"></span>${esc(line)}</button>`;
};

/** The corner's list of every menu open so far, each with its key. */
function index(s: GameState, o: Options): string {
  const open = MENU_IDS.filter((id) => menuUnlocked(s, id));
  return sheet('index', 'Menus', row(open.map((id) => `<button class="cl-b" data-action="menu" data-menu="${id}" data-testid="open-${id}" title="Key: ${keyName(o.keys[id])}">${MENU_LABEL[id]} <b>${keyName(o.keys[id])}</b></button>`).join('')));
}

type Day = GameState['history'][number];
const profitOf = (d: Day) => dayProfit(d); // the Ledger's rows (ledger.ts)

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
  const svg = (inner: string, label: string) => `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${label}" style="max-width:${W * 1.6}px;background:#fffdf6;border-radius:8px">${inner}</svg>`;
  return `${row(`<span class="cl-label" title="Each day's profit in the Ledger: sales and orders less supplies used, upkeep, wages and the rest">Profit a day</span>`)}
    ${svg(`<line x1="0" y1="${H / 2}" x2="${W}" y2="${H / 2}" stroke="#2E2A4F" stroke-opacity=".25"/>${bars}`, 'Profit each day')}
    ${row(`<span class="cl-label" title="Your Success Score at each day's close, from Day 1: gold where a rank came, green at the peak">Success Score</span>`)}
    ${scoreLine(s)}`;
}

function ledger(s: GameState): string {
  const days = s.history.slice(-7).reverse();
  const cell = (d: Day) => { const { income, costs } = dayIncomeCosts(d); return `${d.customers} · ${whole(income)} · ${whole(costs)}`; }; // its rows above and below zero (ledger.ts)
  const table = `<table class="cl-books"><tr><td><b>Day</b></td><td title="Income: sales, orders, prizes and loot won. Costs: every row below zero"><b>Cups · Income · Costs · Profit</b></td></tr>${days.map((d) => `<tr><td>Day ${d.day}</td><td>${cell(d)} · <b class="${profitOf(d) >= 0 ? 'good' : 'bad'}">${signed(profitOf(d))}</b></td></tr>`).join('')}</table>`;
  return sheet('ledger', 'Ledger', `${charts(s)}${table}`);
}

function orders(s: GameState): string {
  const card = (o: GameState['offers'][number], waiting: boolean) => {
    const unit = o.tier === 'local' ? 'cups' : 'bottles';
    const recipe = RECIPES[recipeOf(s, o)].label; // world: the client's recipe, a Local Order its stand's (src/ui/orders.ts)
    const due = orderWhen(s, o, waiting); // world: the deadline, or how far a job you took has loaded
    const risk = deliveryRaidRisk(s, o);
    const acts = waiting ? `<span class="cl-acts"><button class="cl-b go" data-action="accept" data-id="${o.id}">Take it</button>${matchButton(s, o)}<button class="cl-b ghost" data-action="decline" data-id="${o.id}" title="No thanks" aria-label="No thanks">${glyph('close')}</button></span>` : '';
    return `<div class="cl-ticket order${risk ? ' warn' : ''}" data-testid="order-card" title="${esc(`${ORDER_TIERS[o.tier].label} for ${o.client}${waiting ? `; offer good till day ${o.expires}` : '; accepted'}`)}">
      <b>${esc(o.client)}: ${whole(o.pay)}</b><span class="cl-note">${o.qty.toLocaleString('en-US')} ${unit} of ${recipe} · ${due}${risk ? ' · Delivery Raid possible' : ''}${esc(orderNote(s, o, waiting))}</span>${acts}</div>`;
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
  return sheet('rank', 'Rank and Perks', `${row(`<span class="cl-note" title="Your best: ${whole(s.peakScore)}">Success Score ${whole(ss)}</span>`)}<table class="cl-books">${rows}</table>${perksSheet(s)}`);
}

/** The Morning Bugle: world's front page (headline, briefs, events, forecast, Market, the week ahead; celsius: the °C
 * option), then the festivals on today, which its calendar of the days ahead leaves out, and the offers waiting. */
function bugle(s: GameState, celsius: boolean): string {
  const where = (id: FestivalId) => DISTRICT_BY_ID[FESTIVALS[id].district].name;
  const today = festivalsOn(s.day).map((id) => { const f = FESTIVALS[id], n = f.to - f.from + 1; return `Today: ${f.name}, ${where(id)}${n > 1 ? `, ${n} days` : ''}`; });
  return sheet('bugle', 'Morning Bugle', `${bugleSheet(s, celsius)}
    ${today.map((line) => row(`<span class="cl-note" data-testid="bugle-today">${esc(line)}</span>`)).join('')}
    ${s.offers.length ? row(`<button class="cl-b go" data-action="menu" data-menu="orders">${s.offers.length} offer${s.offers.length === 1 ? '' : 's'} waiting</button>`) : ''}`);
}

/** The 12 rival plots nearest your selected stand, nearest first: the Raid Planner's list. */
export function plannerTargets(s: GameState): string[] {
  const home = PLOT_BY_ID[s.selected];
  return raidTargets(s).sort((a, b) => Math.hypot(a.x - home.x, a.z - home.z) - Math.hypot(b.x - home.x, b.z - home.z)).slice(0, 12).map((p) => p.id);
}

/** The Raid Planner: the nearest targets to pick from, and crew's planner for the one picked (the nearest until you
 * pick), with a way to its card on the map. Without the HUD's planner, each target opens its plot card. */
function planner(s: GameState, plan?: MenuParts['plan']): string {
  const near = plannerTargets(s);
  if (!near.length) return sheet('planner', 'Raid Planner', row('<span class="cl-note">Nothing to hit right now</span>'));
  const tip = (id: string) => `${FACTIONS[s.plots[id].owner as RivalId].name} · ${DISTRICT_BY_ID[PLOT_BY_ID[id].district].name}`;
  if (!plan) return sheet('planner', 'Raid Planner', row(near.map((id) => plotButton(s, id, PLOT_BY_ID[id].name, tip(id))).join('')));
  const pick = near.find((id) => id === plan.target) ?? near[0];
  const chips = near.map((id) => plotButton(s, id, PLOT_BY_ID[id].name, tip(id), 'planTarget', id === pick)).join('');
  const head = row(`<b data-testid="plan-target">${esc(PLOT_BY_ID[pick].name)}</b><span class="cl-note">${esc(tip(pick))}</span><button class="cl-b tiny ghost" data-action="inspect" data-plot="${pick}" title="Fly there and open its card">Show on map</button>`);
  return sheet('planner', 'Raid Planner', `${row(chips)}${head}${plan.panel(pick)}`);
}

/** The Big Squeeze: tonight's siege targets, pinned over the rivals' board each siege dawn (squeeze.ts names them;
 * the bosses' own pins show where a normal raid would go). */
function siegePins(s: GameState): string {
  const siege = siegeTargets(s).map((id) => plotButton(s, id, PLOT_BY_ID[id].name, "Tonight's siege target"));
  return siege.length ? row(`<span class="cl-note">Siege night ${siegeNight(s)}: they hit</span>${siege.join('')}`) : '';
}

/** The full-screen paper for `view` (empty for the Goals note and the Stand panel, which live on the map, and for the
 * Land Registry, which hud.ts draws from registry.ts). */
export function menuScreen(s: GameState, view: MenuView, p: MenuParts): string {
  switch (view) {
    case 'index': return index(s, p.options);
    case 'ledger': return ledger(s);
    case 'orders': return orders(s);
    case 'rank': return rank(s);
    case 'bugle': return bugle(s, p.options.celsius);
    case 'crew': return sheet('crew', 'Crew roster', p.crew());
    case 'planner': return planner(s, p.plan);
    case 'corkboard': return sheet('corkboard', 'Rivals Corkboard', siegePins(s) + corkboardBody(s));
    default: return '';
  }
}
