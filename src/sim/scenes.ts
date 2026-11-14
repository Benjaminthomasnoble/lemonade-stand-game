// Story scenes (spec "How the story is told"): about 20 short, skippable
// campaign scenes. A story beat queues a scene, and the game plays it at the
// next lull: Morning Prep, never during a fight replay, a VIP pickup or a raid
// warning, and at most one a game day (extra scenes roll to later days).
// Skipping posts the one-line recap. Boss exit scenes also play in Sandbox and
// Endless. Pure state, saved with the run so a reload never replays a scene.
import { BRAND_TIERS, type RivalId } from './balance.ts';
import type { GameState } from './economy.ts';
import { gameOver, isEndless } from './modes.ts';
import { CALL_PRIORITY, LINES, phoneCall } from './phone.ts';
import { grandkid } from './grandkid.ts';
import { isExitScene, victoryStage } from './victory.ts';

/**
 * Townsfolk the world stages by speaker (src/world/scenes.ts walks them on in their clay look): queue a scene with
 * `speaker` set, and they walk on to its plot, say every line that isn't Lottie's, and walk off. No world code needed.
 */
export const SPEAKERS = { marisol: 'Marisol', skip: 'Skip Larkin', benny: 'Benny Buzz', budd: 'Sheriff Budd', fontaine: 'Mayor Fontaine' } as const;
export type Speaker = keyof typeof SPEAKERS;

export interface SceneLine { who: string; text: string; at: number }
export interface SceneDef {
  /** Acted out in the world under this id (src/world/scenes.ts); otherwise it plays as captions. */
  world?: string;
  /** A townsperson who acts it out in the world (see SPEAKERS), at `plot`: Lottie's Corner if not given. */
  speaker?: Speaker;
  plot?: string;
  /** The last game day it may start: a scene still queued after that leaves unplayed, with no recap (Day 1's opening). */
  until?: number;
  /** How long the captions run when there's no world scene to wait for (never over SCENE_MAX_SECONDS). */
  seconds: number;
  /** {kid} in a line (or the recap) is the Grandkid's first name. */
  lines: SceneLine[];
  /** Posted when the scene is skipped. */
  recap: string;
  /** Grandkid quick replies: flavor only, they never change the outcome. */
  replies?: string[];
  /** Boss exit scenes play in every mode; every other scene is campaign only. */
  exit?: boolean;
  /** A boss phones once the scene is over, watched or skipped (a story call, one of the scripted lines). */
  call?: { who: RivalId; line: keyof typeof LINES };
}
export type Scene = SceneDef & { id: string };
type SceneData = Partial<SceneDef>;
export interface SceneState {
  seen: string[];
  queue: { id: string; data?: SceneData }[];
  playing?: { id: string; day: number; data?: SceneData; reply?: string };
  lastDay?: number; // the game day the last scene played
}

/** No scene runs longer than this (spec: under 60 seconds). */
export const SCENE_MAX_SECONDS = 60;

