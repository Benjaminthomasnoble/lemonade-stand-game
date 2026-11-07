// Clay models for the town's own buildings: civic buildings, the five rival
// HQs, fields, piers, FOR SALE signs and the player's VIP facilities.
// Local frame (same as stands): the street is toward +z, the plot spans
// x -5.5..5.5 and z -7.5..2.5, ground at y 0. Every model bakes to one clay
// draw plus, where it has windows, one window draw (they glow at night).
// Parts that move (clock hands, windmill sails, windsocks) are kept as
// separate meshes named 'spin:*' or 'sway:*' so town.ts can animate them.
import * as THREE from 'three';
import { Baker, sph, cap, cyl, box, rbox as coreRbox, cone, tor, lathe, snake, lumpy, hash, GLOSS, PAPER } from './clay/core.ts';
import { kit } from './clay/kit.ts';
import { P, OWNER } from './clay/palette.ts';
import type { RivalId } from '../sim/economy.ts';
import { reducedMotion } from './clay/fx.ts';
import { cardFlap } from './clay/standKit.ts';

type Col = string | number;
/** Rounded clay blocks at one bevel segment; thin parts are plain boxes (cheap: 12 vs 108 triangles). */
const rbox = (w: number, h: number, d: number, r?: number, _seg?: number) => (Math.min(w, h, d) < 0.2 ? new THREE.BoxGeometry(w, h, d) : coreRbox(w, h, d, r, 1));
type Opt = { p?: [number, number, number]; r?: [number, number, number]; s?: number | [number, number, number]; fx?: number };

/** A model under construction: a clay baker, a window baker and loose moving parts. */
class Model {
  B = new Baker();
  W = new Baker();
  extras: THREE.Object3D[] = [];
  /** Colour of the one-block Bay View version (userData.far). */
  farColor: Col = '#FFF1D6';
  /** Bay View draws a low inset slab instead of a block, so the owner's tile and pattern show round it (fields, groves, piers). */
  farFlat = false;
  /** An optional roof cap in this colour on the Bay View block (the owner's colour on a facility). */
  farTop: Col | null = null;
  add(geo: THREE.BufferGeometry, color: Col, o: Opt = {}) { this.B.add(geo, color, o); return this; }
  win(geo: THREE.BufferGeometry, o: Opt = {}) { this.W.add(geo, '#ffffff', o); return this; }
  /** A part that moves: baked on its own, pivoting at `at`. */
  part(name: string, at: [number, number, number], build: (b: Baker) => void) {
    const b = new Baker();
    build(b);
    const m = new THREE.Mesh(b.build(), kit().world);
    m.position.set(...at);
    m.name = name;
    m.userData.disposable = true;
    m.castShadow = true;
    this.extras.push(m);
    return m;
  }
  done(name: string) {
    const g = new THREE.Group();
    g.name = name;
    const body = new THREE.Mesh(this.B.build(), kit().world);
    body.castShadow = body.receiveShadow = true;
    body.userData.disposable = true;
    g.add(body);
    if (this.W.list.length) {
      const w = new THREE.Mesh(this.W.build(), kit().window);
      w.receiveShadow = true;
      w.userData.noBake = true; // keeps the window glass material (it glows at night)
      w.userData.disposable = true;
      g.add(w);
    }
    for (const e of this.extras) g.add(e);
    // Bay View draws this model as one rounded block of its footprint, with lit window patches on the front.
    const bb = body.geometry.boundingBox!;
    const size = bb.getSize(new THREE.Vector3()), mid = bb.getCenter(new THREE.Vector3());
    const F = new Baker();
    if (this.farFlat) {
      const w = Math.max(0.3, size.x * 0.62), d = Math.max(0.3, size.z * 0.62);
      F.add(coreRbox(w, 0.45, d, 0.18, 1), this.farColor, { p: [mid.x, 0.22, mid.z] });
      if (size.y > 1.5) for (let k = 0; k < 4; k++) F.add(sph(Math.min(w, d) * 0.16, 6, 4), this.farColor, { p: [mid.x + ((k % 2) - 0.5) * w * 0.5, 0.5, mid.z + (Math.floor(k / 2) - 0.5) * d * 0.5], s: [1, 0.8, 1] });
      g.userData.far = F.build();
      g.userData.ownFar = true;
      return g;
    }
    if (this.farTop) F.add(coreRbox(size.x * 0.94, 0.4, size.z * 0.94, 0.15, 1), this.farTop, { p: [mid.x, size.y * 0.92 + 0.1, mid.z] });
    F.add(coreRbox(Math.max(0.3, size.x * 0.92), Math.max(0.2, size.y * 0.92), Math.max(0.3, size.z * 0.92), Math.min(0.5, size.y * 0.3), 1), this.farColor, { p: [mid.x, mid.y * 0.92, mid.z] });
    if (this.W.list.length || name === 'civic' || name === 'hq') for (let k = 0; k < 3 && size.y > 2; k++)
      F.add(new THREE.BoxGeometry(size.x * 0.18, Math.min(1.2, size.y * 0.15), 0.1), '#FFE2A8', { p: [mid.x + (k - 1) * size.x * 0.28, size.y * 0.5, mid.z + size.z * 0.46 + 0.05], fx: 1 });
    g.userData.far = F.build();
    g.userData.ownFar = true;
    return g;
  }
}


/** A rounded clay block, a little lumpy. */
function block(M: Model, w: number, h: number, d: number, color: Col, x: number, y: number, z: number, seed = 1, r = 0.35) {
  M.add(lumpy(rbox(w, h, d, Math.min(r, w / 3, h / 3, d / 3)), Math.min(0.06, h * 0.02), 0.6, seed), color, { p: [x, y + h / 2, z] });
}
/** A gable roof prism with overhang along x. */
function gable(M: Model, w: number, d: number, rise: number, color: Col, x: number, y: number, z: number) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0.12, rise); s.lineTo(-0.12, rise); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: true, bevelThickness: 0.15, bevelSize: 0.15, bevelSegments: 2, curveSegments: 2 });
  g.translate(0, 0, -d / 2);
  M.add(g, color, { p: [x, y, z] });
}
/** Scalloped cardstock trim: alternating half-discs along x. */
function scallops(M: Model, x0: number, x1: number, y: number, z: number, a: Col, b: Col, r = 0.22, tilt = 0) {
  let k = 0;
  for (let x = x0 + r; x <= x1 - r * 0.5; x += r * 2, k++)
    M.add(new THREE.CylinderGeometry(r, r, 0.03, 10, 1, false, Math.PI / 2, Math.PI), k % 2 ? a : b, { p: [x, y, z], r: [Math.PI / 2 - tilt, 0, 0], fx: PAPER });
}
/** A striped card awning over a front at z. */
function awning(M: Model, w: number, x: number, y: number, z: number, a: Col, b: Col, depth = 1) {
  const n = Math.max(2, Math.round(w / 0.5));
  for (let i = 0; i < n; i++) M.add(box(w / n, 0.04, depth), i % 2 ? a : b, { p: [x - w / 2 + (i + 0.5) * (w / n), y, z + depth / 2], r: [0.45, 0, 0], fx: PAPER });
  scallops(M, x - w / 2, x + w / 2, y - Math.sin(0.45) * depth / 2 - 0.02, z + Math.cos(0.45) * depth, a, b, w / n / 2, 0.45);
}
/** A framed window on the front face at z (glass glows at night). */
function window_(M: Model, x: number, y: number, z: number, w = 1, h = 1, frame: Col = P.cream) {
  M.win(rbox(w, h, 0.1, 0.06), { p: [x, y, z] });
  M.add(box(w + 0.16, 0.1, 0.12), frame, { p: [x, y - h / 2 - 0.02, z + 0.04] });
  M.add(box(w + 0.16, 0.1, 0.12), frame, { p: [x, y + h / 2 + 0.02, z + 0.04] });
  M.add(box(0.07, h, 0.08), frame, { p: [x, y, z + 0.06] });
}
function door(M: Model, x: number, z: number, color: Col, w = 1, h = 1.8) {
  M.add(rbox(w, h, 0.2, 0.1), color, { p: [x, h / 2, z] });
  M.add(sph(0.07, 8, 6), P.gold, { p: [x + w * 0.3, h * 0.5, z + 0.12], fx: GLOSS });
  M.add(rbox(w + 0.5, 0.14, 0.6, 0.05), '#d9c3a0', { p: [x, 0.07, z + 0.3] });
}
function stick(M: Model, x: number, y0: number, y1: number, z: number, w = 0.12, col: Col = P.stick) {
  M.add(rbox(w, y1 - y0, w * 0.6, w * 0.25), col, { p: [x, (y0 + y1) / 2, z], fx: PAPER });
}
function ball(M: Model, r: number, color: Col, x: number, y: number, z: number, seed = 0, seg = 10) {
  M.add(lumpy(sph(r, seg, Math.max(6, seg - 3)), r * 0.08, 1.4 / Math.max(0.3, r), seed), color, { p: [x, y, z] });
}
/** A lumpy clay-ball tree; `fruit` dots it with lemons. */
export function clayTree(M: { add: Model['add'] } | Model, x: number, z: number, seed: number, greens: Col[] = [P.green, '#5FA35A', '#8FD08A'], fruit = false, scale = 1) {
  const m = M as Model;
  const h = (1.5 + hash(seed, 3) * 0.7) * scale;
  m.add(cyl(0.14 * scale, 0.24 * scale, h, 7), P.walnut, { p: [x, h / 2, z] });
  const n = 2 + (seed % 2);
  for (let k = 0; k <= n; k++) {
    const a = (k / n) * Math.PI * 2 + seed, rr = k === 0 ? 0 : 0.6 * scale;
    const r = ((k === 0 ? 1.2 : 0.85) + hash(seed, k) * 0.25) * scale;
    ball(m, r, greens[(seed + k) % greens.length], x + Math.cos(a) * rr, h + 0.8 * scale + (k === 0 ? 0.35 : hash(k, seed) * 0.4) * scale, z + Math.sin(a) * rr, seed * 5 + k, 10);
  }
  if (fruit) for (let k = 0; k < 6; k++) {
    const a = k * 1.7 + seed;
    m.add(sph(0.15 * scale, 7, 5), P.lemon, { p: [x + Math.cos(a) * 1.05 * scale, h + (0.55 + (k % 3) * 0.4) * scale, z + Math.sin(a) * 1.05 * scale], s: [1.3, 1, 1], fx: GLOSS * 0 });
  }
}

