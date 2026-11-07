// Live fights (spec: The fight clock and your buttons). A fight the player
// watches runs at 1 fight-second = 1 real second = 1 game minute, whatever the
// speed setting: the game clock moves by the fight's length, and the game's
// pause holds the fight and the clock together. Rally, Fall Back and Ring the
// Bell act on the running fight.
//
// The save keeps a live fight as its input, its own dice and the commands
// pressed (stamped with the fight-second they acted on); the running fight is
// re-made from those whenever it isn't in memory, so a reload picks it up
// mid-brawl. Fights go live only while the game watches (watchFights): your
// raids and raids on you as they reach the plot on the raid clock (night.ts
// calls startFight), Delivery Raids and each HQ assault stage. Tests, tools and
// the skips (Finish the day, Sleep till dawn) fight everything at once.
import { FIGHT_BUTTONS, FIGHT_SECONDS_PER_GAME_MINUTE, type RivalId } from './balance.ts';
import { createFight, type BattleInput, type BattleResult, type Fight, type FightCommand, type FightStatus, type Side } from './combat.ts';
import { fightRaid, raidInput, type BattleReport, type Raid } from './crew.ts';
import { raidFought } from './night.ts';
import type { FactionId } from './map.ts';
import { canAssault, HQ_STAGES, hqPlot, hqSquad, hqStageInput, hqStageOver, hqSurvivors, type HqStage } from './rivals.ts';
import { nextRandom } from './rng.ts';
import type { GameState } from './economy.ts';

/** Real seconds the raiders take to walk the last stretch in: the fight and the clock start at contact. */
export const FIGHT_LEAD_IN = 3.5;
/** Between HQ stages the squad dusts itself off before the next door. */
export const FIGHT_BREAK = 2.5;

export interface LiveFight {
  id: string;
  raid: Raid; // what's being fought (an HQ stage carries the assault's raid on the HQ plot)
  night: boolean;
  input: BattleInput;
  seed: number; // the fight's own dice
  t: number; // fight-seconds since contact (negative while the raiders walk in)
  ticked: number; // game minutes the clock has moved for this fight so far
  start?: number; // the game minute it began (contact): your squad's walk home is timed from it
  commands: FightCommand[]; // what the player pressed, stamped with the fight-second it acted on
  side: Side | null; // the player's side: the buttons are theirs (null: a fight they only watch)
  hq?: { rival: RivalId; stage: HqStage; reports: BattleReport[] }; // one stage of an HQ assault
}

const EPS = 1e-9;
const running = new WeakMap<LiveFight, Fight>();
const views = new WeakMap<LiveFight, BattleReport>();

/** Is someone watching? The game turns this on; until then every fight is fought at once. */
let watching = false;
export function watchFights(on: boolean): void {
  watching = on;
}
/** Run f with every fight in it fought at once (the skips: Finish the day, Sleep till dawn). */
export function atOnce<T>(f: () => T): T {
  const was = watching;
  watching = false;
  try { return f(); } finally { watching = was; }
}

/** The running fight, re-made from the saved input, dice and commands when it isn't in memory. */
function fightOf(f: LiveFight): Fight {
  let fight = running.get(f);
  if (!fight) {
    fight = createFight(f.input, { seed: f.seed });
    for (const c of f.commands) fight.command(c);
    if (f.t >= 0) fight.advance(f.t);
    running.set(f, fight);
  }
  return fight;
}

/** Put a fight on: its dice come from the game's seed, and the raiders start walking in. */
function begin(s: GameState, o: Pick<LiveFight, 'raid' | 'night' | 'input' | 'side' | 'hq'>, lead = FIGHT_LEAD_IN): LiveFight {
  const rng = { seed: s.seed };
  const seed = Math.floor(nextRandom(rng) * 0x100000000);
  s.seed = rng.seed;
  const f: LiveFight = { id: `f${s.nextId++}`, ...o, seed, t: -lead, ticked: 0, start: s.minute, commands: [] };
  if (!f.hq) delete f.hq;
  s.fight = f;
  return f;
}

/**
 * A raid starts as a live fight. A fight you're not in, any fight while
 * nobody watches, and a second one while a fight is on are fought at once
 * instead (the report comes back), so nothing waits off screen.
 */
