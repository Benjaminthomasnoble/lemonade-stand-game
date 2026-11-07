// Every tunable number in one place. Values follow the spec's tuned balance
// tables (Appendix A, /mnt/project-files/lemonade-stand-wars/balance-tables.md)
// except where a comment says the build tuned its own model.
import type { DistrictId } from './map.ts';

export const START = {
  cash: 150,
  reputation: 3.0, // stars, 1..5
  landValue: 300, // Lottie's Corner
  plotTraffic: 400, // passersby per business day on Lottie's Corner
  standLevel: 1,
};

// ---------- time ----------
export const MINUTES_PER_DAY = 1440;
export const DAWN = 7 * 60; // Morning Prep
export const OPEN = 8 * 60;
export const CLOSE = 20 * 60;
export const BUSINESS_MINUTES = CLOSE - OPEN;
/** The night runs on from closing to the next dawn: minutes past midnight count on from 1,440, so 07:00 is 1,860. */
export const NIGHT_END = MINUTES_PER_DAY + DAWN;
/** At night a game hour lasts about 8 real seconds at 1×: 20:00 to 07:00 takes about 1.5 real minutes. */
export const NIGHT_REAL_SECONDS_PER_MINUTE = 8 / 60;
/** Quiet nights: from closing until an alert, the night runs at 3× by itself (a setting, on by default). */
export const QUIET_NIGHT_SPEED = 3;
/** The Evening is a moment: off the Ledger, on the live map, the night starts by itself after this many real seconds at 1×. */
export const EVENING_REAL_SECONDS = 6; // placeholder: spec gap ("a moment")
export const SEASON_DAYS = 14;
/** Real seconds per game minute at 1×: business hours take ~3.5 real minutes. */
export const REAL_SECONDS_PER_MINUTE = 210 / BUSINESS_MINUTES;
export const SPEEDS = [0, 1, 2, 3] as const;
export const FIGHT_SECONDS_PER_GAME_MINUTE = 1;

export type Season = 'summer' | 'fall' | 'winter' | 'spring';
export const SEASONS: Season[] = ['summer', 'fall', 'winter', 'spring'];
export const SEASON_DEMAND: Record<Season, number> = { summer: 1.2, fall: 0.9, winter: 0.6, spring: 1.0 };
/** The Boardwalk swings harder with the seasons. */
export const BOARDWALK_SEASON: Record<Season, number> = { summer: 1.5, fall: 0.9, winter: 0.4, spring: 1.0 };

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
  summer: { scorcher: 0.15, hot: 0.35, warm: 0.3, cloudy: 0.12, rainy: 0.06, storm: 0.02 },
  fall: { scorcher: 0.03, hot: 0.15, warm: 0.37, cloudy: 0.25, rainy: 0.15, storm: 0.05 },
  winter: { hot: 0.05, warm: 0.25, cloudy: 0.4, rainy: 0.22, storm: 0.08 },
  spring: { scorcher: 0.02, hot: 0.13, warm: 0.4, cloudy: 0.25, rainy: 0.15, storm: 0.05 },
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

