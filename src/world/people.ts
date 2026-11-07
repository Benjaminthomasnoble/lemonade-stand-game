// Clay pedestrians (design spec "Characters"). The sim decides who buys; this
// module walks them along the sidewalk, detours buyers to the counter and
// reports when they arrive so the HUD can pop "+50¢" over their heads. Each
// customer is a clay Figure dressed for their segment (balloons, strollers,
// bucket hats, backpacks, lanyards, cameras, lunch pails, tiny dogs) and walks
// in their body's gait: pear adults bob, round folk roll, kids skip. Everyone
// poses on twos, and the whole crowd draws as one batch (clay/figureBatch.ts).
// A buyer leaves with a cup, sips a few steps later and pulls a face.
import * as THREE from 'three';
import { kit } from './clay/kit.ts';
import { crowdDetail, Figure, gait as figureGait, type Face, type Gait as BodyGait } from './clay/figure.ts';
import { holdProp, makeCustomer, segmentSpec, type SegmentLook } from './clay/cast.ts';
import { createFigureBatch } from './clay/figureBatch.ts';

/** Reduced motion keeps a little life but drops the bounce. */
export const MOTION = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.25 : 1;

/**
 * Hop-walk pose for any figure: lifts it off the ground at mid-stride and
 * squashes it on landing. `base` is its resting scale.
 */
export function hopPose(obj: THREE.Object3D, phase: number, base: number, groundY = 0.12, amount = 1) {
  const a = amount * MOTION;
  const lift = Math.abs(Math.sin(phase));
  obj.position.y = groundY + lift * 0.1 * a;
  const squash = Math.max(0, 0.35 - lift) * 0.35 * a; // only near the ground
  obj.scale.set(base * (1 + squash * 0.5), base * (1 - squash), base * (1 + squash * 0.5));
}

/** Idle breathing bob for a standing figure. */
export function idlePose(obj: THREE.Object3D, t: number, base: number) {
  const b = Math.sin(t * 3.2) * 0.022 * MOTION;
  obj.scale.set(base * (1 - b * 0.5), base * (1 + b), base * (1 - b * 0.5));
}

const HEX = (n: number) => '#' + n.toString(16).padStart(6, '0');
let personSeed = 0;
/**
 * A clay townsperson in the given colours (kept for older call sites; new code
 * builds from clay/cast.ts). Returns the figure's root, which carries the rig
 * in userData (limbs, base, head, hands, rig, figure).
 */
export function makePerson(shirt?: number, pants?: number, skin?: number, scale = 1): THREE.Group {
  const sp = segmentSpec('families', personSeed++ % 8);
  if (shirt !== undefined) sp.shirt = HEX(shirt);
  if (pants !== undefined) sp.pants = HEX(pants);
  if (skin !== undefined) sp.skin = HEX(skin);
  return new Figure(sp, kit().fig, { scale }).root;
}

interface Walker {
  obj: THREE.Group;
  fig: Figure;
  segment: SegmentLook;
  /** The body's own walk (bob, roll, skip). */
  body: BodyGait;
  /** The segment's prop, if it's in the hands (balloon, lunch pail) or rolls along (stroller, dog). */
  prop: THREE.Object3D | null;
  umbrella: THREE.Object3D;
  /** A face held for a moment (yum after a sip, price-shock on a grumble). */
  face: Face;
  faceT: number;
  active: boolean;
  path: THREE.Vector3[];
  leg: number;
  wait: number;
  phase: number;
  speed: number;
  popup?: { text: string; kind: 'sale' | 'miss'; atCounter: boolean };
  shown: boolean;
  grumbleX: number;
  base: number;
  cup: THREE.Object3D;
  /** Seconds since served (counts up once they hold a cup), and whether they've sipped. */
  served: number;
  sipped: boolean;
  /** A short squash-and-stretch when something happens to them. */
  boing: number;
  gait: Gait;
  /** Tourists stop once to take a photo of the stand. */
  photo: number;
  /** Stomping off after a long wait in line. */
  huff: boolean;
  standZ: number;
  clap: number;
}

