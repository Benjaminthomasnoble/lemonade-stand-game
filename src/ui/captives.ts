// The Nabbed on the HUD (combat: src/sim/captives.ts). Under the Crew tab's
// faces, a card for each: a raider you nabbed, with Ransom (their side pays
// their hire fee), Let go (+0.05 star) and Recruit (they join as a Former
// Rival; a Loyal one won't, and a full roster has no bed); or a guard of
// yours a rival holds, with Pay and the days it waits. Mounted from hud.ts,
// drawn with its clay kit; clicks go through the HUD's one listener
// (data-action="captive", data-choice).
import { canSettle, captiveGuard, daysToPay, henchmanWord, ransomOf, type Captive, type CaptiveChoice } from '../sim/captives.ts';
import { FACTIONS, NABBED, type GameState, type Guard, type RivalId } from '../sim/economy.ts';
import type { ClubKit } from './clubhouse.ts';

const pips = (n: number, of: number) => `<span class="cl-pips">${Array.from({ length: of }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function choice(k: ClubKit, s: GameState, c: Captive, what: CaptiveChoice, label: string, cls = ''): string {
  const b = canSettle(s, c.id, what);
  return k.locked(b) ? '' : k.btn('captive', label, b, `data-id="${c.id}" data-choice="${what}" data-testid="captive-${what}"`, `tiny ${cls}`);
}

function captiveCard(k: ClubKit, s: GameState, c: Captive, g: Guard): string {
  const fee = k.whole(ransomOf(s, c));
  const first = g.name.split(' ')[0];
  if (c.by === 'player') {
    const from = c.from as RivalId;
    const loyal = g.trait === 'Loyal';
    const acts = choice(k, s, c, 'ransom', `Ransom ${fee}`, 'go') + choice(k, s, c, 'release', 'Let go', 'ghost') + (loyal ? '' : choice(k, s, c, 'recruit', 'Recruit'));
    const tip = `${g.name}, ${henchmanWord(from)}. Ransom: ${FACTIONS[from].name} pay ${fee}. Let go: +${NABBED.release} star.${loyal ? ' Loyal: won\'t switch sides.' : ' Recruit: joins as a Former Rival.'}`;
    return k.card(k.face(s, g), k.esc(g.name), `${henchmanWord(from)}${loyal ? ' · Loyal' : ''} ${pips(g.level, 5)}`, `<span class="cl-acts">${acts}</span>`, tip, 'data-testid="captive"');
  }
  const by = c.by as RivalId;
  const left = daysToPay(s, c);
  const tip = g.trait === 'Loyal'
    ? `${FACTIONS[by].name} want ${fee}. ${first} won't switch sides: unpaid, home in ${plural(left, 'day')}.`
    : `${FACTIONS[by].name} want ${fee}. Unpaid, ${first} joins them in ${plural(left, 'day')}.`;
  return k.card(k.face(s, g), k.esc(g.name), `${FACTIONS[by].henchmen} hold ${first} · ${plural(left, 'day')}`, choice(k, s, c, 'pay', `Pay ${fee}`, 'go'), tip, 'data-testid="captive"');
}

/** The Crew tab's Nabbed: the raiders you hold, then your guards a rival holds. */
export function captivesPanel(k: ClubKit, s: GameState): string {
  const list = (s.captives ?? []).map((c) => ({ c, g: captiveGuard(s, c) })).filter((x): x is { c: Captive; g: Guard } => !!x.g);
  if (!list.length) return '';
  const cards = [...list.filter((x) => x.c.by === 'player'), ...list.filter((x) => x.c.by !== 'player')].map(({ c, g }) => captiveCard(k, s, c, g)).join('');
  return `<span class="cl-label">Nabbed</span><div class="cl-cards">${cards}</div>`;
}

/** A roster line's note for a guard a rival holds ('' otherwise). */
export function heldNote(s: GameState, g: Guard): string {
  const c = s.captives?.find((x) => x.id === g.id && x.by !== 'player');
  return c ? `, held by ${FACTIONS[c.by as RivalId].name}` : '';
}
