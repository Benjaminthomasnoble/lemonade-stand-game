import { describe, expect, it } from 'vitest';
import { eventsOf, HURRICANE_ID, INSPECTION_ID, LOTTIES_CORNER, newGame, type GameState, type WorldEvent } from '../sim/economy.ts';
import { eventFeed, eventTickets } from './events.ts';

/** An event that started today (its dawn or its hour has come), as the scheduler leaves it. */
function live(s: GameState, e: Omit<WorldEvent, 'from' | 'to' | 'live'>, days = 1): void {
  eventsOf(s).on.push({ ...e, from: s.day, to: s.day + days - 1, live: true });
}
const about = (feed: string[], word: string) => feed.filter((t) => t.includes(word));

describe("the feed's event tickets", () => {
  it('a plain event gets its ticket, with its counter-play', () => {
    const s = newGame(31);
    s.phase = 'prep';
    live(s, { id: 'heatWave' }, 3);
    const [ticket] = about(eventFeed(s), 'data-event="heatWave"');
    expect(ticket).toContain('<b>Heat Wave</b>');
    expect(ticket).toContain('Extra ice, higher prices, Frozen');
  });

  it('holds one Hurricane ticket on its day, at Morning Prep and once it hits', () => {
    const s = newGame(32);
    s.phase = 'prep';
    live(s, { id: HURRICANE_ID });
    let feed = about(eventFeed(s), 'Hurricane');
    expect(feed).toHaveLength(1);
    expect(feed[0]).toContain('data-testid="hurricane"'); // its own (src/ui/damage.ts): the warning and the HP you keep
    expect(feed[0]).toContain('<b>Hurricane at the open</b>');
    s.phase = 'open';
    s.plots[LOTTIES_CORNER].stand!.hp = 40; // it hit
    feed = about(eventFeed(s), 'Hurricane');
    expect(feed).toHaveLength(1);
    expect(feed[0]).toContain(`data-action="repair" data-plot="${LOTTIES_CORNER}"`);
    expect(eventTickets(s)).toEqual([]);
  });

  it('holds one ticket for a failed health inspection, and none for a pass', () => {
    const s = newGame(33);
    s.phase = 'open';
    live(s, { id: INSPECTION_ID, at: 12 * 60 + 30, district: 'maple', plots: [LOTTIES_CORNER] });
    s.minute = 13 * 60;
    s.plots[LOTTIES_CORNER].inspected = { day: s.day, fault: 'stock' };
    const feed = about(eventFeed(s), 'nspect');
    expect(feed).toHaveLength(1);
    expect(feed[0]).toContain('<b>Closed until dawn</b>');
    expect(feed[0]).not.toContain('data-action="restockNow"'); // it is closed: no Restock now
    s.plots[LOTTIES_CORNER].inspected = { day: s.day };
    expect(about(eventFeed(s), 'nspect')).toEqual([]);
  });
});
