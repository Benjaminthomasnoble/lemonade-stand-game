// Sit-downs at Dot's Diner, buyouts, elimination and HQ assaults (canon
// sections 10 and 13). Pure functions over GameState, like the rest of the sim.
import { FACTIONS, GUARD_BASE, PEACEFUL_VERA_BUYOUT, RANKS, SQUAD_CAP, type RivalId, type Trait } from './balance.ts';
import { runBattle, type BattleInput, type BattleResult, type BossMove, type Fighter } from './combat.ts';
import { creditGuards, guardReady, hasBuilding, henchmanFor, raidIsNight, raidSquad, squadFighters, threatLevel, type BattleReport, type Guard } from './crew.ts';
import { PLOT_BY_ID, PLOTS, type FactionId, type Plot } from './map.ts';
import { FACILITIES, type FacilityKind } from './vip.ts';
import type { Blocker, GameState, KeptBuilding } from './economy.ts';
import { netWorth, ownedPlots, rivalPrice } from './economy.ts';
import { book } from './ledger.ts'; // the Ledger: each cash movement on its row
import { bump, checkVictory, peaceful } from './modes.ts';
import { recoverPage } from './recipes.ts';
import { retireJingle } from './radio.ts';
import { bossExit } from './exits.ts';
import { tillyFieldRate, tillyWaits } from './calendar.ts';
import { nextRandom, type Rng } from './rng.ts';
import { historicHedges, landFrozen } from './schemes.ts';
import { startFireSale } from './auction.ts';
import { manorStewards, onlyTheSqueeze, squeezeAssault, squeezedHq } from './squeeze.ts';
import { leftBehind, nabLeftBehind } from './captives.ts';
import { raidBan } from './citations.ts';

const round2 = (n: number) => Math.round(n * 100) / 100;
const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const RIVALS = Object.keys(FACTIONS) as RivalId[];

// ---------- tunables (balance tables, Rivals and Land) ----------

export const SITDOWN_RANK = 4;
export const FACTION_BUYOUT_RANK = 5;
export const TRUCE_DAYS = 7;
export const TRUCE_BREAK_STARS = 1;
export const TRUCE_BAN_DAYS = 14;
/**
 * A Truce's cash tribute, "set by their Grudge" (spec gives no formula; placeholders): `share` of your Net Worth (at
 * least `floor`), times 1 + Grudge/100, so a boss at Grudge 50 asks half again, rounded to $100.
 */
export const TRUCE_TRIBUTE = { share: 0.02, floor: 500, grudge: 0.01 };
/**
 * A Smooth Talker as your Sit-down negotiator: a Truce's tribute and Plot and Faction Buyout prices come down by
 * `cut`, after Grudge and personality (placeholder: the spec gives no number; 15% matches Lottie's Tips "buyouts 15%
 * cheaper"). The negotiator has to be fit to go: a knocked-out guard stays home.
 */
export const SMOOTH_TALKER = { trait: 'Smooth Talker' as Trait, cut: 0.15 };
export const PLOT_BUYOUT = { home: 2.5, away: 2 };
/**
 * Juni and Preston haggle over a Faction Buyout (Brock and Tilly accept readily). You open at `offer` times their cash
 * and buildings, what Brock and Tilly take; they counter at their own multiple (HQS: 1.8x). Shake on the counter, or
 * hold firm: they take your offer with chance `cave` less `perGrudge` a point of Grudge toward you, else they walk out
 * until tomorrow and their Grudge rises by `snub`. Placeholders: the spec names the haggle but not its mechanics.
 */
export const HAGGLE = {
  offer: 1.5, cave: 0.5, perGrudge: 0.005, snub: 5,
  lines: { coldbrew: 'in small bills, for authenticity', fizzco: 'after hard haggling' } as Partial<Record<RivalId, string>>,
};
export const FIRE_SALE = { share: 0.75, days: 2 };
export const BANKRUPT_DAYS = 7;
/** Per faction: HQ assault rank, Gate HP, Faction Buyout multiple (null = never sells), boss and HQ difficulty tier. */
export const HQS: Record<RivalId, { rank: number; gate: number; buyout: number | null; tier: number; yard: number; boss: string; move: string }> = {
  blenders: { rank: 5, gate: 2000, buyout: 1.5, tier: 1, yard: 3, boss: 'Brock "The Blender" Bodine', move: 'Blender Rush' },
  coldbrew: { rank: 6, gate: 2750, buyout: 1.8, tier: 2, yard: 6, boss: 'Juniper "Juni" Grind', move: 'Espresso Shot' },
  hollis: { rank: 7, gate: 3500, buyout: 1.5, tier: 3, yard: 4, boss: 'Tilly Hollis', move: 'Hay Bale Wall' },
  fizzco: { rank: 8, gate: 4250, buyout: 1.8, tier: 4, yard: 9, boss: 'Preston Fizzwell III', move: 'Hostile Takeover' },
  sourwood: { rank: 9, gate: 5000, buyout: null, tier: 4, yard: 10, boss: 'Vera Sourwood', move: 'Old Money' },
};
/**
 * The bosses' moves in the Boss Room (spec "HQ assault": 3 guards; +50% speed for 10 seconds; 2 guards unless Loyal;
 * the rest are placeholders: spec gap). Each goes off `at` fight-seconds in, if the boss is still standing, and picks
 * on the guards nearest them. The placeholders hold the HANDOFF win rates with the assault fought at Morning Prep, a
 * night fight where Night Owls hit 25% harder (npm run combat).
 */
export const BOSS_MOVES = {
  blenders: { at: 0, count: 3, stun: 4 }, // Blender Rush: Brock charges as they come in and knocks 3 guards flat for 4 s
  coldbrew: { at: 0, seconds: 10, boost: 0.5 }, // Espresso Shot: Juni's crew swings and steps 50% faster for the first 10 s
  hollis: { at: 0, count: 4, hp: 320 }, // Hay Bale Wall: as they come in, Tilly drops a 320-HP hay bale in front of 4 guards
  fizzco: { at: 6, count: 2 }, // Hostile Takeover: 2 guards switch sides, unless they're Loyal
  sourwood: { at: 1, tier: 5, cane: 3 }, // Old Money: Vera's Stewards (squeeze.ts manorStewards) come in at 1 s; the cane disarms a guard at 3 s
};

