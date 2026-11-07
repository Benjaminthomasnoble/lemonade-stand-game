// The music's beat, for idle bobs (spec "Animation": "Idle bobs follow the music's
// beat"). Lottie's Theme runs at 120 BPM (measured from the file: first beat about
// 0.12 s in). While it plays, the clock reads the track's own position, so bobs land
// on its beats; while it rests or is muted, a steady 120 BPM clock keeps time.
// Idles start at random points: each character lands on an odd or an even beat,
// picked from its id. FizzCo march in lockstep (offset 0, all on the same beat).
export const THEME_BPM = 120;
export const THEME_FIRST_BEAT = 0.12;

let source: () => number | null = () => null;
/** main.ts plugs in the audio: beats since the track started, or null when it isn't playing. */
export function setBeatSource(fn: () => number | null) { source = fn; }

/** Beats, from the music when it plays, else from the wall clock. */
export function beats(): number {
  const b = source();
  return b ?? (performance.now() / 1000) * (THEME_BPM / 60);
}

/** A character's start point, in beats: whole beats only, so everyone still lands on the beat. */
export function beatOffset(id: number, lockstep = false): number {
  return lockstep ? 0 : (Math.imul(id + 1, 2654435761) >>> 0) % 4;
}

/**
 * A bob that lands on the beat: 0 at the landing (squashed, on the beat), 1 at the top.
 * `perBeat` is bobs per beat (0.5: one bob every two beats).
 */
export function bob(offset: number, perBeat = 0.5): number {
  return Math.abs(Math.sin(Math.PI * (beats() + offset) * perBeat));
}
