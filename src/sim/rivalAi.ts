// Rival AI (spec: Rivals, How rivals think). Every dawn each rival banks its
// takings and splits them into Grow, Guard and Strike buckets that roll over:
// Grow buys land and stand upgrades, Guard buys defenses and crew, Strike pays
// for raids. Each rival also keeps a Grudge toward every other faction.
// Pure functions over GameState, like the rest of the sim; every random draw
// goes through a seeded rng that is written back to s.seed.
import { FACTIONS, GUARD_WAGE, HENCHMEN, PERIMETERS, STAND_LEVELS, type RivalId } from './balance.ts';
import { BORDERS, PLOT_BY_ID, PLOTS, type FactionId, type Plot } from './map.ts';
import { nextRandom, type Rng } from './rng.ts';
import type { GameState } from './economy.ts';
import { hasFoothold, newStand, ownedPlots, rivalPrice } from './economy.ts';
import {
  ATTENTION, GRUDGE, inTruce, RAID_WAGE_NIGHTS, RIVAL_HIRE_FEE, RIVAL_LAND_CHANCE, RIVAL_RESERVE_DAYS, RIVAL_UPGRADE_DAYS,
} from './rivals.ts';
import { hasBuilding, NO_DEFENSE, raidPartyFor, threatLevel, type Raid } from './crew.ts';

export type Bucket = 'grow' | 'guard' | 'strike';
/** Money set aside from a rival's takings, by what it buys. Unspent buckets roll over. */
export interface Budget { grow: number; guard: number; strike: number }

const RIVALS = Object.keys(FACTIONS) as RivalId[];
const BUCKETS: Bucket[] = ['grow', 'guard', 'strike'];
const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------- the dawn budget ----------

/** A rival's buckets (empty for a save from before the budget, until migrateRivals fills them). */
export function budgetOf(s: GameState, id: RivalId): Budget {
  return (s.rivals[id].budget ??= { grow: 0, guard: 0, strike: 0 });
}

/** What the rival's plots cost to run each day: stand upkeep. */
export function runningCosts(s: GameState, id: RivalId): number {
  let total = 0;
  for (const p of PLOTS) {
    const ps = s.plots[p.id];
    if (ps.owner === id && ps.stand) total += STAND_LEVELS[ps.stand.level - 1].upkeep;
  }
  return total;
}

/** Cash a rival keeps out of all three buckets, so its spending never puts it in the red. */
export const reserveOf = (s: GameState, id: RivalId) => RIVAL_RESERVE_DAYS * runningCosts(s, id);

/** Keep the buckets inside what the rival can spend (cash above its reserve). `topUp` also hands out cash nobody has earmarked. */
export function fitBudget(s: GameState, id: RivalId, topUp = false): void {
  const b = budgetOf(s, id);
  for (const k of BUCKETS) b[k] = Math.max(0, b[k]);
  const room = Math.max(0, s.rivals[id].cash - reserveOf(s, id));
  const sum = b.grow + b.guard + b.strike;
  if (sum > room || (topUp && sum < room)) {
    for (const k of BUCKETS) b[k] = round2(sum > 0 ? b[k] * (room / sum) : room * FACTIONS[id][k]);
  }
}

/** A new rival's books: its whole starting cash, split by personality. */
export function openBooks(s: GameState, id: RivalId): void {
  const r = s.rivals[id];
  const f = FACTIONS[id];
  r.budget = { grow: round2(r.cash * f.grow), guard: round2(r.cash * f.guard), strike: round2(r.cash * f.strike) };
  r.cashSeen = r.cash;
  r.held = ownedPlots(s, id).map((p) => p.id);
  fitBudget(s, id);
}

/** Dawn: everything that moved the rival's cash since the last dawn, other than bucket spending (trade, upkeep, loot, rebuilds, sales), goes into the buckets by the split. */
export function bankTakings(s: GameState, id: RivalId): number {
  const r = s.rivals[id];
  const takings = round2(r.cash - (r.cashSeen ?? r.cash));
  const b = budgetOf(s, id);
  for (const k of BUCKETS) b[k] = round2(b[k] + takings * FACTIONS[id][k]);
  fitBudget(s, id, true);
  r.takings = takings;
  r.cashSeen = r.cash;
  return takings;
}

