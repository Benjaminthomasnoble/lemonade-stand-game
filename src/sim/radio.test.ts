import { describe, expect, it } from 'vitest';
import {
  AD_BLITZ, airedToday, BANKRUPT_DAYS, blitzingToday, BRAND_TIERS, budgetOf, factionBuyout, nearbyPlots, newStand, ownedPlots, schemesAtDawn, startScheme, RIVAL_JINGLES, sleepUntilDawn, bugleNews, callFight, CLOSE, eventsOf, FACTIONS, inCelsius, JINGLE, LOTTIES_CORNER, morningShow, newGame, onAir, OPEN, openStand,
  PLOT_BY_ID, PLOTS, RADIO_STAND_LEVEL, radioOn, radioToday, sayNumber, SIGN_OFF, simulateRestOfDay, STATION_IDS, tickMinute, toCelsius, weatherTalk,
  type FightNote, type GameState, type RivalId, type TasteOffResult,
} from './economy.ts';
import { RADIO_LINE_MS, radioTicket, soundtrack, toggleSoundtrack, tuneRadio } from '../ui/radio.ts';

const RIVALS = Object.keys(FACTIONS) as RivalId[];
const rivalPlot = (s: GameState, r: RivalId) => PLOTS.find((p) => s.plots[p.id].owner === r && s.plots[p.id].stand)!.id;
/** The clock on a business day, at a minute. */
function at(s: GameState, minute: number): GameState {
  s.phase = minute >= CLOSE ? (minute > CLOSE ? 'night' : 'report') : 'open';
  s.minute = minute;
  return s;
}

/** Day 10 at Rank 3, with a stand of yours next to one of FizzCo's: where its ad blitz would send the mascot. */
function fizzcoNextDoor(seed: number): GameState {
  const s = newGame(seed);
  s.day = 10;
  s.rank = 3;
  const street = (p: (typeof PLOTS)[number]) =>
    nearbyPlots(p).find((x) => x.id !== p.id && (x.type === 'street' || x.type === 'prime') && s.plots[x.id].owner !== 'fizzco');
  const theirs = PLOTS.find((p) => s.plots[p.id].owner === 'fizzco' && s.plots[p.id].stand && p.type !== 'hq' && street(p))!;
  const mine = street(theirs)!;
  s.plots[mine.id] = { ...s.plots[mine.id], owner: 'player', stand: newStand(1, 1) };
  return s;
}

