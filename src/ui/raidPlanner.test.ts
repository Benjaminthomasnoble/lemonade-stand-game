import { describe, expect, it } from 'vitest';
import { hqPlot, LOTTIES_CORNER, newGame, PERIMETERS, planRaid, postsFor, raidOdds, raidTargets, type Blocker, type GameState } from '../sim/economy.ts';
import { helpPlots } from '../sim/reinforce.ts';
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

  it('scouted, the defenses row reads the plot as it stands now, as its odds do; the Corkboard keeps the snapshot', () => {
    const { s, target } = setup(88);
    const { p } = planner();
    for (const g of s.guards) p.squad.add(g.id);
    const ps = s.plots[target];
    Object.assign(ps, { defense: { tier: 0, fenceHp: 0, gadgets: [] }, garrison: 0, garrisonOut: undefined });
    gullScout(s, target);
    const snap = structuredClone(s.scouting![target]);
    const bare = raidOdds(s, target, [...p.squad], 'smash', true);
    const row = (html: string) => /<div class="cl-slots" title="([^"]*)">(.*?)<\/div>/.exec(html)!;
    expect(row(p.panel(s, target))[2]).not.toContain('data-art="fence"');
    // Days later the rival buys a Chain-Link, a Tin-Can Alarm and a full garrison.
    Object.assign(ps, { defense: { tier: 2, fenceHp: PERIMETERS[1].hp, gadgets: ['alarm'] }, garrison: postsFor(s, target) });
    const [, tip, slots] = row(p.panel(s, target));
    expect(slots).toContain('data-art="fence"');
    expect(slots).toContain('data-art="alarm"');
    expect(slots).toContain(`<tape>×${postsFor(s, target)}</tape>`);
    expect(tip).toContain(`Chain-Link Fence, Tin-Can Alarm, ${postsFor(s, target)} henchm`);
    expect(raidOdds(s, target, [...p.squad], 'smash', true)).toBeLessThan(bare); // the dial reads the same plot
    expect(s.scouting![target]).toEqual(snap); // what Squawk saw stays pinned on the Corkboard
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

  it('the odds it keeps for the day refresh when the squad or the help next door changes', () => {
    const { s, target } = setup(84);
    gullScout(s, target); // scouted: one number, in the dial's tip
    const { p } = planner();
    const shown = (q = p) => /title="(\d+)% to win"/.exec(q.panel(s, target))![1];
    const fresh = () => shown(planner().p); // a Planner opened just now: nothing kept
    const base = shown();
    s.guards[0].specialty = 'captain'; // promoted: +20 Nerve and +10% Hit for the whole squad
    expect(shown()).toBe(fresh());
    expect(shown()).not.toBe(base);
    s.guards[1].trait = 'Gentle Giant';
    expect(shown()).toBe(fresh());
    for (const g of s.guards) { g.post = LOTTIES_CORNER; g.club = LOTTIES_CORNER; } // they set out from somewhere else
    expect(shown()).toBe(fresh());
    const before = shown();
    for (const { id } of helpPlots(s, target)) s.plots[id].garrison = 0; // nobody next door to send
    expect(shown()).toBe(fresh());
    expect(shown()).not.toBe(before);
  });

  it('"Take all" is Dex filling the squad to the cap, and he fills it again once a raid is sent', () => {
    const s = newGame(87);
    s.rank = 3; // a squad of 5
    s.guards = Array.from({ length: 7 }, (_, i) => guardOf('clubs', 'vest', 1, 'Hothead', { id: `r${i}`, name: `Raider ${i}` }));
    const target = raidTargets(s).find((t) => s.plots[t.id].stand)!.id;
    footholdFor(s, target);
    const { p, acts } = planner();
    let html = p.panel(s, target);
    expect(p.squad.size).toBe(5); // Dex's fill as it opens
    const fill = [...p.squad];
    expect(html).toContain(`data-action="squadAll" data-ids="${fill.join(',')}">None<`);
    p.click({ action: 'squadAll', ids: fill.join(',') }); // None
    expect(p.squad.size).toBe(0);
    for (const g of s.guards) p.click({ action: 'squad', id: g.id }); // every face tapped in: over the cap
    html = p.panel(s, target);
    expect(html).toMatch(/data-testid="raid-tonight"\s+disabled title="Squad cap is 5"/);
    const ids = /data-action="squadAll" data-ids="([^"]+)">Take all</.exec(html)![1];
    expect(ids.split(',')).toHaveLength(5);
    p.click({ action: 'squadAll', ids });
    expect([...p.squad]).toEqual(fill);
    html = p.panel(s, target);
    expect(html).not.toMatch(/data-testid="raid-tonight"[^>]*disabled/);
    p.click({ action: 'raid', plot: target, when: 'tonight' });
    const sent = acts.at(-1) as Extract<Action, { type: 'raid' }>;
    expect(planRaid(s, target, sent.guards, sent.objective, 'tonight')).toBe(true); // what main.ts does with it
    p.panel(s, target);
    expect([...p.squad].sort()).toEqual(s.guards.map((g) => g.id).filter((id) => !fill.includes(id)).sort()); // the two left, filled again
  });

  it('sent so late in the night it gets there after 7am, Tonight is a daytime raid: its stars, and the Citation under the line', () => {
    const { s, target } = setup(89);
    s.reputation = 1.8;
    s.phase = 'night' as GameState['phase'];
    s.minute = 23 * 60; // it leaves at 01:00 and gets there by night
    const { p } = planner();
    for (const g of s.guards) p.squad.add(g.id);
    const tonight = (html: string) => html.match(/<button[^>]*data-testid="raid-tonight"[^>]*>.*?<\/button>/s)![0];
    const early = p.panel(s, target);
    expect(tonight(early)).not.toContain('class="bad"');
    expect(early).not.toContain('raid-citation');
    s.minute = 24 * 60 + 6 * 60 + 10; // 06:10: any walk gets there after 07:00
    const late = p.panel(s, target);
    expect(tonight(late)).toMatch(/<span class="bad">−0\.[12]/);
    expect(tonight(late)).toContain('it lands after 7am, by day');
    expect(late).toMatch(/data-testid="raid-citation"[^>]*>Lands by day: Citation \$\d+, 2-day ban</);
    expect(late).not.toContain('data-testid="raid-now"'); // no Now at night
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
