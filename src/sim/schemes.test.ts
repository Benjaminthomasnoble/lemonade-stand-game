import { describe, expect, it } from 'vitest';
import {
  budgetOf, FACTIONS, keptShare, migrateSave, nearbyPlots, newGame, newStand, openStand, PLOT_BY_ID, PLOTS, priceWarCut, rivalPrice,
  runningSchemes, SCHEMES, schemesAtDawn, simulateRestOfDay, sleepUntilDawn, snipeBid, startScheme, warAt, warFront,
  BRAND_TIERS, canRunCampaign, CEASE, ceaseAndDesist, ceaseAndDesistIn, LOTTIES_CORNER, marketingMultiplier,
  answerBuyout, canSellToFizzco, offerOn, TAKEOVER,
  canBuyPlot, canPlotBuyout, freezeLand, landFrozen, mayorsFine, OLD_MONEY,
  type DayStats, type GameState, type RivalId,
} from './economy.ts';
import { schemeNote, schemeTickets } from '../ui/schemes.ts';

const RIVALS = Object.keys(FACTIONS) as RivalId[];
const cents = (n: number) => Math.round(n * 100) / 100;

/** Lottie opens a stand on the street next to one of `id`'s stands, so the two share passers-by. */
function nextTo(s: GameState, id: RivalId): { theirs: string; mine: string } {
  for (const p of PLOTS) {
    const ps = s.plots[p.id];
    if (ps.owner !== id || !ps.stand || p.type === 'hq') continue;
    const q = nearbyPlots(p).find((x) => x.id !== p.id && (x.type === 'street' || x.type === 'prime') && s.plots[x.id].owner !== id);
    if (!q) continue;
    s.plots[q.id] = { ...s.plots[q.id], owner: 'player', stand: newStand(1, 1) };
    return { theirs: p.id, mine: q.id };
  }
  throw new Error(`no street next to ${id}`);
}

/** Nobody starts anything new (a Truce with everyone); what's running carries on. */
const hush = (s: GameState) => { for (const id of RIVALS) s.rivals[id].truceUntil = 999; };

