// The pacing harness (spec: Economy and balance, "How the numbers were checked" and the pacing chart, docs/spec/pacing.csv).
// A headless player plays a run through the game's public actions, the ones the HUD calls (buy a plot, build, upgrade,
// hire, fence, raid, buy out, storm an HQ, take an order, bid), so it keeps working as the sim grows. It buys whatever
// pays back fastest, keeps a share of its takings for security (a quarter at first, tapering as the spec's does) and raids
// rival stands at night. The run is then read against the spec's targets: rank days and Domination, income by stage,
// security spend, raid losses, the VIP firsts and share, lulls, Net Worth growth and the pacing chart.
//   npm run sim -- pacing [days] [maps] [classic|laidback|cutthroat|all] [-v]
// prints the report (tools/sim-report.ts). Pure: no DOM, no clock, no files.
import {
  acceptOrder, approveRepair, auctionOf, auctionPlots, bidGuess, bottleCost, bottlingCapacity, BOTTLES_PER_DAY, BRAND_TIERS, buildClubhouse, buildFacility, buildStand, buyBrand,
  buyPerimeter, buyPlot, callBigSqueeze, CLUBHOUSE, canBid, canBuildClubhouse, canBuildFacility, canBuildStand, canBuyBrand,
  canBuyPerimeter, canBuyPlot, canCallBigSqueeze, canFactionBuyout, canHire, canPlotBuyout, canRaid, canRebuild, canUpgradeStand,
  costPerCup, dealShortfallPerDay, districtControl, expectedCups, FACILITIES, factionBuyout, factionBuyoutPrice, fillPosts,
  gameOver, guardReady, haggle, haggles, haggling, hasBuilding, HELI_SIZES, hireGuard, hqOdds, hqPlot, isVip, isWrecked, keepSqueezing, LAVENDER_LOT, LOADING_PER_DAY, MAJORITY, mapDistricts, nearbyPlots,
  netWorth, newGame, newStand, openStand, ORDER_TIERS, PERIMETERS, placeBid, planRaid, playerStands, PLOT_BY_ID, plotBuyout,
  plotBuyoutPrice, plotOnMap, plotPrice, PLOTS, plotType, priceCeiling, pricingOn, raidOdds, RAID_RANK, RANKS, rebuildCost, rebuildStand,
  repairCost, rivalsInPlay, rosterCap, setPrice, SHIP_SIZES, simulateRestOfDay, sleepUntilDawn, SQUAD_CAP, STAND_LEVELS, STAND_RANK_GATE, standCost,
  standLevel, successScore, upgradeStand, yourDays,
  type BattleReport, type Difficulty, type FacilityKind, type GameState, type Order, type OrderTier, type Weather,
} from '../src/sim/economy.ts';
import { clubhouseSite } from '../src/sim/clubhouse.ts';
import { finishFight } from '../src/sim/fight.ts';

// ---------- the targets (design-spec: Economy and balance, Progression and unlocks; docs/spec/pacing.csv) ----------

/** The map every milestone is held to within 15% (spec: "on the reference map"); the other maps follow it. */
export const REFERENCE_SEED = 42;

/** A milestone day: the target, the range the spec's ten simulated maps gave, and for Ranks 6-10 and Domination the
 * window the reference map must land inside. */
export interface Target { target: number; lo: number; hi: number; window?: [number, number]; notBefore?: number }

export const CLASSIC_FIRST_L2: Target = { target: 4, lo: 4, hi: 5 };
export const CLASSIC_RANK_DAYS: Record<number, Target> = {
  2: { target: 4, lo: 3, hi: 4 },
  3: { target: 10, lo: 8, hi: 12 },
  4: { target: 22, lo: 15, hi: 34 },
  5: { target: 37, lo: 26, hi: 48 },
  6: { target: 55, lo: 48, hi: 60, window: [52, 58] },
  7: { target: 75, lo: 67, hi: 82, window: [71, 80] },
  8: { target: 100, lo: 87, hi: 105, window: [95, 105] },
  9: { target: 130, lo: 123, hi: 138, window: [125, 135] },
  10: { target: 155, lo: 148, hi: 162, window: [150, 160] },
};
/** Laid Back and Cutthroat rank days, Ranks 2-10 (spec: Difficulty differences; Progression's unlock table). */
export const RANK_DAYS: Record<'laidback' | 'cutthroat', number[]> = {
  laidback: [4, 9, 19, 31, 50, 67, 87, 118, 134],
  cutthroat: [4, 9, 19, 38, 59, 81, 108, 143, 163],
};
export const DOMINATION: Record<'classic' | 'laidback' | 'cutthroat', Target> = {
  classic: { target: 145, lo: 131, hi: 146, window: [140, 150], notBefore: 136 },
  laidback: { target: 126, lo: 120, hi: 136 },
  cutthroat: { target: 151, lo: 134, hi: 163 }, // the ten maps ran 134-163; "always before Day 170" is its own check
};
/** Cutthroat's Domination lands "always before Day 170", on every map (spec: Difficulty differences). */
export const DOMINATION_BY = 170;
/** The longest rank gap, Rank 8 to Rank 9, in days (spec: Gaps between ranks, "31 days"; the simulated Classic run's
 * Days 104 to 135). Laid Back and Cutthroat: their own rank days (Day 87 to 118, Day 108 to 143). */
export const RANK_8_TO_9: Record<'classic' | 'laidback' | 'cutthroat', number> = {
  classic: 31, laidback: RANK_DAYS.laidback[7] - RANK_DAYS.laidback[6], cutthroat: RANK_DAYS.cutthroat[7] - RANK_DAYS.cutthroat[6],
};
/** Average daily income (takings: cups and orders) by stage, and the stands at its end (spec: Income growth by stage). */
export const INCOME_STAGES: { from: number; to: number; income: number; stands: string }[] = [
  { from: 1, to: 8, income: 800, stands: '3 Wooden Stands' },
  { from: 9, to: 18, income: 2400, stands: '9 Wooden Stands' },
  { from: 19, to: 40, income: 5100, stands: '11 Kiosks' },
  { from: 41, to: 57, income: 31000, stands: '20 Kiosks' },
  { from: 58, to: 77, income: 260000, stands: '28 Shacks, 19 Kiosks' },
  { from: 78, to: 103, income: 850000, stands: '42 Shacks, 15 Palaces' },
  { from: 104, to: 134, income: 3.9e6, stands: '35 Shacks, 39 Palaces' },
  { from: 135, to: 143, income: 4.0e6, stands: 'the same' },
];
/** Security (guards, defenses and repairs) as a share of income (spec: Upkeep, wages and loans): a quarter in the first
 * weeks, 20-22% to Day 55, 15% to Day 80, under 10% after. */
