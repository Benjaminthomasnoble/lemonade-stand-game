import { describe, expect, it } from 'vitest';
import {
  budgetOf, FACTIONS, keptShare, migrateSave, nearbyPlots, newGame, newStand, openStand, PLOT_BY_ID, PLOTS, priceWarCut, rivalPrice,
  runningSchemes, SCHEMES, schemesAtDawn, simulateRestOfDay, sleepUntilDawn, snipeBid, startScheme, warAt, warFront,
  BRAND_TIERS, canRunCampaign, CEASE, ceaseAndDesist, ceaseAndDesistIn, LOTTIES_CORNER, marketingMultiplier,
  answerBuyout, canSellToFizzco, offerOn, TAKEOVER,
  canBuyPlot, canPlotBuyout, freezeLand, landFrozen, mayorsFine, OLD_MONEY, CAMPAIGNS, postersAt,
  AD_BLITZ, adBlitzCurb, adBlitzIn, DISTRICT_BY_ID, ACT_BY_RANK, underCeaseAndDesist, curbAppeal, expectedDemand,
  blitzes, blitzingToday, morningShow, outsoldAt, RIVAL_JINGLES, buyPlot, freezeOn, HEDGES, plotBuyout,
  detectionChance, MYSTERY, MYSTERY_GOAL, mysteryGoal, mysteryOn, NIGHT_SHIFT, nightShiftUnmasked, welcomeDex,
  closeAuctions, openAuction, placeBid, PRESTON_OUTBID,
  BAY_RIVALS, bugleNews, canAssault, comeToTown, DISTRICTS, keepSqueezing, netWorth, OUT_OF_TOWNER, outOfTownerAtDawn, ownedPlots, RAID_PARTY,
  raidCost, raidSize, rivalsBankrupt, swarms, syndicateMembers, thinnestDistrict, threatLevel,
  type DayStats, type DistrictId, type GameState, type Guard, type RivalId, type Scheme,
} from './economy.ts';
import { schemeNote, schemeTickets } from '../ui/schemes.ts';
import { boardOrder, corkboardBody } from '../ui/corkboard.ts';
import { plotBuyoutRow, type SitKit } from '../ui/sitdown.ts';
import { phoneCheck } from './phone.ts';
import { checkGoals, GOAL_PROVIDERS, goalsNow } from './goals.ts';
import { playScene, SPEAKERS } from './scenes.ts';
import { rowAmount } from './ledger.ts';

const RIVALS = BAY_RIVALS; // the Bay's five (Endless Summer's Out-of-Towner is out of town)
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
/** Rank `rank`, with the campaign's act to match: the campaign's act is the story's (src/sim/story.ts), not rank's. */
const atRank = (s: GameState, rank: number) => { s.rank = rank; s.story!.act = ACT_BY_RANK[rank - 1]; };

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

  /** Cold Brew keeps only the Grindhouse on campus; Lottie holds a quiet stand a lot from it and a busy one at the far end. */
  function onCampus(seed: number, rank: number) {
    const s = newGame(seed);
    s.day = 10;
    atRank(s, rank);
    for (const p of PLOTS) if (p.district === 'campus' && p.type !== 'hq' && s.plots[p.id].owner === 'coldbrew') s.plots[p.id] = { ...s.plots[p.id], owner: null, stand: null };
    for (const [id, busy] of [['campus-6n', 50], ['campus-0s', 400]] as const) {
      s.plots[id] = { ...s.plots[id], owner: 'player', stand: newStand(1, 1) };
      s.plots[id].stand!.day.passersby = busy;
    }
    return s;
  }

  it('in Act 3 hit your busiest Campus & Arts stand under the spec\'s slogan; in other acts, your stand nearest their turf', () => {
    let landed = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const s = onCampus(seed, 5); // Act 3
      const job = startScheme(s, 'coldbrew', 'posters')!;
      expect(job.plots).toEqual(['campus-0s']);
      if (job.caught) continue;
      landed++;
      expect(s.news.at(-1)).toBe('Bugle: Every campus wall sneers "LOTTIE\'S: LEMONADE FOR PEOPLE WHO LIKE THINGS."');
      expect(s.phone!.queue.some((c) => c.who === 'coldbrew' && c.text === 'It\'s not graffiti. It\'s a review.')).toBe(true); // Juni phones it in
    }
    expect(landed).toBeGreaterThan(0);
    for (const rank of [4, 7]) { // Acts 2 and 4
      for (let seed = 1; seed <= 12; seed++) {
        const s = onCampus(seed, rank);
        const job = startScheme(s, 'coldbrew', 'posters')!;
        expect(job.plots).toEqual(['campus-6n']); // a lot from the Grindhouse
        if (!job.caught) expect(s.news.at(-1)).toBe(`Bugle: Smear posters plaster ${PLOT_BY_ID['campus-6n'].name}`);
      }
    }
    const away = onCampus(2, 5); // Act 3 with no stand of yours on campus: the usual rule
    for (const id of ['campus-6n', 'campus-0s']) away.plots[id] = { ...away.plots[id], owner: null, stand: null };
    expect(startScheme(away, 'coldbrew', 'posters')!.plots).toEqual([LOTTIES_CORNER]);
  });

  it('in Act 3 Cold Brew reaches for its posters before a price war', () => {
    const chance = [...SCHEMES.chance];
    SCHEMES.chance.fill(1); // every dawn
    try {
      const kinds = (rank: number) => {
        const out: string[] = [];
        for (let seed = 1; seed <= 20; seed++) {
          const s = newGame(seed);
          s.day = 10;
          atRank(s, rank);
          nextTo(s, 'coldbrew'); // a war front: a price war is on the table too
          hush(s);
          s.rivals.coldbrew.truceUntil = 0;
          schemesAtDawn(s);
          out.push(...s.schemes!.filter((x) => x.by === 'coldbrew' && x.day === 10 && x.kind !== 'spoil').map((x) => x.kind)); // Act 3's mystery runs on its own
        }
        return out;
      };
      const act3 = kinds(5);
      expect(act3).toHaveLength(20);
      expect(new Set(act3)).toEqual(new Set(['posters']));
      expect(kinds(4)).toContain('priceWar'); // Act 2: a seeded draw that favors posters
    } finally {
      SCHEMES.chance.splice(0, chance.length, ...chance);
    }
  });

  it('stay up 3 days, or until free samples begin at that stand; a caught crew leaves none', () => {
    let seen = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const s = newGame(seed);
      s.day = 10;
      const job = startScheme(s, 'coldbrew', 'posters')!;
      const at = job.plots[0];
      if (job.caught) { expect(postersAt(s, at)).toBe(false); continue; }
      seen++;
      expect(postersAt(s, at)).toBe(true);
      s.day = 12;
      expect(postersAt(s, at)).toBe(true);
      expect(schemeNote(s, at)).toBe('<span class="cl-note bad">Smear posters</span>');
      s.day = 13;
      expect(postersAt(s, at)).toBe(false);
      expect(schemeNote(s, at)).toBe('');
      s.day = 11;
      const st = s.plots[at].stand!;
      st.campaigns.freeSamples = CAMPAIGNS.freeSamples.days - 2; // begun on Day 9, before the posters
      expect(postersAt(s, at)).toBe(true);
      st.campaigns.freeSamples = CAMPAIGNS.freeSamples.days - 1; // begun on Day 10, the morning they went up
      expect(postersAt(s, at)).toBe(false);
      st.campaigns.freeSamples = CAMPAIGNS.freeSamples.days; // begun today
      expect(postersAt(s, at)).toBe(false);
      delete st.campaigns.freeSamples;
      s.plots[at].owner = 'blenders'; // the stand left you
      expect(postersAt(s, at)).toBe(false);
    }
    expect(seen).toBeGreaterThan(0);
  });
});

