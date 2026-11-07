// Watchable auto-battle (canon section 12; spec "Brawls"): replays a
// BattleReport's timeline at the plot in clay. The sim already decided
// everything; this only moves people. Raiders march in from the street in
// their crew's gait and chop the fence (Walnut chips fly: hatchets only ever
// bite wood). Wherever two sides meet, the fighters vanish into a rolling cloud
// of lumpy cream and sand clay puffs that grows as fighters join. Out of it fly
// clay arms, stars, lemons, hats and sound words on cut-paper starbursts in the
// colour of the side that landed them. A patterned tug-of-war bar counts who's
// left. KO'd fighters squash flat as a pancake, puff back up with spiral eyes
// and three orbiting stars, then wobble home in a zigzag while the winners dust
// off. Nobody stays down.
import * as THREE from 'three';
import { FACTIONS, PLAYER_COLOR, type BattleReport, type Fighter, type RivalId } from '../sim/economy.ts';
import type { PlotView } from './bay.ts';
import { Baker, sph, cap, cyl, cone, lumpy, canvasTex } from './clay/core.ts';
import { P } from './clay/palette.ts';
import { kit } from './clay/kit.ts';
import { Figure, GAIT_OF, gait } from './clay/figure.ts';
import { makeCrew } from './clay/cast.ts';
import { createFigureBatch, type FigureBatch } from './clay/figureBatch.ts';
import { createFx, starGeometry, reducedMotion, onPhone } from './clay/fx.ts';
import { goose } from './clay/creatures.ts';

type Pop = (pos: THREE.Vector3, text: string, kind: 'sale' | 'miss') => void;
type Owner = 'player' | RivalId;

/** What other code can hang off a fight (the world-life thread adds barks here). */
export interface BattleHooks {
  /** A fighter was knocked out: they squash flat now and wobble home after. */
  onKO?(who: THREE.Object3D, side: Fighter['side'], owner: Owner, last: boolean): void;
  /** A KO'd or fleeing fighter reached home and is about to vanish. */
  onHome?(who: THREE.Object3D, side: Fighter['side'], owner: Owner): void;
  /** The fight is over: the winners are dusting off. */
  onWin?(winners: THREE.Object3D[], side: Fighter['side'], owner: Owner): void;
}

type State = 'march' | 'stand' | 'pancake' | 'dazed' | 'home' | 'fled' | 'gone';
interface Unit {
  f: Fighter;
  owner: Owner;
  fig: Figure;
  obj: THREE.Group;
  target: THREE.Vector3;
  home: THREE.Vector3;
  swing: number; // seconds left in the current swing
  state: State;
  st: number; // seconds in the current state
  spin: number; // seconds left spinning (goose, peels)
  stars: number; // first orbiting-star slot, or -1
  phase: number;
  inCloud: boolean;
  zig: number;
}

const APPROACH = 3.5; // seconds of marching before the timeline starts
const PLAY_SPEED = 1.5;
const LINGER = 2.5;
const MEET = 1.5; // a foe this close pulls you into the cloud
const PANCAKE = 0.45, PUFF = 0.3, DAZED = 1.3;
const WORD: Record<Fighter['weapon'], string> = { fists: 'BONK!', clubs: 'THWACK!', hatchets: 'CHOP!' };

/** Whole-face swaps (spiral-eyed KO) arrive with the people thread's Figure.face(). */
const faceOf = (fig: Figure) => (fig as Figure & { face?: (name: string) => void }).face?.bind(fig);
const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
const mainOf = (o: Owner) => hex(o === 'player' ? PLAYER_COLOR : FACTIONS[o].color);
const accentOf = (o: Owner) => (o === 'player' ? '#FFFFFF' : hex(FACTIONS[o].accent));

