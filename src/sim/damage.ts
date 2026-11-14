// Buildings and their damage (spec: Stands, "Damage, repairs and rebuilds"; Defenses, "When a stand falls"; canon:
// Knock it down, buy it up). Every faction's stands and facilities keep their HP from one raid to the next: a Smash
// that runs out of time, any chopping short of 0, a Storm on an L1–L2 stand, or the late-game Hurricane (every
// faction's buildings, bay-wide, forecast 2 days ahead) leaves the building Damaged. A Damaged stand stays open and
// pours its HP share of its cups an hour until a repair, approved by the end of the Evening and paid on approval, puts
// it back to full HP at dawn. Wrecked rebuilds and Busted fixes join the same overnight queue: the building stays
// closed for the rest of the day and opens at dawn as good as new, so a stand smashed at night misses a day of sales.
// An unrebuilt plot lapses: For Sale with First Dibs for whoever smashed it, then a 24-hour sealed-bid auction, then
// back to the Registry. Rebuilds and repairs cost a share of what went into the building itself: a stand's level steps
// and slot fittings or a facility's tiers, never the plot's fences and gadgets. Pure functions over GameState, like the
// rest of the sim; the one roll (a rival's rebuild) takes the dawn's rng.
//
// Reading HP: Stand.hp and Facility.hp hold the points left on a dented building that still stands. Missing means full
// HP, and the field is cleared whenever the building falls or comes back full, so read HP through currentHp(ps) and
// hpShare(ps) (0 for a Wrecked or Busted building), never the raw field. Every raid on a stand or facility reaches it
// through fightRaid's applyRaidDamage call: instant fights, live ones (fight.ts settles them through fightRaid), night
// and daytime raids, Delivery Raids, your raids and rival-vs-rival ones; each fight starts from currentHp. HQ assaults
// (rivals.ts) fight their own Gate and never touch a stand's HP.
import {
  AUTO_REPAIR_RANK, BUSTED_REPAIR_SHARE, DAMAGE_REPAIR_SHARE, FACTIONS, HURRICANE, REBUILD_SHARE, RIVAL_REPAIR_RESERVE, SEASON_TEMP_SHIFT, STAND_HP,
  STAND_LEVELS, START, STORM_DAMAGE, WEATHER, type RivalId,
} from './balance.ts';
import { difficulty } from './modes.ts'; // Custom's Busted-only switch too (nights: modes.ts difficultyOf)
import { PLOT_BY_ID, PLOTS, type FactionId, type Plot } from './map.ts';
import { nextRandom, type Rng } from './rng.ts';
import type { Blocker, GameState, PlotState, Weather } from './economy.ts';
import { seasonOf } from './economy.ts';
import { registerEvent } from './eventTable.ts'; // world's events table: land's Hurricane registers there
import { heatWaveDay, liveEvent, type WorldEvent } from './events.ts';
import { book } from './ledger.ts'; // the Ledger: each cash movement on its row
import { bookHelper, registerHelper } from './automation.ts'; // Auto-Repair's line in the automation frame
import { buildingHp, isWrecked, NO_DEFENSE, PLAYER_REBUILD_DAYS, rebuildChance, rebuildCost, type BattleReport } from './crew.ts';
import { FACILITIES } from './vip.ts';
import { openAuction } from './auction.ts';
import { announceControl } from './land.ts';
import { canSpend, spend } from './rivalAi.ts';
import { specsInvested } from './specializations.ts'; // demand: what its slots' fittings cost
import { garrisonHome } from './garrison.ts';
import { handyHands } from './perks.ts';

/** Max HP comes from one place (crew.ts); it's re-exported here beside the current HP for anyone reading damage. */
export { buildingHp } from './crew.ts';

/** Work waiting for the night: who paid, what, and the HP it puts back at dawn. A rebuild (a Wrecked building, or a
 * Busted one on Laid Back) puts the whole building back up. */
export interface Repair { by: FactionId; cost: number; hp: number; rebuild?: true }

const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

/** The building on a plot: its stand or its facility (null on an empty plot). */
const building = (ps: PlotState) => ps.stand ?? ps.facility ?? null;

