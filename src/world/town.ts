// Citrine Bay's town in clay, around bay.ts's streets and plots: the
// backdrop buildings behind every plot row, landmarks, small props and each district's "eye music" (what
// moves). Static parts bake per district and per detail level:
//   full    (detail 0-1) backdrop buildings, trees, lamps, landmarks
//   props   (detail 0)  mailboxes, crates, umbrellas, flower boxes...
//   windows (detail 0-1) glowing glass (kit().window)
//   block   (detail 2)  Bay View: one clay block per building, one ball per tree
// Moving parts are small separate meshes animated on twos.
import * as THREE from 'three';
import { Baker, sph, cap, cyl, box, rbox as coreRbox, cone, tor, lumpy, hash, GLOSS, PAPER } from './clay/core.ts';
import { kit } from './clay/kit.ts';
import { P } from './clay/palette.ts';
import { DISTRICTS, PLOT_SPACING, STREET_HALF, type District } from '../sim/economy.ts';
import { SEA_X, SEA_Z } from '../sim/map.ts';

type Col = string | number;
/** Rounded clay blocks at one bevel segment; thin parts are plain boxes (cheap: 12 vs 108 triangles). */
const rbox = (w: number, h: number, d: number, r?: number, _seg?: number) => (Math.min(w, h, d) < 0.2 ? new THREE.BoxGeometry(w, h, d) : coreRbox(w, h, d, r, 1));
type Opt = { p?: [number, number, number]; r?: [number, number, number]; s?: number | [number, number, number]; fx?: number };

const SIDEWALK_OFFSET = STREET_HALF + 1.1;
const WALK = '#F1E2C6';
/** Backdrop buildings stand this far behind the street, past the plots. */
const BACK = 21;

export interface Town {
  /** Animate eye music on twos and switch detail levels. */
  update(time: number, detail: number, night: number): void;
}

/** A set of bakers for one chunk of town. */
class Chunk {
  full = new Baker(); props = new Baker(); win = new Baker(); block = new Baker();
}
type Bk = Baker;
const add = (b: Bk, g: THREE.BufferGeometry, c: Col, o: Opt = {}) => b.add(g, c, o);

function ball(b: Bk, r: number, c: Col, x: number, y: number, z: number, seed = 0, seg = 9) {
  add(b, lumpy(sph(r, seg, Math.max(5, seg - 3)), r * 0.09, 1.3 / Math.max(0.35, r), seed), c, { p: [x, y, z] });
}
function lumpBlock(b: Bk, w: number, h: number, d: number, c: Col, x: number, y: number, z: number, seed = 0, r = 0.35) {
  add(b, lumpy(rbox(w, h, d, Math.min(r, w / 3, h / 3, d / 3)), Math.min(0.06, h * 0.015), 0.5, seed), c, { p: [x, y + h / 2, z] });
}
function gable(b: Bk, w: number, d: number, rise: number, c: Col, x: number, y: number, z: number, ry = 0) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0.12, rise); s.lineTo(-0.12, rise); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: true, bevelThickness: 0.14, bevelSize: 0.14, bevelSegments: 1, curveSegments: 1 });
  g.translate(0, 0, -d / 2);
  add(b, g, c, { p: [x, y, z], r: [0, ry, 0] });
}
function tree(C: Chunk, x: number, z: number, seed: number, greens: Col[], scale = 1, fruit = false) {
  const h = (1.5 + hash(seed, 3) * 0.7) * scale;
  add(C.full, cyl(0.14 * scale, 0.24 * scale, h, 6), P.walnut, { p: [x, h / 2, z] });
  const n = 2 + (seed % 2);
  for (let k = 0; k <= n; k++) {
    const a = (k / n) * Math.PI * 2 + seed, rr = k === 0 ? 0 : 0.6 * scale;
    const r = ((k === 0 ? 1.2 : 0.85) + hash(seed, k) * 0.25) * scale;
    ball(C.full, r, greens[(seed + k) % greens.length], x + Math.cos(a) * rr, h + (0.8 + (k === 0 ? 0.35 : hash(k, seed) * 0.4)) * scale, z + Math.sin(a) * rr, seed * 5 + k, 9);
  }
  if (fruit) for (let k = 0; k < 5; k++) { const a = k * 1.7 + seed; add(C.props, sph(0.15 * scale, 6, 4), P.lemon, { p: [x + Math.cos(a) * 1.05 * scale, h + (0.55 + (k % 3) * 0.4) * scale, z + Math.sin(a) * 1.05 * scale], s: [1.3, 1, 1] }); }
  ball(C.block, 1.6 * scale, greens[seed % greens.length], x, h + 0.9 * scale, z, seed, 6);
}
/** Window glass on a front face (f = +1 faces +z, -1 faces -z). */
function win(C: Chunk, x: number, y: number, z: number, w: number, h: number, f: number, frame: Col = P.cream) {
  add(C.win, rbox(w, h, 0.1, 0.05), '#ffffff', { p: [x, y, z] });
  add(C.full, box(w + 0.14, 0.09, 0.12), frame, { p: [x, y - h / 2, z + f * 0.04] });
  add(C.full, box(w + 0.14, 0.09, 0.12), frame, { p: [x, y + h / 2, z + f * 0.04] });
}
function stick(b: Bk, x: number, y0: number, y1: number, z: number, w = 0.12, c: Col = P.stick) {
  add(b, rbox(w, y1 - y0, w * 0.6, w * 0.25), c, { p: [x, (y0 + y1) / 2, z], fx: PAPER });
}

// ---------------------------------------------------------------- backdrop buildings, one per style
type Style = (C: Chunk, x: number, z: number, f: number, seed: number) => void;

