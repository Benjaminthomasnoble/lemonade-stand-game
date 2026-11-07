// Sit-downs at Dot's Diner, buyouts, elimination and HQ assaults (canon
// sections 10 and 13). Pure functions over GameState, like the rest of the sim.
import { FACTIONS, GUARD_BASE, PEACEFUL_VERA_BUYOUT, RANKS, SQUAD_CAP, type RivalId } from './balance.ts';
import { runBattle, type BattleInput, type BattleResult, type Fighter } from './combat.ts';
import { creditGuards, guardFighter, guardReady, henchmanFor, NO_DEFENSE, threatLevel, type BattleReport } from './crew.ts';
import { PLOT_BY_ID, PLOTS, type Plot } from './map.ts';
import { FACILITIES, type FacilityKind } from './vip.ts';
import type { Blocker, GameState } from './economy.ts';
import { netWorth, ownedPlots } from './economy.ts';
import { bump, checkVictory, peaceful } from './modes.ts';
import { recoverPage } from './recipes.ts';
import { tillyFieldRate, tillyWaits } from './calendar.ts';
import type { Rng } from './rng.ts';
import { landFrozen } from './schemes.ts';

const round2 = (n: number) => Math.round(n * 100) / 100;
const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const RIVALS = Object.keys(FACTIONS) as RivalId[];

// ---------- tunables (balance tables, Rivals and Land) ----------

export const SITDOWN_RANK = 4;
export const FACTION_BUYOUT_RANK = 5;
export const TRUCE_DAYS = 7;
export const TRUCE_BREAK_STARS = 1;
export const TRUCE_BAN_DAYS = 14;
export const PLOT_BUYOUT = { home: 2.5, away: 2 };
export const FIRE_SALE = { share: 0.75, days: 2 };
export const BANKRUPT_DAYS = 7;
/** Per faction: HQ assault rank, Gate HP, Faction Buyout multiple (null = never sells), boss and HQ difficulty tier. */
export const HQS: Record<RivalId, { rank: number; gate: number; buyout: number | null; tier: number; yard: number; boss: string; move: string }> = {
  blenders: { rank: 5, gate: 2000, buyout: 1.5, tier: 1, yard: 4, boss: 'Brock "The Blender" Bodine', move: 'Blender Rush' },
  coldbrew: { rank: 6, gate: 2750, buyout: 1.8, tier: 2, yard: 6, boss: 'Juniper "Juni" Grind', move: 'Espresso Shot' },
  hollis: { rank: 7, gate: 3500, buyout: 1.5, tier: 3, yard: 6, boss: 'Tilly Hollis', move: 'Hay Bale Wall' },
  fizzco: { rank: 8, gate: 4250, buyout: 1.8, tier: 4, yard: 9, boss: 'Preston Fizzwell III', move: 'Hostile Takeover' },
  sourwood: { rank: 9, gate: 5000, buyout: null, tier: 4, yard: 11, boss: 'Vera Sourwood', move: 'Old Money' },
};

// ---------- rival AI tunables (spec: Rivals, How rivals think; rivalAi.ts and schemes.ts use them) ----------

/** Cash a rival keeps out of its Grow / Guard / Strike buckets: this many days of upkeep and wages (placeholder: spec gap). */
export const RIVAL_RESERVE_DAYS = 2;
/**
 * A rival hires a garrison henchman for this, out of its Guard bucket (the spec gives no rival hire fee: the build's
 * own number), and only while Guard's share of what its trade nets each day covers the new man's wage.
 */
export const RIVAL_HIRE_FEE = 300;
/** On this share of dawns after Day 3 a rival with the Grow money buys a plot near its turf (the build's own pacing). */
export const RIVAL_LAND_CHANCE = 0.25;
/**
 * Rival cash grows about 1% a day from trade (balance tables). Over its first `days` dawns of trading, each rival's
 * stands' margin is scaled so its opening stands net about `share` of its starting cash on an average day of the
 * year (through the seasons and their weather, capped by each stand's stock), after their upkeep and its henchmen's
 * wages: a small gang carries overheads (under 1), an old-money family's stands front a bigger trade (over 1, on the
 * opening stands at their opening level only). The scale stays within `floor` and `ceiling` (placeholders: spec gap).
 */
