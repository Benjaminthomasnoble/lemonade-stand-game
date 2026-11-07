// The diorama Citrine Bay sits in: a plasticine bay on a thick strata plinth
// (a cut cake of clay layers), with a glossy resin sea poured into it, on
// Grandma Lottie's oilcloth kitchen table. Real kitchen things sit on the
// table for scale: a giant lemon, a teacup on its saucer, a mug ring, seeds,
// an opened pack of plasticine, her reading glasses, and the desk lamp that
// lights the bay at night. Nothing here is pickable: bay.pick() only tests plot pads.
import * as THREE from 'three';
import {
  GLOSS, PAPER, Baker, canvasTex, cap, clipAxis, glowTex, cyl, lathe, lumpy, outline, rbox, slab, sph, tor, type V3,
} from './clay/core.ts';
import { kit, reflective } from './clay/kit.ts';
import { P } from './clay/palette.ts';
import { SEA_X, SEA_Z } from '../sim/map.ts';

/** The tabletop: the plinth's foot stands here. */
export const TABLE_Y = -14;
/** The plinth (the model's base): everything inside is Citrine Bay. */
export const PLINTH = { cx: 6, cz: -15, w: 404, d: 250 };
/** The water's surface. */
export const SEA_Y = -0.3;
/** Where the desk lamp's bulb hangs (the night light comes from here). */
export const DESK_LAMP = new THREE.Vector3(-246, TABLE_Y + 86, -146);

export interface Diorama {
  group: THREE.Group;
  resin: THREE.MeshStandardMaterial;
  /** Bulbs that glow at night (desk lamp), for the halo sprites. */
  bulbs: THREE.Vector3[];
  /** Big meshes (plinth sides, table things) whose shadows only matter zoomed out: scene.ts turns their casting on past mid zoom. */
  farCasters: THREE.Mesh[];
  /** The oilcloth's material: scene.ts dims it when the kitchen light goes out. */
  cloth: THREE.MeshStandardMaterial;
  /** The desk lamp's warm pool on the oilcloth (additive; opacity follows the night). */
  lampPool: THREE.MeshBasicMaterial;
  /** ...and its mesh, hidden by day so it costs no draw. */
  lampPoolMesh: THREE.Mesh;
}

/** The resin's colours (spec "Glossy resin": "the bay deepens from shallow teal to deep blue"): Resin teal at the coast, a deep blue offshore. */
export const RESIN = { shallow: '#3BB4C1', deep: '#1B4F9A' };
/** Glossy resin water: Resin teal at the coast deepening to blue offshore, a foam line and moving ripples. */
export function resinMaterial(time: { value: number }): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.06, metalness: 0, envMapIntensity: 1.25 });
  // Uniform colours go into the shader in linear space, like every clay colour (raw vec3s would read pale mint).
  const shallow = new THREE.Color(RESIN.shallow), deep = new THREE.Color(RESIN.deep);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = time;
    sh.uniforms.uSea = { value: new THREE.Vector2(SEA_X, SEA_Z) };
    sh.uniforms.uShallow = { value: shallow };
    sh.uniforms.uDeep = { value: deep };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vRW; varying vec3 vRN;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvRW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz; vRN = normalize( mat3( modelMatrix ) * objectNormal );');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uTime; uniform vec2 uSea; uniform vec3 uShallow; uniform vec3 uDeep; varying vec3 vRW; varying vec3 vRN;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        // distance out from the L-shaped coast (the bay wraps the south and east)
        float dx = vRW.x - uSea.x, dz = vRW.z - uSea.y;
        float d = max( dx, dz );
        float along = dx > dz ? vRW.z : vRW.x;
        // teal over the shelf by the beach, deep blue a short way out (the sea is only 35-45 across)
        float depth = smoothstep( 2.0, 16.0, d );
        diffuseColor.rgb = mix( uShallow, uDeep, depth );
        // the poured edge at the plinth's side: teal at the surface, darker blue down in the resin
        if ( vRN.y < 0.5 ) diffuseColor.rgb = mix( uShallow * 0.8, uDeep * 0.7, smoothstep( -0.6, -2.6, vRW.y ) );
        float wave = 0.35 * sin( along * 0.42 + 2.0 ) + 0.12 * sin( along * 1.13 + 4.0 ) + 0.12 * sin( uTime * 0.8 + along * 0.6 );
        float fo = 1.0 - smoothstep( 0.0, 0.8, abs( d - ( 1.6 + wave ) ) );
        float fo2 = 1.0 - smoothstep( 0.0, 0.5, abs( d - ( 4.2 + wave * 1.4 + 0.3 * sin( uTime * 0.5 + along * 0.2 ) ) ) );
        diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.95, 0.98, 0.95 ), ( fo * 0.5 + fo2 * 0.18 ) * step( 0.5, vRN.y ) );`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        if ( vRN.y > 0.5 ) {
          vec2 p = vRW.xz * 0.6; float t = uTime;
          float dx = 0.09 * cos( p.x * 0.7 + t * 0.9 ) + 0.06 * cos( ( p.x + p.y ) * 1.4 - t * 1.3 ) + 0.03 * cos( p.x * 3.1 - p.y * 2.3 + t * 2.1 );
          float dz = 0.08 * cos( p.y * 0.9 - t * 0.7 ) + 0.06 * cos( ( p.x + p.y ) * 1.4 - t * 1.3 ) + 0.03 * cos( p.y * 3.3 + p.x * 1.7 - t * 1.9 );
          normal = normalize( mat3( viewMatrix ) * normalize( vec3( -dx, 1.0, -dz ) ) );
        }`);
  };
  m.customProgramCacheKey = () => 'resin-bay2';
  return m;
}