export function startFight(s: GameState, raid: Raid, night = s.phase !== 'open'): BattleReport | true {
  const mine = raid.attacker === 'player' || s.plots[raid.target].owner === 'player';
  if (!watching || !mine || s.fight) return fightRaid(s, raid, night);
  const rng = { seed: s.seed };
  const input = raidInput(s, raid, night, rng);
  s.seed = rng.seed;
  const side: Side | null = raid.attacker === 'player' ? 'att' : s.plots[raid.target].owner === 'player' ? 'def' : null;
  begin(s, { raid, night, input, side });
  return true;
}

/** Storm a Weakened rival's HQ live: the Gate first, then the Yard and the Boss Room as each one falls. */
export function startAssault(s: GameState, id: RivalId, guardIds: string[]): boolean {
  if (s.fight || !canAssault(s, id, guardIds).ok) return false;
  const squad = hqSquad(s, id, guardIds);
  const rng = { seed: s.seed };
  const input = hqStageInput(s, id, 'gate', squad, rng);
  s.seed = rng.seed;
  const raid: Raid = { id: `r${s.nextId++}`, attacker: 'player', target: hqPlot(id).id, objective: input.objective, guards: guardIds, detected: true, eta: '' };
  begin(s, { raid, night: false, input, side: 'att', hq: { rival: id, stage: 'gate', reports: [] } });
  return true;
}

/** The fight is over: live with the result. An HQ stage that falls opens the next one. */
function settle(s: GameState, f: LiveFight, res: BattleResult): BattleReport {
  if (s.fight === f) delete s.fight;
  running.delete(f);
  let report: BattleReport;
  if (f.hq) {
    const { rival, stage, reports } = f.hq;
    const next = hqStageOver(s, rival, stage, f.input, res, reports);
    report = reports[reports.length - 1];
    if (next === 'next') {
      const rng = { seed: s.seed };
      const after = HQ_STAGES[HQ_STAGES.indexOf(stage) + 1];
      const input = hqStageInput(s, rival, after, hqSurvivors(f.input, res), rng);
      s.seed = rng.seed;
      begin(s, { raid: { ...f.raid, objective: input.objective }, night: false, input, side: 'att', hq: { rival, stage: after, reports } }, FIGHT_LEAD_IN + FIGHT_BREAK);
    }
  } else {
    // Who joined mid-fight is part of the fight's record: they get the credit (and the bruises).
    const joins = f.commands.flatMap((c) => (c.type === 'join' ? [{ t: c.t, fighters: c.fighters }] : []));
    report = fightRaid(s, f.raid, f.night, { input: joins.length ? { ...f.input, joins: [...(f.input.joins ?? []), ...joins] } : f.input, res });
    raidFought(s, f.raid, report, !f.night, f.start ?? s.minute - f.ticked); // the raid clock: your squad walks home, a pickup loads out
  }
  const view = views.get(f);
  if (view) Object.assign(view, report);
  return report;
}

/**
 * Run the live fight for dt real seconds (= fight-seconds); the game's pause
 * just stops calling this. Returns the game minutes the clock moves (1 per
 * fight-second, none while they walk in) and, when the fight ends, its report.
 */
export function stepFight(s: GameState, dt: number): { minutes: number; ended?: BattleReport } {
  const f = s.fight;
  if (!f || !(dt > 0)) return { minutes: 0 };
  const fight = fightOf(f);
  f.t += dt;
  if (f.t >= 0) fight.advance(f.t);
  if (!fight.done()) {
    const to = Math.max(0, Math.floor(f.t / FIGHT_SECONDS_PER_GAME_MINUTE + EPS));
    const minutes = Math.max(0, to - f.ticked);
    f.ticked += minutes;
    return { minutes };
  }
  const res = fight.result();
  const minutes = Math.max(0, Math.round(res.duration / FIGHT_SECONDS_PER_GAME_MINUTE) - f.ticked);
  return { minutes, ended: settle(s, f, res) };
}

