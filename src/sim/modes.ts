// Game modes, difficulty, winning and losing (spec: Game modes and winning;
// Economy and balance: Lottie's Cookie Jar and bankruptcy; loans). Pure
// functions over GameState, like the rest of the sim.
import {
  ACTS, BELOVED_STARS, BUILDING_VALUE_SHARE, CUSTOM_RANGE, DIFFICULTY, ECONOMIC_DEFAULT_RANK, IN_THE_RED_DAYS, LOAN, MAJORITY, RANKS,
  SEASON_DAYS, STAND_LEVELS, type Difficulty, type MapSize, type Mode, type RivalId, type WinCondition,
} from './balance.ts';
import { mapDistricts, PLOTS, type DistrictId, type PlotType } from './map.ts';
import type { Blocker, GameState } from './economy.ts';
import { assetValue, playerStands, successScore } from './economy.ts';
import { book } from './ledger.ts'; // the Ledger: each cash movement on its row
import { guardWage, NO_DEFENSE } from './crew.ts';
import { beginEpilogue, storyAct } from './story.ts';
import { announceControl, awardEveryLastPlot, rivalsInPlay } from './land.ts';
import type { Grandkid } from './grandkid.ts';
import { endVictoryShow, type VictoryStage } from './victory.ts';
import { samplePeak } from './score.ts';

const round2 = (n: number) => Math.round(n * 100) / 100;
const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

export interface Settings {
  mode: Mode;
  difficulty: Difficulty;
  peaceful: boolean; // Sandbox only: no combat for anyone
  win: WinCondition; // Sandbox only; the campaign always plays for Domination, Endless for score
  target: number; // Economic win: Success Score to reach
  ironman: boolean; // one save, no reloading the last dawn
  raidPause?: boolean; // raid warnings on you auto-pause (unset: the difficulty's default, on except Cutthroat)
  custom?: CustomDifficulty; // Custom difficulty's sliders
  lessons?: boolean; // Lottie teaches one system a day (off: buttons follow rank alone); unset is on
  // land: a Sandbox map (land.ts settleMap fills these in at New Game; the campaign and Endless play the whole bay)
  map?: MapSize; // Small, Medium or Large (unset: Large)
  rivals?: RivalId[]; // the rivals that play (unset: all five)
  districts?: DistrictId[]; // the districts cut from Citrine Bay for this map (unset: all eight)
  retag?: Record<string, PlotType>; // plain plots the cut made a Dock, Field or Industrial lot, so VIP clients stay reachable
  grandkid?: Grandkid; // your name, pronouns and look (src/sim/grandkid.ts); unset is Charlie Puckett
  crew?: string; // your crew's name, as typed (src/sim/grandkid.ts); unset or blank is The Peel Patrol
}

/** Custom difficulty: each slider anywhere from Laid Back's value to Cutthroat's. */
export interface CustomDifficulty {
  raids: number; // rival raids on you, × Classic
  notice: number; // minimum raid notice, game minutes
  respectDays: number; // Respect cooldown
  bustOnly: boolean; // a lost raid only Busts your stand
  cookieJar: 'always' | 'perAct' | 'never';
}
export const customDefaults = (): CustomDifficulty => {
  const c = DIFFICULTY.classic;
  return { raids: c.raids, notice: c.notice, respectDays: c.respectDays, bustOnly: c.bustOnly, cookieJar: c.cookieJar };
};

export const defaultSettings = (over: Partial<Settings> = {}): Settings => ({
  mode: 'campaign', difficulty: 'classic', peaceful: false, win: 'domination', target: RANKS[ECONOMIC_DEFAULT_RANK - 1].ss, ironman: false, ...over,
});

export interface Outcome {
  result: 'won' | 'lost';
  how: 'domination' | 'economic' | 'squeezed' | 'runout';
  day: number;
  ending?: 'beloved' | 'iron'; // campaign Domination only
  stage?: VictoryStage; // Domination: the show before the victory screen (src/sim/victory.ts); none once it's over
  painted?: number; // real seconds the paint has run
}

/** What the run has done, for the ending: buyouts against Smashes and HQ captures. */
export interface Tally { buyouts: number; smashes: number; hqs: number }

export interface Loan { principal: number; weeksLeft: number; nextDue: number; missed: number }

/** The difficulty's rules for a run: a preset's row, or Custom's sliders on Classic's (every lookup goes through here). */
export function difficultyOf(st: Settings) {
  const row = DIFFICULTY[st.difficulty] ?? DIFFICULTY.classic;
  if (st.difficulty !== 'custom') return row;
  const c = { ...customDefaults(), ...st.custom };
  const fit = (v: number, [lo, hi]: readonly [number, number, number]) => Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));
  const jar = (['always', 'perAct', 'never'] as const).find((j) => j === c.cookieJar) ?? row.cookieJar;
  return {
    ...row, raids: fit(c.raids, CUSTOM_RANGE.raids), notice: Math.round(fit(c.notice, CUSTOM_RANGE.notice)),
    respectDays: Math.round(fit(c.respectDays, CUSTOM_RANGE.respectDays)), bustOnly: !!c.bustOnly, cookieJar: jar, threat: 0, canLose: jar !== 'always',
  };
}
export const difficulty = (s: GameState) => difficultyOf(s.settings);
/** Do raid warnings on you auto-pause this run? The player's switch, else the difficulty's default. */
export const raidPauses = (st: Settings) => st.raidPause ?? DIFFICULTY[st.difficulty].raidPause;
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

