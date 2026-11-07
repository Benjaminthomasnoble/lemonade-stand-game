import { describe, expect, it } from 'vitest';
import {
  approveRepair, battleHeadline, budgetOf, buildingHp, buildingInvested, buySupply, buyGadget, buyPerimeter, canRepair, currentHp,
  damageAtClose, damageAtDawn, expectedCups, FACTIONS, fightRaid, growUpgrades, hpCapacity, hpShare, isDamaged, LOTTIES_CORNER,
  maxPacks, migrateDamage, migrateSave, newGame, openStand, ownedPlots, PLOTS, raidDamage, raidPartyFor, rebuildCost, rebuildStand,
  repairCost, selectedStand, simulateRestOfDay, sleepUntilDawn, upgradeStand, type GameState, type RivalId, type SupplyId,
} from './economy.ts';

/** Lottie's Corner grown into a Kiosk the normal way: Folding Table ($150), Lemonade Cart ($400), Kiosk ($3,500). */
function kiosk(seed = 1): GameState {
  const s = newGame(seed);
  s.rank = 6;
  s.cash = 100000;
  s.phase = 'prep';
  expect(upgradeStand(s, LOTTIES_CORNER)).toBe(true);
  expect(upgradeStand(s, LOTTIES_CORNER)).toBe(true);
  return s;
}

/** A raid on a plot: `n` Smoothie Bros who never run and never fall, chopping `chop` a swing. */
function smash(s: GameState, plot: string, chop: number, n = 1) {
  const party = raidPartyFor(s, 'blenders').slice(0, n).map((f) => ({ ...f, hit: 200, chop, hp: 100000, nerve: 1000 }));
  return fightRaid(s, { id: `r${s.nextId++}`, attacker: 'blenders', target: plot, objective: 'smash', party, detected: true, eta: '23:00' }, true);
}

/** Fill the selected stand up for a day of selling. */
function stockUp(s: GameState) {
  const st = selectedStand(s);
  for (const id of ['lemons', 'sugar', 'ice'] as SupplyId[]) buySupply(s, id, maxPacks(s, st, id), st);
}

describe('rebuild and repair cost basis', () => {
  it('a Kiosk built from an empty plot has $4,050 in it: $608 to rebuild, $405 to fix when Busted', () => {
    const s = kiosk();
    const ps = s.plots[LOTTIES_CORNER];
    expect(buildingInvested(ps)).toBe(4050);
    ps.stand!.wrecked = true;
    expect(rebuildCost(ps)).toBe(608);
    ps.busted = true;
    expect(rebuildCost(ps)).toBe(405);
  });

  it('fences and gadgets do not raise the rebuild bill, but still count toward Net Worth', () => {
    const s = kiosk(2);
    const ps = s.plots[LOTTIES_CORNER];
    expect(buyPerimeter(s, LOTTIES_CORNER)).toBe(true);
    expect(buyPerimeter(s, LOTTIES_CORNER)).toBe(true);
    expect(buyGadget(s, LOTTIES_CORNER, 'alarm')).toBe(true);
    expect(ps.invested).toBe(4050 + 150 + 1200 + 100);
    expect(buildingInvested(ps)).toBe(4050);
    ps.stand!.wrecked = true;
    expect(rebuildCost(ps)).toBe(608);
    const cash = s.cash;
    expect(rebuildStand(s, LOTTIES_CORNER)).toBe(true);
    expect(s.cash).toBe(cash - 608);
    expect(ps.invested).toBe(4050 + 150 + 1200 + 100); // the rebuild doesn't touch Net Worth's figure
  });

  it('the starting Folding Table still rebuilds for $23', () => {
    const s = newGame(3);
    s.plots[LOTTIES_CORNER].stand!.wrecked = true;
    expect(rebuildCost(s.plots[LOTTIES_CORNER])).toBe(23);
  });

  it('a facility counts its tiers', () => {
    const s = newGame(4);
    const field = PLOTS.find((p) => p.type === 'field')!;
    const ps = s.plots[field.id];
    ps.owner = 'player';
    ps.facility = { kind: 'helipad', level: 2, wrecked: true };
    ps.invested = 250000 + 9999; // plus whatever fences went up around it
    expect(buildingInvested(ps)).toBe(250000);
    expect(rebuildCost(ps)).toBe(37500);
  });

  it('an empty plot has nothing to rebuild', () => {
    const s = newGame(5);
    const empty = PLOTS.find((p) => !s.plots[p.id].owner && !s.plots[p.id].stand && !s.plots[p.id].facility)!;
    expect(buildingInvested(s.plots[empty.id])).toBe(0);
    expect(rebuildCost(s.plots[empty.id])).toBe(0);
  });
});

