import { describe, expect, it } from 'vitest';
import {
  buyPlot, canBuyPlot, canFactionBuyout, canAssault, crewAtDawn, equip, factionBuyout, factionBuyoutPrice, fightRaid, hireGuard, hqPlot,
  isWeakened, makeTruce, breakTruce, canTruce, offerSideLot, rebuildChance, trackOutselling, LOTTIES_CORNER, newGame, ownedPlots, plotBuyout, plotBuyoutPrice, plotPrice, PLOTS, refreshRecruits, stormHQ, type GameState,
  BAY_RIVALS, FACTIONS, netWorth, truceCost, TRUCE_TRIBUTE, type RivalId,
  migrateSave, negotiator, setNegotiator, SMOOTH_TALKER, type Guard,
  canHoldFirm, caveChance, haggle, HAGGLE, haggleAsk, haggleOffer, haggling, HQS, eliminate, FIRE_SALE, newStand,
  budgetOf, closeAuctions, handOverKept, openAuction, PLOT_BY_ID, rivalPrice, buildFacility, deliver, openStand, PICKUP_MINUTE, playerStands, simulateRestOfDay, type Order, canPlotBuyout, hasTrophy, rivalsBankrupt, TROPHIES, BANKRUPT_DAYS, growLand, sleepUntilDawn, plotsAtDawn, type PlotState,
} from './economy.ts';
import { guardOf } from './fighters.ts';
import { keptNote, negotiatorRow, plotBuyoutRow, sitDown, sitdownAction, type SitKit } from '../ui/sitdown.ts';

const RIVALS = BAY_RIVALS; // the Bay's five (Endless Summer's Out-of-Towner is out of town)

function rich(seed = 1): GameState {
  const s = newGame(seed);
  s.rank = 7;
  s.cash = 50_000_000;
  s.today.land = 0;
  return s;
}

