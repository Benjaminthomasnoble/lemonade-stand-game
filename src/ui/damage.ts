// Damaged buildings on the HUD (spec: Stands, "Damage, repairs and rebuilds"). Any standing building's plot card, and
// the stand panel's Defend tab for the selected stand, show an HP meter with the exact points in its tooltip; your own
// Damaged ones get a Repair button with the price, or a note once tonight's repair is booked. Your smashed plots get a
// Rebuild button (Fix when Busted) the same way. Your Damaged and smashed buildings also get a ticket in the feed at
// Morning Prep and with the Evening's repairs. A Storm in the forecast gets a stock-light ticket at Morning Prep, and a
// Storm day keeps one up while the stands are open: the counter-play, Go There and the repair.
// From Rank 3 each of your plots has an Auto-Repair switch (on unless you skip the plot). Plain controls on the HUD's
// existing classes; clicks go through the HUD's one listener (data-action="repair" and "rebuild" approve,
// "autoRepair" flips the switch, "goto" flies there).
import {
  autoRepairOn, buildingHp, canRebuild, canRepair, currentHp, FACILITIES, hpCapacity, hpShare, isDamaged, isWrecked, lastRebuildDay,
  PLOT_BY_ID, PLOTS, rebuildCost, rebuilding, repairCost, standLevel, STORM_DAMAGE, type GameState,
} from '../sim/economy.ts';
import { taught } from '../sim/story.ts';
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

/** Your Damaged building's fix: Repair $X (a blocked one says why), or a note once tonight's repair is booked. Damage
 * after the booking (a Storm at the open) brings the button back to top it up. */
function repairButton(s: GameState, plotId: string, cls = 'cl-b tiny go'): string {
  const ps = s.plots[plotId];
  if (ps.owner !== 'player' || !isDamaged(ps)) return '';
  const b = canRepair(s, plotId);
  if (!b.ok && b.why === 'Fixing tonight') return `<span class="cl-note good" title="Paid ${whole(ps.repair?.cost ?? 0)}: good as new at dawn">Fixing tonight</span>`;
  const tip = !b.ok ? b.why : ps.repair ? 'Adds to tonight\'s repair: good as new at dawn' : 'Fixed overnight: good as new at dawn';
  return `<button class="${cls}" data-action="repair" data-plot="${plotId}" data-testid="repair-hp" ${b.ok ? '' : 'disabled '}title="${esc(tip)}">Repair ${whole(repairCost(s, plotId))}</button>`;
}

/** How long your smashed plot can wait: Busted ones wait for their fix; a Wrecked one lapses the day after the smash. */
function lapseTip(s: GameState, plotId: string): string {
  const ps = s.plots[plotId];
  if (ps.busted) return 'Busted: closed until you fix it';
  return lastRebuildDay(s, ps) ? 'Book it today or the plot goes For Sale' : 'Book it by tomorrow or the plot goes For Sale';
}

/** Your smashed building's rebuild (Busted: its fix): Rebuild $X (a blocked one says why), or a note once tonight's
 * rebuild is booked. */
export function rebuildButton(s: GameState, plotId: string, cls = 'cl-b tiny go', testid = 'rebuild'): string {
  const ps = s.plots[plotId];
  if (ps?.owner !== 'player' || !isWrecked(ps)) return '';
  if (rebuilding(ps)) return `<span class="cl-note good" title="Paid ${whole(ps.repair!.cost)}: open at dawn">${ps.busted ? 'Fixing tonight' : 'Rebuilding tonight'}</span>`;
  const b = canRebuild(s, plotId);
  const tip = !b.ok ? b.why : ps.busted ? 'Fixed overnight: open at dawn' : `Built overnight: open at dawn. ${lapseTip(s, plotId)}`;
  return `<button class="${cls}" data-action="rebuild" data-plot="${plotId}" data-testid="${testid}" ${b.ok ? '' : 'disabled '}title="${esc(tip)}">${ps.busted ? 'Fix' : 'Rebuild'} ${whole(rebuildCost(ps))}</button>`;
}