// ---------- the tug-of-war bar ----------
function pattern(c: CanvasRenderingContext2D, o: Owner, x: number, w: number, h: number) {
  const main = mainOf(o), acc = accentOf(o);
  c.save();
  c.beginPath(); c.rect(x, 0, w, h); c.clip();
  c.fillStyle = o === 'blenders' ? P.mango : main; c.fillRect(x, 0, w, h);
  c.fillStyle = acc; c.strokeStyle = acc; c.lineWidth = 6;
  switch (o) {
    case 'player': for (let i = x; i < x + w; i += 28) c.fillRect(i, 0, 14, h); break; // wide vertical stripes
    case 'sourwood': for (let i = x; i < x + w + 20; i += 22) for (let j = 6; j < h; j += 22) { c.beginPath(); c.moveTo(i, j - 7); c.lineTo(i + 7, j); c.lineTo(i, j + 7); c.lineTo(i - 7, j); c.fill(); } break; // diamonds
    case 'hollis': c.globalAlpha = 0.55; for (let i = x; i < x + w; i += 20) c.fillRect(i, 0, 10, h); for (let j = 0; j < h; j += 20) c.fillRect(x, j, w, 10); break; // gingham
    case 'fizzco': for (let i = x + 8; i < x + w; i += 20) for (let j = 8; j < h; j += 18) { c.beginPath(); c.arc(i + (j % 36 ? 10 : 0), j, 5, 0, 6.3); c.fill(); } break; // bubble dots
    case 'coldbrew': c.strokeStyle = '#FF4FA3'; c.beginPath(); for (let i = x - 10, k = 0; i < x + w + 20; i += 14, k++) c.lineTo(i, k % 2 ? 8 : h - 8); c.stroke(); break; // pink zigzag
    case 'blenders': c.strokeStyle = P.lagoon; for (let j = 10; j < h; j += 18) { c.beginPath(); for (let i = x; i <= x + w; i += 4) c.lineTo(i, j + Math.sin(i / 8) * 4); c.stroke(); } break; // waves
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
    c.lineWidth = 5; c.strokeStyle = '#2E2A4F';
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

export function createBattle(scene: THREE.Scene, pop: Pop, camera?: THREE.Camera, hooks: BattleHooks = {}): BattleView {
  const fx = createFx(scene);
  const calm = reducedMotion();
  const perSide = onPhone() ? 12 : 24; // fighters drawn a side; extras join the dust cloud
  let units: Unit[] = [];
  let batch: FigureBatch | null = null;
  let lowDetail = false;
  let report: BattleReport | null = null;
  let view: PlotView | null = null;
  let t = 0, acc = 0, lastF = -1;
  let next = 0;
  let done: (() => void) | null = null;
  let fence: THREE.Object3D | undefined;
  let standObj: THREE.Object3D | undefined;
  let shake = 0, freeze = 0, punch = 0;
  let swingsShown = 0;
  let extraAtt = 0, extraDef = 0, lastKo = -1, won = false;
  let honker: THREE.Group | null = null, honk = 0;
  const local = (x: number, z: number) => view!.root.localToWorld(new THREE.Vector3(x, 0, z));

  // ---- the cloud: lumpy cream and sand puffs, plus clay arms and hats flying out ----
  const PUFFS = 64, LIMBS = 24, HATS = 6, ORBIT = 3 * 24;
  const puffG = (() => { const B = new Baker(); B.add(lumpy(sph(0.45, 12, 9), 0.06, 3, 2), '#FFFFFF'); return B.build(); })();
  const cloud = new THREE.InstancedMesh(puffG, kit().fig, PUFFS);
  const ccol = ['#FFF1D6', '#F3DDA6', '#FFFDF6', '#FFF1D6'];
  for (let i = 0; i < PUFFS; i++) cloud.setColorAt(i, new THREE.Color(ccol[i % 4]));
  cloud.castShadow = true;
  cloud.frustumCulled = false;
  const limbG = (() => { const B = new Baker(); B.add(cap(0.08, 0.35, 3, 8), '#FFFFFF'); B.add(sph(0.1, 8, 6), '#FFFFFF', { p: [0, -0.28, 0] }); return B.build(); })();
  const limbs = new THREE.InstancedMesh(limbG, kit().fig, LIMBS);
  limbs.frustumCulled = false;
  const hatG = (() => { const B = new Baker(); B.add(cyl(0.34, 0.36, 0.03, 18), '#FFFFFF'); B.add(cyl(0.16, 0.19, 0.18, 14), '#FFFFFF', { p: [0, 0.1, 0] }); return B.build(); })();
  const hats = new THREE.InstancedMesh(hatG, kit().fig, HATS);
  hats.frustumCulled = false;
  const lemonG = (() => { const B = new Baker(); B.add(lumpy(sph(0.13, 10, 8), 0.01, 8, 2), P.lemon, { s: [1, 0.85, 1.3] }); B.add(cone(0.04, 0.07, 6), P.lemon, { p: [0, 0, 0.17], r: [Math.PI / 2, 0, 0] }); return B.build(); })();
  const lemons = new THREE.InstancedMesh(lemonG, kit().fig, 4);
  lemons.frustumCulled = false;
  const orbit = new THREE.InstancedMesh(starGeometry(), kit().fig, ORBIT);
  orbit.frustumCulled = false;
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  for (const [im, n] of [[cloud, PUFFS], [limbs, LIMBS], [hats, HATS], [lemons, 4], [orbit, ORBIT]] as const) { for (let i = 0; i < n; i++) im.setMatrixAt(i, ZERO); im.visible = false; scene.add(im); }
  const bar = tugBar();
  bar.sprite.visible = false;
  scene.add(bar.sprite);
  const starFree: boolean[] = Array(ORBIT / 3).fill(true);

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s3 = new THREE.Vector3();

  function clear() {
    for (const u of units) scene.remove(u.obj);
    if (batch) { scene.remove(batch.mesh); batch.mesh.dispose(); batch = null; }
    units = [];
    report = null;
    won = false;
    if (fence) fence.visible = true;
    view?.root.children.forEach((c) => { if (c.name === 'sentry') c.visible = true; });
    for (const im of [cloud, limbs, hats, lemons, orbit]) im.visible = false;
    bar.sprite.visible = false;
    starFree.fill(true);
    if (honker) { scene.remove(honker); honker = null; }
    fx.clear();
  }

  const byId = (id: string) => units.find((u) => u.f.id === id);
  const head = (u: Unit) => u.obj.position.clone().setY(u.fig.height + 0.4);
  const standing = (u: Unit) => u.state === 'march' || u.state === 'stand';
  const setState = (u: Unit, s: State) => { u.state = s; u.st = 0; };

  function knockOut(u: Unit, last: boolean) {
    if (!standing(u)) return;
    setState(u, 'pancake');
    u.inCloud = false;
    u.obj.visible = true;
    fx.dust(u.obj.position, 4, 0.4);
    fx.stars(head(u), 2);
    const slot = starFree.indexOf(true);
    if (slot >= 0) { starFree[slot] = false; u.stars = slot; }
    if (last) { freeze = 0.3; punch = calm ? 0 : 1; }
    hooks.onKO?.(u.obj, u.f.side, u.owner, last);
  }

  function handle(e: BattleReport['events'][number], idx: number) {
    switch (e.type) {
      case 'swing': {
        const a = byId(e.a), b = byId(e.b);
        if (!a || !b) return;
        const dir = a.obj.position.clone().sub(b.obj.position).setY(0);
        if (dir.lengthSq() < 0.01) dir.set(Math.random() - 0.5, 0, Math.random() - 0.5);
        a.target.copy(b.obj.position).add(dir.normalize().multiplyScalar(0.75));
        a.swing = 0.35;
        if (swingsShown++ % 2 === 0) {
          const mid = a.obj.position.clone().lerp(b.obj.position, 0.5).setY(2.3 + Math.random() * 0.6);
          mid.x += (Math.random() - 0.5) * 1.6; mid.z += (Math.random() - 0.5) * 0.8;
          fx.word(mid, WORD[a.f.weapon], mainOf(a.owner), accentOf(a.owner));
          if (Math.random() < 0.4) fx.stars(mid.setY(1.4), 2);
        }
        break;
      }
      case 'chop': {
        const a = byId(e.a);
        if (!a) return;
        a.swing = 0.35;
        shake = calm ? 0 : 0.25;
        if (e.target === 'stand') a.target.copy(local((Math.random() - 0.5) * 2.4, 1.6));
        const hitAt = e.target === 'fence' ? a.obj.position.clone().setY(0.8) : local((Math.random() - 0.5) * 1.6, 0.6).setY(1.2);
        // hatchets and clubs only ever bite wood: a burst of Walnut chips
        fx.chips(hitAt, a.f.weapon === 'hatchets' ? 8 : 4);
        if (swingsShown++ % 3 === 0) fx.word(hitAt.clone().setY(2.2), a.f.weapon === 'fists' ? 'BONK!' : WORD[a.f.weapon], mainOf(a.owner), accentOf(a.owner));
        break;
      }
      case 'breach':
        if (fence) {
          fence.visible = false;
          const at = local(0, 2.6).setY(0.3);
          fx.dust(at, 10, 2.5);
          fx.chips(at.setY(0.6), 12);
        }
        pop(local(0, 2.2).setY(2), 'The fence is down!', 'miss');
        for (const u of units) if (u.f.side === 'att' && standing(u)) u.target.copy(local((Math.random() - 0.5) * 4, 1.2 + Math.random()));
        break;
      case 'ko': {
        const u = byId(e.a);
        if (u) knockOut(u, idx === lastKo);
        else if (idx === lastKo) { freeze = 0.3; punch = calm ? 0 : 1; }
        if (!u) { if (report && report.attackers.some((f) => f.id === e.a)) extraAtt = Math.max(0, extraAtt - 1); else extraDef = Math.max(0, extraDef - 1); }
        break;
      }
      case 'flee': {
        const u = byId(e.a);
        if (!u || !standing(u)) return;
        setState(u, 'fled');
        u.inCloud = false;
        u.obj.visible = true;
        u.target.copy(u.home);
        break;
      }
      case 'stun': {
        const u = byId(e.a);
        if (!u) return;
        u.spin = 1.2;
        if (e.by === 'goose') {
          // Honkers waddles out, stretches up and HONKs; the first attacker freezes under stars
          if (!honker) { honker = goose(); honker.scale.setScalar(1.3); scene.add(honker); }
          honker.position.copy(local(-3.3, 1.35)); // by the gate, where the gadgets put him
          honker.lookAt(u.obj.position.x, 0, u.obj.position.z);
          honk = 1.2;
          fx.word(head(u).setY(2.4), 'HONK!', '#FFFFFF', P.lemon);
          fx.stars(head(u), 3);
        } else {
          fx.word(head(u), 'SQUISH!', P.lemon, '#7CC47F');
        }
        break;
      }
      case 'grab':
        pop(local(0, 0.6).setY(2.4), 'They grab the till!', 'miss');
        break;
    }
  }

  /** One pose on twos: walk, swing, squash, puff, dazed wobble and the cloud. */
  function step(dt: number, f: number) {
    const tq = f / 12;
    // who's in a cloud? Standing fighters with a standing foe close by.
    const live = won ? [] : units.filter(standing);
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
        limbs.setColorAt(li, new THREE.Color(i % 3 === 2 ? P.skin : o === 'blenders' ? P.mango : mainOf(o)));
      }
    }
    for (let i = pi; i < PUFFS; i++) cloud.setMatrixAt(i, ZERO);
    for (let i = li; i < LIMBS; i++) limbs.setMatrixAt(i, ZERO);
    cloud.instanceMatrix.needsUpdate = limbs.instanceMatrix.needsUpdate = true;
    if (limbs.instanceColor) limbs.instanceColor.needsUpdate = true;
    cloud.visible = limbs.visible = pi > 0;
    // a hat or a lemon arcs out of the biggest cloud now and then
    const big = clusters[0];
    hats.visible = lemons.visible = !!big;
    if (big) {
      for (let i = 0; i < HATS; i++) {
        const ph = ((tq * 0.6 + i / HATS) % 1);
        const a = i * 2.1 + Math.floor(tq * 0.6 + i / HATS) * 1.3;
        const d = ph * 2.6;
        v.set(big.c.x + Math.cos(a) * d, 1.4 + Math.sin(ph * Math.PI) * 2.2, big.c.z + Math.sin(a) * d * 0.8);
        e.set(f * 0.8, f * 0.5, 0.4);
        q.setFromEuler(e);
        hats.setMatrixAt(i, i < 2 + Math.min(4, big.n / 3) ? m4.compose(v, q, s3.setScalar(1)) : ZERO);
        hats.setColorAt(i, new THREE.Color(mainOf(big.owners[i % big.owners.length])));
      }
      for (let i = 0; i < 4; i++) {
        const ph = ((tq * 0.45 + i / 4 + 0.13) % 1);
        const a = i * 1.7 + 0.6 + Math.floor(tq * 0.45 + i / 4 + 0.13) * 2.1;
        v.set(big.c.x + Math.cos(a) * ph * 2.2, 1.2 + Math.sin(ph * Math.PI) * 1.8, big.c.z + Math.sin(a) * ph * 1.8);
        e.set(f * 0.6, f * 0.9, 0);
        q.setFromEuler(e);
        lemons.setMatrixAt(i, i < 1 + Math.min(3, big.n / 4) ? m4.compose(v, q, s3.setScalar(1)) : ZERO);
      }
      hats.instanceMatrix.needsUpdate = lemons.instanceMatrix.needsUpdate = true;
      if (hats.instanceColor) hats.instanceColor.needsUpdate = true;
      if (Math.random() < 0.15) fx.dust(big.c.clone().setY(0.2), 2, 1.2);
    }

    let orbiting = false;
    for (const u of units) {
      const o = u.obj, fig = u.fig;
      u.st += dt;
      if (u.state === 'gone') continue;
      // brawlers vanish into the cloud; hits on people stay inside it
      o.visible = !u.inCloud;
      if (u.state === 'pancake') {
        // squash flat as a pancake
        const k = Math.min(1, u.st / 0.12);
        fig.pose({ sq: 0.85 * k, lift: 0, aL: [0, 1.4], aR: [0, -1.4], lL: 0, lR: 0 }, f);
        if (u.st > PANCAKE) { setState(u, 'dazed'); faceOf(fig)?.('ko'); }
        continue;
      }
      if (u.state === 'dazed') {
        // puff back up (overshoot), then sway on the spot under stars
        const k = Math.min(1, u.st / PUFF);
        const sq = u.st < PUFF ? 0.85 * (1 - k) - Math.sin(k * Math.PI) * 0.25 : 0;
        fig.pose({ sq, sway: Math.sin(u.st * 9) * 0.22, headRoll: Math.sin(u.st * 7) * 0.3, aL: [-0.4, 0.8], aR: [-0.4, -0.8] }, f);
        if (u.st > PUFF + DAZED) { setState(u, 'home'); u.target.copy(u.home); }
      }
      if (u.stars >= 0) {
        orbiting = true;
        const hp = o.position, hy = fig.height + 0.2;
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI * 2 + f * 0.6;
          v.set(hp.x + Math.cos(a) * 0.45, hy + Math.sin(a * 2) * 0.05, hp.z + Math.sin(a) * 0.45);
          e.set(0, a, f * 0.4);
          q.setFromEuler(e);
          orbit.setMatrixAt(u.stars * 3 + i, m4.compose(v, q, s3.setScalar(0.8)));
        }
      }
      if (u.state === 'dazed') continue;
      if (u.spin > 0) {
        u.spin -= dt;
        o.rotation.y += dt * 12; // spun like a top
        fig.pose({ sq: 0.05, aL: [0, 1.2], aR: [0, -1.2], headRoll: 0.3 }, f);
        continue;
      }
      // walk toward the target in the crew's own gait
      const d = u.target.clone().sub(o.position).setY(0);
      const dist = d.length();
      const homeward = u.state === 'home' || u.state === 'fled';
      const speed = u.state === 'fled' ? 5 : u.state === 'home' ? 2.2 : 2.8;
      if (dist > 0.05) {
        const stepLen = Math.min(dist, speed * dt);
        d.normalize();
        o.position.addScaledVector(d, stepLen);
        if (u.state === 'home') {
          // a zigzag wobble home
          u.zig += dt;
          const side = new THREE.Vector3(d.z, 0, -d.x);
          o.position.addScaledVector(side, Math.cos(u.zig * 6) * dt * 1.6);
        }
        o.rotation.y = Math.atan2(d.x, d.z) + (u.state === 'home' ? Math.sin(u.zig * 6) * 0.4 : 0);
        u.phase += dt * (u.state === 'fled' ? 14 : 9);
        if (u.state === 'home') fig.pose({ lift: Math.abs(Math.sin(u.phase)) * 0.04, sway: Math.sin(u.phase) * 0.25, lL: Math.sin(u.phase) * 0.5, lR: -Math.sin(u.phase) * 0.5, aL: [-0.4, 0.8], aR: [-0.4, -0.8], headRoll: Math.sin(u.phase * 0.8) * 0.3 }, f);
        else gait(fig, GAIT_OF[fig.sp?.kind ?? 'pear'] ?? 'bob', u.phase, f, tq);
      } else if (homeward) {
        {
          hooks.onHome?.(o, u.f.side, u.owner);
          if (u.stars >= 0) { for (let i = 0; i < 3; i++) orbit.setMatrixAt(u.stars * 3 + i, ZERO); starFree[u.stars] = true; u.stars = -1; }
          faceOf(fig)?.('neutral');
          setState(u, 'gone');
          o.visible = false;
        }
        continue;
      } else if (won) {
        // the winners dust off: pat pat, a little puff
        const pat = Math.sin(u.st * 10);
        fig.pose({ aL: [-0.9, -0.4 + pat * 0.2], aR: [-0.9, 0.4 - pat * 0.2], lift: Math.abs(pat) * 0.02, headTilt: -0.15 }, f);
        if (Math.random() < 0.04) fx.dust(o.position.clone().setY(0.6), 1, 0.3);
      } else if (u.swing > 0) {
        u.swing -= dt;
        const k = Math.sin(Math.PI * (1 - u.swing / 0.35));
        fig.pose({ sq: k * 0.06, lean: k * 0.15, aR: [-2.2 * k, -0.2], aL: [-0.6, 0.3] }, f);
      } else {
        fig.pose({ sq: Math.sin(tq * 6 + u.phase) > 0.6 ? 0.04 : 0, lean: 0.08, aL: [-1.2, 0.35], aR: [-1.2, -0.35] }, f);
      }
      if (u.state === 'march' && dist < 0.1) u.state = 'stand';
    }
    orbit.visible = orbiting;
    if (orbiting) orbit.instanceMatrix.needsUpdate = true;

    // the tug-of-war bar over the plot
    if (report && view) {
      const att = units.filter((u) => u.f.side === 'att' && standing(u)).length + extraAtt;
      const def = units.filter((u) => u.f.side === 'def' && standing(u)).length + extraDef;
      bar.sprite.visible = t > -APPROACH * 0.5;
      bar.sprite.position.copy(local(0, 3).setY(4.6));
      bar.set(report.attacker as Owner, report.defender as Owner, att + def ? att / (att + def) : 0.5);
    }

    // Honkers stretches his neck for the HONK, then waddles back
    if (honker) {
      honk -= dt;
      const { neck } = honker.userData as { neck: THREE.Object3D };
      const k = Math.max(0, Math.sin(Math.min(1, (1.2 - honk) / 0.5) * Math.PI));
      neck.scale.set(1, 1 + k * 0.5, 1);
      neck.rotation.x = -k * 0.5;
      honker.position.y = Math.abs(Math.sin(tq * 10)) * 0.04;
      if (honk < -1.5) { scene.remove(honker); honker = null; }
    }
  }

  return {
    play(r, v0, onDone) {
      clear();
      report = r;
      view = v0;
      t = -APPROACH;
      acc = 0;
      next = 0;
      done = onDone;
      swingsShown = 0;
      freeze = punch = 0;
      lastKo = -1;
      r.events.forEach((ev, i) => { if (ev.type === 'ko') lastKo = i; });
      fence = v0.root.getObjectByName('fence');
      standObj = v0.root.children[0];
      v0.root.children.forEach((c) => { if (c.name === 'sentry') c.visible = false; });
      const fenced = r.perimeter > 0;
      extraAtt = Math.max(0, r.attackers.length - perSide);
      extraDef = Math.max(0, r.defenders.length - perSide);
      const add = (f: Fighter, i: number, n: number) => {
        const isAtt = f.side === 'att';
        const owner = (isAtt ? r.attacker : r.defender) as Owner;
        // the crew's own look and tier weapon; Pro Gear (the only armour) shows as helmet and pads
        const fig = makeCrew(owner, { weapon: f.weapon, gear: f.armor > 0 ? 'pro' : 'none', seed: i + 1 }, kit().fig, { detail: lowDetail ? 0.5 : 1 });
        const obj = fig.root;
        const spread = (i - (n - 1) / 2) * Math.min(1.1, 9 / Math.max(1, n));
        obj.position.copy(isAtt ? local(spread, 10 + Math.random() * 2) : local(spread * 0.8, 0.9 + (i % 2) * 0.6));
        const target = isAtt ? local(spread, fenced ? 3.1 : 1.8) : obj.position.clone();
        const home = isAtt ? local(spread * 1.5, 16) : local(spread * 0.6, -7);
        obj.rotation.y = isAtt ? Math.PI + v0.root.rotation.y : v0.root.rotation.y;
        scene.add(obj);
        batch!.track(obj); // every fighter draws through one batch: a whole brawl is one call
        units.push({ f, owner, fig, obj, target, home, swing: 0, state: 'march', st: 0, spin: 0, stars: -1, phase: Math.random() * 6, inCloud: false, zig: Math.random() * 3 });
      };
      // phones and big fights use the crowd-detail figures (about a third of the triangles)
      lowDetail = onPhone() || Math.min(r.attackers.length, perSide) + Math.min(r.defenders.length, perSide) > 10;
      batch = createFigureBatch(kit().fig, { instances: 512, vertices: 120_000, indices: 360_000 });
      scene.add(batch.mesh);
      const atts = r.attackers.slice(0, perSide), defs = r.defenders.slice(0, perSide);
      atts.forEach((f, i) => add(f, i, atts.length));
      defs.forEach((f, i) => add(f, i, defs.length));
    },
    update(dt) {
      fx.update(dt);
      if (!report || !view) return;
      // the last KO of a fight gets a brief freeze and a small camera punch
      if (freeze > 0) { freeze -= dt; dt = 0; }
      if (punch > 0 && camera) {
        // a quick nudge toward the fight and back
        const towards = view.root.position.clone().sub(camera.position).normalize();
        const before = Math.sin((1 - punch) * Math.PI) * 0.5;
        punch = Math.max(0, punch - (1 / 60) * 4);
        const after = Math.sin((1 - punch) * Math.PI) * 0.5;
        camera.position.addScaledVector(towards, after - before);
      }
      t += dt * PLAY_SPEED;
      const ev = report.events;
      while (next < ev.length && ev[next].t <= t) { handle(ev[next], next); next++; }
      if (!won && t > report.duration) {
        won = true;
        const side: Fighter['side'] = report.outcome === 'repelled' ? 'def' : 'att';
        const winners = units.filter((u) => u.f.side === side && standing(u));
        for (const u of units) if (standing(u) && u.f.side !== side) { setState(u, 'home'); u.target.copy(u.home); }
        if (winners[0]) hooks.onWin?.(winners.map((u) => u.obj), side, winners[0].owner);
      }
      if (shake > 0 && standObj) { shake -= dt; standObj.rotation.z = Math.sin(t * 60) * 0.03 * (shake > 0 ? 1 : 0); }
      acc += dt * PLAY_SPEED;
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
  play(report: BattleReport, view: PlotView, onDone: () => void): void;
  update(dt: number): void;
  active(): boolean;
  stop(): void;
}
