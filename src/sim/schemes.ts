// Rival schemes that aren't raids (spec: Rivals, How rivals think: "Strike funds
// raids and schemes like price wars and smear posters"; Threat: such schemes
// "come more often with each lemon"). Each dawn a rival with no scheme running
// may start one, paid from its Strike bucket: a price war at its stands that
// share customers with yours, the Cold Brew Collective's smear posters on one
// of your stands, or a snipe at an auction you bid on. The Bugle reports each
// one. Pure and seeded, like the rest of the sim.
import { FACTIONS, type RivalId } from './balance.ts';
import { nearbyPlots, PLOT_BY_ID, PLOTS } from './map.ts';
import { nextRandom, type Rng } from './rng.ts';
import type { GameState } from './economy.ts';
import { rivalPrice } from './economy.ts';
import { detectionChance, threatLevel } from './crew.ts';
import { budgetOf, canSpend, chargeStrike, keptShare, spend } from './rivalAi.ts';
import { inTruce, SCHEMES } from './rivals.ts';

export type SchemeKind = 'priceWar' | 'posters' | 'snipe';
export interface Scheme {
  kind: SchemeKind;
  by: RivalId;
  day: number; // the dawn it started
  until: number; // it runs through this day
  plots: string[]; // a price war: the rival's stands in it; posters: your stand they hit; a snipe: the lot
  caught?: boolean; // posters: your night watch caught the crew
  cost?: number; // what Strike has paid for it so far
  done?: boolean; // over: it ran its days, Strike ran dry, or the snipe went off
}

const RIVALS = Object.keys(FACTIONS) as RivalId[];
const round2 = (n: number) => Math.round(n * 100) / 100;
const short = (id: RivalId) => FACTIONS[id].name;

/** Which scheme each rival reaches for first (spec: Cold Brew's posters, FizzCo's auction outbids; a price war is anyone's). */
const PREFERS: Record<RivalId, SchemeKind[]> = {
  coldbrew: ['posters', 'priceWar', 'snipe'],
  fizzco: ['snipe', 'priceWar'],
  sourwood: ['priceWar', 'snipe'],
  hollis: ['priceWar', 'snipe'],
  blenders: ['priceWar', 'snipe'],
};

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
    // story: phoneCall(s, 'coldbrew', taunt) rings the Corner once the phone lands; until then the line runs in the news.
    s.news.push(`Juni: "${SCHEMES.posters.taunt}"`);
    s.news.push(`Bugle: Smear posters plaster ${where}`);
  }
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
  s.schemes ??= [];
  for (const x of s.schemes) {
    if (x.done) continue;
    if (!s.rivals[x.by]?.alive) { x.done = true; continue; }
    if (x.kind === 'priceWar') runPriceWar(s, x);
    else if (s.day > x.until) x.done = true; // a snipe whose lot closed without it
  }
  s.schemes = s.schemes.filter((x) => !x.done || x.until >= s.day - SCHEMES.keep);
  if (s.day < SCHEMES.from) return;
  const chance = SCHEMES.chance[threatLevel(s) - 1];
  const rng = { seed: s.seed };
  for (const id of RIVALS) {
    const r = s.rivals[id];
    if (!r.alive || inTruce(s, id) || runningFor(s, id)) continue;
    if (nextRandom(rng) >= chance) continue;
    for (const kind of PREFERS[id]) if (startScheme(s, id, kind, rng)) break;
  }
  s.seed = rng.seed;
}

/** Rival `id` starts a scheme now, if it has a target and Strike can fund it (null if not). Also for tests and signature moves. */
export function startScheme(s: GameState, id: RivalId, kind: SchemeKind, rng?: Rng): Scheme | null {
  s.schemes ??= [];
  const r = rng ?? { seed: s.seed };
  const started = kind === 'priceWar' ? startPriceWar(s, id) : kind === 'posters' ? startPosters(s, id, r) : startSnipe(s, id);
  if (!rng) s.seed = r.seed; // called on its own: write the draws back
  return started;
}

/** For the HUD and tests: the price war a stand is in today, if any. */
export const warAt = (s: GameState, plotId: string) => runningSchemes(s).find((x) => x.kind === 'priceWar' && x.plots.includes(plotId));
