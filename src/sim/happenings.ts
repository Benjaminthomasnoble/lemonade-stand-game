// The random events themselves (spec: Events and the living world, Random events), on events.ts's scheduler: the
// Market shocks (Lemon Blight, Sugar Shortage), the traffic surges (Viral Video, Celebrity Sighting, Parade Route,
// Roadworks), the Tourist Bus, the Food Critic, the Power Outage that stops the L4+ ice machines, Captain Squawk, and
// Kids' Lemonade Day. Each names its counter-play, and the Bugle (or 101.5, mid-day) announces it with its district and
// length. Pure and seeded: every placement draws from the scheduler's rng.
import { nextRandom } from './rng.ts';
import { DISTRICT_BY_ID, DISTRICTS, nearbyPlots, PLOT_BY_ID, PLOTS, type DistrictId, type Plot } from './map.ts';
import {
  CLOSE, EVENT_NEAR_YOU, EVENT_TRAFFIC, FOOD_CRITIC, ICE_MACHINE_LEVEL, KIDS_DAY, OPEN, RAID_RANK, RANDOM_EVENTS, RIVAL_SHARE_CAP, SEGMENTS,
  SUPPLY_SHOCK, TOURIST_BUS_SHARE, type SegmentId,
} from './balance.ts';
import type { Blocker, GameState, Goal, SimEvent, Stand } from './economy.ts';
import { appealFor, playerStands, stock } from './economy.ts';
import { shineReason, worldOf } from './recipes.ts';
import { liveEvent, planDay, registerEvent, type Placement, type WorldEvent } from './events.ts';
import { eventWhere, newsroomNow } from './media.ts';
import { availableRaiders } from './crew.ts';
import { ceilingFor, segmentPriceFit, type Street } from './demand.ts';
import { peaceful } from './modes.ts';
import { GOAL_PROVIDERS } from './goals.ts';

type Rng = { seed: number };
const pick = <T>(rng: Rng, xs: T[]): T => xs[Math.min(xs.length - 1, Math.floor(nextRandom(rng) * xs.length))];
const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const short = (plotId: string) => PLOT_BY_ID[plotId].name.replace(/ lot /, ' ');
const named = (d: DistrictId | undefined) => (d ? DISTRICT_BY_ID[d].name : 'town');
const length = (e: WorldEvent) => e.to - e.from + 1;

/** Your stands open for business (not wrecked). */
const working = (s: GameState) => playerStands(s).filter((p) => !s.plots[p.id].stand!.wrecked).map((p) => p.id);
const yours = (s: GameState, plotId: string | undefined) => !!plotId && s.plots[plotId]?.owner === 'player' && !!s.plots[plotId].stand && !s.plots[plotId].stand!.wrecked;

/** A district with stands on it: one you sell in, most of the time (a surge where you sell is the one worth a card). */
function districtFor(s: GameState, rng: Rng): DistrictId | null {
  const any = DISTRICTS.map((d) => d.id).filter((d) => PLOTS.some((p) => p.district === d && s.plots[p.id].stand));
  if (!any.length) return null;
  const mine = any.filter((d) => working(s).some((id) => PLOT_BY_ID[id].district === d));
  return mine.length && nextRandom(rng) < EVENT_NEAR_YOU ? pick(rng, mine) : pick(rng, any);
}

/** A street: 4–6 adjacent columns of one district, both sides, through one of your stands when the district has one. */
function streetFor(s: GameState, rng: Rng): Placement | null {
  const district = districtFor(s, rng);
  if (!district) return null;
  const cols = DISTRICT_BY_ID[district].cols;
  const [lo, hi] = EVENT_TRAFFIC.street;
  const len = Math.min(cols, lo + Math.floor(nextRandom(rng) * (hi - lo + 1)));
  const mine = working(s).filter((id) => PLOT_BY_ID[id].district === district);
  const at = mine.length ? PLOT_BY_ID[pick(rng, mine)].col : -1;
  const first = at < 0 ? 0 : Math.max(0, at - len + 1), last = at < 0 ? cols - len : Math.min(at, cols - len);
  const start = first + Math.floor(nextRandom(rng) * (last - first + 1));
  const plots = PLOTS.filter((p) => p.district === district && p.col >= start && p.col < start + len).sort((a, b) => a.col - b.col || a.side - b.side);
  return { district, plots: plots.map((p) => p.id) };
}

