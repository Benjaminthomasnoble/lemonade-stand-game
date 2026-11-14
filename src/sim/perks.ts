// Lottie's Tips (spec "Success Score and ranks"; canon 322): each rank-up deals three of Lottie's Tips and you keep one
// for good. A hand is dealt the moment the rank comes (score.ts rankUp, one hand for each rank crossed) and waits for
// the Rank lesson (Day 5, or at once with lessons off) before it shows: its 'perk' alert stops the skips and pauses
// the game (its own switch in Options), and the hand sits in the feed and the Rank and Perks menu until you pick.
// Hands come in rank order; the next shows once you pick from the one before. A tip held, or on a hand still waiting,
// isn't dealt again, and Peaceful deals no fighting tips. The tips themselves (names, numbers) are in balance.ts; the
// helpers below are each tip's one hook, called where its rule lives. Pure and seeded, like the rest of the sim.
import { LESSON_DAY, SUPPLIES, TIP_CARDS, TIPS, type TipId } from './balance.ts';
import { alert, type Alert } from './alerts.ts';
import { nextRandom } from './rng.ts';
import { peaceful } from './modes.ts';
import type { GameState } from './economy.ts';
import type { BattleInput, Fighter } from './combat.ts';
import type { FactionId } from './map.ts';

/** A rank-up's hand: the rank it came with, its cards, and whether its alert has gone out. */
export interface TipHand { rank: number; cards: TipId[]; told?: boolean }
/** Saved with the story: the tips you keep, and the hands still waiting for a pick (oldest first). */
export interface TipsState { held: TipId[]; hands: TipHand[] }

export const TIP_IDS = Object.keys(TIPS) as TipId[];

const tipsOf = (s: GameState): TipsState | undefined => s.story?.tips;
/** Do you keep this tip? */
export const tipOn = (s: GameState, id: TipId): boolean => !!tipsOf(s)?.held.includes(id);
/** The tips you keep, in the order you picked them. */
export const tipsHeld = (s: GameState): TipId[] => tipsOf(s)?.held ?? [];

/** Hands show once the Rank lesson has come (Day 5), or at once with lessons off (story.ts taught). */
const shown = (s: GameState) => s.settings.lessons === false || s.day >= LESSON_DAY.rank;

/** The hand to pick from now: the oldest one waiting, once hands show. */
export function tipHand(s: GameState): TipHand | null {
  return shown(s) ? tipsOf(s)?.hands[0] ?? null : null;
}

/** What changes when a new hand comes up to pick from (main.ts pauses on it, like the hand's alert). */
export const tipsKey = (s: GameState): string => { const h = tipHand(s); return h ? `${h.rank}` : ''; };

/** Lottie deals with her own dice, seeded from the game's seed and the rank (as the Raid Planner rolls its own): the
 * game's seed doesn't move, so a rank-up's hand never changes who walks by next or how a raid goes. */
const dealDice = (s: GameState, rank: number) => ({ seed: (Math.imul(s.seed ^ 0x5bd1e995, 0x27d4eb2d) + Math.imul(rank, 0x9e3779b9)) | 0 });

/** Deal this rank's hand: three tips you don't keep and no waiting hand holds, none that needs a higher rank, no
 * fighting tips in Peaceful. Fewer when the pool runs low; none once it's empty. Once a rank (a reload deals nothing new). */
export function dealTips(s: GameState, rank: number): void {
  if (!s.story) return;
  const t = (s.story.tips ??= { held: [], hands: [] });
  if (t.hands.some((h) => h.rank === rank)) return;
  const taken = new Set<TipId>([...t.held, ...t.hands.flatMap((h) => h.cards)]);
  const pool = TIP_IDS.filter((id) => !taken.has(id) && (TIPS[id].rank ?? 1) <= rank && !(TIPS[id].fight && peaceful(s)));
  if (!pool.length) return;
  const rng = dealDice(s, rank);
  const cards: TipId[] = [];
  while (cards.length < TIP_CARDS && pool.length) cards.push(pool.splice(Math.floor(nextRandom(rng) * pool.length), 1)[0]);
  t.hands.push({ rank, cards });
}

/** The hand up now gets its alert, once: a major alert, so it stops Finish the day and Sleep till dawn and pauses the
 * game (main.ts). Its card is the hand itself, in the feed (src/ui/perks.ts), so the alert puts no line in the news. */
