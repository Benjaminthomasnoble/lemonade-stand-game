import { describe, expect, it } from 'vitest';
import {
  announceControl, blenderBar, borrow, bugleHeadline, buyPlot, plotWorth, canBuildStand, EVERY_LAST_PLOT_HEADLINE, everyLastPlot, fairWinPage, isPurchasable, ownedRecipes, canBuyPlot, connected, controlTier, cutMap, development, dominationProgress, FACTIONS, hasFoothold, hqPlot, inPlay,
  buildStand, canBuildFacility, eliminate, FACILITIES, type FacilityKind,
  canUpgradeStand, currentHp, isDamaged, openStand, pourRate, priceCeiling, RANKS, serviceLeft, standCost, storageFor, upgradeStand,
  canBorrow, canFactionBuyout, canPlotBuyout, canTruce, plotBuyout, repayLoan,
  LOTTIES_CORNER, MAP_SIZES, mapDistricts, migrateSave, newGame, newStand, nextTier, NO_DEFENSE, onMap, perkActive, picksFit, plotBuyoutPrice, plotOnMap,
  plotPrice, PLOTS, plotsForTier, plotType, purchasablePlots, rivalsInPlay, sleepUntilDawn, type DistrictId, type GameState, type RivalId,
} from './economy.ts';
import { stockValue } from './ledger.ts';
import pacingCsv from '../../docs/spec/pacing.csv?raw';
import { chartChecks, checkRun, CLASSIC_FIRST_L2, CLASSIC_RANK_DAYS, DOMINATION, hits, longestLull, playRun, REFERENCE_SEED, type RunResult } from '../../tools/pacing.ts';

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

describe('Majority land discount', () => {
  it('takes 10% off unowned land once you hold a Majority, but not on the buy that makes it', () => {
    const s = newGame(34);
    s.cash = 1e6;
    const maple = purchasablePlots('maple').filter((p) => p.id !== LOTTIES_CORNER);
    for (const p of maple.slice(0, 5)) give(s, p.id); // 6 of 12 with the Corner
    const seventh = maple[5], eighth = maple[6];
    expect(plotPrice(s, seventh.id)).toBe(s.plots[seventh.id].landValue);
    const cash = s.cash;
    expect(buyPlot(s, seventh.id)).toBe(true);
    expect(cash - s.cash).toBe(s.plots[seventh.id].landValue); // full price: the Majority came with this buy
    expect(controlTier(s, 'maple')).toBe('majority');
    expect(s.news).toContain('MAJORITY in Maple Row! Land there is 10% cheaper for Lottie now.');
    expect(plotPrice(s, eighth.id)).toBe(Math.round(s.plots[eighth.id].landValue * 0.9));
    expect(plotPrice(s, street(s, 'oldtown').id)).toBe(s.plots[street(s, 'oldtown').id].landValue); // only in that district
  });

  it('stacks with Family Silver and applies to First Dibs prices, never to buyouts', () => {
    const s = newGame(35);
    const maple = purchasablePlots('maple');
    for (const p of maple.slice(0, 7)) give(s, p.id);
    const lot = maple[8];
    give(s, hqPlot('sourwood').id); // Sourwood Manor's Family Silver
    expect(plotPrice(s, lot.id)).toBe(Math.round(s.plots[lot.id].landValue * 0.9 * 0.9));
    s.plots[lot.id].dibs = { who: 'player', until: s.day + 1, price: Math.round(s.plots[lot.id].landValue * 0.75) };
    expect(plotPrice(s, lot.id)).toBe(Math.round(s.plots[lot.id].dibs!.price! * 0.9 * 0.9)); // a Fire Sale plot: 75% × 0.9 × 0.9
    const rival = maple[10];
    s.plots[rival.id].owner = 'fizzco';
    const plain = plotBuyoutPrice(s, rival.id);
    for (const p of maple.slice(7, 10)) give(s, p.id);
    expect(plotBuyoutPrice(s, rival.id)).toBe(plain); // Majority doesn't touch buyouts
  });
});

