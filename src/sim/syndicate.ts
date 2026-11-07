// The Syndicate (spec: The Syndicate; Act 5, The Big Squeeze): the surviving rivals stop raiding each other and unite
// against you. In the campaign Vera forms it two weeks into Act 5 on every difficulty; in Sandbox and Endless it forms
// at Threat 5, or Threat 4 on Cutthroat. Its strikes are planned in threat.ts; the rivals' feuds stop there too.
// Pure, like the rest of the sim.
import { FACTIONS, SYNDICATE_FORMS, type RivalId } from './balance.ts';
import type { GameState } from './economy.ts';
import { alert } from './alerts.ts';
import { threatLevel } from './crew.ts';
import { actOf, peaceful } from './modes.ts';
import { hqPlot } from './rivals.ts';

export interface SyndicateState {
  act5?: number; // campaign: the first dawn seen in Act 5 (story's actBegan(s) once its act state merges)
  formed?: number; // the day it formed: its first strike comes that night
}

const RIVALS = Object.keys(FACTIONS) as RivalId[];
/** Who leads it: Vera while she's in, else the biggest boss left. */
const LEAD_ORDER: RivalId[] = ['sourwood', 'fizzco', 'hollis', 'coldbrew', 'blenders'];
/** The Bugle's name for the boss who signs everyone up. */
const BYLINE: Record<RivalId, string> = { sourwood: 'SOURWOOD', fizzco: 'FIZZCO', hollis: 'HOLLIS', coldbrew: 'COLD BREW', blenders: 'BROCK' };

/** Vera's call the morning it forms (spec: Voice). */
export const SYNDICATE_CALL = 'I sent your grandmother a reminder, dear. This is the follow-up.';
/** The Bugle the morning it forms (spec: Voice). */
export const pactHeadline = (leader: RivalId) => `Bugle: PACT IS BACK: ${BYLINE[leader]} SIGNS UP EVERYONE BUT THE KID`;

/** The Syndicate stands (rivals' feuds are off, every raid on you is its strike). The Corkboard ties its strings to
 * your photo, and Harbor Fest's crews go after every delivery, from this day on. */
export const syndicateFormed = (s: GameState) => s.syndicate?.formed !== undefined && s.syndicate.formed <= s.day;
/** Who's in it: every rival still in the game (the Mayor rides along for flavor). Each one you eliminate shrinks it. */
export const syndicateMembers = (s: GameState) => RIVALS.filter((id) => s.rivals[id].alive);
/** Who leads it: Vera while she's in, else the biggest boss left. */
export const syndicateLeader = (s: GameState): RivalId | null => LEAD_ORDER.find((id) => s.rivals[id].alive) ?? null;

/** The first day of Act 5 (campaign). Acts follow rank today; story's act state will hand over its own day. */
const act5Began = (s: GameState) => s.syndicate?.act5; // story: actBegan(s) while actOf(s) === 5

/** Is it time it formed? Never in a Peaceful Sandbox (no raids) or with no rival left. */
export function syndicateDue(s: GameState): boolean {
  if (peaceful(s) || !syndicateMembers(s).length) return false;
  if (s.settings.mode === 'campaign') {
    const began = act5Began(s);
    return began !== undefined && s.day >= began + SYNDICATE_FORMS.act5Days;
  }
  if (s.settings.difficulty === 'cutthroat') return threatLevel(s) >= SYNDICATE_FORMS.cutthroatThreat;
  if (s.settings.difficulty === 'laidback') return s.rank >= SYNDICATE_FORMS.laidBackRank;
  return threatLevel(s) >= SYNDICATE_FORMS.threat;
}

/** Dawn (night.ts nightsAtDawn): note Act 5's first day, and form the Syndicate once it's due. */
export function syndicateAtDawn(s: GameState): void {
  if (s.settings.mode === 'campaign' && actOf(s) >= 5 && s.syndicate?.act5 === undefined) (s.syndicate ??= {}).act5 = s.day;
  if (s.syndicate?.formed === undefined && syndicateDue(s)) formSyndicate(s);
}

/** The morning it forms: the Bugle's front page and the leader's call (main.ts rings the phone). Its first strike,
 * on 2–3 of your plots, comes that night (threat.ts). Calling the Big Squeeze forms it too, if it isn't yet (squeeze.ts). */
export function formSyndicate(s: GameState): void {
  const leader = syndicateLeader(s)!;
  (s.syndicate ??= {}).formed = s.day;
  alert(s, { kind: 'note', text: pactHeadline(leader), plot: hqPlot(leader).id });
  if (leader === 'sourwood') s.news.push(`Vera: "${SYNDICATE_CALL}"`); // story: phoneCall(s, 'sourwood', SYNDICATE_CALL)
}
