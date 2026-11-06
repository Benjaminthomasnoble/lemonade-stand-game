// Short lines for the cast at big moments (spec "Voice" and "Tone guide").
// Bubbles and Lemonese only for now: no recorded voice (Ben, 2026-11-06).
// Lines are 1 to 6 words so they read at a glance; longer story lines belong
// in scenes. The UI thread owns the final wording of Lottie's goal lines.
import type { RivalId } from '../sim/balance.ts';

export type BarkMoment =
  | 'rush' | 'soldOut' | 'rankUp' | 'upgrade' | 'morningHot' | 'morningRain' | 'morning'
  | 'raidComing' | 'raidHeld' | 'raidLost' | 'raidWon' | 'night' | 'squawk';

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
  squawk: ['Squawk! Drop it!', 'That bird.', 'Not the good lemons!'],
};

/** What each boss says on the phone, by mood (spec "Phone taunts" and "Tone guide"). */
export type BossMood = 'warn' | 'sore' | 'smashed' | 'gloat';
export const BOSS: Record<RivalId, Record<BossMood, string[]>> = {
  blenders: {
    warn: ['Your fence is cute, bro. My guys are gonna do pull-ups on it.', 'Bro. Your stand is in my sun.', 'Leg day is tonight, bro. Your stand is the legs.'],
    sore: ['That was a warm-up, bro.', 'My bros slipped. On purpose.', 'Rematch. Tonight. Bring a smoothie.'],
    smashed: ['BROOO. My hut!', 'Not the blender, bro!', 'Okay. Okay. Respect. Still hate you.'],
    gloat: ['Brooo! Blended.', 'Should\'ve done more pull-ups, bro.'],
  },
  coldbrew: {
    warn: ['We don\'t smash. We curate decline.', 'Sleep well. Or don\'t. Either is valid.', 'Tonight is a performance piece.'],
    sore: ['Mm. Bold.', 'Your goose is very loud. It\'s a choice.'],
    smashed: ['You broke our espresso machine. It was vintage.', 'That was derivative.'],
    gloat: ['Your stock didn\'t spoil. It made an artistic choice.', 'Mm. Decline, curated.'],
  },
  hollis: {
    warn: ['Y\'all are on my land. It\'s all my land.', 'Fixin\' to visit tonight, sugar.'],
    sore: ['Bring all the hatchets you want. I\'ve got hay bales till Tuesday.', 'Hm. You dig in good.'],
    smashed: ['My land!', 'You\'ll pay for them hay bales.'],
    gloat: ['Told you. My land.', 'Sweet tea\'s thicker than lemonade.'],
  },
  fizzco: {
    warn: ['I\'m not threatening you. Legal says I can\'t. I\'m forecasting.', 'Let\'s circle back to you being out of business.'],
    sore: ['Let\'s circle back.', 'Noted. Escalating to my other guys.'],
    smashed: ['That kiosk was a capital asset!', 'You\'ll be hearing from Legal.'],
    gloat: ['Let\'s circle back to your stand. Oh wait.', 'Synergy achieved.'],
  },
  sourwood: {
    warn: ['Lemonade is a family business, dear. And you\'re not family.', 'I sent your grandmother a reminder, dear.'],
    sore: ['How quaint.', 'Lottie taught you that, I suppose.'],
    smashed: ['How very common of you.', 'The Stewards will want a word.'],
    gloat: ['How quaint.', 'Give Lottie my regards, dear.'],
  },
};

/** What customers say, in Lemonese (spec "Voice"): a rising "Sqwee-ma?" asks, "Peela-zip!" thanks, "Rindo bum" grumbles. */
export const CUSTOMER = {
  sip: ['Peela-zip!', 'Ahh!', 'Mmm!', 'Zesta!'],
  grumble: ['Rindo bum.', 'Rindo!', 'Bum-bum.'],
} as const;

export const pick = <T,>(lines: readonly T[]) => lines[Math.floor(Math.random() * lines.length)];

/** What a loitering henchman mutters while glaring at your stand. */
export const HENCH: Record<RivalId, string[]> = {
  blenders: ['Bro.', 'Nice stand. For now.', '*flexes*'],
  coldbrew: ['…', 'Mm.', '*sips iced coffee*'],
  hollis: ['Git.', 'Hm.', 'My boss\'s land.'],
  fizzco: ['Noted.', 'Reporting this.', '*on the phone*'],
  sourwood: ['Tsk.', 'How common.', 'Ahem.'],
};
