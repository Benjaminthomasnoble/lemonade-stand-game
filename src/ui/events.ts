// The random events in the clay HUD's feed (spec: Random events, "each alert card names its counter-play"): a ticket
// as each one starts, its counter-play under its name, and the buttons that play it: Go there, and the move that answers
// it at your stand (Restock now, Buy ice, Fair price, an ad at a stand off the Roadworks, Send Sunny). A mid-day
// event's ticket stays for as long as it runs; a dawn event's for its first day (the Bugle keeps count after that).
// One ticket an event: the Hurricane and the health inspection have their own (src/ui/damage.ts), so none here.
// Kids' Lemonade Day adds a kid stand's Raid Planner to the plot card, its cost in red first.
import {
  CAMPAIGNS, canRaidKids, canRunCampaign, eventDef, eventWhere, HURRICANE_ID, ICE_MACHINE_LEVEL, INSPECTION_ID, KIDS_DAY, kidsDay, liveEvents,
  nearbyPlots, peaceful, PLOT_BY_ID, playerStands, PLOTS, priceCeiling, type CampaignId, type GameState, type WorldEvent,
} from '../sim/economy.ts';
import * as A from './clay.ts';
import { inspectionTicket, stormTicket } from './damage.ts';
import { btn, esc, locked, once } from './recipes.ts';

