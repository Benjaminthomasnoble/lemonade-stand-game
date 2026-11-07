import { describe, expect, it } from 'vitest';
import {
  alert, clockText, CLOSE, hhmm, LOTTIES_CORNER, newGame, nightStep, PERIMETERS, planRaid, raidBoss, raidPartyFor, raidTargets, squadTrip, startNight,
  type GameState, type Guard, type Raid,
} from '../sim/economy.ts';
import { DEFAULT_OPTIONS } from '../settings.ts';
import { alertCards } from './alerts.ts';
import * as A from './clay.ts';
import { span, tripLines, tripNote } from './trips.ts';
import { fenceHere } from './evening.ts';
import { optionsScreen } from './options.ts';
import { dawnPicks, savesPanel } from './saves.ts';
import type { SlotInfo } from '../save.ts';
import { isFullMenu, menuScreen, menuUnlocked } from './menus.ts';
import { keyName, keysPanel } from './keys.ts';
import { defaultKeys } from '../settings.ts';
import { openStands, simulateRestOfDay, sleepUntilDawn, successScore } from '../sim/economy.ts';
import { scoreParts, scoreTip, threatTip } from './meters.ts';
import { customPanel, difficultyLabel, pickCustom } from './custom.ts';
import { defaultSettings, DISTRICT_BY_ID } from '../sim/economy.ts';

/** Night has fallen on Day 8 and a Blenders raid on Lottie's Corner has just been warned. */
function warned(over: Partial<Raid> = {}): { s: GameState; r: Raid } {
  const s = newGame(7);
  s.phase = 'report';
  s.minute = CLOSE;
  s.raids = [];
  const r: Raid = { id: 'w1', attacker: 'blenders', target: LOTTIES_CORNER, objective: 'smash', party: raidPartyFor(s, 'blenders'), detected: true, eta: hhmm(22 * 60), leave: 21 * 60, at: 22 * 60, ...over };
  s.raids.push(r);
  startNight(s);
  while (!r.warned) nightStep(s);
  return { s, r };
}

describe('the raid warning card', () => {
  it('names the raider, the target and the ETA with a live countdown, red-edged with Go There', () => {
    const { s } = warned();
    const [card] = alertCards(s);
    expect(card).toContain('data-testid="raid-warning"');
    expect(card).toContain('cl-ticket red');
    expect(card).toContain('Blenders');
    expect(card).toContain("Lottie's Corner");
    expect(card).toContain('10:00pm · 60 min');
    expect(card).toContain(`data-action="goto" data-plot="${LOTTIES_CORNER}"`);
    nightStep(s);
    expect(alertCards(s)[0]).toContain('10:00pm · 59 min');
  });

  it('shows the party only when a Watchtower on the plot sees it', () => {
    const { s } = warned();
    expect(alertCards(s)[0]).not.toContain('cl-vs');
    s.plots[LOTTIES_CORNER].defense.gadgets.push('watchtower');
    expect(alertCards(s)[0]).toContain('cl-vs');
  });

  it('offers the next fence until Ring the Bell lands, and tells an undetected raid apart', () => {
    const { s } = warned({ detected: false, launched: true, warnAt: 22 * 60 - 15 }); // missed as they set out
    expect(s.minute).toBe(22 * 60 - 15);
    s.cash = 1000;
    const card = alertCards(s)[0];
    expect(card).toContain('10:00pm · 15 min');
    expect(card).toContain('data-action="perimeter"');
    expect(card).toContain(`${PERIMETERS[0].name.split(' ')[0]} $${PERIMETERS[0].cost}`);
    expect(card).toContain('Undetected: they strike first.');
  });

  it("with a Watchtower: what they're after, and a count past six raiders", () => {
    const { s, r } = warned();
    s.plots[LOTTIES_CORNER].defense.gadgets.push('watchtower');
    const vs = (c: string) => c.slice(c.indexOf('cl-vs'));
    const smash = alertCards(s)[0];
    expect(smash).toContain(`${r.party!.length} coming for a smash`);
    r.objective = 'shakedown';
    r.party = Array.from({ length: 8 }, () => r.party![0]);
    const card = alertCards(s)[0];
    expect(vs(card).slice(0, 200)).not.toBe(vs(smash).slice(0, 200)); // a money bag, not a boom
    expect(card).toContain('<i>+2</i>');
    expect(card).toContain('8 coming for the till');
  });

  it('goes when the raid hits', () => {
    const { s } = warned();
    while (s.minute < 22 * 60) nightStep(s);
    expect(alertCards(s).some((c) => c.includes('raid-warning'))).toBe(false);
  });

  it('a Watchtower names the boss at the head and the lookouts; a split raid says how many plots it hits', () => {
    const { s, r } = warned({ attacker: 'hollis', lookouts: 2, group: 'w1' });
    r.party = [raidBoss(s, 'hollis'), ...r.party!];
    s.raids.push({ ...r, id: 'w2', target: raidTargets(s)[0].id, warned: false }); // the other part (on a plot of theirs here: only the count matters)
    s.plots[LOTTIES_CORNER].defense.gadgets.push('watchtower');
    const card = alertCards(s)[0];
    expect(card).toContain('Tilly Hollis leads them.');
    expect(card).toContain('2 lookouts.');
    expect(card).toContain('One of 2 plots they hit tonight.');
    s.plots[LOTTIES_CORNER].defense.gadgets = [];
    expect(alertCards(s)[0]).not.toContain('leads them'); // no tower, no sighting
  });

  it('on the tutorial raid Dex is among the shields, wherever he is posted', () => {
    const { s } = warned({ tutorial: true });
    s.plots[LOTTIES_CORNER].defense.gadgets.push('watchtower');
    const mark = 'M32 6l20 8v14c0 13-8 23-20 28-12-5-20-15-20-28V14z'; // the shield's outline (clay.ts shieldSVG)
    expect(A.shieldSVG()).toContain(mark);
    const shields = (c: string) => c.split(mark).length - 1;
    expect(s.guards.filter((g) => g.post === LOTTIES_CORNER)).toHaveLength(0);
    expect(shields(alertCards(s)[0])).toBe(1);
  });
});

