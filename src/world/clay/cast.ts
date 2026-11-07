// Everyone in Citrine Bay, in clay (design spec "Characters"): the bosses,
// the named townsfolk, the six crews with their weapons, gear, levels and
// roles, and the eight kinds of customer with the props that say who they
// are. figure.ts holds the rig; this file holds the looks and the props.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Baker, GLOSS, PAPER, box, cap as cap0, cyl as cyl0, lathe as lathe0, lumpy, shade, snake as snake0, sph as sph0, tor as tor0, type V3 } from './core.ts';
import { CREWS, Figure, SPECS, type BodyKind, type FigureOptions, type FigureSpec, type Hat } from './figure.ts';
import { P, SKINS } from './palette.ts';

export type Side = 'player' | 'sourwood' | 'hollis' | 'fizzco' | 'coldbrew' | 'blenders';
export type SegmentLook = 'kids' | 'families' | 'seniors' | 'students' | 'office' | 'tourists' | 'workers' | 'highRollers';

// ---------- props ----------
// Props baked for crowd-detail figures use about a third of the segments.
let PD = 1;
const k = (s: number, min: number) => Math.max(min, Math.round(s * PD));
const sph = (r: number, w = 20, h = 14) => sph0(r, k(w, 4), k(h, 3));
const cap = (r: number, l: number, cs = 4, rs = 10) => cap0(r, l, k(cs, 1), k(rs, 4));
const cyl = (rt: number, rb: number, h: number, s = 16, open = false) => cyl0(rt, rb, h, k(s, 4), open);
const tor = (r: number, t: number, rs = 8, ts = 20, arc = Math.PI * 2) => tor0(r, t, k(rs, 3), k(ts, 5), arc);
const lathe = (pts: [number, number][], seg = 22) => lathe0(pts, k(seg, 5));
const snake = (pts: V3[], r: number, seg = 24, rs = 7) => snake0(pts, r, k(seg, 3), k(rs, 3), PD < 1 ? 2 : 6);
const rbx = (w: number, h: number, d: number, seg = 2, r = 0.02) => new RoundedBoxGeometry(w, h, d, PD < 1 ? 1 : seg, r);
// Every prop is baked once into vertex-coloured clay and shared. Props held in a
// mitten hang from the hand (the grip at the origin, the business end along -y),
// so they swing with the arm; props worn on the body sit in the rig's space.
type Build = (B: Baker) => void;
const hatchet = (handle: string, head: string, grip: string, stripes = false): Build => (B) => {
  B.add(cyl(0.025, 0.028, 0.52, 8), handle, { p: [0, -0.2, 0], fx: PAPER });
  if (stripes) for (let i = 0; i < 4; i++) B.add(tor(0.029, 0.009, 4, 10), grip, { p: [0, -0.04 - i * 0.09, 0], r: [Math.PI / 2, 0, 0] });
  else B.add(cyl(0.032, 0.032, 0.14, 8), grip, { p: [0, -0.02, 0] });
  // a chunky rounded wedge: clearly a toy, never sharp-looking
  B.add(lumpy(rbx(0.2, 0.13, 0.05, 2, 0.03), 0.004, 10, 2), head, { p: [0.07, -0.42, 0], fx: GLOSS });
  B.add(cyl(0.035, 0.035, 0.07, 8), head, { p: [0, -0.42, 0], r: [Math.PI / 2, 0, 0], fx: GLOSS });
};
const club = (body: string, tape: string): Build => (B) => {
  B.add(lathe([[0, 0.02], [0.03, 0.02], [0.03, -0.12], [0.045, -0.3], [0.06, -0.5], [0.05, -0.56], [0, -0.57]], 12), body, { fx: PAPER });
  for (let i = 0; i < 3; i++) B.add(tor(0.033, 0.01, 4, 10), tape, { p: [0, -0.02 - i * 0.04, 0], r: [Math.PI / 2, 0.2, 0], fx: PAPER });
};
export const PROP: Record<string, Build> = {
  // ----- crew weapons: club tier -----
  bat: club(P.stick, P.lemon), // Peel Patrol: bats in yellow tape
  cane(B) { B.add(cyl(0.022, 0.022, 0.92, 8), P.plum, { fx: GLOSS, p: [0, -0.46, 0] }); B.add(sph(0.05, 10, 8), '#E6E8EE', { fx: GLOSS, p: [0, 0.02, 0] }); B.add(cyl(0.03, 0.03, 0.03, 8), P.gold, { p: [0, -0.92, 0] }); },
  shovel(B) {
    B.add(cyl(0.025, 0.025, 0.7, 8), P.stick, { fx: PAPER, p: [0, -0.3, 0] });
    B.add(tor(0.06, 0.02, 5, 12), P.stick, { fx: PAPER, p: [0, 0.08, 0], r: [0, Math.PI / 2, 0] });
    B.add(lathe([[0, 0.3], [0.11, 0.24], [0.13, 0.05], [0.11, -0.03], [0.03, -0.05], [0, -0.05]], 14), P.chrome, { s: [1, 1, 0.25], p: [0, -0.95, 0], r: [Math.PI, 0, 0], fx: GLOSS });
  },
  baton(B) { B.add(cyl(0.03, 0.03, 0.42, 8), P.plum, { fx: GLOSS, p: [0, -0.2, 0] }); B.add(cyl(0.034, 0.034, 0.1, 8), '#1d1d26', { p: [0, -0.02, 0] }); },
  heldboard(B) { // Cold Brew swing their skateboards
    B.add(rbx(0.2, 0.62, 0.04, 2, 0.02), P.plum, { p: [0, -0.3, 0.03] });
    B.add(box(0.17, 0.4, 0.01), P.neon, { p: [0, -0.3, 0.055], fx: 0.3 });
    for (const y of [-0.1, -0.5]) for (const x of [-0.07, 0.07]) B.add(cyl(0.03, 0.03, 0.035, 10), P.oat, { p: [x, y, 0], r: [0, 0, Math.PI / 2] });
  },
  paddle(B) { // Smoothie Bros swing paddleboards
    B.add(lumpy(sph(0.16, 14, 10), 0.004, 4, 3), P.lagoon, { s: [0.7, 2.6, 0.16], p: [0, -0.38, 0] });
    B.add(box(0.03, 0.75, 0.05), P.mango, { p: [0, -0.38, 0.02] });
  },
  // ----- crew weapons: hatchet tier -----
  hatchetPlayer: hatchet(P.stick, P.chrome, P.lemon, true), // striped handle
  hatchetSourwood: hatchet(P.plum, '#E6E8EE', '#ffffff'), // silver-headed
  hatchetHollis: hatchet(P.walnut, '#9aa3ad', P.ging), // farm axe
  hatchetFizzco: hatchet('#2b2b38', P.chrome, P.cola), // chrome-headed
  hatchetColdbrew: hatchet(P.esp, P.chrome, P.neon, true), // pink-taped
  hatchetBlenders: hatchet(P.stick, P.chrome, P.lagoon, true), // teal grip
  // ----- the bosses' signature things -----
  ladle(B) { // Tilly carries a giant ladle over a shoulder
    B.add(cyl(0.03, 0.03, 0.9, 8), P.walnut, { fx: PAPER, p: [0, -0.4, 0] });
    B.add(new THREE.SphereGeometry(0.17, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), P.chrome, { p: [0, -0.84, 0.0], fx: GLOSS });
  },
  carphone(B) { // Preston's brick car phone
    B.add(rbx(0.1, 0.26, 0.07, 2, 0.02), '#2b2b38', { p: [0, -0.06, 0.03], fx: GLOSS });
    B.add(cyl(0.01, 0.01, 0.16, 5), '#1d1d26', { p: [0.03, 0.14, 0.03] });
    for (let i = 0; i < 6; i++) B.add(box(0.018, 0.012, 0.006), P.lemon, { p: [(i % 3 - 1) * 0.026, -0.1 - Math.floor(i / 3) * 0.03, 0.068] });
  },
  icedcoffee(B) {
    B.add(cyl(0.065, 0.05, 0.2, 12), '#e9fbf8', { fx: GLOSS, p: [0, -0.05, 0.05] });
    B.add(cyl(0.058, 0.046, 0.14, 12), P.walnut, { fx: GLOSS, p: [0, -0.08, 0.05] });
    for (const [x, y] of [[0.02, -0.02], [-0.02, -0.06]]) B.add(box(0.035, 0.035, 0.035), '#ffffff', { fx: GLOSS, p: [x, y, 0.05], r: [0.3, 0.5, 0] });
    B.add(cyl(0.008, 0.008, 0.18, 4), P.neon, { p: [0.015, 0.08, 0.05], r: [0, 0, -0.2] });
  },
  cupLemon(B) { // the paper cup every buyer walks off with
    B.add(cyl(0.075, 0.055, 0.17, 12), '#ffffff', { fx: PAPER, p: [0, -0.06, 0.05] });
    B.add(cyl(0.076, 0.07, 0.05, 12, true), P.lemon, { fx: PAPER, p: [0, -0.04, 0.05] });
    B.add(cyl(0.01, 0.01, 0.16, 4), P.terra, { p: [0.02, 0.06, 0.05], r: [0, 0, -0.3] });
    B.add(sph(0.03, 6, 5), P.lemon, { p: [-0.05, 0.03, 0.05] });
  },
  // ----- the named cast -----
  ledger(B) { // Marisol hugs her ledger
    B.add(rbx(0.34, 0.42, 0.06, 2, 0.02), P.green, { fx: PAPER });
    B.add(box(0.31, 0.39, 0.05), P.cream, { p: [0.015, 0, 0.012], fx: PAPER });
    B.add(box(0.06, 0.42, 0.065), shade(P.green, -0.15), { p: [-0.15, 0, 0], fx: PAPER });
  },
  megaphone(B) { // Benny Buzz never lowers his
    B.add(cyl(0.03, 0.03, 0.12, 8), P.plum, { p: [0, -0.04, 0] });
    B.add(cyl(0.05, 0.16, 0.36, 14, true), P.terra, { p: [0, 0.02, 0.24], r: [Math.PI / 2, 0, 0], fx: GLOSS });
    B.add(tor(0.155, 0.018, 5, 18), '#ffffff', { p: [0, 0.02, 0.42] });
  },
  ticketbook(B) { // Sheriff Budd's ticket book
    B.add(rbx(0.16, 0.22, 0.04, 1, 0.01), P.terra, { p: [0, -0.06, 0.04], fx: PAPER });
    B.add(box(0.14, 0.2, 0.01), '#ffffff', { p: [0, -0.06, 0.062], fx: PAPER });
  },
  glassLemon(B) {
    B.add(cyl(0.06, 0.05, 0.16, 12), P.lemon, { fx: GLOSS, p: [0, -0.05, 0.05] });
    B.add(sph(0.035, 6, 5), P.green, { p: [0.04, 0.04, 0.05] });
    B.add(cyl(0.008, 0.008, 0.18, 4), P.terra, { p: [-0.02, 0.05, 0.05], r: [0, 0, 0.3] });
  },
  fan(B) { for (let i = 0; i < 7; i++) B.add(box(0.05, 0.28, 0.012).translate(0, -0.16, 0), i % 2 ? P.terra : P.cream, { fx: PAPER, r: [0, 0, (i - 3) * 0.22] }); B.add(sph(0.03, 6, 4), P.walnut, {}); },
  knitting(B) { // Lottie's needles and a growing lemon-yellow scarf
    for (const s of [-1, 1]) B.add(cyl(0.008, 0.008, 0.34, 5), P.gold, { p: [s * 0.04, -0.05, 0.12], r: [Math.PI / 2 - 0.4, 0, s * 0.5], fx: GLOSS });
    B.add(lumpy(rbx(0.16, 0.22, 0.05, 2, 0.02), 0.01, 18, 4), P.lemon, { p: [0, -0.16, 0.12] });
    B.add(sph(0.06, 10, 8), P.terra, { p: [0.1, -0.2, 0.18] });
  },
  // ----- customers -----
  balloon(B) { // kids
    B.add(snake([[0, 0, 0], [0.04, 0.4, 0.02], [0, 0.85, 0]], 0.006, 10, 3), '#ffffff', {});
    B.add(lumpy(sph(0.16, 14, 10), 0.006, 6, 7), P.terra, { p: [0, 1.0, 0], s: [1, 1.15, 1], fx: GLOSS });
    B.add(new THREE.ConeGeometry(0.03, 0.04, 6), P.terra, { p: [0, 0.83, 0], r: [Math.PI, 0, 0] });
  },
  lunchpail(B) { // workers
    B.add(rbx(0.22, 0.14, 0.12, 2, 0.03), P.teal, { p: [0, -0.11, 0], fx: GLOSS });
    B.add(new THREE.CylinderGeometry(0.06, 0.06, 0.22, 12, 1, false, 0, Math.PI), P.teal, { p: [0, -0.04, 0], r: [0, 0, Math.PI / 2], fx: GLOSS });
    B.add(tor(0.05, 0.008, 4, 10, Math.PI), P.plum, { p: [0, 0, 0] });
  },
  umbrella(B) { // held up in the left mitten on rainy days
    B.add(cyl(0.012, 0.012, 0.75, 5), P.walnut, { p: [0, 0.32, 0.05] });
    const can = new THREE.ConeGeometry(0.55, 0.26, 8, 1, true);
    B.add(can, P.teal, { p: [0, 0.75, 0.05] });
    for (let i = 0; i < 8; i += 2) B.add(new THREE.ConeGeometry(0.556, 0.262, 8, 1, true, (i * Math.PI) / 4, Math.PI / 4), P.cream, { p: [0, 0.751, 0.05] });
    B.add(sph(0.03, 6, 4), P.walnut, { p: [0, 0.9, 0.05] });
  },
};
const PROP_GEO = new Map<string, THREE.BufferGeometry>();
/** A prop's shared geometry; `crowd` bakes the low-segment one for crowd-detail figures. */
export function propGeometry(name: string, crowd = false): THREE.BufferGeometry {
  const key = crowd ? name + '@crowd' : name;
  let g = PROP_GEO.get(key);
  if (!g) { PD = crowd ? 0.35 : 1; try { const B = new Baker(); PROP[name](B); g = B.build(); } finally { PD = 1; } PROP_GEO.set(key, g); }
  return g;
}
export function prop(name: string, mat: THREE.Material, crowd = false): THREE.Mesh {
  const m = new THREE.Mesh(propGeometry(name, crowd), mat); m.castShadow = true; m.name = name; return m;
}
// crowd-detail figures (0.5 and below) carry the low-segment props
const crowdOf = (fig: Figure) => fig.detail <= 0.5 + 1e-6;
/** Put a prop in a mitten (right by default). Crowd-detail figures get the low-segment prop. */
export function holdProp(fig: Figure, name: string, left = false): THREE.Mesh {
  const m = prop(name, fig.mat, crowdOf(fig)); (left ? fig.handL : fig.hand).add(m); return m;
}

