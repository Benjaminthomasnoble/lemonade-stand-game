# Handoff: where the build stands

Snapshot as of 2026-11-14. Every lane is on main (stand HP and land, nights, combat, demand, the world and VIPs, crew, rivals, story), and so is the integration pass that tied them together. Read this first, then `docs/spec/`.

## The spec

| File | What it is |
| --- | --- |
| `docs/spec/design-spec.md` | The full design spec (exported from the Claude Doc, the source of truth). Six embedded diagrams/charts are placeholders in this export; their data is in the other files. |
| `docs/spec/canon.md` | Design canon: every rule and starting value the build follows. Newest review changes land here first. |
| `docs/spec/balance-tables.md` | Tuned numbers (costs, ranks, rivals, land, VIP, guards). Mirrors Appendix A of the spec. |
| `docs/spec/pacing.csv` | Economy-model run: 170 days per difficulty, used to check ranks and story beats. Its targets are under review (What's left, 2). |
| `docs/spec/ui-plan.md` | The HUD plan: show it on the stand, not in the panel. Presentation only. |
| `docs/spec/music-notes.md` | Music brief and notes for the files in `public/audio/`. |

Where the spec and the code disagree, the spec wins.

**Design calls:** the spec's appendix "Design calls settled on 2026-11-14" lists each call made for Ben (the rule now, and what the docs said before) and the calls still open for him; don't "fix" a settled call back to older text. One kept call to know: Maple Row's table tolerance of 1.0 sets its price ceiling, though its crowd can't blend that high (`src/sim/demand.test.ts` skips it).

## Built

Each line names the main files (`src/sim/` unless a path says otherwise). Rank gates and lesson days are in `balance.ts`.

- **A day at the stand:** Lottie's Corner, the Morning Bugle (forecast, market prices), lemons, sugar and ice with spoilage and storage, 10 recipe cards and the recipe page book, Sweetness, customer segments, price fit and "why people walked past", the Ledger, Reputation, Auto-Restock (Day 2) and Auto-Price (Rank 3). `economy.ts`, `demand.ts`, `recipes.ts`, `weather.ts`, `ledger.ts`, `automation.ts`.
- **Day calls:** once or twice a business day a small decision breaks in (undercut, heckler, rush, permit, rumor), each choice with a cost. The UI holds the clock while one waits; with no player it lapses and changes nothing. `calls.ts`.
- **Score and ranks:** Success Score, Ranks 1–10 (never drop) with the striped "invested" sliver, Lottie's Goals, Lottie's Tips perks at each rank-up, and a local Peak Success Score leaderboard. `score.ts`, `goals.ts`, `perks.ts`, `src/save.ts`.
- **Lessons and Lottie's tour:** `LESSON_DAY` sets the days: the Market Day 2 (Lottie stocks Day 1 only), Threat and the fence Day 3, Dex Day 4, the upgrade and Rank Day 5, the sign Day 6, land Day 7. The tour points at each thing to tap and waits for it; seen steps stay on the device (`lemonade-stand-wars/coach/v1`), Options replays it, a pinned `?seed=` leaves it off unless the URL adds `coach=1`. Add a step to `STEPS` with a selector; keep each line to about eight words. `src/ui/coach.ts`, `src/coach.css`.
- **Modes and winning:** Story Campaign, Sandbox (Small, Medium or Large maps cut from the bay, picked rivals, Domination, Economic or no win condition, Peaceful) and Endless Summer; Laid Back, Classic, Cutthroat and Custom sliders; Ironman. In the Red and the Cookie Jar, Run Out of Town, Marisol's loans, the endings and "Keep squeezing", and the bay turning lemon yellow at Domination. `modes.ts`, `victory.ts`, `map.ts` (`cutMap`), `src/ui/sandbox.ts`, `custom.ts`, `ending.ts`, `bank.ts`, `src/world/lemonWave.ts`.
- **Saves:** 3 rotating dawn autosaves and 3 manual slots; Ironman keeps one save; a lost run can reload the last dawn unless it's Ironman. `legacy.ts` steps v1–v6 saves up to v7 and `migrateSave` (economy.ts) carries them on. `src/save.ts`, `src/ui/saves.ts`.
- **Time and nights:** real-time nights with the alert feed, raid warnings by difficulty, auto-pause switches, pause anywhere, full-screen menus, remappable keys and captions. Sleep skips a night with nothing coming (`nothingTonight`); a raid night runs at `QUIET_NIGHT_SPEED` 12 until its warning. `night.ts`, `alerts.ts`, `src/settings.ts`, `src/ui/options.ts`, `menus.ts`, `keys.ts`.
- **Stands and marketing:** L1–L5 stands and brand tiers, the Sandwich-Board Kid, Free Sample Day, the Sunny and Coupon Blitz campaigns, specializations, and Billboards (Rank 7). `marketing.ts`, `specializations.ts`.
- **Damage and repairs:** stand and building HP, Damaged stands pour at their HP share, Busted and Wrecked, 15% rebuilds, overnight repairs, Auto-Repair (Rank 3; it keeps a reserve for wages and the loan), storms, the Hurricane (Rank 7) and the Health Inspection (Rank 2). `damage.ts`.
- **Land and control:** Citrine Bay's 8 districts, 116 plots and 11 borders; control tiers (Foothold, Majority, Stronghold, Full Control) and district perks; For Sale with First Dibs, sealed-bid auctions, Fire Sales and selling plots; the Lavender lot; Warehouses (Rank 4); bulk actions (Rank 3) and district policies (Rank 7); the Land Registry. `map.ts`, `land.ts`, `auction.ts`, `warehouse.ts`, `policies.ts`, `src/ui/registry.ts`.
- **Rivals:** 5 factions with home turf, Grow, Guard and Strike spending, rival-vs-rival raids, Strike schemes (price wars, smear posters, ad blitzes, auction snipes, Cease-and-Desist, fines and freezes), phone taunts from Day 1, the Rivals Corkboard, and Endless Summer's Out-of-Towner, Snootwater Springs. `rivalAi.ts`, `schemes.ts`, `phone.ts`, `src/ui/corkboard.ts`.
- **Sit-downs and endgame:** Truces, Plot and Faction Buyouts (Vera never sells), haggling, Weakened rivals, HQ assaults in three stages (Gate, Yard, Boss Room with each boss's move) from each HQ's rank (Blend Shack 5, Grindhouse 6, Hollis Homestead 7, FizzCo Tower 8, Sourwood Manor 9), Fire Sales, Trophies and boss exits. `rivals.ts`, `exits.ts`, `src/ui/sitdown.ts`.
- **Defenses, crew and combat:** P1–P5 fences and gadgets; guards with fists, clubs and hatchets, gear, traits, levels and wages; Lookouts, Wreckers and Captains; Clubhouses; Threat 1–5; live fights with Rally, Fall Back and Ring the Bell; Dex's Auto-Defend (Rank 4); captives. `crew.ts`, `threat.ts`, `combat.ts`, `fight.ts`, `reinforce.ts`, `autodefend.ts`, `clubhouse.ts`, `captives.ts`.
- **Raids on you:** none on Nights 1–2 (`NO_RAID_DAYS`). The first comes on Night 3 (`TUTORIAL_RAID_DAY`, crew.ts): any fence or guard bounces it, and it robs an undefended stand. After that a weekly rate by Threat and difficulty, with at least one raid once `MAX_QUIET_NIGHTS` pass without one. An answered rumor sends that gang to that plot. `threat.ts` (`raidsOnYou`).
- **Your raids:** Smash, Shakedown and Sabotage from the Raid Planner (Rank 3), and HQ Assaults from each HQ's rank, with win odds, scouting and Gull Flight, unscouted ranges, raid templates (Rank 6) and Citations (Election Day each Spring can change the rules). `scouting.ts`, `templates.ts`, `citations.ts`, `src/ui/raidPlanner.ts`, `src/ui/gull.ts`.
- **VIP clients:** Local Orders, Caterer Trucks (loading at a Warehouse), Bottling Works, Helipads ($30 a bottle), Piers ($40), Supply Deals and Mega Contracts, Lemon Groves, the Order Book, chopper and ship scenes, and Delivery Raids from Threat 3 (one roll per pickup trip). `vip.ts`, `warehouse.ts`, `src/ui/orders.ts`.
- **Story:** five acts, scenes and beats (the Steward on Day 3, Dex, Benny, Skip Larkin, the first chopper and ship in Act 4), boss calls and the boss board, the Act 5 siege, the Syndicate and Call the Big Squeeze, the endings and epilogue, the grandkid, and cameos in Endless. `story.ts`, `scenes.ts`, `beats.ts`, `squeeze.ts`, `syndicate.ts`, `cameos.ts`, `grandkid.ts`, `src/ui/story.ts`.
- **The living town:** the calendar and seasons, Taste-Offs, festivals and the County Fair, sponsorships, random events (Heat Wave, Tourist Bus, Celebrity Sighting, Food Critic, Captain Squawk, Kids' Lemonade Day and more), the Bugle front page and 101.5 The Squeeze. `calendar.ts`, `events.ts`, `happenings.ts`, `media.ts`, `radio.ts`, `src/ui/bugle.ts`, `src/ui/radio.ts`.
- **Presentation:** the three.js bay in Kitchen-Table Clay (`src/world/`; the kit and its rules are in `src/world/clay/README.md`), the HUD (`src/ui/`, plan in `docs/spec/ui-plan.md`), and audio (`src/audio.ts`: Lottie's Theme, four stingers, the raid countdown's woodblock ticks, the ship horn, one mute button, and Calm Audio).

## Not built yet (from the spec)

- **The rest of the music (Version 1):** day, night and raid scores, Lottie's Theme gaining a layer at each rank, the faction leitmotifs and the Syndicate medley, the Threat tension layers, and the six mix sliders. See Audio below.
- **Stretch:** Huge generated maps, more Out-of-Towners in Endless, Challenges, online leaderboards, async "rival empire" multiplayer, bosses as advisors, Franchise prestige, photo mode, mod support.

Cut by the spec (don't build): property tax, insurance, Depot, Ice House, Threat's +1 for leading, Cutthroat's ×0.9/×1.1 traffic and costs.

## What's left

### 1. Art and UI

**3D world** (`src/world/`, the art threads):

- Fighters who join mid-fight (Ring the Bell reserves, late rival help, Vera's Stewards) get no figure: add joins to the report (fight.ts) and spawn a unit when an `at` event names an unknown id (battle.ts).
- Boss Room moves aren't staged: Hay Bale Wall's bales, Hostile Takeover's turned guards (flip side and tint), Brock's charge (drawn as a peel slip), Old Money's Stewards (battle.ts `handle`).
- Sunny doesn't walk his district while his campaign runs (`districtCampaign`, marketing.ts; the `mascot` model, clay/stands.ts).
- The lights hold at 21:30 all night, then snap to dawn: `hourOf` (lighting.ts) should follow the night's minutes so the 06:00 blend plays.
- Raid arrows: none for your own raids; rival arrows start at the HQ instead of `raidStart` and roll over a fixed 12 s instead of the raid's ETA (markers.ts).
- Rival schemes aren't drawn: Cold Brew's posters, Hollis's hay-bale barricades, FizzCo's blitz mascot (read `runningSchemes` and `hayBales`).
- The night flight is captions only: stage Captain Squawk over your stand at 03:00, keyed off scene id `nightFlight`.
- The Epilogue's L1 crayon sign still reads LEMONADE: use `opts.sign` on the player's L1 sign (clay/stands.ts).
- The 3D stand knows 3 recipes: take the 10 colours from `src/ui/recipes.ts`, add garnishes, and build the chalk menu from the owned cards (clay/standKit.ts, standProps.ts).
- Kids' Lemonade Day stands are invisible: a small table with a kid and a 50-cent sign on each kid plot (happenings.ts places them).
- Captain Squawk's theft shows no gull at the robbed stand: send the ambient gull's dive there (ambient.ts).
- No radio prop on L3+ stands, though 101.5 plays from them.
- Snootwater Springs has a stand-in look (Brock's crew recoloured in clay/cast.ts, a "bubbles" stand dress, no top prop or boss figure); it needs its own clay look and Sterling's phone portrait.
- Delete the unreachable fallback scene schedule in `src/world/scenes.ts` (the `hooks.driven` branch, `seen`/`markSeen` and the `driven` hook): main.ts always passes `driven: true`.

**HUD restyle** (`src/ui/` and `src/screens.css`, the clay UI thread), still open:

- The "bought" thought bubble is a heart; the spec says a cup (emotes.ts).
- The Land Registry has no deeds look: `.cl-registry` has no style.
- A 12× raid night lights no speed knob: show a lit fast-forward with a small "12×" while `shownSpeed()` is 12 (hud.ts).
- The coach's Day 1 intro hides the goal card (`body.coach-intro #ui .cl-sticky` in coach.css); keep the card on screen, phones too, with a test.
- Lottie's Tips is a plain ticket at the top of the feed: make it a three-card fan at rank-up, and keep raid and VIP cards above it (perks.ts).
- The Tourist Bus card offers Go there and Restock, not "Pour Strawberry, price high" (events.ts `acts`; events.test.ts pins it).
- The raid warning card could mark a rumored raid: `Raid.rumor` and `Raid.due` (the quiet-night cap's raid) aren't read yet.
- `.cl-toggle` has no `:disabled` style, so a Fortify plot's locked Auto-Repair switch still shows a pointer.
- The countdown ticks have no visual twin: a faint edge beat in the raid's red beside `PULSE` in twins.ts, skipped under Calm Audio and reduced motion (seam: `audio.tick()` in main.ts's frame loop).

**HUD restyle, keep through the restyle** (added by the fix waves; keep their test ids):

- Day's end: "Raiders on the way tonight" (`raiders-tonight`) with one fix button (`raiders-fix`) for the plot tonight's raid heads for (trips.ts).
- Evening: a repair ticket for a sprung Slick on a plot Auto-Repair skips, and "Auto-Repair kept $X for wages and the loan" (evening.ts).
- Morning Prep's Auto-Repair ticket (`auto-repair`) reads "+$X at closing" (damage.ts).
- Options: "Fast raid nights (12×)" (`opt-quietNights`), Calm Audio (`opt-calmAudio`, on in Laid Back), raid-pause tips saying the last minutes run at fight speed (New Game too), the full-screen menus tip naming the Pause key, and the Delivery Raids pause tip.
- Tooltips on the turn, speed and Gull Flight buttons show the player's current keys (keys.ts `withKey`).
- Defend sheet (crew.ts): fence and sprung-Slick tips ("repair overnight" or "Auto-Repair skips this plot", never on a Fortify plot) and "Re-lay $25" (`reset-slick`).
- The Auto-Repair switch on a Fortify plot: pressed, disabled, "Fortify keeps this on" (damage.ts).
- Raid Planner: scouted, the intel row shows the plot as it stands now and a sprung Slick as a plain slot; unscouted, the dial reads `Not scouted: X-Y% to win` and `raid-odds-range` shows one figure when its ends meet; odds refresh on a rank-up or Elbow Grease.
- Fight bar: Nerve readouts (`fight-nerve-att`, `fight-nerve-def`) and "Next: <plot>" (`fight-next`); a defensive Fall Back reads as a loss in the tickets, stinger, Lottie's line and the 3D cheer.
- Hiring Hall plot card: "Hire" (`open-hiring-hall`) from Rank 2 after the crew lesson.
- Price war: a "Coupon Blitz" button on the ticket (schemes.ts) and an alert card naming that answer.
- Celebrity Sighting: "Send Sunny" at Morning Prep (events.ts `sendSunny`).
- Feed cards: a skipped scene's recap, Lottie's first-winter sleet line, Dex's Day 15 Clubhouse push, the night-flight fallback line, and Juni's tip before later FizzCo Delivery Raids.
- Feed: no plain `event` ticket for a Hurricane or an inspection (`eventFeed`); the Hurricane note ends "repairs never cost more than a 15% rebuild".
- Delivery Raid warnings: one per pickup trip, every trip in the Act 5 Harbor Fest while the Syndicate stands, and they can point at a Warehouse.
- Order Book: the Caterer Truck card's Warehouse lines and its Delivery Raid flag from Threat 3.
- Readouts: HP tooltips (`hp`, `stand-hp`) and the upgrade card count the Express Window, a badly Damaged stand reads "pours 1 of N", and the Ledger's Other row (`row-other`) names what booked it.
- Top bar: sour Threat lemons from Day 3 (meters.ts `threatLemons`), none in a Peaceful run.
- Coach: the Market's first-morning steps `d2-lemons`, `d2-sugar`, `d2-ice` and `d2-auto`.
- Goal card: the second stand (or Net Worth) on Days 1–4, the Wooden Stand from Day 5, Dex's Clubhouse goal before the Act 2 payback goals.
- Scenes: Morning Prep plays them in priority order; Mayor Fontaine's "freeze" scene on the first paid land freeze; the Strawberry and Lavender page scenes run 5 lines.
- Land Registry: the campaign's Lavender lot auction shows from Act 5.
- Bugle and 101.5: scheme leads (PRICE WAR!, AD BLITZ!, SMEAR POSTERS!), briefs without "Bugle:", yesterday's caller first, GUARDS FALL BACK and Cal's fall-back call, rival new-stand lines, Hurricane look-ahead lines, the Food Critic's pan line and the repossession line.
- The rumor call card names only a gang that may come, and that gang comes to that plot.
- hud.ts exports `ownStandActions` (the plot card's actions on your own stand).

**Audio** (`src/audio.ts`, the music thread):

- The adaptive score: day, night and raid music, Lottie's Theme layers by rank, and the Syndicate medley. Done (synthesized in `src/audio.ts`, cued by `audioCues` in main.ts): short faction leitmotifs (Snootwater's too) on boss phone calls, rival jingles on 101.5 and Snootwater's arrival; a retired jingle's second of dead air; still to do: motifs under raids, at HQs and in exit scenes.
- Threat tension layers: done (`audio.threat(level)`: T3 drone, T4 pizzicato, T5 cane tap; Calm Audio and mute silence them).
- The six mix sliders (Music, Radio, Voice, Effects, Alerts, Ambience) and their ducking; today there's one mute button.
- The Regatta horn: done; `audio.horn()` also plays when the first ship docks (`state.story.vip.docked`, watched by `audioCues`).

### 2. The pacing decision (pending)

The pacing targets are under review. The pacing lane's full sweep (`nice -n 19 npm run sim -- pacing 170 10 all --jobs 2 --keep runs/`) is running and reports to `/mnt/project-files/gameplay-build/integration/pacing-sweep.txt`. Until Ben decides, don't retune the economy or restate `pacing.csv` and the spec's pacing tables. The first L2 and Rank 2 targets are settled at Day 5 (range 5–6, `tools/pacing.ts`).

### 3. Fix-wave leftovers still open

- `tools/raid-campaign.ts` `SPEC` still holds 46–79 / 75–124 / 115–148 campaign raids; align it once balance-tables restates the campaign raid totals.
- `src/sim/beats.test.ts:339`: the describe still says "Week 2" for Skip Larkin's corner, which plays at the Day 7 to Day 8 dawn.
- Pacing lane: the first chopper and ship now wait for Act 4, and the campaign's Lavender auction opens on Act 5's first morning; check `VIP_FIRSTS` (heli Day 72, 63–80) and the `LAVENDER_LOT` bids in `tools/pacing.ts` against the sweep.
- Overnight fence and Slick repairs (`overnightRepairs`, crew.ts) still pay without Auto-Repair's wage and loan reserve (`autoRepairReserve`, damage.ts).
- `src/sim/walkthrough.test.ts:483`, the Threat 1 anchor, is still `it.fails` until canon states the measured figure (Current numbers).
- Ben's open calls (don't change these rules): (a) whether answered-rumor raid nights count against the week's raid rate (today a rumor adds a raid only on a night the count gave none); (b) whether early Threat 1 Shakedowns need softening, or the 0.8-day raid-loss line and `RAID_LOSS.worst` 0.6 (tools/pacing.ts) get restated; (c) the first Clubhouse on Days 15–19: the sim bot has $1,955–$2,092 at those dawns against the $2,306 it needs (Side Lot $306 plus `CLUBHOUSE[0].cost` $2,000; `npm run sim -- 20` prints the check); (d) the pacing economy and the late-game stand mix; (e) whether overnight repairs keep that reserve too.

## Current numbers

Measured on main on 2026-11-14 with `npm run combat` and `npm run sim -- 14`. Re-check them after any combat or economy change.

HQ assaults (`HQS` in `src/sim/rivals.ts`: `tier` sets henchman strength, `yard` the Yard's size) are tuned so the spec's model squads usually win at the guard levels they'd have by then. The assault is fought at Morning Prep, a night fight where Night Owls hit 25% harder. Over 40 seeds:

| HQ | Model squad | Win rate |
| --- | --- | --- |
| Blend Shack | 5 L2 guards with clubs | 83% |
| Grindhouse | 8 L2 with clubs and vests | 80% |
| Hollis Homestead | 8 L3 with hatchets and vests | 83% |
| FizzCo Tower | 12 L4 with hatchets and Pro Gear | 98% |
| Sourwood Manor | 12 L4 with hatchets and Pro Gear | 33% |
| Sourwood Manor | 12 L5 with hatchets and Pro Gear | 85% |
| Sourwood Manor after 7 good siege nights (Gate 1,500, Yard 3) | 12 L4 with hatchets and Pro Gear | 100% |

Fight anchors: a Threat 1 raid of 3 fists wins 100% of the time against an undefended L1, and fails 78% of the time against a Picket Fence and one fists guard (92% for real Threat 1 parties of 2–3). Against a kitted L5 plot (5 L1 hatchet guards in Pro Gear, goose, Slick and sprinkler), the defense holds 80% of Threat 4 raids on P4 and 100% on P5. Weapons: 5 hatchets breach 2,500 HP in 18 s and 5 clubs in 73.5 s; 12 clubs leave a 5,000 HP Citrus Palace at 200 HP after 60 s, and 12 hatchets smash it in 15 s.

The 14-day run: Day 14 ends with $1,886.01 and a Success Score of 2,269. Rank 2 (Corner Hustler) comes on Day 9, with Lottie's Tip at the next dawn. Raids hit on Nights 3, 6, 7, 10 and 13, each taking $148–$255 from the till.

## Working rules

- Push straight to `main`; every push deploys to GitHub Pages (`.github/workflows/deploy.yml`). Live: https://benjaminthomasnoble.github.io/lemonade-stand-game/. Other agents push too, so `git fetch origin main && git rebase origin/main` first.
- Before pushing: `npx tsc --noEmit`, `npm test`, `npm run build`, then `npm run smoke` (starts a preview server and plays through in headless Chromium; screenshots land in `test-results/`). `npm run sim -- 14` and `npm run combat` print balance checks.
- Saves: `SAVE_VERSION` stays 8 (`src/sim/economy.ts`). A new saved field is optional, and the owning lane's idempotent `migrate<Lane>(s)` fills it; `migrateSave` calls each one on every load. Don't bump `SAVE_VERSION`.
- The sim (`src/sim/`) is pure and seeded: every random draw goes through `{ seed: s.seed }` and writes the seed back. No DOM, three.js, `Date` or `Math.random`, so it runs in Node and tests.
- Tunable numbers live in `src/sim/balance.ts`, `src/sim/vip.ts` (facilities, orders) and `src/sim/rivals.ts` (HQs, buyouts, truces); keep them in step with `docs/spec/balance-tables.md`.
- The stakes rules (Ben's playtest, 2026-11-08): Lottie stocks Day 1 only, the first raid comes on Night 3, and `MAX_QUIET_NIGHTS` caps raid-free nights after it. No free stock or raid-free weeks without Ben's say. A new daytime decision is a new `CallKind` in `src/sim/calls.ts`.
- `src/world/` belongs to the art threads: list what the world should show under What's left rather than drawing it.
- Content guardrails (spec): no guns, explosives, fire, blood or deaths; E10+ cartoon violence; no real brands or people. The story stays simple and fun.
- Owl World (Ben's other game) is a source of code techniques only, never its world or layout.
