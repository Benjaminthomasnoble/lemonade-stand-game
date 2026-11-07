import { describe, expect, it } from 'vitest';
import {
  approveRebuild, approveRepair, AUTO_REPAIR, autoRepairOn, autoRepairs, battleHeadline, budgetOf, buildingHp, buildingInvested, buySupply,
  buyGadget, buyPerimeter, canRebuild, canRepair, canUpgradeStand, CLOSE, currentHp, damageAtClose, damageAtDawn, expectedCups, FACTIONS,
  fightRaid, FORECAST_ACCURACY, growUpgrades, helperLines, helpers, hpCapacity, hpShare, isDamaged, isWrecked, LOTTIES_CORNER, maxPacks,
  migrateDamage, migrateSave, newGame, newStand, openStand, ownedPlots, PLOT_BY_ID, PLOTS, plotsAtDawn, prepPreview, applyRaidDamage,
  raidPartyFor, rebuildCost, rebuilding, rebuildStand, repairCost, selectedStand, simulateRestOfDay, sleepUntilDawn, stormAtOpen, tickMinute,
  toggleAutoRepair, upgradeStand, type GameState, type Raid, type RivalId, type SupplyId,
} from './economy.ts';
import { finishFight, startFight, watchFights } from './fight.ts';
import { nextRandom } from './rng.ts';

/** The spec's Kiosk on Lottie's Corner: a Folding Table built new ($150, not Lottie's own $100 one), a Lemonade Cart
 * ($400) and a Kiosk ($3,500), $4,050 in all. */
function kiosk(seed = 1): GameState {
  const s = newGame(seed);
  s.rank = 6;
  s.cash = 100000;
  s.phase = 'prep';
  delete s.plots[LOTTIES_CORNER].stand!.startTable;
  expect(upgradeStand(s, LOTTIES_CORNER)).toBe(true);
  expect(upgradeStand(s, LOTTIES_CORNER)).toBe(true);
  return s;
}

/** A raid on a plot: `n` Smoothie Bros who never run and never fall, chopping `chop` a swing. */
function smash(s: GameState, plot: string, chop: number, n = 1) {
  const party = raidPartyFor(s, 'blenders').slice(0, n).map((f) => ({ ...f, hit: 200, chop, hp: 100000, nerve: 1000 }));
  return fightRaid(s, { id: `r${s.nextId++}`, attacker: 'blenders', target: plot, objective: 'smash', party, detected: true, eta: '23:00' }, true);
}

