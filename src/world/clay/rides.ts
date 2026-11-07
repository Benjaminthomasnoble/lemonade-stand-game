// Clay vehicles (spec "VIP arrivals", "The bay and its districts"):
// chunky clay choppers with lollipop-stick rotors dangling from a fishing
// line, carved-soap ships (yachts, pastel cruise ships, crate-piled freighters)
// pushing a sculpted clay wake, the Lemon Blimp, and button-wheeled crate
// trucks and pipe-cleaner bikes for street traffic. Each model bakes to one
// or two draws on the shared clay material.
import * as THREE from 'three';
import { Baker, sph, cap, cyl, cone, box, rbox, tor, lumpy, snake, hash, GLOSS, PAPER } from './core.ts';
import { P } from './palette.ts';
import { kit } from './kit.ts';

const INK = '#2E2A4F';
const GLASS = '#7FD3E6';
// neutral trims: no owner colours (gold is Sourwood's, chrome FizzCo's)
const BRASS = '#E9C98F';
const ROAD_GREY = '#8E8AA6';

function mesh(geo: THREE.BufferGeometry, cast = true) {
  const m = new THREE.Mesh(geo, kit().fig);
  m.castShadow = cast;
  return m;
}
function starShape(r0: number, r1: number) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 + Math.PI / 2, r = i % 2 ? r1 : r0; if (i) s.lineTo(Math.cos(a) * r, Math.sin(a) * r); else s.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
  return s;
}
const star = (r0: number, r1: number) => new THREE.ExtrudeGeometry(starShape(r0, r1), { depth: 0.04, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 });
function heartShape(s: number) {
  const h = new THREE.Shape();
  h.moveTo(0, -s * 0.9);
  h.bezierCurveTo(-s * 1.3, 0, -s * 0.7, s * 1.0, 0, s * 0.35);
  h.bezierCurveTo(s * 0.7, s * 1.0, s * 1.3, 0, 0, -s * 0.9);
  return h;
}
/** A striped lollipop: the tip of each rotor blade. */
function lolly(B: Baker, x: number, y: number, z: number, c: string) {
  for (let k = 0; k < 3; k++) B.add(tor(0.26 - k * 0.08, 0.05, 6, 18), k % 2 ? '#FFFFFF' : c, { p: [x, y, z], r: [Math.PI / 2, 0, 0], s: [1, 1, 0.7], fx: GLOSS });
  B.add(cyl(0.07, 0.07, 0.07, 10), c, { p: [x, y, z], fx: GLOSS });
}

// ---------- choppers ----------
/** A VIP client's comic paint job. */
export interface Paint { body: string; trim: string; mark: 'star' | 'heart' | 'bolt' | 'note' | 'crown'; vip: string; hat: string }
// Clients are neutral: no owner colours (plum and gold, neon pink, chrome, mango, cola) and no lemon,
// which belongs to lemons, coins, the player's things and the Lemon Blimp (spec "Palette and patterns").
export const PAINTS: Paint[] = [
  { body: P.blush, trim: P.white, mark: 'star', vip: '#F3D9C4', hat: P.terra }, // a movie star's pool party: the pink chopper with a star on its tail
  { body: P.teal, trim: P.cream, mark: 'bolt', vip: '#E3A27A', hat: P.green }, // a tech mogul
  { body: P.white, trim: P.blush, mark: 'heart', vip: '#F6C9A0', hat: P.blush }, // a celebrity wedding
  { body: '#9C8AD0', trim: P.green, mark: 'note', vip: '#B9784F', hat: P.terra }, // the music festival
  { body: P.green, trim: P.cream, mark: 'crown', vip: '#F3D9C4', hat: P.teal }, // the Governor's Gala
];
/** Pick a paint job that stays the same for a client. */
export function paintFor(client = ''): Paint {
  const k = client.toLowerCase();
  if (k.includes('movie')) return PAINTS[0];
  if (k.includes('tech')) return PAINTS[1];
  if (k.includes('wedding')) return PAINTS[2];
  if (k.includes('music') || k.includes('festival')) return PAINTS[3];
  if (k.includes('governor')) return PAINTS[4];
  let h = 0;
  for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0;
  return PAINTS[h % PAINTS.length];
}

export interface Chopper {
  group: THREE.Group;
  /** The squash-and-stretch layer under the group (the model itself). */
  body: THREE.Object3D;
  rotor: THREE.Object3D;
  tail: THREE.Object3D;
  /** The fishing line it dangles from; add it to the scene beside the group. */
  line: THREE.Line;
  /** Spin the rotors one pose (call on twos). */
  spin(f: number): void;
  /** Run the fishing line from the rotor hub up to `top`. */
  hang(top: THREE.Vector3): void;
}

