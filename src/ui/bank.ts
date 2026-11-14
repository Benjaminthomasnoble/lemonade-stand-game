// Marisol's bank after the morning (spec: Modes, "Marisol's loans"; the bank keeps no hours). At Morning Prep her
// card sits on the Grow sheet (hud.ts bank); the rest of the day it's a ticket in the feed: Borrow whenever you're
// short, and Pay off through business hours and the Evening once your cash covers what you owe. Clicks go through the
// HUD's one listener (data-action="borrow" with data-amount, and "repay").
import { canBorrow, loanLimit, type GameState } from '../sim/economy.ts';
import * as A from './clay.ts';

let pig = '';
const piggy = () => (pig ||= A.piggySVG());
const whole = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
/** Short on cash: the most the card shows a Borrow button for (the same as the Grow sheet's). */
export const SHORT_CASH = 60;

/** The feed's bank ticket outside Morning Prep, or '' when you neither need her nor can pay her off. */
export function bankTicket(s: GameState): string {
  if (s.phase === 'prep') return ''; // the Grow sheet has her card
  const l = s.loan;
  if (l) {
    if (s.phase === 'night' || s.cash < l.principal) return ''; // by day and in the Evening; at night the feed is the fight's
    return `<div class="cl-ticket" data-testid="bank" title="Marisol's bank: 3% a week over 4 weeks">${piggy()}<b>You owe ${whole(l.principal)}</b><button class="cl-b tiny" data-action="repay" data-testid="repay">Pay off</button></div>`;
  }
  const limit = loanLimit(s);
  if (!limit || s.cash > SHORT_CASH) return '';
  const amt = Math.floor(limit / 2 / 50) * 50 || limit;
  const b = canBorrow(s, amt);
  return `<div class="cl-ticket" data-testid="bank" title="Marisol's bank: up to half what your land and stands are worth, 3% a week, paid back over 4 weeks">${piggy()}<b>Short on cash?</b><button class="cl-b tiny" data-action="borrow" data-amount="${amt}" data-testid="borrow" ${b.ok ? '' : `disabled title="${esc(b.why)}"`}>Borrow ${whole(amt)}</button></div>`;
}
