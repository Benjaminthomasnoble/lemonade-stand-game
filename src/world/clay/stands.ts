// The five stand levels in Kitchen-Table Clay (design spec, "Stands L1-L5"),
// built for any owner: the player's stands and the rivals' reuse the same five
// silhouettes, dressed in the owner's colours and pressed pattern.
//
// A level model is one baked clay body plus a few parts that move: the
// awning (springs down on OPEN), the sign (falls at 50% HP), dangling sticks
// (25% HP) and the reveal flourish (the bell, the chalk menu, the neon, the
// dome). Rival stands bake everything static into the body.
import * as THREE from 'three';
import { Baker, GLOSS, PAPER, box, canvasTex, cone, cyl, hash, lathe, lumpy, snake, sph, tor } from './core.ts';
import { kit } from './kit.ts';
import { reducedMotion } from './fx.ts';
import { P } from './palette.ts';
import {
  DRESS, INK, awning, cardPlane, cardSign, chalkMenu, clayMesh, crayonSign, lemon, pattern, starGeo, stick,
  type Dress, type Owner, lod, rbox, rope } from './standKit.ts';

type V3 = [number, number, number];

/** Where the stand's dashboard props sit, in the level's frame. */
export interface Anchors {
  counterY: number;
  pitcher: V3; cubes: V3; jar: V3; cups: V3;
  crate: V3; sack: V3; cooler: V3; chalk: V3;
  /** The middle of the sign's top edge, where the Reputation stars stand. */
  stars: V3; starSpan: number;
  /** The OPEN / CLOSED card. */
  card: V3;
  /** Top of the L5 pole: the giant lemon (or a rival's giant topper). */
  pole?: V3;
}

export interface LevelModel {
  level: number;
  root: THREE.Group;
  anchors: Anchors;
  /** Where the kid stands, and how far out Lottie's chair goes. */
  kid: V3;
  chairX: number;
  /** Where Lottie's chair sits front-to-back (default -0.2). */
  chairZ?: number;
  serveZ: number;
  /** The giant lemon on L5. */
  spin?: THREE.Object3D;
  /** Hinged awning, if any: rotation.x when open and when furled. */
  awning?: { hinge: THREE.Group; intact: THREE.Mesh; torn: THREE.Mesh; open: number; shut: number; lights?: THREE.Mesh };
  /** The sign group; falls at 50% HP. */
  sign: THREE.Group;
  /** Card parts that tear at 75% HP (the L1 skirt). */
  tearable?: { intact: THREE.Object3D; torn: THREE.Object3D };
  /** Where the L1 card skirt hangs from, so it can flap in a storm. */
  flapPivot?: V3;
  /** Sticks that dangle at 25% HP. */
  sticks: THREE.Object3D;
  /** The reveal flourish, `k` seconds in (on twos); `done()` puts it back at rest. */
  flourish(k: number): void;
  done(): void;
  /** How long the reveal lasts: 3 s (L1-L3) or 6 s (L4-L5). */
  revealSeconds: number;
}

export interface BuildOpts {
  /** Bake everything into one body (rival stands): no moving parts. */
  static?: boolean;
  /** Rank 10 gilds the Palace. */
  gilded?: boolean;
  /** HP share for static builds: shows the damage step. */
  hp?: number;
  /** Storm: a static L1-L2 keeps its card skirt or awning loose, named 'sway:flap', to flap on twos. */
  flap?: boolean;
  /** Extra clay baked into the body once the level is laid out (rival toppers and family props). */
  decor?: (B: Baker, a: Anchors, level: number) => void;
  /** The words on the sign in place of the owner's (the Epilogue's LOTTIE & VERA'S, src/sim/story.ts cornerSign). */
  sign?: string;
}

/** What each level builder hands back. */
interface Parts {
  anchors: Anchors; kid: V3; chairX: number; chairZ?: number; serveZ: number; sign: THREE.Group; sticks: THREE.Object3D;
  awning?: LevelModel['awning']; tearable?: LevelModel['tearable']; flapPivot?: V3; spin?: THREE.Object3D;
  bell?: THREE.Mesh | null; menuTex?: THREE.Texture; neon?: THREE.Mesh | null; neonEnds?: number[]; dome?: THREE.Mesh | null;
}

interface Ctx {
  B: Baker;
  d: Dress;
  st: boolean;
  root: THREE.Group;
  hp: number;
  /** A static build leaves its card awning or skirt loose to flap (storms, L1-L2 only). */
  flap?: boolean;
}

const m4 = (p: V3, r: V3 = [0, 0, 0], s: V3 = [1, 1, 1]) =>
  new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), new THREE.Vector3(...s));

/** A part that moves on the player's stand, or is baked in place on a static one. */
function part(c: Ctx, geo: THREE.BufferGeometry, at: THREE.Matrix4, parent: THREE.Object3D = c.root, mat?: THREE.Material): THREE.Mesh | null {
  if (c.st && !mat) { c.B.raw(geo, at); geo.dispose(); return null; }
  const mesh = clayMesh(geo, mat ?? kit().world);
  at.decompose(mesh.position, mesh.quaternion, mesh.scale);
  parent.add(mesh);
  return mesh;
}

/** The sign: a card board (painted for the owner) with a label plane, grouped so it can fall. */
function makeSign(c: Ctx, at: V3, w: number, h: number, tex: THREE.Texture, backing = P.terra): THREE.Group {
  const g = new THREE.Group();
  g.position.set(...at);
  const SB = new Baker();
  // Cold Brew's sign is a skateboard deck.
  SB.add(rbox(w, h, 0.07, c.d.owner === 'coldbrew' ? h * 0.48 : 0.035), c.d.owner === 'coldbrew' ? P.plum : P.cream, { fx: PAPER });
  if (c.d.owner === 'coldbrew') for (const s of [-1, 1]) SB.add(cyl(0.08, 0.08, 0.06, 12), P.oat, { p: [s * w * 0.36, -h / 2 - 0.02, 0.05], r: [Math.PI / 2, 0, 0] });
  SB.add(rbox(w + 0.12, h + 0.12, 0.04, 0.03), c.d.owner === 'player' ? backing : c.d.accent, { p: [0, 0, -0.04], fx: PAPER });
  // Lottie's logo come to life beside the word: a clay lemon in a sun hat.
  if (c.d.owner === 'player') mascot(SB, [-w / 2 - 0.02, h * 0.1, 0.1], Math.min(1, h / 0.62));
  const label = cardPlane(tex, w * 0.96, h * 0.92);
  label.position.z = 0.04;
  g.add(label);
  if (c.hp <= 0.5) fallSign(g, at);
  if (c.st) {
    g.updateMatrix();
    c.B.raw(SB.build(), g.matrix);
    c.root.add(g);
  } else {
    g.add(clayMesh(SB.build(), kit().world));
    c.root.add(g);
  }
  g.userData.rest = { p: g.position.clone(), r: g.rotation.clone() };
  return g;
}
/** Lottie's mascot (canon: a lemon in a sun hat), with bead eyes and a smile. */
export function mascot(B: Baker, p: V3, s = 1) {
  const at = (x: number, y: number, z: number): V3 => [p[0] + x * s, p[1] + y * s, p[2] + z * s];
  B.add(lumpy(sph(0.24, 14, 10), 0.01, 8, 3), P.lemon, { p: at(0, 0, 0), s: [1.25 * s, 1 * s, 0.9 * s] });
  for (const k of [-1, 1]) B.add(sph(0.06, 6, 5), P.lemon, { p: at(k * 0.31, 0, 0), s: [1.3 * s, 0.8 * s, 0.8 * s] });
  B.add(cyl(0.34, 0.36, 0.03, 18), P.straw, { p: at(0, 0.2, 0), r: [0.18, 0, -0.12], s });
  B.add(cyl(0.18, 0.2, 0.15, 14), P.straw, { p: at(0, 0.28, -0.01), r: [0.18, 0, -0.12], s });
  B.add(cyl(0.205, 0.205, 0.045, 14, true), P.terra, { p: at(0, 0.24, -0.005), r: [0.18, 0, -0.12], s });
  for (const k of [-1, 1]) B.add(sph(0.03, 6, 5), INK, { p: at(k * 0.08, 0.02, 0.21), s, fx: GLOSS });
  B.add(rope([at(-0.08, -0.07, 0.21), at(0, -0.11, 0.22), at(0.08, -0.07, 0.21)], 0.014 * s, 6, 4), INK);
  for (const k of [-1, 1]) B.add(sph(0.035, 6, 4), P.blush, { p: at(k * 0.15, -0.05, 0.19), s: [s, s * 0.6, s * 0.4] });
}

