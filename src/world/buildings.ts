// Code-built buildings for non-player plots: rival stands in faction
// colors, rival HQs, civic buildings, fields, piers and FOR SALE signs.
// Local frame: the street is toward +z; the plot spans z -7.5..2.5.
import * as THREE from 'three/webgpu';
import { FACTIONS, PLAYER_COLOR, type RivalId } from '../sim/economy.ts';
import { block, crateLabelMat, labelSign, paint, PAL, patternMat, windowMat } from './paint.ts';

function m(color: number, roughness = 0.8) {
  return color === PAL.indigo ? windowMat() : paint(color, { rough: roughness });
}
function box(g: THREE.Group, w: number, h: number, d: number, color: number, x: number, y: number, z: number, rough = 0.8) {
  const mesh = new THREE.Mesh(block(w, h, d), m(color, rough));
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}

const labelCache = new Map<string, THREE.CanvasTexture>();
export function labelTexture(text: string, bg = '#fff6dc', fg = '#3a2a10') {
  const k = `${text}|${bg}|${fg}`;
  const hit = labelCache.get(k);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = bg; g.fillRect(0, 0, 512, 128);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  let size = 64;
  g.font = `bold ${size}px "Trebuchet MS", sans-serif`;
  while (g.measureText(text).width > 480 && size > 20) { size -= 4; g.font = `bold ${size}px "Trebuchet MS", sans-serif`; }
  g.fillText(text, 256, 66);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  labelCache.set(k, t);
  return t;
}
function sign(g: THREE.Group, text: string, w: number, x: number, y: number, z: number, bg?: string, fg?: string) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), new THREE.MeshStandardMaterial({ map: labelTexture(text, bg, fg), roughness: 0.7 }));
  mesh.position.set(x, y, z);
  g.add(mesh);
}
const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

/** Each family's stand topper (spec: Stands L1-L5), built once and cloned. */
const toppers = new Map<RivalId, THREE.Group>();
function topper(g: THREE.Group, id: RivalId, y: number, z: number) {
  let tpl = toppers.get(id);
  if (!tpl) { tpl = buildTopper(id); toppers.set(id, tpl); }
  const t = tpl.clone();
  t.position.set(0, y, z);
  t.rotation.y = 0.3;
  g.add(t);
}
function buildTopper(id: RivalId): THREE.Group {
  const f = FACTIONS[id];
  const t = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, color: number, x: number, yy: number, zz: number, rough = 0.6) => {
    const mesh = new THREE.Mesh(geo, m(color, rough)); mesh.position.set(x, yy, zz); mesh.castShadow = true; t.add(mesh); return mesh;
  };
  switch (id) {
    case 'sourwood': // a giant bowler
      add(new THREE.SphereGeometry(0.55, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0x2a1633, 0, 0.1, 0, 0.5);
      add(new THREE.CylinderGeometry(0.8, 0.8, 0.06, 20), 0x2a1633, 0, 0.1, 0, 0.5);
      add(new THREE.CylinderGeometry(0.56, 0.56, 0.12, 20, 1, true), f.accent, 0, 0.18, 0, 0.4);
      break;
    case 'hollis': // a sun-tea jar
      add(new THREE.CylinderGeometry(0.42, 0.42, 1.0, 16), 0xe08a3c, 0, 0.5, 0, 0.2).material = new THREE.MeshStandardNodeMaterial({ color: 0xd9822b, transparent: true, opacity: 0.8, roughness: 0.15 });
      add(new THREE.CylinderGeometry(0.3, 0.3, 0.14, 16), f.accent, 0, 1.05, 0);
      break;
    case 'fizzco': // a soda bottle
      add(new THREE.CylinderGeometry(0.3, 0.32, 0.9, 14), f.color, 0, 0.45, 0, 0.3);
      add(new THREE.CylinderGeometry(0.12, 0.28, 0.4, 14), f.color, 0, 1.1, 0, 0.3);
      add(new THREE.CylinderGeometry(0.13, 0.13, 0.08, 12), f.accent, 0, 1.33, 0, 0.3);
      add(new THREE.CylinderGeometry(0.31, 0.31, 0.25, 14, 1, true), 0xffffff, 0, 0.5, 0);
      break;
    case 'coldbrew': // an iced coffee cup with a straw
      add(new THREE.CylinderGeometry(0.42, 0.3, 1.0, 14), 0xe8dcc4, 0, 0.5, 0);
      add(new THREE.CylinderGeometry(0.44, 0.44, 0.1, 14), 0xffffff, 0, 1.03, 0);
      add(new THREE.CylinderGeometry(0.43, 0.38, 0.28, 14, 1, true), f.color, 0, 0.55, 0);
      add(new THREE.CylinderGeometry(0.04, 0.04, 0.6, 6), f.accent, 0.12, 1.3, 0).rotation.z = -0.25;
      break;
    case 'blenders': // a surfboard stood on end
      add(new THREE.CapsuleGeometry(0.32, 1.5, 4, 12).scale(1, 1, 0.18), 0x00a6a6, 0, 1.0, 0);
      add(new THREE.BoxGeometry(0.08, 2.0, 0.07), f.color, 0, 1.0, 0.06);
      break;
  }
  return t;
}