/** `scale` follows the pad: a small chopper at a Pad, bigger at a Helipad, biggest at a Heliport. */
export function chopper(paint: Paint = PAINTS[0], scale = 1.4): Chopper {
  const g = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 0.94; // skids rest on the group's origin
  g.add(body);
  const B = new Baker();
  B.add(lumpy(sph(0.9, 24, 18), 0.03, 2, 1), paint.body, { s: [1.0, 0.86, 1.3] });
  // a shallow glossy windscreen pressed into the nose, under an open cockpit
  B.add(sph(0.5, 16, 10), GLASS, { p: [0, 0.3, 0.92], s: [1.05, 0.62, 0.42], fx: GLOSS });
  B.add(sph(0.14, 8, 6), '#FFFFFF', { p: [-0.22, 0.48, 1.08], s: [1, 0.6, 0.3], fx: GLOSS + 1 });
  B.add(tor(0.36, 0.06, 6, 20), paint.trim, { p: [0, 0.71, 0.42], r: [Math.PI / 2, 0, 0], s: [1, 1.15, 1] });
  B.add(tor(0.93, 0.07, 8, 32), paint.trim, { r: [0, Math.PI / 2, 0], s: [1.32, 0.88, 1], p: [0, -0.05, 0] });
  B.add(cyl(0.1, 0.26, 2.0, 12), paint.body, { p: [0, 0.2, -1.85], r: [Math.PI / 2 + 0.12, 0, 0] });
  B.add(rbox(0.08, 0.7, 0.5, 0.04, 2), paint.trim, { p: [0, 0.55, -2.75] });
  // the client's mark on each flank and on the tail fin
  const markGeo = () => paint.mark === 'heart'
    ? new THREE.ExtrudeGeometry(heartShape(0.18), { depth: 0.04, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 })
    : paint.mark === 'bolt'
      ? new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(0.05, 0.25), new THREE.Vector2(-0.12, -0.02), new THREE.Vector2(0.02, -0.02), new THREE.Vector2(-0.05, -0.25), new THREE.Vector2(0.14, 0.04), new THREE.Vector2(0.0, 0.04)]), { depth: 0.04, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 1 })
      : star(0.24, paint.mark === 'crown' ? 0.16 : 0.11);
  const markColor = paint.mark === 'star' ? P.white : paint.mark === 'heart' ? '#C8325A' : paint.mark === 'bolt' ? P.terra : paint.mark === 'note' ? INK : P.terra;
  for (const s of [-1, 1]) B.add(markGeo(), markColor, { p: [s * 0.88, 0.05, -0.2], r: [0, s * Math.PI / 2, 0], fx: GLOSS });
  B.add(markGeo(), markColor, { p: [0.06, 0.6, -2.75], r: [0, Math.PI / 2, 0], s: 0.8, fx: GLOSS });
  B.add(cyl(0.08, 0.1, 0.8, 10), INK, { p: [0, 1.05, 0] });
  for (const s of [-1, 1]) {
    B.add(rbox(0.1, 0.06, 2.2, 0.03, 2), P.stick, { p: [s * 0.62, -0.88, 0.05], fx: PAPER });
    B.add(snake([[s * 0.62, -0.88, 1.15], [s * 0.62, -0.8, 1.3]], 0.04, 4, 5), P.stick, { fx: PAPER });
    for (const z of [-0.5, 0.55]) B.add(cyl(0.035, 0.035, 0.5, 6), INK, { p: [s * 0.5, -0.66, z], r: [0, 0, -s * 0.45] });
  }
  // a tiny clay VIP in the open cockpit, head and party hat sitting proud of the canopy, facing forward
  B.add(sph(0.26, 14, 10), paint.vip, { p: [0, 0.8, 0.45] });
  for (const s of [-1, 1]) B.add(sph(0.035, 6, 4), INK, { p: [s * 0.09, 0.85, 0.69], fx: GLOSS });
  B.add(sph(0.05, 6, 4), P.blush, { p: [0, 0.77, 0.71] });
  B.add(cone(0.14, 0.28, 12), paint.hat, { p: [0, 1.17, 0.42], r: [0.15, 0, 0] });
  B.add(sph(0.045, 6, 4), P.white, { p: [0, 1.31, 0.44] });
  body.add(mesh(B.build()));
  const R = new Baker();
  for (const a of [0, Math.PI / 2]) {
    R.add(cap(0.045, 4.0, 2, 6), '#FFFAF0', { r: [Math.PI / 2, a, 0], fx: PAPER });
    for (const s of [-1, 1]) lolly(R, Math.sin(a) * s * 2.05, 0, Math.cos(a) * s * 2.05, [P.blush, P.green, P.terra, P.teal][(a ? 2 : 0) + (s > 0 ? 1 : 0)]);
  }
  R.add(sph(0.14, 10, 8), P.terra, { fx: GLOSS });
  const rotor = mesh(R.build());
  rotor.position.y = 1.45; // high enough to clear the VIP's party hat
  body.add(rotor);
  const T = new Baker();
  T.add(cap(0.03, 0.8, 2, 5), '#FFFAF0', { r: [0, 0, Math.PI / 2], fx: PAPER });
  lolly(T, 0.42, 0, 0, P.blush);
  lolly(T, -0.42, 0, 0, P.teal);
  const tail = mesh(T.build(), false);
  tail.scale.setScalar(0.6);
  tail.position.set(0.1, 0.6, -2.75);
  tail.rotation.y = Math.PI / 2;
  body.add(tail);
  // the clay model is about a third the size of the old placeholder chopper; the scene scales it to fit the pad
  g.scale.setScalar(scale);
  const lineGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 1, 0], 3));
  const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.65 }));
  line.frustumCulled = false;
  const p = new THREE.Vector3();
  return {
    group: g, body, rotor, tail, line,
    spin(f) { rotor.rotation.y = f * 0.55; tail.rotation.x = f * 0.9; },
    hang(top) {
      const a = lineGeo.attributes.position as THREE.BufferAttribute;
      rotor.getWorldPosition(p);
      a.setXYZ(0, p.x, p.y + 0.05, p.z);
      a.setXYZ(1, top.x, top.y, top.z);
      a.needsUpdate = true;
    },
  };
}

