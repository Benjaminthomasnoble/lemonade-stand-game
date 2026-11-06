// Every tunable number in one place. Values are the spec canon's STARTING
// values (CANON-starting-values.md); the tuned set from the economy model
// replaces them here without touching game logic.

export const START = {
  cash: 150,
  reputation: 3.0, // stars, 1..5
  landValue: 300, // Lottie's Corner
  plotTraffic: 320, // passersby per business day on Lottie's Corner (Maple Row 250–400)
  standLevel: 1,
};

// ---------- time ----------
export const MINUTES_PER_DAY = 1440;
export const DAWN = 7 * 60; // Morning Prep
export const OPEN = 8 * 60;
export const CLOSE = 20 * 60;
export const BUSINESS_MINUTES = CLOSE - OPEN;
export const SEASON_DAYS = 14;
/** Real seconds per game minute at 1×: business hours take ~3.5 real minutes. */
export const REAL_SECONDS_PER_MINUTE = 210 / BUSINESS_MINUTES;
export const SPEEDS = [0, 1, 2, 3] as const;

export type Season = 'summer' | 'fall' | 'winter' | 'spring';
export const SEASONS: Season[] = ['summer', 'fall', 'winter', 'spring'];
export const SEASON_DEMAND: Record<Season, number> = { summer: 1.3, fall: 0.9, winter: 0.6, spring: 1.0 };

// ---------- weather ----------
export type WeatherKind = 'scorcher' | 'hot' | 'warm' | 'cloudy' | 'rainy' | 'storm';
export const WEATHER: Record<WeatherKind, { label: string; thirst: number; traffic: number; temp: [number, number] }> = {
  scorcher: { label: 'Scorcher', thirst: 1.6, traffic: 1.0, temp: [95, 104] },
  hot: { label: 'Hot', thirst: 1.3, traffic: 1.0, temp: [85, 94] },
  warm: { label: 'Warm', thirst: 1.0, traffic: 1.0, temp: [72, 84] },
  cloudy: { label: 'Cloudy', thirst: 0.8, traffic: 0.9, temp: [62, 74] },
  rainy: { label: 'Rainy', thirst: 0.5, traffic: 0.7, temp: [56, 68] },
  storm: { label: 'Storm', thirst: 0.2, traffic: 0.4, temp: [55, 66] },
};
export const SEASON_WEATHER: Record<Season, Partial<Record<WeatherKind, number>>> = {
  summer: { scorcher: 0.1, hot: 0.25, warm: 0.35, cloudy: 0.15, rainy: 0.1, storm: 0.05 },
  fall: { hot: 0.05, warm: 0.3, cloudy: 0.35, rainy: 0.22, storm: 0.08 },
  winter: { warm: 0.05, cloudy: 0.5, rainy: 0.3, storm: 0.15 },
  spring: { hot: 0.05, warm: 0.4, cloudy: 0.3, rainy: 0.2, storm: 0.05 },
};
/** Cool seasons shift temperatures down. */
export const SEASON_TEMP_SHIFT: Record<Season, number> = { summer: 0, fall: -8, winter: -22, spring: -5 };
export const FORECAST_ACCURACY = 0.8;

// ---------- supplies ----------
export type SupplyId = 'lemons' | 'sugar' | 'ice';
export const SUPPLIES: Record<SupplyId, { label: string; unit: string; pack: number; baseUnitPrice: number; spoilDays?: number; meltsOvernight?: boolean }> = {
  lemons: { label: 'Lemons', unit: 'lemons', pack: 20, baseUnitPrice: 0.2, spoilDays: 3 },
  sugar: { label: 'Sugar', unit: 'scoops', pack: 50, baseUnitPrice: 0.03 },
  ice: { label: 'Ice', unit: 'cubes', pack: 60, baseUnitPrice: 0.01, meltsOvernight: true },
};
export const MARKET_SWING = 0.2; // daily prices move ±20%
export const CUP_COST = 0.05; // cups and napkins, flat per cup sold
export const CUPS_PER_PITCHER = 10;

// ---------- recipes ----------
export type RecipeId = 'classic' | 'pink' | 'mint';
export type Sweetness = 'less' | 'classic' | 'extra';
export const RECIPES: Record<RecipeId, { label: string; lemonsPerPitcher: number; sugarPerPitcher: number; icePerCup: number; extraPerCup: number; priceBonus: number; blurb: string }> = {
  classic: { label: 'Classic Lemonade', lemonsPerPitcher: 5, sugarPerPitcher: 10, icePerCup: 3, extraPerCup: 0, priceBonus: 0, blurb: 'Everyone likes it.' },
  pink: { label: 'Pink Lemonade', lemonsPerPitcher: 5, sugarPerPitcher: 12, icePerCup: 3, extraPerCup: 0.02, priceBonus: 0.05, blurb: 'Kids and families love it.' },
  mint: { label: 'Mint Lemonade', lemonsPerPitcher: 5, sugarPerPitcher: 8, icePerCup: 4, extraPerCup: 0.03, priceBonus: 0.05, blurb: 'Joggers and students love it.' },
};
export const SWEETNESS_SUGAR: Record<Sweetness, number> = { less: 0.6, classic: 1, extra: 1.5 };

