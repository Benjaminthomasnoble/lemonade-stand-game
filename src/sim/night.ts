// The night on the clock (spec: Core loops and time; Defenses: warnings and
// auto-pause). Closing at 20:00 is the Evening, a moment; then 20:00 to 07:00
// runs minute by minute, about 8 real seconds a game hour at 1× (quiet nights
// at 3× until an alert). Rival raids set out at their own minute and travel
// 1–3 game hours by distance. A detected raid warns as it sets out, with its
// full ETA; an undetected one warns at the difficulty's minimum notice (30, 15
// or 5 game minutes). Raids are fought one by one at their arrival minute, in
// ETA order. Daytime raids (Delivery Raids on a VIP pickup, your raids sent
// now) run on the same timeline during business hours. Your squads travel
// both ways: their posts sit empty from departure until they're home.
// Pure and seeded, like the rest of the sim.
import {
  CLOSE, DAWN, DELIVERY_WINDOW, FACTIONS, FIGHT_SECONDS_PER_GAME_MINUTE, GRAPEVINE_EARLY, MINUTES_PER_DAY,
  NIGHT_END, NIGHT_REAL_SECONDS_PER_MINUTE, OPEN, PLAYER_RAID_LEAVE, QUIET_NIGHT_SPEED, RAID_FIGHT_GUESS, RAID_TRAVEL,
  REAL_SECONDS_PER_MINUTE, type RivalId,
} from './balance.ts';
import { LOTTIES_CORNER, PLOT_BY_ID, PLOTS } from './map.ts';
import { nextRandom } from './rng.ts';
import type { GameState, SimEvent } from './economy.ts';
import { autoRestock, servingsAvailable } from './economy.ts';
import { assaultTurnsBack, detectionChance, guardReady, hasBuilding, raidIsNightAt, raidRepCost, sabotageCalledOff, threatLevel, type BattleReport, type Raid } from './crew.ts';
import { startFight } from './fight.ts';
import { clubhouses, squadClub } from './clubhouse.ts';
import { alert, isMajor, onFeed, pruneAlerts } from './alerts.ts';
import { lookoutStealth, migrateThreat, threatAtDawn } from './threat.ts';
import { syndicateAtDawn, syndicateFormed } from './syndicate.ts';
import { siegeFought, squeezeAtDawn } from './squeeze.ts';
import { deliver, DELIVERY_RAID_CHANCE, DELIVERY_RAID_THREAT, isVip, loseLoad, syndicateFestRaid, type Order, type Pickup } from './vip.ts';
import { hasTrophy, hqPlot } from './rivals.ts';
import { difficulty, peaceful } from './modes.ts';
import { deliveryRaider, nightShiftStealth } from './rivalAi.ts';
import { scriptedRaider } from './beats.ts';
import { autoDefendOnWarning } from './autodefend.ts';
import { lightSleeper } from './perks.ts';

// ---------- clock ----------