// ---------- rival AI tunables (spec: Rivals, How rivals think; rivalAi.ts and schemes.ts use them) ----------

/** Cash a rival keeps out of its Grow / Guard / Strike buckets: this many days of upkeep and wages (placeholder: spec gap). */
export const RIVAL_RESERVE_DAYS = 2;
/**
 * A rival hires a garrison henchman for this, out of its Guard bucket (the spec gives no rival hire fee: the build's
 * own number), and only while Guard's share of what its trade nets each day covers the new man's wage.
 */
export const RIVAL_HIRE_FEE = 300;
/** On this share of dawns after Day 3 a rival with the Grow money buys a plot near its turf (the build's own pacing). */
export const RIVAL_LAND_CHANCE = 0.25;
/**
 * Rival cash grows about 1% a day from trade (balance tables). Over its first `days` dawns of trading, each rival's
 * stands' margin is scaled so its opening stands net about `share` of its starting cash on an average day of the
 * year (through the seasons and their weather, capped by each stand's stock), after their upkeep and its henchmen's
 * wages: a small gang carries overheads (under 1), an old-money family's stands front a bigger trade (over 1, on the
 * opening stands at their opening level only). The scale stays within `floor` and `ceiling` (placeholders: spec gap).
 */
export const RIVAL_TRADE = { share: 0.01, days: 7, floor: 0.02, ceiling: 25 };
/** Every this many days each rival stand is owed one level, up to the faction's cap (balance tables: every 30 days). */
export const RIVAL_UPGRADE_DAYS = 30;
/** A raid costs the rival this many nights of wages for each henchman it sends (placeholder: spec gap). */
export const RAID_WAGE_NIGHTS = 1;
/**
 * Grudge (0–100) a rival gains toward a faction that raids it, smashes its stand, takes its land or outbids it,
 * and loses on each quiet day; a feud makes the Bugle (placeholders: the spec gives no amounts). Your raids add
 * 20 when they win and 8 when they fail (fightRaid); breaking a truce adds 25 with every rival.
 */
export const GRUDGE = { raided: 10, smashed: 10, land: 15, outbid: 10, cool: 1, feud: 50 };
/**
 * A boss's Attention on you: Threat (per lemon), shared borders (per district of yours on or beside their turf),
 * the customers you take (your share of the cups sold on their turf today) and Grudge (per point). The keenest
 * boss who can pay sends the raid: its Attention plus `strike` times its Strike share (so the Blenders, at 60%,
 * send the most); `jitter` lets near-ties go either way (placeholders: the spec gives no weights).
 */
export const ATTENTION = { threat: 1, border: 0.5, customers: 10, grudge: 0.1, strike: 1, jitter: 1 };
/**
 * Blender Rush, the Blenders' signature move: frequent cheap raids with lots of fists (spec, no numbers given, so
 * these are placeholders). Their party comes at the top of its Threat range with every weapon one tier toward fists
 * (hatchets become clubs, clubs become fists), and costs them `cost` of the usual raid wages. Brock phones first.
 */
export const BLENDER_RUSH = { cost: 0.5, taunt: 'Bro. Tonight we blend your stand. Smoothie or chunky, your call.' };
/**
 * Strike schemes, the ones that aren't raids (spec: they come more often with each Threat lemon; it gives no
 * numbers, so all placeholders). From Day `from` (after the first week, while rival trade calibrates), each dawn a
 * rival with no scheme running starts one on `chance[Threat - 1]` of dawns, if its Strike bucket can fund it. A price
 * war cuts its prices by `cut` for `days` days at its stands that share passers-by with yours, and Strike pays the
 * margin it gives up. Cold Brew's poster crew costs `posters.cost` and takes `posters.stars` off your Reputation
 * unless the plot's night watch catches it; the posters stay up `posters.days` days, or until you hand out free
 * samples there. In Act `posters.act` (Grounds for Revenge) the crew works your Campus & Arts walls with the spec's
 * `slogan`. An auction snipe tops your sealed bid by `snipe.over`, the extra out of Strike. A finished scheme stays on
 * the books `keep` days. A rival that one of your stands outsold next door yesterday schemes on `provoked` times the
 * chance and reaches for a price war first (spec: Peaceful's "outbid or out-priced"). In Peaceful, where schemes
 * replace raids, every rival schemes on `peaceful` times the chance, and any rival can run an ad blitz.
 */
export const SCHEMES = {
  from: 8,
  chance: [0.02, 0.035, 0.05, 0.065, 0.08],
  provoked: 2,
  peaceful: 3,
  priceWar: { cut: 0.25, days: 3 },
  posters: { cost: 150, stars: 0.1, days: 3, act: 3, slogan: "LOTTIE'S: LEMONADE FOR PEOPLE WHO LIKE THINGS.", taunt: "It's not graffiti. It's a review." },
  snipe: { over: 0.05 },
  keep: 7,
};
/**
 * Night Shift, Cold Brew's signature move: stealthy night raids, spoiled stock and smear posters. Their night raids
 * take `stealth` more off your detection, like a Sneaky raider, and Floodlights don't cancel it (placeholder: the
 * spec gives no number). After a Cold Brew Sabotage on you (crew's raid objective) Juni phones with `taunt`.
 */
