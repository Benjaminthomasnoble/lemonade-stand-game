// 101.5 The Squeeze (spec: Music and sound, "101.5 The Squeeze"; Narrative, "How the story is told": about 1 DJ line per
// game hour). DJ Cal Clementine reads the Bugle's headline and briefs in the Morning Prep show, gives the weather, calls
// every fight like a ball game (rival-vs-rival too) and breaks in when a mid-day event hits. He takes every faction's ad
// money, never takes sides, and signs off "Stay sweet, Citrine Bay." With the Radio Jingle (M3), Benny Buzz's spot ending
// "Get Lottie's!" airs in every Morning Prep show and again at 12:00, followed by Cal's 2-day forecast. In Act 1, Brock
// swears revenge live on air the evening Lottie's takes his Strawberry page. It plays in Morning Prep, from the radio on
// your L3+ stands while they're open, and all day as the optional soundtrack. During a rival's marketing blitz its jingle
// opens the morning show, so the radio tips you off; an eliminated rival's jingle retires with one second of on-air
// silence at the top of the next morning show. Text-first: the HUD prints the lines (the voices, the jingles' leitmotifs,
// the three-note chime and the second of dead air are the audio thread's). The show is read off the state and nothing
// draws from the seed; the one thing saved is when each rival's jingle retired (retireJingle, from eliminate()).
import { BRAND_TIERS, CLOSE, FACTIONS, OPEN, RADIO_STAND_LEVEL, type RivalId, type WeatherKind } from './balance.ts';
import { PLOT_BY_ID, type FactionId } from './map.ts';
import type { GameState, Weather } from './economy.ts';
import { playerStands, runningSchemes } from './economy.ts';
import { storyFairs, tasteOffResult } from './calendar.ts';
import { bugleNews, lookAhead, marketLines, marketText, type FightNote } from './media.ts';
import { kidsDay } from './happenings.ts';
import { worldOf } from './recipes.ts';
import { CREW_NAME, crewName } from './grandkid.ts';

/** jingle: Lottie's spot; rival: a rival's jingle (a blitz); silence: the second of dead air for a retired rival's jingle. */
export type RadioKind = 'id' | 'news' | 'weather' | 'jingle' | 'forecast' | 'ad' | 'gossip' | 'fight' | 'break' | 'live' | 'signoff'
  | 'rival' | 'silence';
/** A line on air: the minute it airs (the Morning Prep show goes out just before opening), what it is, and the words. */
export interface RadioLine { minute: number; kind: RadioKind; text: string }

/** The station IDs, each on a three-note chime (spec). */
export const STATION_IDS = ['All killer, no pulp.', "You're squeezed in with Cal Clementine.", 'Fresh-pressed hits, every morning.'];
/** Cal's sign-off (spec). */
export const SIGN_OFF = 'Stay sweet, Citrine Bay.';
/** Benny Buzz's 10-second spot on the theme's first two bars, ending "Get Lottie's!" (spec). placeholder: spec gap (the words before it) */
export const JINGLE = 'Benny Buzz\'s spot: "Sunshine in a cup, on a corner near you. Get Lottie\'s!"';
/** Each rival's jingle tag, sung in its leitmotif style (spec). */
export const RIVAL_JINGLES: Record<RivalId, string> = {
  sourwood: 'Some families are simply better.',
  hollis: 'Brewed slow, stirred with a ladle!',
  fizzco: 'Bubbles mean business!',
  coldbrew: "You probably haven't heard of us.",
  blenders: 'Smoothies so big they need a lifeguard!',
  snootwater: 'Water, but make it expensive.',
};