// ---------------------------------------------------------------- labels
const labelCache = new Map<string, THREE.CanvasTexture>();
const labelMats = new Map<string, THREE.MeshStandardMaterial>();
/** A masking-tape strip with handwritten letters (bakeGroup keeps labels as their own fading mesh). */
export function tapeLabel(text: string, width: number, ink: string = P.plum, tape = '#F3E6C4'): THREE.Mesh {
  const k = `${text}|${ink}|${tape}`;
  let t = labelCache.get(k);
  if (!t) {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 112;
    const g = c.getContext('2d')!;
    g.fillStyle = tape;
    g.beginPath();
    // torn ends
    g.moveTo(8, 10);
    for (let x = 8; x <= 504; x += 24) g.lineTo(x, 8 + (x % 48 ? 3 : 0));
    for (let y = 8; y <= 104; y += 12) g.lineTo(504 + (y % 24 ? 6 : -2), y);
    for (let x = 504; x >= 8; x -= 24) g.lineTo(x, 104 - (x % 48 ? 3 : 0));
    for (let y = 104; y >= 8; y -= 12) g.lineTo(8 + (y % 24 ? -6 : 2), y);
    g.fill();
    g.fillStyle = ink;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    let size = 70;
    const font = (s: number) => `${s}px "Gochi Hand", "Chewy", "Comic Sans MS", cursive`;
    g.font = font(size);
    while (g.measureText(text).width > 470 && size > 22) g.font = font((size -= 4));
    g.fillText(text, 256, 60);
    t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    labelCache.set(k, t);
  }
  let mat = labelMats.get(k);
  if (!mat) { mat = new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.95 }); labelMats.set(k, mat); }
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, width * 112 / 512), mat);
  mesh.name = 'label';
  mesh.userData.disposable = true; // its plane is made per label; the texture and material are shared
  return mesh;
}
/** A tape label that fades out beyond `far` (it sits in its own LOD, so bakeGroup leaves it be). */
function label(g: THREE.Group, text: string, width: number, x: number, y: number, z: number, rz = 0, ink?: string, tape?: string, far = 150) {
  const m = tapeLabel(text, width, ink, tape);
  const lod = new THREE.LOD();
  lod.position.set(x, y, z);
  lod.rotation.z = rz;
  lod.addLevel(m, 0);
  lod.addLevel(new THREE.Object3D(), far);
  g.add(lod);
}

// ---------------------------------------------------------------- civic
export function civicBuilding(name: string): THREE.Group {
  const M = new Model();
  const fz = -0.5; // front face
  if (name === 'Town Hall and Registry') {
    // cream hall, tool-pressed columns, terracotta roof, a clock tower
    block(M, 9, 5, 6.5, P.cream, 0, 0, fz - 3.25, 3);
    gable(M, 9.8, 7.2, 1.8, P.terra, 0, 5, fz - 3.25);
    for (const x of [-3, -1.5, 1.5, 3]) { M.add(lumpy(cyl(0.3, 0.34, 4.4, 10), 0.02, 3, x), '#FFFDF6', { p: [x, 2.2, fz + 0.5] }); }
    M.add(rbox(8, 0.35, 1.4, 0.1), '#F3E6C4', { p: [0, 4.55, fz + 0.4] });
    for (let i = 0; i < 3; i++) M.add(rbox(4 - i * 0.4, 0.2, 0.5, 0.05), '#E6D6B8', { p: [0, 0.1 + i * 0.2, fz + 1.6 - i * 0.45] });
    door(M, 0, fz + 0.05, P.walnut, 1.4, 2.4);
    for (const x of [-3.6, -2.2, 2.2, 3.6]) window_(M, x, 3, fz + 0.02, 0.8, 1.2);
    // clock tower
    block(M, 2.4, 4, 2.4, P.cream, 0, 5.6, fz - 3.2, 5, 0.25);
    M.add(cone(1.9, 2.4, 4), P.terra, { p: [0, 10.8, fz - 3.2], r: [0, Math.PI / 4, 0] });
    M.add(cyl(0.95, 0.95, 0.12, 24), '#FFFDF6', { p: [0, 8.1, fz - 1.95], r: [Math.PI / 2, 0, 0], fx: GLOSS });
    M.add(tor(0.95, 0.08, 6, 24), P.plum, { p: [0, 8.1, fz - 1.9] });
    for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; M.add(sph(0.06, 6, 4), P.plum, { p: [Math.cos(a) * 0.75, 8.1 + Math.sin(a) * 0.75, fz - 1.86] }); }
    M.part('spin:clock-hour', [0, 8.1, fz - 1.82], (b) => b.add(cap(0.05, 0.45, 2, 5), P.plum, { p: [0, 0.25, 0] }));
    M.part('spin:clock-min', [0, 8.1, fz - 1.8], (b) => b.add(cap(0.04, 0.65, 2, 5), '#C8325A', { p: [0, 0.35, 0] }));
    const g = M.done('civic');
    label(g, 'TOWN HALL', 3.6, 0, 4.55, fz + 1.12, -0.02);
    return g;
  }
  if (name === 'Citrine Bay Market') {
    // a soft brick hall with striped stalls of clay fruit out front
    block(M, 9, 3.8, 6, '#E9A07E', 0, 0, fz - 3.5, 7);
    for (let r = 0; r < 6; r++) for (let c = 0; c < 9; c++) M.add(box(0.9, 0.05, 0.04), '#C97C5E', { p: [-4 + c * 1 + (r % 2) * 0.5, 0.5 + r * 0.6, fz - 0.47] });
    gable(M, 9.6, 6.6, 1.2, P.walnut, 0, 3.8, fz - 3.5);
    door(M, 0, fz - 0.45, P.teal, 1.6, 2.2);
    window_(M, -2.8, 2.2, fz - 0.45, 1.6, 1);
    window_(M, 2.8, 2.2, fz - 0.45, 1.6, 1);
    const fruit = [P.lemon, P.terra, P.green, P.blush, '#FF9F1C'];
    for (let i = 0; i < 3; i++) {
      const x = -3.2 + i * 3.2;
      M.add(rbox(2.2, 0.9, 1, 0.1), P.stick, { p: [x, 0.45, fz + 1.4], fx: PAPER });
      for (const sx of [-1, 1]) stick(M, x + sx * 1, 0, 2.2, fz + 1.8, 0.1);
      awning(M, 2.4, x, 2.3, fz + 1.0, i % 2 ? P.green : P.terra, P.cream, 0.9);
      for (let k = 0; k < 7; k++) ball(M, 0.16, fruit[(k + i) % 5], x - 0.8 + (k % 4) * 0.5, 1.0, fz + 1.2 + Math.floor(k / 4) * 0.35, k + i * 9, 7);
    }
    const g = M.done('civic');
    label(g, 'MARKET', 3, 0, 3.2, fz - 0.42, 0.03);
    return g;
  }
  if (name === 'The Hiring Hall') {
    // a walnut clapboard hall with a corkboard of job notes
    block(M, 8, 4.4, 6, '#C9B79C', 0, 0, fz - 3.5, 11);
    for (let y = 0.4; y < 4.2; y += 0.45) M.add(box(8.05, 0.06, 0.05), '#A99576', { p: [0, y, fz - 0.48] });
    gable(M, 8.8, 6.6, 1.6, '#5B6470', 0, 4.4, fz - 3.5);
    door(M, -1.8, fz - 0.45, P.terra, 1.3, 2.2);
    window_(M, 2.2, 2.6, fz - 0.45, 1.4, 1.1);
    M.add(rbox(2.4, 1.5, 0.12, 0.05), '#B5651D', { p: [1, 1.2, fz + 0.2], r: [-0.1, 0, 0], fx: PAPER });
    for (let k = 0; k < 6; k++) M.add(box(0.45, 0.5, 0.02), ['#FFFDF6', P.lemon, P.blush][k % 3], { p: [0.2 + (k % 3) * 0.7, 1.0 + Math.floor(k / 3) * 0.6, fz + 0.29], r: [-0.1, 0, (hash(k) - 0.5) * 0.4], fx: PAPER });
    for (const x of [0, 2]) stick(M, x - 0.2, 0, 1.2, fz + 0.3, 0.1);
    const g = M.done('civic');
    label(g, 'HIRING HALL', 3.6, 0, 4.05, fz - 0.42, -0.03);
    return g;
  }
  if (name === "Dot's Diner") {
    // a rounded-end diner car with a chrome stripe and a coffee cup on the roof
    M.add(lumpy(cap(2.1, 5.2, 4, 16), 0.04, 0.8, 3), '#F2795B', { p: [0, 2.15, fz - 3], r: [0, 0, Math.PI / 2], s: [1, 1, 1.2] });
    M.add(rbox(9.6, 0.25, 0.18, 0.08), P.chrome, { p: [0, 1.4, fz - 0.45], fx: GLOSS });
    M.add(rbox(9.6, 0.25, 0.18, 0.08), P.chrome, { p: [0, 3.3, fz - 0.45], fx: GLOSS });
    for (let i = 0; i < 6; i++) window_(M, -3.6 + i * 1.45, 2.35, fz - 0.42, 1.1, 1, '#FFFDF6');
    door(M, 3.9, fz - 0.35, P.teal, 1, 2);
    M.add(lathe([[0, 0], [0.7, 0], [0.9, 1.3], [0.95, 1.4], [0, 1.4]], 18), '#FFFDF6', { p: [-2.6, 4.2, fz - 3] });
    M.add(tor(0.35, 0.1, 6, 14), '#FFFDF6', { p: [-1.75, 4.9, fz - 3], r: [0, 0, 0] });
    M.add(cyl(0.88, 0.88, 0.05, 18), '#3B2A20', { p: [-2.6, 5.55, fz - 3], fx: GLOSS });
    const g = M.done('civic');
    label(g, "DOT'S DINER", 3.4, 0.6, 3.85, fz - 0.3, 0.02, '#C8325A');
    return g;
  }
  block(M, 8, 4, 6, P.cream, 0, 0, fz - 3.5);
  gable(M, 8.6, 6.6, 1.4, P.terra, 0, 4, fz - 3.5);
  door(M, 0, fz - 0.45, P.walnut);
  const g = M.done('civic');
  label(g, name.toUpperCase(), 3.6, 0, 3, fz - 0.42);
  return g;
}