/** One of your stands. */
function yourStand(s: GameState, rng: Rng): Placement | null {
  const ids = working(s);
  if (!ids.length) return null;
  const id = pick(rng, ids);
  return { district: PLOT_BY_ID[id].district, plots: [id] };
}

const inDistrict = (e: WorldEvent, plotId: string) => PLOT_BY_ID[plotId].district === e.district;
const onStreet = (e: WorldEvent, plotId: string) => !!e.plots?.includes(plotId);

// ---------- the Market: Lemon Blight and Sugar Shortage ----------

registerEvent({
  id: 'lemonBlight', name: 'Lemon Blight', kind: 'harmful', scope: 'bay', when: 'dawn', days: RANDOM_EVENTS.lemonBlight.days,
  weight: RANDOM_EVENTS.lemonBlight.weight, shock: 'lemons', counter: 'Buy daily (lemons spoil in 3 days) and nudge prices up',
  dawn: (s) => { s.market.lemons *= SUPPLY_SHOCK; }, // after the dawn's roll: every buyer pays it
  bugle: (_s, e) => ['LEMON BLIGHT!', `Lemons cost double for ${length(e)} days`],
  headline: (_s, e) => `LEMON BLIGHT! Lemons cost double at the Market for ${length(e)} days. Buy daily (lemons spoil in 3 days) and nudge prices up.`,
});

registerEvent({
  id: 'sugarShortage', name: 'Sugar Shortage', kind: 'harmful', scope: 'bay', when: 'dawn', days: RANDOM_EVENTS.sugarShortage.days,
  weight: RANDOM_EVENTS.sugarShortage.weight, shock: 'sugar', counter: 'Sugar keeps: a stocked Warehouse rides it out',
  dawn: (s) => { s.market.sugar *= SUPPLY_SHOCK; },
  bugle: (_s, e) => ['SUGAR SHORTAGE!', `Sugar costs double for ${length(e)} days`],
  headline: (_s, e) => `SUGAR SHORTAGE! Sugar costs double at the Market for ${length(e)} days. Sugar keeps: a stocked Warehouse rides it out.`,
});

// ---------- traffic surges: on top of marketing, through expectedPassersby (so the odds and Auto-Restock see them) ----------

registerEvent({
  id: 'viralVideo', name: 'Viral Video', kind: 'good', scope: 'stand', when: 'midday', days: RANDOM_EVENTS.viralVideo.days,
  weight: RANDOM_EVENTS.viralVideo.weight, counter: 'Stock deep, raise the price',
  can: (s) => working(s).length > 0,
  place: yourStand,
  start: (s, e) => yours(s, e.plots?.[0]), // the stand's gone by lunch: no video
  traffic: (s, e, plotId) => (plotId === e.plots![0] && s.plots[plotId].owner === 'player' ? EVENT_TRAFFIC.viralVideo : 1),
  headline: (_s, e) => `VIRAL VIDEO! A neighbor kid's clip of Captain Squawk stealing a lemon at ${short(e.plots![0])} goes viral: ×2 traffic there for ${length(e)} days. Stock deep, raise the price.`,
});