// ---------- recipes (spec: Recipe cards; Appendix A, Supplies and recipes) ----------
export type RecipeId = 'classic' | 'pink' | 'mint' | 'strawberry' | 'frozen' | 'honeyGinger' | 'sparkling' | 'lavender' | 'halfAndHalf' | 'secretReserve';
export type Sweetness = 'less' | 'classic' | 'extra';
export interface Recipe {
  label: string;
  lemonsPerPitcher: number; sugarPerPitcher: number; icePerCup: number;
  /** Mint, berries, honey, bubbles: a flat cost per cup, so switching cards wastes no stock. */
  extraPerCup: number;
  priceBonus: number; // the card's price bonus (+10% = 0.1)
  blurb: string;
  shines: DistrictId[]; // ×1.2 appeal at stands in these districts
  season?: Season; // ... and everywhere through this season
  heatWave?: boolean; // ... and everywhere during a Heat Wave
  everywhere?: number; // Lottie's Secret Reserve: this match at every stand instead
  start?: boolean; // one of the 3 pages Lottie kept
}
// Every card pours the Classic base (half a lemon, a scoop of sugar, 3 cubes: $0.16) plus its extra, so the
// totals hit the spec's cost per cup at normal market prices. Frozen is blended with double ice and
// Honey-Ginger is served hot with none (the build's own split; the spec gives only the totals).
export const RECIPES: Record<RecipeId, Recipe> = {
  classic: { label: 'Classic Lemonade', lemonsPerPitcher: 5, sugarPerPitcher: 10, icePerCup: 3, extraPerCup: 0, priceBonus: 0, blurb: 'Everyone likes it', shines: [], start: true },
  pink: { label: 'Pink Lemonade', lemonsPerPitcher: 5, sugarPerPitcher: 10, icePerCup: 3, extraPerCup: 0.03, priceBonus: 0.05, blurb: 'Kids and families love it', shines: ['maple'], start: true },
  mint: { label: 'Mint Lemonade', lemonsPerPitcher: 5, sugarPerPitcher: 10, icePerCup: 3, extraPerCup: 0.04, priceBonus: 0.05, blurb: 'Students and joggers love it', shines: ['campus', 'boardwalk'], start: true },
  strawberry: { label: 'Strawberry Lemonade', lemonsPerPitcher: 5, sugarPerPitcher: 10, icePerCup: 3, extraPerCup: 0.11, priceBonus: 0.1, blurb: 'Kids and tourists love it', shines: ['maple', 'boardwalk'] },
  frozen: { label: 'Frozen Lemonade', lemonsPerPitcher: 5, sugarPerPitcher: 10, icePerCup: 6, extraPerCup: 0.06, priceBonus: 0.15, blurb: 'Tourists and students love it', shines: ['boardwalk'], season: 'summer', heatWave: true },
  honeyGinger: { label: 'Honey-Ginger Hot Lemonade', lemonsPerPitcher: 5, sugarPerPitcher: 10, icePerCup: 0, extraPerCup: 0.12, priceBonus: 0.1, blurb: 'Seniors love it, even in Winter', shines: ['maple', 'oldtown'], season: 'winter' },
  sparkling: { label: 'Sparkling Lemonade', lemonsPerPitcher: 5, sugarPerPitcher: 10, icePerCup: 3, extraPerCup: 0.11, priceBonus: 0.15, blurb: 'Office workers love it', shines: ['downtown'] },
  lavender: { label: 'Lavender Lemonade', lemonsPerPitcher: 5, sugarPerPitcher: 10, icePerCup: 3, extraPerCup: 0.19, priceBonus: 0.25, blurb: 'High rollers love it', shines: ['hilltop'] },
  halfAndHalf: { label: 'Hollis Half-and-Half', lemonsPerPitcher: 5, sugarPerPitcher: 10, icePerCup: 3, extraPerCup: 0.04, priceBonus: 0.1, blurb: 'Lemonade and sweet tea. Workers love it', shines: ['groves', 'harbor'], season: 'summer' },
  secretReserve: { label: "Lottie's Secret Reserve", lemonsPerPitcher: 5, sugarPerPitcher: 10, icePerCup: 3, extraPerCup: 0.24, priceBonus: 0.3, blurb: 'Everyone loves it', shines: [], everywhere: 1.3 },
};
/** A card's appeal where it shines: its districts, its season, or an event crowd of its fans. Matches never stack. */
export const SHINE_MATCH = 1.2;
/** The Sweetness dial moves appeal this much for the segments that care (kids like Extra; seniors and office workers like Less). */
export const SWEETNESS_SHIFT = 0.1;
/** Blender Bar (the Blend Shack Trophy): Frozen Lemonade's top price rises 20%. */
export const BLENDER_BAR_TOP_PRICE = 1.2;

