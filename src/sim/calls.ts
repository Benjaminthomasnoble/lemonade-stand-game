// Day calls (Ben, 2026-11-08: "there's nothing to do during the day after opening"): once or twice each business
// day a small decision breaks in at one of your stands, a card with two or three choices, and every choice costs
// something: cash, customers, Reputation, or a rival's Grudge (which brings raids). Day 1's is Brock's Bros
// undercutting you, so you meet the competition at once; Day 3's is the rumor of the first raid.
//
// The UI holds the clock while a call waits (src/main.ts), so a player always answers it; a fight playing live runs
// its clock on, call or no call. Run without a player (tests, Finish the day, fast-forward), a call nobody answers
// lapses after CALL_LAPSE minutes and changes nothing, so the sim's numbers stay what they were. Planning uses its own
// dice off the seed and never writes the seed back. Pure, like the rest of the sim.
import { CLOSE, FACTIONS, OPEN, PERIMETERS, type RivalId } from './balance.ts';
import type { GameState } from './economy.ts';
import { book, bookOther } from './ledger.ts';
import { nextRandom } from './rng.ts';
import { LOTTIES_CORNER, PLOT_BY_ID, PLOTS } from './map.ts';
import { mayRaidYou } from './threat.ts';
import { siegeTonight } from './squeeze.ts';
import { IN_THE_FIGHT } from './clubhouse.ts';

export type CallKind = 'undercut' | 'heckler' | 'rush' | 'permit' | 'rumor';

export interface DayCall {
  id: number;
  kind: CallKind;
  at: number; // the minute it breaks in
  plot: string; // your stand it's about
  rival: RivalId | null; // whose doing it is
  live?: boolean; // broken in and waiting for you
  picked?: number; // the choice made (-1: it lapsed unanswered)
  /** permit: how talking the Sheriff down went (true: she let it go). */
  luck?: boolean;
}

export interface CallsState {
  day: number; // the day `list` was planned for
  list: DayCall[];
  /** Today's traffic changes from answered calls, by plot. */
  mods: Record<string, number>;
  /** Tonight's rumored raid (answered rumor): the rival and the plot. threat.ts sends it. */
  rumor?: { day: number; rival: RivalId; plot: string };
}

/** A call unanswered this many game minutes lapses (only without a player: the UI holds the clock). */
export const CALL_LAPSE = 60;
/** The numbers on each choice (tunable; mirrored in docs/spec/balance-tables.md "Day calls"). */
export const CALLS = {
  undercut: { cut: 0.25, samples: 10, samplesTraffic: 1.2, holdTraffic: 0.8 },
  heckler: { payoff: 8, grudge: 6, ignoreTraffic: 0.85 },
  rush: { traffic: 1.3, raise: 0.5, fairStars: 0.03 },
  permit: { fee: 15, fine: 30, luck: 0.5 },
  rumor: { rush: 1.5 }, // a fence put up mid-day costs half again its price
} as const;
/** Calls a day: Day 1 has one (Brock's undercut), every later day two. */
export const CALLS_PER_DAY = 2;

/** A choice on a call's card: its label, what it costs up front (shown on the button), whether you can take it, and why
 * not when it isn't the money. */
export interface CallChoice { label: string; cost?: number; ok: boolean; why?: string; tone?: 'go' | 'ghost' }

/**
 * The crew's side of a call, passed in so this module stays clear of crew.ts (crew's callCrew builds it): how many
 * guards "Post a guard" would move to a plot (crew's fillable; `fighting`: the ones the fight playing live holds counted
 * in), and the move itself (fillPosts), which says how many moved. The card and its answer take the same one, so a
 * choice's place on the card is the one answered.
 */
export interface CallCrew {
  fillable?: (plot: string, fighting?: boolean) => number;
  postGuards: (plot: string) => number;
}

const SHORT: Record<RivalId, string> = { sourwood: 'Sourwood', hollis: 'Hollis', fizzco: 'FizzCo', coldbrew: 'Cold Brew', blenders: "Brock's Bros", snootwater: 'Snootwater' };
const cents = (n: number) => (n < 1 ? `${Math.round(n * 100)}¢` : `$${n.toFixed(2)}`);

export function callsOf(s: GameState): CallsState {
  if (!s.calls || s.calls.day !== s.day) s.calls = { day: s.day, list: [], mods: {}, ...(s.calls?.rumor ? { rumor: s.calls.rumor } : {}) };
  return s.calls;
}

