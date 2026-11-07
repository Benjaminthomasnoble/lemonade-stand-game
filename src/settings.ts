// Player options (spec: Player experience, Settings and Accessibility), kept on
// this device across runs. The raid-warning switch is the exception: it lives
// with the run (Settings.raidPause), since its default follows the difficulty.
// Every read and write is guarded: blocked or full storage just means defaults.
import { raidPauses, type AlertKind, type GameState } from './sim/economy.ts';

const KEY = 'lemonade-stand-wars/options/v1';

/** The major alerts with a switch of their own here (raid warnings: see Settings.raidPause). */
export type PauseKind = 'delivery' | 'vip' | 'red' | 'perk';

export interface Options {
  autoPause: boolean; // master switch: major alerts auto-pause
  pause: Record<PauseKind, boolean>; // one switch per major alert type
  quietNights: boolean; // quiet nights run at 3× until an alert
  autoContinue: boolean; // Morning Prep opens the stands by itself
  textSize: 100 | 125 | 150; // percent
  reducedMotion: boolean;
}

export const DEFAULT_OPTIONS: Options = {
  autoPause: true,
  pause: { delivery: true, vip: true, red: true, perk: true },
  quietNights: true,
  autoContinue: false,
  textSize: 100,
  reducedMotion: false,
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
  return {
    autoPause: bool(raw.autoPause, d.autoPause),
    pause: { delivery: bool(p.delivery, d.pause.delivery), vip: bool(p.vip, d.pause.vip), red: bool(p.red, d.pause.red), perk: bool(p.perk, d.pause.perk) },
    quietNights: bool(raw.quietNights, d.quietNights),
    autoContinue: bool(raw.autoContinue, d.autoContinue),
    textSize: TEXT_SIZES.includes(raw.textSize as Options['textSize']) ? raw.textSize! : d.textSize,
    reducedMotion: bool(raw.reducedMotion, d.reducedMotion),
  };
}

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