export const RIVAL_TRADE = { share: 0.01, days: 7, floor: 0.02, ceiling: 25 };
/** Every this many days each rival stand is owed one level, up to the faction's cap (balance tables: every 30 days). */
export const RIVAL_UPGRADE_DAYS = 30;
/** A raid costs the rival this many nights of wages for each henchman it sends (placeholder: spec gap). */
export const RAID_WAGE_NIGHTS = 1;
/**
 * Grudge (0–100) a rival gains toward a faction that raids it, smashes its stand, takes its land or outbids it,
 * and loses on each quiet day; a feud makes the Bugle (placeholders: the spec gives no amounts). Your raids add
 * 20 when they win and 8 when they fail (fightRaid); breaking a truce adds 25 with every rival.
 */
export const GRUDGE = { raided: 10, smashed: 10, land: 15, outbid: 10, cool: 1, feud: 50 };
/**
 * A boss's Attention on you: Threat (per lemon), shared borders (per district of yours on or beside their turf),
 * the customers you take (your share of the cups sold on their turf today) and Grudge (per point). The keenest
 * boss who can pay sends the raid: its Attention plus `strike` times its Strike share (so the Blenders, at 60%,
 * send the most); `jitter` lets near-ties go either way (placeholders: the spec gives no weights).
 */
export const ATTENTION = { threat: 1, border: 0.5, customers: 10, grudge: 0.1, strike: 1, jitter: 1 };
/**
 * Blender Rush, the Blenders' signature move: frequent cheap raids with lots of fists (spec, no numbers given, so
 * these are placeholders). Their party comes at the top of its Threat range with every weapon one tier toward fists
 * (hatchets become clubs, clubs become fists), and costs them `cost` of the usual raid wages. Brock phones first.
 */
export const BLENDER_RUSH = { cost: 0.5, taunt: 'Bro. Tonight we blend your stand. Smoothie or chunky, your call.' };
/**
 * Strike schemes, the ones that aren't raids (spec: they come more often with each Threat lemon; it gives no
 * numbers, so all placeholders). From Day `from` (after the first week, while rival trade calibrates), each dawn a
 * rival with no scheme running starts one on `chance[Threat - 1]` of dawns, if its Strike bucket can fund it. A price
 * war cuts its prices by `cut` for `days` days at its stands that share passers-by with yours, and Strike pays the
 * margin it gives up. Cold Brew's poster crew costs `posters.cost` and takes `posters.stars` off your Reputation
 * unless the plot's night watch catches it. An auction snipe tops your sealed bid by `snipe.over`, the extra out of
 * Strike. A finished scheme stays on the books `keep` days.
 */
export const SCHEMES = {
  from: 8,
  chance: [0.02, 0.035, 0.05, 0.065, 0.08],
  priceWar: { cut: 0.25, days: 3 },
  posters: { cost: 150, stars: 0.1, taunt: "It's not graffiti. It's a review." },
  snipe: { over: 0.05 },
  keep: 7,
};
/**
 * Night Shift, Cold Brew's signature move: stealthy night raids, spoiled stock and smear posters. Their night raids
 * take `stealth` more off your detection, like a Sneaky raider, and Floodlights don't cancel it (placeholder: the
 * spec gives no number). After a Cold Brew Sabotage on you (crew's raid objective) Juni phones with `taunt`.
 */
