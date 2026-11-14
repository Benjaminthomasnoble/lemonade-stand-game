// Sealed-bid auctions at the Registry of Deeds (spec: Knock it down, buy it up;
// Fire Sale; selling plots). One plot per auction, open 24 game hours (it closes
// at the next dawn), sealed, open to Lottie and every rival still in the game.
// Bids start at the plot's land value when it opens; the highest bid wins and
// pays what it bid, and the plot changes hands with whatever stands on it.
// The Lavender page (Rank 8) goes through the same sealed bids as a lot of its
// own. Pure functions over GameState, seeded like the rest of the sim.
import { AUCTION, BUILDING_VALUE_SHARE, FACTIONS, LAVENDER, type RivalId } from './balance.ts';
import { BORDERS, LOTTIES_CORNER, PLOT_BY_ID, PLOTS, type FactionId } from './map.ts';
import { nextRandom, randomRange, type Rng } from './rng.ts';
import type { Blocker, GameState } from './economy.ts';
import { hasFoothold, rivalPrice } from './economy.ts';
import { FIRE_SALE, familySilver, handOverKept, hqPlot } from './rivals.ts';
import { isWrecked, NO_DEFENSE } from './crew.ts';
import { announceControl, inPlay } from './land.ts';
import { checkVictory } from './modes.ts';
import { grantPage, movePage, pageHolder } from './recipes.ts';
import { phoneCall } from './phone.ts';
import { budgetOf, fitBudget, outbidBy, reserveOf, spend } from './rivalAi.ts';
import { freezeOn, runningSchemes, snipeBid } from './schemes.ts';
import { book } from './ledger.ts'; // the Ledger: each cash movement on its row
import { sharpPencil } from './perks.ts';

const RIVALS = Object.keys(FACTIONS) as RivalId[];
const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

export type AuctionKind = 'sale' | 'fire' | 'listing' | 'page';
export interface Auction {
  kind: AuctionKind; // For Sale after a Smash's First Dibs, a Fire Sale plot after its First Dibs, a plot Lottie listed, or the Lavender page
  closes: number; // it closes at this day's dawn
  min: number; // the opening bid: land value when it opened
  bid?: number; // Lottie's sealed bid, paid only if it wins
}
interface Bid { who: FactionId; amount: number }

/** The Lavender page auction: its sealed bids while they run, then who won. The page itself sits in Lottie's book or the winner's HQ (pageHolder). */
export interface Lavender {
  auction?: Auction; // open: sealed bids close at that dawn
  winner?: FactionId; // who won the auction
  paid?: number; // the winning bid
}
/** The Lavender page is bid on like a plot, under this lot id. */
export const LAVENDER_LOT = 'lavender';
/** The auction running on a lot: a plot id, or the Lavender page. */
export const auctionOf = (s: GameState, lot: string): Auction | undefined => (lot === LAVENDER_LOT ? s.lavender?.auction : s.plots[lot]?.auction);
const lotName = (lot: string) => (lot === LAVENDER_LOT ? 'the Lavender page' : PLOT_BY_ID[lot].name);

/** How hard a rival pushes its bids (FizzCo's Hostile Takeover outbids at auctions). The seam for rivals' per-faction bid strength. */
export const bidStrength = (id: RivalId) => AUCTION.push[id];

/** Preston's taunt after he outbids Lottie (spec: Phone taunts). */
export const PRESTON_OUTBID = "Hold, please. I'm on the other line, buying your street.";

/** Whoever outbids a rival earns its Grudge (spec: Grudge rises when that faction outbids them), Lottie or another rival. */
export function outbid(s: GameState, loser: RivalId, winner: FactionId): void {
  outbidBy(s, loser, winner);
}

/** A VIP pickup booked at this plot's Helipad or Pier: the plot can't change hands until it's flown or shipped. */
export const pickupBooked = (s: GameState, plotId: string) => s.orders.some((o) => o.plot === plotId);

