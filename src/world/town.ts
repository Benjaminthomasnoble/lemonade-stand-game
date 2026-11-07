// Citrine Bay's town in clay, around bay.ts's streets and plots: the
// backdrop buildings behind every plot row, landmarks, small props and each district's "eye music" (what
// moves). Static parts bake per district and per detail level:
//   full    (detail 0-1) backdrop buildings, trees, lamps, landmarks
//   props   (detail 0)  mailboxes, crates, umbrellas, flower boxes...
//   windows (detail 0-1) glowing glass (kit().window)
//   block   (detail 2)  Bay View: one clay block per building, one ball per tree
// Moving parts are small separate meshes animated on twos.
import * as THREE from 'three';
import { Baker, sph, cap, cyl, box, rbox as coreRbox, cone, tor, snake, lumpy, hash, GLOSS, PAPER } from './clay/core.ts';
import { kit } from './clay/kit.ts';
import { P } from './clay/palette.ts';
import { DISTRICTS, PLOT_SPACING, SEASONS, STREET_HALF, type District, type Season } from '../sim/economy.ts';
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
  update(time: number, detail: number, night: number, season?: Season, storm?: boolean): void;
}

/** A set of bakers for one chunk of town. */
class Chunk {
  full = new Baker(); props = new Baker(); win = new Baker(); block = new Baker();
  movers: Mover[] = [];
  /** Tree canopy parts in `full`, as [first, end) part indexes (they lean in a storm). */
  canopy: [number, number][] = [];
}
type Bk = Baker;
const add = (b: Bk, g: THREE.BufferGeometry, c: Col, o: Opt = {}) => b.add(g, c, o);

function ball(b: Bk, r: number, c: Col, x: number, y: number, z: number, seed = 0, seg = 9) {
  add(b, lumpy(sph(r, seg, Math.max(5, seg - 3)), r * 0.09, 1.3 / Math.max(0.35, r), seed), c, { p: [x, y, z] });
}
function lumpBlock(b: Bk, w: number, h: number, d: number, c: Col, x: number, y: number, z: number, seed = 0, r = 0.35) {
  add(b, lumpy(rbox(w, h, d, Math.min(r, w / 3, h / 3, d / 3)), Math.min(0.06, h * 0.015), 0.5, seed), c, { p: [x, y + h / 2, z] });
}
/**
 * A hand-pushed clay block for the close-up chunk: a subdivided box rounded at the edges, with
 * thumb-sized lumps on the big walls and a slight lean, so nothing reads as machine-made.
 */
