// Clay animals (spec "Characters", "Defenses and gadgets", "The bay and its
// districts"): Captain Squawk, a round cream clay gull in a tiny captain's cap
// with a stolen lemon wedge in his beak; plain gulls; Maple Row's trotting
// clay dachshund; and Honkers the Guard Goose in a striped card neckerchief.
// Each builder keeps the userData handles the motion code already drives:
// gulls { wl, wr, lemon }, the dog { tail, legs }, the goose { neck, head, wl, wr, legs }.
import * as THREE from 'three';
import { Baker, sph, cap, cyl, cone, box, tor, rbox, lumpy, snake, GLOSS, PAPER } from './core.ts';
import { P } from './palette.ts';
import { DRESS } from './standKit.ts';
import { kit } from './kit.ts';

const INK = '#2E2A4F';
const BEAK = '#FF9F3A';

function part(B: Baker, cast = true) {
  const m = new THREE.Mesh(B.build(), kit().fig);
  m.castShadow = cast;
  return m;
}
const eyes = (B: Baker, x: number, y: number, z: number, r: number) => {
  for (const s of [-1, 1]) {
    B.add(sph(r, 8, 6), INK, { p: [s * x, y, z], fx: GLOSS });
    B.add(sph(r * 0.35, 6, 4), '#ffffff', { p: [s * x - r * 0.25, y + r * 0.35, z + r * 0.75], fx: GLOSS + 0.3 });
  }
};
/** A gull's wing, pivoting at the shoulder; side +1 reaches along +x, -1 along -x. */
function wing(side: 1 | -1, tip = '#9AA3B5') {
  const B = new Baker();
  B.add(lumpy(sph(0.3, 12, 8), 0.012, 6, side + 3), '#FFFDF6', { p: [side * 0.3, 0, -0.02], s: [1.15, 0.13, 0.5] });
  B.add(sph(0.16, 10, 6), tip, { p: [side * 0.62, 0, -0.06], s: [1, 0.16, 0.6] });
  return part(B);
}

/** A round cream gull; with `captain` he's Captain Squawk. */
export function gull(captain: boolean): THREE.Group {
  const g = new THREE.Group();
  const B = new Baker();
  B.add(lumpy(sph(0.32, 16, 12), 0.015, 5, captain ? 2 : 5), '#FFF6E6', { s: [1, 0.88, 1.35] });
  B.add(lumpy(sph(0.21, 14, 10), 0.01, 6, 1), '#FFF6E6', { p: [0, 0.2, 0.34] });
  B.add(cone(0.06, 0.2, 10), BEAK, { p: [0, 0.16, 0.6], r: [Math.PI / 2, 0, 0], s: [1, 1, 0.7] });
  B.add(cone(0.12, 0.26, 8), '#E6E1D6', { p: [0, 0.04, -0.46], r: [-Math.PI / 2 - 0.2, 0, 0], s: [1.4, 1, 0.35] }); // tail
  eyes(B, 0.085, 0.27, 0.5, 0.032);
  for (const s of [-1, 1]) B.add(sph(0.04, 6, 4), P.blush, { p: [s * 0.13, 0.17, 0.48], s: [1, 0.6, 0.5] });
  for (const s of [-1, 1]) B.add(cyl(0.018, 0.018, 0.18, 5), BEAK, { p: [s * 0.08, -0.32, 0.02] });
  if (captain) {
    // a tiny captain's cap: navy crown, white top, black brim, a gold anchor-ish button
    B.add(cyl(0.15, 0.16, 0.08, 16), '#FFFDF6', { p: [0, 0.42, 0.33], r: [-0.15, 0, 0] });
    B.add(cyl(0.165, 0.165, 0.04, 16), '#23214A', { p: [0, 0.37, 0.34], r: [-0.15, 0, 0] });
    B.add(cyl(0.12, 0.12, 0.02, 14, true), '#23214A', { p: [0, 0.36, 0.47], r: [0.35, 0, 0], s: [1, 1, 0.6] });
    B.add(sph(0.03, 8, 6), P.gold, { p: [0, 0.38, 0.5], fx: GLOSS + 0.2 });
    // the stolen lemon wedge, clamped in his beak
    B.add(new THREE.SphereGeometry(0.1, 10, 6, 0, Math.PI), P.lemon, { p: [0.04, 0.12, 0.62], r: [0, Math.PI / 2, Math.PI / 2], s: [1.2, 0.8, 0.5] });
    B.add(new THREE.CircleGeometry(0.1, 10, 0, Math.PI), '#FFF3B0', { p: [0.04, 0.12, 0.62], r: [0, Math.PI / 2, Math.PI / 2], s: [1.2, 0.8, 1] });
  }
  g.add(part(B));
  const wl = wing(1), wr = wing(-1);
  wl.position.set(0.18, 0.08, 0); wr.position.set(-0.18, 0.08, 0);
  g.add(wl, wr);
  const LB = new Baker();
  LB.add(lumpy(sph(0.11, 12, 9), 0.008, 10, 4), P.lemon, { s: [1, 0.8, 1.3] });
  LB.add(cone(0.035, 0.06, 6), P.lemon, { p: [0, 0, 0.15], r: [Math.PI / 2, 0, 0] });
  const lemon = part(LB);
  lemon.position.set(0, 0.12, 0.74);
  lemon.visible = false;
  g.add(lemon);
  g.userData = { wl, wr, lemon };
  return g;
}