// Body-worn props (attached to the rig, not a mitten).
function stroller(): Build {
  return (B) => {
    for (const x of [-0.2, 0.2]) for (const z of [0, 0.45]) {
      B.add(cyl(0.07, 0.07, 0.03, 12), P.plum, { p: [x, 0.07, z], r: [0, 0, Math.PI / 2] });
      B.add(sph(0.025, 6, 4), P.chrome, { p: [x * 1.12, 0.07, z], fx: GLOSS });
    }
    B.add(lumpy(rbx(0.42, 0.28, 0.5, 3, 0.1), 0.008, 6, 2), P.blush, { p: [0, 0.34, 0.24] });
    B.add(new THREE.SphereGeometry(0.28, 14, 8, 0, Math.PI, 0, Math.PI / 2), P.teal, { p: [0, 0.46, 0.38], r: [0, Math.PI / 2, 0], s: [1, 1, 0.75] });
    B.add(sph(0.09, 10, 8), SKINS[1], { p: [0, 0.54, 0.16] }); // the baby
    B.add(cap(0.018, 0.5, 2, 5), P.chrome, { p: [0, 0.68, -0.08], r: [0, 0, Math.PI / 2], fx: GLOSS });
    for (const x of [-0.2, 0.2]) B.add(cyl(0.015, 0.015, 0.5, 5), P.chrome, { p: [x, 0.45, -0.02], r: [-0.4, 0, 0], fx: GLOSS });
  };
}
function tinyDog(): Build { // high rollers walk a tiny dog
  return (B) => {
    B.add(lumpy(sph(0.11, 12, 8), 0.01, 10, 4), '#ffffff', { p: [0, 0.18, 0], s: [1.4, 1, 1] });
    B.add(lumpy(sph(0.08, 10, 8), 0.01, 12, 5), '#ffffff', { p: [0, 0.27, 0.15] });
    B.add(sph(0.022, 6, 4), P.plum, { p: [0, 0.27, 0.23], fx: GLOSS });
    for (const s of [-1, 1]) B.add(sph(0.045, 8, 6), '#ffffff', { p: [s * 0.06, 0.32, 0.12], s: [0.6, 1.2, 0.6] });
    for (const x of [-0.07, 0.07]) for (const z of [-0.07, 0.07]) B.add(cap(0.022, 0.08, 2, 5), '#ffffff', { p: [x, 0.06, z] });
    B.add(tor(0.06, 0.012, 4, 10), P.terra, { p: [0, 0.22, 0.12], r: [Math.PI / 2 - 0.4, 0, 0], fx: GLOSS });
    B.add(lumpy(sph(0.05, 8, 6), 0.005, 12, 6), '#ffffff', { p: [0, 0.27, -0.16] });
  };
}
const WORN = new Map<string, THREE.BufferGeometry>();
function worn(name: string, build: Build, crowd = false) {
  const key = crowd ? name + '@crowd' : name;
  let g = WORN.get(key);
  if (!g) { PD = crowd ? 0.35 : 1; try { const B = new Baker(); build(B); g = B.build(); } finally { PD = 1; } WORN.set(key, g); }
  return g;
}

