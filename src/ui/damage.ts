// Damaged buildings on the HUD (spec: Stands, "Damage, repairs and rebuilds"). Any standing building's card shows an
// HP meter, with the exact points in its tooltip; your own Damaged ones get a Repair button with the price, or a note
// once tonight's repair is booked. Your Damaged buildings also get a ticket in the feed at Morning Prep and with the
// Evening's repairs. Plain controls on the HUD's existing classes; clicks go through the HUD's one listener
// (data-action="repair" approves, "goto" flies there).
import {
  buildingHp, canRepair, currentHp, FACILITIES, hpCapacity, hpShare, isDamaged, PLOT_BY_ID, PLOTS, repairCost, standLevel,
  type GameState,
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
function repairButton(s: GameState, plotId: string): string {
  const ps = s.plots[plotId];
  if (ps.owner !== 'player') return '';
  if (ps.repair) return `<span class="cl-note good" title="Paid ${whole(ps.repair.cost)}: good as new at dawn">Fixing tonight</span>`;
  if (!isDamaged(ps)) return '';
  const b = canRepair(s, plotId);
  return `<button class="cl-b tiny go" data-action="repair" data-plot="${plotId}" data-testid="repair-hp" ${b.ok ? 'title="Fixed overnight: good as new at dawn"' : `disabled title="${esc(b.why)}"`}>Repair ${whole(repairCost(s, plotId))}</button>`;
}

/** The plot card's HP row: a meter for any standing building, and the repair on your Damaged one. */
export function damageHere(s: GameState, plotId: string): string {
  const ps = s.plots[plotId];
  if (!(ps.stand || ps.facility) || ps.stand?.wrecked || ps.facility?.wrecked) return '';
  return `<span class="cl-acts" data-testid="hp" title="${esc(hpTip(s, plotId))}">${meter(hpShare(ps))}${repairButton(s, plotId)}</span>`;
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
