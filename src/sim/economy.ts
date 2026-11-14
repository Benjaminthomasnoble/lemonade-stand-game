// Deterministic, tick-based economy (spec section 25: 1 tick = 1 game
// minute, all randomness from a per-run seed). Pure data + functions:
// no DOM or three.js, so it runs the same in the browser, Vitest and Node.
// Covers every stand on the Citrine Bay map: the player's and the rivals'.
import { callsOnTheClock, type CallsState } from './calls.ts';
import { nextRandom, randomRange } from './rng.ts';
import {
  BRAND_TIERS, BUILDING_VALUE_SHARE, CAMPAIGNS, CLOSE, CUP_COST, CUPS_PER_PITCHER,
  DAWN, FACTIONS, HOURLY_TRAFFIC, LAND_DEVELOPMENT_MAX, MARKET_SWING, NIGHT_END, OPEN,
  RANKS, RECIPES, repMultiplier, SEASON_DAYS,
  SEASONS, STAND_LEVELS, STAND_RANK_GATE, START, SUPPLIES, WEATHER,
  type CampaignId, type LocalCampaignId, type RecipeId, type RivalId, type Season, type SegmentId, type StandLevel, type SupplyId, type Sweetness,
  type WeatherKind,
} from './balance.ts';
import { cardFit, migrateWorld, seasonDemand, type WorldState } from './recipes.ts';
import { festivalCrowd, worldAtClose, worldAtDawn } from './calendar.ts';
import { eventsOnTheClock, eventTraffic, eventWeather } from './events.ts';
import { forecastAtDawn, seasonWeather, weatherAtOpen, type DayWeather } from './weather.ts';
import { iceMachineOn, kidStandSale, machineIce } from './happenings.ts';
import { bottleValue, pickupsAt, pickupsAtClose, vipAtDawn, type Facility, type Order, type OrderTier } from './vip.ts';
import { familySilver, FIRE_SALE, FIZZCO_PLANT, handOverKept, rivalsBankrupt, seedRivalFacilities, trackOutselling } from './rivals.ts';
import { migrateRivals, openBooks, outOfTownerState, rivalDawn, stockCups, tookCustomer, type Budget, type TradeBooks } from './rivalAi.ts';
import { bookNightShift, historicHedges, landFrozen, outOfTownerAtDawn, priceWarCut, provideMysteryGoal, schemesAtDawn, type Scheme } from './schemes.ts';
import { crewAtDawn, isSpoiled, isWrecked, migrateCrew, NO_DEFENSE, planNight, resolveNight, seedRivalDefenses, type BattleReport, type Guard, type Raid } from './crew.ts';
import type { GadgetId, SpecId } from './balance.ts';
import type { Scouted } from './scouting.ts';
import { LOTTIES_CORNER, mapDistricts, nearbyPlots, onMap, PLOT_BY_ID, plotOnMap, plotType, PLOTS, type DistrictId, type FactionId, type Plot } from './map.ts';
import { checkVictory, defaultSettings, fortunesAtDawn, gameOver, type Loan, type Outcome, type Settings, type Tally } from './modes.ts';
import { COMBAT_RULES, migrateCombat } from './combat.ts';
import { damageAtClose, damageAtDawn, inspectorClosed, migrateDamage, restoreHp, stormAtOpen, type Inspection, type Repair } from './damage.ts'; // hpCapacity: demand's pourRate
import { migrateNights, nightsAtDawn, nightStep, onTheClock, runNight } from './night.ts';
import { stationByPriority } from './autodefend.ts';
import { migrateLegacy } from './legacy.ts';
import { isMajor, type Alert } from './alerts.ts';
import {
  adsBlocked, campaignCost, ceilingFor, chooseOn, curbAppeal, dailyService, dayMixOn, drainQueue, drawSegment, expectedDemand, joinsLine, lunchRush,
  marketingMultiplier, migrateDemand, pourRate, priceCeiling, reputationAtClose, rivalStars, serviceLeft, stopOdds, streetAt, touristPays, type Street,
} from './demand.ts';
import { campaignDay, districtBlocker, isDistrictCampaign, planCampaign, salePrice, standCampaignBusy, standingBillboard, standPriceFit, startBookings, type MarketingState } from './marketing.ts';
import { actAtDawn, migrateStory, storyAtClose, storyAtDawn, storyAtStart, storyMinute, type StoryState } from './story.ts';
import { goalsNow, type GoalSlot, type GoalState } from './goals.ts';
import { automationAtDawn, holdPrices, repostPrice, restockAtOpen, type HelperDay } from './automation.ts';
import { book, logScore, sellCup, useStock, type LedgerRow } from './ledger.ts';
import { scoreCheck, scoreMinute } from './score.ts';
import { campaignDays, goodDirt, lemonDays } from './perks.ts';
import type { SceneState } from './scenes.ts';
import type { PhoneState } from './phone.ts';
import type { LiveFight } from './fight.ts';
import type { Captive } from './captives.ts';
import { closeTills } from './loot.ts';
import {
  announceControl, development, inPlay, isPurchasable, landAtDawn, majorityDiscount, migrateLand, reachBlocker, settleMap, type ControlTier, type PerkId,
} from './land.ts';
import type { Auction, Lavender } from './auction.ts';
import type { DistrictPolicy } from './policies.ts';
import { warehouseRuns, warehouseValue, type WarehouseStock } from './warehouse.ts';
import type { SyndicateState } from './syndicate.ts';
import type { SqueezeState } from './squeeze.ts';

export * from './balance.ts';
export * from './map.ts';
export * from './crew.ts';
export * from './vip.ts';
export * from './rivals.ts';
export * from './modes.ts';
export * from './night.ts';
export * from './threat.ts';
export * from './syndicate.ts';
export * from './squeeze.ts';
export * from './damage.ts';
export * from './alerts.ts';
export * from './recipes.ts';
export * from './calendar.ts';
export * from './rivalAi.ts';
export * from './schemes.ts';
export * from './demand.ts';
export * from './events.ts';
export * from './media.ts';
export * from './happenings.ts';
export * from './radio.ts';
export * from './land.ts';
export * from './auction.ts';
export * from './automation.ts';
export * from './ledger.ts';
export * from './marketing.ts';
export * from './specializations.ts';
export * from './weather.ts';
export * from './policies.ts';
export * from './warehouse.ts';
export type { BattleEvent, Fighter, Objective } from './combat.ts';

export const SAVE_VERSION = 8;

export interface Weather { kind: WeatherKind; temp: number }
/** Morning Prep, business hours, the Evening (the day's Ledger, a moment at 20:00) and the night (20:00–07:00). */
export type Phase = 'prep' | 'open' | 'report' | 'night';
export type WalkReason = 'notThirsty' | 'pricey' | 'line' | 'soldOut' | 'rival';

export interface LemonBatch { qty: number; day: number; unitCost: number }
export interface Inventory { lemons: LemonBatch[]; sugar: number; ice: number; sugarCost: number; iceCost: number }

export interface StandDay {
  passersby: number;
  customers: number;
  walkedPast: Record<WalkReason, number>;
  revenue: number;
  cupCosts: number;
  satisfaction: number;
}

export interface Stand {
  level: number;
  inventory: Inventory; // rivals: unused (they buy as they pour)
  recipe: RecipeId;
  sweetness: Sweetness;
  price: number;
  pitcherCups: number;
  /** People in line right now; it moves at the stand's pour rate (demand.ts). Optional for older saves. */
  queue?: number;
  campaigns: Partial<Record<CampaignId, number>>; // days left
  autoRestock: boolean; // Auto-Restock's switch: on unless this stand opts out, at work from the Market's lesson (automation.ts)
  /** Auto-Restock's stock target in cups: null is the suggestion (the forecast day's expected sales). Missing on older saves. */
  stockTarget?: number | null;
  autoPrice?: boolean; // Marisol's Auto-Price switch (Rank 3): off once you price this stand by hand (automation.ts)
  ownCard?: boolean; // you picked this stand's card or Sweetness by hand: Auto-Price keeps them and still prices the stand
  day: StandDay;
  hp?: number; // HP left on a standing stand a raid or a Storm dented (damage.ts). Missing means full; it is cleared when the stand falls, so read HP through currentHp or hpShare, which give 0 for a Wrecked or Busted stand
  wrecked?: boolean; // smashed in a raid: closed until rebuilt
  startTable?: true; // Lottie's own Folding Table, the run's first stand: its L1 counts as START.tableInvested ($100) in rebuilds and repairs (damage.ts)
  lastProfit?: number; // its last full business day's profit: what a Shakedown takes (loot.ts)
  spoiledDay?: number; // a Sabotage spoiled the stock: no sales this day
  specs?: (SpecId | null)[]; // what each specialization slot holds, slot 1 first (specializations.ts); missing means empty
}

