import { describe, expect, it } from 'vitest';
import { HIRE_RANK, LESSON_DAY, newGame, PLOT_BY_ID, refreshRecruits, type Blocker } from '../sim/economy.ts';
import type { Kit } from './hud.ts';
import { crewPanel, HIRING_HALL, hiringHallButton } from './crew.ts';
import { menuUnlocked } from './menus.ts';

/** The clay kit, drawn as bare tags: art as <i data-art>, buttons as the HUD's own (disabled with the reason). */
const art = new Proxy({}, { get: (_, name) => () => `<i data-art="${String(name)}"></i>` });
const kit = {
  ART: art, GADGET_ART: art, WEAPON_ART: art,
  btn: (action: string, label: string, b: Blocker = { ok: true }, extra = '', cls = '') => `<button class="cl-b ${cls}" data-action="${action}" ${extra} ${b.ok ? '' : `disabled title="${b.why}"`}>${label}</button>`,
  card: () => '', tape: (t: string) => `<tape>${t}</tape>`, meter: (v: number) => `<meter value="${v}">`, pips: () => '',
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
