// Keys on the Options screen (spec: "Every key is remappable, and every action
// also works by mouse or touch alone"): every binding in one list, each a button
// that waits for the next key pressed. A key that already does something swaps
// over (settings.ts bindKey). Clicks go through the HUD's one listener.
import { KEYS, type KeyAction, type Options } from '../settings.ts';

const LABEL: Record<KeyAction, string> = {
  pause: 'Pause', speed1: 'Speed 1×', speed2: 'Speed 2×', speed3: 'Speed 3×',
  panUp: 'Pan up', panLeft: 'Pan left', panDown: 'Pan down', panRight: 'Pan right', turnLeft: 'Turn left', turnRight: 'Turn right',
  gull: 'Gull Flight', bugle: 'Morning Bugle', ledger: 'Ledger', stand: 'Stand panel', crew: 'Crew roster', planner: 'Raid Planner',
  corkboard: 'Rivals Corkboard', orders: 'Order Book', registry: 'Land Registry', rank: 'Rank and Perks', goals: "Lottie's Goals",
};

/** A key as printed on it: KeyW → W, Digit1 → 1, ArrowUp → ↑. */
export function keyName(code: string): string {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad\d$/.test(code)) return `Num ${code.slice(6)}`;
  const arrows: Record<string, string> = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
  return arrows[code] ?? code.replace(/(Left|Right)$/, '');
}

export const keyLabel = (a: KeyAction) => LABEL[a];

/** A button's tooltip with its keys as the player has them now: "Turn the view left (Q)". */
export const withKey = (title: string, o: Options, ...actions: KeyAction[]) => `${title} (${actions.map((a) => keyName(o.keys[a])).join(', ')})`;

/** The Keys section: `waiting` is the action whose next key press is being caught. */
export function keysPanel(o: Options, waiting: KeyAction | null): string {
  const row = (a: KeyAction) => `<button class="cl-b tiny ${waiting === a ? 'go' : 'ghost'}" data-action="remap" data-key="${a}" data-testid="key-${a}" title="${LABEL[a]}: click, then press a key (Esc keeps it)">${LABEL[a]} <b>${waiting === a ? '…' : keyName(o.keys[a])}</b></button>`;
  const changed = (Object.keys(KEYS) as KeyAction[]).some((a) => o.keys[a] !== KEYS[a]);
  return `<div class="cl-row wrap"><span class="cl-label">Keys</span>${(Object.keys(KEYS) as KeyAction[]).map(row).join('')}
    ${changed ? '<button class="cl-link" data-action="resetKeys" title="Every key back to how it came">Reset keys</button>' : ''}</div>`;
}