// ---------- ships ----------
export type ShipKind = 'yacht' | 'cruise' | 'freighter';
export interface Ship { group: THREE.Group; hull: THREE.Object3D; wake: THREE.Object3D; length: number; beam: number }

/** A carved-soap hull outline, bow toward +z. */
function hullGeo(L: number, W: number, depth: number) {
  const h = L / 2, w = W / 2;
  const s = new THREE.Shape();
  s.moveTo(0, h);
  s.quadraticCurveTo(w, h * 0.55, w, -h * 0.15);
  s.quadraticCurveTo(w, -h, 0, -h);
  s.quadraticCurveTo(-w, -h, -w, -h * 0.15);
  s.quadraticCurveTo(-w, h * 0.55, 0, h);
  const bev = Math.min(W, depth) * 0.22;
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 4, curveSegments: 18 });
  g.rotateX(-Math.PI / 2);
  return g;
}
const SOAP = { yacht: '#F7C6CF', cruise: '#F9D6E0', freighter: '#E9D3A8' }; // a blush-soap yacht stands out from the teal resin

export function ship(kind: ShipKind): Ship {
  const g = new THREE.Group(), B = new Baker();
  const L = kind === 'yacht' ? 4.2 : kind === 'cruise' ? 9 : 10, W = kind === 'yacht' ? 1.9 : kind === 'cruise' ? 2.8 : 3.2;
  const lift = -0.32;
  B.add(hullGeo(L, W, kind === 'yacht' ? 0.55 : 0.9), SOAP[kind], { p: [0, lift, 0], fx: GLOSS });
  // the carved "soap" groove that runs round the hull
  const groove: [number, number, number][] = [];
  for (let i = 0; i <= 16; i++) { const a = (i / 16) * Math.PI * 2; groove.push([Math.sin(a) * W * 0.5, 0.12, Math.cos(a) * L * 0.5 * (Math.cos(a) > 0 ? 0.96 : 0.92)]); }
  B.add(snake(groove, 0.035, 48, 5), P.cream);
  if (kind === 'yacht') {
    B.add(rbox(1.1, 0.7, 1.1, 0.2, 3), P.cream, { p: [0, 0.6, -0.35] });
    B.add(rbox(1.25, 0.12, 1.25, 0.06, 2), P.terra, { p: [0, 1.0, -0.35] });
    for (const s of [-1, 1]) { B.add(cyl(0.13, 0.13, 0.05, 14), GLASS, { p: [s * 0.56, 0.62, -0.35], r: [0, 0, Math.PI / 2], fx: GLOSS }); B.add(tor(0.14, 0.03, 6, 14), BRASS, { p: [s * 0.57, 0.62, -0.35], r: [0, Math.PI / 2, 0], fx: GLOSS }); }
    B.add(cyl(0.03, 0.03, 1.2, 6), P.walnut, { p: [0, 1.6, -0.35], fx: PAPER });
    B.add(cone(0.25, 0.5, 3), P.terra, { p: [0.22, 1.95, -0.35], r: [0, 0, -Math.PI / 2], s: [1, 1, 0.12], fx: PAPER });
    B.add(tor(0.22, 0.07, 6, 14), P.terra, { p: [0, 0.4, 0.9], r: [0.2, 0, 0] });
  } else if (kind === 'cruise') {
    // three pastel decks stepping up, rows of bead portholes, a striped funnel
    const decks = [[2.5, 6.6, '#FFFDF6'], [2.2, 5.2, '#BFE8F2'], [1.8, 3.6, '#FFFDF6']] as const;
    decks.forEach(([dw, dl, c], i) => {
      const y = 0.75 + i * 0.6;
      B.add(rbox(dw, 0.55, dl, 0.18, 3), c, { p: [0, y, -0.4 - i * 0.3] });
      B.add(rbox(dw + 0.08, 0.08, dl + 0.08, 0.04, 2), [P.terra, P.teal, P.blush][i], { p: [0, y + 0.3, -0.4 - i * 0.3] });
      for (const s of [-1, 1]) for (let k = 0; k < Math.floor(dl / 0.55); k++) B.add(sph(0.08, 8, 6), GLASS, { p: [s * dw * 0.5, y, -0.4 - i * 0.3 - dl / 2 + 0.35 + k * 0.55], s: [0.4, 1, 1], fx: GLOSS });
    });
    for (let k = 0; k < 3; k++) B.add(cyl(0.42, 0.45, 0.32, 16), k % 2 ? '#FFFFFF' : P.terra, { p: [0, 2.75 + k * 0.32, -1.6] });
    B.add(sph(0.4, 12, 8), P.cream, { p: [0, 3.9, -1.6], s: [1, 0.35, 1] });
    for (let k = 0; k < 7; k++) B.add(sph(0.09, 6, 5), [P.terra, P.blush, P.teal, P.green][k % 4], { p: [0, 2.6 + Math.sin((k / 6) * Math.PI) * 0.6, 3.2 - k * 1.0], fx: GLOSS + 0.6 }); // bunting beads
    B.add(lumpy(tor(0.35, 0.09, 6, 16), 0.02, 4, 2), P.terra, { p: [W * 0.5 + 0.02, 0.5, 1.8], r: [0, Math.PI / 2, 0] }); // life ring
  } else {
    // a freighter: bridge at the stern, a deck piled with popsicle-stick citrus crates, a crane
    B.add(rbox(2.4, 1.3, 1.6, 0.2, 3), P.cream, { p: [0, 1.15, -L / 2 + 1.2] });
    B.add(rbox(2.6, 0.12, 1.8, 0.05, 2), P.terra, { p: [0, 1.85, -L / 2 + 1.2] });
    for (let k = 0; k < 4; k++) B.add(rbox(0.4, 0.28, 0.06, 0.04, 1), GLASS, { p: [-0.75 + k * 0.5, 1.45, -L / 2 + 2.02], fx: GLOSS });
    B.add(cyl(0.3, 0.34, 0.8, 14), '#5F5A74', { p: [0, 2.3, -L / 2 + 1.0] });
    B.add(cyl(0.31, 0.31, 0.16, 14), P.teal, { p: [0, 2.45, -L / 2 + 1.0] });
    const crateCols = ['#C79A62', '#D9AE72', '#B88A55'];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 2; c++) for (let h = 0; h < ((r + c) % 3 === 0 ? 2 : 3 - ((r + c) % 2)); h++) {
      const x = -0.62 + c * 1.24, z = -L / 2 + 3.0 + r * 1.35, y = 0.85 + h * 0.75;
      B.add(rbox(1.1, 0.7, 1.15, 0.05, 2), crateCols[(r + c + h) % 3], { p: [x, y, z], r: [0, (hash(r * 3 + c, h) - 0.5) * 0.12, 0], fx: PAPER });
      for (const yy of [-0.2, 0.2]) B.add(box(1.14, 0.06, 1.19), '#8B5E3C', { p: [x, y + yy, z], fx: PAPER });
      B.add(rbox(0.5, 0.3, 0.02, 0.02, 1), P.cream, { p: [x, y, z + 0.59], fx: PAPER }); // the crate label, with a clay lemon on it
      B.add(lumpy(sph(0.09, 8, 6), 0.01, 8, r + c + h), P.lemon, { p: [x, y, z + 0.62], s: [1.3, 1, 0.5] });
    }
    B.add(cyl(0.07, 0.07, 3, 8), P.stick, { p: [W * 0.3, 2.3, L / 2 - 1.4], fx: PAPER });
    B.add(lumpy(tor(0.32, 0.09, 6, 16), 0.02, 4, 2), P.terra, { p: [W * 0.5 + 0.02, 0.5, -L / 2 + 2.4], r: [0, Math.PI / 2, 0] });
  }
  // a horn on the bridge (it plays the theme's F-A-D call)
  B.add(cone(0.08, 0.22, 10), P.terra, { p: [0.3, kind === 'yacht' ? 1.12 : kind === 'cruise' ? 2.7 : 2.0, kind === 'freighter' ? -L / 2 + 1.7 : 0], r: [Math.PI / 2, 0, 0], fx: GLOSS });
  const hull = mesh(B.build());
  g.add(hull);
  // sculpted clay wake: a V of white ridges and a bow curl
  const Wk = new Baker();
  const sc = L / 3.4;
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++) Wk.add(snake([[s * (W * 0.47 + k * 0.3), -0.25, -L * 0.18 - k * 0.6 * sc], [s * (W * 0.47 + 0.5 + k * 0.5 * sc), -0.25, -L * 0.47 - k * 0.7 * sc], [s * (W * 0.47 + 1.1 + k * 0.7 * sc), -0.25, -L * 0.76 - k * 0.8 * sc]], (0.1 - k * 0.02) * Math.sqrt(sc), 12, 6), '#FFFFFF');
  Wk.add(lumpy(tor(W * 0.52, 0.13 * Math.sqrt(sc), 6, 20, Math.PI), 0.03, 4, 2), '#FFFFFF', { p: [0, -0.22, L * 0.36], r: [Math.PI / 2, 0, 0], s: [1.1, 0.8, 1] });
  for (let k = 0; k < 8; k++) Wk.add(lumpy(sph(0.14 * Math.sqrt(sc), 8, 6), 0.03, 8, k), '#FFFFFF', { p: [(hash(k) - 0.5) * W * 0.8, -0.22, -L * 0.45 - hash(k, 2) * L * 0.45], s: [1.3, 0.5, 1] });
  const wake = new THREE.Mesh(Wk.build(), kit().world);
  g.add(wake);
  return { group: g, hull, wake, length: L, beam: W };
}

