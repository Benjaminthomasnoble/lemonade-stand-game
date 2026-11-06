import { describe, expect, it } from 'vitest';
import {
  acceptOrder, buildFacility, canBuildFacility, LOTTIES_CORNER, newGame, openStand, PLOTS, simulateRestOfDay, sleepUntilDawn,
  type GameState,
} from './economy.ts';

const day = (s: GameState) => { openStand(s); simulateRestOfDay(s); sleepUntilDawn(s); };

function vipGame(seed: number) {
  const s = newGame(seed);
  s.rank = 7;
  s.reputation = 4.5;
  s.cash = 3_000_000;
  // Hand the player a field, a dock and a street lot.
  const field = PLOTS.find((p) => p.type === 'field')!;
  const dock = PLOTS.find((p) => p.type === 'dock')!;
  const lot = PLOTS.find((p) => p.type === 'street' && !s.plots[p.id].owner && p.district === 'maple')!;
  for (const p of [field, dock, lot]) s.plots[p.id] = { ...s.plots[p.id], owner: 'player', stand: null };
  return { s, field, dock, lot };
}

describe('VIP clients', () => {
  it('facilities need the right land and rank', () => {
    const { s, field, dock, lot } = vipGame(1);
    expect(canBuildFacility(s, field.id, 'pier').ok).toBe(false);
    expect(buildFacility(s, field.id, 'helipad')).toBe(true);
    expect(buildFacility(s, dock.id, 'pier')).toBe(true);
    expect(buildFacility(s, lot.id, 'bottling')).toBe(true);
    expect(canBuildFacility(s, LOTTIES_CORNER, 'bottling').ok).toBe(false); // a stand is there
    s.rank = 5;
    expect(canBuildFacility(s, field.id, 'helipad')).toEqual({ ok: false, why: 'Needs Rank 7, Lemon Tycoon' });
  });

  it('helicopter and ship orders arrive, get bottled and pay out', () => {
    const { s, field, dock, lot } = vipGame(2);
    buildFacility(s, field.id, 'helipad');
    buildFacility(s, dock.id, 'pier');
    buildFacility(s, lot.id, 'bottling');
    buildFacility(s, lot.id, 'bottling');
    buildFacility(s, lot.id, 'bottling');
    let paid = 0, vip = 0;
    for (let d = 0; d < 30; d++) {
      for (const o of [...s.offers]) { acceptOrder(s, o.id); if (o.tier === 'heli' || o.tier === 'ship') vip++; }
      openStand(s);
      simulateRestOfDay(s);
      sleepUntilDawn(s);
      s.cash = Math.max(s.cash, 1_000_000);
      s.reputation = 4.5; // nobody is minding the stands in this test
    }
    expect(vip).toBeGreaterThan(1);
    paid = s.news.filter((n) => n.includes('picks up')).length;
    expect(paid).toBeGreaterThan(1);
    expect(s.lifetimeCups).toBeGreaterThan(2000);
  });

  it('an order with no bottles fails and costs a star', () => {
    const { s, field } = vipGame(3);
    buildFacility(s, field.id, 'helipad');
    s.orders.push({ id: 'x', tier: 'heli', client: 'test', qty: 5000, pay: 15000, due: s.day, expires: s.day, plot: field.id, accepted: true });
    const rep = s.reputation;
    day(s);
    expect(s.reputation).toBeLessThan(rep);
    expect(s.orders).toHaveLength(0);
  });
});