// ---------------------------------------------------------------- HQs
/** Rival HQs; a captured HQ is smoothed over in lemon clay and an empty one fades to grey. */
export function hqBuilding(owner: RivalId | 'player' | null, name: string): THREE.Group {
  const M = new Model();
  M.farColor = owner === 'player' ? '#F6D33C' : owner ? TILE_PATTERN[owner].main : '#B9B4C4';
  const fz = -0.5;
  const own = owner === 'player' ? { main: '#F6D33C', accent: '#FFFFFF' } : owner ? ownerCols(owner) : { main: '#A9A3B5', accent: '#D8D3DE' };
  // A captured HQ wears the player's lemon clay over its own shape.
  const tint = (c: Col) => (owner === 'player' ? '#F6D33C' : owner ? c : '#B9B4C4');
  if (name === 'FizzCo Tower') {
    // printed-card glass tower in cola red bands, chrome bubble buttons, a soda bottle crown
    const H = 22;
    block(M, 7, H, 6, tint('#9FB4C8'), 0, 0, fz - 3.5, 2, 0.4);
    for (let y = 1.8; y < H - 0.5; y += 1.8) {
      M.add(rbox(7.15, 0.32, 6.15, 0.1), own.main, { p: [0, y, fz - 3.5] });
      for (let x = -2.6; x <= 2.7; x += 1.3) M.win(rbox(1, 1.1, 0.06, 0.04), { p: [x, y + 0.9, fz - 0.43] });
    }
    for (let k = 0; k < 10; k++) M.add(sph(0.22, 8, 6), own.accent, { p: [-2.8 + (k % 5) * 1.4, 0.6 + Math.floor(k / 5) * 0.55, fz - 0.42], s: [1, 1, 0.5], fx: GLOSS });
    door(M, 0, fz - 0.4, '#5B6470', 1.8, 1.9);
    // the soda-bottle crown (kept cola red under lemon clay as the Trophy when you capture it)
    M.add(lathe([[0, 0], [0.9, 0], [0.95, 1.6], [0.5, 2.6], [0.35, 3.4], [0.38, 3.6], [0, 3.6]], 16), owner ? '#C8102E' : '#B9B4C4', { p: [0, H, fz - 3.5], fx: GLOSS });
    M.add(cyl(0.4, 0.4, 0.2, 12), own.accent, { p: [0, H + 3.7, fz - 3.5], fx: GLOSS });
    medallion(M, owner, 0, 4.6, fz - 0.2, 1.5, 4.6);
    const g = M.done('hq');
    label(g, 'FIZZCO', 3, 0, 1.9, fz - 0.4, 0, '#FFFFFF', '#C8102E');
    return g;
  }
  if (name === 'Sourwood Manor') {
    // a cream mansion with a plum dome studded in gold diamonds, columns and topiaries
    block(M, 10, 5.2, 6, tint('#F6EEDF'), 0, 0, fz - 3.5, 4);
    M.add(rbox(10.6, 0.4, 7, 0.12), own.main, { p: [0, 5.3, fz - 3.5] });
    // the plum dome (kept plum as the Trophy when you capture it)
    M.add(sph(2.6, 18, 10, ), owner ? '#5B2A6E' : '#B9B4C4', { p: [0, 5.5, fz - 3.5], s: [1, 0.85, 1] });
    for (let k = 0; k < 14; k++) { const a = (k / 14) * Math.PI * 2; M.add(new THREE.OctahedronGeometry(0.18, 0), own.accent, { p: [Math.cos(a) * 2.2, 6.6 + (k % 2) * 0.5, fz - 3.5 + Math.sin(a) * 2.2], s: [1, 1.3, 0.6], fx: GLOSS }); }
    M.add(cyl(0.12, 0.12, 1.2, 6), own.accent, { p: [0, 8.2, fz - 3.5], fx: GLOSS });
    M.add(sph(0.3, 10, 8), own.accent, { p: [0, 8.9, fz - 3.5], fx: GLOSS });
    for (const x of [-3.6, -1.3, 1.3, 3.6]) M.add(lumpy(cyl(0.3, 0.34, 4.8, 10), 0.02, 3, x), '#FFFDF6', { p: [x, 2.4, fz + 0.4] });
    door(M, 0, fz - 0.4, own.main, 1.4, 2.6);
    for (const x of [-4.4, -2.5, 2.5, 4.4]) { window_(M, x, 1.8, fz - 0.42, 0.8, 1.2); window_(M, x, 3.9, fz - 0.42, 0.8, 1); }
    for (const x of [-4.8, 4.8]) { M.add(cyl(0.12, 0.15, 0.7, 6), P.walnut, { p: [x, 0.35, fz + 1.8] }); ball(M, 0.7, '#3F7F45', x, 1.2, fz + 1.8, x > 0 ? 3 : 4, 10); ball(M, 0.45, '#3F7F45', x, 2.1, fz + 1.8, 5, 8); }
    medallion(M, owner, 0, 6.9, fz - 0.6, 1.2, 5.4);
    const g = M.done('hq');
    label(g, 'SOURWOOD MANOR', 4, 0, 4.9, fz - 0.4, 0, '#C9A227', '#5B2A6E');
    return g;
  }
  if (name === 'Hollis Homestead') {
    // a red barn with a gingham hayloft, tea-amber roof, a sun-tea jar and hay bales
    block(M, 9, 4.6, 6.5, tint('#C2453A'), 0, 0, fz - 3.5, 6);
    // the gambrel: a red gable end pressed as one piece, under one curved slab of tea-amber roof
    const roof = tint('#B5651D');
    const gam = (o: number): [number, number][] => [[-4.5 - o, 0], [-3.7 - o * 0.8, 1.9 + o * 0.6], [0, 3.1 + o], [3.7 + o * 0.8, 1.9 + o * 0.6], [4.5 + o, 0]];
    const wall = new THREE.Shape(gam(0).map(([a, b]) => new THREE.Vector2(a, b)));
    const wg = new THREE.ExtrudeGeometry(wall, { depth: 6.3, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.12, bevelSegments: 2, curveSegments: 1 });
    wg.translate(0, 0, -6.3 / 2);
    M.add(wg, tint('#C2453A'), { p: [0, 4.55, fz - 3.5] });
    const outer = gam(0.4), inner = gam(0.02).reverse();
    const shell = new THREE.Shape([...outer, ...inner].map(([a, b]) => new THREE.Vector2(a, b)));
    const rg = new THREE.ExtrudeGeometry(shell, { depth: 7.2, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.1, bevelSegments: 2, curveSegments: 1 });
    rg.translate(0, 0, -7.2 / 2);
    M.add(lumpy(rg, 0.03, 1.2, 6), roof, { p: [0, 4.55, fz - 3.5] });
    // gingham hayloft door
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) M.add(box(0.5, 0.5, 0.05), (r + c) % 2 ? own.accent : '#FFFDF6', { p: [-0.5 + c * 0.5, 5.0 + r * 0.5, fz - 0.06], fx: PAPER });
    // barn doors with the white X
    for (const s of [-1, 1]) {
      M.add(rbox(1.4, 2.8, 0.15, 0.05), tint('#A33A30'), { p: [s * 0.75, 1.4, fz - 0.2] });
      M.add(box(0.12, 3.0, 0.05), '#FFFDF6', { p: [s * 0.75, 1.4, fz - 0.1], r: [0, 0, s * 0.45] });
      M.add(box(0.12, 3.0, 0.05), '#FFFDF6', { p: [s * 0.75, 1.4, fz - 0.1], r: [0, 0, -s * 0.45] });
    }
    for (const x of [-3.3, 3.3]) window_(M, x, 2.6, fz - 0.22, 1, 1, '#FFFDF6');
    // sun-tea jar
    M.add(lathe([[0, 0], [0.7, 0], [0.75, 1.6], [0.45, 1.85], [0, 1.85]], 16), '#E8B060', { p: [3.8, 0, fz + 1.4], fx: GLOSS });
    M.add(cyl(0.48, 0.48, 0.2, 14), own.accent, { p: [3.8, 1.95, fz + 1.4] });
    for (let k = 0; k < 3; k++) M.add(lumpy(rbox(1.3, 0.8, 0.8, 0.2), 0.04, 2, k), '#E8C36A', { p: [-3.8 + (k % 2) * 1.2, 0.4 + Math.floor(k / 2) * 0.8, fz + 1.5] });
    medallion(M, owner, 0, 8.9, fz + 0.4, 1.1, 7.6);
    const g = M.done('hq');
    label(g, 'HOLLIS', 2.4, 0, 3.75, fz - 0.1, -0.03, '#FFFFFF', '#D64545');
    return g;
  }
  if (name === 'The Grindhouse') {
    // an espresso warehouse with a sawtooth roof, a neon-pink zigzag snake and a giant cup
    block(M, 9, 5, 6, tint('#3B2A20'), 0, 0, fz - 3.5, 8);
    for (let i = 0; i < 4; i++) {
      const x = -3.4 + i * 2.25;
      M.add(rbox(2.3, 0.25, 6.8, 0.08), tint('#5A4334'), { p: [x, 5.7, fz - 3.5], r: [0, 0, -0.55] });
      M.win(rbox(0.06, 1.2, 6.2, 0.03), { p: [x + 0.95, 5.6, fz - 3.5] });
    }
    // zigzag neon snake (glows at night)
    const zz: [number, number, number][] = [];
    for (let k = 0; k <= 12; k++) zz.push([-4 + k * (8 / 12), 4.2 + (k % 2 ? 0.35 : -0.35), fz - 0.38]);
    M.add(snake(zz, 0.09, 48, 6), '#FF4FA3', { fx: 0.9 });
    door(M, -2.5, fz - 0.4, own.accent === '#FFFFFF' ? '#E8DCC4' : '#E8DCC4', 1.6, 2.6);
    window_(M, 1.2, 2.2, fz - 0.42, 1.6, 1.4, '#E8DCC4');
    window_(M, 3.3, 2.2, fz - 0.42, 1.6, 1.4, '#E8DCC4');
    // quarter-pipe and a giant iced coffee cup
    M.add(new THREE.CylinderGeometry(1.4, 1.4, 2.6, 12, 1, true, Math.PI, Math.PI / 2), '#8B6B52', { p: [3.6, 1.4, fz + 1.5], r: [0, 0, Math.PI / 2], fx: PAPER });
    M.add(lathe([[0, 0], [0.55, 0], [0.75, 1.9], [0, 1.9]], 14), '#E8DCC4', { p: [-4, 5, fz - 4.5], fx: GLOSS });
    M.add(cyl(0.05, 0.05, 1.2, 6), '#FF4FA3', { p: [-3.8, 7.3, fz - 4.5], r: [0, 0, -0.3] });
    medallion(M, owner, 0.6, 7.2, fz - 0.6, 1.2, 5.0);
    const g = M.done('hq');
    label(g, 'GRINDHOUSE', 3.4, 1.8, 3.4, fz - 0.38, 0.04, '#FF4FA3', '#E8DCC4');
    return g;
  }
  // The Blend Shack on the pier: a mango shack on popsicle-stick stilts, a teal wave snake, a surfboard
  for (let k = 0; k < 14; k++) M.add(rbox(10, 0.12, 0.6, 0.04), P.stick, { p: [0, 0.6, fz - 7 + k * 0.62], r: [0, (hash(k) - 0.5) * 0.03, 0], fx: PAPER });
  for (const x of [-4.6, 4.6]) for (const z of [-7, -3.5, 0.5]) M.add(cyl(0.16, 0.16, 1.6, 7), P.walnut, { p: [x, -0.2, fz + z], fx: PAPER });
  block(M, 7, 3.6, 5, tint('#FF9F1C'), 0, 0.65, fz - 4, 9);
  // a peaked hut roof with a shaggy straw fringe
  M.add(lumpy(new THREE.ConeGeometry(1, 1, 4, 2).rotateY(Math.PI / 4).translate(0, 0.5, 0), 0.03, 2, 9), own.accent, { p: [0, 4.2, fz - 4], s: [8.6 / Math.SQRT2, 2.6, 6.6 / Math.SQRT2] });
  for (let k = 0; k < 18; k++) { const t = k / 18, x = -4.2 + t * 8.4; M.add(cone(0.28, 0.6, 4), '#E8C36A', { p: [x, 4.0, fz - 0.75], r: [Math.PI, 0, 0], fx: PAPER }); }
  const wave: [number, number, number][] = [];
  for (let k = 0; k <= 16; k++) wave.push([-3.4 + k * (6.8 / 16), 3.4 + Math.sin(k * 0.9) * 0.18, fz - 1.45]);
  M.add(snake(wave, 0.1, 40, 6), owner ? '#00A6A6' : '#C8C8D0');
  window_(M, -2, 2.3, fz - 1.48, 2, 1.1, '#FFFDF6');
  door(M, 2, fz - 1.45, '#00A6A6', 1.2, 2.2);
  M.add(lumpy(cap(0.45, 3.2, 3, 10), 0.02, 2, 1), owner ? '#FFFDF6' : '#D8D3DE', { p: [4.3, 2.6, fz - 1.2], r: [0, 0, 0.12], s: [1, 1, 0.25] });
  M.add(box(0.12, 3.6, 0.02), '#00A6A6', { p: [4.3, 2.6, fz - 1.08], r: [0, 0, 0.12] });
  // a giant blender on the deck, big enough to read from above
  M.add(lathe([[0, 0], [0.8, 0], [0.95, 2.0], [0, 2.0]], 12), '#FFE0B0', { p: [-4.2, 1.4, fz - 0.6], fx: GLOSS });
  M.add(rbox(2, 0.8, 2, 0.2), '#00A6A6', { p: [-4.2, 1.05, fz - 0.6] });
  M.add(cyl(0.95, 0.95, 0.2, 12), '#00A6A6', { p: [-4.2, 3.45, fz - 0.6] });
  medallion(M, owner, 1.6, 5.3, fz - 0.6, 1.0, 4.2);
  const g = M.done('hq');
  label(g, 'BLEND SHACK', 3.2, 0, 4.4, fz - 0.95, 0, '#00A6A6', '#FFF1D6');
  return g;
}
function ownerCols(id: RivalId) {
  const o = (OWNER as Record<string, { main: string; accent: string }>)[id];
  return o ? { main: o.main, accent: o.accent } : { main: '#888888', accent: '#DDDDDD' };
}

