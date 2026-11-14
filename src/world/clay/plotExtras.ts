// Things that turn up on a plot for a while (the gameplay build's world brief): Hollis's hay-bale barricades behind
// a fence, scaffolding round a stand being rebuilt overnight, and a kid's lemonade table on Kids' Lemonade Day.
// Each is one baked clay draw in the plot's local frame (the street is toward +z, the plot spans x -5.5..5.5 and
// z -7.5..2.5), flagged disposable so bay.ts frees it when the plot is rebuilt.
import * as THREE from 'three';
import { Baker, GLOSS, PAPER, box, cyl, lathe, lumpy, rbox, sph, tor } from './core.ts';
import { kit } from './kit.ts';
import { P } from './palette.ts';
import { cardPlane, crayonSign } from './standKit.ts';

type V3 = [number, number, number];
const STRAW = '#E7C766', TWINE = '#A8743E', PLANK = '#C99A62';

function bake(B: Baker, name: string): THREE.Mesh {
  const m = new THREE.Mesh(B.build(), kit().world);
  m.name = name;
  m.castShadow = m.receiveShadow = true;
  m.userData.disposable = true;
  return m;
}

/** One lumpy straw bale with two twine bands, long side along x unless turned. */
function bale(B: Baker, [x, y, z]: V3, turn = 0, seed = 0) {
  const r: V3 = [0, turn, 0];
  B.add(lumpy(rbox(1.3, 0.62, 0.72, 0.14, 2), 0.035, 4, seed), STRAW, { p: [x, y + 0.31, z], r });
  for (const s of [-0.34, 0.34]) {
    const dx = Math.cos(turn) * s, dz = -Math.sin(turn) * s;
    B.add(box(0.06, 0.64, 0.75), TWINE, { p: [x + dx, y + 0.31, z + dz], r, fx: PAPER });
  }
  // a few loose straws poking out of the ends
  for (let k = 0; k < 2; k++) {
    const e = (k % 2 ? 1 : -1) * 0.66, h = 0.2 + k * 0.2;
    B.add(box(0.22, 0.025, 0.025), STRAW, { p: [x + Math.cos(turn) * e, y + h, z - Math.sin(turn) * e + (k - 1) * 0.15], r: [0, turn + (k - 1) * 0.5, 0.3] });
  }
}

/** Hollis's hay-bale barricades: bales stacked against the inside of the fence, either side of the gate. */
export function hayBaleWall(): THREE.Mesh {
  const B = new Baker();
  for (const s of [-1, 1]) {
    // two along the front either side of the gate, a third on top at the corner
    bale(B, [s * 3.5, 0, 1.75], 0, 1 + s);
    bale(B, [s * 4.85, 0, 1.75], 0, 3 + s);
    bale(B, [s * 4.2, 0.62, 1.75], 0.12 * s, 5 + s);
    // and one down each side
    bale(B, [s * 4.9, 0, 0.2], Math.PI / 2, 7 + s);
  }
  return bake(B, 'hay-bales');
}

