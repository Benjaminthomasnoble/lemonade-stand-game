// The voice of the world (spec: Events and the living world, "The voice of the world"): the Morning Bugle's front
// page. Nothing important arrives unannounced: each dawn at Morning Prep the Bugle prints the forecast (and the
// Radio Jingle's 2-day look-ahead), the Market's prices against normal with any shock and its days left, each
// stand's cost per cup, the week's calendar, today's events with their district and length, and one headline with
// 2-3 briefs. Headlines go story beat, then rank-up, then last night's raid or the biggest rival move, then today's
// events, then the weather. Mid-day events break in on 101.5 instead (radio.ts). s.news stays the headline source
// for other lanes: what it holds at dawn prints as a brief. Pure: the paper is read off the state.
import { BRAND_TIERS, FACTIONS, FESTIVALS, RANKS, RECIPES, SEASON_WEATHER, SUPPLIES, WEATHER, type RivalId, type SupplyId, type WeatherKind } from './balance.ts';
import { DISTRICT_BY_ID, PLOT_BY_ID, PLOTS, type FactionId } from './map.ts';
import type { GameState, Weather } from './economy.ts';
import { costPerCup, playerStands, seasonDay, seasonOf } from './economy.ts';
import { battleHeadline, type BattleReport } from './crew.ts';
import { pagesInTheBugle, worldOf } from './recipes.ts';
import { festivalDays, festivalsOn, storyFairs, tasteOffResult, tasteOffToday, upcomingFestivals } from './calendar.ts';
import { daysLeft, eventDef, liveEvents, plannedWeather, type WorldEvent } from './events.ts';
import { storyHeadline } from './story.ts';

const RIVALS = Object.keys(FACTIONS) as RivalId[];
/** Rivals as the paper names them in a headline. */
const NAME: Record<RivalId, string> = { sourwood: 'Sourwoods', hollis: 'Hollis', fizzco: 'FizzCo', coldbrew: 'Cold Brew', blenders: 'Blenders' };
const who = (f: FactionId) => (f === 'player' ? "Lottie's" : NAME[f as RivalId]);
const place = (plotId: string) => PLOT_BY_ID[plotId].name.replace(/ lot /, ' ');
const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

// ---------- what the paper remembers from one dawn to the next ----------

/** Last night's fights as the paper and the radio heard them, rival-vs-rival included (crew's fightRaid logs each one). */
export interface FightNote { day: number; minute: number; attacker: FactionId; defender: FactionId; target: string; outcome: BattleReport['outcome']; loot: number }

/** The newsroom's notes, taken at dawn: the rank and rivals' plots it last printed, and what changed since. */
export interface Newsroom {
  day: number; // the morning these notes are for
  rank: number;
  rankUp?: number; // a rank reached since the last paper
  owners: Record<string, RivalId>; // plots in rival hands at this dawn
  alive: RivalId[];
  moves: { rival: RivalId; gained: string[]; lost: string[] }[]; // since the last paper
  fell: RivalId[]; // rivals out of the game since the last paper
  wire: string[]; // what s.news took in overnight and at dawn (other lanes' lines: a rival's move, an Out-of-Towner)
  scandal?: number; // the day you raided a kid's stand (Kids' Lemonade Day): the next morning's front page
}

/** crew's fightRaid calls this for every fight, rival-vs-rival included. */
export function bugleFight(s: GameState, b: BattleReport): void {
  const w = worldOf(s);
  (w.fights ??= []).unshift({ day: b.day, minute: s.minute, attacker: b.attacker, defender: b.defender, target: b.target, outcome: b.outcome, loot: b.loot });
  w.fights.length = Math.min(w.fights.length, 16);
}

/** A wire line worth printing: not Lottie's own tips, and not a raid, a rank-up or a rival's new stand (the paper
 * writes those up itself from the fights and the plots). */
const onTheWire = (line: string) => !!line && !/^Lottie/.test(line) && !/raid|RAID|RANK UP|opens a new stand at/.test(line);

