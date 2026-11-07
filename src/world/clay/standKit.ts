// Shared pieces for stands, fences and gadgets in Kitchen-Table Clay
// (design spec, "Stands L1-L5" and "Defenses and gadgets"): each owner's
// dress (colours and pressed pattern), the striped card awning, popsicle
// sticks, clay lemons, stars and the canvas art for signs and chalkboards.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Baker, GLOSS, PAPER, box, canvasTex, cyl, hash, lumpy, rbox as coreRbox, sph } from './core.ts';

/**
 * Triangle budget: a rounded box at 2 segments is 300 triangles, at 1 it is
 * 108. Only the player's own stand (built while `lod.seg` is 2) gets the
 * softer corners; rivals, fences, gadgets and props use 1.
 */
export const lod = { seg: 1 };
export const rbox = (w: number, h: number, d: number, r?: number) => coreRbox(w, h, d, r, lod.seg);
/** A clay snake with cheap end caps: core snake() caps each end with a 6-ring sphere, which costs more than a short tube itself. */
export function rope(pts: [number, number, number][], r: number, seg = 12, rs = 4): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
  const parts: THREE.BufferGeometry[] = [new THREE.TubeGeometry(curve, seg, r, rs, false)];
  for (const t of [0, 1]) { const q = curve.getPoint(t); parts.push(sph(r, rs, 3).translate(q.x, q.y, q.z)); }
  for (const y of parts) for (const k of Object.keys(y.attributes)) if (k !== 'position' && k !== 'normal') y.deleteAttribute(k);
  return mergeGeometries(parts, false);
}
import { P } from './palette.ts';
import { FACTIONS, type RivalId } from '../../sim/economy.ts';

export type Owner = 'player' | RivalId;
export type Pattern = 'stripes' | 'damask' | 'gingham' | 'bubbles' | 'zigzag' | 'waves';
export interface Dress {
  owner: Owner;
  main: string;
  accent: string;
  pattern: Pattern;
  /** A thin Plum ink edge where accent and main share a lightness (spec, Palette and patterns). */
  inkEdge: boolean;
  /** Short shop name for the sign. */
  sign: string;
}

const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
export const DRESS: Record<Owner, Dress> = {
  player: { owner: 'player', main: '#F6D33C', accent: '#FFFFFF', pattern: 'stripes', inkEdge: true, sign: "LOTTIE'S" },
  sourwood: { owner: 'sourwood', main: hex(FACTIONS.sourwood.color), accent: hex(FACTIONS.sourwood.accent), pattern: 'damask', inkEdge: false, sign: 'SOURWOOD' },
  hollis: { owner: 'hollis', main: hex(FACTIONS.hollis.color), accent: hex(FACTIONS.hollis.accent), pattern: 'gingham', inkEdge: true, sign: 'HOLLIS TEA' },
  fizzco: { owner: 'fizzco', main: hex(FACTIONS.fizzco.color), accent: hex(FACTIONS.fizzco.accent), pattern: 'bubbles', inkEdge: false, sign: 'FIZZCO' },
  coldbrew: { owner: 'coldbrew', main: hex(FACTIONS.coldbrew.color), accent: '#FF4FA3', pattern: 'zigzag', inkEdge: false, sign: 'COLD BREW' },
  blenders: { owner: 'blenders', main: hex(FACTIONS.blenders.color), accent: hex(FACTIONS.blenders.accent), pattern: 'waves', inkEdge: true, sign: 'BLENDERS' },
};
export const INK = '#2E2A4F';
export const RECIPE_COLOR: Record<string, string> = { classic: '#F7C948', pink: '#F49AB8', mint: '#86D39A' };

type V3 = [number, number, number];

