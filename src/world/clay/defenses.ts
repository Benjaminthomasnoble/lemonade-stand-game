// Perimeters, gadgets and the smashed pile in Kitchen-Table Clay (design
// spec, "Defenses and gadgets" and "Stands L1-L5"). Each builds as one baked
// clay mesh. Plot frame: the street is toward +z; the fence runs x -5.2..5.2,
// z -7.2..2.1, with a 2 m gate in the middle of the front.
import * as THREE from 'three';
import { Baker, GLOSS, PAPER, box, cone, cyl, hash, lathe, lumpy, rbox, snake, sph, tor } from './core.ts';
import { kit } from './kit.ts';
import { P } from './palette.ts';
import { DRESS, INK, cardPlane, cardSign, clayMesh, lemon, rod, stick, type Owner } from './standKit.ts';
import type { GadgetId } from '../../sim/balance.ts';

type V3 = [number, number, number];
export const FENCE = { x0: -5.2, x1: 5.2, zf: 2.1, zb: -7.2, gate: 1 };

/** The fence runs, leaving the gate open at the front middle. */
function runs(): [number, number, number, number][] {
  const { x0, x1, zf, zb, gate } = FENCE;
  return [[x0, zf, -gate, zf], [gate, zf, x1, zf], [x0, zf, x0, zb], [x1, zf, x1, zb], [x0, zb, x1, zb]];
}
/** Points every `step` along each run, with the run's angle and outward normal. */
function along(step: number, fn: (x: number, z: number, i: number, ang: number, out: [number, number]) => void) {
  let i = 0;
  for (const [ax, az, bx, bz] of runs()) {
    const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / step));
    const ang = Math.atan2(-(bz - az), bx - ax);
    const out: [number, number] = az === bz ? [0, az > 0 ? 1 : -1] : [ax > 0 ? 1 : -1, 0];
    for (let k = 0; k <= n; k++) fn(ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n, i++, ang, out);
  }
}
/** A rail or snake along every run at height y. */
function rails(B: Baker, y: number, r: number, color: string, fx = 0) {
  for (const [ax, az, bx, bz] of runs()) B.add(snake([[ax, y, az], [(ax + bx) / 2, y - 0.02, (az + bz) / 2], [bx, y, bz]], r, 10, 5), color, { fx });
}

/**
 * A perimeter, P1 Picket Fence to P5 Citrus Fortress Wall. `hp` (0..1) knocks
 * pieces out: pickets pop like piano keys, mesh peels, bricks pop out.
 */
