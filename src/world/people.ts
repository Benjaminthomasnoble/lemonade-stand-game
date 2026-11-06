// Peg-doll people (spec: Characters): capsule body, sphere head with a
// painted face, floating mitten hands, no arms or legs, and a hat that says
// who they are. The sim decides who buys; the crowd only walks them along
// the sidewalk, detours buyers to the counter and reports when they arrive
// so the HUD can pop "+50¢" over their heads.
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { FactionId } from '../sim/map.ts';
import { OWNER_STYLE, paint, PAL } from './paint.ts';

/** A ramp of 8 skin tones, assigned at random, never tied to faction. */
const SKIN = [0xffe0c4, 0xf6cfa4, 0xeab98b, 0xd9a170, 0xc08552, 0xa0673d, 0x7f4f2e, 0x5e3920];
const SHIRTS = [0xe63946, 0x457b9d, 0x2a9d8f, 0xf4a261, 0x9b5de5, 0x06d6a0, 0xef476f, 0x7aa6c2, 0xc77dff, 0xff8fab];
const SOFT_HATS = [0xfff6dc, 0x7aa6c2, 0xf2795b, 0x5fa35a, 0xe9c46a, 0xffffff];

// Geometry: adults stand about 2.5 heads tall.
const BODY_R = 0.24;
const bodyGeo = new THREE.CapsuleGeometry(BODY_R, 0.42, 6, 14);
const HEAD_R = 0.3;
const HEAD_Y = 1.15;
const headGeo = new THREE.SphereGeometry(HEAD_R, 20, 14);
const handGeo = new THREE.SphereGeometry(0.085, 10, 8);
handGeo.scale(1, 0.9, 0.8);

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

// ---------------------------------------------------------------- faces

