// Clubhouses (spec: Crew and combat, "A Clubhouse fills one Street plot, and
// you can own several"). A Clubhouse is a building on an empty Street plot of
// yours: its FACILITIES entry (vip.ts) makes raids, smashing, the 15% rebuild,
// guard posts and Net Worth work through PlotState.facility like any building.
// Each one upgrades on its own (6, 12, then 24 beds), and the roster holds 2
// plus the beds of every Clubhouse still standing. A guard off post waits at
// one of them: that's the reserve Ring the Bell calls (reinforce.ts), and a
// raid squad sets out from (and walks home to) where its guards wait. From L2
// the reserve trains in the Training Yard; an L3's Infirmary heals KOs a day
// faster.
import { CLUBHOUSE, CLUBHOUSE_EXTRAS, GUARD_XP_TO_LEVEL, KO_OUT_DAYS } from './balance.ts';
import { PLOT_BY_ID, PLOTS, plotType, type Plot } from './map.ts';
import type { GameState } from './economy.ts';
import { levelUp, type Guard } from './crew.ts';
import { book } from './ledger.ts'; // the Ledger: each cash movement on its row
import { chickenSoup } from './perks.ts';


const isClubhouse = (s: GameState, id: string) => s.plots[id]?.owner === 'player' && s.plots[id].facility?.kind === 'clubhouse';
const emptyStreet = (s: GameState, p: Plot) => plotType(s, p) === 'street' && s.plots[p.id].owner === 'player' && !s.plots[p.id].stand && !s.plots[p.id].facility; // land: as a Sandbox map tagged it

/** Your Clubhouses that stand (a wrecked one houses nobody till it's rebuilt). */
export const clubhouses = (s: GameState): Plot[] => PLOTS.filter((p) => isClubhouse(s, p.id) && !s.plots[p.id].facility!.wrecked);

/** Beds in this Clubhouse: none while it's wrecked. */
export function bedsAt(s: GameState, plotId: string): number {
  const f = s.plots[plotId]?.facility;
  return isClubhouse(s, plotId) && !f!.wrecked ? CLUBHOUSE[f!.level - 1].beds : 0;
}

/** Beds across all your standing Clubhouses. */
export const allBeds = (s: GameState) => clubhouses(s).reduce((a, p) => a + bedsAt(s, p.id), 0);

/** The Clubhouse a guard belongs to: their own while it stands, else your first. Null with none (Dex sleeps in the shed). */
export function clubOf(s: GameState, g: Guard): string | null {
  const all = clubhouses(s);
  return (all.find((p) => p.id === g.club) ?? all[0])?.id ?? null;
}

/** The Clubhouse a raid squad sets out from and walks home to: the one most of its guards off post wait at, nearest
 * the target on a tie. Null when none of them waits at one (all on posts, or no Clubhouse standing). */
export function squadClub(s: GameState, guardIds: readonly string[], target: string): string | null {
  const votes = new Map<string, number>();
  for (const g of s.guards) {
    const c = guardIds.includes(g.id) && !g.post ? clubOf(s, g) : null;
    if (c) votes.set(c, (votes.get(c) ?? 0) + 1);
  }
  const t = PLOT_BY_ID[target];
  let best: string | null = null, most = 0, d = Infinity;
  for (const [id, k] of votes) {
    const p = PLOT_BY_ID[id], dd = Math.hypot(p.x - t.x, p.z - t.z);
    if (k > most || (k === most && dd < d)) { best = id; most = k; d = dd; }
  }
  return best;
}

/** Guards away fighting: on a raid of yours (planned or live), or on their way to one of your plots (Ring the Bell). */
export function awayOnRaid(s: GameState): Set<string> {
  const raids = [...s.raids, ...(s.fight ? [s.fight.raid] : [])];
  return new Set(raids.flatMap((r) => [...(r.attacker === 'player' ? r.guards ?? [] : []), ...(r.bell ?? []).map((b) => b.id)]));
}

/** The reserve at a Clubhouse: guards off post waiting there, fit to fight and not away on a raid. */
export function reserveAt(s: GameState, plotId: string): Guard[] {
  const away = awayOnRaid(s);
  return s.guards.filter((g) => !g.post && g.outUntil <= s.day && !away.has(g.id) && clubOf(s, g) === plotId);
}