const mesh = (g: THREE.BufferGeometry, m: THREE.Material, cast = true, recv = true) => { const x = new THREE.Mesh(g, m); x.castShadow = cast; x.receiveShadow = recv; return x; };
/** Points of the coastline, for the foam snake: along the south shore, then up the east shore. */
function coast(step: number): V3[] {
  const pts: V3[] = [];
  const x0 = PLINTH.cx - PLINTH.w / 2 + 4, z0 = PLINTH.cz - PLINTH.d / 2 + 4;
  for (let x = x0; x < SEA_X - 3; x += step) pts.push([x, SEA_Y + 0.08, SEA_Z + 1.1 + Math.sin(x * 0.42 + 2) * 0.3 + Math.sin(x * 1.13 + 4) * 0.1]);
  for (let z = SEA_Z - 3; z > z0; z -= step) pts.push([SEA_X + 1.1 + Math.sin(z * 0.42 + 2) * 0.3 + Math.sin(z * 1.13 + 4) * 0.1, SEA_Y + 0.08, z]);
  return pts;
}

export function buildDiorama(): Diorama {
  const K = kit();
  const group = new THREE.Group();
  group.name = 'diorama';
  const W = new Baker(); // the plinth's strata
  const G = new Baker(); // the lawn, beach and foam on top
  const { cx, cz, w, d } = PLINTH;

  // ---------- the plinth: clay strata from the lawn down to the table ----------
  const strata: [string, number, number][] = [[P.walnut, 2.4, 0.0], [P.terra, 2.2, 1.1], [P.cream, 1.5, 0.45], [P.soil, 2.6, 1.5], [P.lemon, 0.8, 0.65], [P.soil2, 2.2, 1.3], [P.walnut, 0, 7]];
  let y = -2.4;
  strata.forEach(([col, th, grow], i) => {
    const last = i === strata.length - 1;
    const pts = outline(cx, cz, w + grow, d + grow, 13, 220, 1.1, 11 + i * 7, 0.08);
    const y0 = last ? TABLE_Y : y - th;
    W.add(slab(pts, y0, y + 0.06, last ? 0.9 : 0.45, 2), col, { fx: last ? PAPER : 0 });
    y = y0;
  });
  // the lawn on top, cut by the coast; the resin sea fills the rest
  const top = outline(cx, cz, w, d, 13, 220, 1.1, 4, 0.08);
  const land = clipAxis(clipAxis(top, 1, SEA_Z, true, 0.45, 2), 0, SEA_X, true, 0.45, 5);
  G.add(slab(land, -2.5, 0, 0.5, 3), P.green);
  // the beach: a sand strip along both shores
  const beachS = clipAxis(clipAxis(clipAxis(top, 1, SEA_Z + 0.2, true, 0.5, 2), 1, SEA_Z - 8, false, 0.6, 7), 0, SEA_X + 0.2, true, 0, 0);
  const beachE = clipAxis(clipAxis(clipAxis(top, 0, SEA_X + 0.2, true, 0.5, 5), 0, SEA_X - 8, false, 0.6, 9), 1, SEA_Z - 7.5, true, 0, 0);
  G.add(slab(beachS, -0.6, 0.06, 0.25, 2), P.sand);
  G.add(slab(beachE, -0.6, 0.06, 0.25, 2), P.sand);
  const resin = resinMaterial(K.time);
  reflective(resin);
  const sea = outline(cx, cz, w - 1.6, d - 1.6, 12.2, 220, 1.1, 4, 0.08);
  const water = mesh(slab(sea, -2.62, SEA_Y, 0.2, 2), resin, false, true);
  water.name = 'sea';
  group.add(water);
  // sculpted clay foam along the shore, pebbles on the beach
  G.add(snake(coast(1.5), 0.16, 420, 5), '#ffffff', {});
  let k = 0;
  for (let x = cx - w / 2 + 10; x < SEA_X; x += 9 + (k % 3) * 2) { k++; G.add(lumpy(sph(0.4 + (k % 4) * 0.12, 8, 6), 0.07, 2, k), P.pebble, { p: [x, -0.05, SEA_Z - 2.2 - (k % 3) * 1.4], s: [1.3, 0.6, 1] }); }
  for (let z = SEA_Z - 12; z > cz - d / 2 + 10; z -= 10 + (k % 3) * 2) { k++; G.add(lumpy(sph(0.4 + (k % 4) * 0.12, 8, 6), 0.07, 2, k), P.pebble, { p: [SEA_X - 2.2 - (k % 3) * 1.4, -0.05, z], s: [1, 0.6, 1.3] }); }
  const plinth = mesh(W.build(), K.world, false, true); plinth.name = 'plinth';
  const lawn = mesh(G.build(), K.world, false, true); lawn.name = 'lawn';
  group.add(plinth, lawn);

  // ---------- the kitchen table: oilcloth gingham with a soft sheen ----------
  const ging = canvasTex(128, 128, (c) => {
    c.fillStyle = '#FFF7EC'; c.fillRect(0, 0, 128, 128);
    c.fillStyle = 'rgba(56,126,206,0.55)'; c.fillRect(0, 0, 64, 128); c.fillRect(0, 0, 128, 64);
    c.fillStyle = 'rgba(255,255,255,0.08)'; for (let i = 0; i < 128; i += 4) c.fillRect(i, 0, 1, 128);
  });
  ging.wrapS = ging.wrapT = THREE.RepeatWrapping; ging.repeat.set(180, 180); ging.anisotropy = 8;
  const clothMat = reflective(new THREE.MeshStandardMaterial({ map: ging, roughness: 0.55, envMapIntensity: 0.35 }));
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(3600, 3600), clothMat);
  cloth.rotation.x = -Math.PI / 2; cloth.position.y = TABLE_Y; cloth.receiveShadow = true; cloth.name = 'table';
  group.add(cloth);
  // a mug ring Lottie never wiped up
  const ring = canvasTex(256, 256, (c) => { c.strokeStyle = 'rgba(120,70,30,0.32)'; for (let i = 0; i < 3; i++) { c.lineWidth = 9 - i * 3; c.beginPath(); c.arc(128 + i, 128 - i, 108 - i * 3, 0.2 + i, Math.PI * 2 - 0.4 + i * 0.3); c.stroke(); } });
  const ringM = new THREE.Mesh(new THREE.PlaneGeometry(34, 34), new THREE.MeshBasicMaterial({ map: ring, transparent: true, depthWrite: false }));
  ringM.rotation.x = -Math.PI / 2; ringM.position.set(-150, TABLE_Y + 0.05, 150); group.add(ringM);

  // ---------- real kitchen things, for scale ----------
  // the giant real lemon (glossy peel, pores)
  const LS = 4.6;
  const lemonG = lathe(Array.from({ length: 21 }, (_, i) => { const t = i / 20, a = t * Math.PI; return [Math.sin(a) * 2.6 * LS * (1 - 0.18 * Math.pow(Math.abs(Math.cos(a)), 3)), (-Math.cos(a) * 3.6 - (t < 0.08 ? 0.5 * (1 - t / 0.08) : 0) + (t > 0.92 ? 0.5 * ((t - 0.92) / 0.08) : 0)) * LS] as [number, number]; }), 40);
  const lb = new Baker(); lb.add(lumpy(lemonG, 0.25, 0.18, 7), P.lemon);
  const lemon = mesh(lb.build(), reflective(K.peel), true, false);
  lemon.rotation.set(Math.PI / 2, 0, 0.9); lemon.position.set(-118, TABLE_Y + 2.45 * LS, -178);
  group.add(lemon);
  const T = new Baker();
  // a leaf still on the stem
  T.add(sph(3.2, 12, 8), P.green, { p: [-130, TABLE_Y + 2.45 * LS + 1, -195], s: [2.4, 0.3, 1], r: [0, 0.9, 0.2] });
  // a teacup on its saucer, with a teaspoon
  const TX = 128, TZ = -184, TS = 5.2;
  T.add(lathe([[0, 0], [2.4, 0.05], [3.6, 0.3], [3.8, 0.45], [3.5, 0.4], [2.3, 0.25], [0, 0.25]].map(([a, b]) => [a * TS, b * TS] as [number, number]), 48), '#ffffff', { fx: GLOSS, p: [TX, TABLE_Y, TZ] });
  T.add(lathe([[0, 0.25], [1.6, 0.3], [2.6, 1.2], [3.0, 2.6], [3.1, 3.4], [2.95, 3.42], [2.85, 2.7], [2.5, 1.4], [1.5, 0.6], [0, 0.55]].map(([a, b]) => [a * TS, b * TS] as [number, number]), 48), '#ffffff', { fx: GLOSS, p: [TX, TABLE_Y, TZ] });
  T.add(tor(3.03 * TS, 0.08 * TS, 6, 64), P.teal, { fx: GLOSS, p: [TX, TABLE_Y + 3.38 * TS, TZ], r: [Math.PI / 2, 0, 0] });
  T.add(cyl(2.8 * TS, 2.8 * TS, 0.05 * TS, 48), P.tea, { fx: GLOSS, p: [TX, TABLE_Y + 2.7 * TS, TZ] });
  T.add(tor(0.8 * TS, 0.2 * TS, 8, 20, Math.PI * 1.2), '#ffffff', { fx: GLOSS, p: [TX + 3.0 * TS, TABLE_Y + 2.1 * TS, TZ], r: [0, 0, -Math.PI * 0.6] });
  for (let i = 0; i < 5; i++) T.add(tor(0.5 * TS, 0.06 * TS, 5, 12), P.terra, { fx: GLOSS, p: [TX + Math.cos(i * 1.26) * 2.9 * TS, TABLE_Y + 2.0 * TS, TZ + Math.sin(i * 1.26) * 2.9 * TS], r: [Math.PI / 2, 0, 0] });
  T.add(cap(0.12 * TS, 5 * TS, 2, 6), P.chrome, { fx: GLOSS, p: [TX + 5.5 * TS, TABLE_Y + 0.6, TZ + 4.5 * TS], r: [Math.PI / 2, 0, 0.6] });
  T.add(sph(0.6 * TS, 12, 8), P.chrome, { fx: GLOSS, p: [TX + 4.1 * TS, TABLE_Y + 0.7, TZ + 2.3 * TS], s: [1, 0.25, 1.4], r: [0, 0.6, 0] });
  // lemon seeds
  const seeds: [number, number][] = [[-60, -160], [-30, -166], [10, -158], [40, -170], [-204, -40], [-210, 10], [-206, 60], [-90, 150], [-40, 156], [20, 148], [230, 30], [236, 70]];
  seeds.forEach(([x, z], i) => T.add(lumpy(sph(1.6, 9, 7), 0.1, 0.8, i), '#f2e3b5', { p: [x, TABLE_Y + 0.55, z], s: [1.6, 0.5, 0.9], r: [0, i * 1.7, 0] }));
  // an opened pack of plasticine bars and a sculpting tool, east of the sea
  const PX = 262, PZ = -40, PR = 0.3;
  T.add(rbox(48, 2.2, 30, 0.9), '#ffffff', { fx: PAPER, p: [PX, TABLE_Y + 1.1, PZ], r: [0, PR, 0] });
  const bars = [P.lemon, P.terra, P.teal, P.green, P.blush, P.walnut, P.plum, P.cream];
  const rot = new THREE.Vector3();
  bars.forEach((c, i) => {
    if (i === 2 || i === 5) return;
    rot.set(-18.5 + i * 5.3, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), PR);
    T.add(lumpy(rbox(4.4, 3.5, 24.6, 1.1), 0.18, 0.27, i), c, { p: [PX + rot.x, TABLE_Y + 3.7, PZ + rot.z], r: [0, PR, 0] });
  });
  T.add(lumpy(sph(5.3, 14, 10), 0.8, 0.22, 4), P.teal, { p: [PX - 20, TABLE_Y + 2.6, PZ + 44], s: [1.4, 0.6, 1] });
  T.add(cyl(0.8, 0.55, 35, 8), P.stick, { fx: PAPER, p: [PX - 12, TABLE_Y + 1.1, PZ + 62], r: [Math.PI / 2, 0, 1.1] });
  T.add(tor(2.6, 0.35, 6, 16), P.chrome, { fx: GLOSS, p: [PX + 4, TABLE_Y + 1.1, PZ + 70], r: [Math.PI / 2, 0, 1.1] });
  // Lottie's reading glasses, folded
  const GX = 176, GZ = 150;
  for (const s of [-1, 1]) T.add(tor(7, 0.6, 6, 28), '#7a3a2a', { fx: GLOSS, p: [GX + s * 8.4, TABLE_Y + 0.65, GZ], r: [Math.PI / 2, 0, 0] });
  T.add(tor(2.6, 0.5, 6, 12, Math.PI), '#7a3a2a', { fx: GLOSS, p: [GX, TABLE_Y + 0.9, GZ], r: [Math.PI / 2, 0, 0] });
  for (const s of [-1, 1]) T.add(cap(0.45, 20, 2, 6), '#7a3a2a', { fx: GLOSS, p: [GX + s * 15.4, TABLE_Y + 0.65, GZ + 10.6], r: [Math.PI / 2, 0, -s * 0.12] });
  // the desk lamp that lights the bay at night (north-west corner, head leaning over the model)
  const DX = -300, DZ = -190;
  T.add(cyl(13, 15, 3.5, 32), P.plum, { fx: GLOSS, p: [DX, TABLE_Y + 1.75, DZ] });
  T.add(sph(2.6, 12, 8), P.chrome, { fx: GLOSS, p: [DX, TABLE_Y + 4, DZ] });
  const elbow = new THREE.Vector3(DX + 10, TABLE_Y + 60, DZ + 10), head = new THREE.Vector3(DESK_LAMP.x - 8, DESK_LAMP.y + 10, DESK_LAMP.z - 8);
  const arm = (a: THREE.Vector3, b: THREE.Vector3) => {
    const mid = a.clone().add(b).multiplyScalar(0.5), dir = b.clone().sub(a), len = dir.length();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    T.add(cap(1.5, len, 2, 10), P.terra, { fx: GLOSS, p: [mid.x, mid.y, mid.z], q });
  };
  arm(new THREE.Vector3(DX, TABLE_Y + 4, DZ), elbow);
  arm(elbow, head);
  T.add(sph(2.8, 12, 8), P.chrome, { fx: GLOSS, p: [elbow.x, elbow.y, elbow.z] });
  const shadeDir = DESK_LAMP.clone().sub(head).normalize();
  const shadeQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), shadeDir);
  const shadeAt = head.clone().addScaledVector(shadeDir, 7);
  T.add(new THREE.ConeGeometry(15, 18, 32, 1, true), P.terra, { fx: GLOSS, p: [shadeAt.x, shadeAt.y, shadeAt.z], q: shadeQ });
  T.add(sph(6.2, 18, 12), '#FFE6B0', { fx: 1, p: [DESK_LAMP.x, DESK_LAMP.y, DESK_LAMP.z] });
  const things = mesh(T.build(), K.world, false, true); things.name = 'table-things';
  lemon.castShadow = false;
  group.add(things);
  // the desk lamp's pool of light on the oilcloth, only at night
  const lampPool = new THREE.MeshBasicMaterial({ map: glowTex('rgba(255,214,160,1)', 'rgba(255,180,110,0.4)'), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const poolM = new THREE.Mesh(new THREE.PlaneGeometry(520, 520).rotateX(-Math.PI / 2), lampPool);
  poolM.position.set(DESK_LAMP.x + 60, TABLE_Y + 0.2, DESK_LAMP.z + 60);
  poolM.renderOrder = 1;
  poolM.visible = false;
  group.add(poolM);
  return { group, resin, bulbs: [DESK_LAMP.clone()], farCasters: [plinth, things, lemon], cloth: clothMat, lampPool, lampPoolMesh: poolM };
}

function snake(pts: V3[], r: number, seg: number, rs: number) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
  return new THREE.TubeGeometry(curve, seg, r, rs, false);
}