export const SECURITY_SHARE: { from: number; to: number; lo: number; hi: number; says: string }[] = [
  { from: 1, to: 14, lo: 0.2, hi: 0.3, says: '~25%' },
  { from: 15, to: 55, lo: 0.18, hi: 0.24, says: '20-22%' },
  { from: 56, to: 80, lo: 0.12, hi: 0.18, says: '~15%' },
  { from: 81, to: 170, lo: 0, hi: 0.1, says: 'under 10%' },
];
/** A Classic raid on you after Day 6, in days of income: the worst about a third and never over 0.6, the average about 0.1. */
export const RAID_LOSS = { worst: 0.6, average: 0.1 };
/** The VIP firsts: the first chopper and ship loaded (Rank 6-7) and the first Supply Deal load (spec: Gaps between ranks). */
export const VIP_FIRSTS: Record<'heli' | 'ship' | 'deal', Target> = {
  heli: { target: 72, lo: 63, hi: 80 }, ship: { target: 87, lo: 73, hi: 89 }, deal: { target: 109, lo: 105, hi: 113 },
};
/** The VIP share of takings: about 11% on Days 52-96, about a fifth on Days 97-136, about 20% after. */
export const VIP_SHARE: { from: number; to: number; share: number }[] = [{ from: 52, to: 96, share: 0.11 }, { from: 97, to: 136, share: 0.18 }, { from: 137, to: 170, share: 0.2 }];
/** The longest stretch with nothing new (a rank, an unlock, a stand level) on the reference map; 5-10 across maps. */
export const MAX_LULL = 7;
/** Net Worth growth: about sevenfold from Day 90 to 120, about 2.5-fold from 120 to 150. */
export const GROWTH: { from: number; to: number; x: number }[] = [{ from: 90, to: 120, x: 7 }, { from: 120, to: 150, x: 2.5 }];
/** Paybacks in days on suitable plots, by the level built (Appendix A). */
export const PAYBACKS: Record<number, [number, number]> = { 2: [2, 4], 3: [4, 7], 4: [4, 11], 5: [11, 15] };
/** The passersby a day those paybacks assume for an L4 and an L5 (spec: "about 1,800 passersby a day for L4 and 4,000
 * for L5"). */
export const PLOT_TRAFFIC: Record<number, number> = { 4: 1800, 5: 4000 };

// Tolerances the spec leaves open (placeholders: spec gap): "about" a dollar figure or a share.
const ABOUT_INCOME: [number, number] = [0.75, 1.33]; // a stage's average income against its "about"
const ABOUT_SHARE = 0.05; // a VIP share, give or take five points
const ABOUT_GROWTH = 0.3; // a Net Worth multiple, give or take 30%
const ABOUT_CHART: [number, number] = [0.67, 1.5]; // Net Worth against the pacing chart's
const ABOUT_RANK = 1; // the run's rank on a chart day against the chart's: a rank either way (rank days land within 15%)
const ABOUT_TRAFFIC = 0.75; // "about 1,800+": a level's median plot at three quarters of it or busier
const ABOUT_GAP = 0.15; // the Rank 8 to Rank 9 gap on the reference map, as its milestones: within 15%

// ---------- the player ----------

/** The share of each day's takings set aside for security: the middle of the spec's share for that stretch (a quarter in
 * the first two weeks, then 21%, 15% and 5%), as security tapers off while the business grows. */
const securityCut = (day: number) => {
  const sh = SECURITY_SHARE.find((x) => day >= x.from && day <= x.to) ?? SECURITY_SHARE[SECURITY_SHARE.length - 1];
  return (sh.lo + sh.hi) / 2;
};
const SECURITY_POT_DAYS = 1.5; // the security money held back at most: this many days of takings (the rest grows the business)
const MAX_PAYBACK = 45; // days: nothing slower is worth buying
const MAX_BUYS = 12; // purchases a morning
const SAVE_DAYS = 2; // days of takings the player will save for a buy that pays back faster than anything it can afford
const PLOT_CANDIDATES = 24; // open plots weighed each morning, busiest first
const RAID_ODDS = 0.6; // a squad goes out only when it should win
const ODDS_RUNS = 16; // the Planner's dice, cut down so a run stays quick
const DOMINATION_RANK = 8; // from here the player buys toward a Majority in every district
const STAND_TYPES = ['street', 'prime', 'landmark', 'industrial'];
const WAREHOUSE_RUNS = 0.02; // a Warehouse's market runs, as a share of its district's stand profit: the sell-outs it saves (a guess)

export interface DayRow {
  day: number; rank: number; netWorth: number; score: number; cash: number;
  income: number; orders: number; vip: number; security: number; stands: number; levels: number[]; raidsOnYou: number;
}
export interface RaidLoss { day: number; cost: number; days: number }
export interface RunResult {
  seed: number; difficulty: Difficulty; days: DayRow[];
  firstL2?: number; rankDay: Record<number, number>; outcome?: { result: string; how: string; day: number };
  firstLoad: Partial<Record<OrderTier, number>>; raids: RaidLoss[]; news: { day: number; what: string }[];
  paybacks: Record<number, number[]>; // the payback each upgrade promised when the player bought it, in days, by the level it made
  traffic: Record<number, number[]>; // the passersby a day on each plot the player built or upgraded an L4 or L5 on, by level
  stuck?: string; // why the run stopped early, if it did
}
export interface PacingOpts { seed: number; difficulty?: Difficulty; days?: number; log?: (line: string) => void }

interface Buy { what: string; cost: number; gain: number; plot: string; level?: number; upgrade?: boolean; run: () => boolean }
interface Bot {
  sec: number; // the security money on hand: its share of the takings (securityCut), less wages and repairs; hires, fences and Clubhouses come off it
  secSpent: number; // what it has bought, all run
  takings: number[]; // the last week's takings
  paybacks: Record<number, number[]>;
  traffic: Record<number, number[]>;
  orders: Map<Order, number>; // orders taken, and the bottles loaded at the last look
  log?: (line: string) => void;
}

const money = (n: number) => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US');
const typical = (): Weather => ({ kind: 'warm', temp: 80 }); // a build is weighed on an ordinary day, not tomorrow's rain
const ownStands = (s: GameState) => playerStands(s).filter((p) => !s.plots[p.id].stand!.wrecked);
const weekTakings = (bot: Bot) => (bot.takings.length ? bot.takings.reduce((a, b) => a + b, 0) / bot.takings.length : 0);

/** A stand's expected day: cups at its ceiling, less the cost per cup and its upkeep. */
function standProfit(s: GameState, plotId: string, w: Weather): number {
  const st = s.plots[plotId].stand;
  if (!st || st.wrecked) return 0;
  return expectedCups(s, plotId, w) * (priceCeiling(s, plotId) - costPerCup(s, st)) - standLevel(st).upkeep;
}
/** Your stands' day around a plot: its own and the ones within 2 plots that share its walkers. */
const blockProfit = (s: GameState, plotId: string, w: Weather) =>
  nearbyPlots(PLOT_BY_ID[plotId]).filter((q) => s.plots[q.id].owner === 'player').reduce((a, q) => a + standProfit(s, q.id, w), 0);

/** What a change adds to your day around a plot: try it, read the block, then put the plot back exactly as it was. */
function gain(s: GameState, plotId: string, w: Weather, apply: () => void): number {
  const ps = s.plots[plotId];
  const owner = ps.owner, stand = ps.stand, level = stand?.level, price = stand?.price;
  const before = blockProfit(s, plotId, w);
  try {
    apply();
    return blockProfit(s, plotId, w) - before;
  } finally {
    ps.owner = owner;
    ps.stand = stand;
    if (stand) { stand.level = level!; stand.price = price!; }
  }
}
function tryStand(s: GameState, plotId: string, level: number): void {
  const ps = s.plots[plotId];
  ps.owner = 'player';
  ps.stand = newStand(level);
  ps.stand.price = priceCeiling(s, plotId);
}

/** Everything that sells more lemonade and fits the budget: upgrades, stands on land you hold, a plot and a stand, a
 * rival's stand bought out, the next marketing tier. */
