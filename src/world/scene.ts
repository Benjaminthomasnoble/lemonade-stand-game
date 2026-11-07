// Renderer, Tycoon Camera, light, air and weather for Citrine Bay, in
// Kitchen-Table Clay: the bay is a plasticine model on a thick plinth on
// Grandma Lottie's oilcloth kitchen table (diorama.ts), lit by four lighting
// scripts (lighting.ts) and finished with a soft tilt-shift (clay/post.ts).
// The bay's roads and plots are built in bay.ts.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Phase, WeatherKind } from '../sim/economy.ts';
import { Baker, bend, canvasTex, cyl, hash, lumpy, makeEnv, sph } from './clay/core.ts';
import { clayFrom, kit, setEnvironment } from './clay/kit.ts';
import { P } from './clay/palette.ts';
import { createPost, type ClayPost } from './clay/post.ts';
import { buildDiorama, DESK_LAMP, PLINTH } from './diorama.ts';
import { cloneLook, hourOf, lookAt, LOOKS, mixLook, weatherOn } from './lighting.ts';

export interface RenderStats { calls: number; triangles: number; geometries: number; textures: number }
export type Quality = 'laptop' | 'phone';
export type Detail = 0 | 1 | 2;
/** Camera distances where mid zoom and Bay View detail begin. */
export const DETAIL_AT = { mid: 45, bay: 200 };

export interface World {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  backend: string;
  /** 'phone' runs a lighter pipeline: no shadow map (blob shadows instead), no tilt-shift blur, lower pixel ratio and MSAA, one detail level simpler. */
  quality: Quality;
  /** The detail level this frame: 0 Street View, 1 mid zoom, 2 Bay View (phones run one level simpler). Also in scene.userData.detail. */
  detail(): Detail;
  /** Weather for the sky and sun. `dayFraction` (0 open … 1 close) sets the hour unless setClock is used. */
  setWeather(kind: WeatherKind, dayFraction: number): void;
  /** The game clock for the lighting scripts: prep holds dawn, open follows the minute, report is night. */
  setClock(phase: Phase, minute: number): void;
  /** Glide the camera to look at a point from a distance. */
  focus(x: number, z: number, distance: number): void;
  update(dt: number): void;
  /** Draw a frame (scene, tilt-shift, vignette). */
  render(): void;
  /** Draw calls and triangles of the last frame (shadow and post passes included). */
  stats(): RenderStats;
  /** 0 by day … 1 at night, after blending (for slices that switch lamps or neon). */
  night(): number;
}

export const BOUNDS = { minX: -180, maxX: 170, minZ: -125, maxZ: 80 };
/** Where Bay View looks from: the whole plinth on the kitchen table. */
export const BAY_VIEW = { x: PLINTH.cx, z: PLINTH.cz + 6, distance: 400 };
export { SEA_X, SEA_Z } from '../sim/map.ts';
export { TABLE_Y } from './diorama.ts';

/**
 * A clay material for an ordinary mesh (shiny or metal reads as glossy resin).
 * Kept for every model that still builds from separate meshes; new models bake with clay/core's Baker.
 */
export const mat = (color: number, roughness = 0.9) => clayFrom(color, roughness);

const GREENS = [P.green, P.leaf, P.leaf2, P.leaf3];
/** Bake one clay tree (walnut trunk, lumpy leaf balls; one in three is a lemon tree) into a Baker. */
export function treeInto(B: Baker, x: number, z: number, rng: () => number, scale = 1, seed = 0) {
  const s = scale, i = seed;
  const hgt = (1.6 + rng() * 0.8) * s;
  B.add(bend(cyl(0.16 * s, 0.26 * s, hgt, 6), (yy) => Math.sin(yy * 1.4 + i) * 0.12 * s), P.walnut, { p: [x, hgt / 2, z] });
  const n = 3 + Math.floor(rng() * 2);
  const lemons = rng() < 0.34;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + i, r = k === 0 ? 0 : 0.75 * s;
    const rr = ((k === 0 ? 1.3 : 0.92) + rng() * 0.3) * s;
    B.add(lumpy(sph(rr, 9, 6), 0.12 * s, 1.4 / s, i * 5 + k), GREENS[(i + k) % 4], { p: [x + Math.cos(a) * r, hgt + (0.9 + (k === 0 ? 0.5 : hash(k, i) * 0.5)) * s, z + Math.sin(a) * r] });
  }
  if (lemons) for (let k = 0; k < 5; k++) { const a = k * 1.7 + i; B.add(sph(0.15 * s, 5, 4), P.lemon, { p: [x + Math.cos(a) * 1.2 * s, hgt + (0.7 + (k % 3) * 0.45) * s, z + Math.sin(a) * 1.2 * s], s: [1.3, 1, 1] }); }
}
/** A single clay tree as its own mesh (prefer treeInto and one baked mesh for many trees). */
export function tree(rng: () => number) {
  const g = new THREE.Group();
  const B = new Baker();
  treeInto(B, 0, 0, rng, 0.9 + rng() * 0.5, Math.floor(rng() * 100));
  const m = new THREE.Mesh(B.build(), kit().world);
  m.castShadow = true; m.receiveShadow = true;
  g.add(m);
  return g;
}