export interface PlotState {
  owner: FactionId | null;
  stand: Stand | null;
  invested: number; // building money sunk into this plot
  landValue: number;
  defense: Defense;
  garrison?: number; // rival henchmen on guard here
  garrisonOut?: { n: number; back: number }[]; // of the garrison, n are knocked out and back on day `back` (garrison.ts)
  facility?: Facility; // Bottling Works, Helipad or Pier
  repair?: Repair; // a Damaged building's repair: paid on approval, done by dawn (damage.ts)
  noAutoRepair?: boolean; // Auto-Repair (Rank 3) skips this plot of yours (damage.ts)
  inspected?: Inspection; // land: the health inspector's visit to your stand here, and what failed it (closed until dawn: damage.ts)
  noPolicy?: boolean; // land: this plot of yours opts out of its district's policy (policies.ts)
  dibs?: { who: FactionId; until: number; price?: number; table?: boolean }; // First Dibs after a smash or a Fire Sale: only they can buy until this day
  kept?: KeptBuilding; // rivals: a bought-out rival's building, waiting on its Fire Sale plot for whoever buys it (rivals.ts eliminate)
  wreckedDay?: number; // day the stand or facility here was smashed
  smashedBy?: FactionId;
  smashes?: number[]; // days this plot was smashed (rebuild chance drops for each in the last 7 days)
  busted?: boolean; // Laid Back: the player's building is closed until a repair, never lost
  auction?: Auction; // a 24-hour sealed-bid auction is open on this plot
  defendPriority?: number; // Dex's Auto-Defend: posts here filled first each Evening, higher first (autodefend.ts)
}

export interface Defense {
  tier: number;
  fenceHp: number;
  gadgets: GadgetId[];
  slickSprung?: boolean; // the Lemon-Peel Slick went off and waits for its nightly reset
  repairs?: number; // raids since the fence was last repaired: each costs the tier's flat repair overnight
}
/** A bought-out rival's building on a Fire Sale plot (rivals.ts eliminate): it comes with the plot to whoever buys it. */
export interface KeptBuilding { stand: Stand | null; facility?: Facility; invested: number; defense: Defense }

export interface RivalState {
  cash: number;
  brandTier: number;
  grudge: number; // toward the player, 0..100
  attention: number;
  peakPlots: number;
  alive: boolean;
  respectUntil: number; // won't raid the player before this day
  reputation?: number; // its own stars, 1..5, drifting by your rules each night (demand.ts: rivalStars; 3.0 until then)
  truceUntil?: number; // Sit-down truce: no raids either way through this day
  brokeDays?: number; // days in a row in the red (7 = bankrupt)
  outsoldDays?: number; // days in a row the player sold 2x what they did (7 = Weakened)
  salesToday?: number;
  // Rival AI (rivalAi.ts): the dawn budget.
  budget?: Budget; // Grow / Guard / Strike money, filled from takings at dawn; unspent buckets roll over
  cashSeen?: number; // cash after the last dawn's banking, less bucket spending since
  takings?: number; // what the last dawn banked
  upgradesDue?: string[]; // plots owed a stand level (every 30 days), waiting for Grow money
  trade?: TradeBooks; // how much of its stands' margin a rival keeps (about 1% of its cash a day)
  grudges?: Partial<Record<RivalId, number>>; // toward the other rivals, 0..100 (grudge holds the one toward the player)
  grudgeSeen?: Partial<Record<FactionId, number>>; // grudges after the last dawn: no rise since means a quiet day
  taken?: { day: number; n: number }; // passers-by at its stands who bought from you instead, that day (Attention)
  held?: string[]; // plots held at the last dawn
  lost?: string[]; // plots taken from them that went For Sale: whoever buys one takes their land
  rush?: number; // the swarms (the Blenders, the Out-of-Towner): the night of their last Rush on you (Brock phones first)
  haggle?: { day: number; out?: boolean }; // Juni and Preston: their buyout counter-offer stands this day; out: they walked out
  hedges?: number; // Vera: the day Town Hall froze your first Hilltop deal (Act 5's Historic hedges)
  mystery?: { from: number; caught?: number }; // Cold Brew, Act 3's mystery: the dawn its Night Shift first spoiled your stock, and the dawn your watch caught it
  // Endless Summer's Out-of-Towner (schemes.ts outOfTownerAtDawn): out of town (alive false) until its first date.
  arrived?: number; // the dawn it last came to town
  due?: number; // the dawn of its next date: back in town, or more money and plots
  since?: number; // a run started as Endless: the dawn the last of the Bay's five was out, which starts its clock
}

export interface DayStats {
  day: number;
  weather: Weather;
  passersby: number;
  customers: number;
  walkedPast: Record<WalkReason, number>;
  revenue: number; // cups sold at your stands
  supplies: number; // stock bought today (the Ledger's Supplies is what the day used: ledger.ts)
  cupCosts: number;
  upkeep: number; // stand upkeep
  land: number; // land, buildings and defenses bought today (the Ledger's Invested)
  /** Every cash movement of the day, by Ledger row (ledger.ts): + in, − out. Missing on days from older saves. */
  books?: Partial<Record<LedgerRow, number>>;
  counts?: Partial<Record<LedgerRow, number>>; // what a row was for: stands charged upkeep, guards paid, cups poured for orders, free samples
  stockUsed?: number; // stock poured, given away, melted or spoiled, at its value
  waste?: number; // the part that melted or spoiled
  stockOn?: Partial<Record<LedgerRow, number>>; // the part that's a cost on another row than Supplies (a Free Sample Day's lemonade: Marketing)
  upkeepLevels?: number[]; // the stands charged upkeep, by level (index 0 is L1)
  cashAtDawn?: number; // cash when the day's books opened: the next day's, less this, is the day's rows
  repTarget?: number; // where Reputation drifted toward that night (demand.ts)
  iceMelted: number;
  lemonsSpoiled: number;
  satisfaction: number; // average 0..1 over customers
  reputationBefore: number;
  reputationAfter: number;
  scoreBefore: number;
  auto?: Partial<Record<string, HelperDay>>; // each helper's day: what it spent and looked after (automation.ts)
}

export interface GameState {
  version: number;
  seed: number;
  day: number;
  minute: number; // minute of the day, 0..1439 (at night it counts on past midnight to 1,860, 07:00)
  phase: Phase;
  cash: number;
  reputation: number; // stars 1..5
  rank: number; // highest rank reached (ranks never drop)
  brandTier: number;
  market: Record<SupplyId, number>; // today's unit prices
  forecast: Weather;
  weather: Weather;
  plots: Record<string, PlotState>;
  rivals: Record<RivalId, RivalState>;
  spawnCarry: Record<string, number>;
  selected: string; // the player stand being managed
  today: DayStats;
  history: DayStats[];
  peakScore: number;
  lifetimeCups: number;
  news: string[]; // fresh headlines for the UI (rank-ups, upgrades, rival moves)
  guards: Guard[];
  recruits: Guard[];
  recruitDay?: number; // the Hiring Hall last refreshed its recruits (crew)
  scouting?: Record<string, Scouted>; // rival plots a Lookout or Gull Flight has scouted, fresh for 3 days (crew)
  citations?: import('./citations.ts').CitationState; // Sheriff Budd's Citations: the raid ban, Election Day's rules (crew)
  raidTemplates?: import('./templates.ts').TemplateState; // raid templates (Rank 6): saved squads and objectives, and their switch (crew)
  pierFlight?: number; // the day Captain Squawk flew Act 2's one required Gull Flight, over the Pier (crew, src/sim/scouting.ts)
  clubhouse?: number; // old saves: one Clubhouse level for the whole crew (clubhouse.ts moves it onto a Street plot)
  nextId: number;
  raids: Raid[]; // planned for tonight (theirs and yours)
  battles: BattleReport[]; // most recent first
  respectFromPlayer: Partial<Record<RivalId, number>>;
  bottles: number;
  bottleStock?: Partial<Record<RecipeId, number>>; // world: the bottles of each recipe but Classic, which has the rest (vip.ts)
  lastOffer?: Partial<Record<OrderTier, number>>; // day each VIP tier last made an offer
  seenClients?: string[]; // VIP clients who've visited before (no cutscene pause after the first)
  noTruceUntil?: number; // after breaking a truce, no rival accepts one through this day
  negotiator?: string; // rivals: the guard you bring to Sit-downs at Dot's Diner (a Smooth Talker gets better terms)
  offers: Order[];
  orders: Order[];
  settings: Settings; // mode and difficulty, chosen at New Game
  runId?: string; // leaderboard entry for this run
  peakDay?: number; // day the Peak Success Score was set
  redDays?: number; // dawns in a row with cash below $0
  cookieJar?: string[]; // acts (or seasons) Lottie's Cookie Jar has already paid out in
  loan?: Loan;
  tally?: Tally;
  outcome?: Outcome; // the run was won or lost
  endlessSince?: number; // kept squeezing after a win (Endless Summer) from this day
  combatRules?: number; // the fight rules this save's numbers follow (combat.ts migrateCombat)
  alerts?: Alert[]; // the alert feed's cards (alerts.ts)
  alertSeq?: number;
  heldPickups?: string[]; // VIP orders still loading while a Delivery Raid is out for them (night.ts)
  world?: WorldState; // Lottie's recipe book, the calendar's Taste-Offs, boosts and sponsorships
  schemes?: Scheme[]; // rivals' Strike schemes running or just done (schemes.ts)
  helpersMet?: string[]; // automation helpers that have introduced themselves (automation.ts)
  scores?: (number | null)[]; // the Success Score at each day's close, Day 1 first (ledger.ts; null: not known)
  story?: StoryState; // the campaign's act (src/sim/story.ts)
  scenes?: SceneState; // story scenes queued, playing and seen
  phone?: PhoneState; // boss calls waiting, and the moods they watch
  goals?: GoalState; // what Lottie's goal card shows and has ticked off
  fight?: LiveFight; // the fight playing live right now (fight.ts)
  control?: Partial<Record<DistrictId, ControlTier>>; // each district's control tier at the last check (for the headlines)
  perksLost?: PerkId[]; // Full Control perks that switched off and aren't back yet
  everyLastPlotEarned?: { day: number; bugled?: true }; // land: the day Every Last Plot was earned (bugled: the Bugle has led with it)
  lavender?: Lavender; // the Lavender page auction (Rank 8) and who won it
  policies?: Partial<Record<DistrictId, DistrictPolicy>>; // land: each district's policy, from Rank 7 (policies.ts)
  warehouses?: Record<string, WarehouseStock>; // land: each Warehouse's sugar store, by plot (warehouse.ts)
  calls?: CallsState; // today's day calls (calls.ts)
  lastRaidOnYou?: number; // the last night a raid on you was planned (threat.ts caps the quiet nights in a row)
  tutorialRaidDone?: boolean; // the scripted first raid on you has been fought (threat.ts): it never comes again
  syndicate?: SyndicateState; // the rivals' Pact against you: Act 5's first day and the day it formed (syndicate.ts)
  squeeze?: SqueezeState; // campaign: the Big Squeeze, its 7-night siege of Sourwood Manor and what it won (squeeze.ts)
  autoDefend?: boolean; // Dex's Auto-Defend switch, from Rank 4 (autodefend.ts)
  captives?: Captive[]; // the Nabbed: raiders you hold, and your guards a rival holds (captives.ts)
  marketing?: MarketingState; // Sunny's walks and Coupon Blitzes by district and day, and campaigns booked for tomorrow (marketing.ts)
  weatherQueue?: DayWeather[]; // today's weather and the next 2 days', rolled ahead with their dawn forecasts (weather.ts)
}

