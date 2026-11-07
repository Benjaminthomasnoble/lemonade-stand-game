// Saves live on the player's device (spec: Saves: "Autosave every dawn (3
// rotating) plus manual slots. Every save carries a format version and migrates
// forward. Ironman keeps a single save for leaderboard runs"). localStorage keeps
// the current game (saved through the day and the night too, so any day resumes
// mid-day), the last three dawns, the manual slots, a small index of what each
// slot holds, and the local Peak Success Score leaderboard. The spec's bigger
// maps can move this to IndexedDB behind the same API. A save that won't read is
// kept aside and reported, never dropped; a full store is reported too.
import { migrateSave, successScore, type GameState, type Settings } from './sim/economy.ts';

const KEY = 'lemonade-stand-wars/save/v1';
const OLD_DAWN_KEY = 'lemonade-stand-wars/dawn/v1'; // the single dawn copy from before the rotating three
const DAWN_KEY = (i: number) => `lemonade-stand-wars/dawn/v2/${i}`;
const SLOT_KEY = (i: number) => `lemonade-stand-wars/slot/v1/${i}`;
const INDEX_KEY = 'lemonade-stand-wars/slots/v1';
const UNREADABLE_KEY = 'lemonade-stand-wars/unreadable/v1';
const BOARD_KEY = 'lemonade-stand-wars/leaderboard/v1';
const BOARD_SIZE = 10;
/** Rotating dawn autosaves: the last three dawns can be loaded. */
export const DAWN_SLOTS = 3;
/** Manual save slots. */
export const SAVE_SLOTS = 3; // placeholder: spec gap (the spec gives no slot count)

/** What a slot holds, for the Saves list (read without loading the save itself). */
export interface SlotInfo {
  runId: string;
  day: number;
  minute: number;
  phase: GameState['phase'];
  rank: number;
  score: number;
  mode: Settings['mode'];
  difficulty: Settings['difficulty'];
  seq: number; // order written: the lowest dawn is the oldest
  date: string;
}
export interface Slots { dawn: (SlotInfo | null)[]; manual: (SlotInfo | null)[] }
interface Index extends Slots { seq: number }

// ---------- storage, guarded: blocked or full storage never throws ----------

let trouble: (() => void) | null = null;
let failing = false;
let unreadable = false;
/** Called once when a save fails to write (storage full or blocked), and again only after one has worked. */
export function onSaveTrouble(f: () => void): void { trouble = f; }
/** The current game was in storage but would not read: it was kept aside (UNREADABLE_KEY), not dropped. */
export const saveUnreadable = () => unreadable;

