// Saves live on the player's device. localStorage is plenty for one stand;
// the spec's bigger maps can move this to IndexedDB behind the same API.
import { isGameState, type GameState } from './sim/economy.ts';

const KEY = 'lemonade-stand-wars/save/v1';

export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data: unknown = JSON.parse(raw);
    return isGameState(data) ? data : null;
  } catch {
    return null;
  }
}

export function saveGame(s: GameState): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage full or blocked */ }
}

export function clearSave(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