// ---------- customers ----------
export type SegmentId = 'kids' | 'families' | 'seniors' | 'students' | 'office' | 'tourists' | 'workers' | 'highRollers';
/** `sweet` is the Sweetness a segment leans to; 'classic' means it doesn't care either way. */
export const SEGMENTS: Record<SegmentId, { label: string; priceTolerance: number; favorites: RecipeId[]; sweet: Sweetness; peaks: number[] }> = {
  kids: { label: 'Kids', priceTolerance: 0.8, favorites: ['pink', 'strawberry'], sweet: 'extra', peaks: [11, 15] },
  families: { label: 'Families', priceTolerance: 1.0, favorites: ['pink', 'classic'], sweet: 'classic', peaks: [12, 18] },
  seniors: { label: 'Seniors', priceTolerance: 0.9, favorites: ['honeyGinger', 'classic'], sweet: 'less', peaks: [9, 16] },
  students: { label: 'Students', priceTolerance: 0.85, favorites: ['mint', 'frozen'], sweet: 'classic', peaks: [13, 19] },
  office: { label: 'Office workers', priceTolerance: 1.2, favorites: ['sparkling'], sweet: 'less', peaks: [8, 12, 17] },
  tourists: { label: 'Tourists', priceTolerance: 1.3, favorites: ['strawberry', 'frozen'], sweet: 'classic', peaks: [13, 16] },
  workers: { label: 'Workers', priceTolerance: 0.9, favorites: ['halfAndHalf'], sweet: 'classic', peaks: [8, 12, 17] },
  highRollers: { label: 'High rollers', priceTolerance: 2.0, favorites: ['lavender', 'secretReserve'], sweet: 'classic', peaks: [14, 18] },
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
  { level: 4, name: 'The Lemon Shack', cost: 60000, draw: 3.5, capacityPerHour: 300, topPrice: 4.5, upkeep: 300, hp: 2000, guardPosts: 4, storage: { lemons: 1000, sugar: 2500, ice: 6000 } },
  { level: 5, name: 'The Citrus Palace', cost: 650000, draw: 5.0, capacityPerHour: 700, topPrice: 7.0, upkeep: 1500, hp: 5000, guardPosts: 6, storage: { lemons: 2400, sugar: 6000, ice: 14000 } },
];
export const BUILDING_VALUE_SHARE = 0.75;
/** Rank needed to upgrade TO each level (index = level - 1). */
export const STAND_RANK_GATE = [1, 1, 3, 5, 7];
/** Curb appeal by level: nicer stands look more inviting. */
export const CURB_APPEAL = [1.0, 1.05, 1.1, 1.15, 1.2];

// ---------- marketing ----------
export const BRAND_TIERS = [
  { tier: 1, name: 'Hand-Painted Signs', rank: 1, cost: 100, traffic: 0.05 },
  { tier: 2, name: 'Flyers & Sidewalk Chalk', rank: 3, cost: 1500, traffic: 0.12 },
  { tier: 3, name: 'Radio Jingle', rank: 4, cost: 12000, traffic: 0.22 },
  { tier: 4, name: 'Billboards & TV Spot', rank: 7, cost: 90000, traffic: 0.35 },
  { tier: 5, name: 'The Lemon Blimp', rank: 8, cost: 500000, traffic: 0.5 },
];
export type CampaignId = 'sandwichBoard' | 'freeSamples';
export const CAMPAIGNS: Record<CampaignId, { name: string; rank: number; blurb: string; costPerDay?: number; traffic: number; days: number; samples?: number; reputation?: number; maxLevel?: number }> = {
  sandwichBoard: { name: 'Sandwich-Board Kid', rank: 2, blurb: '+20% foot traffic today (L1–L3 stands)', costPerDay: 40, traffic: 0.2, days: 1, maxLevel: 3 },
  freeSamples: { name: 'Free Sample Day', rank: 2, blurb: 'Give away 30 cups: +0.1 star and +15% traffic for 3 days', traffic: 0.15, days: 3, samples: 30, reputation: 0.1 },
};

