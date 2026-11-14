import { describe, expect, it } from 'vitest';
import { LOTTIES_CORNER, newGame, PLOT_BY_ID, raidTargets, type GameState } from '../sim/economy.ts';
import { gullScout, pierTarget } from '../sim/scouting.ts';
import { aimGull, fitCircle, gullTicket, scoutedPins, trackGull } from './gull.ts';
import type { Kit } from './hud.ts';

const kit = { meter: (v: number) => `<meter value="${v}">`, esc: (t: string) => t } as unknown as Kit;

/** Fly Squawk the way the world's Gull Flight does (14 units a second, turning `turn` radians a second) for `seconds`,
 * feeding the tracker each 60th of a second. Returns every plot it reported circled. */
function fly(s: GameState, from: { x: number; z: number; heading: number }, turn: number, seconds: number, speed = 14): string[] {
  const out: string[] = [];
  const dt = 1 / 60;
  let { x, z, heading } = from;
  for (let t = 0; t < seconds; t += dt) {
    heading += turn * dt;
    x += Math.sin(heading) * speed * dt;
    z += Math.cos(heading) * speed * dt;
    const id = trackGull(s, true, x, z, dt);
    if (id) out.push(id);
  }
  from.x = x; from.z = z; from.heading = heading;
  return out;
}
const land = (s: GameState) => trackGull(s, false, 0, 0, 1 / 60);

describe('Gull Flight scouting', () => {
  it('fits the circle through a stretch of flight, and refuses a straight line', () => {
    const arc = Array.from({ length: 20 }, (_, i) => ({ x: 5 + 9 * Math.cos(i / 10), z: -3 + 9 * Math.sin(i / 10) }));
    const c = fitCircle(arc)!;
    expect(c.x).toBeCloseTo(5, 5);
    expect(c.z).toBeCloseTo(-3, 5);
    expect(c.r).toBeCloseTo(9, 5);
    expect(fitCircle(Array.from({ length: 20 }, (_, i) => ({ x: i, z: 2 * i })))).toBeNull();
  });

  it('a full circle round a rival plot scouts it, once, with the ticket counting him round', () => {
    const s = newGame(71);
    const target = raidTargets(s)[0].id, p = PLOT_BY_ID[target];
    land(s);
    expect(gullTicket(kit, s)).toBe('');
    aimGull(target);
    const at = { x: p.x + 9, z: p.z, heading: Math.PI }; // the Planner's Fly over: north on its east side
    expect(fly(s, at, 0, 0.2)).toEqual([]);
    expect(gullTicket(kit, s)).toContain(`Circle ${p.name.replace(/ lot /, ' ')}`);
    expect(fly(s, at, 1.6, 2)).toEqual([]); // half way round
    const half = gullTicket(kit, s);
    expect(half).toContain('data-testid="gull-flight"');
    expect(half).toMatch(/<meter value="0\.(375|5)">/);
    const circled = fly(s, at, 1.6, 2.5);
    expect(circled).toEqual([target]);
    expect(gullScout(s, circled[0])).toBe(true);
    expect(fly(s, at, 1.6, 1)).toEqual([]); // the next loop starts over
    land(s);
    expect(gullTicket(kit, s)).toBe('');
  });

  it('a straight line, a wide loop or a loop over your own plots scouts nothing', () => {
    const s = newGame(72);
    const target = raidTargets(s)[0].id, p = PLOT_BY_ID[target];
    land(s);
    expect(fly(s, { x: p.x, z: p.z - 40, heading: 0 }, 0, 8)).toEqual([]);
    land(s);
    expect(fly(s, { x: p.x + 40, z: p.z, heading: Math.PI }, 14 / 40, 20)).toEqual([]); // radius 40: too wide
    land(s);
    const home = PLOT_BY_ID[LOTTIES_CORNER];
    expect(fly(s, { x: home.x + 9, z: home.z, heading: Math.PI }, 1.6, 6)).toEqual([]);
    land(s);
  });

  it('pins each fresh snapshot on the Corkboard, tapping through to the plot', () => {
    const s = newGame(73);
    const target = raidTargets(s)[0].id;
    const rival = s.plots[target].owner as Parameters<typeof scoutedPins>[1];
    expect(scoutedPins(s, rival)).toBe('');
    gullScout(s, target);
    const pins = scoutedPins(s, rival);
    expect(pins).toContain('data-testid="cork-scouted"');
    expect(pins).toContain(`data-action="inspect" data-plot="${target}"`);
    expect(pins).toContain('Scouted by Captain Squawk');
    s.day += 3;
    expect(scoutedPins(s, rival)).toBe('');
  });

  it("in Act 2's flight over the Pier, the ticket names the Blenders plot Lottie sent him to", () => {
    const s = newGame(74);
    s.day = 20;
    s.story = { ...s.story!, act: 2, since: 19 };
    const target = pierTarget(s)!, p = PLOT_BY_ID[target];
    land(s);
    expect(fly(s, { x: 0, z: 0, heading: 0 }, 0, 0.2)).toEqual([]); // took off with G, wherever he was
    expect(gullTicket(kit, s)).toContain(`<b>Circle ${p.name.replace(/ lot /, ' ')}</b>`);
    const at = { x: p.x + 9, z: p.z, heading: Math.PI };
    expect(fly(s, at, 1.6, 4.5)).toEqual([target]);
    gullScout(s, target);
    expect(s.pierFlight).toBe(20);
    land(s);
    expect(fly(s, { x: 0, z: 0, heading: 0 }, 0, 0.2)).toEqual([]);
    expect(gullTicket(kit, s)).toContain('<b>Circle a rival stand</b>'); // flown: any stand again
    land(s);
  });
});
