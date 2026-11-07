import { describe, expect, it } from 'vitest';
import {
  LOTTIES_CORNER, migrateSave, newGame, openStands, SAVE_VERSION, simulateRestOfDay, sleepUntilDawn, type GameState,
} from './economy.ts';
import { FIRST_VERSION } from './legacy.ts';

// Real saves made by the versions that shipped them (a new game played four days, history cut to its last day).
const V1 = {"version":1,"seed":1137294573,"day":5,"phase":"prep","minute":540,"cash":89.2,"inventory":{"lemons":0,"sugar":24,"cups":164,"ice":0},"recipe":{"lemons":4,"sugar":3,"ice":3},"price":0.5,"reputation":0.665,"forecast":{"kind":"sunny","temp":76},"weather":{"kind":"sunny","temp":76},"pitcherCups":0,"spawnCarry":0.26943507681201817,"today":{"day":5,"weather":{"kind":"sunny","temp":76},"price":0.5,"passersby":0,"customers":0,"missed":0,"revenue":0,"spent":0,"iceMelted":0,"satisfaction":0,"reputationBefore":0.665,"reputationAfter":0.665},"history":[{"day":4,"weather":{"kind":"heatwave","temp":100},"price":0.5,"passersby":255,"customers":70,"missed":176,"revenue":35,"spent":12.2,"iceMelted":0,"satisfaction":0.9845034635735292,"reputationBefore":0.648,"reputationAfter":0.665}],"bestNetWorth":114.2};
const V3 = {"version":3,"seed":1702444928,"day":5,"minute":420,"phase":"prep","cash":296.46,"reputation":2.8,"standLevel":1,"invested":150,"landValue":300,"plotTraffic":320,"inventory":{"lemons":[{"qty":10,"day":4,"unitCost":0.176}],"sugar":0,"ice":0,"sugarCost":0.027857142857142858,"iceCost":0.009},"market":{"lemons":0.187,"sugar":0.028,"ice":0.009},"recipe":"classic","sweetness":"classic","price":0.75,"forecast":{"kind":"hot","temp":85},"weather":{"kind":"hot","temp":85},"pitcherCups":0,"spawnCarry":0.34770888789014487,"servedThisHour":0,"today":{"day":5,"weather":{"kind":"hot","temp":85},"recipe":"classic","price":0.75,"passersby":0,"customers":0,"walkedPast":{"notThirsty":0,"pricey":0,"line":0,"soldOut":0},"revenue":0,"supplies":0,"cupCosts":0,"upkeep":0,"iceMelted":0,"lemonsSpoiled":0,"satisfaction":0,"reputationBefore":2.8,"reputationAfter":2.8,"scoreBefore":710},"history":[{"day":4,"weather":{"kind":"warm","temp":78},"recipe":"classic","price":0.75,"passersby":421,"customers":60,"walkedPast":{"notThirsty":198,"pricey":118,"line":0,"soldOut":45},"revenue":45,"supplies":8.12,"cupCosts":3,"upkeep":5,"iceMelted":0,"lemonsSpoiled":0,"satisfaction":0.6298809523809524,"reputationBefore":2.85,"reputationAfter":2.8,"scoreBefore":681}],"peakScore":710,"lifetimeCups":300,"brandTier":0,"campaigns":{},"rank":1,"news":[]};

const json = <T>(x: T): T => JSON.parse(JSON.stringify(x));
type Loose = Record<string, unknown>;

/** A v4 to v6 save: the map era, before the fields each later version added (their shapes match a new game's). */
function oldSave(v: 4 | 5 | 6): Loose {
  const s = json(newGame(31)) as unknown as Loose & GameState;
  delete (s as Loose).settings; delete (s as Loose).combatRules; delete (s as Loose).peakDay; // v8 on
  for (const ps of Object.values(s.plots)) if (ps.owner && ps.owner !== 'player') delete ps.facility; // v7: rival pads and piers
  if (v <= 5) for (const k of ['bottles', 'offers', 'orders']) delete (s as Loose)[k]; // v6
  if (v <= 4) { // v5: defenses, the crew and raids
    for (const k of ['guards', 'recruits', 'clubhouse', 'nextId', 'raids', 'battles', 'respectFromPlayer']) delete (s as Loose)[k];
    for (const ps of Object.values(s.plots)) { delete (ps as Partial<typeof ps>).defense; delete ps.garrison; }
    for (const r of Object.values(s.rivals)) delete (r as Partial<typeof r>).respectUntil;
  }
  s.day = 6;
  s.version = v;
  return s;
}