describe('price wars', () => {
  it('cut a rival\'s prices 25% at its stands near yours for 3 days, and Strike pays the margin it gives up', () => {
    const s = newGame(3);
    s.day = 10;
    const { theirs } = nextTo(s, 'blenders');
    const base = s.plots[theirs].stand!.price;
    expect(base).toBe(rivalPrice('blenders', s.plots[theirs].stand!.level, PLOT_BY_ID[theirs]));
    const war = startScheme(s, 'blenders', 'priceWar')!;
    expect(war).toMatchObject({ kind: 'priceWar', by: 'blenders', day: 10, until: 12 });
    expect(war.plots).toEqual(warFront(s, 'blenders'));
    expect(war.plots).toContain(theirs);
    expect(s.plots[theirs].stand!.price).toBeCloseTo(base * 0.75, 2);
    expect(priceWarCut(s, 'blenders', theirs)).toBe(0.75);
    expect(priceWarCut(s, 'hollis', theirs)).toBe(1);
    expect(warAt(s, theirs)).toBe(war);
    expect(s.news.at(-1)).toBe('Bugle: Price war! The Boardwalk Blenders cut prices near Lottie\'s');
    hush(s);
    const f = FACTIONS.blenders;
    for (let day = 11; day <= 13; day++) {
      s.day = day;
      for (const p of war.plots) s.plots[p].stand!.day.revenue = p === theirs ? 300 : 0; // yesterday's till, all at the cut price
      const before = { ...budgetOf(s, 'blenders') };
      schemesAtDawn(s);
      const lost = 300 * (0.25 / 0.75) * keptShare(s, 'blenders', theirs); // the cut on every cup sold
      const b = budgetOf(s, 'blenders');
      expect(b.strike - before.strike).toBeCloseTo(-lost * (f.grow + f.guard), 1);
      expect(b.grow - before.grow).toBeCloseTo(lost * f.grow, 1);
      expect(b.guard - before.guard).toBeCloseTo(lost * f.guard, 1);
      expect(b.grow + b.guard + b.strike).toBeCloseTo(before.grow + before.guard + before.strike, 1); // money moves, none is made
      expect(s.plots[theirs].stand!.price).toBeCloseTo(day < 13 ? base * 0.75 : base, 2);
    }
    expect(war.done).toBe(true);
    expect(war.cost).toBeCloseTo(3 * 100 * keptShare(s, 'blenders', theirs), 1);
    expect(priceWarCut(s, 'blenders', theirs)).toBe(1);
    expect(s.news.at(-1)).toBe('Bugle: Price war over: The Boardwalk Blenders back to full price');
  });

  it('need Strike to cover the whole war, and end early once Strike runs dry', () => {
    const s = newGame(3);
    s.day = 10;
    const { theirs } = nextTo(s, 'blenders');
    const base = s.plots[theirs].stand!.price;
    s.plots[theirs].stand!.day.revenue = 1000;
    budgetOf(s, 'blenders').strike = 100; // 3 days of a 25% cut on $1,000 a day is $750
    expect(startScheme(s, 'blenders', 'priceWar')).toBeNull();
    expect(s.plots[theirs].stand!.price).toBe(base);
    budgetOf(s, 'blenders').strike = 800;
    const war = startScheme(s, 'blenders', 'priceWar')!;
    expect(war).not.toBeNull();
    hush(s);
    s.day = 11;
    budgetOf(s, 'blenders').strike = 0;
    schemesAtDawn(s);
    expect(war.done).toBe(true);
    expect(s.plots[theirs].stand!.price).toBe(base);
    expect(s.news.at(-1)).toBe('Bugle: The Boardwalk Blenders call off their price war');
  });

  it('only run where a rival\'s stand shares passers-by with yours, and keep the cut through an upgrade', () => {
    const s = newGame(4);
    s.day = 10;
    for (const p of PLOTS) if (s.plots[p.id].owner === 'player') s.plots[p.id].stand = null; // Lottie sells nowhere
    expect(warFront(s, 'hollis')).toEqual([]);
    expect(startScheme(s, 'hollis', 'priceWar')).toBeNull();
    const { theirs, mine } = nextTo(s, 'hollis');
    expect(nearbyPlots(PLOT_BY_ID[theirs]).map((p) => p.id)).toContain(mine);
    const war = startScheme(s, 'hollis', 'priceWar')!;
    const st = s.plots[theirs].stand!;
    st.level = Math.min(4, st.level + 1); // Grow upgrades the stand overnight, at its everyday price
    st.price = rivalPrice('hollis', st.level, PLOT_BY_ID[theirs]);
    hush(s);
    s.day = 11;
    schemesAtDawn(s);
    expect(war.done).toBeFalsy();
    expect(st.price).toBe(cents(rivalPrice('hollis', st.level, PLOT_BY_ID[theirs]) * 0.75));
  });
});

describe('smear posters', () => {
  it('dent your Reputation 0.1 unless the night watch catches Cold Brew\'s crew; Strike pays for the crew', () => {
    let hit = 0, caught = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const s = newGame(seed);
      s.day = 10;
      const rep = s.reputation, strike = budgetOf(s, 'coldbrew').strike, cash = s.rivals.coldbrew.cash;
      const job = startScheme(s, 'coldbrew', 'posters')!;
      expect(job).toMatchObject({ kind: 'posters', by: 'coldbrew', day: 10, done: true });
      expect(s.plots[job.plots[0]].owner).toBe('player');
      expect(budgetOf(s, 'coldbrew').strike).toBeCloseTo(strike - SCHEMES.posters.cost, 2);
      expect(s.rivals.coldbrew.cash).toBeCloseTo(cash - SCHEMES.posters.cost, 2);
      if (job.caught) {
        caught++;
        expect(s.reputation).toBe(rep);
        expect(s.news.at(-1)).toBe(`Bugle: Lottie's night watch catches a poster crew at ${PLOT_BY_ID[job.plots[0]].name}`);
      } else {
        hit++;
        expect(s.reputation).toBeCloseTo(rep - 0.1, 5);
        expect(s.news.at(-1)).toBe(`Bugle: Smear posters plaster ${PLOT_BY_ID[job.plots[0]].name}`);
        expect(s.phone!.queue.some((c) => c.who === 'coldbrew' && c.text === 'It\'s not graffiti. It\'s a review.')).toBe(true); // Juni phones (src/sim/phone.ts)
      }
    }
    expect(hit).toBeGreaterThan(caught); // 25% at night with no alarms or lights
    expect(caught).toBeGreaterThan(0);
  });

  it('are caught far more often behind floodlights and a watchtower, and need a stand of yours and Strike money', () => {
    let caught = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const s = newGame(seed);
      s.day = 10;
      for (const p of PLOTS) if (s.plots[p.id].owner === 'player') s.plots[p.id].defense.gadgets = ['floodlights', 'watchtower', 'alarm'];
      if (startScheme(s, 'coldbrew', 'posters')!.caught) caught++;
    }
    expect(caught).toBeGreaterThanOrEqual(34); // 95%
    const s = newGame(1);
    budgetOf(s, 'coldbrew').strike = SCHEMES.posters.cost - 1;
    expect(startScheme(s, 'coldbrew', 'posters')).toBeNull();
    budgetOf(s, 'coldbrew').strike = 1000;
    for (const p of PLOTS) if (s.plots[p.id].owner === 'player') s.plots[p.id].stand = null;
    expect(startScheme(s, 'coldbrew', 'posters')).toBeNull();
  });
});

