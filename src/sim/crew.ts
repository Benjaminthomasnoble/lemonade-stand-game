// Milestone 3: defenses, guards, raids and Threat (canon sections 10–14).
// Pure functions over GameState, like the economy. Night raids are planned
// when the stands close and fought on the night's clock (night.ts), each at
// its arrival minute, after a warning.
import {
  BUILDING_POSTS, BUSTED_REPAIR_SHARE, SIDE_LOT, CAPTAIN, CLOSE, CLUBHOUSE, COMBAT, DAYTIME_RAID_REP, DETECTION_BASE, DETECTION_CAP,
  DUTY_DAYS_PER_LEVEL, EAGLE_EYE_DETECTION, FACTIONS, GADGETS, GADGET_SLOTS, GEAR, GUARD_BASE, GUARD_FEE, GUARD_LEVEL_TITLES, GUARD_WAGE,
  GUARD_XP_TO_LEVEL, HENCHMEN, HIRE_RANK, LOOKOUT_DETECTION, NEIGHBORHOOD_WATCH_DETECTION, NIGHT_STEALTH, NO_RAID_DAYS, OPEN, PERIMETERS,
  PROMOTE_LEVEL, RAIDS_PER_WEEK, RAID_LEAVE, RAID_PARTY, RAID_RANK, RANKS, REBUILD_SHARE, RECRUIT_DAYS, RECRUIT_LEVELS, RECRUIT_POOL,
  RIVAL_KIT, RIVAL_RAID_AT, RIVAL_SABOTAGE, ROSTER_BASE, SABOTAGE_RANK, SNEAKY_STEALTH, SPECIALTIES, SQUAD_CAP,
  STAND_HP, STAND_LEVELS, STRONGHOLD_DETECTION, STRONGHOLD_TRAVEL, TRAITS, WEAPONS, WRECKER_CHOP,
  type GadgetId, type GearId, type RivalId, type Specialty, type Trait, type WeaponId,
} from './balance.ts';
import { runBattle, winChance, type BattleEvent, type BattleInput, type BattleResult, type Fighter, type Objective } from './combat.ts';
import { LOTTIES_CORNER, LOTTIES_SIDE_LOT, nearbyPlots, PLOT_BY_ID, PLOTS, type DistrictId, type FactionId, type Plot } from './map.ts';
import { nextRandom, type Rng } from './rng.ts';
import type { Blocker, GameState, PlotState } from './economy.ts';
import { newStand, ownedPlots, priceCeiling } from './economy.ts';
import { buildFacility, canBuildFacility, FACILITIES } from './vip.ts';
import { approveRebuild, buildingInvested, currentHp, dollarsUp, hpLostNote, plotsAtDawn, raidDamage } from './damage.ts';
import { allBeds, awayOnRaid, clubhouses, clubhouseSite } from './clubhouse.ts';
import { withBell } from './reinforce.ts';
import { shakedownLoot } from './loot.ts';
import { breakTruce } from './rivals.ts';
import { bump, difficulty, districtControl, peaceful } from './modes.ts';
import { awayGuards, etaMinute, hhmm, onTheRoad, raidStart, sendRaid, travelMinutes } from './night.ts';
import { rivalGuardSpend, signatureRaids } from './rivalAi.ts';
import { dexLesson, hasStory } from './story.ts';
import { alert } from './alerts.ts';
import { bugleFight } from './media.ts';
import { scoutingAtDawn, scoutingToday } from './scouting.ts';
import { TUTORIAL_CALL, tutorialBounce, withDex } from './threat.ts';

export interface Guard {
  id: string;
  name: string;
  trait: Trait;
  level: number; // 1..5
  xp: number; // fights add whole points, each day on duty a fraction
  weapon: WeaponId;
  gear: GearId;
  post: string | null; // plot id where they stand guard
  club?: string; // off post, they wait at this Clubhouse (clubhouse.ts clubOf); unset: your first one
  outUntil: number; // knocked out: back on this day
  fee: number; // hire fee (recruits)
  face?: number; // portrait seed (guards from before it existed draw their face from the id)
  specialty?: Specialty; // Lookout, Wrecker or Captain: taken from Level 3, for good
  scoutDay?: number; // a Lookout scouting a rival plot is off their post (and out of raids) this day
}

export interface Raid {
  id: string;
  attacker: FactionId;
  target: string;
  objective: Objective;
  guards?: string[]; // player raids: who goes
  party?: Fighter[]; // rival raids: who comes
  detected: boolean;
  eta: string; // "23:40"
  delivery?: boolean; // a raid on a VIP pickup: they're after the cargo, not the till
  // The raid clock (night.ts): minutes of the day, past midnight counting on from 1,440.
  leave?: number; // sets out
  at?: number; // arrives, and the fight starts
  warnAt?: number; // the warning lands (a detected raid as it sets out, else the minimum notice before it hits)
  launched?: boolean; // has set out (detection rolled)
  warned?: boolean; // the warning has landed
  back?: number; // your raid: fought, and the squad walks home by this minute (their posts sit empty till then)
  order?: string; // a Delivery Raid: the VIP order it's after
  bell?: { id: string; at: number }[]; // Ring the Bell (reinforce.ts): the reserve on its way, and the minute each gets there
  sabotage?: boolean; // fought as a Shakedown, but the 10 minutes go on spoiling the stock instead of the till
  tutorial?: boolean; // the scripted first raid on you: Dex is always there, and it always bounces (threat.ts)
}

/** What a raid sets out to do: the fight's two objectives, plus Sabotage (fought like a Shakedown). */
export type RaidObjective = Objective | 'sabotage';

