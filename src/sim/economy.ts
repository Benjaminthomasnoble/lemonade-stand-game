// Deterministic economy for one lemonade stand (milestone 1).
// Pure data + functions, no DOM or three.js, so it runs the same in the
// browser, in Vitest and in Node scripts. Time advances one game minute
// per tick; the render layer decides how fast ticks happen.
import { nextRandom, randomRange } from './rng.ts';

export const SAVE_VERSION = 1;
export const DAY_START_MIN = 9 * 60;
export const DAY_END_MIN = 17 * 60;
export const DAY_LENGTH_MIN = DAY_END_MIN - DAY_START_MIN;
export const CUPS_PER_PITCHER = 10;
export const STARTING_CASH = 20;
export const STAND_VALUE = 25; // level 1 stand; upgrades arrive in milestone 2

export type SupplyId = 'lemons' | 'sugar' | 'cups' | 'ice';

export const SUPPLIES: Record<SupplyId, { label: string; packSize: number; packPrice: number; unit: string }> = {
  lemons: { label: 'Lemons', packSize: 12, packPrice: 2.4, unit: 'lemons' },
  sugar: { label: 'Sugar', packSize: 12, packPrice: 1.2, unit: 'scoops' },
  cups: { label: 'Cups', packSize: 50, packPrice: 1.5, unit: 'cups' },
  ice: { label: 'Ice', packSize: 100, packPrice: 1.0, unit: 'cubes' },
};

export type WeatherKind = 'sunny' | 'cloudy' | 'rainy' | 'heatwave';

export const WEATHER: Record<WeatherKind, { label: string; weight: number; temp: [number, number]; traffic: number; thirst: number }> = {
  sunny: { label: 'Sunny', weight: 0.4, temp: [72, 88], traffic: 1, thirst: 1 },
  cloudy: { label: 'Cloudy', weight: 0.3, temp: [62, 75], traffic: 0.85, thirst: 0.85 },
  rainy: { label: 'Rainy', weight: 0.2, temp: [55, 68], traffic: 0.45, thirst: 0.6 },
  heatwave: { label: 'Heat wave', weight: 0.1, temp: [92, 102], traffic: 1.15, thirst: 1.25 },
};

export interface Weather { kind: WeatherKind; temp: number }
export interface Recipe { lemons: number; sugar: number; ice: number } // per pitcher, per pitcher, per cup
export type Inventory = Record<SupplyId, number>;
export type Phase = 'prep' | 'open' | 'report';

export interface DayStats {
  day: number;
  weather: Weather;
  price: number;
  passersby: number;
  customers: number;
  missed: number; // wanted to buy but we were sold out
  revenue: number;
  spent: number;
  iceMelted: number;
  satisfaction: number; // average 0..1 over customers
  reputationBefore: number;
  reputationAfter: number;
}

export interface GameState {
  version: number;
  seed: number;
  day: number;
  phase: Phase;
  minute: number; // minutes since midnight
  cash: number;
  inventory: Inventory;
  recipe: Recipe;
  price: number;
  reputation: number; // 0..1
  forecast: Weather; // what the morning paper says about today
  weather: Weather; // what actually happens (set when the stand opens)
  pitcherCups: number;
  spawnCarry: number;
  today: DayStats;
  history: DayStats[];
  bestNetWorth: number;
}

export type SimEvent =
  | { type: 'passerby'; buys: boolean; soldOut: boolean; price: number }
  | { type: 'pitcher' }
  | { type: 'close' };

const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function rollWeather(rng: { seed: number }): Weather {
  let r = nextRandom(rng);
  let kind: WeatherKind = 'sunny';
  for (const k of Object.keys(WEATHER) as WeatherKind[]) {
    r -= WEATHER[k].weight;
    if (r <= 0) { kind = k; break; }
  }
  const [lo, hi] = WEATHER[kind].temp;
  return { kind, temp: Math.round(randomRange(rng, lo, hi)) };
}

function emptyStats(day: number, weather: Weather, price: number, reputation: number): DayStats {
  return {
    day, weather, price, passersby: 0, customers: 0, missed: 0, revenue: 0, spent: 0,
    iceMelted: 0, satisfaction: 0, reputationBefore: reputation, reputationAfter: reputation,
  };
}

export function newGame(seed = Date.now() & 0x7fffffff): GameState {
  const rng = { seed };
  const forecast = rollWeather(rng);
  const s: GameState = {
    version: SAVE_VERSION,
    seed: rng.seed,
    day: 1,
    phase: 'prep',
    minute: DAY_START_MIN,
    cash: STARTING_CASH,
    inventory: { lemons: 0, sugar: 0, cups: 0, ice: 0 },
    recipe: { lemons: 4, sugar: 3, ice: 3 },
    price: 0.5,
    reputation: 0.5,
    forecast,
    weather: forecast,
    pitcherCups: 0,
    spawnCarry: 0,
    today: emptyStats(1, forecast, 0.5, 0.5),
    history: [],
    bestNetWorth: 0,
  };
  s.bestNetWorth = netWorth(s);
  return s;
}

