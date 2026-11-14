// The auto-battle (canon section 12; spec "How a fight resolves"): breach,
// brawl, objective. Pure and seeded: the same inputs always give the same
// fight, and the timeline it returns, positions included, is what the 3D
// replay plays back.
//
// The clock starts at contact, when the raiders reach the fence (or the
// defenders, or the stand) together, in their line-up's order, and one
// fight-second is one game minute. Every swing lands for exactly its Hit or
// Chop times the listed multipliers, the first at t = 0 and then one every
// 1.5 s, and everyone swings at the nearest enemy. Speed sets how fast each
// fighter covers the ground inside the fight: closing on the guards after the
// breach, the walk to the stand and the run home (Sprinters get there first).
// Barbed Wire tangles every raider who crosses its band at 70% of their Speed,
// cut or not. The dice are the Nerve and Butterfingers rolls; detection and
// the raiding party are rolled before the fight.
//
// Positions are in plot-lengths on the plot's own frame: x runs across the
// plot, z out from the stand's front (z = 0) toward the street.
//
// A fight is steppable (createFight): it runs a quarter-second tick at a time
// and takes commands at given times (Rally, Fall Back, fighters joining), so a
// live fight can be paused, steered and re-run from (input, seed, commands).
// runBattle is the same fight run straight to the end, for odds and tests.
// An HQ Boss Room adds the boss's move, which goes off mid-fight (bossMoves).
import {
  COMBAT, FENCE_DEFENDER_BONUS, FIGHT_BUTTONS, FIGHT_SECONDS_PER_GAME_MINUTE, GUARD_BASE, PERIMETERS, WEAPONS,
  type GadgetId, type GearId, type Trait, type WeaponId,
} from './balance.ts';
import { nextRandom, type Rng } from './rng.ts';
import type { GameState } from './economy.ts';
import { migrateClubhouse } from './clubhouse.ts';
import { migrateCaptives } from './captives.ts';

export type Side = 'att' | 'def';
export type Objective = 'smash' | 'shakedown';

export interface Fighter {
  id: string;
  name: string;
  side: Side;
  hp: number;
  hit: number;
  chop: number;
  nerve: number;
  armor: number; // share of damage ignored
  weapon: WeaponId;
  speed?: number; // plot-lengths a second (COMBAT.speed when unset; Sprinters +25%)
  trait?: Trait; // Butterfingers and Goose Whisperer act inside the fight
  gear?: GearId; // what they wear (for the replay: vests, Pro Gear)
  level?: number; // 1 Rookie .. 5 Legend (for the replay's sleeve chevrons)
  boss?: boolean; // a rival's boss (threat.ts raidBoss, rivals.ts boss()): a named character, never Nabbed
}

export interface BattleInput {
  attackers: Fighter[];
  defenders: Fighter[];
  perimeter: number; // 0..5
  fenceHp: number;
  gadgets: GadgetId[];
  standHp: number; // 0 when the plot has no stand
  objective: Objective;
  detected: boolean;
  /** Attackers the Guard Goose stuns (at most 2). Unset: 1, or 2 with a Goose Whisperer among the defenders. */
  gooseStuns?: number;
  /** Fighters who reach the plot mid-fight (Ring the Bell's reserves): they join at fight-second t. */
  joins?: { t: number; fighters: Fighter[] }[];
  /** The HQ Boss Room: the boss's move, made mid-fight. */
  bossMoves?: BossMove[];
}

/**
 * A boss's move in the HQ Boss Room (spec "HQ assault"). It goes off at fight-second t if the boss (`by`) is still
 * standing, and picks on the raiders nearest them. Blender Rush knocks `count` raiders flat for `stun` s; Espresso
 * Shot makes the boss's crew `boost` faster (swings and steps) for `seconds`; Hay Bale Wall drops a bale of `hp` HP
 * in front of `count` raiders, who must chop through it while the crew swings over it; Hostile Takeover turns
 * `count` raiders who aren't Loyal; Old Money calls in `fighters` (Stewards), and the cane knocks one raider's
 * weapon out of their hands (fists from there on).
 */