/** Closing (calendar's worldAtClose): the newsroom marks where the day's news ends; the morning wire is what came after. */
export function mediaAtClose(s: GameState): void {
  worldOf(s).newsMark = [s.news.length, s.news[s.news.length - 1] ?? ''];
}

/** What s.news took in since closing: overnight and at dawn (all of it once the HUD has flushed it, as it does live). */
function sinceClose(s: GameState): string[] {
  const m = s.world?.newsMark;
  return m && m[0] > 0 && m[0] <= s.news.length && s.news[m[0] - 1] === m[1] ? s.news.slice(m[0]) : [...s.news];
}

/** The newsroom's notes on the bay as it stands, with no news yet: a new game's, or an older save's first (migrateWorld). */
export function newsroomNow(s: GameState): Newsroom {
  const owners: Record<string, RivalId> = {};
  for (const p of PLOTS) { const o = s.plots[p.id]?.owner; if (o && o !== 'player') owners[p.id] = o as RivalId; }
  return { day: s.day, rank: s.rank, owners, alive: RIVALS.filter((r) => s.rivals[r]?.alive), moves: [], fell: [], wire: [] };
}

/** Dawn (calendar's worldAtDawn, before the day's events start): the newsroom takes its notes for this morning's paper. */
export function mediaAtDawn(s: GameState): void {
  const w = worldOf(s);
  const prev = w.paper;
  const now = newsroomNow(s);
  const moves = prev ? RIVALS.map((rival) => ({
    rival,
    gained: Object.keys(now.owners).filter((id) => now.owners[id] === rival && prev.owners[id] !== rival && s.plots[id].stand),
    lost: Object.keys(prev.owners).filter((id) => prev.owners[id] === rival && now.owners[id] !== rival),
  })).filter((m) => m.gained.length || m.lost.length) : [];
  const fought = new Set(s.battles.filter((b) => b.day >= s.day - 1).map(battleHeadline)); // the fights have their own stories
  w.paper = {
    ...now, ...(prev && s.rank > prev.rank ? { rankUp: s.rank } : {}),
    moves, fell: prev ? prev.alive.filter((r) => !s.rivals[r].alive) : [], wire: sinceClose(s).filter((l) => onTheWire(l) && !fought.has(l)).slice(-4),
    ...(prev?.scandal !== undefined ? { scandal: prev.scandal } : {}),
  };
}

// ---------- the front page ----------

export interface MarketLine { id: SupplyId; change: number; text: string; shock?: { name: string; left: number } }
export interface EventLine { id: string; name: string; where: string; days: number; left: number; counter: string }
export interface FrontPage {
  day: number;
  headline: [string, string]; // big tape, small tape
  briefs: string[]; // 2-3
  forecast: Weather;
  ahead: { day: number; weather: Weather | null; text: string }[]; // the Radio Jingle's 2-day look-ahead (none without it)
  market: MarketLine[]; // each supply against normal
  costs: { plot: string; cost: number }[]; // each of your stands' cost per cup
  calendar: string[]; // the week's festivals, with their days and district
  events: EventLine[]; // running today: where, and for how long
}

/** A story the paper could lead with: its two tapes, and its line as a brief. Lower `rank` leads. */
interface Story { big: string; small: string; brief: string; rank: number }

const WEATHER_HEADS: Record<WeatherKind, [string, string][]> = {
  scorcher: [['SIZZLER!', 'Hot enough to fry an egg'], ['SCORCHER!', 'Town begs for shade']],
  hot: [['HOT ONE!', 'Thirsty town expected'], ["SUN'S OUT!", 'Cups out']],
  warm: [['PERFECT DAY!', 'Lemonade weather, says Lottie'], ['NICE ONE!', 'Strollers on Maple Row']],
  cloudy: [['GRAY SKIES', 'Cool heads, cool cups'], ['CLOUDY', 'Thirst rolls out']],
  rainy: [['PUDDLES!', 'Umbrellas outsell lemonade'], ['RAIN, RAIN', 'Go away, says every stand']],
  storm: [['STORM!', 'Batten down the tables'], ['THUNDER!', 'Over Citrine Bay']],
};

