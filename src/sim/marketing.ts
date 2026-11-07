// Local campaigns past a stand's own (spec: Marketing, Local campaigns). Sunny the Lemon's mascot walk and the
// Coupon Blitz work one district for one day. Morning Prep runs a campaign today; during business hours any of them
// books for tomorrow, and a booking starts at the next open (spec: Appendix B, Day 12). canRunCampaign and
// runCampaign (economy.ts) call in here; the marketing number takes Sunny's walk and today's bookings from
// campaignTerms, appealFor and serveAt take the Coupon Blitz from standPriceFit and salePrice. The Billboard is a
// building (FACILITIES in vip.ts): billboardTerms adds its traffic, billboardCurb its pull on rival stands. Pure: no draws.
import { BILLBOARD, CAMPAIGNS, DISTRICT_CAMPAIGNS, RANKS, type CampaignId, type DistrictCampaignId, type LocalCampaignId, type SegmentId } from './balance.ts';
import { DISTRICT_BY_ID, nearbyPlots, PLOT_BY_ID, PLOTS, type DistrictId, type FactionId } from './map.ts';
import type { Blocker, GameState, PlotState, Stand } from './economy.ts';
import { canRunCampaign, startCampaign } from './economy.ts';
import { adsBlocked, campaignCost, segmentPriceFit, type MarketingAdd } from './demand.ts';
import { isWrecked } from './crew.ts';
import { book } from './ledger.ts';
import { underCeaseAndDesist } from './calendar.ts';

/** Sunny's walk or a Coupon Blitz: one district, one day. `paid` is Sunny's fee, `cut` the Blitz's price cut, both fixed when it's run. */
export interface DistrictCampaign { id: DistrictCampaignId; district: DistrictId; day: number; paid?: number; cut?: number; booked?: boolean }
/** A stand's campaign booked during business hours: it starts at that day's open, or `paid` comes back. */
export interface Booking { id: CampaignId; plot: string; day: number; paid: number }
export interface MarketingState { districts: DistrictCampaign[]; booked: Booking[] }

export const isDistrictCampaign = (id: LocalCampaignId): id is DistrictCampaignId => id in DISTRICT_CAMPAIGNS;
export const campaignName = (id: LocalCampaignId): string => (isDistrictCampaign(id) ? DISTRICT_CAMPAIGNS[id].name : CAMPAIGNS[id].name);

/** The day a campaign planned now works: today at Morning Prep, tomorrow during business hours (a booking); null after closing. */
export function campaignDay(s: GameState): number | null {
  return s.phase === 'prep' ? s.day : s.phase === 'open' ? s.day + 1 : null;
}

/** That kind of district campaign on a day: Sunny's district (there's one Sunny), or one district's Blitz. */
export function districtCampaign(s: GameState, id: DistrictCampaignId, day = s.day, district?: DistrictId): DistrictCampaign | undefined {
  return s.marketing?.districts.find((c) => c.id === id && c.day === day && (district === undefined || c.district === district));
}

/** A stand of yours in the district still open for business (not Wrecked or Busted). */
const openStandIn = (s: GameState, d: DistrictId) =>
  PLOTS.some((p) => p.district === d && s.plots[p.id].owner === 'player' && s.plots[p.id].stand && !isWrecked(s.plots[p.id]));

/** Can Sunny or a Coupon Blitz work this stand's district: today at Morning Prep, or booked for tomorrow while open? */
export function districtBlocker(s: GameState, id: DistrictCampaignId, plotId: string): Blocker {
  const c = DISTRICT_CAMPAIGNS[id];
  const ps = s.plots[plotId];
  if (!ps?.stand || ps.owner !== 'player') return { ok: false, why: 'Pick a stand' };
  const day = campaignDay(s);
  if (day === null) return { ok: false, why: 'Plan campaigns during Morning Prep' };
  if (s.rank < c.rank) return { ok: false, why: `Needs Rank ${c.rank}, ${RANKS[c.rank - 1].title}` };
  const d = PLOT_BY_ID[plotId].district;
  if (adsBlocked(s, 'player', plotId)) return { ok: false, why: 'Cease-and-Desist: ads count for nothing here' };
  if (!openStandIn(s, d)) return { ok: false, why: 'No open stand here' };
  const on = districtCampaign(s, id, day, c.onePerDay ? undefined : d);
  if (on?.district === d) return { ok: false, why: day === s.day ? 'Running today' : 'Booked for tomorrow' };
  if (on) return { ok: false, why: `Sunny walks ${DISTRICT_BY_ID[on.district].name} ${day === s.day ? 'today' : 'tomorrow'}` };
  const cost = campaignCost(s, id); // Word of Mouth halves it
  if (cost.cash && s.cash < cost.cash) return { ok: false, why: `Needs $${cost.cash}` };
  return { ok: true };
}