/** 50% HP: the sign has dropped off its posts and leans against the front. */
export function fallSign(g: THREE.Object3D, at?: V3) {
  const p = at ?? (g.userData.rest?.p.toArray() as V3);
  g.position.set(p[0] + 0.35, 0.45 + Math.min(0.2, (g.scale.y || 1) * 0.1), p[2] + 0.9);
  g.rotation.set(-0.32, 0.2, 0.28);
}

/** 25% HP: a few popsicle sticks dangle off the corners. */
function danglers(c: Ctx, w: number, y: number, z: number): THREE.Object3D {
  const B = new Baker();
  for (let k = 0; k < 4; k++) {
    const x = (k < 2 ? -1 : 1) * (w / 2 - 0.1 - (k % 2) * 0.35);
    stick(B, 0.7 + hash(k, 3) * 0.3, [x, y - 0.3, z + 0.05], [0.25 * (k % 2 ? 1 : -1), 0, (hash(k, 4) - 0.5) * 1.6]);
  }
  // squashed clay where the corners took the hits
  for (const s of [-1, 1]) B.add(lumpy(sph(0.18, 10, 8), 0.03, 6, s), c.d.main, { p: [s * (w / 2 - 0.05), 0.14, z], s: [1.4, 0.45, 1.1] });
  const g = B.build();
  if (c.st) { if (c.hp <= 0.25) c.B.raw(g); return new THREE.Group(); }
  const mesh = clayMesh(g, kit().world);
  mesh.visible = false;
  c.root.add(mesh);
  return mesh;
}

/** A hinged awning: a moving part on the player's stand, baked open on a rival's. */
function hingedAwning(c: Ctx, at: V3, w: number, depth: number, lights: boolean, open: number, shut: number): LevelModel['awning'] {
  const torn = c.hp <= 0.75;
  if (c.st && c.flap) {
    // Storm: the card awning stays loose and flaps from its hinge.
    const m = clayMesh(awning(c.d, w, depth, { lights, torn }), kit().world);
    m.position.set(...at); m.rotation.x = open;
    m.name = 'sway:flap'; m.userData.base = open;
    c.root.add(m);
    return undefined;
  }
  if (c.st) { c.B.raw(awning(c.d, w, depth, { lights, torn }), m4(at, [open, 0, 0])); return undefined; }
  const hinge = new THREE.Group();
  hinge.position.set(...at);
  hinge.rotation.x = shut;
  // The string lights hang off the lip in their own mesh, so furling never stretches the bulbs.
  const intact = clayMesh(awning(c.d, w, depth), kit().world);
  const tornM = clayMesh(awning(c.d, w, depth, { torn: true }), kit().world);
  let lightsM: THREE.Mesh | undefined;
  if (lights) {
    lightsM = clayMesh(awning(c.d, w, depth, { lightsOnly: true }), kit().world, false, false);
    lightsM.position.set(...at);
    lightsM.rotation.x = open;
    c.root.add(lightsM);
  }
  tornM.visible = false;
  hinge.add(intact, tornM);
  c.root.add(hinge);
  return { hinge, intact, torn: tornM, open, shut, lights: lightsM };
}

/** A striped (or patterned) card panel facing +z, centred at p. */
function panel(c: Ctx, B: Baker, w: number, h: number, p: V3, ry = 0) {
  const m = m4(p, [0, ry, 0]);
  B.add(box(w, h, 0.03), c.d.main, { m, fx: PAPER });
  pattern(B, c.d, w, h, m, 0.018);
}

/** A scalloped hem along the bottom of a panel. */
function hem(c: Ctx, B: Baker, w: number, y: number, z: number) {
  const n = Math.max(5, Math.round(w / 0.27));
  for (let k = 0; k < n; k++) B.add(new THREE.CylinderGeometry(w / n / 2, w / n / 2, 0.03, 6, 1, false, Math.PI / 2, Math.PI), k % 2 ? c.d.main : c.d.accent, { p: [-w / 2 + (k + 0.5) * (w / n), y, z], r: [Math.PI / 2, 0, 0], fx: PAPER });
  // Where main and accent share a lightness, a Plum ink seam between scallops and along the top.
  if (c.d.inkEdge) {
    for (let k = 1; k < n; k++) B.add(box(0.016, w / n / 2, 0.034), INK, { p: [-w / 2 + k * (w / n), y - w / n / 4, z + 0.002] });
    B.add(box(w, 0.016, 0.034), INK, { p: [0, y, z + 0.002] });
  }
}