// ---------- morning prep ----------

export function buySupply(s: GameState, id: SupplyId, packs = 1): boolean {
  const cost = round2(SUPPLIES[id].packPrice * packs);
  if (s.phase === 'open' || packs <= 0 || cost > s.cash + 1e-9) return false;
  s.cash = round2(s.cash - cost);
  s.inventory[id] += SUPPLIES[id].packSize * packs;
  s.today.spent = round2(s.today.spent + cost);
  return true;
}

export function setRecipe(s: GameState, r: Partial<Recipe>): void {
  s.recipe = {
    lemons: clamp(Math.round(r.lemons ?? s.recipe.lemons), 0, 10),
    sugar: clamp(Math.round(r.sugar ?? s.recipe.sugar), 0, 10),
    ice: clamp(Math.round(r.ice ?? s.recipe.ice), 0, 6),
  };
}

export function setPrice(s: GameState, price: number): void {
  s.price = clamp(round2(price), 0.05, 5);
}

// ---------- demand model ----------

/** Ice per cup that tastes best at a temperature. */
export function idealIce(temp: number): number {
  return clamp(Math.round((temp - 50) / 10), 0, 5);
}

/** 0..1 taste score for a recipe on a given day. */
export function recipeQuality(r: Recipe, temp: number): number {
  if (r.lemons === 0) return 0;
  const q = 1 - 0.14 * Math.abs(r.lemons - 4) - 0.12 * Math.abs(r.sugar - 3) - 0.07 * Math.abs(r.ice - idealIce(temp));
  return clamp(q, 0, 1);
}

/** What a typical customer thinks a cup is worth today. */
export function fairPrice(temp: number, quality: number): number {
  return Math.max(0.2, 0.3 + (temp - 60) * 0.012 + 0.15 * quality);
}

export function buyChance(s: GameState, w: Weather = s.weather): number {
  const q = recipeQuality(s.recipe, w.temp);
  const thirst = clamp((w.temp - 45) / 50, 0.1, 1.1) * WEATHER[w.kind].thirst;
  const fair = fairPrice(w.temp, q);
  const priceFactor = s.price <= fair ? 1 + 0.3 * (fair - s.price) / fair : Math.exp(-2.5 * (s.price - fair) / fair);
  const qualityFactor = 0.4 + 0.6 * q;
  const repFactor = 0.6 + 0.8 * s.reputation;
  return clamp(0.6 * thirst * priceFactor * qualityFactor * repFactor, 0, 0.95);
}

/** Expected passersby per hour at a given clock minute. */
export function trafficPerHour(s: GameState, minute: number, w: Weather = s.weather): number {
  const t = (minute - DAY_START_MIN) / DAY_LENGTH_MIN; // 0..1 across the day
  const lunch = Math.exp(-(((t - 0.4) / 0.12) ** 2)); // ~12:15 peak
  const afterSchool = Math.exp(-(((t - 0.8) / 0.1) ** 2)); // ~3:30 peak
  const curve = 0.7 + 0.6 * lunch + 0.4 * afterSchool;
  const wordOfMouth = 0.8 + 0.4 * s.reputation;
  return 30 * WEATHER[w.kind].traffic * curve * wordOfMouth;
}

// ---------- the open day ----------

export function canOpen(s: GameState): boolean {
  return s.phase === 'prep';
}

export function openStand(s: GameState): boolean {
  if (!canOpen(s)) return false;
  // The forecast is usually right; sometimes the day surprises you.
  const rng = { seed: s.seed };
  let weather: Weather;
  if (nextRandom(rng) < 0.8) {
    const [lo, hi] = WEATHER[s.forecast.kind].temp;
    weather = { kind: s.forecast.kind, temp: clamp(s.forecast.temp + Math.round(randomRange(rng, -3, 3)), lo - 3, hi + 3) };
  } else {
    weather = rollWeather(rng);
  }
  s.seed = rng.seed;
  s.weather = weather;
  s.phase = 'open';
  s.minute = DAY_START_MIN;
  s.spawnCarry = 0;
  s.today.weather = weather;
  s.today.price = s.price;
  s.today.reputationBefore = s.reputation;
  return true;
}

function cupsLeft(s: GameState): number {
  const fromPitchers = s.recipe.lemons > 0
    ? Math.min(Math.floor(s.inventory.lemons / s.recipe.lemons), s.recipe.sugar > 0 ? Math.floor(s.inventory.sugar / s.recipe.sugar) : Infinity) * CUPS_PER_PITCHER
    : 0;
  return Math.min(s.inventory.cups, s.pitcherCups + fromPitchers);
}

