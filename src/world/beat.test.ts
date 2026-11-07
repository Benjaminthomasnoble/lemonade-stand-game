import { describe, expect, it } from 'vitest';
import { beatOffset, beats, bob, setBeatSource } from './beat.ts';

describe('idle bobs on the beat', () => {
  it('reads the music when it plays and lands each bob on a beat', () => {
    let b = 7;
    setBeatSource(() => b);
    expect(beats()).toBe(7);
    // Squashed (0) on the beat for every start point, since offsets are whole beats.
    for (const id of [1, 2, 3, 40, 999]) expect(bob(beatOffset(id), 0.5) % 1).toBeCloseTo(0, 6);
    b = 8;
    expect(bob(0, 0.5)).toBeCloseTo(0, 6);
    b = 7.5;
    expect(bob(beatOffset(3, true), 0.25)).toBeGreaterThan(0.3);
  });
  it('starts characters on different beats, FizzCo all on one', () => {
    const offs = new Set([...Array(20).keys()].map((i) => beatOffset(i)));
    expect(offs.size).toBeGreaterThan(1);
    expect(new Set([1, 5, 9].map((i) => beatOffset(i, true)))).toEqual(new Set([0]));
  });
  it('keeps steady time when the music is off', () => {
    setBeatSource(() => null);
    expect(Number.isFinite(beats())).toBe(true);
  });
});
