// The ad blitz mascot (design spec "Rival schemes": FizzCo's Ad Blitz puts a mascot on the district's sidewalks; in
// Peaceful any gang may blitz). A big clay costume in the rival's colours waddles up and down the district's
// sidewalk waving a sale board, while sim/schemes.ts runs the blitz there. FizzCo's is a fizz bottle; the others
// wear a giant cup. Two draws a mascot: the costume, and the arm with its board, which waves on twos.
import * as THREE from 'three';
import { Baker, GLOSS, PAPER, box, cap, cyl, lathe, rbox, sph, tor } from './clay/core.ts';
import { kit } from './clay/kit.ts';
import { OWNER, P } from './clay/palette.ts';
import { runningSchemes } from '../sim/schemes.ts';
import { DISTRICTS } from '../sim/map.ts';
import { PLOT_SPACING, STREET_HALF, type GameState, type RivalId } from '../sim/economy.ts';

const SIDEWALK = STREET_HALF + 1.1;
const INK = '#2b2b38';

interface Mascot { root: THREE.Group; arm: THREE.Object3D; x0: number; x1: number; z: number; ph: number }

function costume(by: RivalId) {
  const o = OWNER[by] ?? { main: '#888888', accent: '#DDDDDD' };
  const main = o.main, acc = /^#f{6}$/i.test(o.accent) ? P.cream : o.accent;
  const B = new Baker();
  // little legs in white tights and big clown shoes
  for (const s of [-1, 1]) {
    B.add(cap(0.13, 0.45, 2, 8), '#FFFDF6', { p: [s * 0.22, 0.4, 0] });
    B.add(rbox(0.3, 0.16, 0.48, 0.07), acc, { p: [s * 0.24, 0.08, 0.08] });
  }
  let faceY: number, faceZ: number;
  if (by === 'fizzco') {
    // a fizz bottle: shoulders, a long neck, a crown cap and a label band
    B.add(lathe([[0, 0], [0.55, 0], [0.6, 0.15], [0.6, 1.2], [0.42, 1.55], [0.2, 1.8], [0.2, 2.05], [0, 2.05]], 16), main, { p: [0, 0.6, 0], fx: GLOSS });
    B.add(cyl(0.62, 0.62, 0.42, 16), acc, { p: [0, 1.25, 0] });
    B.add(cyl(0.26, 0.26, 0.14, 12), acc, { p: [0, 2.68, 0] });
    for (let k = 0; k < 4; k++) B.add(sph(0.06, 6, 4), '#FFFDF6', { p: [Math.sin(k * 1.9) * 0.25, 2.0 + k * 0.12, 0.25] }); // fizz
    faceY = 1.7; faceZ = 0.5;
  } else {
    // a giant takeaway cup: a lid, a straw, a sleeve
    B.add(lathe([[0, 0], [0.5, 0], [0.68, 1.7], [0, 1.7]], 16), main, { p: [0, 0.6, 0] });
    B.add(cyl(0.66, 0.6, 0.45, 16, true), acc, { p: [0, 1.15, 0] });
    B.add(lathe([[0, 0], [0.74, 0], [0.72, 0.12], [0.5, 0.25], [0, 0.28]], 16), '#FFFDF6', { p: [0, 2.3, 0], fx: GLOSS });
    B.add(cyl(0.06, 0.06, 0.9, 6), acc, { p: [0.18, 2.85, 0], r: [0, 0, -0.2] });
    faceY = 1.85; faceZ = 0.62;
  }
  // a big friendly face: bead eyes, rosy cheeks, a wide grin
  for (const s of [-1, 1]) {
    B.add(sph(0.13, 10, 8), '#FFFDF6', { p: [s * 0.2, faceY, faceZ] });
    B.add(sph(0.065, 8, 6), INK, { p: [s * 0.2, faceY, faceZ + 0.1] });
    B.add(sph(0.08, 8, 6), P.blush, { p: [s * 0.36, faceY - 0.22, faceZ - 0.06] });
  }
  B.add(tor(0.17, 0.035, 4, 12, Math.PI), INK, { p: [0, faceY - 0.18, faceZ + 0.02], r: [0, 0, Math.PI] });
  // the other arm, waving free
  B.add(cap(0.1, 0.5, 2, 6), main, { p: [-0.72, 1.45, 0.05], r: [0, 0, -0.9] });
  B.add(sph(0.14, 8, 6), '#FFFDF6', { p: [-0.98, 1.72, 0.05] });
  const body = new THREE.Mesh(B.build(), kit().world);
  body.castShadow = true; body.receiveShadow = true;
  // the board arm, pivoting at the shoulder
  const A = new Baker();
  A.add(cap(0.1, 0.55, 2, 6), main, { p: [0.3, 0.05, 0], r: [0, 0, 1.2] });
  A.add(box(0.07, 1.1, 0.07), P.stick, { p: [0.62, 0.55, 0.08], fx: PAPER });
  A.add(rbox(1.1, 0.72, 0.08, 0.04), acc, { p: [0.62, 1.35, 0.1], fx: PAPER });
  A.add(rbox(0.98, 0.6, 0.06, 0.04), '#FFFDF6', { p: [0.62, 1.35, 0.13], fx: PAPER });
  // a sale starburst on the board
  A.add(cyl(0.24, 0.24, 0.04, 8), main, { p: [0.62, 1.35, 0.17], r: [Math.PI / 2, 0, 0] });
  A.add(cyl(0.24, 0.24, 0.04, 8), main, { p: [0.62, 1.35, 0.17], r: [Math.PI / 2, Math.PI / 8, 0] });
  A.add(sph(0.08, 8, 6), '#FFFDF6', { p: [0.62, 1.35, 0.2] });
  const arm = new THREE.Mesh(A.build(), kit().world);
  arm.castShadow = true;
  const pivot = new THREE.Group();
  pivot.position.set(0.55, 1.4, 0.05);
  pivot.add(arm);
  const root = new THREE.Group();
  root.add(body, pivot);
  root.scale.setScalar(1.25);
  root.name = `blitz:${by}`;
  return { root, arm: pivot };
}

