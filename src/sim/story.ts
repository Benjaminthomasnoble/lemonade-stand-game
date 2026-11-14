// The campaign story (spec "Narrative"): five acts that advance on their
// climaxes, never on rank or day alone (days and ranks are targets). Act 1
// closes with the Day 14 Summer Fair Taste-Off, win or lose; Acts 2 to 4 with
// the fall of the Blend Shack, the Grindhouse and FizzCo Tower; Act 5 with
// Sourwood Manor and Domination, then the Epilogue (Endless Summer). A boss who
// falls early exits early: an act whose climax rival is already gone moves on
// at the next dawn. Sandbox and Endless have no acts. This module also holds
// the lessons (Act 1's one system a day) and the story's hooks into the day:
// dawn, every few minutes, closing. Pure, like the rest of the sim.
import {
  ACT_BY_RANK, ACTS, BELOVED_STARS, BRAND_TIERS, CUPS_PER_PITCHER, DISTRICT_RANK, LESSON_DAY, RANKS, RECORD_GAIN, STAND_LEVELS, type CampaignId, type RivalId, type SupplyId,
} from './balance.ts';
import { festivalDays, tasteOffResult } from './calendar.ts';
import { LOTTIES_CORNER, PLOT_BY_ID, PLOTS } from './map.ts';
import { alert } from './alerts.ts';
import type { GameState, SimEvent, Stand } from './economy.ts';
import { dayProfit } from './ledger.ts'; // the Ledger's profit for a day (demand)
import type { BattleReport } from './crew.ts';
import { pitcherNeeds, playerStands, plotPrice, postAtFirstFree, restockGoal, seasonOf, standLevel, stock } from './economy.ts';
import { checkGoals, DEX_LESSON, goalsAtDawn, migrateGoals, skipGoal } from './goals.ts';
import { migratePhone, phoneAtAct, phoneAtClose, phoneCheck } from './phone.ts';
import { migrateScenes, playScene, SCENES, scenesAtDawn } from './scenes.ts';
import { beatsAtDawn, beatsOnTheClock } from './beats.ts';
import { endingFor } from './modes.ts';
import { crewCall } from './grandkid.ts';
import { cameosAtClose, cameosAtDawn } from './cameos.ts';
import { migrateScore, scoreCheck, scoreMinute, type ScoreBooks } from './score.ts';
import { migrateTips, type TipsState } from './perks.ts';
import { CLIENTS } from './vip.ts';

const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

export interface StoryState {
  act: number; // 1-5
  since: number; // the day the act began
  banner?: number; // the dawn whose Bugle leads with the new act
  epilogue?: number; // the day the Epilogue began (Endless Summer after the Domination win)
  /** Act 2's payback: the Blenders stands you shook down and smashed (plot ids), kept past the battle log's last 6. */
  payback?: { shakedown?: string; smash?: string };
  /** Act 3's handshake (src/sim/beats.ts): Preston's Truce offer while it stands, whether he has made it, and the tribute you paid him (it's on Juni's invoice). */
  offer?: { from: RivalId; until: number };
  asked?: boolean;
  tribute?: number;
  /** Act 4's first chopper and first ship: the scripted offers' ids ('' when an older save had its first already), the day Juni last tipped you off about the pad, the last day the ship's contract was in your Order Book, and its docking. `tipped`: the FizzCo Delivery Raids out now that Juni has rung about (raid ids). */
  vip?: { heli?: string; ship?: string; tip?: number; booked?: number; docked?: boolean; tipped?: string[] };
  /** Act 4's lawyers (src/sim/beats.ts): the dawn FizzCo's Cease-and-Desist on Downtown taught the lesson. */
  lawyers?: number;
  /** Dex Moody has joined (every mode): once a run, so nothing brings a fresh Dex back. */
  dexJoined?: boolean;
  /** The tone guide's lines on triggers that exist: the day Dex last shouted at Honkers the goose, and the best day's profit so far (Marisol's record days). */
  honked?: number;
  bestDay?: number;
  /** Endless: each beaten boss's last cameo (or the day they were first seen out) and how many they've made, the last
   * cameo's day, and the Bugle's cameo for the morning after it (src/sim/cameos.ts). */
  cameos?: Partial<Record<RivalId, { day: number; n: number }>>;
  cameoDay?: number;
  cameoNews?: { day: number; who: RivalId; n: number };
  /** The score's books between looks: the Rank badge's invested sliver (src/sim/score.ts). */
  score?: ScoreBooks;
  /** Lottie's Tips: the ones you keep and the rank-ups' hands still to pick from (src/sim/perks.ts). */
  tips?: TipsState;
}

