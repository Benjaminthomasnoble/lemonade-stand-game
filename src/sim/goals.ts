// Lottie's Goals (spec "Lottie's Goals"): always 3 on screen. The short goal
// fits in a day and scales with the empire, the medium one fits a session, the
// long one aims at the next act (campaign), the next rank or the run's own goal
// (Domination, a score target, the Endless Peak). In Act 1 they follow the
// day-by-day lessons. Each pays a little cash when Lottie ticks it off; story
// goals wear a page icon. Each slot keeps the goal it shows in the save, so a
// goal is only paid if it was on the card when it was done, and a slot keeps its
// goal until it's done unless a lesson or story goal steps in ahead of it.
import {
  BRAND_TIERS, CUPS_PER_PITCHER, DISTRICT_RANK, GOAL_REWARD, HIRE_RANK, LESSON_DAY, PERIMETERS, RANKS, SALES_GOAL_SHARE,
  STAND_LEVELS, STAND_RANK_GATE, type RivalId, type Sweetness,
} from './balance.ts';
import { DISTRICTS, LOTTIES_CORNER, PLOTS, type DistrictId } from './map.ts';
import type { GameState, Goal } from './economy.ts';
import { averageStopChance, canBuyPlot, expectedCups, playerStands, plotPrice, servingsAvailable, successScore } from './economy.ts';
import { FACILITIES, type FacilityKind } from './vip.ts';
import { HQS } from './rivals.ts';
import { districtControl, dominationProgress, gameOver, isEndless, winCondition } from './modes.ts';
import { hasStory, lessonsOn, storyAct, taught } from './story.ts';
import { festivalDays, tasteOffResult } from './calendar.ts';
import { ownedRecipes } from './recipes.ts';

export type GoalSlot = 'short' | 'medium' | 'long';
export const GOAL_SLOTS: GoalSlot[] = ['short', 'medium', 'long'];
export interface GoalState {
  slots: Partial<Record<GoalSlot, string>>; // the goal each slot shows
  done: string[]; // goals Lottie has ticked off (and paid)
  sales?: { day: number; target: number }; // today's sales goal
  peak?: number; // Endless: the score to top next
  worth?: number; // the medium goal of last resort: Net Worth to reach
}
/**
 * A goal a slot could show. `urgent`: a lesson or story goal, which takes the slot from whatever it shows.
 * `filler`: a goal of last resort (Net Worth, the Peak), which gives the slot up to anything else.
 */
type Candidate = Goal & { id: string; urgent?: boolean; filler?: boolean };

/**
 * Goals from other systems (seam): Kids' Lemonade Day, the mystery Sabotage, Call the Big Squeeze. A provider's goal
 * takes its slot ahead of the rest, wears the page icon and is paid like any other.
 */
export const GOAL_PROVIDERS: { id: string; slot: GoalSlot; goal: (s: GameState) => Goal | null }[] = [];

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);
/** 1,200 (Lottie's goals are checked every few game minutes: a plain format, not Intl's). */
const commas = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const whole = (n: number) => `$${commas(n)}`;
const round2 = (n: number) => Math.round(n * 100) / 100;
/** Two significant figures, so targets and rewards read like Lottie wrote them. */
export const nice = (n: number) => {
  if (n < 10) return Math.max(1, Math.round(n));
  const p = 10 ** (Math.floor(Math.log10(n)) - 1);
  return Math.round(n / p) * p;
};
const lowerThe = (name: string) => name.replace(/^The /, 'the ');
const DEX = 'Dex Moody';
/** Day 6's lesson: station Dex for the night (story.ts posts him itself, unpaid, if nobody does). */
export const DEX_LESSON = 'lesson-dex';
/** Plot types a stand can go up on. */
const STAND_PLOTS: string[] = ['street', 'prime', 'landmark'];
const maxLevel = (s: GameState) => playerStands(s).reduce((m, p) => Math.max(m, s.plots[p.id].stand!.level), 0);
/** The plots you own: the medium slot's checks read them once and look at them many times. */
const minePlots = (s: GameState) => PLOTS.filter((p) => s.plots[p.id].owner === 'player');
const standIn = (s: GameState, d: DistrictId, mine = minePlots(s)) => mine.some((p) => p.district === d && !!s.plots[p.id].stand);
const ownsFacility = (s: GameState, kind: FacilityKind, mine = minePlots(s)) => mine.some((p) => s.plots[p.id].facility?.kind === kind);
/** The selected stand if it's yours and standing (a plain read: unlike selectedStand it never moves the selection). */
const ownStand = (s: GameState) => {
  const ps = s.plots[s.selected];
  return ps?.owner === 'player' && ps.stand && !ps.stand.wrecked ? ps.stand : null;
};