// ---------------------------------------------------------------- fields and piers
/** A Field plot's crop, chosen by its name. */
export function fieldRows(name = ''): THREE.Group {
  const M = new Model();
  M.farColor = name === 'Hay Meadow' ? '#E8C36A' : '#5FA35A';
  M.farFlat = true;
  // tilled soil bed
  M.add(lumpy(rbox(8.8, 0.25, 8.0, 0.12), 0.03, 1, 3), '#A7744F', { p: [0, 0.08, -2.5] }); // inset: the owner's tile shows round it
  if (name === 'Polo Lawn') {
    for (let i = 0; i < 7; i++) M.add(rbox(1.2, 0.08, 7.8, 0.04), i % 2 ? '#6FB257' : '#8CCB6E', { p: [-3.66 + i * 1.22, 0.24, -2.5] });
    for (const x of [-4.6, 4.6]) { stick(M, x - 0.4, 0, 1.6, -2.5, 0.1, '#FFFDF6'); stick(M, x + 0.4, 0, 1.6, -2.5, 0.1, '#FFFDF6'); M.add(box(0.9, 0.08, 0.08), '#FFFDF6', { p: [x, 1.55, -2.5] }); }
    return M.done('field');
  }
  if (name === 'Tea Rows' || name === 'Creek Field') {
    for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) ball(M, 0.62, ['#4E8F48', '#5FA35A'][(r + c) % 2], -4.2 + c * 1.7, 0.55, -6.4 + r * 2.4, r * 7 + c, 8);
    if (name === 'Creek Field') {
      const pts: [number, number, number][] = [];
      for (let k = 0; k <= 10; k++) pts.push([-5 + k, 0.24, 1.4 + Math.sin(k * 0.8) * 0.4]);
      M.add(snake(pts, 0.3, 30, 6), '#3BB4C1', { fx: GLOSS, s: [1, 0.3, 1] });
    }
    return M.done('field');
  }
  if (name === 'Hay Meadow') {
    for (let i = 0; i < 6; i++) M.add(lumpy(cyl(0.8, 0.8, 1.3, 14), 0.05, 2, i), '#E8C36A', { p: [-3.6 + (i % 3) * 3.4, 0.95, -5 + Math.floor(i / 3) * 3.6], r: [0, 0, Math.PI / 2] });
    return M.done('field');
  }
  // Lemon Orchard, North Field, Windmill Field: lemon trees in rows
  for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) clayTree(M, -3.9 + c * 2.6, -6 + r * 3.6, r * 4 + c + 11, ['#4F9A4A', '#5FA35A'], name !== 'North Field', 0.7);
  if (name === 'Windmill Field') {
    block(M, 1.6, 4.6, 1.6, '#DCE5D2', 4.1, 0, 0.8, 13, 0.25);
    M.add(cone(1.3, 1.4, 8), P.terra, { p: [4.1, 5.3, 0.8] });
    M.part('spin:windmill', [4.1, 4.2, 1.75], (b) => {
      for (let k = 0; k < 4; k++) b.add(rbox(0.45, 2.4, 0.06, 0.04), '#FFFDF6', { p: [Math.cos(k * Math.PI / 2) * 1.3, Math.sin(k * Math.PI / 2) * 1.3, 0], r: [0, 0, k * Math.PI / 2 + Math.PI / 2], fx: PAPER });
      b.add(sph(0.22, 8, 6), P.terra, {});
    });
  }
  return M.done('field');
}