// ---------- L1 The Folding Table ----------
function folding(c: Ctx): Parts {
  const { B } = c;
  const W = 2.4, top = 0.92, z0 = 0.15;
  B.add(rbox(W, 0.1, 0.95, 0.045), '#f3e3c0', { p: [0, top, z0], fx: PAPER });
  for (const s of [-1, 1]) for (const z of [-0.25, 0.55]) B.add(cyl(0.035, 0.035, top, 6), P.chrome, { p: [s * (W / 2 - 0.12), top / 2, z], fx: GLOSS });
  // The striped lemon skirt: tears at 75% HP.
  const skirt = (torn: boolean) => {
    const S = new Baker();
    const n = 9, sw = W / n;
    for (let k = 0; k < n; k++) {
      if (torn && (k === 2 || k === 6)) {
        S.add(box(sw, 0.3, 0.03), k % 2 ? c.d.accent : c.d.main, { p: [-W / 2 + (k + 0.5) * sw, top - 0.2, z0 + 0.49], fx: PAPER });
        S.add(box(sw * 0.9, 0.36, 0.03), k % 2 ? c.d.accent : c.d.main, { p: [-W / 2 + (k + 0.5) * sw + 0.04, top - 0.55, z0 + 0.53], r: [0.5, 0, 0.5], fx: PAPER });
        continue;
      }
      const col = c.d.pattern === 'stripes' ? (k % 2 ? c.d.accent : c.d.main) : c.d.main;
      S.add(box(sw, 0.68, 0.03), col, { p: [-W / 2 + (k + 0.5) * sw, top - 0.38, z0 + 0.49], fx: PAPER });
      S.add(new THREE.CylinderGeometry(sw / 2, sw / 2, 0.03, 6, 1, false, Math.PI / 2, Math.PI), col, { p: [-W / 2 + (k + 0.5) * sw, top - 0.72, z0 + 0.49], r: [Math.PI / 2, 0, 0], fx: PAPER });
    }
    if (c.d.pattern !== 'stripes') pattern(S, c.d, W * 0.96, 0.6, m4([0, top - 0.38, z0 + 0.5]), 0.01);
    // Yellow and white share a lightness: a thin Plum seam between the panels.
    else if (c.d.inkEdge) for (let k = 1; k < n; k++) {
      if (torn && [2, 3, 6, 7].includes(k)) continue;
      S.add(box(0.018, 0.66, 0.036), INK, { p: [-W / 2 + k * sw, top - 0.38, z0 + 0.495] });
    }
    for (const s of [-1, 1]) S.add(box(0.03, 0.68, 0.9), c.d.main, { p: [s * (W / 2 + 0.01), top - 0.38, z0], fx: PAPER });
    return S.build();
  };
  let tearable: LevelModel['tearable'];
  const pivot: V3 = [0, top, z0 + 0.49];
  if (c.st && c.flap) {
    // Storm: the card skirt hangs loose from the table edge and flaps.
    const hang = new THREE.Group();
    hang.position.set(...pivot);
    hang.name = 'sway:flap'; hang.userData.base = 0;
    const m = clayMesh(skirt(c.hp <= 0.75), kit().world);
    m.position.set(-pivot[0], -pivot[1], -pivot[2]);
    hang.add(m);
    c.root.add(hang);
  } else if (c.st) B.raw(skirt(c.hp <= 0.75));
  else {
    const intact = clayMesh(skirt(false), kit().world), torn = clayMesh(skirt(true), kit().world);
    torn.visible = false;
    c.root.add(intact, torn);
    tearable = { intact, torn };
  }
  // Crayon sign on two tall popsicle posts, and the kid's crate step.
  for (const s of [-1, 1]) stick(B, 2.5, [s * 1.0, 1.25, -0.3], [0, 0, 0], P.stick, 0.16, 0.06);
  const tex = c.d.owner === 'player' ? crayonSign('LEMONADE') : cardSign(c.d.sign, c.d);
  const sign = makeSign(c, [0, 2.3, -0.26], 1.9, 0.62, tex);
  B.add(rbox(0.7, 0.42, 0.5, 0.05), P.walnut, { p: [0, 0.21, -0.85], fx: PAPER });
  return {
    flapPivot: pivot,
    anchors: {
      counterY: top + 0.05,
      pitcher: [-0.6, top + 0.05, 0.2], cubes: [-0.12, top + 0.11, 0.42], jar: [0.5, top + 0.05, 0.25], cups: [0.95, top + 0.05, 0.15],
      crate: [-1.75, 0, 0.6], sack: [-1.8, 0, -0.3], cooler: [1.75, 0, -0.25], chalk: [1.55, 0, 1.05],
      stars: [0, 2.3 + 0.31, -0.26], starSpan: 1.3, card: [0, 0.62, z0 + 0.52],
    },
    kid: [0, 0.42, -0.85], chairX: -2.4, serveZ: 1.35, sign, tearable,
    sticks: danglers(c, W, top, z0 + 0.5),
  };
}

// ---------- L2 The Wooden Stand ----------
function wooden(c: Ctx): Parts {
  const { B } = c;
  const W = 3.0, top = 1.12, zf = 0.8;
  // Popsicle-stick booth: sticks side by side make the counter's front and sides.
  for (let x = -W / 2 + 0.07; x < W / 2; x += 0.15) stick(B, top - 0.04, [x, (top - 0.04) / 2, zf], [0, 0, (hash(x * 10) - 0.5) * 0.03]);
  for (const s of [-1, 1]) for (let z = -0.3; z < zf; z += 0.15) stick(B, top - 0.04, [s * W / 2, (top - 0.04) / 2, z], [0, Math.PI / 2, 0]);
  B.add(rbox(W + 0.3, 0.1, 1.35, 0.04), '#d9b27a', { p: [0, top, 0.3], fx: PAPER });
  // A striped card band across the counter front.
  panel(c, B, W - 0.1, 0.32, [0, top - 0.3, zf + 0.04]);
  for (const s of [-1, 1]) {
    stick(B, 2.6, [s * (W / 2 + 0.05), 1.3, zf], [0, 0, 0], P.stick, 0.14, 0.12);
    stick(B, 2.75, [s * (W / 2 + 0.05), 1.37, -0.3], [0, 0, 0], P.stick, 0.14, 0.12);
  }
  const aw = hingedAwning(c, [0, 2.62, -0.3], W + 0.4, 1.7, true, 0.3, -1.15);
  B.add(rbox(0.7, 0.42, 0.5, 0.05), P.walnut, { p: [0, 0.21, -0.6], fx: PAPER });
  const sign = makeSign(c, [0, 3.05, -0.32], 2.2, 0.6, cardSign(c.d.sign, c.d));
  // The bell on the front-right post (rings on the reveal).
  const BB = new Baker();
  BB.add(lathe([[0, 0.16], [0.05, 0.15], [0.08, 0.06], [0.11, 0], [0.1, -0.02], [0, -0.02]], 14), P.gold, { fx: GLOSS });
  BB.add(sph(0.03, 6, 5), P.walnut, { p: [0, -0.04, 0] });
  const bell = part(c, BB.build(), m4([W / 2 + 0.05, 2.25, zf + 0.14]));
  return {
    anchors: {
      counterY: top + 0.05,
      pitcher: [-0.75, top + 0.05, 0.35], cubes: [-0.22, top + 0.11, 0.6], jar: [0.5, top + 0.05, 0.42], cups: [1.05, top + 0.05, 0.35],
      crate: [-2.1, 0, 0.55], sack: [-2.15, 0, -0.35], cooler: [2.1, 0, -0.2], chalk: [1.9, 0, 1.25],
      stars: [0, 3.05 + 0.3, -0.32], starSpan: 1.5, card: [0, top - 0.3, zf + 0.08],
    },
    kid: [0, 0.42, -0.6], chairX: -2.6, serveZ: 1.4, sign, awning: aw, bell,
    sticks: danglers(c, W, top, zf),
  };
}

