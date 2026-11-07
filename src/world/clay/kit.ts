// The shared clay kit: one smudge map, three uniform families (world, figures,
// peel), the shared materials and the clock that poses everything "on twos".
// Created lazily on first use, so modules can build materials at import time;
// scene.ts drives the clock, the night glow and the environment map.
import * as THREE from 'three';
import { CLAY, GLOSS, PAPER, clayMaterial, clayUniforms, glowTex, lcg, makeSmudgeMap, type ClayUniforms } from './core.ts';

export interface ClayKit {
  smudge: THREE.Texture;
  /** world: buildings and ground (big smudges), fig: people (fine smudges, boil on twos), peel: glossy fruit */
  U: { world: ClayUniforms; fig: ClayUniforms; peel: ClayUniforms };
  /** Night glow for the world's glow channel (0 by day, about 2.4 at night). */
  glow: { value: number };
  /** Seconds, smooth (water ripples). */
  time: { value: number };
  /** The twos clock: f = floor(seconds * 12), t = f / 12. Figures pose and boil on it. */
  twos: { f: number; t: number };
  /** Vertex-coloured world clay (Baker output). */
  world: THREE.MeshStandardMaterial;
  /** Vertex-coloured figure clay (Figure rig). */
  fig: THREE.MeshStandardMaterial;
  /** Glossy peel (real lemons on the table). */
  peel: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial;
  /** Window glass: dark blue by day, warm lamp glow at night. */
  window: THREE.MeshStandardMaterial;
  /** Materials that reflect the kitchen environment map. */
  reflective: THREE.MeshStandardMaterial[];
  /** Additive light pools under lamps (opacity follows the night). */
  pool: THREE.MeshBasicMaterial;
  /** Soft halos around bulbs at night (a Points material). */
  halo: THREE.PointsMaterial;
}

let KIT: ClayKit | null = null;

export function kit(): ClayKit {
  if (KIT) return KIT;
  const smudge = makeSmudgeMap(lcg(4242));
  const U = { world: clayUniforms(smudge, 0.55, 1.0), fig: clayUniforms(smudge, 1.6, 0.85), peel: clayUniforms(smudge, 3.5, 0.35) };
  U.fig.wrap.value = 0.6; U.fig.term.value = 0.7;
  const glow = { value: 0 };
  const k: ClayKit = {
    smudge, U, glow, time: { value: 0 }, twos: { f: 0, t: 0 },
    world: clayMaterial(U.world, { roughness: 0.62 }, glow),
    fig: clayMaterial(U.fig, { roughness: 0.52 }, { value: 1 }),
    peel: clayMaterial(U.peel, { roughness: 0.32 }, { value: 0 }),
    glass: new THREE.MeshStandardMaterial({ color: '#e9fbf8', roughness: 0.04, metalness: 0, transparent: true, opacity: 0.32, depthWrite: false, envMapIntensity: 1.6 }),
    window: new THREE.MeshStandardMaterial({ color: '#3c4a7a', roughness: 0.12, emissive: '#ffb55e', emissiveIntensity: 0, envMapIntensity: 1.3 }),
    reflective: [],
    pool: new THREE.MeshBasicMaterial({ map: glowTex('rgba(255,196,120,0.9)', 'rgba(255,160,80,0.35)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }),
    halo: new THREE.PointsMaterial({ map: glowTex('rgba(255,226,170,1)', 'rgba(255,170,90,0.35)'), size: 3, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: '#ffd9a0', opacity: 0 }),
  };
  k.reflective.push(k.peel, k.glass, k.window);
  KIT = k;
  return k;
}

// Reduced motion (spec "Stop motion": "Reduced motion stops the boil and swaps shakes and flashes for fades"):
// the OS setting or the game's own "Less motion" switch (main.ts passes it in with setReducedMotion).
const OS_CALM = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
let calmOption = false, calmNow = !!OS_CALM?.matches;
const calmWatchers = new Set<(on: boolean) => void>();
function calmChanged() {
  const on = calmOption || !!OS_CALM?.matches;
  if (on === calmNow) return;
  calmNow = on;
  for (const f of calmWatchers) f(on);
}
OS_CALM?.addEventListener?.('change', calmChanged);
/** Reduced motion is on: no boil, no shakes or flashes (fades instead), fewer flying bits. Cheap; call it when you need it. */
export const reducedMotion = () => calmNow;
/** The Options "Less motion" switch, when it loads or changes. */
export function setReducedMotion(on: boolean) { calmOption = on; calmChanged(); }
/** Run `f` now and whenever reduced motion turns on or off (for a value a module keeps, like a motion scale). Returns an unsubscribe. */
export function onReducedMotion(f: (on: boolean) => void): () => void {
  calmWatchers.add(f);
  f(calmNow);
  return () => calmWatchers.delete(f);
}

let ENV: THREE.Texture | null = null;
/** Give every reflective material the kitchen environment (scene.ts calls this once the renderer exists). */
export function setEnvironment(env: THREE.Texture) {
  ENV = env;
  for (const m of kit().reflective) { m.envMap = env; m.needsUpdate = true; }
}
/** Register a glass, resin or chrome material to reflect the kitchen (now, or once the environment exists). */
export function reflective<T extends THREE.MeshStandardMaterial>(m: T): T {
  kit().reflective.push(m);
  if (ENV) m.envMap = ENV;
  return m;
}

export interface PlainOptions {
  /** CLAY (default), GLOSS (resin, beads, glass, chrome) or PAPER (card, wood, sticks); add 0..1 to glow at night. */
  fx?: number;
  /** 'world' (default) for props and buildings, 'fig' for people (fine smudges that boil on twos). */
  family?: 'world' | 'fig';
  roughness?: number;
  emissive?: THREE.ColorRepresentation;
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
  side?: THREE.Side;
  map?: THREE.Texture | null;
}
/**
 * Clay for an ordinary mesh with no colour attribute (anything not baked): one colour, one fx.
 * Every call returns a new material, all sharing one shader program.
 */
export function clayPlain(color: THREE.ColorRepresentation, o: PlainOptions = {}): THREE.MeshStandardMaterial {
  const k = kit();
  const U = o.family === 'fig' ? k.U.fig : k.U.world;
  const glowU = o.family === 'fig' ? { value: 1 } : k.glow;
  const m = clayMaterial(U, {
    color, vertexColors: false, fx: o.fx ?? CLAY, roughness: o.roughness ?? (o.family === 'fig' ? 0.52 : 0.62),
    ...(o.emissive !== undefined ? { emissive: o.emissive, emissiveIntensity: o.emissiveIntensity ?? 1 } : {}),
    ...(o.transparent ? { transparent: true, opacity: o.opacity ?? 1 } : {}),
    ...(o.side !== undefined ? { side: o.side } : {}),
    ...(o.map ? { map: o.map } : {}),
  }, glowU);
  return m;
}

/**
 * Map an old-style flat material request (colour, roughness, metalness, emissive) to clay:
 * shiny or metal reads as glossy resin, everything else as thumb-smudged clay.
 */
export function clayFrom(color: THREE.ColorRepresentation, roughness = 0.8, emissive: THREE.ColorRepresentation = 0, metalness = 0, family: 'world' | 'fig' = 'world'): THREE.MeshStandardMaterial {
  const glossy = roughness <= 0.35 || metalness >= 0.3;
  const e = new THREE.Color(emissive);
  return clayPlain(color, { fx: glossy ? GLOSS : CLAY, family, ...(e.r + e.g + e.b > 0 ? { emissive: e, emissiveIntensity: 1 } : {}) });
}

export { CLAY, GLOSS, PAPER };
