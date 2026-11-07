// Kitchen-Table Clay: shared plumbing, ported from the mockup Ben picked
// (art-direction/clay-mockup/dirs/clay/core.js). One thumb-smudge normal map
// for everything, a clay material with wrap lighting (fake subsurface: a warm
// terminator), vertex-colour baking and the little shape helpers every model
// is made from. No scene state lives here: see kit.ts for the shared materials.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/** fx channel in vertex alpha: 0 clay, 2 glossy bead/resin, 4 paper/wood. Add 0..1 for glow (lit at night). */
export const CLAY = 0, GLOSS = 2, PAPER = 4;

// ---------- deterministic little helpers ----------
export const hash = (a: number, b = 0) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
export function vnoise(x: number, y: number, z: number) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const h = (i: number, j: number, k: number) => hash(xi + i + (zi + k) * 57.31, yi + j + (zi + k) * 13.7);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  return l(l(l(h(0, 0, 0), h(1, 0, 0), u), l(h(0, 1, 0), h(1, 1, 0), u), v), l(l(h(0, 0, 1), h(1, 0, 1), u), l(h(0, 1, 1), h(1, 1, 1), u), v), w) * 2 - 1;
}
/** A seeded 0..1 generator (Park-Miller), for layouts that must look the same every run. */
export function lcg(seed: number) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

