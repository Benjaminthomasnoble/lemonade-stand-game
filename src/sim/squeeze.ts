// The Big Squeeze (spec: Act 5, The Big Squeeze; campaign only), the finale. From Rank 9 Lottie posts one goal with no
// timer, and you choose when to call it, at Morning Prep. Seven siege nights follow. Each siege dawn the Corkboard and
// the Bugle name that night's 2–3 Syndicate targets among your plots, and threat.ts sends the strike at them. Every
// night you hold them all takes 500 HP off Sourwood Manor's Gate (5,000 down to 1,500) and benches a Yard elite; every
// plot you lose adds a Steward to the Boss Room. Then you storm the Manor (rivals.ts stormHQ): the Gate at its HP, the
// Yard with the elites left, the Boss Room with Vera and her Stewards. Until the siege is done the Manor can't be
// stormed, and Vera never goes bust: only the Big Squeeze ends her.
// Pure and seeded, like the rest of the sim.
import { ACTS, BIG_SQUEEZE, RANKS, type RivalId } from './balance.ts';
import type { Blocker, GameState, Goal } from './economy.ts';
import { ownedPlots } from './economy.ts';
import { alert } from './alerts.ts';
import { hasBuilding, type BattleReport, type Raid } from './crew.ts';
import { PLOT_BY_ID } from './map.ts';
import { nextRandom } from './rng.ts';
import { targetScore } from './rivalAi.ts';
import { HQS, hqPlot, inTruce } from './rivals.ts';
import { formSyndicate, pactTapes, syndicateFormed, syndicateLeader } from './syndicate.ts';
import { actOf } from './modes.ts';
import { CALL_PRIORITY, phoneCall } from './phone.ts';

export interface SqueezeState {
  posted?: number; // the dawn Lottie posted the goal (Rank 9)
  called?: number; // the day you called it: its first siege night
  nights?: number; // siege nights over
  held?: number; // of them, the nights you held every target: each cut the Gate and benched a Yard elite
  lost?: number; // plots the siege took from you: each added a Steward
  targets?: string[]; // tonight's targets, named at dawn (by the call itself for the first night)
  tonight?: { fought: number; repelled: number; fell: number }; // tonight's fights at the targets so far
  done?: number; // the dawn the siege ended: the Manor is open
}

/** Lottie's line as she posts the goal (spec: Act 5, The button). */
export const SQUEEZE_READY = "When you're ready, kid. Not a minute before.";

const VERA: RivalId = 'sourwood';
/** The campaign's last act, The Big Squeeze: it begins once FizzCo falls (story.ts). */
const FINAL_ACT = ACTS.length;
const STORM = 'Storm Sourwood Manor';
/** The finale's rules hold: a campaign with Vera still in it. */
const finale = (s: GameState) => s.settings.mode === 'campaign' && s.rivals[VERA].alive;
const called = (s: GameState) => s.squeeze?.called !== undefined;
/** The Big Squeeze is there to call (or called): Rank 9 in Act 5 of the campaign, with Vera still in it. */
export const squeezeOpen = (s: GameState) => finale(s) && s.rank >= BIG_SQUEEZE.rank && actOf(s) >= FINAL_ACT;
/** The siege is over (seven nights): the Manor is open. */
export const siegeDone = (s: GameState) => s.squeeze?.done !== undefined;
/** Tonight is a siege night: the Big Squeeze is called and fewer than its seven nights are over. */
export const siegeTonight = (s: GameState) =>
  finale(s) && called(s) && !siegeDone(s) && s.day >= s.squeeze!.called! && (s.squeeze!.nights ?? 0) < BIG_SQUEEZE.nights;
/** Tonight's siege targets (plot ids), as the Corkboard lists them; none when no siege night is on. */
export const siegeTargets = (s: GameState): string[] => (siegeTonight(s) ? [...(s.squeeze!.targets ?? [])] : []);
/** The siege night tonight is, from 1 to 7 (0 before the call). */
export const siegeNight = (s: GameState) => (called(s) ? Math.min(BIG_SQUEEZE.nights, (s.squeeze!.nights ?? 0) + 1) : 0);

/** Your plots a strike could hit: yours, with a building standing. */
const holdable = (s: GameState) => ownedPlots(s, 'player').filter((p) => hasBuilding(s.plots[p.id]));
/** A plot's short name for a card: "Maple Row 3". */
const place = (id: string) => PLOT_BY_ID[id].name.replace(/ lot /, ' ');

// ---------- the call ----------

export function canCallBigSqueeze(s: GameState): Blocker {
  if (s.settings.mode !== 'campaign') return { ok: false, why: 'Story campaign only' };
  if (!s.rivals[VERA].alive) return { ok: false, why: 'Vera is out of the game' };
  if (s.rank < BIG_SQUEEZE.rank) return { ok: false, why: `Needs Rank ${BIG_SQUEEZE.rank}, ${RANKS[BIG_SQUEEZE.rank - 1].title}` };
  if (actOf(s) < FINAL_ACT) return { ok: false, why: `Opens in Act ${FINAL_ACT}` };
  if (called(s)) return { ok: false, why: 'Called already' };
  if (inTruce(s, VERA)) return { ok: false, why: `Truce with Vera until day ${s.rivals[VERA].truceUntil}` };
  if (s.phase !== 'prep') return { ok: false, why: 'Call it at Morning Prep' };
  if (!holdable(s).length) return { ok: false, why: 'Open a stand to hold first' };
  return { ok: true };
}

