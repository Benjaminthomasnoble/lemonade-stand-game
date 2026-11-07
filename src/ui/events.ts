// The random events in the clay HUD's feed (spec: Random events, "each alert card names its counter-play"): a ticket
// as each one starts, its counter-play under its name, and the buttons that play it (Go there, Restock now). A mid-day
// event's ticket stays for as long as it runs; a dawn event's for its first day (the Bugle keeps count after that).
// Kids' Lemonade Day adds a kid stand's Raid Planner to the plot card, its cost in red first.
import {
  canRaidKids, eventDef, eventWhere, ICE_MACHINE_LEVEL, KIDS_DAY, kidsDay, liveEvents, nearbyPlots, peaceful, PLOT_BY_ID, playerStands,
  type GameState, type WorldEvent,
} from '../sim/economy.ts';
import * as A from './clay.ts';
import { btn, esc, locked, once } from './recipes.ts';

const ART: Record<string, () => string> = {
  heatWave: once(() => A.skySVG('scorcher')), lemonBlight: once(() => A.lemonSourSVG()), sugarShortage: once(() => A.sugarSVG()),
  viralVideo: once(() => A.megaphoneSVG()), celebrity: once(() => A.rankSVG()), parade: once(() => A.crowdSVG()),
  roadworks: once(() => A.boardSVG()), touristBus: once(() => A.crowdSVG()), foodCritic: once(() => A.heartCupSVG()),
  powerOutage: once(() => A.lampSVG()), captainSquawk: once(() => A.gooseSVG()), kidsDay: once(() => A.standSVG(1)),
};
const fallback = once(() => A.boardSVG());

const mine = (s: GameState, plotId: string) => s.plots[plotId]?.owner === 'player' && !!s.plots[plotId].stand && !s.plots[plotId].stand!.wrecked;
const goTo = (plotId: string) => btn('goto', 'Go there', { ok: true }, `data-plot="${plotId}"`);
const restock = (plotId: string, label = 'Restock now') => btn('restockNow', label, { ok: true }, `data-plot="${plotId}"`, 'go');
const short = (plotId: string) => PLOT_BY_ID[plotId].name.replace(/ lot /, ' ');

/** Your stands an event touches: its stand, its street, or its district. */
function yourStandsIn(s: GameState, e: WorldEvent): string[] {
  const ids = playerStands(s).map((p) => p.id).filter((id) => mine(s, id));
  if (e.plots?.length) return ids.filter((id) => e.plots!.includes(id));
  return e.district ? ids.filter((id) => PLOT_BY_ID[id].district === e.district) : [];
}

/** The buttons that play an event. */
function acts(s: GameState, e: WorldEvent): string {
  const at = yourStandsIn(s, e);
  switch (e.id) {
    case 'viralVideo': return at.length ? goTo(at[0]) + restock(at[0]) : '';
    case 'parade': return at.slice(0, 2).map((id) => restock(id, at.length > 1 ? `Restock ${short(id)}` : 'Restock now')).join('');
    case 'foodCritic': case 'celebrity': case 'touristBus': case 'roadworks': return at.length ? goTo(at[0]) : '';
    case 'powerOutage': { // "Buy Market ice for those stands": the machine stands in the dark
      const dark = at.filter((id) => s.plots[id].stand!.level >= ICE_MACHINE_LEVEL).slice(0, 2);
      return dark.map((id) => restock(id, dark.length > 1 ? `Ice ${short(id)}` : 'Buy ice')).join('');
    }
    case 'captainSquawk': return at.length ? restock(at[0]) + btn('forgive', 'Forgive him', { ok: true }, `data-plot="${at[0]}"`) : '';
    case 'kidsDay': { const k = kidNextToYou(s, e); return k ? goTo(k) : ''; }
    default: return '';
  }
}

/** The first kid stand still up within 2 plots of one of your stands: the one taking your walkers. */
function kidNextToYou(s: GameState, e: WorldEvent): string | undefined {
  return e.kids?.find((k) => !e.raided?.includes(k) && nearbyPlots(PLOT_BY_ID[k]).some((q) => mine(s, q.id)));
}

/** The plot card's kid stand on Kids' Lemonade Day: its Raid Planner, the cost in red first (hidden while raids are locked). */
export function kidStandCard(s: GameState, plotId: string): string {
  const e = kidsDay(s);
  if (!e?.kids?.includes(plotId) || (s.phase !== 'prep' && s.phase !== 'open')) return ''; // packed up at dusk
  if (e.raided?.includes(plotId)) return '<span class="cl-note bad" data-testid="kid-stand">Kid stand raided</span>';
  const b = canRaidKids(s, plotId);
  const open = !locked(b) && !peaceful(s);
  const cost = open ? `<span class="cl-note bad" data-testid="kid-cost">−${KIDS_DAY.stars}★, front page, Lottie's respect</span>` : '';
  const raid = open ? `<div class="cl-acts">${btn('kidRaid', 'Raid the kid stand', b, `data-plot="${plotId}" data-testid="kid-raid"`)}</div>` : '';
  return `<div class="cl-planner" data-testid="kid-stand" title="${esc(eventDef(e)!.counter)}">${cost}<b>${A.standSVG(1)}Kid stand</b>`
    + `<span class="cl-note">$${KIDS_DAY.price.toFixed(2)} a cup, until dusk</span>${raid}</div>`;
}

/** Is this event's ticket still up? */
function showing(s: GameState, e: WorldEvent): boolean {
  const d = eventDef(e)!;
  return d.when === 'midday' ? !d.over?.(s, e) : e.from === s.day;
}

/** The feed's event tickets, in Morning Prep and through the day. */
export function eventTickets(s: GameState): string[] {
  if (s.phase !== 'prep' && s.phase !== 'open') return [];
  return liveEvents(s).filter((e) => showing(s, e)).map((e) => {
    const d = eventDef(e)!;
    const tone = d.kind === 'harmful' ? ' red' : d.kind === 'good' ? ' good' : '';
    const where = eventWhere(e);
    const left = e.to - Math.max(s.day, e.from) + 1;
    const when = left === 1 ? 'today' : `${left} days`;
    const a = acts(s, e);
    return `<div class="cl-ticket${tone}" data-testid="event" data-event="${e.id}" title="${esc(d.headline(s, e))}">${(ART[e.id] ?? fallback)()}<b>${esc(d.name)}</b>`
      + `<span class="cl-note">${esc(`${where}, ${when}`)}</span><span class="cl-note">${esc(d.counter)}</span>${a ? `<span class="cl-acts">${a}</span>` : ''}</div>`;
  });
}
