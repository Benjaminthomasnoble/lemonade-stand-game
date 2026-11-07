// What each top-bar meter says on hover or long-press (spec: "Every meter
// explains itself on hover or long-press; Threat, for example, names the rank
// that set it"; the Success Score gives its breakdown, today's change and the
// Peak). Plain text with line breaks, for title attributes.
import {
  BUILDING_VALUE_SHARE, assetValue, difficulty, PLOTS, RANKS, redDaysLeft, seasonDay, seasonOf, successScore, threatLevel,
  type GameState,
} from '../sim/economy.ts';

const whole = (n: number) => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US');
const signed = (n: number) => `${n >= 0 ? '+' : '-'}${whole(Math.abs(n))}`;

/** The Success Score's parts: cash, land at market value, 75% of buildings, stock at cost, minus loans. */
export function scoreParts(s: GameState) {
  let land = 0, buildings = 0;
  for (const p of PLOTS) {
    const ps = s.plots[p.id];
    if (ps.owner !== 'player') continue;
    land += ps.landValue;
    buildings += BUILDING_VALUE_SHARE * ps.invested;
  }
  const stock = Math.max(0, assetValue(s) - land - buildings);
  return { cash: s.cash, land, buildings, stock, loans: s.loan?.principal ?? 0 };
}

export function scoreTip(s: GameState): string {
  const p = scoreParts(s), ss = successScore(s), next = RANKS[s.rank];
  return [
    `Success Score ${whole(ss)}`,
    `Cash ${whole(p.cash)}`,
    `+ land ${whole(p.land)}`,
    `+ 75% of buildings ${whole(p.buildings)}`,
    `+ stock at cost ${whole(p.stock)}`,
    ...(p.loans ? [`− loans ${whole(p.loans)}`] : []),
    `Today ${signed(ss - s.today.scoreBefore)}`,
    `Peak ${whole(s.peakScore)}${s.peakDay ? ` (day ${s.peakDay})` : ''}`,
    `R${s.rank} ${RANKS[s.rank - 1].title}${next ? `: ${whole(next.ss - ss)} to ${next.title}` : ''}`,
  ].join('\n');
}

/** Threat moves only at a rank-up: name the rank that set it, and the difficulty's nudge. */
export function threatTip(s: GameState): string {
  const t = threatLevel(s), base = Math.min(5, Math.ceil(s.rank / 2)), by = 2 * base - 1, nudge = difficulty(s).threat;
  return `Threat ${t}: set by Rank ${by}, ${RANKS[by - 1].title}${nudge ? `; ${difficulty(s).label} ${nudge > 0 ? '+' : '−'}${Math.abs(nudge)}` : ''}\nMore lemons, more raids on you`;
}

export function cashTip(s: GameState): string {
  if (s.redDays) return `In the Red: ${redDaysLeft(s)} days to get above $0`;
  return `Cash ${whole(s.cash)}${s.loan ? `\nYou owe the bank ${whole(s.loan.principal)}` : ''}\nTap for the Ledger`;
}

export function repTip(s: GameState): string {
  const d = s.reputation - s.today.reputationBefore;
  return `Reputation ${s.reputation.toFixed(2)} of 5 stars\nMore stars, more walkers stop${Math.abs(d) > 0.004 ? `\nToday ${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(2)}` : ''}`;
}

export const dayTip = (s: GameState, mode: string) => `Day ${s.day}: ${seasonOf(s.day)} day ${seasonDay(s.day)}\n${mode}`;