// ---------- L3 The Kiosk ----------
function kioskModel(c: Ctx): Parts {
  const { B } = c;
  const W = 3.6, H = 2.7, zf = 0.6, zb = -1.8;
  const wall = P.cream;
  // Shell: back, sides and a front with two serving windows.
  B.add(rbox(W, H, 0.2, 0.08), wall, { p: [0, H / 2, zb] });
  for (const s of [-1, 1]) B.add(rbox(0.22, H, zf - zb, 0.08), wall, { p: [s * (W / 2 - 0.11), H / 2, (zf + zb) / 2] });
  B.add(rbox(W, 1.12, 0.22, 0.06), wall, { p: [0, 0.56, zf] });
  B.add(rbox(W, 0.5, 0.22, 0.06), wall, { p: [0, H - 0.25, zf] });
  B.add(rbox(0.3, 1.1, 0.22, 0.06), wall, { p: [0, 1.67, zf] });
  // inside: a darker back wall so the windows read as openings
  B.add(box(W - 0.5, H - 0.4, 0.02), '#e2c39a', { p: [0, H / 2, zb + 0.12], fx: 1 }); // lamplit inside: glows at night
  // window frames of popsicle sticks
  for (const x of [-0.92, 0.92]) {
    stick(B, 1.36, [x, 2.2, zf + 0.12], [0, 0, Math.PI / 2], P.stick, 0.1, 0.04);
    for (const s of [-1, 1]) stick(B, 1.1, [x + s * 0.68, 1.67, zf + 0.12], [0, 0, 0], P.stick, 0.1, 0.04);
  }
  panel(c, B, W - 0.2, 0.7, [0, 0.55, zf + 0.12]);
  hem(c, B, W - 0.2, 0.2, zf + 0.13);
  B.add(rbox(W + 0.25, 0.1, 0.62, 0.04), c.d.main, { p: [0, 1.12, zf + 0.25] });
  // Roof slab with a scalloped card trim, and a short awning over the windows.
  // A soft canopy roof: a domed slab with a fat rolled clay lip all round.
  B.add(lumpy(rbox(W + 0.4, 0.28, zf - zb + 0.5, 0.12), 0.025, 2, 3), P.terra, { p: [0, H + 0.12, (zf + zb) / 2] });
  B.add(lumpy(new THREE.SphereGeometry(1, 14, 5, 0, Math.PI * 2, 0, Math.PI / 2), 0.02, 2, 5), P.terra, { p: [0, H + 0.25, (zf + zb) / 2], s: [(W + 0.2) / 2, 0.42, (zf - zb + 0.3) / 2] });
  {
    const x0 = -(W + 0.4) / 2, x1 = (W + 0.4) / 2, z0r = zb - 0.25, z1r = zf + 0.25, y = H + 0.24;
    B.add(rope([[x0, y, z1r], [0, y + 0.03, z1r + 0.02], [x1, y, z1r]], 0.11, 10, 6), '#d9744f');
    B.add(rope([[x0, y, z0r], [x0 - 0.02, y + 0.03, (z0r + z1r) / 2], [x0, y, z1r]], 0.11, 8, 6), '#d9744f');
    B.add(rope([[x1, y, z0r], [x1 + 0.02, y + 0.03, (z0r + z1r) / 2], [x1, y, z1r]], 0.11, 8, 6), '#d9744f');
  }
  hem(c, B, W + 0.4, H - 0.02, zf + 0.36);
  const aw = hingedAwning(c, [0, 2.48, zf + 0.12], W - 0.1, 0.75, true, 0.45, -1.2);
  // juicer on the counter: a chrome reamer on a lemon base
  B.add(lathe([[0, 0], [0.16, 0], [0.17, 0.08], [0.12, 0.12], [0.1, 0.13], [0.06, 0.2], [0, 0.28]], 16), P.chrome, { p: [1.45, 1.17, zf + 0.3], fx: GLOSS });
  B.add(cyl(0.18, 0.2, 0.08, 14), c.d.owner === 'player' ? P.lemon : c.d.accent, { p: [1.45, 1.21, zf + 0.3] });
  const sign = makeSign(c, [0, H + 0.62, zf + 0.15], 2.6, 0.7, cardSign(c.d.sign, c.d));
  // The chalkboard menu: a tall sandwich board that writes itself on the reveal.
  const MB = new Baker();
  for (const s of [-1, 1]) stick(MB, 1.75, [s * 0.5, 0.86, 0.12], [-0.15, 0, 0], P.walnut, 0.08, 0.06);
  for (const s of [-1, 1]) stick(MB, 1.75, [s * 0.5, 0.86, -0.12], [0.15, 0, 0], P.walnut, 0.08, 0.06);
  MB.add(rbox(1.05, 1.1, 0.05, 0.02), P.walnut, { p: [0, 1.15, 0.08], r: [-0.15, 0, 0], fx: PAPER });
  const menuAt = m4([2.45, 0, 0.6], [0, -0.35, 0]);
  c.B.raw(MB.build(), menuAt); // the legs never move: baked into the body
  const menuTex = canvasTex(256, 280, chalkMenu(1));
  const menu = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.98), new THREE.MeshStandardMaterial({ map: menuTex, roughness: 0.95 }));
  menu.applyMatrix4(menuAt.clone().multiply(m4([0, 1.15, 0.115], [-0.15, 0, 0])));
  c.root.add(menu);
  return {
    anchors: {
      counterY: 1.17,
      pitcher: [-1.2, 1.17, zf + 0.28], cubes: [-0.62, 1.23, zf + 0.36], jar: [0.35, 1.17, zf + 0.3], cups: [0.9, 1.17, zf + 0.26],
      crate: [-2.55, 0, 0.45], sack: [-2.6, 0, -0.5], cooler: [-2.5, 0, -1.4], chalk: [1.5, 0, 1.45],
      stars: [0, H + 0.62 + 0.35, zf + 0.15], starSpan: 1.8, card: [0, 0.75, zf + 0.15],
    },
    kid: [0.9, 0.3, 0.0], chairX: -3.4, serveZ: 1.45, sign, awning: aw, menuTex,
    sticks: danglers(c, W, 1.15, zf + 0.15),
  };
}