export const NIGHT_SHIFT = { stealth: 0.25, taunt: "Your stock didn't spoil. It made an artistic choice." };
/**
 * Dig In, Hollis's signature move: cheap, tough fences with hay bales stacked behind them. Hollis pays `cost` of a
 * fence's price (repairs too), and the bales give it `hp` times the fence's HP. Hollis also fences every Field it
 * holds, up to `fieldTier`. Tilly answers your raids with `taunt` (placeholders: the spec gives no numbers).
 */
export const DIG_IN = { cost: 0.6, hp: 1.5, fieldTier: 2, taunt: "Bring all the hatchets you want. I've got hay bales till Tuesday." };
/**
 * FizzCo's Cease-and-Desist (Hostile Takeover): from Act `act` (Fields & Fizz, where the spec's first letter comes), a
 * letter costs FizzCo's Strike `cost` and blocks your marketing in one district for `days` days: your tier bonus and
 * campaigns count for nothing there. The letters stop when FizzCo falls (placeholder cost; the 3 days are the spec's).
 */
export const CEASE = { act: 4, cost: 2000, days: 3, taunt: "I'm not threatening you. Legal says I can't. I'm forecasting." };
/**
 * FizzCo's buyout offers (Hostile Takeover): from Act `act`, FizzCo offers `price` times a plot's land and building
 * value, out of its Grow, for your best plot on or beside its turf. The offer stands `days` days, and you answer at
 * Morning Prep. Turning it down adds `snub` to Preston's Grudge (placeholders: the spec gives no numbers).
 */
export const TAKEOVER = { act: 4, price: 1.25, days: 2, snub: 10, taunt: "Let's circle back to you being out of business." };
/**
 * Old Money, Sourwood's signature move: from Act `act` (The Big Squeeze, where the spec teaches it), Mayor Fontaine fines you `fine` of your average
 * daily sales over the last week (at least `minFine`, never more than your cash) for `fineCost` of Vera's Strike, or
 * freezes a land sale for `freezeDays` days for `freezeCost`. Vera's raids on you send elite Stewards: one henchman
 * level higher, every weapon one tier toward hatchets (placeholders: the spec gives no numbers).
 */
export const OLD_MONEY = {
  act: 5, fine: 0.5, minFine: 25, fineCost: 500, freezeDays: 3, freezeCost: 1500,
  mayor: 'I represent all of Citrine Bay. Some of it more than others.',
};

const rankNeed = (r: number): Blocker => ({ ok: false, why: `Needs Rank ${r}, ${RANKS[r - 1].title}` });

/** FizzCo's Harbor plot (spec: The Harbor is FizzCo's bottling plant and Docks; the rest open lots). */
export const FIZZCO_PLANT = 'harbor-3n';
/** Level of the plant's Bottling Works at the start (placeholder: the spec gives none). */
export const FIZZCO_PLANT_LEVEL = 1;

/**
 * Rivals hold VIP facilities on their land, worth knocking down: FizzCo's Bottling Works at the Harbor plant and a
 * Jetty, Sourwood's Helipad and marina Jetty, and a Lemon Grove on each of Hollis's Fields.
 */
export function seedRivalFacilities(s: GameState): void {
  const put = (plotId: string, kind: FacilityKind, level: number) => {
    s.plots[plotId].facility = { kind, level };
    s.plots[plotId].invested = FACILITIES[kind].costs.slice(0, level).reduce((a, b) => a + b, 0);
  };
  if (s.plots[FIZZCO_PLANT].owner === 'fizzco') put(FIZZCO_PLANT, 'bottling', FIZZCO_PLANT_LEVEL);
  const want: [RivalId, string, FacilityKind, number][] = [['fizzco', 'harbor', 'pier', 1], ['sourwood', 'hilltop', 'helipad', 2], ['sourwood', 'hilltop', 'pier', 1]];
  for (const [id, district, kind, level] of want) {
    const p = PLOTS.find((q) => q.district === district && s.plots[q.id].owner === id && FACILITIES[kind].on.includes(q.type) && !s.plots[q.id].facility);
    if (p) put(p.id, kind, level);
  }
  // canon: "Hollis's 6 starting Fields hold Lemon Groves."
  for (const p of PLOTS) if (p.district === 'groves' && p.type === 'field' && s.plots[p.id].owner === 'hollis' && !s.plots[p.id].facility) put(p.id, 'grove', 1);
}