export type SimEvent =
  | { type: 'passerby'; plot: string; at: string; segment: SegmentId; buys: boolean; reason?: WalkReason; price: number; owner: FactionId } // price: what they paid (or the posted price)
  | { type: 'pickup'; order: Order; ok: boolean; raid?: BattleReport }
  | { type: 'close' }
  | { type: 'alert'; alert: Alert } // a card landed in the alert feed
  | { type: 'fight'; raid: Raid; report: BattleReport } // a raid hit at its minute and was fought
  | { type: 'dawn' }; // the night is over: Morning Prep

const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
type Rng = { seed: number };
const RIVAL_IDS = Object.keys(FACTIONS) as RivalId[];

export function seasonOf(day: number): Season {
  return SEASONS[Math.floor((day - 1) / SEASON_DAYS) % SEASONS.length];
}
export function seasonDay(day: number): number {
  return ((day - 1) % SEASON_DAYS) + 1;
}

function rollMarket(rng: Rng): Record<SupplyId, number> {
  const m = {} as Record<SupplyId, number>;
  for (const id of Object.keys(SUPPLIES) as SupplyId[]) {
    m[id] = Math.round(SUPPLIES[id].baseUnitPrice * (1 + randomRange(rng, -MARKET_SWING, MARKET_SWING)) * 1000) / 1000;
  }
  return m;
}

const emptyWalk = (): Record<WalkReason, number> => ({ notThirsty: 0, pricey: 0, line: 0, soldOut: 0, rival: 0 });
const emptyStandDay = (): StandDay => ({ passersby: 0, customers: 0, walkedPast: emptyWalk(), revenue: 0, cupCosts: 0, satisfaction: 0 });

function emptyStats(s: GameState): DayStats {
  return {
    day: s.day, weather: s.forecast, passersby: 0, customers: 0, walkedPast: emptyWalk(), revenue: 0, supplies: 0, cupCosts: 0,
    upkeep: 0, land: 0, iceMelted: 0, lemonsSpoiled: 0, satisfaction: 0, reputationBefore: s.reputation,
    reputationAfter: s.reputation, scoreBefore: successScore(s), cashAtDawn: s.cash,
  };
}

export function newStand(level = 1, price = STAND_LEVELS[level - 1].topPrice): Stand {
  return {
    level, inventory: { lemons: [], sugar: 0, ice: 0, sugarCost: 0, iceCost: 0 }, recipe: 'classic', sweetness: 'classic',
    price, pitcherCups: 0, queue: 0, campaigns: {}, autoRestock: true, stockTarget: null, autoPrice: true, day: emptyStandDay(),
  };
}

/** A stand of this level built new on an empty plot: every step's cost, paid at once (L1 $150, L2 $550, L3 $4,050,
 * L4 $64,050, L5 $714,050). It's what the plot's investment gets, for yours and a rival's alike. */
export function standCost(level: number): number {
  return STAND_LEVELS.slice(0, level).reduce((a, l) => a + l.cost, 0);
}

/** Rivals start with their home turf and a foothold in Old Town (a Sandbox seeds only its picks, on its own map). */
function seedRivals(s: GameState, rng: Rng): void {
  for (const id of RIVAL_IDS) {
    const f = FACTIONS[id];
    if (f.outOfTown) { s.rivals[id] = outOfTownerState(); continue; } // Endless Summer's Out-of-Towner waits out of town (schemes.ts)
    s.rivals[id] = { cash: f.startCash, brandTier: id === 'fizzco' ? 2 : 1, grudge: 0, attention: 0, peakPlots: 0, alive: true, respectUntil: 0 };
    if (!inPlay(s, id)) { Object.assign(s.rivals[id], { cash: 0, alive: false }); continue; } // land: left out of this Sandbox, never in play
    const home = PLOTS.filter((p) => p.district === f.home);
    const hq = home.find((p) => p.type === 'hq');
    if (hq) s.plots[hq.id] = { owner: id, stand: null, invested: 0, landValue: hq.baseLand, defense: NO_DEFENSE() };
    const street = home.filter((p) => ['street', 'prime', 'landmark', 'field'].includes(plotType(s, p))); // a plot the map retagged stays neutral
    const take = Math.round(street.length * f.homeShare);
    const order = street.map((p) => ({ p, k: nextRandom(rng) })).sort((a, b) => a.k - b.k).map((x) => x.p);
    for (const p of order.slice(0, take)) placeRivalStand(s, id, p, rng);
    const oldTown = PLOTS.filter((p) => p.district === 'oldtown' && onMap(s, 'oldtown') && plotType(s, p) === 'street' && !s.plots[p.id].owner);
    for (let i = 0; i < f.oldTownStands; i++) {
      const p = oldTown.splice(Math.floor(nextRandom(rng) * oldTown.length), 1)[0];
      if (p) placeRivalStand(s, id, p, rng);
    }
  }
  // Field and Dock land starts in rival hands (spec section 14): Hollis holds the
  // Groves fields, FizzCo the Harbor docks and bottling plant, Sourwood Hilltop's polo lawn and marina.
  const holder: Partial<Record<string, RivalId>> = { groves: 'hollis', harbor: 'fizzco', hilltop: 'sourwood' };
  for (const p of PLOTS) {
    const owner = holder[p.district];
    if (owner && inPlay(s, owner) && onMap(s, p.district) && (p.type === 'field' || p.type === 'dock' || p.id === FIZZCO_PLANT) && !s.plots[p.id].owner) { // an absent holder's land starts neutral; land off the map stays nobody's
      s.plots[p.id] = { owner, stand: null, invested: 0, landValue: p.baseLand, defense: NO_DEFENSE() };
    }
  }
  for (const id of RIVAL_IDS) s.rivals[id].peakPlots = ownedPlots(s, id).length;
  for (const id of RIVAL_IDS) openBooks(s, id);
  provideMysteryGoal(); // Act 3's mystery on Lottie's card (src/sim/schemes.ts)
}

function placeRivalStand(s: GameState, id: RivalId, p: Plot, rng: Rng): void {
  const f = FACTIONS[id];
  void rng;
  // Spec: rivals start at L2 (The Groves L1; Downtown and Hilltop L3), +1 on Prime and Landmark, capped per faction.
  const base = p.district === 'groves' ? 1 : p.district === 'downtown' || p.district === 'hilltop' ? 3 : 2;
  const level = p.type === 'field' ? 0 : clamp(base + (p.type === 'prime' || p.type === 'landmark' ? 1 : 0), 1, f.maxLevel);
  const stand = level ? newStand(level, rivalPrice(id, level, p)) : null;
  s.plots[p.id] = { owner: id, stand, invested: level ? standCost(level) : 0, landValue: p.baseLand, defense: NO_DEFENSE() };
}

/**
 * A rival's everyday price: its stand's ceiling (the same formula as yours), nudged by personality (FACTIONS.price).
 * Given the game, the price it posts there today: with its price war's cut where one runs (rivals' priceWarCut, 1 when none).
 */
export function rivalPrice(id: RivalId, level: number, p: Plot, s?: GameState): number {
  const everyday = round2(ceilingFor(level, p.district, 'classic') * FACTIONS[id].price);
  return s ? round2(everyday * priceWarCut(s, id, p.id)) : everyday;
}