/** What Lottie pays for a winning bid: Family Silver takes 10% off. */
export const bidCost = (s: GameState, amount: number) => Math.round(amount * familySilver(s) * sharpPencil(s)); // Sharp Pencil: 10% off (perks.ts)

/** Plots on the block. A listing of yours that changed hands some other way (sold to a Hostile Takeover offer) just waits for dawn to clear. */
export const auctionPlots = (s: GameState) => PLOTS.filter((p) => {
  const ps = s.plots[p.id];
  return !!ps.auction && (ps.auction.kind !== 'listing' || ps.owner === 'player');
});

/** The dawn a lot's gavel falls: the one after it opened, or the one after a Town Hall freeze on it ends (Sourwood's Old Money). */
export function auctionCloses(s: GameState, lot: string): number {
  const a = auctionOf(s, lot);
  if (!a) return Infinity;
  const freeze = freezeOn(s, lot);
  return freeze ? Math.max(a.closes, freeze.until + 1) : a.closes;
}

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

export function canBid(s: GameState, lot: string, amount: number): Blocker {
  const a = auctionOf(s, lot);
  if (!a) return { ok: false, why: 'No auction here' };
  if (a.kind === 'listing') return { ok: false, why: "It's your plot on the block" };
  if (a.kind === 'page' && !pageOnSale(s)) return { ok: false, why: 'Already in your book' };
  if (!(amount >= a.min)) return { ok: false, why: `Bids start at ${money(a.min)}` };
  if (s.cash < bidCost(s, amount)) return { ok: false, why: `Needs ${money(bidCost(s, amount))} on hand at dawn` };
  return { ok: true };
}

