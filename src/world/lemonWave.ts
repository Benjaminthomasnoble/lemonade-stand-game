// The lemon-clay wave (design spec "Juice and motion"): a captured HQ is smoothed over by a
// wave of lemon clay (the rebuilt HQ keeps one relic in its old colours, the Trophy), and at
// Domination the whole model turns lemon yellow, rolling out from Lottie's Corner. Both pose on twos.
import * as THREE from 'three';
import { Baker, lumpy, sph, tor } from './clay/core.ts';
import { kit } from './clay/kit.ts';

const LEMON = new THREE.Color('#F6D33C');
/** How far a dominated model leans toward lemon (the clay's own shading and shapes still read). */
const MIX = 0.78;
const SPEED = 70; // world units a second
const STEP = 0.25; // seconds between colour steps

type Wave = { m: THREE.Mesh; t0: number; h: number };
type Painted = { col0: Float32Array; dist: Float32Array; reach: number };

export interface LemonWave {
  /** Smooth lemon clay over a freshly captured HQ standing at (x, z). */
  capture(x: number, z: number, height: number): void;
  /** Start (once) the Domination wave from (x, z). */
  dominate(x: number, z: number): void;
  update(time: number): void;
}

export function createLemonWave(scene: THREE.Scene): LemonWave {
  const waves: Wave[] = [];
  let dom: { x: number; z: number; t0: number; lastStep: number } | null = null;
  let now = 0;
  const v = new THREE.Vector3();

  /** Paint every clay mesh's vertices within radius r of the Domination origin. */
  function paint(r: number) {
    const world = kit().world;
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || m.material !== world || (m as THREE.InstancedMesh).isInstancedMesh) return;
      const col = m.geometry.getAttribute('color') as THREE.BufferAttribute | undefined;
      if (!col || col.itemSize !== 4) return;
      let p = m.userData.lemon as Painted | undefined;
      if (p && p.reach <= r && m.userData.lemonFull) return;
      if (!p) {
        // first touch: remember the colours and each vertex's distance from the origin
        const pos = m.geometry.getAttribute('position') as THREE.BufferAttribute;
        m.updateWorldMatrix(true, false);
        const dist = new Float32Array(pos.count);
        let reach = 0;
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
          dist[i] = Math.hypot(v.x - dom!.x, v.z - dom!.z);
          reach = Math.max(reach, dist[i]);
        }
        p = { col0: (col.array as Float32Array).slice(), dist, reach };
        m.userData.lemon = p;
      }
      const a = col.array as Float32Array;
      for (let i = 0; i < p.dist.length; i++) {
        if (p.dist[i] > r) continue;
        const k = i * 4;
        a[k] = p.col0[k] + (LEMON.r - p.col0[k]) * MIX;
        a[k + 1] = p.col0[k + 1] + (LEMON.g - p.col0[k + 1]) * MIX;
        a[k + 2] = p.col0[k + 2] + (LEMON.b - p.col0[k + 2]) * MIX;
      }
      col.needsUpdate = true;
      if (p.reach <= r) m.userData.lemonFull = true;
    });
  }

  return {
    capture(x, z, height) {
      // a lumpy lemon dome with a rolled rim: it swells over the HQ, then settles away
      const b = new Baker();
      b.add(lumpy(sph(1, 14, 9), 0.08, 2.2, 3), '#F6D33C', { s: [1, 1, 1] });
      b.add(lumpy(tor(1, 0.18, 6, 22), 0.04, 3, 5), '#FFE27A', { r: [Math.PI / 2, 0, 0] });
      const m = new THREE.Mesh(b.build(), kit().world);
      m.position.set(x, 0, z);
      m.castShadow = true;
      m.scale.setScalar(0.001);
      m.name = 'lemon-wave';
      scene.add(m);
      waves.push({ m, t0: now, h: height });
    },
    dominate(x, z) {
      if (dom) return;
      dom = { x, z, t0: now, lastStep: -1 };
    },
    update(time) {
      now = time;
      const t2 = Math.floor(time * 12) / 12; // twos
      for (let i = waves.length - 1; i >= 0; i--) {
        const w = waves[i], u = (t2 - w.t0) / 1.6;
        if (u >= 1) { w.m.removeFromParent(); w.m.geometry.dispose(); waves.splice(i, 1); continue; }
        // rise and spread (0 to 0.55), then sink and thin out to reveal the lemon HQ
        const up = u < 0.55 ? u / 0.55 : 1 - (u - 0.55) / 0.45;
        const spread = 7 * Math.min(1, u / 0.4 + 0.2);
        w.m.scale.set(spread, Math.max(0.02, w.h * 0.65 * up), spread * 0.85);
        w.m.position.y = -w.h * 0.15 * (1 - up);
      }
      if (dom) {
        const step = Math.floor((time - dom.t0) / STEP);
        if (step !== dom.lastStep) {
          dom.lastStep = step;
          paint(step * STEP * SPEED);
        }
      }
    },
  };
}
