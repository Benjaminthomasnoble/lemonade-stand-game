// Saves from every version ever shipped keep loading (spec: Saves: "Every save
// carries a format version and migrates forward"). migrateSave hands each save
// here first; v1 to v6 step up one version at a time to v7, and migrateSave's
// own v7 to v8 step, combat's and nights' migrations carry on from there.
// v1 to v3 were one stand before the map: the run is rebuilt in Citrine Bay
// from its seed, keeping the day, the cash, the Reputation, the rank and the
// stand itself. v4 to v6 only ever added fields, which get their defaults.
// Pure and seeded: any draw goes through the save's own seed.
import { RANKS, RECIPES, STAND_LEVELS, type RecipeId, type Sweetness } from './balance.ts';
import { LOTTIES_CORNER } from './map.ts';
import { newGame, successScore, type GameState } from './economy.ts';
import { NO_DEFENSE, seedRivalDefenses } from './crew.ts';
import { seedRivalFacilities } from './rivals.ts';

type Old = Record<string, unknown> & { version?: unknown };

const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const whole = (v: unknown, d: number) => Math.round(num(v, d));
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const SWEETNESS: Sweetness[] = ['less', 'classic', 'extra'];

/** The oldest version a save can come from: anything without a number is v1 if it looks like one. */
export const FIRST_VERSION = 1;

/** Step a save from any older version up to v7 (current saves, and anything that isn't a save, pass straight
 * through for migrateSave to judge). */
export function migrateLegacy(x: unknown): unknown {
  if (!isObj(x) || typeof x.cash !== 'number' || typeof x.day !== 'number') return x;
  let s = x as Old;
  const v = typeof s.version === 'number' ? s.version : FIRST_VERSION;
  if (v >= 7) return s;
  if (v <= 3) s = rebuild(s, v) as unknown as Old; // one stand, before the map: rebuilt as a v7 run
  else {
    if (v <= 4) toV5(s as unknown as GameState);
    if (v <= 5) toV6(s as unknown as GameState);
    toV7(s as unknown as GameState);
  }
  return s;
}

/** v1 to v3: a single stand with no map, rivals or crew. The run starts over in Citrine Bay from its own seed on the
 * day it reached, with its cash, Reputation, rank, brand and stand (level, recipe, price, supplies, campaigns). */
function rebuild(o: Old, v: number): GameState {
  const s = newGame(whole(o.seed, 1) >>> 0 || 1);
  const ps = s.plots[LOTTIES_CORNER];
  const st = ps.stand!;
  s.day = Math.max(1, whole(o.day, 1));
  s.cash = Math.round(num(o.cash, s.cash) * 100) / 100;
  // v1 kept Reputation as 0..1; stars (1..5) from v2 on.
  s.reputation = Math.round(clamp(v === 1 ? 1 + 4 * num(o.reputation, 0.5) : num(o.reputation, s.reputation), 1, 5) * 100) / 100;
  s.rank = clamp(whole(o.rank, 1), 1, RANKS.length);
  s.brandTier = Math.max(0, whole(o.brandTier, 0));
  s.lifetimeCups = Math.max(0, whole(o.lifetimeCups, 0));
  st.level = clamp(whole(o.standLevel, 1), 1, STAND_LEVELS.length);
  ps.invested = Math.max(ps.invested, num(o.invested, 0));
  if (typeof o.recipe === 'string' && o.recipe in RECIPES) st.recipe = o.recipe as RecipeId;
  if (SWEETNESS.includes(o.sweetness as Sweetness)) st.sweetness = o.sweetness as Sweetness;
  st.price = Math.max(0.05, num(o.price, st.price));
  const inv = o.inventory;
  if (isObj(inv) && Array.isArray(inv.lemons)) { // v2 on; v1's loose counts and cups don't carry
    st.inventory = {
      lemons: inv.lemons.filter(isObj).map((b) => ({ qty: Math.max(0, whole(b.qty, 0)), day: whole(b.day, s.day), unitCost: num(b.unitCost, 0) })).filter((b) => b.qty > 0),
      sugar: Math.max(0, whole(inv.sugar, 0)), ice: Math.max(0, whole(inv.ice, 0)), sugarCost: num(inv.sugarCost, 0), iceCost: num(inv.iceCost, 0),
    };
  }
  if (isObj(o.campaigns)) {
    for (const [k, d] of Object.entries(o.campaigns)) if (typeof d === 'number' && d > 0) (st.campaigns as Record<string, number>)[k] = Math.round(d);
  }
  s.today = { ...s.today, day: s.day, reputationBefore: s.reputation, reputationAfter: s.reputation, scoreBefore: successScore(s) };
  s.peakScore = Math.max(successScore(s), whole(o.peakScore, 0));
  s.peakDay = s.day;
  s.news = ["Lottie: \"Your old stand's books came through. Welcome to Citrine Bay: we carry on from the Corner.\""];
  s.version = 7;
  return s;
}

/** v5 added defenses, the crew and raids. Rivals' stands get the fences and henchmen a new game deals them. */
function toV5(s: GameState): void {
  s.guards ??= [];
  s.recruits ??= [];
  s.clubhouse ??= 0;
  s.nextId ??= 1;
  s.raids ??= [];
  s.battles ??= [];
  s.respectFromPlayer ??= {};
  for (const ps of Object.values(s.plots ?? {})) ps.defense ??= NO_DEFENSE();
  for (const r of Object.values(s.rivals ?? {})) r.respectUntil ??= 0;
  const rng = { seed: s.seed };
  seedRivalDefenses(s, rng);
  s.seed = rng.seed;
  s.version = 5;
}

/** v6 added big orders and bottles. */
function toV6(s: GameState): void {
  s.bottles ??= 0;
  s.offers ??= [];
  s.orders ??= [];
  s.version = 6;
}

/** v7 added the rivals' endgame; Hollis, FizzCo and Sourwood get their pads and piers. */
function toV7(s: GameState): void {
  seedRivalFacilities(s);
  s.version = 7;
}
