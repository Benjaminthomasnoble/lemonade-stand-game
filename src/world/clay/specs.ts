// Stand specializations on the player's stand (spec: Stands, Specializations): the
// fit-outs a Kiosk and a Citrus Palace slot in, each shown as clay on the stand.
// - Express Window: a pass-through hatch on the side wall with a striped flap,
//   a pick-up shelf with a bell, and a lightning-bolt badge.
// - Fancy Menu: a walnut-framed raspberry easel menu with a lemon crown, beside
//   two lemon stanchions on a raspberry velvet rope.
// - Fortified Frame: wide riveted steel corner plates, a steel skirt across the
//   lower front, side cross-braces and a knee-high sandbag wall at each corner.
// - Billboard Roof: a lit billboard on stilts above the roof, with a big clay
//   lemon and the mascot on it.
// All of a stand's fit-outs bake into one clay draw, with a box-silhouette far
// version for Bay View's district block.
import * as THREE from 'three';
import type { SpecId } from '../../sim/balance.ts';
import { Baker, GLOSS, PAPER, box, cone, cyl, lumpy, sph } from './core.ts';
import { P } from './palette.ts';
import { INK, lemon, rbox, rod, rope, stick } from './standKit.ts';
import { mascot } from './stands.ts';

type V3 = [number, number, number];

const STEEL = '#8d96a3', RIVET = '#5f6773', SAND = '#cdb57e', RASP = '#C8325A', BOLT = '#ff6a4d';

/** Where each fit-out goes on the Kiosk (L3), the Shack (L4) and the Palace (L5). */
interface Layout {
  /** Express hatch: a point on the outside of the left wall, and which way it faces. */
  hatch: V3; hatchRy: number;
  /** Fancy Menu easel on the ground at the front left. */
  easel: V3;
  /** Front corners (x half-width, front z), wall height, back z (no side braces when null), and the steel skirt's z. */
  hw: number; zf: number; h: number; zb: number | null; skirtZ: number;
  /** Billboard: its centre, width, and how far down its stilts reach. */
  board: V3; bw: number; legTo: number;
}
const LAYOUT: Record<3 | 4 | 5, Layout> = {
  3: { hatch: [-1.8, 1.45, -0.75], hatchRy: -Math.PI / 2, easel: [-1.15, 0, 1.4], hw: 1.8, zf: 0.6, h: 2.7, zb: -1.8, skirtZ: 0.7, board: [0, 4.05, -1.15], bw: 2.6, legTo: 2.9 },
  4: { hatch: [-2.53, 1.45, -1.75], hatchRy: -Math.PI / 2, easel: [-1.45, 0, 1.55], hw: 2.5, zf: 0.5, h: 3.0, zb: -2.5, skirtZ: 0.6, board: [0, 5.25, -2.0], bw: 3.2, legTo: 3.3 },
  5: { hatch: [-2.47, 1.45, -2.3], hatchRy: -Math.PI / 2, easel: [-1.0, 0, 1.55], hw: 2.0, zf: 0.3, h: 2.7, zb: null, skirtZ: 0.4, board: [0, 5.55, -3.6], bw: 3.4, legTo: 2.8 },
};

const at = (p: V3, ry = 0) => new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(1, 1, 1));

