// Acts 3 and 4's beats in the campaign (spec "Act 3: Grounds for Revenge" and
// "Act 4: Fields & Fizz"), told through systems that already exist. The
// handshake: Preston invites you to Dot's and offers a 7-day Truce for the
// usual tribute (the Sit-downs lesson); what you pay him is on Juni's invoice.
// The night flight: the morning after Cold Brew's first raid on you, Captain
// Squawk tells what he saw at 3 a.m., and Juni calls. The first chopper: a
// movie star's pool party wants 4,000 bottles of Pink, and Juni warns that
// FizzCo will hit the pad (the Delivery Raids lesson). The first ship: the
// Regatta's flagship, and Lottie blames the wind. Pure, like the rest of the sim.
import type { RivalId } from './balance.ts';
import type { GameState } from './economy.ts';
import { alert } from './alerts.ts';
import { deliveryRaidRisk } from './night.ts';
import { CALL_PRIORITY, juniInforms, LINES, phoneCall } from './phone.ts';
import { canTruce, inTruce, makeTruce, SITDOWN_RANK, truceCost } from './rivals.ts';
import { playScene, queued } from './scenes.ts';
import { hasStory } from './story.ts';
import { ORDER_TIERS, PICKUP_MINUTE, type Order } from './vip.ts';

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
 * The morning after Cold Brew's first raid on you in Act 3, Squawk's night flight unmasks the baristas and Juni calls
 * (the scene's follow-up). Seam: rivals' Night Shift, once it lands, is the raid to wait for. If Cold Brew hasn't hit
 * you a week in, Juni calls anyway.
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

/** vip.ts's line for a new VIP offer, so a scripted one can take its place in this morning's news. */
const offerLine = (o: Order) => `VIP call! ${o.client} wants ${o.qty.toLocaleString('en-US')} bottles for ${money(o.pay)}.`;

function rewrite(s: GameState, o: Order, change: () => string): void {
  const i = s.news.indexOf(offerLine(o));
  const line = change();
  if (i >= 0) s.news[i] = line;
  else s.news.push(line);
}

/** The campaign's first chopper and first ship offers are the spec's: rewritten the morning they come in. */
function firstOffers(s: GameState): void {
  const v = (s.story!.vip ??= {});
  for (const o of s.offers) {
    if (o.tier === 'heli' && v.heli === undefined) {
      rewrite(s, o, () => {
        o.client = MOVIE_STAR;
        o.qty = CHOPPER_BOTTLES; // the first Pad serves 2,000-4,000 bottles
        o.pay = Math.round(o.qty * ORDER_TIERS.heli.pay);
        return `VIP call! A movie star wants ${o.qty.toLocaleString('en-US')} bottles of Pink for a pool party: ${money(o.pay)}.`;
      });
      v.heli = o.id;
      s.news.push(deliveryRaidRisk(s, o) ? 'Lottie: "A chopper, kid! Post a crew at the pad. Rivals love a loaded pickup."' : 'Lottie: "A chopper, kid! Have every bottle ready when it lands."');
    }
    if (o.tier === 'ship' && v.ship === undefined) {
      rewrite(s, o, () => {
        o.client = REGATTA;
        return `Ship Contract! The Regatta's flagship wants ${o.qty.toLocaleString('en-US')} bottles for ${money(o.pay)}.`;
      });
      v.ship = o.id;
      s.news.push(`Lottie: "A ship, kid! ${money(ORDER_TIERS.ship.pay)} a bottle. Bottle early: a flagship drinks a lot."`);
    }
  }
}

/** Can FizzCo hit a pickup now? Alive, no Truce, no Respect, and Delivery Raids on (Threat 3+, not Peaceful). */
const fizzcoCanHit = (s: GameState, o: Order) =>
  s.rivals.fizzco.alive && !inTruce(s, 'fizzco') && s.rivals.fizzco.respectUntil <= s.day && deliveryRaidRisk(s, o);

/**
 * Seam (nights lane, scheduleDeliveryRaid in src/sim/night.ts): the campaign's first chopper pickup is FizzCo's to hit,
 * with no roll. Until that's wired, the pickup takes the usual Delivery Raid roll.
 */
export function scriptedRaider(s: GameState, o: Order): RivalId | null {
  return hasStory(s) && !!o.id && s.story?.vip?.heli === o.id && fizzcoCanHit(s, o) ? 'fizzco' : null;
}

/** The chopper's pickup day: Juni, FizzCo's informant now, phones at dawn that FizzCo will hit the pad. */
function chopperTip(s: GameState): void {
  const id = s.story!.vip?.heli;
  const o = id ? s.orders.find((x) => x.id === id && x.due === s.day) : undefined;
  if (o && juniInforms(s) && fizzcoCanHit(s, o)) phoneCall(s, 'coldbrew', LINES.juniPad, { tip: true, priority: CALL_PRIORITY.story, until: s.day });
}

/** The first ship docks at its pickup (10 am): its horn plays the first 3 notes of Lottie's Theme (audio's), and she blames the wind. */
export function shipDocks(s: GameState): void {
  const v = s.story?.vip;
  if (!hasStory(s) || !v?.ship || v.docked) return;
  const o = s.orders.find((x) => x.id === v.ship);
  if (o) v.sail = o.due; // you took the contract: it docks on its pickup day
  const due = v.sail;
  if (due === undefined || s.day < due || (s.day === due && (s.phase === 'prep' || (s.phase === 'open' && s.minute < PICKUP_MINUTE.ship)))) return;
  v.docked = true;
  alert(s, { kind: 'note', text: 'Lottie: "That horn? Just the wind, kid. Just the wind."', ...(o?.plot ? { plot: o.plot } : {}) });
}

/** Dawn (from storyAtDawn): Acts 3 and 4's beats. */
export function beatsAtDawn(s: GameState): void {
  if (!hasStory(s) || !s.story || s.story.epilogue !== undefined) return;
  handshake(s);
  nightFlight(s);
  firstOffers(s);
  chopperTip(s);
}
