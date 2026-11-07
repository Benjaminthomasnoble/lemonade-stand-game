// Rival schemes that aren't raids (spec: Rivals, How rivals think: "Strike funds
// raids and schemes like price wars and smear posters"; Threat: such schemes
// "come more often with each lemon"). Each dawn a rival with no scheme running
// may start one, paid from its Strike bucket: a price war at its stands that
// share customers with yours, the Cold Brew Collective's smear posters on one
// of your stands, a snipe at an auction you bid on, or FizzCo's Hostile
// Takeover: a Cease-and-Desist on your marketing in one district, or an offer
// to buy one of your plots. The Bugle reports each one. Pure and seeded, like
// the rest of the sim.
import { BRAND_TIERS, CAMPAIGNS, FACTIONS, type CampaignId, type RivalId } from './balance.ts';
import { BORDERS, DISTRICT_BY_ID, DISTRICTS, LOTTIES_CORNER, nearbyPlots, PLOT_BY_ID, PLOTS, type DistrictId, type FactionId } from './map.ts';
import { nextRandom, type Rng } from './rng.ts';
import type { GameState, Stand } from './economy.ts';
import { ownedPlots, rivalPrice } from './economy.ts';
import { detectionChance, threatLevel } from './crew.ts';
import { addGrudge, budgetOf, canSpend, chargeStrike, keptShare, spend, tauntsAtDawn } from './rivalAi.ts';
import { CEASE, inTruce, SCHEMES, TAKEOVER } from './rivals.ts';
import { alert } from './alerts.ts';
import { phoneCall } from './phone.ts';

export type SchemeKind = 'priceWar' | 'posters' | 'snipe' | 'cease' | 'buyout';
export interface Scheme {
  kind: SchemeKind;
  by: RivalId;
  day: number; // the dawn it started
  until: number; // it runs through this day
  plots: string[]; // a price war: the rival's stands in it; posters: your stand they hit; a snipe: the lot; a letter: your stands it hit; an offer: your plot
  district?: DistrictId; // a Cease-and-Desist: the district it blocks
  price?: number; // a buyout offer: what they'd pay you
  caught?: boolean; // posters: your night watch caught the crew
  cost?: number; // what Strike has paid for it so far
  done?: boolean; // over: it ran its days, Strike ran dry, or the snipe went off
}

const RIVALS = Object.keys(FACTIONS) as RivalId[];
const round2 = (n: number) => Math.round(n * 100) / 100;
const short = (id: RivalId) => FACTIONS[id].name;
const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

/**
 * The schemes each rival reaches for, most likely first (spec: Cold Brew's posters, FizzCo's auction outbids and
 * Cease-and-Desist letters; a price war is anyone's). Each dawn's order is a seeded draw weighted this way.
 */
const PREFERS: Record<RivalId, SchemeKind[]> = {
  coldbrew: ['posters', 'priceWar', 'snipe'],
  fizzco: ['snipe', 'cease', 'buyout', 'priceWar'],
  sourwood: ['priceWar', 'snipe'],
  hollis: ['priceWar', 'snipe'],
  blenders: ['priceWar', 'snipe'],
};

/** The order a rival tries its schemes in this dawn: a seeded draw that favors the ones it reaches for first. */
function tryOrder(id: RivalId, rng: Rng): SchemeKind[] {
  const left = PREFERS[id].map((kind, i, all) => ({ kind, w: all.length - i }));
  const out: SchemeKind[] = [];
  while (left.length > 1) {
    let x = nextRandom(rng) * left.reduce((a, k) => a + k.w, 0);
    const i = left.findIndex((k) => (x -= k.w) < 0);
    out.push(left.splice(i < 0 ? left.length - 1 : i, 1)[0].kind);
  }
  return [...out, ...left.map((k) => k.kind)];
}

