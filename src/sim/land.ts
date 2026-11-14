// Land and territory (spec: Land and territory; canon section 9): where you may
// buy, what lifts land prices, district control tiers and the Full Control
// perks. Pure functions over GameState, like the rest of the sim.
import {
  DISTRICT_RANK, FACILITY_DEVELOPMENT, MAJORITY, MAJORITY_LAND_DISCOUNT, MAP_SIZES, RANKS, STRONGHOLD, type MapSize, type RivalId,
} from './balance.ts';
import { BORDERS, cutMap, mapDistricts, onMap, picksFit, plotOnMap, PLOTS, type DistrictId, type Plot } from './map.ts';
import type { Blocker, GameState } from './economy.ts';
import type { Settings } from './modes.ts';
import { hasFoothold, standCost } from './economy.ts';
import { districtControl } from './modes.ts';
import { closeAuctions, openLavender } from './auction.ts';
import { book, stockValue } from './ledger.ts';
import { migratePolicies, policiesAtDawn } from './policies.ts';

// ---------- the map (spec: Sandbox: Turf War) ----------

/**
 * New Game: a Sandbox run keeps its size (Large unless picked) and its rivals (the size's picks unless the ones given
 * fit it), and Small and Medium get the districts and retags cut for them (map.ts cutMap). The campaign and Endless
 * play the whole bay with all five rivals. Whatever an earlier run's settings carried over is worked out again.
 */
export function settleMap(st: Settings): Settings {
  delete st.districts;
  delete st.retag;
  if (st.mode !== 'sandbox') { delete st.map; delete st.rivals; return st; }
  const size: MapSize = st.map && st.map in MAP_SIZES ? st.map : 'large';
  st.map = size;
  if (!st.rivals || !picksFit(size, st.rivals)) st.rivals = [...MAP_SIZES[size].picks];
  if (size === 'large') return st;
  const cut = cutMap(size, st.rivals)!;
  st.districts = cut.districts;
  if (Object.keys(cut.retag).length) st.retag = cut.retag;
  return st;
}

const EVERY_RIVAL = MAP_SIZES.large.picks;
/** The rivals that play this run: a Sandbox's picks, else all five. The rest never exist in play. */
export const rivalsInPlay = (s: { settings: Settings }): RivalId[] => s.settings.rivals ?? EVERY_RIVAL;
export const inPlay = (s: { settings: Settings }, id: RivalId) => rivalsInPlay(s).includes(id);
/** The run's map size: a Sandbox's pick, else Large (the whole bay: the campaign, Endless and older saves). */
export const mapSize = (s: { settings: Settings }): MapSize => s.settings.map ?? 'large';

/** Civic buildings and HQs are never bought, so they count toward neither control nor development. */
export const isPurchasable = (p: Plot) => p.type !== 'civic' && p.type !== 'hq';

const BUYABLE = new Map<DistrictId, Plot[]>();
/** A district's purchasable plots (Maple Row 12, Old Town 12, Campus & Arts 13, Downtown 17, The Boardwalk 15, The Harbor 14, The Groves 15, Hilltop Estates 9). */
export function purchasablePlots(d: DistrictId): Plot[] {
  let list = BUYABLE.get(d);
  if (!list) { list = PLOTS.filter((p) => p.district === d && isPurchasable(p)); BUYABLE.set(d, list); }
  return list;
}

// ---------- land prices ----------

/** Development = every faction's stand levels in the district (each facility tier counts 2) ÷ (4 × its purchasable plots), capped at 1. */
export function development(s: GameState, d: DistrictId): number {
  const plots = purchasablePlots(d);
  const levels = plots.reduce((a, p) => a + (s.plots[p.id].stand?.level ?? 0) + FACILITY_DEVELOPMENT * (s.plots[p.id].facility?.level ?? 0), 0);
  return plots.length ? Math.min(1, levels / (4 * plots.length)) : 0;
}

// ---------- where you can buy ----------

/**
 * The rank and reach rules for buying on the spot (First Dibs skips them).
 * Campaign and Endless: Maple Row from Day 1 and Old Town from Rank 2, with no
 * border needed; every other district from Rank 3, where you hold a Foothold or
 * next to one. Sandbox: the start district from Day 1, and the border rule
 * everywhere else from Rank 2.
 */
export function reachBlocker(s: GameState, d: DistrictId): Blocker {
  if (!onMap(s, d)) return { ok: false, why: 'Off this map' }; // a Sandbox map cut from the bay
  const sandbox = s.settings.mode === 'sandbox';
  const gate = sandbox ? (d === 'maple' ? 1 : 2) : DISTRICT_RANK[d] ?? 3;
  if (s.rank < gate) return { ok: false, why: `Needs Rank ${gate}, ${RANKS[gate - 1].title}` };
  if (d === 'maple' || (!sandbox && d === 'oldtown')) return { ok: true };
  if (hasFoothold(s, 'player', d) || BORDERS[d].some((b) => onMap(s, b) && hasFoothold(s, 'player', b))) return { ok: true }; // on-map neighbours only
  return { ok: false, why: 'Get a Foothold in a bordering district first' };
}

