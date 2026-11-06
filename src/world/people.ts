// Low-poly pedestrians. The sim decides who buys; this module only walks
// them along the sidewalk, detours buyers to the counter and reports when
// they arrive so the HUD can pop "+50¢" over their heads. Everyone hops as
// they walk and squashes when they land; a buyer leaves with a cup and
// takes a sip a few steps later.
import * as THREE from 'three/webgpu';

const SKIN = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];
const SHIRTS = [0xe63946, 0x457b9d, 0x2a9d8f, 0xf4a261, 0x9b5de5, 0xffbe0b, 0x06d6a0, 0xef476f];
const PANTS = [0x264653, 0x3d405b, 0x6b705c, 0x1d3557, 0x5e503f];

const headGeo = new THREE.SphereGeometry(0.17, 12, 10);
const bodyGeo = new THREE.CapsuleGeometry(0.2, 0.42, 4, 10);
const limbGeo = new THREE.BoxGeometry(0.11, 0.48, 0.11);
limbGeo.translate(0, -0.24, 0); // pivot at the hip/shoulder

const materials = new Map<number, THREE.MeshStandardMaterial>();
function m(color: number) {
  let mm = materials.get(color);
  if (!mm) { mm = new THREE.MeshStandardMaterial({ color, roughness: 0.8 }); materials.set(color, mm); }
  return mm;
}

/** Reduced motion keeps a little life but drops the bounce. */
export const MOTION = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.25 : 1;

const cupGeo = new THREE.CylinderGeometry(0.07, 0.055, 0.17, 10);
cupGeo.translate(0, 0.085, 0);
const cupMat = new THREE.MeshStandardMaterial({ color: 0xfff3a6, roughness: 0.5 });
const umbrellaGeo = new THREE.ConeGeometry(0.55, 0.28, 8, 1, true);
const stickGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.6, 5);
const UMBRELLAS = [0xE8704F, 0x3BB4C1, 0xF7C948, 0xF4A3B5, 0x7CC47F];

/**
 * Hop-walk pose for any peg doll: lifts it off the ground at mid-stride and
 * squashes it on landing. `base` is its resting scale.
 */
export function hopPose(obj: THREE.Object3D, phase: number, base: number, groundY = 0.12, amount = 1) {
  const a = amount * MOTION;
  const lift = Math.abs(Math.sin(phase));
  obj.position.y = groundY + lift * 0.1 * a;
  const squash = Math.max(0, 0.35 - lift) * 0.35 * a; // only near the ground
  obj.scale.set(base * (1 + squash * 0.5), base * (1 - squash), base * (1 + squash * 0.5));
}

/** Idle breathing bob for a standing peg doll. */
export function idlePose(obj: THREE.Object3D, t: number, base: number) {
  const b = Math.sin(t * 3.2) * 0.022 * MOTION;
  obj.scale.set(base * (1 - b * 0.5), base * (1 + b), base * (1 - b * 0.5));
}

export function makePerson(shirt?: number, pants?: number, skin?: number, scale = 1): THREE.Group {
  const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
  const g = new THREE.Group();
  const shirtM = m(shirt ?? pick(SHIRTS));
  const pantsM = m(pants ?? pick(PANTS));
  const skinM = m(skin ?? pick(SKIN));
  const body = new THREE.Mesh(bodyGeo, shirtM);
  body.position.y = 0.95;
  body.castShadow = true;
  g.add(body);
  const head = new THREE.Mesh(headGeo, skinM);
  head.position.y = 1.47;
  head.castShadow = true;
  g.add(head);
  const limbs: THREE.Mesh[] = [];
  for (const [x, y, mat] of [[-0.1, 0.52, pantsM], [0.1, 0.52, pantsM], [-0.27, 1.2, shirtM], [0.27, 1.2, shirtM]] as const) {
    const l = new THREE.Mesh(limbGeo, mat);
    l.position.set(x, y, 0);
    l.castShadow = true;
    g.add(l);
    limbs.push(l);
  }
  g.userData.limbs = limbs;
  g.userData.base = scale;
  g.scale.setScalar(scale);
  return g;
}

