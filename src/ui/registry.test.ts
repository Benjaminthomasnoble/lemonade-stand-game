import { describe, expect, it } from 'vitest';
import { LOTTIES_CORNER, newGame, NO_DEFENSE, PLOTS, purchasablePlots, type GameState } from '../sim/economy.ts';
import { controlNote, vacantNote } from './registry.ts';

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
