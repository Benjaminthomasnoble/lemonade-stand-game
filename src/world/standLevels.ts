// Stand models for levels 3 to 5 (spec section 8 visual identity), built
// from simple shapes. Each returns a group plus where the counter top is
// (props sit there) and where the price sign hangs.
import * as THREE from 'three/webgpu';

export interface LevelModel { group: THREE.Group; surfaceY: number; sign: THREE.Vector3; spin?: THREE.Object3D }

const mat = (color: number, roughness = 0.8, emissive = 0) => new THREE.MeshStandardMaterial({ color, roughness, emissive });
function add(g: THREE.Group, geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) {
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}

/** L3 The Kiosk: a little building with two windows and a chalkboard menu. */
export function kiosk(): LevelModel {
  const g = new THREE.Group();
  const wall = mat(0xfff6dc), trim = mat(0xf6d33c), roof = mat(0x2bb3b1);
  add(g, new THREE.BoxGeometry(3.6, 2.6, 2.4), wall, 0, 1.3, -0.6);
  add(g, new THREE.BoxGeometry(3.9, 0.25, 2.8), roof, 0, 2.72, -0.6);
  add(g, new THREE.BoxGeometry(3.8, 0.12, 0.6), trim, 0, 1.1, 0.75);
  for (const x of [-0.9, 0.9]) add(g, new THREE.BoxGeometry(1.3, 0.9, 0.05), mat(0x23214a, 0.3), x, 1.75, 0.61);
  // chalkboard menu
  add(g, new THREE.BoxGeometry(0.7, 1.0, 0.06), mat(0x2f3a33), 1.95, 0.75, 0.9).rotation.z = 0.05;
  // juicer on the counter
  add(g, new THREE.CylinderGeometry(0.12, 0.16, 0.35, 10), mat(0xc0c8d0, 0.3), 1.2, 1.33, 0.6);
  return { group: g, surfaceY: 1.16, sign: new THREE.Vector3(0, 2.25, 0.62) };
}

/** L4 The Lemon Shack: walk-up shack, neon sign, picnic tables, ice machine. */
export function shack(): LevelModel {
  const g = new THREE.Group();
  const wood = mat(0xc98b4f), dark = mat(0x8a5a30);
  add(g, new THREE.BoxGeometry(5, 3, 3), wood, 0, 1.5, -1);
  const roof = add(g, new THREE.BoxGeometry(5.6, 0.2, 3.8), mat(0xd64545), 0, 3.25, -0.8);
  roof.rotation.x = 0.12;
  add(g, new THREE.BoxGeometry(5.2, 0.15, 0.7), dark, 0, 1.1, 0.65);
  add(g, new THREE.BoxGeometry(3.4, 1.0, 0.05), mat(0x23214a, 0.3), 0, 1.9, 0.51);
  // neon LOTTIE'S bar
  add(g, new THREE.BoxGeometry(2.6, 0.35, 0.08), mat(0xffe14a, 0.2, 0xffcc00), 0, 2.85, 0.55);
  // ice machine
  add(g, new THREE.BoxGeometry(0.8, 1.6, 0.7), mat(0xdfe9f2, 0.3), 2.9, 0.8, 0);
  // picnic tables
  for (const x of [-3.6, 3.6]) {
    add(g, new THREE.BoxGeometry(1.4, 0.08, 0.7), wood, x, 0.75, 0.5);
    for (const z of [0.0, 1.0]) add(g, new THREE.BoxGeometry(1.4, 0.06, 0.25), wood, x, 0.45, z);
    add(g, new THREE.BoxGeometry(0.1, 0.75, 0.6), dark, x, 0.37, 0.5);
  }
  return { group: g, surfaceY: 1.18, sign: new THREE.Vector3(0, 0.6, 1.01) };
}

/** L5 The Citrus Palace: lemon dome, spinning lemon on a pole, fountain. */
export function palace(): LevelModel {
  const g = new THREE.Group();
  const cream = mat(0xfff6dc), lemon = mat(0xf6d33c, 0.4);
  add(g, new THREE.CylinderGeometry(2.4, 2.5, 2.8, 28), cream, 0, 1.4, -2.2);
  const dome = add(g, new THREE.SphereGeometry(2.45, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), lemon, 0, 2.8, -2.2);
  dome.scale.set(1, 0.8, 1);
  // walk-up front: a flat facade with a wide window and counter
  add(g, new THREE.BoxGeometry(3.6, 2.4, 0.5), cream, 0, 1.2, 0.05);
  add(g, new THREE.BoxGeometry(2.8, 0.9, 0.06), mat(0x23214a, 0.3), 0, 1.8, 0.32);
  add(g, new THREE.BoxGeometry(3.8, 0.15, 0.6), lemon, 0, 1.1, 0.5);
  // pole and the giant spinning lemon
  add(g, new THREE.CylinderGeometry(0.1, 0.12, 5, 8), mat(0xb8c2cc, 0.3), 2.9, 2.5, 0.2);
  const big = add(g, new THREE.SphereGeometry(0.7, 16, 12), lemon, 2.9, 5.4, 0.2);
  big.scale.set(1.35, 1, 1);
  // lemonade fountain
  add(g, new THREE.CylinderGeometry(0.8, 0.9, 0.4, 20), cream, -3.2, 0.2, 0);
  add(g, new THREE.CylinderGeometry(0.68, 0.68, 0.05, 20), mat(0xfff15a, 0.1, 0x554400), -3.2, 0.38, 0);
  add(g, new THREE.CylinderGeometry(0.07, 0.07, 0.9, 8), cream, -3.2, 0.8, 0);
  return { group: g, surfaceY: 1.18, sign: new THREE.Vector3(0, 0.55, 0.31), spin: big };
}
