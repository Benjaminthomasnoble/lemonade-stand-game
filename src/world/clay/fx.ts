// Clay effects (spec "Brawls", "VIP arrivals", "Juice and motion"): lumpy
// dust puffs, Walnut wood chips, gold stars, clay-pellet confetti, flattened
// grass rings under a rotor, and sound words on cut-paper starbursts. Each kind
// is one instanced draw from a small pool, and everything steps on twos.
// Clay is opaque, so pieces fade by shrinking away, never by going see-through.
import * as THREE from 'three';
import { Baker, sph, box, cone, lumpy, hash, canvasTex, GLOSS, PAPER } from './core.ts';
import { P } from './palette.ts';
import { kit } from './kit.ts';

const INK = '#2E2A4F';
const v = new THREE.Vector3(), s3 = new THREE.Vector3(), q = new THREE.Quaternion(), e = new THREE.Euler(), m4 = new THREE.Matrix4();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const eY = new THREE.Euler(0, 0, 0, 'YXZ');

/** Reduced motion: no shakes or flashes, and fewer flying bits. */
export const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
/** Phones run one level simpler (spec "Built from clay"). */
export const onPhone = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820;

interface Bit { x: number; y: number; z: number; vx: number; vy: number; vz: number; spin: number; age: number; life: number; size: number; grav: number; drag: number; flat: boolean }

/** A pool of short-lived clay bits drawn as one InstancedMesh. */
class Pool {
  mesh: THREE.InstancedMesh;
  bits: (Bit | null)[];
  next = 0;
  constructor(scene: THREE.Scene, geo: THREE.BufferGeometry, n: number, colors?: string[]) {
    this.mesh = new THREE.InstancedMesh(geo, kit().fig, n);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.bits = Array(n).fill(null);
    for (let i = 0; i < n; i++) this.mesh.setMatrixAt(i, ZERO);
    this.mesh.visible = false; // an idle pool costs no draw
    if (colors) for (let i = 0; i < n; i++) this.mesh.setColorAt(i, new THREE.Color(colors[i % colors.length]));
    scene.add(this.mesh);
  }
  spawn(b: Bit) { this.mesh.visible = true; this.bits[this.next] = b; this.next = (this.next + 1) % this.bits.length; }
  step(dt: number) {
    if (!this.mesh.visible) return;
    let any = false, live = 0;
    this.bits.forEach((b, i) => {
      if (!b) return;
      b.age += dt;
      if (b.age >= b.life) { this.bits[i] = null; this.mesh.setMatrixAt(i, ZERO); any = true; return; }
      live++;
      const k = Math.exp(-b.drag * dt);
      b.vx *= k; b.vz *= k; b.vy = b.vy * k - b.grav * dt;
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      if (b.y < 0.03 && b.grav > 0) { b.y = 0.03; b.vy *= -0.35; b.vx *= 0.6; b.vz *= 0.6; b.spin *= 0.5; }
      const u = b.age / b.life;
      // pop in fast, hold, then shrink away
      const sz = b.size * Math.min(1, u * 8) * (u > 0.7 ? 1 - (u - 0.7) / 0.3 : 1);
      e.set(b.spin * b.age, b.spin * b.age * 0.7, b.spin * b.age * 0.4);
      q.setFromEuler(e);
      this.mesh.setMatrixAt(i, m4.compose(v.set(b.x, b.y, b.z), q, b.flat ? s3.set(sz, sz * 0.3, sz) : s3.setScalar(sz)));
      any = true;
    });
    if (any) this.mesh.instanceMatrix.needsUpdate = true;
    if (!live) this.mesh.visible = false;
  }
  clear() { this.mesh.visible = false; this.bits.fill(null); for (let i = 0; i < this.bits.length; i++) this.mesh.setMatrixAt(i, ZERO); this.mesh.instanceMatrix.needsUpdate = true; }
}