// ---------- the bosses (spec "Characters", the boss table) ----------
export const BOSSES = {
  /** The tallest stilt in town, ramrod straight; silver bun, glossy bead pearls, a silver-tipped cane. */
  vera: { kind: 'stilt', skin: '#F3D9C4', shirt: P.sw, pants: '#3a1d47', collar: '#ffffff', shoes: '#22202e', hairColor: '#C9CED6', browColor: '#9aa0aa', hat: 'bun', hatColor: '#E6E8EE', glove: '#ffffff', cuff: '#ffffff', eyes: 'lids', lidTilt: -0.15, brows: 'proud', mouth: 'smirk', nose: 'long', pearls: true, damask: true },
  /** The widest barrel in town; picnic-table hat, giant ladle over a shoulder. */
  tilly: { kind: 'barrel', girth: 1.3, skin: '#E9B48A', shirt: P.ging, pants: P.tea, shoes: P.walnut, hairColor: '#C7652E', hat: 'picnic', eyes: 'bead', brows: 'up', mouth: 'grin', nose: 'potato', overalls: true, gingham: true, shortSleeve: true },
  /** A wedge-shaped block; slick hair, brick car phone. */
  preston: { kind: 'block', headShape: 'block', girth: 1.18, skin: '#EDC3A0', shirt: P.cola, sleeve: P.cola, pants: '#2b2b38', shoes: '#1d1d26', hairColor: '#1d1d26', hat: 'slick', eyes: 'bead', brows: 'proud', mouth: 'smirk', nose: 'square', lapelPin: P.gold },
  /** The deepest slouch; beanie low, iced coffee, coasting on her board. */
  juni: { kind: 'bean', skin: '#8A5638', shirt: P.esp, pants: P.oat, shoes: P.neon, hairColor: '#1e1612', hat: 'beanie', hatColor: P.neon, eyes: 'sleepy', brows: 'flat', mouth: 'smirk', nose: 'button', zigzag: P.neon, hood: true, apron: P.oat, apronMark: 'bean' },
  /** The widest V on the tiniest head; visor, zinc nose, a double-bicep flex. */
  brock: { kind: 'vee', R: 0.25, girth: 1.25, skin: '#E7A16E', shirt: P.mango, pants: P.lagoon, shoes: P.lagoon, hairColor: '#FBE29A', hat: 'visor', hatColor: P.lagoon, eyes: 'bead', brows: 'up', mouth: 'grin', nose: 'zinc', waves: P.lagoon, tank: true, trim: P.lagoon },
} satisfies Record<string, FigureSpec>;
export type BossId = keyof typeof BOSSES;
export const BOSS_OF: Record<Exclude<Side, 'player'>, BossId> = { sourwood: 'vera', hollis: 'tilly', fizzco: 'preston', coldbrew: 'juni', blenders: 'brock' };
/** Each boss's scale (Vera is the tallest stilt in town) and the thing they carry. */
const BOSS_EXTRA: Record<BossId, { scale: number; prop?: string; left?: boolean }> = {
  vera: { scale: 1.12, prop: 'cane' }, tilly: { scale: 1.05, prop: 'ladle' }, preston: { scale: 1.0, prop: 'carphone' }, juni: { scale: 1.0, prop: 'icedcoffee' }, brock: { scale: 1.05 },
};