/**
 * What was invested in the building on a plot: the base for its rebuild and repair costs. A stand counts its level
 * steps (a Kiosk built on an empty plot: $150 + $400 + $3,500 = $4,050), and Lottie's own Folding Table, the one the run
 * starts with, counts as $100 (Appendix A), so it rebuilds for $15 and the Corner grown into a Kiosk has $4,000 in it.
 * Its filled specialization slots count too (specializations.ts specsInvested: a Fortified Kiosk, $6,050). A
 * facility counts its tiers. Fences and gadgets have their own repair rule (Defenses), and the plot's `invested` (Net
 * Worth's figure, which counts them) is untouched.
 */
export function buildingInvested(ps: PlotState): number {
  const st = ps.stand;
  if (st) return STAND_LEVELS.slice(0, st.level).reduce((a, l, i) => a + (i === 0 && st.startTable ? START.tableInvested : l.cost), 0) + specsInvested(st);
  if (ps.facility) return FACILITIES[ps.facility.kind].costs.slice(0, ps.facility.level).reduce((a, c) => a + c, 0);
  return 0;
}

/** A cost in whole dollars, rounded up (a share that lands a hair over a whole number from float noise stays put). */
export const dollarsUp = (n: number) => Math.max(0, Math.ceil(n - 1e-6));

// ---------- HP ----------

/** The building's HP right now, in points: its max (crew.ts buildingHp) until a raid dents it; 0 when it is Wrecked or
 * Busted, or the plot is empty. */
export function currentHp(ps: PlotState): number {
  const max = buildingHp(ps);
  const hp = building(ps)?.hp;
  return hp === undefined ? max : Math.max(0, Math.min(max, hp));
}

/** The share of its HP the building has left, 0..1: 1 on an empty plot or at full HP, 0 when Wrecked or Busted. */
export function hpShare(ps: PlotState): number {
  if (!building(ps)) return 1;
  const max = buildingHp(ps);
  return max > 0 ? currentHp(ps) / max : 0;
}

/** Standing but short of full HP: open, pouring at its HP share, until a repair. */
export const isDamaged = (ps: PlotState) => !isWrecked(ps) && currentHp(ps) < buildingHp(ps);

/** The max HP a Wrecked building has once it stands again (the same building, through the one max-HP source). */
function standingHp(ps: PlotState): number {
  return buildingHp({ ...ps, stand: ps.stand && { ...ps.stand, wrecked: false }, facility: ps.facility && { ...ps.facility, wrecked: false } });
}

/** What a stand pours an hour at its HP share of `perHour`, in whole cups: at 60% HP, 60% of its cups an hour. */
export function hpCapacity(ps: PlotState, perHour: number): number {
  const share = hpShare(ps);
  return share >= 1 ? perHour : Math.floor(perHour * share + 1e-9);
}

/** Full HP again (a repair, a rebuild, a new build or an upgrade). A repair still queued for it is called off and paid back. */
export function restoreHp(s: GameState, plotId: string): void {
  const ps = s.plots[plotId];
  const b = building(ps);
  if (b) delete b.hp;
  callOffRepair(s, plotId);
}

/**
 * After a fight on the plot (fightRaid calls it for every fight; `hpLeft` is BattleResult.standHpLeft). A building that
 * fell (Wrecked or Busted) drops its HP field, so it comes back full when rebuilt, and a repair queued for it is called
 * off and paid back. One still standing keeps the HP the fight left it, at least 1: the next raid starts from there.
 * Returns the HP it lost and kept (0 when it fell or wasn't touched).
 */
export function applyRaidDamage(s: GameState, plotId: string, hpLeft: number): number {
  const ps = s.plots[plotId];
  const b = building(ps);
  if (!b) return 0;
  if (b.wrecked) {
    delete b.hp;
    if (!ps.repair?.rebuild) callOffRepair(s, plotId); // it fell: tonight's repair can't happen (a booked rebuild of a wreck still can)
    return 0;
  }
  const before = currentHp(ps);
  const after = Math.max(1, Math.min(before, Math.round(hpLeft)));
  if (after >= before) return 0;
  b.hp = after;
  return before - after;
}

