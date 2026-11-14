import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  buyGadget, buyPerimeter, HIRE_RANK, LESSON_DAY, LOTTIES_CORNER, newGame, PLOT_BY_ID, refreshRecruits, resetSlick, toggleAutoRepair, type Blocker,
  buildClubhouse, newStand, ownedPlots, PLOTS, type Guard, type Raid,
} from '../sim/economy.ts';
import { finishFight, startFight, watchFights } from '../sim/fight.ts';
import { guardOf, henchmenOf } from '../sim/fighters.ts';
import { ringTheBell } from '../sim/reinforce.ts';
import type { Kit } from './hud.ts';
import { clubKit, crewPanel, defenseSheet, HIRING_HALL, hiringHallButton } from './crew.ts';
import { clubhouseRoom } from './clubhouse.ts';
import { guardsHere, repairCards } from './evening.ts';
import { menuUnlocked } from './menus.ts';

/** The clay kit, drawn as bare tags: art as <i data-art>, buttons as the HUD's own (disabled with the reason). */
const art = new Proxy({}, { get: (_, name) => () => `<i data-art="${String(name)}"></i>` });
const kit = {
  ART: art, GADGET_ART: art, WEAPON_ART: art,
  btn: (action: string, label: string, b: Blocker = { ok: true }, extra = '', cls = '') => `<button class="cl-b ${cls}" data-action="${action}" ${extra} ${b.ok ? '' : `disabled title="${b.why}"`}>${label}</button>`,
  card: (...parts: string[]) => `<card>${parts.join(' | ')}</card>`, tape: (t: string) => `<tape>${t}</tape>`, meter: (v: number) => `<meter value="${v}">`, pips: () => '',
  locked: (b: Blocker) => !b.ok && /Rank \d/.test(b.why), esc: (t: string) => t, whole: (n: number) => `$${Math.round(n)}`,
} as unknown as Kit;

describe('the Hiring Hall plot', () => {
  it('from Rank 2 and the crew lesson, its card opens the Crew roster and its recruits', () => {
    const s = newGame(41);
    expect(PLOT_BY_ID[HIRING_HALL]).toMatchObject({ name: 'The Hiring Hall', district: 'oldtown', type: 'civic' });
    s.day = LESSON_DAY.crew;
    expect(hiringHallButton(kit, s)).toBe(''); // Rank 1: the Hall hasn't opened
    s.rank = HIRE_RANK;
    refreshRecruits(s, true); // the rank-up opens it (src/sim/score.ts)
    s.day = LESSON_DAY.crew - 1;
    expect(hiringHallButton(kit, s)).toBe(''); // the crew lesson hasn't come
    s.day = LESSON_DAY.crew;
    const hire = hiringHallButton(kit, s);
    expect(hire).toContain('data-action="menu" data-menu="crew"');
    expect(hire).toContain('>Hire</button>');
    expect(menuUnlocked(s, 'crew')).toBe(true); // so main.ts opens it
    const roster = crewPanel(kit, s); // what the Crew roster shows
    expect(roster).toContain('Hiring Hall');
    expect(roster.match(/data-testid="hire"/g)).toHaveLength(s.recruits.length);
    s.settings.lessons = false; // lessons off: it follows the rank alone
    s.day = 1;
    expect(hiringHallButton(kit, s)).toContain('data-menu="crew"');
  });
});

describe('the Defend sheet', () => {
  it('a plot Auto-Repair skips says so on its fence and its sprung Slick: you patch them', () => {
    const s = newGame(42);
    s.rank = 4;
    s.cash = 5000;
    buyPerimeter(s, LOTTIES_CORNER);
    buyGadget(s, LOTTIES_CORNER, 'slick');
    s.plots[LOTTIES_CORNER].defense.slickSprung = true;
    const on = defenseSheet(kit, s, LOTTIES_CORNER);
    expect(on).toContain('to repair overnight.');
    expect(on).toContain('sprung. Re-laid overnight for $25');
    toggleAutoRepair(s, LOTTIES_CORNER);
    const skipped = defenseSheet(kit, s, LOTTIES_CORNER);
    expect(skipped).toContain('to repair: Auto-Repair skips this plot.');
    expect(skipped).toContain('sprung. Auto-Repair skips this plot');
  });

  it("a sprung Slick has a Re-lay button, and a skipped plot's gets an Evening ticket too", () => {
    const s = newGame(42);
    s.rank = 4;
    s.cash = 5000;
    buyPerimeter(s, LOTTIES_CORNER);
    buyGadget(s, LOTTIES_CORNER, 'slick');
    expect(defenseSheet(kit, s, LOTTIES_CORNER)).not.toContain('data-action="resetSlick"'); // armed
    s.plots[LOTTIES_CORNER].defense.slickSprung = true;
    s.phase = 'report';
    const relay = `<button class="cl-b tiny" data-action="resetSlick" data-plot="${LOTTIES_CORNER}" data-testid="reset-slick"`;
    expect(defenseSheet(kit, s, LOTTIES_CORNER)).toContain(`${relay} >Re-lay $25</button>`);
    expect(repairCards(s).join('')).not.toContain('data-action="resetSlick"'); // re-laid overnight anyway
    toggleAutoRepair(s, LOTTIES_CORNER); // skipped: it waits for you
    expect(repairCards(s).join('')).toContain(`data-action="resetSlick" data-plot="${LOTTIES_CORNER}"`);
    s.cash = 20;
    expect(defenseSheet(kit, s, LOTTIES_CORNER)).toContain(`${relay} disabled title="Needs $25">`);
    expect(repairCards(s).join('')).toMatch(/data-action="resetSlick"[^>]*disabled title="Not enough cash"/);
    s.cash = 100;
    resetSlick(s, LOTTIES_CORNER);
    expect(defenseSheet(kit, s, LOTTIES_CORNER)).not.toContain('data-action="resetSlick"');
    expect(repairCards(s).join('')).not.toContain('data-action="resetSlick"');
  });
});

