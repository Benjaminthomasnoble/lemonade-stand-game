// The upgrade crate reveal (design spec, "Stands L1-L5"): a giant
// popsicle-stick citrus crate drops with a squash, rattles, and its slats fall
// open like petals; the new stand rises like dough, overshoots and settles.
// Everything steps on twos.
import * as THREE from 'three';
import { Baker, PAPER, box, hash, lumpy, sph } from './core.ts';
import { kit } from './kit.ts';
import { reducedMotion } from './fx.ts';
import { P } from './palette.ts';
import { clayMesh, lemon, stick, rbox } from './standKit.ts';

export interface RevealCrate {
  group: THREE.Group;
  /**
   * Pose the crate `t` seconds into a reveal lasting `total` seconds.
   * Returns the stand's rise (0 hidden .. overshoot .. 1 settled) and
   * whether the crate has burst (so the flourish can start).
   */
  pose(t: number, total: number): { rise: number; burst: boolean; burstAt: number };
  hide(): void;
}

const W = 2.6, H = 2.3, D = 2.3;
const DOUGH = [0.1, 0.35, 0.7, 1.08, 1.2, 1.12, 0.96, 0.98, 1.02, 1];

/** One side of the crate: horizontal slats on two battens, hinged at its bottom edge. */
function sidePanel(w: number, label: boolean): THREE.Mesh {
  const B = new Baker();
  for (let k = 0; k < 5; k++) stick(B, w - 0.04, [0, 0.22 + k * 0.44, 0], [0, 0, Math.PI / 2], k % 2 ? '#d9ad72' : P.stick, 0.36, 0.06);
  for (const s of [-1, 1]) B.add(rbox(0.16, H, 0.08, 0.03), P.walnut, { p: [s * (w / 2 - 0.12), H / 2, -0.06], fx: PAPER });
  if (label) {
    // A citrus-crate label: a lemon on a sunburst card.
    B.add(rbox(1.3, 0.8, 0.02, 0.06), P.cream, { p: [0, H * 0.55, 0.05], fx: PAPER });
    for (let k = 0; k < 10; k++) B.add(box(0.06, 0.5, 0.01), P.terra, { p: [0, H * 0.55, 0.065], r: [0, 0, (k / 10) * Math.PI], fx: PAPER });
    lemon(B, 0.24, [0, H * 0.55, 0.12], [0, 0, 0.2], P.lemon, 5);
    B.add(lumpy(sph(0.09, 8, 6), 0.01, 10, 2), P.green, { p: [0.18, H * 0.55 + 0.2, 0.13], s: [1.6, 0.5, 0.6], r: [0, 0, 0.5] });
  }
  return clayMesh(B.build(), kit().world);
}

export function createRevealCrate(): RevealCrate {
  const group = new THREE.Group();
  group.name = 'revealCrate';
  const body = new THREE.Group();
  group.add(body);
  // Four petals, each hinged at the bottom edge of its side.
  const petals: { pivot: THREE.Group; dir: 1 | -1; axis: 'x' | 'z' }[] = [];
  const sides: [number, number, number, 'x' | 'z', 1 | -1, number][] = [
    [0, 0, D / 2, 'x', 1, W], [0, 0, -D / 2, 'x', -1, W], [W / 2, 0, 0, 'z', -1, D], [-W / 2, 0, 0, 'z', 1, D],
  ];
  sides.forEach(([x, , z, axis, dir, w], i) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0, z);
    const panel = sidePanel(w, i < 2);
    if (axis === 'z') panel.rotation.y = dir > 0 ? -Math.PI / 2 : Math.PI / 2;
    else if (dir < 0) panel.rotation.y = Math.PI;
    pivot.add(panel);
    body.add(pivot);
    petals.push({ pivot, dir, axis });
  });
  const lidB = new Baker();
  for (let k = 0; k < 5; k++) stick(lidB, W - 0.05, [0, 0, -D / 2 + 0.23 + k * 0.46], [Math.PI / 2, 0, Math.PI / 2], k % 2 ? '#d9ad72' : P.stick, 0.4, 0.06);
  const lid = clayMesh(lidB.build(), kit().world);
  lid.position.y = H;
  body.add(lid);
  group.visible = false;

  const calm = reducedMotion();
  return {
    group,
    pose(t, total) {
      group.visible = true;
      const q = Math.floor(t * 12) / 12;
      const burstAt = 1.3;
      // Drop (accelerating), then a squash on landing, then a rattle. Reduced
      // motion: the crate swells smoothly into place, with no squash or rattle.
      if (calm) {
        const k = Math.min(1, t / 0.6);
        body.position.y = 0;
        body.scale.setScalar(Math.max(0.001, k * k * (3 - 2 * k)));
        body.rotation.set(0, 0, 0);
      } else if (q < 0.45) {
        const k = q / 0.45;
        body.position.y = 8 * (1 - k * k);
        body.scale.set(0.92, 1.12, 0.92);
      } else if (q < 0.75) {
        body.position.y = 0;
        const k = (q - 0.45) / 0.3;
        const sq = Math.sin(k * Math.PI) * 0.22;
        body.scale.set(1 + sq * 0.6, 1 - sq, 1 + sq * 0.6);
      } else {
        body.position.y = 0;
        body.scale.set(1, 1, 1);
        body.rotation.z = q < burstAt ? (hash(Math.floor(q * 12)) - 0.5) * 0.12 : 0;
        body.rotation.y = q < burstAt ? (hash(Math.floor(q * 12), 3) - 0.5) * 0.06 : 0;
      }
      // Burst: the lid pops off and the sides fall open like petals.
      const k = Math.max(0, q - burstAt);
      lid.visible = k < 0.6;
      lid.position.set(k * 1.5, H + k * 4 - k * k * 9, -k * 0.8);
      lid.rotation.set(-k * 3, 0, k * 2);
      for (const p of petals) {
        const open = Math.min(1, k / 0.42);
        const ang = (Math.PI / 2 + 0.06) * (open < 1 ? open * open : 1 + Math.sin(Math.min(1, (k - 0.42) / 0.3) * Math.PI) * 0.06);
        if (p.axis === 'x') p.pivot.rotation.x = p.dir * ang; else p.pivot.rotation.z = p.dir * ang;
      }
      // The petals sink away in the last half second.
      const sink = Math.max(0, (q - (total - 0.5)) / 0.5);
      body.position.y -= sink * 0.4;
      for (const p of petals) p.pivot.scale.setScalar(1 - sink);
      const r = q < burstAt + 0.1 ? 0 : DOUGH[Math.min(DOUGH.length - 1, Math.floor((q - burstAt - 0.1) * 12))];
      return { rise: r, burst: q >= burstAt, burstAt };
    },
    hide() {
      group.visible = false;
      for (const p of petals) { p.pivot.rotation.set(0, 0, 0); p.pivot.scale.setScalar(1); }
      body.position.set(0, 0, 0); body.rotation.set(0, 0, 0); body.scale.set(1, 1, 1);
    },
  };
}
