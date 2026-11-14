# Handoff: where the build stands

Snapshot as of 2026-11-14. Every lane is on main (stand HP and land, nights, combat, demand, the world and VIPs, crew, rivals, story), and so is the integration pass that tied them together. Read this first, then `docs/spec/`.

## The spec

| File | What it is |
| --- | --- |
| `docs/spec/design-spec.md` | The full design spec (exported from the Claude Doc, the source of truth). Six embedded diagrams/charts are placeholders in this export; their data is in the other files. |
| `docs/spec/canon.md` | Design canon: every rule and starting value the build follows. Newest review changes land here first. |
| `docs/spec/balance-tables.md` | Tuned numbers (costs, ranks, rivals, land, VIP, guards), checked against main. Appendix A of the spec is an older copy: where they differ, balance-tables holds the number. |
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
- **Modes and winning:** Story Campaign, Sandbox (Small, Medium or Large maps cut from the bay, picked rivals, Domination, Economic or no win condition, Peaceful) and Endless Summer; Laid Back, Classic, Cutthroat and Custom sliders; Ironman. In the Red and the Cookie Jar, Run Out of Town, Marisol's loans, the endings and "Keep squeezing", and the bay turning lemon yellow at Domination. `modes.ts`, `victory.ts`, `map.ts` (`cutMap`), `src/ui/sandbox.ts`, `src/ui/custom.ts`, `src/ui/ending.ts`, `src/ui/bank.ts`, `src/world/lemonWave.ts`.
- **Saves:** 3 rotating dawn autosaves and 3 manual slots; Ironman keeps one save; a lost run can reload the last dawn unless it's Ironman. `legacy.ts` steps v1–v6 saves up to v7 and `migrateSave` (economy.ts) carries them on. `src/save.ts`, `src/ui/saves.ts`.
- **Time and nights:** real-time nights with the alert feed, raid warnings by difficulty, auto-pause switches, pause anywhere, full-screen menus, remappable keys and captions. Sleep skips a night with nothing coming (`nothingTonight`); a raid night runs at `QUIET_NIGHT_SPEED` 12 until its warning. `night.ts`, `alerts.ts`, `src/settings.ts`, `src/ui/options.ts`, `src/ui/menus.ts`, `src/ui/keys.ts`.
- **Stands and marketing:** L1–L5 stands and brand tiers, the Sandwich-Board Kid, Free Sample Day, the Sunny and Coupon Blitz campaigns, specializations, and Billboards (Rank 7). `marketing.ts`, `specializations.ts`.
- **Damage and repairs:** stand and building HP, Damaged stands pour at their HP share, Busted and Wrecked, 15% rebuilds, overnight repairs, Auto-Repair (Rank 3; it keeps a reserve for wages and the loan), storms, the Hurricane (Rank 7) and the Health Inspection (Rank 2). `damage.ts`.
- **Land and control:** Citrine Bay's 8 districts, 116 plots and 11 borders; control tiers (Foothold, Majority, Stronghold, Full Control) and district perks; For Sale with First Dibs, sealed-bid auctions, Fire Sales and selling plots; the Lavender lot; Warehouses (Rank 4); bulk actions (Rank 3) and district policies (Rank 7); the Land Registry. `map.ts`, `land.ts`, `auction.ts`, `warehouse.ts`, `policies.ts`, `src/ui/registry.ts`.
- **Rivals:** 5 factions with home turf, Grow, Guard and Strike spending, rival-vs-rival raids, Strike schemes (price wars, smear posters, ad blitzes, auction snipes, Cease-and-Desist, fines and freezes), phone taunts from Day 1, the Rivals Corkboard, and Endless Summer's Out-of-Towner, Snootwater Springs. `rivalAi.ts`, `schemes.ts`, `phone.ts`, `src/ui/corkboard.ts`.
- **Sit-downs and endgame:** Truces, Plot and Faction Buyouts (Vera never sells), haggling, Weakened rivals, HQ assaults in three stages (Gate, Yard, Boss Room with each boss's move) from each HQ's rank (Blend Shack 5, Grindhouse 6, Hollis Homestead 7, FizzCo Tower 8, Sourwood Manor 9), Fire Sales, Trophies and boss exits. `rivals.ts`, `exits.ts`, `src/ui/sitdown.ts`.
- **Defenses, crew and combat:** P1–P5 fences and gadgets; guards with fists, clubs and hatchets, gear, traits, levels and wages; Lookouts, Wreckers and Captains; Clubhouses; Threat 1–5; live fights with Rally, Fall Back and Ring the Bell; Dex's Auto-Defend (Rank 4); captives. `crew.ts`, `threat.ts`, `combat.ts`, `fight.ts`, `reinforce.ts`, `autodefend.ts`, `clubhouse.ts`, `captives.ts`.
- **Raids on you:** none on Nights 1–2 (`NO_RAID_DAYS`). The first comes on Night 3 (`TUTORIAL_RAID_DAY`, crew.ts): any fence or guard bounces it unless your guards Fall Back, and it robs an undefended stand. After that a weekly rate by Threat and difficulty, with at least one raid once `MAX_QUIET_NIGHTS` pass without one. An answered rumor sends that gang to that plot. `threat.ts` (`raidsOnYou`).
- **Your raids:** Smash and Shakedown from the Raid Planner (Rank 3), Sabotage from Rank 4 (`SABOTAGE_RANK`, led by a Lookout or a Sneaky guard), and HQ Assaults from each HQ's rank, with win odds, scouting and Gull Flight, unscouted ranges, raid templates (Rank 6) and Citations (Election Day each Spring can change the rules). `scouting.ts`, `templates.ts`, `citations.ts`, `src/ui/raidPlanner.ts`, `src/ui/gull.ts`.
- **VIP clients:** Local Orders, Caterer Trucks (loading at a Warehouse), Bottling Works, Helipads ($30 a bottle), Piers ($40), Supply Deals and Mega Contracts, Lemon Groves, the Order Book, chopper and ship scenes, and Delivery Raids from Threat 3 (one roll per pickup trip). `vip.ts`, `warehouse.ts`, `src/ui/orders.ts`.
- **Story:** five acts, scenes and beats (the Steward on Day 3, Dex, Benny, Skip Larkin, the first chopper and ship in Act 4), boss calls and the boss board, the Act 5 siege, the Syndicate and Call the Big Squeeze, the endings and epilogue, the grandkid, and cameos in Endless. `story.ts`, `scenes.ts`, `beats.ts`, `squeeze.ts`, `syndicate.ts`, `cameos.ts`, `grandkid.ts`, `src/ui/story.ts`.
- **The living town:** the calendar and seasons, Taste-Offs, festivals and the County Fair, sponsorships, random events (Heat Wave, Tourist Bus, Celebrity Sighting, Food Critic, Captain Squawk, Kids' Lemonade Day and more), the Bugle front page and 101.5 The Squeeze. `calendar.ts`, `events.ts`, `happenings.ts`, `media.ts`, `radio.ts`, `src/ui/bugle.ts`, `src/ui/radio.ts`.
- **Presentation:** the three.js bay in Kitchen-Table Clay (`src/world/`; the kit and its rules are in `src/world/clay/README.md`), the HUD (`src/ui/`, plan in `docs/spec/ui-plan.md`), and audio (`src/audio.ts`: Lottie's Theme, four stingers, the raid countdown's woodblock ticks, Threat tension layers (`audio.threat`), short faction leitmotifs on boss calls and rival jingles (`audio.motif`), the ship horn, one mute button, and Calm Audio).

## Not built yet (from the spec)

- **The rest of the music (Version 1):** day, night and raid scores, Lottie's Theme gaining a layer at each rank, leitmotifs under raids, at HQs and in exit scenes, the Syndicate medley, and the six mix sliders. See Audio below.
- **Stretch:** Huge generated maps, more Out-of-Towners in Endless, Challenges, online leaderboards, async "rival empire" multiplayer, bosses as advisors, Franchise prestige, photo mode, mod support.

Cut by the spec (don't build): property tax, insurance, Depot, Ice House, Threat's +1 for leading, Cutthroat's ×0.9/×1.1 traffic and costs.

## What's left

### 1. Art and UI

**3D world** (`src/world/`, the art threads):

- Snootwater Springs' stand has no topper or family props: `topper` and `familyProps` in clay/rivalStands.ts have no `snootwater` case, so it shows only its "bubbles" dress (clay/standKit.ts `DRESS`). Its crew look, Sterling's figure and his portrait are done.

**HUD restyle** (`src/ui/` and `src/screens.css`, the clay UI thread), still open:

- The coach's Day 1 intro hides the goal card (`body.coach-intro #ui .cl-sticky` in coach.css); keep the card on screen, phones too, with a test.
- The Tourist Bus card offers Go there and Restock, not "Pour Strawberry, price high" (events.ts `acts`; events.test.ts pins it).
- The raid warning card could mark a rumored raid: `Raid.rumor` and `Raid.due` (the quiet-night cap's raid) aren't read yet.
- Borrowing: the spec says "a Borrow button appears where you're short" (design-spec.md, Tabs), but the HUD offers Borrow only at $60 or less (`SHORT_CASH` in src/ui/bank.ts, and the Grow sheet card in hud.ts) or for In the Red's exact shortfall (hud.ts), so a player can't borrow toward a buy the way the pacing bot does. UI thread, or Ben's call.

**HUD restyle, keep through the restyle** (added by the fix waves; keep their test ids):

- Day's end: "Raiders on the way tonight" (`raiders-tonight`) with one fix button (`raiders-fix`) for the plot tonight's raid heads for (trips.ts).
- Evening: a repair ticket for a sprung Slick on a plot Auto-Repair skips, and "Auto-Repair kept $X for wages and the loan" (evening.ts).
- Morning Prep's Auto-Repair ticket (`auto-repair`) reads "+$X at closing" (damage.ts).
- Options: "Fast raid nights (12×)" (`opt-quietNights`), Calm Audio (`opt-calmAudio`, on in Laid Back), raid-pause tips saying the last minutes run at fight speed (New Game too), the full-screen menus tip naming the Pause key, and the Delivery Raids pause tip.
- Tooltips on the turn, speed and Gull Flight buttons show the player's current keys (keys.ts `withKey`).
- Defend sheet (crew.ts): fence and sprung-Slick tips ("repair overnight" or "Auto-Repair skips this plot", never on a Fortify plot) and "Re-lay $25" (`reset-slick`).
- A guard in the fight playing live stays put till it ends: his Crew tab post button, his face in another Clubhouse's room, and the plot card's + (`post-here`) and "All here" when the fight holds the guards they'd bring show disabled with "In the fight" (crew.ts `canPost`, clubhouse.ts `canWaitAt`).
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

- The adaptive score: day, night and raid music, Lottie's Theme layers by rank, the Syndicate medley, and leitmotifs under raids, at HQs and in exit scenes (`audioCues` in main.ts cues the built ones).
- The six mix sliders (Music, Radio, Voice, Effects, Alerts, Ambience) and their ducking; today there's one mute button.

### 2. The pacing decision (pending)

The pacing targets are under review. The pacing lane's full sweep (`nice -n 19 npm run sim -- pacing 170 10 all --jobs 2 --keep <runs folder>`, about 3 hours) finished on 2026-11-14; its report is `/mnt/project-files/gameplay-build/integration/pacing-sweep.txt`. It played origin/main 9e57e5e, before 420da54 (an Act 3 chopper or ship offer stays as it came at Act 4), e579b20 (the Lavender auction opens on Act 5's first morning) and the pacing bot's newer play (5ad8377, 0bc4c8d; What's left, 3), so re-sweep current main before quoting its numbers. On it, Classic's reference map passed 21 of 42 checks and the ten Classic maps passed 1 of 13 (Rank 9 median Day 117 against 123–138; the worst raid after Day 6 cost 0.83 days against 0.6). Until Ben decides, don't retune the economy or restate `pacing.csv` and the spec's pacing tables. The first L2 and Rank 2 targets are settled at Day 5, range 5–6 (`tools/pacing.ts`; Rank 2 on every difficulty).

### 3. Fix-wave leftovers still open

- Pacing lane: the first chopper and ship now wait for Act 4, and the campaign's Lavender auction opens on Act 5's first morning; check `VIP_FIRSTS` (heli Day 72, 63–80) and the `LAVENDER_LOT` bids in `tools/pacing.ts` against a sweep of current main (the 9e57e5e sweep has the Act 4 chopper but not 420da54 or e579b20).
- Pacing bot: in the 9e57e5e sweep it never reached a Faction Buyout haggle (firm 0 on all 30 maps), and it never promoted guards, bought gadgets or turned on Dex's Auto-Defend. Main's bot now promotes its Level 3 guards, fills gadget slots, switches Auto-Defend on from Rank 4 (Dex rings the bell) and sits down with Juni and Preston in the Evening too (5ad8377, 0bc4c8d), so the sweep's raid losses and late game are an older bot's: re-sweep before reading them as a player's. A 170-day run of main 0bc4c8d on maps 42–44 (`npm run sim -- pacing 170 3 classic`) haggled on maps 42 and 43 (firm 2 each), but there it built no Bottling Works, Pad or Helipad and loaded no chopper (VIP share 0%; the sweep loaded them on Days 70 and 78). Check the bot's VIP spending before the re-sweep.
- Overnight fence and Slick repairs (`overnightRepairs`, crew.ts) still pay without Auto-Repair's wage and loan reserve (`autoRepairReserve`, damage.ts).
- `tutorialNight` (src/sim/threat.ts) keeps an "or your first Kiosk" clause that never decides anything: no raid comes on Nights 1–2 (`NO_RAID_DAYS`), and from Night 3 the day test holds. Drop it in a code lane; no behaviour change.
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

Fight anchors: a Threat 1 raid of 3 fists wins 100% of the time against an undefended L1, and fails 78% of the time against a Picket Fence and one fists guard (92% for real Threat 1 parties of 2–3). Against a kitted L5 plot (5 L1 hatchet guards in Pro Gear, goose, Slick and sprinkler), the defense holds 80% of Threat 4 raids on P4 and 100% on P5. Weapons: 5 hatchets breach 2,500 HP of fence without a sting in 18 s and 5 clubs in 73.5 s (real Barbed Wire's sting knocks the clubs out first); 12 clubs leave a 5,000 HP Citrus Palace at 200 HP after 60 s, and 12 hatchets smash it in 15 s.

The 14-day run: Day 14 ends with $1,886.01 and a Success Score of 2,269. Rank 2 (Corner Hustler) comes on Day 9, with Lottie's Tip at the next dawn. Raids hit on Nights 3, 6, 7, 10 and 13, each taking $148–$255 from the till.

## Working rules

- Push straight to `main`; every push deploys to GitHub Pages (`.github/workflows/deploy.yml`). Live: https://benjaminthomasnoble.github.io/lemonade-stand-game/. Other agents push too, so `git fetch origin main && git rebase origin/main` first.
- Before pushing: `npx tsc --noEmit`, `npm test`, `npm run build`, then `npm run smoke` (starts a preview server and plays through in headless Chromium; screenshots land in `test-results/`). `npm run sim -- 14` and `npm run combat` print balance checks.
- Saves: `SAVE_VERSION` stays 8 (`src/sim/economy.ts`). A new saved field is optional, and the owning lane's idempotent `migrate<Lane>(s)` fills it; `migrateSave` calls each one on every load. Don't bump `SAVE_VERSION`.
- The sim (`src/sim/`) is pure and seeded: the game's draws go through `{ seed: s.seed }` and write the seed back. Side rolls that must not move it use their own seed and never write back: the day calls (calls.ts: the day's plan and a permit's luck), Lottie's Tips deal (perks.ts `dealDice`) and the Raid Planner's odds (crew.ts `oddsSeed`, from the plot id). No DOM, three.js, `Date` or `Math.random`, so it runs in Node and tests.
- Tunable numbers live mostly in `src/sim/balance.ts`, `src/sim/vip.ts` (facilities, orders) and `src/sim/rivals.ts` (HQs, buyouts, truces). Some sit beside their rule: `CALLS` in calls.ts, `TUTORIAL_RAID_DAY` in crew.ts, `CHOPPER_BOTTLES` in beats.ts, `DAWN_SLOTS` and `SAVE_SLOTS` in `src/save.ts`, and a few in goals.ts, demand.ts and map.ts. Wherever one lives, keep it in step with its row in `docs/spec/balance-tables.md`.
- The stakes rules (Ben's playtest, 2026-11-08): Lottie stocks Day 1 only, the first raid comes on Night 3, and `MAX_QUIET_NIGHTS` caps raid-free nights after it. No free stock or raid-free weeks without Ben's say. A new daytime decision is a new `CallKind` in `src/sim/calls.ts`.
- `src/world/` belongs to the art threads: list what the world should show under What's left rather than drawing it.
- Content guardrails (spec): no guns, explosives, fire, blood or deaths; E10+ cartoon violence; no real brands or people. The story stays simple and fun.
- Owl World (Ben's other game) is a source of code techniques only, never its world or layout.
