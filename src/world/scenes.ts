// Story beats played in the world instead of told in text (spec "How the
// story is told": short, skippable scenes that wait for a lull). Each scene
// is a tiny timeline: someone walks on, does a thing, says a line, walks off.
// Which scenes a run has seen is kept per run in localStorage, so the saved
// game's shape doesn't change.
import * as THREE from 'three';
import { LOTTIES_CORNER, type GameState } from '../sim/economy.ts';
import type { PlotView } from './bay.ts';
import { kit } from './clay/kit.ts';
import { makeTownsfolk } from './clay/cast.ts';
import { GAIT_OF, gait, heroDetail, type Figure } from './clay/figure.ts';

export type SceneId = 'steward' | 'dex';

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
  let current: { id: SceneId; t: number; beats: Beat[]; next: number; ctx: Ctx; walk: { a: THREE.Vector3; b: THREE.Vector3; t0: number; dur: number } | null; base: number; f: number } | null = null;
  let forced: SceneId | null = null;

  const start = (id: SceneId, views: Record<string, PlotView>) => {
    const v = views[LOTTIES_CORNER];
    if (!v?.stand) return;
    v.root.updateMatrixWorld(true);
    const at = (x: number, z: number) => v.root.localToWorld(new THREE.Vector3(x, 0.12, z));
    const counter = at(0.4, 1.4), offstage = at(16, 2.2), lottieSpot = at(-1.2, 1.2);
    let fig: Figure, base = 1;
    let beats: Beat[];
    const walkTo = (b: THREE.Vector3, dur: number): Beat['run'] => () => { if (current) current.walk = { a: current.ctx.actor.position.clone(), b, t0: current.t, dur }; };
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
    active: () => current?.id ?? null,
    stop() { forced = null; if (current) scene.remove(current.ctx.actor); current = null; },
    update(s, dt, views) {
      if (!current) {
        if (forced) { const f = forced; forced = null; start(f, views); return; }
        if (hooks.driven || s.phase !== 'open') return;
        const done = seen(s.runId);
        const minute = s.minute;
        // Day 5, mid-morning: the Steward's "reminder" (spec Act 1).
        if (s.day === 5 && minute > 10 * 60 && !done.has('steward') && s.settings.mode === 'campaign') { markSeen(s.runId, 'steward'); start('steward', views); }
        // Dex turns up the day he joins.
        else if (s.day >= 6 && !done.has('dex') && s.guards.some((g) => g.name === 'Dex Moody') && minute > 9 * 60) { markSeen(s.runId, 'dex'); start('dex', views); }
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
          if (k >= 1) { c.walk = null; a.position.y = 0.12; a.rotation.y = c.id === 'dex' ? Math.PI * 0.75 : Math.PI; }
        } else {
          const b = Math.sin(tq * 3.2);
          fig.pose({ sq: (b * 0.5 + 0.5) * 0.03, headYaw: Math.sin(tq * 0.6) * 0.2, aR: a.userData.knock ? [-1.4, -0.12] : undefined }, f);
        }
      }
      if (c.next >= c.beats.length && !c.walk) {
        scene.remove(a); // Dex goes on to his guard post, drawn by the bay
        hooks.done?.(c.id);
        current = null;
      }
    },
  };
}
