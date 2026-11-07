// The campaign story (spec "Narrative"): five acts that advance on their
// climaxes, never on rank or day alone (days and ranks are targets). Act 1
// closes with the Day 14 Summer Fair Taste-Off, win or lose; Acts 2 to 4 with
// the fall of the Blend Shack, the Grindhouse and FizzCo Tower; Act 5 with
// Sourwood Manor and Domination, then the Epilogue (Endless Summer). A boss who
// falls early exits early: an act whose climax rival is already gone moves on
// at the next dawn. Sandbox and Endless have no acts. This module also holds
// the lessons (Act 1's one system a day) and the story's hooks into the day:
// dawn, every few minutes, closing. Pure, like the rest of the sim.
import { ACT_BY_RANK, ACTS, LESSON_DAY, type RivalId } from './balance.ts';
import { festivalDays, tasteOffResult } from './calendar.ts';
import { LOTTIES_CORNER, PLOT_BY_ID } from './map.ts';
import { alert } from './alerts.ts';
import type { GameState } from './economy.ts';
import { checkGoals, DEX_LESSON, goalsAtDawn, migrateGoals, skipGoal } from './goals.ts';
import { migratePhone, phoneAtAct, phoneAtClose, phoneCheck } from './phone.ts';
import { migrateScenes, scenesAtDawn } from './scenes.ts';

export interface StoryState {
  act: number; // 1-5
  since: number; // the day the act began
  banner?: number; // the dawn whose Bugle leads with the new act
  epilogue?: number; // the day the Epilogue began (Endless Summer after the Domination win)
}

/** The rival whose fall closes each act (Act 1 closes with the Summer Fair instead). */
export const ACT_CLIMAX: readonly (RivalId | null)[] = [null, 'blenders', 'coldbrew', 'fizzco', 'sourwood'];
/** The Bugle's line for each act's first morning. */
const ACT_LINES = [
  '',
  'Brock wants his sun back.',
  'Someone keeps spoiling the stock.',
  'FizzCo eyes the fields and the docks.',
  'Sourwood Manor is watching.',
];

/** The campaign tells the story; Sandbox and Endless have no acts or scenes. */
export const hasStory = (s: GameState) => s.settings.mode === 'campaign';
/** Lessons: Lottie teaches one system a day, and its buttons appear that day (on unless switched off at New Game). */
export const lessonsOn = (s: GameState) => s.settings.lessons !== false;
/** Has this system's lesson come? With lessons off, buttons follow rank unlocks alone. */
export const taught = (s: GameState, lesson: keyof typeof LESSON_DAY) => !lessonsOn(s) || s.day >= LESSON_DAY[lesson];
/** Today is the guards lesson: Dex turns up unposted, and stationing him is the goal. */
export const dexLesson = (s: GameState) => lessonsOn(s) && s.day === LESSON_DAY.crew;

/** The current act: the story's in the campaign, read from rank everywhere else. */
export function storyAct(s: GameState): number {
  if (!hasStory(s) || !s.story) return ACT_BY_RANK[s.rank - 1] ?? ACTS.length;
  return s.story.act;
}

/** The day the current act began (campaign only), e.g. for the Syndicate forming two weeks into Act 5. */
export function actBegan(s: GameState): number | null {
  return hasStory(s) && s.story ? s.story.since : null;
}

/** Keep squeezing after the campaign's win: the Epilogue, Endless Summer, starts today. */
export function beginEpilogue(s: GameState): void {
  if (hasStory(s) && s.story && s.story.epilogue === undefined) s.story.epilogue = s.day;
}

/** Has the climax that closes this act happened? */
export function climaxDone(s: GameState, act: number): boolean {
  if (act === 1) return summerFairDone(s);
  const r = ACT_CLIMAX[act - 1];
  return !!r && !s.rivals[r].alive;
}

/**
 * The year-1 Summer Fair Taste-Off (Day 14), win or lose: judged at closing on the fair's last day (src/sim/calendar.ts).
 * A run whose fair passed without one (an older save) counts it done once the fair is over.
 */
export function summerFairDone(s: GameState): boolean {
  return !!tasteOffResult(s, 'summerFair', 1) || s.day > festivalDays('summerFair', 1).to;
}