export function newGame(seed = Date.now() & 0x7fffffff, settings: Partial<Settings> = {}): GameState {
  const rng = { seed };
  const forecast = seasonWeather(rng, seasonOf(1)); // Day 1 runs off its forecast; the weather queue starts at the first dawn (weather.ts)
  const market = rollMarket(rng);
  const s: GameState = {
    version: SAVE_VERSION, seed: 0, day: 1, minute: DAWN, phase: 'prep',
    cash: START.cash, reputation: START.reputation, rank: 1, brandTier: 0, market, forecast, weather: forecast, weatherQueue: [],
    plots: {}, rivals: {} as Record<RivalId, RivalState>, spawnCarry: {}, selected: LOTTIES_CORNER,
    today: undefined as unknown as DayStats, history: [], peakScore: 0, lifetimeCups: 0, news: [],
    guards: [], recruits: [], nextId: 1, raids: [], battles: [], respectFromPlayer: {},
    bottles: 0, offers: [], orders: [], settings: settleMap(defaultSettings(settings)), peakDay: 1, // land: a Sandbox's map and rivals
    combatRules: COMBAT_RULES,
    tutorialRaidDone: false, // nights: a fresh run's own flag, so a load never guesses it from the day (threat.ts migrateThreat)
  };
  for (const p of PLOTS) s.plots[p.id] = { owner: null, stand: null, invested: 0, landValue: p.baseLand, defense: NO_DEFENSE() };
  s.plots[LOTTIES_CORNER] = { owner: 'player', stand: newStand(START.standLevel), invested: START.tableInvested, landValue: START.landValue, defense: NO_DEFENSE() }; // $525 to start: $150 + $300 + 75% of $100
  s.plots[LOTTIES_CORNER].stand!.price = priceCeiling(s, LOTTIES_CORNER); // the sweet spot (spec: Pricing)
  s.plots[LOTTIES_CORNER].stand!.startTable = true; // counts as $100 invested in its rebuilds and repairs (damage.ts buildingInvested)
  seedRivals(s, rng);
  seedRivalDefenses(s, rng);
  seedRivalFacilities(s);
  s.seed = rng.seed;
  migrateWorld(s);
  s.today = emptyStats(s);
  s.peakScore = successScore(s);
  storyAtStart(s); // the story's parts, and Lottie stocks the Corner for Day 1
  return s;
}

// ---------- lookups ----------

export function ownedPlots(s: GameState, owner: FactionId): Plot[] {
  return PLOTS.filter((p) => s.plots[p.id].owner === owner);
}
export function playerStands(s: GameState): Plot[] {
  return PLOTS.filter((p) => s.plots[p.id].owner === 'player' && s.plots[p.id].stand);
}
/** The stand the player is managing (falls back to any stand they own). */
export function selectedStand(s: GameState): Stand {
  const st = s.plots[s.selected]?.stand;
  if (st && s.plots[s.selected].owner === 'player') return st;
  const any = playerStands(s)[0];
  if (any) { s.selected = any.id; return s.plots[any.id].stand!; }
  return newStand(); // no stands at all (only reachable after losses)
}
export function standLevel(st: Stand): StandLevel {
  return STAND_LEVELS[st.level - 1];
}

// ---------- inventory ----------

export function stock(st: Stand, id: SupplyId): number {
  return id === 'lemons' ? st.inventory.lemons.reduce((a, b) => a + b.qty, 0) : st.inventory[id];
}

function inventoryValue(st: Stand): number {
  const inv = st.inventory;
  return inv.lemons.reduce((a, b) => a + b.qty * b.unitCost, 0) + inv.sugar * inv.sugarCost + inv.ice * inv.iceCost;
}

/**
 * The most of a supply a stand holds: its level's cups of stock (300 / 750 / 1,800 / 4,500 / 10,500) in the stock
 * its card pours, up to whole packs. Every card pours the same stock (balance.ts RECIPES), so a switch strands none.
 */
export function storageFor(st: Stand, id: SupplyId): number {
  const n = pitcherNeeds(st);
  const perCup = id === 'lemons' ? n.lemons / CUPS_PER_PITCHER : id === 'sugar' ? n.sugar / CUPS_PER_PITCHER : n.icePerCup;
  const pack = SUPPLIES[id].pack;
  return Math.max(0, Math.ceil((standLevel(st).stock * perCup) / pack - 1e-9)) * pack;
}

/** Packs of a supply the player could buy for a stand right now (cash and storage). */
export function maxPacks(s: GameState, st: Stand, id: SupplyId): number {
  const sp = SUPPLIES[id];
  const room = Math.floor((storageFor(st, id) - stock(st, id)) / sp.pack);
  const afford = Math.floor((s.cash + 1e-9) / (sp.pack * s.market[id]));
  return Math.max(0, Math.min(room, afford));
}

export function buySupply(s: GameState, id: SupplyId, packs = 1, st: Stand = selectedStand(s)): boolean {
  if (s.phase === 'report' || s.phase === 'night' || packs <= 0 || packs > maxPacks(s, st, id)) return false;
  const qty = SUPPLIES[id].pack * packs;
  const unit = s.market[id];
  const cost = round2(qty * unit);
  book(s, 'stock', -cost); // the day's stock bought (the Ledger's Supplies are what it uses)
  const inv = st.inventory;
  if (id === 'lemons') {
    const last = inv.lemons[inv.lemons.length - 1];
    if (last && last.day === s.day && last.unitCost === unit) last.qty += qty;
    else inv.lemons.push({ qty, day: s.day, unitCost: unit });
  } else {
    const costKey = id === 'sugar' ? 'sugarCost' : 'iceCost';
    inv[costKey] = (inv[id] * inv[costKey] + qty * unit) / (inv[id] + qty);
    inv[id] += qty;
  }
  return true;
}

export function useLemons(st: Stand, n: number): void { // world: a Local Order's pitchers take them too (vip.ts)
  const batches = st.inventory.lemons; // oldest first
  while (n > 0 && batches.length) {
    const b = batches[0];
    const take = Math.min(b.qty, n);
    b.qty -= take;
    n -= take;
    if (b.qty === 0) batches.shift();
  }
}

// ---------- choices ----------

export function setRecipe(st: Stand, id: RecipeId): void { st.recipe = id; }
export function setSweetness(st: Stand, v: Sweetness): void { st.sweetness = v; }
/** The tag runs to $50: late ceilings pass $20 (an L5 in Hilltop with a +30% card is $18.20), and nobody buys at 40% over. */
export function setPrice(st: Stand, price: number): void { st.price = clamp(round2(price), 0.05, 50); }

export function pitcherNeeds(st: Stand): { lemons: number; sugar: number; icePerCup: number } {
  const r = RECIPES[st.recipe];
  return { lemons: r.lemonsPerPitcher, sugar: r.sugarPerPitcher, icePerCup: r.icePerCup }; // Sweetness never moves the cost
}

/** Supply cost of one cup at today's market prices (plus the flat cup). */
export function costPerCup(s: GameState, st: Stand): number {
  const n = pitcherNeeds(st);
  return (n.lemons * s.market.lemons + n.sugar * s.market.sugar) / CUPS_PER_PITCHER
    + n.icePerCup * s.market.ice + RECIPES[st.recipe].extraPerCup + CUP_COST;
}

/**
 * Cups in stock: the smallest of the cups' worth of lemons, sugar and ice on hand (a cup needs all three). With an
 * ice machine making the ice (`machine`, world: L4+), only the lemons and sugar count; cupsInStock asks the stand.
 */
export function servingsAvailable(st: Stand, machine = false): number {
  const n = pitcherNeeds(st);
  const pitchers = Math.min(Math.floor(stock(st, 'lemons') / n.lemons), n.sugar > 0 ? Math.floor(st.inventory.sugar / n.sugar) : Infinity);
  const cups = st.pitcherCups + pitchers * CUPS_PER_PITCHER;
  return n.icePerCup > 0 && !machine ? Math.min(cups, Math.floor(st.inventory.ice / n.icePerCup)) : cups;
}

/** Cups in stock at a plot's stand, its ice machine counted (world: an L4+ stand of yours makes its own ice). */
export function cupsInStock(s: GameState, plotId: string): number {
  const st = s.plots[plotId]?.stand;
  return st ? servingsAvailable(st, iceMachineOn(s, plotId)) : 0;
}

// ---------- demand ----------

export interface Appeal {
  priceFit: number; recipeMatch: number; sweetMatch: number; curb: number; appeal: number;
  /** The chance a passerby stops and buys; `wouldStop` is the chance at the ceiling (over it, the gap is lost to price). */
  stopChance: number; wouldStop: number;
  /** The stand's ceiling, one per stand. fairPrice and topPrice are older names for it. */
  ceiling: number; fairPrice: number; topPrice: number;
}

function ownerReputation(s: GameState, owner: FactionId): number {
  return owner === 'player' ? s.reputation : rivalStars(s, owner as RivalId); // each rival's own stars (demand.ts)
}

/** How a customer of a segment feels about a stand today (spec: appeal = curb appeal x recipe match x price fit x Reputation). */
export function appealFor(s: GameState, plotId: string, seg: SegmentId, w: Weather = s.weather): Appeal {
  const ps = s.plots[plotId];
  const st = ps.stand!;
  const ceiling = priceCeiling(s, plotId, st);
  const priceFit = standPriceFit(s, plotId, seg, st, ceiling); // a Coupon Blitz's ×1.4 (marketing.ts)
  // world: where the card shines and the Sweetness dial (rivals: 1). Its top-price perk is in the ceiling (topPriceMods).
  const card = cardFit(s, plotId, seg);
  const recipeMatch = card.match;
  const sweetMatch = card.sweet;
  const curb = curbAppeal(s, plotId);
  const beforePrice = curb * recipeMatch * sweetMatch * repMultiplier(ownerReputation(s, ps.owner!));
  const appeal = beforePrice * priceFit;
  const { stopChance, wouldStop } = stopOdds(WEATHER[w.kind].thirst, beforePrice, priceFit);
  return { priceFit, recipeMatch, sweetMatch, curb, appeal, stopChance, wouldStop, ceiling, fairPrice: ceiling, topPrice: ceiling };
}