describe('auction snipes', () => {
  it('top your sealed bid by 5%, the extra moved from Strike into Grow, once', () => {
    const s = newGame(5);
    s.day = 10;
    const lot = PLOTS.find((p) => !s.plots[p.id].owner && p.type === 'street')!.id;
    expect(startScheme(s, 'fizzco', 'snipe')).toBeNull(); // no auction open: nothing to snipe
    (s.plots[lot] as { auction?: object }).auction = { closes: 11, min: 1000, bid: 5000 }; // land's auctions, once they land
    const snipe = startScheme(s, 'fizzco', 'snipe')!;
    expect(snipe).toMatchObject({ kind: 'snipe', by: 'fizzco', until: 11, plots: [lot] });
    expect(snipeBid(s, 'hollis', lot, 3000, 5000)).toBe(3000); // Hollis isn't sniping
    expect(snipeBid(s, 'fizzco', lot, 3000)).toBe(3000); // no bid of yours to top
    const before = { ...budgetOf(s, 'fizzco') };
    expect(snipeBid(s, 'fizzco', lot, 3000, 5000)).toBe(5250);
    expect(budgetOf(s, 'fizzco').strike).toBeCloseTo(before.strike - 2250, 2);
    expect(budgetOf(s, 'fizzco').grow).toBeCloseTo(before.grow + 2250, 2);
    expect(snipe.done).toBe(true);
    expect(s.news.at(-1)).toBe(`Bugle: FizzCo Beverages snipe ${PLOT_BY_ID[lot].name} at the Registry`);
    expect(snipeBid(s, 'fizzco', lot, 3000, 5000)).toBe(3000); // it went off once
  });

  it('are FizzCo\'s first choice while a lot is open; a lot that closes unsniped ends it', () => {
    const s = newGame(6);
    s.day = 10;
    s.rank = 9; // Threat 5
    const lot = PLOTS.find((p) => !s.plots[p.id].owner && p.type === 'street')!.id;
    (s.plots[lot] as { auction?: object }).auction = { closes: 40, min: 1000 };
    for (const id of RIVALS) if (id !== 'fizzco') s.rivals[id].truceUntil = 999;
    while (!runningSchemes(s).length && s.day < 200) { s.day++; schemesAtDawn(s); }
    const [snipe] = runningSchemes(s);
    expect(snipe).toMatchObject({ kind: 'snipe', by: 'fizzco', plots: [lot], until: 40 });
    hush(s);
    s.day = 41;
    schemesAtDawn(s);
    expect(snipe.done).toBe(true);
  });
});

