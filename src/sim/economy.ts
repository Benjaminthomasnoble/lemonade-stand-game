// Deterministic, tick-based economy (spec section 25: 1 tick = 1 game
// minute, all randomness from a per-run seed). Pure data + functions:
// no DOM or three.js, so it runs the same in the browser, Vitest and Node.
// Covers every stand on the Citrine Bay map: the player's and the rivals'.
import { nextRandom, randomRange } from './rng.ts';
import {
  BRAND_TIERS, BUILDING_VALUE_SHARE, CAMPAIGNS, CLOSE, CUP_COST, CUPS_PER_PITCHER,
  DAWN, FACTIONS, FORECAST_ACCURACY, HIRE_RANK, HOURLY_TRAFFIC, LAND_DEVELOPMENT_MAX, MARKET_SWING, NIGHT_END, OPEN,
  RANKS, RECIPES, repMultiplier, SEASON_DAYS, SEASON_TEMP_SHIFT, SEASON_WEATHER,
  SEASONS, STAND_LEVELS, STAND_RANK_GATE, START, SUPPLIES, WEATHER,
  type CampaignId, type RecipeId, type RivalId, type Season, type SegmentId, type StandLevel, type SupplyId, type Sweetness,
  type WeatherKind,
} from './balance.ts';
import { cardFit, migrateWorld, seasonDemand, type WorldState } from './recipes.ts';
import { calendarTraffic, festivalCrowd, worldAtClose, worldAtDawn } from './calendar.ts';
import { eventsOnTheClock, eventTraffic, eventWeather } from './events.ts';
import { iceMachineOn, kidStandSale, machineIce } from './happenings.ts';
import { bottleValue, groveTraffic, pickupsAt, pickupsAtClose, vipAtDawn, type Facility, type Order, type OrderTier } from './vip.ts';
import { familySilver, FIZZCO_PLANT, rivalsBankrupt, seedRivalFacilities, trackOutselling } from './rivals.ts';
import { migrateRivals, openBooks, rivalDawn, stockCups, tookCustomer, type Budget, type TradeBooks } from './rivalAi.ts';
import { adBlitzBoost, ceaseAndDesistCut, ceaseAndDesistIn, landFrozen, schemesAtDawn, type Scheme } from './schemes.ts';
import { crewAtDawn, isSpoiled, migrateCrew, NO_DEFENSE, planNight, refreshRecruits, resolveNight, seedRivalDefenses, type BattleReport, type Guard, type Raid } from './crew.ts';
import type { GadgetId } from './balance.ts';
import type { Scouted } from './scouting.ts';
import { DISTRICTS, LOTTIES_CORNER, PLOT_BY_ID, PLOTS, type DistrictId, type FactionId, type Plot } from './map.ts';
import { checkVictory, defaultSettings, fortunesAtDawn, gameOver, type Loan, type Outcome, type Settings, type Tally } from './modes.ts';
import { COMBAT_RULES, migrateCombat } from './combat.ts';
import { damageAtClose, damageAtDawn, migrateDamage, restoreHp, stormAtOpen, type Repair } from './damage.ts'; // hpCapacity: demand's pourRate
import { migrateNights, nightsAtDawn, nightStep, onTheClock, runNight } from './night.ts';
import { migrateLegacy } from './legacy.ts';
import { isMajor, type Alert } from './alerts.ts';
import {
  campaignCost, ceilingFor, chooseOn, curbAppeal, dailyService, dayMixOn, drainQueue, drawSegment, expectedDemand, joinsLine, lunchRush,
  migrateDemand, perkTraffic, priceCeiling, segmentPriceFit, serviceLeft, stopOdds, streetAt, touristPays, type Street,
} from './demand.ts';
import { migrateStory, storyAtClose, storyAtDawn, storyAtStart, storyMinute, taught, type StoryState } from './story.ts';
import { goalsNow, type GoalSlot, type GoalState } from './goals.ts';
import type { SceneState } from './scenes.ts';
import type { PhoneState } from './phone.ts';
import type { LiveFight } from './fight.ts';
import { closeTills } from './loot.ts';
import {
  announceControl, development, isPurchasable, landAtDawn, majorityDiscount, migrateLand, reachBlocker, type ControlTier, type PerkId,
} from './land.ts';
import type { Auction } from './auction.ts';

