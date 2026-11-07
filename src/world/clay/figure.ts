// Clay people, ported from the mockup (clay-mockup/dirs/clay/people.js): about
// 2 heads tall, a sphere head with bead eyes, snake brows, a real nose and
// thumbprint blush. Every body kind has its own lathe profile, hat and gait.
// Poses land on twos (12 fps) with a little boil while the camera stays smooth.
//
// Rig (for the world thread's hopPose/idlePose and anything that holds props):
//   root.userData.limbs = [legL, legR, armL, armR]  pivots; rotation.x swings them
//   root.userData.base  = resting scale of root
//   root.userData.head  = the neck group (turn, nod, tilt)
//   root.userData.hands = [left, right] groups at the mittens
//   root.userData.rig   = the group pose() squashes and leans (inside root)
//   root.userData.figure = the Figure
// "L" and "R" follow the mockup: L sits at -x, R at +x (the figure faces +z).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { GLOSS, PAPER, Baker, bend, box, cap as cap0, cyl as cyl0, hash, lathe as lathe0, lumpy, shade, snake as snake0, sph as sph0, tor as tor0, type V3 } from './core.ts';
import { P, SKINS } from './palette.ts';

export type BodyKind = 'pear' | 'kid' | 'round' | 'stilt' | 'barrel' | 'block' | 'bean' | 'vee' | 'lanky';
export type Eyes = 'bead' | 'happy' | 'lids' | 'sleepy' | 'glasses' | 'shades' | 'pop' | 'spiral' | 'squeeze';
export type Brows = 'up' | 'angry' | 'worried' | 'flat' | 'proud' | 'none';
export type Nose = 'button' | 'long' | 'potato' | 'square' | 'zinc';
export type Mouth = 'smile' | 'grin' | 'gap' | 'o' | 'flat' | 'frown' | 'smirk' | 'pucker' | 'wavy';
export type Hat = 'sunhat' | 'cap' | 'bowler' | 'straw' | 'flattop' | 'beanie' | 'visor' | 'beret' | 'bun' | 'curly' | 'pigtails' | 'bucket' | 'bald' | 'ponytail' | 'propeller' | 'picnic' | 'slick' | 'helmet' | 'leafcap' | 'none';
type C = string;

/** Everything that makes a person. Only `kind` matters; the rest have friendly defaults. */
export interface FigureSpec {
  kind?: BodyKind;
  seed?: number;
  /** head radius (defaults per kind) */ R?: number;
  skin?: C; skin2?: C; shirt?: C; pants?: C; shoes?: C; sleeve?: C; glove?: C; legColor?: C; collar?: C;
  hairColor?: C; browColor?: C; noseColor?: C; mouthColor?: C; blush?: C;
  hat?: Hat; hatColor?: C; hatColor2?: C; bandColor?: C;
  headShape?: 'round' | 'block'; headSquash?: number;
  eyes?: Eyes; eyeX?: number; eyeY?: number; eyeR?: number; lidTilt?: number;
  brows?: Brows; browUp?: number; browL?: number; browR?: number;
  nose?: Nose; noseY?: number; noseR?: number;
  mouth?: Mouth; mouthX?: number; mouthY?: number; mouthW?: number; mouthTilt?: number;
  freckles?: boolean; mustache?: 'curl' | 'bushy'; straw?: boolean; earpiece?: boolean;
  // costume
  apron?: C; overalls?: boolean; gingham?: boolean; damask?: boolean; waves?: C; zigzag?: C; vest?: C; pearls?: boolean;
  cardigan?: C; hood?: boolean; tails?: boolean; crossed?: boolean; shortSleeve?: boolean; cuff?: C;
  /** body width (x and z) relative to the kind: Tilly's barrel is the widest in town */ girth?: number;
  /** a tank top: bare shoulders and arms (Smoothie Bros) */ tank?: boolean;
  /** Skip Larkin's blazer, printed with tiny houses */ houses?: C;
  /** Mayor Fontaine's tiny lapel pin */ lapelPin?: C;
  /** crew gear: padded vest (15% rounder), Pro Gear shoulder pads, clay-snake sleeve chevrons (0 Rookie to 4 Legend) */
  padded?: C; pads?: C; chevrons?: number; chevronColor?: C;
  /** taped fists: tape colour over the mittens */ tape?: C;
  /** worn over the shoulders: lanyard (office), camera strap (tourists), backpack (students), tool belt (Wreckers), binoculars (Lookouts), whistle (Captains) */
  lanyard?: C; camera?: boolean; backpack?: C; toolbelt?: boolean; binoculars?: boolean; whistle?: boolean;
  /** Dex's lemon guard vest is `vest`; this adds a striped guard bib for the player's crew */ bib?: C;
}

/** Whole-face swaps (spec "Characters": never X eyes). */
export type Face = 'neutral' | 'yum' | 'pucker' | 'brainfreeze' | 'shock' | 'ko';
export const FACES: Record<Face, Partial<FigureSpec>> = {
  neutral: {},
  yum: { eyes: 'happy', mouth: 'grin', brows: 'up' },
  pucker: { eyes: 'squeeze', mouth: 'pucker', brows: 'worried' },
  brainfreeze: { eyes: 'squeeze', mouth: 'wavy', brows: 'worried', blush: '#9fd8ea' },
  shock: { eyes: 'pop', mouth: 'o', mouthW: 0.26, brows: 'up', browUp: 0.52 },
  ko: { eyes: 'spiral', mouth: 'wavy', brows: 'worried' },
};
type Spec = FigureSpec & { glassesToo?: boolean } & Required<Pick<FigureSpec, 'kind' | 'skin' | 'shirt' | 'pants' | 'shoes' | 'hairColor' | 'eyes' | 'brows' | 'mouth' | 'nose' | 'seed' | 'R' | 'skin2'>>;

// Level of detail: segment counts scale by DETAIL while a figure is being built
// (1 is the mockup; crowds can use about 0.5 to keep phones inside the triangle budget).
let DETAIL = 1;
const n = (k: number, min = 3) => Math.max(min, Math.round(k * DETAIL));
const sph = (r: number, w = 20, h = 14) => sph0(r, n(w, 5), n(h, 4));
const cap = (r: number, l: number, cs = 4, rs = 10) => cap0(r, l, n(cs, 2), n(rs, 5));
const cyl = (rt: number, rb: number, h: number, s = 16, open = false) => cyl0(rt, rb, h, n(s, 5), open);
const tor = (r: number, t: number, rs = 8, ts = 20, arc = Math.PI * 2) => tor0(r, t, n(rs, 4), n(ts, 6), arc);
const lathe = (pts: [number, number][], seg = 22) => lathe0(pts, n(seg, 6));
const snake = (pts: V3[], r: number, seg = 24, rs = 7) => snake0(pts, r, n(seg, 4), n(rs, 4));

const _n = new THREE.Vector3();
interface Frame { p: THREE.Vector3; q: THREE.Quaternion }
/** a frame on the head sphere: +z out of the surface, +y roughly up */
function onHead(R: number, yaw: number, pitch: number, lift = 0): Frame {
  _n.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-pitch, yaw, 0, 'YXZ'));
  return { p: _n.clone().multiplyScalar(R + lift), q };
}
/** compose: local transform inside a head frame */
function inFrame(f: Frame, o: { p?: V3; r?: V3; s?: number | V3 } = {}) {
  const m = new THREE.Matrix4().compose(f.p, f.q, new THREE.Vector3(1, 1, 1));
  const s = typeof o.s === 'number' ? [o.s, o.s, o.s] : o.s || [1, 1, 1];
  const p = o.p || [0, 0, 0], r = o.r || [0, 0, 0];
  const l = new THREE.Matrix4().compose(new THREE.Vector3(p[0], p[1], p[2]), new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0], r[1], r[2])), new THREE.Vector3(s[0], s[1], s[2]));
  return m.multiply(l);
}

