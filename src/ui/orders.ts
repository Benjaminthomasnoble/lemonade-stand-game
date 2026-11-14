// The Order Book's lines and the feed's order tickets (spec: VIP clients, "The order ladder"): each card names the client,
// the recipe, the size, the deadline and the pay, and flags a possible Delivery Raid (menus.ts draws the card, the HUD the
// feed's tickets). A job you took shows how far its pickups have loaded and when the next bottles are due.
import {
  bottlesLeft, bottlesOf, DEAL_LOADS, FACTIONS, isVip, liveBid, nextDue, orderRecipe, PLOT_BY_ID, RECIPES, SHIPPING_LANE, shippingLane, yourDays,
  type GameState, type Order, type RecipeId,
} from '../sim/economy.ts';
import * as A from './clay.ts';
import { esc, once, whole } from './recipes.ts';

const crate = once(() => A.crateSVG());
const n = (x: number) => x.toLocaleString('en-US');
const meter = (v: number) => `<span class="cl-snake" style="--v:${Math.max(0, Math.min(1, v)).toFixed(3)}"><i></i></span>`;

/** The card an order is filled with: the client's recipe (a Local Order pours its stand's card). */
export function recipeOf(s: GameState, o: Order): RecipeId {
  const stand = o.tier === 'local' && o.plot ? s.plots[o.plot]?.stand : undefined;
  return o.recipe ?? stand?.recipe ?? orderRecipe(o);
}

/** "4,000 bottles of Pink"; a Local Order's "600 cups of Mint". */
export const orderGoods = (s: GameState, o: Order) => `${n(o.qty)} ${o.tier === 'local' ? 'cups' : 'bottles'} of ${RECIPES[recipeOf(s, o)].label}`;

/** Where a Local Order is poured or a Caterer Truck loads: " at Main Street" (its stand's plot, the truck's Warehouse). */
const standAt = (o: Order) => ((o.tier === 'local' || o.tier === 'caterer') && o.plot && PLOT_BY_ID[o.plot] ? ` at ${PLOT_BY_ID[o.plot].name}` : '');
/** A Caterer Truck's bottles ready, counting the ones a Delivery Raid is holding on the way out. */
const truckReady = (s: GameState, o: Order) => bottlesOf(s, recipeOf(s, o)) + (o.reserved ? o.loading ?? 0 : 0);

/** When it's due: an offer's deadline ("day 12", a Supply Deal's "4 weekly loads"), or for a job you took how far it has
 * loaded (a Local Order: made) and when the next bottles are due. */
export function orderWhen(s: GameState, o: Order, waiting: boolean): string {
  if (waiting) return o.tier === 'deal' ? `${DEAL_LOADS} weekly loads to day ${o.due}` : `day ${o.due}${standAt(o)}`;
  if (o.tier === 'local') return `${n(o.loaded ?? 0)} of ${n(o.qty)} made${standAt(o)} · due day ${o.due}`;
  if (!isVip(o.tier)) return `day ${o.due}${standAt(o)}`;
  return `${n(o.loaded ?? 0)} of ${n(o.qty)} loaded · next due day ${nextDue(o, s.day)}`;
}

const days = (d: number) => `${d} day${d === 1 ? '' : 's'}`;

/** A rival's bid on an offer, for its card: " · FizzCo Beverages bids $102,000, 1 day (you: 2 days)". A Supply Deal ships
 * weekly whoever has it, so its bid is just the price. */
export function bidNote(s: GameState, o: Order): string {
  const b = liveBid(s, o);
  if (!b) return '';
  return ` · ${FACTIONS[b.rival].name} bids ${whole(b.pay)}${o.tier === 'deal' ? '' : `, ${days(b.days)} (you: ${days(yourDays(s, o))})`}`;
}

/** The card's extra notes: Shipping Lane's 15% on a Ship Contract, and on an offer a rival's bid. */
export function orderNote(s: GameState, o: Order, waiting: boolean): string {
  const lane = o.tier === 'ship' && shippingLane(s) ? ` · Shipping Lane +${Math.round(SHIPPING_LANE * 100)}%` : '';
  return `${lane}${waiting ? bidNote(s, o) : ''}`;
}

/** The offer's Match button: bid the rival's price (the client still weighs delivery time and Reputation). */
export function matchButton(s: GameState, o: Order): string {
  const b = liveBid(s, o);
  if (!b) return '';
  const why = `Bid ${whole(b.pay)} against ${FACTIONS[b.rival].name}: the client weighs price, delivery time and Reputation`;
  return `<button class="cl-b" data-action="match" data-id="${o.id}" data-testid="match" title="${esc(why)}">Match ${whole(b.pay)}</button>`;
}

/** Bottles on hand, by recipe ("3,000 Classic, 1,500 Pink"). */
export function bottleStock(s: GameState): string {
  const ids = Object.keys(RECIPES) as RecipeId[];
  return ids.filter((r) => bottlesOf(s, r) > 0).map((r) => `${n(bottlesOf(s, r))} ${RECIPES[r].label}`).join(', ') || 'No bottles';
}

/** The feed's ticket for a job you took: due when, and how far it has loaded (a Local Order: made; a Caterer Truck: its
 * bottles ready). */
export function orderTicket(s: GameState, o: Order): string {
  const due = isVip(o.tier) ? nextDue(o, s.day) : o.due;
  const done = isVip(o.tier) || o.tier === 'local' ? (o.loaded ?? 0) / o.qty : Math.min(o.qty, truckReady(s, o)) / o.qty;
  const note = isVip(o.tier) ? `${n(bottlesLeft(o))} to load, ${n(bottlesOf(s, recipeOf(s, o)))} ready`
    : o.tier === 'local' ? `${n(bottlesLeft(o))} cups to make${standAt(o)}, an hour before closing` : `${n(truckReady(s, o))} ready, loads${standAt(o)} at closing`;
  return `<div class="cl-ticket order" data-testid="order" title="${esc(`${o.client}: ${orderGoods(s, o)} for ${whole(o.pay)}; ${note}`)}">${crate()}`
    + `<b>${due === s.day ? 'Due today!' : `Due day ${due}`}</b>${done >= 0 ? meter(done) : ''}</div>`;
}
