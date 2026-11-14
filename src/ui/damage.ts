// Damaged buildings on the HUD (spec: Stands, "Damage, repairs and rebuilds"). Any standing building's plot card, and
// the stand panel's Defend tab for the selected stand, show an HP meter with the exact points in its tooltip; your own
// Damaged ones get a Repair button with the price, or a note once tonight's repair is booked. Your smashed plots get a
// Rebuild button (Fix when Busted) the same way. Your Damaged and smashed buildings also get a ticket in the feed at
// Morning Prep and with the Evening's repairs. A Storm in the forecast gets a stock-light ticket at Morning Prep, and a
// Storm day keeps one up while the stands are open: the counter-play, Go There and the repair. A Hurricane gets its own
// ticket from 2 days ahead: when it hits, the counter-play, and the HP your hardest-hit building keeps; on its day, the
// repair. The health inspector's visit gets one from the day before: when, what would fail the stand, and the fixes.
// From Rank 3 each of your plots has an Auto-Repair switch (on unless you skip the plot). Plain controls on the HUD's
// existing classes; clicks go through the HUD's one listener (data-action="repair" and "rebuild" approve,
// "autoRepair" flips the switch, "goto" flies there).
import {
  autoRepairOn, autoRepairs, buildingHp, canRebuild, canRepair, clockText, cupsInStock, currentHp, eventDef, expressWindow, FACILITIES, fortifyKeeps,
  hpShare, hurricaneLoss, hurricaneOn, hurricaneToday, inspectionFault, inspectionOn, inspectionStock, isDamaged, isWrecked, lastRebuildDay, PLOT_BY_ID,
  PLOTS, pourRate, rebuildCost, rebuilding, repairCost, standLevel, STORM_DAMAGE, type GameState,
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

/** A standing building's HP for its tooltip: the points, and what a Damaged stand still pours of its full pour (an
 * Express Window's +30% counted, as pourRate counts it). */
function hpTip(s: GameState, plotId: string): string {
  const ps = s.plots[plotId];
  const what = ps.stand ? standLevel(ps.stand).name : FACILITIES[ps.facility!.kind].names[ps.facility!.level - 1];
  const hp = `${what}: ${n0(currentHp(ps))}/${n0(buildingHp(ps))} HP`;
  if (!isDamaged(ps)) return hp;
  if (!ps.stand) return `${hp}. Damaged until repaired`;
  const full = Math.round(standLevel(ps.stand).capacityPerHour * expressWindow(ps));
  return `${hp}. Damaged: pours ${pourRate(s, plotId)} of ${full} cups an hour until repaired`;
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

/** Auto-Repair's switch on a plot of yours with a building (Rank 3 on): on, or this plot skipped. Held on while its
 * district's Fortify policy keeps it on (your skip waits for the policy to end). */
export function autoRepairToggle(s: GameState, plotId: string): string {
  const ps = s.plots[plotId];
  if (ps?.owner !== 'player' || !(ps.stand || ps.facility) || !autoRepairOn(s)) return '';
  const held = fortifyKeeps(s, plotId);
  const on = autoRepairs(s, plotId);
  const tip = held ? 'Fortify keeps this on' : on ? 'Fixed overnight by itself. Tap to skip this plot' : 'Auto-Repair skips this plot. Tap to turn it on';
  return `<button class="cl-toggle${on ? ' on' : ''}" data-action="autoRepair" data-plot="${plotId}" data-testid="auto-repair" aria-pressed="${on}"${held ? ' disabled' : ''} title="${tip}"><i></i>Auto-Repair</button>`;
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

/** Your worst-damaged building still to book a repair for (or the worst, once all are booked), among `hit`. */
function dueRepair(s: GameState, hit: string[]): string | undefined {
  const worst = [...hit].sort((a, b) => hpShare(s.plots[a]) - hpShare(s.plots[b]));
  return worst.find((id) => { const b = canRepair(s, id); return b.ok || b.why !== 'Fixing tonight'; }) ?? worst[0];
}

/**
 * The feed's Hurricane ticket (spec: Random events, "forecast 2 days ahead"), at Morning Prep and through the day. Coming:
 * when it hits, the counter-play, and your building it hurts most, the meter showing the HP it keeps (a Fortified Frame
 * fitted at Morning Prep keeps more), with Go There. Once it has hit: how many of your buildings it dented, and Go There
 * and the repair for the worst one still to book.
 */
export function hurricaneTicket(s: GameState): string[] {
  const e = hurricaneOn(s);
  if (!e || (s.phase !== 'prep' && s.phase !== 'open')) return [];
  const pic = art('hurricane', A.hurricaneSVG);
  const go = (id: string) => `<button class="cl-b tiny" data-action="goto" data-plot="${id}">Go there</button>`;
  const counter = eventDef(e)?.counter ?? '';
  if (s.phase === 'open' && hurricaneToday(s)) {
    const hit = PLOTS.filter((p) => s.plots[p.id].owner === 'player' && isDamaged(s.plots[p.id])).map((p) => p.id);
    const due = dueRepair(s, hit);
    const acts = due ? `<span class="cl-acts">${meter(hpShare(s.plots[due]))}${go(due)}${repairButton(s, due)}</span>` : '';
    const tip = `Hurricane today.${hit.length ? ` ${hit.length} of your buildings are Damaged. Repair by the Evening: good as new at dawn` : ''}`;
    return [`<div class="cl-ticket red" data-testid="hurricane" title="${esc(tip)}">${pic}<b>Hurricane</b><span class="cl-note">${esc(counter)}</span>${acts}</div>`];
  }
  const days = e.from - s.day;
  const when = days <= 0 ? 'Hurricane at the open' : days === 1 ? 'Hurricane tomorrow' : `Hurricane in ${days} days`;
  // Your standing building it hurts most: the lowest HP share left after the hit.
  const after = (id: string) => { const ps = s.plots[id]; return (currentHp(ps) - hurricaneLoss(ps)) / buildingHp(ps); };
  const worst = PLOTS.map((p) => p.id).filter((id) => s.plots[id].owner === 'player' && hurricaneLoss(s.plots[id]) > 0)
    .sort((a, b) => after(a) - after(b))[0];
  const keeps = worst ? ` ${place(worst)} keeps ${Math.round(after(worst) * 100)}% of its HP.` : '';
  const tip = `${when}: every building in the bay takes damage.${keeps} Fortified Frames at Morning Prep add 50% HP; repairs never cost more than a 15% rebuild`;
  const acts = worst ? `<span class="cl-acts">${meter(after(worst))}${go(worst)}</span>` : '';
  return [`<div class="cl-ticket red" data-testid="hurricane" title="${esc(tip)}">${pic}<b>${when}</b><span class="cl-note">${esc(counter)}</span>${acts}</div>`];
}

/**
 * The feed's Health Inspection ticket, from the morning the stand is named (the day before) to the visit: when the
 * inspector comes, the stand, what would fail it now (HP or stock, on the meter) and the fixes in reach: Go There, the
 * repair the day before (it is done by dawn) and, while the stands are open, Restock now. Once the inspector has been,
 * a stand that failed gets Closed until dawn, with its repair, and one that passed needs no ticket (the news says so).
 */
export function inspectionTicket(s: GameState): string[] {
  const e = inspectionOn(s);
  const id = e?.plots?.[0];
  const ps = id ? s.plots[id] : undefined;
  if (!e || !id || !ps || ps.owner !== 'player' || !ps.stand || s.phase === 'night') return [];
  const go = `<button class="cl-b tiny" data-action="goto" data-plot="${id}">Go there</button>`;
  const name = esc(place(id));
  const visit = ps.inspected?.day === s.day ? ps.inspected : undefined;
  if (visit) {
    if (!visit.fault) return [];
    const tip = `The health inspector closed ${PLOT_BY_ID[id].name}: ${visit.fault === 'damaged' ? 'not at full HP' : 'short of stock'}. It opens again at dawn`;
    return [`<div class="cl-ticket red" data-testid="inspection" title="${esc(tip)}">${art('inspect', A.inspectSVG)}<b>Closed until dawn</b><span class="cl-note">${name}</span><span class="cl-acts">${go}${repairButton(s, id)}</span></div>`];
  }
  if (e.live || ps.stand.wrecked) return [];
  const today = e.from === s.day;
  const when = today ? `Inspector at ${clockText(e.at ?? 0)}` : 'Inspector tomorrow';
  const fault = inspectionFault(s, id);
  const need = inspectionStock(s, id);
  const note = fault === 'damaged' ? (today ? 'Damaged: it fails' : 'Repair it today') : fault === 'stock' ? `Stock ${n0(need)} cups` : 'Ready';
  const gauge = fault === 'damaged' ? hpShare(ps) : Math.min(1, cupsInStock(s, id) / Math.max(1, need));
  const fix = fault === 'damaged' && !today ? repairButton(s, id)
    : fault === 'stock' && s.phase === 'open' ? `<button class="cl-b tiny go" data-action="restockNow" data-plot="${id}">Restock now</button>` : '';
  const tip = `A health inspector visits ${PLOT_BY_ID[id].name} ${today ? `at ${clockText(e.at ?? 0)}` : 'tomorrow'}. It passes at full HP with ${n0(need)} cups in stock (an hour's pour); otherwise it closes until dawn. Repairs run overnight`;
  return [`<div class="cl-ticket${fault ? ' red' : ''}" data-testid="inspection" title="${esc(tip)}">${art('inspect', A.inspectSVG)}<b>${when}</b><span class="cl-note">${name}: ${esc(note)}</span><span class="cl-acts">${meter(gauge)}${go}${fix}</span></div>`];
}

/** The feed's Storm ticket. Morning Prep with a Storm in the forecast: stock light, and your L1–L2 stands will want a
 * repair by the Evening. All Storm day long (the real weather, whatever the forecast said), like a random event's ticket:
 * the counter-play, and Go There and the repair for your worst-hit stand still to book, so the fix stays in reach. A
 * Hurricane on the way or today brings its own ticket first; its day's Storm has only that one. */
export function stormTicket(s: GameState): string[] {
  const coming = hurricaneTicket(s);
  return hurricaneToday(s) ? coming : [...coming, ...plainStorm(s)];
}

function plainStorm(s: GameState): string[] {
  const pic = art('storm', () => A.skySVG('storm'));
  if (s.phase === 'open' && s.weather.kind === 'storm') {
    const hit = PLOTS.filter((p) => stormProne(s, p.id) && isDamaged(s.plots[p.id])).map((p) => p.id);
    const due = dueRepair(s, hit);
    const who = hit.length === 1 ? 'Your L1–L2 stand took a beating' : `${hit.length} of your L1–L2 stands took a beating`;
    const tip = `Storm today: few customers.${hit.length ? ` ${who}. Repair by the Evening: good as new at dawn` : ''}`;
    const go = due ? `<span class="cl-acts">${meter(hpShare(s.plots[due]))}<button class="cl-b tiny" data-action="goto" data-plot="${due}">Go there</button>${repairButton(s, due)}</span>` : '';
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
