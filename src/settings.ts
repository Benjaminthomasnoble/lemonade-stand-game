// Player options (spec: Player experience, Settings and Accessibility), kept on
// this device across runs. The raid-warning switch is the exception: it lives
// with the run (Settings.raidPause), since its default follows the difficulty.
// Every read and write is guarded: blocked or full storage just means defaults.
import { raidPauses, type AlertKind, type GameState } from './sim/economy.ts';

const KEY = 'lemonade-stand-wars/options/v1';

/** The major alerts with a switch of their own here (raid warnings: see Settings.raidPause), and full-screen paper. */
export type PauseKind = 'delivery' | 'vip' | 'red' | 'perk' | 'screens';

/** The ten paper menus (src/ui/menus.ts). */
export type MenuId = 'bugle' | 'ledger' | 'stand' | 'crew' | 'planner' | 'corkboard' | 'orders' | 'registry' | 'rank' | 'goals';
export const MENU_IDS: MenuId[] = ['bugle', 'ledger', 'stand', 'crew', 'planner', 'corkboard', 'orders', 'registry', 'rank', 'goals'];

/** Every key and what it does by default (KeyboardEvent.code). Each one can be remapped in Options. The spec names
 * W A S D, Q and E, Space and 1-3; the menu letters are ours. */
export const KEYS = {
  pause: 'Space', speed1: 'Digit1', speed2: 'Digit2', speed3: 'Digit3',
  panUp: 'KeyW', panLeft: 'KeyA', panDown: 'KeyS', panRight: 'KeyD', turnLeft: 'KeyQ', turnRight: 'KeyE', gull: 'KeyG',
  bugle: 'KeyB', ledger: 'KeyL', stand: 'KeyT', crew: 'KeyC', planner: 'KeyP', corkboard: 'KeyK', orders: 'KeyO',
  registry: 'KeyM', rank: 'KeyR', goals: 'KeyJ',
} as const;
export type KeyAction = keyof typeof KEYS;
export const defaultKeys = (): Record<KeyAction, string> => ({ ...KEYS });

export interface Options {
  autoPause: boolean; // master switch: major alerts auto-pause
  pause: Record<PauseKind, boolean>; // one switch per major alert type
  quietNights: boolean; // quiet nights run at 3× until an alert
  autoContinue: boolean; // Morning Prep opens the stands by itself
  textSize: 100 | 125 | 150; // percent
  reducedMotion: boolean;
  captions: boolean; // a caption line for voices and phone calls
  celsius: boolean; // temperatures in °C (°F by default)
  keys: Record<KeyAction, string>; // remapped keys
}

export const DEFAULT_OPTIONS: Options = {
  autoPause: true,
  pause: { delivery: true, vip: true, red: true, perk: true, screens: true },
  quietNights: true,
  autoContinue: false,
  textSize: 100,
  reducedMotion: false,
  captions: true,
  celsius: false,
  keys: defaultKeys(),
};
export const TEXT_SIZES: Options['textSize'][] = [100, 125, 150];
/** Auto-continue: Morning Prep waits this long (real seconds) before the stands open by themselves. */
export const AUTO_CONTINUE_SECONDS = 5; // placeholder: spec gap (the spec only says the toggle auto-continues)

const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);

/** Read the options, filling anything missing or malformed with its default. */
export function loadOptions(): Options {
  let raw: Partial<Options> = {};
  try {
    const text = localStorage.getItem(KEY);
    const parsed: unknown = text ? JSON.parse(text) : null;
    if (parsed && typeof parsed === 'object') raw = parsed as Partial<Options>;
  } catch { /* blocked or corrupt storage: defaults */ }
  const d = DEFAULT_OPTIONS;
  const p = (raw.pause ?? {}) as Partial<Options['pause']>;
  const k = (raw.keys && typeof raw.keys === 'object' ? raw.keys : {}) as Partial<Options['keys']>;
  const keys = defaultKeys();
  for (const a of Object.keys(keys) as KeyAction[]) if (typeof k[a] === 'string' && k[a]) keys[a] = k[a]!;
  return {
    autoPause: bool(raw.autoPause, d.autoPause),
    pause: {
      delivery: bool(p.delivery, d.pause.delivery), vip: bool(p.vip, d.pause.vip), red: bool(p.red, d.pause.red), perk: bool(p.perk, d.pause.perk),
      screens: bool(p.screens, d.pause.screens),
    },
    quietNights: bool(raw.quietNights, d.quietNights),
    autoContinue: bool(raw.autoContinue, d.autoContinue),
    textSize: TEXT_SIZES.includes(raw.textSize as Options['textSize']) ? raw.textSize! : d.textSize,
    reducedMotion: bool(raw.reducedMotion, d.reducedMotion),
    captions: bool(raw.captions, d.captions),
    celsius: bool(raw.celsius, d.celsius),
    keys,
  };
}

/** Bind a key to an action. A key already doing something else swaps over, so no action is ever left without one. */
export function bindKey(o: Options, action: KeyAction, code: string): void {
  const other = (Object.keys(o.keys) as KeyAction[]).find((a) => a !== action && o.keys[a] === code);
  if (other) o.keys[other] = o.keys[action];
  o.keys[action] = code;
}
/** The action a key does now, if any. */
export const actionFor = (o: Options, code: string): KeyAction | undefined => (Object.keys(o.keys) as KeyAction[]).find((a) => o.keys[a] === code);
/** A temperature as the player reads it: °F, or °C = (°F − 32) × 5/9, rounded. */
export const tempText = (o: Pick<Options, 'celsius'>, f: number) => (o.celsius ? `${Math.round(((f - 32) * 5) / 9)}°C` : `${f}°F`);

export function saveOptions(o: Options): void {
  try { localStorage.setItem(KEY, JSON.stringify(o)); } catch { /* storage full or blocked */ }
}

/** Does this kind of alert pause the game? Raid warnings follow the run's switch, the rest these options. */
export function autoPauses(o: Options, s: GameState, kind: AlertKind): boolean {
  if (!o.autoPause) return false;
  switch (kind) {
    case 'raid': return raidPauses(s.settings);
    case 'delivery': case 'vip': case 'red': case 'perk': return o.pause[kind];
    default: return false;
  }
}