// ---------- L4 The Lemon Shack ----------
/** Strokes for the neon letters L O T T I E ' S, in a 1 x 1.4 cell. */
const NEON: Record<string, V3[][]> = {
  L: [[[0.15, 1.3, 0], [0.15, 0.1, 0], [0.85, 0.1, 0]]],
  O: [Array.from({ length: 17 }, (_, i) => [0.5 + Math.cos((i / 16) * Math.PI * 2) * 0.38, 0.7 + Math.sin((i / 16) * Math.PI * 2) * 0.6, 0] as V3)],
  T: [[[0.05, 1.3, 0], [0.95, 1.3, 0]], [[0.5, 1.3, 0], [0.5, 0.1, 0]]],
  I: [[[0.5, 1.3, 0], [0.5, 0.1, 0]]],
  E: [[[0.85, 1.3, 0], [0.15, 1.3, 0], [0.15, 0.1, 0], [0.85, 0.1, 0]], [[0.15, 0.7, 0], [0.7, 0.7, 0]]],
  "'": [[[0.5, 1.35, 0], [0.42, 1.0, 0]]],
  S: [[[0.85, 1.15, 0], [0.6, 1.32, 0], [0.25, 1.22, 0], [0.2, 0.95, 0], [0.5, 0.72, 0], [0.8, 0.48, 0], [0.75, 0.2, 0], [0.4, 0.08, 0], [0.12, 0.25, 0]]],
  U: [[[0.15, 1.3, 0], [0.15, 0.4, 0], [0.3, 0.12, 0], [0.5, 0.08, 0], [0.7, 0.12, 0], [0.85, 0.4, 0], [0.85, 1.3, 0]]],
  R: [[[0.15, 0.1, 0], [0.15, 1.3, 0], [0.6, 1.3, 0], [0.82, 1.1, 0], [0.6, 0.75, 0], [0.15, 0.75, 0]], [[0.45, 0.75, 0], [0.85, 0.1, 0]]],
  W: [[[0.05, 1.3, 0], [0.25, 0.1, 0], [0.5, 0.8, 0], [0.75, 0.1, 0], [0.95, 1.3, 0]]],
  D: [[[0.15, 0.1, 0], [0.15, 1.3, 0], [0.5, 1.28, 0], [0.8, 1.0, 0], [0.85, 0.7, 0], [0.8, 0.4, 0], [0.5, 0.12, 0], [0.15, 0.1, 0]]],
  H: [[[0.15, 1.3, 0], [0.15, 0.1, 0]], [[0.85, 1.3, 0], [0.85, 0.1, 0]], [[0.15, 0.7, 0], [0.85, 0.7, 0]]],
  F: [[[0.85, 1.3, 0], [0.15, 1.3, 0], [0.15, 0.1, 0]], [[0.15, 0.72, 0], [0.65, 0.72, 0]]],
  Z: [[[0.12, 1.3, 0], [0.88, 1.3, 0], [0.12, 0.1, 0], [0.88, 0.1, 0]]],
  C: [Array.from({ length: 11 }, (_, i) => { const a = 0.9 + (i / 10) * (Math.PI * 2 - 1.8); return [0.55 + Math.cos(a) * 0.4, 0.7 + Math.sin(a) * 0.6, 0] as V3; })],
  B: [[[0.15, 0.1, 0], [0.15, 1.3, 0], [0.6, 1.3, 0], [0.78, 1.12, 0], [0.6, 0.72, 0], [0.15, 0.72, 0]], [[0.6, 0.72, 0], [0.85, 0.45, 0], [0.65, 0.1, 0], [0.15, 0.1, 0]]],
  N: [[[0.15, 0.1, 0], [0.15, 1.3, 0], [0.85, 0.1, 0], [0.85, 1.3, 0]]],
  A: [[[0.1, 0.1, 0], [0.5, 1.3, 0], [0.9, 0.1, 0]], [[0.28, 0.55, 0], [0.72, 0.55, 0]]],
  V: [[[0.05, 1.3, 0], [0.5, 0.1, 0], [0.95, 1.3, 0]]],
  '&': [[[0.9, 0.1, 0], [0.32, 0.88, 0], [0.28, 1.14, 0], [0.47, 1.32, 0], [0.66, 1.14, 0], [0.6, 0.92, 0], [0.2, 0.55, 0], [0.16, 0.26, 0], [0.38, 0.08, 0], [0.64, 0.16, 0], [0.88, 0.5, 0]]],
};
/** Each owner's neon: Lottie's lemon yellow, and the factions' signature glows. */
const NEON_COLOR: Record<Owner, string> = { player: '#FFE14A', sourwood: '#C77DEB', hollis: '#FF6A4D', fizzco: '#FF3B4E', coldbrew: '#FF4FA3', blenders: '#2EE6D6', snootwater: '#9BE7FF' };
const charW = (ch: string) => (ch === "'" ? 0.4 : ch === 'I' ? 0.5 : ch === ' ' ? 0.55 : 1);
const wordW = (word: string, cell: number) => [...word].reduce((a, ch) => a + charW(ch) * cell + cell * 0.12, 0) - cell * 0.12;
/** Rolled clay letters that glow from golden hour; drawn in order so the reveal can buzz them on one at a time. */
function neonWord(word: string, h: number, color: string, cheap = false): { geo: THREE.BufferGeometry; ends: number[]; width: number } {
  const cell = h / 1.4, ends: number[] = [], letters: THREE.BufferGeometry[] = [];
  const widths = [...word].map((ch) => charW(ch) * cell);
  const width = wordW(word, cell);
  let x = -width / 2;
  let total = 0;
  [...word].forEach((ch, i) => {
    const off = ch === "'" || ch === 'I' ? -cell * 0.25 : 0;
    const LB = new Baker();
    for (const stroke of NEON[ch] ?? []) {
      const pts = stroke.map(([a, b]) => [x + off + a * cell, b * cell, 0] as V3);
      LB.add(cheap ? rope(pts, cell * 0.075, Math.max(6, 3 * pts.length), 4) : snake(pts, cell * 0.07, Math.max(12, 6 * pts.length), 6), color, { fx: 1 });
    }
    const g = LB.build();
    total += g.index?.count ?? 0;
    ends.push(total);
    letters.push(g);
    x += widths[i] + cell * 0.12;
  });
  const B = new Baker();
  for (const g of letters) { B.raw(g); g.dispose(); }
  return { geo: B.build(), ends, width };
}
/**
 * A clay-snake neon sign (spec: L4+ signs) on a stick rail, with its two posts
 * baked into the body. Rivals' words sit on a dark board so their colours
 * pop. The group falls at 50% HP; the letters buzz on during the reveal.
 */