/** Weather's dent: `points` come off a standing building, never below 1 HP, so it never falls. Returns the HP it took. */
function dent(s: GameState, plotId: string, points: number): number {
  const ps = s.plots[plotId];
  const b = building(ps);
  if (!b || isWrecked(ps)) return 0;
  const before = currentHp(ps);
  const after = Math.max(1, before - Math.round(points));
  if (after >= before) return 0;
  b.hp = after;
  return before - after;
}

/** Weather damage: `share` of the building's max HP comes off, never below 1 HP, so it never falls. The Storm's seam.
 * Returns the HP it took. */
export function weatherDamage(s: GameState, plotId: string, share: number): number {
  return dent(s, plotId, buildingHp(s.plots[plotId]) * share);
}

/** The stands open on a Storm: every faction's L1–L2 stand loses a quarter of its max HP (never below 1) and sells at its
 * HP share until repaired. It is announced as it starts, with the counter-play, like a random event: a headline here, and
 * the feed's Storm ticket (src/ui/damage.ts) keeps the counter-play and the repair up all day. A Hurricane's Storm does
 * the Hurricane's damage instead. */
export function stormAtOpen(s: GameState): void {
  if (hurricaneToday(s)) { hurricaneAtOpen(s); return; }
  if (s.weather.kind !== 'storm') return;
  const hit: string[] = [];
  for (const p of PLOTS) {
    const ps = s.plots[p.id];
    if (!ps.stand || ps.stand.level > STORM_DAMAGE.maxLevel) continue;
    if (weatherDamage(s, p.id, STORM_DAMAGE.share) && ps.owner === 'player') hit.push(p.id);
  }
  const what = hit.length === 1 ? `${PLOT_BY_ID[hit[0]].name} takes a beating` : `${hit.length} of your stands take a beating`;
  s.news.push(`Storm!${hit.length ? ` ${what}.` : ''} Stock light; repair L1–L2 stands.`);
}

// ---------- the Hurricane (spec: Random events, "Hurricane (late game)") ----------

/** The Hurricane in the events table: world's scheduler (events.ts) rolls it, and land registers it below. */
export const HURRICANE_ID = 'hurricane';
const HURRICANE_COUNTER = 'Fortified Frames; rebuilds cost only 15%';
const HURRICANE_HITS = `every building in the bay takes damage. ${HURRICANE_COUNTER}.`;

/** The Hurricane on the calendar: coming, or today (the dawn after its day retires it). */
export function hurricaneOn(s: GameState): WorldEvent | undefined {
  return s.world?.events?.on.find((e) => e.id === HURRICANE_ID && e.to >= s.day);
}
/** Is today the Hurricane's day (it started at dawn)? */
export const hurricaneToday = (s: GameState) => !!liveEvent(s, HURRICANE_ID);

/** The share of its own HP a Hurricane takes off a building: more off the small stands (L1 60% down to L5 30%). */
export const hurricaneShare = (ps: PlotState) =>
  (ps.stand ? HURRICANE.stand[Math.min(ps.stand.level, HURRICANE.stand.length) - 1] : HURRICANE.facility);

/** A building's own HP, before any Fortified Frame: what the Hurricane's share comes off, so a Frame keeps its extra 50%. */
const framelessHp = (ps: PlotState) => (ps.stand ? STAND_HP[ps.stand.level - 1] : buildingHp(ps));

/** The HP the Hurricane takes off this building when it hits (0 for none): its share of the building's own HP, leaving
 * at least 1. What the feed's warning shows coming. */
export function hurricaneLoss(ps: PlotState): number {
  if (!building(ps) || isWrecked(ps)) return 0;
  return Math.max(0, Math.min(currentHp(ps) - 1, Math.round(framelessHp(ps) * hurricaneShare(ps))));
}

/** The Hurricane's sky: a Storm, at the middle of the season's Storm temperatures. */
function hurricaneSky(day: number): Weather {
  const [lo, hi] = WEATHER.storm.temp;
  return { kind: 'storm', temp: Math.round((lo + hi) / 2) + SEASON_TEMP_SHIFT[seasonOf(day)] };
}

/** The Hurricane's day is a Storm on demand's weather queue, called right, so the look-ahead, the dawn and the open read it. */
function stormOn(s: GameState, day: number): void {
  const q = s.weatherQueue?.find((d) => d.day === day);
  if (!q || (q.weather.kind === 'storm' && q.forecast.kind === 'storm')) return;
  q.weather = hurricaneSky(day);
  q.forecast = { ...q.weather };
}

