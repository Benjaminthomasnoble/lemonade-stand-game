// Clubhouses (spec: Crew and combat, "A Clubhouse fills one Street plot, and
// you can own several"). A Clubhouse is a building on an empty Street plot of
// yours: its FACILITIES entry (vip.ts) makes raids, smashing, the 15% rebuild,
// guard posts and Net Worth work through PlotState.facility like any building.
// Each one upgrades on its own (6, 12, then 24 beds), and the roster holds 2
// plus the beds of every Clubhouse still standing. A guard off post waits at
// one of them: that's the reserve Ring the Bell calls (reinforce.ts).
import { CLUBHOUSE } from './balance.ts';
import { PLOTS, type Plot } from './map.ts';
import type { GameState } from './economy.ts';
import type { Guard } from './crew.ts';

const round2 = (n: number) => Math.round(n * 100) / 100;

const isClubhouse = (s: GameState, id: string) => s.plots[id]?.owner === 'player' && s.plots[id].facility?.kind === 'clubhouse';
const emptyStreet = (s: GameState, p: Plot) => p.type === 'street' && s.plots[p.id].owner === 'player' && !s.plots[p.id].stand && !s.plots[p.id].facility;

/** Your Clubhouses that stand (a wrecked one houses nobody till it's rebuilt). */
export const clubhouses = (s: GameState): Plot[] => PLOTS.filter((p) => isClubhouse(s, p.id) && !s.plots[p.id].facility!.wrecked);

/** Beds in this Clubhouse: none while it's wrecked. */
export function bedsAt(s: GameState, plotId: string): number {
  const f = s.plots[plotId]?.facility;
  return isClubhouse(s, plotId) && !f!.wrecked ? CLUBHOUSE[f!.level - 1].beds : 0;
}

/** Beds across all your standing Clubhouses. */
export const allBeds = (s: GameState) => clubhouses(s).reduce((a, p) => a + bedsAt(s, p.id), 0);

/** The Clubhouse a guard belongs to: their own while it stands, else your first. Null with none (Dex sleeps in the shed). */
export function clubOf(s: GameState, g: Guard): string | null {
  const all = clubhouses(s);
  return (all.find((p) => p.id === g.club) ?? all[0])?.id ?? null;
}

/** Guards away fighting: on a raid of yours, planned or live. */
export function awayOnRaid(s: GameState): Set<string> {
  return new Set([...s.raids, ...(s.fight ? [s.fight.raid] : [])].flatMap((r) => (r.attacker === 'player' ? r.guards ?? [] : [])));
}

/** The reserve at a Clubhouse: guards off post waiting there, fit to fight and not away on a raid. */
export function reserveAt(s: GameState, plotId: string): Guard[] {
  const away = awayOnRaid(s);
  return s.guards.filter((g) => !g.post && g.outUntil <= s.day && !away.has(g.id) && clubOf(s, g) === plotId);
}

/** Send a guard off post to wait at this Clubhouse. */
export function waitAt(s: GameState, guardId: string, plotId: string): boolean {
  const g = s.guards.find((x) => x.id === guardId);
  if (!g || !clubhouses(s).some((p) => p.id === plotId)) return false;
  g.post = null;
  g.club = plotId;
  return true;
}

/** Where the next beds go: an empty Street plot of yours, else your smallest Clubhouse that can still grow. */
export function clubhouseSite(s: GameState): string | null {
  const lot = PLOTS.find((p) => emptyStreet(s, p));
  if (lot) return lot.id;
  const grow = PLOTS.filter((p) => isClubhouse(s, p.id) && s.plots[p.id].facility!.level < CLUBHOUSE.length);
  grow.sort((a, b) => s.plots[a.id].facility!.level - s.plots[b.id].facility!.level);
  return grow[0]?.id ?? null;
}

/**
 * Old saves kept one Clubhouse level for the whole crew. It moves onto an
 * empty Street plot of yours, cost and all; with no such plot, it's paid back.
 */
export function migrateClubhouse(s: GameState): void {
  const level = Math.min(CLUBHOUSE.length, Math.max(0, Math.floor(s.clubhouse ?? 0)));
  delete s.clubhouse;
  if (!level) return;
  const cost = CLUBHOUSE.slice(0, level).reduce((a, c) => a + c.cost, 0);
  const lot = PLOTS.find((p) => emptyStreet(s, p));
  if (lot) {
    const ps = s.plots[lot.id];
    ps.facility = { kind: 'clubhouse', level };
    ps.invested += cost;
    s.news.push(`The Clubhouse now stands on ${lot.name}: ${CLUBHOUSE[level - 1].beds} beds.`);
  } else {
    s.cash = round2(s.cash + cost); // ledger: land
    s.news.push(`Lottie: "The Clubhouse needs a Street plot of its own now. Here's $${cost.toLocaleString('en-US')} back to build one."`);
  }
}
