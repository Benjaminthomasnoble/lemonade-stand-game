// Sealed-bid auctions at the Registry of Deeds (spec: Knock it down, buy it up;
// Fire Sale; selling plots). One plot per auction, open 24 game hours (it closes
// at the next dawn), sealed, open to Lottie and every rival still in the game.
// Bids start at the plot's land value when it opens; the highest bid wins and
// pays what it bid, and the plot changes hands with whatever stands on it.
// Pure functions over GameState, seeded like the rest of the sim.
import { AUCTION, BUILDING_VALUE_SHARE, FACTIONS, type RivalId } from './balance.ts';
import { BORDERS, PLOT_BY_ID, PLOTS, type FactionId } from './map.ts';
import { nextRandom, randomRange, type Rng } from './rng.ts';
import type { Blocker, GameState } from './economy.ts';
import { hasFoothold, rivalPrice } from './economy.ts';
import { FIRE_SALE, familySilver, HQS } from './rivals.ts';
import { NO_DEFENSE } from './crew.ts';
import { announceControl } from './land.ts';
import { checkVictory } from './modes.ts';

const RIVALS = Object.keys(FACTIONS) as RivalId[];
const round2 = (n: number) => Math.round(n * 100) / 100;
const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

export type AuctionKind = 'sale' | 'fire' | 'listing';
export interface Auction {
  kind: AuctionKind; // For Sale after a Smash's First Dibs, a Fire Sale plot after its First Dibs, or a plot Lottie listed
  closes: number; // it closes at this day's dawn
  min: number; // the opening bid: land value when it opened
  bid?: number; // Lottie's sealed bid, paid only if it wins
}
interface Bid { who: FactionId; amount: number }

/** How hard a rival pushes its bids (FizzCo's Hostile Takeover outbids at auctions). The seam for rivals' per-faction bid strength. */
export const bidStrength = (id: RivalId) => AUCTION.push[id];

/** What Lottie pays for a winning bid: Family Silver takes 10% off. */
export const bidCost = (s: GameState, amount: number) => Math.round(amount * familySilver(s));

export const auctionPlots = (s: GameState) => PLOTS.filter((p) => s.plots[p.id].auction);

/**
 * Elimination: every plot the rival held goes to a Fire Sale, cleared of its
 * buildings. Lottie has First Dibs at 75% of land value for 2 days; then each
 * unsold plot opens a 24-hour auction to the factions still in the game.
 */
export function startFireSale(s: GameState, id: RivalId): void {
  let sale = 0;
  for (const p of PLOTS) {
    const ps = s.plots[p.id];
    if (ps.owner !== id) continue;
    if (p.type === 'hq') { s.plots[p.id] = { ...ps, owner: null, garrison: 0 }; continue; }
    s.plots[p.id] = {
      owner: null, stand: null, invested: 0, landValue: ps.landValue, defense: NO_DEFENSE(),
      dibs: { who: 'player', until: s.day + FIRE_SALE.days - 1, price: Math.round(ps.landValue * FIRE_SALE.share) },
    };
    sale++;
  }
  if (sale) s.news.push(`FIRE SALE: ${sale} ${FACTIONS[id].name} plot${sale === 1 ? '' : 's'} at 25% off. Lottie has First Dibs for ${FIRE_SALE.days} days, then they go to auction.`);
}

/** Open a 24-hour sealed-bid auction on a plot, bids from its land value (any First Dibs is over). */
export function openAuction(s: GameState, plotId: string, kind: AuctionKind): void {
  const ps = s.plots[plotId];
  delete ps.dibs;
  ps.auction = { kind, closes: s.day + 1, min: ps.landValue };
}

/** Bids read as round numbers: two significant figures, rounded up ($700, $1,200, $48,000). */
function roundUp(n: number): number {
  if (n < 100) return Math.ceil(n);
  const unit = 10 ** (Math.floor(Math.log10(n)) - 1);
  return Math.ceil(n / unit - 1e-9) * unit;
}

/** The bid buttons: the opening bid, then round steps above it. */
export const bidSteps = (a: Auction) => [...new Set([a.min, ...AUCTION.steps.slice(1).map((m) => Math.max(a.min, roundUp(a.min * m)))])];

export function canBid(s: GameState, plotId: string, amount: number): Blocker {
  const a = s.plots[plotId]?.auction;
  if (!a) return { ok: false, why: 'No auction here' };
  if (a.kind === 'listing') return { ok: false, why: "It's your plot on the block" };
  if (!(amount >= a.min)) return { ok: false, why: `Bids start at ${money(a.min)}` };
  if (s.cash < bidCost(s, amount)) return { ok: false, why: `Needs ${money(bidCost(s, amount))} on hand at dawn` };
  return { ok: true };
}

/** Seal a bid (or change it). Nothing is paid unless it wins at dawn. */
export function placeBid(s: GameState, plotId: string, amount: number): boolean {
  if (!canBid(s, plotId, amount).ok) return false;
  s.plots[plotId].auction!.bid = amount;
  s.news.push(`Skip Larkin: "Sealed and sent: ${money(amount)} on ${PLOT_BY_ID[plotId].name}. We'll know at dawn."`);
  return true;
}

export function withdrawBid(s: GameState, plotId: string): boolean {
  const a = s.plots[plotId]?.auction;
  if (a?.bid === undefined) return false;
  delete a.bid;
  return true;
}

