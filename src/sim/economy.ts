// Deterministic, tick-based economy (spec section 25: 1 tick = 1 game
// minute, all randomness from a per-run seed). Pure data + functions:
// no DOM or three.js, so it runs the same in the browser, Vitest and Node.
// Milestone 1 covers one stand on Lottie's Corner and the daily loop.
import { nextRandom, randomRange } from './rng.ts';
import {
  BASE_STOP_CHANCE, BUILDING_VALUE_SHARE, CLOSE, CUP_COST, CUPS_PER_PITCHER, DAWN, FORECAST_ACCURACY,
  HOURLY_TRAFFIC, MAPLE_ROW_MIX, MARKET_SWING, OPEN, RANKS, RECIPES, repMultiplier, SEASON_DAYS, SEASON_DEMAND,
  SEASON_TEMP_SHIFT, SEASON_WEATHER, SEASONS, SEGMENTS, STAND_LEVELS, START, SUPPLIES, SWEETNESS_SUGAR, WEATHER,
  BRAND_TIERS, CAMPAIGNS, CURB_APPEAL, STAND_RANK_GATE,
  type CampaignId, type RecipeId, type Season, type SegmentId, type StandLevel, type SupplyId, type Sweetness, type WeatherKind,
} from './balance.ts';

export * from './balance.ts';

export const SAVE_VERSION = 3;

export interface Weather { kind: WeatherKind; temp: number }
export type Phase = 'prep' | 'open' | 'report';
export type WalkReason = 'notThirsty' | 'pricey' | 'line' | 'soldOut';

export interface LemonBatch { qty: number; day: number; unitCost: number }
export interface Inventory { lemons: LemonBatch[]; sugar: number; ice: number; sugarCost: number; iceCost: number }

export interface DayStats {
  day: number;
  weather: Weather;
  recipe: RecipeId;
  price: number;
  passersby: number;
  customers: number;
  walkedPast: Record<WalkReason, number>;
  revenue: number;
  supplies: number; // bought today
  cupCosts: number;
  upkeep: number;
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
  minute: number; // minute of the day, 0..1439
  phase: Phase;
  cash: number;
  reputation: number; // stars 1..5
  standLevel: number;
  invested: number; // money put into buildings on owned plots
  landValue: number;
  plotTraffic: number;
  inventory: Inventory;
  market: Record<SupplyId, number>; // today's unit prices
  recipe: RecipeId;
  sweetness: Sweetness;
  price: number;
  forecast: Weather;
  weather: Weather;
  pitcherCups: number;
  spawnCarry: number;
  servedThisHour: number;
  today: DayStats;
  history: DayStats[];
  peakScore: number;
  lifetimeCups: number;
  brandTier: number; // 0 = none
  campaigns: Partial<Record<CampaignId, number>>; // days left
  rank: number; // highest rank reached (ranks never drop)
  news: string[]; // fresh headlines for the UI (rank-ups, upgrades)
}

export type SimEvent =
  | { type: 'passerby'; segment: SegmentId; buys: boolean; reason?: WalkReason; price: number }
  | { type: 'pitcher' }
  | { type: 'close' };

const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
type Rng = { seed: number };

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

function emptyStats(s: Pick<GameState, 'day' | 'forecast' | 'recipe' | 'price' | 'reputation'>, score: number): DayStats {
  return {
    day: s.day, weather: s.forecast, recipe: s.recipe, price: s.price, passersby: 0, customers: 0,
    walkedPast: { notThirsty: 0, pricey: 0, line: 0, soldOut: 0 }, revenue: 0, supplies: 0, cupCosts: 0, upkeep: 0,
    iceMelted: 0, lemonsSpoiled: 0, satisfaction: 0, reputationBefore: s.reputation, reputationAfter: s.reputation, scoreBefore: score,
  };
}

