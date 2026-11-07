// Endless: beaten bosses cameo (spec "Sandbox and Endless": "Beaten bosses cameo"), each in a way that fits the exit
// they made (spec "The five bosses", Arc and exit). Brock's surf school makes the Bugle; Juni phones in as an informant;
// Tilly, now the County Fair's most feared taste-off judge, sends a pie back in the Bugle and rings on each County Fair's
// judging day; Preston rings from the tow truck, still on his car phone. One cameo every CAMEO_DAYS days, the beaten
// bosses taking turns, none sooner than CAMEO_DAYS after their own fall. Endless only: Endless Summer from the start, or
// the campaign's Epilogue after Keep squeezing. Vera has no cameo: she's at the Corner with Lottie. Pure, like the rest.
import { CAMEO_DAYS, FACTIONS, type RivalId } from './balance.ts';
import { CONTESTANT_NAME, tasteOffToday } from './calendar.ts';
import { onYou } from './night.ts';
import type { GameState } from './economy.ts';
import { LOTTIES_CORNER, PLOT_BY_ID } from './map.ts';
import { isEndless } from './modes.ts';
import { CALL_PRIORITY, juniInforms, phoneCall } from './phone.ts';

/** The bosses who cameo once they're out, in their turn order. */
export const CAMEO_BOSSES: readonly RivalId[] = ['blenders', 'coldbrew', 'hollis', 'fizzco'];

/** Brock and Tilly make the next morning's Bugle: its two tapes and the quote. */
export const CAMEO_NEWS: Partial<Record<RivalId, readonly (readonly [string, string, string])[]>> = {
  blenders: [
    ["SURF'S UP!", "Brock Bodine's surf school opens for the season", 'The ocean never raided anybody, bro.'],
    ['HANG TEN!', 'Brock Bodine teaches the Smoothie Bros to surf', 'Way better than blending, bro.'],
    ['BRO-CEAN!', "Brock Bodine's surf camp sells out", "Waves don't hold grudges, bro."],
  ],
  hollis: [
    ['JUDGE TILLY!', 'Big Tilly Hollis sends back a pie at the Grange', 'Needs grit, sugar.'],
    ['SCORECARD!', 'Big Tilly Hollis tastes 40 jams at the Grange', 'Two of them were jam.'],
    ['TOUGH CROWD!', 'Big Tilly Hollis gives the pie table a 3 out of 10', 'Generous, sugar.'],
  ],
};
/** A cameo prints below the night's fights and the rank-ups, above a rival's new stands. */
const CAMEO_RANK = 3.4;
/** Preston rings from the tow truck. */
export const PRESTON_CALLS: readonly string[] = [
  "Preston here, from the tow truck. It's a strategic pivot. Let's circle back!",
  "I'm vertically integrating, kid. Towing AND parking. Let's circle back!",
  "Can't talk, I'm hooked up to a minivan. Literally. Let's circle back!",
];
/** Tilly rings the morning she judges the County Fair's Taste-Off. */
export const TILLY_JUDGES = "I'm judging the County Fair today, sugar. Bring your best, or bring a hankie.";
/** Juni, informing: tonight's raid on you, else the boss with the biggest Grudge (whether it's past the phone's 30, when
 * they're spoiling for a fight), else nobody left to tell on. */
export const juniRaidTip = (rival: RivalId, plot: string) => `${CONTESTANT_NAME[rival]}'s crew hits ${plotName(plot)} tonight. You didn't hear it from me.`;
export const juniGrudgeTip = (rival: RivalId) => `Psst. ${CONTESTANT_NAME[rival]} has it in for you. Lock up. Consider me decaf.`;
export const juniQuietTip = (rival: RivalId) => `Psst. ${CONTESTANT_NAME[rival]}'s been quiet. Too quiet. Consider me decaf.`;
export const JUNI_NOBODY = "Nobody left to inform on. I'm just a barista again. It's fine.";

const plotName = (id: string) => (id === LOTTIES_CORNER ? 'the Corner' : PLOT_BY_ID[id]?.name ?? 'your stand');
const RIVALS = Object.keys(FACTIONS) as RivalId[];

/**
 * Closing time in Endless (one line in story.ts storyAtClose, after tonight's raids are planned): every boss who's out
 * is noted the first time, and when the last cameo was CAMEO_DAYS ago the beaten boss who has waited longest gets
 * theirs. Brock and Tilly make tomorrow's Bugle (cameoStories); Juni and Preston ring the Corner's phone (a tip, as
 * they're out of the game): Juni tonight about a raid on you, else tomorrow.
 */
export function cameosAtClose(s: GameState): void {
  const st = s.story;
  if (!st || !isEndless(s)) return;
  const seen = (st.cameos ??= {});
  for (const r of CAMEO_BOSSES) if (!s.rivals[r].alive && !seen[r]) seen[r] = { day: s.day, n: 0 };
  if (st.cameoDay !== undefined && s.day - st.cameoDay < CAMEO_DAYS) return;
  const due = CAMEO_BOSSES.filter((r) => seen[r] && s.day - seen[r]!.day >= CAMEO_DAYS && !(r === 'coldbrew' && juniInforms(s)))
    .sort((a, b) => seen[a]!.day - seen[b]!.day)[0];
  if (!due) return;
  const { n } = seen[due]!;
  const tomorrow = { from: s.day + 1, until: s.day + 2, tip: true };
  if (CAMEO_NEWS[due]) st.cameoNews = { day: s.day + 1, who: due, n };
  else if (due === 'fizzco') phoneCall(s, 'fizzco', PRESTON_CALLS[n % PRESTON_CALLS.length], tomorrow);
  else {
    const raid = s.raids.find((x) => !x.delivery && onYou(s, x));
    const top = RIVALS.filter((r) => s.rivals[r].alive).sort((a, b) => s.rivals[b].grudge - s.rivals[a].grudge)[0];
    if (raid) phoneCall(s, 'coldbrew', juniRaidTip(raid.attacker as RivalId, raid.target), { tip: true, priority: CALL_PRIORITY.story, until: s.day });
    else phoneCall(s, 'coldbrew', !top ? JUNI_NOBODY : s.rivals[top].grudge > 30 ? juniGrudgeTip(top) : juniQuietTip(top), tomorrow);
  }
  seen[due] = { day: s.day, n: n + 1 };
  st.cameoDay = s.day;
}

/** This morning's cameo in the Bugle (one line in media.ts storyBeats): big tape, small tape, the brief, its rank. */
export function cameoStories(s: GameState): [string, string, string, number][] {
  const c = s.story?.cameoNews;
  const pool = c && c.day === s.day ? CAMEO_NEWS[c.who] : undefined;
  if (!c || !pool) return [];
  const [big, small, quote] = pool[c.n % pool.length];
  return [[big, small, `${small}: "${quote}"`, CAMEO_RANK]];
}

/** Dawn in Endless (one line in story.ts storyAtDawn, after the day's Taste-Off is set up): Tilly rings the County Fair's judging morning. */
export function cameosAtDawn(s: GameState): void {
  if (!s.story || !isEndless(s) || s.rivals.hollis.alive || tasteOffToday(s)?.fair !== 'countyFair') return;
  phoneCall(s, 'hollis', TILLY_JUDGES, { tip: true, priority: CALL_PRIORITY.story, until: s.day });
}
