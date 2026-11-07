// Custom difficulty on the New Game screen (spec: Difficulty: "Custom | Any value
// from x0.5 to x1.5 | Any value from Laid Back's to Cutthroat's | Busted-only on
// or off | Always, once per act or never"): a stepper for raids, minimum notice
// and the Respect cooldown, a Busted-only switch and the Cookie Jar's three
// settings. Clicks go through the HUD's one listener (data-action="pick").
import { CUSTOM_RANGE, customDefaults, DIFFICULTY, type CustomDifficulty, type Difficulty, type Settings } from '../sim/economy.ts';

const JAR: { v: CustomDifficulty['cookieJar']; label: string; tip: string }[] = [
  { v: 'always', label: 'Always', tip: 'Lottie always bails you out: no game over' },
  { v: 'perAct', label: 'Once an act', tip: 'Once per act (once a season outside the campaign)' },
  { v: 'never', label: 'Never', tip: 'No Cookie Jar' },
];
type Stepped = 'raids' | 'notice' | 'respectDays';
const SHOW: Record<Stepped, (v: number) => string> = { raids: (v) => `×${v.toFixed(1)}`, notice: (v) => `${v} min`, respectDays: (v) => `${v} day${v === 1 ? '' : 's'}` };
const LABEL: Record<Stepped, [string, string]> = {
  raids: ['Raids', 'How often rivals raid you, × Classic'],
  notice: ['Notice', 'The least warning a raid gives, in game minutes'],
  respectDays: ['Respect', 'Days a beaten rival stays away'],
};

/** A short tag for a Custom run (the leaderboard): ×1.2, 10 min, 2 days, Busted-only, the Jar. */
export function difficultyLabel(d: Difficulty, c?: CustomDifficulty): string {
  if (d !== 'custom') return DIFFICULTY[d]?.label ?? d;
  const v = { ...customDefaults(), ...c };
  return `Custom ×${v.raids.toFixed(1)} · ${v.notice}m · ${v.respectDays}d${v.bustOnly ? ' · Busted' : ''} · Jar ${JAR.find((j) => j.v === v.cookieJar)?.label.toLowerCase() ?? v.cookieJar}`;
}

export function customPanel(st: Settings): string {
  const c = { ...customDefaults(), ...st.custom };
  const step = (k: Stepped) => {
    const [lo, hi] = CUSTOM_RANGE[k];
    return `<span class="cl-label" title="${LABEL[k][1]}">${LABEL[k][0]}</span>
      <button class="cl-b tiny ghost" data-action="pick" data-key="custom.${k}" data-value="-1" ${c[k] <= lo ? 'disabled' : ''} aria-label="Less">−</button>
      <b data-testid="custom-${k}">${SHOW[k](c[k])}</b>
      <button class="cl-b tiny ghost" data-action="pick" data-key="custom.${k}" data-value="1" ${c[k] >= hi ? 'disabled' : ''} aria-label="More">+</button>`;
  };
  return `<div class="cl-row wrap" data-testid="custom">${step('raids')}${step('notice')}${step('respectDays')}</div>
    <div class="cl-row wrap"><button class="cl-toggle${c.bustOnly ? ' on' : ''}" data-action="pick" data-key="custom.bustOnly" aria-pressed="${c.bustOnly}" title="On: a lost raid only Busts your stand (a 10% repair). Off: it's Wrecked."><i></i>Busted-only</button>
      <span class="cl-label" title="Lottie's Cookie Jar bails you out of the red">Cookie Jar</span>${JAR.map((j) => `<button class="cl-b tiny ${c.cookieJar === j.v ? 'go' : 'ghost'}" data-action="pick" data-key="custom.cookieJar" data-value="${j.v}" title="${j.tip}">${j.label}</button>`).join('')}</div>`;
}

/** A New Game pick on the Custom panel: a stepper's −/+, the Busted-only switch or the Jar. */
export function pickCustom(st: Settings, key: string, value?: string): void {
  const c = (st.custom = { ...customDefaults(), ...st.custom });
  if (key === 'bustOnly') c.bustOnly = !c.bustOnly;
  else if (key === 'cookieJar' && JAR.some((j) => j.v === value)) c.cookieJar = value as CustomDifficulty['cookieJar'];
  else if (key === 'raids' || key === 'notice' || key === 'respectDays') {
    const [lo, hi, by] = CUSTOM_RANGE[key];
    c[key] = Math.round(Math.min(hi, Math.max(lo, c[key] + Math.sign(Number(value) || 0) * by)) * 10) / 10;
  }
}
