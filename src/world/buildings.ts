// Code-built buildings for non-player plots: rival stands in faction
// colors, rival HQs, civic buildings, fields, piers and FOR SALE signs.
// Local frame: the street is toward +z; the plot spans z -7.5..2.5.
import * as THREE from 'three';
import { FACTIONS, PLAYER_COLOR, type RivalId } from '../sim/economy.ts';
import { clayFrom } from './clay/kit.ts';
import type { GadgetId } from '../sim/balance.ts';
import { rivalStand as clayRivalStand } from './clay/rivalStands.ts';
import { fenceModel as clayFence, gadgetsModel, wreckPile as clayWreck } from './clay/defenses.ts';
import type { Owner } from './clay/standKit.ts';

const mats = new Map<string, THREE.MeshStandardMaterial>();
function m(color: number, roughness = 0.8, emissive = 0) {
  const k = `${color}|${roughness}|${emissive}`;
  let x = mats.get(k);
  if (!x) { x = clayFrom(color, roughness, emissive); mats.set(k, x); }
  return x;
}
function box(g: THREE.Group, w: number, h: number, d: number, color: number, x: number, y: number, z: number, rough = 0.8) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m(color, rough));
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

/** A rival stand: the same five clay silhouettes as ours, in the faction's dress (clay/rivalStands.ts). */
export function rivalStand(id: RivalId, level: number, hp = 1): THREE.Group {
  return clayRivalStand(id, level, hp);
}

/** Rival HQs (and later the player's trophies). */
export function hqBuilding(owner: RivalId | 'player' | null, name: string): THREE.Group {
  const g = new THREE.Group();
  // An empty HQ (its owners went bust) stands in faded grey.
  const color = owner === 'player' ? PLAYER_COLOR : owner ? FACTIONS[owner].color : 0x9a9a9a;
  const accent = owner === 'player' ? 0xffffff : owner ? FACTIONS[owner].accent : 0xd0d0d0;
  if (name === 'FizzCo Tower') {
    box(g, 8, 26, 7, 0xb8c2cc, 0, 13, -3, 0.2);
    for (let y = 2; y < 26; y += 2.2) box(g, 8.1, 0.25, 7.1, color, 0, y, -3);
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

/** Perimeter around a plot (P1 picket … P5 wall), with a gap at the front for the gate (clay/defenses.ts). */
export function fenceModel(tier: number, hp = 1): THREE.Group {
  return clayFence(tier, hp);
}

/** Installed gadgets on a plot. */
export function gadgetModels(ids: readonly GadgetId[]): THREE.Group {
  return gadgetsModel(ids);
}

/** A smashed stand: the neat clay pile with the owner's sign on top. */
export function wreckPile(level: number, owner: Owner): THREE.Group {
  return clayWreck(level, owner);
}

/** A smashed facility: knocked crooked, with a pile of sticks and squashed clay. */
export function wreckLook(building: THREE.Object3D, owner: Owner = 'player'): THREE.Group {
  building.rotation.z = 0.12;
  building.rotation.x = -0.08;
  building.position.y = -0.15;
  building.scale.y = 0.9;
  const g = clayWreck(2, owner);
  g.position.set(0, 0, 1.4);
  return g;
}

/** Player facilities (milestone 5): Bottling Works, Helipad tiers, Pier tiers. */
export function facilityModel(kind: 'bottling' | 'helipad' | 'pier' | 'grove', level: number): THREE.Group {
  const g = new THREE.Group();
  if (kind === 'grove') {
    // A Lemon Grove: rows of round lemon trees dotted with fruit.
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
      const x = -4.5 + c * 3, z = -8 + r * 3;
      box(g, 0.3, 1.2, 0.3, 0x6b4a2b, x, 0.6, z);
      const crown = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), m(0x3f8f3a));
      crown.position.set(x, 1.9, z);
      crown.castShadow = true;
      g.add(crown);
      for (const [dx, dy, dz] of [[0.7, 0.2, 0.5], [-0.6, 0.4, 0.6], [0.2, -0.3, 0.9]]) {
        const lemon = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), m(0xf6d33c));
        lemon.position.set(x + dx, 1.9 + dy, z + dz);
        g.add(lemon);
      }
    }
    g.name = 'facility';
    return g;
  }
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
    sign(g, "LOTTIE'S BOTTLING", 4, 0, h - 0.8, -0.48, '#f6d33c', '#3a2a10');
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
    for (let i = 0; i < level * 2; i++) box(g, 0.9, 0.9, 0.9, i % 2 ? 0xf6d33c : 0xc9a227, (i % 2 ? 1 : -1) * (w / 2 - 0.7), 0.95, -3 - i * 1.6);
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