/** Average stop chance across a plot's day-long customer mix. */
export function averageStopChance(s: GameState, plotId: string, w: Weather = s.weather): number {
  return dayMixOn(s, PLOT_BY_ID[plotId].district).reduce((a, [seg, x]) => a + appealFor(s, plotId, seg, w).stopChance * x, 0);
}

export function expectedPassersby(s: GameState, plotId: string, w: Weather = s.weather): number {
  const ps = s.plots[plotId];
  if (!ps.stand || ps.stand.wrecked || isSpoiled(s, ps) || inspectorClosed(s, ps)) return 0; // land: closed until dawn by the health inspector
  return PLOT_BY_ID[plotId].baseTraffic * standLevel(ps.stand).draw * marketingMultiplier(s, ps.owner!, ps.stand, plotId)
    * seasonDemand(s, plotId) * WEATHER[w.kind].traffic * eventTraffic(s, plotId); // world: Viral Video, Parade, Roadworks...
}

/** Cups a stand should sell today (the prep odds and Auto-Restock): demand by the day's own rules, capped at its service. */
export function expectedCups(s: GameState, plotId: string, w: Weather = s.forecast): number {
  if (!s.plots[plotId]?.stand) return 0;
  return Math.min(Math.round(expectedDemand(s, plotId, w).demand), dailyService(s, plotId)); // service: a Damaged stand pours its HP share
}

const HOURLY_SUM = HOURLY_TRAFFIC.reduce((a, b) => a + b, 0);

/** Who walks past: the district's mix, with each segment's peak hours weighted up (demand.ts). */
function segmentAt(rng: Rng, district: DistrictId, hour: number): SegmentId {
  return drawSegment(rng, district, hour);
}

// ---------- the business day ----------

export function openStands(s: GameState): boolean {
  if (s.phase !== 'prep' || gameOver(s)) return false;
  holdPrices(s); // Auto-Price re-posts any ceiling Morning Prep moved, then Auto-Restock tops up (automation.ts)
  restockAtOpen(s);
  startBookings(s); // campaigns booked yesterday start now; a booked Free Sample Day hands out its cups (marketing.ts)
  const rng = { seed: s.seed };
  let weather = weatherAtOpen(s, rng); // the day as rolled, or one step from its forecast (Day 1, or a forecast changed since dawn: weather.ts)
  s.seed = rng.seed;
  weather = eventWeather(s, weather); // world: a Heat Wave day is a Scorcher whatever the roll
  s.weather = weather;
  s.today.weather = weather;
  s.today.reputationBefore = s.reputation;
  s.phase = 'open';
  s.minute = OPEN;
  s.spawnCarry = {};
  dayCache.delete(s);
  stormAtOpen(s); // a Storm dents every L1–L2 stand (damage.ts)
  for (const p of PLOTS) {
    const st = s.plots[p.id].stand;
    if (!st) continue;
    st.day = emptyStandDay();
    st.queue = 0;
  }
  return true;
}
/** Older name kept for tests and tools. */
export const openStand = openStands;

// Appeal is cached for the open day: worked out once per stand and segment, and each plot's street (which
// stands a passerby can pick, demand.ts) with it. Cleared whenever the stands open. The whole town is judged
// afresh when a stand opens, is wrecked or changes hands mid-day, or Reputation or the weather moves (checked
// once a minute): a table rebuilt on a wrecked plot sells as itself, and a plot that changes hands moves the
// Majority's curb appeal. A mid-day nudge (price, card, Sweetness, level) re-judges that stand and every street
// it sells on, within 2 plots, from the next minute (spec: Nudge anything mid-day, and the stand panel answers).
interface TownPlot {
  stand: Stand | null; wrecked: boolean; owner: FactionId | null;
  price: number; recipe: RecipeId | null; sweetness: Sweetness | null; level: number;
  billboard: boolean; // a Billboard standing here: its traffic and its pull on rival stands within 2 plots (marketing.ts)
}
interface DayCache {
  appeal: Map<string, Partial<Record<SegmentId, Appeal>>>;
  streets: Map<string, Partial<Record<SegmentId, Street>>>;
  town: TownPlot[];
  reputation: number;
  weather: WeatherKind | null;
}
const dayCache = new WeakMap<GameState, DayCache>();
function cacheFor(s: GameState): DayCache {
  let c = dayCache.get(s);
  if (!c) { c = { appeal: new Map(), streets: new Map(), town: [], reputation: s.reputation, weather: null }; dayCache.set(s, c); }
  return c;
}
function cachedAppeal(s: GameState, plotId: string, seg: SegmentId): Appeal {
  const m = cacheFor(s).appeal;
  let row = m.get(plotId);
  if (!row) { row = {}; m.set(plotId, row); }
  return (row[seg] ??= appealFor(s, plotId, seg));
}
function streetFor(s: GameState, p: Plot, seg: SegmentId): Street {
  const m = cacheFor(s).streets;
  let row = m.get(p.id);
  if (!row) { row = {}; m.set(p.id, row); }
  return (row[seg] ??= streetAt(s, p, (id) => cachedAppeal(s, id, seg)));
}
function townPlot(ps: PlotState): TownPlot {
  const st = ps.stand;
  return { stand: st, wrecked: st?.wrecked ?? false, owner: ps.owner, price: st?.price ?? 0, recipe: st?.recipe ?? null, sweetness: st?.sweetness ?? null, level: st?.level ?? 0, billboard: standingBillboard(ps) };
}
/** Drop what moved since the last minute: the whole town for a new, wrecked or traded stand (or Billboard), one block for a nudge. */
function holdStreets(s: GameState): void {
  const c = cacheFor(s);
  let moved = c.town.length !== PLOTS.length || c.reputation !== s.reputation || c.weather !== s.weather.kind;
  for (let i = 0; i < PLOTS.length && !moved; i++) {
    const ps = s.plots[PLOTS[i].id], t = c.town[i];
    moved = ps.stand !== t.stand || (ps.stand?.wrecked ?? false) !== t.wrecked || ps.owner !== t.owner || standingBillboard(ps) !== t.billboard;
  }
  if (moved) {
    c.streets.clear();
    c.appeal.clear();
    c.town = PLOTS.map((p) => townPlot(s.plots[p.id]));
    c.reputation = s.reputation;
    c.weather = s.weather.kind;
    return;
  }
  for (let i = 0; i < PLOTS.length; i++) {
    const st = s.plots[PLOTS[i].id].stand, t = c.town[i];
    if (!st || (st.price === t.price && st.recipe === t.recipe && st.sweetness === t.sweetness && st.level === t.level)) continue;
    c.appeal.delete(PLOTS[i].id);
    for (const q of nearbyPlots(PLOTS[i])) c.streets.delete(q.id); // the streets this stand sells on
    c.town[i] = townPlot(s.plots[PLOTS[i].id]);
  }
}

function serveAt(s: GameState, plotId: string, rng: Rng, a: Appeal, seg: SegmentId): { buys: boolean; reason?: WalkReason; paid?: number } {
  const ps = s.plots[plotId];
  const st = ps.stand!;
  const isPlayer = ps.owner === 'player';
  // Over the ceiling, the buyers lost to price walk off "too pricey"; the rest simply aren't thirsty.
  const roll = nextRandom(rng);
  if (roll >= a.stopChance) return { buys: false, reason: roll < a.wouldStop ? 'pricey' : 'notThirsty' };
  // A buyer joins the line only if the people ahead are within their patience; it moves at the pour rate, and a
  // minute's walkers count only those still waiting once this minute's cups are poured (demand.ts).
  // The day's pours stop at cups/hour × 10 (service); past that, everyone finds the line too long too.
  // A Damaged stand pours its HP share (pourRate, damage.ts), so its line moves slower and its day ends sooner.
  if (!joinsLine(st, seg, pourRate(s, plotId) / 60) || serviceLeft(s, plotId) <= 0) return { buys: false, reason: 'line' };
  if (!isPlayer && st.day.customers >= stockCups(st)) return { buys: false, reason: 'soldOut' }; // a rival sells one full stock a day
  if (isPlayer) {
    if (st.inventory.ice < RECIPES[st.recipe].icePerCup && !iceMachineOn(s, plotId)) return { buys: false, reason: 'soldOut' }; // a cup needs its ice: no warm lemonade
    if (st.pitcherCups === 0) {
      const n = pitcherNeeds(st);
      if (stock(st, 'lemons') >= n.lemons && st.inventory.sugar >= n.sugar) {
        useLemons(st, n.lemons);
        st.inventory.sugar -= n.sugar;
        st.pitcherCups = CUPS_PER_PITCHER;
      }
    }
    if (st.pitcherCups === 0) return { buys: false, reason: 'soldOut' };
    st.pitcherCups--;
  }
  st.queue = (st.queue ?? 0) + 1;
  const price = salePrice(s, plotId, st); // a Coupon Blitz takes its cut off the price (marketing.ts)
  const paid = round2(price * touristPays(s, plotId, seg)); // Tourist Trap: tourists pay +20%
  let cupCost = CUP_COST;
  if (isPlayer) {
    const ice = RECIPES[st.recipe].icePerCup;
    cupCost += machineIce(s, plotId, st, ice); // world: an L4+ stand's ice machine makes what the cooler lacks
    st.inventory.ice -= ice;
    cupCost += RECIPES[st.recipe].extraPerCup;
  } else {
    cupCost = costPerCup(s, st); // rivals buy as they pour, at today's Market prices (the cup included)
  }
  // How pleased this buyer is: the day's mood, never Reputation (it drifts on stand levels and walk-aways, demand.ts).
  // world: the card and the Sweetness dial win customers through appeal (spec: Reputation).
  const sat = clamp(0.55 + 0.4 * (a.fairPrice - price) / a.fairPrice, 0, 1);
  const d = st.day;
  d.satisfaction = (d.satisfaction * d.customers + sat) / (d.customers + 1);
  d.customers++;
  d.revenue = round2(d.revenue + paid);
  d.cupCosts = round2(d.cupCosts + cupCost);
  if (isPlayer) {
    sellCup(s, st, paid, cupCost); // the Ledger: the sale, the cup's cash costs and its stock used (ledger.ts)
    s.lifetimeCups++;
  } else {
    const r = s.rivals[ps.owner as RivalId];
    r.cash = round2(r.cash + paid - cupCost);
  }
  return { buys: true, paid };
}