/** What a Clubhouse of this level has besides beds: the Training Yard from L2, the Infirmary at L3. */
export const clubExtras = (level: number) => ({ yard: level >= CLUBHOUSE_EXTRAS.yard.level, infirmary: level >= CLUBHOUSE_EXTRAS.infirmary.level });

/** The Infirmary: any L3 Clubhouse of yours still standing takes this many days off every KO. */
export const infirmaryDays = (s: GameState): number =>
  (clubhouses(s).some((p) => clubExtras(s.plots[p.id].facility!.level).infirmary) ? CLUBHOUSE_EXTRAS.infirmary.days : 0);

/** Days Out after a knockout (1, or 2 when a hatchet landed it), less the Infirmary's day, never below 0. */
export const koDays = (s: GameState, hatchet: boolean): number => Math.max(0, (hatchet ? KO_OUT_DAYS.hatchet : KO_OUT_DAYS.plain) - infirmaryDays(s) - chickenSoup(s)); // Chicken Soup: Lottie's tip (perks.ts)

/**
 * The Training Yard, at dawn: each guard who waited all day at an L2 or L3 Clubhouse (off post, not Out, not away on a
 * raid) earns a day of duty's XP, 1/daysPerLevel of the way to the next level (crew's pace of duty), and levels up
 * when it's full (crew's levelUp).
 */
export function trainingYard(s: GameState): void {
  const away = awayOnRaid(s);
  for (const g of s.guards) {
    const club = clubOf(s, g);
    if (!club || g.post || g.level >= 5 || g.outUntil > s.day - 1 || away.has(g.id) || !clubExtras(s.plots[club].facility!.level).yard) continue;
    const step = (GUARD_XP_TO_LEVEL[g.level] - GUARD_XP_TO_LEVEL[g.level - 1]) / CLUBHOUSE_EXTRAS.yard.daysPerLevel;
    g.xp = Math.round((g.xp + step) * 1e6) / 1e6;
    levelUp(s, g);
  }
}

/** Send a guard off post to wait at this Clubhouse. */
export function waitAt(s: GameState, guardId: string, plotId: string): boolean {
  const g = s.guards.find((x) => x.id === guardId);
  if (!g || !clubhouses(s).some((p) => p.id === plotId)) return false;
  g.post = null;
  g.club = plotId;
  return true;
}

/** Where the next beds go: an empty Street plot of yours, else your smallest Clubhouse that can still grow. */
export function clubhouseSite(s: GameState): string | null {
  const lot = PLOTS.find((p) => emptyStreet(s, p));
  if (lot) return lot.id;
  const grow = PLOTS.filter((p) => isClubhouse(s, p.id) && s.plots[p.id].facility!.level < CLUBHOUSE.length);
  grow.sort((a, b) => s.plots[a.id].facility!.level - s.plots[b.id].facility!.level);
  return grow[0]?.id ?? null;
}

/**
 * Old saves kept one Clubhouse level for the whole crew. It moves onto an
 * empty Street plot of yours, cost and all; with no such plot, it's paid back.
 */
export function migrateClubhouse(s: GameState): void {
  const level = Math.min(CLUBHOUSE.length, Math.max(0, Math.floor(s.clubhouse ?? 0)));
  delete s.clubhouse;
  if (!level) return;
  const cost = CLUBHOUSE.slice(0, level).reduce((a, c) => a + c.cost, 0);
  const lot = PLOTS.find((p) => emptyStreet(s, p));
  if (lot) {
    const ps = s.plots[lot.id];
    ps.facility = { kind: 'clubhouse', level };
    ps.invested += cost;
    s.news.push(`The Clubhouse now stands on ${lot.name}: ${CLUBHOUSE[level - 1].beds} beds.`);
  } else {
    book(s, 'invested', cost); // the Ledger: the old Clubhouse's cost back, off the day's profit
    s.news.push(`Lottie: "The Clubhouse needs a Street plot of its own now. Here's $${cost.toLocaleString('en-US')} back to build one."`);
  }
}
