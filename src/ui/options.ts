// The Options screen: plain switches for the spec's toggles (auto-pause and one
// switch per major alert, quiet nights, auto-continue Morning Prep, text size,
// less motion). Full-screen paper, so the game holds while it's open. Clicks
// go through the HUD's one listener (data-action="option").
import { raidPauses, type GameState } from '../sim/economy.ts';
import { TEXT_SIZES, type Options } from '../settings.ts';
import { lessonsOn } from '../sim/story.ts';

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const toggle = (key: string, on: boolean, label: string, tip: string) =>
  `<button class="cl-toggle${on ? ' on' : ''}" data-action="option" data-key="${key}" data-testid="opt-${key}" aria-pressed="${on}" title="${esc(tip)}"><i></i>${label}</button>`;

/** `saves`: the Saves panel (src/ui/saves.ts) and `keys` the key list (src/ui/keys.ts), at the foot of the screen. */
export function optionsScreen(o: Options, s: GameState, saves = '', keys = ''): string {
  // Each major alert has its own switch, a rank-up's hand of Lottie's Tips too.
  const each = o.autoPause ? `<div class="cl-row wrap">
      ${toggle('raidPause', raidPauses(s.settings), 'Raids on you', 'Raid warnings pause the game (this run). The last minutes before a raid run at fight speed.')}
      ${toggle('pause.delivery', o.pause.delivery, 'Delivery Raids', 'A raid on a VIP pickup pauses the game')}
      ${toggle('pause.vip', o.pause.vip, 'VIP first visits', "Each client's first chopper or ship stops the clock for the show")}
      ${toggle('pause.red', o.pause.red, 'In the Red', 'Morning Prep waits for you while you are In the Red')}
      ${toggle('pause.perk', o.pause.perk, "Lottie's tips", "A rank-up's three tips pause the game for your pick")}
      ${toggle('pause.screens', o.pause.screens, 'Full-screen menus', 'Menus, Options and New Game pause the clock. Space or a speed still runs it.')}
    </div>` : '';
  const sizes = TEXT_SIZES.map((t) => `<button class="cl-b tiny ${o.textSize === t ? 'go' : 'ghost'}" data-action="option" data-key="textSize" data-value="${t}" title="Text size ${t}%">${t}%</button>`).join('');
  return `<div class="cl-modal-bg"><div class="cl-card-big cl-setup" data-testid="options">
    <h1 class="cl-title">Options</h1>
    <div class="cl-more">
      ${toggle('autoPause', o.autoPause, 'Auto-pause on big alerts', 'Major alerts stop the clock. Each kind has its own switch.')}
      ${each}
      ${toggle('quietNights', o.quietNights, 'Quiet nights at 3×', 'From closing until an alert, the night runs at 3× by itself')}
      ${toggle('autoContinue', o.autoContinue, 'Start each day by itself', 'Morning Prep opens the stands after a moment. Big alerts still stop it.')}
      <div class="cl-row wrap"><span class="cl-label">Text</span>${sizes}</div>
      ${toggle('reducedMotion', o.reducedMotion, 'Less motion', 'Calmer HUD; no clay boil, shakes or lightning flashes')}
      ${toggle('captions', o.captions, 'Captions', 'Voices, the radio and phone calls, written out')}
      ${toggle('celsius', o.celsius, 'Temperatures in °C', 'Off: °F')}
      ${toggle('lessons', lessonsOn(s), 'Lessons', 'Lottie teaches one system a day (this run). Off: buttons follow rank alone.')}
      <div class="cl-row wrap"><button class="cl-b tiny ghost" data-action="option" data-key="tour" data-testid="opt-tour" title="Lottie shows you around again, pointing at each thing">Replay Lottie's tour</button></div>
      ${keys}
      ${saves}
    </div>
    <div class="cl-setup-foot"><span></span><button class="cl-link" data-action="options" data-testid="options-done">Done</button></div>
  </div></div>`;
}