/** Run the live fight (and the rest of an HQ assault) to the end now: skipping the day or sleeping doesn't wait. */
export function finishFight(s: GameState): BattleReport[] {
  const out: BattleReport[] = [];
  for (let guard = 0; s.fight && guard < 8; guard++) {
    const f = s.fight;
    const fight = fightOf(f);
    fight.advance(Infinity);
    out.push(settle(s, f, fight.result()));
  }
  return out;
}

// ---------- the buttons ----------

/** Rally: +20 Nerve for 10 seconds, every 30 seconds, whichever side you're on. */
export function canRally(s: GameState): boolean {
  const f = s.fight;
  if (!f?.side) return false;
  const fight = fightOf(f);
  if (fight.done()) return false;
  const last = [...f.commands].reverse().find((c) => c.type === 'rally');
  return !last || fight.time() >= last.t + FIGHT_BUTTONS.rally.every - EPS;
}

/** Fall Back: once per fight, everyone standing retreats with the KO'd. The fight is lost. */
export function canFallBack(s: GameState): boolean {
  const f = s.fight;
  return !!f?.side && !fightOf(f).done() && !f.commands.some((c) => c.type === 'fallBack');
}

/** Press a fight button for your side; it acts on the next tick. */
export function fightCommand(s: GameState, type: 'rally' | 'fallBack'): boolean {
  const f = s.fight;
  if (!f?.side || !(type === 'rally' ? canRally(s) : canFallBack(s))) return false;
  const fight = fightOf(f);
  const c: FightCommand = { t: fight.time(), type, side: f.side };
  f.commands.push(c);
  fight.command(c);
  return true;
}

/** Fighters reach the plot mid-fight (Ring the Bell): they join `inSeconds` fight-seconds from now. */
export function joinFight(s: GameState, fighters: BattleInput['defenders'], inSeconds: number): boolean {
  const f = s.fight;
  if (!f || !fighters.length) return false;
  const fight = fightOf(f);
  if (fight.done()) return false;
  const c: FightCommand = { t: Math.max(fight.time(), Math.max(0, f.t) + inSeconds), type: 'join', fighters };
  f.commands.push(c);
  fight.command(c);
  return true;
}

// ---------- for the HUD and the 3D view ----------

export interface LiveStatus extends FightStatus {
  clock: number; // fight-seconds since contact (0 while they walk in)
  side: Side | null;
  rally: boolean; // the Rally button is ready
  rallying: boolean; // a Rally is lifting your side's Nerve right now
  fallBack: boolean; // Fall Back is still available
  hq?: HqStage;
}

export function fightStatus(s: GameState): LiveStatus | null {
  const f = s.fight;
  if (!f) return null;
  const st = fightOf(f).status();
  return {
    ...st, clock: Math.max(0, f.t), side: f.side, rally: canRally(s), fallBack: canFallBack(s),
    rallying: !!f.side && st.t < st.rallyUntil[f.side] - EPS, ...(f.hq ? { hq: f.hq.stage } : {}),
  };
}

/** The live fight's clock for the 3D view: fight-seconds since contact (negative while they walk in). */
export const fightClock = (s: GameState): number | null => (s.fight ? s.fight.t : null);

/**
 * The live fight as a report for the 3D view: its events grow as the fight
 * runs, and when it ends this same object becomes the final report.
 */
export function liveReport(s: GameState): BattleReport | null {
  const f = s.fight;
  if (!f) return null;
  let r = views.get(f);
  if (!r) {
    const ps = s.plots[f.raid.target];
    r = {
      delivery: f.raid.delivery, day: s.day, attacker: f.raid.attacker, defender: ps.owner as FactionId, target: f.raid.target,
      objective: f.input.objective, outcome: 'repelled', loot: 0, attackers: f.input.attackers, defenders: f.input.defenders,
      perimeter: f.input.perimeter, standLevel: f.hq ? 3 : ps.stand?.level ?? 0, events: fightOf(f).events,
      duration: Infinity, koed: [], fled: [], ...(f.hq ? { hq: f.hq.stage } : {}),
      gadgets: f.input.gadgets.length ? f.input.gadgets : undefined, night: f.night || undefined, // the replay's gadgets and dark
    };
    views.set(f, r);
  }
  return r;
}