/** The campaign act: the story's own state, which advances on each act's climax (src/sim/story.ts). */
export const actOf = (s: GameState) => storyAct(s);
export const actName = (act: number) => ACTS[act - 1];

// ---------- district control and Domination ----------

/** Your share of a district's purchasable plots (civic and HQ plots don't count). */
export function districtControl(s: GameState, d: DistrictId): { mine: number; total: number; share: number } {
  const plots = PLOTS.filter((p) => p.district === d && p.type !== 'civic' && p.type !== 'hq');
  const mine = plots.filter((p) => s.plots[p.id].owner === 'player').length;
  return { mine, total: plots.length, share: plots.length ? mine / plots.length : 0 };
}

/** Domination: every rival in play gone, and a Majority in every district on the map (land: a Sandbox map's own). */
export function dominationProgress(s: GameState) {
  const rivalsLeft = rivalsInPlay(s).filter((r) => s.rivals[r].alive);
  const districts = mapDistricts(s);
  const majority = districts.filter((d) => districtControl(s, d.id).share >= MAJORITY);
  return { rivalsLeft, majority: majority.length, districts: districts.length, done: !rivalsLeft.length && majority.length === districts.length };
}

/** Called whenever land or rivals change hands, and at dawn. Returns true on the day the run is won. */
export function checkVictory(s: GameState): boolean {
  awardEveryLastPlot(s); // land: earned the moment it's true, in any mode, Endless after the win too
  if (s.outcome) return false;
  samplePeak(s); // the peak first: TARGET HIT never sits beside a lower one (score.ts)
  const win = winCondition(s);
  if (win === 'none') return false;
  const won = win === 'economic' ? successScore(s) >= s.settings.target : dominationProgress(s).done;
  if (!won) return false;
  s.outcome = { result: 'won', how: win, day: s.day, ...(win === 'domination' ? { stage: 'scenes' as const } : {}) }; // the show first (src/sim/victory.ts)
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
  endVictoryShow(s);
  beginEpilogue(s);
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
  if (amount <= 0) return { ok: false, why: 'Pick an amount' };
  const limit = loanLimit(s);
  if (amount > limit) return { ok: false, why: limit ? `The bank lends up to ${money(limit)}` : 'Nothing to borrow against yet' };
  return { ok: true };
}

/** Borrow from the First Bank of Citrine Bay, any hour: 3% a week on what's left, paid off over 4 weekly dawns. */
export function borrow(s: GameState, amount: number): boolean {
  if (!canBorrow(s, amount).ok) return false;
  book(s, 'loan', amount);
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
  if (!l || s.cash < l.principal) return false;
  book(s, 'loan', -l.principal);
  delete s.loan;
  s.news.push('Marisol: "Loan paid off. I\'ve framed the receipt."');
  return true;
}

/** A plot as Net Worth counts it: its land plus 75% of what's built on it (the bank's price when it repossesses). */
export const plotWorth = (s: GameState, plotId: string) => round2(s.plots[plotId].landValue + BUILDING_VALUE_SHARE * s.plots[plotId].invested);

/**
 * The weekly payment at dawn: principal ÷ weeks left, plus 3% interest. A miss adds the interest to what you owe and
 * still counts the week down, so the loan keeps its 4-week term and the missed share rolls into the payments left.
 * The second missed payment (in a row or not: the spec counts misses) repossesses your lowest-value plot as Net Worth
 * counts it, land plus buildings, never a Trophy, and that value comes off the loan; the count then starts over.
 */
function loanAtDawn(s: GameState): void {
  const l = s.loan;
  if (!l || s.day < l.nextDue) return;
  const interest = round2(l.principal * LOAN.weeklyRate);
  const due = loanPayment(s);
  l.nextDue = s.day + 7;
  if (s.cash >= due) {
    book(s, 'interest', -interest); // the payment's interest is a cost; the rest pays the loan down
    book(s, 'loan', -round2(due - interest));
    l.principal = round2(l.principal - (due - interest));
    l.weeksLeft--;
    if (l.weeksLeft <= 0 || l.principal < 0.01) { delete s.loan; s.news.push('Marisol: "Last loan payment made. We\'re debt-free."'); }
    return;
  }
  l.principal = round2(l.principal + interest);
  l.weeksLeft = Math.max(1, l.weeksLeft - 1);
  l.missed++;
  if (l.missed < LOAN.missesToRepossess) {
    s.news.push(`Marisol: "We missed a loan payment of ${money(due)}. One more miss and the bank takes a plot."`);
    return;
  }
  const mine = PLOTS.filter((p) => s.plots[p.id].owner === 'player' && p.type !== 'hq'); // a Trophy is never lost
  const plot = mine.sort((a, b) => plotWorth(s, a.id) - plotWorth(s, b.id) || a.id.localeCompare(b.id))[0];
  l.missed = 0;
  if (!plot) return;
  const value = plotWorth(s, plot.id);
  for (const g of s.guards) if (g.post === plot.id) g.post = null; // posted guards go back to the Clubhouse
  s.offers = s.offers.filter((o) => o.plot !== plot.id); // a VIP offer for its pad or pier lapses with it
  s.plots[plot.id] = { owner: null, stand: null, invested: 0, landValue: s.plots[plot.id].landValue, defense: NO_DEFENSE() };
  l.principal = round2(Math.max(0, l.principal - value));
  s.news.push(`REPOSSESSED! The First Bank of Citrine Bay takes ${plot.name} to cover ${money(value)} of the loan.`);
  announceControl(s);
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
      book(s, 'cookieJar', pay);
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
