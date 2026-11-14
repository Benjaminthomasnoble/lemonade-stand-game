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
/** A raid countdown's woodblock: one tick per quarter note at 160 BPM, taking over when the Raid Incoming stinger
 * chokes dead at 3.0 s (music-notes.md, Stingers). */
export const TICK_SECONDS = 60 / 160;
export const STINGER_CHOKE_SECONDS = 3;
/** Calm Audio's Raid Incoming stinger: about −8 dB. */
export const CALM_RAID_VOLUME = 0.4;

export interface Audio {
  start(): void; // call from a user gesture (autoplay rules)
  stinger(id: Stinger): void;
  toggle(): boolean;
  muted(): boolean;
  /** A tiny cash-register ding for each coin that lands (synthesized, so it needs no file). */
  ding(big?: boolean): void;
  /**
   * Lemonese: soft gibberish syllables, one per word-ish chunk of the line.
   * `voice` sets the pitch (Lottie low and warm, kids high), `mood` the tune:
   * happy rises, grumpy falls, asking ends high.
   */
  babble(text: string, voice?: number, mood?: 'happy' | 'grumpy' | 'ask' | 'flat'): void;
  /** A rotary phone's double bell. */
  ring(): void;
  /** A ship's horn: the theme's opening call, F-A-D. */
  horn(): void;
  /** A woodblock tick for a raid countdown (synthesized): a dry knock on A, the chord the stinger hangs on. */
  tick(): void;
  /** Beats into the theme while it plays (120 BPM, first beat 0.12 s in), else null: idle bobs keep its time. */
  beat(): number | null;
}

/** Calm Audio (spec: Mix and accessibility): `calm` says whether it is on. While it is, the countdown plays no ticks
 * and the Raid Incoming stinger plays at CALM_RAID_VOLUME. */
export function createAudio(calm: () => boolean = () => false): Audio {
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
  let lastBabble = 0;

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
      a.volume = id === 'raid-incoming' && calm() ? CALM_RAID_VOLUME : 1; // Calm Audio softens the raid alert
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
    beat: () => (started && !muted && !bed.paused && !bed.ended ? (bed.currentTime - 0.12) * 2 : null),
    babble(text, voice = 1, mood = 'flat') {
      if (muted || !started) return;
      const now = performance.now();
      if (now - lastBabble < 250) return; // one voice at a time on a busy street
      lastBabble = now;
      try {
        ctx ??= new AudioContext();
        const syllables = Math.max(1, Math.min(6, Math.round(text.replace(/[^a-z]/gi, '').length / 3)));
        const base = 220 * voice;
        let t = ctx.currentTime + 0.02;
        for (let i = 0; i < syllables; i++) {
          const k = syllables === 1 ? 0.5 : i / (syllables - 1);
          const bend = mood === 'happy' ? 1 + k * 0.35 : mood === 'grumpy' ? 1.1 - k * 0.3 : mood === 'ask' ? (i === syllables - 1 ? 1.45 : 1) : 1 + Math.sin(i * 2.3) * 0.08;
          const f = base * bend * (0.94 + Math.random() * 0.12);
          const len = 0.07 + Math.random() * 0.05;
          // A soft vowel: a triangle through a band-pass that slides like a mouth opening.
          const o = ctx.createOscillator();
          const bp = ctx.createBiquadFilter();
          const g = ctx.createGain();
          o.type = 'triangle';
          o.frequency.setValueAtTime(f, t);
          o.frequency.linearRampToValueAtTime(f * (mood === 'grumpy' ? 0.92 : 1.06), t + len);
          bp.type = 'bandpass';
          bp.Q.value = 3;
          bp.frequency.setValueAtTime(600 + Math.random() * 500, t);
          bp.frequency.linearRampToValueAtTime(1100 + Math.random() * 700, t + len);
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.07, t + 0.015);
          g.gain.exponentialRampToValueAtTime(0.0001, t + len);
          o.connect(bp).connect(g).connect(ctx.destination);
          o.start(t);
          o.stop(t + len + 0.02);
          t += len + 0.03;
        }
      } catch { /* no Web Audio */ }
    },
    ring() {
      if (muted || !started) return;
      try {
        ctx ??= new AudioContext();
        const t0 = ctx.currentTime;
        for (const start of [0, 0.45]) {
          for (let i = 0; i < 8; i++) {
            const t = t0 + start + i * 0.04;
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.type = 'square';
            o.frequency.value = i % 2 ? 1180 : 960;
            g.gain.setValueAtTime(0.025, t);
            g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
            o.connect(g).connect(ctx.destination);
            o.start(t); o.stop(t + 0.045);
          }
        }
      } catch { /* no Web Audio */ }
    },
    horn() {
      if (muted || !started) return;
      try {
        ctx ??= new AudioContext();
        const t0 = ctx.currentTime;
        // F2-A2-D3, the call the bari sax and trombone blow in the theme's intro
        [[87.31, 0, 0.42], [110, 0.46, 0.42], [146.83, 0.92, 0.8]].forEach(([f, at, len]) => {
          const t = t0 + at;
          const lp = ctx!.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.value = 900;
          const g = ctx!.createGain();
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.09, t + 0.06);
          g.gain.setValueAtTime(0.09, t + len - 0.1);
          g.gain.exponentialRampToValueAtTime(0.0001, t + len);
          for (const [type, mul] of [['sawtooth', 1], ['square', 2.003]] as const) {
            const o = ctx!.createOscillator();
            o.type = type;
            o.frequency.value = f * mul;
            o.connect(lp);
            o.start(t); o.stop(t + len + 0.02);
          }
          lp.connect(g).connect(ctx!.destination);
        });
      } catch { /* no Web Audio */ }
    },
    tick() {
      if (muted || !started || calm()) return; // Calm Audio has no ticks
      try {
        ctx ??= new AudioContext();
        const t = ctx.currentTime;
        // A woodblock: a bright knock (A5) and a hollow overtone, both gone in a few hundredths of a second.
        for (const [f, v, len] of [[880, 0.06, 0.05], [2420, 0.02, 0.025]]) {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = 'sine';
          o.frequency.value = f;
          g.gain.setValueAtTime(v, t);
          g.gain.exponentialRampToValueAtTime(0.0001, t + len);
          o.connect(g).connect(ctx.destination);
          o.start(t);
          o.stop(t + len + 0.01);
        }
      } catch { /* no Web Audio */ }
    },
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