/** Where an event is, the way the paper prints it. */
export function eventWhere(e: WorldEvent): string {
  const d = eventDef(e);
  if (!d) return '';
  const district = e.district ? DISTRICT_BY_ID[e.district].name : '';
  if (d.scope === 'bay') return 'all over the bay';
  if (d.scope === 'stand' && e.plots?.[0]) return place(e.plots[0]);
  if (d.scope === 'street' && e.plots?.length) {
    const cols = e.plots.map((id) => PLOT_BY_ID[id]);
    const ends = [cols[0], cols[cols.length - 1]].map((p) => place(p.id));
    return ends[0] === ends[1] ? `${district}, by ${ends[0]}` : `${district}, ${ends[0]} to ${ends[1]}`;
  }
  return district;
}
const lengthText = (n: number) => (n === 1 ? 'today only' : `${n} days`);

function storyBeats(s: GameState, paper: Newsroom | undefined): Story[] {
  const out: Story[] = [];
  const add = (big: string, small: string, brief: string, rank = 1) => out.push({ big, small, brief, rank });
  const act = storyHeadline(s); // a new act leads the morning paper (story.ts)
  if (act) add(act[0], act[1], `${act[0]} ${act[1]}.`, 0);
  if (s.day === 1) add("SCHOOL'S OUT!", 'Grandkid opens on Maple Row', "School's out: Lottie's grandkid opens on Maple Row.");
  const act1 = tasteOffResult(s, 'summerFair', 1);
  if (storyFairs(s) && act1?.stake === 'strawberry' && act1.winner === 'player' && s.day === act1.day + 1) {
    add('FOLDING TABLE STUNS', 'Smoothie Empire at Summer Fair', 'Folding table stuns Smoothie Empire at Summer Fair.');
  }
  if (paper?.scandal === s.day - 1) add("GRANDKID RAIDS KIDS' STAND", 'Seven-year-old left in tears', "Lottie's grandkid raids a seven-year-old's lemonade stand.");
  const pages = pagesInTheBugle(s);
  if (pages.length === 1) add('PAGE COMES HOME!', `${RECIPES[pages[0]].label} back in the book`, `${RECIPES[pages[0]].label} is back in Lottie's book.`);
  else if (pages.length > 1) {
    const short = pages.map((id) => RECIPES[id].label.replace(/ (Hot )?Lemonade$/, ''));
    add('PAGES COME HOME!', `${short.slice(0, -1).join(', ')} and ${short[short.length - 1]} back in the book`, `${short.join(' and ')} are back in Lottie's book.`);
  }
  for (const r of paper?.fell ?? []) add(`${NAME[r].toUpperCase()} ARE OUT!`, `${FACTIONS[r].boss.replace(/ ".*"/, '')} closes up shop`, `${FACTIONS[r].name} are out of business.`);
  const yesterday = (s.world?.fairs ?? []).find((r) => r.day === s.day - 1);
  if (yesterday && !(storyFairs(s) && yesterday.stake === 'strawberry' && yesterday.winner === 'player')) {
    const fair = FESTIVALS[yesterday.fair].name;
    if (yesterday.winner === 'player') add('TASTE-OFF WIN!', `Lottie's takes the ${fair}`, `Lottie's wins the ${fair} Taste-Off.`);
    else add('TASTE-OFF', `${yesterday.winner === 'local' ? "Dot's Diner" : NAME[yesterday.winner]} takes the ${fair}`, `${yesterday.winner === 'local' ? "Dot's Diner" : FACTIONS[yesterday.winner].name} win the ${fair} Taste-Off.`, 3.5);
  }
  const t = tasteOffToday(s);
  if (t) add('TASTE-OFF TODAY!', `${FESTIVALS[t.fair].name}, ${DISTRICT_BY_ID[t.district].name}`, `Taste-Off today at the ${FESTIVALS[t.fair].name}.`, 1.5);
  return out;
}

