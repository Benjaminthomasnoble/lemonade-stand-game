// Saves live on the player's device. localStorage is plenty for one run;
// the spec's bigger maps can move this to IndexedDB behind the same API.
// Three things are kept: the current game, the last dawn (for a reload after
// a loss, never in Ironman) and the local Peak Success Score leaderboard.
import { migrateSave, type GameState, type Settings } from './sim/economy.ts';

const KEY = 'lemonade-stand-wars/save/v1';
const DAWN_KEY = 'lemonade-stand-wars/dawn/v1';
const BOARD_KEY = 'lemonade-stand-wars/leaderboard/v1';
const BOARD_SIZE = 10;

function read(key: string): GameState | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? migrateSave(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function write(key: string, s: GameState): void {
  try { localStorage.setItem(key, JSON.stringify(s)); } catch { /* storage full or blocked */ }
}

export const loadGame = () => read(KEY);
export const saveGame = (s: GameState) => write(KEY, s);

/** The dawn autosave: written at each new Morning Prep, unless the run is Ironman. */
export function saveDawn(s: GameState): void {
  if (s.settings.ironman || s.outcome?.result === 'lost') return;
  write(DAWN_KEY, s);
}
export function loadDawn(runId?: string): GameState | null {
  const s = read(DAWN_KEY);
  return s && s.runId === runId && !s.settings.ironman ? s : null;
}

export function clearSave(): void {
  try { localStorage.removeItem(KEY); localStorage.removeItem(DAWN_KEY); } catch { /* ignore */ }
}

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
