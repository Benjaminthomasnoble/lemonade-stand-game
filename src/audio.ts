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
  /**
   * The Threat level's tension layers under everything (call each frame with threatLevel(s)): from Threat 3 a low guitar
   * drone, from 4 pizzicato strings on the beat, at 5 a cane tap every other beat. Calm Audio and mute silence them.
   */
  threat(level: number): void;
  /** A faction's leitmotif, a few synthesized notes in its own voice (rival jingles on the radio, a boss's phone call). */
  motif(faction: Motif): void;
  /** Dead air: the bed drops out for `seconds` (a retired rival's jingle slot on 101.5). */
  deadAir(seconds?: number): void;
}

export type Motif = 'sourwood' | 'hollis' | 'fizzco' | 'coldbrew' | 'blenders' | 'snootwater';
/** Each gang's leitmotif: notes as [Hz, start s, length s], a voice and a level. The theme sits around D minor (F-A-D). */
const MOTIFS: Record<Motif, { voice: OscillatorType; notes: [number, number, number][]; gain: number; decay: number; vibrato?: number; lp?: number }> = {
  // Vera's Sourwoods: a harpsichord waltz in C harmonic minor (96 BPM), prim and icy
  sourwood: { voice: 'square', gain: 0.03, decay: 0.25, lp: 2600, notes: [[523.3, 0, 0.28], [622.3, 0.31, 0.28], [784, 0.62, 0.28], [493.9, 0.94, 0.28], [523.3, 1.25, 0.55]] },
  // Hollis Sweet Tea: a banjo roll in G Mixolydian (116 BPM), a stubborn porch stomp
  hollis: { voice: 'triangle', gain: 0.07, decay: 0.18, notes: [[392, 0, 0.12], [493.9, 0.13, 0.12], [587.3, 0.26, 0.12], [698.5, 0.39, 0.2], [587.3, 0.65, 0.4]] },
  // FizzCo: a bubbly synth arpeggio rising through C Lydian (128 BPM), a shiny jingle
  fizzco: { voice: 'sine', gain: 0.06, decay: 0.12, notes: [[523.3, 0, 0.1], [659.3, 0.117, 0.1], [740, 0.234, 0.1], [784, 0.35, 0.1], [1046.5, 0.47, 0.3]] },
  // Cold Brew: a lazy electric piano in D Dorian (80 BPM), behind the beat
  coldbrew: { voice: 'triangle', gain: 0.06, decay: 0.6, lp: 1200, notes: [[293.7, 0, 0.5], [349.2, 0.4, 0.5], [440, 0.78, 0.5], [493.9, 1.1, 0.4], [523.3, 1.45, 0.8]] },
  // The Boardwalk Blenders: a galloping surf-guitar run in D Mixolydian (152 BPM), beach-bro party rock
  blenders: { voice: 'sawtooth', gain: 0.045, decay: 0.15, lp: 1400, notes: [[146.8, 0, 0.09], [146.8, 0.1, 0.09], [185, 0.2, 0.09], [220, 0.3, 0.09], [261.6, 0.4, 0.09], [293.7, 0.5, 0.4]] },
  // Snootwater Springs: a glass harmonica up high, with a snooty wobble
  snootwater: { voice: 'sine', gain: 0.05, decay: 0.7, vibrato: 6, notes: [[1318.5, 0, 0.45], [1975.5, 0.35, 0.45], [1661.2, 0.7, 0.45], [2637, 1.05, 0.8]] },
};

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
  // the tension layers: a drone that fades in and out, and notes scheduled a little ahead of the audio clock
  let drone: { gain: GainNode; stop(): void } | null = null;
  let nextPulse = 0, pulseN = 0;
  let deadUntil = 0;
  const PULSE = 0.5; // the theme's 120 BPM

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
    threat(level) {
      const on = started && !muted && !calm();
      if (!ctx && !on) return;
      try {
        ctx ??= new AudioContext();
        const c = ctx, now = c.currentTime;
        // T3+: a low guitar drone on D, two detuned saws through a dark filter with a slow swell
        const want = on && level >= 3 ? 0.018 + (level - 3) * 0.006 : 0;
        if (want && !drone) {
          const gain = c.createGain(); gain.gain.value = 0.0001;
          const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380;
          const lfo = c.createOscillator(), depth = c.createGain(); lfo.frequency.value = 0.18; depth.gain.value = 120;
          lfo.connect(depth).connect(lp.frequency);
          const oscs = [73.42, 73.42 * 1.004, 110].map((f) => { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(lp); o.start(); return o; });
          lfo.start();
          lp.connect(gain).connect(c.destination);
          drone = { gain, stop: () => { for (const o of [...oscs, lfo]) o.stop(); } };
        }
        if (drone) {
          const g = drone.gain.gain;
          if (Math.abs(g.value - Math.max(want, 0.0001)) > 0.001) { g.cancelScheduledValues(now); g.setTargetAtTime(Math.max(want, 0.0001), now, 1.2); }
          if (!want && g.value < 0.0005) { const d = drone; drone = null; d.stop(); }
        }
        if (!on || level < 4) { nextPulse = 0; return; }
        if (nextPulse < now) nextPulse = now + 0.05;
        // T4+: pizzicato strings on each beat (D A F A); T5: a cane tap on every other beat
        const PIZZ = [146.83, 220, 174.61, 220];
        while (nextPulse < now + 0.25) {
          const t = nextPulse;
          const o = c.createOscillator(), g = c.createGain();
          o.type = 'triangle'; o.frequency.value = PIZZ[pulseN % 4];
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.035, t + 0.006);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
          o.connect(g).connect(c.destination); o.start(t); o.stop(t + 0.24);
          if (level >= 5 && pulseN % 2 === 0) {
            // a cane's rubber tip on the boardwalk: a low knock with a hard click on top
            for (const [f, v, len] of [[180, 0.06, 0.07], [1400, 0.015, 0.015]] as const) {
              const k = c.createOscillator(), kg = c.createGain();
              k.type = 'sine'; k.frequency.setValueAtTime(f, t); k.frequency.exponentialRampToValueAtTime(f * 0.7, t + len);
              kg.gain.setValueAtTime(v, t); kg.gain.exponentialRampToValueAtTime(0.0001, t + len);
              k.connect(kg).connect(c.destination); k.start(t); k.stop(t + len + 0.01);
            }
          }
          pulseN++;
          nextPulse += PULSE;
        }
      } catch { /* no Web Audio */ }
    },
    motif(faction) {
      if (muted || !started) return;
      const m = MOTIFS[faction];
      if (!m) return;
      try {
        ctx ??= new AudioContext();
        const c = ctx, t0 = c.currentTime + 0.03;
        let end = 0;
        for (const [f, at, len] of m.notes) {
          const t = t0 + at, o = c.createOscillator(), g = c.createGain();
          o.type = m.voice; o.frequency.value = f;
          if (m.vibrato) { const v = c.createOscillator(), vg = c.createGain(); v.frequency.value = m.vibrato; vg.gain.value = f * 0.012; v.connect(vg).connect(o.frequency); v.start(t); v.stop(t + len + m.decay); }
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(m.gain, t + 0.012);
          g.gain.setValueAtTime(m.gain, t + len * 0.6);
          g.gain.exponentialRampToValueAtTime(0.0001, t + len + m.decay);
          let out: AudioNode = g;
          if (m.lp) { const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = m.lp; g.connect(lp); out = lp; }
          o.connect(g); out.connect(c.destination);
          o.start(t); o.stop(t + len + m.decay + 0.02);
          end = Math.max(end, at + len + m.decay);
        }
        // the bed ducks under the motif, as under a stinger
        ducks++;
        bed.volume = BED_VOLUME * DUCK;
        window.setTimeout(() => { ducks = Math.max(0, ducks - 1); if (!ducks && performance.now() >= deadUntil) bed.volume = BED_VOLUME; }, (end + 0.1) * 1000);
      } catch { /* no Web Audio */ }
    },
    deadAir(seconds = 1) {
      if (muted || !started) return;
      deadUntil = performance.now() + seconds * 1000;
      bed.volume = 0;
      window.setTimeout(() => { if (performance.now() >= deadUntil) bed.volume = ducks ? BED_VOLUME * DUCK : BED_VOLUME; }, seconds * 1000 + 10);
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
