// Story scenes (spec "How the story is told"): about 20 short, skippable
// campaign scenes. A story beat queues a scene, and the game plays it at the
// next lull: Morning Prep, never during a fight replay, a VIP pickup or a raid
// warning, and at most one a game day (extra scenes roll to later days).
// Skipping posts the one-line recap. Boss exit scenes also play in Sandbox and
// Endless. Pure state, saved with the run so a reload never replays a scene.
import type { RivalId } from './balance.ts';
import type { GameState } from './economy.ts';
import { gameOver, isEndless } from './modes.ts';
import { CALL_PRIORITY, LINES, phoneCall } from './phone.ts';

export interface SceneLine { who: string; text: string; at: number }
export interface SceneDef {
  /** Acted out in the world under this id (src/world/scenes.ts); otherwise it plays as captions. */
  world?: string;
  /** How long the captions run when there's no world scene to wait for (never over SCENE_MAX_SECONDS). */
  seconds: number;
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
  steward: {
    world: 'steward', seconds: 14,
    lines: [
      { who: 'Steward', text: 'A reminder. From Mrs. Sourwood.', at: 4.2 },
      { who: 'Lottie', text: 'Well. Guess she remembers me.', at: 6.6 },
      { who: 'Lottie', text: "Kid, we're gonna need a fence.", at: 12 },
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
  s.scenes ??= { seen: [], queue: [] };
  const sc = s.scenes;
  if (sc.seen.includes(id) || sc.playing?.id === id || sc.queue.some((q) => q.id === id)) return false;
  sc.queue.push(data ? { id, data } : { id });
  return true;
}

export function playingScene(s: GameState): Scene | null {
  const p = s.scenes?.playing;
  return p ? sceneDef(p.id, p.data) : null;
}

/** A scene is waiting and the sim is at a lull: Morning Prep, the run going on, no scene yet today. */
export function sceneReady(s: GameState): boolean {
  const sc = s.scenes;
  const over = gameOver(s) || (s.outcome?.result === 'won' && !isEndless(s));
  return !!sc && !sc.playing && sc.queue.length > 0 && s.phase === 'prep' && sc.lastDay !== s.day && !over;
}

/** Start the next queued scene (the UI calls this once the screen is quiet too). */
export function beginScene(s: GameState): Scene | null {
  if (!sceneReady(s)) return null;
  const sc = s.scenes!;
  while (sc.queue.length) {
    const next = sc.queue.shift()!;
    const def = sceneDef(next.id, next.data);
    if (!def) continue;
    sc.playing = { id: next.id, day: s.day, ...(next.data ? { data: next.data } : {}) };
    sc.lastDay = s.day;
    return def;
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
  const def = sceneDef(p.id, p.data);
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