// ---------- faces ----------
function eyes(B: Baker, R: number, sp: Spec, closed: false | 'down') {
  const ey = sp.eyeY ?? 0.08, ex = sp.eyeX ?? 0.36, er = R * (sp.eyeR ?? 0.13);
  for (const side of [-1, 1]) {
    const f = onHead(R, side * ex, ey, -er * 0.35);
    if (sp.eyes === 'shades') continue;
    if (sp.eyes === 'spiral') {
      // KO: a rolled clay-snake spiral on each eye, never X eyes
      const pts: V3[] = [];
      for (let i = 0; i <= 18; i++) { const a = i * 0.62 * side, r = er * (0.15 + i * 0.055); pts.push([Math.cos(a) * r, Math.sin(a) * r, 0]); }
      B.add(sph(er * 1.15, 12, 8), '#ffffff', { m: inFrame(f, { p: [0, 0, er * 0.05], s: [1, 1, 0.45] }) });
      B.add(snake(pts, er * 0.12, 30, 4), P.plum, { m: inFrame(f, { p: [0, 0, er * 0.55] }) });
      if (sp.glassesToo) B.add(tor(er * 1.75, er * 0.2, 6, 18), P.gold, { fx: GLOSS, m: inFrame(f, { p: [0, 0, er * ((sp.eyes as string) === 'pop' ? 1.6 : 1.0)] }) });
      continue;
    }
    if (sp.eyes === 'squeeze') {
      // squeezed tight: a little clay chevron pointing at the nose (> <)
      const L = er * 0.9;
      B.add(snake([[side * L * 0.5, L * 0.5, 0], [-side * L * 0.4, 0, 0], [side * L * 0.5, -L * 0.45, 0]], er * 0.2, 8, 5), P.plum, { m: inFrame(f, { p: [0, 0, er * 0.35] }) });
      if (sp.glassesToo) B.add(tor(er * 1.75, er * 0.2, 6, 18), P.gold, { fx: GLOSS, m: inFrame(f, { p: [0, 0, er * ((sp.eyes as string) === 'pop' ? 1.6 : 1.0)] }) });
      continue;
    }
    if (sp.eyes === 'pop') {
      // price-shock: the eyes pop out of the head
      B.add(sph(er * 1.55, 14, 10), '#ffffff', { fx: GLOSS, m: inFrame(f, { p: [0, er * 0.2, er * 0.55] }) });
      B.add(sph(er * 0.6, 10, 8), P.plum, { fx: GLOSS, m: inFrame(f, { p: [0, er * 0.2, er * 1.95] }) });
      B.add(sph(er * 0.2, 6, 4), '#ffffff', { fx: GLOSS + 1, m: inFrame(f, { p: [-er * 0.22, er * 0.42, er * 2.45] }) });
      if (sp.glassesToo) B.add(tor(er * 1.75, er * 0.2, 6, 18), P.gold, { fx: GLOSS, m: inFrame(f, { p: [0, 0, er * ((sp.eyes as string) === 'pop' ? 1.6 : 1.0)] }) });
      continue;
    }
    if (closed || sp.eyes === 'happy') {
      // content closed eye: a little clay arc
      const g = tor(er * 0.75, er * 0.2, 6, 10, Math.PI * 0.85);
      B.add(g, P.plum, { m: inFrame(f, { p: [0, er * 0.35, er * 0.5], r: [0, 0, closed === 'down' ? Math.PI * 1.075 : Math.PI * 0.075] }) });
      if (sp.eyes === 'glasses' || sp.glassesToo) B.add(tor(er * 1.75, er * 0.2, 6, 18), P.gold, { fx: GLOSS, m: inFrame(f, { p: [0, 0, er * 1.0] }) });
      continue;
    }
    B.add(sph(er, 14, 10), P.plum, { fx: GLOSS, m: inFrame(f, { p: [0, 0, er * 0.15] }) });
    B.add(sph(er * 0.32, 8, 6), '#ffffff', { fx: GLOSS + 1, m: inFrame(f, { p: [-er * 0.38, er * 0.4, er * 0.92] }) });
    B.add(sph(er * 0.13, 6, 4), '#ffffff', { fx: GLOSS + 1, m: inFrame(f, { p: [er * 0.38, -er * 0.35, er * 0.95] }) });
    if (sp.eyes === 'lids' || sp.eyes === 'sleepy') {
      const lid = new THREE.SphereGeometry(er * 1.22, n(14, 5), n(8, 4), 0, Math.PI * 2, 0, Math.PI * 0.5);
      B.add(lid, sp.skin, { m: inFrame(f, { p: [0, 0, er * 0.12], r: [sp.eyes === 'sleepy' ? 0.95 : 0.55, 0, side * (sp.lidTilt ?? 0.28)] }) });
    }
    if (sp.eyes === 'glasses' || sp.glassesToo) {
      B.add(tor(er * 1.75, er * 0.2, 6, 18), P.gold, { fx: GLOSS, m: inFrame(f, { p: [0, 0, er * 1.0] }) });
    }
  }
  if (sp.eyes === 'glasses' || sp.glassesToo) { const f = onHead(R, 0, ey + 0.02, R * 0.04); B.add(cap(er * 0.18, er * 1.3, 2, 6), P.gold, { fx: GLOSS, m: inFrame(f, { p: [0, 0, er * 0.7], r: [0, 0, Math.PI / 2] }) }); }
  if (sp.eyes === 'shades') {
    const f = onHead(R, 0, ey + 0.02, 0);
    const g = new RoundedBoxGeometry(R * 1.55, er * 2.3, er * 1.4, 2, er * 0.5);
    B.add(bend(g, () => 0), P.plum, { fx: GLOSS, m: inFrame(f, { p: [0, 0, -er * 0.2] }) });
    B.add(cap(er * 0.25, R * 0.5, 2, 6), '#ffffff', { fx: GLOSS + 1, m: inFrame(f, { p: [-R * 0.42, er * 0.45, er * 0.55], r: [0, 0, 1.2] }) });
  }
}
function brows(B: Baker, R: number, sp: Spec) {
  if (sp.brows === 'none') return;
  const by = (sp.eyeY ?? 0.08) + (sp.browUp ?? 0.36), ex = (sp.eyeX ?? 0.36) + 0.02, L = R * (sp.browL ?? 0.34), r = R * (sp.browR ?? 0.055);
  const tilt = { angry: 0.42, worried: -0.38, flat: 0, up: -0.12, proud: -0.2 }[sp.brows || 'up'];
  for (const side of [-1, 1]) {
    const f = onHead(R, side * ex, by, 0);
    let a = side * tilt, lift = 0;
    if (sp.brows === 'proud' && side < 0) { a = -0.05; lift = R * 0.08; }
    const g = snake([[-L / 2, 0, 0], [0, L * 0.18, 0], [L / 2, 0, 0]], r, 8, 6);
    B.add(g, sp.browColor || sp.hairColor || P.walnut, { m: inFrame(f, { p: [0, lift, r * 0.3], r: [0, 0, a] }) });
  }
}
function nose(B: Baker, R: number, sp: Spec) {
  const f = onHead(R, 0, sp.noseY ?? -0.1, 0);
  const sk = sp.noseColor || sp.skin2 || shade(sp.skin, -0.06);
  switch (sp.nose) {
    case 'long': B.add(new THREE.ConeGeometry(R * 0.11, R * 0.52, n(10, 4)), sk, { m: inFrame(f, { p: [0, R * 0.04, R * 0.2], r: [Math.PI / 2 - 0.45, 0, 0] }) }); break;
    case 'potato': B.add(lumpy(sph(R * 0.2, 12, 9), R * 0.03, 12, 3), sk, { m: inFrame(f, { p: [0, -R * 0.04, R * 0.08], s: [1.1, 0.95, 0.9] }) }); break;
    case 'square': B.add(new RoundedBoxGeometry(R * 0.2, R * 0.24, R * 0.2, 2, R * 0.06), sk, { m: inFrame(f, { p: [0, 0, R * 0.06] }) }); break;
    case 'zinc': B.add(sph(R * 0.14, 12, 9), '#ffffff', { m: inFrame(f, { p: [0, 0, R * 0.05], s: [1, 0.9, 1] }) }); break;
    default: B.add(sph(R * (sp.noseR ?? 0.13), 12, 9), sk, { m: inFrame(f, { p: [0, 0, R * 0.04], s: [1.05, 0.9, 1] }) });
  }
}
function mouth(B: Baker, R: number, sp: Spec) {
  const my = sp.mouthY ?? -0.36, f = onHead(R, sp.mouthX ?? 0, my, -R * 0.01), mc = sp.mouthColor || '#7a2f3f';
  const w = R * (sp.mouthW ?? 0.17);
  switch (sp.mouth) {
    case 'grin': case 'gap': {
      const g = new THREE.CylinderGeometry(w * 1.2, w * 1.2, R * 0.1, n(16, 5), 1, false, -Math.PI / 2, Math.PI);
      B.add(g, '#5a1f2c', { m: inFrame(f, { p: [0, w * 0.35, 0], r: [Math.PI / 2, 0, 0], s: [1, 1, 0.8] }) });
      if (sp.mouth === 'gap') { for (const x of [-0.45, 0.45]) B.add(new RoundedBoxGeometry(w * 0.7, w * 0.42, R * 0.05, 1, w * 0.1), '#ffffff', { m: inFrame(f, { p: [x * w, w * 0.15, R * 0.045] }) }); }
      else B.add(new RoundedBoxGeometry(w * 1.9, w * 0.4, R * 0.05, 1, w * 0.12), '#ffffff', { m: inFrame(f, { p: [0, w * 0.15, R * 0.045] }) });
      B.add(sph(w * 0.5, 8, 6), '#e0607a', { m: inFrame(f, { p: [0, -w * 0.55, R * 0.02], s: [1.2, 0.6, 0.6] }) });
      break;
    }
    case 'o': B.add(tor(w * 0.45, w * 0.18, 6, 12), mc, { m: inFrame(f, { p: [0, 0, 0] }) }); B.add(sph(w * 0.4, 8, 6), '#4a1822', { m: inFrame(f, { s: [1, 1, 0.3] }) }); break;
    case 'pucker': B.add(tor(w * 0.36, w * 0.2, 6, 12), '#c8325a', { m: inFrame(f, { p: [0, 0, R * 0.05], s: [1, 0.85, 1.3] }) }); B.add(sph(w * 0.22, 6, 5), '#4a1822', { m: inFrame(f, { p: [0, 0, R * 0.06], s: [1, 1, 0.3] }) }); break;
    case 'wavy': { const pts: V3[] = []; for (let i = 0; i <= 6; i++) pts.push([(i / 6 - 0.5) * w * 2.2, (i % 2 ? 1 : -1) * w * 0.16, 0]); B.add(snake(pts, R * 0.032, 16, 5), mc, { m: inFrame(f) }); break; }
    case 'flat': B.add(cap(R * 0.03, w * 1.4, 2, 6), mc, { m: inFrame(f, { r: [0, 0, Math.PI / 2 + (sp.mouthTilt || 0)] }) }); break;
    case 'frown': B.add(tor(w, R * 0.032, 6, 12, Math.PI * 0.7), mc, { m: inFrame(f, { p: [0, -w * 0.9, 0], r: [0, 0, Math.PI * 0.15] }) }); break;
    case 'smirk': B.add(tor(w, R * 0.032, 6, 12, Math.PI * 0.55), mc, { m: inFrame(f, { p: [w * 0.35, w * 0.75, 0], r: [0, 0, Math.PI * 1.32 + 0.3] }) }); break;
    default: B.add(tor(w, R * 0.034, 6, 14, Math.PI * 0.72), mc, { m: inFrame(f, { p: [0, w * 0.75, 0], r: [0, 0, Math.PI * 1.14] }) });
  }
}
function cheeks(B: Baker, R: number, sp: Spec) {
  for (const side of [-1, 1]) {
    const f = onHead(R, side * 0.6, -0.2, -R * 0.06);
    B.add(sph(R * 0.17, 12, 8), sp.blush || P.blush, { m: inFrame(f, { s: [1, 0.8, 0.45] }) });
    if (sp.freckles) for (let i = 0; i < 3; i++) B.add(sph(R * 0.025, 5, 4), '#b8643c', { m: inFrame(onHead(R, side * (0.48 + i * 0.07), -0.08 - (i % 2) * 0.05, 0), {}) });
    if (sp.nose === 'zinc') B.add(cap(R * 0.035, R * 0.18, 2, 6), '#ffffff', { m: inFrame(onHead(R, side * 0.55, -0.08, 0), { r: [0, 0, 0.3 * side + Math.PI / 2] }) });
  }
  // ears
  for (const side of [-1, 1]) { const f = onHead(R, side * 1.55, -0.02, -R * 0.1); B.add(sph(R * 0.15, 10, 8), sp.skin, { m: inFrame(f, { s: [0.8, 1, 0.55] }) }); }
}

