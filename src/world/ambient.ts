// Street life between the stands: rival henchmen loitering on their own turf,
// Smoothie Bros jogging in formation on the Boardwalk, Captain Squawk
// circling Lottie's Corner (and stealing a lemon now and then), gulls over
// the bay and a dog chasing a ball on Maple Row. All of it is presentation:
// it reads the game state and never changes it.
import { beatOffset, bob } from './beat.ts';
import * as THREE from 'three';
import type { RivalId } from '../sim/balance.ts';
import { PLOTS, PLOT_BY_ID, LOTTIES_CORNER, type GameState } from '../sim/economy.ts';
import { threatLevel } from '../sim/crew.ts';
import type { PlotView } from './bay.ts';
import { MOTION } from './people.ts';
import { gull, dog } from './clay/creatures.ts';
import { clayFrom, kit } from './clay/kit.ts';
import { makeCrew } from './clay/cast.ts';
import { crowdDetail, GAIT_OF, gait, type Figure } from './clay/figure.ts';
import { createFigureBatch } from './clay/figureBatch.ts';

const mat = (color: number, roughness = 0.8) => clayFrom(color, roughness);

/** Only bother near what the camera looks at. */
const NEAR = 42;
const HENCH_POOL = 14;

export interface AmbientEvents {
  /** Captain Squawk grabbed a lemon off a stand's table (the Corner's, or the stand his event is robbing). */
  onSquawkSteal?(gull: THREE.Object3D, plot: string): void;
  /** A henchman glares at your stand (the world can put a bubble over them). */
  onGlare?(who: THREE.Object3D, rival: RivalId): void;
}

export interface Ambient {
  update(s: GameState, dt: number, time: number, target: THREE.Vector3, views: Record<string, PlotView>): void;
  squawk: THREE.Object3D;
}

function flap(g: THREE.Object3D, t: number, speed = 9) {
  const { wl, wr } = g.userData as { wl: THREE.Mesh; wr: THREE.Mesh };
  const a = Math.sin(t * speed) * 0.6 * Math.max(0.3, MOTION);
  wl.rotation.z = a;
  wr.rotation.z = -a;
}

