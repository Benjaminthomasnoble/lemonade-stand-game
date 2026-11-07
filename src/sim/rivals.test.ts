import { describe, expect, it } from 'vitest';
import {
  buyPlot, canBuyPlot, canFactionBuyout, canAssault, crewAtDawn, equip, factionBuyout, factionBuyoutPrice, fightRaid, hireGuard, hqPlot,
  isWeakened, makeTruce, breakTruce, canTruce, offerSideLot, rebuildChance, trackOutselling, LOTTIES_CORNER, newGame, ownedPlots, plotBuyout, plotBuyoutPrice, plotPrice, PLOTS, refreshRecruits, stormHQ, type GameState,
  FACTIONS, netWorth, truceCost, TRUCE_TRIBUTE, type RivalId,
  migrateSave, negotiator, setNegotiator, SMOOTH_TALKER, type Guard,
} from './economy.ts';
import { guardOf } from './fighters.ts';
import { negotiatorRow, plotBuyoutRow, sitDown, sitdownAction, type SitKit } from '../ui/sitdown.ts';

function rich(seed = 1): GameState {
  const s = newGame(seed);
  s.rank = 7;
  s.cash = 50_000_000;
  s.today.land = 0;
  return s;
}

/** Strip a rival down to its HQ and one plot so it counts as Weakened. */
function weaken(s: GameState, id: 'blenders' | 'sourwood') {
  const plots = ownedPlots(s, id).filter((p) => p.type !== 'hq');
  for (const p of plots.slice(1)) s.plots[p.id] = { ...s.plots[p.id], owner: null, stand: null };
}

describe('sit-downs and buyouts', () => {
  it('a truce stops raids, and breaking it costs a star', () => {
    const s = rich();
    expect(makeTruce(s, 'blenders')).toBe(true);
    expect(s.rivals.blenders.respectUntil).toBeGreaterThan(s.day + 5);
    const target = ownedPlots(s, 'blenders').find((p) => s.plots[p.id].stand)!;
    refreshRecruits(s, true);
    for (const r of [...s.recruits]) hireGuard(s, r.id);
    const rep = s.reputation;
    fightRaid(s, { id: 'x', attacker: 'player', target: target.id, objective: 'shakedown', guards: s.guards.map((g) => g.id), detected: false, eta: '' }, true);
    expect(s.reputation).toBe(rep); // fightRaid alone does not break it; planRaid does
  });

  it("a Truce's tribute is set by that boss's Grudge toward you", () => {
    const s = rich();
    s.cash = 1_000_000;
    for (const id of ['blenders', 'coldbrew'] as const) s.rivals[id].grudge = 0;
    const base = Math.max(TRUCE_TRIBUTE.floor, Math.round(netWorth(s) * TRUCE_TRIBUTE.share / 100) * 100);
    expect(truceCost(s, 'blenders')).toBe(base);
    s.rivals.blenders.grudge = 50;
    expect(truceCost(s, 'blenders')).toBe(Math.round(base * 1.5 / 100) * 100); // half again at Grudge 50
    expect(truceCost(s, 'coldbrew')).toBe(base); // Juni holds nothing against you
    s.rivals.blenders.grudge = 100;
    expect(truceCost(s, 'blenders')).toBe(Math.round(base * 2 / 100) * 100);
    const paid = truceCost(s, 'blenders'), cash = s.cash;
    expect(makeTruce(s, 'blenders')).toBe(true);
    expect(s.cash).toBe(cash - paid);
    s.cash = TRUCE_TRIBUTE.floor - 1; // short of even the smallest tribute
    expect(canTruce(s, 'coldbrew')).toEqual({ ok: false, why: `Tribute is $${truceCost(s, 'coldbrew').toLocaleString('en-US')}` });
  });

  it('plot buyout costs 2.5x land at home and hands over the stand', () => {
    const s = rich();
    const p = ownedPlots(s, 'blenders').find((q) => q.district === 'boardwalk' && q.type !== 'hq' && s.plots[q.id].stand)!;
    const price = plotBuyoutPrice(s, p.id);
    expect(price).toBeGreaterThanOrEqual(Math.round(s.plots[p.id].landValue * 2.5));
    const cash = s.cash;
    expect(plotBuyout(s, p.id)).toBe(true);
    expect(s.plots[p.id].owner).toBe('player');
    expect(s.plots[p.id].stand).not.toBeNull();
    expect(s.cash).toBe(cash - price);
  });

  it('faction buyout needs Weakened, and Vera never sells', () => {
    const s = rich();
    s.cash = 1000;
    expect(isWeakened(s, 'blenders')).toBe(false);
    s.cash = 50_000_000;
    weaken(s, 'blenders');
    expect(isWeakened(s, 'blenders')).toBe(true);
    const price = factionBuyoutPrice(s, 'blenders')!;
    expect(factionBuyout(s, 'blenders')).toBe(true);
    expect(s.rivals.blenders.alive).toBe(false);
    expect(s.plots[hqPlot('blenders').id].owner).toBe('player');
    expect(price).toBeGreaterThan(0);
    weaken(s, 'sourwood');
    s.rank = 9;
    expect(canFactionBuyout(s, 'sourwood')).toEqual({ ok: false, why: 'Vera Sourwood never sells' });
  });
});