function starGeo(r0: number, r1: number) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 + Math.PI / 2, r = i % 2 ? r1 : r0; if (i) s.lineTo(Math.cos(a) * r, Math.sin(a) * r); else s.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.04, bevelEnabled: true, bevelSize: 0.025, bevelThickness: 0.025, bevelSegments: 1 });
  g.center();
  return g;
}
/** A gold clay star (also used for the orbiting KO stars). */
export function starGeometry() { const B = new Baker(); B.add(starGeo(0.16, 0.07), P.gold, { fx: GLOSS + 0.4 }); return B.build(); }

// ---------- sound words on cut-paper starbursts ----------
const wordCache = new Map<string, THREE.CanvasTexture>();
/** The starburst texture for a word, inked in a side's colours. */
export function wordTexture(word: string, fill: string, edge: string) {
  const key = `${word}|${fill}|${edge}`;
  let t = wordCache.get(key);
  if (t) return t;
  const draw = (c: CanvasRenderingContext2D) => {
    c.clearRect(0, 0, 512, 256);
    c.beginPath();
    const n = 14;
    for (let i = 0; i <= n * 2; i++) { const a = (i / (n * 2)) * Math.PI * 2, r = i % 2 ? 92 : 124 + hash(i, word.length) * 18; c.lineTo(256 + Math.cos(a) * r * 1.75, 128 + Math.sin(a) * r * 0.95); }
    c.closePath();
    c.fillStyle = '#FFF4DC'; c.fill(); c.lineWidth = 7; c.strokeStyle = INK; c.stroke();
    let fs = 112;
    c.font = `${fs}px "Chewy", "Comic Sans MS", cursive`;
    while (c.measureText(word).width > 380 && fs > 50) { fs -= 6; c.font = `${fs}px "Chewy", "Comic Sans MS", cursive`; }
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
    c.lineWidth = 16; c.strokeStyle = edge; c.strokeText(word, 256, 134);
    c.fillStyle = fill; c.fillText(word, 256, 134);
    c.lineWidth = 4; c.strokeStyle = INK; c.strokeText(word, 256, 134);
  };
  t = canvasTex(512, 256, draw) as THREE.CanvasTexture;
  // redraw once the display font has arrived
  if (typeof document !== 'undefined' && document.fonts) void document.fonts.load('112px "Chewy"').then(() => t!.userData.redraw?.(draw)).catch(() => {});
  wordCache.set(key, t);
  return t;
}

interface Word { sprite: THREE.Sprite; age: number; life: number; w: number; rise: number; tilt: number }

export interface Fx {
  /** Lumpy cream and sand puffs that roll out and shrink away. */
  dust(at: THREE.Vector3, n?: number, spread?: number): void;
  /** Walnut wood chips: hatchets and crowbars only ever bite wood. */
  chips(at: THREE.Vector3, n?: number): void;
  /** Gold stars bursting out of a fight. */
  stars(at: THREE.Vector3, n?: number): void;
  /** Clay-pellet confetti, lemon by default. */
  pellets(at: THREE.Vector3, n?: number): void;
  /** White water puffs (a ship's bow, a dropped crate in the bay). */
  splash(at: THREE.Vector3, n?: number): void;
  /** Rotor wash: grass tufts on the lawn just outside `radius`, pressed flat outward in a ring, then springing back. */
  ring(at: THREE.Vector3, radius?: number): void;
  /** A sound word on a cut-paper starburst, coloured for the side that landed it. */
  word(at: THREE.Vector3, text: string, fill: string, edge?: string, size?: number): void;
  update(dt: number): void;
  clear(): void;
}