/**
 * How someone walks, by who they are: kids skip, seniors shuffle, office
 * workers stride, tourists stroll and stop for a photo.
 */
export type Gait = 'stroll' | 'skip' | 'shuffle' | 'stride' | 'tourist';
const GAIT: Record<Gait, { hop: number; cadence: number; swing: number }> = {
  stroll: { hop: 1, cadence: 1, swing: 0.6 },
  skip: { hop: 2, cadence: 1.25, swing: 0.9 },
  shuffle: { hop: 0.25, cadence: 1.5, swing: 0.25 },
  stride: { hop: 0.7, cadence: 0.85, swing: 0.75 },
  tourist: { hop: 0.9, cadence: 0.95, swing: 0.5 },
};

/** What a walker did, so the world can put a bubble over them. */
export type WalkerMoment = 'sale' | 'miss' | 'sip' | 'sweat';

/** Weather changes how people move: umbrellas and hurrying in rain, dragging feet in a heat wave. */
export type StreetWeather = 'scorcher' | 'hot' | 'warm' | 'cloudy' | 'rainy' | 'storm';

export type WalkerKind = 'pass' | 'sale' | 'miss' | 'grumble';

/** Where a walker goes: along a sidewalk from x0 to x1, optionally detouring to a counter. */
export interface Route { x0: number; x1: number; z: number; serve?: THREE.Vector3; grumbleX?: number }

export interface Crowd {
  /** sale/miss detour to the counter; grumble pops its text while walking past. */
  spawn(kind: WalkerKind, route: Route, text?: string, opts?: { scale?: number; speed?: number; gait?: Gait; segment?: SegmentLook }): boolean;
  update(dt: number, speedScale: number): void;
  clear(): void;
  activeCount(): number;
  setWeather(kind: StreetWeather): void;
  /** Everyone walking near this spot stops to clap for a moment (a stand reveal, a big win). */
  cheer(at: THREE.Vector3, radius: number): number;
  /** The crowd batch's size (instances, shared geometries, vertices). */
  stats(): { instances: number; geometries: number; vertices: number };
}

/** Laptop cap from the spec (about 150 animated people in Street View). */
export const CROWD_POOL = 150;
/** Phone cap from the spec (60 animated people). */
export const CROWD_PHONE = 60;

const SEGMENTS: SegmentLook[] = ['families', 'office', 'kids', 'tourists', 'seniors', 'students', 'workers', 'highRollers'];
/** Variants per segment: enough for a varied street, few enough that geometry is shared. */
const VARIANTS = 5;