// ---------- the Lemon Blimp ----------
export interface Blimp { group: THREE.Group; body: THREE.Object3D; prop: THREE.Object3D }
/** A fat lemon-clay blimp with a leaf fin and a sun-hat gondola; it glows like a paper lantern at night. */
export function blimp(): Blimp {
  const g = new THREE.Group(), body = new THREE.Group();
  g.add(body);
  const B = new Baker();
  B.add(lumpy(sph(2.2, 32, 22), 0.05, 1.2, 3), P.lemon, { s: [1, 0.92, 1.9], fx: 0.75 });
  B.add(cone(0.35, 0.6, 14), P.lemon, { p: [0, 0, 4.25], r: [Math.PI / 2, 0, 0], fx: 0.75 }); // the lemon's nub
  B.add(sph(0.3, 10, 8), '#FFF3B0', { p: [-0.9, 1.3, 2.2], s: [1.6, 0.6, 1], fx: GLOSS + 0.4 });
  // a leaf fin on top and two smaller leaves either side
  const leaf = (s: number) => { const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.quadraticCurveTo(0.9 * s, 0.7 * s, 0, 2.0 * s); sh.quadraticCurveTo(-0.9 * s, 0.7 * s, 0, 0); return new THREE.ExtrudeGeometry(sh, { depth: 0.08, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 2 }); };
  B.add(leaf(1), P.green, { p: [0, 1.6, -3.0], r: [0.9, Math.PI / 2, 0] });
  for (const s of [-1, 1]) B.add(leaf(0.75), P.green, { p: [s * 1.3, 0, -3.2], r: [0, Math.PI / 2, s * 1.4] });
  B.add(snake([[0, 1.95, -2.6], [0, 2.35, -2.2]], 0.07, 6, 5), P.walnut);
  // a LOTTIE'S stripe band
  // (a torus round the belly, following the hull's cross-section; paper, and it glows with the body at night)
  B.add(lumpy(tor(2.12, 0.1, 8, 40), 0.01, 4, 2), '#FFFFFF', { s: [2.24 / 2.12, 2.06 / 2.12, 1], p: [0, 0, 0], fx: PAPER + 0.75 });
  // the gondola: a straw sun hat with a terracotta band, hung under the belly
  B.add(lumpy(cyl(1.0, 1.0, 0.07, 26), 0.015, 3, 4), P.straw, { p: [0, -2.7, 0.2], fx: PAPER });
  B.add(new THREE.SphereGeometry(0.6, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), P.straw, { p: [0, -2.68, 0.2], s: [1, 0.85, 1], fx: PAPER });
  B.add(cyl(0.61, 0.61, 0.13, 18, true), P.terra, { p: [0, -2.6, 0.2] });
  B.add(lumpy(sph(0.18, 8, 6), 0.01, 8, 2), P.lemon, { p: [0.5, -2.58, 0.55] }); // the lemon on the band
  for (const [x, z] of [[-0.4, -0.1], [0.4, -0.1], [-0.4, 0.5], [0.4, 0.5]]) B.add(cyl(0.02, 0.02, 0.5, 4), INK, { p: [x, -2.3, z] });
  for (let k = 0; k < 4; k++) B.add(sph(0.07, 6, 5), GLASS, { p: [Math.cos(k * 1.57) * 0.62, -2.52, 0.2 + Math.sin(k * 1.57) * 0.62], fx: GLOSS + 0.8 });
  body.add(mesh(B.build()));
  const PB = new Baker();
  for (let k = 0; k < 3; k++) PB.add(rbox(0.12, 0.7, 0.04, 0.03, 1), P.stick, { r: [0, 0, (k / 3) * Math.PI * 2], p: [0, 0, 0], fx: PAPER });
  PB.add(sph(0.1, 8, 6), P.terra, { fx: GLOSS });
  const prop = mesh(PB.build(), false);
  prop.position.set(0, -2.45, -0.75);
  body.add(prop);
  return { group: g, body, prop };
}

