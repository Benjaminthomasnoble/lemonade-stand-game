// The 3D neighborhood: renderer, camera, lights, sky, ground, street,
// houses and trees. Everything is built in code (no model files), in the
// same spirit as Owl World.
import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { WeatherKind } from '../sim/economy.ts';

export interface World {
  renderer: THREE.WebGPURenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  setWeather(kind: WeatherKind, dayFraction: number): void;
  update(dt: number): void;
  backend: string;
}

const SKY: Record<WeatherKind, number> = { sunny: 0x8fd3ff, cloudy: 0xb7c4cf, rainy: 0x7d8a96, heatwave: 0xffd99a };

function mat(color: number, roughness = 0.9) {
  return new THREE.MeshStandardMaterial({ color, roughness });
}

function box(w: number, h: number, d: number, color: number) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function tree(rng: () => number) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.22, 1.4, 6), mat(0x7a5232));
  trunk.position.y = 0.7;
  trunk.castShadow = true;
  g.add(trunk);
  const green = [0x4f9a3a, 0x5aab43, 0x3f8a35][Math.floor(rng() * 3)];
  for (let i = 0; i < 3; i++) {
    const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9 - i * 0.2, 0), mat(green));
    leaf.position.set((rng() - 0.5) * 0.4, 1.7 + i * 0.55, (rng() - 0.5) * 0.4);
    leaf.castShadow = true;
    g.add(leaf);
  }
  g.scale.setScalar(0.9 + rng() * 0.6);
  return g;
}

function house(rng: () => number) {
  const g = new THREE.Group();
  const colors = [0xf2e3c6, 0xd8e8f0, 0xf5d0c5, 0xdfeccf, 0xfff2b3];
  const w = 4 + rng() * 2;
  const body = box(w, 2.6, 4, colors[Math.floor(rng() * colors.length)]);
  body.position.y = 1.3;
  g.add(body);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(w * 0.78, 1.6, 4), mat([0x9c4a3b, 0x5b6470, 0x7a5a44][Math.floor(rng() * 3)]));
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(1, 1, 0.75);
  roof.position.y = 3.4;
  roof.castShadow = true;
  g.add(roof);
  const door = box(0.8, 1.5, 0.05, 0x6b4a2e);
  door.position.set(0, 0.75, 2.01);
  g.add(door);
  for (const x of [-w / 3, w / 3]) {
    const win = box(0.8, 0.7, 0.05, 0xbfe3ff);
    win.position.set(x, 1.6, 2.01);
    g.add(win);
  }
  return g;
}

export async function createWorld(container: HTMLElement): Promise<World> {
  const renderer = new THREE.WebGPURenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  container.appendChild(renderer.domElement);
  await renderer.init();
  const backend = (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'webgpu' : 'webgl2';

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY.sunny);
  scene.fog = new THREE.Fog(SKY.sunny, 40, 90);

  const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 200);
  camera.position.set(9, 8, 14);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1, 0);
  controls.enableDamping = true;
  controls.minDistance = 7;
  controls.maxDistance = 40;
  controls.maxPolarAngle = Math.PI * 0.45;
  controls.enablePan = false;

  const hemi = new THREE.HemisphereLight(0xdff2ff, 0x6a8a4a, 1.4);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff4dd, 2.6);
  sun.position.set(12, 18, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -25; sc.right = 25; sc.top = 25; sc.bottom = -25; sc.far = 60;
  scene.add(sun);

  // Ground, street and sidewalk run along X; the stand sits on the lawn at z<0.
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), mat(0x7cbf5a));
  grass.rotation.x = -Math.PI / 2;
  grass.receiveShadow = true;
  scene.add(grass);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(200, 6), mat(0x55575c));
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0.01, 6);
  road.receiveShadow = true;
  scene.add(road);
  for (let x = -100; x < 100; x += 4) {
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(2, 0.15), mat(0xf4f1d0));
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(x, 0.02, 6);
    scene.add(dash);
  }
  const walk = new THREE.Mesh(new THREE.BoxGeometry(200, 0.12, 2.2), mat(0xd6d2c8));
  walk.position.set(0, 0.06, 2.2);
  walk.receiveShadow = true;
  scene.add(walk);

  let seed = 99;
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = -5; i <= 5; i++) {
    if (i === 0) continue;
    const h = house(rng);
    h.position.set(i * 9 + (rng() - 0.5) * 2, 0, -9 - rng() * 2);
    scene.add(h);
    const h2 = house(rng);
    h2.position.set(i * 9 + 4, 0, 14 + rng() * 2);
    h2.rotation.y = Math.PI;
    scene.add(h2);
  }
  for (let i = 0; i < 40; i++) {
    const t = tree(rng);
    const side = rng() < 0.5 ? -1 : 1;
    t.position.set((rng() - 0.5) * 100, 0, side < 0 ? -4 - rng() * 14 : 10 + rng() * 10);
    if (Math.abs(t.position.x) < 4 && t.position.z > -6) continue;
    scene.add(t);
  }

  // Rain: one Points cloud that follows the camera target.
  const rainCount = 1500;
  const rainPos = new Float32Array(rainCount * 3);
  for (let i = 0; i < rainCount; i++) {
    rainPos[i * 3] = (rng() - 0.5) * 50;
    rainPos[i * 3 + 1] = rng() * 20;
    rainPos[i * 3 + 2] = (rng() - 0.5) * 40;
  }
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.Points(rainGeo, new THREE.PointsMaterial({ color: 0xcfe3ff, size: 0.08, transparent: true, opacity: 0.7 }));
  rain.visible = false;
  scene.add(rain);

  const onResize = () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  };
  window.addEventListener('resize', onResize);

  return {
    renderer, scene, camera, controls, sun, hemi, backend,
    setWeather(kind, dayFraction) {
      const sky = new THREE.Color(SKY[kind]);
      // Warm the sky toward late afternoon.
      sky.lerp(new THREE.Color(0xffc48a), Math.max(0, dayFraction - 0.75) * 1.2);
      (scene.background as THREE.Color).copy(sky);
      (scene.fog as THREE.Fog).color.copy(sky);
      const dim = kind === 'rainy' ? 0.45 : kind === 'cloudy' ? 0.7 : 1;
      sun.intensity = 2.6 * dim * (kind === 'heatwave' ? 1.15 : 1);
      const angle = Math.PI * (0.15 + 0.7 * dayFraction);
      sun.position.set(Math.cos(angle) * 18, Math.sin(angle) * 18 + 3, 8);
      rain.visible = kind === 'rainy';
    },
    update(dt) {
      controls.update();
      if (rain.visible) {
        const p = rainGeo.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < rainCount; i++) {
          let y = p.getY(i) - dt * 14;
          if (y < 0) y += 20;
          p.setY(i, y);
        }
        p.needsUpdate = true;
      }
    },
  };
}