/** A popsicle stick: a flat rounded slat of raw pale wood. */
export function stick(B: Baker, len: number, p: V3, r: V3 = [0, 0, 0], color: string = P.stick, w = 0.14, t = 0.035) {
  // A plain block: at play scale the rounded ends cost 9x the triangles for nothing.
  B.add(box(w, len, t), color, { p, r, fx: PAPER });
}
/** A thin straight rod from a to b (pipe cleaners, wires): a 4-sided prism, no end caps. */
export function rod(B: Baker, a: V3, b: V3, r: number, color: string, sides = 4) {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
  const len = va.distanceTo(vb);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
  B.add(new THREE.CylinderGeometry(r, r, len, sides, 1, true), color, { q, p: va.add(vb).multiplyScalar(0.5).toArray() as V3 });
}
/** A clay lemon: lumpy, with nubs at both ends. */
export function lemon(B: Baker, r: number, p: V3, rot: V3 = [0, 0, 0], color: string = P.lemon, seed = 1, cheap = false) {
  if (cheap) { B.add(sph(r, 5, 4), color, { p, r: rot, s: [1.3, 1, 1] }); return; }
  B.add(lumpy(sph(r, 12, 9), r * 0.06, 8 / r, seed), color, { p, r: rot, s: [1.3, 1, 1] });
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(1, 1, 1));
  for (const s of [-1, 1]) B.add(sph(r * 0.28, 6, 5), color, { m: new THREE.Matrix4().makeTranslation(s * r * 1.33, 0, 0).premultiply(m) });
}
/** A five-point star slab, as on the stand sign. */
export function starGeo(r = 0.16, depth = 0.04) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r; s[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, -Math.sin(a) * rr); }
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: depth * 0.6, bevelSize: r * 0.15, bevelSegments: 2 });
}

/**
 * The owner's pressed pattern on a flat card panel (an awning slat row, a
 * skirt or a sign board): panel spans x in [-w/2, w/2], y in [-h/2, h/2], at z.
 * The base colour is laid by the caller; this adds the pattern on top.
 */
export function pattern(B: Baker, d: Dress, w: number, h: number, m: THREE.Matrix4, z = 0.02) {
  const at = (x: number, y: number, zz = z): THREE.Matrix4 => new THREE.Matrix4().makeTranslation(x, y, zz).premultiply(m);
  switch (d.pattern) {
    case 'stripes': {
      const n = Math.max(3, Math.round(w / 0.3)) | 1;
      for (let k = 0; k < n; k += 2) B.add(box(w / n, h, 0.012), d.accent, { m: at(-w / 2 + (k + 0.5) * (w / n), 0), fx: PAPER });
      // Yellow and white share a lightness: a thin Plum line between every stripe.
      if (d.inkEdge) for (let k = 1; k < n; k++) B.add(box(0.018, h, 0.016), INK, { m: at(-w / 2 + k * (w / n), 0, z + 0.003) });
      break;
    }
    case 'damask': // gold diamond studs
      for (let x = -w / 2 + 0.2; x < w / 2 - 0.1; x += 0.36) for (let y = -h / 2 + 0.16; y < h / 2 - 0.08; y += 0.3) {
        const off = Math.round((y + h) / 0.3) % 2 ? 0.18 : 0;
        if (x + off > w / 2 - 0.1) continue;
        B.add(new THREE.OctahedronGeometry(0.07, 0), d.accent, { m: at(x + off, y), s: [0.8, 1.2, 0.5], fx: GLOSS });
      }
      break;
    case 'gingham': {
      const c = 0.16;
      for (let x = -w / 2; x < w / 2 - 1e-3; x += c) for (let y = -h / 2; y < h / 2 - 1e-3; y += c) {
        const i = Math.round((x + w) / c), j = Math.round((y + h) / c);
        if ((i + j) % 2) continue;
        B.add(box(Math.min(c, w / 2 - x), Math.min(c, h / 2 - y), 0.012), (i % 2 && j % 2) ? '#FFF1D6' : d.accent, { m: at(x + Math.min(c, w / 2 - x) / 2, y + Math.min(c, h / 2 - y) / 2), fx: PAPER });
      }
      // Amber and red share a lightness: Plum lines round every square.
      if (d.inkEdge) {
        for (let x = -w / 2 + c; x < w / 2 - 1e-3; x += c) B.add(box(0.014, h, 0.016), INK, { m: at(x, 0, z + 0.003) });
        for (let y = -h / 2 + c; y < h / 2 - 1e-3; y += c) B.add(box(w, 0.014, 0.016), INK, { m: at(0, y, z + 0.003) });
      }
      break;
    }
    case 'bubbles': // chrome bubble buttons
      for (let k = 0; k < Math.round(w * h * 9); k++) {
        const x = (hash(k, 1) - 0.5) * (w - 0.12), y = (hash(k, 2) - 0.5) * (h - 0.12);
        B.add(new THREE.SphereGeometry(0.035 + hash(k, 3) * 0.04, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2), d.accent, { m: at(x, y), r: [Math.PI / 2, 0, 0], s: [1, 0.5, 1], fx: GLOSS });
      }
      break;
    case 'zigzag': {
      const pts: V3[] = [];
      const n = Math.max(4, Math.round(w / 0.22));
      for (let k = 0; k <= n; k++) pts.push([-w / 2 + 0.05 + (k / n) * (w - 0.1), (k % 2 ? 0.3 : -0.3) * h, z + 0.01]);
      B.add(rope(pts, Math.min(0.03, h * 0.08), n * 2, 4), d.accent, { m, fx: 0.7 });
      break;
    }
    case 'waves':
      for (const yy of h > 0.5 ? [-0.22, 0.22] : [0]) {
        const pts: V3[] = [];
        for (let k = 0; k <= 16; k++) pts.push([-w / 2 + 0.05 + (k / 16) * (w - 0.1), yy * h + Math.sin(k * 1.2) * h * 0.16, z + 0.01]);
        B.add(rope(pts, Math.min(0.03, h * 0.08), 24, 4), d.accent, { m });
        // Orange and teal share a lightness: a Plum outline under the wave.
        if (d.inkEdge) B.add(rope(pts.map(([x, y, zz]) => [x, y, zz - 0.008] as V3), Math.min(0.03, h * 0.08) * 1.6, 24, 4), INK, { m });
      }
      break;
  }
  if (d.inkEdge && d.pattern !== 'stripes' && d.pattern !== 'gingham') {
    B.add(box(w, 0.025, 0.014), INK, { m: at(0, -h / 2 + 0.012, z + 0.004) });
    B.add(box(w, 0.025, 0.014), INK, { m: at(0, h / 2 - 0.012, z + 0.004) });
  }
}