// ---------- hats and hair ----------
function headwear(B: Baker, R: number, sp: Spec) {
  const hc = sp.hairColor || P.walnut, H = sp.hatColor || P.lemon, H2 = sp.hatColor2 || P.cream;
  const back = (yaw: number, pitch: number, s: number, c: C = hc) => B.add(lumpy(sph(R * s, 12, 9), R * 0.04, 6 / R, yaw * 7), c, { m: inFrame(onHead(R, yaw, pitch, -R * s * 0.45)) });
  switch (sp.hat) {
    case 'sunhat': {
      for (const [y, p] of [[2.4, 0.1], [-2.4, 0.1], [3.14, 0.2], [1.9, -0.15], [-1.9, -0.15], [2.8, -0.2], [-2.8, -0.2]]) back(y, p, 0.3);
      B.add(lumpy(cyl(R * 1.75, R * 1.85, R * 0.07, 32), R * 0.04, 4 / R, 2), H, { p: [0, R * 0.55, 0], r: [-0.12, 0, 0.05] });
      B.add(new THREE.SphereGeometry(R * 0.86, n(20, 5), n(10, 4), 0, Math.PI * 2, 0, Math.PI * 0.5), H, { p: [0, R * 0.52, -R * 0.03], r: [-0.12, 0, 0.05], s: [1.05, 0.8, 1.05] });
      B.add(cyl(R * 0.88, R * 0.9, R * 0.16, 28, true), sp.bandColor || P.terra, { p: [0, R * 0.64, -R * 0.03], r: [-0.12, 0, 0.05] });
      // the lemon on the band
      B.add(lumpy(sph(R * 0.2, 12, 9), R * 0.02, 10, 5), P.lemon, { p: [R * 0.55, R * 0.72, R * 0.62], s: [1.35, 1, 1] });
      B.add(new THREE.SphereGeometry(R * 0.12, n(8, 5), n(6, 4)), P.green, { p: [R * 0.32, R * 0.86, R * 0.58], s: [1.6, 0.4, 0.8], r: [0, 0, 0.4] });
      break;
    }
    case 'cap': {
      B.add(new THREE.SphereGeometry(R * 1.03, n(22, 5), n(12, 4), 0, Math.PI * 2, 0, Math.PI * 0.5), H, { p: [0, R * 0.12, 0], r: [-0.12, 0, 0] });
      const brim = new THREE.CylinderGeometry(R * 0.72, R * 0.72, R * 0.07, n(20, 5), 1, false, -Math.PI / 2, Math.PI);
      B.add(brim, H, { p: [0, R * 0.2, R * 0.72], r: [0.1, 0, 0], s: [1, 1, 0.9] });
      B.add(sph(R * 0.1, 8, 6), H2, { p: [0, R * 1.12, -R * 0.08] });
      B.add(lumpy(sph(R * 0.2, 10, 8), R * 0.03, 8, 1), P.lemon, { p: [0, R * 0.62, R * 0.86], s: [1.3, 1, 0.5] });
      for (const s of [-1, 1]) back(s * 1.35, -0.25, 0.22);
      break;
    }
    case 'bowler': {
      B.add(new THREE.SphereGeometry(R * 0.82, n(20, 5), n(12, 4), 0, Math.PI * 2, 0, Math.PI * 0.55), H, { p: [0, R * 0.55, 0], s: [1, 1.1, 1] });
      B.add(tor(R * 0.86, R * 0.09, 8, 28), H, { p: [0, R * 0.56, 0], r: [Math.PI / 2, 0, 0], s: [1.08, 1, 1] });
      B.add(cyl(R * 0.82, R * 0.83, R * 0.12, 28, true), P.gold, { p: [0, R * 0.68, 0] });
      for (const s of [-1, 1]) back(s * 1.25, 0.05, 0.18, hc);
      break;
    }
    case 'straw': {
      B.add(lumpy(cyl(R * 2.1, R * 2.15, R * 0.06, 36), R * 0.05, 3 / R, 4), H, { p: [0, R * 0.62, 0], r: [0.06, 0, -0.05] });
      B.add(cyl(R * 0.62, R * 0.72, R * 0.36, 22), H, { p: [0, R * 0.82, 0], r: [0.06, 0, -0.05] });
      B.add(cyl(R * 0.73, R * 0.75, R * 0.12, 22, true), P.ging, { p: [0, R * 0.7, 0], r: [0.06, 0, -0.05] });
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; B.add(box(R * 0.09, R * 0.13, R * 0.02), '#ffffff', { p: [Math.sin(a) * R * 0.76, R * 0.7, Math.cos(a) * R * 0.76], r: [0, a, 0] }); }
      for (const s of [-1, 1]) back(s * 1.3, -0.3, 0.2, hc);
      break;
    }
    case 'flattop': {
      B.add(new RoundedBoxGeometry(R * 1.62, R * 0.42, R * 1.5, 2, R * 0.12), hc, { p: [0, R * 0.98, -R * 0.06] });
      break;
    }
    case 'beanie': {
      const g = lathe([[R * 1.0, 0], [R * 1.0, R * 0.3], [R * 0.9, R * 0.75], [R * 0.7, R * 1.15], [R * 0.45, R * 1.45], [R * 0.2, R * 1.6], [0, R * 1.62]], 20);
      B.add(bend(g, (y) => -y * y * 0.35), H, { p: [0, R * 0.22, -R * 0.06], r: [-0.25, 0, 0.06] });
      B.add(tor(R * 0.98, R * 0.14, 8, 24), H, { p: [0, R * 0.3, -R * 0.02], r: [Math.PI / 2 - 0.25, 0, 0.06] });
      const zz: V3[] = []; for (let i = 0; i <= 10; i++) { const a = -Math.PI * 0.55 + (i / 10) * Math.PI * 1.1; zz.push([Math.sin(a) * R * 1.07, (i % 2 ? 0.07 : -0.07) * R, Math.cos(a) * R * 1.07]); }
      B.add(snake(zz, R * 0.045, 40, 5), P.neon, { p: [0, R * 0.62, -R * 0.06], r: [-0.25, 0, 0.06], fx: 0.6 });
      for (const s of [-1, 1]) back(s * 1.2, -0.35, 0.2, hc);
      break;
    }
    case 'visor': {
      B.add(tor(R * 1.0, R * 0.09, 8, 28), H, { p: [0, R * 0.42, 0], r: [Math.PI / 2 - 0.12, 0, 0] });
      const brim = new THREE.CylinderGeometry(R * 0.85, R * 0.85, R * 0.06, n(20, 5), 1, false, -Math.PI / 2, Math.PI);
      B.add(brim, H, { p: [0, R * 0.48, R * 0.78], r: [0.25, 0, 0] });
      for (let i = 0; i < 7; i++) { const a = (i / 6 - 0.5) * 2.0; B.add(new THREE.ConeGeometry(R * 0.2, R * 0.55, n(8, 4)), hc, { p: [Math.sin(a) * R * 0.55, R * 0.92, Math.cos(a) * R * 0.3 - R * 0.15], r: [-0.4 + Math.cos(a) * 0.2, 0, -a * 0.5] }); }
      break;
    }
    case 'beret': {
      B.add(lumpy(sph(R * 0.95, 18, 10), R * 0.05, 5 / R, 2), H, { p: [R * 0.12, R * 0.62, -R * 0.05], s: [1.1, 0.42, 1.1], r: [0, 0, -0.22] });
      B.add(sph(R * 0.08, 8, 6), H, { p: [R * 0.2, R * 1.0, 0] });
      B.add(lumpy(sph(R * 0.17, 10, 8), R * 0.02, 10, 2), P.lemon, { p: [-R * 0.35, R * 0.7, R * 0.72], s: [1.2, 1, 0.5] });
      for (const s of [-1, 1]) back(s * 1.3, -0.25, 0.2, hc);
      break;
    }
    case 'bun': {
      back(0, 0.75, 0.62); back(1.0, 0.35, 0.5); back(-1.0, 0.35, 0.5); back(2.4, 0.3, 0.5); back(-2.4, 0.3, 0.5); back(3.14, 0.1, 0.5);
      B.add(lumpy(sph(R * 0.32, 12, 9), R * 0.04, 8, 4), hc, { p: [0, R * 1.18, -R * 0.35] });
      B.add(cap(R * 0.04, R * 0.5, 2, 6), sp.hatColor || P.terra, { p: [0, R * 1.2, -R * 0.35], r: [0, 0, 1.2] });
      break;
    }
    case 'curly': for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; back(Math.sin(a) * 1.9, 0.45 + Math.cos(a * 2) * 0.25 + (i % 3) * 0.12, 0.3); } back(0, 0.95, 0.4); back(3.14, 0.5, 0.4); break;
    case 'pigtails': {
      back(0, 0.8, 0.62); back(1.2, 0.35, 0.5); back(-1.2, 0.35, 0.5); back(3.14, 0.4, 0.55); back(2.2, 0.5, 0.5); back(-2.2, 0.5, 0.5);
      for (const s of [-1, 1]) { B.add(lumpy(sph(R * 0.3, 10, 8), R * 0.04, 8, s), hc, { p: [s * R * 1.12, R * 0.15, -R * 0.15], s: [0.8, 1.25, 0.8] }); B.add(sph(R * 0.1, 8, 6), sp.hatColor || P.terra, { p: [s * R * 0.95, R * 0.35, -R * 0.1] }); }
      break;
    }
    case 'bucket': {
      B.add(lathe([[R * 1.5, -R * 0.05], [R * 1.4, R * 0.02], [R * 0.95, R * 0.1], [R * 0.9, R * 0.5], [R * 0.6, R * 0.68], [0, R * 0.7]], 24), H, { p: [0, R * 0.42, 0], r: [-0.1, 0, 0] });
      for (const s of [-1, 1]) back(s * 1.35, -0.3, 0.2, hc);
      break;
    }
    case 'bald': back(3.14, -0.1, 0.4); for (const s of [-1, 1]) back(s * 1.5, -0.05, 0.28); break;
    case 'ponytail': {
      back(0, 0.75, 0.62); back(1.1, 0.35, 0.5); back(-1.1, 0.35, 0.5); back(3.14, 0.35, 0.55);
      B.add(snake([[0, R * 0.5, -R * 0.85], [0, R * 0.15, -R * 1.25], [0, -R * 0.45, -R * 1.15]], R * 0.2, 12, 8), hc, {});
      break;
    }
    case 'propeller': {
      B.add(new THREE.SphereGeometry(R * 1.02, n(22, 5), n(12, 4), 0, Math.PI * 2, 0, Math.PI * 0.5), sp.hatColor || P.teal, { p: [0, R * 0.12, 0] });
      for (let i = 0; i < 4; i++) B.add(new THREE.SphereGeometry(R * 1.035, n(6, 5), n(12, 4), (i * Math.PI) / 2, Math.PI / 4, 0, Math.PI * 0.5), i % 2 ? P.lemon : P.terra, { p: [0, R * 0.12, 0] });
      B.add(cyl(R * 0.03, R * 0.03, R * 0.25, 6), P.plum, { p: [0, R * 1.22, 0] });
      B.add(box(R * 0.9, R * 0.03, R * 0.14), P.lemon, { p: [0, R * 1.36, 0], r: [0, 0.6, 0.15] });
      break;
    }
    case 'picnic': {
      // Tilly's picnic-table hat: a wide gingham tabletop on a straw crown, with a lemon on top
      for (const s2 of [-1, 1]) back(s2 * 1.3, -0.3, 0.22, hc);
      B.add(cyl(R * 0.62, R * 0.72, R * 0.34, 20), P.straw, { p: [0, R * 0.8, 0], fx: PAPER });
      B.add(new RoundedBoxGeometry(R * 2.5, R * 0.1, R * 2.1, 1, R * 0.04), P.stick, { p: [0, R * 1.0, 0], r: [0.04, 0.1, -0.03], fx: PAPER });
      for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) if ((i + j) % 2 === 0) B.add(box(R * 0.46, R * 0.02, R * 0.46), P.ging, { p: [(i - 2) * R * 0.48, R * 1.06, (j - 1.5) * R * 0.48], r: [0.04, 0.1, -0.03] });
      B.add(lumpy(sph(R * 0.2, 10, 8), R * 0.02, 10, 3), P.lemon, { p: [R * 0.3, R * 1.22, R * 0.1], s: [1.3, 1, 1] });
      break;
    }
    case 'slick': {
      // Preston's slick hair: a glossy swept-back helmet of hair with a side part
      B.add(new THREE.SphereGeometry(R * 1.04, n(20, 6), n(10, 4), 0, Math.PI * 2, 0, Math.PI * 0.42), hc, { p: [0, R * 0.12, -R * 0.06], fx: GLOSS, s: [1, 0.85, 1.05] });
      B.add(lumpy(sph(R * 0.36, 12, 8), R * 0.02, 8, 2), hc, { p: [-R * 0.3, R * 0.85, R * 0.55], s: [1.5, 0.55, 0.8], r: [0, 0, 0.25], fx: GLOSS });
      B.add(cap(R * 0.02, R * 0.6, 2, 4), shade(hc, 0.2), { p: [R * 0.25, R * 0.98, 0], r: [Math.PI / 2, 0, 0] });
      break;
    }
    case 'helmet': {
      // Pro Gear: a hard dome helmet in the team colour with a stripe down the middle
      B.add(new THREE.SphereGeometry(R * 1.1, n(20, 6), n(10, 4), 0, Math.PI * 2, 0, Math.PI * 0.52), H, { p: [0, R * 0.05, 0], fx: GLOSS });
      B.add(new THREE.SphereGeometry(R * 1.12, n(6, 4), n(10, 4), -0.18, 0.36, 0, Math.PI * 0.52), H2, { p: [0, R * 0.05, 0], fx: GLOSS });
      B.add(cyl(R * 1.12, R * 1.14, R * 0.08, 24, true), shade(H, -0.12), { p: [0, R * 0.08, 0] });
      break;
    }
    case 'leafcap': {
      // Peel Patrol: a yellow cap with a green leaf on top, so every head reads as a lemon
      B.add(new THREE.SphereGeometry(R * 1.04, n(22, 6), n(12, 4), 0, Math.PI * 2, 0, Math.PI * 0.5), H, { p: [0, R * 0.12, 0], r: [-0.12, 0, 0] });
      const brim = new THREE.CylinderGeometry(R * 0.72, R * 0.72, R * 0.07, n(20, 6), 1, false, -Math.PI / 2, Math.PI);
      B.add(brim, H, { p: [0, R * 0.2, R * 0.72], r: [0.1, 0, 0], s: [1, 1, 0.9] });
      B.add(lumpy(sph(R * 0.12, 8, 6), R * 0.02, 8, 2), H, { p: [0, R * 1.14, -R * 0.12], s: [1, 1.3, 1] });
      B.add(new THREE.SphereGeometry(R * 0.26, n(10, 5), n(6, 4)), H2, { p: [R * 0.16, R * 1.22, -R * 0.12], s: [1.4, 0.25, 0.6], r: [0, 0.4, 0.35] });
      for (const s2 of [-1, 1]) back(s2 * 1.35, -0.25, 0.22);
      break;
    }
    default: break;
  }
  if (sp.mustache === 'curl') {
    for (const s of [-1, 1]) B.add(snake([[0, 0, 0], [s * R * 0.2, -R * 0.03, 0], [s * R * 0.32, R * 0.04, -R * 0.02], [s * R * 0.28, R * 0.1, -R * 0.03]], R * 0.03, 12, 5), hc, { m: inFrame(onHead(R, 0, -0.23, R * 0.02)) });
  } else if (sp.mustache === 'bushy') {
    for (const s of [-1, 1]) B.add(lumpy(sph(R * 0.16, 10, 8), R * 0.03, 10, s), hc, { m: inFrame(onHead(R, s * 0.16, -0.24, R * 0.04), { s: [1.4, 0.7, 0.7], r: [0, 0, -s * 0.25] }) });
  }
  if (sp.straw) B.add(cyl(R * 0.02, R * 0.02, R * 0.9, 5), P.straw, { m: inFrame(onHead(R, 0.18, -0.38, 0), { p: [R * 0.25, 0, R * 0.32], r: [1.1, 0, -0.6] }) });
  if (sp.earpiece) B.add(snake([[0, 0, 0], [R * 0.06, -R * 0.2, -R * 0.05], [R * 0.02, -R * 0.45, -R * 0.1], [R * 0.08, -R * 0.65, -R * 0.12]], R * 0.03, 12, 5), P.chrome, { fx: GLOSS, p: [-R * 1.0, 0, 0] });
}

