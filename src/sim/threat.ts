// The raids-on-you rules (spec: Threat; Raids on the player; Anti-frustration guarantees), called from crew.ts's
// planNight and fightRaid: the scripted tutorial raid that always bounces.
// Pure and seeded, like the rest of the sim.
import type { BattleInput, BattleResult, Fighter } from './combat.ts';
import type { GameState } from './economy.ts';
import { guardFighter, type Guard, type Raid } from './crew.ts';

/** Lottie's first guard, the tutorial raid's wall. */
export const DEX = 'Dex Moody';
/** Brock's call on the day of the first raid (spec: Act 2, First call). */
export const TUTORIAL_CALL = 'Bro. Your stand is in my sun.';

// ---------- the tutorial raid ----------

/** Dex as he fights for the tutorial raid: himself, or (let go since) the lanky teen in his first-day kit. */
function dexFighter(s: GameState, raid: Raid, night: boolean): Fighter {
  const dex = s.guards.find((g) => g.name === DEX);
  const standIn: Guard = { id: 'dex-moody', name: DEX, trait: 'Loyal', level: 1, xp: 0, weapon: 'fists', gear: 'none', post: raid.target, outUntil: 0, fee: 0 };
  return guardFighter(dex ?? standIn, 'def', night);
}

/** battleInput's defenders: the tutorial raid always finds Dex at the stand, wherever he's posted (moved off after the
 * warning, out of action, or let go), so it bounces off him and the fence. Every other raid fights who's there. */
export function withDex(s: GameState, raid: Raid, defenders: Fighter[], night: boolean): Fighter[] {
  if (!raid.tutorial) return defenders;
  const dex = s.guards.find((g) => g.name === DEX);
  if (dex && defenders.some((f) => f.id === dex.id)) return defenders;
  return [dexFighter(s, raid, night), ...defenders];
}

/** fightRaid's tutorial branch: the first raid on you ends repelled whatever the dice did (with Dex there it all but
 * always does on its own), the stand untouched. */
export function tutorialBounce(input: BattleInput, res: BattleResult): void {
  if (res.outcome === 'repelled') return;
  res.winner = 'def';
  res.outcome = 'repelled';
  res.standHpLeft = input.standHp;
}
