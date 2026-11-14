// Lottie's tour (spec "Onboarding: the first 30 minutes"): the first time you
// play, Grandma Lottie shows you the bay, then walks you through Day 1 by
// pointing a clay finger at each thing to tap and waiting for you to tap it.
// Each later day's lesson, and each bigger system the first time it shows up
// (raid warnings, fight replays, big orders, the Raid Planner...), gets one
// short pointed line too. Show, don't tell: one line of eight words or so in a
// speech bubble, said in Lemonese, never a page of text.
//
// What you've seen is kept on this device, so the tour never repeats; "Skip
// tour" switches it off and Options can replay it. The run's Lessons switch
// (src/sim/story.ts) turns it off for that run as well.
import type { GameState } from '../sim/economy.ts';
import { FACTIONS, LESSON_DAY, type RivalId } from '../sim/balance.ts';
import { LOTTIES_CORNER, PLOT_BY_ID, PLOTS } from '../sim/map.ts';
import { lessonsOn } from '../sim/story.ts';
import { rivalsInPlay } from '../sim/land.ts';
import { restockOn } from '../sim/automation.ts';
import { INK, S, gr, sheenE, svg, uid } from './clay.ts';

const KEY = 'lemonade-stand-wars/coach/v1';

/** What the coach knows about the screen this frame (the DOM, kept behind a function so the picking logic tests in Node). */
export interface CoachEnv {
  has(selector: string): boolean;
  speed: number;
}

export type CoachCamera = 'home' | 'bay' | 'plot';

export interface Step {
  id: string;
  /** Shown now, if it hasn't been seen. */
  when: (s: GameState, e: CoachEnv) => boolean;
  /** Point at this on screen (the step waits until it's there). */
  at?: string;
  /** ...or at this plot in the world. */
  plot?: (s: GameState) => string | null;
  /** Lottie's line: about eight words. */
  say: string | ((s: GameState) => string);
  /** The player has done it: the step is over (checked even before it shows, so a step you beat Lottie to never nags). */
  done?: (s: GameState, e: CoachEnv) => boolean;
  /** A tap on something matching this finishes the step. */
  doneOnClick?: string;
  /** Show a button to go on (its label); steps without one wait for the player to do the thing. */
  tap?: string | ((s: GameState) => string);
  /** Move the camera when the step shows. */
  camera?: CoachCamera;
  /** The opening tour: a bigger card in the middle, the HUD tucked away. */
  intro?: boolean;
  mood?: 'happy' | 'ask' | 'flat' | 'grumpy';
}

// ---------- helpers on the state ----------
const prep = (s: GameState, day: number) => s.day === day && s.phase === 'prep' && !s.outcome;
const own = (s: GameState) => s.plots[s.selected]?.owner === 'player' ? s.plots[s.selected].stand : null;
const stockOf = (s: GameState, id: 'lemons' | 'sugar' | 'ice') => {
  const st = own(s);
  if (!st) return 0;
  return id === 'lemons' ? st.inventory.lemons.reduce((a, b) => a + b.qty, 0) : st.inventory[id];
};
const supplied = (s: GameState) => { const st = own(s); return !!st && restockOn(s, st); }; // Auto-Restock runs from Day 3
/** Enough of one supply for the day: some in stock and no "!" on it (lemons and sugar share theirs), or no cash for more. */
const stocked = (s: GameState, e: CoachEnv, id: 'lemons' | 'sugar' | 'ice') => supplied(s)
  || (stockOf(s, id) > 0 && !e.has(`[data-fill="${id}"][data-low]`))
  || e.has(`[data-action="buy"][data-id="${id}"]:disabled`);

