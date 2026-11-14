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
// their Clubhouse.
//
// It runs both ways (spec: "The same five steps run when you raid a rival and
// when a rival raids you"): a rival who spots your raid as it sets out sends
// help from its other plots and its HQ in the same or a bordering district.
// Pure, like the rest of the sim.
import { FACTIONS, FIGHT_SECONDS_PER_GAME_MINUTE, RESERVE_MINUTES, RIVAL_HELP, type RivalId } from './balance.ts';
import { BORDERS, PLOT_BY_ID, PLOTS } from './map.ts';
import type { BattleInput, BattleResult, Fighter } from './combat.ts';
import { clubhouses, reserveAt } from './clubhouse.ts';
import { garrisonHenchman, guardFighter, guardReady, henchmanFor, strongholdTravelMult, threatLevel, type Guard, type Raid } from './crew.ts';
import { HQS } from './rivals.ts';
import { backOnGuard, fitGarrison, knockOut } from './garrison.ts';
import { joinFight } from './fight.ts';
import { porchLit } from './perks.ts'; // Porch Light on the guards who answer the bell
import { travelMinutes } from './night.ts';
import type { Rng } from './rng.ts';
import type { GameState } from './economy.ts';

/** Game minutes from a Clubhouse to a plot: 30 within its district, 60 from a bordering one, null out of range
 * (crew's strongholdTravelMult: half that into a district where you hold a Stronghold). */
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

/** Ring the Bell: the reserve in range sets out now. Under way, they join the fight as they arrive. `dex`: Auto-Defend rang it. */
export function ringTheBell(s: GameState, raidId: string, dex = false): boolean {
  if (!canRingBell(s, raidId)) return false;
  const r = bellRaid(s, raidId)!;
  const party = bellParty(s, r.target);
  r.bell = party.flatMap(({ minutes, guards }) => guards.map((g) => ({ id: g.id, at: s.minute + minutes })));
  const f = s.fight;
  if (f?.raid === r) for (const { minutes, guards } of party) joinFight(s, porchLit(s, guards.map((g) => guardFighter(g, 'def', f.night, r.attacker)), f.night), minutes * FIGHT_SECONDS_PER_GAME_MINUTE);
  s.news.push(`Ding-ding!${dex ? ' Dex rings the bell.' : ''} ${party.map((p) => `${names(p.guards)} leave${p.guards.length === 1 ? 's' : ''} ${PLOT_BY_ID[p.club].name}, ${p.minutes} min out`).join('; ')}.`);
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
    const [f] = porchLit(s, [guardFighter(g, 'def', night, raid.attacker)], night);
    if (b.at <= s.minute) there.push(f);
    else { const t = (b.at - s.minute) * FIGHT_SECONDS_PER_GAME_MINUTE; later.set(t, [...(later.get(t) ?? []), f]); }
  }
  const joins = [...later].sort(([a], [b]) => a - b).map(([t, fighters]) => ({ t, fighters }));
  return { ...input, defenders: [...input.defenders, ...there], ...(joins.length ? { joins: [...(input.joins ?? []), ...joins] } : {}) };
}

// ---------- rivals send help ----------

export interface RivalHelp { from: string; minutes: number; fighters: Fighter[] }

/**
 * Who a rival sends when it spots your raid on one of its plots (RIVAL_HELP): half the garrison of each of its other
 * plots and its HQ in the same or a bordering district, nearest first, up to the cap by Threat. They walk over from
 * their plot (travelMinutes), and fight as they stand guard there: in their plot's kit (crew.ts garrisonHenchman), an
 * HQ's at the HQ's own strength, as its Gate is held (rivals.ts hqStageInput). An undetected raid gets no help. Draws
 * the henchmen's weapons from rng.
 */
export function rivalHelpFor(s: GameState, raid: Raid, rng: Rng): RivalHelp[] {
  const rival = s.plots[raid.target]?.owner;
  if (raid.attacker !== 'player' || !raid.detected || !rival || rival === 'player') return [];
  const to = PLOT_BY_ID[raid.target].district;
  const near = PLOTS
    .filter((p) => p.id !== raid.target && s.plots[p.id].owner === rival && (p.district === to || BORDERS[to].includes(p.district)))
    .map((p) => ({ id: p.id, minutes: travelMinutes(s, p.id, raid.target) }))
    .sort((a, b) => a.minutes - b.minutes || a.id.localeCompare(b.id));
  let room = RIVAL_HELP.cap[threatLevel(s) - 1] ?? 0;
  const out: RivalHelp[] = [];
  for (const { id, minutes } of near) {
    const n = Math.min(room, Math.floor(fitGarrison(s, id) * RIVAL_HELP.share));
    if (n <= 0) continue;
    const hq = PLOT_BY_ID[id].type === 'hq';
    const helper = (i: number) => (hq ? henchmanFor(s, rival as RivalId, HQS[rival as RivalId].tier, rng, 10 + i) : garrisonHenchman(s, id, rng, 10 + i));
    out.push({ from: id, minutes, fighters: Array.from({ length: n }, (_, i) => helper(i)) });
    room -= n;
    if (room <= 0) break;
  }
  return out;
}

/** The help, into the fight: whoever is there by contact (`lead` minutes after the warning) starts in it; the rest
 * join as they arrive (a game minute is a fight-second). */
export function withRivalHelp(input: BattleInput, help: RivalHelp[], lead: number): BattleInput {
  if (!help.length) return input;
  const there = help.filter((h) => h.minutes <= lead).flatMap((h) => h.fighters);
  const later = help.filter((h) => h.minutes > lead).map((h) => ({ t: (h.minutes - lead) * FIGHT_SECONDS_PER_GAME_MINUTE, fighters: h.fighters }));
  return {
    ...input, defenders: [...input.defenders, ...there],
    ...(later.length ? { joins: [...(input.joins ?? []), ...later].sort((a, b) => a.t - b.t) } : {}),
  };
}

/**
 * Your raid reaches the plot: if it was spotted as it set out, the help the rival sent is there or on its way. They
 * leave their plots' garrisons until the fight is over (helpHome).
 */
export function sendHelp(s: GameState, raid: Raid, input: BattleInput, rng: Rng): BattleInput {
  const lead = Math.max(0, (raid.at ?? 0) - (raid.leave ?? raid.at ?? 0)); // spotted as they set out: warned this long before contact
  const help = rivalHelpFor(s, raid, rng);
  if (!help.length) return input;
  for (const h of help) s.plots[h.from].garrison = Math.max(0, (s.plots[h.from].garrison ?? 0) - h.fighters.length);
  raid.help = help.map((h) => ({ from: h.from, ids: h.fighters.map((f) => f.id) }));
  const n = help.reduce((a, h) => a + h.fighters.length, 0);
  s.news.push(`Spotted! ${FACTIONS[s.plots[raid.target].owner as RivalId].name} send ${n} to ${PLOT_BY_ID[raid.target].name}.`);
  return withRivalHelp(input, help, lead);
}

/** The fight's over: the help walks home to its plots (to the HQ if one was lost meanwhile), the knocked-out too:
 * they're Out a day there (two after a hatchet KO). */
export function helpHome(s: GameState, raid: Raid, res: Pick<BattleResult, 'koed'> & Partial<Pick<BattleResult, 'hatchetKos'>>): void {
  const rival = s.plots[raid.target]?.owner;
  for (const h of raid.help ?? []) {
    const home = rival ? backOnGuard(s, rival, h.from, h.ids.length) : null;
    if (home) knockOut(s, home, h.ids.filter((id) => res.koed.includes(id)), res.hatchetKos);
  }
  delete raid.help;
}