export type BossMove =
  | { t: number; by: string; type: 'rush'; count: number; stun: number }
  | { t: number; by: string; type: 'espresso'; seconds: number; boost: number }
  | { t: number; by: string; type: 'bales'; count: number; hp: number }
  | { t: number; by: string; type: 'takeover'; count: number }
  | { t: number; by: string; type: 'call'; fighters: Fighter[] }
  | { t: number; by: string; type: 'cane' };

/** What the player can do to a running fight, stamped with the fight-second it acts on. */
export type FightCommand =
  | { t: number; type: 'rally'; side: Side } // +20 Nerve for 10 s (FIGHT_BUTTONS.rally)
  | { t: number; type: 'fallBack'; side: Side } // everyone standing retreats, carrying the KO'd: the fight is lost
  | { t: number; type: 'join'; fighters: Fighter[] }; // they've arrived: into the fight they go

export type BattleEvent =
  | { t: number; type: 'at'; a: string; x: number; z: number } // where each fighter is at contact
  | { t: number; type: 'move'; a: string; x: number; z: number; speed: number } // from t, walks toward (x, z)
  | { t: number; type: 'swing'; a: string; b: string; dmg: number }
  | { t: number; type: 'chop'; a: string; target: 'fence' | 'stand' | 'bale'; dmg: number } // 'bale': the hay bale in front of a
  | { t: number; type: 'ko'; a: string; by?: string; weapon?: WeaponId | 'fence' } // who landed the knockout blow ('fence': stakes or wire)
  | { t: number; type: 'flee'; a: string }
  | { t: number; type: 'stun'; a: string; by: 'goose' | 'slick' | 'rush' } // 'rush': Brock's charge knocks them flat
  | { t: number; type: 'drop'; a: string } // Butterfingers (or Vera's cane): the weapon goes flying; fists from here on
  | { t: number; type: 'boss'; a: string; move: BossMove['type'] } // the boss makes their move (its effects follow)
  | { t: number; type: 'bale'; a: string; hp: number } // a hay bale of hp HP stands in front of raider a (0: chopped through)
  | { t: number; type: 'turn'; a: string; side: Side } // Hostile Takeover: a now fights for that side
  | { t: number; type: 'breach' }
  | { t: number; type: 'grab' }
  | { t: number; type: 'rally'; side: Side } // Rally: that side's Nerve is up for 10 s
  | { t: number; type: 'fallBack'; side: Side }; // Fall Back: that side leaves the field

export interface BattleResult {
  winner: Side;
  outcome: 'smashed' | 'robbed' | 'damaged' | 'repelled';
  fenceHpLeft: number;
  standHpLeft: number;
  koed: string[]; // fighter ids knocked out
  fled: string[];
  hatchetKos: string[]; // knocked out by a hatchet blow: Out 2 days instead of 1
  hpLeft: Record<string, number>; // each fighter's HP at the end, by id (0 when knocked out): an HQ squad carries it on
  duration: number; // fight-seconds (game minutes)
  events: BattleEvent[];
  fellBack?: Side; // that side retreated, carrying its KO'd (nobody of theirs left behind)
}

/** A running fight, for the HUD: who's standing and what the buttons can do. */
export interface FightStatus {
  t: number; // fight-seconds played
  done: boolean;
  up: Record<Side, number>; // fighters still standing (arrived or walking in)
  of: Record<Side, number>; // everyone on each side so far (a late arrival counts once it's in)
  nerveAt: Record<Side, number | null>; // its one Nerve roll comes when this few stand; null once rolled (or a side of one)
  rallyUntil: Record<Side, number>; // a Rally lifts Nerve until this fight-second
  fellBack?: Side;
}

/** A fight that runs a tick at a time. */
export interface Fight {
  readonly events: BattleEvent[];
  /** Fight-seconds played: the time of the next tick, or the duration once it's over. */
  time(): number;
  done(): boolean;
  /** Run every tick that starts at or before fight-second `until` (Infinity: to the end). */
  advance(until: number): void;
  /** Queue a command: it acts at the start of the first tick at or after its time. */
  command(c: FightCommand): void;
  status(): FightStatus;
  /** The outcome so far (final once done). */
  result(): BattleResult;
}