/** Is there a plot left for one more stand (not yours yet, or yours and empty)? With none, "one more" goals would never be met. */
const roomToGrow = (s: GameState) => PLOTS.some((p) => {
  const ps = s.plots[p.id];
  return STAND_PLOTS.includes(p.type) && (ps.owner !== 'player' || (!ps.stand && !ps.facility));
});

/** The cheapest free plot for a stand in this district (Infinity when there's none). */
function cheapestPlot(s: GameState, d: DistrictId): number {
  let best = Infinity;
  for (const p of PLOTS) if (p.district === d && STAND_PLOTS.includes(p.type) && !s.plots[p.id].owner) best = Math.min(best, plotPrice(s, p.id));
  return best;
}

/** Can a stand go up in this district now (the land is open to you, whatever it costs)? */
function districtOpen(s: GameState, d: DistrictId): boolean {
  return PLOTS.some((p) => {
    if (p.district !== d || !STAND_PLOTS.includes(p.type)) return false;
    const ps = s.plots[p.id];
    if (ps.owner === 'player') return !ps.stand;
    const b = canBuyPlot(s, p.id);
    return b.ok || /^(Needs \$|Buy land during)/.test(b.why);
  });
}

/** How close the selected stand's recipe and sweetness come to the best pick in your recipe book for the forecast and today's crowd (1 = a match). */
export function recipeMatch(s: GameState): number {
  const st = ownStand(s);
  if (!st) return 0;
  const w = s.forecast;
  const now = averageStopChance(s, s.selected, w);
  const r0 = st.recipe, sw0 = st.sweetness;
  let best = now;
  for (const r of ownedRecipes(s)) {
    for (const sw of ['less', 'classic', 'extra'] as Sweetness[]) { st.recipe = r; st.sweetness = sw; best = Math.max(best, averageStopChance(s, s.selected, w)); }
  }
  st.recipe = r0; st.sweetness = sw0;
  return best > 0 ? now / best : 1;
}

/** Today's sales goal: most of what every stand should sell on the forecast, set at dawn. */
export function salesTarget(s: GameState): number {
  if (s.goals?.sales?.day === s.day) return s.goals.sales.target;
  const cups = playerStands(s).reduce((a, p) => a + expectedCups(s, p.id, s.forecast), 0);
  return Math.max(CUPS_PER_PITCHER, nice(cups * SALES_GOAL_SHARE));
}

/** What ticking off a goal in this slot pays: a share of an average recent day's sales. */
export function goalReward(s: GameState, slot: GoalSlot): number {
  const days = s.history.slice(-3);
  const avg = days.length ? days.reduce((a, t) => a + t.revenue, 0) / days.length : 0;
  return Math.max(GOAL_REWARD[slot].min, nice(avg * GOAL_REWARD[slot].share));
}

// ---------- the candidates for each slot, most important first ----------