export function fenceModel(tier: number, hp = 1): THREE.Group {
  const g = new THREE.Group();
  g.name = 'fence';
  const B = new Baker();
  const broke = (i: number) => hash(i, tier * 7) < (1 - Math.max(0, Math.min(1, hp))) * 0.85;
  if (tier === 1) {
    // Matchstick pickets with lemon-shaped clay tips.
    along(0.3, (x, z, i, ang, out) => {
      if (broke(i)) {
        stick(B, 0.8, [x + out[0] * 0.35, 0.05, z + out[1] * 0.35], [Math.PI / 2, ang + (hash(i) - 0.5), 0], P.cream, 0.11, 0.035);
        return;
      }
      const lean = (hash(i, 3) - 0.5) * 0.08;
      stick(B, 0.8, [x, 0.4, z], [0, ang, lean], P.cream, 0.11, 0.035);
      lemon(B, 0.065, [x, 0.84, z], [0, ang, Math.PI / 2], P.lemon, i, true);
    });
    rails(B, 0.32, 0.025, P.stick);
    rails(B, 0.6, 0.025, P.stick);
  } else if (tier === 2) {
    // Pipe-cleaner diamond mesh on popsicle posts, a lemon padlock on the gate.
    along(1.55, (x, z, _i, ang) => stick(B, 1.45, [x, 0.72, z], [0, ang, 0], P.stick, 0.12, 0.08));
    for (const [ax, az, bx, bz] of runs()) {
      const len = Math.hypot(bx - ax, bz - az), n = Math.round(len / 0.42);
      const ux = (bx - ax) / len, uz = (bz - az) / len;
      for (let k = 0; k < n; k++) {
        const s0 = k * (len / n), s1 = (k + 1) * (len / n);
        const peel = broke(k * 31 + Math.round(ax * 7 + az * 3));
        for (const up of [1, -1]) {
          const ya = up > 0 ? 0.1 : 1.3, yb = up > 0 ? 1.3 : 0.1;
          if (peel && up > 0) {
            rod(B, [ax + ux * s0, 0.1, az + uz * s0], [ax + ux * (s0 + s1) / 2 + uz * 0.3, 0.5, az + uz * (s0 + s1) / 2 - ux * 0.3], 0.014, '#b8c2cc');
            rod(B, [ax + ux * (s0 + s1) / 2 + uz * 0.3, 0.5, az + uz * (s0 + s1) / 2 - ux * 0.3], [ax + ux * s1 + uz * 0.5, 0.2, az + uz * s1 - ux * 0.5], 0.014, '#b8c2cc');
            continue;
          }
          rod(B, [ax + ux * s0, ya, az + uz * s0], [ax + ux * s1, yb, az + uz * s1], 0.013, '#b8c2cc');
        }
      }
    }
    rails(B, 1.38, 0.03, '#b8c2cc');
    lemon(B, 0.13, [FENCE.gate + 0.05, 0.8, FENCE.zf + 0.08], [0, 0, Math.PI / 2], P.lemon, 4);
    B.add(tor(0.07, 0.018, 6, 12, Math.PI), P.chrome, { p: [FENCE.gate + 0.05, 0.98, FENCE.zf + 0.08], fx: GLOSS });
  } else if (tier === 3) {
    // Pencil stubs sharpened to points, yellow as lemons, leaning out.
    along(0.32, (x, z, i, _ang, out) => {
      const knocked = broke(i);
      for (const row of [0, 1]) {
        const ox = out[0] * row * 0.22, oz = out[1] * row * 0.22;
        const h = 0.9 + hash(i, row) * 0.35;
        const tilt = knocked ? 1.2 : 0.32;
        const m = new THREE.Matrix4().compose(new THREE.Vector3(x + ox, 0, z + oz), new THREE.Quaternion().setFromEuler(new THREE.Euler(out[1] * tilt, 0, -out[0] * tilt)), new THREE.Vector3(1, 1, 1));
        const at = (y: number) => new THREE.Matrix4().makeTranslation(0, y, 0).premultiply(m);
        B.add(cyl(0.07, 0.07, h, 6), P.lemon, { m: at(h / 2) });
        B.add(cone(0.07, 0.2, 6), P.stick, { m: at(h + 0.1), fx: PAPER });
        B.add(cone(0.025, 0.07, 6), INK, { m: at(h + 0.175) });
        B.add(cyl(0.072, 0.072, 0.05, 6), P.chrome, { m: at(0.06), fx: GLOSS });
      }
    });
  } else if (tier === 4) {
    // Twisted pipe-cleaner coils with lemon-seed barbs.
    along(1.55, (x, z, _i, ang) => stick(B, 1.4, [x, 0.7, z], [0, ang, 0], P.walnut, 0.11, 0.08));
    let seed = 0;
    for (const [ax, az, bx, bz] of runs()) {
      const len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len;
      for (const y0 of [0.45, 1.02]) {
        const pts: V3[] = [];
        const n = Math.round(len * 12);
        for (let k = 0; k <= n; k++) {
          const s = (k / n) * len, a = s * 2 * Math.PI * 2 / 1.0;
          const r = 0.17;
          pts.push([ax + ux * s + uz * Math.cos(a) * r, y0 + Math.sin(a) * r, az + uz * s - ux * Math.cos(a) * r]);
        }
        if (broke(seed++)) {
          const cut = Math.floor(pts.length * (0.3 + hash(seed) * 0.4));
          B.add(snake(pts.slice(0, cut), 0.016, cut, 4), '#9aa5b1');
          B.add(snake(pts.slice(cut + 6).map(([x, y, z]) => [x, Math.max(0.08, y - 0.35), z] as V3), 0.016, pts.length - cut, 4), '#9aa5b1');
        } else B.add(snake(pts, 0.016, n, 4), '#9aa5b1');
        for (let k = 0; k < n; k += 3) B.add(sph(0.035, 4, 3), '#f3e7c4', { p: pts[k], s: [1.6, 0.8, 0.8], r: [0, hash(k, seed) * 3, 0.5], fx: GLOSS });
      }
    }
  } else {
    // Tool-pressed clay bricks, lemon-dome turrets, a gate like a citrus press.
    const BW = 0.62, BH = 0.3, rows = 6;
    let bi = 0;
    for (const [ax, az, bx, bz] of runs()) {
      const len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len;
      const ang = Math.atan2(-(bz - az), bx - ax);
      for (let r = 0; r < rows; r++) {
        const off = r % 2 ? BW / 2 : 0;
        for (let s = off; s < len - 0.05; s += BW) {
          const w = Math.min(BW - 0.03, len - s);
          if (broke(bi++) && r >= 2) {
            if (hash(bi, 2) > 0.5) B.add(box(w, BH - 0.03, 0.42), '#c8664a', { p: [ax + ux * (s + w / 2) + uz * 0.8, 0.14, az + uz * (s + w / 2) - ux * 0.8], r: [0.3, ang + 0.6, 0.2] });
            continue;
          }
          B.add(box(w, BH - 0.03, 0.42), (r + Math.round(s * 3)) % 3 ? '#c8664a' : '#b5523b', { p: [ax + ux * (s + w / 2), BH / 2 + r * BH, az + uz * (s + w / 2)], r: [0, ang + (hash(bi) - 0.5) * 0.03, (hash(bi, 1) - 0.5) * 0.02] });
        }
      }
      B.add(rbox(len + 0.1, 0.14, 0.52, 0.05), P.cream, { p: [(ax + bx) / 2, rows * BH + 0.07, (az + bz) / 2], r: [0, ang, 0] });
    }
    for (const [x, z] of [[FENCE.x0, FENCE.zf], [FENCE.x1, FENCE.zf], [FENCE.x0, FENCE.zb], [FENCE.x1, FENCE.zb]]) {
      B.add(lumpy(cyl(0.6, 0.65, 2.5, 16), 0.03, 2, x + z), '#c8664a', { p: [x, 1.25, z] });
      for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; B.add(box(0.28, 0.25, 0.25), '#b5523b', { p: [x + Math.cos(a) * 0.6, 2.6, z + Math.sin(a) * 0.6], r: [0, -a, 0] }); }
      B.add(lumpy(new THREE.SphereGeometry(0.62, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0.03, 3, x - z), P.lemon, { p: [x, 2.72, z], s: [1, 1.1, 1] });
      B.add(sph(0.1, 8, 6), P.green, { p: [x, 3.45, z], s: [1.4, 0.6, 1] });
    }
    // The gate: two pillars and a citrus press across the top.
    for (const s of [-1, 1]) B.add(rbox(0.5, 2.6, 0.6, 0.08), '#b5523b', { p: [s * (FENCE.gate + 0.25), 1.3, FENCE.zf] });
    B.add(rbox(2.9, 0.3, 0.6, 0.08), P.cream, { p: [0, 2.7, FENCE.zf] });
    const ream: [number, number][] = [[0, 0]];
    for (let k = 0; k <= 10; k++) ream.push([0.55 * (1 - k / 10) + (k % 2 ? 0.05 : 0), 0.1 + k * 0.07]);
    B.add(lathe(ream, 14), P.lemon, { p: [0, 2.85, FENCE.zf], fx: GLOSS });
    B.add(lathe([[0, 0], [0.75, 0], [0.8, 0.12], [0.7, 0.14], [0, 0.1]], 18), P.chrome, { p: [0, 2.82, FENCE.zf], fx: GLOSS });
    B.add(cap(0.06, 1.4), P.chrome, { p: [0.9, 3.55, FENCE.zf], r: [0, 0, 0.9], fx: GLOSS });
  }
  const mesh = clayMesh(B.build(), kit().world);
  g.add(mesh);
  g.userData.tier = tier;
  return g;
}
function cap(r: number, l: number) { return new THREE.CapsuleGeometry(r, l, 3, 8); }

