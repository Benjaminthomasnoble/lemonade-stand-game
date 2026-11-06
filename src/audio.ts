// Music and stingers (spec "Music and sound"; files from the music thread,
// see /mnt/project-files/lemonade-stand-wars/music/NOTES.md).
// The theme ends on a natural ring-out, so it plays through and rests before
// coming round again instead of looping mid-ring. Stingers duck the bed 12 dB.
const BASE = `${import.meta.env.BASE_URL}audio/`;
const THEME = 'lsw-theme-when-life-gives-you-lemons.mp3';
export type Stinger = 'rank-up' | 'raid-incoming' | 'raid-won' | 'squeezed-out';

const MUTE_KEY = 'lemonade-stand-wars/muted';
const BED_VOLUME = 0.35;
const DUCK = 10 ** (-12 / 20); // −12 dB
const REST_MS = 25000;

export interface Audio {
  start(): void; // call from a user gesture (autoplay rules)
  stinger(id: Stinger): void;
  toggle(): boolean;
  muted(): boolean;
  /** A tiny cash-register ding for each coin that lands (synthesized, so it needs no file). */
  ding(big?: boolean): void;
}

export function createAudio(): Audio {
  let muted = false;
  try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch { /* private mode */ }
  const bed = new window.Audio(BASE + THEME);
  bed.volume = BED_VOLUME;
  bed.preload = 'auto';
  let started = false;
  let rest: number | undefined;
  bed.addEventListener('ended', () => { rest = window.setTimeout(() => { if (!muted) void bed.play().catch(() => {}); }, REST_MS); });
  const stingers = new Map<Stinger, HTMLAudioElement>();
  const get = (id: Stinger) => {
    let a = stingers.get(id);
    if (!a) { a = new window.Audio(`${BASE}lsw-stinger-${id}.mp3`); a.preload = 'auto'; stingers.set(id, a); }
    return a;
  };
  let ducks = 0;
  let ctx: AudioContext | null = null;
  let lastDing = 0;

  return {
    start() {
      if (started || muted) return;
      started = true;
      void bed.play().catch(() => { started = false; });
    },
    stinger(id) {
      if (muted) return;
      const a = get(id);
      a.currentTime = 0;
      ducks++;
      bed.volume = BED_VOLUME * DUCK;
      const restore = () => { ducks = Math.max(0, ducks - 1); if (!ducks) bed.volume = BED_VOLUME; a.removeEventListener('ended', restore); };
      a.addEventListener('ended', restore);
      void a.play().catch(restore);
    },
    toggle() {
      muted = !muted;
      try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch { /* ignore */ }
      if (muted) { bed.pause(); window.clearTimeout(rest); } else { started = false; this.start(); }
      return muted;
    },
    muted: () => muted,
    ding(big = false) {
      if (muted || !started) return;
      const now = performance.now();
      if (now - lastDing < 70) return; // a rush makes one bright run, not a wall of noise
      lastDing = now;
      try {
        ctx ??= new AudioContext();
        const t = ctx.currentTime;
        // The theme's top F (698 Hz), with an octave on top for a big coin.
        for (const [f, v] of big ? [[698.5, 0.06], [1397, 0.04]] : [[698.5, 0.05]]) {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = 'triangle';
          o.frequency.value = f;
          g.gain.setValueAtTime(v, t);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
          o.connect(g).connect(ctx.destination);
          o.start(t);
          o.stop(t + 0.36);
        }
      } catch { /* no Web Audio */ }
    },
  };
}