/** The rival stand nearest Lottie's Corner: who the tour introduces. */
export function rivalNear(s: GameState): { plot: string; rival: RivalId } | null {
  const home = PLOT_BY_ID[LOTTIES_CORNER];
  let best: { plot: string; rival: RivalId; d: number } | null = null;
  for (const p of PLOTS) {
    const ps = s.plots[p.id];
    if (!ps?.owner || ps.owner === 'player' || !ps.stand) continue;
    const d = Math.hypot(p.x - home.x, p.z - home.z);
    if (!best || d < best.d) best = { plot: p.id, rival: ps.owner as RivalId, d };
  }
  return best && { plot: best.plot, rival: best.rival };
}
const rivalName = (s: GameState) => { const r = rivalNear(s); return r ? FACTIONS[r.rival].name : 'Rival gangs'; };
/** How many gangs play: five on the whole bay, two or three on a Sandbox map cut from it. */
const gangs = (s: GameState) => ['no', 'one', 'two', 'three', 'four', 'five'][rivalsInPlay(s).length] ?? 'five';
const Gangs = (s: GameState) => gangs(s)[0].toUpperCase() + gangs(s).slice(1);

/** Day 3's side lot, while it's yours to take. */
const sideLot = (s: GameState) => PLOTS.find((p) => s.plots[p.id]?.dibs?.who === 'player' && s.plots[p.id].dibs?.table && !s.plots[p.id].owner)?.id ?? null;