// ---------- the calendar: fairs and festivals (spec: Events and the living world) ----------
export const YEAR_DAYS = SEASON_DAYS * 4; // a year is 4 seasons of 14 days, starting on Summer Day 1
export type FestivalId = 'summerFair' | 'surfContest' | 'foundersDay' | 'countyFair' | 'homecoming' | 'harborFest' | 'winterLights' | 'marathon' | 'electionDay';
/** `from`/`to` are season days. `crowd` fills the district with its fans; a fair holds a Taste-Off on its last day. */
export interface Festival { name: string; district: DistrictId; season: Season; from: number; to: number; crowd?: SegmentId; fair?: boolean }
// The spec fixes the two fairs' weeks; every other day, length and crowd, and the Marathon, Election Day and
// Founders' Day districts, are placeholders (spec gap). Founders' Day lands on Day 120 in year 3.
export const FESTIVALS: Record<FestivalId, Festival> = {
  surfContest: { name: 'Surf Contest', district: 'boardwalk', season: 'summer', from: 4, to: 6, crowd: 'tourists' }, // placeholder: spec gap
  summerFair: { name: 'Summer Fair', district: 'oldtown', season: 'summer', from: 8, to: 14, crowd: 'families', fair: true },
  foundersDay: { name: "Founders' Day", district: 'downtown', season: 'summer', from: 8, to: 8, crowd: 'families' }, // placeholder: spec gap
  countyFair: { name: 'County Fair', district: 'groves', season: 'fall', from: 1, to: 7, crowd: 'families', fair: true },
  homecoming: { name: 'Campus Homecoming', district: 'campus', season: 'fall', from: 10, to: 11, crowd: 'students' }, // placeholder: spec gap
  harborFest: { name: 'Harbor Fest', district: 'harbor', season: 'fall', from: 12, to: 14, crowd: 'workers' }, // placeholder: spec gap
  winterLights: { name: 'Winter Lights Market', district: 'oldtown', season: 'winter', from: 8, to: 14, crowd: 'seniors' }, // placeholder: spec gap
  marathon: { name: 'Spring Marathon', district: 'boardwalk', season: 'spring', from: 7, to: 7, crowd: 'students' }, // joggers run with the students; placeholder: spec gap
  electionDay: { name: 'Election Day', district: 'oldtown', season: 'spring', from: 12, to: 12 }, // placeholder: spec gap
};
/** Share of a festival district's passersby who are the festival crowd. placeholder: spec gap */
export const FESTIVAL_CROWD_SHARE = 0.5;
/** Event Sponsorship (Rank 5): $2,000 per festival day, +50% traffic for your stands in the festival's district. */
export const SPONSORSHIP = { rank: 5, perDay: 2000, traffic: 0.5 };

// ---------- reputation ----------
export const repMultiplier = (stars: number) => 0.7 + (0.6 * (stars - 1)) / 4; // 0.7× at 1★ .. 1.3× at 5★

// ---------- ranks ----------
export const RANKS = [
  { rank: 1, title: 'Sidewalk Squeezer', ss: 0 },
  { rank: 2, title: 'Corner Hustler', ss: 1500 },
  { rank: 3, title: 'Block Boss', ss: 6000 },
  { rank: 4, title: 'Neighborhood Name', ss: 25000 },
  { rank: 5, title: 'District Big Shot', ss: 100000 },
  { rank: 6, title: 'Citrus Baron', ss: 500000 },
  { rank: 7, title: 'Lemon Tycoon', ss: 4500000 },
  { rank: 8, title: 'Juice Magnate', ss: 20000000 },
  { rank: 9, title: 'Bay Kingpin', ss: 125000000 },
  { rank: 10, title: 'The Big Squeeze', ss: 200000000 },
];

// ---------- land (section 10) ----------
export const PROPERTY_TAX_WEEKLY = 0.005;
export const LAND_DEVELOPMENT_MAX = 2; // land value can rise to ×2 base as a district develops
export const AUTO_RESTOCK_DAY = 3;

