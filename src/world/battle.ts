// Watchable auto-battle (canon section 12; spec: Brawls): replays a
// BattleReport's timeline at the plot. The sim already decided everything;
// this only moves people. Raiders creep in from the street with flashlights,
// chop the fence in bursts of wood chips, and the fight itself happens inside
// a rolling cloud of cream puffs that sound words, stars and hats fly out of.
// KO'd fighters pop out with spiral eyes and circling stars and wobble home.
import * as THREE from 'three/webgpu';
import { texture, uv } from 'three/tsl';
import type { BattleReport, Fighter } from '../sim/economy.ts';
import type { FactionId } from '../sim/map.ts';
import type { PlotView } from './bay.ts';
import { animateIdle, animateWalk, makeCrew, setKO, weaponFor } from './people.ts';
import { css, drawPattern, mood, OWNER_STYLE, paint, PAL } from './paint.ts';

type Pop = (pos: THREE.Vector3, text: string, kind: 'sale' | 'miss') => void;

interface Unit {
  f: Fighter;
  owner: FactionId;
  obj: THREE.Group;
  target: THREE.Vector3;
  home: THREE.Vector3;
  swing: number; // seconds left in the current swing
  ko: number; // seconds since the KO, -1 while standing
  fled: boolean;
  spin: number;
  busy: number; // seconds left "in the cloud"
  stars?: THREE.Group;
  phase: number;
}

const APPROACH = 3.5; // seconds of marching before the timeline starts
const PLAY_SPEED = 1.5;
const LINGER = 2.5;

// ---------------------------------------------------------------- props

const starGeo = (() => {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.07 : 0.16, a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r); else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  return new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: false }).center();
})();
const starMat = paint(0xffd23f, { rough: 0.4, glow: 'always', glowStrength: 0.35 });

function koStars(): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Mesh(starGeo, starMat);
    const a = (i / 3) * Math.PI * 2;
    s.position.set(Math.cos(a) * 0.38, 0, Math.sin(a) * 0.38);
    s.scale.setScalar(0.8);
    g.add(s);
  }
  g.position.y = 1.65;
  return g;
}

const beamMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, color: 0xfff1c9 });
beamMat.opacityNode = uv().y.oneMinus().mul(0.22);
const beamGeo = new THREE.ConeGeometry(0.75, 3.2, 18, 1, true).translate(0, -1.6, 0);
const torchGeo = new THREE.CylinderGeometry(0.04, 0.05, 0.22, 8).rotateX(Math.PI / 2);
function flashlight(): THREE.Object3D {
  const cone = new THREE.Mesh(beamGeo, beamMat);
  cone.rotation.x = -Math.PI / 2 - 0.45; // forward and a little down
  const torch = new THREE.Mesh(torchGeo, paint(0x333344, { rough: 0.4 }));
  const g = new THREE.Group();
  g.add(torch, cone);
  g.name = 'flashlight';
  return g;
}

/** Sound words in the color of the side that landed them. */
const wordCache = new Map<string, THREE.CanvasTexture>();
function wordTexture(word: string, fill: number) {
  const key = `${word}|${fill}`;
  let t = wordCache.get(key);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d')!;
  g.translate(128, 66); g.rotate(-0.12);
  // A jagged burst behind the word.
  g.beginPath();
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2, r = i % 2 ? 44 : 60;
    g.lineTo(Math.cos(a) * r * 1.9, Math.sin(a) * r * 0.95);
  }
  g.closePath();
  g.fillStyle = css(PAL.pith); g.fill();
  g.lineWidth = 4; g.strokeStyle = css(PAL.indigo); g.stroke();
  g.font = '900 54px "Impact", "Arial Black", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = 10; g.strokeStyle = css(PAL.indigo); g.strokeText(word, 0, 2);
  g.fillStyle = css(fill); g.fillText(word, 0, 2);
  g.lineWidth = 1.5; g.strokeStyle = 'rgba(255,255,255,0.7)'; g.strokeText(word, 0, 2);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  wordCache.set(key, t);
  return t;
}
const sideColor = (owner: FactionId) => (owner === 'coldbrew' ? 0xff4fa3 : OWNER_STYLE[owner].main);