/** The schemes running today (started, not yet over). */
export const runningSchemes = (s: GameState) => (s.schemes ?? []).filter((x) => !x.done && x.day <= s.day && x.until >= s.day);
const runningFor = (s: GameState, id: RivalId) => runningSchemes(s).find((x) => x.by === id);

// ---------- price war ----------

/**
 * What a rival's price is multiplied by at a plot: 1 - the cut while its price war runs there, else 1. The seam for
 * demand's rival pricing (rivalPrice multiplies by it once that lands); until then schemes.ts sets the cut price on the
 * stand itself each dawn of the war.
 */
export function priceWarCut(s: GameState, id: RivalId, plotId: string): number {
  return runningSchemes(s).some((x) => x.kind === 'priceWar' && x.by === id && x.plots.includes(plotId)) ? 1 - SCHEMES.priceWar.cut : 1;
}

/** A rival stand's everyday price, with its price war's cut if one runs there. */
function setPrice(s: GameState, id: RivalId, plotId: string): void {
  const st = s.plots[plotId].stand;
  if (st && s.plots[plotId].owner === id) st.price = round2(rivalPrice(id, st.level, PLOT_BY_ID[plotId]) * priceWarCut(s, id, plotId));
}

/** A rival's intact stands that share passers-by with one of yours (the same street, within 2 plots). */
export function warFront(s: GameState, id: RivalId): string[] {
  const intact = (plotId: string, who: string) => {
    const ps = s.plots[plotId];
    return ps.owner === who && !!ps.stand && !ps.stand.wrecked && PLOT_BY_ID[plotId].type !== 'hq';
  };
  return PLOTS.filter((p) => intact(p.id, id) && nearbyPlots(p).some((q) => intact(q.id, 'player'))).map((p) => p.id);
}

/** What a day of the war costs the rival at one stand: the cut on every cup it sold, as it shows in its trade. */
const dayLost = (s: GameState, id: RivalId, plotId: string, revenue: number, cutIn: boolean) =>
  revenue * (cutIn ? SCHEMES.priceWar.cut / (1 - SCHEMES.priceWar.cut) : SCHEMES.priceWar.cut) * keptShare(s, id, plotId);

function startPriceWar(s: GameState, id: RivalId): Scheme | null {
  const front = warFront(s, id);
  if (!front.length) return null;
  // Strike must be able to pay the whole war at yesterday's trade.
  const est = front.reduce((t, p) => t + dayLost(s, id, p, s.plots[p].stand!.day.revenue, false), 0) * SCHEMES.priceWar.days;
  if (budgetOf(s, id).strike < est) return null;
  const war: Scheme = { kind: 'priceWar', by: id, day: s.day, until: s.day + SCHEMES.priceWar.days - 1, plots: front, cost: 0 };
  s.schemes!.push(war);
  for (const p of front) setPrice(s, id, p);
  s.news.push(`Bugle: Price war! ${short(id)} cut prices near Lottie's`);
  return war;
}

/** Dawn: Strike pays for yesterday's cut; the war ends when its days are up or Strike can't pay. */
function runPriceWar(s: GameState, war: Scheme): void {
  const id = war.by;
  if (s.day > war.day) {
    let lost = 0;
    for (const p of war.plots) {
      const st = s.plots[p].stand;
      if (st && s.plots[p].owner === id) lost += dayLost(s, id, p, st.day.revenue, true);
    }
    lost = round2(lost);
    const paid = chargeStrike(s, id, lost);
    if (paid) war.cost = round2((war.cost ?? 0) + lost);
    if (!paid || s.day > war.until) {
      war.done = true;
      war.until = Math.min(war.until, s.day - 1);
      s.news.push(paid ? `Bugle: Price war over: ${short(id)} back to full price` : `Bugle: ${short(id)} call off their price war`);
    }
  }
  for (const p of war.plots) setPrice(s, id, p); // back to the everyday price once it's over; an upgrade keeps the cut
}

// ---------- smear posters ----------

