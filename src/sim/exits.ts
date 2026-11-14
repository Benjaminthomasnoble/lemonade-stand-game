// Boss exit scenes (spec "The five bosses", Arc and exit): when a rival is
// eliminated by any route (HQ captured, Faction Buyout, 7 days bankrupt), its
// boss's exit plays as a short, skippable scene at the next lull, in the
// campaign, Sandbox and Endless alike (one scene a day: a second exit waits a
// day). In the campaign, Juni's exit is Act 3's climax: she slides over
// FizzCo's invoice, with any Truce tribute you paid Preston on it too; and
// Vera's is the finale: her cane clatters down, Lottie walks in, and they open
// the last page together (Lottie's Secret Reserve). Pure, like the rest of the sim.
import { RECIPES, type RecipeId, type RivalId } from './balance.ts';
import type { GameState } from './economy.ts';
import { dominationProgress } from './modes.ts';
import { playScene, type SceneLine } from './scenes.ts';
import { hasStory } from './story.ts';

export type ExitRoute = 'buyout' | 'hq' | 'bankrupt';
const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

/** Each boss: their name on the captions, the opening line by route, the rest of the scene, and the recap. */
const EXITS: Record<RivalId, { who: string; first: Record<ExitRoute, string>; rest: [string, string][]; recap: string }> = {
  blenders: {
    who: 'Brock',
    first: { hq: 'You stormed the Shack, bro. The SHACK.', buyout: "Sold. Smoothies are a young man's game anyway.", bankrupt: 'They repossessed the blenders, bro. All of them.' },
    rest: [['Brock', "I'm opening a surf school. The ocean never raided anybody, bro."], ['Lottie', 'Send a postcard, Brock. From way out there.']],
    recap: 'Brock Bodine trades his blenders for a surf school: "The ocean never raided anybody, bro."',
  },
  coldbrew: {
    who: 'Juni',
    first: { hq: 'You took the Grindhouse. Ugh. So mainstream.', buyout: 'In small bills, for authenticity.', bankrupt: 'The beans ran out. So did the rent.' },
    rest: [['Juni', 'I sold out to a soda company. Never again.'], ['Lottie', 'Everybody sells out once, dear. Make it count.']],
    recap: 'Juni Grind closes the Grindhouse and turns on the soda company that paid her rent.',
  },
  hollis: {
    who: 'Tilly',
    first: { hq: 'Nobody gets past my hay bales. Nobody but you.', buyout: "Fair price, sugar. I'll take it.", bankrupt: 'Bad harvest. Worse luck.' },
    rest: [['Tilly', "You've got grit, kid. I'll vouch for you."], ['Tilly', "See you at the County Fair. I'm judging now."], ['Lottie', 'Tilly Hollis with a scorecard. Heaven help the pie table.']],
    recap: 'Tilly Hollis vouches for you, and takes up judging at the County Fair. Bring your best.',
  },
  fizzco: {
    who: 'Preston',
    first: { hq: "You can't storm a Tower! That's not in the plan!", buyout: 'Fine. Sold. After hard haggling, I want that noted.', bankrupt: "Quarterly results are... let's say disappointing." },
    rest: [['Preston', "Yes, I'm in a tow truck. It's a strategic pivot."], ['Preston', "Let's circle back!"], ['Lottie', "Circle the whole Bay, Preston. It's ours now."]],
    recap: 'Preston Fizzwell leaves the Tower in a tow truck, still on his car phone: "Let\'s circle back!"',
  },
  // Endless Summer's Out-of-Towner: no HQ in the Bay, so it leaves by a buyout or packing up (rivals.ts eliminate).
  snootwater: {
    who: 'Sterling',
    first: { hq: 'You stormed a water cooler? How provincial.', buyout: 'Sold. The tap water wins, this once.', bankrupt: 'We are leaving. Your tap water is a cry for help.' },
    rest: [['Sterling', 'We shall return. Hydration waits for no one.'], ['Lottie', 'Mind the potholes on your way out, Sterling.']],
    recap: 'Sterling Snoot takes Snootwater Springs back out of town: "We shall return."',
  },
  // Sandbox and Endless: the campaign plays the finale in its place (FINALE, below).
  sourwood: {
    who: 'Vera',
    first: { hq: 'Well played, dear.', buyout: 'Well played, dear.', bankrupt: 'Well played, dear.' },
    rest: [['Lottie', 'Took you forty years to say it, Vera.'], ['Vera', '...Tea?']],
    recap: 'Vera Sourwood sets down her cane: "Well played, dear." Then she pours two cups of tea.',
  },
};

/** The invoice Juni slides over at Act 3's climax (spec Act 3): FizzCo paid for the curated decline. */
export const INVOICE = "Curated decline, Lottie's Lemonade, 12 nights.";
const STEP = 4.2;