export function clayBox(w: number, h: number, d: number, r: number, seed: number) {
  const cell = 1.3;
  const g = new THREE.BoxGeometry(w, h, d, Math.max(2, Math.ceil(w / cell)), Math.max(2, Math.ceil(h / cell)), Math.max(2, Math.ceil(d / cell)));
  r = Math.min(r, w / 3, h / 3, d / 3);
  const p = g.attributes.position, hw = w / 2 - r, hh = h / 2 - r, hd = d / 2 - r;
  const v = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    c.set(THREE.MathUtils.clamp(v.x, -hw, hw), THREE.MathUtils.clamp(v.y, -hh, hh), THREE.MathUtils.clamp(v.z, -hd, hd));
    const off = v.clone().sub(c);
    if (off.lengthSq() > 1e-8) v.copy(c).add(off.normalize().multiplyScalar(r));
    p.setXYZ(i, v.x, v.y, v.z);
  }
  // lumps stay shallower than the window glass, so nothing on a wall gets buried
  const out = lumpy(g, 0.045, 0.55, seed);
  // a soft, uneven sag along the top, different for every block
  const q = out.attributes.position;
  for (let i = 0; i < q.count; i++) {
    const top = (q.getY(i) + h / 2) / h;
    q.setY(i, q.getY(i) - top * top * (0.5 + 0.5 * Math.cos(q.getX(i) * 0.7 + q.getZ(i) * 0.5 + seed)) * 0.09);
  }
  out.computeVertexNormals();
  return out;
}
function clayBlock(b: Bk, w: number, h: number, d: number, c: Col, x: number, y: number, z: number, seed = 0, r = 0.5) {
  add(b, clayBox(w, h, d, r, seed), c, { p: [x, y + h / 2, z] });
}
/** A four-sided hip roof on a square base √2 across and 1 tall (scale it to the walls). */
function hip() { return new THREE.ConeGeometry(1, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0); }
function gable(b: Bk, w: number, d: number, rise: number, c: Col, x: number, y: number, z: number, ry = 0) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0.12, rise); s.lineTo(-0.12, rise); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: true, bevelThickness: 0.14, bevelSize: 0.14, bevelSegments: 1, curveSegments: 1 });
  g.translate(0, 0, -d / 2);
  add(b, g, c, { p: [x, y, z], r: [0, ry, 0] });
}
/** The season the town is being built for (createTown rebuilds its chunks when it turns). */
let SEASON: Season = 'summer';
const FALL: Col[] = ['#F08A5D', '#F2B04A', '#E8704F', '#E9A23B'];
function tree(C: Chunk, x: number, z: number, seed: number, greens: Col[], scale = 1, fruit = false) {
  const h = (1.5 + hash(seed, 3) * 0.7) * scale;
  add(C.full, cyl(0.14 * scale, 0.24 * scale, h, 6), P.walnut, { p: [x, h / 2, z] });
  if (SEASON === 'winter') {
    // bare pipe-cleaner branches
    for (let k = 0; k < 4; k++) {
      const a = k * 1.6 + seed, l = (0.9 + hash(seed, k) * 0.5) * scale;
      add(C.full, cyl(0.05 * scale, 0.08 * scale, l, 4), '#7A5A44', { p: [x + Math.cos(a) * l * 0.3, h + l * 0.35, z + Math.sin(a) * l * 0.3], r: [Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7] });
    }
    add(C.block, cyl(0.2 * scale, 0.3 * scale, h + 1.4 * scale, 5), '#7A5A44', { p: [x, (h + 1.4 * scale) / 2, z] });
    return;
  }
  if (SEASON === 'fall') {
    greens = FALL;
    // a pile of clay-flake leaves at the foot
    if (seed % 2) add(C.full, lumpy(sph(0.7 * scale, 7, 4), 0.12, 3, seed), FALL[seed % 4], { p: [x + 0.7 * scale, 0, z + 0.5 * scale], s: [1.3, 0.35, 1] });
  }
  if (SEASON === 'spring') {
    // clay-bead blossoms (lemon groves flower white)
    for (let k = 0; k < 5; k++) { const a = k * 1.3 + seed; add(C.full, sph(0.17 * scale, 5, 3), fruit ? '#FFFDF6' : ['#F7A8C4', '#FFFDF6'][k % 2], { p: [x + Math.cos(a) * 1.15 * scale, h + (0.7 + (k % 3) * 0.35) * scale, z + Math.sin(a) * 1.15 * scale] }); }
    fruit = false;
  }
  const n = 2 + (seed % 2), c0 = C.full.list.length;
  for (let k = 0; k <= n; k++) {
    const a = (k / n) * Math.PI * 2 + seed, rr = k === 0 ? 0 : 0.6 * scale;
    const r = ((k === 0 ? 1.2 : 0.85) + hash(seed, k) * 0.25) * scale;
    ball(C.full, r, greens[(seed + k) % greens.length], x + Math.cos(a) * rr, h + (0.8 + (k === 0 ? 0.35 : hash(k, seed) * 0.4)) * scale, z + Math.sin(a) * rr, seed * 5 + k, 9);
  }
  C.canopy.push([c0, C.full.list.length]);
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

/** The back of a backdrop building (the camera sees it from across the bay): windows, a back door, side windows. */
function backDress(C: Chunk, x: number, z: number, f: number, w: number, h: number, d: number, floors: number) {
  const zb = z - f * (d / 2);
  for (let fl = 0; fl < Math.max(1, floors); fl++) for (const dx of [-w * 0.28, w * 0.28]) if (1.4 + fl * 1.6 < h - 0.5) win(C, x + dx, 1.4 + fl * 1.6, zb, 1, 0.9, -f);
  add(C.full, rbox(0.9, 1.7, 0.16, 0.06), P.walnut, { p: [x, 0.85, zb - f * 0.02] });
  if (h > 2.6) for (const s of [-1, 1]) add(C.win, box(0.08, 0.9, 1), '#ffffff', { p: [x + s * (w / 2 + 0.01), Math.min(h * 0.5, 2.4), z] });
}
/** A clay gull standing on a roof. */
function gull(C: Chunk, x: number, y: number, z: number, seed: number) {
  const ry = hash(seed, 9) * Math.PI * 2, cx = Math.cos(ry), sz = Math.sin(ry);
  add(C.full, sph(0.24, 7, 5), '#FFFFFF', { p: [x, y + 0.3, z], s: [1.4, 0.9, 0.9], r: [0, ry, 0] });
  add(C.full, sph(0.15, 6, 4), '#FFFFFF', { p: [x + cx * 0.3, y + 0.5, z - sz * 0.3] });
  add(C.full, cone(0.05, 0.18, 4), '#FF9F1C', { p: [x + cx * 0.46, y + 0.5, z - sz * 0.46], r: [0, ry, -Math.PI / 2] });
  add(C.full, sph(0.2, 6, 3), '#AEB4BE', { p: [x - cx * 0.05, y + 0.36, z + sz * 0.05], s: [1.5, 0.4, 1.2], r: [0, ry, 0] });
  for (const s of [-1, 1]) add(C.full, cyl(0.025, 0.025, 0.2, 4), '#FF9F1C', { p: [x - sz * s * 0.08, y + 0.1, z - cx * s * 0.08] });
}

// ---------------------------------------------------------------- backdrop buildings, one per style
type Style = (C: Chunk, x: number, z: number, f: number, seed: number) => void;

const cottage: Style = (C, x, z, f, seed) => {
  const walls = [P.cream, '#F4B9C2', '#9ED3D6', '#FBE3A0', '#CFE8C0'];
  const roofs = [P.terra, P.walnut, '#5FA35A', '#7EA6D8'];
  const wall = walls[seed % walls.length], roof = roofs[(seed >> 1) % roofs.length];
  const w = 6 + hash(seed) * 1.5, h = 3 + hash(seed, 2) * 1.2, d = 4.6;
  clayBlock(C.full, w, h, d, wall, x, 0, z, seed);
  gable(C.full, w + 0.8, d + 0.6, h * 0.45 + 0.6, roof, x, h - 0.1, z);
  // scalloped card trim along the front eave
  for (let k = 0, xx = x - w / 2; xx < x + w / 2; xx += 0.46, k++)
    add(C.full, new THREE.CylinderGeometry(0.23, 0.23, 0.03, 6, 1, false, Math.PI / 2, Math.PI), k % 2 ? P.cream : roof, { p: [xx, h - 0.14, z + f * (d / 2 + 0.42)], r: [Math.PI / 2, 0, 0], fx: PAPER });
  lumpBlock(C.full, 0.6, 1.3, 0.6, P.terra, x + w * 0.28, h + 0.2, z - f * 0.6, seed + 1, 0.12);
  add(C.full, rbox(1, 1.8, 0.2, 0.08), P.walnut, { p: [x + 1, 0.9, z + f * d / 2] });
  win(C, x - w * 0.25, h * 0.5, z + f * (d / 2), 1.1, 1, f);
  // a flower box under the window
  add(C.props, rbox(1.2, 0.22, 0.3, 0.06), P.walnut, { p: [x - w * 0.25, h * 0.5 - 0.65, z + f * (d / 2 + 0.16)] });
  for (let k = 0; k < 4; k++) add(C.props, sph(0.11, 6, 4), [P.blush, '#C8325A', P.terra, '#FFFFFF'][(k + seed) % 4], { p: [x - w * 0.25 - 0.4 + k * 0.27, h * 0.5 - 0.47, z + f * (d / 2 + 0.18)] });
  // matchstick pickets along the front lawn, red clay tips
  const fz = z + f * (d / 2 + 1.8);
  for (let k = 0, xx = x - w / 2 - 0.4; xx < x + w / 2 + 0.4; xx += 0.5, k++) {
    if (Math.abs(xx - x - 1) < 0.8) continue;
    add(C.full, box(0.07, 0.7, 0.07), P.stick, { p: [xx, 0.35, fz], fx: PAPER });
    add(C.props, sph(0.06, 5, 4), '#C9452F', { p: [xx, 0.74, fz], s: [1, 1.5, 1] });
  }
  add(C.full, box(w + 0.8, 0.05, 0.04), P.stick, { p: [x, 0.45, fz], fx: PAPER });
  // mailbox
  stick(C.props, x + 2.4, 0, 1, fz + f * 0.4, 0.08);
  add(C.props, rbox(0.4, 0.4, 0.65, 0.17), P.teal, { p: [x + 2.4, 1.1, fz + f * 0.4] });
  if (seed % 3 === 0) { // a kiddie pool
    add(C.props, tor(0.8, 0.22, 6, 16), '#7EA6D8', { p: [x - 2.2, 0.2, z + f * (d / 2 + 1)], r: [Math.PI / 2, 0, 0] });
    add(C.props, cyl(0.8, 0.8, 0.05, 14), P.teal, { p: [x - 2.2, 0.2, z + f * (d / 2 + 1)], fx: GLOSS });
  }
  backDress(C, x, z, f, w, h, d, 1);
  // laundry lines across the back yard to the next house
  if (seed % 2 === 0) {
    const lz = z - f * (d / 2 + 1.8);
    for (const dx of [3.2, 8.8]) stick(C.full, x + dx, 0, 2.3, lz, 0.1);
    add(C.full, box(5.6, 0.03, 0.03), '#FFFDF6', { p: [x + 6, 2.15, lz] });
    for (let k = 0; k < 5; k++) add(C.full, rbox(0.7, 0.8 + hash(seed, k) * 0.3, 0.04, 0.02), ['#F4B9C2', '#9ED3D6', '#FBE3A0', '#FFFFFF', '#B9A7EA'][(k + seed) % 5], { p: [x + 3.9 + k * 1.05, 1.7, lz], r: [0, 0, (hash(k, seed) - 0.5) * 0.15], fx: PAPER });
  }
  lumpBlock(C.block, w, h + 1.5, d, wall, x, 0, z, seed, 0.6);
  blockLit(C, x, z, f, w, h + 1.5, d);
};

const brickFront: Style = (C, x, z, f, seed) => {
  const walls = ['#E9A07E', '#D98C6E', '#F0B48F', '#E6C7A0'];
  const wall = walls[seed % walls.length];
  const w = 9, h = 4.5 + (seed % 3) * 1.4, d = 5;
  clayBlock(C.full, w, h, d, wall, x, 0, z, seed);
  add(C.full, rbox(w + 0.4, 0.4, d + 0.3, 0.1), P.cream, { p: [x, h, z] });
  // tool-pressed brick lines
  for (let y = 0.6; y < h - 0.4; y += 0.7) add(C.full, box(w - 0.4, 0.05, 0.03), '#B8735A', { p: [x, y, z + f * (d / 2 + 0.01)] });
  for (let fl = 0; fl < Math.floor(h / 1.6); fl++) for (const dx of [-2.8, 0, 2.8]) if (fl || dx) win(C, x + dx, 1.4 + fl * 1.6, z + f * (d / 2), 1.2, 0.9, f);
  add(C.full, rbox(1.3, 2, 0.2, 0.08), '#3B6E8F', { p: [x, 1, z + f * d / 2] });
  // striped card awning
  for (let i = 0; i < 8; i++) add(C.full, box(1.1, 0.04, 1), i % 2 ? P.cream : [P.terra, P.green, '#7EA6D8'][seed % 3], { p: [x - 3.85 + i * 1.1, 2.3, z + f * (d / 2 + 0.45)], r: [f * 0.45, 0, 0], fx: PAPER });
  backDress(C, x, z, f, w, h, d, Math.floor(h / 1.6));
  lumpBlock(C.block, w, h, d, wall, x, 0, z, seed, 0.5);
  blockLit(C, x, z, f, w, h, d);
};

const sawtooth: Style = (C, x, z, f, seed) => {
  const walls = ['#E8DCC4', '#4A4458', '#D9CBB0'];
  const wall = walls[seed % 3];
  const w = 9, h = 4, d = 5;
  clayBlock(C.full, w, h, d, wall, x, 0, z, seed);
  for (let i = 0; i < 3; i++) add(C.full, rbox(3.2, 0.25, d + 0.3, 0.08), '#5B5568', { p: [x - 3 + i * 3, h + 0.8, z], r: [0, 0, -0.5] });
  // a mural on card
  const mural = ['#FF4FA3', '#C8325A', P.teal, P.terra, '#7CC47F', '#B9A7EA'];
  add(C.full, rbox(5, 2.4, 0.06, 0.03), '#FFFDF6', { p: [x - 1.2, 2, z + f * (d / 2 + 0.04)], fx: PAPER });
  for (let k = 0; k < 6; k++) add(C.full, sph(0.5 + hash(seed, k) * 0.4, 7, 4), mural[(k + seed + SEASONS.indexOf(SEASON) * 2) % 6], { p: [x - 3.2 + k * 0.8, 1.4 + hash(k, seed) * 1.3, z + f * (d / 2 + 0.07)], s: [1, 0.8, 0.06], fx: PAPER });
  win(C, x + 2.8, 2, z + f * (d / 2), 1.6, 1.4, f);
  // a skate rail out front
  add(C.props, cap(0.05, 3, 2, 5), P.chrome, { p: [x, 0.6, z + f * (d / 2 + 2)], r: [0, 0, Math.PI / 2], fx: GLOSS });
  for (const dx of [-1.4, 1.4]) add(C.props, cyl(0.05, 0.05, 0.6, 5), P.chrome, { p: [x + dx, 0.3, z + f * (d / 2 + 2)], fx: GLOSS });
  backDress(C, x, z, f, w, h, d, 1);
  if (seed % 3 === 1) {
    // a record shop: a big vinyl disc over the door and a crate of records out front
    const vz = z + f * (d / 2 + 0.12);
    add(C.full, cyl(1.2, 1.2, 0.1, 20), '#2E2A4F', { p: [x + 2.8, h + 0.6, vz], r: [Math.PI / 2, 0, 0], fx: GLOSS });
    add(C.full, cyl(0.45, 0.45, 0.12, 14), '#FF4FA3', { p: [x + 2.8, h + 0.6, vz + f * 0.02], r: [Math.PI / 2, 0, 0], fx: PAPER });
    add(C.full, rbox(1.1, 0.6, 0.8, 0.06), P.stick, { p: [x + 1.2, 0.3, z + f * (d / 2 + 0.8)], fx: PAPER });
    for (let k = 0; k < 5; k++) add(C.full, box(0.9, 0.9, 0.04), ['#FF4FA3', P.teal, '#C8325A', '#B9A7EA', P.terra][(k + seed) % 5], { p: [x + 1.2, 0.75, z + f * (d / 2 + 0.55 + k * 0.12)], r: [f * 0.15, 0, 0], fx: PAPER });
  }
  lumpBlock(C.block, w, h + 1, d, wall, x, 0, z, seed, 0.5);
  blockLit(C, x, z, f, w, h + 1, d);
};

const tower: Style = (C, x, z, f, seed) => {
  // printed-card colours: sky blue, lilac and mint card with cream trim, and a few bolder towers
  const glass = ['#8FC3E8', '#C3B3EA', '#A8DDC4', '#F2A7B8', '#7FB7C9', '#F5C38B'];
  const G = (k: number) => glass[(seed + k) % glass.length];
  // The camera looks south over the bay, so the north row (side 0, fronts facing +z) is the camera side:
  // it stays low so it never hides the plots; the tall towers stand across the street.
  const w = 7, d = 6, h = f > 0 ? 5 + (seed % 2) * 1.6 : 12 + (seed % 4) * 4;
  // tall towers step back two-thirds of the way up and wear a rounded crown
  const hb = h > 10 ? Math.round(h * 0.66 / 1.6) * 1.6 + 0.2 : h, w2 = w - 1.8, d2 = d - 1.6;
  clayBlock(C.full, w, hb, d, G(0), x, 0, z, seed, 0.45);
  if (hb < h) {
    clayBlock(C.full, w2, h - hb, d2, G(1), x, hb, z, seed + 5, 0.45);
    add(C.full, rbox(w + 0.3, 0.3, d + 0.3, 0.12), '#FFF1D6', { p: [x, hb, z] });
  }
  // printed-card glass: window bands on every face, panes in slightly different card tints
  const tints = ['#ffffff', '#F2F7FF', '#FFF6E2'];
  for (let y = 1.6; y < h - 0.6; y += 1.6) {
    const up = y >= hb, ww = up ? w2 : w, dd = up ? d2 : d, nf = up ? 3 : 4, ns = up ? 2 : 3;
    add(C.full, rbox(ww + 0.08, 0.2, dd + 0.08, 0.05), '#FFF1D6', { p: [x, y - 0.15, z] });
    for (let k = 0; k < nf; k++) for (const s of [1, -1]) add(C.win, box(1.2, 1.05, 0.06), tints[(k + Math.round(y)) % 3], { p: [x + (k - (nf - 1) / 2) * 1.6, y + 0.6, z + s * f * (dd / 2 + 0.03)] });
    for (let k = 0; k < ns; k++) for (const s of [1, -1]) add(C.win, box(0.06, 1.05, 1.2), tints[(k + Math.round(y) + 1) % 3], { p: [x + s * (ww / 2 + 0.03), y + 0.6, z + (k - (ns - 1) / 2) * 1.6] });
  }
  {
    // clay-snake neon across the front (glows from golden hour) and a revolving door
    const zz: [number, number, number][] = [];
    for (let k = 0; k <= 10; k++) zz.push([x - 2.8 + k * 0.56, 3.6 + (k % 2 ? 0.3 : -0.3), z + f * (d / 2 + 0.12)]);
    add(C.full, snake(zz, 0.08, 30, 5), ['#FF4FA3', '#2EC4F1', '#FFB878', '#7CF07C'][seed % 4], { fx: 1 });
    add(C.full, cyl(1.1, 1.1, 0.25, 12), P.chrome, { p: [x - 1.5, 2.35, z + f * (d / 2 + 0.6)], fx: GLOSS });
    add(C.full, cyl(1.1, 1.1, 0.1, 12), '#5B5568', { p: [x - 1.5, 0.05, z + f * (d / 2 + 0.6)] });
    C.movers.push({ kind: 'door', x: x - 1.5, y: 0.1, z: z + f * (d / 2 + 0.6), ph: seed });
  }
  if (hb < h) {
    // a rounded crown with a spire
    add(C.full, sph(Math.min(w2, d2) / 2, 14, 7, ), G(2), { p: [x, h, z], s: [w2 / Math.min(w2, d2), 0.7, d2 / Math.min(w2, d2)] });
    add(C.full, cone(0.18, 2.2, 6), P.chrome, { p: [x, h + 2.2, z], fx: GLOSS });
    add(C.full, sph(0.2, 8, 6), '#FF4FA3', { p: [x, h + 3.3, z], fx: GLOSS + 1 });
    // an antenna with a paper pennant
    add(C.full, cyl(0.05, 0.05, 2.4, 4), '#5B5568', { p: [x + w2 / 2 - 0.5, h - 0.2 + 1.2, z] });
    add(C.full, cone(0.3, 1, 3), [P.terra, P.teal, P.blush][seed % 3], { p: [x + w2 / 2 - 0.05, h + 1.5, z], r: [0, 0, -Math.PI / 2], s: [1, 1, 0.12], fx: PAPER });
  } else {
    // a lumpy cap, a water tank on stilts and a striped card awning over the door
    add(C.full, lumpy(rbox(w + 0.3, 0.5, d + 0.3, 0.2), 0.04, 1, seed), '#FFF1D6', { p: [x, h + 0.2, z] });
    for (const sx of [-0.5, 0.5]) for (const sz of [-0.5, 0.5]) add(C.full, cyl(0.07, 0.07, 1.2, 4), P.walnut, { p: [x + 1.8 + sx, h + 1, z - f * 1 + sz] });
    add(C.full, lumpy(cyl(0.85, 0.85, 1.4, 10), 0.03, 2, seed), '#C98F5E', { p: [x + 1.8, h + 2.2, z - f * 1], fx: PAPER });
    add(C.full, cone(0.95, 0.6, 10), '#8B5E3C', { p: [x + 1.8, h + 3.2, z - f * 1] });
    for (let i = 0; i < 6; i++) add(C.full, box(0.9, 0.04, 1.1), i % 2 ? '#FFF1D6' : [P.terra, P.teal, P.blush][seed % 3], { p: [x - 2.25 + i * 0.9, 2.9, z + f * (d / 2 + 0.5)], r: [f * 0.4, 0, 0], fx: PAPER });
  }
  // a food cart on the plaza out front
  if (seed % 2) {
    const cx = x + 2, cz = z + f * (d / 2 + 2.4);
    add(C.props, rbox(1.6, 0.9, 0.9, 0.1), ['#C8325A', P.terra, P.teal][seed % 3], { p: [cx, 0.75, cz] });
    for (const dx of [-0.5, 0.5]) add(C.props, cyl(0.22, 0.22, 0.1, 10), P.plum, { p: [cx + dx, 0.22, cz], r: [Math.PI / 2, 0, 0] });
    stick(C.props, cx, 1.2, 2.2, cz, 0.06, P.cream);
    for (let k = 0; k < 6; k++) add(C.props, new THREE.ConeGeometry(0.8, 0.35, 3, 1, true, (k / 6) * Math.PI * 2, Math.PI / 3), k % 2 ? P.cream : P.terra, { p: [cx, 2.3, cz], fx: PAPER });
  }
  // a paved plaza out front with planters and a bench
  add(C.full, rbox(w + 2, 0.12, 3.4, 0.05), '#E3D8C6', { p: [x, 0.06, z + f * (d / 2 + 1.8)] });
  for (const dx of [-w / 2 - 0.2, w / 2 + 0.2]) { add(C.full, rbox(1, 0.7, 1, 0.12), '#C9A27A', { p: [dx + x, 0.4, z + f * (d / 2 + 2.6)] }); ball(C.full, 0.6, '#5FA35A', x + dx, 1.05, z + f * (d / 2 + 2.6), seed, 7); }
  lumpBlock(C.block, w, h, d, G(0), x, 0, z, seed, 0.4);
  blockLit(C, x, z, f, w, h, d);
};

const warehouse: Style = (C, x, z, f, seed) => {
  const walls = ['#B86A4B', '#8E949C', '#D9CBB0', '#A55B3F'];
  const wall = walls[seed % 4];
  const w = 9.5, h = 4, d = 6;
  clayBlock(C.full, w, h, d, wall, x, 0, z, seed);
  // a rounded roof
  add(C.full, new THREE.CylinderGeometry(d / 2 + 0.2, d / 2 + 0.2, w + 0.3, 12, 1, false, 0, Math.PI), '#7A7F88', { p: [x, h - 0.2, z], r: [0, 0, Math.PI / 2], s: [1, 0.45, 1] });
  add(C.full, rbox(3, 3, 0.2, 0.08), '#5F5A74', { p: [x - 1.5, 1.5, z + f * d / 2] });
  for (let k = 0; k < 6; k++) add(C.full, box(3, 0.05, 0.05), '#4A4458', { p: [x - 1.5, 0.3 + k * 0.5, z + f * (d / 2 + 0.11)] });
  win(C, x + 2.8, 2.6, z + f * (d / 2), 1.6, 0.8, f);
  // crate stacks
  for (let k = 0; k < 5; k++) add(C.props, rbox(0.9, 0.8, 0.9, 0.06), [P.stick, '#C9A27A'][k % 2], { p: [x + 2.2 + (k % 3) * 0.95, 0.4 + Math.floor(k / 3) * 0.8, z + f * (d / 2 + 1.4)], fx: PAPER });
  backDress(C, x, z, f, w, h, d, 1);
  for (let k = 0; k < 1 + (seed % 3); k++) gull(C, x - 3 + k * 2.6, h + 1.15, z + (hash(seed, k) - 0.5) * 2, seed + k);
  lumpBlock(C.block, w, h + 1, d, wall, x, 0, z, seed, 0.5);
  blockLit(C, x, z, f, w, h + 1, d);
};

const barn: Style = (C, x, z, f, seed) => {
  const walls = ['#A9C3A0', '#C2453A', '#E9D8A6'];
  const wall = walls[seed % 3];
  const w = 7, h = 3.6, d = 5;
  clayBlock(C.full, w, h, d, wall, x, 0, z, seed);
  gable(C.full, w + 0.6, d + 0.5, 2.2, '#8B5E3C', x, h - 0.1, z);
  add(C.full, rbox(2.2, 2.6, 0.18, 0.06), '#FFFDF6', { p: [x, 1.3, z + f * d / 2] });
  add(C.full, box(0.12, 2.8, 0.04), wall, { p: [x, 1.3, z + f * (d / 2 + 0.1)], r: [0, 0, 0.7] });
  // a silo
  add(C.full, lumpy(cyl(1.1, 1.1, 5.5, 12), 0.03, 1.5, seed), '#D8D3DE', { p: [x + w / 2 + 1.4, 2.75, z] });
  add(C.full, sph(1.15, 12, 6), '#C2453A', { p: [x + w / 2 + 1.4, 5.5, z], s: [1, 0.6, 1] });
  // hay bales
  for (let k = 0; k < 3; k++) add(C.props, lumpy(cyl(0.6, 0.6, 1, 10), 0.04, 2, k + seed), '#E8C36A', { p: [x - 2.6 + k * 1.3, 0.62, z + f * (d / 2 + 1.6)], r: [0, 0, Math.PI / 2] });
  backDress(C, x, z, f, w, h, d, 0);
  lumpBlock(C.block, w + 2, h + 1.5, d, wall, x, 0, z, seed, 0.5);
  blockLit(C, x, z, f, w + 2, h + 1.5, d);
};

const mansion: Style = (C, x, z, f, seed) => {
  const w = 9, h = 4.4, d = 6;
  const wall = ['#FFFDF6', '#EDE4F2', '#F6EEDF'][seed % 3];
  clayBlock(C.full, w, h, d, wall, x, 0, z, seed);
  // a hipped slate roof, and a dome on a drum with a gilt finial
  const dome = seed % 2 ? '#B9A7EA' : '#7FB7C9';
  add(C.full, hip(), '#6E6487', { p: [x, h - 0.1, z], s: [(w + 0.8) / Math.SQRT2, 1.8, (d + 0.8) / Math.SQRT2] });
  add(C.full, lumpy(cyl(1.3, 1.4, 1.1, 14), 0.02, 2, seed), wall, { p: [x, h + 1.7, z] });
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; add(C.full, box(0.16, 0.8, 0.12), '#FFFFFF', { p: [x + Math.cos(a) * 1.38, h + 1.7, z + Math.sin(a) * 1.38], r: [0, -a, 0] }); }
  add(C.full, sph(1.45, 14, 8, ), dome, { p: [x, h + 2.2, z], s: [1, 0.9, 1] });
  add(C.full, sph(0.22, 8, 6), P.gold, { p: [x, h + 3.6, z], fx: GLOSS });
  for (const dx of [-3, -1, 1, 3]) add(C.full, cyl(0.22, 0.25, h - 0.3, 8), '#FFFFFF', { p: [x + dx, (h - 0.3) / 2, z + f * (d / 2 + 0.3)] });
  for (const dx of [-3.4, 3.4]) win(C, x + dx, 2.6, z + f * (d / 2), 0.9, 1.3, f);
  // hedge wall with a gate gap, and topiaries
  for (const s of [-1, 1]) add(C.full, lumpy(rbox(3.6, 1.2, 0.9, 0.4), 0.06, 1.5, seed + s), '#3F7F45', { p: [x + s * 2.6, 0.6, z + f * (d / 2 + 2.6)] });
  for (const s of [-1, 1]) {
    add(C.props, cyl(0.1, 0.12, 0.6, 6), P.walnut, { p: [x + s * 5, 0.3, z + f * (d / 2 + 1)] });
    ball(C.props, 0.55, '#3F7F45', x + s * 5, 1.0, z + f * (d / 2 + 1), seed + s, 8);
    ball(C.props, 0.35, '#3F7F45', x + s * 5, 1.7, z + f * (d / 2 + 1), seed + s + 3, 7);
  }
  // an opening gate in the hedge gap
  for (const s of [-1, 1]) add(C.full, rbox(0.3, 1.6, 0.3, 0.08), P.cream, { p: [x + s * 0.85, 0.8, z + f * (d / 2 + 2.6)] });
  for (const s of [-1, 1]) C.movers.push({ kind: 'gate', x: x + s * 0.75, y: 0, z: z + f * (d / 2 + 2.6), ph: seed, ry: s > 0 ? Math.PI : 0, dir: s * f });
  backDress(C, x, z, f, w, h, d, 1);
  lumpBlock(C.block, w, h + 1.5, d, wall, x, 0, z, seed, 0.6);
  blockLit(C, x, z, f, w, h + 1.5, d);
};

