// Small seeded PRNG (mulberry32). The whole economy draws from this so a
// given seed always plays out the same way, in the browser and in Node.
export function nextRandom(state: { seed: number }): number {
  let t = (state.seed = (state.seed + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randomRange(state: { seed: number }, min: number, max: number): number {
  return min + (max - min) * nextRandom(state);
}