describe('Sandbox maps', () => {
  const ALL: RivalId[] = ['sourwood', 'hollis', 'fizzco', 'coldbrew', 'blenders'];
  const combos = (k: number, from = 0, acc: RivalId[] = []): RivalId[][] => (acc.length === k ? [acc] : ALL.slice(from).flatMap((r, i) => combos(k, from + i + 1, [...acc, r])));
  const sandbox = (seed: number, map: 'small' | 'medium' | 'large', rivals?: RivalId[]) => newGame(seed, { mode: 'sandbox', map, ...(rivals ? { rivals } : {}) });

  it('cuts Small and Medium from the bay: Maple Row and every rival home, in one piece, with a Dock and a Field', () => {
    for (const [size, k] of [['small', 2], ['medium', 3]] as const) {
      for (const picks of combos(k)) {
        const cut = cutMap(size, picks);
        if (size === 'small' && picks.includes('sourwood') && picks.includes('blenders')) { // Hilltop is 3 borders from the Boardwalk
          expect(cut).toBeNull();
          expect(picksFit(size, picks)).toBe(false);
          continue;
        }
        expect(cut, picks.join('+')).not.toBeNull();
        expect(cut!.districts).toHaveLength(MAP_SIZES[size].districts);
        expect(cut!.districts).toContain('maple');
        for (const r of picks) expect(cut!.districts).toContain(FACTIONS[r].home);
        expect(connected(cut!.districts)).toBe(true);
        const map = { settings: { districts: cut!.districts, retag: cut!.retag } };
        for (const t of ['dock', 'field'] as const) expect(PLOTS.some((p) => plotOnMap(map, p) && plotType(map, p) === t), `${picks.join('+')} keeps a ${t}`).toBe(true);
        for (const id of Object.keys(cut!.retag)) expect(PLOTS.find((p) => p.id === id)!.type).toBe('street'); // only plain street plots change
      }
    }
    expect(cutMap('large', ['hollis'])!.districts).toHaveLength(8);
  });

  it('New Game plays Large with all five unless Small or Medium picks fit; other modes play the whole bay', () => {
    expect(newGame(41, { mode: 'sandbox' }).settings).toMatchObject({ map: 'large', rivals: MAP_SIZES.large.picks });
    expect(newGame(41, { mode: 'sandbox' }).settings.districts).toBeUndefined();
    const small = sandbox(41, 'small');
    expect(small.settings.rivals).toEqual(MAP_SIZES.small.picks);
    expect(small.settings.districts).toEqual(cutMap('small', MAP_SIZES.small.picks)!.districts);
    expect(sandbox(41, 'small', ['sourwood', 'blenders']).settings.rivals).toEqual(MAP_SIZES.small.picks); // can't share a Small map
    expect(sandbox(41, 'medium', ['hollis', 'hollis', 'fizzco']).settings.rivals).toEqual(MAP_SIZES.medium.picks); // no repeats
    const campaign = newGame(41, { ...small.settings, mode: 'campaign' }).settings;
    expect([campaign.map, campaign.rivals, campaign.districts, campaign.retag]).toEqual([undefined, undefined, undefined, undefined]);
  });

  it('seeds only the picked rivals, on their own map; the rest never play and the land off the map is never for sale', () => {
    const s = sandbox(42, 'small', ['hollis', 'fizzco']);
    expect(mapDistricts(s).map((d) => d.id)).toEqual(['maple', 'oldtown', 'downtown', 'groves']);
    expect(rivalsInPlay(s)).toEqual(['hollis', 'fizzco']);
    for (const r of ['sourwood', 'coldbrew', 'blenders'] as const) {
      expect(s.rivals[r]).toMatchObject({ alive: false, cash: 0 });
      expect(inPlay(s, r)).toBe(false);
      expect(PLOTS.some((p) => s.plots[p.id].owner === r)).toBe(false);
    }
    for (const p of PLOTS) if (s.plots[p.id].owner) expect(plotOnMap(s, p), p.name).toBe(true);
    expect(s.plots[hqPlot('hollis').id].owner).toBe('hollis');
    expect(PLOTS.some((p) => p.district === 'oldtown' && s.plots[p.id].owner === 'fizzco')).toBe(true); // FizzCo's Old Town stand
    // The Dock the cut made in Downtown starts neutral and holds a pier, never a stand.
    const [dock] = Object.keys(s.settings.retag!);
    expect(s.settings.retag![dock]).toBe('dock');
    expect(s.plots[dock].owner).toBeNull();
    s.plots[dock].owner = 'player';
    s.phase = 'prep';
    s.cash = 1e6;
    expect(canBuildStand(s, dock)).toEqual({ ok: false, why: 'Docks hold piers, not stands' });
    s.cash = 1e9;
    s.rank = 10;
    expect(canBuyPlot(s, PLOTS.find((p) => p.district === 'harbor' && p.type === 'dock')!.id)).toEqual({ ok: false, why: 'Off this map' });
  });

  it("an absent rival's home on the map starts neutral: its Field and Dock land can be bought", () => {
    const s = sandbox(43, 'medium', ['fizzco', 'coldbrew', 'blenders']); // Hilltop fills in, with no Sourwoods
    expect(onMap(s, 'hilltop')).toBe(true);
    const hill = PLOTS.filter((p) => p.district === 'hilltop');
    for (const p of hill) expect(s.plots[p.id].owner, p.name).toBeNull();
    expect(hill.some((p) => p.type === 'field') && hill.some((p) => p.type === 'dock')).toBe(true);
    expect(s.rivals.sourwood.alive).toBe(false);
  });

  it('the Sandbox border rule counts neighbours on the map only', () => {
    const s = sandbox(45, 'small', ['hollis', 'coldbrew']); // Maple Row, Campus, the Groves and Hilltop: no Old Town
    expect(mapDistricts(s).map((d) => d.id)).toEqual(['maple', 'campus', 'groves', 'hilltop']);
    s.cash = 1e9;
    s.rank = 2;
    const campus = PLOTS.find((p) => p.district === 'campus' && p.type === 'street' && !s.plots[p.id].owner)!;
    expect(canBuyPlot(s, campus.id)).toEqual({ ok: false, why: 'Get a Foothold in a bordering district first' });
    give(s, PLOTS.find((p) => p.district === 'groves' && p.type === 'street' && !s.plots[p.id].owner)!.id);
    expect(canBuyPlot(s, campus.id).ok).toBe(true);
    expect(canBuyPlot(s, street(s, 'oldtown').id)).toEqual({ ok: false, why: 'Off this map' });
  });

  it('Domination needs the picked rivals out and a Majority in every district on the map', () => {
    const s = sandbox(44, 'small'); // Brock and Tilly: Maple Row, Old Town, the Boardwalk and the Groves
    expect(dominationProgress(s)).toMatchObject({ districts: 4, done: false });
    expect([...dominationProgress(s).rivalsLeft].sort()).toEqual(['blenders', 'hollis']);
    for (const r of rivalsInPlay(s)) s.rivals[r].alive = false;
    for (const d of mapDistricts(s)) for (const p of purchasablePlots(d.id)) give(s, p.id);
    expect(dominationProgress(s).done).toBe(true); // Downtown, the Harbor and the rest never count
  });

  it("a page whose holder isn't on the map comes from a fair win, and only beaten rivals pay out", () => {
    const s = sandbox(48, 'small', ['hollis', 'fizzco']);
    expect(['strawberry', 'frozen', 'honeyGinger', 'secretReserve'].map((id) => fairWinPage(s, id as 'frozen'))).toEqual([true, true, true, true]);
    expect(fairWinPage(s, 'halfAndHalf')).toBe(false); // Tilly plays: beat her for it
    expect(fairWinPage(s, 'sparkling')).toBe(false);
    expect(blenderBar(s, 'frozen')).toBe(1); // no Blend Shack Trophy from a gang that never played
    const back = migrateSave(JSON.parse(JSON.stringify(s)))!;
    expect(ownedRecipes(back)).not.toContain('frozen'); // an absent rival never fell, so no page comes home on load
  });

  it('rivals grow only on the map, and a save keeps its map', () => {
    const s = sandbox(46, 'medium');
    for (let i = 0; i < 12; i++) dawn(s);
    for (const p of PLOTS) if (s.plots[p.id].owner) expect(plotOnMap(s, p), p.name).toBe(true);
    const back = migrateSave(JSON.parse(JSON.stringify(s)))!;
    expect(back.settings).toMatchObject({ map: 'medium', rivals: s.settings.rivals, districts: s.settings.districts });
    const old = migrateSave(JSON.parse(JSON.stringify(newGame(47))))!;
    expect(mapDistricts(old)).toHaveLength(8); // older saves play the whole bay
  });
});

