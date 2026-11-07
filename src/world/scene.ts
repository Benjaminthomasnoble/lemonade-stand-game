// Renderer, Tycoon Camera, light, air and weather for Citrine Bay, in
// Kitchen-Table Clay: the bay is a plasticine model on a thick plinth on
// Grandma Lottie's oilcloth kitchen table (diorama.ts), lit by four lighting
// scripts (lighting.ts) and finished with a soft tilt-shift (clay/post.ts).
// The bay's roads and plots are built in bay.ts.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Phase, WeatherKind } from '../sim/economy.ts';
import { Baker, bend, canvasTex, CLAY_SHADE, cyl, hash, lumpy, makeEnv, sph } from './clay/core.ts';
import { clayFrom, kit, reducedMotion, setEnvironment } from './clay/kit.ts';
import { P } from './clay/palette.ts';
import { createPost, type ClayPost } from './clay/post.ts';
import { buildDiorama, DESK_LAMP, PLINTH } from './diorama.ts';
import { cloneLook, hourOf, lookAt, LOOKS, mixLook, weatherOn } from './lighting.ts';
import { createWeather } from './weather.ts';
import { createMist } from './mist.ts';

import { setCrowdDetail } from './clay/figure.ts';

export interface RenderStats { calls: number; triangles: number; geometries: number; textures: number }
export type Quality = 'laptop' | 'phone';
export type Detail = 0 | 1 | 2;
/** Camera distances where mid zoom and Bay View detail begin (phones run one level simpler, so a phone shot that
 * should keep real models, like a VIP arrival, frames inside `mid`). */
export const DETAIL_AT = { mid: 45, bay: 200 };
/** Street View's look: a heading (radians about y, 0 looking toward +z from the -z side) that faces a south-side
 * stand's front from the street, and the pitch above the ground. A north-side stand is seen from heading + π. */
export const STREET_LOOK = { heading: Math.atan2(5, 11), pitch: Math.asin(7.7 / Math.hypot(5, 7.7, 11)) };
export interface FocusOptions {
  /** Come round to this heading when the camera's own is more than a quarter-turn off it (a stand seen from behind). */
  face?: number;
  /** Look from exactly this heading and/or pitch (radians above the ground) instead of the camera's own, for this look
   * only (a VIP shot): the next focus without them goes back to the heading and pitch from before. */
  heading?: number;
  pitch?: number;
}

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
  /** Glide the camera to look at a point from a distance, swinging round the point (not through it) when the heading
   * changes. A close look after Bay View turns back to the heading the camera had before it (unless the player turned
   * the view meanwhile). `opts` can ask for a heading to come round to, or a look of its own for one shot. */
  focus(x: number, z: number, distance: number, opts?: FocusOptions): void;
  /**
   * Glide out to Bay View: the whole plinth on the table, squared to the screen (its long side across a landscape
   * screen, up a portrait one) from as far back as this screen's aspect needs (bayDistance()).
   */
  bayView(): void;
  /** How far back Bay View stands on this screen, so the plinth fits. */
  bayDistance(): number;
  /** Slide the view along the ground (keys W A S D): `right` and `ahead` in screen terms, scaled by how far out the
   * camera is, per second held (pass the frame time). */
  panBy(right: number, ahead: number): void;
  /** Swing the camera a quarter-turn around what it looks at, eased (keys Q and E, and the corner's turn buttons). */
  turnStep(dir: 1 | -1): void;
  /**
   * Something else steers the camera (Gull Flight): update() leaves the camera's pose alone (no glide, turn or
   * OrbitControls), drops the tilt-shift for a wide, windy chase, and takes the detail, fog and shadow box from where
   * the camera is (its height above the bay, the ground it looks at). The clock, the twos and the light run on.
   * The chase looks out to the horizon, so a phone flies over Bay View blocks.
   */
  pilot(on: boolean): void;
  update(dt: number): void;
  /** Draw a frame (scene, tilt-shift, vignette). */
  render(): void;
  /** Draw calls and triangles of the last frame (shadow and post passes included). */
  stats(): RenderStats;
  /** 0 by day … 1 at night, after blending (for slices that switch lamps or neon). */
  night(): number;
}