// ---------- the thumb-smudge map: tileable thumbprints with fingerprint ridges, tool dabs, lumps ----------
export function makeSmudgeMap(rnd: () => number, N = 512): THREE.CanvasTexture {
  const h = new Float32Array(N * N);
  const blob = (cx: number, cy: number, rx: number, ry: number, ang: number, depth: number, ridges: number, rim: number) => {
    const ca = Math.cos(ang), sa = Math.sin(ang), R = Math.ceil(Math.max(rx, ry)) + 1, ix = Math.floor(cx), iy = Math.floor(cy);
    for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
      const u = (x * ca + y * sa) / rx, v = (-x * sa + y * ca) / ry, d2 = u * u + v * v;
      if (d2 >= 1) continue;
      const d = Math.sqrt(d2), f = (1 - d2) * (1 - d2);
      let val = depth * f;
      if (ridges) val += Math.sin(d * ridges * 6.283 + u * 2.0) * 0.07 * Math.sqrt(f) * Math.abs(depth);
      if (rim) val -= depth * rim * Math.exp(-((d - 0.86) ** 2) / 0.008);
      h[(((iy + y) % N + N) % N) * N + (((ix + x) % N + N) % N)] += val;
    }
  };
  const s = N / 512;
  for (let k = 0; k < 34; k++) blob(rnd() * N, rnd() * N, (50 + rnd() * 70) * s, (40 + rnd() * 50) * s, rnd() * 3, (rnd() - 0.5) * 1.2, 0, 0);
  for (let k = 0; k < 78; k++) { const r = (20 + rnd() * 30) * s; blob(rnd() * N, rnd() * N, r, r * (0.6 + rnd() * 0.22), rnd() * 3, -(0.55 + rnd() * 0.5), 6 + rnd() * 4, 0.3); }
  for (let k = 0; k < 220; k++) { const r = (3 + rnd() * 7) * s; blob(rnd() * N, rnd() * N, r, r * (0.4 + rnd() * 0.6), rnd() * 3, (rnd() - 0.6) * 0.5, 0, 0); }
  // normals, normalised to a steady RMS slope
  const gx = new Float32Array(N * N), gy = new Float32Array(N * N);
  let acc = 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x;
    gx[i] = h[y * N + ((x + 1) % N)] - h[y * N + ((x - 1 + N) % N)];
    gy[i] = h[((y + 1) % N) * N + x] - h[((y - 1 + N) % N) * N + x];
    acc += gx[i] * gx[i] + gy[i] * gy[i];
  }
  const k = 0.42 / Math.sqrt(acc / (N * N));
  const cv = document.createElement('canvas'); cv.width = cv.height = N;
  const ctx = cv.getContext('2d')!, img = ctx.createImageData(N, N);
  for (let i = 0; i < N * N; i++) {
    const nx = -gx[i] * k, ny = -gy[i] * k, l = 1 / Math.hypot(nx, ny, 1);
    img.data[i * 4] = (nx * l * 0.5 + 0.5) * 255; img.data[i * 4 + 1] = (ny * l * 0.5 + 0.5) * 255; img.data[i * 4 + 2] = (l * 0.5 + 0.5) * 255; img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

// ---------- the clay material ----------
const VPARS = `uniform float uClayScale; uniform vec3 uClayBoil;
varying vec3 vClayP; varying vec3 vClayN; varying vec3 vClayM0; varying vec3 vClayM1; varying vec3 vClayM2;`;
const VMAIN = `vClayP = position * uClayScale + uClayBoil;
vClayN = normal;
mat3 clayM = normalMatrix;
#ifdef USE_INSTANCING
  vClayP += instanceMatrix[3].xyz * 0.713;
  clayM = normalMatrix * mat3( instanceMatrix );
#endif
#ifdef USE_BATCHING
  clayM = normalMatrix * mat3( batchingMatrix );
#endif
vClayM0 = clayM[0]; vClayM1 = clayM[1]; vClayM2 = clayM[2];`;
const FPARS = `uniform sampler2D uClayMap; uniform float uClayStr; uniform float uClayWrap; uniform float uClayTerm; uniform float uClayGlow; uniform float uClayA;
varying vec3 vClayP; varying vec3 vClayN; varying vec3 vClayM0; varying vec3 vClayM1; varying vec3 vClayM2;`;
// Plain (not baked) meshes have no colour attribute: their fx comes from the uClayA uniform.
const FCOLOR = `#if defined( USE_COLOR_ALPHA )
  diffuseColor.rgb *= vColor.rgb; float clayA = vColor.a;
#elif defined( USE_COLOR )
  diffuseColor.rgb *= vColor; float clayA = uClayA;
#else
  float clayA = uClayA;
#endif
float clayFx = floor( ( clayA + 0.25 ) * 0.5 );
float clayGlow = clamp( clayA - clayFx * 2.0, 0.0, 1.0 );`;
const FROUGH = `if ( clayFx > 0.5 && clayFx < 1.5 ) roughnessFactor = 0.14; else if ( clayFx > 1.5 ) roughnessFactor = 0.86;`;
const FNORMAL = `{
  vec3 cn = normalize( vClayN );
  vec3 bw = abs( cn ); bw *= bw; bw *= bw; bw /= ( bw.x + bw.y + bw.z + 1e-4 );
  float s = uClayStr * ( clayFx > 1.5 ? 0.3 : ( clayFx > 0.5 ? 0.25 : 1.0 ) );
  vec2 tx = ( texture2D( uClayMap, vClayP.zy ).xy * 2.0 - 1.0 ) * s;
  vec2 ty = ( texture2D( uClayMap, vClayP.xz ).xy * 2.0 - 1.0 ) * s;
  vec2 tz = ( texture2D( uClayMap, vClayP.xy ).xy * 2.0 - 1.0 ) * s;
  vec3 pn = normalize( vec3( cn.x, tx.y + cn.y, tx.x + cn.z ) * bw.x + vec3( ty.x + cn.x, cn.y, ty.y + cn.z ) * bw.y + vec3( tz.x + cn.x, tz.y + cn.y, cn.z ) * bw.z );
  normal = normalize( normal + mat3( vClayM0, vClayM1, vClayM2 ) * ( pn - cn ) * faceDirection );
}`;
let LIGHTS: string | null = null;
/** The physical lighting chunk with wrap lighting and a warm terminator band (fake subsurface). */
function clayLights() {
  if (LIGHTS) return LIGHTS;
  let s = THREE.ShaderChunk.lights_physical_pars_fragment;
  s = s.replace('float dotNL = saturate( dot( geometryNormal, directLight.direction ) );', 'float clayNL = dot( geometryNormal, directLight.direction );\n\tfloat dotNL = saturate( clayNL );');
  s = s.replace('reflectedLight.directDiffuse += irradiance * diffuseBRDF * ( 1.0 - F );',
    `float clayW = saturate( ( clayNL + uClayWrap ) / ( 1.0 + uClayWrap ) );
	float clayT = smoothstep( - uClayWrap, 0.05, clayNL ) * ( 1.0 - smoothstep( 0.05, 0.6, clayNL ) );
	vec3 clayIrr = directLight.color * ( clayW + clayT * uClayTerm * vec3( 0.95, 0.32, 0.16 ) );
	reflectedLight.directDiffuse += clayIrr * diffuseBRDF * ( 1.0 - F );`);
  LIGHTS = s;
  return s;
}

type U<T> = { value: T };
/** Shared uniform objects for a family of materials (world, figures, peel). */
export interface ClayUniforms {
  map: U<THREE.Texture>; scale: U<number>; str: U<number>; boil: U<THREE.Vector3>; wrap: U<number>; term: U<number>;
}
export function clayUniforms(map: THREE.Texture, scale: number, str = 1): ClayUniforms {
  return { map: { value: map }, scale: { value: scale }, str: { value: str }, boil: { value: new THREE.Vector3() }, wrap: { value: 0.5 }, term: { value: 0.55 } };
}

export interface ClayMaterialOptions extends THREE.MeshStandardMaterialParameters {
  /** fx for meshes without vertex colours (0 clay, GLOSS, PAPER, +0..1 glow). */
  fx?: number;
}
/**
 * The clay material: a MeshStandardMaterial patched with triplanar smudge normals,
 * the fx channel (clay / glossy resin and beads / paper and wood) and wrap lighting.
 * `glow` scales the glow channel (0 by day, ~2.4 at night for the world).
 * Baked geometry carries its colour and fx in a 4-component colour attribute;
 * plain meshes pass `vertexColors: false` with `color` and `fx`.
 */
export function clayMaterial(Un: ClayUniforms, opts: ClayMaterialOptions = {}, glow: U<number> = { value: 1 }): THREE.MeshStandardMaterial {
  const { fx = 0, ...rest } = opts;
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.6, metalness: 0, envMapIntensity: 0.9, ...rest });
  const a = { value: fx };
  m.userData.clayA = a;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uClayMap: Un.map, uClayScale: Un.scale, uClayStr: Un.str, uClayBoil: Un.boil, uClayWrap: Un.wrap, uClayTerm: Un.term, uClayGlow: glow, uClayA: a });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + VPARS)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VMAIN);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FPARS)
      .replace('#include <color_fragment>', FCOLOR)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + FROUGH)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + FNORMAL)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * clayGlow * uClayGlow;')
      .replace('#include <lights_physical_pars_fragment>', clayLights());
  };
  m.customProgramCacheKey = () => 'clay-v3';
  return m;
}