// ---------- the named townsfolk ----------
export const TOWNSFOLK = {
  /** Marisol the banker hugs a ledger. */
  marisol: { kind: 'pear', skin: '#C98E66', shirt: P.green, pants: P.plum, shoes: P.plum, hairColor: '#241a14', hat: 'bun', hatColor: P.gold, eyes: 'glasses', brows: 'up', mouth: 'smile', nose: 'button' },
  /** Skip Larkin's blazer is printed with tiny houses. */
  skip: { kind: 'pear', skin: '#F2C29A', shirt: P.teal, sleeve: P.teal, pants: P.walnut, shoes: P.walnut, hairColor: '#C7652E', hat: 'none', houses: P.lemon, eyes: 'bead', brows: 'up', mouth: 'grin', nose: 'button', mustache: 'curl' },
  /** Benny Buzz never lowers his megaphone. */
  benny: { kind: 'round', skin: '#E3A27A', shirt: P.terra, pants: P.denim, shoes: '#ffffff', hairColor: '#FBE29A', hat: 'curly', eyes: 'pop', brows: 'up', mouth: 'o', nose: 'button' },
  /** Sheriff Budd: a ticket book and a lemonade, never a holster. */
  budd: { kind: 'barrel', skin: '#B9784F', shirt: '#7a8aa8', pants: '#3b3f52', shoes: P.plum, hairColor: '#3a2a22', hat: 'bucket', hatColor: '#3b3f52', eyes: 'bead', brows: 'flat', mouth: 'flat', nose: 'potato', mustache: 'bushy', lapelPin: P.gold },
  /** Mayor Fontaine wears a tiny plum lapel pin. */
  fontaine: { kind: 'pear', skin: '#F8D3B0', shirt: '#3b3f52', sleeve: '#3b3f52', pants: '#3b3f52', shoes: P.plum, hairColor: '#F4EEE6', hat: 'bald', eyes: 'bead', brows: 'proud', mouth: 'smile', nose: 'button', lapelPin: P.plum },
  /** Lanky Dex: 3 heads tall in a lemon guard vest, arms crossed. */
  dex: { ...SPECS.dex, kind: 'lanky', hairColor: '#241a14' }, // his green beret over dark hair
  /** A Sourwood Steward: stilt-thin, high white collar, white gloves and a bowler. */
  steward: { ...SPECS.sourwood, mustache: undefined, damask: false },
} satisfies Record<string, FigureSpec>;
export type TownsfolkId = keyof typeof TOWNSFOLK;
const TOWN_PROP: Partial<Record<TownsfolkId, { prop: string; left?: boolean; hug?: boolean }>> = {
  marisol: { prop: 'ledger', hug: true }, benny: { prop: 'megaphone' }, budd: { prop: 'ticketbook', left: true }, steward: { prop: 'cane' },
};

