// Rival schemes that aren't raids (spec: Rivals, How rivals think: "Strike funds
// raids and schemes like price wars and smear posters"; Threat: such schemes
// "come more often with each lemon"). Each dawn a rival with no scheme running
// may start one, paid from its Strike bucket: a price war at its stands that
// share customers with yours, the Cold Brew Collective's smear posters on one
// of your stands, a snipe at an auction you bid on, FizzCo's Hostile Takeover
// (an ad blitz by FizzCo's mascot, a Cease-and-Desist on your marketing in one
// district, or an offer to buy one of your plots), or Sourwood's Old Money
// (Mayor Fontaine's fine, or a land sale frozen at Town Hall). The Bugle
// reports each one. Pure and seeded, like the rest of the sim.
import { BRAND_TIERS, CAMPAIGNS, FACTIONS, type CampaignId, type RivalId } from './balance.ts';
import { BORDERS, DISTRICT_BY_ID, DISTRICTS, LOTTIES_CORNER, nearbyPlots, PLOT_BY_ID, PLOTS, type DistrictId, type FactionId } from './map.ts';
import { nextRandom, type Rng } from './rng.ts';
import type { GameState, Stand } from './economy.ts';
import { canBuyPlot, ownedPlots, rivalPrice } from './economy.ts';
import { detectionChance, threatLevel } from './crew.ts';
import { addGrudge, budgetOf, canSpend, chargeStrike, keptShare, spend, tauntsAtDawn } from './rivalAi.ts';
import { AD_BLITZ, CEASE, inTruce, OLD_MONEY, SCHEMES, TAKEOVER } from './rivals.ts';
import { alert } from './alerts.ts';
import { phoneCall } from './phone.ts';
import { book } from './ledger.ts'; // the Ledger: each cash movement on its row
import { actOf } from './modes.ts';

export type SchemeKind = 'priceWar' | 'posters' | 'snipe' | 'blitz' | 'cease' | 'buyout' | 'fine' | 'freeze';
export interface Scheme {
  kind: SchemeKind;
  by: RivalId;
  day: number; // the dawn it started
  until: number; // it runs through this day
  plots: string[]; // a price war or ad blitz: the rival's stands in it; posters: your stand they hit; a snipe: the lot; a letter: your stands it hit; an offer: your plot; a freeze: the plot
  district?: DistrictId; // a Cease-and-Desist: the district it blocks; an ad blitz: the district the mascot works
  price?: number; // a buyout offer: what they'd pay you; a fine: what you paid
  caught?: boolean; // posters: your night watch caught the crew
  cost?: number; // what Strike has paid for it so far
  done?: boolean; // over: it ran its days, Strike ran dry, or the snipe went off
}

const RIVALS = Object.keys(FACTIONS) as RivalId[];
const round2 = (n: number) => Math.round(n * 100) / 100;
const short = (id: RivalId) => FACTIONS[id].name;
const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

/**
 * The schemes each rival reaches for, most likely first (spec: Cold Brew's posters, FizzCo's auction outbids, ad
 * blitzes and Cease-and-Desist letters; a price war is anyone's). Each dawn's order is a seeded draw weighted this way.
 */
const PREFERS: Record<RivalId, SchemeKind[]> = {
  coldbrew: ['posters', 'priceWar', 'snipe'],
  fizzco: ['snipe', 'blitz', 'cease', 'buyout', 'priceWar'],
  sourwood: ['priceWar', 'freeze', 'fine', 'snipe'],
  hollis: ['priceWar', 'snipe'],
  blenders: ['priceWar', 'snipe'],
};

/**
 * The order a rival tries its schemes in this dawn: a seeded draw that favors the ones it reaches for first. In Act 3
 * (Grounds for Revenge) Cold Brew reaches for its posters before anything else.
 */
function tryOrder(s: GameState, id: RivalId, rng: Rng): SchemeKind[] {
  const order = drawOrder(id, rng);
  return campusWalls(s, id) ? ['posters', ...order.filter((k) => k !== 'posters')] : order;
}

