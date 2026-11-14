// In-world markers (spec "Kitchen-Table Clay": "In-world markers stay small: chalk
// price tags, tape queue counters, thought bubbles, owner-colored HP pills and
// dashed clay-snake raid arrows").
//  - Mid zoom: a masking-tape counter over each of your open stands with a line,
//    and an owner-coloured HP pill over any dented stand, facility or fence.
//  - Any zoom, Bay View too: while a raid warning is live (or your own squad is
//    on its way), a dashed clay snake crawls from where the raid set out to the
//    target, its head where the raid is on the game clock, with an egg-timer ETA.
// Reads the sim; never writes it.
import * as THREE from 'three';
import {
  buildingHp, currentHp, FACTIONS, hqPlot, incomingRaids, raidStart, squadHome, peopleAhead, PERIMETERS, PLOT_BY_ID,
  type GameState, type RivalId,
} from '../sim/economy.ts';
import type { PlotView } from './bay.ts';
import { clayPlain } from './clay/kit.ts';
import { OWNER } from './clay/palette.ts';
import { emoteUrl } from '../ui/emotes.ts';

export interface Markers {
  update(s: GameState, camera: THREE.Camera, target: THREE.Vector3, views: Record<string, PlotView>, w: number, h: number): void;
  /** What is showing (tests). */
  count(): { tapes: number; pills: number; arrows: number; stamps: number };
  /**
   * An alert's mark in the world (every alert has a sound, an edge pulse and a mark): a crooked rubber stamp thunks
   * down over the plot and stays a few seconds. good: a raid won or held, a buyout; bad: squeezed out; gold: a rank-up.
   */
  stamp(plot: string, text: string, tone: 'good' | 'bad' | 'gold'): void;
}

/** Beyond this camera distance it's Bay View: tapes and pills fold away, raid arrows stay. */
const MID_MAX = 90;
/** Tapes and pills only near what the camera looks at, so the screen never fills with them. */
const NEAR = 70;
const ROLL_SECONDS = 12;
const DASH = 1.1, GAP = 0.9; // world units along the arrow
const MAX_DASHES = 400, MAX_HEADS = 8;

const colorOf = (owner: string | null) => (owner && owner in OWNER ? OWNER[owner as keyof typeof OWNER].main : '#FFF1D6');

interface Tag { el: HTMLElement; text: string; seen: boolean }

