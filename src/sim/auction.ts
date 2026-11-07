// Sealed-bid auctions at the Registry of Deeds (spec: Knock it down, buy it up;
// Fire Sale; selling plots). One plot per auction, open 24 game hours (it closes
// at the next dawn), sealed, open to Lottie and every rival still in the game.
// Bids start at the plot's land value when it opens; the highest bid wins and
// pays what it bid, and the plot changes hands with whatever stands on it.
// Pure functions over GameState, seeded like the rest of the sim.
import { AUCTION, BUILDING_VALUE_SHARE, FACTIONS, type RivalId } from './balance.ts';
import { BORDERS, LOTTIES_CORNER, PLOT_BY_ID, PLOTS, type FactionId } from './map.ts';
import { nextRandom, randomRange, type Rng } from './rng.ts';
import type { Blocker, GameState } from './economy.ts';
import { hasFoothold, rivalPrice } from './economy.ts';
import { FIRE_SALE, familySilver, HQS } from './rivals.ts';
import { isWrecked, NO_DEFENSE } from './crew.ts';
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

/** Preston's taunt after he outbids Lottie (spec: Phone taunts). */
export const PRESTON_OUTBID = "Hold, please. I'm on the other line, buying your street.";

/**
 * A boss rings the Corner's phone. Seam: story's phoneCall(s, who, text) after
 * merge; until then the line runs in the Bugle in the boss's voice.
 */
export function bossCall(s: GameState, who: RivalId, text: string): void {
  if (!s.rivals[who]?.alive) return;
  s.news.push(`${HQS[who].boss} phones the Corner: "${text}"`);
}

/**
 * Whoever outbids a rival earns its Grudge (spec: Grudge rises when that
 * faction outbids them). Seam: rivals' outbidBy(s, loser, winner) after merge;
 * until then only the Grudge toward Lottie exists, so a rival-versus-rival
 * outbid changes nothing.
 */
export function outbid(s: GameState, loser: RivalId, winner: FactionId): void {
  if (winner !== 'player') return;
  const r = s.rivals[loser];
  r.grudge = Math.min(100, r.grudge + AUCTION.outbidGrudge);
}

/** A VIP pickup booked at this plot's Helipad or Pier: the plot can't change hands until it's flown or shipped. */
export const pickupBooked = (s: GameState, plotId: string) => s.orders.some((o) => o.plot === plotId);

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

// ---------- selling: list a plot of yours ----------

export function canListPlot(s: GameState, plotId: string): Blocker {
  const ps = s.plots[plotId];
  if (ps?.owner !== 'player') return { ok: false, why: 'Not your plot' };
  if (plotId === LOTTIES_CORNER) return { ok: false, why: "Lottie's Corner stays in the family" };
  if (PLOT_BY_ID[plotId].type === 'hq') return { ok: false, why: 'A Trophy is never sold' };
  if (ps.auction) return { ok: false, why: 'Already on the block' };
  if (isWrecked(ps)) return { ok: false, why: ps.busted ? 'Fix it first' : 'Rebuild it first' };
  if (pickupBooked(s, plotId)) return { ok: false, why: 'A pickup is booked here' };
  return { ok: true };
}

/** Put a plot up for a 24-hour sealed-bid auction, bids from its land value. It keeps working until it sells. */
export function listPlot(s: GameState, plotId: string): boolean {
  if (!canListPlot(s, plotId).ok) return false;
  const ps = s.plots[plotId];
  ps.auction = { kind: 'listing', closes: s.day + 1, min: ps.landValue };
  s.news.push(`Skip Larkin: "${PLOT_BY_ID[plotId].name} is on the block! Sealed bids open at ${money(ps.landValue)} and close at dawn."`);
  return true;
}