/**
 * Why a stand's own campaign can't be planned for that day ('' if it can): it's running then or booked here, or a
 * Free Sample Day runs or is booked anywhere (only one runs at a time across your empire, so its star can't be farmed).
 */
export function standCampaignBusy(s: GameState, id: CampaignId, plotId: string, day: number): string {
  const ahead = day - s.day; // 0 today, 1 for a booking
  const left = s.plots[plotId].stand!.campaigns[id] ?? 0;
  if (left > ahead) return `Running (${left} day${left === 1 ? '' : 's'} left)`;
  const booked = s.marketing?.booked ?? [];
  if (booked.some((b) => b.id === id && b.plot === plotId && b.day === day)) return day === s.day ? 'Booked for today' : 'Booked for tomorrow';
  if (id !== 'freeSamples') return '';
  for (const p of PLOTS) {
    if (p.id !== plotId && s.plots[p.id].owner === 'player' && (s.plots[p.id].stand?.campaigns.freeSamples ?? 0) > ahead) return `Running at ${p.name}`;
  }
  const other = booked.find((b) => b.id === 'freeSamples' && b.day >= s.day);
  return other ? `Booked at ${PLOT_BY_ID[other.plot].name}` : '';
}

/** Sunny or a Blitz for its day, or a stand's campaign booked for tomorrow, paid now. canRunCampaign has said yes. */
export function planCampaign(s: GameState, id: LocalCampaignId, plotId: string): boolean {
  const day = campaignDay(s)!;
  const cost = campaignCost(s, id); // Word of Mouth halves it
  if (cost.cash) book(s, 'marketing', -cost.cash);
  const m = (s.marketing ??= { districts: [], booked: [] });
  if (isDistrictCampaign(id)) {
    m.districts.push({ id, district: PLOT_BY_ID[plotId].district, day, paid: cost.cash || undefined, cut: cost.cut || undefined, booked: day > s.day || undefined });
  } else {
    m.booked.push({ id, plot: plotId, day, paid: cost.cash });
  }
  return true;
}

/** Cups a Free Sample Day booked for today will hand out at this stand when it opens (Auto-Restock buys them too). */
export function bookedSamples(s: GameState, plotId: string): number {
  return s.marketing?.booked.some((b) => b.id === 'freeSamples' && b.plot === plotId && b.day === s.day) ? campaignCost(s, 'freeSamples').samples : 0;
}

/**
 * The stands open: past days' walks and Blitzes are cleared, and what was booked for today starts. A booking that
 * can't (the stand was lost, smashed or grew past the Sign kid, a Cease-and-Desist landed, no stock for the samples)
 * is called off and its money comes back.
 */
export function startBookings(s: GameState): void {
  const m = s.marketing;
  if (!m) return;
  m.districts = m.districts.filter((c) => c.day >= s.day);
  for (const c of m.districts.filter((x) => x.booked && x.day === s.day)) {
    const why = underCeaseAndDesist(s, c.district) ? 'Cease-and-Desist' : !openStandIn(s, c.district) ? 'No open stand here' : '';
    c.booked = undefined;
    if (!why) continue;
    m.districts.splice(m.districts.indexOf(c), 1);
    callOff(s, `${DISTRICT_CAMPAIGNS[c.id].name} in ${DISTRICT_BY_ID[c.district].name}`, why, c.paid ?? 0);
  }
  if (!m.booked.length) return;
  const due = m.booked.filter((b) => b.day <= s.day);
  m.booked = m.booked.filter((b) => b.day > s.day);
  for (const b of due) {
    const ok = b.day === s.day ? canRunCampaign(s, b.id, b.plot, true) : { ok: false, why: 'Missed its day' };
    if (ok.ok) startCampaign(s, b.id, b.plot);
    else callOff(s, `${CAMPAIGNS[b.id].name} at ${PLOT_BY_ID[b.plot].name}`, ok.why, b.paid);
  }
}