registerEvent({
  id: 'celebrity', name: 'Celebrity Sighting', kind: 'good', scope: 'district', when: 'dawn', days: RANDOM_EVENTS.celebrity.days,
  weight: RANDOM_EVENTS.celebrity.weight, counter: 'Send Sunny the Lemon',
  place: (s, rng) => { const d = districtFor(s, rng); return d ? { district: d } : null; },
  traffic: (_s, e, plotId) => (inDistrict(e, plotId) ? EVENT_TRAFFIC.celebrity : 1), // every stand there, rivals' too
  bugle: (_s, e) => ['STAR SPOTTED!', `A movie star in ${named(e.district)}`],
  headline: (_s, e) => `CELEBRITY SIGHTING! A movie star is spotted in ${named(e.district)}: ×2 traffic there today. Send Sunny the Lemon.`,
});

registerEvent({
  id: 'parade', name: 'Parade Route', kind: 'good', scope: 'street', when: 'dawn', days: RANDOM_EVENTS.parade.days,
  weight: RANDOM_EVENTS.parade.weight, counter: "Restock the route's stands at noon",
  place: streetFor,
  traffic: (_s, e, plotId) => (onStreet(e, plotId) ? EVENT_TRAFFIC.parade : 1),
  bugle: (_s, e) => ['PARADE TODAY!', eventWhere(e)],
  headline: (_s, e) => `PARADE! The marching band takes ${eventWhere(e)} today: ×2 traffic on the route. Restock the route's stands at noon.`,
});

registerEvent({
  id: 'roadworks', name: 'Roadworks', kind: 'harmful', scope: 'street', when: 'dawn', days: RANDOM_EVENTS.roadworks.days,
  weight: RANDOM_EVENTS.roadworks.weight, counter: 'Run campaigns elsewhere',
  place: streetFor,
  traffic: (_s, e, plotId) => (onStreet(e, plotId) ? EVENT_TRAFFIC.roadworks : 1),
  bugle: (_s, e) => ['ROADWORKS!', `${eventWhere(e)}, ${length(e)} days`],
  headline: (_s, e) => `ROADWORKS! Cones and jackhammers on ${eventWhere(e)} for ${length(e)} days: half the traffic there. Run campaigns elsewhere.`,
});

// ---------- the Tourist Bus: a festival-style crowd (calendar's crowdAt and festivalCrowd; shineReason 'crowd') ----------

registerEvent({
  id: 'touristBus', name: 'Tourist Bus', kind: 'good', scope: 'district', when: 'dawn', days: RANDOM_EVENTS.touristBus.days,
  weight: RANDOM_EVENTS.touristBus.weight, counter: 'Pour Strawberry, price high',
  place: (s, rng) => { const d = districtFor(s, rng); return d ? { district: d } : null; },
  crowd: { segment: 'tourists', share: TOURIST_BUS_SHARE },
  traffic: (_s, e, plotId) => (inDistrict(e, plotId) ? EVENT_TRAFFIC.touristBus : 1),
  bugle: (_s, e) => ['TOURIST BUS!', `Sightseers fill ${named(e.district)}`],
  headline: (_s, e) => `TOURIST BUS! Sightseers pour into ${named(e.district)} today. Pour Strawberry, price high.`,
});

// ---------- the Food Critic: named at dawn, the verdict at closing ----------

/** The segment a district has most of: the critic's taste. */
export function mainSegment(district: DistrictId): SegmentId {
  const mix = Object.entries(DISTRICT_BY_ID[district].mix) as [SegmentId, number][];
  return mix.reduce((a, b) => (b[1] > a[1] ? b : a))[0];
}

export interface CriticChecks { tasted: boolean; line: boolean; price: boolean; recipe: boolean }
/** The Food Critic's three checks at a stand today: under 5% of its walkers left over the line, a price at or under the fair
 * price for the district's main segment, and a card that segment loves or that shines there. No cup sold, nothing to taste. */