// ---------- Weakened ----------

export const OUTSELL = { ratio: 2, days: 7 };

/** Weakened: holds 40% or less of its peak plots, its Net Worth is under 25% of yours, or you've outsold it 2x for 7 days running. */
export function isWeakened(s: GameState, id: RivalId): boolean {
  const r = s.rivals[id];
  if (!r.alive) return false;
  const plots = ownedPlots(s, id).length;
  return plots <= r.peakPlots * 0.4 || netWorth(s, id) < netWorth(s) * 0.25 || (r.outsoldDays ?? 0) >= OUTSELL.days;
}

/** At closing: count the days in a row the player's sales were at least double each rival's. */
export function trackOutselling(s: GameState): void {
  for (const id of RIVALS) {
    const r = s.rivals[id];
    const theirs = r.salesToday ?? 0;
    r.outsoldDays = r.alive && s.today.revenue >= OUTSELL.ratio * theirs && s.today.revenue > 0 ? (r.outsoldDays ?? 0) + 1 : 0;
    r.salesToday = 0;
  }
}

// ---------- Trophies ----------

export const TROPHIES: Record<RivalId, { name: string; perk: string }> = {
  blenders: { name: 'Blender Bar', perk: 'Frozen recipes sell for 20% more' },
  coldbrew: { name: "Juni's Grapevine", perk: 'Raid warnings arrive 1 game hour earlier' },
  hollis: { name: 'Hollis Orchards', perk: 'Each Lemon Grove brings +10% traffic instead of +5%' },
  fizzco: { name: 'Bottling Line', perk: 'Bottles fill 25% faster' },
  sourwood: { name: 'Family Silver', perk: 'Land, Plot Buyouts and auction bids cost 10% less' },
};
export const hasTrophy = (s: GameState, id: RivalId) => s.plots[hqPlot(id).id]?.owner === 'player';
export const familySilver = (s: GameState) => (hasTrophy(s, 'sourwood') ? 0.9 : 1);

export const hqPlot = (id: RivalId): Plot => PLOTS.find((p) => p.type === 'hq' && p.district === FACTIONS[id].home)!;

// ---------- Truce ----------

export const truceCost = (s: GameState) => Math.max(500, Math.round(netWorth(s) * 0.02 / 100) * 100);
export const inTruce = (s: GameState, id: RivalId) => (s.rivals[id].truceUntil ?? 0) >= s.day;

export function canTruce(s: GameState, id: RivalId): Blocker {
  if (s.rank < SITDOWN_RANK) return rankNeed(SITDOWN_RANK);
  if (!s.rivals[id].alive) return { ok: false, why: 'Out of the game' };
  if (inTruce(s, id)) return { ok: false, why: `Truce until day ${s.rivals[id].truceUntil}` };
  if ((s.noTruceUntil ?? 0) >= s.day) return { ok: false, why: `Nobody trusts your handshake until day ${s.noTruceUntil! + 1}` };
  if (s.phase !== 'prep') return { ok: false, why: 'Sit-downs happen at Morning Prep' };
  if (s.cash < truceCost(s)) return { ok: false, why: `Tribute is ${money(truceCost(s))}` };
  return { ok: true };
}