/** Last night's fights with you in them: held, smashed, robbed, or your own crew's raid. */
function fightStory(f: FightNote): Story {
  const at = place(f.target);
  if (f.attacker === 'player') {
    switch (f.outcome) {
      case 'smashed': return { big: "LOTTIE'S CREW STRIKES!", small: `${who(f.defender)} flattened at ${at}`, brief: `Lottie's crew flattens the ${who(f.defender)} stand at ${at}.`, rank: 3 };
      case 'robbed': return { big: 'SHAKEDOWN!', small: `Lottie's crew takes ${money(f.loot)}`, brief: `Lottie's crew shakes down ${at} for ${money(f.loot)}.`, rank: 3 };
      case 'damaged': return { big: 'RAID RUNS LATE', small: `${at} roughed up`, brief: `Lottie's crew roughs up ${at}.`, rank: 3 };
      default: return { big: 'RAID GOES BUST', small: `${who(f.defender)} hold ${at}`, brief: `${who(f.defender)} send Lottie's crew home from ${at}.`, rank: 3 };
    }
  }
  switch (f.outcome) {
    case 'smashed': return { big: 'STAND SMASHED!', small: `${who(f.attacker)} hit ${at}`, brief: `${who(f.attacker)} smash Lottie's stand at ${at}.`, rank: 3 };
    case 'robbed': return { big: 'TILL ROBBED!', small: `${who(f.attacker)} take ${money(f.loot)}`, brief: `${who(f.attacker)} grab ${money(f.loot)} at ${at}.`, rank: 3 };
    case 'damaged': return { big: 'CLOSE CALL!', small: `${who(f.attacker)} rattle ${at}`, brief: `${who(f.attacker)} rattle ${at}, leave empty-handed.`, rank: 3 };
    default: return { big: 'RAID HELD!', small: `${who(f.attacker)} bounce off ${at}`, brief: `${who(f.attacker)} bounce off Lottie's fence at ${at}.`, rank: 3 };
  }
}

const OUTCOME: Record<BattleReport['outcome'], string> = { smashed: 'smashed', robbed: 'robbed', damaged: 'roughed up', repelled: 'held off' };

/** A wire line written the paper's way ("FIRE SALE: ...", "REPOSSESSED! ...") can lead, with its first sentence as the small
 * tape (the rivals lane's Out-of-Towner, say); any other line prints as a brief. */
