// Boss phone taunts (spec "Phone taunts"): the rotary phone at Lottie's Corner
// rings when a boss's mood shifts, meaning their Grudge or Attention toward you
// just jumped, so every call is also a warning; story beats call too. At most
// one call a game day: the most important waits for a lull, the rest wait a day
// or drop. Eliminated bosses stop calling (but Juni, out of the campaign, tips
// you off about FizzCo); in the campaign Brock only calls
// after the Act 1 climax, apart from his scripted first call. Sandbox and
// Endless keep the taunts. The sim picks who calls and when, and the line when
// the spec scripts one; otherwise the boss's own pool by mood fills it in
// (src/world/barks.ts).
import { FACTIONS, PHONE_ATTENTION_JUMP, PHONE_GRUDGE_JUMP, type RivalId } from './balance.ts';
import type { GameState } from './economy.ts';
import { LOTTIES_CORNER, PLOT_BY_ID, PLOTS } from './map.ts';
import { threatLevel, type Raid } from './crew.ts';
import { onYou } from './night.ts';
import { gameOver, isEndless } from './modes.ts';
import { hasStory } from './story.ts';
import { NIGHT_SHIFT } from './rivals.ts';

export type BossMood = 'warn' | 'sore' | 'smashed' | 'gloat';
/**
 * A call waiting to ring: from day `from` (default the day it was placed) to day `until`. A call about a raid on you
 * (`raid`) rings only once that raid's warning is out, and is dropped once the raid has hit.
 */
export interface Call { who: RivalId; text: string; mood: BossMood; day: number; from?: number; until: number; priority: number; raid?: string; tip?: boolean }
export interface PhoneState {
  lastDay?: number; // the game day the last call rang
  queue: Call[]; // most important first
  log: { day: number; who: RivalId; text: string; mood: BossMood; plots?: number /* the boss's plots when they rang */; raid?: string }[]; // newest first
  grudge: Partial<Record<RivalId, number>>; // as last seen, to spot a jump
  attention: Partial<Record<RivalId, number>>; // beyond Threat, as of the last dawn (none until the first)
  threat?: number;
  groves?: number; // plots you own in The Groves (Tilly's fields)
  brock?: boolean; // Brock's scripted first call has been made
}

/** Story beats outrank tonight's raid warnings, which outrank a boss in a mood. */
export const CALL_PRIORITY = { story: 3, raid: 2, mood: 1 } as const;
const RIVALS = Object.keys(FACTIONS) as RivalId[];
/** Grudge and Attention are decimals: a jump of exactly the threshold counts. */
const jumped = (from: number, to: number, by: number) => to - from >= by - 1e-6;

/** The lines the spec scripts. */
export const LINES = {
  brockFirst: 'Bro. Your stand is in my sun. Summer Fair, Day 14. You lose, you leave.',
  brockRent: 'Bro. That was my rent money.',
  brockBlend: 'Bro. Tonight we blend your stand. Smoothie or chunky, your call.',
  brockFence: 'Your fence is cute, bro. My guys are gonna do pull-ups on it.',
  tillyRaided: "Bring all the hatchets you want. I've got hay bales till Tuesday.",
  tillyFields: "I own six fields and one ladle, sugar. You're about to meet the ladle.",
  veraThreat: "Charming little stand, dear. I'll ask the Mayor whether it's legal.",
  veraSteward: 'I sent your grandmother a reminder, dear.',
  juniAct3: "We don't smash. We curate decline.",
  juniPad: 'FizzCo will hit the pad. Bring a crew to the pickup.',
  prestonTruce: "Let's do lunch at Dot's. Seven days of peace, for a modest consideration.",
  prestonLater: "No? I'll pencil you in for later.",
  prestonAct4: "Let's circle back to you being out of business.",
  veraAct5: "Lemonade is a family business, dear. And you're not family.",
} as const;