/** Maple Row's clay dachshund: long sausage body, stubby legs, floppy ears. */
export function dog(): THREE.Group {
  const g = new THREE.Group();
  const brown = '#B0703E', dark = '#6E4226';
  const B = new Baker();
  B.add(lumpy(cap(0.15, 0.55, 6, 12), 0.012, 5, 2), brown, { p: [0, 0.3, 0], r: [Math.PI / 2, 0, 0] });
  B.add(lumpy(sph(0.15, 14, 10), 0.01, 6, 3), brown, { p: [0, 0.43, 0.42] });
  B.add(cap(0.075, 0.14, 4, 10), brown, { p: [0, 0.39, 0.57], r: [Math.PI / 2 - 0.15, 0, 0] });
  B.add(sph(0.045, 8, 6), INK, { p: [0, 0.4, 0.68], fx: GLOSS });
  eyes(B, 0.065, 0.48, 0.53, 0.025);
  for (const s of [-1, 1]) B.add(lumpy(sph(0.08, 10, 8), 0.008, 8, s + 5), dark, { p: [s * 0.13, 0.4, 0.38], s: [0.4, 1.3, 0.8], r: [0, 0, s * 0.25] });
  B.add(tor(0.155, 0.025, 6, 18), P.ging, { p: [0, 0.38, 0.29], r: [0.2, 0, 0] }); // a red collar
  B.add(sph(0.035, 8, 6), P.gold, { p: [0, 0.27, 0.33], fx: GLOSS });
  g.add(part(B));
  const TB = new Baker();
  TB.add(snake([[0, 0, 0], [0, 0.08, -0.12], [0, 0.18, -0.2]], 0.03, 8, 5), brown);
  const tail = part(TB);
  tail.position.set(0, 0.36, -0.38);
  g.add(tail);
  const LG = new Baker();
  LG.add(cap(0.045, 0.1, 3, 8), brown, { p: [0, -0.08, 0] });
  LG.add(sph(0.055, 8, 6), dark, { p: [0, -0.16, 0.02], s: [1, 0.6, 1.3] });
  const legGeo = LG.build();
  const legs = [[-0.08, 0.24], [0.08, 0.24], [-0.08, -0.22], [0.08, -0.22]].map(([x, z]) => {
    const l = new THREE.Mesh(legGeo, kit().fig);
    l.castShadow = true;
    l.position.set(x, 0.18, z);
    g.add(l);
    return l;
  });
  g.userData = { tail, legs };
  return g;
}