export const NIGHT_SHIFT = { stealth: 0.25, taunt: "Your stock didn't spoil. It made an artistic choice." };
/**
 * Act 3's mystery (spec: "stock spoils overnight with no raid detected. Dex blames the geese; it is never the geese.
 * Teaches Lookouts and Floodlights."): in the campaign's Act `act`, until Cold Brew's Night Shift is unmasked, its crew
 * slips in on the act's first night and then on `chance` of nights, and every lemon at one of your stands goes bad.
 * It is a scheme, not a raid, so no warning comes and nobody fights; each night after the first costs Cold Brew's
 * Strike `cost`. Your night watch catches the crew on a Cold Brew night raid's odds (detection less the Night Shift's
 * stealth: at a bare stand in the dark, never; Floodlights, alarms and an Eagle Eye on watch give it a chance), and
 * from then on the saboteurs are Cold Brew. Squawk's night flight unmasks them too. `goal` goes on Lottie's card from
 * the first spoiled night. Placeholders: the spec gives no numbers.
 */
export const MYSTERY = {
  act: 3, chance: 0.35, cost: 150,
  goal: 'Catch the night crew spoiling your stock',
  lottie: "Who spoils a whole stand's lemons in one night? Let's catch them at it.",
  dex: 'Geese. Gotta be the geese.', // it is never the geese
  dexCaught: 'Huh. Not the geese.',
};
/**
 * Dig In, Hollis's signature move: cheap, tough fences with hay bales stacked behind them. Hollis pays `cost` of a
 * fence's price (repairs too), and the bales give it `hp` times the fence's HP. Hollis also fences every Field it
 * holds, up to `fieldTier` (placeholders: the spec gives no numbers). Tilly phones after your raids (src/sim/phone.ts).
 */
export const DIG_IN = { cost: 0.6, hp: 1.5, fieldTier: 2 };
/**
 * FizzCo's Cease-and-Desist (Hostile Takeover): from Act `act` (Fields & Fizz, where the spec's first letter comes), a
 * letter costs FizzCo's Strike `cost` and blocks your marketing in one district for `days` days: your tier bonus and
 * campaigns count for nothing there. The letters stop when FizzCo falls (placeholder cost; the 3 days are the spec's).
 */
export const CEASE = { act: 4, cost: 2000, days: 3, taunt: "I'm not threatening you. Legal says I can't. I'm forecasting." };
/**
 * FizzCo's buyout offers (Hostile Takeover): from Act `act`, FizzCo offers `price` times a plot's land and building
 * value, out of its Grow, for your best plot on or beside its turf. The offer stands `days` days, and you answer at
 * Morning Prep. Turning it down adds `snub` to Preston's Grudge, and he phones sore (placeholders: the spec gives no
 * numbers or line).
 */
export const TAKEOVER = { act: 4, price: 1.25, days: 2, snub: 10 };
/**
 * Old Money, Sourwood's signature move: from Act `act` (The Big Squeeze, where the spec teaches it), Mayor Fontaine
 * fines you `fine` of your average daily sales over the last week (at least `minFine`, never more than your cash) for
 * `fineCost` of Vera's Strike, or freezes a land sale for `freezeDays` days for `freezeCost`. Vera's raids on you send
 * elite Stewards: one henchman level higher, every weapon one tier toward hatchets (placeholders: the spec gives no
 * numbers).
 */
export const OLD_MONEY = {
  act: 5, fine: 0.5, minFine: 25, fineCost: 500, freezeDays: 3, freezeCost: 1500,
  mayor: 'I represent all of Citrine Bay. Some of it more than others.',
};
/**
 * Act 5's Historic hedges beat (spec: "the Mayor freezes your Hilltop land deal to protect historic hedges. Teaches
 * Old Money."): the first time you go to buy a Hilltop Estates plot, Town Hall freezes that sale for
 * OLD_MONEY.freezeDays days. Mayor Fontaine walks on to that plot to say so (the world stages him by `speaker`).
 */
export const HEDGES = {
  speaker: 'fontaine' as const,
  seconds: 13,
  lines: [
    { who: 'Mayor Fontaine', text: 'Terribly sorry. That sale is frozen, to protect the historic hedges.', at: 1 },
    { who: 'Lottie', text: 'Hedges. Vera planted them herself, I bet.', at: 5.5 },
    { who: 'Mayor Fontaine', text: OLD_MONEY.mayor, at: 9 },
  ],
  recap: `Mayor Fontaine froze your Hilltop deal "to protect historic hedges." It thaws in ${OLD_MONEY.freezeDays} days.`,
};
/**
 * Rivals market by your rules (spec: "Rivals market by the same rules, and FizzCo spends the most"). At dawn a rival
 * buys its next brand tier at your price out of Grow, once your Rank has opened that tier, up to its faction's `cap`,
 * and only while Grow holds `save` times the price, so land and upgrades still get theirs: FizzCo pays as soon as
 * Grow covers it. The Bugle reports each one (placeholders: the spec gives no pace).
 */
export const RIVAL_BRAND = {
  cap: { fizzco: 5, sourwood: 4, hollis: 3, coldbrew: 3, blenders: 2 } as Record<RivalId, number>,
  save: { fizzco: 1, sourwood: 2, hollis: 2, coldbrew: 2, blenders: 2 } as Record<RivalId, number>,
};
/**
 * FizzCo's ad blitz (Hostile Takeover): from Rank `rank`, when your own Sunny opens, FizzCo's mascot walks the
 * district where most of its stands share passers-by with yours: +`traffic` at its stands there for `days` days, at
 * `perDay` a day of Strike (Sunny's numbers; the length is a placeholder). In Peaceful every rival can run one.
 */
export const AD_BLITZ = { rank: 3, traffic: 0.25, days: 3, perDay: 300 };

const rankNeed = (r: number): Blocker => ({ ok: false, why: `Needs Rank ${r}, ${RANKS[r - 1].title}` });

/** FizzCo's Harbor plot (spec: The Harbor is FizzCo's bottling plant and Docks; the rest open lots). */
export const FIZZCO_PLANT = 'harbor-3n';
/** Level of the plant's Bottling Works at the start (placeholder: the spec gives none). */
export const FIZZCO_PLANT_LEVEL = 1;

