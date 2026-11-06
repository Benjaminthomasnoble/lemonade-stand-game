// The auto-battle (canon section 12): approach, breach, brawl, objective.
// Pure and seeded: the same inputs always give the same fight, and the
// timeline it returns is what the 3D replay plays back.
import { COMBAT, FENCE_DEFENDER_BONUS, GUARD_BASE, PERIMETERS, type GadgetId } from './balance.ts';
import { nextRandom, type Rng } from './rng.ts';

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
  weapon: 'fists' | 'clubs' | 'hatchets';
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
}

export type BattleEvent =
  | { t: number; type: 'swing'; a: string; b: string; dmg: number }
  | { t: number; type: 'chop'; a: string; target: 'fence' | 'stand'; dmg: number }
  | { t: number; type: 'ko'; a: string }
  | { t: number; type: 'flee'; a: string }
  | { t: number; type: 'stun'; a: string; by: 'goose' | 'slick' }
  | { t: number; type: 'breach' }
  | { t: number; type: 'grab' };

export interface BattleResult {
  winner: Side;
  outcome: 'smashed' | 'robbed' | 'damaged' | 'repelled';
  fenceHpLeft: number;
  standHpLeft: number;
  koed: string[]; // fighter ids knocked out
  fled: string[];
  duration: number;
  events: BattleEvent[];
}

const STEP = 0.5;
const MAX_T = 120; // the objective timer: then the stand is only Damaged
const HIT_CHANCE = 0.8;
const FIRST_STRIKE = { bonus: 0.25, seconds: 5 };
const GRAB_SECONDS = 8;

interface Live extends Fighter { maxHp: number; cd: number; stun: number; out: boolean; ran: boolean }