describe('a sold-out card', () => {
  it('offers Restock now only while the stands are open; after closing it keeps Go There', () => {
    const s = newGame(5);
    openStands(s);
    alert(s, { kind: 'soldout', text: "Sold out at Lottie's Corner!", plot: LOTTIES_CORNER });
    expect(alertCards(s)[0]).toContain('data-action="restockNow"');
    for (const phase of ['report', 'night'] as const) {
      s.phase = phase;
      expect(alertCards(s)[0]).not.toContain('restockNow');
      expect(alertCards(s)[0]).toContain('data-action="goto"');
    }
  });
});

describe('the Evening on the map', () => {
  it("an owned stand's card offers its next fence after closing, never in business hours", () => {
    const s = newGame(3);
    s.cash = 1000;
    s.phase = 'open';
    expect(fenceHere(s, LOTTIES_CORNER)).toBe('');
    s.phase = 'report';
    expect(fenceHere(s, LOTTIES_CORNER)).toContain('data-action="perimeter"');
    s.phase = 'night';
    expect(fenceHere(s, LOTTIES_CORNER)).toContain('data-testid="fence-here"');
    s.cash = 10;
    expect(fenceHere(s, LOTTIES_CORNER)).toMatch(/disabled title="Needs \$/); // short of cash: shown, with the reason
  });

  it('a locked fence stays hidden; a dented one offers its patch', () => {
    const s = newGame(3);
    s.phase = 'report';
    s.cash = 5000;
    const ps = s.plots[LOTTIES_CORNER];
    ps.defense.tier = 1;
    ps.defense.fenceHp = PERIMETERS[0].hp;
    s.rank = PERIMETERS[1].rank - 1;
    expect(fenceHere(s, LOTTIES_CORNER)).toBe('');
    ps.defense.fenceHp = Math.round(PERIMETERS[0].hp / 2);
    expect(fenceHere(s, LOTTIES_CORNER)).toContain('data-action="repairFence"');
  });
});

describe('the Options screen', () => {
  it('has the master switch, one switch per major alert (the raid one per run), quiet nights, auto-continue and text size', () => {
    const s = newGame(1, { difficulty: 'cutthroat' });
    const html = optionsScreen({ ...DEFAULT_OPTIONS, pause: { ...DEFAULT_OPTIONS.pause } }, s);
    for (const key of ['autoPause', 'raidPause', 'pause.delivery', 'pause.vip', 'pause.red', 'quietNights', 'autoContinue', 'reducedMotion']) {
      expect(html).toContain(`data-key="${key}"`);
    }
    expect(html).toMatch(/data-key="raidPause" data-testid="opt-raidPause" aria-pressed="false"/); // Cutthroat: off by default
    expect(html).toMatch(/data-key="autoContinue" data-testid="opt-autoContinue" aria-pressed="false"/);
    expect(html).toMatch(/data-key="quietNights" data-testid="opt-quietNights" aria-pressed="true"/);
    expect(html).toContain('data-value="150"');
    const off = optionsScreen({ ...DEFAULT_OPTIONS, autoPause: false, pause: { ...DEFAULT_OPTIONS.pause } }, s);
    expect(off).not.toContain('data-key="pause.vip"'); // the master switch off: the rest have nothing to do
  });
});

describe('the ten menus', () => {
  const parts = () => ({ head: ['HOT ONE!', 'Thirsty town expected'] as [string, string], goals: [], crew: () => 'CREW', options: { ...DEFAULT_OPTIONS, keys: defaultKeys() } });
  const played = (days: number) => {
    const s = newGame(5);
    for (let d = 0; d < days; d++) { s.cash = Math.max(s.cash, 80); openStands(s); simulateRestOfDay(s); sleepUntilDawn(s); }
    return s;
  };

  it('nothing shows before its system unlocks; the corner lists the open ones with their keys', () => {
    const s = newGame(5);
    expect(menuUnlocked(s, 'ledger')).toBe(false); // no books before the first day
    expect(menuUnlocked(s, 'crew')).toBe(false);
    expect(menuUnlocked(s, 'planner')).toBe(false);
    expect(menuUnlocked(s, 'rank') && menuUnlocked(s, 'goals') && menuUnlocked(s, 'stand') && menuUnlocked(s, 'bugle')).toBe(true);
    const list = menuScreen(s, 'index', parts());
    expect(list).toContain('data-menu="rank"');
    expect(list).not.toContain('data-menu="ledger"');
    expect(list).toContain('Rank and Perks <b>R</b>');
    const later = played(2);
    expect(menuUnlocked(later, 'ledger')).toBe(true);
    expect(isFullMenu('ledger') && !isFullMenu('goals') && !isFullMenu('stand') && isFullMenu('index')).toBe(true);
  });

  it('the Ledger charts profit and the Success Score day by day, over the daily books', () => {
    const s = played(3);
    const html = menuScreen(s, 'ledger', parts());
    expect(html.match(/<svg /g)).toHaveLength(2);
    expect(html.match(/<rect /g)).toHaveLength(3); // a profit bar a day
    expect(html.match(/<circle /g)).toHaveLength(3); // a score dot a day
    for (const d of s.history) expect(html).toContain(`<td>Day ${d.day}</td>`);
  });

  it('the Order Book names client, recipe, size, deadline and pay, and flags a possible Delivery Raid', () => {
    const s = newGame(5);
    s.rank = 6;
    s.offers.push({ id: 'o1', tier: 'heli', client: 'Gulfstream Grocers', qty: 3000, pay: 90000, due: 9, expires: 4, accepted: false });
    const html = menuScreen(s, 'orders', parts());
    expect(html).toContain('Gulfstream Grocers: $90,000');
    expect(html).toContain('3,000 bottles of Classic Lemonade · day 9');
    expect(html).toContain('Delivery Raid possible'); // Rank 6 is Threat 3
    expect(html).toContain('data-action="accept" data-id="o1"');
  });

  it('Rank and Perks shows the ladder and how far the next rank is; lists open plot cards on the map', () => {
    const s = newGame(5);
    const html = menuScreen(s, 'rank', parts());
    expect(html).toContain('<b>R1 Sidewalk Squeezer</b>');
    expect(html).toMatch(/R2 Corner Hustler<\/td><td>\$1,500 \(\$[\d,]+ to go\)/);
    expect(menuScreen(s, 'corkboard', parts()).match(/data-action="inspect"/g)!.length).toBeGreaterThan(3);
    expect(menuScreen(s, 'registry', parts())).toContain('data-action="inspect"');
    expect(menuScreen(s, 'crew', parts())).toContain('CREW');
  });

  it("the Bugle prints the forecast, the market, today's events and the week's calendar, each with district and length", () => {
    const s = newGame(5);
    s.day = 5; // the Surf Contest's second day; the Summer Fair and Founders' Day come on Day 8
    const html = menuScreen(s, 'bugle', parts());
    expect(html).toContain('HOT ONE!');
    expect(html).toContain('title="Market prices a pack today"');
    expect(html).toContain(`Today: Surf Contest, ${DISTRICT_BY_ID.boardwalk.name}, 3 days`);
    expect(html).toContain(`Days 8-14: Summer Fair, ${DISTRICT_BY_ID.oldtown.name}`);
    expect(html).toContain(`Day 8: Founders' Day, ${DISTRICT_BY_ID.downtown.name}`);
    expect(html.match(/data-testid="bugle-calendar"/g)).toHaveLength(3);
  });

  it('Options lists every key, remappable, with the screens, captions and °C switches', () => {
    const o = { ...DEFAULT_OPTIONS, pause: { ...DEFAULT_OPTIONS.pause }, keys: defaultKeys() };
    const keys = keysPanel(o, 'turnLeft');
    expect(keys.match(/data-action="remap"/g)).toHaveLength(Object.keys(defaultKeys()).length);
    expect(keys).toContain('Pan up <b>W</b>');
    expect(keys).toContain('Turn left <b>…</b>'); // waiting for its key
    expect(keys).not.toContain('resetKeys');
    o.keys.ledger = 'KeyX';
    expect(keysPanel(o, null)).toContain('data-action="resetKeys"');
    expect(keyName('Digit2')).toBe('2');
    const html = optionsScreen(o, newGame(1), '', keys);
    for (const key of ['pause.screens', 'captions', 'celsius']) expect(html).toContain(`data-key="${key}"`);
  });
});

describe('the top bar explains itself', () => {
  it('the Success Score breaks down into cash, land, 75% of buildings, stock and loans, with today and the Peak', () => {
    const s = newGame(5);
    const p = scoreParts(s);
    expect(Math.abs(p.cash + p.land + p.buildings + p.stock - p.loans - successScore(s))).toBeLessThan(1);
    const tip = scoreTip(s);
    for (const line of ['Cash $', '+ land $', '+ 75% of buildings $', '+ stock at cost $', 'Today +$0', 'Peak $']) expect(tip).toContain(line);
  });

  it("Threat names the rank that set it, and Laid Back's nudge", () => {
    const s = newGame(5);
    s.rank = 4;
    expect(threatTip(s)).toMatch(/^Threat 2: set by Rank 3, Block Boss\n/);
    const easy = newGame(5, { difficulty: 'laidback' });
    easy.rank = 5;
    expect(threatTip(easy)).toMatch(/^Threat 2: set by Rank 5, District Big Shot; Laid Back −1\n/);
  });
});

describe('the Saves panel', () => {
  const at = (day: number, seq: number, over: Partial<SlotInfo> = {}): SlotInfo => ({
    runId: 'r', day, minute: 420, phase: 'prep', rank: 2, score: 1234, mode: 'campaign', difficulty: 'classic', seq, date: '2026-11-07', ...over,
  });

  it('each manual slot saves and (once full) loads; dawns list newest first; mid-day saves show the time', () => {
    const html = savesPanel(newGame(1), { dawn: [at(4, 3), at(2, 1), at(3, 2)], manual: [null, at(6, 9, { phase: 'open', minute: 14 * 60 + 30 }), null] });
    expect(html.match(/data-testid="save-slot"/g)).toHaveLength(3);
    expect(html.match(/data-action="saveSlot"/g)).toHaveLength(3);
    expect(html).toContain('data-testid="load-1"');
    expect(html).not.toContain('data-testid="load-0"');
    expect(html).toContain(`Day 6, ${clockText(14 * 60 + 30)} · R2 · $1,234`);
    expect(html).toContain('Campaign, Classic');
    const order = ['load-dawn-0', 'load-dawn-2', 'load-dawn-1'].map((id) => html.indexOf(id));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(html).toContain('Day 4 · R2'); // a dawn shows no time: it is always 07:00
  });

  it('Ironman keeps one save: no slots to save to or load', () => {
    const html = savesPanel(newGame(1, { ironman: true }), { dawn: [at(4, 3), null, null], manual: [at(5, 4), null, null] });
    expect(html).toContain('Ironman: one save only');
    expect(html).not.toContain('data-action');
    expect(optionsScreen({ ...DEFAULT_OPTIONS, pause: { ...DEFAULT_OPTIONS.pause } }, newGame(1), 'SAVES')).toContain('SAVES');
  });

  it("a lost run offers its older dawns beside 'Try that day again'", () => {
    const html = dawnPicks([{ slot: 1, info: at(5, 3) }, { slot: 0, info: at(4, 2) }, { slot: 2, info: at(3, 1) }]);
    expect(html).not.toContain('Day 5'); // the newest is "Try that day again" itself
    expect(html).toContain('data-slot="0"');
    expect(html).toContain('>Day 3<');
    expect(dawnPicks([{ slot: 1, info: at(5, 3) }])).toBe('');
  });
});

describe('VIP cards', () => {
  it("a first arrival's card offers Watch up front; a regular's small card offers it too", () => {
    const s = newGame(3);
    const scene = { kind: 'ship', big: false, client: 'Gulfstream Grocers' } as const;
    alert(s, { kind: 'vip', text: 'First ship in: Gulfstream Grocers!', plot: LOTTIES_CORNER, order: 'o1', scene });
    alert(s, { kind: 'pickup', text: 'Ship in: Gulfstream Grocers', plot: LOTTIES_CORNER, order: 'o2', scene }, false);
    const [regular, first] = alertCards(s);
    expect(first).toContain('data-testid="vip-watch"');
    expect(first).toContain('cl-b tiny go" data-action="watch"');
    expect(regular).toContain('data-action="watch"');
    expect(regular).not.toContain('tiny go" data-action="watch"');
    expect(regular).toContain('data-action="goto"');
  });
});

describe('your raids on the Planner and the Evening', () => {
  const crew = (n: number, post: string | null): Guard[] =>
    Array.from({ length: n }, (_, i) => ({ id: `g${i}`, name: `Test ${i}`, trait: 'Loyal', level: 5, xp: 0, weapon: 'hatchets', gear: 'pro', post, outUntil: 0, fee: 0 }) as Guard);

  it('the Planner shows the walk each way and the posts left empty till about when', () => {
    const s = newGame(4);
    s.rank = 6;
    s.phase = 'report';
    s.minute = CLOSE;
    s.guards = [...crew(2, LOTTIES_CORNER), ...crew(3, null).slice(2)];
    const target = raidTargets(s)[0].id;
    const t = squadTrip(s, target, 'tonight');
    const note = tripNote(s, target, ['g0', 'g1', 'g2']);
    expect(note).toContain(`${span(t.travel)} each way`);
    expect(note).toContain(`2 posts empty till ~${clockText(t.back)}`); // g2 has no post to leave
    expect(tripNote(s, target, ['g2'])).not.toContain('raid-posts');
    expect(span(90)).toBe('1h 30m');
    expect(span(120)).toBe('2h');
  });

  it("the Evening lists each raid out with its arrival, and a squad walking home with when it's in", () => {
    const s = newGame(4);
    s.rank = 6;
    s.phase = 'report';
    s.minute = CLOSE;
    s.guards = crew(2, LOTTIES_CORNER);
    const target = raidTargets(s)[0].id;
    planRaid(s, target, ['g0'], 'smash', 'tonight');
    const [out] = tripLines(s);
    expect(out).toContain(clockText(s.raids[0].at!));
    s.raids.push({ id: 'home', attacker: 'player', target, objective: 'smash', guards: ['g1'], detected: true, eta: '19:00', leave: 17 * 60, at: 19 * 60, launched: true, back: 21 * 60 });
    expect(tripLines(s)).toHaveLength(2);
    expect(tripLines(s)[1]).toContain(`Home ~${clockText(21 * 60)}`);
  });
});

describe('the Custom difficulty panel', () => {
  it("opens on Classic's values; each step stays in its span; Busted-only and the Jar switch", () => {
    const st = defaultSettings({ difficulty: 'custom' });
    const first = customPanel(st);
    expect(first).toContain('data-testid="custom-raids">×1.0<');
    expect(first).toContain('data-testid="custom-notice">15 min<');
    expect(first).toContain('data-testid="custom-respectDays">3 days<');
    expect(first).not.toContain('disabled');
    for (let i = 0; i < 8; i++) { pickCustom(st, 'raids', '1'); pickCustom(st, 'notice', '-1'); pickCustom(st, 'respectDays', '-1'); }
    pickCustom(st, 'bustOnly');
    pickCustom(st, 'cookieJar', 'never');
    pickCustom(st, 'cookieJar', 'sometimes'); // not a setting: ignored
    expect(st.custom).toEqual({ raids: 1.5, notice: 5, respectDays: 1, bustOnly: true, cookieJar: 'never' });
    const last = customPanel(st);
    expect(last).toMatch(/data-key="custom\.raids" data-value="1" disabled/);
    expect(last).toMatch(/data-key="custom\.notice" data-value="-1" disabled/);
    expect(last).toMatch(/data-key="custom\.respectDays" data-value="-1" disabled/);
    expect(last).toContain('cl-toggle on');
    expect(last).toContain('cl-b tiny go" data-action="pick" data-key="custom.cookieJar" data-value="never"');
    pickCustom(st, 'raids', '-1');
    expect(st.custom!.raids).toBe(1.4);
  });

  it("tags a Custom run with its values; a preset keeps its name", () => {
    expect(difficultyLabel('custom', { raids: 1.5, notice: 5, respectDays: 1, bustOnly: true, cookieJar: 'never' })).toBe('Custom ×1.5 · 5m · 1d · Busted · Jar never');
    expect(difficultyLabel('custom')).toBe('Custom ×1.0 · 15m · 3d · Jar once an act');
    expect(difficultyLabel('laidback')).toBe('Laid Back');
  });
});
