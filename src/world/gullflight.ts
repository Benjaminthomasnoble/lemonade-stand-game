// Gull Flight (spec "Views"): take Captain Squawk for a spin over the bay.
// He flies forward on his own; you steer. Keys: A/D or arrows turn, W/S
// climb and dive, Shift for a burst of flapping, Esc or G lands. On touch,
// drag left and right to steer. The tycoon camera comes back where it was.
import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BOUNDS } from './scene.ts';

export interface GullFlight {
  active(): boolean;
  /** Take off; with `at`, Squawk starts beside that spot (a plot's centre), facing it from `side` (radians, default east). */
  start(at?: { x: number; z: number; side?: number }): void;
  stop(): void;
  update(dt: number): void;
}

export function createGullFlight(camera: THREE.PerspectiveCamera, controls: OrbitControls, gull: THREE.Object3D, canvas: HTMLElement): GullFlight {
  let on = false;
  let heading = 0, alt = 18, speed = 14, bank = 0;
  const keys = new Set<string>();
  const saved = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
  let dragX: number | null = null, steer = 0;

  window.addEventListener('keydown', (e) => { if (on) { keys.add(e.code); if (e.code === 'Escape') stop(); } });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  canvas.addEventListener('pointerdown', (e) => { if (on) dragX = e.clientX; });
  window.addEventListener('pointermove', (e) => { if (on && dragX !== null) steer = Math.max(-1, Math.min(1, (e.clientX - dragX) / 120)); });
  window.addEventListener('pointerup', () => { dragX = null; steer = 0; });

  function stop() {
    if (!on) return;
    on = false;
    controls.enabled = true;
    camera.position.copy(saved.pos);
    controls.target.copy(saved.target);
    gull.userData.piloted = false;
    document.body.classList.remove('gull-flight');
  }

  return {
    active: () => on,
    start(at) {
      if (on) return;
      on = true;
      if (at) {
        // Beside the spot, a gull's length off, heading straight at it.
        const side = at.side ?? Math.PI / 2;
        gull.position.set(at.x + Math.sin(side) * 9, 12, at.z + Math.cos(side) * 9);
        gull.rotation.set(0, side + Math.PI, 0);
      }
      saved.pos.copy(camera.position);
      saved.target.copy(controls.target);
      controls.enabled = false;
      gull.userData.piloted = true;
      heading = gull.rotation.y;
      alt = Math.max(12, gull.position.y + 6);
      gull.position.y = alt;
      document.body.classList.add('gull-flight');
    },
    stop,
    update(dt) {
      if (!on) return;
      const turn = (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) - (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - steer;
      heading += turn * 1.6 * dt;
      bank += (turn * 0.6 - bank) * Math.min(1, dt * 4);
      const climb = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
      alt = Math.max(5, Math.min(60, alt + climb * 10 * dt));
      const boost = keys.has('ShiftLeft') || keys.has('ShiftRight');
      speed += ((boost ? 26 : 14) - speed) * Math.min(1, dt * 2);
      const p = gull.position;
      p.x += Math.sin(heading) * speed * dt;
      p.z += Math.cos(heading) * speed * dt;
      // The bay's edges turn him back gently.
      if (p.x < BOUNDS.minX || p.x > BOUNDS.maxX || p.z < BOUNDS.minZ || p.z > BOUNDS.maxZ) {
        const back = Math.atan2(-(p.x - (BOUNDS.minX + BOUNDS.maxX) / 2), -(p.z - (BOUNDS.minZ + BOUNDS.maxZ) / 2));
        heading += Math.atan2(Math.sin(back - heading), Math.cos(back - heading)) * Math.min(1, dt * 1.5);
      }
      p.y += (alt - p.y) * Math.min(1, dt * 3);
      gull.rotation.set(-climb * 0.25, heading, -bank);
      const { wl, wr } = gull.userData as { wl: THREE.Mesh; wr: THREE.Mesh };
      const t = performance.now() / 1000;
      const a = boost || climb > 0 ? Math.sin(t * 16) * 0.7 : Math.sin(t * 3) * 0.12;
      wl.rotation.z = a; wr.rotation.z = -a;
      // A wide, windy chase camera behind and above him.
      const behind = new THREE.Vector3(p.x - Math.sin(heading) * 9, p.y + 3.2, p.z - Math.cos(heading) * 9);
      camera.position.lerp(behind, Math.min(1, dt * 3));
      camera.lookAt(p.x + Math.sin(heading) * 6, p.y - 1, p.z + Math.cos(heading) * 6);
    },
  };
}
