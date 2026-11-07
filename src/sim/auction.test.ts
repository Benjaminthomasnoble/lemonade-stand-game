import { describe, expect, it } from 'vitest';
import {
  bidGuess, bidSteps, canBid, canBuyPlot, closeAuctions, eliminate, FACTIONS, hqPlot, newGame, newStand, NO_DEFENSE, offerSideLot,
  openAuction, ownedPlots, placeBid, PLOTS, sleepUntilDawn, withdrawBid, type DistrictId, type GameState, type Guard, type RivalId,
} from './economy.ts';

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
    expect(s.news.some((n) => n.startsWith('Preston Fizzwell III'))).toBe(true);
  });

  it('a tie goes to Lottie', () => {
    const { s, id } = downtownAuction(43);
    purse(s, { fizzco: 6000 }); // Grow budget: (6,000 − 2,000) × 55% = $2,200, so that is its bid
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
    expect(b.s.news.at(-1)).toContain('bounced');
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