export interface BattleView {
  play(report: BattleReport, view: PlotView, onDone: () => void): void;
  update(dt: number): void;
  active(): boolean;
  stop(): void;
}

export function createBattle(scene: THREE.Scene, pop: Pop): BattleView {
  let units: Unit[] = [];
  let report: BattleReport | null = null;
  let view: PlotView | null = null;
  let t = 0;
  let next = 0;
  let done: (() => void) | null = null;
  let fence: THREE.Object3D | undefined;
  let standObj: THREE.Object3D | undefined;
  let shake = 0;
  const local = (x: number, z: number) => view!.root.localToWorld(new THREE.Vector3(x, 0.12, z));

  // ---- the dust cloud: one instanced mesh of cream puffs
  const PUFFS = 30;
  const puffMat = paint(PAL.pith, { rough: 1, glow: 'always', glowColor: PAL.pith, glowStrength: 0.18 });
  const puffs = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 2), puffMat, PUFFS);
  puffs.castShadow = true;
  puffs.frustumCulled = false;
  puffs.visible = false;
  scene.add(puffs);
  const seeds = Array.from({ length: PUFFS }, (_, i) => ({ a: (i / PUFFS) * Math.PI * 2 * 3.1, h: (i * 0.37) % 1, s: 0.55 + ((i * 0.61) % 1) * 0.45, sp: 0.8 + ((i * 0.29) % 1) }));
  const cloud = { pos: new THREE.Vector3(), size: 0, want: 0 };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v3 = new THREE.Vector3(), sc = new THREE.Vector3();

  // ---- sound words, flying bits and wood chips
  interface Fly { obj: THREE.Object3D; vel: THREE.Vector3; spin: THREE.Vector3; life: number; max: number; word?: boolean }
  let flies: Fly[] = [];
  const spriteMat = (map: THREE.Texture) => {
    const mm = new THREE.SpriteNodeMaterial({ transparent: true, depthTest: false });
    mm.colorNode = texture(map, uv());
    return mm;
  };
  function word(text: string, owner: FactionId, at: THREE.Vector3) {
    const sp = new THREE.Sprite(spriteMat(wordTexture(text, sideColor(owner))));
    sp.position.copy(at).add(new THREE.Vector3((Math.random() - 0.5) * 1.2, 0.3, (Math.random() - 0.5) * 1.2));
    sp.renderOrder = 10;
    scene.add(sp);
    flies.push({ obj: sp, vel: new THREE.Vector3(0, 0.9, 0), spin: new THREE.Vector3(), life: 0, max: 0.95, word: true });
  }
  const chipMat = paint(PAL.driftwood);
  const chipGeo = new THREE.BoxGeometry(0.12, 0.04, 0.07);
  const lemonGeo = new THREE.SphereGeometry(0.1, 10, 8).scale(1.3, 1, 1);
  const lemonMat = paint(PAL.lemon, { rough: 0.5 });
  const hatGeo = new THREE.CylinderGeometry(0.16, 0.2, 0.12, 12);
  function burst(at: THREE.Vector3, kind: 'chips' | 'bits', owner?: FactionId) {
    const n = kind === 'chips' ? 6 : 1;
    for (let i = 0; i < n; i++) {
      let mesh: THREE.Mesh;
      if (kind === 'chips') mesh = new THREE.Mesh(chipGeo, chipMat);
      else {
        const r = Math.random();
        mesh = r < 0.45 ? new THREE.Mesh(starGeo, starMat) : r < 0.75 ? new THREE.Mesh(lemonGeo, lemonMat) : new THREE.Mesh(hatGeo, paint(owner ? OWNER_STYLE[owner].main : PAL.pith));
      }
      mesh.position.copy(at);
      scene.add(mesh);
      const a = Math.random() * Math.PI * 2, s = kind === 'chips' ? 2.5 : 3.5;
      flies.push({ obj: mesh, vel: new THREE.Vector3(Math.cos(a) * s, 3 + Math.random() * 2.5, Math.sin(a) * s), spin: new THREE.Vector3(Math.random() * 12, Math.random() * 12, 0), life: 0, max: 1.1 });
    }
  }

  // ---- tug-of-war bar: who has more fighters left, in each side's pattern
  const barCanvas = document.createElement('canvas');
  barCanvas.width = 256; barCanvas.height = 40;
  const barTex = new THREE.CanvasTexture(barCanvas);
  barTex.colorSpace = THREE.SRGBColorSpace;
  const bar = new THREE.Sprite(spriteMat(barTex));
  bar.scale.set(3.2, 0.5, 1);
  bar.renderOrder = 11;
  bar.visible = false;
  scene.add(bar);
  let barKey = '';
  function drawBar(att: number, def: number) {
    const key = `${att}|${def}`;
    if (key === barKey || !report) return;
    barKey = key;
    const g = barCanvas.getContext('2d')!;
    g.clearRect(0, 0, 256, 40);
    const split = 8 + Math.round((240 * att) / Math.max(1, att + def));
    g.save(); g.beginPath(); g.rect(8, 8, split - 8, 24); g.clip(); drawPattern(g, report.attacker, 256, 40, 16); g.restore();
    g.save(); g.beginPath(); g.rect(split, 8, 248 - split, 24); g.clip(); g.translate(split, 0); drawPattern(g, report.defender, 256, 40, 16); g.restore();
    g.lineWidth = 5; g.strokeStyle = css(PAL.indigo); g.strokeRect(6, 6, 244, 28);
    g.fillStyle = css(PAL.indigo); g.fillRect(split - 3, 2, 6, 36);
    barTex.needsUpdate = true;
  }

  function clear() {
    for (const u of units) scene.remove(u.obj);
    for (const f of flies) { scene.remove(f.obj); if (f.word) ((f.obj as THREE.Sprite).material as THREE.Material).dispose(); }
    units = [];
    flies = [];
    report = null;
    puffs.visible = false;
    bar.visible = false;
    cloud.size = 0;
    mood.noir = false;
    if (fence) fence.visible = true;
    view?.root.children.forEach((c) => { if (c.name === 'sentry') c.visible = true; });
  }

  const byId = (id: string) => units.find((u) => u.f.id === id);
  const head = (u: Unit) => u.obj.position.clone().setY(2.1);
  const standing = (u: Unit) => u.ko < 0 && !u.fled;

  function handle(e: BattleReport['events'][number]) {
    switch (e.type) {
      case 'swing': {
        const a = byId(e.a), b = byId(e.b);
        if (!a || !b) return;
        const dir = a.obj.position.clone().sub(b.obj.position).setY(0);
        if (dir.lengthSq() < 0.01) dir.set(Math.random() - 0.5, 0, Math.random() - 0.5);
        a.target.copy(b.obj.position).add(dir.normalize().multiplyScalar(0.6));
        a.swing = 0.35;
        a.busy = b.busy = 1.6;
        // Hits on people stay inside the cloud: only the word and a few bits fly out.
        if (Math.random() < 0.6) word(a.f.weapon === 'clubs' ? 'THWACK!' : 'BONK!', a.owner, b.obj.position.clone().setY(1.8));
        if (Math.random() < 0.3) burst(b.obj.position.clone().setY(1.4), 'bits', b.owner);
        break;
      }
      case 'chop': {
        const a = byId(e.a);
        if (!a) return;
        a.swing = 0.35;
        shake = 0.25;
        if (e.target === 'stand') a.target.copy(local((Math.random() - 0.5) * 2.4, 1.6));
        const at = e.target === 'fence' ? a.obj.position.clone().setY(0.9) : local(0, 0.6).setY(1.4);
        burst(at, 'chips');
        if (Math.random() < 0.5) word(a.f.weapon === 'hatchets' ? 'CHOP!' : e.target === 'fence' ? 'CRACK!' : 'SMASH!', a.owner, at.setY(2));
        break;
      }
      case 'breach':
        if (fence) fence.visible = false;
        pop(local(0, 2.2).setY(2), 'The fence is down!', 'miss');
        for (const u of units) if (u.f.side === 'att' && standing(u)) u.target.copy(local((Math.random() - 0.5) * 4, 1.2 + Math.random()));
        break;
      case 'ko': {
        const u = byId(e.a);
        if (!u) return;
        u.ko = 0;
        u.busy = 0;
        setKO(u.obj, true);
        burst(u.obj.position.clone().setY(1.6), 'bits', u.owner);
        break;
      }
      case 'flee': {
        const u = byId(e.a);
        if (!u) return;
        u.fled = true;
        u.busy = 0;
        u.target.copy(u.home);
        pop(head(u), 'Run!', 'miss');
        break;
      }
      case 'stun': {
        const u = byId(e.a);
        if (!u) return;
        u.spin = 1.2;
        word(e.by === 'goose' ? 'HONK!' : 'SQUISH!', report!.defender, head(u));
        break;
      }
      case 'grab':
        pop(local(0, 0.6).setY(2.4), '💰 They grab the till!', 'miss');
        break;
    }
  }

  function updateCloud(dt: number) {
    const inCloud = units.filter((u) => u.busy > 0 && standing(u));
    if (inCloud.length >= 2) {
      const c = new THREE.Vector3();
      for (const u of inCloud) c.add(u.obj.position);
      c.divideScalar(inCloud.length);
      if (cloud.size < 0.05) cloud.pos.copy(c);
      cloud.pos.lerp(c, Math.min(1, dt * 3));
      cloud.want = Math.min(3.2, 1.1 + inCloud.length * 0.22);
    } else cloud.want = 0;
    cloud.size += (cloud.want - cloud.size) * Math.min(1, dt * (cloud.want > cloud.size ? 4 : 2.5));
    puffs.visible = cloud.size > 0.05;
    if (!puffs.visible) return;
    for (let i = 0; i < PUFFS; i++) {
      const sd = seeds[i];
      const a = sd.a + t * sd.sp * 2.2;
      const ring = cloud.size * (0.55 + 0.4 * Math.sin(t * 3 + i));
      v3.set(cloud.pos.x + Math.cos(a) * ring, 0.35 + sd.h * cloud.size * 0.85 + Math.abs(Math.sin(t * 5 + i)) * 0.2, cloud.pos.z + Math.sin(a) * ring);
      const s = cloud.size * sd.s * (0.42 + 0.12 * Math.sin(t * 7 + i * 1.7));
      m4.compose(v3, q, sc.set(s, s * 0.9, s));
      puffs.setMatrixAt(i, m4);
    }
    puffs.instanceMatrix.needsUpdate = true;
    // Fighters inside the cloud keep jostling toward its middle.
    for (const u of inCloud) if (u.swing <= 0 && Math.random() < dt * 2) u.target.copy(cloud.pos).add(new THREE.Vector3((Math.random() - 0.5) * 1.2, 0, (Math.random() - 0.5) * 1.2));
  }

  return {
    play(r, v, onDone) {
      clear();
      report = r;
      view = v;
      t = -APPROACH;
      next = 0;
      done = onDone;
      barKey = '';
      fence = v.root.getObjectByName('fence');
      standObj = v.root.children[0];
      v.root.children.forEach((c) => { if (c.name === 'sentry') c.visible = false; });
      // Night raids play in noir light; delivery raids and HQ assaults keep the clock's light.
      const night = r.attacker !== 'player' && !r.delivery && !r.hq;
      mood.noir = night;
      const fenced = r.perimeter > 0;
      const add = (f: Fighter, i: number, n: number) => {
        const isAtt = f.side === 'att';
        const owner = isAtt ? r.attacker : r.defender;
        const obj = makeCrew(owner);
        const [left, right] = obj.userData.hands as THREE.Mesh[];
        const w = weaponFor(owner, f.weapon);
        if (w) right.add(w);
        if (isAtt && night) { const fl = flashlight(); fl.position.set(0, 0.05, 0.1); left.add(fl); }
        const spread = (i - (n - 1) / 2) * Math.min(1.1, 9 / Math.max(1, n));
        obj.position.copy(isAtt ? local(spread, 10 + Math.random() * 2) : local(spread * 0.8, 0.9 + (i % 2) * 0.6));
        const target = isAtt ? local(spread, fenced ? 3.1 : 1.8) : obj.position.clone();
        const home = isAtt ? local(spread * 1.5, 15) : local(spread * 1.2 + 3, -6);
        scene.add(obj);
        units.push({ f, owner, obj, target, home, swing: 0, ko: -1, fled: false, spin: 0, busy: 0, phase: Math.random() * 6 });
      };
      r.attackers.forEach((f, i) => add(f, i, r.attackers.length));
      r.defenders.forEach((f, i) => add(f, i, r.defenders.length));
      bar.position.copy(local(0, 0.5)).setY(4.6);
      bar.visible = r.defenders.length > 0;
    },
    update(dt) {
      if (!report || !view) return;
      t += dt * PLAY_SPEED;
      const ev = report.events;
      while (next < ev.length && ev[next].t <= t) handle(ev[next++]);
      if (shake > 0 && standObj) { shake -= dt; standObj.rotation.z = Math.sin(t * 60) * 0.03 * (shake > 0 ? 1 : 0); }
      updateCloud(dt);
      let att = 0, def = 0;
      for (const u of units) {
        if (standing(u)) { if (u.f.side === 'att') att++; else def++; }
        u.busy = Math.max(0, u.busy - dt);
        const o = u.obj;
        if (u.ko >= 0) {
          // Pop out flat, then get up seeing stars and wobble home in a zigzag.
          u.ko += dt;
          if (u.ko < 0.9) {
            o.rotation.x = -Math.PI / 2 * Math.min(1, u.ko * 4);
            o.position.y = 0.12 + 0.25 * Math.min(1, u.ko * 4);
            continue;
          }
          if (!u.stars) { u.stars = koStars(); o.add(u.stars); o.rotation.x = 0; o.position.y = 0.12; }
          u.stars.rotation.y += dt * 6;
          const d = u.home.clone().sub(o.position).setY(0);
          if (d.length() < 0.4) { o.visible = false; continue; }
          d.normalize();
          const side = new THREE.Vector3(-d.z, 0, d.x).multiplyScalar(Math.sin(u.ko * 5) * 0.9);
          o.position.addScaledVector(d.add(side), dt * 1.6);
          o.rotation.y = Math.atan2(d.x, d.z);
          o.rotation.z = Math.sin(u.ko * 7) * 0.25;
          u.phase += dt * 8;
          animateWalk(o, u.phase);
          continue;
        }
        if (u.spin > 0) { u.spin -= dt; o.rotation.y += dt * 12; continue; }
        const d = u.target.clone().sub(o.position).setY(0);
        const dist = d.length();
        const speed = u.fled ? 5 : 2.8;
        if (dist > 0.05) {
          const step = Math.min(dist, speed * dt);
          o.position.addScaledVector(d.normalize(), step);
          o.rotation.y = Math.atan2(d.x, d.z);
          u.phase += step * 7;
          animateWalk(o, u.phase);
        } else animateIdle(o);
        if (u.fled && dist < 0.3) o.visible = false;
        const right = (o.userData.hands as THREE.Mesh[])[1];
        if (u.swing > 0) {
          u.swing -= dt;
          const k = Math.sin(Math.PI * (1 - u.swing / 0.35));
          right.position.set(0.3, 0.5 + k * 0.5, 0.05 + k * 0.35);
          right.rotation.x = -k * 1.6;
        } else { right.rotation.x *= 0.8; right.position.x = 0.34; }
      }
      drawBar(att, def);
      for (const f of flies) {
        f.life += dt;
        if (f.word) {
          const k = f.life / f.max;
          const s = k < 0.12 ? (k / 0.12) * 1.25 : 1 + 0.25 * Math.max(0, 1 - (k - 0.12) * 6);
          f.obj.scale.set(1.8 * s, 0.9 * s, 1);
          f.obj.position.addScaledVector(f.vel, dt);
          ((f.obj as THREE.Sprite).material as THREE.SpriteNodeMaterial).opacity = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
        } else {
          f.vel.y -= 12 * dt;
          f.obj.position.addScaledVector(f.vel, dt);
          if (f.obj.position.y < 0.15) { f.obj.position.y = 0.15; f.vel.set(f.vel.x * 0.3, Math.abs(f.vel.y) * 0.25, f.vel.z * 0.3); }
          f.obj.rotation.x += f.spin.x * dt;
          f.obj.rotation.y += f.spin.y * dt;
        }
        if (f.life > f.max) { scene.remove(f.obj); if (f.word) ((f.obj as THREE.Sprite).material as THREE.Material).dispose(); }
      }
      flies = flies.filter((f) => f.life <= f.max);
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