const beachHut: Style = (C, x, z, f, seed) => {
  const walls = ['#9ED3D6', '#F4B9C2', '#FBE3A0', '#FFFDF6'];
  const wall = walls[seed % 4];
  // a popsicle-stick deck and a striped hut
  for (let k = 0; k < 10; k++) add(C.full, rbox(0.55, 0.1, 5, 0.03), P.stick, { p: [x - 2.6 + k * 0.58, 0.3, z], fx: PAPER });
  clayBlock(C.full, 4, 2.8, 3.4, wall, x - 0.6, 0.35, z - f * 0.4, seed);
  gable(C.full, 4.6, 3.8, 1.2, [P.terra, P.teal, '#C8325A'][seed % 3], x - 0.6, 3.1, z - f * 0.4);
  for (let k = 0; k < 6; k++) add(C.props, box(0.6, 2.6, 0.03), k % 2 ? '#FFFDF6' : wall, { p: [x - 2.1 + k * 0.6, 1.7, z - f * 0.4 + f * 1.72], fx: PAPER });
  // surfboards leaning on the wall
  for (let k = 0; k < 2; k++) add(C.props, lumpy(cap(0.32, 2.2, 3, 8), 0.02, 2, k), [P.terra, '#C8325A', P.teal][(k + seed) % 3], { p: [x + 2 + k * 0.6, 1.5, z + f * 1.5], r: [f * 0.2, 0, 0.1], s: [1, 1, 0.25] });
  if (seed % 2) gull(C, x - 0.6, 4.35, z - f * 0.4, seed);
  // the back: a round porthole window, a door and a towel drying on the rail
  win(C, x - 1.6, 1.9, z - f * 2.11, 0.8, 0.8, -f);
  add(C.full, rbox(0.8, 1.6, 0.14, 0.05), P.walnut, { p: [x + 0.3, 1.15, z - f * 2.12] });
  for (const dx of [1.6, 2.8]) stick(C.full, x + dx, 0.3, 1.75, z - f * 2.4, 0.08);
  add(C.full, box(1.3, 0.03, 0.03), '#FFFDF6', { p: [x + 2.2, 1.65, z - f * 2.4] });
  add(C.full, rbox(1, 1.1, 0.04, 0.02), [P.blush, P.teal, '#C8325A'][seed % 3], { p: [x + 2.2, 1.1, z - f * 2.4], fx: PAPER });
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
    b.add(rbox(0.9, 0.7, 1.2, 0.2), [P.terra, '#7EA6D8', P.teal, P.blush, '#C8325A'][k % 5], { p: [Math.cos(a) * R, Math.sin(a) * R - 0.5, 0] });
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
  add(C.full, sph(0.3, 8, 6), '#C8325A', { p: [x, 6.4, z] });
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
  clayBlock(C.full, 10, 4, 6, '#FFFDF6', x, 0, z, 3);
  gable(C.full, 11, 6.8, 2.2, '#3F7F45', x, 3.9, z);
  for (let k = 0; k < 6; k++) add(C.props, sph(0.12, 6, 4), '#FFFFFF', { p: [x - 6 + k * 2.3, 0.1, z + 6 + (k % 2) * 1.2] });
  stick(C.props, x + 7, 0, 2.2, z + 5, 0.06, '#FFFFFF');
  add(C.props, cone(0.45, 0.6, 3), P.terra, { p: [x + 7.3, 2, z + 5], r: [0, 0, -Math.PI / 2], s: [1, 1, 0.1], fx: PAPER });
  lumpBlock(C.block, 10, 6, 6, '#FFFDF6', x, 0, z, 3, 1);
}
function fairTents(x: number, z: number, C: Chunk) {
  for (let k = 0; k < 3; k++) {
    const tx = x - 5 + k * 5, c = [P.terra, '#7EA6D8', '#C8325A'][k];
    add(C.full, cyl(1.8, 1.8, 2, 12), '#FFFDF6', { p: [tx, 1, z] });
    for (let s = 0; s < 8; s++) add(C.full, new THREE.ConeGeometry(2.2, 2, 8, 1, true, (s / 8) * Math.PI * 2, Math.PI / 4), s % 2 ? '#FFFDF6' : c, { p: [tx, 3, z], fx: PAPER });
    stick(C.full, tx, 4, 5, z, 0.06, P.walnut);
    add(C.props, cone(0.3, 0.4, 3), c, { p: [tx + 0.25, 4.8, z], r: [0, 0, -Math.PI / 2], s: [1, 1, 0.1], fx: PAPER });
  }
  // the big-top pole with its pennants, so the fair stands over the barns and silos
  stick(C.full, x, 0, 9.5, z, 0.22, P.cream);
  for (let k = 0; k < 4; k++) add(C.full, cone(0.35, 1.1, 3), [P.terra, P.teal, '#C8325A', P.blush][k], { p: [x + 0.6, 9.2 - k * 1.1, z], r: [0, 0, -Math.PI / 2], s: [1, 1, 0.12], fx: PAPER });
  for (let s = 0; s < 8; s++) add(C.full, new THREE.ConeGeometry(2.6, 3, 8, 1, true, (s / 8) * Math.PI * 2, Math.PI / 4), s % 2 ? '#FFFDF6' : P.terra, { p: [x, 5.3, z], fx: PAPER });
  lumpBlock(C.block, 14, 4, 4, P.terra, x, 0, z, 5, 1);
}
function quad(x: number, z: number, C: Chunk, greens: Col[]) {
  add(C.full, rbox(9, 0.12, 9, 0.05), '#9BD48A', { p: [x, 0.06, z] });
  for (const s of [-1, 1]) add(C.full, rbox(9, 0.13, 0.9, 0.05), WALK, { p: [x, 0.07, z], r: [0, s * Math.PI / 4, 0] });
  clayBlock(C.full, 2.4, 6, 2.4, '#C97C5E', x, 0, z - 6, 8, 0.2);
  add(C.full, cone(1.8, 2, 4), '#5B5568', { p: [x, 7, z - 6], r: [0, Math.PI / 4, 0] });
  for (const [dx, dz] of [[-3.6, -3.6], [3.6, 3.6], [-3.6, 3.6], [3.6, -3.6]]) tree(C, x + dx, z + dz, Math.abs(dx * 7 + dz), greens, 0.9);
}
function fishMarket(x: number, z: number, C: Chunk) {
  clayBlock(C.full, 9, 3, 5, '#9ED3D6', x, 0, z, 4);
  gable(C.full, 9.6, 5.6, 1.4, '#FFFDF6', x, 2.9, z);
  // a big clay fish on the roof
  add(C.full, sph(1.4, 12, 8), P.terra, { p: [x, 5.6, z], s: [1.6, 0.8, 0.4] });
  add(C.full, cone(0.9, 1.2, 3), P.terra, { p: [x - 2.6, 5.6, z], r: [0, 0, Math.PI / 2], s: [1, 1, 0.3] });
  add(C.full, sph(0.15, 6, 4), P.plum, { p: [x + 1.5, 5.8, z + 0.45], fx: GLOSS });
  lumpBlock(C.block, 9, 5, 5, '#9ED3D6', x, 0, z, 4, 1);
}