/** Cold Brew's poster crew goes for your stand nearest its turf (the busiest of those, on a tie). */
function posterTarget(s: GameState, id: RivalId): string | null {
  const theirs = PLOTS.filter((p) => s.plots[p.id].owner === id);
  const away = (p: (typeof PLOTS)[number]) => Math.round(theirs.reduce((m, q) => Math.min(m, Math.hypot(p.x - q.x, p.z - q.z)), Infinity));
  const mine = PLOTS.filter((p) => { const ps = s.plots[p.id]; return ps.owner === 'player' && !!ps.stand && !ps.stand.wrecked; });
  mine.sort((a, b) => away(a) - away(b) || s.plots[b.id].stand!.day.passersby - s.plots[a.id].stand!.day.passersby);
  return mine[0]?.id ?? null;
}

/** The crew goes out overnight: the plot's night watch may catch it (the same detection as a raid); else your Reputation dips. */
function startPosters(s: GameState, id: RivalId, rng: Rng): Scheme | null {
  const target = posterTarget(s, id);
  if (!target || !canSpend(s, id, 'strike', SCHEMES.posters.cost)) return null;
  spend(s, id, 'strike', SCHEMES.posters.cost);
  const caught = nextRandom(rng) < detectionChance(s, target, true);
  const job: Scheme = { kind: 'posters', by: id, day: s.day, until: s.day, plots: [target], caught, cost: SCHEMES.posters.cost, done: true };
  s.schemes!.push(job);
  const where = PLOT_BY_ID[target].name;
  if (caught) {
    s.news.push(`Bugle: Lottie's night watch catches a poster crew at ${where}`);
  } else {
    s.reputation = Math.max(1, round2(s.reputation - SCHEMES.posters.stars));
    phoneCall(s, 'coldbrew', SCHEMES.posters.taunt, { mood: 'gloat' }); // Juni rings the Corner (src/sim/phone.ts)
    s.news.push(`Bugle: Smear posters plaster ${where}`);
  }
  return job;
}

// ---------- Cease-and-Desist ----------

/** Is your marketing blocked in this district today? A FizzCo letter is running there, and FizzCo is still in business. */
export function ceaseAndDesistIn(s: GameState, district: DistrictId): boolean {
  return !!s.schemes?.length && s.rivals.fizzco.alive && runningSchemes(s).some((x) => x.kind === 'cease' && x.district === district);
}

const standPlots = new WeakMap<Stand, string>();
function plotOfStand(s: GameState, st: Stand): string | undefined {
  const known = standPlots.get(st);
  if (known && s.plots[known]?.stand === st) return known;
  const p = PLOTS.find((q) => s.plots[q.id].stand === st);
  if (p) standPlots.set(st, p.id);
  return p?.id;
}

/** What your tier bonus and campaigns add at this stand: everything a Cease-and-Desist strikes out. */
function adsAt(s: GameState, st: Stand): number {
  let m = s.brandTier ? BRAND_TIERS[s.brandTier - 1].traffic : 0;
  for (const [id, days] of Object.entries(st.campaigns) as [CampaignId, number][]) if (days > 0) m += CAMPAIGNS[id].traffic;
  return m;
}

/** marketingMultiplier's Cease-and-Desist term: at your stand in a blocked district, your tier bonus and campaigns count for nothing. */
export function ceaseAndDesistCut(s: GameState, owner: FactionId, st?: Stand): number {
  if (owner !== 'player' || !st || !s.schemes?.some((x) => x.kind === 'cease' && !x.done)) return 0;
  const plot = plotOfStand(s, st);
  return plot && ceaseAndDesistIn(s, PLOT_BY_ID[plot].district) ? adsAt(s, st) : 0;
}

/** Your intact stands in a district. */
const yoursIn = (s: GameState, d: DistrictId) => PLOTS.filter((p) => p.district === d && s.plots[p.id].owner === 'player' && !!s.plots[p.id].stand && !s.plots[p.id].stand!.wrecked);