export function makeTruce(s: GameState, id: RivalId): boolean {
  if (!canTruce(s, id).ok) return false;
  const cost = truceCost(s);
  s.cash = round2(s.cash - cost);
  s.today.upkeep = round2(s.today.upkeep + cost);
  const r = s.rivals[id];
  r.truceUntil = s.day + TRUCE_DAYS - 1;
  r.respectUntil = Math.max(r.respectUntil, r.truceUntil + 1);
  s.raids = s.raids.filter((x) => !(x.attacker === id && s.plots[x.target].owner === 'player'));
  s.news.push(`Handshake at Dot's Diner: a ${TRUCE_DAYS}-day truce with ${FACTIONS[id].name} for ${money(cost)} tribute.`);
  return true;
}

/** Raiding a rival you're in a truce with breaks it: a full star, and nobody trusts you. */
export function breakTruce(s: GameState, id: RivalId): void {
  if (!inTruce(s, id)) return;
  s.rivals[id].truceUntil = 0;
  s.rivals[id].respectUntil = 0;
  s.reputation = Math.max(1, round2(s.reputation - TRUCE_BREAK_STARS));
  for (const r of RIVALS) s.rivals[r].grudge = Math.min(100, s.rivals[r].grudge + 25);
  s.noTruceUntil = s.day + TRUCE_BAN_DAYS - 1;
  s.news.push(`Lottie breaks the truce with ${FACTIONS[id].name}! The whole Bay is talking. (−${TRUCE_BREAK_STARS} star)`);
}

// ---------- Plot Buyout ----------

export function plotBuyoutPrice(s: GameState, plotId: string): number {
  const ps = s.plots[plotId];
  const id = ps.owner as RivalId;
  const home = PLOT_BY_ID[plotId].district === FACTIONS[id].home;
  const nudge = 1 + s.rivals[id].grudge / 200 + (id === 'sourwood' ? 0.2 : 0);
  return Math.round(ps.landValue * (tillyFieldRate(s, plotId) ?? (home ? PLOT_BUYOUT.home : PLOT_BUYOUT.away)) * nudge * familySilver(s));
}

export function canPlotBuyout(s: GameState, plotId: string): Blocker {
  const ps = s.plots[plotId];
  if (s.rank < SITDOWN_RANK) return rankNeed(SITDOWN_RANK);
  if (!ps.owner || ps.owner === 'player') return { ok: false, why: 'Pick a rival plot' };
  if (PLOT_BY_ID[plotId].type === 'hq') return { ok: false, why: 'HQs are captured, never bought' };
  if (landFrozen(s, plotId)) return { ok: false, why: 'Town Hall froze this sale' };
  if (s.phase !== 'prep') return { ok: false, why: 'Sit-downs happen at Morning Prep' };
  const price = plotBuyoutPrice(s, plotId);
  if (s.cash < price) return { ok: false, why: `They want ${money(price)}` };
  return { ok: true };
}

export function plotBuyout(s: GameState, plotId: string): boolean {
  if (!canPlotBuyout(s, plotId).ok) return false;
  const ps = s.plots[plotId];
  const id = ps.owner as RivalId;
  const price = plotBuyoutPrice(s, plotId);
  s.cash = round2(s.cash - price);
  s.today.land = round2(s.today.land + price);
  s.rivals[id].cash += price;
  ps.owner = 'player';
  s.rivals[id].held = s.rivals[id].held?.filter((x) => x !== plotId); // a sale, not a taking: no Grudge
  ps.garrison = 0;
  if (ps.stand) ps.stand.price = Math.max(ps.stand.price, 0.5);
  s.news.push(`Skip Larkin: "Done deal! ${FACTIONS[id].name} sell ${PLOT_BY_ID[plotId].name} for ${money(price)}."`);
  bump(s, 'buyouts');
  checkVictory(s);
  return true;
}

// ---------- Faction Buyout ----------

/** The business: their cash plus what's invested in their buildings. The land goes to the Fire Sale. */
export function factionBuyoutPrice(s: GameState, id: RivalId): number | null {
  // Peaceful Sandbox: even Vera sells once Weakened (at 3x), so Domination can finish without a fight.
  const m = HQS[id].buyout ?? (peaceful(s) ? PEACEFUL_VERA_BUYOUT : null);
  if (m === null) return null;
  const buildings = ownedPlots(s, id).reduce((a, p) => a + s.plots[p.id].invested, 0);
  return Math.round((Math.max(0, s.rivals[id].cash) + buildings) * m);
}

