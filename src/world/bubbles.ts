// Speech and thought bubbles that follow a character around the 3D world.
// One shared mechanism for everything that talks: customers' reactions,
// Lottie's lines, Dex and the bosses' barks. The words and icons come from
// the caller; this module only places, pops and retires the bubbles.
import * as THREE from 'three/webgpu';

export type BubbleKind = 'speech' | 'thought';

export interface SayOptions {
  kind?: BubbleKind;
  /** Speaker name shown above the line (subtitles name the speaker). */
  who?: string;
  /** How long it stays up, in ms. Defaults scale with the text length. */
  ms?: number;
  /** World units above the character's origin. */
  height?: number;
  /** A side colour for the speaker's name and the bubble's edge. */
  color?: string;
}

export interface Bubbles {
  /** Pop a bubble over a character. A newer line from the same character replaces the old one. */
  say(target: THREE.Object3D, text: string, opts?: SayOptions): void;
  /** Re-place every bubble for this frame. */
  update(camera: THREE.Camera, width: number, height: number): void;
  clear(): void;
  count(): number;
}

interface Live {
  target: THREE.Object3D;
  el: HTMLElement;
  height: number;
  until: number;
  leaving: boolean;
}

/** More than this on screen at once turns into noise; the oldest goes first. */
const MAX_BUBBLES = 10;
/** Past this camera distance a bubble is too small to read, so it hides. */
const MAX_DISTANCE = 75;

export function createBubbles(layer: HTMLElement): Bubbles {
  const live: Live[] = [];
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();

  const retire = (b: Live) => {
    if (b.leaving) return;
    b.leaving = true;
    b.el.classList.add('leaving');
    setTimeout(() => b.el.remove(), 220);
  };

  return {
    say(target, text, opts = {}) {
      const kind = opts.kind ?? 'speech';
      for (const b of live) if (b.target === target && !b.leaving) retire(b);
      const el = document.createElement('div');
      el.className = `bubble ${kind}`;
      if (opts.color) el.style.setProperty('--side', opts.color);
      if (opts.who) {
        const who = document.createElement('div');
        who.className = 'who';
        who.textContent = opts.who;
        el.appendChild(who);
      }
      const line = document.createElement('div');
      line.className = 'line';
      line.textContent = text;
      el.appendChild(line);
      el.style.display = 'none';
      layer.appendChild(el);
      const ms = opts.ms ?? Math.min(4500, 1400 + text.length * 55);
      live.push({ target, el, height: opts.height ?? 2.2, until: performance.now() + ms, leaving: false });
      const active = live.filter((b) => !b.leaving);
      if (active.length > MAX_BUBBLES) retire(active[0]);
    },
    update(camera, width, height) {
      const now = performance.now();
      for (let i = live.length - 1; i >= 0; i--) {
        const b = live[i];
        if (b.leaving) { if (!b.el.isConnected) live.splice(i, 1); continue; }
        if (now > b.until || !b.target.parent) { retire(b); continue; }
        // Hidden characters (a walker back in the pool) take their bubble with them.
        let visible = true;
        for (let o: THREE.Object3D | null = b.target; o; o = o.parent) if (!o.visible) { visible = false; break; }
        if (!visible) { retire(b); continue; }
        b.target.getWorldPosition(v);
        const far = v.distanceTo(camera.position) > MAX_DISTANCE;
        v.y += b.height * b.target.getWorldScale(sc).y;
        v.project(camera);
        const onScreen = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
        if (far || !onScreen) { b.el.style.display = 'none'; continue; }
        b.el.style.display = '';
        b.el.style.left = `${(v.x * 0.5 + 0.5) * width}px`;
        b.el.style.top = `${(-v.y * 0.5 + 0.5) * height}px`;
      }
    },
    clear() {
      for (const b of live) b.el.remove();
      live.length = 0;
    },
    count: () => live.filter((b) => !b.leaving).length,
  };
}
