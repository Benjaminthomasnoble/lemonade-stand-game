// Milestone 3: defenses, guards, raids and Threat (canon sections 10–14).
// Pure functions over GameState, like the economy. Night raids are planned
// when the stands close (so the player always gets a warning) and fought
// when the player sleeps.
import {
  CLUBHOUSE, DAYTIME_RAID_REP, DETECTION_BASE, FACTIONS, GADGET_SLOTS, GADGETS, GEAR, GUARD_BASE, GUARD_LEVEL_TITLES,
  GUARD_FEE, GUARD_WAGE, GUARD_XP_TO_LEVEL, HENCHMEN, HIRE_RANK, NIGHT_STEALTH, NO_RAID_DAYS, PERIMETERS, RAID_PARTY, RAID_RANK,
  RAIDS_PER_WEEK, RANKS, REBUILD_SHARE, RESPECT_DAYS, ROSTER_BASE, SQUAD_CAP, STAND_HP, STAND_LEVELS, TRAITS, WEAPONS,
  type GadgetId, type GearId, type RivalId, type Trait, type WeaponId,
} from './balance.ts';
import { runBattle, winChance, type BattleEvent, type BattleInput, type Fighter, type Objective } from './combat.ts';
import { PLOT_BY_ID, PLOTS, type FactionId, type Plot } from './map.ts';
import { nextRandom, type Rng } from './rng.ts';
import type { Blocker, GameState, PlotState } from './economy.ts';
import { ownedPlots, successScore } from './economy.ts';

export interface Guard {
  id: string;
  name: string;
  trait: Trait;
  level: number; // 1..5
  xp: number;
  weapon: WeaponId;
  gear: GearId;
  post: string | null; // plot id where they stand guard
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
}

