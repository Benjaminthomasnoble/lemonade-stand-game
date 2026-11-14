import { describe, expect, it } from 'vitest';
import {
  attentionOf, bidCost, bottlingCapacity, canHire, CLOSE, curbAppeal, detectionChance, expectedPassersby, factionBuyoutPrice,
  buildClubhouse, hhmm, hireGuard, LOTTIES_CORNER, marketingTerms, migrateSave, newGame, nightStep, openStands, plotBuyoutPrice, plotPrice,
  PLOTS, priceCeiling, raidInput, raidPartyFor, RANKS, RECRUIT_POOL, refreshRecruits, repairCost, rivalDawn, simulateRestOfDay,
  sleepUntilDawn, startCampaign, startNight, successScore, tickMinute, TIP_CARDS, TIPS, upgradeStand, lemonsExpiringTomorrow,
  type GameState, type Guard, type Raid, type RivalId, type Settings, type TipId,
} from './economy.ts';
import { creditGuards, guardFighter } from './crew.ts';
import { startFight, watchFights } from './fight.ts';
import { ringTheBell } from './reinforce.ts';
import { koDays } from './clubhouse.ts';
import { shakedownLoot } from './loot.ts';
import { goalReward } from './goals.ts';
import { dealTips, migrateTips, pickTip, TIP_IDS, tipAlert, tipHand, tipsInFight, tipsKey } from './perks.ts';
import { scoreCheck } from './score.ts';
import { storyAfterAct } from './story.ts';
import type { BattleInput, Fighter } from './combat.ts';
import { perksSheet, perksTicket } from '../ui/perks.ts';

const game = (seed: number, settings: Partial<Settings> = {}) => newGame(seed, { lessons: false, ...settings });
/** Cash to put the score `by` dollars past `target`. */
const lift = (s: GameState, target: number, by = 1) => { s.cash += target - successScore(s) + by; };
/** Keep these tips (no hands waiting). */
const hold = (s: GameState, ...ids: TipId[]) => { s.story!.tips = { held: ids, hands: [] }; };
const hands = (s: GameState) => s.story!.tips?.hands ?? [];
const fighter = (id: string, side: 'att' | 'def', over: Partial<Fighter> = {}): Fighter =>
  ({ id, name: id, side, hp: 100, hit: 10, chop: 10, nerve: 50, armor: 0, weapon: 'fists', ...over });
const guard = (id: string, post: string | null, over: Partial<Guard> = {}): Guard =>
  ({ id, name: `Test ${id}`, trait: 'Loyal', level: 1, xp: 0, weapon: 'fists', gear: 'none', post, outUntil: 0, fee: 200, ...over }) as Guard;