export function newGame(seed = Date.now() & 0x7fffffff): GameState {
  const rng = { seed };
  const forecast = rollWeather(rng, 'summer');
  const market = rollMarket(rng);
  const s: GameState = {
    version: SAVE_VERSION, seed: rng.seed, day: 1, minute: DAWN, phase: 'prep',
    cash: START.cash, reputation: START.reputation, standLevel: START.standLevel,
    invested: STAND_LEVELS[0].cost, landValue: START.landValue, plotTraffic: START.plotTraffic,
    inventory: { lemons: [], sugar: 0, ice: 0, sugarCost: 0, iceCost: 0 },
    market, recipe: 'classic', sweetness: 'classic', price: 0.75,
    forecast, weather: forecast, pitcherCups: 0, spawnCarry: 0, servedThisHour: 0,
    today: undefined as unknown as DayStats, history: [], peakScore: 0, lifetimeCups: 0,
    brandTier: 0, campaigns: {}, rank: 1, news: [],
  };
  s.today = emptyStats(s, successScore(s));
  s.peakScore = successScore(s);
  return s;
}

export function stand(s: GameState): StandLevel {
  return STAND_LEVELS[s.standLevel - 1];
}

// ---------- inventory ----------

export function stock(s: GameState, id: SupplyId): number {
  return id === 'lemons' ? s.inventory.lemons.reduce((a, b) => a + b.qty, 0) : s.inventory[id];
}

export function inventoryValue(s: GameState): number {
  const inv = s.inventory;
  return inv.lemons.reduce((a, b) => a + b.qty * b.unitCost, 0) + inv.sugar * inv.sugarCost + inv.ice * inv.iceCost;
}

/** Packs of a supply the player could buy right now (cash and storage). */
export function maxPacks(s: GameState, id: SupplyId): number {
  const sp = SUPPLIES[id];
  const room = Math.floor((stand(s).storage[id] - stock(s, id)) / sp.pack);
  const afford = Math.floor((s.cash + 1e-9) / (sp.pack * s.market[id]));
  return Math.max(0, Math.min(room, afford));
}