/**
 * Rivals hold VIP facilities on their land, worth knocking down: FizzCo's Bottling Works at the Harbor plant and a
 * Jetty, Sourwood's Helipad and marina Jetty, and a Lemon Grove on each of Hollis's Fields.
 */
export function seedRivalFacilities(s: GameState): void {
  const put = (plotId: string, kind: FacilityKind, level: number) => {
    s.plots[plotId].facility = { kind, level };
    s.plots[plotId].invested = FACILITIES[kind].costs.slice(0, level).reduce((a, b) => a + b, 0);
  };
  if (s.plots[FIZZCO_PLANT].owner === 'fizzco') put(FIZZCO_PLANT, 'bottling', FIZZCO_PLANT_LEVEL);
  const want: [RivalId, string, FacilityKind, number][] = [['fizzco', 'harbor', 'pier', 1], ['sourwood', 'hilltop', 'helipad', 2], ['sourwood', 'hilltop', 'pier', 1]];
  for (const [id, district, kind, level] of want) {
    const p = PLOTS.find((q) => q.district === district && s.plots[q.id].owner === id && FACILITIES[kind].on.includes(q.type) && !s.plots[q.id].facility);
    if (p) put(p.id, kind, level);
  }
  // canon: "Hollis's 6 starting Fields hold Lemon Groves."
  for (const p of PLOTS) if (p.district === 'groves' && p.type === 'field' && s.plots[p.id].owner === 'hollis' && !s.plots[p.id].facility) put(p.id, 'grove', 1);
}

// ---------- Weakened ----------

export const OUTSELL = { ratio: 2, days: 7 };

/** Weakened: holds 40% or less of its peak plots, its Net Worth is under 25% of yours, or you've outsold it 2x for 7 days running. */
export function isWeakened(s: GameState, id: RivalId): boolean {
  const r = s.rivals[id];
  if (!r.alive) return false;
  const plots = ownedPlots(s, id).length;
  return plots <= r.peakPlots * 0.4 || netWorth(s, id) < netWorth(s) * 0.25 || (r.outsoldDays ?? 0) >= OUTSELL.days;
}

/** At closing: count the days in a row the player's sales were at least double each rival's. */
export function trackOutselling(s: GameState): void {
  for (const id of RIVALS) {
    const r = s.rivals[id];
    const theirs = r.salesToday ?? 0;
    r.outsoldDays = r.alive && s.today.revenue >= OUTSELL.ratio * theirs && s.today.revenue > 0 ? (r.outsoldDays ?? 0) + 1 : 0;
    r.salesToday = 0;
  }
}

// ---------- Trophies ----------

export const TROPHIES: Record<RivalId, { name: string; perk: string }> = {
  blenders: { name: 'Blender Bar', perk: 'Frozen recipes sell for 20% more' },
  coldbrew: { name: "Juni's Grapevine", perk: 'Raid warnings arrive 1 game hour earlier' },
  hollis: { name: 'Hollis Orchards', perk: 'Each Lemon Grove brings +10% traffic instead of +5%' },
  fizzco: { name: 'Bottling Line', perk: 'Bottles fill 25% faster' },
  sourwood: { name: 'Family Silver', perk: 'Land, Plot Buyouts and auction bids cost 10% less' },
};
export const hasTrophy = (s: GameState, id: RivalId) => s.plots[hqPlot(id).id]?.owner === 'player';
export const familySilver = (s: GameState) => (hasTrophy(s, 'sourwood') ? 0.9 : 1);

export const hqPlot = (id: RivalId): Plot => PLOTS.find((p) => p.type === 'hq' && p.district === FACTIONS[id].home)!;

// ---------- the negotiator ----------

/** The guard you bring to Dot's Diner, if any: on your roster and fit to go. */
export function negotiator(s: GameState): Guard | null {
  const g = s.negotiator ? s.guards.find((x) => x.id === s.negotiator) : undefined;
  return g && guardReady(s, g) ? g : null;
}

/** What a Sit-down deal costs with your negotiator along: a Smooth Talker talks every price down. */
export const sitDownTerms = (s: GameState) => (negotiator(s)?.trait === SMOOTH_TALKER.trait ? 1 - SMOOTH_TALKER.cut : 1);

/** Bring one of your guards to the Sit-downs as negotiator, or go alone (null). */
export function setNegotiator(s: GameState, id: string | null): boolean {
  if (id === null) { delete s.negotiator; return true; }
  if (!s.guards.some((g) => g.id === id)) return false;
  s.negotiator = id;
  return true;
}

// ---------- Truce ----------

/** The tribute this boss asks for a Truce: a share of your Net Worth, raised by their Grudge toward you. */
export function truceCost(s: GameState, id: RivalId): number {
  const base = Math.max(TRUCE_TRIBUTE.floor, Math.round(netWorth(s) * TRUCE_TRIBUTE.share / 100) * 100);
  return Math.round(base * (1 + Math.max(0, s.rivals[id].grudge) * TRUCE_TRIBUTE.grudge) * sitDownTerms(s) / 100) * 100;
}
export const inTruce = (s: GameState, id: RivalId) => (s.rivals[id].truceUntil ?? 0) >= s.day;

export function canTruce(s: GameState, id: RivalId): Blocker {
  if (s.rank < SITDOWN_RANK) return rankNeed(SITDOWN_RANK);
  if (peaceful(s)) return { ok: false, why: 'Peaceful: nobody is raiding' }; // a Truce stops raids, and there are none to stop
  if (!s.rivals[id].alive) return { ok: false, why: 'Out of the game' };
  if (inTruce(s, id)) return { ok: false, why: `Truce until day ${s.rivals[id].truceUntil}` };
  if ((s.noTruceUntil ?? 0) >= s.day) return { ok: false, why: `Nobody trusts your handshake until day ${s.noTruceUntil! + 1}` };
  if (s.phase !== 'prep') return { ok: false, why: 'Sit-downs happen at Morning Prep' };
  if (s.cash < truceCost(s, id)) return { ok: false, why: `Tribute is ${money(truceCost(s, id))}` };
  return { ok: true };
}