/** The rival whose fall closes each act (Act 1 closes with the Summer Fair instead). */
export const ACT_CLIMAX: readonly (RivalId | null)[] = [null, 'blenders', 'coldbrew', 'fizzco', 'sourwood'];
/** The Bugle's line for each act's first morning. */
const ACT_LINES = [
  '',
  'Brock wants his sun back.',
  'Someone keeps spoiling the stock.',
  'FizzCo eyes the fields and the docks.',
  'Sourwood Manor is watching.',
];

/** The campaign tells the story; Sandbox and Endless have no acts or scenes. */
export const hasStory = (s: GameState) => s.settings.mode === 'campaign';
/** Lessons: Lottie teaches one system a day, and its buttons appear that day (on unless switched off at New Game). */
export const lessonsOn = (s: GameState) => s.settings.lessons !== false;
/** Has this system's lesson come? With lessons off, buttons follow rank unlocks alone. */
export const taught = (s: GameState, lesson: keyof typeof LESSON_DAY) => !lessonsOn(s) || s.day >= LESSON_DAY[lesson];
/** Today is the guards lesson: Dex turns up unposted, and stationing him is the goal. */
export const dexLesson = (s: GameState) => lessonsOn(s) && s.day === LESSON_DAY.crew;
/** Day 1: Lottie stocks your stands, and the Market waits for Day 2's lesson (from then on you buy your own). */
export const lottieStocks = (s: GameState) => !taught(s, 'market');

/** Lottie's own stock goes on the shelf at no cost to you: your cash stays put, and so does Net Worth. */
function gift(st: Stand, id: SupplyId, qty: number, day: number): void {
  const inv = st.inventory;
  if (id === 'lemons') { inv.lemons.push({ qty, day, unitCost: 0 }); return; }
  const key = id === 'sugar' ? 'sugarCost' : 'iceCost';
  inv[key] = (inv[id] * inv[key]) / (inv[id] + qty);
  inv[id] += qty;
}

/**
 * Day 1 (spec "Supplies": Lottie stocks your table; the Market and Auto-Restock are yours from Day 2): each Morning
 * Prep she fills every stand you own to the goal Auto-Restock would buy to (automation.ts restockGoal: the suggested
 * target, the forecast day's expected sales), in whole pitchers and as storage allows, for free. A stand built during
 * Morning Prep gets its share at once (storyAfterAct).
 */
export function lottieStocksStands(s: GameState): void {
  if (!lottieStocks(s) || s.phase !== 'prep') return;
  for (const p of playerStands(s)) {
    const st = s.plots[p.id].stand!;
    if (st.wrecked) continue;
    const cups = Math.max(CUPS_PER_PITCHER, Math.ceil(restockGoal(s, p.id) / CUPS_PER_PITCHER) * CUPS_PER_PITCHER);
    const n = pitcherNeeds(st), room = standLevel(st).storage;
    const want: Record<SupplyId, number> = { lemons: (cups / CUPS_PER_PITCHER) * n.lemons, sugar: (cups / CUPS_PER_PITCHER) * n.sugar, ice: cups * n.icePerCup };
    for (const id of Object.keys(want) as SupplyId[]) {
      const add = Math.min(want[id], room[id]) - stock(st, id);
      if (add > 0) gift(st, id, add, s.day);
    }
  }
}

/** The current act: the story's in the campaign, read from rank everywhere else. */
export function storyAct(s: GameState): number {
  if (!hasStory(s) || !s.story) return ACT_BY_RANK[s.rank - 1] ?? ACTS.length;
  return s.story.act;
}

/** The day the current act began (campaign only), e.g. for the Syndicate forming two weeks into Act 5. */
export function actBegan(s: GameState): number | null {
  return hasStory(s) && s.story ? s.story.since : null;
}

/** Keep squeezing after the campaign's win: the Epilogue, Endless Summer, starts today. */
export function beginEpilogue(s: GameState): void {
  if (!hasStory(s) || !s.story || s.story.epilogue !== undefined) return;
  s.story.epilogue = s.day;
  if (s.rank < RANKS.length) s.news.push(`Lottie: "${rankTenLine()}"`); // spec: Lottie names Rank 10 as the next goal
}