/** Seal a bid (or change it) on a plot or the Lavender page. Nothing is paid unless it wins at dawn. */
export function placeBid(s: GameState, lot: string, amount: number): boolean {
  if (!canBid(s, lot, amount).ok) return false;
  auctionOf(s, lot)!.bid = amount;
  s.news.push(`Skip Larkin: "Sealed and sent: ${money(amount)} on ${lotName(lot)}. We'll know at dawn."`);
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

export function withdrawBid(s: GameState, lot: string): boolean {
  const a = auctionOf(s, lot);
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

/** What a rival can bid on land: its Grow bucket (rivalAi.ts), as far as its cash covers it. */
const growBudget = (s: GameState, id: RivalId) => Math.floor(Math.max(0, Math.min(budgetOf(s, id).grow, s.rivals[id].cash)));
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
  const a = auctionOf(s, plotId);
  if (!a) return 0;
  if (a.kind === 'page') return pageGuess(s, a);
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

/**
 * A sale Town Hall froze can't close (Sourwood's Old Money: nobody buys a frozen plot). The lot waits for the dawn
 * after the freeze with its sealed bids, and a rival's snipe on it waits too.
 */
function waitOutFreeze(s: GameState, plotId: string): void {
  const a = s.plots[plotId].auction!;
  a.closes = auctionCloses(s, plotId);
  for (const x of runningSchemes(s)) if (x.kind === 'snipe' && x.plots.includes(plotId)) x.until = a.closes;
  s.news.push(`Skip Larkin: "Town Hall froze the sale of ${PLOT_BY_ID[plotId].name}. The gavel waits till dawn on day ${a.closes}."`);
}

/** Dawn: every auction due closes. Rivals seal their bids now, from their Grow budget (and, for the Lavender page, their cash above the reserve). */
export function closeAuctions(s: GameState): void {
  const ready = PLOTS.filter((p) => (s.plots[p.id].auction?.closes ?? Infinity) <= s.day);
  for (const p of ready) if (auctionCloses(s, p.id) > s.day) waitOutFreeze(s, p.id);
  const due = ready.filter((p) => s.plots[p.id].auction!.closes <= s.day);
  const page = (s.lavender?.auction?.closes ?? Infinity) <= s.day;
  if (!due.length && !page) return;
  const rng = { seed: s.seed };
  const res: Results = { taken: [], unsold: [] };
  for (const p of due) settle(s, p.id, rng, res);
  if (page) settlePage(s, rng);
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
  const yours = bids[0]?.amount; // Lottie's sealed bid, if it stands
  for (const id of RIVALS) {
    if (!s.rivals[id].alive) continue;
    const amount = snipeBid(s, id, plotId, rivalBid(s, id, plotId, a, rng), yours); // a rival sniping this lot tops your bid
    if (amount >= a.min) bids.push({ who: id, amount });
  }
  const win = topBid(bids);
  if (!win) { res.unsold.push(name); return; } // no bids: back to the Registry, unowned, at land value
  handOverKept(s, plotId, win.who); // rivals: a bought-out rival's building goes with its Fire Sale plot
  for (const b of bids) if (b !== win && b.who !== 'player') outbid(s, b.who as RivalId, win.who);
  if (win.who === 'player') {
    const cost = bidCost(s, win.amount);
    book(s, 'invested', -cost); // the Ledger's Invested row
    ps.owner = 'player';
    ps.garrison = 0;
    s.news.push(`Skip Larkin: "SOLD to Lottie's Lemonade! ${name} is yours for ${money(cost)}."`);
    return;
  }
  const id = win.who as RivalId;
  spend(s, id, 'grow', win.amount);
  ps.owner = id;
  if (ps.stand) ps.stand.price = rivalPrice(id, ps.stand.level, PLOT_BY_ID[plotId]);
  if (bids.some((b) => b.who === 'player')) {
    s.news.push(`Skip Larkin: "Outbid on ${name}. ${FACTIONS[id].name} went to ${money(win.amount)}."`);
    if (id === 'fizzco') phoneCall(s, 'fizzco', PRESTON_OUTBID, { mood: 'gloat' }); // Preston rings the Corner (src/sim/phone.ts)
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
  spend(s, id, 'grow', win.amount);
  book(s, 'invested', win.amount); // the Ledger: a plot sold comes back off Invested
  for (const g of s.guards) if (g.post === plotId) g.post = null; // posted guards go back to the Clubhouse
  s.offers = s.offers.filter((o) => o.plot !== plotId); // a VIP offer for this pad or pier lapses with it
  ps.owner = id;
  ps.garrison = 0;
  if (ps.stand) { ps.stand.price = rivalPrice(id, ps.stand.level, p); ps.stand.autoRestock = false; ps.stand.campaigns = {}; }
  s.news.push(`Skip Larkin: "SOLD! ${FACTIONS[id].name} pay ${money(win.amount)} for ${p.name}."`);
}

// ---------- the Lavender page (spec: Recipe pages; the Big Squeeze opens) ----------

/** What a rival can put into the page: its cash above its reserve (rivalAi.ts). A once-a-game prize, so bosses dig past their Grow budget. */
const pageSpend = (s: GameState, id: RivalId) => Math.max(0, s.rivals[id].cash - reserveOf(s, id));
/** A rival's push next to the hardest bidder's (FizzCo's): how close to the going rate it bids. */
const pagePush = (id: RivalId) => bidStrength(id) / Math.max(...RIVALS.map(bidStrength));

function rivalPageBid(s: GameState, id: RivalId, a: Auction, rng: Rng): number {
  const want = LAVENDER.value * pagePush(id) * randomRange(rng, LAVENDER.spread[0], LAVENDER.spread[1]);
  const room = pageSpend(s, id);
  return room < a.min ? 0 : Math.min(room, Math.round(want / 1000) * 1000);
}

function pageGuess(s: GameState, a: Auction): number {
  let best = 0;
  for (const id of RIVALS) {
    if (s.rivals[id].alive && pageSpend(s, id) >= a.min) best = Math.max(best, Math.min(pageSpend(s, id), LAVENDER.value * pagePush(id)));
  }
  return best ? roundUp(best) : 0;
}

/** The harp teacher still has the page to sell (a Sandbox fair win can bring it home first). */
function pageOnSale(s: GameState): boolean {
  return pageHolder(s, 'lavender') === 'harpTeacher';
}

/** The Lavender page's open auction, while the page is still for sale (the Registry shows the lot only then). */
export const lavenderLot = (s: GameState): Auction | undefined => (pageOnSale(s) ? s.lavender?.auction : undefined);

/**
 * From the first dawn at Rank 8: Vera's old harp teacher swaps her Hilltop
 * estate for a houseboat and auctions the Lavender page, once a game. Sealed
 * bids for 24 game hours, open to every faction; with no bids it runs again
 * the next day.
 */
export function openLavender(s: GameState): void {
  if (s.rank < LAVENDER.rank || s.lavender?.auction || !pageOnSale(s)) return;
  const first = !s.lavender;
  (s.lavender ??= {}).auction = { kind: 'page', closes: s.day + 1, min: LAVENDER.open };
  const who = inPlay(s, 'sourwood') ? "Vera's old harp teacher is swapping her Hilltop estate" : 'An old harp teacher is swapping her estate'; // a Sandbox without Vera (or the Hilltop)
  if (first) s.news.push(`Skip Larkin: "${who} for a houseboat, and she's auctioning the Lavender page! Sealed bids from ${money(LAVENDER.open)} close at dawn."`);
}

function settlePage(s: GameState, rng: Rng): void {
  const lv = s.lavender!;
  const a = lv.auction!;
  delete lv.auction;
  if (!pageOnSale(s)) { s.news.push('Skip Larkin: "The harp teacher calls it off: the Lavender page is already in your book."'); return; }
  const bids: Bid[] = [];
  if (a.bid !== undefined) {
    if (s.cash >= bidCost(s, a.bid)) bids.push({ who: 'player', amount: a.bid });
    else s.news.push(`Skip Larkin: "Your ${money(a.bid)} bid on the Lavender page bounced, kid. Keep the cash on hand till dawn."`);
  }
  for (const id of RIVALS) {
    if (!s.rivals[id].alive) continue;
    const amount = rivalPageBid(s, id, a, rng);
    if (amount >= a.min) bids.push({ who: id, amount });
  }
  const win = topBid(bids);
  if (!win) { s.news.push('Skip Larkin: "No bids on the Lavender page. The harp teacher tries again: sealed bids till dawn."'); return; }
  for (const b of bids) if (b !== win && b.who !== 'player') outbid(s, b.who as RivalId, win.who);
  if (win.who === 'player') {
    const cost = bidCost(s, win.amount);
    book(s, 'other', -cost); // the Ledger's Other row (spec: Money in, money out)
    lv.winner = 'player';
    lv.paid = cost;
    s.news.push(`Skip Larkin: "SOLD to Lottie's Lemonade! The Lavender page is yours for ${money(cost)}."`);
    grantPage(s, 'lavender'); // into Lottie's book: Lavender Lemonade to pour, and the morning's Bugle
    return;
  }
  const id = win.who as RivalId;
  spend(s, id, 'grow', win.amount); // Grow pays first; the rest comes out of what Guard and Strike had set aside
  fitBudget(s, id);
  lv.winner = id;
  lv.paid = win.amount;
  movePage(s, 'lavender', id); // it hangs in their HQ; recoverPage brings it home when they're out
  const hangs = `It hangs in ${hqPlot(id).name} till they fall.`;
  if (bids.some((b) => b.who === 'player')) {
    s.news.push(`Skip Larkin: "Outbid on the Lavender page. ${FACTIONS[id].name} went to ${money(win.amount)}. ${hangs}"`);
    if (id === 'fizzco') phoneCall(s, 'fizzco', PRESTON_OUTBID, { mood: 'gloat' }); // Preston rings the Corner (src/sim/phone.ts)
  } else s.news.push(`Skip Larkin: "Gavel's down: ${FACTIONS[id].name} take the Lavender page for ${money(win.amount)}. ${hangs}"`);
}
