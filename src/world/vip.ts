// Pickup moments (canon section 15; spec "VIP arrivals"): a chunky clay chopper
// swings down on its fishing line to your pad, flattening the grass into
// rings, loads and lifts off; or a carved-soap ship pushes its clay wake up to
// your pier, toots the theme's horn call, loads and steams away. Purely visual:
// the sim has already paid out by the time this plays.
import * as THREE from 'three';
import type { PlotView } from './bay.ts';
import { chopper, ship, paintFor, type Chopper, type Ship, type ShipKind } from './clay/rides.ts';
import { createFx } from './clay/fx.ts';
import { kit } from './clay/kit.ts';
import { PLINTH } from './diorama.ts';
import { SEA_X, SEA_Z } from '../sim/map.ts';

export interface VipView {
  /**
   * `level` is the facility tier: Pad, Helipad, Heliport size the chopper (small, bigger, biggest);
   * Jetty, Pier, Cargo Terminal choose the ship. `client` picks the chopper's paint job.
   */
  play(kind: 'heli' | 'ship', view: PlotView, big: boolean, level?: number, client?: string): void;
  update(dt: number): void;
  active(): boolean;
  where(): number[] | null;
}

export interface VipEvents {
  /** A ship's horn: the first three notes of Lottie's Theme (F-A-D). */
  onHorn?(): void;
}

const SHIPS: ShipKind[] = ['yacht', 'cruise', 'freighter'];
const LINE_TOP = 70; // the fishing line runs up out of shot

interface Job {
  kind: 'heli' | 'ship';
  obj: THREE.Group;
  heli?: Chopper;
  ship?: Ship;
  t: number;
  path: (t: number) => { pos: THREE.Vector3; yaw: number; sq: number; tilt: number; grow?: number };
  length: number;
  pad: THREE.Vector3;
  horns: number[];
  /** Choppers: the cap's rim radius and the lawn under it (the wash flattens the grass outside the rim). */
  ring?: number;
  ground?: THREE.Vector3;
  /** Toward the street: the wash flattens no grass that way (it's pavement). */
  street?: THREE.Vector3;
  /** Ships: the model's full scale (it grows in from the far water and shrinks away). */
  scale?: number;
}