/** The traffic multiplier answered calls put on a stand today (events.ts eventTraffic multiplies it in). */
export const callTraffic = (s: GameState, plotId: string) => (s.calls?.day === s.day ? s.calls.mods[plotId] ?? 1 : 1);

/** The call waiting for you now, if any. */
export const liveCall = (s: GameState): DayCall | undefined => (s.calls?.day === s.day && s.phase === 'open' ? s.calls.list.find((c) => c.live && c.picked === undefined) : undefined);

const yourStands = (s: GameState) => PLOTS.filter((p) => s.plots[p.id].owner === 'player' && s.plots[p.id].stand && !s.plots[p.id].stand!.wrecked);

/** The rival whose stand is nearest this plot (alive, and passing `may` when given): who undercuts, heckles or schemes. */
export function nearestRival(s: GameState, plotId: string, may: (id: RivalId) => boolean = () => true): RivalId | null {
  const at = PLOT_BY_ID[plotId];
  let best: { id: RivalId; d: number } | null = null;
  for (const p of PLOTS) {
    const o = s.plots[p.id].owner;
    if (!o || o === 'player' || !s.plots[p.id].stand || !s.rivals[o as RivalId]?.alive || !may(o as RivalId)) continue;
    const d = Math.hypot(p.x - at.x, p.z - at.z);
    if (!best || d < best.d) best = { id: o as RivalId, d };
  }
  return best?.id ?? null;
}

/** Plan today's calls (once a day, the first business minute): their kinds, minutes and stands, off the seed without
 * advancing it. */
export function planCalls(s: GameState): void {
  const c = callsOf(s);
  if (c.list.length || s.phase !== 'open') return;
  const mine = yourStands(s);
  if (!mine.length) return;
  const rng = { seed: (Math.imul(s.seed ^ 0x5bd1e995, 2654435761) ^ s.day * 40503) >>> 0 };
  const pickPlot = () => (mine.find((p) => p.id === LOTTIES_CORNER) && nextRandom(rng) < 0.5 ? LOTTIES_CORNER : mine[Math.floor(nextRandom(rng) * mine.length)].id);
  const hot = s.weather.kind === 'hot' || s.weather.kind === 'scorcher' || s.weather.kind === 'warm';
  const kinds: CallKind[] = [];
  if (s.day === 1) kinds.push('undercut');
  else if (s.day === 3) kinds.push(hot ? 'rush' : 'heckler', 'rumor');
  else {
    const pool: CallKind[] = ['undercut', 'heckler', 'permit', hot ? 'rush' : 'undercut'];
    // A rumor only when some gang may come for you tonight (else the draw takes another kind, so the day still has
    // two calls), and never on a siege night: that dawn named its targets (squeeze.ts).
    const gang = nearestRival(s, mine[0].id, (id) => mayRaidYou(s, id));
    if (s.day > 3 && !s.settings.peaceful && !siegeTonight(s) && gang) pool.push('rumor');
    while (kinds.length < CALLS_PER_DAY) {
      const k = pool[Math.floor(nextRandom(rng) * pool.length)];
      if (!kinds.includes(k)) kinds.push(k);
    }
  }
  // Spread them over the day: the first mid-morning, the second mid-afternoon (in 15-minute steps).
  const slots: [number, number][] = kinds.length === 1 ? [[OPEN + 120, OPEN + 210]] : [[OPEN + 90, OPEN + 240], [OPEN + 360, CLOSE - 150]];
  kinds.forEach((kind, i) => {
    const [lo, hi] = slots[i];
    const at = lo + Math.floor((nextRandom(rng) * (hi - lo)) / 15) * 15;
    const plot = pickPlot();
    // A rumor names only a gang that may raid you tonight (threat.ts mayRaidYou: no Truce, not backing off).
    const rival = kind === 'permit' || kind === 'rush' ? null : nearestRival(s, plot, kind === 'rumor' ? (id) => mayRaidYou(s, id) : undefined);
    if ((kind === 'undercut' || kind === 'heckler' || kind === 'rumor') && !rival) return;
    c.list.push({ id: s.day * 10 + i, kind, at, plot, rival });
  });
  // Day 1's undercut is Brock's (the Act 1 rival, who phones that day); Day 3's rumor is about Lottie's Corner and
  // Brock too: the first raid is his.
  if (s.day === 1 && c.list[0] && s.rivals.blenders.alive) c.list[0].rival = 'blenders';
  const rumor = c.list.find((x) => x.kind === 'rumor');
  if (rumor && s.day === 3 && s.plots[LOTTIES_CORNER].owner === 'player') { rumor.plot = LOTTIES_CORNER; if (mayRaidYou(s, 'blenders')) rumor.rival = 'blenders'; }
}

