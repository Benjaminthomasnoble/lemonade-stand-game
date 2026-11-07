import { describe, expect, it } from 'vitest';
import {
  airedToday, BRAND_TIERS, bugleNews, callFight, CLOSE, eventsOf, FACTIONS, JINGLE, LOTTIES_CORNER, morningShow, newGame, onAir, OPEN, openStand,
  PLOT_BY_ID, PLOTS, RADIO_STAND_LEVEL, radioOn, radioToday, sayNumber, SIGN_OFF, simulateRestOfDay, STATION_IDS, tickMinute, weatherTalk,
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

describe('101.5 The Squeeze', () => {
  it('Cal says the numbers and the weather (the spec\'s Scorcher at 97)', () => {
    expect([7, 19, 60, 97, 102, 215].map(sayNumber)).toEqual(['seven', 'nineteen', 'sixty', 'ninety-seven', 'a hundred and two', 'two hundred and fifteen']);
    expect(weatherTalk({ kind: 'scorcher', temp: 97 })).toBe('Ninety-seven on the Boardwalk, and the Smoothie Bros are jogging in formation. Lock up your sugar, Maple Row.');
    expect(weatherTalk({ kind: 'storm', temp: 58 })).toContain('fifty-eight degrees');
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
    for (let d = 1; d <= RIVALS.length; d++) {
      s.day = d;
      at(s, 11 * 60);
      sponsors.add(airedToday(s).find((l) => l.kind === 'ad')!.text);
    }
    for (const r of RIVALS) expect([...sponsors].some((t) => t.includes(FACTIONS[r].name))).toBe(true);
    s.rivals.fizzco.alive = false;
    for (let d = 1; d <= 10; d++) { s.day = d; expect(airedToday(at(s, 11 * 60)).find((l) => l.kind === 'ad')!.text).not.toContain(FACTIONS.fizzco.name); }
    const target = rivalPlot(s, 'coldbrew');
    const note = (attacker: FightNote['attacker'], defender: FightNote['defender'], outcome: FightNote['outcome']): FightNote => ({ day: s.day, minute: OPEN, attacker, defender, target, outcome, loot: 120 });
    const at2 = PLOT_BY_ID[target].name.replace(/ lot /, ' ');
    expect(callFight(note('blenders', 'coldbrew', 'smashed'))).toBe(`The Smoothie Bros come over the fence at ${at2}... and down goes the stand! What a night for the Blenders!`);
    expect(callFight(note('player', 'coldbrew', 'robbed'))).toBe(`Lottie's crew hit the till at ${at2} and run off with $120! What a grab by Lottie's!`);
    expect(callFight(note('coldbrew', 'player', 'repelled'))).toBe(`The Baristas charge ${at2}... and bounce right off! What a stand by Lottie's!`);
    expect(callFight(note('sourwood', 'hollis', 'damaged'))).toBe(`The Stewards rattle ${at2} and leave empty-handed! Close one for Hollis Sweet Tea!`);
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

  it('the HUD ticket carries the morning show and turns through it in place; All day keeps it on', () => {
    const s = newGame(38);
    const card = radioTicket(s);
    expect(card).toContain('data-testid="radio"');
    expect(card).toContain(`data-testid="radio-line">${STATION_IDS[s.day % 3]}<`);
    expect(card).toContain('data-show="');
    expect(card).toContain('data-action="radio"');
    expect(radioTicket(s, false)).toBe(''); // the captions seam
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