/** Scaffolding round a wreck that's being rebuilt tonight: stick poles, plank decks, cross braces, a ladder and a tarp. */
export function scaffolding(tarp: string): THREE.Mesh {
  const B = new Baker();
  const W = 2.6, Z0 = -1.6, Z1 = 1.2, H = 3.4;
  const pole = (x: number, z: number) => B.add(box(0.14, H, 0.14), P.stick, { p: [x, H / 2, z], fx: PAPER });
  for (const x of [-W, 0, W]) for (const z of [Z0, Z1]) pole(x, z);
  for (const y of [1.5, 3.0]) {
    // a plank deck along the front and the back, and rails at each lift
    for (const z of [Z0, Z1]) {
      B.add(rbox(W * 2 + 0.5, 0.1, 0.55, 0.03), PLANK, { p: [0, y, z], fx: PAPER });
      B.add(box(W * 2 + 0.2, 0.08, 0.08), P.stick, { p: [0, y + 0.55, z + (z > 0 ? 0.22 : -0.22)], fx: PAPER });
    }
    for (const x of [-W, W]) B.add(box(0.1, 0.1, Z1 - Z0 + 0.3), P.stick, { p: [x, y, (Z0 + Z1) / 2], fx: PAPER });
  }
  // cross braces on the front bays
  for (const [x0, k] of [[-W, 1], [0, -1]] as const) {
    const len = Math.hypot(W, 1.5);
    B.add(box(0.08, len, 0.06), P.stick, { p: [x0 + W / 2, 0.75, Z1 + 0.1], r: [0, 0, k * Math.atan2(W, 1.5)], fx: PAPER });
  }
  // a ladder up the right-hand side
  for (const s of [-0.25, 0.25]) B.add(box(0.08, 3.1, 0.08), P.walnut, { p: [W + 0.45, 1.5, 0.2 + s], r: [0, 0, -0.12], fx: PAPER });
  for (let k = 0; k < 6; k++) B.add(box(0.06, 0.06, 0.5), P.walnut, { p: [W + 0.45 - 0.12 * (0.3 + k * 0.5) * 0.4, 0.3 + k * 0.5, 0.2], fx: PAPER });
  // a tarp in the owner's colour hung over the back bay, and a bucket and a stack of new sticks out front
  B.add(lumpy(box(W * 2 + 0.2, 2.4, 0.06), 0.05, 2, 4), tarp, { p: [0, 2.2, Z0 - 0.2], fx: PAPER });
  B.add(cyl(0.28, 0.22, 0.45, 12, true), '#8A8F9C', { p: [-1.7, 0.23, Z1 + 0.9], fx: GLOSS });
  B.add(tor(0.2, 0.025, 4, 12, Math.PI), '#8A8F9C', { p: [-1.7, 0.5, Z1 + 0.9] });
  for (let k = 0; k < 5; k++) B.add(box(1.6, 0.08, 0.16), P.stick, { p: [1.2, 0.05 + k * 0.08, Z1 + 1.0 + (k % 2) * 0.05], r: [0, (k - 2) * 0.04, 0], fx: PAPER });
  return bake(B, 'scaffold');
}

let signTemplate: THREE.Mesh | null = null;
/** A kid's Kids' Lemonade Day table: a card table, a pitcher and cups, a crayon "50¢" sign on a stick. */
export function kidTable(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'kid-stand';
  const B = new Baker();
  B.add(rbox(1.5, 0.08, 0.85, 0.03), P.terra, { p: [0, 0.82, 0.6] });
  for (const x of [-0.65, 0.65]) for (const z of [0.25, 0.95]) B.add(box(0.06, 0.8, 0.06), '#5B5568', { p: [x, 0.4, z] });
  // a gingham cloth hanging off the front
  for (let k = 0; k < 6; k++) B.add(box(0.25, 0.32, 0.02), k % 2 ? '#FFFDF6' : P.terra, { p: [-0.625 + k * 0.25, 0.68, 1.04], fx: PAPER });
  B.add(lathe([[0, 0], [0.17, 0], [0.19, 0.2], [0.15, 0.36], [0.16, 0.42], [0, 0.42]], 12), '#FFE27A', { p: [-0.35, 0.86, 0.55], fx: GLOSS });
  B.add(sph(0.06, 6, 4), P.lemon, { p: [-0.22, 1.25, 0.55] });
  for (let k = 0; k < 3; k++) B.add(cyl(0.07, 0.055, 0.16, 8), '#FFFDF6', { p: [0.15 + k * 0.18, 0.94, 0.75 - (k % 2) * 0.15] });
  // an upturned milk crate behind the table, so the kid can see over it
  B.add(rbox(0.7, 0.4, 0.55, 0.05), P.teal, { p: [0, 0.2, -0.05] });
  for (const x of [-0.18, 0, 0.18]) B.add(box(0.08, 0.26, 0.02), '#2E7F80', { p: [x, 0.2, 0.235] });
  // the sign's stick, taped to the table leg
  B.add(box(0.06, 1.5, 0.04), P.stick, { p: [0.75, 0.75, 1.0], fx: PAPER });
  g.add(bake(B, 'kid-table'));
  signTemplate ??= (() => { const m = cardPlane(crayonSign('50¢'), 0.95, 0.38, true); m.name = 'kid-sign'; return m; })();
  const sign = signTemplate.clone(); // shares the texture, plane and material with every kid stand
  sign.position.set(0.75, 1.4, 1.04);
  sign.rotation.z = 0.06;
  g.add(sign);
  return g;
}
