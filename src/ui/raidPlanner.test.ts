import { describe, expect, it } from 'vitest';
import { newGame, raidTargets, type Blocker, type GameState } from '../sim/economy.ts';
import { guardOf } from '../sim/fighters.ts';
import { gullScout } from '../sim/scouting.ts';
import type { Action, Kit } from './hud.ts';
import { createRaidPlanner } from './raidPlanner.ts';

/** The clay kit, drawn as bare tags: art as <i data-art>, buttons as the HUD's own (disabled with the reason). */
const art = new Proxy({}, { get: (_, name) => () => `<i data-art="${String(name)}"></i>` });
const kit = {
  ART: art, GADGET_ART: art, WEAPON_ART: art,
  btn: (action: string, label: string, b: Blocker = { ok: true }, extra = '', cls = '') => `<button class="cl-b ${cls}" data-action="${action}" ${extra} ${b.ok ? '' : `disabled title="${b.why}"`}>${label}</button>`,
  card: () => '', tape: (t: string) => `<tape>${t}</tape>`, meter: (v: number) => `<meter value="${v}">`, pips: () => '',
  locked: (b: Blocker) => !b.ok && /Rank \d/.test(b.why), esc: (t: string) => t, whole: (n: number) => `$${Math.round(n)}`,
} as unknown as Kit;

function planner() {
  const acts: Action[] = [];
  return { p: createRaidPlanner(kit, () => {}, (a) => acts.push(a)), acts };
}

/** Rank 4 with three raiders in clubs and vests, and a rival stand to raid. */
function setup(seed: number): { s: GameState; target: string } {
  const s = newGame(seed);
  s.rank = 4;
  s.guards = Array.from({ length: 3 }, (_, i) => guardOf('clubs', 'vest', 1, 'Hothead', { id: `r${i}`, name: `Raider ${i}` }));
  const target = raidTargets(s).find((t) => s.plots[t.id].stand)!.id;
  return { s, target };
}

describe('the Raid Planner', () => {
  it('unscouted, the defenses show "?" and the win chance a range; scouted, the snapshot and one word', () => {
    const { s, target } = setup(81);
    const { p } = planner();
    for (const g of s.guards) p.squad.add(g.id);
    const blind = p.panel(s, target);
    expect(blind).toContain('data-testid="raid-unscouted"');
    expect(blind).toMatch(/data-testid="raid-odds-range">\d+–\d+%</);
    expect(blind).toMatch(/title="\d+–\d+% to win"/); // Tonight's tip reads the range too
    gullScout(s, target);
    const seen = p.panel(s, target);
    expect(seen).not.toContain('raid-unscouted');
    expect(seen).not.toContain('raid-odds-range');
    expect(seen).toMatch(/<b class="cl-odds">(Long shot|Risky|Coin flip|Good odds|Sure thing)<\/b>/);
    expect(seen).toContain(`<tape>×${s.scouting![target].garrison}</tape>`);
  });
});
