import { afterEach, describe, expect, it, vi } from 'vitest';
import { autoPauses, DEFAULT_OPTIONS, loadOptions, saveOptions, type Options } from './settings.ts';
import { newGame } from './sim/economy.ts';

const memoryStorage = () => {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } });
  return store;
};

describe('options', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('fall back to the defaults when storage is missing, blocked or broken', () => {
    expect(loadOptions()).toEqual(DEFAULT_OPTIONS); // no localStorage here at all
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); } });
    expect(loadOptions()).toEqual(DEFAULT_OPTIONS);
    expect(() => saveOptions(DEFAULT_OPTIONS)).not.toThrow();
    vi.stubGlobal('localStorage', { getItem: () => '{not json', setItem: () => {} });
    expect(loadOptions()).toEqual(DEFAULT_OPTIONS);
  });

  it('keep what was saved and fill in anything missing or malformed', () => {
    const store = memoryStorage();
    saveOptions({ ...DEFAULT_OPTIONS, autoPause: false, autoContinue: true, textSize: 125, pause: { ...DEFAULT_OPTIONS.pause, vip: false } });
    expect(loadOptions()).toEqual({ ...DEFAULT_OPTIONS, autoPause: false, autoContinue: true, textSize: 125, pause: { ...DEFAULT_OPTIONS.pause, vip: false } });
    const key = [...store.keys()][0];
    store.set(key, JSON.stringify({ quietNights: 'yes', textSize: 80, pause: null, reducedMotion: true }));
    expect(loadOptions()).toEqual({ ...DEFAULT_OPTIONS, reducedMotion: true });
  });

  it('auto-pause: the master switch, the run’s raid switch, one switch for each major alert', () => {
    const o: Options = { ...DEFAULT_OPTIONS, pause: { ...DEFAULT_OPTIONS.pause } };
    const classic = newGame(1), cutthroat = newGame(1, { difficulty: 'cutthroat' });
    expect(autoPauses(o, classic, 'raid')).toBe(true);
    expect(autoPauses(o, cutthroat, 'raid')).toBe(false); // Cutthroat counts down at fight speed instead
    cutthroat.settings.raidPause = true;
    expect(autoPauses(o, cutthroat, 'raid')).toBe(true);
    for (const kind of ['delivery', 'vip', 'red', 'perk'] as const) {
      expect(autoPauses(o, classic, kind)).toBe(true);
      o.pause[kind] = false;
      expect(autoPauses(o, classic, kind)).toBe(false);
    }
    expect(autoPauses(o, classic, 'soldout')).toBe(false); // small calls never pause
    o.autoPause = false;
    expect(autoPauses(o, classic, 'raid')).toBe(false);
  });
});