export function createFx(scene: THREE.Scene): Fx {
  const few = reducedMotion() ? 0.5 : 1;
  const puffG = (() => { const B = new Baker(); B.add(lumpy(sph(0.4, 12, 9), 0.07, 3, 2), '#ffffff'); return B.build(); })();
  const chipG = (() => { const B = new Baker(); B.add(box(0.16, 0.05, 0.1), '#ffffff', { fx: PAPER }); return B.build(); })();
  const pelletG = (() => { const B = new Baker(); B.add(lumpy(sph(0.07, 8, 6), 0.01, 8, 1), '#ffffff'); return B.build(); })();
  // a tuft of three thin clay grass blades, rooted at the origin and leaning out along +z
  const bladeG = (() => {
    const B = new Baker();
    for (const [x, l] of [[-0.08, 0.42], [0, 0.52], [0.08, 0.38]] as const) B.add(cone(0.035, l, 4), '#ffffff', { p: [x, 0, l * 0.5], r: [Math.PI / 2, 0, 0], s: [1, 1, 0.45] });
    return B.build();
  })();
  const dust = new Pool(scene, puffG, 64, ['#FFF1D6', '#F3DDA6', '#FFFDF6', '#E9D3A8']);
  const chips = new Pool(scene, chipG, 40, [P.walnut, '#A9784F', P.stick, '#6E4A2C']);
  const stars = new Pool(scene, starGeometry(), 24);
  const pellets = new Pool(scene, pelletG, 60, [P.lemon, '#FFFFFF', P.lemon, P.green, P.blush]);
  const splash = new Pool(scene, puffG, 24, ['#FFFFFF', '#E8F7F8']);
  // Rotor wash: grass tufts on the lawn around the pad, pressed flat outward in a ring, then springing back
  const BLADES = 48;
  const blades = new THREE.InstancedMesh(bladeG, kit().fig, BLADES);
  blades.frustumCulled = false;
  blades.visible = false;
  for (let i = 0; i < BLADES; i++) { blades.setMatrixAt(i, ZERO); blades.setColorAt(i, new THREE.Color(shadeHex(P.green, i % 3 ? 0.08 : 0.14))); }
  scene.add(blades);
  const tufts: ({ x: number; z: number; yaw: number; r0: number; age: number; life: number } | null)[] = Array(BLADES).fill(null);
  let nextTuft = 0;
  const stepTufts = (dt: number) => {
    if (!blades.visible) return;
    let live = 0;
    tufts.forEach((b, i) => {
      if (!b) return;
      b.age += dt;
      if (b.age >= b.life) { tufts[i] = null; blades.setMatrixAt(i, ZERO); return; }
      live++;
      const u = b.age / b.life;
      // pressed flat as the wash rolls out, then the blades spring back up and settle into the lawn
      const press = u < 0.25 ? u / 0.25 : 1 - (u - 0.25) / 0.75;
      const r = b.r0 + Math.min(1, u * 2.5) * 0.9;
      q.setFromEuler(eY.set(-(0.05 + (1 - press) * 1.1), b.yaw, 0));
      const sz = u > 0.8 ? 1 - (u - 0.8) / 0.2 : 1;
      blades.setMatrixAt(i, m4.compose(v.set(b.x + Math.sin(b.yaw) * r, 0.04, b.z + Math.cos(b.yaw) * r), q, s3.setScalar(sz * 1.3)));
    });
    blades.instanceMatrix.needsUpdate = true;
    if (!live) blades.visible = false;
  };
  const words: Word[] = [];
  let acc = 0, lastF = -1;

  const rnd = Math.random;
  const burst = (pool: Pool, at: THREE.Vector3, n: number, o: { speed: number; up: number; life: number; size: number; grav: number; drag?: number; spin?: number; flat?: boolean }) => {
    for (let i = 0; i < Math.round(n * few); i++) {
      const a = rnd() * Math.PI * 2, sp = o.speed * (0.5 + rnd() * 0.7);
      pool.spawn({ x: at.x, y: at.y, z: at.z, vx: Math.cos(a) * sp, vy: o.up * (0.6 + rnd() * 0.6), vz: Math.sin(a) * sp, spin: (rnd() - 0.5) * (o.spin ?? 8), age: 0, life: o.life * (0.8 + rnd() * 0.4), size: o.size * (0.7 + rnd() * 0.6), grav: o.grav, drag: o.drag ?? 1.5, flat: !!o.flat });
    }
  };

  return {
    dust(at, n = 6, spread = 0.6) {
      for (let i = 0; i < Math.round(n * few); i++) {
        const a = rnd() * Math.PI * 2, r = spread * rnd();
        dust.spawn({ x: at.x + Math.cos(a) * r, y: at.y + rnd() * 0.3, z: at.z + Math.sin(a) * r, vx: Math.cos(a) * 1.2, vy: 0.6 + rnd() * 0.6, vz: Math.sin(a) * 1.2, spin: (rnd() - 0.5) * 2, age: 0, life: 0.7 + rnd() * 0.5, size: 0.6 + rnd() * 0.6, grav: 0, drag: 3, flat: false });
      }
    },
    chips(at, n = 7) { burst(chips, at, n, { speed: 3, up: 3.5, life: 1.1, size: 1, grav: 12, spin: 14 }); },
    stars(at, n = 3) { burst(stars, at, n, { speed: 2.4, up: 3, life: 0.9, size: 1, grav: 6, spin: 6 }); },
    pellets(at, n = 16) { burst(pellets, at, n, { speed: 2.6, up: 5, life: 1.6, size: 1, grav: 10, spin: 4 }); },
    splash(at, n = 6) { burst(splash, at, n, { speed: 1.4, up: 2.2, life: 0.8, size: 0.5, grav: 7, spin: 2 }); },
    ring(at, radius = 2.2) {
      // a ring of tufts on the grass just outside the radius (never on the pad itself)
      blades.visible = true;
      const n = Math.round(16 * few), off = rnd() * 6;
      for (let i = 0; i < n; i++) {
        tufts[nextTuft] = { x: at.x, z: at.z, yaw: off + (i / n) * Math.PI * 2 + (rnd() - 0.5) * 0.2, r0: radius + 0.15 + rnd() * 0.25, age: 0, life: 1.1 + rnd() * 0.3 };
        nextTuft = (nextTuft + 1) % BLADES;
      }
    },
    word(at, text, fill, edge = INK, size = 1) {
      const mat = new THREE.SpriteMaterial({ map: wordTexture(text, fill, edge), transparent: true, depthWrite: false, depthTest: false });
      const sprite = new THREE.Sprite(mat);
      sprite.position.copy(at);
      sprite.renderOrder = 20;
      sprite.scale.set(0, 0, 1);
      scene.add(sprite);
      words.push({ sprite, age: 0, life: 0.95, w: 1.7 * size, rise: 0.5 + rnd() * 0.3, tilt: (rnd() - 0.5) * 0.4 });
      while (words.length > 8) { const w = words.shift()!; scene.remove(w.sprite); w.sprite.material.dispose(); }
    },
    update(dt) {
      acc += dt;
      const f = kit().twos.f;
      if (f === lastF) return;
      lastF = f;
      const step = Math.min(acc, 0.25);
      acc = 0;
      for (const p of [dust, chips, stars, pellets, splash]) p.step(step);
      stepTufts(step);
      for (let i = words.length - 1; i >= 0; i--) {
        const w = words[i];
        w.age += step;
        const u = w.age / w.life;
        if (u >= 1) { scene.remove(w.sprite); w.sprite.material.dispose(); words.splice(i, 1); continue; }
        // slap on with one bounce, hold, then shrink away
        const pop = u < 0.12 ? 1.35 * (u / 0.12) : u < 0.22 ? 1.35 - 0.35 * ((u - 0.12) / 0.1) : u > 0.8 ? 1 - (u - 0.8) / 0.2 : 1;
        w.sprite.scale.set(w.w * pop, w.w * 0.5 * pop, 1);
        w.sprite.position.y += w.rise * step;
        w.sprite.material.rotation = w.tilt;
      }
    },
    clear() {
      for (const p of [dust, chips, stars, pellets, splash]) p.clear();
      tufts.fill(null); blades.visible = false;
      for (let i = 0; i < BLADES; i++) blades.setMatrixAt(i, ZERO);
      blades.instanceMatrix.needsUpdate = true;
      for (const w of words) { scene.remove(w.sprite); w.sprite.material.dispose(); }
      words.length = 0;
    },
  };
}

function shadeHex(hex: string, k: number) {
  const c = new THREE.Color(hex), hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + k)));
  return '#' + c.getHexString();
}