// ---------- rivals (section 13) ----------
export type RivalId = 'sourwood' | 'hollis' | 'fizzco' | 'coldbrew' | 'blenders';
export interface Faction {
  id: RivalId; name: string; product: string; boss: string; color: number; accent: number; home: string;
  personality: string; startCash: number; homeShare: number; startLevel: number; oldTownStands: number;
  grow: number; guard: number; strike: number; price: number; henchmen: string;
  rebuild: number; maxLevel: number; // chance to rebuild a smashed stand; highest stand level they build
}
export const FACTIONS: Record<RivalId, Faction> = {
  sourwood: { id: 'sourwood', name: 'The Sourwood Family', product: 'Lemonade', boss: 'Vera Sourwood', color: 0x5b2a6e, accent: 0xc9a227, home: 'hilltop', personality: 'Cunning and balanced', startCash: 3000000, rebuild: 0.8, maxLevel: 5, homeShare: 0.6, startLevel: 3, oldTownStands: 2, grow: 0.4, guard: 0.35, strike: 0.25, price: 1.0, henchmen: 'Stewards' },
  hollis: { id: 'hollis', name: 'Hollis Sweet Tea Co.', product: 'Sweet tea', boss: 'Tilly Hollis', color: 0xb5651d, accent: 0xd64545, home: 'groves', personality: 'Defensive landholder', startCash: 50000, rebuild: 0.6, maxLevel: 4, homeShare: 0.5, startLevel: 2, oldTownStands: 1, grow: 0.45, guard: 0.45, strike: 0.1, price: 0.9, henchmen: 'Farmhands' },
  fizzco: { id: 'fizzco', name: 'FizzCo Beverages', product: 'Soda', boss: 'Preston Fizzwell III', color: 0xc8102e, accent: 0xb8c2cc, home: 'downtown', personality: 'Rich and expansionist', startCash: 1000000, rebuild: 0.7, maxLevel: 5, homeShare: 0.5, startLevel: 3, oldTownStands: 1, grow: 0.55, guard: 0.25, strike: 0.2, price: 1.1, henchmen: 'Security Associates' },
  coldbrew: { id: 'coldbrew', name: 'The Cold Brew Collective', product: 'Iced coffee', boss: 'Juniper "Juni" Grind', color: 0x3b2a20, accent: 0xff4fa3, home: 'campus', personality: 'Saboteur', startCash: 20000, rebuild: 0.5, maxLevel: 4, homeShare: 0.5, startLevel: 2, oldTownStands: 1, grow: 0.35, guard: 0.25, strike: 0.4, price: 0.95, henchmen: 'Baristas' },
  blenders: { id: 'blenders', name: 'The Boardwalk Blenders', product: 'Smoothies', boss: 'Brock "The Blender" Bodine', color: 0xff9f1c, accent: 0x00a6a6, home: 'boardwalk', personality: 'Aggressive swarm', startCash: 10000, rebuild: 0.4, maxLevel: 4, homeShare: 0.55, startLevel: 2, oldTownStands: 1, grow: 0.3, guard: 0.2, strike: 0.5, price: 0.9, henchmen: 'Smoothie Bros' },
};
export const PLAYER_COLOR = 0xf6d33c;
/** Rank needed to buy land in a district (Maple Row from the start, Old Town at Rank 2; the rest is an assumption until the spec says otherwise). */
export const DISTRICT_RANK: Record<string, number> = { maple: 1, oldtown: 2, campus: 3, downtown: 3, boardwalk: 3, harbor: 3, groves: 3, hilltop: 3 };

// ---------- defenses, crew and raids (canon sections 11–14) ----------
/** hp: the chopping a breach takes. breachDps: damage a second to every raider at the fence line while it stands. slow: raiders' movement while it stands. */
export interface PerimeterTier { tier: number; name: string; rank: number; cost: number; hp: number; breachDps: number; slow: number; repair: number }
export const PERIMETERS: PerimeterTier[] = [
  { tier: 1, name: 'Picket Fence', rank: 1, cost: 150, hp: 150, breachDps: 0, slow: 0, repair: 15 },
  { tier: 2, name: 'Chain-Link Fence', rank: 2, cost: 1200, hp: 500, breachDps: 0, slow: 0, repair: 120 },
  { tier: 3, name: 'Sharpened Stakes', rank: 4, cost: 6000, hp: 1200, breachDps: 2, slow: 0, repair: 600 },
  { tier: 4, name: 'Barbed Wire', rank: 6, cost: 25000, hp: 2500, breachDps: 4, slow: 0.3, repair: 2500 },
  { tier: 5, name: 'Citrus Fortress Wall', rank: 8, cost: 100000, hp: 5000, breachDps: 0, slow: 0, repair: 10000 },
];
/** The fence-line bonus: defenders deal +25% while any perimeter stands; a Citrus Fortress Wall adds its own +25% (+50% in all). Gone once it falls. */
export const FENCE_DEFENDER_BONUS = 0.25;

