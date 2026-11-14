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
  /** the fill shadowed clay gets (radiance): lilac by day, indigo at night, so shadows never go grey */ shade: THREE.Color;
  /** how dark the sun's shadows go (three's shadow.intensity: 1 is black where the sun is blocked) */ shadowI: number;
  /** colour saturation in the post (above 1 keeps the plasticine bold) */ sat: number;
}

const look = (o: { sun: string; sunI: number; sunDir: [number, number, number]; sky: string; ground: string; hemiI: number; fog: string; exposure: number; glow: number; windows: number; pools: number; vig: number; vigTint: string; env: number; night: number; shade: [string, number]; shadowI: number; sat: number }): Look => ({
  ...o, sun: new THREE.Color(o.sun), sunDir: new THREE.Vector3(...o.sunDir).normalize(), sky: new THREE.Color(o.sky), ground: new THREE.Color(o.ground),
  fog: new THREE.Color(o.fog), vigTint: new THREE.Color(o.vigTint), shade: new THREE.Color(o.shade[0]).multiplyScalar(o.shade[1]),
});

export const LOOKS: Record<Script, Look> = {
  // Morning Prep lives here, so it must be the friendliest frame: warm peach window light from
  // the bay side, a cream fill, and long shadows lifted with lilac (never grey); the streetlights still burn (they
  // click off as the day opens, see lookAt) but the neon and string lights are off.
  dawn: look({ sun: '#ffcfa6', sunI: 2.9, sunDir: [48, 36, 30], sky: '#ffeadc', ground: '#c09a86', hemiI: 0.92, fog: '#f7e0cf', exposure: 1.04, glow: 0, windows: 0.35, pools: 0.2, vig: 0.32, vigTint: '#d49a7c', env: 1.1, night: 0, shade: ['#a58ff0', 1.25], shadowI: 0.9, sat: 1.14 }),
  // the mockup's daylight: warm white sun high over the table, a cream fill, short crisp lilac shadows
  noon: look({ sun: '#ffeed6', sunI: 2.75, sunDir: [-15, 34, 23], sky: '#fff2de', ground: '#b98a62', hemiI: 0.8, fog: '#efdcbc', exposure: 1.0, glow: 0, windows: 0, pools: 0, vig: 0.34, vigTint: '#c98a6a', env: 1.25, night: 0, shade: ['#9a86ec', 1.1], shadowI: 0.92, sat: 1.12 }),
  // coral and amber, low from the west (behind the Groves); windows glow
  golden: look({ sun: '#ffb47e', sunI: 2.8, sunDir: [-46, 24, 6], sky: '#f6dbe6', ground: '#b07a6e', hemiI: 0.88, fog: '#f4cdb0', exposure: 1.04, glow: 0.9, windows: 0.9, pools: 0.25, vig: 0.36, vigTint: '#c97a64', env: 1.1, night: 0, shade: ['#a07ae6', 1.15], shadowI: 0.9, sat: 1.1 }),
  // the kitchen light is off: a warm desk lamp, indigo fill, glowing bulbs
  night: look({ sun: '#ffcf9c', sunI: 1.5, sunDir: [-25, 20, -2], sky: '#6a68b8', ground: '#2e2a4f', hemiI: 0.85, fog: '#2a2340', exposure: 1.22, glow: 2.4, windows: 1.6, pools: 0.85, vig: 0.58, vigTint: '#2a2060', env: 0.35, night: 1, shade: ['#4f4ab8', 0.45], shadowI: 0.95, sat: 1.06 }),
};

// Night hours count on past midnight (the sim's night clock runs to 1,860 minutes, 31:00): night holds to 06:00 (30),
// then blends into dawn by 07:00, when Morning Prep picks up at dawn.
const KEYS: [number, Script][] = [[7.5, 'dawn'], [8.5, 'noon'], [16.5, 'noon'], [17.5, 'golden'], [19.5, 'golden'], [20.25, 'night'], [30, 'night'], [31, 'dawn']];
/**
 * The lamps (the clay glow channel: clay-snake neon, string lights, bulbs and lamplit windows; and the streetlight
 * pools and halos) are switches, not a blend: off from the open at 08:00, when the streetlights click off, until
 * 19:30, when the neon and string lights come on (spec "Light, weather and seasons"). Windows follow the scripts.
 */
