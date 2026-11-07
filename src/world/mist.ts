// Dawn's cotton-wool mist on the resin bay (design spec "Light, weather and seasons", Dawn row):
// soft pulled-cotton puffs lying on the water, thick at first light and gone by mid-morning.
import * as THREE from 'three';
import { lcg, lumpy, sph } from './clay/core.ts';
import { SEA_X, SEA_Z } from '../sim/map.ts';

export interface Mist { update(hour: number, time: number): void }

export function createMist(scene: THREE.Scene, phone: boolean): Mist {
  const rng = lcg(17);
  const geo = lumpy(sph(1, 10, 6), 0.18, 1.6, 4);
  const mat = new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 1, transparent: true, opacity: 0, depthWrite: false, emissive: new THREE.Color('#fff4ea'), emissiveIntensity: 0.35 });
  const N = phone ? 16 : 30;
  const puffs = new THREE.InstancedMesh(geo, mat, N);
  puffs.name = 'dawn-mist';
  puffs.frustumCulled = false;
  puffs.renderOrder = 3;
  // along the south shore's resin, and a few on the east water
  const at = Array.from({ length: N }, (_, i) => {
    const east = i % 5 === 4;
    return {
      x: east ? SEA_X + 4 + rng() * 10 : -175 + rng() * (SEA_X + 175),
      z: east ? -120 + rng() * (SEA_Z + 110) : SEA_Z + 3 + rng() * 22,
      s: 4 + rng() * 6, ph: rng() * 6,
    };
  });
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  puffs.visible = false;
  scene.add(puffs);
  let lastF = -1;
  return {
    update(hour, time) {
      // thick until 7:00, thinning to nothing by 9:30
      const amount = THREE.MathUtils.clamp((9.5 - hour) / 2.5, 0, 1);
      puffs.visible = amount > 0.01;
      if (!puffs.visible) return;
      mat.opacity = 0.55 * amount;
      const f = Math.floor(time * 12);
      if (f === lastF) return; // drift on twos
      lastF = f;
      const t = f / 12;
      at.forEach((a, i) => {
        p.set(a.x + Math.sin(t * 0.05 + a.ph) * 3, 0.4, a.z + Math.cos(t * 0.04 + a.ph) * 1.5);
        s.set(a.s * 1.6, a.s * 0.22 * (0.6 + 0.4 * amount), a.s);
        puffs.setMatrixAt(i, m.compose(p, q, s));
      });
      puffs.instanceMatrix.needsUpdate = true;
    },
  };
}