/** The hatch, built facing +z with its back on the wall at the origin. */
function expressWindow(): THREE.BufferGeometry {
  const B = new Baker();
  B.add(rbox(1.15, 1.05, 0.22, 0.06), P.cream, { p: [0, 0, 0.1] });
  B.add(box(0.82, 0.62, 0.06), '#5a4030', { p: [0, 0.04, 0.2], fx: 0.6 }); // lamplit inside
  for (const s of [-1, 1]) B.add(box(0.07, 0.72, 0.08), P.teal, { p: [s * 0.45, 0.04, 0.23] });
  B.add(box(0.98, 0.07, 0.08), P.teal, { p: [0, 0.41, 0.23] });
  // The pick-up shelf and its bell.
  B.add(rbox(1.2, 0.08, 0.42, 0.03), P.walnut, { p: [0, -0.3, 0.38], fx: PAPER });
  B.add(cyl(0.02, 0.1, 0.08, 10), P.gold, { p: [0.36, -0.22, 0.45], fx: GLOSS });
  B.add(sph(0.025, 6, 5), P.gold, { p: [0.36, -0.17, 0.45], fx: GLOSS });
  // The flap, propped up and out: lemon and white card panels.
  for (let k = 0; k < 6; k++) B.add(box(0.2, 0.035, 0.6), k % 2 ? P.white : P.lemon, { p: [-0.5 + k * 0.2, 0.58, 0.48], r: [0.35, 0, 0], fx: PAPER });
  for (let k = 1; k < 6; k++) B.add(box(0.014, 0.04, 0.6), INK, { p: [-0.5 + k * 0.2 - 0.1, 0.585, 0.48], r: [0.35, 0, 0] });
  for (const s of [-1, 1]) rod(B, [s * 0.52, 0.32, 0.3], [s * 0.52, 0.48, 0.76], 0.018, P.chrome);
  // A lightning-bolt badge on the wall beside it: quick service, no words needed.
  const bolt: [V3, number][] = [[[0.82, 0.32, 0.12], -0.5], [[0.78, 0.12, 0.12], 0.9], [[0.83, -0.08, 0.12], -0.5]];
  B.add(cyl(0.24, 0.24, 0.05, 16), P.white, { p: [0.8, 0.12, 0.08], r: [Math.PI / 2, 0, 0] });
  for (const [p, rz] of bolt) B.add(box(0.07, 0.24, 0.05), BOLT, { p, r: [0, 0, rz] });
  return B.build();
}

/** The easel menu and the velvet rope, standing at the origin, facing +z: raspberry, walnut and lemon, never a rival's livery. */
function fancyMenu(): THREE.BufferGeometry {
  const B = new Baker();
  for (const s of [-1, 1]) stick(B, 1.5, [s * 0.32, 0.72, 0.05], [-0.12, 0, s * -0.08], P.walnut, 0.07, 0.05);
  stick(B, 1.4, [0, 0.68, -0.25], [0.3, 0, 0], P.walnut, 0.06, 0.04);
  const tilt: V3 = [-0.12, 0, 0];
  B.add(rbox(0.78, 0.98, 0.06, 0.03), RASP, { p: [0, 1.0, 0.12], r: tilt });
  // A walnut frame, cream script menu lines with lemon price dots, and a lemon crown on top.
  for (const y of [0.52, 1.48]) B.add(box(0.86, 0.07, 0.09), P.walnut, { p: [0, y, 0.12 + (y - 1) * 0.12], r: tilt, fx: PAPER });
  for (const s of [-1, 1]) B.add(box(0.07, 1.0, 0.09), P.walnut, { p: [s * 0.42, 1.0, 0.12], r: tilt, fx: PAPER });
  for (let k = 0; k < 4; k++) {
    const y = 1.28 - k * 0.2, z = 0.17 + (y - 1) * 0.12, w = k === 0 ? 0.26 : 0.22;
    const pts: V3[] = [];
    for (let i = 0; i <= 8; i++) pts.push([-w + (i / 8) * w * 2, y + Math.sin(i * 1.9 + k) * 0.025, z]);
    B.add(rope(pts, k === 0 ? 0.016 : 0.012, 10, 4), P.cream);
    if (k) B.add(sph(0.03, 6, 4), P.lemon, { p: [w + 0.07, y, z] });
  }
  B.add(cyl(0.13, 0.13, 0.06, 12), P.lemon, { p: [0, 1.56, 0.05], fx: GLOSS });
  for (const x of [-0.1, 0, 0.1]) B.add(cone(0.04, 0.12, 5), P.lemon, { p: [x, 1.65, 0.05], fx: GLOSS });
  B.add(sph(0.03, 6, 4), RASP, { p: [0, 1.73, 0.05], fx: GLOSS });
  // Two lemon-clay stanchions and a sagging raspberry velvet rope.
  for (const x of [-0.8, -1.6]) {
    B.add(cyl(0.16, 0.18, 0.05, 12), P.lemon, { p: [x, 0.03, 0.1], fx: GLOSS });
    B.add(cyl(0.035, 0.035, 0.85, 8), P.lemon, { p: [x, 0.45, 0.1], fx: GLOSS });
    B.add(sph(0.07, 8, 6), P.lemon, { p: [x, 0.9, 0.1], fx: GLOSS });
  }
  const sag: V3[] = [];
  for (let i = 0; i <= 8; i++) { const u = i / 8; sag.push([-0.8 - u * 0.8, 0.84 - Math.sin(u * Math.PI) * 0.2, 0.1]); }
  B.add(rope(sag, 0.035, 10, 5), RASP);
  return B.build();
}