export const SCENES: Record<string, SceneDef> = {
  // Day 1, the first Morning Prep: Lottie hands over the table, her pitcher and her 3 pages (spec Act 1, Day 1).
  opening: {
    seconds: 21, until: 1,
    lines: [
      { who: 'Lottie', text: '{kid}! My folding table. My pitcher. And three pages.', at: 0.5 },
      { who: 'Lottie', text: "Classic, Pink and Mint: all Vera didn't steal.", at: 4.6 },
      { who: 'Lottie', text: 'And a spare lemon. I keep one in my cardigan.', at: 8.8 },
      { who: 'Lottie', text: 'When life gives you lemons, you take the whole town.', at: 13 },
      { who: 'Lottie', text: 'Now price a cup, and sell me a pitcher.', at: 17.2 },
    ],
    replies: ['Okay, Grandma. One town, coming up.', 'Why a spare lemon?'],
    recap: 'Lottie handed you her folding table, her pitcher and her 3 recipe pages: Classic, Pink and Mint.',
  },
  steward: {
    world: 'steward', seconds: 14,
    lines: [
      { who: 'Steward', text: 'A reminder. From Mrs. Sourwood.', at: 4.2 },
      { who: 'Lottie', text: 'Well. Guess she remembers me.', at: 6.6 },
      { who: 'Lottie', text: "And Brock's boys come for the till tonight.", at: 9.4 },
      { who: 'Lottie', text: "Kid, we're gonna need a fence. Today.", at: 12 },
    ],
    replies: ['Hey! My table!', 'Who was that?'],
    recap: 'A Sourwood Steward knocked over the table "as a reminder." Lottie wants a fence.',
    call: { who: 'sourwood', line: 'veraSteward' }, // Vera follows up: the light Sourwood presence of Act 1
  },
  dex: {
    world: 'dex', seconds: 14,
    lines: [
      { who: 'Dex', text: 'Heard you could use some muscle, Miss Lottie.', at: 4.2 },
      { who: 'Lottie', text: "You're hired. Pay's in lemonade.", at: 7.4 },
      { who: 'Dex', text: 'Nobody touches the Corner.', at: 10 },
    ],
    replies: ['Welcome aboard!', 'Paid in lemonade?'],
    recap: 'Dex Moody joins the crew, paid in lemonade. Station him for the night.',
  },
  // Buying the first brand tier (the Day 6 lesson): Benny Buzz paints your first sign.
  benny: {
    speaker: 'benny', seconds: 17,
    lines: [
      { who: SPEAKERS.benny, text: "You're not selling lemonade. You're selling sunshine in a cup!", at: 3.6 },
      { who: 'Lottie', text: 'He talks in slogans, kid. Just nod.', at: 7.6 },
      { who: SPEAKERS.benny, text: 'Today, a sign. Tomorrow, a jingle on 101.5!', at: 10.6 },
    ],
    replies: ['Looks great!', 'Sunshine in a cup?'],
    recap: `Benny Buzz painted your first sign: +${Math.round(BRAND_TIERS[0].traffic * 100)}% foot traffic at every stand.`,
  },
  // Week 2's land lesson: Skip Larkin stands on an open Old Town corner (story.ts fills in the plot and its price).
  skip: {
    speaker: 'skip', seconds: 17,
    lines: [
      { who: SPEAKERS.skip, text: "Kid, they're not making any more land. I checked.", at: 3.6 },
      { who: SPEAKERS.skip, text: 'An Old Town corner, fair crowds and all!', at: 7.4 },
      { who: 'Lottie', text: "Old Town. Now we're cooking.", at: 11 },
    ],
    replies: ['How much?', "Let's buy it!"],
    recap: 'Skip Larkin found you an Old Town corner. The Land Registry is open.',
  },
  // For other lanes' moments, keyed by speaker (play with { plot } to stand them somewhere else): a Citation...
  budd: {
    speaker: 'budd', seconds: 15,
    lines: [
      { who: SPEAKERS.budd, text: "I'm not mad. I'm writing you a Citation.", at: 3.6 },
      { who: SPEAKERS.budd, text: 'Is that Mint?', at: 7 },
      { who: 'Lottie', text: "On the house, Dolores. Not the Citation, I'm guessing.", at: 9.4 },
    ],
    replies: ['Sorry, Sheriff.', 'Want a cup?'],
    recap: 'Sheriff Budd wrote you a Citation for a daytime raid.',
  },
  // ...and one of Vera's fines from Town Hall.
  fontaine: {
    speaker: 'fontaine', seconds: 15,
    lines: [
      { who: SPEAKERS.fontaine, text: 'I represent all of Citrine Bay.', at: 3.6 },
      { who: SPEAKERS.fontaine, text: "Some of it more than others. Here's your fine.", at: 6.8 },
      { who: 'Lottie', text: "Vera's errand boy. Pay it, kid. We'll remember.", at: 10.4 },
    ],
    recap: "Mayor Fontaine delivered one of Vera's fines.",
  },
  // Act 3's night flight (src/sim/beats.ts): the morning after Juni's first Night Shift on you (a Cold Brew Sabotage),
  // Captain Squawk tells what he saw at 3 a.m. (captions: the world's Gull Flight isn't staged for it), Lottie teaches
  // your own Sabotage (crew.ts canSabotage), then Juni calls.
  nightFlight: {
    seconds: 17,
    lines: [
      { who: 'Captain Squawk', text: 'SQUAWK! Three a.m.! Beanies at your stand!', at: 0.5 },
      { who: 'Captain Squawk', text: 'Tiny paper cups! Tiny mustaches! Baristas!', at: 4.6 },
      { who: 'Lottie', text: 'Cold Brew. I should have smelled the oat milk.', at: 8.8 },
      { who: 'Lottie', text: 'Two can play, kid. Send a Lookout or a Sneaky one to spoil theirs.', at: 12.2 },
    ],
    recap: 'Captain Squawk caught Cold Brew baristas in beanies at your stand at 3 a.m. Sabotage theirs back: it takes a Lookout or a Sneaky guard.',
    call: { who: 'coldbrew', line: 'juniAct3' },
  },
  // A record day's closing (story.ts recordDay): Marisol Vega brings the Ledger round. story.ts puts in the real percentage.
  marisol: {
    speaker: 'marisol', seconds: 14,
    lines: [
      { who: SPEAKERS.marisol, text: "Profit's up 40 percent.", at: 3.6 },
      { who: SPEAKERS.marisol, text: "Please don't celebrate by buying another goose.", at: 6.8 },
      { who: 'Lottie', text: 'Marisol keeps our books, kid. Mind her.', at: 10.4 },
    ],
    replies: ['Just one goose?', 'Thanks, Marisol!'],
    recap: 'Marisol Vega brought the Ledger round: a record day.',
  },
  // Act 5's tea at the Manor (src/sim/beats.ts): Vera offers to buy you out. Every reply is a no, and none changes a thing.
  tea: {
    seconds: 18,
    lines: [
      { who: 'Vera', text: 'Tea at the Manor, dear. Do sit.', at: 0.5 },
      { who: 'Vera', text: "I'd like to buy Lottie's Lemonade.", at: 4.4 },
      { who: 'Vera', text: "Name your price. Your grandmother needn't know.", at: 8.6 },
      { who: 'Vera', text: 'Pity. My friends will be less polite.', at: 13.6 },
    ],
    replies: ['No', 'No, thank you', "Absolutely not, ma'am."],
    recap: "Vera had you to tea at Sourwood Manor and offered to buy Lottie's Lemonade. You said no.",
  },
};

