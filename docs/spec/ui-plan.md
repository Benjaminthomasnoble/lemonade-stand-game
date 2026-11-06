# UI plan: show it on the stand, not in the panel

Adopted 2026-11-06, alongside the Kitchen-Table Clay art direction. The rules and screen layouts live in `design-spec.md` under Player experience → "Show, don't tell" and "Top bar and alerts". Wireframes for every screen, before and after: https://claude.ai/artifact/GFc6DvNa5aVmi2Jt1ffSjC

No game rules change. This is presentation only: `src/ui/` plus hooks into `src/world/` for the things that move into the world.

## Every panel

| Panel | Words before | After | Main change |
| --- | --- | --- | --- |
| Top bar | 8 chips | 4 chips | Cash, rank meter, day, weather. Reputation goes to the stand sign; Threat shows only at 2+. |
| Lottie's Goals | ~30 | ~4 | One goal pill with a bar; tap for the others. |
| Today panel | ~130 | ~3 | A bottom dock: pitchers, chalkboard price, three gauges, Open. |
| Bugle | ~35 | ~8 | A headline banner at dawn. Forecast becomes the weather chip. |
| Selling bar | ~12 | 1 number | Thought bubbles over walkers; a cup counter. |
| Ledger | ~70 | ~15 | Profit, sold, turned away, one tip, Sleep. Table behind "See the books". |
| Raid warning | ~30 | ~8 | Their fighters against your guards and fence, as icons, one fix button. |
| Stand & marketing → Grow | ~150 | ~20 | Picture cards with three growth bars; long-press for numbers. |
| Marisol's bank | ~40 | 0 until needed | "Borrow" appears when cash runs short. |
| Defense & crew → Defend | ~180 | ~20 | Faces with level pips and a weapon icon; only unlocked gadgets. |
| Plot card | ~45 | ~6 | Name, owner colour, one action. Details on hover. |
| Raid planner and HQ | ~60 | ~12 | Faces plus "Take all", an odds dial with words, Tonight or Now. |
| New game | ~110 | ~10 | Three mode cards, three difficulty buttons, "More options". |

## In the world (built with `src/world/`)

- Stock as crate, sugar jar and ice tray on the stand, filling and emptying through the day; lemons brown when they will spoil.
- Price on a chalkboard sign; recipe as the pitcher colour; Reputation stars on the stand sign.
- Thought bubbles over walkers for each sale or walk-past reason.
- Raid warnings as rival silhouettes or footprints by the fence at dusk.
- Guards at their posts, installed gadgets visible, fence damage as broken pickets.