export function createAmbient(scene: THREE.Scene, events: AmbientEvents = {}): Ambient {
  // Henchmen and the jogging Bros are crowd-detail figures drawn through one batch, posed on twos.
  const batch = createFigureBatch(kit().fig, { instances: 256, vertices: 60_000, indices: 180_000 });
  batch.mesh.name = 'ambient-figures';
  scene.add(batch.mesh);
  let lastF = -1;

  // ---- henchmen loitering at rival stands ----
  const hench = Array.from({ length: HENCH_POOL }, () => ({ obj: null as THREE.Group | null, fig: null as Figure | null, rival: null as RivalId | null, plot: '', slot: 0, glare: 0 }));
  let assignT = 0;

  // ---- Smoothie Bros jogging in formation on the Boardwalk ----
  const broFigs = [1, 2, 3].map((seed) => {
    const fig = makeCrew('blenders', { weapon: 'fists', seed }, kit().fig, { detail: crowdDetail() }); // V-shaped bros on tiny legs
    fig.root.visible = false;
    scene.add(fig.root);
    batch.track(fig.root);
    return fig;
  });
  const bros = broFigs.map((f) => f.root);
  const boardwalk = PLOTS.filter((p) => p.district === 'boardwalk' && p.side === 0);
  const bwX0 = Math.min(...boardwalk.map((p) => p.x)), bwX1 = Math.max(...boardwalk.map((p) => p.x));
  const bwZ = boardwalk.length ? boardwalk[0].streetZ - 5.6 : 0;
  let jog = 0;

  // ---- Captain Squawk and the gulls ----
  const squawk = gull(true);
  squawk.scale.setScalar(0.75);
  scene.add(squawk);
  const gulls = [0, 1, 2, 3].map(() => { const g = gull(false); g.scale.setScalar(0.8); scene.add(g); return g; });
  let steal = { t: -1, next: 40 };
  let squawkHome = LOTTIES_CORNER;

  // ---- a dog chasing a ball on Maple Row ----
  const pup = dog();
  scene.add(pup);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), mat(0xE8704F, 0.4));
  ball.castShadow = true;
  scene.add(ball);
  const corner = PLOT_BY_ID[LOTTIES_CORNER];
  let fetch = { from: new THREE.Vector3(), to: new THREE.Vector3(), t: 0 };
  const newThrow = () => {
    const x0 = corner.x + 10 + Math.random() * 6, x1 = x0 + (Math.random() < 0.5 ? -1 : 1) * (5 + Math.random() * 4);
    const z = corner.z + (corner.side === 0 ? -2 : 2) + (Math.random() - 0.5) * 3;
    fetch = { from: pup.position.clone().setY(0), to: new THREE.Vector3(x1, 0, z), t: 0 };
    if (fetch.from.lengthSq() === 0) fetch.from.set(x0, 0, z);
  };
  newThrow();

  const tmp = new THREE.Vector3();
  return {
    squawk,
    update(s, dt, time, target, views) {
      const night = s.phase === 'report' || s.phase === 'night';
      const threat = threatLevel(s);

      // Henchmen: one per nearby rival stand, two from Threat 3, gone home at night.
      assignT -= dt;
      if (assignT <= 0) {
        assignT = 1;
        const want: { plot: string; rival: RivalId; slot: number }[] = [];
        if (!night) {
          for (const p of PLOTS) {
            const ps = s.plots[p.id];
            if (!ps.stand || !ps.owner || ps.owner === 'player' || ps.stand.wrecked) continue;
            if (Math.hypot(p.x - target.x, p.z - target.z) > NEAR) continue;
            for (let k = 0; k < (threat >= 3 ? 2 : 1); k++) want.push({ plot: p.id, rival: ps.owner as RivalId, slot: k });
          }
        }
        want.length = Math.min(want.length, HENCH_POOL);
        for (const h of hench) {
          const i = want.findIndex((w) => w.plot === h.plot && w.slot === h.slot && w.rival === h.rival);
          if (i >= 0) { want.splice(i, 1); continue; }
          if (h.obj) { batch.untrack(h.obj); scene.remove(h.obj); h.obj = null; h.fig = null; h.rival = null; h.plot = ''; }
        }
        for (const h of hench) {
          if (h.obj || !want.length) continue;
          const w = want.shift()!;
          h.fig = makeCrew(w.rival, { weapon: 'clubs', seed: w.slot + 1 }, kit().fig, { detail: crowdDetail() });
          h.obj = h.fig.root;
          h.rival = w.rival; h.plot = w.plot; h.slot = w.slot; h.glare = 3 + Math.random() * 8;
          const v = views[w.plot];
          if (v) {
            v.root.updateMatrixWorld(true);
            tmp.set((w.slot ? 1 : -1) * 2.4, 0.12, 1.9);
            h.obj.position.copy(v.root.localToWorld(tmp));
            h.obj.position.y = 0.12;
          }
          scene.add(h.obj);
          batch.track(h.obj);
        }
      }
      const f = Math.floor(time * 12), step = f !== lastF;
      lastF = f;
      for (const h of hench) {
        if (!h.obj || !h.rival) continue;
        // Arms folded, a bored sway on twos and on the music's beat (FizzCo all on the same one), and now and then a long hard look at your nearest stand.
        if (step && h.fig) { const b = bob(beatOffset(h.obj.id, h.rival === 'fizzco')) * 2 - 1; /* on the beat; FizzCo in lockstep */ h.fig.pose({ sq: (b * 0.5 + 0.5) * 0.04 * MOTION, sway: b * 0.04 * MOTION, aL: [-1.2, 0.5], aR: [-1.2, -0.5], headTilt: 0.06 }, f); }
        h.glare -= dt;
        let mine: { x: number; z: number } | null = null, best = 30;
        for (const p of PLOTS) {
          if (s.plots[p.id].owner !== 'player' || !s.plots[p.id].stand) continue;
          const d = Math.hypot(p.x - h.obj.position.x, p.z - h.obj.position.z);
          if (d < best) { best = d; mine = p; }
        }
        const glaring = h.glare < 0 && h.glare > -2.5 && mine;
        const face = glaring && mine ? Math.atan2(mine.x - h.obj.position.x, mine.z - h.obj.position.z) : Math.sin(time * 0.3 + h.slot * 2) * 0.8 + (h.slot ? 0.4 : -0.4);
        h.obj.rotation.y += (face - h.obj.rotation.y) * Math.min(1, dt * 4);
        if (h.glare < -2.5) h.glare = 8 + Math.random() * 10;
        if (glaring && h.glare > -dt * 1.5) events.onGlare?.(h.obj, h.rival);
      }

      // Smoothie Bros: three visors jogging in a line along the Boardwalk.
      const bwNear = boardwalk.length > 0 && !night && Math.abs(target.z - bwZ) < NEAR && target.x > bwX0 - NEAR && target.x < bwX1 + NEAR;
      jog += dt;
      const span = Math.max(1, bwX1 - bwX0);
      bros.forEach((b, i) => {
        b.visible = bwNear;
        if (!bwNear) return;
        const u = ((jog * 3.2) / span + i * 0.012) % 2;
        const dir = u < 1 ? 1 : -1;
        const x = bwX0 + (u < 1 ? u : 2 - u) * span - dir * i * 1.1;
        b.position.set(x, 0.12, bwZ + (i % 2 ? 0.5 : -0.5));
        b.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        // their own hop gait, on twos, in step more or less
        if (step) gait(broFigs[i], GAIT_OF.vee, (Math.floor(jog * 12) / 12) * 11 + i * 0.4, f, f / 12);
      });
      if (step) batch.sync();

      // Captain Squawk circles the Corner; every so often he dives for a lemon. While his event is live
      // (sim/happenings.ts captainSquawk) he circles the stand he's robbing and dives at that one instead.
      const robbed = s.world?.events?.on.find((x) => x.id === 'captainSquawk' && x.live)?.plots?.[0];
      const homeId = robbed && views[robbed] ? robbed : LOTTIES_CORNER;
      if (homeId !== squawkHome) { squawkHome = homeId; if (robbed && steal.t < 0) steal.next = Math.min(steal.next, 2); } // a new victim: straight at it
      const cv = views[homeId];
      const home = cv ? cv.root.localToWorld(tmp.set(0, 0, 0.3)).clone() : new THREE.Vector3(corner.x, 0, corner.z);
      const nearEnough = robbed ? NEAR * 2 : NEAR; // his robbery is worth showing from further out
      const table = home.clone().setY(1.0);
      if (s.phase === 'open') steal.next -= dt;
      if (steal.t < 0 && steal.next <= 0 && Math.hypot(home.x - target.x, home.z - target.z) < nearEnough) { steal = { t: 0, next: (robbed ? 20 : 50) + Math.random() * (robbed ? 25 : 60) }; }
      const lemon = (squawk.userData as { lemon: THREE.Mesh }).lemon;
      if (squawk.userData.piloted) { steal.t = -1; lemon.visible = false; }
      else if (steal.t >= 0) {
        steal.t += dt;
        const t = steal.t;
        const orbit = new THREE.Vector3(home.x + Math.cos(time * 0.5) * 9, 11, home.z + Math.sin(time * 0.5) * 9);
        let pos: THREE.Vector3;
        if (t < 1.2) pos = orbit.clone().lerp(table, t / 1.2); // dive
        else if (t < 1.6) { pos = table.clone(); if (!lemon.visible) { lemon.visible = true; events.onSquawkSteal?.(squawk, homeId); } }
        else if (t < 4.5) pos = table.clone().lerp(new THREE.Vector3(home.x + 30, 14, home.z - 25), (t - 1.6) / 2.9); // off with it
        else { pos = new THREE.Vector3(home.x + 30, 14, home.z - 25).lerp(orbit, Math.min(1, (t - 4.5) / 3)); lemon.visible = t < 6; if (t > 7.5) steal.t = -1; }
        const dir = pos.clone().sub(squawk.position);
        if (dir.lengthSq() > 1e-6) squawk.rotation.y = Math.atan2(dir.x, dir.z);
        squawk.position.copy(pos);
        flap(squawk, time, t > 1.2 && t < 1.6 ? 3 : 14);
      } else {
        const a = time * 0.5;
        squawk.position.set(home.x + Math.cos(a) * 9, 11 + Math.sin(time * 1.3) * 0.4, home.z + Math.sin(a) * 9);
        squawk.rotation.y = -a; // tangent to the circle
        squawk.rotation.z = 0.25;
        flap(squawk, time, Math.sin(time * 0.7) > 0.3 ? 0 : 8); // glide, then a few flaps
      }

      // Gulls wheel high over wherever you're looking.
      gulls.forEach((g, i) => {
        const a = time * (0.25 + i * 0.05) + i * 1.7;
        const r = 14 + i * 5;
        g.position.set(target.x + Math.cos(a) * r, 16 + i * 2 + Math.sin(time + i) * 0.6, target.z + Math.sin(a) * r);
        g.rotation.y = -a;
        g.rotation.z = 0.3;
        flap(g, time + i, Math.sin(time * 0.6 + i) > 0 ? 0 : 7);
        g.visible = !night;
      });

      // The dog: runs to where the ball lands, picks it up, trots back, again.
      fetch.t += dt / 2.2;
      const k = Math.min(1, fetch.t);
      const ballK = Math.min(1, fetch.t * 1.8);
      ball.position.lerpVectors(fetch.from, fetch.to, ballK);
      ball.position.y = 0.08 + Math.sin(ballK * Math.PI) * 2.2;
      pup.position.lerpVectors(fetch.from, fetch.to, k);
      const run = fetch.to.clone().sub(fetch.from);
      pup.rotation.y = Math.atan2(run.x, run.z);
      const { tail, legs } = pup.userData as { tail: THREE.Mesh; legs: THREE.Mesh[] };
      tail.rotation.z = Math.sin(time * 18) * 0.6 * MOTION;
      const gallop = k < 1 ? Math.sin(time * 16) : 0;
      legs.forEach((l, i) => { l.rotation.x = (i < 2 ? 1 : -1) * gallop * 0.7; });
      pup.position.y = k < 1 ? Math.abs(gallop) * 0.12 * MOTION : 0;
      if (k >= 1) ball.position.copy(pup.position).add(new THREE.Vector3(0, 0.46, 0).add(run.normalize().multiplyScalar(0.45)));
      if (fetch.t > 1.6) newThrow();
      const showPup = !night && Math.hypot(pup.position.x - target.x, pup.position.z - target.z) < NEAR;
      pup.visible = ball.visible = showPup;
    },
  };
}