export function criticChecks(s: GameState, plotId: string): CriticChecks {
  const st = s.plots[plotId]?.stand;
  if (!yours(s, plotId) || !st) return { tasted: false, line: false, price: false, recipe: false };
  const district = PLOT_BY_ID[plotId].district;
  const seg = mainSegment(district);
  return {
    tasted: st.day.customers > 0,
    line: st.day.walkedPast.line < FOOD_CRITIC.line * Math.max(1, st.day.passersby),
    price: st.price <= appealFor(s, plotId, seg).fairPrice + 1e-9,
    recipe: SEGMENTS[seg].favorites.includes(st.recipe) || !!shineReason(s, district, st.recipe),
  };
}

/** All three: +0.1 star; two: nothing; fewer (or nothing to taste): −0.1. */
export function criticVerdict(c: CriticChecks): number {
  const passed = c.tasted ? [c.line, c.price, c.recipe].filter(Boolean).length : 0;
  return passed === 3 ? FOOD_CRITIC.stars : passed === 2 ? 0 : -FOOD_CRITIC.stars;
}

function critique(s: GameState, e: WorldEvent): void {
  const plotId = e.plots![0];
  const c = criticChecks(s, plotId);
  const delta = criticVerdict(c);
  e.verdict = delta;
  if (delta) {
    s.reputation = clamp(round2(s.reputation + delta), 1, 5);
    s.today.reputationAfter = s.reputation;
  }
  const at = short(plotId);
  if (delta > 0) s.news.push(`CRITIC RAVES! "Four spoons," writes the Bugle's critic of ${at}: +${FOOD_CRITIC.stars} star.`);
  else if (delta === 0) s.news.push(`CRITIC SHRUGS: "Perfectly fine," writes the Bugle's critic of ${at}.`);
  else {
    const gripe = !c.tasted ? 'Nothing to taste!' : !c.line ? 'I waited forty minutes!' : !c.price ? 'Highway robbery!' : 'Wrong lemonade for this crowd.';
    s.news.push(`CRITIC PANS ${at.toUpperCase()}! "${gripe}" writes the Bugle's critic: −${FOOD_CRITIC.stars} star.`);
  }
}

registerEvent({
  id: 'foodCritic', name: 'Food Critic', kind: 'mixed', scope: 'stand', when: 'dawn', days: RANDOM_EVENTS.foodCritic.days,
  weight: RANDOM_EVENTS.foodCritic.weight, counter: 'Short line, fair price, fitting recipe',
  can: (s) => working(s).length > 0,
  place: yourStand,
  start: (s, e) => yours(s, e.plots?.[0]),
  close: critique,
  bugle: (_s, e) => ['FOOD CRITIC IN TOWN!', `Tasting at ${short(e.plots![0])} today`],
  headline: (_s, e) => `FOOD CRITIC! The Bugle's critic tastes at ${short(e.plots![0])} today. Short line, fair price, fitting recipe: +${FOOD_CRITIC.stars} star (or −${FOOD_CRITIC.stars}).`,
});

// ---------- the L4+ ice machine, and the Power Outage that stops it ----------

/** A Power Outage is on in this district today: its ice machines are stopped. */
export function powerOut(s: GameState, district: DistrictId): boolean {
  const on = s.world?.events?.on;
  return !!on?.length && on.some((e) => e.id === 'powerOutage' && e.live && e.district === district && e.from <= s.day && e.to >= s.day);
}

/** Your L4+ stands make their own ice as they pour, at the Market price: never warm, Auto-Restock buys none, and nothing melts
 * overnight. A Power Outage stops the machines in its district for the day. */
export function iceMachineOn(s: GameState, plotId: string): boolean {
  const ps = s.plots[plotId];
  return ps?.owner === 'player' && !!ps.stand && ps.stand.level >= ICE_MACHINE_LEVEL && !powerOut(s, PLOT_BY_ID[plotId].district);
}

/** serveAt's one call, before a cup's ice comes out of the cooler: the machine makes what the cooler lacks, at the Market
 * price, and the cost goes on the cup. */