export const BOUNDS = { minX: -180, maxX: 170, minZ: -125, maxZ: 80 };
/** Where Bay View looks: the whole plinth on the kitchen table. `distance` is a landscape screen's; world.bayView()
 * and world.bayDistance() fit the plinth to the screen's own aspect (a portrait phone stands about twice as far back). */
export const BAY_VIEW = { x: PLINTH.cx, z: PLINTH.cz + 6, distance: 420 };
/** Bay View's pitch: about 52 degrees above the table (the strata still show), 60 on a portrait screen, whose width
 * sets the distance, so a steeper look fills more of its height with the bay. */
const BAY_ELEV = { landscape: 0.9, portrait: 1.05 };
/** The plinth's corners, at the lawn and at its foot on the table, with a little margin: what Bay View fits on screen. */
const PLINTH_CORNERS = [0, -14].flatMap((y) => [-1, 1].flatMap((sx) => [-1, 1].map((sz) =>
  new THREE.Vector3(PLINTH.cx + sx * (PLINTH.w / 2 + 4), y, PLINTH.cz + sz * (PLINTH.d / 2 + 4)))));
/** A heading (radians about y, 0 looking toward +z from the -z side) as a camera direction (target to camera) at a pitch. */
export const dirOf = (heading: number, elev: number, out = new THREE.Vector3()) =>
  out.set(Math.sin(heading) * Math.cos(elev), Math.sin(elev), -Math.cos(heading) * Math.cos(elev));