function shortGoals(s: GameState): Candidate[] {
  const out: Candidate[] = [];
  if (lessonsOn(s)) {
    const sold = s.today.customers;
    const lesson = (g: Omit<Candidate, 'urgent'>) => out.push({ ...g, urgent: true });
    if (s.day === 1) lesson({ id: 'lesson-pitcher', text: 'Sell out your first pitcher', progress: sold / CUPS_PER_PITCHER, done: sold >= CUPS_PER_PITCHER });
    // Met when you open with the right pitcher for the forecast, so the lesson is there to see at Morning Prep.
    if (s.day === LESSON_DAY.recipes) { const m = recipeMatch(s); lesson({ id: 'lesson-recipe', text: 'Match a recipe to the weather', progress: m, done: s.phase !== 'prep' && m >= 0.98 }); }
    if (s.day === 3) {
      const stands = playerStands(s);
      const selling = stands.filter((p) => s.phase !== 'prep' && s.plots[p.id].stand!.day.customers > 0).length;
      const clean = s.today.walkedPast.soldOut === 0;
      lesson({ id: 'lesson-two-stands', text: 'Run both stands, no sell-outs', progress: (Math.min(2, stands.length) + (clean ? selling : 0)) / 4, done: s.phase === 'report' && selling >= 2 && clean });
    }
    const dex = s.guards.find((g) => g.name === DEX);
    if (s.day === LESSON_DAY.crew && dex) lesson({ id: DEX_LESSON, text: 'Station Dex for the night', progress: dex.post ? 1 : 0, done: !!dex.post });
  }
  const target = salesTarget(s);
  out.push({ id: `sales-${s.day}`, text: `Sell ${commas(target)} cups today`, progress: s.today.customers / target, done: s.today.customers >= target });
  return out;
}

function mediumGoals(s: GameState): Candidate[] {
  const out: Candidate[] = [];
  const cash = s.cash;
  const lvl = maxLevel(s);
  const stands = playerStands(s).length;
  const lessons = lessonsOn(s);
  const mine = minePlots(s);
  const oldtown = standIn(s, 'oldtown', mine);
  // Act 1's lessons, newest first; the Wooden Stand is the first session's goal from Day 1. Week 2's Old Town
  // corner is a story beat in the campaign (page icon) and a lesson elsewhere.
  if ((lessons || hasStory(s)) && s.day >= LESSON_DAY.land && (s.rank >= DISTRICT_RANK.oldtown || oldtown)) {
    const owns = mine.some((p) => p.district === 'oldtown');
    out.push({ id: 'beat-oldtown', text: 'Open a stand in Old Town', progress: oldtown ? 1 : owns ? 0.8 : Math.min(0.6, cash / cheapestPlot(s, 'oldtown')), done: oldtown, story: hasStory(s), urgent: true });
  }
  if (lessons) {
    if (s.day >= LESSON_DAY.marketing) out.push({ id: 'lesson-sign', text: 'Paint your first sign', progress: s.brandTier ? 1 : cash / BRAND_TIERS[0].cost, done: s.brandTier >= 1, urgent: true });
    const corner = s.plots[LOTTIES_CORNER];
    if (s.day >= LESSON_DAY.defense && corner.owner === 'player') out.push({ id: 'lesson-fence', text: 'Fence the Corner', progress: corner.defense.tier ? 1 : cash / PERIMETERS[0].cost, done: corner.defense.tier >= 1, urgent: true });
    out.push({ id: 'lesson-wooden', text: 'Build the Wooden Stand', progress: lvl >= 2 ? 1 : cash / STAND_LEVELS[1].cost, done: lvl >= 2, urgent: true });
  }
  // Then the next unlock: a bigger stand, signs, the crew, new districts, VIP facilities.
  for (let L = 2; L <= STAND_LEVELS.length; L++) {
    const next = STAND_LEVELS[L - 1];
    if (s.rank >= STAND_RANK_GATE[L - 1] || lvl >= L) out.push({ id: `level-${L}`, text: `Build ${lowerThe(next.name)}`, progress: lvl >= L ? 1 : cash / next.cost, done: lvl >= L });
  }
  for (const t of BRAND_TIERS) {
    if (taught(s, 'marketing') && s.rank >= t.rank || s.brandTier >= t.tier) out.push({ id: `brand-${t.tier}`, text: `Put up ${t.name}`, progress: s.brandTier >= t.tier ? 1 : cash / t.cost, done: s.brandTier >= t.tier });
  }
  if (s.rank >= HIRE_RANK && taught(s, 'crew')) out.push({ id: 'guards-2', text: 'Hire a guard', progress: Math.min(1, s.guards.length / 2), done: s.guards.length >= 2 });
  for (const d of DISTRICTS) {
    if (d.id === 'maple' || (d.id === 'oldtown' && out.some((g) => g.id === 'beat-oldtown'))) continue;
    const there = standIn(s, d.id, mine);
    if (there || (taught(s, 'land') && districtOpen(s, d.id))) out.push({ id: `district-${d.id}`, text: `Open a stand in ${d.name}`, progress: there ? 1 : 0, done: there });
  }
  for (const kind of Object.keys(FACILITIES) as FacilityKind[]) {
    const f = FACILITIES[kind];
    const built = ownsFacility(s, kind, mine);
    if (s.rank >= f.ranks[0] || built) out.push({ id: `facility-${kind}`, text: `Build a ${f.names[kind === 'helipad' ? 1 : 0]}`, progress: built ? 1 : cash / f.costs[0], done: built });
  }
  if (isEndless(s)) {
    // Endless Summer: Full Control of a district you hold, more Citrus Palaces, a Supply Deal.
    for (const d of DISTRICTS) {
      const c = districtControl(s, d.id);
      if (c.mine) out.push({ id: `control-${d.id}`, text: `Take ${d.name} to Full Control`, progress: c.share, done: c.share >= 1 });
    }
    const palaces = playerStands(s).filter((p) => s.plots[p.id].stand!.level >= 5).length;
    const more = palaces < stands || roomToGrow(s) ? 1 : 0;
    if (s.rank >= STAND_RANK_GATE[4]) for (let n = 1; n <= palaces + more; n++) out.push({ id: `palace-${n}`, text: n === 1 ? 'Build a Citrus Palace' : 'Open another Citrus Palace', progress: palaces / n, done: palaces >= n });
    if (s.rank >= 8) out.push({ id: 'deal', text: 'Land a Supply Deal', progress: 0, done: s.orders.some((o) => o.tier === 'deal') });
  }
  // One more stand to open while there's land for it, then (never dry) the empire's worth.
  for (let n = 2; n <= stands + (roomToGrow(s) ? 1 : 0); n++) out.push({ id: `stands-${n}`, text: n === 2 ? 'Open a second stand' : `Run ${n} stands`, progress: stands / n, done: stands >= n });
  const worth = s.goals?.worth ?? nice(successScore(s) * 1.25);
  out.push({ id: `worth-${worth}`, text: `Grow Net Worth to ${whole(worth)}`, progress: successScore(s) / worth, done: successScore(s) >= worth, filler: true });
  return out;
}