/** A rival stand: the same five silhouettes as ours, in the family's colors and pattern. */
export function rivalStand(id: RivalId, level: number): THREE.Group {
  const f = FACTIONS[id];
  const g = new THREE.Group();
  const w = [1.8, 3, 3.6, 5, 6][level - 1];
  const h = [0.85, 1.1, 2.6, 3, 3.4][level - 1];
  const pattern = patternMat(id, 1);
  const patterned = (geo: THREE.BufferGeometry, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(geo, pattern); mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh); return mesh;
  };
  let top = h;
  if (level <= 2) {
    box(g, w, h, 1, f.color, 0, h / 2, 0.3);
    box(g, w + 0.2, 0.08, 1.2, f.accent, 0, h + 0.04, 0.3);
    if (level === 2) {
      for (const x of [-w / 2, w / 2]) box(g, 0.1, 2.5, 0.1, 0x6b4a2e, x, 1.25, 0.8);
      patterned(block(w + 0.4, 0.08, 1.6), 0, 2.55, 0.45).rotation.x = 0.15;
      top = 2.6;
    }
  } else {
    box(g, w, h, 2.6, f.color, 0, h / 2, -0.8);
    box(g, w + 0.4, 0.25, 3.0, f.accent, 0, h + 0.12, -0.8);
    box(g, w * 0.7, 0.9, 0.05, PAL.indigo, 0, h * 0.62, 0.52, 0.3);
    box(g, w + 0.2, 0.12, 0.6, f.accent, 0, 1.1, 0.75);
    // Patterned awning over the window.
    patterned(block(w * 0.8, 0.07, 1.0), 0, h * 0.62 + 0.62, 0.95).rotation.x = 0.3;
    if (level >= 4 || id === 'coldbrew') {
      // Neon strip in the accent color, lit at golden hour.
      const neon = new THREE.Mesh(block(w * 0.8, 0.12, 0.08), paint(f.accent, { rough: 0.2, glow: 'neon', glowStrength: 2.5 }));
      neon.position.set(0, h - 0.25, 0.53);
      g.add(neon);
    }
    top = h + 0.25;
  }
  // A crate-label logo on the front.
  const label = labelSign(id, level <= 2 ? Math.min(w * 0.85, 1.6) : 2);
  if (level <= 2) label.position.set(0, h * 0.5, 0.81);
  else label.position.set(0, 0.6, 1.06);
  g.add(label);
  topper(g, id, top, level <= 2 ? 0.3 : -0.8);
  return g;
}

