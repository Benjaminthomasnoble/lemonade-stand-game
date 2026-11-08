// The Big Squeeze on Sourwood Manor's card (spec: Act 5, The button and the Climax; campaign only). From Rank 9 the
// Call the Big Squeeze button, at Morning Prep; through the siege, its night, the Manor as it stands (Gate HP, Yard
// elites, Boss Room Stewards) and tonight's targets, each a Go There; once the siege is done, the Manor as it left it
// above the HQ assault. Plain controls on the HUD's existing classes; clicks go through the HUD's one listener.
import { glyph } from './clay.ts';
import {
  BIG_SQUEEZE, canCallBigSqueeze, manorStewards, PLOT_BY_ID, siegeDone, siegeNight, siegeTargets, squeezedHq, squeezeOpen,
  type GameState, type RivalId,
} from '../sim/economy.ts';

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const place = (id: string) => PLOT_BY_ID[id].name.replace(/ lot /, ' ');
const RULES = `${BIG_SQUEEZE.nights} siege nights, then storm the Manor. Each dawn names that night's targets. Hold them all: the Gate loses ${BIG_SQUEEZE.gateCut} HP and a Yard elite sits out. Each plot lost: one more Steward.`;

/** The Manor as the siege has left it so far: Gate HP, Yard elites, and the Stewards beside Vera. */
function manor(s: GameState): string {
  const hq = squeezedHq(s, 'sourwood');
  return `<span class="cl-stages" title="Gate HP, Yard elites, Stewards with Vera"><i>Gate ${hq.gate.toLocaleString('en-US')}</i>${glyph('arrow')}<i>Yard ${hq.yard}</i>${glyph('arrow')}<i>Vera +${manorStewards(s, 'sourwood')}</i></span>`;
}

/** Below the sit-downs on an HQ card (hud.ts hqPanel): on the campaign's Sourwood Manor from Rank 9 in Act 5, the Big
 * Squeeze until its siege is done, then the Manor it left and `assault` (the HUD's Storm the HQ). Any other card keeps
 * `assault` as it is. */
export function squeezePanel(s: GameState, id: RivalId, assault: string): string {
  if (id !== 'sourwood' || !squeezeOpen(s)) return assault;
  if (siegeDone(s)) return `<div class="cl-row wrap" data-testid="squeeze-manor"><span class="cl-note">The siege left:</span>${manor(s)}</div>${assault}`;
  const q = s.squeeze;
  if (q?.called === undefined) {
    const b = canCallBigSqueeze(s);
    return `<div class="cl-planner" data-testid="big-squeeze"><b title="${esc(RULES)}">The Big Squeeze</b>
      <span class="cl-stages"><i>${BIG_SQUEEZE.nights} nights</i>${glyph('arrow')}<i>Gate</i>${glyph('arrow')}<i>Yard</i>${glyph('arrow')}<i>Vera</i></span>
      <button class="cl-b go" data-action="callSqueeze" data-testid="call-squeeze" ${b.ok ? `title="${esc(RULES)}"` : `disabled title="${esc(b.why)}"`}>Call the Big Squeeze</button></div>`;
  }
  const targets = siegeTargets(s);
  const go = targets.map((t) => `<button class="cl-b tiny" data-action="goto" data-plot="${t}" title="${esc(PLOT_BY_ID[t].name)}: tonight's target">${esc(place(t))}</button>`).join('');
  return `<div class="cl-planner" data-testid="big-squeeze"><b title="${esc(RULES)}">Siege: night ${siegeNight(s)} of ${BIG_SQUEEZE.nights}</b>
    ${manor(s)}<span class="cl-note" title="Nights you held every target">${q.held ?? 0} held · ${q.lost ?? 0} lost</span>
    ${targets.length ? `<span class="cl-note">Tonight they hit:</span><span class="cl-acts">${go}</span>` : ''}</div>`;
}
