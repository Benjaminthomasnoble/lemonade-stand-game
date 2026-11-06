// Renderer, Tycoon Camera, lights, sky, land, sea and weather for
// Citrine Bay. The bay's roads and plots are built in bay.ts.
import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { WeatherKind } from '../sim/economy.ts';

export interface World {
  renderer: THREE.WebGPURenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  backend: string;
  setWeather(kind: WeatherKind, dayFraction: number): void;
  /** Glide the camera to look at a point from a distance. */
  focus(x: number, z: number, distance: number): void;
  update(dt: number): void;
}

const SKY: Record<WeatherKind, number> = { scorcher: 0xffd99a, hot: 0x9fd8ff, warm: 0x8fd3ff, cloudy: 0xb7c4cf, rainy: 0x7d8a96, storm: 0x5d6873 };
export const BOUNDS = { minX: -180, maxX: 170, minZ: -125, maxZ: 80 };
export { SEA_X, SEA_Z } from '../sim/map.ts';
import { SEA_X, SEA_Z } from '../sim/map.ts';

export const mat = (color: number, roughness = 0.9) => new THREE.MeshStandardMaterial({ color, roughness });

export function tree(rng: () => number) {
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
  scene.background = new THREE.Color(SKY.warm);
  scene.fog = new THREE.Fog(SKY.warm, 120, 420);

  const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.5, 900);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.minDistance = 5;
  controls.maxDistance = 330;
  controls.maxPolarAngle = Math.PI * 0.44;
  controls.minPolarAngle = 0.15;
  controls.screenSpacePanning = false;
  controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
  controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };

  const hemi = new THREE.HemisphereLight(0xdff2ff, 0x6a8a4a, 1.4);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff4dd, 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 160;
  scene.add(sun, sun.target);

  // Land and sea.
  // The bay wraps the south and east: land is everything west of SEA_X and north of SEA_Z.
  const west = BOUNDS.minX - 300, north = BOUNDS.minZ - 300;
  const land = new THREE.Mesh(new THREE.PlaneGeometry(SEA_X - west, SEA_Z - north), mat(0x7cbf5a));
  land.rotation.x = -Math.PI / 2;
  land.position.set((west + SEA_X) / 2, 0, (north + SEA_Z) / 2);
  land.receiveShadow = true;
  scene.add(land);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(1200, 600), new THREE.MeshStandardMaterial({ color: 0x2bb3b1, roughness: 0.25, metalness: 0.1 }));
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(SEA_X, -0.3, SEA_Z);
  scene.add(sea);
  const sand = mat(0xf2e2b0);
  const beachS = new THREE.Mesh(new THREE.PlaneGeometry(SEA_X - west, 8), sand);
  beachS.rotation.x = -Math.PI / 2;
  beachS.position.set((west + SEA_X) / 2, 0.02, SEA_Z - 4);
  const beachE = new THREE.Mesh(new THREE.PlaneGeometry(8, SEA_Z - north), sand);
  beachE.rotation.x = -Math.PI / 2;
  beachE.position.set(SEA_X - 4, 0.02, (north + SEA_Z) / 2);
  scene.add(beachS, beachE);

  // Rain: one Points cloud that follows the camera target.
  let seed = 7;
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const rainCount = 2000;
  const rainPos = new Float32Array(rainCount * 3);
  for (let i = 0; i < rainCount; i++) {
    rainPos[i * 3] = (rng() - 0.5) * 70;
    rainPos[i * 3 + 1] = rng() * 25;
    rainPos[i * 3 + 2] = (rng() - 0.5) * 70;
  }
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.Points(rainGeo, new THREE.PointsMaterial({ color: 0xcfe3ff, size: 0.1, transparent: true, opacity: 0.7 }));
  rain.visible = false;
  rain.frustumCulled = false;
  scene.add(rain);

  const onResize = () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  };
  window.addEventListener('resize', onResize);

  let glide: { from: THREE.Vector3; to: THREE.Vector3; camFrom: THREE.Vector3; camTo: THREE.Vector3; t: number } | null = null;
  let sunAngle = 0.5;

  const world: World = {
    renderer, scene, camera, controls, backend,
    setWeather(kind, dayFraction) {
      const sky = new THREE.Color(SKY[kind]);
      sky.lerp(new THREE.Color(0xffc48a), Math.max(0, dayFraction - 0.75) * 1.2); // warm late afternoon
      (scene.background as THREE.Color).copy(sky);
      (scene.fog as THREE.Fog).color.copy(sky);
      const dim = kind === 'storm' ? 0.3 : kind === 'rainy' ? 0.45 : kind === 'cloudy' ? 0.7 : 1;
      sun.intensity = 2.6 * dim * (kind === 'scorcher' ? 1.15 : 1);
      sunAngle = Math.PI * (0.15 + 0.7 * dayFraction);
      rain.visible = kind === 'rainy' || kind === 'storm';
    },
    focus(x, z, distance) {
      const dir = camera.position.clone().sub(controls.target).normalize();
      if (dir.y < 0.3) dir.set(0.35, 0.75, 0.55).normalize();
      const to = new THREE.Vector3(x, 0.8, z);
      glide = { from: controls.target.clone(), to, camFrom: camera.position.clone(), camTo: to.clone().addScaledVector(dir, distance), t: 0 };
    },
    update(dt) {
      if (glide) {
        glide.t = Math.min(1, glide.t + dt * 1.6);
        const k = glide.t * glide.t * (3 - 2 * glide.t);
        controls.target.lerpVectors(glide.from, glide.to, k);
        camera.position.lerpVectors(glide.camFrom, glide.camTo, k);
        if (glide.t >= 1) glide = null;
      }
      // Keep the camera over the bay.
      const t = controls.target;
      const cx = THREE.MathUtils.clamp(t.x, BOUNDS.minX, BOUNDS.maxX), cz = THREE.MathUtils.clamp(t.z, BOUNDS.minZ, BOUNDS.maxZ);
      if (cx !== t.x || cz !== t.z) { camera.position.x += cx - t.x; camera.position.z += cz - t.z; t.x = cx; t.z = cz; }
      controls.update();
      // Shadows and rain follow what the camera looks at.
      const dist = camera.position.distanceTo(t);
      sun.castShadow = dist < 140;
      sun.position.set(t.x + Math.cos(sunAngle) * 50, Math.sin(sunAngle) * 50 + 10, t.z + 25);
      sun.target.position.copy(t);
      const fog = scene.fog as THREE.Fog;
      fog.near = Math.max(80, dist * 1.2);
      fog.far = Math.max(300, dist * 2.6);
      rain.position.set(t.x, 0, t.z);
      if (rain.visible) {
        const p = rainGeo.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < rainCount; i++) {
          let y = p.getY(i) - dt * 16;
          if (y < 0) y += 25;
          p.setY(i, y);
        }
        p.needsUpdate = true;
      }
    },
  };
  return world;
}
