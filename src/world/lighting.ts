// The four lighting scripts (design spec "Light, weather and seasons"), for a
// clay bay on a kitchen table: dawn, noon and golden hour come through the
// kitchen window; at night the kitchen light goes out and Lottie's desk lamp,
// the streetlamps and the lit windows carry the scene. Scripts blend over one
// game hour; Morning Prep holds dawn; after closing it is night.
import * as THREE from 'three';
import type { Phase, WeatherKind } from '../sim/economy.ts';

export type Script = 'dawn' | 'noon' | 'golden' | 'night';

export interface Look {
  sun: THREE.Color; sunI: number;
  /** Direction from the scene toward the sun (unit). Night ignores it: the light comes from the desk lamp. */
  sunDir: THREE.Vector3;
  sky: THREE.Color; ground: THREE.Color; hemiI: number;
  fog: THREE.Color; exposure: number;
  /** clay glow channel (bulbs, neon, lit signs) */ glow: number;
  /** window glass emissive */ windows: number;
  /** streetlamp light pools and halos */ pools: number;
  vig: number; vigTint: THREE.Color;
  /** reflections of the kitchen in resin and glass */ env: number;
  /** 0 day … 1 night (backdrop, desk-lamp light direction) */ night: number;
}

const look = (o: { sun: string; sunI: number; sunDir: [number, number, number]; sky: string; ground: string; hemiI: number; fog: string; exposure: number; glow: number; windows: number; pools: number; vig: number; vigTint: string; env: number; night: number }): Look => ({
  ...o, sun: new THREE.Color(o.sun), sunDir: new THREE.Vector3(...o.sunDir).normalize(), sky: new THREE.Color(o.sky), ground: new THREE.Color(o.ground),
  fog: new THREE.Color(o.fog), vigTint: new THREE.Color(o.vigTint),
});

export const LOOKS: Record<Script, Look> = {
  // peach window light from the bay side, long lilac shadows (the hemisphere fill is lilac); streetlights clicking off
  dawn: look({ sun: '#ffd2b0', sunI: 3.0, sunDir: [52, 34, 34], sky: '#dccaf2', ground: '#a68bb6', hemiI: 0.95, fog: '#f3d6cc', exposure: 1.14, glow: 0.5, windows: 0.35, pools: 0.2, vig: 0.4, vigTint: '#c98a8e', env: 1.1, night: 0 }),
  // the mockup's daylight: warm white sun high over the table, short crisp shadows
  noon: look({ sun: '#fff0dc', sunI: 2.8, sunDir: [-15, 34, 23], sky: '#efe4fa', ground: '#b49cc4', hemiI: 0.8, fog: '#eed9b6', exposure: 1.06, glow: 0, windows: 0, pools: 0, vig: 0.42, vigTint: '#c98a6a', env: 1.25, night: 0 }),
  // coral and amber, low from the west (behind the Groves); windows glow
  golden: look({ sun: '#ffa66a', sunI: 3.0, sunDir: [-46, 22, 6], sky: '#e6b8d6', ground: '#a0607a', hemiI: 0.8, fog: '#f1c49e', exposure: 1.12, glow: 0.9, windows: 0.9, pools: 0.25, vig: 0.46, vigTint: '#c96a52', env: 1.1, night: 0 }),
  // the kitchen light is off: a warm desk lamp, indigo fill, glowing bulbs
  night: look({ sun: '#ffcf9c', sunI: 1.45, sunDir: [-25, 20, -2], sky: '#6a68b8', ground: '#2e2a4f', hemiI: 0.85, fog: '#2a2340', exposure: 1.22, glow: 2.4, windows: 1.6, pools: 0.85, vig: 0.6, vigTint: '#2a2060', env: 0.35, night: 1 }),
};

const KEYS: [number, Script][] = [[7.5, 'dawn'], [8.5, 'noon'], [16.5, 'noon'], [17.5, 'golden'], [19.5, 'golden'], [20.25, 'night']];

/** The look for a game hour: scripts blend over one hour (dawn holds through Morning Prep, night after closing). */
export function lookAt(hour: number, out: Look = cloneLook(LOOKS.dawn)): Look {
  if (hour <= KEYS[0][0]) return copyLook(out, LOOKS.dawn);
  for (let i = 1; i < KEYS.length; i++) {
    const [h1, s1] = KEYS[i];
    if (hour <= h1) {
      const [h0, s0] = KEYS[i - 1];
      const t = (hour - h0) / (h1 - h0);
      return mixLook(out, LOOKS[s0], LOOKS[s1], t * t * (3 - 2 * t));
    }
  }
  return copyLook(out, LOOKS.night);
}

/** The game hour the lights follow for a phase: Morning Prep is dawn, the business day runs on the clock, after closing is night. */
export function hourOf(phase: Phase, minute: number): number {
  return phase === 'prep' ? 7 : phase === 'open' ? minute / 60 : 21.5;
}

/** Weather on top of a look: cloud and rain dim the sun and grey the air. */
export function weatherOn(l: Look, kind: WeatherKind): Look {
  const dim = kind === 'storm' ? 0.42 : kind === 'rainy' ? 0.55 : kind === 'cloudy' ? 0.75 : kind === 'scorcher' ? 1.08 : 1;
  if (dim === 1) return l;
  l.sunI *= dim;
  if (dim < 1) {
    const grey = (1 - dim) * 0.7;
    l.hemiI *= 1 + (1 - dim) * 0.5;
    l.sky.lerp(GREY, grey * (1 - l.night));
    l.fog.lerp(l.night > 0.5 ? GREY_N : GREY, grey);
  } else {
    l.sun.lerp(HOT, 0.25);
  }
  return l;
}
const GREY = new THREE.Color('#c9cdd6'), GREY_N = new THREE.Color('#3a3a4c'), HOT = new THREE.Color('#fff4c0');

export function cloneLook(l: Look): Look {
  return { ...l, sun: l.sun.clone(), sunDir: l.sunDir.clone(), sky: l.sky.clone(), ground: l.ground.clone(), fog: l.fog.clone(), vigTint: l.vigTint.clone() };
}
export function copyLook(out: Look, l: Look): Look { return mixLook(out, l, l, 0); }
export function mixLook(out: Look, a: Look, b: Look, t: number): Look {
  const n = (x: number, y: number) => x + (y - x) * t;
  out.sun.copy(a.sun).lerp(b.sun, t); out.sunI = n(a.sunI, b.sunI);
  out.sunDir.copy(a.sunDir).lerp(b.sunDir, t).normalize();
  out.sky.copy(a.sky).lerp(b.sky, t); out.ground.copy(a.ground).lerp(b.ground, t); out.hemiI = n(a.hemiI, b.hemiI);
  out.fog.copy(a.fog).lerp(b.fog, t); out.exposure = n(a.exposure, b.exposure);
  out.glow = n(a.glow, b.glow); out.windows = n(a.windows, b.windows); out.pools = n(a.pools, b.pools);
  out.vig = n(a.vig, b.vig); out.vigTint.copy(a.vigTint).lerp(b.vigTint, t);
  out.env = n(a.env, b.env); out.night = n(a.night, b.night);
  return out;
}
