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
  tableInvested: 100, // Lottie's own Folding Table counts as $100 invested, not the $150 a new one costs (Appendix A)
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
/** Fast raid nights: from closing until an alert, a raid night runs at 12× by itself (a setting, on by default). */
export const QUIET_NIGHT_SPEED = 12; // a raid night races to its warning (a night with nothing coming is skipped outright)
/** A raid warning's woodblock ticks each beat, twice as often in the last this-many game minutes before it lands. */
export const RAID_TICKS_FAST_MINUTES = 15; // spec: Adaptive music, Raid alert
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
/** Cool seasons shift the unbanded kinds' temperatures down: Cloudy, Rainy and Storm (TEMP_BANDS keep the rest). */
export const SEASON_TEMP_SHIFT: Record<Season, number> = { summer: 0, fall: -8, winter: -22, spring: -5 };
/** The dawn forecast is right this often; a miss is one step off on WEATHER_STEPS (weather.ts). */
export const FORECAST_ACCURACY = 0.8;
/** The weather scale, sunniest first: a forecast miss is one step along it, Warm for Hot and never Storm for Hot. */
export const WEATHER_STEPS: WeatherKind[] = ['scorcher', 'hot', 'warm', 'cloudy', 'rainy', 'storm'];
/** Temperatures that hold in every season (spec: Weather table): Scorcher 95°F+, Hot 85–94°F, Warm 72–84°F. Cloudy, Rainy and Storm have no band. */
export const TEMP_BANDS: Partial<Record<WeatherKind, [number, number]>> = { scorcher: [95, Infinity], hot: [85, 94], warm: [72, 84] };
/** The Radio Jingle's (M3) look-ahead: the next 2 days' forecasts on the Bugle and the radio. */
export const LOOK_AHEAD_DAYS = 2;

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
// Every card pours the same stock, the Classic base (half a lemon, a scoop of sugar, 3 cubes: $0.16), plus its
// extra, so the totals hit the spec's cost per cup at normal market prices and switching cards wastes no stock
// (spec: Recipe cards; stock is the cups of lemons, sugar and ice a stand can hold).
export const RECIPES: Record<RecipeId, Recipe> = {
  classic: { label: 'Classic Lemonade', lemonsPerPitcher: 5, sugarPerPitcher: 10, icePerCup: 3, extraPerCup: 0, priceBonus: 0, blurb: 'Everyone likes it', shines: [], start: true },
  pink: { label: 'Pink Lemonade', lemonsPerPitcher: 5, sugarPerPitcher: 10, icePerCup: 3, extraPerCup: 0.03, priceBonus: 0.05, blurb: 'Kids and families love it', shines: ['maple'], start: true },
  mint: { label: 'Mint Lemonade', lemonsPerPitcher: 5, sugarPerPitcher: 10, icePerCup: 3, extraPerCup: 0.04, priceBonus: 0.05, blurb: 'Students and joggers love it', shines: ['campus', 'boardwalk'], start: true },
  strawberry: { label: 'Strawberry Lemonade', lemonsPerPitcher: 5, sugarPerPitcher: 10, icePerCup: 3, extraPerCup: 0.11, priceBonus: 0.1, blurb: 'Kids and tourists love it', shines: ['maple', 'boardwalk'] },
  frozen: { label: 'Frozen Lemonade', lemonsPerPitcher: 5, sugarPerPitcher: 10, icePerCup: 3, extraPerCup: 0.09, priceBonus: 0.15, blurb: 'Tourists and students love it', shines: ['boardwalk'], season: 'summer', heatWave: true },
  honeyGinger: { label: 'Honey-Ginger Hot Lemonade', lemonsPerPitcher: 5, sugarPerPitcher: 10, icePerCup: 3, extraPerCup: 0.09, priceBonus: 0.1, blurb: 'Seniors love it, even in Winter', shines: ['maple', 'oldtown'], season: 'winter' },
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
/**
 * Appendix A, Customer segments. Price tolerance only decides who leaves first over a stand's ceiling (the
 * district's tolerance is already the blend of its crowd); patience is the longest line, in people ahead, a
 * buyer will join; peaks are [start, end) clock hours when the segment makes up more of the crowd.
 * `sweet` is the Sweetness a segment leans to; 'classic' means it doesn't care either way.
 */
export const SEGMENTS: Record<SegmentId, { label: string; priceTolerance: number; patience: number; favorites: RecipeId[]; sweet: Sweetness; peaks: [number, number][] }> = {
  kids: { label: 'Kids', priceTolerance: 0.8, patience: 4, favorites: ['pink', 'strawberry'], sweet: 'extra', peaks: [[13, 17]] },
  families: { label: 'Families', priceTolerance: 1.0, patience: 6, favorites: ['pink', 'classic'], sweet: 'classic', peaks: [[17, 20]] },
  seniors: { label: 'Seniors', priceTolerance: 0.9, patience: 10, favorites: ['honeyGinger', 'classic'], sweet: 'less', peaks: [[8, 11]] },
  students: { label: 'Students', priceTolerance: 0.85, patience: 6, favorites: ['mint', 'frozen'], sweet: 'classic', peaks: [[12, 18]] },
  office: { label: 'Office workers', priceTolerance: 1.2, patience: 3, favorites: ['sparkling'], sweet: 'less', peaks: [[8, 9], [12, 14]] },
  tourists: { label: 'Tourists', priceTolerance: 1.3, patience: 8, favorites: ['strawberry', 'frozen'], sweet: 'classic', peaks: [[11, 17]] },
  workers: { label: 'Workers', priceTolerance: 0.9, patience: 5, favorites: ['halfAndHalf'], sweet: 'classic', peaks: [[12, 13], [17, 18]] },
  highRollers: { label: 'High rollers', priceTolerance: 2.0, patience: 2, favorites: ['lavender', 'secretReserve'], sweet: 'classic', peaks: [[14, 19]] },
};
/** How much more of the crowd a segment makes up in its peak hours. placeholder: spec gap (the spec gives no size). */
export const PEAK_BOOST = 1.8;
/** Foot traffic shape over business hours (commute, lunch, afternoon heat, evening stroll). */
export const HOURLY_TRAFFIC = [0.9, 0.7, 0.7, 0.9, 1.3, 1.2, 1.1, 1.3, 1.3, 1.0, 1.1, 1.0]; // 08..19
export const BASE_STOP_CHANCE = 0.25;
/** Effective selling hours of the 12 open (peaks, lulls and queues): a stand pours at most cups/hour × 10 a day. */
export const SELLING_HOURS = 10;
/**
 * Price fit around a stand's ceiling (spec: Pricing): +1% appeal per 1% under, up to +25%; a quarter of
 * buyers lost per 10% over (×2.5 per 100% over), and nobody buys at 40% over (noneOver), whatever their tolerance.
 */
export const PRICE_FIT = { underMax: 0.25, overSlope: 2.5, noneOver: 0.4 };
/** Price tolerance by district (Appendix A, land table): the blend of each district's usual crowd. */
export const PRICE_TOLERANCE: Record<string, number> = { maple: 1.0, oldtown: 1.0, campus: 0.9, downtown: 1.15, boardwalk: 1.2, harbor: 0.9, groves: 0.9, hilltop: 2.0 };
/** Rival stands within 2 plots cost a stand at most this share of its own passersby (demand constants). */
export const RIVAL_SHARE_CAP = 0.35;
/** Majority (51%+ of a district): your stands there sell +10% (curb appeal ×1.1); rival stands there −10% appeal. */
export const MAJORITY_CURB = { player: 1.1, rival: 0.9 };
/** District perks at Full Control that move demand (Land and territory; demand constants). */
export const PERKS = {
  townFavorite: 0.1, // Old Town: +10% traffic at your stands in Old Town and Maple Row
  orchardFresh: 0.1, // The Groves: +10% traffic at all your stands
  powerLunch: { mult: 1.5, from: 12, to: 14 }, // Downtown: lunch rush ×1.5 in Downtown and Old Town. placeholder: spec gap (window = office lunch peak)
  touristTrap: 0.2, // The Boardwalk: tourists pay +20% everywhere
  wordOfMouth: 0.5, // Campus & Arts: local campaigns half price everywhere
};

// ---------- stands ----------
/**
 * `stock`: the cups of lemons, sugar and ice a stand holds, one and a half days at full pour (spec: Stands).
 * `storage`: those cups in Classic's mix (half a lemon, a scoop and 3 cubes a cup), in whole packs. Every card pours
 * that same stock (RECIPES below), so every card holds the same (economy.ts storageFor).
 */
export interface StandLevel { level: number; name: string; cost: number; draw: number; capacityPerHour: number; topPrice: number; upkeep: number; hp: number; guardPosts: number; stock: number; storage: Record<SupplyId, number> }
export const STAND_LEVELS: StandLevel[] = [
  { level: 1, name: 'The Folding Table', cost: 150, draw: 1.0, capacityPerHour: 20, topPrice: 1.5, upkeep: 5, hp: 100, guardPosts: 1, stock: 300, storage: { lemons: 160, sugar: 300, ice: 900 } },
  { level: 2, name: 'The Wooden Stand', cost: 400, draw: 1.5, capacityPerHour: 50, topPrice: 2.0, upkeep: 15, hp: 300, guardPosts: 2, stock: 750, storage: { lemons: 380, sugar: 750, ice: 2280 } },
  { level: 3, name: 'The Kiosk', cost: 3500, draw: 2.3, capacityPerHour: 120, topPrice: 3.0, upkeep: 60, hp: 800, guardPosts: 3, stock: 1800, storage: { lemons: 900, sugar: 1800, ice: 5400 } },
  { level: 4, name: 'The Lemon Shack', cost: 60000, draw: 3.5, capacityPerHour: 300, topPrice: 4.5, upkeep: 300, hp: 2000, guardPosts: 4, stock: 4500, storage: { lemons: 2260, sugar: 4500, ice: 13500 } },
  { level: 5, name: 'The Citrus Palace', cost: 650000, draw: 5.0, capacityPerHour: 700, topPrice: 7.0, upkeep: 1500, hp: 5000, guardPosts: 6, stock: 10500, storage: { lemons: 5260, sugar: 10500, ice: 31500 } },
];
export const BUILDING_VALUE_SHARE = 0.75;
/** Rank needed to upgrade TO each level (index = level - 1). */
export const STAND_RANK_GATE = [1, 1, 3, 5, 7];

// ---------- stand specializations (spec: Stands, Specializations; balance-tables.md) ----------
export type SpecId = 'express' | 'fancy' | 'fortified' | 'roof';
export const SPEC_IDS: SpecId[] = ['express', 'fancy', 'fortified', 'roof'];
/** The slots: the first opens at The Kiosk (L3), the second at The Citrus Palace (L5). Fitting one, or swapping what it holds, costs its price. */
export const SPEC_SLOTS = [{ level: 3, cost: 2000 }, { level: 5, cost: 40000 }];
/**
 * Each slot holds one of these. `service` multiplies the stand's cups an hour, `topPrice` its top price, `hp` its max
 * HP; `traffic` is the Billboard Roof's term in the marketing number at each of your stands within 2 plots.
 */
export interface Specialization { name: string; effect: string; best: string; service?: number; topPrice?: number; hp?: number; traffic?: number }
export const SPECIALIZATIONS: Record<SpecId, Specialization> = {
  express: { name: 'Express Window', effect: '+30% service (cups/hour)', best: 'A stand with a line out the door', service: 1.3 },
  fancy: { name: 'Fancy Menu', effect: '+20% top price', best: 'Rich crowds: Downtown, The Boardwalk, Hilltop Estates', topPrice: 1.2 },
  fortified: { name: 'Fortified Frame', effect: '+50% HP', best: 'A front-line stand rivals keep targeting', hp: 1.5 },
  roof: { name: 'Billboard Roof', effect: '+15% traffic to your stands within 2 plots', best: 'The middle of your own cluster', traffic: 0.15 },
};

// ---------- marketing ----------
export const BRAND_TIERS = [
  { tier: 1, name: 'Hand-Painted Signs', rank: 1, cost: 100, traffic: 0.05 },
  { tier: 2, name: 'Flyers & Sidewalk Chalk', rank: 3, cost: 1500, traffic: 0.12 },
  { tier: 3, name: 'Radio Jingle', rank: 4, cost: 12000, traffic: 0.22 },
  { tier: 4, name: 'Billboards & TV Spot', rank: 7, cost: 90000, traffic: 0.35, unlocks: 'the Billboard building' },
  { tier: 5, name: 'The Lemon Blimp', rank: 8, cost: 500000, traffic: 0.5 },
];
export type CampaignId = 'sandwichBoard' | 'freeSamples';
export const CAMPAIGNS: Record<CampaignId, { name: string; rank: number; blurb: string; costPerDay?: number; traffic: number; days: number; samples?: number; reputation?: number; maxLevel?: number }> = {
  sandwichBoard: { name: 'Sandwich-Board Kid', rank: 2, blurb: '+20% foot traffic today (L1–L3 stands)', costPerDay: 40, traffic: 0.2, days: 1, maxLevel: 3 },
  freeSamples: { name: 'Free Sample Day', rank: 2, blurb: 'Give away 100 cups: +0.1 star and +15% traffic for 3 days', traffic: 0.15, days: 3, samples: 100, reputation: 0.1 },
};
/**
 * Local campaigns that work one district for a day (spec: Local campaigns). There is only one Sunny, so the mascot
 * walks one district a day. A Coupon Blitz takes `priceCut` off your prices there, and its appeal is ×`appeal` in
 * place of what that cut would win on the price-fit curve; it counts in the split with rival stands nearby.
 */
export type DistrictCampaignId = 'sunny' | 'couponBlitz';
export const DISTRICT_CAMPAIGNS: Record<DistrictCampaignId, { name: string; rank: number; blurb: string; costPerDay?: number; traffic?: number; priceCut?: number; appeal?: number; onePerDay?: boolean }> = {
  sunny: { name: 'Sunny the Lemon', rank: 3, blurb: '+25% foot traffic at your stands in one district today', costPerDay: 300, traffic: 0.25, onePerDay: true },
  couponBlitz: { name: 'Coupon Blitz', rank: 4, blurb: 'Your prices −25% in one district today: +40% appeal, and they win the split', priceCut: 0.25, appeal: 1.4 },
};
/** Every local campaign: a stand's own and a district's. */
export type LocalCampaignId = CampaignId | DistrictCampaignId;
/**
 * The Billboard building (spec: Local campaigns): Rank 7 once M4 is up, $25,000 on a plot of its own, permanent. Each
 * standing one adds +20% to the marketing number of its owner's stands within 2 plots, and other owners' stands there
 * lose 10% curb appeal: once, however many Billboards reach them (placeholder: spec gap). Its HP is a Lemon Grove's
 * (placeholder: spec gap). FACILITIES (vip.ts) builds it on a Street, Prime or Landmark plot.
 */
export const BILLBOARD = { rank: 7, brandTier: 4, cost: 25000, hp: 800, traffic: 0.2, rivalCurb: 0.9 };

// ---------- the calendar: fairs, festivals and Taste-Offs (spec: Events and the living world) ----------
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
/** Taste-Offs: the winner, rivals included, gets +0.1 star and +20% traffic in the district for 7 days. */
export const TASTE_OFF = {
  stars: 0.1, traffic: 0.2, days: 7,
  prize: 500, // to the winner, rivals included. placeholder: spec gap (the spec lists fair prizes but sets no amount)
  // Judging is the build's own (the spec gives no formula): the three judges' marks multiply.
  recipeHit: 1.2, hit: 1.1, near: 1, miss: 0.85,
  bands: [0.6, 0.85, 1], // price bands as shares of the booth's top price: bargain, fair, worth a little extra
  nearShare: 0.7, // a rival who misses a hint still lands near it this often
};
/** How often each contestant reads a judge's hint right. placeholder: spec gap */
export const TASTE_OFF_SKILL: Record<RivalId | 'local', number> = { blenders: 0.6, hollis: 0.65, sourwood: 0.5, fizzco: 0.45, coldbrew: 0.45, snootwater: 0.6, local: 0.4 };
/** Event Sponsorship (Rank 5): $2,000 per festival day, +50% traffic for your stands in the festival's district.
 * It's a local campaign, so Word of Mouth (Campus & Arts at Full Control, PERKS.wordOfMouth) halves it: $1,000 a day. */
export const SPONSORSHIP = { rank: 5, perDay: 2000, traffic: 0.5 };
/** Tilly, out-brewed at the County Fair, sells a Field at 1.5× land value instead of her home-turf 2.5×. */
export const TILLY_FIELD_BUYOUT = 1.5;
/** Campaign: Tilly duels at the County Fairs from Act 4 on; its Act 4 edition is year 2's (Days 71-77) on target pacing. */
export const TILLY_FAIR_ACT = 4;
/** Campaign: Tilly won't sell out or be stormed before year 2's County Fair (Days 71-77) has run its Taste-Off (design-spec open question 5). */
export const TILLY_WAITS_FOR_FAIR = true;
export const TILLY_FAIR_YEAR = 2;

// ---------- random events (spec: Events and the living world, Random events) ----------
/** The scheduler: nothing before Day 6, then about one event every 5–7 days, at dawn or breaking in mid-day (10:00–15:00).
 * placeholder: spec gap (the spec fixes only "one harmful at a time, none before Day 6") */
export const EVENTS = { firstDay: 6, firstSpread: 2, gap: [5, 7] as [number, number], midday: [10 * 60, 15 * 60] as [number, number], lookAhead: 2 };
/** Heat Wave: 3 Scorchers in a row. The chance a season has one and the season days it can start on: mostly Summer, sometimes
 * early Fall or late Spring, never Winter. Other Scorchers that season are thinned, so the weather table's Scorcher odds still
 * hold on average. placeholder: spec gap */
export const HEAT_WAVE = {
  days: 3,
  chance: { summer: 0.4, fall: 0.1, winter: 0, spring: 0.06 } as Record<Season, number>,
  window: { summer: [3, 12], fall: [1, 4], winter: [1, 1], spring: [9, 12] } as Record<Season, [number, number]>,
};
/** The rest of the table: how long each runs (spec) and its odds against the others when the scheduler rolls.
 * placeholder: spec gap (the odds; Captain Squawk's "until restocked" ends after 3 days at most, as his lemons would spoil) */
export const RANDOM_EVENTS = {
  lemonBlight: { days: 5, weight: 1 }, sugarShortage: { days: 5, weight: 1 }, viralVideo: { days: 2, weight: 1.2 }, foodCritic: { days: 1, weight: 1 },
  powerOutage: { days: 1, weight: 1 }, celebrity: { days: 1, weight: 1 }, parade: { days: 1, weight: 1 }, roadworks: { days: 3, weight: 1 },
  touristBus: { days: 1, weight: 1 }, captainSquawk: { days: 3, weight: 1 },
};
/** A district or street event lands where you sell this often (else anywhere with stands). placeholder: spec gap */
export const EVENT_NEAR_YOU = 0.7;
/** Lemon Blight and Sugar Shortage double a Market price, on top of the daily ±20% (spec). */
export const SUPPLY_SHOCK = 2;
/** Traffic surges multiply on top of marketing (spec: Viral Video, Celebrity Sighting and Parade Route ×2, Roadworks −50%).
 * A street is 4–6 adjacent columns of one district, both sides. placeholder: spec gap (the street's length; the Tourist Bus's +50%) */
export const EVENT_TRAFFIC = { viralVideo: 2, celebrity: 2, parade: 2, roadworks: 0.5, touristBus: 1.5, street: [4, 6] as [number, number] };
/** Tourist Bus: tourists are this share of the district's walkers for the day. placeholder: spec gap ("tourists fill one district") */
export const TOURIST_BUS_SHARE = 0.7;
/** Food Critic: a short line, a fair price and a fitting card. All three: +0.1 star; anything less: −0.1 (spec). The line is
 * short while under 5% of the stand's walkers leave over it. placeholder: spec gap (the 5%) */
export const FOOD_CRITIC = { stars: 0.1, line: 0.05 };
/** L4 The Lemon Shack and up make their own ice as they pour, at the Market price, so none melts overnight (spec). */
export const ICE_MACHINE_LEVEL = 4;
/** Kids' Lemonade Day: planned most Summers (so at most once a year) on a weekday between season days 3 and 12. One kid stand
 * per district, beside a plot within 2 of one of your stands where you sell; each has a Folding Table's pull and pours at $0.50.
 * Raiding one costs 0.5 star (spec), a front page and Lottie's respect.
 * placeholder: spec gap (the odds, the window, the weekday, one stand per district, the price) */
export const KIDS_DAY = { chance: 0.75, window: [3, 12] as [number, number], perDistrict: 1, price: 0.5, stars: 0.5 };
/** 101.5 The Squeeze plays from the radio on every L3+ stand during business hours (spec). */
export const RADIO_STAND_LEVEL = 3;

// ---------- reputation ----------
export const repMultiplier = (stars: number) => 0.7 + (0.6 * (stars - 1)) / 4; // 0.7× at 1★ .. 1.3× at 5★
/**
 * Reputation's nightly drift (spec: Reputation; Appendix A): 5% of the gap toward a target of 3.0 stars plus 0.4
 * per average stand level above L1, capped at 4.6, less 0.1 star per 10% of would-be buyers who left empty-handed
 * (too pricey, line too long, sold out; read as linear). Event changes apply at once, on their own.
 */
export const REP_DRIFT = { base: 3.0, perLevel: 0.4, cap: 4.6, rate: 0.05, dropPerShare: 1.0, min: 1, max: 5 };

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

/**
 * Lottie's Tips (spec "Success Score and ranks": "You pick 1 of 3 Lottie's Tips perks from a pool of about 24"; canon
 * 322): each rank-up deals TIP_CARDS of these and you keep one for good (src/sim/perks.ts says where each one works).
 * Seven are the spec's own at its numbers: +10% price tolerance, guards heal a day faster, land 10% cheaper, geese stun
 * twice, campaigns last 50% longer, +20% defense at night, buyouts 15% cheaper. Its eighth, open at 07:00, waits for
 * a business day that can start an hour early (spec gap). The other seventeen and their numbers are placeholders:
 * spec gap. `value` is the tip's one number; `rank`, the rank a hand must be for before it's dealt (it does nothing
 * sooner); `fight`, a tip about raids and guards, never dealt in Peaceful.
 */
export type TipId =
  | 'sweetTalk' | 'longRun' | 'freshPaint' | 'chattyRegulars' | 'coolCellar' | 'goldStars'
  | 'goodDirt' | 'firmHandshake' | 'sharpPencil' | 'handyHands' | 'steadyPour'
  | 'chickenSoup' | 'gooseWhistle' | 'porchLight' | 'pepTalk' | 'lightSleeper' | 'nosyNeighbors' | 'lockbox' | 'elbowGrease'
  | 'quickStudy' | 'helpWanted' | 'familyRates' | 'letItGo' | 'lowProfile';
export const TIPS: Record<TipId, { name: string; text: string; value: number; rank?: number; fight?: true }> = {
  sweetTalk: { name: 'Sweet Talk', text: '+10% price tolerance', value: 0.1 }, // spec: your crowds pay ×1.1 (the ceiling)
  longRun: { name: 'Long Run', text: 'Campaigns last 50% longer', value: 0.5 }, // spec: a stand campaign's days, rounded up
  freshPaint: { name: 'Fresh Paint', text: '+5% curb appeal', value: 0.05 },
  chattyRegulars: { name: 'Chatty Regulars', text: '+5% foot traffic', value: 0.05 },
  coolCellar: { name: 'Cool Cellar', text: 'Lemons keep 2 days longer', value: 2 },
  goldStars: { name: 'Gold Stars', text: 'Lottie’s goals pay 50% more', value: 0.5 },
  goodDirt: { name: 'Good Dirt', text: 'Land 10% cheaper', value: 0.1 }, // spec
  firmHandshake: { name: 'Firm Handshake', text: 'Buyouts 15% cheaper', value: 0.15, rank: 4 }, // spec: Plot and Faction Buyouts (Sit-downs from Rank 4)
  sharpPencil: { name: 'Sharp Pencil', text: 'Auction wins cost 10% less', value: 0.1, rank: 3 },
  handyHands: { name: 'Handy Hands', text: 'Repairs 25% cheaper', value: 0.25 },
  steadyPour: { name: 'Steady Pour', text: 'Bottles fill 10% faster', value: 0.1, rank: 5 }, // Bottling Works from Rank 5
  chickenSoup: { name: 'Chicken Soup', text: 'Guards heal a day faster', value: 1, fight: true }, // spec
  gooseWhistle: { name: 'Goose Whistle', text: 'Geese stun twice', value: 2, fight: true }, // spec
  porchLight: { name: 'Porch Light', text: '+20% defense at night', value: 0.2, fight: true }, // spec: your guards' HP, defending at night
  pepTalk: { name: 'Pep Talk', text: 'Guards on post +10 Nerve', value: 10, fight: true },
  lightSleeper: { name: 'Light Sleeper', text: 'Raid warnings 30 minutes sooner', value: 30, fight: true },
  nosyNeighbors: { name: 'Nosy Neighbors', text: '+10% raid detection', value: 0.1, fight: true },
  lockbox: { name: 'Lockbox', text: 'Shakedowns take 25% less', value: 0.25, fight: true },
  elbowGrease: { name: 'Elbow Grease', text: 'Your raiders chop 15% harder', value: 0.15, rank: 3, fight: true }, // raids from Rank 3
  quickStudy: { name: 'Quick Study', text: 'Guards earn 50% more fight XP', value: 0.5, fight: true },
  helpWanted: { name: 'Help Wanted', text: 'One more recruit to pick from', value: 1, fight: true },
  familyRates: { name: 'Family Rates', text: 'Hiring 25% cheaper', value: 0.25, fight: true },
  letItGo: { name: 'Let It Go', text: 'Grudges cool twice as fast', value: 1 },
  lowProfile: { name: 'Low Profile', text: 'Rivals pay you 20% less mind', value: 0.2 }, // Attention
};
/** Cards in a rank-up's hand. */
export const TIP_CARDS = 3;

// ---------- land (section 10) ----------
// Land carries no tax and no upkeep (spec: Land and territory): a Vacant Lot costs nothing to hold.
export const LAND_DEVELOPMENT_MAX = 2; // land value can rise to ×2 base as a district develops
/** Development counts each facility tier as this many stand levels. */
export const FACILITY_DEVELOPMENT = 2;
export const AUTO_RESTOCK_DAY = 2; // the Market and Auto-Restock open with Day 2's lesson; Lottie stocks your table on Day 1 only
/** Lottie's side lot next to the Corner, sold to you on Day 3 with an L1 table: fixed values, like the Corner (spec Appendix A). */
export const SIDE_LOT = { land: 300, traffic: 300, price: 300 } as const;
/** Marisol's Auto-Price arrives at Rank 3, Block Boss (spec: Helpers that keep a big empire calm). */
export const AUTO_PRICE_RANK = 3;

// ---------- rivals (section 13) ----------
export type RivalId = 'sourwood' | 'hollis' | 'fizzco' | 'coldbrew' | 'blenders' | 'snootwater';
export interface Faction {
  id: RivalId; name: string; product: string; boss: string; color: number; accent: number; home: string;
  personality: string; startCash: number; homeShare: number; startLevel: number; oldTownStands: number;
  grow: number; guard: number; strike: number; price: number; henchmen: string;
  rebuild: number; maxLevel: number; // chance to rebuild a smashed stand; highest stand level they build
  outOfTown?: boolean; // Endless Summer's Out-of-Towner: no turf or HQ in the Bay, it buys in from outside (schemes.ts)
}
/**
 * grow / guard / strike: how each rival splits its dawn takings (spec: the five families table, Grow / Guard / Strike).
 * Snootwater Springs is Endless Summer's Out-of-Towner (spec: "a snooty bottled-water chain that fights like Brock's
 * Bros under its own look"): the Blenders' row under its own name, colours and henchmen, and no home in the Bay.
 */
export const FACTIONS: Record<RivalId, Faction> = {
  sourwood: { id: 'sourwood', name: 'The Sourwood Family', product: 'Lemonade', boss: 'Vera Sourwood', color: 0x5b2a6e, accent: 0xc9a227, home: 'hilltop', personality: 'Cunning and balanced', startCash: 3000000, rebuild: 0.8, maxLevel: 5, homeShare: 0.6, startLevel: 3, oldTownStands: 2, grow: 0.35, guard: 0.35, strike: 0.3, price: 1.0, henchmen: 'Stewards' },
  hollis: { id: 'hollis', name: 'Hollis Sweet Tea Co.', product: 'Sweet tea', boss: 'Tilly Hollis', color: 0xb5651d, accent: 0xd64545, home: 'groves', personality: 'Defensive landholder', startCash: 50000, rebuild: 0.6, maxLevel: 4, homeShare: 0.5, startLevel: 2, oldTownStands: 1, grow: 0.4, guard: 0.5, strike: 0.1, price: 0.9, henchmen: 'Farmhands' },
  fizzco: { id: 'fizzco', name: 'FizzCo Beverages', product: 'Soda', boss: 'Preston Fizzwell III', color: 0xc8102e, accent: 0xb8c2cc, home: 'downtown', personality: 'Rich and expansionist', startCash: 1000000, rebuild: 0.7, maxLevel: 5, homeShare: 0.5, startLevel: 3, oldTownStands: 1, grow: 0.5, guard: 0.2, strike: 0.3, price: 1.1, henchmen: 'Security Associates' },
  coldbrew: { id: 'coldbrew', name: 'The Cold Brew Collective', product: 'Iced coffee', boss: 'Juniper "Juni" Grind', color: 0x3b2a20, accent: 0xff4fa3, home: 'campus', personality: 'Saboteur', startCash: 20000, rebuild: 0.5, maxLevel: 4, homeShare: 0.5, startLevel: 2, oldTownStands: 1, grow: 0.25, guard: 0.25, strike: 0.5, price: 0.95, henchmen: 'Baristas' },
  blenders: { id: 'blenders', name: 'The Boardwalk Blenders', product: 'Smoothies', boss: 'Brock "The Blender" Bodine', color: 0xff9f1c, accent: 0x00a6a6, home: 'boardwalk', personality: 'Aggressive swarm', startCash: 10000, rebuild: 0.4, maxLevel: 4, homeShare: 0.55, startLevel: 2, oldTownStands: 1, grow: 0.25, guard: 0.15, strike: 0.6, price: 0.9, henchmen: 'Smoothie Bros' },
  snootwater: { id: 'snootwater', name: 'Snootwater Springs', product: 'Bottled water', boss: 'Sterling Snoot', color: 0x7fc8f8, accent: 0xe8eef2, home: 'out-of-town', personality: 'Snooty swarm', startCash: 10000, rebuild: 0.4, maxLevel: 4, homeShare: 0, startLevel: 2, oldTownStands: 0, grow: 0.25, guard: 0.15, strike: 0.6, price: 0.9, henchmen: 'Water Sommeliers', outOfTown: true },
};
/** The Bay's own five rivals, the campaign's bosses: every faction but Endless Summer's Out-of-Towners. */
export const BAY_RIVALS = (Object.keys(FACTIONS) as RivalId[]).filter((id) => !FACTIONS[id].outOfTown);
export const PLAYER_COLOR = 0xf6d33c;
/** Rank needed to buy land in a district: Maple Row from the start, Old Town at Rank 2, every other district at Rank 3 (spec: Where you can buy). */
export const DISTRICT_RANK: Record<string, number> = { maple: 1, oldtown: 2, campus: 3, downtown: 3, boardwalk: 3, harbor: 3, groves: 3, hilltop: 3 };
/**
 * Sealed-bid land auctions (spec: Knock it down, buy it up). The spec sets the 24
 * game hours, the opening bid at land value, first price and Family Silver's −10%.
 * How rivals bid is placeholder tuning: from their Grow budget, by interest (home
 * turf, a Foothold, next door, anywhere else) and push (FizzCo outbids hardest).
 */
export const AUCTION = {
  interest: { home: 1, foothold: 0.7, border: 0.4, away: 0.15 }, // placeholder: spec gap. Chance a rival bids, and how keen
  markup: 0.4, // placeholder: spec gap. At full interest up to +40% over what the plot is worth, × push × a 0.5-1.5 roll
  push: { blenders: 0.85, coldbrew: 0.9, hollis: 1, sourwood: 1.2, fizzco: 1.35, snootwater: 0.85 } as Record<RivalId, number>, // placeholder: spec gap
  steps: [1, 1.25, 1.5, 2, 3, 5], // the bid buttons, as multiples of the opening bid
};

/**
 * The Lavender page auction at the Hilltop estate (balance-tables: opens when
 * you reach Rank 8; expect the winning bid to be about $1,500,000, about a day
 * of income at that rank). Each rival still in bids about `value` × its push
 * next to FizzCo's × a `spread` roll, from its cash above the reserve every rival
 * keeps for its running costs (rivalAi.ts).
 */
export const LAVENDER = {
  rank: 8,
  value: 1_500_000, // the winning bid runs about this
  open: 1_000_000, // placeholder: spec gap. The opening bid
  spread: [0.85, 1.15] as [number, number], // placeholder: spec gap
};

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
export const GADGETS: Record<GadgetId, { name: string; rank: number; cost: number; detection: number; text: string; reset?: number }> = {
  alarm: { name: 'Tin-Can Alarm', rank: 2, cost: 100, detection: 0.15, text: '+15% raid detection' },
  goose: { name: 'Guard Goose', rank: 2, cost: 400, detection: 0.15, text: '+15% detection; honks and stuns the first attacker' },
  slick: { name: 'Lemon-Peel Slick', rank: 4, cost: 250, detection: 0, reset: 25, text: 'The first 3 attackers slip (stunned 4s); $25 to re-lay the night after it goes off' },
  sprinkler: { name: 'Sprinkler Ambush', rank: 4, cost: 800, detection: 0, text: 'Soaked attackers deal 20% less damage' },
  floodlights: { name: 'Floodlights', rank: 5, cost: 1500, detection: 0, text: 'Cancels the night stealth bonus' },
  watchtower: { name: 'Watchtower', rank: 6, cost: 5000, detection: 0.3, text: '+30% detection here and on your plots within 2 (no stacking); shows who is coming' },
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
/** Duty: a posted guard climbs about one level per 35 days on duty (fights and the Training Yard add more). */
export const DUTY_DAYS_PER_LEVEL = 35;
/** The Hiring Hall lists 6 recruits and refreshes them every 7 days. */
export const RECRUIT_POOL = 6;
export const RECRUIT_DAYS = 7;
/** A recruit's level (chance of L1..L5) by your Rank. placeholder: spec gap (fees run to L5; the spread isn't given). */
export const RECRUIT_LEVELS: number[][] = [
  [1, 0, 0, 0, 0], // Rank 1 (the Hall opens at Rank 2)
  [0.75, 0.25, 0, 0, 0],
  [0.55, 0.3, 0.15, 0, 0],
  [0.4, 0.3, 0.2, 0.1, 0],
  [0.3, 0.3, 0.25, 0.1, 0.05],
  [0.2, 0.3, 0.25, 0.15, 0.1],
  [0.15, 0.25, 0.3, 0.2, 0.1],
  [0.1, 0.2, 0.3, 0.25, 0.15],
  [0.1, 0.15, 0.3, 0.25, 0.2],
  [0.05, 0.15, 0.3, 0.25, 0.25], // Rank 10
];
export const ROSTER_BASE = 2;
/** Specialists: from Level 3 a guard can take one specialty, for good. Promotion is free (placeholder: spec gap, no cost given). */
export type Specialty = 'lookout' | 'wrecker' | 'captain';
export const SPECIALTIES: Record<Specialty, { name: string; rank: number; text: string }> = {
  lookout: { name: 'Lookout', rank: 4, text: '+25% detection where posted, scouts raid targets, can lead a Sabotage' },
  wrecker: { name: 'Wrecker', rank: 4, text: '+50% Chop, on top of Lumberjack' },
  captain: { name: 'Captain', rank: 6, text: 'Leads the squad: everyone on the side gets +20 Nerve and +10% Hit' },
};
export const PROMOTE_LEVEL = 3;
/** A Lookout on the plot adds this to detection (several don't stack); what they scout stays fresh this many days. */
export const LOOKOUT_DETECTION = 0.25;
export const SCOUT_DAYS = 3;
/** A Wrecker's +50% Chop adds to a Lumberjack's +50%: ×2 for both (placeholder: spec gap, it only says they stack). */
export const WRECKER_CHOP = 0.5;
/** A Captain in the squad (or on the plot) gives the whole side this, once however many Captains there are. */
export const CAPTAIN = { nerve: 20, hit: 0.1 };
/** Clubhouses: each one fills a Street plot and upgrades on its own; the roster holds ROSTER_BASE plus every Clubhouse's beds. */
export const CLUBHOUSE = [
  { level: 1, cost: 2000, beds: 6, rank: 2 },
  { level: 2, cost: 15000, beds: 12, rank: 5 },
  { level: 3, cost: 80000, beds: 24, rank: 7 },
];
export const CLUBHOUSE_HP = [800, 2000, 5000]; // placeholder: spec gap. Chop to knock a Clubhouse down, by level (a Field Helipad's)
/**
 * The Clubhouse extras. L2's Training Yard: each dawn a guard who waited at an L2 or L3 Clubhouse all day (off post,
 * not Out, not on a raid) earns a day of duty's XP, 1/`daysPerLevel` of the way to the next level (placeholder: spec
 * gap; crew's pace of duty, DUTY_DAYS_PER_LEVEL). L3's Infirmary: while you have one standing, every KO is Out
 * `days` fewer days, never below 0 (fit again at the next dawn).
 */
export const CLUBHOUSE_EXTRAS = { yard: { level: 2, daysPerLevel: DUTY_DAYS_PER_LEVEL }, infirmary: { level: 3, days: 1 } };
export const HIRE_RANK = 2;
export const RAID_RANK = 3;
export const SQUAD_CAP = (rank: number) => (rank >= 7 ? 12 : rank >= 5 ? 8 : 5);
/** Stand hit points by level (how much chopping a Smash needs). */
export const STAND_HP = STAND_LEVELS.map((l) => l.hp);
/** Repair a Damaged building for this share of what was invested in it, times the share of HP lost (half HP: 7.5%). */
export const DAMAGE_REPAIR_SHARE = 0.15;
/** A rival repairs a Damaged building at closing only with this much cash to spare beyond the bill (placeholder: the spec
 * says only that rivals repair under the same cost rule). */
export const RIVAL_REPAIR_RESERVE = 500;
/** Auto-Repair (spec: Helpers that keep a big empire calm): from this rank it books the fixes your plots need at closing,
 * except on the plots you skip. */
export const AUTO_REPAIR_RANK = 3;
/** Bulk actions (spec: Helpers that keep a big empire calm, "Group orders, such as 'upgrade every Kiosk I can afford'"):
 * from this rank you pick a group and a budget, and one order upgrades or fences every member it can (policies.ts). */
export const BULK_RANK = 3;
/** District policies (spec: Automation, "District policies | Rank 7 | Profit, Fortify or Expand presets per district | One
 * policy per district"): from `rank`. Fortify and Expand spend up to their district's daily budget, `budget` to start, and
 * Fortify lifts each plot's Auto-Defend priority to at least `priority` (policies.ts).
 * placeholder: spec gap (what each preset does, the starting budget and the priority) */
export const POLICY = { rank: 7, budget: 50000, priority: 2 };
/** The Warehouse (balance-tables: "Warehouse | 4 | 15,000 | Street or Industrial | Stores bottles and supplies;
 * auto-supplies stands in its district"; FACILITIES in vip.ts builds it, warehouse.ts runs it). Its market runs top up a
 * stand of yours in its district once it holds less than an hour's pour, every `runEvery` minutes while open; its sugar
 * store holds `sugarDays` days of those stands' sugar, bought on a day the Market's sugar is at or under normal and
 * handed out on a dearer one (a Sugar Shortage). placeholder: spec gap (hp, runEvery, sugarDays; the spec gives none) */
export const WAREHOUSE = { rank: 4, cost: 15000, hp: 1000, runEvery: 15, sugarDays: 5 };
/** A Storm day (the real weather, not the forecast) takes this share of max HP off every faction's stand up to
 * `maxLevel`, never below 1 HP, so it stays open at its HP share until repaired (spec: Damage, repairs and rebuilds). */
export const STORM_DAMAGE = { share: 0.25, maxLevel: 2 };
/** The late-game Hurricane (spec: Random events, "Damage to buildings bay-wide | 1 day, forecast 2 days ahead"): the
 * scheduler puts it on the calendar `lead` days ahead, from `rank`, in Fall and Winter, at `weight` against the other
 * events. Its day is a Storm, and at the open every faction's standing stand loses its level's share (L1 to L5) of its
 * own HP, before a Fortified Frame (so the Frame's extra 50% is kept), and every facility `facility` of its HP, never
 * below 1 HP: Damaged, never Wrecked. Fences are not buildings and take none.
 * placeholder: spec gap (the rank, seasons and odds, the shares, the Storm sky, no wrecks, fences left alone) */
export const HURRICANE = { rank: 7, lead: 2, weight: 1, seasons: ['fall', 'winter'] as Season[], stand: [0.6, 0.5, 0.4, 0.35, 0.3], facility: 0.3 };
/** The Health Inspection (spec: Random events, "An inspector checks one named stand | 1 day | Repair and restock it, or it
 * closes until dawn"): from `rank`, at `weight` against the other events. The scheduler names one of your stands `lead`
 * day ahead, so a repair approved that day is done by the visit (repairs run overnight), and the inspector comes mid-day.
 * The stand passes at full HP with at least `stockHours` of its pour in stock; otherwise it closes until dawn.
 * placeholder: spec gap (the rank, odds and lead, what counts as stocked) */
export const INSPECTION = { rank: 2, weight: 1, lead: 1, stockHours: 1 };
/** Repair a wrecked stand for this share of what was invested in it. */
export const REBUILD_SHARE = 0.15;
export const NO_RAID_DAYS = 2;
/** After the first raid, no more than this many nights in a row pass with no raid on you (Ben, 2026-11-08: the
 * rivals must actually come). The next night a rival who may raid you does. */
export const MAX_QUIET_NIGHTS: Record<Difficulty, number> = { laidback: 4, classic: 2, cutthroat: 1, custom: 2 };
export const RESPECT_DAYS = 3;
/** Rival raids on the player per week, by Threat (Classic). */
export const RAIDS_PER_WEEK = [1, 2, 3, 4, 6];
/** Typical raiding party by Threat: size range, weapon odds (fists, clubs, hatchets) and padding; its henchmen fight at
 * the Threat's level (HENCHMEN). Threat 4's Pro Gear and four hatchets in five are placeholders (combat: a fully kitted
 * L5 plot then holds about 75% of Threat 4 raids, canon's anchor; in vests with 30% hatchets it held them all). */
export const RAID_PARTY: { size: [number, number]; weapons: [number, number, number]; gear: GearId }[] = [
  { size: [2, 3], weapons: [1, 0, 0], gear: 'none' },
  { size: [3, 5], weapons: [0.7, 0.3, 0], gear: 'none' },
  { size: [5, 8], weapons: [0.3, 0.7, 0], gear: 'vest' },
  { size: [8, 12], weapons: [0, 0.2, 0.8], gear: 'pro' },
  { size: [12, 20], weapons: [0, 0.5, 0.5], gear: 'pro' },
];
/** Share of raids on the player that are a Smash, by Threat (the rest are Shakedowns). */
export const SMASH_SHARE = [0, 0.3, 0.6, 0.7, 1];
/** How many of your plots one raid hits, by Threat: [fewest, most], each equally likely (Threat 4's 1-or-2 odds are a
 * placeholder: spec gap). A raid on several plots splits its party between them. */
export const RAID_TARGETS: [number, number][] = [[1, 1], [1, 1], [1, 1], [1, 2], [2, 3]];
/** Lookouts riding with each raid on the player, by Threat (from Threat 3), and how much each cuts the target's
 * detection chance (placeholders: the spec puts lookouts in the Threat 3 party but doesn't say what they do). */
export const RIVAL_LOOKOUTS = { perRaid: [0, 0, 1, 1, 2], stealth: 0.1 };
/** Share of all rival raids aimed at other rivals rather than you, by Threat; none once the Syndicate forms (the
 * Threat 5 share before it forms is a placeholder: spec gap). */
export const RIVAL_VS_RIVAL = [0.3, 0.3, 0.3, 0.15, 0.15];
/** A boss leading a raid (Threat 5, every Syndicate strike): built like their Boss Room self (rivals.ts stormHQ). */
export const RAID_BOSS = { hp: 2.5, hit: 8, chop: 2, nerve: 200, armor: 0.2 };
/** The Syndicate's raids on you per week, Classic (Laid Back ×0.5 = 3, Cutthroat ×1.5 = 9). */
export const SYNDICATE_RAIDS_PER_WEEK = 6;
/** A Syndicate strike comes as a Threat 5 raid whatever the Threat (Cutthroat's forms at 4): 12–20 in full kit, boss-led,
 * all Smash, on 2–3 plots. */
export const SYNDICATE_TIER = 5;
/** When the Syndicate forms: in the campaign two weeks into Act 5 on every difficulty; in Sandbox and Endless at
 * Threat 5, or Threat 4 on Cutthroat. Laid Back's Threat stops at 4, so there it forms at Rank 9, where Classic reaches
 * Threat 5 (placeholder: spec gap); Custom follows Classic. */
export const SYNDICATE_FORMS = { act5Days: 14, threat: 5, cutthroatThreat: 4, laidBackRank: 9 };
/**
 * The Big Squeeze, the campaign's finale (spec: Act 5): from Rank `rank` you call it at Morning Prep, and `nights` siege
 * nights follow. Each siege dawn names that night's `targets` (2–3) of your plots for the Syndicate's strike. Each night
 * you hold them all takes `gateCut` (10% of its 5,000) off Sourwood Manor's Gate, down to `gateFloor` after 7 good nights,
 * and benches one Yard elite; each plot you lose adds a Steward to the Boss Room, on top of Old Money's `stewards`.
 */
export const BIG_SQUEEZE = { rank: 9, nights: 7, targets: [2, 3] as [number, number], gateCut: 500, gateFloor: 1500, stewards: 3 };
/** Detection: 50% plus gadgets and watchers, capped at 95%, then night stealth comes off, down to 0% (the floor is a placeholder: spec gap). */
export const DETECTION_BASE = 0.5;
export const DETECTION_CAP = 0.95;
export const EAGLE_EYE_DETECTION = 0.1;
export const NIGHT_STEALTH = 0.25;
/** Raids travel 1–3 game hours by distance (canon). The build maps straight-line plot distance onto that range:
 * across the whole bay (about 350 map units) is 3 hours, so Maple Row to the Boardwalk (about 100) is 1.5 hours. */
export const RAID_TRAVEL = { min: 60, max: 180, span: 350 }; // placeholder: spec gap (the distance scale)
/** Rival raids set out between 20:15 and 01:45 (15-minute steps), so they land between 21:15 and 04:45. */
export const RAID_LEAVE = { first: 20 * 60 + 15, steps: 23 }; // placeholder: spec gap (departure window)
/** Rivals raiding each other arrive at 02:00. */
export const RIVAL_RAID_AT = 26 * 60;
/** Your 'tonight' raids set out at 01:00 (the spec's Day 24 walkthrough) and travel to the target by distance. */
export const PLAYER_RAID_LEAVE = 25 * 60; // placeholder: spec gap (only the walkthrough names a departure time)
/** The Raid Planner's guess at a fight's length, for when the squad gets home (the walkthrough's lasts 18 minutes). */
export const RAID_FIGHT_GUESS = 20; // placeholder: spec gap
/** A Delivery Raid hits within the pickup's 2-hour loading window. */
export const DELIVERY_WINDOW = 120;
/** Juni's Grapevine (the Grindhouse trophy): raid warnings arrive 1 game hour earlier. */
export const GRAPEVINE_EARLY = 60;
/** Guard posts on a building other than a stand (a stand's level sets its own: STAND_LEVELS guardPosts). A bare lot has none. */
export const BUILDING_POSTS = 3;
/** A Sneaky raider in the party takes this much more off (once per raid). */
export const SNEAKY_STEALTH = 0.25;
/** Maple Row at Full Control (Neighborhood Watch): every raid on any plot of yours is detected this much more often. */
export const NEIGHBORHOOD_WATCH_DETECTION = 0.1;
/** A Stronghold (75%+ of a district): raids on your plots there are spotted more, and reinforcements get there faster. placeholder: spec gap (no numbers). */
export const STRONGHOLD_DETECTION = 0.1;
export const STRONGHOLD_TRAVEL = 0.5;
export const DAYTIME_RAID_REP = { raid: 0.1, smash: 0.2 };
/** Sheriff Budd's Citation (canon: the Sheriff rule): below `stars`, each daytime raid you launch is fined about `fineDays`
 * of income (the last week's average daily sales, never more than your cash) and bans your raids and HQ assaults for the
 * rest of the day and the next `banDays`. placeholder: spec gap (it leaves "about a day's income" undefined). */
export const CITATION = { stars: 2.0, fineDays: 1, banDays: 2 };
/** Election Day (each Spring) can move the Citation line until the next one: the platform Mayor Fontaine wins on, drawn
 * by weight, each Citation in the last year adding 1 to tough's. placeholder: spec gap (it says only that the rules can change). */
export const ELECTION = {
  same: { weight: 2, stars: 2.0, news: 'ELECTION DAY: Mayor Fontaine wins again. Sheriff Budd keeps the Citation line at 2 stars.' },
  tough: { weight: 1, stars: 2.5, news: 'ELECTION DAY: Mayor Fontaine wins on "Order in the Bay": Citations below 2.5 stars for a year.' },
  soft: { weight: 1, stars: 1.5, news: 'ELECTION DAY: Mayor Fontaine wins on "Let Kids Be Kids": Citations only below 1.5 stars for a year.' },
};
/** Sabotage (spoil a stand's stock: it can't sell its next day) opens at this Rank, for you and for rivals raiding you. */
export const SABOTAGE_RANK = 4;
/** Raid templates (spec: Rank 6, "save a squad and objective for one-tap repeats"): how many you can keep. placeholder: spec gap (no number). */
export const RAID_TEMPLATES = { rank: 6, max: 3 };
/** Each rival's chance that a raid on one of your stands is a Sabotage: Cold Brew's Night Shift leans on it (placeholder: spec gap, no rates given). */
export const RIVAL_SABOTAGE: Record<RivalId, number> = { sourwood: 0.1, hollis: 0.1, fizzco: 0.1, coldbrew: 0.4, blenders: 0.1, snootwater: 0.1 };
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
  wireBand: 0.1, // placeholder: spec gap. Barbed Wire tangles raiders this far either side of the fence line, cut or not
  giveUpSeconds: 120, // placeholder: spec gap. Raiders who can't break through and win the brawl by then go home
  reach: 0.12, // placeholder: spec gap. How far a swing reaches
  spacing: 0.1, // placeholder: spec gap. Shoulder room along a fence or a line
  fenceAt: 0.4, // the perimeter's distance out from the stand
  holdAt: 0.2, // where guards stand when there's no perimeter
  standWidth: 0.5,
};
/** The fight buttons (spec: The fight clock and your buttons). Fall Back is once per fight, Ring the Bell once per raid. */
export const FIGHT_BUTTONS = {
  rally: { nerve: 20, seconds: 10, every: 30 }, // Rally (either side): +20 Nerve for 10 s, every 30 s
};
/** Ring the Bell: the Clubhouse reserve reaches your plots in the same or a bordering district in 30–60 game minutes. */
export const RESERVE_MINUTES = { same: 30, border: 60 }; // placeholder: spec gap. 30 from the same district, 60 from a bordering one
/**
 * What a rival builds up on a plot, by stand level (facilities count as their tier + 2): the fence tier, the gadgets
 * (in buying order) and the henchmen on its posts (as many as the posts hold). The Kiosk row is the spec's Day 24
 * Shakedown target (a Picket, cans, a goose and 3 Smoothie Bros with paddleboards); the other rows are a placeholder: spec gap.
 */
export const RIVAL_KIT: { fence: number; gadgets: GadgetId[]; level: number; weapons: [number, number, number]; gear: GearId }[] = [
  { fence: 1, gadgets: [], level: 1, weapons: [1, 0, 0], gear: 'none' },
  { fence: 1, gadgets: ['alarm'], level: 1, weapons: [0.5, 0.5, 0], gear: 'none' },
  { fence: 1, gadgets: ['alarm', 'goose'], level: 1, weapons: [0, 1, 0], gear: 'none' },
  { fence: 2, gadgets: ['alarm', 'goose', 'slick'], level: 2, weapons: [0, 1, 0], gear: 'vest' },
  { fence: 3, gadgets: ['goose', 'slick', 'sprinkler'], level: 4, weapons: [0, 0.5, 0.5], gear: 'pro' },
];
/**
 * A rival who spots your raid sends help (spec: "the defender sees the ETA and sends help"; no numbers): each of its
 * other plots and its HQ in the same or a bordering district sends this share of its garrison (rounded down), nearest
 * first, up to `cap` henchmen by Threat. A fraction is the chance of one more, drawn for each spotted raid: 0.3 at
 * Threats 1–2 sends one helper about one time in three (combat: one helper there by contact took the spotted Day 24
 * Shakedown from 83% to 26%). Placeholders: spec gap.
 */
export const RIVAL_HELP = { share: 0.5, cap: [0.3, 0.3, 2, 2, 3] };
/**
 * Dex's Auto-Defend (Rank 4): each plot's priority runs 0 (the default: left to the bell) to `top` (placeholder: the
 * spec names no scale). He fills a plot's guard posts as crew's postsFor counts them.
 */
export const AUTO_DEFEND = { rank: 4, top: 3 };
/**
 * Nabbed (spec: Nobody dies): each KO'd raider left behind is Nabbed on this `chance` by the side they raided. Letting
 * a captive go is worth `release` star; the ransom is their hire fee (GUARD_FEE by level). A rival holds a guard of
 * yours for `days` days (placeholder: spec gap) before they go over to it (a Loyal one walks home).
 */
export const NABBED = { chance: 0.1, release: 0.05, days: 3 };
/** Former Rival: this much more Hit and Chop against their old faction (its plots, its raids on you, its HQ). */
export const FORMER_RIVAL = 0.1;
/** Henchmen strength by Threat: level, and the padding and weapon odds (fists, clubs, hatchets) they have at home, as
 * a rival's HQ fields them by its tier (and the help it sends). On a raid they bring the party's (RAID_PARTY). */
export const HENCHMEN: { level: number; gear: GearId; weapons: [number, number, number] }[] = [
  { level: 1, gear: 'none', weapons: [1, 0, 0] },
  { level: 2, gear: 'none', weapons: [0.7, 0.3, 0] },
  { level: 3, gear: 'vest', weapons: [0.3, 0.7, 0] },
  { level: 4, gear: 'vest', weapons: [0.1, 0.6, 0.3] },
  { level: 5, gear: 'pro', weapons: [0, 0.5, 0.5] },
];

// ---------- modes, difficulty, winning and losing (spec: Game modes and winning) ----------
export type Mode = 'campaign' | 'sandbox' | 'endless';
export type Difficulty = 'laidback' | 'classic' | 'cutthroat' | 'custom';
export type WinCondition = 'domination' | 'economic' | 'none';
export const MODES: Record<Mode, { label: string; blurb: string }> = {
  campaign: { label: 'Story Campaign', blurb: 'The story. Beat 5 drink gangs and win back Grandma\'s stolen recipes.' },
  sandbox: { label: 'Sandbox: Turf War', blurb: 'No story. Pick how you win, or switch the fighting off.' },
  endless: { label: 'Endless Summer', blurb: 'No story, no finish line. Grow forever and chase a high score.' },
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
  calmAudio: boolean; // Calm Audio is on by default (spec: Mix and accessibility)
}> = {
  laidback: { label: 'Laid Back', blurb: 'Half the raids. Stands get dented, never wrecked. You can\'t lose.', raids: 0.5, threat: -1, respectDays: 5, bustOnly: true, cookieJar: 'always', canLose: false, notice: 30, raidPause: true, calmAudio: true },
  classic: { label: 'Classic', blurb: 'Fair fights. Go broke and Grandma bails you out once per act.', raids: 1, threat: 0, respectDays: 3, bustOnly: false, cookieJar: 'perAct', canLose: true, notice: 15, raidPause: true, calmAudio: false },
  cutthroat: { label: 'Cutthroat', blurb: 'More raids, less warning, no bailouts. Go broke and it\'s over.', raids: 1.5, threat: 0, respectDays: 1, bustOnly: false, cookieJar: 'never', canLose: true, notice: 5, raidPause: false, calmAudio: false },
  // Custom starts from Classic; Settings.custom holds the sliders (modes.ts difficultyOf). No Threat nudge, and a run
  // can be lost unless the Cookie Jar is always there (placeholders: the spec leaves both open).
  custom: { label: 'Custom', blurb: 'Set your own raid rate, warning time and cooldown.', raids: 1, threat: 0, respectDays: 3, bustOnly: false, cookieJar: 'perAct', canLose: true, notice: 15, raidPause: true, calmAudio: false },
};
/** Custom's sliders (spec: Custom: raids ×0.5 to ×1.5; notice and Respect cooldown anywhere from Laid Back's to
 * Cutthroat's): [lowest, highest, step]. */
export const CUSTOM_RANGE = { raids: [0.5, 1.5, 0.1], notice: [5, 30, 5], respectDays: [1, 5, 1] } as const;
/** Laid Back: repair a Busted stand for this share of what was invested (canon; Appendix A's 15% is older). */
export const BUSTED_REPAIR_SHARE = 0.1;
/** Cash below $0 at dawn this many days running, and the Cookie Jar is the last chance. */
export const IN_THE_RED_DAYS = 3;
/** Domination: every rival eliminated and at least this share of every district's purchasable plots. */
export const MAJORITY = 0.51;
/** District control tiers by share of purchasable plots: Foothold (1 plot), Majority (51%), Stronghold (75%), Full Control (100%). */
export const STRONGHOLD = 0.75;
/** Majority: unowned land in that district costs you this share of its price (−10%). */
export const MAJORITY_LAND_DISCOUNT = 0.9;
/** Sandbox's Economic win: a Success Score target picked from the rank thresholds (default Rank 8). */
export const ECONOMIC_DEFAULT_RANK = 8;
/**
 * Sandbox map sizes (spec: Sandbox: Turf War): the districts cut from Citrine Bay and the rivals that play. Large is
 * the whole bay; Huge (10 and 5, generated) is a stretch goal. `picks` are the rivals a New Game starts with (the spec
 * gives no defaults): Brock and Tilly on Small, the campaign's first three bosses on Medium.
 */
export type MapSize = 'small' | 'medium' | 'large';
export const MAP_SIZES: Record<MapSize, { label: string; districts: number; rivals: number; picks: RivalId[] }> = {
  small: { label: 'Small', districts: 4, rivals: 2, picks: ['blenders', 'hollis'] }, // picks: placeholder: spec gap
  medium: { label: 'Medium', districts: 6, rivals: 3, picks: ['blenders', 'coldbrew', 'hollis'] }, // picks: placeholder: spec gap
  large: { label: 'Large', districts: 8, rivals: 5, picks: ['sourwood', 'hollis', 'fizzco', 'coldbrew', 'blenders'] },
};
/** Peaceful (Sandbox): Vera finally sells, at this multiple of her cash and buildings, once Weakened. */
export const PEACEFUL_VERA_BUYOUT = 3;
/** The Beloved ending needs this Reputation or better (and more buyouts than Smashes and HQ captures). */
export const BELOVED_STARS = 4;
/** The campaign's acts advance on their climaxes (src/sim/story.ts). Sandbox and Endless have no acts, so anything that
 * still asks for one there reads it from rank: the act each rank falls in (spec: Acts and ranks, simulated Classic rank-up days). */
export const ACT_BY_RANK = [1, 1, 1, 2, 3, 3, 4, 4, 5, 5];
export const ACTS = ["Lottie's Corner", 'Surf & Turf', 'Grounds for Revenge', 'Fields & Fizz', 'The Big Squeeze'];
/** Lottie's Goals pay a little cash when ticked off (the spec gives no amounts): this share of an average recent day's sales, never less than the floor. */
export const GOAL_REWARD = { short: { share: 0.1, min: 5 }, medium: { share: 0.25, min: 20 }, long: { share: 0.5, min: 50 } } as const; // placeholder: spec gap
/** The day's short goal: sell this share of the cups every stand should sell on the forecast. */
export const SALES_GOAL_SHARE = 0.9; // placeholder: spec gap (the walkthrough's 1,200 cups across 5 stands on Day 12)
/** Lessons (spec "One system a day"): the day each system's buttons appear. Switched off, buttons follow rank alone. */
export const LESSON_DAY = { recipes: 2, forecast: 2, market: AUTO_RESTOCK_DAY, upgrade: 5, rank: 5, threat: 3, defense: 3, crew: 4, marketing: 6, land: 7 } as const;
/** Marisol's record day (src/sim/story.ts): a day's profit beats the best day so far by this share at least. */
export const RECORD_GAIN = 0.1; // placeholder: spec gap (the tone guide names no floor)
/** The Domination show: real seconds the Bay takes to paint itself yellow from Lottie's Corner before the ending plays
 * (src/sim/victory.ts). The world's lemon wave reaches the far end of the Bay in about 4.2 s. */
export const VICTORY_PAINT_SECONDS = 5.5; // placeholder: spec gap ("a sweep the player watches")
/** Endless: a beaten boss cameos this often, the beaten bosses taking turns (src/sim/cameos.ts). */
export const CAMEO_DAYS = 5; // placeholder: spec gap ("Beaten bosses cameo")
/** A boss phones when their Grudge toward you jumps this much at once (a raid on them adds 8 or 20). */
export const PHONE_GRUDGE_JUMP = 8; // placeholder: spec gap ("a mood shift")
/** ...or their Attention on you, beyond Threat, rises this much from one dawn to the next (one more district of yours on their border). */
export const PHONE_ATTENTION_JUMP = 0.5; // placeholder: spec gap ("a mood shift")
/** Marisol's loans from the First Bank of Citrine Bay. */
export const LOAN = { share: 0.5, weeklyRate: 0.03, weeks: 4, missesToRepossess: 2 };