describe('building HP', () => {
  it('a building with no HP mark is at full HP; a Wrecked one has none; an empty plot counts as whole', () => {
    const s = kiosk();
    const ps = s.plots[LOTTIES_CORNER];
    expect(buildingHp(ps)).toBe(800);
    expect(currentHp(ps)).toBe(800);
    expect(hpShare(ps)).toBe(1);
    expect(isDamaged(ps)).toBe(false);
    ps.stand!.hp = 200;
    expect(currentHp(ps)).toBe(200);
    expect(hpShare(ps)).toBe(0.25);
    expect(isDamaged(ps)).toBe(true);
    ps.stand!.wrecked = true;
    expect(currentHp(ps)).toBe(0);
    expect(hpShare(ps)).toBe(0);
    expect(isDamaged(ps)).toBe(false);
    const empty = PLOTS.find((p) => !s.plots[p.id].stand && !s.plots[p.id].facility)!;
    expect(hpShare(s.plots[empty.id])).toBe(1);
    expect(currentHp(s.plots[empty.id])).toBe(0);
  });

  it('a Smash that runs out of time leaves the stand Damaged, and the next raid starts from there', () => {
    const s = newGame(6);
    const ps = s.plots[LOTTIES_CORNER];
    const first = smash(s, LOTTIES_CORNER, 1);
    expect(first.outcome).toBe('damaged');
    const afterOne = currentHp(ps);
    expect(afterOne).toBeGreaterThan(0);
    expect(afterOne).toBeLessThan(100);
    expect(first.hpLost).toBe(100 - afterOne);
    expect(ps.stand!.wrecked).toBeFalsy();
    const second = smash(s, LOTTIES_CORNER, 1);
    expect(second.outcome).toBe('damaged');
    expect(currentHp(ps)).toBeLessThan(afterOne - first.hpLost! / 2); // it kept chopping from what was left
    expect(battleHeadline(second)).toMatch(new RegExp(`Your stand lost ${second.hpLost} HP\\.$`));
    expect(s.news).toContain(battleHeadline(second));
    // Raids keep chopping from what's left until one finishes it off.
    for (let i = 0; i < 10 && !ps.stand!.wrecked; i++) smash(s, LOTTIES_CORNER, 1);
    expect(ps.stand!.wrecked).toBe(true);
    expect(ps.stand!.hp).toBeUndefined();
    expect(currentHp(ps)).toBe(0);
  });

  it('a raid on a rival leaves its stand Damaged too', () => {
    const s = newGame(7);
    const target = PLOTS.find((p) => s.plots[p.id].owner === 'hollis' && s.plots[p.id].stand)!;
    const ps = s.plots[target.id];
    ps.garrison = 0;
    ps.defense = { tier: 0, fenceHp: 0, gadgets: [] };
    const report = smash(s, target.id, 1);
    expect(report.outcome).toBe('damaged');
    expect(isDamaged(ps)).toBe(true);
    expect(report.hpLost).toBe(buildingHp(ps) - currentHp(ps));
  });

  it('a building still standing keeps at least 1 HP', () => {
    const s = kiosk();
    expect(raidDamage(s, LOTTIES_CORNER, 0)).toBe(799);
    expect(currentHp(s.plots[LOTTIES_CORNER])).toBe(1);
    expect(raidDamage(s, LOTTIES_CORNER, 0)).toBe(0);
  });

  it('a stand that falls comes back at full HP when rebuilt', () => {
    const s = kiosk();
    const ps = s.plots[LOTTIES_CORNER];
    ps.stand!.hp = 50;
    const b = smash(s, LOTTIES_CORNER, 500, 2);
    expect(b.outcome).toBe('smashed');
    expect(b.hpLost).toBeUndefined();
    expect(ps.stand!.hp).toBeUndefined();
    expect(rebuildStand(s, LOTTIES_CORNER)).toBe(true);
    expect(currentHp(ps)).toBe(800);
  });
});

