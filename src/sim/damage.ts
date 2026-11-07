// Buildings and their damage (spec: Stands, "Damage, repairs and rebuilds"; Defenses, "When a stand falls"; canon:
// Knock it down, buy it up). Every faction's stands and facilities keep their HP from one raid to the next: a Smash
// that runs out of time, or any chopping short of 0, leaves the building Damaged. A Damaged stand stays open and pours
// its HP share of its cups an hour until a repair, approved by the end of the Evening and paid on approval, puts it
// back to full HP at dawn. Rebuilds and repairs cost a share of what went into the building itself: a stand's level
// steps or a facility's tiers, never the plot's fences and gadgets. Pure functions over GameState, like the rest of
// the sim; nothing here rolls dice.
import { BUSTED_REPAIR_SHARE, DAMAGE_REPAIR_SHARE, REBUILD_SHARE, RIVAL_REPAIR_RESERVE, STAND_LEVELS, type RivalId } from './balance.ts';
import { difficulty } from './modes.ts'; // Custom's Busted-only switch too (nights: modes.ts difficultyOf)
import { PLOT_BY_ID, PLOTS, type FactionId } from './map.ts';
import type { Blocker, GameState, PlotState } from './economy.ts';
import { buildingHp, isWrecked, type BattleReport } from './crew.ts';
import { FACILITIES } from './vip.ts';

/** Max HP comes from one place (crew.ts); it's re-exported here beside the current HP for anyone reading damage. */
export { buildingHp } from './crew.ts';

/** A repair waiting for the night: who paid, what, and the HP it puts back at dawn. */
export interface Repair { by: FactionId; cost: number; hp: number }

const round2 = (n: number) => Math.round(n * 100) / 100;
const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

/** The building on a plot: its stand or its facility (null on an empty plot). */
const building = (ps: PlotState) => ps.stand ?? ps.facility ?? null;

/**
 * What was invested in the building on a plot: the base for its rebuild and repair costs. A stand counts its level
 * steps (a Kiosk built on an empty plot: $150 + $400 + $3,500 = $4,050), a facility its tiers. Fences and gadgets
 * have their own repair rule (Defenses), and the plot's `invested` (Net Worth's figure, which counts them) is untouched.
 */