/** A warning on the news, and in this morning's Bugle: the paper went to press before the scheduler rolled. */
function warn(s: GameState, line: string): void {
  s.news.push(line);
  const paper = s.world?.paper;
  if (paper?.day === s.day && !paper.wire.includes(line)) paper.wire = [...paper.wire, line].slice(-4);
}

/** The scheduler puts the Hurricane on the calendar (its place hook): its day turns Storm and the warning goes out, 2 days
 * ahead. begin() places it again as it starts; by then it is on the calendar and nothing happens twice. */
function forecastHurricane(s: GameState): void {
  if (hurricaneOn(s)) return;
  stormOn(s, s.day + HURRICANE.lead);
  warn(s, `HURRICANE WARNING! It hits in ${HURRICANE.lead} days: ${HURRICANE_HITS}`);
}

/** Dawn, the day before (damageAtDawn, ahead of the paper): the Bugle leads with tomorrow's Hurricane. */
function hurricaneTomorrow(s: GameState): void {
  if (hurricaneOn(s)?.from === s.day + 1) s.news.push(`HURRICANE TOMORROW! It hits at the open: ${HURRICANE_HITS}`);
}

/** Its morning: the day is a Storm whatever rolled (the queue turned Storm when it went on the calendar; this covers a
 * day the queue had not rolled yet). */
function hurricaneSkies(s: GameState): void {
  stormOn(s, s.day);
  if (s.forecast.kind === 'storm') return;
  const w = s.weatherQueue?.find((d) => d.day === s.day)?.forecast ?? hurricaneSky(s.day);
  s.forecast = { ...w };
  s.weather = { ...w };
  s.today.weather = { ...w };
}

/** The Hurricane hits as the stands open (stormAtOpen): every faction's standing stand and facility loses its share of
 * its own HP, never below 1, and stays open at its HP share until repaired. A Fortified Frame keeps its extra 50%. HQ
 * plots hold no building to hit, and fences are left alone. */
function hurricaneAtOpen(s: GameState): void {
  const hit: string[] = [];
  for (const p of PLOTS) {
    const ps = s.plots[p.id];
    if (dent(s, p.id, hurricaneLoss(ps)) && ps.owner === 'player') hit.push(p.id);
  }
  const what = !hit.length ? '' : hit.length === 1 ? ` ${PLOT_BY_ID[hit[0]].name} takes a pounding. Repair it by the Evening.`
    : ` ${hit.length} of your buildings take a pounding. Repair them by the Evening.`;
  s.news.push(`HURRICANE! The bay takes a pounding.${what}`);
}

registerEvent({
  id: HURRICANE_ID, name: 'Hurricane', kind: 'harmful', scope: 'bay', when: 'dawn', days: 1,
  weight: HURRICANE.weight, seasons: HURRICANE.seasons, lead: HURRICANE.lead, counter: HURRICANE_COUNTER,
  // Late game, and a Fall or Winter day that no Heat Wave holds.
  can: (s) => s.rank >= HURRICANE.rank && HURRICANE.seasons.includes(seasonOf(s.day + HURRICANE.lead)) && !heatWaveDay(s, s.day + HURRICANE.lead),
  place: (s) => { forecastHurricane(s); return {}; },
  dawn: hurricaneSkies,
  bugle: () => ['HURRICANE!', 'It hits the bay at the open'],
  headline: () => `HURRICANE! It hits at the open: ${HURRICANE_HITS}`,
});

/** The battle headline's last words: what a raid that didn't flatten the building took off it. */
export function hpLostNote(b: BattleReport): string {
  if (!b.hpLost || b.outcome === 'smashed') return '';
  return ` ${b.attacker === 'player' ? 'Their' : 'Your'} ${b.standLevel ? 'stand' : 'facility'} lost ${b.hpLost.toLocaleString('en-US')} HP.`;
}

// ---------- repairs ----------

/** The repair already booked for tonight on a standing building (none for a rebuild). */
const booked = (ps: PlotState) => (ps.repair && !ps.repair.rebuild ? ps.repair : undefined);