// ---------- district control ----------

export type ControlTier = 'none' | 'foothold' | 'majority' | 'stronghold' | 'full';
const TIERS: ControlTier[] = ['none', 'foothold', 'majority', 'stronghold', 'full'];
export const TIER_NAMES: Record<ControlTier, string> = { none: 'No plots', foothold: 'Foothold', majority: 'Majority', stronghold: 'Stronghold', full: 'Full Control' };
/** What Majority and Stronghold do (spec: District control). Full Control turns on the district's perk. */
export const TIER_EFFECTS: Partial<Record<ControlTier, string>> = {
  majority: 'your stands here +10% sales, rival stands −10% appeal, land 10% cheaper for you',
  stronghold: 'raids into this district are spotted more often, and your reinforcements arrive faster',
};

/** The player's control tier in a district, live from its purchasable plots (civic and HQ plots don't count; Vacant Lots do). */
export function controlTier(s: GameState, d: DistrictId): ControlTier {
  const c = districtControl(s, d);
  if (!c.mine) return 'none';
  if (c.mine === c.total) return 'full';
  if (c.share >= STRONGHOLD) return 'stronghold';
  if (c.share >= MAJORITY) return 'majority';
  return 'foothold';
}
export const tierAtLeast = (t: ControlTier, min: ControlTier) => TIERS.indexOf(t) >= TIERS.indexOf(min);

/**
 * Majority: unowned land in that district is 10% cheaper for you, First Dibs and
 * Fire Sale prices included (so a Fire Sale plot there is 67.5% of land value).
 * It checks before the buy, so the purchase that makes the Majority pays full.
 * Not for Plot Buyouts or auction bids; rivals never get it.
 */
export const majorityDiscount = (s: GameState, d: DistrictId) => (tierAtLeast(controlTier(s, d), 'majority') ? MAJORITY_LAND_DISCOUNT : 1);

/** Plots a tier takes in a district: Maple Row's Majority is 7 of 12, its Stronghold 9, Full Control all 12. */
export function plotsForTier(d: DistrictId, t: ControlTier): number {
  const total = purchasablePlots(d).length;
  const share = { none: 0, foothold: 0, majority: MAJORITY, stronghold: STRONGHOLD, full: 1 }[t];
  if (t === 'none') return 0;
  for (let n = 1; n <= total; n++) if (n / total >= share) return n;
  return total;
}

/** The next tier up, the plot count it needs and how many more that is; null at Full Control. */
export function nextTier(s: GameState, d: DistrictId): { tier: ControlTier; at: number; more: number } | null {
  const mine = districtControl(s, d).mine;
  for (const tier of TIERS.slice(TIERS.indexOf(controlTier(s, d)) + 1)) {
    const at = plotsForTier(d, tier);
    if (at > mine) return { tier, at, more: at - mine };
  }
  return null;
}

// ---------- Full Control perks ----------

export type PerkId = 'neighborhoodWatch' | 'townFavorite' | 'wordOfMouth' | 'powerLunch' | 'touristTrap' | 'shippingLane' | 'orchardFresh' | 'oldMoneyVip';
/** Each district's perk, on while you hold every purchasable plot there (effects live in the crew, demand and VIP code). */
export const DISTRICT_PERKS: Record<DistrictId, { id: PerkId; name: string; text: string }> = {
  maple: { id: 'neighborhoodWatch', name: 'Neighborhood Watch', text: 'Free Tin-Can Alarms on your plots here, and +10% detection on every raid' },
  oldtown: { id: 'townFavorite', name: 'Town Favorite', text: '+10% traffic at your stands in Old Town and Maple Row' },
  campus: { id: 'wordOfMouth', name: 'Word of Mouth', text: 'Local campaigns half price everywhere' },
  downtown: { id: 'powerLunch', name: 'Power Lunch', text: 'Lunch rush ×1.5 in Downtown and Old Town' },
  boardwalk: { id: 'touristTrap', name: 'Tourist Trap', text: 'Tourists pay +20% everywhere' },
  harbor: { id: 'shippingLane', name: 'Shipping Lane', text: 'Ship contracts pay +15%' },
  groves: { id: 'orchardFresh', name: 'Orchard Fresh', text: '+10% traffic at all your stands' },
  hilltop: { id: 'oldMoneyVip', name: 'Old Money', text: 'VIP offers come 50% more often' }, // not Vera's boss move of the same name
};
const PERK_HOME = Object.fromEntries(Object.entries(DISTRICT_PERKS).map(([d, p]) => [p.id, d])) as Record<PerkId, DistrictId>;

/** A perk is on exactly while its district is at Full Control: no latch, so losing any plot there switches it off. */
export const perkActive = (s: GameState, id: PerkId) => controlTier(s, PERK_HOME[id]) === 'full';
export const perksOn = (s: GameState): PerkId[] => mapDistricts(s).filter((d) => controlTier(s, d.id) === 'full').map((d) => DISTRICT_PERKS[d.id].id);
/** The plots you'd need to (re)take for Full Control in a district. */
export const missingPlots = (s: GameState, d: DistrictId) => purchasablePlots(d).filter((p) => s.plots[p.id].owner !== 'player');

