// Watchable auto-battle (canon section 12): replays a BattleReport's timeline
// at the plot. The sim already decided everything; this only moves people:
// the raiders march in from the street, chop the fence, brawl, and either
// wreck the stand or limp home.
import * as THREE from 'three/webgpu';
import { FACTIONS, PLAYER_COLOR, type BattleReport, type Fighter, type RivalId } from '../sim/economy.ts';
import type { PlotView } from './bay.ts';
import { makePerson } from './people.ts';

type Pop = (pos: THREE.Vector3, text: string, kind: 'sale' | 'miss') => void;

interface Unit {
  f: Fighter;
  obj: THREE.Group;
  target: THREE.Vector3;
  swing: number; // seconds left in the current swing
  ko: number; // 0..1 fall progress, -1 when standing
  fled: boolean;
  spin: number;
}

const APPROACH = 3.5; // seconds of marching before the timeline starts
const PLAY_SPEED = 1.5;
const LINGER = 2.5;

const toolMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.9 });
const tapeMat = new THREE.MeshStandardMaterial({ color: 0xf6d33c, roughness: 0.6 });
const bladeMat = new THREE.MeshStandardMaterial({ color: 0xb8c2cc, roughness: 0.3, metalness: 0.6 });

function weapon(kind: Fighter['weapon']): THREE.Object3D | null {
  if (kind === 'fists') return null;
  const g = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, kind === 'clubs' ? 0.7 : 0.55, 6), toolMat);
  handle.position.y = -0.2;
  g.add(handle);
  if (kind === 'clubs') {
    const tape = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.12, 6), tapeMat);
    tape.position.y = -0.45;
    g.add(tape);
  } else {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.18, 0.22), bladeMat);
    blade.position.set(0, -0.42, 0.1);
    g.add(blade);
  }
  g.position.set(0, -0.45, 0.05);
  g.rotation.x = Math.PI / 2.4;
  return g;
}

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
  let swingsShown = 0;
  const local = (x: number, z: number) => view!.root.localToWorld(new THREE.Vector3(x, 0.12, z));

  function clear() {
    for (const u of units) scene.remove(u.obj);
    units = [];
    report = null;
    if (fence) fence.visible = true;
    view?.root.children.forEach((c) => { if (c.name === 'sentry') c.visible = true; });
  }

  const byId = (id: string) => units.find((u) => u.f.id === id);
  const head = (u: Unit) => u.obj.position.clone().setY(2.1);

  function handle(e: BattleReport['events'][number]) {
    switch (e.type) {
      case 'swing': {
        const a = byId(e.a), b = byId(e.b);
        if (!a || !b) return;
        const dir = a.obj.position.clone().sub(b.obj.position).setY(0);
        if (dir.lengthSq() < 0.01) dir.set(Math.random() - 0.5, 0, Math.random() - 0.5);
        a.target.copy(b.obj.position).add(dir.normalize().multiplyScalar(0.75));
        a.swing = 0.35;
        if (swingsShown++ % 2 === 0) pop(head(b), ['POW!', 'BONK!', 'WHAP!', `-${e.dmg}`][swingsShown % 4], b.f.side === 'def' && report!.defender === 'player' ? 'miss' : 'sale');
        break;
      }
      case 'chop': {
        const a = byId(e.a);
        if (!a) return;
        a.swing = 0.35;
        shake = 0.25;
        if (e.target === 'stand') a.target.copy(local((Math.random() - 0.5) * 2.4, 1.6));
        if (swingsShown++ % 3 === 0) pop(e.target === 'fence' ? a.obj.position.clone().setY(1.4) : local(0, 0.6).setY(2.4), e.target === 'fence' ? 'CRACK' : 'SMASH!', 'miss');
        break;
      }
      case 'breach':
        if (fence) fence.visible = false;
        pop(local(0, 2.2).setY(2), 'The fence is down!', 'miss');
        for (const u of units) if (u.f.side === 'att' && u.ko < 0 && !u.fled) u.target.copy(local((Math.random() - 0.5) * 4, 1.2 + Math.random()));
        break;
      case 'ko': {
        const u = byId(e.a);
        if (u) { u.ko = 0; pop(head(u), 'KO!', 'miss'); }
        break;
      }
      case 'flee': {
        const u = byId(e.a);
        if (!u) return;
        u.fled = true;
        u.target.copy(local((Math.random() - 0.5) * 8, 14));
        pop(head(u), 'Run!', 'miss');
        break;
      }
      case 'stun': {
        const u = byId(e.a);
        if (u) { u.spin = 1.2; pop(head(u), e.by === 'goose' ? 'HONK!' : 'Whoops!', 'miss'); }
        break;
      }
      case 'grab':
        pop(local(0, 0.6).setY(2.4), '💰 They grab the till!', 'miss');
        break;
    }
  }

  return {
    play(r, v, onDone) {
      clear();
      report = r;
      view = v;
      t = -APPROACH;
      next = 0;
      done = onDone;
      swingsShown = 0;
      fence = v.root.getObjectByName('fence');
      standObj = v.root.children[0];
      v.root.children.forEach((c) => { if (c.name === 'sentry') c.visible = false; });
      const color = (owner: string) => (owner === 'player' ? PLAYER_COLOR : FACTIONS[owner as RivalId].color);
      const fenced = r.perimeter > 0;
      const add = (f: Fighter, i: number, n: number) => {
        const isAtt = f.side === 'att';
        const owner = isAtt ? r.attacker : r.defender;
        const obj = makePerson(color(owner), owner === 'player' ? 0x264653 : FACTIONS[owner as RivalId].accent);
        const w = weapon(f.weapon);
        if (w) (obj.userData.limbs as THREE.Mesh[])[3].add(w);
        const spread = (i - (n - 1) / 2) * Math.min(1.1, 9 / Math.max(1, n));
        obj.position.copy(isAtt ? local(spread, 10 + Math.random() * 2) : local(spread * 0.8, 0.9 + (i % 2) * 0.6));
        const target = isAtt ? local(spread, fenced ? 3.1 : 1.8) : obj.position.clone();
        scene.add(obj);
        units.push({ f, obj, target, swing: 0, ko: -1, fled: false, spin: 0 });
      };
      r.attackers.forEach((f, i) => add(f, i, r.attackers.length));
      r.defenders.forEach((f, i) => add(f, i, r.defenders.length));
    },
    update(dt) {
      if (!report || !view) return;
      t += dt * PLAY_SPEED;
      const ev = report.events;
      while (next < ev.length && ev[next].t <= t) handle(ev[next++]);
      if (shake > 0 && standObj) { shake -= dt; standObj.rotation.z = Math.sin(t * 60) * 0.03 * (shake > 0 ? 1 : 0); }
      for (const u of units) {
        const o = u.obj;
        const limbs = o.userData.limbs as THREE.Mesh[];
        if (u.ko >= 0) {
          u.ko = Math.min(1, u.ko + dt * 3);
          o.rotation.x = -Math.PI / 2 * u.ko;
          o.position.y = 0.12 + 0.2 * u.ko;
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
          const ph = (t * 9 + o.id) % (Math.PI * 2);
          limbs[0].rotation.x = Math.sin(ph) * 0.6;
          limbs[1].rotation.x = -Math.sin(ph) * 0.6;
        } else {
          limbs[0].rotation.x *= 0.8;
          limbs[1].rotation.x *= 0.8;
        }
        if (u.fled && dist < 0.3) o.visible = false;
        if (u.swing > 0) {
          u.swing -= dt;
          limbs[3].rotation.x = -2.2 * Math.sin(Math.PI * (1 - u.swing / 0.35));
        } else limbs[3].rotation.x *= 0.8;
      }
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
