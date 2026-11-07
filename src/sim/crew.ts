// Milestone 3: defenses, guards, raids and Threat (canon sections 10–14).
// Pure functions over GameState, like the economy. Night raids are planned
// when the stands close and fought on the night's clock (night.ts), each at
// its arrival minute, after a warning.
import {
  CLUBHOUSE, COMBAT, DETECTION_BASE, FACTIONS, GADGET_SLOTS, GADGETS, GEAR, GUARD_BASE, GUARD_LEVEL_TITLES,
  GUARD_FEE, GUARD_WAGE, GUARD_XP_TO_LEVEL, HENCHMEN, HIRE_RANK, NIGHT_STEALTH, NO_RAID_DAYS, PERIMETERS, RAID_PARTY, RAID_RANK,
  RAID_LEAVE, RAIDS_PER_WEEK, RANKS, REBUILD_SHARE, REPAIR_SHARE, RIVAL_RAID_AT, ROSTER_BASE, BUSTED_REPAIR_SHARE, SQUAD_CAP, STAND_HP, STAND_LEVELS, TRAITS, WEAPONS,
  type GadgetId, type GearId, type RivalId, type Trait, type WeaponId,
} from './balance.ts';
import { runBattle, winChance, type BattleEvent, type BattleInput, type BattleResult, type Fighter, type Objective } from './combat.ts';
import { LOTTIES_CORNER, PLOT_BY_ID, PLOTS, type FactionId, type Plot } from './map.ts';
import { nextRandom, type Rng } from './rng.ts';
import type { Blocker, GameState, PlotState } from './economy.ts';
import { ownedPlots } from './economy.ts';
import { buildFacility, canBuildFacility, FACILITIES } from './vip.ts';
import { buildingInvested, currentHp, dollarsUp, hpLostNote, raidDamage, restoreHp } from './damage.ts';
import { allBeds, awayOnRaid, clubhouses, clubhouseSite } from './clubhouse.ts';
import { withBell } from './reinforce.ts';
import { shakedownLoot } from './loot.ts';
import { breakTruce } from './rivals.ts';
import { bump, difficulty, peaceful } from './modes.ts';
import { etaMinute, hhmm, onTheRoad, raidStart, sendRaid, travelMinutes } from './night.ts';
import { rivalGuardSpend, signatureRaids } from './rivalAi.ts';
import { dexLesson, hasStory } from './story.ts';
import { alert } from './alerts.ts';
import { bugleFight } from './media.ts';

export interface Guard {
  id: string;
  name: string;
  trait: Trait;
  level: number; // 1..5
  xp: number;
  weapon: WeaponId;
  gear: GearId;
  post: string | null; // plot id where they stand guard
  club?: string; // off post, they wait at this Clubhouse (clubhouse.ts clubOf); unset: your first one
  outUntil: number; // knocked out: back on this day
  fee: number; // hire fee (recruits)
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
}

export interface BattleReport {
  delivery?: boolean;
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
export const SIDE_LOT_PRICE = 300;
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
  return true;
}

/** Patch a chopped fence back to full for 25% of its price, scaled by damage. */
export function fenceRepairCost(ps: PlotState): number {
  const per = PERIMETERS[ps.defense.tier - 1];
  if (!per || ps.defense.fenceHp >= per.hp) return 0;
  return Math.ceil(per.cost * REPAIR_SHARE * (1 - ps.defense.fenceHp / per.hp));
}

export function repairFence(s: GameState, plotId: string): boolean {
  const ps = s.plots[plotId];
  const cost = fenceRepairCost(ps);
  if (ps.owner !== 'player' || !cost || s.cash < cost) return false;
  s.cash = round2(s.cash - cost);
  s.today.land = round2(s.today.land + cost);
  ps.defense.fenceHp = PERIMETERS[ps.defense.tier - 1].hp;
  return true;
}

