// Visual twins (spec: Accessibility: "Captions cover voices, the radio and every
// phone call, and every audio alert has a visual twin": an alert-feed card, a
// screen-edge pulse in its colour and pattern, and an in-world marker). Each
// stinger already has its card or toast (the raid warning, the fight tickets,
// the rank-up headline); this adds the screen-edge pulse, and a caption line for
// the voices (Lottie, the story scenes' Steward and Dex) and the phone; the radio
// is a text ticket the same switch gates (src/ui/radio.ts). Barks (customers,
// henchmen, brawls) are written out in their speech bubbles. In-world markers wait
// for the rendering lane. Reduced motion keeps the pulse as one soft glow.
import type { Stinger } from '../audio.ts';

/** Each stinger's pulse: its colour, how many beats, how long each. */
export const PULSE: Record<Stinger, { color: string; beats: number; ms: number }> = {
  'raid-incoming': { color: '#E8704F', beats: 3, ms: 420 }, // three quick red beats: someone's coming
  'raid-won': { color: '#7CC47F', beats: 1, ms: 1100 }, // one long green swell
  'squeezed-out': { color: '#8E3B5E', beats: 2, ms: 800 }, // two slow plum beats
  'rank-up': { color: '#F7C948', beats: 2, ms: 520 }, // two golden beats
};
const CAPTION_MS = 4500;

export interface Twins {
  pulse(kind: Stinger): void;
  /** A caption line: who's speaking and what they said. */
  caption(who: string, line: string): void;
}

export function createTwins(root: HTMLElement, calm: () => boolean, captions: () => boolean): Twins {
  let line: HTMLElement | null = null, lineTimer = 0;
  return {
    pulse(kind) {
      const p = PULSE[kind];
      const el = document.createElement('div');
      el.setAttribute('aria-hidden', 'true');
      el.dataset.pulse = kind;
      Object.assign(el.style, { position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '15' });
      root.appendChild(el);
      const glow = `inset 0 0 48px 14px ${p.color}`, none = `inset 0 0 0 0 ${p.color}`;
      const quiet = calm();
      const anim = el.animate(quiet ? [{ boxShadow: glow, opacity: 0 }, { boxShadow: glow, opacity: 0.7 }, { boxShadow: glow, opacity: 0 }] : [{ boxShadow: none }, { boxShadow: glow }, { boxShadow: none }],
        { duration: quiet ? 1200 : p.ms, iterations: quiet ? 1 : p.beats, easing: 'ease-in-out' });
      anim.onfinish = () => el.remove();
    },
    caption(who, text) {
      if (!captions() || !text) return;
      line?.remove();
      clearTimeout(lineTimer);
      const el = document.createElement('div');
      el.className = 'cl-ticket';
      el.setAttribute('role', 'status');
      el.dataset.testid = 'caption';
      const b = document.createElement('b');
      b.textContent = `${who}:`;
      el.append(b, ` ${text}`);
      Object.assign(el.style, { position: 'absolute', left: '50%', bottom: 'calc(var(--u) * 17)', transform: 'translateX(-50%)', display: 'block', maxWidth: 'min(80vw, calc(var(--u) * 60))', pointerEvents: 'none', zIndex: '14', textAlign: 'center' });
      root.appendChild(el);
      line = el;
      lineTimer = window.setTimeout(() => { el.remove(); if (line === el) line = null; }, CAPTION_MS);
    },
  };
}