/** HP the building has lost that no repair booked for tonight puts back yet: all of it, or what a Storm or a raid took
 * after the booking. */
function unbookedLoss(ps: PlotState): number {
  return isDamaged(ps) ? Math.max(0, buildingHp(ps) - currentHp(ps) - (booked(ps)?.hp ?? 0)) : 0;
}

/**
 * What a Damaged building costs to repair: 15% of what went into it × the share of HP lost (a Kiosk at half HP: $304),
 * in whole dollars, and never more than putting it back up after a fall would cost (a rebuild, or on Laid Back your
 * Busted fix). Once a repair is booked, the price of topping it up for the HP lost since. 0 when there's nothing to repair.
 */
export function repairCost(s: GameState, plotId: string): number {
  const ps = s.plots[plotId];
  const lost = unbookedLoss(ps);
  if (!lost) return 0;
  const base = buildingInvested(ps);
  const fall = ps.owner === 'player' && difficulty(s).bustOnly ? BUSTED_REPAIR_SHARE : REBUILD_SHARE;
  const cap = Math.max(0, dollarsUp(base * fall) - (booked(ps)?.cost ?? 0));
  return Math.min(dollarsUp(base * DAMAGE_REPAIR_SHARE * (lost / buildingHp(ps)) * handyHands(s, ps.owner)), cap); // Handy Hands: 25% off yours (perks.ts)
}

/** Repairs are approved any time up to the end of the Evening (they run overnight), on your own Damaged buildings. A
 * booked one can be topped up for damage done after it (a Storm at the open, a daytime raid). */
export function canRepair(s: GameState, plotId: string): Blocker {
  const ps = s.plots[plotId];
  if (ps?.owner !== 'player') return { ok: false, why: 'Not your plot' };
  if (!isDamaged(ps)) return { ok: false, why: ps.repair ? 'Fixing tonight' : 'Nothing to fix' };
  if (!unbookedLoss(ps)) return { ok: false, why: 'Fixing tonight' };
  if (s.phase === 'night') return { ok: false, why: 'Too late tonight: approve it tomorrow' };
  const cost = repairCost(s, plotId);
  if (s.cash < cost) return { ok: false, why: `Needs ${money(cost)}` };
  return { ok: true };
}

/** Approve a repair (or top one up): paid now (the Ledger's repairs), worked on overnight, back to full HP at dawn.
 * Auto-Repair's seam. */
export function approveRepair(s: GameState, plotId: string): boolean {
  if (!canRepair(s, plotId).ok) return false;
  const ps = s.plots[plotId];
  const cost = repairCost(s, plotId);
  const hp = unbookedLoss(ps);
  book(s, 'repairs', -cost);
  const r = booked(ps);
  ps.repair = r ? { ...r, cost: r.cost + cost, hp: r.hp + hp } : { by: 'player', cost, hp };
  return true;
}

/** Queued work that can't happen (the building fell, or came back some other way): the money goes back. */
function callOffRepair(s: GameState, plotId: string): void {
  const ps = s.plots[plotId];
  const r = ps.repair;
  if (!r) return;
  delete ps.repair;
  if (r.by === 'player') {
    book(s, 'repairs', r.cost); // paid back
    s.news.push(`The ${r.rebuild && !ps.busted ? 'rebuild' : 'repair'} at ${PLOT_BY_ID[plotId].name} is called off: ${money(r.cost)} back.`);
  } else if (s.rivals[r.by as RivalId]) s.rivals[r.by as RivalId].cash += r.cost;
}

// ---------- rebuilds ----------

/** Is a rebuild (or a Busted fix) booked here for tonight? It counts as rebuilt: the plot won't lapse. */
export const rebuilding = (ps: PlotState) => !!ps.repair?.rebuild;

/** Is today the last day to book the rebuild of your Wrecked plot? Unbooked, it goes For Sale at the next dawn. Busted
 * plots never lapse. */
export const lastRebuildDay = (s: GameState, ps: PlotState) =>
  ps.owner === 'player' && isWrecked(ps) && !ps.busted && s.day >= (ps.wreckedDay ?? s.day) + PLAYER_REBUILD_DAYS;