export * from './balance.ts';
export * from './map.ts';
export * from './crew.ts';
export * from './vip.ts';
export * from './rivals.ts';
export * from './modes.ts';
export * from './night.ts';
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
  autoRestock: boolean;
  day: StandDay;
  hp?: number; // HP left after a raid dented it (damage.ts): missing means full, a Wrecked stand has 0
  wrecked?: boolean; // smashed in a raid: closed until rebuilt
  lastProfit?: number; // its last full business day's profit: what a Shakedown takes (loot.ts)
  spoiledDay?: number; // a Sabotage spoiled the stock: no sales this day
}

export interface PlotState {
  owner: FactionId | null;
  stand: Stand | null;
  invested: number; // building money sunk into this plot
  landValue: number;
  defense: Defense;
  garrison?: number; // rival henchmen on guard here
  facility?: Facility; // Bottling Works, Helipad or Pier
  repair?: Repair; // a Damaged building's repair: paid on approval, done by dawn (damage.ts)
  noAutoRepair?: boolean; // Auto-Repair (Rank 3) skips this plot of yours (damage.ts)
  dibs?: { who: FactionId; until: number; price?: number; table?: boolean }; // First Dibs after a smash or a Fire Sale: only they can buy until this day
  wreckedDay?: number; // day the stand or facility here was smashed
  smashedBy?: FactionId;
  smashes?: number[]; // days this plot was smashed (rebuild chance drops for each in the last 7 days)
  busted?: boolean; // Laid Back: the player's building is closed until a repair, never lost
  auction?: Auction; // a 24-hour sealed-bid auction is open on this plot
}

export interface Defense {
  tier: number;
  fenceHp: number;
  gadgets: GadgetId[];
  slickSprung?: boolean; // the Lemon-Peel Slick went off and waits for its nightly reset
  repairs?: number; // raids since the fence was last repaired: each costs the tier's flat repair overnight
}

export interface RivalState {
  cash: number;
  brandTier: number;
  grudge: number; // toward the player, 0..100
  attention: number;
  peakPlots: number;
  alive: boolean;
  respectUntil: number; // won't raid the player before this day
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
  rush?: number; // the Blenders: the night of their last Blender Rush on you (Brock phones first)
}

export interface DayStats {
  day: number;
  weather: Weather;
  passersby: number;
  customers: number;
  walkedPast: Record<WalkReason, number>;
  revenue: number;
  supplies: number; // bought today
  cupCosts: number;
  upkeep: number;
  tax: number;
  land: number; // land and buildings bought today
  iceMelted: number;
  lemonsSpoiled: number;
  satisfaction: number; // average 0..1 over customers
  reputationBefore: number;
  reputationAfter: number;
  scoreBefore: number;
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
  story?: StoryState; // the campaign's act (src/sim/story.ts)
  scenes?: SceneState; // story scenes queued, playing and seen
  phone?: PhoneState; // boss calls waiting, and the moods they watch
  goals?: GoalState; // what Lottie's goal card shows and has ticked off
  fight?: LiveFight; // the fight playing live right now (fight.ts)
  control?: Partial<Record<DistrictId, ControlTier>>; // each district's control tier at the last check (for the headlines)
  perksLost?: PerkId[]; // Full Control perks that switched off and aren't back yet
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

function pick<T extends string>(rng: Rng, weights: Partial<Record<T, number>>): T {
  const entries = Object.entries(weights) as [T, number][];
  let r = nextRandom(rng) * entries.reduce((a, [, w]) => a + w, 0);
  for (const [k, w] of entries) { r -= w; if (r <= 0) return k; }
  return entries[entries.length - 1][0];
}

export function seasonOf(day: number): Season {
  return SEASONS[Math.floor((day - 1) / SEASON_DAYS) % SEASONS.length];
}
export function seasonDay(day: number): number {
  return ((day - 1) % SEASON_DAYS) + 1;
}

function rollWeather(rng: Rng, season: Season): Weather {
  const kind = pick(rng, SEASON_WEATHER[season]);
  const [lo, hi] = WEATHER[kind].temp;
  const shift = kind === 'scorcher' || kind === 'hot' ? 0 : SEASON_TEMP_SHIFT[season];
  return { kind, temp: Math.round(randomRange(rng, lo, hi)) + shift };
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
    upkeep: 0, tax: 0, land: 0, iceMelted: 0, lemonsSpoiled: 0, satisfaction: 0, reputationBefore: s.reputation,
    reputationAfter: s.reputation, scoreBefore: successScore(s),
  };
}

