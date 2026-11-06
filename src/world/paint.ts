// Toy-Town Noir paint box (spec: Visual style and art direction).
// Painted-wood materials with lighter top faces, sanded (rounded) blocks,
// owner patterns, citrus-crate labels and the shared night glow that lamps,
// windows and neon read from.
import * as THREE from 'three/webgpu';
import { float, materialColor, materialEmissive, max, mix, normalWorld, smoothstep, uniform } from 'three/tsl';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { FACTIONS, type FactionId } from '../sim/economy.ts';

/** World palette (spec: Palette and patterns). */
export const PAL = {
  pith: 0xfff6dc, peel: 0x5fa35a, bay: 0x2bb3b1, coral: 0xf2795b, indigo: 0x23214a,
  amber: 0xffb347, driftwood: 0xc9a47a, asphalt: 0x6b6779, paperWash: 0xe9e4d6, lemon: 0xf6d33c,
} as const;

export interface OwnerStyle { main: number; accent: number; third?: number; pattern: string; edge: boolean }
export const OWNER_STYLE: Record<FactionId, OwnerStyle> = {
  player: { main: 0xf6d33c, accent: 0xffffff, pattern: 'stripes', edge: true },
  sourwood: { main: 0x5b2a6e, accent: 0xc9a227, pattern: 'damask', edge: false },
  hollis: { main: 0xb5651d, accent: 0xd64545, pattern: 'gingham', edge: true },
  fizzco: { main: 0xc8102e, accent: 0xb8c2cc, pattern: 'bubbles', edge: false },
  coldbrew: { main: 0x3b2a20, accent: 0xe8dcc4, third: 0xff4fa3, pattern: 'zigzag', edge: false },
  blenders: { main: 0xff9f1c, accent: 0x00a6a6, pattern: 'waves', edge: true },
};
// Keep the faction table and the art table on the same colors.
for (const id of Object.keys(FACTIONS) as (keyof typeof FACTIONS)[]) OWNER_STYLE[id].main = FACTIONS[id].color;

export const css = (n: number) => '#' + n.toString(16).padStart(6, '0');

/** 0 by day, 1 at night: lamps, lit windows and neon all follow it. */
export const nightGlow = uniform(0);
/** Raids set this so the brawl plays in noir light, whatever the clock says. */
export const mood = { noir: false };
/** 0 until golden hour, then 1: neon flickers on at 19:30. */
export const neonGlow = uniform(0);

// ---------------------------------------------------------------- materials

const paints = new Map<string, THREE.MeshStandardNodeMaterial>();
// Node graphs are shared by every paint so all colors compile to one shader
// (colors live in material uniforms, never baked into the shader code).
const topLift = smoothstep(float(0.55), float(0.95), normalWorld.y);
const paintColor = mix(materialColor, materialColor.mul(1.14).add(0.03), topLift);
const nightEmissive = materialEmissive.mul(nightGlow);
const neonEmissive = materialEmissive.mul(max(neonGlow, nightGlow));
/**
 * Painted wood: flat color, a touch lighter on top faces (like a sanded
 * edge catching the light). Cached by color so the bay shares materials.
 */
export function paint(hex: number, opts: { rough?: number; metal?: number; glow?: 'night' | 'neon' | 'always'; glowColor?: number; glowStrength?: number } = {}) {
  const key = `${hex}|${opts.rough ?? 0.85}|${opts.metal ?? 0}|${opts.glow ?? ''}|${opts.glowColor ?? ''}|${opts.glowStrength ?? ''}`;
  let m = paints.get(key);
  if (m) return m;
  m = new THREE.MeshStandardNodeMaterial({ color: hex, roughness: opts.rough ?? 0.85, metalness: opts.metal ?? 0 });
  m.colorNode = paintColor;
  if (opts.glow) {
    m.emissive.setHex(opts.glowColor ?? hex);
    m.emissiveIntensity = opts.glowStrength ?? 1.4;
    if (opts.glow !== 'always') m.emissiveNode = opts.glow === 'neon' ? neonEmissive : nightEmissive;
  }
  paints.set(key, m);
  return m;
}