export function migratePhone(s: GameState): void {
  if (s.phone) return;
  const ph: PhoneState = { queue: [], log: [], grudge: {}, attention: {} };
  ph.threat = threatLevel(s);
  for (const r of RIVALS) ph.grudge[r] = s.rivals[r].grudge; // Attention: read at the next dawn, when the rivals' dawn works it out
  ph.groves = grovePlots(s);
  ph.brock = s.day > 1; // an older run is past Brock's first call
  s.phone = ph;
}

const grovePlots = (s: GameState) => Object.keys(s.plots).filter((id) => id.startsWith('groves') && s.plots[id].owner === 'player').length;
const plotsOf = (s: GameState, who: RivalId) => PLOTS.filter((p) => s.plots[p.id].owner === who).length;
const maxStandLevel = (s: GameState) => Object.values(s.plots).reduce((m, p) => (p.owner === 'player' && p.stand ? Math.max(m, p.stand.level) : m), 0);
/** Brock taunts from Day 1 (Ben, 2026-11-08: the competition shows up at once); kept as a seam for a quieter mode. */
const brockLocked = (_s: GameState) => false;

/**
 * Ring the Corner's phone (other systems call this for their taunts). Empty text: the boss's own pool by mood.
 * `from`: the first day it may ring (a call about today's raid waits for dawn). `until`: the last day the call still
 * makes sense (a raid warning only means tonight). Returns false if it won't ring.
 */
export function phoneCall(s: GameState, who: RivalId, text: string, opts: { mood?: BossMood; priority?: number; from?: number; until?: number; scripted?: boolean; raid?: string; tip?: boolean } = {}): boolean {
  migratePhone(s);
  if (!s.rivals[who] || (!s.rivals[who].alive && !opts.tip)) return false; // a tip comes from a boss who's out of the game
  if (who === 'blenders' && !opts.scripted && brockLocked(s)) return false;
  const ph = s.phone!;
  // The same call twice: keep the more important one (a boss in a mood who then raids you calls about the raid). Two
  // raids are two calls: the first warning rings.
  const twin = ph.queue.findIndex((c) => c.who === who && c.text === text && (!c.raid || !opts.raid || c.raid === opts.raid));
  if (twin >= 0) {
    if (ph.queue[twin].priority >= (opts.priority ?? CALL_PRIORITY.mood)) return false;
    ph.queue.splice(twin, 1);
  }
  const from = Math.max(s.day, opts.from ?? s.day);
  ph.queue.push({
    who, text, mood: opts.mood ?? 'warn', day: s.day, ...(from > s.day ? { from } : {}), until: Math.max(from, opts.until ?? from + 1),
    priority: opts.priority ?? CALL_PRIORITY.mood, ...(opts.raid ? { raid: opts.raid } : {}), ...(opts.tip ? { tip: true } : {}),
  });
  ph.queue.sort((a, b) => b.priority - a.priority);
  ph.queue.length = Math.min(ph.queue.length, 3);
  return true;
}

/** What a raiding boss says on the phone: Brock's scripted lines for tonight's raid (a Blender Rush), else the boss's own pool. */
const raidLine = (s: GameState, r: Raid) =>
  r.attacker === 'blenders' && !r.delivery ? (s.plots[r.target].defense.tier ? LINES.brockFence : LINES.brockBlend) : '';

/**
 * The raiding boss's call about a raid on you (src/sim/rivalAi.ts places it as a Blender Rush is planned): it rings
 * once the raid's warning is out, and drops once the raid is gone.
 */
export function raidCall(s: GameState, r: Raid): boolean {
  return phoneCall(s, r.attacker as RivalId, raidLine(s, r), { mood: 'warn', priority: CALL_PRIORITY.raid, until: s.day, raid: r.id });
}

/** Every raid on you whose warning is out gets its boss's call, including raids planned after closing (a Delivery Raid). */
function raidCalls(s: GameState): void {
  const ph = s.phone!;
  for (const r of s.raids) {
    if (!r.warned || !onYou(s, r) || ph.queue.some((c) => c.raid === r.id) || ph.log.some((l) => l.raid === r.id)) continue;
    raidCall(s, r);
  }
}