/** Build a boss, ready to stand on their turf. */
export function makeBoss(id: BossId, mat: THREE.Material, opts: FigureOptions = {}): Figure {
  const x = BOSS_EXTRA[id];
  // a fixed seed per boss, so every copy shares one baked set of parts
  const fig = new Figure({ seed: 31_000 + Object.keys(BOSSES).indexOf(id), ...BOSSES[id] }, mat, { scale: x.scale, ...opts });
  if (x.prop) holdProp(fig, x.prop, x.left);
  if (id === 'tilly') { const l = fig.hand.children[0]; l.rotation.set(Math.PI * 0.95, 0, -0.3); l.position.set(0, 0.05, -0.1); }
  if (id === 'juni') fig.root.add(prop('skateboardRide', mat));
  fig.root.userData.speckColor = SPECS[id === 'vera' ? 'sourwood' : id === 'tilly' ? 'hollis' : id === 'preston' ? 'fizzco' : id === 'juni' ? 'coldbrew' : 'blenders'].shirt;
  return fig;
}
/** Build a named townsperson (Marisol, Skip Larkin, Benny Buzz, Sheriff Budd, Mayor Fontaine, Dex, a Steward). */
export function makeTownsfolk(id: TownsfolkId, mat: THREE.Material, opts: FigureOptions = {}): Figure {
  const fig = new Figure({ ...TOWNSFOLK[id], seed: 32_000 + Object.keys(TOWNSFOLK).indexOf(id) }, mat, opts);
  const p = TOWN_PROP[id];
  if (p) {
    const m = holdProp(fig, p.prop, p.left);
    if (p.hug) { m.position.set(0.05, 0.05, 0.1); m.rotation.set(0.2, -0.4, 0); }
    if (p.prop === 'megaphone') m.rotation.x = Math.PI / 2; // the bell points along the arm
  }
  if (id === 'budd') holdProp(fig, 'glassLemon');
  return fig;
}
/** Pose a hugging arm (Marisol and her ledger): call after pose(). */
export function hugPose(fig: Figure) { fig.arms[1].rotation.set(-1.2, 0, 0.9); fig.arms[0].rotation.set(-1.0, 0, -0.6); }
/** Each named townsperson's signature stance, laid over any pose (call after pose()). */
export function signaturePose(fig: Figure, id: TownsfolkId) {
  if (id === 'marisol') hugPose(fig);
  if (id === 'benny') fig.arms[1].rotation.set(-1.75, 0, -0.15); // the megaphone never comes down
  if (id === 'budd') { fig.arms[0].rotation.set(-0.9, 0, 0.2); fig.arms[1].rotation.set(-0.7, 0, -0.1); }
}
PROP.skateboardRide = (B) => {
  B.add(rbx(0.34, 0.05, 1.0, 2, 0.02), P.plum, { p: [0, 0.11, 0] });
  B.add(box(0.3, 0.012, 0.6), P.neon, { p: [0, 0.14, 0], fx: 0.3 });
  for (const z of [-0.33, 0.33]) for (const x of [-0.13, 0.13]) B.add(cyl(0.045, 0.045, 0.05, 12), P.oat, { p: [x, 0.045, z], r: [0, 0, Math.PI / 2] });
};