/** The Epilogue's next goal, in Lottie's words, while Rank 10 is still ahead (the goal card counts up to it: goals.ts). */
export const rankTenLine = () => {
  const top = RANKS[RANKS.length - 1];
  return `Rank ${top.rank} next, kid: ${top.title}. ${money(top.ss)}.`;
};

/**
 * The Epilogue (spec "The Epilogue: Endless Summer"): the sign over Lottie's Corner flips each dawn between Lottie &
 * Vera's and Vera & Lottie's, by the days since the Epilogue began. The campaign only: it needs the finale's
 * reconciliation. Null before the Epilogue, and in every other mode. The world's Corner sign is the art thread's to
 * read (src/world); the HUD's plot card names the Corner by it (cornerName).
 */
export function cornerSign(s: GameState): string | null {
  const ep = s.story?.epilogue;
  if (!hasStory(s) || ep === undefined) return null;
  return (s.day - ep) % 2 === 0 ? "Lottie & Vera's" : "Vera & Lottie's";
}
/** A plot's name on the HUD: the Corner's in the Epilogue ("Vera & Lottie's Corner"), else null (its own name). */
export const cornerName = (s: GameState, plotId: string) => { const sign = plotId === LOTTIES_CORNER ? cornerSign(s) : null; return sign ? `${sign} Corner` : null; };

/** Has the climax that closes this act happened? */
export function climaxDone(s: GameState, act: number): boolean {
  if (act === 1) return summerFairDone(s);
  const r = ACT_CLIMAX[act - 1];
  return !!r && !s.rivals[r].alive;
}

/**
 * The year-1 Summer Fair Taste-Off (Day 14), win or lose: judged at closing on the fair's last day (src/sim/calendar.ts).
 * A run whose fair passed without one (an older save) counts it done once the fair is over.
 */
export function summerFairDone(s: GameState): boolean {
  return !!tasteOffResult(s, 'summerFair', 1) || s.day > festivalDays('summerFair', 1).to;
}

function inferAct(s: GameState): number {
  let act = 1;
  while (act < ACTS.length && climaxDone(s, act)) act++;
  return act;
}

/** Fill in the story's parts of the save (new runs and older saves alike). Safe to call any time. */
export function migrateStory(s: GameState): void {
  if (!s.story || !(s.story.act >= 1 && s.story.act <= ACTS.length)) s.story = { act: inferAct(s), since: s.day }; // older saves: from which climaxes are behind them
  if (hasStory(s) && s.endlessSince !== undefined && s.story.epilogue === undefined) s.story.epilogue = s.endlessSince;
  // A save from before the scripted first chopper and ship: a tier with an offer or order on the books, or a client of
  // its who has already come and gone (seenClients outlives the order), already had its first. (vip.ts sets lastOffer
  // the dawn a tier opens, before any call, so that alone is no sign of one.)
  const had = (tier: 'heli' | 'ship') => [...(s.offers ?? []), ...(s.orders ?? [])].some((o) => o.tier === tier)
    || (s.seenClients ?? []).some((c) => CLIENTS[tier].includes(c));
  s.story.vip ??= { ...(had('heli') ? { heli: '' } : {}), ...(had('ship') ? { ship: '' } : {}) };
  // A save from before Act 4's scripted letter: a Cease-and-Desist on Downtown still on the books already taught it.
  const letter = s.story.lawyers === undefined ? s.schemes?.find((x) => x.kind === 'cease' && x.district === 'downtown') : undefined;
  if (letter) s.story.lawyers = letter.day;
  if (s.guards.some((g) => g.name === 'Dex Moody')) s.story.dexJoined = true;
  if (s.story.bestDay === undefined && s.history.length) s.story.bestDay = Math.max(...s.history.map(dayProfit)); // older saves: the best day on the books
  migrateScenes(s);
  migratePhone(s);
  migrateGoals(s);
  migrateScore(s);
  migrateTips(s);
}

