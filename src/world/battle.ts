// Watchable auto-battle (canon section 12; spec "Brawls", "Defenses and
// gadgets"): replays a BattleReport's timeline at the plot in clay. The sim
// already decided everything, down to where each fighter stands ('at') and
// walks ('move'); this only moves people. Raiders march in from the street in
// their crew's gait and chop the fence (Walnut chips fly: hatchets only ever
// bite wood). Wherever two sides meet, the fighters vanish into a rolling cloud
// of lumpy cream and sand clay puffs that grows as fighters join. Out of it fly
// clay arms, stars, lemons, each crew's real hats and sound words on cut-paper
// starbursts in the colour of the side that landed them. A patterned
// tug-of-war bar counts who's left. KO'd fighters squash flat as a pancake,
// puff back up with spiral eyes and three orbiting stars, then wobble home in a
// zigzag while the winners dust off. Nobody stays down.
//
// Each perimeter breaks its own way (pickets pop like piano keys, mesh peels
// like a can lid, OUCH, RIIIP, bricks pop out) and each gadget shows when it
// fires: CLANK-CLANK, Honkers' HONK rings and a frozen raider under stars,
// peels that spin raiders like tops until they flop, cotton-wool rain clouds
// over soaked raiders, KA-CHUNK floodlights that turn night to day, and the
// watchtower's sweeping beam and big "!". At night raiders carry Lamp-amber
// flashlight cones.
import * as THREE from 'three';
import { FACTIONS, PLAYER_COLOR, type BattleReport, type Fighter, type RivalId } from '../sim/economy.ts';
import { COMBAT, type GadgetId } from '../sim/balance.ts';
import type { PlotView } from './bay.ts';
import { gadgetModels } from './buildings.ts';
import { Baker, sph, cap, cone, tor, box, lumpy, canvasTex, PAPER } from './clay/core.ts';
import { bakeGroup } from './clay/bake.ts';
import { P } from './clay/palette.ts';
import { kit } from './clay/kit.ts';
import { Figure, GAIT_OF, LOW_DETAIL, crowdDetail, gait, hatGeometry } from './clay/figure.ts';
import { BOSS_OF, makeBoss, makeCrew, CREW_LOOK } from './clay/cast.ts';
import { FENCE } from './clay/defenses.ts';
import { createFigureBatch, type FigureBatch } from './clay/figureBatch.ts';
import { createFx, starGeometry, reducedMotion, onPhone } from './clay/fx.ts';
import { goose } from './clay/creatures.ts';

type Pop = (pos: THREE.Vector3, text: string, kind: 'sale' | 'miss') => void;
type Owner = 'player' | RivalId;

/** What other code can hang off a fight (the world-life thread adds barks here). */
export interface BattleHooks {
  /** A fighter was knocked out: they squash flat now and wobble home after. */
  onKO?(who: THREE.Object3D, side: Fighter['side'], owner: Owner, last: boolean): void;
  /** A KO'd fighter has got back up and starts the dazed wobble home (they vanish when they get there). */
  onHome?(who: THREE.Object3D, side: Fighter['side'], owner: Owner): void;
  /** The fight is over: the winners are dusting off. */
  onWin?(winners: THREE.Object3D[], side: Fighter['side'], owner: Owner): void;
}

export interface BattleOptions {
  /** Phones draw 12 fighters a side instead of 24 (pass world.quality === 'phone'). */
  phone?: boolean;
}

type State = 'march' | 'stand' | 'pancake' | 'dazed' | 'home' | 'fled' | 'gone';
interface Unit {
  f: Fighter;
  owner: Owner;
  fig: Figure;
  obj: THREE.Group;
  target: THREE.Vector3;
  home: THREE.Vector3;
  speed: number; // world units per fight-second toward the target
  swing: number; // seconds left in the current swing
  state: State;
  st: number; // seconds in the current state
  spin: number; // seconds left spinning like a top (peel slick)
  flop: number; // seconds left lying flat after the spin
  frozen: number; // seconds left frozen stiff (Honkers)
  stars: number; // first orbiting-star slot, or -1
  phase: number;
  inCloud: boolean;
  zig: number;
  foe: Unit | null;
}

const APPROACH = 3.5; // fight-seconds of marching before the timeline starts
const PLAY_SPEED = 1.5;
const LINGER = 2.5;
const MEET = 1.5; // a foe this close pulls you into the cloud
const PANCAKE = 0.45, PUFF = 0.3, DAZED = 1.3;
const SPIN = 1.2; // of the slick's stun, this long spinning; the rest flat on your back
/** World units per plot-length: the sim's fence line (COMBAT.fenceAt) is the clay fence's front. */
const L = FENCE.zf / COMBAT.fenceAt;
const WORD: Record<Fighter['weapon'], string> = { fists: 'BONK!', clubs: 'THWACK!', hatchets: 'CHOP!' };
const LAMP = '#FFB55E';
const INK = '#2E2A4F';

const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
const mainOf = (o: Owner) => (o === 'player' ? hex(PLAYER_COLOR) : o === 'blenders' ? P.mango : hex(FACTIONS[o].color));
const accentOf = (o: Owner) => (o === 'player' ? '#FFFFFF' : hex(FACTIONS[o].accent));

// ---------- the tug-of-war bar ----------
function pattern(c: CanvasRenderingContext2D, o: Owner, x: number, w: number, h: number) {
  const main = mainOf(o), acc = accentOf(o);
  c.save();
  c.beginPath(); c.rect(x, 0, w, h); c.clip();
  c.fillStyle = main; c.fillRect(x, 0, w, h);
  c.fillStyle = acc; c.strokeStyle = INK; c.lineWidth = 1.5;
  switch (o) {
    case 'player': for (let i = x; i < x + w; i += 28) { c.fillRect(i, 0, 14, h); c.strokeRect(i, -2, 14, h + 4); } break; // wide vertical stripes, inked
    case 'sourwood': for (let i = x; i < x + w + 20; i += 22) for (let j = 6; j < h; j += 22) { c.beginPath(); c.moveTo(i, j - 7); c.lineTo(i + 7, j); c.lineTo(i, j + 7); c.lineTo(i - 7, j); c.fill(); } break; // diamonds
    case 'hollis': c.globalAlpha = 0.55; for (let i = x; i < x + w; i += 20) c.fillRect(i, 0, 10, h); for (let j = 0; j < h; j += 20) c.fillRect(x, j, w, 10); c.globalAlpha = 1; for (let i = x; i < x + w; i += 20) for (let j = 0; j < h; j += 20) c.strokeRect(i, j, 10, 10); break; // gingham, inked squares
    case 'fizzco': for (let i = x + 8; i < x + w; i += 20) for (let j = 8; j < h; j += 18) { c.beginPath(); c.arc(i + (j % 36 ? 10 : 0), j, 5, 0, 6.3); c.fill(); } break; // bubble dots
    case 'coldbrew': c.strokeStyle = '#FF4FA3'; c.lineWidth = 6; c.beginPath(); for (let i = x - 10, k = 0; i < x + w + 20; i += 14, k++) c.lineTo(i, k % 2 ? 8 : h - 8); c.stroke(); break; // pink zigzag
    case 'blenders': for (let j = 10; j < h; j += 18) { const wave = () => { c.beginPath(); for (let i = x; i <= x + w; i += 4) c.lineTo(i, j + Math.sin(i / 8) * 4); c.stroke(); }; c.strokeStyle = INK; c.lineWidth = 8; wave(); c.strokeStyle = P.lagoon; c.lineWidth = 5; wave(); } break; // waves, inked
  }
  c.restore();
}
function tugBar() {
  let att: Owner = 'player', def: Owner = 'player', share = 0.5;
  const W = 512, H = 64;
  const draw = (c: CanvasRenderingContext2D) => {
    c.clearRect(0, 0, W, H);
    const x0 = 16, w = W - 32, cut = x0 + w * share;
    c.save();
    c.beginPath(); c.roundRect(x0, 12, w, H - 24, 18); c.clip();
    pattern(c, att, x0, cut - x0, H);
    pattern(c, def, cut, x0 + w - cut, H);
    c.restore();
    c.lineWidth = 5; c.strokeStyle = INK;
    c.beginPath(); c.roundRect(x0, 12, w, H - 24, 18); c.stroke();
    // the knot in the middle of the rope
    c.beginPath(); c.arc(cut, H / 2, 14, 0, 6.3); c.fillStyle = '#FFF1D6'; c.fill(); c.stroke();
  };
  const tex = canvasTex(W, H, draw);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }));
  sprite.scale.set(5, 0.625, 1);
  sprite.renderOrder = 19;
  return {
    sprite,
    set(a: Owner, d: Owner, s: number) {
      if (a === att && d === def && Math.abs(s - share) < 0.001) return;
      att = a; def = d; share = s;
      tex.userData.redraw(draw);
    },
  };
}