const cottage: Style = (C, x, z, f, seed) => {
  const walls = [P.cream, '#F4B9C2', '#9ED3D6', '#FBE3A0', '#CFE8C0'];
  const roofs = [P.terra, P.walnut, '#5FA35A', '#7EA6D8'];
  const wall = walls[seed % walls.length], roof = roofs[(seed >> 1) % roofs.length];
  const w = 6 + hash(seed) * 1.5, h = 3 + hash(seed, 2) * 1.2, d = 4.6;
  lumpBlock(C.full, w, h, d, wall, x, 0, z, seed);
  gable(C.full, w + 0.8, d + 0.6, h * 0.45 + 0.6, roof, x, h - 0.1, z);
  // scalloped card trim along the front eave
  for (let k = 0, xx = x - w / 2; xx < x + w / 2; xx += 0.46, k++)
    add(C.props, new THREE.CylinderGeometry(0.23, 0.23, 0.03, 8, 1, false, Math.PI / 2, Math.PI), k % 2 ? P.cream : roof, { p: [xx, h - 0.14, z + f * (d / 2 + 0.42)], r: [Math.PI / 2, 0, 0], fx: PAPER });
  lumpBlock(C.full, 0.6, 1.3, 0.6, P.terra, x + w * 0.28, h + 0.2, z - f * 0.6, seed + 1, 0.12);
  add(C.full, rbox(1, 1.8, 0.2, 0.08), P.walnut, { p: [x + 1, 0.9, z + f * d / 2] });
  win(C, x - w * 0.25, h * 0.5, z + f * (d / 2), 1.1, 1, f);
  // a flower box under the window
  add(C.props, rbox(1.2, 0.22, 0.3, 0.06), P.walnut, { p: [x - w * 0.25, h * 0.5 - 0.65, z + f * (d / 2 + 0.16)] });
  for (let k = 0; k < 4; k++) add(C.props, sph(0.11, 6, 4), [P.blush, P.lemon, P.terra, '#FFFFFF'][(k + seed) % 4], { p: [x - w * 0.25 - 0.4 + k * 0.27, h * 0.5 - 0.47, z + f * (d / 2 + 0.18)] });
  // matchstick pickets along the front lawn, red clay tips
  const fz = z + f * (d / 2 + 1.8);
  for (let k = 0, xx = x - w / 2 - 0.4; xx < x + w / 2 + 0.4; xx += 0.5, k++) {
    if (Math.abs(xx - x - 1) < 0.8) continue;
    add(C.props, box(0.07, 0.7, 0.07), P.stick, { p: [xx, 0.35, fz], fx: PAPER });
    add(C.props, sph(0.06, 5, 4), '#C9452F', { p: [xx, 0.74, fz], s: [1, 1.5, 1] });
  }
  add(C.props, box(w + 0.8, 0.05, 0.04), P.stick, { p: [x, 0.45, fz], fx: PAPER });
  // mailbox
  stick(C.props, x + 2.4, 0, 1, fz + f * 0.4, 0.08);
  add(C.props, rbox(0.4, 0.4, 0.65, 0.17), P.teal, { p: [x + 2.4, 1.1, fz + f * 0.4] });
  if (seed % 3 === 0) { // a kiddie pool
    add(C.props, tor(0.8, 0.22, 6, 16), '#7EA6D8', { p: [x - 2.2, 0.2, z + f * (d / 2 + 1)], r: [Math.PI / 2, 0, 0] });
    add(C.props, cyl(0.8, 0.8, 0.05, 14), P.teal, { p: [x - 2.2, 0.2, z + f * (d / 2 + 1)], fx: GLOSS });
  }
  lumpBlock(C.block, w, h + 1.5, d, wall, x, 0, z, seed, 0.6);
  blockLit(C, x, z, f, w, h + 1.5, d);
};

const brickFront: Style = (C, x, z, f, seed) => {
  const walls = ['#E9A07E', '#D98C6E', '#F0B48F', '#E6C7A0'];
  const wall = walls[seed % walls.length];
  const w = 9, h = 4.5 + (seed % 3) * 1.4, d = 5;
  lumpBlock(C.full, w, h, d, wall, x, 0, z, seed);
  add(C.full, rbox(w + 0.4, 0.4, d + 0.3, 0.1), P.cream, { p: [x, h, z] });
  // tool-pressed brick lines
  for (let y = 0.6; y < h - 0.4; y += 0.7) add(C.props, box(w - 0.4, 0.05, 0.03), '#B8735A', { p: [x, y, z + f * (d / 2 + 0.01)] });
  for (let fl = 0; fl < Math.floor(h / 1.6); fl++) for (const dx of [-2.8, 0, 2.8]) if (fl || dx) win(C, x + dx, 1.4 + fl * 1.6, z + f * (d / 2), 1.2, 0.9, f);
  add(C.full, rbox(1.3, 2, 0.2, 0.08), '#3B6E8F', { p: [x, 1, z + f * d / 2] });
  // striped card awning
  for (let i = 0; i < 8; i++) add(C.props, box(1.1, 0.04, 1), i % 2 ? P.cream : [P.terra, P.green, '#7EA6D8'][seed % 3], { p: [x - 3.85 + i * 1.1, 2.3, z + f * (d / 2 + 0.45)], r: [f * 0.45, 0, 0], fx: PAPER });
  lumpBlock(C.block, w, h, d, wall, x, 0, z, seed, 0.5);
  blockLit(C, x, z, f, w, h, d);
};

const sawtooth: Style = (C, x, z, f, seed) => {
  const walls = ['#E8DCC4', '#4A4458', '#D9CBB0'];
  const wall = walls[seed % 3];
  const w = 9, h = 4, d = 5;
  lumpBlock(C.full, w, h, d, wall, x, 0, z, seed);
  for (let i = 0; i < 3; i++) add(C.full, rbox(3.2, 0.25, d + 0.3, 0.08), '#5B5568', { p: [x - 3 + i * 3, h + 0.8, z], r: [0, 0, -0.5] });
  // a mural on card
  const mural = ['#FF4FA3', P.lemon, P.teal, P.terra, '#7CC47F', '#B9A7EA'];
  add(C.full, rbox(5, 2.4, 0.06, 0.03), '#FFFDF6', { p: [x - 1.2, 2, z + f * (d / 2 + 0.04)], fx: PAPER });
  for (let k = 0; k < 6; k++) add(C.props, sph(0.5 + hash(seed, k) * 0.4, 8, 5), mural[(k + seed) % 6], { p: [x - 3.2 + k * 0.8, 1.4 + hash(k, seed) * 1.3, z + f * (d / 2 + 0.07)], s: [1, 0.8, 0.06], fx: PAPER });
  win(C, x + 2.8, 2, z + f * (d / 2), 1.6, 1.4, f);
  // a skate rail out front
  add(C.props, cap(0.05, 3, 2, 5), P.chrome, { p: [x, 0.6, z + f * (d / 2 + 2)], r: [0, 0, Math.PI / 2], fx: GLOSS });
  for (const dx of [-1.4, 1.4]) add(C.props, cyl(0.05, 0.05, 0.6, 5), P.chrome, { p: [x + dx, 0.3, z + f * (d / 2 + 2)], fx: GLOSS });
  lumpBlock(C.block, w, h + 1, d, wall, x, 0, z, seed, 0.5);
  blockLit(C, x, z, f, w, h + 1, d);
};

