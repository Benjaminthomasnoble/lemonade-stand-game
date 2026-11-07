// The random events themselves (spec: Events and the living world, Random events), on events.ts's scheduler: the
// Market shocks (Lemon Blight, Sugar Shortage), the traffic surges (Viral Video, Celebrity Sighting, Parade Route,
// Roadworks), the Tourist Bus and the Food Critic. Each names its counter-play, and the Bugle (or 101.5, mid-day)
// announces it with its district and length. Pure and seeded: every placement draws from the scheduler's rng.
import { nextRandom } from './rng.ts';
import { DISTRICT_BY_ID, DISTRICTS, PLOT_BY_ID, PLOTS, type DistrictId } from './map.ts';
import {
  EVENT_NEAR_YOU, EVENT_TRAFFIC, FOOD_CRITIC, RANDOM_EVENTS, SEGMENTS, SUPPLY_SHOCK, TOURIST_BUS_SHARE, type SegmentId,
} from './balance.ts';
import type { GameState } from './economy.ts';
import { appealFor, playerStands } from './economy.ts';
import { shineReason } from './recipes.ts';
import { registerEvent, type Placement, type WorldEvent } from './events.ts';
import { eventWhere } from './media.ts';

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