export function buySupply(s: GameState, id: SupplyId, packs = 1): boolean {
  if (s.phase === 'report' || packs <= 0 || packs > maxPacks(s, id)) return false;
  const qty = SUPPLIES[id].pack * packs;
  const unit = s.market[id];
  const cost = round2(qty * unit);
  s.cash = round2(s.cash - cost);
  s.today.supplies = round2(s.today.supplies + cost);
  const inv = s.inventory;
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

function useLemons(s: GameState, n: number): void {
  const batches = s.inventory.lemons; // oldest first
  while (n > 0 && batches.length) {
    const b = batches[0];
    const take = Math.min(b.qty, n);
    b.qty -= take;
    n -= take;
    if (b.qty === 0) batches.shift();
  }
}

// ---------- choices ----------

export function setRecipe(s: GameState, id: RecipeId): void { s.recipe = id; }
export function setSweetness(s: GameState, v: Sweetness): void { s.sweetness = v; }
export function setPrice(s: GameState, price: number): void { s.price = clamp(round2(price), 0.05, 20); }

export function pitcherNeeds(s: GameState): { lemons: number; sugar: number; icePerCup: number } {
  const r = RECIPES[s.recipe];
  return { lemons: r.lemonsPerPitcher, sugar: Math.round(r.sugarPerPitcher * SWEETNESS_SUGAR[s.sweetness]), icePerCup: r.icePerCup };
}

/** Supply cost of one cup at today's market prices (plus the flat cup). */
export function costPerCup(s: GameState): number {
  const n = pitcherNeeds(s);
  return (n.lemons * s.market.lemons + n.sugar * s.market.sugar) / CUPS_PER_PITCHER
    + n.icePerCup * s.market.ice + RECIPES[s.recipe].extraPerCup + CUP_COST;
}

/** Cups the stand could still pour with current stock (ignores ice). */
export function servingsAvailable(s: GameState): number {
  const n = pitcherNeeds(s);
  const pitchers = Math.min(Math.floor(stock(s, 'lemons') / n.lemons), n.sugar > 0 ? Math.floor(s.inventory.sugar / n.sugar) : Infinity);
  return s.pitcherCups + pitchers * CUPS_PER_PITCHER;
}

// ---------- demand ----------

export interface Appeal { priceFit: number; recipeMatch: number; sweetMatch: number; appeal: number; stopChance: number; fairPrice: number; topPrice: number }

/** How a customer of a segment feels about our stand today. Shown to the player as odds. */
export function appealFor(s: GameState, seg: SegmentId, w: Weather = s.weather): Appeal {
  const g = SEGMENTS[seg];
  const r = RECIPES[s.recipe];
  const topPrice = (stand(s).topPrice + r.priceBonus) * g.priceTolerance;
  const fairPrice = topPrice * 0.5;
  const priceFit = s.price <= fairPrice ? 1 + 0.3 * (fairPrice - s.price) / fairPrice : Math.max(0, 1 - (s.price - fairPrice) / (topPrice - fairPrice));
  const recipeMatch = g.favorites.includes(s.recipe) ? 1.2 : 1;
  const order: Sweetness[] = ['less', 'classic', 'extra'];
  const gap = Math.abs(order.indexOf(g.sweet) - order.indexOf(s.sweetness));
  const sweetMatch = gap === 0 ? 1.1 : gap === 1 ? 1 : 0.85;
  const appeal = CURB_APPEAL[s.standLevel - 1] * recipeMatch * sweetMatch * priceFit * repMultiplier(s.reputation);
  const stopChance = clamp(BASE_STOP_CHANCE * WEATHER[w.kind].thirst * appeal, 0, 0.95);
  return { priceFit, recipeMatch, sweetMatch, appeal, stopChance, fairPrice, topPrice };
}

/** Average stop chance across today's customer mix. */
export function averageStopChance(s: GameState, w: Weather = s.weather): number {
  const mix = Object.entries(MAPLE_ROW_MIX) as [SegmentId, number][];
  const total = mix.reduce((a, [, x]) => a + x, 0);
  return mix.reduce((a, [seg, x]) => a + appealFor(s, seg, w).stopChance * x, 0) / total;
}

export function expectedPassersby(s: GameState, w: Weather = s.weather): number {
  return s.plotTraffic * stand(s).draw * marketingMultiplier(s) * SEASON_DEMAND[seasonOf(s.day)] * WEATHER[w.kind].traffic;
}

export function marketingMultiplier(s: GameState): number {
  let m = 1 + (s.brandTier ? BRAND_TIERS[s.brandTier - 1].traffic : 0);
  for (const [id, days] of Object.entries(s.campaigns) as [CampaignId, number][]) if (days > 0) m += CAMPAIGNS[id].traffic;
  return m;
}

const HOURLY_SUM = HOURLY_TRAFFIC.reduce((a, b) => a + b, 0);

function segmentAt(rng: Rng, hour: number): SegmentId {
  const w: Partial<Record<SegmentId, number>> = {};
  for (const [seg, x] of Object.entries(MAPLE_ROW_MIX) as [SegmentId, number][]) {
    const peak = SEGMENTS[seg].peaks.some((p) => Math.abs(p - hour) <= 1) ? 1.8 : 1;
    w[seg] = x * peak;
  }
  return pick(rng, w);
}

// ---------- the business day ----------

export function openStand(s: GameState): boolean {
  if (s.phase !== 'prep') return false;
  const rng = { seed: s.seed };
  let weather: Weather;
  if (nextRandom(rng) < FORECAST_ACCURACY) {
    weather = { kind: s.forecast.kind, temp: s.forecast.temp + Math.round(randomRange(rng, -2, 2)) };
  } else {
    weather = rollWeather(rng, seasonOf(s.day));
  }
  s.seed = rng.seed;
  s.weather = weather;
  s.phase = 'open';
  s.minute = OPEN;
  s.spawnCarry = 0;
  s.servedThisHour = 0;
  Object.assign(s.today, { weather, recipe: s.recipe, price: s.price, reputationBefore: s.reputation });
  return true;
}

function serve(s: GameState, seg: SegmentId, rng: Rng): SimEvent {
  const t = s.today;
  t.passersby++;
  const a = appealFor(s, seg);
  if (nextRandom(rng) >= a.stopChance) {
    const reason: WalkReason = a.priceFit < 0.6 ? 'pricey' : 'notThirsty';
    t.walkedPast[reason]++;
    return { type: 'passerby', segment: seg, buys: false, reason, price: s.price };
  }
  if (s.servedThisHour >= stand(s).capacityPerHour) {
    t.walkedPast.line++;
    return { type: 'passerby', segment: seg, buys: false, reason: 'line', price: s.price };
  }
  if (s.pitcherCups === 0) {
    const n = pitcherNeeds(s);
    if (stock(s, 'lemons') >= n.lemons && s.inventory.sugar >= n.sugar) {
      useLemons(s, n.lemons);
      s.inventory.sugar -= n.sugar;
      s.pitcherCups = CUPS_PER_PITCHER;
    }
  }
  if (s.pitcherCups === 0) {
    t.walkedPast.soldOut++;
    return { type: 'passerby', segment: seg, buys: false, reason: 'soldOut', price: s.price };
  }
  s.pitcherCups--;
  s.servedThisHour++;
  const ice = RECIPES[s.recipe].icePerCup;
  const warm = s.inventory.ice < ice;
  s.inventory.ice = Math.max(0, s.inventory.ice - ice);
  const cupCost = CUP_COST + RECIPES[s.recipe].extraPerCup;
  const sat = clamp(0.55 + 1.25 * (a.recipeMatch - 1) + (a.sweetMatch - 1) + 0.4 * (a.fairPrice - s.price) / a.fairPrice - (warm ? 0.35 : 0), 0, 1);
  t.satisfaction = (t.satisfaction * t.customers + sat) / (t.customers + 1);
  t.customers++;
  s.lifetimeCups++;
  t.revenue = round2(t.revenue + s.price);
  t.cupCosts = round2(t.cupCosts + cupCost);
  s.cash = round2(s.cash + s.price - cupCost);
  return { type: 'passerby', segment: seg, buys: true, price: s.price };
}

/** Advance one game minute. Returns what happened, for the renderer. */
export function tickMinute(s: GameState): SimEvent[] {
  if (s.phase !== 'open') return [];
  const events: SimEvent[] = [];
  const rng = { seed: s.seed };
  const hourIdx = Math.floor((s.minute - OPEN) / 60);
  if ((s.minute - OPEN) % 60 === 0) s.servedThisHour = 0;
  const perMinute = (expectedPassersby(s) * HOURLY_TRAFFIC[hourIdx]) / HOURLY_SUM / 60;
  // Jittered accumulator: exact average rate, irregular arrivals.
  s.spawnCarry += perMinute * randomRange(rng, 0.2, 1.8);
  while (s.spawnCarry >= 1) {
    s.spawnCarry -= 1;
    const before = s.pitcherCups;
    const e = serve(s, segmentAt(rng, 8 + hourIdx), rng);
    if (before === 0 && s.pitcherCups > 0) events.push({ type: 'pitcher' });
    events.push(e);
  }
  s.seed = rng.seed;
  s.minute++;
  if (s.minute >= CLOSE) {
    closeDay(s);
    events.push({ type: 'close' });
  }
  return events;
}

function closeDay(s: GameState): void {
  const t = s.today;
  t.upkeep = stand(s).upkeep;
  s.cash = round2(s.cash - t.upkeep);
  t.iceMelted = s.inventory.ice; // ice never keeps overnight
  s.inventory.ice = 0;
  s.pitcherCups = 0; // leftover lemonade is poured out
  let rep = s.reputation;
  if (t.customers > 0) rep += (1 + 4 * t.satisfaction - rep) * Math.min(0.25, t.customers / 400);
  rep -= Math.min(0.15, t.walkedPast.soldOut * 0.004) + Math.min(0.1, t.walkedPast.line * 0.002);
  s.reputation = clamp(Math.round(rep * 100) / 100, 1, 5);
  t.reputationAfter = s.reputation;
  s.history.push(t);
  if (s.history.length > 60) s.history.shift();
  s.peakScore = Math.max(s.peakScore, successScore(s));
  checkRank(s);
  s.phase = 'report';
}

/** Night passes (no raids before milestone 3), then dawn opens Morning Prep. */
export function sleepUntilDawn(s: GameState): boolean {
  if (s.phase !== 'report') return false;
  s.day++;
  s.minute = DAWN;
  const rng = { seed: s.seed };
  // Lemons spoil after 3 days.
  let spoiled = 0;
  s.inventory.lemons = s.inventory.lemons.filter((b) => {
    const bad = s.day - b.day >= (SUPPLIES.lemons.spoilDays ?? 99);
    if (bad) spoiled += b.qty;
    return !bad;
  });
  s.forecast = rollWeather(rng, seasonOf(s.day));
  s.market = rollMarket(rng);
  s.seed = rng.seed;
  s.weather = s.forecast;
  s.phase = 'prep';
  for (const id of Object.keys(s.campaigns) as CampaignId[]) {
    const left = (s.campaigns[id] ?? 0) - 1;
    if (left > 0) s.campaigns[id] = left; else delete s.campaigns[id];
  }
  s.today = emptyStats(s, successScore(s));
  s.today.lemonsSpoiled = spoiled;
  return true;
}

/** Run the rest of the business day instantly (tests, skip button). */
export function simulateRestOfDay(s: GameState): SimEvent[] {
  const all: SimEvent[] = [];
  while (s.phase === 'open') all.push(...tickMinute(s));
  return all;
}

export function lemonsExpiringTomorrow(s: GameState): number {
  return s.inventory.lemons.filter((b) => s.day + 1 - b.day >= (SUPPLIES.lemons.spoilDays ?? 99)).reduce((a, b) => a + b.qty, 0);
}

// ---------- score and rank ----------

/** Net Worth = cash + land + 75% of building investment + inventory at cost − loans. */
export function netWorth(s: GameState): number {
  return Math.max(0, round2(s.cash + s.landValue + BUILDING_VALUE_SHARE * s.invested + inventoryValue(s)));
}
export const successScore = (s: GameState) => Math.floor(netWorth(s));

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
  }
}