describe('a Damaged stand pours its HP share', () => {
  it('in whole cups an hour', () => {
    const s = kiosk();
    const ps = s.plots[LOTTIES_CORNER];
    expect(hpCapacity(ps, 120)).toBe(120);
    ps.stand!.hp = 400;
    expect(hpCapacity(ps, 120)).toBe(60);
    ps.stand!.hp = 560; // 70%
    expect(hpCapacity(ps, 20)).toBe(14);
    ps.stand!.hp = 5;
    expect(hpCapacity(ps, 120)).toBe(0);
  });

  it('sells fewer cups, and the expected cups (the prep odds and Auto-Restock) plan for it', () => {
    const full = newGame(8), hurt = newGame(8);
    hurt.plots[LOTTIES_CORNER].stand!.hp = 10; // 10% of a Folding Table: 2 cups an hour
    expect(expectedCups(hurt, LOTTIES_CORNER)).toBeLessThanOrEqual(24);
    expect(expectedCups(full, LOTTIES_CORNER)).toBeGreaterThan(expectedCups(hurt, LOTTIES_CORNER));
    for (const s of [full, hurt]) { s.cash = 1000; stockUp(s); openStand(s); simulateRestOfDay(s); }
    expect(hurt.today.customers).toBeLessThanOrEqual(24);
    expect(hurt.today.walkedPast.line).toBeGreaterThan(0);
    expect(full.today.customers).toBeGreaterThan(hurt.today.customers);
  });
});