// ---------- the tour ----------
/** In order: the first one that's due and unseen shows. */
export const STEPS: Step[] = [
  // The opening: who Lottie is, the bay, the rivals, the goal.
  // The story in five beats (Ben, 2026-11-08: "WHY am I playing?"): the stolen recipes, the gangs, the first rival,
  // the deadline, the goal. Story Campaign only for the recipe beats; every mode meets the rivals and the board.
  { id: 'intro-hello', intro: true, when: (s) => prep(s, 1), camera: 'home', say: "Summer's here, kid! This is my corner.", tap: 'Hi, Grandma!', mood: 'happy' },
  { id: 'intro-vera', intro: true, when: (s) => prep(s, 1) && s.settings.mode === 'campaign', camera: 'bay', say: 'Forty years ago, Vera Sourwood stole my recipes.', tap: 'She what?!', mood: 'grumpy' },
  { id: 'intro-bay', intro: true, when: (s) => prep(s, 1), camera: 'bay', say: (s) => `Now ${gangs(s)} drink gangs run Citrine Bay.`, tap: (s) => `${Gangs(s)}?!` },
  { id: 'intro-rivals', intro: true, when: (s) => prep(s, 1) && !!rivalNear(s), camera: 'plot', plot: (s) => rivalNear(s)?.plot ?? null, say: (s) => `${rivalName(s)}. They want this corner.`, tap: 'No way', mood: 'grumpy' },
  { id: 'intro-fair', intro: true, when: (s) => prep(s, 1) && s.settings.mode === 'campaign', camera: 'home', say: 'Beat Brock at the Summer Fair, Day 14!', tap: 'Then what?' },
  { id: 'intro-goal', intro: true, when: (s) => prep(s, 1), camera: 'home', say: (s) => (s.settings.mode === 'campaign' ? 'Then all five. And my recipes come home.' : `Knock out all ${gangs(s)}. Own the bay!`), tap: "Let's go!", mood: 'happy' },

  { id: 'd1-bosses', when: (s) => prep(s, 1), at: '[data-testid="bosses"]', say: (s) => `The ${gangs(s)} gang bosses. Cross them all out!`, tap: 'Got it', mood: 'grumpy' },

  // Day 1, the morning: stock, price, open.
  // The supply buttons wear a "!" while today's stock runs short: tap until it pops off (or you can't afford more).
  { id: 'd1-lemons', when: (s) => prep(s, 1), at: '[data-action="buy"][data-id="lemons"]', say: 'Lemons first! Tap till the ! goes.', done: (s, e) => stocked(s, e, 'lemons') },
  { id: 'd1-sugar', when: (s) => prep(s, 1), at: '[data-action="buy"][data-id="sugar"]', say: 'Now sugar. Same trick!', done: (s, e) => stocked(s, e, 'sugar') },
  { id: 'd1-ice', when: (s) => prep(s, 1), at: '[data-action="buy"][data-id="ice"]', say: 'Ice keeps it cold. Fill it up.', done: (s, e) => stocked(s, e, 'ice') },
  { id: 'd1-price', when: (s) => prep(s, 1), at: '.cl-price .cl-row', say: 'Your price. Too high and folks walk.', doneOnClick: '[data-action="price"],[data-action="priceCeiling"]', tap: 'Got it' },
  { id: 'd1-crowd', when: (s) => prep(s, 1), at: '.cl-crowd', say: 'More faces lit, more customers.', tap: 'Got it' },
  { id: 'd1-open', when: (s) => prep(s, 1), at: '[data-testid="open"]', say: 'All set? Open up!', done: (s) => s.phase !== 'prep' || s.day > 1, mood: 'happy' },

  // Day 1, open: watch the street, speed, goals.
  { id: 'd1-watch', when: (s) => s.day === 1 && s.phase === 'open', plot: (s) => s.selected, say: 'Watch their bubbles. They tell you why.', tap: 'Got it' },
  { id: 'd1-speed', when: (s) => s.day === 1 && s.phase === 'open', at: '[data-action="speed"][data-value="3"]', say: 'Too slow? Speed up time here.', doneOnClick: '[data-action="speed"],[data-action="skip"]', done: (_s, e) => e.speed >= 2, tap: 'Later' },
  { id: 'd1-goals', when: (s) => s.day === 1 && s.phase === 'open', at: '[data-testid="goals"]', say: 'My goals for you. They pay!', doneOnClick: '[data-testid="goals"]', tap: 'Got it' },

  // Day 1, the evening card.
  { id: 'd1-report', when: (s) => s.phase === 'report', at: '[data-testid="report"] .cl-end-row', say: 'Cups sold, folks missed, your stars.', tap: 'Got it' },
  { id: 'd1-sleep', when: (s) => s.phase === 'report', at: '[data-testid="report"] [data-testid="night"]', say: 'Sleep. Quiet nights fly by.', done: (s) => s.phase !== 'report', doneOnClick: '[data-action="night"],[data-action="sleep"]' },

  // Day 2: weather and recipes.
  { id: 'd2-sky', when: (s) => s.day >= LESSON_DAY.forecast && s.phase === 'prep', at: '.cl-wx', say: 'Check the sky every morning.', tap: 'Got it' },
  { id: 'd2-recipe', when: (s) => s.day >= LESSON_DAY.recipes && s.phase === 'prep', at: '.cl-recipe', say: 'Try each pitcher. Watch the faces.', doneOnClick: '[data-action="recipe"],[data-action="sweet"]', tap: 'Got it' },
  { id: 'd2-rivals', when: (s) => s.day >= 2 && s.phase === 'open' && !!rivalNear(s), plot: (s) => rivalNear(s)?.plot ?? null, camera: 'plot', say: (s) => `${rivalName(s)} want your customers.`, tap: 'Not today!', mood: 'grumpy' },

  // Day 3: Auto-Restock and the side lot.
  { id: 'd3-auto', when: (s) => s.phase === 'prep', at: '.cl-auto', say: 'Tap Auto. I buy supplies for you.', done: (s) => supplied(s), doneOnClick: '[data-action="restock"]', tap: 'Later' },
  { id: 'd3-lot', when: (s) => s.phase === 'prep' && !!sideLot(s), plot: sideLot, camera: 'plot', say: 'My side lot. Tap it, kid!', done: (s) => !sideLot(s), doneOnClick: '[data-testid="plotcard"]', tap: 'Later' },
  { id: 'd3-buy', when: (s) => s.phase === 'prep', at: '[data-testid="plotcard"] [data-testid="buy-plot"]', say: 'Buy it. Two stands, double sales.', doneOnClick: '[data-testid="buy-plot"]', tap: 'Later' },
  { id: 'd3-picker', when: (s) => s.phase === 'prep', at: '.cl-picker', say: 'Two stands! Tap to switch between.', doneOnClick: '.cl-picker [data-action="select"]', tap: 'Got it' },

  // Day 4: Grow and the Rank badge.
  { id: 'd4-grow', when: (s) => s.phase === 'prep', at: '[data-testid="tab-grow"]', say: 'Grow tab! Build a bigger stand.', done: (_s, e) => e.has('[data-testid="tab-grow"].on'), doneOnClick: '[data-testid="tab-grow"]', tap: 'Later' },
  { id: 'd4-upgrade', when: (s) => s.phase === 'prep', at: '[data-testid="upgrade"]', say: 'Bigger stand, more customers.', doneOnClick: '[data-testid="upgrade"]', tap: 'Got it' },
  { id: 'd4-rank', when: () => true, at: '.cl-left .cl-rank', say: 'Your rank. It unlocks new stuff.', tap: 'Got it' },

  // Day 5 on: trouble, fences and Dex.
  { id: 'd5-threat', when: () => true, at: '[data-testid="threat"]', say: 'Sour lemons: how mad the gangs are.', tap: 'Yikes', mood: 'grumpy' },
  { id: 'd5-defend', when: (s) => s.phase === 'prep', at: '[data-testid="tab-crew"]', say: 'Trouble coming. Defend tab!', done: (_s, e) => e.has('[data-testid="tab-crew"].on'), doneOnClick: '[data-testid="tab-crew"]', tap: 'Later', mood: 'grumpy' },
  { id: 'd5-fence', when: (s) => s.phase === 'prep', at: '[data-testid="perimeter"]', say: 'A fence keeps raiders out.', doneOnClick: '[data-testid="perimeter"]', tap: 'Got it' },
  { id: 'd6-dex', when: (s) => s.guards.length > 0, at: '[data-testid="post-here"]', say: 'Post Dex here for the night.', doneOnClick: '[data-testid="post-here"]', tap: 'Got it' },
  { id: 'd7-sign', when: (s) => s.phase === 'prep', at: '[data-testid="brand"]', say: 'Paint a sign. Folks notice!', doneOnClick: '[data-testid="brand"]', tap: 'Got it' },

  // Whenever they first show up.
  { id: 'h-call', when: () => true, at: '[data-testid="day-call"]', say: 'Your call, kid. Every choice costs something.', doneOnClick: '[data-action="call"]', tap: 'Got it' },
  { id: 'h-raid', when: () => true, at: '[data-testid="raid-warning"]', say: 'Raiders coming! Fence it, or lose the till.', tap: 'On it', mood: 'grumpy' },
  { id: 'h-replay', when: () => true, at: '[data-testid="replay"]', say: 'A fight! Tap to watch it.', doneOnClick: '[data-testid="replay"]', tap: 'Later' },
  { id: 'h-damaged', when: () => true, at: '[data-testid="damaged"]', say: 'Busted up. Fix it, it sells more.', tap: 'Got it' },
  { id: 'h-red', when: () => true, at: '[data-testid="in-the-red"]', say: "We're broke! Sell more, or borrow.", tap: 'Got it', mood: 'grumpy' },
  { id: 'h-order', when: () => true, at: '[data-testid="orders"] [data-testid="accept"]', say: 'A big order! Take it for cash.', doneOnClick: '[data-testid="orders"] button', tap: 'Got it' },
  { id: 'h-forsale', when: () => true, at: '[data-testid="plotcard"] [data-testid="buy-plot"]', say: 'Buy land, open another stand.', doneOnClick: '[data-testid="buy-plot"]', tap: 'Got it' },
  { id: 'h-hire', when: () => true, at: '[data-testid="hire"]', say: 'More guards, fewer smashed stands.', tap: 'Got it' },
  { id: 'h-planner', when: () => true, at: '[data-testid="raid-planner"]', say: 'Hit back! Plan a raid here.', tap: 'Heh heh', mood: 'grumpy' },
];

