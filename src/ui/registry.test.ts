import { describe, expect, it } from 'vitest';
import {
  grantPage, LAVENDER_LOT, LESSON_DAY, listPlot, LOTTIES_CORNER, newGame, NO_DEFENSE, openAuction, openLavender, placeBid, PLOT_BY_ID, plotBuyoutPrice, plotPrice,
  PLOTS, purchasablePlots, recipeCost, type DistrictId, type GameState,
} from '../sim/economy.ts';
import {
  controlNote, landTickets, listingControls, registryButton, registryOpen, registryScreen, registryTabs, sellPlotButton, TOWN_HALL, vacantNote,
} from './registry.ts';
import { menuScreen, menuUnlocked } from './menus.ts';
import { DEFAULT_OPTIONS } from '../settings.ts';

const give = (s: GameState, id: string) => { s.plots[id] = { ...s.plots[id], owner: 'player', stand: null, invested: 0, defense: NO_DEFENSE() }; };
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

describe('plot card land notes', () => {
  it('shows the tier, plots held and the next tier, with the effects in the tooltip', () => {
    const s = newGame(31);
    const maple = purchasablePlots('maple');
    expect(text(controlNote(s, LOTTIES_CORNER))).toBe('Foothold 1/12, 6 to Majority');
    for (const p of maple.slice(0, 8)) give(s, p.id);
    const html = controlNote(s, maple[0].id);
    expect(text(html)).toBe('Majority 8/12, 1 to Stronghold');
    expect(html).toContain('land 10% cheaper for you');
    expect(html).toContain('Full Control turns on Neighborhood Watch');
    for (const p of maple) give(s, p.id);
    expect(text(controlNote(s, maple[0].id))).toBe('Full Control 12/12 Neighborhood Watch is on');
  });

  it('names the plot to win back when a perk switched off', () => {
    const s = newGame(32);
    const maple = purchasablePlots('maple');
    for (const p of maple) give(s, p.id);
    s.control = { maple: 'full' };
    s.perksLost = ['neighborhoodWatch'];
    s.plots[maple[2].id].owner = 'fizzco';
    expect(text(controlNote(s, maple[0].id))).toContain(`Win back ${maple[2].name}`);
  });

  it('labels an owned plot with no building a Vacant Lot', () => {
    const s = newGame(33);
    const lot = PLOTS.find((p) => p.district === 'maple' && !s.plots[p.id].owner)!;
    expect(vacantNote(s, lot.id)).toBe('');
    give(s, lot.id);
    expect(text(vacantNote(s, lot.id))).toBe('Vacant Lot');
    expect(vacantNote(s, LOTTIES_CORNER)).toBe(''); // the stand sells
  });
});