export type GadgetId = 'alarm' | 'goose' | 'slick' | 'sprinkler' | 'floodlights' | 'watchtower';
export const GADGETS: Record<GadgetId, { name: string; rank: number; cost: number; detection: number; text: string }> = {
  alarm: { name: 'Tin-Can Alarm', rank: 2, cost: 100, detection: 0.15, text: '+15% raid detection' },
  goose: { name: 'Guard Goose', rank: 2, cost: 400, detection: 0.15, text: '+15% detection; honks and stuns the first attacker' },
  slick: { name: 'Lemon-Peel Slick', rank: 4, cost: 250, detection: 0, text: 'The first 3 attackers slip (stunned 4s)' },
  sprinkler: { name: 'Sprinkler Ambush', rank: 4, cost: 800, detection: 0, text: 'Soaked attackers deal 20% less damage' },
  floodlights: { name: 'Floodlights', rank: 5, cost: 1500, detection: 0, text: 'Cancels the night stealth bonus' },
  watchtower: { name: 'Watchtower', rank: 6, cost: 5000, detection: 0.3, text: '+30% detection' },
};
export const GADGET_SLOTS = (standLevel: number) => (standLevel >= 4 ? 3 : 2);

export type WeaponId = 'fists' | 'clubs' | 'hatchets';
export const WEAPONS: Record<WeaponId, { name: string; rank: number; cost: number; hit: number; chop: number }> = {
  fists: { name: 'Fists', rank: 1, cost: 0, hit: 10, chop: 5 },
  clubs: { name: 'Clubs', rank: 3, cost: 150, hit: 18, chop: 10 },
  hatchets: { name: 'Hatchets', rank: 6, cost: 1200, hit: 24, chop: 40 },
};
export type GearId = 'none' | 'vest' | 'pro';
export const GEAR: Record<GearId, { name: string; rank: number; cost: number; hp: number; armor: number }> = {
  none: { name: 'No padding', rank: 1, cost: 0, hp: 0, armor: 0 },
  vest: { name: 'Padded Vest', rank: 3, cost: 200, hp: 40, armor: 0 },
  pro: { name: 'Pro Gear', rank: 6, cost: 1500, hp: 100, armor: 0.2 },
};
/** Every fighter, guard or henchman: 100 HP, Nerve 50 (the % chance to stand firm), one swing every 1.5 s. */
export const GUARD_BASE = { hp: 100, nerve: 50, swing: 1.5 };
export const GUARD_LEVEL_TITLES = ['Rookie', 'Regular', 'Veteran', 'Elite', 'Legend'];
export const GUARD_WAGE = [15, 25, 40, 60, 90];
export const GUARD_FEE = [50, 150, 400, 1000, 2500];
export const GUARD_XP_TO_LEVEL = [0, 3, 8, 15, 25];
export const ROSTER_BASE = 2;
export const CLUBHOUSE = [
  { level: 1, cost: 2000, beds: 6 },
  { level: 2, cost: 15000, beds: 12 },
  { level: 3, cost: 80000, beds: 24 },
];
export const HIRE_RANK = 2;
export const RAID_RANK = 3;
export const SQUAD_CAP = (rank: number) => (rank >= 7 ? 12 : rank >= 5 ? 8 : 5);
/** Stand hit points by level (how much chopping a Smash needs). */
export const STAND_HP = STAND_LEVELS.map((l) => l.hp);
/** Repair a wrecked stand for this share of what was invested in it. */
export const REBUILD_SHARE = 0.15;
export const REPAIR_SHARE = 0.15; // of the fence's price, times the share of HP lost
export const NO_RAID_DAYS = 5;
export const RESPECT_DAYS = 3;
/** Rival raids on the player per week, by Threat (Classic). */
export const RAIDS_PER_WEEK = [1, 2, 3, 4, 6];
/** Typical raiding party by Threat: size range and weapon odds (fists, clubs, hatchets). */
export const RAID_PARTY: { size: [number, number]; weapons: [number, number, number] }[] = [
  { size: [2, 3], weapons: [1, 0, 0] },
  { size: [3, 5], weapons: [0.7, 0.3, 0] },
  { size: [5, 8], weapons: [0.3, 0.7, 0] },
  { size: [8, 12], weapons: [0.1, 0.6, 0.3] },
  { size: [12, 20], weapons: [0, 0.5, 0.5] },
];
export const DETECTION_BASE = 0.5;
export const NIGHT_STEALTH = 0.25;
/** Raids travel 1–3 game hours by distance (canon). The build maps straight-line plot distance onto that range:
 * across the whole bay (about 350 map units) is 3 hours, so Maple Row to the Boardwalk (about 100) is 1.5 hours. */