/**
 * A scalloped card awning in the owner's dress, built with its hinge at the
 * origin and hanging out along +z. Torn (75% HP): a slat is ripped and its
 * flap dangles. String lights along the lip are optional.
 */
export function awning(d: Dress, w: number, depth: number, opts: { lights?: boolean; torn?: boolean; lightsOnly?: boolean } = {}): THREE.BufferGeometry {
  const B = new Baker();
  const n = Math.max(5, Math.round(w / 0.32));
  const sw = w / n;
  for (let k = 0; k < (opts.lightsOnly ? 0 : n); k++) {
    const x = -w / 2 + (k + 0.5) * sw;
    const torn = opts.torn && (k === 2 || k === n - 3);
    const col = d.pattern === 'stripes' ? (k % 2 ? d.accent : d.main) : d.main;
    if (torn) {
      // Half the slat, then a flap hanging down from the rip.
      B.add(box(sw, 0.035, depth * 0.45), col, { p: [x, 0, depth * 0.22], fx: PAPER });
      B.add(box(sw * 0.9, 0.03, depth * 0.4), col, { p: [x + 0.02, -depth * 0.2, depth * 0.46], r: [1.25, 0.1, 0.12], fx: PAPER });
      continue;
    }
    B.add(box(sw, 0.035, depth), col, { p: [x, 0, depth / 2], fx: PAPER });
    B.add(new THREE.CylinderGeometry(sw / 2, sw / 2, 0.032, lod.seg === 2 ? 10 : 6, 1, false, Math.PI / 2, Math.PI), col, { p: [x, 0, depth], r: [Math.PI / 2 + 1.2, 0, 0], fx: PAPER });
  }
  if (opts.lightsOnly) { /* just the string of lights */ } else if (d.pattern !== 'stripes') {
    const m = new THREE.Matrix4().makeRotationX(-Math.PI / 2).setPosition(0, 0.02, depth / 2);
    pattern(B, d, w * 0.96, depth * 0.9, m, 0);
  } else if (d.inkEdge) {
    // A thin Plum line along every seam between the slats.
    for (let k = 1; k < n; k++) {
      const tornHere = opts.torn && (k === 2 || k === 3 || k === n - 3 || k === n - 2);
      B.add(box(0.018, 0.04, tornHere ? depth * 0.45 : depth), INK, { p: [-w / 2 + k * sw, 0.003, tornHere ? depth * 0.22 : depth / 2] });
    }
  }
  if (opts.lights || opts.lightsOnly) {
    const pts: V3[] = [];
    for (let k = 0; k <= 12; k++) pts.push([-w / 2 + (k / 12) * w, -0.3 - Math.sin((k / 12) * Math.PI * 4) * 0.05, depth + 0.1]);
    B.add(rope(pts, 0.011, 24, 3), INK);
    pts.forEach(([x, y, z], k) => B.add(sph(0.055, 6, 4), [P.amber, P.blush, '#ffffff', P.green][k % 4], { p: [x, y - 0.06, z], s: [1, 1.3, 1], fx: GLOSS + 1 }));
  }
  return B.build();
}