/** Advance one game minute. Returns what happened, for the renderer. */
export function tickMinute(s: GameState): SimEvent[] {
  if (s.phase === 'night') { // the night runs on the same clock; at 07:00 dawn opens Morning Prep
    const night = nightStep(s);
    night.push(...scoreMinute(s)); // night loot and a VIP pickup's pay move the score too: a rank-up on the spot (score.ts)
    if (s.minute >= NIGHT_END && !s.fight && sleepUntilDawn(s)) night.push({ type: 'dawn' }); // combat: a live fight holds dawn at 07:00 till it's over
    return night;
  }
  if (s.phase !== 'open') return [];
  const events: SimEvent[] = [];
  const rng = { seed: s.seed };
  const hourIdx = Math.floor((s.minute - OPEN) / 60);
  holdStreets(s);
  for (const p of PLOTS) {
    const ps = s.plots[p.id];
    if (!ps.stand || ps.stand.wrecked || isSpoiled(s, ps) || inspectorClosed(s, ps)) continue; // land: the health inspector's closure
    const perMinute = (expectedPassersby(s, p.id) * HOURLY_TRAFFIC[hourIdx] * lunchRush(s, p.id, 8 + hourIdx)) / HOURLY_SUM / 60;
    let carry = (s.spawnCarry[p.id] ?? 0) + perMinute * randomRange(rng, 0.2, 1.8);
    while (carry >= 1) {
      carry -= 1;
      events.push(passerby(s, p, rng, hourIdx));
    }
    s.spawnCarry[p.id] = carry;
  }
  for (const p of PLOTS) if (s.plots[p.id].stand?.queue) drainQueue(s, p.id); // the minute's pours: what's left waits into the next
  s.seed = rng.seed;
  for (const pk of pickupsAt(s)) events.push({ type: 'pickup', ...pk });
  warehouseRuns(s); // land: a Warehouse's market runs keep its district's stands stocked (warehouse.ts)
  s.minute++;
  events.push(...onTheClock(s, events)); // daytime raids are warned and fought on the clock; calls land in the feed
  events.push(...storyMinute(s)); // a hand of Lottie's Tips is a major alert (score.ts, perks.ts)
  callsOnTheClock(s); // a day call breaks in at its minute (calls.ts)
  eventsOnTheClock(s); // world: mid-day events break in on 101.5
  if (s.minute >= CLOSE) {
    closeDay(s);
    events.push({ type: 'close' });
  }
  return events;
}

/** One person walks past plot p; the stands within 2 plots split them by appeal (rivals take 35% at most). */
function passerby(s: GameState, p: Plot, rng: Rng, hourIdx: number): SimEvent {
  const seg = festivalCrowd(s, rng, p.district) ?? segmentAt(rng, p.district, 8 + hourIdx);
  const home = s.plots[p.id];
  home.stand!.day.passersby++;
  const walk = kidStandSale(s, p, rng, seg, streetFor(s, p, seg)); if ('type' in walk) return walk; // world: Kids' Lemonade Day's kid stands take their share of the street
  const { id: chosen, a } = chooseOn(walk, rng);
  const chosenOwner = s.plots[chosen].owner!;
  const result = serveAt(s, chosen, rng, a, seg);
  if (chosenOwner !== home.owner) home.stand!.day.walkedPast.rival++;
  if (chosenOwner === 'player' && result.buys && home.owner !== 'player') tookCustomer(s, home.owner as RivalId); // Attention
  if (!result.buys) s.plots[chosen].stand!.day.walkedPast[result.reason!]++;
  if (home.owner === 'player') {
    s.today.passersby++;
    if (chosenOwner !== 'player') s.today.walkedPast.rival++;
  }
  if (chosenOwner === 'player') {
    if (result.buys) s.today.customers++; else s.today.walkedPast[result.reason!]++;
  }
  return { type: 'passerby', plot: p.id, at: chosen, segment: seg, buys: result.buys, reason: result.reason, price: result.paid ?? salePrice(s, chosen), owner: chosenOwner };
}

function closeDay(s: GameState): void {
  const t = s.today;
  let satSum = 0, satN = 0, revenue = 0, cupCosts = 0, upkeep = 0, stands = 0;
  const levels = STAND_LEVELS.map(() => 0);
  for (const p of PLOTS) {
    const ps = s.plots[p.id];
    const st = ps.stand;
    if (ps.owner === 'player') {
      if (st) {
        upkeep += standLevel(st).upkeep;
        stands++;
        levels[st.level - 1]++;
        if (!iceMachineOn(s, p.id)) { // world: an ice machine keeps its ice (a Power Outage's leftovers melt)
          t.iceMelted += st.inventory.ice;
          useStock(s, st.inventory.ice * st.inventory.iceCost, true);
          st.inventory.ice = 0; // ice never keeps overnight
        }
        st.pitcherCups = 0; // leftover lemonade is poured out
        satSum += st.day.satisfaction * st.day.customers;
        satN += st.day.customers;
        revenue += st.day.revenue;
        cupCosts += st.day.cupCosts;
      }
    } else if (ps.owner && st) {
      s.rivals[ps.owner as RivalId].cash -= standLevel(st).upkeep;
      s.rivals[ps.owner as RivalId].salesToday = (s.rivals[ps.owner as RivalId].salesToday ?? 0) + st.day.revenue;
    }
  }
  closeTills(s); // combat: each stand's day in its books, for Shakedown loot
  t.revenue = round2(t.revenue + revenue); // world: the day's VIP pickups (booked as they load) stay in its sales
  t.cupCosts = round2(cupCosts);
  pickupsAtClose(s); // local and caterer orders go out at closing (adds to today's revenue)
  t.satisfaction = satN ? satSum / satN : 0;
  book(s, 'upkeep', -round2(upkeep), stands); // stand upkeep only: wages, tribute and interest left cash when paid
  if (stands) t.upkeepLevels = levels; // the Ledger's "5 Wooden Stands at $15"
  reputationAtClose(s, t); // the nightly drift toward the stands' levels, less the buyers who left empty-handed: yours and each rival's (demand.ts)
  t.reputationAfter = s.reputation;
  worldAtClose(s); // world: judge today's Taste-Off
  s.history.push(t);
  if (s.history.length > 60) s.history.shift();
  const score = successScore(s);
  logScore(s, score); // the Ledger's chart (ledger.ts)
  trackOutselling(s);
  scoreCheck(s); // the peak and a rank-up, before tonight's raids are planned (score.ts)
  damageAtClose(s); // rivals book their repairs at closing, like you (damage.ts)
  s.phase = 'report';
  stationByPriority(s); // Dex's Auto-Defend posts the idle reserve by each plot's priority (autodefend.ts)
  planNight(s);
  storyAtClose(s);
}

/** Sleep till dawn: the rest of the night runs minute by minute (raids hit at their minute), then dawn opens
 * Morning Prep. With stopAtAlerts it stops at the next major alert instead (false: the night isn't over). */