/** Each rival plot's VIP facility (rival pads, piers, plants and groves), as plot:kind. */
const rivalFacilities = (s: GameState) =>
  Object.entries(s.plots).flatMap(([id, ps]) => (ps.owner && ps.owner !== 'player' && ps.facility ? [`${id}:${ps.facility.kind}`] : []));

/** A day and a night, start to finish: the run is whole. */
function playDay(s: GameState): GameState {
  s.cash = Math.max(s.cash, 50);
  expect(openStands(s)).toBe(true);
  simulateRestOfDay(s);
  expect(sleepUntilDawn(s)).toBe(true);
  return s;
}

describe('every old save loads', () => {
  it('v1 (one stand, Reputation 0 to 1): the stand carries on in Citrine Bay on the day it reached', () => {
    const s = migrateSave(json(V1))!;
    expect(s.version).toBe(SAVE_VERSION);
    expect(s).toMatchObject({ day: 5, cash: 89.2, phase: 'prep', reputation: 3.66 });
    expect(s.plots[LOTTIES_CORNER].owner).toBe('player');
    expect(s.plots[LOTTIES_CORNER].stand!.price).toBe(0.5);
    expect(s.news.join(' ')).toMatch(/old stand/);
    expect(json(migrateSave(json(s)))).toEqual(json(s)); // loading again changes nothing
    expect(playDay(s).day).toBe(6);
  });

  it('v3 (one stand with a level, recipe and lemons): all of it carries', () => {
    const s = migrateSave(json(V3))!;
    expect(s.version).toBe(SAVE_VERSION);
    expect(s).toMatchObject({ day: 5, cash: 296.46, reputation: 2.8, rank: 1, lifetimeCups: 300 });
    const st = s.plots[LOTTIES_CORNER].stand!;
    expect(st).toMatchObject({ level: 1, recipe: 'classic', sweetness: 'classic', price: 0.75 });
    expect(st.inventory.lemons).toEqual([{ qty: 10, day: 4, unitCost: 0.176 }]);
    expect(s.peakScore).toBeGreaterThanOrEqual(710);
    expect(json(migrateSave(json(s)))).toEqual(json(s));
    expect(playDay(s).day).toBe(6);
  });

  it('the same old save always rebuilds the same run (seeded, no other draws)', () => {
    expect(json(migrateSave(json(V3)))).toEqual(json(migrateSave(json(V3))));
    expect(migrateSave({ ...json(V1), version: undefined })!.day).toBe(5); // no version at all: the first one
    expect(FIRST_VERSION).toBe(1);
  });

  it.each([4, 5, 6] as const)('v%i (the map, before later fields): fills the defaults and plays on', (v) => {
    const s = migrateSave(oldSave(v))!;
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.day).toBe(6);
    expect(s.settings.mode).toBe('campaign');
    if (v <= 4) expect(s.guards).toEqual([]);
    expect(Array.isArray(s.raids) && Array.isArray(s.offers) && typeof s.bottles === 'number').toBe(true);
    expect(Object.values(s.plots).every((ps) => !!ps.defense)).toBe(true);
    expect(rivalFacilities(s).length).toBeGreaterThan(0);
    expect(rivalFacilities(s)).toEqual(rivalFacilities(newGame(31))); // v7's rival facilities come back as a new game has them
    expect(json(migrateSave(json(s)))).toEqual(json(s));
    expect(playDay(s).day).toBe(7);
  });

  it('anything that is not a save is still turned away', () => {
    for (const x of [null, 'text', 3, [], {}, { cash: 5 }, { cash: 5, day: 2, version: 7 }]) expect(migrateSave(x)).toBeNull();
  });
});
