// Citrine Bay's streets and plots, in clay. Static parts (district lawns,
// roads, sidewalks, streetlamps, trees, grass) are baked once into a few
// vertex-coloured chunks; plot tiles and owner borders are two instanced
// meshes; each plot's building is rebuilt (and baked to one draw) only when
// its owner or stand level changes. Detail follows scene.userData.detail
// (set by scene.ts): mid zoom drops the flowers, Bay View drops the grass and
// draws each district's plots as one merged clay block. Without shadows
// (phones) trees, lamps and buildings sit on soft blob shadows instead.
import * as THREE from 'three';
import {
  DISTRICTS, FACTIONS, LOTTIES_CORNER, PLAYER_COLOR, PLOT_SPACING, PLOTS, STREET_HALF,
  type DistrictId, type GameState, type Plot, type RivalId,
} from '../sim/economy.ts';
import { SEA_X, SEA_Z, treeInto } from './scene.ts';
import { CROSS_STREETS_Z, WEST_AVENUE_X } from '../sim/map.ts';
import { createStand, type Stand as StandModel } from './stand.ts';
import { fenceModel, gadgetModels, rivalStand, wreckLook, wreckPile } from './buildings.ts';
import type { Owner } from './clay/standKit.ts';
import { PERIMETERS, STAND_LEVELS } from '../sim/balance.ts';
import { lemonsExpiringTomorrow, stock } from '../sim/economy.ts';
import { civicBuilding, facilityModel, fieldRows, forSaleGeometry, forSaleLabel, hqBuilding, pierModel, tapeBorder, tileOutline, tilePattern, TILE_PATTERN } from './landmarks.ts';
import { createTown, townFootprints } from './town.ts';
import { makeCrew, type Side } from './clay/cast.ts';
import { freezeFigures } from './clay/figureBatch.ts';
import { GLOSS, PAPER, Baker, canvasTex, cap, cone, hash, lcg, lumpy, outline, prep, rbox, slab, sph, tor } from './clay/core.ts';
import { bakeGroup, collectClay } from './clay/bake.ts';
import { clayPlain, kit, reflective } from './clay/kit.ts';
import { P } from './clay/palette.ts';

export const SIDEWALK_OFFSET = STREET_HALF + 1.1;
/** How far the stand model's origin sits from the street center. */
const STAND_SETBACK = 7.5;

export interface PlotView {
  plot: Plot;
  root: THREE.Group;
  /** Invisible pick target over the plot (the visible tile is an instance of the bay's tile mesh). */
  pad: THREE.Mesh;
  /** Index into the bay's instanced plot tiles and owner borders. */
  tile: number;
  key: string;
  stand?: StandModel;
  /** World-space spot where customers queue. */
  serve: THREE.Vector3;
  sidewalkZ: number;
  /** The player's stand level last drawn here, so an upgrade can play its crate reveal. */
  shownLevel?: number;
}

export interface Bay {
  views: Record<string, PlotView>;
  sync(s: GameState): void;
  update(s: GameState, time: number, ringing?: boolean): void;
  pick(ndc: THREE.Vector2, camera: THREE.Camera): string | null;
  select(id: string | null): void;
}

const ownerColor = (owner: string | null) =>
  owner === 'player' ? PLAYER_COLOR : owner ? FACTIONS[owner as RivalId].color : 0xffffff;

/** District lawns in plasticine: saturated, warm, one bar of clay each. */
const GROUND: Record<DistrictId, string> = {
  maple: '#7CC47F', oldtown: '#93c76a', campus: '#86c48a', downtown: '#c3bfd6',
  boardwalk: P.sand, harbor: '#cdbda2', groves: '#a9cf5e', hilltop: '#5FA35A',
};
/** Rank 10 gilds the Palace. */
const gilded = (s: GameState, level: number) => level === 5 && s.rank >= 10;
/** The fence's HP share, in quarters (pieces knock out as it drops). */
function fenceShare(ps: GameState['plots'][string]): number {
  const per = PERIMETERS[ps.defense.tier - 1];
  return per ? Math.ceil((ps.defense.fenceHp / per.hp) * 4) / 4 : 1;
}