/** An unbuilt Dock plot: a popsicle-stick pier `len` long, out over the water behind the plot. */
export function pierModel(len = 12): THREE.Group {
  const M = new Model();
  M.farColor = P.stick;
  const n = Math.round(len / 0.5);
  for (let k = 0; k < n; k++) M.add(rbox(3.6, 0.1, 0.42, 0.03), P.stick, { p: [0, 0.4, -k * 0.5], r: [0, (hash(k, 3) - 0.5) * 0.05, 0], fx: PAPER });
  for (let z = -1; z > -len; z -= 3.4) for (const s of [-1, 1]) M.add(cyl(0.14, 0.14, 1.8, 7), P.walnut, { p: [s * 1.6, -0.4, z], fx: PAPER });
  M.add(lumpy(sph(0.35, 10, 8), 0.03, 4, 2), P.terra, { p: [2.4, 0.15, -len + 1], s: [1, 1.2, 1] });
  return M.done('pier');
}

/** A FOR SALE card on a popsicle stick (bay.ts draws every sign as one instanced mesh; see forSaleLabel). */
export function forSaleGeometry(): THREE.BufferGeometry {
  const M = new Model();
  stick(M, 0, 0, 1.4, 1.4, 0.12);
  M.add(rbox(1.5, 0.75, 0.06, 0.04), '#FFFDF6', { p: [0, 1.35, 1.46], r: [0, 0, 0.05], fx: PAPER });
  return M.B.build();
}
/** The sign's tape words, shown up close. */
export function forSaleLabel(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'sale';
  label(g, 'FOR SALE', 1.35, 0, 1.36, 1.5, 0.05, '#C8325A', '#FFFDF6', 70);
  return g;
}

