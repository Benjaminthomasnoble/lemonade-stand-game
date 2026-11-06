// Low-poly pedestrians. The sim decides who buys; this module only walks
// them along the sidewalk, detours buyers to the counter and reports when
// they arrive so the HUD can pop "+50¢" over their heads.
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
}

export type WalkerKind = 'pass' | 'sale' | 'miss' | 'grumble';

/** Where a walker goes: along a sidewalk from x0 to x1, optionally detouring to a counter. */
export interface Route { x0: number; x1: number; z: number; serve?: THREE.Vector3; grumbleX?: number }

export interface Crowd {
  /** sale/miss detour to the counter; grumble pops its text while walking past. */
  spawn(kind: WalkerKind, route: Route, text?: string, opts?: { scale?: number; speed?: number }): boolean;
  update(dt: number, speedScale: number): void;
  clear(): void;
  activeCount(): number;
}

/** Laptop cap from the spec (about 150 animated people in Street View). */
export const CROWD_POOL = 150;

export function createCrowd(scene: THREE.Scene, onArrive: (pos: THREE.Vector3, text: string, kind: 'sale' | 'miss') => void, pool = CROWD_POOL): Crowd {
  const walkers: Walker[] = [];
  for (let i = 0; i < pool; i++) {
    const obj = makePerson();
    obj.visible = false;
    scene.add(obj);
    walkers.push({ obj, active: false, path: [], leg: 0, wait: 0, phase: 0, speed: 0, shown: false, grumbleX: 0 });
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
      w.obj.scale.setScalar(opts.scale ?? 1);
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
        if (w.wait > 0) {
          w.wait -= step;
          for (const l of limbs) l.rotation.x *= 0.8;
          continue;
        }
        const target = w.path[w.leg];
        const pos = w.obj.position;
        const dx = target.x - pos.x, dz = target.z - pos.z;
        const dist = Math.hypot(dx, dz);
        const move = w.speed * step;
        if (dist <= move) {
          pos.set(target.x, pos.y, target.z);
          // Arrived at the counter (the middle waypoint of a detour).
          if (w.popup?.atCounter && w.leg === 2) {
            w.wait = w.popup.kind === 'sale' ? 0.9 : 0.4;
            onArrive(pos.clone().setY(2.1 * w.obj.scale.y), w.popup.text, w.popup.kind);
          }
          w.leg++;
          if (w.leg >= w.path.length) { w.active = false; w.obj.visible = false; }
          continue;
        }
        if (w.popup && !w.popup.atCounter && !w.shown && Math.abs(pos.x - w.grumbleX) < 1) {
          w.shown = true;
          onArrive(pos.clone().setY(2.1 * w.obj.scale.y), w.popup.text, 'miss');
        }
        pos.x += (dx / dist) * move;
        pos.z += (dz / dist) * move;
        w.obj.rotation.y = Math.atan2(dx, dz);
        w.phase += step * w.speed * 3.2;
        const swing = Math.sin(w.phase) * 0.6;
        limbs[0].rotation.x = swing;
        limbs[1].rotation.x = -swing;
        limbs[2].rotation.x = -swing * 0.8;
        limbs[3].rotation.x = swing * 0.8;
        pos.y = 0.12 + Math.abs(Math.cos(w.phase)) * 0.04;
      }
    },
    clear() {
      for (const w of walkers) { w.active = false; w.obj.visible = false; }
    },
    activeCount() { return walkers.filter((w) => w.active).length; },
  };
}