/** How far along a climax is: the HQ's assault rank, then the faction's plots falling away. */
function climaxProgress(s: GameState, r: RivalId): number {
  if (!s.rivals[r].alive) return 1;
  const need = RANKS[HQS[r].rank - 1].ss;
  if (successScore(s) < need) return 0.5 * successScore(s) / need;
  const peak = Math.max(1, s.rivals[r].peakPlots);
  const left = PLOTS.filter((p) => s.plots[p.id].owner === r).length;
  return 0.5 + 0.5 * (1 - left / peak);
}

function rankGoals(s: GameState): Candidate[] {
  const out: Candidate[] = [];
  const score = successScore(s);
  for (let r = 2; r <= Math.min(RANKS.length, s.rank + 1); r++) {
    const R = RANKS[r - 1];
    out.push({ id: `rank-${r}`, text: `Reach Rank ${r}, ${R.title}`, progress: score / R.ss, done: s.rank >= r });
  }
  return out;
}

function bayGoal(s: GameState): Candidate {
  const d = dominationProgress(s);
  const out = 5 - d.rivalsLeft.length;
  return { id: 'bay', text: `Own the Bay: ${out}/5 rivals out`, progress: (out / 5 + d.majority / d.districts) / 2, done: d.done };
}

function peakGoal(s: GameState): Candidate {
  const target = s.goals?.peak ?? nice(Math.max(s.peakScore, successScore(s)) * 1.1);
  return { id: `peak-${target}`, text: `Top your best: ${whole(target)}`, progress: successScore(s) / target, done: successScore(s) >= target, filler: true };
}

