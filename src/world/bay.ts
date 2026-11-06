// Citrine Bay's streets and plots. Static parts (roads, sidewalks, plot
// pads, scenery) are built once; each plot's building is rebuilt only when
// its owner or stand level changes.
import * as THREE from 'three/webgpu';
import {
  DISTRICTS, FACTIONS, LOTTIES_CORNER, PLAYER_COLOR, PLOT_SPACING, PLOTS, STREET_HALF,
  type GameState, type Plot, type RivalId,
} from '../sim/economy.ts';
import { mat, SEA_X, SEA_Z, tree } from './scene.ts';
import { CROSS_STREETS_Z, WEST_AVENUE_X } from '../sim/map.ts';
import { createStand, type Stand as StandModel } from './stand.ts';
import { civicBuilding, facilityModel, fenceModel, fieldRows, forSaleSign, hqBuilding, pierModel, rivalStand, wreckLook } from './buildings.ts';
import { makePerson } from './people.ts';

export const SIDEWALK_OFFSET = STREET_HALF + 1.1;
/** How far the stand model's origin sits from the street center. */
const STAND_SETBACK = 7.5;

export interface PlotView {
  plot: Plot;
  root: THREE.Group;
  pad: THREE.Mesh;
  border: THREE.Mesh;
  key: string;
  stand?: StandModel;
  /** World-space spot where customers queue. */
  serve: THREE.Vector3;
  sidewalkZ: number;
}

export interface Bay {
  views: Record<string, PlotView>;
  sync(s: GameState): void;
  update(s: GameState, time: number): void;
  pick(ndc: THREE.Vector2, camera: THREE.Camera): string | null;
  select(id: string | null): void;
}

const ownerColor = (owner: string | null) =>
  owner === 'player' ? PLAYER_COLOR : owner ? FACTIONS[owner as RivalId].color : 0xffffff;

function guardsAt(s: GameState, id: string): number {
  const ps = s.plots[id];
  if (!ps.stand && !ps.facility) return 0;
  if (ps.owner === 'player') return s.guards.filter((g) => g.post === id && g.outUntil <= s.day).length;
  return ps.garrison ?? 0;
}