function buildHead(sp: Spec, closed: false | 'down') {
  const R = sp.R, B = new Baker();
  if (sp.headShape === 'block') {
    B.add(lumpy(new RoundedBoxGeometry(R * 1.7, R * 1.7, R * 1.65, 4, R * 0.42), R * 0.03, 3 / R, sp.seed), sp.skin, { s: [1, 0.95, 1] });
  } else {
    B.add(lumpy(sph(R, 26, 18), R * 0.025, 2.4 / R, sp.seed), sp.skin, { s: [1, sp.headSquash ?? 0.95, 1] });
  }
  eyes(B, R, sp, closed); brows(B, R, sp); nose(B, R, sp); mouth(B, R, sp); cheeks(B, R, sp); headwear(B, R, sp);
  return B.build();
}

// ---------- bodies ----------
type Band = [C, [number, number][]];
/** A body kind: legs h, shoulder y, neck y, body bands (lathe profiles), arm [radius, length]. */
export interface Kind { leg: number; legR: number; neck: number; R: number; arm: [number, number]; sh: number; shx: number; block?: boolean; bands?: (sp: Spec) => Band[] }
export const KINDS: Record<BodyKind, Kind> = {
  pear: { leg: 0.2, legR: 0.075, neck: 0.78, R: 0.36, arm: [0.07, 0.26], sh: 0.66, shx: 0.25,
    bands: (sp) => [[sp.pants, [[0, 0.14], [0.22, 0.15], [0.29, 0.22], [0.31, 0.34]]], [sp.shirt, [[0.31, 0.34], [0.31, 0.44], [0.27, 0.6], [0.2, 0.72], [0.12, 0.8], [0, 0.82]]]] },
  kid: { leg: 0.14, legR: 0.06, neck: 0.55, R: 0.31, arm: [0.055, 0.2], sh: 0.47, shx: 0.19,
    bands: (sp) => [[sp.pants, [[0, 0.1], [0.17, 0.11], [0.22, 0.17], [0.23, 0.26]]], [sp.shirt, [[0.23, 0.26], [0.22, 0.38], [0.17, 0.5], [0.08, 0.57], [0, 0.58]]]] },
  round: { leg: 0.1, legR: 0.07, neck: 0.66, R: 0.35, arm: [0.075, 0.22], sh: 0.55, shx: 0.3,
    bands: (sp) => [[sp.pants, [[0, 0.06], [0.24, 0.08], [0.36, 0.18], [0.39, 0.3]]], [sp.shirt, [[0.39, 0.3], [0.38, 0.42], [0.32, 0.55], [0.2, 0.64], [0, 0.68]]]] },
  stilt: { leg: 0.56, legR: 0.045, neck: 1.36, R: 0.29, arm: [0.045, 0.4], sh: 1.24, shx: 0.17,
    bands: (sp) => [[sp.pants, [[0, 0.5], [0.12, 0.51], [0.16, 0.58]]], [sp.shirt, [[0.16, 0.58], [0.2, 0.72], [0.17, 0.95], [0.16, 1.15], [0.17, 1.25], [0.12, 1.3]]], [sp.collar || '#ffffff', [[0.12, 1.28], [0.15, 1.33], [0.22, 1.47], [0.2, 1.49], [0.1, 1.38], [0, 1.37]]]] },
  barrel: { leg: 0.16, legR: 0.085, neck: 0.8, R: 0.35, arm: [0.085, 0.27], sh: 0.66, shx: 0.36,
    bands: (sp) => [[sp.pants, [[0, 0.1], [0.3, 0.12], [0.42, 0.25], [0.45, 0.42], [0.42, 0.56]]], [sp.shirt, [[0.42, 0.56], [0.36, 0.68], [0.22, 0.78], [0, 0.82]]]] },
  // Lanky Dex, 3 heads tall: long legs and a long thin trunk, but no Steward collar
  lanky: { leg: 0.5, legR: 0.06, neck: 1.2, R: 0.3, arm: [0.055, 0.42], sh: 1.08, shx: 0.2,
    bands: (sp) => [[sp.pants, [[0, 0.46], [0.15, 0.47], [0.19, 0.56], [0.2, 0.66]]], [sp.shirt, [[0.2, 0.66], [0.21, 0.82], [0.2, 1.0], [0.15, 1.12], [0.08, 1.19], [0, 1.2]]]] },
  block: { leg: 0.22, legR: 0.075, neck: 0.86, R: 0.32, arm: [0.08, 0.3], sh: 0.76, shx: 0.36, block: true },
  bean: { leg: 0.17, legR: 0.06, neck: 0.98, R: 0.31, arm: [0.06, 0.34], sh: 0.86, shx: 0.22,
    bands: (sp) => [[sp.pants, [[0, 0.12], [0.18, 0.13], [0.23, 0.22], [0.24, 0.36]]], [sp.shirt, [[0.24, 0.36], [0.26, 0.55], [0.25, 0.75], [0.2, 0.9], [0.1, 0.98], [0, 1.0]]]] },
  vee: { leg: 0.09, legR: 0.07, neck: 0.8, R: 0.32, arm: [0.1, 0.27], sh: 0.7, shx: 0.42,
    bands: (sp) => [[sp.pants, [[0, 0.06], [0.15, 0.07], [0.19, 0.14], [0.19, 0.24]]], [sp.shirt, [[0.19, 0.24], [0.27, 0.42], [0.42, 0.62], [0.44, 0.7], [0.36, 0.78], [0.15, 0.83], [0, 0.84]]]] },
};

/** The body's radius at height y (from its lathe bands), so gear sits on the surface. */
function radiusAt(sp: Spec, K: Kind, y: number): number {
  if (K.block) return 0.24;
  let best = 0.2, d = Infinity;
  for (const [, pts] of K.bands!(sp)) for (let i = 1; i < pts.length; i++) {
    const [r0, y0] = pts[i - 1], [r1, y1] = pts[i];
    if (y >= Math.min(y0, y1) && y <= Math.max(y0, y1) && y1 !== y0) return (r0 + ((y - y0) / (y1 - y0)) * (r1 - r0)) * (sp.girth ?? 1);
    const dd = Math.abs(y - y0); if (dd < d) { d = dd; best = r0 * (sp.girth ?? 1); }
  }
  return best;
}
/** Bean bodies curve forward as they rise. */
const beanX = (sp: Spec, y: number) => (sp.kind === 'bean' ? Math.sin(y * 3.6) * 0.07 - y * 0.06 : 0);

