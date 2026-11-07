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

export interface VipView {
  /** `level` is the facility tier (Jetty, Pier, Cargo Terminal choose the ship); `client` picks the chopper's paint job. */
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
  path: (t: number) => { pos: THREE.Vector3; yaw: number; sq: number; tilt: number };
  length: number;
  pad: THREE.Vector3;
  horns: number[];
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
    if (job.heli) scene.remove(job.heli.line);
    job = null;
  };

  return {
    play(kind, view, big, level = 1, client = '') {
      drop();
      fx.clear();
      const at = (x: number, y: number, z: number) => view.root.localToWorld(new THREE.Vector3(x, y, z));
      const yaw0 = view.root.rotation.y;
      if (kind === 'heli') {
        const heli = chopper(paintFor(client), big);
        const pad = at(0, 0.3, -2.5);
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
        job = { kind, obj: heli.group, heli, t: 0, path, length: 13.5, pad, horns: [] };
      } else {
        const sk = SHIPS[Math.max(0, Math.min(2, level - 1))];
        const sh = ship(big && sk === 'yacht' ? 'cruise' : sk);
        const scale = 2.2; // the soap ships are built small; scale them to the old berths
        sh.group.scale.setScalar(scale);
        const len = sh.length * scale;
        const pierLen = 12 + level * 6, pierW = 3 + level;
        const side = pierW / 2 + (sh.beam * scale) / 2 + 0.4;
        const berth = at(side, 0, -Math.max(pierLen - len / 2 + 1, 16 + len / 2)); // moored at the pier head, clear of the beach
        const far = at(side, 0, -160);
        const path = (t: number) => {
          if (t < 6) { const k = t / 6, e = 1 - (1 - k) ** 3; return { pos: far.clone().lerp(berth, e), yaw: yaw0, sq: 0, tilt: 0 }; }
          // tying up: the hull squashes a hair as it nudges the pier
          if (t < 6.6) { const k = (t - 6) / 0.6; return { pos: berth.clone(), yaw: yaw0, sq: Math.sin(k * Math.PI) * 0.06, tilt: 0 }; }
          if (t < 11) return { pos: berth.clone().setY(Math.sin(t * 2) * 0.05), yaw: yaw0, sq: 0, tilt: Math.sin(t * 1.4) * 0.02 };
          const k = (t - 11) / 6, e = k * k;
          return { pos: berth.clone().lerp(far, e), yaw: yaw0 + Math.PI * Math.min(1, k * 1.5), sq: -0.04 * Math.max(0, 1 - k * 4), tilt: 0 };
        };
        scene.add(sh.group);
        job = { kind, obj: sh.group, ship: sh, t: 0, path, length: 17, pad: berth, horns: [5.2, 11.2] };
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
        // rotor wash flattens the grass tufts into rings
        const low = h.group.position.y - job.pad.y;
        if (low < 5 && job.t - ringAt > 0.35) { ringAt = job.t; fx.ring(job.pad, 1.6 + (5 - low) * 0.5); if (low < 1) fx.dust(job.pad, 3, 2.2); }
      } else if (job.ship) {
        const s = job.ship;
        s.hull.scale.set(1 + p.sq * 0.4, 1 - p.sq, 1 + p.sq * 0.2);
        s.group.rotation.z = p.tilt;
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
