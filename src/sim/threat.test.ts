import { describe, expect, it } from 'vitest';
import {
  CLOSE, HQS, LOTTIES_CORNER, NIGHT_END, newGame, nightStep, onYou, planNight, PLOTS, RAID_PARTY, RAIDS_PER_WEEK, raidCount, raidsCounted,
  newStand, startNight, threatLevel, weeklyRaids, spotChance, migrateSave, raidTargets, sleepUntilDawn, TUTORIAL_RAID_DAY, welcomeDex,
  type BattleReport, type Difficulty, type GameState, type Raid, type RivalId,
} from './economy.ts';

/** Rank for a Threat on a difficulty (Laid Back takes 1 off). */
const rankFor = (threat: number, difficulty: Difficulty) => Math.min(10, difficulty === 'laidback' ? threat * 2 + 1 : threat * 2 - 1);

/** A Sandbox run at the Evening of Day 30, past the tutorial raid, Threat `threat`, with four stands of yours. */
function evening(threat: number, difficulty: Difficulty = 'classic', seed = 1, stands = 4): GameState {
  const s = newGame(seed, { mode: 'sandbox', difficulty });
  s.phase = 'report';
  s.minute = CLOSE;
  s.raids = [];
  s.day = 30;
  s.rank = rankFor(threat, difficulty);
  s.battles.push({ day: 16, attacker: 'blenders', defender: 'player', target: LOTTIES_CORNER, outcome: 'repelled' } as BattleReport); // past the tutorial raid
  for (const p of PLOTS.filter((x) => x.district === 'maple' && x.type === 'street' && !s.plots[x.id].owner).slice(0, stands - 1)) {
    s.plots[p.id] = { ...s.plots[p.id], owner: 'player', stand: newStand(2) };
  }
  return s;
}

/** Plan many nights from the same Evening, each with its own dice: tonight's raids on you. */
function nights(base: GameState, n: number): Raid[][] {
  const out: Raid[][] = [];
  for (let i = 0; i < n; i++) {
    const s = structuredClone(base);
    s.seed = (i * 2654435761 + 12345) | 0;
    planNight(s);
    out.push(s.raids.filter((r) => onYou(s, r)));
  }
  return out;
}

describe('raids on you per week', () => {
  it('follow Threat 1/2/3/4/6 on Classic, ×0.5 on Laid Back and ×1.5 on Cutthroat (9 a week at Threat 5)', () => {
    for (const difficulty of ['classic', 'laidback', 'cutthroat'] as Difficulty[]) {
      const mult = difficulty === 'laidback' ? 0.5 : difficulty === 'cutthroat' ? 1.5 : 1;
      for (let threat = 1; threat <= (difficulty === 'laidback' ? 4 : 5); threat++) {
        const s = evening(threat, difficulty);
        expect(threatLevel(s)).toBe(threat);
        expect(weeklyRaids(s)).toBeCloseTo(RAIDS_PER_WEEK[threat - 1] * mult);
      }
    }
  });

  it('a Poisson count each night: several raids can land on one night, and the mean is the week over 7', () => {
    expect(raidCount(0.5, 0)).toBe(0);
    expect(raidCount(0.5, 0.999)).toBeGreaterThanOrEqual(3);
    let sum = 0, two = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) { const k = raidCount(9 / 7, (i + 0.5) / N); sum += k; if (k >= 2) two++; }
    expect(sum / N).toBeCloseTo(9 / 7, 1);
    expect(two / N).toBeGreaterThan(0.3);
    // A busier rate raids on every night a quieter one does (one uniform read off each CDF).
    for (let i = 0; i < 200; i++) expect(raidCount(1.2, i / 200)).toBeGreaterThanOrEqual(raidCount(0.4, i / 200));
  });

  it('planned raids come at the weekly rate, Classic Threat 2 and Cutthroat Threat 5', () => {
    for (const [threat, difficulty] of [[2, 'classic'], [5, 'cutthroat']] as [number, Difficulty][]) {
      const base = evening(threat, difficulty, 3);
      const planned = nights(base, 700);
      const perWeek = planned.reduce((a, raids) => a + raidsCounted(raids), 0) / 100;
      expect(perWeek).toBeGreaterThan(weeklyRaids(base) * 0.85);
      expect(perWeek).toBeLessThan(weeklyRaids(base) * 1.15);
      if (weeklyRaids(base) > 7) expect(planned.some((raids) => raidsCounted(raids) >= 2)).toBe(true);
    }
  });

  it('a raid on you last night no longer keeps every rival away tonight', () => {
    const base = evening(4, 'classic', 5);
    base.battles.unshift({ day: 29, attacker: 'blenders', defender: 'player', target: LOTTIES_CORNER, outcome: 'robbed' } as BattleReport);
    expect(nights(base, 200).filter((raids) => raids.length).length).toBeGreaterThan(40);
  });

  it('none in the first five days', () => {
    const base = evening(3);
    base.day = 5;
    expect(nights(base, 100).every((raids) => !raids.length)).toBe(true);
  });
});