export function sleepUntilDawn(s: GameState, stopAtAlerts = false, events?: SimEvent[]): boolean {
  if ((s.phase !== 'report' && s.phase !== 'night') || gameOver(s)) return false;
  if (!runNight(s, stopAtAlerts, events)) return false;
  resolveNight(s);
  s.day++;
  s.minute = DAWN;
  damageAtDawn(s); // the night's repairs are done (damage.ts)
  const rng = { seed: s.seed };
  let spoiled = 0, spoiledValue = 0;
  for (const p of playerStands(s)) {
    const st = s.plots[p.id].stand!;
    st.inventory.lemons = st.inventory.lemons.filter((b) => {
      const bad = s.day - b.day >= lemonDays(s); // Cool Cellar keeps them longer (perks.ts)
      if (bad) { spoiled += b.qty; spoiledValue += b.qty * b.unitCost; }
      return !bad;
    });
    for (const id of Object.keys(st.campaigns) as CampaignId[]) {
      const left = (st.campaigns[id] ?? 0) - 1;
      if (left > 0) st.campaigns[id] = left; else delete st.campaigns[id];
    }
  }
  s.forecast = forecastAtDawn(s, rng); // today's off the weather queue, and a new day rolled onto its end (weather.ts)
  s.market = rollMarket(rng);
  s.seed = rng.seed;
  updateLandValues(s);
  rivalsAtDawn(s);
  schemesAtDawn(s);
  s.weather = s.forecast;
  s.phase = 'prep';
  s.today = emptyStats(s);
  s.today.lemonsSpoiled = spoiled;
  useStock(s, spoiledValue, true); // the Ledger's Supplies count what spoiled
  bookNightShift(s); // and what Act 3's Night Shift spoiled (schemes.ts)
  landAtDawn(s);
  crewAtDawn(s);
  rivalsBankrupt(s);
  worldAtDawn(s);
  vipAtDawn(s);
  actAtDawn(s); // the act turns before the Cookie Jar reads it (story.ts)
  fortunesAtDawn(s);
  nightsAtDawn(s);
  storyAtDawn(s);
  automationAtDawn(s); // the helpers' dawn runs, Auto-Restock first, at today's prices (automation.ts)
  return true;
}

/** Run the rest of the business day instantly (tests, Finish the day). With stopAtAlerts it stops after the
 * minute that raised a major alert (a Delivery Raid warning, say), so the skip never jumps past one. */
export function simulateRestOfDay(s: GameState, stopAtAlerts = false): SimEvent[] {
  const all: SimEvent[] = [];
  while (s.phase === 'open') {
    const ev = tickMinute(s);
    all.push(...ev);
    if (stopAtAlerts && ev.some((e) => e.type === 'alert' && isMajor(e.alert))) break;
  }
  return all;
}

export function lemonsExpiringTomorrow(s: GameState, st: Stand): number {
  return st.inventory.lemons.filter((b) => s.day + 1 - b.day >= lemonDays(s)).reduce((a, b) => a + b.qty, 0);
}

// ---------- land ----------

/** Land rises with development (more and bigger stands in a district), up to ×2 base. HQ land rises with its district too.
 * A Fire Sale's First Dibs follows the land: 75% of each day's value, so the sale stays a sale as the district empties
 * (Lottie's side-lot offer keeps its fixed $300). */
function updateLandValues(s: GameState): void {
  for (const d of mapDistricts(s)) {
    const dev = development(s, d.id);
    for (const p of PLOTS) if (p.district === d.id && p.type !== 'civic') s.plots[p.id].landValue = Math.round(p.baseLand * (1 + (LAND_DEVELOPMENT_MAX - 1) * dev));
  }
  s.plots[LOTTIES_CORNER].landValue = Math.max(s.plots[LOTTIES_CORNER].landValue, START.landValue);
  for (const p of PLOTS) {
    const ps = s.plots[p.id];
    const dibs = ps.dibs;
    if (dibs?.who === 'player' && dibs.price !== undefined && !dibs.table && dibs.until >= s.day) dibs.price = Math.round(ps.landValue * FIRE_SALE.share);
  }
}

export type Blocker = { ok: true } | { ok: false; why: string };

/** A Foothold: at least one purchasable plot in the district (a Trophy HQ on its own doesn't count). */
export function hasFoothold(s: GameState, owner: FactionId, d: DistrictId): boolean {
  return PLOTS.some((p) => p.district === d && isPurchasable(p) && s.plots[p.id].owner === owner);
}

export function canBuyPlot(s: GameState, plotId: string): Blocker {
  const p = PLOT_BY_ID[plotId];
  const ps = s.plots[plotId];
  if (!plotOnMap(s, p)) return { ok: false, why: 'Off this map' };
  if (p.type === 'civic') return { ok: false, why: 'Civic land is not for sale' };
  if (p.type === 'hq') return { ok: false, why: 'HQs are captured, never bought' };
  if (ps.owner === 'player') return { ok: false, why: 'You own it' };
  if (ps.owner) return { ok: false, why: `Owned by ${FACTIONS[ps.owner as RivalId].name}` };
  if (landFrozen(s, plotId)) return { ok: false, why: 'Town Hall froze this sale' }; // Sourwood's Old Money
  if (ps.auction) return { ok: false, why: 'Up for auction: bid instead' };
  if (ps.dibs && ps.dibs.who !== 'player') return { ok: false, why: 'Someone else has First Dibs today' };
  const dibs = ps.dibs?.who === 'player' && ps.dibs.until >= s.day;
  const reach = reachBlocker(s, p.district);
  if (!dibs && !reach.ok) return reach;
  const price = plotPrice(s, plotId);
  if (s.cash < price) return { ok: false, why: `Needs $${price.toLocaleString('en-US')}` };
  return { ok: true };
}

/** What the player pays for an open plot: land value (or the First Dibs price), less 10% under Majority and 10% with Family Silver. */
export function plotPrice(s: GameState, plotId: string): number {
  const ps = s.plots[plotId];
  const base = ps.dibs?.who === 'player' && ps.dibs.until >= s.day && ps.dibs.price !== undefined ? ps.dibs.price : ps.landValue;
  return Math.round(base * majorityDiscount(s, PLOT_BY_ID[plotId].district) * familySilver(s) * goodDirt(s)); // Good Dirt: 10% off (perks.ts)
}

/** `quiet`: a district policy's purchase, which gets one headline for the district (policies.ts). */
export function buyPlot(s: GameState, plotId: string, quiet = false): boolean {
  if (!canBuyPlot(s, plotId).ok) return false;
  if (historicHedges(s, plotId)) return false; // rivals: Act 5, the Mayor freezes your first Hilltop deal
  const ps = s.plots[plotId];
  const price = plotPrice(s, plotId);
  book(s, 'invested', -price);
  ps.owner = 'player';
  if (ps.dibs?.table && !ps.stand) { ps.stand = newStand(1); ps.stand.price = priceCeiling(s, plotId); ps.invested += STAND_LEVELS[0].cost; }
  handOverKept(s, plotId, 'player'); // rivals: a bought-out rival's building comes with its Fire Sale plot
  delete ps.dibs;
  if (!quiet) s.news.push(`Skip Larkin: "Congratulations, you now own ${PLOT_BY_ID[plotId].name}!"`);
  announceControl(s);
  checkVictory(s);
  return true;
}

/**
 * Build a stand of any level your rank has unlocked straight onto an empty plot of yours that takes one (not a Field,
 * a Dock or a Trophy, and nothing built there), paying every step's cost at once (spec: "a Kiosk built on an empty
 * plot costs $150 + $400 + $3,500 = $4,050, paid at once"). Any hour of the day, the Evening too; not at night, when
 * repairs and rebuilds wait for the morning as well.
 */
export function canBuildStand(s: GameState, plotId: string, level = 1): Blocker {
  const type = plotType(s, PLOT_BY_ID[plotId]); // a Sandbox map may have retagged it
  const ps = s.plots[plotId];
  if (ps.owner !== 'player') return { ok: false, why: 'Buy the plot first' };
  if (type === 'hq') return { ok: false, why: 'A Trophy holds only its HQ' }; // land: one building per plot, so it's never smashed, lapses or lost
  if (ps.stand) return { ok: false, why: 'There is already a stand here' };
  if (type === 'field' || type === 'dock') return { ok: false, why: `${type === 'field' ? 'Fields hold helipads' : 'Docks hold piers'}, not stands` };
  if (ps.facility) return { ok: false, why: 'A facility is built here' };
  if (!STAND_LEVELS[level - 1]) return { ok: false, why: 'No such stand' };
  const gate = STAND_RANK_GATE[level - 1];
  if (s.rank < gate) return { ok: false, why: `Needs Rank ${gate}, ${RANKS[gate - 1].title}` };
  if (s.phase === 'night') return { ok: false, why: 'Too late tonight: build tomorrow' };
  const cost = standCost(level);
  if (s.cash < cost) return { ok: false, why: `Needs $${cost.toLocaleString('en-US')}` };
  return { ok: true };
}

/** `quiet`: a district policy's build, which leaves the stand you manage picked and gets one headline (policies.ts). */
export function buildStand(s: GameState, plotId: string, level = 1, quiet = false): boolean {
  if (!canBuildStand(s, plotId, level).ok) return false;
  const ps = s.plots[plotId];
  const cost = standCost(level);
  book(s, 'invested', -cost);
  ps.stand = newStand(level); // at full HP, with its level's draw, pour, top price and stock cap from the next minute
  ps.stand.price = priceCeiling(s, plotId); // a new stand opens at its ceiling
  ps.invested += cost;
  if (quiet) return true;
  s.selected = plotId;
  s.news.push(`A brand-new ${STAND_LEVELS[level - 1].name.replace(/^The /, '')} opens at ${PLOT_BY_ID[plotId].name}!`);
  return true;
}

// ---------- rivals at dawn (the rival AI lives in rivalAi.ts) ----------

/** Each rival banks its takings into Grow / Guard / Strike and spends Grow on upgrades and land. */
function rivalsAtDawn(s: GameState): void {
  const rng = { seed: s.seed };
  for (const id of RIVAL_IDS) {
    const r = s.rivals[id];
    if (!r.alive) continue;
    rivalDawn(s, id, rng);
    r.peakPlots = Math.max(r.peakPlots, ownedPlots(s, id).length);
  }
  s.seed = rng.seed;
  outOfTownerAtDawn(s); // Endless Summer: the Out-of-Towner's date in town (schemes.ts)
}