export function makeTruce(s: GameState, id: RivalId): boolean {
  if (!canTruce(s, id).ok) return false;
  const cost = truceCost(s, id);
  book(s, 'tribute', -cost); // once, here (closeDay takes only stand upkeep)
  const r = s.rivals[id];
  r.truceUntil = s.day + TRUCE_DAYS - 1;
  r.respectUntil = Math.max(r.respectUntil, r.truceUntil + 1);
  s.raids = s.raids.filter((x) => !(x.attacker === id && s.plots[x.target].owner === 'player'));
  s.news.push(`Handshake at Dot's Diner: a ${TRUCE_DAYS}-day truce with ${FACTIONS[id].name} for ${money(cost)} tribute.`);
  return true;
}

/** Raiding a rival you're in a truce with breaks it: a full star, and nobody trusts you. */
export function breakTruce(s: GameState, id: RivalId): void {
  if (!inTruce(s, id)) return;
  s.rivals[id].truceUntil = 0;
  s.rivals[id].respectUntil = 0;
  s.reputation = Math.max(1, round2(s.reputation - TRUCE_BREAK_STARS));
  for (const r of RIVALS) s.rivals[r].grudge = Math.min(100, s.rivals[r].grudge + 25);
  s.noTruceUntil = s.day + TRUCE_BAN_DAYS - 1;
  s.news.push(`Lottie breaks the truce with ${FACTIONS[id].name}! The whole Bay is talking. (−${TRUCE_BREAK_STARS} star)`);
}

// ---------- Plot Buyout ----------

export function plotBuyoutPrice(s: GameState, plotId: string): number {
  const ps = s.plots[plotId];
  const id = ps.owner as RivalId;
  const home = PLOT_BY_ID[plotId].district === FACTIONS[id].home;
  const nudge = 1 + s.rivals[id].grudge / 200 + (id === 'sourwood' ? 0.2 : 0);
  return Math.round(ps.landValue * (tillyFieldRate(s, plotId) ?? (home ? PLOT_BUYOUT.home : PLOT_BUYOUT.away)) * nudge * familySilver(s) * sitDownTerms(s));
}

export function canPlotBuyout(s: GameState, plotId: string): Blocker {
  const ps = s.plots[plotId];
  if (s.rank < SITDOWN_RANK) return rankNeed(SITDOWN_RANK);
  if (!ps.owner || ps.owner === 'player') return { ok: false, why: 'Pick a rival plot' };
  if (PLOT_BY_ID[plotId].type === 'hq') return { ok: false, why: 'HQs are captured, never bought' };
  if (landFrozen(s, plotId)) return { ok: false, why: 'Town Hall froze this sale' };
  if (s.phase !== 'prep') return { ok: false, why: 'Sit-downs happen at Morning Prep' };
  const price = plotBuyoutPrice(s, plotId);
  if (s.cash < price) return { ok: false, why: `They want ${money(price)}` };
  return { ok: true };
}

export function plotBuyout(s: GameState, plotId: string): boolean {
  if (!canPlotBuyout(s, plotId).ok) return false;
  if (historicHedges(s, plotId)) return false; // Act 5: the Mayor freezes your first Hilltop deal, a Sit-down's too
  const ps = s.plots[plotId];
  const id = ps.owner as RivalId;
  const price = plotBuyoutPrice(s, plotId);
  book(s, 'invested', -price);
  s.rivals[id].cash += price;
  ps.owner = 'player';
  s.rivals[id].held = s.rivals[id].held?.filter((x) => x !== plotId); // a sale, not a taking: no Grudge
  ps.garrison = 0;
  if (ps.stand) ps.stand.price = Math.max(ps.stand.price, 0.5);
  s.news.push(`Skip Larkin: "Done deal! ${FACTIONS[id].name} sell ${PLOT_BY_ID[plotId].name} for ${money(price)}."`);
  bump(s, 'buyouts');
  checkVictory(s);
  return true;
}

// ---------- Faction Buyout ----------

/** What a Faction Buyout buys: the rival's cash plus what's invested in their buildings (the land goes to the Fire Sale). */
const businessOf = (s: GameState, id: RivalId) => Math.max(0, s.rivals[id].cash) + ownedPlots(s, id).reduce((a, p) => a + s.plots[p.id].invested, 0);

/** Their price for the business: its multiple (HQS) times cash and buildings, your negotiator's terms applied. */
export function factionBuyoutPrice(s: GameState, id: RivalId): number | null {
  // Peaceful Sandbox: even Vera sells once Weakened (at 3x), so Domination can finish without a fight.
  const m = HQS[id].buyout ?? (peaceful(s) ? PEACEFUL_VERA_BUYOUT : null);
  if (m === null) return null;
  return Math.round(businessOf(s, id) * m * sitDownTerms(s));
}

/** Juni and Preston haggle; the others sign at their price. */
export const haggles = (id: RivalId) => HAGGLE.lines[id] !== undefined;
/** The counter-offer is on the table today: shake on it, or hold firm. */
export const haggling = (s: GameState, id: RivalId) => s.rivals[id].haggle?.day === s.day && !s.rivals[id].haggle?.out;
/** Your opening offer to a haggler, and what holding firm pays: what Brock and Tilly take. */
export const haggleOffer = (s: GameState, id: RivalId) => Math.round(businessOf(s, id) * HAGGLE.offer * sitDownTerms(s));
/** The chance a haggler takes your offer when you hold firm: less the more they hold against you. */
export const caveChance = (s: GameState, id: RivalId) => Math.max(0, Math.min(1, HAGGLE.cave - Math.max(0, s.rivals[id].grudge) * HAGGLE.perGrudge));
/** The bosses by first name, across the table. */
export const BOSS_NAME: Record<RivalId, string> = { blenders: 'Brock', coldbrew: 'Juni', hollis: 'Tilly', fizzco: 'Preston', sourwood: 'Vera' };
const bossName = (id: RivalId) => BOSS_NAME[id];