// ---------------------------------------------------------------- eye music
function windmill(x: number, z: number, parts: THREE.Object3D[], C: Chunk, f: number) {
  clayBlock(C.full, 2, 6, 2, '#DCE5D2', x, 0, z, 13, 0.3);
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
  b.add(rbox(1.6, 1.2, 1.4, 0.15), '#C8325A', { p: [0, 0.6, 0] });
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
type Mover = { kind: MoverKind; x: number; y: number; z: number; ph: number; ry?: number; dir?: number };
type MoverKind = (typeof MOVER_KINDS)[number];
const MOVER_KINDS = ['sprinkler', 'buoy', 'boat', 'gate', 'door', 'kite'] as const;
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
  else if (kind === 'boat') {
    // a soap-bar boat with a paper sail on a stick mast
    b.add(lumpy(rbox(2.2, 0.6, 1.1, 0.28), 0.03, 2, 3), '#F7C6D9', { p: [0, 0.2, 0], fx: GLOSS });
    b.add(cyl(0.05, 0.05, 2, 5), P.stick, { p: [0, 1.4, 0], fx: PAPER });
    b.add(cone(0.7, 1.6, 3), '#FFFDF6', { p: [0.38, 1.5, 0], s: [1, 1, 0.08], fx: PAPER });
    b.add(cone(0.12, 0.3, 3), P.terra, { p: [0.12, 2.5, 0], r: [0, 0, -Math.PI / 2], s: [1, 1, 0.2], fx: PAPER });
  } else if (kind === 'gate') {
    // one leaf of a white picket gate, hinged at the origin and opening along +x
    for (let k = 0; k < 4; k++) b.add(box(0.12, 1.2, 0.06), '#FFFFFF', { p: [0.1 + k * 0.18, 0.75, 0], fx: PAPER });
    for (const y of [0.45, 1.05]) b.add(box(0.7, 0.1, 0.07), '#FFFFFF', { p: [0.37, y, 0], fx: PAPER });
  } else if (kind === 'door') {
    // a revolving door: four glass wings round a chrome post
    b.add(cyl(0.08, 0.08, 2.2, 6), P.chrome, { p: [0, 1.1, 0], fx: GLOSS });
    for (let k = 0; k < 4; k++) b.add(box(0.95, 2, 0.05), '#BFE3F0', { p: [Math.cos(k * Math.PI / 2) * 0.5, 1.1, Math.sin(k * Math.PI / 2) * 0.5], r: [0, -k * Math.PI / 2, 0], fx: GLOSS });
  } else if (kind === 'kite') {
    // a paper kite on a thread, with a bow tail
    b.add(cone(0.8, 1.6, 4), '#FF4FA3', { s: [1, 1, 0.08], fx: PAPER });
    b.add(cone(0.8, 0.6, 4), P.teal, { p: [0, -1.1, 0], r: [Math.PI, 0, 0], s: [1, 1, 0.08], fx: PAPER });
    for (let k = 0; k < 4; k++) b.add(sph(0.1, 5, 3), [P.teal, '#C8325A'][k % 2], { p: [Math.sin(k) * 0.2, -1.8 - k * 0.45, 0], s: [1.6, 0.7, 0.5], fx: PAPER });
    b.add(cyl(0.012, 0.012, 9, 3), '#FFFDF6', { p: [0, -4.8, 2], r: [-0.45, 0, 0] });
  } else {
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
  let parts: THREE.Object3D[] = [];
  let meshes: THREE.Mesh[] = [];
  let chunks: Record<'full' | 'props' | 'win' | 'block', THREE.Mesh | null>[] = [];
  let flocks: { kind: MoverKind; list: Mover[]; im: THREE.InstancedMesh }[] = [];
  let built: Season | null = null;
  let stormy = false;

  /** Bake the whole town for a season (again when the season turns). */
  function build(season: Season) {
    for (const m of meshes) { m.removeFromParent(); m.geometry.dispose(); if ((m as THREE.InstancedMesh).isInstancedMesh) (m as THREE.InstancedMesh).dispose(); }
    for (const p of parts) p.removeFromParent();
    meshes = []; chunks = []; parts = []; flocks = [];
    SEASON = season;
    const movers: Mover[] = [];
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
        if (d.id === 'maple' && col % 2 === 0 && col < d.cols && season !== 'winter') sprinkler(gx + 6, z - s * (SIDEWALK_OFFSET + 6.5), movers, C);
        if (d.id === 'oldtown' && col % 3 === 1) bench(C, gx + 2, z - s * (SIDEWALK_OFFSET + 0.2), s);
        if (d.id === 'hilltop' && col < d.cols) for (const t of [-1, 1]) { add(C.props, cyl(0.1, 0.12, 0.5, 6), P.walnut, { p: [gx + 1.5, 0.25, z + t * (SIDEWALK_OFFSET + 1.6)] }); ball(C.props, 0.5, '#3F7F45', gx + 1.5, 0.9, z + t * (SIDEWALK_OFFSET + 1.6), col + t, 7); }
        if ((d.id === 'campus' || d.id === 'maple' || d.id === 'downtown') && col % 3 === 1) hydrant(C, gx - 1.4, z + s * (SIDEWALK_OFFSET + 0.3));
        // summer bunting and winter string lights across the busy streets
        if ((d.id === 'oldtown' || d.id === 'boardwalk' || d.id === 'maple') && col % 2 === 1 && col < d.cols && (season === 'summer' || season === 'winter')) streetLine(C, gx, z, season, col);
        // spring kites over the open ground
        if (season === 'spring' && (d.id === 'maple' || d.id === 'boardwalk' || d.id === 'campus') && col % 3 === 1 && col < d.cols)
          movers.push({ kind: 'kite', x: gx + 6, y: 11 + (col % 2) * 2, z: d.id === 'boardwalk' ? SEA_Z - 6 : z - 16, ph: col + d.origin[0] });
      }
      if (d.id === 'boardwalk') beach(C, d);
      if (d.id === 'harbor') {
        for (let k = 0; k < 6; k++) buoy(d.origin[0] + 6 + k * 13, SEA_Z + 7 + (k % 2) * 5, movers, k);
        for (let k = 0; k < 4; k++) movers.push({ kind: 'boat', x: d.origin[0] + 12 + k * 19, y: -0.3, z: SEA_Z + 10 + (k % 2) * 6, ph: k * 1.7, ry: k * 0.9 });
      }
      if (d.id === 'groves') parts.push(tractor(d));
      if (d.id === 'hilltop') { parts.push(golfCart(d)); parts.push(yacht(d)); }
      movers.push(...C.movers);
      const mk = (b: Baker, mat: THREE.Material, cast: boolean, name: string) => {
        if (!b.size) return null;
        const m = new THREE.Mesh(b.build(), mat);
        m.castShadow = cast;
        m.receiveShadow = true;
        m.name = `town-${name}:${d.id}`;
        scene.add(m);
        meshes.push(m);
        return m;
      };
      // canopy parts as vertex ranges in the merged full chunk (the parts merge in order)
      const starts: number[] = [];
      let vn = 0;
      for (const g of C.full.list) { starts.push(vn); vn += g.attributes.position.count; }
      starts.push(vn);
      const canopy = C.canopy.map(([a, b]) => [starts[a], starts[b]] as [number, number]);
      const block = mk(C.block, K.world, true, 'block');
      if (block) block.visible = false;
      const full = mk(C.full, K.world, true, 'full');
      if (full && canopy.length) full.userData.canopy = canopy;
      chunks.push({ full, props: mk(C.props, K.world, true, 'props'), win: mk(C.win, K.window, false, 'win'), block });
    }
    for (const p of parts) { scene.add(p); p.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); }); }
    for (const kind of MOVER_KINDS) {
      const list = movers.filter((m) => m.kind === kind);
      if (!list.length) continue;
      const im = new THREE.InstancedMesh(moverGeometry(kind), K.world, list.length);
      im.name = `town-${kind}`;
      im.castShadow = kind === 'boat' || kind === 'kite';
      im.receiveShadow = true;
      scene.add(im);
      meshes.push(im);
      flocks.push({ kind, list, im });
    }
    treeWeather(scene, season, stormy);
    shownDetail = -1;
    lastF = -1;
    built = season;
  }

  const mm = new THREE.Matrix4(), mq = new THREE.Quaternion(), me = new THREE.Euler(), mv = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  let lastF = -1;
  let shownDetail = -1;
  build('summer');
  return {
    update(time, detail, night, season = 'summer', storm = false) {
      if (season !== built) { stormy = storm; build(season); } else if (storm !== stormy) { stormy = storm; treeWeather(scene, season, storm); }
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
      const t = f12 / 12;
      for (const p of parts) {
        const [kind, what] = p.name.split(':');
        const ph = (p.userData.phase as number) ?? 0;
        if (kind === 'spin') {
          if (what === 'wheel') p.rotation.z = -t * 0.12;
          else if (what === 'windmill') p.rotation.z = -t * 0.9;
        } else if (kind === 'sway') p.rotation.y = Math.sin(t * 0.25 + ph) * 0.6;
        else if (kind === 'bob') {
          // the band bounces to the beat; the yacht rides the swell
          const y0 = p.userData.y0 as number;
          if (what === 'band') p.children.forEach((c, i) => { c.position.y = Math.abs(Math.sin(t * 4 + i * 1.3)) * 0.25; c.rotation.z = Math.sin(t * 2 + i) * 0.12; });
          else { p.position.y = y0 + Math.sin(t * 1.3) * 0.15; p.rotation.z = Math.sin(t * 0.9) * 0.05; }
        } else if (kind === 'drive') {
          // to and fro along its lane, turning round at each end
          const { x0, x1, speed } = p.userData as { x0: number; x1: number; speed: number };
          const span = x1 - x0, u = (t * speed) % (2 * span), fwd = u < span;
          p.position.x = fwd ? x0 + u : x1 - (u - span);
          p.rotation.y = fwd ? 0 : Math.PI;
          p.position.y = (f12 % 2) * 0.04; // a bumpy ride on button wheels
        }
      }
      for (const f of flocks) {
        if (f.kind === 'sprinkler') f.im.visible = night < 0.5; // sprinklers run by day
        f.list.forEach((m, i) => {
          let y = m.y, ry = m.ry ?? 0, rz = 0;
          if (f.kind === 'sprinkler') ry = Math.sin(t * 1.4 + m.ph) * 1.2;
          else if (f.kind === 'buoy') { rz = Math.sin(t * 1.1 + m.ph) * 0.12; y += Math.sin(t * 1.6 + m.ph) * 0.12; }
          else if (f.kind === 'boat') { rz = Math.sin(t * 1.2 + m.ph) * 0.08; y += Math.sin(t * 1.5 + m.ph) * 0.1; ry += Math.sin(t * 0.2 + m.ph) * 0.3; }
          else if (f.kind === 'gate') ry += (m.dir ?? 1) * (0.5 + 0.5 * Math.sin(t * 0.35 + m.ph)) * 1.4;
          else if (f.kind === 'door') ry = t * 1.1 + m.ph;
          else if (f.kind === 'kite') { rz = Math.sin(t * 0.8 + m.ph) * 0.25; y += Math.sin(t * 0.6 + m.ph) * 0.6; }
          me.set(0, ry, rz);
          mq.setFromEuler(me);
          mv.set(m.x, y, m.z);
          f.im.setMatrixAt(i, mm.compose(mv, mq, one));
        });
        f.im.instanceMatrix.needsUpdate = true;
        f.im.computeBoundingSphere();
      }
    },
  };
}

