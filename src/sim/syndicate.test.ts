import { describe, expect, it } from 'vitest';
import {
  actOf, CLOSE, eliminate, hqPlot, migrateSave, newGame, pactHeadline, sleepUntilDawn, SYNDICATE_CALL, syndicateAtDawn, syndicateFormed,
  syndicateLeader, syndicateMembers, threatLevel, type Difficulty, type GameState, type Mode,
  deliveryRaidChance, festivalDays, HQS, newStand, onYou, planNight, PLOTS, raidsCounted, weeklyRaids, type Order, type Raid, type RivalId,
  bugleHeadline,
} from './economy.ts';
import { CALL_PRIORITY } from './phone.ts';
import { RIVAL_SABOTAGE } from './balance.ts';

/** Day 60's Evening in a Sandbox where the Syndicate formed a week ago, every member flush, with `stands` stands of yours. */
function pactEvening(difficulty: Difficulty, seed = 3, stands = 8): GameState {
  const s = newGame(seed, { mode: 'sandbox', difficulty });
  Object.assign(s, { phase: 'report', minute: CLOSE, raids: [], day: 60, rank: difficulty === 'cutthroat' ? 7 : 9, tutorialRaidDone: true });
  s.syndicate = { formed: 53 };
  for (const id of Object.keys(s.rivals) as RivalId[]) Object.assign(s.rivals[id], { cash: 1e7, budget: { grow: 0, guard: 0, strike: 1e6 } });
  const side = PLOTS.filter((p) => (p.district === 'maple' || p.district === 'oldtown') && p.type === 'street' && !s.plots[p.id].owner);
  for (const p of side.slice(0, stands - 1)) s.plots[p.id] = { ...s.plots[p.id], owner: 'player', stand: newStand(2) };
  return s;
}
/** Plan many nights from one Evening: tonight's raids on you. */
function strikes(base: GameState, n: number): Raid[][] {
  const out: Raid[][] = [];
  for (let i = 0; i < n; i++) {
    const s = structuredClone(base);
    s.seed = (i * 2654435761 + 12345) | 0;
    planNight(s);
    out.push(s.raids.filter((r) => onYou(s, r)));
  }
  return out;
}
const groups = (raids: Raid[]) => [...new Set(raids.map((r) => r.group ?? r.id))].map((g) => raids.filter((r) => (r.group ?? r.id) === g));

/** A run on Day 60 at a rank (Syndicate checks happen at dawn). */
function run(mode: Mode, difficulty: Difficulty, rank: number, extra: Partial<GameState['settings']> = {}): GameState {
  const s = newGame(7, { mode, difficulty, ...extra });
  s.day = 60;
  s.rank = rank;
  return s;
}
const formsAt = (mode: Mode, difficulty: Difficulty, rank: number, extra = {}) => {
  const s = run(mode, difficulty, rank, extra);
  syndicateAtDawn(s);
  return syndicateFormed(s);
};

