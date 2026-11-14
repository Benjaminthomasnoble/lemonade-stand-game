import { describe, expect, it } from 'vitest';
import {
  answerBuyout, auctionCloses, auctionPlots, bidGuess, bidSteps, budgetOf, canBid, canBuyPlot, canListPlot, closeAuctions, eliminate, FACTIONS, grantPage, hqPlot, LAVENDER,
  LAVENDER_LOT, listPlot, LOTTIES_CORNER, newGame, grudgeToward, newStand, NO_DEFENSE, offerSideLot, openAuction, openLavender, outbid, ownedPlots, ownsRecipe, pageHolder,
  placeBid, PLOT_BY_ID, PLOTS, PRESTON_OUTBID, reserveOf, sleepUntilDawn, STAND_LEVELS, unlistPlot, withdrawBid,
  type DistrictId, type GameState, type Guard, type Order, type RivalId, type Scheme,
} from './economy.ts';
import { takeCall } from './phone.ts';

const RIVALS = Object.keys(FACTIONS) as RivalId[];
const street = (s: GameState, d: DistrictId) => PLOTS.find((p) => p.district === d && p.type === 'street' && !s.plots[p.id].owner)!;
/** Only these rivals have money; the rest sit this one out. */
const purse = (s: GameState, cash: Partial<Record<RivalId, number>>) => { for (const id of RIVALS) s.rivals[id].cash = cash[id] ?? 0; };
const dawn = (s: GameState) => { s.phase = 'report'; sleepUntilDawn(s); };

/** An auction on an unowned Downtown plot (FizzCo's home turf) with a round opening bid. */
function downtownAuction(seed: number) {
  const s = newGame(seed);
  s.cash = 1e6;
  const lot = street(s, 'downtown');
  s.plots[lot.id].landValue = 2000;
  openAuction(s, lot.id, 'sale');
  return { s, id: lot.id };
}