function neonSign(c: Ctx, at: V3, maxW: number, hMax = 0.62, board = false): { group: THREE.Group; mesh: THREE.Mesh | null; ends: number[]; top: number } {
  const player = c.d.owner === 'player';
  const word = c.d.sign;
  const h = Math.min(hMax, (maxW / wordW(word, 1)) * 1.4);
  const neon = neonWord(word, h, NEON_COLOR[c.d.owner], c.st);
  const w = neon.width;
  for (const s of [-1, 1]) stick(c.B, 0.75, [at[0] + s * (w / 2 - 0.15), at[1] + 0.05, at[2] - 0.06], [0, 0, 0], P.walnut, 0.08, 0.05);
  const RB = new Baker();
  // Lottie's mascot rides the rail clear of the word: sized to the letters, and centred its own
  // half-width (arms and hat brim reach about 0.49 x its scale) plus a gap left of the first letter.
  const ms = 1.25 * Math.min(1, h / 0.62), mx = -w / 2 - 0.49 * ms - 0.08, ext = player ? 0.98 * ms + 0.1 : 0;
  RB.add(rbox(w + 0.3 + ext, 0.06, 0.06, 0.02), P.walnut, { p: [-ext / 2, 0.05, -0.06], fx: PAPER });
  // A dark board behind the letters (Sourwood's framed in its gold), and behind
  // LOTTIE'S too on the Palace, where lemon letters would vanish into the dome.
  if (!player || board) RB.add(rbox(w + 0.36 + ext, h + 0.34, 0.05, 0.06), player ? P.plum : '#2b2b38', { p: [-ext / 2, h / 2 + 0.02, -0.07], fx: PAPER });
  if (c.d.owner === 'sourwood') RB.add(rbox(w + 0.48, h + 0.46, 0.03, 0.08), '#C9A227', { p: [0, h / 2 + 0.02, -0.1], fx: GLOSS });
  // Lottie's mascot rides the rail beside the word.
  if (player) mascot(RB, [mx, h * 0.45, 0.02], ms);
  const g = new THREE.Group();
  g.position.set(...at);
  if (c.hp <= 0.5) fallSign(g, at);
  let mesh: THREE.Mesh | null = null;
  if (c.st) {
    g.updateMatrix();
    c.B.raw(RB.build(), g.matrix);
    c.B.raw(neon.geo, g.matrix);
    neon.geo.dispose();
  } else {
    g.add(clayMesh(RB.build(), kit().world));
    mesh = clayMesh(neon.geo, kit().world);
    g.add(mesh);
    c.root.add(g);
  }
  g.userData.rest = { p: new THREE.Vector3(...at), r: new THREE.Euler() };
  return { group: g, mesh, ends: neon.ends, top: at[1] + h + (player ? 0.12 : 0.22) };
}
function shackModel(c: Ctx): Parts {
  const { B } = c;
  const W = 5, H = 3, zf = 0.5, zb = -2.5;
  const plank = (y: number, z: number, w: number, ry = 0, x = 0) => B.add(box(w, 0.24, 0.06), hash(y * 7, z) > 0.5 ? '#c98b4f' : '#b97a42', { p: [x, y, z], r: [0, ry, (hash(y, z * 3) - 0.5) * 0.02], fx: PAPER });
  // Plank walls with one wide serving window.
  for (let y = 0.12; y < H; y += 0.25) {
    plank(y, zb, W);
    for (const s of [-1, 1]) plank(y, (zf + zb) / 2, zf - zb, Math.PI / 2, s * W / 2);
    if (y < 1.1 || y > 2.25) plank(y, zf, W);
    else for (const s of [-1, 1]) plank(y, zf, 0.8, 0, s * (W / 2 - 0.4));
  }
  B.add(box(W - 0.3, H - 0.3, 0.02), '#b98a5c', { p: [0, H / 2, zb + 0.05], fx: 1 }); // lamplit inside: glows at night
  B.add(rbox(3.6, 0.1, 0.7, 0.04), '#d9b27a', { p: [0, 1.12, zf + 0.25], fx: PAPER });
  panel(c, B, 3.4, 0.5, [0, 0.8, zf + 0.06]);
  // A pitched terracotta roof (gable ends to the sides) with a card trim.
  {
    const D = zf - zb + 1.0, half = D / 2, pitch = 0.42, zc = (zf + zb) / 2;
    const run = half / Math.cos(pitch), rise = Math.sin(pitch) * half;
    for (const s of [-1, 1]) B.add(lumpy(rbox(W + 0.6, 0.2, run + 0.1, 0.08), 0.02, 2, 4 + s), P.terra, { p: [0, H + rise / 2 + 0.1, zc + s * half / 2], r: [s * pitch, 0, 0] });
    for (const s of [-1, 1]) B.add(new THREE.CylinderGeometry(0.001, half * 0.98, rise, 3, 1), '#c98b4f', { p: [s * (W / 2 - 0.02), H + rise / 2 - 0.02, zc], r: [0, 0, 0], s: [0.08, 1, 1], fx: PAPER });
    B.add(rope([[-(W + 0.6) / 2, H + rise + 0.18, zc], [(W + 0.6) / 2, H + rise + 0.18, zc]], 0.1, 6, 6), '#d9744f');
  }
  hem(c, B, W + 0.6, H - 0.02, zf + 0.62);
  const aw = hingedAwning(c, [0, 2.45, zf + 0.06], 3.8, 0.9, true, 0.4, -1.2);
  // Picnic tables of popsicle sticks.
  for (const x of [-3.75, 3.75]) {
    for (let k = 0; k < 5; k++) stick(B, 0.78, [x, 0.74, 0.25 + k * 0.155], [Math.PI / 2, 0, Math.PI / 2], P.stick, 0.15, 0.04);
    for (const z of [-0.15, 1.25]) for (let k = 0; k < 2; k++) stick(B, 1.3, [x, 0.42, z + k * 0.14 - 0.07], [Math.PI / 2, 0, Math.PI / 2], P.stick, 0.13, 0.04);
    for (const s of [-1, 1]) { stick(B, 0.95, [x + s * 0.55, 0.38, 0.55], [0.6, 0, 0], P.walnut, 0.08, 0.05); stick(B, 0.95, [x + s * 0.55, 0.38, 0.55], [-0.6, 0, 0], P.walnut, 0.08, 0.05); }
    // a lemon-yellow parasol
    B.add(cyl(0.035, 0.035, 2.0, 6), P.stick, { p: [x, 1.6, 0.55], fx: PAPER });
    B.add(cone(0.95, 0.45, 12), c.d.main, { p: [x, 2.7, 0.55], fx: PAPER });
    B.add(sph(0.07, 6, 5), c.d.accent, { p: [x, 2.95, 0.55] });
  }
  // Ice machine: a rounded cream block with a chrome door and a lemon badge.
  B.add(rbox(0.9, 1.7, 0.75, 0.12), '#eef4f2', { p: [3.0, 0.85, -1.9] });
  B.add(rbox(0.6, 0.55, 0.05, 0.05), P.chrome, { p: [3.0, 1.15, -1.5], fx: GLOSS });
  B.add(sph(0.1, 8, 6), P.lemon, { p: [3.0, 1.6, -1.5], s: [1.3, 1, 0.5] });
  // The clay-snake neon on the roof: LOTTIE'S, or the faction's name in its glow.
  const neon = neonSign(c, [0, H + 0.62, zf + 0.15], 4.2);
  return {
    anchors: {
      counterY: 1.17,
      pitcher: [-1.25, 1.17, zf + 0.25], cubes: [-0.65, 1.23, zf + 0.32], jar: [0.4, 1.17, zf + 0.28], cups: [0.95, 1.17, zf + 0.22],
      crate: [-3.1, 0, -1.25], sack: [-3.1, 0, -2.1], cooler: [2.95, 0, -0.75], chalk: [1.7, 0, 1.45],
      stars: [0, neon.top, zf + 0.15], starSpan: 2.2, card: [0, 0.8, zf + 0.1],
    },
    kid: [0, 0.3, -0.2], chairX: -4.3, serveZ: 1.55, sign: neon.group, awning: aw, neon: neon.mesh, neonEnds: neon.ends,
    sticks: danglers(c, W, 1.15, zf + 0.1),
  };
}

