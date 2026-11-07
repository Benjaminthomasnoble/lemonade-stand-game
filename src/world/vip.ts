// Pickup moments (canon section 15): a VIP chopper lands on your helipad or
// a ship ties up at your pier, loads, and leaves. Purely visual: the sim has
// already paid out by the time this plays.
import * as THREE from 'three';
import { PLAYER_COLOR } from '../sim/economy.ts';
import { clayFrom } from './clay/kit.ts';
import type { PlotView } from './bay.ts';

const mats = new Map<number, THREE.MeshStandardMaterial>();
const m = (c: number, rough = 0.5, metal = 0.2) => {
  let x = mats.get(c);
  if (!x) { x = clayFrom(c, rough, 0, metal); mats.set(c, x); }
  return x;
};
function add(g: THREE.Object3D, geo: THREE.BufferGeometry, c: number, x: number, y: number, z: number) {
  const mesh = new THREE.Mesh(geo, m(c));
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  g.add(mesh);
  return mesh;
}

function chopper(): { group: THREE.Group; rotor: THREE.Object3D } {
  const g = new THREE.Group();
  const body = add(g, new THREE.SphereGeometry(1.1, 16, 12), 0x1d3557, 0, 1.3, 0);
  body.scale.set(1, 0.85, 1.6);
  add(g, new THREE.SphereGeometry(0.75, 12, 10), 0x9fd3f0, 0, 1.45, 0.95).scale.set(1, 0.8, 0.7);
  add(g, new THREE.CylinderGeometry(0.18, 0.28, 3.2, 8), 0x1d3557, 0, 1.5, -2.4).rotation.x = Math.PI / 2;
  add(g, new THREE.BoxGeometry(0.1, 0.9, 0.6), PLAYER_COLOR, 0, 1.9, -3.9);
  for (const x of [-0.8, 0.8]) add(g, new THREE.BoxGeometry(0.1, 0.1, 2.6), 0x333333, x, 0.1, 0);
  const rotor = new THREE.Group();
  rotor.position.set(0, 2.35, 0);
  add(rotor, new THREE.BoxGeometry(7, 0.06, 0.3), 0x222222, 0, 0, 0);
  add(rotor, new THREE.BoxGeometry(0.3, 0.06, 7), 0x222222, 0, 0, 0);
  g.add(rotor);
  return { group: g, rotor };
}

function ship(big: boolean): THREE.Group {
  const g = new THREE.Group();
  const L = big ? 22 : 12, W = big ? 6 : 3.6;
  add(g, new THREE.BoxGeometry(W, 2, L), 0xf2f2f2, 0, 0.6, 0);
  add(g, new THREE.BoxGeometry(W + 0.05, 0.5, L + 0.05), 0x1d3557, 0, -0.2, 0);
  add(g, new THREE.BoxGeometry(W * 0.7, 1.8, L * 0.4), 0xffffff, 0, 2.5, -L * 0.1);
  add(g, new THREE.BoxGeometry(W * 0.55, 1.4, L * 0.25), 0xffffff, 0, 4.1, -L * 0.15);
  add(g, new THREE.CylinderGeometry(0.6, 0.7, 2.4, 10), PLAYER_COLOR, 0, 5.4, -L * 0.25);
  const bow = add(g, new THREE.ConeGeometry(W / 2, 3, 4), 0xf2f2f2, 0, 0.6, L / 2 + 1.4);
  bow.rotation.x = Math.PI / 2;
  bow.rotation.y = Math.PI / 4;
  return g;
}

export interface VipView {
  play(kind: 'heli' | 'ship', view: PlotView, big: boolean, level?: number): void;
  update(dt: number): void;
  active(): boolean;
  where(): number[] | null;
}

export function createVip(scene: THREE.Scene): VipView {
  let job: { kind: 'heli' | 'ship'; obj: THREE.Group; rotor?: THREE.Object3D; t: number; path: (t: number) => { pos: THREE.Vector3; yaw: number }; length: number } | null = null;

  return {
    play(kind, view, big, level = 1) {
      if (job) scene.remove(job.obj);
      const at = (x: number, y: number, z: number) => view.root.localToWorld(new THREE.Vector3(x, y, z));
      const yaw0 = view.root.rotation.y;
      if (kind === 'heli') {
        const { group, rotor } = chopper();
        const pad = at(0, 0.2, -2.5);
        const from = at(-60, 40, -80), to = at(70, 45, -90);
        // In 4 s, hover, settle 4 s (loading), lift off 4 s.
        const path = (t: number) => {
          if (t < 4) { const k = t / 4, e = 1 - (1 - k) ** 2; return { pos: from.clone().lerp(pad.clone().setY(pad.y + 6), e), yaw: yaw0 + 0.6 * (1 - k) }; }
          if (t < 5.5) { const k = (t - 4) / 1.5; return { pos: pad.clone().setY(pad.y + 6 * (1 - k)), yaw: yaw0 }; }
          if (t < 9.5) return { pos: pad.clone(), yaw: yaw0 };
          const k = (t - 9.5) / 4, e = k * k;
          return { pos: pad.clone().setY(pad.y + 8 * Math.min(1, k * 2)).lerp(to, e), yaw: yaw0 - 0.8 * k };
        };
        scene.add(group);
        job = { kind, obj: group, rotor, t: 0, path, length: 13.5 };
      } else {
        const obj = ship(big);
        const len = big ? 22 : 12;
        const pierLen = 12 + level * 6, pierW = 3 + level;
        const side = pierW / 2 + (big ? 3 : 1.8) + 0.4;
        const berth = at(side, 0, -Math.max(pierLen - len / 2 + 1, 16 + len / 2)); // moored at the pier head, clear of the beach
        const far = at(side, 0, -160);
        const path = (t: number) => {
          if (t < 6) { const k = t / 6, e = 1 - (1 - k) ** 3; return { pos: far.clone().lerp(berth, e), yaw: yaw0 }; }
          if (t < 11) return { pos: berth.clone().setY(Math.sin(t * 2) * 0.05), yaw: yaw0 };
          const k = (t - 11) / 6, e = k * k;
          return { pos: berth.clone().lerp(far, e), yaw: yaw0 + Math.PI * Math.min(1, k * 1.5) };
        };
        scene.add(obj);
        job = { kind, obj, t: 0, path, length: 17 };
      }
      const p0 = job.path(0);
      job.obj.position.copy(p0.pos);
      job.obj.rotation.y = p0.yaw;
    },
    update(dt) {
      if (!job) return;
      job.t += dt;
      const p = job.path(job.t);
      job.obj.position.copy(p.pos);
      job.obj.rotation.y = p.yaw;
      if (job.rotor) job.rotor.rotation.y += dt * 25;
      if (job.t > job.length) { scene.remove(job.obj); job = null; }
    },
    active: () => !!job,
    where: () => (job ? [job.obj.position.x, job.obj.position.y, job.obj.position.z, job.t] : null),
  };
}