export function canBuyGadget(s: GameState, plotId: string, g: GadgetId): Blocker {
  const ps = s.plots[plotId];
  const gd = GADGETS[g];
  if (ps.owner !== 'player') return { ok: false, why: 'Not your plot' };
  if (ps.defense.gadgets.includes(g)) return { ok: false, why: 'Installed' };
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

export function rebuildStand(s: GameState, plotId: string): boolean {
  const ps = s.plots[plotId];
  const cost = rebuildCost(ps);
  if (ps.owner !== 'player' || !isWrecked(ps) || s.cash < cost || s.phase === 'open') return false;
  s.cash = round2(s.cash - cost);
  s.today.land = round2(s.today.land + cost);
  if (ps.stand) ps.stand.wrecked = false;
  if (ps.facility) ps.facility.wrecked = false;
  restoreHp(s, plotId); // back up at full HP
  delete ps.wreckedDay;
  delete ps.busted;
  s.news.push(`Hammers and elbow grease: ${PLOT_BY_ID[plotId].name} is back in business.`);
  return true;
}

// ---------- guards ----------

// (no 'Dex': only the story's Dex Moody is drawn as lanky Dex)
const FIRST = ['Dash', 'Moxie', 'Tank', 'Lulu', 'Big Sal', 'Pip', 'Rocco', 'Juno', 'Biscuit', 'Marge', 'Ziggy', 'Hank', 'Tess', 'Boomer', 'Nell', 'Gus', 'Kiki', 'Otis', 'Pearl', 'Duke'];
const LAST = ['Moody', 'Malone', 'Pickles', 'Brickman', 'Quill', 'Sorrel', 'Kettle', 'Bramble', 'Gristle', 'Lark', 'Hobbs', 'Puddle'];

function makeGuard(s: GameState, rng: Rng, level = 1): Guard {
  const name = `${FIRST[Math.floor(nextRandom(rng) * FIRST.length)]} ${LAST[Math.floor(nextRandom(rng) * LAST.length)]}`;
  const trait = TRAITS[Math.floor(nextRandom(rng) * TRAITS.length)];
  return { id: `g${s.nextId++}`, name, trait, level, xp: GUARD_XP_TO_LEVEL[level - 1], weapon: 'fists', gear: 'none', post: null, outUntil: 0, fee: GUARD_FEE[level - 1] };
}

/** The Hiring Hall's pool refreshes every week (and the first time you reach Rank 2). */
export function refreshRecruits(s: GameState, force = false): void {
  if (s.rank < HIRE_RANK) return;
  if (!force && s.recruits.length && s.day % 7 !== 1) return;
  const rng = { seed: s.seed };
  const n = 4;
  s.recruits = Array.from({ length: n }, () => makeGuard(s, rng, nextRandom(rng) < 0.25 ? 2 : 1));
  s.seed = rng.seed;
}

/** Beds in every Clubhouse you have standing (they add up). */
export const clubhouseBeds = (s: GameState) => allBeds(s);
export const rosterCap = (s: GameState) => ROSTER_BASE + clubhouseBeds(s);
export const guardWage = (g: Guard) => GUARD_WAGE[g.level - 1];

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
  g.post = s.selected;
  s.guards.push(g);
  s.news.push(`${g.name} (${g.trait}) joins the crew and stands guard at ${PLOT_BY_ID[g.post].name}.`);
  return true;
}

export function fireGuard(s: GameState, id: string): void {
  s.guards = s.guards.filter((g) => g.id !== id);
}

