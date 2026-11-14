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
//
// One fight plays at a time, and every fight on you plays live: a raid on you
// that gets to its plot while a fight is on waits at the plot's edge (night.ts
// keeps it on the raid clock) and goes in as that fight ends, at the minute it
// ends. Your own raids that land meanwhile are fought at once and replayed after.
import { FIGHT_BUTTONS, FIGHT_SECONDS_PER_GAME_MINUTE, type RivalId } from './balance.ts';
import { createFight, type BattleInput, type BattleResult, type Fight, type FightCommand, type FightStatus, type Side } from './combat.ts';
import { fightRaid, raidInput, spotAssault, type BattleReport, type Raid } from './crew.ts';
import { nextInLine, raidFought, waitingRaids } from './night.ts';
import type { FactionId } from './map.ts';
import { canAssault, HQ_STAGES, hqPlot, HQS, hqSquad, hqStageInput, hqStageOver, hqSurvivors, stormHQ, type AssaultResult, type HqStage } from './rivals.ts';
import { nextRandom } from './rng.ts';
import { tickMinute, type GameState, type SimEvent } from './economy.ts';

/** Real seconds the raiders take to walk the last stretch in: the fight and the clock start at contact. */
export const FIGHT_LEAD_IN = 3.5;
/** Between HQ stages the squad dusts itself off before the next door. */
export const FIGHT_BREAK = 2.5;
/** Fight-seconds the HUD names a boss's move after it goes off. */
export const BOSS_MOVE_SHOWN = 3;

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
/** A fight is playing live: a raid on you that gets to its plot now waits its turn at the edge (night.ts raidClock). */
export const fightOnScreen = (s: GameState) => watching && !!s.fight;

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
 * nobody watches, and a raid of yours that lands while a fight is on are fought
 * at once instead (the report comes back). A raid on you never lands mid-fight:
 * it waits its turn (night.ts nextInLine).
 */
export function startFight(s: GameState, raid: Raid, night = s.phase !== 'open'): BattleReport | true {
  if (raid.assault) return reachHQ(s, raid, night); // crew: an HQ Assault from the Raid Planner gets to the gate
  const mine = raid.attacker === 'player' || s.plots[raid.target].owner === 'player';
  if (!watching || !mine || s.fight) return fightRaid(s, raid, night);
  const rng = { seed: s.seed };
  const input = raidInput(s, raid, night, rng);
  s.seed = rng.seed;
  const side: Side | null = raid.attacker === 'player' ? 'att' : s.plots[raid.target].owner === 'player' ? 'def' : null;
  begin(s, { raid, night, input, side });
  return true;
}

/** An HQ Assault from the Raid Planner gets to the gate on the raid clock (crew): spotted or not at the HQ (crew.ts
 * spotAssault), then its three stages, live while the game watches and no other fight is on, else all at once. */
function reachHQ(s: GameState, raid: Raid, night: boolean): BattleReport | true {
  const id = s.plots[raid.target].owner as RivalId;
  spotAssault(s, raid, night);
  if (watching && !s.fight && startAssault(s, id, raid.guards ?? [], raid, night)) return true;
  const { reports } = stormHQ(s, id, raid.guards ?? [], raid) as AssaultResult; // sent: it always fights its way to an end
  // The report is the last stage's (the replay plays it); the squad walks home once that stage is over, after the rest.
  raid.earlierStages = reports.slice(0, -1).reduce((m, b) => m + Math.ceil(b.duration / FIGHT_SECONDS_PER_GAME_MINUTE), 0);
  return reports[reports.length - 1];
}

/**
 * Storm a Weakened rival's HQ live: the Gate first, then the Yard and the Boss Room as each one falls. The squad
 * carries its HP from stage to stage; the campaign's Sourwood Manor is as the Big Squeeze left it (rivals.ts).
 * `sent`: an HQ Assault from the Raid Planner that has got there (crew), fought by day or by `night`.
 */
export function startAssault(s: GameState, id: RivalId, guardIds: string[], sent?: Raid, night = false): boolean {
  if (s.fight || (!sent && !canAssault(s, id, guardIds).ok)) return false;
  const squad = hqSquad(s, id, guardIds);
  const rng = { seed: s.seed };
  const input = hqStageInput(s, id, 'gate', squad, rng, sent?.detected);
  s.seed = rng.seed;
  const raid: Raid = sent ?? { id: `r${s.nextId++}`, attacker: 'player', target: hqPlot(id).id, objective: input.objective, guards: guardIds, detected: true, eta: '' };
  begin(s, { raid, night, input, side: 'att', hq: { rival: id, stage: 'gate', reports: [] } });
  return true;
}

/** The fight is over: live with the result. An HQ stage that falls opens the next one; else the next raid waiting at a
 * plot's edge goes in (night.ts nextInLine), at this minute. */
