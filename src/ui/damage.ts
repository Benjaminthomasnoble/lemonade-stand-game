// Damaged buildings on the HUD (spec: Stands, "Damage, repairs and rebuilds"). Any standing building's plot card, and
// the stand panel's Defend tab for the selected stand, show an HP meter with the exact points in its tooltip; your own
// Damaged ones get a Repair button with the price, or a note once tonight's repair is booked. Your Damaged buildings
// also get a ticket in the feed at Morning Prep and with the Evening's repairs. From Rank 3 each of your plots has an
// Auto-Repair switch (on unless you skip the plot). Plain controls on the HUD's existing classes; clicks go through the
// HUD's one listener (data-action="repair" approves, "autoRepair" flips the switch, "goto" flies there).
import {
  autoRepairOn, buildingHp, canRepair, currentHp, FACILITIES, hpCapacity, hpShare, isDamaged, PLOT_BY_ID, PLOTS, repairCost,
  standLevel, type GameState,
} from '../sim/economy.ts';
import * as A from './clay.ts';

/** Props are drawn once and reused, so renders compare equal and nothing flickers. */
const memo = new Map<string, string>();
const art = (key: string, f: () => string) => { let v = memo.get(key); if (v === undefined) { v = f(); memo.set(key, v); } return v; };
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const whole = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
const n0 = (n: number) => n.toLocaleString('en-US');
const place = (id: string) => PLOT_BY_ID[id].name.replace(/ lot /, ' ');
const meter = (v: number) => `<span class="cl-snake hp" style="--v:${Math.max(0, Math.min(1, v)).toFixed(3)}"><i></i></span>`;

/** A standing building's HP for its tooltip: the points, and what a Damaged stand still pours. */
function hpTip(s: GameState, plotId: string): string {
  const ps = s.plots[plotId];
  const what = ps.stand ? standLevel(ps.stand).name : FACILITIES[ps.facility!.kind].names[ps.facility!.level - 1];
  const hp = `${what}: ${n0(currentHp(ps))}/${n0(buildingHp(ps))} HP`;
  if (!isDamaged(ps)) return hp;
  if (!ps.stand) return `${hp}. Damaged until repaired`;
  const full = standLevel(ps.stand).capacityPerHour;
  return `${hp}. Damaged: pours ${hpCapacity(ps, full)} of ${full} cups an hour until repaired`;
}

/** Your Damaged building's fix: Repair $X (a blocked one says why), or a note once tonight's repair is booked. */
function repairButton(s: GameState, plotId: string, cls = 'cl-b tiny go'): string {
  const ps = s.plots[plotId];
  if (ps.owner !== 'player') return '';
  if (ps.repair) return `<span class="cl-note good" title="Paid ${whole(ps.repair.cost)}: good as new at dawn">Fixing tonight</span>`;
  if (!isDamaged(ps)) return '';
  const b = canRepair(s, plotId);
  return `<button class="${cls}" data-action="repair" data-plot="${plotId}" data-testid="repair-hp" ${b.ok ? 'title="Fixed overnight: good as new at dawn"' : `disabled title="${esc(b.why)}"`}>Repair ${whole(repairCost(s, plotId))}</button>`;
}

/** Auto-Repair's switch on a plot of yours with a building (Rank 3 on): on, or this plot skipped. */
export function autoRepairToggle(s: GameState, plotId: string): string {
  const ps = s.plots[plotId];
  if (ps?.owner !== 'player' || !(ps.stand || ps.facility) || !autoRepairOn(s)) return '';
  const on = !ps.noAutoRepair;
  const tip = on ? 'Fixed overnight by itself. Tap to skip this plot' : 'Auto-Repair skips this plot. Tap to turn it on';
  return `<button class="cl-toggle${on ? ' on' : ''}" data-action="autoRepair" data-plot="${plotId}" data-testid="auto-repair" aria-pressed="${on}" title="${tip}"><i></i>Auto-Repair</button>`;
}

/** The stand panel's card (the Defend tab, beside the fence that guards it): the selected stand's HP meter, its points in
 * the tooltip, the repair once it is Damaged, and its Auto-Repair switch. */
export function damageCard(s: GameState, plotId: string): string {
  const ps = s.plots[plotId];
  if (ps?.owner !== 'player' || !ps.stand || ps.stand.wrecked) return '';
  const pic = art(`stand${ps.stand.level}`, () => A.standSVG(ps.stand!.level));
  return `<div class="cl-card" data-testid="stand-hp" title="${esc(hpTip(s, plotId))}"><span class="cl-pic">${pic}</span><span class="cl-txt"><b>${esc(standLevel(ps.stand).name)}</b><i>${meter(hpShare(ps))}</i></span><span class="cl-acts">${repairButton(s, plotId, 'cl-b go')}${autoRepairToggle(s, plotId)}</span></div>`;
}

/** The plot card's HP row: a meter for any standing building, the repair on your Damaged one, and your Auto-Repair
 * switch. */
export function damageHere(s: GameState, plotId: string): string {
  const ps = s.plots[plotId];
  if (!(ps.stand || ps.facility)) return '';
  const auto = autoRepairToggle(s, plotId);
  if (ps.stand?.wrecked || ps.facility?.wrecked) return auto;
  return `<span class="cl-acts" data-testid="hp" title="${esc(hpTip(s, plotId))}">${meter(hpShare(ps))}${repairButton(s, plotId)}</span>${auto}`;
}

/** Feed tickets for your Damaged buildings: the HP left, Go There, and the repair. */
export function damageTickets(s: GameState): string[] {
  const out: string[] = [];
  for (const p of PLOTS) {
    const ps = s.plots[p.id];
    if (ps.owner !== 'player' || !isDamaged(ps)) continue;
    const pic = ps.stand ? art(`stand${ps.stand.level}`, () => A.standSVG(ps.stand!.level)) : art('bandage', A.bandageSVG);
    const go = `<button class="cl-b tiny" data-action="goto" data-plot="${p.id}">Go there</button>`;
    out.push(`<div class="cl-ticket" data-testid="damaged" title="${esc(`${p.name}. ${hpTip(s, p.id)}`)}">${pic}<b>${esc(place(p.id))}</b><span class="cl-acts">${meter(hpShare(ps))}${go}${repairButton(s, p.id)}</span></div>`);
  }
  return out;
}
