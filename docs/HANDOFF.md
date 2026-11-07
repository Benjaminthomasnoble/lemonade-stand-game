# Handoff: where the build stands

Snapshot as of 2026-11-06 (modes and winning added). Read this first, then `docs/spec/`.

## The spec

| File | What it is |
| --- | --- |
| `docs/spec/design-spec.md` | The full design spec (exported from the Claude Doc, the source of truth). Six embedded diagrams/charts are placeholders in this export; their data is in the other files. |
| `docs/spec/canon.md` | Design canon: every rule and starting value the build follows. Newest review changes land here first. |
| `docs/spec/balance-tables.md` | Tuned numbers (costs, ranks, rivals, land, VIP, guards). Mirrors Appendix A of the spec. |
| `docs/spec/pacing.csv` | Economy-model run: 170 days per difficulty, used to check ranks and story beats. |
| `docs/spec/music-notes.md` | Music brief and notes for the files in `public/audio/`. |

Where the spec and the code disagree, the spec wins. Tunable numbers live in `src/sim/balance.ts`, `src/sim/vip.ts` (facilities, orders) and `src/sim/rivals.ts` (HQs, buyouts, truces); keep them matching `balance-tables.md`.

**Economy re-tune (spec rev 205) is in the code.** HQ assaults are tuned so the spec's model squads usually win at the guard levels they'd have by then (`HQS` in `src/sim/rivals.ts`: `tier` sets henchman strength, `yard` the Yard's size). Measured over 40 seeds: Blend Shack, 5 L2 guards with clubs, 83%; Grindhouse, 8 L2 with clubs and vests, 75%; Hollis Homestead, 8 L3 with hatchets and vests, 85%; FizzCo Tower, 12 L4 with hatchets and Pro Gear, 95%; Sourwood Manor, 12 with hatchets and Pro Gear, 35% at L4 and 80% at L5. Re-check these after any combat change.

## Built

- **Economy loop:** Lottie's Corner, Morning Bugle (forecast, market prices), lemons/sugar/ice with spoilage and storage, 3 recipes (Classic, Pink, Mint), sweetness, customer segments, "why people walked past", Ledger, Reputation, Success Score, Ranks 1–10 (never drop), Lottie's Goals, Auto-Restock, saves (`SAVE_VERSION` 8; `migrateSave` carries v7 saves forward as a Classic campaign).
- **Modes and winning** (`src/sim/modes.ts`, numbers in `balance.ts` under "modes, difficulty"): a New Game screen (first visit, or "New game") picks Story Campaign / Sandbox: Turf War / Endless Summer, Laid Back / Classic / Cutthroat, Ironman, and for Sandbox the win condition (Domination, Economic with a rank-threshold target, none) and Peaceful. Difficulty sets raid frequency (×0.5/×1/×1.5), Threat −1 on Laid Back, Respect days (5/3/1), Busted-only on Laid Back (10% repair, never lapses), and the Cookie Jar (always / once per act / never; per season outside the campaign). In the Red counts dawns below $0: 3 days, then the Cookie Jar pays the shortfall plus a day of upkeep and wages, or the run is Squeezed Out. Run Out of Town: no stands and under $150 (never on Laid Back). Marisol's loans (up to 50% of non-cash Net Worth, 3% a week, 4 weekly dawns, two misses repossess the cheapest plot; Net Worth subtracts what's owed). Domination (all rivals out plus 51% of every district's purchasable plots) ends the campaign with the Beloved or Iron Pitcher ending, then "Keep squeezing" into Endless Summer. Peak Success Score goes on a local top-10 leaderboard (`save.ts`), and a lost run can reload the last dawn autosave unless it's Ironman. Sandbox opens the border rule at Rank 2. Acts follow `ACT_BY_RANK` until the story drives them.
- **Stands and marketing:** L1–L5, brand tiers, Sandwich-Board Kid (L1–L3), Free Sample Day.
- **Map:** Citrine Bay, 8 districts, 116 plots, 11 borders, Footholds, land prices by district and plot type, land appreciation with development, Day 3 $300 side lot with a table.
- **Rivals:** 5 factions with home turf, stand levels by district (+1 Prime/Landmark, +1 every 30 days up to their cap), Grow and Guard spending, rival-vs-rival raids, seeded helipads/piers on their Fields and Docks.
- **Defenses and crew:** P1–P5 fences, gadgets, guards (fists/clubs/hatchets, gear, traits, levels, wages, fees), Clubhouse, Threat 1–5, night raids with warnings (none Days 1–5; the first is a scripted Blenders bounce on the night your first Kiosk opens or the night of Day 15, whichever is first), player raids (Smash, Shakedown) with a Raid Planner (win odds, their rebuild chance), auto-battle and 3D replay.
- **Knock it down, buy it up:** smash stands and VIP facilities; 15% rebuilds; rival rebuild chance by personality −30 points per Smash in 7 days; For Sale with First Dibs; your own smashed plot lapses if not rebuilt by the next dawn but one.
- **Sit-downs and endgame:** Truce (7 days, tribute; breaking it costs a star, grudges, and a 14-day truce ban), Plot Buyout (2.5× home, 2× away), Faction Buyout (business only, 1.5×/1.8× cash plus buildings; Vera never sells), Weakened (40% of peak plots, 25% of your Net Worth, or 7 days outsold 2×), HQ assaults and Faction Buyouts opening at each rival's HQ rank (Blend Shack 5, Grindhouse 6, Hollis 7, FizzCo 8, Sourwood 9), HQ assaults in three stages (Gate, Yard, Boss Room with each boss move), elimination by HQ, buyout or 7 days bankrupt, Fire Sale (75%, 2 days of First Dibs), Trophies (Bottling Line, Family Silver and Hollis Orchards have effects).
- **VIP clients:** Local Orders, Caterer Trucks, Bottling Works (Industrial plots), Helipads (Fields, $30 a bottle), Piers (Docks, $40 a bottle), Supply Deals (Rank 8 with a Cargo Terminal: 200,000 bottles in 4 weekly loads of 50,000 at $30 ($1.5M a load); several can run at once, and the offer says whether free bottling covers it), offers about 1 per 3/5/7 days and never more than 10 days apart once the facility stands, Lemon Groves on Fields (+5% traffic at every stand, up to 2), pickups with chopper/ship scenes (pause only on a client's first visit), Delivery Raids at Threat 3+.
- **Presentation:** three.js (WebGL) scene of the bay, stands, pedestrians, fences, wreck looks, battle and VIP replays, HUD panels, Rank badge with the striped "invested" sliver, music theme and stingers.
- **Clay foundation:** the clay kit in `src/world/clay/` (one material with a thumbprint smudge map and a matte/gloss/card finish per vertex, Baker and shape helpers, `bakeGroup`, the `Figure` rig with cast, crews and gaits on twos, tilt-shift and warm vignette; see its README). Also the plinth on Lottie's blue-gingham table with resin water, a lemon, a teacup and the desk lamp (`diorama.ts`), the four lighting scripts by game hour (`lighting.ts`), and the detail levels (Bay View merges each district into one block and draws people as specks). Phones get blob shadows and no blur. Day light is warm like the mockup, shadows are lifted with lilac (indigo at night) instead of going grey, and the post adds a little saturation. Models not yet rebuilt in clay (stands, buildings, fences, people) still use their old shapes on clay materials.

## Not built yet (from the spec)

Roughly in the order the spec's Scope plan needs them:

1. **Modes and winning, the rest:** Sandbox map sizes (Small/Medium/Large) and picking rivals; Custom difficulty sliders; minimum raid warnings and Cutthroat's auto-pause (they need real-time nights, item 10); the Syndicate's Threat trigger (Threat 4 on Cutthroat outside the campaign); the Out-of-Towner in Endless (item 9); 3 rotating dawn autosaves plus manual slots; selling plots (a 24-hour sealed-bid auction, item 4); the bay painting itself yellow on Domination (rendering: `s.outcome.result === 'won'`).
2. **Story:** the 5 acts, Day 5 Steward incident, boss phone taunts and barks, Summer Fair taste-off, Act 5 siege and the Syndicate (all difficulties), Call the Big Squeeze, endings, boss exit scenes, County Fair (Fall week 1). The named townsfolk are built in clay but not yet placed: `makeTownsfolk('marisol' | 'skip' | 'benny' | 'budd' | 'fontaine')` plus `signaturePose` in `src/world/clay/cast.ts` (Marisol hugs her ledger, Benny's megaphone stays up, Budd holds his ticket book and a lemonade). Whoever builds their beats or buildings (the bank, Larkin Realty, 101.5 The Squeeze, the sheriff, City Hall) places them; build them at `heroDetail()` and pose them on twos.
3. **Damage model:** damaged stands sell at their HP share, overnight repairs at 15% × HP lost, Auto-Repair (Rank 3).
4. **Land and control:** district control tiers (Foothold → Majority → Stronghold → Full Control) and district perks, auctions (sealed bid after First Dibs and Fire Sales), Warehouses, Billboards. District perks should give +10% traffic.
5. **Rivals:** Strike schemes (price wars, smear posters, Cease-and-Desist, auction snipes), the remaining Trophy perks (Blender Bar needs Frozen recipes, Juni's Grapevine needs earlier warnings, Hollis Orchards works through `groveTraffic`), recovering their recipe page.
6. **Crew:** specialists (Lookouts, Wreckers), Sabotage objective, Dex's Auto-Defend, guard traits' Sit-down effects (Smooth Talker).
7. **Recipes:** the 7 stolen recipe pages (Strawberry, Frozen, Lavender, ...).
8. **Progression and automation:** Lottie's Tips perks on rank-up, bulk actions (Rank 3), Auto-Price (also sets recipe and Sweetness), other automation.
9. **Living town:** citations, events and festivals, the Bugle and 101.5 The Squeeze radio, Gull Flight, one Out-of-Towner in Endless (Snootwater Springs).
10. **Time:** quiet nights at 3× from close until an alert.
11. **Art and music polish:** the Kitchen-Table Clay pass is in progress, and its foundation is built (see Built). Still to come: stands, buildings and fences rebuilt with the kit (cardstock and popsicle-stick props, faction patterns pressed into clay, pressed-clay logos), Bay View tiles with owner patterns, string lights and neon at night, clay brawl clouds, weather and seasons, faction leitmotifs, Lottie's Theme layers by rank.

Cut by the spec (don't build): property tax, insurance, Depot, Ice House, Threat's +1 for leading, Cutthroat's ×0.9/×1.1 traffic and costs.

Spec conflicts settled in code: Laid Back's Busted repair is 10% (canon and the spec body) though Appendix A's difficulty table still says 15%; Wrecked rebuilds stay 15% (canon) against the table's 30%.

## Working rules

- Push straight to `main`; every push deploys to GitHub Pages (`.github/workflows/deploy.yml`). Live: https://benjaminthomasnoble.github.io/lemonade-stand-game/
- Before pushing: `npx tsc --noEmit`, `npm test`, `npm run build`, then `npm run smoke` (starts a preview server and plays through in headless Chromium; screenshots land in `test-results/`). `npm run sim -- 14` and `npm run combat` print balance checks.
- The sim (`src/sim/`) is pure and seeded: every random draw goes through `{ seed: s.seed }` and writes the seed back. Keep it free of DOM and three.js so it runs in Node and tests.
- Content guardrails (spec): no guns, explosives, fire, blood or deaths; E10+ cartoon violence; no real brands or people.
- Owl World (Ben's other game) is a source of code techniques only, never its world or layout.
- Bump `SAVE_VERSION` in `src/sim/economy.ts` when the saved state shape changes.