describe('auction snipes', () => {
  it('top your sealed bid by 5%, the extra moved from Strike into Grow, once', () => {
    const s = newGame(5);
    s.day = 10;
    const lot = PLOTS.find((p) => !s.plots[p.id].owner && p.type === 'street')!.id;
    expect(startScheme(s, 'fizzco', 'snipe')).toBeNull(); // no auction open: nothing to snipe
    s.plots[lot].auction = { kind: 'sale', closes: 11, min: 1000, bid: 5000 };
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
    s.plots[lot].auction = { kind: 'sale', closes: 40, min: 1000 };
    for (const id of RIVALS) if (id !== 'fizzco') s.rivals[id].truceUntil = 999;
    while (!runningSchemes(s).length && s.day < 200) { s.day++; schemesAtDawn(s); }
    const [snipe] = runningSchemes(s);
    expect(snipe).toMatchObject({ kind: 'snipe', by: 'fizzco', plots: [lot], until: 40 });
    hush(s);
    s.day = 41;
    schemesAtDawn(s);
    expect(snipe.done).toBe(true);
  });

  it('take the lot at the gavel: FizzCo tops your sealed bid by 5% and Preston rings to gloat', () => {
    const s = newGame(5);
    s.day = 10;
    s.cash = 100_000;
    const lot = PLOTS.find((p) => !s.plots[p.id].owner && p.type === 'street')!.id;
    openAuction(s, lot, 'sale');
    const yours = s.plots[lot].auction!.min * 3;
    expect(placeBid(s, lot, yours)).toBe(true);
    for (const id of RIVALS) budgetOf(s, id).grow = 0; // nobody else can bid
    budgetOf(s, 'fizzco').strike = s.rivals.fizzco.cash = 1_000_000;
    expect(startScheme(s, 'fizzco', 'snipe')).toMatchObject({ plots: [lot], until: s.day + 1 });
    s.day++;
    closeAuctions(s);
    expect(s.plots[lot].owner).toBe('fizzco');
    expect(s.cash).toBe(100_000); // a losing sealed bid costs nothing
    expect(s.news).toContain(`Skip Larkin: "Outbid on ${PLOT_BY_ID[lot].name}. ${FACTIONS.fizzco.name} went to $${Math.ceil(yours * (1 + SCHEMES.snipe.over)).toLocaleString('en-US')}."`);
    expect(s.phone!.queue.some((c) => c.who === 'fizzco' && c.text === PRESTON_OUTBID)).toBe(true);
  });

  it('never go after a plot you listed yourself', () => {
    const s = newGame(5);
    s.day = 10;
    const lot = PLOTS.find((p) => !s.plots[p.id].owner && p.type === 'street')!.id;
    s.plots[lot] = { ...s.plots[lot], owner: 'player', auction: { kind: 'listing', closes: 11, min: 1000 } };
    expect(startScheme(s, 'fizzco', 'snipe')).toBeNull();
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
      expect(ticket).toContain('Smear posters! −0.1<svg class="cl-ico"'); // a clay star
      expect(ticket).not.toContain('data-id="freeSamples"'); // Rank 1: Free Sample Day is still locked
      s.rank = 2;
      expect(schemeTickets(s)[0]).toContain(`data-action="campaign" data-id="freeSamples" data-plot="${job.plots[0]}"`); // at the stand they hit
      expect(schemeNote(s, job.plots[0])).toBe('<span class="cl-note bad">Smear posters</span>');
      s.day = 11;
      expect(schemeTickets(s)).toEqual([]); // gone the next morning
      return;
    }
    throw new Error('no posters landed in 12 seeds');
  });
});