const flagGeo = new THREE.PlaneGeometry(1.8, 1.1);
/** Rival HQs (and later the player's trophies). */
export function hqBuilding(owner: RivalId | 'player', name: string): THREE.Group {
  const g = new THREE.Group();
  const color = owner === 'player' ? PLAYER_COLOR : FACTIONS[owner].color;
  const accent = owner === 'player' ? 0xffffff : FACTIONS[owner].accent;
  if (name === 'FizzCo Tower') {
    box(g, 8, 26, 7, 0xb8c2cc, 0, 13, -3, 0.2);
    for (let y = 2; y < 26; y += 2.2) { box(g, 8.1, 0.25, 7.1, color, 0, y, -3); box(g, 8.04, 1.1, 7.04, PAL.indigo, 0, y + 1.05, -3, 0.3); }
  } else if (name === 'Sourwood Manor') {
    box(g, 10, 6, 7, 0xe8e0d0, 0, 3, -3.5);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(7.5, 3, 4), m(color));
    roof.rotation.y = Math.PI / 4; roof.scale.set(1, 1, 0.7); roof.position.set(0, 7.5, -3.5); roof.castShadow = true;
    g.add(roof);
    for (const x of [-3.5, -1.2, 1.2, 3.5]) box(g, 0.5, 5.5, 0.5, 0xffffff, x, 2.75, 0.2);
  } else if (name === 'Hollis Homestead') {
    box(g, 9, 5, 7, 0xb03a2e, 0, 2.5, -3.5);
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.6, 9, 12, 1, false, 0, Math.PI), m(0x6b4a2e));
    roof.rotation.z = Math.PI / 2; roof.position.set(0, 5, -3.5); roof.castShadow = true;
    g.add(roof);
  } else if (name === 'The Grindhouse') {
    box(g, 9, 7, 7, 0x6e6e6e, 0, 3.5, -3.5);
    box(g, 9.1, 1.4, 7.1, accent, 0, 4.5, -3.5);
  } else {
    // The Blend Shack on the pier
    box(g, 8, 4, 6, 0xf2e2b0, 0, 2, -3);
    box(g, 9, 0.4, 7, color, 0, 4.2, -3);
    for (const x of [-3, 0, 3]) box(g, 0.2, 2.6, 0.2, accent, x, 5.6, -0.3);
  }
  sign(g, name, 6, 0, 1.6, 0.9, hex(accent), hex(color));
  // The family's crate-label logo over the door, and a patterned flag.
  const label = labelSign(owner, 3);
  label.position.set(0, 3.3, name === 'Sourwood Manor' ? 0.5 : 0.08);
  g.add(label);
  const top = { 'FizzCo Tower': 26, 'Sourwood Manor': 9, 'Hollis Homestead': 9.6, 'The Grindhouse': 7 }[name] ?? 4.4;
  box(g, 0.12, 3, 0.12, 0xffffff, 3, top + 1.5, -3);
  const flag = new THREE.Mesh(flagGeo, patternMat(owner, 1, { side: THREE.DoubleSide }));
  flag.position.set(3.95, top + 2.4, -3);
  g.add(flag);
  return g;
}

export function civicBuilding(name: string): THREE.Group {
  const g = new THREE.Group();
  const look: Record<string, [number, number, number]> = {
    'Town Hall and Registry': [0xf2ece0, 9, 8],
    'Citrine Bay Market': [0xf6d7a7, 9, 4],
    'The Hiring Hall': [0xc9b79c, 8, 5],
    "Dot's Diner": [0xf2795b, 8, 4],
  };
  const [color, w, h] = look[name] ?? [0xdddddd, 8, 5];
  box(g, w, h, 7, color, 0, h / 2, -3.5);
  box(g, w + 0.6, 0.4, 7.6, 0x5b6470, 0, h + 0.2, -3.5);
  if (h >= 4) for (const x of [-(w / 2 - 1.4), w / 2 - 1.4]) box(g, 1.3, 1.1, 0.08, PAL.indigo, x, h * 0.62, 0.02, 0.3);
  if (name === 'Town Hall and Registry') {
    box(g, 2, 5, 2, color, 0, h + 2.5, -3.5);
    const clock = new THREE.Mesh(new THREE.CircleGeometry(0.7, 20), m(0xffffff));
    clock.position.set(0, h + 3.5, -2.45);
    g.add(clock);
  }
  if (name === 'Citrine Bay Market') {
    for (let i = 0; i < 4; i++) box(g, 1.8, 0.1, 1.6, i % 2 ? 0xffffff : 0x5fa35a, -3 + i * 2, 2.6, 0.6);
  }
  sign(g, name, 5, 0, Math.min(h - 0.6, 3), 0.02);
  return g;
}

export function fieldRows(): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const row = new THREE.Mesh(new THREE.BoxGeometry(10, 0.5, 0.8), m(0x4f9a3a));
    row.position.set(0, 0.25, -6.5 + i * 2);
    row.castShadow = true;
    g.add(row);
  }
  return g;
}