function wireStory(line: string): Story | null {
  const m = /^([A-Z][A-Z0-9' &-]{2,}[!:])\s+(.+)$/.exec(line);
  if (!m) return null;
  return { big: m[1].replace(/:$/, ''), small: m[2].split(/(?<=[.!?])\s/)[0].replace(/\.$/, ''), brief: line, rank: 3.6 };
}

/** When the news is thin: the Market's biggest move, the next festival, the biggest rival on the map. */
function fillers(s: GameState): string[] {
  const out: string[] = [];
  const big = marketLines(s).filter((m) => Math.abs(m.change) >= 0.15).sort((a, b) => Math.abs(b.change) - Math.abs(a.change))[0];
  if (big) out.push(`${SUPPLIES[big.id].label} ${big.change > 0 ? 'up' : 'down'} ${Math.round(Math.abs(big.change) * 100)}% at the Market.`);
  const next = upcomingFestivals(s).find((x) => x.from > s.day + 2);
  if (next) out.push(`The ${FESTIVALS[next.id].name} opens Day ${next.from} in ${DISTRICT_BY_ID[FESTIVALS[next.id].district].name}.`);
  const stands = RIVALS.filter((r) => s.rivals[r].alive).map((r) => ({ r, n: PLOTS.filter((p) => s.plots[p.id].owner === r && s.plots[p.id].stand).length }));
  const top = stands.sort((a, b) => b.n - a.n)[0];
  if (top?.n) out.push(`${NAME[top.r]} run ${top.n} stands, the most in the bay.`);
  return out;
}

/** The raids, the rival moves, the countdowns and the event notes the paper has room for. */
function stories(s: GameState): { lead: Story[]; pinned: string[]; briefs: string[] } {
  const paper = s.world?.paper?.day === s.day ? s.world.paper : undefined;
  const lead = storyBeats(s, paper);
  const pinned: string[] = [];
  const briefs: string[] = [];
  if (paper?.rankUp) {
    const title = RANKS[paper.rankUp - 1].title;
    lead.push({ big: 'RANK UP!', small: `Grandkid now a ${title}`, brief: `Lottie's grandkid is now a ${title}.`, rank: 2 });
  }
  const night = (s.world?.fights ?? []).filter((f) => f.day === s.day - 1);
  for (const f of night) {
    if (f.attacker === 'player' || f.defender === 'player') lead.push(fightStory(f));
    else briefs.push(`${who(f.attacker)} raid ${who(f.defender)} at ${place(f.target)}: ${OUTCOME[f.outcome]}.`);
  }
  const moves = [...(paper?.moves ?? [])].filter((m) => m.gained.length).sort((a, b) => b.gained.length - a.gained.length);
  for (const m of moves) {
    const n = m.gained.length;
    lead.push({ big: `${NAME[m.rival].toUpperCase()} EXPAND${n > 1 ? '!' : ''}`, small: n === 1 ? `New stand at ${place(m.gained[0])}` : `${n} new stands`, brief: `${FACTIONS[m.rival].name} open ${n === 1 ? `a stand at ${place(m.gained[0])}` : `${n} new stands`}.`, rank: 3.5 });
  }
  // Today's events, as they start; the festivals as they open.
  for (const e of liveEvents(s)) {
    const d = eventDef(e)!;
    if (e.from !== s.day || d.when !== 'dawn') continue;
    const big = d.bugle?.(s, e) ?? [`${d.name.toUpperCase()}!`, `${eventWhere(e)}, ${lengthText(e.to - e.from + 1)}`];
    lead.push({ big: big[0], small: big[1], brief: `${d.name}: ${eventWhere(e)}, ${lengthText(e.to - e.from + 1)}.`, rank: 4 });
  }
  for (const id of festivalsOn(s.day)) {
    const f = FESTIVALS[id];
    if (f.from !== seasonDay(s.day)) continue;
    const n = f.to - f.from + 1;
    lead.push({ big: `${f.name.toUpperCase()}!`, small: `${DISTRICT_BY_ID[f.district].name}, ${lengthText(n)}`, brief: `The ${f.name} opens in ${DISTRICT_BY_ID[f.district].name}: ${lengthText(n)}.`, rank: 4.5 });
  }
  // Countdowns.
  if (storyFairs(s) && s.day === festivalDays('summerFair', 1).to - 2 && s.rivals.blenders.alive) pinned.push('TASTE-OFF IN 2 DAYS: BODINE NOT WORRIED, BRO.');
  for (const x of upcomingFestivals(s, 2)) {
    const f = FESTIVALS[x.id];
    briefs.push(`${f.name} opens ${x.from === s.day + 1 ? 'tomorrow' : 'in 2 days'} in ${DISTRICT_BY_ID[f.district].name}.`);
  }
  // Event notes: the ones running on, with their days left.
  for (const e of liveEvents(s)) {
    if (e.from === s.day) continue;
    const left = daysLeft(s, e);
    briefs.push(`${eventDef(e)!.name}, ${eventWhere(e)}: ${left === 1 ? 'last day' : `${left} days left`}.`);
  }
  for (const line of paper?.wire ?? []) {
    const story = wireStory(line);
    if (story) lead.push(story); else briefs.push(line);
  }
  return { lead, pinned, briefs };
}

/** The headline and 2-3 briefs: the top story leads (the weather when nothing else does), the rest print as briefs. */
function news(s: GameState): Pick<FrontPage, 'headline' | 'briefs'> {
  const { lead, pinned, briefs } = stories(s);
  lead.sort((a, b) => a.rank - b.rank);
  const pool = WEATHER_HEADS[s.forecast.kind];
  const [big, small] = pool[s.day % pool.length];
  const weather: Story = { big, small, brief: `${weatherText(s.forecast)} today.`, rank: 5 };
  const top = lead[0] ?? weather;
  const all = [...pinned, ...lead.slice(1).map((x) => x.brief), ...briefs, ...(top === weather ? [] : [weather.brief]), ...fillers(s)];
  const seen = new Set<string>();
  return { headline: [top.big, top.small], briefs: all.filter((b) => !seen.has(b) && seen.add(b)).slice(0, 3) };
}

/** The two tapes the dawn banner and the front page lead with. */
export const bugleHeadline = (s: GameState): [string, string] => news(s).headline;

/** The weather as the paper prints it: "Scorcher, 97°". */
export const weatherText = (w: Weather) => `${WEATHER[w.kind].label}, ${w.temp}°`;

/** A coming day the look-ahead can't call yet: the season's two likeliest skies. */
function outlook(day: number): string {
  const odds = Object.entries(SEASON_WEATHER[seasonOf(day)]) as [WeatherKind, number][];
  const top = odds.sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => WEATHER[k].label);
  return `${top[0]} or ${top[1].toLowerCase()}`;
}

/** The Radio Jingle's 2-day look-ahead (seam: demand's forecastDays(s, 2) once it merges). A planned Heat Wave shows. */
export function lookAhead(s: GameState, days = 2): FrontPage['ahead'] {
  if (s.brandTier < BRAND_TIERS[2].tier) return [];
  return Array.from({ length: days }, (_, i) => {
    const day = s.day + 1 + i;
    const w = plannedWeather(s, day);
    return { day, weather: w, text: w ? `${s.world?.events?.on.some((e) => e.id === 'heatWave' && e.from <= day && e.to >= day) ? 'Heat Wave! ' : ''}${weatherText(w)}` : outlook(day) };
  });
}

/** Each supply against normal: "+20%", "−10%", "flat"; a shock (Lemon Blight, Sugar Shortage) names itself and its days left. */
export function marketLines(s: GameState): MarketLine[] {
  return (Object.keys(SUPPLIES) as SupplyId[]).map((id) => {
    const change = s.market[id] / SUPPLIES[id].baseUnitPrice - 1;
    const pct = Math.round(change * 100);
    const text = Math.abs(pct) < 3 ? 'flat' : `${pct > 0 ? '+' : '−'}${Math.abs(pct)}%`;
    const e = liveEvents(s).find((x) => eventDef(x)?.shock === id);
    return { id, change, text, ...(e ? { shock: { name: eventDef(e)!.name, left: daysLeft(s, e) } } : {}) };
  });
}

/** "Lemons +20%, sugar −10%, ice flat". */
export const marketText = (lines: MarketLine[]) => lines.map((m, i) => `${i ? SUPPLIES[m.id].label.toLowerCase() : SUPPLIES[m.id].label} ${m.text}`).join(', ');

/** One line of the week's calendar: the days, the name and the district. */
export function calendarLine(x: { id: keyof typeof FESTIVALS; from: number; to: number }): string {
  const f = FESTIVALS[x.id];
  return `${x.from === x.to ? `Day ${x.from}` : `Days ${x.from}-${x.to}`}: ${f.name}, ${DISTRICT_BY_ID[f.district].name}`;
}

/** This morning's front page, read off the state (the dawn's notes, the calendar, the events and the Market). */
export function frontPage(s: GameState): FrontPage {
  return {
    day: s.day,
    ...news(s),
    forecast: s.forecast,
    ahead: lookAhead(s),
    market: marketLines(s),
    costs: playerStands(s).map((p) => ({ plot: p.id, cost: costPerCup(s, s.plots[p.id].stand!) })),
    calendar: upcomingFestivals(s).map(calendarLine),
    events: liveEvents(s).filter((e) => eventDef(e)).map((e) => ({
      id: e.id, name: eventDef(e)!.name, where: eventWhere(e), days: e.to - e.from + 1, left: daysLeft(s, e), counter: eventDef(e)!.counter,
    })),
  };
}