/** A camera direction's (or any horizontal vector's) heading, as dirOf takes it. */
export const headingOf = (dir: THREE.Vector3) => Math.atan2(dir.x, -dir.z);
const angleTo = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
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
  setCrowdDetail(phone); // crowds build low on phones, smooth on laptops
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

  // The near plane follows the zoom (update()): a portrait phone's Bay View stands ~850 back, where a 0.5 near plane
  // would leave the plot tiles z-fighting the lawn.
  const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.5, 6000);
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

  // Weather looks: beaded-fishing-line rain, storm cups and lightning, scorcher shimmer (weather.ts).
  const weatherFx = createWeather(scene, phone);
  const mist = createMist(scene, phone);

  // Bay View people: every figure (anything with userData.limbs at the top of the scene) draws as one clay speck in one instanced draw.
  const SPECKS = 400;
  const speckB = new Baker();
  speckB.add(cyl(0.3, 0.36, 1.0, 7), '#ffffff', { p: [0, 0.6, 0] });
  speckB.add(sph(0.3, 7, 5), '#ffffff', { p: [0, 1.35, 0] });
  const specks = new THREE.InstancedMesh(speckB.build(), K.world, SPECKS);
  specks.name = 'people-specks';
  specks.castShadow = !phone;
  specks.frustumCulled = false;
  specks.setColorAt(0, new THREE.Color(P.terra)); // the colour attribute exists from the start, so the warm-up compiles this variant
  specks.count = 0;
  scene.add(specks);
  const hiddenPeople: THREE.Object3D[] = [];
  const speckM = new THREE.Matrix4(), speckC = new THREE.Color(), SPECK_DEFAULT = new THREE.Color(P.terra), speckOwn = new THREE.Color();
  /** A person's speck colour: userData.speckColor (Figures set their shirt), else the first plain-coloured part, found once and kept. */
  function speckColor(o: THREE.Object3D): THREE.Color {
    // A model's own speck colour may change, so it isn't cached.
    const own = o.userData.speckColor as THREE.ColorRepresentation | undefined;
    if (own !== undefined) return speckOwn.set(own);
    let c = o.userData.speck as THREE.Color | undefined;
    if (c) return c;
    const stack: THREE.Object3D[] = [o];
    while (stack.length && !c) {
      const x = stack.pop()!;
      const m = (x as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (m?.color && !m.vertexColors) c = m.color.clone();
      for (const ch of x.children) stack.push(ch);
    }
    o.userData.speck = c ??= SPECK_DEFAULT;
    return c;
  }
  function toSpecks(dist: number) {
    let n = 0;
    for (const o of scene.children) {
      if (!o.visible || !o.userData.limbs || n >= SPECKS) continue;
      hiddenPeople.push(o);
      o.visible = false;
      const s = Math.max(0.6, o.scale.y) * (dist > DETAIL_AT.bay ? 1.4 : 1);
      specks.setMatrixAt(n, speckM.makeScale(s, s, s).setPosition(o.position.x, o.position.y, o.position.z));
      specks.setColorAt(n, speckC.copy(speckColor(o)));
      n++;
    }
    specks.count = n;
    specks.instanceMatrix.needsUpdate = true;
    if (specks.instanceColor) specks.instanceColor.needsUpdate = true;
  }

  // Bay View fits the plinth to the screen: the nearest distance where every corner projects inside the frame (a
  // little short of the edges, so the HUD's bars don't cover it). A plain search: projection isn't linear in distance.
  const fitCam = new THREE.PerspectiveCamera(), fitP = new THREE.Vector3(), bayTarget = new THREE.Vector3(BAY_VIEW.x, 0.8, BAY_VIEW.z);
  function fitDistance(dir: THREE.Vector3): number {
    fitCam.fov = camera.fov; fitCam.aspect = camera.aspect; fitCam.near = 1; fitCam.far = 1e5; fitCam.updateProjectionMatrix();
    let lo = 60, hi = 4000;
    for (let i = 0; i < 22; i++) {
      const mid = (lo + hi) / 2;
      fitCam.position.copy(bayTarget).addScaledVector(dir, mid);
      fitCam.lookAt(bayTarget);
      fitCam.updateMatrixWorld();
      const inside = PLINTH_CORNERS.every((c) => { fitP.copy(c).project(fitCam); return Math.abs(fitP.x) <= 0.94 && Math.abs(fitP.y) <= 0.8; });
      if (inside) hi = mid; else lo = mid;
    }
    return Math.ceil(hi);
  }
  /** Bay View's heading: the long side across a landscape screen or up a portrait one, whichever of the two is nearer the camera's heading now. */
  function bayDir(from: THREE.Vector3, out = new THREE.Vector3()) {
    const base = camera.aspect < 1 ? Math.PI / 2 : 0, h = headingOf(from);
    return dirOf(angleTo(h, base) <= angleTo(h, base + Math.PI) ? base : base + Math.PI, camera.aspect < 1 ? BAY_ELEV.portrait : BAY_ELEV.landscape, out);
  }
  /** Pinching out may go a little past Bay View at any heading or pitch (the far end of OrbitControls). */
  function fitMaxDistance() {
    let far = 0;
    for (let k = 0; k < 8; k++) for (const e of [0.55, BAY_ELEV.landscape]) far = Math.max(far, fitDistance(dirOf((k * Math.PI) / 4, e)));
    controls.maxDistance = Math.max(470, far * 1.12);
  }
  /** The heading a close look returns to after Bay View squared the camera (cleared once used, or once the player turns). */
  let beforeBay: { dir: THREE.Vector3; bay: number } | null = null;
  /** The heading and pitch a look goes back to after a look that set its own (FocusOptions.heading and pitch). */
  let held: { h: number; e: number } | null = null;
  const curDir = (out = new THREE.Vector3()) => {
    out.copy(camera.position).sub(controls.target).normalize();
    if (out.y < 0.3) out.set(0.35, 0.75, 0.55).normalize();
    return out;
  };
  const post: ClayPost = createPost(renderer, scene, camera, phone ? 2 : 4);

  /** A glide: the target slides, and the camera swings round it (heading, pitch and distance eased), never through it. */
  let glide: { from: THREE.Vector3; to: THREE.Vector3; h0: number; h1: number; e0: number; e1: number; d0: number; d1: number; t: number } | null = null;
  const glideDir = new THREE.Vector3();
  function glideTo(to: THREE.Vector3, dir: THREE.Vector3, distance: number) {
    const off = camera.position.clone().sub(controls.target), d0 = Math.max(1e-3, off.length());
    glide = { from: controls.target.clone(), to, h0: headingOf(off), h1: headingOf(dir), e0: Math.asin(THREE.MathUtils.clamp(off.y / d0, -1, 1)), e1: Math.asin(dir.y), d0, d1: distance, t: 0 };
  }
  let piloted = false;
  /** Glide out to Bay View, fitted to this screen. */
  function goBay() {
    const now = curDir(), dir = bayDir(now);
    if (camera.position.distanceTo(controls.target) < DETAIL_AT.bay) beforeBay = { dir: now, bay: headingOf(dir) };
    else if (beforeBay) beforeBay.bay = headingOf(dir);
    glideTo(bayTarget.clone(), dir, fitDistance(dir));
  }
  let wasPortrait = camera.aspect < 1;
  const onResize = () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    // The page may have moved to a screen with another pixel density (or been zoomed).
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, phone ? 1.5 : 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    post.setSize(container.clientWidth, container.clientHeight);
    fitMaxDistance();
    // A phone turned on its side (or a window resized) while the bay is in view: fit the plinth again, squared to the
    // new screen. That's any zoomed-out view when the screen turns, or Bay View itself after any resize.
    const portraitNow = camera.aspect < 1, turned = portraitNow !== wasPortrait;
    wasPortrait = portraitNow;
    const atBay = controls.target.distanceTo(bayTarget) < 1 || (glide !== null && glide.to.distanceTo(bayTarget) < 1);
    if (!piloted && camera.position.distanceTo(controls.target) >= DETAIL_AT.bay && (turned || atBay)) goBay();
  };
  onResize();
  window.addEventListener('resize', onResize);

  let turn: { by: number; done: number; t: number } | null = null; // an eased quarter-turn (Q and E)
  const TURN_AXIS = new THREE.Vector3(0, 1, 0);
  let weather: WeatherKind = 'warm';
  let hour = 7;
  let clocked = false;
  const target = cloneLook(LOOKS.dawn), current = cloneLook(LOOKS.dawn);
  let first = true;
  let time = 0, lastF = -1;
  const lastShadow = new THREE.Vector3(Infinity, 0, 0);
  let lastHalf = 0;
  let detail: Detail = 0;
  let warmed = false;
  const lookPt = new THREE.Vector3(), lookDir = new THREE.Vector3();
  const lightDir = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0), snapR = new THREE.Vector3(), snapU = new THREE.Vector3(), snapP = new THREE.Vector3();
  scene.userData.detail = 0;
  scene.userData.shadows = !phone;

  const world: World = {
    renderer, scene, camera, controls, backend, quality,
    detail: () => detail,
    pilot(on) {
      if (on && !piloted) { glide = null; turn = null; }
      piloted = on;
    },
    setWeather(kind, dayFraction) {
      weather = kind;
      if (!clocked) hour = 8 + 12 * dayFraction;
    },
    setClock(phase, minute) {
      clocked = true;
      hour = hourOf(phase, minute);
    },
    focus(x, z, distance, opts = {}) {
      let dir = curDir();
      if (beforeBay && distance < DETAIL_AT.bay) {
        // Back in close after Bay View: the pitch from before, and its heading too unless the player has turned the view since.
        const h = headingOf(dir);
        dir = dirOf(angleTo(h, beforeBay.bay) < 0.2 ? headingOf(beforeBay.dir) : h, Math.asin(beforeBay.dir.y), dir);
        beforeBay = null;
      }
      if (opts.heading !== undefined || opts.pitch !== undefined) {
        // A look of its own (a VIP shot) holds for that one look: the next goes back to the heading and pitch from before.
        held ??= { h: headingOf(dir), e: Math.asin(dir.y) };
        dir = dirOf(opts.heading ?? headingOf(dir), opts.pitch ?? Math.asin(dir.y), dir);
      } else {
        if (held) { dir = dirOf(held.h, held.e, dir); held = null; }
        // A quarter-turn off (Q or E) is the player's choice; further round, the stand would show its back.
        if (opts.face !== undefined && angleTo(headingOf(dir), opts.face) > Math.PI * 0.6) dir = dirOf(opts.face, Math.asin(dir.y), dir);
      }
      glideTo(new THREE.Vector3(x, 0.8, z), dir, distance);
    },
    bayView: goBay,
    bayDistance: () => fitDistance(bayDir(curDir())),
    panBy(right, ahead) {
      glide = null;
      const fwd = controls.target.clone().sub(camera.position).setY(0);
      if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
      fwd.normalize();
      const side = new THREE.Vector3(-fwd.z, 0, fwd.x);
      const k = camera.position.distanceTo(controls.target) * 0.9; // about a screen's width a second at any zoom
      const move = side.multiplyScalar(right * k).addScaledVector(fwd, ahead * k);
      controls.target.add(move);
      camera.position.add(move);
    },
    turnStep(dir) {
      // A turn under way finishes from where it is; the new quarter adds on.
      turn = { by: (turn ? turn.by - turn.done : 0) + (dir * Math.PI) / 2, done: 0, t: 0 };
    },
    update(dt) {
      time += dt;
      let t = controls.target, dist: number;
      if (piloted) {
        // Gull Flight: the ground the camera looks at (or a point ahead of it, looking over the horizon) stands in for
        // the target, and twice its height above the bay stands in for the zoom.
        camera.getWorldDirection(lookDir);
        const ahead = lookDir.y < -0.05 ? Math.min(80, camera.position.y / -lookDir.y) : 80;
        t = lookPt.copy(camera.position).addScaledVector(lookDir, ahead).setY(0);
        dist = Math.max(8, camera.position.y * 2);
      } else {
        if (turn) {
          turn.t = Math.min(1, turn.t + dt * 2.4);
          const k = turn.t * turn.t * (3 - 2 * turn.t);
          const step = turn.by * k - turn.done;
          turn.done += step;
          camera.position.sub(controls.target).applyAxisAngle(TURN_AXIS, step).add(controls.target);
          if (turn.t >= 1) turn = null;
        }
        if (glide) {
          glide.t = Math.min(1, glide.t + dt * 1.6);
          const k = glide.t * glide.t * (3 - 2 * glide.t), lerp = THREE.MathUtils.lerp;
          controls.target.lerpVectors(glide.from, glide.to, k);
          const dh = Math.atan2(Math.sin(glide.h1 - glide.h0), Math.cos(glide.h1 - glide.h0));
          dirOf(glide.h0 + dh * k, lerp(glide.e0, glide.e1, k), glideDir);
          camera.position.copy(controls.target).addScaledVector(glideDir, lerp(glide.d0, glide.d1, k));
          if (glide.t >= 1) glide = null;
        }
        // Keep the camera over the bay.
        const cx = THREE.MathUtils.clamp(t.x, BOUNDS.minX, BOUNDS.maxX), cz = THREE.MathUtils.clamp(t.z, BOUNDS.minZ, BOUNDS.maxZ);
        if (cx !== t.x || cz !== t.z) { camera.position.x += cx - t.x; camera.position.z += cz - t.z; t.x = cx; t.z = cz; }
        controls.update();
        dist = camera.position.distanceTo(t);
      }
      const byDist = dist < DETAIL_AT.mid ? 0 : dist < DETAIL_AT.bay ? 1 : 2;
      detail = Math.min(2, byDist + (phone ? 1 : 0)) as Detail;
      // Gull Flight looks out to the horizon, so a phone flies over Bay View blocks: mid-zoom models out to the horizon
      // cost a late-game phone up to 220 draws and 530k triangles flying low, and pulling the fog in doesn't save
      // enough. A laptop keeps its usual levels (mid zoom there draws as much as Street View, at a wider shadow box).
      if (piloted && phone) detail = 2;
      scene.userData.detail = detail;
      scene.userData.distance = dist;
      const near = THREE.MathUtils.clamp(dist * 0.01, 0.5, 8);
      if (Math.abs(near - camera.near) > camera.near * 0.15) { camera.near = near; camera.updateProjectionMatrix(); }

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
      // Lamps that are off cost no draw (the lamp pools and halos are additive: at opacity 0 they'd draw nothing).
      K.pool.visible = K.halo.visible = halos.visible = L.pools > 0.004;
      // Zoomed out, the kitchen's reflection would wash the whole sea pale: the resin reflects less at Bay View.
      const zoomK = THREE.MathUtils.clamp((Math.log(dist) - Math.log(20)) / (Math.log(380) - Math.log(20)), 0, 1);
      for (const m of K.reflective) m.envMapIntensity = m === K.window ? 1.3 * L.env : m === dio.resin ? 1.25 * L.env * (1 - 0.5 * zoomK) : m.envMapIntensity;
      scene.background = L.night > 0.5 ? bgNight : bgDay;
      // The kitchen light goes out: the oilcloth dims except where the desk lamp pools.
      dio.cloth.color.setScalar(1 - 0.6 * L.night);
      dio.lampPool.opacity = 0.75 * L.night;
      dio.lampPoolMesh.visible = L.night > 0.01;
      const fog = scene.fog as THREE.Fog;
      fog.color.copy(L.fog);
      fog.near = Math.max(70, dist * 1.9);
      fog.far = Math.max(260, dist * 5.2);
      post.tint(L.vigTint);
      post.saturation(L.sat);
      CLAY_SHADE.value.copy(L.shade);
      sun.shadow.intensity = L.shadowI;

      // One shadow box on whatever the camera looks at, sized by zoom; the sun by day, the desk lamp at night.
      const half = THREE.MathUtils.clamp(dist * 0.85, 26, 250);
      const lampDir = lightDir.copy(DESK_LAMP).sub(t).setY(Math.max(DESK_LAMP.y - t.y, 40)).normalize();
      const dir = lampDir.lerp(L.sunDir, 1 - L.night).normalize();
      const reach = half * 2 + 60;
      const sc = sun.shadow.camera;
      if (Math.abs(half - lastHalf) > lastHalf * 0.04) {
        sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half; sc.near = 1; sc.far = reach * 2;
        sc.updateProjectionMatrix();
        sun.shadow.normalBias = (half * 2 / mapSize) * 0.9;
        lastHalf = half;
      }
      // Snap the shadow box to whole shadow-map texels in the light's view, so edges don't crawl as the camera pans.
      const texel = (lastHalf * 2) / mapSize;
      snapP.copy(t).setY(0);
      snapR.crossVectors(UP, dir);
      if (snapR.lengthSq() > 1e-8) { // a light straight overhead has no "right": skip the snap
        snapR.normalize(); snapU.crossVectors(dir, snapR);
        const a = snapP.dot(snapR), b = snapP.dot(snapU);
        snapP.addScaledVector(snapR, Math.round(a / texel) * texel - a).addScaledVector(snapU, Math.round(b / texel) * texel - b);
      }
      sun.target.position.copy(snapP);
      sun.position.copy(snapP).addScaledVector(dir, reach);
      for (const m of dio.farCasters) m.castShadow = dist > 140;
      // Shadows redraw on twos (everything that casts moves on twos) or when the light moves.
      K.time.value = time;
      const f = Math.floor(time * 12);
      const moved = lastShadow.distanceToSquared(sun.position) > 1e-4;
      if (f !== lastF || moved) { renderer.shadowMap.needsUpdate = true; lastShadow.copy(sun.position); }
      if (f !== lastF) {
        lastF = f;
        K.twos.f = f; K.twos.t = f / 12;
        // Reduced motion stops the boil (spec "Stop motion"): the OS setting or the Options switch.
        if (reducedMotion()) K.U.fig.boil.value.set(0, 0, 0);
        else K.U.fig.boil.value.set(hash(f, 1) * 0.035, hash(f, 2) * 0.035, hash(f, 3) * 0.035);
      }

      // Tilt-shift: strongest in Street View, thinnest at Bay View; Gull Flight drops the blur for a wide, windy chase.
      const z = zoomK;
      const pr = renderer.getPixelRatio();
      post.tilt(phone || piloted ? 0 : (2.6 - 1.9 * z) * pr, L.vig * (1 - 0.25 * z), 0.5);

      // Weather, and the desk lamp flickering for lightning in a storm.
      const flash = weatherFx.update(dt, weather, t, dist);
      mist.update(hour, performance.now() / 1000);
      if (flash > 0) { hemi.intensity += flash * 1.6; sun.intensity += flash * 2.2; renderer.toneMappingExposure += flash * 0.25; }
      scene.userData.weather = weather;
    },
    render() {
      if (!warmed) {
        // First frame: compile every clay program the scene can reach (hidden parts too: night glow, weather, brawl
        // beams, fx pools, specks), so none compiles mid-day for the first time and stalls a frame.
        // (Without parallel compiling the cost lands here, on the first frame, rather than mid-day.)
        // A program's key includes the render target bound when it's built: the scene draws into the composer's
        // half-float target (no tone mapping, linear output; OutputPass does both), so compile with that target bound,
        // or the warm-up builds canvas variants nothing draws with. compileAsync builds synchronously, then waits.
        warmed = true;
        const was = renderer.getRenderTarget();
        renderer.setRenderTarget(post.composer.readBuffer);
        try {
          if (renderer.extensions.has('KHR_parallel_shader_compile')) renderer.compileAsync(scene, camera).catch(() => { /* a lost context: they compile when first drawn */ });
          else renderer.compile(scene, camera);
        } finally { renderer.setRenderTarget(was); }
      }
      renderer.info.reset();
      specks.count = 0;
      if (detail >= 2) toSpecks(scene.userData.distance as number);
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