export interface BattleReport {
  delivery?: boolean;
  sabotage?: boolean; // the stock was the target: on a win it's spoiled, nothing is taken
  busted?: boolean; // Laid Back: your stand was Busted (closed until a repair), not Wrecked
  hq?: 'gate' | 'yard' | 'boss'; // a stage of an HQ assault
  hpLost?: number; // HP the building lost and kept (damage.ts): Damaged until a repair
  day: number;
  attacker: FactionId;
  defender: FactionId;
  target: string;
  objective: Objective;
  outcome: 'smashed' | 'robbed' | 'damaged' | 'repelled';
  loot: number;
  attackers: Fighter[];
  defenders: Fighter[];
  perimeter: number;
  standLevel: number;
  /** The defender's gadgets and whether it was dark, for the replay. */
  gadgets?: GadgetId[];
  night?: boolean;
  events: BattleEvent[];
  duration: number;
  koed: string[];
  fled: string[];
  joins?: BattleInput['joins']; // who reached the fight late (Ring the Bell's reserves), and when
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const RIVALS = Object.keys(FACTIONS) as RivalId[];
const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

export const NO_DEFENSE = () => ({ tier: 0, fenceHp: 0, gadgets: [] as GadgetId[] });

/** Is the stand or VIP facility here knocked down? */
export const isWrecked = (ps: PlotState) => !!(ps.stand?.wrecked || ps.facility?.wrecked);
/** Something standing here worth smashing: a stand or a VIP facility. */
export const hasBuilding = (ps: PlotState) => !!(ps.stand || ps.facility) && !isWrecked(ps);
/** Hit points of whatever stands on the plot. */
export function buildingHp(ps: PlotState): number {
  if (ps.stand) return ps.stand.wrecked ? 0 : STAND_HP[ps.stand.level - 1];
  if (ps.facility) return ps.facility.wrecked ? 0 : FACILITIES[ps.facility.kind].hp[ps.facility.level - 1];
  return 0;
}
export const SIDE_LOT_PRICE = SIDE_LOT.price;
export const TUTORIAL_RAID_DAY = 15; // the night after the Summer Fair
export const PLAYER_REBUILD_DAYS = 1; // a smashed plot of yours goes For Sale if it isn't rebuilt by the next dawn but one

// ---------- Threat ----------

/** Threat follows rank (Ranks 1–2 give 1, up to 5 at Ranks 9–10); Laid Back takes 1 away. */
export function threatLevel(s: GameState): number {
  return Math.min(5, Math.max(1, Math.ceil(s.rank / 2) + difficulty(s).threat)); // Custom too (modes.ts difficultyOf)
}

// ---------- defenses ----------

export function canBuyPerimeter(s: GameState, plotId: string): Blocker {
  const ps = s.plots[plotId];
  if (ps.owner !== 'player') return { ok: false, why: 'Not your plot' };
  const next = PERIMETERS[ps.defense.tier];
  if (!next) return { ok: false, why: 'Best wall already' };
  if (s.rank < next.rank) return { ok: false, why: `Needs Rank ${next.rank}, ${RANKS[next.rank - 1].title}` };
  if (s.phase === 'open') return { ok: false, why: 'Build after closing or at Morning Prep' };
  if (s.cash < next.cost) return { ok: false, why: `Needs ${money(next.cost)}` };
  return { ok: true };
}

export function buyPerimeter(s: GameState, plotId: string): boolean {
  if (!canBuyPerimeter(s, plotId).ok) return false;
  const ps = s.plots[plotId];
  const next = PERIMETERS[ps.defense.tier];
  s.cash = round2(s.cash - next.cost);
  s.today.land = round2(s.today.land + next.cost);
  ps.invested += next.cost;
  ps.defense.tier = next.tier;
  ps.defense.fenceHp = next.hp;
  delete ps.defense.repairs; // the new fence goes up whole
  return true;
}

/** The fence's repair bill: its tier's flat repair (10% of its price) for every raid on the plot since the last repair, won or
 * lost. `full` is the fence's HP when whole (more on Hollis land, with the rivals lane's hay bales). */
export function fenceRepairCost(ps: PlotState, full = PERIMETERS[ps.defense.tier - 1]?.hp ?? 0): number {
  const per = PERIMETERS[ps.defense.tier - 1];
  if (!per) return 0;
  return Math.max(ps.defense.repairs ?? 0, ps.defense.fenceHp < full ? 1 : 0) * per.repair;
}

/** A Lemon-Peel Slick that went off costs its reset fee to lay again. */
export const slickResetCost = (ps: PlotState) => (ps.defense.slickSprung && ps.defense.gadgets.includes('slick') ? GADGETS.slick.reset ?? 0 : 0);

/** The gadgets that will go off in a fight here: a sprung Slick sits out until it is reset. */
export const armedGadgets = (ps: PlotState): GadgetId[] => ps.defense.gadgets.filter((g) => !(g === 'slick' && ps.defense.slickSprung));

/** After a fight on a plot: its fence is due a repair and an armed Slick is spent. */
export function defensesAfterRaid(ps: PlotState): void {
  if (ps.defense.tier) ps.defense.repairs = (ps.defense.repairs ?? 0) + 1;
  if (armedGadgets(ps).includes('slick')) ps.defense.slickSprung = true;
}

/** Patch the fence now rather than waiting for the night (the same flat bill). */
export function repairFence(s: GameState, plotId: string): boolean {
  const ps = s.plots[plotId];
  const cost = fenceRepairCost(ps);
  if (ps.owner !== 'player' || !cost || s.cash < cost) return false;
  s.cash = round2(s.cash - cost);
  s.today.upkeep = round2(s.today.upkeep + cost); // ledger: repairs
  mendFence(ps);
  return true;
}

/** A repaired fence: back to full HP (`full`: its tier's, or more with a rival's hay bales), with no raids left on its bill. */
export function mendFence(ps: PlotState, full = PERIMETERS[ps.defense.tier - 1].hp): void {
  ps.defense.fenceHp = full;
  delete ps.defense.repairs;
}

/** Overnight, each of your raided plots has its fence repaired and a sprung Slick re-laid, paid from your cash (rivals pay
 * theirs from their Guard money: rivalDefenseSpend). Short of cash, it waits: the fence stays chopped, the Slick stays sprung. */
export function overnightRepairs(s: GameState): void {
  let paid = 0;
  const short = new Set<string>();
  for (const p of PLOTS) {
    const ps = s.plots[p.id];
    if (ps.owner !== 'player') continue;
    const pay = (cost: number): boolean => {
      if (!cost) return false;
      if (s.cash < cost) { short.add(PLOT_BY_ID[p.id].name); return false; }
      s.cash = round2(s.cash - cost);
      paid += cost;
      return true;
    };
    if (pay(fenceRepairCost(ps))) mendFence(ps);
    if (pay(slickResetCost(ps))) delete ps.defense.slickSprung;
  }
  if (paid) s.today.upkeep = round2(s.today.upkeep + paid); // ledger: repairs
  if (short.size) s.news.push(`No cash for the overnight repairs at ${[...short].join(', ')}. Patch them when you can.`);
}

export function canBuyGadget(s: GameState, plotId: string, g: GadgetId): Blocker {
  const ps = s.plots[plotId];
  const gd = GADGETS[g];
  if (ps.owner !== 'player') return { ok: false, why: 'Not your plot' };
  if (ps.defense.gadgets.includes(g)) return { ok: false, why: 'Installed' };
  if (g === 'alarm' && freeAlarm(s, plotId)) return { ok: false, why: 'Neighborhood Watch rings one here' };
  if (s.rank < gd.rank) return { ok: false, why: `Needs Rank ${gd.rank}` };
  if (ps.defense.gadgets.length >= GADGET_SLOTS(ps.stand?.level ?? 1)) return { ok: false, why: 'No free gadget slot' };
  if (s.cash < gd.cost) return { ok: false, why: `Needs ${money(gd.cost)}` };
  return { ok: true };
}

export function buyGadget(s: GameState, plotId: string, g: GadgetId): boolean {
  if (!canBuyGadget(s, plotId, g).ok) return false;
  const ps = s.plots[plotId];
  s.cash = round2(s.cash - GADGETS[g].cost);
  s.today.land = round2(s.today.land + GADGETS[g].cost);
  ps.invested += GADGETS[g].cost;
  ps.defense.gadgets.push(g);
  return true;
}

/** A rival's chance to rebuild a smashed building here: 40–80% by personality, −30 points per Smash in the last 7 days. */
export function rebuildChance(s: GameState, plotId: string): number {
  const ps = s.plots[plotId];
  if (!ps.owner || ps.owner === 'player') return 0;
  const recent = (ps.smashes ?? []).filter((d) => d > s.day - 7).length;
  const next = isWrecked(ps) ? recent : recent + 1; // before a raid: counting the smash you're planning
  return Math.max(0, FACTIONS[ps.owner as RivalId].rebuild - 0.3 * Math.max(0, next - 1));
}

/** Rebuild a Wrecked building for 15% of what was invested in it; repair a Busted one (Laid Back) for 10%. The base is
 * the building itself (damage.ts buildingInvested): the plot's fences and gadgets don't count. */
export function rebuildCost(ps: PlotState): number {
  return dollarsUp(buildingInvested(ps) * (ps.busted ? BUSTED_REPAIR_SHARE : REBUILD_SHARE));
}

/** Approve the rebuild of your Wrecked building (the fix of a Busted one): paid now, built overnight, open at dawn at
 * full HP (damage.ts approveRebuild). */
export const rebuildStand = (s: GameState, plotId: string): boolean => approveRebuild(s, plotId);

// ---------- guards ----------

// (no 'Dex': only the story's Dex Moody is drawn as lanky Dex)
const FIRST = ['Dash', 'Moxie', 'Tank', 'Lulu', 'Big Sal', 'Pip', 'Rocco', 'Juno', 'Biscuit', 'Marge', 'Ziggy', 'Hank', 'Tess', 'Boomer', 'Nell', 'Gus', 'Kiki', 'Otis', 'Pearl', 'Duke'];
const LAST = ['Moody', 'Malone', 'Pickles', 'Brickman', 'Quill', 'Sorrel', 'Kettle', 'Bramble', 'Gristle', 'Lark', 'Hobbs', 'Puddle'];

function makeGuard(s: GameState, rng: Rng, level = 1): Guard {
  const name = `${FIRST[Math.floor(nextRandom(rng) * FIRST.length)]} ${LAST[Math.floor(nextRandom(rng) * LAST.length)]}`;
  const trait = TRAITS[Math.floor(nextRandom(rng) * TRAITS.length)];
  const face = Math.floor(nextRandom(rng) * 0x7fffffff);
  return { id: `g${s.nextId++}`, name, trait, level, xp: GUARD_XP_TO_LEVEL[level - 1], weapon: 'fists', gear: 'none', post: null, outUntil: 0, fee: GUARD_FEE[level - 1], face };
}

/** A recruit's level: any from Rookie to Legend, likelier higher as your Rank climbs. */
function recruitLevel(rank: number, roll: number): number {
  const odds = RECRUIT_LEVELS[Math.min(Math.max(rank, 1), RECRUIT_LEVELS.length) - 1];
  for (let i = 0; i < odds.length; i++) { roll -= odds[i]; if (roll < 0) return i + 1; }
  return 1;
}

/** The Hiring Hall's 6 recruits refresh every 7 days (and the first time the Hall opens, at Rank 2). */
export function refreshRecruits(s: GameState, force = false): void {
  if (s.rank < HIRE_RANK) return;
  if (!force && s.recruitDay !== undefined && s.day - s.recruitDay < RECRUIT_DAYS) return;
  const rng = { seed: s.seed };
  s.recruits = Array.from({ length: RECRUIT_POOL }, () => makeGuard(s, rng, recruitLevel(s.rank, nextRandom(rng))));
  s.recruitDay = s.day;
  s.seed = rng.seed;
}

/** Beds in every Clubhouse you have standing (they add up). */
export const clubhouseBeds = (s: GameState) => allBeds(s);
export const rosterCap = (s: GameState) => ROSTER_BASE + clubhouseBeds(s);
export const guardWage = (g: Guard) => GUARD_WAGE[g.level - 1];

/** Dawn payday, guard by guard in roster order with the Loyal paid last. Wages never take cash below $0: an unpaid guard quits, a Loyal one stays on unpaid. */
export function payCrew(s: GameState): void {
  const order = [...s.guards.filter((g) => g.trait !== 'Loyal'), ...s.guards.filter((g) => g.trait === 'Loyal')];
  let paid = 0;
  for (const g of order) {
    const wage = guardWage(g);
    if (s.cash >= wage) {
      s.cash = round2(s.cash - wage);
      paid += wage;
    } else if (g.trait === 'Loyal') {
      s.news.push(`${g.name} stays on without pay. "Loyal to the last drop, Miss Lottie."`);
    } else {
      fireGuard(s, g.id);
      s.news.push(`${g.name} quits: "No pay, no play."`);
    }
  }
  if (paid) s.today.upkeep = round2(s.today.upkeep + paid); // ledger: wages
}

/** Level up once XP reaches the next threshold (duty adds fractions, so allow for rounding). The Training Yard can call this too. */
export function levelUp(s: GameState, g: Guard): void {
  while (g.level < 5 && g.xp >= GUARD_XP_TO_LEVEL[g.level] - 1e-3) { g.level++; s.news.push(`${g.name} is now a ${guardTitle(g)}!`); }
}

/** XP still needed for the next level, and the share of the way there. */
export function xpToNext(g: Guard): { need: number; progress: number } {
  if (g.level >= 5) return { need: 0, progress: 1 };
  const lo = GUARD_XP_TO_LEVEL[g.level - 1], hi = GUARD_XP_TO_LEVEL[g.level];
  return { need: Math.max(0, hi - g.xp), progress: Math.max(0, Math.min(1, (g.xp - lo) / (hi - lo))) };
}

/** Duty: each dawn, a guard who stood a post yesterday (and wasn't Out) earns 1/35 of the way to the next level. */
export function dutyXp(s: GameState): void {
  for (const g of s.guards) {
    if (!g.post || s.plots[g.post]?.owner !== 'player' || g.outUntil > s.day - 1 || g.level >= 5) continue;
    const step = (GUARD_XP_TO_LEVEL[g.level] - GUARD_XP_TO_LEVEL[g.level - 1]) / DUTY_DAYS_PER_LEVEL;
    g.xp = Math.round((g.xp + step) * 1e6) / 1e6;
    levelUp(s, g);
  }
}

export function canHire(s: GameState, id: string): Blocker {
  const g = s.recruits.find((r) => r.id === id);
  if (!g) return { ok: false, why: 'Gone' };
  if (s.rank < HIRE_RANK) return { ok: false, why: `Needs Rank ${HIRE_RANK}, ${RANKS[HIRE_RANK - 1].title}` };
  if (s.guards.length >= rosterCap(s)) return { ok: false, why: clubhouses(s).length ? 'Clubhouse is full' : 'Build a Clubhouse to house more guards' };
  if (s.cash < g.fee) return { ok: false, why: `Needs ${money(g.fee)}` };
  return { ok: true };
}

export function hireGuard(s: GameState, id: string): boolean {
  if (!canHire(s, id).ok) return false;
  const i = s.recruits.findIndex((r) => r.id === id);
  const g = s.recruits.splice(i, 1)[0];
  s.cash = round2(s.cash - g.fee);
  g.post = null;
  s.guards.push(g);
  const posted = postGuard(s, g.id, s.selected); // the plot you're looking at, if it has a free post; else the Clubhouse
  s.news.push(`${g.name} (${g.trait}) joins the crew and ${posted ? `stands guard at ${PLOT_BY_ID[s.selected].name}` : 'waits at the Clubhouse'}.`);
  return true;
}

export function fireGuard(s: GameState, id: string): void {
  s.guards = s.guards.filter((g) => g.id !== id);
}

/** Guard posts on a plot: a stand's level sets 1, 2, 3, 4 or 6; other buildings have 3; a bare lot has none. */
export function postsFor(s: GameState, plotId: string): number {
  const ps = s.plots[plotId];
  if (ps.stand) return STAND_LEVELS[ps.stand.level - 1].guardPosts;
  return ps.facility || PLOT_BY_ID[plotId].type === 'hq' ? BUILDING_POSTS : 0;
}

/** Everyone holding a post here, including guards who are Out or away on a raid (it stays theirs till they're back). */
export const postedAt = (s: GameState, plotId: string) => s.guards.filter((g) => g.post === plotId);

/** Can this guard take a post here? (null is the Clubhouse reserve, always open.) */
export function canPost(s: GameState, id: string, plotId: string | null): Blocker {
  const g = s.guards.find((x) => x.id === id);
  if (!g) return { ok: false, why: 'No such guard' };
  if (plotId === null || g.post === plotId) return { ok: true };
  if (s.plots[plotId].owner !== 'player') return { ok: false, why: 'Not your plot' };
  const posts = postsFor(s, plotId);
  if (!posts) return { ok: false, why: 'No guard posts on a bare lot' };
  if (postedAt(s, plotId).length >= posts) return { ok: false, why: `All ${posts} post${posts === 1 ? '' : 's'} taken` };
  return { ok: true };
}

/** Post a guard on a plot of yours (within its posts) or send them to the Clubhouse reserve (null). */
export function postGuard(s: GameState, id: string, plotId: string | null): boolean {
  if (!canPost(s, id, plotId).ok) return false;
  s.guards.find((x) => x.id === id)!.post = plotId;
  return true;
}

/** Ready guards who could move to this plot: the reserve first, then guards from plots no warned raid is heading for. */
function movers(s: GameState, plotId: string): Guard[] {
  const threatened = new Set(incomingRaids(s).map((r) => r.target));
  const raiding = new Set(s.raids.flatMap((r) => (r.attacker === 'player' ? r.guards ?? [] : [])));
  return s.guards.filter((g) => g.post !== plotId && guardReady(s, g) && !raiding.has(g.id) && !(g.post && threatened.has(g.post)))
    .sort((a, b) => (a.post ? 1 : 0) - (b.post ? 1 : 0));
}

/** How many guards "fill the posts" here would move. */
export const fillable = (s: GameState, plotId: string) =>
  s.plots[plotId].owner === 'player' ? Math.min(Math.max(0, postsFor(s, plotId) - postedAt(s, plotId).length), movers(s, plotId).length) : 0;

/** Fill a plot's free posts (the raid warning's button). Returns how many guards moved. */
export function fillPosts(s: GameState, plotId: string): number {
  let moved = 0;
  for (const g of movers(s, plotId)) if (postGuard(s, g.id, plotId)) moved++; else break;
  return moved;
}

/** Guards on a plot you no longer hold, or past its posts, go back to the Clubhouse (roster order keeps the first ones). */
export function tidyPosts(s: GameState): void {
  const held: Record<string, number> = {};
  for (const g of s.guards) {
    if (!g.post) continue;
    const ok = s.plots[g.post]?.owner === 'player' && (held[g.post] ?? 0) < postsFor(s, g.post);
    if (ok) held[g.post] = (held[g.post] ?? 0) + 1; else g.post = null;
  }
}

export function canEquip(s: GameState, id: string, item: WeaponId | GearId): Blocker {
  const g = s.guards.find((x) => x.id === id);
  if (!g) return { ok: false, why: 'No such guard' };
  const w = (WEAPONS as Record<string, { rank: number; cost: number }>)[item] ?? (GEAR as Record<string, { rank: number; cost: number }>)[item];
  if (g.weapon === item || g.gear === item) return { ok: false, why: 'Equipped' };
  if (s.rank < w.rank) return { ok: false, why: `Needs Rank ${w.rank}` };
  if (s.cash < w.cost) return { ok: false, why: `Needs ${money(w.cost)}` };
  return { ok: true };
}

export function equip(s: GameState, id: string, item: WeaponId | GearId): boolean {
  if (!canEquip(s, id, item).ok) return false;
  const g = s.guards.find((x) => x.id === id)!;
  if (item in WEAPONS) { g.weapon = item as WeaponId; s.cash = round2(s.cash - WEAPONS[item as WeaponId].cost); }
  else { g.gear = item as GearId; s.cash = round2(s.cash - GEAR[item as GearId].cost); }
  return true;
}

/**
 * A Clubhouse on this plot: a new one on an empty Street plot of yours, or the
 * next level of the one standing there. With no plot named, where the next
 * beds go (clubhouseSite: an empty Street plot first, else the smallest one).
 */
export function canBuildClubhouse(s: GameState, plotId: string | null = clubhouseSite(s)): Blocker {
  if (!plotId) return { ok: false, why: 'Needs an empty Street plot of yours' };
  return canBuildFacility(s, plotId, 'clubhouse');
}

export function buildClubhouse(s: GameState, plotId: string | null = clubhouseSite(s)): boolean {
  if (!plotId || !canBuildClubhouse(s, plotId).ok) return false;
  const first = !clubhouses(s).length;
  if (!buildFacility(s, plotId, 'clubhouse')) return false;
  const level = s.plots[plotId].facility!.level;
  s.news.pop(); // the facility's opening line, said with the beds instead
  s.news.push(`${FACILITIES.clubhouse.names[level - 1]} opens at ${PLOT_BY_ID[plotId].name}: beds for ${CLUBHOUSE[level - 1].beds} guards.${first ? ' Dex no longer sleeps in the shed.' : ''}`);
  return true;
}

export const guardTitle = (g: Guard) => GUARD_LEVEL_TITLES[g.level - 1];

/** Promote a Level 3+ guard to one specialty: Lookout or Wrecker from Rank 4, Captain from Rank 6. */
export function canPromote(s: GameState, id: string, sp: Specialty): Blocker {
  const g = s.guards.find((x) => x.id === id);
  if (!g) return { ok: false, why: 'No such guard' };
  if (g.specialty) return { ok: false, why: `Already a ${SPECIALTIES[g.specialty].name}` };
  if (s.rank < SPECIALTIES[sp].rank) return { ok: false, why: `Needs Rank ${SPECIALTIES[sp].rank}, ${RANKS[SPECIALTIES[sp].rank - 1].title}` };
  if (g.level < PROMOTE_LEVEL) return { ok: false, why: `Needs a Level ${PROMOTE_LEVEL} ${GUARD_LEVEL_TITLES[PROMOTE_LEVEL - 1]}` };
  return { ok: true };
}

export function promote(s: GameState, id: string, sp: Specialty): boolean {
  if (!canPromote(s, id, sp).ok) return false;
  const g = s.guards.find((x) => x.id === id)!;
  g.specialty = sp;
  s.news.push(`${g.name} steps up as the crew's ${SPECIALTIES[sp].name}!`);
  return true;
}
export const guardReady = (s: GameState, g: Guard) => g.outUntil <= s.day;

export function guardFighter(g: Guard, side: 'att' | 'def', night: boolean): Fighter {
  const m = 1 + 0.1 * (g.level - 1);
  let hp = (GUARD_BASE.hp + GEAR[g.gear].hp) * m;
  let hit = WEAPONS[g.weapon].hit * m;
  let chop = WEAPONS[g.weapon].chop * m;
  let nerve = GUARD_BASE.nerve;
  let speed = COMBAT.speed;
  if (g.trait === 'Tough Cookie') hp *= 1.2;
  if (g.trait === 'Gentle Giant') { hp *= 1.5; hit *= 0.7; }
  if (g.trait === 'Hothead') { hit *= 1.15; nerve -= 20; }
  chop *= 1 + (g.trait === 'Lumberjack' ? 0.5 : 0) + (g.specialty === 'wrecker' ? WRECKER_CHOP : 0); // Lumberjack and Wrecker: +50% each
  if (g.trait === 'Sprinter') speed *= COMBAT.sprinter;
  if (g.trait === 'Night Owl' && night) { hit *= 1.25; chop *= 1.25; }
  return { id: g.id, name: g.name, side, hp, hit, chop, nerve, armor: GEAR[g.gear].armor, weapon: g.weapon, speed, trait: g.trait, gear: g.gear, level: g.level };
}

/** Your guards as one side of a fight: a Captain among them gives everyone on that side +20 Nerve and +10% Hit (Captains don't stack). */
export function squadFighters(guards: Guard[], side: 'att' | 'def', night: boolean): Fighter[] {
  const fighters = guards.map((g) => guardFighter(g, side, night));
  if (guards.some((g) => g.specialty === 'captain')) for (const f of fighters) { f.nerve += CAPTAIN.nerve; f.hit *= 1 + CAPTAIN.hit; }
  return fighters;
}

/** The guards picked for a raid who are fit to go. */
export const raidSquad = (s: GameState, ids: string[]) => s.guards.filter((g) => ids.includes(g.id) && guardReady(s, g));

/** Saves from before a crew rule existed pick up its defaults (idempotent; migrateSave runs it on every load). */
export function migrateCrew(s: GameState): void {
  s.guards ??= [];
  s.recruits ??= [];
  tidyPosts(s); // saves from before guard posts: the extra guards wait at the Clubhouse
  for (const ps of Object.values(s.plots)) {
    const per = ps.defense && PERIMETERS[ps.defense.tier - 1];
    if (per && ps.defense.fenceHp < per.hp && !ps.defense.repairs) ps.defense.repairs = 1; // chopped before overnight repairs: fixed at the next dawn
  }
}

// ---------- henchmen ----------

const HENCH_NAMES: Record<RivalId, string> = { sourwood: 'Steward', hollis: 'Farmhand', fizzco: 'Associate', coldbrew: 'Barista', blenders: 'Smoothie Bro' };

function henchman(s: GameState, rival: RivalId, threat: number, rng: Rng, i: number, side: 'att' | 'def'): Fighter {
  const party = RAID_PARTY[threat - 1];
  const r = nextRandom(rng);
  const weapon: WeaponId = r < party.weapons[0] ? 'fists' : r < party.weapons[0] + party.weapons[1] ? 'clubs' : 'hatchets';
  const h = HENCHMEN[threat - 1];
  const m = 1 + 0.1 * (h.level - 1);
  return {
    id: `${rival}-${side}-${s.nextId++}`, name: `${HENCH_NAMES[rival]} #${i + 1}`, side,
    hp: (GUARD_BASE.hp + GEAR[h.gear].hp) * m, hit: WEAPONS[weapon].hit * m, chop: WEAPONS[weapon].chop * m,
    nerve: GUARD_BASE.nerve, armor: GEAR[h.gear].armor, weapon, gear: h.gear, level: h.level,
  };
}

export const henchmanFor = (s: GameState, rival: RivalId, tier: number, rng: Rng, i: number) => henchman(s, rival, tier, rng, i, 'def');

export function raidPartyFor(s: GameState, rival: RivalId): Fighter[] {
  const rng = { seed: s.seed };
  const party = raidParty(s, rival, threatLevel(s), rng);
  s.seed = rng.seed;
  return party;
}

function raidParty(s: GameState, rival: RivalId, threat: number, rng: Rng): Fighter[] {
  const [lo, hi] = RAID_PARTY[threat - 1].size;
  const n = lo + Math.floor(nextRandom(rng) * (hi - lo + 1));
  return Array.from({ length: n }, (_, i) => henchman(s, rival, threat, rng, i, 'att'));
}

/** The kit row a rival plot builds toward: its stand's level, or a facility's tier + 2. */
export const rivalKit = (ps: PlotState) => RIVAL_KIT[Math.min(5, Math.max(1, ps.stand?.level ?? (ps.facility ? ps.facility.level + 2 : 1))) - 1];

/** A rival plot's defenders: its garrison (never more than its posts), armed and padded as its kit row says. */
function garrisonFighters(s: GameState, plotId: string, rng: Rng): Fighter[] {
  const ps = s.plots[plotId];
  const rival = ps.owner as RivalId;
  const kit = rivalKit(ps);
  const m = 1 + 0.1 * (kit.level - 1);
  return Array.from({ length: Math.min(ps.garrison ?? 0, postsFor(s, plotId)) }, (_, i) => {
    const r = nextRandom(rng);
    const weapon: WeaponId = r < kit.weapons[0] ? 'fists' : r < kit.weapons[0] + kit.weapons[1] ? 'clubs' : 'hatchets';
    return {
      id: `${rival}-def-${s.nextId++}`, name: `${HENCH_NAMES[rival]} #${i + 1}`, side: 'def' as const,
      hp: (GUARD_BASE.hp + GEAR[kit.gear].hp) * m, hit: WEAPONS[weapon].hit * m, chop: WEAPONS[weapon].chop * m,
      nerve: GUARD_BASE.nerve, armor: GEAR[kit.gear].armor, weapon, // everyone starts at Nerve 50 (combat)
    };
  });
}

/** How a rival pays for its defenses: the rivals lane's Guard bucket (rivalAi.ts rivalGuardSpend), at its own prices. */
export interface GuardPurse {
  /** Pay this out of the Guard money if it covers it (false, and nothing moves, if not). */
  pay: (cost: number) => boolean;
  /** Take on one more henchman here if the Guard money covers his hire and his wage (it pays the hire). */
  hire: (ps: PlotState) => boolean;
  /** What this rival pays for a fence of `tier` (Hollis's Dig In: less). Your price if left out. */
  fencePrice?: (tier: number) => number;
  /** A plot's fence at full HP (Hollis's Dig In: hay bales behind it). The tier's HP if left out. */
  fenceFull?: (ps: PlotState) => number;
  /** Patching a plot's fence back to full (Hollis's Dig In: at its share). Your overnight bill if left out. */
  patchCost?: (ps: PlotState) => number;
}

/** A rival puts up the next fence on a plot if it is no higher than `cap` and the Guard money covers it: true when it does. */
export function rivalFence(ps: PlotState, cap: number, purse: GuardPurse): boolean {
  const next = PERIMETERS[ps.defense.tier];
  if (!next || next.tier > cap) return false;
  const price = purse.fencePrice?.(next.tier) ?? next.cost;
  if (!purse.pay(price)) return false;
  ps.invested += price; // a fence counts in Net Worth at 75%, like yours
  ps.defense = { ...ps.defense, tier: next.tier };
  mendFence(ps, purse.fenceFull?.(ps)); // the new fence goes up whole
  return true;
}

/**
 * What a rival's Guard money buys at dawn. First the repairs on every plot it holds (each fence's flat repair for the
 * raids since the last one, a sprung Slick's reset). Then its 3 most valuable standing plots (stands and facilities)
 * each take one step toward their kit row: the fence first, else a henchman for a free post while his wage is
 * covered, else the next gadget.
 */
export function rivalDefenseSpend(s: GameState, id: RivalId, purse: GuardPurse): void {
  const plots = ownedPlots(s, id).sort((a, b) => s.plots[b.id].invested - s.plots[a.id].invested);
  for (const p of plots) {
    const ps = s.plots[p.id];
    const patch = purse.patchCost ? purse.patchCost(ps) : fenceRepairCost(ps);
    if (patch > 0 && purse.pay(patch)) mendFence(ps, purse.fenceFull?.(ps));
    if (slickResetCost(ps) && purse.pay(slickResetCost(ps))) delete ps.defense.slickSprung;
  }
  for (const p of plots.filter((q) => q.type !== 'hq' && hasBuilding(s.plots[q.id])).slice(0, 3)) {
    const ps = s.plots[p.id];
    const kit = rivalKit(ps);
    const gadget = kit.gadgets.find((g) => !ps.defense.gadgets.includes(g));
    if (rivalFence(ps, kit.fence, purse)) continue;
    if ((ps.garrison ?? 0) < postsFor(s, p.id) && purse.hire(ps)) {
      ps.garrison = (ps.garrison ?? 0) + 1;
    } else if (gadget && ps.defense.gadgets.length < GADGET_SLOTS(ps.stand?.level ?? 1) && purse.pay(GADGETS[gadget].cost)) {
      ps.invested += GADGETS[gadget].cost; // like yours, a gadget counts as building investment
      ps.defense.gadgets = [...ps.defense.gadgets, gadget];
    }
  }
}

function defendersAt(s: GameState, plotId: string, night: boolean, away: Set<string>, rng: Rng): Fighter[] {
  const ps = s.plots[plotId];
  if (ps.owner === 'player') return squadFighters(s.guards.filter((g) => g.post === plotId && guardReady(s, g) && !away.has(g.id) && !scoutingToday(s, g)), 'def', night);
  return garrisonFighters(s, plotId, rng);
}

function battleInput(s: GameState, raid: Raid, attackers: Fighter[], night: boolean, away: Set<string>, rng: Rng): BattleInput {
  const ps = s.plots[raid.target];
  return {
    attackers, defenders: withDex(s, raid, defendersAt(s, raid.target, night, away, rng), night),
    perimeter: ps.defense.tier, fenceHp: ps.defense.fenceHp, gadgets: armedGadgets(ps),
    standHp: currentHp(ps), objective: raid.objective, detected: raid.detected,
  };
}

/** Who is really on a plot of yours right now: posted there, not Out, not out scouting, and not away on a raid (night.ts
 * awayGuards: from the minute it sets out until the squad is home again; until it sets out they hold their posts), the
 * one being fought live included (fight.ts keeps it off the raid clock till it ends). */
export function presentGuards(s: GameState, plotId: string): Guard[] {
  const away = awayGuards(s);
  if (s.fight?.raid.attacker === 'player') for (const id of s.fight.raid.guards ?? []) away.add(id);
  return s.guards.filter((g) => g.post === plotId && guardReady(s, g) && !away.has(g.id) && !scoutingToday(s, g));
}

// District control, until land's controlTier(s, d) and perkActive(s, perkId) take over: Stronghold at 75%+, Full Control at 100%.
const controlShare = (s: GameState, d: DistrictId) => districtControl(s, d);
/** Do you hold a Stronghold (75%+ of the purchasable plots) in this district? */
export const holdsStronghold = (s: GameState, d: DistrictId) => { const c = controlShare(s, d); return c.total > 0 && c.share >= 0.75; };
/** Maple Row's Full Control perk, Neighborhood Watch: free Tin-Can Alarms there, +10% detection everywhere. */
export const neighborhoodWatch = (s: GameState) => { const c = controlShare(s, 'maple'); return c.total > 0 && c.mine === c.total; };
/** Reinforcements sent into a Stronghold travel this much of their usual time (Ring the Bell multiplies by it). */
export const strongholdTravelMult = (s: GameState, d: DistrictId) => (holdsStronghold(s, d) ? STRONGHOLD_TRAVEL : 1);
/** Neighborhood Watch's free Tin-Can Alarm on a Maple Row plot of yours that has none of its own (it takes no gadget slot). */
export const freeAlarm = (s: GameState, plotId: string) =>
  s.plots[plotId].owner === 'player' && PLOT_BY_ID[plotId].district === 'maple' && !s.plots[plotId].defense.gadgets.includes('alarm') && neighborhoodWatch(s);

/** The Watchtower that watches this plot: one on it, or on a plot of the same owner within 2 plots (the same "nearby" passersby use). */
export function towerFor(s: GameState, plotId: string): string | null {
  const owner = s.plots[plotId].owner;
  if (!owner) return null;
  if (s.plots[plotId].defense.gadgets.includes('watchtower')) return plotId;
  return nearbyPlots(PLOT_BY_ID[plotId]).find((q) => s.plots[q.id].owner === owner && s.plots[q.id].defense.gadgets.includes('watchtower'))?.id ?? null;
}
/** Does a Watchtower cover this plot? It adds its 30% once however many reach it, and lets the raid warning show the makeup. */
export const towerCovers = (s: GameState, plotId: string) => towerFor(s, plotId) !== null;

/** Is there a Sneaky guard in this raiding party? (Their stealth counts once per raid.) */
export const sneakyIn = (s: GameState, guardIds: string[]) => s.guards.some((g) => guardIds.includes(g.id) && g.trait === 'Sneaky');

/** The chance a raid on this plot is spotted: 50% plus gadgets, a Watchtower in range and watchers, capped at 95%; then night takes 25 points off (unless Floodlights) and a Sneaky raider 25 more. Never below 0%. */
export function detectionChance(s: GameState, plotId: string, night: boolean, sneaky = false): number {
  const ps = s.plots[plotId];
  const mine = ps.owner === 'player';
  const here = mine ? presentGuards(s, plotId) : [];
  let d = DETECTION_BASE + ps.defense.gadgets.reduce((a, g) => a + (g === 'watchtower' ? 0 : GADGETS[g].detection), 0);
  if (towerCovers(s, plotId)) d += GADGETS.watchtower.detection;
  if (freeAlarm(s, plotId)) d += GADGETS.alarm.detection;
  if (here.some((g) => g.trait === 'Eagle Eye')) d += EAGLE_EYE_DETECTION;
  if (here.some((g) => g.specialty === 'lookout')) d += LOOKOUT_DETECTION;
  if (mine && neighborhoodWatch(s)) d += NEIGHBORHOOD_WATCH_DETECTION;
  if (mine && holdsStronghold(s, PLOT_BY_ID[plotId].district)) d += STRONGHOLD_DETECTION;
  d = Math.min(DETECTION_CAP, d);
  if (night && !ps.defense.gadgets.includes('floodlights')) d -= NIGHT_STEALTH;
  if (sneaky) d -= SNEAKY_STEALTH;
  return Math.max(0, Math.round(d * 1000) / 1000);
}

// ---------- player raids ----------

/** Daytime is 08:00–20:00, when customers see a raid; Morning Prep (07:00) and the Evening count as night. */
export const raidIsNightAt = (minute: number) => minute < OPEN || minute >= CLOSE;
/** Is it night on the clock now? A raid's fight minute decides whether it is a night raid. */
export const raidIsNight = (s: GameState) => raidIsNightAt(s.minute);

/** Stars a raid fought now costs: 0.1 by day (0.2 for a Smash), nothing at night, nothing when Gentle Giants go alone. */
export function raidRepCost(s: GameState, guardIds: string[], objective: RaidObjective, night = raidIsNight(s)): number {
  if (night) return 0;
  const squad = s.guards.filter((g) => guardIds.includes(g.id));
  if (squad.length && squad.every((g) => g.trait === 'Gentle Giant')) return 0;
  return objective === 'smash' ? DAYTIME_RAID_REP.smash : DAYTIME_RAID_REP.raid;
}

export function raidTargets(s: GameState): Plot[] {
  return PLOTS.filter((p) => {
    const ps = s.plots[p.id];
    return ps.owner && ps.owner !== 'player' && hasBuilding(ps) && p.type !== 'hq';
  });
}

export function availableRaiders(s: GameState): Guard[] {
  const busy = awayOnRaid(s); // planned, out, walking home, or in the fight playing live
  return s.guards.filter((g) => guardReady(s, g) && !busy.has(g.id) && g.scoutDay !== s.day);
}

/** The day a Sabotage now would close the stand: today if it hasn't opened yet (Morning Prep), else tomorrow. */
const spoilDay = (s: GameState) => (s.phase === 'prep' ? s.day : s.day + 1);

/** Is this stand's stock spoiled today (a Sabotage): it sells nothing until tomorrow. */
export const isSpoiled = (s: GameState, ps: PlotState) => ps.stand?.spoiledDay === s.day;

/** Sabotage's own locks: Rank 4, a stand to spoil, stock not already spoiled, and a Lookout or a Sneaky guard to lead it. */
export function canSabotage(s: GameState, plotId: string, guardIds: string[]): Blocker {
  const st = s.plots[plotId].stand;
  if (s.rank < SABOTAGE_RANK) return { ok: false, why: `Sabotage unlocks at Rank ${SABOTAGE_RANK}, ${RANKS[SABOTAGE_RANK - 1].title}` };
  if (!st || st.wrecked) return { ok: false, why: 'Sabotage needs a stand to spoil' };
  if ((st.spoiledDay ?? 0) >= spoilDay(s)) return { ok: false, why: 'Their stock is already spoiled' };
  if (!raidSquad(s, guardIds).some((g) => g.specialty === 'lookout' || g.trait === 'Sneaky')) return { ok: false, why: 'Sabotage needs a Lookout or a Sneaky guard' };
  return { ok: true };
}

/** A Sabotage that got its 10 minutes with the stock: every lemon, scoop of sugar and cube of ice is ruined, and the stand can't sell its next day. */
export function spoilStock(s: GameState, plotId: string): void {
  const st = s.plots[plotId].stand;
  if (!st) return;
  st.spoiledDay = spoilDay(s);
  st.inventory = { ...st.inventory, lemons: [], sugar: 0, ice: 0 };
  st.pitcherCups = 0;
}

/** Rivals sabotage your stands too, from Rank 4: Cold Brew's Night Shift often, the others now and then. */
export function maybeSabotage(s: GameState, raid: Raid, rng: Rng): void {
  if (s.rank < SABOTAGE_RANK || raid.attacker === 'player' || raid.delivery || !s.plots[raid.target].stand) return;
  if (nextRandom(rng) < RIVAL_SABOTAGE[raid.attacker as RivalId]) { raid.objective = 'shakedown'; raid.sabotage = true; }
}

export function canRaid(s: GameState, plotId: string, guardIds: string[], objective: RaidObjective = 'smash'): Blocker {
  const ps = s.plots[plotId];
  if (peaceful(s)) return { ok: false, why: 'Peaceful: no raids in this Sandbox' };
  if (s.rank < RAID_RANK) return { ok: false, why: `Raids unlock at Rank ${RAID_RANK}, ${RANKS[RAID_RANK - 1].title}` };
  if (PLOT_BY_ID[plotId].type === 'hq') return { ok: false, why: 'Storm an HQ from the Rivals board' };
  if (!ps.owner || ps.owner === 'player' || !hasBuilding(ps)) return { ok: false, why: 'Pick a rival stand or facility' };
  if (!guardIds.length) return { ok: false, why: 'Pick at least one guard' };
  if (guardIds.length > SQUAD_CAP(s.rank)) return { ok: false, why: `Squad cap is ${SQUAD_CAP(s.rank)}` };
  if (s.raids.some((r) => r.attacker === 'player' && r.target === plotId)) return { ok: false, why: 'Already planned' };
  if (objective === 'sabotage') return canSabotage(s, plotId, guardIds);
  return { ok: true };
}

/** Estimated win chance for the Raid Planner (night or now). */
export function raidOdds(s: GameState, plotId: string, guardIds: string[], objective: RaidObjective, night: boolean): number {
  if (!guardIds.length) return 0;
  const rng = { seed: s.seed ^ 0x0dd5 };
  const squad = squadFighters(s.guards.filter((g) => guardIds.includes(g.id)), 'att', night);
  const raid: Raid = { id: 'odds', attacker: 'player', target: plotId, objective: objective === 'sabotage' ? 'shakedown' : objective, detected: false, eta: '' };
  const input = battleInput(s, raid, squad, night, new Set(), rng);
  // Spotted or not decides who strikes first: weigh both by the target's real detection chance (Sneaky included).
  const seen = detectionChance(s, plotId, night, sneakyIn(s, guardIds));
  const spotted = seen > 0 ? winChance({ ...input, detected: true }, rng.seed, 40) : 0;
  const unseen = seen < 1 ? winChance({ ...input, detected: false }, rng.seed ^ 0x5eed, 40) : 0;
  return seen * spotted + (1 - seen) * unseen;
}

export function planRaid(s: GameState, plotId: string, guardIds: string[], objective: RaidObjective, when: 'now' | 'tonight'): BattleReport | boolean {
  if (!canRaid(s, plotId, guardIds, objective).ok) return false;
  const raid: Raid = { id: `r${s.nextId++}`, attacker: 'player', target: plotId, objective: objective === 'sabotage' ? 'shakedown' : objective, guards: guardIds, detected: false, eta: '' };
  if (objective === 'sabotage') raid.sabotage = true;
  breakTruce(s, s.plots[plotId].owner as RivalId);
  return sendRaid(s, raid, when); // nights: the squad travels; the fight's minute decides day or night, and the stars it costs
}

// ---------- rival raids and the night ----------

/** Called when the stands close (the Evening): rivals decide tonight's raids. Each sets out at its own minute and
 * travels by distance (night.ts runs the clock); the player is warned as the night goes, never all at once. */
export function planNight(s: GameState): void {
  if (peaceful(s)) return; // Peaceful Sandbox: rivals scheme with prices and land, never fists
  const rng = { seed: s.seed };
  const threat = threatLevel(s);
  // Rivals scheme against the player.
  const recentlyHit = s.battles.some((b) => b.defender === 'player' && b.day >= s.day - 1);
  // The first raid on you is the tutorial raid: it comes the night your first Kiosk opens or the night of the Summer Fair (Day 15), whichever is first.
  const tutorial = !s.battles.some((b) => b.defender === 'player');
  const tutorialNight = tutorial && (s.day >= TUTORIAL_RAID_DAY || ownedPlots(s, 'player').some((p) => (s.plots[p.id].stand?.level ?? 0) >= 3));
  const roll = nextRandom(rng);
  if (s.day > NO_RAID_DAYS && !recentlyHit && (tutorial ? tutorialNight : roll < RAIDS_PER_WEEK[threat - 1] * difficulty(s).raids / 7)) {
    const mine = ownedPlots(s, 'player').filter((p) => hasBuilding(s.plots[p.id]));
    const candidates = RIVALS.filter((r) => s.rivals[r].alive && s.rivals[r].respectUntil <= s.day + 1);
    if (mine.length && candidates.length) {
      const weights = candidates.map((r) => 1 + s.rivals[r].grudge / 10 + s.rivals[r].attention + FACTIONS[r].strike * 4);
      let x = nextRandom(rng) * weights.reduce((a, b) => a + b, 0);
      let rival = candidates[0];
      for (let i = 0; i < candidates.length; i++) { x -= weights[i]; if (x <= 0) { rival = candidates[i]; break; } }
      // The weakest valuable stand: value over defense.
      const score = (p: Plot) => {
        const ps = s.plots[p.id];
        const guards = s.guards.filter((g) => g.post === p.id).length;
        return (ps.invested + ps.landValue) / (1 + ps.defense.tier * 2 + guards * 3 + ps.defense.gadgets.length);
      };
      let target = mine.sort((a, b) => score(b) - score(a))[0];
      let party = raidParty(s, rival, threat, rng);
      let detected = false; // rolled as they set out (night.ts)
      if (tutorial) {
        // The tutorial raid: two Smoothie Bros with bare fists, straight at Dex. It always bounces.
        const dex = s.guards.find((g) => g.name === 'Dex Moody' && g.post);
        target = (dex ? PLOT_BY_ID[dex.post!] : target);
        rival = s.rivals.blenders.alive ? 'blenders' : rival;
        party = raidParty(s, rival, 1, rng).slice(0, 2).map((f) => ({ ...f, weapon: 'fists' as const, hp: 30, hit: 2, chop: 1, nerve: 20 }));
        detected = true;
        s.news.push(`Brock: "${TUTORIAL_CALL}"`); // story: phoneCall(s, 'blenders', TUTORIAL_CALL) once the phone lands
      }
      const roll = nextRandom(rng);
      const objective: Objective = tutorial || roll < 0.5 || threat === 1 ? 'shakedown' : 'smash'; // the tutorial raid is a Threat 1 Shakedown
      const leave = RAID_LEAVE.first + Math.floor(nextRandom(rng) * RAID_LEAVE.steps) * 15;
      const at = leave + travelMinutes(s, raidStart(s, rival, target.id), target.id);
      s.raids.push({ id: `r${s.nextId++}`, attacker: rival, target: target.id, objective, party, detected, eta: hhmm(at), leave, at, ...(tutorial ? { tutorial: true } : {}) });
    }
  }
  // Rivals also raid each other (about 30% of their raids at Threat 1–3).
  if (threat < 5 && nextRandom(rng) < (threat <= 3 ? 0.3 : 0.15)) {
    const a = RIVALS[Math.floor(nextRandom(rng) * RIVALS.length)];
    const targets = PLOTS.filter((p) => { const o = s.plots[p.id].owner; return o && o !== 'player' && o !== a && hasBuilding(s.plots[p.id]) && p.type !== 'hq'; });
    const t = targets[Math.floor(nextRandom(rng) * targets.length)];
    if (s.rivals[a].alive && t) s.raids.push({ id: `r${s.nextId++}`, attacker: a, target: t.id, objective: 'smash', party: raidParty(s, a, Math.min(3, threat + 1), rng), detected: true, eta: hhmm(RIVAL_RAID_AT), leave: RIVAL_RAID_AT - travelMinutes(s, raidStart(s, a, t.id), t.id), at: RIVAL_RAID_AT });
  }
  s.seed = rng.seed;
  s.raids.push(...signatureRaids(s));
  if (tutorial) return;
  // Sabotage is the call of the boss who ends up leading the raid (signatureRaids may hand it to another).
  const dice = { seed: s.seed };
  for (const raid of s.raids) if (s.plots[raid.target].owner === 'player') maybeSabotage(s, raid, dice);
  s.seed = dice.seed;
}

/** At dawn, anything still out arrives, in ETA order (the night's clock fights the rest at their minute). */
export function resolveNight(s: GameState): void {
  const ord = (r: Raid) => r.at ?? etaMinute(r.eta);
  const left = s.raids.map((r, i) => ({ r, i })).sort((a, b) => ord(a.r) - ord(b.r) || a.i - b.i).map(({ r }) => r);
  for (const r of left) {
    if (!s.raids.includes(r) || onTheRoad(r)) continue; // nights: your squad carries on into the morning
    s.raids = s.raids.filter((x) => x !== r);
    fightRaid(s, r, true);
  }
}

/** Who fights: the attackers, the detection roll and the defenders on the plot (dice from rng). */
export function raidInput(s: GameState, raid: Raid, night: boolean, rng: Rng): BattleInput {
  const away = awayOnRaid(s); // out on a raid, or in the fight playing live: not at their posts
  const attackers = raid.attacker === 'player'
    ? squadFighters(raidSquad(s, raid.guards!), 'att', night)
    : raid.party!;
  if (raid.attacker === 'player') raid.detected = nextRandom(rng) < detectionChance(s, raid.target, night, sneakyIn(s, raid.guards!));
  return withBell(s, raid, battleInput(s, raid, attackers, night, away, rng), night); // Ring the Bell: the reserve on its way
}

/** Fight a raid and live with the result. `fought`: a live fight (fight.ts) already fought it. */
export function fightRaid(s: GameState, raid: Raid, night: boolean, fought?: { input: BattleInput; res: BattleResult }): BattleReport {
  const rng = { seed: s.seed };
  const ps = s.plots[raid.target];
  const defender = ps.owner as FactionId;
  const input = fought?.input ?? raidInput(s, raid, night, rng);
  const res = fought?.res ?? runBattle(input, rng);
  s.seed = rng.seed;
  let loot = 0;
  if (raid.tutorial) tutorialBounce(input, res); // the first raid on you always bounces off the fence and Dex (threat.ts)

  ps.defense.fenceHp = res.fenceHpLeft;
  if (input.attackers.length) defensesAfterRaid(ps); // won or lost: the fence needs its overnight repair, a Slick its reset
  // Laid Back: your stands are only ever Busted (closed until a 10% repair), never Wrecked or lost.
  const busted = defender === 'player' && difficulty(s).bustOnly;
  if (res.outcome === 'smashed' && (ps.stand || ps.facility)) {
    if (ps.stand) ps.stand.wrecked = true; else ps.facility!.wrecked = true;
    ps.wreckedDay = s.day;
    ps.smashedBy = raid.attacker;
    ps.smashes = [...(ps.smashes ?? []).filter((d) => d > s.day - 7), s.day];
    if (busted) ps.busted = true;
    if (defender !== 'player') ps.garrison = 0;
    if (raid.attacker === 'player') bump(s, 'smashes');
  }
  if (raid.sabotage && res.outcome === 'robbed') spoilStock(s, raid.target);
  if (res.outcome === 'robbed' && !raid.delivery && !raid.sabotage) {
    loot = shakedownLoot(s, raid.target); // the till: about a day of that stand's profit (loot.ts)
    if (defender === 'player') s.cash = round2(s.cash - loot); // ledger: loot
    else s.rivals[defender as RivalId].cash = round2(s.rivals[defender as RivalId].cash - loot);
    if (raid.attacker === 'player') s.cash = round2(s.cash + loot); // ledger: loot
    else s.rivals[raid.attacker as RivalId].cash = round2(s.rivals[raid.attacker as RivalId].cash + loot);
  }
  if (defender !== 'player' && res.koed.length) ps.garrison = Math.max(0, (ps.garrison ?? 0) - res.koed.filter((id) => input.defenders.some((d) => d.id === id)).length);

  creditGuards(s, input, res);

  // Grudges and respect.
  if (raid.attacker === 'player' && defender !== 'player') {
    const r = s.rivals[defender as RivalId];
    r.grudge = Math.min(100, r.grudge + (res.winner === 'att' ? 20 : 8));
  }
  if (defender === 'player' && raid.attacker !== 'player' && res.winner === 'def') {
    s.rivals[raid.attacker as RivalId].respectUntil = s.day + 1 + difficulty(s).respectDays;
  }

  const hpLost = raidDamage(s, raid.target, res.standHpLeft); // the building keeps what the fight left it (damage.ts)
  const report: BattleReport = {
    hpLost: hpLost || undefined,
    delivery: raid.delivery, busted: busted && res.outcome === 'smashed' ? true : undefined,
    day: s.day, attacker: raid.attacker, defender, target: raid.target, objective: raid.objective, outcome: res.outcome, loot,
    attackers: input.attackers, defenders: input.defenders, perimeter: input.perimeter, standLevel: ps.stand?.level ?? 0,
    events: res.events, duration: res.duration, koed: res.koed, fled: res.fled, ...(input.joins?.length ? { joins: input.joins } : {}),
    gadgets: input.gadgets.length ? input.gadgets : undefined, night: night || undefined,
  };
  if (raid.sabotage) report.sabotage = true;
  if (raid.attacker === 'player' || defender === 'player') {
    s.battles.unshift(report);
    s.battles.length = Math.min(s.battles.length, 6);
    s.news.push(battleHeadline(report));
  }
  bugleFight(s, report); // world: the Bugle and 101.5 hear about every fight, rival-vs-rival included
  return report;
}

/** Guards: KOs are out a day (two if a hatchet landed the knockout blow); everyone who fought earns XP. */
export function creditGuards(s: GameState, input: BattleInput, res: { koed: string[]; hatchetKos?: string[]; winner: 'att' | 'def'; events?: BattleEvent[] }): void {
  // Late arrivals count once they've reached the fight (their 'at' on the timeline).
  const late = (input.joins ?? []).flatMap((j) => j.fighters).filter((f) => res.events?.some((e) => e.type === 'at' && e.a === f.id));
  for (const f of [...input.attackers, ...input.defenders, ...late]) {
    const g = s.guards.find((x) => x.id === f.id);
    if (!g) continue;
    if (res.koed.includes(g.id)) g.outUntil = s.day + 1 + (res.hatchetKos?.includes(g.id) ? 2 : 1);
    g.xp += (res.winner === f.side ? 2 : 1);
    while (g.level < 5 && g.xp >= GUARD_XP_TO_LEVEL[g.level]) { g.level++; s.news.push(`${g.name} is now a ${guardTitle(g)}!`); }
  }
}

const fname = (f: FactionId) => (f === 'player' ? "Lottie's crew" : FACTIONS[f as RivalId].name);

/** The Bugle's line for a fight, with the HP a building lost and kept (damage.ts). */
export function battleHeadline(b: BattleReport): string {
  return headline(b) + hpLostNote(b);
}

function headline(b: BattleReport): string {
  const where = PLOT_BY_ID[b.target].name;
  if (b.hq) return b.outcome === 'repelled'
    ? `HQ assault on ${where} stalls at the ${b.hq === 'gate' ? 'Gate' : b.hq === 'yard' ? 'Yard' : 'Boss Room'}.`
    : `Lottie's crew storms ${where}! ${fname(b.defender)} are finished.`;
  if (b.sabotage) return sabotageHeadline(b);
  if (b.delivery) return b.outcome === 'robbed' ? `Delivery raid! ${fname(b.attacker)} overrun ${where} and make off with the cargo.` : `Delivery raid at ${where} beaten off! The cargo gets through.`;
  if (b.attacker === 'player') {
    switch (b.outcome) {
      case 'smashed': return `RAID! Lottie's crew flattens the ${fname(b.defender)} ${b.standLevel ? 'stand' : 'facility'} at ${where}.`;
      case 'robbed': return `RAID! Lottie's crew shakes down ${where} for ${money(b.loot)}.`;
      case 'damaged': return `Lottie's crew roughs up ${where} but runs out of time.`;
      default: return `Raid on ${where} goes bust: ${fname(b.defender)} sends Lottie's crew packing.`;
    }
  }
  switch (b.outcome) {
    case 'smashed': return b.busted
      ? `Night raid! ${fname(b.attacker)} bust up ${b.standLevel ? 'the stand' : 'the facility'} at ${where}. It's closed until you repair it.`
      : `Night raid! ${fname(b.attacker)} smash ${b.standLevel ? 'the stand' : 'the facility'} at ${where}. Book a rebuild before the next nightfall or lose the plot!`;
    case 'robbed': return `Night raid! ${fname(b.attacker)} grab ${money(b.loot)} from the till at ${where}.`;
    case 'damaged': return `${fname(b.attacker)} rattle ${where} but leave empty-handed.`;
    default: return `Raid repelled at ${where}! ${fname(b.attacker)} limp home. They'll keep their distance for a few days.`;
  }
}

// ---------- the morning after ----------

/** Wages, rival rebuilds, First Dibs expiry and the rivals' Guard/Strike spending. */
export function crewAtDawn(s: GameState): void {
  const rng = { seed: s.seed };
  payCrew(s);
  overnightRepairs(s);
  dutyXp(s);
  scoutingAtDawn(s);
  if (s.day >= 6) welcomeDex(s);
  if (s.day === 3) offerSideLot(s);
  refreshRecruits(s);
  plotsAtDawn(s, rng); // First Dibs, rival rebuilds and lapsed plots (damage.ts)
  // Rivals spend their Guard bucket (rivalAi.ts) on repairs and their kit (rivalDefenseSpend).
  for (const id of RIVALS) {
    rivalGuardSpend(s, id, rng);
  }
  tidyPosts(s);
  s.seed = rng.seed;
}

function sabotageHeadline(b: BattleReport): string {
  const where = PLOT_BY_ID[b.target].name;
  if (b.attacker === 'player') {
    switch (b.outcome) {
      case 'robbed': return `SABOTAGE! Lottie's crew spoils the stock at ${where}: it sells nothing on its next day.`;
      case 'damaged': return `Lottie's crew gets into ${where} but runs out of time to spoil the stock.`;
      default: return `Sabotage at ${where} foiled: ${fname(b.defender)} chase Lottie's crew off.`;
    }
  }
  switch (b.outcome) {
    case 'robbed': return `${fname(b.attacker)} spoil the stock at ${where}! It sells nothing on its next day.`;
    case 'damaged': return `${fname(b.attacker)} sneak into ${where} but run out of time: the stock is safe.`;
    default: return `You caught ${fname(b.attacker)} creeping round ${where}: the stock is safe.`;
  }
}

/** Rival plots start with a little protection, by personality. */
export function seedRivalDefenses(s: GameState, rng: Rng): void {
  for (const p of PLOTS) {
    const ps = s.plots[p.id];
    if (!ps.owner || ps.owner === 'player' || !ps.stand) continue;
    const f = FACTIONS[ps.owner as RivalId];
    const fenced = nextRandom(rng);
    if (fenced < f.guard + 0.2) { ps.defense = { tier: 1, fenceHp: PERIMETERS[0].hp, gadgets: [] }; ps.invested += PERIMETERS[0].cost; }
    ps.garrison = Math.min(postsFor(s, p.id), Math.round(f.guard * 2 + nextRandom(rng) * ps.stand.level));
    // The most careful of the fenced ones open with their first gadget too: the same roll, so a new game's dice run as before.
    const first = rivalKit(ps).gadgets[0];
    if (first && fenced < f.guard) { ps.defense.gadgets = [first]; ps.invested += GADGETS[first].cost; } // counts as building investment, like yours
  }
}

/**
 * Day 3: Lottie sells you her side lot next to the Corner for $300, table included. The lot is fixed like the Corner
 * ($300 land, 300 passersby: src/sim/map.ts), so the sale turns $300 of cash into $300 of land. Bought already on
 * Days 1-2 and still empty, it gets her table anyway.
 */
export function offerSideLot(s: GameState): void {
  const ps = s.plots[LOTTIES_SIDE_LOT];
  if (ps.owner === 'player') {
    if (ps.stand || ps.facility) return;
    ps.stand = newStand(1);
    ps.stand.price = priceCeiling(s, LOTTIES_SIDE_LOT);
    ps.invested += STAND_LEVELS[0].cost;
    alert(s, { kind: 'note', text: "Lottie's table goes up on your side lot", plot: LOTTIES_SIDE_LOT });
  } else if (!ps.owner) {
    ps.dibs = { who: 'player', until: s.day + 6, price: SIDE_LOT_PRICE, table: true };
    // A card in the feed (Go There opens the lot), as each day's lesson lands.
    alert(s, { kind: 'note', text: `Side lot by the Corner: ${money(SIDE_LOT_PRICE)}, table included`, plot: LOTTIES_SIDE_LOT });
  } else return;
  s.news.push('Lottie: "Two tables, twice the trouble. You\'ll love it."');
}

/** Dex Moody, the first guard, joins free on Day 6 (when raids can start), whatever your rank. */
export function welcomeDex(s: GameState): void {
  if (s.guards.some((g) => g.name === 'Dex Moody') || s.nextId > 1e6) return;
  const rng = { seed: 77 };
  const dex = makeGuard(s, rng);
  dex.name = 'Dex Moody';
  dex.trait = 'Loyal';
  // With the lessons on, stationing him is Day 6's lesson ("Station Dex for the night"); story.ts posts him at closing if nobody did.
  dex.post = !dexLesson(s) && s.plots[s.selected]?.owner === 'player' ? s.selected : null;
  s.guards.push(dex);
  // A card in the feed (Go There: where he stands, or the Corner to station him). In the campaign his arrival is a
  // scene (src/sim/scenes.ts) that says the rest of his lines.
  alert(s, { kind: 'note', text: hasStory(s) ? 'Dex Moody joins the crew, free.' : 'Dex Moody joins free: "I work for lemonade."', plot: dex.post ?? LOTTIES_CORNER });
  refreshRecruits(s, true);
}

/** For the HUD: the raids on you that you've been warned of (night.ts warns each at its minute). */
export function incomingRaids(s: GameState): Raid[] {
  return s.raids.filter((r) => r.attacker !== 'player' && s.plots[r.target].owner === 'player' && r.warned);
}

export const rankTitle = (rank: number) => RANKS[rank - 1].title;
export const standLevelName = (lvl: number) => STAND_LEVELS[lvl - 1]?.name ?? 'empty lot';
