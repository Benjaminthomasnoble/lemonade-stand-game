import { describe, expect, it } from 'vitest';
import {
  announceControl, blenderBar, buyPlot, canBuildStand, fairWinPage, ownedRecipes, canBuyPlot, connected, controlTier, cutMap, development, dominationProgress, FACTIONS, hasFoothold, hqPlot, inPlay,
  LOTTIES_CORNER, MAP_SIZES, mapDistricts, migrateSave, newGame, newStand, nextTier, NO_DEFENSE, onMap, perkActive, picksFit, plotBuyoutPrice, plotOnMap,
  plotPrice, PLOTS, plotsForTier, plotType, purchasablePlots, rivalsInPlay, sleepUntilDawn, type DistrictId, type GameState, type RivalId,
} from './economy.ts';

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