// ---------- geometry baking: everything is vertex-coloured clay merged into few draws ----------
export type V3 = [number, number, number];
export interface XOpts {
  /** position */ p?: V3;
  /** Euler rotation */ r?: V3;
  ro?: THREE.EulerOrder;
  /** uniform or per-axis scale */ s?: number | V3;
  q?: THREE.Quaternion;
  /** a full matrix applied after p/r/s */ m?: THREE.Matrix4;
  /** fx channel (see CLAY, GLOSS, PAPER) */ fx?: number;
}
const _c = new THREE.Color(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
export function xform(o: XOpts): THREE.Matrix4 {
  const r = o.r || [0, 0, 0];
  _e.set(r[0], r[1], r[2], o.ro || 'XYZ');
  if (o.q) _q.copy(o.q); else _q.setFromEuler(_e);
  const s = o.s === undefined ? 1 : o.s;
  if (typeof s === 'number') _s.set(s, s, s); else _s.set(s[0], s[1], s[2]);
  const p = o.p || [0, 0, 0];
  return _m.compose(_v.set(p[0], p[1], p[2]), _q, _s);
}
/** Strip a geometry to position + normal, index it and paint it one colour (rgb + fx in alpha). */
export function prep(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, fx = 0): THREE.BufferGeometry {
  const g = geo;
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.index) { const n = g.attributes.position.count, idx = new Uint32Array(n); for (let i = 0; i < n; i++) idx[i] = i; g.setIndex(new THREE.BufferAttribute(idx, 1)); }
  g.clearGroups();
  const n = g.attributes.position.count, a = new Float32Array(n * 4);
  _c.set(color);
  for (let i = 0; i < n; i++) { a[i * 4] = _c.r; a[i * 4 + 1] = _c.g; a[i * 4 + 2] = _c.b; a[i * 4 + 3] = fx; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 4));
  return g;
}
/** Collects coloured parts and merges them into one geometry: one draw for a whole model. */
export class Baker {
  list: THREE.BufferGeometry[] = [];
  add(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, o: XOpts = {}): this {
    const g = prep(geo, color, o.fx || 0);
    if (o.p || o.r || o.s !== undefined || o.q) g.applyMatrix4(xform(o));
    if (o.m) g.applyMatrix4(o.m);
    this.list.push(g);
    return this;
  }
  /** add an already-coloured geometry (from another baker) */
  raw(g: THREE.BufferGeometry, m?: THREE.Matrix4): this { const c = g.clone(); if (m) c.applyMatrix4(m); this.list.push(c); return this; }
  get size() { return this.list.length; }
  build(): THREE.BufferGeometry {
    if (!this.list.length) return prep(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0], 3)).setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3)), '#fff');
    const g = mergeGeometries(this.list, false);
    for (const x of this.list) x.dispose();
    this.list = [];
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}
/** Hand-made irregularity: weld, push along normals by value noise, re-smooth. */
export function lumpy(geo: THREE.BufferGeometry, amp: number, freq = 3, seed = 0): THREE.BufferGeometry {
  for (const k of Object.keys(geo.attributes)) if (k !== 'position') geo.deleteAttribute(k);
  const g = mergeVertices(geo, 1e-4); geo.dispose();
  g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const d = vnoise(x * freq + seed, y * freq - seed * 0.7, z * freq + seed * 1.3) * amp + vnoise(x * freq * 2.3 + 9, y * freq * 2.3, z * freq * 2.3 - seed) * amp * 0.35;
    p.setXYZ(i, x + n.getX(i) * d, y + n.getY(i) * d, z + n.getZ(i) * d);
  }
  g.computeVertexNormals();
  return g;
}
/** bend a geometry: x += f(y) (the Cold Brew S-slouch, snakes, trunks) */
export function bend(geo: THREE.BufferGeometry, f: (y: number) => number): THREE.BufferGeometry {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setX(i, p.getX(i) + f(y)); }
  geo.computeVertexNormals();
  return geo;
}
export const sph = (r: number, w = 20, h = 14) => new THREE.SphereGeometry(r, w, h);
export const cap = (r: number, l: number, cs = 4, rs = 10) => new THREE.CapsuleGeometry(r, l, cs, rs);
export const cyl = (rt: number, rb: number, h: number, s = 16, open = false) => new THREE.CylinderGeometry(rt, rb, h, s, 1, open);
export const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
/** a rounded box: sanded-toy edges (radius r, `seg` segments per edge) */
export const rbox = (w: number, h: number, d: number, r = Math.min(w, h, d) * 0.2, seg = 2) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, Math.min(w, h, d) / 2 - 1e-4));
export const cone = (r: number, h: number, s = 12, open = false) => new THREE.ConeGeometry(r, h, s, 1, open);
export const tor = (r: number, t: number, rs = 8, ts = 20, arc = Math.PI * 2) => new THREE.TorusGeometry(r, t, rs, ts, arc);
export function lathe(pts: [number, number][], seg = 22) { return new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(Math.max(0, x), y)), seg); }
/** a clay snake along points (tube with rounded ends) */
export function snake(pts: V3[], r: number, seg = 24, rs = 7): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
  const g = new THREE.TubeGeometry(curve, seg, r, rs, false);
  const parts: THREE.BufferGeometry[] = [g];
  for (const t of [0, 1]) { const e = sph(r, rs + 1, 6); const q = curve.getPoint(t); e.translate(q.x, q.y, q.z); parts.push(e); }
  for (const y of parts) for (const k of Object.keys(y.attributes)) if (k !== 'position' && k !== 'normal') y.deleteAttribute(k);
  return mergeGeometries(parts, false);
}
/** A rounded-rectangle outline with a hand-made wobble, as [x, z] points (counter-clockwise seen from above). */
export function outline(cx: number, cz: number, w: number, d: number, r: number, n: number, wob: number, seed: number, freq = 0.35): [number, number][] {
  const hw = w / 2 - r, hd = d / 2 - r;
  const per = 4 * (hw + hd) * 2 + 2 * Math.PI * r;
  const corners: V3[] = [[hw, hd, 0], [-hw, hd, Math.PI / 2], [-hw, -hd, Math.PI], [hw, -hd, Math.PI * 1.5]];
  const seg: [number, number][] = [];
  for (let c = 0; c < 4; c++) {
    const [x, z, a0] = corners[c];
    for (let i = 0; i <= 6; i++) { const a = a0 + (i / 6) * (Math.PI / 2); seg.push([x + Math.cos(a) * r, z + Math.sin(a) * r]); }
    const [nx, nz] = corners[(c + 1) % 4];
    const ex = nx + Math.cos(a0 + Math.PI / 2) * r, ez = nz + Math.sin(a0 + Math.PI / 2) * r;
    const sx = x + Math.cos(a0 + Math.PI / 2) * r, sz = z + Math.sin(a0 + Math.PI / 2) * r;
    const L = Math.hypot(ex - sx, ez - sz), k = Math.max(1, Math.round((L / per) * n));
    for (let i = 1; i < k; i++) seg.push([sx + ((ex - sx) * i) / k, sz + ((ez - sz) * i) / k]);
  }
  return seg.map(([x, z]) => {
    const wv = vnoise(x * freq + seed, z * freq - seed, seed * 3.1) * wob;
    const l = Math.hypot(x, z) || 1;
    return [cx + x + (x / l) * wv, cz + z + (z / l) * wv];
  });
}
/**
 * Keep the part of a convex outline on one side of an axis line (axis 0: x = c, axis 1: z = c),
 * with a wavy cut edge (a coastline, a lawn edge).
 */