/** "01:30" as a minute of the night: past midnight counts on from 1,440. */
export function etaMinute(eta: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(eta);
  if (!m) return PLAYER_RAID_LEAVE;
  const t = Number(m[1]) * 60 + Number(m[2]);
  return t < DAWN ? t + MINUTES_PER_DAY : t;
}
const dayMinute = (minute: number) => ((minute % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
/** A minute as "01:30" (the raid's eta string). */
export const hhmm = (minute: number) => `${String(Math.floor(dayMinute(minute) / 60)).padStart(2, '0')}:${String(dayMinute(minute) % 60).padStart(2, '0')}`;
/** A minute as the HUD's clock reads it: "1:30am". */
export function clockText(minute: number): string {
  const t = dayMinute(minute), h = Math.floor(t / 60), mm = t % 60;
  return `${((h + 11) % 12) + 1}:${String(mm).padStart(2, '0')}${h < 12 ? 'am' : 'pm'}`;
}

/** The difficulty's minimum warning for an undetected raid, in game minutes. */
export const raidNotice = (s: GameState) => difficulty(s).notice;

/** Real seconds per game minute right now; Infinity while the clock stands still.
 * Business hours run at about 18 real seconds a game hour and the night at 8, both divided by the speed. A brawl
 * on screen, or the last minutes of a raid warning (countingDown), slows the clock to fight speed (1 game minute per
 * real second) at any speed. Quiet nights (a setting) run at 3× until a warning comes in. */
export function secondsPerMinute(s: GameState, speed: number, o: { fighting?: boolean; quiet?: boolean } = {}): number {
  if (speed <= 0 || (s.phase !== 'open' && s.phase !== 'night')) return Infinity;
  if (o.fighting || countingDown(s)) return FIGHT_SECONDS_PER_GAME_MINUTE;
  if (s.phase === 'open') return REAL_SECONDS_PER_MINUTE / speed;
  return NIGHT_REAL_SECONDS_PER_MINUTE / (o.quiet && quietNight(s) ? QUIET_NIGHT_SPEED : speed);
}

/** A raid on you is warned, not fought yet, and inside the difficulty's notice of landing (raidNotice: 30, 15 or 5
 * game minutes): the clock runs at fight speed till the fight starts, so the last stretch lasts that many real
 * seconds on every difficulty (Cutthroat's 5-minute notice, 5). Before it, a detected raid's longer warning runs at
 * the speed you chose; an undetected one warns at the notice, so its whole countdown is at fight speed. With
 * auto-pause on, the warning waits for you first. */
export const countingDown = (s: GameState) => s.raids.some((r) => r.warned && onYou(s, r) && minutesLeft(s, r) <= raidNotice(s));
/** Nothing has come in tonight: no warning is out, no card from the night is still on the feed (a note melts off it
 * after ALERT_LIFE: alerts.ts onFeed) and no squad of yours is on the road, so a quiet night runs at 3×. Your own
 * raid's trip, fight and walk home play at the speed you chose (the walkthrough's 90-minute trip, about 12 real
 * seconds at 1×). Once the raid is fought (its card goes) or the squad is home, the night is quiet again. */
export const quietNight = (s: GameState) => s.phase === 'night' && !s.raids.some((r) => (r.warned && onYou(s, r)) || setOut(s, r))
  && !(s.alerts ?? []).some((a) => a.day === s.day && a.minute > CLOSE && onFeed(s, a));
/** Game minutes until a raid hits. */
export const minutesLeft = (s: GameState, r: Raid) => Math.max(0, (r.at ?? s.minute) - s.minute);

// ---------- travel ----------

/** Raids travel 1–3 game hours by distance, in 5-minute steps (also the seam for the Raid Planner and Ring the Bell). */
export function travelMinutes(_s: GameState, fromPlotId: string, toPlotId: string): number {
  const a = PLOT_BY_ID[fromPlotId], b = PLOT_BY_ID[toPlotId];
  if (!a || !b) return RAID_TRAVEL.min;
  const d = Math.hypot(a.x - b.x, a.z - b.z);
  return Math.round((RAID_TRAVEL.min + (RAID_TRAVEL.max - RAID_TRAVEL.min) * Math.min(1, d / RAID_TRAVEL.span)) / 5) * 5;
}

/** Where a rival's raid sets out from: their nearest plot to the target (their HQ if they hold nothing else). */
export function raidStart(s: GameState, rival: RivalId, target: string): string {
  const t = PLOT_BY_ID[target];
  let best = hqPlot(rival).id, d = Infinity;
  for (const p of PLOTS) {
    if (s.plots[p.id].owner !== rival) continue;
    const dd = Math.hypot(p.x - t.x, p.z - t.z);
    if (dd < d) { d = dd; best = p.id; }
  }
  return best;
}

/** Where your squad sets out from and walks home to: the Clubhouse its guards wait at (the one most of them share,
 * nearest the target on a tie: clubhouse.ts squadClub). When none of them waits at one (all on posts), or with no
 * squad named, your Clubhouse nearest the target (one on a Street plot that stands; a wrecked one houses nobody),
 * else Lottie's Corner. */
export function squadHome(s: GameState, target: string, guardIds: readonly string[] = []): string {
  const club = squadClub(s, guardIds, target);
  if (club) return club;
  const t = PLOT_BY_ID[target];
  let best = LOTTIES_CORNER, d = Infinity;
  for (const p of clubhouses(s)) {
    const dd = Math.hypot(p.x - t.x, p.z - t.z);
    if (dd < d) { d = dd; best = p.id; }
  }
  return best;
}

/** Your raid's trip: when it sets out, when it hits, and about when the squad is home (the fight's length is a guess
 * until it's fought). Tonight's raids leave at 01:00 (straight away later in the night); one sent now leaves now,
 * or as the stands open when it's sent at Morning Prep. */
export function squadTrip(s: GameState, target: string, when: 'now' | 'tonight', guardIds: readonly string[] = []): { leave: number; at: number; back: number; travel: number } {
  const leave = when === 'tonight' ? Math.max(PLAYER_RAID_LEAVE, s.phase === 'night' ? s.minute : 0) : Math.max(s.minute, OPEN);
  const travel = travelMinutes(s, squadHome(s, target, guardIds), target);
  return { leave, at: leave + travel, back: leave + travel + RAID_FIGHT_GUESS + travel, travel };
}

/** planRaid hands its raid here: it goes on the clock and travels; nothing is fought until it arrives. */
export function sendRaid(s: GameState, raid: Raid, when: 'now' | 'tonight'): true {
  const t = squadTrip(s, raid.target, when, raid.guards);
  raid.leave = t.leave;
  raid.at = t.at;
  raid.eta = hhmm(t.at);
  s.raids.push(raid);
  return true;
}

/** One of your raids has set out (or fought, and the squad is walking home): its guards are away from their posts. */
const setOut = (s: GameState, r: Raid) => r.attacker === 'player' && (r.back !== undefined || (r.leave ?? 0) <= s.minute);
/** Guards out on one of your raids right now (travelling, fighting or walking home): their posts sit empty. */
export const awayGuards = (s: GameState) => new Set(s.raids.filter((r) => setOut(s, r)).flatMap((r) => r.guards ?? []));

/** Guards who will be away on one of your raids at `minute`, later tonight say: set out by then and not home yet (a
 * squad not yet fought is home a fight's guess and the walk back after it gets there), and the squad in the fight
 * playing live now. A raid warning counts who will really meet the raiders when they land. */
export function awayAt(s: GameState, minute: number): Set<string> {
  const away = new Set<string>();
  for (const r of s.raids) {
    if (r.attacker !== 'player' || (r.leave ?? 0) > minute) continue;
    const home = r.back ?? (r.at ?? r.leave ?? 0) + RAID_FIGHT_GUESS + travelMinutes(s, squadHome(s, r.target), r.target);
    if (home > minute) for (const id of r.guards ?? []) away.add(id);
  }
  if (s.fight?.raid.attacker === 'player') for (const id of s.fight.raid.guards ?? []) away.add(id);
  return away;
}

/** The posts a squad would leave empty, for the Raid Planner: each guard who stands one. */
export const emptyPosts = (s: GameState, guardIds: string[]) =>
  s.guards.filter((g) => guardIds.includes(g.id) && g.post && s.plots[g.post]?.owner === 'player');

// ---------- the timeline ----------

/** A rival raid on one of your plots: these are always warned. */
export const onYou = (s: GameState, r: Raid) => r.attacker !== 'player' && s.plots[r.target]?.owner === 'player';
/** Nothing of yours is in play tonight: no raid is coming for you and none of your squads is out. Sleep then skips
 * straight to dawn instead of playing out an empty night (Ben, 2026-11-08). */
export const nothingTonight = (s: GameState) => !s.raids.some((r) => onYou(s, r) || r.attacker === 'player') && !s.fight;
/** What Sleep does from the Evening: with nothing of yours in play it skips straight to dawn; otherwise the night
 * plays on the clock (a raid night at the quiet speed until the warning). Null outside the Evening. */
export const sleepPlan = (s: GameState): 'dawn' | 'night' | null => (s.phase !== 'report' ? null : nothingTonight(s) ? 'dawn' : 'night');

/** Raids planned with only an eta (old saves) get their minutes. */
function fillTimes(s: GameState, r: Raid): void {
  if (r.at !== undefined && r.leave !== undefined) return;
  r.at ??= etaMinute(r.eta);
  r.leave ??= r.attacker === 'player' ? r.at : Math.max(Math.min(r.at, CLOSE), r.at - travelMinutes(s, raidStart(s, r.attacker as RivalId, r.target), r.target));
}

/** Juni's Grapevine (the Cold Brew trophy): word of a raid on you, Delivery Raids included, comes an hour sooner. */
const early = (s: GameState, r: Raid) => (onYou(s, r) ? (hasTrophy(s, 'coldbrew') ? GRAPEVINE_EARLY : 0) + lightSleeper(s) : 0); // and Light Sleeper's half hour (perks.ts)

/** When a raid on you is warned: a detected one as it sets out, with its full ETA; an undetected one at the minimum
 * notice before it hits. The Grapevine moves either an hour earlier. */
const warnMinute = (s: GameState, r: Raid) => (r.detected ? r.leave! : Math.max(r.leave!, r.at! - raidNotice(s))) - early(s, r);

/** The chance a raid on you is spotted as it sets out: the target's alarms, lookouts and lights (crew's
 * detectionChance), less what the raiders' own lookouts take off (threat.ts; never under 5% on their own) and Cold
 * Brew's Night Shift (rivalAi.ts), which leaves a stand with no alarm blind at night. */
export const spotChance = (s: GameState, r: Raid) =>
  Math.max(0.05, detectionChance(s, r.target, s.phase === 'night') - lookoutStealth(r)) - nightShiftStealth(s, r);

/** The raid sets out (a raid on you is rolled an hour early with the Grapevine): detection is rolled (spotChance). Your own squad musters: anyone KO'd, gone or still out on another raid stays
 * behind, and with nobody fit to go the raid is called off (no fight, no Grudge). */
function launch(s: GameState, r: Raid): void {
  r.launched = true;
  if (r.attacker === 'player') { muster(s, r); return; }
  if (!onYou(s, r)) return;
  if (!r.detected) {
    const rng = { seed: s.seed };
    r.detected = nextRandom(rng) < spotChance(s, r); // the raiders' lookouts, and Cold Brew's Night Shift
    s.seed = rng.seed;
  }
  r.warnAt = Math.max(s.minute, warnMinute(s, r));
}

function muster(s: GameState, r: Raid): void {
  const busy = new Set(s.raids.filter((x) => x !== r && x.attacker === 'player' && x.launched).flatMap((x) => x.guards ?? []));
  r.guards = (r.guards ?? []).filter((id) => { const g = s.guards.find((x) => x.id === id); return !!g && guardReady(s, g) && !busy.has(id); });
  const off = r.guards.length ? sabotageCalledOff(s, r) : `Raid on ${PLOT_BY_ID[r.target].name} called off: nobody fit to go.`; // crew: a Sabotage still needs its Lookout or Sneaky guard
  if (!off) return;
  s.raids = s.raids.filter((x) => x !== r);
  s.news.push(off);
}

/** After the fight your squad walks home the same way, carrying anyone KO'd; their posts fill again as they arrive.
 * Customers see a raid fought in business hours: it costs Reputation (night raids cost nothing). */
function homeward(s: GameState, r: Raid, report: BattleReport, daytime: boolean, started = s.minute): void {
  const stars = raidRepCost(s, r.guards ?? [], r.objective, !daytime); // crew's rule: Gentle Giants alone cost nothing
  if (stars) s.reputation = Math.max(1, Math.round((s.reputation - stars) * 100) / 100);
  r.back = started + Math.ceil(report.duration / FIGHT_SECONDS_PER_GAME_MINUTE) + travelMinutes(s, squadHome(s, r.target, r.guards), r.target);
  s.raids.push(r);
}

function warn(s: GameState, r: Raid): SimEvent {
  r.warned = true;
  const who = FACTIONS[r.attacker as RivalId].name, where = PLOT_BY_ID[r.target].name;
  const text = r.delivery
    ? `DELIVERY RAID! ${who} are coming for the pickup at ${where}, ETA ${clockText(r.at!)}.`
    : `RAID WARNING! ${who} are heading for ${where}, ETA ${clockText(r.at!)}.`;
  const ev: SimEvent = { type: 'alert', alert: alert(s, { kind: r.delivery ? 'delivery' : 'raid', text, plot: r.target, raid: r.id }) };
  autoDefendOnWarning(s, r); // combat: Dex's Auto-Defend rings the bell (autodefend.ts)
  return ev;
}

/** The raid arrives and the fight starts: live while the game watches (combat's startFight), else fought at once.
 * A live fight reports when it ends, and fight.ts calls raidFought then. */
function arrive(s: GameState, r: Raid): BattleReport | null {
  const rest = s.raids.filter((x) => x !== r);
  // Guards on one of your raids are away once it has set out, until they're home (they defend their posts till then).
  s.raids = rest.filter((x) => x.attacker !== 'player' || setOut(s, x));
  const daytime = !raidIsNightAt(s.minute); // crew: the fight's minute decides, as the Raid Planner reads it (20:00 sharp is night)
  const report = startFight(s, r, !daytime);
  s.raids = rest.filter((x) => s.raids.includes(x) || (x.attacker === 'player' && !setOut(s, x)));
  if (report === true) return null;
  raidFought(s, r, report, daytime, s.minute + (r.earlierStages ?? 0)); // crew: an HQ Assault fought at once heads home after its last stage
  return report;
}

/** A raid's fight is over (fought at once, or live and just ended: `started` is the minute it began). Your squad
 * walks home, a Delivery Raid's pickup loads out, or fails if the raiders overran it, and a Big Squeeze target is held
 * or lost. */
export function raidFought(s: GameState, r: Raid, report: BattleReport, daytime: boolean, started = s.minute): void {
  if (r.attacker === 'player') homeward(s, r, report, daytime, started);
  if (r.delivery && r.order) settle(s, r.order, report);
  if (r.siege) siegeFought(s, r, report); // the Big Squeeze: a target held, or lost
}

/** Your squad gets there and the stand is gone (smashed by someone else, sold, or its owner went under), or an HQ is
 * shut to it now (its rival isn't Weakened any more): they walk home again, no fight and no Grudge. */
function nothingThere(s: GameState, r: Raid): boolean {
  const ps = s.plots[r.target];
  const shut = assaultTurnsBack(s, r); // crew: an HQ whose rival isn't Weakened any more turns the squad back too
  if (!shut && ps.owner && ps.owner !== 'player' && (r.assault ? s.rivals[ps.owner as RivalId].alive : hasBuilding(ps))) return false; // crew: an HQ while its rival stands
  r.back = s.minute + Math.max(0, s.minute - r.leave!);
  s.news.push(shut ?? `Your squad found nothing to raid at ${PLOT_BY_ID[r.target].name} and turned back.`);
  return true;
}

/** Everything due by now on the raid clock: squads home, launches, warnings and arrivals (in ETA order). */
function raidClock(s: GameState): SimEvent[] {
  const ev: SimEvent[] = [];
  const now = s.minute;
  s.raids = s.raids.filter((r) => r.back === undefined || r.back > now); // home: their posts fill again
  const out = s.raids.filter((r) => r.back === undefined); // the rest are walking home
  for (const r of out) {
    fillTimes(s, r);
    if (!r.launched && r.leave! - early(s, r) <= now) launch(s, r);
    if (r.launched && !r.warned && onYou(s, r) && (r.warnAt ?? r.leave!) <= now) ev.push(warn(s, r));
  }
  const due = out.map((r, i) => ({ r, i })).filter(({ r }) => r.at! <= now).sort((a, b) => a.r.at! - b.r.at! || a.i - b.i);
  for (const { r } of due) {
    if (!s.raids.includes(r)) continue; // called off (a truce, the rival went under, or nobody fit to go)
    if (!r.launched) launch(s, r);
    if (!s.raids.includes(r)) continue;
    if (r.attacker === 'player' && nothingThere(s, r)) continue;
    if (!r.warned && onYou(s, r)) ev.push(warn(s, r)); // every raid on you is warned, even a late one
    const report = arrive(s, r);
    if (report) ev.push({ type: 'fight', raid: r, report });
  }
  // A Delivery Raid called off mid-loading (a truce, or the rival went under): the load goes out now. One being fought
  // live (combat's fight.ts) holds it till the fight ends.
  for (const id of [...(s.heldPickups ?? [])]) if (!s.raids.some((r) => r.delivery && r.order === id) && s.fight?.raid.order !== id) settle(s, id, null);
  pruneAlerts(s);
  return ev;
}

/** The client behind an order: a Supply Deal's weekly loads all come from one client. */
export const clientOf = (o: Order) => o.client.replace(/ \(load \d+ of \d+\)$/, '');

/** A VIP client's first arrival is a major alert: it auto-pauses by its own switch, stops the skips and offers Watch
 * (the show plays when you watch it, or not at all). Regulars land and load with a small card that never pauses. */
function arrivals(s: GameState, events: SimEvent[]): SimEvent[] {
  const ev: SimEvent[] = [];
  for (const e of events) {
    if (e.type !== 'pickup' || !e.ok || !isVip(e.order.tier) || !e.order.plot) continue;
    const who = clientOf(e.order), seen = (s.seenClients ??= []);
    const kind = e.order.tier === 'heli' ? 'heli' : 'ship';
    const scene = { kind, big: e.order.qty > 20000, client: e.order.client } as const;
    if (seen.includes(who)) { // the deliver() news line already tells it, so the card stays quiet
      const text = `${kind === 'heli' ? 'Chopper' : 'Ship'} in: ${who}`;
      ev.push({ type: 'alert', alert: alert(s, { kind: 'pickup', text, plot: e.order.plot, order: e.order.id, scene }, false) });
      continue;
    }
    seen.push(who);
    const text = `First ${kind === 'heli' ? 'chopper' : 'ship'} in: ${who}!`;
    ev.push({ type: 'alert', alert: alert(s, { kind: 'vip', text, plot: e.order.plot, order: e.order.id, scene }) });
  }
  return ev;
}

/** One business-hours minute (called from tickMinute after the clock moves, with that minute's events so far):
 * daytime raids, VIP first arrivals, and small calls. */
export function onTheClock(s: GameState, events: SimEvent[] = []): SimEvent[] {
  const ev = [...arrivals(s, events), ...raidClock(s)];
  for (const p of PLOTS) {
    const ps = s.plots[p.id];
    const st = ps.stand;
    if (ps.owner !== 'player' || !st || st.wrecked || st.day.customers === 0 || servingsAvailable(st) > 0) continue;
    if ((s.alerts ?? []).some((a) => a.kind === 'soldout' && a.plot === p.id && a.day === s.day)) continue;
    ev.push({ type: 'alert', alert: alert(s, { kind: 'soldout', text: `Sold out at ${p.name}!`, plot: p.id }) });
  }
  return ev;
}

/** A sold-out card's Restock now: Lottie buys what the stand needs for the day, while the stands are open (supplies
 * can't be bought once they close). The card goes once there's something to sell again; with nothing bought (no
 * cash, no room) it stays. */
export function restockNow(s: GameState, plotId: string): boolean {
  const ps = s.plots[plotId];
  if (s.phase !== 'open' || ps?.owner !== 'player' || !ps.stand || ps.stand.wrecked) return false;
  autoRestock(s, plotId);
  if (servingsAvailable(ps.stand) <= 0) return false;
  s.alerts = (s.alerts ?? []).filter((a) => !(a.kind === 'soldout' && a.plot === plotId));
  return true;
}

/** Evening ends: the night begins on the clock (stands are closed; it runs to 07:00). */
export function startNight(s: GameState): boolean {
  if (s.phase !== 'report') return false;
  s.phase = 'night';
  s.minute = Math.max(s.minute, CLOSE);
  return true;
}

/** One night minute: the clock moves on and whatever is due happens. Dawn itself is sleepUntilDawn's block. */
export function nightStep(s: GameState): SimEvent[] {
  if (s.phase !== 'night' || s.minute >= NIGHT_END) return [];
  s.minute++;
  return raidClock(s);
}

/** Run the rest of the night (from the Evening too). With stopAtAlerts it stops after a minute that raised a
 * major alert, so Sleep till dawn never skips a warning. True once the clock has reached 07:00. */
export function runNight(s: GameState, stopAtAlerts = false, out?: SimEvent[]): boolean {
  startNight(s);
  if (s.phase !== 'night') return false;
  while (s.minute < NIGHT_END) {
    const ev = nightStep(s);
    if (out) out.push(...ev);
    if (stopAtAlerts && ev.some((e) => e.type === 'alert' && isMajor(e.alert))) return false;
  }
  return true;
}

/** One of your squads still on the road at dawn: walking home, or sent so late it gets there after 07:00. Dawn
 * doesn't fight it (crew's resolveNight); it carries on into the morning. */
export const onTheRoad = (r: Raid) => r.attacker === 'player' && (r.back !== undefined || (r.at ?? 0) > NIGHT_END);

/** Dawn: last night's cards have had their moment (the morning feed lists the fights). A squad still on the road
 * carries on this morning (the clock starts a new day): it gets home, or gets there and fights in daylight. */
export function nightsAtDawn(s: GameState): void {
  threatAtDawn(s);
  syndicateAtDawn(s);
  s.alerts = (s.alerts ?? []).filter((a) => a.day >= s.day);
  squeezeAtDawn(s); // the Big Squeeze: last siege night scored, tonight's targets named
  for (const r of s.raids) {
    if (!onTheRoad(r)) continue;
    if (r.back !== undefined) r.back -= MINUTES_PER_DAY;
    r.leave = (r.leave ?? 0) - MINUTES_PER_DAY;
    r.at = (r.at ?? 0) - MINUTES_PER_DAY;
  }
  s.raids = s.raids.filter((r) => r.back === undefined || r.back > DAWN);
}

/** Your raids still travelling to their target (not yet fought): the ones Tonight lists. */
export const raidsOut = (s: GameState) => s.raids.filter((r) => r.attacker === 'player' && r.back === undefined);
/** Your squads walking home from a fight, and when each gets in. */
export const squadsHomeward = (s: GameState) => s.raids.filter((r) => r.attacker === 'player' && r.back !== undefined);

// ---------- Delivery Raids ----------

/** The Delivery Raid an order is being settled against (null: it was called off), while deliver() runs again. */
let settling: { order: string; report: BattleReport | null } | null = null;

/** The raid on a pickup is over (or called off): the order loads out, or fails if the raiders overran it. */
function settle(s: GameState, id: string, report: BattleReport | null): void {
  s.heldPickups = (s.heldPickups ?? []).filter((x) => x !== id);
  const o = s.orders.find((x) => x.id === id);
  if (!o) return;
  settling = { order: id, report };
  try { deliver(s, o); } finally { settling = null; }
}

/** vip.ts deliver() hands its Delivery Raid roll here. A raid is warned and fought on the clock like any raid on
 * you, and the order waits (loading) until it's over. Returns the pickup to report now, or null to deliver. */
export function scheduleDeliveryRaid(s: GameState, o: Order, fail: (why: string) => Pickup): Pickup | null {
  const where = o.tier === 'heli' ? 'helipad' : 'pier';
  if (settling?.order === o.id) {
    const { report } = settling;
    if (report?.outcome !== 'robbed') return null; // held off, or called off: the load goes out
    loseLoad(s, o); // world: the raiders make off with the bottles on this trip
    return { ...fail(`${FACTIONS[report.attacker as RivalId].name} overran the ${where} during loading.`), raid: report };
  }
  const held = (): Pickup => {
    if (!s.orders.includes(o)) s.orders.push(o);
    if (!(s.heldPickups ??= []).includes(o.id)) s.heldPickups.push(o.id);
    return { order: o, ok: true };
  };
  if (s.heldPickups?.includes(o.id)) return held(); // still loading: the raid hasn't hit yet (one roll per pickup)
  if (!isVip(o.tier) || !o.plot || threatLevel(s) < DELIVERY_RAID_THREAT || peaceful(s)) return null;
  const rng = { seed: s.seed };
  const roll = nextRandom(rng);
  s.seed = rng.seed;
  // Story's beat: the campaign's first chopper's first trip is FizzCo's to hit, with no roll (src/sim/beats.ts).
  // Otherwise the keenest boss whose Strike can pay sends the crew (rivals' deliveryRaider), and nobody able to pay means no raid.
  const scripted = scriptedRaider(s, o);
  const crew = scripted ? deliveryRaider(s, scripted) : roll < deliveryRaidChance(s, o) ? deliveryRaider(s) : null;
  if (!crew) return null;
  const { rival, party } = crew;
  // They set out as the trip's loading window opens (world's tripMinutes: deliver() runs then) and hit inside its 2 hours.
  const leave = s.minute;
  const at = leave + Math.min(DELIVERY_WINDOW - 5, travelMinutes(s, raidStart(s, rival, o.plot), o.plot));
  s.raids.push({ id: `r${s.nextId++}`, attacker: rival, target: o.plot, objective: 'shakedown', party, detected: false, eta: hhmm(at), delivery: true, order: o.id, leave, at });
  return held();
}

/** A VIP pickup's chance of a Delivery Raid: 30%, or every one while the Syndicate stands during Harbor Fest (its crews
 * go after every delivery: world's syndicateFestRaid, vip.ts). */
export const deliveryRaidChance = (s: GameState, o: Order) => (syndicateFestRaid(s, o, syndicateFormed(s)) ? 1 : DELIVERY_RAID_CHANCE);

/** Could a Delivery Raid hit this pickup? (Order Book cards flag it.) */
export const deliveryRaidRisk = (s: GameState, o: Order) => isVip(o.tier) && threatLevel(s) >= DELIVERY_RAID_THREAT && !peaceful(s);

// ---------- saves ----------

/** Older saves: alert feed defaults, and tonight's raids get their minutes (detection was already rolled). A pickup
 * a Delivery Raid is out for keeps loading. Safe to run on every load. */
export function migrateNights(s: GameState): void {
  migrateThreat(s);
  s.alerts ??= [];
  s.alertSeq ??= s.alerts.length;
  for (const r of s.raids ?? []) {
    if (r.delivery && r.order && !(s.heldPickups ??= []).includes(r.order)) s.heldPickups.push(r.order);
    if (r.at !== undefined) continue;
    fillTimes(s, r);
    r.launched = true;
    if (onYou(s, r)) r.warnAt = warnMinute(s, r);
  }
}
