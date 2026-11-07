// Stand specializations (spec: Stands, Specializations; balance-tables.md "Stand specializations"). The Kiosk (L3)
// opens one slot for $2,000 and the Citrus Palace (L5) a second for $40,000. Each slot holds one of four fit-outs, and
// swapping later costs the slot's price again. Each effect multiplies in where its number is read: the Express Window
// in the pour (demand.ts pourRate), the Fancy Menu in the top price (demand.ts topPriceMods), the Fortified Frame in
// the max HP (crew.ts buildingHp) and the Billboard Roof in the marketing number (demand.ts MARKETING_TERMS). They
// belong to the stand: a rebuild keeps them and a plot that goes For Sale loses them. They work while the stand is
// yours; one that changes hands keeps them idle. Pure: no draws.
import { SPEC_SLOTS, SPECIALIZATIONS, STAND_LEVELS, type SpecId } from './balance.ts';
import { nearbyPlots, PLOT_BY_ID, type FactionId } from './map.ts';
import type { Blocker, GameState, PlotState, Stand } from './economy.ts';
import { adsBlocked, type MarketingAdd } from './demand.ts';
import { repostPrice } from './automation.ts';
import { buildingHp } from './crew.ts';
import { book } from './ledger.ts';

const money = (n: number) => `$${n.toLocaleString('en-US')}`;
/** "an Express Window", "a Fancy Menu" */
const aName = (id: SpecId) => `${/^[AEIOU]/.test(SPECIALIZATIONS[id].name) ? 'an' : 'a'} ${SPECIALIZATIONS[id].name}`;

/** How many specialization slots a stand of this level has: none below L3, one at L3 and L4, two at L5. */
export const specSlots = (level: number): number => SPEC_SLOTS.filter((sl) => level >= sl.level).length;

/** What a slot holds: null when it's empty. */
export const specIn = (st: Stand, slot: number): SpecId | null => st.specs?.[slot] ?? null;

/** What a stand's open slots hold, slot by slot, empty ones left out. */
export function fittedOn(st: Stand | null | undefined): SpecId[] {
  if (!st?.specs) return [];
  return st.specs.slice(0, specSlots(st.level)).filter((x): x is SpecId => !!x && x in SPECIALIZATIONS);
}

/**
 * What went into a stand's slots: each filled slot's price, as its first fitting paid it (a swap only replaces what was
 * there). It is part of the building, so its rebuilds and repairs count it (damage.ts buildingInvested): a Wrecked
 * stand comes back with its fittings, and a Fortified Kiosk ($4,050 + $2,000) rebuilds for 15% of $6,050.
 */
export function specsInvested(st: Stand): number {
  return (st.specs ?? []).slice(0, specSlots(st.level)).reduce((a, x, i) => a + (x && x in SPECIALIZATIONS ? SPEC_SLOTS[i].cost : 0), 0);
}

/** The specializations at work on a plot: a stand of yours runs what it's fitted with, anyone else's runs none. */
export const specsAt = (ps: PlotState | undefined): SpecId[] => (ps?.owner === 'player' ? fittedOn(ps.stand) : []);

// ---------- the effects ----------

/** The Express Window: ×1.3 on the cups an hour a stand of yours pours (demand.ts pourRate), before its HP share. */
export const expressWindow = (ps: PlotState): number => (specsAt(ps).includes('express') ? SPECIALIZATIONS.express.service! : 1);

/** The Fancy Menu: ×1.2 on the top price (demand.ts topPriceMods, which leaves rival stands out already). */
export const fancyMenu = (st: Stand): number => (fittedOn(st).includes('fancy') ? SPECIALIZATIONS.fancy.topPrice! : 1);

/** The Fortified Frame: ×1.5 on a stand's max HP (crew.ts buildingHp), so raids, repairs and Storms all read it. */
export const fortifiedFrame = (ps: PlotState): number => (specsAt(ps).includes('fortified') ? SPECIALIZATIONS.fortified.hp! : 1);

/**
 * The marketing number's Billboard Roof term: +15% for each standing Roof of yours within 2 plots of your stand, its
 * own roof included, across district lines too. Rival stands get nothing from it, and a Cease-and-Desist on the
 * stand's district blocks it as it does Billboards.
 */