// ---------- score and rank ----------

/** Everything but cash: land + 75% of building investment + inventory at cost. */
export function assetValue(s: GameState, owner: FactionId = 'player'): number {
  let total = 0;
  for (const p of PLOTS) {
    const ps = s.plots[p.id];
    if (ps.owner !== owner) continue;
    total += ps.landValue + BUILDING_VALUE_SHARE * ps.invested + (owner === 'player' && ps.stand ? inventoryValue(ps.stand) : 0);
  }
  return round2(total + (owner === 'player' ? bottleValue(s) + warehouseValue(s) : 0)); // world: bottles on hand are stock at cost (vip.ts); land: a Warehouse's sugar too
}

/** Net Worth = cash + land + 75% of building investment + inventory at cost − loans. */
export function netWorth(s: GameState, owner: FactionId = 'player'): number {
  const cash = owner === 'player' ? s.cash - (s.loan?.principal ?? 0) : s.rivals[owner as RivalId].cash;
  return Math.max(0, round2(cash + assetValue(s, owner)));
}
export const successScore = (s: GameState, owner: FactionId = 'player') => Math.floor(netWorth(s, owner));

export function rankFor(score: number) {
  let r = RANKS[0];
  for (const x of RANKS) if (score >= x.ss) r = x;
  const next = RANKS.find((x) => x.ss > score);
  return { ...r, next };
}

// ---------- upgrades and marketing (milestone 2) ----------

export function canUpgradeStand(s: GameState, plotId = s.selected): Blocker {
  const st = s.plots[plotId]?.stand;
  if (!st || s.plots[plotId].owner !== 'player') return { ok: false, why: 'Not your stand' };
  const next = STAND_LEVELS[st.level];
  if (!next) return { ok: false, why: 'Already the Citrus Palace' };
  if (st.wrecked) return { ok: false, why: 'Rebuild it first' };
  if (s.phase === 'night') return { ok: false, why: 'Too late tonight: upgrade tomorrow' }; // repairs and rebuilds wait for the morning too
  const gate = STAND_RANK_GATE[next.level - 1];
  if (s.rank < gate) return { ok: false, why: `Needs Rank ${gate}, ${RANKS[gate - 1].title}` };
  if (s.cash < next.cost) return { ok: false, why: `Needs $${next.cost.toLocaleString('en-US')}` };
  return { ok: true };
}

/** Up a level. `quiet`: a bulk order's upgrade, which gets one headline for the lot (policies.ts). */
export function upgradeStand(s: GameState, plotId = s.selected, quiet = false): boolean {
  if (!canUpgradeStand(s, plotId).ok) return false;
  const ps = s.plots[plotId];
  const next = STAND_LEVELS[ps.stand!.level];
  book(s, 'invested', -next.cost);
  ps.invested += next.cost;
  ps.stand!.level = next.level;
  repostPrice(s, plotId); // Auto-Price follows the new level's ceiling (automation.ts)
  restoreHp(s, plotId); // the new level comes up at full HP (damage.ts)
  if (!quiet) s.news.push(`${PLOT_BY_ID[plotId].name} gets a makeover: say hello to ${next.name}!`);
  scoreCheck(s); // the makeover's invested dip (score.ts)
  return true;
}

export function canBuyBrand(s: GameState): Blocker {
  const next = BRAND_TIERS[s.brandTier];
  if (!next) return { ok: false, why: 'Every tier bought' };
  if (s.rank < next.rank) return { ok: false, why: `Needs Rank ${next.rank}, ${RANKS[next.rank - 1].title}` };
  if (s.cash < next.cost) return { ok: false, why: `Needs $${next.cost.toLocaleString('en-US')}` };
  return { ok: true };
}

export function buyBrand(s: GameState): boolean {
  if (!canBuyBrand(s).ok) return false;
  const next = BRAND_TIERS[s.brandTier];
  book(s, 'marketing', -next.cost);
  s.brandTier = next.tier;
  s.news.push(`${next.name} go up all over town: +${Math.round(next.traffic * 100)}% foot traffic`);
  return true;
}

/**
 * Can this campaign run? At Morning Prep it starts today; during business hours it books for tomorrow and starts at
 * the next open (marketing.ts). Sunny and the Coupon Blitz work the stand's whole district. A booking starting at the
 * open is `prepaid`: its money left when it was booked.
 */
export function canRunCampaign(s: GameState, id: LocalCampaignId, plotId = s.selected, prepaid = false): Blocker {
  if (isDistrictCampaign(id)) return districtBlocker(s, id, plotId);
  const c = CAMPAIGNS[id];
  const ps = s.plots[plotId];
  const st = ps?.stand;
  if (!st || ps.owner !== 'player') return { ok: false, why: 'Pick a stand' };
  const day = campaignDay(s);
  if (day === null) return { ok: false, why: 'Plan campaigns during Morning Prep' };
  if (s.rank < c.rank) return { ok: false, why: `Needs Rank ${c.rank}, ${RANKS[c.rank - 1].title}` };
  if (isWrecked(ps)) return { ok: false, why: ps.busted ? 'Fix it first' : 'Rebuild it first' };
  if (c.maxLevel && st.level > c.maxLevel) return { ok: false, why: `Only for L1–L${c.maxLevel} stands` };
  if (adsBlocked(s, 'player', plotId)) return { ok: false, why: 'Cease-and-Desist: ads count for nothing here' };
  const busy = standCampaignBusy(s, id, plotId, day); // running or booked here; one Free Sample Day across your empire
  if (busy) return { ok: false, why: busy };
  const cost = campaignCost(s, id); // Word of Mouth halves it
  if (cost.cash && !prepaid && s.cash < cost.cash) return { ok: false, why: `Needs $${cost.cash}` };
  if (cost.samples && day === s.day && cupsInStock(s, plotId) < cost.samples) return { ok: false, why: `Needs stock for ${cost.samples} cups` };
  return { ok: true };
}

export function runCampaign(s: GameState, id: LocalCampaignId, plotId = s.selected): boolean {
  if (!canRunCampaign(s, id, plotId).ok) return false;
  if (isDistrictCampaign(id) || s.phase === 'open') return planCampaign(s, id, plotId); // a district's day, or tomorrow's booking
  const cost = campaignCost(s, id);
  if (cost.cash) book(s, 'marketing', -cost.cash);
  startCampaign(s, id, plotId);
  return true;
}

/** A stand's campaign starts (Morning Prep, or a booking at the open): its free cups come out of stock and its star lands. */
export function startCampaign(s: GameState, id: CampaignId, plotId: string): void {
  const c = CAMPAIGNS[id];
  const st = s.plots[plotId].stand!;
  const cost = campaignCost(s, id);
  if (cost.samples) {
    const n = pitcherNeeds(st);
    const pitchers = Math.ceil(cost.samples / CUPS_PER_PITCHER);
    useLemons(st, n.lemons * pitchers);
    st.inventory.sugar = Math.max(0, st.inventory.sugar - n.sugar * pitchers);
    st.inventory.ice = Math.max(0, st.inventory.ice - n.icePerCup * cost.samples);
    book(s, 'marketing', -CUP_COST * cost.samples, cost.samples); // the samples' cups; their lemonade comes out of stock
    useStock(s, (costPerCup(s, st) - CUP_COST - RECIPES[st.recipe].extraPerCup) * cost.samples, false, 'marketing'); // a cost of the campaign, not of Supplies
  }
  if (c.reputation) s.reputation = clamp(Math.round((s.reputation + c.reputation) * 1e4) / 1e4, 1, 5); // Reputation keeps four decimals
  st.campaigns[id] = campaignDays(s, c.days); // Long Run: 50% more days (perks.ts)
}

// ---------- Lottie's Goals ----------

export interface Goal {
  text: string;
  progress: number;
  done: boolean;
  story?: boolean; // a story goal: it wears the page icon
  slot?: GoalSlot;
  reward?: number; // what Lottie pays when she ticks it off
}

/** Lottie's 3 goals, short, medium and long (src/sim/goals.ts). */
export function lottieGoals(s: GameState): Goal[] {
  return goalsNow(s);
}

export function isGameState(x: unknown): x is GameState {
  const s = x as GameState;
  return !!s && typeof s === 'object' && s.version === SAVE_VERSION && typeof s.cash === 'number' && !!s.plots && !!s.today;
}

/** Saves migrate forward so long runs survive updates. Returns null for anything unreadable. */
export function migrateSave(x: unknown): GameState | null {
  const s = migrateLegacy(x) as GameState; // v1 to v6 step up to v7 first (legacy.ts)
  if (!s || typeof s !== 'object' || typeof s.cash !== 'number' || !s.plots || !s.today) return null;
  if (s.version === 7) { // v8: modes and difficulty; older runs carry on as a Classic campaign
    s.settings = defaultSettings();
    s.peakDay = s.day;
    s.version = 8;
  }
  migrateDamage(s); // building HP and queued repairs (damage.ts)
  migrateCombat(s);
  migrateDemand(s);
  if (s.version === SAVE_VERSION) migrateNights(s); // real-time nights: the alert feed and the raid clock
  if (!isGameState(s)) return null;
  migrateRivals(s);
  migrateCrew(s);
  migrateLand(s);
  migrateWorld(s);
  migrateStory(s);
  return s;
}