export function canFactionBuyout(s: GameState, id: RivalId): Blocker {
  if (s.rank < Math.max(FACTION_BUYOUT_RANK, HQS[id].rank)) return rankNeed(Math.max(FACTION_BUYOUT_RANK, HQS[id].rank));
  if (!s.rivals[id].alive) return { ok: false, why: 'Out of the game' };
  const tilly = tillyWaits(s, id, 'buyout'); if (tilly) return tilly;
  const price = factionBuyoutPrice(s, id);
  if (price === null) return { ok: false, why: `${HQS[id].boss} never sells` };
  if (!isWeakened(s, id)) return { ok: false, why: 'Only once they are Weakened' };
  if (s.phase !== 'prep') return { ok: false, why: 'Sit-downs happen at Morning Prep' };
  if (s.cash < price) return { ok: false, why: `They want ${money(price)}` };
  return { ok: true };
}

export function factionBuyout(s: GameState, id: RivalId): boolean {
  if (!canFactionBuyout(s, id).ok) return false;
  const price = factionBuyoutPrice(s, id)!;
  s.cash = round2(s.cash - price);
  s.today.land = round2(s.today.land + price);
  s.news.push(`${HQS[id].boss} signs on the napkin at Dot's Diner: Lottie buys out ${FACTIONS[id].name} for ${money(price)}!`);
  bump(s, 'buyouts');
  eliminate(s, id, 'buyout');
  return true;
}

// ---------- elimination ----------

/** The rival is out. Bought out: they already handed everything over. Otherwise a Fire Sale. */
export function eliminate(s: GameState, id: RivalId, how: 'buyout' | 'hq' | 'bankrupt'): void {
  const r = s.rivals[id];
  if (!r.alive) return;
  r.alive = false;
  r.cash = 0;
  s.raids = s.raids.filter((x) => x.attacker !== id);
  const hq = hqPlot(id);
  if (how !== 'bankrupt') {
    s.plots[hq.id] = { ...s.plots[hq.id], owner: 'player', garrison: 0 };
    s.news.push(`${FACTIONS[id].name} are finished! Their HQ, ${hq.name}, becomes Lottie's ${TROPHIES[id].name}: ${TROPHIES[id].perk.toLowerCase()}.`);
  }
  if (how === 'bankrupt') s.news.push(`${FACTIONS[id].name} go bust after ${BANKRUPT_DAYS} days in the red.`);
  recoverPage(s, id); // world: their recipe page comes home, on every route
  let sale = 0;
  for (const p of PLOTS) {
    const ps = s.plots[p.id];
    if (ps.owner !== id) continue;
    if (p.type === 'hq') { s.plots[p.id] = { ...ps, owner: null, garrison: 0 }; continue; }
    s.plots[p.id] = {
      owner: null, stand: null, invested: 0, landValue: ps.landValue, defense: NO_DEFENSE(),
      dibs: { who: 'player', until: s.day + FIRE_SALE.days - 1, price: Math.round(ps.landValue * FIRE_SALE.share) },
    };
    sale++;
  }
  if (sale) s.news.push(`FIRE SALE: ${sale} ${FACTIONS[id].name} plot${sale === 1 ? '' : 's'} at 25% off. Lottie has First Dibs for ${FIRE_SALE.days} days.`);
  checkVictory(s);
}

/** At dawn: rivals in the red for a week go bust. */
export function rivalsBankrupt(s: GameState): void {
  for (const id of RIVALS) {
    const r = s.rivals[id];
    if (!r.alive) continue;
    r.brokeDays = r.cash < 0 ? (r.brokeDays ?? 0) + 1 : 0;
    if (r.brokeDays >= BANKRUPT_DAYS) eliminate(s, id, 'bankrupt');
  }
}