export function buildingInvested(ps: PlotState): number {
  if (ps.stand) return STAND_LEVELS.slice(0, ps.stand.level).reduce((a, l) => a + l.cost, 0);
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
 * After a fight on the plot. A building that fell (Wrecked or Busted) drops its HP, so it comes back full when rebuilt,
 * and a repair queued for it is called off and paid back. One still standing keeps the HP the fight left it, at least 1:
 * the next raid starts from there. Returns the HP it lost and kept (0 when it fell or wasn't touched).
 */
export function raidDamage(s: GameState, plotId: string, hpLeft: number): number {
  const ps = s.plots[plotId];
  const b = building(ps);
  if (!b) return 0;
  if (b.wrecked) {
    delete b.hp;
    callOffRepair(s, plotId);
    return 0;
  }
  const before = currentHp(ps);
  const after = Math.max(1, Math.min(before, Math.round(hpLeft)));
  if (after >= before) return 0;
  b.hp = after;
  return before - after;
}

/** The battle headline's last words: what a raid that didn't flatten the building took off it. */
export function hpLostNote(b: BattleReport): string {
  if (!b.hpLost || b.outcome === 'smashed') return '';
  return ` ${b.attacker === 'player' ? 'Their' : 'Your'} ${b.standLevel ? 'stand' : 'facility'} lost ${b.hpLost.toLocaleString('en-US')} HP.`;
}

// ---------- repairs ----------

/**
 * What a Damaged building costs to repair: 15% of what went into it × the share of HP lost (a Kiosk at half HP: $304),
 * in whole dollars, and never more than putting it back up after a fall would cost (a rebuild, or on Laid Back your
 * Busted fix). 0 when there's nothing to repair.
 */
export function repairCost(s: GameState, plotId: string): number {
  const ps = s.plots[plotId];
  if (!isDamaged(ps)) return 0;
  const base = buildingInvested(ps);
  const max = buildingHp(ps);
  const lost = (max - currentHp(ps)) / max;
  const fall = ps.owner === 'player' && difficulty(s).bustOnly ? BUSTED_REPAIR_SHARE : REBUILD_SHARE;
  return Math.min(dollarsUp(base * DAMAGE_REPAIR_SHARE * lost), dollarsUp(base * fall));
}

/** Repairs are approved any time up to the end of the Evening (they run overnight), on your own Damaged buildings. */
export function canRepair(s: GameState, plotId: string): Blocker {
  const ps = s.plots[plotId];
  if (ps?.owner !== 'player') return { ok: false, why: 'Not your plot' };
  if (ps.repair) return { ok: false, why: 'Fixing tonight' };
  if (!isDamaged(ps)) return { ok: false, why: 'Nothing to fix' };
  if (s.phase === 'night') return { ok: false, why: 'Too late tonight: approve it tomorrow' };
  const cost = repairCost(s, plotId);
  if (s.cash < cost) return { ok: false, why: `Needs ${money(cost)}` };
  return { ok: true };
}

/** Approve a repair: paid now (the Ledger's repairs), worked on overnight, back to full HP at dawn. Auto-Repair's seam. */
export function approveRepair(s: GameState, plotId: string): boolean {
  if (!canRepair(s, plotId).ok) return false;
  const ps = s.plots[plotId];
  const cost = repairCost(s, plotId);
  s.cash = round2(s.cash - cost);
  s.today.land = round2(s.today.land + cost); // ledger: repairs
  ps.repair = { by: 'player', cost, hp: buildingHp(ps) - currentHp(ps) };
  return true;
}

/** A queued repair that can't happen (the building fell, or came back full some other way): the money goes back. */
function callOffRepair(s: GameState, plotId: string): void {
  const ps = s.plots[plotId];
  const r = ps.repair;
  if (!r) return;
  delete ps.repair;
  if (r.by === 'player') {
    s.cash = round2(s.cash + r.cost);
    s.today.land = round2(s.today.land - r.cost); // ledger: repairs (paid back)
    s.news.push(`The repair at ${PLOT_BY_ID[plotId].name} is called off: ${money(r.cost)} back.`);
  } else if (s.rivals[r.by as RivalId]) s.rivals[r.by as RivalId].cash += r.cost;
}

/** Closing time: each rival books the repairs it can spare the cash for (the bill plus $500 in hand), paid now and done
 * by dawn, the same as yours. */
export function damageAtClose(s: GameState): void {
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

/** Dawn: the night's repairs are done. Each puts back the HP it was paid for, so a building the night left alone is good
 * as new; one a raid dented again after the approval keeps the fresh damage. */
export function damageAtDawn(s: GameState): void {
  const fixed: string[] = [], dented: string[] = [];
  for (const p of PLOTS) {
    const ps = s.plots[p.id];
    const r = ps.repair;
    if (!r) continue;
    const b = building(ps);
    if (!b || b.wrecked) { callOffRepair(s, p.id); continue; } // a fall calls it off at once; this is the safety net
    delete ps.repair;
    const hp = currentHp(ps) + r.hp;
    if (hp >= buildingHp(ps)) delete b.hp; else b.hp = hp;
    if (r.by === 'player') (hp >= buildingHp(ps) ? fixed : dented).push(p.name);
  }
  if (fixed.length) s.news.push(`Fixed overnight: ${fixed.length <= 2 ? fixed.join(' and ') : `${fixed.length} buildings`} ${fixed.length === 1 ? 'is' : 'are'} good as new.`);
  for (const name of dented) s.news.push(`${name} is patched up, but last night's raid left fresh damage.`);
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
    if (r !== undefined && (!r || typeof r !== 'object' || typeof r.by !== 'string' || typeof r.cost !== 'number' || typeof r.hp !== 'number' || !b || isWrecked(ps))) delete ps.repair;
  }
}