describe('what a raid on you is after', () => {
  it('Smash 0 / 30 / 60 / 70 / 100% by Threat, the rest Shakedowns (a Sabotage aside)', () => {
    const want = [0, 0.3, 0.6, 0.7, 1];
    for (let threat = 1; threat <= 5; threat++) {
      // A split raid once; crew's Sabotage (from Rank 4) turns a share of either kind into a quiet raid on the stock.
      const raids = nights(evening(threat, 'cutthroat', 7), 500).flatMap((x) => x.filter((r) => (!r.group || r.group === r.id) && !r.sabotage));
      const smash = raids.filter((r) => r.objective === 'smash').length / raids.length;
      expect(raids.length).toBeGreaterThan(50);
      expect(smash).toBeGreaterThanOrEqual(want[threat - 1] - 0.08);
      expect(smash).toBeLessThanOrEqual(want[threat - 1] + 0.08);
    }
  });
});

describe('raids on several plots', () => {
  const groups = (raids: Raid[]) => [...new Set(raids.map((r) => r.group ?? r.id))].map((g) => raids.filter((r) => (r.group ?? r.id) === g));

  it('Threats 1–3 hit one plot; Threat 4 one or two; Threat 5 two or three', () => {
    for (const [threat, lo, hi] of [[1, 1, 1], [2, 1, 1], [3, 1, 1], [4, 1, 2], [5, 2, 3]]) {
      // Each night's first raid (a later one can find every plot already taken), with plenty of plots to go round.
      const sizes = nights(evening(threat, 'cutthroat', 11, 8), 300).filter((x) => x.length).map((x) => groups(x)[0].length);
      expect(Math.min(...sizes)).toBe(lo);
      expect(Math.max(...sizes)).toBe(hi);
      if (hi > lo) expect(sizes.filter((n) => n === hi).length / sizes.length).toBeGreaterThan(0.3);
    }
  });

  it('a split raid shares its party between distinct plots, each part with its own arrival', () => {
    const split = nights(evening(4, 'cutthroat', 13), 200).flatMap(groups).filter((g) => g.length === 2);
    expect(split.length).toBeGreaterThan(5);
    for (const g of split) {
      expect(new Set(g.map((r) => r.target)).size).toBe(2);
      expect(new Set(g.map((r) => r.attacker)).size).toBe(1);
      const n = g.reduce((a, r) => a + r.party!.length, 0);
      expect(n).toBeGreaterThanOrEqual(RAID_PARTY[3].size[0]);
      expect(n).toBeLessThanOrEqual(RAID_PARTY[3].size[1]);
      for (const r of g) expect(r.party!.length).toBeGreaterThanOrEqual(Math.floor(n / 2));
      expect(new Set(g.map((r) => r.leave)).size).toBe(1); // they set out together
    }
  });

  it("a night's raids pick distinct plots while you have one left; with one stand they all come to it", () => {
    for (const raids of nights(evening(5, 'cutthroat', 17), 200)) {
      if (raids.length <= 4) expect(new Set(raids.map((r) => r.target)).size).toBe(raids.length);
    }
    const one = nights(evening(5, 'cutthroat', 19, 1), 100).flat();
    expect(one.length).toBeGreaterThan(0);
    expect(one.every((r) => r.target === LOTTIES_CORNER && !r.group)).toBe(true); // a lone stand: no split
  });

  it('each part is warned and fought on its own, and the raid counts once', () => {
    let s: GameState | undefined;
    for (let seed = 1; seed <= 200 && !s; seed++) {
      const t = evening(5, 'classic', seed);
      planNight(t);
      if (t.raids.filter((r) => onYou(t, r)).some((r) => r.group)) s = t;
    }
    const parts = s!.raids.filter((r) => onYou(s!, r) && r.group === s!.raids.find((x) => x.group)!.group);
    expect(parts.length).toBeGreaterThanOrEqual(2);
    expect(raidsCounted(parts)).toBe(1);
    startNight(s!);
    const fights = new Set<string>();
    while (s!.minute < NIGHT_END) {
      for (const e of nightStep(s!)) {
        if (e.type === 'alert' && e.alert.raid && parts.some((p) => p.id === e.alert.raid)) fights.add(`warn ${e.alert.raid}`);
        if (e.type === 'fight' && parts.includes(e.raid)) fights.add(`fight ${e.raid.id}`);
      }
    }
    for (const p of parts) { expect(fights.has(`warn ${p.id}`)).toBe(true); expect(fights.has(`fight ${p.id}`)).toBe(true); }
  });
});

