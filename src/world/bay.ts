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
import { createStand, disposeTree, type Stand as StandModel } from './stand.ts';
import { fenceModel, gadgetModels, rivalStand, wreckLook, wreckPile } from './buildings.ts';
import type { Owner } from './clay/standKit.ts';
import { PERIMETERS, STAND_LEVELS } from '../sim/balance.ts';
import { lemonsExpiringTomorrow, priceCeiling, seasonOf, stock } from '../sim/economy.ts';
import { hpShare } from '../sim/damage.ts';
import { fittedOn } from '../sim/specializations.ts';
import { civicBuilding, facilityModel, fieldRows, animatePart, forSaleGeometry, forSaleLabel, hqBuilding, pierModel, tapeBorder, tileOutline, tilePattern, TILE_PATTERN } from './landmarks.ts';
import { createTown, townFootprints } from './town.ts';
import { createLemonWave } from './lemonWave.ts';
import { BOSS_OF, makeBoss, makeCrew, makeDex, type BossId, type Side } from './clay/cast.ts';
import { createFigureBatch } from './clay/figureBatch.ts';
import { crowdDetail, type Figure } from './clay/figure.ts';
import { GLOSS, PAPER, Baker, canvasTex, cap, cone, hash, lcg, lumpy, outline, prep, rbox, slab, sph, tor } from './clay/core.ts';
import { bakeGroup, collectClay } from './clay/bake.ts';
import { clayPlain, kit, onReducedMotion, reflective } from './clay/kit.ts';
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
  /** A crate reveal is playing: re-collect this plot's Bay View clay once it's done (time it's due, -1 = not yet timed). */
  refar?: number;
  /** Who owned the HQ last drawn here, so a capture can play the lemon-clay wave. */
  hqOwner?: string | null;
  /** The player's stand level last drawn here, so an upgrade can play its crate reveal. */
  shownLevel?: number;
  /** Whether the kept stand was built with Lottie (her corner only). */
  standLottie?: boolean;
}