function controlSnapshot(s: GameState): Partial<Record<DistrictId, ControlTier>> {
  const out: Partial<Record<DistrictId, ControlTier>> = {};
  for (const d of mapDistricts(s)) { const t = controlTier(s, d.id); if (t !== 'none') out[d.id] = t; }
  return out;
}

const names = (list: Plot[]) => list.length <= 2 ? list.map((p) => p.name).join(' and ') : `${list.length} plots`;

/** Headlines when a district's tier crosses Majority or Full Control (call after land changes hands; it remembers the last tiers). */
export function announceControl(s: GameState): void {
  const was = s.control ?? {};
  for (const d of mapDistricts(s)) {
    const before = was[d.id] ?? 'none', now = controlTier(s, d.id);
    if (now === before) continue;
    const perk = DISTRICT_PERKS[d.id];
    if (now === 'full') {
      s.news.push(`FULL CONTROL! Every plot in ${d.name} is Lottie's. ${perk.name} is on: ${perk.text.toLowerCase()}.`);
      s.perksLost = (s.perksLost ?? []).filter((id) => id !== perk.id);
    } else if (before === 'full') {
      s.news.push(`${perk.name} switches off. Win back ${names(missingPlots(s, d.id))} to turn it on again.`);
      if (!(s.perksLost ?? []).includes(perk.id)) (s.perksLost ??= []).push(perk.id);
    }
    if (now !== 'full' && tierAtLeast(now, 'majority') && !tierAtLeast(before, 'majority')) s.news.push(`MAJORITY in ${d.name}! Land there is 10% cheaper for Lottie now.`);
    if (!tierAtLeast(now, 'majority') && tierAtLeast(before, 'majority')) s.news.push(`Lottie's Majority in ${d.name} slips away.`);
  }
  s.control = controlSnapshot(s);
}

// ---------- Every Last Plot ----------

/**
 * Every Last Plot (spec: "Owning every purchasable plot earns Every Last Plot"; canon: "for completionists"): every
 * plot on the map that can be bought is yours. HQs don't count (captured, never bought: a bankrupt rival's empty HQ
 * can't block it), nor do civic plots or land off a Sandbox map.
 */
export const everyLastPlot = (s: GameState) => PLOTS.every((p) => !isPurchasable(p) || !plotOnMap(s, p) || s.plots[p.id].owner === 'player');

/** The morning paper's line for it ("EVERY LAST PLOT! ..." leads the Bugle: media.ts reads s.news overnight and at dawn). */
export const EVERY_LAST_PLOT_HEADLINE = "EVERY LAST PLOT! Every lot in town flies Lottie's colors.";

/**
 * The achievement, the moment it comes true, once a run, in every mode (Endless after the win too; checkVictory calls
 * it whenever land changes hands, and dawn does). Lottie's toast now; the Bugle leads with it at the next dawn.
 */
export function awardEveryLastPlot(s: GameState): void {
  if (s.everyLastPlotEarned || !everyLastPlot(s)) return;
  s.everyLastPlotEarned = { day: s.day };
  s.news.push('Lottie: "Every last plot in town is ours, kid! Every single one!"');
}

// ---------- dawn and saves ----------

/** At dawn, after the day's stats reset: auctions due close, then any control change gets its headline, Every Last
 * Plot its front page, and the district policies go to work. */
export function landAtDawn(s: GameState): void {
  closeAuctions(s);
  openLavender(s);
  announceControl(s);
  awardEveryLastPlot(s);
  const e = s.everyLastPlotEarned;
  if (e && !e.bugled) { e.bugled = true; s.news.push(EVERY_LAST_PLOT_HEADLINE); }
  policiesAtDawn(s); // district policies steer the helpers before they run (policies.ts)
}

/** Fill in what older saves lack (idempotent; migrateSave calls it on every load). */
export function migrateLand(s: GameState): void {
  s.control ??= controlSnapshot(s);
  clearTrophyStands(s);
  migratePolicies(s);
}

/**
 * A Trophy holds only its HQ (spec: "the HQ becomes your Trophy building"; one building per plot), so it is never
 * smashed, never lapses and is never lost. An older save that built a stand on one has it taken down: what the stand
 * cost and the stock on it come back as cash, on today's Ledger.
 */
function clearTrophyStands(s: GameState): void {
  for (const p of PLOTS) {
    const ps = s.plots[p.id];
    if (p.type !== 'hq' || ps?.owner !== 'player' || !ps.stand) continue;
    const build = Math.min(ps.invested, standCost(ps.stand.level));
    book(s, 'invested', build); // a building sold comes back off Invested
    book(s, 'stock', Math.round(stockValue(ps.stand) * 100) / 100);
    ps.invested = Math.round((ps.invested - build) * 100) / 100;
    ps.stand = null;
  }
}
