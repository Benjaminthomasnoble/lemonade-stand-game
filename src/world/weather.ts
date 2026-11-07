// Weather looks in clay (design spec "Light, weather and seasons"):
//   Rainy   rain of beaded fishing line (bay.ts adds the glossy wet streets)
//   Storm   the same rain blown sideways, paper cups tumbling down the street
//           and the desk lamp flickering for lightning
//   Scorcher heat shimmer: clear ribbons wobbling up off the street
// Everything follows the camera target, draws instanced and hides at Bay View.
import * as THREE from 'three';
import type { WeatherKind } from '../sim/economy.ts';
import { Baker, cyl, hash, lathe, lcg, sph, GLOSS, PAPER } from './clay/core.ts';
import { kit } from './clay/kit.ts';
import { P } from './clay/palette.ts';

export interface WeatherFx {
  /** Advance the weather; returns a lightning flash, 0..1, for the lights. */
  update(dt: number, kind: WeatherKind, at: THREE.Vector3, dist: number): number;
}

const AREA = 64, TOP = 24;

export function createWeather(scene: THREE.Scene, phone: boolean): WeatherFx {
  const K = kit();
  const rng = lcg(91);

  // Rain: a length of fishing line with a resin bead on the end.
  const dropB = new Baker();
  dropB.add(cyl(0.014, 0.014, 1.1, 3), '#E6F6F8', { p: [0, 0.55, 0], fx: GLOSS });
  dropB.add(sph(0.055, 5, 4), '#D8F2F4', { fx: GLOSS });
  const N = phone ? 320 : 800;
  const drops = new THREE.InstancedMesh(dropB.build(), K.world, N);
  drops.name = 'rain';
  drops.frustumCulled = false;
  const dp = Array.from({ length: N }, () => new THREE.Vector3((rng() - 0.5) * AREA, rng() * TOP, (rng() - 0.5) * AREA));
  scene.add(drops);

  // Storm: paper cups tumbling down the street.
  const cupB = new Baker();
  cupB.add(lathe([[0, 0], [0.16, 0], [0.22, 0.42], [0.2, 0.44], [0, 0.44]], 10), '#FFFDF6', { p: [0, -0.22, 0], fx: PAPER });
  cupB.add(cyl(0.225, 0.225, 0.06, 10, true), P.terra, { p: [0, 0.12, 0], fx: PAPER });
  const C = 10;
  const cups = new THREE.InstancedMesh(cupB.build(), K.world, C);
  cups.name = 'tumbling-cups';
  cups.castShadow = true;
  cups.frustumCulled = false;
  const cp = Array.from({ length: C }, (_, i) => ({ x: (rng() - 0.5) * AREA, z: (rng() - 0.5) * 30, ph: i * 1.7, v: 3 + rng() * 3 }));
  scene.add(cups);

  // Scorcher: clear wavy ribbons of heat rising off the ground.
  const H = 16;
  const ribbonGeo = new THREE.PlaneGeometry(0.7, 2.6, 1, 10);
  const pos = ribbonGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) pos.setX(i, pos.getX(i) + Math.sin(pos.getY(i) * 2.6) * 0.25);
  ribbonGeo.translate(0, 1.3, 0);
  const shimmerMat = new THREE.MeshBasicMaterial({ color: '#fff4d0', transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false });
  const shimmer = new THREE.InstancedMesh(ribbonGeo, shimmerMat, H);
  shimmer.name = 'heat-shimmer';
  shimmer.frustumCulled = false;
  const hp = Array.from({ length: H }, () => ({ x: (rng() - 0.5) * 40, z: (rng() - 0.5) * 24, ph: rng() * 6 }));
  scene.add(shimmer);

  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
  let time = 0, nextBolt = 6, bolt = -1, lastF = -1;

  return {
    update(dt, kind, at, dist) {
      time += dt;
      const wet = kind === 'rainy' || kind === 'storm';
      const near = dist < 160;
      drops.visible = wet && near;
      cups.visible = kind === 'storm' && dist < 90;
      shimmer.visible = kind === 'scorcher' && dist < 120;

      if (drops.visible) {
        const wind = kind === 'storm' ? 0.45 : 0.08;
        e.set(0, 0, -wind); q.setFromEuler(e);
        const fall = kind === 'storm' ? 22 : 15;
        for (let i = 0; i < N; i++) {
          const p = dp[i];
          p.y -= dt * fall;
          p.x += dt * fall * wind;
          if (p.y < 0) { p.y += TOP; p.x = (hash(i, time) - 0.5) * AREA; }
          if (p.x > AREA / 2) p.x -= AREA;
          drops.setMatrixAt(i, m.compose(v.set(at.x + p.x, p.y, at.z + p.z), q, s));
        }
        drops.instanceMatrix.needsUpdate = true;
      }

      // Cups and shimmer pose on twos, like everything else made of clay.
      const f = Math.floor(time * 12);
      if (f !== lastF) {
        lastF = f;
        const t = f / 12;
        if (cups.visible) {
          for (let i = 0; i < C; i++) {
            const c = cp[i];
            const x = ((c.x + t * c.v + AREA / 2) % AREA + AREA) % AREA - AREA / 2;
            const hop = Math.abs(Math.sin(t * 3 + c.ph)) * 0.5;
            e.set(t * 4 + c.ph, 0, -t * c.v * 2.5);
            q.setFromEuler(e);
            cups.setMatrixAt(i, m.compose(v.set(at.x + x, 0.35 + hop, at.z + c.z), q, s));
          }
          cups.instanceMatrix.needsUpdate = true;
        }
        if (shimmer.visible) {
          for (let i = 0; i < H; i++) {
            const h = hp[i];
            const rise = ((t * 0.6 + h.ph) % 2) / 2;
            e.set(0, h.ph + Math.sin(t + h.ph) * 0.3, Math.sin(t * 2 + h.ph) * 0.12);
            q.setFromEuler(e);
            v.set(at.x + h.x, 0.2 + rise * 2.5, at.z + h.z);
            m.compose(v, q, new THREE.Vector3(1, 0.6 + rise * 0.6, 1));
            shimmer.setMatrixAt(i, m);
          }
          shimmer.instanceMatrix.needsUpdate = true;
          shimmerMat.opacity = 0.07 + Math.sin(t * 3) * 0.02;
        }
      }

      // Lightning: the desk lamp flickers, a double pulse every 6-14 seconds.
      if (kind !== 'storm') { bolt = -1; return 0; }
      if (bolt < 0 && time > nextBolt) { bolt = 0; nextBolt = time + 6 + rng() * 8; }
      if (bolt < 0) return 0;
      bolt += dt;
      if (bolt > 0.6) { bolt = -1; return 0; }
      return bolt < 0.08 ? 1 : bolt < 0.18 ? 0.15 : bolt < 0.26 ? 0.8 : Math.max(0, 1 - (bolt - 0.26) / 0.34) * 0.5;
    },
  };
}