describe('the Syndicate forms', () => {
  it('in Sandbox and Endless at Threat 5, Threat 4 on Cutthroat, Rank 9 on Laid Back (its Threat stops at 4)', () => {
    for (const mode of ['sandbox', 'endless'] as Mode[]) {
      expect([formsAt(mode, 'classic', 8), formsAt(mode, 'classic', 9)]).toEqual([false, true]);
      expect([formsAt(mode, 'custom', 8), formsAt(mode, 'custom', 9)]).toEqual([false, true]);
      expect([formsAt(mode, 'cutthroat', 6), formsAt(mode, 'cutthroat', 7)]).toEqual([false, true]);
      expect([formsAt(mode, 'laidback', 8), formsAt(mode, 'laidback', 9)]).toEqual([false, true]);
    }
    expect(threatLevel(run('sandbox', 'cutthroat', 7))).toBe(4);
    expect(threatLevel(run('sandbox', 'laidback', 10))).toBe(4);
    expect(formsAt('sandbox', 'classic', 10, { peaceful: true })).toBe(false); // no raids, no Syndicate
  });

  it("in the campaign two weeks into Act 5 (story's act, which turns at FizzCo's fall) on every difficulty, whatever the Threat or rank", () => {
    for (const difficulty of ['laidback', 'classic', 'cutthroat'] as Difficulty[]) {
      const s = run('campaign', difficulty, 9);
      s.story = { act: 4, since: 40 };
      syndicateAtDawn(s);
      expect(threatLevel(s)).toBeGreaterThanOrEqual(4);
      expect(syndicateFormed(s)).toBe(false); // Threat 5 (Cutthroat's 4) and Laid Back's Rank 9 are the Sandbox rules
      s.story = { act: 5, since: 60 };
      expect(actOf(s)).toBe(5);
      for (; s.day < 74; s.day++) { syndicateAtDawn(s); expect(syndicateFormed(s)).toBe(false); }
      syndicateAtDawn(s);
      expect(s.syndicate).toEqual({ formed: 74 });
    }
  });

  it('at dawn, from the night before, and once: Vera signs everyone up, the Bugle says so, and the save keeps it', () => {
    const s = run('sandbox', 'classic', 9);
    Object.assign(s, { phase: 'report', minute: CLOSE, raids: [] });
    expect(sleepUntilDawn(s)).toBe(true);
    expect(s.syndicate?.formed).toBe(61);
    const card = s.alerts!.find((a) => a.text === pactHeadline('sourwood'))!;
    expect(card).toMatchObject({ kind: 'note', plot: hqPlot('sourwood').id, day: 61 });
    expect(card.text).toBe('Bugle: PACT IS BACK: SOURWOOD SIGNS UP EVERYONE BUT THE KID');
    expect(s.phone!.queue[0]).toMatchObject({ who: 'sourwood', text: SYNDICATE_CALL, priority: CALL_PRIORITY.story }); // rings at a lull
    expect(syndicateMembers(s)).toHaveLength(5);
    expect(bugleHeadline(s)).toEqual(['PACT IS BACK', 'Sourwood signs up everyone but the kid']); // it leads that morning's paper
    s.day++;
    syndicateAtDawn(s);
    expect(bugleHeadline(s)[0]).not.toBe('PACT IS BACK');
    expect(s.alerts!.filter((a) => a.text.startsWith('Bugle: PACT IS BACK'))).toHaveLength(1);
    expect(s.syndicate?.formed).toBe(61);
    expect(migrateSave(JSON.parse(JSON.stringify(s)))!.syndicate).toEqual({ formed: 61 });
    const old = JSON.parse(JSON.stringify(run('sandbox', 'classic', 3)));
    expect(migrateSave(old)!.syndicate).toBeUndefined(); // older saves: not formed, nothing to fill in
  });

  it('each rival you eliminate shrinks it; without Vera the biggest boss left signs them up', () => {
    const s = run('sandbox', 'classic', 9);
    eliminate(s, 'sourwood', 'bankrupt');
    eliminate(s, 'blenders', 'bankrupt');
    syndicateAtDawn(s);
    expect(syndicateLeader(s)).toBe('fizzco');
    expect(syndicateMembers(s)).toEqual(['hollis', 'fizzco', 'coldbrew']);
    expect(s.alerts!.some((a) => a.text === 'Bugle: PACT IS BACK: FIZZCO SIGNS UP EVERYONE BUT THE KID')).toBe(true);
    expect(s.phone!.queue[0]).toMatchObject({ who: 'fizzco', text: '', mood: 'warn', priority: CALL_PRIORITY.story }); // his own warning
    for (const id of ['hollis', 'fizzco', 'coldbrew'] as const) eliminate(s, id, 'bankrupt');
    expect(syndicateMembers(s)).toEqual([]);
    const late = run('sandbox', 'classic', 9);
    for (const id of Object.keys(late.rivals) as (keyof typeof late.rivals)[]) late.rivals[id].alive = false;
    syndicateAtDawn(late);
    expect(syndicateFormed(late)).toBe(false); // nobody left to sign up
  });
});