function growthCandidates(s: GameState, budget: number): Buy[] {
  const w = typical();
  const out: Buy[] = [];
  const top = STAND_LEVELS.filter((l) => s.rank >= STAND_RANK_GATE[l.level - 1]).length;
  for (const p of ownStands(s)) {
    const st = s.plots[p.id].stand!;
    const next = STAND_LEVELS[st.level];
    if (!next || next.cost > budget || !canUpgradeStand(s, p.id).ok) continue;
    const g = gain(s, p.id, w, () => { st.level = next.level; st.price = priceCeiling(s, p.id); });
    out.push({ what: `upgrade ${p.name} to ${next.name}`, cost: next.cost, gain: g, plot: p.id, level: next.level, upgrade: true, run: () => upgradeStand(s, p.id) });
  }
  for (const p of PLOTS) {
    const ps = s.plots[p.id];
    if (ps.owner !== 'player' || ps.stand || ps.facility || !STAND_TYPES.includes(plotType(s, p))) continue;
    for (let l = 1; l <= top; l++) {
      if (standCost(l) > budget || !canBuildStand(s, p.id, l).ok) continue;
      const g = gain(s, p.id, w, () => tryStand(s, p.id, l));
      out.push({ what: `build ${STAND_LEVELS[l - 1].name} on ${p.name}`, cost: standCost(l), gain: g, plot: p.id, level: l, run: () => buildStand(s, p.id, l) });
    }
  }
  const open = PLOTS.filter((p) => STAND_TYPES.includes(plotType(s, p)) && !s.plots[p.id].owner && plotOnMap(s, p) && canBuyPlot(s, p.id).ok)
    .sort((a, b) => b.baseTraffic - a.baseTraffic).slice(0, PLOT_CANDIDATES);
  for (const p of open) {
    const price = plotPrice(s, p.id);
    for (let l = 1; l <= top; l++) {
      if (price + standCost(l) > budget) break;
      const g = gain(s, p.id, w, () => tryStand(s, p.id, l));
      out.push({ what: `buy ${p.name} with a ${STAND_LEVELS[l - 1].name}`, cost: price + standCost(l), gain: g, plot: p.id, level: l, run: () => buyPlot(s, p.id) && buildStand(s, p.id, l) });
    }
  }
  const theirs = PLOTS.filter((p) => {
    const ps = s.plots[p.id];
    return ps.stand && !ps.stand.wrecked && ps.owner && ps.owner !== 'player' && canPlotBuyout(s, p.id).ok && plotBuyoutPrice(s, p.id) <= budget;
  }).sort((a, b) => b.baseTraffic - a.baseTraffic).slice(0, PLOT_CANDIDATES / 2);
  for (const p of theirs) {
    const g = gain(s, p.id, w, () => { s.plots[p.id].owner = 'player'; });
    out.push({ what: `Plot Buyout of ${p.name}`, cost: plotBuyoutPrice(s, p.id), gain: g, plot: p.id, run: () => plotBuyout(s, p.id) });
  }
  const tier = BRAND_TIERS[s.brandTier];
  if (tier && tier.cost <= budget && canBuyBrand(s).ok) {
    const all = ownStands(s).reduce((a, p) => a + standProfit(s, p.id, w), 0);
    out.push({ what: tier.name, cost: tier.cost, gain: all * tier.traffic, plot: '', run: () => buyBrand(s) });
  }
  return out.filter((b) => b.gain > 0);
}

/** The VIP engine's average day: the bottles you make, sold best-paying first (ships and Supply Deals, then choppers, then
 * Caterer Trucks) to what the offers ask for and your Pier and Pad can load, less a bottle's cost each. Rough: offers
 * come and go, and a tier waits for its rank and stars. `ware`: a Warehouse stands (the Caterer Trucks' gate). */
function vipDay(s: GameState, bottles: number, heli: number, ship: number, ware = lineLevel(s, 'warehouse') > 0): number {
  const open = (t: OrderTier) => s.rank >= ORDER_TIERS[t].rank && s.reputation >= ORDER_TIERS[t].stars;
  const asked = (t: OrderTier, size: [number, number]) => (open(t) ? (ORDER_TIERS[t].chance * (size[0] + size[1])) / 2 : 0);
  const deal = ship >= 3 && open('deal') ? ORDER_TIERS.deal.size[0] / ORDER_TIERS.deal.days : 0; // a Supply Deal's bottles over its weeks
  const lines: [number, OrderTier][] = [
    [ship ? Math.min(asked('ship', SHIP_SIZES[ship - 1]) + deal, LOADING_PER_DAY.pier[ship - 1]) : 0, 'ship'],
    [heli ? Math.min(asked('heli', HELI_SIZES[heli - 1]), LOADING_PER_DAY.helipad[heli - 1]) : 0, 'heli'],
    [ware && bottles > 0 ? asked('caterer', ORDER_TIERS.caterer.size) : 0, 'caterer'], // Caterer Trucks need a Bottling Works and a Warehouse
  ];
  let left = bottles, day = 0;
  for (const [want, t] of lines.sort((a, b) => ORDER_TIERS[b[1]].pay - ORDER_TIERS[a[1]].pay)) {
    const n = Math.min(left, want);
    day += n * (ORDER_TIERS[t].pay - bottleCost(s));
    left -= n;
  }
  return day;
}
const lineLevel = (s: GameState, kind: FacilityKind) =>
  Math.max(0, ...PLOTS.filter((p) => s.plots[p.id].owner === 'player' && s.plots[p.id].facility?.kind === kind && !s.plots[p.id].facility!.wrecked).map((p) => s.plots[p.id].facility!.level));

/** The VIP engine as the ranks open it: a Bottling Works, a Pad and a Jetty, two Lemon Groves and a Warehouse, each grown a
 * level at a time, weighed by what it adds to the engine's day (vipDay; a Grove: +5% at every stand; a Warehouse: the
 * Caterer Trucks, and WAREHOUSE_RUNS of its district's stands' day for the market runs). A site is land of yours, land
 * for sale, or a rival's plot bought out; a rival's plot that already holds one comes with it at its level (every Field
 * on Citrine Bay starts as Hollis's Grove or Sourwood's Pad, every Dock as FizzCo's or Sourwood's), and a Lemon Grove of
 * yours makes way for a Pad (buildFacility), so a Field bought out from Hollis is a Pad site too. */