/** One act a dawn, so each climax gets its own morning (actAtDawn). */
function advanceAct(s: GameState): void {
  const st = s.story!;
  if (!hasStory(s) || st.epilogue !== undefined || st.act >= ACTS.length || !climaxDone(s, st.act)) return;
  st.act++;
  st.since = s.day;
  st.banner = s.day;
  s.news.push(`ACT ${st.act}: ${ACTS[st.act - 1].toUpperCase()}! ${ACT_LINES[st.act - 1]}`);
  s.news.push(`Lottie: "${leanLine(s)}"`); // which ending the act just played leans toward
  phoneAtAct(s, st.act);
}

/**
 * Lottie's hint as each act ends (spec "Two endings": "Lottie hints at each act's end which way you lean"): the Beloved
 * ending needs more buyouts than Smashes and HQ captures, plus BELOVED_STARS; anything else is the Iron Pitcher
 * (modes.ts endingFor). Act 1 rarely has a buyout or a Smash in it, so with nothing on the tally the stars alone tip it.
 * Placeholder lines: the spec gives none.
 */
export const LEAN_LINES = {
  beloved: "The town's sweet on you, kid. A beloved mogul in the making.",
  iron: "Squeeze like that and they'll call you the Iron Pitcher, kid.",
  stars: "You deal fair, kid. Earn the stars to match, and they'll love you.",
  freshBeloved: 'Folks wave at the stand already, kid. Keep it sweet.',
  freshIron: "Folks don't know you yet, kid. Win them one cup at a time.",
};
export function leanLine(s: GameState): string {
  const t = s.tally ?? { buyouts: 0, smashes: 0, hqs: 0 };
  if (!t.buyouts && !t.smashes && !t.hqs) return s.reputation >= BELOVED_STARS ? LEAN_LINES.freshBeloved : LEAN_LINES.freshIron;
  if (endingFor(s) === 'beloved') return LEAN_LINES.beloved;
  return t.buyouts > t.smashes + t.hqs ? LEAN_LINES.stars : LEAN_LINES.iron;
}

/**
 * Lessons: Dex arrives unposted on Day 4 for the "station Dex" lesson; if nobody does by closing, he takes the Corner
 * himself, so the night is covered. That ticks the lesson off without Lottie's reward: nobody stationed him.
 */
function dexOnDuty(s: GameState): void {
  const dex = s.guards.find((g) => g.name === 'Dex Moody');
  if (!dex || dex.post || !dexLesson(s)) return;
  const stands = [LOTTIES_CORNER, s.selected].filter((id) => s.plots[id]?.owner === 'player' && s.plots[id].stand);
  if (!stands.length) return;
  const home = postAtFirstFree(s, dex.id, stands); // crew: within the stand's posts; with them full he stays in the reserve
  skipGoal(s, DEX_LESSON);
  if (!home) { alert(s, { kind: 'note', text: `Dex: "Nobody posted me, and the posts are full. I'm in the reserve."`, plot: stands[0] }); return; }
  alert(s, { kind: 'note', text: `Dex: "Nobody posted me. I took ${home === LOTTIES_CORNER ? 'the Corner' : PLOT_BY_ID[home].name.replace(/ lot /, ' ')}."`, plot: home });
}

/**
 * Day 5 at dawn (campaign): a Sourwood Steward kicks over the table at Lottie's Corner "as a reminder" (Vera phones
 * once the scene is over). A scene, not a raid: no fight, no Threat or Reputation change, and the tutorial raid stays
 * the first. It costs one spilled pitcher: the Corner's lemons and sugar for 10 cups (the ice melted overnight), or
 * what's left of them. A fence doesn't stop him. Then the Picket Fence's lesson: "Fence the Corner".
 */
function stewardVisit(s: GameState): void {
  if (s.day !== LESSON_DAY.defense) return;
  const ps = s.plots[LOTTIES_CORNER];
  const st = ps.owner === 'player' && ps.stand && !ps.stand.wrecked ? ps.stand : null;
  const n = st && pitcherNeeds(st);
  let lemons = st && n ? Math.min(n.lemons, stock(st, 'lemons')) : 0;
  const sugar = st && n ? Math.min(n.sugar, st.inventory.sugar) : 0;
  const spill = lemons + sugar > 0;
  const recap = `A Sourwood Steward knocked over the table "as a reminder"${spill ? ': one pitcher spilled' : ''}. Lottie wants a fence.`;
  if (!playScene(s, 'steward', { recap }) || !st) return; // once a run, campaign only
  st.inventory.sugar -= sugar;
  const batches = st.inventory.lemons; // the oldest go first, as when pouring
  while (lemons > 0 && batches.length) {
    const take = Math.min(batches[0].qty, lemons);
    batches[0].qty -= take;
    lemons -= take;
    if (!batches[0].qty) batches.shift();
  }
}

