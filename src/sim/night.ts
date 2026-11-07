// The night on the clock (spec: Core loops and time; Defenses: warnings and
// auto-pause). Closing at 20:00 is the Evening, a moment; then 20:00 to 07:00
// runs minute by minute, about 8 real seconds a game hour at 1× (quiet nights
// at 3× until an alert). Rival raids set out at their own minute and travel
// 1–3 game hours by distance. A detected raid warns as it sets out, with its
// full ETA; an undetected one warns at the difficulty's minimum notice (30, 15
// or 5 game minutes). Raids are fought one by one at their arrival minute, in
// ETA order. Daytime raids (Delivery Raids on a VIP pickup) run on the same
// timeline during business hours. Pure and seeded, like the rest of the sim.
import {
  CLOSE, DAWN, DELIVERY_WINDOW, DIFFICULTY, FACTIONS, FIGHT_SECONDS_PER_GAME_MINUTE, MINUTES_PER_DAY, NIGHT_END,
  NIGHT_REAL_SECONDS_PER_MINUTE, PLAYER_RAID_AT, QUIET_NIGHT_SPEED, RAID_TRAVEL, REAL_SECONDS_PER_MINUTE, type RivalId,
} from './balance.ts';
import { PLOT_BY_ID, PLOTS } from './map.ts';
import { nextRandom } from './rng.ts';
import type { GameState, SimEvent } from './economy.ts';
import { servingsAvailable } from './economy.ts';
import { detectionChance, fightRaid, raidPartyFor, threatLevel, type BattleReport, type Raid } from './crew.ts';
import { alert, isMajor, pruneAlerts } from './alerts.ts';
import { deliver, DELIVERY_RAID_CHANCE, DELIVERY_RAID_THREAT, isVip, type Order, type Pickup } from './vip.ts';
import { hqPlot } from './rivals.ts';
import { peaceful } from './modes.ts';

const RIVALS = Object.keys(FACTIONS) as RivalId[];

// ---------- clock ----------