describe("Lottie's Tips: a hand at each rank-up", () => {
  it('deals one hand of three for each rank crossed, every card different, none you keep', () => {
    const s = game(1);
    expect(hands(s)).toEqual([]);
    lift(s, RANKS[5].ss); // Rank 1 to 6 in one go
    scoreCheck(s);
    expect(s.rank).toBe(6);
    expect(hands(s).map((h) => h.rank)).toEqual([2, 3, 4, 5, 6]);
    const cards = hands(s).flatMap((h) => h.cards);
    expect(hands(s).every((h) => h.cards.length === TIP_CARDS)).toBe(true);
    expect(new Set(cards).size).toBe(cards.length);
    for (const h of hands(s)) for (const id of h.cards) expect(TIPS[id].rank ?? 1).toBeLessThanOrEqual(h.rank); // nothing it can't use yet
  });

  it('is seeded: the same run deals the same hands, and dealing a rank twice deals nothing new', () => {
    const deal = (seed: number) => { const s = game(seed); lift(s, RANKS[3].ss); scoreCheck(s); return JSON.stringify(hands(s)); };
    expect(deal(2)).toBe(deal(2));
    expect(new Set([2, 3, 4, 5, 6].map(deal)).size).toBeGreaterThan(1);
    const s = game(2);
    lift(s, RANKS[1].ss);
    scoreCheck(s);
    const once = JSON.stringify(hands(s));
    dealTips(s, 2);
    expect(JSON.stringify(hands(s))).toBe(once);
  });

  it('deals each rank once: a rank set back by hand and climbed again brings no second hand', () => {
    const s = game(5);
    lift(s, RANKS[2].ss);
    scoreCheck(s);
    expect(hands(s).map((h) => h.rank)).toEqual([2, 3]);
    while (tipHand(s)) pickTip(s, tipHand(s)!.cards[0]);
    s.rank = 1; // set back by hand (a sandbox, a test), then the score climbs again
    scoreCheck(s);
    expect(s.rank).toBe(3);
    expect(hands(s)).toEqual([]);
    expect(s.story!.tips!.held).toHaveLength(2);
    lift(s, RANKS[3].ss);
    scoreCheck(s);
    expect(hands(s).map((h) => h.rank)).toEqual([4]); // a new rank still deals
    // A save from before the mark: every rank up to the one it's at counts as dealt, and any waiting hand's.
    const old = JSON.parse(JSON.stringify(s)) as GameState;
    delete old.story!.tips!.dealt;
    old.rank = 3;
    migrateTips(old);
    expect(old.story!.tips!.dealt).toBe(4);
    delete old.story!.tips!.dealt;
    old.story!.tips!.hands = [];
    migrateTips(old);
    expect(old.story!.tips!.dealt).toBe(3);
    migrateTips(old);
    expect(old.story!.tips!.dealt).toBe(3); // idempotent
  });

  it('never deals a fighting tip in Peaceful, and runs dry gracefully', () => {
    const s = game(3, { mode: 'sandbox', peaceful: true });
    lift(s, RANKS[8].ss);
    scoreCheck(s);
    const cards = hands(s).flatMap((h) => h.cards);
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.some((id) => TIPS[id].fight)).toBe(false);
    const dry = game(4);
    dry.story!.tips = { held: TIP_IDS.slice(2), hands: [] }; // two left
    dealTips(dry, 2);
    dealTips(dry, 3);
    expect(hands(dry).map((h) => h.cards.length)).toEqual([2]);
  });
});

describe("Lottie's Tips: when a hand shows", () => {
  it('waits for the Rank lesson (Day 5); that dawn its alert lands', () => {
    const s = newGame(5); // lessons on
    s.day = 2;
    lift(s, RANKS[1].ss, 100);
    expect(scoreCheck(s)).toBeNull();
    expect(s.rank).toBe(2);
    expect(hands(s)).toHaveLength(1);
    expect(tipHand(s)).toBeNull();
    expect(tipsKey(s)).toBe('');
    expect(perksTicket(s, '')).toBe('');
    s.day = 4;
    s.phase = 'report';
    s.minute = CLOSE;
    sleepUntilDawn(s);
    expect(s.day).toBe(5);
    expect(tipHand(s)?.rank).toBe(2);
    expect(tipsKey(s)).toBe('2');
    expect((s.alerts ?? []).filter((a) => a.kind === 'perk')).toHaveLength(1);
    expect(perksTicket(s, '')).toContain('data-testid="tips"');
  });

  it("is a major alert: it stops Finish the day, once, and stays out of the news", () => {
    const s = game(6);
    openStands(s);
    for (let i = 0; i < 5; i++) tickMinute(s);
    lift(s, RANKS[2].ss); // Rank 3: two hands
    const news = s.news.length;
    const ev = simulateRestOfDay(s, true);
    expect(s.phase).toBe('open');
    expect(ev.filter((e) => e.type === 'alert' && e.alert.kind === 'perk')).toHaveLength(1);
    expect(s.news.slice(news).some((n) => n.includes("Lottie's tips"))).toBe(false);
    simulateRestOfDay(s, true); // the second hand waits its turn: no stop for it
    expect(s.phase).toBe('report');
  });

  it('a tap that ranks you up brings its hand up at once', () => {
    const s = game(7);
    lift(s, RANKS[1].ss);
    storyAfterAct(s);
    expect(tipHand(s)?.rank).toBe(2);
    expect((s.alerts ?? []).some((a) => a.kind === 'perk')).toBe(true);
  });
});