export interface BattleReport {
  delivery?: boolean;
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
  events: BattleEvent[];
  duration: number;
  koed: string[];
  fled: string[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const RIVALS = Object.keys(FACTIONS) as RivalId[];
const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

export const NO_DEFENSE = () => ({ tier: 0, fenceHp: 0, gadgets: [] as GadgetId[] });

// ---------- Threat ----------

export function threatLevel(s: GameState): number {
  let t = Math.ceil(s.rank / 2);
  if (s.rank >= 5) {
    const me = successScore(s);
    if (RIVALS.every((r) => !s.rivals[r].alive || successScore(s, r) < me)) t++;
  }
  return Math.min(5, Math.max(1, t));
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
  return Math.ceil(per.repair * (1 - ps.defense.fenceHp / per.hp));
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

export function rebuildCost(ps: PlotState): number {
  return Math.ceil(ps.invested * REBUILD_SHARE);
}

export function rebuildStand(s: GameState, plotId: string): boolean {
  const ps = s.plots[plotId];
  const cost = rebuildCost(ps);
  if (ps.owner !== 'player' || !ps.stand?.wrecked || s.cash < cost || s.phase === 'open') return false;
  s.cash = round2(s.cash - cost);
  s.today.land = round2(s.today.land + cost);
  ps.stand.wrecked = false;
  s.news.push(`Hammers and elbow grease: ${PLOT_BY_ID[plotId].name} is back in business.`);
  return true;
}

// ---------- guards ----------

const FIRST = ['Dex', 'Moxie', 'Tank', 'Lulu', 'Big Sal', 'Pip', 'Rocco', 'Juno', 'Biscuit', 'Marge', 'Ziggy', 'Hank', 'Tess', 'Boomer', 'Nell', 'Gus', 'Kiki', 'Otis', 'Pearl', 'Duke'];
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

export const clubhouseBeds = (s: GameState) => (s.clubhouse ? CLUBHOUSE[s.clubhouse - 1].beds : 0);
export const rosterCap = (s: GameState) => ROSTER_BASE + clubhouseBeds(s);
export const guardWage = (g: Guard) => GUARD_WAGE[g.level - 1];

export function canHire(s: GameState, id: string): Blocker {
  const g = s.recruits.find((r) => r.id === id);
  if (!g) return { ok: false, why: 'Gone' };
  if (s.rank < HIRE_RANK) return { ok: false, why: `Needs Rank ${HIRE_RANK}, ${RANKS[HIRE_RANK - 1].title}` };
  if (s.guards.length >= rosterCap(s)) return { ok: false, why: s.clubhouse ? 'Clubhouse is full' : 'Build a Clubhouse to house more guards' };
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

export function canBuildClubhouse(s: GameState): Blocker {
  const next = CLUBHOUSE[s.clubhouse];
  if (!next) return { ok: false, why: 'Biggest Clubhouse already' };
  const need = [2, 5, 7][s.clubhouse];
  if (s.rank < need) return { ok: false, why: `Needs Rank ${need}` };
  if (s.cash < next.cost) return { ok: false, why: `Needs ${money(next.cost)}` };
  return { ok: true };
}

export function buildClubhouse(s: GameState): boolean {
  if (!canBuildClubhouse(s).ok) return false;
  const next = CLUBHOUSE[s.clubhouse];
  s.cash = round2(s.cash - next.cost);
  s.today.land = round2(s.today.land + next.cost);
  s.clubhouse = next.level;
  s.news.push(`The Clubhouse opens: beds for ${next.beds} guards. Dex no longer sleeps in the shed.`);
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
  if (g.trait === 'Tough Cookie') hp *= 1.2;
  if (g.trait === 'Gentle Giant') { hp *= 1.4; hit *= 0.7; }
  if (g.trait === 'Hothead') { hit *= 1.15; nerve -= 15; }
  if (g.trait === 'Lumberjack') chop *= 1.5;
  if (g.trait === 'Loyal') nerve += 20;
  if (g.trait === 'Night Owl' && night) { hit *= 1.25; chop *= 1.25; }
  return { id: g.id, name: g.name, side, hp, hit, chop, nerve, armor: GEAR[g.gear].armor, weapon: g.weapon };
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
    nerve: GUARD_BASE.nerve - 10, armor: GEAR[h.gear].armor, weapon,
  };
}

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
  const tier = Math.min(5, Math.max(1, Math.ceil((ps.stand?.level ?? 1) / 1.2)));
  return Array.from({ length: ps.garrison ?? 0 }, (_, i) => henchman(s, rival, tier, rng, i, 'def'));
}

function defendersAt(s: GameState, plotId: string, night: boolean, away: Set<string>, rng: Rng): Fighter[] {
  const ps = s.plots[plotId];
  if (ps.owner === 'player') return s.guards.filter((g) => g.post === plotId && guardReady(s, g) && !away.has(g.id)).map((g) => guardFighter(g, 'def', night));
  return garrisonFighters(s, plotId, rng);
}

function battleInput(s: GameState, raid: Raid, attackers: Fighter[], night: boolean, away: Set<string>, rng: Rng): BattleInput {
  const ps = s.plots[raid.target];
  const lvl = ps.stand?.level ?? 0;
  return {
    attackers, defenders: defendersAt(s, raid.target, night, away, rng),
    perimeter: ps.defense.tier, fenceHp: ps.defense.fenceHp, gadgets: ps.defense.gadgets,
    standHp: ps.stand && !ps.stand.wrecked ? STAND_HP[lvl - 1] : 0, objective: raid.objective, detected: raid.detected,
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
    return ps.owner && ps.owner !== 'player' && ps.stand && !ps.stand.wrecked && p.type !== 'hq';
  });
}

export function availableRaiders(s: GameState): Guard[] {
  const busy = new Set(s.raids.flatMap((r) => r.guards ?? []));
  return s.guards.filter((g) => guardReady(s, g) && !busy.has(g.id));
}

export function canRaid(s: GameState, plotId: string, guardIds: string[]): Blocker {
  const ps = s.plots[plotId];
  if (s.rank < RAID_RANK) return { ok: false, why: `Raids unlock at Rank ${RAID_RANK}, ${RANKS[RAID_RANK - 1].title}` };
  if (!ps.owner || ps.owner === 'player' || !ps.stand || ps.stand.wrecked) return { ok: false, why: 'Pick a rival stand' };
  if (PLOT_BY_ID[plotId].type === 'hq') return { ok: false, why: 'HQ assaults come later' };
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
  if (when === 'tonight') {
    raid.eta = '01:00';
    s.raids.push(raid);
    return true;
  }
  // A daytime raid: customers see it.
  s.reputation = Math.max(1, Math.round((s.reputation - (objective === 'smash' ? DAYTIME_RAID_REP.smash : DAYTIME_RAID_REP.raid)) * 100) / 100);
  return fightRaid(s, raid, false);
}

// ---------- rival raids and the night ----------

/** Called when the stands close: rivals decide tonight's raids, and the player gets warned. */
export function planNight(s: GameState): void {
  const rng = { seed: s.seed };
  const threat = threatLevel(s);
  // Rivals scheme against the player.
  const recentlyHit = s.battles.some((b) => b.defender === 'player' && b.day >= s.day - 1);
  if (s.day > NO_RAID_DAYS && !recentlyHit && nextRandom(rng) < RAIDS_PER_WEEK[threat - 1] / 7) {
    const mine = ownedPlots(s, 'player').filter((p) => s.plots[p.id].stand && !s.plots[p.id].stand!.wrecked);
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
      const target = mine.sort((a, b) => score(b) - score(a))[0];
      const party = raidParty(s, rival, threat, rng);
      const detected = nextRandom(rng) < detectionChance(s, target.id, true);
      const objective: Objective = nextRandom(rng) < 0.5 || threat === 1 ? 'shakedown' : 'smash';
      const h = 21 + Math.floor(nextRandom(rng) * 6), m = Math.floor(nextRandom(rng) * 4) * 15;
      s.raids.push({ id: `r${s.nextId++}`, attacker: rival, target: target.id, objective, party, detected, eta: `${String(h % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}` });
    }
  }
  // Rivals also raid each other (about 30% of their raids at Threat 1–3).
  if (threat < 5 && nextRandom(rng) < (threat <= 3 ? 0.3 : 0.15)) {
    const a = RIVALS[Math.floor(nextRandom(rng) * RIVALS.length)];
    const targets = PLOTS.filter((p) => { const o = s.plots[p.id].owner; return o && o !== 'player' && o !== a && s.plots[p.id].stand && !s.plots[p.id].stand!.wrecked && p.type !== 'hq'; });
    const t = targets[Math.floor(nextRandom(rng) * targets.length)];
    if (s.rivals[a].alive && t) s.raids.push({ id: `r${s.nextId++}`, attacker: a, target: t.id, objective: 'smash', party: raidParty(s, a, Math.min(3, threat + 1), rng), detected: true, eta: '02:00' });
  }
  s.seed = rng.seed;
}