// ---------------------------------------------------------------- the player's VIP facilities
/** VIP facilities, in their owner's colours (lemon yellow and Lottie's name only for the player). `reach` sizes a pier to the water. */
export function facilityModel(kind: 'bottling' | 'helipad' | 'pier' | 'grove' | 'billboard', level: number, owner: string | null = 'player', reach = 0): THREE.Group {
  const M = new Model();
  const own = TILE_PATTERN[(owner ?? 'player') as keyof typeof TILE_PATTERN] ?? TILE_PATTERN.player;
  const Y = own.main, ACC = owner === 'player' ? '#FFFFFF' : own.accent;
  if (kind === 'billboard') return billboard(M, owner, own.main, ACC);
  M.farColor = kind === 'grove' ? '#5FA35A' : kind === 'pier' ? P.stick : kind === 'helipad' ? own.main : '#F3E9D6';
  M.farFlat = kind === 'grove' || kind === 'pier';
  if (kind === 'bottling') M.farTop = own.main;
  if (kind === 'grove') {
    // flowering lemon trees on clay mounds, three rows
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
      const x = -4 + c * 2.7, z = -7 + r * 2.8;
      M.add(lumpy(sph(0.9, 10, 6), 0.05, 2, r * 4 + c), '#A7744F', { p: [x, 0, z], s: [1, 0.3, 1] });
      clayTree(M, x, z, 30 + r * 4 + c, ['#4F9A4A', '#5FA35A', '#6BB56F'], true, 0.75);
    }
    stick(M, 4.8, 0, 1.2, 1.6, 0.1);
    M.add(rbox(1.0, 0.6, 0.05, 0.03), Y, { p: [4.8, 1.2, 1.65], fx: PAPER });
    return M.done('facility');
  }
  if (kind === 'bottling') {
    const w = 6 + level, h = 3 + level;
    block(M, w, h, 5.5, '#F3E9D6', 0, 0, -4, 21);
    for (let i = 0; i < Math.ceil(w / 1.1); i++) M.add(rbox(1.0, 0.25, 6, 0.06), i % 2 ? Y : ACC, { p: [-w / 2 + 0.55 + i * 1.1, h + 0.1, -4] });
    M.add(lumpy(cyl(0.45, 0.6, 3 + level, 12), 0.03, 2, 4), P.terra, { p: [w / 2 - 1, h + (3 + level) / 2, -5.5] });
    M.add(tor(0.48, 0.1, 6, 14), '#FFFDF6', { p: [w / 2 - 1, h + 2.6 + level, -5.5], r: [Math.PI / 2, 0, 0] });
    for (let i = 0; i < 3; i++) window_(M, -w / 2 + 1.4 + i * 1.6, h * 0.6, -1.22, 1, 1);
    door(M, w / 2 - 1.5, -1.2, P.teal, 1.6, 2.2);
    // conveyor of glossy bottles
    M.add(rbox(w - 1, 0.5, 0.8, 0.12), '#5F5A74', { p: [0, 0.5, 0.4] });
    for (let i = 0; i < 9; i++) {
      const x = -(w - 2) / 2 + i * ((w - 2) / 8);
      M.add(lathe([[0, 0], [0.13, 0], [0.13, 0.32], [0.06, 0.45], [0.06, 0.52], [0, 0.52]], 10), '#F6E27A', { p: [x, 0.75, 0.4], fx: GLOSS });
      M.add(cyl(0.065, 0.065, 0.06, 8), P.terra, { p: [x, 1.3, 0.4] });
    }
    medallion(M, (owner ?? 'player') as RivalId | 'player', -0.6, h + 1.4, -1.3, 0.9, h);
    const g = M.done('facility');
    if (owner === 'player') label(g, "LOTTIE'S BOTTLING", 4, -0.6, h - 0.7, -1.18, -0.02);
    return g;
  }
  if (kind === 'helipad') {
    // a bottle cap with a lemon-wedge H and a striped windsock
    const r = 3 + level * 0.6, deck = level >= 2 ? 0.9 : 0;
    // the player's bottle cap is raspberry; a rival's is pressed in its own colour
    const capC = owner === 'player' || !owner ? '#C8325A' : own.main;
    M.farColor = capC;
    if (deck) for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; stick(M, Math.cos(a) * (r - 0.6), 0, deck, -2.5 + Math.sin(a) * (r - 0.6), 0.25); }
    M.add(cyl(r, r, 0.35, 28), capC, { p: [0, deck + 0.18, -2.5], fx: GLOSS });
    for (let k = 0; k < 28; k++) { const a = (k / 28) * Math.PI * 2; M.add(rbox(0.5, 0.4, 0.22, 0.08), capC, { p: [Math.cos(a) * r, deck + 0.2, -2.5 + Math.sin(a) * r], r: [0, -a, 0], fx: GLOSS }); }
    M.add(cyl(r - 0.35, r - 0.35, 0.05, 28), '#FFFDF6', { p: [0, deck + 0.38, -2.5], fx: PAPER });
    // the lemon-wedge H
    for (const s of [-1, 1]) M.add(lumpy(rbox(0.5, 0.12, 2.4, 0.1), 0.02, 3, s), Y, { p: [s * 0.8, deck + 0.45, -2.5] });
    M.add(lumpy(rbox(1.2, 0.12, 0.45, 0.1), 0.02, 3, 4), Y, { p: [0, deck + 0.45, -2.5] });
    if (level >= 2) for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; M.add(sph(0.12, 8, 6), '#FFE2A8', { p: [Math.cos(a) * (r - 0.6), deck + 0.48, -2.5 + Math.sin(a) * (r - 0.6)], fx: GLOSS + 1 }); }
    if (level >= 3) {
      // a second deck and a yellow carpet
      block(M, 3, 2.2, 3, '#F3E9D6', 4, 0, -7, 31, 0.25);
      M.add(cyl(1.7, 1.7, 0.3, 20), capC, { p: [4, 2.4, -7], fx: GLOSS });
      M.add(rbox(1.2, 0.04, 3.8, 0.02), Y, { p: [0, 0.03, 0.6], fx: PAPER });
    }
    stick(M, -4.6, 0, 2.4, 0.8, 0.1);
    M.part('sway:windsock', [-4.6, 2.3, 0.8], (b) => {
      for (let k = 0; k < 4; k++) b.add(cyl(0.22 - k * 0.04, 0.18 - k * 0.04, 0.3, 10, true), k % 2 ? ACC : Y, { p: [0.2 + k * 0.3, 0, 0], r: [0, 0, Math.PI / 2], fx: PAPER });
    });
    return M.done('facility');
  }
  // Jetty (1), Pier (2), Cargo Terminal (3): a popsicle-stick deck reaching back to the water
  const len = Math.max(12 + level * 6, reach), w = 3 + level;
  for (let k = 0; k < Math.round(len / 0.5); k++) M.add(rbox(w, 0.1, 0.44, 0.03), P.stick, { p: [0, 0.4, -k * 0.5], r: [0, (hash(k, 7) - 0.5) * 0.04, 0], fx: PAPER });
  for (let z = -2; z > -len; z -= 3.6) for (const s of [-1, 1]) M.add(cyl(0.16, 0.16, 1.8, 7), P.walnut, { p: [s * (w / 2 - 0.2), -0.4, z], fx: PAPER });
  for (let i = 0; i < level * 2; i++) {
    const x = (i % 2 ? 1 : -1) * (w / 2 - 0.7), z = -3 - Math.floor(i / 2) * 1.6;
    M.add(rbox(0.9, 0.8, 0.9, 0.06), P.stick, { p: [x, 0.85, z], fx: PAPER });
    M.add(sph(0.18, 7, 5), Y, { p: [x, 1.3, z] });
  }
  if (level >= 3) {
    // a popsicle-stick crane
    for (const s of [-1, 1]) stick(M, w / 2 + 0.6 + s * 0.35, 0, 7, -len + 3, 0.22, '#C8325A');
    M.part('sway:crane', [w / 2 + 0.6, 7, -len + 3], (b) => {
      b.add(rbox(6, 0.3, 0.3, 0.08), '#C8325A', { p: [-1.8, 0, 0], fx: PAPER });
      b.add(cyl(0.02, 0.02, 2.4, 4), P.plum, { p: [-4.4, -1.2, 0] });
      b.add(rbox(0.9, 0.7, 0.9, 0.08), P.stick, { p: [-4.4, -2.6, 0], fx: PAPER });
    });
  }
  stick(M, -w / 2 + 0.3, 0.3, 4, -1, 0.12, '#FFFDF6');
  M.add(rbox(1.2, 0.7, 0.04, 0.03), Y, { p: [-w / 2 + 0.95, 3.6, -1], fx: PAPER });
  return M.done('facility');
}

// ---------------------------------------------------------------- plot tiles
/** Owner pattern colours (spec: Palette and patterns); `edge` adds a thin Plum ink edge where accent and main share a lightness. */
export const TILE_PATTERN: Record<'player' | RivalId, { main: string; accent: string; edge: boolean }> = {
  player: { main: '#F6D33C', accent: '#FFFFFF', edge: true },
  sourwood: { main: '#5B2A6E', accent: '#C9A227', edge: false },
  hollis: { main: '#B5651D', accent: '#D64545', edge: true },
  fizzco: { main: '#C8102E', accent: '#B8C2CC', edge: false },
  coldbrew: { main: '#3B2A20', accent: '#FF4FA3', edge: false },
  blenders: { main: '#FF9F1C', accent: '#00A6A6', edge: true },
};
const INK = '#2E2A4F';
/**
 * The owner's pattern pressed into a plot tile, centred on the plot (x across
 * the street, z toward it), sitting on a tile whose top is at y = top:
 * Player wide stripes, Sourwood gold diamond studs, Hollis gingham squares,
 * FizzCo chrome bubble buttons, Cold Brew a neon-pink zigzag snake and the
 * Blenders teal wave snakes. Patterns differ in shape and direction so a
 * grayscale screenshot still shows the owner.
 */