const DEX = 'Dex Moody';

export function migrateScenes(s: GameState): void {
  if (!s.scenes) {
    // A run from before the scene queue: don't replay what it has already been through.
    const seen: string[] = [];
    if (s.day > 5) seen.push('steward');
    if (s.guards.some((g) => g.name === DEX)) seen.push('dex');
    s.scenes = { seen, queue: [] };
  }
  // A scene cut off by a reload (or still marked as playing at the next dawn) counts as seen and leaves its recap.
  if (s.scenes.playing) endScene(s, true);
  // The first sign was painted before Benny's scene existed: don't play it now.
  if (s.brandTier >= 1 && !queued(s, 'benny')) s.scenes.seen.push('benny');
  dropStale(s);
}

/** Has this scene played, or is it playing or waiting to? (Each plays once a run.) */
export const queued = (s: GameState, id: string) => !!s.scenes && (s.scenes.seen.includes(id) || s.scenes.playing?.id === id || s.scenes.queue.some((q) => q.id === id));
const stale = (s: GameState, q: { id: string; data?: SceneData }) => {
  const def = sceneDef(q.id, q.data);
  return !def || (def.until !== undefined && s.day > def.until);
};
/** A scene whose day has passed leaves the queue unplayed (marked seen, no recap). */
function dropStale(s: GameState): void {
  const sc = s.scenes!;
  for (const q of sc.queue.filter((e) => stale(s, e))) if (!sc.seen.includes(q.id)) sc.seen.push(q.id);
  sc.queue = sc.queue.filter((e) => !stale(s, e));
}

export function sceneDef(id: string, data?: SceneData): Scene | null {
  const def = SCENES[id];
  if (!def && !(data?.lines && data.recap)) return null;
  const sc: Scene = { ...(def ?? { seconds: 20, lines: [], recap: '' }), ...data, id };
  sc.seconds = Math.min(SCENE_MAX_SECONDS, Math.max(1, sc.seconds));
  return sc;
}