/** Everything a Faction Buyout needs but the money: the rank, a Weakened rival who sells, Morning Prep, a boss at the table. */
function buyoutTable(s: GameState, id: RivalId): Blocker {
  if (s.rank < Math.max(FACTION_BUYOUT_RANK, HQS[id].rank)) return rankNeed(Math.max(FACTION_BUYOUT_RANK, HQS[id].rank));
  if (!s.rivals[id].alive) return { ok: false, why: 'Out of the game' };
  const tilly = tillyWaits(s, id, 'buyout'); if (tilly) return tilly;
  if (factionBuyoutPrice(s, id) === null) return { ok: false, why: `${HQS[id].boss} never sells` };
  if (!isWeakened(s, id)) return { ok: false, why: 'Only once they are Weakened' };
  if (s.phase !== 'prep') return { ok: false, why: 'Sit-downs happen at Morning Prep' };
  if (s.rivals[id].haggle?.day === s.day && s.rivals[id].haggle?.out) return { ok: false, why: `${bossName(id)} walked out. Back tomorrow` };
  return { ok: true };
}

/** Can you buy them out now: at their price, or (a haggler, before the counter) at your opening offer. */
export function canFactionBuyout(s: GameState, id: RivalId): Blocker {
  const table = buyoutTable(s, id);
  if (!table.ok) return table;
  const need = haggles(id) && !haggling(s, id) ? haggleOffer(s, id) : factionBuyoutPrice(s, id)!; // a haggler hears your offer first
  if (s.cash < need) return { ok: false, why: `They want ${money(need)}` };
  return { ok: true };
}

/** Holding firm at your offer, with a haggler's counter on the table. */
export function canHoldFirm(s: GameState, id: RivalId): Blocker {
  const table = buyoutTable(s, id);
  if (!table.ok) return table;
  if (!haggling(s, id)) return { ok: false, why: 'Make an offer first' };
  if (s.cash < haggleOffer(s, id)) return { ok: false, why: `Your offer is ${money(haggleOffer(s, id))}` };
  return { ok: true };
}

/** Sign at their price. A haggler signs only once their counter-offer is on the table (haggle first). */
export function factionBuyout(s: GameState, id: RivalId): boolean {
  if (!canFactionBuyout(s, id).ok || (haggles(id) && !haggling(s, id))) return false;
  return signBuyout(s, id, factionBuyoutPrice(s, id)!);
}

/**
 * Juni's and Preston's haggle. 'offer': you open at what Brock and Tilly take, and they counter at their price.
 * 'firm': you hold at your offer, and they take it or walk out until tomorrow (sorer for it).
 */
export function haggle(s: GameState, id: RivalId, move: 'offer' | 'firm'): boolean {
  if (!haggles(id)) return false;
  const r = s.rivals[id];
  if (move === 'offer') {
    if (haggling(s, id) || !canFactionBuyout(s, id).ok) return false;
    r.haggle = { day: s.day };
    s.news.push(`${bossName(id)} counters your ${money(haggleOffer(s, id))} at Dot's Diner: ${money(factionBuyoutPrice(s, id)!)}, ${HAGGLE.lines[id]}.`);
    return true;
  }
  if (!canHoldFirm(s, id).ok) return false;
  const rng = { seed: s.seed };
  const took = nextRandom(rng) < caveChance(s, id);
  s.seed = rng.seed;
  if (took) return signBuyout(s, id, haggleOffer(s, id));
  r.haggle = { day: s.day, out: true };
  r.grudge = Math.min(100, r.grudge + HAGGLE.snub);
  s.news.push(`${bossName(id)} walks out of Dot's Diner. Try again tomorrow.`);
  return false;
}

function signBuyout(s: GameState, id: RivalId, price: number): boolean {
  book(s, 'invested', -price);
  const line = HAGGLE.lines[id];
  s.news.push(`${HQS[id].boss} signs on the napkin at Dot's Diner: Lottie buys out ${FACTIONS[id].name} for ${money(price)}${line ? `, ${line}` : ''}!`);
  delete s.rivals[id].haggle;
  bump(s, 'buyouts');
  eliminate(s, id, 'buyout');
  return true;
}

// ---------- elimination ----------

/**
 * What the Fire Sale plots keep for their buyers. A Faction Buyout bought the business, its buildings among it: each
 * intact building and its fence stays with its plot (rubble doesn't). Captured or bankrupt, the land goes bare.
 */
function keptBuildings(s: GameState, id: RivalId, how: 'buyout' | 'hq' | 'bankrupt'): [string, KeptBuilding][] {
  if (how !== 'buyout') return [];
  return ownedPlots(s, id).filter((p) => p.type !== 'hq' && hasBuilding(s.plots[p.id])).map((p) => {
    const ps = s.plots[p.id];
    return [p.id, { stand: ps.stand, ...(ps.facility ? { facility: ps.facility } : {}), invested: ps.invested, defense: ps.defense }];
  });
}

/**
 * Whoever buys a Fire Sale plot gets the building kept on it (the auction's winner, or a rival buying it off the shelf
 * later); your First Dibs buy takes it in buyPlot. A rival's new stand prices at its own rate.
 */
export function handOverKept(s: GameState, plotId: string, buyer: FactionId): void {
  const ps = s.plots[plotId];
  if (!ps.kept) return;
  Object.assign(ps, ps.kept);
  delete ps.kept;
  if (buyer !== 'player' && ps.stand) ps.stand.price = rivalPrice(buyer, ps.stand.level, PLOT_BY_ID[plotId]);
}

/**
 * The rival is out: its HQ captured, its business bought, or bankrupt. On every route its HQ becomes your Trophy (a
 * bankrupt rival's too: nobody else can buy an HQ), its recipe page comes home, and every other plot it held goes to a
 * Fire Sale. A Faction Buyout hands over the business it paid for: the rival's cash comes to you, and its buildings stay
 * with their plots for whoever buys them (you first, on First Dibs).
 */