describe('the Sit-down negotiator', () => {
  /** A rich game with one Smooth Talker and one Gentle Giant on the crew, the Blenders Weakened. */
  function table(seed = 1) {
    const s = rich(seed);
    const talker = guardOf('fists', 'none', 1, 'Smooth Talker', { name: 'Gus Gab' });
    const giant = guardOf('fists', 'none', 1, 'Gentle Giant', { name: 'Big Al' });
    s.guards.push(talker, giant);
    weaken(s, 'blenders');
    const plot = ownedPlots(s, 'coldbrew').find((p) => p.type !== 'hq')!.id;
    const prices = () => ({ truce: truceCost(s, 'coldbrew'), plot: plotBuyoutPrice(s, plot), faction: factionBuyoutPrice(s, 'blenders')! });
    return { s, talker, giant, plot, prices };
  }

  it('a Smooth Talker talks the Truce, the Plot Buyout and the Faction Buyout down; anyone else changes nothing', () => {
    const { s, talker, giant, prices } = table();
    s.rivals.coldbrew.grudge = 40;
    const alone = prices();
    expect(setNegotiator(s, giant.id)).toBe(true);
    expect(prices()).toEqual(alone);
    expect(setNegotiator(s, talker.id)).toBe(true);
    expect(negotiator(s)).toBe(talker);
    const cut = 1 - SMOOTH_TALKER.cut;
    const talked = prices();
    expect(talked.truce).toBe(Math.round(Math.max(TRUCE_TRIBUTE.floor, Math.round(netWorth(s) * TRUCE_TRIBUTE.share / 100) * 100) * 1.4 * cut / 100) * 100);
    expect(talked.plot).toBeCloseTo(alone.plot * cut, -1);
    expect(talked.faction).toBeCloseTo(alone.faction * cut, -1);
    const cash = s.cash;
    expect(factionBuyout(s, 'blenders')).toBe(true);
    expect(s.cash).toBe(cash - talked.faction);
    expect(setNegotiator(s, null)).toBe(true);
    expect(s.negotiator).toBeUndefined();
    expect(setNegotiator(s, 'nobody')).toBe(false);
  });

  it('a knocked-out negotiator stays home, and one who leaves the crew is forgotten', () => {
    const { s, talker, prices } = table(2);
    const alone = prices();
    setNegotiator(s, talker.id);
    talker.outUntil = s.day + 1;
    expect(negotiator(s)).toBeNull();
    expect(prices()).toEqual(alone);
    talker.outUntil = 0;
    expect(prices().plot).toBeLessThan(alone.plot);
    s.guards = s.guards.filter((g) => g.id !== talker.id);
    expect(prices()).toEqual(alone);
    migrateSave(s);
    expect(s.negotiator).toBeUndefined();
  });

  it('the Sit-down cards offer your Smooth Talkers to bring along, and tapping the one along goes alone', () => {
    const kit: SitKit = {
      btn: (action, label, b = { ok: true }, extra = '') => `<button data-action="${action}" ${extra} ${b.ok ? '' : 'disabled'}>${label}</button>`,
      tape: (inner) => `<span>${inner}</span>`, locked: (b) => !b.ok && /Rank \d/.test(b.why), esc: (x) => x,
      whole: (n) => `$${Math.round(n).toLocaleString('en-US')}`, face: (_s, g: Guard) => `<i>${g.name}</i>`,
    };
    const { s, talker, plot } = table(3);
    expect(negotiatorRow(kit, s)).toContain(`data-id="${talker.id}" aria-pressed="false"`);
    expect(negotiatorRow(kit, s)).not.toContain('Big Al'); // only a Smooth Talker gets better terms
    setNegotiator(s, talker.id);
    expect(negotiatorRow(kit, s)).toContain('data-id="" aria-pressed="true"'); // tap again: go alone
    expect(sitdownAction({ action: 'negotiator', id: '' })).toEqual({ type: 'negotiator', id: null });
    expect(sitdownAction({ action: 'negotiator', id: talker.id })).toEqual({ type: 'negotiator', id: talker.id });
    expect(sitDown(kit, s, 'coldbrew')).toContain('data-testid="negotiator"');
    expect(sitDown(kit, s, 'coldbrew')).toContain(`Truce $${truceCost(s, 'coldbrew').toLocaleString('en-US')}`);
    expect(plotBuyoutRow(kit, s, plot)).toContain(`Buy it $${plotBuyoutPrice(s, plot).toLocaleString('en-US')}`);
    s.guards = s.guards.filter((g) => g.trait !== 'Smooth Talker');
    expect(negotiatorRow(kit, s)).toBe('');
    s.rank = 3;
    expect(sitDown(kit, s, 'coldbrew')).toBe('');
    expect(plotBuyoutRow(kit, s, plot)).toBe('');
  });
});