describe('Every Last Plot', () => {
  /** Everything on the map that can be bought, yours, but for one plot left to buy. */
  const allButOne = (s: GameState) => {
    const left = PLOTS.filter((p) => isPurchasable(p) && plotOnMap(s, p));
    for (const p of left.slice(1)) give(s, p.id);
    const last = left[0];
    drop(s, last.id);
    return last;
  };

  it("counts every purchasable plot on the map: never HQs, civic plots or land off a Sandbox map", () => {
    const s = newGame(81, { mode: 'sandbox', map: 'small' });
    allButOne(s);
    expect(everyLastPlot(s)).toBe(false);
    for (const p of PLOTS) if (isPurchasable(p) && plotOnMap(s, p)) give(s, p.id);
    s.plots[hqPlot('hollis').id].owner = null; // gone bust: an HQ nobody can buy never blocks it
    expect(everyLastPlot(s)).toBe(true);
  });

  it('is earned the moment the last plot is bought, in Endless after the win too, and the Bugle leads with it at dawn', () => {
    const s = newGame(82, { mode: 'sandbox', map: 'small', peaceful: true });
    s.outcome = { result: 'won', how: 'domination', day: s.day };
    s.endlessSince = s.day; // kept squeezing: the victory card is long gone
    const last = allButOne(s);
    s.cash = 1e9;
    dawn(s); // the rank and the paper catch up with all that land first
    dawn(s);
    s.news = [];
    expect(buyPlot(s, last.id)).toBe(true);
    expect(s.everyLastPlotEarned).toEqual({ day: s.day });
    expect(s.news.some((l) => l.startsWith('Lottie: "Every last plot'))).toBe(true);
    const day = s.day;
    dawn(s);
    expect(s.news.filter((l) => l === EVERY_LAST_PLOT_HEADLINE)).toHaveLength(1);
    expect(bugleHeadline(s)).toEqual(['EVERY LAST PLOT!', "Every lot in town flies Lottie's colors"]);
    // Once a run: losing a plot keeps it, winning it back says nothing new.
    drop(s, last.id);
    give(s, last.id);
    s.news = [];
    dawn(s);
    expect(s.news.some((l) => /every last plot/i.test(l))).toBe(false);
    expect(s.everyLastPlotEarned!.day).toBe(day);
  });
});