// ---------- HQ assault ----------

export function canAssault(s: GameState, id: RivalId, guardIds: string[]): Blocker {
  const hq = HQS[id];
  if (!s.rivals[id].alive) return { ok: false, why: 'Out of the game' };
  if (peaceful(s)) return { ok: false, why: 'Peaceful: no HQ assaults in this Sandbox' };
  if (s.rank < hq.rank) return rankNeed(hq.rank);
  const tilly = tillyWaits(s, id, 'assault'); if (tilly) return tilly;
  if (!isWeakened(s, id)) return { ok: false, why: 'Only once they are Weakened' };
  if (s.phase !== 'prep') return { ok: false, why: 'Storm the HQ at Morning Prep' };
  if (!guardIds.length) return { ok: false, why: 'Pick your squad' };
  if (guardIds.length > SQUAD_CAP(s.rank)) return { ok: false, why: `Squad cap is ${SQUAD_CAP(s.rank)}` };
  return { ok: true };
}

export interface AssaultResult { won: boolean; stage: HqStage; reports: BattleReport[] }
export type HqStage = 'gate' | 'yard' | 'boss';
/** An HQ falls in three fights in a row. */
export const HQ_STAGES: HqStage[] = ['gate', 'yard', 'boss'];

function boss(id: RivalId, n: number): Fighter {
  const tier = HQS[id].tier;
  const m = 0.75 + 0.25 * tier;
  return { id: `${id}-boss-${n}`, name: HQS[id].boss, side: 'def', hp: GUARD_BASE.hp * 2.5 * m, hit: 8 * m, chop: 2, nerve: 200, armor: 0.2, weapon: 'clubs' };
}

/** The squad that storms the gate: picked guards who are fit to fight (breaks any truce). */
export function hqSquad(s: GameState, id: RivalId, guardIds: string[]): Fighter[] {
  breakTruce(s, id);
  return s.guards.filter((g) => guardIds.includes(g.id) && guardReady(s, g)).map((g) => guardFighter(g, 'att', false));
}

/** One stage's fight: who holds it, and in the Boss Room the boss and their move (dice from rng). */
export function hqStageInput(s: GameState, id: RivalId, stage: HqStage, squad: Fighter[], rng: Rng): BattleInput {
  const hq = HQS[id];
  let attackers = squad;
  let defenders = Array.from({ length: stage === 'gate' ? 1 + hq.tier : stage === 'yard' ? hq.yard : 1 + Math.ceil(hq.tier / 2) }, (_, i) => henchmanFor(s, id, Math.min(5, hq.tier + (stage === 'yard' ? 1 : 0)), rng, i));
  let perimeter = 0, fenceHp = 0;
  if (stage === 'boss') {
    defenders.unshift(boss(id, s.nextId++));
    // Boss moves.
    if (id === 'blenders') for (const a of attackers.slice(0, 3)) a.hp *= 0.5; // Blender Rush
    if (id === 'coldbrew') for (const d of defenders) d.hit *= 1.3; // Espresso Shot
    if (id === 'hollis') { perimeter = 2; fenceHp = 500; } // Hay Bale Wall
    if (id === 'fizzco') { // Hostile Takeover: two guards switch sides unless Loyal
      const turn = attackers.filter((f) => s.guards.find((g) => g.id === f.id)?.trait !== 'Loyal').slice(0, 2);
      attackers = attackers.filter((f) => !turn.includes(f));
      defenders = [...defenders, ...turn.map((f) => ({ ...f, side: 'def' as const, id: `${f.id}-turned` }))];
    }
    if (id === 'sourwood') { // Old Money: Steward reinforcements, and her cane disarms one guard
      defenders.push(...[0, 1, 2].map((i) => henchmanFor(s, id, 5, rng, 10 + i)));
      if (attackers[0]) attackers = [{ ...attackers[0], weapon: 'fists', hit: attackers[0].hit * 0.6 }, ...attackers.slice(1)];
    }
  }
  return {
    attackers, defenders, perimeter, fenceHp, gadgets: [],
    standHp: stage === 'gate' ? hq.gate : 0, objective: stage === 'gate' ? 'smash' : 'shakedown', detected: true,
  };
}