function facilityCandidates(s: GameState, budget: number): Buy[] {
  const out: Buy[] = [];
  const theirs = (id: string) => !!s.plots[id].owner && s.plots[id].owner !== 'player' && canPlotBuyout(s, id).ok;
  const now = { bottles: bottlingCapacity(s), heli: lineLevel(s, 'helipad'), ship: lineLevel(s, 'pier') };
  const base = vipDay(s, now.bottles, now.heli, now.ship);
  const runs = (id: string) => WAREHOUSE_RUNS * ownStands(s).filter((p) => p.district === PLOT_BY_ID[id].district).reduce((a, p) => a + standProfit(s, p.id, typical()), 0);
  const made = (l: number) => (l ? BOTTLES_PER_DAY[l - 1] : 0);
  const adds = (kind: FacilityKind, from: number, to: number) =>
    kind === 'grove' ? (from ? 0 : 0.05 * ownStands(s).reduce((a, p) => a + standProfit(s, p.id, typical()), 0))
      : kind === 'bottling' ? vipDay(s, now.bottles + made(to) - made(from), now.heli, now.ship) - base
        : kind === 'helipad' ? vipDay(s, now.bottles, Math.max(now.heli, to), now.ship) - base
          : kind === 'warehouse' ? vipDay(s, now.bottles, now.heli, now.ship, true) - base
            : vipDay(s, now.bottles, now.heli, Math.max(now.ship, to)) - base;
  for (const kind of ['bottling', 'helipad', 'pier', 'grove', 'warehouse'] as FacilityKind[]) {
    const f = FACILITIES[kind];
    const have = PLOTS.filter((p) => s.plots[p.id].owner === 'player' && s.plots[p.id].facility?.kind === kind && !s.plots[p.id].facility!.wrecked);
    for (const p of have) {
      const lvl = s.plots[p.id].facility!.level;
      if (lvl < f.names.length && f.costs[lvl] <= budget && canBuildFacility(s, p.id, kind).ok) {
        out.push({ what: `grow ${p.name} to ${f.names[lvl]}`, cost: f.costs[lvl], gain: adds(kind, lvl, lvl + 1), plot: p.id, run: () => buildFacility(s, p.id, kind) });
      }
    }
    if ((kind === 'grove' ? 2 : 1) <= have.length || s.rank < f.ranks[0]) continue;
    for (const p of PLOTS) { // a rival's, standing: a Plot Buyout brings it over at its level
      const fac = s.plots[p.id].facility;
      if (fac?.kind !== kind || fac.wrecked || !plotOnMap(s, p) || !theirs(p.id)) continue;
      const cost = plotBuyoutPrice(s, p.id);
      if (cost <= budget) out.push({ what: `Plot Buyout of ${p.name} and its ${f.names[fac.level - 1]}`, cost, gain: adds(kind, 0, fac.level), plot: p.id, run: () => plotBuyout(s, p.id) });
    }
    const grove = (id: string) => kind === 'helipad' && s.plots[id].facility?.kind === 'grove' && !s.plots[id].facility!.wrecked; // it makes way
    const sites = PLOTS.filter((p) => f.on.includes(plotType(s, p)) && plotOnMap(s, p) && (!s.plots[p.id].facility || grove(p.id)) && !s.plots[p.id].stand)
      .map((p) => {
        const ps = s.plots[p.id];
        const price = ps.owner === 'player' ? 0 : !ps.owner ? (canBuyPlot(s, p.id).ok ? plotPrice(s, p.id) : Infinity) : theirs(p.id) ? plotBuyoutPrice(s, p.id) : Infinity;
        const where = kind === 'warehouse' ? runs(p.id) : 0; // its market runs: the district's stands
        return { p, price, gain: adds(kind, 0, 1) + where - (ps.owner === 'player' && ps.facility ? adds('grove', 0, 1) : 0) }; // your Grove's 5% goes
      }).filter((x) => x.price < Infinity && x.gain > 0 && x.price + f.costs[0] <= budget)
      .sort((a, b) => (a.price + f.costs[0]) / a.gain - (b.price + f.costs[0]) / b.gain);
    const site = sites[0];
    if (!site) continue;
    const ps = s.plots[site.p.id];
    const get = () => (ps.owner === 'player' ? true : ps.owner ? plotBuyout(s, site.p.id) : buyPlot(s, site.p.id));
    out.push({ what: `${f.names[0]} on ${site.p.name}${ps.facility ? ' (its Lemon Grove makes way)' : ''}`, cost: site.price + f.costs[0], gain: site.gain, plot: site.p.id, run: () => get() && buildFacility(s, site.p.id, kind) });
  }
  return out.filter((b) => b.gain > 0);
}

/** Cash kept back for the day's stock and bills. */
function reserve(s: GameState): number {
  const w = typical();
  return 100 + ownStands(s).reduce((a, p) => a + expectedCups(s, p.id, w) * costPerCup(s, s.plots[p.id].stand!) * 1.3, 0);
}

/** Spend the security money: guards up to the beds, a Clubhouse when they're full, fences on the best stands, posts filled. */
function security(s: GameState, bot: Bot): void {
  const w = typical();
  const spend = (what: string, f: () => boolean) => {
    const before = s.cash;
    if (!f()) return false;
    bot.sec -= before - s.cash;
    bot.secSpent += before - s.cash;
    bot.log?.(`        security: ${what} ${money(before - s.cash)}`);
    return true;
  };
  // As many guards as there are stands to post them at, and a full raiding squad on top.
  const want = ownStands(s).length + SQUAD_CAP(s.rank);
  for (const r of [...s.recruits].sort((a, b) => a.fee - b.fee)) if (s.guards.length < want && r.fee <= bot.sec && canHire(s, r.id).ok) spend(`hire ${r.name}`, () => hireGuard(s, r.id));
  // Beds when the roster is full: a Clubhouse on an empty street plot of yours (bought for it if need be), or the next
  // level of one. It may run the security money into the red once half its price is saved; the next days' fifths pay it back.
  const beds = CLUBHOUSE[0];
  if (s.guards.length >= rosterCap(s) && s.guards.length < want && s.rank >= beds.rank && bot.sec >= beds.cost / 2) {
    let site = clubhouseSite(s);
    const lot = site ? undefined : PLOTS.filter((p) => plotType(s, p) === 'street' && !s.plots[p.id].owner && plotOnMap(s, p) && canBuyPlot(s, p.id).ok)
      .sort((a, b) => plotPrice(s, a.id) - plotPrice(s, b.id))[0];
    if (lot && plotPrice(s, lot.id) + beds.cost <= s.cash - reserve(s) && buyPlot(s, lot.id)) { site = lot.id; bot.log?.(`        land: ${lot.name} for a Clubhouse`); }
    if (site && canBuildClubhouse(s, site).ok) spend('Clubhouse', () => buildClubhouse(s, site));
  }
  const best = ownStands(s).sort((a, b) => standProfit(s, b.id, w) - standProfit(s, a.id, w));
  for (const p of best) { // a fence to match the stand: a Picket Fence round a Table, a Fortress Wall round a Palace
    const next = PERIMETERS[s.plots[p.id].defense.tier];
    if (next && next.tier <= s.plots[p.id].stand!.level && next.cost <= bot.sec && canBuyPerimeter(s, p.id).ok) spend(`${next.name} at ${p.name}`, () => buyPerimeter(s, p.id));
  }
  for (const p of best) fillPosts(s, p.id);
}

/** Rebuild what fell and book a repair for what's dented, as a player with the Repair button would. */
function fixUp(s: GameState): void {
  for (const p of PLOTS) {
    if (s.plots[p.id].owner !== 'player') continue;
    if (isWrecked(s.plots[p.id])) { if (canRebuild(s, p.id).ok) rebuildStand(s, p.id); } else if (repairCost(s, p.id) > 0) approveRepair(s, p.id);
  }
}

/** Take the contracts the bottling and the loading can make in time; a Supply Deal only when bottling covers it. */
function takeOrders(s: GameState, bot: Bot): void {
  for (const o of [...s.offers]) {
    const fits = o.tier === 'local' || (o.tier === 'deal' ? dealShortfallPerDay(s, o) <= 0 : yourDays(s, o) <= ORDER_TIERS[o.tier].days);
    if (fits && acceptOrder(s, o.id)) { bot.orders.set(o, o.loaded ?? 0); bot.log?.(`        order: ${o.tier} for ${o.client}, ${o.qty} for ${money(o.pay)}`); }
  }
}