const tower: Style = (C, x, z, f, seed) => {
  const glass = ['#9FB4C8', '#AFC3D6', '#8EA5BD', '#B8C2CC'];
  // The camera-side row (fronts facing -z) stays low so it never hides the plots across the street.
  const w = 7, d = 6, h = f < 0 ? 5 + (seed % 2) * 1.6 : 12 + (seed % 4) * 4;
  lumpBlock(C.full, w, h, d, glass[seed % 4], x, 0, z, seed, 0.3);
  // printed-card glass: window bands on the front and sides
  for (let y = 1.6; y < h - 0.6; y += 1.6) {
    add(C.full, rbox(w + 0.08, 0.2, d + 0.08, 0.05), '#6C7A90', { p: [x, y - 0.15, z] });
    for (let k = 0; k < 4; k++) add(C.win, rbox(1.2, 1.05, 0.06, 0.04), '#ffffff', { p: [x - 2.4 + k * 1.6, y + 0.6, z + f * (d / 2 + 0.01)] });
  }
  add(C.full, rbox(w - 1.6, 0.8, d - 1.6, 0.1), P.chrome, { p: [x, h + 0.4, z], fx: GLOSS });
  // a food cart on the plaza out front
  if (seed % 2) {
    const cx = x + 2, cz = z + f * (d / 2 + 2.4);
    add(C.props, rbox(1.6, 0.9, 0.9, 0.1), ['#FF9F1C', P.terra, P.teal][seed % 3], { p: [cx, 0.75, cz] });
    for (const dx of [-0.5, 0.5]) add(C.props, cyl(0.22, 0.22, 0.1, 10), P.plum, { p: [cx + dx, 0.22, cz], r: [Math.PI / 2, 0, 0] });
    stick(C.props, cx, 1.2, 2.2, cz, 0.06, P.cream);
    for (let k = 0; k < 6; k++) add(C.props, new THREE.ConeGeometry(0.8, 0.35, 3, 1, true, (k / 6) * Math.PI * 2, Math.PI / 3), k % 2 ? P.cream : P.terra, { p: [cx, 2.3, cz], fx: PAPER });
  }
  lumpBlock(C.block, w, h, d, glass[seed % 4], x, 0, z, seed, 0.4);
  blockLit(C, x, z, f, w, h, d);
};

const warehouse: Style = (C, x, z, f, seed) => {
  const walls = ['#B86A4B', '#8E949C', '#D9CBB0', '#A55B3F'];
  const wall = walls[seed % 4];
  const w = 9.5, h = 4, d = 6;
  lumpBlock(C.full, w, h, d, wall, x, 0, z, seed);
  // a rounded roof
  add(C.full, new THREE.CylinderGeometry(d / 2 + 0.2, d / 2 + 0.2, w + 0.3, 12, 1, false, 0, Math.PI), '#7A7F88', { p: [x, h - 0.2, z], r: [0, 0, Math.PI / 2], s: [1, 0.45, 1] });
  add(C.full, rbox(3, 3, 0.2, 0.08), '#5F5A74', { p: [x - 1.5, 1.5, z + f * d / 2] });
  for (let k = 0; k < 6; k++) add(C.full, box(3, 0.05, 0.05), '#4A4458', { p: [x - 1.5, 0.3 + k * 0.5, z + f * (d / 2 + 0.11)] });
  win(C, x + 2.8, 2.6, z + f * (d / 2), 1.6, 0.8, f);
  // crate stacks
  for (let k = 0; k < 5; k++) add(C.props, rbox(0.9, 0.8, 0.9, 0.06), [P.stick, '#C9A27A'][k % 2], { p: [x + 2.2 + (k % 3) * 0.95, 0.4 + Math.floor(k / 3) * 0.8, z + f * (d / 2 + 1.4)], fx: PAPER });
  lumpBlock(C.block, w, h + 1, d, wall, x, 0, z, seed, 0.5);
  blockLit(C, x, z, f, w, h + 1, d);
};

const barn: Style = (C, x, z, f, seed) => {
  const walls = ['#A9C3A0', '#C2453A', '#E9D8A6'];
  const wall = walls[seed % 3];
  const w = 7, h = 3.6, d = 5;
  lumpBlock(C.full, w, h, d, wall, x, 0, z, seed);
  gable(C.full, w + 0.6, d + 0.5, 2.2, '#8B5E3C', x, h - 0.1, z);
  add(C.full, rbox(2.2, 2.6, 0.18, 0.06), '#FFFDF6', { p: [x, 1.3, z + f * d / 2] });
  add(C.full, box(0.12, 2.8, 0.04), wall, { p: [x, 1.3, z + f * (d / 2 + 0.1)], r: [0, 0, 0.7] });
  // a silo
  add(C.full, lumpy(cyl(1.1, 1.1, 5.5, 12), 0.03, 1.5, seed), '#D8D3DE', { p: [x + w / 2 + 1.4, 2.75, z] });
  add(C.full, sph(1.15, 12, 6), '#C2453A', { p: [x + w / 2 + 1.4, 5.5, z], s: [1, 0.6, 1] });
  // hay bales
  for (let k = 0; k < 3; k++) add(C.props, lumpy(cyl(0.6, 0.6, 1, 10), 0.04, 2, k + seed), '#E8C36A', { p: [x - 2.6 + k * 1.3, 0.62, z + f * (d / 2 + 1.6)], r: [0, 0, Math.PI / 2] });
  lumpBlock(C.block, w + 2, h + 1.5, d, wall, x, 0, z, seed, 0.5);
  blockLit(C, x, z, f, w + 2, h + 1.5, d);
};