/** Costume and crew gear pressed onto the body: vests, pads, lanyards, straps, belts. */
function gear(B: Baker, sp: Spec, K: Kind) {
  const chest = K.sh - (K.block ? 0.12 : 0.1), waist = K.leg + (K.sh - K.leg) * 0.3;
  const rc = radiusAt(sp, K, chest), rw = radiusAt(sp, K, waist);
  if (sp.padded) {
    // Padded Vest: a puffy quilted shell 15% rounder than the body, waist to chest
    const y0 = K.leg + (K.sh - K.leg) * 0.12, y1 = K.sh - 0.02, pts: [number, number][] = [];
    for (let i = 0; i <= 6; i++) { const y = y0 + ((y1 - y0) * i) / 6; pts.push([radiusAt(sp, K, y) * 1.15 + 0.015 * Math.sin((i / 6) * Math.PI), y]); }
    pts.unshift([pts[0][0] * 0.9, y0 - 0.02]); pts.push([pts[pts.length - 1][0] * 0.7, y1 + 0.03]);
    let g = lumpy(lathe(pts, 22), 0.008, 6, 9);
    if (sp.kind === 'bean') g = bend(g, (y) => Math.sin(y * 3.6) * 0.07 - y * 0.06);
    B.add(g, sp.padded);
    for (const k of [0.35, 0.68]) { const y = y0 + (y1 - y0) * k; B.add(tor(radiusAt(sp, K, y) * 1.16 + 0.012, 0.012, 4, 22), shade(sp.padded, -0.15), { p: [beanX(sp, y), y, 0], r: [Math.PI / 2, 0, 0] }); }
  }
  if (sp.pads) for (const s2 of [-1, 1]) B.add(new THREE.SphereGeometry(K.arm[0] * 2.1, n(12, 5), n(6, 3), 0, Math.PI * 2, 0, Math.PI * 0.5), sp.pads, { fx: GLOSS, p: [s2 * K.shx * (sp.girth ?? 1) + beanX(sp, K.sh), K.sh - 0.02, 0], s: [1.1, 0.8, 1.1] });
  if (sp.bib) {
    B.add(new THREE.CylinderGeometry(rc * 1.04, rw * 1.06, chest - waist + 0.08, n(18, 5), 1, true, -0.9, 1.8), sp.bib, { p: [beanX(sp, chest), (chest + waist) / 2, 0], fx: PAPER });
    for (const yy of [0.35, 0.65]) { const y = waist + (chest - waist) * yy; B.add(box(radiusAt(sp, K, y) * 1.3, 0.03, 0.02), P.plum, { p: [beanX(sp, y), y, radiusAt(sp, K, y) * 1.02 + 0.01] }); }
  }
  if (sp.houses) {
    // Skip Larkin: tiny houses printed all over the blazer
    for (let i = 0; i < 9; i++) {
      const a = -1.3 + (i % 3) * 1.3 + (Math.floor(i / 3) % 2) * 0.6, y = waist + (chest - waist) * (0.1 + Math.floor(i / 3) * 0.4), r = radiusAt(sp, K, y) + 0.008;
      const m = new THREE.Matrix4().compose(new THREE.Vector3(Math.sin(a) * r, y, Math.cos(a) * r), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, a, 0)), new THREE.Vector3(1, 1, 1));
      B.add(box(0.05, 0.04, 0.012), i % 2 ? P.cream : P.lemon, { m });
      B.add(new THREE.ConeGeometry(0.04, 0.03, 4), P.terra, { m: m.clone().multiply(new THREE.Matrix4().compose(new THREE.Vector3(0, 0.035, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 4, 0)), new THREE.Vector3(1, 1, 0.35))) });
    }
  }
  if (sp.lapelPin) B.add(sph(0.022, 6, 5), sp.lapelPin, { fx: GLOSS, p: [-0.14 + beanX(sp, chest), chest + 0.02, rc * 0.97] });
  if (sp.lanyard) {
    const y0 = K.sh + 0.02, r0 = radiusAt(sp, K, y0 - 0.02) * 0.7;
    B.add(snake([[-r0, y0, 0.02], [-0.04, chest - 0.08, rc + 0.01], [0.04, chest - 0.08, rc + 0.01], [r0, y0, 0.02]], 0.01, 10, 4), sp.lanyard, {});
    B.add(new RoundedBoxGeometry(0.08, 0.1, 0.012, 1, 0.01), '#ffffff', { p: [0, chest - 0.14, rc + 0.02], fx: PAPER });
    B.add(box(0.05, 0.02, 0.004), sp.lanyard, { p: [0, chest - 0.115, rc + 0.028] });
  }
  if (sp.camera) {
    const y0 = K.sh + 0.02, r0 = radiusAt(sp, K, y0 - 0.02) * 0.75;
    B.add(snake([[-r0, y0, 0.02], [0, chest - 0.1, rc + 0.02], [r0, y0, 0.02]], 0.01, 10, 4), P.plum, {});
    B.add(new RoundedBoxGeometry(0.17, 0.11, 0.07, 2, 0.02), P.plum, { p: [0, chest - 0.13, rc + 0.04] });
    B.add(cyl(0.035, 0.04, 0.05, 12), P.chrome, { fx: GLOSS, p: [0, chest - 0.13, rc + 0.09], r: [Math.PI / 2, 0, 0] });
    B.add(sph(0.012, 5, 4), P.terra, { p: [0.06, chest - 0.08, rc + 0.06] });
  }
  if (sp.backpack) {
    const y = (chest + waist) / 2, r = radiusAt(sp, K, y);
    B.add(lumpy(new RoundedBoxGeometry(r * 1.3, (chest - waist) * 1.3, 0.16, 2, 0.05), 0.006, 8, 3), sp.backpack, { p: [beanX(sp, y), y + 0.02, -r - 0.06] });
    B.add(new RoundedBoxGeometry(r * 0.9, 0.1, 0.06, 1, 0.02), shade(sp.backpack, -0.1), { p: [beanX(sp, y), y - 0.06, -r - 0.15] });
    for (const s2 of [-1, 1]) B.add(snake([[s2 * r * 0.4, chest + 0.06, -r * 0.5], [s2 * r * 0.55, chest + 0.06, r * 0.4], [s2 * r * 0.5, waist + 0.05, r * 0.85]], 0.016, 8, 4), shade(sp.backpack, -0.1), {});
  }
  if (sp.toolbelt) {
    // Wreckers: a tool belt with a clay hammer and a pouch
    B.add(tor(rw * 1.0, 0.025, 5, 22), P.walnut, { p: [beanX(sp, waist), waist, 0], r: [Math.PI / 2, 0, 0] });
    B.add(new RoundedBoxGeometry(0.1, 0.1, 0.05, 1, 0.02), P.walnut, { p: [rw * 0.7, waist - 0.06, rw * 0.72] });
    B.add(cyl(0.012, 0.012, 0.16, 5), P.stick, { p: [-rw * 0.75, waist - 0.07, rw * 0.7], fx: PAPER });
    B.add(box(0.07, 0.03, 0.03), P.chrome, { p: [-rw * 0.75, waist + 0.01, rw * 0.7], fx: GLOSS });
  }
  if (sp.binoculars) {
    for (const s2 of [-1, 1]) B.add(cyl(0.03, 0.035, 0.09, 10), P.plum, { p: [s2 * 0.035, chest - 0.05, rc + 0.04] });
    B.add(snake([[-rc * 0.6, K.sh + 0.03, 0], [0, chest - 0.02, rc + 0.02], [rc * 0.6, K.sh + 0.03, 0]], 0.008, 8, 4), P.plum, {});
  }
  if (sp.whistle) {
    B.add(snake([[-rc * 0.55, K.sh + 0.03, 0], [0, chest - 0.06, rc + 0.01], [rc * 0.55, K.sh + 0.03, 0]], 0.008, 8, 4), P.terra, {});
    B.add(sph(0.03, 8, 6), P.chrome, { fx: GLOSS, p: [0, chest - 0.08, rc + 0.03], s: [1.3, 1, 1] });
  }
}