describe('the Land Registry', () => {
  /** A Week 2 morning with cash to spend. */
  const week2 = (seed: number, rank = 2) => { const s = newGame(seed); s.day = 8; s.rank = rank; s.cash = 1e6; return s; };
  const buttons = (html: string, action: string) => [...html.matchAll(new RegExp(`<button[^>]*data-action="${action}"[^>]*>.*?</button>`, 'g'))].map((m) => m[0]);
  const plotOf = (tag: string) => /data-plot="([^"]+)"/.exec(tag)![1];
  const onTab = (html: string, tab: string) => html.includes(`cl-tab on" data-action="registry" data-tab="${tab}"`);

  it("opens with Week 2's land lesson as a menu (the Menus list and its key), from the Town Hall card and the In the Red ticket", () => {
    const s = newGame(50);
    const lot = purchasablePlots('maple').find((p) => !s.plots[p.id].owner)!.id;
    const list = () => menuScreen(s, 'index', { head: ['', ''], goals: [], crew: () => '', options: DEFAULT_OPTIONS });
    expect(registryOpen(s)).toBe(false);
    expect(menuUnlocked(s, 'registry')).toBe(false); // For Sale signs do the buying until then
    expect(list()).not.toContain('data-menu="registry"');
    expect(registryButton(s)).toBe('');
    give(s, lot);
    expect(listingControls(s, lot)).toBe(''); // selling opens with the Registry
    expect(sellPlotButton(s)).toBe('');
    s.plots[lot].owner = null;
    s.day = LESSON_DAY.land;
    expect(registryOpen(s)).toBe(true);
    expect(menuUnlocked(s, 'registry')).toBe(true);
    expect(list()).toContain('Land Registry <b>M</b>');
    expect(registryButton(s)).toContain('data-action="registry"');
    expect(PLOT_BY_ID[TOWN_HALL].name).toBe('Town Hall and Registry');
    expect(sellPlotButton(s)).toBe(''); // only Lottie's Corner, which stays in the family
    give(s, lot);
    expect(sellPlotButton(s)).toContain('data-tab="mine"');
    expect(listingControls(s, lot)).toContain('data-testid="list-plot"');
    expect(registryOpen(newGame(50, { lessons: false }))).toBe(true); // lessons off: open from Day 1
  });

  it('For Sale lists every plot you can buy now, at the For Sale sign price, and hides districts locked by rank', () => {
    const s = week2(51);
    const html = registryScreen(s, 'buy');
    const buys = buttons(html, 'buyPlot');
    const ids = buys.map(plotOf);
    const open = (d: DistrictId) => purchasablePlots(d).filter((p) => !s.plots[p.id].owner && !s.plots[p.id].auction).map((p) => p.id);
    expect(new Set(ids)).toEqual(new Set([...open('maple'), ...open('oldtown')]));
    for (const tag of buys) expect(tag).toContain(`Buy $${plotPrice(s, plotOf(tag)).toLocaleString('en-US')}`);
    expect(ids).not.toContain(LOTTIES_CORNER);
    expect(html).not.toContain('Downtown'); // Rank 3 land stays hidden
    const maple = ids.filter((id) => id.startsWith('maple')).map((id) => plotPrice(s, id));
    expect(maple).toEqual([...maple].sort((a, b) => a - b)); // cheapest first
  });

  it('says when a district needs a Foothold next door, and lists First Dibs and Fire Sale plots first with their deadline', () => {
    const s = week2(52, 3);
    expect(text(registryScreen(s, 'buy'))).toMatch(/Hilltop Estates .*\d+ more plots? Foothold next door first/);
    // A Fire Sale plot in Hilltop: only Lottie may buy it, at 75%, for 2 days.
    const fire = purchasablePlots('hilltop')[0];
    s.plots[fire.id] = { owner: null, stand: null, invested: 0, landValue: 100000, defense: NO_DEFENSE(), dibs: { who: 'player', until: s.day + 1, price: 75000 } };
    const html = registryScreen(s, 'buy');
    const hilltop = html.slice(html.indexOf('Hilltop Estates'));
    expect(plotOf(buttons(hilltop, 'buyPlot')[0])).toBe(fire.id);
    expect(text(hilltop)).toContain(`${fire.name} Fire Sale to day ${s.day + 1} Buy $75,000`);
    expect(text(landTickets(s).join(''))).toContain('Fire Sale: 1 plot See them');
    // A rival's First Dibs after its smash: theirs today.
    const smashed = purchasablePlots('maple').find((p) => !s.plots[p.id].owner)!;
    s.plots[smashed.id].dibs = { who: 'fizzco', until: s.day };
    expect(text(registryScreen(s, 'buy'))).toContain(`${smashed.name} First Dibs: FizzCo Beverages`);
  });

  it('shows the Majority price on the button and the discount in its tooltip', () => {
    const s = week2(53);
    for (const p of purchasablePlots('maple').slice(0, 8)) give(s, p.id);
    const html = registryScreen(s, 'buy');
    const tag = buttons(html, 'buyPlot').find((b) => plotOf(b).startsWith('maple'))!;
    const id = plotOf(tag);
    expect(plotPrice(s, id)).toBe(Math.round(s.plots[id].landValue * 0.9));
    expect(tag).toContain('−10% for your Majority');
    expect(text(html)).toContain('Maple Row Majority 8/12');
  });

  it('shows Auctions only while one is open, with the bid buttons and your listings', () => {
    const s = week2(54);
    expect(registryTabs(s)).toEqual(['buy', 'mine']);
    const lot = purchasablePlots('oldtown').find((p) => !s.plots[p.id].owner)!;
    openAuction(s, lot.id, 'sale');
    const mine = purchasablePlots('maple').find((p) => !s.plots[p.id].owner)!;
    give(s, mine.id);
    listPlot(s, mine.id);
    expect(registryTabs(s)).toEqual(['buy', 'auctions', 'mine']);
    const html = registryScreen(s, 'auctions');
    expect(buttons(html, 'bid').map(plotOf)).toEqual([lot.id, lot.id, lot.id]);
    expect(buttons(html, 'unlistPlot').map(plotOf)).toEqual([mine.id]);
    expect(buttons(registryScreen(s, 'buy'), 'buyPlot').map(plotOf)).not.toContain(lot.id); // bid instead
    expect(text(landTickets(s).join(''))).toContain(`Auction: ${lot.name} See bids`);
    delete s.plots[lot.id].auction;
    delete s.plots[mine.id].auction;
    expect(onTab(registryScreen(s, 'auctions'), 'buy')).toBe(true); // all closed: back to For Sale
    expect(landTickets(s)).toEqual([]);
  });

  it('a lot or listing Town Hall froze shows the day its bids close', () => {
    const s = week2(58);
    const lot = purchasablePlots('oldtown').find((p) => !s.plots[p.id].owner)!;
    openAuction(s, lot.id, 'sale');
    const mine = purchasablePlots('maple').find((p) => !s.plots[p.id].owner)!;
    give(s, mine.id);
    listPlot(s, mine.id);
    expect(text(registryScreen(s, 'auctions'))).toContain('Auction: closes at dawn');
    s.schemes = [{ kind: 'freeze', by: 'sourwood', day: s.day, until: s.day + 2, plots: [lot.id, mine.id], cost: 0 }];
    const html = registryScreen(s, 'auctions');
    expect(text(html)).toContain(`Auction: closes day ${s.day + 3}`);
    expect(text(html)).toContain(`On the block: sells day ${s.day + 3}`);
    expect(html).toContain('Town Hall froze this sale');
  });

  it('shows the Lavender page on Auctions with its bid buttons, and a morning ticket while it runs', () => {
    const s = week2(57, 8);
    s.cash = 1e7;
    expect(registryTabs(s)).not.toContain('auctions');
    openLavender(s);
    expect(registryTabs(s)).toContain('auctions');
    const html = registryScreen(s, 'auctions');
    expect(text(html)).toContain('The Lavender page The Hilltop estate Auction: closes at dawn Skip: rivals bid ~$');
    expect(html).toContain(`Lavender Lemonade: $${recipeCost(s, 'lavender').toFixed(2)} a cup, +25% price`); // the book's numbers
    expect(buttons(html, 'bid').map(plotOf)).toEqual([LAVENDER_LOT, LAVENDER_LOT, LAVENDER_LOT]);
    expect(text(landTickets(s).join(''))).toContain('Lavender page auction See bids');
    placeBid(s, LAVENDER_LOT, 1_250_000);
    expect(text(registryScreen(s, 'auctions'))).toContain('Your bid: $1,250,000');
    delete s.lavender!.auction;
    expect(registryTabs(s)).not.toContain('auctions');
    // A page that came home some other way (a Sandbox fair win) leaves the lot and its ticket off at once.
    openLavender(s);
    grantPage(s, 'lavender');
    expect(registryTabs(s)).not.toContain('auctions');
    expect(landTickets(s)).toEqual([]);
  });

  it('Yours lists your deeds by district with control, Vacant Lots and Sell buttons', () => {
    const s = week2(55);
    const lot = purchasablePlots('maple').find((p) => !s.plots[p.id].owner)!;
    give(s, lot.id);
    const html = registryScreen(s, 'mine');
    expect(text(html)).toContain('2 plots, land');
    expect(text(html)).toContain('Maple Row Foothold 2/12');
    expect(text(html)).toContain(`${lot.name} Vacant Lot Sell from`);
    expect(buttons(html, 'listPlot').map(plotOf)).toEqual([lot.id]); // Lottie's Corner stays in the family
    listPlot(s, lot.id);
    expect(text(registryScreen(s, 'mine'))).toContain(`${lot.name} Vacant Lot On the block Take back`);
  });

  it('Rivals opens at Rank 4 with each rival plot at its Plot Buyout price, HQs left out', () => {
    const s = week2(56, 3);
    expect(registryTabs(s)).not.toContain('rivals');
    expect(onTab(registryScreen(s, 'rivals'), 'buy')).toBe(true); // a hidden tab falls back to For Sale
    s.rank = 4;
    expect(registryTabs(s)).toContain('rivals');
    const tags = buttons(registryScreen(s, 'rivals'), 'plotBuyout');
    const theirs = PLOTS.filter((p) => p.type !== 'hq' && s.plots[p.id].owner && s.plots[p.id].owner !== 'player');
    expect(tags.map(plotOf).sort()).toEqual(theirs.map((p) => p.id).sort());
    for (const tag of tags) expect(tag).toContain(`Buy it $${plotBuyoutPrice(s, plotOf(tag)).toLocaleString('en-US')}`);
  });
});