const STEP = 0.25;
const EPS = 1e-9;

interface Live {
  f: Fighter;
  side: Side;
  rank: number; // tie-break for "nearest": arrival order, then line-up
  hp: number;
  hit: number;
  chop: number;
  weapon: WeaponId;
  speed: number;
  x: number;
  z: number;
  arrive: number; // attackers: when they reach the line (0 at contact; late arrivals later)
  here: boolean;
  pace: number; // the speed their current leg was announced at (the wire changes it mid-leg)
  cd: number; // seconds until the next swing
  stun: number;
  out: boolean;
  ran: boolean;
  dropOn: number; // Butterfingers: the weapon slips on this swing (0: it never does)
  bale: number; // HP of the hay bale in front of them (Hay Bale Wall): they chop it before anything else
  swings: number;
  goal: string; // what they're walking toward, so each new leg is announced once
}

type Hit = { to: Live | 'fence' | 'stand' | 'bale'; dmg: number; by: Live | null };

/** Shoulder-to-shoulder spots along a line: the middle first, then out to either side. */
const slotX = (k: number) => (k % 2 ? -1 : 1) * Math.ceil(k / 2) * COMBAT.spacing;
const round1 = (n: number) => Math.round(n * 10) / 10;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** The whole fight at once: the same steps as a live fight, run to the end. */
export function runBattle(input: BattleInput, rng: Rng, commands: FightCommand[] = []): BattleResult {
  const fight = createFight(input, rng);
  for (const c of commands) fight.command(c);
  fight.advance(Infinity);
  return fight.result();
}

/**
 * A fight that runs one tick at a time. Its dice come from `rng` as it goes, so
 * the same input, seed and commands always give the same fight.
 */