export function roofTerms(s: GameState, owner: FactionId, add: MarketingAdd, plotId?: string): void {
  if (owner !== 'player' || !plotId) return;
  let n = 0;
  for (const q of nearbyPlots(PLOT_BY_ID[plotId])) {
    const ps = s.plots[q.id];
    if (ps?.stand && !ps.stand.wrecked && specsAt(ps).includes('roof')) n++;
  }
  if (n) add('roof', n === 1 ? 'Billboard Roof' : `${n} Billboard Roofs`, n * SPECIALIZATIONS.roof.traffic!, adsBlocked(s, owner, plotId));
}

// ---------- fitting one ----------

/** Can you fit `id` into a slot of the stand on `plotId`, or swap it in for what the slot holds? At Morning Prep, like an upgrade. */
export function canFitSpec(s: GameState, plotId: string, slot: number, id: SpecId): Blocker {
  const ps = s.plots[plotId];
  const st = ps?.stand;
  if (!st || ps.owner !== 'player') return { ok: false, why: 'Not your stand' };
  const sl = SPEC_SLOTS[slot];
  if (!sl || !(id in SPECIALIZATIONS)) return { ok: false, why: 'No such slot' };
  if (st.level < sl.level) return { ok: false, why: `Opens at ${STAND_LEVELS[sl.level - 1].name}` };
  if (st.wrecked) return { ok: false, why: ps.busted ? 'Fix it first' : 'Rebuild it first' };
  if (s.phase !== 'prep') return { ok: false, why: 'Fit during Morning Prep' };
  if (specIn(st, slot) === id) return { ok: false, why: 'Fitted' };
  const other = fittedOn(st).includes(id) ? st.specs!.indexOf(id) : -1;
  if (other >= 0) return { ok: false, why: `In slot ${other + 1}` };
  if (s.cash < sl.cost) return { ok: false, why: `Needs ${money(sl.cost)}` };
  return { ok: true };
}

/**
 * Fit `id` into the slot, or swap it in: the slot's price either way, on the Ledger's Invested row. A first fitting
 * adds to the stand's building value (Net Worth counts 75% of it); a swap only replaces what was there. Fitting or
 * swapping out a Fortified Frame keeps the stand's HP share, and Auto-Price follows a Fancy Menu's ceiling.
 */
export function fitSpec(s: GameState, plotId: string, slot: number, id: SpecId): boolean {
  if (!canFitSpec(s, plotId, slot, id).ok) return false;
  const ps = s.plots[plotId];
  const st = ps.stand!;
  const cost = SPEC_SLOTS[slot].cost;
  const was = specIn(st, slot);
  const before = buildingHp(ps);
  const specs = st.specs ?? [];
  while (specs.length <= slot) specs.push(null);
  specs[slot] = id;
  st.specs = specs;
  book(s, 'invested', -cost);
  if (!was) ps.invested += cost;
  keepHpShare(ps, before);
  repostPrice(s, plotId);
  const name = PLOT_BY_ID[plotId].name;
  s.news.push(was ? `${name} swaps its ${SPECIALIZATIONS[was].name} for ${aName(id)}.` : `${name} gets ${aName(id)}!`);
  return true;
}

/** The max HP moved (a Fortified Frame in or out): a dented stand keeps its share, and tonight's repair still ends at full. */
function keepHpShare(ps: PlotState, before: number): void {
  const st = ps.stand!;
  const after = buildingHp(ps);
  if (after === before || before <= 0) return;
  const k = after / before;
  const hp = st.hp;
  if (hp !== undefined) {
    st.hp = Math.max(1, Math.round(hp * k));
    if (st.hp >= after) delete st.hp;
  }
  const r = ps.repair;
  if (r && !r.rebuild) r.hp = hp !== undefined && hp + r.hp >= before ? after - (st.hp ?? after) : Math.round(r.hp * k);
}

/** Saves from before specializations load with empty slots; odd entries are dropped. Safe to run on every load. */
export function migrateSpecs(s: GameState): void {
  for (const ps of Object.values(s.plots ?? {})) {
    const st = ps?.stand;
    if (!st || st.specs === undefined) continue;
    if (!Array.isArray(st.specs)) { delete st.specs; continue; }
    st.specs = st.specs.slice(0, SPEC_SLOTS.length).map((x) => (typeof x === 'string' && x in SPECIALIZATIONS ? x : null));
  }
}
