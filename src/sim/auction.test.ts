import { describe, expect, it } from 'vitest';
import {
  bidGuess, bidSteps, canBid, canBuyPlot, closeAuctions, FACTIONS, hqPlot, newGame, openAuction, placeBid, PLOTS, sleepUntilDawn,
  withdrawBid, type DistrictId, type GameState, type RivalId,
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