function buildBody(sp: Spec, K: Kind) {
  const B = new Baker();
  if (K.block) {
    B.add(lumpy(new RoundedBoxGeometry(0.72, 0.62, 0.46, 3, 0.13), 0.012, 4, sp.seed), sp.shirt, { p: [0, 0.53, 0], s: [sp.girth ?? 1, 1, 1] });
    B.add(new RoundedBoxGeometry(0.5, 0.2, 0.36, 2, 0.07), sp.pants, { p: [0, 0.23, 0] });
    // lapels, tie, chrome bubble buttons
    for (const s of [-1, 1]) B.add(box(0.14, 0.32, 0.04), shade(sp.shirt, -0.08), { p: [s * 0.11, 0.66, 0.235], r: [0, 0, s * 0.35] });
    B.add(box(0.09, 0.36, 0.04), '#ffffff', { p: [0, 0.68, 0.225] });
    B.add(new THREE.ConeGeometry(0.06, 0.3, n(4, 4)), P.plum, { p: [0, 0.62, 0.25], r: [Math.PI, 0, 0] });
    for (const [x, y, r] of [[-0.22, 0.42, 0.04], [0.24, 0.5, 0.03], [-0.25, 0.65, 0.025], [0.2, 0.36, 0.035], [0.27, 0.72, 0.02]]) B.add(sph(r, 8, 6), P.chrome, { fx: GLOSS, p: [x, y, 0.235] });
    B.add(cyl(0.035, 0.035, 0.32, 8), P.plum, { fx: GLOSS, p: [0.3, 0.3, 0.12], r: [0.2, 0, 0.1] });
  } else {
    const gx = sp.girth ?? 1;
    for (const [col, pts] of K.bands!(sp)) {
      let g = lumpy(lathe(pts, 24), 0.01, 5, sp.seed);
      if (sp.kind === 'bean') g = bend(g, (y) => Math.sin(y * 3.6) * 0.07 - y * 0.06);
      B.add(g, col, { s: [gx, 1, gx] });
    }
  }
  gear(B, sp, K);
  // costume details
  if (sp.apron) {
    const kid = sp.kind === 'kid', y0 = kid ? 0.2 : K.leg + 0.12;
    const r = kid ? 0.235 : sp.kind === 'pear' ? 0.31 : radiusAt(sp, K, y0 + 0.08) + 0.012;
    B.add(new THREE.CylinderGeometry(r * 1.03, r * 1.1, kid ? 0.26 : 0.34, n(18, 5), 1, true, -0.95, 1.9), sp.apron, { p: [beanX(sp, y0), y0, 0], fx: PAPER });
    B.add(new RoundedBoxGeometry(r * 0.95, kid ? 0.16 : 0.2, 0.04, 2, 0.02), sp.apron, { p: [0, y0 + (kid ? 0.2 : 0.26), r * 0.86], r: [-0.25, 0, 0] });
    for (const s2 of [-1, 1]) B.add(box(0.03, 0.2, 0.02), sp.apron, { p: [s2 * r * 0.42, y0 + (kid ? 0.3 : 0.38), r * 0.7], r: [-0.5, 0, s2 * 0.2] });
    B.add(lumpy(sph(0.05, 8, 6), 0.004, 20, 1), P.lemon, { p: [0, y0 - 0.02, r * 1.08], s: [1.3, 1, 0.5] });
    B.add(sph(0.018, 5, 4), P.green, { p: [0.04, y0 + 0.03, r * 1.1] });
  }
  if (sp.overalls) { for (const s of [-1, 1]) B.add(box(0.06, 0.36, 0.04), sp.pants, { p: [s * 0.16, 0.66, 0.29], r: [0.45, 0, s * 0.15] }); B.add(new RoundedBoxGeometry(0.34, 0.22, 0.06, 2, 0.03), sp.pants, { p: [0, 0.56, 0.38], r: [0.25, 0, 0] }); for (const s of [-1, 1]) B.add(sph(0.025, 6, 4), P.gold, { fx: GLOSS, p: [s * 0.13, 0.63, 0.37] }); }
  if (sp.gingham) { for (let i = 0; i < 10; i++) { const a = -1.3 + (i % 5) * 0.65, yy = 0.64 + Math.floor(i / 5) * 0.08; B.add(box(0.05, 0.05, 0.02), i % 2 ? P.ging : '#ffffff', { p: [Math.sin(a) * 0.37, yy, Math.cos(a) * 0.37], r: [0, a, 0] }); } }
  if (sp.damask) { for (const [a, y] of [[-0.35, 0.8], [0.35, 0.8], [0, 0.95], [-0.35, 1.1], [0.35, 1.1], [0, 0.66]]) B.add(new THREE.OctahedronGeometry(0.03), P.gold, { fx: GLOSS, p: [Math.sin(a) * 0.19, y, Math.cos(a) * 0.19], s: [1, 1.5, 0.5] }); B.add(cap(0.01, 0.1, 2, 4), P.gold, { p: [0.1, 1.05, 0.15], r: [0, 0, 1.2] }); }
  if (sp.waves) { const pts: V3[] = []; for (let i = 0; i <= 12; i++) { const a = -1.4 + (i / 12) * 2.8; pts.push([Math.sin(a) * 0.395, 0.56 + Math.sin(i * 1.6) * 0.03, Math.cos(a) * 0.395]); } B.add(snake(pts, 0.025, 40, 5), sp.waves); }
  if (sp.zigzag) { const pts: V3[] = []; for (let i = 0; i <= 10; i++) { const a = -1.2 + (i / 10) * 2.4; pts.push([Math.sin(a) * 0.27 + Math.sin(0.6 * 3.6) * 0.07 - 0.036, 0.6 + (i % 2 ? 0.05 : -0.05), Math.cos(a) * 0.27]); } B.add(snake(pts, 0.022, 40, 5), sp.zigzag, { fx: 0.5 }); }
  if (sp.vest) { B.add(new THREE.CylinderGeometry(0.27, 0.32, 0.36, n(18, 5), 1, true, -1.1, 2.2), sp.vest, { p: [0, 0.5, 0], s: [1.04, 1, 1.04] }); for (const yy of [0.42, 0.52]) B.add(box(0.36, 0.035, 0.02), '#ffffff', { fx: 0.3, p: [0, yy, 0.31] }); B.add(sph(0.045, 8, 6), P.gold, { fx: GLOSS, p: [-0.12, 0.62, 0.27] }); B.add(cyl(0.015, 0.015, 0.12, 5), P.plum, { p: [0.12, 0.66, 0.25], r: [0.3, 0, 0] }); }
  if (sp.pearls) for (let i = 0; i < 11; i++) { const a = -1.2 + (i / 10) * 2.4; B.add(sph(0.028, 6, 5), '#ffffff', { fx: GLOSS, p: [Math.sin(a) * 0.2, 0.62 - Math.cos(a * 0.5) * 0.04, Math.cos(a) * 0.2 + 0.02] }); }
  if (sp.cardigan) { for (const s of [-1, 1]) B.add(new THREE.CylinderGeometry(0.33, 0.39, 0.34, n(16, 5), 1, true, s > 0 ? 0.15 : -1.45, 1.3), sp.cardigan, { p: [0, 0.42, 0], s: [1.03, 1, 1.03] }); for (const yy of [0.32, 0.42, 0.5]) B.add(sph(0.022, 6, 4), P.cream, { p: [0.07, yy, 0.38] }); }
  if (sp.hood) B.add(tor(0.17, 0.07, 8, 16), sp.shirt, { p: [-0.08, 0.98, -0.05], r: [Math.PI / 2 + 0.3, 0, 0] });
  if (sp.tails) B.add(new THREE.CylinderGeometry(0.17, 0.24, 0.42, n(14, 5), 1, true, Math.PI - 0.8, 1.6), sp.shirt, { p: [0, 0.56, -0.01] });
  if (sp.crossed) {
    const ar = K.arm[0];
    B.add(cap(ar * 1.05, 0.36, 4, 8), sp.sleeve || sp.shirt, { p: [0, K.sh - 0.13, 0.27], r: [0.05, 0, Math.PI / 2 + 0.12] });
    B.add(cap(ar * 1.05, 0.36, 4, 8), sp.sleeve || sp.shirt, { p: [0, K.sh - 0.17, 0.3], r: [-0.05, 0, Math.PI / 2 - 0.15] });
    for (const s of [-1, 1]) B.add(sph(ar * 1.1, 10, 8), sp.glove || sp.skin, { p: [s * 0.2, K.sh - 0.14 + s * 0.02, 0.3] });
  }
  return B.build();
}

function buildArm(sp: Spec, K: Kind, flex: boolean) {
  const [ar, al] = K.arm, B = new Baker();
  const sleeve = sp.sleeve || sp.shirt, hand = sp.glove || sp.skin;
  if (flex) {
    B.add(cap(ar, al * 0.5, 4, 8), sleeve, { p: [0, -al * 0.3, 0] });
    B.add(lumpy(sph(ar * 1.45, 12, 9), ar * 0.1, 30, 2), sp.skin, { p: [0, -al * 0.42, ar * 0.5] });
    B.add(cap(ar * 0.9, al * 0.45, 4, 8), sp.skin, { p: [0, -al * 0.62, al * 0.28], r: [Math.PI / 2, 0, 0] });
    B.add(sph(ar * 1.25, 10, 8), hand, { p: [0, -al * 0.62, al * 0.62] });
  } else {
    B.add(cap(ar, al, 4, 8), sleeve, { p: [0, -al * 0.5 - ar * 0.2, 0] });
    if (sp.kind === 'vee') B.add(lumpy(sph(ar * 1.35, 12, 9), ar * 0.1, 30, 2), sp.skin, { p: [0, -al * 0.35, ar * 0.2] });
    if (sp.shortSleeve) B.add(cap(ar * 1.02, al * 0.55, 4, 8), sp.skin, { p: [0, -al * 0.75, 0] });
    B.add(sph(ar * 1.25, 10, 8), hand, { p: [0, -al - ar * 0.6, 0], s: [1, 1.05, 0.9] });
    if (sp.cuff) B.add(tor(ar * 1.0, ar * 0.25, 6, 12), sp.cuff, { p: [0, -al - ar * 0.05, 0], r: [Math.PI / 2, 0, 0] });
    if (sp.tape) for (let i = 0; i < 3; i++) B.add(tor(ar * 1.12, ar * 0.16, 5, 12), sp.tape, { fx: PAPER, p: [0, -al - ar * (0.25 + i * 0.32), 0], r: [Math.PI / 2 + (i - 1) * 0.25, 0, 0] });
    // sleeve chevrons: one per level above Rookie, up to four for a Legend
    for (let i = 0; i < Math.min(4, sp.chevrons ?? 0); i++) {
      const y = -al * 0.18 - i * ar * 0.62, r = ar * 1.06;
      B.add(snake([[-r, y + ar * 0.3, 0.0], [0, y, r], [r, y + ar * 0.3, 0]], ar * 0.14, 8, 4), sp.chevronColor || P.lemon, { fx: 0.3 });
    }
  }
  return B.build();
}
function buildLeg(sp: Spec, K: Kind) {
  const B = new Baker(), r = K.legR, h = K.leg;
  if (h > 0.02) B.add(cap(r, Math.max(0.01, h - r), 3, 8), sp.legColor || sp.pants, { p: [0, -h * 0.5, 0] });
  B.add(lumpy(sph(r * 1.55, 12, 8), r * 0.08, 20, 3), sp.shoes || P.plum, { p: [0, -h + r * 0.3, r * 0.75], s: [1, 0.62, 1.45] });
  return B.build();
}

// ---------- props ----------
export type PropName = 'cane' | 'shovel' | 'fan' | 'glass' | 'cup' | 'coffee' | 'skateboard' | 'surfboard' | 'baton' | 'whistle';
export const PROPS: Record<PropName, (B: Baker) => void> = {
  cane(B) { B.add(cyl(0.022, 0.022, 0.92, 8), P.plum, { fx: GLOSS, p: [0, -0.46, 0] }); B.add(sph(0.05, 10, 8), P.gold, { fx: GLOSS, p: [0, 0.02, 0] }); B.add(cyl(0.03, 0.03, 0.03, 8), P.gold, { p: [0, -0.92, 0] }); },
  shovel(B) { B.add(cyl(0.03, 0.03, 1.25, 8), P.stick, { fx: PAPER, p: [0, 0.62, 0] }); B.add(tor(0.07, 0.025, 6, 12), P.stick, { fx: PAPER, p: [0, 1.28, 0] }); const bl = lathe([[0, -0.32], [0.12, -0.26], [0.15, -0.05], [0.13, 0.04], [0.04, 0.06], [0, 0.06]], 16); B.add(bl, P.chrome, { s: [1, 1, 0.25], p: [0, 0.02, 0], fx: GLOSS }); },
  fan(B) { for (let i = 0; i < 7; i++) B.add(box(0.05, 0.28, 0.012).translate(0, 0.16, 0), i % 2 ? P.terra : P.cream, { fx: PAPER, r: [0, 0, (i - 3) * 0.22] }); B.add(sph(0.03, 6, 4), P.walnut, {}); },
  glass(B) { B.add(cyl(0.06, 0.05, 0.16, 12), P.lemon, { fx: GLOSS, p: [0, 0.08, 0] }); B.add(sph(0.035, 6, 5), P.green, { p: [0.04, 0.17, 0] }); B.add(cyl(0.008, 0.008, 0.18, 4), P.terra, { p: [-0.02, 0.18, 0], r: [0, 0, 0.3] }); },
  cup(B) { B.add(cyl(0.075, 0.055, 0.17, 12), '#ffffff', { fx: PAPER, p: [0, 0.08, 0] }); B.add(cyl(0.076, 0.07, 0.05, 12, true), P.lemon, { fx: PAPER, p: [0, 0.1, 0] }); B.add(cyl(0.01, 0.01, 0.16, 4), P.terra, { p: [0.02, 0.2, 0], r: [0, 0, -0.3] }); B.add(sph(0.03, 6, 5), P.lemon, { p: [-0.05, 0.17, 0] }); },
  coffee(B) { B.add(cyl(0.07, 0.055, 0.2, 12), P.cream, { fx: GLOSS, p: [0, 0.1, 0] }); B.add(cyl(0.065, 0.06, 0.12, 12), P.esp, { fx: GLOSS, p: [0, 0.08, 0] }); B.add(cyl(0.075, 0.075, 0.03, 12), P.neon, { p: [0, 0.2, 0] }); B.add(cyl(0.01, 0.01, 0.16, 4), P.neon, { p: [0.02, 0.28, 0] }); },
  skateboard(B) { B.add(new RoundedBoxGeometry(0.34, 0.05, 1.0, 2, 0.02), P.plum, { p: [0, 0.11, 0] }); B.add(box(0.3, 0.012, 0.6), P.neon, { p: [0, 0.14, 0], fx: 0.3 }); for (const z of [-0.33, 0.33]) for (const x of [-0.13, 0.13]) B.add(cyl(0.045, 0.045, 0.05, 12), P.oat, { p: [x, 0.045, z], r: [0, 0, Math.PI / 2] }); },
  surfboard(B) { const g = lumpy(sph(0.28, 18, 12), 0.005, 4, 2); B.add(g, P.lagoon, { s: [0.8, 3.3, 0.16], p: [0, 0.92, 0] }); B.add(box(0.05, 1.6, 0.06), P.mango, { p: [0, 0.92, 0.04] }); B.add(new THREE.ConeGeometry(0.06, 0.18, n(6, 4)), P.mango, { p: [0, 0.3, -0.06], r: [Math.PI / 2 + 0.3, 0, 0] }); },
  baton(B) { B.add(cyl(0.03, 0.03, 0.4, 8), P.plum, { fx: GLOSS, p: [0, -0.2, 0] }); },
  whistle(B) { B.add(sph(0.04, 8, 6), P.chrome, { fx: GLOSS }); },
};
const propCache = new Map<PropName, THREE.BufferGeometry>();
/** A baked prop mesh (shared geometry per prop). */
export function propMesh(name: PropName, mat: THREE.Material): THREE.Mesh {
  let g = propCache.get(name);
  if (!g) { const B = new Baker(); PROPS[name](B); g = B.build(); propCache.set(name, g); }
  const m = new THREE.Mesh(g, mat); m.castShadow = true; return m;
}