// ---------- street traffic ----------
const buttonWheel = (r: number) => {
  const W = new Baker();
  W.add(lumpy(cyl(r, r, r * 0.53, 24), 0.01, 4, 2), INK, { r: [0, 0, Math.PI / 2] });
  W.add(tor(r * 0.8, r * 0.11, 6, 22), '#4A4570', { r: [0, Math.PI / 2, 0], p: [r * 0.27, 0, 0] });
  for (let k = 0; k < 4; k++) W.add(cyl(r * 0.13, r * 0.13, r * 0.58, 8), '#151325', { p: [0, Math.cos(k * 1.571 + 0.78) * r * 0.29, Math.sin(k * 1.571 + 0.78) * r * 0.29], r: [0, 0, Math.PI / 2] });
  return W.build();
};
/** Popsicle-stick crate tints: no two neighbours quite the same. */
export const CRATE_TINTS = ['#C79A62', '#D9AE72', '#B88A55', '#E0B886'];
/**
 * A popsicle-stick citrus crate (centre of its base at x, y, z): pressed slat seams and corner battens, a
 * masking-tape label, and 3 to 6 lemons of mixed sizes heaped unevenly on top. `pink` fills it with
 * pink-lemonade bottles instead (the VIP order).
 */
export function citrusCrate(B: Baker, x: number, y: number, z: number, w: number, h: number, d: number, seed: number, pink = false) {
  const tint = CRATE_TINTS[Math.floor(hash(seed, 3) * CRATE_TINTS.length)];
  const seam = '#9C7444', yaw = (hash(seed, 5) - 0.5) * 0.14;
  const at = (dx: number, dz: number): [number, number] => [x + dx * Math.cos(yaw) + dz * Math.sin(yaw), z - dx * Math.sin(yaw) + dz * Math.cos(yaw)];
  const put = (geo: THREE.BufferGeometry, c: string, dx: number, dy: number, dz: number, fx = PAPER) => { const [px, pz] = at(dx, dz); B.add(geo, c, { p: [px, y + dy, pz], r: [0, yaw, 0], fx }); };
  put(rbox(w, h, d, 0.04, 2), tint, 0, h / 2, 0);
  for (const k of [1, 2]) put(box(w + 0.02, h * 0.035, d + 0.02), seam, 0, (h * k) / 3, 0); // slat seams pressed into the sides
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(box(w * 0.08, h * 1.02, d * 0.08), shade(tint), sx * (w / 2 - w * 0.03), h / 2, sz * (d / 2 - d * 0.03));
  put(rbox(w * 0.46, h * 0.3, 0.02, 0.02, 1), P.cream, (hash(seed, 7) - 0.5) * w * 0.2, h * 0.52, d / 2 + 0.012); // a tape label
  put(sph(h * 0.07, 8, 6), pink ? '#F27FA0' : P.lemon, (hash(seed, 7) - 0.5) * w * 0.2, h * 0.52, d / 2 + 0.03);
  if (pink) {
    put(box(w + 0.03, h * 0.12, d + 0.03), '#F27FA0', 0, h * 0.82, 0); // pink tape round the top: the VIP order
    for (let k = 0; k < 6; k++) {
      const bx = ((k % 3) - 1) * w * 0.28, bz = (Math.floor(k / 3) - 0.5) * d * 0.4;
      put(cyl(w * 0.09, w * 0.1, h * 0.5, 10), '#F7A8C0', bx, h * 0.95, bz, GLOSS);
      put(cyl(w * 0.06, w * 0.06, h * 0.08, 8), P.cream, bx, h * 1.24, bz);
    }
    return;
  }
  const n = 3 + Math.floor(hash(seed, 11) * 4);
  for (let k = 0; k < n; k++) {
    const r = Math.min(w, d) * (0.15 + hash(seed, 20 + k) * 0.08);
    const lx = (hash(seed, 40 + k) - 0.5) * (w - r * 2), lz = (hash(seed, 60 + k) - 0.5) * (d - r * 2);
    const ly = h + r * (0.4 + (k >= 3 ? 1.1 : 0) + hash(seed, 80 + k) * 0.25); // a few ride up on the first layer
    const [px, pz] = at(lx, lz);
    B.add(lumpy(sph(r, 9, 7), 0.012, 10, seed + k), P.lemon, { p: [px, y + ly, pz], s: [1.25, 1, 1], r: [0, hash(seed, 90 + k) * 3, 0.3] });
  }
}
const shade = (hex: string) => { const c = new THREE.Color(hex).multiplyScalar(0.82); return '#' + c.getHexString(); };

