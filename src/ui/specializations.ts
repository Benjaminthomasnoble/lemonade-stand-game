// Stand specializations on the HUD (spec: Stands, Specializations; src/sim/specializations.ts). Morning Prep's Grow
// tab shows a card for each open slot at the stand you manage: what it holds and what that does, then a button for
// each of the four to fit or swap in, with its effect and where it shines in the tooltip. Mounted from hud.ts (the
// Grow tab); plain controls, the UI thread styles them.
import {
  canFitSpec, SPEC_IDS, SPEC_SLOTS, SPECIALIZATIONS, specIn, specSlots, STAND_LEVELS, type GameState, type SpecId,
} from '../sim/economy.ts';
import * as A from './clay.ts';

/** The parts of the HUD's clay kit the Grow tab's slot cards draw with. */
export interface SpecKit {
  card: (art: string, title: string, sub: string, action: string, tip?: string, extra?: string) => string;
  whole: (n: number) => string;
}

const SHORT: Record<SpecId, string> = { express: 'Express', fancy: 'Fancy', fortified: 'Fortified', roof: 'Roof' };
let icons: Record<SpecId | 'empty', string> | null = null;
/** Each prop is drawn once and reused, so renders compare equal and nothing flickers. */
const icon = (id: SpecId | 'empty') =>
  (icons ??= { express: A.specExpressSVG(), fancy: A.specFancySVG(), fortified: A.specFortifiedSVG(), roof: A.specRoofSVG(), empty: A.starSVG(false) })[id];
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const lowerFirst = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);
/** "Express Window: +30% service (cups/hour). Best on a stand with a line out the door" */
const about = (id: SpecId) => `${SPECIALIZATIONS[id].name}: ${SPECIALIZATIONS[id].effect}. Best on ${lowerFirst(SPECIALIZATIONS[id].best)}`;

/** The Grow tab's slot cards for the stand you manage: none below The Kiosk, one at L3 and L4, two at L5. */
export function specCards(k: SpecKit, s: GameState): string[] {
  const plotId = s.selected;
  const ps = s.plots[plotId];
  const st = ps?.stand;
  if (!st || ps.owner !== 'player') return [];
  const out: string[] = [];
  for (let slot = 0; slot < specSlots(st.level); slot++) {
    const n = slot + 1;
    const cost = k.whole(SPEC_SLOTS[slot].cost);
    const cur = specIn(st, slot);
    const buttons = SPEC_IDS.map((id) => {
      const b = canFitSpec(s, plotId, slot, id);
      const on = cur === id;
      const what = on ? 'Fitted here' : b.ok ? `${cur ? 'Swap it in' : 'Fit it'} for ${cost}` : b.why;
      return `<button class="cl-b tiny cl-spec" data-action="spec" data-slot="${slot}" data-id="${id}" data-testid="spec-${n}-${id}" aria-label="${SPECIALIZATIONS[id].name}" aria-pressed="${on}" title="${esc(`${about(id)}. ${what}`)}"${b.ok ? '' : ' disabled'}>${icon(id)}<span>${SHORT[id]}</span></button>`;
    });
    const title = cur ? `Slot ${n}: ${SPECIALIZATIONS[cur].name}` : `Slot ${n}: empty`;
    const sub = cur ? SPECIALIZATIONS[cur].effect : `Fit one for ${cost}`;
    const tip = `Slot ${n} opens at ${STAND_LEVELS[SPEC_SLOTS[slot].level - 1].name} and holds one specialization. ${cur ? `Swapping costs ${cost} again` : `Fitting one costs ${cost}`}`;
    out.push(k.card(icon(cur ?? 'empty'), title, sub, `<span class="cl-acts">${buttons.join('')}</span>`, tip, `data-testid="spec-slot-${n}"`));
  }
  return out;
}