export function tipAlert(s: GameState): Alert | null {
  const h = tipHand(s);
  if (!h || h.told) return null;
  h.told = true;
  return alert(s, { kind: 'perk', text: `Rank ${h.rank}: pick one of Lottie's tips` }, false);
}

/** Keep one tip from the hand up now: it's yours for good, the other two go back in the pool, and the next hand (if
 * any) comes up. False if that tip isn't in the hand. */
export function pickTip(s: GameState, id: TipId): boolean {
  const h = tipHand(s);
  if (!h || !h.cards.includes(id)) return false;
  const t = tipsOf(s)!;
  t.held.push(id);
  t.hands.shift();
  s.alerts = (s.alerts ?? []).filter((a) => a.kind !== 'perk'); // the hand's alert goes with it
  s.news.push(`Lottie's tip: ${TIPS[id].name}. ${TIPS[id].text}.`);
  return true;
}

/** Saves: tips that don't read right are dropped (an unknown tip, a repeat, a hand with no cards). An older save
 * starts with none, and its past rank-ups deal nothing: hands come with the ranks still to climb. */
export function migrateTips(s: GameState): void {
  const raw = s.story?.tips as Partial<TipsState> | undefined;
  if (raw === undefined) return;
  if (!raw || typeof raw !== 'object') { delete s.story!.tips; return; }
  const known = (id: unknown): id is TipId => typeof id === 'string' && id in TIPS;
  const held = [...new Set(Array.isArray(raw.held) ? raw.held.filter(known) : [])];
  const seen = new Set<TipId>(held);
  const hands: TipHand[] = [];
  for (const h of Array.isArray(raw.hands) ? raw.hands : []) {
    if (!h || typeof h !== 'object' || !Number.isInteger(h.rank) || hands.some((x) => x.rank === h.rank)) continue;
    const cards = (Array.isArray(h.cards) ? h.cards : []).filter((id) => known(id) && !seen.has(id));
    cards.forEach((id) => seen.add(id));
    if (cards.length) hands.push({ rank: h.rank, cards, ...(h.told ? { told: true } : {}) });
  }
  s.story!.tips = { held, hands };
}

// ---------- each tip's hook (1 when you don't keep it) ----------

const up = (s: GameState, id: TipId) => (tipOn(s, id) ? 1 + TIPS[id].value : 1);
const off = (s: GameState, id: TipId) => (tipOn(s, id) ? 1 - TIPS[id].value : 1);
const plus = (s: GameState, id: TipId) => (tipOn(s, id) ? TIPS[id].value : 0);
const yours = (owner: FactionId | null | undefined) => owner === 'player';