export interface Truck { group: THREE.Group; body: THREE.Object3D; wheels: THREE.Object3D[] }
/** A clay box truck stacked with lemon crates, on button wheels. */
export function truck(cab: string = P.terra, skin: string = P.skin): Truck {
  const g = new THREE.Group(), body = new THREE.Group();
  g.add(body);
  const B = new Baker();
  B.add(lumpy(rbox(1.7, 1.3, 1.5, 0.35, 4), 0.02, 2, 1), cab, { p: [0, 1.05, 1.0] });
  B.add(lumpy(rbox(1.6, 0.75, 0.95, 0.3, 4), 0.02, 2, 2), cab, { p: [0, 0.75, 2.05] });
  // an open windscreen with the driver looking out: a clay head and a cream cap
  B.add(rbox(1.3, 0.55, 0.08, 0.08, 2), '#3d3a5c', { p: [0, 1.35, 1.72], r: [-0.2, 0, 0] });
  B.add(rbox(1.38, 0.62, 0.06, 0.05, 2), P.cream, { p: [0, 1.35, 1.7], r: [-0.2, 0, 0], s: [1, 1, 0.6] });
  B.add(lumpy(sph(0.2, 12, 9), 0.01, 8, 5), skin, { p: [0.3, 1.32, 1.72] });
  for (const e of [-1, 1]) B.add(sph(0.025, 6, 4), INK, { p: [0.3 + e * 0.07, 1.36, 1.9], fx: GLOSS });
  B.add(sph(0.2, 12, 8, ), P.cream, { p: [0.3, 1.45, 1.7], s: [1.05, 0.5, 1.05] });
  B.add(cyl(0.16, 0.16, 0.03, 12), P.cream, { p: [0.3, 1.45, 1.86], s: [1, 1, 0.8] });
  for (const s of [-1, 1]) {
    B.add(sph(0.16, 12, 9), '#FFF3C4', { p: [s * 0.55, 0.85, 2.5], s: [1, 1, 0.5], fx: GLOSS + 0.8 });
    B.add(tor(0.17, 0.035, 6, 14), ROAD_GREY, { p: [s * 0.55, 0.85, 2.52], fx: GLOSS });
    B.add(rbox(0.06, 0.4, 0.6, 0.03, 2), GLASS, { p: [s * 0.86, 1.3, 1.0], fx: GLOSS });
  }
  B.add(rbox(1.75, 0.18, 0.2, 0.08, 2), ROAD_GREY, { p: [0, 0.48, 2.55], fx: GLOSS });
  B.add(rbox(1.8, 0.2, 2.2, 0.06, 2), P.walnut, { p: [0, 0.55, -0.9], fx: PAPER });
  // popsicle-stick citrus crates, four on the bed and one riding on top, lemons heaped every which way
  [[-0.42, 0.65, -0.4], [0.42, 0.65, -0.4], [-0.42, 0.65, -1.4], [0.42, 0.65, -1.4], [0.05, 1.27, -0.9]].forEach(([x, yy, z], k) =>
    citrusCrate(B, x, yy, z, 0.78, 0.6, 0.86, Math.round(hash(cab.length + k, skin.length) * 97) + k * 13));
  body.add(mesh(B.build()));
  const wg = buttonWheel(0.45);
  const wheels: THREE.Object3D[] = [];
  for (const [x, z] of [[-0.85, 1.75], [0.85, 1.75], [-0.85, -1.2], [0.85, -1.2]]) {
    const w = new THREE.Mesh(wg, kit().fig);
    w.castShadow = true;
    w.position.set(x, 0.45, z);
    if (x < 0) w.rotation.y = Math.PI;
    g.add(w);
    wheels.push(w);
  }
  return { group: g, body, wheels };
}

