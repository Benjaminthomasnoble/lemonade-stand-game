// The Order Book's lines and the feed's order tickets (spec: VIP clients, "The order ladder"): each card names the client,
// the recipe, the size, the deadline and the pay, and flags a possible Delivery Raid (menus.ts draws the card, the HUD the
// feed's tickets). A job you took shows how far its pickups have loaded and when the next bottles are due.
import { bottlesLeft, bottlesOf, DEAL_LOADS, isVip, nextDue, orderRecipe, RECIPES, type GameState, type Order, type RecipeId } from '../sim/economy.ts';
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

/** When it's due: an offer's deadline ("day 12", a Supply Deal's "4 weekly loads"), or for a job you took how far it has
 * loaded and when the next bottles are due. */
export function orderWhen(s: GameState, o: Order, waiting: boolean): string {
  if (waiting) return o.tier === 'deal' ? `${DEAL_LOADS} weekly loads to day ${o.due}` : `day ${o.due}`;
  if (!isVip(o.tier)) return `day ${o.due}`;
  return `${n(o.loaded ?? 0)} of ${n(o.qty)} loaded · next due day ${nextDue(o, s.day)}`;
}

/** Bottles on hand, by recipe ("3,000 Classic, 1,500 Pink"). */
export function bottleStock(s: GameState): string {
  const ids = Object.keys(RECIPES) as RecipeId[];
  return ids.filter((r) => bottlesOf(s, r) > 0).map((r) => `${n(bottlesOf(s, r))} ${RECIPES[r].label}`).join(', ') || 'No bottles';
}

/** The feed's ticket for a job you took: due when, and how far it has loaded (a Caterer Truck: its bottles ready). */
export function orderTicket(s: GameState, o: Order): string {
  const due = isVip(o.tier) ? nextDue(o, s.day) : o.due;
  const done = isVip(o.tier) ? (o.loaded ?? 0) / o.qty : o.tier === 'local' ? -1 : Math.min(o.qty, bottlesOf(s, recipeOf(s, o))) / o.qty;
  const note = isVip(o.tier) ? `${n(bottlesLeft(o))} to load, ${n(bottlesOf(s, recipeOf(s, o)))} ready` : o.tier === 'local' ? 'made at closing' : `${n(bottlesOf(s, recipeOf(s, o)))} ready`;
  return `<div class="cl-ticket order" data-testid="order" title="${esc(`${o.client}: ${orderGoods(s, o)} for ${whole(o.pay)}; ${note}`)}">${crate()}`
    + `<b>${due === s.day ? 'Due today!' : `Due day ${due}`}</b>${done >= 0 ? meter(done) : ''}</div>`;
}