/** Steel plates, a riveted skirt, braces and sandbag walls in the stand's own frame: chunky enough to read from mid zoom. */
function fortifiedFrame(L: Layout): THREE.BufferGeometry {
  const B = new Baker();
  const { hw, zf, h, zb, skirtZ } = L;
  const rivet = (p: V3) => B.add(sph(0.05, 6, 4), P.lemon, { p, s: [1.3, 1, 0.7], fx: GLOSS }); // lemon-shaped rivet heads
  for (const s of [-1, 1]) {
    // A wide angle plate wrapping each front corner, riveted.
    B.add(box(0.72, h, 0.08), STEEL, { p: [s * (hw - 0.3), h / 2, zf + 0.07], fx: GLOSS });
    B.add(box(0.08, h, 0.6), STEEL, { p: [s * (hw + 0.04), h / 2, zf - 0.22], fx: GLOSS });
    for (let y = 0.35; y < h - 0.1; y += 0.45) for (const dx of [0.12, 0.48]) rivet([s * (hw - dx), y, zf + 0.12]);
    // Cross-braces on the side walls.
    if (zb !== null) {
      const x = s * (hw + 0.09);
      rod(B, [x, 0.2, zf - 0.15], [x, h - 0.2, zb + 0.15], 0.07, STEEL, 6);
      rod(B, [x, h - 0.2, zf - 0.15], [x, 0.2, zb + 0.15], 0.07, STEEL, 6);
      B.add(sph(0.1, 8, 6), RIVET, { p: [x, h / 2, (zf + zb) / 2], s: [0.6, 1, 1], fx: GLOSS });
    }
    // A knee-high sandbag wall at the corner: three bags, two on top.
    for (let k = 0; k < 5; k++) {
      const top = k >= 3, i = top ? k - 3 : k;
      const dx = top ? (i - 0.5) * 0.5 : (i - 1) * 0.5;
      B.add(lumpy(sph(0.26, 10, 7), 0.02, 6, k + (s > 0 ? 5 : 0)), SAND, { p: [s * (hw + 0.45) + dx, top ? 0.42 : 0.16, zf + 0.55], s: [1.05, 0.62, 0.8], r: [0, (k - 2) * 0.15, 0] });
      B.add(box(0.05, 0.02, 0.3), '#a8925f', { p: [s * (hw + 0.45) + dx, top ? 0.58 : 0.32, zf + 0.55] }); // the tie
    }
  }
  // A riveted steel skirt across the lower front, under the counter.
  B.add(box(hw * 2 - 0.5, 0.5, 0.06), STEEL, { p: [0, 0.36, skirtZ], fx: GLOSS });
  B.add(box(hw * 2 - 0.5, 0.06, 0.08), RIVET, { p: [0, 0.6, skirtZ + 0.01], fx: GLOSS });
  for (let x = -hw + 0.55; x < hw - 0.5; x += 0.42) for (const y of [0.2, 0.48]) rivet([x, y, skirtZ + 0.04]);
  return B.build();
}

