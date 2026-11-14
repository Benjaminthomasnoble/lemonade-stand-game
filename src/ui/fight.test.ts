import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { finishFight, watchFights } from '../sim/fight.ts';
import { henchmenOf } from '../sim/fighters.ts';
import { newGame, newStand, nightStep, ownedPlots, PLOT_BY_ID, PLOTS, type GameState, type Raid, type RivalId } from '../sim/economy.ts';
import { fightBar, type FightKit } from './fight.ts';

const kit: FightKit = { tape: (x) => x, ART: { raid: () => '', shield: () => '' } };

beforeEach(() => watchFights(true)); // as the game does: fights you're in play live
afterEach(() => watchFights(false));

/** Night at 23:00 and a raid on Lottie's Corner due at 23:01; `also` puts a second stand down the street with a raid
 * due the same minute. */
function raidNight(also = false): { s: GameState; second: string } {
  const s = newGame(41);
  Object.assign(s, { phase: 'night', minute: 23 * 60 });
  const home = ownedPlots(s, 'player')[0].id;
  const second = PLOTS.find((p) => p.type === 'street' && p.district === PLOT_BY_ID[home].district && !s.plots[p.id].owner)!.id;
  const raid = (id: string, attacker: RivalId, target: string): Raid =>
    ({ id, attacker, target, objective: 'smash', party: henchmenOf(3, 1, 'fists'), detected: true, eta: '23:01', leave: 22 * 60, at: 23 * 60 + 1, launched: true, warned: true });
  s.raids.push(raid('ra', 'blenders', home));
  if (also) {
    s.plots[second] = { ...s.plots[second], owner: 'player', stand: newStand(1) };
    s.raids.push(raid('rb', 'coldbrew', second));
  }
  nightStep(s);
  return { s, second };
}

describe('the fight bar', () => {
  it('names the plot where the next raid on you waits its turn, and drops it once that one is in', () => {
    const { s, second } = raidNight(true);
    expect(s.fight?.raid.id).toBe('ra');
    expect(fightBar(kit, s)).toContain(`<span class="cl-note" data-testid="fight-next">Next: ${PLOT_BY_ID[second].name}</span>`);
    finishFight(s); // both fought: nothing on now
    expect(fightBar(kit, s)).toBe('');
  });

  it('says nothing of a next raid when none waits', () => {
    const { s } = raidNight();
    expect(s.fight?.raid.id).toBe('ra');
    expect(fightBar(kit, s)).toContain('data-testid="fight"');
    expect(fightBar(kit, s)).not.toContain('fight-next');
  });
});
