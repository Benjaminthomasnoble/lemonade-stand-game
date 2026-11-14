import { afterEach, describe, expect, it } from 'vitest';
import {
  BRAND_TIERS, bugleHeadline, CLOSE, costPerCup, EVENT_DEFS, eventsOf, fightRaid, frontPage, grantPage, HEAT_WAVE, liveEvent, LOTTIES_CORNER, lookAhead,
  marketLines, marketText, newGame, openStand, PLOT_BY_ID, PLOTS, playerStands, raidPartyFor, RANKS, registerEvent, simulateRestOfDay, sleepUntilDawn, tickMinute, weatherText,
  nearbyPlots, newStand, startScheme,
  type EventDef, type GameState, type RivalId,
} from './economy.ts';
import { bugleSheet } from '../ui/bugle.ts';
import { calendarTickets, worldTabs } from '../ui/calendar.ts';
import { LINES, phoneCall, takeCall } from './phone.ts';

/** Jump to a day's Morning Prep through the real dawn (with cash to spare: these tests skip the business days). */
function dawn(s: GameState, day: number): void {
  s.cash = Math.max(s.cash, 1000);
  s.day = day - 1;
  s.phase = 'report';
  s.raids = [];
  if (!sleepUntilDawn(s)) throw new Error(`no dawn on day ${day}`);
}

/** Run today's business to closing time (the newsroom marks the day's news at closing), with no raids tonight. */
function closeUp(s: GameState): void {
  s.cash = Math.max(s.cash, 1000);
  openStand(s);
  s.minute = CLOSE - 1;
  tickMinute(s);
  s.raids = [];
}

/** Clear this morning's rival moves and wire (these tests skip the business days), so a test sees only the story it set up. */
function calm(s: GameState): void {
  s.world!.paper!.moves = [];
  s.world!.paper!.wire = [];
}
/** ... and last night's fights too. */
function quiet(s: GameState): void {
  calm(s);
  s.world!.fights = [];
}

const rivalPlot = (s: GameState, rival: RivalId) => PLOTS.find((p) => s.plots[p.id].owner === rival && s.plots[p.id].stand && p.type === 'street')!.id;
const raid = (s: GameState, attacker: RivalId, target: string) =>
  fightRaid(s, { id: `t${s.nextId++}`, attacker, target, objective: 'smash', party: raidPartyFor(s, attacker), detected: true, eta: '23:00' }, true);
const short = (plotId: string) => PLOT_BY_ID[plotId].name.replace(/ lot /, ' ');
/** A stand of Lottie's on a street next to one of the rival's: the front of its price war. */
function besideRival(s: GameState, rival: RivalId): void {
  for (const p of PLOTS) {
    if (s.plots[p.id].owner !== rival || !s.plots[p.id].stand || p.type === 'hq') continue;
    const q = nearbyPlots(p).find((x) => x.id !== p.id && (x.type === 'street' || x.type === 'prime') && s.plots[x.id].owner !== rival);
    if (q) { s.plots[q.id] = { ...s.plots[q.id], owner: 'player', stand: newStand(1, 1) }; return; }
  }
  throw new Error(`no street next to ${rival}`);
}

const added: string[] = [];
function testEvent(def: Partial<EventDef> & { id: string }): EventDef {
  const d: EventDef = { name: def.id, kind: 'good', scope: 'bay', when: 'dawn', days: 1, counter: 'Play it', weight: 0, headline: () => `${def.id} today`, ...def };
  registerEvent(d);
  added.push(d.id);
  return d;
}
const chance = { ...HEAT_WAVE.chance };
afterEach(() => {
  for (const id of added.splice(0)) delete EVENT_DEFS[id];
  Object.assign(HEAT_WAVE.chance, chance);
});