/**
 * The call to ring now, if any: one a game day, the most important first. The UI calls this at a lull. A lesser call
 * never takes the day's slot while tonight's raid call waits for its warning.
 */
export function takeCall(s: GameState): Call | null {
  const ph = s.phone;
  if (!ph || ph.lastDay === s.day || gameOver(s) || (s.outcome?.result === 'won' && !isEndless(s))) return null;
  raidCalls(s);
  const raid = (c: Call) => (c.raid ? s.raids.find((r) => r.id === c.raid) : undefined);
  ph.queue = ph.queue.filter((c) => c.until >= s.day && (s.rivals[c.who].alive || c.tip) && (!c.raid || raid(c)));
  const i = ph.queue.findIndex((c) => (c.from ?? c.day) <= s.day && (!c.raid || raid(c)!.warned));
  if (i < 0 || ph.queue.slice(0, i).some((c) => c.raid && !raid(c)!.warned)) return null;
  const [call] = ph.queue.splice(i, 1);
  ph.lastDay = s.day;
  ph.log.unshift({ day: s.day, who: call.who, text: call.text, mood: call.mood, plots: plotsOf(s, call.who), ...(call.raid ? { raid: call.raid } : {}) });
  ph.log.length = Math.min(ph.log.length, 10);
  return call;
}

/**
 * The next Bugle reports the moves of the boss who called (spec "Phone taunts"): one brief on their plots and mood
 * since the call. Null when nobody rang yesterday, or when last night's fight with them already made the news.
 */
export function bossBrief(s: GameState): string | null {
  const c = s.phone?.log.find((l) => l.day === s.day - 1);
  if (!c || c.plots === undefined || !s.rivals[c.who].alive) return null;
  if (s.battles.some((b) => b.day === s.day - 1 && b.attacker === c.who && b.defender === 'player')) return null;
  const name = FACTIONS[c.who].name, d = plotsOf(s, c.who) - c.plots;
  const plural = (n: number) => `${n} plot${n === 1 ? '' : 's'}`;
  const move = d > 0 ? `grab ${plural(d)} after the call` : d < 0 ? `lose ${plural(-d)} after the call` : s.rivals[c.who].grudge > 30 ? 'hang up spoiling for a fight' : 'keep quiet after the call';
  return `Bugle: ${name} ${move}.`;
}

/**
 * Spot the mood shifts that make a boss pick up the phone: Grudge or Attention jumps, Threat rising, a buy near
 * Tilly's fields. Attention is worked out at dawn (src/sim/rivalAi.ts), so it's compared from one dawn to the next.
 */
