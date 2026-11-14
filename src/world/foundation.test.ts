// The clay foundation's pure parts: the lamp switch in the lighting scripts, what Bay View's district blocks take in,
// and the one reduced-motion setting the world listens to. (No DOM: plain materials stand in for clay.)
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { LAMPS, hourOf, lookAt } from './lighting.ts';
import { collectClay } from './clay/bake.ts';
import { Baker } from './clay/core.ts';
import { onReducedMotion, reducedMotion, setReducedMotion } from './clay/kit.ts';

describe('lighting: the lamps are a switch', () => {
  it('neon and string lights stay off through the day and come on at 19:30', () => {
    for (const h of [8, 9, 12, 16.5, 16.75, 19, 19.25, LAMPS.on - 0.01]) {
      const l = lookAt(h);
      expect(l.glow, `glow at ${h}`).toBe(0);
      expect(l.pools, `pools at ${h}`).toBe(0);
    }
    for (const h of [LAMPS.on, 19.75, 21.5, 23]) {
      const l = lookAt(h);
      expect(l.glow, `glow at ${h}`).toBeGreaterThan(0);
      expect(l.pools, `pools at ${h}`).toBeGreaterThan(0);
    }
  });

  it('dawn (Morning Prep) keeps the streetlight pools but no neon, and the streetlights click off at the open', () => {
    const prep = lookAt(7);
    expect(prep.glow).toBe(0);
    expect(prep.pools).toBeGreaterThan(0);
    expect(lookAt(LAMPS.off).pools).toBe(0);
  });
});

describe('lighting: the night follows the clock', () => {
  it('runs the night on the sim clock past midnight, from dusk to the dawn blend', () => {
    expect(hourOf('prep', 420)).toBe(7);
    expect(hourOf('open', 720)).toBe(12);
    expect(hourOf('night', 1260)).toBe(21);
    expect(hourOf('night', 1620)).toBe(27); // 03:00
    expect(hourOf('night', 1860)).toBe(31); // 07:00, Morning Prep next
  });

  it('holds night until 06:00, then blends into the dawn Morning Prep opens on', () => {
    const night = lookAt(27), late = lookAt(30), mid = lookAt(30.5), end = lookAt(31), prep = lookAt(7);
    expect(late.night).toBeCloseTo(night.night);
    expect(mid.night).toBeLessThan(late.night);
    expect(mid.night).toBeGreaterThan(end.night);
    expect(end.night).toBeCloseTo(prep.night);
    expect(end.sunI).toBeCloseTo(prep.sunI);
  });
});

describe('collectClay: what a Bay View district block takes in', () => {
  const mat = new THREE.MeshStandardMaterial({ color: 0xff8844 });
  const part = () => new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);

  it('takes plain clay parts and leaves out people and noFar parts', () => {
    const root = new THREE.Group();
    root.add(part()); // a stand's wall: goes in
    const kid = new THREE.Group(); kid.userData.limbs = []; kid.add(part()); root.add(kid); // a Figure root (rig)
    const fig = new THREE.Group(); fig.userData.figure = true; fig.add(part()); root.add(fig); // a Figure root (flag)
    const crate = new THREE.Group(); crate.userData.noFar = true; crate.add(part()); root.add(crate); // a mid-reveal crate
    const hidden = part(); hidden.visible = false; root.add(hidden);
    expect(collectClay(root, new Baker())).toBe(1);
  });

  it('takes a part with a far version as that one piece instead of its children', () => {
    const root = new THREE.Group();
    const stand = new THREE.Group();
    stand.userData.far = new THREE.BoxGeometry(2, 2, 2);
    stand.add(part(), part(), part());
    root.add(stand);
    expect(collectClay(root, new Baker())).toBe(1);
  });
});

describe('reduced motion: the OS setting or the Options switch', () => {
  it('reports the switch and tells listeners once per change', () => {
    const seen: boolean[] = [];
    const off = onReducedMotion((on) => seen.push(on));
    expect(seen).toEqual([false]); // called at once with the current value (no OS setting under test)
    setReducedMotion(true);
    expect(reducedMotion()).toBe(true);
    setReducedMotion(true); // no change, no call
    setReducedMotion(false);
    expect(reducedMotion()).toBe(false);
    expect(seen).toEqual([false, true, false]);
    off();
    setReducedMotion(true);
    expect(seen).toEqual([false, true, false]);
    setReducedMotion(false);
  });
});