/** Your Wrecked building's rebuild (or your Busted one's fix) is approved like a repair: any time until the end of the
 * Evening, business hours included, and it runs overnight. */
export function canRebuild(s: GameState, plotId: string): Blocker {
  const ps = s.plots[plotId];
  if (ps?.owner !== 'player') return { ok: false, why: 'Not your plot' };
  if (!isWrecked(ps)) return { ok: false, why: 'Nothing to rebuild' };
  if (ps.repair) return { ok: false, why: ps.busted ? 'Fixing tonight' : 'Rebuilding tonight' };
  if (s.phase === 'night') return { ok: false, why: lastRebuildDay(s, ps) ? 'Too late: it goes For Sale at dawn' : 'Too late tonight: approve it tomorrow' };
  const cost = rebuildCost(ps);
  if (s.cash < cost) return { ok: false, why: `Needs ${money(cost)}` };
  return { ok: true };
}

/** Approve a rebuild (a Busted fix on Laid Back): paid now (the Ledger's repairs), closed for the rest of the day, built
 * overnight, open at dawn at full HP. Auto-Repair's seam too. */
export function approveRebuild(s: GameState, plotId: string): boolean {
  if (!canRebuild(s, plotId).ok) return false;
  const ps = s.plots[plotId];
  const cost = rebuildCost(ps);
  book(s, 'repairs', -cost); // the Ledger's Repairs and rebuilds row
  ps.repair = { by: 'player', cost, hp: standingHp(ps), rebuild: true };
  return true;
}

/** The night's rebuild is done: the building stands again at full HP. */
function rebuilt(ps: PlotState): void {
  if (ps.stand) { ps.stand.wrecked = false; delete ps.stand.hp; }
  if (ps.facility) { ps.facility.wrecked = false; delete ps.facility.hp; }
  delete ps.wreckedDay;
  delete ps.busted;
}

const listed = (list: Plot[]) => (list.length <= 2 ? list.map((p) => p.name).join(' and ') : `${list.length} plots`);

/**
 * Dawn, after the night's work is done (damageAtDawn): unused First Dibs after a Smash or a Fire Sale goes to a 24-hour
 * sealed-bid auction (auction.ts), and each Wrecked plot with no rebuild booked faces Knock it down, buy it up. Yours
 * has until the end of the day after the smash to book one (Busted ones never lapse). A rival decides the morning
 * after: if its Grow money covers the bill and its personality says so, it books the rebuild (closed today, open
 * tomorrow); otherwise the plot goes For Sale, with First Dibs for whoever smashed it.
 */
export function plotsAtDawn(s: GameState, rng: Rng): void {
  const toAuction: Plot[] = [];
  for (const p of PLOTS) {
    const ps = s.plots[p.id];
    if (ps.dibs && ps.dibs.until < s.day) {
      const lapsed = ps.dibs;
      delete ps.dibs;
      // Unused First Dibs after a Smash or a Fire Sale: a sealed-bid auction. Lottie's side-lot offer just ends.
      if (!lapsed.table && !ps.owner) { openAuction(s, p.id, lapsed.price !== undefined ? 'fire' : 'sale'); toAuction.push(p); }
    }
    if (!ps.owner || !isWrecked(ps) || rebuilding(ps)) continue;
    if (ps.owner === 'player') {
      if (!ps.busted && s.day > (ps.wreckedDay ?? s.day) + PLAYER_REBUILD_DAYS) forSale(s, p, toAuction); // Busted stands wait for their fix
      continue;
    }
    const owner = ps.owner as RivalId;
    const cost = rebuildCost(ps);
    if (s.rivals[owner] && canSpend(s, owner, 'grow', cost) && nextRandom(rng) < rebuildChance(s, p.id)) {
      spend(s, owner, 'grow', cost); // a rival rebuild is Grow money (rivalAi.ts)
      ps.repair = { by: owner, cost, hp: standingHp(ps), rebuild: true };
      if (ps.smashedBy === 'player') s.news.push(`${FACTIONS[owner].name} rebuild ${p.name} tonight: it opens again tomorrow.`);
    } else forSale(s, p, toAuction);
  }
  if (toAuction.length) s.news.push(`Skip Larkin: "${listed(toAuction)} ${toAuction.length === 1 ? 'goes' : 'go'} to sealed bids today, opening at land value. Bids close at dawn."`);
  announceControl(s);
}