function drawOrder(id: RivalId, rng: Rng): SchemeKind[] {
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
 * What a rival's price is multiplied by at a plot: 1 - the cut while its price war runs there, else 1. Demand's
 * rivalPrice(id, level, plot, s) multiplies by it, and each dawn of the war re-posts the war's stands through it.
 */
export function priceWarCut(s: GameState, id: RivalId, plotId: string): number {
  return runningSchemes(s).some((x) => x.kind === 'priceWar' && x.by === id && x.plots.includes(plotId)) ? 1 - SCHEMES.priceWar.cut : 1;
}

/** A rival stand's everyday price, with its price war's cut if one runs there. */
function setPrice(s: GameState, id: RivalId, plotId: string): void {
  const st = s.plots[plotId].stand;
  if (st && s.plots[plotId].owner === id) st.price = rivalPrice(id, st.level, PLOT_BY_ID[plotId], s); // demand's, with the war's cut
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

/** Act 3, Grounds for Revenge: Cold Brew's crew works the Campus & Arts walls (spec: "every campus wall sneers"). */
const campusWalls = (s: GameState, id: RivalId) => id === 'coldbrew' && actOf(s) === SCHEMES.posters.act;

/**
 * Cold Brew's poster crew goes for your stand nearest its turf (the busiest of those, on a tie). In Act 3 it goes for
 * your busiest stand in Campus & Arts, if you have one there.
 */
function posterTarget(s: GameState, id: RivalId): string | null {
  const theirs = PLOTS.filter((p) => s.plots[p.id].owner === id);
  const away = (p: (typeof PLOTS)[number]) => Math.round(theirs.reduce((m, q) => Math.min(m, Math.hypot(p.x - q.x, p.z - q.z)), Infinity));
  const busy = (p: (typeof PLOTS)[number]) => s.plots[p.id].stand!.day.passersby;
  const mine = PLOTS.filter((p) => { const ps = s.plots[p.id]; return ps.owner === 'player' && !!ps.stand && !ps.stand.wrecked; });
  const campus = campusWalls(s, id) ? mine.filter((p) => p.district === FACTIONS[id].home).sort((a, b) => busy(b) - busy(a)) : [];
  if (campus.length) return campus[0].id;
  mine.sort((a, b) => away(a) - away(b) || busy(b) - busy(a));
  return mine[0]?.id ?? null;
}

/**
 * Are Cold Brew's smear posters up on this plot's walls? For the plot card and the art thread's poster props: they
 * stay up `SCHEMES.posters.days` days, or until you hand out free samples there (a Free Sample Day begun since).
 */
export function postersAt(s: GameState, plotId: string): boolean {
  const st = s.plots[plotId]?.stand;
  if (!st || s.plots[plotId].owner !== 'player' || !s.schemes?.length) return false;
  const left = st.campaigns.freeSamples ?? 0;
  const sampled = left > 0 ? s.day - (CAMPAIGNS.freeSamples.days - left) : -Infinity; // the day the Free Sample Day there began
  return s.schemes.some((x) => x.kind === 'posters' && !x.caught && x.plots.includes(plotId) && s.day - x.day < SCHEMES.posters.days && sampled < x.day);
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
    const campus = campusWalls(s, id) && PLOT_BY_ID[target].district === FACTIONS[id].home;
    s.news.push(campus ? `Bugle: Every campus wall sneers "${SCHEMES.posters.slogan}"` : `Bugle: Smear posters plaster ${where}`);
  }
  return job;
}

// ---------- FizzCo's ad blitz ----------

/** Is FizzCo's mascot working this district today? A blitz is running there, and FizzCo is still in business. */
export function adBlitzIn(s: GameState, district: DistrictId): boolean {
  return !!s.schemes?.length && s.rivals.fizzco.alive && runningSchemes(s).some((x) => x.kind === 'blitz' && x.district === district);
}

/** marketingMultiplier's ad blitz term: +AD_BLITZ.traffic at FizzCo's stands in the district its mascot works. */
export function adBlitzBoost(s: GameState, owner: FactionId, st?: Stand): number {
  if (owner !== 'fizzco' || !st || !s.schemes?.some((x) => x.kind === 'blitz' && !x.done)) return 0;
  const plot = plotOfStand(s, st);
  return plot && adBlitzIn(s, PLOT_BY_ID[plot].district) ? AD_BLITZ.traffic : 0;
}

/** Where a blitz pulls hardest: the district where most of FizzCo's stands share passers-by with yours (its Downtown on a tie). */
function blitzTarget(s: GameState): DistrictId | null {
  const count = new Map<DistrictId, number>();
  for (const p of warFront(s, 'fizzco')) { const d = PLOT_BY_ID[p].district; count.set(d, (count.get(d) ?? 0) + 1); }
  const home = (d: DistrictId) => (d === FACTIONS.fizzco.home ? 1 : 0);
  return [...count].sort((a, b) => b[1] - a[1] || home(b[0]) - home(a[0]))[0]?.[0] ?? null;
}

/** FizzCo's ad blitz (Hostile Takeover): from Rank 3, its mascot works one district for 3 days, a day's walk paid each dawn from Strike. */
function startBlitz(s: GameState, id: RivalId): Scheme | null {
  if (id !== 'fizzco' || s.rank < AD_BLITZ.rank) return null;
  const district = blitzTarget(s);
  if (!district || !canSpend(s, id, 'strike', AD_BLITZ.perDay * AD_BLITZ.days)) return null;
  spend(s, id, 'strike', AD_BLITZ.perDay);
  const plots = PLOTS.filter((p) => p.district === district && s.plots[p.id].owner === id && !!s.plots[p.id].stand && p.type !== 'hq').map((p) => p.id);
  const job: Scheme = { kind: 'blitz', by: id, day: s.day, until: s.day + AD_BLITZ.days - 1, plots, district, cost: AD_BLITZ.perDay };
  s.schemes!.push(job);
  // world: the radio show can open with FizzCo's jingle while adBlitzIn holds (spec: the radio tips you off).
  s.news.push(`Bugle: FizzCo's mascot blitzes ${DISTRICT_BY_ID[district].name}: +${Math.round(AD_BLITZ.traffic * 100)}% at its stands`);
  return job;
}

/** Dawn: Strike pays for another day's walk; the blitz ends when its days are up or Strike can't pay. */
function runBlitz(s: GameState, job: Scheme): void {
  if (s.day > job.until) { job.done = true; return; }
  if (!canSpend(s, job.by, 'strike', AD_BLITZ.perDay)) {
    job.done = true;
    job.until = s.day - 1;
    s.news.push(`Bugle: FizzCo's mascot goes home early`);
    return;
  }
  spend(s, job.by, 'strike', AD_BLITZ.perDay);
  job.cost = round2((job.cost ?? 0) + AD_BLITZ.perDay);
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
 * a fruit basket. From Act 4, paid from FizzCo's Strike; null if there's nothing of yours to block there.
 */
export function ceaseAndDesist(s: GameState, district?: DistrictId): Scheme | null {
  const id: RivalId = 'fizzco';
  if (!s.rivals[id].alive || actOf(s) < CEASE.act) return null;
  const d = district ?? ceaseTarget(s);
  const mine = d ? yoursIn(s, d) : [];
  if (!d || !mine.length || runningSchemes(s).some((x) => x.kind === 'cease' && x.district === d) || !canSpend(s, id, 'strike', CEASE.cost)) return null;
  spend(s, id, 'strike', CEASE.cost);
  s.schemes ??= [];
  const letter: Scheme = { kind: 'cease', by: id, day: s.day, until: s.day + CEASE.days - 1, plots: mine.map((p) => p.id), district: d, cost: CEASE.cost };
  s.schemes.push(letter);
  const name = DISTRICT_BY_ID[d].name;
  alert(s, { kind: 'note', text: `CEASE-AND-DESIST! FizzCo's lawyers block your ads in ${name} for ${CEASE.days} days. Lottie keeps the fruit basket.`, plot: mine[0].id });
  phoneCall(s, 'fizzco', CEASE.taunt, { mood: 'warn' }); // Preston rings the Corner (src/sim/phone.ts)
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

/** FizzCo offers to buy one of your plots (Hostile Takeover): from Act 4, if its Grow can pay. The offer stands 2 days. */
function startBuyout(s: GameState, id: RivalId): Scheme | null {
  if (id !== 'fizzco' || actOf(s) < TAKEOVER.act) return null;
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
    phoneCall(s, 'fizzco', '', { mood: 'sore' }); // Preston rings, sore, in his own words: the one call his Grudge jump makes
    return true;
  }
  if (!canSellToFizzco(s, plotId).ok) return false;
  const price = offer.price!;
  spend(s, id, 'grow', price);
  book(s, 'invested', price); // the Ledger: a plot sold comes back off Invested
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

// ---------- Old Money ----------

/** Is a sale of this plot frozen at Town Hall today (Sourwood's Old Money)? Nobody can buy it while it is. */
export function landFrozen(s: GameState, plotId: string): boolean {
  return !!s.schemes?.length && runningSchemes(s).some((x) => x.kind === 'freeze' && x.plots.includes(plotId));
}
/** For the HUD and tests: the freeze on a plot today, if any. */
export const freezeOn = (s: GameState, plotId: string) => runningSchemes(s).find((x) => x.kind === 'freeze' && x.plots.includes(plotId));

/** What the Mayor fines you: half your average day's sales over the last week (at least $25), never more than your cash. */
export function mayorsFine(s: GameState): number {
  const week = s.history.slice(-7);
  const avg = week.length ? week.reduce((a, d) => a + d.revenue, 0) / week.length : 0;
  return Math.min(Math.max(0, Math.floor(s.cash)), Math.max(OLD_MONEY.minFine, Math.round(avg * OLD_MONEY.fine)));
}

/** Mayor Fontaine fines you, on Vera's word: under a day's sales, straight out of the till. */
function startFine(s: GameState, id: RivalId): Scheme | null {
  if (id !== 'sourwood' || actOf(s) < OLD_MONEY.act) return null;
  const fine = mayorsFine(s);
  if (fine <= 0 || !canSpend(s, id, 'strike', OLD_MONEY.fineCost)) return null;
  spend(s, id, 'strike', OLD_MONEY.fineCost);
  book(s, 'citations', -fine); // the Ledger: Old Money's fine, on the Citations row
  const job: Scheme = { kind: 'fine', by: id, day: s.day, until: s.day, plots: [], price: fine, cost: OLD_MONEY.fineCost, done: true };
  s.schemes!.push(job);
  alert(s, { kind: 'note', text: `MAYOR'S FINE! Town Hall fines Lottie's Lemonade ${money(fine)} for "unlicensed cheer".`, plot: LOTTIES_CORNER });
  s.news.push(`Mayor Fontaine: "${OLD_MONEY.mayor}"`);
  return job;
}

/** The sale the Mayor freezes: a plot you hold First Dibs on, the lot you bid on, or the busiest open plot you could buy now. */
function freezeTarget(s: GameState): string | null {
  const open = PLOTS.filter((p) => !landFrozen(s, p.id));
  const dibs = open.find((p) => s.plots[p.id].dibs?.who === 'player' && s.plots[p.id].dibs!.until >= s.day && !s.plots[p.id].owner);
  if (dibs) return dibs.id;
  const bid = open.find((p) => lotOn(s, p.id)?.bid !== undefined && lotOn(s, p.id)!.closes >= s.day);
  if (bid) return bid.id;
  const buyable = open.filter((p) => !s.plots[p.id].owner && canBuyPlot(s, p.id).ok);
  return buyable.sort((a, b) => b.baseTraffic - a.baseTraffic || a.id.localeCompare(b.id))[0]?.id ?? null;
}

/**
 * Town Hall freezes a land sale for 3 days (Sourwood's Old Money; `plotId` is the seam for story's Act 5 freeze on
 * your Hilltop deal). Nobody can buy the plot while it's frozen; First Dibs you hold on it waits out the freeze.
 */
export function freezeLand(s: GameState, plotId?: string): Scheme | null {
  const id: RivalId = 'sourwood';
  if (!s.rivals[id].alive || actOf(s) < OLD_MONEY.act) return null;
  const plot = plotId ?? freezeTarget(s);
  if (!plot || landFrozen(s, plot) || !canSpend(s, id, 'strike', OLD_MONEY.freezeCost)) return null;
  spend(s, id, 'strike', OLD_MONEY.freezeCost);
  s.schemes ??= [];
  const job: Scheme = { kind: 'freeze', by: id, day: s.day, until: s.day + OLD_MONEY.freezeDays - 1, plots: [plot], cost: OLD_MONEY.freezeCost };
  s.schemes.push(job);
  const dibs = s.plots[plot].dibs;
  if (dibs?.who === 'player' && dibs.until >= s.day) dibs.until += OLD_MONEY.freezeDays;
  alert(s, { kind: 'note', text: `LAND FREEZE! Town Hall freezes the sale of ${PLOT_BY_ID[plot].name} for ${OLD_MONEY.freezeDays} days, to protect "historic hedges."`, plot });
  return job;
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
    else if (x.kind === 'blitz') runBlitz(s, x);
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
    for (const kind of tryOrder(s, id, rng)) if (startScheme(s, id, kind, rng)) break;
  }
  s.seed = rng.seed;
}

/** Rival `id` starts a scheme now, if it has a target and Strike can fund it (null if not). Also for tests and signature moves. */
export function startScheme(s: GameState, id: RivalId, kind: SchemeKind, rng?: Rng): Scheme | null {
  s.schemes ??= [];
  const r = rng ?? { seed: s.seed };
  const started = kind === 'priceWar' ? startPriceWar(s, id) : kind === 'posters' ? startPosters(s, id, r) : kind === 'snipe' ? startSnipe(s, id)
    : kind === 'blitz' ? startBlitz(s, id) : kind === 'buyout' ? startBuyout(s, id) : kind === 'fine' ? startFine(s, id) : kind === 'freeze' ? (id === 'sourwood' ? freezeLand(s) : null)
    : id === 'fizzco' ? ceaseAndDesist(s) : null;
  if (!rng) s.seed = r.seed; // called on its own: write the draws back
  return started;
}

/** For the HUD and tests: the price war a stand is in today, if any. */
export const warAt = (s: GameState, plotId: string) => runningSchemes(s).find((x) => x.kind === 'priceWar' && x.plots.includes(plotId));
