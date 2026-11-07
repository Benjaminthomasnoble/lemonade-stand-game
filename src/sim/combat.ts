// The auto-battle (canon section 12; spec "How a fight resolves"): breach,
// brawl, objective. Pure and seeded: the same inputs always give the same
// fight, and the timeline it returns, positions included, is what the 3D
// replay plays back.
//
// The clock starts at contact, when the first raiders reach the fence (or the
// defenders, or the stand), and one fight-second is one game minute. Every
// swing lands for exactly its Hit or Chop times the listed multipliers, the
// first at t = 0 and then one every 1.5 s, and everyone swings at the nearest
// enemy. The dice are the Nerve and Butterfingers rolls; detection and the
// raiding party are rolled before the fight.
//
// Positions are in plot-lengths on the plot's own frame: x runs across the
// plot, z out from the stand's front (z = 0) toward the street.
import {
  COMBAT, FENCE_DEFENDER_BONUS, FIGHT_SECONDS_PER_GAME_MINUTE, GUARD_BASE, PERIMETERS, WEAPONS,
  type GadgetId, type Trait, type WeaponId,
} from './balance.ts';
import { nextRandom, type Rng } from './rng.ts';
import type { GameState } from './economy.ts';

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
}

export type BattleEvent =
  | { t: number; type: 'at'; a: string; x: number; z: number } // where each fighter is at contact
  | { t: number; type: 'move'; a: string; x: number; z: number; speed: number } // from t, walks toward (x, z)
  | { t: number; type: 'swing'; a: string; b: string; dmg: number }
  | { t: number; type: 'chop'; a: string; target: 'fence' | 'stand'; dmg: number }
  | { t: number; type: 'ko'; a: string; by?: string; weapon?: WeaponId | 'fence' } // who landed the knockout blow ('fence': stakes or wire)
  | { t: number; type: 'flee'; a: string }
  | { t: number; type: 'stun'; a: string; by: 'goose' | 'slick' }
  | { t: number; type: 'drop'; a: string } // Butterfingers: the weapon goes flying; fists from here on
  | { t: number; type: 'breach' }
  | { t: number; type: 'grab' };

export interface BattleResult {
  winner: Side;
  outcome: 'smashed' | 'robbed' | 'damaged' | 'repelled';
  fenceHpLeft: number;
  standHpLeft: number;
  koed: string[]; // fighter ids knocked out
  fled: string[];
  hatchetKos: string[]; // knocked out by a hatchet blow: Out 2 days instead of 1
  duration: number; // fight-seconds (game minutes)
  events: BattleEvent[];
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
  arrive: number; // attackers: when they reach the line
  here: boolean;
  cd: number; // seconds until the next swing
  stun: number;
  out: boolean;
  ran: boolean;
  dropOn: number; // Butterfingers: the weapon slips on this swing (0: it never does)
  swings: number;
  goal: string; // what they're walking toward, so each new leg is announced once
}

type Hit = { to: Live | 'fence' | 'stand'; dmg: number; by: Live | null };

/** Shoulder-to-shoulder spots along a line: the middle first, then out to either side. */
const slotX = (k: number) => (k % 2 ? -1 : 1) * Math.ceil(k / 2) * COMBAT.spacing;
const round1 = (n: number) => Math.round(n * 10) / 10;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