describe('repairs', () => {
  it('cost 15% of the building × the share of HP lost: a Kiosk at half HP is $304', () => {
    const s = kiosk();
    const ps = s.plots[LOTTIES_CORNER];
    expect(repairCost(s, LOTTIES_CORNER)).toBe(0);
    ps.stand!.hp = 400;
    expect(repairCost(s, LOTTIES_CORNER)).toBe(304);
    ps.stand!.hp = 1;
    expect(repairCost(s, LOTTIES_CORNER)).toBe(607); // 799 of 800 HP lost: still under the $608 rebuild
  });

  it('on Laid Back never cost more than the Busted fix', () => {
    const s = newGame(9, { difficulty: 'laidback' });
    s.rank = 6; s.cash = 100000; s.phase = 'prep';
    upgradeStand(s, LOTTIES_CORNER);
    upgradeStand(s, LOTTIES_CORNER);
    s.plots[LOTTIES_CORNER].stand!.hp = 400;
    expect(repairCost(s, LOTTIES_CORNER)).toBe(304);
    s.plots[LOTTIES_CORNER].stand!.hp = 40;
    expect(repairCost(s, LOTTIES_CORNER)).toBe(405);
  });

  it('are paid on approval, run overnight, and the stand opens at dawn as good as new', () => {
    const s = kiosk(10);
    const ps = s.plots[LOTTIES_CORNER];
    ps.stand!.hp = 400;
    const cash = s.cash, land = s.today.land;
    expect(canRepair(s, LOTTIES_CORNER).ok).toBe(true);
    expect(approveRepair(s, LOTTIES_CORNER)).toBe(true);
    expect(s.cash).toBe(cash - 304);
    expect(s.today.land).toBe(land + 304);
    expect(ps.repair).toEqual({ by: 'player', cost: 304, hp: 400 });
    expect(canRepair(s, LOTTIES_CORNER)).toEqual({ ok: false, why: 'Fixing tonight' });
    expect(approveRepair(s, LOTTIES_CORNER)).toBe(false);
    // Still Damaged through today: it pours at half speed until the repair runs tonight.
    expect(hpCapacity(ps, 120)).toBe(60);
    openStand(s);
    simulateRestOfDay(s);
    expect(currentHp(ps)).toBe(400);
    expect(sleepUntilDawn(s)).toBe(true);
    expect(ps.stand!.hp).toBeUndefined();
    expect(ps.repair).toBeUndefined();
    expect(currentHp(ps)).toBe(800);
    expect(s.news.some((n) => n.includes('good as new'))).toBe(true);
  });

  it('can be approved by day and in the Evening, but not once night falls, and only with the cash', () => {
    const s = kiosk(11);
    s.plots[LOTTIES_CORNER].stand!.hp = 400;
    s.phase = 'open';
    expect(canRepair(s, LOTTIES_CORNER).ok).toBe(true);
    s.phase = 'report';
    expect(canRepair(s, LOTTIES_CORNER).ok).toBe(true);
    s.phase = 'night';
    expect(canRepair(s, LOTTIES_CORNER)).toEqual({ ok: false, why: 'Too late tonight: approve it tomorrow' });
    s.phase = 'report';
    s.cash = 100;
    expect(canRepair(s, LOTTIES_CORNER)).toEqual({ ok: false, why: 'Needs $304' });
    const rival = PLOTS.find((p) => s.plots[p.id].owner === 'hollis' && s.plots[p.id].stand)!;
    s.plots[rival.id].stand!.hp = 1;
    expect(canRepair(s, rival.id)).toEqual({ ok: false, why: 'Not your plot' });
    delete s.plots[LOTTIES_CORNER].stand!.hp;
    s.cash = 1000;
    expect(canRepair(s, LOTTIES_CORNER)).toEqual({ ok: false, why: 'Nothing to fix' });
  });

  it('are called off and paid back when the stand falls before dawn', () => {
    const s = kiosk(12);
    const ps = s.plots[LOTTIES_CORNER];
    ps.stand!.hp = 400;
    s.phase = 'report';
    const cash = s.cash, land = s.today.land;
    approveRepair(s, LOTTIES_CORNER);
    expect(smash(s, LOTTIES_CORNER, 500, 2).outcome).toBe('smashed');
    expect(ps.repair).toBeUndefined();
    expect(s.cash).toBe(cash);
    expect(s.today.land).toBe(land);
    expect(s.news.some((n) => n.includes('called off'))).toBe(true);
  });

  it('put back the HP they were paid for: a raid after the approval leaves fresh damage', () => {
    const s = kiosk(13);
    const ps = s.plots[LOTTIES_CORNER];
    ps.stand!.hp = 400;
    s.phase = 'report';
    approveRepair(s, LOTTIES_CORNER);
    const b = smash(s, LOTTIES_CORNER, 1);
    expect(b.outcome).toBe('damaged');
    damageAtDawn(s);
    expect(currentHp(ps)).toBe(800 - b.hpLost!);
    expect(ps.repair).toBeUndefined();
  });

  it('an upgrade brings the stand back full and pays back a repair queued for it', () => {
    const s = kiosk(14);
    const ps = s.plots[LOTTIES_CORNER];
    ps.stand!.hp = 400;
    approveRepair(s, LOTTIES_CORNER);
    const cash = s.cash;
    s.rank = 8;
    expect(upgradeStand(s, LOTTIES_CORNER)).toBe(true);
    expect(ps.stand!.hp).toBeUndefined();
    expect(ps.repair).toBeUndefined();
    expect(s.cash).toBe(cash - 60000 + 304);
  });

  it("a rival's 30-day upgrade brings its stand back full too", () => {
    const s = newGame(17);
    const id: RivalId = 'blenders';
    const p = ownedPlots(s, id).find((q) => (s.plots[q.id].stand?.level ?? 99) < FACTIONS[id].maxLevel)!;
    const ps = s.plots[p.id];
    const level = ps.stand!.level;
    ps.stand!.hp = 1;
    s.rivals[id].cash = 1e6;
    s.day = 31;
    budgetOf(s, id).grow = 1e6;
    growUpgrades(s, id);
    expect(ps.stand!.level).toBe(level + 1);
    expect(ps.stand!.hp).toBeUndefined();
    expect(isDamaged(ps)).toBe(false);
  });

  it('rivals repair at closing when they can spare the bill plus $500, and it is done by dawn', () => {
    const s = newGame(15);
    const [a, b] = PLOTS.filter((p) => s.plots[p.id].owner === 'hollis' && s.plots[p.id].stand);
    const pa = s.plots[a.id], pb = s.plots[b.id];
    pa.stand!.hp = Math.round(buildingHp(pa) / 2);
    const cost = repairCost(s, a.id);
    expect(cost).toBe(Math.ceil(buildingInvested(pa) * 0.15 * (1 - pa.stand!.hp / buildingHp(pa)) - 1e-6));
    s.rivals.hollis.cash = cost + 500; // nothing to spare
    damageAtClose(s);
    expect(pa.repair).toBeUndefined();
    pb.stand!.hp = Math.round(buildingHp(pb) / 2);
    s.rivals.hollis.cash = 1e6;
    damageAtClose(s);
    expect(pa.repair).toMatchObject({ by: 'hollis', cost });
    expect(pb.repair).toBeTruthy();
    expect(s.rivals.hollis.cash).toBe(1e6 - cost - pb.repair!.cost);
    damageAtDawn(s);
    expect(isDamaged(pa)).toBe(false);
    expect(isDamaged(pb)).toBe(false);
  });

  it('rivals book them when the stands close', () => {
    const s = newGame(16);
    const p = PLOTS.find((q) => s.plots[q.id].owner === 'fizzco' && s.plots[q.id].stand)!;
    s.plots[p.id].stand!.hp = 1;
    s.rivals.fizzco.cash = 1e6;
    openStand(s);
    simulateRestOfDay(s);
    expect(s.phase).toBe('report');
    expect(s.plots[p.id].repair?.by).toBe('fizzco' as RivalId);
  });
});