const mansion: Style = (C, x, z, f, seed) => {
  const w = 9, h = 4.4, d = 6;
  const wall = ['#FFFDF6', '#EDE4F2', '#F6EEDF'][seed % 3];
  lumpBlock(C.full, w, h, d, wall, x, 0, z, seed);
  add(C.full, sph(2, 14, 8), seed % 2 ? '#B9A7EA' : '#7CC47F', { p: [x, h, z], s: [1, 0.8, 1] });
  for (const dx of [-3, -1, 1, 3]) add(C.full, cyl(0.22, 0.25, h - 0.3, 8), '#FFFFFF', { p: [x + dx, (h - 0.3) / 2, z + f * (d / 2 + 0.3)] });
  for (const dx of [-3.4, 3.4]) win(C, x + dx, 2.6, z + f * (d / 2), 0.9, 1.3, f);
  // hedge wall with a gate gap, and topiaries
  for (const s of [-1, 1]) add(C.full, lumpy(rbox(3.6, 1.2, 0.9, 0.4), 0.06, 1.5, seed + s), '#3F7F45', { p: [x + s * 2.6, 0.6, z + f * (d / 2 + 2.6)] });
  for (const s of [-1, 1]) {
    add(C.props, cyl(0.1, 0.12, 0.6, 6), P.walnut, { p: [x + s * 5, 0.3, z + f * (d / 2 + 1)] });
    ball(C.props, 0.55, '#3F7F45', x + s * 5, 1.0, z + f * (d / 2 + 1), seed + s, 8);
    ball(C.props, 0.35, '#3F7F45', x + s * 5, 1.7, z + f * (d / 2 + 1), seed + s + 3, 7);
  }
  lumpBlock(C.block, w, h + 1.5, d, wall, x, 0, z, seed, 0.6);
  blockLit(C, x, z, f, w, h + 1.5, d);
};

const beachHut: Style = (C, x, z, f, seed) => {
  const walls = ['#9ED3D6', '#F4B9C2', '#FBE3A0', '#FFFDF6'];
  const wall = walls[seed % 4];
  // a popsicle-stick deck and a striped hut
  for (let k = 0; k < 10; k++) add(C.full, rbox(0.55, 0.1, 5, 0.03), P.stick, { p: [x - 2.6 + k * 0.58, 0.3, z], fx: PAPER });
  lumpBlock(C.full, 4, 2.8, 3.4, wall, x - 0.6, 0.35, z - f * 0.4, seed);
  gable(C.full, 4.6, 3.8, 1.2, [P.terra, P.teal, '#FF9F1C'][seed % 3], x - 0.6, 3.1, z - f * 0.4);
  for (let k = 0; k < 6; k++) add(C.props, box(0.6, 2.6, 0.03), k % 2 ? '#FFFDF6' : wall, { p: [x - 2.1 + k * 0.6, 1.7, z - f * 0.4 + f * 1.72], fx: PAPER });
  // surfboards leaning on the wall
  for (let k = 0; k < 2; k++) add(C.props, lumpy(cap(0.32, 2.2, 3, 8), 0.02, 2, k), [P.terra, P.lemon, P.teal][(k + seed) % 3], { p: [x + 2 + k * 0.6, 1.5, z + f * 1.5], r: [f * 0.2, 0, 0.1], s: [1, 1, 0.25] });
  lumpBlock(C.block, 5, 3.4, 4, wall, x, 0, z, seed, 0.5);
  blockLit(C, x, z, f, 5, 3.4, 4);
};

const STYLE: Record<string, Style> = {
  maple: cottage, oldtown: brickFront, campus: sawtooth, downtown: tower,
  boardwalk: beachHut, harbor: warehouse, groves: barn, hilltop: mansion,
};
const GREENS: Record<string, Col[]> = {
  maple: [P.green, '#5FA35A', '#8FD08A'], oldtown: [P.green, '#6BB56F'], campus: [P.green, '#5FA35A', '#9BCB6A'],
  downtown: ['#5FA35A', '#6BB56F'], boardwalk: ['#8FD08A', '#7CC47F'], harbor: ['#6BB56F', '#5FA35A'],
  groves: ['#4F9A4A', '#6BB56F', '#9BCB6A'], hilltop: ['#3F7F45', '#4F9A4A', '#5FA35A'],
};