export function runBattle(input: BattleInput, rng: Rng): BattleResult {
  const mk = (f: Fighter): Live => ({ ...f, maxHp: f.hp, cd: nextRandom(rng) * GUARD_BASE.swing, stun: 0, out: false, ran: false });
  const att = input.attackers.map(mk);
  const def = input.defenders.map(mk);
  const per = PERIMETERS[input.perimeter - 1];
  let fence = per ? input.fenceHp : 0;
  let stand = input.standHp;
  const events: BattleEvent[] = [];
  const has = (g: GadgetId) => input.gadgets.includes(g);
  const soaked = has('sprinkler') ? 0.8 : 1;
  let nerveChecked: Record<Side, boolean> = { att: false, def: false };
  let grab = 0;
  let breached = fence <= 0;

  // Gadgets spring first.
  const t0 = 0;
  if (has('goose') && att[0]) { att[0].stun = 3; events.push({ t: t0, type: 'stun', a: att[0].id, by: 'goose' }); }
  if (has('slick')) for (const a of att.slice(0, 3)) { a.stun = Math.max(a.stun, 4); events.push({ t: t0, type: 'stun', a: a.id, by: 'slick' }); }

  const up = (xs: Live[]) => xs.filter((x) => !x.out && !x.ran);
  let t = 0;
  for (; t < MAX_T; t += STEP) {
    const A = up(att), D = up(def);
    if (!A.length) break;
    const done = input.objective === 'smash' ? stand <= 0 : grab >= GRAB_SECONDS;
    if (done) break;

    // Stakes and wire hurt attackers while they breach.
    if (!breached && per?.breachDps) {
      for (const a of A) hurt(a, per.breachDps * COMBAT.breachDps * STEP, t);
    }

    for (const u of [...A, ...D]) {
      if (u.out || u.ran) continue;
      if (u.stun > 0) { u.stun -= STEP; continue; }
      u.cd -= STEP * (u.side === 'att' && !breached && per?.slow ? 1 - per.slow : 1);
      if (u.cd > 0) continue;
      u.cd += GUARD_BASE.swing;
      const foes = up(u.side === 'att' ? def : att);
      if (u.side === 'att') {
        if (!breached) {
          // Chop the fence (defenders strike over tougher fences).
          const dmg = u.chop * (0.8 + 0.4 * nextRandom(rng)) * soaked * COMBAT.fenceChop;
          fence -= dmg;
          events.push({ t, type: 'chop', a: u.id, target: 'fence', dmg: Math.round(dmg) });
          if (fence <= 0) { fence = 0; breached = true; events.push({ t, type: 'breach' }); }
          continue;
        }
        if (foes.length) { swing(u, foes, t); continue; }
        // No one left to stop them: do the job.
        if (input.objective === 'smash' && stand > 0) {
          const dmg = u.chop * (0.8 + 0.4 * nextRandom(rng));
          stand = Math.max(0, stand - dmg);
          events.push({ t, type: 'chop', a: u.id, target: 'stand', dmg: Math.round(dmg) });
        }
      } else if (foes.length && (breached || input.perimeter >= COMBAT.throughFenceTier)) {
        swing(u, foes, t);
      }
    }
    if (input.objective === 'shakedown' && breached && up(att).length && !up(def).length) {
      if (grab === 0) events.push({ t, type: 'grab' });
      grab += STEP;
    }

    // Nerve: once a side has lost half its people, each one left rolls once.
    for (const side of ['att', 'def'] as Side[]) {
      const all = side === 'att' ? att : def;
      if (nerveChecked[side] || !all.length) continue;
      const lost = all.filter((x) => x.out || x.ran).length;
      if (lost * 2 >= all.length && lost > 0) {
        nerveChecked = { ...nerveChecked, [side]: true };
        for (const u of up(all)) {
          if (nextRandom(rng) * 100 > u.nerve + (side === 'def' ? 20 : 0)) { u.ran = true; events.push({ t, type: 'flee', a: u.id }); }
        }
      }
    }
  }

  function swing(u: Live, foes: Live[], at: number) {
    if (nextRandom(rng) > HIT_CHANCE) return;
    const target = foes[Math.floor(nextRandom(rng) * foes.length)];
    let mult = 0.8 + 0.4 * nextRandom(rng);
    if (u.side === 'def') mult *= 1 + COMBAT.homeBonus;
    if (u.side === 'def' && fence > 0) mult *= 1 + FENCE_DEFENDER_BONUS;
    if (u.side === 'def' && input.perimeter === 5 && fence > 0) mult *= 1 + FENCE_DEFENDER_BONUS;
    if (u.side === 'att' && !input.detected && at < FIRST_STRIKE.seconds) mult *= 1 + FIRST_STRIKE.bonus;
    if (u.side === 'att') mult *= soaked;
    const dmg = u.hit * mult;
    events.push({ t: at, type: 'swing', a: u.id, b: target.id, dmg: Math.round(dmg) });
    hurt(target, dmg, at);
  }
  function hurt(u: Live, dmg: number, at: number) {
    if (u.out) return;
    u.hp -= dmg * (1 - u.armor);
    if (u.hp <= 0) { u.hp = 0; u.out = true; events.push({ t: at, type: 'ko', a: u.id }); }
  }

  const attackersUp = up(att).length > 0;
  const finished = input.objective === 'smash' ? stand <= 0 : grab >= GRAB_SECONDS;
  let outcome: BattleResult['outcome'] = 'repelled';
  if (attackersUp && finished) outcome = input.objective === 'smash' ? 'smashed' : 'robbed';
  else if (attackersUp && !up(def).length && (stand < input.standHp || grab > 0)) outcome = 'damaged';
  return {
    winner: outcome === 'smashed' || outcome === 'robbed' ? 'att' : 'def',
    outcome,
    fenceHpLeft: Math.round(fence),
    standHpLeft: Math.round(stand),
    koed: [...att, ...def].filter((x) => x.out).map((x) => x.id),
    fled: [...att, ...def].filter((x) => x.ran).map((x) => x.id),
    duration: t,
    events,
  };
}

/** Estimated attacker win chance: replay the fight many times on a copy of the seed. */
export function winChance(input: BattleInput, seed: number, runs = 120): number {
  const rng = { seed };
  let wins = 0;
  for (let i = 0; i < runs; i++) if (runBattle(input, rng).winner === 'att') wins++;
  return wins / runs;
}