/** Benny Buzz pitches every brand tier and local campaign in a slogan (spec "Marketing"): he talks in nothing else. */
export const BENNY_SLOGANS = {
  brand: [
    "You're not selling lemonade. You're selling sunshine in a cup!",
    'Chalk it up to thirst!',
    'Hum it. Crave it. Buy it!',
    'Bigger signs, bigger sips!',
    "The sky's the limit. Literally!",
  ],
  sandwichBoard: 'Walk the board, win the block!',
  freeSamples: "The first sip's free. The second's a habit!",
} as const;
/** Benny's pitch for a brand tier (1-5) or a local campaign. */
export const bennyPitch = (what: number | CampaignId): string => (typeof what === 'number' ? BENNY_SLOGANS.brand[what - 1] ?? '' : BENNY_SLOGANS[what]);

/**
 * Act 1's lesson lines, the morning each system's button appears: Day 2's Market, Day 5's Wooden Stand (a tap on the
 * table answered from Day 1; now Lottie nudges it), Day 6's first sign, which Benny Buzz pitches himself. Each is a card
 * in the alert feed (nights' alert, which puts it in the news too); Go there goes to your first stand.
 */
function lessonLines(s: GameState): void {
  const home = playerStands(s)[0]?.id;
  const say = (text: string, plot = home) => alert(s, { kind: 'note', text, ...(plot ? { plot } : {}) });
  if (lessonsOn(s) && s.day === LESSON_DAY.market) say('Lottie: "From today the market\'s yours. Auto\'s on, so I stock every stand at dawn: set each one\'s target, or switch it off and buy your own."');
  const [table, wooden] = STAND_LEVELS;
  if (lessonsOn(s) && s.day === LESSON_DAY.upgrade && !playerStands(s).some((p) => s.plots[p.id].stand!.level >= wooden.level)) {
    say(`Lottie: "Time that table grew up. A Wooden Stand draws ${wooden.draw / table.draw}× the walkers and pours ${wooden.capacityPerHour / table.capacityPerHour}× as fast: ${money(wooden.cost)}, back in 2-4 days."`);
  }
  if ((lessonsOn(s) || hasStory(s)) && s.day === LESSON_DAY.marketing && !s.brandTier) say(`Benny Buzz: "${bennyPitch(1)} One sign, ${money(BRAND_TIERS[0].cost)}!"`, '');
}

/**
 * Week 2's land lesson (campaign): Skip Larkin finds you an open Old Town street plot, the cheapest going, and stands on
 * it in his scene; its card points there, and the Land Registry opens with the lesson. Old Town needs Rank 2, so he
 * waits for it through the rest of Act 1. If you already hold land in Old Town, there's nothing left to find.
 */
function skipFindsACorner(s: GameState): void {
  if (!hasStory(s) || s.day < LESSON_DAY.land || storyAct(s) > 1 || s.rank < DISTRICT_RANK.oldtown) return;
  if (s.scenes?.seen.includes('skip') || s.scenes?.queue.some((q) => q.id === 'skip')) return;
  if (PLOTS.some((p) => p.district === 'oldtown' && s.plots[p.id].owner === 'player')) return;
  const open = PLOTS.filter((p) => p.district === 'oldtown' && p.type === 'street' && !s.plots[p.id].owner && (!s.plots[p.id].dibs || s.plots[p.id].dibs!.who === 'player') && !s.plots[p.id].auction);
  if (!open.length) return;
  const lot = open.reduce((a, b) => (plotPrice(s, b.id) < plotPrice(s, a.id) ? b : a));
  const price = money(plotPrice(s, lot.id)), name = lot.name.replace(/ lot /, ' ');
  const lines = SCENES.skip.lines.map((l, i) => (i === 1 ? { ...l, text: `${name}: ${price}, fair crowds and all!` } : l));
  if (!playScene(s, 'skip', { plot: lot.id, lines, recap: `Skip Larkin found you an Old Town corner: ${name}, ${price}. The Land Registry is open.` })) return;
  alert(s, { kind: 'note', text: `Skip: "${name}, ${price}. Snap it up!"`, plot: lot.id });
}