/** From Rank 8, buy toward a Majority in every district still short of one: the cheapest land first. */
function dominationPush(s: GameState, bot: Bot, budget: number): number {
  for (const d of mapDistricts(s)) {
    const c = districtControl(s, d.id);
    let need = Math.ceil(c.total * MAJORITY) - c.mine;
    if (need <= 0) continue;
    const lots = PLOTS.filter((p) => p.district === d.id && p.type !== 'civic' && p.type !== 'hq' && plotOnMap(s, p) && s.plots[p.id].owner !== 'player')
      .map((p) => ({ p, price: !s.plots[p.id].owner ? (canBuyPlot(s, p.id).ok ? plotPrice(s, p.id) : Infinity) : canPlotBuyout(s, p.id).ok ? plotBuyoutPrice(s, p.id) : Infinity }))
      .filter((x) => x.price < Infinity).sort((a, b) => a.price - b.price);
    for (const { p, price } of lots) {
      if (need <= 0 || price > budget) break;
      const before = s.cash;
      if (!(s.plots[p.id].owner ? plotBuyout(s, p.id) : buyPlot(s, p.id))) continue;
      budget -= before - s.cash;
      need--;
      bot.log?.(`        majority: ${p.name} in ${d.name} ${money(before - s.cash)}`);
    }
  }
  return budget;
}

/** Morning Prep: prices, rivals (the Big Squeeze, Faction Buyouts), contracts, security, the VIP engine and growth. */
function morning(s: GameState, bot: Bot): void {
  fixUp(s);
  for (const p of ownStands(s)) { // before Marisol's Auto-Price (Rank 3) the player posts each price at the top by hand
    const st = s.plots[p.id].stand!;
    if (!pricingOn(s, st)) setPrice(st, priceCeiling(s, p.id));
  }
  if (canCallBigSqueeze(s).ok && callBigSqueeze(s)) bot.log?.('        the Big Squeeze is called');
  for (const id of rivalsInPlay(s)) {
    if (!s.rivals[id].alive) continue;
    const price = factionBuyoutPrice(s, id);
    // Juni and Preston haggle: open at the offer, hear the counter, and sign at their price (holding firm risks a walk-out).
    const signs = () => (!haggles(id) || haggling(s, id) || haggle(s, id, 'offer')) && factionBuyout(s, id);
    if (price !== null && canFactionBuyout(s, id).ok && price <= s.cash - reserve(s) && signs()) bot.log?.(`        Faction Buyout: ${id} for ${money(price)}`);
  }
  takeOrders(s, bot);
  bot.sec = Math.min(bot.sec, SECURITY_POT_DAYS * weekTakings(bot) + 200);
  security(s, bot);
  let budget = s.cash - reserve(s) - Math.max(0, bot.sec);
  // A sealed bid on every lot up (Fire Sales at 75%, a Smash's For Sale, the Lavender page) at the going rate, with up to
  // half the budget: it's paid at dawn only if it wins, so the cash stays aside until then.
  for (const lot of [...auctionPlots(s).map((p) => p.id), LAVENDER_LOT]) {
    const a = auctionOf(s, lot);
    if (!a || a.kind === 'listing' || a.bid) continue;
    const bid = Math.max(a.min, bidGuess(s, lot));
    if (bid <= budget / 2 && canBid(s, lot, bid).ok && placeBid(s, lot, bid)) { budget -= bid; bot.log?.(`        bid: ${money(bid)} on ${lot}`); }
  }
  const used = new Set<string>();
  // Saving up: the best buy within a couple of days' takings, if it doesn't fit today, bars anything slower to pay back
  // (a $400 Wooden Stand that pays back in 2 days beats $100 of signs that take 13).
  const daily = weekTakings(bot) || ownStands(s).reduce((a, p) => a + standProfit(s, p.id, typical()), 0); // Day 1: what the stands should make
  const reach = budget + SAVE_DAYS * daily;
  const buys = [...facilityCandidates(s, reach), ...growthCandidates(s, reach)].sort((a, b) => a.cost / a.gain - b.cost / b.gain);
  const goal = buys.find((b) => b.cost / b.gain <= MAX_PAYBACK);
  const bar = goal && goal.cost > budget ? goal.cost / goal.gain : MAX_PAYBACK;
  if (goal && bar < MAX_PAYBACK) bot.log?.(`        saving for: ${goal.what} ${money(goal.cost)}, pays back in ${bar.toFixed(1)} days`);
  let n = 0;
  for (const b of buys) {
    if (n >= MAX_BUYS || b.cost / b.gain > bar) break;
    if (b.cost > budget || (b.plot && used.has(b.plot))) continue;
    const before = s.cash;
    if (!b.run()) continue;
    n++;
    budget -= before - s.cash;
    if (b.plot) used.add(b.plot);
    if (b.upgrade && b.level) (bot.paybacks[b.level] ??= []).push(b.cost / b.gain); // an upgrade's own payback, as Appendix A counts it
    if (b.level && b.level in PLOT_TRAFFIC && b.plot) (bot.traffic[b.level] ??= []).push(PLOT_BY_ID[b.plot].baseTraffic); // the plot it went on
    bot.log?.(`        buy: ${b.what} ${money(before - s.cash)}, pays back in ${(b.cost / b.gain).toFixed(1)} days`);
  }
  if (s.rank >= DOMINATION_RANK) budget = dominationPush(s, bot, budget);
}

/** The Evening: fix up, set the security money aside, and send a squad out tonight: at a Weakened rival's HQ, or at the
 * rival stand it's likeliest to beat. */
function evening(s: GameState, bot: Bot): void {
  fixUp(s);
  const b = s.today.books ?? {};
  bot.sec += securityCut(s.day) * ((b.sales ?? 0) + (b.orders ?? 0)) + (b.wages ?? 0) + (b.repairs ?? 0) + (b.gear ?? 0); // rows: − out
  if (s.rank < RAID_RANK) return;
  const ready = s.guards.filter((g) => guardReady(s, g)).sort((x, y) => Number(!!x.post) - Number(!!y.post)); // the reserve first
  // A Weakened rival's HQ: an HQ Assault from the Raid Planner tonight, with a full squad, when its odds are good.
  const full = ready.slice(0, SQUAD_CAP(s.rank)).map((g) => g.id);
  for (const id of rivalsInPlay(s)) {
    const hq = hqPlot(id).id;
    if (full.length < SQUAD_CAP(s.rank) || !s.rivals[id].alive || !canRaid(s, hq, full, 'hq').ok) continue;
    const odds = hqOdds(s, id, full, true, ODDS_RUNS);
    if (odds >= RAID_ODDS && planRaid(s, hq, full, 'hq', 'tonight')) { bot.log?.(`        HQ Assault on ${id} tonight (${Math.round(odds * 100)}%)`); return; }
  }
  const squad = ready.slice(0, Math.min(SQUAD_CAP(s.rank), Math.ceil(ready.length / 2))).map((g) => g.id);
  if (squad.length < 2) return;
  const turf = new Set(playerStands(s).map((p) => p.district));
  const targets = PLOTS.filter((p) => {
    const ps = s.plots[p.id];
    return ps.owner && ps.owner !== 'player' && hasBuilding(ps) && turf.has(p.district) && canRaid(s, p.id, squad, 'smash').ok;
  }).sort((x, y) => (s.plots[y.id].stand?.level ?? 0) - (s.plots[x.id].stand?.level ?? 0)).slice(0, 4);
  const pick = targets.map((p) => ({ p, odds: raidOdds(s, p.id, squad, 'smash', true, ODDS_RUNS) })).sort((x, y) => y.odds - x.odds)[0];
  if (pick && pick.odds >= RAID_ODDS && planRaid(s, pick.p.id, squad, 'smash', 'tonight')) bot.log?.(`        raid: ${squad.length} on ${pick.p.name} (${Math.round(pick.odds * 100)}%)`);
}