// ---------- the figure ----------
let SEED = 1;
const FLEX_R = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, -1), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0));
const FLEX_L = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0));

/** pose() input: lift, sq (squash 0..), lean, sway, headYaw/Tilt/Roll, arms [x, z, y?], legs x, shut (eyes). */
export interface Pose {
  lift?: number; sq?: number; lean?: number; sway?: number;
  headYaw?: number; headTilt?: number; headRoll?: number;
  aL?: [number, number, number?]; aR?: [number, number, number?];
  lL?: number; lR?: number; shut?: boolean;
}
interface Parts { body: THREE.BufferGeometry; headOpen: THREE.BufferGeometry; headShut: THREE.BufferGeometry; arm: THREE.BufferGeometry; armFlex: THREE.BufferGeometry | null; leg: THREE.BufferGeometry; detail: number; faces: Map<Face, THREE.BufferGeometry> }
const partsCache = new Map<string, Parts>();

export interface FigureOptions {
  /** Resting scale of the root (userData.base). */
  scale?: number;
  /** Share baked geometry with every other figure built from the same spec and seed (default true). */
  share?: boolean;
  /** Segment detail, 1 = the mockup (about 6-8k triangles), 0.5 for crowds (about a third of that). */
  detail?: number;
}

export class Figure {
  readonly sp: Spec;
  readonly K: Kind;
  readonly mat: THREE.Material;
  readonly root = new THREE.Group();
  readonly rig = new THREE.Group();
  readonly body: THREE.Mesh;
  readonly neck = new THREE.Group();
  readonly head: THREE.Mesh;
  /** [L (-x), R (+x)] shoulder pivots */
  readonly arms: THREE.Group[] = [];
  /** [L (-x), R (+x)] hip pivots */
  readonly legs: THREE.Group[] = [];
  /** right (+x) mitten, where hold() puts props */
  readonly hand = new THREE.Group();
  readonly handL = new THREE.Group();
  readonly height: number;
  readonly id: number;
  private parts: Parts;
  private blinkAt: number;
  flexing = false;
  /** The face showing now (see face()). */
  current: Face = 'neutral';

  constructor(spec: FigureSpec, mat: THREE.Material, opts: FigureOptions = {}) {
    const kind = spec.kind ?? 'pear';
    const K = KINDS[kind];
    const sp = { kind, skin: P.skin, shirt: P.terra, pants: P.denim, shoes: P.plum, hairColor: P.walnut, eyes: 'bead', brows: 'up', mouth: 'smile', nose: 'button', ...spec } as Spec;
    sp.seed = spec.seed ?? SEED++;
    sp.R = spec.R || K.R;
    sp.skin2 = spec.skin2 || shade(sp.skin, -0.07);
    this.sp = sp; this.K = K; this.mat = mat;
    const detail = opts.detail ?? 1;
    const key = JSON.stringify(sp) + detail;
    let parts = opts.share === false ? undefined : partsCache.get(key);
    if (!parts) {
      DETAIL = detail;
      try {
        parts = { body: buildBody(sp, K), headOpen: buildHead(sp, false), headShut: buildHead(sp, 'down'), arm: buildArm(sp, K, false), armFlex: kind === 'vee' ? buildArm(sp, K, true) : null, leg: buildLeg(sp, K), detail, faces: new Map() };
      } finally { DETAIL = 1; }
      if (opts.share !== false) partsCache.set(key, parts);
    }
    this.parts = parts;
    this.root.add(this.rig);
    this.body = new THREE.Mesh(parts.body, mat); this.body.castShadow = true; this.rig.add(this.body);
    const bx = (yy: number) => (kind === 'bean' ? Math.sin(yy * 3.6) * 0.07 - yy * 0.06 : 0);
    this.neck.position.set(bx(K.neck), K.neck, kind === 'bean' ? 0.06 : 0); this.rig.add(this.neck);
    this.head = new THREE.Mesh(parts.headOpen, mat); this.head.position.y = sp.R * 0.88; this.head.castShadow = true; this.neck.add(this.head);
    for (const s of [-1, 1]) {
      const piv = new THREE.Group(); piv.position.set(s * K.shx * (sp.girth ?? 1) + bx(K.sh), K.sh, kind === 'bean' ? 0.03 : 0);
      const m = new THREE.Mesh(parts.arm, mat); m.castShadow = true; piv.add(m); this.rig.add(piv); this.arms.push(piv);
      if (sp.crossed) piv.visible = false;
    }
    for (const s of [-1, 1]) {
      const piv = new THREE.Group(); piv.position.set(s * (K.legR * 1.4 + 0.03) * (kind === 'barrel' ? 1.5 : 1), K.leg, 0);
      const m = new THREE.Mesh(parts.leg, mat); m.castShadow = true; piv.add(m); this.rig.add(piv); this.legs.push(piv);
    }
    this.hand.position.y = -K.arm[1] - K.arm[0] * 0.6; this.arms[1].add(this.hand);
    this.handL.position.y = -K.arm[1] - K.arm[0] * 0.6; this.arms[0].add(this.handL);
    this.height = K.neck + sp.R * 1.9;
    this.blinkAt = 2 + hash(sp.seed, 3) * 4;
    this.id = sp.seed;
    const base = opts.scale ?? 1;
    this.root.scale.setScalar(base);
    Object.assign(this.root.userData, {
      limbs: [this.legs[0], this.legs[1], this.arms[0], this.arms[1]],
      base, head: this.neck, hands: [this.handL, this.hand], rig: this.rig, figure: this,
      /** Bay View draws each figure as one speck in this colour. */ speckColor: sp.shirt,
    });
  }
  /** Put a prop in the right mitten (or the left). */
  hold(name: PropName, left = false) { const m = propMesh(name, this.mat); (left ? this.handL : this.hand).add(m); return m; }
  /** Blender double-bicep: swap in the bent arm and point the forearms up (call after pose) */
  flex(on: boolean) {
    if (!this.parts.armFlex) return;
    this.flexing = on;
    for (const a of this.arms) (a.children[0] as THREE.Mesh).geometry = on ? this.parts.armFlex : this.parts.arm;
    if (on) { this.arms[1].quaternion.setFromRotationMatrix(FLEX_R); this.arms[0].quaternion.setFromRotationMatrix(FLEX_L); }
  }
  /** Pose on twos: f is the twos frame (floor(seconds * 12)); the boil jitter changes only when f does. */
  pose(o: Pose, f: number) {
    const b = this.id * 7.3 + f * 1.7;
    const j = (k: number) => (hash(b, k) - 0.5);
    const sq = o.sq || 0;
    this.rig.position.set(j(1) * 0.008, (o.lift || 0), j(2) * 0.008);
    this.rig.scale.set(1 + sq * 0.5 + j(3) * 0.016, 1 - sq + j(4) * 0.016, 1 + sq * 0.5 + j(5) * 0.016);
    this.rig.rotation.set(o.lean || 0, 0, (o.sway || 0) + j(6) * 0.012);
    this.neck.rotation.set((o.headTilt || 0) + j(7) * 0.02, (o.headYaw || 0) + j(8) * 0.02, (o.headRoll || 0) + j(9) * 0.02);
    const aL = o.aL || [0, 0.12], aR = o.aR || [0, -0.12];
    this.arms[0].rotation.set(aL[0] + j(10) * 0.04, aL[2] || 0, aL[1]);
    this.arms[1].rotation.set(aR[0] + j(11) * 0.04, aR[2] || 0, aR[1]);
    this.legs[0].rotation.x = o.lL || 0; this.legs[1].rotation.x = o.lR || 0;
    this.blink(f, o.shut);
  }
  /**
   * Swap the whole face: neutral, yum, pucker, brain-freeze, price-shock (eyes pop) or KO
   * (spiral eyes). Each face is baked once per spec and shared. Only neutral blinks.
   */
  face(name: Face) {
    this.current = name;
    if (name === 'neutral') { this.head.geometry = this.parts.headOpen; return; }
    this.head.geometry = this.faceGeometry(name);
  }
  private faceGeometry(name: Face): THREE.BufferGeometry {
    let g = this.parts.faces.get(name);
    if (!g) {
      const o = FACES[name];
      const sp = { ...this.sp, ...o } as Spec;
      // shades stay on for the quiet faces; glasses stay on over any eyes
      if (this.sp.eyes === 'shades' && name !== 'shock' && name !== 'ko') sp.eyes = 'shades';
      if (this.sp.eyes === 'glasses') sp.glassesToo = true;
      DETAIL = this.parts.detail;
      try { g = buildHead(sp, false); } finally { DETAIL = 1; }
      this.parts.faces.set(name, g);
    }
    return g;
  }
  /** Blinks on twos: a shut-eye frame or two every few seconds (pose() calls this; call it alone if you pose limbs yourself). */
  blink(f: number, shut = false) {
    if (this.current !== 'neutral') return;
    const t = f / 12;
    const closed = shut || (t > this.blinkAt && t < this.blinkAt + 0.17);
    if (t > this.blinkAt + 0.17) this.blinkAt = t + 2.5 + hash(this.id, f) * 4;
    this.head.geometry = closed ? this.parts.headShut : this.parts.headOpen;
  }
  /** Triangles drawn for this figure (open head). */
  triangles() {
    const tri = (g: THREE.BufferGeometry) => (g.index ? g.index.count : g.attributes.position.count) / 3;
    const p = this.parts;
    return tri(p.body) + tri(p.headOpen) + 2 * tri(p.arm) + 2 * tri(p.leg);
  }
}