/**
 * Queue a scene to play at the next lull (other systems call this for their beats). Each scene plays once a run;
 * outside the campaign only boss exits play. Returns false if it won't play.
 */
export function playScene(s: GameState, id: string, data?: SceneData): boolean {
  const def = sceneDef(id, data);
  if (!def) return false;
  if (!def.exit && s.settings.mode !== 'campaign') return false;
  if (def.until !== undefined && s.day > def.until) return false;
  s.scenes ??= { seen: [], queue: [] };
  if (queued(s, id)) return false;
  s.scenes.queue.push(data ? { id, data } : { id });
  return true;
}

export function playingScene(s: GameState): Scene | null {
  const p = s.scenes?.playing;
  return p ? named(s, sceneDef(p.id, p.data)) : null;
}

/** Lottie calls the Grandkid by name: {kid} in a scene's lines and recap is their first name (src/sim/grandkid.ts). */
function named(s: GameState, sc: Scene | null): Scene | null {
  if (!sc) return null;
  const first = grandkid(s).first;
  const fill = (t: string) => t.replace(/\{kid\}/g, () => first);
  return { ...sc, lines: sc.lines.map((l) => ({ ...l, text: fill(l.text) })), recap: fill(sc.recap) };
}

/**
 * A scene is waiting and the sim is at a lull: Morning Prep, the run going on, no scene yet today. The Domination show
 * (src/sim/victory.ts) plays the last exits first, the campaign's finale too, at whatever hour, before the Bay paints.
 */
export function sceneReady(s: GameState): boolean {
  const sc = s.scenes;
  if (victoryStage(s) === 'scenes') return !!sc && !sc.playing && sc.queue.some((q) => isExitScene(q) && !stale(s, q));
  const over = gameOver(s) || (s.outcome?.result === 'won' && !isEndless(s));
  return !!sc && !sc.playing && sc.queue.some((q) => !stale(s, q)) && s.phase === 'prep' && sc.lastDay !== s.day && !over;
}

/** Start the next queued scene (the UI calls this once the screen is quiet too). */
export function beginScene(s: GameState): Scene | null {
  if (!sceneReady(s)) return null;
  const sc = s.scenes!;
  dropStale(s);
  const show = victoryStage(s) === 'scenes'; // the show plays only the exits
  while (sc.queue.length) {
    const at = show ? sc.queue.findIndex(isExitScene) : 0;
    if (at < 0) break;
    const [next] = sc.queue.splice(at, 1);
    const def = sceneDef(next.id, next.data);
    if (!def) continue;
    sc.playing = { id: next.id, day: s.day, ...(next.data ? { data: next.data } : {}) };
    sc.lastDay = s.day;
    return named(s, def);
  }
  return null;
}

/** The scene is over. A skipped one posts its one-line recap. */
export function endScene(s: GameState, skipped: boolean): void {
  const sc = s.scenes;
  const p = sc?.playing;
  if (!sc || !p) return;
  delete sc.playing;
  if (!sc.seen.includes(p.id)) sc.seen.push(p.id);
  const def = named(s, sceneDef(p.id, p.data));
  if (skipped && def?.recap) s.news.push(def.recap);
  if (def?.call) phoneCall(s, def.call.who, LINES[def.call.line], { priority: CALL_PRIORITY.story });
}

/** The Grandkid's quick reply: it shows, and changes nothing else. */
export function replyScene(s: GameState, text: string): void {
  const p = s.scenes?.playing;
  if (p && !p.reply && sceneDef(p.id, p.data)?.replies?.includes(text)) p.reply = text;
}

/** The caption showing `t` seconds into a scene. */
export function sceneLine(sc: Scene, t: number): SceneLine | null {
  let line: SceneLine | null = null;
  for (const l of sc.lines) if (l.at <= t) line = l;
  return line;
}

/** Dawn: queue the day's story scenes (campaign only; playScene drops the rest). The Steward's comes with story.ts's visit. */
export function scenesAtDawn(s: GameState): void {
  if (s.guards.some((g) => g.name === DEX)) playScene(s, 'dex'); // Dex turns up the day he joins
}