describe('Cease-and-Desist', () => {
  /** Act 4 (Rank 7) with Flyers & Sidewalk Chalk, and a busy stand of Lottie's in Downtown as well as her Corner. */
  function marketed(seed: number) {
    const s = newGame(seed);
    atRank(s, 7);
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
    expect(s.phone!.queue.some((c) => c.who === 'fizzco' && c.text === CEASE.taunt)).toBe(true); // Preston phones
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

  it('never before Act 4, with nothing to block, or twice on one district; story can aim the Act 4 letter', () => {
    const early = marketed(33).s;
    atRank(early, 6); // Act 3
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

  it('Event Sponsorship counts for nothing there too: the calendar asks the same question', () => {
    const { s } = marketed(36);
    expect(underCeaseAndDesist(s, 'downtown')).toBe(false);
    ceaseAndDesist(s);
    expect(underCeaseAndDesist(s, 'downtown')).toBe(true);
    expect(underCeaseAndDesist(s, 'maple')).toBe(false);
    s.rivals.fizzco.alive = false;
    expect(underCeaseAndDesist(s, 'downtown')).toBe(false);
  });
});

describe('FizzCo buyout offers', () => {
  /** Act 4 (Rank 7) at Morning Prep, with a stand of Lottie's in Downtown, FizzCo's home turf. */
  function wanted(seed: number, district = 'downtown') {
    const s = newGame(seed);
    atRank(s, 7);
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
    phoneCheck(s); // the phone notes his Grudge
    expect(answerBuyout(s, plot, false)).toBe(true);
    expect(s.rivals.fizzco.grudge).toBe(g + TAKEOVER.snub);
    expect(s.phone!.queue.filter((c) => c.who === 'fizzco')).toMatchObject([{ text: '', mood: 'sore' }]); // Preston phones, sore
    phoneCheck(s); // his Grudge jump: still the one call
    expect(s.phone!.queue.filter((c) => c.who === 'fizzco')).toMatchObject([{ text: '', mood: 'sore' }]);
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

  it('never for Lottie\'s Corner or a plot away from FizzCo\'s turf, not before Act 4, and not past what Grow holds', () => {
    expect(startScheme(newGame(44), 'fizzco', 'buyout')).toBeNull(); // only the Corner, and Rank 1
    const far = wanted(45, 'groves');
    expect(startScheme(far.s, 'fizzco', 'buyout')).toBeNull();
    const early = wanted(46);
    atRank(early.s, 6); // Act 3
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
  /** Act 5 (Rank 9) at Morning Prep, with a week of sales on the books. */
  function act5(seed: number, sales = [1000, 2000, 3000, 4000, 5000, 6000, 7000]) {
    const s = newGame(seed);
    atRank(s, 9);
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

  it('a fine is at least $25 and never more than your cash, and none comes before Act 5', () => {
    expect(mayorsFine(act5(52, []))).toBe(OLD_MONEY.minFine);
    const broke = act5(53);
    broke.cash = 300;
    expect(mayorsFine(broke)).toBe(300);
    broke.cash = 0;
    expect(startScheme(broke, 'sourwood', 'fine')).toBeNull();
    const early = act5(54);
    atRank(early, 8); // Act 4
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
    expect(schemeNote(s, plot)).toBe(`<span class="cl-note bad">Frozen, thaws day ${job.until + 1}</span>`);
  });

  /** A Downtown lot of yours borders Hilltop Estates, and the cash for its land. */
  const uphill = (s: GameState) => {
    const lot = PLOTS.find((p) => p.district === 'downtown' && !s.plots[p.id].owner && p.type === 'street')!;
    s.plots[lot.id].owner = 'player';
    s.cash = 5_000_000;
    return s;
  };

  it('Historic hedges: in Act 5 the Mayor freezes your first Hilltop deal, once, and the plot card says when it thaws', () => {
    const s = uphill(act5(59));
    const hill = PLOTS.filter((p) => p.district === 'hilltop' && !s.plots[p.id].owner && canBuyPlot(s, p.id).ok);
    expect(hill.length).toBeGreaterThan(1);
    const [first, second] = hill.map((p) => p.id);
    const strike = budgetOf(s, 'sourwood').strike, cash = s.cash;
    expect(buyPlot(s, first)).toBe(false); // the deal is held
    expect(s.plots[first].owner).toBeNull();
    expect(s.cash).toBe(cash);
    expect(freezeOn(s, first)).toMatchObject({ kind: 'freeze', by: 'sourwood', day: 110, until: 112, cost: 0 });
    expect(budgetOf(s, 'sourwood').strike).toBe(strike); // the act's lesson, not a scheme Vera pays for
    expect(canBuyPlot(s, first)).toEqual({ ok: false, why: 'Town Hall froze this sale' });
    expect(schemeNote(s, first)).toBe('<span class="cl-note bad">Frozen, thaws day 113</span>');
    expect(s.scenes!.queue.at(-1)).toMatchObject({ id: 'hedges', data: { speaker: 'fontaine', plot: first, lines: HEDGES.lines } }); // he walks on to the plot
    expect(HEDGES.lines[0]).toMatchObject({ who: SPEAKERS.fontaine });
    expect(s.news).toContain('Bugle: Town Hall freezes a Hilltop land sale "to protect historic hedges"');
    expect(s.rivals.sourwood.hedges).toBe(110);
    expect(buyPlot(s, second)).toBe(true); // once a run: the next Hilltop deal goes through
    hush(s);
    for (const day of [111, 112, 113]) { s.day = day; schemesAtDawn(s); }
    expect(buyPlot(s, first)).toBe(true); // thawed
    const loaded = migrateSave(JSON.parse(JSON.stringify(s)))!;
    expect(loaded.rivals.sourwood.hedges).toBe(110);
  });

  it('Historic hedges holds a Sit-down Plot Buyout of a Hilltop plot too, if that is your first Hilltop deal', () => {
    const s = uphill(act5(63));
    const theirs = PLOTS.find((p) => p.district === 'hilltop' && s.plots[p.id].owner === 'sourwood' && p.type !== 'hq' && canPlotBuyout(s, p.id).ok)!.id;
    const cash = s.cash;
    expect(plotBuyout(s, theirs)).toBe(false);
    expect(s.plots[theirs].owner).toBe('sourwood');
    expect(s.cash).toBe(cash);
    expect(canPlotBuyout(s, theirs)).toEqual({ ok: false, why: 'Town Hall froze this sale' });
    expect(s.rivals.sourwood.hedges).toBe(110);
  });

  it('Historic hedges waits for Act 5 and the campaign, and never comes once Vera is out of the game', () => {
    const early = uphill(act5(60));
    atRank(early, 8); // Act 4
    const hill = (s: GameState) => PLOTS.find((p) => p.district === 'hilltop' && !s.plots[p.id].owner && canBuyPlot(s, p.id).ok)!.id;
    expect(buyPlot(early, hill(early))).toBe(true);
    const gone = uphill(act5(61));
    gone.rivals.sourwood.alive = false;
    expect(buyPlot(gone, hill(gone))).toBe(true);
    const sandbox = uphill(newGame(62, { mode: 'sandbox' }));
    sandbox.rank = 9;
    sandbox.phase = 'prep';
    expect(buyPlot(sandbox, hill(sandbox))).toBe(true);
    expect(sandbox.rivals.sourwood.hedges).toBeUndefined();
  });
});

describe('FizzCo\'s ad blitz', () => {
  /** Rank 3, with a stand of Lottie's next to one of FizzCo's. */
  function blitzable(seed: number) {
    const s = newGame(seed);
    s.day = 10;
    s.rank = 3;
    return { s, ...nextTo(s, 'fizzco') };
  }

  it('its mascot works the district where it meets you for 3 days: +25% appeal at its stands there, a day\'s walk paid each dawn from Strike', () => {
    const { s, theirs, mine } = blitzable(80);
    const d = PLOT_BY_ID[theirs].district;
    const st = s.plots[theirs].stand!;
    const before = curbAppeal(s, theirs), yours = curbAppeal(s, mine);
    const walk = marketingMultiplier(s, 'fizzco', st);
    const strike = budgetOf(s, 'fizzco').strike;
    const job = startScheme(s, 'fizzco', 'blitz')!;
    expect(job).toMatchObject({ kind: 'blitz', by: 'fizzco', day: 10, until: 12, district: d, cost: AD_BLITZ.perDay });
    expect(job.plots).toContain(theirs);
    expect(budgetOf(s, 'fizzco').strike).toBeCloseTo(strike - AD_BLITZ.perDay, 2);
    expect(adBlitzIn(s, d)).toBe(true);
    expect(curbAppeal(s, theirs)).toBeCloseTo(before * (1 + AD_BLITZ.pull), 6);
    expect(curbAppeal(s, mine)).toBeCloseTo(yours, 6); // only FizzCo's stands
    expect(marketingMultiplier(s, 'fizzco', st)).toBeCloseTo(walk, 6); // appeal, not foot traffic
    for (const p of PLOTS) {
      const ps = s.plots[p.id];
      if (p.district !== d && ps.owner === 'fizzco' && ps.stand) expect(adBlitzCurb(s, p.id)).toBe(1);
    }
    expect(s.news.at(-1)).toBe(`Bugle: FizzCo's mascot blitzes ${DISTRICT_BY_ID[d].name}: +25% appeal at its stands`);
    hush(s);
    for (const day of [11, 12]) {
      s.day = day;
      const left = budgetOf(s, 'fizzco').strike;
      schemesAtDawn(s);
      expect(budgetOf(s, 'fizzco').strike).toBeCloseTo(left - AD_BLITZ.perDay, 2);
      expect(adBlitzIn(s, d)).toBe(true);
    }
    expect(job.cost).toBe(AD_BLITZ.perDay * AD_BLITZ.days);
    s.day = 13;
    schemesAtDawn(s);
    expect(job.done).toBe(true);
    expect(adBlitzIn(s, d)).toBe(false);
    expect(adBlitzCurb(s, theirs)).toBe(1);
  });

  it('pulls the customers it shares with you its way: your stand within 2 plots sells less, and FizzCo\'s more', () => {
    // 82: your stand over the line in Maple Row, where FizzCo's share of your passers-by is under its 35%;
    // 87: on the same Old Town block, where FizzCo already takes its 35% of yours, so it's the street's you lose.
    for (const [seed, lose] of [[82, 'kept'], [87, 'inflow']] as const) {
      const { s, theirs, mine } = blitzable(seed);
      const yours = expectedDemand(s, mine), its = expectedDemand(s, theirs);
      startScheme(s, 'fizzco', 'blitz');
      const after = expectedDemand(s, mine);
      expect(after.demand).toBeLessThan(yours.demand);
      expect(after.kept).toBeLessThanOrEqual(yours.kept);
      expect(after.inflow).toBeLessThanOrEqual(yours.inflow); // never a customer more for you
      expect(after[lose]).toBeLessThan(yours[lose]);
      expect(expectedDemand(s, theirs).demand).toBeGreaterThan(its.demand);
    }
  });

  it('goes home early when Strike runs dry or FizzCo falls; none before Rank 3, away from your stands, short of Strike, or by anyone else', () => {
    const a = blitzable(81);
    const job = startScheme(a.s, 'fizzco', 'blitz')!;
    hush(a.s);
    budgetOf(a.s, 'fizzco').strike = AD_BLITZ.perDay - 1;
    a.s.day = 11;
    schemesAtDawn(a.s);
    expect(job).toMatchObject({ done: true, until: 10 });
    expect(a.s.news).toContain('Bugle: FizzCo\'s mascot goes home early');
    const b = blitzable(82);
    const fallen = startScheme(b.s, 'fizzco', 'blitz')!;
    b.s.rivals.fizzco.alive = false;
    expect(adBlitzIn(b.s, fallen.district!)).toBe(false);
    expect(schemeTickets(b.s).some((t) => t.includes('data-testid="blitz"'))).toBe(false);
    const early = blitzable(83).s;
    early.rank = 2;
    expect(startScheme(early, 'fizzco', 'blitz')).toBeNull();
    const lone = newGame(84); // only Lottie's Corner, nowhere near FizzCo
    lone.day = 10;
    lone.rank = 3;
    expect(startScheme(lone, 'fizzco', 'blitz')).toBeNull();
    const poor = blitzable(85).s;
    budgetOf(poor, 'fizzco').strike = AD_BLITZ.perDay * AD_BLITZ.days - 1;
    expect(startScheme(poor, 'fizzco', 'blitz')).toBeNull();
    const other = blitzable(86).s;
    nextTo(other, 'blenders');
    expect(startScheme(other, 'blenders', 'blitz')).toBeNull();
  });

  it('on the HUD: a red ticket naming the district, days left and Go There; FizzCo\'s stand card notes it', () => {
    const { s, theirs } = blitzable(87);
    startScheme(s, 'fizzco', 'blitz');
    const ticket = schemeTickets(s).find((t) => t.includes('data-testid="blitz"'))!;
    expect(ticket).toContain('cl-ticket red');
    expect(ticket).toContain(`FizzCo blitz: ${DISTRICT_BY_ID[PLOT_BY_ID[theirs].district].name.replace(/&/g, '&amp;')}`);
    expect(ticket).toContain('<i class="on"></i><i class="on"></i><i class="on"></i>');
    expect(ticket).toContain('data-action="goto"');
    expect(schemeNote(s, theirs)).toBe('<span class="cl-note bad">Ad blitz +25%</span>');
  });
});

describe('Peaceful: rivals scheme instead', () => {
  const calm = (seed: number) => newGame(seed, { mode: 'sandbox', peaceful: true });
  /** Every rival can start something: a stand of Lottie's next to each, the day past the first week. */
  function ready(s: GameState, rank: number) {
    s.rank = rank;
    s.day = 20;
    return { s, fronts: RIVALS.map((id) => ({ id, ...nextTo(s, id) })) };
  }
  /** How many schemes start over `n` dawns, each from a clean book, and of which kinds. */
  function tally(s: GameState, n: number) {
    const kinds: Record<string, number> = {};
    let started = 0;
    for (let i = 0; i < n; i++) {
      s.schemes = [];
      schemesAtDawn(s);
      for (const x of s.schemes) kinds[`${x.kind}:${x.by}`] = (kinds[`${x.kind}:${x.by}`] ?? 0) + 1;
      started += s.schemes.length;
    }
    return { started, kinds };
  }

  it('schemes come three times as often as in a game with raids', () => {
    const fists = tally(ready(newGame(41), 1).s, 600).started;
    const calmly = tally(ready(calm(41), 1).s, 600).started;
    expect(fists).toBeGreaterThan(20); // 2% a rival a dawn at Threat 1
    expect(calmly).toBeGreaterThan(2.3 * fists);
    expect(calmly).toBeLessThan(3.7 * fists);
  });

  it('a rival you outsold next door answers with a price war, and schemes twice as often', () => {
    const { s, fronts } = ready(newGame(42), 3);
    const f = fronts.find((x) => x.id === 'fizzco')!;
    expect(outsoldAt(s, 'fizzco')).toEqual([]);
    const before = tally(s, 600);
    expect(before.kinds['blitz:fizzco']).toBeGreaterThan(0); // left alone, FizzCo often reaches for its mascot first
    s.plots[f.mine].stand!.day.customers = 40; // yesterday Lottie's next door sold 40 cups to their 10
    s.plots[f.theirs].stand!.day.customers = 10;
    expect(outsoldAt(s, 'fizzco')).toEqual([f.theirs]);
    const after = tally(s, 600);
    expect(after.kinds['blitz:fizzco'] ?? 0).toBe(0);
    expect(after.kinds['priceWar:fizzco']).toBeGreaterThan(1.5 * (before.kinds['blitz:fizzco'] + (before.kinds['priceWar:fizzco'] ?? 0)));
    const { s: t } = ready(newGame(43), 3); // a stand of theirs outselling yours provokes nothing
    for (const id of RIVALS) {
      for (const p of warFront(t, id)) t.plots[p].stand!.day.customers = 99;
      expect(outsoldAt(t, id)).toEqual([]);
    }
  });

  it('any rival can run an ad blitz: +25% at its own stands in the district, out of Strike, in the Bugle', () => {
    const { s, fronts } = ready(calm(44), 3);
    const b = fronts.find((x) => x.id === 'blenders')!;
    expect(RIVALS.every((id) => blitzes(s, id))).toBe(true);
    expect(blitzes(newGame(44), 'blenders')).toBe(false); // with raids on, only FizzCo's mascot blitzes
    const d = PLOT_BY_ID[b.theirs].district;
    const st = s.plots[b.theirs].stand!;
    const before = curbAppeal(s, b.theirs);
    const strike = budgetOf(s, 'blenders').strike;
    const job = startScheme(s, 'blenders', 'blitz')!;
    expect(job).toMatchObject({ kind: 'blitz', by: 'blenders', district: d, until: s.day + AD_BLITZ.days - 1 });
    expect(budgetOf(s, 'blenders').strike).toBeCloseTo(strike - AD_BLITZ.perDay, 2);
    expect(curbAppeal(s, b.theirs)).toBeCloseTo(before * (1 + AD_BLITZ.pull), 6);
    expect(st).toBe(s.plots[b.theirs].stand);
    expect(adBlitzIn(s, d, 'blenders')).toBe(true);
    expect(adBlitzIn(s, d)).toBe(false); // not FizzCo's mascot
    for (const p of PLOTS) {
      const ps = s.plots[p.id];
      if (ps.stand && ps.owner && ps.owner !== 'blenders') expect(adBlitzCurb(s, p.id)).toBe(1);
    }
    expect(s.news.at(-1)).toBe(`Bugle: The Boardwalk Blenders ad blitz in ${DISTRICT_BY_ID[d].name}: +25% appeal at its stands`);
    const ticket = schemeTickets(s).find((x) => x.includes('data-testid="blitz"'))!;
    expect(ticket).toContain(`Blenders blitz: ${DISTRICT_BY_ID[d].name.replace(/&/g, '&amp;')}`);
    expect(schemeNote(s, b.theirs)).toBe('<span class="cl-note bad">Ad blitz +25%</span>');
    hush(s);
    s.day++;
    budgetOf(s, 'blenders').strike = 0;
    schemesAtDawn(s);
    expect(job.done).toBe(true);
    expect(s.news).toContain('Bugle: The Boardwalk Blenders ad blitz ends early');
    expect(curbAppeal(s, b.theirs)).toBeCloseTo(before, 6);
  });

  it('a blitzing rival\'s jingle opens the morning show, so the radio tips you off', () => {
    const { s } = ready(calm(45), 3);
    expect(blitzingToday(s)).toEqual([]);
    expect(morningShow(s)[0].kind).toBe('id');
    const job = startScheme(s, 'hollis', 'blitz') as Scheme;
    expect(job).not.toBeNull();
    expect(blitzingToday(s)).toEqual(['hollis']); // radio.ts reads the blitzes running today
    expect(morningShow(s)[0]).toMatchObject({ kind: 'rival', text: `Hollis Sweet Tea Co.'s jingle: "${RIVAL_JINGLES.hollis}"` });
    expect(startScheme(s, 'fizzco', 'blitz')).not.toBeNull();
    expect(morningShow(s).filter((l) => l.kind === 'rival')).toHaveLength(2);
    s.day = job.until + 1; // both blitzes have run their days: the station ID opens the show again
    expect(blitzingToday(s)).toEqual([]);
    expect(morningShow(s)[0].kind).toBe('id');
  });

  it('a real Peaceful month: no raids, and the rivals price, blitz and poster instead', () => {
    const s = calm(46);
    s.rank = 3;
    s.cash = 1_000_000;
    for (const id of RIVALS) nextTo(s, id);
    const seen = new Set<string>();
    for (let d = 0; d < 30; d++) {
      openStand(s);
      simulateRestOfDay(s);
      sleepUntilDawn(s);
      expect(s.raids).toEqual([]);
      for (const x of s.schemes ?? []) seen.add(`${x.kind}:${x.by}`);
    }
    const kinds = new Set([...seen].map((k) => k.split(':')[0]));
    const by = new Set([...seen].map((k) => k.split(':')[1]));
    expect(kinds.has('priceWar')).toBe(true);
    expect([...seen].some((k) => k.startsWith('blitz:') && k !== 'blitz:fizzco')).toBe(true);
    expect(by.size).toBeGreaterThanOrEqual(3);
  }, 120_000); // thirty full days of business
});

describe("Act 3's mystery: the Night Shift spoils your stock", () => {
  const stock = (s: GameState, plot = LOTTIES_CORNER) => {
    s.plots[plot].stand!.inventory.lemons = [{ qty: 60, day: s.day - 1, unitCost: 0.2 }, { qty: 40, day: s.day, unitCost: 0.2 }];
  };
  const lemons = (s: GameState, plot = LOTTIES_CORNER) => s.plots[plot].stand!.inventory.lemons.reduce((a, b) => a + b.qty, 0);
  const spoils = (s: GameState) => (s.schemes ?? []).filter((x) => x.kind === 'spoil');
  const corner = PLOT_BY_ID[LOTTIES_CORNER].name;

  /** Day 45 of the campaign, in Act 3: Dex on the crew, 100 lemons at Lottie's Corner, and no Strike for any other scheme. */
  function act3(seed: number) {
    const s = newGame(seed);
    s.day = 45;
    atRank(s, 5); // Act 3
    welcomeDex(s);
    for (const id of RIVALS) budgetOf(s, id).strike = 0;
    stock(s);
    return s;
  }
  /** The next dawn's schemes, with the Night Shift's nightly chance pinned. */
  function dawn(s: GameState, chance: number) {
    const was = MYSTERY.chance;
    MYSTERY.chance = chance;
    try { s.day++; schemesAtDawn(s); } finally { MYSTERY.chance = was; }
  }
  /** A run where the Corner's night watch (Floodlights and two alarms) catches the crew on the act's first night. */
  function caughtRun() {
    for (let seed = 1; seed <= 100; seed++) {
      const s = act3(seed);
      s.plots[LOTTIES_CORNER].defense.gadgets.push('floodlights', 'alarm', 'goose');
      schemesAtDawn(s);
      if (spoils(s)[0].caught) return s;
    }
    throw new Error('never caught');
  }

  it('opens Act 3 with a night of spoiled stock and no raid: every lemon at your stand, no culprit named, and Dex blames the geese', () => {
    const s = act3(1);
    const before = s.news.length;
    schemesAtDawn(s); // the act's first night: it always comes, and costs Cold Brew nothing
    expect(spoils(s)).toEqual([{ kind: 'spoil', by: 'coldbrew', day: 45, until: 45, plots: [LOTTIES_CORNER], caught: false, spoiled: 100, value: 20, cost: 0, done: true }]);
    expect(lemons(s)).toBe(0);
    expect(s.raids).toEqual([]); // not a raid: no warning and no fight
    const told = s.news.slice(before);
    expect(told).toEqual([
      `Lottie: "${MYSTERY.lottie}"`,
      `Bugle: 100 lemons go bad overnight at ${corner}, and nobody saw a thing`,
      `Dex: "${MYSTERY.dex}"`,
    ]);
    expect(told.some((n) => n.includes('Cold Brew'))).toBe(false); // nobody knows who
    expect(s.rivals.coldbrew.mystery).toEqual({ from: 45 });
    const ticket = schemeTickets(s).find((x) => x.includes('data-testid="spoil"'))!;
    expect(ticket).toContain('Stock spoiled! −100 lemons');
    expect(ticket).toContain(`data-action="restockNow" data-plot="${LOTTIES_CORNER}"`);
    expect(ticket).toContain('Dex blames the geese');
    expect(ticket).not.toContain('Cold Brew');
    s.day = 46;
    expect(schemeTickets(s).some((x) => x.includes('data-testid="spoil"'))).toBe(false); // that morning's news only

    const two = act3(2); // the crew goes for a stocked stand: an empty one is never the target
    two.plots[LOTTIES_CORNER].stand!.inventory.lemons = [];
    two.plots['campus-0s'] = { ...two.plots['campus-0s'], owner: 'player', stand: newStand(1, 1) };
    stock(two, 'campus-0s');
    schemesAtDawn(two);
    expect(spoils(two)[0]).toMatchObject({ plots: ['campus-0s'], spoiled: 100 });
  });

  it("after the first night it comes on a chance, out of Cold Brew's Strike; never in a Truce, another act, the Sandbox or with Cold Brew gone", () => {
    const s = act3(3);
    schemesAtDawn(s);
    stock(s);
    dawn(s, 0);
    expect(spoils(s)).toHaveLength(1); // not tonight
    dawn(s, 1);
    expect(spoils(s)).toHaveLength(1); // its Strike is empty
    budgetOf(s, 'coldbrew').strike = MYSTERY.cost;
    dawn(s, 1);
    expect(spoils(s).at(-1)).toMatchObject({ day: 48, cost: MYSTERY.cost, spoiled: 100 });
    expect(budgetOf(s, 'coldbrew').strike).toBe(0);
    expect(s.news.filter((n) => n === `Lottie: "${MYSTERY.lottie}"`)).toHaveLength(1); // the goal is announced once
    expect(s.rivals.coldbrew.mystery).toEqual({ from: 45 });

    const nights = (change: (s: GameState) => void) => {
      const t = act3(4);
      change(t);
      budgetOf(t, 'coldbrew').strike = 1000;
      schemesAtDawn(t);
      return spoils(t).length;
    };
    expect(nights(() => {})).toBe(1);
    expect(nights((t) => { t.rivals.coldbrew.truceUntil = 45; })).toBe(0);
    expect(nights((t) => atRank(t, 4))).toBe(0); // Act 2
    expect(nights((t) => atRank(t, 7))).toBe(0); // Act 4
    expect(nights((t) => { t.rivals.coldbrew.alive = false; })).toBe(0);
    expect(nights((t) => { t.plots[LOTTIES_CORNER].stand!.inventory.lemons = []; })).toBe(0); // nothing to spoil
    const sandbox = newGame(4, { mode: 'sandbox' });
    sandbox.day = 45;
    sandbox.rank = 5;
    stock(sandbox);
    schemesAtDawn(sandbox);
    expect(spoils(sandbox)).toEqual([]);
  });

  it("your night watch catches the crew on a Cold Brew night raid's odds: never at a bare stand, often under Floodlights and alarms", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = act3(seed);
      schemesAtDawn(s);
      expect(spoils(s)[0].caught).toBe(false); // in the dark the Night Shift's stealth beats a bare stand
    }
    let caught = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const s = act3(seed);
      s.plots[LOTTIES_CORNER].defense.gadgets.push('floodlights', 'alarm', 'goose');
      expect(detectionChance(s, LOTTIES_CORNER, true) - NIGHT_SHIFT.stealth).toBeCloseTo(0.55);
      schemesAtDawn(s);
      if (spoils(s)[0].caught) caught++;
    }
    expect(caught).toBeGreaterThan(10);
    expect(caught).toBeLessThan(35);
  });

  it('caught, the saboteurs are Cold Brew: the stock is saved, Juni phones sore, and the spoiling stops', () => {
    const s = caughtRun();
    expect(lemons(s)).toBe(100);
    expect(s.rivals.coldbrew.mystery).toEqual({ from: 45, caught: 45 });
    expect(s.news).toContain(`Bugle: Lottie's night watch catches Cold Brew's Night Shift spoiling the stock at ${corner}`);
    expect(s.news).toContain(`Dex: "${MYSTERY.dexCaught}"`);
    expect(s.news).not.toContain(`Lottie: "${MYSTERY.lottie}"`); // nothing spoiled, nothing to wonder about
    expect(s.phone!.queue).toContainEqual(expect.objectContaining({ who: 'coldbrew', mood: 'sore' }));
    expect(schemeTickets(s).find((x) => x.includes('data-testid="spoil"'))).toContain("Caught! Cold Brew's night crew");
    expect(nightShiftUnmasked(s)).toBe(true);
    expect(mysteryOn(s)).toBe(false);
    stock(s);
    budgetOf(s, 'coldbrew').strike = 10_000;
    for (let i = 0; i < 5; i++) dawn(s, 1);
    expect(spoils(s)).toHaveLength(1);
    expect(lemons(s)).toBe(100);
  });

  it("Squawk's night flight unmasks the Night Shift too: the spoiling stops, and the goal leaves the card unpaid", () => {
    const s = act3(5);
    schemesAtDawn(s);
    expect(mysteryGoal(s)).toEqual({ text: MYSTERY.goal, progress: 0, done: false });
    playScene(s, 'nightFlight'); // story's Act 3 beat (src/sim/beats.ts)
    expect(nightShiftUnmasked(s)).toBe(true);
    expect(mysteryGoal(s)).toBeNull();
    stock(s);
    budgetOf(s, 'coldbrew').strike = 10_000;
    for (let i = 0; i < 5; i++) dawn(s, 1);
    expect(spoils(s)).toHaveLength(1);
    expect(lemons(s)).toBe(100);
  });

  it("puts its goal on Lottie's card: Floodlights or a posted Lookout are halfway, and catching the crew pays it", () => {
    const s = act3(6);
    schemesAtDawn(s);
    checkGoals(s);
    expect(goalsNow(s)[1]).toMatchObject({ slot: 'medium', text: MYSTERY.goal, progress: 0, done: false, story: true });
    const look = s.guards[0];
    const was = { specialty: look.specialty, post: look.post };
    look.specialty = 'lookout';
    look.post = LOTTIES_CORNER;
    expect(goalsNow(s)[1].progress).toBe(0.5); // a Lookout on watch at your stand
    look.post = null;
    expect(goalsNow(s)[1].progress).toBe(0); // off post, no help
    Object.assign(look, was);
    s.plots[LOTTIES_CORNER].defense.gadgets.push('floodlights');
    expect(goalsNow(s)[1].progress).toBe(0.5);
    s.plots[LOTTIES_CORNER].defense.gadgets.push('alarm', 'goose', 'watchtower');
    budgetOf(s, 'coldbrew').strike = 100_000;
    for (let i = 0; i < 40 && s.rivals.coldbrew.mystery!.caught === undefined; i++) { stock(s); dawn(s, 1); }
    expect(s.rivals.coldbrew.mystery!.caught).toBeGreaterThan(45);
    const cash = s.cash;
    checkGoals(s);
    expect(s.news.some((n) => n.startsWith(`✓ ${MYSTERY.goal} +$`))).toBe(true);
    expect(s.cash).toBeGreaterThan(cash);
    expect(s.goals!.done).toContain(`${MYSTERY_GOAL}:${MYSTERY.goal}`);
    atRank(s, 7); // Act 4: off the card for good
    expect(mysteryGoal(s)).toBeNull();
  });

  it("puts the spoiled lemons on the dawn's Ledger at cost, like lemons gone bad by age", () => {
    const s = act3(8);
    s.day = 44; // the night before Act 3's first spoiled dawn
    openStand(s);
    simulateRestOfDay(s);
    stock(s); // 100 lemons on the shelf at $0.20 when the Corner shuts
    const worth = s.plots[LOTTIES_CORNER].stand!.inventory.lemons.reduce((a, b) => a + b.qty * b.unitCost, 0);
    expect(worth).toBeCloseTo(20, 6);
    sleepUntilDawn(s);
    expect(s.day).toBe(45);
    expect(spoils(s)[0]).toMatchObject({ day: 45, caught: false, spoiled: 100, value: 20 });
    expect(s.today.lemonsSpoiled).toBe(100);
    expect(s.today.waste).toBeCloseTo(20, 6);
    expect(s.today.stockUsed).toBeCloseTo(20, 6);
    expect(rowAmount(s.today, 'supplies')).toBeCloseTo(-20, 6); // the Ledger's Supplies row
  });

  it('rides the save: the record loads, and the goal provider is there once', () => {
    const s = act3(7);
    schemesAtDawn(s);
    const loaded = migrateSave(JSON.parse(JSON.stringify(s)))!;
    expect(loaded.rivals.coldbrew.mystery).toEqual({ from: 45 });
    expect(GOAL_PROVIDERS.filter((p) => p.id === MYSTERY_GOAL)).toHaveLength(1);
    expect(mysteryGoal(loaded)).toEqual({ text: MYSTERY.goal, progress: 0, done: false });
  });
});

describe("Endless Summer's Out-of-Towner: Snootwater Springs", () => {
  const SNOOT = OUT_OF_TOWNER.id;
  /** A won campaign that keeps squeezing: the Bay's five are out of business and their land is back on the market. */
  function endless(seed: number): GameState {
    const s = newGame(seed);
    for (const id of RIVALS) s.rivals[id].alive = false;
    for (const p of PLOTS) {
      const ps = s.plots[p.id];
      if (ps.owner && ps.owner !== 'player') s.plots[p.id] = { ...ps, owner: p.type === 'hq' ? 'player' : null, stand: null, invested: 0, garrison: 0 };
    }
    s.rank = 9;
    s.outcome = { result: 'won', how: 'domination', day: s.day };
    expect(keepSqueezing(s)).toBe(true);
    return s;
  }
  /** The Out-of-Towner's dawns, one by one, up to `day`. */
  const toDay = (s: GameState, day: number) => { while (s.day < day) { s.day++; outOfTownerAtDawn(s); } };
  const kit: SitKit = {
    btn: (action, label, b = { ok: true }, extra = '') => `<button data-action="${action}" ${extra} ${b.ok ? '' : 'disabled'}>${label}</button>`,
    tape: (inner) => `<span>${inner}</span>`, locked: (b) => !b.ok && /Rank \d/.test(b.why), esc: (x) => x,
    whole: (n) => `$${Math.round(n).toLocaleString('en-US')}`, face: (_s, g: Guard) => `<i>${g.name}</i>`,
  };

  it('waits out of town until Endless Summer: out of the game, off the Corkboard, no date in a run that ends', () => {
    const s = newGame(41);
    expect(s.rivals[SNOOT]).toMatchObject({ alive: false, cash: 0 });
    expect(ownedPlots(s, SNOOT)).toHaveLength(0);
    expect(boardOrder(s)).not.toContain(SNOOT);
    s.day = 200;
    outOfTownerAtDawn(s); // a campaign still being played
    s.outcome = { result: 'won', how: 'domination', day: 200 }; // won, and the run ends there
    toDay(s, 260);
    const sandbox = newGame(41, { mode: 'sandbox' });
    for (const id of RIVALS) sandbox.rivals[id].alive = false;
    toDay(sandbox, 60);
    for (const g of [s, sandbox]) expect(g.rivals[SNOOT]).toMatchObject({ alive: false, cash: 0 });
  });

  it('comes to town on the 14th dawn after the win: the busiest open plots of your thinnest district, a Bugle lead and a taunt', () => {
    const s = endless(42);
    const won = s.day;
    for (let d = 1; d < OUT_OF_TOWNER.after; d++) { openStand(s); simulateRestOfDay(s); sleepUntilDawn(s); }
    expect(s.day).toBe(won + OUT_OF_TOWNER.after - 1);
    expect(s.rivals[SNOOT].alive).toBe(false);
    const where = thinnestDistrict(s)!;
    const open = PLOTS.filter((p) => p.district === where && ['street', 'prime', 'landmark'].includes(p.type) && !s.plots[p.id].owner)
      .sort((a, b) => b.baseTraffic - a.baseTraffic || a.id.localeCompare(b.id));
    const chest = Math.max(OUT_OF_TOWNER.chest.floor, Math.round((netWorth(s) * OUT_OF_TOWNER.chest.share) / 100) * 100);
    openStand(s); simulateRestOfDay(s); sleepUntilDawn(s); // the 14th dawn
    const r = s.rivals[SNOOT];
    expect(r).toMatchObject({ alive: true, arrived: won + OUT_OF_TOWNER.after, due: won + OUT_OF_TOWNER.after + OUT_OF_TOWNER.every });
    const bought = ownedPlots(s, SNOOT);
    expect(bought.length).toBeGreaterThanOrEqual(OUT_OF_TOWNER.plots[0]);
    expect(bought.length).toBeLessThanOrEqual(OUT_OF_TOWNER.plots[1]);
    expect(bought.map((p) => p.id).sort()).toEqual(open.slice(0, bought.length).map((p) => p.id).sort());
    for (const p of bought) {
      expect(s.plots[p.id].stand!.level).toBeGreaterThanOrEqual(FACTIONS[SNOOT].startLevel);
      expect(s.plots[p.id].garrison).toBeLessThanOrEqual(1);
    }
    expect(r.cash).toBeGreaterThan(0);
    expect(r.cash).toBeLessThanOrEqual(chest * 1.5); // its war chest, give or take a day's trade
    expect(s.news).toContain(`OUT-OF-TOWNERS! Snootwater Springs buys into ${DISTRICT_BY_ID[where].name}.`);
    const paper = bugleNews(s);
    expect([...paper.headline, ...paper.briefs].join(' ')).toMatch(/Snootwater Springs buys into|SNOOTWATER/i); // the lead, or a brief under a bigger one
    expect(s.phone!.queue.some((c) => c.who === SNOOT && c.text === OUT_OF_TOWNER.taunts[0])).toBe(true);
    expect(OUT_OF_TOWNER.taunts[0]).toContain('a cry for help');
    expect(boardOrder(s)).toContain(SNOOT);
  });

  it('every 30 days: more money and trucks while it is here; with no plot left it goes home, and comes back on its next date', () => {
    const s = endless(44);
    const won = s.day;
    toDay(s, won + OUT_OF_TOWNER.after);
    const first = ownedPlots(s, SNOOT).length, cash = s.rivals[SNOOT].cash;
    toDay(s, won + OUT_OF_TOWNER.after + OUT_OF_TOWNER.every - 1);
    expect(ownedPlots(s, SNOOT)).toHaveLength(first);
    toDay(s, won + OUT_OF_TOWNER.after + OUT_OF_TOWNER.every);
    expect(ownedPlots(s, SNOOT).length).toBeGreaterThanOrEqual(first + OUT_OF_TOWNER.plots[0]);
    expect(s.rivals[SNOOT].cash).toBeGreaterThanOrEqual(cash + OUT_OF_TOWNER.chest.floor);
    expect(s.news.at(-1)).toMatch(/^OUT-OF-TOWNERS! Snootwater Springs sends more trucks to /);
    for (const p of ownedPlots(s, SNOOT)) s.plots[p.id] = { ...s.plots[p.id], owner: 'player' };
    rivalsBankrupt(s);
    expect(s.rivals[SNOOT].alive).toBe(false);
    expect(s.news).toContain('Snootwater Springs pack up and leave town.');
    const next = s.rivals[SNOOT].due!;
    expect(next).toBe(won + OUT_OF_TOWNER.after + 2 * OUT_OF_TOWNER.every);
    toDay(s, next);
    expect(s.rivals[SNOOT]).toMatchObject({ alive: true, arrived: next, grudge: 0 });
    expect(ownedPlots(s, SNOOT).length).toBeGreaterThanOrEqual(OUT_OF_TOWNER.plots[0]);
    expect(s.news.some((n) => /^OUT-OF-TOWNERS! Snootwater Springs is back, buying into /.test(n))).toBe(true);
    expect(s.phone!.queue.some((c) => c.who === SNOOT && c.text === OUT_OF_TOWNER.taunts[1])).toBe(true);
  });

  it('in a run started as Endless, its clock starts the dawn the last of the Bay\'s five is out', () => {
    const s = newGame(45, { mode: 'endless' });
    toDay(s, 60);
    expect(s.rivals[SNOOT].due).toBeUndefined();
    for (const id of RIVALS) s.rivals[id].alive = false;
    toDay(s, 61);
    expect(s.rivals[SNOOT]).toMatchObject({ since: 61, due: 61 + OUT_OF_TOWNER.after, alive: false });
    toDay(s, 61 + OUT_OF_TOWNER.after);
    expect(s.rivals[SNOOT].alive).toBe(true);
  });

  it('buys into your thinnest district: your lowest share among those with a plot for sale; none for sale, it waits', () => {
    const s = endless(48);
    for (const p of PLOTS) if (p.type !== 'civic') s.plots[p.id].owner = 'player';
    const free = (d: DistrictId, n: number) => { for (const p of PLOTS.filter((x) => x.district === d && x.type === 'street').slice(0, n)) s.plots[p.id].owner = null; };
    free('maple', 1);
    free('oldtown', 3);
    expect(thinnestDistrict(s)).toBe('oldtown');
    const other = DISTRICTS.find((d) => d.id !== 'maple' && d.id !== 'oldtown')!.id;
    for (const p of PLOTS) if (p.district === other && p.type !== 'civic') s.plots[p.id].owner = 'hollis'; // none of it Lottie's, none of it for sale
    expect(thinnestDistrict(s)).toBe('oldtown');
    for (const p of PLOTS) if (p.type !== 'civic' && !s.plots[p.id].owner) s.plots[p.id].owner = 'player';
    expect(thinnestDistrict(s)).toBeNull();
    expect(comeToTown(s, SNOOT)).toBe(false);
    expect(s.rivals[SNOOT].alive).toBe(false);
  });

  it("fights like Brock's Bros, with no HQ to storm and no seat in the Syndicate; its Sit-downs are at its stands", () => {
    const s = endless(46);
    toDay(s, s.day + OUT_OF_TOWNER.after);
    expect(swarms(SNOOT)).toBe(true);
    const tier = threatLevel(s);
    expect(raidSize(SNOOT, 1, tier)).toBe(RAID_PARTY[tier - 1].size[1]);
    expect(raidCost(s, SNOOT, 4)).toBe(raidCost(s, 'blenders', 4));
    expect(canAssault(s, SNOOT, ['g1'])).toEqual({ ok: false, why: 'No HQ in the Bay to storm' });
    expect(syndicateMembers(s)).not.toContain(SNOOT);
    const busiest = ownedPlots(s, SNOOT).sort((a, b) => b.baseTraffic - a.baseTraffic)[0];
    expect(corkboardBody(s)).toContain(`data-plot="${busiest.id}"`);
    const row = plotBuyoutRow(kit, s, busiest.id);
    expect(row).toContain('data-testid="plot-buyout"');
    expect(row).toContain(`data-action="truce" data-rival="${SNOOT}"`);
  });

  it('an old save gets it waiting out of town, and the run carries on', () => {
    const s = newGame(47);
    const old = JSON.parse(JSON.stringify(s));
    delete old.rivals[SNOOT];
    const loaded = migrateSave(old)!;
    expect(loaded.rivals[SNOOT]).toMatchObject({ alive: false, cash: 0 });
    openStand(loaded); simulateRestOfDay(loaded); sleepUntilDawn(loaded);
    expect(loaded.day).toBe(s.day + 1);
  });
});