/** A booking that can't start: Benny says why and hands its money back. */
function callOff(s: GameState, what: string, why: string, paid: number): void {
  if (paid) book(s, 'marketing', paid);
  s.news.push(`Benny: "${what} is off (${why}).${paid ? ` Here's your $${paid} back.` : ''}"`);
}

// ---------- the marketing number and the price fit ----------

/**
 * The marketing number's terms from here: Sunny's +25% at your stands in the district the mascot walks today, and a
 * stand's campaign booked for today (it counts in Morning Prep's odds before it starts at the open).
 */
export function campaignTerms(s: GameState, owner: FactionId, add: MarketingAdd, st?: Stand, plotId?: string): void {
  const m = s.marketing;
  if (owner !== 'player' || !plotId || !m) return;
  const d = PLOT_BY_ID[plotId]?.district;
  for (const c of m.districts) {
    const k = DISTRICT_CAMPAIGNS[c.id];
    if (k.traffic && c.day === s.day && c.district === d) add(c.id, k.name, k.traffic, adsBlocked(s, owner, plotId));
  }
  for (const b of m.booked) {
    const k = CAMPAIGNS[b.id];
    if (b.day === s.day && b.plot === plotId && !(st && k.maxLevel && st.level > k.maxLevel)) add(b.id, k.name, k.traffic, adsBlocked(s, owner, plotId));
  }
}

// ---------- Billboards ----------

/** A Billboard standing on this plot (a Wrecked one counts for nothing until it's rebuilt). */
export const standingBillboard = (ps: PlotState): boolean => ps.facility?.kind === 'billboard' && !ps.facility.wrecked;

/** The owners of the standing Billboards within 2 plots of a plot, across district lines too: one entry each. */
export function billboardsNear(s: GameState, plotId: string): FactionId[] {
  const out: FactionId[] = [];
  for (const q of nearbyPlots(PLOT_BY_ID[plotId])) {
    const ps = s.plots[q.id];
    if (ps.owner && standingBillboard(ps)) out.push(ps.owner);
  }
  return out;
}

/** The marketing number's Billboard term: +20% for each of the owner's Billboards within 2 plots of its stand. */
export function billboardTerms(s: GameState, owner: FactionId, add: MarketingAdd, plotId?: string): void {
  if (!plotId) return;
  const n = billboardsNear(s, plotId).filter((o) => o === owner).length;
  if (n) add('billboard', n === 1 ? 'Billboard' : `${n} Billboards`, n * BILLBOARD.traffic, adsBlocked(s, owner, plotId));
}

/**
 * Curb appeal from Billboards: a stand within 2 plots of another owner's Billboard is ×0.9, once however many reach
 * it. A Cease-and-Desist in the stand's district voids your Billboards there.
 */
export function billboardCurb(s: GameState, plotId: string): number {
  const own = s.plots[plotId]?.owner;
  return billboardsNear(s, plotId).some((o) => o !== own && !adsBlocked(s, o, plotId)) ? BILLBOARD.rivalCurb : 1;
}

/** The Coupon Blitz's price cut at this stand today: 0 without one, at a rival's stand, or under a Cease-and-Desist. */
export function couponCut(s: GameState, plotId: string): number {
  const m = s.marketing;
  if (!m?.districts.length || s.plots[plotId]?.owner !== 'player') return 0;
  const c = districtCampaign(s, 'couponBlitz', s.day, PLOT_BY_ID[plotId].district);
  return c && !adsBlocked(s, 'player', plotId) ? c.cut ?? DISTRICT_CAMPAIGNS.couponBlitz.priceCut! : 0;
}

/** What a cup sells for at this stand today: its price, less a Coupon Blitz's cut, to the cent. */
export function salePrice(s: GameState, plotId: string, st: Stand = s.plots[plotId].stand!): number {
  const cut = couponCut(s, plotId);
  return cut ? Math.round(st.price * (1 - cut) * 100) / 100 : st.price;
}

/**
 * A stand's price fit for one segment (spec: Pricing). Under a Coupon Blitz the set price's fit is ×1.4, in place of
 * what the cut would win on the curve (at most +25%); an overpriced stand gets the coupon price's own fit if that's more.
 */
export function standPriceFit(s: GameState, plotId: string, seg: SegmentId, st: Stand, ceiling: number): number {
  const fit = segmentPriceFit(plotId, seg, st.price, ceiling);
  const cut = couponCut(s, plotId);
  return cut ? Math.max(fit * DISTRICT_CAMPAIGNS.couponBlitz.appeal!, segmentPriceFit(plotId, seg, salePrice(s, plotId, st), ceiling)) : fit;
}

// ---------- saves ----------

/** Older saves have no district campaigns or bookings; a save with them keeps both lists (idempotent). */
export function migrateMarketing(s: GameState): void {
  if (!s.marketing) return;
  s.marketing.districts ??= [];
  s.marketing.booked ??= [];
}
