// The stand is the dashboard (design spec, "Stands L1-L5"): lemons fill the
// crate, the sugar sack slumps as it empties, ice sits in an open cooler, the
// pitcher takes the recipe's colour, sugar cubes on the counter count the
// Sweetness, the price sits on a chalkboard and Reputation stands as stars on
// the sign. Tap OPEN and the card flips, the stand bounces and clay-pellet
// confetti flies. One set of props follows the player's stand through its
// levels: place() moves them onto the new level's anchors.
import * as THREE from 'three';
import { Baker, GLOSS, PAPER, box, canvasTex, cone, cyl, hash, lathe, lumpy, sph, tor } from './core.ts';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { kit } from './kit.ts';
import { P } from './palette.ts';
import type { Anchors } from './stands.ts';
import { RECIPE_COLOR, cardPlane, chalkPrice, clayMesh, openCard, starGeo, stick, whenFonts, rbox } from './standKit.ts';

export interface PropState {
  price: number;
  /** The stand's price ceiling, chalked small under the price. */
  ceiling?: number;
  /** 0..1: how full the pitcher is. */
  pitcherFill: number;
  recipe: string;
  sweetness: 'less' | 'classic' | 'extra';
  /** 0..1 of the level's storage; `spoiling` is the share of the lemons that spoil tonight (they turn brown). */
  stock: { lemons: number; sugar: number; ice: number; spoiling?: number };
  /** Reputation, 1..5 stars. */
  stars: number;
  open: boolean;
}

export interface StandProps {
  group: THREE.Group;
  /** Move every prop onto a level's anchors. */
  place(a: Anchors): void;
  set(s: Partial<PropState>): void;
  /** Step the springs and confetti; call with the time on twos. */
  twos(tq: number): void;
  /** The stand's bounce, for the level root to copy. */
  bounce(): { sx: number; sy: number };
  /** The coin jar in world space (sales arc their coins into it). */
  jarWorld(): THREE.Vector3;
  /** Mid zoom drops the small props; `stars` false hides the stars too (the sign is down). */
  showSmall(on: boolean, stars: boolean): void;
  /** Scorcher: ice pops stand in the cooler, sagging like warm clay. */
  setScorcher(on: boolean): void;
}

const SWEET_CUBES = { less: 1, classic: 2, extra: 3 } as const;

/**
 * Three ice pops on popsicle sticks, standing in the cooler's ice in cooler
 * space. Each body is bent over and squashed down its height, with a drip
 * pooling at the foot, so they read as sagging like warm clay.
 */
function icePops(): THREE.BufferGeometry {
  const out = new Baker();
  const cols = ['#ff4f6d', '#ff8c3a', '#6fc7ff'];
  [[-0.2, 0.06, 0.25, -0.15], [0.02, -0.05, -0.1, 0.1], [0.22, 0.08, 0.35, 0.2]].forEach(([x, z, ry, rz], k) => {
    const B = new Baker();
    B.add(rbox(0.13, 0.24, 0.055, 0.03), cols[k], { p: [0, 0.3, 0], fx: GLOSS });
    const body = B.build();
    // Bend: the higher up the body, the further it droops sideways and down.
    const pos = body.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const t = Math.max(0, (pos.getY(i) - 0.18) / 0.24);
      pos.setX(i, pos.getX(i) * (1 + t * 0.25) + t * t * 0.13);
      pos.setY(i, pos.getY(i) - t * t * 0.08);
    }
    body.computeVertexNormals();
    const S = new Baker();
    stick(S, 0.26, [0, 0.13, 0], [0, 0, 0], '#e3bf86', 0.035, 0.012);
    S.add(sph(0.035, 6, 5), cols[k], { p: [0.115, 0.3, 0.02], s: [1, 1.5, 1], fx: GLOSS }); // a drip running off the slumped side
    S.add(sph(0.05, 7, 5), cols[k], { p: [0.06, 0.2, 0], s: [1.6, 0.4, 1.4], fx: GLOSS }); // pooling at the foot
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, 0.42, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, rz)), new THREE.Vector3(1, 1, 1));
    out.raw(body, m).raw(S.build(), m);
  });
  return out.build();
}
const LEMONS = 24, ICE = 16, CONFETTI = 60;
const BROWN = new THREE.Color('#8f6a2a'), WHITE = new THREE.Color('#ffffff'), GOLD = new THREE.Color(P.gold), DULL = new THREE.Color('#d8ccb0');