const faceMats = new Map<string, THREE.MeshStandardNodeMaterial>();
/** A head material: skin with three painted shapes for a face (or KO spirals). */
function faceMat(skin: number, ko = false) {
  const key = `${skin}|${ko}`;
  let m = faceMats.get(key);
  if (m) return m;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#' + skin.toString(16).padStart(6, '0');
  g.fillRect(0, 0, 256, 128);
  // The face sits at u = 0.25 (the model's +z) on the equator.
  const cx = 64, cy = 60;
  g.fillStyle = g.strokeStyle = '#23214a';
  g.lineCap = 'round';
  if (ko) {
    g.lineWidth = 2.5;
    for (const s of [-1, 1]) {
      g.beginPath();
      for (let a = 0; a < Math.PI * 5; a += 0.3) g.lineTo(cx + s * 12 + Math.cos(a) * a * 0.55, cy - 4 + Math.sin(a) * a * 0.55);
      g.stroke();
    }
    g.lineWidth = 3; g.beginPath(); g.ellipse(cx, cy + 13, 5, 4, 0, 0, Math.PI * 2); g.stroke();
  } else {
    for (const s of [-1, 1]) { g.beginPath(); g.ellipse(cx + s * 11, cy - 4, 3.2, 4.6, 0, 0, Math.PI * 2); g.fill(); }
    g.lineWidth = 3.2; g.beginPath(); g.arc(cx, cy + 4, 9, 0.2 * Math.PI, 0.8 * Math.PI); g.stroke();
    g.fillStyle = 'rgba(242,121,91,0.35)';
    for (const s of [-1, 1]) { g.beginPath(); g.arc(cx + s * 19, cy + 6, 5, 0, Math.PI * 2); g.fill(); }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  m = new THREE.MeshStandardNodeMaterial({ map: tex, roughness: 0.75 });
  faceMats.set(key, m);
  return m;
}

/** Swap a peg doll's face to the knocked-out spiral eyes, or back. */
export function setKO(person: THREE.Object3D, ko: boolean) {
  const head = person.userData.head as THREE.Mesh | undefined;
  if (head) head.material = faceMat(person.userData.skin as number, ko);
}

// ---------------------------------------------------------------- hats

export type HatKind = 'none' | 'cap' | 'leafcap' | 'bucket' | 'sunhat' | 'bowler' | 'straw' | 'flattop' | 'beanie' | 'visor' | 'lottie';

const hatCache = new Map<string, THREE.BufferGeometry>();
function hatGeo(key: string, build: () => THREE.BufferGeometry[]) {
  let g = hatCache.get(key);
  if (!g) { g = mergeGeometries(build().map((x) => x.toNonIndexed()))!; hatCache.set(key, g); }
  return g;
}
const at = (geo: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0) => { if (rx) geo.rotateX(rx); return geo.translate(x, y, z); };
const dome = (r: number, sy = 1) => new THREE.SphereGeometry(r, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, sy, 1);
const disc = (r: number, h: number, seg = 20) => new THREE.CylinderGeometry(r, r, h, seg);

/** Hat meshes for a head (head center at the origin). */
function hat(kind: HatKind, main: number, band: number): THREE.Mesh[] {
  const r = HEAD_R;
  const mk = (geo: THREE.BufferGeometry, color: number, rough = 0.8) => { const m = new THREE.Mesh(geo, paint(color, { rough })); m.castShadow = true; return m; };
  switch (kind) {
    case 'cap': case 'leafcap': {
      const out = [mk(hatGeo('cap', () => [at(dome(r * 1.04, 0.85), 0, r * 0.15, 0), at(new THREE.BoxGeometry(r * 1.1, 0.035, r * 0.9), 0, r * 0.2, r * 0.95)]), main)];
      if (kind === 'leafcap') { const leaf = mk(hatGeo('leaf', () => [at(new THREE.SphereGeometry(0.1, 8, 6).scale(1, 0.35, 0.55), 0.04, r * 1.08, 0)]), band); leaf.rotation.z = -0.5; out.push(leaf); }
      return out;
    }
    case 'bucket': return [mk(hatGeo('bucket', () => [at(new THREE.CylinderGeometry(r * 0.8, r * 1.03, r * 0.6, 16), 0, r * 0.62, 0), at(new THREE.CylinderGeometry(r * 1.45, r * 1.3, 0.04, 20), 0, r * 0.32, 0)]), main)];
    case 'sunhat': case 'lottie': {
      const out = [mk(hatGeo('sunhat', () => [at(dome(r * 0.95, 0.9), 0, r * 0.3, 0), at(disc(r * 1.9, 0.035, 24), 0, r * 0.33, 0)]), main),
        mk(hatGeo('band', () => [at(new THREE.CylinderGeometry(r * 0.97, r * 0.97, 0.07, 18, 1, true), 0, r * 0.4, 0)]), band)];
      if (kind === 'lottie') {
        const lemon = mk(hatGeo('lemon', () => [at(new THREE.SphereGeometry(0.075, 10, 8).scale(1.3, 1, 1), 0, r * 0.42, r * 0.97)]), PAL.lemon, 0.5);
        out.push(lemon);
      }
      return out;
    }
    case 'bowler': return [mk(hatGeo('bowler', () => [at(dome(r * 0.92, 1.05), 0, r * 0.45, 0), at(disc(r * 1.25, 0.04), 0, r * 0.45, 0)]), main, 0.5),
      mk(hatGeo('bowlerband', () => [at(new THREE.CylinderGeometry(r * 0.93, r * 0.93, 0.07, 18, 1, true), 0, r * 0.52, 0)]), band, 0.4)];
    case 'straw': return [mk(hatGeo('straw', () => [at(new THREE.CylinderGeometry(r * 0.8, r * 0.88, r * 0.5, 16), 0, r * 0.7, 0), at(disc(r * 2.2, 0.04, 24), 0, r * 0.45, 0)]), main),
      mk(hatGeo('strawband', () => [at(new THREE.CylinderGeometry(r * 0.89, r * 0.89, 0.08, 16, 1, true), 0, r * 0.53, 0)]), band)];
    case 'flattop': return [mk(hatGeo('flattop', () => [at(new THREE.BoxGeometry(r * 1.75, r * 0.75, r * 1.75), 0, r * 0.62, -0.02)]), 0x2b2b33),
      mk(hatGeo('shades', () => [at(new THREE.BoxGeometry(r * 1.9, r * 0.24, r * 0.5), 0, r * 0.1, r * 0.78)]), 0x111118, 0.2)];
    case 'beanie': return [mk(hatGeo('beanie', () => [at(dome(r * 1.06, 1.15), 0, r * 0.12, -0.02), at(new THREE.SphereGeometry(r * 0.55, 12, 8), 0, r * 0.95, -r * 0.55)]), main),
      mk(hatGeo('beanieband', () => [at(new THREE.CylinderGeometry(r * 1.08, r * 1.08, 0.1, 18, 1, true), 0, r * 0.18, -0.02)]), band)];
    case 'visor': return [mk(hatGeo('visor', () => [at(new THREE.CylinderGeometry(r * 1.03, r * 1.03, 0.1, 18, 1, true), 0, r * 0.35, 0), at(new THREE.CylinderGeometry(r * 0.9, r * 0.9, 0.035, 16, 1, false, -Math.PI * 0.35, Math.PI * 0.7), 0, r * 0.3, r * 0.55)]), main),
      mk(hatGeo('zinc', () => [at(new THREE.SphereGeometry(0.05, 8, 6), 0, -r * 0.05, r * 0.98)]), band)];
    default: return [];
  }
}

/** Faction looks (spec: Characters table): hat, hat colors, body color. */
const CREW_HAT: Record<FactionId, [HatKind, number, number]> = {
  player: ['leafcap', PAL.lemon, PAL.peel],
  sourwood: ['bowler', 0x2a1633, 0xc9a227],
  hollis: ['straw', 0xe9c46a, 0xd64545],
  fizzco: ['flattop', 0x2b2b33, 0x111118],
  coldbrew: ['beanie', 0xff4fa3, 0x3b2a20],
  blenders: ['visor', 0x00a6a6, 0xffffff],
};

export interface PegOpts { body?: number; skin?: number; hat?: HatKind; hatColor?: number; band?: number; scale?: number; round?: number; mitten?: number }

/** One peg doll. userData: hands [left, right], head, body, skin. */
export function makePeg(o: PegOpts = {}): THREE.Group {
  const g = new THREE.Group();
  const skin = o.skin ?? pick(SKIN);
  const body = new THREE.Mesh(bodyGeo, paint(o.body ?? pick(SHIRTS), { rough: 0.7 }));
  body.position.y = 0.45;
  if (o.round) body.scale.set(o.round, 1, o.round);
  body.castShadow = true;
  g.add(body);
  const head = new THREE.Mesh(headGeo, faceMat(skin));
  head.position.y = HEAD_Y;
  head.castShadow = true;
  g.add(head);
  for (const h of hat(o.hat ?? 'none', o.hatColor ?? 0xfff6dc, o.band ?? PAL.indigo)) head.add(h);
  const hands: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const hand = new THREE.Mesh(handGeo, paint(o.mitten ?? skin, { rough: 0.7 }));
    hand.position.set(s * (BODY_R * (o.round ?? 1) + 0.1), 0.5, 0.05);
    hand.castShadow = true;
    g.add(hand);
    hands.push(hand);
  }
  g.userData = { hands, head, body, skin, baseHandY: 0.5 };
  if (o.scale) g.scale.setScalar(o.scale);
  return g;
}