describe("Lottie's Tips: keeping one", () => {
  it('keeps one for good, puts the other two back, and brings the next hand up with its own alert', () => {
    const s = game(8);
    lift(s, RANKS[2].ss);
    scoreCheck(s);
    const [first, second] = hands(s);
    expect(pickTip(s, second.cards[0])).toBe(false); // not in the hand up now
    expect(pickTip(s, first.cards[1])).toBe(true);
    expect(s.story!.tips!.held).toEqual([first.cards[1]]);
    expect(s.news.at(-1)).toContain(TIPS[first.cards[1]].name);
    expect((s.alerts ?? []).some((a) => a.kind === 'perk')).toBe(false);
    expect(tipHand(s)).toBe(second);
    expect(tipAlert(s)?.text).toContain('Rank 3');
    expect(tipAlert(s)).toBeNull(); // once
    expect(pickTip(s, second.cards[2])).toBe(true);
    expect(tipHand(s)).toBeNull();
    // The two left behind can come round again.
    dealTips(s, 4);
    const pool = hands(s)[0].cards;
    expect(pool.some((id) => s.story!.tips!.held.includes(id))).toBe(false);
  });

  it('the Rank and Perks menu shows the hand and the tips you keep', () => {
    const s = game(9);
    lift(s, RANKS[1].ss);
    scoreCheck(s);
    const card = hands(s)[0].cards[0];
    expect(perksSheet(s)).toContain(`data-testid="tip-${card}"`);
    pickTip(s, card);
    expect(perksSheet(s)).toContain(TIPS[card].name);
    expect(perksSheet(s)).not.toContain('data-action="tip"');
  });

  it('saves with the run; tips that do not read right are dropped; an older save starts with none', () => {
    const s = game(10);
    lift(s, RANKS[2].ss);
    scoreCheck(s);
    pickTip(s, hands(s)[0].cards[0]);
    const back = migrateSave(JSON.parse(JSON.stringify(s)))!;
    expect(back.story!.tips).toEqual(s.story!.tips);
    const odd = JSON.parse(JSON.stringify(s));
    odd.story.tips = { held: ['sweetTalk', 'sweetTalk', 'nope'], hands: [{ rank: 4, cards: ['sweetTalk', 'longRun', 7] }, { rank: 'x', cards: ['goodDirt'] }, { rank: 5, cards: [] }] };
    expect(migrateSave(odd)!.story!.tips).toEqual({ held: ['sweetTalk'], hands: [{ rank: 4, cards: ['longRun'] }], dealt: 4 });
    const old = JSON.parse(JSON.stringify(s));
    delete old.story.tips;
    expect(migrateSave(old)!.story!.tips).toBeUndefined();
    const junk = JSON.parse(JSON.stringify(s));
    junk.story.tips = 'x';
    migrateTips(junk);
    expect(junk.story.tips).toBeUndefined();
  });
});