describe('loan repossession', () => {
  /** Play dawns with plenty of cash up to the morning before the loan's next payment. */
  const upToDue = (s: GameState) => { while (s.day < s.loan!.nextDue - 1) { s.cash = 1e4; dawn(s); } };
  /** The payment dawn, with cash for the wages but not the loan. */
  const miss = (s: GameState) => { upToDue(s); s.cash = 20; dawn(s); };
  const pay = (s: GameState) => { upToDue(s); s.cash = 1e4; dawn(s); };
  const loanGame = (seed: number) => {
    const s = newGame(seed);
    s.plots[LOTTIES_CORNER].stand!.autoRestock = false; // the dawns' only bills are the loan's and the wages
    s.phase = 'report';
    expect(borrow(s, 200)).toBe(true);
    return s;
  };

  it('counts two missed payments, in a row or not, and a miss still counts the week down', () => {
    const s = loanGame(91);
    miss(s);
    expect(s.loan).toMatchObject({ missed: 1, weeksLeft: 3 });
    expect(s.loan!.principal).toBeCloseTo(206, 2); // the missed week's interest is added
    pay(s);
    expect(s.loan).toMatchObject({ missed: 1, weeksLeft: 2 }); // a payment doesn't wipe the miss
    expect(s.news.some((n) => n.startsWith('REPOSSESSED'))).toBe(false);
    miss(s);
    expect(s.news.some((n) => n.startsWith('REPOSSESSED'))).toBe(true);
    expect(s.plots[LOTTIES_CORNER].owner).toBeNull();
  });

  it('takes the lowest-value plot as Net Worth counts it, land plus buildings, credits that, and never a Trophy', () => {
    const s = loanGame(92);
    s.plots[LOTTIES_CORNER].invested = 4050; // a Kiosk on $300 of land: worth more than a bare $1,000 lot
    const lot = purchasablePlots('maple').find((p) => p.id !== LOTTIES_CORNER && !s.plots[p.id].owner)!;
    give(s, lot.id);
    s.plots[lot.id].landValue = 1000;
    give(s, hqPlot('hollis').id);
    s.plots[hqPlot('hollis').id].landValue = 1; // cheapest of all, but a Trophy is never lost
    expect(plotWorth(s, LOTTIES_CORNER)).toBe(300 + 0.75 * 4050);
    miss(s);
    // Land values move with development each dawn: the bank pays what the lot is worth that morning.
    const worth = plotWorth(s, lot.id);
    const owed = s.loan!.principal;
    miss(s);
    expect(s.plots[lot.id].owner).toBeNull();
    expect(s.plots[LOTTIES_CORNER].owner).toBe('player');
    expect(s.plots[hqPlot('hollis').id].owner).toBe('player');
    expect(s.news).toContain(`REPOSSESSED! The First Bank of Citrine Bay takes ${lot.name} to cover $${Math.round(worth).toLocaleString('en-US')} of the loan.`);
    expect(s.loan).toBeUndefined(); // $1,000 of land more than covers what was owed
    expect(worth).toBeGreaterThan(owed);
  });
});