/** Honkers, the Guard Goose: white clay goose in a striped card neckerchief in his owner's colours (lemon and white for yours). */
export function goose(owner: keyof typeof DRESS = 'player'): THREE.Group {
  // the same trim as the gadget goose (defenses.ts): lemon and white on yours, the owner's main and accent on a rival's
  const bibA = owner === 'player' ? P.lemon : DRESS[owner].main, bibB = owner === 'player' ? '#FFFFFF' : DRESS[owner].accent;
  const g = new THREE.Group();
  const B = new Baker();
  B.add(lumpy(sph(0.3, 16, 12), 0.015, 5, 7), '#FFFDF6', { p: [0, 0.38, 0], s: [0.85, 0.75, 1.25] });
  B.add(cone(0.16, 0.3, 10), '#F1ECE2', { p: [0, 0.48, -0.42], r: [-Math.PI / 2 - 0.5, 0, 0], s: [1.3, 1, 0.4] });
  for (const s of [-1, 1]) {
    B.add(cyl(0.022, 0.022, 0.2, 6), BEAK, { p: [s * 0.1, 0.12, 0.02] });
    B.add(rbox(0.12, 0.03, 0.14, 0.012, 1), BEAK, { p: [s * 0.1, 0.02, 0.06] });
  }
  g.add(part(B));
  // neck and head pivot together so the motion code can stretch it into a HONK
  const neck = new THREE.Group();
  neck.position.set(0, 0.5, 0.25);
  const NB = new Baker();
  NB.add(cap(0.075, 0.32, 4, 10), '#FFFDF6', { p: [0, 0.2, 0.02], r: [0.2, 0, 0] });
  // the striped card neckerchief in the owner's colours, a band and a big triangular bib
  // under the chin with four bold stripes, so it reads at Street View
  for (let k = 0; k < 6; k++) NB.add(new THREE.CylinderGeometry(0.105, 0.115, 0.05, 14, 1, true, (k / 6) * Math.PI * 2, Math.PI / 3), k % 2 ? bibB : bibA, { p: [0, 0.04, 0.02], fx: PAPER });
  NB.add(cone(0.2, 0.34, 3), bibB, { p: [0, -0.1, 0.12], r: [Math.PI + 0.25, 0, 0], s: [1, 1, 0.22], fx: PAPER });
  for (let k = 0; k < 4; k++) NB.add(box(0.3 * (1 - k * 0.24), 0.045, 0.02), bibA, { p: [0, 0.02 - k * 0.075, 0.17 - k * 0.018], r: [0.25, 0, 0], fx: PAPER });
  neck.add(part(NB));
  const head = new THREE.Group();
  head.position.set(0, 0.42, 0.06);
  const HB = new Baker();
  HB.add(lumpy(sph(0.11, 12, 9), 0.006, 8, 2), '#FFFDF6', { s: [0.9, 0.9, 1.15] });
  HB.add(cone(0.05, 0.16, 10), BEAK, { p: [0, -0.02, 0.17], r: [Math.PI / 2, 0, 0], s: [1, 1, 0.7] });
  HB.add(sph(0.03, 6, 4), BEAK, { p: [0, 0.03, 0.12] });
  eyes(HB, 0.06, 0.03, 0.08, 0.022);
  // a cross little brow: clay snakes angled in
  for (const s of [-1, 1]) HB.add(snake([[s * 0.09, 0.08, 0.08], [s * 0.03, 0.06, 0.1]], 0.012, 4, 4), INK);
  head.add(part(HB));
  neck.add(head);
  g.add(neck);
  const W = (side: 1 | -1) => {
    const WB = new Baker();
    WB.add(lumpy(sph(0.22, 12, 8), 0.01, 6, side + 9), '#EEE9DF', { p: [side * 0.05, 0, -0.08], s: [0.35, 0.6, 1.1] });
    const w = part(WB);
    w.position.set(side * 0.24, 0.42, -0.02);
    g.add(w);
    return w;
  };
  const wl = W(1), wr = W(-1);
  g.userData = { neck, head, wl, wr };
  return g;
}
