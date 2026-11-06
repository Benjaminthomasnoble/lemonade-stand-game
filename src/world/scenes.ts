// Story beats played in the world instead of told in text (spec "How the
// story is told": short, skippable scenes that wait for a lull). Each scene
// is a tiny timeline: someone walks on, does a thing, says a line, walks off.
// Which scenes a run has seen is kept per run in localStorage, so the saved
// game's shape doesn't change.
import * as THREE from 'three/webgpu';
import { FACTIONS } from '../sim/balance.ts';
import { LOTTIES_CORNER, type GameState } from '../sim/economy.ts';
import type { PlotView } from './bay.ts';
import { hopPose, idlePose, makePerson } from './people.ts';

export type SceneId = 'steward' | 'dex';

export interface SceneHooks {
  say(who: THREE.Object3D, line: string, speaker: string, color: string): void;
  lottie(line: string, react?: 'cheer' | 'fist'): void;
  ring?(): void;
  done?(id: SceneId): void;
}

export interface Scenes {
  update(s: GameState, dt: number, views: Record<string, PlotView>): void;
  /** Start a scene now (tests and debugging). */
  play(id: SceneId): void;
  active(): SceneId | null;
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
interface Ctx { actor: THREE.Group; views: Record<string, PlotView>; hooks: SceneHooks; from: THREE.Vector3; to: THREE.Vector3 }

export function createScenes(scene: THREE.Scene, hooks: SceneHooks): Scenes {
  let current: { id: SceneId; t: number; beats: Beat[]; next: number; ctx: Ctx; walk: { a: THREE.Vector3; b: THREE.Vector3; t0: number; dur: number } | null; base: number } | null = null;
  let forced: SceneId | null = null;

  const start = (id: SceneId, views: Record<string, PlotView>) => {
    const v = views[LOTTIES_CORNER];
    if (!v?.stand) return;
    v.root.updateMatrixWorld(true);
    const at = (x: number, z: number) => v.root.localToWorld(new THREE.Vector3(x, 0.12, z));
    const counter = at(0.4, 1.4), offstage = at(16, 2.2), lottieSpot = at(-1.2, 1.2);
    let actor: THREE.Group, base = 1;
    let beats: Beat[];
    const walkTo = (b: THREE.Vector3, dur: number): Beat['run'] => () => { if (current) current.walk = { a: current.ctx.actor.position.clone(), b, t0: current.t, dur }; };
    if (id === 'steward') {
      const f = FACTIONS.sourwood;
      actor = makePerson(f.color, f.accent);
      // A bowler hat: Sourwood's Stewards read by silhouette.
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.03, 16), new THREE.MeshStandardMaterial({ color: 0x23214a }));
      const crown = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), brim.material);
      brim.position.y = 1.6; crown.position.y = 1.6;
      actor.add(brim, crown);
      beats = [
        { at: 0, run: walkTo(counter, 4) },
        { at: 4.2, run: (c) => hooks.say(c.actor, 'A reminder. From Mrs. Sourwood.', 'Steward', '#5B2A6E') },
        { at: 5.6, run: (c) => { (c.actor.userData.limbs as THREE.Mesh[])[1].rotation.x = -1.4; c.views[LOTTIES_CORNER]?.stand?.knock(); } },
        { at: 6.0, run: (c) => { (c.actor.userData.limbs as THREE.Mesh[])[1].rotation.x = 0; } },
        { at: 6.6, run: () => hooks.lottie('Well. Guess she remembers me.', 'fist') },
        { at: 7.0, run: walkTo(offstage, 4.5) },
        { at: 12, run: () => hooks.lottie('Kid, we\'re gonna need a fence.') },
        { at: 13, run: () => hooks.ring?.() },
      ];
    } else {
      actor = makePerson(0xF7C948, 0x3c5aa6, undefined, 1.12); // lanky Dex
      base = 1.12;
      beats = [
        { at: 0, run: walkTo(lottieSpot, 4) },
        { at: 4.2, run: (c) => hooks.say(c.actor, 'Heard you could use some muscle, Miss Lottie.', 'Dex', '#c99a00') },
        { at: 7.4, run: () => hooks.lottie('You\'re hired. Pay\'s in lemonade.', 'cheer') },
        { at: 10, run: (c) => hooks.say(c.actor, 'Nobody touches the Corner.', 'Dex', '#c99a00') },
        { at: 12.5, run: walkTo(counter.clone().add(new THREE.Vector3(1.8, 0, 0.4)), 1.5) },
      ];
    }
    actor.position.copy(id === 'dex' ? at(-14, 2.2) : offstage);
    scene.add(actor);
    current = { id, t: 0, beats, next: 0, ctx: { actor, views, hooks, from: offstage, to: counter }, walk: null, base };
  };

  return {
    play(id) { forced = id; },
    active: () => current?.id ?? null,
    update(s, dt, views) {
      if (!current) {
        if (forced) { const f = forced; forced = null; start(f, views); return; }
        if (s.phase !== 'open') return;
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
      const a = c.ctx.actor;
      if (c.walk) {
        const k = Math.min(1, (c.t - c.walk.t0) / c.walk.dur);
        a.position.lerpVectors(c.walk.a, c.walk.b, k);
        const d = c.walk.b.clone().sub(c.walk.a);
        a.rotation.y = Math.atan2(d.x, d.z);
        const ph = c.t * 9;
        const limbs = a.userData.limbs as THREE.Mesh[];
        limbs[0].rotation.x = Math.sin(ph) * 0.6;
        if (k < 1) { limbs[1].rotation.x = -Math.sin(ph) * 0.6; hopPose(a, ph, c.base, 0.12, c.id === 'dex' ? 1.6 : 0.6); }
        if (k >= 1) { c.walk = null; a.position.y = 0.12; a.rotation.y = c.id === 'dex' ? Math.PI * 0.75 : Math.PI; }
      } else if (c.id !== 'dex') idlePose(a, c.t, c.base);
      if (c.next >= c.beats.length && !c.walk) {
        scene.remove(a); // Dex goes on to his guard post, drawn by the bay
        hooks.done?.(c.id);
        current = null;
      }
    },
  };
}
