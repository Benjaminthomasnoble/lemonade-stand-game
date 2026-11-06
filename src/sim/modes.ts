// Game modes, difficulty, winning and losing (spec: Game modes and winning;
// Economy and balance: Lottie's Cookie Jar and bankruptcy; loans). Pure
// functions over GameState, like the rest of the sim.
import {
  ACT_BY_RANK, ACTS, BELOVED_STARS, DIFFICULTY, ECONOMIC_DEFAULT_RANK, FACTIONS, IN_THE_RED_DAYS, LOAN, MAJORITY, RANKS,
  SEASON_DAYS, STAND_LEVELS, type Difficulty, type Mode, type RivalId, type WinCondition,
} from './balance.ts';
import { DISTRICTS, PLOTS, type DistrictId } from './map.ts';
import type { Blocker, GameState } from './economy.ts';
import { assetValue, playerStands, successScore } from './economy.ts';
import { guardWage, NO_DEFENSE } from './crew.ts';

const round2 = (n: number) => Math.round(n * 100) / 100;
const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const RIVALS = Object.keys(FACTIONS) as RivalId[];

export interface Settings {
  mode: Mode;
  difficulty: Difficulty;
  peaceful: boolean; // Sandbox only: no combat for anyone
  win: WinCondition; // Sandbox only; the campaign always plays for Domination, Endless for score
  target: number; // Economic win: Success Score to reach
  ironman: boolean; // one save, no reloading the last dawn
}

export const defaultSettings = (over: Partial<Settings> = {}): Settings => ({
  mode: 'campaign', difficulty: 'classic', peaceful: false, win: 'domination', target: RANKS[ECONOMIC_DEFAULT_RANK - 1].ss, ironman: false, ...over,
});

export interface Outcome {
  result: 'won' | 'lost';
  how: 'domination' | 'economic' | 'squeezed' | 'runout';
  day: number;
  ending?: 'beloved' | 'iron'; // campaign Domination only
}

/** What the run has done, for the ending: buyouts against Smashes and HQ captures. */
export interface Tally { buyouts: number; smashes: number; hqs: number }

export interface Loan { principal: number; weeksLeft: number; nextDue: number; missed: number }

export const difficulty = (s: GameState) => DIFFICULTY[s.settings.difficulty];
export const peaceful = (s: GameState) => s.settings.mode === 'sandbox' && s.settings.peaceful;
export const winCondition = (s: GameState): WinCondition =>
  s.settings.mode === 'campaign' ? 'domination' : s.settings.mode === 'endless' ? 'none' : s.settings.win;
/** Victory happened and the player kept squeezing, or the run is Endless Summer from the start. */
export const isEndless = (s: GameState) => s.settings.mode === 'endless' || s.endlessSince !== undefined;
export const gameOver = (s: GameState) => s.outcome?.result === 'lost';

export function bump(s: GameState, k: keyof Tally): void {
  s.tally ??= { buyouts: 0, smashes: 0, hqs: 0 };
  s.tally[k]++;
}

// ---------- acts ----------

/** The campaign act, from the rank ladder until the story's own beats drive it. */
export const actOf = (s: GameState) => ACT_BY_RANK[s.rank - 1] ?? 5;
export const actName = (act: number) => ACTS[act - 1];

// ---------- district control and Domination ----------

/** Your share of a district's purchasable plots (civic and HQ plots don't count). */
export function districtControl(s: GameState, d: DistrictId): { mine: number; total: number; share: number } {
  const plots = PLOTS.filter((p) => p.district === d && p.type !== 'civic' && p.type !== 'hq');
  const mine = plots.filter((p) => s.plots[p.id].owner === 'player').length;
  return { mine, total: plots.length, share: plots.length ? mine / plots.length : 0 };
}

export function dominationProgress(s: GameState) {
  const rivalsLeft = RIVALS.filter((r) => s.rivals[r].alive);
  const majority = DISTRICTS.filter((d) => districtControl(s, d.id).share >= MAJORITY);
  return { rivalsLeft, majority: majority.length, districts: DISTRICTS.length, done: !rivalsLeft.length && majority.length === DISTRICTS.length };
}

export const everyLastPlot = (s: GameState) => PLOTS.every((p) => p.type === 'civic' || s.plots[p.id].owner === 'player');