// ---------- crews ----------
export type Weapon = 'fists' | 'clubs' | 'hatchets';
export type Gear = 'none' | 'vest' | 'pro';
export type Role = 'guard' | 'lookout' | 'wrecker' | 'captain';
export interface CrewLook {
  weapon?: Weapon; gear?: Gear;
  /** 0 Rookie .. 4 Legend: clay-snake sleeve chevrons (your crew) */
  level?: number;
  role?: Role;
  /** standing guard: arms crossed (Peel Patrol on guard) */
  onGuard?: boolean;
  /** a little variety between crew members (skin from the ramp, hair) */
  seed?: number;
  /** Lanky Dex: 3 heads tall in his lemon guard vest (your crew only) */
  dex?: boolean;
}
const CLUB: Record<Side, string> = { player: 'bat', sourwood: 'cane', hollis: 'shovel', fizzco: 'baton', coldbrew: 'heldboard', blenders: 'paddle' };
const HATCHET: Record<Side, string> = { player: 'hatchetPlayer', sourwood: 'hatchetSourwood', hollis: 'hatchetHollis', fizzco: 'hatchetFizzco', coldbrew: 'hatchetColdbrew', blenders: 'hatchetBlenders' };
const TAPE: Record<Side, string> = { player: P.lemon, sourwood: '#ffffff', hollis: P.ging, fizzco: '#ffffff', coldbrew: P.neon, blenders: P.lagoon };
/** The six crew looks (spec's crew table): body, gait and hat per side. */
export const CREW_LOOK: Record<Side, FigureSpec> = {
  // Lemon and White: a white tee under the striped lemon bib, so the lemon cap still reads as the lemon
  player: { kind: 'pear', shirt: P.white, pants: P.denim, shoes: P.plum, hat: 'leafcap', hatColor: P.lemon, hatColor2: P.green, brows: 'angry', mouth: 'flat', bib: P.lemon },
  sourwood: { ...TOWNSFOLK.steward, brows: 'angry' },
  hollis: { ...CREWS.hollis, gingham: true },
  fizzco: { ...CREWS.fizzco },
  coldbrew: { ...SPECS.henchman, apron: P.oat, apronMark: 'bean' },
  blenders: { ...CREWS.blenders },
};
/** A crew member's spec: their side's look plus gear, level chevrons and role kit. */
export function crewSpec(side: Side, look: CrewLook = {}): FigureSpec {
  const sp: FigureSpec = { ...CREW_LOOK[side] };
  const seed = look.seed ?? 0;
  if (seed) {
    sp.skin = SKINS[Math.floor(Math.abs(Math.sin(seed * 12.9898) * 43758.5453) % SKINS.length)];
    sp.seed = 10_000 + (seed % 7);
  }
  if ((look.weapon ?? 'fists') === 'fists') sp.tape = TAPE[side];
  // Padded Vest: lemon with white quilting for your crew, a darker shade of the side's colour for rivals
  if (look.gear === 'vest' || look.gear === 'pro') {
    sp.padded = side === 'player' ? P.lemon : shade(sp.shirt ?? P.terra, -0.1);
    if (side === 'player') sp.quilt = P.white;
  }
  // Pro Gear adds shoulder pads; only your crew swaps the cap for a helmet (it keeps the leaf).
  // Rivals keep their iconic hats, so a side still reads from body, hat and tool.
  if (look.gear === 'pro') {
    sp.pads = side === 'player' ? P.white : P.plum;
    if (side === 'player') { sp.hat = 'helmet'; sp.hatColor = P.lemon; sp.hatColor2 = P.white; }
  }
  if (side === 'player' && look.level) { sp.chevrons = look.level; sp.chevronColor = P.plum; }
  if (look.role === 'lookout') sp.binoculars = true;
  if (look.role === 'wrecker') sp.toolbelt = true;
  if (look.role === 'captain') sp.whistle = true;
  if (look.onGuard && side === 'player') sp.crossed = true;
  if (look.dex && side === 'player') {
    // Dex in a brawl is still Dex: lanky, green shirt, beret and lemon guard vest (under any Padded Vest), with his gear on top
    const d = TOWNSFOLK.dex;
    Object.assign(sp, { kind: d.kind, skin: d.skin, shirt: d.shirt, sleeve: d.sleeve, pants: d.pants, hairColor: d.hairColor, brows: d.brows, mouth: d.mouth, noseR: d.noseR, vest: sp.padded ? undefined : P.lemon, bib: undefined, seed: 32_200 });
    if (sp.hat !== 'helmet') Object.assign(sp, { hat: d.hat, hatColor: d.hatColor });
  }
  return sp;
}
/** Put the crew member's weapon in hand, or, arms crossed on guard, leaning against a leg. */
function arm(fig: Figure, side: Side, look: CrewLook) {
  const w = look.weapon ?? 'fists';
  if (w === 'fists') return;
  const name = w === 'clubs' ? CLUB[side] : HATCHET[side];
  if (fig.sp.crossed) {
    const m = prop(name, fig.mat, crowdOf(fig));
    m.name = 'weapon';
    // grip at the hip, business end resting by the right foot
    m.position.set(fig.K.shx * (fig.sp.girth ?? 1) + 0.12, fig.K.leg + 0.38, 0.1);
    m.rotation.set(0.15, 0, 0.22);
    fig.rig.add(m);
    return;
  }
  const m = holdProp(fig, name);
  m.name = 'weapon';
  // ready to swing: up and forward from the mitten (Stewards walk their long canes)
  if (!(side === 'sourwood' && w === 'clubs')) m.rotation.x = -2.3;
}
/** Build a crew member with their weapon in hand (or leaning by them on guard). */
export function makeCrew(side: Side, look: CrewLook, mat: THREE.Material, opts: FigureOptions = {}): Figure {
  const fig = new Figure(crewSpec(side, look), mat, opts);
  arm(fig, side, look);
  if (side === 'coldbrew' && !look.onGuard) fig.root.add(prop('skateboardRide', mat, crowdOf(fig)));
  fig.root.userData.speckColor = side === 'player' ? P.lemon : CREW_LOOK[side].shirt;
  return fig;
}
/** Lanky Dex at his post: his own body and lemon guard vest, with his guard gear, level and weapon. */
export function makeDex(look: CrewLook, mat: THREE.Material, opts: FigureOptions = {}): Figure {
  const g = crewSpec('player', { ...look, onGuard: true });
  const sp: FigureSpec = { ...TOWNSFOLK.dex, seed: 32_100, crossed: true, tape: g.tape, chevrons: g.chevrons, chevronColor: g.chevronColor, padded: g.padded, quilt: g.quilt, pads: g.pads, binoculars: g.binoculars, toolbelt: g.toolbelt, whistle: g.whistle };
  if (g.hat === 'helmet') Object.assign(sp, { hat: 'helmet', hatColor: g.hatColor, hatColor2: g.hatColor2 });
  if (sp.padded) sp.vest = undefined; // the Padded Vest goes on over the guard vest
  const fig = new Figure(sp, mat, opts);
  arm(fig, 'player', { ...look, onGuard: true });
  fig.root.userData.speckColor = P.lemon;
  return fig;
}