export function canSpend(s: GameState, id: RivalId, bucket: Bucket, amount: number): boolean {
  return amount >= 0 && budgetOf(s, id)[bucket] >= amount && s.rivals[id].cash >= amount;
}

/** Pay from one bucket (it never counts against tomorrow's takings). */
export function spend(s: GameState, id: RivalId, bucket: Bucket, amount: number): void {
  const r = s.rivals[id];
  const b = budgetOf(s, id);
  r.cash = round2(r.cash - amount);
  b[bucket] = round2(Math.max(0, b[bucket] - amount));
  if (r.cashSeen !== undefined) r.cashSeen = round2(r.cashSeen - amount);
}

/** Saves from before the rival AI: open the books from the cash they hold now. Idempotent; runs on every load. */
export function migrateRivals(s: GameState): void {
  for (const id of RIVALS) {
    const r = s.rivals[id];
    if (!r) continue;
    if (!r.budget) { r.budget = { grow: 0, guard: 0, strike: 0 }; fitBudget(s, id, true); }
    r.cashSeen ??= r.cash;
    r.upgradesDue ??= [];
    r.grudges ??= {};
    r.held ??= ownedPlots(s, id).map((p) => p.id);
  }
}

// ---------- Grudge toward every faction ----------

/** How angry rival `id` is with faction `at` (0..100). The one toward the player is RivalState.grudge. */
export function grudgeToward(s: GameState, id: RivalId, at: FactionId): number {
  const r = s.rivals[id];
  return at === 'player' ? r.grudge : (r.grudges?.[at as RivalId] ?? 0);
}

function setGrudge(s: GameState, id: RivalId, at: FactionId, n: number): void {
  const r = s.rivals[id];
  const g = Math.round(Math.min(100, Math.max(0, n)) * 100) / 100;
  if (at === 'player') r.grudge = g;
  else (r.grudges ??= {})[at as RivalId] = g;
}

/** Rival `id` holds `n` more Grudge toward `at`. A new feud between two rivals makes the Bugle (once, until it cools well off). */
export function addGrudge(s: GameState, id: RivalId, at: FactionId, n: number): void {
  if (at === id || !s.rivals[id]?.alive) return;
  const was = grudgeToward(s, id, at);
  setGrudge(s, id, at, was + n);
  const cooledOff = (s.rivals[id].grudgeSeen?.[at] ?? 0) < GRUDGE.feud - 10;
  if (at !== 'player' && cooledOff && was < GRUDGE.feud && grudgeToward(s, id, at) >= GRUDGE.feud) {
    s.news.push(`Bugle: ${FACTIONS[id].name} declare a feud on ${FACTIONS[at as RivalId].name}`);
  }
}

/** Seam for auctions: whoever outbids a rival earns its Grudge. */
export const outbidBy = (s: GameState, loser: RivalId, winner: FactionId) => addGrudge(s, loser, winner, GRUDGE.outbid);

/** Dawn: stands smashed last night by another rival (your smashes count in fightRaid). */
function noteSmashes(s: GameState, id: RivalId): void {
  for (const p of ownedPlots(s, id)) {
    const ps = s.plots[p.id];
    if (ps.wreckedDay === s.day - 1 && ps.smashedBy && ps.smashedBy !== 'player') addGrudge(s, id, ps.smashedBy, GRUDGE.smashed);
  }
}

/** Dawn: land they held yesterday that someone else holds now (directly, or bought after it went For Sale). A Plot Buyout is a sale, not a taking. */
function noteLandTaken(s: GameState, id: RivalId): void {
  const r = s.rivals[id];
  const now = ownedPlots(s, id).map((p) => p.id);
  const lost = [...(r.lost ?? [])];
  for (const plotId of r.held ?? now) if (!now.includes(plotId) && !lost.includes(plotId)) lost.push(plotId);
  const forSale: string[] = [];
  for (const plotId of lost) {
    const owner = s.plots[plotId].owner;
    if (owner === id) continue;
    if (owner) addGrudge(s, id, owner, GRUDGE.land);
    else forSale.push(plotId);
  }
  r.lost = forSale.slice(-8);
  r.held = now;
}

