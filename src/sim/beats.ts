// Acts 3 and 4's beats in the campaign (spec "Act 3: Grounds for Revenge" and
// "Act 4: Fields & Fizz"), told through systems that already exist. The
// handshake: Preston invites you to Dot's and offers a 7-day Truce for the
// usual tribute (the Sit-downs lesson); what you pay him is on Juni's invoice.
// The night flight: the morning after Cold Brew's first raid on you, Captain
// Squawk tells what he saw at 3 a.m., and Juni calls. The first chopper: a
// movie star's pool party wants 4,000 bottles of Pink, and Juni warns that
// FizzCo will hit the pad (the Delivery Raids lesson). The first ship: the
// Regatta's flagship, and Lottie blames the wind. Pure, like the rest of the sim.
import { FACTIONS, type RivalId } from './balance.ts';
import type { GameState } from './economy.ts';
import { alert } from './alerts.ts';
import { deliveryRaidRisk } from './night.ts';
import { CALL_PRIORITY, juniInforms, LINES, phoneCall } from './phone.ts';
import { ownsRecipe } from './recipes.ts';
import { canTruce, inTruce, makeTruce, SITDOWN_RANK, truceCost } from './rivals.ts';
import { playScene, queued } from './scenes.ts';
import { hasStory } from './story.ts';
import { bottlesOf, ORDER_TIERS, orderRecipe, PICKUP_MINUTE, type Order } from './vip.ts';

const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

/** Preston makes his move this many days into Act 3. Placeholder: spec gap (the spec orders Act 3's beats, no days). */
export const HANDSHAKE_DAY = 3;
/** His offer stands for this many Morning Preps. Placeholder: spec gap. */
export const OFFER_DAYS = 3;
/** With no Cold Brew raid on you this many days into Act 3, Juni calls anyway. Placeholder: spec gap. */
export const JUNI_CALLS_BY = 7;
/** The first chopper (spec Act 4): a movie star orders 4,000 bottles of Pink. The client is vip.ts's own. */
export const MOVIE_STAR = "a movie star's pool party";
export const CHOPPER_BOTTLES = 4000;
export const REGATTA = "the Citrine Bay Regatta's flagship";
const SITDOWN_LESSON = 'Lottie: "That\'s a Sit-down, kid. Call one yourself from any boss\'s HQ card."';

// ---------- Act 3: the handshake ----------

/** Preston's offer standing this Morning Prep: a Truce for today's tribute, and whether you can shake on it now. */
export function storyOffer(s: GameState): { from: RivalId; cost: number; why?: string } | null {
  const o = s.story?.offer;
  if (!hasStory(s) || !o || o.until < s.day || s.phase !== 'prep' || !s.rivals[o.from].alive) return null;
  const can = canTruce(s, o.from);
  return { from: o.from, cost: truceCost(s), ...(can.ok ? {} : { why: can.why }) };
}

/** Shake on it (the Truce, for the tribute: recorded for Juni's invoice) or turn him down. Either way it's a Sit-down. */
export function answerOffer(s: GameState, accept: boolean): boolean {
  const st = s.story, o = st?.offer;
  if (!st || !o || !storyOffer(s)) return false;
  if (accept) {
    const cost = truceCost(s);
    if (!makeTruce(s, o.from)) return false;
    st.tribute = (st.tribute ?? 0) + cost;
  } else s.news.push(`Preston: "${LINES.prestonLater}"`);
  delete st.offer;
  s.news.push(SITDOWN_LESSON);
  return true;
}

/** A few days into Act 3, once Sit-downs are open (Rank 4), FizzCo makes the first move: Preston phones from Dot's. */
function handshake(s: GameState): void {
  const st = s.story!;
  if (st.offer && st.offer.until < s.day) delete st.offer; // he stopped waiting
  if (st.asked || st.act !== 3 || s.day < st.since + HANDSHAKE_DAY || s.rank < SITDOWN_RANK) return;
  if (!s.rivals.fizzco.alive || inTruce(s, 'fizzco') || (s.noTruceUntil ?? 0) >= s.day) return;
  st.asked = true;
  st.offer = { from: 'fizzco', until: s.day + OFFER_DAYS - 1 };
  phoneCall(s, 'fizzco', LINES.prestonTruce, { priority: CALL_PRIORITY.story, until: st.offer.until });
}

