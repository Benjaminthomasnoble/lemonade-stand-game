// Sit-downs at Dot's Diner, buyouts, elimination and HQ assaults (canon
// sections 10 and 13). Pure functions over GameState, like the rest of the sim.
import { FACTIONS, GUARD_BASE, PEACEFUL_VERA_BUYOUT, RANKS, SQUAD_CAP, type RivalId } from './balance.ts';
import { runBattle, type BattleInput, type Fighter } from './combat.ts';
import { creditGuards, guardFighter, guardReady, henchmanFor, NO_DEFENSE, threatLevel, type BattleReport } from './crew.ts';
import { PLOT_BY_ID, PLOTS, type Plot } from './map.ts';
import { FACILITIES, type FacilityKind } from './vip.ts';
import type { Blocker, GameState } from './economy.ts';
import { netWorth, ownedPlots } from './economy.ts';
import { bump, checkVictory, peaceful } from './modes.ts';
import { recoverPage } from './recipes.ts';
import { tillyFieldRate, tillyWaits } from './calendar.ts';

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

const rankNeed = (r: number): Blocker => ({ ok: false, why: `Needs Rank ${r}, ${RANKS[r - 1].title}` });

/** Rivals hold a few VIP facilities on their Fields and Docks: worth knocking down. */
export function seedRivalFacilities(s: GameState): void {
  const want: [RivalId, string, FacilityKind, number][] = [['hollis', 'groves', 'helipad', 1], ['fizzco', 'harbor', 'pier', 1], ['sourwood', 'hilltop', 'helipad', 2], ['sourwood', 'hilltop', 'pier', 1]];
  for (const [id, district, kind, level] of want) {
    const p = PLOTS.find((q) => q.district === district && s.plots[q.id].owner === id && FACILITIES[kind].on.includes(q.type) && !s.plots[q.id].facility);
    if (!p) continue;
    s.plots[p.id].facility = { kind, level };
    s.plots[p.id].invested = FACILITIES[kind].costs.slice(0, level).reduce((a, b) => a + b, 0);
  }
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

export interface AssaultResult { won: boolean; stage: 'gate' | 'yard' | 'boss'; reports: BattleReport[] }

function boss(id: RivalId, n: number): Fighter {
  const tier = HQS[id].tier;
  const m = 0.75 + 0.25 * tier;
  return { id: `${id}-boss-${n}`, name: HQS[id].boss, side: 'def', hp: GUARD_BASE.hp * 2.5 * m, hit: 8 * m, chop: 2, nerve: 200, armor: 0.2, weapon: 'clubs' };
}

/** Three fights in a row: the Gate, the Yard, the Boss Room. Survivors carry on, a little worn. */
export function stormHQ(s: GameState, id: RivalId, guardIds: string[]): AssaultResult | false {
  if (!canAssault(s, id, guardIds).ok) return false;
  breakTruce(s, id);
  const hq = HQS[id];
  const plot = hqPlot(id);
  const rng = { seed: s.seed };
  let squad = s.guards.filter((g) => guardIds.includes(g.id) && guardReady(s, g)).map((g) => guardFighter(g, 'att', false));
  const reports: BattleReport[] = [];
  const stages: AssaultResult['stage'][] = ['gate', 'yard', 'boss'];
  for (const stage of stages) {
    let defenders = Array.from({ length: stage === 'gate' ? 1 + hq.tier : stage === 'yard' ? hq.yard : 1 + Math.ceil(hq.tier / 2) }, (_, i) => henchmanFor(s, id, Math.min(5, hq.tier + (stage === 'yard' ? 1 : 0)), rng, i));
    let perimeter = 0, fenceHp = 0;
    if (stage === 'boss') {
      defenders.unshift(boss(id, s.nextId++));
      // Boss moves.
      if (id === 'blenders') for (const a of squad.slice(0, 3)) a.hp *= 0.5; // Blender Rush
      if (id === 'coldbrew') for (const d of defenders) d.hit *= 1.3; // Espresso Shot
      if (id === 'hollis') { perimeter = 2; fenceHp = 500; } // Hay Bale Wall
      if (id === 'fizzco') { // Hostile Takeover: two guards switch sides unless Loyal
        const turn = squad.filter((f) => s.guards.find((g) => g.id === f.id)?.trait !== 'Loyal').slice(0, 2);
        squad = squad.filter((f) => !turn.includes(f));
        defenders = [...defenders, ...turn.map((f) => ({ ...f, side: 'def' as const, id: `${f.id}-turned` }))];
      }
      if (id === 'sourwood') { // Old Money: Steward reinforcements, and her cane disarms one guard
        defenders.push(...[0, 1, 2].map((i) => henchmanFor(s, id, 5, rng, 10 + i)));
        if (squad[0]) squad[0] = { ...squad[0], weapon: 'fists', hit: squad[0].hit * 0.6 };
      }
    }
    const input: BattleInput = {
      attackers: squad, defenders, perimeter, fenceHp, gadgets: [],
      standHp: stage === 'gate' ? hq.gate : 0, objective: stage === 'gate' ? 'smash' : 'shakedown', detected: true,
    };
    const res = runBattle(input, rng);
    creditGuards(s, input, res);
    const won = res.winner === 'att' && (stage !== 'gate' || res.outcome === 'smashed');
    reports.push({
      day: s.day, attacker: 'player', defender: id, target: plot.id, objective: input.objective,
      outcome: won ? (stage === 'boss' ? 'smashed' : 'damaged') : 'repelled', loot: 0, attackers: input.attackers, defenders: input.defenders,
      perimeter, standLevel: 3, events: res.events, duration: res.duration, koed: res.koed, fled: res.fled, hq: stage,
    });
    if (!won) {
      s.seed = rng.seed;
      s.rivals[id].grudge = Math.min(100, s.rivals[id].grudge + 30);
      s.news.push(`HQ assault on ${plot.name} stalls at the ${stage === 'gate' ? 'Gate' : stage === 'yard' ? 'Yard' : 'Boss Room'}. ${HQS[id].boss} laughs it off.`);
      finish(s, reports);
      return { won: false, stage, reports };
    }
    // Survivors carry on, worn down a little; the knocked-out pick themselves up for the next stage only if it's the Gate.
    squad = squad.filter((f) => !res.koed.includes(f.id) && !res.fled.includes(f.id)).map((f) => ({ ...f, hp: f.hp * 0.9 }));
  }
  s.seed = rng.seed;
  s.news.push(`${HQS[id].boss} tries "${hq.move}", but it isn't enough. Lottie's crew takes ${plot.name}!`);
  bump(s, 'hqs');
  eliminate(s, id, 'hq');
  finish(s, reports);
  return { won: true, stage: 'boss', reports };
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
