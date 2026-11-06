// Streetlights (spec: Night (noir) script): one lamp repeated down every
// district street. By night the globes glow and pour amber pools on the
// sidewalk; a handful of real lights follow the camera so the nearest lamps
// also light the stands and walkers.
import * as THREE from 'three/webgpu';
import { color, texture, uv } from 'three/tsl';
import { DISTRICTS, PLOT_SPACING, STREET_HALF } from '../sim/economy.ts';
import { glowTexture, nightGlow, paint, PAL } from './paint.ts';

const LIGHTS = 4;

export interface Streetlights { update(): void }

export function createStreetlights(scene: THREE.Scene): Streetlights {
  // Lamps stand at every other plot boundary along the curb, alternating sides.
  const spots: THREE.Vector3[] = [];
  const faces: number[] = [];
  for (const d of DISTRICTS) {
    for (let i = 0; i <= d.cols; i++) {
      const side = i % 2 ? 1 : -1;
      spots.push(new THREE.Vector3(d.origin[0] + i * PLOT_SPACING, 0, d.origin[1] + side * (STREET_HALF + 0.35)));
      faces.push(-side);
    }
  }
  const n = spots.length;
  const poleGeo = new THREE.CylinderGeometry(0.07, 0.1, 3.4, 8).translate(0, 1.7, 0);
  const armGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.8, 6).rotateX(Math.PI / 2).translate(0, 3.35, 0.35);
  const hoodGeo = new THREE.ConeGeometry(0.32, 0.28, 12).translate(0, 3.42, 0.75);
  const globeGeo = new THREE.SphereGeometry(0.17, 12, 8).translate(0, 3.22, 0.75);
  const poles = new THREE.InstancedMesh(poleGeo, paint(PAL.indigo, { rough: 0.5 }), n);
  const arms = new THREE.InstancedMesh(armGeo, paint(PAL.indigo, { rough: 0.5 }), n);
  const hoods = new THREE.InstancedMesh(hoodGeo, paint(0x3a3866, { rough: 0.5 }), n);
  const globes = new THREE.InstancedMesh(globeGeo, paint(0xfff1c9, { rough: 0.3, glow: 'night', glowColor: PAL.amber, glowStrength: 3 }), n);
  poles.castShadow = true;
  hoods.castShadow = true;

  // Amber pools on the ground: additive glow discs that fade in at dusk.
  const poolMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  poolMat.colorNode = color(PAL.amber);
  poolMat.opacityNode = texture(glowTexture(), uv()).a.mul(nightGlow).mul(0.55);
  const poolGeo = new THREE.PlaneGeometry(5.6, 5.6).rotateX(-Math.PI / 2);
  const pools = new THREE.InstancedMesh(poolGeo, poolMat, n);
  pools.renderOrder = 2;

  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
  spots.forEach((p, i) => {
    q.setFromAxisAngle(up, faces[i] > 0 ? 0 : Math.PI);
    m.compose(p, q, one);
    poles.setMatrixAt(i, m); arms.setMatrixAt(i, m); hoods.setMatrixAt(i, m); globes.setMatrixAt(i, m);
    m.makeTranslation(p.x, 0.16, p.z + faces[i] * 1.0);
    pools.setMatrixAt(i, m);
  });
  for (const im of [poles, arms, hoods, globes, pools]) { im.computeBoundingSphere(); scene.add(im); }

  // A fixed pool of real lights (a fixed count keeps shaders from recompiling).
  const lights: THREE.PointLight[] = [];
  for (let i = 0; i < LIGHTS; i++) {
    const l = new THREE.PointLight(PAL.amber, 0, 11, 1.6);
    scene.add(l);
    lights.push(l);
  }
  let last = new THREE.Vector3(Infinity, 0, 0);
  const focus = () => scene.userData.focus as THREE.Vector3 | undefined;

  return {
    update() {
      const glow = nightGlow.value;
      pools.visible = glow > 0.01;
      const f = focus();
      if (!f) return;
      if (f.distanceToSquared(last) > 4) {
        last = f.clone();
        const near = spots.map((p, i) => [p.distanceToSquared(f), i] as const).sort((a, b) => a[0] - b[0]).slice(0, LIGHTS);
        near.forEach(([, i], k) => lights[k].position.set(spots[i].x, 3.0, spots[i].z + faces[i] * 0.75));
      }
      for (const l of lights) l.intensity = glow * 14;
    },
  };
}