describe('when schemes come', () => {
  /** Every rival can start something: a stand of Lottie's next to each, and an empty book. */
  function ready(seed: number, rank: number) {
    const s = newGame(seed);
    s.rank = rank;
    for (const id of RIVALS) nextTo(s, id);
    return s;
  }
  /** How many schemes start over `n` dawns, each from a clean book. */
  function count(s: GameState, n: number, day = 20) {
    let started = 0;
    for (let i = 0; i < n; i++) {
      s.day = day;
      s.schemes = [];
      schemesAtDawn(s);
      started += s.schemes.length;
    }
    return started;
  }

  it('more often with each Threat lemon', () => {
    const low = count(ready(7, 1), 400), high = count(ready(7, 9), 400);
    expect(low).toBeGreaterThan(0);
    expect(high).toBeGreaterThan(2.5 * low); // 2% against 8% a rival a dawn
    expect(high).toBeLessThan(5 * 400 * 0.12);
  });

  it('not in the first week, not from a rival in a Truce, and never from a rival out of the game', () => {
    const s = ready(8, 9);
    expect(count(s, 200, SCHEMES.from - 1)).toBe(0);
    for (const id of RIVALS) s.rivals[id].truceUntil = 999;
    expect(count(s, 200)).toBe(0);
    const t = ready(9, 9);
    t.day = 20;
    const war = startScheme(t, 'blenders', 'priceWar')!;
    t.rivals.blenders.alive = false;
    for (const id of RIVALS) t.rivals[id].alive = false;
    t.day = 21;
    schemesAtDawn(t);
    expect(war.done).toBe(true);
    expect(t.schemes).toHaveLength(1);
  });

  it('play out on the real dawn: seeded, Bugle lines, prices back after every war, old schemes leave the books', () => {
    const chance = [...SCHEMES.chance];
    SCHEMES.chance.fill(0.5); // a busy fortnight, whatever the seed
    try {
      const s = newGame(11, { mode: 'sandbox', peaceful: true }); // no raids to wreck the stands; schemes still run
      s.cash = 1_000_000; // Lottie stays in business with her unstocked stands
      for (const id of RIVALS) nextTo(s, id);
      const seen = new Set<string>();
      for (let d = 0; d < 16; d++) {
        openStand(s);
        simulateRestOfDay(s);
        if (d === 10) { // the same evening sleeps to the same morning
          const twin = JSON.parse(JSON.stringify(s)) as GameState;
          sleepUntilDawn(twin);
          sleepUntilDawn(s);
          expect(JSON.stringify(twin)).toBe(JSON.stringify(s));
        } else sleepUntilDawn(s);
        for (const x of s.schemes ?? []) seen.add(`${x.kind}:${x.by}:${x.day}`);
      }
      expect(s.day).toBe(17);
      expect(seen.size).toBeGreaterThan(5);
      expect([...seen].some((k) => k.startsWith('priceWar'))).toBe(true);
      expect([...seen].some((k) => k.startsWith('posters'))).toBe(true);
      expect(s.news.some((n) => n.startsWith('Bugle: Price war!'))).toBe(true);
      expect((s.schemes ?? []).some((x) => x.kind === 'priceWar' && x.done && (x.cost ?? 0) > 0)).toBe(true); // Strike paid for a war
      for (const x of s.schemes!) expect(x.until).toBeGreaterThanOrEqual(s.day - SCHEMES.keep);
      for (const p of PLOTS) {
        const ps = s.plots[p.id];
        if (!ps.stand || !ps.owner || ps.owner === 'player') continue;
        expect(ps.stand.price).toBe(cents(rivalPrice(ps.owner as RivalId, ps.stand.level, p) * priceWarCut(s, ps.owner as RivalId, p.id)));
      }
      for (const id of RIVALS) for (const v of Object.values(budgetOf(s, id))) expect(Number.isFinite(v)).toBe(true);
    } finally {
      SCHEMES.chance.splice(0, chance.length, ...chance);
    }
  });

  it('an older save loads with an empty book', () => {
    const s = newGame(1);
    delete s.schemes;
    expect(migrateSave(JSON.parse(JSON.stringify(s)))!.schemes).toEqual([]);
  });
});