// ---------- canvas art ----------

const FONTS = { display: '"Chewy", "Comic Sans MS", cursive', hand: '"Gochi Hand", "Comic Sans MS", cursive', body: '"Fredoka", "Trebuchet MS", sans-serif' };

/** The L1 crayon sign: crayon letters on cardboard. */
export function crayonSign(text: string) {
  return fontTex(512, 200, (c, w, h) => {
    c.fillStyle = '#d9b48a'; c.fillRect(0, 0, w, h);
    c.globalAlpha = 0.15; c.strokeStyle = '#8B5E3C'; c.lineWidth = 2;
    for (let y = 10; y < h; y += 14) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y + 3); c.stroke(); }
    c.globalAlpha = 1;
    c.save(); c.translate(w / 2, h * 0.55); c.rotate(-0.04);
    c.font = `112px ${FONTS.hand}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineWidth = 10; c.strokeStyle = '#E8704F'; c.strokeText(text, 0, 0);
    c.fillStyle = '#F7C948'; c.fillText(text, 0, 0);
    c.restore();
  });
}
/** A painted card sign in the owner's colours with display lettering. */
export function cardSign(text: string, d: Dress) {
  return fontTex(512, 160, (c, w, h) => {
    c.fillStyle = d.owner === 'player' ? '#FFF1D6' : d.main;
    c.beginPath(); c.roundRect(4, 4, w - 8, h - 8, 26); c.fill();
    c.lineWidth = 8; c.strokeStyle = INK; c.stroke();
    let size = 104; c.font = `${size}px ${FONTS.display}`;
    while (c.measureText(text).width > w - 50 && size > 30) { size -= 6; c.font = `${size}px ${FONTS.display}`; }
    c.textAlign = 'center'; c.textBaseline = 'middle';
    const fg = d.owner === 'player' ? '#F6D33C' : d.accent;
    c.lineWidth = 12; c.strokeStyle = INK; c.lineJoin = 'round'; c.strokeText(text, w / 2, h / 2 + 4);
    c.fillStyle = fg; c.fillText(text, w / 2, h / 2 + 4);
  });
}
/** The chalkboard price: smudged chalk on green-black. `ceiling` is the stand's top price, chalked small under it. */
export function chalkPrice(price: number, ceiling?: number) {
  const usd = (p: number) => (p < 1 ? `${Math.round(p * 100)}¢` : `$${p.toFixed(2)}`);
  const label = usd(price);
  return (c: CanvasRenderingContext2D, w: number, h: number) => {
    c.fillStyle = '#2f3d38'; c.fillRect(0, 0, w, h);
    c.globalAlpha = 0.08;
    for (let i = 0; i < 40; i++) { c.fillStyle = '#ffffff'; c.beginPath(); c.ellipse(hash(i, 1) * w, hash(i, 2) * h, 30 + hash(i, 3) * 40, 8, hash(i, 4) * 3, 0, 6.3); c.fill(); }
    c.globalAlpha = 1;
    c.fillStyle = '#fbf6e8'; c.textAlign = 'center'; c.textBaseline = 'middle';
    let size = label.length > 4 ? 92 : 118; c.font = `${size}px ${FONTS.hand}`;
    while (c.measureText(label).width > w * 0.9 && size > 40) { size -= 6; c.font = `${size}px ${FONTS.hand}`; }
    c.fillText(label, w / 2, h * 0.58);
    // the price tag marks the ceiling (spec: Pricing): lemon chalk, pink once the price is past it
    if (ceiling !== undefined) {
      c.font = `28px ${FONTS.hand}`;
      c.fillStyle = price > ceiling + 1e-9 ? '#F4A3B5' : '#F7C948';
      c.fillText(`top ${usd(ceiling)}`, w / 2, h * 0.79);
    }
    // a chalk lemon on top and a pink smile underneath
    c.strokeStyle = '#F7C948'; c.lineWidth = 6; c.lineCap = 'round';
    c.beginPath(); c.ellipse(w * 0.5, h * 0.2, 26, 18, 0, 0, 6.3); c.stroke();
    c.beginPath(); c.moveTo(w * 0.5 + 26, h * 0.2); c.lineTo(w * 0.5 + 36, h * 0.2 - 4); c.stroke();
    c.strokeStyle = '#F4A3B5'; c.beginPath(); c.moveTo(w * 0.22, h * 0.86); c.quadraticCurveTo(w * 0.5, h * 0.95, w * 0.78, h * 0.84); c.stroke();
  };
}
/**
 * The L3 chalkboard menu: three pitchers and a price each, drawn as chalk
 * pictures. `k` (0..1) is how much has been written, for the reveal.
 */
export function chalkMenu(k = 1) {
  return (c: CanvasRenderingContext2D, w: number, h: number) => {
    c.fillStyle = '#2f3d38'; c.fillRect(0, 0, w, h);
    c.lineWidth = 10; c.strokeStyle = '#8B5E3C'; c.strokeRect(5, 5, w - 10, h - 10);
    const rows = [RECIPE_COLOR.classic, RECIPE_COLOR.pink, RECIPE_COLOR.mint];
    rows.forEach((col, i) => {
      const t = Math.max(0, Math.min(1, k * 3 - i));
      if (t <= 0) return;
      const y = h * (0.22 + i * 0.28);
      c.save(); c.beginPath(); c.rect(0, 0, w * (0.1 + t * 0.9), h); c.clip();
      c.strokeStyle = col; c.lineWidth = 7; c.lineCap = 'round'; c.lineJoin = 'round';
      c.beginPath(); c.moveTo(w * 0.14, y - 30); c.lineTo(w * 0.18, y + 30); c.lineTo(w * 0.34, y + 30); c.lineTo(w * 0.38, y - 30); c.stroke();
      c.beginPath(); c.arc(w * 0.41, y, 14, -1.2, 1.2); c.stroke();
      c.fillStyle = '#fbf6e8'; c.font = `64px ${FONTS.hand}`; c.textAlign = 'left'; c.textBaseline = 'middle';
      c.fillText(['★', '★★', '★★★'][i], w * 0.52, y);
      c.restore();
    });
  };
}
/** The OPEN / CLOSED card. */
/** The OPEN / CLOSED card's two faces on one sheet: CLOSED on the top half, OPEN below. */
export function openCard() {
  return fontTex(256, 256, (c) => {
    for (const open of [false, true]) {
      const y0 = open ? 128 : 0;
      c.fillStyle = open ? '#5FA35A' : '#E8704F';
      c.beginPath(); c.roundRect(6, y0 + 6, 244, 116, 22); c.fill();
      c.lineWidth = 8; c.strokeStyle = INK; c.stroke();
      c.fillStyle = '#fff8ea'; c.font = `${open ? 78 : 66}px ${FONTS.display}`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(open ? 'OPEN' : 'CLOSED', 128, y0 + 70);
    }
  });
}
/** Canvas art drawn before the web fonts load is redrawn once they have. */
export function whenFonts(fn: () => void) {
  if (typeof document === 'undefined' || !document.fonts) return;
  document.fonts.ready.then(fn).catch(() => {});
}
type Draw = (c: CanvasRenderingContext2D, w: number, h: number) => void;
/** A canvas texture with lettering: drawn now and again once the fonts are in. */
export function fontTex(w: number, h: number, draw: Draw) {
  const t = canvasTex(w, h, draw);
  whenFonts(() => (t.userData.redraw as (f: Draw) => void)(draw));
  return t;
}

/** A flat plane carrying a canvas texture (signs, chalkboards). One-sided
 * labels sit on a clay board that already casts the shadow, so only a
 * free-standing double-sided card casts its own. */
export function cardPlane(tex: THREE.Texture, w: number, h: number, doubleSided = false) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, side: doubleSided ? THREE.DoubleSide : THREE.FrontSide }));
  m.castShadow = doubleSided;
  return m;
}

/** A plain clay mesh from a baked geometry. */
export function clayMesh(g: THREE.BufferGeometry, mat: THREE.Material, cast = true, recv = true) {
  const m = new THREE.Mesh(g, mat);
  m.castShadow = cast; m.receiveShadow = recv;
  return m;
}

export { cyl };