// ---------- shared, built once ----------
const hatCache = new Map<Owner, THREE.BufferGeometry>();
/** Each crew's own hat (Peel Patrol leaf cap, bowler, straw disc, flat-top, beanie, visor), for flinging out of the cloud. */
const hatOf = (o: Owner) => { let g = hatCache.get(o); if (!g) { g = hatGeometry(CREW_LOOK[o]); g.center(); hatCache.set(o, g); } return g; };
const geese = new Map<Owner, THREE.Group>();
/** One Honkers per owner, reused: his bib is in the owner's colours, like the gadget goose he stands in for. */
const theGoose = (o: Owner) => { let g = geese.get(o); if (!g) { g = goose(o); geese.set(o, g); } return g; };

/** A unit cone with its tip at the origin, opening along +z (flashlights, floodlights, the watchtower beam). */
function beamGeometry() {
  const g = new THREE.ConeGeometry(1, 1, 36, 1, true);
  g.translate(0, -0.5, 0);
  g.rotateX(-Math.PI / 2);
  return g;
}
/** Light along a beam: bright at the lamp, fading to nothing at the far end (no hard rim). */
function beamTexture() {
  return canvasTex(4, 64, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)'); // the canvas top is the cone's tip
    c.clearRect(0, 0, 4, 64); c.fillStyle = g; c.fillRect(0, 0, 4, 64);
  });
}
/** A soft round pool of light on the ground. */
function poolTexture() {
  return canvasTex(128, 128, (c) => {
    const g = c.createRadialGradient(64, 64, 4, 64, 64, 62);
    g.addColorStop(0, 'rgba(255,246,216,0.9)'); g.addColorStop(0.6, 'rgba(255,240,200,0.45)'); g.addColorStop(1, 'rgba(255,236,190,0)');
    c.clearRect(0, 0, 128, 128); c.fillStyle = g; c.fillRect(0, 0, 128, 128);
  });
}

interface Deb { x: number; y: number; z: number; vx: number; vy: number; vz: number; axis: number; spin: number; age: number; life: number; delay: number; sx: number; sy: number; sz: number }

