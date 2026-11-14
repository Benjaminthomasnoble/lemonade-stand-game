import { describe, expect, it } from 'vitest';
import { EVENING_REAL_SECONDS, newGame, openStands, simulateRestOfDay, sleepUntilDawn, type GameState } from '../sim/economy.ts';
import { sceneReady } from '../sim/scenes.ts';
import { AUTO_CONTINUE_SECONDS, DEFAULT_OPTIONS, type Options } from '../settings.ts';
import { newWaits, waitStep, type WaitView, type Waits } from './waits.ts';

const opts = (over: Partial<Options> = {}): Options => ({ ...DEFAULT_OPTIONS, pause: { ...DEFAULT_OPTIONS.pause }, ...over });
const view = (over: Partial<WaitView> = {}): WaitView => ({ ledger: false, frozen: false, paper: false, speed: 1, ...over });

/** Frames of `step` real seconds until something is due (or `max` seconds go by): what came, and when. */
function run(s: GameState, o: Options, v: WaitView, w: Waits, max = 60, step = 1 / 16): { due: string | null; at: number } {
  for (let t = step; t <= max + 1e-9; t += step) {
    const due = waitStep(s, o, v, w, step);
    if (due) return { due, at: t };
  }
  return { due: null, at: max };
}

/** Morning Prep of Day 2 with no scene waiting to play. */
function prep(seed: number): GameState {
  const s = newGame(seed);
  openStands(s);
  simulateRestOfDay(s);
  sleepUntilDawn(s);
  if (s.scenes) s.scenes.queue = [];
  expect([s.day, s.phase, sceneReady(s)]).toEqual([2, 'prep', false]);
  return s;
}

/** The Evening of Day 1. */
function evening(seed: number): GameState {
  const s = newGame(seed);
  openStands(s);
  simulateRestOfDay(s);
  expect(s.phase).toBe('report');
  return s;
}

describe('the Prep and Evening waits', () => {
  it('Morning Prep waits for you; with Auto-continue on it opens the stands after AUTO_CONTINUE_SECONDS', () => {
    const s = prep(3);
    expect(run(s, opts(), view(), newWaits()).due).toBeNull();
    const r = run(s, opts({ autoContinue: true }), view(), newWaits());
    expect(r.due).toBe('open');
    expect(r.at).toBeCloseTo(AUTO_CONTINUE_SECONDS);
  });

  it('the Prep wait holds while frozen, under paper, for a scene or an In the Red pause, and keeps what it has waited', () => {
    const s = prep(4), o = opts({ autoContinue: true }), w = newWaits();
    expect(run(s, o, view(), w, 2).due).toBeNull();
    for (const v of [view({ frozen: true }), view({ paper: true })]) expect(run(s, o, v, w).due).toBeNull();
    s.redDays = 1;
    expect(run(s, o, view(), w).due).toBeNull(); // In the Red pauses by its own switch
    expect(run(s, opts({ autoContinue: true, pause: { ...o.pause, red: false } }), view(), w, 1).due).toBeNull();
    s.redDays = 0;
    const r = run(s, o, view(), w);
    expect(r.due).toBe('open');
    expect(r.at).toBeCloseTo(AUTO_CONTINUE_SECONDS - 3); // 2 s, then 1 s with In the Red's pause switched off
    s.scenes = { seen: [], queue: [{ id: 'steward' }] };
    expect(sceneReady(s)).toBe(true);
    expect(run(s, o, view(), newWaits()).due).toBeNull(); // a scene waiting to play holds the morning
    s.scenes = { seen: [], queue: [], playing: { id: 'steward', day: s.day } };
    expect(run(s, o, view(), newWaits()).due).toBeNull(); // and so does one playing
  });

  it('the Evening is a moment once the Ledger is folded: then the night', () => {
    const s = evening(5);
    const r = run(s, opts(), view(), newWaits());
    expect(r.due).toBe('night');
    expect(r.at).toBeCloseTo(EVENING_REAL_SECONDS);
    expect(run(s, opts(), view({ ledger: true }), newWaits()).due).toBeNull(); // the Ledger open holds it
    expect(run(s, opts({ autoContinue: true }), view({ ledger: true }), newWaits()).due).toBe('night'); // unless Auto-continue
    expect(run(s, opts(), view({ speed: 3 }), newWaits()).at).toBeCloseTo(EVENING_REAL_SECONDS / 3); // the knob shortens it
  });

  it('the Evening holds while frozen, under paper or once the run is over; leaving a phase clears its wait', () => {
    const s = evening(6), w = newWaits();
    for (const v of [view({ frozen: true }), view({ paper: true })]) expect(run(s, opts(), v, w).due).toBeNull();
    expect(run(s, opts(), view(), w, 1).due).toBeNull();
    expect(w.evening).toBeCloseTo(1);
    s.outcome = { result: 'lost', how: 'squeezed', day: s.day };
    expect(run(s, opts(), view(), w).due).toBeNull();
    delete s.outcome;
    s.phase = 'night';
    expect(waitStep(s, opts(), view(), w, 1 / 16)).toBeNull();
    expect(w).toEqual({ prep: 0, evening: 0 });
  });
});
