// Rival schemes as props on the stands (spec: Rival schemes; the world brief):
// - Cold Brew's smear posters, pasted crooked across the front of your stand: a
//   sick lemon (X eyes, wobbly mouth) beside a smug coffee bean, on Cold Brew
//   brown with pink tape.
// - Price-war markdown signs on a rival stand at war: red-slashed price cards on
//   stakes, a big down arrow, and a starburst.
// - The Cease-and-Desist fruit basket on your counter: a wicker basket of fruit
//   with a white envelope and a red seal tucked in. Lottie keeps the basket.
// All are plain baked clay, built in the stand's own frame from its anchors.
import * as THREE from 'three';
import type { Anchors } from './stands.ts';
import { Baker, GLOSS, PAPER, box, cone, cyl, lathe, lumpy, sph, tor } from './core.ts';
import { P } from './palette.ts';
import { DRESS, INK, rope, stick } from './standKit.ts';

type V3 = [number, number, number];
const at = (p: V3, r: V3 = [0, 0, 0]) => new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), new THREE.Vector3(1, 1, 1));

/** One smear poster, facing +z, centred on the origin. */
function poster(seed: number): THREE.BufferGeometry {
  const B = new Baker();
  const brown = DRESS.coldbrew.main, pink = DRESS.coldbrew.accent;
  B.add(box(0.62, 0.78, 0.02), brown, { fx: PAPER });
  B.add(box(0.54, 0.7, 0.024), '#f3e7d3', { fx: PAPER });
  // The sick lemon: X eyes and a wobbly frown.
  B.add(sph(0.15, 10, 8), '#d8d27a', { p: [-0.08, 0.12, 0.02], s: [1.3, 1, 0.25] });
  for (const ex of [-0.13, -0.03]) for (const d of [-1, 1]) B.add(box(0.06, 0.012, 0.01), INK, { p: [-0.0 + ex, 0.16, 0.06], r: [0, 0, d * 0.8] });
  const frown: V3[] = [];
  for (let i = 0; i <= 6; i++) frown.push([-0.15 + i * 0.024, 0.06 + Math.sin(i * 2.1) * 0.012 - Math.sin((i / 6) * Math.PI) * 0.02, 0.065]);
  B.add(rope(frown, 0.008, 8, 3), INK);
  // The smug coffee bean beside it.
  B.add(sph(0.09, 8, 6), '#5a3a26', { p: [0.15, 0.06, 0.03], s: [0.8, 1.15, 0.35], r: [0, 0, -0.3] });
  B.add(box(0.012, 0.15, 0.01), '#2f1d12', { p: [0.15, 0.06, 0.065], r: [0, 0, -0.3] });
  // A thumbs-down under them, and pink tape on two corners.
  B.add(box(0.12, 0.08, 0.02), pink, { p: [0, -0.2, 0.02] });
  B.add(box(0.04, 0.1, 0.02), pink, { p: [0.03, -0.29, 0.02] });
  B.add(box(0.36, 0.035, 0.02), '#5a3a26', { p: [0, -0.07, 0.02] });
  for (const [x, y, r] of [[-0.28, 0.36, 0.7], [0.28, -0.36, 0.6 + seed * 0.2]] as const) B.add(box(0.18, 0.06, 0.03), pink, { p: [x, y, 0.015], r: [0, 0, r], fx: PAPER });
  return B.build();
}

/** Two smear posters pasted crooked either side of the OPEN card. */
export function smearPosters(a: Anchors): THREE.BufferGeometry {
  const B = new Baker();
  const [cx, cy, cz] = a.card;
  B.raw(poster(0), at([cx - 0.85, cy - 0.12, cz + 0.07], [0, 0, 0.12]));
  B.raw(poster(1), at([cx + 0.85, cy - 0.15, cz + 0.07], [0, 0, -0.09]));
  return B.build();
}

