// The random events' table (events.ts runs them). It imports nothing at run time, so a module can register its events as
// it loads whichever module the game or a test loads first: events.ts loads the economy, which loads happenings.ts, which
// registers. events.ts re-exports both.
import type { EventDef } from './events.ts';

export const EVENT_DEFS: Record<string, EventDef> = {};
/** Add an event to the pool. Land's Hurricane and Health Inspection register theirs the same way. */
export function registerEvent(def: EventDef): void {
  EVENT_DEFS[def.id] = def;
}