export function pierModel(): THREE.Group {
  const g = new THREE.Group();
  // Docks face the sea (behind the plot): planks run back toward the water.
  box(g, 4, 0.3, 12, 0x8a5a30, 0, 0.3, -6);
  for (const z of [-11, -7, -3]) for (const x of [-1.8, 1.8]) box(g, 0.3, 1.5, 0.3, 0x5a3a20, x, 0, z);
  return g;
}

export function forSaleSign(): THREE.Group {
  const g = new THREE.Group();
  box(g, 0.1, 1.2, 0.1, 0x8a5a30, 0, 0.6, 1.4);
  sign(g, 'FOR SALE', 1.4, 0, 1.25, 1.46, '#ffffff', '#d64545');
  return g;
}

/** Perimeter around a plot (P1 picket … P5 wall), with a gap at the front for the gate. */
export function fenceModel(tier: number): THREE.Group {
  const g = new THREE.Group();
  g.name = 'fence';
  const x0 = -5.2, x1 = 5.2, zf = 2.1, zb = -7.2;
  // Runs: [ax, az, bx, bz], leaving a 2 m gate in the front middle.
  const runs: [number, number, number, number][] = [[x0, zf, -1, zf], [1, zf, x1, zf], [x0, zf, x0, zb], [x1, zf, x1, zb], [x0, zb, x1, zb]];
  for (const [ax, az, bx, bz] of runs) {
    const len = Math.hypot(bx - ax, bz - az);
    const cx = (ax + bx) / 2, cz = (az + bz) / 2;
    const along = Math.abs(bx - ax) > Math.abs(bz - az);
    const run = (w: number, h: number, d: number, color: number, y: number, rough = 0.8) =>
      box(g, along ? len : w, h, along ? d : len, color, cx, y, cz, rough);
    const posts = Math.max(2, Math.round(len / (tier === 1 ? 0.6 : 1.6)));
    const postAt = (i: number) => [ax + ((bx - ax) * i) / (posts - 1), az + ((bz - az) * i) / (posts - 1)] as const;
    if (tier === 1) {
      for (let i = 0; i < posts; i++) { const [x, z] = postAt(i); box(g, 0.12, 0.8, 0.06, 0xffffff, x, 0.4, z); }
      run(0.05, 0.08, 0.05, 0xffffff, 0.55);
    } else if (tier === 2) {
      for (let i = 0; i < posts; i++) { const [x, z] = postAt(i); box(g, 0.1, 1.4, 0.1, 0x8a9099, x, 0.7, z, 0.4); }
      const mesh = run(0.03, 1.2, 0.03, 0xb8c2cc, 0.7, 0.4);
      (mesh as THREE.Mesh).material = new THREE.MeshStandardMaterial({ color: 0xb8c2cc, transparent: true, opacity: 0.45, metalness: 0.5, roughness: 0.4 });
    } else if (tier === 3) {
      for (let i = 0; i < posts * 2; i++) {
        const [x, z] = postAt(Math.min(posts - 1, i / 2));
        const stake = new THREE.Mesh(new THREE.ConeGeometry(0.12, 1.5, 5), m(0x9a6b3c));
        stake.position.set(x + (i % 2) * 0.2, 0.75, z);
        stake.rotation[along ? 'x' : 'z'] = (az > -2 || ax > 0 ? 1 : -1) * 0.35;
        stake.castShadow = true;
        g.add(stake);
      }
    } else if (tier === 4) {
      for (let i = 0; i < posts; i++) { const [x, z] = postAt(i); box(g, 0.1, 1.5, 0.1, 0x5a3a20, x, 0.75, z); }
      for (const y of [0.4, 0.8, 1.2]) run(0.03, 0.03, 0.03, 0x3a3a3a, y, 0.5);
    } else {
      run(0.5, 2.2, 0.5, 0xb5523b, 1.1);
      run(0.6, 0.2, 0.6, 0xe9d8a6, 2.25);
    }
  }
  return g;
}

/** A smashed stand: knocked crooked with planks on the ground. */
export function wreckLook(stand: THREE.Object3D): THREE.Group {
  stand.rotation.z = 0.22;
  stand.rotation.x = -0.12;
  stand.position.y = -0.15;
  const g = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const plank = box(g, 1.4, 0.08, 0.25, 0x8a5a30, -2 + i * 0.8, 0.05, 1.2 + (i % 2) * 0.5);
    plank.rotation.y = i * 0.9;
  }
  sign(g, 'CLOSED: SMASHED', 2.2, 0, 1.0, 2.0, '#ffffff', '#d64545');
  return g;
}