describe('on the HUD', () => {
  it('a price war near you: a red ticket naming the rival and the cut, days left and Go There; the stand card notes it', () => {
    const s = newGame(3);
    s.day = 10;
    const { theirs } = nextTo(s, 'blenders');
    expect(schemeTickets(s)).toEqual([]);
    startScheme(s, 'blenders', 'priceWar');
    const [ticket] = schemeTickets(s);
    expect(ticket).toContain('data-testid="price-war"');
    expect(ticket).toContain('cl-ticket red');
    expect(ticket).toContain('Price war! Blenders −25%');
    expect(ticket).toContain('<i class="on"></i><i class="on"></i><i class="on"></i>');
    expect(ticket).toContain(`data-action="goto" data-plot="${theirs}"`);
    expect(schemeNote(s, theirs)).toBe('<span class="cl-note bad">Price war −25%</span>');
  });

  it('this morning\'s posters: Free samples one tap away from Rank 2 (hidden before), or a green ticket if the crew was caught', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const s = newGame(seed);
      s.day = 10;
      const job = startScheme(s, 'coldbrew', 'posters')!;
      const [ticket] = schemeTickets(s);
      expect(ticket).toContain('data-testid="posters"');
      if (job.caught) {
        expect(ticket).toContain('cl-ticket good');
        expect(ticket).toContain('Poster crew caught!');
        expect(schemeNote(s, job.plots[0])).toBe('');
        continue;
      }
      expect(ticket).toContain('cl-ticket red');
      expect(ticket).toContain('Smear posters! −0.1★');
      expect(ticket).not.toContain('data-id="freeSamples"'); // Rank 1: Free Sample Day is still locked
      s.rank = 2;
      expect(schemeTickets(s)[0]).toContain('data-action="campaign" data-id="freeSamples"');
      expect(schemeNote(s, job.plots[0])).toBe('<span class="cl-note bad">Smear posters</span>');
      s.day = 11;
      expect(schemeTickets(s)).toEqual([]); // gone the next morning
      return;
    }
    throw new Error('no posters landed in 12 seeds');
  });
});

describe('Cease-and-Desist', () => {
  /** Rank 6 with Flyers & Sidewalk Chalk, and a busy stand of Lottie's in Downtown as well as her Corner. */
  function marketed(seed: number) {
    const s = newGame(seed);
    s.rank = 6;
    s.brandTier = 2;
    s.day = 60;
    const p = PLOTS.find((q) => q.district === 'downtown' && !s.plots[q.id].owner && q.type === 'street')!;
    s.plots[p.id] = { ...s.plots[p.id], owner: 'player', stand: newStand(2, 2) };
    s.plots[p.id].stand!.day.passersby = 5000; // Downtown is where her ads pull the most
    return { s, downtown: p.id };
  }

  it('blocks your tier bonus and campaigns in the district where your ads pull most, for 3 days, with a fruit basket', () => {
    const { s, downtown } = marketed(31);
    const st = s.plots[downtown].stand!;
    const corner = s.plots[LOTTIES_CORNER].stand!;
    const before = marketingMultiplier(s, 'player', st);
    const strike = budgetOf(s, 'fizzco').strike;
    const letter = startScheme(s, 'fizzco', 'cease')!;
    expect(letter).toMatchObject({ kind: 'cease', by: 'fizzco', district: 'downtown', day: 60, until: 62, plots: [downtown] });
    expect(strike - budgetOf(s, 'fizzco').strike).toBeCloseTo(CEASE.cost, 2);
    expect(marketingMultiplier(s, 'player', st)).toBeCloseTo(before - BRAND_TIERS[1].traffic, 5);
    expect(marketingMultiplier(s, 'player', corner)).toBeCloseTo(before, 5); // Maple Row keeps its ads
    s.phase = 'prep';
    expect(canRunCampaign(s, 'sandwichBoard', downtown)).toEqual({ ok: false, why: 'Cease-and-Desist: ads count for nothing here' });
    expect(canRunCampaign(s, 'sandwichBoard', LOTTIES_CORNER).ok).toBe(s.cash >= 40);
    expect(s.alerts!.at(-1)!.text).toBe('CEASE-AND-DESIST! FizzCo\'s lawyers block your ads in Downtown for 3 days. Lottie keeps the fruit basket.');
    expect(s.news).toContain(`Preston: "${CEASE.taunt}"`);
    hush(s);
    for (const day of [61, 62]) { s.day = day; schemesAtDawn(s); expect(ceaseAndDesistIn(s, 'downtown')).toBe(true); }
    s.day = 63;
    schemesAtDawn(s);
    expect(ceaseAndDesistIn(s, 'downtown')).toBe(false);
    expect(letter.done).toBe(true);
    expect(marketingMultiplier(s, 'player', st)).toBeCloseTo(before, 5);
  });

  it('a campaign there counts for nothing too, and the letters stop the moment FizzCo falls', () => {
    const { s, downtown } = marketed(32);
    const st = s.plots[downtown].stand!;
    st.campaigns.sandwichBoard = 1;
    const before = marketingMultiplier(s, 'player', st);
    ceaseAndDesist(s);
    expect(marketingMultiplier(s, 'player', st)).toBeCloseTo(before - BRAND_TIERS[1].traffic - 0.2, 5);
    s.rivals.fizzco.alive = false;
    expect(ceaseAndDesistIn(s, 'downtown')).toBe(false);
    expect(marketingMultiplier(s, 'player', st)).toBeCloseTo(before, 5);
    expect(ceaseAndDesist(s)).toBeNull();
  });

  it('never before Rank 6, with nothing to block, or twice on one district; story can aim the Act 4 letter', () => {
    const early = marketed(33).s;
    early.rank = 5;
    expect(ceaseAndDesist(early)).toBeNull();
    const plain = marketed(34).s;
    plain.brandTier = 0;
    expect(ceaseAndDesist(plain)).toBeNull(); // no ads to strike out
    expect(ceaseAndDesist(plain, 'downtown')).not.toBeNull(); // the story's letter on Downtown goes regardless
    expect(ceaseAndDesist(plain, 'downtown')).toBeNull();
    expect(ceaseAndDesist(plain, 'harbor')).toBeNull(); // nothing of yours there
    expect(startScheme(plain, 'blenders', 'cease')).toBeNull(); // only FizzCo has lawyers
  });

  it('on the HUD: a red ticket with the district, days left and Go There; your stand card says the ads are blocked', () => {
    const { s, downtown } = marketed(35);
    ceaseAndDesist(s);
    const ticket = schemeTickets(s).find((x) => x.includes('data-testid="cease"'))!;
    expect(ticket).toContain('cl-ticket red');
    expect(ticket).toContain('Ads blocked: Downtown');
    expect(ticket).toContain('<i class="on"></i><i class="on"></i><i class="on"></i>');
    expect(ticket).toContain(`data-action="goto" data-plot="${downtown}"`);
    expect(schemeNote(s, downtown)).toBe('<span class="cl-note bad">Ads blocked</span>');
    expect(schemeNote(s, LOTTIES_CORNER)).toBe('');
  });
});