// ---------- customers (spec: softer bodies, soft hats or none, props say who they are) ----------
// Customers wear the world's softer brights: never Lemon (reserved for lemons, coins and
// your property) and never an owner's colours.
const SHIRTS = [P.terra, P.teal, P.green, P.blush, P.denim, '#9C8AD0', P.cream, '#E59AB0'];
const PANTS = [P.denim, P.plum, P.walnut, '#3b3f52', '#c7b79a', P.teal];
// warm browns and blondes, cool blue-black, plum-black and grey, and the odd dyed teal or pink,
// so a Street View crowd isn't a sea of orange-brown domes
const HAIRS = [P.walnut, '#241a14', '#C7652E', '#FBE29A', '#1f2433', '#2a1d33', '#9a9aa2', P.teal, '#7A4A2A', P.blush];
const GREYS = ['#F4EEE6', '#d8d0c8', '#E6DDD2'];
const SEG: Record<SegmentLook, { kind: BodyKind[]; hats: Hat[]; extra?: Partial<FigureSpec>; scale?: number }> = {
  kids: { kind: ['kid'], hats: ['pigtails', 'propeller', 'curly', 'ponytail'], extra: { eyeR: 0.15 } },
  families: { kind: ['pear', 'round'], hats: ['ponytail', 'curly', 'none', 'bun'] },
  seniors: { kind: ['round', 'pear'], hats: ['bucket', 'bun', 'bald', 'bucket'], extra: { eyes: 'glasses' } },
  students: { kind: ['pear', 'kid'], hats: ['ponytail', 'curly', 'pigtails', 'none'] },
  office: { kind: ['pear'], hats: ['bun', 'none', 'ponytail', 'bald'] },
  tourists: { kind: ['round', 'pear'], hats: ['bucket', 'bucket', 'curly', 'bald'] },
  workers: { kind: ['pear', 'round'], hats: ['bald', 'curly', 'none', 'bucket'] },
  highRollers: { kind: ['pear'], hats: ['bun', 'none', 'ponytail', 'bun'], extra: { pearls: true } },
};
/** A customer spec for one segment; `i` picks the variant (a few per segment, shared geometry). */
export function segmentSpec(seg: SegmentLook, i: number): FigureSpec {
  const r = (k: number) => { const s = Math.sin((i + 1) * 91.17 + k * 37.71 + seg.length * 3.1) * 43758.5453; return s - Math.floor(s); };
  const at = <T,>(a: readonly T[], k: number) => a[Math.floor(r(k) * a.length) % a.length];
  const S = SEG[seg];
  const sp: FigureSpec = {
    kind: S.kind[i % S.kind.length], seed: 20_000 + i * 13 + seg.length,
    skin: at(SKINS, 1), shirt: at(SHIRTS, 2), pants: at(PANTS, 3), shoes: at([P.plum, P.terra, P.walnut, '#ffffff'], 4),
    hat: S.hats[i % S.hats.length], hatColor: at([P.terra, P.teal, P.green, P.blush, P.cream, P.denim, '#9C8AD0'], 6),
    hairColor: seg === 'seniors' ? at(GREYS, 7) : at(HAIRS, 7),
    mouth: at(['smile', 'smile', 'grin', 'o'] as const, 8), freckles: seg === 'kids' ? r(9) < 0.6 : r(9) < 0.2,
    brows: at(['up', 'up', 'flat', 'worried'] as const, 10),
    ...S.extra,
  };
  if (seg === 'office') { sp.lanyard = at([P.teal, P.terra, P.green], 11); sp.sleeve = sp.shirt; sp.shirt = at(['#3b3f52', P.denim, '#9C8AD0'], 12); }
  if (seg === 'students') sp.backpack = at([P.terra, P.teal, '#9C8AD0', P.green], 11);
  if (seg === 'tourists') { sp.camera = true; sp.shirt = at([P.terra, P.teal, P.blush, P.green], 12); }
  if (seg === 'workers') { sp.shirt = at([P.denim, P.terra, '#7a8aa8'], 12); sp.shortSleeve = true; }
  if (seg === 'seniors' && r(13) < 0.4) sp.mustache = 'bushy';
  if (seg === 'kids' && sp.hat === 'pigtails') sp.hatColor = at([P.terra, P.teal, P.blush], 14);
  return sp;
}
const YARN = [P.terra, P.teal, '#9C8AD0', P.green];
/**
 * The seasons on a walker (spec season table): a yarn scarf for Fall, a cotton-wool breath puff
 * for Winter. Both start hidden; the crowd shows them by season.
 */