function guardsAt(s: GameState, id: string): number {
  const ps = s.plots[id];
  if (!ps.stand && !ps.facility) return 0;
  if (ps.owner === 'player') return s.guards.filter((g) => g.post === id && g.outUntil <= s.day).length;
  return ps.garrison ?? 0;
}

/** Bakers bucketed by area, so the static town is a dozen draws that still frustum-cull in Street View. */
class Chunks {
  private map = new Map<string, Baker>();
  constructor(private size: number) {}
  at(x: number, z: number) {
    const k = `${Math.floor(x / this.size)},${Math.floor(z / this.size)}`;
    let b = this.map.get(k);
    if (!b) { b = new Baker(); this.map.set(k, b); }
    return b;
  }
  build(scene: THREE.Scene, mat: THREE.Material, name: string, cast: boolean) {
    for (const [k, b] of this.map) {
      const m = new THREE.Mesh(b.build(), mat);
      m.castShadow = cast; m.receiveShadow = true; m.name = `${name}:${k}`;
      scene.add(m);
    }
  }
}

export function createBay(scene: THREE.Scene): Bay {
  const K = kit();
  const rng = lcg(4242);
  const town = new Chunks(90); // lawns, roads, sidewalks: receive shadows only
  const props = new Chunks(70); // trees, lamps, hedges: cast shadows

  // Rain leaves the streets glossy: a thin wet skin over every road, shown in rain and storms.
  const wetB = new Baker();
  // District lawns, streets with curbs, sidewalks and lane dashes.
  for (const d of DISTRICTS) {
    const x0 = d.origin[0] - 6, x1 = d.origin[0] + d.cols * PLOT_SPACING + 6;
    const len = x1 - x0, cx = (x0 + x1) / 2, z = d.origin[1];
    town.at(cx, z).add(slab(outline(cx, z, len + 4, 38, 4, 90, 0.5, d.origin[0] * 0.1, 0.2), -0.3, 0.06, 0.14), GROUND[d.id]);
    for (let x = x0; x < x1; x += 60) {
      const w = Math.min(60, x1 - x), mx = x + w / 2, B = town.at(mx, z);
      B.add(rbox(w + 0.02, 0.16, STREET_HALF * 2, 0.06), P.asphalt, { p: [mx, 0.02, z] });
      wetB.add(new THREE.BoxGeometry(w, 0.01, STREET_HALF * 2 - 0.3), '#ffffff', { p: [mx, 0.104, z] });
      for (let k = x + 2; k < x + w - 1; k += 4) B.add(new THREE.BoxGeometry(1.3, 0.05, 0.16), P.paint, { p: [k + (hash(k) - 0.5) * 0.12, 0.11, z + (hash(k, 2) - 0.5) * 0.08], r: [0, (hash(k, 3) - 0.5) * 0.06, 0] });
      for (const side of [-1, 1]) {
        B.add(cap(0.16, w - 0.3, 1, 5), P.curb, { p: [mx, 0.1, z + side * (STREET_HALF + 0.02)], r: [0, 0, Math.PI / 2] });
        B.add(rbox(w, 0.22, 2.2, 0.08), P.walk, { p: [mx, 0.06, z + side * SIDEWALK_OFFSET] });
        for (let k = x + 1.3; k < x + w; k += 2.4) B.add(new THREE.BoxGeometry(0.05, 0.03, 1.9), '#cdb894', { p: [k + (hash(k, side) - 0.5) * 0.12, 0.17, z + side * SIDEWALK_OFFSET], r: [0, (hash(k, 9) - 0.5) * 0.08, 0] });
      }
    }
  }
  // Connecting roads: cross streets between the rows, a west avenue, and a
  // short connector at each end of every district street.
  const roads: { x: number; z: number; w: number; d: number }[] = [];
  const crossX0 = WEST_AVENUE_X, crossX1 = SEA_X - 10;
  for (const z of CROSS_STREETS_Z) roads.push({ x: (crossX0 + crossX1) / 2, z, w: crossX1 - crossX0, d: 8 });
  const rowsZ = DISTRICTS.map((d) => d.origin[1]);
  const zMin = Math.min(...rowsZ), zMax = Math.max(...rowsZ);
  roads.push({ x: WEST_AVENUE_X, z: (zMin + zMax) / 2, w: 8, d: zMax - zMin + 8 });
  for (const d of DISTRICTS) {
    const z = d.origin[1];
    const near = CROSS_STREETS_Z.filter((c) => Math.abs(c - z) < 70);
    for (const x of [d.origin[0] - 4, d.origin[0] + d.cols * PLOT_SPACING + 4]) {
      if (x > SEA_X - 12) continue;
      for (const c of near) roads.push({ x, z: (z + c) / 2, w: 8, d: Math.abs(z - c) });
      roads.push({ x: x + (x < d.origin[0] ? -2 : 2), z, w: 4, d: 8 }); // join the street end
    }
  }
  for (const r of roads) {
    // long roads go down in pieces so each chunk keeps its own
    const along = r.w > r.d, L = along ? r.w : r.d, n = Math.max(1, Math.ceil(L / 60));
    for (let i = 0; i < n; i++) {
      const l = L / n, o = -L / 2 + l * (i + 0.5);
      const x = along ? r.x + o : r.x, z = along ? r.z : r.z + o, w = along ? l + 0.02 : r.w, d = along ? r.d : l + 0.02;
      const B = town.at(x, z);
      B.add(rbox(w, 0.14, d, 0.05), P.asphalt, { p: [x, 0.0, z] });
      wetB.add(new THREE.BoxGeometry(w - 0.3, 0.01, d - 0.3), '#ffffff', { p: [x, 0.075, z] });
      if (r.w >= 8 || r.d >= 8) for (let k = -l / 2 + 2; k < l / 2 - 1; k += 4) B.add(new THREE.BoxGeometry(1.3, 0.05, 0.16), P.paint, { p: along ? [x + k, 0.08, z] : [x, 0.08, z + k], r: [0, along ? 0 : Math.PI / 2, 0] });
    }
  }
  const onRoad = (x: number, z: number, pad = 2) => roads.some((r) => Math.abs(r.x - x) < r.w / 2 + pad && Math.abs(r.z - z) < r.d / 2 + pad);
  const nearPlot = (x: number, z: number, pad = 8) => PLOTS.some((p) => Math.abs(p.x - x) < pad && Math.abs(p.z - z) < pad);
  const foot = townFootprints();
  const onBuilding = (x: number, z: number, pad = 0) => foot.some(([fx, fz, r]) => Math.abs(fx - x) < r + pad && Math.abs(fz - z) < r - 1 + pad);
  const onStreet = (x: number, z: number, pad = 7) => DISTRICTS.some((d) => Math.abs(d.origin[1] - z) < pad && x > d.origin[0] - 8 && x < d.origin[0] + d.cols * PLOT_SPACING + 8);

  // Soft blob shadows (x, z, radius) for when the sun casts none (phones).
  const blobAt: [number, number, number][] = [];
  // Popsicle-stick streetlamps along every district street; their bulbs glow at night.
  const lamps: THREE.Vector3[] = [];
  for (const d of DISTRICTS) {
    for (let c = 0; c <= d.cols; c += 2) for (const side of [-1, 1]) {
      if ((c / 2) % 2 === (side > 0 ? 1 : 0)) continue;
      const x = d.origin[0] + c * PLOT_SPACING, z = d.origin[1] + side * (SIDEWALK_OFFSET + 0.7), s = -side;
      const B = props.at(x, z);
      B.add(rbox(0.26, 3.3, 0.1, 0.04, 1), P.stick, { p: [x, 1.65, z], fx: PAPER });
      B.add(rbox(0.2, 0.9, 0.08, 0.035, 1), P.stick, { p: [x, 3.2, z + s * 0.38], r: [Math.PI / 2 - 0.15 * s, 0, 0], fx: PAPER });
      B.add(sph(0.22, 8, 5), P.terra, { p: [x, 0.12, z], s: [1.4, 0.4, 1.4] });
      B.add(cone(0.4, 0.42, 12, true), P.terra, { p: [x, 3.12, z + s * 0.78], fx: PAPER });
      B.add(sph(0.08, 6, 4), P.terra, { p: [x, 3.34, z + s * 0.78] });
      B.add(sph(0.2, 8, 6), '#FFE2A8', { p: [x, 2.92, z + s * 0.78], fx: 1 });
      lamps.push(new THREE.Vector3(x, 2.92, z + s * 0.78));
      blobAt.push([x, z + s * 0.3, 0.9]);
    }
  }
  // Light pools on the ground and halos round the bulbs, both shown at night.
  const poolGeo = new THREE.PlaneGeometry(7, 7).rotateX(-Math.PI / 2);
  const pools = new THREE.InstancedMesh(poolGeo, K.pool, lamps.length);
  const m4 = new THREE.Matrix4();
  lamps.forEach((p, i) => pools.setMatrixAt(i, m4.makeTranslation(p.x, 0.2, p.z)));
  pools.renderOrder = 2;
  pools.name = 'lamp-pools';
  const halos = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(lamps.flatMap((p) => [p.x, p.y + 0.1, p.z]), 3)), K.halo);
  halos.name = 'lamp-halos';
  scene.add(pools, halos);

  // Trees in the gaps (one in three a lemon tree).
  for (let i = 0; i < 260; i++) {
    const x = -178 + rng() * (SEA_X - 10 + 178), z = -125 + rng() * (SEA_Z - 10 + 125);
    if (nearPlot(x, z) || onStreet(x, z) || onRoad(x, z) || onBuilding(x, z, 1)) continue;
    const sc = 1.05 + rng() * 0.6;
    treeInto(props.at(x, z), x, z, rng, sc, i);
    blobAt.push([x, z, 2.3 * sc]);
  }
  // Hedges and bushes between the lots.
  for (const p of PLOTS) {
    if (p.type === 'dock' || hash(p.x, p.z) < 0.35) continue;
    const x = p.x + PLOT_SPACING / 2, z = p.z + (p.side === 0 ? -2 : 2);
    props.at(x, z).add(lumpy(sph(0.75, 8, 6), 0.12, 1.6, p.col), [P.leaf, P.green, P.leaf3][p.col % 3], { p: [x, 0.35, z], s: [0.8, 0.85, 1.6 + hash(p.x) * 1.2] });
    blobAt.push([x, z, 1.3]);
  }
  town.build(scene, K.world, 'town', false);
  const wet = new THREE.Mesh(wetB.build(), reflective(new THREE.MeshStandardMaterial({ color: '#2a2746', roughness: 0.06, metalness: 0.1, transparent: true, opacity: 0.42, depthWrite: false, envMapIntensity: 1.8, polygonOffset: true, polygonOffsetFactor: -1 })));
  wet.name = 'wet-streets';
  wet.visible = false;
  wet.renderOrder = 1;
  scene.add(wet);
  props.build(scene, K.world, 'props', true);

  // Grass tufts and clay flowers on the open lawns (two instanced draws).
  const tuftG = prep(cone(0.09, 0.36, 5), '#ffffff');
  const flowerG = prep(lumpy(sph(0.12, 6, 4), 0.015, 10, 3), '#ffffff');
  const tufts = new THREE.InstancedMesh(tuftG, K.world, 2600), flowers = new THREE.InstancedMesh(flowerG, K.world, 700);
  const q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
  const greens = [P.green, P.leaf, P.leaf2, P.leaf3];
  let nt = 0, nf = 0;
  for (let i = 0; i < 20000 && (nt < tufts.count || nf < flowers.count); i++) {
    const x = -182 + rng() * (SEA_X - 4 + 182), z = -132 + rng() * (SEA_Z - 6 + 132);
    if (onRoad(x, z, 0.8) || onStreet(x, z, 5.8) || nearPlot(x, z, 5.6) || onBuilding(x, z)) continue;
    if (nt < tufts.count) { e.set((rng() - 0.5) * 0.5, rng() * 3, (rng() - 0.5) * 0.5); q.setFromEuler(e); const s = 0.8 + rng() * 0.9; tufts.setMatrixAt(nt, m4.compose(v.set(x, 0.14 * s, z), q, sc.set(s, s, s))); tufts.setColorAt(nt, col.set(greens[nt % 4]).multiplyScalar(0.85 + rng() * 0.3)); nt++; }
    else if (nf < flowers.count) { flowers.setMatrixAt(nf, m4.compose(v.set(x, 0.12, z), q.identity(), sc.set(1, 0.8, 1))); flowers.setColorAt(nf, col.set([P.blush, P.lemon, '#ffffff', P.terra, '#b9a7ea'][nf % 5])); nf++; }
  }
  tufts.count = nt; flowers.count = nf;
  tufts.receiveShadow = flowers.receiveShadow = true;
  tufts.computeBoundingSphere(); flowers.computeBoundingSphere();
  scene.add(tufts, flowers);

  // Plots: a clay tile each (one instanced draw), an owner border strip (another), and an invisible pick pad.
  const views: Record<string, PlotView> = {};
  const padGeo = new THREE.PlaneGeometry(PLOT_SPACING - 1, 10).rotateX(-Math.PI / 2);
  const pickMat = new THREE.MeshBasicMaterial({ visible: false });
  const tileGeo = prep(rbox(PLOT_SPACING - 1.2, 0.16, 9.8, 0.3, 1), '#ffffff');
  const tiles = new THREE.InstancedMesh(tileGeo, K.world, PLOTS.length);
  const borderGeo = prep(cap(0.2, PLOT_SPACING - 1.8, 2, 6).rotateZ(Math.PI / 2), '#ffffff', 0.4); // owner tints glow at night
  const borders = new THREE.InstancedMesh(borderGeo, K.world, PLOTS.length);
  tiles.receiveShadow = true; borders.castShadow = true; borders.receiveShadow = true;
  tiles.name = 'plot-tiles'; borders.name = 'plot-borders';
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  PLOTS.forEach((p, i) => {
    const root = new THREE.Group();
    const facing = p.side === 0 ? 1 : -1;
    root.position.set(p.x, 0, p.streetZ - facing * STAND_SETBACK);
    root.rotation.y = p.side === 0 ? 0 : Math.PI;
    scene.add(root);
    const pad = new THREE.Mesh(padGeo, pickMat);
    pad.position.set(p.x, 0.1, p.z);
    pad.userData.plot = p.id;
    pad.matrixAutoUpdate = false; pad.updateMatrix(); pad.updateMatrixWorld();
    tiles.setMatrixAt(i, m4.makeTranslation(p.x, 0.04, p.z));
    borders.setMatrixAt(i, zero);
    const sidewalkZ = p.streetZ - facing * SIDEWALK_OFFSET;
    views[p.id] = { plot: p, root, pad, tile: i, key: '', serve: new THREE.Vector3(p.x, 0.12, sidewalkZ - facing * 0.3), sidewalkZ };
  });
  // Owned tiles carry their owner's pattern pressed into the clay and a Plum ink outline
  // (one instanced draw per owner, one for the outlines); civic plots get a masking-tape border.
  const TW = PLOT_SPACING - 1.2, TD = 9.8, TOP = 0.04 + 0.08;
  const patterns = Object.fromEntries((Object.keys(TILE_PATTERN) as (keyof typeof TILE_PATTERN)[]).map((o) => {
    const m = new THREE.InstancedMesh(tilePattern(o, TW, TD, TOP), K.world, PLOTS.length);
    m.count = 0;
    m.receiveShadow = true; m.name = `plot-pattern:${o}`;
    m.computeBoundingSphere();
    scene.add(m);
    return [o, m];
  })) as unknown as Record<keyof typeof TILE_PATTERN, THREE.InstancedMesh>;
  const outlines = new THREE.InstancedMesh(tileOutline(TW, TD, TOP), K.world, PLOTS.length);
  const ownerAt: (string | null)[] = PLOTS.map(() => null);
  let patternsDirty = true;
  outlines.name = 'plot-outlines'; outlines.receiveShadow = true;
  const civics = PLOTS.filter((p) => p.type === 'civic');
  const tape = new THREE.InstancedMesh(tapeBorder(TW, TD, TOP), K.world, Math.max(1, civics.length));
  civics.forEach((p, i) => tape.setMatrixAt(i, m4.makeTranslation(p.x, 0, p.z)));
  tape.name = 'plot-tape'; tape.receiveShadow = true;
  outlines.count = 0;
  tape.computeBoundingSphere(); outlines.computeBoundingSphere();
  tiles.computeBoundingSphere(); borders.computeBoundingSphere();
  scene.add(tiles, borders, outlines, tape);
  // The town around the plots: backdrop buildings, landmarks, props and eye music.
  const townLife = createTown(scene);

  // Blob shadows: one instanced draw of soft plum discs, shown only when the sun casts no shadows.
  const blobTex = canvasTex(64, 64, (c) => {
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.55, 'rgba(255,255,255,0.75)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 64, 64);
  });
  const blobs = new THREE.InstancedMesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: blobTex, color: P.plum, transparent: true, opacity: 0.32, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    blobAt.length + PLOTS.length);
  blobAt.forEach(([x, z, r], i) => blobs.setMatrixAt(i, m4.makeScale(r, 1, r).setPosition(x, 0.19, z)));
  for (let i = 0; i < PLOTS.length; i++) blobs.setMatrixAt(blobAt.length + i, zero);
  blobs.name = 'blob-shadows';
  blobs.renderOrder = 1;
  blobs.visible = false;
  blobs.computeBoundingSphere();
  scene.add(blobs);
  const box = new THREE.Box3(), size = new THREE.Vector3(), mid = new THREE.Vector3();

  // Bay View: each district's plots merged into one clay block, rebuilt (a couple a frame) when a plot changes.
  const far = new Map<DistrictId, { views: PlotView[]; mesh: THREE.Mesh | null; dirty: boolean }>();
  for (const v of Object.values(views)) {
    const f = far.get(v.plot.district) ?? { views: [], mesh: null, dirty: true };
    f.views.push(v);
    far.set(v.plot.district, f);
  }
  function buildFar(id: DistrictId, f: { views: PlotView[]; mesh: THREE.Mesh | null; dirty: boolean }) {
    const B = new Baker();
    for (const v of f.views) {
      const shown = v.root.visible;
      v.root.visible = true;
      collectClay(v.root, B);
      v.root.visible = shown;
    }
    if (f.mesh) { scene.remove(f.mesh); f.mesh.geometry.dispose(); f.mesh = null; }
    if (B.size) {
      f.mesh = new THREE.Mesh(B.build(), K.world);
      f.mesh.name = `far:${id}`;
      f.mesh.castShadow = f.mesh.receiveShadow = true;
      f.mesh.visible = false;
      scene.add(f.mesh);
    }
    f.dirty = false;
  }

  // The selection ring: a glossy white clay snake round the plot.
  const ring = new THREE.Mesh(tor(6.6, 0.22, 8, 64), clayPlain('#ffffff', { fx: GLOSS + 0.6 }));
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  scene.add(ring);

  const raycaster = new THREE.Raycaster();
  const pads = Object.values(views).map((v) => v.pad);
  const tint = new THREE.Color(), ground = new THREE.Color();

  // FOR SALE signs: one instanced draw for every unowned plot; the tape words are added per plot.
  const saleAt: boolean[] = PLOTS.map(() => false);
  let salesDirty = true;
  const sales = new THREE.InstancedMesh(forSaleGeometry(), K.world, PLOTS.length);
  sales.name = 'sale-signs'; sales.castShadow = true; sales.receiveShadow = true; sales.count = 0;
  scene.add(sales);
  function forSale(v: PlotView) {
    saleAt[v.tile] = true;
    salesDirty = true;
    v.root.add(forSaleLabel());
  }

  function rebuild(v: PlotView, s: GameState) {
    const ps = s.plots[v.plot.id];
    v.root.clear();
    if (saleAt[v.tile]) { saleAt[v.tile] = false; salesDirty = true; }
    v.stand = undefined;
    const p = v.plot;
    let building: THREE.Object3D | null = null;
    if (p.type === 'civic') building = civicBuilding(p.name);
    else if (p.type === 'hq') building = hqBuilding(ps.owner as RivalId | 'player' | null, p.name);
    else if (ps.facility) building = facilityModel(ps.facility.kind, ps.facility.level);
    else if (p.type === 'field') { v.root.add(bakeGroup(fieldRows(p.name))); if (!ps.owner) forSale(v); }
    else if (p.type === 'dock') { v.root.add(bakeGroup(pierModel())); if (!ps.owner) forSale(v); }
    else if (ps.stand && ps.owner === 'player') {
      const m = createStand({ lottie: p.id === LOTTIES_CORNER });
      m.setLevel(ps.stand.level, gilded(s, ps.stand.level));
      m.setWrecked(!!ps.stand.wrecked);
      v.root.add(m.group);
      v.stand = m;
      if (v.shownLevel && ps.stand.level > v.shownLevel && !ps.stand.wrecked) m.reveal();
      v.shownLevel = ps.stand.level;
    } else if (ps.stand) building = ps.stand.wrecked ? wreckPile(ps.stand.level, ps.owner as RivalId) : rivalStand(ps.owner as RivalId, ps.stand.level);
    else if (!ps.owner) forSale(v);
    if (building) {
      if (ps.facility?.wrecked) v.root.add(wreckLook(building, (ps.owner ?? 'player') as Owner));
      v.root.add(building); v.root.updateMatrixWorld(true); bakeGroup(building);
    }
    if (p.type !== 'civic') {
      // Fences and gadgets are one clay draw each, kept apart so battle.ts can hide the fence.
      if (ps.defense.tier && ps.defense.fenceHp > 0) { const f = fenceModel(ps.defense.tier, fenceShare(ps)); v.root.add(f); v.root.updateMatrixWorld(true); bakeGroup(f); }
      if (ps.defense.gadgets.length) { const g = gadgetModels(ps.defense.gadgets); v.root.add(g); v.root.updateMatrixWorld(true); bakeGroup(g); }
    }
    // Whoever stands guard here waits by the gate.
    // They stand still, so the whole watch bakes into one draw (battle.ts hides it by name during a fight).
    const guards = Math.min(guardsAt(s, p.id), ps.owner === 'player' ? 6 : 2);
    if (guards > 0) {
      const watch = new THREE.Group();
      watch.name = 'sentry';
      const posted = ps.owner === 'player' ? s.guards.filter((g) => g.post === p.id && g.outUntil <= s.day) : [];
      for (let i = 0; i < guards; i++) {
        // Your guards wear what they carry: gear, level chevrons, and arms crossed on guard.
        const gd = posted[i];
        const fig = makeCrew((ps.owner ?? 'player') as Side, gd ? { weapon: gd.weapon, gear: gd.gear, level: gd.level - 1, onGuard: true, seed: i + 1 } : { weapon: 'clubs', seed: i + 1 }, kit().fig, { scale: 0.95 });
        fig.pose({}, i * 3);
        const g = fig.root;
        g.position.set((i % 2 ? 1 : -1) * (1.6 + Math.floor(i / 2) * 0.7), 0.12, 1.5);
        g.rotation.y = 0;
        watch.add(g);
      }
      v.root.add(watch);
      freezeFigures(watch, kit().fig);
    }
    // A blob shadow the size of whatever stands here, and Bay View's block for this district needs redoing.
    box.setFromObject(v.root);
    if (box.isEmpty()) blobs.setMatrixAt(blobAt.length + v.tile, zero);
    else {
      box.getSize(size); box.getCenter(mid);
      blobs.setMatrixAt(blobAt.length + v.tile, m4.makeScale(Math.min(size.x * 0.62 + 0.4, 9), 1, Math.min(size.z * 0.62 + 0.4, 6)).setPosition(mid.x, 0.2, mid.z));
    }
    blobs.instanceMatrix.needsUpdate = true;
    far.get(p.district)!.dirty = true;
    // Customers queue at the stand's counter, in world space.
    const local = v.stand ? v.stand.servePoint.clone() : new THREE.Vector3(0, 0, 1.6);
    v.serve.copy(v.root.localToWorld(local.setY(0.12)));
    // The tile takes a little of its owner's colour; the border strip carries it in full.
    const facing = p.side === 0 ? 1 : -1;
    ground.set(GROUND[p.district]);
    // Owned tiles take their owner's main colour (the pattern carries the accent); unowned land stays bare Clay cream.
    tint.copy(ground).lerp(new THREE.Color(ps.owner ? TILE_PATTERN[ps.owner as keyof typeof TILE_PATTERN].main : P.cream), ps.owner ? 0.82 : 0.7);
    tiles.setColorAt(v.tile, tint);
    ownerAt[v.tile] = ps.owner;
    patternsDirty = true;
    borders.setMatrixAt(v.tile, ps.owner ? m4.makeTranslation(p.x, 0.16, p.streetZ - facing * (SIDEWALK_OFFSET + 1.5)) : zero);
    borders.setColorAt(v.tile, tint.setHex(ownerColor(ps.owner)));
    tiles.instanceColor!.needsUpdate = true;
    borders.instanceMatrix.needsUpdate = true;
    borders.instanceColor!.needsUpdate = true;
  }

  return {
    views,
    sync(s) {
      for (const v of Object.values(views)) {
        const ps = s.plots[v.plot.id];
        const key = `${ps.owner}|${ps.facility ? ps.facility.kind + ps.facility.level + (ps.facility.wrecked ? 'x' : '') : ''}|${guardsAt(s, v.plot.id)}${ps.owner === 'player' ? s.guards.filter((g) => g.post === v.plot.id).map((g) => g.weapon[0] + g.gear[0] + g.level).join('') : ''}|${ps.stand?.level ?? 0}|${ps.stand?.wrecked ? 1 : 0}|${ps.defense.fenceHp > 0 ? ps.defense.tier : 0}|${fenceShare(ps)}|${ps.defense.gadgets.join(',')}|${ps.stand && gilded(s, ps.stand.level) ? 'g' : ''}`;
        if (key !== v.key) { v.key = key; v.root.updateMatrixWorld(true); rebuild(v, s); }
      }
      borders.computeBoundingSphere();
      if (salesDirty) {
        salesDirty = false;
        let n = 0;
        for (const v of Object.values(views)) {
          if (!saleAt[v.tile]) continue;
          v.root.updateMatrixWorld(true);
          sales.setMatrixAt(n++, v.root.matrixWorld);
        }
        sales.count = n;
        sales.instanceMatrix.needsUpdate = true;
        sales.computeBoundingSphere();
      }
      if (patternsDirty) {
        // Only owned tiles are drawn: each owner's pattern and the outlines are packed instance lists.
        patternsDirty = false;
        let n = 0;
        const counts: Record<string, number> = {};
        PLOTS.forEach((p, i) => {
          const o = ownerAt[i];
          if (!o) return;
          m4.makeTranslation(p.x, 0, p.z);
          outlines.setMatrixAt(n++, m4);
          const m = patterns[o as keyof typeof patterns];
          m.setMatrixAt(counts[o] = (counts[o] ?? 0), m4);
          counts[o]++;
        });
        outlines.count = n;
        outlines.instanceMatrix.needsUpdate = true;
        outlines.computeBoundingSphere();
        for (const [o, m] of Object.entries(patterns)) { m.count = counts[o] ?? 0; m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); }
      }
    },
    update(s, time, ringing = false) {
      // Detail levels: 0 Street View, 1 mid zoom, 2 Bay View (phones run one level simpler).
      const level = (scene.userData.detail as number | undefined) ?? 0;
      flowers.visible = level < 1;
      tufts.visible = level < 2;
      blobs.visible = scene.userData.shadows === false;
      wet.visible = s.weather.kind === 'rainy' || s.weather.kind === 'storm';
      townLife.update(time, level, Math.min(1, K.glow.value / 2.4));
      let merges = 2;
      for (const [id, f] of far) {
        if (level >= 2 && f.dirty && merges > 0) { buildFar(id, f); merges--; }
        const block = level >= 2 && !f.dirty && !!f.mesh;
        if (f.mesh) f.mesh.visible = block;
        for (const v of f.views) v.root.visible = !block;
      }
      for (const v of Object.values(views)) {
        if (!v.stand) continue;
        const st = s.plots[v.plot.id].stand;
        if (!st) continue;
        const cap = STAND_LEVELS[st.level - 1].storage;
        v.stand.update({
          price: st.price, pitcherFill: st.pitcherCups / 10, open: s.phase === 'open', time, hot: s.weather.kind === 'scorcher' || s.weather.kind === 'hot', night: s.phase === 'report', ringing,
          recipe: st.recipe, sweetness: st.sweetness, stars: s.reputation, detail: level,
          stock: { lemons: stock(st, 'lemons') / cap.lemons, sugar: stock(st, 'sugar') / cap.sugar, ice: stock(st, 'ice') / cap.ice, spoiling: stock(st, 'lemons') ? lemonsExpiringTomorrow(s, st) / stock(st, 'lemons') : 0 },
        });
      }
    },
    pick(ndc, camera) {
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.intersectObjects(pads, false)[0];
      return (hit?.object.userData.plot as string) ?? null;
    },
    select(id) {
      ring.visible = !!id;
      if (id) { const p = views[id].plot; ring.position.set(p.x, 0.2, p.z); }
    },
  };
}
