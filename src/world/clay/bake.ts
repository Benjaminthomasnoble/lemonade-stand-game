// Bake a model built from separate meshes into one clay draw: every opaque,
// untextured mesh becomes vertex-coloured clay merged into a single geometry
// on the shared world material. Textured labels stay as they are and can fade
// out with distance (a THREE.LOD), so Bay View costs one draw per building.
import * as THREE from 'three';
import { Baker, GLOSS, rbox } from './core.ts';
import { kit } from './kit.ts';

export interface BakeOptions {
  /** Hide textured labels and signs beyond this camera distance (default 150; 0 keeps them always). */
  labelDistance?: number;
  /** Material for the baked mesh (default: the shared world clay). */
  material?: THREE.Material;
}

/** The clay fx a plain material reads as: its own clay fx if it has one, else glossy when shiny or metal, glowing when emissive. */
export function fxOf(m: THREE.MeshStandardMaterial): number {
  const own = m.userData.clayA as { value: number } | undefined;
  if (own) return own.value;
  const e = m.emissive;
  const glow = e && e.r + e.g + e.b > 0.02 ? 1 : 0;
  return (m.roughness <= 0.35 || m.metalness >= 0.3 ? GLOSS : 0) + glow;
}

/** Sharp boxes become sanded-toy rounded boxes as they bake. */
function softened(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const box = geo as THREE.BoxGeometry;
  if (box.type !== 'BoxGeometry' || !box.parameters) return geo.clone();
  const { width: w, height: h, depth: d } = box.parameters;
  const m = Math.min(w, h, d);
  if (m < 0.15) return geo.clone(); // pickets, posts and planks stay crisp (and cheap)
  return rbox(w, h, d, Math.min(0.32, m * 0.22), m > 2 ? 2 : 1);
}

function mergeable(o: THREE.Object3D): o is THREE.Mesh {
  const m = o as THREE.Mesh;
  if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh || (m as THREE.SkinnedMesh).isSkinnedMesh || m.children.length || m.userData.noBake || !m.visible) return false;
  const mat = m.material as THREE.MeshStandardMaterial;
  if (Array.isArray(m.material) || !mat || !(mat as THREE.MeshStandardMaterial).isMeshStandardMaterial) return false;
  if (mat.map || mat.transparent || mat.opacity < 1 || mat.vertexColors) return false;
  return m.matrixWorld.determinant() > 0; // mirrored parts would turn inside out
}

/**
 * Merge `root`'s static clay parts into one mesh (added to root, named 'baked').
 * Keeps the root object itself (so callers that move, shake or hide it still can),
 * any named child group's identity is lost only for its plain meshes: bake a
 * group you need to toggle (a fence) on its own.
 */
export function bakeGroup<T extends THREE.Object3D>(root: T, opts: BakeOptions = {}): T {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const B = new Baker();
  const parts: THREE.Mesh[] = [];
  const labels: THREE.Mesh[] = [];
  root.traverse((o) => {
    if (mergeable(o)) parts.push(o);
    else if ((o as THREE.Mesh).isMesh && ((o as THREE.Mesh).material as THREE.MeshStandardMaterial)?.map) labels.push(o as THREE.Mesh);
  });
  if (parts.length >= 2) {
    let cast = false;
    for (const m of parts) {
      const mat = m.material as THREE.MeshStandardMaterial;
      const g = softened(m.geometry);
      B.add(g, mat.color, { m: new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld), fx: fxOf(mat) });
      cast ||= m.castShadow;
      m.removeFromParent();
    }
    const baked = new THREE.Mesh(B.build(), opts.material ?? kit().world);
    baked.name = 'baked';
    baked.castShadow = cast; baked.receiveShadow = true;
    root.add(baked);
  }
  const far = opts.labelDistance ?? 150;
  if (far > 0) for (const m of labels) {
    const parent = m.parent;
    if (!parent || (parent as THREE.LOD).isLOD) continue;
    const lod = new THREE.LOD();
    lod.position.copy(m.position); lod.quaternion.copy(m.quaternion); lod.scale.copy(m.scale);
    m.position.set(0, 0, 0); m.quaternion.identity(); m.scale.set(1, 1, 1);
    parent.add(lod);
    m.removeFromParent();
    lod.addLevel(m, 0);
    lod.addLevel(new THREE.Object3D(), far);
  }
  return root;
}

/**
 * Add every visible clay part under `root` to a Baker, in world space (or in
 * `space`, e.g. a parent's inverse world matrix): plain clay meshes are
 * coloured from their material, already-baked ones go in as they are. Labels,
 * glass and instanced parts are left out. Bay View uses it to draw a whole
 * district's plots as one block. Returns how many parts went in.
 */
export function collectClay(root: THREE.Object3D, B: Baker, space?: THREE.Matrix4): number {
  root.updateMatrixWorld(true);
  let n = 0;
  root.traverseVisible((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh || (mesh as THREE.SkinnedMesh).isSkinnedMesh || Array.isArray(mesh.material)) return;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    if (!mat?.isMeshStandardMaterial || !mat.visible || mat.map || mat.transparent || mat.opacity < 1) return;
    if (mesh.matrixWorld.determinant() <= 0) return;
    const m = mesh.matrixWorld.clone();
    if (space) m.premultiply(space);
    if (mat.vertexColors) {
      const c = mesh.geometry.getAttribute('color');
      if (c && c.itemSize === 4 && mesh.geometry.index) { B.raw(mesh.geometry, m); n++; }
      return;
    }
    B.add(mesh.geometry.clone(), mat.color, { m, fx: fxOf(mat) });
    n++;
  });
  return n;
}