function longGoals(s: GameState): Candidate[] {
  const endless = isEndless(s);
  if (hasStory(s) && !endless) {
    // The campaign: each act's goal, until the act's climax moves the story on.
    const act = storyAct(s);
    const out: Candidate[] = [];
    const fair = act === 1 ? summerFairGoal(s) : null;
    if (fair) out.push(fair);
    for (let a = 1; a <= act; a++) out.push(actGoal(s, a, act));
    if (act === 5 && !s.rivals.sourwood.alive) out.push(bayGoal(s));
    return out;
  }
  const win = winCondition(s);
  if (!endless && win === 'economic') return [{ id: 'econ', text: `Reach ${whole(s.settings.target)}`, progress: successScore(s) / s.settings.target, done: successScore(s) >= s.settings.target }];
  if (!endless && win === 'domination') return [...rankGoals(s).filter((g) => g.done || s.rank < 3), bayGoal(s)];
  // Endless Summer (and Sandbox with no end): Rank 10 first, then the Peak Success Score, again and again.
  return [...rankGoals(s), peakGoal(s)];
}

/**
 * Act 1's climax as a beat goal (spec walkthrough, Day 12: "win the Summer Fair Taste-Off on Day 14"), from the fair's
 * first day. Judged at closing on its last day (src/sim/calendar.ts): a win pays, a loss takes it off the card.
 */
function summerFairGoal(s: GameState): Candidate | null {
  const { from, to } = festivalDays('summerFair', 1);
  const result = tasteOffResult(s, 'summerFair', 1);
  if (s.day < from || (result && result.winner !== 'player')) return null;
  const won = !!result;
  return { id: 'beat-summer-fair', text: `Win the Summer Fair Taste-Off on Day ${to}`, progress: won ? 1 : (s.day - from) / (to - from + 1), done: won, story: true, urgent: true };
}

function actGoal(s: GameState, a: number, act: number): Candidate {
  const done = a < act || (a === 5 && !s.rivals.sourwood.alive);
  const g = (text: string, progress: number): Candidate => ({ id: `act-${a}`, text, progress: done ? 1 : progress, done, story: true, urgent: true });
  switch (a) {
    case 1: { const fair = festivalDays('summerFair', 1).to; return g('Learn the trade, one idea a day', (Math.min(s.day, fair + 1) - 1) / fair); } // to the Summer Fair
    case 2: return g('Take the Boardwalk from Brock', climaxProgress(s, 'blenders'));
    case 3: return g('Find who keeps spoiling your stock', climaxProgress(s, 'coldbrew'));
    case 4: return g('Win a helipad and a pier, topple FizzCo', 0.25 * +ownsFacility(s, 'helipad') + 0.25 * +ownsFacility(s, 'pier') + 0.5 * climaxProgress(s, 'fizzco'));
    default: return s.rank >= HQS.sourwood.rank
      ? g('Call the Big Squeeze', climaxProgress(s, 'sourwood')) // no timer (spec Act 5)
      : g('Outlast the Syndicate, then Call the Big Squeeze', successScore(s) / RANKS[HQS.sourwood.rank - 1].ss);
  }
}

function candidates(s: GameState, slot: GoalSlot): Candidate[] {
  const provided: Candidate[] = [];
  for (const p of GOAL_PROVIDERS) {
    if (p.slot !== slot) continue;
    const g = p.goal(s);
    if (g) provided.push({ ...g, id: `${p.id}:${g.text}`, story: true, urgent: true });
  }
  const own = slot === 'short' ? shortGoals(s) : slot === 'medium' ? mediumGoals(s) : longGoals(s);
  return [...provided, ...own].map((g) => ({ ...g, progress: clamp01(g.progress) }));
}

const live = (s: GameState, g: Candidate) => !g.done && !s.goals?.done.includes(g.id);

/**
 * The goal a slot shows next: the one it shows now while that's still open, unless a lesson or story goal ahead of it
 * steps in (or it's a goal of last resort and anything else opens up); otherwise the first open goal.
 */
function pickGoal(s: GameState, list: Candidate[], cur: string | undefined): Candidate | undefined {
  const i = list.findIndex((g) => g.id === cur);
  const now = list[i];
  if (now && live(s, now) && !now.filler && !list.slice(0, i).some((g) => g.urgent && live(s, g))) return now;
  return list.find((g) => live(s, g));
}