/** The plot card's note on a smashed building: Wrecked or Busted, and a rival's Rebuilding once it has booked one. */
export function wreckNote(s: GameState, plotId: string): string {
  const ps = s.plots[plotId];
  if (!isWrecked(ps)) return '';
  if (ps.owner !== 'player' && rebuilding(ps)) return '<span class="cl-note" title="Open again at dawn">Rebuilding</span>';
  return `<span class="cl-note bad">${ps.busted ? 'Busted' : 'Wrecked'}</span>`;
}

/** Feed tickets for your smashed plots: Go There, and the rebuild (or the fix), or tonight's booking. */
export function rebuildTickets(s: GameState, testid = 'rebuild'): string[] {
  const out: string[] = [];
  for (const p of PLOTS) {
    const ps = s.plots[p.id];
    if (ps.owner !== 'player' || !isWrecked(ps)) continue;
    const booked = rebuilding(ps);
    const go = `<button class="cl-b tiny" data-action="goto" data-plot="${p.id}">Go there</button>`;
    const tip = `${p.name}: ${ps.busted ? 'Busted' : 'Wrecked'}. ${booked ? 'Open again at dawn' : lapseTip(s, p.id)}`;
    out.push(`<div class="cl-ticket${booked ? '' : ' red'}" data-testid="wrecked" title="${esc(tip)}">${art('boom', A.boomSVG)}<b>${esc(place(p.id))}</b><span class="cl-acts">${go}${rebuildButton(s, p.id, 'cl-b tiny go', testid)}</span></div>`);
  }
  return out;
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

/** Your standing stands a Storm dents (L1–L2). */
const stormProne = (s: GameState, plotId: string) => {
  const ps = s.plots[plotId];
  return ps.owner === 'player' && !!ps.stand && !ps.stand.wrecked && ps.stand.level <= STORM_DAMAGE.maxLevel;
};

/** The feed's Storm ticket. Morning Prep with a Storm in the forecast: stock light, and your L1–L2 stands will want a
 * repair by the Evening. All Storm day long (the real weather, whatever the forecast said), like a random event's ticket:
 * the counter-play, and Go There and the repair for your worst-hit stand still to book, so the fix stays in reach. */
export function stormTicket(s: GameState): string[] {
  const pic = art('storm', () => A.skySVG('storm'));
  if (s.phase === 'open' && s.weather.kind === 'storm') {
    const hit = PLOTS.filter((p) => stormProne(s, p.id) && isDamaged(s.plots[p.id])).sort((a, b) => hpShare(s.plots[a.id]) - hpShare(s.plots[b.id]));
    const due = hit.find((p) => { const b = canRepair(s, p.id); return b.ok || b.why !== 'Fixing tonight'; }) ?? hit[0];
    const who = hit.length === 1 ? 'Your L1–L2 stand took a beating' : `${hit.length} of your L1–L2 stands took a beating`;
    const tip = `Storm today: few customers.${hit.length ? ` ${who}. Repair by the Evening: good as new at dawn` : ''}`;
    const go = due ? `<span class="cl-acts">${meter(hpShare(s.plots[due.id]))}<button class="cl-b tiny" data-action="goto" data-plot="${due.id}">Go there</button>${repairButton(s, due.id)}</span>` : '';
    return [`<div class="cl-ticket red" data-testid="storm" title="${esc(tip)}">${pic}<b>Storm</b><span class="cl-note">Stock light; repair L1–L2 stands</span>${go}</div>`];
  }
  if (s.phase !== 'prep' || s.forecast.kind !== 'storm' || !taught(s, 'forecast')) return []; // the forecast's lesson first
  const n = PLOTS.filter((p) => stormProne(s, p.id)).length;
  const hit = n === 1 ? 'Your L1–L2 stand loses a quarter of its HP at the open. Repair it by the Evening'
    : `Your ${n} L1–L2 stands lose a quarter of their HP at the open. Repair them by the Evening`;
  return [`<div class="cl-ticket" data-testid="storm" title="${esc(`Storm forecast: few customers.${n ? ` ${hit}` : ''}`)}">${pic}<b>Storm: stock light</b></div>`];
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