export function phoneCheck(s: GameState, dawn = false): void {
  migratePhone(s);
  const ph = s.phone!;
  if (dawn) { const brief = bossBrief(s); if (brief) s.news.push(brief); }
  // Brock's first call: Day 1, once your stand opens, so you know from the start who you're up against.
  if (!ph.brock && s.rivals.blenders.alive && (s.day > 1 || s.phase === 'open' || maxStandLevel(s) >= 3)) {
    ph.brock = true;
    phoneCall(s, 'blenders', LINES.brockFirst, { priority: CALL_PRIORITY.story, scripted: true });
  }
  const threat = threatLevel(s);
  if (ph.threat !== undefined && threat > ph.threat) phoneCall(s, 'sourwood', LINES.veraThreat);
  ph.threat = threat;
  const groves = grovePlots(s);
  if (ph.groves !== undefined && groves > ph.groves) phoneCall(s, 'hollis', LINES.tillyFields);
  ph.groves = groves;
  for (const r of RIVALS) {
    const st = s.rivals[r];
    // Attention counts beyond Threat: a Threat rise moves every boss at once, and Vera already calls about that.
    const g0 = ph.grudge[r], a0 = ph.attention[r], a = st.attention - threat;
    ph.grudge[r] = st.grudge;
    if (dawn) ph.attention[r] = a;
    if (!st.alive || g0 === undefined) continue;
    if (jumped(g0, st.grudge, PHONE_GRUDGE_JUMP) || (g0 <= 30 && st.grudge > 30)) {
      // Most jumps follow a raid of yours on them: they call about it at the next dawn ("at dawn he calls").
      const fight = s.battles.find((b) => b.day >= s.day - 1 && b.attacker === 'player' && b.defender === r);
      const won = !!fight && (fight.outcome === 'smashed' || fight.outcome === 'robbed');
      const text = r === 'blenders' && fight?.outcome === 'robbed' ? LINES.brockRent : r === 'hollis' && fight ? LINES.tillyRaided : '';
      const from = fight && fight.day === s.day ? s.day + 1 : s.day; // a daytime raid: tomorrow's dawn; last night's: now
      phoneCall(s, r, text, { mood: !fight ? 'warn' : won ? 'smashed' : 'gloat', priority: fight ? CALL_PRIORITY.raid : CALL_PRIORITY.mood, from });
    } else if (dawn && a0 !== undefined && jumped(a0, a, PHONE_ATTENTION_JUMP)) {
      phoneCall(s, r, '', { mood: 'warn' });
    }
  }
  // A boss who hit you last night calls at dawn: gloating, or sore that you held.
  const hit = dawn && s.battles.find((b) => b.day === s.day - 1 && b.defender === 'player' && b.attacker !== 'player');
  // Juni gloats in her Night Shift line after a Cold Brew Sabotage spoils your stock (rivals: the flag rides the crew's Sabotage).
  if (hit) phoneCall(s, hit.attacker as RivalId, hit.attacker === 'coldbrew' && hit.outcome !== 'repelled' && hit.sabotage ? NIGHT_SHIFT.taunt : '', { mood: hit.outcome === 'repelled' ? 'sore' : 'gloat', priority: CALL_PRIORITY.raid });
}

/**
 * Closing time: the boss of each raid on you tonight calls once its warning is out (src/sim/night.ts warns as the raid
 * sets out, or at the last notice when it isn't spotted), so the call never gives away a raid you haven't seen coming.
 */
export function phoneAtClose(s: GameState): void {
  phoneCheck(s);
  juniTips(s);
  for (const r of s.raids) if (onYou(s, r)) raidCall(s, r);
}

/**
 * Juni's tip calls (campaign): once Cold Brew is out she's FizzCo's informant, and while FizzCo stands she phones at
 * closing ahead of a FizzCo raid on you tonight, before its warning is out. A tip takes the day's one call; it gives
 * nothing but the warning itself. Her warning about the first chopper's pickup is in src/sim/beats.ts.
 */
export function juniTips(s: GameState): void {
  if (!juniInforms(s)) return;
  const r = s.raids.find((x) => x.attacker === 'fizzco' && !x.delivery && onYou(s, x));
  if (r) phoneCall(s, 'coldbrew', `FizzCo's crew hits ${plotName(r.target)} tonight. You didn't hear it from me.`, { tip: true, priority: CALL_PRIORITY.story, until: s.day });
}
/** Juni informs on FizzCo: the campaign, Cold Brew out of the game, FizzCo still in it. */
export const juniInforms = (s: GameState) => hasStory(s) && !s.rivals.coldbrew.alive && s.rivals.fizzco.alive;
const plotName = (id: string) => (id === LOTTIES_CORNER ? 'the Corner' : PLOT_BY_ID[id]?.name ?? 'your stand');

/** A new act opens with its boss on the line (spec: Brock's first call, Preston in Act 4, Vera in Act 5). */
export function phoneAtAct(s: GameState, act: number): void {
  migratePhone(s);
  const ph = s.phone!;
  if (act === 2 && !ph.brock) { ph.brock = true; phoneCall(s, 'blenders', LINES.brockFirst, { priority: CALL_PRIORITY.story, scripted: true }); }
  // Act 3: Juni's first call follows the night flight that catches her baristas (src/sim/beats.ts).
  if (act === 4) phoneCall(s, 'fizzco', LINES.prestonAct4, { priority: CALL_PRIORITY.story });
  if (act === 5) phoneCall(s, 'sourwood', LINES.veraAct5, { priority: CALL_PRIORITY.story });
}