describe('sealed-bid auctions', () => {
  it('opens for 24 game hours from land value, and nobody buys at land value meanwhile', () => {
    const { s, id } = downtownAuction(40);
    expect(s.plots[id].auction).toEqual({ kind: 'sale', closes: s.day + 1, min: 2000 });
    expect(canBuyPlot(s, id)).toEqual({ ok: false, why: 'Up for auction: bid instead' });
    expect(bidSteps(s.plots[id].auction!)).toEqual([2000, 2500, 3000, 4000, 6000, 10000]);
    expect(canBid(s, id, 1999)).toEqual({ ok: false, why: 'Bids start at $2,000' });
    // Rich rivals shopping at dawn leave a plot on the block alone, however long it runs.
    s.plots[id].auction!.closes = s.day + 6;
    purse(s, { fizzco: 5e6, sourwood: 5e6 });
    for (let i = 0; i < 5; i++) dawn(s);
    expect(s.plots[id].owner).toBeNull();
    expect(s.plots[id].auction).toBeTruthy();
  });

  it('a high sealed bid wins at dawn, pays first price and stings the rivals it beat', () => {
    const { s, id } = downtownAuction(41);
    purse(s, { fizzco: 1e6 });
    expect(placeBid(s, id, 10000)).toBe(true);
    const cash = s.cash;
    s.day++;
    closeAuctions(s);
    expect(s.plots[id].owner).toBe('player');
    expect(s.plots[id].auction).toBeUndefined();
    expect(cash - s.cash).toBe(10000);
    expect(s.today.land).toBe(10000);
    expect(s.rivals.fizzco.grudge).toBe(10); // FizzCo always bids on its home turf, and lost
    expect(s.news.at(-1)).toContain('SOLD to Lottie');
  });

  it('FizzCo outbids a low bid on its home turf, and Preston phones to gloat', () => {
    const { s, id } = downtownAuction(42);
    purse(s, { fizzco: 1e6 });
    placeBid(s, id, 2000);
    const cash = s.cash, theirs = s.rivals.fizzco.cash;
    s.day++;
    closeAuctions(s);
    expect(s.plots[id].owner).toBe('fizzco');
    expect(s.cash).toBe(cash); // nothing paid for a losing bid
    const paid = theirs - s.rivals.fizzco.cash;
    expect(paid).toBeGreaterThan(2000 * 1.25); // at least +27% on its home turf
    expect(paid).toBeLessThanOrEqual(2000 * 1.81);
    expect(s.news.some((n) => n.includes('phones the Corner'))).toBe(false); // the phone rings, not the Bugle
    expect(takeCall(s)).toMatchObject({ who: 'fizzco', text: PRESTON_OUTBID, mood: 'gloat' });
    expect(PRESTON_OUTBID).toBe("Hold, please. I'm on the other line, buying your street.");
  });

  it("Skip sums up the lots you didn't bid on: what the rivals took and what goes back For Sale", () => {
    const { s, id } = downtownAuction(49);
    purse(s, { fizzco: 1e6 });
    const far = street(s, 'groves');
    s.plots[far.id].landValue = 1e7; // beyond FizzCo's Grow budget: nobody bids
    openAuction(s, far.id, 'sale');
    s.day++;
    closeAuctions(s);
    expect(s.plots[id].owner).toBe('fizzco');
    expect(s.plots[far.id].owner).toBeNull();
    const line = s.news.find((n) => n.startsWith('Skip Larkin: "Gavel\'s down.'))!;
    expect(line).toContain(`FizzCo Beverages take ${PLOTS.find((p) => p.id === id)!.name} for $`);
    expect(line).toContain(`No bids on ${far.name}: back For Sale at land value`);
    expect(s.phone?.queue ?? []).toEqual([]); // Preston only gloats when he beats your bid
  });

  it('an outbid rival holds a Grudge toward the winner, Lottie or another rival', () => {
    const s = newGame(39);
    const was = grudgeToward(s, 'hollis', 'fizzco');
    outbid(s, 'hollis', 'player');
    expect(s.rivals.hollis.grudge).toBe(10);
    outbid(s, 'hollis', 'fizzco');
    expect(s.rivals.hollis.grudge).toBe(10);
    expect(grudgeToward(s, 'hollis', 'fizzco')).toBe(was + 10);
  });

  it("rivals bid out of their Grow bucket, and the winner pays from it without denting tomorrow's takings", () => {
    const { s, id } = downtownAuction(56);
    purse(s, { fizzco: 1e6 });
    budgetOf(s, 'fizzco').grow = 1999; // under the opening bid: FizzCo sits it out, whatever cash it holds
    s.day++;
    closeAuctions(s);
    expect(s.plots[id].owner).toBeNull();
    openAuction(s, id, 'sale');
    budgetOf(s, 'fizzco').grow = 10000;
    const seen = s.rivals.fizzco.cashSeen!;
    s.day++;
    closeAuctions(s);
    expect(s.plots[id].owner).toBe('fizzco');
    const paid = 1e6 - s.rivals.fizzco.cash;
    expect(paid).toBeGreaterThanOrEqual(2000);
    expect(budgetOf(s, 'fizzco').grow).toBeCloseTo(10000 - paid, 2);
    expect(s.rivals.fizzco.cashSeen).toBeCloseTo(seen - paid, 2);
  });

  it('a rival sniping the lot tops your sealed bid by 5%, Strike paying the extra into Grow', () => {
    const { s, id } = downtownAuction(57);
    purse(s, { hollis: 1e6 });
    Object.assign(budgetOf(s, 'hollis'), { grow: 0, strike: 1e5 }); // Hollis has no Grow money for Downtown, but it is sniping this lot
    s.schemes = [{ kind: 'snipe', by: 'hollis', day: s.day, until: s.day + 1, plots: [id], cost: 0 }];
    placeBid(s, id, 4000);
    const cash = s.cash;
    s.day++;
    closeAuctions(s);
    expect(s.plots[id].owner).toBe('hollis');
    expect(s.cash).toBe(cash);
    expect(1e6 - s.rivals.hollis.cash).toBe(4200);
    expect(budgetOf(s, 'hollis')).toMatchObject({ grow: 0, strike: 1e5 - 4200 });
    expect(s.news.some((n) => n.includes('snipe') && n.endsWith('at the Registry'))).toBe(true);
    expect(s.news.some((n) => n.startsWith('Skip Larkin: "Outbid on') && n.includes('went to $4,200'))).toBe(true);
  });

  it('a sale Town Hall froze waits out the freeze with its sealed bids, and a snipe on the lot waits with it', () => {
    const { s, id } = downtownAuction(58);
    purse(s, { fizzco: 1e6 });
    placeBid(s, id, 10000);
    s.day++; // the dawn it was due, and Sourwood's Old Money froze the sale at Town Hall this morning
    const freeze: Scheme = { kind: 'freeze', by: 'sourwood', day: s.day, until: s.day + 2, plots: [id], cost: 0 };
    const snipe: Scheme = { kind: 'snipe', by: 'hollis', day: s.day - 1, until: s.day, plots: [id], cost: 0 };
    s.schemes = [freeze, snipe];
    const cash = s.cash, after = freeze.until + 1;
    closeAuctions(s);
    expect(s.plots[id].owner).toBeNull();
    expect(s.plots[id].auction).toMatchObject({ closes: after, bid: 10000 });
    expect(auctionCloses(s, id)).toBe(after);
    expect(snipe.until).toBe(after);
    expect(s.cash).toBe(cash);
    expect(s.news.at(-1)).toBe(`Skip Larkin: "Town Hall froze the sale of ${PLOT_BY_ID[id].name}. The gavel waits till dawn on day ${after}."`);
    expect(canBuyPlot(s, id).ok).toBe(false);
    s.day = after;
    closeAuctions(s);
    expect(s.plots[id].owner).toBe('player');
    expect(cash - s.cash).toBe(10000);
  });

  it('a lot frozen before its dawn already shows the later close', () => {
    const { s, id } = downtownAuction(59);
    expect(auctionCloses(s, id)).toBe(s.day + 1);
    s.schemes = [{ kind: 'freeze', by: 'sourwood', day: s.day, until: s.day + 2, plots: [id], cost: 0 }];
    expect(auctionCloses(s, id)).toBe(s.day + 3);
  });

  it('a tie goes to Lottie', () => {
    const { s, id } = downtownAuction(43);
    purse(s, { fizzco: 6000 });
    budgetOf(s, 'fizzco').grow = 2200; // FizzCo always bids on its home turf, up to its Grow bucket: $2,200
    placeBid(s, id, 2200);
    s.day++;
    closeAuctions(s);
    expect(s.plots[id].owner).toBe('player');
    expect(s.rivals.fizzco.cash).toBe(6000);
  });

  it('with no bids the plot goes back to the Registry, unowned, at land value', () => {
    const { s, id } = downtownAuction(44);
    purse(s, {});
    s.day++;
    closeAuctions(s);
    expect(s.plots[id].owner).toBeNull();
    expect(s.plots[id].auction).toBeUndefined();
    s.rank = 3;
    s.plots[street(s, 'oldtown').id].owner = 'player';
    expect(canBuyPlot(s, id).ok).toBe(true);
  });

  it('Family Silver takes 10% off a winning bid; a bid you can no longer cover bounces', () => {
    const a = downtownAuction(45);
    purse(a.s, {});
    a.s.plots[hqPlot('sourwood').id].owner = 'player';
    placeBid(a.s, a.id, 3000);
    const cash = a.s.cash;
    a.s.day++;
    closeAuctions(a.s);
    expect(cash - a.s.cash).toBe(2700);

    const b = downtownAuction(46);
    purse(b.s, {});
    placeBid(b.s, b.id, 3000);
    b.s.cash = 100; // spent it before dawn
    b.s.day++;
    closeAuctions(b.s);
    expect(b.s.plots[b.id].owner).toBeNull();
    expect(b.s.news.some((n) => n.includes('bid on') && n.includes('bounced'))).toBe(true);
    expect(b.s.news.at(-1)).toContain('back For Sale at land value');
  });

  it('only rivals still in the game bid, and Skip can tell when none can afford it', () => {
    const { s, id } = downtownAuction(47);
    purse(s, { fizzco: 1e6 });
    expect(bidGuess(s, id)).toBeGreaterThan(2000);
    s.rivals.fizzco.alive = false;
    expect(bidGuess(s, id)).toBe(0);
    s.day++;
    closeAuctions(s);
    expect(s.plots[id].owner).toBeNull();
  });

  it('lets you change or take back a sealed bid before dawn', () => {
    const { s, id } = downtownAuction(48);
    placeBid(s, id, 2000);
    placeBid(s, id, 3000);
    expect(s.plots[id].auction!.bid).toBe(3000);
    expect(withdrawBid(s, id)).toBe(true);
    expect(s.plots[id].auction!.bid).toBeUndefined();
    expect(canBid(s, id, 2e6)).toEqual({ ok: false, why: 'Needs $2,000,000 on hand at dawn' });
  });
});

