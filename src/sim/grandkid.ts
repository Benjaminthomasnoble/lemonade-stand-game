// The Grandkid and the crew's name (spec "The cast": the Grandkid is you, "Default Charlie Puckett; fully
// customizable"; canon: "name, look and pronouns customizable" and "Default crew name: The Peel Patrol
// (renamable)"). They're picked on the New Game screen (src/ui/grandkid.ts), the crew can be renamed from the Crew
// roster, and both live in the run's Settings, so they save with it: a save without them loads with the defaults.
// The story reads them here: the Bugle's briefs, Lottie's lines in scenes ({kid} in scenes.ts), and every
// crew-facing line (raid headlines, battle reports, fight lines, HQ captures, Dex's bark). Pure, and nothing here
// can print markup: names lose < > & " and control characters as they're typed.
import type { GameState } from './economy.ts';
import type { Settings } from './modes.ts';

export type Pronouns = 'they' | 'she' | 'he';
export interface Grandkid { name: string; pronouns: Pronouns; look: number }

export const KID_NAME = 'Charlie Puckett';
export const CREW_NAME = 'The Peel Patrol';
/** A name stays short enough for a phone-width alert card. */
export const NAME_MAX = 20;

/** The Grandkid's pronouns as the Bugle prints them, and what Lottie's grandkid is called with each. */
export const PRONOUNS: Record<Pronouns, { label: string; they: string; them: string; their: string; kin: string }> = {
  they: { label: 'They/them', they: 'they', them: 'them', their: 'their', kin: 'grandkid' },
  she: { label: 'She/her', they: 'she', them: 'her', their: 'her', kin: 'granddaughter' },
  he: { label: 'He/him', they: 'he', them: 'him', their: 'his', kin: 'grandson' },
};
const PRONOUN_IDS = Object.keys(PRONOUNS) as Pronouns[];

/**
 * The Grandkid's looks: skin and hair for the clay figure, which keeps the lemon cap, the white apron, the freckles and
 * the gap tooth (src/world/clay/figure.ts SPECS.kid). Look 0 is the spec's. Seam (art thread): src/world/stand.ts
 * builds the grandkid from SPECS.kid, and can spread kidLook(s) over it.
 */
export const KID_LOOKS: readonly { skin: string; hairColor: string }[] = [
  { skin: '#F2C29A', hairColor: '#7A4A2A' },
  { skin: '#F8D3B0', hairColor: '#D9A441' },
  { skin: '#E3A27A', hairColor: '#B5532A' },
  { skin: '#B9784F', hairColor: '#2B1D14' },
  { skin: '#8A5638', hairColor: '#1E140E' },
];

const UNSAFE = /[<>&"\u0000-\u001f\u007f]/g;
/** A name field as it's typed: no markup or control characters, and at most NAME_MAX of them. */
export const nameDraft = (raw: unknown): string => String(raw ?? '').replace(UNSAFE, '').slice(0, NAME_MAX);
/** A name as the story prints it: one space between words, or the default when it's blank. */
export const cleanName = (raw: unknown, fallback: string): string => nameDraft(raw).replace(/\s+/g, ' ').trim() || fallback;

const settingsOf = (s: GameState | Settings): Settings => ('settings' in s ? s.settings : s);

/** The Grandkid this run set up, with the words the story uses for them. */
export function grandkid(s: GameState | Settings) {
  const k = settingsOf(s).grandkid;
  const pronouns = PRONOUN_IDS.find((p) => p === k?.pronouns) ?? 'they';
  const name = cleanName(k?.name, KID_NAME);
  const look = Number.isInteger(k?.look) && k!.look >= 0 && k!.look < KID_LOOKS.length ? k!.look : 0;
  return { name, first: name.split(' ')[0], pronouns, look, ...PRONOUNS[pronouns] };
}
/** The Grandkid's skin and hair (for the clay figure: see KID_LOOKS). */
export const kidLook = (s: GameState | Settings) => KID_LOOKS[grandkid(s).look];

/** Set up the Grandkid on the New Game screen: a name as it's typed, a look or pronouns as they're picked. */
export function setGrandkid(st: Settings, change: Partial<Grandkid>): void {
  const was = grandkid(st);
  const look = change.look ?? was.look, pronouns = change.pronouns ?? was.pronouns;
  st.grandkid = {
    name: nameDraft(change.name ?? st.grandkid?.name ?? KID_NAME),
    pronouns: PRONOUN_IDS.includes(pronouns) ? pronouns : was.pronouns,
    look: Number.isInteger(look) && look >= 0 && look < KID_LOOKS.length ? look : was.look,
  };
}

/** The player's crew as every crew-facing line names it. */
export const crewName = (s: GameState | Settings): string => cleanName(settingsOf(s).crew, CREW_NAME);
/** Name the crew (the New Game screen, or the Crew roster mid-run): the field as typed; a blank one prints the default. */
export function renameCrew(s: GameState | Settings, raw: string): void {
  settingsOf(s).crew = nameDraft(raw);
}