export interface CoachMemory { seen: Set<string>; off: boolean }

/**
 * The step to show now (or null), and the steps the player has already done that can be marked seen.
 * Pure: the DOM comes in through `e`.
 */
export function pickStep(s: GameState, e: CoachEnv, mem: CoachMemory, steps: Step[] = STEPS): { step: Step | null; done: string[] } {
  const done: string[] = [];
  if (mem.off || !lessonsOn(s) || s.outcome) return { step: null, done };
  for (const st of steps) {
    if (mem.seen.has(st.id)) continue;
    if (!st.when(s, e)) continue;
    if (st.done?.(s, e)) { done.push(st.id); continue; }
    if (st.at && !e.has(st.at)) continue;
    if (!st.at && st.plot && !st.plot(s)) continue;
    return { step: st, done };
  }
  return { step: null, done };
}

/** The intro is over (or was never due): later intro steps never show once the player is past the morning of Day 1. */
export const introSteps = () => STEPS.filter((s) => s.intro).map((s) => s.id);

// ---------- the memory, on this device ----------
export function loadCoach(): CoachMemory {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as { seen?: unknown; off?: unknown };
    return { seen: new Set(Array.isArray(raw.seen) ? raw.seen.filter((x): x is string => typeof x === 'string') : []), off: raw.off === true };
  } catch { return { seen: new Set(), off: false }; }
}
export function saveCoach(m: CoachMemory): void {
  try { localStorage.setItem(KEY, JSON.stringify({ seen: [...m.seen], off: m.off })); } catch { /* blocked storage: the tour just runs again next time */ }
}