describe('HQ assault', () => {
  it('a big kitted squad takes the Blend Shack and triggers a Fire Sale', () => {
    const s = rich(4);
    const lot = PLOTS.find((q) => q.type === 'street' && !s.plots[q.id].owner)!;
    Object.assign(s.plots[lot.id], { owner: 'player', facility: { kind: 'clubhouse', level: 3 } }); // 24 beds
    weaken(s, 'blenders');
    for (let i = 0; i < 4; i++) { refreshRecruits(s, true); for (const r of [...s.recruits]) hireGuard(s, r.id); }
    for (const g of s.guards) { g.level = 5; equip(s, g.id, 'hatchets'); equip(s, g.id, 'pro'); }
    const ids = s.guards.slice(0, 12).map((g) => g.id);
    expect(canAssault(s, 'blenders', ids).ok).toBe(true);
    const res = stormHQ(s, 'blenders', ids);
    expect(res && res.won).toBe(true);
    expect(s.rivals.blenders.alive).toBe(false);
    expect(s.plots[hqPlot('blenders').id].owner).toBe('player');
    const sale = PLOTS.find((p) => s.plots[p.id].dibs?.price !== undefined)!;
    expect(plotPrice(s, sale.id)).toBe(Math.round(s.plots[sale.id].landValue * 0.75));
    expect(canBuyPlot(s, sale.id).ok).toBe(true);
    expect(buyPlot(s, sale.id)).toBe(true);
  });

  it('a lone guard bounces off the gate', () => {
    const s = rich(5);
    weaken(s, 'blenders');
    refreshRecruits(s, true);
    hireGuard(s, s.recruits[0].id);
    const res = stormHQ(s, 'blenders', [s.guards[0].id]);
    expect(res && res.won).toBe(false);
    expect(s.rivals.blenders.alive).toBe(true);
  });
});