export function clipAxis(pts: [number, number][], axis: 0 | 1, c: number, keepBelow: boolean, wav = 0, seed = 0): [number, number][] {
  const out: [number, number][] = [], o = 1 - axis;
  const inside = (p: [number, number]) => (keepBelow ? p[axis] < c : p[axis] > c);
  const at = (a: [number, number], b: [number, number]) => { const t = (c - a[axis]) / (b[axis] - a[axis]); const q: [number, number] = [0, 0]; q[axis] = c; q[o] = a[o] + (b[o] - a[o]) * t; return q; };
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    if (inside(a)) out.push(a);
    if (inside(a) !== inside(b)) {
      const q = at(a, b);
      out.push(q);
      if (inside(a) && wav) {
        // walk the cut edge with waves towards where the outline resumes
        let j = (i + 1) % pts.length; while (!inside(pts[j])) j = (j + 1) % pts.length;
        const q2 = at(pts[(j - 1 + pts.length) % pts.length], pts[j]);
        const n = Math.ceil(Math.abs(q2[o] - q[o]) / 0.6);
        for (let k = 1; k < n; k++) {
          const u = q[o] + ((q2[o] - q[o]) * k) / n;
          const p: [number, number] = [0, 0]; p[o] = u; p[axis] = c + Math.sin(u * 0.42 + seed) * wav + Math.sin(u * 1.13 + seed * 2) * wav * 0.4;
          out.push(p);
        }
      }
    }
  }
  return out;
}
/** Extrude an [x, z] outline into a bevelled clay slab from y0 to y1. */
export function slab(pts: [number, number][], y0: number, y1: number, bevel = 0.14, bevelSegments = 3): THREE.BufferGeometry {
  const sh = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(0.01, y1 - y0 - bevel * 2), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments, curveSegments: 1 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0 + bevel, 0);
  return g;
}
/** Shift a hex colour's lightness by k (-1..1). */
export function shade(hex: THREE.ColorRepresentation, k: number): string {
  const c = new THREE.Color(hex); const hsl = { h: 0, s: 0, l: 0 }; c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + k)));
  return '#' + c.getHexString();
}