/** Fight every planned raid (called as the player sleeps). */
export function resolveNight(s: GameState): void {
  const raids = s.raids;
  s.raids = [];
  for (const r of raids) fightRaid(s, r, true);
}

export function fightRaid(s: GameState, raid: Raid, night: boolean): BattleReport {
  const rng = { seed: s.seed };
  const ps = s.plots[raid.target];
  const defender = ps.owner as FactionId;
  const away = new Set(s.raids.flatMap((r) => r.guards ?? []));
  const attackers = raid.attacker === 'player'
    ? s.guards.filter((g) => raid.guards!.includes(g.id) && guardReady(s, g)).map((g) => guardFighter(g, 'att', night))
    : raid.party!;
  if (raid.attacker === 'player') raid.detected = nextRandom(rng) < detectionChance(s, raid.target, night);
  const input = battleInput(s, raid, attackers, night, away, rng);
  const res = runBattle(input, rng);
  s.seed = rng.seed;
  let loot = 0;

  ps.defense.fenceHp = res.fenceHpLeft;
  if (res.outcome === 'smashed' && ps.stand) {
    ps.stand.wrecked = true;
    if (defender !== 'player') ps.garrison = 0;
  }
  if (res.outcome === 'robbed' && !raid.delivery) {
    loot = defender === 'player'
      ? Math.min(s.cash, Math.max(25, round2((ps.stand?.day.revenue ?? 0) * 0.6)))
      : Math.min(s.rivals[defender as RivalId].cash, 40 * (ps.stand?.level ?? 1) * (ps.stand?.level ?? 1) + 40);
    loot = round2(Math.max(0, loot));
    if (defender === 'player') s.cash = round2(s.cash - loot); else s.rivals[defender as RivalId].cash -= loot;
    if (raid.attacker === 'player') s.cash = round2(s.cash + loot); else s.rivals[raid.attacker as RivalId].cash += loot;
  }
  if (defender !== 'player' && res.koed.length) ps.garrison = Math.max(0, (ps.garrison ?? 0) - res.koed.filter((id) => input.defenders.some((d) => d.id === id)).length);

  // Guards: KOs are out a day (two if a hatchet did it); everyone who fought earns XP.
  const hatchets = (side: Fighter[]) => side.some((f) => f.weapon === 'hatchets');
  for (const f of [...input.attackers, ...input.defenders]) {
    const g = s.guards.find((x) => x.id === f.id);
    if (!g) continue;
    const foes = f.side === 'att' ? input.defenders : input.attackers;
    if (res.koed.includes(g.id)) g.outUntil = s.day + 1 + (hatchets(foes) ? 2 : 1);
    g.xp += (res.winner === f.side ? 2 : 1);
    while (g.level < 5 && g.xp >= GUARD_XP_TO_LEVEL[g.level]) { g.level++; s.news.push(`${g.name} is now a ${guardTitle(g)}!`); }
  }

  // Grudges and respect.
  if (raid.attacker === 'player' && defender !== 'player') {
    const r = s.rivals[defender as RivalId];
    r.grudge = Math.min(100, r.grudge + (res.winner === 'att' ? 20 : 8));
  }
  if (defender === 'player' && raid.attacker !== 'player' && res.winner === 'def') {
    s.rivals[raid.attacker as RivalId].respectUntil = s.day + 1 + RESPECT_DAYS;
  }

  const report: BattleReport = {
    delivery: raid.delivery,
    day: s.day, attacker: raid.attacker, defender, target: raid.target, objective: raid.objective, outcome: res.outcome, loot,
    attackers: input.attackers, defenders: input.defenders, perimeter: input.perimeter, standLevel: ps.stand?.level ?? 0,
    events: res.events, duration: res.duration, koed: res.koed, fled: res.fled,
  };
  if (raid.attacker === 'player' || defender === 'player') {
    s.battles.unshift(report);
    s.battles.length = Math.min(s.battles.length, 6);
    s.news.push(battleHeadline(report));
  }
  return report;
}

