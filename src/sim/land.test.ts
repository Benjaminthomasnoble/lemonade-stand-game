import { describe, expect, it } from 'vitest';
import {
  canBuyPlot, hasFoothold, hqPlot, LOTTIES_CORNER, newGame, NO_DEFENSE, PLOTS, type DistrictId, type GameState,
} from './economy.ts';

const street = (s: GameState, d: DistrictId) => PLOTS.find((p) => p.district === d && p.type === 'street' && !s.plots[p.id].owner)!;
/** Hand the player a plot outright (tests skip the buying). */
const give = (s: GameState, id: string) => { s.plots[id] = { ...s.plots[id], owner: 'player', stand: null, invested: 0, defense: NO_DEFENSE() }; };
const drop = (s: GameState, id: string) => { s.plots[id] = { ...s.plots[id], owner: null, stand: null, invested: 0, defense: NO_DEFENSE() }; };

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
