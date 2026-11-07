// Saves (spec: "Autosave every dawn (3 rotating) plus manual slots"): on the
// Options screen, each manual slot with Save here and Load, then the last three
// dawns to load. Each slot shows its day, rank, Success Score, mode and
// difficulty. Ironman keeps a single save, so it has no slots. A lost run's
// older dawns sit beside "Try that day again". Plain functional controls on the
// HUD's styles; clicks go through the HUD's one listener (data-action).
import { clockText, DIFFICULTY, MODES, type GameState } from '../sim/economy.ts';
import type { SlotInfo, Slots } from '../save.ts';

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const whole = (n: number) => '$' + Math.round(n).toLocaleString('en-US');

/** "Day 12, 2:30pm · R4 · $12,345": mid-day saves show the time they were made. */
export const slotLine = (i: SlotInfo) =>
  `Day ${i.day}${i.phase === 'open' || i.phase === 'night' ? `, ${clockText(i.minute)}` : ''} · R${i.rank} · ${whole(i.score)}`;
const runOf = (i: SlotInfo) => `${MODES[i.mode]?.label ?? i.mode}, ${DIFFICULTY[i.difficulty]?.label ?? i.difficulty}`;

export function savesPanel(s: GameState, slots: Slots): string {
  if (s.settings.ironman) return `<div class="cl-row wrap"><span class="cl-label">Saves</span><span class="cl-note" title="Ironman keeps one save, overwritten as you play">Ironman: one save only</span></div>`;
  const manual = slots.manual.map((m, i) => `<div class="cl-row wrap" data-testid="save-slot">
      <span class="cl-label">Slot ${i + 1}</span>
      <span class="cl-note"${m ? ` title="${esc(`${runOf(m)}${m.date ? ` · saved ${m.date}` : ''}`)}"` : ''}>${m ? `${slotLine(m)}<br>${esc(runOf(m))}` : 'Empty'}</span>
      <button class="cl-b tiny go" data-action="saveSlot" data-slot="${i}" data-testid="save-to-${i}">Save here</button>
      ${m ? `<button class="cl-b tiny" data-action="loadSlot" data-slot="${i}" data-testid="load-${i}">Load</button>` : ''}</div>`).join('');
  const dawns = slots.dawn.flatMap((d, i) => (d ? [{ d, i }] : [])).sort((a, b) => b.d.seq - a.d.seq)
    .map(({ d, i }) => `<button class="cl-b tiny" data-action="loadSlot" data-slot="${i}" data-dawn="1" data-testid="load-dawn-${i}" title="${esc(`Dawn autosave · ${runOf(d)}`)}">${slotLine(d)}</button>`).join('');
  return `<div class="cl-row wrap"><span class="cl-label">Saves</span></div>${manual}${dawns ? `<div class="cl-row wrap"><span class="cl-label">Dawns</span>${dawns}</div>` : ''}`;
}

/** A lost run can go back further than its last dawn: the older ones (newest first), beside "Try that day again". */
export function dawnPicks(dawns: { slot: number; info: SlotInfo }[]): string {
  return dawns.slice(1).map(({ slot, info }) => `<button class="cl-link" data-action="reloadDawn" data-slot="${slot}" title="Back to the dawn of day ${info.day}">Day ${info.day}</button>`).join('');
}
