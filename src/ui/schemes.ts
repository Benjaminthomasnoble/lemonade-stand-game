// Rival schemes on the HUD (spec: Rival marketing; How rivals think): a ticket in
// the left feed while a rival's price war runs near your stands, FizzCo's
// mascot (or, in Peaceful, any rival's ad campaign) blitzes a district where
// you trade, FizzCo's Cease-and-Desist blocks
// your ads in a district, FizzCo's buyout offer stands
// (Sell or No) or Town Hall holds a land sale frozen, and on the morning a
// smear-poster crew hits (with Free Sample Day, the spec's answer, one tap
// away), plus a note on the plot card. Plain functional controls on the HUD's
// ticket styles; clicks go through the HUD's one listener (data-action).
import {
  AD_BLITZ, adBlitzIn, canRunCampaign, canSellToFizzco, CEASE, ceaseAndDesistIn, DISTRICT_BY_ID, freezeOn, OLD_MONEY, offerOn, PLOT_BY_ID, postersAt, runningSchemes,
  SCHEMES, TAKEOVER, warAt, type GameState, type RivalId, type Scheme,
} from '../sim/economy.ts';
import * as A from './clay.ts';

/** Props are drawn once and reused, so renders compare equal and nothing flickers. */
const memo = new Map<string, string>();
const art = (key: string, f: () => string) => { let v = memo.get(key); if (v === undefined) { v = f(); memo.set(key, v); } return v; };
const ICON = { war: () => art('war', A.megaphoneSVG), sour: () => art('sour', A.lemonSourSVG), shield: () => art('shield', A.shieldSVG), basket: () => art('basket', A.crateSVG), bag: () => art('bag', A.moneyBagSVG), ice: () => art('ice', A.iceSVG), board: () => art('board', A.boardSVG) };
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const btn = (action: string, label: string, extra = '', cls = 'tiny', why?: string) =>
  `<button class="cl-b ${cls}" data-action="${action}" ${extra} ${why ? `disabled title="${esc(why)}"` : ''}>${label}</button>`;
const pips = (n: number, of: number) => `<span class="cl-pips">${Array.from({ length: of }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`;
/** Short names for a ticket's one line. */
const SHORT: Record<RivalId, string> = { sourwood: 'Sourwoods', hollis: 'Hollis', fizzco: 'FizzCo', coldbrew: 'Cold Brew', blenders: 'Blenders' };
const CUT = `−${Math.round(SCHEMES.priceWar.cut * 100)}%`;
const place = (id: string) => PLOT_BY_ID[id].name;
const whole = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

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
  // Free Sample Day at the stand they hit wins the stars back and takes the posters down (Rank 2, planned at Morning
  // Prep): hidden while it's locked.
  const b = canRunCampaign(s, 'freeSamples', where);
  const samples = s.phase === 'prep' && !/Rank \d/.test(b.ok ? '' : b.why)
    ? btn('campaign', 'Free samples', `data-id="freeSamples" data-plot="${where}"`, 'tiny go', b.ok ? undefined : b.why) : '';
  const tip = `Cold Brew's poster crew hit ${place(where)} last night: −${SCHEMES.posters.stars} star. Free samples there win it back; floodlights catch night crews.`;
  return `<div class="cl-ticket red" data-testid="posters" title="${esc(tip)}">${ICON.sour()}<b>Smear posters! −${SCHEMES.posters.stars}${A.glyph('star')}</b>
    <span class="cl-acts">${samples}${btn('goto', 'Go there', `data-plot="${where}"`)}</span></div>`;
}