const ART: Record<string, () => string> = {
  heatWave: once(() => A.skySVG('scorcher')), lemonBlight: once(() => A.lemonSourSVG()), sugarShortage: once(() => A.sugarSVG()),
  viralVideo: once(() => A.megaphoneSVG()), celebrity: once(() => A.celebSVG()), parade: once(() => A.paradeSVG()),
  roadworks: once(() => A.coneSVG()), touristBus: once(() => A.busSVG()), foodCritic: once(() => A.heartCupSVG()),
  powerOutage: once(() => A.lampSVG()), captainSquawk: once(() => A.gullSVG()), kidsDay: once(() => A.standSVG(1)),
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

/** Where Go there takes you: your stand the event touches, else its stand or street, else a stand in its district, else
 * (a bay-wide event) the stand you have selected. */
function goal(s: GameState, e: WorldEvent, at: string[]): string {
  if (at.length) return at[0];
  if (e.plots?.length) return e.plots[0];
  const there = e.district ? PLOTS.filter((p) => p.district === e.district) : [];
  return there.find((p) => s.plots[p.id].stand)?.id ?? there[0]?.id ?? s.selected;
}
/** The stand a bay-wide event plays out at: the one you have selected, else your first. */
const selectedOrFirst = (s: GameState) => (mine(s, s.selected) ? s.selected : playerStands(s).map((p) => p.id).find((id) => mine(s, id)));

/** Roadworks: an ad at one of your stands off the dug-up street (the selected one first): a Sign kid at L1-L3, samples above. */
function adElsewhere(s: GameState, e: WorldEvent): string {
  const off = (id: string) => mine(s, id) && !e.plots?.includes(id);
  const plot = off(s.selected) ? s.selected : playerStands(s).map((p) => p.id).find(off);
  if (!plot) return '';
  const id: CampaignId = s.plots[plot].stand!.level <= (CAMPAIGNS.sandwichBoard.maxLevel ?? Infinity) ? 'sandwichBoard' : 'freeSamples';
  const b = canRunCampaign(s, id, plot);
  return locked(b) ? '' : btn('campaign', `Ad at ${short(plot)}`, b, `data-id="${id}" data-plot="${plot}"`, 'go');
}

/** Celebrity Sighting: Sunny the Lemon walks the star's district, sent from your first stand there. Only in Morning Prep,
 * when he walks today: booked during business hours he'd come tomorrow, after the star has gone. */
function sendSunny(s: GameState, at: string[]): string {
  const plot = at[0];
  if (!plot || s.phase !== 'prep') return '';
  const b = canRunCampaign(s, 'sunny', plot);
  return locked(b) ? '' : btn('campaign', 'Send Sunny', b, `data-id="sunny" data-plot="${plot}"`, 'go');
}

/** The buttons that play an event: Go there, and the move that answers it at your stand. */
function acts(s: GameState, e: WorldEvent): string {
  const at = yourStandsIn(s, e);
  const go = goTo(goal(s, e, at));
  const here = at[0] ?? (!e.plots?.length && !e.district ? selectedOrFirst(s) : undefined);
  const fix = here ? restock(here) : '';
  switch (e.id) {
    case 'parade': return go + at.slice(0, 2).map((id) => restock(id, at.length > 1 ? `Restock ${short(id)}` : 'Restock now')).join('');
    case 'roadworks': return go + adElsewhere(s, e);
    case 'celebrity': return go + (sendSunny(s, at) || fix); // "Send Sunny the Lemon"; once the day's begun, stock up for the crowd
    case 'foodCritic': { // "fair price": the critic's stand, selected and over its ceiling, goes back to it; else stock it to taste
      const p = at[0];
      if (!p) return go;
      const over = s.selected === p && s.plots[p].stand!.price > priceCeiling(s, p) + 1e-9;
      return go + (over ? btn('priceCeiling', 'Fair price', { ok: true }, '', 'go') : restock(p));
    }
    case 'powerOutage': { // "Buy Market ice for those stands": the machine stands in the dark
      const dark = at.filter((id) => s.plots[id].stand!.level >= ICE_MACHINE_LEVEL).slice(0, 2);
      return go + (dark.length ? dark.map((id) => restock(id, dark.length > 1 ? `Ice ${short(id)}` : 'Buy ice')).join('') : fix);
    }
    case 'captainSquawk': return go + (at.length ? restock(at[0]) + btn('forgive', 'Forgive him', { ok: true }, `data-plot="${at[0]}"`) : '');
    case 'kidsDay': { // the kid stand taking your walkers, and your stand next to it
      const k = kidNextToYou(s, e);
      const yours = k ? nearbyPlots(PLOT_BY_ID[k]).find((q) => mine(s, q.id))?.id : undefined;
      return k && yours ? goTo(k) + restock(yours) : go + fix;
    }
    default: return go + fix; // Heat Wave, Lemon Blight, Sugar Shortage, Viral Video, Tourist Bus
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
  const cost = open ? `<span class="cl-note bad" data-testid="kid-cost">−${KIDS_DAY.stars}${A.glyph('star')}, front page, Lottie's respect</span>` : '';
  const raid = open ? `<div class="cl-acts">${btn('kidRaid', 'Raid the kid stand', b, `data-plot="${plotId}" data-testid="kid-raid"`)}</div>` : '';
  return `<div class="cl-planner" data-testid="kid-stand" title="${esc(eventDef(e)!.counter)}">${cost}<b>${ART.kidsDay()}Kid stand</b>`
    + `<span class="cl-note">$${KIDS_DAY.price.toFixed(2)} a cup, until dusk</span>${raid}</div>`;
}

/** Is this event's ticket still up? */
function showing(s: GameState, e: WorldEvent): boolean {
  const d = eventDef(e)!;
  return d.when === 'midday' ? !d.over?.(s, e) : e.from === s.day;
}

/** Events with a ticket of their own in src/ui/damage.ts: it carries the warning, the hour, the result and the repair. */
const OWN_TICKET = new Set([HURRICANE_ID, INSPECTION_ID]);

/** The feed's event tickets, in Morning Prep and through the day. */
export function eventTickets(s: GameState): string[] {
  if (s.phase !== 'prep' && s.phase !== 'open') return [];
  return liveEvents(s).filter((e) => !OWN_TICKET.has(e.id) && showing(s, e)).map((e) => {
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

/** The feed's tickets for the calendar's events (hud.ts): the random events', then a Storm's or the Hurricane's, then
 * the health inspector's (src/ui/damage.ts). One ticket an event. */
export const eventFeed = (s: GameState): string[] => [...eventTickets(s), ...stormTicket(s), ...inspectionTicket(s)];