/** Cups the stand could still sell with current stock. */
export function servingsAvailable(s: GameState): number {
  return cupsLeft(s);
}

/** Advance one game minute. Returns what happened, for the renderer. */
export function tickMinute(s: GameState): SimEvent[] {
  if (s.phase !== 'open') return [];
  const events: SimEvent[] = [];
  const rng = { seed: s.seed };
  // Jittered accumulator: exact average rate, irregular arrivals.
  s.spawnCarry += (trafficPerHour(s, s.minute) / 60) * randomRange(rng, 0.2, 1.8);
  while (s.spawnCarry >= 1) {
    s.spawnCarry -= 1;
    s.today.passersby++;
    const wants = nextRandom(rng) < buyChance(s);
    if (!wants) { events.push({ type: 'passerby', buys: false, soldOut: false, price: s.price }); continue; }
    if (s.pitcherCups === 0 && s.inventory.cups > 0 && s.recipe.lemons > 0
      && s.inventory.lemons >= s.recipe.lemons && s.inventory.sugar >= s.recipe.sugar) {
      s.inventory.lemons -= s.recipe.lemons;
      s.inventory.sugar -= s.recipe.sugar;
      s.pitcherCups = CUPS_PER_PITCHER;
      events.push({ type: 'pitcher' });
    }
    if (s.pitcherCups === 0 || s.inventory.cups === 0) {
      s.today.missed++;
      events.push({ type: 'passerby', buys: false, soldOut: true, price: s.price });
      continue;
    }
    s.pitcherCups--;
    s.inventory.cups--;
    const iceUsed = Math.min(s.inventory.ice, s.recipe.ice);
    s.inventory.ice -= iceUsed;
    const servedRecipe = { ...s.recipe, ice: iceUsed };
    const q = recipeQuality(servedRecipe, s.weather.temp);
    const fair = fairPrice(s.weather.temp, q);
    const sat = clamp(0.25 + 0.6 * q + 0.5 * (fair - s.price) / fair, 0, 1);
    const n = s.today.customers;
    s.today.satisfaction = (s.today.satisfaction * n + sat) / (n + 1);
    s.today.customers++;
    s.today.revenue = round2(s.today.revenue + s.price);
    s.cash = round2(s.cash + s.price);
    events.push({ type: 'passerby', buys: true, soldOut: false, price: s.price });
  }
  s.seed = rng.seed;
  s.minute++;
  if (s.minute >= DAY_END_MIN) {
    closeDay(s);
    events.push({ type: 'close' });
  }
  return events;
}

function closeDay(s: GameState): void {
  const t = s.today;
  t.iceMelted = s.inventory.ice;
  s.inventory.ice = 0; // ice never keeps overnight
  s.pitcherCups = 0; // leftover lemonade is poured out
  let rep = s.reputation;
  if (t.customers > 0) rep = 0.8 * rep + 0.2 * t.satisfaction;
  else rep = rep + (0.4 - rep) * 0.1;
  rep -= Math.min(0.05, t.missed * 0.002); // people remember an empty stand
  s.reputation = clamp(Math.round(rep * 1000) / 1000, 0, 1);
  t.reputationAfter = s.reputation;
  s.history.push(t);
  if (s.history.length > 60) s.history.shift();
  s.bestNetWorth = Math.max(s.bestNetWorth, netWorth(s));
  s.phase = 'report';
}

export function nextDay(s: GameState): boolean {
  if (s.phase !== 'report') return false;
  const rng = { seed: s.seed };
  s.forecast = rollWeather(rng);
  s.seed = rng.seed;
  s.weather = s.forecast;
  s.day++;
  s.minute = DAY_START_MIN;
  s.phase = 'prep';
  s.today = emptyStats(s.day, s.forecast, s.price, s.reputation);
  return true;
}

/** Run the rest of the open day instantly (tests, skip button). */
export function simulateRestOfDay(s: GameState): SimEvent[] {
  const all: SimEvent[] = [];
  while (s.phase === 'open') all.push(...tickMinute(s));
  return all;
}

// ---------- scoring ----------

export function netWorth(s: GameState): number {
  // Milestone 1: cash plus the stand. Land arrives with territory (milestone 4).
  return round2(s.cash + STAND_VALUE);
}

export function supplyCostPerCup(r: Recipe): number {
  const per = (id: SupplyId) => SUPPLIES[id].packPrice / SUPPLIES[id].packSize;
  return (r.lemons * per('lemons') + r.sugar * per('sugar')) / CUPS_PER_PITCHER + per('cups') + r.ice * per('ice');
}

export function isGameState(x: unknown): x is GameState {
  const s = x as GameState;
  return !!s && typeof s === 'object' && s.version === SAVE_VERSION && typeof s.cash === 'number' && !!s.inventory && !!s.today;
}