describe('knock it down, buy it up: First Dibs, then the auction', () => {
  it('a rival plot you smashed: First Dibs for the day, then a 24-hour auction, then back to the Registry', () => {
    const s = newGame(50);
    const plot = PLOTS.find((p) => s.plots[p.id].owner === 'hollis' && s.plots[p.id].stand)!;
    const ps = s.plots[plot.id];
    ps.stand!.wrecked = true;
    ps.wreckedDay = s.day;
    ps.smashedBy = 'player';
    purse(s, {}); // nobody can rebuild or bid
    dawn(s);
    expect(s.plots[plot.id].owner).toBeNull();
    expect(s.plots[plot.id].dibs).toEqual({ who: 'player', until: s.day });
    expect(s.plots[plot.id].auction).toBeUndefined();
    dawn(s); // First Dibs unused
    expect(s.plots[plot.id].dibs).toBeUndefined();
    expect(s.plots[plot.id].auction).toEqual({ kind: 'sale', closes: s.day + 1, min: s.plots[plot.id].landValue });
    expect(s.news.some((n) => n.includes(`${plot.name} goes to sealed bids today`))).toBe(true);
    dawn(s); // no bids
    expect(s.plots[plot.id].auction).toBeUndefined();
    expect(s.plots[plot.id].owner).toBeNull();
  });

  it("your lapsed plot goes straight to auction when the rival that smashed it can't pay for First Dibs", () => {
    const s = newGame(52);
    const lot = PLOTS.find((p) => p.district === 'maple' && p.type === 'street' && !s.plots[p.id].owner)!;
    s.plots[lot.id] = { owner: 'player', stand: newStand(1), invested: 150, landValue: s.plots[lot.id].landValue, defense: NO_DEFENSE() };
    s.plots[lot.id].stand!.wrecked = true;
    s.plots[lot.id].wreckedDay = s.day;
    s.plots[lot.id].smashedBy = 'blenders';
    const guard: Guard = { id: 'gt', name: 'Test Guard', trait: 'Loyal', level: 1, xp: 0, weapon: 'fists', gear: 'none', post: lot.id, outUntil: 0, fee: 0 };
    s.guards.push(guard);
    purse(s, {});
    s.cash = 5000;
    dawn(s);
    expect(s.plots[lot.id].owner).toBe('player'); // still a day to rebuild
    dawn(s);
    expect(s.plots[lot.id].owner).toBeNull();
    expect(s.plots[lot.id].auction).toMatchObject({ kind: 'sale', closes: s.day + 1 });
    expect(guard.post).toBeNull(); // back to the Clubhouse
    expect(s.news.some((n) => n.includes(`${lot.name} goes to sealed bids today`))).toBe(true);
    expect(placeBid(s, lot.id, s.plots[lot.id].auction!.min)).toBe(true); // win it back
    dawn(s);
    expect(s.plots[lot.id].owner).toBe('player');
  });

  it('Fire Sale: 2 days of First Dibs at 75%, then each unsold plot goes to auction among the rivals still in', () => {
    const s = newGame(51);
    const theirs = ownedPlots(s, 'blenders').filter((p) => p.type !== 'hq');
    eliminate(s, 'blenders', 'bankrupt');
    const one = theirs[0];
    expect(s.plots[one.id].dibs).toEqual({ who: 'player', until: s.day + 1, price: Math.round(s.plots[one.id].landValue * 0.75) });
    expect(s.plots[one.id].stand).toBeNull(); // cleared of buildings
    expect(s.news.some((n) => n.startsWith('FIRE SALE') && n.endsWith('then they go to auction.'))).toBe(true);
    dawn(s);
    expect(s.plots[one.id].dibs).toBeTruthy();
    expect(s.plots[one.id].auction).toBeUndefined();
    dawn(s);
    expect(s.plots[one.id].auction).toEqual({ kind: 'fire', closes: s.day + 1, min: s.plots[one.id].landValue });
    expect(canBuyPlot(s, one.id).ok).toBe(false);
    dawn(s);
    for (const p of theirs) {
      expect(s.plots[p.id].auction).toBeUndefined();
      expect(s.plots[p.id].owner).not.toBe('blenders');
    }
  });

  it("a Faction Buyout plot at auction: the rivals bid for the building that comes with it, not bare land", () => {
    const s = newGame(53);
    const lot = ownedPlots(s, 'blenders').find((p) => p.type !== 'hq')!.id;
    s.plots[lot].stand = newStand(3);
    s.plots[lot].invested = 100_000; // a big building on modest land
    eliminate(s, 'blenders', 'buyout');
    const ps = s.plots[lot];
    expect(ps).toMatchObject({ invested: 0, kept: { invested: 100_000 } }); // bare on the map, the building kept for its buyer
    openAuction(s, lot, 'fire'); // First Dibs ran out
    purse(s, { fizzco: 1e7 });
    budgetOf(s, 'fizzco').grow = 1e7;
    const kept = ps.kept!;
    delete ps.kept;
    const bare = bidGuess(s, lot); // what the land alone would fetch
    ps.kept = kept;
    expect(bare).toBeLessThan(75_000);
    expect(bidGuess(s, lot)).toBeGreaterThanOrEqual(ps.landValue + 0.75 * 100_000); // and 75% of the building on top
  });

  it('a feud: a rival plot another rival smashed reaches auction like yours, and the Bugle says so', () => {
    const s = newGame(55);
    const plot = PLOTS.find((p) => s.plots[p.id].owner === 'hollis' && s.plots[p.id].stand)!;
    const ps = s.plots[plot.id];
    ps.stand!.wrecked = true;
    ps.wreckedDay = s.day;
    ps.smashedBy = 'blenders';
    purse(s, {}); // Hollis can't rebuild, and the Blenders can't pay for their First Dibs
    dawn(s);
    expect(s.plots[plot.id].owner).toBeNull();
    expect(s.plots[plot.id].auction).toMatchObject({ kind: 'sale', closes: s.day + 1 });
    expect(s.news.some((n) => n.includes(`${plot.name} goes to sealed bids today`))).toBe(true);
    s.cash = 1e6;
    expect(placeBid(s, plot.id, s.plots[plot.id].auction!.min)).toBe(true); // you can bid on it too
  });

  it('a rival that wins a bare lot opens a stand there within a few dawns; its bare Fields stay Fields', () => {
    const { s, id } = downtownAuction(43);
    purse(s, { fizzco: 1e6 });
    s.day++;
    closeAuctions(s);
    expect(s.plots[id]).toMatchObject({ owner: 'fizzco', stand: null, invested: 0 });
    const fields = PLOTS.filter((p) => s.plots[p.id].owner === 'hollis' && p.type === 'field' && !s.plots[p.id].stand && !s.plots[p.id].facility);
    for (let i = 0; i < 3 && !s.plots[id].stand; i++) dawn(s);
    expect(s.plots[id].owner).toBe('fizzco');
    expect(s.plots[id].stand?.level).toBe(1);
    expect(s.plots[id].invested).toBe(STAND_LEVELS[0].cost);
    for (const p of fields) expect(s.plots[p.id].stand).toBeNull(); // a Field is for Groves and Pads, never a stand
    // A smasher's First Dibs buy is bare too, and gets its stand the same way.
    const t = newGame(52);
    const lot = PLOTS.find((p) => p.district === 'maple' && p.type === 'street' && !t.plots[p.id].owner)!;
    t.plots[lot.id] = { owner: 'player', stand: newStand(1), invested: 150, landValue: t.plots[lot.id].landValue, defense: NO_DEFENSE() };
    Object.assign(t.plots[lot.id], { wreckedDay: t.day, smashedBy: 'blenders' });
    t.plots[lot.id].stand!.wrecked = true;
    purse(t, { blenders: 1e6 });
    budgetOf(t, 'blenders').grow = 1e5;
    for (let i = 0; i < 2; i++) dawn(t); // your day to rebuild runs out, and the Blenders buy it on First Dibs
    expect(t.plots[lot.id]).toMatchObject({ owner: 'blenders', stand: null });
    for (let i = 0; i < 3 && !t.plots[lot.id].stand; i++) dawn(t);
    expect(t.plots[lot.id].stand?.level).toBe(1);
    expect(t.plots[lot.id].stand!.wrecked).toBeFalsy();
  });

  it("rivals shopping at dawn leave First Dibs plots alone, and Lottie's side-lot offer just ends", () => {
    const s = newGame(53);
    const best = PLOTS.filter((p) => p.district === 'oldtown' && p.type === 'street' && !s.plots[p.id].owner).sort((a, b) => b.baseTraffic - a.baseTraffic)[0];
    s.plots[best.id].dibs = { who: 'player', until: s.day + 8 };
    purse(s, { fizzco: 5e6, sourwood: 5e6, hollis: 5e6, coldbrew: 5e6, blenders: 5e6 });
    s.day = 4; // rivals start buying land after Day 3
    for (let i = 0; i < 6; i++) dawn(s);
    expect(s.plots[best.id].owner).toBeNull();
    const t = newGame(54);
    t.day = 3;
    offerSideLot(t);
    const lot = PLOTS.find((p) => t.plots[p.id].dibs?.table)!;
    for (let i = 0; i < 7; i++) dawn(t);
    expect(t.plots[lot.id].dibs).toBeUndefined();
    expect(t.plots[lot.id].auction).toBeUndefined();
  });
});