/** A passer-by: soft hat or none, random shirt and skin. */
export function makePerson(shirt?: number, _pants?: number, skin?: number, scale = 1): THREE.Group {
  const r = Math.random();
  const hatKind: HatKind = r < 0.45 ? 'none' : r < 0.65 ? 'cap' : r < 0.85 ? 'bucket' : 'sunhat';
  return makePeg({ body: shirt, skin, scale, hat: hatKind, hatColor: pick(SOFT_HATS), band: pick(SHIRTS) });
}

/** A crew member or henchman in their side's colors and hat. */
export function makeCrew(owner: FactionId, scale = 1): THREE.Group {
  const [kind, hc, band] = CREW_HAT[owner];
  const st = OWNER_STYLE[owner];
  return makePeg({ body: st.main, hat: kind, hatColor: hc, band, scale, mitten: owner === 'player' ? 0xfff6dc : undefined });
}

/** Grandma Lottie: short and round, in a sun hat with a lemon on the band. */
export function makeLottie(): THREE.Group {
  const g = makePeg({ body: 0xb48ee0, skin: SKIN[1], hat: 'lottie', hatColor: 0xfff6dc, band: PAL.lemon, round: 1.3, scale: 0.85 });
  return g;
}

/** Weapons by tier, reskinned per side (spec: Characters crew table). */
const wood = 0x8b5a2b;
const weapons = new Map<string, THREE.Group>();
export function weaponFor(owner: FactionId, kind: 'fists' | 'clubs' | 'hatchets'): THREE.Object3D | null {
  if (kind === 'fists') return null;
  const key = `${owner}|${kind}`;
  let w = weapons.get(key);
  if (!w) { w = buildWeapon(owner, kind); weapons.set(key, w); }
  return w.clone(); // clones share geometry and paint
}
function buildWeapon(owner: FactionId, kind: 'clubs' | 'hatchets'): THREE.Group {
  const g = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, color: number, x: number, y: number, z: number, rough = 0.7) => {
    const m = new THREE.Mesh(geo, paint(color, { rough }));
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  if (kind === 'clubs') {
    switch (owner) {
      case 'player': add(new THREE.CylinderGeometry(0.05, 0.035, 0.75, 8), 0xd9b98a, 0, 0.3, 0); add(new THREE.CylinderGeometry(0.045, 0.045, 0.2, 8), PAL.lemon, 0, 0.05, 0); break;
      case 'sourwood': add(new THREE.CylinderGeometry(0.025, 0.025, 0.75, 6), 0x1b1b1b, 0, 0.3, 0, 0.3); add(new THREE.SphereGeometry(0.05, 8, 6), 0xc0c8d0, 0, 0.68, 0, 0.2); break;
      case 'hollis': add(new THREE.CylinderGeometry(0.025, 0.025, 0.7, 6), wood, 0, 0.3, 0); add(new THREE.BoxGeometry(0.2, 0.25, 0.03), 0x8a9099, 0, 0.72, 0, 0.4); break;
      case 'fizzco': add(new THREE.CylinderGeometry(0.035, 0.035, 0.7, 8), 0x111118, 0, 0.3, 0, 0.3); break;
      case 'coldbrew': add(new THREE.BoxGeometry(0.2, 0.75, 0.04), 0xff4fa3, 0, 0.35, 0); for (const y of [0.1, 0.6]) add(new THREE.CylinderGeometry(0.035, 0.035, 0.26, 8).rotateZ(Math.PI / 2), 0xffffff, 0, y, -0.04); break;
      case 'blenders': add(new THREE.CapsuleGeometry(0.12, 0.65, 4, 10).scale(1, 1, 0.25), 0x00a6a6, 0, 0.42, 0); break;
    }
  } else {
    const handle = { player: 0xf6d33c, sourwood: 0x2a1633, hollis: wood, fizzco: 0x2b2b33, coldbrew: 0xff4fa3, blenders: 0x00a6a6 }[owner];
    const head = { player: 0xb8c2cc, sourwood: 0xe8e8f0, hollis: 0x8a9099, fizzco: 0xdfe6ee, coldbrew: 0xb8c2cc, blenders: 0xb8c2cc }[owner];
    add(new THREE.CylinderGeometry(0.03, 0.035, 0.55, 6), handle, 0, 0.25, 0);
    if (owner === 'player') for (const y of [0.1, 0.3]) add(new THREE.CylinderGeometry(0.038, 0.038, 0.07, 6), 0xffffff, 0, y, 0);
    add(new THREE.BoxGeometry(0.04, 0.17, 0.2), head, 0, 0.47, 0.09, 0.3);
  }
  g.rotation.x = Math.PI / 2.6;
  return g;
}