export function tilePattern(owner: 'player' | RivalId, W: number, D: number, top: number, far = false): THREE.BufferGeometry {
  // `far` is the Bay View set: fewer, fatter motifs that stay readable when a tile is a few pixels wide.
  const B = new Baker();
  const t = TILE_PATTERN[owner];
  const y = top + (far ? 0.03 : 0.012);
  const glow = 0.4; // owner tints glow at night
  const k = far ? 2.4 : 1; // stroke weight
  const pressed = (geo: THREE.BufferGeometry, x: number, z: number, o: Opt = {}) => {
    if (t.edge) B.add(geo.clone(), INK, { ...o, p: [x, y - 0.01, z], s: scaleBy(o.s, 1.14, 0.9) });
    B.add(geo, t.accent, { ...o, p: [x, y, z], fx: (o.fx ?? 0) + glow });
  };
  const hw = W / 2 - 0.5, hd = D / 2 - 0.5;
  if (owner === 'player') {
    // wide vertical stripes (running toward the street)
    const n = far ? 2 : 4, sw = far ? 2.6 : 1.1;
    for (let i = 0; i < n; i++) pressed(box(sw, 0.04 * k, D - 1.1), -hw + sw / 2 + 0.3 + i * ((2 * hw - sw - 0.6) / (n - 1)), 0);
  } else if (owner === 'sourwood') {
    // diamond damask: a lattice of gold rhombus outlines (lines at 45°, unlike FizzCo's round dots)
    const cols = far ? 2 : 3, rows = far ? 1 : 2;
    const cw = (2 * hw) / cols, cd = (2 * hd) / rows, bw = 0.16 * k;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const cx = -hw + cw * (c + 0.5), cz = -hd + cd * (r + 0.5), ax = cw * 0.42, az = cd * 0.42;
      for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
        const len = Math.hypot(ax, az);
        pressed(box(bw, 0.04 * k, len), cx + sx * ax / 2, cz + sz * az / 2, { r: [0, Math.atan2(ax * -sx, az * sz) * 1, 0], fx: GLOSS });
      }
      pressed(new THREE.OctahedronGeometry(0.22 * k, 0), cx, cz, { s: [1, 0.3, 1.3], fx: GLOSS });
    }
  } else if (owner === 'hollis') {
    const n = far ? 3 : 6, m = far ? 3 : 5, cw = (2 * hw) / n, cd = (2 * hd) / m;
    for (let r = 0; r < m; r++) for (let c = 0; c < n; c++) if ((r + c) % 2 === (far ? 0 : 1)) pressed(box(cw * 0.92, 0.04 * k, cd * 0.92), -hw + cw * (c + 0.5), -hd + cd * (r + 0.5));
  } else if (owner === 'fizzco') {
    const cols = far ? 2 : 5, rows = far ? 2 : 4, r0 = far ? 1.3 : 0.36;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) B.add(sph(r0, 8, 4), t.accent, { p: [-hw + hw * 2 * (c + 0.5) / cols + (far ? 0 : (r % 2) * 0.8 - 0.4), y - r0 * 0.3, -hd + hd * 2 * (r + 0.5) / rows], s: [1, 0.45, 1], fx: GLOSS + glow });
  } else if (owner === 'coldbrew') {
    for (let r = 0; r < (far ? 1 : 3); r++) {
      // diagonal zigzag: rises toward +x
      const pts: [number, number, number][] = [];
      const n = far ? 5 : 9;
      for (let i = 0; i <= n; i++) pts.push([-hw + i * ((2 * hw) / n), y, (far ? 0 : -hd + 1 + r * ((2 * hd - 2) / 2)) + (i % 2 ? 0.55 : -0.55) * (far ? 3 : 1) - (i - n / 2) * 0.14 * (far ? 2 : 1)]);
      B.add(snake(pts, 0.15 * k, far ? 12 : 20, 4), t.accent, { s: [1, 0.45, 1], fx: 0.8 });
    }
  } else {
    // Blenders: horizontal waves
    const rows = far ? 2 : 4;
    for (let r = 0; r < rows; r++) {
      const pts: [number, number, number][] = [];
      for (let i = 0; i <= 12; i++) pts.push([-hw + i * ((2 * hw) / 12), y, -hd + (far ? 2 : 0.6) + r * ((2 * hd - (far ? 4 : 1.2)) / Math.max(1, rows - 1)) + Math.sin(i * 1.3) * 0.32 * (far ? 2 : 1)]);
      if (t.edge) B.add(snake(pts, 0.21 * k, 16, 3), INK, { s: [1, 0.35, 1] });
      B.add(snake(pts, 0.15 * k, 16, 4), t.accent, { s: [1, 0.5, 1], fx: glow });
    }
  }
  return B.build();
}
function scaleBy(s: Opt['s'], k: number, ky: number): [number, number, number] {
  const v = s === undefined ? [1, 1, 1] : typeof s === 'number' ? [s, s, s] : s;
  return [v[0] * k, v[1] * ky, v[2] * k];
}
/** A Plum ink clay snake round a tile's edge. */
export function tileOutline(W: number, D: number, top: number, r = 0.11): THREE.BufferGeometry {
  const B = new Baker();
  const hw = W / 2 - 0.12, hd = D / 2 - 0.12;
  for (const [x, z, len, along] of [[0, -hd, 2 * hw, true], [0, hd, 2 * hw, true], [-hw, 0, 2 * hd, false], [hw, 0, 2 * hd, false]] as const)
    B.add(cap(r, len, 1, 5), INK, { p: [x, top + 0.02, z], r: along ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0], s: along ? [1, 1, 0.55] : [1, 0.55, 1] });
  return B.build();
}
/** A masking-tape border for civic plots. */
export function tapeBorder(W: number, D: number, top: number): THREE.BufferGeometry {
  const B = new Baker();
  for (const [x, z, w, d] of [[0, -D / 2 + 0.4, W - 0.5, 0.55], [0, D / 2 - 0.4, W - 0.5, 0.55], [-W / 2 + 0.4, 0, 0.55, D - 0.5], [W / 2 - 0.4, 0, 0.55, D - 0.5]] as const)
    B.add(box(w, 0.025, d), '#F3E6C4', { p: [x + (hash(x, z) - 0.5) * 0.1, top + 0.012, z], r: [0, (hash(z, x) - 0.5) * 0.03, 0], fx: PAPER });
  return B.build();
}

// ---------------------------------------------------------------- moving parts
/**
 * Pose a plot model's moving part on twos: `t` is twos time in seconds and
 * `minute` the game clock (minutes since midnight), so the Town Hall clock
 * tells the time. Parts are meshes named 'spin:*' or 'sway:*'.
 */
export function animatePart(o: THREE.Object3D, t: number, minute: number) {
  switch (o.name) {
    case 'spin:clock-hour': o.rotation.z = -((minute / 60) % 12) / 12 * Math.PI * 2; break;
    case 'spin:clock-min': o.rotation.z = -(minute % 60) / 60 * Math.PI * 2; break;
    case 'spin:windmill': o.rotation.z = -t * 0.9; break;
    case 'sway:windsock': o.rotation.y = Math.sin(t * 0.7) * 0.5; o.rotation.z = Math.sin(t * 2.3) * 0.08; break;
    case 'sway:crane': o.rotation.y = Math.sin(t * 0.25) * 0.6; break;
    // A storm flaps the card awnings and skirts of rival L1-L2 stands (still under reduced motion).
    case 'sway:flap': o.rotation.x = (o.userData.base ?? 0) + (reducedMotion() ? 0.1 : cardFlap(t)); break;
  }
}

// ---------------------------------------------------------------- pressed-clay medallions (spec "Logo and crate labels")
/**
 * A faction's logo as a pressed-clay medallion facing +z: the emblem on a sunburst, bordered
 * in the owner's pattern colours, on a stick post down to `postTo` (the roof or wall it stands on).
 */