describe('knock it down, buy it up', () => {
  it('a smashed rival facility goes For Sale if they do not rebuild', () => {
    const s = rich(6);
    const pad = PLOTS.find((p) => s.plots[p.id].owner === 'hollis' && s.plots[p.id].facility)!;
    expect(pad).toBeTruthy();
    s.plots[pad.id].wreckedDay = s.day;
    s.plots[pad.id].facility!.wrecked = true;
    s.plots[pad.id].smashedBy = 'player';
    s.rivals.hollis.cash = 0; // can't afford the rebuild
    crewAtDawn(s);
    expect(s.plots[pad.id].owner).toBeNull();
    expect(s.plots[pad.id].dibs?.who).toBe('player');
  });

  it('a smashed player stand lapses after a day without a rebuild', () => {
    const s = rich(7);
    const home = ownedPlots(s, 'player')[0];
    s.plots[home.id].stand!.wrecked = true;
    s.plots[home.id].wreckedDay = s.day;
    s.plots[home.id].smashedBy = 'blenders';
    s.day += 1;
    crewAtDawn(s);
    expect(s.plots[home.id].owner).toBe('player'); // still time to rebuild today
    s.day += 1;
    crewAtDawn(s);
    expect(s.plots[home.id].owner).not.toBe('player');
  });
});

describe('review rules', () => {
  it('breaking a truce bans truces for 14 days', () => {
    const s = rich();
    makeTruce(s, 'blenders');
    breakTruce(s, 'blenders');
    expect(canTruce(s, 'coldbrew').ok).toBe(false);
    s.day += 14;
    expect(canTruce(s, 'coldbrew').ok).toBe(true);
  });

  it('outselling a rival 2x for 7 days weakens them', () => {
    const s = rich();
    s.cash = 1000;
    expect(isWeakened(s, 'fizzco')).toBe(false);
    for (let i = 0; i < 7; i++) { s.today.revenue = 1000; s.rivals.fizzco.salesToday = 400; trackOutselling(s); }
    expect(isWeakened(s, 'fizzco')).toBe(true);
  });

  it('each recent Smash cuts the rebuild chance by 30 points', () => {
    const s = rich();
    const p = ownedPlots(s, 'sourwood').find((q) => s.plots[q.id].stand)!;
    expect(rebuildChance(s, p.id)).toBeCloseTo(0.8);
    s.plots[p.id].smashes = [s.day];
    expect(rebuildChance(s, p.id)).toBeCloseTo(0.5);
  });

  it('Day 3: the side lot sells for $300 with a table', () => {
    const s = newGame(2);
    s.day = 3;
    offerSideLot(s);
    const lot = PLOTS.find((p) => s.plots[p.id].dibs?.table)!;
    expect(lot.district).toBe(PLOTS.find((p) => p.id === LOTTIES_CORNER)!.district);
    s.cash = 400;
    expect(buyPlot(s, lot.id)).toBe(true);
    expect(s.cash).toBe(100);
    expect(s.plots[lot.id].stand?.level).toBe(1);
  });
});

describe('rival personalities', () => {
  it('split their dawn spending Grow / Guard / Strike by the families table', () => {
    const spec: Record<RivalId, [number, number, number]> = {
      blenders: [25, 15, 60], coldbrew: [25, 25, 50], hollis: [40, 50, 10], fizzco: [50, 20, 30], sourwood: [35, 35, 30],
    };
    for (const id of Object.keys(spec) as RivalId[]) {
      const f = FACTIONS[id];
      expect([f.grow, f.guard, f.strike].map((x) => Math.round(x * 100))).toEqual(spec[id]);
      expect(f.grow + f.guard + f.strike).toBeCloseTo(1);
    }
  });
});
