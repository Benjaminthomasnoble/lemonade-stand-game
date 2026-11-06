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
export const CAMPAIGNS: Record<CampaignId, { name: string; rank: number; blurb: string; costPerDay?: number; traffic: number; days: number; samples?: number; reputation?: number }> = {
  sandwichBoard: { name: 'Sandwich-Board Kid', rank: 2, blurb: '+20% foot traffic today', costPerDay: 40, traffic: 0.2, days: 1 },
  freeSamples: { name: 'Free Sample Day', rank: 2, blurb: 'Give away 30 cups: +0.1 star and +15% traffic for 3 days', traffic: 0.15, days: 3, samples: 30, reputation: 0.1 },
};

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
}
export const FACTIONS: Record<RivalId, Faction> = {
  sourwood: { id: 'sourwood', name: 'The Sourwood Family', product: 'Lemonade', boss: 'Vera Sourwood', color: 0x5b2a6e, accent: 0xc9a227, home: 'hilltop', personality: 'Cunning and balanced', startCash: 20000, homeShare: 0.6, startLevel: 3, oldTownStands: 2, grow: 0.4, guard: 0.35, strike: 0.25, price: 1.0, henchmen: 'Stewards' },
  hollis: { id: 'hollis', name: 'Hollis Sweet Tea Co.', product: 'Sweet tea', boss: 'Tilly Hollis', color: 0xb5651d, accent: 0xd64545, home: 'groves', personality: 'Defensive landholder', startCash: 8000, homeShare: 0.5, startLevel: 2, oldTownStands: 1, grow: 0.45, guard: 0.45, strike: 0.1, price: 0.9, henchmen: 'Farmhands' },
  fizzco: { id: 'fizzco', name: 'FizzCo Beverages', product: 'Soda', boss: 'Preston Fizzwell III', color: 0xc8102e, accent: 0xb8c2cc, home: 'downtown', personality: 'Rich and expansionist', startCash: 30000, homeShare: 0.5, startLevel: 3, oldTownStands: 1, grow: 0.55, guard: 0.25, strike: 0.2, price: 1.1, henchmen: 'Security Associates' },
  coldbrew: { id: 'coldbrew', name: 'The Cold Brew Collective', product: 'Iced coffee', boss: 'Juniper "Juni" Grind', color: 0x3b2a20, accent: 0xff4fa3, home: 'campus', personality: 'Saboteur', startCash: 6000, homeShare: 0.5, startLevel: 2, oldTownStands: 1, grow: 0.35, guard: 0.25, strike: 0.4, price: 0.95, henchmen: 'Baristas' },
  blenders: { id: 'blenders', name: 'The Boardwalk Blenders', product: 'Smoothies', boss: 'Brock "The Blender" Bodine', color: 0xff9f1c, accent: 0x00a6a6, home: 'boardwalk', personality: 'Aggressive swarm', startCash: 5000, homeShare: 0.55, startLevel: 2, oldTownStands: 1, grow: 0.3, guard: 0.2, strike: 0.5, price: 0.9, henchmen: 'Smoothie Bros' },
};
export const PLAYER_COLOR = 0xf6d33c;
/** Rank needed to buy land in a district (Maple Row from the start, Old Town at Rank 2; the rest is an assumption until the spec says otherwise). */
export const DISTRICT_RANK: Record<string, number> = { maple: 1, oldtown: 2, campus: 3, downtown: 3, boardwalk: 3, harbor: 3, groves: 3, hilltop: 3 };

// ---------- defenses, crew and raids (canon sections 11–14) ----------
export interface PerimeterTier { tier: number; name: string; rank: number; cost: number; hp: number; breachDps: number; slow: number }
// Fence HP and breach damage are tuned so the canon anchors hold (npm run combat):
// T1 raid vs Picket + 1 guard fails ~60%; T4 raid vs a kitted P4 plot holds ~75%.
export const PERIMETERS: PerimeterTier[] = [
  { tier: 1, name: 'Picket Fence', rank: 1, cost: 150, hp: 280, breachDps: 0, slow: 0 },
  { tier: 2, name: 'Chain-Link Fence', rank: 2, cost: 1200, hp: 500, breachDps: 0, slow: 0 },
  { tier: 3, name: 'Sharpened Stakes', rank: 4, cost: 6000, hp: 800, breachDps: 0.5, slow: 0 },
  { tier: 4, name: 'Barbed Wire', rank: 6, cost: 25000, hp: 1150, breachDps: 1, slow: 0.3 },
  { tier: 5, name: 'Citrus Fortress Wall', rank: 8, cost: 100000, hp: 3000, breachDps: 0, slow: 0 },
];
/** Defenders hit harder while any perimeter stands (P5 doubles it). */
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
export const GUARD_BASE = { hp: 100, nerve: 60, swing: 1.5 };
export const GUARD_LEVEL_TITLES = ['Rookie', 'Regular', 'Veteran', 'Elite', 'Legend'];
export const GUARD_WAGE = [15, 28, 45, 65, 90];
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
export const STAND_HP = [120, 300, 700, 1500, 3000];
/** Repair a wrecked stand for this share of what was invested in it. */
export const REBUILD_SHARE = 0.3;
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
export const DAYTIME_RAID_REP = { raid: 0.1, smash: 0.2 };
export const TRAITS = [
  'Tough Cookie', 'Night Owl', 'Eagle Eye', 'Hothead', 'Loyal', 'Butterfingers', 'Sprinter',
  'Gentle Giant', 'Wrecker', 'Smooth Talker', 'Goose Whisperer', 'Former Rival', 'Sneaky',
] as const;
export type Trait = (typeof TRAITS)[number];
/** Combat knobs tuned against the canon anchors (npm run combat). */
export const COMBAT = {
  fenceChop: 1, // fences resist chopping
  homeBonus: 0.25, // defenders' damage bonus on their own plot
  throughFenceTier: 1, // defenders can strike over fences of this tier and up
  breachDps: 1, // scales stakes and wire damage
};
/** Henchmen strength by Threat: level and padding. */
export const HENCHMEN = [
  { level: 1, gear: 'none' as GearId },
  { level: 2, gear: 'none' as GearId },
  { level: 3, gear: 'vest' as GearId },
  { level: 4, gear: 'vest' as GearId },
  { level: 5, gear: 'pro' as GearId },
];