// ---------- upgrades and marketing (milestone 2) ----------

export type Blocker = { ok: true } | { ok: false; why: string };

export function canUpgradeStand(s: GameState): Blocker {
  const next = STAND_LEVELS[s.standLevel];
  if (!next) return { ok: false, why: 'Already the Citrus Palace' };
  if (s.phase !== 'prep') return { ok: false, why: 'Upgrade during Morning Prep' };
  const gate = STAND_RANK_GATE[next.level - 1];
  if (s.rank < gate) return { ok: false, why: `Needs Rank ${gate}, ${RANKS[gate - 1].title}` };
  if (s.cash < next.cost) return { ok: false, why: `Needs $${next.cost.toLocaleString('en-US')}` };
  return { ok: true };
}

export function upgradeStand(s: GameState): boolean {
  if (!canUpgradeStand(s).ok) return false;
  const next = STAND_LEVELS[s.standLevel];
  s.cash = round2(s.cash - next.cost);
  s.invested += next.cost;
  s.standLevel = next.level;
  s.news.push(`Lottie's Corner gets a makeover: say hello to ${next.name}!`);
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

export function canRunCampaign(s: GameState, id: CampaignId): Blocker {
  const c = CAMPAIGNS[id];
  if (s.phase !== 'prep') return { ok: false, why: 'Plan campaigns during Morning Prep' };
  if (s.rank < c.rank) return { ok: false, why: `Needs Rank ${c.rank}, ${RANKS[c.rank - 1].title}` };
  const left = s.campaigns[id] ?? 0;
  if (left > 0) return { ok: false, why: `Running (${left} day${left === 1 ? '' : 's'} left)` };
  if (c.costPerDay && s.cash < c.costPerDay) return { ok: false, why: `Needs $${c.costPerDay}` };
  if (c.samples && servingsAvailable(s) < c.samples) return { ok: false, why: `Needs stock for ${c.samples} cups` };
  return { ok: true };
}

export function runCampaign(s: GameState, id: CampaignId): boolean {
  if (!canRunCampaign(s, id).ok) return false;
  const c = CAMPAIGNS[id];
  if (c.costPerDay) {
    s.cash = round2(s.cash - c.costPerDay);
    s.today.supplies = round2(s.today.supplies + c.costPerDay);
  }
  if (c.samples) {
    // Pour the samples from stock, oldest lemons first.
    const n = pitcherNeeds(s);
    const pitchers = Math.ceil(c.samples / CUPS_PER_PITCHER);
    useLemons(s, n.lemons * pitchers);
    s.inventory.sugar = Math.max(0, s.inventory.sugar - n.sugar * pitchers);
    s.inventory.ice = Math.max(0, s.inventory.ice - n.icePerCup * c.samples);
    s.cash = round2(s.cash - CUP_COST * c.samples);
    s.today.cupCosts = round2(s.today.cupCosts + CUP_COST * c.samples);
  }
  if (c.reputation) s.reputation = clamp(Math.round((s.reputation + c.reputation) * 100) / 100, 1, 5);
  s.campaigns[id] = c.days;
  return true;
}

export interface Goal { text: string; progress: number; done: boolean }

/** Lottie keeps three goals on screen: short, medium, long. */
export function lottieGoals(s: GameState): Goal[] {
  const short: Goal = servingsAvailable(s) === 0 && s.phase === 'prep'
    ? { text: 'Buy lemons and sugar at the market', progress: 0, done: false }
    : { text: 'Sell 60 cups in one day', progress: Math.min(1, s.today.customers / 60), done: s.today.customers >= 60 };
  const nextStand = STAND_LEVELS[s.standLevel];
  const gate = nextStand ? STAND_RANK_GATE[nextStand.level - 1] : 0;
  const medium: Goal = s.brandTier === 0 && s.standLevel >= 2
    ? { text: `Put up Hand-Painted Signs ($${BRAND_TIERS[0].cost})`, progress: Math.min(1, s.cash / BRAND_TIERS[0].cost), done: false }
    : nextStand
    ? { text: `Upgrade to ${nextStand.name} ($${nextStand.cost.toLocaleString('en-US')}${s.rank < gate ? `, needs Rank ${gate}` : ''})`, progress: Math.min(1, s.cash / nextStand.cost), done: false }
    : { text: 'Keep the Citrus Palace busy', progress: 1, done: true };
  const r = rankFor(successScore(s));
  const long: Goal = r.next
    ? { text: `Reach Rank ${r.next.rank}, ${r.next.title} ($${r.next.ss.toLocaleString('en-US')} Success Score)`, progress: Math.min(1, successScore(s) / r.next.ss), done: false }
    : { text: 'You are The Big Squeeze', progress: 1, done: true };
  return [short, medium, long];
}

export function isGameState(x: unknown): x is GameState {
  const s = x as GameState;
  return !!s && typeof s === 'object' && s.version === SAVE_VERSION && typeof s.cash === 'number' && !!s.inventory && !!s.today;
}
