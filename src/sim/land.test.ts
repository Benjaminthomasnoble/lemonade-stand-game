import { describe, expect, it } from 'vitest';
import {
  announceControl, blenderBar, borrow, bugleHeadline, buyPlot, plotWorth, canBuildStand, EVERY_LAST_PLOT_HEADLINE, everyLastPlot, fairWinPage, isPurchasable, ownedRecipes, canBuyPlot, connected, controlTier, cutMap, development, dominationProgress, FACTIONS, hasFoothold, hqPlot, inPlay,
  buildStand, canBuildFacility, eliminate, FACILITIES, type FacilityKind,
  canUpgradeStand, currentHp, isDamaged, openStand, pourRate, priceCeiling, RANKS, serviceLeft, standCost, storageFor, upgradeStand,
  canBorrow, canFactionBuyout, canPlotBuyout, canTruce, plotBuyout, repayLoan, LOAN, netWorth,
  LOTTIES_CORNER, LOTTIES_SIDE_LOT, MAP_SIZES, mapDistricts, migrateSave, newGame, newStand, nextTier, NO_DEFENSE, offerSideLot, onMap, openAuction, perkActive, picksFit, plotBuyoutPrice, plotOnMap,
  plotPrice, PLOTS, plotsForTier, plotType, purchasablePlots, rivalsInPlay, sleepUntilDawn, type DistrictId, type GameState, type RivalId,
} from './economy.ts';
import { rowAmount, stockValue } from './ledger.ts';
import { CLOSE, LAVENDER, LESSON_DAY } from './balance.ts';
import { openLavender } from './auction.ts';
import { grantPage } from './recipes.ts';
import { clubhouseSite } from './clubhouse.ts';
import { buildClubhouse, canBuildClubhouse, postedAt, postGuard, welcomeDex } from './crew.ts';
import { comeToTown, thinnestDistrict } from './schemes.ts';
import { TIP_IDS } from './perks.ts';
import type { DayCall } from './calls.ts';
import pacingCsv from '../../docs/spec/pacing.csv?raw';
import {
  bestTip, buyouts, campaignCandidates, chartChecks, checkRun, CLASSIC_FIRST_L2, CLASSIC_RANK_DAYS, DOMINATION, evening, growthCandidates, hits, holdTheSiege, longestLull, milestones, morning, newBot, pacingPlan, pacingReport,
  pickAnswer, playRun, RANK_DAYS, REFERENCE_SEED, runFromText, runToText, spreadChecks, TIP_ORDER, type PacingJob, type RunResult,
} from '../../tools/pacing.ts';

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

  it('a page that comes home names no boss the Sandbox left out, and the harp teacher sells without Vera', () => {
    const s = sandbox(48, 'small', ['hollis', 'fizzco']); // no Brock, no Juni, no Vera
    const said = (id: 'strawberry' | 'frozen' | 'honeyGinger' | 'halfAndHalf' | 'lavender' | 'sparkling') => {
      s.news = [];
      expect(grantPage(s, id)).toBe(true);
      return s.news.join(' ');
    };
    for (const id of ['strawberry', 'frozen', 'honeyGinger', 'lavender'] as const) {
      const line = said(id);
      expect(line, id).toContain('comes home');
      expect(line, id).not.toMatch(/Brock|Juni|Vera/);
    }
    expect(said('halfAndHalf')).toContain('Tilly hands over'); // Tilly plays
    expect(said('sparkling')).toContain('FizzCo boardroom');
    const t = sandbox(48, 'small', ['hollis', 'fizzco']);
    t.rank = LAVENDER.rank;
    openLavender(t);
    expect(t.news.some((n) => n.includes('auctioning the Lavender page') && !n.includes('Vera') && !n.includes('Hilltop'))).toBe(true);
    const c = newGame(48);
    c.news = [];
    grantPage(c, 'strawberry', false, false);
    expect(c.news.join(' ')).toContain('Brock never learned'); // the campaign names its bosses
  });

  it('a Clubhouse goes on a plot the map tags a Street, never on a street plot it retagged as a Field or a Dock', () => {
    const s = sandbox(49, 'small', ['fizzco', 'coldbrew']); // the cut retags an Old Town street plot as a Field, a Downtown one as a Dock
    const field = Object.keys(s.settings.retag!).find((id) => s.settings.retag![id] === 'field')!;
    expect(PLOTS.find((p) => p.id === field)!.type).toBe('street');
    const lot = PLOTS.find((p) => p.district === 'oldtown' && plotType(s, p) === 'street' && !s.plots[p.id].owner)!;
    give(s, field);
    expect(clubhouseSite(s)).toBeNull(); // the Field is no Street plot on this map
    give(s, lot.id);
    s.rank = 6;
    s.cash = 1e6;
    s.phase = 'prep';
    expect(clubhouseSite(s)).toBe(lot.id);
    expect(canBuildClubhouse(s)).toEqual({ ok: true });
    expect(buildClubhouse(s)).toBe(true);
    expect(s.plots[lot.id].facility?.kind).toBe('clubhouse');
    expect(s.plots[field].facility).toBeUndefined();
  });

  it("an Out-of-Towner buys into the map's thinnest district, never land off the map or a lot it retagged", () => {
    const s = sandbox(5, 'small', ['fizzco', 'coldbrew']); // Maple Row, Old Town, Campus and Downtown
    s.endlessSince = s.day; // the win, and Keep squeezing
    const where = thinnestDistrict(s)!;
    expect(onMap(s, where)).toBe(true);
    expect(comeToTown(s, 'snootwater')).toBe(true);
    const bought = PLOTS.filter((p) => s.plots[p.id].owner === 'snootwater');
    expect(bought.length).toBeGreaterThan(0);
    for (const p of bought) {
      expect(plotOnMap(s, p), p.name).toBe(true);
      expect(['street', 'prime', 'landmark']).toContain(plotType(s, p));
    }
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
  /** The news's whole dollars. */
  const dollars = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
  const loanGame = (seed: number) => {
    const s = newGame(seed);
    s.plots[LOTTIES_CORNER].stand!.autoRestock = false; // the dawns' only bills are the loan's and the wages
    s.phase = 'report';
    expect(borrow(s, 150)).toBe(true); // the bank's limit at the $525 start: half of $375 ($300 of land, 75% of the $100 table), in $50 steps
    return s;
  };

  it('counts two missed payments, in a row or not, and a miss still counts the week down', () => {
    const s = loanGame(91);
    miss(s);
    expect(s.loan).toMatchObject({ missed: 1, weeksLeft: 3 });
    expect(s.loan!.principal).toBeCloseTo(154.5, 2); // the missed week's interest is added
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
    upToDue(s);
    s.cash = 20;
    const owed = Math.round(s.loan!.principal * (1 + LOAN.weeklyRate) * 100) / 100; // the missed week's interest goes on first
    dawn(s);
    expect(s.plots[lot.id].owner).toBeNull();
    expect(s.plots[LOTTIES_CORNER].owner).toBe('player');
    expect(s.plots[hqPlot('hollis').id].owner).toBe('player');
    // $1,000 of land more than covers what was owed: the loan is cleared and the bank pays back the rest.
    const back = Math.round((worth - owed) * 100) / 100;
    expect(s.news).toContain(`REPOSSESSED! The First Bank of Citrine Bay takes ${lot.name} for the ${dollars(owed)} loan and pays back ${dollars(back)}.`);
    expect(s.loan).toBeUndefined();
    expect(rowAmount(s.today, 'invested')).toBeCloseTo(back, 2); // as for a plot sold
  });

  it("goes past Lottie's Corner while another plot is left, and counts a stand's stock at cost as Net Worth does", () => {
    const s = loanGame(93);
    s.plots[LOTTIES_CORNER].stand!.inventory = { lemons: [], sugar: 0, sugarCost: 0, ice: 0, iceCost: 0 }; // the $100 table on $300 of land
    const lot = purchasablePlots('maple').find((p) => p.id !== LOTTIES_CORNER && !s.plots[p.id].owner)!;
    give(s, lot.id);
    const st = newStand(1);
    st.autoRestock = false;
    st.inventory.sugar = 40;
    st.inventory.sugarCost = 0.5; // $20 of sugar on hand
    s.plots[lot.id] = { ...s.plots[lot.id], stand: st, landValue: 500 };
    expect(plotWorth(s, lot.id)).toBe(500 + 20);
    expect(netWorth(s)).toBeCloseTo(s.cash - s.loan!.principal + plotWorth(s, LOTTIES_CORNER) + plotWorth(s, lot.id), 2);
    miss(s);
    upToDue(s);
    s.cash = 20;
    const owed = Math.round(s.loan!.principal * (1 + LOAN.weeklyRate) * 100) / 100;
    const worth = plotWorth(s, lot.id);
    expect(plotWorth(s, LOTTIES_CORNER)).toBeLessThan(worth); // the Corner is the cheapest plot
    dawn(s);
    expect(s.plots[LOTTIES_CORNER].owner).toBe('player');
    expect(s.plots[lot.id]).toMatchObject({ owner: null, stand: null });
    expect(s.news).toContain(`REPOSSESSED! The First Bank of Citrine Bay takes ${lot.name} for the ${dollars(owed)} loan and pays back ${dollars(worth - owed)}.`);
    expect(rowAmount(s.today, 'invested')).toBeCloseTo(worth - owed, 2); // the sugar went with the stand, at cost
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

describe('Fire Sale prices follow the land', () => {
  it("a dawn after the rival falls, First Dibs costs 75% of that day's land value, not the day it fell", () => {
    const s = newGame(11);
    dawn(s); // land values carry the bay's development from the first dawn
    const theirs = PLOTS.filter((p) => s.plots[p.id].owner === 'blenders' && p.type !== 'hq');
    eliminate(s, 'blenders', 'bankrupt'); // the Fire Sale clears their stands off the Boardwalk
    const one = theirs[0];
    const fell = s.plots[one.id].landValue;
    expect(plotPrice(s, one.id)).toBe(Math.round(fell * 0.75));
    dawn(s); // the Boardwalk's development drops with their stands gone, and its land with it
    const land = s.plots[one.id].landValue;
    expect(land).toBeLessThan(fell);
    expect(s.plots[one.id].dibs).toMatchObject({ who: 'player', until: s.day }); // the second and last day of First Dibs
    expect(plotPrice(s, one.id)).toBe(Math.round(land * 0.75)); // still 25% off
    expect(canBuyPlot(s, one.id)).toEqual(s.cash >= plotPrice(s, one.id) ? { ok: true } : { ok: false, why: `Needs $${plotPrice(s, one.id).toLocaleString('en-US')}` });
  });

  it("leaves Lottie's side-lot offer at its fixed $300", () => {
    const s = newGame(12);
    s.day = 3;
    offerSideLot(s);
    dawn(s);
    expect(s.plots[LOTTIES_SIDE_LOT].dibs).toMatchObject({ price: 300, table: true });
    expect(plotPrice(s, LOTTIES_SIDE_LOT)).toBe(300);
  });
});

describe("Skip's Old Town corner", () => {
  it('passes over a plot on the block: he names the cheapest Old Town lot you can buy on the spot', () => {
    const s = newGame(301);
    s.scenes!.seen.push('opening', 'steward', 'dex', 'benny');
    Object.assign(s, { rank: 2, day: 7, cash: 1e5 });
    const open = () => PLOTS.filter((p) => p.district === 'oldtown' && p.type === 'street' && !s.plots[p.id].owner && !s.plots[p.id].auction);
    const cheapest = open().reduce((a, b) => (plotPrice(s, b.id) < plotPrice(s, a.id) ? b : a));
    openAuction(s, cheapest.id, 'sale'); // a smashed lot whose First Dibs lapsed
    s.plots[cheapest.id].auction!.closes = s.day + 3; // still on the block at the next dawn
    dawn(s);
    const q = s.scenes!.queue.find((x) => x.id === 'skip')!;
    expect(q.data!.plot).not.toBe(cheapest.id);
    const lot = q.data!.plot!;
    expect(Math.min(...open().map((p) => plotPrice(s, p.id)))).toBe(plotPrice(s, lot));
    expect(canBuyPlot(s, lot).ok).toBe(true);
    expect(s.alerts?.some((a) => a.plot === lot && a.text.startsWith('Skip:'))).toBe(true);
  });
});

describe('Plot Buyouts and your own raids', () => {
  it('refuse the plot your planned raid is aimed at, until the fight is over', () => {
    const s = newGame(122);
    Object.assign(s, { cash: 1e7, rank: 10 });
    const theirs = PLOTS.find((p) => s.plots[p.id].owner === 'coldbrew' && p.type !== 'hq' && plotOnMap(s, p))!;
    expect(canPlotBuyout(s, theirs.id)).toEqual({ ok: true });
    s.raids.push({ id: 'r1', attacker: 'player', target: theirs.id, objective: 'smash', guards: [], detected: false, eta: '23:40' });
    expect(canPlotBuyout(s, theirs.id)).toEqual({ ok: false, why: 'Your crew raids it tonight' });
    expect(plotBuyout(s, theirs.id)).toBe(false);
    s.raids[0].back = s.minute + 30; // fought: the squad walks home
    expect(canPlotBuyout(s, theirs.id)).toEqual({ ok: true });
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
  let ref: RunResult | undefined;
  /** The reference map's first 8 days, played once for every test that reads them. */
  const ref8 = () => (ref ??= playRun({ seed: REFERENCE_SEED, days: 8 }));

  it('plays the reference map through the public actions and reads the run against the spec', () => {
    const r = ref8();
    expect(r.stuck).toBeUndefined();
    expect(r.days.map((d) => d.day)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(r.days.every((d) => d.income > 0 && d.stands >= 1)).toBe(true);
    expect(r.days.at(-1)!.netWorth).toBeGreaterThan(r.days[0].netWorth); // it grows the business
    expect(r.news.length).toBeGreaterThan(0); // and buys something new
    const names = checkRun(r).map((c) => c.name);
    expect(names).toEqual(expect.arrayContaining(['first L2 stand', 'Rank 2', 'Rank 10', 'Domination', 'takings Days 1-8', 'security Days 1-14', 'first chopper loaded', 'longest lull', 'Rank 9 bar over Rank 8']));
    const chart = chartChecks(r, pacingCsv);
    expect(chart.map((c) => [c.name, c.target])).toEqual([['Net Worth Day 1', '$662'], ['Rank Day 1', 'Rank 1']]); // the chart's Day 1, read from docs/spec/pacing.csv
    expect(chart[1]).toMatchObject({ got: 'Rank 1', ok: true });
  });

  /** A run's record without playing it: `days` business days, the ranks and the win given. */
  const record = (difficulty: 'classic' | 'cutthroat', days: number, rest: Partial<RunResult>): RunResult => ({
    seed: 1, difficulty, rankDay: { 1: 1 }, firstLoad: {}, raids: [], news: [], paybacks: {}, traffic: {}, ...rest,
    days: Array.from({ length: days }, (_, i) => ({ day: i + 1, rank: 1, netWorth: 0, score: 0, cash: 0, income: 0, orders: 0, vip: 0, security: 0, stands: 1, levels: [1], raidsOnYou: 0 })),
  });
  const check = (r: RunResult, name: string, reference = true) => checkRun(r, reference).find((c) => c.name === name);

  it("holds Cutthroat's Domination to the ten maps' 134-163 and to Day 170 on every map", () => {
    expect(DOMINATION.cutthroat).toMatchObject({ target: 151, lo: 134, hi: 163 });
    const late = record('cutthroat', 170, { outcome: { result: 'won', how: 'domination', day: 165 } });
    expect(check(late, 'Domination', false)?.ok).toBe(false); // past the maps' 163
    expect(check(late, 'Domination before Day 170', false)).toMatchObject({ got: 'Day 165', ok: true }); // but before Day 170
    expect(check(record('cutthroat', 170, {}), 'Domination before Day 170', false)).toMatchObject({ got: 'never', ok: false });
    expect(check(record('cutthroat', 100, {}), 'Domination before Day 170', false)?.ok).toBeNull(); // a short run isn't judged
    expect(check(record('classic', 170, {}), 'Domination before Day 170')).toBeUndefined(); // Cutthroat's promise
    expect(spreadChecks([late, record('cutthroat', 170, {})]).find((c) => c.name === 'Domination before Day 170')).toMatchObject({ got: '1 of 2 maps', ok: false });
  });

  it('holds the Rank 8 to Rank 9 gap to 31 days on the reference map, within 15%', () => {
    const gap = (from: number, to: number, reference = true) => check(record('classic', 170, { rankDay: { 1: 1, 8: from, 9: to } }), 'Rank 8 to Rank 9', reference);
    expect(gap(104, 135)).toMatchObject({ target: '31 days', got: '31 days', ok: true }); // the spec's own run
    expect(gap(100, 135)?.ok).toBe(true); // 35 days: inside 15%
    expect(gap(100, 137)?.ok).toBe(false); // 37 days
    expect(gap(100, 137, false)?.ok).toBeNull(); // the other maps: shown, not judged
    expect(check(record('cutthroat', 170, { rankDay: { 1: 1, 8: 108, 9: 143 } }), 'Rank 8 to Rank 9')).toMatchObject({ target: '35 days', ok: true });
  });

  it("reads the passersby on each plot an L4 or L5 went on against the paybacks' ~1,800 and ~4,000", () => {
    const r = record('classic', 30, { traffic: { 4: [1490, 2460, 4410], 5: [2550] } });
    expect(check(r, 'L4 plots')).toMatchObject({ target: '~1,800+ passersby a day', got: 'median 2,460 of 3 built', ok: true });
    expect(check(r, 'L5 plots')).toMatchObject({ got: 'median 2,550 of 1 built', ok: false }); // a Palace on a quiet plot
    expect(check(record('classic', 30, {}), 'L4 plots')).toBeUndefined(); // none built yet
    expect(ref8().traffic).toEqual({}); // no Lemon Shack by Day 8
  });

  it('plays every system a player has, and plays it the same way every time', () => {
    const r = ref8();
    expect(r.played?.lapsed).toBe(0); // every day call answered as it broke in
    for (const k of ['tips', 'cards', 'calls', 'campaigns'] as const) expect(r.played?.[k], k).toBeGreaterThan(0); // Lottie's Rank 2 hand, recipe cards from Day 2, the calls, campaigns from Day 6
    expect(playRun({ seed: REFERENCE_SEED, days: 8 })).toEqual(r); // seeded: a second run makes every choice again
  });

  it('prints the same report from runs played in other processes (sim-report pacing --jobs)', () => {
    const sweep = pacingPlan(['170', '10', 'all', '--jobs', '2']);
    expect(sweep).toMatchObject({ days: 170, maps: 10, diffs: ['laidback', 'classic', 'cutthroat'], verbose: false, jobs: 2 });
    expect(sweep.runs).toHaveLength(30);
    expect(sweep.runs.slice(0, 2)).toEqual([{ seed: REFERENCE_SEED, difficulty: 'laidback' }, { seed: REFERENCE_SEED + 1, difficulty: 'laidback' }]);
    expect(pacingPlan(['-v', '--jobs=3', '--keep', 'runs'])).toMatchObject({ days: 170, maps: 1, diffs: ['classic'], verbose: true, jobs: 3, keep: 'runs' });
    expect(pacingPlan(['8', '1'])).toMatchObject({ days: 8, jobs: 1 }); // in this process
    expect(pacingPlan(['8', '1']).keep).toBeUndefined();
    const r = ref8();
    const back = runFromText(runToText({ ...r, raids: [{ day: 9, cost: 50, days: Infinity }] }, ['a -v line']));
    expect(back.log).toEqual(['a -v line']);
    expect(back.r.raids[0].days).toBe(Infinity); // JSON alone would make it null
    const report = (run: (job: PacingJob) => RunResult) => { const out: string[] = []; pacingReport(['8', '1', 'classic'], pacingCsv, (l) => out.push(l), run); return out; };
    expect(report(() => runFromText(runToText(r)).r)).toEqual(report(() => r));
  });

  it("keeps the tip best for growth from Lottie's hand", () => {
    expect([...TIP_ORDER].sort()).toEqual([...TIP_IDS].sort()); // every tip, ranked once
    expect(bestTip(['helpWanted', 'lockbox', 'sweetTalk'])).toBe('sweetTalk');
  });

  it("takes a day call's priced choice when it pays back today and the free one otherwise, and never chases a gang off", () => {
    const s = newGame(REFERENCE_SEED);
    openStand(s);
    const bot = newBot();
    const ring = (kind: DayCall['kind']): DayCall => {
      const call: DayCall = { id: 99, kind, at: s.minute, plot: LOTTIES_CORNER, rival: kind === 'permit' || kind === 'rush' ? null : 'blenders', live: true };
      s.calls = { day: s.day, list: [call], mods: {} };
      return call;
    };
    expect(pickAnswer(s, bot, ring('heckler'))).toBe(0); // $8 keeps a whole day of walkers
    expect(pickAnswer(s, bot, ring('undercut'))).toBe(1); // $10 of free samples beats a quarter off every cup
    expect(pickAnswer(s, bot, ring('permit'))).toBe(1); // a $15 fee against half a chance of a $30 fine: a tie goes to the free one
    const open = s.minute;
    s.minute = CLOSE - 60; // an hour from closing, $8 or $10 doesn't come back
    expect(pickAnswer(s, bot, ring('heckler'))).toBe(2); // Ignore him
    expect(pickAnswer(s, bot, ring('undercut'))).not.toBe(1);
    s.minute = open;
    s.cash = 5;
    expect(pickAnswer(s, bot, ring('heckler'))).toBe(2); // can't pay him: ignore him, never Chase him off (1)
    // A rumor: a rushed fence from the security money when it costs less than a smash would, else a free guard posted.
    s.cash = 1000;
    expect(pickAnswer(s, bot, ring('rumor'))).toBe(1); // no money set aside, no guard: Bring it on
    bot.sec = 1000;
    expect(pickAnswer(s, bot, ring('rumor'))).toBe(0); // Rush a Picket fence
    s.rank = 2;
    welcomeDex(s);
    postGuard(s, s.guards[0].id, null);
    bot.sec = 0;
    expect(pickAnswer(s, bot, ring('rumor'))).toBe(1); // Post a guard (Bring it on moves to 2)
  });

  it('holds firm once at the diner, then shakes on the counter after a walk-out', () => {
    const s = newGame(1);
    s.rank = 7;
    s.cash = 5e7;
    s.rivals.coldbrew.grudge = 100; // too sore to come down
    const bot = newBot();
    buyouts(s, bot);
    expect(bot.firm.has('coldbrew')).toBe(true);
    expect(s.rivals.coldbrew).toMatchObject({ alive: true, haggle: { out: true } }); // Juni walked out
    s.day += 1;
    buyouts(s, bot);
    expect(s.rivals.coldbrew.alive).toBe(false); // signed at her counter
    expect(bot.played.firm).toBe(1); // held firm once
  });

  it('weighs campaigns, fit-outs and Billboards on the day they would run, without spending a cent', () => {
    const s = newGame(REFERENCE_SEED);
    s.day = 6; // the marketing lesson
    s.rank = 3;
    s.plots[LOTTIES_CORNER].stand!.level = 3;
    const before = JSON.stringify(s);
    const ads = campaignCandidates(s, 1e6);
    expect(ads.map((b) => b.what)).toEqual(expect.arrayContaining([expect.stringContaining('Sandwich-Board Kid'), expect.stringContaining('Free Sample Day')]));
    expect(ads.every((b) => b.gain > 0 && b.kind === 'campaigns')).toBe(true);
    const specs = growthCandidates(s, 1e6).filter((b) => b.kind === 'specs');
    expect(specs.map((b) => b.what)).toEqual(expect.arrayContaining([expect.stringContaining('Express Window'), expect.stringContaining('Fancy Menu'), expect.stringContaining('Billboard Roof')]));
    expect(specs.every((b) => b.gain > 0)).toBe(true);
    expect(JSON.stringify(s)).toBe(before); // every trial put back
    s.rank = 7;
    s.brandTier = 4; // a Billboard's gates
    for (const p of PLOTS.filter((x) => x.district === 'maple' && (x.type === 'street' || x.type === 'prime') && !s.plots[x.id].owner).slice(0, 4)) {
      give(s, p.id);
      s.plots[p.id].stand = newStand(3);
    }
    const mid = JSON.stringify(s);
    const boards = growthCandidates(s, 1e7).filter((b) => b.kind === 'billboards');
    expect(boards.length).toBeGreaterThan(0);
    expect(boards.every((b) => b.gain > 0)).toBe(true);
    expect(JSON.stringify(s)).toBe(mid); // every trial put back
  });

  it('borrows what a buy is short when it pays back inside the loan, one loan at a time, and sets Profit policies from Rank 7', () => {
    const s = newGame(REFERENCE_SEED);
    const lot = street(s, 'maple').id;
    give(s, lot); // a bare lot to build on, and land for the bank to lend against
    s.cash = 200;
    const bot = newBot();
    morning(s, bot);
    expect(s.loan).toBeDefined();
    expect(bot.played.loans).toBe(1);
    expect(s.plots[lot].stand).not.toBeNull(); // built with it
    const owed = { ...s.loan };
    s.cash = 60;
    morning(s, bot);
    expect(s.loan).toEqual(owed); // no second loan while one is out
    expect(bot.played.loans).toBe(1);
    s.rank = 7;
    s.cash = 1e5;
    morning(s, bot);
    expect(s.policies?.maple?.kind).toBe('profit');
    expect(bot.played.policies).toBe(1);
  });

  it('kits its guards out as the rank opens the gear, from the security money', () => {
    const s = newGame(REFERENCE_SEED);
    s.day = 10; // past Dex's lesson
    s.rank = 3;
    welcomeDex(s);
    const dex = s.guards[0];
    const bot = newBot();
    bot.takings = [1e4]; // a week of takings to set the security money against
    bot.sec = 1e4;
    s.cash = 1e5;
    morning(s, bot);
    expect(s.guards.map((g) => [g.weapon, g.gear])).toEqual(s.guards.map(() => ['clubs', 'vest'])); // Rank 3's kit, Dex's and the hires'
    expect(bot.played.kits).toBe(2 * s.guards.length);
    s.rank = 6;
    s.cash = 1e5;
    bot.sec = 1e3; // short of Hatchets ($1,200) and Pro Gear ($1,500)
    morning(s, bot);
    expect([dex.weapon, dex.gear]).toEqual(['clubs', 'vest']);
    bot.takings = [1e5];
    bot.sec = 1e5;
    s.cash = 1e6;
    morning(s, bot);
    expect(s.guards.map((g) => [g.weapon, g.gear])).toEqual(s.guards.map(() => ['hatchets', 'pro'])); // Rank 6's
  });

  it("mans the plots a siege night names, the most seasoned first, and sends nobody out", () => {
    const s = newGame(REFERENCE_SEED);
    s.day = 130;
    s.rank = 9;
    welcomeDex(s);
    const dex = s.guards[0];
    dex.level = 1;
    postGuard(s, dex.id, null); // in the reserve
    const [named, far] = PLOTS.filter((p) => p.district === 'maple' && p.type === 'street' && !s.plots[p.id].owner).slice(0, 2).map((p) => p.id);
    for (const id of [named, far]) { give(s, id); s.plots[id].stand = newStand(3); } // Kiosks: 3 posts each
    s.plots[LOTTIES_CORNER].stand!.level = 4; // a Lemon Shack: 4 posts
    const hire = (level: number, post: string | null) => { s.guards.push({ ...dex, id: `g${s.nextId++}`, name: `Guard ${s.nextId}`, level, post }); };
    [1, 1, 1].forEach((l) => hire(l, named)); // already on a named plot: they stay
    [5, 4, 2].forEach((l) => hire(l, far));
    hire(3, null);
    expect(holdTheSiege(s)).toBe(0); // no siege, nobody moves
    s.squeeze = { posted: 129, called: 130, nights: 0, held: 0, lost: 0, targets: [LOTTIES_CORNER, named] };
    expect(holdTheSiege(s)).toBe(4);
    expect(postedAt(s, LOTTIES_CORNER).map((g) => g.level).sort().reverse()).toEqual([5, 4, 3, 2]);
    expect(postedAt(s, named).map((g) => g.level)).toEqual([1, 1, 1]);
    expect(postedAt(s, far)).toEqual([]);
    expect(dex.post).toBeNull(); // the least seasoned stays in the reserve
    const bot = newBot();
    evening(s, bot);
    expect(s.raids.filter((r) => r.attacker === 'player')).toEqual([]);
  });

  it('holds a milestone to its target on the reference map and to the ten-map range on the others', () => {
    expect([CLASSIC_FIRST_L2, CLASSIC_RANK_DAYS[2]]).toEqual([{ target: 5, lo: 5, hi: 6 }, { target: 5, lo: 5, hi: 6 }]);
    // the Day 5 lessons: Lottie's Wooden Stand nudge and the rank chip
    expect([CLASSIC_FIRST_L2.target, CLASSIC_RANK_DAYS[2].target, RANK_DAYS.laidback[0], RANK_DAYS.cutthroat[0]]).toEqual([LESSON_DAY.upgrade, LESSON_DAY.rank, LESSON_DAY.rank, LESSON_DAY.rank]);
    for (const d of ['laidback', 'cutthroat'] as const) { // Rank 2 on Day 5-6 there too: a Day 4 Rank 2 comes before its lesson
      const rank2 = milestones(d).find((m) => m.name === 'Rank 2')!.t;
      expect(rank2, d).toEqual(CLASSIC_RANK_DAYS[2]);
      expect(hits(4, rank2, false), d).toBe(false);
    }
    expect(hits(5, CLASSIC_RANK_DAYS[2], true)).toBe(true);
    expect(hits(4, CLASSIC_FIRST_L2, true)).toBe(false); // a day early is 20% off
    expect(hits(6, CLASSIC_RANK_DAYS[2], true)).toBe(false); // a day late is 20% off
    expect(hits(6, CLASSIC_RANK_DAYS[2], false)).toBe(true); // inside the maps' 5-6
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