/** Called whenever land or rivals change hands, and at dawn. Returns true on the day the run is won. */
export function checkVictory(s: GameState): boolean {
  if (s.outcome) return false;
  const win = winCondition(s);
  if (win === 'none') return false;
  const won = win === 'economic' ? successScore(s) >= s.settings.target : dominationProgress(s).done;
  if (!won) return false;
  s.outcome = { result: 'won', how: win, day: s.day };
  if (win === 'domination') {
    if (s.settings.mode === 'campaign') s.outcome.ending = endingFor(s);
    s.news.push('YOU OWN THE BAY! Every rival is gone and every district flies Lottie\'s colors.');
  } else {
    s.news.push(`TARGET HIT! Lottie's Lemonade passes ${money(s.settings.target)} in Success Score.`);
  }
  return true;
}

/** Beloved: more buyouts than Smashes and HQ captures, with 4 stars or better. Anything else is the Iron Pitcher. */
export function endingFor(s: GameState): 'beloved' | 'iron' {
  const t = s.tally ?? { buyouts: 0, smashes: 0, hqs: 0 };
  return t.buyouts > t.smashes + t.hqs && s.reputation >= BELOVED_STARS ? 'beloved' : 'iron';
}

export const ENDINGS = {
  beloved: {
    title: "The Bay's Beloved Lemon Mogul",
    bugle: 'TOWN THROWS PARADE FOR BAY\'S BELOVED LEMON MOGUL; MOGUL INSISTS ON PAYING',
    lottie: 'You took the whole town, and it still waves at you. Now that\'s a lemonade stand.',
  },
  iron: {
    title: 'The Iron Pitcher',
    bugle: 'THE IRON PITCHER: LOTTIE\'S RULES EVERY CORNER. CORNERS ADVISED TO BEHAVE.',
    lottie: 'You took the whole town, kid. Next summer, try asking it nicely.',
  },
} as const;

/** After a win: keep the clock running for a higher Peak Success Score. */
export function keepSqueezing(s: GameState): boolean {
  if (s.outcome?.result !== 'won' || s.endlessSince !== undefined) return false;
  s.endlessSince = s.day;
  s.news.push('ENDLESS SUMMER: Lottie\'s Lemonade keeps squeezing. How high can the score go?');
  return true;
}

// ---------- loans ----------

/** Up to half your non-cash Net Worth, less what you already owe. */
export function loanLimit(s: GameState): number {
  return Math.max(0, Math.floor((assetValue(s) * LOAN.share - (s.loan?.principal ?? 0)) / 50) * 50);
}

export function canBorrow(s: GameState, amount: number): Blocker {
  if (gameOver(s)) return { ok: false, why: 'The run is over' };
  if (s.phase === 'open') return { ok: false, why: 'The bank sees you at Morning Prep or after closing' };
  if (amount <= 0) return { ok: false, why: 'Pick an amount' };
  const limit = loanLimit(s);
  if (amount > limit) return { ok: false, why: limit ? `The bank lends up to ${money(limit)}` : 'Nothing to borrow against yet' };
  return { ok: true };
}

/** Borrow from the First Bank of Citrine Bay: 3% a week on what's left, paid off over 4 weekly dawns. */
export function borrow(s: GameState, amount: number): boolean {
  if (!canBorrow(s, amount).ok) return false;
  s.cash = round2(s.cash + amount);
  if (s.loan) {
    s.loan.principal = round2(s.loan.principal + amount);
    s.loan.weeksLeft = LOAN.weeks;
  } else {
    s.loan = { principal: amount, weeksLeft: LOAN.weeks, nextDue: s.day + 7, missed: 0 };
  }
  s.news.push(`Marisol: "The bank lends us ${money(amount)}. The bank loves you. That's what worries me."`);
  return true;
}

export function loanPayment(s: GameState): number {
  const l = s.loan;
  if (!l) return 0;
  return round2(l.principal / l.weeksLeft + l.principal * LOAN.weeklyRate);
}

/** Pay off what's left early (no interest on weeks not yet started). */
export function repayLoan(s: GameState): boolean {
  const l = s.loan;
  if (!l || s.cash < l.principal || s.phase === 'open') return false;
  s.cash = round2(s.cash - l.principal);
  delete s.loan;
  s.news.push('Marisol: "Loan paid off. I\'ve framed the receipt."');
  return true;
}

