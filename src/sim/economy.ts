// Deterministic, tick-based economy (spec section 25: 1 tick = 1 game
// minute, all randomness from a per-run seed). Pure data + functions:
// no DOM or three.js, so it runs the same in the browser, Vitest and Node.
// Covers every stand on the Citrine Bay map: the player's and the rivals'.
import { nextRandom, randomRange } from './rng.ts';
import {
  AUTO_RESTOCK_DAY, BASE_STOP_CHANCE, BRAND_TIERS, BUILDING_VALUE_SHARE, CAMPAIGNS, CLOSE, CUP_COST, CUPS_PER_PITCHER,
  CURB_APPEAL, DAWN, DISTRICT_RANK, FACTIONS, FORECAST_ACCURACY, HOURLY_TRAFFIC, LAND_DEVELOPMENT_MAX, MARKET_SWING, NIGHT_END, OPEN,
  RANKS, RECIPES, repMultiplier, SEASON_DAYS, SEASON_TEMP_SHIFT, SEASON_WEATHER,
  SEASONS, SEGMENTS, STAND_LEVELS, STAND_RANK_GATE, START, SUPPLIES, WEATHER,
  type CampaignId, type RecipeId, type RivalId, type Season, type SegmentId, type StandLevel, type SupplyId, type Sweetness,
  type WeatherKind,
} from './balance.ts';
import { cardFit, migrateWorld, seasonDemand, type WorldState } from './recipes.ts';
import { calendarTraffic, festivalCrowd, worldAtClose, worldAtDawn } from './calendar.ts';
import { groveTraffic, pickupsAt, pickupsAtClose, vipAtDawn, type Facility, type Order, type OrderTier } from './vip.ts';
import { familySilver, rivalsBankrupt, seedRivalFacilities, trackOutselling } from './rivals.ts';
import { migrateRivals, openBooks, rivalDawn, stockCups, tookCustomer, type Budget, type TradeBooks } from './rivalAi.ts';
import { crewAtDawn, NO_DEFENSE, planNight, resolveNight, seedRivalDefenses, welcomeDex, type BattleReport, type Guard, type Raid } from './crew.ts';
import type { GadgetId } from './balance.ts';
import { BORDERS, DISTRICT_BY_ID, DISTRICTS, LOTTIES_CORNER, nearbyPlots, PLOT_BY_ID, PLOTS, type DistrictId, type FactionId, type Plot } from './map.ts';
import { checkVictory, defaultSettings, fortunesAtDawn, gameOver, type Loan, type Outcome, type Settings, type Tally } from './modes.ts';
import { COMBAT_RULES, migrateCombat } from './combat.ts';
import { migrateNights, nightsAtDawn, nightStep, onTheClock, runNight } from './night.ts';
import { isMajor, type Alert } from './alerts.ts';

export * from './balance.ts';
export * from './map.ts';
export * from './crew.ts';
export * from './vip.ts';
export * from './rivals.ts';
export * from './modes.ts';
export * from './night.ts';
export * from './alerts.ts';
export * from './recipes.ts';
export * from './calendar.ts';
export * from './rivalAi.ts';
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
  servedThisHour: number;
  campaigns: Partial<Record<CampaignId, number>>; // days left
  autoRestock: boolean;
  day: StandDay;
  wrecked?: boolean; // smashed in a raid: closed until rebuilt
}

export interface PlotState {
  owner: FactionId | null;
  stand: Stand | null;
  invested: number; // building money sunk into this plot
  landValue: number;
  defense: Defense;
  garrison?: number; // rival henchmen on guard here
  facility?: Facility; // Bottling Works, Helipad or Pier
  dibs?: { who: FactionId; until: number; price?: number; table?: boolean }; // First Dibs after a smash or a Fire Sale: only they can buy until this day
  wreckedDay?: number; // day the stand or facility here was smashed
  smashedBy?: FactionId;
  smashes?: number[]; // days this plot was smashed (rebuild chance drops for each in the last 7 days)
  busted?: boolean; // Laid Back: the player's building is closed until a repair, never lost
}