export function createBay(scene: THREE.Scene): Bay {
  const roadMat = mat(0x55575c), walkMat = mat(0xd6d2c8), dashMat = mat(0xf4f1d0);
  let seed = 4242;
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  // District streets with sidewalks and lane dashes.
  for (const d of DISTRICTS) {
    const x0 = d.origin[0] - 6, x1 = d.origin[0] + d.cols * PLOT_SPACING + 6;
    const len = x1 - x0, cx = (x0 + x1) / 2, z = d.origin[1];
    const road = new THREE.Mesh(new THREE.PlaneGeometry(len, STREET_HALF * 2), roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(cx, 0.02, z);
    road.receiveShadow = true;
    scene.add(road);
    for (const side of [-1, 1]) {
      const walk = new THREE.Mesh(new THREE.BoxGeometry(len, 0.12, 2.2), walkMat);
      walk.position.set(cx, 0.06, z + side * SIDEWALK_OFFSET);
      walk.receiveShadow = true;
      scene.add(walk);
    }
    const dashes = new THREE.InstancedMesh(new THREE.PlaneGeometry(2, 0.15), dashMat, Math.ceil(len / 4));
    const m = new THREE.Matrix4();
    for (let i = 0; i < dashes.count; i++) {
      m.makeRotationX(-Math.PI / 2).setPosition(x0 + 2 + i * 4, 0.03, z);
      dashes.setMatrixAt(i, m);
    }
    scene.add(dashes);
    // District ground tint under the plots.
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(len, 36), mat(d.ground));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(cx, 0.01, z);
    ground.receiveShadow = true;
    scene.add(ground);
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
    const road = new THREE.Mesh(new THREE.PlaneGeometry(r.w, r.d), roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(r.x, 0.015, r.z);
    road.receiveShadow = true;
    scene.add(road);
  }

  // Trees in the gaps.
  for (let i = 0; i < 260; i++) {
    const x = -178 + rng() * (SEA_X - 10 + 178), z = -125 + rng() * (SEA_Z - 10 + 125);
    const nearPlot = PLOTS.some((p) => Math.abs(p.x - x) < 8 && Math.abs(p.z - z) < 8)
      || DISTRICTS.some((d) => Math.abs(d.origin[1] - z) < 7 && x > d.origin[0] - 8 && x < d.origin[0] + d.cols * PLOT_SPACING + 8)
      || roads.some((r) => Math.abs(r.x - x) < r.w / 2 + 2 && Math.abs(r.z - z) < r.d / 2 + 2);
    if (nearPlot) continue;
    const t = tree(rng);
    t.position.set(x, 0, z);
    scene.add(t);
  }

  // Plots.
  const views: Record<string, PlotView> = {};
  const padGeo = new THREE.PlaneGeometry(PLOT_SPACING - 1, 10);
  const borderGeo = new THREE.PlaneGeometry(PLOT_SPACING - 1, 0.5);
  for (const p of PLOTS) {
    const root = new THREE.Group();
    const facing = p.side === 0 ? 1 : -1;
    root.position.set(p.x, 0, p.streetZ - facing * STAND_SETBACK);
    root.rotation.y = p.side === 0 ? 0 : Math.PI;
    scene.add(root);
    const pad = new THREE.Mesh(padGeo, new THREE.MeshStandardMaterial({ color: 0x8fca6c, roughness: 1 }));
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(p.x, 0.025, p.z);
    pad.receiveShadow = true;
    pad.userData.plot = p.id;
    scene.add(pad);
    const border = new THREE.Mesh(borderGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    border.rotation.x = -Math.PI / 2;
    border.position.set(p.x, 0.13, p.streetZ - facing * (SIDEWALK_OFFSET + 1.4));
    scene.add(border);
    const sidewalkZ = p.streetZ - facing * SIDEWALK_OFFSET;
    views[p.id] = { plot: p, root, pad, border, key: '', serve: new THREE.Vector3(p.x, 0.12, sidewalkZ - facing * 0.3), sidewalkZ };
  }

  const ring = new THREE.Mesh(new THREE.RingGeometry(6.2, 6.9, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }));
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  scene.add(ring);

  const raycaster = new THREE.Raycaster();
  const pads = Object.values(views).map((v) => v.pad);

  function rebuild(v: PlotView, s: GameState) {
    const ps = s.plots[v.plot.id];
    v.root.clear();
    v.stand = undefined;
    const p = v.plot;
    if (p.type === 'civic') v.root.add(civicBuilding(p.name));
    else if (p.type === 'hq') v.root.add(hqBuilding(ps.owner as RivalId | 'player', p.name));
    else if (ps.facility) v.root.add(facilityModel(ps.facility.kind, ps.facility.level));
    else if (p.type === 'field') { v.root.add(fieldRows()); if (!ps.owner) v.root.add(forSaleSign()); }
    else if (p.type === 'dock') { v.root.add(pierModel()); if (!ps.owner) v.root.add(forSaleSign()); }
    else if (ps.stand && ps.owner === 'player') {
      const m = createStand({ lottie: p.id === LOTTIES_CORNER });
      m.setLevel(ps.stand.level);
      v.root.add(m.group);
      v.stand = m;
    } else if (ps.stand) v.root.add(rivalStand(ps.owner as RivalId, ps.stand.level));
    else if (!ps.owner) v.root.add(forSaleSign());
    if ((ps.stand?.wrecked || ps.facility?.wrecked) && v.root.children[0]) v.root.add(wreckLook(v.root.children[0]));
    if (ps.defense.tier && ps.defense.fenceHp > 0 && p.type !== 'civic') v.root.add(fenceModel(ps.defense.tier));
    // Whoever stands guard here waits by the gate.
    const guards = guardsAt(s, p.id);
    for (let i = 0; i < Math.min(guards, ps.owner === 'player' ? 6 : 2); i++) {
      const g = makePerson(ps.owner === 'player' ? PLAYER_COLOR : FACTIONS[ps.owner as RivalId].color, 0x264653);
      g.position.set((i % 2 ? 1 : -1) * (1.6 + Math.floor(i / 2) * 0.7), 0.12, 1.5);
      g.rotation.y = 0;
      g.scale.setScalar(0.95);
      g.name = 'sentry';
      v.root.add(g);
    }
    // Customers queue at the stand's counter, in world space.
    const local = v.stand ? v.stand.servePoint.clone() : new THREE.Vector3(0, 0, 1.6);
    v.serve.copy(v.root.localToWorld(local.setY(0.12)));
    const color = ownerColor(ps.owner);
    (v.border.material as THREE.MeshBasicMaterial).color.setHex(color);
    v.border.visible = !!ps.owner;
    (v.pad.material as THREE.MeshStandardMaterial).color.setHex(ps.owner === 'player' ? 0xa6d97a : ps.owner ? 0x8fca6c : 0x9fcf7f);
  }

  return {
    views,
    sync(s) {
      for (const v of Object.values(views)) {
        const ps = s.plots[v.plot.id];
        const key = `${ps.owner}|${ps.facility ? ps.facility.kind + ps.facility.level + (ps.facility.wrecked ? 'x' : '') : ''}|${guardsAt(s, v.plot.id)}|${ps.stand?.level ?? 0}|${ps.stand?.wrecked ? 1 : 0}|${ps.defense.fenceHp > 0 ? ps.defense.tier : 0}`;
        if (key !== v.key) { v.key = key; v.root.updateMatrixWorld(true); rebuild(v, s); }
      }
    },
    update(s, time) {
      for (const v of Object.values(views)) {
        if (!v.stand) continue;
        const st = s.plots[v.plot.id].stand;
        if (!st) continue;
        v.stand.update({ price: st.price, pitcherFill: st.pitcherCups / 10, open: s.phase === 'open', time });
      }
    },
    pick(ndc, camera) {
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.intersectObjects(pads, false)[0];
      return (hit?.object.userData.plot as string) ?? null;
    },
    select(id) {
      ring.visible = !!id;
      if (id) { const p = views[id].plot; ring.position.set(p.x, 0.15, p.z); }
    },
  };
}