function loanAtDawn(s: GameState): void {
  const l = s.loan;
  if (!l || s.day < l.nextDue) return;
  const interest = round2(l.principal * LOAN.weeklyRate);
  const due = loanPayment(s);
  l.nextDue = s.day + 7;
  if (s.cash >= due) {
    s.cash = round2(s.cash - due);
    s.today.upkeep = round2(s.today.upkeep + interest);
    l.principal = round2(l.principal - (due - interest));
    l.weeksLeft--;
    l.missed = 0;
    if (l.weeksLeft <= 0 || l.principal < 0.01) { delete s.loan; s.news.push('Marisol: "Last loan payment made. We\'re debt-free."'); }
    return;
  }
  // Missed: the interest is added to what you owe, and two misses in a row cost a plot.
  l.principal = round2(l.principal + interest);
  l.missed++;
  if (l.missed < LOAN.missesToRepossess) {
    s.news.push(`Marisol: "We missed a loan payment of ${money(due)}. One more and the bank takes a plot."`);
    return;
  }
  const mine = PLOTS.filter((p) => s.plots[p.id].owner === 'player' && p.type !== 'hq');
  const plot = mine.sort((a, b) => s.plots[a.id].landValue - s.plots[b.id].landValue)[0];
  l.missed = 0;
  if (!plot) return;
  const value = s.plots[plot.id].landValue;
  s.plots[plot.id] = { owner: null, stand: null, invested: 0, landValue: value, defense: NO_DEFENSE() };
  l.principal = round2(Math.max(0, l.principal - value));
  s.news.push(`REPOSSESSED! The First Bank of Citrine Bay takes ${plot.name} to cover ${money(value)} of the loan.`);
  if (l.principal < 0.01) delete s.loan;
}

// ---------- In the Red, Lottie's Cookie Jar and losing ----------

/** The Cookie Jar refills once per act in the campaign, once per season in Sandbox and Endless. */
export function cookieJarPeriod(s: GameState): string {
  return s.settings.mode === 'campaign' && !isEndless(s) ? `act${actOf(s)}` : `season${Math.floor((s.day - 1) / SEASON_DAYS)}`;
}

export function cookieJarReady(s: GameState): boolean {
  const rule = difficulty(s).cookieJar;
  if (rule === 'always') return true;
  if (rule === 'never') return false;
  return !(s.cookieJar ?? []).includes(cookieJarPeriod(s));
}

/** A day of running costs: stand upkeep plus guard wages. */
export function dailyCosts(s: GameState): number {
  const upkeep = playerStands(s).reduce((a, p) => a + STAND_LEVELS[s.plots[p.id].stand!.level - 1].upkeep, 0);
  return upkeep + s.guards.reduce((a, g) => a + guardWage(g), 0);
}

/** Days left to get back above $0 before the Cookie Jar (or the end). 0 when not In the Red. */
export const redDaysLeft = (s: GameState) => (s.redDays ? Math.max(0, IN_THE_RED_DAYS - s.redDays + 1) : 0);

/** At dawn, after wages: loans fall due, In the Red counts down, and a run can end. */
export function fortunesAtDawn(s: GameState): void {
  if (s.outcome?.result === 'lost') return;
  loanAtDawn(s);
  const d = difficulty(s);
  if (s.cash >= 0) {
    if (s.redDays) s.news.push('Marisol: "We\'re back in the black. Let\'s stay here."');
    s.redDays = 0;
  } else {
    s.redDays = (s.redDays ?? 0) + 1;
    if (s.redDays <= IN_THE_RED_DAYS) {
      const left = redDaysLeft(s);
      s.news.push(`IN THE RED! Cash is ${money(s.cash)}. ${left} day${left === 1 ? '' : 's'} to get back above $0: sell, borrow from Marisol, or cut costs.`);
    } else if (cookieJarReady(s)) {
      const pay = round2(-s.cash + dailyCosts(s));
      s.cash = round2(s.cash + pay);
      s.redDays = 0;
      if (d.cookieJar === 'perAct') (s.cookieJar ??= []).push(cookieJarPeriod(s));
      s.news.push(`Lottie's Cookie Jar! Grandma covers ${money(pay)}: "Don't make me bake for this twice${d.cookieJar === 'always' ? '' : ' this ' + (cookieJarPeriod(s).startsWith('act') ? 'act' : 'season')}."`);
    } else {
      s.outcome = { result: 'lost', how: 'squeezed', day: s.day };
      s.news.push('SQUEEZED OUT! Lottie\'s Lemonade closes its books after 3 days In the Red.');
      return;
    }
  }
  if (d.canLose && !playerStands(s).length && s.cash < STAND_LEVELS[0].cost) {
    s.outcome = { result: 'lost', how: 'runout', day: s.day };
    s.news.push('RUN OUT OF TOWN! No stands left, and not enough cash for a new Folding Table.');
    return;
  }
  checkVictory(s);
}
