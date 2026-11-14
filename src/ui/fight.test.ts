import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fightFrame, fightStatus, finishFight, watchFights } from '../sim/fight.ts';
import { guardOf, henchmenOf } from '../sim/fighters.ts';
import { newGame, newStand, nightStep, ownedPlots, PLOT_BY_ID, PLOTS, type GameState, type Raid, type RivalId } from '../sim/economy.ts';
import { fightBar, type FightKit } from './fight.ts';

const kit: FightKit = { tape: (x) => x, ART: { raid: () => '', shield: () => '' } };

beforeEach(() => watchFights(true)); // as the game does: fights you're in play live
afterEach(() => watchFights(false));

/** Night at 23:00 and a raid on Lottie's Corner due at 23:01; `also` puts a second stand down the street with a raid
 * due the same minute. `guards`: that many on guard at the Corner, with hatchets and Pro Gear; `nerve`: the raiders'. */
function raidNight(also = false, { guards = 0, nerve = 50 } = {}): { s: GameState; second: string } {
  const s = newGame(41);
  Object.assign(s, { phase: 'night', minute: 23 * 60 });
  const home = ownedPlots(s, 'player')[0].id;
  s.guards = Array.from({ length: guards }, () => guardOf('hatchets', 'pro', 1, 'Smooth Talker', { post: home }));
  const second = PLOTS.find((p) => p.type === 'street' && p.district === PLOT_BY_ID[home].district && !s.plots[p.id].owner)!.id;
  const raid = (id: string, attacker: RivalId, target: string): Raid =>
    ({ id, attacker, target, objective: 'smash', party: henchmenOf(3, 1, 'fists').map((f) => ({ ...f, nerve })), detected: true, eta: '23:01', leave: 22 * 60, at: 23 * 60 + 1, launched: true, warned: true });
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

  it("shows each side's standing count against the mark where its one Nerve roll comes, yours first", () => {
    const { s } = raidNight(false, { guards: 2, nerve: 100 });
    const bar = fightBar(kit, s);
    expect(bar).toContain('<span class="cl-note" data-testid="fight-nerve-def">Yours 2/2 standing, breaks at 1</span>');
    expect(bar).toContain('<span class="cl-note" data-testid="fight-nerve-att">Theirs 3/3 standing, breaks at 2</span>');
    expect(bar.indexOf('fight-nerve-def')).toBeLessThan(bar.indexOf('fight-nerve-att'));
    // The first raider down brings their roll (Nerve 100: nobody runs), and their mark goes: no Rally can matter now.
    for (let i = 0; i < 400 && fightStatus(s)?.up.att === 3; i++) fightFrame(s, 0.25, false);
    const st = fightStatus(s)!;
    expect(st).toMatchObject({ up: { def: 2 }, nerveAt: { att: null, def: 1 } });
    expect(st.up.att).toBeGreaterThan(0);
    expect(fightBar(kit, s)).toContain(`<span class="cl-note" data-testid="fight-nerve-att">Theirs ${st.up.att}/3 standing</span>`);
    expect(fightBar(kit, s)).toContain('Yours 2/2 standing, breaks at 1');
  });

  it('says nothing of a next raid when none waits', () => {
    const { s } = raidNight();
    expect(s.fight?.raid.id).toBe('ra');
    expect(fightBar(kit, s)).toContain('data-testid="fight"');
    expect(fightBar(kit, s)).not.toContain('fight-next');
  });
});
