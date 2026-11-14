// Morning Prep and the Evening each wait for you, then move on by themselves: with Auto-continue on, Prep opens the
// stands after AUTO_CONTINUE_SECONDS; the Evening is a moment (EVENING_REAL_SECONDS) once the Ledger is folded, then
// the night starts. The frame loop in src/main.ts feeds this each frame and acts on what comes back; no DOM here.
import { EVENING_REAL_SECONDS, type GameState } from '../sim/economy.ts';
import { playingScene, sceneReady } from '../sim/scenes.ts';
import { AUTO_CONTINUE_SECONDS, autoPauses, type Options } from '../settings.ts';

/** Real seconds Morning Prep and the Evening have waited so far. */
export interface Waits { prep: number; evening: number }
export const newWaits = (): Waits => ({ prep: 0, evening: 0 });

/** This frame's screen: the Ledger unfolded, the clock held still (a pause, a day call, a run's end card), full-screen
 * paper up, and the knob's speed. */
export interface WaitView { ledger: boolean; frozen: boolean; paper: boolean; speed: number }

/**
 * One frame of waiting, `realDt` real seconds (`dt` is the frame step, clamped): 'open' once Morning Prep has waited
 * its time with Auto-continue on, 'night' once the Evening's moment is over, else null. Both hold while the clock is
 * frozen, paper is up or the run is over. Prep also holds for a scene and for an In the Red pause; the Evening holds
 * while the Ledger is open, unless Auto-continue is on, and runs with the knob (2× and 3× shorten it). Leaving a
 * phase clears its wait.
 */
export function waitStep(s: GameState, o: Options, v: WaitView, w: Waits, realDt: number, dt = Math.min(realDt, 0.1)): 'open' | 'night' | null {
  const held = v.frozen || v.paper || !!s.outcome;
  let due: 'open' | 'night' | null = null;
  if (s.phase !== 'prep') w.prep = 0;
  else if (o.autoContinue && !held && !playingScene(s) && !sceneReady(s) && !(s.redDays && autoPauses(o, s, 'red'))) {
    w.prep += realDt;
    if (w.prep >= AUTO_CONTINUE_SECONDS) due = 'open';
  }
  if (s.phase !== 'report') w.evening = 0;
  else if (!held && (!v.ledger || o.autoContinue)) {
    w.evening += dt * Math.max(v.speed, 1);
    if (w.evening >= EVENING_REAL_SECONDS) due = 'night';
  }
  return due;
}