describe('selling a plot', () => {
  /** Lottie's L2 stand on an Old Town plot, with a fence and a guard posted. */
  function stall(seed: number) {
    const s = newGame(seed);
    const lot = street(s, 'oldtown');
    s.plots[lot.id] = { owner: 'player', stand: newStand(2), invested: 550, landValue: 10000, defense: { tier: 1, fenceHp: 200, gadgets: [] } };
    const guard: Guard = { id: 'gs', name: 'Sale Guard', trait: 'Loyal', level: 1, xp: 0, weapon: 'fists', gear: 'none', post: lot.id, outUntil: 0, fee: 0 };
    s.guards.push(guard);
    return { s, id: lot.id, guard };
  }

  it('lists a plot for sealed bids from land value; the top rival bid pays Lottie and takes the plot, stand and fence', () => {
    const { s, id, guard } = stall(60);
    purse(s, { sourwood: 1e6, fizzco: 1e6, hollis: 1e6, coldbrew: 1e6, blenders: 1e6 }); // every rival has a Foothold in Old Town
    expect(listPlot(s, id)).toBe(true);
    expect(s.plots[id].auction).toEqual({ kind: 'listing', closes: s.day + 1, min: 10000 });
    expect(canBid(s, id, 20000).ok).toBe(false); // no bidding on your own plot
    const cash = s.cash;
    s.day++;
    closeAuctions(s);
    const buyer = s.plots[id].owner as RivalId;
    expect(buyer).not.toBe('player');
    expect(buyer).toBeTruthy();
    const paid = 1e6 - s.rivals[buyer].cash;
    expect(s.cash - cash).toBe(paid);
    expect(paid).toBeGreaterThanOrEqual(10000);
    expect(s.plots[id].stand?.level).toBe(2); // the building goes with the plot
    expect(s.plots[id].defense.tier).toBe(1);
    expect(guard.post).toBeNull();
    expect(s.news.at(-1)).toContain('SOLD!');
  });

  it('keeps the plot when nobody bids, and can be taken back before dawn', () => {
    const a = stall(61);
    purse(a.s, {});
    listPlot(a.s, a.id);
    a.s.day++;
    closeAuctions(a.s);
    expect(a.s.plots[a.id].owner).toBe('player');
    expect(a.s.plots[a.id].auction).toBeUndefined();
    expect(a.s.news.at(-1)).toContain('No takers');
    listPlot(a.s, a.id);
    expect(unlistPlot(a.s, a.id)).toBe(true);
    expect(a.s.plots[a.id].auction).toBeUndefined();
  });

  it("won't list Lottie's Corner, a Trophy or a smashed building", () => {
    const { s, id } = stall(62);
    expect(canListPlot(s, LOTTIES_CORNER)).toEqual({ ok: false, why: "Lottie's Corner stays in the family" });
    s.plots[hqPlot('blenders').id].owner = 'player';
    expect(canListPlot(s, hqPlot('blenders').id)).toEqual({ ok: false, why: 'A Trophy is never sold' });
    s.plots[id].stand!.wrecked = true;
    expect(canListPlot(s, id)).toEqual({ ok: false, why: 'Rebuild it first' });
  });

  it('a pad or pier with a VIP pickup booked stays yours until the pickup; a pending VIP offer there lapses when it sells', () => {
    const { s, id } = stall(64);
    purse(s, { sourwood: 1e6, fizzco: 1e6, hollis: 1e6, coldbrew: 1e6, blenders: 1e6 });
    const order: Order = { id: 'o1', tier: 'heli', client: 'Test Client', qty: 2000, pay: 6000, due: s.day + 2, expires: s.day + 1, plot: id, accepted: true };
    s.orders.push(order);
    expect(canListPlot(s, id)).toEqual({ ok: false, why: 'A pickup is booked here' });
    s.orders = [];
    listPlot(s, id);
    s.orders.push(order); // booked while it was on the block
    s.day++;
    closeAuctions(s);
    expect(s.plots[id].owner).toBe('player');
    expect(s.news.at(-1)).toContain('a pickup is booked there');
    s.orders = [];
    s.offers.push({ ...order, id: 'o2', accepted: false });
    listPlot(s, id);
    s.day++;
    closeAuctions(s);
    expect(s.plots[id].owner).not.toBe('player');
    expect(s.offers.some((o) => o.plot === id)).toBe(false);
  });

  it('a listing sold to FizzCo\'s buyout offer meanwhile leaves the Auctions list and clears at dawn', () => {
    const { s, id } = stall(65);
    purse(s, { fizzco: 1e6 });
    budgetOf(s, 'fizzco').grow = 1e5;
    listPlot(s, id);
    s.schemes = [{ kind: 'buyout', by: 'fizzco', day: s.day, until: s.day + 1, plots: [id], price: 20000, cost: 0 }];
    expect(answerBuyout(s, id, true)).toBe(true);
    expect(s.plots[id].owner).toBe('fizzco');
    expect(auctionPlots(s).some((p) => p.id === id)).toBe(false);
    const cash = s.cash;
    s.day++;
    closeAuctions(s);
    expect(s.plots[id].owner).toBe('fizzco');
    expect(s.plots[id].auction).toBeUndefined();
    expect(s.cash).toBe(cash);
  });

  it('a sale listed on the last day In the Red settles at dawn, before the deadline', () => {
    const { s, id } = stall(63);
    purse(s, { fizzco: 1e6, sourwood: 1e6, hollis: 1e6, coldbrew: 1e6, blenders: 1e6 });
    s.cash = -500;
    s.redDays = 3; // the third red dawn: one more and the Cookie Jar (or the end) comes
    s.cookieJar = ['act1'];
    listPlot(s, id);
    dawn(s);
    expect(s.plots[id].owner).not.toBe('player');
    expect(s.cash).toBeGreaterThan(0);
    expect(s.redDays).toBe(0);
    expect(s.outcome).toBeUndefined();
  });
});