export function eliminate(s: GameState, id: RivalId, how: 'buyout' | 'hq' | 'bankrupt'): void {
  const r = s.rivals[id];
  if (!r.alive) return;
  r.alive = false;
  const till = how === 'buyout' ? Math.max(0, r.cash) : 0;
  r.cash = 0;
  if (till) {
    book(s, 'invested', till); // the Ledger's Invested row shows what the business cost net of its cash
    s.news.push(`${FACTIONS[id].name}'s till comes with the business: ${money(till)}.`);
  }
  s.raids = s.raids.filter((x) => x.attacker !== id);
  const hq = hqPlot(id);
  const trophy = `Their HQ, ${hq.name}, becomes Lottie's ${TROPHIES[id].name}: ${TROPHIES[id].perk.toLowerCase()}.`;
  if (s.plots[hq.id].owner === id) s.plots[hq.id] = { ...s.plots[hq.id], owner: 'player', garrison: 0 };
  s.news.push(how === 'bankrupt' ? `${FACTIONS[id].name} go bust after ${BANKRUPT_DAYS} days in the red. ${trophy}` : `${FACTIONS[id].name} are finished! ${trophy}`);
  recoverPage(s, id); // world: their recipe page comes home, on every route
  retireJingle(s, id, how); // world: 101.5 retires their jingle with a second of silence
  bossExit(s, id, how); // story: the boss's exit scene, in every mode (src/sim/exits.ts)
  const kept = keptBuildings(s, id, how); // read before the Fire Sale clears the plots
  startFireSale(s, id); // land: First Dibs for you, then an auction (src/sim/auction.ts)
  for (const [plot, building] of kept) s.plots[plot].kept = building;
  if (kept.length) s.news.push(`${kept.length === 1 ? 'Its building stays' : `All ${kept.length} buildings stay`} put: buy the plot, get the building.`);
  checkVictory(s);
}

/** At dawn: rivals in the red for a week go bust. */
export function rivalsBankrupt(s: GameState): void {
  for (const id of RIVALS) {
    const r = s.rivals[id];
    if (!r.alive || onlyTheSqueeze(s, id)) continue; // campaign: Vera never goes bust, only the Big Squeeze ends her
    r.brokeDays = r.cash < 0 ? (r.brokeDays ?? 0) + 1 : 0;
    if (r.brokeDays >= BANKRUPT_DAYS) eliminate(s, id, 'bankrupt');
  }
}

// ---------- HQ assault ----------

export function canAssault(s: GameState, id: RivalId, guardIds: string[]): Blocker {
  const hq = HQS[id];
  if (!s.rivals[id].alive) return { ok: false, why: 'Out of the game' };
  if (peaceful(s)) return { ok: false, why: 'Peaceful: no HQ assaults in this Sandbox' };
  if (s.rank < hq.rank) return rankNeed(hq.rank);
  const tilly = tillyWaits(s, id, 'assault'); if (tilly) return tilly;
  const squeeze = squeezeAssault(s, id); // campaign: Sourwood Manor opens with the Big Squeeze, not once she's Weakened
  if (squeeze ? !squeeze.ok : !isWeakened(s, id)) return squeeze ?? { ok: false, why: 'Only once they are Weakened' };
  const ban = raidBan(s); if (ban) return ban; // crew: Sheriff Budd's Citation
  if (s.phase !== 'prep') return { ok: false, why: 'Storm the HQ at Morning Prep' };
  if (!guardIds.length) return { ok: false, why: 'Pick your squad' };
  if (guardIds.length > SQUAD_CAP(s.rank)) return { ok: false, why: `Squad cap is ${SQUAD_CAP(s.rank)}` };
  return { ok: true };
}

export interface AssaultResult { won: boolean; stage: HqStage; reports: BattleReport[] }
export type HqStage = 'gate' | 'yard' | 'boss';
/** An HQ falls in three fights in a row. */
export const HQ_STAGES: HqStage[] = ['gate', 'yard', 'boss'];

function boss(id: RivalId, n: number): Fighter {
  const tier = HQS[id].tier;
  const m = 0.75 + 0.25 * tier;
  return { id: `${id}-boss-${n}`, name: HQS[id].boss, side: 'def', hp: GUARD_BASE.hp * 2.5 * m, hit: 8 * m, chop: 2, nerve: 200, armor: 0.2, weapon: 'clubs', boss: true };
}

/** The squad that storms the gate: picked guards who are fit to fight (breaks any truce). */
export function hqSquad(s: GameState, id: RivalId, guardIds: string[]): Fighter[] {
  breakTruce(s, id);
  return squadFighters(raidSquad(s, guardIds), 'att', raidIsNight(s), id); // crew: a Captain leads the squad; Morning Prep is night
}

/**
 * One stage's fight: who holds it, and in the Boss Room the boss and their move (dice from rng). The campaign's
 * Sourwood Manor is fought as nights' Big Squeeze left it (squeeze.ts): the Gate at its HP and the Yard short its
 * benched elites (squeezedHq); the Stewards the siege added come in with Old Money's call (manorStewards).
 */
export function hqStageInput(s: GameState, id: RivalId, stage: HqStage, squad: Fighter[], rng: Rng): BattleInput {
  const hq = squeezedHq(s, id);
  const size = stage === 'gate' ? 1 + hq.tier : stage === 'yard' ? hq.yard : 1 + Math.ceil(hq.tier / 2);
  const defenders = Array.from({ length: size }, (_, i) => henchmanFor(s, id, Math.min(5, hq.tier + (stage === 'yard' ? 1 : 0)), rng, i));
  let bossMoves: BossMove[] | undefined;
  if (stage === 'boss') {
    const b = boss(id, s.nextId++);
    defenders.unshift(b);
    bossMoves = bossMovesOf(s, id, b.id, rng);
  }
  return {
    attackers: squad, defenders, perimeter: 0, fenceHp: 0, gadgets: [],
    standHp: stage === 'gate' ? hq.gate : 0, objective: stage === 'gate' ? 'smash' : 'shakedown', detected: true,
    ...(bossMoves ? { bossMoves } : {}),
  };
}