/** Each business minute: plan the day, break in a call at its minute, and let one nobody answered lapse. */
export function callsOnTheClock(s: GameState): void {
  if (s.phase !== 'open') return;
  planCalls(s);
  const c = callsOf(s);
  for (const call of c.list) {
    if (call.picked !== undefined) continue;
    const ps = s.plots[call.plot];
    if (ps.owner !== 'player' || !ps.stand || ps.stand.wrecked) { if (call.live || s.minute >= call.at) call.picked = -1; continue; }
    if (!call.live && s.minute >= call.at) call.live = true;
    else if (call.live && s.minute >= call.at + CALL_LAPSE) call.picked = -1;
  }
}

/** The card's words: one short line. */
export function callLine(_s: GameState, call: DayCall): string {
  const who = call.rival ? SHORT[call.rival] : '';
  const place = call.plot === LOTTIES_CORNER ? 'the Corner' : PLOT_BY_ID[call.plot].name.replace(/ lot /, ' ');
  switch (call.kind) {
    case 'undercut': return `${who} slashed their prices to steal your line!`;
    case 'heckler': return `A ${who} kid is heckling your customers!`;
    case 'rush': return 'Thirsty crowd coming! The line is growing.';
    case 'permit': return 'Sheriff Budd: "Rivals say you got no permit."';
    case 'rumor': return `Word is ${who} hit ${place} tonight.`;
  }
}

/** The choices on a call's card, in order. `crew`: who "Post a guard" would move (CallCrew), else any free guard offers it. */
export function callChoices(s: GameState, call: DayCall, crew?: Pick<CallCrew, 'fillable'>): CallChoice[] {
  const st = s.plots[call.plot].stand;
  const price = st?.price ?? 0;
  switch (call.kind) {
    case 'undercut': return [
      { label: `Cut to ${cents(Math.max(0.25, price - CALLS.undercut.cut))}`, ok: price > 0.25 },
      { label: 'Free samples', cost: CALLS.undercut.samples, ok: s.cash >= CALLS.undercut.samples, tone: 'go' },
      { label: 'Hold firm', ok: true, tone: 'ghost' },
    ];
    case 'heckler': return [
      { label: 'Pay him off', cost: CALLS.heckler.payoff, ok: s.cash >= CALLS.heckler.payoff, tone: 'go' },
      { label: 'Chase him off', ok: true },
      { label: 'Ignore him', ok: true, tone: 'ghost' },
    ];
    case 'rush': return [
      { label: `Raise to ${cents(price + CALLS.rush.raise)}`, ok: true, tone: 'go' },
      { label: 'Keep it fair', ok: true },
    ];
    case 'permit': return [
      { label: 'Pay the fee', cost: CALLS.permit.fee, ok: s.cash >= CALLS.permit.fee, tone: 'go' },
      { label: 'Talk her down', ok: true },
    ];
    case 'rumor': {
      const next = rushFence(s, call.plot);
      const post = postChoice(s, call.plot, crew);
      return [
        ...(next ? [{ label: `Rush a ${next.name.split(' ')[0]} fence`, cost: next.cost, ok: s.cash >= next.cost, tone: 'go' as const }] : []),
        ...(post ? [post] : []),
        { label: 'Bring it on', ok: true, tone: 'ghost' },
      ];
    }
  }
}

/** A rumor's "Post a guard": while a free guard waits off post, and only when it would move someone here (crew's
 * fillable: none with the posts full or the free ones away on a raid). When the fight playing live holds the guards it
 * would bring, it shows held, with why, till the fight ends (crew's canPost). */
function postChoice(s: GameState, plot: string, crew?: Pick<CallCrew, 'fillable'>): CallChoice | null {
  if (!s.guards.some((g) => !g.post && (g.outUntil ?? 0) <= s.day)) return null;
  if (!crew?.fillable || crew.fillable(plot) > 0) return { label: 'Post a guard', ok: true };
  return crew.fillable(plot, true) > 0 ? { label: 'Post a guard', ok: false, why: IN_THE_FIGHT } : null;
}

/** The next fence for a plot at its rush price (rank allowing), or null. */
function rushFence(s: GameState, plotId: string) {
  const next = PERIMETERS[s.plots[plotId].defense.tier];
  if (!next || s.rank < next.rank) return null;
  return { ...next, cost: Math.ceil(next.cost * CALLS.rumor.rush) };
}