/** Dawn: a Grudge that didn't rise since yesterday cools a little. */
function coolGrudges(s: GameState, id: RivalId): void {
  const seen = (s.rivals[id].grudgeSeen ??= {});
  for (const at of ['player', ...RIVALS.filter((x) => x !== id)] as FactionId[]) {
    const g = grudgeToward(s, id, at);
    if (g <= (seen[at] ?? 0)) setGrudge(s, id, at, g - GRUDGE.cool);
    seen[at] = grudgeToward(s, id, at);
  }
}

/** Rival-versus-rival targets: Grudge picks the faction (the one the attacker is angriest with, if any), then the weakest valuable building of theirs near the attacker's turf. */
export function rivalTarget(s: GameState, attacker: RivalId): Plot | null {
  const turf = turfOf(s, attacker);
  const near = (p: Plot) => turf.has(p.district) || BORDERS[p.district].some((d) => turf.has(d));
  const score = (p: Plot) => {
    const ps = s.plots[p.id];
    return (ps.invested + ps.landValue) / (1 + ps.defense.tier * 2 + (ps.garrison ?? 0) * 3 + ps.defense.gadgets.length);
  };
  const anger = (p: Plot) => grudgeToward(s, attacker, s.plots[p.id].owner!);
  const targets = PLOTS.filter((p) => {
    const o = s.plots[p.id].owner;
    return !!o && o !== 'player' && o !== attacker && s.rivals[o as RivalId].alive && p.type !== 'hq' && hasBuilding(s.plots[p.id]) && near(p);
  });
  const top = Math.max(0, ...targets.map(anger));
  const pool = top > 0 ? targets.filter((p) => anger(p) === top) : targets;
  return pool.sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id))[0] ?? null;
}

// ---------- Grow: stand upgrades and land ----------

/** Every 30 days each stand is owed a level (up to the faction's cap). Grow pays the build cost, cheapest first; an upgrade it can't afford waits. */
export function growUpgrades(s: GameState, id: RivalId): void {
  const r = s.rivals[id];
  const f = FACTIONS[id];
  const due = (r.upgradesDue ??= []);
  if (s.day > 1 && (s.day - 1) % RIVAL_UPGRADE_DAYS === 0) {
    for (const p of ownedPlots(s, id)) {
      const st = s.plots[p.id].stand;
      if (st && st.level + due.filter((x) => x === p.id).length < f.maxLevel) due.push(p.id);
    }
  }
  const valid = (plotId: string) => {
    const ps = s.plots[plotId];
    return ps.owner === id && !!ps.stand && ps.stand.level < f.maxLevel;
  };
  r.upgradesDue = due.filter(valid);
  const cost = (plotId: string) => STAND_LEVELS[s.plots[plotId].stand!.level].cost;
  for (const plotId of [...r.upgradesDue].sort((a, b) => cost(a) - cost(b) || a.localeCompare(b))) {
    const ps = s.plots[plotId];
    if (!valid(plotId) || ps.stand!.wrecked) continue; // a wrecked stand waits for its rebuild
    const c = cost(plotId);
    if (!canSpend(s, id, 'grow', c)) break;
    spend(s, id, 'grow', c);
    const st = ps.stand!;
    st.level += 1;
    st.price = rivalPrice(id, st.level, PLOT_BY_ID[plotId]);
    ps.invested += c;
    r.upgradesDue.splice(r.upgradesDue.indexOf(plotId), 1);
  }
}