export interface Defense { tier: number; fenceHp: number; gadgets: GadgetId[] }

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
  clubhouse: number; // 0..3
  nextId: number;
  raids: Raid[]; // planned for tonight (theirs and yours)
  battles: BattleReport[]; // most recent first
  respectFromPlayer: Partial<Record<RivalId, number>>;
  bottles: number;
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
}

export type SimEvent =
  | { type: 'passerby'; plot: string; at: string; segment: SegmentId; buys: boolean; reason?: WalkReason; price: number; owner: FactionId }
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

export function newStand(level = 1, price = 0.75): Stand {
  return {
    level, inventory: { lemons: [], sugar: 0, ice: 0, sugarCost: 0, iceCost: 0 }, recipe: 'classic', sweetness: 'classic',
    price, pitcherCups: 0, servedThisHour: 0, campaigns: {}, autoRestock: false, day: emptyStandDay(),
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
  // Groves fields, FizzCo the Harbor docks, Sourwood Hilltop's polo lawn and marina.
  const holder: Partial<Record<string, RivalId>> = { groves: 'hollis', harbor: 'fizzco', hilltop: 'sourwood' };
  for (const p of PLOTS) {
    const owner = holder[p.district];
    if (owner && (p.type === 'field' || p.type === 'dock') && !s.plots[p.id].owner) {
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

export function rivalPrice(id: RivalId, level: number, p: Plot): number {
  const d = DISTRICT_BY_ID[p.district];
  return round2(STAND_LEVELS[level - 1].topPrice * 0.45 * FACTIONS[id].price * (d.priceMult ?? 1));
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
    guards: [], recruits: [], clubhouse: 0, nextId: 1, raids: [], battles: [], respectFromPlayer: {},
    bottles: 0, offers: [], orders: [], settings: defaultSettings(settings), peakDay: 1,
    combatRules: COMBAT_RULES,
  };
  for (const p of PLOTS) s.plots[p.id] = { owner: null, stand: null, invested: 0, landValue: p.baseLand, defense: NO_DEFENSE() };
  s.plots[LOTTIES_CORNER] = { owner: 'player', stand: newStand(START.standLevel), invested: STAND_LEVELS[0].cost, landValue: START.landValue, defense: NO_DEFENSE() };
  seedRivals(s, rng);
  seedRivalDefenses(s, rng);
  seedRivalFacilities(s);
  s.seed = rng.seed;
  migrateWorld(s);
  s.today = emptyStats(s);
  s.peakScore = successScore(s);
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

function useLemons(st: Stand, n: number): void {
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
export function setPrice(st: Stand, price: number): void { st.price = clamp(round2(price), 0.05, 20); }

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

export interface Appeal { priceFit: number; recipeMatch: number; sweetMatch: number; appeal: number; stopChance: number; fairPrice: number; topPrice: number }

function ownerReputation(s: GameState, owner: FactionId): number {
  return owner === 'player' ? s.reputation : 3;
}

/** How a customer of a segment feels about a stand today. Shown to the player as odds. */
export function appealFor(s: GameState, plotId: string, seg: SegmentId, w: Weather = s.weather): Appeal {
  const ps = s.plots[plotId];
  const st = ps.stand!;
  const p = PLOT_BY_ID[plotId];
  const g = SEGMENTS[seg];
  const rival = ps.owner !== 'player';
  const r = RECIPES[st.recipe];
  const card = cardFit(s, plotId, seg); // world: where the card shines, the Sweetness dial, the Blender Bar (rivals: 1)
  const districtMult = DISTRICT_BY_ID[p.district].priceMult ?? 1;
  const topPrice = (standLevel(st).topPrice + (rival ? 0 : r.priceBonus)) * card.top * g.priceTolerance * districtMult;
  const fairPrice = topPrice * 0.5;
  const priceFit = st.price <= fairPrice ? 1 + 0.3 * (fairPrice - st.price) / fairPrice : Math.max(0, 1 - (st.price - fairPrice) / (topPrice - fairPrice));
  const recipeMatch = card.match;
  const sweetMatch = card.sweet;
  const appeal = CURB_APPEAL[st.level - 1] * recipeMatch * sweetMatch * priceFit * repMultiplier(ownerReputation(s, ps.owner!));
  const stopChance = clamp(BASE_STOP_CHANCE * WEATHER[w.kind].thirst * appeal, 0, 0.95);
  return { priceFit, recipeMatch, sweetMatch, appeal, stopChance, fairPrice, topPrice };
}

/** Average stop chance across a plot's customer mix. */
export function averageStopChance(s: GameState, plotId: string, w: Weather = s.weather): number {
  const mix = Object.entries(DISTRICT_BY_ID[PLOT_BY_ID[plotId].district].mix) as [SegmentId, number][];
  const total = mix.reduce((a, [, x]) => a + x, 0);
  return mix.reduce((a, [seg, x]) => a + appealFor(s, plotId, seg, w).stopChance * x, 0) / total;
}

export function marketingMultiplier(s: GameState, owner: FactionId, st?: Stand): number {
  const tier = owner === 'player' ? s.brandTier : s.rivals[owner]?.brandTier ?? 0;
  let m = 1 + (tier ? BRAND_TIERS[tier - 1].traffic : 0) + (owner === 'player' ? groveTraffic(s) : 0) + calendarTraffic(s, owner, st);
  if (st) for (const [id, days] of Object.entries(st.campaigns) as [CampaignId, number][]) if (days > 0) m += CAMPAIGNS[id].traffic;
  return m;
}

export function expectedPassersby(s: GameState, plotId: string, w: Weather = s.weather): number {
  const ps = s.plots[plotId];
  if (!ps.stand || ps.stand.wrecked) return 0;
  return PLOT_BY_ID[plotId].baseTraffic * standLevel(ps.stand).draw * marketingMultiplier(s, ps.owner!, ps.stand)
    * seasonDemand(s, plotId) * WEATHER[w.kind].traffic;
}

/** Rough cups a player stand should sell today (for the prep odds and auto-restock). */
export function expectedCups(s: GameState, plotId: string, w: Weather = s.forecast): number {
  const st = s.plots[plotId].stand!;
  const rivals = nearbyPlots(PLOT_BY_ID[plotId]).filter((q) => q.id !== plotId && s.plots[q.id].stand && s.plots[q.id].owner !== 'player').length;
  const share = 1 / (1 + rivals * 0.6);
  return Math.min(Math.round(expectedPassersby(s, plotId, w) * averageStopChance(s, plotId, w) * share), standLevel(st).capacityPerHour * 12);
}

const HOURLY_SUM = HOURLY_TRAFFIC.reduce((a, b) => a + b, 0);

const segTables = new Map<string, { segs: SegmentId[]; cum: number[] }>();
function segmentAt(rng: Rng, district: DistrictId, hour: number): SegmentId {
  const key = district + hour;
  let t = segTables.get(key);
  if (!t) {
    const segs: SegmentId[] = [];
    const cum: number[] = [];
    let total = 0;
    for (const [seg, x] of Object.entries(DISTRICT_BY_ID[district].mix) as [SegmentId, number][]) {
      total += x * (SEGMENTS[seg].peaks.some((p) => Math.abs(p - hour) <= 1) ? 1.8 : 1);
      segs.push(seg);
      cum.push(total);
    }
    t = { segs, cum: cum.map((c) => c / total) };
    segTables.set(key, t);
  }
  const r = nextRandom(rng);
  for (let i = 0; i < t.cum.length; i++) if (r <= t.cum[i]) return t.segs[i];
  return t.segs[t.segs.length - 1];
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
  s.weather = weather;
  s.today.weather = weather;
  s.today.reputationBefore = s.reputation;
  s.phase = 'open';
  s.minute = OPEN;
  s.spawnCarry = {};
  appealCache.delete(s);
  for (const p of PLOTS) {
    const st = s.plots[p.id].stand;
    if (!st) continue;
    st.day = emptyStandDay();
    st.servedThisHour = 0;
    if (s.plots[p.id].owner === 'player' && st.autoRestock && s.day >= AUTO_RESTOCK_DAY) autoRestock(s, p.id);
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
  const targets: Record<SupplyId, number> = { lemons: pitchers * n.lemons, sugar: pitchers * n.sugar, ice: want * n.icePerCup };
  for (const id of Object.keys(targets) as SupplyId[]) {
    while (stock(st, id) < targets[id] && maxPacks(s, st, id) > 0) buySupply(s, id, 1, st);
  }
}

// Appeal only changes between days (price, level, reputation, weather), so
// cache it for the open day. Cleared whenever the stand opens.
const appealCache = new WeakMap<GameState, Map<string, Appeal>>();
function cachedAppeal(s: GameState, plotId: string, seg: SegmentId): Appeal {
  let m = appealCache.get(s);
  if (!m) { m = new Map(); appealCache.set(s, m); }
  const k = plotId + '|' + seg;
  let a = m.get(k);
  if (!a) { a = appealFor(s, plotId, seg); m.set(k, a); }
  return a;
}

function serveAt(s: GameState, plotId: string, rng: Rng, a: Appeal): { buys: boolean; reason?: WalkReason } {
  const ps = s.plots[plotId];
  const st = ps.stand!;
  const isPlayer = ps.owner === 'player';
  if (nextRandom(rng) >= a.stopChance) return { buys: false, reason: a.priceFit < 0.6 ? 'pricey' : 'notThirsty' };
  if (st.servedThisHour >= standLevel(st).capacityPerHour) return { buys: false, reason: 'line' };
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
  st.servedThisHour++;
  let warm = false;
  let cupCost = CUP_COST;
  if (isPlayer) {
    const ice = RECIPES[st.recipe].icePerCup;
    warm = st.inventory.ice < ice;
    st.inventory.ice = Math.max(0, st.inventory.ice - ice);
    cupCost += RECIPES[st.recipe].extraPerCup;
  } else {
    cupCost = costPerCup(s, st); // rivals buy as they pour, at today's Market prices (the cup included)
  }
  const sat = clamp(0.55 + 1.25 * (a.recipeMatch - 1) + (a.sweetMatch - 1) + 0.4 * (a.fairPrice - st.price) / a.fairPrice - (warm ? 0.35 : 0), 0, 1);
  const d = st.day;
  d.satisfaction = (d.satisfaction * d.customers + sat) / (d.customers + 1);
  d.customers++;
  d.revenue = round2(d.revenue + st.price);
  d.cupCosts = round2(d.cupCosts + cupCost);
  if (isPlayer) {
    s.cash = round2(s.cash + st.price - cupCost);
    s.lifetimeCups++;
  } else {
    const r = s.rivals[ps.owner as RivalId];
    r.cash = round2(r.cash + st.price - cupCost);
  }
  return { buys: true };
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
  const newHour = (s.minute - OPEN) % 60 === 0;
  for (const p of PLOTS) {
    const ps = s.plots[p.id];
    if (!ps.stand || ps.stand.wrecked) continue;
    if (newHour) ps.stand.servedThisHour = 0;
    const perMinute = (expectedPassersby(s, p.id) * HOURLY_TRAFFIC[hourIdx]) / HOURLY_SUM / 60;
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
  if (s.minute >= CLOSE) {
    closeDay(s);
    events.push({ type: 'close' });
  }
  return events;
}

/** One person walks past plot p and picks the most appealing stand within 2 plots. */
function passerby(s: GameState, p: Plot, rng: Rng, hourIdx: number): SimEvent {
  const seg = festivalCrowd(s, rng, p.district) ?? segmentAt(rng, p.district, 8 + hourIdx);
  const home = s.plots[p.id];
  home.stand!.day.passersby++;
  const options = nearbyPlots(p).filter((q) => s.plots[q.id].stand && !s.plots[q.id].stand!.wrecked);
  let chosen = p.id;
  let a = cachedAppeal(s, p.id, seg);
  if (options.length > 1) {
    const appeals = options.map((q) => ({ id: q.id, a: q.id === p.id ? a : cachedAppeal(s, q.id, seg) }));
    // The stand they're walking past gets an "it's right here" bonus.
    const weights = appeals.map((x) => x.a.appeal * (x.id === p.id ? 1.6 : 1));
    let r = nextRandom(rng) * weights.reduce((t, w) => t + w, 0);
    for (let i = 0; i < appeals.length; i++) { r -= weights[i]; if (r <= 0) { chosen = appeals[i].id; a = appeals[i].a; break; } }
  }
  const chosenOwner = s.plots[chosen].owner!;
  const result = serveAt(s, chosen, rng, a);
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
  return { type: 'passerby', plot: p.id, at: chosen, segment: seg, buys: result.buys, reason: result.reason, price: s.plots[chosen].stand!.price, owner: chosenOwner };
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
        t.iceMelted += st.inventory.ice;
        st.inventory.ice = 0; // ice never keeps overnight
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
  t.revenue = round2(revenue);
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
  s.phase = 'report';
  planNight(s);
}

/** Sleep till dawn: the rest of the night runs minute by minute (raids hit at their minute), then dawn opens
 * Morning Prep. With stopAtAlerts it stops at the next major alert instead (false: the night isn't over). */
export function sleepUntilDawn(s: GameState, stopAtAlerts = false, events?: SimEvent[]): boolean {
  if ((s.phase !== 'report' && s.phase !== 'night') || gameOver(s)) return false;
  if (!runNight(s, stopAtAlerts, events)) return false;
  resolveNight(s);
  s.day++;
  s.minute = DAWN;
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
  s.weather = s.forecast;
  s.phase = 'prep';
  s.today = emptyStats(s);
  s.today.lemonsSpoiled = spoiled;
  crewAtDawn(s);
  rivalsBankrupt(s);
  worldAtDawn(s);
  vipAtDawn(s);
  fortunesAtDawn(s);
  nightsAtDawn(s);
  if (s.day === AUTO_RESTOCK_DAY) s.news.push('Lottie: "Tired of hauling lemons? Flip on Auto-Restock and I\'ll handle the market runs."');
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

/** Land rises with development (more and bigger stands in a district), up to ×2 base. */
function updateLandValues(s: GameState): void {
  for (const d of DISTRICTS) {
    const plots = PLOTS.filter((p) => p.district === d.id && p.type !== 'civic');
    const levels = plots.reduce((a, p) => a + (s.plots[p.id].stand?.level ?? 0), 0);
    const facilities = plots.reduce((a, p) => a + 2 * (s.plots[p.id].facility?.level ?? 0), 0); // a facility tier counts as 2 stand levels
    const dev = Math.min(1, (levels + facilities) / (plots.length * 4));
    for (const p of plots) s.plots[p.id].landValue = Math.round(p.baseLand * (1 + (LAND_DEVELOPMENT_MAX - 1) * dev));
  }
  s.plots[LOTTIES_CORNER].landValue = Math.max(s.plots[LOTTIES_CORNER].landValue, START.landValue);
}

export type Blocker = { ok: true } | { ok: false; why: string };

export function hasFoothold(s: GameState, owner: FactionId, d: DistrictId): boolean {
  return PLOTS.some((p) => p.district === d && s.plots[p.id].owner === owner);
}

export function canBuyPlot(s: GameState, plotId: string): Blocker {
  const p = PLOT_BY_ID[plotId];
  const ps = s.plots[plotId];
  if (p.type === 'civic') return { ok: false, why: 'Civic land is not for sale' };
  if (p.type === 'hq') return { ok: false, why: 'HQs are captured, never bought' };
  if (ps.owner === 'player') return { ok: false, why: 'You own it' };
  if (ps.owner) return { ok: false, why: `Owned by ${FACTIONS[ps.owner as RivalId].name}` };
  if (ps.dibs && ps.dibs.who !== 'player') return { ok: false, why: 'Someone else has First Dibs today' };
  if (s.phase === 'open') return { ok: false, why: 'Buy land during Morning Prep' };
  const dibs = ps.dibs?.who === 'player' && ps.dibs.until >= s.day;
  // Sandbox: the start district is open from Day 1 and the border rule applies from Rank 2.
  const gate = s.settings.mode === 'sandbox' ? (p.district === 'maple' ? 1 : 2) : DISTRICT_RANK[p.district] ?? 3;
  if (!dibs && s.rank < gate) return { ok: false, why: `Needs Rank ${gate}, ${RANKS[gate - 1].title}` };
  const reachable = p.district === 'maple' || hasFoothold(s, 'player', p.district) || BORDERS[p.district].some((d) => hasFoothold(s, 'player', d));
  if (!reachable && !dibs) return { ok: false, why: 'Get a Foothold in a bordering district first' };
  const price = plotPrice(s, plotId);
  if (s.cash < price) return { ok: false, why: `Needs $${price.toLocaleString('en-US')}` };
  return { ok: true };
}

/** What the player pays for an open plot: land value, or the Fire Sale price while they have First Dibs. */
export function plotPrice(s: GameState, plotId: string): number {
  const ps = s.plots[plotId];
  const base = ps.dibs?.who === 'player' && ps.dibs.until >= s.day && ps.dibs.price !== undefined ? ps.dibs.price : ps.landValue;
  return Math.round(base * familySilver(s));
}

export function buyPlot(s: GameState, plotId: string): boolean {
  if (!canBuyPlot(s, plotId).ok) return false;
  const ps = s.plots[plotId];
  const price = plotPrice(s, plotId);
  s.cash = round2(s.cash - price);
  s.today.land = round2(s.today.land + price);
  ps.owner = 'player';
  if (ps.dibs?.table && !ps.stand) { ps.stand = newStand(1, selectedStand(s).price); ps.invested += STAND_LEVELS[0].cost; }
  delete ps.dibs;
  s.news.push(`Skip Larkin: "Congratulations, you now own ${PLOT_BY_ID[plotId].name}!"`);
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
  ps.stand = newStand(1, selectedStand(s).price);
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
  return round2(total);
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
    s.rank = r;
    s.news.push(`RANK UP! Lottie's grandkid is now a ${RANKS[r - 1].title}`);
    welcomeDex(s);
  }
}

// ---------- upgrades and marketing (milestone 2) ----------

export function canUpgradeStand(s: GameState, plotId = s.selected): Blocker {
  const st = s.plots[plotId]?.stand;
  if (!st || s.plots[plotId].owner !== 'player') return { ok: false, why: 'Not your stand' };
  const next = STAND_LEVELS[st.level];
  if (!next) return { ok: false, why: 'Already the Citrus Palace' };
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
  const left = st.campaigns[id] ?? 0;
  if (left > 0) return { ok: false, why: `Running (${left} day${left === 1 ? '' : 's'} left)` };
  if (c.costPerDay && s.cash < c.costPerDay) return { ok: false, why: `Needs $${c.costPerDay}` };
  if (c.samples && servingsAvailable(st) < c.samples) return { ok: false, why: `Needs stock for ${c.samples} cups` };
  return { ok: true };
}

export function runCampaign(s: GameState, id: CampaignId, plotId = s.selected): boolean {
  if (!canRunCampaign(s, id, plotId).ok) return false;
  const c = CAMPAIGNS[id];
  const st = s.plots[plotId].stand!;
  if (c.costPerDay) {
    s.cash = round2(s.cash - c.costPerDay);
    s.today.supplies = round2(s.today.supplies + c.costPerDay);
  }
  if (c.samples) {
    const n = pitcherNeeds(st);
    const pitchers = Math.ceil(c.samples / CUPS_PER_PITCHER);
    useLemons(st, n.lemons * pitchers);
    st.inventory.sugar = Math.max(0, st.inventory.sugar - n.sugar * pitchers);
    st.inventory.ice = Math.max(0, st.inventory.ice - n.icePerCup * c.samples);
    s.cash = round2(s.cash - CUP_COST * c.samples);
    s.today.cupCosts = round2(s.today.cupCosts + CUP_COST * c.samples);
  }
  if (c.reputation) s.reputation = clamp(Math.round((s.reputation + c.reputation) * 100) / 100, 1, 5);
  st.campaigns[id] = c.days;
  return true;
}

// ---------- Lottie's Goals ----------

export interface Goal { text: string; progress: number; done: boolean }

export function lottieGoals(s: GameState): Goal[] {
  const st = selectedStand(s);
  const stands = playerStands(s).length;
  const short: Goal = servingsAvailable(st) === 0 && s.phase === 'prep'
    ? { text: 'Buy lemons and sugar at the market', progress: 0, done: false }
    : { text: 'Sell 60 cups in one day', progress: Math.min(1, s.today.customers / 60), done: s.today.customers >= 60 };
  const next = STAND_LEVELS[st.level];
  const gate = next ? STAND_RANK_GATE[next.level - 1] : 0;
  const medium: Goal = s.brandTier === 0 && st.level >= 2
    ? { text: `Put up Hand-Painted Signs ($${BRAND_TIERS[0].cost})`, progress: Math.min(1, s.cash / BRAND_TIERS[0].cost), done: false }
    : stands < 2 && st.level >= 2
    ? { text: 'Buy a second plot on Maple Row and open another stand', progress: 0, done: false }
    : next
    ? { text: `Upgrade to ${next.name} ($${next.cost.toLocaleString('en-US')}${s.rank < gate ? `, needs Rank ${gate}` : ''})`, progress: Math.min(1, s.cash / next.cost), done: false }
    : { text: 'Keep the Citrus Palace busy', progress: 1, done: true };
  const r = rankFor(successScore(s));
  const long: Goal = r.next
    ? { text: `Reach Rank ${r.next.rank}, ${r.next.title} ($${r.next.ss.toLocaleString('en-US')} Success Score)`, progress: Math.min(1, successScore(s) / r.next.ss), done: false }
    : { text: 'You are The Big Squeeze', progress: 1, done: true };
  return [short, medium, long];
}

export function isGameState(x: unknown): x is GameState {
  const s = x as GameState;
  return !!s && typeof s === 'object' && s.version === SAVE_VERSION && typeof s.cash === 'number' && !!s.plots && !!s.today;
}

/** Saves migrate forward so long runs survive updates. Returns null for anything unreadable. */
export function migrateSave(x: unknown): GameState | null {
  const s = x as GameState;
  if (!s || typeof s !== 'object' || typeof s.cash !== 'number' || !s.plots || !s.today) return null;
  if (s.version === 7) { // v8: modes and difficulty; older runs carry on as a Classic campaign
    s.settings = defaultSettings();
    s.peakDay = s.day;
    s.version = 8;
  }
  migrateCombat(s);
  if (s.version === SAVE_VERSION) migrateNights(s); // real-time nights: the alert feed and the raid clock
  if (isGameState(s)) migrateRivals(s);
  return isGameState(s) ? migrateWorld(s) : null;
}