/** Survivors carry on to the next stage, worn down a little; the knocked-out and the runners are done. */
export const hqSurvivors = (input: BattleInput, res: BattleResult): Fighter[] =>
  input.attackers.filter((f) => !res.koed.includes(f.id) && !res.fled.includes(f.id)).map((f) => ({ ...f, hp: f.hp * 0.9 }));

/**
 * A stage is fought: credit the guards and write it up. 'next' when the squad
 * pushes on; a stall or the Boss Room falling ends the assault here.
 */
export function hqStageOver(s: GameState, id: RivalId, stage: HqStage, input: BattleInput, res: BattleResult, reports: BattleReport[]): 'next' | 'won' | 'lost' {
  const hq = HQS[id];
  const plot = hqPlot(id);
  creditGuards(s, input, res);
  const won = res.winner === 'att' && (stage !== 'gate' || res.outcome === 'smashed');
  reports.push({
    day: s.day, attacker: 'player', defender: id, target: plot.id, objective: input.objective,
    outcome: won ? (stage === 'boss' ? 'smashed' : 'damaged') : 'repelled', loot: 0, attackers: input.attackers, defenders: input.defenders,
    perimeter: input.perimeter, standLevel: 3, events: res.events, duration: res.duration, koed: res.koed, fled: res.fled, hq: stage,
  });
  if (!won) {
    s.rivals[id].grudge = Math.min(100, s.rivals[id].grudge + 30);
    s.news.push(`HQ assault on ${plot.name} stalls at the ${stage === 'gate' ? 'Gate' : stage === 'yard' ? 'Yard' : 'Boss Room'}. ${hq.boss} laughs it off.`);
    finish(s, reports);
    return 'lost';
  }
  if (stage !== 'boss') return 'next';
  s.news.push(`${hq.boss} tries "${hq.move}", but it isn't enough. Lottie's crew takes ${plot.name}!`);
  bump(s, 'hqs');
  eliminate(s, id, 'hq');
  finish(s, reports);
  return 'won';
}

/** Three fights in a row, all at once: the Gate, the Yard, the Boss Room. Survivors carry on, a little worn. */
export function stormHQ(s: GameState, id: RivalId, guardIds: string[]): AssaultResult | false {
  if (!canAssault(s, id, guardIds).ok) return false;
  let squad = hqSquad(s, id, guardIds);
  const rng = { seed: s.seed };
  const reports: BattleReport[] = [];
  for (const stage of HQ_STAGES) {
    const input = hqStageInput(s, id, stage, squad, rng);
    const res = runBattle(input, rng);
    s.seed = rng.seed;
    const next = hqStageOver(s, id, stage, input, res, reports);
    if (next !== 'next') return { won: next === 'won', stage, reports };
    squad = hqSurvivors(input, res);
  }
  return false; // not reached: the Boss Room always ends it
}

function finish(s: GameState, reports: BattleReport[]) {
  s.battles.unshift(reports[reports.length - 1]);
  s.battles.length = Math.min(s.battles.length, 6);
}

/** For the HUD: a short readout of where a rival stands. */
export function rivalStatus(s: GameState, id: RivalId) {
  const r = s.rivals[id];
  return {
    alive: r.alive, plots: ownedPlots(s, id).length, peak: r.peakPlots, worth: netWorth(s, id),
    weakened: isWeakened(s, id), truce: inTruce(s, id) ? r.truceUntil! : 0, threat: threatLevel(s),
  };
}