describe('101.5 The Squeeze', () => {
  it('Cal says the numbers and the weather (the spec\'s Scorcher at 97)', () => {
    expect([7, 19, 60, 97, 102, 215].map(sayNumber)).toEqual(['seven', 'nineteen', 'sixty', 'ninety-seven', 'a hundred and two', 'two hundred and fifteen']);
    expect(weatherTalk({ kind: 'scorcher', temp: 97 })).toBe('Ninety-seven on the Boardwalk, and the Smoothie Bros are jogging in formation. Lock up your sugar, Maple Row.');
    expect(weatherTalk({ kind: 'storm', temp: 58 })).toContain('fifty-eight degrees');
  });

  it("the °C option: Cal says the Celsius numbers, and the paper's degrees on the air read °C", () => {
    expect(toCelsius(97)).toBe(36);
    expect(weatherTalk({ kind: 'scorcher', temp: 97 }, true)).toMatch(/^Thirty-six on the Boardwalk/);
    expect(weatherTalk({ kind: 'storm', temp: 58 }, true)).toContain('fourteen degrees');
    expect(inCelsius('Heat Wave! Scorcher, 97°', true)).toBe('Heat Wave! Scorcher, 36°C');
    expect(inCelsius('Scorcher, 97° today.', false)).toBe('Scorcher, 97° today.');
    expect(inCelsius('Feels like 41°F', true)).toBe('Feels like 41°F'); // already marked: left as it is
    const s = newGame(31);
    s.brandTier = BRAND_TIERS[2].tier; // the Jingle, and Cal's two-day after it
    s.forecast = { kind: 'scorcher', temp: 97 };
    eventsOf(s).on.push({ id: 'heatWave', from: s.day + 1, to: s.day + 3 }); // a planned Heat Wave: the look-ahead knows its degrees
    const show = morningShow(s, true);
    expect(show.some((l) => l.text === weatherTalk(s.forecast, true))).toBe(true);
    expect(show.find((l) => l.kind === 'forecast')!.text).toMatch(/\d+°C/);
    expect(show.map((l) => l.text).join(' ')).not.toMatch(/\d°(?!C)/);
    expect(morningShow(s).map((l) => l.text).join(' ')).toMatch(/\d°(?!C)/); // °F by default
    expect(radioTicket(s, true, true)).toContain('°C');
    openStand(s);
    simulateRestOfDay(s);
    expect(airedToday(s, true).map((l) => l.text).join(' ')).not.toMatch(/\d°(?!C)/);
  });

  it("the Morning Prep show reads the Bugle's headline and briefs, the weather, and signs off; the Jingle adds the spot and the two-day", () => {
    const s = newGame(31);
    const show = morningShow(s);
    const paper = bugleNews(s);
    expect(STATION_IDS).toContain(show[0].text);
    expect(show[1].text).toContain(paper.headline[0]);
    for (const b of paper.briefs) expect(show.some((l) => l.text.startsWith('Also in the paper: ') && l.text.includes(b.replace(/\.$/, '')))).toBe(true);
    expect(show.some((l) => l.text === weatherTalk(s.forecast))).toBe(true);
    expect(show.at(-1)!.text).toBe(SIGN_OFF);
    expect(show.some((l) => l.kind === 'jingle' || l.kind === 'forecast')).toBe(false);
    s.brandTier = BRAND_TIERS[2].tier; // the Radio Jingle
    const m3 = morningShow(s);
    const j = m3.findIndex((l) => l.kind === 'jingle');
    expect(m3[j].text).toBe(JINGLE);
    expect(JINGLE.endsWith('Get Lottie\'s!"')).toBe(true);
    expect(m3[j + 1].kind).toBe('forecast');
    expect(m3[j + 1].text).toMatch(/^Cal's two-day: tomorrow, .+; the day after, .+\.$/);
    expect(radioToday(s)).toEqual(m3); // Morning Prep: the show is all that's on
    expect(airedToday(s)).toEqual([]);
  });

  it('about one line a game hour through business hours, the Jingle again at 12:00, and the sign-off at closing', () => {
    const s = newGame(32);
    s.brandTier = BRAND_TIERS[2].tier;
    openStand(s);
    expect(onAir(s)!.text).toContain('The stands are open, Citrine Bay.');
    simulateRestOfDay(s);
    const day = airedToday(s);
    for (let h = 0; h < 12; h++) expect(day.some((l) => l.minute === OPEN + h * 60)).toBe(true);
    expect(day.filter((l) => l.minute % 60 === 0 && l.minute < CLOSE).length).toBeLessThanOrEqual(13);
    const noon = day.findIndex((l) => l.kind === 'jingle');
    expect(day[noon].minute).toBe(12 * 60);
    expect(day[noon + 1].kind).toBe('forecast');
    expect(day.some((l) => l.text.startsWith('At the Market today: Lemons '))).toBe(true);
    expect(day.map((l) => l.minute)).toEqual([...day.map((l) => l.minute)].sort((a, b) => a - b));
    at(s, CLOSE + 1);
    expect(onAir(s)!.text).toBe(`That's the day, folks. ${SIGN_OFF}`);
  });

  it('takes every faction\'s ad money, round the rivals still in business, and never takes sides in a fight', () => {
    const s = newGame(33);
    const sponsors = new Set<string>();
    const inBusiness = RIVALS.filter((r) => s.rivals[r].alive); // Endless Summer's Out-of-Towner is out of town
    for (let d = 1; d <= inBusiness.length; d++) {
      s.day = d;
      at(s, 11 * 60);
      sponsors.add(airedToday(s).find((l) => l.kind === 'ad')!.text);
    }
    for (const r of inBusiness) expect([...sponsors].some((t) => t.includes(FACTIONS[r].name))).toBe(true);
    s.rivals.fizzco.alive = false;
    for (let d = 1; d <= 10; d++) { s.day = d; expect(airedToday(at(s, 11 * 60)).find((l) => l.kind === 'ad')!.text).not.toContain(FACTIONS.fizzco.name); }
    const target = rivalPlot(s, 'coldbrew');
    const note = (attacker: FightNote['attacker'], defender: FightNote['defender'], outcome: FightNote['outcome']): FightNote => ({ day: s.day, minute: OPEN, attacker, defender, target, outcome, loot: 120 });
    const at2 = PLOT_BY_ID[target].name.replace(/ lot /, ' ');
    expect(callFight(note('blenders', 'coldbrew', 'smashed'))).toBe(`The Smoothie Bros come over the fence at ${at2}... and down goes the stand! What a night for the Blenders!`);
    expect(callFight(note('player', 'coldbrew', 'robbed'))).toBe(`The Peel Patrol hit the till at ${at2} and run off with $120! What a grab by Lottie's!`); // your crew, by name
    expect(callFight(note('coldbrew', 'player', 'repelled'))).toBe(`The Baristas charge ${at2}... and bounce right off! What a stand by Lottie's!`);
    expect(callFight(note('sourwood', 'hollis', 'damaged'))).toBe(`The Stewards rattle ${at2} and leave empty-handed! Close one for Hollis Sweet Tea!`);
    // A Sabotage goes for the stock, never the till.
    const sabotage = (attacker: FightNote['attacker'], defender: FightNote['defender'], outcome: FightNote['outcome']): FightNote => ({ ...note(attacker, defender, outcome), loot: 0, sabotage: true });
    expect(callFight(sabotage('player', 'coldbrew', 'robbed'))).toBe(`The Peel Patrol slip into ${at2} and spoil the stock! What a night for Lottie's!`);
    expect(callFight(sabotage('coldbrew', 'player', 'damaged'))).toBe(`The Baristas sneak into ${at2} but run out of time! Close one for Lottie's!`);
    expect(callFight(sabotage('coldbrew', 'player', 'repelled'))).toBe(`The Baristas creep up on ${at2}... and get caught! Sabotage foiled by Lottie's!`);
    // Your guards Fell Back: the raiders won it, even with nothing to show for it (crew.ts playerWon).
    expect(callFight({ ...note('coldbrew', 'player', 'repelled'), fellBack: 'def' })).toBe(`The Peel Patrol fall back from ${at2}! The Baristas win it, but go home empty-handed!`);
  });

  it('calls the fights as they happen, rival-vs-rival included, recaps last night at 13:00, and breaks in with mid-day events', () => {
    const s = newGame(34);
    const target = rivalPlot(s, 'coldbrew');
    s.world!.fights = [
      { day: s.day, minute: 14 * 60 + 20, attacker: 'blenders', defender: 'coldbrew', target, outcome: 'repelled', loot: 0 },
      { day: s.day - 1, minute: 23 * 60, attacker: 'fizzco', defender: 'hollis', target, outcome: 'robbed', loot: 300 },
    ];
    s.world!.breaks = [{ day: s.day, minute: 13 * 60 + 40, text: 'VIRAL VIDEO! A clip goes viral.' }];
    at(s, 13 * 60);
    expect(onAir(s)!.text).toBe(`Last night on the scoreboard: ${callFight(s.world!.fights[1])}`);
    at(s, 13 * 60 + 40);
    expect(onAir(s)!.text).toBe('Breaking on 101.5: VIRAL VIDEO! A clip goes viral.');
    at(s, 14 * 60 + 20);
    expect(onAir(s)!.text).toBe(callFight(s.world!.fights[0]));
    at(s, 23 * 60);
    s.world!.fights.unshift({ day: s.day, minute: 22 * 60, attacker: 'player', defender: 'blenders', target, outcome: 'smashed', loot: 0 });
    expect(onAir(s)!.text).toBe(callFight(s.world!.fights[0])); // the night's fights, live
  });

  it("Act 1: the evening Lottie's takes the Strawberry page, Brock swears revenge live", () => {
    const s = newGame(35);
    const win = { fair: 'summerFair', day: s.day, district: 'oldtown', winner: 'player', vs: ['blenders'], stake: 'strawberry', score: 3, best: 2, marks: [], entry: {} } as unknown as TasteOffResult;
    s.world!.fairs.push(win);
    at(s, CLOSE);
    expect(onAir(s)!.kind).toBe('live');
    expect(onAir(s)!.text).toContain('Brock Bodine swears revenge: "This isn\'t over, bro!');
    win.winner = 'blenders';
    expect(airedToday(s).some((l) => l.kind === 'live')).toBe(false);
  });

  it("Kids' Lemonade Day makes the 15:00 gossip", () => {
    const s = newGame(36);
    eventsOf(s).on.push({ id: 'kidsDay', from: s.day, to: s.day, live: true, kids: [LOTTIES_CORNER], took: 12 });
    at(s, 15 * 60);
    expect(onAir(s)!.text).toContain("the kid stands have taken 12 of Lottie's customers");
    eventsOf(s).on[eventsOf(s).on.length - 1].raided = [LOTTIES_CORNER];
    expect(onAir(s)!.text).toContain("took a seven-year-old's pitcher");
  });

  it('plays in Morning Prep, from your L3+ stands while they are open, and all day as the soundtrack', () => {
    const s = newGame(37);
    expect(radioOn(s, false)).toBe(true); // Morning Prep
    openStand(s);
    expect(radioOn(s, false)).toBe(false); // a Folding Table has no radio
    s.plots[LOTTIES_CORNER].stand!.level = RADIO_STAND_LEVEL;
    expect(radioOn(s, false)).toBe(true);
    s.plots[LOTTIES_CORNER].stand!.wrecked = true;
    expect(radioOn(s, false)).toBe(false);
    expect(radioOn(s, true)).toBe(true);
    s.plots[LOTTIES_CORNER].stand!.wrecked = false;
    while (s.phase === 'open') tickMinute(s);
    expect(radioOn(s, false)).toBe(false); // the evening: the soundtrack only
    expect(radioOn(s, true)).toBe(true);
  });

  it("a rival's marketing blitz opens the morning show with its jingle; an eliminated rival's retires with a second of silence", () => {
    expect(Object.keys(RIVAL_JINGLES).sort()).toEqual([...RIVALS].sort());
    const s = newGame(39);
    const show = () => morningShow(s).map((l) => l.text);
    /** These rivals' blitzes run today, as their schemes start them at dawn. */
    const blitz = (...by: RivalId[]) => {
      s.schemes = by.map((r) => ({ kind: 'blitz' as const, by: r, day: s.day, until: s.day + AD_BLITZ.days - 1, plots: [] }));
    };
    expect(morningShow(s)[0].kind).toBe('id'); // no blitz: the station ID opens
    blitz('fizzco');
    expect(morningShow(s)[0]).toEqual({ minute: OPEN - 1, kind: 'rival', text: 'FizzCo Beverages\' jingle: "Bubbles mean business!"' });
    expect(morningShow(s)[1].kind).toBe('id');
    s.schemes![0].done = true; // over: no jingle
    expect(morningShow(s)[0].kind).toBe('id');
    blitz('blenders', 'sourwood');
    expect(show().slice(0, 2)).toEqual([
      'The Sourwood Family\'s jingle: "Some families are simply better."',
      'The Boardwalk Blenders\' jingle: "Smoothies so big they need a lifeguard!"',
    ]);
    // Lottie buys the Blenders out at this Morning Prep, with today's show already on the air (the HUD ticket has it): the
    // silence opens tomorrow's show, once, and their jingle never plays again.
    const silence = "[One second of silence: The Boardwalk Blenders' jingle is off the air for good.]";
    const onTicket = () => {
      const raw = /data-show="([^"]*)"/.exec(radioTicket(s))?.[1] ?? '[]';
      return JSON.parse(raw.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&amp;/g, '&')) as string[];
    };
    expect(onTicket().join(' ')).toContain('lifeguard');
    s.rank = 7;
    s.cash = 50_000_000;
    for (const p of ownedPlots(s, 'blenders').filter((x) => x.type !== 'hq').slice(1)) s.plots[p.id] = { ...s.plots[p.id], owner: null, stand: null }; // Weakened
    expect(s.phase).toBe('prep');
    expect(factionBuyout(s, 'blenders')).toBe(true);
    expect(morningShow(s).some((l) => l.kind === 'silence')).toBe(false); // today's has aired its top
    openStand(s);
    simulateRestOfDay(s);
    const sleep = () => { s.raids = []; s.cash = Math.max(s.cash, 1000); if (!sleepUntilDawn(s)) throw new Error('no dawn'); };
    sleep();
    blitz('blenders', 'sourwood'); // a blitz of theirs still on the books plays no jingle
    expect(morningShow(s)[0]).toMatchObject({ kind: 'silence', text: silence });
    expect(morningShow(s).filter((l) => l.kind === 'silence')).toHaveLength(1);
    expect(show()[1]).toBe('The Sourwood Family\'s jingle: "Some families are simply better."');
    expect(show().join(' ')).not.toContain('lifeguard');
    expect(onTicket().filter((l) => l === silence)).toHaveLength(1); // the HUD ticket opens with it too
    expect(onTicket()[0]).toBe(silence);
    expect(radioTicket(s)).toContain(`data-testid="radio-line">${silence}<`);
    s.phase = 'report';
    sleep();
    expect(morningShow(s).some((l) => l.kind === 'silence')).toBe(false);
    expect(onTicket()).not.toContain(silence);
    // Gone bust at dawn, before the show airs: the silence opens that morning's show.
    blitz();
    s.rivals.coldbrew.cash = -1e9;
    s.rivals.coldbrew.brokeDays = BANKRUPT_DAYS - 1;
    s.phase = 'report';
    sleep();
    expect(s.rivals.coldbrew.alive).toBe(false);
    expect(show()[0]).toBe("[One second of silence: The Cold Brew Collective's jingle is off the air for good.]");
  });

  it("FizzCo's ad blitz opens each of its mornings with FizzCo's jingle, until the mascot goes home", () => {
    const fizz = { kind: 'rival', text: 'FizzCo Beverages\' jingle: "Bubbles mean business!"' };
    const s = fizzcoNextDoor(80);
    expect(blitzingToday(s)).toEqual([]);
    const job = startScheme(s, 'fizzco', 'blitz')!; // its Hostile Takeover starts one at dawn, before the show airs
    expect(job).toMatchObject({ kind: 'blitz', by: 'fizzco', day: 10, until: 10 + AD_BLITZ.days - 1 });
    for (const r of RIVALS) s.rivals[r].truceUntil = 999; // nobody starts anything else
    expect(morningShow(s)[0]).toMatchObject(fizz);
    for (const day of [11, 12]) {
      s.day = day;
      schemesAtDawn(s); // Strike pays for another day's walk
      expect(morningShow(s)[0]).toMatchObject(fizz);
    }
    s.day = 13;
    schemesAtDawn(s);
    expect(job.done).toBe(true);
    expect(morningShow(s)[0].kind).toBe('id'); // its days are up: the station ID opens again
    // Strike runs dry: the mascot goes home early, and that morning's show has no jingle.
    const t = fizzcoNextDoor(81);
    startScheme(t, 'fizzco', 'blitz');
    for (const r of RIVALS) t.rivals[r].truceUntil = 999;
    budgetOf(t, 'fizzco').strike = AD_BLITZ.perDay - 1;
    t.day = 11;
    schemesAtDawn(t);
    expect(blitzingToday(t)).toEqual([]);
    expect(morningShow(t)[0].kind).toBe('id');
  });

  it('the HUD ticket carries the morning show and turns through it in place; All day keeps it on', () => {
    const s = newGame(38);
    const card = radioTicket(s);
    expect(card).toContain('data-testid="radio"');
    expect(card).toContain(`data-testid="radio-line">${STATION_IDS[s.day % 3]}<`);
    expect(card).toContain('data-show="');
    expect(card).toContain('data-action="radio"');
    expect(radioTicket(s, false)).toBe(''); // Captions off: the radio is text only
    const line = { textContent: '' };
    const show = morningShow(s).map((l) => l.text);
    const ticket = { dataset: { show: JSON.stringify(show) }, querySelector: () => line };
    const feed = { querySelector: () => ticket } as unknown as HTMLElement;
    tuneRadio(feed, 0);
    expect(line.textContent).toBe(show[0]);
    tuneRadio(feed, RADIO_LINE_MS * 2 + 10);
    expect(line.textContent).toBe(show[2]);
    tuneRadio(feed, RADIO_LINE_MS * show.length);
    expect(line.textContent).toBe(show[0]); // round again
    openStand(s);
    expect(radioTicket(s)).toBe(''); // no L3+ stand, no soundtrack
    expect(soundtrack()).toBe(false);
    toggleSoundtrack();
    expect(radioTicket(s)).toContain('The stands are open, Citrine Bay.');
    expect(radioTicket(s)).not.toContain('data-show');
    toggleSoundtrack();
    expect(soundtrack()).toBe(false);
  });
});
