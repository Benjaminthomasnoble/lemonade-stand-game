import { describe, expect, it } from 'vitest';
import {
  announceControl, canBuyPlot, controlTier, development, hasFoothold, hqPlot, LOTTIES_CORNER, migrateSave, newGame, newStand, nextTier,
  NO_DEFENSE, perkActive, PLOTS, plotsForTier, purchasablePlots, sleepUntilDawn, type DistrictId, type GameState,
} from './economy.ts';

const street = (s: GameState, d: DistrictId) => PLOTS.find((p) => p.district === d && p.type === 'street' && !s.plots[p.id].owner)!;
/** Hand the player a plot outright (tests skip the buying). */
const give = (s: GameState, id: string) => { s.plots[id] = { ...s.plots[id], owner: 'player', stand: null, invested: 0, defense: NO_DEFENSE() }; };
const drop = (s: GameState, id: string) => { s.plots[id] = { ...s.plots[id], owner: null, stand: null, invested: 0, defense: NO_DEFENSE() }; };
/** Jump to the next dawn without playing the day. */
const dawn = (s: GameState) => { s.phase = 'report'; sleepUntilDawn(s); };

describe('where you can buy', () => {
  it('opens Old Town at Rank 2 with no border, even after losing every Maple plot', () => {
    const s = newGame(21);
    s.cash = 1e6;
    drop(s, LOTTIES_CORNER); // nothing left anywhere
    const ot = street(s, 'oldtown');
    expect(canBuyPlot(s, ot.id)).toEqual({ ok: false, why: 'Needs Rank 2, Corner Hustler' });
    s.rank = 2;
    expect(canBuyPlot(s, ot.id).ok).toBe(true);
    // Every other district waits for Rank 3 and a Foothold there or next door.
    expect(canBuyPlot(s, street(s, 'campus').id)).toEqual({ ok: false, why: 'Needs Rank 3, Block Boss' });
    s.rank = 3;
    expect(canBuyPlot(s, street(s, 'campus').id)).toEqual({ ok: false, why: 'Get a Foothold in a bordering district first' });
    give(s, ot.id);
    expect(canBuyPlot(s, street(s, 'campus').id).ok).toBe(true); // Campus borders Old Town
    expect(canBuyPlot(s, street(s, 'harbor').id).ok).toBe(false); // the Harbor needs Downtown or the Boardwalk first
    expect(canBuyPlot(s, street(s, 'hilltop').id).ok).toBe(false); // Hilltop needs Campus or Downtown first
    give(s, street(s, 'downtown').id);
    expect(canBuyPlot(s, street(s, 'harbor').id).ok).toBe(true);
    expect(canBuyPlot(s, street(s, 'hilltop').id).ok).toBe(true);
  });

  it('keeps the plain border rule in Sandbox: Old Town needs the start district first', () => {
    const s = newGame(22, { mode: 'sandbox' });
    s.cash = 1e6;
    s.rank = 2;
    drop(s, LOTTIES_CORNER);
    const ot = street(s, 'oldtown');
    expect(canBuyPlot(s, ot.id)).toEqual({ ok: false, why: 'Get a Foothold in a bordering district first' });
    expect(canBuyPlot(s, street(s, 'maple').id).ok).toBe(true); // the start district is always open
    give(s, street(s, 'maple').id);
    expect(canBuyPlot(s, ot.id).ok).toBe(true);
  });

  it('does not count a Trophy HQ on its own as a Foothold', () => {
    const s = newGame(23);
    s.cash = 1e6;
    s.rank = 9;
    drop(s, LOTTIES_CORNER);
    give(s, hqPlot('coldbrew').id); // the Grindhouse, in Campus & Arts
    expect(hasFoothold(s, 'player', 'campus')).toBe(false);
    expect(canBuyPlot(s, street(s, 'hilltop').id).ok).toBe(false); // Hilltop borders Campus, but there's no Foothold there
    give(s, street(s, 'campus').id);
    expect(hasFoothold(s, 'player', 'campus')).toBe(true);
    expect(canBuyPlot(s, street(s, 'hilltop').id).ok).toBe(true);
  });
});

describe('land prices', () => {
  it('counts purchasable plots only: twelve Kiosks lift Maple Row ×1.75, so Lottie\'s $300 corner is $525', () => {
    const s = newGame(24);
    expect(purchasablePlots('maple').length).toBe(12);
    for (const p of purchasablePlots('maple')) s.plots[p.id] = { ...s.plots[p.id], owner: 'player', stand: newStand(3) };
    expect(development(s, 'maple')).toBeCloseTo(36 / 48);
    dawn(s);
    expect(s.plots[LOTTIES_CORNER].landValue).toBe(525);
  });

  it('leaves the HQ out of the denominator but lets HQ land rise with its district', () => {
    const s = newGame(25);
    const campus = purchasablePlots('campus');
    expect(campus.length).toBe(13); // 14 plots, less the Grindhouse
    for (const p of campus) s.plots[p.id] = { ...s.plots[p.id], stand: newStand(2), facility: undefined };
    expect(development(s, 'campus')).toBeCloseTo(26 / 52);
    dawn(s);
    const hq = hqPlot('coldbrew');
    expect(s.plots[hq.id].landValue).toBe(Math.round(hq.baseLand * 1.5));
    const lot = campus.find((p) => p.type === 'street')!;
    expect(s.plots[lot.id].landValue).toBe(Math.round(lot.baseLand * 1.5));
  });
});