export function seasonWear(fig: Figure): { scarf: THREE.Mesh; breath: THREE.Mesh } {
  const R = fig.sp.R, crowd = crowdOf(fig), c = YARN[fig.id % YARN.length];
  const scarf = new THREE.Mesh(worn('scarf' + c, (B) => {
    B.add(lumpy(tor(0.66, 0.22, 6, 14), 0.02, 8, 2), c, { r: [Math.PI / 2 - 0.15, 0, 0] });
    B.add(lumpy(rbx(0.34, 1.0, 0.14, 2, 0.06), 0.02, 8, 3), c, { p: [-0.28, -0.55, 0.78], r: [-0.2, 0, 0.1] });
    for (const y of [-0.3, -0.75]) B.add(box(0.36, 0.06, 0.15), shade(c, -0.15), { p: [-0.28 + y * 0.1, y, 0.8 - (y + 0.55) * 0.2], r: [-0.2, 0, 0.1] });
  }, crowd), fig.mat);
  scarf.scale.setScalar(R);
  scarf.position.set(0, fig.K.neck + R * 0.06, fig.sp.kind === 'bean' ? 0.06 : 0);
  scarf.visible = false;
  fig.rig.add(scarf);
  const breath = new THREE.Mesh(worn('breath', (B) => {
    for (const [x, y, z, r] of [[0, 0, 0, 0.16], [0.14, 0.06, 0.1, 0.12], [-0.1, 0.08, 0.14, 0.1]]) B.add(lumpy(sph(r, 8, 6), r * 0.15, 10, 4), '#ffffff', { p: [x, y, z], fx: PAPER });
  }, crowd), fig.mat);
  breath.scale.setScalar(R);
  breath.position.set(R * 0.25, R * 0.6, R * 1.65);
  breath.visible = false;
  fig.neck.add(breath);
  return { scarf, breath };
}
/** Build a customer with their segment's prop. Returns the figure and the prop (if any). */
export function makeCustomer(seg: SegmentLook, i: number, mat: THREE.Material, opts: FigureOptions = {}): { fig: Figure; prop: THREE.Object3D | null } {
  const fig = new Figure(segmentSpec(seg, i), mat, opts);
  let p: THREE.Object3D | null = null;
  if (seg === 'kids' && i % 2 === 0) p = holdProp(fig, 'balloon', true);
  if (seg === 'workers') p = holdProp(fig, 'lunchpail', true);
  if (seg === 'families') {
    const m = new THREE.Mesh(worn('stroller', stroller(), crowdOf(fig)), mat); m.castShadow = true;
    m.position.set(0, 0, 0.42); fig.root.add(m); p = m;
  }
  if (seg === 'highRollers') {
    const m = new THREE.Mesh(worn('tinydog', tinyDog(), crowdOf(fig)), mat); m.castShadow = true;
    m.position.set(-0.55, 0, 0.25); fig.root.add(m); p = m;
    // the leash, from the left mitten down to the collar
    const leash = new THREE.Mesh(worn('leash', (B) => B.add(snake([[0, 0, 0], [-0.12, -0.35, 0.12], [-0.25, -0.5, 0.3]], 0.008, 8, 3), P.terra, {}), crowdOf(fig)), mat);
    fig.handL.add(leash);
  }
  return { fig, prop: p };
}
export { SKINS };