function get(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function put(key: string, text: string): boolean {
  try {
    localStorage.setItem(key, text);
    failing = false;
    return true;
  } catch {
    if (!failing) trouble?.();
    failing = true;
    return false;
  }
}
function drop(key: string): void {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}
function parse(raw: string | null): GameState | null {
  if (!raw) return null;
  try { return migrateSave(JSON.parse(raw)); } catch { return null; }
}

// ---------- the current game ----------

export function loadGame(): GameState | null {
  const raw = get(KEY);
  const s = parse(raw);
  if (raw && !s) {
    unreadable = true;
    if (get(UNREADABLE_KEY) !== raw) put(UNREADABLE_KEY, raw);
  }
  return s;
}
export const saveGame = (s: GameState): boolean => put(KEY, JSON.stringify(s));

/** New Game: the current game goes; every slot stays (other runs' saves are theirs). */
export function clearSave(): void { drop(KEY); }

// ---------- slots ----------

const isInfo = (v: unknown): v is SlotInfo => !!v && typeof v === 'object' && typeof (v as SlotInfo).day === 'number' && typeof (v as SlotInfo).seq === 'number';
const info = (s: GameState, seq: number, date = new Date().toISOString().slice(0, 10)): SlotInfo => ({
  runId: s.runId ?? '', day: s.day, minute: s.minute, phase: s.phase, rank: s.rank, score: successScore(s),
  mode: s.settings.mode, difficulty: s.settings.difficulty, seq, date,
});

function index(): Index {
  let x: Partial<Index> | null = null;
  try {
    const p: unknown = JSON.parse(get(INDEX_KEY) ?? 'null');
    if (p && typeof p === 'object') x = p as Partial<Index>;
  } catch { /* a broken index: rebuilt from the slots below */ }
  const ix: Index = x ? {
    seq: typeof x.seq === 'number' ? x.seq : 0,
    dawn: Array.from({ length: DAWN_SLOTS }, (_, i) => (Array.isArray(x.dawn) && isInfo(x.dawn[i]) ? x.dawn[i] : null)),
    manual: Array.from({ length: SAVE_SLOTS }, (_, i) => (Array.isArray(x.manual) && isInfo(x.manual[i]) ? x.manual[i] : null)),
  } : rebuildIndex();
  // The one dawn copy from before the rotating three becomes the first of them.
  const old = get(OLD_DAWN_KEY);
  if (old !== null) {
    const s = parse(old);
    if (s && !ix.dawn[0] && put(DAWN_KEY(0), old)) { ix.dawn[0] = info(s, ++ix.seq); writeIndex(ix); }
    drop(OLD_DAWN_KEY);
  }
  return ix;
}
const writeIndex = (ix: Index) => put(INDEX_KEY, JSON.stringify(ix));

/** No index (or a broken one): read what each slot holds, so no save goes missing from the list. Older days count as
 * older dawns. */
function rebuildIndex(): Index {
  const read = (key: (i: number) => string, n: number) => Array.from({ length: n }, (_, i) => parse(get(key(i))));
  const dawn = read(DAWN_KEY, DAWN_SLOTS), manual = read(SLOT_KEY, SAVE_SLOTS);
  const order = [...dawn, ...manual].flatMap((s) => (s ? [s] : [])).sort((a, b) => a.day - b.day || a.minute - b.minute);
  const at = (s: GameState | null) => (s ? info(s, order.indexOf(s) + 1, '') : null);
  const ix: Index = { seq: order.length, dawn: dawn.map(at), manual: manual.map(at) };
  if (order.length) writeIndex(ix);
  return ix;
}

/** What every slot holds right now (the Saves list and the reload-after-a-loss picks). */
export function slotList(): Slots {
  const { dawn, manual } = index();
  return { dawn, manual };
}

/** The dawn autosave, written as each Morning Prep begins: the oldest of the three goes, or the slot holding this
 * run's same dawn (a day played again after a reload). Never in Ironman, never for a lost run. */
export function saveDawn(s: GameState): void {
  if (s.settings.ironman || s.outcome?.result === 'lost') return;
  const ix = index();
  let i = ix.dawn.findIndex((d) => !!d && d.runId === (s.runId ?? '') && d.day === s.day);
  if (i < 0) i = ix.dawn.findIndex((d) => !d);
  if (i < 0) i = ix.dawn.reduce((o, d, k) => (d!.seq < ix.dawn[o]!.seq ? k : o), 0);
  if (!put(DAWN_KEY(i), JSON.stringify(s))) return;
  ix.dawn[i] = info(s, ++ix.seq);
  writeIndex(ix);
}

/** This run's dawns, newest first: what a lost run (outside Ironman) can go back to. */
export function dawnsOf(runId?: string): { slot: number; info: SlotInfo }[] {
  return index().dawn.flatMap((d, slot) => (d && runId && d.runId === runId ? [{ slot, info: d }] : [])).sort((a, b) => b.info.seq - a.info.seq);
}

/** A dawn to go back to: the given slot, or this run's newest. Only this run's, and never an Ironman run's. */
export function loadDawn(runId?: string, slot?: number): GameState | null {
  const slots = slot !== undefined ? [slot] : dawnsOf(runId).map((d) => d.slot);
  for (const i of slots) {
    const s = parse(get(DAWN_KEY(i)));
    if (s && s.runId === runId && !s.settings.ironman) return s;
  }
  return null;
}

/** Any dawn slot, from any run (the Saves list). */
export const loadDawnSlot = (slot: number): GameState | null => parse(get(DAWN_KEY(slot)));

/** Save to a manual slot, mid-day included. Ironman keeps its single save: no slots. */
export function saveSlot(s: GameState, slot: number): boolean {
  if (s.settings.ironman || slot < 0 || slot >= SAVE_SLOTS) return false;
  const ix = index();
  if (!put(SLOT_KEY(slot), JSON.stringify(s))) return false;
  ix.manual[slot] = info(s, ++ix.seq);
  return writeIndex(ix);
}
export const loadSlot = (slot: number): GameState | null => (slot >= 0 && slot < SAVE_SLOTS ? parse(get(SLOT_KEY(slot))) : null);

// ---------- the local leaderboard ----------

export interface ScoreEntry {
  runId: string;
  peak: number;
  peakDay: number;
  day: number;
  mode: Settings['mode'];
  difficulty: Settings['difficulty'];
  peaceful: boolean;
  ironman: boolean;
  result?: 'won' | 'lost';
  date: string;
}

export function loadLeaderboard(): ScoreEntry[] {
  try {
    const raw = localStorage.getItem(BOARD_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? (list as ScoreEntry[]).filter((e) => e && typeof e.peak === 'number') : [];
  } catch {
    return [];
  }
}

/** Keep this run's best on the local leaderboard (one row per run, the top 10 runs). */
export function recordScore(s: GameState): void {
  if (!s.runId) return;
  const entry: ScoreEntry = {
    runId: s.runId, peak: s.peakScore, peakDay: s.peakDay ?? s.day, day: s.day, mode: s.settings.mode,
    difficulty: s.settings.difficulty, peaceful: s.settings.peaceful, ironman: s.settings.ironman, result: s.outcome?.result,
    date: new Date().toISOString().slice(0, 10),
  };
  const list = loadLeaderboard().filter((e) => e.runId !== s.runId);
  list.push(entry);
  list.sort((a, b) => b.peak - a.peak);
  try { localStorage.setItem(BOARD_KEY, JSON.stringify(list.slice(0, BOARD_SIZE))); } catch { /* ignore */ }
}