/** A raid on you costs what it took, plus the rebuild of what it knocked down and the repair of a dent. */
function raidCost(s: GameState, b: BattleReport): number {
  const ps = s.plots[b.target];
  return b.loot + (b.outcome === 'smashed' && ps?.owner === 'player' ? rebuildCost(ps) : 0) + (b.hpLost && ps ? repairCost(s, b.target) : 0);
}

/** Play one run: Morning Prep, the day, the Evening, the night and dawn, day after day. */
export function playRun(opts: PacingOpts): RunResult {
  const days = opts.days ?? 170;
  const difficulty = opts.difficulty ?? 'classic';
  const s = newGame(opts.seed, { difficulty });
  const bot: Bot = { sec: 0, secSpent: 0, takings: [], paybacks: {}, traffic: {}, orders: new Map(), log: opts.log };
  const r: RunResult = { seed: opts.seed, difficulty, days: [], rankDay: { 1: 1 }, firstLoad: {}, raids: [], news: [], paybacks: bot.paybacks, traffic: bot.traffic };
  const seen = new WeakSet<BattleReport>(s.battles);
  const firsts = new Set<string>();
  const first = (key: string, what: string, day = s.day) => { if (!firsts.has(key)) { firsts.add(key); r.news.push({ day, what }); } };
  for (let d = 0; d < days && !gameOver(s); d++) {
    if (s.phase !== 'prep') { r.stuck = `Day ${s.day} began at ${s.phase}`; break; }
    const sec0 = bot.secSpent;
    morning(s, bot);
    if (!openStand(s)) { r.stuck = `Day ${s.day}: the stands would not open`; break; }
    simulateRestOfDay(s);
    evening(s, bot);
    const b = s.today.books ?? {};
    const income = (b.sales ?? 0) + (b.orders ?? 0);
    bot.takings = [...bot.takings, income].slice(-7);
    const stands = playerStands(s);
    const levels = stands.map((p) => s.plots[p.id].stand!.level);
    r.days.push({
      day: s.day, rank: s.rank, netWorth: netWorth(s), score: successScore(s), cash: s.cash, income, orders: b.orders ?? 0, vip: 0,
      security: -((b.wages ?? 0) + (b.repairs ?? 0) + (b.gear ?? 0)) + (bot.secSpent - sec0), stands: stands.length, levels, raidsOnYou: 0,
    });
    const top = Math.max(0, ...levels);
    if (top >= 2) r.firstL2 ??= s.day;
    for (let l = 2; l <= top; l++) first(`L${l}`, `first ${STAND_LEVELS[l - 1].name}`);
    for (let k = 2; k <= s.rank; k++) if (r.rankDay[k] === undefined) { r.rankDay[k] = s.day; first(`rank${k}`, `Rank ${k}, ${RANKS[k - 1].title}`); }
    if (s.outcome && !r.outcome) r.outcome = { result: s.outcome.result, how: s.outcome.how, day: s.outcome.day };
    if (s.outcome?.result === 'won' && keepSqueezing(s)) first('won', `won by ${s.outcome.how}`); // the victory card's Keep Squeezing: Rank 10 comes after
    const today = s.day, t = s.today;
    sleepUntilDawn(s);
    finishFight(s);
    const row = r.days[r.days.length - 1];
    // The night's raids on you, priced against the last week's takings.
    for (const rep of s.battles) {
      if (seen.has(rep)) continue;
      seen.add(rep);
      if (rep.defender !== 'player' || rep.attacker === 'player' || rep.hq) continue;
      row.raidsOnYou++;
      const cost = raidCost(s, rep);
      const daily = weekTakings(bot);
      r.raids.push({ day: today, cost, days: daily > 0 ? cost / daily : 0 });
    }
    // Loads that left your Pad or Pier (paid as they load), by tier: the VIP share and the firsts.
    for (const [o, was] of bot.orders) {
      const now = o.loaded ?? 0;
      if (now > was && isVip(o.tier)) {
        row.vip += ((now - was) / o.qty) * o.pay;
        if (r.firstLoad[o.tier] === undefined) { r.firstLoad[o.tier] = today; first(`load-${o.tier}`, `first ${o.tier} load`, today); }
      }
      if (s.orders.includes(o)) bot.orders.set(o, now); else bot.orders.delete(o);
    }
    for (const id of rivalsInPlay(s)) if (!s.rivals[id].alive) first(`out-${id}`, `${id} out`);
    for (const p of PLOTS) {
      const f = s.plots[p.id].facility;
      if (f && s.plots[p.id].owner === 'player') first(`${f.kind}${f.level}`, `first ${FACILITIES[f.kind].names[f.level - 1]}`);
    }
    if (s.brandTier) first(`brand${s.brandTier}`, BRAND_TIERS[s.brandTier - 1].name);
    if (s.outcome && !r.outcome) r.outcome = { result: s.outcome.result, how: s.outcome.how, day: s.outcome.day }; // won at dawn
    const w = t.walkedPast;
    opts.log?.(`day ${String(row.day).padStart(3)}  R${row.rank}  NW ${money(row.netWorth)}  takings ${money(income)}  ${t.weather.kind} ${t.customers} cups`
      + ` (walked: out ${w.soldOut}, line ${w.line}, pricey ${w.pricey}, rival ${w.rival})  stands ${stands.length} (top L${top})  guards ${s.guards.length}  cash ${money(s.cash)}`);
    s.news.length = 0;
  }
  return r;
}

// ---------- the report ----------

export interface Check { name: string; target: string; got: string; ok: boolean | null } // ok null: shown, not judged

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const span = (r: RunResult, from: number, to: number) => r.days.filter((d) => d.day >= from && d.day <= to);
const dayText = (n: number | undefined) => (n === undefined ? 'never' : `Day ${n}`);
const label = (d: Difficulty) => (d === 'laidback' ? 'Laid Back' : d === 'cutthroat' ? 'Cutthroat' : d === 'classic' ? 'Classic' : d);
const diffOf = (d: Difficulty): 'classic' | 'laidback' | 'cutthroat' => (d === 'laidback' || d === 'cutthroat' ? d : 'classic');

/** A milestone day held to its target: on the reference map within 15% of it (and inside its window, if it has one), on
 * the other maps inside the range the spec's ten maps gave. */
export function hits(got: number | undefined, t: Target, reference: boolean): boolean {
  if (got === undefined) return false;
  if (t.notBefore !== undefined && got < t.notBefore && reference) return false;
  if (!reference) return got >= t.lo && got <= t.hi;
  return Math.abs(got - t.target) <= t.target * 0.15 && (!t.window || (got >= t.window[0] && got <= t.window[1]));
}
const targetText = (t: Target) => `Day ${t.window ? `${t.window[0]}-${t.window[1]}` : t.target} (maps ${t.lo}-${t.hi})`;