/** Dark glass that turns into an amber lit window after dusk. */
export const windowMat = () => paint(PAL.indigo, { rough: 0.3, glow: 'night', glowColor: PAL.amber, glowStrength: 1.1 });

// ---------------------------------------------------------------- geometry

const blocks = new Map<string, THREE.BufferGeometry>();
/** A sanded toy block: rounded edges when it is big enough to notice. */
export function block(w: number, h: number, d: number): THREE.BufferGeometry {
  const key = `${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}`;
  let g = blocks.get(key);
  if (g) return g;
  const small = Math.min(w, h, d);
  g = small >= 0.2 ? new RoundedBoxGeometry(w, h, d, 1, Math.min(0.08, small * 0.18)) : new THREE.BoxGeometry(w, h, d);
  blocks.set(key, g);
  return g;
}

// ---------------------------------------------------------------- patterns

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')!] as const;
}

/** Paint one owner's pattern into a w×h area of a 2D context. */
export function drawPattern(g: CanvasRenderingContext2D, owner: FactionId, w: number, h: number, cell = 64) {
  const st = OWNER_STYLE[owner];
  const main = css(st.main), acc = css(st.accent), ink = css(PAL.indigo);
  g.save();
  g.beginPath(); g.rect(0, 0, w, h); g.clip();
  g.fillStyle = main; g.fillRect(0, 0, w, h);
  const edge = (draw: () => void, width: number) => {
    if (!st.edge) return;
    g.strokeStyle = ink; g.lineWidth = width; draw();
  };
  switch (st.pattern) {
    case 'stripes': { // wide vertical stripes
      for (let x = 0; x < w; x += cell) {
        g.fillStyle = acc; g.fillRect(x + cell / 2, 0, cell / 2, h);
        edge(() => { g.beginPath(); g.moveTo(x + cell / 2, 0); g.lineTo(x + cell / 2, h); g.moveTo(x + cell, 0); g.lineTo(x + cell, h); g.stroke(); }, cell / 32);
      }
      break;
    }
    case 'damask': { // diamond lattice with a little gold bud in each diamond
      g.strokeStyle = acc; g.lineWidth = cell / 16;
      for (let k = -h; k < w + h; k += cell) {
        g.beginPath(); g.moveTo(k, 0); g.lineTo(k + h, h); g.stroke();
        g.beginPath(); g.moveTo(k + h, 0); g.lineTo(k, h); g.stroke();
      }
      g.fillStyle = acc;
      for (let y = 0; y <= h; y += cell) for (let x = cell / 2; x <= w + cell; x += cell) {
        const yy = y + cell / 2;
        g.beginPath(); g.moveTo(x, yy - cell * 0.18); g.lineTo(x + cell * 0.1, yy); g.lineTo(x, yy + cell * 0.18); g.lineTo(x - cell * 0.1, yy); g.closePath(); g.fill();
      }
      break;
    }
    case 'gingham': { // see-through red bands both ways
      g.fillStyle = acc;
      g.globalAlpha = 0.55;
      for (let x = 0; x < w; x += cell) g.fillRect(x, 0, cell / 2, h);
      for (let y = 0; y < h; y += cell) g.fillRect(0, y, w, cell / 2);
      g.globalAlpha = 1;
      edge(() => { g.beginPath(); for (let x = 0; x <= w; x += cell / 2) { g.moveTo(x, 0); g.lineTo(x, h); } g.stroke(); }, cell / 40);
      break;
    }
    case 'bubbles': { // chrome dots of a few sizes
      g.fillStyle = acc;
      for (let y = 0; y < h + cell; y += cell / 2) for (let x = 0; x < w + cell; x += cell / 2) {
        const r = ((x * 7 + y * 13) / (cell / 2)) % 3 === 0 ? cell * 0.16 : ((x + y) / (cell / 2)) % 2 ? cell * 0.09 : cell * 0.05;
        const ox = (y / (cell / 2)) % 2 ? cell / 4 : 0;
        g.beginPath(); g.arc(x + ox, y, r, 0, Math.PI * 2); g.fill();
      }
      break;
    }
    case 'zigzag': { // diagonal pink zigzag on espresso, with an oat hairline
      const pink = css(st.third ?? 0xff4fa3);
      for (let off = -h; off < w + h; off += cell) {
        g.beginPath();
        for (let y = -cell, i = 0; y <= h + cell; y += cell / 3, i++) g.lineTo(off + y * 0.6 + (i % 2 ? cell / 5 : -cell / 5), y);
        g.strokeStyle = pink; g.lineWidth = cell / 7; g.stroke();
        g.strokeStyle = acc; g.lineWidth = cell / 40; g.stroke();
      }
      break;
    }
    case 'waves': { // horizontal teal waves
      for (let y = cell / 4; y < h + cell; y += cell / 2) {
        g.beginPath();
        for (let x = 0; x <= w; x += 4) g.lineTo(x, y + Math.sin((x / cell) * Math.PI * 2) * cell * 0.1);
        g.strokeStyle = ink; g.lineWidth = cell / 7; g.stroke();
        g.strokeStyle = acc; g.lineWidth = cell / 10; g.stroke();
      }
      break;
    }
  }
  g.restore();
}