describe("Lottie's Tips: what each one does", () => {
  const rival = (s: GameState) => PLOTS.find((p) => s.plots[p.id].owner && s.plots[p.id].owner !== 'player' && s.plots[p.id].stand)!.id;

  it('Sweet Talk, Fresh Paint and Chatty Regulars: price tolerance, curb appeal and foot traffic at your stands', () => {
    const s = game(11);
    const ceiling = priceCeiling(s, LOTTIES_CORNER), curb = curbAppeal(s, LOTTIES_CORNER), walk = expectedPassersby(s, LOTTIES_CORNER);
    const theirs = rival(s), theirCurb = curbAppeal(s, theirs);
    hold(s, 'sweetTalk', 'freshPaint', 'chattyRegulars');
    expect(priceCeiling(s, LOTTIES_CORNER)).toBeGreaterThan(ceiling * 1.09);
    expect(priceCeiling(s, LOTTIES_CORNER)).toBeLessThanOrEqual(ceiling * 1.1 + 1e-9);
    expect(curbAppeal(s, LOTTIES_CORNER)).toBeCloseTo(curb * 1.05, 6);
    expect(curbAppeal(s, theirs)).toBe(theirCurb);
    expect(marketingTerms(s, 'player', s.plots[LOTTIES_CORNER].stand!, LOTTIES_CORNER).find((t) => t.id === 'chattyRegulars')?.traffic).toBe(0.05);
    expect(marketingTerms(s, s.plots[theirs].owner!, s.plots[theirs].stand!, theirs).some((t) => t.id === 'chattyRegulars')).toBe(false);
    expect(expectedPassersby(s, LOTTIES_CORNER)).toBeGreaterThan(walk);
  });

  it('Long Run: a campaign runs 50% more days, rounded up', () => {
    const s = game(12);
    s.phase = 'prep';
    hold(s, 'longRun');
    startCampaign(s, 'sandwichBoard', LOTTIES_CORNER);
    expect(s.plots[LOTTIES_CORNER].stand!.campaigns.sandwichBoard).toBe(2);
  });

  it('Cool Cellar: lemons keep 2 days longer', () => {
    const s = game(13);
    const st = s.plots[LOTTIES_CORNER].stand!;
    st.inventory.lemons = [{ qty: 10, day: s.day + 10 - 2, unitCost: 0.2 }];
    s.day += 10;
    expect(lemonsExpiringTomorrow(s, st)).toBe(10);
    hold(s, 'coolCellar');
    expect(lemonsExpiringTomorrow(s, st)).toBe(0);
    st.inventory.lemons[0].day -= 2;
    expect(lemonsExpiringTomorrow(s, st)).toBe(10);
  });

  it("Gold Stars: Lottie's goals pay 50% more", () => {
    const s = game(14);
    s.history = [{ ...s.today, day: 1, revenue: 1000 }] as GameState['history'];
    expect(goalReward(s, 'long')).toBe(500);
    hold(s, 'goldStars');
    expect(goalReward(s, 'long')).toBe(750);
  });

  it('Good Dirt, Firm Handshake and Sharp Pencil: land, buyouts and auction wins cost less', () => {
    const s = game(15);
    s.rank = 6;
    const open = PLOTS.find((p) => !s.plots[p.id].owner && p.type === 'street')!.id, theirs = rival(s);
    const ids = Object.keys(s.rivals) as RivalId[];
    const land = plotPrice(s, open), buyout = plotBuyoutPrice(s, theirs), bid = bidCost(s, 1000);
    const whole = ids.map((id) => factionBuyoutPrice(s, id));
    hold(s, 'goodDirt', 'firmHandshake', 'sharpPencil');
    expect(plotPrice(s, open)).toBeCloseTo(land * 0.9, -1);
    expect(plotBuyoutPrice(s, theirs)).toBeCloseTo(buyout * 0.85, -1);
    expect(bidCost(s, 1000)).toBe(Math.round(bid * 0.9));
    ids.forEach((id, i) => { const was = whole[i]; if (was === null) expect(factionBuyoutPrice(s, id)).toBeNull(); else expect(factionBuyoutPrice(s, id)).toBeCloseTo(was * 0.85, -1); });
  });

  it('Handy Hands: repairs to your buildings cost 25% less', () => {
    const s = game(16);
    s.rank = 6; s.cash = 100000; s.phase = 'prep';
    upgradeStand(s, LOTTIES_CORNER);
    upgradeStand(s, LOTTIES_CORNER);
    s.plots[LOTTIES_CORNER].stand!.hp = 400;
    const full = repairCost(s, LOTTIES_CORNER);
    expect(full).toBeGreaterThan(0);
    hold(s, 'handyHands');
    expect(repairCost(s, LOTTIES_CORNER)).toBeCloseTo(full * 0.75, -1);
  });

  it('Steady Pour: the Bottling Works fill 10% more a day', () => {
    const s = game(17);
    const site = PLOTS.find((p) => !s.plots[p.id].owner && p.type === 'street')!.id;
    s.plots[site].owner = 'player';
    s.plots[site].facility = { kind: 'bottling', level: 1 };
    const cap = bottlingCapacity(s);
    expect(cap).toBeGreaterThan(0);
    hold(s, 'steadyPour');
    expect(bottlingCapacity(s)).toBe(Math.round(cap * 1.1));
  });

  it('Chicken Soup, Quick Study, Help Wanted and Family Rates: the crew', () => {
    const s = game(18);
    s.rank = 2;
    expect([koDays(s, false), koDays(s, true)]).toEqual([1, 2]);
    s.guards = [guard('g1', LOTTIES_CORNER)];
    const input: BattleInput = { attackers: [fighter('g1', 'att')], defenders: [], perimeter: 0, fenceHp: 0, gadgets: [], standHp: 100, objective: 'smash', detected: false } as unknown as BattleInput;
    creditGuards(s, input, { koed: [], winner: 'att' });
    expect(s.guards[0].xp).toBe(2);
    hold(s, 'chickenSoup', 'quickStudy', 'helpWanted', 'familyRates');
    expect([koDays(s, false), koDays(s, true)]).toEqual([0, 1]);
    creditGuards(s, input, { koed: [], winner: 'att' });
    expect(s.guards[0].xp).toBe(5);
    refreshRecruits(s, true);
    expect(s.recruits).toHaveLength(RECRUIT_POOL + 1);
    const g = s.recruits[0];
    s.cash = 10000;
    expect(canHire(s, g.id).ok).toBe(true);
    expect(hireGuard(s, g.id)).toBe(true);
    expect(10000 - s.cash).toBe(Math.round(g.fee * 0.75));
  });

  it('Porch Light, Pep Talk, Goose Whistle and Elbow Grease: in the fight', () => {
    const s = game(19);
    const theirs = rival(s);
    const input = (): BattleInput => ({ attackers: [fighter('a', 'att')], defenders: [fighter('d', 'def')], perimeter: 0, fenceHp: 0, gadgets: ['goose'], standHp: 100, objective: 'smash', detected: false } as unknown as BattleInput);
    const onYou = { attacker: 'blenders' as const, target: LOTTIES_CORNER }, yours = { attacker: 'player' as const, target: theirs };
    expect(tipsInFight(s, onYou, true, input())).toEqual(input());
    hold(s, 'porchLight', 'pepTalk', 'gooseWhistle', 'elbowGrease');
    const night = tipsInFight(s, onYou, true, input());
    expect(night.defenders[0]).toMatchObject({ hp: 120, nerve: 60 });
    expect(night.gooseStuns).toBe(2);
    expect(night.attackers[0].chop).toBe(10); // theirs chop as ever
    expect(tipsInFight(s, onYou, false, input()).defenders[0]).toMatchObject({ hp: 100, nerve: 60 }); // the porch light is for the night
    const raid = tipsInFight(s, yours, true, input());
    expect(raid.attackers[0].chop).toBeCloseTo(11.5, 6);
    expect(raid.defenders[0]).toMatchObject({ hp: 100, nerve: 50 });
    // Through the raid's own setup: a guard posted at the Corner, a raid on it at night.
    s.guards = [guard('g1', LOTTIES_CORNER)];
    const r: Raid = { id: 'r1', attacker: 'blenders', target: LOTTIES_CORNER, objective: 'smash', party: raidPartyFor(s, 'blenders'), detected: true, eta: hhmm(23 * 60) };
    const lit = raidInput(s, r, true, { seed: 1 }).defenders.find((f) => f.id === 'g1')!;
    hold(s);
    const dark = raidInput(s, r, true, { seed: 1 }).defenders.find((f) => f.id === 'g1')!;
    expect(lit.hp).toBeCloseTo(dark.hp * 1.2, 6);
    expect(lit.nerve).toBe(dark.nerve + 10);
  });

  it('Porch Light: the guards who answer the Bell get it too, at night, coming before the fight or during it', () => {
    const at = (tips: TipId[], night: boolean) => {
      const s = game(19);
      s.rank = 7; s.cash = 1e6;
      const club = PLOTS.find((p) => p.type === 'street' && p.district === 'maple' && !s.plots[p.id].owner)!.id;
      s.plots[club].owner = 'player';
      expect(buildClubhouse(s, club)).toBe(true);
      s.guards = [guard('g1', LOTTIES_CORNER), guard('b1', null, { club }), guard('b2', null, { club })];
      hold(s, ...tips);
      const r: Raid = { id: 'r1', attacker: 'blenders', target: LOTTIES_CORNER, objective: 'smash', party: raidPartyFor(s, 'blenders'), detected: true, eta: hhmm(23 * 60) };
      // Rung in time: one there at contact, one 30 minutes out.
      r.bell = [{ id: 'b1', at: s.minute }, { id: 'b2', at: s.minute + 30 }];
      const input = raidInput(s, r, night, { seed: 1 });
      const there = input.defenders.find((f) => f.id === 'b1')!, later = input.joins![0].fighters.find((f) => f.id === 'b2')!;
      // Rung while the fight is on: they join as they come.
      delete r.bell;
      watchFights(true);
      try {
        expect(startFight(s, r, night)).toBe(true);
        expect(ringTheBell(s, r.id)).toBe(true);
        const live = s.fight!.commands.flatMap((c) => (c.type === 'join' ? c.fighters : []));
        return { there, later, live: live.map((f) => f.hp), base: guardFighter(s.guards[1], 'def', night, 'blenders') };
      } finally { watchFights(false); }
    };
    const lit = at(['porchLight', 'pepTalk'], true), dark = at([], true), day = at(['porchLight', 'pepTalk'], false);
    expect(lit.there.hp).toBeCloseTo(dark.there.hp * 1.2, 6);
    expect(lit.later.hp).toBeCloseTo(dark.later.hp * 1.2, 6);
    expect(lit.live).toEqual(dark.live.map((hp) => expect.closeTo(hp * 1.2, 6)));
    expect(dark.live).toEqual([dark.base.hp, dark.base.hp]);
    expect(lit.there.nerve).toBe(dark.there.nerve); // Pep Talk is for the guards on post
    expect(day.there.hp).toBe(day.base.hp); // the porch light is for the night
    expect(day.live).toEqual([day.base.hp, day.base.hp]);
  });

  it('Light Sleeper: word of a raid on you comes half an hour sooner', () => {
    const warned = (tip: boolean) => {
      const s = game(20);
      s.phase = 'report'; s.minute = CLOSE; s.raids = [];
      if (tip) hold(s, 'lightSleeper');
      const r: Raid = { id: 't1', attacker: 'blenders', target: LOTTIES_CORNER, objective: 'shakedown', party: raidPartyFor(s, 'blenders'), detected: true, eta: hhmm(24 * 60), leave: 23 * 60, at: 24 * 60 };
      s.raids.push(r);
      startNight(s);
      while (!r.warned && s.minute < 24 * 60) nightStep(s);
      return s.minute;
    };
    expect(warned(false)).toBe(23 * 60);
    expect(warned(true)).toBe(22 * 60 + 30);
  });

  it('Nosy Neighbors and Lockbox: raids on your plots are spotted more and take less', () => {
    const s = game(21);
    const theirs = rival(s);
    const seen = detectionChance(s, LOTTIES_CORNER, false), seenThere = detectionChance(s, theirs, false);
    s.plots[LOTTIES_CORNER].stand!.lastProfit = 100;
    s.plots[theirs].stand!.lastProfit = 100;
    const loot = shakedownLoot(s, LOTTIES_CORNER), lootThere = shakedownLoot(s, theirs);
    hold(s, 'nosyNeighbors', 'lockbox');
    expect(detectionChance(s, LOTTIES_CORNER, false)).toBeCloseTo(seen + 0.1, 6);
    expect(detectionChance(s, theirs, false)).toBe(seenThere);
    expect(shakedownLoot(s, LOTTIES_CORNER)).toBe(Math.round(loot * 0.75 * 100) / 100);
    expect(shakedownLoot(s, theirs)).toBe(lootThere);
  });

  it("Let It Go and Low Profile: rivals' Grudge cools faster and their Attention drops", () => {
    const cooled = (tip: boolean) => {
      const s = game(22);
      if (tip) hold(s, 'letItGo');
      s.rivals.blenders.grudge = 20;
      s.rivals.blenders.grudgeSeen = { player: 20 };
      rivalDawn(s, 'blenders', { seed: 1 });
      return s.rivals.blenders.grudge;
    };
    expect(cooled(false)).toBe(19);
    expect(cooled(true)).toBe(18);
    const s = game(23);
    s.rivals.blenders.grudge = 40;
    const was = attentionOf(s, 'blenders');
    hold(s, 'lowProfile');
    expect(attentionOf(s, 'blenders')).toBeCloseTo(was * 0.8, 1);
  });
});