/** Installed gadgets, visible on the plot (Tin-Can Alarm, Honkers, Peel Slick, Sprinklers, Floodlights, Watchtower). */
export function gadgetsModel(ids: readonly GadgetId[]): THREE.Group {
  const g = new THREE.Group();
  g.name = 'gadgets';
  if (!ids.length) return g;
  const B = new Baker();
  const has = (id: GadgetId) => ids.includes(id);
  const zf = FENCE.zf;
  if (has('alarm')) {
    // Tiny lemon-label cans strung on thread along the front.
    for (const x of [-4.9, -1.3]) stick(B, 1.15, [x, 0.57, zf + 0.25], [0, 0, 0], P.stick, 0.08, 0.05);
    const pts: V3[] = [];
    for (let k = 0; k <= 10; k++) { const x = -4.9 + (k / 10) * 3.6; pts.push([x, 1.08 - Math.sin((k / 10) * Math.PI) * 0.22, zf + 0.25]); }
    B.add(snake(pts, 0.008, 30, 4), INK);
    for (let k = 1; k < 10; k++) {
      const [x, y, z] = pts[k];
      B.add(cyl(0.004, 0.004, 0.1, 3), INK, { p: [x, y - 0.05, z] });
      B.add(cyl(0.065, 0.065, 0.15, 10), P.chrome, { p: [x, y - 0.17, z], r: [0, 0, (hash(k) - 0.5) * 0.4], fx: GLOSS });
      B.add(cyl(0.068, 0.068, 0.07, 10), P.lemon, { p: [x, y - 0.17, z], r: [0, 0, (hash(k) - 0.5) * 0.4], fx: PAPER });
    }
  }
  if (has('goose')) {
    // Honkers: a cream clay goose in a striped card neckerchief, by the gate.
    const at = (p: V3): V3 => [-3.3 + p[0], p[1], 1.35 + p[2]];
    B.add(lumpy(sph(0.32, 14, 10), 0.02, 4, 3), P.cream, { p: at([0, 0.42, -0.05]), s: [0.9, 0.8, 1.35] });
    B.add(lumpy(sph(0.16, 10, 8), 0.015, 6, 4), P.cream, { p: at([0, 0.5, -0.42]), s: [0.7, 0.6, 1], r: [0.5, 0, 0] });
    B.add(snake([at([0, 0.55, 0.2]), at([0, 0.85, 0.3]), at([0, 1.05, 0.28])], 0.07, 10, 7), P.cream);
    B.add(sph(0.12, 12, 9), P.cream, { p: at([0, 1.1, 0.32]) });
    B.add(cone(0.06, 0.2, 8), P.terra, { p: at([0, 1.07, 0.48]), r: [Math.PI / 2, 0, 0] });
    for (const s of [-1, 1]) B.add(sph(0.025, 6, 5), INK, { p: at([s * 0.08, 1.15, 0.4]), fx: GLOSS });
    for (const s of [-1, 1]) B.add(cyl(0.025, 0.025, 0.22, 5), P.terra, { p: at([s * 0.1, 0.11, 0]) });
    for (const s of [-1, 1]) B.add(box(0.12, 0.02, 0.16), P.terra, { p: at([s * 0.1, 0.01, 0.06]) });
    for (let k = 0; k < 4; k++) B.add(box(0.08, 0.14, 0.02), k % 2 ? '#ffffff' : P.ging, { p: at([-0.12 + k * 0.08, 0.66, 0.36]), r: [0.3, 0, 0], fx: PAPER });
    B.add(cone(0.14, 0.2, 3), P.ging, { p: at([0, 0.52, 0.38]), r: [Math.PI, 0, 0], s: [1, 1, 0.2], fx: PAPER });
  }
  if (has('slick')) {
    // Glossy clay peels on the path inside the gate.
    for (let k = 0; k < 6; k++) {
      const x = (hash(k, 1) - 0.5) * 1.6, z = zf - 0.4 - hash(k, 2) * 0.9;
      B.add(tor(0.13, 0.05, 6, 12, Math.PI * 1.2), P.lemon, { p: [x, 0.05, z], r: [Math.PI / 2, 0, hash(k, 3) * 6], s: [1, 1, 0.45], fx: GLOSS });
    }
  }
  if (has('sprinkler')) {
    for (const [x, z] of [[-3.6, -0.8], [3.6, -0.8], [0, -6.1]]) {
      B.add(cyl(0.09, 0.1, 0.12, 10), '#3b6b47', { p: [x, 0.06, z] });
      B.add(cyl(0.06, 0.07, 0.08, 10), P.chrome, { p: [x, 0.15, z], fx: GLOSS });
      B.add(cyl(0.015, 0.015, 0.1, 5), P.chrome, { p: [x + 0.04, 0.22, z], r: [0, 0, 0.6], fx: GLOSS });
    }
  }
  if (has('floodlights')) {
    // Popsicle-stick poles with lemon-shaped hoods.
    for (const s of [-1, 1]) {
      const x = s * 4.6, z = -6.6;
      stick(B, 3.2, [x, 1.6, z], [0, 0, 0], P.stick, 0.14, 0.1);
      const m = new THREE.Matrix4().compose(new THREE.Vector3(x - s * 0.15, 3.25, z + 0.15), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.7, -s * 0.6, 0)), new THREE.Vector3(1, 1, 1));
      B.add(lumpy(new THREE.SphereGeometry(0.32, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0.015, 6, s), P.lemon, { m: new THREE.Matrix4().makeRotationX(Math.PI / 2).scale(new THREE.Vector3(1, 1.3, 1)).premultiply(m) });
      B.add(cyl(0.27, 0.27, 0.02, 14), '#fff4d6', { m: new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(0, 0, 0.01).premultiply(m), fx: GLOSS + 1 });
    }
  }
  if (has('watchtower')) {
    // A crate cabin on popsicle-stick stilts, with a ladder.
    const x = -4.0, z = -5.4, H = 2.8;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) stick(B, H, [x + sx * 0.5, H / 2, z + sz * 0.5], [sz * 0.05, 0, -sx * 0.05], P.stick, 0.12, 0.1);
    for (const y of [0.9, 1.9]) for (const sz of [-1, 1]) stick(B, 1.4, [x, y, z + sz * 0.5], [0, 0, 0.75], P.stick, 0.08, 0.04);
    for (let y = 0; y < 0.9; y += 0.22) for (const zz of [-0.55, 0.55]) stick(B, 1.25, [x, H + 0.11 + y, z + zz], [0, 0, Math.PI / 2], '#d9ad72', 0.2, 0.04);
    for (let y = 0; y < 0.9; y += 0.22) for (const xx of [-0.55, 0.55]) stick(B, 1.1, [x + xx, H + 0.11 + y, z], [Math.PI / 2, 0, 0], '#d9ad72', 0.2, 0.04);
    B.add(box(1.15, 0.06, 1.15), P.walnut, { p: [x, H, z], fx: PAPER });
    B.add(cone(0.95, 0.6, 4), P.terra, { p: [x, H + 1.35, z], r: [0, Math.PI / 4, 0] });
    for (let y = 0.25; y < H; y += 0.3) B.add(cyl(0.025, 0.025, 0.5, 5), P.walnut, { p: [x + 0.6, y, z + 0.55], r: [0, 0, Math.PI / 2] });
    for (const s of [-1, 1]) stick(B, H, [x + 0.6 + s * 0.24, H / 2, z + 0.55], [0, 0, 0], P.walnut, 0.06, 0.05);
  }
  g.add(clayMesh(B.build(), kit().world));
  return g;
}