/** Where a letter hurts most: the district where your marketing pulled the most passers-by yesterday (FizzCo's Downtown on a tie). */
function ceaseTarget(s: GameState): DistrictId | null {
  let best: DistrictId | null = null, top = 0;
  for (const d of DISTRICTS) {
    const pull = yoursIn(s, d.id).reduce((a, p) => { const st = s.plots[p.id].stand!; return a + adsAt(s, st) * Math.max(1, st.day.passersby); }, 0);
    if (pull > top || (pull === top && pull > 0 && d.id === 'downtown')) { best = d.id; top = pull; }
  }
  return best;
}

/**
 * FizzCo's lawyers send a Cease-and-Desist: your marketing counts for nothing in one district for 3 days (the one
 * where it pulls the most, unless `district` is given: the seam for story's Act 4 letter on Downtown). It comes with
 * a fruit basket. From Rank 6, paid from FizzCo's Strike; null if there's nothing of yours to block there.
 */
export function ceaseAndDesist(s: GameState, district?: DistrictId): Scheme | null {
  const id: RivalId = 'fizzco';
  if (!s.rivals[id].alive || s.rank < CEASE.rank) return null;
  const d = district ?? ceaseTarget(s);
  const mine = d ? yoursIn(s, d) : [];
  if (!d || !mine.length || runningSchemes(s).some((x) => x.kind === 'cease' && x.district === d) || !canSpend(s, id, 'strike', CEASE.cost)) return null;
  spend(s, id, 'strike', CEASE.cost);
  s.schemes ??= [];
  const letter: Scheme = { kind: 'cease', by: id, day: s.day, until: s.day + CEASE.days - 1, plots: mine.map((p) => p.id), district: d, cost: CEASE.cost };
  s.schemes.push(letter);
  const name = DISTRICT_BY_ID[d].name;
  alert(s, { kind: 'note', text: `CEASE-AND-DESIST! FizzCo's lawyers block your ads in ${name} for ${CEASE.days} days. Lottie keeps the fruit basket.`, plot: mine[0].id });
  // story: phoneCall(s, 'fizzco', taunt) rings the Corner once the phone lands; until then the line runs in the news.
  s.news.push(`Preston: "${CEASE.taunt}"`);
  return letter;
}

/** For the HUD and tests: the Cease-and-Desist running in a district today, if any. */
export const ceaseIn = (s: GameState, district: DistrictId) => (s.rivals.fizzco.alive ? runningSchemes(s).find((x) => x.kind === 'cease' && x.district === district) : undefined);

// ---------- buyout offers ----------

/** A pickup booked at this plot's Helipad or Pier: it can't change hands until the load goes. */
const pickupBooked = (s: GameState, plotId: string) => s.orders.some((o) => o.plot === plotId);
/** What FizzCo would offer for a plot of yours: its land and building value, marked up. */
export const takeoverPrice = (s: GameState, plotId: string) => Math.round(TAKEOVER.price * (s.plots[plotId].landValue + s.plots[plotId].invested));

/** The plot FizzCo wants: your most valuable one on or beside its turf (not Lottie's Corner, a trophy HQ, a wreck or a booked pad). */
function takeoverTarget(s: GameState): string | null {
  const id: RivalId = 'fizzco';
  const turf = new Set<DistrictId>([FACTIONS[id].home as DistrictId, ...ownedPlots(s, id).map((p) => p.district)]);
  const near = new Set([...turf, ...[...turf].flatMap((d) => BORDERS[d] ?? [])]);
  const value = (plotId: string) => s.plots[plotId].landValue + s.plots[plotId].invested;
  const wanted = PLOTS.filter((p) => {
    const ps = s.plots[p.id];
    const built = ps.stand ? !ps.stand.wrecked : ps.facility ? !ps.facility.wrecked : false;
    return ps.owner === 'player' && built && near.has(p.district) && p.id !== LOTTIES_CORNER && p.type !== 'hq' && !pickupBooked(s, p.id);
  });
  return wanted.sort((a, b) => value(b.id) - value(a.id) || a.id.localeCompare(b.id))[0]?.id ?? null;
}