// ---------------------------------------------------------------- landmarks behind their plots, at 1.5x
function ferrisWheel(x: number, z: number, parts: THREE.Object3D[], C: Chunk, y0 = 0) {
  const R = 7, cy = R + 1.5 + y0;
  for (const s of [-1, 1]) {
    add(C.full, rbox(0.3, cy + 0.5, 0.2, 0.08), P.stick, { p: [x - 2.6, cy / 2, z + s * 0.9], r: [0, 0, -0.3], fx: PAPER });
    add(C.full, rbox(0.3, cy + 0.5, 0.2, 0.08), P.stick, { p: [x + 2.6, cy / 2, z + s * 0.9], r: [0, 0, 0.3], fx: PAPER });
  }
  const b = new Baker();
  for (const s of [-0.7, 0.7]) b.add(tor(R, 0.14, 5, 40), P.stick, { p: [0, 0, s], fx: PAPER });
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    b.add(rbox(0.16, R * 2, 0.12, 0.05), P.stick, { r: [0, 0, a], fx: PAPER });
    b.add(rbox(0.9, 0.7, 1.2, 0.2), [P.terra, P.lemon, P.teal, P.blush, '#FF9F1C'][k % 5], { p: [Math.cos(a) * R, Math.sin(a) * R - 0.5, 0] });
    b.add(sph(0.14, 6, 4), '#FFE2A8', { p: [Math.cos(a) * (R + 0.2), Math.sin(a) * (R + 0.2), 0.8], fx: GLOSS + 1 });
  }
  b.add(cyl(0.5, 0.5, 2, 10), P.terra, { r: [Math.PI / 2, 0, 0] });
  const m = new THREE.Mesh(b.build(), kit().world);
  m.position.set(x, cy, z);
  m.name = 'spin:wheel';
  m.castShadow = true;
  parts.push(m);
  // Bay View: the wheel's ring and spokes, so it still reads as a wheel
  add(C.block, tor(R, 0.5, 5, 24), P.stick, { p: [x, cy, z] });
  for (let k = 0; k < 5; k++) add(C.block, rbox(0.4, R * 2, 0.4, 0.1), P.stick, { p: [x, cy, z], r: [0, 0, (k / 5) * Math.PI] });
  for (const s of [-1, 1]) add(C.block, rbox(0.6, cy, 0.6, 0.1), P.stick, { p: [x + s * 2.6, cy / 2, z], r: [0, 0, s * 0.3] });
}
/** The Pier: a popsicle-stick deck from the beach out over the resin, with the Ferris wheel on its end. */
function pierWheel(x: number, C: Chunk, parts: THREE.Object3D[]) {
  const z0 = SEA_Z - 5, z1 = SEA_Z + 18;
  for (let z = z0; z < z1; z += 0.6) add(C.full, rbox(7, 0.12, 0.52, 0.04), P.stick, { p: [x, 0.5, z], r: [0, (hash(z) - 0.5) * 0.04, 0], fx: PAPER });
  for (let z = z0 + 1; z < z1; z += 3.2) for (const s of [-1, 1]) add(C.full, cyl(0.2, 0.2, 2.4, 7), P.walnut, { p: [x + s * 3.2, -0.6, z], fx: PAPER });
  for (const s of [-1, 1]) for (let z = z0; z < z1; z += 1.2) add(C.full, rbox(0.12, 0.9, 0.12, 0.03), '#FFFDF6', { p: [x + s * 3.4, 1, z], fx: PAPER });
  for (const s of [-1, 1]) add(C.full, rbox(0.1, 0.1, z1 - z0, 0.03), '#FFFDF6', { p: [x + s * 3.4, 1.4, (z0 + z1) / 2], fx: PAPER });
  ferrisWheel(x, SEA_Z + 11, parts, C, 0.55);
  add(C.block, rbox(7, 0.6, z1 - z0, 0.2), P.stick, { p: [x, 0.3, (z0 + z1) / 2] });
}
function bandstand(x: number, z: number, C: Chunk) {
  add(C.full, cyl(4, 4.2, 0.8, 12), P.cream, { p: [x, 0.4, z] });
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; add(C.full, cyl(0.15, 0.15, 3.4, 6), '#FFFFFF', { p: [x + Math.cos(a) * 3.4, 2.5, z + Math.sin(a) * 3.4] }); }
  for (let k = 0; k < 8; k++) add(C.full, new THREE.ConeGeometry(4.6, 2.2, 8, 1, true, (k / 8) * Math.PI * 2, Math.PI / 4), k % 2 ? P.cream : P.terra, { p: [x, 5.2, z], fx: PAPER });
  add(C.full, sph(0.3, 8, 6), P.lemon, { p: [x, 6.4, z] });
  lumpBlock(C.block, 8, 6, 8, P.cream, x, 0, z, 2, 1);
}
function fountain(x: number, z: number, C: Chunk) {
  add(C.full, lumpy(cyl(4, 4.3, 0.9, 20), 0.03, 1, 2), P.cream, { p: [x, 0.45, z] });
  add(C.full, cyl(3.5, 3.5, 0.1, 20), P.teal, { p: [x, 0.85, z], fx: GLOSS });
  add(C.full, cyl(0.6, 0.9, 2.6, 12), P.cream, { p: [x, 1.6, z] });
  add(C.full, lathe2(), P.cream, { p: [x, 2.9, z] });
  add(C.full, sph(0.6, 10, 6), P.teal, { p: [x, 3.6, z], fx: GLOSS });
  lumpBlock(C.block, 8, 3, 8, P.cream, x, 0, z, 4, 1);
}
function lathe2() {
  return new THREE.LatheGeometry([[0, 0], [1.8, 0], [1.9, 0.4], [0.6, 0.5]].map(([a, b]) => new THREE.Vector2(a, b)), 16);
}
function lighthouse(x: number, z: number, C: Chunk) {
  for (let k = 0; k < 5; k++) add(C.full, cyl(1.5 - k * 0.15, 1.6 - k * 0.15, 2, 14), k % 2 ? '#FFFFFF' : P.terra, { p: [x, 1 + k * 2, z] });
  add(C.win, cyl(0.9, 0.9, 1.4, 12), '#ffffff', { p: [x, 10.7, z] });
  add(C.full, cone(1.3, 1.4, 12), P.terra, { p: [x, 12.1, z] });
  lumpBlock(C.block, 3, 12, 3, '#FFFFFF', x, 0, z, 9, 1);
}
function clubhouse(x: number, z: number, C: Chunk) {
  lumpBlock(C.full, 10, 4, 6, '#FFFDF6', x, 0, z, 3);
  gable(C.full, 11, 6.8, 2.2, '#3F7F45', x, 3.9, z);
  for (let k = 0; k < 6; k++) add(C.props, sph(0.12, 6, 4), '#FFFFFF', { p: [x - 6 + k * 2.3, 0.1, z + 6 + (k % 2) * 1.2] });
  stick(C.props, x + 7, 0, 2.2, z + 5, 0.06, '#FFFFFF');
  add(C.props, cone(0.45, 0.6, 3), P.terra, { p: [x + 7.3, 2, z + 5], r: [0, 0, -Math.PI / 2], s: [1, 1, 0.1], fx: PAPER });
  lumpBlock(C.block, 10, 6, 6, '#FFFDF6', x, 0, z, 3, 1);
}
function fairTents(x: number, z: number, C: Chunk) {
  for (let k = 0; k < 3; k++) {
    const tx = x - 5 + k * 5, c = [P.terra, '#7EA6D8', P.lemon][k];
    add(C.full, cyl(1.8, 1.8, 2, 12), '#FFFDF6', { p: [tx, 1, z] });
    for (let s = 0; s < 8; s++) add(C.full, new THREE.ConeGeometry(2.2, 2, 8, 1, true, (s / 8) * Math.PI * 2, Math.PI / 4), s % 2 ? '#FFFDF6' : c, { p: [tx, 3, z], fx: PAPER });
    stick(C.full, tx, 4, 5, z, 0.06, P.walnut);
    add(C.props, cone(0.3, 0.4, 3), c, { p: [tx + 0.25, 4.8, z], r: [0, 0, -Math.PI / 2], s: [1, 1, 0.1], fx: PAPER });
  }
  lumpBlock(C.block, 14, 4, 4, P.terra, x, 0, z, 5, 1);
}
function quad(x: number, z: number, C: Chunk, greens: Col[]) {
  add(C.full, rbox(9, 0.12, 9, 0.05), '#9BD48A', { p: [x, 0.06, z] });
  for (const s of [-1, 1]) add(C.full, rbox(9, 0.13, 0.9, 0.05), WALK, { p: [x, 0.07, z], r: [0, s * Math.PI / 4, 0] });
  lumpBlock(C.full, 2.4, 6, 2.4, '#C97C5E', x, 0, z - 6, 8, 0.2);
  add(C.full, cone(1.8, 2, 4), '#5B5568', { p: [x, 7, z - 6], r: [0, Math.PI / 4, 0] });
  for (const [dx, dz] of [[-3.6, -3.6], [3.6, 3.6], [-3.6, 3.6], [3.6, -3.6]]) tree(C, x + dx, z + dz, Math.abs(dx * 7 + dz), greens, 0.9);
}
function fishMarket(x: number, z: number, C: Chunk) {
  lumpBlock(C.full, 9, 3, 5, '#9ED3D6', x, 0, z, 4);
  gable(C.full, 9.6, 5.6, 1.4, '#FFFDF6', x, 2.9, z);
  // a big clay fish on the roof
  add(C.full, sph(1.4, 12, 8), P.terra, { p: [x, 5.6, z], s: [1.6, 0.8, 0.4] });
  add(C.full, cone(0.9, 1.2, 3), P.terra, { p: [x - 2.6, 5.6, z], r: [0, 0, Math.PI / 2], s: [1, 1, 0.3] });
  add(C.full, sph(0.15, 6, 4), P.plum, { p: [x + 1.5, 5.8, z + 0.45], fx: GLOSS });
  lumpBlock(C.block, 9, 5, 5, '#9ED3D6', x, 0, z, 4, 1);
}

