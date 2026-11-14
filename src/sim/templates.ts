// Raid templates (spec: Helpers that keep a big empire calm, "Raid templates | Rank 6 | Repeat raids in one tap |
// When to send them"; Raid Planner, "Raid templates (Rank 6) save a squad and objective for one-tap repeats").
// Like every helper it is a switch, a target and a one-line Ledger report: the switch is the Crew tab's (on from
// Rank 6), each template's target is the rival plot it last went for, and the Ledger counts the raids sent with one.
// With the switch on, the Raid Planner opens on a template's target with that template's squad and objective, so
// repeating the raid is one tap on Tonight or Now; on any other plot a tap on the template fills the Planner the same
// way. The player still decides when: a template never sends a raid by itself, and every raid passes canRaid.
import { RAID_TEMPLATES } from './balance.ts';
import type { Blocker, GameState } from './economy.ts';
import type { RaidObjective } from './crew.ts';
import { bookHelper, registerHelper, type HelperDay } from './automation.ts';
import { peaceful } from './modes.ts';

/** A saved raid: who goes and what for, and the plot it last went for (its target). An HQ Assault is never saved. */
export interface RaidTemplate { id: string; name: string; guards: string[]; objective: Exclude<RaidObjective, 'hq'>; target?: string }

export interface TemplateState {
  /** The switch (Crew tab): off, the Planner leaves the templates out and opens with Dex's squad. */
  off?: boolean;
  list?: RaidTemplate[];
}

export const TEMPLATES_ID = 'templates';

/** Templates exist from Rank 6, and never in a Peaceful Sandbox (no raids there). */
export const templatesUnlocked = (s: GameState): boolean => s.rank >= RAID_TEMPLATES.rank && !peaceful(s);
/** The switch: on (the default) from Rank 6. */
export const templatesOn = (s: GameState): boolean => templatesUnlocked(s) && !s.raidTemplates?.off;
export const templates = (s: GameState): readonly RaidTemplate[] => s.raidTemplates?.list ?? [];

const LABEL: Record<RaidTemplate['objective'], string> = { smash: 'Smash', shakedown: 'Shakedown', sabotage: 'Sabotage' };
const sameSquad = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((id) => b.includes(id));

/** The template with this squad and objective, if one is saved. */
export const templateFor = (s: GameState, guardIds: readonly string[], objective: RaidObjective): RaidTemplate | undefined =>
  templates(s).find((t) => t.objective === objective && sameSquad(t.guards, guardIds));

/** The template aimed at this plot (the one that last went for it), while the switch is on: the Planner opens with it. */
export const templateAt = (s: GameState, plotId: string): RaidTemplate | undefined =>
  templatesOn(s) ? templates(s).find((t) => t.target === plotId) : undefined;

export function canSaveTemplate(s: GameState, guardIds: readonly string[], objective: RaidObjective): Blocker {
  if (s.rank < RAID_TEMPLATES.rank) return { ok: false, why: `Raid templates unlock at Rank ${RAID_TEMPLATES.rank}` };
  if (!templatesOn(s)) return { ok: false, why: 'Raid templates are switched off' };
  if (objective === 'hq') return { ok: false, why: 'An HQ falls once: no template' };
  if (!guardIds.length) return { ok: false, why: 'Pick your squad first' };
  if (templateFor(s, guardIds, objective)) return { ok: false, why: 'Already saved' };
  if (templates(s).length >= RAID_TEMPLATES.max) return { ok: false, why: `${RAID_TEMPLATES.max} saved: drop one first` };
  return { ok: true };
}

/** Save the squad and objective, aimed at `target`, named for whoever leads it: "Rosa's Smash". */
export function saveTemplate(s: GameState, guardIds: readonly string[], objective: RaidObjective, target?: string): RaidTemplate | null {
  if (objective === 'hq' || !canSaveTemplate(s, guardIds, objective).ok) return null;
  const lead = s.guards.find((g) => g.id === guardIds[0]);
  const base = `${lead ? `${lead.name.split(' ')[0]}'s ` : ''}${LABEL[objective]}`;
  const taken = new Set(templates(s).map((t) => t.name));
  let name = base;
  for (let n = 2; taken.has(name); n++) name = `${base} ${n}`;
  const t: RaidTemplate = { id: `t${s.nextId++}`, name, guards: [...guardIds], objective, ...(target ? { target } : {}) };
  ((s.raidTemplates ??= {}).list ??= []).push(t);
  return t;
}

export function dropTemplate(s: GameState, id: string): boolean {
  const list = s.raidTemplates?.list;
  const i = list?.findIndex((t) => t.id === id) ?? -1;
  if (!list || i < 0) return false;
  list.splice(i, 1);
  return true;
}

/** The Crew tab's switch. */
export function switchTemplates(s: GameState): boolean {
  if (!templatesUnlocked(s)) return false;
  const st = (s.raidTemplates ??= {});
  if (st.off) delete st.off; else st.off = true;
  return true;
}

/** The HUD's template action (main.ts): save the Planner's squad and objective, drop one, or flip the switch. */
export function raidTemplate(s: GameState, a: { op: 'save' | 'drop' | 'switch'; id?: string; plot?: string; guards?: string[]; objective?: RaidObjective }): boolean {
  if (a.op === 'save') return !!saveTemplate(s, a.guards ?? [], a.objective ?? 'smash', a.plot);
  if (a.op === 'drop') return dropTemplate(s, a.id ?? '');
  return switchTemplates(s);
}

/** planRaid, once a raid is on its way: a raid sent with a template's squad and objective re-aims the template at its
 * plot and counts on the Ledger's line. */
export function noteTemplateRaid(s: GameState, guardIds: readonly string[], objective: RaidObjective, plotId: string): void {
  const t = templatesOn(s) ? templateFor(s, guardIds, objective) : undefined;
  if (!t) return;
  for (const other of templates(s)) if (other !== t && other.target === plotId) delete other.target; // one template per target
  t.target = plotId;
  bookHelper(s, TEMPLATES_ID, 0, { count: (s.today.auto?.[TEMPLATES_ID]?.count ?? 0) + 1 });
}

/** The Ledger's line: "2 raids sent". */
export const templatesLine = (d: HelperDay): string => `${d.count} raid${d.count === 1 ? '' : 's'} sent`;

/** Saves: the field is optional; drop what isn't a template, and anything past the cap. Idempotent (migrateCrew). */
export function migrateTemplates(s: GameState): void {
  const st = s.raidTemplates;
  if (!st) return;
  if (typeof st !== 'object') { delete s.raidTemplates; return; }
  if (st.off !== undefined && st.off !== true) delete st.off;
  if (st.list !== undefined) {
    st.list = Array.isArray(st.list)
      ? st.list.filter((t) => t && typeof t.id === 'string' && typeof t.name === 'string' && Array.isArray(t.guards) && t.objective in LABEL).slice(0, RAID_TEMPLATES.max)
      : [];
  }
}

// A helper in the automation frame: no dawn run and nothing spent; the raids it sent are its Ledger line.
registerHelper({ id: TEMPLATES_ID, name: 'Raid templates', unlocked: templatesUnlocked, line: templatesLine });