export function createStandProps(): StandProps {
  const K = kit();
  const group = new THREE.Group();
  group.name = 'standProps';
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();

  // Lemon crate of popsicle sticks with a terracotta label, lemons heaped inside.
  // Every prop that never moves or swaps is baked into one body mesh (and the
  // small ones into a second, so mid zoom can drop them) each time place() runs.
  let crateGeo: THREE.BufferGeometry, coolerGeo: THREE.BufferGeometry, chalkGeo: THREE.BufferGeometry, jarClayGeo: THREE.BufferGeometry;
  const crate = new THREE.Group();
  {
    const B = new Baker();
    for (const y of [0.08, 0.22, 0.36]) for (const z of [-0.28, 0.28]) stick(B, 0.92, [0, y, z], [0, 0, Math.PI / 2], '#d9ad72', 0.12, 0.035);
    for (const y of [0.08, 0.22, 0.36]) for (const x of [-0.44, 0.44]) stick(B, 0.6, [x, y, 0], [Math.PI / 2, 0, 0], '#d9ad72', 0.12, 0.035);
    B.add(box(0.9, 0.04, 0.58), '#c79a62', { p: [0, 0.02, 0], fx: PAPER });
    for (const x of [-0.44, 0.44]) for (const z of [-0.28, 0.28]) B.add(box(0.06, 0.44, 0.06), P.walnut, { p: [x, 0.22, z], fx: PAPER });
    B.add(rbox(0.46, 0.14, 0.012, 0.01), P.terra, { p: [0, 0.24, 0.3], fx: PAPER });
    B.add(sph(0.05, 8, 6), P.lemon, { p: [-0.12, 0.24, 0.31], s: [1.3, 1, 0.4] });
    crateGeo = B.build();
  }
  const lemonGeo = new Baker().add(lumpy(sph(0.105, 10, 8), 0.01, 12, 2), P.lemon).build();
  const lemons = new THREE.InstancedMesh(lemonGeo, K.world, LEMONS);
  lemons.castShadow = true;
  for (let k = 0; k < LEMONS; k++) {
    const layer = Math.floor(k / 8), i = k % 8;
    e.set(hash(k) * 3, hash(k, 2) * 3, 0); q.setFromEuler(e);
    lemons.setMatrixAt(k, m4.compose(v.set(-0.3 + (i % 4) * 0.2 + layer * 0.06, 0.12 + layer * 0.13, -0.12 + Math.floor(i / 4) * 0.24 - layer * 0.04), q, sc.set(1.3, 1, 1)));
  }
  crate.add(lemons);
  group.add(crate);

  // The sugar sack: slumps as it empties.
  const sackRoot = new THREE.Group();
  // The tag is part of the sack's mesh, so it slumps with it.
  const sack = clayMesh(new Baker().add(lumpy(lathe([[0, 0], [0.3, 0.02], [0.38, 0.24], [0.36, 0.52], [0.21, 0.72], [0.11, 0.77], [0.15, 0.86], [0, 0.88]], 18), 0.03, 4, 5), '#efe3c8')
    .add(rbox(0.28, 0.18, 0.02, 0.01), P.terra, { p: [0, 0.34, 0.37], fx: PAPER }).add(new THREE.BoxGeometry(0.06, 0.06, 0.03), '#ffffff', { p: [0, 0.34, 0.38], fx: GLOSS }).build(), K.world);
  sackRoot.add(sack);
  group.add(sackRoot);

  // The ice cooler: open lid, cubes inside.
  const cooler = new THREE.Group();
  {
    const B = new Baker();
    B.add(rbox(0.85, 0.5, 0.6, 0.1), P.teal, { p: [0, 0.25, 0] });
    B.add(rbox(0.75, 0.05, 0.5, 0.02), '#ffffff', { p: [0, 0.5, 0] });
    B.add(rbox(0.85, 0.08, 0.6, 0.04), '#ffffff', { p: [0, 0.75, -0.38], r: [-1.2, 0, 0] });
    for (const s of [-1, 1]) B.add(box(0.05, 0.08, 0.2), '#ffffff', { p: [s * 0.45, 0.38, 0] });
    coolerGeo = B.build();
  }
  const ice = new THREE.InstancedMesh(new Baker().add(rbox(0.13, 0.13, 0.13, 0.03), '#dff6ff', { fx: GLOSS }).build(), K.world, ICE);
  for (let k = 0; k < ICE; k++) {
    e.set(hash(k, 5) * 0.6, hash(k, 6) * 2, hash(k, 7) * 0.6); q.setFromEuler(e);
    ice.setMatrixAt(k, m4.compose(v.set(-0.27 + (k % 5) * 0.135, 0.44 + Math.floor(k / 5) * 0.085, -0.12 + (Math.floor(k / 5) % 2) * 0.18 + hash(k) * 0.05), q, sc.set(1, 1, 1)));
  }
  cooler.add(ice);
  // Scorcher ice pops, poked into the ice and slumping like warm clay: one draw, only on Scorcher days.
  const pops = clayMesh(icePops(), K.world, false, false);
  pops.visible = false;
  cooler.add(pops);
  group.add(cooler);

  // The pitcher: glass, liquid in the recipe's colour, and its garnish.
  const pitcher = new THREE.Group();
  const glassGeo = (lathe([[0, 0], [0.22, 0.01], [0.24, 0.1], [0.23, 0.42], [0.2, 0.55], [0.22, 0.6], [0.2, 0.6], [0.19, 0.55], [0.21, 0.42], [0.22, 0.1], [0, 0.03]], 24));
  const handleGeo = new Baker().add(tor(0.14, 0.03, 6, 14, Math.PI * 1.1), '#e8f6f4', { p: [0.24, 0.32, 0], r: [0, 0, -Math.PI * 0.55], fx: GLOSS }).build();
  const liqMat = new THREE.MeshStandardMaterial({ color: RECIPE_COLOR.classic, roughness: 0.15, transparent: true, opacity: 0.9 });
  const liquid = new THREE.Mesh(lathe([[0, 0], [0.2, 0], [0.21, 0.07], [0.2, 0.39], [0, 0.39]], 20), liqMat);
  liquid.position.y = 0.03;
  const garnishes: Record<string, THREE.Mesh> = {
    classic: clayMesh(new Baker().add(cyl(0.11, 0.11, 0.025, 14), P.lemon).add(cyl(0.085, 0.085, 0.03, 14), '#fff3b0').build(), K.world, false, false),
    pink: clayMesh(new Baker().add(lumpy(sph(0.07, 10, 8), 0.008, 14, 4), '#d6455e', { s: [1, 1.2, 1] }).add(sph(0.04, 6, 5), P.green, { p: [0, 0.08, 0], s: [1.4, 0.4, 1.4] }).build(), K.world, false, false),
    mint: clayMesh(new Baker().add(sph(0.08, 8, 6), '#5fb06a', { s: [1.4, 0.25, 0.8], r: [0, 0, 0.4] }).add(sph(0.07, 8, 6), '#7cc47f', { p: [0.08, 0.02, 0.05], s: [1.3, 0.25, 0.7], r: [0, 0.8, -0.3] }).build(), K.world, false, false),
    // A strawberry slice on the rim: red edge, pale heart, a ring of seeds.
    strawberry: clayMesh((() => { const B = new Baker().add(cyl(0.1, 0.1, 0.025, 14), '#d6455e', { s: [1, 1, 1.15] }).add(cyl(0.065, 0.065, 0.03, 12), '#f7b3bf', { s: [1, 1, 1.15] }); for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2; B.add(sph(0.012, 4, 3), '#fff3b0', { p: [Math.cos(a) * 0.08, 0.016, Math.sin(a) * 0.09] }); } return B.build(); })(), K.world, false, false),
    // Frozen: shards of ice standing up out of the slush.
    frozen: clayMesh((() => { const B = new Baker(); for (let k = 0; k < 4; k++) B.add(cone(0.045, 0.16 + (k % 2) * 0.06, 4), '#e8f8ff', { p: [(k - 1.5) * 0.06, 0.06, (k % 2) * 0.04], r: [0.2 * (k - 1.5), k, 0.25 * (1.5 - k)], fx: GLOSS }); return B.build(); })(), K.world, false, false),
    // Honey Ginger: a ginger coin with a honey drip.
    honeyGinger: clayMesh(new Baker().add(lumpy(cyl(0.09, 0.09, 0.03, 12), 0.006, 12, 2), '#e9c98d').add(cyl(0.07, 0.07, 0.034, 12), '#f3dcaa').add(sph(0.03, 6, 5), '#e0a84c', { p: [0.08, -0.02, 0], s: [1, 1.6, 1], fx: GLOSS }).build(), K.world, false, false),
    // Sparkling: bubbles floating up out of the pitcher.
    sparkling: clayMesh((() => { const B = new Baker(); for (let k = 0; k < 6; k++) B.add(sph(0.022 + (k % 3) * 0.01, 6, 5), '#fdfbe6', { p: [(hash(k, 3) - 0.5) * 0.2, 0.02 + k * 0.045, (hash(k, 4) - 0.5) * 0.15], fx: GLOSS }); return B.build(); })(), K.world, false, false),
    // Lavender: a sprig, a green stem with purple buds up its top.
    lavender: clayMesh((() => { const B = new Baker().add(cyl(0.008, 0.008, 0.28, 4), P.green, { p: [0, 0.1, 0], r: [0, 0, -0.3] }); for (let k = 0; k < 6; k++) B.add(sph(0.022, 5, 4), k % 2 ? '#9a78d0' : '#b79ce0', { p: [0.025 + k * 0.012 + (k % 2 ? 0.012 : -0.012), 0.12 + k * 0.03, 0], s: [1, 1.3, 1] }); return B.build(); })(), K.world, false, false),
    // Half and Half: a tea leaf hooked on the rim.
    halfAndHalf: clayMesh(new Baker().add(sph(0.08, 8, 6), '#4f8a4a', { s: [1.5, 0.22, 0.75], r: [0, 0.4, 0.3] }).add(box(0.12, 0.01, 0.008), '#3b6b37', { p: [0, 0.02, 0], r: [0, 0.4, 0.3] }).build(), K.world, false, false),
    // Secret Reserve: a gold ribbon tied round the pitcher's neck, bow in front.
    secretReserve: clayMesh(new Baker().add(tor(0.2, 0.02, 5, 20), P.gold, { r: [Math.PI / 2, 0, 0], p: [0.05, -0.06, -0.04], fx: GLOSS }).add(sph(0.05, 6, 5), P.gold, { p: [0.05, -0.06, 0.17], s: [1.6, 0.8, 0.5], r: [0, 0, 0.5], fx: GLOSS }).add(sph(0.05, 6, 5), P.gold, { p: [0.05, -0.06, 0.17], s: [1.6, 0.8, 0.5], r: [0, 0, -0.5], fx: GLOSS }).build(), K.world, false, false),
  };
  for (const g of Object.values(garnishes)) { g.position.set(-0.05, 0.6, 0.04); g.rotation.set(0.3, 0, 0.2); pitcher.add(g); }
  // The ones that sit in the drink or round the neck rather than on the rim.
  garnishes.frozen.position.set(0, 0.36, 0); garnishes.frozen.rotation.set(0, 0, 0);
  garnishes.sparkling.position.set(0, 0.44, 0); garnishes.sparkling.rotation.set(0, 0, 0);
  garnishes.secretReserve.position.set(-0.05, 0.56, 0.04); garnishes.secretReserve.rotation.set(0, 0, 0);
  pitcher.add(liquid);
  group.add(pitcher);

  // Sugar cubes: one for Less, two for Classic, three for Extra.
  const cubes = new THREE.InstancedMesh(new Baker().add(rbox(0.12, 0.12, 0.12, 0.02), '#ffffff').build(), K.world, 3);
  for (let k = 0; k < 3; k++) cubes.setMatrixAt(k, new THREE.Matrix4().makeRotationY(k * 0.5).setPosition(k * 0.15, 0, k === 2 ? 0.04 : 0));
  cubes.castShadow = true;
  group.add(cubes);

  // The coin jar and a stack of striped cups.
  const jar = new THREE.Group();
  const jarGlassGeo = lathe([[0, 0], [0.15, 0.01], [0.16, 0.05], [0.16, 0.3], [0.11, 0.36], [0.11, 0.4], [0, 0.4]], 20);
  {
    const B = new Baker();
    B.add(cyl(0.12, 0.12, 0.05, 14), P.terra, { p: [0, 0.42, 0] });
    for (let k = 0; k < 9; k++) B.add(cyl(0.06, 0.06, 0.02, 10), P.gold, { p: [(hash(k) - 0.5) * 0.1, 0.03 + k * 0.022, (hash(k, 2) - 0.5) * 0.1], r: [hash(k, 3) * 0.4, 0, hash(k, 4) * 0.4], fx: GLOSS });
    jarClayGeo = B.build();
  }
  group.add(jar);
  const cupsGeo = (() => { const B = new Baker(); for (let k = 0; k < 5; k++) B.add(cyl(0.085, 0.065, 0.18, 12, true), k % 2 ? P.lemon : '#ffffff', { p: [0, 0.09 + k * 0.05, 0], fx: PAPER }); return B.build(); })();
  const cups = new THREE.Group();
  group.add(cups);

  // The A-frame chalkboard with the price.
  const chalk = new THREE.Group();
  {
    const B = new Baker();
    for (const s of [-1, 1]) for (const zz of [1, -1]) B.add(box(0.06, 1.3, 0.06), P.walnut, { p: [s * 0.42, 0.62, zz * 0.18], r: [zz * 0.18, 0, 0], fx: PAPER });
    B.add(box(0.94, 0.08, 0.05), P.walnut, { p: [0, 1.2, 0.07], r: [0.18, 0, 0], fx: PAPER });
    B.add(box(0.94, 0.08, 0.05), P.walnut, { p: [0, 0.3, 0.23], r: [0.18, 0, 0], fx: PAPER });
    B.add(box(0.86, 0.9, 0.03), '#2f3d38', { p: [0, 0.76, -0.2], r: [-0.18, 0, 0], fx: PAPER });
    chalkGeo = B.build();
  }
  let priceNow = 0.75, ceilingNow: number | undefined;
  const chalkTex = canvasTex(256, 256, chalkPrice(priceNow));
  const redraw = chalkTex.userData.redraw as (f: ReturnType<typeof chalkPrice>) => void;
  whenFonts(() => redraw(chalkPrice(priceNow, ceilingNow)));
  const board = cardPlane(chalkTex, 0.82, 0.86);
  board.position.set(0, 0.76, 0.255); board.rotation.x = -0.18;
  chalk.add(board);
  group.add(chalk);

  // Reputation: five stars standing on the sign, gold for each one earned.
  const starG = new Baker().add(starGeo(0.15, 0.04), '#ffffff', { fx: GLOSS }).build();
  const stars = new THREE.InstancedMesh(starG, K.world, 5);
  stars.castShadow = true;
  stars.name = 'stars';
  group.add(stars);
  let starsAt: Anchors | null = null;

  // OPEN / CLOSED card on a string.
  // Both faces are one mesh on one texture sheet: the front shows CLOSED (top
  // half), the back, turned to face out when open, shows OPEN.
  const card = new THREE.Group();
  {
    const face = (back: boolean) => {
      const g = new THREE.PlaneGeometry(0.8, 0.4);
      const uv = g.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * 0.5 + (back ? 0 : 0.5));
      if (back) g.rotateY(Math.PI);
      g.translate(0, 0, back ? -0.012 : 0.012);
      return g;
    };
    const faces = mergeGeometries([face(false), face(true)]);
    const m = new THREE.Mesh(faces, new THREE.MeshStandardMaterial({ map: openCard(), roughness: 0.9 }));
    m.castShadow = true;
    card.add(m);
  }
  group.add(card);

  // Clay-pellet confetti for the opening.
  const conf = new THREE.InstancedMesh(new Baker().add(sph(0.07, 6, 4), '#ffffff').build(), K.world, CONFETTI);
  const cols = [P.lemon, P.terra, P.teal, P.blush, P.green, P.cream];
  const cp = Array.from({ length: CONFETTI }, (_, k) => { conf.setColorAt(k, new THREE.Color(cols[k % cols.length])); return { p: new THREE.Vector3(), v: new THREE.Vector3(), r: hash(k, 9) * 6 }; });
  conf.count = 0;
  conf.visible = false;
  conf.frustumCulled = false;
  group.add(conf);

  let st: PropState = { price: 0.75, pitcherFill: 1, recipe: 'classic', sweetness: 'classic', stock: { lemons: 1, sugar: 1, ice: 1 }, stars: 3, open: false };
  let wasOpen: boolean | null = null, openT0 = -99, confT = -99, lastTq = 0, pendingOpen = false;
  const flip = { x: 0, v: 0 };
  let bounceK = { sx: 1, sy: 1 };
  let anchors: Anchors | null = null;

  function paintStars() {
    if (!starsAt) return;
    const a = starsAt, n = 5, span = a.starSpan;
    const lit = Math.max(0, Math.min(5, Math.round(st.stars)));
    for (let k = 0; k < n; k++) {
      const x = a.stars[0] - span / 2 + (k + 0.5) * (span / n);
      stars.setMatrixAt(k, m4.compose(v.set(x, a.stars[1] + 0.13, a.stars[2] - 0.02), q.identity(), sc.set(1, 1, 1)));
      stars.setColorAt(k, k < lit ? GOLD : DULL);
    }
    stars.instanceMatrix.needsUpdate = true;
    if (stars.instanceColor) stars.instanceColor.needsUpdate = true;
  }

  // Only re-upload when something the props show has changed (set() runs every frame).
  let shownKey = '';
  function apply(force = false) {
    const key = `${st.recipe}|${st.sweetness}|${st.pitcherFill.toFixed(2)}|${Math.round(st.stock.lemons * LEMONS)}|${Math.round((st.stock.spoiling ?? 0) * LEMONS)}|${Math.round(st.stock.ice * ICE)}|${st.stock.sugar.toFixed(2)}|${Math.round(st.stars)}`;
    if (!force && key === shownKey) return;
    shownKey = key;
    liqMat.color.set(RECIPE_COLOR[st.recipe] ?? RECIPE_COLOR.classic);
    for (const [k, g] of Object.entries(garnishes)) g.visible = k === st.recipe && smallOn;
    const f = Math.max(0.02, Math.min(1, st.pitcherFill));
    liquid.scale.y = f;
    cubes.count = SWEET_CUBES[st.sweetness] ?? 2;
    lemons.count = Math.round(Math.max(0, Math.min(1, st.stock.lemons)) * LEMONS);
    // The oldest lemons sit on top of the heap: the spoiling share turns brown.
    const bad = Math.round(Math.max(0, Math.min(1, st.stock.spoiling ?? 0)) * lemons.count);
    for (let k = 0; k < LEMONS; k++) lemons.setColorAt(k, k >= lemons.count - bad && k < lemons.count ? BROWN : WHITE);
    if (lemons.instanceColor) lemons.instanceColor.needsUpdate = true;
    ice.count = Math.round(Math.max(0, Math.min(1, st.stock.ice)) * ICE);
    const s = Math.max(0, Math.min(1, st.stock.sugar));
    sack.scale.set(1 + (1 - s) * 0.25, 0.3 + s * 0.7, 1 + (1 - s) * 0.25);
    paintStars();
  }

  const body = clayMesh(new THREE.BufferGeometry(), K.world);
  const smallBody = clayMesh(new THREE.BufferGeometry(), K.world, false, false);
  body.name = 'propsBody'; smallBody.name = 'propsSmall';
  // Both glasses in one mesh, the pitcher's first so mid zoom can draw just that.
  const glass = new THREE.Mesh(new THREE.BufferGeometry(), K.glass);
  glass.renderOrder = 3;
  glass.name = 'propsGlass';
  group.add(body, smallBody, glass);
  let pitcherGlassEnd = 0, smallOn = true, scorcher = false;
  const handleAt = new THREE.Matrix4();
  function bake() {
    for (const o of [crate, cooler, chalk, pitcher, jar, cups]) o.updateMatrix();
    body.geometry.dispose(); smallBody.geometry.dispose();
    body.geometry = new Baker().raw(crateGeo, crate.matrix).raw(coolerGeo, cooler.matrix).raw(chalkGeo, chalk.matrix).raw(handleGeo, handleAt.copy(pitcher.matrix)).build();
    smallBody.geometry = new Baker().raw(jarClayGeo, jar.matrix).raw(cupsGeo, cups.matrix).build();
    glass.geometry.dispose();
    const pg = glassGeo.clone().applyMatrix4(pitcher.matrix), jg = jarGlassGeo.clone().applyMatrix4(jar.matrix);
    pitcherGlassEnd = pg.index!.count;
    glass.geometry = mergeGeometries([pg, jg]);
    pg.dispose(); jg.dispose();
    glass.geometry.computeBoundingSphere();
    glass.geometry.setDrawRange(0, smallOn ? Infinity : pitcherGlassEnd);
  }
  const at = (o: THREE.Object3D, p: [number, number, number], ry = 0) => { o.position.set(...p); o.rotation.y = ry; };
  const props: StandProps = {
    group,
    showSmall(on, starsOn) {
      smallOn = on;
      // Mid zoom also drops the garnish and the chalked price: two draws nobody can read from there.
      for (const o of [smallBody, cubes, sackRoot, board]) o.visible = on;
      for (const [k, g] of Object.entries(garnishes)) g.visible = on && k === st.recipe;
      pops.visible = on && scorcher;
      stars.visible = starsOn; // one instanced draw: phones keep the reputation on the sign
      glass.geometry.setDrawRange(0, on ? Infinity : pitcherGlassEnd);
    },
    place(a) {
      anchors = a;
      at(crate, a.crate, 0.15); at(sackRoot, a.sack, -0.3); at(cooler, a.cooler, -0.2); at(chalk, a.chalk, -0.35);
      at(pitcher, a.pitcher); at(cubes, a.cubes); at(jar, a.jar); at(cups, a.cups); at(card, a.card);
      starsAt = a;
      bake();
      apply(true);
    },
    set(s) {
      const priceMoved = s.price !== undefined && Math.abs(s.price - st.price) > 1e-6;
      if (priceMoved || (s.ceiling !== undefined && s.ceiling !== ceilingNow)) {
        priceNow = s.price ?? priceNow; ceilingNow = s.ceiling ?? ceilingNow;
        redraw(chalkPrice(priceNow, ceilingNow));
      }
      if (s.open !== undefined && wasOpen !== null && s.open !== wasOpen) pendingOpen = true;
      st = { ...st, ...s, stock: { ...st.stock, ...(s.stock ?? {}) } };
      if (s.open !== undefined) wasOpen = s.open;
      apply();
    },
    twos(tq) {
      const steps = Math.max(1, Math.min(4, Math.round((tq - lastTq) * 12)));
      if (tq === lastTq) return;
      lastTq = tq;
      if (pendingOpen) { pendingOpen = false; openT0 = tq; if (st.open) confT = tq; }
      for (let i = 0; i < steps * 2; i++) { flip.v += ((st.open ? Math.PI : 0) - flip.x) * 0.45 - flip.v * 0.3; flip.x += flip.v * 0.5; }
      card.rotation.y = flip.x;
      const k = tq - openT0;
      const b = k >= 0 && k < 1 ? Math.sin(k * 14) * Math.exp(-k * 4) : 0;
      bounceK = { sx: 1 - b * 0.06, sy: 1 + b * 0.1 };
      const ck = tq - confT;
      if (ck >= 0 && ck < 2.4 && anchors) {
        if (conf.count === 0) {
          conf.count = CONFETTI;
          const top = anchors.stars[1];
          cp.forEach((c, i) => { c.p.set((hash(i, 1) - 0.5) * 2.4, top, (hash(i, 2) - 0.2) * 1.4); c.v.set((hash(i, 3) - 0.5) * 4, 3 + hash(i, 4) * 4, (hash(i, 5) - 0.1) * 3); });
        }
        cp.forEach((c, i) => {
          for (let s = 0; s < steps; s++) { c.v.y -= 9.8 / 12; c.p.addScaledVector(c.v, 1 / 12); }
          if (c.p.y < 0.06) { c.p.y = 0.06; c.v.set(0, 0, 0); }
          e.set(c.r + tq * 8, c.r * 2 + tq * 5, 0); q.setFromEuler(e);
          conf.setMatrixAt(i, m4.compose(c.p, q, sc.set(1.2, 0.45, 1)));
        });
        conf.instanceMatrix.needsUpdate = true;
      } else if (conf.count) conf.count = 0;
      conf.visible = conf.count > 0;
    },
    setScorcher(on) { scorcher = on; pops.visible = on && smallOn; },
    bounce: () => bounceK,
    jarWorld: () => jar.localToWorld(new THREE.Vector3(0, 0.26, 0)),
  };
  apply();
  return props;
}