/** Walk cycle: a waddle and bob with the mittens swinging. */
export function animateWalk(o: THREE.Object3D, phase: number, ground = 0.12) {
  const [l, r] = o.userData.hands as THREE.Mesh[];
  const sw = Math.sin(phase);
  l.position.z = 0.05 + sw * 0.13;
  r.position.z = 0.05 - sw * 0.13;
  l.position.y = r.position.y = o.userData.baseHandY + Math.abs(sw) * 0.03;
  o.position.y = ground + Math.abs(Math.cos(phase)) * 0.07;
  (o.userData.body as THREE.Mesh).rotation.z = sw * 0.07;
}
/** Ease back to standing still. */
export function animateIdle(o: THREE.Object3D) {
  const [l, r] = o.userData.hands as THREE.Mesh[];
  l.position.z += (0.05 - l.position.z) * 0.2;
  r.position.z += (0.05 - r.position.z) * 0.2;
  (o.userData.body as THREE.Mesh).rotation.z *= 0.8;
}

// Kids carry balloons (spec: customer props).
const balloonGeo = new THREE.SphereGeometry(0.2, 12, 10).scale(1, 1.2, 1);
const stringGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.9, 3);
function balloon(): THREE.Group {
  const g = new THREE.Group();
  const b = new THREE.Mesh(balloonGeo, paint(pick([0xef476f, 0x2bb3b1, 0xf6d33c, 0x9b5de5]), { rough: 0.35 }));
  b.position.y = 1.05;
  const s = new THREE.Mesh(stringGeo, paint(0xffffff));
  s.position.y = 0.5;
  g.add(b, s);
  g.position.set(0.34, 0.5, 0.05);
  g.visible = false;
  return g;
}

interface Walker {
  obj: THREE.Group;
  active: boolean;
  path: THREE.Vector3[];
  leg: number;
  wait: number;
  phase: number;
  speed: number;
  popup?: { text: string; kind: 'sale' | 'miss'; atCounter: boolean };
  shown: boolean;
  grumbleX: number;
}

export type WalkerKind = 'pass' | 'sale' | 'miss' | 'grumble';

