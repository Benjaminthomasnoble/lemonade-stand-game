// Pickup moments (canon section 15; spec "VIP arrivals"): a chunky clay chopper
// swings down on its fishing line to your pad, flattening the grass into
// rings, loads and lifts off; or a carved-soap ship pushes its clay wake up to
// your pier, toots the theme's horn call, loads and steams away. Purely visual:
// the sim has already paid out by the time this plays.
import * as THREE from 'three';
import type { PlotView } from './bay.ts';
import { chopper, citrusCrate, ship, truck, paintFor, type Chopper, type Ship, type ShipKind, type Truck } from './clay/rides.ts';
import { Baker } from './clay/core.ts';
import { holdProp, makeCrew } from './clay/cast.ts';
import { Figure, crowdDetail, type FigureSpec, type Pose } from './clay/figure.ts';
import { freezeFigures } from './clay/figureBatch.ts';
import { P } from './clay/palette.ts';
import { createFx } from './clay/fx.ts';
import { kit } from './clay/kit.ts';
import { PLINTH } from './diorama.ts';
import { SEA_X, SEA_Z } from '../sim/map.ts';

/** A chopper at the pad, a ship at the pier, or a Caterer Truck at the Warehouse (it loads at closing). */
export type VipKind = 'heli' | 'ship' | 'truck';

export interface VipView {
  /**
   * `level` is the facility tier: Pad, Helipad, Heliport size the chopper (small, bigger, biggest);
   * Jetty, Pier, Cargo Terminal choose the ship. `client` picks the chopper's paint job.
   */
  play(kind: VipKind, view: PlotView, big: boolean, level?: number, client?: string, photo?: boolean): void;
  update(dt: number): void;
  /** Cut the show short (a tap does it too): a first visit still gets its Bugle photo of the loading. */
  skip(): void;
  active(): boolean;
  where(): number[] | null;
  /** Where the show plays out (the pad, or the ship's berth), for the camera to frame; null when none plays. */
  stage(): THREE.Vector3 | null;
}

export interface VipEvents {
  /** A ship's horn: the first three notes of Lottie's Theme (F-A-D). */
  onHorn?(): void;
  /** The loading beat of a show played with `photo`: the frame on screen now is the Bugle's photo. */
  onPhoto?(kind: VipKind): void;
}

/** Spec, Juice and motion: a big moment runs up to 6 seconds, always skippable. */
export const SHOW_SECONDS = 6;
/** The loading beat the Bugle photographs (the chopper down, crates going aboard, the assistant signing). */
const PHOTO_T = 3.3;
/** No skipping in the first instant: the tap that pressed Watch must not cut its own show. */
const SKIP_AFTER = 0.4;

interface Loaders { group: THREE.Group; update(t: number, chopperAt: THREE.Vector3): void }
/** A movie star's assistant in pink, sunglasses on, clipboard in hand. */
const ASSISTANT: FigureSpec = { kind: 'stilt', skin: '#C98E66', shirt: '#F27FA0', sleeve: '#F27FA0', pants: P.cream, shoes: P.plum, hairColor: '#241a14', hat: 'bun', hatColor: '#241a14', eyes: 'shades', brows: 'up', mouth: 'smile', nose: 'button' };

/**
 * The first helicopter's ground crew (spec mood scene): two of your crew stack pink-lemonade crates beside the
 * bottle-cap pad while the chopper swings in, the crates hop aboard while it loads, and a movie star's
 * assistant signs for the order. Every pose is frozen into one mesh (a draw each) and swapped on twos.
 */
