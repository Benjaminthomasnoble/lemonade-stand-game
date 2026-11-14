import { describe, expect, it } from 'vitest';
import { buySupply, newGame, type GameState } from '../sim/economy.ts';
import { pickStep, rivalNear, STEPS, type CoachEnv, type CoachMemory } from './coach.ts';

/** A screen where everything the tour could point at is drawn. */
const all: CoachEnv = { has: (sel) => !sel.includes(':disabled'), speed: 1 };
const fresh = (): CoachMemory => ({ seen: new Set(), off: false });
const ids = (s: GameState, mem: CoachMemory, e: CoachEnv = all) => {
  const out: string[] = [];
  for (let i = 0; i < 40; i++) {
    const { step, done } = pickStep(s, e, mem);
    done.forEach((d) => mem.seen.add(d));
    if (!step) break;
    out.push(step.id);
    mem.seen.add(step.id);
  }
  return out;
};

describe("Lottie's tour", () => {
  it('opens Day 1 with the bay, the rivals and the goal, then walks the morning in order', () => {
    const s = newGame(1);
    const mem = fresh();
    expect(ids(s, mem).slice(0, 10)).toEqual(['intro-hello', 'intro-vera', 'intro-bay', 'intro-rivals', 'intro-fair', 'intro-goal', 'd1-bosses', 'd1-price', 'd1-crowd', 'd1-open']);
    for (const id of ['d2-lemons', 'd2-sugar', 'd2-ice']) expect(mem.seen.has(id), id).toBe(false); // Lottie stocked the table: the supply buttons wait for the Market
  });

  it("shows each supply button on the Market's first morning, then Auto-Restock, rather than ticking them off for the stand being full", () => {
    const s = newGame(1);
    s.day = 2; // Day 2's Morning Prep: Auto-Restock is on by itself and keeps the stand full, so no button wears a "!"
    const full: CoachEnv = { has: (sel) => !sel.includes(':disabled') && !sel.includes('[data-low]'), speed: 1 };
    const mem = fresh();
    expect(ids(s, mem, full).slice(0, 6)).toEqual(['d2-sky', 'd2-recipe', 'd2-lemons', 'd2-sugar', 'd2-ice', 'd2-auto']);
    const lemons = STEPS.find((st) => st.id === 'd2-lemons')!;
    expect(lemons.at).toBe('[data-action="buy"][data-id="lemons"]');
    expect(lemons.doneOnClick).toBe('[data-action="buy"][data-id="lemons"]'); // a tap on it, or Got it
    expect(lemons.tap).toBe('Got it');
    expect(typeof lemons.say === 'function' && lemons.say(s)).toBe('Buy lemons here. Hold to fill up.');
    s.plots[s.selected].stand!.autoRestock = false; // bought by hand: the "!" lesson
    expect(typeof lemons.say === 'function' && lemons.say(s)).toBe('Lemons first! Tap till the ! goes.');
    const broke: CoachEnv = { has: (sel) => sel.includes(':disabled') || !sel.includes('[data-low]'), speed: 1 }; // no cash or room for more
    expect(pickStep(s, broke, { seen: new Set(['d2-sky', 'd2-recipe']), off: false }).done).toEqual(['d2-lemons', 'd2-sugar', 'd2-ice']);
  });

  it('every line stays short (show, do not tell)', () => {
    const s = newGame(1);
    for (const st of STEPS) {
      const line = typeof st.say === 'function' ? st.say(s) : st.say;
      expect(line.split(/\s+/).length, st.id).toBeLessThanOrEqual(9);
    }
  });

  it('skips what the player already did', () => {
    const s = newGame(1);
    s.day = 2; // the Market's first morning, buying by hand
    const st = s.plots[s.selected].stand!;
    st.autoRestock = false;
    const mem = fresh();
    for (const id of ['d2-sky', 'd2-recipe']) mem.seen.add(id);
    st.inventory.lemons = []; // out of lemons: buy some
    expect(buySupply(s, 'lemons', 1)).toBe(true);
    const lemonsFull: CoachEnv = { has: (sel) => !sel.includes(':disabled') && !sel.includes('[data-fill="lemons"][data-low]'), speed: 1 };
    const { step, done } = pickStep(s, lemonsFull, mem);
    expect(done).toContain('d2-lemons');
    expect(step?.id).toBe('d2-sugar');
  });

  it('waits for the thing it points at to be on screen', () => {
    const s = newGame(1);
    const mem = fresh();
    for (const id of ['intro-hello', 'intro-vera', 'intro-bay', 'intro-rivals', 'intro-fair', 'intro-goal', 'd1-bosses']) mem.seen.add(id);
    const none: CoachEnv = { has: () => false, speed: 1 };
    expect(pickStep(s, none, mem).step).toBeNull();
  });

  it('says nothing when skipped, or when the run has lessons off', () => {
    const s = newGame(1);
    expect(pickStep(s, all, { seen: new Set(), off: true }).step).toBeNull();
    s.settings.lessons = false;
    expect(pickStep(s, all, fresh()).step).toBeNull();
  });

  it('never replays the intro after Day 1', () => {
    const s = newGame(1);
    s.day = 5;
    expect(ids(s, fresh()).some((id) => id.startsWith('intro'))).toBe(false);
  });

  it("points at Auto-Restock and its target on the Market's first morning, rather than ticking it off unseen for being on", () => {
    const s = newGame(1);
    s.day = 2; // Day 2's Morning Prep: Auto-Restock is on by itself
    expect(s.plots[s.selected].stand!.autoRestock).toBe(true);
    const mem = fresh();
    for (const id of ['d2-sky', 'd2-recipe', 'd2-lemons', 'd2-sugar', 'd2-ice']) mem.seen.add(id);
    const { step, done } = pickStep(s, all, mem);
    expect(done).not.toContain('d2-auto');
    expect(step?.id).toBe('d2-auto');
    expect(step?.at).toBe('.cl-stock .cl-auto'); // the restock switch (Auto-Price's is a .cl-auto too, from Rank 3)
    expect(step?.say).toBe('I buy supplies each dawn. Set the target.');
    expect(step?.tap).toBe('Got it');
    expect(step?.doneOnClick).toBe('[data-action="stockTarget"]'); // the − / + / Suggested buttons
    expect(pickStep(s, { has: (sel) => sel !== '.cl-stock .cl-auto', speed: 1 }, mem).step?.id).not.toBe('d2-auto'); // waits for the tray
    s.plots[s.selected].stand!.autoRestock = false; // switched off: "I buy supplies" isn't true, so it waits
    expect(pickStep(s, all, mem).step?.id).not.toBe('d2-auto');
  });

  it('introduces a real rival near the Corner', () => {
    const r = rivalNear(newGame(1));
    expect(r).not.toBeNull();
  });
});
