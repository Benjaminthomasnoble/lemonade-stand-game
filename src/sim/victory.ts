// The Domination show (spec "Game modes and winning": "Victory is a show you watch as the map turns yellow"; "The map
// paints itself yellow, then the ending plays"). A Domination win first waits for the screen: the fight on it, and the
// last boss's exit (the campaign's finale), which plays then at whatever hour it is. Then the whole Bay paints itself
// lemon yellow from Lottie's Corner, every plot (src/world/bay.ts reads bayPainted for the world's lemon wave and each
// plot's tile). Then the ending plays: the campaign's Beloved or Iron Pitcher front page with Lottie's last line, or the
// plain 'OWNS THE BAY' page (src/ui/ending.ts). Then the victory screen, with Keep squeezing. The stage rides on
// s.outcome; with none (an economic win, a loss, an older save) the victory screen is up at once. Pure: main.ts moves it
// on each frame with the real seconds, and whether the screen is free.
import { VICTORY_PAINT_SECONDS } from './balance.ts';
import type { GameState } from './economy.ts';

/** 'scenes': waiting on the fight and the exits; 'paint': the Bay turns yellow; 'ending': the ending's front page. */
export type VictoryStage = 'scenes' | 'paint' | 'ending';

/** The show's stage while it runs; none once it's over (the victory screen), and none for any other outcome. */
export const victoryStage = (s: GameState): VictoryStage | undefined => (s.outcome?.result === 'won' ? s.outcome.stage : undefined);

/** From the paint on, every plot of the Bay is lemon (src/world/bay.ts: the lemon wave, and each plot's tile). */
export const bayPainted = (s: GameState) => s.outcome?.result === 'won' && s.outcome.how === 'domination' && s.outcome.stage !== 'scenes';

/** A boss's exit scene, the campaign's finale too (src/sim/exits.ts). */
export const isExitScene = (q: { id: string; data?: { exit?: boolean } }) => q.id.startsWith('exit-') || !!q.data?.exit;
/** An exit still waiting, or playing. */
export const exitsWaiting = (s: GameState) => !!s.scenes && ((!!s.scenes.playing && isExitScene(s.scenes.playing)) || s.scenes.queue.some(isExitScene));

/**
 * Every frame (one line in main.ts): `free` when no fight, show or scene holds the screen; `dt` the real seconds since
 * the last frame. The exits played out, the paint starts; VICTORY_PAINT_SECONDS later, the ending. True when the stage
 * moved on (the world repaints, the game saves).
 */
export function victoryTick(s: GameState, free: boolean, dt: number): boolean {
  const o = s.outcome;
  if (o?.result !== 'won' || !o.stage) return false;
  if (o.stage === 'scenes') {
    if (!free || exitsWaiting(s)) return false;
    o.stage = 'paint';
    o.painted = 0;
    return true;
  }
  if (o.stage !== 'paint') return false;
  o.painted = (o.painted ?? 0) + dt;
  if (o.painted < VICTORY_PAINT_SECONDS) return false;
  o.stage = 'ending';
  delete o.painted;
  return true;
}

/** The ending's Continue, and Keep squeezing (modes.ts): the show is over, and the victory screen is up. */
export function endVictoryShow(s: GameState): void {
  if (!s.outcome) return;
  delete s.outcome.stage;
  delete s.outcome.painted;
}