export function newStand(level = 1, price = STAND_LEVELS[level - 1].topPrice): Stand {
  return {
    level, inventory: { lemons: [], sugar: 0, ice: 0, sugarCost: 0, iceCost: 0 }, recipe: 'classic', sweetness: 'classic',
    price, pitcherCups: 0, queue: 0, campaigns: {}, autoRestock: false, day: emptyStandDay(),
  };
}

function investedFor(level: number): number {
  return STAND_LEVELS.slice(0, level).reduce((a, l) => a + l.cost, 0);
}

/** Rivals start with their home turf and a foothold in Old Town. */
function seedRivals(s: GameState, rng: Rng): void {
  for (const id of RIVAL_IDS) {
    const f = FACTIONS[id];
    s.rivals[id] = { cash: f.startCash, brandTier: id === 'fizzco' ? 2 : 1, grudge: 0, attention: 0, peakPlots: 0, alive: true, respectUntil: 0 };
    const home = PLOTS.filter((p) => p.district === f.home);
    const hq = home.find((p) => p.type === 'hq');
    if (hq) s.plots[hq.id] = { owner: id, stand: null, invested: 0, landValue: hq.baseLand, defense: NO_DEFENSE() };
    const street = home.filter((p) => ['street', 'prime', 'landmark', 'field'].includes(p.type));
    const take = Math.round(street.length * f.homeShare);
    const order = street.map((p) => ({ p, k: nextRandom(rng) })).sort((a, b) => a.k - b.k).map((x) => x.p);
    for (const p of order.slice(0, take)) placeRivalStand(s, id, p, rng);
    const oldTown = PLOTS.filter((p) => p.district === 'oldtown' && p.type === 'street' && !s.plots[p.id].owner);
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
    if (owner && (p.type === 'field' || p.type === 'dock' || p.id === FIZZCO_PLANT) && !s.plots[p.id].owner) {
      s.plots[p.id] = { owner, stand: null, invested: 0, landValue: p.baseLand, defense: NO_DEFENSE() };
    }
  }
  for (const id of RIVAL_IDS) s.rivals[id].peakPlots = ownedPlots(s, id).length;
  for (const id of RIVAL_IDS) openBooks(s, id);
}

function placeRivalStand(s: GameState, id: RivalId, p: Plot, rng: Rng): void {
  const f = FACTIONS[id];
  void rng;
  // Spec: rivals start at L2 (The Groves L1; Downtown and Hilltop L3), +1 on Prime and Landmark, capped per faction.
  const base = p.district === 'groves' ? 1 : p.district === 'downtown' || p.district === 'hilltop' ? 3 : 2;
  const level = p.type === 'field' ? 0 : clamp(base + (p.type === 'prime' || p.type === 'landmark' ? 1 : 0), 1, f.maxLevel);
  const stand = level ? newStand(level, rivalPrice(id, level, p)) : null;
  s.plots[p.id] = { owner: id, stand, invested: level ? investedFor(level) : 0, landValue: p.baseLand, defense: NO_DEFENSE() };
}

/** A rival's everyday price: its stand's ceiling (the same formula as yours), nudged by personality (FACTIONS.price). */
export function rivalPrice(id: RivalId, level: number, p: Plot): number {
  return round2(ceilingFor(level, p.district, 'classic') * FACTIONS[id].price);
}