describe('the Lavender page auction', () => {
  /** A Rank 8 morning in Act 5 with the page on the block and only these rivals able to bid. */
  function lavender(seed: number, cash: Partial<Record<RivalId, number>>) {
    const s = newGame(seed);
    s.rank = 8;
    s.story!.act = 5; // the campaign's auction opens Act 5 (a test shortcut: FizzCo still stands to bid)
    s.cash = 1e7;
    purse(s, cash);
    openLavender(s);
    return s;
  }
  const close = (s: GameState) => { s.day++; closeAuctions(s); };

  it('opens on the first dawn at Rank 8, once, for 24 game hours of sealed bids from its opening bid', () => {
    const s = newGame(70);
    s.story!.act = 5; // the Big Squeeze
    s.rank = 7;
    dawn(s);
    expect(s.lavender).toBeUndefined();
    s.rank = 8;
    dawn(s);
    expect(s.lavender?.auction).toEqual({ kind: 'page', closes: s.day + 1, min: LAVENDER.open });
    expect(s.news.some((n) => n.includes("Vera's old harp teacher") && n.includes('auctioning the Lavender page'))).toBe(true);
    expect(canBid(s, LAVENDER_LOT, LAVENDER.open - 1)).toEqual({ ok: false, why: 'Bids start at $1,000,000' });
    s.cash = 2e6;
    expect(placeBid(s, LAVENDER_LOT, 1_500_000)).toBe(true);
    expect(s.lavender?.auction?.bid).toBe(1_500_000);
    expect(withdrawBid(s, LAVENDER_LOT)).toBe(true);
    expect(s.lavender?.auction?.bid).toBeUndefined();
  });

  it('in the campaign it opens Act 5: Rank 8 in Act 4 waits for FizzCo Tower to fall; Sandbox and Endless go by rank alone', () => {
    const c = newGame(77);
    c.rank = LAVENDER.rank;
    c.story!.act = 4; // Rank 8 with FizzCo Tower still standing
    dawn(c);
    expect(c.story!.act).toBe(4);
    expect(c.lavender).toBeUndefined();
    c.rivals.fizzco.alive = false; // the Tower fell: Act 5 opens with the auction, that same morning
    dawn(c);
    expect(c.story).toMatchObject({ act: 5, since: c.day });
    expect(c.lavender?.auction).toEqual({ kind: 'page', closes: c.day + 1, min: LAVENDER.open });
    const act = c.news.findIndex((n) => n.startsWith('ACT 5'));
    expect(act).toBeGreaterThanOrEqual(0);
    expect(c.news.findIndex((n) => n.includes('auctioning the Lavender page'))).toBeGreaterThan(act); // the act's opening beat
    for (const mode of ['sandbox', 'endless'] as const) {
      const s = newGame(77, { mode });
      s.rank = LAVENDER.rank - 1;
      openLavender(s);
      expect(s.lavender, mode).toBeUndefined();
      s.rank = LAVENDER.rank; // Rank 8 alone, whatever act its rank reads as
      openLavender(s);
      expect(s.lavender?.auction, mode).toEqual({ kind: 'page', closes: s.day + 1, min: LAVENDER.open });
    }
  });

  it('the rivals push the winning bid to about $1,500,000', () => {
    const wins: number[] = [];
    for (let seed = 1; seed <= 200; seed++) {
      const s = lavender(seed, { fizzco: 5e6, sourwood: 5e6, hollis: 5e6, coldbrew: 5e6, blenders: 5e6 });
      close(s);
      wins.push(s.lavender!.paid!);
      expect(s.lavender!.winner).not.toBe('player');
    }
    const mean = wins.reduce((a, b) => a + b, 0) / wins.length;
    expect(mean).toBeGreaterThan(1_400_000);
    expect(mean).toBeLessThan(1_650_000);
    // Skip's read on the room says as much.
    expect(bidGuess(lavender(1, { fizzco: 5e6 }), LAVENDER_LOT)).toBe(1_500_000);
  });

  it('a winning bid buys the page at first price, 10% off with Family Silver, and stings the rivals it beat', () => {
    const s = lavender(71, { fizzco: 5e6, sourwood: 5e6 });
    s.plots[hqPlot('sourwood').id].owner = 'player'; // Family Silver (a test shortcut: Vera still bids)
    placeBid(s, LAVENDER_LOT, 2_000_000);
    const cash = s.cash;
    close(s);
    expect(s.lavender).toEqual({ winner: 'player', paid: 1_800_000 });
    expect(cash - s.cash).toBe(1_800_000);
    expect(s.rivals.fizzco.grudge).toBe(10);
    expect(s.rivals.sourwood.grudge).toBe(10);
    expect(s.news).toContain('Skip Larkin: "SOLD to Lottie\'s Lemonade! The Lavender page is yours for $1,800,000."');
    // Into Lottie's book: Lavender Lemonade to pour, and the morning's Bugle.
    expect(ownsRecipe(s, 'lavender')).toBe(true);
    expect(s.news.at(-1)).toContain('The Lavender page comes home');
    openLavender(s);
    expect(s.lavender?.auction).toBeUndefined(); // once a game
  });

  it("outbid: the page hangs in the winner's HQ, Preston phones, and it comes home when FizzCo falls", () => {
    const s = lavender(72, { fizzco: 5e6 });
    placeBid(s, LAVENDER_LOT, LAVENDER.open);
    const cash = s.cash;
    close(s);
    expect(s.cash).toBe(cash);
    expect(s.lavender!.winner).toBe('fizzco');
    expect(pageHolder(s, 'lavender')).toBe('fizzco');
    expect(ownsRecipe(s, 'lavender')).toBe(false);
    expect(s.lavender!.paid).toBeGreaterThan(LAVENDER.open);
    expect(s.rivals.fizzco.cash).toBe(5e6 - s.lavender!.paid!);
    expect(s.news.some((n) => n.startsWith('Skip Larkin: "Outbid on the Lavender page') && n.includes('It hangs in FizzCo Tower till they fall.'))).toBe(true);
    expect(s.phone!.queue).toContainEqual(expect.objectContaining({ who: 'fizzco', text: PRESTON_OUTBID, mood: 'gloat' }));
    openLavender(s);
    expect(s.lavender?.auction).toBeUndefined();
    eliminate(s, 'fizzco', 'buyout');
    expect(ownsRecipe(s, 'lavender')).toBe(true);
    expect(s.news.some((n) => n.startsWith('The Lavender page comes home'))).toBe(true);
  });

  it('with no bids the harp teacher runs it again the next day; a bid you can no longer cover bounces', () => {
    const s = lavender(73, {}); // no rival can raise $1,000,000
    dawn(s);
    expect(s.news.some((n) => n.includes('No bids on the Lavender page'))).toBe(true);
    expect(s.lavender?.auction).toEqual({ kind: 'page', closes: s.day + 1, min: LAVENDER.open });
    expect(s.lavender?.winner).toBeUndefined();
    s.cash = 2e6;
    placeBid(s, LAVENDER_LOT, LAVENDER.open);
    s.cash = 1000;
    close(s);
    expect(s.news.some((n) => n.includes('bid on the Lavender page bounced'))).toBe(true);
    expect(s.lavender?.winner).toBeUndefined();
    expect(pageHolder(s, 'lavender')).toBe('harpTeacher');
  });

  it('a rival outbid on the page holds a Grudge toward the rival that won it', () => {
    const s = lavender(75, { fizzco: 5e6, sourwood: 5e6 });
    const was = { fizzco: grudgeToward(s, 'fizzco', 'sourwood'), sourwood: grudgeToward(s, 'sourwood', 'fizzco') };
    close(s);
    const win = s.lavender!.winner as 'fizzco' | 'sourwood';
    const lost = win === 'fizzco' ? 'sourwood' : 'fizzco';
    expect(grudgeToward(s, lost, win)).toBe(was[lost] + 10);
  });

  it('rivals bid from their cash above the reserve, and pay out of Grow first, then what Guard and Strike set aside', () => {
    const short = lavender(76, {});
    short.rivals.fizzco.cash = LAVENDER.open + reserveOf(short, 'fizzco') - 1;
    close(short);
    expect(short.lavender?.winner).toBeUndefined(); // it won't dip into the cash it runs on
    const s = lavender(76, { fizzco: 2e6 });
    const b = budgetOf(s, 'fizzco');
    Object.assign(b, { grow: 500_000, guard: 500_000, strike: 500_000 });
    close(s);
    expect(s.lavender!.winner).toBe('fizzco');
    expect(s.rivals.fizzco.cash).toBe(2e6 - s.lavender!.paid!);
    expect(b.grow).toBe(0);
    expect(b.guard).toBe(b.strike);
    expect(b.guard + b.strike).toBeLessThanOrEqual(s.rivals.fizzco.cash - reserveOf(s, 'fizzco') + 0.01);
  });

  it('a page already in the book (a Sandbox fair win) calls the auction off and opens no other', () => {
    const s = lavender(74, { fizzco: 5e6 });
    s.cash = 2e6;
    placeBid(s, LAVENDER_LOT, LAVENDER.open);
    grantPage(s, 'lavender'); // the fair win, before the gavel
    expect(canBid(s, LAVENDER_LOT, LAVENDER.open)).toEqual({ ok: false, why: 'Already in your book' });
    const cash = s.cash, theirs = s.rivals.fizzco.cash;
    close(s);
    expect(s.cash).toBe(cash);
    expect(s.rivals.fizzco.cash).toBe(theirs);
    expect(s.lavender?.winner).toBeUndefined();
    expect(s.news).toContain('Skip Larkin: "The harp teacher calls it off: the Lavender page is already in your book."');
    dawn(s);
    expect(s.lavender?.auction).toBeUndefined();
  });
});