describe('a guard in the fight playing live', () => {
  beforeAll(() => watchFights(true)); // as the game does: fights you're in play live
  afterAll(() => watchFights(false));

  it("keeps his post: the buttons that would move him show disabled, with why, till it's over", () => {
    // 23:00, and Brock's raid on the Corner plays live: Gus holds its post, Pip a Kiosk down the street, and Lou waits
    // at one of two Clubhouses there.
    const s = newGame(41);
    Object.assign(s, { rank: 7, cash: 1e6, phase: 'night', minute: 23 * 60 });
    const home = ownedPlots(s, 'player')[0].id;
    const [kiosk, club, club2] = PLOTS.filter((p) => p.type === 'street' && p.district === PLOT_BY_ID[home].district && !s.plots[p.id].owner).map((p) => p.id);
    s.plots[kiosk] = { ...s.plots[kiosk], owner: 'player', stand: newStand(3) };
    for (const c of [club, club2]) { s.plots[c].owner = 'player'; expect(buildClubhouse(s, c)).toBe(true); }
    const gus = guardOf('clubs', 'vest', 1, 'Eagle Eye', { name: 'Gus', post: home });
    const pip = guardOf('clubs', 'vest', 1, 'Smooth Talker', { name: 'Pip', post: kiosk });
    const lou = guardOf('clubs', 'vest', 1, 'Smooth Talker', { name: 'Lou', club });
    s.guards = [gus, pip, lou];
    const tag = (html: string, action: string, g: Guard) => html.match(new RegExp(`<button [^>]*data-action="${action}" data-id="${g.id}"[^>]*>`))?.[0] ?? '';
    const post = (g: Guard) => tag(crewPanel(kit, s), 'post', g); // the Crew tab's post button
    const face = (g: Guard) => tag(clubhouseRoom(clubKit(kit), s, club2), 'club', g); // the other Clubhouse's "wait here"
    const card = () => guardsHere(s, kiosk, (g) => `<i data-face="${g.id}"></i>`); // the Kiosk's plot card: + and All here
    expect(post(gus)).toContain(`title="Posted at ${PLOT_BY_ID[home].name}: tap to move to`);
    expect(post(gus)).not.toContain('disabled');
    const raid: Raid = { id: 'ra', attacker: 'blenders', target: home, objective: 'smash', party: henchmenOf(3, 1, 'fists'), detected: true, eta: '23:00', leave: 22 * 60, at: 23 * 60, launched: true, warned: true };
    expect(startFight(s, raid, true)).toBe(true);
    expect(ringTheBell(s, 'ra')).toBe(true); // Lou is in it from the moment he sets out
    expect(post(gus)).toContain(`disabled title="Posted at ${PLOT_BY_ID[home].name} (In the fight)"`);
    expect(post(lou)).toContain('disabled title="Posted at the Clubhouse (In the fight)"');
    expect(post(pip)).not.toContain('disabled'); // not in it: he moves as ever
    expect(face(lou)).toContain('disabled title="Lou (In the fight)"');
    expect(card()).toContain(`data-id="${gus.id}" data-plot="${kiosk}" data-testid="post-here" disabled title="Gus: In the fight"`);
    expect(card()).toMatch(/data-action="defend" data-plot="[^"]+" disabled title="In the fight">All here</);
    finishFight(s);
    expect(s.fight).toBeUndefined();
    expect(post(gus)).not.toContain('disabled');
    expect(face(lou)).toContain('title="Lou: wait here"');
    expect(face(lou)).not.toContain('disabled');
    expect(card()).not.toContain('In the fight');
  });
});