describe('the Morning Bugle', () => {
  it('a story beat leads, then a rank-up, then last night\'s raid, then the weather; the rest print as briefs', () => {
    const s = newGame(31);
    dawn(s, 3);
    quiet(s);
    const weatherBrief = `${weatherText(s.forecast)} today.`;
    expect(frontPage(s).briefs).not.toContain(weatherBrief); // a quiet morning: the weather leads

    // Last night: the Blenders hit Lottie's Corner, and Hollis hit a Sourwood stand.
    s.phase = 'report';
    const mine = raid(s, 'blenders', LOTTIES_CORNER);
    const theirs = raid(s, 'hollis', rivalPlot(s, 'sourwood'));
    dawn(s, 4);
    calm(s);
    const big = { smashed: 'STAND SMASHED!', robbed: 'TILL ROBBED!', damaged: 'CLOSE CALL!', repelled: 'RAID HELD!' }[mine.outcome];
    expect(bugleHeadline(s)[0]).toBe(big);
    const said = { smashed: 'smashed', robbed: 'robbed', damaged: 'roughed up', repelled: 'held off' }[theirs.outcome];
    expect(frontPage(s).briefs).toContain(`Hollis raid Sourwoods at ${short(theirs.target)}: ${said}.`); // rival-vs-rival, too
    expect(frontPage(s).briefs).toContain(`${weatherText(s.forecast)} today.`);

    // A rank-up overnight outranks a raid.
    s.phase = 'report';
    raid(s, 'blenders', LOTTIES_CORNER);
    s.rank = 2;
    dawn(s, 5);
    calm(s);
    expect(bugleHeadline(s)).toEqual(['RANK UP!', `Charlie now a ${RANKS[1].title}`]); // the Grandkid, by name (grandkid.ts)
    expect(frontPage(s).briefs.length).toBeGreaterThanOrEqual(2);

    // A page coming home is a story beat: it leads over both.
    s.phase = 'report';
    raid(s, 'blenders', LOTTIES_CORNER);
    s.rank = 3;
    grantPage(s, 'honeyGinger');
    dawn(s, 6);
    calm(s);
    expect(bugleHeadline(s)).toEqual(['PAGE COMES HOME!', 'Honey-Ginger Hot Lemonade back in the book']);
    expect(frontPage(s).briefs[0]).toBe(`Lottie's grandkid Charlie Puckett is now a ${RANKS[2].title}.`);

    // The morning a new act begins (story.ts), its banner leads over every other story; the page drops to a brief.
    s.story!.act = 2;
    s.story!.banner = s.day;
    expect(bugleHeadline(s)).toEqual(['ACT 2!', 'Surf & Turf']);
    expect(frontPage(s).briefs).toContain("Honey-Ginger Hot Lemonade is back in Lottie's book.");
  });

  it('a Sabotage makes the paper as spoiled stock, never as a $0 till grab', () => {
    const s = newGame(31);
    dawn(s, 3);
    quiet(s);
    s.phase = 'report';
    const baristas = [0, 1, 2].map((i) => ({ id: `c${i}`, name: `Barista ${i}`, side: 'att' as const, hp: 100, hit: 18, chop: 10, nerve: 50, armor: 0, weapon: 'clubs' as const }));
    const won = fightRaid(s, { id: 'sab', attacker: 'coldbrew', target: LOTTIES_CORNER, objective: 'shakedown', sabotage: true, party: baristas, detected: false, eta: '02:00' }, true);
    expect([won.outcome, won.sabotage]).toEqual(['robbed', true]);
    expect(s.world!.fights![0]).toMatchObject({ outcome: 'robbed', loot: 0, sabotage: true }); // the newsroom hears it was the stock
    dawn(s, 4);
    calm(s);
    const at = short(LOTTIES_CORNER);
    expect(bugleHeadline(s)).toEqual(['STOCK SPOILED!', `Cold Brew hit ${at}`]);
    expect(JSON.stringify(frontPage(s))).not.toContain('$0');

    // Your crew's Sabotage, won and foiled; a rival-vs-rival one prints as a brief.
    const target = rivalPlot(s, 'blenders');
    const note = (attacker: RivalId | 'player', defender: RivalId | 'player', outcome: 'robbed' | 'damaged' | 'repelled') =>
      ({ day: s.day - 1, minute: 2 * 60, attacker, defender, target, outcome, loot: 0, sabotage: true as const });
    s.world!.fights = [note('player', 'blenders', 'robbed')];
    expect(bugleHeadline(s)).toEqual(['SABOTAGE!', `Stock spoiled at ${short(target)}`]);
    s.world!.fights = [note('player', 'blenders', 'repelled')];
    expect(bugleHeadline(s)).toEqual(['SABOTAGE FOILED', `Blenders hold ${short(target)}`]);
    s.world!.fights = [note('coldbrew', 'player', 'repelled')];
    expect(bugleHeadline(s)).toEqual(['SABOTAGE FOILED!', `Cold Brew caught at ${short(target)}`]);
    s.world!.fights = [note('coldbrew', 'blenders', 'robbed')];
    expect(frontPage(s).briefs).toContain(`Cold Brew sabotage Blenders at ${short(target)}: stock spoiled.`);
  });

  it('guards who Fell Back lost the fight: the paper doesn\'t call it a hold, even when the raiders got nothing', () => {
    const s = newGame(31);
    dawn(s, 3);
    quiet(s);
    const note = { day: s.day - 1, minute: 23 * 60, attacker: 'blenders' as const, defender: 'player' as const, target: LOTTIES_CORNER, loot: 0 };
    s.world!.fights = [{ ...note, outcome: 'repelled' }];
    expect(bugleHeadline(s)).toEqual(['RAID HELD!', `Blenders bounce off ${short(LOTTIES_CORNER)}`]);
    s.world!.fights = [{ ...note, outcome: 'repelled', fellBack: 'def' }]; // crew.ts playerWon: a side that Fell Back lost
    expect(bugleHeadline(s)).toEqual(['GUARDS FALL BACK', 'Blenders leave empty-handed']);
    s.world!.fights = [{ ...note, outcome: 'damaged', fellBack: 'def' }];
    expect(bugleHeadline(s)).toEqual(['GUARDS FALL BACK', `Blenders rattle ${short(LOTTIES_CORNER)}`]);
    s.world!.fights = [{ ...note, outcome: 'repelled', fellBack: 'def', sabotage: true }]; // a Sabotage they left to it, too
    expect(bugleHeadline(s)).toEqual(['GUARDS FALL BACK', 'Blenders leave empty-handed']);
  });

  it('a rival\'s new stands make the paper', () => {
    const s = newGame(32);
    dawn(s, 3);
    s.phase = 'report';
    const free = PLOTS.find((p) => p.type === 'street' && !s.plots[p.id].owner)!;
    const mine = s.plots[rivalPlot(s, 'fizzco')];
    s.plots[free.id] = { ...s.plots[free.id], owner: 'fizzco', stand: { ...mine.stand! } };
    dawn(s, 4);
    const paper = s.world!.paper!;
    paper.wire = [];
    paper.moves = paper.moves.filter((m) => m.rival === 'fizzco'); // FizzCo's alone (the others grow at dawn too)
    expect(paper.moves[0].gained).toContain(free.id);
    const n = paper.moves[0].gained.length;
    expect(bugleHeadline(s)).toEqual(n === 1 ? ['FIZZCO EXPAND', `New stand at ${short(free.id)}`] : ['FIZZCO EXPAND!', `${n} new stands`]);
  });

  it('every morning prints 2-3 briefs, quiet ones too, through real business days', () => {
    for (const seed of [2, 3]) {
      const s = newGame(seed);
      const counts: number[] = [];
      for (let d = 0; d < 45; d++) {
        s.cash = Math.max(s.cash, 1000);
        openStand(s);
        simulateRestOfDay(s);
        s.news = []; // the HUD shows the day's news as it comes (main.ts flushNews)
        if (!sleepUntilDawn(s)) throw new Error(`no dawn after day ${s.day}`);
        counts.push(frontPage(s).briefs.length);
      }
      expect(counts.filter((n) => n < 2 || n > 3)).toEqual([]);
    }
  }, 120_000); // 90 whole days: about 30 s alone, much longer while other checks share the machine

  it('a festival stays in the paper after its opening day: its day of how many, then its last day', () => {
    const s = newGame(37);
    dawn(s, 8); // the Summer Fair opens: Days 8-14 in Old Town
    expect(frontPage(s).events.find((e) => e.id === 'summerFair')).toMatchObject({ name: 'Summer Fair', where: 'Old Town', days: 7, left: 7, when: 'day 1 of 7' });
    dawn(s, 10);
    quiet(s);
    eventsOf(s).on = [];
    const p = frontPage(s);
    expect(p.events).toEqual([{ id: 'summerFair', name: 'Summer Fair', where: 'Old Town', days: 7, left: 5, when: 'day 3 of 7', counter: 'Families fill the street' }]);
    expect(p.briefs).toContain('Summer Fair, Old Town: day 3 of 7.');
    expect(bugleSheet(s)).toContain('Old Town, day 3 of 7');
    dawn(s, 14);
    quiet(s);
    eventsOf(s).on = [];
    expect(frontPage(s).events.find((e) => e.id === 'summerFair')?.when).toBe('last day');
    expect(frontPage(s).briefs).toContain('Summer Fair, Old Town: last day.');
  });

  it("other lanes' overnight lines print on the wire; one written the paper's way can lead", () => {
    const s = newGame(33);
    dawn(s, 3);
    s.news.push('Daytime gossip that missed the paper.'); // before closing: yesterday's news
    closeUp(s);
    s.news.push('OUT-OF-TOWNER! A food truck rolls into Downtown. Nobody knows who sent it.');
    s.news.push('Dot says the pie case is empty again.');
    s.news.push('Lottie: "Keep an eye on the ice."'); // Lottie's tips stay off the front page
    sleepUntilDawn(s);
    s.world!.paper!.moves = [];
    s.world!.fights = [];
    expect(s.world!.paper!.wire.filter((l) => !l.startsWith("Dex Moody joins"))).toEqual(['OUT-OF-TOWNER! A food truck rolls into Downtown. Nobody knows who sent it.', 'Dot says the pie case is empty again.']);
    expect(bugleHeadline(s)).toEqual(['OUT-OF-TOWNER!', 'A food truck rolls into Downtown']);
    expect(frontPage(s).briefs).toContain('Dot says the pie case is empty again.');
    expect(frontPage(s).briefs.join(' ')).not.toContain('Daytime gossip');
  });

  it("the paper doesn't quote itself, and a rival's scheme can lead it, over a rival's new stand", () => {
    const s = newGame(4);
    dawn(s, 10);
    besideRival(s, 'blenders');
    closeUp(s);
    expect(startScheme(s, 'blenders', 'priceWar')).toBeTruthy(); // after closing: on the morning wire
    sleepUntilDawn(s);
    const paper = s.world!.paper!;
    expect(paper.wire).toContain("Bugle: Price war! The Boardwalk Blenders cut prices near Lottie's. Answer: a Coupon Blitz or wait it out."); // as schemes.ts files it
    delete paper.rankUp;
    s.world!.fights = [];
    const fizz = rivalPlot(s, 'fizzco');
    paper.moves = [{ rival: 'fizzco', gained: [fizz], lost: [] }];
    expect(bugleHeadline(s)).toEqual(['PRICE WAR!', "The Boardwalk Blenders cut prices near Lottie's"]);
    expect(frontPage(s).briefs).toContain(`FizzCo Beverages open a stand at ${short(fizz)}.`);
    expect(frontPage(s).briefs.join(' ')).not.toContain('Bugle:');
    paper.moves = [];
    paper.wire = ["Bugle: Price war! Hollis Sweet Tea Co. cut prices near Lottie's. Answer: a Coupon Blitz or wait it out."];
    expect(bugleHeadline(s)).toEqual(['PRICE WAR!', "Hollis Sweet Tea Co. cut prices near Lottie's"]); // the small tape is its first sentence
    // An ad blitz and smear posters lead too; a scheme's end prints as a brief, in the paper's own words.
    paper.moves = [];
    paper.wire = ["Bugle: FizzCo's mascot blitzes Downtown: +25% appeal at its stands", 'Bugle: The Boardwalk Blenders call off their price war'];
    expect(bugleHeadline(s)).toEqual(['AD BLITZ!', "FizzCo's mascot blitzes Downtown"]);
    expect(frontPage(s).briefs).toContain('The Boardwalk Blenders call off their price war.');
    paper.wire = ["Bugle: Smear posters plaster Lottie's Corner"];
    expect(bugleHeadline(s)).toEqual(['SMEAR POSTERS!', "Lottie's Corner plastered"]);
  });

  it('the next Bugle reports the moves of the boss who phoned yesterday, as its first brief', () => {
    const s = newGame(34, { mode: 'sandbox' });
    dawn(s, 9);
    s.phone!.queue = [];
    phoneCall(s, 'blenders', LINES.brockFence);
    expect(takeCall(s)).toMatchObject({ who: 'blenders', text: LINES.brockFence }); // Brock rings the Corner on Day 9
    const lot = PLOTS.find((p) => p.type === 'street' && !s.plots[p.id].owner)!;
    s.plots[lot.id].owner = 'blenders'; // and grabs a plot after the call
    closeUp(s);
    s.news = []; // the HUD shows the day's news as it comes (main.ts flushNews)
    sleepUntilDawn(s);
    const brief = frontPage(s).briefs[0];
    expect(brief).toMatch(/^The Boardwalk Blenders grab \d+ plots? after the call\.$/);
    expect(s.news).toContain(`Bugle: ${brief}`); // the dawn's toast says the same
    s.news = [];
    closeUp(s);
    sleepUntilDawn(s);
    expect(frontPage(s).briefs.join(' ')).not.toContain('after the call'); // only the morning after the call
  });

  it('the Market against normal, any shock with its days left, and each stand\'s cost per cup', () => {
    const s = newGame(34, { lessons: false }); // the forecast and the Market print from their lesson (Day 2) on
    s.market = { lemons: 0.24, sugar: 0.027, ice: 0.0101 };
    expect(marketText(marketLines(s))).toBe('Lemons +20%, sugar −10%, ice flat');
    testEvent({ id: 'sourTimes', name: 'Sour Times', kind: 'harmful', days: 5, shock: 'lemons' });
    eventsOf(s).on.push({ id: 'sourTimes', from: s.day - 1, to: s.day + 3, live: true });
    expect(marketLines(s)[0].shock).toEqual({ name: 'Sour Times', left: 4 });
    const p = frontPage(s);
    expect(p.costs).toEqual(playerStands(s).map((q) => ({ plot: q.id, cost: costPerCup(s, s.plots[q.id].stand!) })));
    const sheet = bugleSheet(s);
    expect(sheet).toContain('Sour Times');
    expect(sheet).toContain('4 days');
    expect(sheet).toContain("Lottie's Corner, a cup");
  });

  it('the 2-day look-ahead comes with the Radio Jingle (M3), and sees a planned Heat Wave', () => {
    HEAT_WAVE.chance.summer = 1;
    const s = newGame(35);
    dawn(s, 2);
    const wave = eventsOf(s).on.find((e) => e.id === 'heatWave')!;
    dawn(s, wave.from - 1);
    expect(lookAhead(s)).toEqual([]);
    expect(frontPage(s).ahead).toEqual([]);
    s.brandTier = BRAND_TIERS[2].tier;
    const ahead = lookAhead(s);
    expect(ahead.map((a) => a.day)).toEqual([s.day + 1, s.day + 2]);
    expect(ahead[0].text).toMatch(/^Heat Wave! Scorcher, \d+°$/);
    expect(bugleSheet(s)).toContain(`Day ${s.day + 1}: Heat Wave!`);
    // ... and the paper prints the wave the morning it starts, with its length and counter-play.
    dawn(s, wave.from);
    expect(liveEvent(s, 'heatWave')).toBeTruthy();
    const e = frontPage(s).events.find((x) => x.id === 'heatWave')!;
    expect(e).toMatchObject({ name: 'Heat Wave', where: 'all over the bay', days: 3, left: 3, counter: 'Extra ice, higher prices, Frozen' });
    dawn(s, wave.from + 1);
    quiet(s); // only the wave's story: the rival moves and the wire would crowd the 3 briefs
    expect(frontPage(s).events.find((x) => x.id === 'heatWave')?.left).toBe(2);
    expect(frontPage(s).briefs.join(' ')).toContain('Heat Wave, all over the bay: 2 days left.');
  });

  it('the °C option prints the weather, the look-ahead and the briefs in °C', () => {
    const s = newGame(35, { lessons: false });
    s.brandTier = BRAND_TIERS[2].tier;
    s.forecast = { kind: 'scorcher', temp: 97 };
    eventsOf(s).on.push({ id: 'heatWave', from: s.day + 1, to: s.day + 3 }); // a planned Heat Wave: the look-ahead knows its degrees
    expect(bugleSheet(s)).toContain('Scorcher, 97°<');
    const c = bugleSheet(s, true);
    expect(c).toContain('Scorcher, 36°C<');
    expect(c).toMatch(/Day \d+: [^<]*\d+°C</);
    expect(c).not.toMatch(/\d°(?!C)/);
  });

  it("a mid-day event stays out of the morning paper; the Bugle tab prints the front page and the week's calendar", () => {
    testEvent({ id: 'flashMob', name: 'Flash Mob', when: 'midday', days: 1 });
    const s = newGame(36);
    dawn(s, 3);
    eventsOf(s).on.push({ id: 'flashMob', from: s.day, to: s.day, at: 13 * 60 });
    expect(frontPage(s).events.map((e) => e.id)).not.toContain('flashMob');
    expect(worldTabs(s, 'today')).toContain('data-testid="tab-bugle"');
    const sheet = bugleSheet(s);
    for (const id of ['bugle-headline', 'bugle-brief', 'bugle-weather', 'bugle-market', 'calendar']) expect(sheet).toContain(`data-testid="${id}"`);
    expect(sheet).toContain('Days 4-6: Surf Contest, The Boardwalk');
    expect(calendarTickets(s).join('')).not.toContain('data-testid="calendar"'); // the week's calendar moved into the paper
  });
});