/** Some dawns a rival with the Grow money buys the busiest open street or prime plot near its turf and opens a stand. Maple Row is left to the player; First Dibs is respected. */
export function growLand(s: GameState, id: RivalId, rng: Rng): void {
  if (s.day <= 3 || nextRandom(rng) >= RIVAL_LAND_CHANCE) return;
  const f = FACTIONS[id];
  const open = (plotId: string) => {
    const ps = s.plots[plotId];
    return !ps.owner && !(ps.dibs && ps.dibs.who !== id && ps.dibs.until >= s.day);
  };
  const targets = PLOTS.filter((p) => open(p.id) && (p.type === 'street' || p.type === 'prime')
    && (p.district === f.home || hasFoothold(s, id, p.district)) && p.district !== 'maple');
  const p = targets.sort((a, b) => b.baseTraffic - a.baseTraffic)[0];
  if (!p) return;
  const cost = s.plots[p.id].landValue + STAND_LEVELS[0].cost;
  if (!canSpend(s, id, 'grow', cost)) return;
  spend(s, id, 'grow', cost);
  s.plots[p.id] = { owner: id, stand: newStand(1, rivalPrice(id, 1, p)), invested: STAND_LEVELS[0].cost, landValue: s.plots[p.id].landValue, defense: NO_DEFENSE() };
  if (p.district === 'oldtown' || hasFoothold(s, 'player', p.district)) s.news.push(`${f.name} opens a new stand at ${p.name}`);
}

/** One rival's dawn (rivalsAtDawn): grudges from the night, bank the takings, then spend Grow. Guard is spent in crewAtDawn, Strike when raids are planned. */
export function rivalDawn(s: GameState, id: RivalId, rng: Rng): void {
  const r = s.rivals[id];
  noteSmashes(s, id);
  noteLandTaken(s, id);
  coolGrudges(s, id);
  bankTakings(s, id);
  growUpgrades(s, id);
  growLand(s, id, rng);
  r.held = ownedPlots(s, id).map((p) => p.id);
  r.attention = attentionOf(s, id);
}

// ---------- Guard: defenses and crew ----------

/** Guard spending at dawn (crewAtDawn): fences and henchmen on the three best stands, paid from the Guard bucket. */
export function rivalGuardSpend(s: GameState, id: RivalId, rng: Rng): void {
  void rng;
  if (!s.rivals[id].alive) return;
  fitBudget(s, id);
  const plots = ownedPlots(s, id).filter((p) => s.plots[p.id].stand).sort((a, b) => s.plots[b.id].invested - s.plots[a.id].invested);
  for (const p of plots.slice(0, 3)) {
    const ps = s.plots[p.id];
    const next = PERIMETERS[ps.defense.tier];
    if (next && next.tier <= Math.ceil(ps.stand!.level / 1.5) + 1 && canSpend(s, id, 'guard', next.cost)) {
      spend(s, id, 'guard', next.cost);
      ps.defense = { ...ps.defense, tier: next.tier, fenceHp: next.hp };
    } else if ((ps.garrison ?? 0) < ps.stand!.level + 1 && canSpend(s, id, 'guard', RIVAL_HIRE_FEE)) {
      spend(s, id, 'guard', RIVAL_HIRE_FEE);
      ps.garrison = (ps.garrison ?? 0) + 1;
    } else if (ps.defense.tier) {
      ps.defense.fenceHp = PERIMETERS[ps.defense.tier - 1].hp;
    }
  }
}

// ---------- Attention: who comes for you ----------

/** Districts a rival holds land in, plus its home. */
function turfOf(s: GameState, id: RivalId): Set<string> {
  const turf = new Set<string>(PLOTS.filter((p) => s.plots[p.id].owner === id).map((p) => p.district));
  turf.add(FACTIONS[id].home);
  return turf;
}

/** Districts where you hold land on or beside a rival's turf. */
export function sharedBorders(s: GameState, id: RivalId): number {
  const turf = turfOf(s, id);
  const mine = new Set(PLOTS.filter((p) => s.plots[p.id].owner === 'player').map((p) => p.district));
  return [...mine].filter((d) => turf.has(d) || BORDERS[d].some((e) => turf.has(e))).length;
}

/** Your share of the cups sold on a rival's turf today (0..1): the customers you take from them. */
export function customersTaken(s: GameState, id: RivalId): number {
  const turf = turfOf(s, id);
  let mine = 0, theirs = 0;
  for (const p of PLOTS) {
    const ps = s.plots[p.id];
    if (!ps.stand || !turf.has(p.district)) continue;
    if (ps.owner === 'player') mine += ps.stand.day.customers;
    else if (ps.owner === id) theirs += ps.stand.day.customers;
  }
  return mine + theirs > 0 ? mine / (mine + theirs) : 0;
}

