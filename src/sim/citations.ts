// Sheriff Budd's Citation (spec: Reputation; canon: the Sheriff rule, the only "heat" in the game): below 2.0
// stars, each daytime raid you launch earns a Citation, a fine of about a day's income and a 2-day ban on your
// raids and HQ assaults. Election Day, each Spring, can change the rules for a year. Rivals are never cited.
// Pure functions over GameState, like the rest of the sim.
import { CITATION, ELECTION, YEAR_DAYS } from './balance.ts';
import type { Blocker, GameState } from './economy.ts';
import { alert } from './alerts.ts';
import { playScene } from './scenes.ts';
import { isEventDay } from './calendar.ts';
import { nextRandom, type Rng } from './rng.ts';
import { peaceful } from './modes.ts';
import { book } from './ledger.ts';

export type Platform = keyof typeof ELECTION;

export interface Citation { day: number; fine: number; target: string }

export interface CitationState {
  /** No player raids or HQ assaults through this day. */
  banUntil?: number;
  /** The Citations written this run, newest last (the last year's tip Election Day toward the tough platform). */
  written?: Citation[];
  /** The last Election Day: the platform Mayor Fontaine won on, and the day its rules run out. */
  election?: { day: number; platform: Platform; until: number };
}

const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

/** The Citation rules today: the base rule, or the platform the last Election Day put in. */
export function citationRules(s: GameState): { stars: number; fineDays: number; banDays: number } {
  const e = s.citations?.election;
  const p = e && e.until >= s.day ? ELECTION[e.platform] : null;
  return { stars: p?.stars ?? CITATION.stars, fineDays: CITATION.fineDays, banDays: CITATION.banDays };
}

/** About a day's income: the last week's average daily sales (today's so far before the first close), never more than your cash. */
export function citationFine(s: GameState): number {
  const week = s.history.slice(-7);
  const avg = week.length ? week.reduce((a, d) => a + d.revenue, 0) / week.length : s.today.revenue;
  return Math.min(Math.max(0, Math.floor(s.cash)), Math.max(0, Math.round(avg * citationRules(s).fineDays)));
}

/** The Citation a raid would earn (`daytime`: its fight lands 08:00–20:00): below the line, read before the raid costs any stars. */
export function citationRisk(s: GameState, daytime: boolean): { fine: number; banDays: number; stars: number } | null {
  const r = citationRules(s);
  if (!daytime || s.reputation >= r.stars) return null;
  return { fine: citationFine(s), banDays: r.banDays, stars: r.stars };
}

/** The first day your raids are allowed again, while a Citation's ban runs. */
export const raidBanEnds = (s: GameState): number | null => {
  const until = s.citations?.banUntil;
  return until !== undefined && until >= s.day ? until + 1 : null;
};

/** canRaid and canAssault: Sheriff Budd's ban, with its reason. */
export function raidBan(s: GameState): Extract<Blocker, { ok: false }> | null {
  const ends = raidBanEnds(s);
  return ends === null ? null : { ok: false, why: `Citation: no raids till Day ${ends}` };
}

/** planRaid calls this for a daytime raid it just sent, when citationRisk said so before launch: the fine comes out
 * of the till, the ban starts, and Sheriff Budd brings the first one to the Corner herself. */
export function cite(s: GameState, target: string): Citation {
  const r = citationRules(s);
  const fine = citationFine(s);
  book(s, 'citations', -fine);
  const c = (s.citations ??= {});
  c.banUntil = s.day + r.banDays;
  const ticket: Citation = { day: s.day, fine, target };
  (c.written ??= []).push(ticket);
  if (c.written.length > 20) c.written.splice(0, c.written.length - 20);
  const ends = c.banUntil + 1;
  alert(s, { kind: 'note', text: `Sheriff Budd's Citation: ${money(fine)}, no raids till Day ${ends}.`, plot: target });
  playScene(s, 'budd', { recap: `Sheriff Budd wrote you a Citation for a daytime raid: ${money(fine)}, and no raids till Day ${ends}.` });
  return ticket;
}

/** Citations in the year before `day`. */
const lastYear = (s: GameState, day = s.day) => (s.citations?.written ?? []).filter((c) => c.day > day - YEAR_DAYS).length;

/** Election Day: Mayor Fontaine ("loyal to whoever is winning") wins again, on whichever platform the town wants.
 * Every Citation in the last year tips it toward the tough one. The Bugle prints the result (a wire line). */
export function holdElection(s: GameState, rng: Rng): Platform {
  const ids = Object.keys(ELECTION) as Platform[];
  const weight = (p: Platform) => ELECTION[p].weight + (p === 'tough' ? lastYear(s) : 0);
  let x = nextRandom(rng) * ids.reduce((a, p) => a + weight(p), 0);
  let platform = ids[0];
  for (const p of ids) { x -= weight(p); if (x <= 0) { platform = p; break; } }
  (s.citations ??= {}).election = { day: s.day, platform, until: s.day + YEAR_DAYS - 1 };
  s.news.push(ELECTION[platform].news);
  return platform;
}

/** crewAtDawn: Election Day's vote, and an expired ban dropped. */
export function citationsAtDawn(s: GameState, rng: Rng): void {
  const c = s.citations;
  if (c?.banUntil !== undefined && c.banUntil < s.day) delete c.banUntil;
  if (!peaceful(s) && isEventDay(s, 'electionDay') && c?.election?.day !== s.day) holdElection(s, rng); // Peaceful: no raids to cite
}

/** Saves: the field is optional; drop anything that isn't the right shape. Idempotent (migrateCrew calls it each load). */
export function migrateCitations(s: GameState): void {
  const c = s.citations;
  if (!c) return;
  if (typeof c !== 'object') { delete s.citations; return; }
  if (c.banUntil !== undefined && typeof c.banUntil !== 'number') delete c.banUntil;
  if (c.written !== undefined) c.written = Array.isArray(c.written) ? c.written.filter((t) => t && typeof t.day === 'number' && typeof t.fine === 'number') : [];
  if (c.election && !(c.election.platform in ELECTION)) delete c.election;
}