export function createCrowd(
  scene: THREE.Scene,
  onArrive: (pos: THREE.Vector3, text: string, kind: WalkerMoment, who: THREE.Object3D) => void,
  pool = CROWD_POOL,
): Crowd {
  const walkers: Walker[] = [];
  const K = kit();
  const batch = createFigureBatch(K.fig);
  scene.add(batch.mesh);
  let weather: StreetWeather = 'warm';
  for (let i = 0; i < pool; i++) {
    const segment = SEGMENTS[i % SEGMENTS.length];
    const { fig, prop } = makeCustomer(segment, Math.floor(i / SEGMENTS.length) % VARIANTS, K.fig, { detail: crowdDetail() });
    const obj = fig.root;
    obj.visible = false;
    obj.name = 'walker';
    // The cup rides in the right mitten; an umbrella for rainy days in the left.
    const cup = holdProp(fig, 'cupLemon');
    cup.visible = false;
    const umbrella = holdProp(fig, 'umbrella', true);
    umbrella.visible = false;
    scene.add(obj);
    batch.track(obj);
    const body: BodyGait = fig.sp.kind === 'kid' ? 'skip' : fig.sp.kind === 'round' ? 'roll' : 'bob';
    walkers.push({ obj, fig, segment, body, prop, umbrella, face: 'neutral', faceT: 0, active: false, path: [], leg: 0, wait: 0, phase: 0, speed: 0, shown: false, grumbleX: 0, base: 1, cup, served: -1, sipped: false, boing: 0, gait: 'stroll', photo: -1, huff: false, standZ: 0, clap: 0 });
  }
  let queueSlot = 0;
  let clock = 0, lastT = 0, lastF = -1, lastDetail = -1;
  const headY = (w: Walker) => (w.fig.height + 0.4) * w.base;
  const setFace = (w: Walker, face: Face, secs: number) => { w.face = face; w.faceT = secs; w.fig.face(face); };

  /** One twos step of the whole crowd: dt is the time since the last step. */
  function step(dt: number, f: number) {
    const tq = f / 12;
    const wet = weather === 'rainy' || weather === 'storm';
    for (const w of walkers) {
      if (!w.active) continue;
      const fig = w.fig;
      const limbs = w.obj.userData.limbs as THREE.Object3D[];
      if (w.served >= 0) w.served += dt;
      if (w.boing > 0) w.boing = Math.max(0, w.boing - dt);
      if (w.faceT > 0 && (w.faceT -= dt) <= 0) { w.face = 'neutral'; fig.face('neutral'); }
      // the tiny dog trots, the stroller rolls on
      if (w.prop && w.segment === 'highRollers') w.prop.position.y = Math.abs(Math.sin(w.phase * 1.7)) * 0.06 * MOTION;
      if (w.prop && w.segment === 'kids') w.prop.visible = !wet;
      if (w.wait > 0) {
        w.wait -= dt;
        // Standing: weight shifts, the head turns to watch the pour.
        fig.pose({ lift: 0, aL: [0, 0.12], aR: [0, -0.12], headYaw: Math.sin(tq * 0.9 + w.phase) * 0.3, headTilt: w.popup?.atCounter ? 0.12 : 0.04 }, f);
        w.obj.position.y = 0.12;
        if (w.boing > 0) {
          // Served: a quick stretch up, then settle (a happy little boing).
          const k = Math.sin((1 - w.boing / 0.35) * Math.PI) * 0.16 * MOTION;
          w.obj.scale.set(w.base * (1 - k * 0.4), w.base * (1 + k), w.base * (1 - k * 0.4));
        } else if (w.clap > 0) {
          // Clapping: mittens together and apart, a happy bounce.
          w.clap = Math.max(0, w.clap - dt);
          const c = Math.sin(w.clap * 26);
          limbs[2].rotation.x = limbs[3].rotation.x = -1.3;
          limbs[2].rotation.z = 0.35 + c * 0.25; limbs[3].rotation.z = -0.35 - c * 0.25;
          hopPose(w.obj, w.clap * 9, w.base, 0.12, 0.6);
          continue;
        } else if (w.photo > 0) {
          // Snap! Both mittens up to the face, then a little flinch on the shutter.
          limbs[2].rotation.x = limbs[3].rotation.x = -2.1;
          limbs[2].rotation.z = 0.5; limbs[3].rotation.z = -0.5;
          const k = w.wait < 0.3 ? Math.sin((w.wait / 0.3) * Math.PI) * 0.08 * MOTION : 0;
          w.obj.scale.set(w.base * (1 + k), w.base * (1 - k), w.base * (1 + k));
          continue;
        } else if (w.huff) {
          idlePose(w.obj, w.phase + w.wait * 2, w.base);
          limbs[0].rotation.x = Math.sin(w.wait * 30) > 0.3 ? -0.3 * MOTION : 0; // tap tap tap
          limbs[2].rotation.z = 0.9; limbs[3].rotation.z = -0.9; // hands on hips
        } else idlePose(w.obj, w.phase + w.wait * 2, w.base);
        if (w.cup.visible) limbs[3].rotation.x = -0.9; // hold the cup up
        if (w.segment === 'families') limbs[2].rotation.x = limbs[3].rotation.x = -0.9; // on the stroller
        continue;
      }
      const target = w.path[w.leg];
      const pos = w.obj.position;
      const dx = target.x - pos.x, dz = target.z - pos.z;
      const dist = Math.hypot(dx, dz);
      const move = w.speed * dt * (w.huff ? 1.35 : 1) * (wet ? 1.3 : weather === 'scorcher' ? 0.85 : 1);
      if (dist <= move) {
        pos.set(target.x, pos.y, target.z);
        // Arrived at the counter (the middle waypoint of a detour).
        if (w.popup?.atCounter && w.leg === 2) {
          const sale = w.popup.kind === 'sale';
          w.wait = sale ? 0.9 : 0.4;
          if (weather === 'scorcher' && Math.random() < 0.3) onArrive(pos.clone().setY(headY(w)), '', 'sweat', w.obj);
          // Gave up on the line: a foot-tapping wait, then stomp off quicker.
          if (!sale && w.popup.text === 'line') { w.wait = 1.2; w.huff = true; }
          if (!sale && w.popup.text === 'soldout') setFace(w, 'shock', 0.8);
          if (sale) { w.cup.visible = true; w.served = 0; w.boing = 0.35; }
          onArrive(pos.clone().setY(headY(w)), w.popup.text, w.popup.kind, w.obj);
        }
        w.leg++;
        if (w.leg >= w.path.length) { w.active = false; w.obj.visible = false; }
        continue;
      }
      if (w.photo === 0 && Math.abs(pos.x - w.grumbleX) < 2.5) {
        w.photo = 1;
        w.wait = 0.9;
        w.obj.rotation.y = Math.atan2(w.grumbleX - pos.x, w.standZ - pos.z);
        continue;
      }
      if (w.popup && !w.popup.atCounter && !w.shown && Math.abs(pos.x - w.grumbleX) < 1) {
        w.shown = true;
        setFace(w, 'shock', 0.9); // price-shock: the eyes pop
        onArrive(pos.clone().setY(headY(w)), w.popup.text, 'miss', w.obj);
      }
      pos.x += (dx / dist) * move;
      pos.z += (dz / dist) * move;
      w.obj.rotation.y = Math.atan2(dx, dz);
      const g = GAIT[w.huff ? 'stride' : w.gait];
      if (w.photo > 0) w.photo = -1;
      w.phase += dt * w.speed * 3.2 * g.cadence;
      // The body's own walk on the rig, the world's hop on the root.
      // The body's gait owns the stride; the segment's gait only adds its hop (kids, a huff).
      figureGait(fig, w.body, w.phase, f, tq);
      hopPose(w.obj, w.phase, w.base, 0.12, (w.huff ? 1.4 : g.hop) * 0.45);
      if (g.swing !== GAIT.stroll.swing) { const k = g.swing / GAIT.stroll.swing; limbs[0].rotation.x *= k; limbs[1].rotation.x *= k; }
      if (wet) { limbs[2].rotation.x = -2.6; limbs[2].rotation.z = 0.2; }
      if (w.segment === 'families') limbs[2].rotation.x = limbs[3].rotation.x = -0.9; // pushing the stroller
      w.obj.rotation.x = w.huff ? 0.12 : w.gait === 'shuffle' ? 0.08 : 0;
      // A few steps after the counter, the buyer stops swinging the cup and sips,
      // puffs their cheeks, then pulls a face: yum, mostly.
      const sipping = w.cup.visible && w.served > 1.6 && w.served < 2.6;
      if (w.cup.visible) { limbs[3].rotation.x = sipping ? -2.3 : -0.7; limbs[3].rotation.z = sipping ? -0.35 : -0.12; }
      if (sipping) (w.obj.userData.head as THREE.Object3D).rotation.x = -0.25; // head back for the sip
      if (sipping && !w.sipped) {
        w.sipped = true;
        const hot = weather === 'scorcher' || weather === 'hot';
        const r = Math.random();
        setFace(w, hot && r < 0.15 ? 'brainfreeze' : r < 0.25 ? 'pucker' : 'yum', 1.3);
        onArrive(pos.clone().setY(headY(w)), '', 'sip', w.obj);
      }
    }
  }

  return {
    spawn(kind, route, text = '', opts = {}) {
      const want = opts.segment;
      const w = (want && walkers.find((x) => !x.active && x.segment === want)) || walkers.find((x) => !x.active);
      if (!w) return false; // pool full: the sale still counts, we just don't draw it
      const dir = route.x1 > route.x0 ? 1 : -1;
      const z = route.z + (Math.random() - 0.5) * 1.2;
      const start = new THREE.Vector3(route.x0, 0.12, z);
      const end = new THREE.Vector3(route.x1, 0.12, z);
      w.path = [start];
      if ((kind === 'sale' || kind === 'miss') && route.serve) {
        const slot = (queueSlot++ % 5) - 2;
        const counter = route.serve.clone().add(new THREE.Vector3(slot * 0.55, 0, 0));
        w.path.push(new THREE.Vector3(counter.x - dir * 1.5, 0.12, z), counter, new THREE.Vector3(counter.x + dir * 1.5, 0.12, z));
        w.popup = { text, kind, atCounter: true };
      } else {
        w.popup = kind === 'grumble' ? { text, kind: 'miss', atCounter: false } : undefined;
      }
      w.grumbleX = route.grumbleX ?? (route.x0 + route.x1) / 2;
      w.shown = false;
      w.base = opts.scale ?? 1;
      w.obj.scale.setScalar(w.base);
      w.obj.userData.base = w.base;
      w.cup.visible = false;
      w.served = -1;
      w.sipped = false;
      w.boing = 0;
      w.gait = opts.gait ?? 'stroll';
      w.photo = w.gait === 'tourist' && kind !== 'sale' ? 0 : -1;
      w.huff = false;
      w.standZ = route.serve?.z ?? z - 3;
      w.clap = 0;
      if (w.face !== 'neutral') setFace(w, 'neutral', 0);
      w.obj.rotation.x = 0;
      w.path.push(end);
      w.leg = 1;
      w.wait = 0;
      w.phase = Math.random() * 6;
      w.speed = (2.4 + Math.random() * 0.9) * (opts.speed ?? 1);
      w.obj.position.copy(start);
      w.umbrella.visible = weather === 'rainy' || weather === 'storm';
      w.obj.visible = true;
      w.active = true;
      return true;
    },
    update(dt, speedScale) {
      clock += dt * Math.min(speedScale, 4);
      const f = Math.floor(clock * 12);
      // Zoom works while paused too: the batch follows the detail level even when the clock stands still.
      const detail = (scene.userData.detail as number | undefined) ?? 0;
      if (detail !== lastDetail) { lastDetail = detail; batch.setVisible(detail < 2); batch.sync(); }
      if (f === lastF) return;
      lastF = f;
      step(clock - lastT, f);
      lastT = clock;
      if (detail < 2) batch.sync();
    },
    clear() {
      for (const w of walkers) { w.active = false; w.obj.visible = false; }
      batch.sync();
    },
    activeCount() { return walkers.filter((w) => w.active).length; },
    cheer(at, radius) {
      let n = 0;
      for (const w of walkers) {
        if (!w.active || w.wait > 0 || w.huff) continue;
        if (Math.hypot(w.obj.position.x - at.x, w.obj.position.z - at.z) > radius) continue;
        w.clap = 1.4 + Math.random() * 0.4;
        w.wait = w.clap;
        w.obj.rotation.y = Math.atan2(at.x - w.obj.position.x, at.z - w.obj.position.z);
        n++;
      }
      return n;
    },
    setWeather(kind) {
      if (kind === weather) return;
      weather = kind;
      const wet = kind === 'rainy' || kind === 'storm';
      for (const w of walkers) w.umbrella.visible = wet;
    },
    stats: () => batch.stats(),
  };
}