/** Call the Big Squeeze: tonight is siege night 1 and its targets are named now. Vera answers on the phone; if the Pact
 * isn't standing yet she calls it in (the siege's strikes are the Syndicate's), and that call is her answer. */
export function callBigSqueeze(s: GameState): boolean {
  if (!canCallBigSqueeze(s).ok) return false;
  const pact = syndicateFormed(s);
  if (!pact) formSyndicate(s);
  s.squeeze = { ...s.squeeze, called: s.day, nights: 0, held: 0, lost: 0 };
  s.news.push('Bugle: THE BIG SQUEEZE: LOTTIE CALLS OUT SOURWOOD MANOR');
  if (pact) phoneCall(s, VERA, '', { mood: 'warn', priority: CALL_PRIORITY.story }); // it rings at the next lull (main.ts)
  nameTargets(s);
  return true;
}

/** Name tonight's 2–3 targets, the plots Vera most wants (her raid value: worth over defense) the likeliest, on the
 * alert feed and in the Bugle. */
function nameTargets(s: GameState): void {
  const q = s.squeeze!;
  const rng = { seed: s.seed };
  const [lo, hi] = BIG_SQUEEZE.targets;
  const want = lo + Math.floor(nextRandom(rng) * (hi - lo + 1));
  const pool = holdable(s).map((p) => ({ id: p.id, w: Math.max(1, targetScore(s, VERA, p.id)) }));
  const picked: string[] = [];
  while (picked.length < want && pool.length) {
    let x = nextRandom(rng) * pool.reduce((a, p) => a + p.w, 0);
    let i = 0;
    while (i < pool.length - 1 && (x -= pool[i].w) > 0) i++;
    picked.push(pool.splice(i, 1)[0].id);
  }
  s.seed = rng.seed;
  q.targets = picked;
  if (!picked.length) return;
  alert(s, { kind: 'note', text: `Siege targets: ${picked.map(place).join(', ')}`, plot: picked[0] }, false);
  s.news.push(`Bugle: Siege night ${siegeNight(s)} of ${BIG_SQUEEZE.nights}: the Pact circles ${picked.map((id) => PLOT_BY_ID[id].name).join(', ')}`);
}

// ---------- the siege ----------

/** A siege raid has been fought (night.ts arrive): a target held, or lost (smashed: a Steward joins the Boss Room). */
export function siegeFought(s: GameState, r: Raid, report: BattleReport): void {
  const q = s.squeeze;
  if (!r.siege || !q || siegeDone(s)) return;
  const t = (q.tonight ??= { fought: 0, repelled: 0, fell: 0 });
  t.fought++;
  if (report.outcome === 'repelled') t.repelled++;
  if (report.outcome === 'smashed') { t.fell++; q.lost = (q.lost ?? 0) + 1; }
}

/** Dawn (night.ts nightsAtDawn): Lottie posts the goal at Rank 9; on a siege dawn last night is scored (held only if
 * the strike came and every fight at the targets was won), then the next night's targets are named, or after the
 * seventh night the Manor opens. */
export function squeezeAtDawn(s: GameState): void {
  if (!finale(s)) return;
  if (squeezeOpen(s) && s.squeeze?.posted === undefined) {
    (s.squeeze ??= {}).posted = s.day;
    s.news.push(`Lottie: "${SQUEEZE_READY}"`); // her goal card shows story's Act 5 goal from Rank 9: Call the Big Squeeze
  }
  const q = s.squeeze;
  if (!q || q.called === undefined || siegeDone(s) || s.day <= q.called) return;
  const t = q.tonight ?? { fought: 0, repelled: 0, fell: 0 };
  delete q.tonight;
  q.nights = (q.nights ?? 0) + 1;
  const good = t.fought > 0 && t.repelled === t.fought;
  if (good) q.held = (q.held ?? 0) + 1;
  const gate = squeezedHq(s, VERA).gate.toLocaleString('en-US');
  s.news.push(good ? `Bugle: The siege lines hold! Sourwood Manor's Gate is down to ${gate} HP`
    : t.fell ? `Bugle: The Pact breaks through: Vera hires ${t.fell} more Steward${t.fell > 1 ? 's' : ''}`
    : t.fought ? `Bugle: The siege lines bend; the Manor's Gate holds at ${gate} HP`
    : 'Bugle: A quiet night on the siege lines');
  if (q.nights < BIG_SQUEEZE.nights) { nameTargets(s); return; }
  q.done = s.day;
  q.targets = [];
  alert(s, { kind: 'note', text: 'The siege is over: storm Sourwood Manor', plot: hqPlot(VERA).id });
}