describe("the Syndicate's strikes", () => {
  it('come 6 a week on Classic, 3 on Laid Back and 9 on Cutthroat', () => {
    for (const [difficulty, want] of [['classic', 6], ['laidback', 3], ['cutthroat', 9]] as [Difficulty, number][]) {
      const base = pactEvening(difficulty);
      expect(weeklyRaids(base)).toBeCloseTo(want);
      const perWeek = strikes(base, 700).reduce((a, x) => a + raidsCounted(x), 0) / 100;
      expect(perWeek).toBeGreaterThan(want * 0.85);
      expect(perWeek).toBeLessThan(want * 1.15);
    }
  });

  it("each is Threat 5's raid whatever the Threat: 12–20 in full kit, boss-led, all Smash, on 2–3 of your plots", () => {
    for (const difficulty of ['classic', 'cutthroat'] as Difficulty[]) { // Cutthroat's Syndicate stands at Threat 4
      const base = pactEvening(difficulty, 5);
      expect(threatLevel(base)).toBe(difficulty === 'cutthroat' ? 4 : 5);
      for (const night of strikes(base, 60)) {
        for (const [k, [first, ...rest]] of groups(night).entries()) {
          const boss = HQS[first.attacker as RivalId].boss;
          const crew = [first, ...rest].flatMap((r) => r.party!).filter((f) => f.name !== boss);
          expect(crew.length).toBeGreaterThanOrEqual(12);
          expect(crew.length).toBeLessThanOrEqual(20);
          for (const f of crew) { expect(f.weapon).not.toBe('fists'); expect(f.gear).toBe('pro'); } // no Blender Rush either
          expect(first.party![0].name).toBe(boss);
          if (k === 0) expect(rest.length + 1).toBeGreaterThanOrEqual(2); // a later strike can find every plot already taken
          expect(rest.length + 1).toBeLessThanOrEqual(3);
          for (const r of [first, ...rest]) expect(r).toMatchObject({ objective: 'smash', syndicate: true, attacker: first.attacker });
          expect(new Set([first, ...rest].map((r) => r.target)).size).toBe(rest.length + 1);
        }
      }
    }
  });

  it("is never one of crew's Sabotage raids, even with every rival sure to send one", () => {
    const rates = { ...RIVAL_SABOTAGE };
    for (const r of Object.keys(RIVAL_SABOTAGE) as RivalId[]) RIVAL_SABOTAGE[r] = 1;
    try {
      const sent = strikes(pactEvening('classic', 15), 40).flat();
      expect(sent.length).toBeGreaterThan(20);
      expect(sent.every((r) => r.syndicate && r.objective === 'smash' && !r.sabotage)).toBe(true);
    } finally {
      Object.assign(RIVAL_SABOTAGE, rates);
    }
  });

  it("before it stands, Threat 5's raids on you are all Smash as well: none is a Sabotage, where Threat 4's can be", () => {
    const rates = { ...RIVAL_SABOTAGE };
    for (const r of Object.keys(RIVAL_SABOTAGE) as RivalId[]) RIVAL_SABOTAGE[r] = 1; // any raid that can be a Sabotage is one
    try {
      const base = pactEvening('classic', 15);
      delete base.syndicate; // Rank 9 tonight; the Pact forms at dawn (or, in the campaign, two weeks into Act 5)
      expect([threatLevel(base), syndicateFormed(base)]).toEqual([5, false]);
      const sent = strikes(base, 40).flat();
      expect(sent.length).toBeGreaterThan(20);
      expect(sent.every((r) => !r.syndicate && r.objective === 'smash' && !r.sabotage)).toBe(true);
      base.rank = 8; // Threat 4: 30% Shakedown, and crew's Sabotage
      expect(strikes(base, 40).flat().some((r) => r.sabotage)).toBe(true);
    } finally {
      Object.assign(RIVAL_SABOTAGE, rates);
    }
  });

  it('the first one comes the night it forms', () => {
    const base = pactEvening('laidback', 9);
    base.syndicate = { formed: base.day };
    expect(strikes(base, 60).every((night) => raidsCounted(night) >= 1)).toBe(true);
    base.syndicate = { formed: base.day - 1 };
    expect(strikes(base, 60).some((night) => !night.length)).toBe(true);
  });

  it('members backing off or in a Truce sit it out, the rest still strike; with nobody able to pay, none come', () => {
    const base = pactEvening('cutthroat', 11);
    for (const id of ['sourwood', 'fizzco', 'hollis', 'coldbrew'] as RivalId[]) base.rivals[id].truceUntil = base.day;
    base.rivals.blenders.respectUntil = 0;
    const sent = strikes(base, 100).flat();
    expect(sent.length).toBeGreaterThan(10);
    expect(new Set(sent.map((r) => r.attacker))).toEqual(new Set(['blenders']));
    base.rivals.blenders.respectUntil = base.day + 1; // beaten last night
    expect(strikes(base, 60).every((night) => !night.length)).toBe(true);
    const broke = pactEvening('cutthroat', 11);
    for (const id of Object.keys(broke.rivals) as RivalId[]) Object.assign(broke.rivals[id], { budget: { grow: 0, guard: 0, strike: 0 } });
    expect(strikes(broke, 60).every((night) => !night.length)).toBe(true);
  });

  it('each one is paid from Strike: the sender’s, or the Pact’s when the sender is short', () => {
    const base = pactEvening('classic', 13);
    base.rivals.blenders.budget = { grow: 0, guard: 0, strike: 0 };
    for (let i = 0; i < 40; i++) {
      const s = structuredClone(base);
      s.seed = i;
      planNight(s);
      const mine = s.raids.filter((r) => onYou(s, r));
      if (!mine.length) continue;
      const spent = (Object.keys(s.rivals) as RivalId[]).reduce((a, id) => a + base.rivals[id].budget!.strike - s.rivals[id].budget!.strike, 0);
      expect(spent).toBeGreaterThan(0);
      expect(s.rivals.blenders.budget!.strike).toBe(0);
    }
  });

  it("during Harbor Fest its crews go after every VIP pickup; otherwise it's the usual 30%", () => {
    const s = pactEvening('classic');
    const fest = festivalDays('harborFest', 2); // Days 82–84, after it formed on Day 53
    const heli: Order = { id: 'h', tier: 'heli', client: 'Test Star', qty: 2000, pay: 60000, due: fest.to, expires: fest.to, accepted: true };
    const ship: Order = { ...heli, id: 's', tier: 'ship' };
    s.day = fest.from;
    expect([deliveryRaidChance(s, heli), deliveryRaidChance(s, ship)]).toEqual([1, 1]); // world's syndicateFestRaid (vip.ts)
    s.day = fest.to + 1;
    expect(deliveryRaidChance(s, heli)).toBe(0.3);
    s.day = fest.to;
    delete s.syndicate;
    expect(deliveryRaidChance(s, heli)).toBe(0.3);
  });
});