export const RAID_TRAVEL = { min: 60, max: 180, span: 350 }; // placeholder: spec gap (the distance scale)
/** Rival raids set out between 20:15 and 01:45 (15-minute steps), so they land between 21:15 and 04:45. */
export const RAID_LEAVE = { first: 20 * 60 + 15, steps: 23 }; // placeholder: spec gap (departure window)
/** Rivals raiding each other arrive at 02:00. */
export const RIVAL_RAID_AT = 26 * 60;
/** Your 'tonight' raids hit at 01:00 until raid travel times land (crew's Raid Planner). */
export const PLAYER_RAID_AT = 25 * 60;
/** A Delivery Raid hits within the pickup's 2-hour loading window. */
export const DELIVERY_WINDOW = 120;
export const DAYTIME_RAID_REP = { raid: 0.1, smash: 0.2 };
export const TRAITS = [
  'Tough Cookie', 'Night Owl', 'Eagle Eye', 'Hothead', 'Loyal', 'Butterfingers', 'Sprinter',
  'Gentle Giant', 'Lumberjack', 'Smooth Talker', 'Goose Whisperer', 'Former Rival', 'Sneaky',
] as const;
export type Trait = (typeof TRAITS)[number];
/**
 * The fight model (spec "How a fight resolves"; npm run combat checks the canon anchors).
 * Times are fight-seconds, one per game minute; distances are plot-lengths.
 */
export const COMBAT = {
  firstStrike: { bonus: 0.25, seconds: 5 }, // an undetected raid: +25% to every swing and chop for 5 s
  soak: 0.2, // Sprinkler Ambush: soaked raiders deal 20% less damage all fight
  goose: { stun: 3 }, // Guard Goose: stuns the first raider to arrive (the next one too with a Goose Whisperer)
  slick: { stun: 4, count: 3 }, // Lemon-Peel Slick: the first 3 raiders slip
  grabMinutes: 10, // time on target for a Shakedown or Sabotage
  objectiveMinutes: 60, // a Smash that isn't done by then leaves the stand only Damaged
  butterfingers: 0.1, // Butterfingers: chance per fight to drop the weapon and finish on fists
  sprinter: 1.25, // Sprinter: +25% Speed
  speed: 1 / 3, // placeholder: spec gap. Base Speed: one plot-length every 3 seconds
  approach: 1, // placeholder: spec gap. Raiders walk the last plot-length in, so Sprinters reach the line first
  giveUpSeconds: 120, // placeholder: spec gap. Raiders who can't break through and win the brawl by then go home
  reach: 0.12, // placeholder: spec gap. How far a swing reaches
  spacing: 0.1, // placeholder: spec gap. Shoulder room along a fence or a line
  fenceAt: 0.4, // the perimeter's distance out from the stand
  holdAt: 0.2, // where guards stand when there's no perimeter
  standWidth: 0.5,
};
/** Henchmen strength by Threat: level and padding. */
export const HENCHMEN = [
  { level: 1, gear: 'none' as GearId },
  { level: 2, gear: 'none' as GearId },
  { level: 3, gear: 'vest' as GearId },
  { level: 4, gear: 'vest' as GearId },
  { level: 5, gear: 'pro' as GearId },
];