describe('Trophy plots', () => {
  it('a captured HQ holds only its Trophy: no stand and no facility go up there', () => {
    const s = newGame(101);
    eliminate(s, 'hollis', 'buyout');
    const hq = hqPlot('hollis').id;
    expect(s.plots[hq]).toMatchObject({ owner: 'player', stand: null });
    Object.assign(s, { phase: 'prep', cash: 1e7, rank: 10 });
    expect(canBuildStand(s, hq)).toEqual({ ok: false, why: 'A Trophy holds only its HQ' });
    expect(buildStand(s, hq)).toBe(false);
    for (const k of Object.keys(FACILITIES) as FacilityKind[]) expect(canBuildFacility(s, hq, k).ok).toBe(false);
  });

  it('an older save with a stand on its Trophy has it taken down, its cost and its stock paid back', () => {
    const s = newGame(102);
    const hq = hqPlot('hollis').id;
    const st = newStand(2);
    st.inventory.sugar = 10;
    st.inventory.sugarCost = 0.5;
    s.plots[hq] = { ...s.plots[hq], owner: 'player', stand: st, invested: 550 + 120 }; // a Wooden Stand, and a fence
    const back = 550 + stockValue(st);
    const loaded = migrateSave(JSON.parse(JSON.stringify(s)))!;
    expect(loaded.plots[hq]).toMatchObject({ owner: 'player', stand: null, invested: 120 });
    expect(loaded.cash).toBeCloseTo(s.cash + back, 2);
    expect(loaded.today.books?.invested).toBe(550); // on today's Ledger, so the day's rows still add up
    const again = migrateSave(JSON.parse(JSON.stringify(loaded)))!;
    expect(again.cash).toBe(loaded.cash);
  });
});

