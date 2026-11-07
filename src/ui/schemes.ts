// Rival schemes on the HUD (spec: Rival marketing; How rivals think): a ticket in
// the left feed while a rival's price war runs near your stands or FizzCo's
// Cease-and-Desist blocks your ads in a district, and on the morning a
// smear-poster crew hits (with Free Sample Day, the spec's answer, one tap away),
// plus a note on the plot card of a stand in a price war or under a letter. Plain
// functional controls on the HUD's ticket styles; clicks go through the HUD's one
// listener (data-action).
import {
  canRunCampaign, CEASE, ceaseAndDesistIn, DISTRICT_BY_ID, PLOT_BY_ID, runningSchemes, SCHEMES, warAt, type GameState, type RivalId, type Scheme,
} from '../sim/economy.ts';
import * as A from './clay.ts';

/** Props are drawn once and reused, so renders compare equal and nothing flickers. */
const memo = new Map<string, string>();
const art = (key: string, f: () => string) => { let v = memo.get(key); if (v === undefined) { v = f(); memo.set(key, v); } return v; };
const ICON = { war: () => art('war', A.megaphoneSVG), sour: () => art('sour', A.lemonSourSVG), shield: () => art('shield', A.shieldSVG), basket: () => art('basket', A.crateSVG) };
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const btn = (action: string, label: string, extra = '', cls = 'tiny', why?: string) =>
  `<button class="cl-b ${cls}" data-action="${action}" ${extra} ${why ? `disabled title="${esc(why)}"` : ''}>${label}</button>`;
const pips = (n: number, of: number) => `<span class="cl-pips">${Array.from({ length: of }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`;
/** Short names for a ticket's one line. */
const SHORT: Record<RivalId, string> = { sourwood: 'Sourwoods', hollis: 'Hollis', fizzco: 'FizzCo', coldbrew: 'Cold Brew', blenders: 'Blenders' };
const CUT = `−${Math.round(SCHEMES.priceWar.cut * 100)}%`;
const place = (id: string) => PLOT_BY_ID[id].name;

function priceWar(s: GameState, war: Scheme): string {
  const left = war.until - s.day + 1;
  const tip = `${SHORT[war.by]} cut prices ${CUT.slice(1)} at ${war.plots.length} stand${war.plots.length === 1 ? '' : 's'} near yours, `
    + `${left} day${left === 1 ? '' : 's'} left. It costs them too: their Strike money pays the gap.`;
  return `<div class="cl-ticket red" data-testid="price-war" title="${esc(tip)}">${ICON.war()}<b>Price war! ${SHORT[war.by]} ${CUT}</b>
    <span class="cl-acts">${pips(left, SCHEMES.priceWar.days)}${btn('goto', 'Go there', `data-plot="${war.plots[0]}"`)}</span></div>`;
}

function posters(s: GameState, job: Scheme): string {
  const where = job.plots[0];
  if (job.caught) {
    return `<div class="cl-ticket good" data-testid="posters" title="${esc(`Your night watch caught Cold Brew's poster crew at ${place(where)}.`)}">${ICON.shield()}<b>Poster crew caught!</b></div>`;
  }
  // Free Sample Day wins the stars back (Rank 2, planned at Morning Prep): hidden while it's locked.
  const b = canRunCampaign(s, 'freeSamples');
  const samples = s.phase === 'prep' && !/Rank \d/.test(b.ok ? '' : b.why)
    ? btn('campaign', 'Free samples', 'data-id="freeSamples"', 'tiny go', b.ok ? undefined : b.why) : '';
  const tip = `Cold Brew's poster crew hit ${place(where)} last night: −${SCHEMES.posters.stars} star. Free samples win it back; floodlights catch night crews.`;
  return `<div class="cl-ticket red" data-testid="posters" title="${esc(tip)}">${ICON.sour()}<b>Smear posters! −${SCHEMES.posters.stars}★</b>
    <span class="cl-acts">${samples}${btn('goto', 'Go there', `data-plot="${where}"`)}</span></div>`;
}

/** FizzCo's letter: the district it blocks, days left, and Go There (the fruit basket stays with Lottie). */
function cease(s: GameState, letter: Scheme): string {
  const left = letter.until - s.day + 1;
  const name = DISTRICT_BY_ID[letter.district!].name;
  const tip = `FizzCo's Cease-and-Desist: your ads and campaigns count for nothing in ${name}, ${left} day${left === 1 ? '' : 's'} left. `
    + 'Advertise in the next district over. Lottie keeps the fruit basket.';
  return `<div class="cl-ticket red" data-testid="cease" title="${esc(tip)}">${ICON.basket()}<b>Ads blocked: ${esc(name)}</b>
    <span class="cl-acts">${pips(left, CEASE.days)}${btn('goto', 'Go there', `data-plot="${letter.plots[0]}"`)}</span></div>`;
}

/** The feed's scheme tickets: each price war and Cease-and-Desist running now, and this morning's posters. */
export function schemeTickets(s: GameState): string[] {
  const out: string[] = [];
  for (const x of runningSchemes(s)) {
    if (x.kind === 'priceWar') out.push(priceWar(s, x));
    else if (x.kind === 'cease' && x.district && ceaseAndDesistIn(s, x.district)) out.push(cease(s, x));
  }
  for (const x of s.schemes ?? []) if (x.kind === 'posters' && x.day === s.day) out.push(posters(s, x));
  return out;
}

/** A plot card's note: the stand is in a price war, its ads are blocked, or posters went up on your stand this morning. */
export function schemeNote(s: GameState, plotId: string): string {
  if (warAt(s, plotId)) return `<span class="cl-note bad">Price war ${CUT}</span>`;
  if (s.plots[plotId]?.owner === 'player' && ceaseAndDesistIn(s, PLOT_BY_ID[plotId].district)) return '<span class="cl-note bad">Ads blocked</span>';
  const hit = (s.schemes ?? []).some((x) => x.kind === 'posters' && x.day === s.day && !x.caught && x.plots.includes(plotId));
  return hit ? '<span class="cl-note bad">Smear posters</span>' : '';
}