/** Do you have a Clubhouse? One on a Street plot of yours (src/sim/clubhouse.ts), standing or not, or an older save's level. */
export function hasClubhouse(s: GameState): boolean {
  return (s.clubhouse ?? 0) > 0 || Object.values(s.plots).some((ps) => ps.owner === 'player' && ps.facility?.kind === 'clubhouse');
}

/**
 * Act 2 (campaign), told around the goals card (src/sim/goals.ts): on its first morning Dex pushes for a Clubhouse
 * and a squad to fill it; the Blenders stands you shake down and smash are noted for the payback goals; and when
 * winter empties the Boardwalk, Lottie says so (getting the Blenders Weakened is the goal from then on).
 */
function act2Beats(s: GameState): void {
  const st = s.story!;
  if (!hasStory(s) || st.act !== 2) return;
  if (st.since === s.day && !hasClubhouse(s)) alert(s, { kind: 'note', text: 'Dex: "The shed sleeps one, Miss Lottie. A Clubhouse sleeps six. Just saying."' });
  if (seasonOf(s.day) === 'winter' && seasonOf(s.day - 1) !== 'winter' && s.rivals.blenders.alive) alert(s, { kind: 'note', text: 'Lottie: "Nobody buys a smoothie in sleet."' });
}

/** Note the payback raids (a won Shakedown, then a Smash on another Blenders stand) before the battle log forgets them. */
function notePayback(s: GameState): void {
  const st = s.story;
  if (!st) return;
  for (const b of [...s.battles].reverse()) {
    if (b.attacker !== 'player' || b.defender !== 'blenders' || b.hq) continue;
    const pb = (st.payback ??= {});
    if (b.objective === 'shakedown' && b.outcome === 'robbed') pb.shakedown ??= b.target;
    if (b.objective === 'smash' && b.outcome === 'smashed' && b.target !== pb.shakedown) pb.smash ??= b.target;
  }
}

/** A new run's first Morning Prep (newGame): Lottie stocks the Corner, and the campaign opens on her scene. */
export function storyAtStart(s: GameState): void {
  migrateStory(s);
  lottieStocksStands(s);
  if (hasStory(s)) playScene(s, 'opening'); // her table, her pitcher and her 3 pages; it plays on Day 1 or not at all
  scenesAtDawn(s);
}

/**
 * Dawn, before the Cookie Jar is read (one line in sleepUntilDawn, ahead of fortunesAtDawn): the act may turn, so a new
 * act's first morning has a full jar. One act a dawn.
 */
export function actAtDawn(s: GameState): void {
  migrateStory(s);
  scoreCheck(s); // land values, VIP pickups, loans, Fire Sales and dawn events have moved the score: the peak first, then the win check (score.ts)
  advanceAct(s);
}

/** Dawn (one line in sleepUntilDawn, after actAtDawn): the day's goals and scenes arrive, bosses' moods are read. */
export function storyAtDawn(s: GameState): void {
  migrateStory(s);
  lottieStocksStands(s);
  lessonLines(s);
  stewardVisit(s);
  skipFindsACorner(s);
  act2Beats(s);
  notePayback(s); // last night's raids
  beatsAtDawn(s); // Acts 3 and 4: Preston's handshake, the night flight, the first chopper and ship (src/sim/beats.ts)
  goalsAtDawn(s);
  scenesAtDawn(s);
  cameosAtDawn(s); // Endless: Tilly rings the County Fair's judging morning
  phoneCheck(s, true);
  scoreCheck(s); // the Cookie Jar and the goals' rewards (score.ts)
}

/** Every game minute while open (one line in tickMinute): goals tick off as they're met, and the score updates. */
export function storyMinute(s: GameState): SimEvent[] {
  if (s.minute % 10 === 0) {
    checkGoals(s);
    beatsOnTheClock(s); // the first ship docks; Juni's tip before the first chopper loads
    phoneCheck(s);
  }
  return scoreMinute(s); // a rank-up on the spot, and the peak; a hand of Lottie's Tips stops the skips (score.ts)
}

/** Closing time (one line in closeDay, after tonight's raids are planned): the day's goals, Dex's post, tonight's warning calls. */
export function storyAtClose(s: GameState): void {
  checkGoals(s);
  dexOnDuty(s);
  recordDay(s);
  cameosAtClose(s); // Endless: a beaten boss's cameo
  phoneAtClose(s);
  scoreCheck(s); // the day's goal rewards (score.ts)
}