/** Player facilities (milestone 5): Bottling Works, Helipad tiers, Pier tiers. */
export function facilityModel(kind: 'bottling' | 'helipad' | 'pier', level: number): THREE.Group {
  const g = new THREE.Group();
  const yellow = PLAYER_COLOR;
  if (kind === 'bottling') {
    const w = 6 + level, h = 3 + level;
    box(g, w, h, 6, 0xe9e1cf, 0, h / 2, -3.5);
    box(g, w + 0.4, 0.4, 6.4, yellow, 0, h + 0.2, -3.5);
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 3 + level, 10), m(0xb5523b));
    stack.position.set(w / 2 - 1, h + 1.5 + level / 2, -5);
    stack.castShadow = true;
    g.add(stack);
    // A conveyor of bottles out front.
    box(g, w - 1, 0.5, 0.8, 0x5b6470, 0, 0.5, 0.2);
    for (let i = 0; i < 8; i++) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.45, 8), m(0xf6e27a, 0.3));
      b.position.set(-(w - 2) / 2 + i * ((w - 2) / 7), 0.97, 0.2);
      g.add(b);
    }
    const label = labelSign('player', 3.2);
    label.position.set(0, h - 1.2, -0.47);
    g.add(label);
  } else if (kind === 'helipad') {
    const r = 3 + level * 0.8;
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.2, 32), m(0x6b6f76));
    pad.position.set(0, 0.1, -2.5);
    pad.receiveShadow = true;
    g.add(pad);
    const h = new THREE.Mesh(new THREE.PlaneGeometry(r * 1.2, r * 1.2), new THREE.MeshStandardMaterial({ map: labelTexture('H', '#6b6f76', '#ffffff'), roughness: 0.9 }));
    h.rotation.x = -Math.PI / 2;
    h.position.set(0, 0.21, -2.5);
    g.add(h);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      box(g, 0.25, 0.25, 0.25, yellow, Math.cos(a) * (r + 0.2), 0.2, -2.5 + Math.sin(a) * (r + 0.2));
    }
    if (level >= 2) box(g, 1.6, 4, 1.6, 0xe9e1cf, -4.5, 2, -6);
    if (level >= 3) { box(g, 3, 2.5, 3, 0xe9e1cf, 4, 1.25, -6); sign(g, 'HELIPORT', 2.8, 4, 1.6, -4.48, '#f6d33c'); }
    const sock = new THREE.Mesh(new THREE.ConeGeometry(0.25, 1, 8), m(0xff8c1a));
    sock.position.set(-4.5, level >= 2 ? 4.5 : 1.6, -1);
    sock.rotation.z = Math.PI / 2;
    g.add(sock);
  } else {
    const len = 12 + level * 6, w = 3 + level;
    box(g, w, 0.35, len, 0x8a5a30, 0, 0.35, -len / 2);
    for (let z = -2; z > -len; z -= 4) for (const x of [-w / 2 + 0.2, w / 2 - 0.2]) box(g, 0.3, 1.8, 0.3, 0x5a3a20, x, 0, z);
    for (let i = 0; i < level * 2; i++) box(g, 0.9, 0.9, 0.9, 0, (i % 2 ? 1 : -1) * (w / 2 - 0.7), 0.95, -3 - i * 1.6).material = crateLabelMat('player');
    if (level >= 3) { box(g, 0.4, 7, 0.4, 0xd64545, w / 2 + 1, 3.5, -len + 3); box(g, 5, 0.4, 0.4, 0xd64545, w / 2 - 1, 7, -len + 3); }
    const pole = box(g, 0.12, 4, 0.12, 0xffffff, -w / 2 + 0.3, 2, -1);
    pole.castShadow = false;
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.7), new THREE.MeshStandardMaterial({ color: yellow, side: THREE.DoubleSide }));
    flag.position.set(-w / 2 + 0.95, 3.6, -1);
    g.add(flag);
  }
  g.name = 'facility';
  return g;
}