export function createMarkers(scene: THREE.Scene, layer: HTMLElement): Markers {
  layer.classList.add('markers');
  const tags = new Map<string, Tag>();
  const tag = (key: string, cls: string): Tag => {
    let t = tags.get(key);
    if (!t) {
      const el = document.createElement('div');
      el.className = cls;
      layer.appendChild(el);
      t = { el, text: '', seen: false };
      tags.set(key, t);
    }
    t.seen = true;
    return t;
  };

  // The clay snakes: one instanced batch of dashes and one of arrowheads for every live raid.
  const dashGeo = new THREE.CapsuleGeometry(0.32, DASH - 0.64, 3, 8).rotateX(Math.PI / 2);
  const dashes = new THREE.InstancedMesh(dashGeo, clayPlain('#ffffff'), MAX_DASHES);
  const headGeo = new THREE.ConeGeometry(0.75, 1.6, 10).rotateX(Math.PI / 2);
  const heads = new THREE.InstancedMesh(headGeo, clayPlain('#ffffff'), MAX_HEADS);
  for (const m of [dashes, heads]) { m.count = 0; m.frustumCulled = false; m.castShadow = true; m.name = 'raid-arrows'; scene.add(m); }
  const born = new Map<string, number>();

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), col = new THREE.Color(), col2 = new THREE.Color();
  const p = new THREE.Vector3(), p2 = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), mid = new THREE.Vector3();
  const side = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), fwd = new THREE.Vector3(0, 0, 1), dir = new THREE.Vector3();
  const proj = new THREE.Vector3();
  let shown = { tapes: 0, pills: 0, arrows: 0, stamps: 0 };
  const STAMP_MS = 6000;
  const stamps: { el: HTMLElement; plot: string; until: number }[] = [];

  /** A point on the snake: a raised arc from a to b with a slow side-to-side wiggle. */
  const along = (t: number, time: number, len: number, out: THREE.Vector3) => {
    const u = 1 - t;
    out.set(u * u * a.x + 2 * u * t * mid.x + t * t * b.x, u * u * a.y + 2 * u * t * mid.y + t * t * b.y, u * u * a.z + 2 * u * t * mid.z + t * t * b.z);
    const wig = Math.sin(t * len * 0.35 - time * 2.4) * 0.45 * Math.sin(Math.PI * t);
    return out.addScaledVector(side, wig);
  };

  const place = (el: HTMLElement, pos: THREE.Vector3, camera: THREE.Camera, w: number, h: number) => {
    proj.copy(pos).project(camera);
    const on = proj.z < 1 && proj.x > -1.2 && proj.x < 1.2 && proj.y > -1.2 && proj.y < 1.2;
    el.style.display = on ? '' : 'none';
    if (on) el.style.transform = `translate(${((proj.x * 0.5 + 0.5) * w).toFixed(1)}px, ${((-proj.y * 0.5 + 0.5) * h).toFixed(1)}px) translate(-50%, -100%)`;
    return on;
  };

  return {
    count: () => shown,
    stamp(plot, text, tone) {
      if (!PLOT_BY_ID[plot]) return;
      const el = document.createElement('div');
      el.className = `mk-stamp ${tone}`;
      el.innerHTML = '<b></b>';
      (el.firstElementChild as HTMLElement).textContent = text;
      (el.firstElementChild as HTMLElement).style.rotate = `${(Math.random() * 14 - 9).toFixed(1)}deg`; // crooked, never the same twice
      layer.appendChild(el);
      stamps.push({ el, plot, until: performance.now() + STAMP_MS });
      while (stamps.length > 4) stamps.shift()!.el.remove();
    },
    update(s, camera, target, views, w, h) {
      for (const t of tags.values()) t.seen = false;
      const dist = camera.position.distanceTo(target);
      const mid0 = dist <= MID_MAX;
      const now = performance.now() / 1000;
      let tapes = 0, pills = 0;

      if (mid0) {
        for (const id in views) {
          const v = views[id], ps = s.plots[id];
          if (!ps || !v) continue;
          v.root.getWorldPosition(p);
          if (Math.hypot(p.x - target.x, p.z - target.z) > NEAR) continue;
          // Masking-tape queue counter over your open stands with people in line.
          const st = ps.stand;
          if (ps.owner === 'player' && st && !st.wrecked && !ps.busted && s.phase === 'open') {
            const n = peopleAhead(st);
            if (n > 0) {
              const t = tag(`q:${id}`, 'mk-tape');
              const text = `${n} in line`;
              if (t.text !== text) { t.text = text; t.el.textContent = text; t.el.dataset.n = String(n); }
              // Beside the counter, below every level's sign and neon, so it never covers LOTTIE'S.
              p2.copy(v.serve).setY(2.2); p2.x += 1.5;
              if (place(t.el, p2, camera, w, h)) tapes++;
            }
          }
          // Owner-coloured HP pills: the building, then the fence, only while dented.
          const max = buildingHp(ps), hp = currentHp(ps);
          const per = ps.defense.tier ? PERIMETERS[ps.defense.tier - 1] : undefined;
          const fence = per && ps.defense.fenceHp > 0 && ps.defense.fenceHp < per.hp ? ps.defense.fenceHp / per.hp : null;
          const bld = max > 0 && hp > 0 && hp < max ? hp / max : null;
          if (bld !== null || fence !== null) {
            const t = tag(`hp:${id}`, 'mk-hp');
            const text = `${ps.owner}|${bld?.toFixed(2)}|${fence?.toFixed(2)}`;
            if (t.text !== text) {
              t.text = text;
              const c = colorOf(ps.owner);
              const bar = (f: number, cls: string, title: string) => `<span class="${cls}" title="${title}"><i style="width:${Math.round(f * 100)}%;background:${c}"></i></span>`;
              t.el.innerHTML = (bld !== null ? bar(bld, 'pill', `${Math.round(hp)}/${max} HP`) : '') + (fence !== null ? bar(fence, 'pill fence', `Fence ${ps.defense.fenceHp}/${per!.hp} HP`) : '');
            }
            p2.copy(v.serve).setY(5.2);
            if (place(t.el, p2, camera, w, h)) pills++;
          }
        }
      }

      // Raid arrows, at every zoom.
      // Rival raids once their warning lands; your own squad's once it sets out, until the fight.
      const yours = s.raids.filter((r) => r.attacker === 'player' && r.launched && (r.at === undefined || s.minute < r.at));
      const raids = [...incomingRaids(s).filter((r) => r.attacker !== 'player'), ...yours].filter((r) => PLOT_BY_ID[r.target]);
      for (const k of born.keys()) if (!raids.some((r) => r.id === k)) born.delete(k);
      let nd = 0, nh = 0;
      const thick = THREE.MathUtils.clamp(dist / 24, 1, 6); // chunkier from Bay View so it reads
      for (const r of raids.slice(0, MAX_HEADS)) {
        if (!born.has(r.id)) born.set(r.id, now);
        // It sets out from where the raid does: the raider's plot nearest the target, or your squad's clubhouse.
        const from = PLOT_BY_ID[r.attacker === 'player' ? squadHome(s, r.target, r.guards ?? []) : raidStart(s, r.attacker as RivalId, r.target)] ?? hqPlot(r.attacker as RivalId);
        const to = PLOT_BY_ID[r.target];
        const fromView = views[from.id], toView = views[to.id];
        if (fromView) fromView.root.getWorldPosition(a); else a.set(from.x, 0, from.z);
        if (toView) toView.root.getWorldPosition(b); else b.set(to.x, 0, to.z);
        a.y = 1.6; b.y = 7.5; // ends hovering over the target, above its tape and pills
        const len = a.distanceTo(b);
        mid.addVectors(a, b).multiplyScalar(0.5); mid.y += 4 + len * 0.18;
        side.subVectors(b, a).setY(0).normalize().cross(up);
        // The snake follows the raid on the game clock (sets out at r.leave, arrives at r.at); a raid without
        // a clock rolls out in about 12 real seconds.
        const roll = r.leave !== undefined && r.at !== undefined && r.at > r.leave
          ? THREE.MathUtils.clamp((s.minute - r.leave) / (r.at - r.leave), 0.04, 1)
          : Math.min(1, (now - born.get(r.id)!) / ROLL_SECONDS);
        const reach = roll * roll * (3 - 2 * roll); // eases out, eases in
        const pal = OWNER[r.attacker as keyof typeof OWNER] ?? OWNER.blenders;
        col.set(pal.main); col2.set(pal.accent);
        const pitch = (DASH + GAP) * thick;
        const crawl = ((now * 1.6 * thick) % pitch); // dashes march toward the target
        const arc = len * 1.15;
        for (let d = crawl; d < arc * reach && nd < MAX_DASHES; d += pitch) {
          const t = d / arc;
          along(t, now, len, p);
          along(Math.min(1, t + 0.01), now, len, p2);
          dir.subVectors(p2, p).normalize();
          q.setFromUnitVectors(fwd, dir);
          sc.set(thick, thick, thick);
          dashes.setMatrixAt(nd, m4.compose(p, q, sc));
          dashes.setColorAt(nd, (((Math.round((d - crawl) / pitch) - Math.floor((now * 1.6 * thick) / pitch)) % 3) + 3) % 3 === 2 ? col2 : col); // banded like a coral snake
          nd++;
        }
        // The head, and the egg timer riding just above it.
        const th = Math.max(0.02, reach);
        along(th, now, len, p);
        along(Math.max(0, th - 0.01), now, len, p2);
        dir.subVectors(p, p2).normalize();
        q.setFromUnitVectors(fwd, dir);
        const pulse = 1 + Math.sin(now * 6) * 0.08;
        heads.setMatrixAt(nh, m4.compose(p, q, sc.set(thick * pulse, thick * pulse, thick * pulse)));
        heads.setColorAt(nh, col);
        nh++;
        const t = tag(`raid:${r.id}`, 'mk-eta');
        const text = `${r.eta}|${r.attacker}`;
        if (t.text !== text) {
          t.text = text;
          t.el.innerHTML = `<img alt="" src="${emoteUrl('line')}"><b></b>`;
          (t.el.querySelector('b') as HTMLElement).textContent = r.eta;
          t.el.style.setProperty('--edge', colorOf(r.attacker));
          t.el.title = r.attacker === 'player' ? `Your squad hits ${to.name} at ${r.eta}` : `${FACTIONS[r.attacker as RivalId]?.name ?? 'Raiders'} hit ${to.name} at ${r.eta}`;
        }
        place(t.el, p2.copy(p).setY(p.y + 1.6 * thick), camera, w, h);
      }
      dashes.count = nd; heads.count = nh;
      dashes.instanceMatrix.needsUpdate = true; heads.instanceMatrix.needsUpdate = true;
      if (dashes.instanceColor) dashes.instanceColor.needsUpdate = true;
      if (heads.instanceColor) heads.instanceColor.needsUpdate = true;

      // Alert stamps ride over their plot at any zoom, then fade.
      const ms = performance.now();
      for (let i = stamps.length - 1; i >= 0; i--) {
        const st = stamps[i];
        if (ms > st.until) { st.el.remove(); stamps.splice(i, 1); continue; }
        if (ms > st.until - 500) st.el.classList.add('leaving');
        const v = views[st.plot], pl = PLOT_BY_ID[st.plot];
        if (v) v.root.getWorldPosition(p); else p.set(pl.x, 0, pl.z);
        p.y = 3.5 + Math.min(10, dist * 0.06);
        place(st.el, p, camera, w, h);
      }
      for (const [k, t] of tags) if (!t.seen) { t.el.remove(); tags.delete(k); }
      shown = { tapes, pills, arrows: nh, stamps: stamps.length };
    },
  };
}