export const LAMPS = { off: 8, on: 19.5 };

/** The look for a game hour: scripts blend over one hour (dawn holds through Morning Prep, night after closing). */
export function lookAt(hour: number, out: Look = cloneLook(LOOKS.dawn)): Look {
  scriptAt(hour, out);
  if (hour >= LAMPS.off && hour < LAMPS.on) { out.glow = 0; out.pools = 0; }
  return out;
}
function scriptAt(hour: number, out: Look): Look {
  if (hour <= KEYS[0][0]) return copyLook(out, LOOKS.dawn);
  for (let i = 1; i < KEYS.length; i++) {
    const [h1, s1] = KEYS[i];
    if (hour <= h1) {
      const [h0, s0] = KEYS[i - 1];
      const t = (hour - h0) / (h1 - h0);
      return mixLook(out, LOOKS[s0], LOOKS[s1], t * t * (3 - 2 * t));
    }
  }
  return copyLook(out, LOOKS[KEYS[KEYS.length - 1][1]]);
}

/** The game hour the lights follow for a phase: Morning Prep is dawn, and the business day and the night run on the
 * clock (night hours past midnight count on from 24, so 03:00 is 27 and the night ends at 31, 07:00). */
export function hourOf(phase: Phase, minute: number): number {
  if (phase === 'prep') return 7;
  if (phase === 'open') return minute / 60;
  return Math.max(20, Math.min(31, minute / 60)); // the report and the night: dusk into night, then the dawn blend
}

/** Weather on top of a look: cloud and rain dim the sun and grey the air. */
export function weatherOn(l: Look, kind: WeatherKind): Look {
  const dim = kind === 'storm' ? 0.42 : kind === 'rainy' ? 0.55 : kind === 'cloudy' ? 0.75 : kind === 'scorcher' ? 1.08 : 1;
  if (dim === 1) return l;
  l.sunI *= dim;
  if (dim < 1) {
    // overcast light casts soft, faint shadows (storm about half, rain about 0.6)
    l.shadowI *= dim + (1 - dim) * 0.12;
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
  return { ...l, sun: l.sun.clone(), sunDir: l.sunDir.clone(), sky: l.sky.clone(), ground: l.ground.clone(), fog: l.fog.clone(), vigTint: l.vigTint.clone(), shade: l.shade.clone() };
}
const lerp = (x: number, y: number, t: number) => x + (y - x) * t;
export function copyLook(out: Look, l: Look): Look { return mixLook(out, l, l, 0); }
export function mixLook(out: Look, a: Look, b: Look, t: number): Look {
  out.sun.copy(a.sun).lerp(b.sun, t); out.sunI = lerp(a.sunI, b.sunI, t);
  out.sunDir.copy(a.sunDir).lerp(b.sunDir, t).normalize();
  out.sky.copy(a.sky).lerp(b.sky, t); out.ground.copy(a.ground).lerp(b.ground, t); out.hemiI = lerp(a.hemiI, b.hemiI, t);
  out.fog.copy(a.fog).lerp(b.fog, t); out.exposure = lerp(a.exposure, b.exposure, t);
  out.glow = lerp(a.glow, b.glow, t); out.windows = lerp(a.windows, b.windows, t); out.pools = lerp(a.pools, b.pools, t);
  out.vig = lerp(a.vig, b.vig, t); out.vigTint.copy(a.vigTint).lerp(b.vigTint, t);
  out.env = lerp(a.env, b.env, t); out.night = lerp(a.night, b.night, t);
  out.shade.copy(a.shade).lerp(b.shade, t); out.shadowI = lerp(a.shadowI, b.shadowI, t); out.sat = lerp(a.sat, b.sat, t);
  return out;
}