// ---------- gaits (all evaluated on twos) ----------
export type Gait = 'glide' | 'roll' | 'march' | 'skate' | 'hop' | 'skip' | 'bob';
const s8 = (x: number) => { const c = Math.cos(x); return Math.pow(Math.abs(c), 10); };
/** Walk cycle: ph is the stride phase, f the twos frame, tq = f / 12. */
export function gait(fig: Figure, g: Gait, ph: number, f: number, tq: number) {
  const s = Math.sin(ph), c = s8(ph), a = Math.abs(s);
  switch (g) {
    case 'glide': return fig.pose({ lift: a * 0.012, sq: c * 0.04, lean: -0.06, lL: s * 0.22, lR: -s * 0.22, aL: [-s * 0.08, 0.06], aR: [0.15, -0.1], headTilt: -0.12, headYaw: Math.sin(tq * 0.7) * 0.15 }, f);
    case 'roll': return fig.pose({ lift: a * 0.03, sq: c * 0.08, sway: s * 0.17, lL: s * 0.38, lR: -s * 0.38, aL: [-s * 0.3, 0.35], aR: [s * 0.3, -0.35], headRoll: -s * 0.1 }, f);
    case 'march': { const m = Math.sin(tq * 7); const mm = Math.sign(m) * Math.pow(Math.abs(m), 0.4); return fig.pose({ lift: Math.abs(m) * 0.03, sq: s8(tq * 7) * 0.08, lL: mm * 0.6, lR: -mm * 0.6, aL: [-mm * 0.65, 0.08], aR: [mm * 0.65, -0.08], headYaw: 0 }, f); }
    case 'skate': { const k = Math.sin(tq * 2.2); const kick = Math.max(0, Math.sin(tq * 1.1)) > 0.92; return fig.pose({ lift: 0.12, sway: k * 0.06, lean: 0.12, lL: kick ? -0.6 : 0.1, lR: -0.15, aL: [0.2, 0.5 + k * 0.1], aR: [-0.2, -0.5 + k * 0.1], headTilt: 0.15 + k * 0.05, headRoll: k * 0.08 }, f); }
    case 'hop': { const hp = Math.abs(Math.sin(ph * 0.5)); const land = Math.pow(1 - hp, 8); return fig.pose({ lift: hp * 0.32, sq: land * 0.14 - hp * 0.06, lL: -hp * 0.5, lR: -hp * 0.5, aL: [-hp * 0.8, 0.5 + hp * 0.5], aR: [-hp * 0.8, -0.5 - hp * 0.5], headTilt: -hp * 0.1 }, f); }
    case 'skip': return fig.pose({ lift: a * 0.11, sq: c * 0.1, sway: s * 0.06, lL: s * 0.6, lR: -s * 0.6, aL: [-s * 0.7, 0.25], aR: [s * 0.7, -0.25], headRoll: s * 0.08 }, f);
    default: return fig.pose({ lift: a * 0.05, sq: c * 0.08, sway: s * 0.05, lL: s * 0.5, lR: -s * 0.5, aL: [-s * 0.45, 0.12], aR: [s * 0.45, -0.12], headRoll: s * 0.04 }, f);
  }
}
export const GAIT_OF: Record<BodyKind, Gait> = { pear: 'bob', kid: 'skip', round: 'roll', stilt: 'glide', barrel: 'roll', block: 'march', bean: 'skate', vee: 'hop', lanky: 'bob' };

/** Quantise a smooth clock to twos: returns [f, tq]. */
export const onTwos = (seconds: number): [number, number] => { const f = Math.floor(seconds * 12); return [f, f / 12]; };

// ---------- the cast (the mockup's specs; bosses double as the crews' looks) ----------
export const SPECS = {
  lottie: { kind: 'round', skin: '#F8D3B0', shirt: '#9C8AD0', cardigan: P.lemon, pants: '#9C8AD0', shoes: P.terra, hairColor: '#F4EEE6', browColor: '#E6DDD2', hat: 'sunhat', hatColor: P.straw, bandColor: P.terra, eyes: 'glasses', brows: 'worried', mouth: 'smile', nose: 'button', noseR: 0.15, pearls: true, browUp: 0.42 },
  kid: { kind: 'kid', skin: '#F2C29A', shirt: P.teal, pants: P.denim, shoes: P.terra, hairColor: '#7A4A2A', hat: 'cap', hatColor: P.lemon, hatColor2: P.white, apron: P.white, eyes: 'bead', eyeR: 0.15, brows: 'up', mouth: 'gap', freckles: true },
  sourwood: { kind: 'stilt', skin: '#F3D9C4', shirt: P.sw, pants: '#3a1d47', collar: '#ffffff', shoes: '#22202e', hairColor: '#2a2030', hat: 'bowler', hatColor: '#2a1f3a', glove: '#ffffff', eyes: 'lids', lidTilt: -0.15, brows: 'proud', mouth: 'smirk', nose: 'long', mustache: 'curl', damask: true, tails: true, cuff: '#ffffff' },
  hollis: { kind: 'barrel', skin: '#E9B48A', shirt: P.ging, pants: P.tea, shoes: P.walnut, hairColor: '#C7652E', hat: 'straw', hatColor: P.straw, eyes: 'bead', brows: 'up', mouth: 'smile', nose: 'potato', mustache: 'bushy', overalls: true, gingham: true, straw: true, shortSleeve: false },
  fizzco: { kind: 'block', headShape: 'block', skin: '#EDC3A0', shirt: P.cola, pants: '#2b2b38', shoes: '#1d1d26', hairColor: '#2b2b38', hat: 'flattop', eyes: 'shades', brows: 'flat', browUp: 0.5, mouth: 'flat', nose: 'square', earpiece: true, sleeve: P.cola },
  coldbrew: { kind: 'bean', skin: '#C98E66', shirt: P.esp, pants: P.oat, shoes: P.neon, hairColor: '#1e1612', hat: 'beanie', hatColor: P.oat, eyes: 'lids', brows: 'flat', mouth: 'smirk', nose: 'button', zigzag: P.neon, hood: true },
  blenders: { kind: 'vee', skin: '#E7A16E', shirt: P.mango, sleeve: '#E7A16E', pants: P.lagoon, shoes: P.lagoon, hairColor: '#FBE29A', hat: 'visor', hatColor: P.lagoon, eyes: 'bead', brows: 'up', mouth: 'grin', nose: 'zinc', waves: P.lagoon },
  dex: { kind: 'pear', skin: '#B97A52', shirt: '#4b5a3a', vest: P.lemon, pants: '#3b3f52', shoes: P.plum, hairColor: '#241a14', hat: 'beret', hatColor: '#3f7a46', eyes: 'bead', brows: 'angry', mouth: 'flat', nose: 'button', noseR: 0.15, crossed: true, sleeve: '#4b5a3a' },
  henchman: { kind: 'bean', skin: '#E2B08A', shirt: '#2d211a', pants: '#544238', shoes: P.neon, hairColor: '#111', hat: 'beanie', hatColor: '#43302a', eyes: 'lids', lidTilt: 0.45, brows: 'angry', mouth: 'frown', nose: 'button', zigzag: P.neon, hood: true },
} satisfies Record<string, FigureSpec>;
export type CastId = keyof typeof SPECS;

/**
 * Crew looks per side (spec "Characters": faction hats are hard, iconic shapes).
 * The mockup has full rigs for the bosses, Dex and a Cold Brew henchman; the other
 * crews borrow their boss's hat and colours on a plain body until their slice lands.
 */
export const CREWS: Record<'player' | 'sourwood' | 'hollis' | 'fizzco' | 'coldbrew' | 'blenders', FigureSpec> = {
  player: { kind: 'pear', shirt: P.lemon, pants: P.denim, shoes: P.terra, hat: 'cap', hatColor: P.lemon, hatColor2: P.green, brows: 'angry', mouth: 'flat' },
  sourwood: { kind: 'stilt', shirt: P.sw, pants: '#3a1d47', collar: '#ffffff', shoes: '#22202e', hat: 'bowler', hatColor: '#2a1f3a', glove: '#ffffff', cuff: '#ffffff', brows: 'angry', mouth: 'smirk', eyes: 'lids', nose: 'long' },
  hollis: { kind: 'barrel', shirt: P.ging, pants: P.tea, shoes: P.walnut, hat: 'straw', hatColor: P.straw, overalls: true, brows: 'angry', mouth: 'frown' },
  fizzco: { kind: 'block', headShape: 'block', shirt: P.cola, sleeve: P.cola, pants: '#2b2b38', shoes: '#1d1d26', hairColor: '#2b2b38', hat: 'flattop', eyes: 'shades', brows: 'flat', mouth: 'flat', nose: 'square', earpiece: true },
  coldbrew: SPECS.henchman,
  blenders: { kind: 'vee', shirt: P.mango, sleeve: '#E7A16E', pants: P.lagoon, shoes: P.lagoon, hat: 'visor', hatColor: P.lagoon, brows: 'angry', mouth: 'grin', nose: 'zinc', waves: P.lagoon },
};

/** A customer: soft hats or none, any skin from the ramp. `pick` is 0..1 noise for the choices. */
export function customerSpec(pick: (k: number) => number, kind: BodyKind = 'pear'): FigureSpec {
  const shirts = [P.terra, P.teal, P.green, P.blush, P.lemon, P.denim, '#9C8AD0', P.mango, P.cream];
  const pants = [P.denim, P.plum, P.walnut, '#3b3f52', P.oat, P.teal];
  const hats: Hat[] = ['none', 'curly', 'bun', 'ponytail', 'bucket', 'bald', 'pigtails', 'propeller', 'cap'];
  const hairs = [P.walnut, '#241a14', '#C7652E', '#FBE29A', '#7A4A2A', '#F4EEE6'];
  const at = <T,>(a: readonly T[], k: number) => a[Math.floor(pick(k) * a.length) % a.length];
  return {
    kind, skin: at(SKINS, 1), shirt: at(shirts, 2), pants: at(pants, 3), shoes: at([P.plum, P.terra, P.walnut, '#ffffff'], 4),
    hat: at(hats, 5), hatColor: at([P.terra, P.teal, P.lemon, P.blush], 6), hairColor: at(hairs, 7),
    mouth: at(['smile', 'smile', 'grin', 'o'] as const, 8), freckles: pick(9) < 0.3,
  };
}