/**
 * The campaign's finale (spec Act 5 climax): Vera's cane clatters down in the Boss Room, Lottie walks in, and they face
 * off across the tea table. Vera produces the last page, still sealed: "It said open together." Inside: a pinch of salt
 * and "a friend to share it with." They make up over a glass, and the Secret Reserve is yours. The Manor falls to an
 * HQ assault (the Big Squeeze ends in one too); on another route Vera's first line follows it, and the rest plays the same.
 */
export const FINALE = {
  first: { hq: 'There goes my cane. Well played, dear.', buyout: 'Sold, dear. Even the teapot.', bankrupt: 'They took the silver, dear. Not the teapot.' } as Record<ExitRoute, string>,
  rest: [
    ['Lottie', 'Forty years, Vera. Pour two cups.'],
    ['Vera', 'The last page. Still sealed.'],
    ['Vera', 'It said open together.'],
    ['Lottie', 'A pinch of salt...'],
    ['Vera', '...and a friend to share it with.'],
    ['Lottie', 'My Secret Reserve. Pour her a glass, kid.'],
    ['Vera', 'To friends, Lottie.'],
  ] as [string, string][],
  /** Domination isn't complete yet: the ending waits for the rest of the Bay. */
  notYet: ['Lottie', 'Now go paint the rest of the Bay, kid.'] as [string, string],
  replies: ['To friends!', 'Can I try it?'],
  recap: "Vera's cane clattered down, and she and Lottie opened the last page together: a pinch of salt and a friend to share it with. Lottie's Secret Reserve is yours.",
};

const timed = (lines: [string, string][]) => lines.map(([who, text], i) => ({ who, text, at: 0.5 + i * STEP }));

/** Lottie names the pages that came home just now (recipes.ts, on every route), but for `except`. */
function homeLine(s: GameState, except?: RecipeId): [string, string][] {
  const home = (Object.keys(s.world?.homed ?? {}) as RecipeId[]).filter((r) => r !== except && s.world!.homed![r] === s.day + 1).map((r) => RECIPES[r].label.replace(/^Lottie's /, ''));
  return home.length ? [['Lottie', `And my ${home.join(' and ')} page${home.length > 1 ? 's come' : ' comes'} home.`]] : [];
}

/** The campaign's finale for Vera's fall this way (the Secret Reserve page came home in eliminate(), with any other she held). */
export function finaleScene(s: GameState, how: ExitRoute): { lines: SceneLine[]; recap: string; replies: string[] } {
  const lines: [string, string][] = [['Vera', FINALE.first[how]], ...FINALE.rest, ...homeLine(s, 'secretReserve'), ...(dominationProgress(s).done ? [] : [FINALE.notYet])];
  return { lines: timed(lines), recap: FINALE.recap, replies: FINALE.replies };
}

/** The exit scene's lines and recap for a boss who just fell this way. */
export function exitScene(s: GameState, id: RivalId, how: ExitRoute): { lines: SceneLine[]; recap: string; replies?: string[] } {
  if (id === 'sourwood' && hasStory(s)) return finaleScene(s, how);
  const e = EXITS[id];
  let rest = e.rest, recap = e.recap;
  if (id === 'coldbrew' && hasStory(s) && s.rivals.fizzco.alive) {
    // Act 3's climax: the invoice, then Juni turns informant (her tip calls on FizzCo start: src/sim/phone.ts).
    const tribute = s.story?.tribute ?? 0;
    rest = [
      ['Juni', "FizzCo paid our rent. Here's what for."],
      ['Juni', INVOICE],
      ...(tribute ? [['Juni', `Line two: your ${money(tribute)} Truce. You paid for it too.`] as [string, string]] : []),
      ['Lottie', 'A soda company. I knew it smelled like syrup.'],
      ['Juni', "I'll call when they move. Consider me decaf."],
    ];
    recap = `Juni Grind slid over FizzCo's invoice: "${INVOICE}"${tribute ? ` Your ${money(tribute)} Truce tribute to Preston is on it too.` : ''} She'll call with tips on FizzCo.`;
  }
  return { lines: timed([[e.who, e.first[how]], ...rest, ...homeLine(s)]), recap };
}

/** A Truce with FizzCo (one line in rivals.ts makeTruce: Preston's own offer, or one you call from the HQ card): in the
 * campaign its tribute goes on Juni's invoice. */
export function noteTribute(s: GameState, id: RivalId, cost: number): void {
  if (id === 'fizzco' && hasStory(s)) s.story!.tribute = (s.story!.tribute ?? 0) + cost;
}

/** A boss is out (one line in rivals.ts eliminate()): their exit scene waits for the next lull, in every mode. */
export function bossExit(s: GameState, id: RivalId, how: ExitRoute): void {
  const { lines, recap, replies } = exitScene(s, id, how);
  playScene(s, `exit-${id}`, { exit: true, lines, recap, seconds: lines[lines.length - 1].at + 4, ...(replies ? { replies } : {}) });
}
