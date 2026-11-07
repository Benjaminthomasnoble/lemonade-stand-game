import { describe, expect, it } from 'vitest';
import {
  actOf, CLOSE, eliminate, hqPlot, migrateSave, newGame, pactHeadline, sleepUntilDawn, SYNDICATE_CALL, syndicateAtDawn, syndicateFormed,
  syndicateLeader, syndicateMembers, threatLevel, type Difficulty, type GameState, type Mode,
} from './economy.ts';

/** A run on Day 60 at a rank (Syndicate checks happen at dawn). */
function run(mode: Mode, difficulty: Difficulty, rank: number, extra: Partial<GameState['settings']> = {}): GameState {
  const s = newGame(7, { mode, difficulty, ...extra });
  s.day = 60;
  s.rank = rank;
  return s;
}
const formsAt = (mode: Mode, difficulty: Difficulty, rank: number, extra = {}) => {
  const s = run(mode, difficulty, rank, extra);
  syndicateAtDawn(s);
  return syndicateFormed(s);
};

describe('the Syndicate forms', () => {
  it('in Sandbox and Endless at Threat 5, Threat 4 on Cutthroat, Rank 9 on Laid Back (its Threat stops at 4)', () => {
    for (const mode of ['sandbox', 'endless'] as Mode[]) {
      expect([formsAt(mode, 'classic', 8), formsAt(mode, 'classic', 9)]).toEqual([false, true]);
      expect([formsAt(mode, 'custom', 8), formsAt(mode, 'custom', 9)]).toEqual([false, true]);
      expect([formsAt(mode, 'cutthroat', 6), formsAt(mode, 'cutthroat', 7)]).toEqual([false, true]);
      expect([formsAt(mode, 'laidback', 8), formsAt(mode, 'laidback', 9)]).toEqual([false, true]);
    }
    expect(threatLevel(run('sandbox', 'cutthroat', 7))).toBe(4);
    expect(threatLevel(run('sandbox', 'laidback', 10))).toBe(4);
    expect(formsAt('sandbox', 'classic', 10, { peaceful: true })).toBe(false); // no raids, no Syndicate
  });

  it('in the campaign two weeks into Act 5 on every difficulty, whatever the Threat', () => {
    for (const difficulty of ['laidback', 'classic', 'cutthroat'] as Difficulty[]) {
      const s = run('campaign', difficulty, 7);
      syndicateAtDawn(s);
      expect(syndicateFormed(s)).toBe(false); // Cutthroat's Threat 4 is the Sandbox rule
      s.rank = 9;
      expect(actOf(s)).toBe(5);
      syndicateAtDawn(s);
      expect(s.syndicate).toEqual({ act5: 60 });
      for (s.day = 61; s.day < 74; s.day++) { syndicateAtDawn(s); expect(syndicateFormed(s)).toBe(false); }
      syndicateAtDawn(s);
      expect(s.syndicate).toEqual({ act5: 60, formed: 74 });
    }
  });

  it('at dawn, from the night before, and once: Vera signs everyone up, the Bugle says so, and the save keeps it', () => {
    const s = run('sandbox', 'classic', 9);
    Object.assign(s, { phase: 'report', minute: CLOSE, raids: [] });
    expect(sleepUntilDawn(s)).toBe(true);
    expect(s.syndicate?.formed).toBe(61);
    const card = s.alerts!.find((a) => a.text === pactHeadline('sourwood'))!;
    expect(card).toMatchObject({ kind: 'note', plot: hqPlot('sourwood').id, day: 61 });
    expect(card.text).toBe('Bugle: PACT IS BACK: SOURWOOD SIGNS UP EVERYONE BUT THE KID');
    expect(s.news).toContain(`Vera: "${SYNDICATE_CALL}"`);
    expect(syndicateMembers(s)).toHaveLength(5);
    s.day++;
    syndicateAtDawn(s);
    expect(s.alerts!.filter((a) => a.text.startsWith('Bugle: PACT IS BACK'))).toHaveLength(1);
    expect(s.syndicate?.formed).toBe(61);
    expect(migrateSave(JSON.parse(JSON.stringify(s)))!.syndicate).toEqual({ formed: 61 });
    const old = JSON.parse(JSON.stringify(run('sandbox', 'classic', 3)));
    expect(migrateSave(old)!.syndicate).toBeUndefined(); // older saves: not formed, nothing to fill in
  });

  it('each rival you eliminate shrinks it; without Vera the biggest boss left signs them up', () => {
    const s = run('sandbox', 'classic', 9);
    eliminate(s, 'sourwood', 'bankrupt');
    eliminate(s, 'blenders', 'bankrupt');
    syndicateAtDawn(s);
    expect(syndicateLeader(s)).toBe('fizzco');
    expect(syndicateMembers(s)).toEqual(['hollis', 'fizzco', 'coldbrew']);
    expect(s.alerts!.some((a) => a.text === 'Bugle: PACT IS BACK: FIZZCO SIGNS UP EVERYONE BUT THE KID')).toBe(true);
    expect(s.news.some((n) => n.startsWith('Vera:'))).toBe(false);
    for (const id of ['hollis', 'fizzco', 'coldbrew'] as const) eliminate(s, id, 'bankrupt');
    expect(syndicateMembers(s)).toEqual([]);
    const late = run('sandbox', 'classic', 9);
    for (const id of Object.keys(late.rivals) as (keyof typeof late.rivals)[]) late.rivals[id].alive = false;
    syndicateAtDawn(late);
    expect(syndicateFormed(late)).toBe(false); // nobody left to sign up
  });
});
