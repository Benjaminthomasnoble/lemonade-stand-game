import { describe, expect, it } from 'vitest';
import {
  alert, clockText, CLOSE, hhmm, LOTTIES_CORNER, newGame, nightStep, PERIMETERS, planRaid, raidPartyFor, raidTargets, squadTrip, startNight,
  type GameState, type Guard, type Raid,
} from '../sim/economy.ts';
import { DEFAULT_OPTIONS } from '../settings.ts';
import { alertCards } from './alerts.ts';
import { span, tripLines, tripNote } from './trips.ts';
import { fenceHere } from './evening.ts';
import { optionsScreen } from './options.ts';

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

  it('goes when the raid hits', () => {
    const { s } = warned();
    while (s.minute < 22 * 60) nightStep(s);
    expect(alertCards(s).some((c) => c.includes('raid-warning'))).toBe(false);
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
