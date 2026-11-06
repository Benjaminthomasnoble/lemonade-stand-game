// Renderer, Tycoon Camera, lights, sky, land, sea and weather for
// Citrine Bay. The bay's roads and plots are built in bay.ts.
import * as THREE from 'three/webgpu';
import { abs, float, mix, pass, screenUV, smoothstep, uniform } from 'three/tsl';
import { gaussianBlur } from 'three/addons/tsl/display/GaussianBlurNode.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { WeatherKind } from '../sim/economy.ts';
import { mood, neonGlow, nightGlow, paint, PAL } from './paint.ts';

export interface World {
  renderer: THREE.WebGPURenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  backend: string;
  /**
   * Weather and time of day. dayFraction runs 0..1 over business hours
   * (08:00-20:00); 0 during Morning Prep holds dawn, and 1 or more is night.
   */
  setWeather(kind: WeatherKind, dayFraction: number): void;
  /** Force the noir night look (raids) on or off, whatever the clock says. */
  setNoir(on: boolean): void;
  /** Draw a frame through the tilt-shift pass. */
  render(): void;
  /** Glide the camera to look at a point from a distance. */
  focus(x: number, z: number, distance: number): void;
  update(dt: number): void;
}

const SKY: Record<WeatherKind, number> = { scorcher: 0xffd99a, hot: 0x9fd8ff, warm: 0x8fd3ff, cloudy: 0xb7c4cf, rainy: 0x7d8a96, storm: 0x5d6873 };
export const BOUNDS = { minX: -180, maxX: 170, minZ: -125, maxZ: 80 };
export { SEA_X, SEA_Z } from '../sim/map.ts';
import { SEA_X, SEA_Z } from '../sim/map.ts';

export const mat = (color: number, roughness = 0.9) => paint(color, { rough: roughness });

// One tree, recolored and rescaled across the bay: a ball tree on a peg trunk.
const trunkGeo = new THREE.CylinderGeometry(0.16, 0.24, 1.5, 8);
const ballGeo = new THREE.SphereGeometry(1, 14, 10);
const coneGeo = new THREE.ConeGeometry(0.9, 2.2, 10);
export function tree(rng: () => number) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(trunkGeo, mat(PAL.driftwood - 0x202020));
  trunk.position.y = 0.75;
  trunk.castShadow = true;
  g.add(trunk);
  const green = [PAL.peel, 0x6db35f, 0x4e9150, 0x7cbf5a][Math.floor(rng() * 4)];
  if (rng() < 0.75) {
    const ball = new THREE.Mesh(ballGeo, mat(green));
    ball.position.y = 2.1;
    ball.scale.set(1.15, 1.05, 1.15);
    ball.castShadow = true;
    g.add(ball);
  } else {
    const cone = new THREE.Mesh(coneGeo, mat(green - 0x101010));
    cone.position.y = 2.3;
    cone.castShadow = true;
    g.add(cone);
  }
  g.scale.setScalar(0.85 + rng() * 0.55);
  return g;
}

// ---------------------------------------------------------------- lighting scripts

interface Script { sky: number; sun: number; sunI: number; hemiSky: number; hemiGround: number; hemiI: number }
/** Four lighting scripts (spec: Light, weather and seasons). */
const SCRIPTS = {
  dawn: { sky: 0xffc7a6, sun: 0xffbf94, sunI: 1.7, hemiSky: 0xffe0cc, hemiGround: 0x8f7fb0, hemiI: 1.25 },
  noon: { sky: 0x9fd8ff, sun: 0xfff4dd, sunI: 2.6, hemiSky: 0xdff2ff, hemiGround: 0x6a8a4a, hemiI: 1.4 },
  golden: { sky: 0xf7a072, sun: 0xffa45c, sunI: 2.1, hemiSky: 0xffcfa0, hemiGround: 0x7d5a6e, hemiI: 1.15 },
  night: { sky: 0x2a2858, sun: 0xa9b8ff, sunI: 0.75, hemiSky: 0x5a5fa8, hemiGround: 0x23214a, hemiI: 0.95 },
} satisfies Record<string, Script>;
const WEATHER_GREY: Partial<Record<WeatherKind, [number, number]>> = { cloudy: [0xb7c4cf, 0.45], rainy: [0x7d8a96, 0.6], storm: [0x5d6873, 0.7] };

