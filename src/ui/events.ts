// The random events in the clay HUD's feed (spec: Random events, "each alert card names its counter-play"): a ticket
// as each one starts, its counter-play under its name, and the buttons that play it (Go there, Restock now). A mid-day
// event's ticket stays for as long as it runs; a dawn event's for its first day (the Bugle keeps count after that).
import { eventDef, eventWhere, liveEvents, PLOT_BY_ID, playerStands, type GameState, type WorldEvent } from '../sim/economy.ts';
import * as A from './clay.ts';
import { btn, esc, once } from './recipes.ts';

const ART: Record<string, () => string> = {
  heatWave: once(() => A.skySVG('scorcher')), lemonBlight: once(() => A.lemonSourSVG()), sugarShortage: once(() => A.sugarSVG()),
  viralVideo: once(() => A.megaphoneSVG()), celebrity: once(() => A.rankSVG()), parade: once(() => A.crowdSVG()),
  roadworks: once(() => A.boardSVG()), touristBus: once(() => A.crowdSVG()), foodCritic: once(() => A.heartCupSVG()),
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
    default: return '';
  }
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