// ---------- canvas textures ----------
export type Redraw = (fn: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) => void;
export function canvasTex(w: number, h: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, srgb = true): THREE.CanvasTexture {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d')!;
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(cv);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  const redraw: Redraw = (fn) => { ctx.clearRect(0, 0, w, h); fn(ctx, w, h); t.needsUpdate = true; };
  t.userData.redraw = redraw;
  return t;
}
/** A wobbly hand-cut blob path (stickers, puddles, tape ends). */
export function blobPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, n: number, wob: number, seed: number) {
  ctx.beginPath();
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; const rr = r * (1 + (hash(i, seed) - 0.5) * wob); pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
  for (let i = 0; i < n; i++) {
    const p0 = pts[i], p1 = pts[(i + 1) % n];
    const mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2;
    if (i === 0) { const pl = pts[n - 1]; ctx.moveTo((pl[0] + p0[0]) / 2, (pl[1] + p0[1]) / 2); }
    ctx.quadraticCurveTo(p0[0], p0[1], mx, my);
  }
  ctx.closePath();
}
/** soft round light texture (halos, pools) */
export function glowTex(inner = 'rgba(255,214,150,1)', mid = 'rgba(255,170,90,0.35)'): THREE.CanvasTexture {
  return canvasTex(128, 128, (c) => {
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, inner); g.addColorStop(0.35, mid); g.addColorStop(1, 'rgba(255,150,80,0)');
    c.fillStyle = g; c.fillRect(0, 0, 128, 128);
  });
}