// ---------------------------------------------------------------- eye music
function windmill(x: number, z: number, parts: THREE.Object3D[], C: Chunk, f: number) {
  lumpBlock(C.full, 2, 6, 2, '#DCE5D2', x, 0, z, 13, 0.3);
  add(C.full, cone(1.6, 1.8, 8), P.terra, { p: [x, 6.9, z] });
  const b = new Baker();
  for (let k = 0; k < 4; k++) b.add(rbox(0.6, 3.2, 0.06, 0.04), '#FFFDF6', { p: [Math.cos(k * Math.PI / 2) * 1.7, Math.sin(k * Math.PI / 2) * 1.7, 0], r: [0, 0, k * Math.PI / 2 + Math.PI / 2], fx: PAPER });
  b.add(sph(0.3, 8, 6), P.terra, {});
  const m = new THREE.Mesh(b.build(), kit().world);
  m.position.set(x, 5.4, z + f * 1.2);
  m.name = 'spin:windmill';
  m.castShadow = true;
  parts.push(m);
}
function crane(x: number, z: number, parts: THREE.Object3D[], C: Chunk, seed: number) {
  for (const s of [-1, 1]) for (const t of [-1, 1]) add(C.full, rbox(0.25, 9, 0.25, 0.08), '#E8704F', { p: [x + s * 0.8, 4.5, z + t * 0.8], fx: PAPER });
  for (let y = 1.5; y < 9; y += 2) add(C.full, rbox(1.9, 0.18, 0.18, 0.05), '#E8704F', { p: [x, y, z + 0.8], r: [0, 0, 0.6], fx: PAPER });
  const b = new Baker();
  b.add(rbox(10, 0.4, 0.5, 0.1), '#E8704F', { p: [2.5, 0, 0], fx: PAPER });
  b.add(rbox(1.6, 1.2, 1.4, 0.15), P.lemon, { p: [0, 0.6, 0] });
  b.add(cyl(0.02, 0.02, 4, 4), P.plum, { p: [6.5, -2, 0] });
  b.add(rbox(1, 0.8, 1, 0.06), [P.stick, P.teal, P.terra][seed % 3], { p: [6.5, -4.2, 0], fx: PAPER });
  const m = new THREE.Mesh(b.build(), kit().world);
  m.position.set(x, 9.2, z);
  m.name = 'sway:crane';
  m.userData.phase = seed;
  m.castShadow = true;
  parts.push(m);
  lumpBlock(C.block, 2, 9, 2, '#E8704F', x, 0, z, seed, 0.3);
}
/** Small movers that come in numbers (sprinklers, buoys) draw as one instanced mesh per kind. */
type Mover = { kind: 'sprinkler' | 'buoy'; x: number; y: number; z: number; ph: number };
function sprinkler(x: number, z: number, movers: Mover[], C: Chunk) {
  add(C.props, cyl(0.12, 0.16, 0.3, 8), P.chrome, { p: [x, 0.15, z], fx: GLOSS });
  movers.push({ kind: 'sprinkler', x, y: 0.3, z, ph: x * 0.3 });
}
function buoy(x: number, z: number, movers: Mover[], seed: number) {
  movers.push({ kind: 'buoy', x, y: -0.2, z, ph: seed });
}
function moverGeometry(kind: Mover['kind']) {
  const b = new Baker();
  if (kind === 'sprinkler') for (let k = 0; k < 7; k++) { const t = k / 6; b.add(sph(0.07, 6, 4), '#BFEFF4', { p: [t * 1.6, Math.sin(t * Math.PI) * 0.9, 0], fx: GLOSS }); }
  else {
    b.add(lathe2(), P.terra, { s: [0.35, 1.4, 0.35] });
    b.add(cyl(0.12, 0.12, 0.9, 6), '#FFFDF6', { p: [0, 0.9, 0] });
    b.add(sph(0.16, 6, 4), '#FFE2A8', { p: [0, 1.4, 0], fx: GLOSS + 1 });
  }
  return b.build();
}

// ---------------------------------------------------------------- the town
/** Where the backdrop buildings stand (x, z, half-size), so bay.ts keeps trees and grass off them. */
export function townFootprints(): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (const d of DISTRICTS) for (let col = 0; col < d.cols; col++) for (const side of [0, 1] as const) {
    const x = d.origin[0] + col * PLOT_SPACING + PLOT_SPACING / 2, f = side === 0 ? 1 : -1, bz = d.origin[1] - f * BACK;
    const sp = d.special.find((p) => p.col === col && p.side === side);
    if (sp?.name === 'The Pier') { out.push([x, SEA_Z, 6]); continue; }
    if (bz > SEA_Z - 6 || x > SEA_X - 6) continue;
    out.push([x, bz, sp?.type === 'landmark' ? 8 : 6.2]);
  }
  for (const d of DISTRICTS) if (d.id === 'boardwalk') for (let k = 0; k < d.cols; k++) out.push([d.origin[0] + k * PLOT_SPACING + 6, SEA_Z - 3, 2]);
  return out;
}