export function createVip(scene: THREE.Scene, events: VipEvents = {}): VipView {
  let job: Job | null = null;
  const fx = createFx(scene);
  let lastF = -1, ringAt = 0, splashAt = 0;
  const top = new THREE.Vector3();
  const prev = new THREE.Vector3();

  const drop = () => {
    if (!job) return;
    scene.remove(job.obj);
    if (job.heli) { scene.remove(job.heli.line); job.heli.line.geometry.dispose(); (job.heli.line.material as THREE.Material).dispose(); }
    // each pickup builds its own ride: free its geometry when it leaves
    job.obj.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    job = null;
  };
  /** Keep a point on the resin sea: inside the plinth, `margin` in from its edge. */
  const onPlinth = (p: THREE.Vector3, margin: number) => {
    p.x = THREE.MathUtils.clamp(p.x, PLINTH.cx - PLINTH.w / 2 + margin, PLINTH.cx + PLINTH.w / 2 - margin);
    p.z = THREE.MathUtils.clamp(p.z, PLINTH.cz - PLINTH.d / 2 + margin, PLINTH.cz + PLINTH.d / 2 - margin);
    return p;
  };
  const bez = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, t: number, out = new THREE.Vector3()) => {
    const u = 1 - t;
    return out.set(u * u * a.x + 2 * u * t * b.x + t * t * c.x, 0, u * u * a.z + 2 * u * t * b.z + t * t * c.z);
  };

  return {
    play(kind, view, big, level = 1, client = '') {
      drop();
      fx.clear();
      const at = (x: number, y: number, z: number) => view.root.localToWorld(new THREE.Vector3(x, y, z));
      const yaw0 = view.root.rotation.y;
      if (kind === 'heli') {
        // Pad: a small chopper; Helipad: a bigger one; Heliport: the biggest
        const lv = Math.max(1, Math.min(3, level));
        const heli = chopper(paintFor(client), [1.25, 1.5, 1.75][lv - 1]);
        const deck = lv >= 2 ? 0.9 : 0;
        const pad = at(0, deck + 0.45, -2.5); // on the bottle cap's top (the cap sits on a raised deck from Helipad up)
        const capR = 3 + lv * 0.6;
        const from = at(-60, 40, -80), to = at(70, 45, -90);
        const hover = pad.clone().setY(pad.y + 6);
        // swing in 4 s and hover, settle 1.5 s, load 4 s, lift off 4 s
        const path = (t: number) => {
          if (t < 4) { const k = t / 4, e = 1 - (1 - k) ** 2; return { pos: from.clone().lerp(hover, e), yaw: yaw0 + 0.6 * (1 - k), sq: 0, tilt: 0.25 * (1 - k) }; }
          if (t < 5.5) { const k = (t - 4) / 1.5; return { pos: pad.clone().setY(pad.y + 6 * (1 - k * k)), yaw: yaw0, sq: 0, tilt: 0 }; }
          // touchdown: squash and spring back
          if (t < 6.1) { const k = (t - 5.5) / 0.6; return { pos: pad.clone(), yaw: yaw0, sq: Math.sin(k * Math.PI) * 0.14 * (1 - k * 0.5), tilt: 0 }; }
          if (t < 9.5) return { pos: pad.clone(), yaw: yaw0, sq: 0, tilt: 0 };
          // launch: crouch, stretch up, then away
          if (t < 9.8) { const k = (t - 9.5) / 0.3; return { pos: pad.clone(), yaw: yaw0, sq: 0.1 * Math.sin(k * Math.PI), tilt: 0 }; }
          const k = (t - 9.8) / 3.7, e = k * k;
          return { pos: pad.clone().setY(pad.y + 8 * Math.min(1, k * 2)).lerp(to, e), yaw: yaw0 - 0.8 * k, sq: -0.12 * Math.max(0, 1 - k * 3), tilt: -0.2 * Math.min(1, k * 3) };
        };
        scene.add(heli.group, heli.line);
        job = { kind, obj: heli.group, heli, t: 0, path, length: 13.5, pad, horns: [], ring: capR, ground: at(0, 0, -2.5), street: at(0, 0, 1).sub(at(0, 0, 0)).normalize() };
      } else {
        const sk = SHIPS[Math.max(0, Math.min(2, level - 1))];
        const sh = ship(big && sk === 'yacht' ? 'cruise' : sk);
        const scale = 2.2; // the soap ships are built small; scale them to the old berths
        sh.group.scale.setScalar(scale);
        const len = sh.length * scale;
        const pierW = 3 + level;
        const side = pierW / 2 + (sh.beam * scale) / 2 + 0.4;
        const margin = len / 2 + 3;
        // Which water? The pier's own way out if it points at the sea, else the nearest shore (the Yacht Marina's
        // water is east of it). The ship moors at the pier head, its bow 5 units past the foam line, beside the pier's line.
        const root = at(0, 0, 0), pierDir = at(0, 0, -1).sub(root).normalize();
        const shores = [
          { dir: new THREE.Vector3(0, 0, 1), dist: SEA_Z - root.z },
          { dir: new THREE.Vector3(1, 0, 0), dist: SEA_X - root.x },
        ].filter((c) => c.dist > -20);
        const pick = shores.find((c) => c.dir.dot(pierDir) > 0.7 && c.dist < 60) ?? shores.sort((a, b) => a.dist - b.dist)[0] ?? { dir: pierDir, dist: 12 };
        const seaward = pick.dir.clone();
        const perp = new THREE.Vector3(-seaward.z, 0, seaward.x);
        // The town pins a turned dock's tip (pier.userData.moor, world space): moor alongside it, bow 4 back from the tip.
        let moor: THREE.Vector3 | undefined;
        view.root.traverse((o) => { if (!moor && o.userData.moor instanceof THREE.Vector3) moor = o.userData.moor; });
        if (moor) {
          const out = moor.clone().sub(root).setY(0);
          const best = shores.slice().sort((a, b) => b.dir.dot(out) - a.dir.dot(out))[0];
          if (best) seaward.copy(best.dir);
          perp.set(-seaward.z, 0, seaward.x);
        }
        // Beside a pinned dock, take the -perp side: the town's own soap yacht lies on the +perp side of the Yacht Marina pier.
        const lateral = moor ? -side : side * (Math.sign(at(1, 0, 0).sub(root).dot(perp)) || 1); // else the same side of the pier as before
        const berth = onPlinth(moor
          ? moor.clone().setY(root.y).addScaledVector(seaward, len / 2 - 4).addScaledVector(perp, lateral)
          : root.clone().addScaledVector(seaward, Math.max(0, pick.dist) + 5 + len / 2).addScaledVector(perp, lateral), margin);
        const moorYaw = Math.atan2(-seaward.x, -seaward.z); // bow toward the land
        // The whole voyage stays on the resin: it slides in along the coast, swings round to the berth,
        // and leaves the other way, growing out of the far water and shrinking back into it (never over the tablecloth).
        const along = perp;
        const turn = onPlinth(berth.clone().addScaledVector(seaward, len * 0.9), margin);
        const inFrom = onPlinth(turn.clone().addScaledVector(along, 70).addScaledVector(seaward, 6), margin);
        const outTo = onPlinth(turn.clone().addScaledVector(along, -70).addScaledVector(seaward, 6), margin);
        const tan = new THREE.Vector3(), q0 = new THREE.Vector3(), q1 = new THREE.Vector3();
        const heading = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, k: number) => { bez(a, b, c, Math.max(0, k - 0.01), q0); bez(a, b, c, Math.min(1, k + 0.01), q1); tan.subVectors(q1, q0); return Math.atan2(tan.x, tan.z); };
        const path = (t: number) => {
          if (t < 6) {
            const k = t / 6, e = 1 - (1 - k) ** 3;
            return { pos: bez(inFrom, turn, berth, e), yaw: heading(inFrom, turn, berth, e), sq: 0, tilt: 0, grow: Math.min(1, t / 1.2) };
          }
          // tying up: the hull squashes a hair as it nudges the pier
          if (t < 6.6) { const k = (t - 6) / 0.6; return { pos: berth.clone(), yaw: moorYaw, sq: Math.sin(k * Math.PI) * 0.06, tilt: 0 }; }
          if (t < 11) return { pos: berth.clone().setY(Math.sin(t * 2) * 0.05), yaw: moorYaw, sq: 0, tilt: Math.sin(t * 1.4) * 0.02 };
          // backs out and steams off along the coast
          const k = (t - 11) / 6, e = k * k;
          return { pos: bez(berth, turn, outTo, e), yaw: heading(berth, turn, outTo, e) + (e < 0.3 ? Math.PI * (1 - e / 0.3) : 0), sq: -0.04 * Math.max(0, 1 - k * 4), tilt: 0, grow: Math.min(1, (17 - t) / 1.2) };
        };
        scene.add(sh.group);
        job = { kind, obj: sh.group, ship: sh, t: 0, path, length: 17, pad: berth, horns: [5.2, 11.2], scale };
      }
      const p0 = job.path(0);
      job.obj.position.copy(p0.pos);
      job.obj.rotation.y = p0.yaw;
      prev.copy(p0.pos);
      lastF = -1;
    },
    update(dt) {
      fx.update(dt);
      if (!job) return;
      job.t += dt;
      while (job.horns.length && job.t >= job.horns[0]) { job.horns.shift(); events.onHorn?.(); }
      if (job.t > job.length) { drop(); return; }
      // everything clay poses on twos
      const f = kit().twos.f;
      if (f === lastF) return;
      lastF = f;
      const p = job.path(job.t);
      prev.copy(job.obj.position);
      job.obj.position.copy(p.pos);
      job.obj.rotation.y = p.yaw;
      if (job.heli) {
        const h = job.heli;
        h.body.scale.set(1 + p.sq * 0.5, 1 - p.sq, 1 + p.sq * 0.5);
        h.body.position.y = 0.94 * (1 - p.sq);
        h.group.rotation.x = p.tilt;
        h.group.rotation.z = Math.sin(job.t * 1.7) * 0.05;
        h.spin(f);
        h.group.updateMatrixWorld();
        top.set(h.group.position.x, h.group.position.y + LINE_TOP, h.group.position.z);
        h.hang(top);
        // rotor wash flattens the clay grass tufts on the lawn into rings, just outside the cap's rim
        const low = h.group.position.y - job.pad.y;
        if (low < 6 && job.t - ringAt > 0.4) { ringAt = job.t; fx.ring(job.ground!, job.ring! + 0.2 + Math.max(0, low) * 0.15, job.street); if (low < 1) fx.dust(job.pad, 3, 2.2); }
      } else if (job.ship) {
        const s = job.ship;
        s.hull.scale.set(1 + p.sq * 0.4, 1 - p.sq, 1 + p.sq * 0.2);
        s.group.rotation.z = p.tilt;
        s.group.scale.setScalar(job.scale! * Math.max(0.02, p.grow ?? 1));
        const speed = job.obj.position.distanceTo(prev) / Math.max(1 / 12, dt);
        s.wake.visible = speed > 0.4;
        s.wake.scale.set(1, 1, Math.min(1.3, 0.5 + speed * 0.05));
        // bow spray while under way
        if (speed > 1 && job.t - splashAt > 0.3) {
          splashAt = job.t;
          const bow = new THREE.Vector3(0, 0.1, s.length * 0.48).applyMatrix4(s.group.matrixWorld);
          fx.splash(bow, 3);
        }
      }
    },
    active: () => !!job,
    where: () => (job ? [job.obj.position.x, job.obj.position.y, job.obj.position.z, job.t] : null),
  };
}
