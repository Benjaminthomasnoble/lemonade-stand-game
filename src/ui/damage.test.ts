import { describe, expect, it } from 'vitest';
import {
  approveRebuild, approveRepair, damageAtClose, LESSON_DAY, LOTTIES_CORNER, newGame, newStand, PLOTS, stormAtOpen, toggleAutoRepair, upgradeStand,
  type GameState,
} from '../sim/economy.ts';
import { helperRows } from './automation.ts';
import { damageCard, damageHere, damageTickets, rebuildButton, rebuildTickets, stormTicket, wreckNote } from './damage.ts';
import { repairCards } from './evening.ts';

/** Lottie's Corner as the spec's Kiosk ($4,050 from a table built new, 800 HP, 120 cups an hour) at Morning Prep. */
function kiosk(): GameState {
  const s = newGame(21);
  s.rank = 6;
  s.cash = 100000;
  s.phase = 'prep';
  delete s.plots[LOTTIES_CORNER].stand!.startTable; // not Lottie's own $100 table
  upgradeStand(s, LOTTIES_CORNER);
  upgradeStand(s, LOTTIES_CORNER);
  return s;
}

describe('the HP readout and the repair', () => {
  it('a stand at full HP shows a full meter with its points in the tooltip, and no repair', () => {
    const s = kiosk();
    const row = damageHere(s, LOTTIES_CORNER);
    expect(row).toContain('cl-snake hp');
    expect(row).toContain('--v:1.000');
    expect(row).toContain('The Kiosk: 800/800 HP');
    expect(row).not.toContain('data-action="repair"');
    expect(damageTickets(s)).toEqual([]);
  });

  it('a Damaged stand of yours shows what it still pours and a Repair button with the price', () => {
    const s = kiosk();
    s.plots[LOTTIES_CORNER].stand!.hp = 400;
    const row = damageHere(s, LOTTIES_CORNER);
    expect(row).toContain('--v:0.500');
    expect(row).toContain('400/800 HP. Damaged: pours 60 of 120 cups an hour until repaired');
    expect(row).toContain(`data-action="repair" data-plot="${LOTTIES_CORNER}"`);
    expect(row).toContain('Repair $304');
    expect(row).not.toContain('disabled');
    const [ticket] = damageTickets(s);
    expect(ticket).toContain('data-testid="damaged"');
    expect(ticket).toContain(`data-action="goto" data-plot="${LOTTIES_CORNER}"`);
    expect(ticket).toContain('Repair $304');
  });

  it('says why a repair cannot be approved, and shows a booked one as fixing tonight', () => {
    const s = kiosk();
    s.plots[LOTTIES_CORNER].stand!.hp = 400;
    s.phase = 'night';
    expect(damageHere(s, LOTTIES_CORNER)).toContain('disabled title="Too late tonight: approve it tomorrow"');
    s.phase = 'report';
    s.cash = 10;
    expect(damageHere(s, LOTTIES_CORNER)).toContain('disabled title="Needs $304"');
    s.cash = 1000;
    approveRepair(s, LOTTIES_CORNER);
    const row = damageHere(s, LOTTIES_CORNER);
    expect(row).toContain('Fixing tonight');
    expect(row).toContain('Paid $304: good as new at dawn');
    expect(row).not.toContain('data-action="repair"');
  });

  it("a rival's Damaged stand shows its meter but no repair; a Wrecked one shows none", () => {
    const s = kiosk();
    const rival = PLOTS.find((p) => s.plots[p.id].owner === 'hollis' && s.plots[p.id].stand)!;
    s.plots[rival.id].stand!.hp = 1;
    const row = damageHere(s, rival.id);
    expect(row).toContain('cl-snake hp');
    expect(row).not.toContain('Repair');
    s.plots[LOTTIES_CORNER].stand!.wrecked = true;
    expect(damageHere(s, LOTTIES_CORNER)).not.toContain('cl-snake');
    expect(damageHere(s, LOTTIES_CORNER)).not.toContain('data-action="repair"');
  });

  it("the stand panel's Defend card shows the selected stand's HP, and its repair once Damaged", () => {
    const s = kiosk();
    const full = damageCard(s, LOTTIES_CORNER);
    expect(full).toContain('data-testid="stand-hp"');
    expect(full).toContain('<b>The Kiosk</b>');
    expect(full).toContain('--v:1.000');
    expect(full).toContain('title="The Kiosk: 800/800 HP"');
    expect(full).not.toContain('data-action="repair"');
    s.plots[LOTTIES_CORNER].stand!.hp = 400;
    const card = damageCard(s, LOTTIES_CORNER);
    expect(card).toContain('--v:0.500');
    expect(card).toContain('400/800 HP. Damaged: pours 60 of 120 cups an hour until repaired');
    expect(card).toContain(`<button class="cl-b go" data-action="repair" data-plot="${LOTTIES_CORNER}"`);
    expect(card).toContain('Repair $304');
    const rival = PLOTS.find((p) => s.plots[p.id].owner === 'hollis' && s.plots[p.id].stand)!;
    expect(damageCard(s, rival.id)).toBe('');
    s.plots[LOTTIES_CORNER].stand!.wrecked = true;
    expect(damageCard(s, LOTTIES_CORNER)).toBe('');
  });

  it('from Rank 3 your plots get an Auto-Repair switch, on until you skip the plot', () => {
    const s = kiosk();
    s.rank = 2;
    expect(damageHere(s, LOTTIES_CORNER)).not.toContain('autoRepair');
    s.rank = 3;
    const on = damageHere(s, LOTTIES_CORNER);
    expect(on).toContain(`<button class="cl-toggle on" data-action="autoRepair" data-plot="${LOTTIES_CORNER}" data-testid="auto-repair" aria-pressed="true"`);
    expect(on).toContain('Tap to skip this plot');
    expect(damageCard(s, LOTTIES_CORNER)).toContain('data-action="autoRepair"');
    toggleAutoRepair(s, LOTTIES_CORNER);
    const off = damageHere(s, LOTTIES_CORNER);
    expect(off).toContain('<button class="cl-toggle" data-action="autoRepair"');
    expect(off).toContain('aria-pressed="false"');
    s.plots[LOTTIES_CORNER].stand!.wrecked = true; // a smashed plot keeps its switch: Auto-Repair rebuilds too
    expect(damageHere(s, LOTTIES_CORNER)).toContain('data-action="autoRepair"');
    const rival = PLOTS.find((p) => s.plots[p.id].owner === 'hollis' && s.plots[p.id].stand)!;
    expect(damageHere(s, rival.id)).not.toContain('autoRepair');
  });

  it("Auto-Repair's night is a line in the day's Ledger", () => {
    const s = kiosk();
    s.rank = 3;
    s.plots[LOTTIES_CORNER].stand!.hp = 400;
    expect(helperRows(s.today)).not.toContain('ledger-repair');
    damageAtClose(s);
    expect(helperRows(s.today)).toContain('<tr data-testid="ledger-repair"><td>Auto-Repair: 1 fix overnight</td><td>$304.00</td></tr>');
  });

  it('the Evening repair cards list your Damaged buildings', () => {
    const s = kiosk();
    s.phase = 'report';
    expect(repairCards(s).join('')).not.toContain('data-testid="damaged"');
    s.plots[LOTTIES_CORNER].stand!.hp = 200;
    const cards = repairCards(s).join('');
    expect(cards).toContain('data-testid="damaged"');
    expect(cards).toContain('Repair $456');
  });
});

