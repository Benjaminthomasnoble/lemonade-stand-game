import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CALM_RAID_VOLUME, createAudio } from './audio.ts';

// Just enough browser for createAudio: <audio> elements that note each play and its volume, and a Web Audio context
// that counts the oscillators a synthesized sound starts.
const played: { src: string; volume: number }[] = [];
let oscillators = 0;
class FakeAudio {
  volume = 1;
  currentTime = 0;
  paused = true;
  ended = false;
  preload = '';
  src: string;
  constructor(src = '') { this.src = src; }
  play() { this.paused = false; played.push({ src: this.src, volume: this.volume }); return Promise.resolve(); }
  pause() { this.paused = true; }
  addEventListener() {}
  removeEventListener() {}
}
const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
class FakeContext {
  currentTime = 0;
  destination = {};
  createOscillator() { oscillators++; return { type: '', frequency: param(), connect: (n: unknown) => n, start() {}, stop() {} }; }
  createGain() { return { gain: param(), connect: (n: unknown) => n }; }
  createBiquadFilter() { return { type: '', Q: param(), frequency: param(), connect: (n: unknown) => n }; }
}

beforeEach(() => {
  played.length = 0;
  oscillators = 0;
  vi.stubGlobal('window', { Audio: FakeAudio, setTimeout, clearTimeout });
  vi.stubGlobal('AudioContext', FakeContext);
  const store = new Map<string, string>(); // the mute switch's storage, fresh each test
  vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } });
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('the raid countdown and Calm Audio', () => {
  it('a tick is a synthesized knock; Calm Audio drops the ticks and softens only the raid alert', () => {
    let calm = false;
    const audio = createAudio(() => calm);
    audio.start();
    audio.tick();
    expect(oscillators).toBe(2); // the woodblock and its overtone, no file
    audio.stinger('raid-incoming');
    expect(played.at(-1)).toEqual({ src: expect.stringContaining('raid-incoming'), volume: 1 });
    calm = true; // the run's switch (Options), read as each sound plays
    audio.tick();
    expect(oscillators).toBe(2);
    audio.stinger('raid-incoming');
    expect(played.at(-1)!.volume).toBe(CALM_RAID_VOLUME);
    audio.stinger('rank-up');
    expect(played.at(-1)).toEqual({ src: expect.stringContaining('rank-up'), volume: 1 });
    calm = false;
    audio.stinger('raid-incoming');
    audio.tick();
    expect([played.at(-1)!.volume, oscillators]).toEqual([1, 4]);
  });

  it('muted, nothing plays', () => {
    const audio = createAudio();
    audio.start();
    audio.toggle(); // mute
    const before = played.length;
    audio.tick();
    audio.stinger('raid-incoming');
    expect([oscillators, played.length]).toEqual([0, before]);
  });
});