/** The billboard on its stilts, centred at the origin of its board, facing +z. */
function billboard(w: number, legDown: number): THREE.BufferGeometry {
  const B = new Baker();
  const bh = 1.3;
  B.add(rbox(w, bh, 0.12, 0.05), P.lemon, {});
  B.add(box(w - 0.2, bh - 0.2, 0.04), P.white, { p: [0, 0, 0.06], fx: PAPER });
  // A big clay lemon on the left, the mascot on the right, a wavy stripe under them.
  lemon(B, 0.36, [-w * 0.26, 0.05, 0.16], [0, 0, 0.3], P.lemon, 5);
  B.add(sph(0.1, 6, 5), P.green, { p: [-w * 0.26 + 0.18, 0.38, 0.14], s: [1.6, 0.5, 0.6], r: [0, 0, 0.5] });
  mascot(B, [w * 0.24, 0.04, 0.12], 1.25);
  const wave: V3[] = [];
  for (let i = 0; i <= 12; i++) wave.push([-w / 2 + 0.2 + (i / 12) * (w - 0.4), -0.48 + Math.sin(i * 1.3) * 0.04, 0.09]);
  B.add(rope(wave, 0.035, 16, 4), P.terra);
  // Stilts down to the roof, and two lamps leaning over the top.
  for (const s of [-1, 1]) {
    stick(B, legDown + bh / 2, [s * w * 0.32, -(legDown + bh / 2) / 2, -0.12], [0, 0, 0], P.stick, 0.14, 0.1);
    rod(B, [s * w * 0.3, bh / 2, -0.06], [s * w * 0.3, bh / 2 + 0.25, 0.32], 0.025, P.chrome);
    B.add(cone(0.12, 0.14, 8, true), P.teal, { p: [s * w * 0.3, bh / 2 + 0.22, 0.36], r: [-2.2, 0, 0] });
    B.add(sph(0.06, 6, 5), '#fff1c4', { p: [s * w * 0.3, bh / 2 + 0.17, 0.4], fx: GLOSS + 1 });
  }
  return B.build();
}

/** All of a stand's fit-outs at its level, baked into one geometry, plus its Bay View far version. */
export function specGeometry(level: number, ids: readonly SpecId[]): { geo: THREE.BufferGeometry; far: THREE.BufferGeometry } | null {
  if (level < 3 || !ids.length) return null;
  const L = LAYOUT[Math.min(5, level) as 3 | 4 | 5];
  const out = new Baker(), far = new Baker();
  for (const id of new Set(ids)) {
    if (id === 'express') {
      out.raw(expressWindow(), at(L.hatch, L.hatchRy));
      far.add(box(1.15, 1.05, 0.5), P.cream, { m: at(L.hatch, L.hatchRy).multiply(new THREE.Matrix4().makeTranslation(0, 0, 0.2)) });
    } else if (id === 'fancy') {
      out.raw(fancyMenu(), at(L.easel));
    } else if (id === 'fortified') {
      out.raw(fortifiedFrame(L));
      far.add(box(L.hw * 2 - 0.5, 0.5, 0.08), STEEL, { p: [0, 0.36, L.skirtZ] });
      for (const s of [-1, 1]) far.add(box(0.72, L.h, 0.1), STEEL, { p: [s * (L.hw - 0.3), L.h / 2, L.zf + 0.07] });
    } else if (id === 'roof') {
      const legDown = L.board[1] - 0.65 - L.legTo;
      out.raw(billboard(L.bw, legDown), at(L.board));
      far.add(box(L.bw, 1.3, 0.14), P.lemon, { p: L.board });
      far.add(box(L.bw - 0.2, 1.1, 0.04), P.white, { p: [L.board[0], L.board[1], L.board[2] + 0.08] });
      for (const s of [-1, 1]) far.add(box(0.14, legDown, 0.1), P.stick, { p: [s * L.bw * 0.32, L.board[1] - 0.65 - legDown / 2, L.board[2] - 0.12] });
    }
  }
  return { geo: out.build(), far: far.build() };
}