describe('Storms', () => {
  it('a Storm forecast puts a stock-light ticket in the Morning Prep feed, naming the stands at risk', () => {
    const s = newGame(22);
    s.phase = 'prep';
    expect(stormTicket(s)).toEqual([]);
    s.forecast = { kind: 'storm', temp: 60 };
    expect(stormTicket(s)).toEqual([]); // Day 1: the forecast's lesson hasn't come yet
    s.day = LESSON_DAY.forecast;
    const [ticket] = stormTicket(s);
    expect(ticket).toContain('data-testid="storm"');
    expect(ticket).toContain('<b>Storm: stock light</b>');
    expect(ticket).toContain('Your L1–L2 stand loses a quarter of its HP at the open. Repair it by the Evening');
    s.phase = 'open';
    expect(stormTicket(s)).toEqual([]);
    const k = kiosk();
    k.forecast = { kind: 'storm', temp: 60 };
    k.settings.lessons = false; // lessons off: every button follows rank alone
    expect(stormTicket(k)[0]).toContain('title="Storm forecast: few customers."');
  });

  it('a Storm day keeps its ticket up while the stands are open: the counter-play, Go There and the repair', () => {
    const s = newGame(23);
    s.cash = 500;
    s.forecast = { kind: 'rainy', temp: 55 }; // the forecast missed: no Morning Prep ticket warned of it
    s.weather = { kind: 'storm', temp: 55 };
    s.phase = 'open';
    stormAtOpen(s); // the Corner's table: 75 of 100 HP
    let [ticket] = stormTicket(s);
    expect(ticket).toContain('data-testid="storm"');
    expect(ticket).toContain('<b>Storm</b>');
    expect(ticket).toContain('Stock light; repair L1–L2 stands');
    expect(ticket).toContain('--v:0.750');
    expect(ticket).toContain(`data-action="goto" data-plot="${LOTTIES_CORNER}"`);
    expect(ticket).toContain(`data-action="repair" data-plot="${LOTTIES_CORNER}"`);
    expect(ticket).toContain('Repair $4'); // a quarter of Lottie's $100 table at 15%
    s.minute += 300; // hours later the ticket is still up, unlike a small alert card
    expect(stormTicket(s)).toHaveLength(1);
    approveRepair(s, LOTTIES_CORNER);
    [ticket] = stormTicket(s);
    expect(ticket).toContain('Fixing tonight');
    expect(ticket).not.toContain('data-action="repair"');
    s.phase = 'report'; // the Evening's repair cards take over
    expect(stormTicket(s)).toEqual([]);
  });

  it("puts the worst-hit stand still to book on the ticket; a crew with no L1–L2 stand gets the counter-play alone", () => {
    const s = newGame(24);
    s.cash = 500;
    const side = PLOTS.find((p) => p.district === 'maple' && p.type === 'street' && !s.plots[p.id].owner)!;
    s.plots[side.id] = { owner: 'player', stand: newStand(1), invested: 150, landValue: 300, defense: { tier: 0, fenceHp: 0, gadgets: [] } };
    s.plots[side.id].stand!.hp = 50;
    s.weather = { kind: 'storm', temp: 55 };
    s.phase = 'open';
    stormAtOpen(s); // the Corner at 75, the side table at 25
    expect(stormTicket(s)[0]).toContain(`data-action="repair" data-plot="${side.id}"`);
    expect(stormTicket(s)[0]).toContain('2 of your L1–L2 stands took a beating');
    approveRepair(s, side.id);
    expect(stormTicket(s)[0]).toContain(`data-action="repair" data-plot="${LOTTIES_CORNER}"`);
    const k = kiosk();
    k.weather = { kind: 'storm', temp: 55 };
    k.phase = 'open';
    stormAtOpen(k);
    const [only] = stormTicket(k);
    expect(only).toContain('Stock light; repair L1–L2 stands');
    expect(only).not.toContain('data-action=');
  });

  it('damage after a booked repair brings the Repair button back to top it up', () => {
    const s = kiosk();
    s.plots[LOTTIES_CORNER].stand!.hp = 400;
    approveRepair(s, LOTTIES_CORNER);
    expect(damageHere(s, LOTTIES_CORNER)).toContain('Fixing tonight');
    s.plots[LOTTIES_CORNER].stand!.hp = 200; // a daytime raid after the booking
    const row = damageHere(s, LOTTIES_CORNER);
    expect(row).not.toContain('Fixing tonight');
    expect(row).toContain(`title="Adds to tonight's repair: good as new at dawn"`);
    expect(row).toContain('Repair $152');
  });
});