export function machineIce(s: GameState, plotId: string, st: Stand, ice: number): number {
  const lack = ice - st.inventory.ice;
  if (lack <= 0 || !iceMachineOn(s, plotId)) return 0;
  st.inventory.ice += lack;
  return lack * s.market.ice; // ledger: cups (the machine's ice, at the Market price)
}

/** Your stands with an ice machine. */
const machines = (s: GameState) => working(s).filter((id) => s.plots[id].stand!.level >= ICE_MACHINE_LEVEL);

registerEvent({
  id: 'powerOutage', name: 'Power Outage', kind: 'harmful', scope: 'district', when: 'dawn', days: RANDOM_EVENTS.powerOutage.days,
  weight: RANDOM_EVENTS.powerOutage.weight, counter: 'Buy Market ice for those stands',
  can: (s) => machines(s).length > 0,
  place: (s, rng) => { const ids = machines(s); return ids.length ? { district: PLOT_BY_ID[pick(rng, ids)].district } : null; },
  bugle: (_s, e) => ['POWER OUTAGE!', `${named(e.district)} in the dark today`],
  headline: (_s, e) => `POWER OUTAGE! ${named(e.district)} is in the dark today: the ice machines stop. Buy Market ice for those stands.`,
});

// ---------- Captain Squawk: the gull takes one stand's newest lemons ----------

/** At his minute: the newest lemon delivery at the stand goes (no lemons by then, no theft). */
function steal(s: GameState, e: WorldEvent): boolean {
  const id = e.plots?.[0];
  if (!yours(s, id)) return false;
  const st = s.plots[id!].stand!;
  const batch = st.inventory.lemons.pop();
  if (!batch?.qty) return false;
  e.stolen = batch.qty;
  e.low = stock(st, 'lemons');
  return true;
}

/** Restocked since (it holds more lemons than at its lowest), forgiven, or the stand is gone: the gull's done. */
export function squawkOver(s: GameState, e: WorldEvent): boolean {
  if (e.low === undefined) return false;
  const id = e.plots?.[0];
  return e.low < 0 || !yours(s, id) || stock(s.plots[id!].stand!, 'lemons') > e.low;
}

/** Each minute and each dawn: the stand's lowest since the theft (spoilage and sales take it lower), until it's restocked. */
function track(s: GameState, e: WorldEvent): void {
  if (e.low === undefined || e.low < 0) return;
  if (squawkOver(s, e)) e.low = -1;
  else e.low = Math.min(e.low, stock(s.plots[e.plots![0]].stand!, 'lemons'));
}

/** The card's Forgive him: Lottie lets it go (the stand stays short until you restock it). */
export function forgiveSquawk(s: GameState, plotId: string): boolean {
  const e = s.world?.events?.on.find((x) => x.id === 'captainSquawk' && x.live && x.plots?.[0] === plotId);
  if (!e || squawkOver(s, e)) return false;
  e.low = -1;
  return true;
}

registerEvent({
  id: 'captainSquawk', name: 'Captain Squawk', kind: 'harmful', scope: 'stand', when: 'midday', days: RANDOM_EVENTS.captainSquawk.days,
  weight: RANDOM_EVENTS.captainSquawk.weight, counter: 'Restock; forgive him',
  can: (s) => working(s).length > 0,
  place: yourStand,
  start: steal,
  tick: track,
  dawn: track,
  over: squawkOver,
  headline: (_s, e) => `SQUAWK! Captain Squawk flies off with ${e.stolen} lemons from ${short(e.plots![0])}. Restock; forgive him.`,
});

// ---------- Kids' Lemonade Day: kid stands split the walkers near them; Lottie says leave them alone until dusk ----------

/** Lottie, as you raid a kid stand (spec: Narrative). */
export const KIDS_RAID_LINE = 'We do not rob seven-year-olds in this family. Put the pitcher back.';
/** The game has no week, so Day 1 is a Monday: the 6th and 7th day of every week are the weekend. placeholder: spec gap */
export const weekday = (day: number) => (day - 1) % 7 < 5;
/** Today's Kids' Lemonade Day, once it's on. */
export const kidsDay = (s: GameState): WorldEvent | undefined => liveEvent(s, 'kidsDay');