describe('district control', () => {
  const table: [DistrictId, number, number, number][] = [
    ['maple', 12, 7, 9], ['oldtown', 12, 7, 9], ['campus', 13, 7, 10], ['downtown', 17, 9, 13],
    ['boardwalk', 15, 8, 12], ['harbor', 14, 8, 11], ['groves', 15, 8, 12], ['hilltop', 9, 5, 7],
  ];
  it.each(table)('%s: %i purchasable plots, Majority at %i, Stronghold at %i', (d, total, majority, stronghold) => {
    const s = newGame(26);
    const plots = purchasablePlots(d);
    for (const p of plots) drop(s, p.id);
    expect(plots.length).toBe(total);
    expect([plotsForTier(d, 'majority'), plotsForTier(d, 'stronghold'), plotsForTier(d, 'full')]).toEqual([majority, stronghold, total]);
    const tierAt = (n: number) => { for (const p of plots) drop(s, p.id); for (const p of plots.slice(0, n)) give(s, p.id); return controlTier(s, d); };
    expect(tierAt(0)).toBe('none');
    expect(nextTier(s, d)).toEqual({ tier: 'foothold', at: 1, more: 1 });
    expect(tierAt(1)).toBe('foothold');
    expect(tierAt(majority - 1)).toBe('foothold');
    expect(nextTier(s, d)).toEqual({ tier: 'majority', at: majority, more: 1 });
    expect(tierAt(majority)).toBe('majority');
    expect(tierAt(stronghold - 1)).toBe('majority');
    expect(tierAt(stronghold)).toBe('stronghold');
    expect(tierAt(total - 1)).toBe('stronghold');
    expect(tierAt(total)).toBe('full');
    expect(nextTier(s, d)).toBeNull();
  });

  it('needs every purchasable plot, not the HQ, for Full Control', () => {
    const s = newGame(27);
    for (const p of purchasablePlots('campus')) give(s, p.id);
    expect(s.plots[hqPlot('coldbrew').id].owner).toBe('coldbrew');
    expect(controlTier(s, 'campus')).toBe('full');
    expect(perkActive(s, 'wordOfMouth')).toBe(true);
  });

  it('switches a perk on at Full Control and off the moment a plot is lost, with headlines', () => {
    const s = newGame(28);
    const plots = purchasablePlots('oldtown');
    for (const p of plots) give(s, p.id);
    expect(perkActive(s, 'townFavorite')).toBe(true);
    s.news = [];
    announceControl(s);
    expect(s.news.some((n) => n.startsWith('FULL CONTROL!') && n.includes('Town Favorite'))).toBe(true);
    drop(s, plots[3].id); // a lapse, a repossession or a sale
    expect(perkActive(s, 'townFavorite')).toBe(false);
    s.news = [];
    announceControl(s);
    expect(s.news.join(' ')).toContain(`Win back ${plots[3].name}`);
    expect(s.perksLost).toContain('townFavorite');
    give(s, plots[3].id);
    announceControl(s);
    expect(perkActive(s, 'townFavorite')).toBe(true);
    expect(s.perksLost).not.toContain('townFavorite');
    s.news = [];
    announceControl(s);
    expect(s.news).toEqual([]); // nothing changed, nothing to say
  });

  it('heralds a Majority won and lost', () => {
    const s = newGame(29);
    const plots = purchasablePlots('maple');
    for (const p of plots.slice(0, 7)) give(s, p.id);
    s.news = [];
    announceControl(s);
    expect(s.news).toEqual(['MAJORITY in Maple Row! Land there is 10% cheaper for Lottie now.']);
    for (const p of plots.slice(0, 7)) if (p.id !== LOTTIES_CORNER) { drop(s, p.id); break; }
    s.news = [];
    announceControl(s);
    expect(s.news).toEqual(["Lottie's Majority in Maple Row slips away."]);
  });

  it('remembers the tiers an older save already had, so loading it says nothing', () => {
    const s = newGame(30);
    for (const p of purchasablePlots('maple')) give(s, p.id);
    const old = JSON.parse(JSON.stringify(s)) as GameState;
    delete old.control;
    const back = migrateSave(old)!;
    expect(back.control?.maple).toBe('full');
    back.news = [];
    announceControl(back);
    expect(back.news).toEqual([]);
    expect(migrateSave(JSON.parse(JSON.stringify(back)))!.control).toEqual(back.control); // idempotent
  });
});