describe('the rebuild', () => {
  it('a smashed plot of yours gets a Rebuild button and a ticket, then a note once it is booked for tonight', () => {
    const s = kiosk();
    const ps = s.plots[LOTTIES_CORNER];
    ps.stand!.wrecked = true;
    ps.wreckedDay = s.day - 1; // smashed last night: today is the last day to book it
    const btn = rebuildButton(s, LOTTIES_CORNER);
    expect(btn).toContain(`data-action="rebuild" data-plot="${LOTTIES_CORNER}" data-testid="rebuild"`);
    expect(btn).toContain('title="Built overnight: open at dawn. Book it today or the plot goes For Sale"');
    expect(btn).toContain('Rebuild $608');
    const [ticket] = rebuildTickets(s);
    expect(ticket).toContain('cl-ticket red');
    expect(ticket).toContain('data-testid="wrecked"');
    expect(ticket).toContain(`data-action="goto" data-plot="${LOTTIES_CORNER}"`);
    expect(ticket).toContain('Rebuild $608');
    expect(wreckNote(s, LOTTIES_CORNER)).toContain('Wrecked');
    s.phase = 'night';
    expect(rebuildButton(s, LOTTIES_CORNER)).toContain('disabled title="Too late: it goes For Sale at dawn"');
    s.phase = 'report';
    expect(repairCards(s).join('')).toContain('data-testid="repair"');
    expect(approveRebuild(s, LOTTIES_CORNER)).toBe(true);
    expect(rebuildButton(s, LOTTIES_CORNER)).toContain('Rebuilding tonight');
    expect(rebuildButton(s, LOTTIES_CORNER)).not.toContain('data-action="rebuild"');
    const cards = repairCards(s).join('');
    expect(cards).toContain('Rebuilding tonight');
    expect(cards).not.toContain('cl-ticket red');
  });

  it('a Busted stand gets a Fix button that never lapses', () => {
    const s = kiosk();
    const ps = s.plots[LOTTIES_CORNER];
    ps.stand!.wrecked = true;
    ps.busted = true;
    ps.wreckedDay = s.day - 1;
    const btn = rebuildButton(s, LOTTIES_CORNER);
    expect(btn).toContain('Fix $405');
    expect(btn).toContain('title="Fixed overnight: open at dawn"');
    expect(rebuildTickets(s)[0]).toContain('Busted: closed until you fix it');
    expect(wreckNote(s, LOTTIES_CORNER)).toContain('Busted');
  });

  it("a rival's smashed plot shows Wrecked, then Rebuilding once it books one, and never a button", () => {
    const s = kiosk();
    const rival = PLOTS.find((p) => s.plots[p.id].owner === 'hollis' && s.plots[p.id].stand)!;
    expect(wreckNote(s, rival.id)).toBe('');
    s.plots[rival.id].stand!.wrecked = true;
    expect(wreckNote(s, rival.id)).toContain('Wrecked');
    s.plots[rival.id].repair = { by: 'hollis', cost: 60, hp: 300, rebuild: true };
    expect(wreckNote(s, rival.id)).toContain('Rebuilding');
    expect(rebuildButton(s, rival.id)).toBe('');
    expect(rebuildTickets(s)).toEqual([]);
  });
});
