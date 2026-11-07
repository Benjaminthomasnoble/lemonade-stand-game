// Things that move through the bay on their own (spec "The bay and its
// districts", "VIP arrivals"): crate trucks (a driver at the wheel) and
// pipe-cleaner bikes (a rider on each) on button wheels pootling along the
// district street you're looking at, squashing when they brake and stretching
// when they set off; and, once you own the M5 Lemon Blimp, the fat lemon-clay
// blimp drifting high over the bay, glowing like a paper lantern at night.
// Traffic clears the street while a brawl or a VIP pickup plays, and holds
// still while the game is paused. Presentation only: it reads the game state.
import * as THREE from 'three';
import type { GameState } from '../sim/economy.ts';
import { DISTRICTS, PLOT_SPACING, SEA_X, SEA_Z } from '../sim/map.ts';
import { truck, bike, blimp, type Truck, type Bike } from './clay/rides.ts';
import { kit } from './clay/kit.ts';
import { P } from './clay/palette.ts';
import { makeCustomer, type SegmentLook } from './clay/cast.ts';
import { freezeFigures } from './clay/figureBatch.ts';

const NEAR = 70; // only a street this close to the camera's target gets traffic
const LANE = 1.8;
const BLIMP_TIER = 5; // M5, The Lemon Blimp

interface Car { v: Truck | Bike; kind: 'truck' | 'bike'; x: number; dir: 1 | -1; speed: number; z: number; x0: number; x1: number; brake: number; go: number; wait: number }

export interface TrafficScene {
  /** A brawl or VIP pickup is playing: the street clears until it ends. */
  hold?: boolean;
  /** The blimp hides when it comes this close to the camera. */
  camera?: THREE.Camera;
}
export interface Traffic { update(s: GameState, dt: number, target: THREE.Vector3, scene?: TrafficScene): void }

const BLIMP_Y = 64; // above the mid-zoom cameras
const BLIMP_NEAR = 80;

/** A rider for an ice-cream bike, pedalling hunched over the bars, frozen into one draw. */
function rider(i: number): THREE.Object3D {
  const seg: SegmentLook[] = ['kids', 'students', 'families'];
  const { fig } = makeCustomer(seg[i % seg.length], i + 3, kit().fig, { detail: 0.5 });
  fig.pose({ lean: 0.35, lL: -1.25, lR: -0.55, aL: [-1.35, 0.15], aR: [-1.35, -0.15], headTilt: -0.25 }, 0);
  const g = new THREE.Group();
  g.add(fig.root);
  fig.root.updateMatrixWorld(true);
  const hip = fig.legs[0].getWorldPosition(new THREE.Vector3());
  const s = 0.62;
  fig.root.scale.setScalar(s);
  fig.root.position.set(0, 1.26 - hip.y * s, -0.3);
  freezeFigures(g, kit().fig);
  return g;
}