// ---------- L5 The Citrus Palace ----------
function palaceModel(c: Ctx, gilded: boolean): Parts {
  const { B } = c;
  const player = c.d.owner === 'player';
  // Lemon yellow is the player's; a rival Palace wears its own colours.
  const gold = gilded ? P.gold : player ? P.lemon : c.d.main, trim = gilded ? P.gold : player ? c.d.main : c.d.accent;
  const drink: Record<string, string> = { player: '#ffe58a', sourwood: '#f3e7a0', hollis: '#c97b35', fizzco: '#8a2330', coldbrew: '#6b4a32', blenders: '#ffb347' };
  const R = 2.4, zc = -2.3;
  B.add(lumpy(cyl(R, R + 0.1, 2.8, 32), 0.03, 1.5, 5), P.cream, { p: [0, 1.4, zc] });
  for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; B.add(box(0.2, 2.6, 0.12), k % 2 ? trim : P.cream, { p: [Math.cos(a) * (R + 0.08), 1.35, zc + Math.sin(a) * (R + 0.08)], r: [0, -a + Math.PI / 2, 0], fx: PAPER }); }
  B.add(tor(R + 0.05, 0.12, 6, 28), trim, { p: [0, 2.8, zc], r: [Math.PI / 2, 0, 0], fx: gilded ? GLOSS : 0 });
  // Facade: a wide window and a counter.
  B.add(rbox(4.0, 0.95, 0.5, 0.08), P.cream, { p: [0, 0.48, 0.05] });
  B.add(rbox(4.0, 0.55, 0.5, 0.08), P.cream, { p: [0, 2.43, 0.05] });
  for (const s of [-1, 1]) B.add(rbox(0.45, 1.3, 0.5, 0.08), P.cream, { p: [s * 1.78, 1.6, 0.05] });
  B.add(box(3.2, 1.3, 0.02), '#ecd0a4', { p: [0, 1.6, -0.6], fx: 1 }); // lamplit inside: glows at night
  // Round porthole windows in the drum, lit from within.
  for (const th of [0.2, -0.55, Math.PI - 0.2, Math.PI + 0.55]) {
    B.add(cyl(0.3, 0.3, 0.06, 12), '#ffd98a', { p: [Math.cos(th) * (R + 0.04), 1.75, zc + Math.sin(th) * (R + 0.04)], r: [0, -th, Math.PI / 2], fx: GLOSS + 1 });
    B.add(tor(0.3, 0.04, 5, 14), trim, { p: [Math.cos(th) * (R + 0.08), 1.75, zc + Math.sin(th) * (R + 0.08)], r: [0, -th + Math.PI / 2, 0] });
  }
  panel(c, B, 3.8, 0.6, [0, 0.5, 0.32]);
  B.add(rbox(4.2, 0.12, 0.65, 0.05), player || gilded ? gold : c.d.accent, { p: [0, 1.0, 0.45], fx: gilded ? GLOSS : 0 });
  hem(c, B, 4.0, 2.12, 0.33);
  // Drive-up window on the right of the drum, with its own little awning and a lane arrow.
  B.add(rbox(1.2, 1.5, 0.9, 0.12), P.cream, { p: [R + 0.25, 1.2, zc + 0.6] });
  B.add(box(0.02, 0.7, 0.6), '#ffd27a', { p: [R + 0.86, 1.45, zc + 0.6], fx: GLOSS + 1 });
  // The drive-up awning tears at 75% HP.
  const awAt = m4([R + 0.86, 1.95, zc + 0.6], [0.5, Math.PI / 2, 0]);
  let tearable: LevelModel['tearable'];
  if (c.st) B.raw(awning(c.d, 1.0, 0.55, { torn: c.hp <= 0.75 }), awAt);
  else {
    const intact = clayMesh(awning(c.d, 1.0, 0.55), kit().world), torn = clayMesh(awning(c.d, 1.0, 0.55, { torn: true }), kit().world);
    for (const m of [intact, torn]) awAt.decompose(m.position, m.quaternion, m.scale);
    torn.visible = false;
    c.root.add(intact, torn);
    tearable = { intact, torn };
  }
  for (let k = 0; k < 3; k++) B.add(box(0.5, 0.012, 0.16), P.cream, { p: [R + 1.6, 0.03, zc + 1.6 - k * 0.9], r: [0, 0, 0] });
  B.add(cone(0.25, 0.4, 3), P.cream, { p: [R + 1.6, 0.03, zc - 1.1], r: [-Math.PI / 2, 0, 0], s: [1, 1, 0.06] });
  // Resin fountain of lemonade: a bowl, a stem and dish, three fat arcs and a
  // plume of stacked blobs, with little lights round the rim for the evening.
  const fx = -3.5, fz = 0.2, juice = drink[c.d.owner];
  B.add(lumpy(lathe([[0, 0], [0.95, 0], [1.0, 0.1], [0.98, 0.42], [0.86, 0.45], [0.84, 0.3], [0, 0.3]], 24), 0.02, 3, 2), P.cream, { p: [fx, 0, fz] });
  B.add(cyl(0.84, 0.84, 0.04, 24), juice, { p: [fx, 0.38, fz], fx: GLOSS });
  B.add(cyl(0.09, 0.12, 1.0, 10), P.cream, { p: [fx, 0.85, fz] });
  B.add(lathe([[0, 0], [0.35, 0.02], [0.4, 0.12], [0.3, 0.14], [0, 0.1]], 16), P.cream, { p: [fx, 1.35, fz] });
  // The plume: fat blobs stacked up out of the dish, a splash ring round it,
  // and chunky drips hanging off the dish rim into the bowl.
  for (let k = 0; k < 4; k++) B.add(lumpy(sph(0.17 - k * 0.03, 10, 7), 0.02, 6, k + 4), juice, { p: [fx, 1.56 + k * 0.2, fz], s: [1, 1.1, 1], fx: GLOSS + 0.4 });
  B.add(tor(0.3, 0.07, 6, 16), juice, { p: [fx, 1.5, fz], r: [Math.PI / 2, 0, 0], fx: GLOSS + 0.4 });
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.3, x = fx + Math.cos(a) * 0.4, z = fz + Math.sin(a) * 0.4;
    const len = 0.18 + hash(k, 8) * 0.14;
    B.add(cyl(0.05, 0.075, len, 7), juice, { p: [x, 1.38 - len / 2, z], fx: GLOSS + 0.4 });
    B.add(sph(0.08, 7, 5), juice, { p: [x, 1.38 - len, z], fx: GLOSS + 0.4 });
  }
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; B.add(sph(0.045, 6, 4), '#fff1c4', { p: [fx + Math.cos(a) * 0.98, 0.47, fz + Math.sin(a) * 0.98], fx: GLOSS + 1 }); }
  // Pole for the giant spinning lemon.
  stick(B, 4.6, [3.4, 2.3, 0.7], [0, 0, 0], gilded ? P.gold : P.stick, 0.2, 0.2);
  // The clay-snake neon across the facade.
  const neon = neonSign(c, [0, 2.78, 0.32], 3.3, 0.55, true);
  // The dome rises like a sunrise on the reveal.
  const DB = new Baker();
  DB.add(lumpy(new THREE.SphereGeometry(R + 0.05, player ? 32 : 20, player ? 14 : 9, 0, Math.PI * 2, 0, Math.PI / 2), 0.04, 1.2, 9), gold, { s: [1, 0.85, 1], fx: gilded ? GLOSS : 0 });
  for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; const pts: V3[] = []; for (let i = 0; i <= 8; i++) { const th = (i / 8) * Math.PI / 2; pts.push([Math.cos(a) * Math.cos(th) * (R + 0.08), Math.sin(th) * (R + 0.08) * 0.85, Math.sin(a) * Math.cos(th) * (R + 0.08)]); } DB.add(rope(pts, 0.035, 8, 4), gilded ? '#fff1d6' : P.gold, { fx: GLOSS }); }
  DB.add(sph(0.25, 10, 8), gilded ? P.gold : P.green, { p: [0, (R + 0.05) * 0.85 + 0.15, 0], s: [1, 1.4, 1] });
  const dome = part(c, DB.build(), m4([0, 2.8, zc]));
  // The giant lemon.
  const LB = new Baker();
  lemon(LB, 0.7, [0, 0, 0], [0, 0, 0], gold, 7);
  LB.add(lumpy(sph(0.25, 10, 8), 0.02, 6, 2), P.green, { p: [0.1, 0.72, 0], s: [1.6, 0.4, 0.8], r: [0, 0, 0.4] });
  const spin = player ? part(c, LB.build(), m4([3.4, 5.15, 0.7])) : (LB.build().dispose(), null);
  return {
    anchors: {
      counterY: 1.06,
      pitcher: [-1.2, 1.06, 0.48], cubes: [-0.62, 1.12, 0.58], jar: [0.4, 1.06, 0.5], cups: [0.95, 1.06, 0.45],
      crate: [-2.65, 0, -0.6], sack: [-2.95, 0, -1.4], cooler: [2.25, 0, 1.0], chalk: [1.5, 0, 1.6],
      stars: [0, neon.top, 0.32], starSpan: 1.9, card: [0, 0.55, 0.36], pole: [3.4, 4.6, 0.7],
    },
    // Lottie sits behind the fountain, clear of its bowl and inside the fence.
    kid: [0, 0.3, -0.3], chairX: -4.0, chairZ: -1.75, serveZ: 1.4, sign: neon.group, dome, spin: spin ?? undefined, tearable, neon: neon.mesh, neonEnds: neon.ends,
    sticks: danglers(c, 4.0, 1.0, 0.4),
  };
}

/**
 * The far version of a stand for Bay View's district blocks: the level's
 * silhouette in the owner's colours from a handful of plain boxes, about 100
 * to 300 triangles against several thousand for the full model.
 */