/** Strip a rival down to its HQ and one plot so it counts as Weakened. */
function weaken(s: GameState, id: RivalId) {
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

  it('Peaceful sells no Truce, since nobody raids there; Plot and Faction Buyouts stay on the table', () => {
    const kit: SitKit = {
      btn: (action, label, b = { ok: true }, extra = '') => `<button data-action="${action}" ${extra} ${b.ok ? '' : 'disabled'}>${label}</button>`,
      tape: (inner) => `<span>${inner}</span>`, locked: (b) => !b.ok && /Rank \d/.test(b.why), esc: (x) => x,
      whole: (n) => `$${Math.round(n).toLocaleString('en-US')}`, face: (_s, g: Guard) => `<i>${g.name}</i>`,
    };
    const s = newGame(5, { mode: 'sandbox', peaceful: true });
    s.rank = 4;
    s.cash = 600; // the $500 tribute a Truce would cost, and change
    expect(truceCost(s, 'blenders')).toBe(TRUCE_TRIBUTE.floor);
    expect(canTruce(s, 'blenders')).toEqual({ ok: false, why: 'Peaceful: nobody is raiding' });
    expect(makeTruce(s, 'blenders')).toBe(false);
    expect(s.cash).toBe(600);
    expect(s.rivals.blenders.truceUntil ?? 0).toBeLessThan(s.day);
    expect(sitDown(kit, s, 'blenders')).not.toContain('data-action="truce"');
    const plot = ownedPlots(s, 'hollis').find((p) => p.type !== 'hq')!.id;
    s.cash = 50_000_000;
    expect(canPlotBuyout(s, plot)).toEqual({ ok: true });
    expect(plotBuyoutRow(kit, s, plot)).toContain('data-testid="plot-buyout"');
    s.rank = 7;
    weaken(s, 'blenders');
    expect(canFactionBuyout(s, 'blenders')).toEqual({ ok: true });
    expect(sitDown(kit, s, 'blenders')).toContain('data-testid="faction-buyout"');
    const classic = rich(5);
    classic.rank = 4;
    expect(canTruce(classic, 'blenders')).toEqual({ ok: true }); // outside Peaceful the Truce still sells
    expect(sitDown(kit, classic, 'blenders')).toContain('data-action="truce"');
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

describe('Faction Buyout haggling', () => {
  /** A rich game with Juni's Collective Weakened and her Grudge toward you set. */
  function juni(seed = 1, grudge = 0) {
    const s = rich(seed);
    weaken(s, 'coldbrew');
    s.rivals.coldbrew.grudge = grudge;
    return s;
  }

  it('Brock signs at once; Juni hears your offer, counters above her price, and signs when you shake on it', () => {
    const s = juni();
    weaken(s, 'blenders');
    expect(factionBuyout(s, 'blenders')).toBe(true); // Brock accepts readily
    expect(factionBuyout(s, 'coldbrew')).toBe(false); // Juni haggles first
    expect(s.rivals.coldbrew.alive).toBe(true);
    const offer = haggleOffer(s, 'coldbrew'), floor = factionBuyoutPrice(s, 'coldbrew')!, ask = haggleAsk(s, 'coldbrew');
    expect(floor / offer).toBeCloseTo(HQS.coldbrew.buyout! / HAGGLE.offer, 3); // her 1.8x against your 1.5x
    expect(ask / offer).toBeCloseTo(HAGGLE.ask / HAGGLE.offer, 3); // she counters at 2.1x
    expect(ask).toBeGreaterThan(floor);
    expect(haggle(s, 'coldbrew', 'offer')).toBe(true);
    expect(haggling(s, 'coldbrew')).toBe(true);
    expect(s.news.at(-1)).toContain('in small bills, for authenticity');
    expect(haggle(s, 'coldbrew', 'offer')).toBe(false); // one counter a day
    const cash = s.cash, till = s.rivals.coldbrew.cash;
    expect(factionBuyout(s, 'coldbrew')).toBe(true);
    expect(s.cash).toBe(cash - ask + till); // her till comes with the business
    expect(s.rivals.coldbrew.alive).toBe(false);
    expect(s.news.some((n) => n.includes(`for $${ask.toLocaleString('en-US')}, in small bills, for authenticity!`))).toBe(true);
    expect(haggle(s, 'blenders', 'offer')).toBe(false); // Brock doesn't haggle
  });

  it('holding firm: they come down to their price with a chance their Grudge cuts, else walk out till tomorrow', () => {
    const took = (grudge: number) => Array.from({ length: 40 }, (_, i) => {
      const s = juni(i + 1, grudge);
      s.seed = 1000 + i * 7919;
      haggle(s, 'coldbrew', 'offer');
      const floor = factionBuyoutPrice(s, 'coldbrew')!, cash = s.cash, till = s.rivals.coldbrew.cash;
      const yes = haggle(s, 'coldbrew', 'firm');
      if (yes) expect(s.cash).toBe(cash - floor + till); // 1.8x, never your 1.5x
      return yes;
    }).filter(Boolean).length;
    const calm = took(0);
    expect(calm).toBeGreaterThan(8); // 50%
    expect(calm).toBeLessThan(32);
    expect(took(100)).toBe(0); // a feud: they always walk
    expect(caveChance(juni(1, 50), 'coldbrew')).toBeCloseTo(HAGGLE.cave - 50 * HAGGLE.perGrudge, 6);

    const s = juni(2, 100);
    expect(canHoldFirm(s, 'coldbrew')).toEqual({ ok: false, why: 'Make an offer first' });
    haggle(s, 'coldbrew', 'offer');
    expect(haggle(s, 'coldbrew', 'firm')).toBe(false);
    expect(s.rivals.coldbrew.alive).toBe(true);
    expect(s.rivals.coldbrew.grudge).toBe(100);
    expect(canFactionBuyout(s, 'coldbrew')).toEqual({ ok: false, why: 'Juni walked out. Back tomorrow' });
    expect(factionBuyout(s, 'coldbrew')).toBe(false);
    s.day += 1;
    expect(canFactionBuyout(s, 'coldbrew').ok).toBe(true);
    s.rivals.coldbrew.grudge = 20;
    haggle(s, 'coldbrew', 'firm'); // no counter on the table today
    expect(s.rivals.coldbrew.grudge).toBe(20);
    haggle(s, 'coldbrew', 'offer');
    s.seed = 1;
    while (s.rivals.coldbrew.alive && !(s.rivals.coldbrew.haggle?.out)) haggle(s, 'coldbrew', 'firm');
    if (s.rivals.coldbrew.alive) expect(s.rivals.coldbrew.grudge).toBe(20 + HAGGLE.snub); // sorer for the snub
  });

  it('you can hold out with their price in hand when their counter is more than you have; your offer alone buys nothing', () => {
    const s = juni(3);
    const floor = factionBuyoutPrice(s, 'coldbrew')!;
    s.cash = floor - 10;
    expect(canFactionBuyout(s, 'coldbrew')).toEqual({ ok: false, why: `They want $${floor.toLocaleString('en-US')}` }); // no haggle without her price in hand
    expect(haggle(s, 'coldbrew', 'offer')).toBe(false);
    s.cash = 50_000_000;
    haggle(s, 'coldbrew', 'offer');
    s.cash = floor + 10;
    expect(canFactionBuyout(s, 'coldbrew').ok).toBe(false); // can't pay the 2.1x counter
    expect(canHoldFirm(s, 'coldbrew')).toEqual({ ok: true });
    s.cash = haggleOffer(s, 'coldbrew') + 10;
    expect(canHoldFirm(s, 'coldbrew')).toEqual({ ok: false, why: `They want $${floor.toLocaleString('en-US')}` });
  });

  it('a haggler never signs below their price: holding out every morning buys Juni and Preston at 1.8x, never 1.5x', () => {
    for (const id of ['coldbrew', 'fizzco'] as RivalId[]) {
      for (let i = 0; i < 20; i++) {
        const s = rich(i + 1);
        s.rank = 9;
        weaken(s, id);
        s.rivals[id].grudge = 0;
        s.seed = 500 + i * 104_729;
        const floor = factionBuyoutPrice(s, id)!, start = s.cash, till = s.rivals[id].cash;
        for (let d = 0; d < 40 && s.rivals[id].alive; d++, s.day++) { haggle(s, id, 'offer'); haggle(s, id, 'firm'); }
        expect(s.rivals[id].alive).toBe(false);
        expect(start + till - s.cash).toBe(floor);
      }
    }
  });

  it('the HQ card: Brock\'s price, Juni\'s offer, then her counter to shake on or hold out against', () => {
    const kit: SitKit = {
      btn: (action, label, b = { ok: true }, extra = '') => `<button data-action="${action}" ${extra} ${b.ok ? '' : 'disabled'}>${label}</button>`,
      tape: (inner) => `<span>${inner}</span>`, locked: (b) => !b.ok && /Rank \d/.test(b.why), esc: (x) => x,
      whole: (n) => `$${Math.round(n).toLocaleString('en-US')}`, face: (_s, g: Guard) => `<i>${g.name}</i>`,
    };
    const s = juni(4);
    weaken(s, 'blenders');
    const $ = (n: number) => `$${n.toLocaleString('en-US')}`;
    expect(sitDown(kit, s, 'blenders')).toContain(`Buy out ${$(factionBuyoutPrice(s, 'blenders')!)}`);
    expect(sitDown(kit, s, 'coldbrew')).toContain('data-move="offer" data-testid="faction-buyout" title="Juni will counter"');
    expect(sitDown(kit, s, 'coldbrew')).toContain(`>Offer ${$(haggleOffer(s, 'coldbrew'))}<`);
    haggle(s, 'coldbrew', 'offer');
    const card = sitDown(kit, s, 'coldbrew');
    expect(card).toContain(`Shake on ${$(haggleAsk(s, 'coldbrew'))}`);
    expect(card).toContain(`>Hold out for ${$(factionBuyoutPrice(s, 'coldbrew')!)}<`);
    expect(card).toContain(`data-testid="haggle-firm" title="50% Juni comes down to it, or walks out till tomorrow"`);
    expect(sitdownAction({ action: 'haggle', rival: 'coldbrew', move: 'firm' })).toEqual({ type: 'haggle', rival: 'coldbrew', move: 'firm' });
    expect(sitdownAction({ action: 'haggle', rival: 'fizzco' })).toEqual({ type: 'haggle', rival: 'fizzco', move: 'offer' });
  });
});

describe('what a Faction Buyout buys', () => {
  /** The Blenders Weakened down to their HQ and one stand, a Kiosk with a fence, and $10,000 in the till. */
  function shop(seed = 1) {
    const s = rich(seed);
    weaken(s, 'blenders');
    const lot = ownedPlots(s, 'blenders').find((p) => p.type !== 'hq')!.id;
    const ps = s.plots[lot];
    ps.stand = newStand(3);
    ps.invested = 3500 + 400 + 150 + 500;
    ps.defense = { tier: 1, fenceHp: 100, gadgets: [] };
    s.rivals.blenders.cash = 10_000;
    return { s, lot };
  }

  it('the till comes to you, and each building stays with its Fire Sale plot for you to buy on First Dibs', () => {
    const { s, lot } = shop();
    const price = factionBuyoutPrice(s, 'blenders')!, cash = s.cash, invested = s.plots[lot].invested;
    expect(factionBuyout(s, 'blenders')).toBe(true);
    expect(s.cash).toBe(cash - price + 10_000);
    expect(s.today.land).toBe(price - 10_000); // the business, net of its cash
    const ps = s.plots[lot];
    expect(ps.owner).toBeNull();
    expect(ps.stand).toBeNull(); // bare land on the map until it sells
    expect(ps.dibs).toMatchObject({ who: 'player', until: s.day + FIRE_SALE.days - 1, price: Math.round(ps.landValue * FIRE_SALE.share) });
    expect(ps.kept).toMatchObject({ invested });
    expect(ps.kept!.stand!.level).toBe(3);
    expect(keptNote(ps)).toContain('>Kiosk included<');
    expect(s.news).toContain('Its building stays put: buy the plot, get the building.');
    const before = s.cash;
    expect(buyPlot(s, lot)).toBe(true);
    expect(s.cash).toBe(before - Math.round(ps.landValue * FIRE_SALE.share));
    expect(s.plots[lot]).toMatchObject({ owner: 'player', invested, defense: { tier: 1, fenceHp: 100 } });
    expect(s.plots[lot].stand!.level).toBe(3);
    expect(s.plots[lot].dibs).toBeUndefined();
    expect(s.plots[lot].kept).toBeUndefined();
  });

  it('a plot you let go to auction takes its building to the winner, and a rival buying it later gets it too', () => {
    const { s, lot } = shop(4);
    factionBuyout(s, 'blenders');
    s.day += FIRE_SALE.days; // First Dibs ran out: the plot goes on the block
    openAuction(s, lot, 'fire');
    expect(s.plots[lot].kept).toBeDefined(); // waiting through the auction
    for (const id of RIVALS) s.rivals[id].alive = id === 'coldbrew';
    budgetOf(s, 'coldbrew').grow = s.rivals.coldbrew.cash = 5_000_000;
    let won = false;
    for (let tries = 0; tries < 40 && !won; tries++) {
      s.plots[lot].auction = { kind: 'fire', closes: s.day, min: s.plots[lot].landValue };
      closeAuctions(s);
      won = s.plots[lot].owner === 'coldbrew';
    }
    expect(won).toBe(true);
    expect(s.plots[lot].stand!.level).toBe(3);
    expect(s.plots[lot].stand!.price).toBe(rivalPrice('coldbrew', 3, PLOT_BY_ID[lot]));
    expect(s.plots[lot].kept).toBeUndefined();
    const t = shop(5);
    factionBuyout(t.s, 'blenders');
    delete t.s.plots[t.lot].dibs; // unsold: back on the shelf
    t.s.plots[t.lot].owner = 'hollis';
    handOverKept(t.s, t.lot, 'hollis');
    expect(t.s.plots[t.lot]).toMatchObject({ owner: 'hollis', invested: t.s.plots[t.lot].invested });
    expect(t.s.plots[t.lot].stand!.level).toBe(3);
  });

  it('rubble isn\'t kept, and a captured or bankrupt rival\'s land goes bare with no till for you', () => {
    const a = shop(2);
    a.s.plots[a.lot].stand!.wrecked = true;
    factionBuyout(a.s, 'blenders');
    expect(a.s.plots[a.lot].kept).toBeUndefined();
    expect(keptNote(a.s.plots[a.lot])).toBe('');
    for (const how of ['hq', 'bankrupt'] as const) {
      const { s, lot } = shop(3);
      const cash = s.cash;
      eliminate(s, 'blenders', how);
      expect(s.cash).toBe(cash);
      expect(s.plots[lot].kept).toBeUndefined();
      buyPlot(s, lot);
      expect(s.plots[lot].stand).toBeNull();
    }
  });
});

describe('a rival out of the game', () => {
  const RIVALS = BAY_RIVALS;

  it('gone bust, its HQ still becomes your Trophy, perk and all, like a capture or a buyout', () => {
    for (const how of ['hq', 'buyout', 'bankrupt'] as const) {
      const s = rich(7);
      const hq = hqPlot('sourwood').id;
      expect(hasTrophy(s, 'sourwood')).toBe(false);
      eliminate(s, 'sourwood', how);
      expect(s.plots[hq]).toMatchObject({ owner: 'player', garrison: 0 });
      expect(hasTrophy(s, 'sourwood')).toBe(true);
      expect(s.plots[hq].dibs).toBeUndefined(); // an HQ never goes to the Fire Sale
      expect(s.news.some((n) => n.includes(`becomes Lottie's ${TROPHIES.sourwood!.name}`))).toBe(true);
    }
    const s = rich(8); // the real route: a week in the red, counted at dawn
    s.rivals.hollis.cash = -1;
    s.rivals.hollis.brokeDays = BANKRUPT_DAYS - 1;
    rivalsBankrupt(s);
    expect(s.rivals.hollis.alive).toBe(false);
    expect(hasTrophy(s, 'hollis')).toBe(true);
    expect(s.news).toContain(`${FACTIONS.hollis.name} go bust after ${BANKRUPT_DAYS} days in the red. Their HQ, ${hqPlot('hollis').name}, becomes Lottie's ${TROPHIES.hollis!.name}: ${TROPHIES.hollis!.perk.toLowerCase()}.`);
  });

  /** The Blenders go out on Day 8, every rival has the Grow money for anything, and their Fire Sale plots are the only open land. */
  function fireSale(seed: number) {
    const s = newGame(seed, { difficulty: 'laidback' });
    s.day = 8;
    eliminate(s, 'blenders', 'bankrupt');
    const sale = PLOTS.filter((p) => s.plots[p.id].dibs?.who === 'player').map((p) => p.id);
    for (const p of PLOTS) {
      const ps: PlotState = s.plots[p.id];
      if (!ps.owner && !sale.includes(p.id)) ps.owner = 'player'; // the rest of the map is spoken for
    }
    for (const id of RIVALS) budgetOf(s, id).grow = 10_000_000;
    return { s, sale };
  }

  it('no rival buys a Fire Sale plot while your First Dibs runs; once it ends, they may bid for it', () => {
    let early = 0, late = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const { s, sale } = fireSale(seed);
      expect(sale.length).toBeGreaterThan(0);
      const until = s.plots[sale[0]].dibs!.until;
      expect(until).toBe(s.day + FIRE_SALE.days - 1);
      for (const day of [s.day, until]) {
        s.day = day;
        for (const id of RIVALS) if (s.rivals[id].alive) growLand(s, id, { seed: seed * 7 + day });
        early += sale.filter((p) => s.plots[p].owner).length;
      }
      s.day = until + 1; // the window is over: each unsold plot goes to sealed bids at this dawn (auction.ts)
      plotsAtDawn(s, { seed: seed * 13 });
      for (const p of sale) expect(s.plots[p].auction).toMatchObject({ kind: 'fire', closes: s.day + 1 });
      for (const id of RIVALS) if (s.rivals[id].alive) growLand(s, id, { seed: seed * 17 }); // never off the shelf meanwhile
      for (const p of sale) expect(s.plots[p].owner ?? null).toBeNull();
      for (const id of RIVALS) s.rivals[id].cash = 10_000_000;
      s.day++; // the gavel falls at the next dawn
      closeAuctions(s);
      late += sale.filter((p) => s.plots[p].owner && s.plots[p].owner !== 'player').length;
    }
    expect(early).toBe(0);
    expect(late).toBeGreaterThan(0);
  });

  it('the dawn inside the window leaves the Fire Sale to you (rivals buy before the old dibs clear)', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const { s, sale } = fireSale(seed);
      openStand(s);
      simulateRestOfDay(s);
      s.raids = [];
      expect(sleepUntilDawn(s)).toBe(true); // Day 8 to Day 9: the window's last day
      expect(s.day).toBe(9);
      for (const p of sale) expect(s.plots[p].owner ?? null).toBeNull();
      for (const p of sale) expect(s.plots[p].dibs).toMatchObject({ who: 'player', until: 9 });
    }
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
    const cash = s.cash, till = s.rivals.blenders.cash;
    expect(factionBuyout(s, 'blenders')).toBe(true);
    expect(s.cash).toBe(cash - talked.faction + till);
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

  it('a helicopter paid mid-day counts in the day\'s sales, and so toward outselling a rival', () => {
    const s = rich(6);
    for (const id of RIVALS) budgetOf(s, id).strike = 0; // nobody can pay for a Delivery Raid
    const field = PLOTS.find((p) => p.type === 'field')!.id;
    s.plots[field] = { ...s.plots[field], owner: 'player', garrison: 0 };
    expect(buildFacility(s, field, 'helipad')).toBe(true);
    buildFacility(s, field, 'helipad'); // the Helipad tier loads 5,000 a day, so the order goes in one trip
    s.bottles = 5000;
    const order: Order = { id: 'vip', tier: 'heli', client: 'test', qty: 4000, pay: 15000, due: s.day, expires: s.day, plot: field, accepted: true };
    openStand(s);
    s.minute = PICKUP_MINUTE.heli;
    expect(deliver(s, order)).toMatchObject({ ok: true });
    simulateRestOfDay(s);
    const day = s.history.at(-1)!;
    const stands = playerStands(s).reduce((a, p) => a + s.plots[p.id].stand!.day.revenue, 0);
    expect(day.revenue).toBeCloseTo(stands + 15000, 2); // the pickup survives closing
    for (const id of RIVALS) {
      const theirs = PLOTS.filter((p) => s.plots[p.id].owner === id && s.plots[p.id].stand).reduce((a, p) => a + s.plots[p.id].stand!.day.revenue, 0);
      expect(s.rivals[id].outsoldDays).toBe(day.revenue >= 2 * theirs ? 1 : 0);
    }
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
      snootwater: [25, 15, 60], // the Out-of-Towner fights like Brock's Bros
    };
    for (const id of Object.keys(spec) as RivalId[]) {
      const f = FACTIONS[id];
      expect([f.grow, f.guard, f.strike].map((x) => Math.round(x * 100))).toEqual(spec[id]);
      expect(f.grow + f.guard + f.strike).toBeCloseTo(1);
    }
  });
});
