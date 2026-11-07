import { afterEach, describe, expect, it } from 'vitest';
import {
  BRAND_TIERS, bugleHeadline, CLOSE, costPerCup, EVENT_DEFS, eventsOf, fightRaid, frontPage, grantPage, HEAT_WAVE, liveEvent, LOTTIES_CORNER, lookAhead,
  marketLines, marketText, newGame, openStand, PLOT_BY_ID, PLOTS, playerStands, raidPartyFor, RANKS, registerEvent, sleepUntilDawn, tickMinute, weatherText,
  type EventDef, type GameState, type RivalId,
} from './economy.ts';
import { bugleSheet } from '../ui/bugle.ts';
import { calendarTickets, worldTabs } from '../ui/calendar.ts';

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
    expect(bugleHeadline(s)).toEqual(['RANK UP!', `Grandkid now a ${RANKS[1].title}`]);
    expect(frontPage(s).briefs.length).toBeGreaterThanOrEqual(2);

    // A page coming home is a story beat: it leads over both.
    s.phase = 'report';
    raid(s, 'blenders', LOTTIES_CORNER);
    s.rank = 3;
    grantPage(s, 'honeyGinger');
    dawn(s, 6);
    calm(s);
    expect(bugleHeadline(s)).toEqual(['PAGE COMES HOME!', 'Honey-Ginger Hot Lemonade back in the book']);
    expect(frontPage(s).briefs[0]).toBe(`Lottie's grandkid is now a ${RANKS[2].title}.`);

    // The morning a new act begins (story.ts), its banner leads over every other story; the page drops to a brief.
    s.story!.act = 2;
    s.story!.banner = s.day;
    expect(bugleHeadline(s)).toEqual(['ACT 2!', 'Surf & Turf']);
    expect(frontPage(s).briefs).toContain("Honey-Ginger Hot Lemonade is back in Lottie's book.");
  });

  it('a rival\'s new stands make the paper; a quiet morning still prints 2-3 briefs', () => {
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
    for (let d = 5; d <= 40; d++) {
      dawn(s, d);
      const n = frontPage(s).briefs.length;
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(3);
    }
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
    expect(s.world!.paper!.wire).toEqual(['OUT-OF-TOWNER! A food truck rolls into Downtown. Nobody knows who sent it.', 'Dot says the pie case is empty again.']);
    expect(bugleHeadline(s)).toEqual(['OUT-OF-TOWNER!', 'A food truck rolls into Downtown']);
    expect(frontPage(s).briefs).toContain('Dot says the pie case is empty again.');
    expect(frontPage(s).briefs.join(' ')).not.toContain('Daytime gossip');
  });

  it('the Market against normal, any shock with its days left, and each stand\'s cost per cup', () => {
    const s = newGame(34);
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
    const s = newGame(35);
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
