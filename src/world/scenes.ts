// Story beats played in the world instead of told in text (spec "How the
// story is told": short, skippable scenes that wait for a lull). Each scene
// is a tiny timeline: someone walks on, does a thing, says a line, walks off.
// The Steward and Dex have their own scripts; the townsfolk (Marisol, Skip,
// Benny, Sheriff Budd, Mayor Fontaine) are staged by the story scene's speaker
// (a visit), so any story scene with a speaker gets its figure.
// Which scenes a run has seen is kept per run in localStorage, so the saved
// game's shape doesn't change.
import * as THREE from 'three';
import { LESSON_DAY, LOTTIES_CORNER, type GameState } from '../sim/economy.ts';
import type { SceneLine, Speaker } from '../sim/scenes.ts';
import type { PlotView } from './bay.ts';
import { kit } from './clay/kit.ts';
import { makeTownsfolk, signaturePose, TOWNSFOLK } from './clay/cast.ts';
import { GAIT_OF, gait, heroDetail, type Figure } from './clay/figure.ts';

export type SceneId = 'steward' | 'dex' | 'visit';
/** A townsperson's visit, from the story scene's speaker: they walk on to the plot, say their lines and walk off. */
export interface Visit { who: Speaker; plot: string; lines: SceneLine[] }

export interface SceneHooks {
  say(who: THREE.Object3D, line: string, speaker: string, color: string): void;
  lottie(line: string, react?: 'cheer' | 'fist'): void;
  ring?(): void;
  done?(id: SceneId): void;
  /** The story queues the scenes (src/sim/scenes.ts) and calls play(): no triggers of this module's own. */
  driven?: boolean;
}

export interface Scenes {
  update(s: GameState, dt: number, views: Record<string, PlotView>): void;
  /** Start a scene now (tests and debugging). */
  play(id: SceneId): void;
  /** Stage a story scene's speaker now: their clay figure, at the scene's plot. */
  visit(v: Visit): void;
  active(): SceneId | null;
  /** Cut the playing scene short (skipped): the actor leaves at once, no done hook. */
  stop(): void;
}

const key = (runId: string | undefined) => `lemonade-stand-wars/scenes/${runId ?? 'run'}`;
function seen(runId: string | undefined): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(key(runId)) ?? '[]') as string[]); } catch { return new Set(); }
}
function markSeen(runId: string | undefined, id: string) {
  const s = seen(runId); s.add(id);
  try { localStorage.setItem(key(runId), JSON.stringify([...s])); } catch { /* private mode */ }
}

interface Beat { at: number; run: (ctx: Ctx) => void }
interface Ctx { actor: THREE.Group; fig: Figure; views: Record<string, PlotView>; hooks: SceneHooks; from: THREE.Vector3; to: THREE.Vector3 }

