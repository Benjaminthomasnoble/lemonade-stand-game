// You and your crew on the New Game screen (spec "The cast": the Grandkid, "Default Charlie Puckett; fully
// customizable"; canon: name, look and pronouns, and "The Peel Patrol (renamable)"): a row of looks, your name and
// your crew's name, and your pronouns. The Crew roster keeps the crew's name field for a rename mid-run. Mounted from
// hud.ts: looks and pronouns come back as 'pick' clicks, names on the input event, a letter at a time.
import type { GameState } from '../sim/economy.ts';
import type { Settings } from '../sim/modes.ts';
import { CREW_NAME, grandkid, KID_LOOKS, KID_NAME, NAME_MAX, PRONOUNS, renameCrew, setGrandkid, type Pronouns } from '../sim/grandkid.ts';
import { headBlob, INK, svg } from './clay.ts';

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

/** The Grandkid's face in a look: hair under the lemon cap, freckles (drawn once, so renders compare equal). */
const FACES = new Map<number, string>();
export function kidFace(look: number): string {
  if (!FACES.has(look)) {
    const { skin, hairColor } = KID_LOOKS[look] ?? KID_LOOKS[0];
    const cap = `<path d="M20 22c-2-10 6-14 12-14s14 4 12 14c-4-3-8-4-12-4s-8 1-12 4z" fill="${hairColor}" stroke="${INK}" stroke-width="2.4"/>`
      + `<path d="M20 19c0-9 24-9 24 0z" fill="#F7C948" stroke="${INK}" stroke-width="2.6"/><path d="M42 19h9" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`;
    const freckles = [[25, 31], [27.5, 33], [23, 33.5], [39, 31], [36.5, 33], [41, 33.5]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r=".9" fill="#a55a35" opacity=".7"/>`).join('');
    FACES.set(look, svg(headBlob(32, 26, 14, skin, '#3BB4C1', cap) + freckles));
  }
  return FACES.get(look)!;
}

const field = (id: 'kid' | 'crew', value: string, fallback: string, label: string) =>
  `<input class="cl-field" data-field="${id}" data-testid="name-${id}" value="${esc(value)}" maxlength="${NAME_MAX}" placeholder="${esc(fallback)}" aria-label="${label}" title="${label}" spellcheck="false" autocomplete="off">`;

/** The New Game screen's row of you: looks, your name and your crew's, your pronouns. */
export function kidPanel(st: Settings): string {
  const k = grandkid(st);
  const looks = KID_LOOKS.map((_, i) => `<button class="cl-pick${k.look === i ? ' on' : ''}" data-action="pick" data-key="kid.look" data-value="${i}" aria-pressed="${k.look === i}" aria-label="Look ${i + 1}"><span class="cl-face">${kidFace(i)}</span></button>`).join('');
  const pronouns = (Object.keys(PRONOUNS) as Pronouns[]).map((p) => `<button class="cl-b tiny ${k.pronouns === p ? 'go' : 'ghost'}" data-action="pick" data-key="kid.pronouns" data-value="${p}" aria-pressed="${k.pronouns === p}">${PRONOUNS[p].label}</button>`).join('');
  return `<div class="cl-more" data-testid="grandkid">
      <div class="cl-row wrap">${looks}</div>
      <div class="cl-row wrap">${field('kid', st.grandkid?.name ?? KID_NAME, KID_NAME, 'Your name')}${field('crew', st.crew ?? CREW_NAME, CREW_NAME, "Your crew's name")}</div>
      <div class="cl-row wrap">${pronouns}</div>
    </div>`;
}

/** A look or pronouns picked on the New Game screen (hud.ts 'pick', key kid.look or kid.pronouns). */
export function pickKid(st: Settings, key: string, value = ''): void {
  if (key === 'look') setGrandkid(st, { look: Number(value) });
  if (key === 'pronouns') setGrandkid(st, { pronouns: value as Pronouns });
}

/** A name field on the New Game screen took a letter. */
export function typeName(st: Settings, id: string, value: string): void {
  if (id === 'kid') setGrandkid(st, { name: value });
  if (id === 'crew') renameCrew(st, value);
}

/** The Crew roster's name: a field, so the crew can be renamed mid-run (main.ts's 'crewName'). */
export const crewField = (s: GameState): string => field('crew', s.settings.crew ?? CREW_NAME, CREW_NAME, "Your crew's name");