/** Wrecked: a neat pile of popsicle sticks and squashed clay with the sign on top. */
export function wreckPile(level: number, owner: Owner): THREE.Group {
  const g = new THREE.Group();
  g.name = 'wreck';
  const d = DRESS[owner];
  const s = [1, 1.25, 1.55, 1.9, 2.2][Math.max(0, Math.min(4, level - 1))];
  const B = new Baker();
  // Log-cabin stack of sticks.
  for (let layer = 0; layer < 4; layer++) {
    const y = 0.04 + layer * 0.07;
    const w = (1.4 - layer * 0.18) * s;
    for (let k = 0; k < 5; k++) {
      const off = -w / 2 + (k + 0.5) * (w / 5);
      const r: V3 = layer % 2 ? [Math.PI / 2, 0, 0] : [Math.PI / 2, 0, Math.PI / 2];
      stick(B, w + 0.1, layer % 2 ? [off, y, 0.3] : [0, y, 0.3 + off], r, hash(k, layer) > 0.5 ? P.stick : '#d9b27a');
    }
  }
  for (let k = 0; k < 4; k++) stick(B, 1.1 * s, [(hash(k) - 0.5) * 1.8 * s, 0.25, 0.3 + (hash(k, 2) - 0.5) * 1.4 * s], [0.9 + hash(k, 3), hash(k, 4) * 3, 0.4]);
  // Squashed clay in the owner's colours.
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + hash(k) * 0.6, rr = (0.75 + hash(k, 5) * 0.25) * s;
    B.add(lumpy(sph(0.2 * s, 12, 9), 0.03 * s, 4 / s, k), k % 2 ? d.main : P.cream, { p: [Math.cos(a) * rr, 0.07 * s, 0.3 + Math.sin(a) * rr * 0.8], s: [1.3, 0.55, 1.1], r: [0, a, 0] });
  }
  g.add(clayMesh(B.build(), kit().world));
  const sign = cardPlane(cardSign(d.sign, d), 1.3, 0.42, true);
  sign.position.set(0.1, 0.36 + 0.1, 0.3);
  sign.rotation.set(-1.25, 0, 0.25);
  g.add(sign);
  return g;
}
