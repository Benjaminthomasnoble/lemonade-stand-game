// The clay figure rig in isolation (no DOM: a plain material stands in for clay).
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CREWS, Figure, GAIT_OF, KINDS, SPECS, customerSpec, gait, onTwos, type BodyKind } from './figure.ts';

const mat = new THREE.MeshStandardMaterial();

describe('clay figure rig', () => {
  it('builds every cast member, crew and body kind with the rig the world code expects', () => {
    const specs = [...Object.values(SPECS), ...Object.values(CREWS), ...(Object.keys(KINDS) as BodyKind[]).map((kind) => ({ kind }))];
    for (const sp of specs) {
      const fig = new Figure(sp, mat, { scale: 0.9 });
      const u = fig.root.userData;
      expect(u.limbs).toHaveLength(4);
      expect(u.limbs).toEqual([fig.legs[0], fig.legs[1], fig.arms[0], fig.arms[1]]);
      for (const l of u.limbs) expect(l).toBeInstanceOf(THREE.Group);
      expect(u.hands).toEqual([fig.handL, fig.hand]);
      expect(u.head).toBe(fig.neck);
      expect(u.rig).toBe(fig.rig);
      expect(u.base).toBe(0.9);
      expect(fig.root.scale.x).toBeCloseTo(0.9);
      // L at -x, R at +x; the hands hang off the arms
      expect(fig.arms[0].position.x).toBeLessThan(fig.arms[1].position.x);
      expect(fig.hand.parent).toBe(fig.arms[1]);
      expect(fig.height).toBeGreaterThan(1);
      expect(fig.height).toBeLessThan(2.2);
    }
  });

  it('stays within a phone-friendly triangle budget', () => {
    for (const [id, sp] of Object.entries(SPECS)) {
      const tris = new Figure(sp, mat).triangles();
      expect(tris, id).toBeLessThan(9000);
    }
    expect(new Figure(customerSpec(() => 0.3), mat).triangles()).toBeLessThan(6000);
  });

  it('builds crowd figures at half detail for well under half the triangles', () => {
    const spec = { ...customerSpec(() => 0.6), seed: 77 };
    const full = new Figure(spec, mat).triangles();
    const crowd = new Figure(spec, mat, { detail: 0.5 });
    expect(crowd.triangles()).toBeLessThan(full * 0.5);
    expect(crowd.triangles()).toBeGreaterThan(200);
    expect(crowd.root.userData.limbs).toHaveLength(4);
  });

  it('poses on twos: the same frame gives the same pose, the next frame boils', () => {
    const fig = new Figure(SPECS.kid, mat);
    const [f] = onTwos(10.02);
    expect(onTwos(10.07)[0]).toBe(f); // 12 fps: 10.02 s and 10.07 s are one frame
    fig.pose({ lift: 0.1, aL: [-1, 0.3] }, f);
    const a = fig.rig.position.clone(), s = fig.rig.scale.clone(), arm = fig.arms[0].rotation.x;
    fig.pose({ lift: 0.1, aL: [-1, 0.3] }, f);
    expect(fig.rig.position.equals(a)).toBe(true);
    expect(fig.rig.scale.equals(s)).toBe(true);
    fig.pose({ lift: 0.1, aL: [-1, 0.3] }, f + 1);
    expect(fig.rig.scale.equals(s)).toBe(false); // the boil
    expect(Math.abs(fig.arms[0].rotation.x - arm)).toBeLessThan(0.05);
    expect(fig.rig.position.y).toBeCloseTo(0.1);
  });

  it('blinks every few seconds and shuts its eyes on request', () => {
    const fig = new Figure(SPECS.lottie, mat);
    const open = fig.head.geometry;
    fig.pose({ shut: true }, 1);
    expect(fig.head.geometry).not.toBe(open);
    let blinks = 0;
    for (let f = 2; f < 12 * 20; f++) { fig.pose({}, f); if (fig.head.geometry !== open) blinks++; }
    expect(blinks).toBeGreaterThan(2);
    expect(blinks).toBeLessThan(40);
  });

  it('shares baked geometry between figures with the same spec and seed', () => {
    const a = new Figure({ ...SPECS.henchman, seed: 77 }, mat), b = new Figure({ ...SPECS.henchman, seed: 77 }, mat);
    expect(a.body.geometry).toBe(b.body.geometry);
    expect(new Figure({ ...SPECS.henchman, seed: 78 }, mat).body.geometry).not.toBe(a.body.geometry);
  });

  it('walks every gait and holds props', () => {
    for (const kind of Object.keys(KINDS) as BodyKind[]) {
      const fig = new Figure({ kind }, mat);
      for (let f = 0; f < 24; f++) gait(fig, GAIT_OF[kind], f * 0.5, f, f / 12);
      for (const l of fig.root.userData.limbs as THREE.Object3D[]) expect(Number.isFinite(l.rotation.x)).toBe(true);
    }
    const sour = new Figure(SPECS.sourwood, mat);
    const cane = sour.hold('cane');
    expect(cane.parent).toBe(sour.hand);
    const bro = new Figure(SPECS.blenders, mat);
    bro.flex(true);
    expect(bro.flexing).toBe(true);
  });
});