const ca = new THREE.Color(), cb = new THREE.Color();
function blendScript(a: Script, b: Script, k: number) {
  const c = (x: number, y: number) => ca.setHex(x).lerp(cb.setHex(y), k).getHex();
  return { sky: c(a.sky, b.sky), sun: c(a.sun, b.sun), sunI: a.sunI + (b.sunI - a.sunI) * k, hemiSky: c(a.hemiSky, b.hemiSky), hemiGround: c(a.hemiGround, b.hemiGround), hemiI: a.hemiI + (b.hemiI - a.hemiI) * k };
}
/** The game hour for a fraction of business hours (prep holds dawn at 07:00). */
const hourOf = (f: number) => (f <= 0 ? 7 : 8 + 12 * f);
/** Each script blends into the next over one game hour. */
function scriptAt(hour: number): { s: Script; night: number } {
  const ramp = (h0: number) => THREE.MathUtils.clamp(hour - h0, 0, 1);
  if (hour < 8) return { s: SCRIPTS.dawn, night: 0 };
  if (hour < 9) return { s: blendScript(SCRIPTS.dawn, SCRIPTS.noon, ramp(8)), night: 0 };
  if (hour < 17) return { s: SCRIPTS.noon, night: 0 };
  if (hour < 18) return { s: blendScript(SCRIPTS.noon, SCRIPTS.golden, ramp(17)), night: 0 };
  if (hour < 19) return { s: SCRIPTS.golden, night: 0 };
  if (hour < 20) return { s: blendScript(SCRIPTS.golden, SCRIPTS.night, ramp(19)), night: ramp(19) };
  return { s: SCRIPTS.night, night: 1 };
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
  // Other world modules (streetlights, Bay View tiles) read these.
  scene.userData.camera = camera;
  scene.userData.focus = controls.target;

  const hemi = new THREE.HemisphereLight(0xdff2ff, 0x6a8a4a, 1.4);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff4dd, 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.radius = 3;
  sun.shadow.bias = -0.0005;
  const sc = sun.shadow.camera;
  sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 160;
  scene.add(sun, sun.target);

  // Land and sea.
  // The bay wraps the south and east: land is everything west of SEA_X and north of SEA_Z.
  const west = BOUNDS.minX - 300, north = BOUNDS.minZ - 300;
  const land = new THREE.Mesh(new THREE.PlaneGeometry(SEA_X - west, SEA_Z - north), mat(0x86c464, 1));
  land.rotation.x = -Math.PI / 2;
  land.position.set((west + SEA_X) / 2, 0, (north + SEA_Z) / 2);
  land.receiveShadow = true;
  scene.add(land);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(1200, 600), new THREE.MeshStandardMaterial({ color: PAL.bay, roughness: 0.25, metalness: 0.1 }));
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

  // Tilt-shift (spec: Camera): a sharp band through the middle of the
  // screen, blurring toward the top and bottom. Strongest in Street View,
  // thinnest in Bay View.
  const tilt = uniform(1);
  let pipeline: THREE.RenderPipeline | null = null;
  try {
    pipeline = new THREE.RenderPipeline(renderer);
    const scenePass = pass(scene, camera);
    const color = scenePass.getTextureNode('output');
    const blurred = gaussianBlur(color, float(1.6), 4, { resolutionScale: 0.5 });
    const mask = smoothstep(float(0.2), float(0.52), abs(screenUV.y.sub(0.58))).mul(tilt);
    pipeline.outputNode = mix(color, blurred, mask);
  } catch (err) {
    console.warn('Tilt-shift unavailable, drawing without it', err);
    pipeline = null;
  }

  const onResize = () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  };
  window.addEventListener('resize', onResize);

  let glide: { from: THREE.Vector3; to: THREE.Vector3; camFrom: THREE.Vector3; camTo: THREE.Vector3; t: number } | null = null;
  let hour = 7;
  let weather: WeatherKind = 'warm';
  let noirMix = 0; // eases toward 1 while a raid forces night
  const sky = new THREE.Color(), tmp = new THREE.Color();

  function applyLight(dt: number) {
    noirMix = THREE.MathUtils.clamp(noirMix + (mood.noir ? dt : -dt) * 1.5, 0, 1);
    const at = scriptAt(hour);
    const s = noirMix > 0 ? blendScript(at.s, SCRIPTS.night, noirMix) : at.s;
    const night = Math.max(at.night, noirMix);
    sky.setHex(s.sky);
    if (hour >= 9 && hour < 17 && night === 0) sky.setHex(SKY[weather]);
    const grey = WEATHER_GREY[weather];
    if (grey) sky.lerp(tmp.setHex(grey[0]).multiplyScalar(1 - night * 0.6), grey[1] * (1 - night * 0.5));
    (scene.background as THREE.Color).copy(sky);
    (scene.fog as THREE.Fog).color.copy(sky);
    const dim = weather === 'storm' ? 0.3 : weather === 'rainy' ? 0.45 : weather === 'cloudy' ? 0.7 : 1;
    sun.color.setHex(s.sun);
    // Night keeps a moonlit key light so shadows never drop below a quarter of daytime.
    sun.intensity = s.sunI * (night > 0.5 ? Math.max(dim, 0.7) : dim) * (weather === 'scorcher' ? 1.15 : 1);
    hemi.color.setHex(s.hemiSky);
    hemi.groundColor.setHex(s.hemiGround);
    hemi.intensity = s.hemiI * (0.85 + 0.15 * dim);
    nightGlow.value = night;
    neonGlow.value = Math.max(night, hour >= 19.5 ? 1 : 0);
  }

  function sunOffset(): [number, number, number] {
    // Sun rises out of the bay (east) and sinks behind the Groves (west);
    // the moon hangs high in the south-west.
    const night = Math.max(scriptAt(hour).night, noirMix);
    if (night > 0.5) return [-28, 55, 30];
    const a = Math.PI * THREE.MathUtils.clamp((hour - 5.5) / 15, 0.05, 0.95);
    return [Math.cos(a) * 55, Math.sin(a) * 50 + 8, 25];
  }

  const world: World = {
    renderer, scene, camera, controls, backend,
    setWeather(kind, dayFraction) {
      weather = kind;
      hour = hourOf(dayFraction);
      rain.visible = kind === 'rainy' || kind === 'storm';
    },
    setNoir(on) { mood.noir = on; },
    render() {
      if (pipeline) pipeline.render();
      else renderer.render(scene, camera);
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
      applyLight(dt);
      // Shadows and rain follow what the camera looks at.
      const dist = camera.position.distanceTo(t);
      sun.castShadow = dist < 140;
      const [ox, oy, oz] = sunOffset();
      sun.position.set(t.x + ox, oy, t.z + oz);
      sun.target.position.copy(t);
      tilt.value = THREE.MathUtils.clamp(0.95 - (dist - 25) / 180, 0.12, 0.85);
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