export function medallion(M0: Model, owner: RivalId | 'player' | null, X: number, Y: number, Z: number, R = 1.1, postTo = Y - R) {
  const t = owner ? TILE_PATTERN[owner] : { main: '#A9A3B5', accent: '#D8D3DE' };
  const face = (o: Opt) => ({ ...o, r: [Math.PI / 2, 0, 0] as [number, number, number] });
  if (postTo < Y - R) stick(M0, X, postTo, Y - R * 0.6, Z, 0.16);
  // Built once round its own centre, then pressed onto both faces of the disc, so it reads from either side.
  const E = new Baker();
  const M = { add(g: THREE.BufferGeometry, c: Col, o: Opt = {}) { E.add(g, c, o); return M; } };
  const x = 0, y = 0, z = 0;
  // sunburst: card rays alternating cream and the owner's accent, behind a cream disc
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    M.add(cone(R * 0.24, R * 0.55, 3), k % 2 ? '#FFFDF6' : t.accent, { p: [x + Math.cos(a) * R * 1.02, y + Math.sin(a) * R * 1.02, z - 0.06], r: [0, 0, a - Math.PI / 2], s: [1, 1, 0.25], fx: PAPER });
  }
  M.add(cyl(R, R, 0.16, 20), '#FFF6DF', face({ p: [x, y, z] }));
  // the border, beaded in the owner's main colour with accent studs
  M.add(tor(R, R * 0.11, 6, 24), t.main, { p: [x, y, z + 0.08] });
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2 + 0.2; M.add(sph(R * 0.08, 6, 4), t.accent, { p: [x + Math.cos(a) * R, y + Math.sin(a) * R, z + 0.16], fx: GLOSS }); }
  const zf = z + 0.14, u = R / 1.1; // emblem scale
  const eye = (ex: number, ey: number, shut = false) => M.add(shut ? box(0.18 * u, 0.05 * u, 0.04) : sph(0.07 * u, 6, 4), INK, { p: [x + ex * u, y + ey * u, zf + 0.22 * u], ...(shut ? { r: [0, 0, 0.25] as [number, number, number] } : {}) });
  if (owner === 'player') {
    // Lottie's smiling lemon in a sun hat
    M.add(sph(0.55 * u, 12, 8), '#F6D33C', { p: [x, y - 0.1 * u, zf], s: [1.25, 1, 0.55] });
    M.add(cyl(0.75 * u, 0.75 * u, 0.05, 16), '#F3DDA6', { p: [x, y + 0.38 * u, zf], r: [0.35, 0, 0], fx: PAPER });
    M.add(sph(0.36 * u, 10, 6), '#F3DDA6', { p: [x, y + 0.42 * u, zf - 0.05], s: [1, 0.6, 0.8], fx: PAPER });
    M.add(tor(0.36 * u, 0.05 * u, 4, 14), P.terra, { p: [x, y + 0.42 * u, zf - 0.05], r: [Math.PI / 2, 0, 0] });
    eye(-0.18, -0.05); eye(0.18, -0.05);
    M.add(tor(0.13 * u, 0.03 * u, 4, 10, Math.PI), INK, { p: [x, y - 0.2 * u, zf + 0.26 * u], r: [0, 0, Math.PI] });
  } else if (owner === 'fizzco') {
    // a winking soda bottle
    M.add(lathe([[0, 0], [0.26, 0], [0.28, 0.5], [0.12, 0.85], [0.1, 1.05], [0, 1.05]], 12), '#C8102E', { p: [x, y - 0.6 * u, zf], s: [u, u, u * 0.6], fx: GLOSS });
    M.add(cyl(0.29 * u, 0.29 * u, 0.25 * u, 12), '#FFFDF6', { p: [x, y - 0.25 * u, zf] });
    eye(-0.1, -0.24); eye(0.1, -0.24, true);
  } else if (owner === 'sourwood') {
    // a lemon in pearls and a monocle
    M.add(sph(0.5 * u, 12, 8), '#F6D33C', { p: [x, y + 0.05 * u, zf], s: [1.3, 1, 0.55] });
    for (let k = 0; k < 9; k++) { const a = Math.PI * 1.15 + (k / 8) * Math.PI * 0.7; M.add(sph(0.06 * u, 6, 4), '#FFFDF6', { p: [x + Math.cos(a) * 0.55 * u, y - 0.08 * u + Math.sin(a) * 0.4 * u, zf + 0.22 * u], fx: GLOSS }); }
    eye(-0.18, 0.1); M.add(tor(0.13 * u, 0.03 * u, 4, 14), '#C9A227', { p: [x + 0.18 * u, y + 0.1 * u, zf + 0.25 * u], fx: GLOSS }); eye(0.18, 0.1);
  } else if (owner === 'hollis') {
    // a tea jar crossed with a ladle
    M.add(box(0.08 * u, 1.3 * u, 0.06), P.walnut, { p: [x, y, zf + 0.05], r: [0, 0, 0.7] });
    M.add(sph(0.16 * u, 8, 5), P.walnut, { p: [x + 0.45 * u, y - 0.5 * u, zf + 0.05], s: [1, 1, 0.5] });
    M.add(lathe([[0, 0], [0.32, 0], [0.34, 0.55], [0.22, 0.68], [0, 0.68]], 12), '#E8B060', { p: [x - 0.05 * u, y - 0.42 * u, zf + 0.08], s: [u, u, u * 0.6], fx: GLOSS });
    M.add(cyl(0.24 * u, 0.24 * u, 0.1 * u, 12), '#D64545', { p: [x - 0.05 * u, y + 0.3 * u, zf + 0.08] });
  } else if (owner === 'coldbrew') {
    // a sleepy coffee bean
    M.add(sph(0.5 * u, 12, 8), '#6B4226', { p: [x, y, zf], s: [0.8, 1.15, 0.5], r: [0, 0, 0.4] });
    M.add(box(0.06 * u, 0.9 * u, 0.06), '#3B2A20', { p: [x + 0.06 * u, y, zf + 0.25 * u], r: [0, 0, 0.55] });
    eye(-0.2, 0.12, true); eye(0.22, 0.02, true);
    M.add(sph(0.06 * u, 6, 4), '#FF4FA3', { p: [x + 0.5 * u, y + 0.45 * u, zf + 0.1] }); // a "z"
  } else if (owner === 'blenders') {
    // a flexing smoothie cup on a wave
    const wave: [number, number, number][] = [];
    for (let k = 0; k <= 10; k++) wave.push([x - 0.7 * u + k * 0.14 * u, y - 0.55 * u + Math.sin(k * 1.1) * 0.08 * u, zf + 0.05]);
    M.add(snake(wave, 0.07 * u, 20, 5), '#00A6A6');
    M.add(lathe([[0, 0], [0.22, 0], [0.32, 0.8], [0, 0.8]], 12), '#FF9F1C', { p: [x, y - 0.45 * u, zf], s: [u, u, u * 0.6] });
    M.add(cyl(0.02 * u, 0.02 * u, 0.5 * u, 4), '#00A6A6', { p: [x + 0.1 * u, y + 0.5 * u, zf], r: [0, 0, -0.3] });
    for (const s of [-1, 1]) M.add(cap(0.07 * u, 0.3 * u, 3, 6), '#FF9F1C', { p: [x + s * 0.4 * u, y + 0.05 * u, zf + 0.05], r: [0, 0, s * -0.9] }), M.add(sph(0.11 * u, 6, 4), '#FF9F1C', { p: [x + s * 0.48 * u, y + 0.28 * u, zf + 0.05] });
    eye(-0.09, -0.05); eye(0.09, -0.05);
  } else {
    M.add(sph(0.4 * u, 10, 6), '#B9B4C4', { p: [x, y, zf], s: [1, 1, 0.5] });
  }
  const g = E.build();
  M0.B.raw(g, new THREE.Matrix4().makeTranslation(X, Y, Z));
  M0.B.raw(g, new THREE.Matrix4().makeTranslation(X, Y, Z).multiply(new THREE.Matrix4().makeRotationY(Math.PI)));
  g.dispose();
}

/**
 * The Billboard: a cardstock board on popsicle-stick legs in the owner's colours, the owner's medallion
 * pressed on its face, two clay spotlights that glow at night, and a cardboard strut behind.
 */
function billboard(M: Model, owner: string | null, main: Col, acc: Col) {
  M.farColor = main;
  const z = -3.2, W = 8, H = 3.6, y0 = 3.2, yc = y0 + H / 2;
  // legs and a cross brace
  for (const x of [-2.8, 0, 2.8]) { stick(M, x, 0, y0 + 0.3, z - 0.15, 0.3); stick(M, x, 0, y0 * 0.9, z - 1.6, 0.22); }
  M.add(rbox(6.4, 0.18, 0.12, 0.04), P.stick, { p: [0, 1.4, z - 0.25], r: [0, 0, 0.32], fx: PAPER });
  M.add(rbox(6.4, 0.18, 0.12, 0.04), P.stick, { p: [0, 1.4, z - 0.25], r: [0, 0, -0.32], fx: PAPER });
  for (const x of [-2.8, 0, 2.8]) M.add(rbox(0.16, 0.16, 1.6, 0.04), P.stick, { p: [x, y0 * 0.85, z - 0.85], r: [-0.5, 0, 0], fx: PAPER });
  // the cardstock board: an owner-coloured border round a cream face with stripes in the accent
  M.add(rbox(W + 0.5, H + 0.5, 0.2, 0.08), main, { p: [0, yc, z], fx: PAPER });
  M.add(rbox(W, H, 0.06, 0.03), '#FFF6DF', { p: [0, yc, z + 0.12], fx: PAPER });
  for (let k = 0; k < 4; k++) M.add(rbox(W * 0.36, 0.22, 0.03, 0.02), k % 2 ? main : acc === '#FFFFFF' ? '#E8704F' : acc, { p: [1.9, yc + 1.05 - k * 0.7, z + 0.16], fx: PAPER });
  medallion(M, (owner ?? 'player') as RivalId | 'player', -2.3, yc, z + 0.25, 1.45);
  // clay spotlights on bent stick arms, lit at night
  for (const x of [-2.6, 2.6]) {
    M.add(rbox(0.1, 0.1, 1.2, 0.03), '#5B5568', { p: [x, y0 + H + 0.45, z + 0.45] });
    M.add(cone(0.28, 0.45, 10, true), '#5B5568', { p: [x, y0 + H + 0.35, z + 1.05], r: [-2.2, 0, 0] });
    M.add(sph(0.16, 8, 6), '#FFE2A8', { p: [x, y0 + H + 0.2, z + 1.15], fx: GLOSS + 1 });
  }
  return M.done('facility');
}
