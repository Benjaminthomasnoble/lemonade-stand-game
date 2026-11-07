import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearSave, DAWN_SLOTS, dawnsOf, loadDawn, loadDawnSlot, loadGame, loadLeaderboard, loadSlot, onSaveTrouble, recordScore, SAVE_SLOTS,
  saveDawn, saveGame, saveSlot, saveUnreadable, slotList,
} from './save.ts';
import {
  migrateSave, newGame, openStands, simulateRestOfDay, sleepUntilDawn, startNight, successScore, tickMinute, type GameState,
} from './sim/economy.ts';

/** localStorage in memory; `full` makes every write fail the way a full (or blocked) store does. */
const memoryStorage = () => {
  const store = new Map<string, string>();
  const io = { full: false };
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { if (io.full) throw new DOMException('full', 'QuotaExceededError'); store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  });
  return { store, io };
};
const run = (id: string, settings: Parameters<typeof newGame>[1] = {}) => {
  const s = newGame(7, settings);
  s.runId = id;
  return s;
};
const onDay = (s: GameState, day: number) => { s.day = day; return s; };
const json = (s: GameState | null) => JSON.parse(JSON.stringify(s));
/** The same run, as saved: loading fills the optional fields a new game leaves out (an empty alert feed, say). */
const asSaved = (s: GameState) => json(migrateSave(json(s)));

describe('the current game', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('a save in business hours resumes where it was, and the day plays out the same', () => {
    memoryStorage();
    const s = run('a');
    openStands(s);
    for (let i = 0; i < 150; i++) tickMinute(s);
    expect(saveGame(s)).toBe(true);
    const back = loadGame()!;
    expect(back.phase).toBe('open');
    expect(back.minute).toBe(s.minute);
    expect(back.today.customers).toBe(s.today.customers);
    simulateRestOfDay(s);
    simulateRestOfDay(back);
    expect(asSaved(back)).toEqual(asSaved(s));
  });

  it('a save in the night resumes there too, and the same dawn comes', () => {
    memoryStorage();
    const s = run('a');
    openStands(s);
    simulateRestOfDay(s);
    startNight(s);
    for (let i = 0; i < 200 && s.phase === 'night'; i++) tickMinute(s);
    expect(s.phase).toBe('night');
    saveGame(s);
    const back = loadGame()!;
    expect(back.phase).toBe('night');
    expect(back.minute).toBe(s.minute);
    sleepUntilDawn(s);
    sleepUntilDawn(back);
    expect(back.day).toBe(s.day);
    expect(asSaved(back)).toEqual(asSaved(s));
  });

  it('a save that will not read is kept aside and reported, never dropped', () => {
    const { store } = memoryStorage();
    store.set('lemonade-stand-wars/save/v1', '{"cash": 12, "broken');
    expect(loadGame()).toBeNull();
    expect(saveUnreadable()).toBe(true);
    const kept = [...store.entries()].find(([k]) => k.includes('unreadable'));
    expect(kept?.[1]).toBe('{"cash": 12, "broken');
    saveGame(run('new'));
    expect([...store.values()]).toContain('{"cash": 12, "broken'); // a new run's save goes in beside it
  });

  it('a full store is reported once, and again only after a save has worked', () => {
    const { io } = memoryStorage();
    const trouble = vi.fn();
    onSaveTrouble(trouble);
    const s = run('a');
    expect(saveGame(s)).toBe(true);
    io.full = true;
    expect(saveGame(s)).toBe(false);
    expect(saveGame(s)).toBe(false);
    saveDawn(s);
    expect(trouble).toHaveBeenCalledTimes(1);
    io.full = false;
    expect(saveGame(s)).toBe(true);
    io.full = true;
    saveGame(s);
    expect(trouble).toHaveBeenCalledTimes(2);
    onSaveTrouble(() => {});
  });

  it('blocked storage never throws', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => { throw new Error('blocked'); } });
    const s = run('a');
    expect(() => { saveGame(s); saveDawn(s); saveSlot(s, 0); clearSave(); }).not.toThrow();
    expect(loadGame()).toBeNull();
    expect(slotList().manual).toEqual([null, null, null]);
  });
});