export function farLevel(level: number, owner: Owner, gilded = false): THREE.BufferGeometry {
  const d = DRESS[owner], B = new Baker();
  const L = Math.max(1, Math.min(5, Math.round(level)));
  const bx = (w: number, h: number, dd: number, p: V3, col: string, r: V3 = [0, 0, 0]) => B.add(box(w, h, dd), col, { p, r });
  const sign = (y: number, z: number, w: number) => { bx(w + 0.12, 0.66, 0.06, [0, y, z], P.terra); bx(w, 0.54, 0.08, [0, y, z + 0.01], '#fff3d6'); };
  if (L === 1) {
    bx(2.4, 0.1, 0.95, [0, 0.92, 0.15], '#f3e3c0');
    bx(2.4, 0.7, 0.04, [0, 0.55, 0.64], d.main);
    for (const x of [-1.25, 1.25]) bx(0.08, 1.9, 0.08, [x, 0.95, 0.6], P.stick);
    sign(1.85, 0.62, 2.1);
  } else if (L === 2) {
    bx(3.0, 1.12, 1.1, [0, 0.56, 0.25], P.stick);
    bx(2.9, 0.32, 0.04, [0, 0.82, 0.82], d.main);
    for (const x of [-1.55, 1.55]) for (const z of [0.8, -0.3]) bx(0.14, 2.7, 0.12, [x, 1.35, z], P.stick);
    bx(3.4, 0.06, 1.7, [0, 2.4, 0.4], d.main, [0.3, 0, 0]);
    sign(3.05, -0.32, 2.2);
  } else if (L === 3) {
    bx(3.6, 2.7, 2.4, [0, 1.35, -0.6], P.cream);
    bx(3.0, 1.0, 0.04, [0, 1.67, 0.61], '#cdb8a0');
    bx(3.4, 0.7, 0.04, [0, 0.55, 0.62], d.main);
    bx(4.0, 0.28, 2.9, [0, 2.82, -0.6], P.terra);
    sign(3.32, 0.75, 2.6);
  } else if (L === 4) {
    bx(5, 3, 3, [0, 1.5, -1], '#c98b4f');
    bx(3.6, 1.1, 0.04, [0, 1.65, 0.51], '#5a4030');
    bx(3.4, 0.5, 0.04, [0, 0.8, 0.53], d.main);
    B.add(box(5.6, 0.25, 4.2), P.terra, { p: [0, 3.25, -0.8], r: [0.12, 0, 0] });
    for (const x of [-3.75, 3.75]) { bx(0.9, 0.06, 1.0, [x, 0.74, 0.55], P.stick); B.add(cone(0.8, 0.35, 6, true), owner === 'player' ? P.lemon : d.main, { p: [x, 2.1, 0.55] }); }
    sign(3.62, 0.65, 3.2);
  } else {
    const gold = gilded ? P.gold : owner === 'player' ? P.lemon : d.main;
    B.add(cyl(2.4, 2.5, 2.8, 10, true), P.cream, { p: [0, 1.4, -2.3] });
    B.add(new THREE.SphereGeometry(2.45, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2), gold, { p: [0, 2.8, -2.3], s: [1, 0.85, 1] });
    bx(4.0, 2.7, 0.5, [0, 1.35, 0.05], P.cream);
    bx(3.2, 1.0, 0.04, [0, 1.6, 0.31], '#5a4030');
    bx(4.2, 0.12, 0.65, [0, 1.0, 0.45], owner === 'player' || gilded ? gold : d.accent);
    B.add(cyl(0.9, 1.0, 0.45, 8), P.cream, { p: [-3.5, 0.22, 0.2] });
    bx(0.2, 4.6, 0.2, [3.4, 2.3, 0.7], gilded ? P.gold : P.stick);
    B.add(sph(0.7, 6, 4), gold, { p: [3.4, 5.15, 0.7], s: [1.3, 1, 1] });
    sign(2.95, 0.32, 2.8);
  }
  return B.build();
}

const RISE = [0.2, 0.6, 1.18, 1.1, 0.95, 1.02, 1];

/** Build a stand level for an owner. */
export function buildLevel(level: number, owner: Owner, opts: BuildOpts = {}): LevelModel {
  const root = new THREE.Group();
  root.name = 'standLevel';
  const L = Math.max(1, Math.min(5, Math.round(level)));
  const c: Ctx = { B: new Baker(), d: opts.sign ? { ...DRESS[owner], sign: opts.sign } : DRESS[owner], st: !!opts.static, root, hp: opts.hp ?? 1, flap: !!opts.flap && L <= 2 };
  // Only the player's live stand gets the 2-segment rounded corners.
  lod.seg = c.st ? 1 : 2;
  let m: Parts;
  try {
    m = L === 1 ? folding(c) : L === 2 ? wooden(c) : L === 3 ? kioskModel(c) : L === 4 ? shackModel(c) : palaceModel(c, !!opts.gilded);
  } finally { lod.seg = 1; }
  opts.decor?.(c.B, m.anchors, L);
  const body = clayMesh(c.B.build(), kit().world);
  body.name = 'standBody';
  root.add(body);
  if (c.st && c.hp <= 0.25) root.scale.set(1.04, 0.9, 1.02);
  const menuDraw = m.menuTex?.userData.redraw as ((f: (c: CanvasRenderingContext2D, w: number, h: number) => void) => void) | undefined;
  const domeY = m.dome?.position.y ?? 0;
  return {
    level: L, root, anchors: m.anchors, kid: m.kid, chairX: m.chairX, chairZ: m.chairZ, serveZ: m.serveZ, spin: m.spin,
    awning: m.awning, sign: m.sign, tearable: m.tearable, flapPivot: m.flapPivot, sticks: m.sticks,
    revealSeconds: L >= 4 ? 6 : 3,
    flourish(k) {
      const calm = reducedMotion();
      // L1 unfolds with a snap: flat on the ground, then up with an overshoot (on twos).
      if (L === 1 && !calm) {
        const sy = k < 0.17 ? 0.08 : [1.2, 0.9, 1.05, 1][Math.min(3, Math.floor((k - 0.17) * 12))];
        root.scale.set(1 + (1 - sy) * 0.08, sy, 1 + (1 - sy) * 0.08);
      }
      if (L === 2 && m.bell) m.bell.rotation.z = Math.sin(k * 26) * Math.exp(-k * 2) * 0.6;
      if (L === 3 && menuDraw) menuDraw(chalkMenu(Math.min(1, k / 1.5)));
      if (L >= 4 && m.neon && m.neonEnds) {
        // Buzz on letter by letter, flickering as each one catches (reduced motion: no flicker).
        const n = Math.min(m.neonEnds.length, Math.floor(k / 0.45));
        const flicker = !calm && Math.floor(k * 12) % 3 === 0 && n < m.neonEnds.length;
        m.neon.geometry.setDrawRange(0, n === 0 ? 0 : m.neonEnds[(flicker ? Math.max(0, n - 2) : n - 1)] ?? Infinity);
      }
      if (L === 5 && m.dome) {
        const s = Math.min(1, k / 2.2);
        m.dome.position.y = domeY - 2.4 * (1 - s) * (1 - s);
        m.dome.scale.setScalar(s < 1 ? RISE[Math.min(RISE.length - 1, Math.floor(s * 6))] * 0.4 + 0.6 : 1);
      }
      if (L === 5 && m.spin) m.spin.rotation.y = k * (6 - Math.min(5, k));
    },
    done() {
      if (L === 1) root.scale.set(1, 1, 1);
      if (m.bell) m.bell.rotation.z = 0;
      if (menuDraw) menuDraw(chalkMenu(1));
      if (m.neon) m.neon.geometry.setDrawRange(0, Infinity);
      if (m.dome) { m.dome.position.y = domeY; m.dome.scale.setScalar(1); }
    },
  };
}

export { INK, starGeo };