/** FizzCo offers to buy one of your plots (Hostile Takeover): from Rank 6, if its Grow can pay. The offer stands 2 days. */
function startBuyout(s: GameState, id: RivalId): Scheme | null {
  if (id !== 'fizzco' || s.rank < TAKEOVER.rank) return null;
  const plot = takeoverTarget(s);
  if (!plot) return null;
  const price = takeoverPrice(s, plot);
  if (!canSpend(s, id, 'grow', price)) return null;
  const offer: Scheme = { kind: 'buyout', by: id, day: s.day, until: s.day + TAKEOVER.days - 1, plots: [plot], price };
  s.schemes!.push(offer);
  alert(s, { kind: 'note', text: `FizzCo offers ${money(price)} for ${PLOT_BY_ID[plot].name}. Sell, or say no.`, plot });
  return offer;
}

/** The offer standing on a plot of yours today, if any. */
export const offerOn = (s: GameState, plotId: string) => runningSchemes(s).find((x) => x.kind === 'buyout' && x.plots[0] === plotId && s.rivals[x.by].alive);

/** Can you take FizzCo's offer now? At Morning Prep, while it stands and FizzCo's Grow can still pay. */
export function canSellToFizzco(s: GameState, plotId: string): { ok: true } | { ok: false; why: string } {
  const offer = offerOn(s, plotId);
  if (!offer || s.plots[plotId].owner !== 'player') return { ok: false, why: 'No offer on this plot' };
  if (s.phase !== 'prep') return { ok: false, why: 'Sell at Morning Prep' };
  if (!canSpend(s, offer.by, 'grow', offer.price!)) return { ok: false, why: 'FizzCo can\'t pay any more' };
  return { ok: true };
}

/**
 * Your answer to a buyout offer. Sell: FizzCo's Grow pays you the price and the plot goes to FizzCo with what's built
 * on it (your guards there come home). No: the offer is off, and Preston's Grudge rises. Returns whether it went.
 */
export function answerBuyout(s: GameState, plotId: string, sell: boolean): boolean {
  const offer = offerOn(s, plotId);
  if (!offer) return false;
  const id = offer.by;
  if (!sell) {
    offer.done = true;
    addGrudge(s, id, 'player', TAKEOVER.snub);
    // story: phoneCall(s, 'fizzco', taunt) once the phone lands; until then the line runs in the news.
    s.news.push(`Preston: "${TAKEOVER.taunt}"`);
    return true;
  }
  if (!canSellToFizzco(s, plotId).ok) return false;
  const price = offer.price!;
  spend(s, id, 'grow', price);
  s.cash = round2(s.cash + price); // ledger: land sale
  const ps = s.plots[plotId];
  ps.owner = id;
  ps.garrison = 0;
  delete ps.dibs;
  if (ps.stand) ps.stand.price = rivalPrice(id, ps.stand.level, PLOT_BY_ID[plotId]);
  for (const g of s.guards) if (g.post === plotId) g.post = null;
  offer.done = true;
  s.news.push(`Bugle: Lottie sells ${PLOT_BY_ID[plotId].name} to ${short(id)} for ${money(price)}`);
  return true;
}

// ---------- auction snipe ----------

/** An open auction on a plot, as land's auctions keep it (PlotState.auction once they land; none before). */
interface Lot { closes: number; min: number; bid?: number }
const lotOn = (s: GameState, plotId: string) => (s.plots[plotId] as { auction?: Lot }).auction;
/** Lots open now: the ones you bid on first, then the dearest. */
function openLots(s: GameState): string[] {
  const lots = PLOTS.map((p) => p.id).filter((id) => (lotOn(s, id)?.closes ?? -1) >= s.day);
  return lots.sort((a, b) => Number(lotOn(s, b)!.bid !== undefined) - Number(lotOn(s, a)!.bid !== undefined) || lotOn(s, b)!.min - lotOn(s, a)!.min);
}