const RIVALS = Object.keys(FACTIONS) as RivalId[];
const TEAM: Record<RivalId, string> = { sourwood: 'the Sourwoods', hollis: 'Hollis Sweet Tea', fizzco: 'FizzCo', coldbrew: 'Cold Brew', blenders: 'the Blenders', snootwater: 'Snootwater Springs' };
const team = (f: FactionId) => (f === 'player' ? "Lottie's" : TEAM[f as RivalId]);
const crew = (f: FactionId, us: string) => (f === 'player' ? us : `the ${FACTIONS[f as RivalId].henchmen}`);
const place = (plotId: string) => PLOT_BY_ID[plotId].name.replace(/ lot /, ' ');
const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const end = (t: string) => (/[.!?]["']?$/.test(t) ? t : `${t}.`);
/** The Radio Jingle (M3) is on the air. */
const jingleOn = (s: GameState) => s.brandTier >= BRAND_TIERS[2].tier;
const whose = (r: RivalId) => (FACTIONS[r].name.endsWith('s') ? `${FACTIONS[r].name}'` : `${FACTIONS[r].name}'s`);

// ---------- the rivals' jingles ----------

/** The rivals on a marketing blitz today, still in business: FizzCo's ad blitz (its Hostile Takeover, schemes.ts), or any
 * rival's scheme of that kind. A blitz starts and pays for its day at dawn, so the Morning Prep show already knows. */
export function blitzingToday(s: GameState): RivalId[] {
  const on = new Set(runningSchemes(s).filter((x) => x.kind === 'blitz').map((x) => x.by));
  return RIVALS.filter((r) => on.has(r) && s.rivals[r]?.alive);
}

/** eliminate(), on every route: the rival's jingle retires, and the next morning show still to air opens with a second of
 * silence for it. Gone bust: settled at dawn, before the show, so today's. Bought out or HQ taken: those are Morning Prep
 * moves, made while today's show is on the air, so tomorrow's. */
export function retireJingle(s: GameState, rival: RivalId, how: 'buyout' | 'hq' | 'bankrupt'): void {
  (worldOf(s).jinglesOff ??= {})[rival] = how === 'bankrupt' ? s.day : s.day + 1;
}

/** The top of the morning show: a second of silence for each jingle retired since the last show, then the jingle of each
 * rival on a blitz. */
function openers(s: GameState, line: (kind: RadioKind, text: string) => RadioLine): RadioLine[] {
  const off = s.world?.jinglesOff ?? {};
  return [
    ...RIVALS.filter((r) => off[r] === s.day).map((r) => line('silence', `[One second of silence: ${whose(r)} jingle is off the air for good.]`)),
    ...blitzingToday(s).map((r) => line('rival', `${whose(r)} jingle: "${RIVAL_JINGLES[r]}"`)),
  ];
}

// ---------- how Cal says things ----------

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen',
  'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
/** A number as Cal says it: "ninety-seven", "a hundred and two". */
export function sayNumber(n: number): string {
  n = Math.round(n);
  if (n < 0) return `minus ${sayNumber(-n)}`;
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : '');
  if (n < 1000) return `${n < 200 ? 'a' : ONES[Math.floor(n / 100)]} hundred${n % 100 ? ` and ${sayNumber(n % 100)}` : ''}`;
  return n.toLocaleString('en-US');
}

const WEATHER_TALK: Record<WeatherKind, (t: string) => string> = {
  scorcher: (t) => `${cap(t)} on the Boardwalk, and the Smoothie Bros are jogging in formation. Lock up your sugar, Maple Row.`,
  hot: (t) => `${cap(t)} and climbing. Keep those coolers full, Citrine Bay.`,
  warm: (t) => `${cap(t)} and sunny. Lemonade weather, sweet tea weather, soda weather: Cal plays no favorites.`,
  cloudy: (t) => `Gray skies and ${t} degrees. Bring a sweater and a thermos, folks.`,
  rainy: (t) => `Rain on the bay, ${t} degrees. Keep your sugar dry out there.`,
  storm: (t) => `Storm rolling in off the harbor, ${t} degrees. Tie down those folding tables, Maple Row.`,
};
/** °F to °C, as the HUD's temperatures read with the °C option. */
export const toCelsius = (f: number) => Math.round(((f - 32) * 5) / 9);
/** The paper's and Cal's degrees ("97°") in °C with the °C option ("36°C"); °F text is left as it is. */
export const inCelsius = (text: string, celsius: boolean) => (celsius ? text.replace(/(-?\d+)°(?![CF])/g, (_, f: string) => `${toCelsius(Number(f))}°C`) : text);
/** Cal's weather (the spec's Scorcher at 97°: "Ninety-seven on the Boardwalk, and the Smoothie Bros are jogging in formation.").
 * With the °C option he says the Celsius number. */
export const weatherTalk = (w: Weather, celsius = false) => WEATHER_TALK[w.kind](sayNumber(celsius ? toCelsius(w.temp) : w.temp));

/** A fight called like a ball game, whoever's in it: Cal never takes sides. `us`: your crew's name (src/sim/grandkid.ts).
 * A Sabotage goes for the stock, not the till. */
export function callFight(f: FightNote, us = CREW_NAME): string {
  const at = place(f.target);
  // Guards who Fall Back lose the fight, even when the raiders go home with nothing (crew.ts playerWon).
  if (f.fellBack === 'def' && (f.outcome === 'repelled' || f.outcome === 'damaged')) return `${cap(crew(f.defender, us))} fall back from ${at}! ${cap(crew(f.attacker, us))} win it, but go home empty-handed!`;
  if (f.sabotage) {
    switch (f.outcome) {
      case 'robbed': return `${cap(crew(f.attacker, us))} slip into ${at} and spoil the stock! What a night for ${team(f.attacker)}!`;
      case 'damaged': return `${cap(crew(f.attacker, us))} sneak into ${at} but run out of time! Close one for ${team(f.defender)}!`;
      default: return `${cap(crew(f.attacker, us))} creep up on ${at}... and get caught! Sabotage foiled by ${team(f.defender)}!`;
    }
  }
  switch (f.outcome) {
    case 'smashed': return `${cap(crew(f.attacker, us))} come over the fence at ${at}... and down goes the stand! What a night for ${team(f.attacker)}!`;
    case 'robbed': return `${cap(crew(f.attacker, us))} hit the till at ${at} and run off with ${money(f.loot)}! What a grab by ${team(f.attacker)}!`;
    case 'damaged': return `${cap(crew(f.attacker, us))} rattle ${at} and leave empty-handed! Close one for ${team(f.defender)}!`;
    default: return `${cap(crew(f.attacker, us))} charge ${at}... and bounce right off! What a stand by ${team(f.defender)}!`;
  }
}

/** Cal's 2-day forecast after the Jingle: the Bugle's lookAhead, which reads demand's weather queue (weather.ts forecastAhead). */
function twoDay(s: GameState, celsius = false): string {
  const [a, b] = lookAhead(s, 2);
  const low = (t: string) => inCelsius(/^(Heat Wave|Hurricane)!/.test(t) ? t : t.charAt(0).toLowerCase() + t.slice(1), celsius);
  return a && b ? `Cal's two-day: tomorrow, ${low(a.text)}; the day after, ${low(b.text)}.` : '';
}

/** "He takes every faction's ad money": the hour's sponsor, round the rivals still in business (and Lottie's, with the Jingle). */
function sponsor(s: GameState, n: number): string {
  const payers = [...RIVALS.filter((r) => s.rivals[r]?.alive).map((r) => FACTIONS[r].name), ...(jingleOn(s) ? ["Lottie's Lemonade"] : [])];
  if (!payers.length) return STATION_IDS[n % STATION_IDS.length];
  return `This hour of hits comes to you from ${payers[(s.day + n) % payers.length]}. Cal takes everybody's money, folks.`;
}

// ---------- the show ----------

/** The Morning Prep show: a retired jingle's second of silence and a blitzing rival's jingle first, then a station ID, the
 * Bugle's headline and briefs, the weather, the Jingle and Cal's 2-day forecast (M3), and the sign-off. celsius: the °C
 * option (Cal says the Celsius numbers). */
export function morningShow(s: GameState, celsius = false): RadioLine[] {
  const paper = bugleNews(s);
  const line = (kind: RadioKind, text: string): RadioLine => ({ minute: OPEN - 1, kind, text });
  return [
    ...openers(s, line),
    line('id', STATION_IDS[s.day % STATION_IDS.length]),
    line('news', `Front page of the Bugle: ${end(paper.headline[0])} ${end(paper.headline[1])}`),
    ...paper.briefs.map((b) => line('news', `Also in the paper: ${end(inCelsius(b, celsius))}`)),
    line('weather', weatherTalk(s.forecast, celsius)),
    ...(jingleOn(s) ? [line('jingle', JINGLE), line('forecast', twoDay(s, celsius))] : []),
    line('signoff', SIGN_OFF),
  ].filter((l) => l.text);
}

/** Last night's fights on the scoreboard, a rival-vs-rival one first (the Bugle leads with yours). */
function boxScore(s: GameState): FightNote | undefined {
  const last = (s.world?.fights ?? []).filter((f) => f.day === s.day - 1);
  return last.find((f) => f.attacker !== 'player' && f.defender !== 'player') ?? last[0];
}

/** Kids' Lemonade Day on the air. */
function kidsTalk(s: GameState): string | null {
  const e = kidsDay(s);
  if (!e) return null;
  return e.raided?.length ? `Cal hears ${crewName(s)} took a seven-year-old's pitcher today. Shame, shame, shame.`
    : `Kids' Lemonade Day, folks: the kid stands have taken ${e.took ?? 0} of Lottie's customers so far. Adorable. Leave them be.`;
}

/** The hour's line, 08:00 to 19:00 (h = 0..11): station IDs, the weather, the paper's gossip, the sponsors, last night's box
 * score, the Market, the Jingle and the forecast at lunch, and last call. */
function hourLines(s: GameState, h: number, briefs: () => string[], celsius: boolean): RadioLine[] {
  const minute = OPEN + h * 60;
  const say = (kind: RadioKind, text: string, at = minute): RadioLine => ({ minute: at, kind, text });
  const id = (k: number) => say('id', STATION_IDS[(s.day + k) % STATION_IDS.length]);
  const gossip = (i: number, k: number) => (briefs()[i] ? say('gossip', `Word around the bay: ${end(inCelsius(briefs()[i], celsius))}`) : id(k));
  switch (h) {
    case 0: return [say('id', `${STATION_IDS[s.day % STATION_IDS.length]} The stands are open, Citrine Bay.`)];
    case 1: case 6: return [say('weather', weatherTalk(s.weather, celsius))];
    case 2: return [gossip(0, 1)];
    case 3: case 8: return [say('ad', sponsor(s, h))];
    case 4: return jingleOn(s) ? [say('jingle', JINGLE), say('forecast', twoDay(s, celsius), minute + 10)] : [id(2)];
    case 5: { const f = boxScore(s); return [f ? say('fight', `Last night on the scoreboard: ${callFight(f, crewName(s))}`) : gossip(1, 0)]; }
    case 7: { const k = kidsTalk(s); return [k ? say('gossip', k) : gossip(2, 1)]; }
    case 9: return [id(0)];
    case 10: return [say('news', `At the Market today: ${marketText(marketLines(s))}.`)];
    default: return [say('id', `One hour to closing. ${STATION_IDS[(s.day + 2) % STATION_IDS.length]}`)];
  }
}

/** Act 1: the evening Lottie's takes Brock's Strawberry page at the Summer Fair, he swears revenge live on 101.5. */
function brockLive(s: GameState): RadioLine | null {
  const r = tasteOffResult(s, 'summerFair', 1);
  if (!storyFairs(s) || r?.stake !== 'strawberry' || r.winner !== 'player' || r.day !== s.day) return null;
  return { minute: CLOSE, kind: 'live', text: 'Live on 101.5, Brock Bodine swears revenge: "This isn\'t over, bro! You hear me, Lottie\'s? This is NOT over!"' };
}

/** What's aired since the morning show, in order up to now: the hours, the break-ins and the fights as they came (the night's
 * too), Brock's call and the sign-off at closing. */
export function airedToday(s: GameState, celsius = false): RadioLine[] {
  if (s.phase === 'prep') return [];
  let paper: string[] | undefined;
  const briefs = () => (paper ??= bugleNews(s).briefs);
  const out: RadioLine[] = [];
  for (let h = 0; h < 12; h++) if (OPEN + h * 60 <= s.minute) out.push(...hourLines(s, h, briefs, celsius));
  for (const b of s.world?.breaks ?? []) if (b.day === s.day) out.push({ minute: b.minute, kind: 'break', text: `Breaking on 101.5: ${b.text}` });
  for (const f of [...(s.world?.fights ?? [])].reverse()) if (f.day === s.day) out.push({ minute: f.minute, kind: 'fight', text: callFight(f, crewName(s)) });
  const brock = brockLive(s);
  if (brock) out.push(brock);
  out.push({ minute: CLOSE + 1, kind: 'signoff', text: `That's the day, folks. ${SIGN_OFF}` });
  return out.filter((l) => l.minute <= s.minute && l.text).sort((a, b) => a.minute - b.minute);
}

/** The whole day on 101.5 so far: the Morning Prep show, then everything aired since. */
export const radioToday = (s: GameState, celsius = false): RadioLine[] => [...morningShow(s, celsius), ...airedToday(s, celsius)];

/** The line on the air right now, after Morning Prep (Morning Prep plays the morning show). */
export const onAir = (s: GameState, celsius = false): RadioLine | null => airedToday(s, celsius).at(-1) ?? null;

/** Is 101.5 playing for you? Always in Morning Prep; while your stands are open, from the radio on any L3+ stand of yours; and
 * all day and night as the optional soundtrack. */
export function radioOn(s: GameState, soundtrack: boolean): boolean {
  if (s.phase === 'prep' || soundtrack) return true;
  return s.phase === 'open' && playerStands(s).some((p) => { const st = s.plots[p.id].stand; return !!st && !st.wrecked && st.level >= RADIO_STAND_LEVEL; });
}