const SIDEWALKS = new Set(['street', 'prime', 'landmark']);

/** One kid stand per district, on a free sidewalk lot (no stand or facility on it): where you sell, within 2 plots of one of
 * your stands when there's room there; anywhere in the district otherwise. */
function kidPlots(s: GameState, rng: Rng): Placement {
  const kids: string[] = [];
  const at = working(s);
  const free = (p: Plot) => SIDEWALKS.has(p.type) && !s.plots[p.id].stand && !s.plots[p.id].facility && !kids.includes(p.id);
  for (const d of DISTRICTS) {
    const mine = at.filter((id) => PLOT_BY_ID[id].district === d.id);
    for (let i = 0; i < KIDS_DAY.perDistrict; i++) {
      const near = i === 0 && mine.length ? nearbyPlots(PLOT_BY_ID[pick(rng, mine)]).filter(free) : [];
      const open = near.length ? near : PLOTS.filter((p) => p.district === d.id && free(p));
      if (open.length) kids.push(pick(rng, open).id);
    }
  }
  return { kids };
}

/** The kid stands still up within 2 plots of this one (same street, 2 columns either way), where any stand would compete. */
export function kidStandsAt(s: GameState, plotId: string): string[] {
  const e = kidsDay(s);
  return e?.kids?.length ? kidsNear(e, plotId) : [];
}
function kidsNear(e: WorldEvent, plotId: string): string[] {
  const near = nearbyPlots(PLOT_BY_ID[plotId]);
  return e.kids!.filter((k) => !e.raided?.includes(k) && near.some((q) => q.id === k));
}

/** A kid stand's pull on a walker, by appealFor's formula: a Folding Table (curb appeal x1.0) pouring Classic at the kids'
 * $0.50, priced against an L1 Classic ceiling where it stands, with neutral stars (x1.0). */
export function kidAppeal(plotId: string, seg: SegmentId): number {
  return segmentPriceFit(plotId, seg, KIDS_DAY.price, ceilingFor(1, PLOT_BY_ID[plotId].district, 'classic'));
}

/**
 * passerby's one call, on the street a walker of plot p walks (demand.ts). Kid stands within 2 plots split it like any
 * stand: they join the neighbours who aren't the home owner's, so with the rival stands there they take their appeal
 * share, never more than 35%, and the kids get their part of that. It runs for every walker, so without a kid stand near
 * it only looks down the running events. Returns the kid stand's sale, or the street to walk on: as it was when no kid
 * stand is near, else with the rivals' share once the walker has passed the kids, so every stand keeps its exact odds.
 * Gone to the kids counts as gone to a rival.
 */
export function kidStandSale(s: GameState, p: Plot, rng: Rng, seg: SegmentId, street: Street): SimEvent | Street {
  const e = kidsDay(s);
  if (!e?.kids?.length) return street;
  const kids = kidsNear(e, p.id);
  if (!kids.length) return street;
  let theirs = 0;
  for (const k of kids) theirs += kidAppeal(k, seg);
  const others = street.rivalTotal + theirs;
  const share = Math.min(RIVAL_SHARE_CAP, others / (street.ownTotal + others));
  const toKids = (share * theirs) / others;
  if (nextRandom(rng) >= toKids) return { ...street, share: (share - toKids) / (1 - toKids) };
  const home = s.plots[p.id];
  home.stand!.day.walkedPast.rival++;
  if (home.owner === 'player') {
    s.today.passersby++;
    s.today.walkedPast.rival++;
    e.took = (e.took ?? 0) + 1;
  }
  return { type: 'passerby', plot: p.id, at: p.id, segment: seg, buys: false, reason: 'rival', price: KIDS_DAY.price, owner: home.owner! };
}

