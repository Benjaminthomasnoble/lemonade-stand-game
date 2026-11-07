import { describe, expect, it } from 'vitest';
import { GUARD_FEE, guardFighter, hqPlot, LOTTIES_CORNER, NABBED, newGame, type GameState, type Guard } from '../sim/economy.ts';
import { nabLeftBehind } from '../sim/captives.ts';
import { nextRandom } from '../sim/rng.ts';
import { btn, card, esc, locked, tape, whole } from './recipes.ts';
import { captivesPanel, heldNote } from './captives.ts';
import type { ClubKit } from './clubhouse.ts';

const kit: ClubKit = { ART: { house: () => '' }, btn, card, tape, locked, esc, whole, face: (_s, g) => `<face ${g.id}>` };
const nabbing = () => { let x = 1; while (nextRandom({ seed: x }) >= NABBED.chance) x++; return x; };
const pip = (): Guard => ({ id: 'g-pip', name: 'Pip Quill', trait: 'Sprinter', level: 2, xp: 3, weapon: 'clubs', gear: 'none', post: LOTTIES_CORNER, outUntil: 0, fee: 0 });

/** Rank 4 with Pip on the crew, and one Smoothie Bro (L3) nabbed off a beaten raid. */
function holding(): { s: GameState; id: string } {
  const s = newGame(8);
  s.rank = 4;
  s.cash = 5000;
  s.guards = [pip()];
  s.seed = nabbing();
  const [c] = nabLeftBehind(s, 'blenders', 'player', [{ id: 'bro', name: '', side: 'att', hp: 100, hit: 18, chop: 10, nerve: 50, armor: 0, weapon: 'clubs', level: 3 }], LOTTIES_CORNER);
  c.guard!.trait = 'Hothead';
  return { s, id: c.id };
}

describe('the Nabbed in the Crew tab', () => {
  it('shows nothing while nobody is held', () => {
    expect(captivesPanel(kit, newGame(8))).toBe('');
  });

  it('a raider you hold: Ransom for their hire fee, Let go, and Recruit', () => {
    const { s, id } = holding();
    const panel = captivesPanel(kit, s);
    expect(panel).toContain('<span class="cl-label">Nabbed</span>');
    expect(panel).toContain('data-testid="captive"');
    expect(panel).toContain('Smoothie Bro ');
    for (const [choice, label] of [['ransom', `Ransom ${whole(GUARD_FEE[2])}`], ['release', 'Let go'], ['recruit', 'Recruit']]) {
      expect(panel).toContain(`data-action="captive" data-id="${id}" data-choice="${choice}" data-testid="captive-${choice}" >${label}</button>`);
    }
  });

  it('a Loyal one shows it and has no Recruit; a full roster greys it; below the Hiring Hall it hides', () => {
    const { s } = holding();
    s.captives![0].guard!.trait = 'Loyal';
    expect(captivesPanel(kit, s)).toContain('Smoothie Bro · Loyal');
    expect(captivesPanel(kit, s)).not.toContain('captive-recruit');
    s.captives![0].guard!.trait = 'Hothead';
    s.guards.push({ ...pip(), id: 'g-2' });
    expect(captivesPanel(kit, s)).toContain('disabled title="No bed free"');
    s.guards.pop();
    s.rank = 1;
    expect(captivesPanel(kit, s)).not.toContain('captive-recruit');
  });

  it('a guard of yours a rival holds: Pay their hire fee, and the days it waits; the roster says who holds them', () => {
    const s = newGame(8);
    s.rank = 4;
    s.cash = 5000;
    const g = pip();
    s.guards = [g];
    s.seed = nabbing();
    nabLeftBehind(s, 'player', 'blenders', [guardFighter(g, 'att', true)], hqPlot('blenders').id);
    const panel = captivesPanel(kit, s);
    expect(panel).toContain(`Smoothie Bros hold Pip · ${NABBED.days + 1} days`);
    expect(panel).toContain(`data-choice="pay" data-testid="captive-pay" >Pay ${whole(GUARD_FEE[1])}</button>`);
    expect(panel).toContain('Unpaid, Pip joins them in 4 days.');
    s.cash = 10;
    expect(captivesPanel(kit, s)).toContain(`disabled title="Needs $${GUARD_FEE[1]}"`);
    expect(heldNote(s, g)).toBe(', held by The Boardwalk Blenders');
    expect(heldNote(s, { ...g, id: 'someone' })).toBe('');
  });
});