export function createFight(input: BattleInput, rng: Rng): Fight {
  const C = COMBAT;
  const per = input.perimeter > 0 ? PERIMETERS[input.perimeter - 1] : undefined;
  let fence = per ? Math.max(0, input.fenceHp) : 0;
  let breached = fence <= 0;
  let stand = input.standHp;
  const events: BattleEvent[] = [];
  const has = (g: GadgetId) => input.gadgets.includes(g);
  const soaked = has('sprinkler') ? 1 - C.soak : 1;
  // The fence-line bonus: +25% while any perimeter stands, and a Citrus Fortress Wall adds its own +25%.
  const fenceLine = FENCE_DEFENDER_BONUS * (input.perimeter === 5 ? 2 : 1);
  const grabFor = C.grabMinutes * FIGHT_SECONDS_PER_GAME_MINUTE;
  const timer = C.objectiveMinutes * FIGHT_SECONDS_PER_GAME_MINUTE;
  const giveUp = C.giveUpSeconds;
  const gap = C.reach / 4; // each side's half of the space across a fence or a scuffle
  const wireSlow = per?.slow ?? 0; // Barbed Wire: raiders cross its band 30% slower, standing or cut

  // ---- the line-up ----
  // The raiders reach the line together, in their party's order: the first of them takes the middle.
  const fencedAtStart = !breached;
  const lineA = fencedAtStart ? C.fenceAt + gap : input.defenders.length ? C.holdAt + 2 * gap : gap;
  const lineD = fencedAtStart ? C.fenceAt - gap : C.holdAt;
  const speedOf = (f: Fighter) => f.speed ?? C.speed;
  const mk = (f: Fighter, rank: number): Live => ({
    f, side: f.side, rank, hp: f.hp, hit: f.hit, chop: f.chop, weapon: f.weapon, speed: speedOf(f),
    x: 0, z: 0, arrive: 0, here: f.side === 'def', pace: 0, cd: 0, stun: 0, out: false, ran: false, dropOn: 0, bale: 0, swings: 0, goal: '',
  });
  const att = input.attackers.map((f, k) => { const u = mk(f, k); u.x = slotX(k); u.z = lineA; return u; });
  const def = input.defenders.map((f, k) => { const u = mk(f, k); u.x = slotX(k); u.z = lineD; return u; });
  for (const u of [...att, ...def]) events.push({ t: 0, type: 'at', a: u.f.id, x: round3(u.x), z: round3(u.z) });

  // Butterfingers: once a fight, a 10% chance the weapon slips on one of the first three swings.
  const butterfingers = (u: Live) => {
    if (u.f.trait !== 'Butterfingers' || u.weapon === 'fists') return;
    if (nextRandom(rng) < C.butterfingers) u.dropOn = 1 + Math.floor(nextRandom(rng) * 3);
  };
  for (const u of [...att, ...def]) butterfingers(u);

  // The goose honks at the first raider to arrive (twice with a Goose Whisperer); the peels trip the first three.
  const whisperer = input.defenders.some((d) => d.trait === 'Goose Whisperer');
  let honks = has('goose') ? Math.min(2, input.gooseStuns ?? (whisperer ? 2 : 1)) : 0;
  let slips = has('slick') ? C.slick.count : 0;

  const up = (u: Live) => !u.out && !u.ran;
  const isUp = (xs: Live[]) => xs.some(up);
  const dist = (a: { x: number; z: number }, x: number, z: number) => Math.hypot(a.x - x, a.z - z);
  const nearest = (u: Live, foes: Live[]) => {
    let best: Live | null = null, bd = Infinity;
    for (const v of foes) {
      const d = dist(u, v.x, v.z);
      if (d < bd - EPS || (Math.abs(d - bd) <= EPS && best && v.rank < best.rank)) { best = v; bd = d; }
    }
    return best;
  };
  const inReach = (u: Live, x: number, z: number) => dist(u, x, z) <= C.reach + EPS;
  // Espresso Shot: a side swings and steps faster until a given fight-second.
  const haste: Record<Side, { until: number; mult: number }> = { att: { until: -1, mult: 1 }, def: { until: -1, mult: 1 } };
  const quick = (u: Live, t: number) => (t < haste[u.side].until - EPS ? haste[u.side].mult : 1);
  /** How fast they cover ground right now: a raider inside Barbed Wire's band goes at 70%. */
  const paceOf = (u: Live, t: number) =>
    (u.side === 'att' && wireSlow && Math.abs(u.z - C.fenceAt) < C.wireBand - EPS ? u.speed * (1 - wireSlow) : u.speed) * quick(u, t);
  /**
   * Close in on (x, z) until it's within reach, announcing each new leg (and each change of pace) once; true when
   * within reach. Behind a standing fence a defender can only move along it (z stays put).
   */
  const closeIn = (u: Live, goal: string, x: number, z: number, t: number, alongFence = false) => {
    if (inReach(u, x, z)) return true;
    const tz = alongFence ? u.z : z;
    const d = dist(u, x, tz);
    const pace = paceOf(u, t);
    const go = Math.min(pace * STEP, Math.max(0, d - (alongFence ? 0 : C.reach * 0.9)));
    if (u.goal !== goal || Math.abs(u.pace - pace) > EPS) {
      u.goal = goal;
      u.pace = pace;
      events.push({ t, type: 'move', a: u.f.id, x: round3(x), z: round3(tz), speed: round3(pace) });
    }
    if (d > EPS) { u.x += ((x - u.x) / d) * go; u.z += ((tz - u.z) / d) * go; }
    return inReach(u, x, z);
  };
  /** The weapon goes flying, and they finish on fists (still scaled by level and traits). */
  const disarm = (u: Live, t: number) => {
    u.hit *= WEAPONS.fists.hit / WEAPONS[u.weapon].hit;
    u.chop *= WEAPONS.fists.chop / WEAPONS[u.weapon].chop;
    u.weapon = 'fists';
    events.push({ t, type: 'drop', a: u.f.id });
  };
  /** A swing: Butterfingers may let the weapon slip on it. The next comes 1.5 s later (sooner on an Espresso Shot). */
  const swingWith = (u: Live, t: number) => {
    u.swings++;
    if (u.dropOn && u.swings === u.dropOn && u.weapon !== 'fists') disarm(u, t);
    u.cd = GUARD_BASE.swing / quick(u, t);
  };

  const koed: string[] = [], hatchetKos: string[] = [];
  const hurt = (u: Live, dmg: number, by: Live | null, t: number) => {
    if (u.out) return;
    u.hp -= dmg * (1 - u.f.armor);
    if (u.hp > EPS) return;
    u.hp = 0;
    u.out = true;
    const weapon = by ? by.weapon : 'fence';
    koed.push(u.f.id);
    if (weapon === 'hatchets') hatchetKos.push(u.f.id);
    events.push({ t, type: 'ko', a: u.f.id, by: by ? by.f.id : 'fence', weapon });
  };
  /** Off home: a runner, or everyone at once on a Fall Back. */
  const goHome = (u: Live, t: number) => {
    u.ran = true;
    events.push({ t, type: 'flee', a: u.f.id });
    u.goal = 'home';
    events.push({ t, type: 'move', a: u.f.id, x: round3(u.x), z: round3(u.side === 'att' ? lineA + 2 : -1), speed: round3(u.speed) }); // two plot-lengths out to the street, or round the back
  };

  // ---- the player's buttons, and late arrivals ----
  const queue: FightCommand[] = [];
  const rallyUntil: Record<Side, number> = { att: -1, def: -1 };
  let fellBack: Side | undefined;
  const enqueue = (c: FightCommand) => {
    let i = queue.length;
    while (i > 0 && queue[i - 1].t > c.t + EPS) i--;
    queue.splice(i, 0, c);
  };
  for (const j of input.joins ?? []) enqueue({ t: Math.max(0, j.t), type: 'join', fighters: j.fighters });
  const joinIn = (fighters: Fighter[], t: number) => {
    for (const f of fighters) {
      if (fellBack === f.side) continue; // that side has given the fight up: they turn back
      const team = f.side === 'att' ? att : def;
      const u = mk(f, team.length);
      u.x = slotX(team.length);
      u.z = f.side === 'att' ? lineA : lineD;
      if (f.side === 'att') u.arrive = t; // raiders still come in through the arrivals (and the gadgets)
      team.push(u);
      events.push({ t, type: 'at', a: f.id, x: round3(u.x), z: round3(u.z) });
      butterfingers(u);
    }
  };
  const apply = (c: FightCommand, t: number) => {
    if (c.type === 'rally') {
      rallyUntil[c.side] = t + FIGHT_BUTTONS.rally.seconds;
      events.push({ t, type: 'rally', side: c.side });
    } else if (c.type === 'fallBack') {
      if (fellBack) return; // once per fight
      fellBack = c.side;
      events.push({ t, type: 'fallBack', side: c.side });
      for (const u of c.side === 'att' ? att : def) if (up(u)) goHome(u, t);
    } else joinIn(c.fighters, t);
  };

  // ---- the boss's move (HQ Boss Room) ----
  const moves = [...(input.bossMoves ?? [])].sort((a, b) => a.t - b.t);
  /** Hostile Takeover: they cross over, and fight for the other side from here on. */
  const turn = (u: Live, t: number) => {
    const from = u.side === 'att' ? att : def;
    const to = u.side === 'att' ? def : att;
    from.splice(from.indexOf(u), 1);
    u.side = u.side === 'att' ? 'def' : 'att';
    u.rank = to.length;
    u.here = true;
    u.bale = 0;
    u.goal = '';
    to.push(u);
    events.push({ t, type: 'turn', a: u.f.id, side: u.side });
  };
  const bossMove = (m: BossMove, t: number) => {
    const b = [...att, ...def].find((u) => u.f.id === m.by);
    if (!b || !up(b)) return; // knocked out (or gone) before they could
    // Who it picks on: the raiders on the field nearest the boss.
    const foes = (b.side === 'att' ? def : att).filter((u) => up(u) && (u.side === 'def' || u.here));
    const nearestFirst = foes.sort((p, q) => dist(b, p.x, p.z) - dist(b, q.x, q.z) || p.rank - q.rank);
    events.push({ t, type: 'boss', a: b.f.id, move: m.type });
    switch (m.type) {
      case 'rush':
        for (const u of nearestFirst.slice(0, m.count)) { u.stun = Math.max(u.stun, m.stun); events.push({ t, type: 'stun', a: u.f.id, by: 'rush' }); }
        break;
      case 'espresso':
        haste[b.side] = { until: t + m.seconds, mult: 1 + m.boost };
        break;
      case 'bales':
        for (const u of nearestFirst.slice(0, m.count)) { u.bale = m.hp; events.push({ t, type: 'bale', a: u.f.id, hp: m.hp }); }
        break;
      case 'takeover':
        for (const u of nearestFirst.filter((u) => u.f.trait !== 'Loyal').slice(0, m.count)) turn(u, t);
        break;
      case 'call':
        joinIn(m.fighters.map((f) => ({ ...f, side: b.side })), t);
        break;
      case 'cane': {
        const u = nearestFirst.find((u) => u.weapon !== 'fists');
        if (u) disarm(u, t);
        break;
      }
    }
  };

  const checked: Record<Side, boolean> = { att: false, def: false };
  let objStart = -1; // when the objective phase began: perimeter down, raiders up, no defender up
  let grab = 0;
  let objDone = false;
  let over = false;
  let n = 0;
  let duration = 0;
  const end = (t: number) => { over = true; duration = t; };

  /** One tick, at t = n × STEP. */
  const tick = () => {
    const t = n * STEP;
    while (queue.length && queue[0].t <= t + EPS) apply(queue.shift()!, t);
    // Arrivals, and the gadgets that spring on them.
    for (const u of att) {
      if (u.here || u.arrive > t + EPS || !up(u)) continue;
      u.here = true;
      u.z = lineA;
      if (honks > 0) { honks--; u.stun = Math.max(u.stun, C.goose.stun); events.push({ t, type: 'stun', a: u.f.id, by: 'goose' }); }
      if (slips > 0) { slips--; u.stun = Math.max(u.stun, C.slick.stun); events.push({ t, type: 'stun', a: u.f.id, by: 'slick' }); }
    }
    while (moves.length && moves[0].t <= t + EPS) bossMove(moves.shift()!, t);
    if (!isUp(att)) return end(t);
    const fenceUp = !breached;
    const defUp = isUp(def);
    if (objStart < 0 && !fenceUp && !defUp) objStart = t;
    if (objStart >= 0 && t >= objStart + timer - EPS) return end(t); // out of time: the stand is only Damaged
    if (objStart < 0 && t >= giveUp - EPS) return end(t); // no way through: the raiders go home

    const hits: Hit[] = [];
    const firstStrike = !input.detected && t < C.firstStrike.seconds - EPS ? 1 + C.firstStrike.bonus : 1;
    const attMult = firstStrike * soaked;
    const defMult = fenceUp ? 1 + fenceLine : 1;
    const hereA = att.filter((u) => u.here && up(u));
    const hereD = def.filter(up);
    // Stakes and wire bite everyone at the fence line while it stands.
    if (fenceUp && per?.breachDps) for (const a of hereA) hits.push({ to: a, dmg: per.breachDps * STEP, by: null });
    let atTill = false;

    for (const u of [...att, ...def]) {
      if (!up(u)) continue;
      if (u.side === 'att' && !u.here) continue; // still walking in
      if (u.stun > EPS) { u.stun = Math.max(0, u.stun - STEP); continue; }
      const ready = u.cd <= EPS;
      if (u.side === 'att') {
        if (u.bale > EPS) {
          // Walled in by a hay bale: chop through it first, while the crew swings over it.
          if (ready) { swingWith(u, t); hits.push({ to: 'bale', dmg: u.chop * attMult, by: u }); }
        } else if (fenceUp) {
          // Raiders can't reach the guards or the stand until the perimeter is down: chop.
          if (ready) { swingWith(u, t); hits.push({ to: 'fence', dmg: u.chop * attMult, by: u }); }
        } else {
          const foe = nearest(u, hereD);
          if (foe) {
            if (closeIn(u, foe.f.id, foe.x, foe.z, t) && ready) { swingWith(u, t); hits.push({ to: foe, dmg: u.hit * attMult, by: u }); }
          } else {
            // Nobody left to stop them: the stand (or the till).
            const sx = Math.max(-C.standWidth / 2, Math.min(C.standWidth / 2, u.x));
            if (closeIn(u, 'stand', sx, gap, t)) {
              atTill = true;
              if (input.objective === 'smash' && stand > 0 && ready) { swingWith(u, t); hits.push({ to: 'stand', dmg: u.chop * attMult, by: u }); }
            }
          }
        }
      } else {
        // Defenders swing at the nearest raider: over the fence at the ones chopping it, then anywhere.
        const foe = nearest(u, hereA);
        if (foe && closeIn(u, foe.f.id, foe.x, foe.z, t, fenceUp) && ready) { swingWith(u, t); hits.push({ to: foe, dmg: u.hit * defMult, by: u }); }
      }
      u.cd = Math.max(0, u.cd - STEP);
    }

    // Everything in the same instant lands together.
    for (const h of hits) {
      if (h.to === 'fence') {
        fence -= h.dmg;
        events.push({ t, type: 'chop', a: h.by!.f.id, target: 'fence', dmg: round1(h.dmg) });
      } else if (h.to === 'bale') {
        const u = h.by!;
        u.bale -= h.dmg;
        events.push({ t, type: 'chop', a: u.f.id, target: 'bale', dmg: round1(h.dmg) });
        if (u.bale <= EPS) { u.bale = 0; events.push({ t, type: 'bale', a: u.f.id, hp: 0 }); }
      } else if (h.to === 'stand') {
        stand = Math.max(0, stand - h.dmg);
        events.push({ t, type: 'chop', a: h.by!.f.id, target: 'stand', dmg: round1(h.dmg) });
      } else {
        if (h.by) events.push({ t, type: 'swing', a: h.by.f.id, b: h.to.f.id, dmg: round1(h.dmg) });
        hurt(h.to, h.dmg, h.by, t);
      }
    }
    if (!breached && fence <= EPS) { fence = 0; breached = true; events.push({ t, type: 'breach' }); }

    if (input.objective === 'smash' && objStart >= 0 && stand <= EPS && isUp(att)) { objDone = true; return end(t); }
    if (input.objective === 'shakedown' && objStart >= 0 && atTill) {
      if (grab === 0) events.push({ t, type: 'grab' });
      grab += STEP;
      if (grab >= grabFor - EPS) { objDone = isUp(att); return end(t + STEP); }
    }

    // Nerve: once a side has lost half its people (rounded down), everyone left rolls once (a Rally lifts it).
    for (const side of ['att', 'def'] as Side[]) {
      const all = side === 'att' ? att : def;
      const need = Math.floor(all.length / 2);
      if (checked[side] || need < 1) continue;
      if (all.filter((u) => !up(u)).length < need) continue;
      checked[side] = true;
      const rally = t < rallyUntil[side] - EPS ? FIGHT_BUTTONS.rally.nerve : 0;
      for (const u of all) {
        if (!up(u)) continue;
        if (nextRandom(rng) * 100 >= u.f.nerve + rally) goHome(u, t);
      }
    }
    n++;
  };

  /** How few of a side are left standing when its one Nerve roll comes (half of it down, rounded down, as above). */
  const nerveAt = (side: Side): number | null => {
    const all = side === 'att' ? att : def, need = Math.floor(all.length / 2);
    return checked[side] || need < 1 ? null : all.length - need;
  };

  const result = (): BattleResult => {
    const attackersUp = isUp(att);
    let outcome: BattleResult['outcome'] = 'repelled';
    if (attackersUp && objDone) outcome = input.objective === 'smash' ? 'smashed' : 'robbed';
    else if (attackersUp && !isUp(def) && (stand < input.standHp || grab > 0)) outcome = 'damaged';
    return {
      // A side that Falls Back has lost the fight, whatever became of the stand (the spec's "the fight is lost").
      winner: fellBack ? (fellBack === 'att' ? 'def' : 'att') : outcome === 'smashed' || outcome === 'robbed' ? 'att' : 'def',
      outcome,
      fenceHpLeft: Math.round(fence),
      standHpLeft: Math.round(stand),
      koed,
      fled: [...att, ...def].filter((u) => u.ran).map((u) => u.f.id),
      hatchetKos,
      hpLeft: Object.fromEntries([...att, ...def].map((u) => [u.f.id, Math.max(0, u.hp)])),
      duration: over ? duration : n * STEP,
      events,
      ...(fellBack ? { fellBack } : {}),
    };
  };

  return {
    events,
    time: () => (over ? duration : n * STEP),
    done: () => over,
    advance(until) { while (!over && n * STEP <= until + EPS) tick(); },
    command(c) { if (!over) enqueue(c); },
    status: () => ({
      t: over ? duration : n * STEP, done: over,
      up: { att: att.filter(up).length, def: def.filter(up).length },
      of: { att: att.length, def: def.length },
      nerveAt: { att: nerveAt('att'), def: nerveAt('def') },
      rallyUntil: { ...rallyUntil }, ...(fellBack ? { fellBack } : {}),
    }),
    result,
  };
}