describe('building stands', () => {
  it('builds any level the rank has unlocked straight onto an empty plot, every step paid at once', () => {
    const s = newGame(111);
    const lot = street(s, 'maple');
    give(s, lot.id);
    Object.assign(s, { cash: 1e6, rank: 3 });
    expect([1, 2, 3, 4, 5].map(standCost)).toEqual([150, 550, 4050, 64050, 714050]);
    expect(canBuildStand(s, lot.id, 4)).toEqual({ ok: false, why: `Needs Rank 5, ${RANKS[4].title}` }); // a Lemon Shack waits for Rank 5
    const cash = s.cash;
    expect(buildStand(s, lot.id, 3)).toBe(true);
    expect(s.cash).toBe(cash - 4050);
    expect(s.plots[lot.id]).toMatchObject({ invested: 4050, stand: { level: 3 } });
    expect(currentHp(s.plots[lot.id])).toBe(800);
    expect(s.plots[lot.id].stand!.price).toBe(priceCeiling(s, lot.id));
    expect(s.news.at(-1)).toBe(`A brand-new Kiosk opens at ${lot.name}!`);
  });

  it('builds and upgrades mid-day: the new level pours, holds and stands at full HP at once; the night waits for morning', () => {
    const s = newGame(112);
    Object.assign(s, { cash: 1e6, rank: 3 });
    openStand(s);
    expect(s.phase).toBe('open');
    const lot = street(s, 'maple');
    give(s, lot.id);
    expect(buildStand(s, lot.id, 2)).toBe(true); // bought and built in business hours
    const ps = s.plots[lot.id];
    ps.stand!.hp = 100; // dented
    ps.stand!.day.customers = 300; // and sold some today
    expect(isDamaged(ps)).toBe(true);
    const cap = storageFor(ps.stand!, 'lemons');
    expect(upgradeStand(s, lot.id)).toBe(true);
    expect(ps.stand!.level).toBe(3);
    expect(currentHp(ps)).toBe(800); // the Kiosk's full HP
    expect(pourRate(s, lot.id)).toBe(120); // its cups an hour from the next minute
    expect(serviceLeft(s, lot.id)).toBe(1200 - 300); // its day's service, less what the Wooden Stand sold
    expect(storageFor(ps.stand!, 'lemons')).toBeGreaterThan(cap);
    s.phase = 'night';
    expect(canUpgradeStand(s, lot.id)).toEqual({ ok: false, why: 'Too late tonight: upgrade tomorrow' });
    const next = street(s, 'maple');
    give(s, next.id);
    expect(canBuildStand(s, next.id)).toEqual({ ok: false, why: 'Too late tonight: build tomorrow' });
  });
});