describe('dawn autosaves', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('the last three dawns are kept: each new one overwrites the oldest', () => {
    memoryStorage();
    const s = run('a');
    for (const day of [1, 2, 3, 4, 5]) saveDawn(onDay(s, day));
    expect(slotList().dawn.map((d) => d?.day).sort()).toEqual([3, 4, 5]);
    expect(dawnsOf('a').map((d) => d.info.day)).toEqual([5, 4, 3]); // newest first
    expect(loadDawn('a')!.day).toBe(5);
    const third = dawnsOf('a')[2];
    expect(loadDawn('a', third.slot)!.day).toBe(3);
    expect(DAWN_SLOTS).toBe(3);
  });

  it('a dawn played again (after a reload) overwrites its own copy, not an older dawn', () => {
    memoryStorage();
    const s = run('a');
    for (const day of [1, 2, 3]) saveDawn(onDay(s, day));
    const again = loadDawn('a', dawnsOf('a')[1].slot)!; // back to day 2
    again.cash += 50;
    saveDawn(again);
    expect(dawnsOf('a').map((d) => d.info.day).sort()).toEqual([1, 2, 3]);
    expect(loadDawn('a')!.cash).toBe(s.cash + 50); // the newest dawn is the replayed day 2
  });

  it('each slot shows its day, rank, Success Score, mode and difficulty', () => {
    memoryStorage();
    const s = run('a', { mode: 'sandbox', difficulty: 'laidback' });
    saveDawn(onDay(s, 4));
    const d = slotList().dawn.find(Boolean)!;
    expect(d).toMatchObject({ runId: 'a', day: 4, rank: s.rank, score: successScore(s), mode: 'sandbox', difficulty: 'laidback', phase: 'prep' });
  });

  it('only this run’s dawns come back after a loss', () => {
    memoryStorage();
    saveDawn(onDay(run('a'), 1));
    saveDawn(onDay(run('b'), 1));
    saveDawn(onDay(run('a'), 2));
    expect(dawnsOf('a').map((d) => d.info.day)).toEqual([2, 1]);
    expect(dawnsOf('b').map((d) => d.info.day)).toEqual([1]);
    expect(loadDawn('a', dawnsOf('b')[0].slot)).toBeNull(); // another run's dawn is not this run's reload
    expect(loadDawnSlot(dawnsOf('b')[0].slot)!.runId).toBe('b'); // but the Saves list can load it
    expect(dawnsOf(undefined)).toEqual([]);
  });

  it('Ironman and lost runs write no dawn; Ironman never reloads one', () => {
    const { store } = memoryStorage();
    const iron = run('iron', { ironman: true });
    saveDawn(iron);
    const lost = run('lost');
    lost.outcome = { result: 'lost', how: 'runout', day: 9 };
    saveDawn(lost);
    expect(slotList().dawn).toEqual([null, null, null]);
    store.clear();
    store.set('lemonade-stand-wars/dawn/v2/0', JSON.stringify(iron)); // an Ironman dawn from anywhere still never loads
    expect(dawnsOf('iron')).toHaveLength(1);
    expect(loadDawn('iron')).toBeNull();
  });

  it('the single dawn copy from before becomes the first of the three', () => {
    const { store } = memoryStorage();
    const s = onDay(run('a'), 6);
    store.set('lemonade-stand-wars/dawn/v1', JSON.stringify(s));
    expect(dawnsOf('a').map((d) => d.info.day)).toEqual([6]);
    expect(store.has('lemonade-stand-wars/dawn/v1')).toBe(false);
    expect(loadDawn('a')!.day).toBe(6);
  });

  it('a lost or broken slot list is read back from the slots themselves', () => {
    const { store } = memoryStorage();
    const s = run('a');
    for (const day of [1, 2]) saveDawn(onDay(s, day));
    saveSlot(onDay(s, 2), 1);
    const key = [...store.keys()].find((k) => k.includes('slots'))!;
    store.set(key, '{broken');
    expect(dawnsOf('a').map((d) => d.info.day)).toEqual([2, 1]);
    expect(slotList().manual[1]?.day).toBe(2);
    store.delete(key);
    expect(dawnsOf('a').map((d) => d.info.day)).toEqual([2, 1]);
  });
});

describe('manual slots', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('save and load at any time, mid-day included', () => {
    memoryStorage();
    const s = run('a');
    openStands(s);
    for (let i = 0; i < 90; i++) tickMinute(s);
    expect(saveSlot(s, 2)).toBe(true);
    expect(slotList().manual.map((m) => m?.minute ?? null)).toEqual([null, null, s.minute]);
    const back = loadSlot(2)!;
    expect(back.phase).toBe('open');
    expect(asSaved(back)).toEqual(asSaved(s));
    expect(saveSlot(s, SAVE_SLOTS)).toBe(false);
    expect(loadSlot(-1)).toBeNull();
    expect(loadSlot(0)).toBeNull();
  });

  it('Ironman keeps its single save: no manual slots', () => {
    memoryStorage();
    expect(saveSlot(run('a', { ironman: true }), 0)).toBe(false);
    expect(slotList().manual).toEqual([null, null, null]);
  });

  it('New Game drops the current game and keeps every slot', () => {
    memoryStorage();
    const s = run('a');
    saveGame(s);
    saveDawn(s);
    saveSlot(s, 0);
    clearSave();
    expect(loadGame()).toBeNull();
    expect(loadSlot(0)!.runId).toBe('a');
    expect(dawnsOf('a')).toHaveLength(1);
  });
});

describe('the leaderboard', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('a Custom run keeps its sliders for its tag; a preset run has none', () => {
    memoryStorage();
    recordScore(run('c', { difficulty: 'custom', custom: { raids: 1.2, notice: 10, respectDays: 2, bustOnly: true, cookieJar: 'always' } }));
    recordScore(run('p', { difficulty: 'cutthroat' }));
    const board = loadLeaderboard();
    expect(board.find((e) => e.runId === 'c')).toMatchObject({ difficulty: 'custom', custom: { raids: 1.2, notice: 10, respectDays: 2, bustOnly: true, cookieJar: 'always' } });
    expect(board.find((e) => e.runId === 'p')!.custom).toBeUndefined();
  });
});