/**
 * Estimated attacker win chance: fight it many times on dice of its own. `input` is one fight, or a maker that
 * draws a fresh one for each run (the Raid Planner: the garrison's weapons and the detection roll change each time).
 */
export function winChance(input: BattleInput | ((rng: Rng) => BattleInput), seed: number, runs = 120): number {
  const rng = { seed };
  let wins = 0;
  for (let i = 0; i < runs; i++) {
    const before = rng.seed;
    const won = runBattle(typeof input === 'function' ? input(rng) : input, rng).winner === 'att';
    if (won) wins++;
    // One fixed fight and no dice rolled (no Nerve check, no Butterfingers): every run would end the same way.
    if (typeof input !== 'function' && rng.seed === before) { if (won) wins += runs - i - 1; break; }
  }
  return wins / runs;
}

// ---------- saves ----------

/** The fight rules a save's numbers follow: newGame stamps it, migrateCombat brings older saves up to it. */
export const COMBAT_RULES = 1;
/** Full fence HP by tier before rules 1 (the build's own tuning). An old fence keeps its share of full HP. */
const OLD_FENCE_HP = [280, 500, 800, 1150, 3000];

/** Brings an older save up to these fight rules. Safe to run on every load. */
export function migrateCombat(s: GameState): void {
  const from = s.combatRules ?? 0;
  if (from < 1) {
    for (const ps of Object.values(s.plots)) {
      const per = PERIMETERS[(ps.defense?.tier ?? 0) - 1];
      if (!per) continue;
      const share = Math.min(1, Math.max(0, ps.defense.fenceHp / OLD_FENCE_HP[per.tier - 1]));
      ps.defense.fenceHp = Math.round(share * per.hp);
    }
  }
  migrateClubhouse(s); // one Clubhouse level for the crew becomes a Clubhouse on a Street plot
  migrateCaptives(s);
  tagBosses(s);
  s.combatRules = COMBAT_RULES;
}

/** Bosses saved before the boss flag, in a raid tonight or a fight saved mid-brawl, known by their id. */
function tagBosses(s: GameState): void {
  const f = s.fight;
  const live = f ? [...(f.raid.party ?? []), ...f.input.attackers, ...f.input.defenders, ...(f.input.joins ?? []).flatMap((j) => j.fighters)] : [];
  for (const x of [...(s.raids ?? []).flatMap((r) => r.party ?? []), ...live]) if (x.id.includes('-boss-')) x.boss = true;
}