describe('land, Sit-downs and loans keep no hours', () => {
  it('sell land on the spot, meet at the Diner and see the bank in business hours and the Evening; the Diner shuts at night', () => {
    const s = newGame(121);
    Object.assign(s, { cash: 1e7, rank: 10 }); // Brock is Weakened next to all that cash
    openStand(s);
    const lot = street(s, 'maple');
    expect(canBuyPlot(s, lot.id)).toEqual({ ok: true });
    expect(buyPlot(s, lot.id)).toBe(true);
    expect(s.plots[lot.id].stand).toBeNull(); // a Vacant Lot until a stand goes up
    const theirs = PLOTS.find((p) => s.plots[p.id].owner === 'coldbrew' && p.type !== 'hq' && plotOnMap(s, p))!;
    expect(canTruce(s, 'blenders')).toEqual({ ok: true });
    expect(plotBuyout(s, theirs.id)).toBe(true);
    expect(s.plots[theirs.id].owner).toBe('player');
    expect(canFactionBuyout(s, 'blenders')).toEqual({ ok: true });
    expect(canBorrow(s, 100)).toEqual({ ok: true });
    expect(borrow(s, 100) && repayLoan(s)).toBe(true);
    s.phase = 'report'; // the Evening
    expect(canTruce(s, 'blenders')).toEqual({ ok: true });
    expect(canBuyPlot(s, street(s, 'maple').id)).toEqual({ ok: true });
    s.phase = 'night';
    expect(canTruce(s, 'blenders')).toEqual({ ok: false, why: 'Too late tonight: sit down tomorrow' });
    expect(canFactionBuyout(s, 'blenders')).toEqual({ ok: false, why: 'Too late tonight: sit down tomorrow' });
    expect(canPlotBuyout(s, PLOTS.find((p) => s.plots[p.id].owner === 'coldbrew' && p.type !== 'hq')!.id)).toEqual({ ok: false, why: 'Too late tonight: sit down tomorrow' });
    expect(canBuyPlot(s, street(s, 'maple').id)).toEqual({ ok: true }); // land still sells on the spot
    expect(canBorrow(s, 100)).toEqual({ ok: true });
  });
});

describe('the pacing harness (tools/pacing.ts)', () => {
  it('plays the reference map through the public actions and reads the run against the spec', () => {
    const r = playRun({ seed: REFERENCE_SEED, days: 8 });
    expect(r.stuck).toBeUndefined();
    expect(r.days.map((d) => d.day)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(r.days.every((d) => d.income > 0 && d.stands >= 1)).toBe(true);
    expect(r.days.at(-1)!.netWorth).toBeGreaterThan(r.days[0].netWorth); // it grows the business
    expect(r.news.length).toBeGreaterThan(0); // and buys something new
    const names = checkRun(r).map((c) => c.name);
    expect(names).toEqual(expect.arrayContaining(['first L2 stand', 'Rank 2', 'Rank 10', 'Domination', 'takings Days 1-8', 'security Days 1-14', 'first chopper loaded', 'longest lull', 'Rank 9 bar over Rank 8']));
    const chart = chartChecks(r, pacingCsv);
    expect(chart.map((c) => [c.name, c.target])).toEqual([['Net Worth Day 1', '$662']]); // the chart's Day 1, read from docs/spec/pacing.csv
  });

  it('holds a milestone to its target on the reference map and to the ten-map range on the others', () => {
    expect(hits(4, CLASSIC_RANK_DAYS[2], true)).toBe(true);
    expect(hits(5, CLASSIC_RANK_DAYS[2], true)).toBe(false); // a day late is 25% off
    expect(hits(59, CLASSIC_RANK_DAYS[6], true)).toBe(false); // within 15% of Day 55, but past the 52-58 window
    expect(hits(59, CLASSIC_RANK_DAYS[6], false)).toBe(true); // inside the maps' 48-60
    expect(hits(135, DOMINATION.classic, true)).toBe(false); // never before Day 136
    expect(hits(undefined, CLASSIC_FIRST_L2, false)).toBe(false); // never reached
  });

  it('measures the longest lull between firsts, up to the win', () => {
    const run = { days: [{ day: 30 }], news: [{ day: 4, what: 'Rank 2' }, { day: 12, what: 'Rank 3' }, { day: 15, what: 'first Kiosk' }], outcome: { result: 'won', how: 'domination', day: 25 } } as unknown as RunResult;
    expect(longestLull(run)).toEqual({ days: 10, from: 15 }); // Day 15 to the win on Day 25
  });
});