/** "01:30" as a minute of the night: past midnight counts on from 1,440. */
export function etaMinute(eta: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(eta);
  if (!m) return PLAYER_RAID_AT;
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
export const raidNotice = (s: GameState) => DIFFICULTY[s.settings.difficulty].notice;

/** Real seconds per game minute right now; Infinity while the clock stands still.
 * Business hours run at about 18 real seconds a game hour and the night at 8, both divided by the speed. A brawl
 * on screen, or a raid warning in its last minutes of notice, slows the clock to fight speed (1 game minute per
 * real second) at any speed. Quiet nights (a setting) run at 3× until a warning comes in. */
export function secondsPerMinute(s: GameState, speed: number, o: { fighting?: boolean; quiet?: boolean } = {}): number {
  if (speed <= 0 || (s.phase !== 'open' && s.phase !== 'night')) return Infinity;
  if (o.fighting || countingDown(s)) return FIGHT_SECONDS_PER_GAME_MINUTE;
  if (s.phase === 'open') return REAL_SECONDS_PER_MINUTE / speed;
  return NIGHT_REAL_SECONDS_PER_MINUTE / (o.quiet && quietNight(s) ? QUIET_NIGHT_SPEED : speed);
}

/** A raid on you is warned and inside its last minutes of notice: the clock runs at fight speed. */
export const countingDown = (s: GameState) => s.raids.some((r) => r.warned && onYou(s, r) && (r.at ?? 0) - s.minute <= raidNotice(s));
/** No warning is out: a quiet night can run at 3×. */
export const quietNight = (s: GameState) => s.phase === 'night' && !s.raids.some((r) => r.warned && onYou(s, r));
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

// ---------- the timeline ----------

/** A rival raid on one of your plots: these are always warned. */
export const onYou = (s: GameState, r: Raid) => r.attacker !== 'player' && s.plots[r.target]?.owner === 'player';

/** Raids planned with only an eta (your 'tonight' raids, old saves) get their minutes. */
function fillTimes(s: GameState, r: Raid): void {
  if (r.at !== undefined && r.leave !== undefined) return;
  r.at ??= etaMinute(r.eta);
  r.leave ??= r.attacker === 'player' ? r.at : Math.max(Math.min(r.at, CLOSE), r.at - travelMinutes(s, raidStart(s, r.attacker as RivalId, r.target), r.target));
}

/** The raid sets out: detection is rolled now, against the target's alarms, lookouts and lights. */
function launch(s: GameState, r: Raid): void {
  r.launched = true;
  if (!onYou(s, r)) return;
  if (!r.detected) {
    const rng = { seed: s.seed };
    r.detected = nextRandom(rng) < detectionChance(s, r.target, s.phase === 'night');
    s.seed = rng.seed;
  }
  r.warnAt = r.detected ? r.leave! : Math.max(r.leave!, r.at! - raidNotice(s));
}

function warn(s: GameState, r: Raid): SimEvent {
  r.warned = true;
  const who = FACTIONS[r.attacker as RivalId].name, where = PLOT_BY_ID[r.target].name;
  const text = r.delivery
    ? `DELIVERY RAID! ${who} are coming for the pickup at ${where}, ETA ${clockText(r.at!)}.`
    : `RAID WARNING! ${who} are heading for ${where}, ETA ${clockText(r.at!)}.`;
  // combat: autoDefendOnWarning(s, r) rings the bell here once Dex's Auto-Defend merges.
  return { type: 'alert', alert: alert(s, { kind: r.delivery ? 'delivery' : 'raid', text, plot: r.target, raid: r.id }) };
}

/** The raid arrives and the fight is fought (instantly, then replayed, until combat's live fights merge: startFight). */
function arrive(s: GameState, r: Raid): BattleReport {
  const rest = s.raids.filter((x) => x !== r);
  // Guards on one of your raids are away only once it has set out (they defend their posts until then).
  s.raids = rest.filter((x) => x.attacker !== 'player' || (x.leave ?? 0) <= s.minute);
  const report = fightRaid(s, r, s.phase === 'night');
  s.raids = rest.filter((x) => s.raids.includes(x) || (x.attacker === 'player' && (x.leave ?? 0) > s.minute));
  if (r.delivery && r.order) settle(s, r.order, report);
  return report;
}

/** Everything due by now on the raid clock: launches, warnings and arrivals (in ETA order). */
function raidClock(s: GameState): SimEvent[] {
  const ev: SimEvent[] = [];
  const now = s.minute;
  for (const r of s.raids) {
    fillTimes(s, r);
    if (!r.launched && r.leave! <= now) launch(s, r);
    if (r.launched && !r.warned && onYou(s, r) && (r.warnAt ?? r.leave!) <= now) ev.push(warn(s, r));
  }
  const due = s.raids.map((r, i) => ({ r, i })).filter(({ r }) => r.at! <= now).sort((a, b) => a.r.at! - b.r.at! || a.i - b.i);
  for (const { r } of due) {
    if (!s.raids.includes(r)) continue; // called off (a truce, or the rival went under)
    if (!r.launched) launch(s, r);
    if (!r.warned && onYou(s, r)) ev.push(warn(s, r)); // every raid on you is warned, even a late one
    ev.push({ type: 'fight', raid: r, report: arrive(s, r) });
  }
  // A Delivery Raid called off mid-loading (a truce, or the rival went under): the load goes out now.
  for (const id of [...(s.heldPickups ?? [])]) if (!s.raids.some((r) => r.delivery && r.order === id)) settle(s, id, null);
  pruneAlerts(s);
  return ev;
}

/** The client behind an order: a Supply Deal's weekly loads all come from one client. */
export const clientOf = (o: Order) => o.client.replace(/ \(load \d+ of \d+\)$/, '');

/** A VIP client's first arrival is a major alert: it auto-pauses by its own switch and stops the skips, so the
 * show is never jumped past. Regulars just land and load. */
function firstArrivals(s: GameState, events: SimEvent[]): SimEvent[] {
  const ev: SimEvent[] = [];
  for (const e of events) {
    if (e.type !== 'pickup' || !e.ok || !isVip(e.order.tier) || !e.order.plot) continue;
    const who = clientOf(e.order), seen = (s.seenClients ??= []);
    if (seen.includes(who)) continue;
    seen.push(who);
    const text = `First ${e.order.tier === 'heli' ? 'chopper' : 'ship'} in: ${who}!`;
    ev.push({ type: 'alert', alert: alert(s, { kind: 'vip', text, plot: e.order.plot, order: e.order.id }) });
  }
  return ev;
}

/** One business-hours minute (called from tickMinute after the clock moves, with that minute's events so far):
 * daytime raids, VIP first arrivals, and small calls. */
export function onTheClock(s: GameState, events: SimEvent[] = []): SimEvent[] {
  const ev = [...firstArrivals(s, events), ...raidClock(s)];
  for (const p of PLOTS) {
    const ps = s.plots[p.id];
    const st = ps.stand;
    if (ps.owner !== 'player' || !st || st.wrecked || st.day.customers === 0 || servingsAvailable(st) > 0) continue;
    if ((s.alerts ?? []).some((a) => a.kind === 'soldout' && a.plot === p.id && a.day === s.day)) continue;
    ev.push({ type: 'alert', alert: alert(s, { kind: 'soldout', text: `Sold out at ${p.name}!`, plot: p.id }) });
  }
  return ev;
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

/** Dawn: last night's cards have had their moment (the morning feed lists the fights). */
export function nightsAtDawn(s: GameState): void {
  s.alerts = (s.alerts ?? []).filter((a) => a.day >= s.day);
}

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
    s.bottles = Math.max(0, s.bottles - o.qty);
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
  const rivals = RIVALS.filter((r) => s.rivals[r].alive && s.rivals[r].respectUntil <= s.day);
  const rival = rivals[Math.floor(nextRandom(rng) * rivals.length)];
  s.seed = rng.seed;
  if (roll >= DELIVERY_RAID_CHANCE || !rival) return null;
  // They set out as loading starts and hit inside the 2-hour window (world's loading windows: relative to PICKUP_MINUTE until then).
  const leave = s.minute;
  const at = leave + Math.min(DELIVERY_WINDOW - 5, travelMinutes(s, raidStart(s, rival, o.plot), o.plot));
  s.raids.push({ id: `r${s.nextId++}`, attacker: rival, target: o.plot, objective: 'shakedown', party: raidPartyFor(s, rival), detected: false, eta: hhmm(at), delivery: true, order: o.id, leave, at });
  return held();
}

/** Could a Delivery Raid hit this pickup? (Order Book cards flag it.) */
export const deliveryRaidRisk = (s: GameState, o: Order) => isVip(o.tier) && threatLevel(s) >= DELIVERY_RAID_THREAT && !peaceful(s);

// ---------- saves ----------

/** Older saves: alert feed defaults, and tonight's raids get their minutes (detection was already rolled). A pickup
 * a Delivery Raid is out for keeps loading. Safe to run on every load. */
export function migrateNights(s: GameState): void {
  s.alerts ??= [];
  s.alertSeq ??= s.alerts.length;
  for (const r of s.raids ?? []) {
    if (r.delivery && r.order && !(s.heldPickups ??= []).includes(r.order)) s.heldPickups.push(r.order);
    if (r.at !== undefined) continue;
    fillTimes(s, r);
    r.launched = true;
    if (onYou(s, r)) r.warnAt = r.detected ? r.leave : Math.max(r.leave!, r.at! - raidNotice(s));
  }
}