/** The milestone targets for a difficulty: the first L2 (Classic), Ranks 2-10 and Domination. */
export function milestones(d: Difficulty): { name: string; t: Target; got: (r: RunResult) => number | undefined }[] {
  const diff = diffOf(d);
  const out: { name: string; t: Target; got: (r: RunResult) => number | undefined }[] = [];
  if (diff === 'classic') out.push({ name: 'first L2 stand', t: CLASSIC_FIRST_L2, got: (r) => r.firstL2 });
  for (let k = 2; k <= 10; k++) {
    const day = diff === 'classic' ? undefined : RANK_DAYS[diff][k - 2];
    const t = day === undefined ? CLASSIC_RANK_DAYS[k] : { target: day, lo: Math.round(day * 0.85), hi: Math.round(day * 1.15) };
    out.push({ name: `Rank ${k}`, t, got: (r) => r.rankDay[k] });
  }
  out.push({ name: 'Domination', t: DOMINATION[diff], got: (r) => (r.outcome?.how === 'domination' ? r.outcome.day : undefined) });
  return out;
}

/** One run read against the spec. `reference`: the reference map, held to each milestone's target. */
export function checkRun(r: RunResult, reference = true): Check[] {
  const out: Check[] = [];
  const last = r.days[r.days.length - 1]?.day ?? 0;
  // A milestone the run stopped short of is shown, not judged.
  const judge = (got: number | undefined, t: Target, ref: boolean) => (got === undefined && last < (t.window?.[1] ?? t.hi) ? null : hits(got, t, ref));
  const shown = (got: number | undefined, t: Target) => (got === undefined && last < (t.window?.[1] ?? t.hi) ? `not by Day ${last}` : dayText(got));
  for (const m of milestones(r.difficulty)) {
    const got = m.got(r);
    const note = m.name === 'Domination' && got === undefined && r.outcome ? ` (${r.outcome.result} by ${r.outcome.how}, Day ${r.outcome.day})` : '';
    out.push({ name: m.name, target: targetText(m.t), got: shown(got, m.t) + note, ok: judge(got, m.t, reference) });
  }
  if (diffOf(r.difficulty) === 'cutthroat') { // on every map, the reference map's included
    const won = r.outcome?.how === 'domination' ? r.outcome.day : undefined;
    const open = won === undefined && last < DOMINATION_BY;
    out.push({ name: `Domination before Day ${DOMINATION_BY}`, target: 'every map', got: open ? `not by Day ${last}` : dayText(won), ok: open ? null : won !== undefined && won < DOMINATION_BY });
  }
  for (const st of INCOME_STAGES) {
    const w = span(r, st.from, st.to);
    if (!w.length) continue;
    const got = avg(w.map((d) => d.income));
    const end = w[w.length - 1];
    out.push({
      name: `takings Days ${st.from}-${st.to}`, target: `~${money(st.income)}/day, ${st.stands}`,
      got: `${money(got)}/day, ${end.stands} stands (${levelMix(end.levels)})`, ok: got >= st.income * ABOUT_INCOME[0] && got <= st.income * ABOUT_INCOME[1],
    });
  }
  for (const sh of SECURITY_SHARE) {
    const w = span(r, sh.from, sh.to);
    const income = w.reduce((a, d) => a + d.income, 0);
    if (!w.length || income <= 0) continue;
    const share = w.reduce((a, d) => a + d.security, 0) / income;
    out.push({ name: `security Days ${sh.from}-${sh.to}`, target: `${sh.says} of takings`, got: `${Math.round(share * 100)}%`, ok: share >= sh.lo && share <= sh.hi });
  }
  const late = r.raids.filter((x) => x.day > 6);
  if (late.length && diffOf(r.difficulty) === 'classic') {
    const worst = late.reduce((a, x) => (x.days > a.days ? x : a));
    out.push({ name: 'worst raid after Day 6', target: `~0.33 days of takings, <= ${RAID_LOSS.worst}`, got: `${worst.days.toFixed(2)} days (${money(worst.cost)}, Day ${worst.day})`, ok: worst.days <= RAID_LOSS.worst });
    const mean = avg(late.map((x) => x.days));
    out.push({ name: 'average raid after Day 6', target: `~${RAID_LOSS.average} days of takings`, got: `${mean.toFixed(2)} days over ${late.length} raids`, ok: mean <= RAID_LOSS.average * 1.5 });
  }
  for (const tier of ['heli', 'ship', 'deal'] as const) {
    const t = VIP_FIRSTS[tier];
    const name = tier === 'heli' ? 'first chopper loaded' : tier === 'ship' ? 'first ship loaded' : 'first Supply Deal load';
    out.push({ name, target: `Day ${t.target} (${t.lo}-${t.hi})`, got: shown(r.firstLoad[tier], t), ok: judge(r.firstLoad[tier], t, false) });
  }
  for (const v of VIP_SHARE) {
    const w = span(r, v.from, v.to);
    const income = w.reduce((a, d) => a + d.income, 0);
    if (!w.length || income <= 0) continue;
    const share = w.reduce((a, d) => a + d.vip, 0) / income;
    out.push({ name: `VIP share Days ${v.from}-${v.to}`, target: `~${Math.round(v.share * 100)}% of takings`, got: `${Math.round(share * 100)}%`, ok: Math.abs(share - v.share) <= ABOUT_SHARE });
  }
  const lull = longestLull(r);
  out.push({ name: 'longest lull', target: `<= ${MAX_LULL} days (maps 5-10)`, got: `${lull.days} days from Day ${lull.from}`, ok: reference ? lull.days <= MAX_LULL : lull.days <= 10 });
  if (r.rankDay[8] && r.rankDay[9]) { // held to 15% on the reference map, shown on the others (their rank days spread wider)
    const gap = r.rankDay[9] - r.rankDay[8], want = RANK_8_TO_9[diffOf(r.difficulty)];
    out.push({ name: 'Rank 8 to Rank 9', target: `${want} days`, got: `${gap} days`, ok: reference ? Math.abs(gap - want) <= want * ABOUT_GAP : null });
  }
  const nw = (day: number) => r.days.find((d) => d.day === day)?.netWorth;
  for (const g of GROWTH) {
    const a = nw(g.from), b = nw(g.to);
    if (!a || !b) continue;
    out.push({ name: `Net Worth Day ${g.from} to ${g.to}`, target: `~${g.x}x`, got: `${(b / a).toFixed(1)}x`, ok: Math.abs(b / a / g.x - 1) <= ABOUT_GROWTH });
  }
  const r9 = RANKS[8].ss / RANKS[7].ss;
  out.push({ name: 'Rank 9 bar over Rank 8', target: '~6x', got: `${r9.toFixed(2)}x`, ok: Math.abs(r9 / 6 - 1) <= 0.1 });
  for (const [level, [lo, hi]] of Object.entries(PAYBACKS)) {
    const pb = r.paybacks[Number(level)];
    if (!pb?.length) continue;
    const mid = median(pb);
    out.push({ name: `L${level} payback`, target: `${lo}-${hi} days`, got: `median ${mid.toFixed(1)} days of ${pb.length} built`, ok: mid >= lo && mid <= hi });
  }
  for (const [level, want] of Object.entries(PLOT_TRAFFIC)) {
    const seen = r.traffic?.[Number(level)];
    if (!seen?.length) continue;
    const mid = median(seen);
    out.push({ name: `L${level} plots`, target: `~${want.toLocaleString('en-US')}+ passersby a day`, got: `median ${Math.round(mid).toLocaleString('en-US')} of ${seen.length} built`, ok: mid >= want * ABOUT_TRAFFIC });
  }
  if (r.stuck) out.push({ name: 'run', target: 'plays every day', got: r.stuck, ok: false });
  return out;
}
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const levelMix = (levels: number[]) => STAND_LEVELS.map((l) => [l, levels.filter((x) => x === l.level).length] as const)
  .filter(([, n]) => n).map(([l, n]) => `${n} L${l.level}`).join(', ') || 'none';