export function createBattle(scene: THREE.Scene, pop: Pop, camera?: THREE.Camera, hooks: BattleHooks = {}, opts: BattleOptions = {}): BattleView {
  const fx = createFx(scene);
  const calm = reducedMotion; // read when a punch or shake lands: the Options switch can change mid-run
  const phone = opts.phone ?? onPhone();
  const perSide = phone ? 12 : 24; // fighters drawn a side; extras join the dust cloud
  let units: Unit[] = [];
  let batch: FigureBatch | null = null;
  let lowDetail = false;
  let report: BattleReport | null = null;
  let view: PlotView | null = null;
  let t = 0, acc = 0, lastF = -1;
  let next = 0;
  // A live fight plays on its own clock (fight-seconds); a replay plays at PLAY_SPEED, and a live one's aftermath at 1×.
  let clock: (() => number | null) | null = null;
  let rate = PLAY_SPEED;
  let koKnown = false; // the last KO is known once the report is final (a live report's events are still growing)
  let done: (() => void) | null = null;
  let fence: THREE.Object3D | undefined;
  let standObj: THREE.Object3D | undefined;
  let shake = 0, freeze = 0, punch = 0, punchOff = 0;
  const punchDir = new THREE.Vector3();
  let swingsShown = 0;
  let extraAtt = 0, extraDef = 0, lastKo = -1, won = false;
  let honker: THREE.Group | null = null, honk = 0;
  let gadgetsObj: THREE.Object3D | undefined, gadgetsSwap: THREE.Object3D | null = null;
  let gadgets: GadgetId[] = [];
  let dark = false, cued = false, soaked = false, lit = 0, watch = 0, fizz = 0;
  const local = (x: number, z: number) => view!.root.localToWorld(new THREE.Vector3(x, 0, z));
  const sim = (x: number, z: number) => local(x * L, z * L);

  // ---- the cloud: lumpy cream and sand puffs, plus clay arms and hats flying out ----
  const PUFFS = 64, LIMBS = 24, HATS = 3, ORBIT = 3 * 24, BEAMS = 52, RAIN = 3 * 24, DEBRIS = 48;
  const puffG = (() => { const B = new Baker(); B.add(lumpy(sph(0.45, 12, 9), 0.06, 3, 2), '#FFFFFF'); return B.build(); })();
  const cloud = new THREE.InstancedMesh(puffG, kit().fig, PUFFS);
  const ccol = ['#FFF1D6', '#F3DDA6', '#FFFDF6', '#FFF1D6'];
  for (let i = 0; i < PUFFS; i++) cloud.setColorAt(i, new THREE.Color(ccol[i % 4]));
  cloud.castShadow = true;
  const limbG = (() => { const B = new Baker(); B.add(cap(0.08, 0.35, 3, 8), '#FFFFFF'); B.add(sph(0.1, 8, 6), '#FFFFFF', { p: [0, -0.28, 0] }); return B.build(); })();
  const limbs = new THREE.InstancedMesh(limbG, kit().fig, LIMBS);
  const lemonG = (() => { const B = new Baker(); B.add(lumpy(sph(0.13, 10, 8), 0.01, 8, 2), P.lemon, { s: [1, 0.85, 1.3] }); B.add(cone(0.04, 0.07, 6), P.lemon, { p: [0, 0, 0.17], r: [Math.PI / 2, 0, 0] }); return B.build(); })();
  const lemons = new THREE.InstancedMesh(lemonG, kit().fig, 4);
  const orbit = new THREE.InstancedMesh(starGeometry(), kit().fig, ORBIT);
  // sprinkler rain clouds: three small cotton-wool puffs over each soaked raider
  const rain = new THREE.InstancedMesh(puffG, kit().fig, RAIN);
  for (let i = 0; i < RAIN; i++) rain.setColorAt(i, new THREE.Color(i % 3 ? '#F4F2EE' : '#E3E6EC'));
  // HONK rings: card hoops rolling out of Honkers' beak
  const honkG = (() => { const B = new Baker(); B.add(tor(1, 0.05, 5, 24), '#FFFDF6', { fx: PAPER }); return B.build(); })();
  const honkRings = new THREE.InstancedMesh(honkG, kit().fig, 3);
  // breach debris: pickets, mesh panels, pencil stakes, wire and brick, each tinted per piece
  const debG = (() => { const B = new Baker(); B.add(box(1, 1, 1), '#FFFFFF', { fx: PAPER }); return B.build(); })();
  const debris = new THREE.InstancedMesh(debG, kit().fig, DEBRIS);
  for (let i = 0; i < DEBRIS; i++) debris.setColorAt(i, new THREE.Color('#ffffff'));
  const debs: (Deb | null)[] = Array(DEBRIS).fill(null);
  let nextDeb = 0;
  // light: flashlight cones, floodlight cones and the watchtower beam, plus a pool of floodlight on the ground
  const beamMat = new THREE.MeshBasicMaterial({ color: '#ffffff', map: beamTexture(), transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const beams = new THREE.InstancedMesh(beamGeometry(), beamMat, BEAMS);
  for (let i = 0; i < BEAMS; i++) beams.setColorAt(i, new THREE.Color(LAMP));
  beams.renderOrder = 5;
  const floodPool = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: poolTexture(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  floodPool.rotation.x = -Math.PI / 2;
  floodPool.visible = false;
  floodPool.renderOrder = 4;
  scene.add(floodPool);
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  const pools = [cloud, limbs, lemons, orbit, rain, honkRings, debris, beams] as THREE.InstancedMesh[];
  const zeroAll = (im: THREE.InstancedMesh) => { im.count = im.userData.cap; for (let i = 0; i < im.count; i++) im.setMatrixAt(i, ZERO); im.instanceMatrix.needsUpdate = true; im.visible = false; };
  for (const im of pools) { im.userData.cap = im.count; im.frustumCulled = false; zeroAll(im); scene.add(im); }
  /** Draw only the first n instances of a pool that packs its live ones first (empty ones cost nothing). */
  const drawN = (im: THREE.InstancedMesh, n: number) => { im.count = Math.max(1, Math.min(n, im.userData.cap)); im.visible = n > 0; };
  let hats: THREE.InstancedMesh[] = [];
  const bar = tugBar();
  bar.sprite.visible = false;
  scene.add(bar.sprite);
  const starFree: boolean[] = Array(ORBIT / 3).fill(true);

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s3 = new THREE.Vector3(), d3 = new THREE.Vector3(), c3 = new THREE.Color();
  const Z = new THREE.Vector3(0, 0, 1);
  /** Aim a beam instance from `from` along `dir`, `len` long and `r` wide at the end. */
  const camFwd = new THREE.Vector3();
  const aim = (i: number, from: THREE.Vector3, dir: THREE.Vector3, len: number, r: number, color: string) => {
    dir.normalize();
    // a beam pointing along the camera's view from close by fills the screen: fade it out
    if (camera) {
      camera.getWorldDirection(camFwd);
      const near = camera.position.distanceTo(from);
      if (near < 18 && camFwd.dot(dir) > 0.35) { const k = Math.max(0, (near - 8) / 10); len *= k; r *= k; }
    }
    q.setFromUnitVectors(Z, dir);
    beams.setMatrixAt(i, m4.compose(from, q, s3.set(r, r, len)));
    beams.setColorAt(i, c3.set(color));
  };

  function unCamera() {
    if (camera && punchOff) camera.position.addScaledVector(punchDir, -punchOff);
    punchOff = 0; punch = 0;
  }
  function restoreGadgets() {
    if (gadgetsSwap) { gadgetsSwap.parent?.remove(gadgetsSwap); gadgetsSwap.traverse((o) => (o as THREE.Mesh).geometry?.dispose()); gadgetsSwap = null; }
    if (gadgetsObj) gadgetsObj.visible = true;
  }

  function clear() {
    for (const u of units) scene.remove(u.obj);
    if (batch) { scene.remove(batch.mesh); batch.mesh.dispose(); batch = null; }
    units = [];
    report = null;
    won = false;
    if (fence) fence.visible = true;
    view?.root.children.forEach((c) => { if (c.name === 'sentry') c.visible = true; });
    // every pool back to empty: no stars or beams from this fight float on into the next
    for (const im of pools) zeroAll(im);
    for (const h of hats) { scene.remove(h); h.dispose(); }
    hats = [];
    debs.fill(null);
    floodPool.visible = false;
    bar.sprite.visible = false;
    starFree.fill(true);
    if (honker) { scene.remove(honker); honker = null; }
    restoreGadgets();
    unCamera();
    fx.clear();
  }

  const byId = (id: string) => units.find((u) => u.f.id === id);
  const head = (u: Unit) => u.obj.position.clone().setY(u.fig.height + 0.4);
  const standing = (u: Unit) => u.state === 'march' || u.state === 'stand';
  const setState = (u: Unit, s: State) => { u.state = s; u.st = 0; };
  const takeStars = (u: Unit) => { if (u.stars >= 0) return; const slot = starFree.indexOf(true); if (slot >= 0) { starFree[slot] = false; u.stars = slot; } };
  const dropStars = (u: Unit) => { if (u.stars < 0) return; for (let i = 0; i < 3; i++) orbit.setMatrixAt(u.stars * 3 + i, ZERO); orbit.instanceMatrix.needsUpdate = true; starFree[u.stars] = true; u.stars = -1; };
  const sideWord = (at: THREE.Vector3, text: string, o: Owner, size = 1) => fx.word(at, text, mainOf(o), accentOf(o), size);

  function knockOut(u: Unit, last: boolean) {
    if (!standing(u)) return;
    setState(u, 'pancake');
    if (u.fig.flexing) u.fig.flex(false);
    u.inCloud = false;
    u.spin = u.flop = u.frozen = 0;
    u.obj.rotation.x = 0;
    u.obj.position.y = 0;
    u.obj.visible = true;
    fx.dust(u.obj.position, 4, 0.4);
    fx.stars(head(u), 2);
    takeStars(u);
    if (last) { freeze = 0.3; punch = calm() ? 0 : 1; }
    hooks.onKO?.(u.obj, u.f.side, u.owner, last);
  }

  /** Breach debris: a piece pops off `delay` seconds from now. */
  function deb(at: THREE.Vector3, color: string, size: [number, number, number], vel: [number, number, number], axis: number, spin: number, delay: number) {
    debs[nextDeb] = { x: at.x, y: at.y, z: at.z, vx: vel[0], vy: vel[1], vz: vel[2], axis, spin, age: 0, life: 1.5, delay, sx: size[0], sy: size[1], sz: size[2] };
    debris.setColorAt(nextDeb, c3.set(color));
    if (debris.instanceColor) debris.instanceColor.needsUpdate = true;
    nextDeb = (nextDeb + 1) % DEBRIS;
    debris.visible = true;
  }
  /** Each perimeter breaks its own way (spec "Defenses and gadgets", Breach column). */
  function breach(tier: number, att: Owner, def: Owner) {
    // the fence breaks in its owner's trim, as fenceModel dresses it: lemon only on the player's
    const yel = def === 'player' ? P.lemon : mainOf(def);
    if (!view) return;
    const out = local(0, 1).sub(local(0, 0)).normalize(); // toward the street
    const front = (x: number, y: number) => local(x, FENCE.zf).setY(y);
    const ov = (k: number, up: number, side = 0): [number, number, number] => [out.x * k + side, up, out.z * k];
    const rnd = Math.random;
    const word = (text: string) => sideWord(front(0, 2.4), text, att, 1.15);
    switch (tier) {
      case 1: // pickets pop like piano keys, one after the next along the front
        for (let i = 0; i < 18; i++) deb(front(-5 + i * 0.59, 0.4), i % 4 ? P.cream : yel, [0.11, 0.8, 0.04], ov(0.6, 3.4 + rnd()), 0, 7, i * 0.04);
        word('POP-POP-POP!');
        break;
      case 2: // the mesh peels back like a can lid, panel by panel from the gate
        for (let i = 0; i < 8; i++) { const x = (i % 2 ? -1 : 1) * (0.8 + Math.floor(i / 2) * 1.2); deb(front(x, 0.7), '#b8c2cc', [1.1, 1.3, 0.03], ov(1.4, 2.4), 0, -3.5, Math.floor(i / 2) * 0.08); }
        word('SKREEEK!');
        break;
      case 3: // the pencil stakes go flying, and the choppers yelp
        for (let i = 0; i < 14; i++) deb(front(-4.6 + i * 0.7, 0.5), yel, [0.14, 1.0, 0.14], ov(1.2, 3 + rnd() * 1.5, (rnd() - 0.5)), i % 2 ? 0 : 2, 9, rnd() * 0.25);
        word('OUCH!');
        break;
      case 4: // the coils snap, and snagged sleeves go with them
        for (let i = 0; i < 10; i++) deb(front(-4.5 + i, 0.7), '#9aa5b1', [0.9, 0.05, 0.05], ov(1, 2.6 + rnd()), 1, 10, rnd() * 0.2);
        for (let i = 0; i < 6; i++) deb(front(-2 + i * 0.8, 1), mainOf(att), [0.26, 0.2, 0.03], ov(0.6, 2 + rnd()), 2, 6, 0.1 + rnd() * 0.2);
        word('RIIIP!');
        break;
      case 5: // bricks pop out of the Citrus Fortress Wall, row by row
        for (let i = 0; i < 20; i++) deb(front(-4.4 + (i % 10) * 0.98, 0.15 + Math.floor(i / 10) * 0.32), i % 3 ? '#c8664a' : '#b5523b', [0.45, 0.24, 0.42], ov(2.4, 2.6 + rnd()), 0, 5, (i % 10) * 0.05 + Math.floor(i / 10) * 0.12);
        word('CLONK!');
        break;
    }
    const at = local(0, FENCE.zf + 0.4).setY(0.3);
    fx.dust(at, 10, 2.5);
    if (tier <= 4) fx.chips(at.setY(0.6), 8);
  }
  function stepDebris(dt: number) {
    if (!debris.visible) return;
    let live = 0;
    debs.forEach((b, i) => {
      if (!b) return;
      if (b.delay > 0) { b.delay -= dt; live++; return; }
      b.age += dt;
      if (b.age >= b.life) { debs[i] = null; debris.setMatrixAt(i, ZERO); return; }
      live++;
      b.vy -= 11 * dt;
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      if (b.y < b.sy * 0.3) { b.y = b.sy * 0.3; b.vy *= -0.3; b.vx *= 0.5; b.vz *= 0.5; b.spin *= 0.4; }
      const a = b.spin * b.age, u = b.age / b.life;
      e.set(b.axis === 0 ? a : 0, b.axis === 1 ? a : 0, b.axis === 2 ? a : 0);
      q.setFromEuler(e);
      const k = u > 0.75 ? 1 - (u - 0.75) / 0.25 : 1;
      debris.setMatrixAt(i, m4.compose(v.set(b.x, b.y, b.z), q, s3.set(b.sx * k, b.sy * k, b.sz * k)));
    });
    debris.instanceMatrix.needsUpdate = true;
    if (!live) debris.visible = false;
  }

  /** Honkers waddles out of his spot by the gate (the baked gadget goose steps aside for him). */
  function bringHonkers(at: THREE.Vector3) {
    if (!honker) {
      honker = theGoose((report?.defender ?? 'player') as Owner);
      honker.scale.setScalar(1.3);
      scene.add(honker);
      if (gadgetsObj && !gadgetsSwap) {
        gadgetsObj.visible = false;
        const rest = gadgets.filter((g) => g !== 'goose');
        if (rest.length) { gadgetsSwap = gadgetModels(rest, (report?.defender ?? 'player') as Owner); gadgetsSwap.position.copy(gadgetsObj.position); gadgetsSwap.rotation.copy(gadgetsObj.rotation); gadgetsObj.parent?.add(gadgetsSwap); bakeGroup(gadgetsSwap); }
      }
    }
    honker.position.copy(gadgetsObj ? gadgetsObj.localToWorld(new THREE.Vector3(-3.3, 0, 1.35)) : local(-3.3, 1.35));
    honker.lookAt(at.x, 0, at.z);
    honk = 1.2;
  }

  /** The gadgets that fire as the raid comes in (alarm, floodlights, watchtower, sprinklers). */
  function cueGadgets(stage: 'approach' | 'contact') {
    if (!view || !report) return;
    const def = report.defender as Owner;
    if (stage === 'approach') {
      if (gadgets.includes('alarm')) sideWord(local(-3.1, FENCE.zf + 0.3).setY(1.9), 'CLANK-CLANK!', def);
      if (gadgets.includes('watchtower')) { watch = 1; fx.word(local(-4, -5.4).setY(5.4), '!', mainOf(def), def === 'player' ? INK : accentOf(def), 1.7); }
      if (gadgets.includes('floodlights') && dark) { lit = 0.001; sideWord(local(0, -6.2).setY(4.2), 'KA-CHUNK!', def); }
    } else if (gadgets.includes('sprinkler')) {
      soaked = true;
      sideWord(local(3.4, 0).setY(2.2), 'PSSHHH!', def);
      for (const [x, z] of [[-3.6, -0.8], [3.6, -0.8]]) fx.splash(local(x, z).setY(0.3), 8);
    }
  }

  function handle(ev: BattleReport['events'][number], idx: number) {
    switch (ev.type) {
      case 'at': {
        // where the sim has them at contact: defenders are already there, raiders are marching to it
        const u = byId(ev.a);
        if (u && standing(u)) u.target.copy(sim(ev.x, ev.z));
        break;
      }
      case 'move': {
        const u = byId(ev.a);
        if (!u || !standing(u)) return;
        u.target.copy(sim(ev.x, ev.z));
        u.speed = Math.max(0.6, ev.speed * L);
        if (u.state === 'stand') u.state = 'march';
        break;
      }
      case 'swing': {
        const a = byId(ev.a), b = byId(ev.b);
        if (!a || !b) return;
        a.swing = 0.35;
        a.foe = b;
        if (swingsShown++ % 2 === 0) {
          const mid = a.obj.position.clone().lerp(b.obj.position, 0.5).setY(2.3 + Math.random() * 0.6);
          mid.x += (Math.random() - 0.5) * 1.6; mid.z += (Math.random() - 0.5) * 0.8;
          sideWord(mid, WORD[a.f.weapon], a.owner);
          if (Math.random() < 0.4) fx.stars(mid.setY(1.4), 2);
        }
        break;
      }
      case 'chop': {
        const a = byId(ev.a);
        if (!a) return;
        a.swing = 0.35;
        shake = calm() ? 0 : 0.25;
        const hitAt = ev.target === 'fence' ? a.obj.position.clone().setY(0.8) : local((Math.random() - 0.5) * 1.6, 0.6).setY(1.2);
        // hatchets and clubs only ever bite wood: a burst of Walnut chips
        fx.chips(hitAt, a.f.weapon === 'hatchets' ? 8 : 4);
        const tier = report?.perimeter ?? 0;
        if (ev.target === 'fence' && (tier === 3 || tier === 4) && swingsShown % 4 === 1) sideWord(hitAt.clone().setY(2.3), tier === 3 ? 'OUCH!' : 'RIIIP!', a.owner); // pencil points and barbs bite back
        else if (swingsShown % 3 === 0) sideWord(hitAt.clone().setY(2.2), WORD[a.f.weapon], a.owner);
        swingsShown++;
        break;
      }
      case 'breach':
        if (fence) { fence.visible = false; breach(report?.perimeter ?? 1, report?.attacker as Owner, (report?.defender ?? 'player') as Owner); }
        pop(local(0, 2.2).setY(2), 'The fence is down!', 'miss');
        break;
      case 'ko': {
        const u = byId(ev.a);
        if (u) knockOut(u, idx === lastKo);
        else {
          if (idx === lastKo) { freeze = 0.3; punch = calm() ? 0 : 1; }
          if (report && report.attackers.some((f) => f.id === ev.a)) extraAtt = Math.max(0, extraAtt - 1); else extraDef = Math.max(0, extraDef - 1);
        }
        break;
      }
      case 'flee': {
        const u = byId(ev.a);
        if (!u) { if (report && report.attackers.some((f) => f.id === ev.a)) extraAtt = Math.max(0, extraAtt - 1); else extraDef = Math.max(0, extraDef - 1); return; }
        if (!standing(u)) return;
        setState(u, 'fled');
        u.inCloud = false;
        u.frozen = u.spin = u.flop = 0;
        u.obj.rotation.x = 0;
        dropStars(u);
        u.obj.visible = true;
        u.target.copy(u.home);
        break;
      }
      case 'stun': {
        const u = byId(ev.a);
        if (!u || !report) return;
        if (ev.by === 'goose') {
          // Honkers stretches up and HONKs; the first raider freezes stiff under orbiting stars
          bringHonkers(u.obj.position);
          u.frozen = COMBAT.goose.stun;
          takeStars(u);
          { const d = (report.defender ?? 'player') as Owner; fx.word(head(u).setY(2.6), 'HONK!', mainOf(d), accentOf(d), 1.1); }
        } else {
          // the peels: spin like a top, then flop flat on your back for the rest of the stun
          u.spin = SPIN;
          u.flop = Math.max(0.5, COMBAT.slick.stun - SPIN);
          const def = report.defender as Owner;
          fx.word(head(u), 'SQUISH!', mainOf(def), accentOf(def));
        }
        break;
      }
      case 'drop': {
        // Butterfingers: the weapon goes flying
        const u = byId(ev.a);
        const w = u?.obj.getObjectByName('weapon');
        if (!u || !w) return;
        w.visible = false;
        deb(head(u).setY(1.4), P.walnut, [0.1, 0.7, 0.1], [(Math.random() - 0.5) * 2, 4, (Math.random() - 0.5) * 2], 2, 12, 0);
        fx.word(head(u), 'OOPS!', mainOf(u.owner), accentOf(u.owner), 0.8);
        break;
      }
      case 'grab':
        pop(local(0, 0.6).setY(2.4), 'They grab the till!', 'miss');
        break;
    }
  }

  /** One pose on twos: walk, swing, squash, puff, dazed wobble, the cloud and the gadgets. */
  function step(dt: number, f: number) {
    const tq = f / 12;
    fizz += dt * 9; // FizzCo march in lockstep: one shared stride for the whole crew
    // who's in a cloud? Standing fighters with a standing foe close by (a frozen or flopped raider sits out).
    const free = (u: Unit) => standing(u) && u.frozen <= 0 && u.spin <= 0 && u.flop <= 0;
    const live = won ? [] : units.filter(free);
    for (const u of units) u.inCloud = false;
    for (const a of live) for (const b of live) {
      if (a.f.side === b.f.side || a.inCloud && b.inCloud) continue;
      if (a.obj.position.distanceToSquared(b.obj.position) < MEET * MEET) { a.inCloud = b.inCloud = true; }
    }
    // cluster the brawlers: each cloud sits on a group of touching fighters
    const inCloud = units.filter((u) => u.inCloud);
    const clusters: { c: THREE.Vector3; n: number; owners: Owner[] }[] = [];
    for (const u of inCloud) {
      const near = clusters.find((k) => k.c.distanceToSquared(u.obj.position) < 3.2 * 3.2);
      if (near) { near.c.multiplyScalar(near.n).add(u.obj.position).multiplyScalar(1 / (near.n + 1)); near.n++; if (!near.owners.includes(u.owner)) near.owners.push(u.owner); }
      else clusters.push({ c: u.obj.position.clone(), n: 1, owners: [u.owner] });
    }
    if (clusters.length && !won) clusters.sort((x, y) => y.n - x.n)[0].n += extraAtt + extraDef; // extras join the biggest cloud
    const total = clusters.reduce((s, k) => s + k.n, 0);
    let pi = 0, li = 0;
    for (const k of clusters) {
      const n = Math.min(PUFFS - pi, Math.max(6, Math.round((PUFFS * k.n) / Math.max(total, 1))));
      const r = 0.7 + Math.sqrt(k.n) * 0.35;
      for (let i = 0; i < n; i++, pi++) {
        const a = i * 2.4 + f * 0.9 * (i % 2 ? 1 : -1);
        const ring = 0.55 + (i % 3) * 0.25;
        v.set(k.c.x + Math.cos(a) * r * ring + (Math.random() - 0.5) * 0.2, 0.45 + (i % 4) * 0.3 * Math.min(1.6, r) + (Math.random() - 0.5) * 0.15, k.c.z + Math.sin(a) * r * ring * 0.8);
        const s = (0.75 + ((i * 37) % 10) / 16) * Math.min(1.8, 0.8 + r * 0.25);
        q.identity();
        cloud.setMatrixAt(pi, m4.compose(v, q, s3.set(s, s * 0.85, s)));
      }
      // clay arms and legs poke out of the cloud in each side's colours
      const nl = Math.min(LIMBS - li, 4 + Math.round(k.n));
      for (let i = 0; i < nl; i++, li++) {
        const a = i * 1.05 + Math.floor(f / 2) * 1.7;
        e.set(Math.cos(a) * 1.4, 0, a);
        q.setFromEuler(e);
        v.set(k.c.x + Math.cos(a) * (r + 0.35), 0.8 + Math.sin(a * 1.3) * 0.5, k.c.z + Math.sin(a) * (r * 0.8 + 0.2));
        limbs.setMatrixAt(li, m4.compose(v, q, s3.setScalar(1.1)));
        const o = k.owners[i % k.owners.length];
        limbs.setColorAt(li, c3.set(i % 3 === 2 ? P.skin : mainOf(o)));
      }
    }
    for (let i = pi; i < PUFFS; i++) cloud.setMatrixAt(i, ZERO);
    for (let i = li; i < LIMBS; i++) limbs.setMatrixAt(i, ZERO);
    cloud.instanceMatrix.needsUpdate = limbs.instanceMatrix.needsUpdate = true;
    if (limbs.instanceColor) limbs.instanceColor.needsUpdate = true;
    drawN(cloud, pi); drawN(limbs, li);
    // each crew's own hats, and a lemon or two, tumble out of the biggest cloud on a tilted axis
    const big = clusters[0];
    lemons.visible = !!big;
    hats.forEach((h, hi) => {
      h.visible = !!big && big.owners.includes(h.userData.owner as Owner);
      if (!h.visible) return;
      for (let i = 0; i < HATS; i++) {
        const j = i + hi * HATS;
        const ph = ((tq * 0.6 + j / (HATS * 2)) % 1);
        const a = j * 2.1 + Math.floor(tq * 0.6 + j / (HATS * 2)) * 1.3;
        const d = ph * 2.6;
        v.set(big!.c.x + Math.cos(a) * d, 1.4 + Math.sin(ph * Math.PI) * 2.2, big!.c.z + Math.sin(a) * d * 0.8);
        e.set(0.5 + ph * 5, a, 0.35);
        q.setFromEuler(e);
        h.setMatrixAt(i, i < 1 + Math.min(2, big!.n / 4) ? m4.compose(v, q, s3.setScalar(0.5)) : ZERO);
      }
      h.instanceMatrix.needsUpdate = true;
    });
    if (big) {
      for (let i = 0; i < 4; i++) {
        const ph = ((tq * 0.45 + i / 4 + 0.13) % 1);
        const a = i * 1.7 + 0.6 + Math.floor(tq * 0.45 + i / 4 + 0.13) * 2.1;
        v.set(big.c.x + Math.cos(a) * ph * 2.2, 1.2 + Math.sin(ph * Math.PI) * 1.8, big.c.z + Math.sin(a) * ph * 1.8);
        e.set(f * 0.6, f * 0.9, 0);
        q.setFromEuler(e);
        lemons.setMatrixAt(i, i < 1 + Math.min(3, big.n / 4) ? m4.compose(v, q, s3.setScalar(1)) : ZERO);
      }
      lemons.instanceMatrix.needsUpdate = true;
      if (Math.random() < 0.15) fx.dust(big.c.clone().setY(0.2), 2, 1.2);
    }

    let orbiting = false, ri = 0, bi = 0;
    const night = dark || kit().glow.value > 1;
    for (const u of units) {
      const o = u.obj, fig = u.fig;
      u.st += dt;
      if (u.state === 'gone') continue;
      // brawlers vanish into the cloud; hits on people stay inside it
      o.visible = !u.inCloud;
      if (u.stars >= 0) {
        orbiting = true;
        const hp = o.position, hy = u.flop > 0 && u.spin <= 0 ? 0.6 : fig.height + 0.2;
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI * 2 + f * 0.6;
          v.set(hp.x + Math.cos(a) * 0.45, hy + Math.sin(a * 2) * 0.05, hp.z + Math.sin(a) * 0.45);
          e.set(0, a, f * 0.4);
          q.setFromEuler(e);
          orbit.setMatrixAt(u.stars * 3 + i, m4.compose(v, q, s3.setScalar(0.8)));
        }
      }
      if (standing(u)) {
        // a soaked raider walks under his own tiny cotton-wool rain cloud, dripping
        if (soaked && u.f.side === 'att' && ri + 3 <= RAIN) {
          for (let i = 0; i < 3; i++, ri++) {
            v.set(o.position.x + (i - 1) * 0.22, fig.height + 0.75 + (i === 1 ? 0.1 : 0), o.position.z + Math.sin(i * 2 + u.phase) * 0.06);
            q.identity();
            rain.setMatrixAt(ri, m4.compose(v, q, s3.set(0.42, 0.3, 0.36)));
          }
          if (Math.random() < 0.12) fx.splash(v.set(o.position.x + (Math.random() - 0.5) * 0.4, fig.height + 0.5, o.position.z), 1);
        }
        // at night every raider carries a Lamp-amber flashlight, sweeping ahead
        if (night && u.f.side === 'att' && bi < BEAMS - 3) {
          const yaw = o.rotation.y + Math.sin(tq * 2.2 + u.phase) * 0.35;
          d3.set(Math.sin(yaw), -0.32, Math.cos(yaw));
          v.set(o.position.x + Math.sin(o.rotation.y) * 0.3, fig.height * 0.55, o.position.z + Math.cos(o.rotation.y) * 0.3);
          aim(bi++, v, d3, 4.2, 0.8, LAMP);
        }
      }
      if (u.state === 'pancake') {
        // squash flat as a pancake
        const k = Math.min(1, u.st / 0.12);
        fig.pose({ sq: 0.85 * k, lift: 0, aL: [0, 1.4], aR: [0, -1.4], lL: 0, lR: 0 }, f);
        if (u.st > PANCAKE) { setState(u, 'dazed'); fig.face('ko'); }
        continue;
      }
      if (u.state === 'dazed') {
        // puff back up (overshoot), then sway on the spot under stars
        const k = Math.min(1, u.st / PUFF);
        const sq = u.st < PUFF ? 0.85 * (1 - k) - Math.sin(k * Math.PI) * 0.25 : 0;
        fig.pose({ sq, sway: Math.sin(u.st * 9) * 0.22, headRoll: Math.sin(u.st * 7) * 0.3, aL: [-0.4, 0.8], aR: [-0.4, -0.8] }, f);
        if (u.st > PUFF + DAZED) { setState(u, 'home'); u.target.copy(u.home); hooks.onHome?.(o, u.f.side, u.owner); }
        continue;
      }
      if (u.frozen > 0) {
        // Honkers' HONK: frozen stiff mid-step, arms out, under orbiting stars
        u.frozen -= dt;
        fig.pose({ sq: -0.04, lean: -0.12, aL: [-0.3, 1.1], aR: [-0.3, -1.1], lL: 0.25, lR: -0.1, headTilt: -0.2 }, f);
        if (u.frozen <= 0) dropStars(u);
        continue;
      }
      if (u.spin > 0) {
        u.spin -= dt;
        o.rotation.y += dt * 12; // spun like a top
        fig.pose({ sq: 0.05, aL: [0, 1.2], aR: [0, -1.2], headRoll: 0.3 }, f);
        if (u.spin <= 0) fx.dust(o.position, 3, 0.3);
        continue;
      }
      if (u.flop > 0) {
        // ...and flop flat on your back, then bounce up again
        u.flop -= dt;
        o.rotation.x = -1.35 * Math.min(1, u.flop / 0.2);
        o.position.y = u.flop > 0.2 ? 0.18 : 0.18 * (u.flop / 0.2);
        fig.pose({ sq: 0, aL: [0, 1.5], aR: [0, -1.5], lL: 0.4, lR: -0.4 }, f);
        if (u.flop <= 0) { o.rotation.x = 0; o.position.y = 0; }
        continue;
      }
      // walk toward the target in the crew's own gait
      const d = d3.copy(u.target).sub(o.position).setY(0);
      const dist = d.length();
      const homeward = u.state === 'home' || u.state === 'fled';
      const speed = u.state === 'fled' ? 5 : u.state === 'home' ? 2.2 : u.speed;
      if (dist > 0.05) {
        const stepLen = Math.min(dist, speed * dt);
        d.normalize();
        o.position.addScaledVector(d, stepLen);
        if (u.state === 'home') {
          // a zigzag wobble home
          u.zig += dt;
          o.position.addScaledVector(v.set(d.z, 0, -d.x), Math.cos(u.zig * 6) * dt * 1.6);
        }
        o.rotation.y = Math.atan2(d.x, d.z) + (u.state === 'home' ? Math.sin(u.zig * 6) * 0.4 : 0);
        u.phase += dt * (u.state === 'fled' ? 14 : 9);
        if (fig.flexing) fig.flex(false);
        if (u.state === 'home') fig.pose({ lift: Math.abs(Math.sin(u.phase)) * 0.04, sway: Math.sin(u.phase) * 0.25, lL: Math.sin(u.phase) * 0.5, lR: -Math.sin(u.phase) * 0.5, aL: [-0.4, 0.8], aR: [-0.4, -0.8], headRoll: Math.sin(u.phase * 0.8) * 0.3 }, f);
        else gait(fig, GAIT_OF[fig.sp?.kind ?? 'pear'] ?? 'bob', u.owner === 'fizzco' && u.state === 'march' ? fizz : u.phase, f, tq);
      } else if (homeward) {
        dropStars(u);
        fig.face('neutral');
        setState(u, 'gone');
        o.visible = false;
        continue;
      } else if (won) {
        // the winners dust off: pat pat, a little puff
        const pat = Math.sin(u.st * 10);
        fig.pose({ aL: [-0.9, -0.4 + pat * 0.2], aR: [-0.9, 0.4 - pat * 0.2], lift: Math.abs(pat) * 0.02, headTilt: -0.15 }, f);
        if (Math.random() < 0.04) fx.dust(o.position.clone().setY(0.6), 1, 0.3);
      } else {
        // squared up to whoever they're swinging at
        if (u.foe && standing(u.foe)) o.rotation.y = Math.atan2(u.foe.obj.position.x - o.position.x, u.foe.obj.position.z - o.position.z);
        if (u.swing > 0) {
          u.swing -= dt;
          if (fig.flexing) fig.flex(false);
          const k = Math.sin(Math.PI * (1 - u.swing / 0.35));
          fig.pose({ sq: k * 0.06, lean: k * 0.15, aR: [-2.2 * k, -0.2], aL: [-0.6, 0.3] }, f);
        } else if (o.userData.boss === 'brock') {
          fig.pose({ sq: Math.sin(tq * 6) > 0.6 ? 0.05 : 0, headTilt: -0.1 }, f);
          fig.flex(true); // the double-bicep flex
        } else if (o.userData.boss === 'vera') {
          const tap = f % 12 < 3; // the silver-tipped cane taps on every beat
          fig.pose({ aR: [tap ? 0.3 : 0.12, -0.1], lift: tap ? 0.01 : 0, headTilt: -0.08 }, f);
        } else {
          fig.pose({ sq: Math.sin(tq * 6 + u.phase) > 0.6 ? 0.04 : 0, lean: 0.08, aL: [-1.2, 0.35], aR: [-1.2, -0.35] }, f);
        }
      }
      if (u.state === 'march' && dist < 0.1) u.state = 'stand';
    }
    orbit.visible = orbiting;
    if (orbiting) orbit.instanceMatrix.needsUpdate = true;
    drawN(rain, ri);
    rain.instanceMatrix.needsUpdate = true;

    // floodlights (KA-CHUNK: night turns to day) and the watchtower's sweeping beam
    if (view && lit > 0) {
      lit = Math.min(1, lit + dt * 3);
      // no cones: the lamp hoods glow and the whole yard sits in a pool of daylight
      floodPool.visible = true;
      floodPool.position.copy(local(0, -1.5)).setY(0.12);
      floodPool.scale.set(17, 15, 1);
      floodPool.rotation.z = view.root.rotation.y;
      (floodPool.material as THREE.MeshBasicMaterial).opacity = 0.95 * lit;
    }
    if (view && watch > 0) {
      const sweep = Math.sin(tq * 1.6) * 0.8;
      v.copy(local(-4, -5.4)).setY(3.4);
      const to = local(Math.sin(sweep) * 4.5, 1.2 + Math.cos(sweep) * 1.2); // sweeps the yard inside the fence
      aim(bi++, v, d3.copy(to).sub(v), v.distanceTo(to), 0.7, dark ? LAMP : '#7a7262'); // by day the beam is faint
    }
    drawN(beams, bi);
    beams.instanceMatrix.needsUpdate = true;
    if (beams.instanceColor) beams.instanceColor.needsUpdate = true;
    stepDebris(dt);

    // the tug-of-war bar over the plot
    if (report && view) {
      const att = units.filter((u) => u.f.side === 'att' && standing(u)).length + extraAtt;
      const def = units.filter((u) => u.f.side === 'def' && standing(u)).length + extraDef;
      bar.sprite.visible = t > -APPROACH * 0.5;
      bar.sprite.position.copy(local(0, 3).setY(4.6));
      bar.set(report.attacker as Owner, report.defender as Owner, att + def ? att / (att + def) : 0.5);
    }

    // Honkers stretches his neck for the HONK and rolls out rings, then waddles back to his spot
    if (honker) {
      honk -= dt;
      const { neck } = honker.userData as { neck: THREE.Object3D };
      const k = Math.max(0, Math.sin(Math.min(1, (1.2 - honk) / 0.5) * Math.PI));
      neck.scale.set(1, 1 + k * 0.5, 1);
      neck.rotation.x = -k * 0.5;
      honker.position.y = Math.abs(Math.sin(tq * 10)) * 0.04;
      honkRings.visible = honk > 0;
      if (honk > 0) {
        honker.updateMatrixWorld();
        const beak = honker.localToWorld(v.set(0, 1.0, 0.45));
        const fwd = honker.getWorldDirection(d3);
        for (let i = 0; i < 3; i++) {
          const ph = ((1.2 - honk) * 1.4 + i / 3) % 1;
          q.setFromUnitVectors(Z, fwd);
          honkRings.setMatrixAt(i, m4.compose(s3.copy(beak).addScaledVector(fwd, ph * 2.2), q, new THREE.Vector3().setScalar(0.12 + ph * 0.5)));
        }
        honkRings.instanceMatrix.needsUpdate = true;
      }
      if (honk < -1.5) { scene.remove(honker); honker = null; restoreGadgets(); }
    }
  }

  return {
    play(r, v0, onDone, live) {
      clear();
      report = r;
      view = v0;
      clock = live ?? null;
      rate = live ? 1 : PLAY_SPEED;
      t = clock?.() ?? -APPROACH;
      acc = 0;
      next = 0;
      done = onDone;
      swingsShown = 0;
      freeze = 0;
      lastKo = -1;
      cued = soaked = false;
      lit = watch = 0;
      gadgets = r.gadgets ?? [];
      dark = !!r.night || kit().glow.value > 1;
      koKnown = r.duration < Infinity;
      if (koKnown) r.events.forEach((ev, i) => { if (ev.type === 'ko') lastKo = i; });
      fence = v0.root.getObjectByName('fence');
      gadgetsObj = v0.root.getObjectByName('gadgets');
      standObj = v0.root.children[0];
      v0.root.children.forEach((c) => { if (c.name === 'sentry') c.visible = false; });
      extraAtt = Math.max(0, r.attackers.length - perSide);
      extraDef = Math.max(0, r.defenders.length - perSide);
      // where the sim puts everyone at contact (plot-lengths: x across, z out from the stand front)
      const at = new Map<string, THREE.Vector3>();
      for (const ev of r.events) { if (ev.t > 0) break; if (ev.type === 'at') at.set(ev.a, sim(ev.x, ev.z)); }
      const add = (f: Fighter, i: number, n: number) => {
        const isAtt = f.side === 'att';
        const owner = (isAtt ? r.attacker : r.defender) as Owner;
        // the crew's own look, tier weapon and kit: Padded Vest, Pro Gear, level chevrons on your crew, Lanky Dex
        // The HQ Boss Room's boss fights as themselves: Vera taps her cane, Brock flexes.
        const boss = owner !== 'player' && f.id.includes('-boss-') ? BOSS_OF[owner as keyof typeof BOSS_OF] : undefined;
        const fig = boss ? makeBoss(boss, kit().fig, { detail: lowDetail ? crowdDetail() : 1 }) : makeCrew(owner, {
          weapon: f.weapon,
          gear: f.gear ?? (f.armor > 0 ? 'pro' : 'none'),
          level: owner === 'player' ? Math.max(0, (f.level ?? 1) - 1) : 0,
          dex: owner === 'player' && f.name === 'Dex Moody',
          seed: i + 1,
        }, kit().fig, { detail: lowDetail ? crowdDetail() : 1 });
        const obj = fig.root;
        obj.userData.boss = boss;
        const spread = (i - (n - 1) / 2) * Math.min(1.1, 9 / Math.max(1, n));
        const spot = at.get(f.id) ?? (isAtt ? local(spread, 3.1) : local(spread * 0.8, 0.9));
        // raiders start out on the street, straight out from their spot
        if (isAtt) obj.position.copy(spot).add(local(0, 1).sub(local(0, 0)).multiplyScalar(7 + Math.random() * 2));
        else obj.position.copy(spot);
        const target = spot.clone();
        const home = isAtt ? local(spread * 1.5, 16) : local(spread * 0.6, -7);
        obj.rotation.y = isAtt ? Math.PI + v0.root.rotation.y : v0.root.rotation.y;
        scene.add(obj);
        batch!.track(obj); // every fighter draws through one batch: a whole brawl is one call
        // raiders time their march to reach their spot as the fight starts
        const speed = isAtt ? Math.max(1.5, obj.position.distanceTo(target) / APPROACH) : 2.8;
        units.push({ f, owner, fig, obj, target, home, speed, swing: 0, state: 'march', st: 0, spin: 0, flop: 0, frozen: 0, stars: -1, phase: owner === 'fizzco' ? 0 : Math.random() * 6, inCloud: false, zig: Math.random() * 3, foe: null });
      };
      // phones and big fights use the crowd-detail figures (about a third of the triangles)
      lowDetail = phone || crowdDetail() <= LOW_DETAIL || Math.min(r.attackers.length, perSide) + Math.min(r.defenders.length, perSide) > 10;
      batch = createFigureBatch(kit().fig, { instances: 512, vertices: 120_000, indices: 360_000 });
      scene.add(batch.mesh);
      const atts = r.attackers.slice(0, perSide), defs = r.defenders.slice(0, perSide);
      atts.forEach((f, i) => add(f, i, atts.length));
      defs.forEach((f, i) => add(f, i, defs.length));
      for (const o of new Set([r.attacker, r.defender] as Owner[])) {
        const h = new THREE.InstancedMesh(hatOf(o), kit().fig, HATS);
        h.frustumCulled = false;
        h.userData.owner = o;
        for (let i = 0; i < HATS; i++) h.setMatrixAt(i, ZERO);
        h.visible = false;
        scene.add(h);
        hats.push(h);
      }
    },
    update(dt) {
      fx.update(dt);
      if (!report || !view) return;
      // the last KO of a fight gets a brief freeze and a small camera punch (decays in real time)
      if (punch > 0 && camera) {
        if (!punchOff) punchDir.copy(view.root.position).sub(camera.position).normalize();
        punch = Math.max(0, punch - dt * 4);
        const off = Math.sin((1 - punch) * Math.PI) * 0.5;
        camera.position.addScaledVector(punchDir, off - punchOff);
        punchOff = punch > 0 ? off : 0;
      }
      if (freeze > 0) { freeze -= dt; dt = 0; }
      const now = clock?.() ?? null;
      if (clock && now === null) clock = null; // the live fight is over: its aftermath plays out at 1×
      const was = t;
      t = now ?? t + dt * rate;
      if (!koKnown && report.duration < Infinity) { koKnown = true; report.events.forEach((ev, i) => { if (ev.type === 'ko') lastKo = i; }); }
      if (!cued && t > -APPROACH * 0.45) { cued = true; cueGadgets('approach'); }
      const ev = report.events;
      while (next < ev.length && ev[next].t <= t) {
        handle(ev[next], next);
        next++;
      }
      if (!soaked && t >= 0) cueGadgets('contact');
      if (!won && t > report.duration) {
        won = true;
        const side: Fighter['side'] = report.fellBack ? (report.fellBack === 'att' ? 'def' : 'att') : report.outcome === 'repelled' ? 'def' : 'att'; // a side that Fell Back lost
        const winners = units.filter((u) => u.f.side === side && standing(u));
        for (const u of units) if (standing(u) && u.f.side !== side) { setState(u, 'home'); u.frozen = u.spin = u.flop = 0; u.obj.rotation.x = 0; u.obj.position.y = 0; dropStars(u); u.target.copy(u.home); }
        if (winners[0]) hooks.onWin?.(winners.map((u) => u.obj), side, winners[0].owner);
      }
      if (shake > 0 && standObj) { shake -= dt; standObj.rotation.z = Math.sin(t * 60) * 0.03 * (shake > 0 ? 1 : 0); }
      acc += Math.max(0, t - was);
      const f = kit().twos.f;
      if (f !== lastF) { lastF = f; step(Math.min(acc, 0.3), f); acc = 0; batch?.setVisible((scene.userData.detail ?? 0) < 2); batch?.sync(); }
      if (t > report.duration + LINGER) {
        const cb = done;
        done = null;
        if (standObj) standObj.rotation.z = 0;
        clear();
        cb?.();
      }
    },
    active: () => !!report,
    stop() { if (standObj) standObj.rotation.z = 0; clear(); done = null; },
  };
}

export interface BattleView {
  /** live: a fight playing now, read from its own clock (fight-seconds; null once it's over). */
  play(report: BattleReport, view: PlotView, onDone: () => void, live?: () => number | null): void;
  update(dt: number): void;
  active(): boolean;
  stop(): void;
}