/** A kid stand's Raid Planner: raids unlocked, a guard free, the stand still up, before dusk. Rivals never raid one. */
export function canRaidKids(s: GameState, plotId: string): Blocker {
  if (peaceful(s)) return { ok: false, why: 'Peaceful: no raids in this Sandbox' };
  if (s.rank < RAID_RANK) return { ok: false, why: `Raids unlock at Rank ${RAID_RANK}` };
  const e = kidsDay(s);
  if (!e?.kids?.includes(plotId) || e.raided?.includes(plotId)) return { ok: false, why: 'No kid stand here' };
  if (s.phase !== 'prep' && s.phase !== 'open') return { ok: false, why: 'They packed up at dusk' };
  if (!availableRaiders(s).length) return { ok: false, why: 'No guards free' };
  return { ok: true };
}

/** Your crew takes a kid's pitcher: the stand shuts for the day and its walkers come back, for 0.5 star, tomorrow's front page
 * and Lottie's respect. */
export function raidKidStand(s: GameState, plotId: string): boolean {
  if (!canRaidKids(s, plotId).ok) return false;
  (kidsDay(s)!.raided ??= []).push(plotId);
  s.reputation = Math.max(1, round2(s.reputation - KIDS_DAY.stars));
  const w = worldOf(s);
  (w.paper ??= newsroomNow(s)).scandal = s.day; // the Bugle's front page tomorrow
  w.shamed = s.day;
  s.news.push(`Lottie: "${KIDS_RAID_LINE}" (−${KIDS_DAY.stars} star)`);
  return true;
}

/**
 * Lottie's goal on Kids' Lemonade Day: leave them alone until dusk. It steps into the medium slot of Lottie's card for the
 * day (goals.ts's GOAL_PROVIDERS), wears the page icon and pays like any goal when it's ticked off at closing. Gone once
 * you raid one.
 */
export function kidsDayGoal(s: GameState): Goal | null {
  const e = kidsDay(s);
  if (!e || e.raided?.length) return null;
  const done = s.phase === 'report' || s.phase === 'night';
  const progress = done ? 1 : s.phase === 'open' ? clamp((s.minute - OPEN) / (CLOSE - OPEN), 0, 1) : 0;
  return { text: 'Leave the kid stands alone until dusk', progress, done };
}
/** The provider's id: Lottie's card names its goal `${id}:${text}`. */
export const KIDS_GOAL = 'kidsDay';
/**
 * Puts Kids' Day's goal on Lottie's card, once. The world's migrate runs it for every new game and load, and a Kids' Day
 * runs it as it starts; never at import, as goals.ts may still be loading then (it imports the economy, which imports us).
 */
export function provideKidsGoal(): void {
  if (!GOAL_PROVIDERS.some((p) => p.id === KIDS_GOAL)) GOAL_PROVIDERS.push({ id: KIDS_GOAL, slot: 'medium', goal: kidsDayGoal });
}

registerEvent({
  id: 'kidsDay', name: "Kids' Lemonade Day", kind: 'mixed', scope: 'bay', when: 'dawn', days: 1,
  counter: 'Leave them alone until dusk', weight: 0,
  plan: (s, rng, season) => (season === 'summer' && nextRandom(rng) < KIDS_DAY.chance ? planDay(s, rng, KIDS_DAY.window, 1, weekday) : null),
  place: kidPlots,
  start: (s) => { // the goal on Lottie's card; last year's is forgotten, so this one shows and pays
    provideKidsGoal();
    if (s.goals) s.goals.done = s.goals.done.filter((id) => !id.startsWith(`${KIDS_GOAL}:`));
  },
  bugle: () => ["KIDS' LEMONADE DAY!", 'Kid stands all over the bay'],
  headline: () => "KIDS' LEMONADE DAY! Kid stands pop up on sidewalks all over the bay. Lottie: leave them alone until dusk.",
});