export function createTraffic(scene: THREE.Scene): Traffic {
  const cabs = [P.terra, P.teal, '#9C8AD0', P.blush];
  const cars: Car[] = [
    ...cabs.map((c) => ({ v: truck(c), kind: 'truck' as const })),
    ...[P.blush, P.green, '#9C8AD0'].map((c, i) => { const v = bike(c); v.group.add(rider(i)); return { v, kind: 'bike' as const }; }),
  ].map((c, i) => {
    c.v.group.visible = false;
    c.v.group.scale.setScalar(c.kind === 'truck' ? 0.9 : 0.8);
    scene.add(c.v.group);
    return { ...c, x: 0, dir: (i % 2 ? 1 : -1) as 1 | -1, speed: c.kind === 'truck' ? 4.5 : 2.6, z: 0, x0: 0, x1: 0, brake: 0, go: 0, wait: i * 1.7 };
  });
  let street = '';

  const b = blimp();
  b.group.visible = false;
  b.group.scale.setScalar(2.2);
  scene.add(b.group);
  let lastF = -1, acc = 0, time = 0;

  return {
    update(s, dt, target, opts = {}) {
      acc += dt;
      time += dt;
      const f = kit().twos.f;
      if (f === lastF) return;
      lastF = f;
      const step = Math.min(acc, 0.25);
      acc = 0;
      const far = (scene.userData.detail ?? 0) >= 2;

      // the Lemon Blimp loops slowly over the bay
      b.group.visible = s.brandTier >= BLIMP_TIER;
      if (b.group.visible) {
        const a = time * 0.02;
        const cx = (SEA_X - 180) / 2, cz = (SEA_Z - 125) / 2;
        b.group.position.set(cx + Math.cos(a) * 130, BLIMP_Y + Math.sin(time * 0.3) * 1.2, cz + Math.sin(a) * 70);
        // never fly through the camera: it slips out of view when it gets close
        if (opts.camera && opts.camera.position.distanceTo(b.group.position) < BLIMP_NEAR) b.group.visible = false;
        b.group.rotation.set(0, -a + Math.PI, Math.sin(time * 0.25) * 0.04);
        b.prop.rotation.z = f * 0.7;
        b.body.scale.set(1 + Math.sin(time * 0.8) * 0.01, 1 - Math.sin(time * 0.8) * 0.01, 1);
      }

      // which district street is nearest the camera's target?
      let best: (typeof DISTRICTS)[number] | null = null, bd = Infinity;
      for (const d of DISTRICTS) {
        const x0 = d.origin[0], x1 = x0 + d.cols * PLOT_SPACING;
        const dx = target.x < x0 ? x0 - target.x : target.x > x1 ? target.x - x1 : 0;
        const dd = Math.hypot(dx, target.z - d.origin[1]);
        if (dd < bd) { bd = dd; best = d; }
      }
      const show = !!best && bd < NEAR && !far && !opts.hold;
      if (best && best.id !== street) {
        street = best.id;
        const x0 = best.origin[0] + 2, x1 = best.origin[0] + best.cols * PLOT_SPACING - 2;
        cars.forEach((c, i) => {
          c.x0 = x0; c.x1 = x1;
          c.x = x0 + ((i * 0.37 + 0.1) % 1) * (x1 - x0);
          c.z = best!.origin[1] + c.dir * LANE;
        });
      }
      for (const c of cars) {
        c.v.group.visible = show;
        if (!show) continue;
        let sq = 0;
        // keep a clay car's length from whatever is ahead in the lane
        const blocked = cars.some((o) => o !== c && o.dir === c.dir && c.dir * (o.x - c.x) > 0 && c.dir * (o.x - c.x) < (c.kind === 'truck' || o.kind === 'truck' ? 6 : 3.5));
        if (c.wait > 0) { c.wait -= step; }
        else if (blocked) { if (c.go > 0.5) c.brake = 1; c.go = 0; }
        else {
          c.x += c.dir * c.speed * step;
          c.go = Math.min(1, c.go + step * 3);
          if ((c.dir > 0 && c.x > c.x1) || (c.dir < 0 && c.x < c.x0)) {
            // brake with a squash, turn round into the other lane
            c.x = THREE.MathUtils.clamp(c.x, c.x0, c.x1);
            c.dir = (c.dir * -1) as 1 | -1;
            c.brake = 1;
            c.go = 0;
            c.wait = 0.6 + Math.random() * 1.5;
          }
        }
        c.brake = Math.max(0, c.brake - step * 2.5);
        if (c.brake > 0) sq = Math.sin(c.brake * Math.PI) * 0.1;
        const stretch = c.wait <= 0 && c.go < 1 ? Math.sin(c.go * Math.PI) * 0.06 : 0;
        const laneZ = (best?.origin[1] ?? c.z) + c.dir * LANE;
        const g = c.v.group;
        g.position.set(c.x, c.kind === 'bike' ? Math.abs(Math.sin(time * 3)) * 0.04 : 0, laneZ);
        g.rotation.y = c.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        if ('body' in c.v) {
          c.v.body.scale.set(1 + sq * 0.3, 1 - sq + stretch * 0.3, 1 + sq * 0.6 - stretch);
          c.v.body.rotation.x = sq * 0.6 - stretch * 0.4;
        }
        const roll = c.wait > 0 ? 0 : (c.speed * step) / 0.45;
        for (const w of c.v.wheels) w.rotation.x += roll;
      }
    },
  };
}
