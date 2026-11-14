import { describe, expect, it } from 'vitest';
import { hqPlot, newGame, raidTargets, type Blocker, type GameState } from '../sim/economy.ts';
import { footholdFor, guardOf } from '../sim/fighters.ts';
import { gullScout } from '../sim/scouting.ts';
import type { Action, Kit } from './hud.ts';
import { createRaidPlanner, templatesSwitch } from './raidPlanner.ts';
import { saveTemplate } from '../sim/templates.ts';

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
  footholdFor(s, target); // raids need a Foothold in its district
  return { s, target };
}

describe('the Raid Planner', () => {
  it('unscouted, the defenses show "?" and the win chance a range; scouted, the snapshot and one word', () => {
    const { s, target } = setup(81);
    const { p } = planner();
    for (const g of s.guards) p.squad.add(g.id);
    const blind = p.panel(s, target);
    expect(blind).not.toContain('raid-foothold'); // setup's lot in its district
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

  it('opening on a plot, Dex fills the squad; a swap sticks until it opens on another plot', () => {
    const { s, target } = setup(82);
    const other = raidTargets(s).find((t) => t.id !== target && s.plots[t.id].stand)!.id;
    const { p } = planner();
    const html = p.panel(s, target);
    expect([...p.squad]).toEqual(['r0', 'r1', 'r2']);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(3);
    p.click({ action: 'squad', id: 'r1' }); // swap one out
    p.panel(s, target);
    expect([...p.squad]).toEqual(['r0', 'r2']);
    p.panel(s, other);
    expect([...p.squad]).toEqual(['r0', 'r1', 'r2']);
  });

  it('lists Smash, Shakedown, Sabotage and HQ Assault: a rank lock hides one, any other lock says why', () => {
    const { s } = setup(83); // three Hotheads: no Lookout, nobody Sneaky
    const target = raidTargets(s).find((t) => s.plots[t.id].owner === 'blenders' && s.plots[t.id].stand)!.id;
    footholdFor(s, target);
    const { p } = planner();
    s.rank = 3;
    let html = p.panel(s, target);
    expect(html).toMatch(/data-value="smash"/);
    expect(html).toMatch(/data-value="shakedown"/);
    expect(html).not.toContain('data-value="sabotage"'); // Rank 4: hidden till then
    expect(html).not.toContain('objective-hq'); // the Blend Shack opens at Rank 5
    s.rank = 4;
    html = p.panel(s, target);
    expect(html).toMatch(/data-value="sabotage" title="[^"]*\(Sabotage needs a Lookout or a Sneaky guard\)"/); // the squad fixes it: still pickable
    p.click({ action: 'objective', value: 'sabotage' });
    html = p.panel(s, target);
    expect(html).toContain('data-testid="raid-objective-lock">Sabotage needs a Lookout or a Sneaky guard<');
    expect(html).toMatch(/data-testid="raid-tonight"\s+disabled title="Sabotage needs a Lookout or a Sneaky guard"/);
    s.plots[target].stand!.spoiledDay = s.day; // already spoiled: Sabotage says so, and the Planner goes back to Smash
    html = p.panel(s, target);
    expect(html).toMatch(/data-value="sabotage"\s+disabled title="Their stock is already spoiled"/);
    expect(html).toMatch(/class="cl-b go" data-action="objective" data-value="smash"/);
    s.rank = 5;
    html = p.panel(s, target);
    expect(html).toMatch(/data-action="goto" data-plot="[^"]+" data-testid="objective-hq"\s+disabled title="Only once they are Weakened"/);
    s.rivals.blenders.peakPlots = 99; // Weakened: HQ Assault leads to the Blend Shack's card
    html = p.panel(s, target);
    expect(html).toContain(`data-action="goto" data-plot="${hqPlot('blenders').id}" data-testid="objective-hq" title="Storm The Blend Shack: the Gate, the Yard, the Boss Room"`);
    expect(p.panel(s, target, true)).toContain(`data-action="inspect" data-plot="${hqPlot('blenders').id}"`); // from the menu: it closes on the HQ's card
  });

  it('from Rank 6 a template is one tap: the Planner opens on its target with its squad and objective', () => {
    const { s, target } = setup(84);
    const { p, acts } = planner();
    expect(templatesSwitch(s)).toBe(''); // Rank 4: no templates yet
    s.rank = 6;
    expect(templatesSwitch(s)).toContain('data-testid="raid-templates-switch" aria-pressed="true"');
    saveTemplate(s, ['r0', 'r2'], 'shakedown', target);
    let html = p.panel(s, target);
    expect([...p.squad]).toEqual(['r0', 'r2']); // the template that last went here, not Dex's three
    expect(html).toMatch(/class="cl-b tiny go" data-action="tplUse" data-ids="r0,r2" data-value="shakedown"/);
    expect(html).toMatch(/class="cl-b go" data-action="objective" data-value="shakedown"/);
    expect(html).toMatch(/data-action="tplSave"[^>]*disabled title="Already saved"/);
    p.click({ action: 'squad', id: 'r1' }); // a different squad: it can be saved too
    html = p.panel(s, target);
    expect(html).toMatch(/class="cl-b tiny ghost" data-action="tplUse"/);
    p.click({ action: 'tplSave', plot: target });
    expect(acts.at(-1)).toEqual({ type: 'template', op: 'save', plot: target, guards: ['r0', 'r2', 'r1'], objective: 'shakedown' });
    p.click({ action: 'objective', value: 'smash' });
    p.click({ action: 'tplUse', ids: 'r0,r2', value: 'shakedown' }); // one tap back to the template
    expect([...p.squad]).toEqual(['r0', 'r2']);
    expect(p.panel(s, target)).toMatch(/class="cl-b go" data-action="objective" data-value="shakedown"/);
    p.click({ action: 'tplSwitch' });
    expect(acts.at(-1)).toEqual({ type: 'template', op: 'switch' });
  });

  it('a target where you hold no plot says so: Get a Foothold first', () => {
    const s = newGame(85);
    s.rank = 3;
    s.guards = [guardOf('clubs', 'vest', 1, 'Loyal', { id: 'r0', name: 'Raider' })];
    const target = raidTargets(s).find((t) => t.district !== 'maple' && s.plots[t.id].stand)!;
    const html = planner().p.panel(s, target.id);
    expect(html).toMatch(/data-testid="raid-foothold"[^>]*>Get a Foothold in [^<]+ first</);
    expect(html).toMatch(/data-testid="raid-tonight"\s+disabled title="Get a Foothold in/);
  });

  it("on a rival's HQ it plans HQ Assault: the three stages, one number, and Now is the assault", () => {
    const s = newGame(86);
    s.rank = 7;
    s.guards = Array.from({ length: 4 }, (_, i) => guardOf('hatchets', 'pro', 5, 'Loyal', { id: `h${i}`, name: `Raider ${i}` }));
    const hq = hqPlot('blenders').id;
    const { p, acts } = planner();
    let html = p.panel(s, hq);
    expect(html).toMatch(/<i data-art="house"><\/i>HQ Assault<\/b>/);
    expect(html).toContain('<i>Gate</i>');
    expect(html).not.toContain('data-action="objective"'); // no Smash, Shakedown or Sabotage at an HQ
    expect(html).not.toContain('raid-unscouted');
    expect(html).not.toContain('raid-foothold'); // an HQ needs no Foothold
    expect(html).not.toContain('tplSave');
    expect(html).toContain('data-testid="raid-hq-lock">Only once they are Weakened<');
    expect(html).toMatch(/data-testid="assault"\s+disabled title="Only once they are Weakened"/);
    s.rivals.blenders.peakPlots = 99; // Weakened
    html = p.panel(s, hq);
    expect(html).not.toContain('raid-hq-lock');
    expect(html).not.toContain('raid-odds-range'); // its stages are known: one number
    expect(html).toMatch(/<b class="cl-odds">(Long shot|Risky|Coin flip|Good odds|Sure thing)<\/b>/);
    p.click({ action: 'raid', plot: hq, when: 'now' });
    expect(acts.at(-1)).toEqual({ type: 'raid', plot: hq, guards: ['h0', 'h1', 'h2', 'h3'], objective: 'hq', when: 'now' });
    const stand = raidTargets(s).find((t) => s.plots[t.id].stand)!.id;
    footholdFor(s, stand);
    expect(p.panel(s, stand)).toMatch(/class="cl-b go" data-action="objective" data-value="smash"/); // a stand: back on Smash
  });
});