/** Sweet Talk: your crowds stand 10% more on price (demand.ts topPriceMods: your stands' ceiling). */
export const sweetTalk = (s: GameState) => up(s, 'sweetTalk');
/** Long Run: a stand campaign runs 50% more days, rounded up (economy.ts startCampaign). */
export const campaignDays = (s: GameState, days: number) => (tipOn(s, 'longRun') ? Math.ceil(days * (1 + TIPS.longRun.value)) : days);
/** Fresh Paint: +5% curb appeal at your stands (demand.ts curbAppeal). */
export const freshPaint = (s: GameState, owner: FactionId | null | undefined) => (yours(owner) ? up(s, 'freshPaint') : 1);
/** Chatty Regulars: +5% foot traffic at your stands, a term in the marketing number (demand.ts MARKETING_TERMS). */
export function chattyRegulars(s: GameState, owner: FactionId, add: (id: string, label: string, traffic: number) => void): void {
  if (yours(owner) && tipOn(s, 'chattyRegulars')) add('chattyRegulars', TIPS.chattyRegulars.name, TIPS.chattyRegulars.value);
}
/** Cool Cellar: days your lemons keep before they spoil (economy.ts, at dawn). */
export const lemonDays = (s: GameState) => (SUPPLIES.lemons.spoilDays ?? 99) + plus(s, 'coolCellar');
/** Gold Stars: Lottie's goals pay 50% more (goals.ts goalReward). */
export const goldStars = (s: GameState) => up(s, 'goldStars');
/** Good Dirt: open land costs 10% less (economy.ts plotPrice). */
export const goodDirt = (s: GameState) => off(s, 'goodDirt');
/** Firm Handshake: Plot and Faction Buyouts cost 15% less (rivals.ts). */
export const firmHandshake = (s: GameState) => off(s, 'firmHandshake');
/** Sharp Pencil: an auction you win costs 10% less (auction.ts bidCost). */
export const sharpPencil = (s: GameState) => off(s, 'sharpPencil');
/** Handy Hands: repairs to your buildings cost 25% less (damage.ts repairCost). */
export const handyHands = (s: GameState, owner: FactionId | null | undefined) => (yours(owner) ? off(s, 'handyHands') : 1);
/** Steady Pour: the Bottling Works fill 10% more a day (vip.ts bottlingCapacity). */
export const steadyPour = (s: GameState) => up(s, 'steadyPour');
/** Chicken Soup: a knocked-out guard of yours is back a day sooner (clubhouse.ts koDays). */
export const chickenSoup = (s: GameState) => plus(s, 'chickenSoup');
/** Light Sleeper: word of a raid on you comes 30 game minutes sooner (night.ts, with the Grapevine's hour). */
export const lightSleeper = (s: GameState) => plus(s, 'lightSleeper');
/** Nosy Neighbors: +10 points on the chance a raid on your plot is spotted (crew.ts detectionChance, before the cap). */
export const nosyNeighbors = (s: GameState, mine: boolean) => (mine ? plus(s, 'nosyNeighbors') : 0);
/** Lockbox: a Shakedown of your stand takes 25% less (loot.ts shakedownLoot). */
export const lockbox = (s: GameState, owner: FactionId | null | undefined) => (yours(owner) ? off(s, 'lockbox') : 1);
/** Quick Study: your guards' fight XP, ×1.5 (crew.ts creditGuards). */
export const quickStudy = (s: GameState) => up(s, 'quickStudy');
/** Help Wanted: the Hiring Hall's recruits, one more at each refresh (crew.ts refreshRecruits). */
export const helpWanted = (s: GameState) => plus(s, 'helpWanted');
/** Family Rates: what a recruit costs to hire, 25% less (crew.ts canHire and hireGuard, the Hiring Hall's button). */
export const hireFee = (s: GameState, g: { fee: number }) => Math.round(g.fee * off(s, 'familyRates'));
/** Let It Go: a rival's Grudge against you cools twice as fast (rivalAi.ts coolGrudges). */
export const letItGo = (s: GameState, at: FactionId) => (yours(at) ? up(s, 'letItGo') : 1);
/** Low Profile: a boss's Attention on you, 20% less (rivalAi.ts attentionOf). */
export const lowProfile = (s: GameState) => off(s, 'lowProfile');

/** Elbow Grease: your raiders chop 15% harder (raids and HQ assaults). New fighters: a squad's are reused. */
export const elbowGrease = (s: GameState, fighters: Fighter[]): Fighter[] =>
  (tipOn(s, 'elbowGrease') ? fighters.map((f) => ({ ...f, chop: f.chop * up(s, 'elbowGrease') })) : fighters);

/**
 * The fighting tips, on one raid's fight as it's set up (crew.ts battleInput): Elbow Grease on your raiders; on a plot
 * of yours, Porch Light (+20% HP to its defenders at night), Pep Talk (+10 Nerve to the guards on post) and the Goose
 * Whistle (your goose stuns twice). The guards the Bell brings get their Porch Light as they come (porchLit).
 */
export function tipsInFight(s: GameState, raid: { attacker: FactionId; target: string }, night: boolean, input: BattleInput): BattleInput {
  if (raid.attacker === 'player') return { ...input, attackers: elbowGrease(s, input.attackers) };
  if (s.plots[raid.target]?.owner !== 'player') return input;
  const hp = night ? up(s, 'porchLight') : 1, nerve = plus(s, 'pepTalk');
  const defenders = hp === 1 && !nerve ? input.defenders : input.defenders.map((f) => ({ ...f, hp: f.hp * hp, nerve: f.nerve + nerve }));
  return { ...input, defenders, ...(tipOn(s, 'gooseWhistle') ? { gooseStuns: TIPS.gooseWhistle.value } : {}) };
}

/** Porch Light on the guards Ring the Bell brings (reinforce.ts): they defend your plot, so at night they get its +20%
 * HP like the guards on post there. Pep Talk stays with the guards on post. */
export function porchLit(s: GameState, fighters: Fighter[], night: boolean): Fighter[] {
  const hp = night ? up(s, 'porchLight') : 1;
  return hp === 1 ? fighters : fighters.map((f) => ({ ...f, hp: f.hp * hp }));
}
