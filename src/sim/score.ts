// The Success Score as it moves (spec "Success Score and ranks"). The score updates every game minute, so:
// - a rank-up happens on the spot, the moment the score crosses a threshold (the RANK UP! line brings the confetti and
//   the Rank Up stinger, src/main.ts; the next Bugle runs the headline, src/sim/media.ts; Threat follows the rank);
// - the Peak Success Score is the best the run ever reaches, with the day it was set (the high score);
// - the Rank badge's striped "invested" sliver is the 25% of building money the score hasn't earned back yet: each
//   building bought (a stand, a fence or gadget, a facility, a specialization, a Clubhouse) dips the score by the
//   quarter of its cost that Net Worth leaves out, and score gains fill the dip back in. Real losses (raids, lapsed
//   plots, wages, upkeep, interest) never count.
// scoreCheck runs wherever the score can change: each game minute, open (storyMinute) or at night (tickMinute), after
// every tap (storyAfterAct: purchases and buyouts), at dawn once land values, VIP pickups, loans, Fire Sales and dawn
// events have moved it (actAtDawn, ahead of the Economic win check), and at closing; the peak also whenever land or
// rivals change hands (checkVictory), so TARGET HIT never sits beside a lower peak. Pure.
import { BUILDING_VALUE_SHARE, HIRE_RANK, RANKS } from './balance.ts';
import { rankFor, successScore, type GameState, type SimEvent } from './economy.ts';
import { refreshRecruits } from './crew.ts';
import { dealTips, tipAlert } from './perks.ts';
import type { Alert } from './alerts.ts';
import { grandkid } from './grandkid.ts';
import { PLOTS } from './map.ts';

/** The score's books between looks (saved with the story): the score last seen, the building dip not yet earned
 * back, and the building money on each plot of yours when last seen (so a plot that changes hands brings no dip). */
export interface ScoreBooks { last: number; dip: number; built: Record<string, number> }

/** What Net Worth leaves out of a building's cost: the dip a purchase makes. */
const DIP_SHARE = 1 - BUILDING_VALUE_SHARE;

const builtNow = (s: GameState): Record<string, number> => {
  const built: Record<string, number> = {};
  for (const p of PLOTS) if (s.plots[p.id]?.owner === 'player') built[p.id] = s.plots[p.id].invested;
  return built;
};

/** The dip: new building money on plots that were yours at the last look adds its quarter; score gains take it back. */
function trackDip(s: GameState, score: number): void {
  if (!s.story) return;
  const b = s.story.score;
  if (!b) { s.story.score = { last: score, dip: 0, built: builtNow(s) }; return; } // the first look: nothing owed yet
  let spent = 0;
  const built = builtNow(s);
  for (const [id, now] of Object.entries(built)) {
    const was = b.built[id];
    if (was !== undefined && now > was) spent += now - was;
  }
  const gain = score - b.last;
  b.dip = Math.max(0, Math.round((b.dip - Math.max(0, gain) + DIP_SHARE * spent) * 100) / 100);
  b.last = score;
  b.built = built;
}

/** A building that came free (Lottie's table on your side lot): this plot's money now is where its dip starts. */
export function builtFree(s: GameState, plotId: string): void {
  const b = s.story?.score;
  if (b && s.plots[plotId]?.owner === 'player') b.built[plotId] = s.plots[plotId].invested;
}

/** Rank up on the spot (ranks are never lost): the headline, a hand of Lottie's Tips for each rank crossed, and the
 * Hiring Hall at its rank. */
function rankUp(s: GameState, score: number): void {
  const r = rankFor(score).rank;
  if (r <= s.rank) return;
  const was = s.rank;
  s.rank = r;
  s.news.push(`RANK UP! ${grandkid(s).first} is now a ${RANKS[r - 1].title}`);
  for (let k = was + 1; k <= r; k++) dealTips(s, k); // perks.ts: pick 1 of 3 at each rank-up
  if (was < HIRE_RANK && r >= HIRE_RANK) refreshRecruits(s, true); // the Hiring Hall opens (Dex comes on his own day, not with a rank)
}

/** The Peak Success Score, the best the run ever reaches, and the day it was set. */
export function samplePeak(s: GameState, score = successScore(s)): void {
  if (score > s.peakScore) { s.peakScore = score; s.peakDay = s.day; }
}

/** Wherever the score can change: the invested dip, the peak (and its day), and a rank-up on the spot. Returns the
 * alert of a hand of Lottie's Tips that just came up to pick from (perks.ts), if one did. */
export function scoreCheck(s: GameState): Alert | null {
  const score = successScore(s);
  trackDip(s, score);
  samplePeak(s, score);
  rankUp(s, score);
  return tipAlert(s);
}

/** The clock's look (each business minute, each night step): a hand's alert is a SimEvent, so it stops the skips. */
export function scoreMinute(s: GameState): SimEvent[] {
  const a = scoreCheck(s);
  return a ? [{ type: 'alert', alert: a }] : [];
}

/** The Rank badge's striped sliver, in dollars: the building dip still owed, never more than the drop from the peak. */
export function investedSliver(s: GameState): number {
  const dip = s.story?.score?.dip ?? 0;
  return Math.max(0, Math.min(dip, s.peakScore - successScore(s)));
}

/** Saves: books that don't read right start over at the next look, with no dip owed. */
export function migrateScore(s: GameState): void {
  const b = s.story?.score as Partial<ScoreBooks> | undefined;
  const num = (x: unknown) => typeof x === 'number' && Number.isFinite(x);
  if (b !== undefined && (!b || typeof b !== 'object' || !num(b.last) || !num(b.dip) || b.dip! < 0 || !b.built || typeof b.built !== 'object'
    || Object.values(b.built).some((v) => !num(v)))) delete s.story!.score;
}