const fname = (f: FactionId) => (f === 'player' ? "Lottie's crew" : FACTIONS[f as RivalId].name);

export function battleHeadline(b: BattleReport): string {
  const where = PLOT_BY_ID[b.target].name;
  if (b.delivery) return b.outcome === 'robbed' ? `Delivery raid! ${fname(b.attacker)} overrun ${where} and make off with the cargo.` : `Delivery raid at ${where} beaten off! The cargo gets through.`;
  if (b.attacker === 'player') {
    switch (b.outcome) {
      case 'smashed': return `RAID! Lottie's crew flattens the ${fname(b.defender)} stand at ${where}.`;
      case 'robbed': return `RAID! Lottie's crew shakes down ${where} for ${money(b.loot)}.`;
      case 'damaged': return `Lottie's crew roughs up ${where} but runs out of time.`;
      default: return `Raid on ${where} goes bust: ${fname(b.defender)} sends Lottie's crew packing.`;
    }
  }
  switch (b.outcome) {
    case 'smashed': return `Night raid! ${fname(b.attacker)} smash the stand at ${where}. Rebuild it at Morning Prep.`;
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
  refreshRecruits(s);
  for (const p of PLOTS) {
    const ps = s.plots[p.id];
    if (ps.dibs && ps.dibs.until < s.day) delete ps.dibs;
    if (!ps.owner || ps.owner === 'player') continue;
    const r = s.rivals[ps.owner as RivalId];
    if (ps.stand?.wrecked) {
      const cost = rebuildCost(ps);
      const f = FACTIONS[ps.owner as RivalId];
      if (r.cash > cost + 500 && nextRandom(rng) < f.rebuild) {
        r.cash -= cost;
        ps.stand.wrecked = false;
      } else {
        // Not rebuilt: the plot goes For Sale, and the smasher gets First Dibs.
        s.news.push(`${PLOT_BY_ID[p.id].name} is For Sale after the smash. Lottie has First Dibs today!`);
        s.plots[p.id] = { owner: null, stand: null, invested: 0, landValue: ps.landValue, defense: NO_DEFENSE(), dibs: { who: 'player', until: s.day } };
      }
    }
  }
  // Rivals spend their Guard bucket: fences and henchmen on their best stands.
  for (const id of RIVALS) {
    const r = s.rivals[id];
    if (!r.alive) continue;
    r.grudge = Math.max(0, r.grudge - 1);
    let budget = Math.max(0, r.cash - 1500) * FACTIONS[id].guard * 0.5;
    const plots = ownedPlots(s, id).filter((p) => s.plots[p.id].stand).sort((a, b) => s.plots[b.id].invested - s.plots[a.id].invested);
    for (const p of plots.slice(0, 3)) {
      const ps = s.plots[p.id];
      const next = PERIMETERS[ps.defense.tier];
      if (next && next.tier <= Math.ceil(ps.stand!.level / 1.5) + 1 && next.cost < budget) {
        budget -= next.cost; r.cash -= next.cost;
        ps.defense = { ...ps.defense, tier: next.tier, fenceHp: next.hp };
      } else if ((ps.garrison ?? 0) < ps.stand!.level + 1 && budget > 300) {
        budget -= 300; r.cash -= 300;
        ps.garrison = (ps.garrison ?? 0) + 1;
      } else if (ps.defense.tier) {
        ps.defense.fenceHp = PERIMETERS[ps.defense.tier - 1].hp;
      }
    }
    r.attention = threatLevel(s) + (r.grudge > 30 ? 1 : 0);
  }
  s.seed = rng.seed;
}

/** Rival plots start with a little protection, by personality. */
export function seedRivalDefenses(s: GameState, rng: Rng): void {
  for (const p of PLOTS) {
    const ps = s.plots[p.id];
    if (!ps.owner || ps.owner === 'player' || !ps.stand) continue;
    const f = FACTIONS[ps.owner as RivalId];
    if (nextRandom(rng) < f.guard + 0.2) ps.defense = { tier: 1, fenceHp: PERIMETERS[0].hp, gadgets: [] };
    ps.garrison = Math.round(f.guard * 2 + nextRandom(rng) * ps.stand.level);
  }
}

/** Dex Moody, the first guard, turns up on Day 6 (when raids can start). */
export function welcomeDex(s: GameState): void {
  if ( s.guards.some((g) => g.name === 'Dex Moody') || s.nextId > 1e6) return;
  const rng = { seed: 77 };
  const dex = makeGuard(s, rng);
  dex.name = 'Dex Moody';
  dex.trait = 'Loyal';
  dex.post = s.plots[s.selected]?.owner === 'player' ? s.selected : null;
  s.guards.push(dex);
  s.news.push('Dex Moody: "Heard you could use some muscle, Miss Lottie. I work for lemonade." Dex joins free.');
  refreshRecruits(s, true);
}

/** For the HUD: what tonight looks like. */
export function incomingRaids(s: GameState): Raid[] {
  return s.raids.filter((r) => r.attacker !== 'player' && s.plots[r.target].owner === 'player');
}

export const rankTitle = (rank: number) => RANKS[rank - 1].title;
export const standLevelName = (lvl: number) => STAND_LEVELS[lvl - 1]?.name ?? 'empty lot';