// ---------- modes, difficulty, winning and losing (spec: Game modes and winning) ----------
export type Mode = 'campaign' | 'sandbox' | 'endless';
export type Difficulty = 'laidback' | 'classic' | 'cutthroat';
export type WinCondition = 'domination' | 'economic' | 'none';
export const MODES: Record<Mode, { label: string; blurb: string }> = {
  campaign: { label: 'Story Campaign', blurb: 'Lottie\'s Corner to the whole Bay. Win by Domination, then keep squeezing.' },
  sandbox: { label: 'Sandbox: Turf War', blurb: 'Your rules: pick the win condition, or turn combat off with Peaceful.' },
  endless: { label: 'Endless Summer', blurb: 'No finish line. Play for the highest Peak Success Score.' },
};
/** Difficulty changes how often rivals come and how hard setbacks land, never the rules. */
export const DIFFICULTY: Record<Difficulty, {
  label: string; blurb: string;
  raids: number; // rival raids on the player, × Classic
  threat: number; // added to Threat (minimum 1)
  respectDays: number; // a rival whose raid you beat stays away this long
  bustOnly: boolean; // a lost raid only Busts your stand (closed until a repair), never Wrecks it
  cookieJar: 'always' | 'perAct' | 'never';
  canLose: boolean;
  notice: number; // an undetected raid still warns this many game minutes before it hits
  raidPause: boolean; // raid warnings auto-pause by default
}> = {
  laidback: { label: 'Laid Back', blurb: 'Half the raids. Stands get Busted, never Wrecked. No game over.', raids: 0.5, threat: -1, respectDays: 5, bustOnly: true, cookieJar: 'always', canLose: false, notice: 30, raidPause: true },
  classic: { label: 'Classic', blurb: 'The intended balance. Lottie\'s Cookie Jar bails you out once per act.', raids: 1, threat: 0, respectDays: 3, bustOnly: false, cookieJar: 'perAct', canLose: true, notice: 15, raidPause: true },
  cutthroat: { label: 'Cutthroat', blurb: 'Half again as many raids, a 1-day Respect cooldown, no Cookie Jar.', raids: 1.5, threat: 0, respectDays: 1, bustOnly: false, cookieJar: 'never', canLose: true, notice: 5, raidPause: false },
};
/** Laid Back: repair a Busted stand for this share of what was invested (canon; Appendix A's 15% is older). */
export const BUSTED_REPAIR_SHARE = 0.1;
/** Cash below $0 at dawn this many days running, and the Cookie Jar is the last chance. */
export const IN_THE_RED_DAYS = 3;
/** Domination: every rival eliminated and at least this share of every district's purchasable plots. */
export const MAJORITY = 0.51;
/** Sandbox's Economic win: a Success Score target picked from the rank thresholds (default Rank 8). */
export const ECONOMIC_DEFAULT_RANK = 8;
/** Peaceful (Sandbox): Vera finally sells, at this multiple of her cash and buildings, once Weakened. */
export const PEACEFUL_VERA_BUYOUT = 3;
/** The Beloved ending needs this Reputation or better (and more buyouts than Smashes and HQ captures). */
export const BELOVED_STARS = 4;
/** Campaign acts until the story beats land: the act each rank falls in (spec: Acts and ranks, simulated Classic rank-up days). */
export const ACT_BY_RANK = [1, 1, 1, 2, 3, 3, 4, 4, 5, 5];
export const ACTS = ["Lottie's Corner", 'Surf & Turf', 'Grounds for Revenge', 'Fields & Fizz', 'The Big Squeeze'];
/** Marisol's loans from the First Bank of Citrine Bay. */
export const LOAN = { share: 0.5, weeklyRate: 0.03, weeks: 4, missesToRepossess: 2 };