export function createTown(scene: THREE.Scene): Town {
  const K = kit();
  const parts: THREE.Object3D[] = [];
  const movers: Mover[] = [];
  const chunks: Record<'full' | 'props' | 'win' | 'block', THREE.Mesh | null>[] = [];

  for (const d of DISTRICTS) {
    const C = new Chunk();
    const z = d.origin[1];
    const greens = GREENS[d.id];
    // backdrop buildings behind every plot row (not into the sea)
    const style = STYLE[d.id];
    for (let col = 0; col < d.cols; col++) {
      const x = d.origin[0] + col * PLOT_SPACING + PLOT_SPACING / 2;
      for (const side of [0, 1] as const) {
        const f = side === 0 ? 1 : -1; // fronts face the street
        const sp = d.special.find((p) => p.col === col && p.side === side);
        if (sp?.name === 'The Pier') { pierWheel(x, C, parts); continue; }
        const bz = z - f * BACK;
        if (bz > SEA_Z - 6 || x > SEA_X - 6) continue;
        const sd = Math.abs((col * 2 + side + 1) * 7 + d.origin[0]);
        if (sp?.type === 'landmark') landmark(sp.name, x, bz, f, C, parts, greens);
        else if (d.id === 'groves' && col % 3 === 2) windmill(x, bz, parts, C, f);
        else if (d.id === 'harbor' && side === 0 && col % 2 === 1) crane(x, bz + 2, parts, C, col);
        else style(C, x, bz, f, sd);
        if (col < d.cols - 1 && d.id !== 'downtown' && d.id !== 'boardwalk') tree(C, x + PLOT_SPACING / 2, bz + f * 2.5, sd + 3, greens, 0.9 + hash(sd) * 0.3, d.id === 'groves');
      }
    }
    // district props and eye music along the street
    for (let col = 0; col <= d.cols; col++) {
      const gx = d.origin[0] + col * PLOT_SPACING;
      const s = col % 2 ? 1 : -1;
      if (gx > SEA_X - 6) continue;
      if (d.id === 'maple' && col % 2 === 0 && col < d.cols) sprinkler(gx + 6, z - s * (SIDEWALK_OFFSET + 6.5), movers, C);
      if (d.id === 'oldtown' && col % 3 === 1) bench(C, gx + 2, z - s * (SIDEWALK_OFFSET + 0.2), s);
      if (d.id === 'hilltop' && col < d.cols) for (const t of [-1, 1]) { add(C.props, cyl(0.1, 0.12, 0.5, 6), P.walnut, { p: [gx + 1.5, 0.25, z + t * (SIDEWALK_OFFSET + 1.6)] }); ball(C.props, 0.5, '#3F7F45', gx + 1.5, 0.9, z + t * (SIDEWALK_OFFSET + 1.6), col + t, 7); }
      if ((d.id === 'campus' || d.id === 'maple' || d.id === 'downtown') && col % 3 === 1) hydrant(C, gx - 1.4, z + s * (SIDEWALK_OFFSET + 0.3));
    }
    if (d.id === 'boardwalk') beach(C, d);
    if (d.id === 'harbor') for (let k = 0; k < 6; k++) buoy(d.origin[0] + 6 + k * 13, SEA_Z + 7 + (k % 2) * 5, movers, k);
    const mk = (b: Baker, mat: THREE.Material, cast: boolean, name: string) => {
      if (!b.size) return null;
      const m = new THREE.Mesh(b.build(), mat);
      m.castShadow = cast;
      m.receiveShadow = true;
      m.name = `town-${name}:${d.id}`;
      scene.add(m);
      return m;
    };
    const block = mk(C.block, K.world, true, 'block');
    if (block) block.visible = false;
    chunks.push({ full: mk(C.full, K.world, true, 'full'), props: mk(C.props, K.world, true, 'props'), win: mk(C.win, K.window, false, 'win'), block });
  }
  for (const p of parts) scene.add(p);
  const flocks = (['sprinkler', 'buoy'] as const).map((kind) => {
    const list = movers.filter((m) => m.kind === kind);
    const im = new THREE.InstancedMesh(moverGeometry(kind), K.world, Math.max(1, list.length));
    im.name = `town-${kind}`;
    im.count = list.length;
    im.receiveShadow = true;
    scene.add(im);
    return { kind, list, im };
  });
  const mm = new THREE.Matrix4(), mq = new THREE.Quaternion(), me = new THREE.Euler(), mv = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  let lastF = -1;

  let shownDetail = -1;
  return {
    update(time, detail, night) {
      if (detail !== shownDetail) {
        shownDetail = detail;
        for (const m of chunks) {
          if (m.full) m.full.visible = detail < 2;
          if (m.win) m.win.visible = detail < 2;
          if (m.props) m.props.visible = detail < 1;
          if (m.block) m.block.visible = detail >= 2;
        }
        for (const p of parts) p.visible = detail < 2;
        for (const f of flocks) f.im.visible = detail < 2;
      }
      if (detail >= 2) return;
      const f12 = Math.floor(time * 12);
      if (f12 === lastF) return; // pose on twos
      lastF = f12;
      // eye music poses on twos
      const t = Math.floor(time * 12) / 12;
      for (const p of parts) {
        const [kind, what] = p.name.split(':');
        const ph = (p.userData.phase as number) ?? 0;
        if (kind === 'spin') {
          if (what === 'wheel') p.rotation.z = -t * 0.12;
          else if (what === 'windmill') p.rotation.z = -t * 0.9;
        } else if (kind === 'sway') p.rotation.y = Math.sin(t * 0.25 + ph) * 0.6;
      }
      for (const f of flocks) {
        if (f.kind === 'sprinkler') f.im.visible = night < 0.5; // sprinklers run by day
        f.list.forEach((m, i) => {
          if (f.kind === 'sprinkler') me.set(0, Math.sin(t * 1.4 + m.ph) * 1.2, 0);
          else { me.set(0, 0, Math.sin(t * 1.1 + m.ph) * 0.12); }
          mq.setFromEuler(me);
          mv.set(m.x, m.y + (f.kind === 'buoy' ? Math.sin(t * 1.6 + m.ph) * 0.12 : 0), m.z);
          f.im.setMatrixAt(i, mm.compose(mv, mq, one));
        });
        f.im.instanceMatrix.needsUpdate = true;
        f.im.computeBoundingSphere();
      }
    },
  };
}