/** The last minute of business hours, so the stands close (whatever the weather would have been today). */
function closeShop(s: GameState) {
  s.phase = 'open';
  s.minute = CLOSE - 1;
  tickMinute(s);
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

  it("Lottie's starting Folding Table counts as $100: $15 to rebuild, $10 to fix when Busted", () => {
    const s = newGame(3);
    const ps = s.plots[LOTTIES_CORNER];
    expect(buildingInvested(ps)).toBe(100);
    expect(ps.invested).toBe(150); // Net Worth's figure is not this lane's (Appendix A's starting conditions)
    ps.stand!.wrecked = true;
    expect(rebuildCost(ps)).toBe(15);
    ps.busted = true;
    expect(rebuildCost(ps)).toBe(10);
  });

  it('the Corner grown into a Kiosk has $4,000 in it: $600 to rebuild, $300 at half HP', () => {
    const s = newGame(3);
    s.rank = 6; s.cash = 100000; s.phase = 'prep';
    expect(upgradeStand(s, LOTTIES_CORNER)).toBe(true);
    expect(upgradeStand(s, LOTTIES_CORNER)).toBe(true);
    const ps = s.plots[LOTTIES_CORNER];
    expect(buildingInvested(ps)).toBe(4000);
    ps.stand!.hp = 400;
    expect(repairCost(s, LOTTIES_CORNER)).toBe(300);
    delete ps.stand!.hp;
    ps.stand!.wrecked = true;
    expect(rebuildCost(ps)).toBe(600);
    ps.busted = true;
    expect(rebuildCost(ps)).toBe(400);
  });

  it('a Folding Table built new counts its $150: $23 to rebuild', () => {
    const s = newGame(3);
    const p = PLOTS.find((q) => q.district === 'maple' && q.type === 'street' && !s.plots[q.id].owner)!;
    s.plots[p.id] = { owner: 'player', stand: newStand(1), invested: 150, landValue: 300, defense: { tier: 0, fenceHp: 0, gadgets: [] } };
    expect(buildingInvested(s.plots[p.id])).toBe(150);
    s.plots[p.id].stand!.wrecked = true;
    expect(rebuildCost(s.plots[p.id])).toBe(23);
  });

  it("Lottie's table keeps its $100 through a save and load; older saves keep the $150 every table had then", () => {
    const s = newGame(3);
    const back = migrateSave(JSON.parse(JSON.stringify(s)))!;
    expect(back.plots[LOTTIES_CORNER].stand!.startTable).toBe(true);
    expect(buildingInvested(back.plots[LOTTIES_CORNER])).toBe(100);
    const old = JSON.parse(JSON.stringify(s));
    delete old.plots[LOTTIES_CORNER].stand.startTable;
    expect(buildingInvested(migrateSave(old)!.plots[LOTTIES_CORNER])).toBe(150);
    const odd = JSON.parse(JSON.stringify(s));
    odd.plots[LOTTIES_CORNER].stand.startTable = 'yes';
    expect(migrateSave(odd)!.plots[LOTTIES_CORNER].stand!.startTable).toBeUndefined();
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

  it('a live fight starts from the HP the last raid left, and the stand keeps what the fight leaves', () => {
    const s = kiosk(60);
    const ps = s.plots[LOTTIES_CORNER];
    ps.stand!.hp = 600;
    const party = raidPartyFor(s, 'blenders').slice(0, 1).map((f) => ({ ...f, hit: 200, chop: 1, hp: 100000, nerve: 1000 }));
    const raid: Raid = { id: 'live', attacker: 'blenders', target: LOTTIES_CORNER, objective: 'smash', party, detected: true, eta: '23:00' };
    watchFights(true); // as the game does: a fight on your plot plays live
    try {
      expect(startFight(s, raid, true)).toBe(true);
      expect(s.fight!.input.standHp).toBe(600);
      const [report] = finishFight(s); // fight.ts settles it through fightRaid, like an instant fight
      expect(report.outcome).toBe('damaged');
      expect(report.hpLost).toBeGreaterThan(0);
      expect(currentHp(ps)).toBe(600 - report.hpLost!);
      expect(s.news).toContain(battleHeadline(report));
    } finally {
      watchFights(false);
    }
  });

  it("a fallen building's HP field is cleared, and currentHp and hpShare read 0 for it", () => {
    const s = kiosk(61);
    const ps = s.plots[LOTTIES_CORNER];
    ps.stand!.hp = 300;
    expect(smash(s, LOTTIES_CORNER, 500, 2).outcome).toBe('smashed');
    expect(ps.stand!.hp).toBeUndefined(); // not "full": the stand is down
    expect(currentHp(ps)).toBe(0);
    expect(hpShare(ps)).toBe(0);
  });

  it('a building still standing keeps at least 1 HP', () => {
    const s = kiosk();
    expect(applyRaidDamage(s, LOTTIES_CORNER, 0)).toBe(799);
    expect(currentHp(s.plots[LOTTIES_CORNER])).toBe(1);
    expect(applyRaidDamage(s, LOTTIES_CORNER, 0)).toBe(0);
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
    expect(currentHp(ps)).toBe(0); // still a plank pile until the night's work is done
    s.phase = 'report';
    sleepUntilDawn(s);
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
    expect(repairCost(s, LOTTIES_CORNER)).toBe(300); // the Corner's Kiosk: $4,000 with Lottie's $100 table
    s.plots[LOTTIES_CORNER].stand!.hp = 40;
    expect(repairCost(s, LOTTIES_CORNER)).toBe(400);
  });

  it('are paid on approval, run overnight, and the stand opens at dawn as good as new', () => {
    const s = kiosk(10);
    const ps = s.plots[LOTTIES_CORNER];
    ps.stand!.hp = 400;
    const cash = s.cash, repairs = s.today.books?.repairs ?? 0;
    expect(canRepair(s, LOTTIES_CORNER).ok).toBe(true);
    expect(approveRepair(s, LOTTIES_CORNER)).toBe(true);
    expect(s.cash).toBe(cash - 304);
    expect(s.today.books!.repairs).toBe(repairs - 304); // the Ledger's repairs row
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
    const cash = s.cash, repairs = s.today.books?.repairs ?? 0;
    approveRepair(s, LOTTIES_CORNER);
    expect(smash(s, LOTTIES_CORNER, 500, 2).outcome).toBe('smashed');
    expect(ps.repair).toBeUndefined();
    expect(s.cash).toBe(cash);
    expect(s.today.books!.repairs).toBe(repairs); // paid back on the same row
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

describe('Auto-Repair (Rank 3)', () => {
  /** A rank-3 run with two Damaged stands of yours: the Corner (a Kiosk at half HP) and a Folding Table at 10 HP. */
  function twoDamaged(seed = 30) {
    const s = kiosk(seed);
    s.rank = 3;
    const side = PLOTS.find((p) => p.district === 'maple' && !s.plots[p.id].owner && p.type === 'street')!;
    s.plots[side.id] = { owner: 'player', stand: newStand(1), invested: 150, landValue: 300, defense: { tier: 0, fenceHp: 0, gadgets: [] } };
    s.plots[LOTTIES_CORNER].stand!.hp = 400; // $304
    s.plots[side.id].stand!.hp = 10; // 90% of a $150 table lost: $21
    return { s, side: side.id };
  }

  it('books every Damaged plot of yours at closing, paid then and good as new at dawn', () => {
    const { s, side } = twoDamaged();
    s.cash = 1000;
    closeShop(s);
    expect(s.phase).toBe('report');
    expect(s.plots[LOTTIES_CORNER].repair).toMatchObject({ by: 'player', cost: 304, hp: 400 });
    expect(s.plots[side].repair).toMatchObject({ by: 'player', cost: 21, hp: 90 });
    expect(s.cash).toBeLessThanOrEqual(1000 - 325);
    expect(s.news).toContain('Auto-Repair: 2 fixes booked for tonight, $325. Good as new at dawn.');
    expect(sleepUntilDawn(s)).toBe(true);
    expect(isDamaged(s.plots[LOTTIES_CORNER])).toBe(false);
    expect(isDamaged(s.plots[side])).toBe(false);
  });

  it('is a helper in the automation frame: its night on the Ledger, the cash on the Repairs row once', () => {
    const { s } = twoDamaged();
    s.cash = 1000;
    expect(helpers().map((h) => h.id)).toContain(AUTO_REPAIR);
    expect(prepPreview(s).map((p) => p.id)).not.toContain(AUTO_REPAIR); // nothing at dawn or at Open: it books at closing
    closeShop(s);
    const day = s.history[s.history.length - 1];
    expect(day).toBe(s.today); // closing time: the day's record is still open
    expect(day.auto?.[AUTO_REPAIR]).toEqual({ spent: 325, count: 2, amount: 0 });
    expect(helperLines(day).find((h) => h.id === AUTO_REPAIR)).toEqual({ id: AUTO_REPAIR, name: 'Auto-Repair', line: '2 fixes overnight', spent: 325 });
    expect(day.books?.repairs).toBe(-325);
    damageAtClose(s); // nothing left to book: the line stays as it was
    expect(day.auto?.[AUTO_REPAIR]).toEqual({ spent: 325, count: 2, amount: 0 });
  });

  it('waits until Rank 3', () => {
    const { s, side } = twoDamaged();
    s.rank = 2;
    damageAtClose(s);
    expect(s.plots[LOTTIES_CORNER].repair).toBeUndefined();
    expect(s.plots[side].repair).toBeUndefined();
    expect(autoRepairOn(s)).toBe(false);
    expect(toggleAutoRepair(s, side)).toBe(false);
    expect(s.today.auto?.[AUTO_REPAIR]).toBeUndefined();
    expect(helperLines(s.today).map((h) => h.id)).not.toContain(AUTO_REPAIR);
  });

  it('skips the plots you pick, and only yours can be picked', () => {
    const { s, side } = twoDamaged();
    expect(autoRepairs(s, side)).toBe(true);
    expect(toggleAutoRepair(s, side)).toBe(true);
    expect(s.plots[side].noAutoRepair).toBe(true);
    expect(autoRepairs(s, side)).toBe(false);
    damageAtClose(s);
    expect(s.plots[side].repair).toBeUndefined();
    expect(s.plots[LOTTIES_CORNER].repair?.cost).toBe(304);
    expect(s.news).toContain('Auto-Repair: 1 fix booked for tonight, $304. Good as new at dawn.');
    expect(toggleAutoRepair(s, side)).toBe(true); // back on
    expect(s.plots[side].noAutoRepair).toBeUndefined();
    const rival = PLOTS.find((p) => s.plots[p.id].owner === 'hollis' && s.plots[p.id].stand)!;
    expect(toggleAutoRepair(s, rival.id)).toBe(false);
    expect(autoRepairs(s, rival.id)).toBe(false);
  });

  it('fixes the worst first when the cash runs short', () => {
    const { s, side } = twoDamaged();
    s.cash = 100; // enough for the $21 table, not the $304 Kiosk
    s.plots[LOTTIES_CORNER].stand!.hp = 100; // 12.5% HP: $532, the worst
    s.plots[side].stand!.hp = 50; // 50%: $12
    damageAtClose(s);
    expect(s.plots[LOTTIES_CORNER].repair).toBeUndefined();
    expect(s.plots[side].repair?.cost).toBe(12);
    expect(s.cash).toBe(88);
    s.cash = 600; // now the Kiosk too
    damageAtClose(s);
    expect(s.plots[LOTTIES_CORNER].repair?.cost).toBe(532);
    expect(s.cash).toBe(68);
  });

  it('books your rebuilds too, before any repair, and they are up again at dawn', () => {
    const { s, side } = twoDamaged();
    const table = s.plots[side];
    table.stand!.wrecked = true;
    delete table.stand!.hp;
    table.wreckedDay = s.day;
    s.cash = 30; // the $23 rebuild, not the $304 repair as well
    damageAtClose(s);
    expect(table.repair).toEqual({ by: 'player', cost: 23, hp: 100, rebuild: true });
    expect(s.plots[LOTTIES_CORNER].repair).toBeUndefined();
    expect(s.cash).toBe(7);
    expect(s.news).toContain('Auto-Repair: 1 fix booked for tonight, $23. Good as new at dawn.');
    s.phase = 'report';
    expect(sleepUntilDawn(s)).toBe(true);
    expect(table.stand!.wrecked).toBe(false);
    expect(currentHp(table)).toBe(100);
  });

  it('a skip on a plot that is not yours does not survive a load', () => {
    const { s } = twoDamaged();
    const rival = PLOTS.find((p) => s.plots[p.id].owner === 'hollis' && s.plots[p.id].stand)!;
    s.plots[rival.id].noAutoRepair = true;
    s.plots[LOTTIES_CORNER].noAutoRepair = true;
    const back = migrateSave(JSON.parse(JSON.stringify(s)))!;
    expect(back.plots[rival.id].noAutoRepair).toBeUndefined();
    expect(back.plots[LOTTIES_CORNER].noAutoRepair).toBe(true);
  });
});

describe('rebuilds run overnight', () => {
  /** Lottie's Kiosk smashed in the night: the dawn after, with the plank pile and its rebuild to book. */
  function smashedAtNight(seed: number) {
    const s = kiosk(seed);
    s.phase = 'night';
    expect(smash(s, LOTTIES_CORNER, 500, 2).outcome).toBe('smashed');
    expect(canRebuild(s, LOTTIES_CORNER)).toEqual({ ok: false, why: 'Too late tonight: approve it tomorrow' });
    const night = s.day;
    expect(sleepUntilDawn(s)).toBe(true);
    expect(s.day).toBe(night + 1);
    expect(s.plots[LOTTIES_CORNER].owner).toBe('player'); // still time to book it today
    return { s, ps: s.plots[LOTTIES_CORNER] };
  }

  it('are paid on approval; the stand stays closed all day and opens at dawn at full HP', () => {
    const { s, ps } = smashedAtNight(40);
    const cash = s.cash, repairs = s.today.books?.repairs ?? 0;
    expect(canRebuild(s, LOTTIES_CORNER)).toEqual({ ok: true });
    expect(rebuildStand(s, LOTTIES_CORNER)).toBe(true);
    expect(s.cash).toBe(cash - 608);
    expect(s.today.books!.repairs).toBe(repairs - 608); // the Ledger's Repairs and rebuilds row
    expect(ps.repair).toEqual({ by: 'player', cost: 608, hp: 800, rebuild: true });
    expect(rebuilding(ps)).toBe(true);
    expect(canRebuild(s, LOTTIES_CORNER)).toEqual({ ok: false, why: 'Rebuilding tonight' });
    expect(approveRebuild(s, LOTTIES_CORNER)).toBe(false);
    openStand(s);
    simulateRestOfDay(s);
    expect(ps.stand!.wrecked).toBe(true); // a plank pile all day long
    expect(ps.stand!.day.customers).toBe(0);
    expect(s.cash).toBeLessThanOrEqual(cash - 608);
    expect(sleepUntilDawn(s)).toBe(true);
    expect(ps.stand!.wrecked).toBe(false);
    expect(currentHp(ps)).toBe(800);
    expect(ps.repair).toBeUndefined();
    expect(ps.wreckedDay).toBeUndefined();
    expect(s.news).toContain(`Hammers and elbow grease: ${PLOT_BY_ID[LOTTIES_CORNER].name} is back in business.`);
  });

  it('can be booked through the day after the smash, business hours and Evening included, never at night', () => {
    const { s } = smashedAtNight(41);
    for (const phase of ['prep', 'open', 'report'] as const) {
      s.phase = phase;
      expect(canRebuild(s, LOTTIES_CORNER).ok).toBe(true);
    }
    s.phase = 'night';
    expect(canRebuild(s, LOTTIES_CORNER)).toEqual({ ok: false, why: 'Too late: it goes For Sale at dawn' });
    s.phase = 'report';
    s.cash = 100;
    expect(canRebuild(s, LOTTIES_CORNER)).toEqual({ ok: false, why: 'Needs $608' });
    expect(approveRebuild(s, LOTTIES_CORNER)).toBe(false);
    const rival = PLOTS.find((p) => s.plots[p.id].owner === 'hollis' && s.plots[p.id].stand)!;
    expect(canRebuild(s, rival.id)).toEqual({ ok: false, why: 'Not your plot' });
    expect(canUpgradeStand(s, LOTTIES_CORNER)).toEqual({ ok: false, why: 'Rebuild it first' });
  });

  it('an unbooked wreck goes For Sale the dawn after next; a booked one counts as rebuilt', () => {
    const lapse = smashedAtNight(42);
    lapse.s.rank = 2; // no Auto-Repair
    lapse.s.phase = 'report';
    expect(sleepUntilDawn(lapse.s)).toBe(true);
    expect(lapse.s.plots[LOTTIES_CORNER].owner).not.toBe('player');
    const kept = smashedAtNight(42);
    kept.s.rank = 2;
    kept.s.phase = 'report'; // booked in the Evening, the last moment
    expect(approveRebuild(kept.s, LOTTIES_CORNER)).toBe(true);
    expect(sleepUntilDawn(kept.s)).toBe(true);
    expect(kept.s.plots[LOTTIES_CORNER].owner).toBe('player');
    expect(kept.s.plots[LOTTIES_CORNER].stand!.wrecked).toBe(false);
  });

  it('Auto-Repair books the rebuild at closing, in time to keep the plot', () => {
    const { s, ps } = smashedAtNight(43);
    expect(autoRepairs(s, LOTTIES_CORNER)).toBe(true);
    closeShop(s);
    expect(ps.repair).toMatchObject({ by: 'player', cost: 608, rebuild: true });
    expect(sleepUntilDawn(s)).toBe(true);
    expect(ps.stand!.wrecked).toBe(false);
    expect(s.plots[LOTTIES_CORNER].owner).toBe('player');
  });

  it('a rival decides the morning after: it rebuilds overnight (closed that day) or the plot goes For Sale', () => {
    const roll = (want: (x: number) => boolean) => Array.from({ length: 1000 }, (_, k) => k).find((k) => want(nextRandom({ seed: k })))!;
    const setup = () => {
      const s = kiosk(44);
      const p = PLOTS.find((q) => s.plots[q.id].owner === 'hollis' && s.plots[q.id].stand)!;
      const ps = s.plots[p.id];
      ps.stand!.wrecked = true;
      ps.wreckedDay = s.day;
      ps.smashedBy = 'player';
      s.rivals.hollis.cash = 100000;
      budgetOf(s, 'hollis').grow = 1000; // a rival rebuild is Grow money (rivalAi.ts)
      s.day++;
      return { s, p, ps };
    };
    const yes = setup();
    const cost = rebuildCost(yes.ps);
    plotsAtDawn(yes.s, { seed: roll((x) => x < 0.1) }); // Hollis rebuilds 60% of the time
    expect(yes.ps.repair).toMatchObject({ by: 'hollis', cost, rebuild: true });
    expect(yes.s.rivals.hollis.cash).toBe(100000 - cost);
    expect(budgetOf(yes.s, 'hollis').grow).toBeCloseTo(1000 - cost, 2);
    expect(yes.ps.stand!.wrecked).toBe(true); // closed today
    expect(yes.s.news).toContain(`${FACTIONS.hollis.name} rebuild ${yes.p.name} tonight: it opens again tomorrow.`);
    plotsAtDawn(yes.s, { seed: roll((x) => x > 0.9) }); // booked: no second roll and no second bill
    expect(yes.s.plots[yes.p.id].owner).toBe('hollis');
    expect(yes.s.rivals.hollis.cash).toBe(100000 - cost);
    yes.s.day++;
    damageAtDawn(yes.s);
    expect(yes.ps.stand!.wrecked).toBe(false);
    expect(currentHp(yes.ps)).toBe(buildingHp(yes.ps));
    const no = setup();
    plotsAtDawn(no.s, { seed: roll((x) => x > 0.9) });
    expect(no.s.plots[no.p.id].owner).toBeNull();
    expect(no.s.plots[no.p.id].dibs?.who).toBe('player');
  });

  it('a plot bought mid-rebuild comes with the rebuild', () => {
    const s = kiosk(45);
    const p = PLOTS.find((q) => s.plots[q.id].owner === 'hollis' && s.plots[q.id].stand)!;
    const ps = s.plots[p.id];
    ps.stand!.wrecked = true;
    ps.repair = { by: 'hollis', cost: 50, hp: buildingHp({ ...ps, stand: { ...ps.stand!, wrecked: false } }), rebuild: true };
    ps.owner = 'player'; // a Plot Buyout at Morning Prep
    s.day++;
    damageAtDawn(s);
    expect(ps.stand!.wrecked).toBe(false);
    expect(ps.repair).toBeUndefined();
    expect(s.news).toContain(`Hammers and elbow grease: ${p.name} is back in business.`);
  });
});

describe('Storms', () => {
  /** Morning Prep with a Storm in the forecast that comes true when the stands open. */
  function stormyMorning(s: GameState) {
    s.phase = 'prep';
    s.forecast = { kind: 'storm', temp: 60 };
    s.seed = Array.from({ length: 100 }, (_, k) => k).find((k) => nextRandom({ seed: k }) < FORECAST_ACCURACY)!;
  }
  const rivalStands = (s: GameState, level: number) => PLOTS.filter((p) => s.plots[p.id].owner !== 'player' && s.plots[p.id].owner && s.plots[p.id].stand?.level === level && !s.plots[p.id].stand!.wrecked);

  it('take a quarter of the max HP off every L1–L2 stand of every faction as the stands open, and the headline says what to do', () => {
    const s = newGame(50);
    const corner = s.plots[LOTTIES_CORNER];
    const l2 = rivalStands(s, 2), l3 = rivalStands(s, 3);
    expect(l2.length).toBeGreaterThan(0);
    expect(l3.length).toBeGreaterThan(0);
    stormyMorning(s);
    expect(openStand(s)).toBe(true);
    expect(s.weather.kind).toBe('storm');
    expect(currentHp(corner)).toBe(75); // a 100 HP Folding Table
    expect(isWrecked(corner)).toBe(false);
    expect(hpCapacity(corner, 20)).toBe(15); // open, at its HP share
    for (const p of l2) expect(currentHp(s.plots[p.id])).toBe(225); // 300 HP Wooden Stands
    for (const p of l3) expect(isDamaged(s.plots[p.id])).toBe(false); // a Kiosk rides it out
    // Announced as it starts, like a random event; the feed's Storm ticket (src/ui/damage.ts) keeps it up all day, so
    // no alert card melts away under it.
    expect(s.news).toContain(`Storm! ${PLOT_BY_ID[LOTTIES_CORNER].name} takes a beating. Stock light; repair L1–L2 stands.`);
    expect((s.alerts ?? []).some((a) => a.text.startsWith('Storm!'))).toBe(false);
  });

  it('never knock a stand down, and leave a sunny day alone', () => {
    const s = newGame(51);
    const corner = s.plots[LOTTIES_CORNER];
    corner.stand!.hp = 10;
    s.weather = { kind: 'warm', temp: 75 };
    stormAtOpen(s);
    expect(currentHp(corner)).toBe(10);
    expect(s.news.some((n) => n.startsWith('Storm!'))).toBe(false);
    s.weather = { kind: 'storm', temp: 60 };
    stormAtOpen(s);
    expect(currentHp(corner)).toBe(1);
    expect(isWrecked(corner)).toBe(false);
    stormAtOpen(s);
    expect(currentHp(corner)).toBe(1);
  });

  it('a Kiosk-only player still hears the counter-play', () => {
    const s = kiosk(52);
    s.weather = { kind: 'storm', temp: 60 };
    stormAtOpen(s);
    expect(isDamaged(s.plots[LOTTIES_CORNER])).toBe(false);
    expect(s.news).toContain('Storm! Stock light; repair L1–L2 stands.');
  });

  it('a repair booked before the Storm can be topped up for the new damage, and dawn fixes it all', () => {
    const s = newGame(53);
    const corner = s.plots[LOTTIES_CORNER];
    corner.stand!.hp = 50;
    s.cash = 500;
    expect(approveRepair(s, LOTTIES_CORNER)).toBe(true);
    expect(corner.repair).toEqual({ by: 'player', cost: 8, hp: 50 }); // half of Lottie's $100 table: $7.50
    stormyMorning(s);
    openStand(s);
    expect(currentHp(corner)).toBe(25);
    expect(repairCost(s, LOTTIES_CORNER)).toBe(4); // the 25 HP the Storm took: $3.75
    expect(canRepair(s, LOTTIES_CORNER).ok).toBe(true);
    const cash = s.cash;
    expect(approveRepair(s, LOTTIES_CORNER)).toBe(true);
    expect(s.cash).toBe(cash - 4);
    expect(corner.repair).toEqual({ by: 'player', cost: 12, hp: 75 });
    expect(canRepair(s, LOTTIES_CORNER)).toEqual({ ok: false, why: 'Fixing tonight' });
    simulateRestOfDay(s);
    expect(sleepUntilDawn(s)).toBe(true);
    expect(isDamaged(corner)).toBe(false);
  });

  it('a top-up never takes the bill past a rebuild', () => {
    const s = newGame(54);
    const corner = s.plots[LOTTIES_CORNER];
    corner.stand!.hp = 2;
    s.cash = 500;
    approveRepair(s, LOTTIES_CORNER);
    expect(corner.repair!.cost).toBe(15); // 98 of 100 HP lost: $14.70, up to the $15 rebuild
    corner.stand!.hp = 1;
    expect(repairCost(s, LOTTIES_CORNER)).toBe(0);
    expect(approveRepair(s, LOTTIES_CORNER)).toBe(true);
    expect(corner.repair).toEqual({ by: 'player', cost: 15, hp: 99 });
  });

  it('Auto-Repair books the Storm damage at closing; rivals repair theirs when they can spare the cash', () => {
    const s = newGame(55);
    s.rank = 3;
    s.cash = 1000;
    const l2 = rivalStands(s, 2)[0];
    s.rivals[s.plots[l2.id].owner as RivalId].cash = 100000;
    stormyMorning(s);
    openStand(s);
    simulateRestOfDay(s);
    expect(s.plots[LOTTIES_CORNER].repair).toMatchObject({ by: 'player', hp: 25 });
    expect(s.plots[l2.id].repair).toMatchObject({ by: s.plots[l2.id].owner, hp: 75 });
    expect(sleepUntilDawn(s)).toBe(true);
    expect(isDamaged(s.plots[LOTTIES_CORNER])).toBe(false);
    expect(isDamaged(s.plots[l2.id])).toBe(false);
  });
});

describe('saves', () => {
  it('a booked rebuild survives a save and load; work that cannot happen is dropped', () => {
    const s = kiosk(19);
    const ps = s.plots[LOTTIES_CORNER];
    ps.stand!.wrecked = true;
    ps.wreckedDay = s.day;
    expect(approveRebuild(s, LOTTIES_CORNER)).toBe(true);
    const back = migrateSave(JSON.parse(JSON.stringify(s)))!;
    expect(back.plots[LOTTIES_CORNER].repair).toEqual({ by: 'player', cost: 608, hp: 800, rebuild: true });
    ps.stand!.wrecked = false; // a rebuild booked on a standing building
    migrateDamage(s);
    expect(ps.repair).toBeUndefined();
    ps.stand!.hp = 400;
    ps.repair = { by: 'player', cost: 304, hp: 400, rebuild: 'yes' as never };
    migrateDamage(s);
    expect(ps.repair).toBeUndefined();
  });

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