describe('FizzCo buyout offers', () => {
  /** Rank 6 at Morning Prep, with a stand of Lottie's in Downtown, FizzCo's home turf. */
  function wanted(seed: number, district = 'downtown') {
    const s = newGame(seed);
    s.rank = 6;
    s.day = 60;
    s.phase = 'prep';
    const p = PLOTS.find((q) => q.district === district && !s.plots[q.id].owner && q.type === 'street')!;
    s.plots[p.id] = { ...s.plots[p.id], owner: 'player', stand: newStand(2, 2), invested: 550 };
    return { s, plot: p.id };
  }
  const guardAt = (post: string) => ({ id: 'g1', name: 'Test', trait: 'Loyal', level: 3, xp: 0, weapon: 'clubs', gear: 'none', post, outUntil: 0, fee: 0 }) as GameState['guards'][number];

  it('offer 1.25x land and building for your best plot on its turf, out of Grow; Sell hands it over at Morning Prep', () => {
    const { s, plot } = wanted(41);
    s.guards.push(guardAt(plot));
    const price = Math.round(TAKEOVER.price * (s.plots[plot].landValue + 550));
    const offer = startScheme(s, 'fizzco', 'buyout')!;
    expect(offer).toMatchObject({ kind: 'buyout', by: 'fizzco', plots: [plot], price, day: 60, until: 61 });
    expect(s.alerts!.at(-1)!.text).toBe(`FizzCo offers $${price.toLocaleString('en-US')} for ${PLOT_BY_ID[plot].name}. Sell, or say no.`);
    const grow = budgetOf(s, 'fizzco').grow, cash = s.cash;
    s.phase = 'open';
    expect(canSellToFizzco(s, plot)).toEqual({ ok: false, why: 'Sell at Morning Prep' });
    expect(answerBuyout(s, plot, true)).toBe(false);
    s.phase = 'prep';
    expect(answerBuyout(s, plot, true)).toBe(true);
    expect(s.plots[plot].owner).toBe('fizzco');
    expect(s.plots[plot].stand!.price).toBe(rivalPrice('fizzco', 2, PLOT_BY_ID[plot]));
    expect(s.cash).toBeCloseTo(cash + price, 2);
    expect(grow - budgetOf(s, 'fizzco').grow).toBeCloseTo(price, 2);
    expect(s.guards[0].post).toBeNull(); // your guard comes home
    expect(offer.done).toBe(true);
    expect(offerOn(s, plot)).toBeUndefined();
    expect(s.news.at(-1)).toBe(`Bugle: Lottie sells ${PLOT_BY_ID[plot].name} to FizzCo Beverages for $${price.toLocaleString('en-US')}`);
  });

  it('No raises Preston\'s Grudge and ends it; an unanswered offer lapses after 2 days', () => {
    const { s, plot } = wanted(42);
    startScheme(s, 'fizzco', 'buyout');
    const g = s.rivals.fizzco.grudge;
    expect(answerBuyout(s, plot, false)).toBe(true);
    expect(s.rivals.fizzco.grudge).toBe(g + TAKEOVER.snub);
    expect(s.news.at(-1)).toBe(`Preston: "${TAKEOVER.taunt}"`);
    expect(s.plots[plot].owner).toBe('player');
    expect(offerOn(s, plot)).toBeUndefined();
    const t = wanted(43);
    const offer = startScheme(t.s, 'fizzco', 'buyout')!;
    hush(t.s);
    t.s.day = 61;
    schemesAtDawn(t.s);
    expect(offerOn(t.s, t.plot)).toBe(offer);
    t.s.day = 62;
    schemesAtDawn(t.s);
    expect(offer.done).toBe(true);
    expect(answerBuyout(t.s, t.plot, true)).toBe(false);
    expect(t.s.plots[t.plot].owner).toBe('player');
  });

  it('never for Lottie\'s Corner or a plot away from FizzCo\'s turf, not before Rank 6, and not past what Grow holds', () => {
    expect(startScheme(newGame(44), 'fizzco', 'buyout')).toBeNull(); // only the Corner, and Rank 1
    const far = wanted(45, 'groves');
    expect(startScheme(far.s, 'fizzco', 'buyout')).toBeNull();
    const early = wanted(46);
    early.s.rank = 5;
    expect(startScheme(early.s, 'fizzco', 'buyout')).toBeNull();
    const poor = wanted(47);
    budgetOf(poor.s, 'fizzco').grow = 10;
    expect(startScheme(poor.s, 'fizzco', 'buyout')).toBeNull();
    expect(startScheme(wanted(48).s, 'sourwood', 'buyout')).toBeNull(); // a FizzCo move
    const spent = wanted(49);
    startScheme(spent.s, 'fizzco', 'buyout');
    budgetOf(spent.s, 'fizzco').grow = 10; // spent elsewhere before you answered
    expect(canSellToFizzco(spent.s, spent.plot)).toEqual({ ok: false, why: 'FizzCo can\'t pay any more' });
  });

  it('on the HUD: the price with Sell and No; Sell is locked outside Morning Prep; the plot card shows the bid', () => {
    const { s, plot } = wanted(50);
    const offer = startScheme(s, 'fizzco', 'buyout')!;
    const ticket = () => schemeTickets(s).find((x) => x.includes('data-testid="takeover"'))!;
    const bid = `FizzCo bids $${offer.price!.toLocaleString('en-US')}`;
    expect(ticket()).toContain(bid);
    expect(ticket()).toContain(`data-action="takeover" data-plot="${plot}" data-sell="1"`);
    expect(ticket()).toContain(`data-action="takeover" data-plot="${plot}" data-sell="0"`);
    expect(ticket()).not.toContain('disabled');
    s.phase = 'night';
    expect(ticket()).toContain('disabled title="Sell at Morning Prep"');
    expect(schemeNote(s, plot)).toBe(`<span class="cl-note">${bid}</span>`);
  });
});