// ---------- the clay art: Lottie's face and a pointing hand ----------
/** Grandma Lottie in clay: straw hat with a lemon on the band, white bun, round specs, purple cardigan. */
export function lottieFaceSVG(): string {
  const skin = uid(), hat = uid(), knit = uid(), hair = uid(), lem = uid();
  return svg(`<defs>${gr(skin, '#F6C9A0')}${gr(hat, '#F7C948')}${gr(knit, '#8E5CC4')}${gr(hair, '#F4F1EA')}${gr(lem, '#FFE14D')}</defs>
    <ellipse cx="40" cy="76" rx="26" ry="4" fill="${INK}" opacity=".18"/>
    <path d="M12 76c0-14 10-22 28-22s28 8 28 22z" fill="url(#${knit})" ${S}/>
    <path d="M33 56l7 9 7-9" fill="#fffdf6" ${S} stroke-width="2.4"/>
    <circle cx="27" cy="68" r="2.2" fill="#F7C948" ${S} stroke-width="1.6"/>
    <circle cx="16" cy="40" r="7" fill="url(#${hair})" ${S}/><circle cx="64" cy="40" r="7" fill="url(#${hair})" ${S}/>
    <circle cx="40" cy="40" r="20" fill="url(#${skin})" ${S}/>
    <path d="M22 33c4-9 32-9 36 0" fill="url(#${hair})" ${S} stroke-width="2.6"/>
    <path d="M6 26c6-6 62-6 68 0-4 4-64 4-68 0z" fill="url(#${hat})" ${S}/>
    <path d="M20 24c1-14 39-14 40 0z" fill="url(#${hat})" ${S}/>
    <path d="M21 22c8 3 30 3 38 0" fill="none" stroke="#E8704F" stroke-width="4" stroke-linecap="round"/>
    <ellipse cx="54" cy="18" rx="5.5" ry="4" fill="url(#${lem})" ${S} stroke-width="2" transform="rotate(-20 54 18)"/>
    <path d="M24 14l4 2M32 11l2 3M44 11l-1 3M52 13l-3 2" stroke="#d7a52a" stroke-width="1.6" stroke-linecap="round"/>
    <circle cx="32" cy="41" r="6" fill="#fff" fill-opacity=".45" stroke="${INK}" stroke-width="2.4"/>
    <circle cx="48" cy="41" r="6" fill="#fff" fill-opacity=".45" stroke="${INK}" stroke-width="2.4"/>
    <path d="M38 41h4" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>
    <circle cx="32" cy="41.5" r="1.9" fill="${INK}"/><circle cx="48" cy="41.5" r="1.9" fill="${INK}"/>
    <circle cx="31.3" cy="40.6" r=".6" fill="#fff"/><circle cx="47.3" cy="40.6" r=".6" fill="#fff"/>
    <ellipse cx="27" cy="49" rx="3.4" ry="2" fill="#F4A3B5"/><ellipse cx="53" cy="49" rx="3.4" ry="2" fill="#F4A3B5"/>
    <path d="M34 51q6 5 12 0" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>
    ${sheenE(30, 30, 4, 2)}${sheenE(30, 6 + 13, 5, 1.6, -8)}`, '0 0 80 80');
}