const patternCache = new Map<string, THREE.CanvasTexture>();
/** A tiling 128×128 pattern texture for an owner (awnings, flags, tiles). */
export function patternTexture(owner: FactionId, repeat = 1): THREE.CanvasTexture {
  const key = `${owner}|${repeat}`;
  let t = patternCache.get(key);
  if (t) return t;
  const [c, g] = canvas(128, 128);
  drawPattern(g, owner, 128, 128, 64);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  patternCache.set(key, t);
  return t;
}

const patternMats = new Map<string, THREE.MeshStandardNodeMaterial>();
/** Painted fabric or boards in an owner's pattern. */
export function patternMat(owner: FactionId, repeat = 1, opts: { side?: THREE.Side } = {}) {
  const key = `${owner}|${repeat}|${opts.side ?? 0}`;
  let m = patternMats.get(key);
  if (!m) {
    m = new THREE.MeshStandardNodeMaterial({ map: patternTexture(owner, repeat), roughness: 0.8, side: opts.side ?? THREE.FrontSide });
    patternMats.set(key, m);
  }
  return m;
}

// ---------------------------------------------------------------- crate labels

type Emblem = (g: CanvasRenderingContext2D, cx: number, cy: number, r: number) => void;

function lemonShape(g: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number) {
  g.beginPath();
  g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  g.moveTo(cx + rx - 2, cy);
  g.quadraticCurveTo(cx + rx + ry * 0.35, cy, cx + rx + ry * 0.3, cy - ry * 0.12);
  g.moveTo(cx - rx + 2, cy);
  g.quadraticCurveTo(cx - rx - ry * 0.35, cy, cx - rx - ry * 0.3, cy + ry * 0.12);
}
function inked(g: CanvasRenderingContext2D, fill: string, width = 5) {
  g.fillStyle = fill; g.fill();
  g.strokeStyle = css(PAL.indigo); g.lineWidth = width; g.lineJoin = 'round'; g.stroke();
}
function smile(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, wink = false, sleepy = false) {
  g.fillStyle = g.strokeStyle = css(PAL.indigo);
  g.lineWidth = r * 0.07; g.lineCap = 'round';
  for (const s of [-1, 1]) {
    const ex = cx + s * r * 0.3, ey = cy - r * 0.12;
    g.beginPath();
    if (sleepy || (wink && s === 1)) { g.arc(ex, ey, r * 0.1, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke(); }
    else { g.arc(ex, ey, r * 0.08, 0, Math.PI * 2); g.fill(); }
  }
  g.beginPath(); g.arc(cx, cy + r * 0.12, r * 0.25, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
}

const EMBLEMS: Record<FactionId, Emblem> = {
  player(g, cx, cy, r) { // a smiling lemon in a sun hat
    lemonShape(g, cx, cy + r * 0.15, r * 0.62, r * 0.5); inked(g, '#f6d33c');
    smile(g, cx, cy + r * 0.2, r * 0.7);
    g.beginPath(); g.ellipse(cx, cy - r * 0.32, r * 0.75, r * 0.14, -0.1, 0, Math.PI * 2); inked(g, '#fff6dc');
    g.beginPath(); g.ellipse(cx, cy - r * 0.45, r * 0.35, r * 0.25, -0.1, Math.PI, 0); inked(g, '#fff6dc');
    g.beginPath(); g.ellipse(cx + r * 0.3, cy - r * 0.62, r * 0.14, r * 0.07, -0.6, 0, Math.PI * 2); inked(g, '#5fa35a', 3);
  },
  sourwood(g, cx, cy, r) { // a lemon in pearls and a monocle
    lemonShape(g, cx, cy, r * 0.62, r * 0.52); inked(g, '#f6e27a');
    smile(g, cx, cy, r * 0.7);
    g.beginPath(); g.arc(cx + r * 0.21, cy - r * 0.08, r * 0.14, 0, Math.PI * 2); g.strokeStyle = '#c9a227'; g.lineWidth = r * 0.05; g.stroke();
    g.beginPath(); g.moveTo(cx + r * 0.33, cy); g.lineTo(cx + r * 0.42, cy + r * 0.35); g.stroke();
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * (0.2 + (0.6 * i) / 8);
      g.beginPath(); g.arc(cx + Math.cos(a) * r * 0.5, cy + r * 0.12 + Math.sin(a) * r * 0.35, r * 0.06, 0, Math.PI * 2); inked(g, '#ffffff', 2);
    }
  },
  hollis(g, cx, cy, r) { // a tea jar crossed with a ladle
    g.save(); g.translate(cx, cy); g.rotate(0.6);
    g.beginPath(); g.roundRect(-r * 0.06, -r * 0.75, r * 0.12, r * 1.2, 6); inked(g, '#c9a47a', 4);
    g.beginPath(); g.ellipse(0, r * 0.5, r * 0.22, r * 0.14, 0, 0, Math.PI * 2); inked(g, '#c9a47a', 4);
    g.restore();
    g.beginPath(); g.roundRect(cx - r * 0.38, cy - r * 0.42, r * 0.76, r * 0.95, r * 0.15); inked(g, '#e08a3c');
    g.fillStyle = '#b5651d'; g.fillRect(cx - r * 0.33, cy - r * 0.05, r * 0.66, r * 0.5);
    g.beginPath(); g.roundRect(cx - r * 0.42, cy - r * 0.58, r * 0.84, r * 0.18, 4); inked(g, '#d64545', 4);
  },
  fizzco(g, cx, cy, r) { // a winking soda bottle
    g.beginPath();
    g.moveTo(cx - r * 0.1, cy - r * 0.8); g.lineTo(cx + r * 0.1, cy - r * 0.8);
    g.lineTo(cx + r * 0.12, cy - r * 0.45); g.quadraticCurveTo(cx + r * 0.38, cy - r * 0.3, cx + r * 0.32, cy + r * 0.1);
    g.lineTo(cx + r * 0.36, cy + r * 0.75); g.lineTo(cx - r * 0.36, cy + r * 0.75); g.lineTo(cx - r * 0.32, cy + r * 0.1);
    g.quadraticCurveTo(cx - r * 0.38, cy - r * 0.3, cx - r * 0.12, cy - r * 0.45); g.closePath();
    inked(g, '#c8102e');
    g.fillStyle = '#ffffff'; g.fillRect(cx - r * 0.33, cy + r * 0.25, r * 0.66, r * 0.22);
    smile(g, cx, cy - r * 0.02, r * 0.5, true);
  },
  coldbrew(g, cx, cy, r) { // a sleepy coffee bean
    g.beginPath(); g.ellipse(cx, cy, r * 0.42, r * 0.6, 0.35, 0, Math.PI * 2); inked(g, '#6f4a33');
    g.beginPath(); g.moveTo(cx - r * 0.05, cy - r * 0.55); g.bezierCurveTo(cx + r * 0.25, cy - r * 0.1, cx - r * 0.25, cy + r * 0.1, cx + r * 0.05, cy + r * 0.55);
    g.strokeStyle = '#3b2a20'; g.lineWidth = r * 0.05; g.stroke();
    smile(g, cx, cy + r * 0.05, r * 0.6, false, true);
    g.fillStyle = '#ff4fa3'; g.font = `bold ${Math.round(r * 0.3)}px sans-serif`; g.fillText('z', cx + r * 0.45, cy - r * 0.45); g.fillText('z', cx + r * 0.62, cy - r * 0.65);
  },
  blenders(g, cx, cy, r) { // a flexing smoothie cup on a wave
    g.beginPath(); g.moveTo(cx - r * 0.8, cy + r * 0.6);
    for (let x = -0.8; x <= 0.8; x += 0.1) g.lineTo(cx + x * r, cy + r * 0.55 + Math.sin(x * 9) * r * 0.06);
    g.lineTo(cx + r * 0.8, cy + r * 0.8); g.lineTo(cx - r * 0.8, cy + r * 0.8); g.closePath(); inked(g, '#00a6a6', 4);
    g.beginPath(); g.moveTo(cx - r * 0.32, cy - r * 0.45); g.lineTo(cx + r * 0.32, cy - r * 0.45); g.lineTo(cx + r * 0.24, cy + r * 0.5); g.lineTo(cx - r * 0.24, cy + r * 0.5); g.closePath(); inked(g, '#ff9f1c');
    g.beginPath(); g.moveTo(cx + r * 0.08, cy - r * 0.45); g.lineTo(cx + r * 0.2, cy - r * 0.85); g.strokeStyle = '#d64545'; g.lineWidth = r * 0.06; g.stroke();
    for (const s of [-1, 1]) { // flexing arms
      g.beginPath(); g.moveTo(cx + s * r * 0.3, cy); g.lineTo(cx + s * r * 0.55, cy + r * 0.05); g.lineTo(cx + s * r * 0.58, cy - r * 0.25);
      g.strokeStyle = css(PAL.indigo); g.lineWidth = r * 0.13; g.lineCap = 'round'; g.stroke();
      g.strokeStyle = '#ff9f1c'; g.lineWidth = r * 0.08; g.stroke();
      g.beginPath(); g.arc(cx + s * r * 0.58, cy - r * 0.3, r * 0.09, 0, Math.PI * 2); inked(g, '#ff9f1c', 3);
    }
    smile(g, cx, cy + r * 0.05, r * 0.45);
  },
};

const LABEL_NAME: Record<FactionId, string> = {
  player: "LOTTIE'S", sourwood: 'SOURWOOD', hollis: 'HOLLIS', fizzco: 'FIZZCO', coldbrew: 'COLD BREW', blenders: 'BLENDERS',
};

const labels = new Map<string, THREE.CanvasTexture>();
/**
 * A vintage citrus-crate label: emblem on a sunburst, bordered in the
 * owner's pattern, with the owner's name on a ribbon. 2:1 aspect.
 */
export function crateLabel(owner: FactionId, name = LABEL_NAME[owner]): THREE.CanvasTexture {
  const key = `${owner}|${name}`;
  let t = labels.get(key);
  if (t) return t;
  const W = 512, H = 256, B = 22;
  const [c, g] = canvas(W, H);
  const st = OWNER_STYLE[owner];
  drawPattern(g, owner, W, H, 48);
  g.fillStyle = css(PAL.indigo); g.fillRect(B - 4, B - 4, W - 2 * B + 8, H - 2 * B + 8);
  // Sunburst.
  g.save();
  g.beginPath(); g.rect(B, B, W - 2 * B, H - 2 * B); g.clip();
  g.fillStyle = '#fff3c4'; g.fillRect(B, B, W - 2 * B, H - 2 * B);
  const cx = W * 0.27, cy = H * 0.5;
  g.fillStyle = owner === 'player' ? '#ffe27a' : css(new THREE.Color(st.main).lerp(new THREE.Color(0xfff3c4), 0.65).getHex());
  for (let i = 0; i < 24; i += 2) {
    const a0 = (i / 24) * Math.PI * 2, a1 = ((i + 1) / 24) * Math.PI * 2;
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a0) * 600, cy + Math.sin(a0) * 600); g.lineTo(cx + Math.cos(a1) * 600, cy + Math.sin(a1) * 600); g.closePath(); g.fill();
  }
  g.restore();
  EMBLEMS[owner](g, cx, cy, H * 0.36);
  // Name on a ribbon.
  const rx = W * 0.5, rw = W * 0.45, ry = H * 0.5;
  g.fillStyle = css(st.main);
  g.beginPath(); g.moveTo(rx, ry - 34); g.lineTo(rx + rw, ry - 34); g.lineTo(rx + rw - 14, ry); g.lineTo(rx + rw, ry + 34); g.lineTo(rx, ry + 34); g.lineTo(rx + 14, ry); g.closePath();
  g.fill(); g.strokeStyle = css(PAL.indigo); g.lineWidth = 5; g.stroke();
  g.textAlign = 'center'; g.textBaseline = 'middle';
  let size = 48;
  const font = (s: number) => `900 ${s}px "Rockwell", "Roboto Slab", "Georgia", serif`;
  g.font = font(size);
  while (g.measureText(name).width > rw - 40 && size > 18) g.font = font((size -= 2));
  const light = new THREE.Color(st.main).getHSL({ h: 0, s: 0, l: 0 }).l > 0.55;
  g.fillStyle = light ? css(PAL.indigo) : '#fff6dc';
  g.fillText(name, rx + rw / 2, ry + 2);
  g.font = `italic 700 22px "Brush Script MT", "Georgia", serif`;
  g.fillStyle = css(PAL.indigo);
  g.fillText(owner === 'player' ? 'Fresh-Squeezed' : 'Brand', rx + rw / 2, ry - 56);
  g.fillText('Citrine Bay', rx + rw / 2, ry + 58);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  labels.set(key, t);
  return t;
}

const labelMats = new Map<string, THREE.MeshStandardNodeMaterial>();
export function crateLabelMat(owner: FactionId) {
  let m = labelMats.get(owner);
  if (!m) { m = new THREE.MeshStandardNodeMaterial({ map: crateLabel(owner), roughness: 0.75 }); labelMats.set(owner, m); }
  return m;
}

/** A crate-label sign: a flat board with the label on its front. */
const signGeos = new Map<number, THREE.PlaneGeometry>();
export function labelSign(owner: FactionId, width: number): THREE.Mesh {
  let geo = signGeos.get(width);
  if (!geo) { geo = new THREE.PlaneGeometry(width, width / 2); signGeos.set(width, geo); }
  const mesh = new THREE.Mesh(geo, crateLabelMat(owner));
  mesh.name = 'label';
  return mesh;
}

/** A soft round glow (for streetlight pools and flashlight spots). */
let glowTex: THREE.CanvasTexture | undefined;
export function glowTexture() {
  if (glowTex) return glowTex;
  const [c, g] = canvas(128, 128);
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}