// ---------- the tone guide's lines on triggers that already exist (spec "Tone guide") ----------
// Brock's fence line rides his warning calls and Tilly's line her call after you raid her (src/sim/phone.ts).

/** Dex's line, by your crew's name ("Peel Patrol, hold the line!"). */
export const dexGooseLine = (s: GameState) => `${crewCall(s)}, hold the line! Not you, Honkers. You hold that line over there.`;

/** After a fight on your plot (one line in crew.ts fightRaid): Dex was in it and the Guard Goose posted there stunned a raider. Once a day. */
export function dexHoldsTheLine(s: GameState, b: BattleReport): void {
  const dex = s.guards.find((g) => g.name === 'Dex Moody');
  if (!dex || !s.story || b.defender !== 'player' || s.story.honked === s.day || !b.defenders.some((f) => f.id === dex.id)) return;
  if (!b.events.some((e) => e.type === 'stun' && e.by === 'goose')) return;
  s.story.honked = s.day;
  alert(s, { kind: 'note', text: `Dex: "${dexGooseLine(s)}"`, plot: b.target });
}

export const marisolLine = (pct: number) => `Profit's up ${pct} percent. Please don't celebrate by buying another goose.`;

/**
 * Closing on a record day (spec tone guide, "Marisol, record day", with the real percentage): Marisol says it. Her first
 * in the campaign is a visit the next Morning Prep (she walks over with the Ledger: src/world/scenes.ts stages her by
 * speaker); a story beat that morning goes first, and if it takes her day she comes with the next record. Every other
 * record is her line in the day's news.
 */
function recordDay(s: GameState): void {
  const st = s.story!;
  const t = s.history[s.history.length - 1];
  if (!t || t.day !== s.day) return;
  const p = dayProfit(t), best = st.bestDay;
  st.bestDay = best === undefined ? p : Math.max(best, p);
  if (best === undefined || best <= 0 || p < best * (1 + RECORD_GAIN)) return;
  const pct = Math.round((p / best - 1) * 100);
  if (hasStory(s) && !s.scenes?.seen.includes('marisol')) {
    const [, ...rest] = SCENES.marisol.lines;
    if (playScene(s, 'marisol', { until: s.day + 1, lines: [{ ...SCENES.marisol.lines[0], text: `Profit's up ${pct} percent.` }, ...rest], recap: `Marisol Vega brought the Ledger round: profit up ${pct} percent, a record.` })) return;
  }
  s.news.push(`Marisol: "${marisolLine(pct)}"`);
}

/**
 * After anything the player does (main.ts): a goal met by a purchase ticks off at once; a new table on Day 1 (before
 * the Market's lesson) gets Lottie's stock; the first brand tier brings Benny Buzz to paint the sign (his scene, at
 * the next lull).
 */
export function storyAfterAct(s: GameState): void {
  lottieStocksStands(s);
  if (s.brandTier >= 1) playScene(s, 'benny'); // once a run, campaign only
  notePayback(s); // a daytime raid just fought
  beatsOnTheClock(s); // a chopper order just taken, with its bottles ready: Juni's tip now
  checkGoals(s);
  phoneCheck(s);
  scoreCheck(s); // a purchase's invested dip, a buyout's jump (score.ts)
}

/**
 * The morning's Bugle banner on the first day of a new act. Act 2's first morning yields to the Bugle's own line for
 * the Act 1 climax when you took Brock's Strawberry page ("FOLDING TABLE STUNS...", src/ui/calendar.ts).
 */
export function storyHeadline(s: GameState): [string, string] | null {
  const st = s.story;
  if (!hasStory(s) || !st || st.banner !== s.day || st.act < 2) return null;
  const fair = tasteOffResult(s, 'summerFair', 1);
  if (st.act === 2 && fair?.stake === 'strawberry' && fair.winner === 'player' && s.day === fair.day + 1) return null;
  return [`ACT ${st.act}!`, ACTS[st.act - 1]];
}

/** The dateline: which act the campaign is in. */
export function storyDateline(s: GameState): string {
  if (!hasStory(s)) return '';
  if (s.story?.epilogue !== undefined) return 'Epilogue';
  return `Act ${storyAct(s)}: ${ACTS[storyAct(s) - 1]}`;
}