/** A plump clay hand, index finger pointing right (the coach turns it toward the target). */
export function handSVG(): string {
  const skin = uid(), cuff = uid();
  return svg(`<defs>${gr(skin, '#F6C9A0')}${gr(cuff, '#8E5CC4')}</defs>
    <path d="M30 23h24a6 6 0 0 1 0 12H34z" fill="url(#${skin})" ${S}/>
    <path d="M14 22c6-6 16-6 22-1v26c-6 4-17 4-22-1z" fill="url(#${skin})" ${S}/>
    <path d="M33 36h7a4.5 4.5 0 0 1 0 9h-6M33 45h5a4 4 0 0 1 0 8h-6" fill="url(#${skin})" ${S} stroke-width="2.6"/>
    <path d="M24 20c0-6 8-8 10-3l1 6" fill="url(#${skin})" ${S} stroke-width="2.6"/>
    <path d="M4 20h12v28H4z" fill="url(#${cuff})" ${S} transform="rotate(-4 10 34)"/>
    <path d="M51 26.5v5" stroke="#e8a98a" stroke-width="2" stroke-linecap="round"/>
    ${sheenE(42, 26, 5, 1.6, 0)}${sheenE(21, 27, 3, 1.6)}`);
}

/** A clay "go on" arrow for the Next button. */
const arrowSVG = () => svg(`<path d="M12 26h26V15l16 17-16 17V38H12z" fill="#fffdf6" ${S}/>`);

// ---------- the layer on screen ----------
export interface CoachDeps {
  /** Lottie says it: Lemonese babble, and a wave from her chair. */
  say(line: string, mood: NonNullable<Step['mood']>): void;
  /** Swing the camera for a step. */
  camera(where: CoachCamera, plot: string | null): void;
  /** Where a plot sits on screen (null: off screen or not drawn). */
  plotAt(plot: string): [number, number] | null;
}

export interface Coach {
  /** Once a frame. `blocked`: full-screen paper, a scene, a fight or a VIP show is up; the coach steps aside. */
  update(s: GameState, speed: number, blocked: boolean): void;
  /** Forget what's been seen and switch the tour back on (Options). */
  replay(): void;
  /** The tour's on/off state and what's been seen (for tests and the debug handle). */
  memory(): CoachMemory;
  current(): string | null;
}

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