/** A Wrecked plot nobody rebuilt goes For Sale: whoever smashed it has First Dibs today. A rival buys at once if it
 * can; if it can't, the plot goes straight to auction. */
function forSale(s: GameState, p: Plot, toAuction: Plot[]): void {
  const ps = s.plots[p.id];
  const smasher = ps.smashedBy ?? 'player';
  if (ps.owner === 'player') for (const g of s.guards) if (g.post === p.id) g.post = null; // back to the Clubhouse
  garrisonHome(s, p.id); // combat: a rival's henchmen go home to their HQ (garrison.ts)
  s.plots[p.id] = { owner: null, stand: null, invested: 0, landValue: ps.landValue, defense: NO_DEFENSE(), dibs: { who: smasher, until: s.day } };
  if (smasher === 'player') { s.news.push(`${p.name} is For Sale after the smash. Lottie has First Dibs today!`); return; }
  const r = s.rivals[smasher as RivalId];
  if (r?.alive && canSpend(s, smasher as RivalId, 'grow', ps.landValue)) {
    spend(s, smasher as RivalId, 'grow', ps.landValue); // a First Dibs buy is Grow money too
    s.plots[p.id] = { owner: smasher, stand: null, invested: 0, landValue: ps.landValue, defense: NO_DEFENSE() };
    if (ps.owner === 'player') s.news.push(`${FACTIONS[smasher as RivalId].name} snap up ${p.name} after Lottie couldn't rebuild.`);
  } else {
    openAuction(s, p.id, 'sale'); // a feud's smashed plots reach auction like yours
    toAuction.push(p);
  }
}

// ---------- Auto-Repair ----------

/** Auto-Repair's id in the automation frame (automation.ts): its day's record and its Ledger line. */
export const AUTO_REPAIR = 'repair';

/** Auto-Repair takes over the overnight fixes from Rank 3. */
export const autoRepairOn = (s: GameState) => s.rank >= AUTO_REPAIR_RANK;

/** Does Auto-Repair look after this plot of yours? On for every plot unless you skip it. */
export function autoRepairs(s: GameState, plotId: string): boolean {
  const ps = s.plots[plotId];
  return autoRepairOn(s) && ps?.owner === 'player' && !ps.noAutoRepair;
}

/** Skip a plot of yours from Auto-Repair, or take it back on. */
export function toggleAutoRepair(s: GameState, plotId: string): boolean {
  const ps = s.plots[plotId];
  if (ps?.owner !== 'player' || !autoRepairOn(s)) return false;
  if (ps.noAutoRepair) delete ps.noAutoRepair; else ps.noAutoRepair = true;
  return true;
}

/** Which fix Auto-Repair books first: Wrecked plots (they lapse), then Busted ones, then the worst Damaged. */
const urgency = (ps: PlotState) => (isWrecked(ps) ? (ps.busted ? 1 : 0) : 2 + hpShare(ps));

/** Closing time: Auto-Repair books the rebuilds and repairs your plots need, the most urgent first, as far as the cash
 * goes. Plots you skip wait for you. */
function autoRepair(s: GameState): void {
  if (!autoRepairOn(s)) return;
  const due = PLOTS.filter((p) => autoRepairs(s, p.id) && (isWrecked(s.plots[p.id]) || isDamaged(s.plots[p.id])))
    .sort((a, b) => urgency(s.plots[a.id]) - urgency(s.plots[b.id]));
  let n = 0, paid = 0;
  for (const p of due) {
    const ps = s.plots[p.id];
    const fall = isWrecked(ps);
    const cost = fall ? rebuildCost(ps) : repairCost(s, p.id);
    if (!(fall ? approveRebuild(s, p.id) : approveRepair(s, p.id))) continue;
    n++;
    paid += cost;
  }
  if (!n) return;
  s.news.push(`Auto-Repair: ${n} fix${n === 1 ? '' : 'es'} booked for tonight, ${money(paid)}. Good as new at dawn.`);
  bookHelper(s, AUTO_REPAIR, paid, { count: n }); // its Ledger line; the cash went on the Repairs row as each was booked
}

