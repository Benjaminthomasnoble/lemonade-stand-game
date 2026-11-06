// Short lines for the cast at big moments (spec "Voice" and "Tone guide").
// Bubbles and Lemonese only for now: no recorded voice (Ben, 2026-11-06).
// Lines are 1 to 6 words so they read at a glance; longer story lines belong
// in scenes. The UI thread owns the final wording of Lottie's goal lines.
import type { RivalId } from '../sim/balance.ts';

export type BarkMoment =
  | 'rush' | 'soldOut' | 'rankUp' | 'upgrade' | 'morningHot' | 'morningRain' | 'morning'
  | 'raidComing' | 'raidHeld' | 'raidLost' | 'raidWon' | 'night';

export const LOTTIE: Record<BarkMoment, string[]> = {
  rush: ['Atta kid!', 'Keep \'em coming!', 'That\'s my grandkid!', 'Pour faster, sugar!'],
  soldOut: ['Pitcher\'s dry, kid!', 'More lemons!', 'We\'re out! Out!'],
  rankUp: ['Atta kid!', 'Vera\'s gonna hear about this.', 'Now we\'re cooking.'],
  upgrade: ['Ooh, fancy.', 'Look at us now!', 'Vera never had a sign like that.'],
  morningHot: ['Scorcher! Make extra ice.', 'Hot one. They\'ll be thirsty.'],
  morningRain: ['Rain. Folks still get thirsty.', 'Wet day. Keep it cheap.'],
  morning: ['Sugar\'s cheap. Respect costs extra.', 'Rise and squeeze.', 'Big day, kid.'],
  raidComing: ['I hear footsteps.', 'Lock up the sugar.', 'Somebody\'s coming tonight.'],
  raidHeld: ['Ha! Bounced right off.', 'Not on my corner.', 'Sugar\'s cheap. Respect costs extra.'],
  raidLost: ['We\'ll rebuild. Bigger.', 'Well. Guess she remembers me.', 'Hmph. Fetch the hammer.'],
  raidWon: ['That\'ll teach \'em.', 'Atta kid!', 'Don\'t tell your mother.'],
  night: ['Zzz…', 'Zzz… lemons…'],
};

/** A boss's line, quoted by Lottie when a raid warning comes in (phone calls come later). */
export const BOSS: Record<RivalId, string[]> = {
  blenders: ['Brooo!', 'Your fence is cute, bro.', 'Bro. Your stand is in my sun.'],
  coldbrew: ['Mm. Bold.', 'We don\'t smash. We curate decline.'],
  hollis: ['My land!', 'Y\'all are on my land.'],
  fizzco: ['Let\'s circle back.', 'Let\'s circle back to you being out of business.'],
  sourwood: ['How quaint.', 'Lemonade is a family business, dear.'],
};

/** What customers say, in Lemonese (spec "Voice"), plus a reaction icon for the walk-offs. */
export const CUSTOMER = {
  sip: ['Peela-zip!', 'Ahh!', 'Mmm!', 'Zesta!'],
  pricey: '💸',
  line: '⏳',
  soldOut: '🫙',
} as const;

export const pick = <T,>(lines: readonly T[]) => lines[Math.floor(Math.random() * lines.length)];