interface Walker {
  obj: THREE.Group;
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
  cup: THREE.Mesh;
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
  spawn(kind: WalkerKind, route: Route, text?: string, opts?: { scale?: number; speed?: number; gait?: Gait }): boolean;
  update(dt: number, speedScale: number): void;
  clear(): void;
  activeCount(): number;
  setWeather(kind: StreetWeather): void;
}

/** Laptop cap from the spec (about 150 animated people in Street View). */
export const CROWD_POOL = 150;

export function createCrowd(
  scene: THREE.Scene,
  onArrive: (pos: THREE.Vector3, text: string, kind: WalkerMoment, who: THREE.Object3D) => void,
  pool = CROWD_POOL,
): Crowd {
  const walkers: Walker[] = [];
  const umbrellas: THREE.Group[] = [];
  let weather: StreetWeather = 'warm';
  for (let i = 0; i < pool; i++) {
    const obj = makePerson();
    obj.visible = false;
    // The cup rides in the right mitten.
    // An umbrella for rainy days, held up in the left mitten.
    const umbrella = new THREE.Group();
    const canopy = new THREE.Mesh(umbrellaGeo, m(UMBRELLAS[i % UMBRELLAS.length]));
    canopy.position.y = 0.55;
    const stick = new THREE.Mesh(stickGeo, m(0x8B5E3C));
    stick.position.y = 0.25;
    umbrella.add(canopy, stick);
    umbrella.position.set(0, -0.45, 0);
    umbrella.rotation.x = Math.PI;
    umbrella.visible = false;
    (obj.userData.limbs as THREE.Mesh[])[2].add(umbrella);
    umbrellas.push(umbrella);
    const cup = new THREE.Mesh(cupGeo, cupMat);
    cup.position.set(0, -0.5, 0.06);
    cup.visible = false;
    (obj.userData.limbs as THREE.Mesh[])[3].add(cup);
    scene.add(obj);
    walkers.push({ obj, active: false, path: [], leg: 0, wait: 0, phase: 0, speed: 0, shown: false, grumbleX: 0, base: 1, cup, served: -1, sipped: false, boing: 0, gait: 'stroll', photo: -1, huff: false, standZ: 0 });
  }
  let queueSlot = 0;

  return {
    spawn(kind, route, text = '', opts = {}) {
      const w = walkers.find((x) => !x.active);
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
      w.cup.visible = false;
      w.served = -1;
      w.sipped = false;
      w.boing = 0;
      w.gait = opts.gait ?? 'stroll';
      w.photo = w.gait === 'tourist' && kind !== 'sale' ? 0 : -1;
      w.huff = false;
      w.standZ = route.serve?.z ?? z - 3;
      w.obj.rotation.x = 0;
      w.path.push(end);
      w.leg = 1;
      w.wait = 0;
      w.phase = Math.random() * 6;
      w.speed = (2.4 + Math.random() * 0.9) * (opts.speed ?? 1);
      w.obj.position.copy(start);
      w.obj.visible = true;
      w.active = true;
      return true;
    },
    update(dt, speedScale) {
      const step = dt * Math.min(speedScale, 4);
      for (const w of walkers) {
        if (!w.active) continue;
        const limbs = w.obj.userData.limbs as THREE.Mesh[];
        if (w.served >= 0) w.served += step;
        if (w.boing > 0) w.boing = Math.max(0, w.boing - step);
        if (w.wait > 0) {
          w.wait -= step;
          for (const l of limbs) l.rotation.x *= 0.8;
          w.obj.position.y = 0.12;
          if (w.boing > 0) {
            // Served: a quick stretch up, then settle (a happy little boing).
            const k = Math.sin((1 - w.boing / 0.35) * Math.PI) * 0.16 * MOTION;
            w.obj.scale.set(w.base * (1 - k * 0.4), w.base * (1 + k), w.base * (1 - k * 0.4));
          } else if (w.photo > 0) {
            // Snap! Both mittens up to the face, then a little flinch on the shutter.
            limbs[2].rotation.x = limbs[3].rotation.x = -2.1;
            const k = w.wait < 0.3 ? Math.sin((w.wait / 0.3) * Math.PI) * 0.08 * MOTION : 0;
            w.obj.scale.set(w.base * (1 + k), w.base * (1 - k), w.base * (1 + k));
            continue;
          } else if (w.huff) {
            idlePose(w.obj, w.phase + w.wait * 2, w.base);
            limbs[0].rotation.x = Math.sin(w.wait * 30) > 0.3 ? -0.3 * MOTION : 0; // tap tap tap
          } else idlePose(w.obj, w.phase + w.wait * 2, w.base);
          if (w.cup.visible) limbs[3].rotation.x = -0.9; // hold the cup up
          continue;
        }
        const target = w.path[w.leg];
        const pos = w.obj.position;
        const dx = target.x - pos.x, dz = target.z - pos.z;
        const dist = Math.hypot(dx, dz);
        const wet = weather === 'rainy' || weather === 'storm';
        const move = w.speed * step * (w.huff ? 1.35 : 1) * (wet ? 1.3 : weather === 'scorcher' ? 0.85 : 1);
        if (dist <= move) {
          pos.set(target.x, pos.y, target.z);
          // Arrived at the counter (the middle waypoint of a detour).
          if (w.popup?.atCounter && w.leg === 2) {
            const sale = w.popup.kind === 'sale';
            w.wait = sale ? 0.9 : 0.4;
            if (weather === 'scorcher' && Math.random() < 0.3) onArrive(pos.clone().setY(2.1 * w.base), '', 'sweat', w.obj);
            // Gave up on the line: a foot-tapping wait, then stomp off quicker.
            if (!sale && w.popup.text === 'line') { w.wait = 1.2; w.huff = true; }
            if (sale) { w.cup.visible = true; w.served = 0; w.boing = 0.35; }
            onArrive(pos.clone().setY(2.1 * w.base), w.popup.text, w.popup.kind, w.obj);
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
          onArrive(pos.clone().setY(2.1 * w.base), w.popup.text, 'miss', w.obj);
        }
        pos.x += (dx / dist) * move;
        pos.z += (dz / dist) * move;
        w.obj.rotation.y = Math.atan2(dx, dz);
        const g = GAIT[w.huff ? 'stride' : w.gait];
        if (w.photo > 0) w.photo = -1;
        w.phase += step * w.speed * 3.2 * g.cadence;
        const swing = Math.sin(w.phase) * g.swing;
        limbs[0].rotation.x = swing;
        limbs[1].rotation.x = -swing;
        limbs[2].rotation.x = wet ? -2.6 : -swing * 0.8;
        hopPose(w.obj, w.phase, w.base, 0.12, w.huff ? 1.4 : g.hop);
        if (w.huff) w.obj.rotation.x = 0.12; else w.obj.rotation.x = w.gait === 'shuffle' ? 0.08 : 0;
        // A few steps after the counter, the buyer stops swinging the cup and sips.
        const sipping = w.cup.visible && w.served > 1.6 && w.served < 2.6;
        limbs[3].rotation.x = w.cup.visible ? (sipping ? -2.3 : -0.7) : swing * 0.8;
        if (sipping && !w.sipped) {
          w.sipped = true;
          onArrive(pos.clone().setY(2.1 * w.base), '', 'sip', w.obj);
        }
      }
    },
    clear() {
      for (const w of walkers) { w.active = false; w.obj.visible = false; }
    },
    activeCount() { return walkers.filter((w) => w.active).length; },
    setWeather(kind) {
      if (kind === weather) return;
      weather = kind;
      const wet = kind === 'rainy' || kind === 'storm';
      for (const u of umbrellas) u.visible = wet;
    },
  };
}