export function createCoach(ui: HTMLElement, deps: CoachDeps, enabled = true): Coach {
  const mem = loadCoach();
  const layer = document.createElement('div');
  layer.className = 'coach';
  layer.setAttribute('aria-live', 'polite');
  layer.innerHTML = `<div class="coach-ring"></div><div class="coach-hand">${handSVG()}</div><div class="coach-card" data-testid="coach"></div>`;
  ui.appendChild(layer);
  const ring = layer.querySelector('.coach-ring') as HTMLElement;
  const hand = layer.querySelector('.coach-hand') as HTMLElement;
  const card = layer.querySelector('.coach-card') as HTMLElement;
  let shown: Step | null = null;
  let lastState: GameState | null = null;
  const face = lottieFaceSVG();

  const env = (speed: number): CoachEnv => ({ has: (sel) => visible(ui.querySelector(sel)), speed });
  const visible = (el: Element | null) => {
    if (!el || layer.contains(el)) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
  };

  const finish = (id: string) => { mem.seen.add(id); saveCoach(mem); };
  const hide = () => { layer.classList.remove('on', 'intro'); document.body.classList.remove('coach-intro'); shown = null; };

  const show = (st: Step, s: GameState) => {
    shown = st;
    const line = typeof st.say === 'function' ? st.say(s) : st.say;
    const intro = !!st.intro;
    card.innerHTML = `<span class="coach-face">${face}</span>
      <div class="coach-bubble"><b class="coach-line">${esc(line)}</b>
        <span class="coach-acts">${st.tap ? `<button class="coach-next" data-coach="next" data-testid="coach-next">${esc(typeof st.tap === 'function' ? st.tap(s) : st.tap)}${arrowSVG()}</button>` : ''}
        <button class="coach-skip" data-coach="skip" data-testid="coach-skip" title="Switch Lottie's tour off (Options can replay it)">Skip tour</button></span></div>`;
    layer.classList.add('on');
    layer.classList.toggle('intro', intro);
    document.body.classList.toggle('coach-intro', intro);
    card.classList.remove('coach-in'); void card.offsetWidth; card.classList.add('coach-in');
    if (st.camera) deps.camera(st.camera, st.plot?.(s) ?? null);
    deps.say(line, st.mood ?? 'flat');
  };

  layer.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('[data-coach]') as HTMLElement | null;
    if (!b || !shown) return;
    if (b.dataset.coach === 'skip') { mem.off = true; saveCoach(mem); }
    else finish(shown.id);
    hide();
  });
  // Doing the thing finishes the step (capture: before the HUD redraws what was tapped).
  ui.addEventListener('click', (e) => {
    if (!shown?.doneOnClick) return;
    const t = e.target as HTMLElement;
    if (layer.contains(t)) return;
    if (t.closest(shown.doneOnClick)) { finish(shown.id); hide(); }
  }, true);

  /** Put the finger, the ring and the card next to the target. */
  const place = (s: GameState) => {
    const st = shown!;
    let box: { x: number; y: number; w: number; h: number } | null = null;
    if (st.at) {
      const el = ui.querySelector(st.at);
      if (el && !layer.contains(el)) { const r = el.getBoundingClientRect(); box = { x: r.left, y: r.top, w: r.width, h: r.height }; }
    } else if (st.plot) {
      const id = st.plot(s);
      const p = id ? deps.plotAt(id) : null;
      if (p) box = { x: p[0] - 40, y: p[1] - 40, w: 80, h: 80 };
    }
    const W = innerWidth, H = innerHeight;
    const cw = card.offsetWidth || 320, ch = card.offsetHeight || 120;
    const pad = 8;
    if (!box || st.intro) {
      // The opening tour sits low and central, so the bay shows above it; a plot it names still gets the finger.
      card.style.left = `${Math.round((W - cw) / 2)}px`;
      card.style.top = `${Math.round(st.intro ? H - ch - Math.max(24, H * 0.08) : H * 0.3 - ch / 2)}px`;
      if (!box) { ring.style.display = 'none'; hand.style.display = 'none'; return; }
    }
    ring.style.display = '';
    hand.style.display = '';
    ring.style.left = `${box.x - pad}px`; ring.style.top = `${box.y - pad}px`;
    ring.style.width = `${box.w + pad * 2}px`; ring.style.height = `${box.h + pad * 2}px`;
    const cx = box.x + box.w / 2;
    const below = box.y + box.h / 2 < H * 0.45; // a target up top: hand and card hang below it
    const hs = hand.offsetWidth || 64;
    const hx = Math.max(4, Math.min(W - hs - 4, cx - hs / 2));
    const hy = below ? box.y + box.h + pad + 2 : box.y - pad - hs - 2;
    hand.style.left = `${hx}px`; hand.style.top = `${hy}px`;
    hand.dataset.dir = below ? 'up' : 'down';
    if (st.intro) return;
    const cy = below ? hy + hs + 6 : hy - ch - 6;
    card.style.left = `${Math.max(8, Math.min(W - cw - 8, cx - cw / 2))}px`;
    card.style.top = `${Math.max(8, Math.min(H - ch - 8, cy))}px`;
  };

  return {
    update(s, speed, blocked) {
      lastState = s;
      if (!enabled) { if (shown) hide(); return; }
      // Something bigger is on screen: step aside without forgetting the step (no second hello when it's back).
      layer.classList.toggle('away', blocked);
      if (blocked) { document.body.classList.remove('coach-intro'); return; }
      if (shown?.intro) document.body.classList.add('coach-intro');
      const e = env(speed);
      const { step, done } = pickStep(s, e, mem);
      if (done.length) { for (const id of done) mem.seen.add(id); saveCoach(mem); }
      if (step !== shown) { if (step) show(step, s); else hide(); }
      if (shown) place(s);
    },
    replay() {
      mem.seen.clear(); mem.off = false; saveCoach(mem);
      enabled = true;
      hide();
      if (lastState) this.update(lastState, 0, false);
    },
    memory: () => mem,
    current: () => shown?.id ?? null,
  };
}
