// Ring the Bell (spec: Defenses, "Reinforcements"; Crew and combat, the fight
// buttons). Guards waiting at a Clubhouse are your reserve. Ring the Bell on a
// raid on one of your plots, warned or under way, and the reserve of every
// Clubhouse in that plot's district or a bordering one sets out at once: 30
// game minutes from the same district, 60 from a bordering one (a Stronghold
// speeds them up). Whoever gets there before the raid starts in the fight;
// the rest join as they arrive (on the fight clock a game minute is a second),
// and once it's over they arrive to the aftermath. Defense only, once per
// raid; with no Clubhouse there's no reserve. Arrivals count in their side's
// head count for the Nerve check, and when the raid is done they're back at
// their Clubhouse. Pure, like the rest of the sim.
import { FIGHT_SECONDS_PER_GAME_MINUTE, RESERVE_MINUTES } from './balance.ts';
import { BORDERS, PLOT_BY_ID, type DistrictId } from './map.ts';
import type { BattleInput, Fighter } from './combat.ts';
import { clubhouses, reserveAt } from './clubhouse.ts';
import { guardFighter, guardReady, type Guard, type Raid } from './crew.ts';
import { joinFight } from './fight.ts';
import type { GameState } from './economy.ts';

/** crew's strongholdTravelMult(s, districtId) once stronghold-effects merges (0.5 while you hold a Stronghold). */
const strongholdTravelMult = (_s: GameState, _district: DistrictId): number => 1;

/** Game minutes from a Clubhouse to a plot: 30 within its district, 60 from a bordering one, null out of range. */
export function reserveMinutes(s: GameState, clubId: string, plotId: string): number | null {
  const from = PLOT_BY_ID[clubId]?.district, to = PLOT_BY_ID[plotId]?.district;
  if (!from || !to) return null;
  const base = from === to ? RESERVE_MINUTES.same : BORDERS[from].includes(to) ? RESERVE_MINUTES.border : null;
  return base === null ? null : Math.round(base * strongholdTravelMult(s, to));
}

/** Who answers the bell for a raid on this plot: each Clubhouse in range sends its reserve, nearest first. */
export function bellParty(s: GameState, plotId: string): { club: string; minutes: number; guards: Guard[] }[] {
  const out: { club: string; minutes: number; guards: Guard[] }[] = [];
  for (const c of clubhouses(s)) {
    const minutes = reserveMinutes(s, c.id, plotId);
    const guards = minutes === null ? [] : reserveAt(s, c.id);
    if (guards.length) out.push({ club: c.id, minutes: minutes!, guards });
  }
  return out.sort((a, b) => a.minutes - b.minutes);
}

/** The raid the bell answers: a warned raid on one of your plots, or the fight on one right now. */
function bellRaid(s: GameState, raidId: string): Raid | null {
  const f = s.fight;
  if (f?.raid.id === raidId) return f.side === 'def' && !f.hq ? f.raid : null;
  const r = s.raids.find((x) => x.id === raidId);
  return r?.warned && r.attacker !== 'player' && s.plots[r.target]?.owner === 'player' ? r : null;
}

/** Can you ring the bell on this raid? Defense only, once per raid, and only with a reserve in range. */
export function canRingBell(s: GameState, raidId: string): boolean {
  const r = bellRaid(s, raidId);
  return !!r && !r.bell && bellParty(s, r.target).length > 0;
}

const names = (gs: Guard[]) => (gs.length === 1 ? gs[0].name : `${gs.slice(0, -1).map((g) => g.name).join(', ')} and ${gs[gs.length - 1].name}`);

/** Ring the Bell: the reserve in range sets out now. Under way, they join the fight as they arrive. */
export function ringTheBell(s: GameState, raidId: string): boolean {
  if (!canRingBell(s, raidId)) return false;
  const r = bellRaid(s, raidId)!;
  const party = bellParty(s, r.target);
  r.bell = party.flatMap(({ minutes, guards }) => guards.map((g) => ({ id: g.id, at: s.minute + minutes })));
  const f = s.fight;
  if (f?.raid === r) for (const { minutes, guards } of party) joinFight(s, guards.map((g) => guardFighter(g, 'def', f.night)), minutes * FIGHT_SECONDS_PER_GAME_MINUTE);
  s.news.push(`Ding-ding! ${party.map((p) => `${names(p.guards)} leave${p.guards.length === 1 ? 's' : ''} ${PLOT_BY_ID[p.club].name}, ${p.minutes} min out`).join('; ')}.`);
  return true;
}

/** Game minutes until the first guard the bell sent reaches the plot (0: there), null if it wasn't rung. */
export function bellEta(s: GameState, raidId: string): number | null {
  const r = s.fight?.raid.id === raidId ? s.fight.raid : s.raids.find((x) => x.id === raidId);
  if (!r?.bell?.length) return null;
  return Math.max(0, Math.min(...r.bell.map((b) => b.at)) - s.minute);
}

/**
 * The bell's guards at the start of a fight on its raid (the minute is the
 * contact): those already there defend from the start, the rest join
 * (arrival - contact) fight-seconds in. Anyone posted since, KO'd, or away
 * on a raid of yours doesn't come.
 */
export function withBell(s: GameState, raid: Raid, input: BattleInput, night: boolean): BattleInput {
  if (!raid.bell?.length) return input;
  const raiding = new Set([...s.raids, ...(s.fight ? [s.fight.raid] : [])].flatMap((r) => (r.attacker === 'player' ? r.guards ?? [] : [])));
  const there: Fighter[] = [];
  const later = new Map<number, Fighter[]>();
  for (const b of raid.bell) {
    const g = s.guards.find((x) => x.id === b.id);
    if (!g || g.post || !guardReady(s, g) || raiding.has(g.id) || input.defenders.some((d) => d.id === g.id)) continue;
    const f = guardFighter(g, 'def', night);
    if (b.at <= s.minute) there.push(f);
    else { const t = (b.at - s.minute) * FIGHT_SECONDS_PER_GAME_MINUTE; later.set(t, [...(later.get(t) ?? []), f]); }
  }
  const joins = [...later].sort(([a], [b]) => a - b).map(([t, fighters]) => ({ t, fighters }));
  return { ...input, defenders: [...input.defenders, ...there], ...(joins.length ? { joins: [...(input.joins ?? []), ...joins] } : {}) };
}
