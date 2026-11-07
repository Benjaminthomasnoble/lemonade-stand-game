// The clay cast: every boss, townsperson, crew look and customer builds on the
// rig the world code expects, faces swap whole, and the crowd batch mirrors poses.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BOSSES, TOWNSFOLK, crewSpec, makeBoss, makeCrew, makeCustomer, makeTownsfolk, type BossId, type SegmentLook, type Side, type TownsfolkId } from './cast.ts';
import { Figure, SPECS, type Face } from './figure.ts';
import { createFigureBatch, freezeFigures, PROXY_LAYER } from './figureBatch.ts';

const mat = new THREE.MeshStandardMaterial();
const SIDES: Side[] = ['player', 'sourwood', 'hollis', 'fizzco', 'coldbrew', 'blenders'];
const SEGS: SegmentLook[] = ['kids', 'families', 'seniors', 'students', 'office', 'tourists', 'workers', 'highRollers'];
const rigOk = (f: Figure) => {
  const u = f.root.userData;
  expect(u.limbs).toHaveLength(4);
  expect(u.hands).toHaveLength(2);
  expect(u.figure).toBe(f);
  expect(typeof u.speckColor).toBe('string');
};

describe('clay cast', () => {
  it('builds every boss and named townsperson', () => {
    for (const id of Object.keys(BOSSES) as BossId[]) rigOk(makeBoss(id, mat));
    for (const id of Object.keys(TOWNSFOLK) as TownsfolkId[]) rigOk(makeTownsfolk(id, mat));
  });

  it('gives the bosses their signature silhouettes', () => {
    const vera = makeBoss('vera', mat), tilly = makeBoss('tilly', mat), brock = makeBoss('brock', mat);
    // Vera is the tallest in town, Tilly the widest barrel, Brock the tiniest head
    const steward = makeTownsfolk('steward', mat);
    expect(vera.height * vera.root.scale.y).toBeGreaterThan(steward.height);
    expect(tilly.arms[1].position.x).toBeGreaterThan(new Figure(SPECS.hollis, mat).arms[1].position.x);
    expect(brock.sp.R).toBeLessThan(new Figure(SPECS.blenders, mat).sp.R);
    // Dex stands about 3 heads tall
    const dex = makeTownsfolk('dex', mat);
    expect(dex.height / (2 * dex.sp.R)).toBeGreaterThan(2.8);
  });

  it('dresses every crew for every weapon, gear and level', () => {
    for (const side of SIDES) for (const weapon of ['fists', 'clubs', 'hatchets'] as const) for (const gear of ['none', 'vest', 'pro'] as const) {
      const f = makeCrew(side, { weapon, gear, level: 2, role: 'captain' }, mat, { detail: 0.5 });
      rigOk(f);
      const held = f.hand.children.length;
      expect(held, `${side} ${weapon}`).toBe(weapon === 'fists' ? 0 : 1);
    }
    expect(crewSpec('player', { gear: 'pro' }).hat).toBe('helmet');
    expect(crewSpec('player', { level: 4 }).chevrons).toBe(4);
    expect(crewSpec('player', { weapon: 'fists' }).tape).toBeTruthy();
    expect(crewSpec('sourwood').kind).toBe('stilt');
    expect(crewSpec('player', { onGuard: true }).crossed).toBe(true);
  });

  it('builds every customer segment within the crowd budget', () => {
    for (const seg of SEGS) for (let i = 0; i < 5; i++) {
      const { fig } = makeCustomer(seg, i, mat, { detail: 0.5 });
      rigOk(fig);
      expect(fig.triangles(), seg).toBeLessThan(3500);
    }
    expect(makeCustomer('kids', 0, mat).fig.sp.kind).toBe('kid');
  });

  it('swaps whole faces, keeps them through blinks, and shares them', () => {
    const a = new Figure({ ...SPECS.kid, seed: 5 }, mat), b = new Figure({ ...SPECS.kid, seed: 5 }, mat);
    const open = a.head.geometry;
    const seen = new Set<THREE.BufferGeometry>([open]);
    for (const face of ['yum', 'pucker', 'brainfreeze', 'shock', 'ko'] as Face[]) {
      a.face(face);
      expect(seen.has(a.head.geometry), face).toBe(false);
      seen.add(a.head.geometry);
      for (let f = 0; f < 200; f += 7) a.blink(f);
      expect(a.current).toBe(face);
      b.face(face);
      expect(b.head.geometry).toBe(a.head.geometry);
    }
    a.face('neutral');
    expect(a.head.geometry).toBe(open);
  });

  it('draws a crowd through one batch that follows the rigs', () => {
    const fm = new THREE.MeshStandardMaterial();
    const batch = createFigureBatch(fm, { instances: 4, vertices: 1000, indices: 3000 });
    const figs = [0, 1, 2].map((i) => makeCustomer('office', i, fm, { detail: 0.5 }).fig);
    for (const f of figs) batch.track(f.root);
    const st = batch.stats();
    expect(st.instances).toBeGreaterThanOrEqual(figs.length * 6);
    // every part moved to the hidden layer: only the batch draws
    figs[0].root.traverse((o) => { if ((o as THREE.Mesh).isMesh) { expect(o.layers.isEnabled(PROXY_LAYER)).toBe(true); expect(o.layers.isEnabled(0)).toBe(false); } });
    figs[1].root.position.set(5, 0, 2);
    figs[2].root.visible = false;
    batch.sync();
    const m = new THREE.Matrix4(), p = new THREE.Vector3();
    batch.mesh.getMatrixAt(st.instances / 3, m); // first part of the second figure
    p.setFromMatrixPosition(m);
    expect(p.x).toBeGreaterThan(4);
    expect(batch.mesh.getVisibleAt(st.instances - 1)).toBe(false);
    // a face swap becomes a geometry swap in the batch
    const before = batch.stats().geometries;
    figs[0].face('yum');
    batch.sync();
    expect(batch.stats().geometries).toBe(before + 1);
  });

  it('freezes a posted watch into one draw', () => {
    const watch = new THREE.Group();
    for (let i = 0; i < 4; i++) { const f = makeCrew('player', { onGuard: true, level: i }, mat); f.root.position.x = i; watch.add(f.root); }
    const m = freezeFigures(watch, mat);
    expect(m).not.toBeNull();
    expect(watch.children).toEqual([m]);
  });
});