/** The kitchen beyond the table: blurred wall, window, a shelf of jars; dark with a lamp glow at night. */
function backdrop(night: boolean) {
  return canvasTex(512, 512, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 512);
    if (night) { g.addColorStop(0, '#191733'); g.addColorStop(0.6, '#2a2340'); g.addColorStop(1, '#3a2b3c'); } else { g.addColorStop(0, '#f4dfbd'); g.addColorStop(0.55, '#f6e6c8'); g.addColorStop(1, '#ead2ab'); }
    c.fillStyle = g; c.fillRect(0, 0, 512, 512);
    c.filter = 'blur(14px)';
    c.fillStyle = night ? '#24356a' : '#cfeaf2'; c.fillRect(60, 40, 170, 150);
    if (night) { c.fillStyle = '#fff3c8'; c.beginPath(); c.arc(185, 80, 18, 0, 6.3); c.fill(); }
    c.fillStyle = night ? '#120f22' : '#a77b55'; c.fillRect(140, 40, 10, 150); c.fillRect(60, 110, 170, 10);
    c.fillStyle = night ? '#2a2036' : '#c79a6e'; c.fillRect(300, 120, 190, 12);
    [P.lemon, P.terra, P.green, P.blush].forEach((col, i) => { c.fillStyle = night ? '#3a2e48' : col; c.fillRect(310 + i * 45, 70, 30, 50); });
    if (night) { const r = c.createRadialGradient(40, 330, 10, 40, 330, 260); r.addColorStop(0, 'rgba(255,190,110,0.55)'); r.addColorStop(1, 'rgba(255,190,110,0)'); c.fillStyle = r; c.fillRect(0, 0, 512, 512); }
    c.filter = 'none';
  });
}

function pickQuality(): Quality {
  const q = new URLSearchParams(location.search).get('quality');
  if (q === 'phone' || q === 'laptop') return q;
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  return coarse && Math.min(screen.width, screen.height) <= 820 ? 'phone' : 'laptop';
}