/** A boss's Attention on you (spec: How rivals think): it rises with Threat, shared borders, the customers you take and Grudge. */
export function attentionOf(s: GameState, id: RivalId): number {
  if (!s.rivals[id].alive) return 0;
  const a = ATTENTION.threat * threatLevel(s) + ATTENTION.border * sharedBorders(s, id)
    + ATTENTION.customers * customersTaken(s, id) + ATTENTION.grudge * s.rivals[id].grudge;
  return Math.round(a * 10) / 10;
}

// ---------- Strike: who raids, and what it costs ----------

/** A raid costs the rival a night's wages for each henchman it sends, at the strength it sends them. */
export function raidCost(s: GameState, id: RivalId, size: number, tier = threatLevel(s)): number {
  void s; void id;
  return Math.round(size * GUARD_WAGE[HENCHMEN[tier - 1].level - 1] * RAID_WAGE_NIGHTS);
}

/** How keen a boss is to raid the player tonight: 0 when they can't (out, backing off after a beaten raid, or in a Truce). */
export function raidWeight(s: GameState, id: RivalId): number {
  const r = s.rivals[id];
  if (!r.alive || r.respectUntil > s.day + 1 || inTruce(s, id)) return 0;
  return Math.max(0.1, r.attention);
}

/** The boss who sends tonight's raid on the player: the one with the most Attention whose Strike can pay for it. A broke boss is skipped and the next-angriest goes. */
export function pickRaider(s: GameState, rng: Rng, size: number): RivalId | null {
  let best: RivalId | null = null;
  let top = -Infinity;
  for (const id of RIVALS) {
    const keen = raidWeight(s, id) + nextRandom(rng) * ATTENTION.jitter; // near-ties go either way
    if (raidWeight(s, id) <= 0 || !canSpend(s, id, 'strike', raidCost(s, id, size))) continue;
    if (keen > top) { top = keen; best = id; }
  }
  return best;
}

/**
 * planNight's last line: settle tonight's rival raids. Each boss's Attention is updated from today's trade, and
 * the raid on the player goes to the keenest boss who can pay for it, and every rival raid is paid from its Strike bucket; one nobody can pay for is called off. The
 * tutorial raid is on the house. A raid on another rival goes where the attacker's Grudge points, and the
 * target's Grudge toward the attacker rises. Returns any extra raids to add (none yet).
 */
export function signatureRaids(s: GameState): Raid[] {
  const rng = { seed: s.seed };
  const threat = threatLevel(s);
  const tutorial = !s.battles.some((b) => b.defender === 'player');
  for (const id of RIVALS) s.rivals[id].attention = attentionOf(s, id);
  const kept: Raid[] = [];
  for (const raid of s.raids) {
    const attacker = raid.attacker as RivalId;
    if (raid.attacker === 'player' || raid.delivery || !raid.party) { kept.push(raid); continue; }
    if (s.plots[raid.target].owner === 'player') {
      if (tutorial) { kept.push(raid); continue; }
      const size = raid.party.length;
      const raider = pickRaider(s, rng, size);
      if (!raider) continue; // every boss is broke tonight
      if (raider !== attacker) {
        s.seed = rng.seed;
        raid.party = raidPartyFor(s, raider).slice(0, size);
        rng.seed = s.seed;
        raid.attacker = raider;
      }
      spend(s, raider, 'strike', raidCost(s, raider, raid.party.length, threat));
      kept.push(raid);
    } else {
      const cost = raidCost(s, attacker, raid.party.length, Math.min(3, threat + 1));
      if (!s.rivals[attacker]?.alive || !canSpend(s, attacker, 'strike', cost)) continue;
      const target = rivalTarget(s, attacker);
      if (!target) continue;
      spend(s, attacker, 'strike', cost);
      raid.target = target.id;
      addGrudge(s, s.plots[target.id].owner as RivalId, attacker, GRUDGE.raided);
      kept.push(raid);
    }
  }
  s.raids.splice(0, s.raids.length, ...kept); // in place: planNight pushes the extras onto this same list
  s.seed = rng.seed;
  return [];
}