// ---------- Act 3: the night flight ----------

/**
 * The morning after Cold Brew's first raid on you in Act 3 (their Night Shift: quiet night raids, src/sim/rivalAi.ts),
 * Squawk's night flight unmasks the baristas and Juni calls (the scene's follow-up). If Cold Brew hasn't hit you a
 * week in, Juni calls anyway.
 */
function nightFlight(s: GameState): void {
  const st = s.story!;
  if (st.act !== 3 || !s.rivals.coldbrew.alive || queued(s, 'nightFlight')) return;
  if (s.battles.some((b) => b.day >= s.day - 1 && b.attacker === 'coldbrew' && b.defender === 'player')) playScene(s, 'nightFlight');
  else if (s.day >= st.since + JUNI_CALLS_BY) {
    s.scenes!.seen.push('nightFlight');
    phoneCall(s, 'coldbrew', LINES.juniAct3, { priority: CALL_PRIORITY.story });
  }
}

// ---------- Act 4: the first chopper and the first ship ----------

/** vip.ts's line for a new VIP offer (a rival's bid on the end), so a scripted one can take its place in this morning's news. */
const offerLine = (o: Order) =>
  `VIP call! ${o.client} wants ${o.qty.toLocaleString('en-US')} bottles for ${money(o.pay)}.${o.bid ? ` ${FACTIONS[o.bid.rival].name} bids ${money(o.bid.pay)}.` : ''}`;

function rewrite(s: GameState, o: Order, change: () => string): void {
  const i = s.news.indexOf(offerLine(o));
  const line = change();
  if (i >= 0) s.news[i] = line;
  else s.news.push(line);
}

/**
 * The campaign's first chopper and first ship offers are the spec's: rewritten the morning they come in. Each calls you
 * alone (no rival bid on it), so its lesson isn't lost to a bid: FizzCo, bidding hardest, would win most first choppers.
 */
function firstOffers(s: GameState): void {
  const v = (s.story!.vip ??= {});
  for (const o of s.offers) {
    if (o.tier === 'heli' && v.heli === undefined) {
      rewrite(s, o, () => {
        o.client = MOVIE_STAR;
        o.qty = CHOPPER_BOTTLES; // the first Pad serves 2,000-4,000 bottles
        o.pay = Math.round(o.qty * ORDER_TIERS.heli.pay);
        if (ownsRecipe(s, 'pink')) o.recipe = 'pink';
        delete o.bid;
        return `VIP call! A movie star wants ${o.qty.toLocaleString('en-US')} bottles${o.recipe === 'pink' ? ' of Pink' : ''} for a pool party: ${money(o.pay)}.`;
      });
      v.heli = o.id;
      s.news.push(deliveryRaidRisk(s, o) ? 'Lottie: "A chopper, kid! Post a crew at the pad. Rivals love a loaded pickup."' : 'Lottie: "A chopper, kid! Have every bottle ready when it lands."');
    }
    if (o.tier === 'ship' && v.ship === undefined) {
      rewrite(s, o, () => {
        o.client = REGATTA;
        delete o.bid;
        return `Ship Contract! The Regatta's flagship wants ${o.qty.toLocaleString('en-US')} bottles for ${money(o.pay)}.`;
      });
      v.ship = o.id;
      s.news.push(`Lottie: "A ship, kid! ${money(ORDER_TIERS.ship.pay)} a bottle. It loads a day at a time: bottle early."`);
    }
  }
}