export function createScenes(scene: THREE.Scene, hooks: SceneHooks): Scenes {
  let current: {
    id: SceneId; t: number; beats: Beat[]; next: number; ctx: Ctx; walk: { a: THREE.Vector3; b: THREE.Vector3; t0: number; dur: number } | null; base: number; f: number;
    /** A visitor: who they are (their signature pose holds all scene long) and which way they face once there. */
    who?: Speaker; face?: number;
  } | null = null;
  let forced: SceneId | null = null;
  let forcedVisit: Visit | null = null;
  const walkTo = (b: THREE.Vector3, dur: number): Beat['run'] => () => { if (current) current.walk = { a: current.ctx.actor.position.clone(), b, t0: current.t, dur }; };

  /** A townsperson walks along the sidewalk to the plot (beside the counter if there's a stand), says the scene's lines, and leaves. */
  const startVisit = (v: Visit, views: Record<string, PlotView>) => {
    const view = views[v.plot];
    if (!view) return;
    view.root.updateMatrixWorld(true);
    const at = (x: number, z: number) => view.root.localToWorld(new THREE.Vector3(x, 0.12, z));
    const spot = view.stand ? at(1.6, 1.5) : at(0, 0.6), offstage = at(16, 2.2), street = at(0, 1).sub(at(0, 0));
    const fig = makeTownsfolk(v.who, kit().fig, { detail: heroDetail() });
    const color = TOWNSFOLK[v.who].shirt;
    const lines = [...v.lines].sort((a, b) => a.at - b.at);
    const last = lines.length ? lines[lines.length - 1].at : 0;
    const beats: Beat[] = [
      { at: 0, run: walkTo(spot, 3.4) },
      ...lines.map((l): Beat => ({ at: l.at, run: (c) => (l.who === 'Lottie' ? hooks.lottie(l.text) : hooks.say(c.actor, l.text, l.who, color)) })),
      { at: Math.max(last + 2.8, 3.8), run: walkTo(offstage, 4) },
    ].sort((a, b) => a.at - b.at);
    const actor = fig.root;
    actor.position.copy(offstage);
    scene.add(actor);
    current = { id: 'visit', t: 0, beats, next: 0, ctx: { actor, fig, views, hooks, from: offstage, to: spot }, walk: null, base: 1, f: -1, who: v.who, face: Math.atan2(street.x, street.z) };
  };

  const start = (id: SceneId, views: Record<string, PlotView>) => {
    const v = views[LOTTIES_CORNER];
    if (!v?.stand || id === 'visit') return;
    v.root.updateMatrixWorld(true);
    const at = (x: number, z: number) => v.root.localToWorld(new THREE.Vector3(x, 0.12, z));
    const counter = at(0.4, 1.4), offstage = at(16, 2.2), lottieSpot = at(-1.2, 1.2);
    let fig: Figure, base = 1;
    let beats: Beat[];
    if (id === 'steward') {
      // A Sourwood Steward: stilt-thin, high white collar, white gloves, bowler and cane.
      fig = makeTownsfolk('steward', kit().fig, { detail: heroDetail() });
      beats = [
        { at: 0, run: walkTo(counter, 4) },
        { at: 4.2, run: (c) => hooks.say(c.actor, 'A reminder. From Mrs. Sourwood.', 'Steward', '#5B2A6E') },
        { at: 5.6, run: (c) => { c.actor.userData.knock = true; c.views[LOTTIES_CORNER]?.stand?.knock(); } },
        { at: 6.0, run: (c) => { c.actor.userData.knock = false; } },
        { at: 6.6, run: () => hooks.lottie('Well. Guess she remembers me.', 'fist') },
        { at: 7.0, run: walkTo(offstage, 4.5) },
        { at: 12, run: () => hooks.lottie('Kid, we\'re gonna need a fence.') },
        { at: 13, run: () => hooks.ring?.() },
      ];
    } else {
      fig = makeTownsfolk('dex', kit().fig, { detail: heroDetail() }); // lanky Dex, 3 heads tall, arms crossed
      base = 1;
      beats = [
        { at: 0, run: walkTo(lottieSpot, 4) },
        { at: 4.2, run: (c) => hooks.say(c.actor, 'Heard you could use some muscle, Miss Lottie.', 'Dex', '#c99a00') },
        { at: 7.4, run: () => hooks.lottie('You\'re hired. Pay\'s in lemonade.', 'cheer') },
        { at: 10, run: (c) => hooks.say(c.actor, 'Nobody touches the Corner.', 'Dex', '#c99a00') },
        { at: 12.5, run: walkTo(counter.clone().add(new THREE.Vector3(1.8, 0, 0.4)), 1.5) },
      ];
    }
    const actor = fig.root;
    actor.position.copy(id === 'dex' ? at(-14, 2.2) : offstage);
    scene.add(actor);
    current = { id, t: 0, beats, next: 0, ctx: { actor, fig, views, hooks, from: offstage, to: counter }, walk: null, base, f: -1 };
  };

  return {
    play(id) { forced = id; },
    visit(v) { forcedVisit = v; },
    active: () => current?.id ?? null,
    stop() { forced = null; forcedVisit = null; if (current) scene.remove(current.ctx.actor); current = null; },
    update(s, dt, views) {
      if (!current) {
        if (forcedVisit) { const v = forcedVisit; forcedVisit = null; startVisit(v, views); return; }
        if (forced) { const f = forced; forced = null; start(f, views); return; }
        if (hooks.driven || s.phase !== 'open') return;
        const done = seen(s.runId);
        const minute = s.minute;
        // Day 3 (the fence's lesson), mid-morning: the Steward's "reminder" (spec Act 1).
        if (s.day === LESSON_DAY.defense && minute > 10 * 60 && !done.has('steward') && s.settings.mode === 'campaign') { markSeen(s.runId, 'steward'); start('steward', views); }
        // Dex turns up the day he joins.
        else if (s.day >= LESSON_DAY.crew && !done.has('dex') && s.guards.some((g) => g.name === 'Dex Moody') && minute > 9 * 60) { markSeen(s.runId, 'dex'); start('dex', views); }
        return;
      }
      const c = current;
      c.t += dt;
      while (c.next < c.beats.length && c.beats[c.next].at <= c.t) c.beats[c.next++].run(c.ctx);
      const a = c.ctx.actor, fig = c.ctx.fig;
      // Clay poses on twos: the actor moves, walks in their family's gait (the Steward glides,
      // Dex bobs) and blinks only when the twos frame changes.
      const f = Math.floor(c.t * 12), tq = f / 12;
      if (f !== c.f) {
        c.f = f;
        if (c.walk) {
          const k = Math.min(1, (tq - c.walk.t0) / c.walk.dur);
          a.position.lerpVectors(c.walk.a, c.walk.b, k);
          const d = c.walk.b.clone().sub(c.walk.a);
          a.rotation.y = Math.atan2(d.x, d.z);
          gait(fig, GAIT_OF[fig.sp.kind], tq * 9, f, tq);
          if (k >= 1) { c.walk = null; a.position.y = 0.12; a.rotation.y = c.face ?? (c.id === 'dex' ? Math.PI * 0.75 : Math.PI); }
        } else {
          const b = Math.sin(tq * 3.2);
          fig.pose({ sq: (b * 0.5 + 0.5) * 0.03, headYaw: Math.sin(tq * 0.6) * 0.2, aR: a.userData.knock ? [-1.4, -0.12] : undefined }, f);
        }
        if (c.who) signaturePose(fig, c.who); // Benny's megaphone never comes down, walking or not
      }
      if (c.next >= c.beats.length && !c.walk) {
        scene.remove(a); // Dex goes on to his guard post, drawn by the bay
        hooks.done?.(c.id);
        current = null;
      }
    },
  };
}