// A helper in the automation frame: no dawn run (it books at closing), and the day's fixes as its Ledger line.
registerHelper({
  id: AUTO_REPAIR,
  name: 'Auto-Repair',
  unlocked: autoRepairOn,
  line: (d) => `${d.count} fix${d.count === 1 ? '' : 'es'} overnight`,
});

/** Closing time: Auto-Repair books your fixes; each rival books the repairs it can spare the cash for (the bill plus
 * $500 in hand), paid now and done by dawn, the same as yours. */
export function damageAtClose(s: GameState): void {
  autoRepair(s);
  for (const p of PLOTS) {
    const ps = s.plots[p.id];
    if (!ps.owner || ps.owner === 'player' || ps.repair || !isDamaged(ps)) continue;
    const r = s.rivals[ps.owner as RivalId];
    const cost = repairCost(s, p.id);
    if (!r?.alive || r.cash <= cost + RIVAL_REPAIR_RESERVE) continue;
    r.cash -= cost;
    ps.repair = { by: ps.owner, cost, hp: buildingHp(ps) - currentHp(ps) };
  }
}

/** Dawn, before anything lapses: the night's work is done. A rebuild puts the building back up at full HP (the work goes
 * with the plot, like the building). A repair puts back the HP it was paid for, so a building the night left alone is good
 * as new; one a raid dented again after the approval keeps the fresh damage. Then tomorrow's Hurricane, if one is due,
 * gets its warning. */
export function damageAtDawn(s: GameState): void {
  const fixed: string[] = [], dented: string[] = [];
  for (const p of PLOTS) {
    const ps = s.plots[p.id];
    const r = ps.repair;
    if (!r) continue;
    const b = building(ps);
    // Safety nets: a fall calls a repair off at once, and a rebuild only puts back a fallen building.
    if (!b || !!b.wrecked !== !!r.rebuild) { callOffRepair(s, p.id); continue; }
    delete ps.repair;
    if (r.rebuild) {
      rebuilt(ps);
      if (ps.owner === 'player') s.news.push(`Hammers and elbow grease: ${p.name} is back in business.`);
      continue;
    }
    const hp = currentHp(ps) + r.hp;
    if (hp >= buildingHp(ps)) delete b.hp; else b.hp = hp;
    if (r.by === 'player') (hp >= buildingHp(ps) ? fixed : dented).push(p.name);
  }
  if (fixed.length) s.news.push(`Fixed overnight: ${fixed.length <= 2 ? fixed.join(' and ') : `${fixed.length} buildings`} ${fixed.length === 1 ? 'is' : 'are'} good as new.`);
  for (const name of dented) s.news.push(`${name} is patched up, but it took fresh damage after the booking.`);
  hurricaneTomorrow(s); // ahead of the paper, so the Bugle leads with it
}

/** Saves from before building HP (and any odd values) load clean. Safe to run on every load. */
export function migrateDamage(s: GameState): void {
  for (const ps of Object.values(s.plots)) {
    if (!ps || typeof ps !== 'object') continue;
    const b = building(ps);
    for (const x of [ps.stand, ps.facility]) {
      if (!x || x.hp === undefined) continue;
      const max = x === b ? buildingHp(ps) : 0;
      if (x !== b || x.wrecked || typeof x.hp !== 'number' || !Number.isFinite(x.hp) || x.hp >= max) delete x.hp;
      else x.hp = Math.max(1, Math.round(x.hp));
    }
    const r = ps.repair as Partial<Repair> | undefined;
    if (r !== undefined && (!r || typeof r !== 'object' || typeof r.by !== 'string' || typeof r.cost !== 'number' || typeof r.hp !== 'number' || !b
      || (r.rebuild !== undefined && r.rebuild !== true) || isWrecked(ps) !== !!r.rebuild)) delete ps.repair; // a rebuild waits on a wreck, a repair on a standing building
    if (ps.noAutoRepair !== undefined && (ps.noAutoRepair !== true || ps.owner !== 'player')) delete ps.noAutoRepair;
    // Saves from before the starting table's own figure keep the $150 every table had then.
    if (ps.stand && ps.stand.startTable !== undefined && ps.stand.startTable !== true) delete ps.stand.startTable;
  }
}