/** Can FizzCo hit a pickup now? Alive, no Truce, no Respect, and Delivery Raids on (Threat 3+, not Peaceful). */
const fizzcoCanHit = (s: GameState, o: Order) =>
  s.rivals.fizzco.alive && !inTruce(s, 'fizzco') && s.rivals.fizzco.respectUntil <= s.day && deliveryRaidRisk(s, o);

/** The movie star's chopper before its first trip: taken, nothing loaded yet and no raid holding it. */
const firstTrip = (s: GameState, o: Order) => s.story?.vip?.heli === o.id && !o.loaded && !s.heldPickups?.includes(o.id);

/**
 * Seam (nights lane, scheduleDeliveryRaid in src/sim/night.ts): the first trip of the campaign's first chopper is
 * FizzCo's to hit, with no roll. Until that's wired, the trip takes the usual Delivery Raid roll.
 */
export function scriptedRaider(s: GameState, o: Order): RivalId | null {
  return hasStory(s) && !!o.id && firstTrip(s, o) && fizzcoCanHit(s, o) ? 'fizzco' : null;
}

/**
 * The day the movie star's chopper first lands to load (you took it, its bottles are ready and its pad stands): Juni,
 * FizzCo's informant now, phones before the 5:30 pm pickup that FizzCo will hit the pad. At dawn, or as you take it.
 */
function chopperTip(s: GameState): void {
  const v = s.story?.vip;
  if (!v?.heli || v.tip === s.day || !(s.phase === 'prep' || (s.phase === 'open' && s.minute < PICKUP_MINUTE.heli))) return;
  const o = s.orders.find((x) => x.id === v.heli && x.due >= s.day);
  const pad = o?.plot ? s.plots[o.plot]?.facility : undefined;
  if (!o || !firstTrip(s, o) || !pad || pad.wrecked || bottlesOf(s, orderRecipe(o)) <= 0 || !juniInforms(s) || !fizzcoCanHit(s, o)) return;
  v.tip = s.day;
  phoneCall(s, 'coldbrew', LINES.juniPad, { tip: true, priority: CALL_PRIORITY.story, until: s.day });
}

/**
 * The first ship docks at its first trip (10 am, loading a day at a time): its horn plays the first 3 notes of Lottie's
 * Theme (audio's), and she blames the wind. It has docked once the contract has bottles aboard, a raid holds its
 * loading, or it left your Order Book while you were open (its whole load in one trip, or raiders overran it).
 */
function shipDocks(s: GameState): void {
  const v = s.story?.vip;
  if (!v?.ship || v.docked) return;
  const o = s.orders.find((x) => x.id === v.ship);
  const docked = o ? !!o.loaded || !!s.heldPickups?.includes(o.id) : v.booked === s.day && s.phase === 'open';
  if (o) v.booked = s.day;
  if (!docked) return;
  v.docked = true;
  alert(s, { kind: 'note', text: 'Lottie: "That horn? Just the wind, kid. Just the wind."', ...(o?.plot ? { plot: o.plot } : {}) });
}

/** On the clock (storyMinute, and after each tap): the first ship's docking, and Juni's tip before the chopper loads. */
export function beatsOnTheClock(s: GameState): void {
  if (!hasStory(s) || !s.story || s.story.epilogue !== undefined) return;
  shipDocks(s);
  chopperTip(s);
}

/** Vera's first fine through Mayor Fontaine (rivals' Old Money, src/sim/schemes.ts): he brings it to the Corner himself. */
function mayorsVisit(s: GameState): void {
  const fine = s.schemes?.find((x) => x.kind === 'fine' && x.day === s.day);
  if (fine) playScene(s, 'fontaine', { recap: `Mayor Fontaine delivered one of Vera's fines: ${money(fine.price ?? 0)}.` });
}

/** Dawn (from storyAtDawn): Acts 3 and 4's beats, and the Mayor's visit. */
export function beatsAtDawn(s: GameState): void {
  if (!hasStory(s) || !s.story || s.story.epilogue !== undefined) return;
  handshake(s);
  nightFlight(s);
  firstOffers(s);
  chopperTip(s);
  mayorsVisit(s);
}