/** Price-war markdown signs on stakes in front of a rival stand, plus a starburst on the counter front. */
export function markdownSigns(a: Anchors): THREE.BufferGeometry {
  const B = new Baker();
  const RED = '#E23B3B';
  const [cx, , cz] = a.card;
  for (const [x, z, ry, k] of [[-1.25, cz + 0.85, 0.25, 0], [1.2, cz + 0.95, -0.2, 1]] as const) {
    const S = new Baker();
    stick(S, 0.9, [0, 0.45, -0.03], [0, 0, 0], P.stick, 0.08, 0.05);
    S.add(box(0.62, 0.46, 0.03), P.white, { p: [0, 0.98, 0], fx: PAPER });
    S.add(box(0.66, 0.5, 0.02), RED, { p: [0, 0.98, -0.02], fx: PAPER });
    // The old price, slashed through, and a big red down arrow.
    for (let i = 0; i < 3; i++) S.add(box(0.06, 0.12, 0.01), INK, { p: [-0.18 + i * 0.09, 1.06, 0.02] });
    S.add(box(0.36, 0.04, 0.02), RED, { p: [-0.09, 1.06, 0.03], r: [0, 0, 0.35] });
    S.add(box(0.06, 0.16, 0.02), RED, { p: [0.19, 1.0, 0.025] });
    S.add(cone(0.08, 0.12, 3), RED, { p: [0.19, 0.88, 0.025], r: [0, 0, Math.PI], s: [1, 1, 0.25] });
    S.add(box(0.3, 0.05, 0.01), INK, { p: [-0.08, 0.86, 0.02] });
    B.raw(S.build(), at([cx + x, 0, z], [0, ry, k ? 0.06 : -0.05]));
  }
  // A starburst slapped on the counter front.
  const [, cy] = a.card;
  const burst = new Baker();
  for (let k = 0; k < 12; k++) burst.add(cone(0.08, 0.2, 3), '#FFD23F', { p: [Math.cos((k / 12) * Math.PI * 2) * 0.2, Math.sin((k / 12) * Math.PI * 2) * 0.2, 0], r: [0, 0, (k / 12) * Math.PI * 2 - Math.PI / 2], s: [1, 1, 0.15], fx: PAPER });
  burst.add(cyl(0.22, 0.22, 0.03, 16), '#FFD23F', { r: [Math.PI / 2, 0, 0], fx: PAPER });
  burst.add(cone(0.07, 0.12, 3), RED, { p: [0, -0.02, 0.03], r: [0, 0, Math.PI], s: [1, 1, 0.2] });
  burst.add(box(0.05, 0.1, 0.02), RED, { p: [0, 0.08, 0.03] });
  B.raw(burst.build(), at([cx + 0.8, cy + 0.12, a.card[2] + 0.05], [0, 0, 0.2]));
  return B.build();
}

/** The Cease-and-Desist fruit basket, sitting on the counter at the left end. */
export function fruitBasket(a: Anchors): THREE.BufferGeometry {
  const B = new Baker();
  const WICKER = '#c99a5b', DARK = '#a5763f';
  B.add(lumpy(lathe([[0, 0], [0.16, 0], [0.22, 0.05], [0.25, 0.16], [0.23, 0.17], [0.2, 0.06], [0, 0.03]], 14), 0.006, 10, 3), WICKER, {});
  for (const y of [0.05, 0.1, 0.15]) B.add(tor(0.21 + y * 0.25, 0.012, 4, 16), DARK, { p: [0, y, 0], r: [Math.PI / 2, 0, 0] });
  B.add(tor(0.22, 0.018, 5, 14, Math.PI), DARK, { p: [0, 0.16, 0] });
  // Fruit heaped up: an orange, two apples, a pear, a grape bunch and a pineapple top.
  B.add(lumpy(sph(0.08, 10, 8), 0.006, 14, 1), '#F28C28', { p: [-0.08, 0.2, 0.04] });
  B.add(sph(0.07, 10, 8), '#d6455e', { p: [0.08, 0.19, 0.06], fx: GLOSS });
  B.add(sph(0.065, 10, 8), '#8cc152', { p: [0.04, 0.21, -0.08], fx: GLOSS });
  B.add(sph(0.06, 8, 6), '#c9d36a', { p: [-0.07, 0.22, -0.08], s: [1, 1.35, 1] });
  for (let k = 0; k < 6; k++) B.add(sph(0.028, 6, 5), '#7a4f9a', { p: [0.13 + (k % 2) * 0.03, 0.2 + Math.floor(k / 2) * 0.03, -0.01], fx: GLOSS });
  for (let k = 0; k < 4; k++) B.add(cone(0.02, 0.12, 4), P.green, { p: [-0.02, 0.3, 0], r: [0.3 * (k - 1.5), k, 0.2 * (k - 1.5)] });
  // The letter tucked in the front: a white envelope with a red wax seal.
  // The letter tucked in the front: a cream envelope with its V flap creased in ink, a lumpy wax seal
  // dripping off-centre on the flap, and a rolled legal scroll tied with a red ribbon behind it.
  const E = new Baker();
  E.add(box(0.2, 0.13, 0.01), '#fbf3e1', { fx: PAPER });
  for (const d of [-1, 1]) E.add(box(0.115, 0.008, 0.012), INK, { p: [d * 0.05, 0.03, 0.007], r: [0, 0, d * 0.62] });
  E.add(lumpy(sph(0.026, 8, 6), 0.006, 30, 7), '#C8102E', { p: [0.035, 0.0, 0.012], s: [1.1, 1, 0.45], fx: GLOSS });
  E.add(sph(0.011, 5, 4), '#C8102E', { p: [0.044, -0.03, 0.012], s: [0.8, 1.6, 0.5], fx: GLOSS });
  B.raw(E.build(), at([-0.02, 0.21, 0.17], [-0.3, 0, 0.12]));
  B.add(cyl(0.02, 0.02, 0.22, 8), '#f3e7c8', { p: [0.06, 0.27, 0.11], r: [0.2, 0, Math.PI / 2 - 0.5], fx: PAPER });
  B.add(tor(0.023, 0.007, 4, 10), '#C8102E', { p: [0.06, 0.27, 0.11], r: [0.2, Math.PI / 2, -0.5] });
  B.add(box(0.012, 0.06, 0.004), '#C8102E', { p: [0.07, 0.235, 0.13], r: [0.2, 0, 0.3] });
  const [px, py, pz] = a.pitcher;
  return new Baker().raw(B.build(), at([px - 0.55, py, pz - 0.05], [0, 0.4, 0])).build();
}