/** An ad blitz (FizzCo's mascot; in Peaceful, any rival's): who, the district it works, days left, and Go There. */
function blitz(s: GameState, job: Scheme): string {
  const left = job.until - s.day + 1;
  const name = DISTRICT_BY_ID[job.district!].name;
  const who = job.by === 'fizzco' ? "FizzCo's mascot works" : `${SHORT[job.by]}'s ads work`;
  const tip = `${who} ${name}, ${left} day${left === 1 ? '' : 's'} left: +${Math.round(AD_BLITZ.traffic * 100)}% foot traffic at its stands there. `
    + 'Answer with your own marketing in the same district.';
  const go = job.plots[0] ? btn('goto', 'Go there', `data-plot="${job.plots[0]}"`) : '';
  return `<div class="cl-ticket red" data-testid="blitz" title="${esc(tip)}">${ICON.board()}<b>${SHORT[job.by]} blitz: ${esc(name)}</b>
    <span class="cl-acts">${pips(left, AD_BLITZ.days)}${go}</span></div>`;
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

/** FizzCo's buyout offer: the price, Sell (at Morning Prep) or No, and Go There. */
function buyout(s: GameState, offer: Scheme): string {
  const plot = offer.plots[0];
  const left = offer.until - s.day + 1;
  const b = canSellToFizzco(s, plot);
  const tip = `FizzCo offers ${whole(offer.price!)} for ${place(plot)} and what's on it, ${left} day${left === 1 ? '' : 's'} left. `
    + 'Sell and the cash is yours; say no and Preston takes it personally.';
  return `<div class="cl-ticket" data-testid="takeover" title="${esc(tip)}">${ICON.bag()}<b>FizzCo bids ${whole(offer.price!)}</b>
    <span class="cl-acts">${pips(left, TAKEOVER.days)}${btn('takeover', 'Sell', `data-plot="${plot}" data-sell="1"`, 'tiny go', b.ok ? undefined : b.why)}`
    + `${btn('takeover', 'No', `data-plot="${plot}" data-sell="0"`)}${btn('goto', 'Go there', `data-plot="${plot}"`)}</span></div>`;
}

/** Old Money: Town Hall holds a land sale frozen, days left and Go There. */
function freeze(s: GameState, job: Scheme): string {
  const plot = job.plots[0];
  const left = job.until - s.day + 1;
  const tip = `Town Hall froze the sale of ${place(plot)}, ${left} day${left === 1 ? '' : 's'} left: nobody can buy it. First Dibs you hold waits it out.`;
  return `<div class="cl-ticket red" data-testid="freeze" title="${esc(tip)}">${ICON.ice()}<b>Sale frozen: ${esc(place(plot))}</b>
    <span class="cl-acts">${pips(left, OLD_MONEY.freezeDays)}${btn('goto', 'Go there', `data-plot="${plot}"`)}</span></div>`;
}

/** The feed's scheme tickets: each price war, Cease-and-Desist, buyout offer and land freeze running now, and this morning's posters. */
export function schemeTickets(s: GameState): string[] {
  const out: string[] = [];
  for (const x of runningSchemes(s)) {
    if (x.kind === 'priceWar') out.push(priceWar(s, x));
    else if (x.kind === 'cease' && x.district && ceaseAndDesistIn(s, x.district)) out.push(cease(s, x));
    else if (x.kind === 'buyout' && offerOn(s, x.plots[0]) === x) out.push(buyout(s, x));
    else if (x.kind === 'freeze') out.push(freeze(s, x));
    else if (x.kind === 'blitz' && s.rivals[x.by].alive) out.push(blitz(s, x));
  }
  for (const x of s.schemes ?? []) if (x.kind === 'posters' && x.day === s.day) out.push(posters(s, x));
  return out;
}

/** A plot card's note: the stand is in a price war, its ads are blocked, an offer or freeze is on it, or posters are up. */
export function schemeNote(s: GameState, plotId: string): string {
  if (warAt(s, plotId)) return `<span class="cl-note bad">Price war ${CUT}</span>`;
  if (s.plots[plotId]?.owner === 'player' && ceaseAndDesistIn(s, PLOT_BY_ID[plotId].district)) return '<span class="cl-note bad">Ads blocked</span>';
  const owner = s.plots[plotId]?.owner;
  if (owner && owner !== 'player' && adBlitzIn(s, PLOT_BY_ID[plotId].district, owner as RivalId)) return `<span class="cl-note bad">Ad blitz +${Math.round(AD_BLITZ.traffic * 100)}%</span>`;
  const offer = offerOn(s, plotId);
  if (offer) return `<span class="cl-note">FizzCo bids ${whole(offer.price!)}</span>`;
  const frozen = freezeOn(s, plotId);
  if (frozen) return `<span class="cl-note bad">Frozen, thaws day ${frozen.until + 1}</span>`;
  return postersAt(s, plotId) ? '<span class="cl-note bad">Smear posters</span>' : '';
}
