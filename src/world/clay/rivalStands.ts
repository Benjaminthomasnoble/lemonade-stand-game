// Rival stands (design spec, "Stands L1-L5"): the same five silhouettes in
// faction colours, topped by a bowler, sun-tea jar, soda bottle, coffee cup or
// surfboard, and dressed in family props. Built static: one baked body plus
// the sign label.
import * as THREE from 'three';
import { Baker, GLOSS, PAPER, box, cone, cyl, hash, lathe, lumpy, sph, tor } from './core.ts';
import { P } from './palette.ts';
import { buildLevel, farLevel, type Anchors } from './stands.ts';
import { DRESS, stick, rbox, rope } from './standKit.ts';
import type { RivalId } from '../../sim/economy.ts';

type V3 = [number, number, number];

/** The faction's topper, standing on the sign at `p`, scaled by `s`. */
function topper(B: Baker, id: RivalId, p: V3, s: number) {
  const at = (x: number, y: number, z: number): V3 => [p[0] + x * s, p[1] + y * s, p[2] + z * s];
  const d = DRESS[id];
  switch (id) {
    case 'sourwood': // a bowler
      B.add(lumpy(new THREE.SphereGeometry(0.42, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0.015, 4, 2), d.main, { p: at(0, 0.12, 0), s: s * 1 });
      B.add(cyl(0.68, 0.7, 0.06, 22), d.main, { p: at(0, 0.12, 0), s: [s, s, s * 0.8] });
      B.add(cyl(0.43, 0.43, 0.1, 20, true), d.accent, { p: at(0, 0.18, 0), s, fx: GLOSS });
      break;
    case 'hollis': // a sun-tea jar
      B.add(lathe([[0, 0], [0.3, 0.02], [0.33, 0.1], [0.33, 0.7], [0.24, 0.8], [0.24, 0.86], [0, 0.86]], 20), '#e3a45c', { p: at(0, 0, 0), s, fx: GLOSS });
      B.add(cyl(0.26, 0.26, 0.1, 18), d.accent, { p: at(0, 0.9, 0), s });
      for (let k = 0; k < 4; k++) B.add(box(0.12, 0.12, 0.01), k % 2 ? '#ffffff' : d.accent, { p: at(-0.18 + k * 0.12, 0.45, 0.335), s, fx: PAPER });
      B.add(sph(0.08, 8, 6), P.lemon, { p: at(0.1, 0.62, 0.2), s: [s * 1.3, s * 0.4, s] });
      break;
    case 'fizzco': // a soda bottle
      B.add(lathe([[0, 0], [0.24, 0.02], [0.26, 0.12], [0.22, 0.5], [0.25, 0.62], [0.12, 0.9], [0.09, 1.1], [0.1, 1.14], [0, 1.14]], 20), d.main, { p: at(0, 0, 0), s, fx: GLOSS });
      B.add(cyl(0.27, 0.27, 0.22, 18), '#ffffff', { p: at(0, 0.32, 0), s, fx: PAPER });
      B.add(cyl(0.11, 0.11, 0.07, 14), d.accent, { p: at(0, 1.17, 0), s, fx: GLOSS });
      for (let k = 0; k < 5; k++) B.add(sph(0.035, 6, 5), d.accent, { p: at((hash(k) - 0.5) * 0.4, 0.3 + hash(k, 2) * 0.1, 0.27), s: [s, s, s * 0.5], fx: GLOSS });
      break;
    case 'coldbrew': // a coffee cup with a lid and a pink sleeve
      B.add(lathe([[0, 0], [0.24, 0], [0.32, 0.8], [0, 0.8]], 20), d.accent === '#FF4FA3' ? P.oat : P.oat, { p: at(0, 0, 0), s, fx: PAPER });
      B.add(cyl(0.3, 0.27, 0.26, 18, true), P.neon, { p: at(0, 0.42, 0), s, fx: PAPER });
      B.add(cyl(0.35, 0.34, 0.08, 18), d.main, { p: at(0, 0.84, 0), s });
      B.add(cyl(0.22, 0.3, 0.06, 18), d.main, { p: at(0, 0.9, 0), s });
      B.add(cyl(0.025, 0.025, 0.4, 6), P.neon, { p: at(0.08, 1.05, 0), r: [0, 0, 0.25], s });
      break;
    case 'blenders': // a surfboard on end
      B.add(lumpy(sph(0.32, 16, 10), 0.01, 4, 2), d.main, { p: at(0, 0.85, 0), s: [s * 0.95, s * 2.6, s * 0.18] });
      B.add(box(0.1, 1.5, 0.02), d.accent, { p: at(0, 0.85, 0.06), s, fx: PAPER });
      B.add(cone(0.1, 0.2, 3), d.accent, { p: at(0, 0.35, -0.08), r: [Math.PI, 0, 0], s: [s, s, s * 0.3] });
      break;
  }
}

/** Family props beside the stand. */
function familyProps(B: Baker, id: RivalId, a: Anchors, level: number) {
  const d = DRESS[id];
  const g = (p: V3): V3 => p;
  const x = a.cooler[0], z = a.cooler[2];
  switch (id) {
    case 'sourwood': {
      // A clipped topiary in a plum planter and a silver tray of glasses.
      B.add(rbox(0.6, 0.5, 0.6, 0.06), d.main, { p: g([x, 0.25, z]) });
      B.add(cyl(0.05, 0.05, 0.4, 6), P.walnut, { p: [x, 0.7, z] });
      B.add(lumpy(sph(0.42, 14, 10), 0.04, 3, 1), '#3f8f4f', { p: [x, 1.15, z] });
      B.add(cyl(0.3, 0.3, 0.03, 18), P.chrome, { p: [a.cups[0], a.counterY + 0.02, a.cups[2]], fx: GLOSS });
      for (let k = 0; k < 3; k++) B.add(cyl(0.06, 0.05, 0.16, 10), '#f6e27a', { p: [a.cups[0] - 0.12 + k * 0.12, a.counterY + 0.11, a.cups[2]], fx: GLOSS });
      break;
    }
    case 'hollis': {
      // A hay bale and a big sweet-tea barrel.
      B.add(lumpy(rbox(0.9, 0.5, 0.55, 0.1), 0.03, 6, 3), P.straw, { p: [a.crate[0], 0.25, a.crate[2]] });
      for (const s of [-1, 1]) B.add(tor(0.29, 0.015, 4, 16), P.walnut, { p: [a.crate[0] + s * 0.25, 0.25, a.crate[2]], r: [0, Math.PI / 2, 0] });
      B.add(lathe([[0, 0], [0.33, 0], [0.38, 0.35], [0.33, 0.7], [0, 0.7]], 16), P.tea, { p: [x, 0, z], fx: PAPER });
      for (const y of [0.15, 0.55]) B.add(tor(0.36, 0.02, 4, 18), INK2, { p: [x, y, z], r: [Math.PI / 2, 0, 0] });
      B.add(cyl(0.03, 0.03, 0.12, 6), P.chrome, { p: [x, 0.25, z + 0.38], r: [Math.PI / 2, 0, 0], fx: GLOSS });
      break;
    }
    case 'fizzco': {
      // A red cooler of soda bottles.
      B.add(rbox(0.85, 0.55, 0.6, 0.08), d.main, { p: [x, 0.28, z], fx: GLOSS });
      B.add(rbox(0.88, 0.06, 0.63, 0.03), P.chrome, { p: [x, 0.57, z], fx: GLOSS });
      for (let k = 0; k < 4; k++) B.add(lathe([[0, 0], [0.06, 0], [0.06, 0.18], [0.025, 0.28], [0, 0.28]], 8), d.main, { p: [x - 0.24 + k * 0.16, 0.6, z], fx: GLOSS });
      break;
    }
    case 'coldbrew': {
      // A drip tower on the counter and a quarter-pipe beside the stand.
      const px = a.jar[0], pz = a.jar[2], y = a.counterY;
      for (const yy of [0, 0.6]) B.add(cyl(0.22, 0.22, 0.05, 14), P.walnut, { p: [px, y + yy + 0.03, pz], fx: PAPER });
      for (const s of [-1, 1]) B.add(cyl(0.02, 0.02, 0.7, 5), P.walnut, { p: [px + s * 0.19, y + 0.35, pz], fx: PAPER });
      B.add(sph(0.14, 10, 8), d.main, { p: [px, y + 0.78, pz], fx: GLOSS });
      B.add(cyl(0.11, 0.13, 0.26, 12), d.main, { p: [px, y + 0.18, pz], fx: GLOSS });
      const rx = a.crate[0] - 0.4 * level, rz = a.crate[2] - 0.2;
      B.add(new THREE.CylinderGeometry(1.1, 1.1, 1.4, 14, 1, true, 0, Math.PI / 2), P.oat, { p: [rx, 1.1, rz], r: [0, 0, Math.PI / 2], fx: PAPER });
      for (const s of [-1, 1]) B.add(box(1.15, 1.1, 0.05), '#cdbd9e', { p: [rx, 0.55, rz + s * 0.7], fx: PAPER });
      const zz: V3[] = [];
      for (let k = 0; k <= 8; k++) zz.push([rx - 0.5 + k * 0.125, 0.5 + (k % 2 ? 0.12 : -0.12), rz + 0.73]);
      B.add(rope(zz, 0.025, 16, 4), P.neon, { fx: 0.7 });
      break;
    }
    case 'blenders': {
      // A big blender on the counter and a surfboard stuck in the sand.
      const px = a.jar[0], pz = a.jar[2], y = a.counterY;
      B.add(rbox(0.3, 0.16, 0.3, 0.05), INK2, { p: [px, y + 0.08, pz] });
      B.add(lathe([[0, 0], [0.12, 0], [0.16, 0.4], [0, 0.4]], 14), P.mango, { p: [px, y + 0.16, pz], fx: GLOSS });
      B.add(cyl(0.17, 0.17, 0.05, 14), d.accent, { p: [px, y + 0.58, pz] });
      B.add(lumpy(sph(0.3, 14, 10), 0.01, 4, 6), d.accent, { p: [x, 0.8, z], s: [0.9, 2.4, 0.16], r: [0.15, 0.4, 0.1] });
      B.add(box(0.08, 1.3, 0.02), d.main, { p: [x, 0.8, z + 0.05], r: [0.15, 0.4, 0.1], fx: PAPER });
      B.add(lumpy(sph(0.5, 12, 8), 0.04, 3, 2), P.sand, { p: [x, 0, z], s: [1.2, 0.3, 1.1] });
      break;
    }
  }
  // Their crate of stock: a stick crate of the faction's product colour.
  if (id !== 'hollis') {
    const [cx, , cz] = a.crate;
    for (const y of [0.1, 0.28]) for (const zz of [-0.25, 0.25]) stick(B, 0.8, [cx, y, cz + zz], [0, 0, Math.PI / 2], '#d9ad72', 0.12, 0.035);
    B.add(box(0.8, 0.04, 0.52), '#c79a62', { p: [cx, 0.02, cz], fx: PAPER });
    for (let k = 0; k < 6; k++) B.add(sph(0.1, 6, 4), d.main, { p: [cx - 0.25 + (k % 3) * 0.25, 0.32, cz - 0.1 + Math.floor(k / 3) * 0.2], fx: id === 'fizzco' ? GLOSS : 0 });
  }
}
const INK2 = '#2b2b38';

/** A rival stand at a level, optionally showing a damage step (`hp` 0..1); in a storm an L1-L2's card flaps. */
export function rivalStand(id: RivalId, level: number, hp = 1, storm = false): THREE.Group {
  const L = Math.max(1, Math.min(5, level));
  const m = buildLevel(L, id, {
    static: true, hp, flap: storm,
    decor: (B, a, lv) => {
      const s = [0.7, 0.8, 0.95, 1.1, 1.25][lv - 1];
      // On a Palace the topper goes giant, on the pole where our lemon spins.
      if (lv === 5 && a.pole) topper(B, id, a.pole, 1.7);
      else if (hp > 0.5) topper(B, id, a.stars, s);
      familyProps(B, id, a, lv);
    },
  });
  m.root.name = 'rivalStand';
  m.root.userData.far = farLevel(L, id);
  m.root.userData.serveZ = m.serveZ;
  return m.root;
}