function settle(s: GameState, f: LiveFight, res: BattleResult): BattleReport {
  if (s.fight === f) delete s.fight;
  running.delete(f);
  let report: BattleReport;
  if (f.hq) {
    const { rival, stage, reports } = f.hq;
    const next = hqStageOver(s, rival, stage, f.input, res, reports);
    report = reports[reports.length - 1];
    if (next === 'next') {
      // On to the next door, with the HP they have left.
      const rng = { seed: s.seed };
      const after = HQ_STAGES[HQ_STAGES.indexOf(stage) + 1];
      const input = hqStageInput(s, rival, after, hqSurvivors(f.input, res), rng);
      s.seed = rng.seed;
      begin(s, { raid: { ...f.raid, objective: input.objective }, night: f.night, input, side: 'att', hq: { rival, stage: after, reports } }, FIGHT_LEAD_IN + FIGHT_BREAK);
    } else if (f.raid.assault) raidFought(s, { ...f.raid, objective: 'smash' }, report, !f.night, f.start ?? s.minute - f.ticked); // crew: the squad walks home (by day, a Smash's stars)
  } else {
    // Who joined mid-fight is part of the fight's record: they get the credit (and the bruises).
    const joins = f.commands.flatMap((c) => (c.type === 'join' ? [{ t: c.t, fighters: c.fighters }] : []));
    report = fightRaid(s, f.raid, f.night, { input: joins.length ? { ...f.input, joins: [...(f.input.joins ?? []), ...joins] } : f.input, res });
    raidFought(s, f.raid, report, !f.night, f.start ?? s.minute - f.ticked); // the raid clock: your squad walks home, a pickup loads out
  }
  const view = views.get(f);
  if (view) Object.assign(view, report);
  if (!s.fight) nextInLine(s); // one after another: the next raid on you that's waiting goes in now
  return report;
}

/** Run the live fight dt fight-seconds on: the game minutes the clock moves for it (1 per fight-second, none while they
 * walk in), and once it's over its result, not yet settled. Null with no fight on, or no time. */
function run(s: GameState, dt: number): { f: LiveFight; minutes: number; res?: BattleResult } | null {
  const f = s.fight;
  if (!f || !(dt > 0)) return null;
  const fight = fightOf(f);
  f.t += dt;
  if (f.t >= 0) fight.advance(f.t);
  if (!fight.done()) {
    const to = Math.max(0, Math.floor(f.t / FIGHT_SECONDS_PER_GAME_MINUTE + EPS));
    const minutes = Math.max(0, to - f.ticked);
    f.ticked += minutes;
    return { f, minutes };
  }
  const res = fight.result();
  return { f, minutes: Math.max(0, Math.round(res.duration / FIGHT_SECONDS_PER_GAME_MINUTE) - f.ticked), res };
}

/**
 * Run the live fight for dt real seconds (= fight-seconds); the game's pause
 * just stops calling this. Returns the game minutes the clock moves (1 per
 * fight-second, none while they walk in) and, when the fight ends, its report.
 */
export function stepFight(s: GameState, dt: number): { minutes: number; ended?: BattleReport } {
  const r = run(s, dt);
  if (!r) return { minutes: 0 };
  return { minutes: r.minutes, ...(r.res ? { ended: settle(s, r.f, r.res) } : {}) };
}

/**
 * One frame of the game while a fight is live (main.ts's loop): the fight runs dt real seconds and the clock moves a
 * game minute for each fight-second, business hours or the night, whatever the speed (each minute's events go to
 * onMinute). Paused, the fight and the clock both hold still, and nothing runs (null). A fight still going at 07:00
 * holds the clock there: dawn waits for it to end (tickMinute). A fight that ends settles once the clock has caught up
 * with it, so a raid waiting its turn goes in at the minute it ended (and dawn waits for that one too).
 */
export function fightFrame(s: GameState, dt: number, paused: boolean, onMinute?: (events: SimEvent[]) => void): { minutes: number; ended?: BattleReport } | null {
  if (paused || !s.fight) return null;
  const from = s.phase;
  const r = run(s, dt);
  let moved = 0;
  for (; r && moved < r.minutes && s.phase === from && (from === 'open' || from === 'night'); moved++) {
    const ev = tickMinute(s);
    onMinute?.(ev);
  }
  if (!r?.res) return { minutes: moved };
  r.f.ticked += moved;
  return { minutes: moved, ended: settle(s, r.f, r.res) };
}

/** Run the live fight (and the rest of an HQ assault, and the raids waiting their turn) to the end now: skipping the
 * day or sleeping doesn't wait. */
export function finishFight(s: GameState): BattleReport[] {
  const out: BattleReport[] = [];
  for (let guard = 0, cap = 8 + s.raids.length; s.fight && guard < cap; guard++) {
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
  bossMove?: string; // the Boss Room's move, for a moment after it goes off ('Blender Rush')
  next?: string; // the plot where the next raid on you waits its turn, while one does
}

export function fightStatus(s: GameState): LiveStatus | null {
  const f = s.fight;
  if (!f) return null;
  const fight = fightOf(f);
  const st = fight.status();
  const move = f.hq ? fight.events.find((e) => e.type === 'boss' && e.t <= st.t + EPS && st.t < e.t + BOSS_MOVE_SHOWN - EPS) : undefined;
  const next = waitingRaids(s)[0];
  return {
    ...st, clock: Math.max(0, f.t), side: f.side, rally: canRally(s), fallBack: canFallBack(s),
    rallying: !!f.side && st.t < st.rallyUntil[f.side] - EPS, ...(f.hq ? { hq: f.hq.stage } : {}),
    ...(move && f.hq ? { bossMove: HQS[f.hq.rival].move } : {}), ...(next ? { next: next.target } : {}),
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
    // Who joins later (Ring the Bell's reserves, a boss's called Stewards), read fresh: the world draws them as they arrive.
    const view = r;
    Object.defineProperty(r, 'joins', {
      enumerable: true,
      configurable: true,
      // the final report (settle) writes its own joins over the live ones
      set: (value) => Object.defineProperty(view, 'joins', { value, writable: true, enumerable: true, configurable: true }),
      get: () => [
        ...(f.input.joins ?? []),
        ...f.commands.flatMap((c) => (c.type === 'join' ? [{ t: c.t, fighters: c.fighters }] : [])),
        ...(f.input.bossMoves ?? []).flatMap((m) => (m.type === 'call' ? [{ t: m.t, fighters: m.fighters.map((x) => ({ ...x, side: 'def' as const })) }] : [])),
      ],
    });
    views.set(f, r);
  }
  return r;
}