export async function createWorld(container: HTMLElement): Promise<World> {
  const quality = pickQuality();
  const phone = quality === 'phone';
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, phone ? 1.5 : 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = !phone; // phones get blob shadows (bay.ts) instead
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.info.autoReset = false;
  container.appendChild(renderer.domElement);
  const backend = 'webgl2';
  const K = kit();
  const env = makeEnv(renderer);
  setEnvironment(env.texture);

  const scene = new THREE.Scene();
  const bgDay = backdrop(false), bgNight = backdrop(true);
  scene.background = bgDay;
  scene.fog = new THREE.Fog(LOOKS.noon.fog, 120, 420);

  const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.5, 4000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.minDistance = 5;
  controls.maxDistance = 470;
  controls.maxPolarAngle = Math.PI * 0.44;
  controls.minPolarAngle = 0.15;
  controls.screenSpacePanning = false;
  controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
  controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };

  // One sun (the desk lamp at night) with shadows, and a warm hemisphere fill.
  const hemi = new THREE.HemisphereLight(LOOKS.noon.sky, LOOKS.noon.ground, LOOKS.noon.hemiI);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(LOOKS.noon.sun, LOOKS.noon.sunI);
  sun.castShadow = !phone;
  const mapSize = phone ? 1024 : 2048;
  sun.shadow.mapSize.set(mapSize, mapSize);
  sun.shadow.bias = -0.0005;
  sun.shadow.radius = 2.2;
  scene.add(sun, sun.target);

  // The diorama: plinth, resin sea, the kitchen table and its props.
  const dio = buildDiorama();
  scene.add(dio.group);
  const halos = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(dio.bulbs.flatMap((b) => [b.x, b.y, b.z]), 3)), K.halo.clone());
  (halos.material as THREE.PointsMaterial).size = 60;
  halos.frustumCulled = false;
  scene.add(halos);

  // Rain: one Points cloud of resin droplets that follows the camera target.
  let seed = 7;
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const rainCount = phone ? 900 : 2000;
  const rainPos = new Float32Array(rainCount * 3);
  for (let i = 0; i < rainCount; i++) {
    rainPos[i * 3] = (rng() - 0.5) * 70;
    rainPos[i * 3 + 1] = rng() * 25;
    rainPos[i * 3 + 2] = (rng() - 0.5) * 70;
  }
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.Points(rainGeo, new THREE.PointsMaterial({ color: 0xd8f2f4, size: 0.12, transparent: true, opacity: 0.75 }));
  rain.visible = false;
  rain.frustumCulled = false;
  scene.add(rain);

  // Bay View people: every figure (anything with userData.limbs at the top of the scene) draws as one clay speck in one instanced draw.
  const SPECKS = 400;
  const speckB = new Baker();
  speckB.add(cyl(0.3, 0.36, 1.0, 7), '#ffffff', { p: [0, 0.6, 0] });
  speckB.add(sph(0.3, 7, 5), '#ffffff', { p: [0, 1.35, 0] });
  const specks = new THREE.InstancedMesh(speckB.build(), K.world, SPECKS);
  specks.name = 'people-specks';
  specks.castShadow = !phone;
  specks.frustumCulled = false;
  specks.count = 0;
  scene.add(specks);
  const hiddenPeople: THREE.Object3D[] = [];
  const speckM = new THREE.Matrix4(), speckC = new THREE.Color();
  function toSpecks(dist: number) {
    let n = 0;
    for (const o of scene.children) {
      if (!o.visible || !o.userData.limbs || n >= SPECKS) continue;
      hiddenPeople.push(o);
      o.visible = false;
      const s = Math.max(0.6, o.scale.y) * (dist > DETAIL_AT.bay ? 1.4 : 1);
      specks.setMatrixAt(n, speckM.makeScale(s, s, s).setPosition(o.position.x, o.position.y, o.position.z));
      let col: THREE.Color | null = null;
      o.traverse((c) => { const m = (c as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined; if (!col && m?.color) col = m.color; });
      specks.setColorAt(n, speckC.copy(col ?? speckC.set('#e8704f')));
      n++;
    }
    specks.count = n;
    specks.instanceMatrix.needsUpdate = true;
    if (specks.instanceColor) specks.instanceColor.needsUpdate = true;
  }

  const post: ClayPost = createPost(renderer, scene, camera, phone ? 2 : 4);
  const onResize = () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
    post.setSize(container.clientWidth, container.clientHeight);
  };
  onResize();
  window.addEventListener('resize', onResize);

  let glide: { from: THREE.Vector3; to: THREE.Vector3; camFrom: THREE.Vector3; camTo: THREE.Vector3; t: number } | null = null;
  let weather: WeatherKind = 'warm';
  let hour = 7;
  let clocked = false;
  const target = cloneLook(LOOKS.dawn), current = cloneLook(LOOKS.dawn);
  let first = true;
  let time = 0, lastF = -1;
  const lastShadow = new THREE.Vector3(Infinity, 0, 0);
  let lastHalf = 0;
  let detail: Detail = 0;
  const lightDir = new THREE.Vector3();
  scene.userData.detail = 0;
  scene.userData.shadows = !phone;

  const world: World = {
    renderer, scene, camera, controls, backend, quality,
    detail: () => detail,
    setWeather(kind, dayFraction) {
      weather = kind;
      if (!clocked) hour = 8 + 12 * dayFraction;
    },
    setClock(phase, minute) {
      clocked = true;
      hour = hourOf(phase, minute);
    },
    focus(x, z, distance) {
      const dir = camera.position.clone().sub(controls.target).normalize();
      if (dir.y < 0.3) dir.set(0.35, 0.75, 0.55).normalize();
      const to = new THREE.Vector3(x, 0.8, z);
      glide = { from: controls.target.clone(), to, camFrom: camera.position.clone(), camTo: to.clone().addScaledVector(dir, distance), t: 0 };
    },
    update(dt) {
      time += dt;
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
      const dist = camera.position.distanceTo(t);
      detail = Math.min(2, (dist < DETAIL_AT.mid ? 0 : dist < DETAIL_AT.bay ? 1 : 2) + (phone ? 1 : 0)) as Detail;
      scene.userData.detail = detail;
      scene.userData.distance = dist;

      // Lighting: the script for this hour plus weather, eased so phase changes glide.
      weatherOn(lookAt(hour, target), weather);
      mixLook(current, first ? target : current, target, first ? 1 : 1 - Math.exp(-dt * 2.2));
      first = false;
      const L = current;
      sun.color.copy(L.sun); sun.intensity = L.sunI;
      hemi.color.copy(L.sky); hemi.groundColor.copy(L.ground); hemi.intensity = L.hemiI;
      renderer.toneMappingExposure = L.exposure;
      K.glow.value = L.glow;
      K.window.emissiveIntensity = L.windows;
      K.pool.opacity = L.pools;
      K.halo.opacity = (halos.material as THREE.PointsMaterial).opacity = Math.min(1, L.pools * 1.1);
      for (const m of K.reflective) m.envMapIntensity = m === K.window ? 1.3 * L.env : m === dio.resin ? 1.25 * L.env : m.envMapIntensity;
      scene.background = L.night > 0.5 ? bgNight : bgDay;
      // The kitchen light goes out: the oilcloth dims except where the desk lamp pools.
      dio.cloth.color.setScalar(1 - 0.6 * L.night);
      dio.lampPool.opacity = 0.75 * L.night;
      const fog = scene.fog as THREE.Fog;
      fog.color.copy(L.fog);
      fog.near = Math.max(70, dist * 1.9);
      fog.far = Math.max(260, dist * 5.2);
      post.tint(L.vigTint);

      // One shadow box on whatever the camera looks at, sized by zoom; the sun by day, the desk lamp at night.
      const half = THREE.MathUtils.clamp(dist * 0.85, 26, 250);
      const lampDir = lightDir.copy(DESK_LAMP).sub(t).setY(Math.max(DESK_LAMP.y - t.y, 40)).normalize();
      const dir = lampDir.lerp(L.sunDir, 1 - L.night).normalize();
      const reach = half * 2 + 60;
      sun.position.copy(t).setY(0).addScaledVector(dir, reach);
      sun.target.position.copy(t).setY(0);
      const sc = sun.shadow.camera;
      if (Math.abs(half - lastHalf) > lastHalf * 0.04) {
        sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half; sc.near = 1; sc.far = reach * 2;
        sc.updateProjectionMatrix();
        sun.shadow.normalBias = (half * 2 / mapSize) * 0.9;
        lastHalf = half;
      }
      for (const m of dio.farCasters) m.castShadow = dist > 140;
      // Shadows redraw on twos (everything that casts moves on twos) or when the light moves.
      K.time.value = time;
      const f = Math.floor(time * 12);
      const moved = lastShadow.distanceToSquared(sun.position) > 1e-4;
      if (f !== lastF || moved) { renderer.shadowMap.needsUpdate = true; lastShadow.copy(sun.position); }
      if (f !== lastF) {
        lastF = f;
        K.twos.f = f; K.twos.t = f / 12;
        K.U.fig.boil.value.set(hash(f, 1) * 0.035, hash(f, 2) * 0.035, hash(f, 3) * 0.035);
      }

      // Tilt-shift: strongest in Street View, thinnest at Bay View.
      const z = THREE.MathUtils.clamp((Math.log(dist) - Math.log(20)) / (Math.log(380) - Math.log(20)), 0, 1);
      const pr = renderer.getPixelRatio();
      post.tilt(phone ? 0 : (2.6 - 1.9 * z) * pr, L.vig * (1 - 0.25 * z), 0.5);

      rain.visible = weather === 'rainy' || weather === 'storm';
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
    render() {
      renderer.info.reset();
      specks.count = 0;
      if (detail >= 2) toSpecks(camera.position.distanceTo(controls.target));
      specks.visible = specks.count > 0;
      post.render();
      for (const o of hiddenPeople) o.visible = true;
      hiddenPeople.length = 0;
    },
    stats() {
      const i = renderer.info;
      return { calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures };
    },
    night: () => current.night,
  };
  return world;
}
