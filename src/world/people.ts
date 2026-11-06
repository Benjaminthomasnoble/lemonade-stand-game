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

export function makePerson(shirt?: number, pants?: number, skin?: number): THREE.Group {
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
  popup?: { text: string; kind: 'sale' | 'soldout' };
}

export interface Crowd {
  spawn(kind: 'pass' | 'sale' | 'soldout', text?: string): boolean;
  update(dt: number, speedScale: number): void;
  clear(): void;
  activeCount(): number;
}

const SIDEWALK_Z = 2.2;
const EDGE_X = 32;
const POOL = 70;

export function createCrowd(scene: THREE.Scene, servePoint: THREE.Vector3,
  onArrive: (pos: THREE.Vector3, text: string, kind: 'sale' | 'soldout') => void): Crowd {
  const walkers: Walker[] = [];
  for (let i = 0; i < POOL; i++) {
    const obj = makePerson();
    obj.visible = false;
    scene.add(obj);
    walkers.push({ obj, active: false, path: [], leg: 0, wait: 0, phase: 0, speed: 0 });
  }
  let queueSlot = 0;

  return {
    spawn(kind, text = '') {
      const w = walkers.find((x) => !x.active);
      if (!w) return false; // pool full: the sale still counts, we just don't draw it
      const dir = Math.random() < 0.5 ? 1 : -1;
      const z = SIDEWALK_Z + (Math.random() - 0.5) * 1.2;
      const start = new THREE.Vector3(-EDGE_X * dir, 0.12, z);
      const end = new THREE.Vector3(EDGE_X * dir, 0.12, z);
      w.path = [start];
      if (kind !== 'pass') {
        const slot = (queueSlot++ % 5) - 2;
        const counter = servePoint.clone().add(new THREE.Vector3(slot * 0.55, 0, Math.abs(slot) * 0.25));
        w.path.push(new THREE.Vector3(counter.x - dir * 1.5, 0.12, z), counter, new THREE.Vector3(counter.x + dir * 1.5, 0.12, z));
        w.popup = { text, kind };
      } else {
        w.popup = undefined;
      }
      w.path.push(end);
      w.leg = 1;
      w.wait = 0;
      w.phase = Math.random() * 6;
      w.speed = 2.4 + Math.random() * 0.9;
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
          if (w.popup && w.leg === 2) {
            w.wait = 0.9;
            w.obj.rotation.y = Math.PI;
            onArrive(pos.clone().setY(2.1), w.popup.text, w.popup.kind);
          }
          w.leg++;
          if (w.leg >= w.path.length) { w.active = false; w.obj.visible = false; }
          continue;
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