/** Landmarks grow 1.5x so players navigate by them, and Bay View keeps their real silhouette. */
const LANDMARK_SCALE: Record<string, number> = { 'The Country Club': 1.2, 'The Fairgrounds': 1.15, 'Fish Market': 1.3, 'The Quad': 1.2 };
function landmark(name: string, x: number, z: number, f: number, C: Chunk, parts: THREE.Object3D[], greens: Col[]) {
  const T = new Chunk();
  if (name === 'The Bandstand') bandstand(0, 0, T);
  else if (name === 'Founders Fountain') fountain(0, 0, T);
  else if (name === 'The Quad') quad(0, 0, T, greens);
  else if (name === 'The Country Club') clubhouse(0, 0, T);
  else if (name === 'The Fairgrounds') fairTents(0, 0, T);
  else if (name === 'Fish Market') fishMarket(0, 0, T);
  else if (name === 'Maple Park') {
    for (let k = 0; k < 5; k++) tree(T, -4 + (k % 3) * 4, -2 + Math.floor(k / 3) * 4, 60 + k, greens, 1.3);
    add(T.full, rbox(3, 0.6, 3, 0.2), '#F3DDA6', { p: [0, 0.2, f * 3] });
    add(T.full, cone(1.2, 2.2, 4), P.terra, { p: [3, 1.1, f * 2] });
  } else lighthouse(0, 0, T);
  void parts;
  const k = LANDMARK_SCALE[name] ?? 1.5;
  const m = new THREE.Matrix4().makeScale(k, k, k).setPosition(x, 0, z);
  const full = T.full.build();
  C.full.raw(full, m);
  C.block.raw(full, m); // Bay View: the real silhouette, not a box
  for (const key of ['props', 'win'] as const) if (T[key].size) { const g = T[key].build(); C[key].raw(g, m); g.dispose(); }
  full.dispose();
}
/** Bay View night: a couple of window patches on a block's street face that glow after dark. */
function blockLit(C: Chunk, x: number, z: number, f: number, w: number, h: number, d: number) {
  for (const dx of [-0.25, 0.25]) add(C.block, new THREE.BoxGeometry(w * 0.22, Math.min(1.4, h * 0.22), 0.1), '#FFE2A8', { p: [x + dx * w, h * 0.5, z + f * (d / 2 + 0.05)], fx: 1 });
}
function bench(C: Chunk, x: number, z: number, s: number) {
  for (let k = 0; k < 3; k++) add(C.props, rbox(2.2, 0.06, 0.22, 0.03), P.stick, { p: [x, 0.55, z + s * (k * 0.26 - 0.26)], fx: PAPER });
  add(C.props, rbox(2.2, 0.22, 0.06, 0.03), P.stick, { p: [x, 0.85, z + s * 0.45], r: [s * 0.15, 0, 0], fx: PAPER });
  for (const dx of [-0.9, 0.9]) add(C.props, box(0.08, 0.5, 0.7), P.walnut, { p: [x + dx, 0.28, z] });
}
function hydrant(C: Chunk, x: number, z: number) {
  add(C.props, lumpy(cyl(0.2, 0.24, 0.6, 10), 0.015, 6, 1), P.terra, { p: [x, 0.42, z] });
  add(C.props, sph(0.22, 10, 6), P.terra, { p: [x, 0.74, z], s: [1, 0.8, 1] });
  add(C.props, sph(0.06, 6, 4), P.gold, { p: [x, 0.92, z], fx: GLOSS });
}
/** The Boardwalk's beach: lifeguard towers, umbrellas, towels, sandcastles and rocks. */
function beach(C: Chunk, d: District) {
  const zb = SEA_Z - 3;
  for (let k = 0; k < d.cols; k++) {
    const x = d.origin[0] + k * PLOT_SPACING + 6;
    if (d.special.some((p) => p.col === k && p.name === 'The Pier')) continue; // the Pier runs out from here
    if (k % 3 === 1) {
      // lifeguard tower on popsicle-stick legs
      for (const s of [-1, 1]) for (const t of [-1, 1]) add(C.full, rbox(0.15, 2.6, 0.15, 0.05), P.stick, { p: [x + s * 0.7, 1.3, zb + t * 0.7], fx: PAPER });
      add(C.full, rbox(2, 1.2, 2, 0.15), '#FFFDF6', { p: [x, 3.2, zb] });
      add(C.full, rbox(2.4, 0.15, 2.4, 0.05), P.terra, { p: [x, 3.95, zb] });
      add(C.props, box(0.04, 1.5, 0.9), P.terra, { p: [x + 1.05, 2.2, zb], r: [0, 0, 0.3], fx: PAPER });
    } else {
      add(C.props, cyl(0.04, 0.04, 2.2, 5), P.cream, { p: [x, 1.0, zb], r: [0, 0, 0.12] });
      for (let s = 0; s < 8; s++) add(C.props, new THREE.ConeGeometry(1.1, 0.5, 3, 1, true, (s / 8) * Math.PI * 2, Math.PI / 4), s % 2 ? [P.terra, P.teal, P.lemon][k % 3] : P.cream, { p: [x - 0.13, 2.25, zb], fx: PAPER });
      add(C.props, rbox(1, 0.04, 1.8, 0.02), [P.teal, P.blush, P.lemon][(k + 1) % 3], { p: [x + 1.2, 0.07, zb + 0.4], r: [0, 0.3, 0], fx: PAPER });
    }
    if (k % 2) {
      const sx = x + 3.5;
      add(C.props, cyl(0.45, 0.55, 0.45, 9), P.sand, { p: [sx, 0.22, zb + 1] });
      for (const [a, b] of [[-0.4, -0.3], [0.4, -0.3], [0, 0.4]]) add(C.props, cyl(0.2, 0.25, 0.6, 7), P.sand, { p: [sx + a, 0.5, zb + 1 + b] });
    }
    add(C.props, lumpy(sph(0.4, 8, 6), 0.06, 4, k), '#B9A99A', { p: [x - 3, -0.05, SEA_Z + 0.2], s: [1.3, 0.6, 1] });
  }
}