/** Where a walker goes: along a sidewalk from x0 to x1, optionally detouring to a counter. */
export interface Route { x0: number; x1: number; z: number; serve?: THREE.Vector3; grumbleX?: number }

export interface Crowd {
  /** sale/miss detour to the counter; grumble pops its text while walking past. */
  spawn(kind: WalkerKind, route: Route, text?: string, opts?: { scale?: number; speed?: number }): boolean;
  update(dt: number, speedScale: number): void;
  clear(): void;
  activeCount(): number;
}

/** Laptop cap from the spec (about 150 animated people in Street View). */
export const CROWD_POOL = 150;

export function createCrowd(scene: THREE.Scene, onArrive: (pos: THREE.Vector3, text: string, kind: 'sale' | 'miss') => void, pool = CROWD_POOL): Crowd {
  const walkers: Walker[] = [];
  for (let i = 0; i < pool; i++) {
    const obj = makePerson();
    obj.userData.balloon = balloon();
    obj.add(obj.userData.balloon);
    obj.visible = false;
    scene.add(obj);
    walkers.push({ obj, active: false, path: [], leg: 0, wait: 0, phase: 0, speed: 0, shown: false, grumbleX: 0 });
  }
  let queueSlot = 0;

  return {
    spawn(kind, route, text = '', opts = {}) {
      const w = walkers.find((x) => !x.active);
      if (!w) return false; // pool full: the sale still counts, we just don't draw it
      const dir = route.x1 > route.x0 ? 1 : -1;
      const z = route.z + (Math.random() - 0.5) * 1.2;
      const start = new THREE.Vector3(route.x0, 0.12, z);
      const end = new THREE.Vector3(route.x1, 0.12, z);
      w.path = [start];
      if ((kind === 'sale' || kind === 'miss') && route.serve) {
        const slot = (queueSlot++ % 5) - 2;
        const counter = route.serve.clone().add(new THREE.Vector3(slot * 0.55, 0, 0));
        w.path.push(new THREE.Vector3(counter.x - dir * 1.5, 0.12, z), counter, new THREE.Vector3(counter.x + dir * 1.5, 0.12, z));
        w.popup = { text, kind, atCounter: true };
      } else {
        w.popup = kind === 'grumble' ? { text, kind: 'miss', atCounter: false } : undefined;
      }
      w.grumbleX = route.grumbleX ?? (route.x0 + route.x1) / 2;
      w.shown = false;
      w.obj.scale.setScalar(opts.scale ?? 1);
      (w.obj.userData.balloon as THREE.Object3D).visible = (opts.scale ?? 1) < 0.75 && Math.random() < 0.5;
      w.path.push(end);
      w.leg = 1;
      w.wait = 0;
      w.phase = Math.random() * 6;
      w.speed = (2.4 + Math.random() * 0.9) * (opts.speed ?? 1);
      w.obj.position.copy(start);
      w.obj.visible = true;
      w.active = true;
      return true;
    },
    update(dt, speedScale) {
      const step = dt * Math.min(speedScale, 4);
      for (const w of walkers) {
        if (!w.active) continue;
        if (w.wait > 0) {
          w.wait -= step;
          animateIdle(w.obj);
          continue;
        }
        const target = w.path[w.leg];
        const pos = w.obj.position;
        const dx = target.x - pos.x, dz = target.z - pos.z;
        const dist = Math.hypot(dx, dz);
        const move = w.speed * step;
        if (dist <= move) {
          pos.set(target.x, pos.y, target.z);
          // Arrived at the counter (the middle waypoint of a detour).
          if (w.popup?.atCounter && w.leg === 2) {
            w.wait = w.popup.kind === 'sale' ? 0.9 : 0.4;
            onArrive(pos.clone().setY(2.1 * w.obj.scale.y), w.popup.text, w.popup.kind);
          }
          w.leg++;
          if (w.leg >= w.path.length) { w.active = false; w.obj.visible = false; }
          continue;
        }
        if (w.popup && !w.popup.atCounter && !w.shown && Math.abs(pos.x - w.grumbleX) < 1) {
          w.shown = true;
          onArrive(pos.clone().setY(2.1 * w.obj.scale.y), w.popup.text, 'miss');
        }
        pos.x += (dx / dist) * move;
        pos.z += (dz / dist) * move;
        w.obj.rotation.y = Math.atan2(dx, dz);
        w.phase += step * w.speed * 3.2;
        animateWalk(w.obj, w.phase);
      }
    },
    clear() {
      for (const w of walkers) { w.active = false; w.obj.visible = false; }
    },
    activeCount() { return walkers.filter((w) => w.active).length; },
  };
}