function loaders(at: (x: number, y: number, z: number) => THREE.Vector3, yaw0: number): Loaders {
  const group = new THREE.Group();
  const mat = kit().fig;
  const detail = Math.min(0.5, crowdDetail());
  const crateMesh = (seed: number) => { const B = new Baker(); citrusCrate(B, 0, -0.3, 0, 0.8, 0.6, 0.66, seed, true); const m = new THREE.Mesh(B.build(), mat); m.castShadow = true; return m; };
  /** Freeze a figure in each pose (optionally hugging a crate) into its own one-draw holder. */
  const frames = (make: () => Figure, poses: { pose: Pose; crate?: boolean; dress?: (f: Figure) => void }[], seed: number) => {
    const g = new THREE.Group();
    const list = poses.map(({ pose, crate, dress }) => {
      const fig = make();
      dress?.(fig);
      fig.pose(pose, 0);
      const holder = new THREE.Group();
      holder.add(fig.root);
      if (crate) { const c = crateMesh(seed); c.position.set(0, 1.0, 0.5); holder.add(c); }
      freezeFigures(holder, mat);
      g.add(holder);
      return holder;
    });
    list.forEach((h, k) => (h.visible = k === 0));
    group.add(g);
    return { g, show: (k: number) => list.forEach((h, i) => (h.visible = i === k)) };
  };
  const walk = (lL: number, lR: number, carry: boolean): Pose => carry
    ? { lean: 0.08, lL, lR, aL: [-1.45, 0.3], aR: [-1.45, -0.3], headTilt: 0.05 }
    : { lean: 0.04, lL, lR, aL: [-0.3 - lR * 0.6, 0.1], aR: [-0.3 - lL * 0.6, -0.1] };
  const crewPoses = [
    { pose: walk(-0.45, 0.35, true), crate: true }, { pose: walk(0.35, -0.45, true), crate: true },
    { pose: walk(-0.45, 0.35, false) }, { pose: walk(0.35, -0.45, false) },
    { pose: { lean: -0.05, aL: [-2.8, 0.4], aR: [-2.8, -0.4], headTilt: -0.2 } as Pose }, // a cheer as it lifts off
  ];
  const crew = [0, 1].map((i) => frames(() => makeCrew('player', { seed: 21 + i * 4 }, mat, { detail }), crewPoses, 300 + i));
  const signer = frames(() => new Figure(ASSISTANT, mat, { detail: Math.max(detail, 0.5) }), [
    { pose: { aL: [-1.1, 0.35], aR: [-0.2, -0.1], headTilt: 0.1 }, dress: (f) => { holdProp(f, 'ledger', true); } },
    { pose: { aL: [-1.1, 0.35], aR: [-1.15, 0.45], headTilt: 0.32 }, dress: (f) => { holdProp(f, 'ledger', true); } },
    { pose: { aL: [-1.1, 0.35], aR: [-1.05, 0.62], headTilt: 0.3 }, dress: (f) => { holdProp(f, 'ledger', true); } },
  ], 0);
  // the stack goes up beside the pad, on the street side of the cap (plot-local)
  const STACK: [number, number, number][] = [[2.95, 0, 3.0], [3.8, 0, 3.05], [3.35, 0.6, 3.0], [3.4, 1.2, 3.02]];
  const crates = STACK.map((p, k) => { const c = crateMesh(310 + k); c.position.copy(at(p[0], p[1] + 0.3, p[2])); c.rotation.y = yaw0 + (k - 1.5) * 0.08; c.visible = false; group.add(c); return c; });
  const home = crates.map((c) => c.position.clone());
  // each crew member walks a crate in from the street, sets it down and fetches the next (1.2 s a trip)
  const trips = [{ from: [5.1, 4.8], to: [4.55, 3.25] }, { from: [2.3, 4.9], to: [2.25, 3.55] }];
  const face = (a: THREE.Vector3, b: THREE.Vector3) => Math.atan2(b.x - a.x, b.z - a.z);
  signer.g.position.copy(at(1.2, 0, 3.4)); // beside the crew, signing for the stack
  signer.g.rotation.y = face(signer.g.position, at(0, 0, -2.5)) - 0.5; // toward the pad, turned a little to the camera
  const hop = new THREE.Vector3();
  return {
    group,
    update(t, chopperAt) {
      const step = Math.floor(t * 6) % 2; // a stride on twos
      crew.forEach((c, i) => {
        const tr = trips[i];
        const a = at(tr.from[0], 0, tr.from[1]), b = at(tr.to[0], 0, tr.to[1]);
        const k = t - i * 0.6, trip = Math.floor(Math.max(0, k) / 1.2), u = Math.max(0, k) - trip * 1.2;
        const placed = (n: number) => n < 2 ? i + n * 2 : -1;
        if (t >= 4.3) { c.g.position.copy(b); c.g.rotation.y = face(b, at(0, 0, -2.5)); c.show(4); return; }
        if (trip >= 2 || k < 0) { c.g.position.copy(b); c.g.rotation.y = face(b, at(0, 0, -2.5)); c.show(2); return; }
        // in with a crate (0-0.6), set it down (0.6-0.75), back for another (0.75-1.2)
        const inbound = u < 0.6, back = u >= 0.75;
        const e = inbound ? u / 0.6 : back ? 1 - (u - 0.75) / 0.45 : 1;
        c.g.position.lerpVectors(a, b, e);
        c.g.rotation.y = inbound || !back ? face(a, b) : face(b, a);
        c.show(inbound ? step : u < 0.75 ? 2 : 2 + step);
        const n = placed(trip);
        if (n >= 0 && u >= 0.6) crates[n].visible = true;
      });
      // the crates hop aboard while it loads (2.8 s on), one every 0.35 s
      crates.forEach((c, k) => {
        const t0 = 2.8 + k * 0.35, q = (t - t0) / 0.35;
        if (q < 0) { c.position.copy(home[k]); c.scale.setScalar(1); return; }
        if (q >= 1) { c.visible = false; return; }
        hop.lerpVectors(home[k], chopperAt, q); hop.y += Math.sin(q * Math.PI) * 2.2;
        c.position.copy(hop); c.scale.setScalar(1 - q * 0.6); c.visible = true;
      });
      // she signs for the order while it loads
      signer.show(t < 2.6 || t >= 4.4 ? 0 : 1 + step);
    },
  };
}