// ---------- what the card shows, and ticking goals off ----------

/** Lottie's 3 goals as the card shows them: short, medium, long. Reads the state, changes nothing. */
export function goalsNow(s: GameState): Goal[] {
  return GOAL_SLOTS.map((slot) => {
    const list = candidates(s, slot);
    const cur = s.goals?.slots[slot];
    const g = list.find((x) => x.id === cur) ?? list.find((x) => live(s, x)) ?? list[list.length - 1];
    const done = g.done || !!s.goals?.done.includes(g.id);
    const st = ownStand(s);
    // First things first at Morning Prep: an empty stand needs stock (a nudge, not a goal: it pays nothing).
    if (slot === 'short' && !done && s.phase === 'prep' && st && servingsAvailable(st) === 0 && !st.autoRestock && taught(s, 'market')) {
      return { text: 'Buy lemons and sugar', progress: 0, done: false, slot };
    }
    return { text: g.text, progress: done ? 1 : g.progress, done, story: g.story, slot, reward: goalReward(s, slot) };
  });
}

/** Tick a goal off without paying for it (Dex took his post himself). */
export function skipGoal(s: GameState, id: string): void {
  const gs = (s.goals ??= { slots: {}, done: [] });
  if (!gs.done.includes(id)) gs.done.push(id);
}

export function migrateGoals(s: GameState): void {
  if (s.goals) return;
  s.goals = { slots: {}, done: [] };
  checkGoals(s, false); // a fresh card: pick the goals, pay nothing for what's already done
}

/**
 * Tick off the goals on the card that are done (Lottie pays for each), then fill every slot with its next live goal.
 * Called at dawn, every few game minutes, at closing and after the player acts.
 */
export function checkGoals(s: GameState, pay = true): void {
  if (gameOver(s) || (s.outcome?.result === 'won' && !isEndless(s))) return;
  const gs = (s.goals ??= { slots: {}, done: [] });
  if (gs.sales?.day !== s.day) gs.sales = { day: s.day, target: salesTarget(s) };
  const score = successScore(s);
  // The goals of last resort never sit met: passed while off the card, they move on to a new target (unpaid).
  const shown = Object.values(gs.slots);
  if (gs.peak === undefined || (score >= gs.peak && !shown.includes(`peak-${gs.peak}`))) gs.peak = nice(Math.max(s.peakScore, score) * 1.1);
  if (gs.worth === undefined || (score >= gs.worth && !shown.includes(`worth-${gs.worth}`))) gs.worth = nice(score * 1.25);
  for (const slot of GOAL_SLOTS) {
    let list = candidates(s, slot);
    const cur = list.find((g) => g.id === gs.slots[slot]);
    if (pay && cur?.done && !gs.done.includes(cur.id)) {
      const reward = goalReward(s, slot);
      s.cash = round2(s.cash + reward);
      gs.done.push(cur.id);
      s.news.push(`✓ ${cur.text} +${whole(reward)}`); // Lottie ticks it off
      // The goals of last resort move on to a new target once they're met.
      if (cur.id.startsWith('peak-')) gs.peak = nice(Math.max(s.peakScore, successScore(s)) * 1.1);
      if (cur.id.startsWith('worth-')) gs.worth = nice(successScore(s) * 1.25);
      list = candidates(s, slot);
    }
    const next = pickGoal(s, list, gs.slots[slot]);
    if (next) gs.slots[slot] = next.id;
  }
  // Keep the list short, but never forget a goal the card still shows (or today's sales goal would pay twice).
  if (gs.done.length > 80) {
    const onCard = new Set(Object.values(gs.slots));
    const from = gs.done.length - 80;
    gs.done = gs.done.filter((id, i) => onCard.has(id) || (i >= from && !id.startsWith('sales-')));
  }
}

/** Dawn: yesterday's day goals are gone; today gets its own. */
export function goalsAtDawn(s: GameState): void {
  if (s.goals) s.goals.done = s.goals.done.filter((id) => !id.startsWith('sales-'));
  checkGoals(s);
}