export function postGuard(s: GameState, id: string, plotId: string | null): void {
  const g = s.guards.find((x) => x.id === id);
  if (g && (plotId === null || s.plots[plotId].owner === 'player')) g.post = plotId;
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
export const guardReady = (s: GameState, g: Guard) => g.outUntil <= s.day;

export function guardFighter(g: Guard, side: 'att' | 'def', night: boolean): Fighter {
  const m = 1 + 0.1 * (g.level - 1);
  let hp = (GUARD_BASE.hp + GEAR[g.gear].hp) * m;
  let hit = WEAPONS[g.weapon].hit * m;
  let chop = WEAPONS[g.weapon].chop * m;
  let nerve = GUARD_BASE.nerve;
  let speed = COMBAT.speed;
  if (g.trait === 'Tough Cookie') hp *= 1.2;
  if (g.trait === 'Gentle Giant') { hp *= 1.4; hit *= 0.7; }
  if (g.trait === 'Hothead') { hit *= 1.15; nerve -= 20; }
  if (g.trait === 'Lumberjack') chop *= 1.5;
  if (g.trait === 'Sprinter') speed *= COMBAT.sprinter;
  if (g.trait === 'Night Owl' && night) { hit *= 1.25; chop *= 1.25; }
  return { id: g.id, name: g.name, side, hp, hit, chop, nerve, armor: GEAR[g.gear].armor, weapon: g.weapon, speed, trait: g.trait, gear: g.gear, level: g.level };
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

/** A rival plot's defenders: its garrison, at the strength their Threat tier would field. */
function garrisonFighters(s: GameState, plotId: string, rng: Rng): Fighter[] {
  const ps = s.plots[plotId];
  const rival = ps.owner as RivalId;
  const tier = Math.min(5, Math.max(1, Math.ceil((ps.stand?.level ?? (ps.facility ? ps.facility.level + 2 : 1)) / 1.2)));
  return Array.from({ length: ps.garrison ?? 0 }, (_, i) => henchman(s, rival, tier, rng, i, 'def'));
}

function defendersAt(s: GameState, plotId: string, night: boolean, away: Set<string>, rng: Rng): Fighter[] {
  const ps = s.plots[plotId];
  if (ps.owner === 'player') return s.guards.filter((g) => g.post === plotId && guardReady(s, g) && !away.has(g.id)).map((g) => guardFighter(g, 'def', night));
  return garrisonFighters(s, plotId, rng);
}

function battleInput(s: GameState, raid: Raid, attackers: Fighter[], night: boolean, away: Set<string>, rng: Rng): BattleInput {
  const ps = s.plots[raid.target];
  return {
    attackers, defenders: defendersAt(s, raid.target, night, away, rng),
    perimeter: ps.defense.tier, fenceHp: ps.defense.fenceHp, gadgets: ps.defense.gadgets,
    standHp: currentHp(ps), objective: raid.objective, detected: raid.detected,
  };
}

export function detectionChance(s: GameState, plotId: string, night: boolean): number {
  const ps = s.plots[plotId];
  let d = DETECTION_BASE + ps.defense.gadgets.reduce((a, g) => a + GADGETS[g].detection, 0);
  if (s.guards.some((g) => g.post === plotId && g.trait === 'Eagle Eye')) d += 0.1;
  if (night && !ps.defense.gadgets.includes('floodlights')) d -= NIGHT_STEALTH;
  return Math.max(0.05, Math.min(0.95, d));
}

// ---------- player raids ----------

export function raidTargets(s: GameState): Plot[] {
  return PLOTS.filter((p) => {
    const ps = s.plots[p.id];
    return ps.owner && ps.owner !== 'player' && hasBuilding(ps) && p.type !== 'hq';
  });
}

export function availableRaiders(s: GameState): Guard[] {
  const busy = awayOnRaid(s); // planned, out, walking home, or in the fight playing live
  return s.guards.filter((g) => guardReady(s, g) && !busy.has(g.id));
}

export function canRaid(s: GameState, plotId: string, guardIds: string[]): Blocker {
  const ps = s.plots[plotId];
  if (peaceful(s)) return { ok: false, why: 'Peaceful: no raids in this Sandbox' };
  if (s.rank < RAID_RANK) return { ok: false, why: `Raids unlock at Rank ${RAID_RANK}, ${RANKS[RAID_RANK - 1].title}` };
  if (PLOT_BY_ID[plotId].type === 'hq') return { ok: false, why: 'Storm an HQ from the Rivals board' };
  if (!ps.owner || ps.owner === 'player' || !hasBuilding(ps)) return { ok: false, why: 'Pick a rival stand or facility' };
  if (!guardIds.length) return { ok: false, why: 'Pick at least one guard' };
  if (guardIds.length > SQUAD_CAP(s.rank)) return { ok: false, why: `Squad cap is ${SQUAD_CAP(s.rank)}` };
  if (s.raids.some((r) => r.attacker === 'player' && r.target === plotId)) return { ok: false, why: 'Already planned' };
  return { ok: true };
}

/** Estimated win chance for the Raid Planner (night or now). */
export function raidOdds(s: GameState, plotId: string, guardIds: string[], objective: Objective, night: boolean): number {
  if (!guardIds.length) return 0;
  const rng = { seed: s.seed ^ 0x0dd5 };
  const squad = s.guards.filter((g) => guardIds.includes(g.id)).map((g) => guardFighter(g, 'att', night));
  const raid: Raid = { id: 'odds', attacker: 'player', target: plotId, objective, detected: false, eta: '' };
  const input = battleInput(s, raid, squad, night, new Set(), rng);
  input.detected = nextRandom(rng) < 0.5; // unknown: call it a coin flip
  return winChance(input, rng.seed, 80);
}

export function planRaid(s: GameState, plotId: string, guardIds: string[], objective: Objective, when: 'now' | 'tonight'): BattleReport | boolean {
  if (!canRaid(s, plotId, guardIds).ok) return false;
  const raid: Raid = { id: `r${s.nextId++}`, attacker: 'player', target: plotId, objective, guards: guardIds, detected: false, eta: '' };
  breakTruce(s, s.plots[plotId].owner as RivalId);
  return sendRaid(s, raid, when); // nights: the squad travels; a raid fought in business hours costs Reputation then
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
      }
      const objective: Objective = nextRandom(rng) < 0.5 || threat === 1 ? 'shakedown' : 'smash';
      const leave = RAID_LEAVE.first + Math.floor(nextRandom(rng) * RAID_LEAVE.steps) * 15;
      const at = leave + travelMinutes(s, raidStart(s, rival, target.id), target.id);
      s.raids.push({ id: `r${s.nextId++}`, attacker: rival, target: target.id, objective, party, detected, eta: hhmm(at), leave, at });
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
    ? s.guards.filter((g) => raid.guards!.includes(g.id) && guardReady(s, g)).map((g) => guardFighter(g, 'att', night))
    : raid.party!;
  if (raid.attacker === 'player') raid.detected = nextRandom(rng) < detectionChance(s, raid.target, night);
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

  ps.defense.fenceHp = res.fenceHpLeft;
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
  if (res.outcome === 'robbed' && !raid.delivery) {
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
      : `Night raid! ${fname(b.attacker)} smash ${b.standLevel ? 'the stand' : 'the facility'} at ${where}. Rebuild it at Morning Prep or lose the plot!`;
    case 'robbed': return `Night raid! ${fname(b.attacker)} grab ${money(b.loot)} from the till at ${where}.`;
    case 'damaged': return `${fname(b.attacker)} rattle ${where} but leave empty-handed.`;
    default: return `Raid repelled at ${where}! ${fname(b.attacker)} limp home. They'll keep their distance for a few days.`;
  }
}

// ---------- the morning after ----------

/** Wages, rival rebuilds, First Dibs expiry and the rivals' Guard/Strike spending. */
export function crewAtDawn(s: GameState): void {
  const rng = { seed: s.seed };
  const wages = s.guards.reduce((a, g) => a + guardWage(g), 0);
  if (wages) {
    s.cash = round2(s.cash - wages);
    s.today.upkeep = round2(s.today.upkeep + wages);
  }
  if (s.cash < 0 && s.guards.length) {
    const quitter = s.guards.find((g) => g.trait !== 'Loyal') ?? s.guards[0];
    fireGuard(s, quitter.id);
    s.news.push(`${quitter.name} quits: "No pay, no play."`);
  }
  if (s.day >= 6) welcomeDex(s);
  if (s.day === 3) offerSideLot(s);
  refreshRecruits(s);
  for (const p of PLOTS) {
    const ps = s.plots[p.id];
    if (ps.dibs && ps.dibs.until < s.day) delete ps.dibs;
    if (!ps.owner || !isWrecked(ps)) continue;
    const smasher = ps.smashedBy ?? 'player';
    const forSale = () => {
      s.plots[p.id] = { owner: null, stand: null, invested: 0, landValue: ps.landValue, defense: NO_DEFENSE(), dibs: { who: smasher, until: s.day } };
      if (smasher === 'player') { s.news.push(`${PLOT_BY_ID[p.id].name} is For Sale after the smash. Lottie has First Dibs today!`); return; }
      // A rival with First Dibs buys straight away if they can.
      const r = s.rivals[smasher as RivalId];
      if (r?.alive && r.cash > ps.landValue) {
        r.cash -= ps.landValue;
        s.plots[p.id] = { owner: smasher, stand: null, invested: 0, landValue: ps.landValue, defense: NO_DEFENSE() };
        if (ps.owner === 'player') s.news.push(`${FACTIONS[smasher as RivalId].name} snap up ${PLOT_BY_ID[p.id].name} after Lottie couldn't rebuild.`);
      } else {
        delete s.plots[p.id].dibs;
        if (ps.owner === 'player') s.news.push(`${PLOT_BY_ID[p.id].name} lapses and goes For Sale.`);
      }
    };
    if (ps.owner === 'player') {
      if (!ps.busted && s.day > (ps.wreckedDay ?? s.day) + PLAYER_REBUILD_DAYS) forSale(); // Busted stands wait for their repair
      continue;
    }
    const r = s.rivals[ps.owner as RivalId];
    const cost = rebuildCost(ps);
    if (r.cash > cost + 500 && nextRandom(rng) < rebuildChance(s, p.id)) {
      r.cash -= cost;
      if (ps.stand) ps.stand.wrecked = false;
      if (ps.facility) ps.facility.wrecked = false;
      delete ps.wreckedDay;
    } else forSale();
  }
  // Rivals spend their Guard bucket: fences and henchmen on their best stands.
  for (const id of RIVALS) {
    rivalGuardSpend(s, id, rng);
  }
  s.seed = rng.seed;
}

/** Rival plots start with a little protection, by personality. */
export function seedRivalDefenses(s: GameState, rng: Rng): void {
  for (const p of PLOTS) {
    const ps = s.plots[p.id];
    if (!ps.owner || ps.owner === 'player' || !ps.stand) continue;
    const f = FACTIONS[ps.owner as RivalId];
    if (nextRandom(rng) < f.guard + 0.2) { ps.defense = { tier: 1, fenceHp: PERIMETERS[0].hp, gadgets: [] }; ps.invested += PERIMETERS[0].cost; }
    ps.garrison = Math.round(f.guard * 2 + nextRandom(rng) * ps.stand.level);
  }
}

/** Day 3: Lottie sells you the side lot by the Corner for $300, table included. */
export function offerSideLot(s: GameState): void {
  const home = PLOT_BY_ID[LOTTIES_CORNER];
  const lot = PLOTS.filter((p) => p.district === home.district && p.type === 'street' && !s.plots[p.id].owner)
    .sort((a, b) => Math.hypot(a.x - home.x, a.z - home.z) - Math.hypot(b.x - home.x, b.z - home.z))[0];
  if (!lot) return;
  s.plots[lot.id].dibs = { who: 'player', until: s.day + 6, price: SIDE_LOT_PRICE, table: true };
  // A card in the feed (Go There opens the lot), as each day's lesson lands.
  alert(s, { kind: 'note', text: `Side lot by the Corner: ${money(SIDE_LOT_PRICE)}, table included`, plot: lot.id });
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
