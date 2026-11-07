// A rival's henchmen after a fight (spec: "KO'd guards are Out for 1 day, or
// 2 if a hatchet did it"; "nobody dies: the worst outcome is a day off seeing
// stars"; the same five steps run both ways). A rival plot's garrison counts
// every henchman on its books: the knocked-out are Out for a day (two after a
// hatchet KO) and then back on guard, so a fight costs a rival nobody for good
// (only the Nabbed are gone). A smash doesn't scatter them either: they stay
// on the plot, and go home to their HQ if the plot is lost. Pure, like the
// rest of the sim.
import { PLOTS } from './map.ts';
import type { GameState, PlotState } from './economy.ts';

type Out = { n: number; back: number };

/** This plot's henchmen still Out on this day. */
export const henchmenOut = (ps: PlotState, day: number): number => (ps.garrisonOut ?? []).reduce((a, o) => a + (o.back > day ? o.n : 0), 0);

/** The garrison fit to fight today. */
export const fitGarrison = (s: GameState, plotId: string): number => Math.max(0, (s.plots[plotId]?.garrison ?? 0) - henchmenOut(s.plots[plotId], s.day));

/** Book these Out on the plot alongside those already Out (anyone fit again drops off the list). */
function bookOut(s: GameState, ps: PlotState, out: Out[]): void {
  const by = new Map<number, number>();
  for (const o of [...(ps.garrisonOut ?? []), ...out]) if (o.back > s.day && o.n > 0) by.set(o.back, (by.get(o.back) ?? 0) + o.n);
  const list = [...by].sort(([a], [b]) => a - b).map(([back, n]) => ({ n, back }));
  if (list.length) ps.garrisonOut = list; else delete ps.garrisonOut;
}

/** Knocked out defending this plot: Out a day, two after a hatchet KO, then back (they stay on its books). */
export function knockOut(s: GameState, plotId: string, ids: string[], hatchetKos: string[] = []): void {
  const ps = s.plots[plotId];
  if (!ps || !ids.length) return;
  const axed = ids.filter((id) => hatchetKos.includes(id)).length;
  bookOut(s, ps, [{ n: ids.length - axed, back: s.day + 2 }, { n: axed, back: s.day + 3 }]);
}

/** A rival's HQ plot while it still holds it. */
const hqOf = (s: GameState, rival: string) => PLOTS.find((p) => p.type === 'hq' && s.plots[p.id].owner === rival)?.id ?? null;

/** Henchmen walking back to a plot (help home from a fight): onto its garrison, or on to the HQ if the rival has lost
 * the plot (with no HQ left they're gone). Returns where they went. */
export function backOnGuard(s: GameState, rival: string, plotId: string, n: number): string | null {
  const home = s.plots[plotId]?.owner === rival ? plotId : hqOf(s, rival);
  if (!home || n <= 0) return null;
  s.plots[home].garrison = (s.plots[home].garrison ?? 0) + n;
  return home;
}

/** A rival plot is lost (it lapses after a smash): its henchmen, the knocked-out too, go home to the HQ. */
export function garrisonHome(s: GameState, plotId: string): void {
  const ps = s.plots[plotId];
  const rival = ps?.owner;
  if (!rival || rival === 'player' || !(ps.garrison ?? 0)) return;
  const hq = hqOf(s, rival);
  if (hq && hq !== plotId) {
    s.plots[hq].garrison = (s.plots[hq].garrison ?? 0) + ps.garrison!;
    bookOut(s, s.plots[hq], ps.garrisonOut ?? []);
  }
  ps.garrison = 0;
  delete ps.garrisonOut;
}