const SHIPS: ShipKind[] = ['yacht', 'cruise', 'freighter'];
const LINE_TOP = 70; // the fishing line runs up out of shot

interface Job {
  kind: VipKind;
  /** Caterer Trucks: the truck, its crates by the shed, and how far it has rolled (for the button wheels). */
  truck?: { v: Truck; crates: THREE.Mesh[]; from: THREE.Vector3[]; rolled: number; beeped: boolean };
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
  /** Choppers: the ground crew, the crate stack and the assistant. */
  crew?: Loaders;
  /** A first visit: the loading beat is the Bugle's photo (still owed while true). */
  photo: boolean;
  /** Tapped away: pose the photo if it's owed, then go. */
  skip?: boolean;
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
    if (job.truck) for (const c of job.truck.crates) { scene.remove(c); c.geometry.dispose(); }
    if (job.crew) { scene.remove(job.crew.group); job.crew.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose()); }
    listen(false);
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

  const onTap = () => { if (job && job.t > SKIP_AFTER) job.skip = true; };
  // Listen only while a show plays (a tap anywhere skips it, as a crate reveal does).
  const listen = (on: boolean) => { if (typeof addEventListener === 'function') (on ? addEventListener : removeEventListener)('pointerdown', onTap); };

  return {
    play(kind, view, big, level = 1, client = '', photo = false) {
      drop();
      fx.clear();
      const at = (x: number, y: number, z: number) => view.root.localToWorld(new THREE.Vector3(x, y, z));
      const yaw0 = view.root.rotation.y;
      if (kind === 'truck') {
        // A Caterer Truck rolls up the street to the Warehouse's door at closing, the crates by the shed hop into
        // its bed, and off it goes (six seconds, like the others).
        const tv = truck(P.teal, '#C98E66');
        const scale = 1.3;
        tv.group.scale.setScalar(scale);
        const lane = 2.4; // plot-local: on the forecourt in front of the roll-up door
        const from = at(-18, 0, lane), stop = at(0.2, 0, lane), to = at(18, 0, lane);
        const yaw = Math.atan2(stop.x - from.x, stop.z - from.z);
        const path = (t: number) => {
          if (t < 2.2) { const k = t / 2.2, e = 1 - (1 - k) ** 2; return { pos: from.clone().lerp(stop, e), yaw, sq: 0, tilt: -0.04 * (1 - k) }; }
          if (t < 2.5) { const k = (t - 2.2) / 0.3; return { pos: stop.clone(), yaw, sq: Math.sin(k * Math.PI) * 0.06, tilt: 0.05 * Math.sin(k * Math.PI) }; } // brakes: a nod forward
          if (t < 4.3) return { pos: stop.clone(), yaw, sq: 0, tilt: 0 };
          const k = (t - 4.3) / 1.7, e = k * k;
          return { pos: stop.clone().lerp(to, e), yaw, sq: 0, tilt: -0.04 * Math.min(1, k * 3) };
        };
        // three crates wait by the shed (beside its own stacked ones) and hop into the bed while it stands
        const crates = [0, 1, 2].map((k) => {
          const B = new Baker(); citrusCrate(B, 0, -0.3, 0, 0.8, 0.6, 0.7, 500 + k * 7);
          const m = new THREE.Mesh(B.build(), kit().fig); m.castShadow = true;
          m.position.copy(at(-2.6 + k * 0.95, 0.3, 0.3)); m.rotation.y = yaw0 + (k - 1) * 0.1;
          scene.add(m); return m;
        });
        scene.add(tv.group);
        job = { kind, obj: tv.group, t: 0, path, length: SHOW_SECONDS, pad: stop, horns: [], photo,
          truck: { v: tv, crates, from: crates.map((c) => c.position.clone()), rolled: 0, beeped: false } };
      } else if (kind === 'heli') {
        // Pad: a small chopper; Helipad: a bigger one; Heliport: the biggest
        const lv = Math.max(1, Math.min(3, level));
        const heli = chopper(paintFor(client), [1.25, 1.5, 1.75][lv - 1]);
        const deck = lv >= 2 ? 0.9 : 0;
        const pad = at(0, deck + 0.45, -2.5); // on the bottle cap's top (the cap sits on a raised deck from Helipad up)
        const capR = 3 + lv * 0.6;
        const from = at(-30, 24, -40), to = at(40, 30, -50);
        const hover = pad.clone().setY(pad.y + 5);
        // six seconds (spec: big moments up to 6): swing in 1.8 s, settle 0.6, touch down, load 1.6, lift off 1.5
        const path = (t: number) => {
          if (t < 1.8) { const k = t / 1.8, e = 1 - (1 - k) ** 2; return { pos: from.clone().lerp(hover, e), yaw: yaw0 + 0.6 * (1 - k), sq: 0, tilt: 0.25 * (1 - k) }; }
          if (t < 2.4) { const k = (t - 1.8) / 0.6; return { pos: pad.clone().setY(pad.y + 5 * (1 - k * k)), yaw: yaw0, sq: 0, tilt: 0 }; }
          // touchdown: squash and spring back
          if (t < 2.7) { const k = (t - 2.4) / 0.3; return { pos: pad.clone(), yaw: yaw0, sq: Math.sin(k * Math.PI) * 0.14 * (1 - k * 0.5), tilt: 0 }; }
          if (t < 4.3) return { pos: pad.clone(), yaw: yaw0, sq: 0, tilt: 0 };
          // launch: crouch, stretch up, then away
          if (t < 4.5) { const k = (t - 4.3) / 0.2; return { pos: pad.clone(), yaw: yaw0, sq: 0.1 * Math.sin(k * Math.PI), tilt: 0 }; }
          const k = (t - 4.5) / 1.5, e = k * k;
          return { pos: pad.clone().setY(pad.y + 8 * Math.min(1, k * 2)).lerp(to, e), yaw: yaw0 - 0.8 * k, sq: -0.12 * Math.max(0, 1 - k * 3), tilt: -0.2 * Math.min(1, k * 3) };
        };
        const crew = loaders(at, yaw0);
        scene.add(heli.group, heli.line, crew.group);
        job = { kind, obj: heli.group, heli, t: 0, path, length: SHOW_SECONDS, pad, horns: [], ring: capR, ground: at(0, 0, -2.5), street: at(0, 0, 1).sub(at(0, 0, 0)).normalize(), crew, photo };
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
        // six seconds (spec: big moments up to 6): in 2.4 s, tie up, load 1.6, steam off 1.6
        const path = (t: number) => {
          if (t < 2.4) {
            const k = t / 2.4, e = 1 - (1 - k) ** 3;
            return { pos: bez(inFrom, turn, berth, e), yaw: heading(inFrom, turn, berth, e), sq: 0, tilt: 0, grow: Math.min(1, t / 0.6) };
          }
          // tying up: the hull squashes a hair as it nudges the pier
          if (t < 2.8) { const k = (t - 2.4) / 0.4; return { pos: berth.clone(), yaw: moorYaw, sq: Math.sin(k * Math.PI) * 0.06, tilt: 0 }; }
          if (t < 4.4) return { pos: berth.clone().setY(Math.sin(t * 2) * 0.05), yaw: moorYaw, sq: 0, tilt: Math.sin(t * 1.4) * 0.02 };
          // backs out and steams off along the coast
          const k = (t - 4.4) / 1.6, e = k * k;
          return { pos: bez(berth, turn, outTo, e), yaw: heading(berth, turn, outTo, e) + (e < 0.3 ? Math.PI * (1 - e / 0.3) : 0), sq: -0.04 * Math.max(0, 1 - k * 4), tilt: 0, grow: Math.min(1, (SHOW_SECONDS - t) / 0.6) };
        };
        scene.add(sh.group);
        job = { kind, obj: sh.group, ship: sh, t: 0, path, length: SHOW_SECONDS, pad: berth, horns: [2.2, 4.5], scale, photo };
      }
      const p0 = job.path(0);
      job.obj.position.copy(p0.pos);
      job.obj.rotation.y = p0.yaw;
      prev.copy(p0.pos);
      lastF = -1;
      listen(true);
    },
    skip() { if (job) job.skip = true; },
    update(dt) {
      fx.update(dt);
      if (!job) return;
      if (job.skip) {
        // a skipped first visit still owes the Bugle its photo: pose the loading beat for one frame, then go
        if (!job.photo || job.t >= PHOTO_T) { drop(); fx.clear(); return; }
        job.t = PHOTO_T; job.horns.length = 0; lastF = -1;
      } else job.t += dt;
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
        job.crew?.update(job.t, h.group.position);
        top.set(h.group.position.x, h.group.position.y + LINE_TOP, h.group.position.z);
        h.hang(top);
        // rotor wash flattens the clay grass tufts on the lawn into rings, just outside the cap's rim
        const low = h.group.position.y - job.pad.y;
        if (low < 6 && job.t - ringAt > 0.4) { ringAt = job.t; fx.ring(job.ground!, job.ring! + 0.2 + Math.max(0, low) * 0.15, job.street); if (low < 1) fx.dust(job.pad, 3, 2.2); }
      } else if (job.truck) {
        const tk = job.truck;
        tk.v.body.scale.set(1 + p.sq * 0.4, 1 - p.sq, 1);
        tk.v.body.rotation.x = p.tilt;
        tk.rolled += job.obj.position.distanceTo(prev);
        for (const w of tk.v.wheels) w.rotation.x = (tk.rolled / (0.45 * 1.3)) * (w.rotation.y ? -1 : 1);
        job.obj.updateMatrixWorld();
        const bed = job.obj.localToWorld(new THREE.Vector3(0, 1.4, -0.9)); // the bed, in the truck's own space
        tk.crates.forEach((c, k) => {
          const t0 = 2.6 + k * 0.5, q = (job!.t - t0) / 0.45;
          if (q < 0) return;
          if (q >= 1) { c.position.copy(bed).add(new THREE.Vector3(0, k * 0.05, 0)); c.visible = job!.t < 4.3; return; } // aboard: the truck's own cargo rides on
          c.position.lerpVectors(tk.from[k], bed, q); c.position.y += Math.sin(q * Math.PI) * 1.8;
          c.rotation.z = q * Math.PI * 2 * (k % 2 ? 1 : -1);
        });
        if (!tk.beeped && job.t >= 2.4) { tk.beeped = true; fx.word(job.obj.position.clone().setY(3.6), 'BEEP BEEP!', P.teal, undefined, 0.9); }
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
      if (job.photo && job.t >= PHOTO_T) { job.photo = false; events.onPhoto?.(job.kind); } // this frame goes to the Bugle
    },
    active: () => !!job,
    where: () => (job ? [job.obj.position.x, job.obj.position.y, job.obj.position.z, job.t] : null),
    stage: () => (job ? job.pad.clone() : null),
  };
}