export function newGame(seed = Date.now() & 0x7fffffff, settings: Partial<Settings> = {}): GameState {
  const rng = { seed };
  const forecast = rollWeather(rng, 'summer');
  const market = rollMarket(rng);
  const s: GameState = {
    version: SAVE_VERSION, seed: 0, day: 1, minute: DAWN, phase: 'prep',
    cash: START.cash, reputation: START.reputation, rank: 1, brandTier: 0, market, forecast, weather: forecast,
    plots: {}, rivals: {} as Record<RivalId, RivalState>, spawnCarry: {}, selected: LOTTIES_CORNER,
    today: undefined as unknown as DayStats, history: [], peakScore: 0, lifetimeCups: 0, news: [],
    guards: [], recruits: [], nextId: 1, raids: [], battles: [], respectFromPlayer: {},
    bottles: 0, offers: [], orders: [], settings: defaultSettings(settings), peakDay: 1,
    combatRules: COMBAT_RULES,
  };
  for (const p of PLOTS) s.plots[p.id] = { owner: null, stand: null, invested: 0, landValue: p.baseLand, defense: NO_DEFENSE() };
  s.plots[LOTTIES_CORNER] = { owner: 'player', stand: newStand(START.standLevel), invested: STAND_LEVELS[0].cost, landValue: START.landValue, defense: NO_DEFENSE() };
  s.plots[LOTTIES_CORNER].stand!.price = priceCeiling(s, LOTTIES_CORNER); // the sweet spot (spec: Pricing)
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

/** Packs of a supply the player could buy for a stand right now (cash and storage). */
export function maxPacks(s: GameState, st: Stand, id: SupplyId): number {
  const sp = SUPPLIES[id];
  const room = Math.floor((standLevel(st).storage[id] - stock(st, id)) / sp.pack);
  const afford = Math.floor((s.cash + 1e-9) / (sp.pack * s.market[id]));
  return Math.max(0, Math.min(room, afford));
}

export function buySupply(s: GameState, id: SupplyId, packs = 1, st: Stand = selectedStand(s)): boolean {
  if (s.phase === 'report' || s.phase === 'night' || packs <= 0 || packs > maxPacks(s, st, id)) return false;
  const qty = SUPPLIES[id].pack * packs;
  const unit = s.market[id];
  const cost = round2(qty * unit);
  s.cash = round2(s.cash - cost);
  s.today.supplies = round2(s.today.supplies + cost);
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

/** Cups a stand could still pour with current stock (ignores ice). */
export function servingsAvailable(st: Stand): number {
  const n = pitcherNeeds(st);
  const pitchers = Math.min(Math.floor(stock(st, 'lemons') / n.lemons), n.sugar > 0 ? Math.floor(st.inventory.sugar / n.sugar) : Infinity);
  return st.pitcherCups + pitchers * CUPS_PER_PITCHER;
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
  return owner === 'player' ? s.reputation : 3;
}

/** How a customer of a segment feels about a stand today (spec: appeal = curb appeal x recipe match x price fit x Reputation). */
export function appealFor(s: GameState, plotId: string, seg: SegmentId, w: Weather = s.weather): Appeal {
  const ps = s.plots[plotId];
  const st = ps.stand!;
  const ceiling = priceCeiling(s, plotId, st);
  const priceFit = segmentPriceFit(plotId, seg, st.price, ceiling);
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

/**
 * The marketing number: every traffic bonus adds into one number that multiplies the plot's traffic (spec: How
 * marketing stacks): brand tier, Lemon Groves, the calendar (Taste-Off wins, sponsorships), district perks, campaigns.
 */
export function marketingMultiplier(s: GameState, owner: FactionId, st?: Stand, plotId?: string): number {
  const tier = owner === 'player' ? s.brandTier : s.rivals[owner]?.brandTier ?? 0;
  let m = 1 + (tier ? BRAND_TIERS[tier - 1].traffic : 0) + (owner === 'player' ? groveTraffic(s) : 0) + calendarTraffic(s, owner, st);
  m += perkTraffic(s, owner, plotId); // Town Favorite, Orchard Fresh
  if (st) for (const [id, days] of Object.entries(st.campaigns) as [CampaignId, number][]) if (days > 0) m += CAMPAIGNS[id].traffic;
  m -= ceaseAndDesistCut(s, owner, st); // FizzCo's Cease-and-Desist: your tier bonus and campaigns count for nothing in its district
  m += adBlitzBoost(s, owner, st); // FizzCo's ad blitz: its mascot works one district
  return m;
}

export function expectedPassersby(s: GameState, plotId: string, w: Weather = s.weather): number {
  const ps = s.plots[plotId];
  if (!ps.stand || ps.stand.wrecked || isSpoiled(s, ps)) return 0;
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
  const rng = { seed: s.seed };
  let weather: Weather;
  if (nextRandom(rng) < FORECAST_ACCURACY) {
    weather = { kind: s.forecast.kind, temp: s.forecast.temp + Math.round(randomRange(rng, -2, 2)) };
  } else {
    weather = rollWeather(rng, seasonOf(s.day));
  }
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
    if (s.plots[p.id].owner === 'player' && st.autoRestock && taught(s, 'market')) autoRestock(s, p.id); // the Market's lesson (Day 3)
  }
  return true;
}
/** Older name kept for tests and tools. */
export const openStand = openStands;

export function autoRestock(s: GameState, plotId: string): void {
  const st = s.plots[plotId].stand!;
  const want = Math.ceil(expectedCups(s, plotId) * 1.2);
  const n = pitcherNeeds(st);
  const pitchers = Math.ceil(want / CUPS_PER_PITCHER);
  const targets: Record<SupplyId, number> = { lemons: pitchers * n.lemons, sugar: pitchers * n.sugar, ice: iceMachineOn(s, plotId) ? 0 : want * n.icePerCup }; // world: the ice machine
  for (const id of Object.keys(targets) as SupplyId[]) {
    while (stock(st, id) < targets[id] && maxPacks(s, st, id) > 0) buySupply(s, id, 1, st);
  }
}

// Appeal only changes between days (price, level, reputation, weather), so
// cache it for the open day. Cleared whenever the stand opens. Each plot's street
// (which stands a passerby can pick, demand.ts) is kept too. Both are worked out
// again when a stand opens, is wrecked or changes hands mid-day (checked once a
// minute): a table rebuilt on a wrecked plot sells as itself, and a plot that
// changes hands moves the Majority's curb appeal.
interface DayCache {
  appeal: Map<string, Partial<Record<SegmentId, Appeal>>>;
  streets: Map<string, Partial<Record<SegmentId, Street>>>;
  town: { stand: Stand | null; wrecked: boolean; owner: FactionId | null }[];
}
const dayCache = new WeakMap<GameState, DayCache>();
function cacheFor(s: GameState): DayCache {
  let c = dayCache.get(s);
  if (!c) { c = { appeal: new Map(), streets: new Map(), town: [] }; dayCache.set(s, c); }
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
/** Drop the streets and appeal if any stand opened, was wrecked or changed hands since the last minute. */
function holdStreets(s: GameState): void {
  const c = cacheFor(s);
  let moved = c.town.length !== PLOTS.length;
  for (let i = 0; i < PLOTS.length && !moved; i++) {
    const ps = s.plots[PLOTS[i].id], t = c.town[i];
    moved = ps.stand !== t.stand || (ps.stand?.wrecked ?? false) !== t.wrecked || ps.owner !== t.owner;
  }
  if (!moved) return;
  c.streets.clear();
  c.appeal.clear();
  c.town = PLOTS.map((p) => { const ps = s.plots[p.id]; return { stand: ps.stand, wrecked: ps.stand?.wrecked ?? false, owner: ps.owner }; });
}

function serveAt(s: GameState, plotId: string, rng: Rng, a: Appeal, seg: SegmentId): { buys: boolean; reason?: WalkReason; paid?: number } {
  const ps = s.plots[plotId];
  const st = ps.stand!;
  const isPlayer = ps.owner === 'player';
  // Over the ceiling, the buyers lost to price walk off "too pricey"; the rest simply aren't thirsty.
  const roll = nextRandom(rng);
  if (roll >= a.stopChance) return { buys: false, reason: roll < a.wouldStop ? 'pricey' : 'notThirsty' };
  // A buyer joins the line only if the people ahead are within their patience; it moves at the pour rate.
  // The day's pours stop at cups/hour × 10 (service); past that, everyone finds the line too long too.
  // A Damaged stand pours its HP share (pourRate, damage.ts), so its line moves slower and its day ends sooner.
  if (!joinsLine(st, seg) || serviceLeft(s, plotId) <= 0) return { buys: false, reason: 'line' };
  if (!isPlayer && st.day.customers >= stockCups(st)) return { buys: false, reason: 'soldOut' }; // a rival sells one full stock a day
  if (isPlayer) {
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
  const paid = round2(st.price * touristPays(s, plotId, seg)); // Tourist Trap: tourists pay +20%
  let warm = false;
  let cupCost = CUP_COST;
  if (isPlayer) {
    const ice = RECIPES[st.recipe].icePerCup;
    cupCost += machineIce(s, plotId, st, ice); // world: an L4+ stand's ice machine makes what the cooler lacks
    warm = st.inventory.ice < ice;
    st.inventory.ice = Math.max(0, st.inventory.ice - ice);
    cupCost += RECIPES[st.recipe].extraPerCup;
  } else {
    cupCost = costPerCup(s, st); // rivals buy as they pour, at today's Market prices (the cup included)
  }
  // world: the card and the Sweetness dial win customers through appeal, never Reputation (spec: Reputation).
  const sat = clamp(0.55 + 0.4 * (a.fairPrice - st.price) / a.fairPrice - (warm ? 0.35 : 0), 0, 1);
  const d = st.day;
  d.satisfaction = (d.satisfaction * d.customers + sat) / (d.customers + 1);
  d.customers++;
  d.revenue = round2(d.revenue + paid);
  d.cupCosts = round2(d.cupCosts + cupCost);
  if (isPlayer) {
    s.cash = round2(s.cash + paid - cupCost);
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
    if (s.minute >= NIGHT_END && sleepUntilDawn(s)) night.push({ type: 'dawn' });
    return night;
  }
  if (s.phase !== 'open') return [];
  const events: SimEvent[] = [];
  const rng = { seed: s.seed };
  const hourIdx = Math.floor((s.minute - OPEN) / 60);
  holdStreets(s);
  for (const p of PLOTS) {
    const ps = s.plots[p.id];
    if (!ps.stand || ps.stand.wrecked || isSpoiled(s, ps)) continue;
    drainQueue(s, p.id);
    const perMinute = (expectedPassersby(s, p.id) * HOURLY_TRAFFIC[hourIdx] * lunchRush(s, p.id, 8 + hourIdx)) / HOURLY_SUM / 60;
    let carry = (s.spawnCarry[p.id] ?? 0) + perMinute * randomRange(rng, 0.2, 1.8);
    while (carry >= 1) {
      carry -= 1;
      events.push(passerby(s, p, rng, hourIdx));
    }
    s.spawnCarry[p.id] = carry;
  }
  s.seed = rng.seed;
  for (const pk of pickupsAt(s)) events.push({ type: 'pickup', ...pk });
  s.minute++;
  events.push(...onTheClock(s, events)); // daytime raids are warned and fought on the clock; calls land in the feed
  storyMinute(s);
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
  return { type: 'passerby', plot: p.id, at: chosen, segment: seg, buys: result.buys, reason: result.reason, price: result.paid ?? s.plots[chosen].stand!.price, owner: chosenOwner };
}

function closeDay(s: GameState): void {
  const t = s.today;
  let satSum = 0, satN = 0, revenue = 0, cupCosts = 0;
  for (const p of PLOTS) {
    const ps = s.plots[p.id];
    const st = ps.stand;
    if (ps.owner === 'player') {
      if (st) {
        t.upkeep += standLevel(st).upkeep;
        if (!iceMachineOn(s, p.id)) { // world: an ice machine keeps its ice (a Power Outage's leftovers melt)
          t.iceMelted += st.inventory.ice;
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
  s.cash = round2(s.cash - t.upkeep - t.tax);
  let rep = s.reputation;
  if (satN > 0) rep += (1 + 4 * t.satisfaction - rep) * Math.min(0.25, satN / 400);
  rep -= Math.min(0.15, t.walkedPast.soldOut * 0.004) + Math.min(0.1, t.walkedPast.line * 0.002);
  s.reputation = clamp(Math.round(rep * 100) / 100, 1, 5);
  t.reputationAfter = s.reputation;
  worldAtClose(s); // world: judge today's Taste-Off
  s.history.push(t);
  if (s.history.length > 60) s.history.shift();
  const score = successScore(s);
  if (score > s.peakScore) { s.peakScore = score; s.peakDay = s.day; }
  trackOutselling(s);
  checkRank(s);
  damageAtClose(s); // rivals book their repairs at closing, like you (damage.ts)
  s.phase = 'report';
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
  let spoiled = 0;
  for (const p of playerStands(s)) {
    const st = s.plots[p.id].stand!;
    st.inventory.lemons = st.inventory.lemons.filter((b) => {
      const bad = s.day - b.day >= (SUPPLIES.lemons.spoilDays ?? 99);
      if (bad) spoiled += b.qty;
      return !bad;
    });
    for (const id of Object.keys(st.campaigns) as CampaignId[]) {
      const left = (st.campaigns[id] ?? 0) - 1;
      if (left > 0) st.campaigns[id] = left; else delete st.campaigns[id];
    }
  }
  s.forecast = rollWeather(rng, seasonOf(s.day));
  s.market = rollMarket(rng);
  s.seed = rng.seed;
  updateLandValues(s);
  rivalsAtDawn(s);
  schemesAtDawn(s);
  s.weather = s.forecast;
  s.phase = 'prep';
  s.today = emptyStats(s);
  s.today.lemonsSpoiled = spoiled;
  landAtDawn(s);
  crewAtDawn(s);
  rivalsBankrupt(s);
  worldAtDawn(s);
  vipAtDawn(s);
  fortunesAtDawn(s);
  nightsAtDawn(s);
  storyAtDawn(s);
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
  return st.inventory.lemons.filter((b) => s.day + 1 - b.day >= (SUPPLIES.lemons.spoilDays ?? 99)).reduce((a, b) => a + b.qty, 0);
}

// ---------- land ----------

/** Land rises with development (more and bigger stands in a district), up to ×2 base. HQ land rises with its district too. */
function updateLandValues(s: GameState): void {
  for (const d of DISTRICTS) {
    const dev = development(s, d.id);
    for (const p of PLOTS) if (p.district === d.id && p.type !== 'civic') s.plots[p.id].landValue = Math.round(p.baseLand * (1 + (LAND_DEVELOPMENT_MAX - 1) * dev));
  }
  s.plots[LOTTIES_CORNER].landValue = Math.max(s.plots[LOTTIES_CORNER].landValue, START.landValue);
}

export type Blocker = { ok: true } | { ok: false; why: string };

/** A Foothold: at least one purchasable plot in the district (a Trophy HQ on its own doesn't count). */
export function hasFoothold(s: GameState, owner: FactionId, d: DistrictId): boolean {
  return PLOTS.some((p) => p.district === d && isPurchasable(p) && s.plots[p.id].owner === owner);
}

export function canBuyPlot(s: GameState, plotId: string): Blocker {
  const p = PLOT_BY_ID[plotId];
  const ps = s.plots[plotId];
  if (p.type === 'civic') return { ok: false, why: 'Civic land is not for sale' };
  if (p.type === 'hq') return { ok: false, why: 'HQs are captured, never bought' };
  if (ps.owner === 'player') return { ok: false, why: 'You own it' };
  if (ps.owner) return { ok: false, why: `Owned by ${FACTIONS[ps.owner as RivalId].name}` };
  if (landFrozen(s, plotId)) return { ok: false, why: 'Town Hall froze this sale' }; // Sourwood's Old Money
  if (ps.auction) return { ok: false, why: 'Up for auction: bid instead' };
  if (ps.dibs && ps.dibs.who !== 'player') return { ok: false, why: 'Someone else has First Dibs today' };
  if (s.phase === 'open') return { ok: false, why: 'Buy land during Morning Prep' };
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
  return Math.round(base * majorityDiscount(s, PLOT_BY_ID[plotId].district) * familySilver(s));
}

export function buyPlot(s: GameState, plotId: string): boolean {
  if (!canBuyPlot(s, plotId).ok) return false;
  const ps = s.plots[plotId];
  const price = plotPrice(s, plotId);
  s.cash = round2(s.cash - price);
  s.today.land = round2(s.today.land + price);
  ps.owner = 'player';
  if (ps.dibs?.table && !ps.stand) { ps.stand = newStand(1); ps.stand.price = priceCeiling(s, plotId); ps.invested += STAND_LEVELS[0].cost; }
  delete ps.dibs;
  s.news.push(`Skip Larkin: "Congratulations, you now own ${PLOT_BY_ID[plotId].name}!"`);
  announceControl(s);
  checkVictory(s);
  return true;
}

export function canBuildStand(s: GameState, plotId: string): Blocker {
  const p = PLOT_BY_ID[plotId];
  const ps = s.plots[plotId];
  if (ps.owner !== 'player') return { ok: false, why: 'Buy the plot first' };
  if (ps.stand) return { ok: false, why: 'There is already a stand here' };
  if (p.type === 'field' || p.type === 'dock') return { ok: false, why: `${p.type === 'field' ? 'Fields hold helipads' : 'Docks hold piers'}, not stands` };
  if (ps.facility) return { ok: false, why: 'A facility is built here' };
  if (s.phase !== 'prep') return { ok: false, why: 'Build during Morning Prep' };
  if (s.cash < STAND_LEVELS[0].cost) return { ok: false, why: `Needs $${STAND_LEVELS[0].cost}` };
  return { ok: true };
}

export function buildStand(s: GameState, plotId: string): boolean {
  if (!canBuildStand(s, plotId).ok) return false;
  const ps = s.plots[plotId];
  s.cash = round2(s.cash - STAND_LEVELS[0].cost);
  s.today.land = round2(s.today.land + STAND_LEVELS[0].cost);
  ps.stand = newStand(1);
  ps.stand.price = priceCeiling(s, plotId); // a new table opens at its ceiling
  ps.invested += STAND_LEVELS[0].cost;
  s.selected = plotId;
  s.news.push(`A brand-new Folding Table opens at ${PLOT_BY_ID[plotId].name}!`);
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
  return round2(total + (owner === 'player' ? bottleValue(s) : 0)); // world: bottles on hand are stock at cost (vip.ts)
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

function checkRank(s: GameState): void {
  const r = rankFor(successScore(s)).rank;
  if (r > s.rank) {
    const was = s.rank;
    s.rank = r;
    s.news.push(`RANK UP! Lottie's grandkid is now a ${RANKS[r - 1].title}`);
    if (was < HIRE_RANK && r >= HIRE_RANK) refreshRecruits(s, true); // the Hiring Hall opens (Dex comes on Day 6, not with a rank)
  }
}

// ---------- upgrades and marketing (milestone 2) ----------

export function canUpgradeStand(s: GameState, plotId = s.selected): Blocker {
  const st = s.plots[plotId]?.stand;
  if (!st || s.plots[plotId].owner !== 'player') return { ok: false, why: 'Not your stand' };
  const next = STAND_LEVELS[st.level];
  if (!next) return { ok: false, why: 'Already the Citrus Palace' };
  if (st.wrecked) return { ok: false, why: 'Rebuild it first' };
  if (s.phase !== 'prep') return { ok: false, why: 'Upgrade during Morning Prep' };
  const gate = STAND_RANK_GATE[next.level - 1];
  if (s.rank < gate) return { ok: false, why: `Needs Rank ${gate}, ${RANKS[gate - 1].title}` };
  if (s.cash < next.cost) return { ok: false, why: `Needs $${next.cost.toLocaleString('en-US')}` };
  return { ok: true };
}

export function upgradeStand(s: GameState, plotId = s.selected): boolean {
  if (!canUpgradeStand(s, plotId).ok) return false;
  const ps = s.plots[plotId];
  const next = STAND_LEVELS[ps.stand!.level];
  s.cash = round2(s.cash - next.cost);
  s.today.land = round2(s.today.land + next.cost);
  ps.invested += next.cost;
  ps.stand!.level = next.level;
  restoreHp(s, plotId); // the new level comes up at full HP (damage.ts)
  s.news.push(`${PLOT_BY_ID[plotId].name} gets a makeover: say hello to ${next.name}!`);
  checkRank(s);
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
  s.cash = round2(s.cash - next.cost);
  s.brandTier = next.tier;
  s.news.push(`${next.name} go up all over town: +${Math.round(next.traffic * 100)}% foot traffic`);
  return true;
}

export function canRunCampaign(s: GameState, id: CampaignId, plotId = s.selected): Blocker {
  const c = CAMPAIGNS[id];
  const st = s.plots[plotId]?.stand;
  if (!st) return { ok: false, why: 'Pick a stand' };
  if (s.phase !== 'prep') return { ok: false, why: 'Plan campaigns during Morning Prep' };
  if (s.rank < c.rank) return { ok: false, why: `Needs Rank ${c.rank}, ${RANKS[c.rank - 1].title}` };
  if (c.maxLevel && st.level > c.maxLevel) return { ok: false, why: `Only for L1–L${c.maxLevel} stands` };
  if (ceaseAndDesistIn(s, PLOT_BY_ID[plotId].district)) return { ok: false, why: 'Cease-and-Desist: ads count for nothing here' };
  const left = st.campaigns[id] ?? 0;
  if (left > 0) return { ok: false, why: `Running (${left} day${left === 1 ? '' : 's'} left)` };
  const cost = campaignCost(s, id); // Word of Mouth halves it
  if (cost.cash && s.cash < cost.cash) return { ok: false, why: `Needs $${cost.cash}` };
  if (cost.samples && servingsAvailable(st) < cost.samples) return { ok: false, why: `Needs stock for ${cost.samples} cups` };
  return { ok: true };
}

export function runCampaign(s: GameState, id: CampaignId, plotId = s.selected): boolean {
  if (!canRunCampaign(s, id, plotId).ok) return false;
  const c = CAMPAIGNS[id];
  const st = s.plots[plotId].stand!;
  const cost = campaignCost(s, id);
  if (cost.cash) {
    s.cash = round2(s.cash - cost.cash);
    s.today.supplies = round2(s.today.supplies + cost.cash);
  }
  if (cost.samples) {
    const n = pitcherNeeds(st);
    const pitchers = Math.ceil(cost.samples / CUPS_PER_PITCHER);
    useLemons(st, n.lemons * pitchers);
    st.inventory.sugar = Math.max(0, st.inventory.sugar - n.sugar * pitchers);
    st.inventory.ice = Math.max(0, st.inventory.ice - n.icePerCup * cost.samples);
    s.cash = round2(s.cash - CUP_COST * cost.samples);
    s.today.cupCosts = round2(s.today.cupCosts + CUP_COST * cost.samples);
  }
  if (c.reputation) s.reputation = clamp(Math.round((s.reputation + c.reputation) * 100) / 100, 1, 5);
  st.campaigns[id] = c.days;
  return true;
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