describe('Old Money', () => {
  /** Act 5 at Morning Prep, with a week of sales on the books. */
  function act5(seed: number, sales = [1000, 2000, 3000, 4000, 5000, 6000, 7000]) {
    const s = newGame(seed);
    s.rank = 8;
    s.day = 110;
    s.phase = 'prep';
    s.cash = 50_000;
    s.history = sales.map((revenue) => ({ revenue }) as DayStats);
    return s;
  }

  it('Mayor Fontaine fines you half your average day\'s sales, out of the till, for Vera\'s Strike', () => {
    const s = act5(51);
    const strike = budgetOf(s, 'sourwood').strike;
    const job = startScheme(s, 'sourwood', 'fine')!;
    expect(job).toMatchObject({ kind: 'fine', by: 'sourwood', day: 110, price: 2000, done: true });
    expect(s.cash).toBe(48_000);
    expect(strike - budgetOf(s, 'sourwood').strike).toBeCloseTo(OLD_MONEY.fineCost, 2);
    expect(s.alerts!.at(-1)!.text).toBe('MAYOR\'S FINE! Town Hall fines Lottie\'s Lemonade $2,000 for "unlicensed cheer".');
    expect(s.news).toContain(`Mayor Fontaine: "${OLD_MONEY.mayor}"`);
  });

  it('a fine is at least $25 and never more than your cash, and none comes before Rank 8', () => {
    expect(mayorsFine(act5(52, []))).toBe(OLD_MONEY.minFine);
    const broke = act5(53);
    broke.cash = 300;
    expect(mayorsFine(broke)).toBe(300);
    broke.cash = 0;
    expect(startScheme(broke, 'sourwood', 'fine')).toBeNull();
    const early = act5(54);
    early.rank = 7;
    expect(startScheme(early, 'sourwood', 'fine')).toBeNull();
    expect(freezeLand(early)).toBeNull();
    expect(startScheme(act5(55), 'fizzco', 'fine')).toBeNull(); // the Mayor answers to Vera
  });

  it('a land freeze stops anyone buying the plot for 3 days, and your First Dibs waits it out', () => {
    const s = act5(56);
    const p = PLOTS.find((q) => q.district === 'maple' && !s.plots[q.id].owner && q.type === 'street')!;
    s.plots[p.id].dibs = { who: 'player', until: 110 };
    const job = startScheme(s, 'sourwood', 'freeze')!;
    expect(job).toMatchObject({ kind: 'freeze', by: 'sourwood', plots: [p.id], day: 110, until: 112 });
    expect(s.plots[p.id].dibs!.until).toBe(113);
    expect(landFrozen(s, p.id)).toBe(true);
    expect(canBuyPlot(s, p.id)).toEqual({ ok: false, why: 'Town Hall froze this sale' });
    expect(s.alerts!.at(-1)!.text).toBe(`LAND FREEZE! Town Hall freezes the sale of ${p.name} for 3 days, to protect "historic hedges."`);
    hush(s);
    for (const day of [111, 112]) { s.day = day; schemesAtDawn(s); expect(landFrozen(s, p.id)).toBe(true); }
    s.day = 113;
    schemesAtDawn(s);
    expect(landFrozen(s, p.id)).toBe(false);
    expect(canBuyPlot(s, p.id).ok).toBe(true); // First Dibs still holds today
  });

  it('with no dibs or bid, the freeze lands on the busiest plot you could buy; a Sit-down buyout waits too', () => {
    const s = act5(57);
    const job = startScheme(s, 'sourwood', 'freeze')!;
    const busiest = PLOTS.filter((p) => !s.plots[p.id].owner && !landFrozen(s, p.id) && canBuyPlot(s, p.id).ok)
      .reduce((m, p) => Math.max(m, p.baseTraffic), 0);
    expect(PLOT_BY_ID[job.plots[0]].baseTraffic).toBeGreaterThanOrEqual(busiest);
    const theirs = PLOTS.find((p) => s.plots[p.id].owner === 'hollis' && p.type !== 'hq')!.id;
    expect(freezeLand(s, theirs)).not.toBeNull(); // the story's Act 5 freeze can name the plot
    expect(canPlotBuyout(s, theirs)).toEqual({ ok: false, why: 'Town Hall froze this sale' });
  });

  it('on the HUD: a red ticket with the plot, days left and Go There; the plot card says the sale is frozen', () => {
    const s = act5(58);
    const job = startScheme(s, 'sourwood', 'freeze')!;
    const plot = job.plots[0];
    const ticket = schemeTickets(s).find((x) => x.includes('data-testid="freeze"'))!;
    expect(ticket).toContain(`Sale frozen: ${PLOT_BY_ID[plot].name.replace(/'/g, '\'')}`);
    expect(ticket).toContain(`data-action="goto" data-plot="${plot}"`);
    expect(schemeNote(s, plot)).toBe('<span class="cl-note bad">Sale frozen</span>');
  });
});