export interface Bay {
  views: Record<string, PlotView>;
  sync(s: GameState): void;
  /** `focus` is where the camera looks: only watches near it are posed each twos step. */
  update(s: GameState, time: number, ringing?: boolean, focus?: THREE.Vector3): void;
  pick(ndc: THREE.Vector2, camera: THREE.Camera): string | null;
  select(id: string | null): void;
  /**
   * Hold a plot as it looked before a fight (`before` is its plot state then): sync leaves it alone until
   * release, so a brawl or a replay never shows its outcome (a wreck, a captured HQ) from the first frame.
   */
  stage(s: GameState, id: string, before: GameState['plots'][string]): void;
  /** Let a staged plot follow the game again (the next sync rebuilds it as it is now). */
  release(id?: string): void;
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

export function createBay(scene: THREE.Scene, phone = false): Bay {
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
  const wet = new THREE.Mesh(wetB.build(), reflective(new THREE.MeshStandardMaterial({ color: '#2a2746', roughness: 0.3, metalness: 0.1, transparent: true, opacity: 0.42, depthWrite: false, envMapIntensity: 1.1, polygonOffset: true, polygonOffsetFactor: -1 })));
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
  // Street View patterns are split by district so each list frustum-culls; Bay View swaps in a set of
  // fewer, fatter motifs and a thicker outline that stay readable when a tile is a few pixels wide.
  type OwnerKey = keyof typeof TILE_PATTERN;
  const OWNERS = Object.keys(TILE_PATTERN) as OwnerKey[];
  const pmesh = (geo: THREE.BufferGeometry, cap: number, name: string) => {
    const m = new THREE.InstancedMesh(geo, K.world, Math.max(1, cap));
    m.count = 0; m.receiveShadow = true; m.name = name;
    scene.add(m);
    return m;
  };
  const nearGeo = Object.fromEntries(OWNERS.map((o) => [o, tilePattern(o, TW, TD, TOP)])) as Record<OwnerKey, THREE.BufferGeometry>;
  const patternSets: { district: DistrictId | 'far'; meshes: Record<OwnerKey, THREE.InstancedMesh> }[] = DISTRICTS.map((d) => {
    const cap = PLOTS.filter((p) => p.district === d.id).length;
    return { district: d.id, meshes: Object.fromEntries(OWNERS.map((o) => [o, pmesh(nearGeo[o], cap, `plot-pattern:${d.id}:${o}`)])) as unknown as Record<OwnerKey, THREE.InstancedMesh> };
  });
  const farPatterns = { district: 'far' as const, meshes: Object.fromEntries(OWNERS.map((o) => [o, pmesh(tilePattern(o, TW, TD, TOP, true), PLOTS.length, `plot-pattern-far:${o}`)])) as unknown as Record<OwnerKey, THREE.InstancedMesh> };
  const farOutlines = pmesh(tileOutline(TW, TD, TOP + 0.03, 0.34), PLOTS.length, 'plot-outlines-far');
  const outlines = new THREE.InstancedMesh(tileOutline(TW, TD, TOP), K.world, PLOTS.length);
  const ownerAt: (string | null)[] = PLOTS.map(() => null);
  let patternsDirty = true, patternLevel = -1;
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
  const lemon = createLemonWave(scene);

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
  // Each plot's Bay View clay is cached (keyed by the plot's key), so a change re-collects only that plot
  // and the district block is just a merge of cached pieces.
  const farGeo = new Map<PlotView, { key: string; geo: THREE.BufferGeometry | null }>();
  function plotFar(v: PlotView) {
    const c = farGeo.get(v);
    if (c && c.key === v.key) return c.geo;
    c?.geo?.dispose();
    const B = new Baker();
    const shown = v.root.visible;
    v.root.visible = true;
    collectClay(v.root, B);
    v.root.visible = shown;
    const geo = B.size ? B.build() : null;
    farGeo.set(v, { key: v.key, geo });
    return geo;
  }
  let idleTick = 0;
  const awayTown = new Set<string>(); // districts far from the focus: the town draws their block chunks
  /** Districts with no plot within this of the camera's focus draw as their Bay View block. */
  const NEAR_DETAIL = 75;
  /** Within a near district, plots farther than this from the focus draw as their lite (Bay View) clay. */
  const PLOT_NEAR = phone ? 42 : 56; // laptops keep full clay farther out, so the swap sits past the Street View frame
  const liteMesh = new Map<PlotView, THREE.Mesh>();
  let liteBuilds = 0;
  /** Make sure a plot's lite mesh is current; at most a few new collections a frame. Returns whether it's ready. */
  function liteBudget(v: PlotView) {
    const cached = farGeo.get(v);
    if ((!cached || cached.key !== v.key) && liteBuilds-- <= 0) return false;
    const geo = plotFar(v);
    let m = liteMesh.get(v);
    // Nothing to collect (an empty lot, or just its FOR SALE tape): drop any old lite mesh and keep the root,
    // which costs next to nothing and keeps the tape words up.
    if (!geo) { if (m) { m.removeFromParent(); liteMesh.delete(v); } return false; }
    if (!m) {
      m = new THREE.Mesh(geo, K.world);
      m.name = 'plot-lite';
      m.castShadow = m.receiveShadow = true;
      m.matrixAutoUpdate = false;
      scene.add(m);
      liteMesh.set(v, m);
    } else if (m.geometry !== geo) m.geometry = geo;
    return true;
  }
  /** Drop a plot's cached Bay View clay and have its district re-merged (a reveal has finished). */
  function refar(v: PlotView) {
    farGeo.get(v)?.geo?.dispose();
    farGeo.delete(v);
    far.get(v.plot.district)!.dirty = true;
    v.refar = undefined;
  }
  addEventListener('stand-revealed', (e) => {
    const g = (e as CustomEvent<{ stand: THREE.Object3D }>).detail?.stand;
    for (const v of viewList) if (v.stand?.group === g) refar(v);
  });
  function buildFar(id: DistrictId, f: { views: PlotView[]; mesh: THREE.Mesh | null; dirty: boolean }) {
    const B = new Baker();
    for (const v of f.views) { const g = plotFar(v); if (g) B.raw(g); }
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
  const viewList = Object.values(views);
  const farList = [...far];
  const pads = viewList.map((v) => v.pad);
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

  /** A stand's HP share as the damage step it shows: torn at 75%, sign down at 50%, slumped at 25%. */
  const hpStep = (ps: GameState['plots'][string]) => { const h = hpShare(ps); return h > 0.75 ? 1 : h > 0.5 ? 0.75 : h > 0.25 ? 0.5 : 0.25; };
  let synced = false;
  let stagings = 0;
  const held = new Set<string>(); // plots staged as they were before the fight on screen
  const movers = new Map<PlotView, THREE.Object3D[]>();
  let moverF = -1;
  // Posted guards stay alive: every watch in town draws through one batch and poses on twos
  // (a bouncy bob, blinks, a look up and down the street; Dex scans in held beats).
  const sentries = createFigureBatch(K.fig, { instances: 256, vertices: 80_000, indices: 240_000 });
  sentries.mesh.name = 'sentry-batch';
  scene.add(sentries.mesh);
  interface Posted { fig: Figure; i: number; dex: boolean; goose: boolean; crossed: boolean; x: number; boss?: BossId }
  const watches = new Map<PlotView, Posted[]>();
  let calm = 1;
  onReducedMotion((on) => { calm = on ? 0.25 : 1; });
  /** Watches farther than this from the camera's focus keep their last pose. */
  const POSE_NEAR = 60;
  let fullSyncF = -1e9, fullSyncLevel = -1;
  /** How long a pier from this plot must be to reach past the shore (12 if the water isn't behind it). */
  function reachOf(v: PlotView) {
    const back = v.plot.side === 0 ? -1 : 1; // the plot's back points away from its street
    const z = v.root.position.z;
    const toShore = back > 0 ? SEA_Z + 5 - z : -Infinity;
    return toShore > 0 && toShore < 30 ? toShore : 12;
  }
  /** A dock on the east shore (the Yacht Marina) runs its pier east from the plot's middle, out past SEA_X. */
  function eastReach(v: PlotView) {
    const back = v.plot.side === 0 ? -1 : 1;
    if (back > 0 && SEA_Z + 5 - v.root.position.z < 30) return null; // the south shore is behind it
    const toShore = SEA_X + 6 - v.root.position.x;
    return toShore > 0 && toShore < 40 ? toShore : null;
  }
  function turnEast(o: THREE.Object3D, v: PlotView, len: number) {
    o.rotation.y = v.plot.side === 0 ? -Math.PI / 2 : Math.PI / 2;
    o.position.z = -2.5;
    // vip.ts moors a ship at the pier's tip: a world point read from userData.moor
    v.root.updateMatrixWorld(true);
    o.updateMatrix();
    o.userData.moor = new THREE.Vector3(0, 0.4, -len).applyMatrix4(o.matrix).applyMatrix4(v.root.matrixWorld);
    return o;
  }
  function rebuild(v: PlotView, s: GameState) {
    const ps = s.plots[v.plot.id];
    // The player's stand lives on across rebuilds (guards, fences and gadgets change far more often than the stand).
    const lottie = v.plot.id === LOTTIES_CORNER;
    const keepStand = v.stand && ps.stand && ps.owner === 'player' && v.standLottie === lottie ? v.stand : undefined;
    keepStand?.group.removeFromParent();
    if (v.stand && !keepStand) v.stand.dispose();
    // Merged geometry is made fresh for each build: free its GPU copy (shared model parts stay).
    const owned: THREE.Object3D[] = [];
    v.root.traverse((o) => {
      if (o.name === 'baked' || o.userData.disposable) (o as THREE.Mesh).geometry.dispose();
      if (o.userData.ownFar) (o.userData.far as THREE.BufferGeometry).dispose();
      if (o.userData.ownTree) owned.push(o);
    });
    // Rival stands, fences, gadgets and wrecks are built fresh each time: free all of their GPU copies.
    for (const o of owned) disposeTree(o);
    movers.delete(v);
    for (const g of watches.get(v) ?? []) sentries.untrack(g.fig.root);
    watches.delete(v);
    v.root.clear();
    if (saleAt[v.tile]) { saleAt[v.tile] = false; salesDirty = true; }
    v.stand = undefined;
    const shown = v.shownLevel;
    v.shownLevel = undefined;
    const p = v.plot;
    let building: THREE.Object3D | null = null;
    if (p.type === 'civic') building = civicBuilding(p.name);
    else if (p.type === 'hq') {
      building = hqBuilding(ps.owner as RivalId | 'player' | null, p.name);
      if (synced && ps.owner === 'player' && v.hqOwner !== undefined && v.hqOwner !== 'player') lemon.capture(v.root.position.x, p.z, 10);
      v.hqOwner = ps.owner;
    }
    else if (ps.facility?.kind === 'clubhouse') building = facilityModel('clubhouse', ps.facility.level, ps.owner);
    else if (ps.facility?.kind === 'billboard') building = facilityModel('billboard', ps.facility.level, ps.owner);
    else if (ps.facility) {
      const east = ps.facility.kind === 'pier' ? eastReach(v) : null;
      building = facilityModel(ps.facility.kind, ps.facility.level, ps.owner, east ?? reachOf(v));
      if (east) turnEast(building, v, Math.max(12 + ps.facility.level * 6, east));
    }
    else if (p.type === 'field') { v.root.add(bakeGroup(fieldRows(p.name))); if (!ps.owner) forSale(v); }
    else if (p.type === 'dock') { const east = eastReach(v), pm = pierModel(east ?? reachOf(v)); if (east) turnEast(pm, v, east); v.root.add(bakeGroup(pm)); if (!ps.owner) forSale(v); }
    else if (ps.stand && ps.owner === 'player') {
      const m = keepStand ?? createStand({ lottie, level: ps.stand.level, gilded: gilded(s, ps.stand.level) });
      m.setLevel(ps.stand.level, gilded(s, ps.stand.level));
      // Laid Back's Busted stand stays up, battered and taped shut; only a real Wreck is a pile.
      m.setWrecked(!!ps.stand.wrecked && !ps.busted);
      m.setBusted(!!ps.busted);
      m.setDamage(hpStep(ps));
      m.setSpecs(fittedOn(ps.stand));
      v.root.add(m.group);
      v.stand = m;
      v.standLottie = lottie;
      // An upgrade plays the crate reveal, and so does a brand-new stand once the game is under way.
      const fresh = shown === undefined && synced;
      if ((fresh || (shown && ps.stand.level > shown)) && !ps.stand.wrecked) { m.reveal(); v.refar = -1; }
      v.shownLevel = ps.stand.level;
    } else if (ps.stand) {
      building = ps.stand.wrecked ? wreckPile(ps.stand.level, ps.owner as RivalId) : rivalStand(ps.owner as RivalId, ps.stand.level, hpStep(ps), s.weather.kind === 'storm');
    } else if (!ps.owner) forSale(v);
    if (keepStand && v.stand !== keepStand) keepStand.dispose();
    if (building) {
      if (ps.facility?.wrecked) v.root.add(wreckLook(building, (ps.owner ?? 'player') as Owner));
      v.root.add(building); v.root.updateMatrixWorld(true); bakeGroup(building);
    }
    if (p.type !== 'civic') {
      // Fences and gadgets are one clay draw each, kept apart so battle.ts can hide the fence.
      if (ps.defense.tier && ps.defense.fenceHp > 0) { const f = fenceModel(ps.defense.tier, fenceShare(ps), (ps.owner ?? 'player') as Owner); v.root.add(f); v.root.updateMatrixWorld(true); bakeGroup(f); }
      if (ps.defense.gadgets.length) { const g = gadgetModels(ps.defense.gadgets, (ps.owner ?? 'player') as Owner); v.root.add(g); v.root.updateMatrixWorld(true); bakeGroup(g); }
    }
    // Whoever stands guard here waits by the gate (battle.ts hides the watch by name during a fight).
    const guards = Math.min(guardsAt(s, p.id), ps.owner === 'player' ? 6 : 2);
    if (guards > 0) {
      const watch = new THREE.Group();
      watch.name = 'sentry';
      const posted = ps.owner === 'player' ? s.guards.filter((g) => g.post === p.id && g.outUntil <= s.day) : [];
      const goose = ps.defense.gadgets.includes('goose');
      const list: Posted[] = [];
      for (let i = 0; i < guards; i++) {
        // Your guards wear what they carry: gear, level chevrons, taped fists or a weapon by the leg, arms crossed.
        // Dex Moody is drawn as himself: lanky, in his lemon guard vest.
        const gd = posted[i];
        const look = gd ? { weapon: gd.weapon, gear: gd.gear, level: gd.level - 1, role: gd.specialty, onGuard: true, seed: i + 1 } : { weapon: 'clubs' as const, seed: i + 1 };
        const dex = gd?.name === 'Dex Moody';
        const fig = dex ? makeDex(look, K.fig, { scale: 0.95, detail: crowdDetail() }) : makeCrew((ps.owner ?? 'player') as Side, look, K.fig, { scale: 0.95, detail: crowdDetail() });
        const g = fig.root;
        const x = (i % 2 ? 1 : -1) * (1.6 + Math.floor(i / 2) * 0.7);
        g.position.set(x, 0.12, 1.5);
        g.rotation.y = 0;
        fig.pose({}, i * 3);
        watch.add(g);
        list.push({ fig, i, dex, goose, crossed: !!fig.sp.crossed, x });
      }
      v.root.add(watch);
      for (const g of list) sentries.track(g.fig.root);
      watches.set(v, list);
      fullSyncF = -1e9; // draw the new watch where it stands on the next step
      // Bay View: each guard is a dab of clay in the owner's colour (the full figures cost ~11k triangles a plot).
      const FB = new Baker();
      for (let i = 0; i < guards; i++) FB.add(cap(0.42, 0.9, 2, 6), ownerColor(ps.owner), { p: [(i % 2 ? 1 : -1) * (1.6 + Math.floor(i / 2) * 0.7), 0.95, 1.5] });
      watch.userData.far = FB.build();
      watch.userData.ownFar = true;
    }
    // Each boss holds court in front of their HQ (spec mood scene: "Brock flexes from the Pier").
    if (p.type === 'hq' && ps.owner && ps.owner !== 'player' && s.rivals[ps.owner as RivalId]?.alive) {
      const id = BOSS_OF[ps.owner as keyof typeof BOSS_OF];
      const fig = makeBoss(id, K.fig, { detail: crowdDetail() });
      const court = new THREE.Group();
      court.name = 'boss';
      fig.root.position.set(0, 0.12, 2.4);
      court.add(fig.root);
      v.root.add(court);
      const list = watches.get(v) ?? [];
      list.push({ fig, i: 7, dex: false, goose: false, crossed: false, x: 0, boss: id });
      sentries.track(fig.root);
      watches.set(v, list);
      fullSyncF = -1e9;
    }
    // Moving parts (clock hands, windmill sails, windsocks, cranes) pose on twos in update().
    const parts: THREE.Object3D[] = [];
    v.root.traverse((o) => { if (/^(spin|sway):/.test(o.name)) parts.push(o); });
    if (parts.length) movers.set(v, parts);
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
    // Owners' tiles take their main colour outright; Sourwood's plum is lifted so it never reads as road.
    if (ps.owner) tint.set(ps.owner === 'sourwood' ? '#4E1F63' : TILE_PATTERN[ps.owner as keyof typeof TILE_PATTERN].main);
    else tint.copy(ground).lerp(new THREE.Color(P.cream), 0.7);
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
    stage(s, id, before) {
      const v = views[id];
      if (!v) return;
      held.add(id);
      v.key = `staged:${++stagings}`; // unique, so no cached Bay View clay is reused
      v.root.updateMatrixWorld(true);
      rebuild(v, { ...s, plots: { ...s.plots, [id]: before } });
    },
    release(id) { if (id) held.delete(id); else held.clear(); },
    sync(s) {
      for (const v of viewList) {
        if (held.has(v.plot.id)) continue; // staged for a fight on screen
        const ps = s.plots[v.plot.id];
        const key = `${ps.owner}|${ps.facility ? ps.facility.kind + ps.facility.level + (ps.facility.wrecked ? 'x' : '') : ''}|${guardsAt(s, v.plot.id)}${ps.owner === 'player' ? s.guards.filter((g) => g.post === v.plot.id).map((g) => g.weapon[0] + g.gear[0] + g.level + (g.specialty?.[0] ?? '')).join('') : ''}|${ps.stand?.level ?? 0}|${ps.stand?.wrecked ? 1 : 0}${ps.busted ? 'b' : ''}${ps.stand ? hpStep(ps) : ''}|${ps.defense.fenceHp > 0 ? ps.defense.tier : 0}|${fenceShare(ps)}|${ps.defense.gadgets.join(',')}|${ps.stand && gilded(s, ps.stand.level) ? 'g' : ''}${ps.owner === 'player' ? fittedOn(ps.stand).join(',') : ''}${ps.stand && ps.owner !== 'player' && ps.stand.level <= 2 && s.weather.kind === 'storm' ? 's' : ''}`;
        if (key !== v.key) { v.key = key; v.root.updateMatrixWorld(true); rebuild(v, s); }
      }
      synced = true;
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
        for (const set of [...patternSets, farPatterns]) for (const m of Object.values(set.meshes)) m.count = 0;
        PLOTS.forEach((p, i) => {
          const o = ownerAt[i] as OwnerKey | null;
          if (!o) return;
          m4.makeTranslation(p.x, 0, p.z);
          outlines.setMatrixAt(n, m4);
          farOutlines.setMatrixAt(n++, m4);
          for (const m of [patternSets.find((x) => x.district === p.district)!.meshes[o], farPatterns.meshes[o]]) m.setMatrixAt(m.count++, m4);
        });
        for (const m of [outlines, farOutlines]) { m.count = n; m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); }
        for (const set of [...patternSets, farPatterns]) for (const m of Object.values(set.meshes)) { m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); }
      }
    },
    update(s, time, ringing = false, focus) {
      // Detail levels: 0 Street View, 1 mid zoom, 2 Bay View (phones run one level simpler).
      const level = (scene.userData.detail as number | undefined) ?? 0;
      flowers.visible = level < 1;
      tufts.visible = level < 2;
      blobs.visible = scene.userData.shadows === false;
      wet.visible = s.weather.kind === 'rainy' || s.weather.kind === 'storm';
      if (level !== patternLevel) {
        patternLevel = level;
        for (const set of patternSets) for (const m of Object.values(set.meshes)) m.visible = level < 2;
        outlines.visible = level < 2;
        for (const m of Object.values(farPatterns.meshes)) m.visible = level >= 2;
        farOutlines.visible = level >= 2;
      }
      if (s.outcome?.result === 'won' && s.outcome.how === 'domination') { const c = PLOTS.find((q) => q.id === LOTTIES_CORNER)!; lemon.dominate(c.x, c.z); }
      lemon.update(time);
      const mf = Math.floor(time * 12);
      sentries.setVisible(level < 2);
      if (mf !== moverF && level < 2) {
        moverF = mf;
        const minute = s.phase === 'prep' ? 7 * 60 : s.minute;
        for (const parts of movers.values()) for (const o of parts) animatePart(o, mf / 12, minute);
        // Only the watches near the camera move; the rest hold their last pose (late game posts 150+ guards).
        const near: THREE.Object3D[] = [];
        // (a plot drawn as its lite clay hides its root, and its watches with it: no need to pose those)
        for (const [v, list] of watches) {
          if (!v.root.visible || (focus && Math.hypot(v.plot.x - focus.x, v.plot.z - focus.z) > POSE_NEAR)) continue;
          for (const g of list) near.push(g.fig.root);
        }
        for (const [v, list] of watches) for (const g of list) {
          if (!v.root.visible || (focus && Math.hypot(v.plot.x - focus.x, v.plot.z - focus.z) > POSE_NEAR)) continue;
          const t = mf / 12 + g.i * 0.73, root = g.fig.root;
          if (g.dex) {
            // Dex scans the street in held beats, and hops sideways when the goose waddles by.
            const beat = Math.floor(t / 1.6);
            const yaw = [-0.6, 0, 0.6, 0, 0.35, -0.35][Math.floor(hash(beat, 5) * 6)] * calm;
            // the goose waddles past every few seconds: a sideways hop out of its way, and later back
            const c = t % 9, out = c < 4.5;
            const u = Math.min(1, (out ? c : c - 4.5) / 0.6);
            const k = g.goose && u < 1 ? Math.sin(u * Math.PI) : 0;
            const side = g.goose ? (out ? u : 1 - u) * 0.35 * calm : 0;
            root.position.x = g.x + side; // away from Honkers by the gate (plot-local x -3.3), never into the next guard
            g.fig.pose({ lift: k * 0.22 * calm, headYaw: k > 0 ? 0 : yaw, headTilt: -k * 0.1 }, mf);
          } else if (g.boss) {
            // the boss's signature idle: Brock's double-bicep flex, Vera's cane tap on the beat, the rest look down their street
            const tap = mf % 12 < 3;
            g.fig.pose({ sq: Math.sin(t * 2.2) > 0.7 ? 0.03 * calm : 0, headYaw: Math.sin(t * 0.35) * 0.35 * calm, aR: g.boss === 'vera' ? [tap ? 0.3 : 0.12, -0.1] : undefined }, mf);
            if (g.boss === 'brock') g.fig.flex(true);
          } else {
            const b = Math.abs(Math.sin(t * 3));
            g.fig.pose({ lift: b * 0.03 * calm, sq: (1 - b) * 0.04 * calm, headYaw: Math.sin(t * 0.45) * 0.3 * calm, aR: g.crossed ? undefined : [-0.35, -0.12] }, mf);
          }
        }
        // far watches catch up now and then (and whenever the zoom level changes), so they show where they stand
        const full = !focus || mf - fullSyncF >= 24 || level !== fullSyncLevel;
        if (full) { fullSyncF = mf; fullSyncLevel = level; }
        sentries.sync(full ? undefined : near);
      }
      // One district merge a frame in Bay View, and one every half second while zoomed in (idle time),
      // so zooming out never waits on a pile of merges; a stale block stays up until its new one is ready.
      // A finished reveal (or one skipped with a tap) gets its plot re-collected for Bay View.
      for (const v of viewList) if (v.refar !== undefined) { if (v.refar < 0) v.refar = time + 12; else if (time > v.refar) refar(v); }
      // Distance-based detail: districts whose nearest plot is far from where the camera looks draw as
      // their Bay View block even when zoomed in (a low Street View pitch or Gull Flight sees the whole bay).
      const fx = focus?.x ?? 0, fz = focus?.z ?? 0;
      let merges = level >= 2 || ++idleTick % 30 === 0 ? 1 : 0, awayBudget = 1;
      liteBuilds = 2;
      awayTown.clear();
      for (const [id, f] of farList) {
        const away = level >= 2 || (!!focus && f.views.every((v) => Math.hypot(v.plot.x - fx, v.plot.z - fz) > NEAR_DETAIL));
        if (away) awayTown.add(id);
        if (f.dirty && (merges > 0 || (away && awayBudget > 0))) { buildFar(id, f); if (merges > 0) merges--; else awayBudget--; }
        const block = away && !!f.mesh;
        if (f.mesh) f.mesh.visible = block;
        for (const v of f.views) {
          // In a district near the camera, plots beyond PLOT_NEAR draw as their own cached Bay View clay (one draw each).
          const lite = !block && level < 2 && !!focus && Math.hypot(v.plot.x - fx, v.plot.z - fz) > PLOT_NEAR && v.refar === undefined && !held.has(v.plot.id) && liteBudget(v);
          v.root.visible = !block && !lite;
          const m = liteMesh.get(v);
          if (m) m.visible = lite;
        }
      }
      townLife.update(time, level, Math.min(1, K.glow.value / 2.4), seasonOf(s.day), s.weather.kind === 'storm', awayTown);
      for (const v of viewList) {
        if (!v.stand) continue;
        const st = s.plots[v.plot.id].stand;
        if (!st) continue;
        const cap = STAND_LEVELS[st.level - 1].storage;
        v.stand.update({
          price: st.price, pitcherFill: st.pitcherCups / 10, open: s.phase === 'open', time, hot: s.weather.kind === 'scorcher' || s.weather.kind === 'hot', night: s.phase === 'report' || s.phase === 'night', ringing,
          storm: s.weather.kind === 'storm', scorcher: s.weather.kind === 'scorcher',
          recipe: st.recipe, sweetness: st.sweetness, stars: s.reputation, detail: level, ceiling: priceCeiling(s, v.plot.id),
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