export function createBlitz(scene: THREE.Scene) {
  let key = '';
  let mascots: Mascot[] = [];
  let lastF = -1;
  const clear = () => {
    for (const m of mascots) {
      m.root.removeFromParent();
      m.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose(); });
    }
    mascots = [];
  };
  return {
    /** Mascots for every blitz running today (one per district it works). */
    sync(s: GameState) {
      const on = runningSchemes(s).filter((x) => x.kind === 'blitz' && x.district && s.rivals[x.by]?.alive);
      const k = on.map((x) => `${x.by}:${x.district}`).join(',');
      if (k === key) return;
      key = k;
      clear();
      for (const x of on) {
        const d = DISTRICTS.find((q) => q.id === x.district);
        if (!d) continue;
        const { root, arm } = costume(x.by);
        const x0 = d.origin[0] + 3, x1 = d.origin[0] + d.cols * PLOT_SPACING - 3;
        const m: Mascot = { root, arm, x0, x1, z: d.origin[1] + SIDEWALK + 0.6, ph: (d.origin[0] * 0.37) % 7 };
        root.position.set(x0, 0.12, m.z);
        scene.add(root);
        mascots.push(m);
      }
    },
    /** Waddle along on twos; hidden in Bay View. */
    update(time: number, level: number) {
      for (const m of mascots) m.root.visible = level < 2;
      if (level >= 2 || !mascots.length) return;
      const f = Math.floor(time * 12);
      if (f === lastF) return;
      lastF = f;
      const t = f / 12;
      for (const m of mascots) {
        const len = m.x1 - m.x0, u = ((t + m.ph) * 1.1) % (len * 2);
        const back = u > len;
        const x = back ? m.x1 - (u - len) : m.x0 + u;
        const step = Math.sin((t + m.ph) * 7);
        m.root.position.set(x, 0.12 + Math.abs(step) * 0.08, m.z);
        // it walks along the kerb with its face to the street (and the camera), turned a little toward where it's going
        m.root.rotation.set(0, Math.PI + (back ? 0.35 : -0.35), step * 0.07); // the default camera looks from -z
        m.arm.rotation.z = Math.sin((t + m.ph) * 3.2) * 0.35;
      }
    },
  };
}