// ---------- the rivals' sealed bids ----------

/** How keen a rival is on a plot: its home turf, a district where it holds a Foothold, next door to either, or anywhere else. */
export function rivalInterest(s: GameState, id: RivalId, plotId: string): number {
  const d = PLOT_BY_ID[plotId].district;
  const home = FACTIONS[id].home;
  if (d === home) return AUCTION.interest.home;
  if (hasFoothold(s, id, d)) return AUCTION.interest.foothold;
  if (BORDERS[d].some((b) => b === home || hasFoothold(s, id, b))) return AUCTION.interest.border;
  return AUCTION.interest.away;
}

/** A rival's Grow budget, the share of its cash it spends on land (as at dawn). */
const growBudget = (s: GameState, id: RivalId) => Math.floor(Math.max(0, s.rivals[id].cash - 2000) * FACTIONS[id].grow);
/** What's on the block: the land at its opening bid plus 75% of what's built on it. */
const worth = (s: GameState, plotId: string, a: Auction) => a.min + BUILDING_VALUE_SHARE * s.plots[plotId].invested;

function rivalBid(s: GameState, id: RivalId, plotId: string, a: Auction, rng: Rng): number {
  const interest = rivalInterest(s, id, plotId);
  if (nextRandom(rng) >= interest) return 0;
  const keen = 1 + AUCTION.markup * interest * bidStrength(id) * randomRange(rng, 0.5, 1.5);
  const budget = growBudget(s, id);
  return budget < a.min ? 0 : Math.min(budget, Math.round(worth(s, plotId, a) * keen));
}

/** Skip Larkin's read on the room: about what the keenest rival that can afford it would bid (0 if none can). */
export function bidGuess(s: GameState, plotId: string): number {
  const a = s.plots[plotId].auction;
  if (!a) return 0;
  let best = 0;
  for (const id of RIVALS) {
    const budget = growBudget(s, id);
    if (!s.rivals[id].alive || budget < a.min) continue;
    const typical = Math.round(worth(s, plotId, a) * (1 + AUCTION.markup * rivalInterest(s, id, plotId) * bidStrength(id)));
    best = Math.max(best, Math.min(budget, typical));
  }
  return roundUp(best);
}

/** The highest bid wins; a tie goes to Lottie, then to the rival that pushes harder. */
function topBid(bids: Bid[]): Bid | null {
  const rank = (b: Bid) => (b.who === 'player' ? Infinity : bidStrength(b.who as RivalId));
  return bids.reduce<Bid | null>((best, b) => (!best || b.amount > best.amount || (b.amount === best.amount && rank(b) > rank(best)) ? b : best), null);
}

// ---------- closing ----------

/** Dawn: every auction due closes. Rivals seal their bids now, from their Grow budget. */
export function closeAuctions(s: GameState): void {
  const due = PLOTS.filter((p) => (s.plots[p.id].auction?.closes ?? Infinity) <= s.day);
  if (!due.length) return;
  const rng = { seed: s.seed };
  for (const p of due) settle(s, p.id, rng);
  s.seed = rng.seed;
  announceControl(s);
  checkVictory(s);
}

function settle(s: GameState, plotId: string, rng: Rng): void {
  const ps = s.plots[plotId];
  const a = ps.auction!;
  const name = PLOT_BY_ID[plotId].name;
  delete ps.auction;
  if (ps.owner) return; // someone took it some other way; nothing to sell
  const bids: Bid[] = [];
  if (a.bid !== undefined) {
    if (s.cash >= bidCost(s, a.bid)) bids.push({ who: 'player', amount: a.bid });
    else s.news.push(`Skip Larkin: "Your ${money(a.bid)} bid on ${name} bounced, kid. Keep the cash on hand till dawn."`);
  }
  for (const id of RIVALS) {
    if (!s.rivals[id].alive) continue;
    const amount = rivalBid(s, id, plotId, a, rng);
    if (amount >= a.min) bids.push({ who: id, amount });
  }
  const win = topBid(bids);
  if (!win) return; // no bids: back to the Registry, unowned, at land value
  if (win.who === 'player') {
    const cost = bidCost(s, win.amount);
    s.cash = round2(s.cash - cost); // ledger: land
    s.today.land = round2(s.today.land + cost);
    ps.owner = 'player';
    ps.garrison = 0;
    for (const b of bids) if (b.who !== 'player') { const r = s.rivals[b.who as RivalId]; r.grudge = Math.min(100, r.grudge + AUCTION.outbidGrudge); }
    s.news.push(`Skip Larkin: "SOLD to Lottie's Lemonade! ${name} is yours for ${money(cost)}."`);
    return;
  }
  const id = win.who as RivalId;
  s.rivals[id].cash -= win.amount;
  ps.owner = id;
  if (ps.stand) ps.stand.price = rivalPrice(id, ps.stand.level, PLOT_BY_ID[plotId]);
  if (a.bid !== undefined && bids.some((b) => b.who === 'player')) {
    s.news.push(`Skip Larkin: "Outbid on ${name}. ${FACTIONS[id].name} went to ${money(win.amount)}."`);
    if (id === 'fizzco') s.news.push(`${HQS.fizzco.boss}, on the car phone: "Sealed bid, open checkbook. FizzCo always closes, kid."`);
  }
}