/** Summer paper bunting or winter string lights strung across the street on two poles. */
function streetLine(C: Chunk, x: number, z: number, season: Season, seed: number) {
  const zs = SIDEWALK_OFFSET + 0.4, top = 5.2;
  for (const s of [-1, 1]) stick(C.full, x, 0, top + 0.2, z + s * zs, 0.12, '#FFFDF6');
  const n = 14;
  for (let k = 0; k <= n; k++) {
    const u = k / n, zz = z - zs + u * zs * 2, y = top - Math.sin(u * Math.PI) * 0.9;
    if (k < n) add(C.full, box(0.03, 0.03, (zs * 2) / n + 0.05), '#FFFDF6', { p: [x, y - Math.cos(u * Math.PI) * 0.1, zz + zs / n], r: [-Math.cos((u + 0.5 / n) * Math.PI) * 0.36, 0, 0] });
    if (k === 0 || k === n) continue;
    if (season === 'summer') add(C.full, cone(0.32, 0.7, 3), [P.terra, '#C8325A', P.teal, P.blush][(k + seed) % 4], { p: [x, y - 0.42, zz], r: [Math.PI, 0, 0], s: [1, 1, 0.12], fx: PAPER });
    else add(C.full, sph(0.13, 6, 4), ['#FFE2A8', '#FF8FB1', '#9FE3FF', '#B8F28C'][(k + seed) % 4], { p: [x, y - 0.18, zz], s: [1, 1.3, 1], fx: GLOSS + 1 });
  }
}
/** The Groves' tractor on button wheels, driving the farm lane behind the plots. */
function tractor(d: District) {
  const b = new Baker();
  b.add(rbox(1.8, 0.9, 1.2, 0.25), '#C2453A', { p: [0.2, 1.0, 0] });
  b.add(rbox(0.9, 1.1, 1.1, 0.2), '#C2453A', { p: [-0.6, 1.9, 0] });
  b.add(rbox(1.0, 0.1, 1.3, 0.04), '#FFFDF6', { p: [-0.6, 2.5, 0] });
  b.add(cyl(0.08, 0.08, 0.7, 6), '#5B5568', { p: [0.8, 1.8, 0.3] });
  for (const s of [-1, 1]) {
    // button wheels: big at the back, small at the front, with two holes each
    b.add(cyl(0.75, 0.75, 0.35, 16), '#FFF1D6', { p: [-0.6, 0.75, s * 0.75], r: [Math.PI / 2, 0, 0] });
    b.add(cyl(0.4, 0.4, 0.3, 12), '#FFF1D6', { p: [0.9, 0.4, s * 0.7], r: [Math.PI / 2, 0, 0] });
    for (const dx of [-0.18, 0.18]) b.add(cyl(0.08, 0.08, 0.37, 6), '#8B5E3C', { p: [-0.6 + dx, 0.75, s * 0.75], r: [Math.PI / 2, 0, 0] });
  }
  return driver(b, 'drive:tractor', d.origin[0] + 4, d.origin[0] + d.cols * PLOT_SPACING - 4, d.origin[1] - 15.9, 1.6);
}
/** Hilltop's golf cart, puttering along the lane behind the south-side estates (clear of their hedges and topiaries). */
function golfCart(d: District) {
  const b = new Baker();
  b.add(rbox(2.2, 0.6, 1.2, 0.2), '#FFFDF6', { p: [0, 0.6, 0] });
  b.add(rbox(0.8, 0.6, 1.1, 0.15), '#3F7F45', { p: [-0.3, 1.1, 0] });
  for (const dx of [-0.9, 0.8]) for (const s of [-1, 1]) b.add(cyl(0.08, 0.08, 1.3, 5), '#FFFDF6', { p: [dx, 1.5, s * 0.5] });
  b.add(rbox(2.4, 0.12, 1.4, 0.05), P.teal, { p: [0, 2.15, 0] });
  for (const dx of [-0.7, 0.7]) for (const s of [-1, 1]) b.add(cyl(0.3, 0.3, 0.2, 10), '#2E2A4F', { p: [dx, 0.3, s * 0.6], r: [Math.PI / 2, 0, 0] });
  b.add(cyl(0.2, 0.2, 0.8, 8), P.terra, { p: [-1.1, 1.0, 0.3], r: [0.2, 0, 0] }); // a golf bag
  return driver(b, 'drive:cart', d.origin[0] + 4, d.origin[0] + d.cols * PLOT_SPACING - 4, d.origin[1] + BACK + 7.5, 1.2);
}
function driver(b: Baker, name: string, x0: number, x1: number, z: number, speed: number) {
  const m = new THREE.Mesh(b.build(), kit().world);
  m.name = name;
  m.position.set(x0, 0, z);
  m.castShadow = true;
  Object.assign(m.userData, { x0, x1, speed });
  return m;
}
/** A soap yacht moored off the Yacht Marina. */
function yacht(d: District) {
  const b = new Baker();
  b.add(lumpy(rbox(5.5, 1.1, 2, 0.5), 0.03, 2, 7), '#FFFDF6', { p: [0, 0.4, 0], fx: GLOSS });
  b.add(cone(1, 1.6, 8), '#FFFDF6', { p: [3.2, 0.4, 0], r: [0, 0, -Math.PI / 2], s: [1, 1, 1], fx: GLOSS });
  b.add(rbox(2.4, 0.9, 1.5, 0.3), '#9ED3D6', { p: [-0.5, 1.4, 0], fx: GLOSS });
  b.add(rbox(2.6, 0.12, 1.7, 0.05), P.teal, { p: [-0.5, 1.9, 0] });
  b.add(box(5.6, 0.12, 2.05), P.teal, { p: [0, 0.75, 0] });
  b.add(cyl(0.05, 0.05, 2.2, 5), P.chrome, { p: [-2.4, 2, 0], fx: GLOSS });
  b.add(cone(0.35, 0.8, 3), P.blush, { p: [-2.1, 2.8, 0], r: [0, 0, -Math.PI / 2], s: [1, 1, 0.15], fx: PAPER });
  const marina = d.special.find((p) => p.name === 'Yacht Marina');
  const m = new THREE.Mesh(b.build(), kit().world);
  m.name = 'bob:yacht';
  m.position.set(SEA_X + 2, -0.1, d.origin[1] + (marina?.side === 1 ? 10 : -10) + 3.6);
  m.rotation.y = Math.PI / 2;
  m.userData.y0 = -0.1;
  m.castShadow = true;
  return m;
}
/** Old Town's band on the bandstand: a tuba, a drum and a trumpet, each a small clay player. */
function band(x: number, y: number, z: number, k: number) {
  const g = new THREE.Group();
  g.name = 'bob:band';
  g.position.set(x, y, z);
  g.scale.setScalar(k);
  const cols = ['#C8325A', '#2E6FB0', '#3F7F45'];
  for (let i = 0; i < 3; i++) {
    const b = new Baker();
    b.add(cap(0.32, 0.6, 3, 8), cols[i], { p: [0, 0.65, 0] });
    b.add(sph(0.28, 10, 7), '#F2C29B', { p: [0, 1.45, 0] });
    b.add(cyl(0.3, 0.32, 0.18, 10), '#FFFFFF', { p: [0, 1.75, 0] });
    if (i === 0) b.add(tor(0.32, 0.1, 6, 14), P.gold, { p: [0, 0.8, 0.3], fx: GLOSS });
    else if (i === 1) b.add(cyl(0.35, 0.35, 0.4, 12), '#FFFDF6', { p: [0, 0.6, 0.35], r: [Math.PI / 2, 0, 0] });
    else b.add(cone(0.12, 0.6, 8, true), P.gold, { p: [0, 1.4, 0.45], r: [Math.PI / 2, 0, 0], fx: GLOSS });
    const m = new THREE.Mesh(b.build(), kit().world);
    const a = (i - 1) * 1.1;
    const holder = new THREE.Group();
    holder.position.set(Math.sin(a) * 1.6, 0, Math.cos(a) * 1.6 - 0.6);
    holder.rotation.y = a;
    m.castShadow = true;
    holder.add(m);
    g.add(holder);
  }
  return g;
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
  const k = LANDMARK_SCALE[name] ?? 1.5;
  if (name === 'The Bandstand') { const g = band(x, 0.8 * k, z, k); g.rotation.y = f > 0 ? 0 : Math.PI; parts.push(g); }
  // Every landmark stands 1.5x tall; the wide ones keep a narrower footprint so they don't crowd their neighbours.
  const m = new THREE.Matrix4().makeScale(k, 1.5, k).setPosition(x, 0, z);
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
    } else if (SEASON === 'summer') {
      // umbrellas are a summer thing (the beach empties out in winter)
      add(C.full, cyl(0.04, 0.04, 2.2, 5), P.cream, { p: [x, 1.0, zb], r: [0, 0, 0.12] });
      for (let s = 0; s < 8; s++) add(C.full, new THREE.ConeGeometry(1.1, 0.5, 3, 1, true, (s / 8) * Math.PI * 2, Math.PI / 4), s % 2 ? [P.terra, P.teal, '#C8325A'][k % 3] : P.cream, { p: [x - 0.13, 2.25, zb], fx: PAPER });
      add(C.props, rbox(1, 0.04, 1.8, 0.02), [P.teal, P.blush, '#C8325A'][(k + 1) % 3], { p: [x + 1.2, 0.07, zb + 0.4], r: [0, 0.3, 0], fx: PAPER });
    }
    if (k % 2 && SEASON !== 'winter') {
      const sx = x + 3.5;
      add(C.props, cyl(0.45, 0.55, 0.45, 9), P.sand, { p: [sx, 0.22, zb + 1] });
      for (const [a, b] of [[-0.4, -0.3], [0.4, -0.3], [0, 0.4]]) add(C.props, cyl(0.2, 0.25, 0.6, 7), P.sand, { p: [sx + a, 0.5, zb + 1 + b] });
    }
    add(C.props, lumpy(sph(0.4, 8, 6), 0.06, 4, k), '#B9A99A', { p: [x - 3, -0.05, SEA_Z + 0.2], s: [1.3, 0.6, 1] });
  }
}