function inferAct(s: GameState): number {
  let act = 1;
  while (act < ACTS.length && climaxDone(s, act)) act++;
  return act;
}

/** Fill in the story's parts of the save (new runs and older saves alike). Safe to call any time. */
export function migrateStory(s: GameState): void {
  if (!s.story || !(s.story.act >= 1 && s.story.act <= ACTS.length)) s.story = { act: inferAct(s), since: s.day }; // older saves: from which climaxes are behind them
  if (hasStory(s) && s.endlessSince !== undefined && s.story.epilogue === undefined) s.story.epilogue = s.endlessSince;
  migrateScenes(s);
  migratePhone(s);
  migrateGoals(s);
}

/** One act a dawn, so each climax gets its own morning. */
function advanceAct(s: GameState): void {
  const st = s.story!;
  if (!hasStory(s) || st.epilogue !== undefined || st.act >= ACTS.length || !climaxDone(s, st.act)) return;
  st.act++;
  st.since = s.day;
  st.banner = s.day;
  s.news.push(`ACT ${st.act}: ${ACTS[st.act - 1].toUpperCase()}! ${ACT_LINES[st.act - 1]}`);
  phoneAtAct(s, st.act);
}

/**
 * Lessons: Dex arrives unposted on Day 6 for the "station Dex" lesson; if nobody does by closing, he takes the Corner
 * himself, so the night is covered. That ticks the lesson off without Lottie's reward: nobody stationed him.
 */
function dexOnDuty(s: GameState): void {
  const dex = s.guards.find((g) => g.name === 'Dex Moody');
  if (!dex || dex.post || !dexLesson(s)) return;
  const home = [LOTTIES_CORNER, s.selected].find((id) => s.plots[id]?.owner === 'player' && s.plots[id].stand);
  if (!home) return;
  dex.post = home;
  skipGoal(s, DEX_LESSON);
  alert(s, { kind: 'note', text: `Dex: "Nobody posted me. I took ${home === LOTTIES_CORNER ? 'the Corner' : PLOT_BY_ID[home].name.replace(/ lot /, ' ')}."`, plot: home });
}

/** Dawn (one line in sleepUntilDawn): the act may turn, the day's goals and scenes arrive, bosses' moods are read. */
export function storyAtDawn(s: GameState): void {
  migrateStory(s);
  advanceAct(s);
  goalsAtDawn(s);
  scenesAtDawn(s);
  phoneCheck(s, true);
}

/** Every game minute while open (one line in tickMinute): goals tick off as they're met. */
export function storyMinute(s: GameState): void {
  if (s.minute % 10 !== 0) return;
  checkGoals(s);
  phoneCheck(s);
}

/** Closing time (one line in closeDay, after tonight's raids are planned): the day's goals, Dex's post, tonight's warning calls. */
export function storyAtClose(s: GameState): void {
  checkGoals(s);
  dexOnDuty(s);
  phoneAtClose(s);
}

/** After anything the player does (main.ts): a goal met by a purchase ticks off at once. */
export function storyAfterAct(s: GameState): void {
  checkGoals(s);
  phoneCheck(s);
}

/**
 * The morning's Bugle banner on the first day of a new act. Act 2's first morning yields to the Bugle's own line for
 * the Act 1 climax when you took Brock's Strawberry page ("FOLDING TABLE STUNS...", src/ui/calendar.ts).
 */
export function storyHeadline(s: GameState): [string, string] | null {
  const st = s.story;
  if (!hasStory(s) || !st || st.banner !== s.day || st.act < 2) return null;
  const fair = tasteOffResult(s, 'summerFair', 1);
  if (st.act === 2 && fair?.stake === 'strawberry' && fair.winner === 'player' && s.day === fair.day + 1) return null;
  return [`ACT ${st.act}!`, ACTS[st.act - 1]];
}

/** The dateline: which act the campaign is in. */
export function storyDateline(s: GameState): string {
  if (!hasStory(s)) return '';
  if (s.story?.epilogue !== undefined) return 'Epilogue';
  return `Act ${storyAct(s)}: ${ACTS[storyAct(s) - 1]}`;
}