function startSnipe(s: GameState, id: RivalId): Scheme | null {
  const lot = openLots(s).find((p) => !runningSchemes(s).some((x) => x.kind === 'snipe' && x.plots.includes(p)));
  if (!lot) return null;
  const snipe: Scheme = { kind: 'snipe', by: id, day: s.day, until: lotOn(s, lot)!.closes, plots: [lot], cost: 0 };
  s.schemes!.push(snipe);
  return snipe;
}

/**
 * A sealed bid with a snipe behind it (the seam for land's auctions: a rival's bid goes through here as the lot
 * closes). A rival sniping the lot tops your sealed bid by `SCHEMES.snipe.over`; Strike moves the money it adds into
 * Grow, which pays the bid. Without a snipe, without your bid, or when Strike or cash can't cover it, the bid stands.
 */
export function snipeBid(s: GameState, id: RivalId, lot: string, bid: number, yours?: number): number {
  const snipe = runningSchemes(s).find((x) => x.kind === 'snipe' && x.by === id && x.plots.includes(lot));
  if (!snipe || !yours) return bid;
  const want = Math.ceil(yours * (1 + SCHEMES.snipe.over));
  const extra = want - bid;
  const b = budgetOf(s, id);
  if (extra <= 0 || b.strike < extra || s.rivals[id].cash < want) return bid;
  b.strike = round2(b.strike - extra);
  b.grow = round2(b.grow + extra);
  snipe.cost = extra;
  snipe.done = true;
  s.news.push(`Bugle: ${short(id)} snipe ${PLOT_BY_ID[lot]?.name ?? 'the lot'} at the Registry`);
  return want;
}

// ---------- dawn ----------

/** Dawn, after the rivals bank their takings: running schemes settle, then each rival with none running may start one. */
export function schemesAtDawn(s: GameState): void {
  tauntsAtDawn(s);
  s.schemes ??= [];
  for (const x of s.schemes) {
    if (x.done) continue;
    if (!s.rivals[x.by]?.alive) { x.done = true; continue; }
    if (x.kind === 'priceWar') runPriceWar(s, x);
    else if (s.day > x.until || (x.kind === 'buyout' && s.plots[x.plots[0]].owner !== 'player')) x.done = true; // ran its days, the lot closed, or the plot left you
  }
  s.schemes = s.schemes.filter((x) => !x.done || x.until >= s.day - SCHEMES.keep);
  if (s.day < SCHEMES.from) return;
  const chance = SCHEMES.chance[threatLevel(s) - 1];
  const rng = { seed: s.seed };
  for (const id of RIVALS) {
    const r = s.rivals[id];
    if (!r.alive || inTruce(s, id) || runningFor(s, id)) continue;
    if (nextRandom(rng) >= chance) continue;
    for (const kind of tryOrder(id, rng)) if (startScheme(s, id, kind, rng)) break;
  }
  s.seed = rng.seed;
}

/** Rival `id` starts a scheme now, if it has a target and Strike can fund it (null if not). Also for tests and signature moves. */
export function startScheme(s: GameState, id: RivalId, kind: SchemeKind, rng?: Rng): Scheme | null {
  s.schemes ??= [];
  const r = rng ?? { seed: s.seed };
  const started = kind === 'priceWar' ? startPriceWar(s, id) : kind === 'posters' ? startPosters(s, id, r) : kind === 'snipe' ? startSnipe(s, id)
    : kind === 'buyout' ? startBuyout(s, id) : id === 'fizzco' ? ceaseAndDesist(s) : null;
  if (!rng) s.seed = r.seed; // called on its own: write the draws back
  return started;
}

/** For the HUD and tests: the price war a stand is in today, if any. */
export const warAt = (s: GameState, plotId: string) => runningSchemes(s).find((x) => x.kind === 'priceWar' && x.plots.includes(plotId));