/** What each choice does, for the card's tooltip. */
export function choiceTip(call: DayCall, label: string): string {
  if (call.kind === 'undercut') return label.startsWith('Cut') ? 'Keep your customers, earn less a cup' : label === 'Free samples' ? `+${Math.round((CALLS.undercut.samplesTraffic - 1) * 100)}% walkers here today` : `−${Math.round((1 - CALLS.undercut.holdTraffic) * 100)}% walkers here today`;
  if (call.kind === 'heckler') return label === 'Pay him off' ? 'He goes away quietly' : label === 'Chase him off' ? 'Free, but the gang gets madder: more raids' : `−${Math.round((1 - CALLS.heckler.ignoreTraffic) * 100)}% walkers here today`;
  if (call.kind === 'rush') return label.startsWith('Raise') ? 'More cash a cup; some may walk' : 'Folks remember a fair price: + Reputation';
  if (call.kind === 'permit') return label === 'Pay the fee' ? 'Done and dusted' : `Half the time she lets it go; otherwise a $${CALLS.permit.fine} fine`;
  return label === 'Bring it on' ? 'They come tonight. Hope you\'re ready' : label === 'Post a guard' ? 'Your free guards take the plot tonight' : `A fence holds raiders off (rushed in today: ${CALLS.rumor.rush}× its price)`;
}

/**
 * Answer the live call with choice `i` of callChoices(s, call, crew). Returns false if that choice can't be taken, and
 * when "Post a guard" moves nobody: the call waits on. `crew` is the crew's own count and action (CallCrew, passed in
 * so this module stays clear of crew.ts).
 */
export function answerCall(s: GameState, i: number, crew: CallCrew): boolean {
  const call = liveCall(s);
  if (!call) return false;
  const choices = callChoices(s, call, crew);
  const ch = choices[i];
  if (!ch || !ch.ok) return false;
  const c = callsOf(s);
  const st = s.plots[call.plot].stand!;
  const traffic = (m: number) => { c.mods[call.plot] = (c.mods[call.plot] ?? 1) * m; };
  const pay = (n: number, row: 'marketing' | 'citations') => book(s, row, -n);
  switch (call.kind) {
    case 'undercut':
      if (i === 0) st.price = Math.max(0.25, Math.round((st.price - CALLS.undercut.cut) * 100) / 100);
      else if (i === 1) { pay(CALLS.undercut.samples, 'marketing'); traffic(CALLS.undercut.samplesTraffic); }
      else traffic(CALLS.undercut.holdTraffic);
      break;
    case 'heckler':
      if (i === 0) bookOther(s, -CALLS.heckler.payoff, 'Paid off a heckler');
      else if (i === 1 && call.rival) s.rivals[call.rival].grudge = Math.min(100, s.rivals[call.rival].grudge + CALLS.heckler.grudge);
      else traffic(CALLS.heckler.ignoreTraffic);
      break;
    case 'rush':
      traffic(CALLS.rush.traffic); // the crowd comes either way
      if (i === 0) st.price = Math.round((st.price + CALLS.rush.raise) * 100) / 100;
      else s.reputation = Math.min(5, s.reputation + CALLS.rush.fairStars);
      break;
    case 'permit':
      if (i === 0) pay(CALLS.permit.fee, 'citations');
      else {
        const rng = { seed: (s.seed ^ (call.id * 2246822519)) >>> 0 };
        call.luck = nextRandom(rng) < CALLS.permit.luck;
        if (!call.luck) pay(CALLS.permit.fine, 'citations');
      }
      break;
    case 'rumor': {
      const label = ch.label;
      if (label.endsWith('fence')) {
        const next = rushFence(s, call.plot);
        if (!next || s.cash < next.cost) return false;
        const ps = s.plots[call.plot];
        book(s, 'invested', -next.cost);
        ps.invested += next.cost;
        ps.defense.tier = next.tier;
        ps.defense.fenceHp = next.hp;
      }
      else if (label === 'Post a guard' && !crew.postGuards(call.plot)) return false; // nobody moved: the call is still yours
      if (call.rival) c.rumor = { day: s.day, rival: call.rival, plot: call.plot };
      break;
    }
  }
  call.picked = i;
  return true;
}

/** Tonight's rumored raid, if one was answered today and its rival can still come. */
export const rumorTonight = (s: GameState) => (s.calls?.rumor && s.calls.rumor.day === s.day && s.plots[s.calls.rumor.plot]?.owner === 'player' ? s.calls.rumor : undefined);

/** Old saves: nothing to fill (the field is optional and planned on demand). */
export const FACTION_SHORT = SHORT;
export const factionName = (id: RivalId) => FACTIONS[id].name;
