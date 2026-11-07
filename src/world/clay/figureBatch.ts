// One draw for a whole crowd. The spec wants each body kind drawn as one
// batch: a clay Figure is about 8 meshes, so 150 walkers as plain meshes
// would cost over a thousand draws. Instead every walker keeps its ordinary
// Figure rig (so hopPose, idlePose, react(), props and bubbles work on it
// unchanged), its meshes move to a hidden layer, and on twos each mesh's
// world matrix is copied into one BatchedMesh. Blinks swap the head's
// geometry; that becomes a geometry swap on the batch instance.
import * as THREE from 'three';
import { Baker } from './core.ts';

/** Meshes on this layer are never drawn by the camera or the shadow pass. */
export const PROXY_LAYER = 31;

interface Part { mesh: THREE.Mesh; id: number; geo: THREE.BufferGeometry }
interface Tracked { root: THREE.Object3D; parts: Part[] }

export interface FigureBatch {
  /** The one mesh to add to the scene. */
  readonly mesh: THREE.BatchedMesh;
  /** Draw every mesh under `root` that uses the batch's material through the batch. */
  track(root: THREE.Object3D): void;
  /** Stop drawing a tracked figure (its instances are freed for the next one). */
  untrack(root: THREE.Object3D): void;
  /** Copy poses into the batch. Call after the rigs are posed (on twos is enough). */
  sync(): void;
  /** Hide the whole batch (Bay View draws specks instead). */
  setVisible(on: boolean): void;
  stats(): { instances: number; geometries: number; vertices: number };
}

export function createFigureBatch(material: THREE.Material, opts: { instances?: number; vertices?: number; indices?: number } = {}): FigureBatch {
  let maxInst = opts.instances ?? 1024;
  let maxVerts = opts.vertices ?? 400_000;
  let maxIdx = opts.indices ?? 1_200_000;
  const mesh = new THREE.BatchedMesh(maxInst, maxVerts, maxIdx, material);
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false; // instances move every step; cull per instance instead
  mesh.perObjectFrustumCulled = true;
  mesh.sortObjects = false;
  mesh.name = 'figure-batch';
  const geoIds = new Map<THREE.BufferGeometry, number>();
  const tracked: Tracked[] = [];
  let usedVerts = 0, usedIdx = 0, instances = 0;

  function geometryId(geo: THREE.BufferGeometry): number {
    let id = geoIds.get(geo);
    if (id !== undefined) return id;
    const v = geo.attributes.position.count;
    const i = geo.index ? geo.index.count : v;
    if (usedVerts + v > maxVerts || usedIdx + i > maxIdx) {
      maxVerts = Math.max(maxVerts * 2, usedVerts + v);
      maxIdx = Math.max(maxIdx * 2, usedIdx + i);
      mesh.setGeometrySize(maxVerts, maxIdx);
    }
    id = mesh.addGeometry(geo);
    usedVerts += v; usedIdx += i;
    geoIds.set(geo, id);
    return id;
  }

  function visibleChain(o: THREE.Object3D | null): boolean {
    for (; o; o = o.parent) if (!o.visible) return false;
    return true;
  }

  return {
    mesh,
    track(root) {
      const parts: Part[] = [];
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh || m.material !== material) return;
        if (instances >= maxInst) { maxInst *= 2; mesh.setInstanceCount(maxInst); }
        const id = mesh.addInstance(geometryId(m.geometry));
        instances++;
        m.layers.set(PROXY_LAYER);
        parts.push({ mesh: m, id, geo: m.geometry });
      });
      tracked.push({ root, parts });
    },
    untrack(root) {
      const i = tracked.findIndex((t) => t.root === root);
      if (i < 0) return;
      for (const p of tracked[i].parts) { mesh.deleteInstance(p.id); p.mesh.layers.set(0); instances--; }
      tracked.splice(i, 1);
    },
    sync() {
      for (const t of tracked) {
        const on = visibleChain(t.root);
        if (on) t.root.updateMatrixWorld(true);
        for (const p of t.parts) {
          const vis = on && visibleChain(p.mesh);
          mesh.setVisibleAt(p.id, vis);
          if (!vis) continue;
          if (p.mesh.geometry !== p.geo) {
            p.geo = p.mesh.geometry;
            mesh.setGeometryIdAt(p.id, geometryId(p.geo));
          }
          mesh.setMatrixAt(p.id, p.mesh.matrixWorld);
        }
      }
    },
    setVisible(on) { mesh.visible = on; },
    stats() { return { instances, geometries: geoIds.size, vertices: usedVerts }; },
  };
}

/**
 * Freeze posed figures that never move (guards at a post) into one mesh:
 * every visible figure part under `group` merges into a single draw, and the
 * rigs are dropped. Returns the merged mesh (added to `group`).
 */
export function freezeFigures(group: THREE.Object3D, material: THREE.Material): THREE.Mesh | null {
  group.updateMatrixWorld(true);
  const inv = group.matrixWorld.clone().invert();
  const B = new Baker();
  const m4 = new THREE.Matrix4();
  const visible = (o: THREE.Object3D | null): boolean => { for (; o && o !== group; o = o.parent) if (!o.visible) return false; return true; };
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.material === material && visible(m)) B.raw(m.geometry, m4.multiplyMatrices(inv, m.matrixWorld));
  });
  if (!B.size) return null;
  for (const c of [...group.children]) group.remove(c);
  const mesh = new THREE.Mesh(B.build(), material);
  mesh.castShadow = true;
  mesh.name = 'baked-figures';
  group.add(mesh);
  return mesh;
}