export interface Bike { group: THREE.Group; wheels: THREE.Object3D[] }
/** A pipe-cleaner bike with an ice-cream box and a striped parasol. */
export function bike(frame: string = P.blush): Bike {
  const g = new THREE.Group(), B = new Baker();
  const fuzz = (pts: [number, number, number][], c: string) => B.add(lumpy(snake(pts, 0.06, 24, 7), 0.018, 30, pts.length), c);
  fuzz([[0, 0.5, -0.65], [0, 1.0, -0.15], [0, 1.0, 0.45]], frame);
  fuzz([[0, 0.5, -0.65], [0, 0.5, 0.15], [0, 1.0, -0.15]], frame);
  fuzz([[0, 0.5, 0.15], [0, 1.0, 0.45]], frame);
  fuzz([[0, 1.0, 0.45], [0, 0.5, 0.75]], P.teal);
  fuzz([[0, 1.0, 0.45], [0, 1.35, 0.4], [-0.3, 1.4, 0.4]], P.teal);
  fuzz([[0, 1.35, 0.4], [0.3, 1.4, 0.4]], P.teal);
  fuzz([[0, 1.0, -0.15], [0, 1.22, -0.2]], frame);
  B.add(lumpy(sph(0.15, 10, 8), 0.01, 8, 1), INK, { p: [0, 1.28, -0.2], s: [1, 0.5, 1.4] });
  B.add(rbox(0.75, 0.55, 0.65, 0.1, 3), P.cream, { p: [0, 0.95, 1.15] });
  B.add(box(0.77, 0.12, 0.67), P.teal, { p: [0, 1.05, 1.15] });
  B.add(lumpy(sph(0.14, 10, 8), 0.01, 8, 3), P.blush, { p: [-0.15, 1.32, 1.15] });
  B.add(lumpy(sph(0.13, 10, 8), 0.01, 8, 4), '#FFF3E0', { p: [0.12, 1.3, 1.2] });
  B.add(cone(0.09, 0.22, 10), P.stick, { p: [-0.15, 1.2, 1.15], r: [Math.PI, 0, 0] });
  B.add(cyl(0.025, 0.025, 1.2, 6), P.cream, { p: [0.25, 1.75, 1.2] });
  for (let k = 0; k < 8; k++) B.add(new THREE.ConeGeometry(0.75, 0.32, 3, 1, true, (k / 8) * Math.PI * 2, Math.PI / 4), k % 2 ? P.terra : P.cream, { p: [0.25, 2.4, 1.2], fx: PAPER }); // terracotta and cream: the parasol isn't the player's
  g.add(mesh(B.build()));
  const wg = buttonWheel(0.38); // button wheels, like the trucks'
  const wheels: THREE.Object3D[] = [];
  for (const z of [-0.65, 0.75]) { const w = new THREE.Mesh(wg, kit().fig); w.castShadow = true; w.position.set(0, 0.45, z); g.add(w); wheels.push(w); }
  return { group: g, wheels };
}