describe('saves', () => {
  it('building HP and queued repairs survive a save and load', () => {
    const s = kiosk(17);
    s.plots[LOTTIES_CORNER].stand!.hp = 400;
    approveRepair(s, LOTTIES_CORNER);
    const back = migrateSave(JSON.parse(JSON.stringify(s)))!;
    expect(back.plots[LOTTIES_CORNER].stand!.hp).toBe(400);
    expect(back.plots[LOTTIES_CORNER].repair).toEqual({ by: 'player', cost: 304, hp: 400 });
  });

  it('migrating cleans odd values and changes nothing the second time', () => {
    const s = kiosk(18);
    const ps = s.plots[LOTTIES_CORNER];
    ps.stand!.hp = 9999; // over the max: full
    const [rival, other] = PLOTS.filter((p) => s.plots[p.id].owner === 'hollis' && s.plots[p.id].stand);
    s.plots[rival.id].stand!.hp = 12.4;
    s.plots[rival.id].stand!.wrecked = true; // a Wrecked stand keeps no HP
    s.plots[other.id].stand!.hp = 0.2;
    s.plots[other.id].repair = { cost: 'x' } as never;
    migrateDamage(s);
    expect(ps.stand!.hp).toBeUndefined();
    expect(s.plots[rival.id].stand!.hp).toBeUndefined();
    expect(s.plots[other.id].stand!.hp).toBe(1);
    expect(s.plots[other.id].repair).toBeUndefined();
    const once = JSON.stringify(s);
    migrateDamage(s);
    expect(JSON.stringify(s)).toBe(once);
  });
});