describe('who rides with a raid', () => {
  it('from Threat 3 a raid brings lookouts, and they make it harder to spot', () => {
    for (let threat = 1; threat <= 5; threat++) {
      const raids = nights(evening(threat, 'cutthroat', 23), 80).flat();
      expect(raids.length).toBeGreaterThan(0);
      for (const r of raids) expect(!!r.lookouts).toBe(threat >= 3);
    }
    const s = evening(3);
    const r: Raid = { id: 'x', attacker: 'hollis', target: LOTTIES_CORNER, objective: 'smash', party: [], detected: false, eta: '23:00', leave: 21 * 60, at: 23 * 60 };
    expect(spotChance(s, { ...r, lookouts: 2 })).toBeCloseTo(spotChance(s, r) - 0.2);
  });

  it('at Threat 5 a boss leads the raid, at the head of its first part, the crew in full kit', () => {
    const raids = nights(evening(5, 'classic', 29), 120).flat().filter((r) => r.attacker !== 'blenders'); // Blender Rush trades weapons down
    expect(raids.length).toBeGreaterThan(10);
    for (const r of raids) {
      const led = r.party!.some((f) => f.name === HQS[r.attacker as RivalId].boss);
      expect(led).toBe(!r.group || r.group === r.id);
      for (const f of r.party!.filter((x) => x.name !== HQS[r.attacker as RivalId].boss)) {
        expect(f.weapon).not.toBe('fists');
        expect(f.gear).toBe('pro');
      }
    }
  });

  it('below Threat 5 no boss comes along', () => {
    for (const r of nights(evening(4, 'cutthroat', 31), 100).flat()) {
      expect(r.party!.some((f) => f.name === HQS[r.attacker as RivalId].boss)).toBe(false);
    }
  });
});

describe('the tutorial raid comes once a run', () => {
  /** Day 15's Evening on a fresh run: the tutorial raid's night. */
  function fair(seed: number): GameState {
    const s = newGame(seed);
    s.phase = 'report';
    s.minute = CLOSE;
    s.raids = [];
    s.day = TUTORIAL_RAID_DAY;
    welcomeDex(s);
    return s;
  }
  const scripted = (r: Raid) => r.tutorial || (r.party?.length === 2 && r.party.every((f) => f.hp === 30));

  it('once fought, it never comes back, even after six of your own fights roll it off the log', () => {
    const s = fair(41);
    planNight(s);
    expect(s.raids.filter((r) => onYou(s, r) && r.tutorial)).toHaveLength(1);
    expect(s.tutorialRaidDone).toBeUndefined();
    sleepUntilDawn(s);
    expect(s.tutorialRaidDone).toBe(true);
    const theirs = raidTargets(s)[0].id;
    s.battles = Array.from({ length: 6 }, () => ({ day: s.day, attacker: 'player', defender: 'hollis', target: theirs, outcome: 'smashed' }) as BattleReport);
    expect(s.battles.some((b) => b.defender === 'player')).toBe(false);
    s.phase = 'report';
    s.minute = CLOSE;
    let raided = 0;
    for (const raids of nights(s, 150)) {
      raided += raids.length;
      expect(raids.some(scripted)).toBe(false);
    }
    expect(raided).toBeGreaterThan(5); // the ordinary raids come instead
  });

  it('nothing raids you before it', () => {
    const s = fair(43);
    s.day = TUTORIAL_RAID_DAY - 1; // Day 14, no Kiosk yet: not its night
    expect(nights(s, 60).every((raids) => !raids.length)).toBe(true);
  });

  it('the flag survives a save; an older save takes it from its log or its day, and a planned one still bounces', () => {
    const s = fair(45);
    planNight(s);
    sleepUntilDawn(s);
    expect(migrateSave(JSON.parse(JSON.stringify(s)))!.tutorialRaidDone).toBe(true);
    const old = (day: number) => { const t = JSON.parse(JSON.stringify(fair(47))); delete t.tutorialRaidDone; t.day = day; return t; };
    expect(migrateSave(old(20))!.tutorialRaidDone).toBe(true); // past Day 15: it has been
    expect(migrateSave(old(9))!.tutorialRaidDone).toBe(false);
    const evening15 = fair(49);
    planNight(evening15);
    const raw = JSON.parse(JSON.stringify(evening15));
    delete raw.tutorialRaidDone;
    for (const r of raw.raids) delete r.tutorial; // planned before the flag existed
    const back = migrateSave(raw)!;
    expect(back.tutorialRaidDone).toBe(false);
    expect(back.raids.filter((r) => r.tutorial)).toHaveLength(1);
  });
});