// ---------- environment: a soft kitchen with a bright window, for glossy resin and glass ----------
export function makeEnv(renderer: THREE.WebGLRenderer): THREE.WebGLRenderTarget {
  const es = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.SphereGeometry(50, 24, 16), new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true }));
  const pos = room.geometry.attributes.position, col = new Float32Array(pos.count * 3);
  const top = new THREE.Color('#fff2dc'), bot = new THREE.Color('#c88a5a');
  for (let i = 0; i < pos.count; i++) { const k = (pos.getY(i) / 50) * 0.5 + 0.5; _c.copy(bot).lerp(top, k).multiplyScalar(0.55 + k * 0.6); col.set([_c.r, _c.g, _c.b], i * 3); }
  room.geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
  es.add(room);
  const win = new THREE.Mesh(new THREE.PlaneGeometry(26, 18), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 4.6, 3.8) }));
  win.position.set(-20, 18, -38); win.lookAt(0, 0, 0); es.add(win);
  const bar = new THREE.MeshBasicMaterial({ color: '#6b4a33' });
  for (const [w, h, x, y] of [[1.2, 18, 0, 0], [26, 1.2, 0, 0]]) { const b = new THREE.Mesh(new THREE.PlaneGeometry(w, h), bar); b.position.copy(win.position).multiplyScalar(0.99); b.position.x += x; b.position.y += y; b.lookAt(0, 0, 0); es.add(b); }
  const lamp = new THREE.Mesh(new THREE.CircleGeometry(7, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.6, 1.8) }));
  lamp.position.set(10, 46, 6); lamp.lookAt(0, 0, 0); es.add(lamp);
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(es, 0.03);
  pm.dispose();
  es.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); } });
  return rt;
}