/** The boss's move, timed (BOSS_MOVES): it goes off mid-fight. */
function bossMovesOf(s: GameState, id: RivalId, by: string, rng: Rng): BossMove[] {
  switch (id) {
    case 'blenders': { const m = BOSS_MOVES.blenders; return [{ t: m.at, by, type: 'rush', count: m.count, stun: m.stun }]; }
    case 'coldbrew': { const m = BOSS_MOVES.coldbrew; return [{ t: m.at, by, type: 'espresso', seconds: m.seconds, boost: m.boost }]; }
    case 'hollis': { const m = BOSS_MOVES.hollis; return [{ t: m.at, by, type: 'bales', count: m.count, hp: m.hp }]; }
    case 'fizzco': { const m = BOSS_MOVES.fizzco; return [{ t: m.at, by, type: 'takeover', count: m.count }]; }
    case 'sourwood': {
      const m = BOSS_MOVES.sourwood;
      const stewards = Array.from({ length: manorStewards(s, id) }, (_, i) => henchmanFor(s, id, m.tier, rng, 10 + i)); // nights: 3, and one more for each plot the siege took
      return [{ t: m.cane, by, type: 'cane' }, { t: m.at, by, type: 'call', fighters: stewards }];
    }
  }
}

/** Who held the room: its defenders, and the reinforcements a boss's move called in that reached the fight. */
const roomDefenders = (input: BattleInput, res: BattleResult): Fighter[] => [
  ...input.defenders,
  ...(input.bossMoves ?? []).flatMap((m) => (m.type === 'call' ? m.fighters : [])).filter((f) => res.events.some((e) => e.type === 'at' && e.a === f.id)),
];

/**
 * Survivors carry on to the next stage with the HP they had left (spec: "Your squad carries its HP from stage to
 * stage"); the knocked-out and the runners are done for this assault. Weapons come back to hand between stages.
 */
export const hqSurvivors = (input: BattleInput, res: BattleResult): Fighter[] =>
  input.attackers.filter((f) => !res.koed.includes(f.id) && !res.fled.includes(f.id)).map((f) => ({ ...f, hp: res.hpLeft[f.id] ?? f.hp }));

/**
 * A stage is fought: credit the guards and write it up. 'next' when the squad
 * pushes on; a stall or the Boss Room falling ends the assault here.
 */
export function hqStageOver(s: GameState, id: RivalId, stage: HqStage, input: BattleInput, res: BattleResult, reports: BattleReport[]): 'next' | 'won' | 'lost' {
  const hq = HQS[id];
  const plot = hqPlot(id);
  creditGuards(s, input, res);
  const won = res.winner === 'att' && (stage !== 'gate' || res.outcome === 'smashed');
  reports.push({
    day: s.day, attacker: 'player', defender: id, target: plot.id, objective: input.objective,
    outcome: won ? (stage === 'boss' ? 'smashed' : 'damaged') : 'repelled', loot: 0, attackers: input.attackers, defenders: roomDefenders(input, res),
    perimeter: input.perimeter, standLevel: 3, events: res.events, duration: res.duration, koed: res.koed, fled: res.fled, hq: stage,
  });
  if (!won) {
    s.rivals[id].grudge = Math.min(100, s.rivals[id].grudge + 30);
    s.news.push(`HQ assault on ${plot.name} stalls at the ${stage === 'gate' ? 'Gate' : stage === 'yard' ? 'Yard' : 'Boss Room'}. ${hq.boss} laughs it off.`);
    // The squad's KO'd are left behind, from every room it fought through, and each may be Nabbed (captives.ts).
    const earlier = reports.slice(0, -1).flatMap((r) => r.attackers.filter((f) => r.koed.includes(f.id)));
    nabLeftBehind(s, 'player', id, leftBehind(input.attackers, res, earlier), plot.id, res.hatchetKos);
    finish(s, reports);
    return 'lost';
  }
  if (stage !== 'boss') return 'next';
  s.news.push(`${hq.boss} tries "${hq.move}", but it isn't enough. Lottie's crew takes ${plot.name}!`);
  bump(s, 'hqs');
  eliminate(s, id, 'hq');
  finish(s, reports);
  return 'won';
}

/** Three fights in a row, all at once: the Gate, the Yard, the Boss Room. Survivors carry on with the HP they have left. */
export function stormHQ(s: GameState, id: RivalId, guardIds: string[]): AssaultResult | false {
  if (!canAssault(s, id, guardIds).ok) return false;
  let squad = hqSquad(s, id, guardIds);
  const rng = { seed: s.seed };
  const reports: BattleReport[] = [];
  for (const stage of HQ_STAGES) {
    const input = hqStageInput(s, id, stage, squad, rng);
    const res = runBattle(input, rng);
    s.seed = rng.seed;
    const next = hqStageOver(s, id, stage, input, res, reports);
    if (next !== 'next') return { won: next === 'won', stage, reports };
    squad = hqSurvivors(input, res);
  }
  return false; // not reached: the Boss Room always ends it
}

function finish(s: GameState, reports: BattleReport[]) {
  s.battles.unshift(reports[reports.length - 1]);
  s.battles.length = Math.min(s.battles.length, 6);
}

/** For the HUD: a short readout of where a rival stands. */
export function rivalStatus(s: GameState, id: RivalId) {
  const r = s.rivals[id];
  return {
    alive: r.alive, plots: ownedPlots(s, id).length, peak: r.peakPlots, worth: netWorth(s, id),
    weakened: isWeakened(s, id), truce: inTruce(s, id) ? r.truceUntil! : 0, threat: threatLevel(s),
  };
}