/**
 * Trees follow the season and the storm. The bay's own trees (baked by bay.ts into its prop chunks)
 * turn coral and butterscotch in fall, pick up blossom pink in spring and drop their canopies in winter;
 * in a storm every canopy, the town's too, leans with the wind. Canopy balls are found as runs of
 * leaf-coloured vertices (one baked part each), and each ball is judged by its centre, never vertex by vertex.
 */
const CANOPY = [P.green, P.leaf, P.leaf2, P.leaf3, P.lemon].map((c) => new THREE.Color(c));
const LEAN = 0.2; // sideways shift per unit of height in a storm
type TreeData = { col0: Float32Array; pos0: Float32Array; runs: [number, number, number][] };
function bayTreeRuns(col: Float32Array, pos: Float32Array): [number, number, number][] {
  const runs: [number, number, number][] = [];
  const n = col.length / 4;
  const kindOf = (i: number) => CANOPY.findIndex((c) => Math.abs(c.r - col[i * 4]) + Math.abs(c.g - col[i * 4 + 1]) + Math.abs(c.b - col[i * 4 + 2]) < 0.01);
  for (let i = 0; i < n;) {
    const k = kindOf(i);
    let j = i + 1;
    while (j < n && kindOf(j) === k) j++;
    if (k >= 0) {
      let sy = 0;
      for (let v = i; v < j; v++) sy += pos[v * 3 + 1];
      if (sy / (j - i) > 1.6) runs.push([i, j, k]); // above hedge height: a canopy ball (or its lemons)
    }
    i = j;
  }
  return runs;
}
function treeWeather(scene: THREE.Scene, season: Season, storm: boolean) {
  const fall = FALL.map((c) => new THREE.Color(c)), pink = new THREE.Color('#F7A8C4');
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    const bay = m.name.startsWith('props:'), town = m.name.startsWith('town-full:') && !!m.userData.canopy;
    if (!m.isMesh || (!bay && !town)) return;
    const g = m.geometry, col = g.attributes.color as THREE.BufferAttribute, pos = g.attributes.position as THREE.BufferAttribute;
    if (!col || col.itemSize !== 4) return;
    let u = m.userData.trees as TreeData | undefined;
    if (!u) {
      if (!storm && (town || season === 'summer')) return; // nothing to undo yet
      const col0 = (col.array as Float32Array).slice(), pos0 = (pos.array as Float32Array).slice();
      u = { col0, pos0, runs: bay ? bayTreeRuns(col0, pos0) : (m.userData.canopy as [number, number][]).map(([a, b]) => [a, b, -1] as [number, number, number]) };
      m.userData.trees = u;
    }
    const ca = col.array as Float32Array, pa = pos.array as Float32Array;
    ca.set(u.col0); pa.set(u.pos0);
    for (const [a, b, k] of u.runs) for (let i = a; i < b; i++) {
      if (bay && season === 'winter') { pa[i * 3 + 1] = -3; continue; } // the whole ball goes, so nothing stretches
      if (bay && season === 'fall' && k >= 0 && k < 4) { const c = fall[k]; ca[i * 4] = c.r; ca[i * 4 + 1] = c.g; ca[i * 4 + 2] = c.b; }
      else if (bay && season === 'spring' && k === 2) { ca[i * 4] = pink.r; ca[i * 4 + 1] = pink.g; ca[i * 4 + 2] = pink.b; }
      if (storm) pa[i * 3] += LEAN * Math.max(0, pa[i * 3 + 1] - 0.8);
    }
    col.needsUpdate = true;
    pos.needsUpdate = true;
    g.computeBoundingSphere();
  });
}