export function runBattle(input: BattleInput, rng: Rng): BattleResult {
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
  const wireSlow = per?.slow ?? 0; // Barbed Wire: raiders move 30% slower until it falls

  // ---- the line-up ----
  const fencedAtStart = !breached;
  const lineA = fencedAtStart ? C.fenceAt + gap : input.defenders.length ? C.holdAt + 2 * gap : gap;
  const lineD = fencedAtStart ? C.fenceAt - gap : C.holdAt;
  const speedOf = (f: Fighter) => f.speed ?? C.speed;
  const vMax = Math.max(C.speed * 1e-3, ...input.attackers.map(speedOf));
  const approachSlow = fencedAtStart ? 1 - wireSlow : 1;
  const mk = (f: Fighter, rank: number): Live => ({
    f, side: f.side, rank, hp: f.hp, hit: f.hit, chop: f.chop, weapon: f.weapon, speed: speedOf(f),
    x: 0, z: 0, arrive: 0, here: f.side === 'def', cd: 0, stun: 0, out: false, ran: false, dropOn: 0, swings: 0, goal: '',
  });
  // Raiders walk the last stretch in together; the quick ones reach the line first and take the middle.
  const lag = (f: Fighter) => C.approach * (1 / speedOf(f) - 1 / vMax) / approachSlow;
  const order = input.attackers.map((f, i) => ({ f, i, lag: lag(f) })).sort((a, b) => a.lag - b.lag || a.i - b.i);
  const att = order.map(({ f, lag: l }, k) => {
    const u = mk(f, k);
    u.x = slotX(k);
    u.arrive = Math.ceil(l / STEP - EPS) * STEP;
    u.z = lineA + C.approach * (1 - u.speed / vMax);
    return u;
  });
  const def = input.defenders.map((f, k) => { const u = mk(f, k); u.x = slotX(k); u.z = lineD; return u; });
  for (const u of [...att, ...def]) events.push({ t: 0, type: 'at', a: u.f.id, x: round3(u.x), z: round3(u.z) });
  for (const u of att) if (u.arrive > 0) { u.goal = 'line'; events.push({ t: 0, type: 'move', a: u.f.id, x: round3(u.x), z: round3(lineA), speed: round3(u.speed * approachSlow) }); }

  // Butterfingers: once a fight, a 10% chance the weapon slips on one of the first three swings.
  for (const u of [...att, ...def]) {
    if (u.f.trait !== 'Butterfingers' || u.weapon === 'fists') continue;
    if (nextRandom(rng) < C.butterfingers) u.dropOn = 1 + Math.floor(nextRandom(rng) * 3);
  }

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
  /**
   * Close in on (x, z) until it's within reach, announcing each new leg once; true when within reach.
   * Behind a standing fence a defender can only move along it (z stays put).
   */
  const closeIn = (u: Live, goal: string, x: number, z: number, t: number, alongFence = false) => {
    if (inReach(u, x, z)) return true;
    const tz = alongFence ? u.z : z;
    const d = dist(u, x, tz);
    const go = Math.min(u.speed * STEP, Math.max(0, d - (alongFence ? 0 : C.reach * 0.9)));
    if (u.goal !== goal) {
      u.goal = goal;
      events.push({ t, type: 'move', a: u.f.id, x: round3(x), z: round3(tz), speed: round3(u.speed) });
    }
    if (d > EPS) { u.x += ((x - u.x) / d) * go; u.z += ((tz - u.z) / d) * go; }
    return inReach(u, x, z);
  };
  /** Butterfingers: the weapon slips on this swing, and they finish on fists (still scaled by level and traits). */
  const swingWith = (u: Live, t: number) => {
    u.swings++;
    if (u.dropOn && u.swings === u.dropOn && u.weapon !== 'fists') {
      u.hit *= WEAPONS.fists.hit / WEAPONS[u.weapon].hit;
      u.chop *= WEAPONS.fists.chop / WEAPONS[u.weapon].chop;
      u.weapon = 'fists';
      events.push({ t, type: 'drop', a: u.f.id });
    }
    u.cd = GUARD_BASE.swing;
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

  const checked: Record<Side, boolean> = { att: false, def: false };
  let objStart = -1; // when the objective phase began: perimeter down, raiders up, no defender up
  let grab = 0;
  let done = false;
  let t = 0;
  for (let n = 0; ; n++) {
    t = n * STEP;
    // Arrivals, and the gadgets that spring on them.
    for (const u of att) {
      if (u.here || u.arrive > t + EPS || !up(u)) continue;
      u.here = true;
      u.z = lineA;
      if (u.goal === 'line') u.goal = '';
      if (honks > 0) { honks--; u.stun = Math.max(u.stun, C.goose.stun); events.push({ t, type: 'stun', a: u.f.id, by: 'goose' }); }
      if (slips > 0) { slips--; u.stun = Math.max(u.stun, C.slick.stun); events.push({ t, type: 'stun', a: u.f.id, by: 'slick' }); }
    }
    if (!isUp(att)) break;
    const fenceUp = !breached;
    const defUp = isUp(def);
    if (objStart < 0 && !fenceUp && !defUp) objStart = t;
    if (objStart >= 0 && t >= objStart + timer - EPS) break; // out of time: the stand is only Damaged
    if (objStart < 0 && t >= giveUp - EPS) break; // no way through: the raiders go home

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
        if (fenceUp) {
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
      } else if (h.to === 'stand') {
        stand = Math.max(0, stand - h.dmg);
        events.push({ t, type: 'chop', a: h.by!.f.id, target: 'stand', dmg: round1(h.dmg) });
      } else {
        if (h.by) events.push({ t, type: 'swing', a: h.by.f.id, b: h.to.f.id, dmg: round1(h.dmg) });
        hurt(h.to, h.dmg, h.by, t);
      }
    }
    if (!breached && fence <= EPS) { fence = 0; breached = true; events.push({ t, type: 'breach' }); }

    if (input.objective === 'smash' && objStart >= 0 && stand <= EPS && isUp(att)) { done = true; break; }
    if (input.objective === 'shakedown' && objStart >= 0 && atTill) {
      if (grab === 0) events.push({ t, type: 'grab' });
      grab += STEP;
      if (grab >= grabFor - EPS) { done = isUp(att); t += STEP; break; }
    }

    // Nerve: once a side has lost half its people (rounded down), everyone left rolls once.
    for (const side of ['att', 'def'] as Side[]) {
      const all = side === 'att' ? att : def;
      const need = Math.floor(all.length / 2);
      if (checked[side] || need < 1) continue;
      if (all.filter((u) => !up(u)).length < need) continue;
      checked[side] = true;
      for (const u of all) {
        if (!up(u)) continue;
        if (nextRandom(rng) * 100 >= u.f.nerve) {
          u.ran = true;
          events.push({ t, type: 'flee', a: u.f.id });
          u.goal = 'home';
          events.push({ t, type: 'move', a: u.f.id, x: round3(u.x), z: round3(side === 'att' ? lineA + C.approach * 2 : -1), speed: round3(u.speed) });
        }
      }
    }
  }

  const attackersUp = isUp(att);
  let outcome: BattleResult['outcome'] = 'repelled';
  if (attackersUp && done) outcome = input.objective === 'smash' ? 'smashed' : 'robbed';
  else if (attackersUp && !isUp(def) && (stand < input.standHp || grab > 0)) outcome = 'damaged';
  return {
    winner: outcome === 'smashed' || outcome === 'robbed' ? 'att' : 'def',
    outcome,
    fenceHpLeft: Math.round(fence),
    standHpLeft: Math.round(stand),
    koed,
    fled: [...att, ...def].filter((u) => u.ran).map((u) => u.f.id),
    hatchetKos,
    duration: t,
    events,
  };
}

/** Estimated attacker win chance: replay the fight many times on a copy of the seed. */
export function winChance(input: BattleInput, seed: number, runs = 120): number {
  const rng = { seed };
  let wins = 0;
  for (let i = 0; i < runs; i++) {
    const before = rng.seed;
    const won = runBattle(input, rng).winner === 'att';
    if (won) wins++;
    // No dice were rolled (no Nerve check, no Butterfingers): every run would end the same way.
    if (rng.seed === before) { if (won) wins += runs - i - 1; break; }
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
  s.combatRules = COMBAT_RULES;
}