/** The longest stretch with nothing new: a rank, a stand level, a facility, a VIP first, a marketing tier, a rival out. */
export function longestLull(r: RunResult): { days: number; from: number } {
  const end = Math.min(r.outcome?.how === 'domination' ? r.outcome.day : Infinity, r.days[r.days.length - 1]?.day ?? 1);
  const marks = [...new Set([1, ...r.news.map((n) => n.day).filter((d) => d <= end), end])].sort((a, b) => a - b);
  let best = { days: 0, from: 1 };
  for (let i = 1; i < marks.length; i++) if (marks[i] - marks[i - 1] > best.days) best = { days: marks[i] - marks[i - 1], from: marks[i - 1] };
  return best;
}

/** The run's Net Worth beside the pacing chart's (docs/spec/pacing.csv), every `step` days, and on Classic its rank
 * beside the chart's classic_rank (the chart has no rank column for the other difficulties). */
export function chartChecks(r: RunResult, csv: string, step = 10): Check[] {
  const col = r.difficulty === 'laidback' ? 'laid_back_net_worth' : r.difficulty === 'cutthroat' ? 'cutthroat_net_worth' : 'classic_net_worth';
  const [head, ...rows] = csv.trim().split(/\r?\n/).map((l) => l.split(','));
  const at = head.indexOf(col), dayAt = head.indexOf('day');
  const rankAt = diffOf(r.difficulty) === 'classic' ? head.indexOf('classic_rank') : -1;
  const out: Check[] = [];
  for (const row of rows) {
    const day = Number(row[dayAt]);
    const run = r.days.find((d) => d.day === day);
    if ((day % step && day !== 1) || !run) continue;
    const target = Number(row[at]), got = run.netWorth;
    out.push({ name: `Net Worth Day ${day}`, target: money(target), got: `${money(got)} (${(got / target).toFixed(2)}x)`, ok: got >= target * ABOUT_CHART[0] && got <= target * ABOUT_CHART[1] });
    if (rankAt < 0) continue;
    const rank = Number(row[rankAt]);
    out.push({ name: `Rank Day ${day}`, target: `Rank ${rank}`, got: `Rank ${run.rank}`, ok: Math.abs(run.rank - rank) <= ABOUT_RANK });
  }
  return out;
}

/** Several maps on one difficulty: each milestone's spread against the spec's ten-map range, and the worst raid. */
export function spreadChecks(runs: RunResult[]): Check[] {
  const out: Check[] = [];
  for (const m of milestones(runs[0].difficulty)) {
    const days = runs.map(m.got);
    const seen = days.filter((x): x is number => x !== undefined).sort((a, b) => a - b);
    const got = seen.length ? `${seen[0]}-${seen[seen.length - 1]}, median ${median(seen)}${seen.length < runs.length ? `, missed on ${runs.length - seen.length}` : ''}` : 'never';
    out.push({ name: m.name, target: `maps ${m.t.lo}-${m.t.hi}`, got, ok: days.every((x) => hits(x, m.t, false)) });
  }
  const worst = Math.max(0, ...runs.flatMap((r) => r.raids.filter((x) => x.day > 6).map((x) => x.days)));
  if (diffOf(runs[0].difficulty) === 'classic') out.push({ name: 'worst raid after Day 6', target: `<= ${RAID_LOSS.worst} days on every map`, got: `${worst.toFixed(2)} days`, ok: worst <= RAID_LOSS.worst });
  const lulls = runs.map((r) => longestLull(r).days);
  out.push({ name: 'longest lull', target: '5-10 days', got: `${Math.min(...lulls)}-${Math.max(...lulls)} days`, ok: Math.max(...lulls) <= 10 });
  if (diffOf(runs[0].difficulty) === 'cutthroat') {
    const by = runs.map((r) => checkRun(r, false).find((c) => c.name.startsWith('Domination before'))!);
    const won = by.filter((c) => c.ok).length, open = by.some((c) => c.ok === null);
    out.push({ name: `Domination before Day ${DOMINATION_BY}`, target: 'every map', got: `${won} of ${runs.length} maps`, ok: open ? null : won === runs.length });
  }
  return out;
}

/** Cutthroat's raids on you against Classic's on the same maps: 1.3-1.7 times as many. */
export function raidRatio(classic: RunResult[], cutthroat: RunResult[]): Check {
  const n = (rs: RunResult[]) => rs.reduce((a, r) => a + r.days.reduce((b, d) => b + d.raidsOnYou, 0), 0);
  const ratio = n(classic) ? n(cutthroat) / n(classic) : 0;
  return { name: 'Cutthroat raids over Classic', target: '1.3-1.7x', got: `${ratio.toFixed(2)}x (${n(cutthroat)} against ${n(classic)})`, ok: ratio >= 1.3 && ratio <= 1.7 };
}

export function formatChecks(title: string, checks: Check[]): string {
  const ok = checks.filter((c) => c.ok === true).length, missed = checks.filter((c) => c.ok === false).length;
  const rows = checks.map((c) => `  ${c.ok === null ? '    ' : c.ok ? 'PASS' : 'MISS'}  ${c.name.padEnd(28)} ${c.target.padEnd(40)} ${c.got}`);
  return `${title}: ${ok} pass, ${missed} miss\n${rows.join('\n')}`;
}

/** The whole report: `args` are [days] [maps] [classic|laidback|cutthroat|all] and -v for every day and every purchase.
 * Each difficulty plays the reference map first, then the maps after it; `csv` is docs/spec/pacing.csv. */
export function pacingReport(args: string[], csv: string, print: (line: string) => void): void {
  const verbose = args.includes('-v');
  const [daysArg, mapsArg, diffArg] = args.filter((a) => a !== '-v');
  const days = Number(daysArg) > 0 ? Number(daysArg) : 170;
  const maps = Number(mapsArg) > 0 ? Math.floor(Number(mapsArg)) : 1;
  const diffs: Difficulty[] = diffArg === 'all' ? ['laidback', 'classic', 'cutthroat'] : [(diffArg as Difficulty) ?? 'classic'];
  const all: Partial<Record<Difficulty, RunResult[]>> = {};
  for (const difficulty of diffs) {
    const runs: RunResult[] = (all[difficulty] = []);
    for (let i = 0; i < maps; i++) {
      const seed = REFERENCE_SEED + i;
      const r = playRun({ seed, difficulty, days, log: verbose ? print : undefined });
      runs.push(r);
      print(formatChecks(`\n${label(difficulty)}, map ${seed}${i === 0 ? ' (the reference map)' : ''}, ${r.days.length} days`, checkRun(r, i === 0)));
      if (i === 0) print(formatChecks(`\n${label(difficulty)} Net Worth against docs/spec/pacing.csv`, chartChecks(r, csv)));
      print(`  firsts: ${r.news.map((n) => `${n.day} ${n.what}`).join('; ')}`);
    }
    if (maps > 1) print(formatChecks(`\n${label(difficulty)} across ${maps} maps`, spreadChecks(runs)));
  }
  if (all.classic && all.cutthroat) print(formatChecks('\nCutthroat against Classic', [raidRatio(all.classic, all.cutthroat)]));
}