// ---------- the Manor ----------

/** An HQ as stormHQ fights it: the campaign's Sourwood Manor after the Big Squeeze has its Gate cut 500 HP (to 1,500 at
 * most) and a Yard elite benched for each night you held; every other HQ, and the Manor in Sandbox and Endless, as built. */
export function squeezedHq(s: GameState, id: RivalId): (typeof HQS)[RivalId] {
  const hq = HQS[id];
  if (id !== VERA || s.settings.mode !== 'campaign' || !called(s)) return hq;
  const held = s.squeeze!.held ?? 0;
  return { ...hq, gate: Math.max(BIG_SQUEEZE.gateFloor, hq.gate - BIG_SQUEEZE.gateCut * held), yard: Math.max(0, hq.yard - held) };
}

/** Old Money's Stewards in the Boss Room: 3, and in the campaign one more for each plot the siege took from you. */
export const manorStewards = (s: GameState, id: RivalId) => BIG_SQUEEZE.stewards + (id === VERA && s.settings.mode === 'campaign' ? s.squeeze?.lost ?? 0 : 0);

/** canAssault's campaign rule for Sourwood Manor (null: any other HQ, or the Manor outside the campaign, where it opens
 * once she's Weakened): shut until the siege is done, then open, Weakened or not, so a beaten squad can regroup and
 * come back. */
export function squeezeAssault(s: GameState, id: RivalId): Blocker | null {
  if (id !== VERA || s.settings.mode !== 'campaign') return null;
  if (siegeDone(s)) return { ok: true };
  return { ok: false, why: called(s) ? `After the siege: night ${siegeNight(s)} of ${BIG_SQUEEZE.nights}` : 'Call the Big Squeeze first' };
}

/** rivalsBankrupt's campaign rule: Vera never goes bust; only the Big Squeeze ends her. */
export const onlyTheSqueeze = (s: GameState, id: RivalId) => id === VERA && s.settings.mode === 'campaign';

// ---------- the Bugle ----------

/** One of the Pact's stories for the front page: its two tapes, its line as a brief, and how high it ranks (lower
 * leads; a new act's banner is 0, the other story beats 1). */
export interface PactStory { big: string; small: string; brief: string; rank: number }

const list = (names: string[]) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0] ?? '');

/** The Pact and the Big Squeeze on this morning's Bugle. They land at dawn after the newsroom has taken its notes, so
 * world's front page reads them here, as story beats (media.ts): PACT IS BACK the morning the Syndicate forms; THE BIG
 * SQUEEZE the day you call it, with tonight's targets; each siege dawn, that night's targets; and the morning the
 * siege ends, the Manor's Gate as it stands. */
export function pactNews(s: GameState): PactStory[] {
  const out: PactStory[] = [];
  const leader = syndicateLeader(s);
  if (s.syndicate?.formed === s.day && leader) {
    const [big, small] = pactTapes(leader);
    out.push({ big, small, brief: `Pact is back: ${small}.`, rank: 0.5 });
  }
  const q = s.squeeze;
  if (!finale(s) || !q || q.called === undefined) return out;
  const targets = list(siegeTargets(s).map(place));
  if (q.called === s.day) {
    out.push({ big: 'THE BIG SQUEEZE!', small: 'Lottie calls out Sourwood Manor', brief: `Lottie calls out Sourwood Manor${targets ? `; tonight the Pact circles ${targets}` : ''}.`, rank: 0.4 });
  } else if (targets) {
    const n = siegeNight(s);
    out.push({ big: `SIEGE NIGHT ${n}!`, small: `The Pact circles ${targets}`, brief: `Siege night ${n} of ${BIG_SQUEEZE.nights}: the Pact circles ${targets}.`, rank: 0.5 });
  }
  if (q.done === s.day) {
    const gate = squeezedHq(s, VERA).gate.toLocaleString('en-US');
    out.push({ big: 'SIEGE OVER!', small: `Sourwood Manor's Gate at ${gate} HP`, brief: `The siege is over: Sourwood Manor's Gate stands at ${gate} HP.`, rank: 0.5 });
  }
  return out;
}

// ---------- the goal ----------

/** Lottie's story goal once the Big Squeeze is called, with no timer (goals.ts GOAL_PROVIDERS, the long slot; until the
 * call her card shows story's own Act 5 goal, Call the Big Squeeze): hold the siege, then storm the Manor, ticked off
 * and paid as Vera falls, in place of that Act 5 goal. Null outside the campaign and before the call. */
export function bigSqueezeGoal(s: GameState): Goal | null {
  if (s.settings.mode !== 'campaign' || !called(s)) return null;
  if (!s.rivals[VERA].alive) return { text: STORM, progress: 1, done: true };
  if (!siegeDone(s)) return { text: `Hold the siege: night ${siegeNight(s)} of ${BIG_SQUEEZE.nights}`, progress: (s.squeeze!.nights ?? 0) / BIG_SQUEEZE.nights, done: false };
  return { text: STORM, progress: 0, done: false };
}