// ---------- customers ----------
export type SegmentId = 'kids' | 'families' | 'seniors' | 'students' | 'office' | 'tourists' | 'workers' | 'highRollers';
export const SEGMENTS: Record<SegmentId, { label: string; priceTolerance: number; favorites: RecipeId[]; sweet: Sweetness; peaks: number[] }> = {
  kids: { label: 'Kids', priceTolerance: 0.7, favorites: ['pink'], sweet: 'extra', peaks: [11, 15] },
  families: { label: 'Families', priceTolerance: 1.0, favorites: ['pink', 'classic'], sweet: 'classic', peaks: [12, 18] },
  seniors: { label: 'Seniors', priceTolerance: 0.9, favorites: ['classic'], sweet: 'less', peaks: [9, 16] },
  students: { label: 'Students', priceTolerance: 0.8, favorites: ['mint'], sweet: 'classic', peaks: [13, 19] },
  office: { label: 'Office workers', priceTolerance: 1.3, favorites: ['classic', 'mint'], sweet: 'less', peaks: [8, 12, 17] },
  tourists: { label: 'Tourists', priceTolerance: 1.4, favorites: ['pink'], sweet: 'extra', peaks: [13, 16] },
  workers: { label: 'Workers', priceTolerance: 1.0, favorites: ['classic'], sweet: 'classic', peaks: [8, 12, 17] },
  highRollers: { label: 'High rollers', priceTolerance: 2.0, favorites: ['classic'], sweet: 'less', peaks: [14, 18] },
};
/** Who walks down Maple Row. */
export const MAPLE_ROW_MIX: Partial<Record<SegmentId, number>> = { kids: 0.3, families: 0.3, seniors: 0.25, students: 0.08, workers: 0.07 };
/** Foot traffic shape over business hours (commute, lunch, afternoon heat, evening stroll). */
export const HOURLY_TRAFFIC = [0.9, 0.7, 0.7, 0.9, 1.3, 1.2, 1.1, 1.3, 1.3, 1.0, 1.1, 1.0]; // 08..19
export const BASE_STOP_CHANCE = 0.25;

// ---------- stands ----------
export interface StandLevel { level: number; name: string; cost: number; draw: number; capacityPerHour: number; topPrice: number; upkeep: number; hp: number; guardPosts: number; storage: Record<SupplyId, number> }
export const STAND_LEVELS: StandLevel[] = [
  { level: 1, name: 'The Folding Table', cost: 150, draw: 1.0, capacityPerHour: 20, topPrice: 1.5, upkeep: 5, hp: 100, guardPosts: 1, storage: { lemons: 60, sugar: 150, ice: 360 } },
  { level: 2, name: 'The Wooden Stand', cost: 400, draw: 1.5, capacityPerHour: 50, topPrice: 2.0, upkeep: 15, hp: 300, guardPosts: 2, storage: { lemons: 160, sugar: 400, ice: 900 } },
  { level: 3, name: 'The Kiosk', cost: 3500, draw: 2.3, capacityPerHour: 120, topPrice: 3.0, upkeep: 60, hp: 800, guardPosts: 3, storage: { lemons: 400, sugar: 1000, ice: 2400 } },
  { level: 4, name: 'The Lemon Shack', cost: 25000, draw: 3.5, capacityPerHour: 300, topPrice: 4.5, upkeep: 250, hp: 2000, guardPosts: 4, storage: { lemons: 1000, sugar: 2500, ice: 6000 } },
  { level: 5, name: 'The Citrus Palace', cost: 160000, draw: 5.0, capacityPerHour: 700, topPrice: 7.0, upkeep: 900, hp: 5000, guardPosts: 6, storage: { lemons: 2400, sugar: 6000, ice: 14000 } },
];
export const BUILDING_VALUE_SHARE = 0.75;

// ---------- reputation ----------
export const repMultiplier = (stars: number) => 0.7 + (0.6 * (stars - 1)) / 4; // 0.7× at 1★ .. 1.3× at 5★

// ---------- ranks ----------
export const RANKS = [
  { rank: 1, title: 'Sidewalk Squeezer', ss: 0 },
  { rank: 2, title: 'Corner Hustler', ss: 1500 },
  { rank: 3, title: 'Block Boss', ss: 6000 },
  { rank: 4, title: 'Neighborhood Name', ss: 25000 },
  { rank: 5, title: 'District Big Shot', ss: 100000 },
  { rank: 6, title: 'Citrus Baron', ss: 350000 },
  { rank: 7, title: 'Lemon Tycoon', ss: 1200000 },
  { rank: 8, title: 'Juice Magnate', ss: 4000000 },
  { rank: 9, title: 'Bay Kingpin', ss: 12000000 },
  { rank: 10, title: 'The Big Squeeze', ss: 40000000 },
];
