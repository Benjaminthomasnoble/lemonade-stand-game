// Raids on you over a campaign, per difficulty (balance-tables: "Simulated raids on you in a campaign (ten maps)":
// Laid Back 5–23, Classic 20–47, Cutthroat 41–77). Usage: node --experimental-strip-types tools/raid-campaign.ts [seeds] [--days]
//
// The campaign's shape is forced, so only the raid rules decide the count:
// - Ranks come on balance-tables' simulated Classic days (R2 4, R3 9, R4 19, R5 41, R6 58, R7 78, R8 104, R9 135), Ranks
//   5–9 at the difficulty's pace (×0.86 Laid Back, ×1.01 Cutthroat).
// - Each rival's HQ falls on its day at the same pace (the Blend Shack 42, the Grindhouse 61, Hollis Homestead 79,
//   FizzCo Tower 105), so the story's acts turn as they do in play and the Pact forms two weeks into Act 5 (the sim's rule).
// - The Big Squeeze is called the day after Rank 9; its 7 siege nights end the run.
// - Business days are skipped (each day goes straight to the Evening) unless --days, which plays them with nobody
//   tending the stand (slower; the rivals trade and bank their takings as in play).
// - Each night's raids on you are counted as planned (a raid on several plots once), then settled as if fought:
//   every one repelled (so Respect thins them: the raider sits out its Respect days) or none. The tutorial raid always
//   bounces. Delivery Raids (pickups only) and Truces (taken only by choice) don't come up.
import {
  callBigSqueeze, canCallBigSqueeze, CLOSE, difficulty, eliminate, hasBuilding, LOTTIES_CORNER, newGame, newStand, openStands, planNight,
  siegeDone, simulateRestOfDay, sleepUntilDawn, syndicateFormed, type Difficulty, type GameState, type Raid, type RivalId,
} from '../src/sim/economy.ts';

const seeds = Number(process.argv.find((a, i) => i > 1 && /^\d+$/.test(a)) ?? 6);
const fullDays = process.argv.includes('--days');

const PACE: Record<'laidback' | 'classic' | 'cutthroat', number> = { laidback: 0.86, classic: 1, cutthroat: 1.01 };
const SPEC: Record<keyof typeof PACE, [number, number]> = { laidback: [5, 23], classic: [20, 47], cutthroat: [41, 77] };
/** balance-tables' simulated Classic day for each rank. */
const RANK_DAY = [1, 4, 9, 19, 41, 58, 78, 104, 135];
/** The HQ falls on the reference map, in order. */
const FALLS: [RivalId, number][] = [['blenders', 42], ['coldbrew', 61], ['hollis', 79], ['fizzco', 105]];

type Phase = 'ranks 3-4' | 'ranks 5-6' | 'ranks 7-8' | 'pact' | 'siege';
const PHASES: Phase[] = ['ranks 3-4', 'ranks 5-6', 'ranks 7-8', 'pact', 'siege'];

function campaign(seed: number, diff: keyof typeof PACE, repelled: boolean) {
  const pace = PACE[diff];
  const dayOf = (rank: number) => (rank >= 5 ? Math.round(RANK_DAY[rank - 1] * pace) : RANK_DAY[rank - 1]);
  const rankOn = (day: number) => RANK_DAY.reduce((r, _, i) => (day >= dayOf(i + 1) ? i + 1 : r), 1);
  const s: GameState = newGame(seed, { mode: 'campaign', difficulty: diff as Difficulty });
  const count: Record<Phase, number> = { 'ranks 3-4': 0, 'ranks 5-6': 0, 'ranks 7-8': 0, pact: 0, siege: 0 };
  let first = 0;
  while (!siegeDone(s) && s.day < 220) {
    // Morning Prep: the forced rank, the day's HQ fall, the call; the stand kept standing and the books above water.
    s.rank = Math.max(s.rank, rankOn(s.day));
    for (const [id, day] of FALLS) if (s.day === Math.round(day * pace)) eliminate(s, id, 'hq');
    if (s.rank >= 9 && s.day > dayOf(9) && canCallBigSqueeze(s).ok) callBigSqueeze(s);
    if (!hasBuilding(s.plots[LOTTIES_CORNER])) s.plots[LOTTIES_CORNER].stand = newStand(1);
    s.cash = Math.max(s.cash, 2000);
    if (fullDays && openStands(s)) simulateRestOfDay(s); // closing plans the night
    else { s.phase = 'report'; s.minute = CLOSE; planNight(s); }
    const mine = s.raids.filter((r) => r.attacker !== 'player' && !r.delivery && s.plots[r.target]?.owner === 'player');
    const raids = new Set(mine.map((r) => r.group ?? r.id)).size;
    const phase: Phase = mine.some((r) => r.siege) ? 'siege' : syndicateFormed(s) ? 'pact' : s.rank >= 7 ? 'ranks 7-8' : s.rank >= 5 ? 'ranks 5-6' : 'ranks 3-4';
    count[phase] += raids;
    if (raids && !first) first = s.day;
    settle(s, mine, repelled);
    if (!sleepUntilDawn(s)) break;
  }
  return { count, first, end: s.day };
}

/** The night's raids on you, fought in name only: off the clock, with what a repelled one leaves behind (Respect). */
function settle(s: GameState, mine: Raid[], repelled: boolean) {
  s.raids = s.raids.filter((r) => !mine.includes(r));
  for (const r of mine) {
    if (r.tutorial) s.tutorialRaidDone = true; // the scripted first raid always bounces (threat.ts tutorialBounce)
    if (r.tutorial || repelled) s.rivals[r.attacker as RivalId].respectUntil = s.day + 1 + difficulty(s).respectDays;
  }
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
console.log(`Raids on you in a campaign, ${seeds} seeds${fullDays ? ', business days played' : ', business days skipped'}`);
for (const diff of Object.keys(PACE) as (keyof typeof PACE)[]) {
  for (const repelled of [true, false]) {
    const runs = Array.from({ length: seeds }, (_, i) => campaign(i + 1, diff, repelled));
    const totals = runs.map((r) => PHASES.reduce((a, p) => a + r.count[p], 0));
    const parts = PHASES.map((p) => `${p} ${mean(runs.map((r) => r.count[p])).toFixed(1)}`).join(', ');
    const [lo, hi] = SPEC[diff];
    console.log(`  ${diff.padEnd(9)} ${repelled ? 'all repelled' : 'none repelled'}: ${Math.min(...totals)}-${Math.max(...totals)}, mean ${mean(totals).toFixed(1)} (spec ${lo}-${hi}); first on day ${Math.min(...runs.map((r) => r.first))}-${Math.max(...runs.map((r) => r.first))}, siege over by day ${Math.max(...runs.map((r) => r.end))}`);
    console.log(`            by phase: ${parts}`);
  }
}