export function unlistPlot(s: GameState, plotId: string): boolean {
  const ps = s.plots[plotId];
  if (ps?.owner !== 'player' || ps.auction?.kind !== 'listing') return false;
  delete ps.auction;
  s.news.push(`Skip Larkin: "Pulled ${PLOT_BY_ID[plotId].name} off the block. Your call, boss."`);
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

/** What the gavel did with the lots Lottie didn't bid on, for one line in the Bugle. */
interface Results { taken: string[]; unsold: string[] }

/** Dawn: every auction due closes. Rivals seal their bids now, from their Grow budget. */
export function closeAuctions(s: GameState): void {
  const due = PLOTS.filter((p) => (s.plots[p.id].auction?.closes ?? Infinity) <= s.day);
  if (!due.length) return;
  const rng = { seed: s.seed };
  const res: Results = { taken: [], unsold: [] };
  for (const p of due) settle(s, p.id, rng, res);
  s.seed = rng.seed;
  const taken = res.taken.length > 2 ? `${res.taken.length} plots go to rivals` : res.taken.join('; ');
  const unsold = res.unsold.length ? `No bids on ${res.unsold.length > 2 ? `${res.unsold.length} plots` : res.unsold.join(' or ')}: back For Sale at land value` : '';
  if (taken || unsold) s.news.push(`Skip Larkin: "Gavel's down. ${[taken, unsold].filter(Boolean).join('. ')}."`);
  announceControl(s);
  checkVictory(s);
}

function settle(s: GameState, plotId: string, rng: Rng, res: Results): void {
  const ps = s.plots[plotId];
  const a = ps.auction!;
  const name = PLOT_BY_ID[plotId].name;
  delete ps.auction;
  if (a.kind === 'listing') { sell(s, plotId, a, rng); return; }
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
  if (!win) { res.unsold.push(name); return; } // no bids: back to the Registry, unowned, at land value
  for (const b of bids) if (b !== win && b.who !== 'player') outbid(s, b.who as RivalId, win.who);
  if (win.who === 'player') {
    const cost = bidCost(s, win.amount);
    s.cash = round2(s.cash - cost); // ledger: land
    s.today.land = round2(s.today.land + cost);
    ps.owner = 'player';
    ps.garrison = 0;
    s.news.push(`Skip Larkin: "SOLD to Lottie's Lemonade! ${name} is yours for ${money(cost)}."`);
    return;
  }
  const id = win.who as RivalId;
  s.rivals[id].cash -= win.amount;
  ps.owner = id;
  if (ps.stand) ps.stand.price = rivalPrice(id, ps.stand.level, PLOT_BY_ID[plotId]);
  if (bids.some((b) => b.who === 'player')) {
    s.news.push(`Skip Larkin: "Outbid on ${name}. ${FACTIONS[id].name} went to ${money(win.amount)}."`);
    if (id === 'fizzco') bossCall(s, 'fizzco', PRESTON_OUTBID);
  } else res.taken.push(`${FACTIONS[id].name} take ${name} for ${money(win.amount)}`);
}

/** A plot Lottie listed: the rivals bid; the top bid's cash comes to her and the plot goes with what's built on it. */
function sell(s: GameState, plotId: string, a: Auction, rng: Rng): void {
  const ps = s.plots[plotId];
  const p = PLOT_BY_ID[plotId];
  if (ps.owner !== 'player') return; // lost some other way meanwhile
  if (isWrecked(ps)) { s.news.push(`Skip Larkin: "Nobody bids on a smashed plot. ${p.name} is still yours."`); return; }
  if (pickupBooked(s, plotId)) { s.news.push(`Skip Larkin: "Pulled ${p.name} off the block: a pickup is booked there."`); return; }
  const bids: Bid[] = [];
  for (const id of RIVALS) {
    if (!s.rivals[id].alive) continue;
    const amount = rivalBid(s, id, plotId, a, rng);
    if (amount >= a.min) bids.push({ who: id, amount });
  }
  const win = topBid(bids);
  if (!win) { s.news.push(`Skip Larkin: "No takers for ${p.name} at ${money(a.min)}. It's still yours."`); return; }
  for (const b of bids) if (b !== win) outbid(s, b.who as RivalId, win.who);
  const id = win.who as RivalId;
  s.rivals[id].cash -= win.amount;
  s.cash = round2(s.cash + win.amount); // ledger: land sale
  for (const g of s.guards) if (g.post === plotId) g.post = null; // posted guards go back to the Clubhouse
  s.offers = s.offers.filter((o) => o.plot !== plotId); // a VIP offer for this pad or pier lapses with it
  ps.owner = id;
  ps.garrison = 0;
  if (ps.stand) { ps.stand.price = rivalPrice(id, ps.stand.level, p); ps.stand.autoRestock = false; ps.stand.campaigns = {}; }
  s.news.push(`Skip Larkin: "SOLD! ${FACTIONS[id].name} pay ${money(win.amount)} for ${p.name}."`);
}
