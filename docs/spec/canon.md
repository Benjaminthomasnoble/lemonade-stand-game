# LEMONADE STAND WARS — Design Canon (single source of truth for all spec writers)

This file fixes every name, rule and starting number. Write your section FROM this file. Do not invent new factions, districts, ranks, currencies or meters. You may add detail, examples, edge cases, UI behavior, feel and flavor inside the rules. If a rule here seems broken, keep it and flag the problem in your return summary (do not silently change canon).

Numbers marked (tune) are starting values. The economy modeler owns final numbers and publishes them in `balance-tables.md`; when that file exists, its numbers win over this file.

---

## 1. Ben's original ask (every item MUST appear in the spec)

Ben's words, cleaned up: a lemonade-stand tycoon. Start with one stand and sell lemonade. Use profits to upgrade the stand through 5 levels for more traffic and sales. Upgrade marketing to attract more people. Upgrade defenses (fence, stakes, barbed wire, guards) so rival stands' henchmen can't wreck your stands. Hire your own guards and send them to destroy rival stands. Net worth (land owned + stand value + money in the bank) gives a success/rank score. A higher score raises your threat profile and rival interest. A high score eventually brings helicopters and ships from wealthy clients placing large orders, which require field land and dock land. Buy territory to expand. Guards upgrade from fists to clubs to hatchets. No guns. Win by owning the map, or play forever for a high score.

Ben's later guidance (equally binding):
- "Make sure at the end of the day it's fun. That should inform the spec." Fun is the first filter on every rule.
- "A good balance between challenging and simple/laid back." Easy to learn, calm by default, real challenge for those who want it.
- Get creative with the visual style and art direction. Then music.
- "Similar to Owl World": Owl World is Ben's own game, The Owl and the Seven Scrolls, a 3D browser game whose every model is built in code by AI agents. Owl World is a source of code and techniques ONLY (how it builds terrain, sky, water, roads, crowds, ships, aircraft and its flight camera), never its world, map, scale or layout. Citrine Bay is designed fresh for this game, at whatever size and shape the game needs: bigger, smaller or different (Ben, 16:53: "we don't have to use the exact owl game world... Can be bigger, smaller, different according to the needs of this game"). The new game must be fully buildable by an AI agent. The spec stays design-focused (no tech stack), but settles the build-facing design decisions in section 25.

## 2. Identity

- Title: **Lemonade Stand Wars** (Ben's pick; use it everywhere). "The Big Squeeze" survives only as the top rank (Rank 10), the Act 5 title and the finale ("Call the Big Squeeze").
- Tagline: "When life gives you lemons, take the whole town."
- Logline: Turn Grandma Lottie's rickety folding table into a citrus empire, one street corner at a time, while rival drink gangs try to smash it to pulp.
- Genre: real-time-with-pause tycoon and territory builder with light auto-battle raids and base defense. Single player against AI rivals.
- Player fantasy: underdog to kingpin. From a card table on Maple Row to a helicopter landing on your own helipad to collect 4,000 bottles of pink lemonade for a movie star's pool party.
- Brand inside the game: **Lottie's Lemonade** (logo: a lemon in a sun hat). Default crew name: **The Peel Patrol** (renamable).
- Tone: cartoon turf-war comedy. A mob-movie parody played with lemonade, grandmas and goofy henchmen. Slapstick, never cruel.
- Content guardrails: no guns, no explosives, no fire or arson, no blood, nobody dies. Knocked-out characters see stars and wobble home. Hatchets mostly chop wood (fences, stands); hits on people happen inside a cartoon dust cloud. Target rating: ESRB E10+ / PEGI 7–12 (cartoon violence, comic mischief). No ethnic or regional stereotypes for villains. No real brands, no real people.

## 3. Fun first: principles and anti-frustration rules

Design principles (every section must respect them):
1. Every system can be explained in one sentence. Depth comes from how systems combine, not from rule count.
2. There is always a next goal within about 5 minutes: Lottie keeps 3 goals on screen (short, medium, long).
3. Losses sting but never ruin. On Classic, one raid should never cost more than about 1 day of income.
4. Show the odds before a decision: raid win chance, weather forecast, "why customers walked past" reasons.
5. Big moments get spectacle: stand transformations, rank-up headlines, first helicopter, first ship, boss takedowns.
6. Automate a chore the moment it turns into a chore (by about the 5th stand).
7. Comedy everywhere: taunts, puns, slapstick, the Bugle's headlines.
8. Rivals are characters with grudges and moods, not spreadsheets.
9. The player sets the pace: pause any time, warnings before raids, Laid Back mode.
10. Challenge comes from smart rivals and big goals, not hidden rules or punishing randomness.

Anti-frustration rules:
- No raids on the player on Nights 1–2. The first raid on you comes on Night 3: two of Brock's Smoothie Bros come for the till. Any fence, or anyone on guard (Dex once he's hired), sends them home, unless your guards Fall Back and give the fight up; undefended, they take it. After that, no more than 2 nights in a row pass without a raid on you on Classic (4 on Laid Back, 1 on Cutthroat, 2 on Custom). (Changed 2026-11-08 at Ben's call: the old Day 15 first raid left the first hour without any stakes.)
- Every raid on the player gives warning (minimum notice in section 13).
- Auto-pause on major alerts (toggle, on by default).
- A rival that loses a raid to you backs off for a while (Respect cooldown).
- Cheap rebuilds (15% of what was invested), rebuild windows and Lottie's Cookie Jar soften big losses.
- Laid Back mode: the player's stands can be Busted (closed until repaired) but never Wrecked.

Difficulty presets: **Laid Back** (calm: raids ×0.5, longer warnings, no game over, the Syndicate forms at Rank 9 in Sandbox and Endless since its Threat stops at 4), **Classic** (intended balance), **Cutthroat** (raids ×1.5, short warnings, the Syndicate forms at Threat 4 instead of 5 in Sandbox and Endless, no Cookie Jar). Plus Custom sliders and, in Sandbox only, a **Peaceful** toggle (no combat at all; rivals compete only with prices, marketing and land).

## 4. Time and structure

- Real time with pause. Speeds: Pause, 1×, 2×, 3×. Nights with nothing coming are skipped: Sleep goes straight to dawn when no raid is coming for you and none of your squads is out. A raid night plays, at 12× until the warning (a setting, on by default; picking a speed ends it until dawn). Your own raid's trip, fight and walk home play at the speed you chose.
- The simulation runs on fixed ticks: 1 tick = 1 in-game minute, 1,440 ticks per day.
- At 1×, one day takes about 5 real minutes: business hours 08:00–20:00 take about 3.5 minutes; night 20:00–08:00 takes about 1.5 minutes.
- Dawn (07:00) opens **Morning Prep** with the morning paper (The Citrine Bay Bugle). The game waits there by default, and again at the Day's end card at 20:00; a toggle auto-continues both.
- Night is when most raids happen. Stands are closed at night.
- Seasons: 14 days each. Year = 56 days. The game starts on Summer Day 1 ("the first day of summer vacation"). Order: Summer, Fall, Winter, Spring.
- Campaign length target: about 140–150 days to victory, 19–20 hours of play at about 8 real minutes per day including pauses. Rank 10 follows in Endless Summer, about Days 150–160.

## 5. Meters (keep it to these four on the top bar, plus cash)

| Meter | Range | What it means | Driven by |
|---|---|---|---|
| Cash | $ | Money in the bank. The only currency. No premium currency. | Sales, contracts, loot, loans |
| Success Score (SS) | points | Net Worth. 1 point per $1. Shown with the Rank badge. | See formula below |
| Reputation | 1.0–5.0 stars | How the public feels about Lottie's Lemonade | Quality, fair prices, service, events, daytime brawls |
| Threat | 1–5 sour lemons | How hard rivals are coming for you | Rank |

Net Worth = Cash + market value of all land you own + building value (75% of everything invested in stands, defenses and facilities on your plots) + inventory at cost − loans owed. Floor 0. Because buildings count at 75%, building something dips the score; the Rank badge shows that dip as a striped "invested" sliver, not a loss, and the sliver fills back in as the score recovers.

Reputation effects: appeal multiplier from 0.7× at 1 star to 1.3× at 5 stars (linear). VIP gates: helicopter clients need 3.5 stars, ship clients 4.0, mega contracts 4.5. Start at 3.0.

Sheriff rule (the only "heat" in the game): if Reputation is below 2.0 stars, each daytime raid you launch earns a Citation from Sheriff Budd: a fine equal to about 1 day of income (the last week's average daily sales, never more than your cash) and no raids or HQ assaults for the rest of that day and the next 2. The ban calls off your raids that haven't set out; a squad already on the road, and the raid that earned it, still fight. A Tonight raid that would land after 07:00 waits for the stands to open and is fought by day, star cost and Citation included.

## 6. The map: Citrine Bay

A sunny coastal town. 8 districts, 116 plots in the campaign map. Civic plots cannot be bought.

| District | Start owner | Plots | Street-plot traffic/day (tune) | Special land | Customers | Feel |
|---|---|---|---|---|---|---|
| Maple Row | Neutral (player start) | 12 | 250–400 | Lottie's Corner (start plot) | Kids, families, seniors | Leafy suburb, picket fences, sprinklers |
| Old Town | Contested (every faction has 1–2 stands) | 16 (4 civic) | 500–900 | Civic: Town Hall and Registry, Citrine Bay Market, the Hiring Hall, Dot's Diner | Everyone | Main Street, bandstand, clock tower |
| Campus & Arts | Cold Brew Collective | 14 | 450–800 | — | Students, artists | Murals, the Quad, record shops |
| Downtown | FizzCo | 18 | 800–1,500 | Prime tower plazas | Office workers | Glass towers, lunch rush |
| The Boardwalk | Boardwalk Blenders | 16 | 700–1,400 (summer ×1.5, winter ×0.4) | The Pier (landmark) | Tourists, joggers | Beach, pier, arcade, lifeguard towers |
| The Harbor | FizzCo bottling plant plus neutral lots | 14 | 300–600 | 4 Dock plots | Dockhands | Cranes, warehouses, fish market |
| The Groves | Hollis Sweet Tea Co. | 16 | 150–350 | 6 Field plots; the Fairgrounds (landmark) | Farmhands, fair crowds | Lemon and tea fields, barns, windmills |
| Hilltop Estates | The Sourwood Family | 10 | 300–600 (customers pay ×2) | 1 Field (polo lawn), 1 Dock (yacht marina) | High rollers | Mansions, country club, hedges |

Plot types: Street, Prime (traffic ×3, price ×3), Landmark (one per district, traffic ×5, price ×8), Field (open land: helipads, lemon groves; tiny foot traffic), Dock (waterfront: piers), Industrial (Harbor/Downtown edges: bottling, warehouses), HQ (a rival's headquarters; captured, never bought), Civic (not for sale).

One building per plot. Buildings: Stand (L1–L5), Clubhouse (guards), Warehouse, Bottling Works, Billboard, Lemon Grove (Field), Helipad (Field), Pier (Dock). An owned empty plot is a Vacant Lot (it still counts toward land value and control).

Neighbors matter: stands within 2 plots of each other share passing customers (competition), and many effects use "within 2 plots".

Geography (schematic; the build shapes the real coastline and streets, at whatever scale plays best): the bay lies to the south and east. North row, west to east: The Groves (inland farmland), Campus & Arts, Hilltop Estates (a headland with its marina on the east shore). Middle row: Maple Row (west), Old Town (the hub), Downtown (towers on the east shore). South row, on the beach: The Boardwalk (southwest to south), The Harbor (the southeast corner, docks on the water).
Borders (districts that share an edge): Maple Row–The Groves, Maple Row–Old Town, Maple Row–The Boardwalk; Old Town–Campus & Arts, Old Town–Downtown, Old Town–The Boardwalk; Campus & Arts–The Groves, Campus & Arts–Hilltop Estates; Downtown–Hilltop Estates, Downtown–The Harbor; The Boardwalk–The Harbor. Buying into a district and sending reinforcements both use these borders.

## 7. Running the business

Supplies: Lemons, Sugar, Ice. Cups and napkins are a flat $0.05 per cup. Buy at the Citrine Bay Market each morning; prices move ±20% a day (tune). Ice melts every night. Lemons spoil after 3 days. Sugar keeps. Each stand holds limited stock (by level). Lottie stocks your table on Day 1; from Day 2 you buy your own, and **Auto-Restock** unlocks (keep each stand stocked to a target).

Starting ingredient costs per cup, Classic recipe (tune): lemons $0.10, sugar $0.03, ice $0.03, cup $0.05 → about $0.21 per cup.

Recipes (cards, not sliders). Each card has a cost per cup, the segments that love it, a season or district it shines in, and a price bonus. A simple **Sweetness** dial (Less / Classic / Extra) shifts appeal by segment.

| Recipe | How you get it | Shines with |
|---|---|---|
| Classic Lemonade | Start | Everyone |
| Pink Lemonade | Start | Kids, families |
| Mint Lemonade | Start (Lottie's third surviving page) | Joggers, students |
| Strawberry Lemonade | Win the Summer Fair taste-off (Act 1) / any fair win in Sandbox | Kids, tourists |
| Frozen Lemonade | Recovered from the Blenders' HQ | Boardwalk, heat waves |
| Honey-Ginger Hot Lemonade | Recovered from the Cold Brew Collective's HQ | Winter, seniors |
| Sparkling Lemonade | Recovered from FizzCo Tower | Office workers |
| Lavender Lemonade | Won at the Hilltop estate auction (opens at Rank 8; in the campaign, once Act 5 begins) | High rollers |
| Hollis Half-and-Half (lemonade and sweet tea) | From Tilly Hollis (beat or buy out Hollis) | Farmhands, everyone in summer |
| Lottie's Secret Reserve | Recovered from Sourwood Manor (finale) | Everyone; best recipe in the game |

Story: Lottie's recipe book had 10 pages. Vera Sourwood stole 7 of them in "the Sour Summer of '79" and later traded some to the other bosses. Lottie kept 3 (Classic, Pink, Mint). Getting pages back is a running collectible thread.

Customers: 8 segments — Kids, Families, Seniors, Students, Office Workers, Tourists, Workers (dockhands and farmhands), High Rollers. Each has a price tolerance, favorite recipes, patience (queue length they accept) and peak hours (commute, lunch, afternoon heat, evening stroll).

Demand model (simple and visible):
- Passersby per day at a plot = plot base traffic × stand level draw × marketing × season × weather traffic factor.
- Stop chance = 25% base × thirst (weather) × appeal.
- Appeal = stand curb appeal × recipe match × price fit × Reputation multiplier.
- Nearby stands (any faction, within 2 plots) split passing customers by appeal.
- Cups sold = the smallest of demand, service capacity and stock.
- Every stand shows "why people walked past" (too pricey, line too long, not thirsty, went to a rival, sold out).

Weather (forecast at dawn, about 80% accurate; the Radio Jingle marketing tier adds a 2-day forecast). Temperatures in °F with a °C option.

| Weather | Thirst | Foot traffic | Notes |
|---|---|---|---|
| Scorcher (95°F+) | ×1.6 | ×1.0 | Heat-wave events chain 3 days |
| Hot (85–94°F) | ×1.3 | ×1.0 | |
| Warm (72–84°F) | ×1.0 | ×1.0 | |
| Cloudy | ×0.8 | ×0.9 | |
| Rainy | ×0.5 | ×0.7 | |
| Storm | ×0.2 | ×0.4 | L1–L2 stands take storm damage unless repaired |

Season demand (tuned): Summer ×1.2, Fall ×0.9, Winter ×0.6 (Honey-Ginger Hot Lemonade ignores the winter penalty), Spring ×1.0.

## 8. Stands: 5 levels (tuned values)

| Level | Name | Upgrade cost | Draw (traffic ×) | Service capacity (cups/hour) | Top price customers accept | Upkeep/day | HP | Guard posts |
|---|---|---|---|---|---|---|---|---|
| L1 | The Folding Table | Start / $150 to build new | 1.0 | 20 | $1.50 | $5 | 100 | 1 |
| L2 | The Wooden Stand | $400 | 1.5 | 50 | $2.00 | $15 | 300 | 2 |
| L3 | The Kiosk | $3,500 | 2.3 | 120 | $3.00 | $60 | 800 | 3 |
| L4 | The Lemon Shack | $60,000 | 3.5 | 300 | $4.50 | $300 | 2,000 | 4 |
| L5 | The Citrus Palace | $650,000 | 5.0 | 700 | $7.00 | $1,500 | 5,000 | 6 |

Rank gates: L2 at Rank 1, L3 at Rank 3, L4 at Rank 5, L5 at Rank 7. Payback targets the modeler should hit (on a plot with traffic that suits the level: L4–L5 belong on Prime or Landmark plots): L2 ≤ 3 days, L3 ≤ 6, L4 ≤ 10, L5 ≤ 15.

Visual identity per level: L1 card table, crayon sign, glass pitcher, a cooler. L2 popsicle-stick booth, striped awning. L3 kiosk with a chalkboard menu, juicer, two windows. L4 walk-up shack with a neon "LOTTIE'S" sign, picnic tables, an ice machine. L5 the Citrus Palace: a lemon-dome roof, a giant spinning lemon on a pole, a drive-up window, a lemonade fountain.

Specialization: at L3 a stand gets 1 specialization slot, at L5 a second. Options: **Express Window** (+30% service), **Fancy Menu** (+20% top price), **Fortified Frame** (+50% HP), **Billboard Roof** (+15% traffic to your stands within 2 plots).

Damage: a damaged stand sells at a share of capacity equal to its HP share, and at least a cup an hour while it stands; a Damaged facility keeps working at full output until it is Wrecked. Repairs cost 15% of what was invested × the share of HP lost, so a repair never costs more than a rebuild, and happen overnight (Auto-Repair unlocks at Rank 3; it books the fixes at closing but keeps back tomorrow's wages and any loan payment due at dawn).

## 9. Marketing

Brand tiers (global, permanent):

| Tier | Name | Unlock | Cost (tune) | Effect |
|---|---|---|---|---|
| M1 | Hand-Painted Signs | Rank 1 | $100 | +5% traffic everywhere |
| M2 | Flyers & Sidewalk Chalk | Rank 3 | $1,500 | +12% |
| M3 | Radio Jingle | Rank 4 | $12,000 | +22%; adds a 2-day weather forecast; your jingle plays on the in-game radio |
| M4 | Billboards & TV Spot | Rank 7 | $90,000 | +35%; unlocks the Billboard building |
| M5 | The Lemon Blimp | Rank 8 | $500,000 | +50%; a yellow blimp floats over the bay |

Local campaigns (temporary, targeted):
- Sandwich-Board Kid (Rank 2): about $40/day, +20% traffic at one stand.
- Free Sample Day (Rank 2): costs cups; +0.1 star Reputation and +15% traffic at that stand for 3 days.
- Sunny the Lemon mascot walk (Rank 3): about $300/day, +25% traffic for your stands in one district.
- Coupon Blitz (Rank 4): a day at −25% price for +40% appeal at your stands in one district, in place of what the cut would win.
- Event Sponsorship (Rank 5): big boost in the district hosting a festival.
- Billboard building (Rank 7): your stands within 2 plots get +20% traffic; rival stands in that radius −10% appeal.

## 10. Land and territory

- Buy any unowned plot in Maple Row from the start and in Old Town from Rank 2. From Rank 3, buy in any district where you have a Foothold or that borders one (in the campaign this opens The Boardwalk, The Groves, Campus & Arts and Downtown first). In Sandbox, the start district is open from Day 1 and the border rule applies from Rank 2.
- Land value rises as a district develops (more and bigger stands): up to ×2 base value.
- District control = your share of the district's purchasable plots.

| Control tier | Share | Effect |
|---|---|---|
| Foothold | at least 1 plot | You can buy and raid here |
| Majority | 51%+ | Your stands here +10% sales; rival stands here −10% appeal; land 10% cheaper for you |
| Stronghold | 75%+ | Raids into this district are detected more often; your reinforcements arrive faster |
| Full Control | 100% | District perk (below) |

District perks at Full Control: Maple Row "Neighborhood Watch" (free Tin-Can Alarms on every plot you own there, and all raids anywhere get +10% detection); Old Town "Town Favorite" (+10% traffic at your stands in Old Town and Maple Row); Campus & Arts "Word of Mouth" (local campaigns half price everywhere: their cash, a Free Sample Day's cups and a Coupon Blitz's price cut, though a Billboard, being a building, costs full price); Downtown "Power Lunch" (the 12:00–14:00 lunch rush ×1.5 at your stands in Downtown and Old Town); The Boardwalk "Tourist Trap" (tourists pay +20% everywhere); The Harbor "Shipping Lane" (ship contracts +15% pay); The Groves "Orchard Fresh" (+10% traffic at all your stands); Hilltop "Old Money" (VIP offers 50% more often).

**Knock it down, buy it up** (how land changes hands by force):
1. Smash any rival building except an HQ: a stand, a VIP facility (Pad to Cargo Terminal), a Lemon Grove, a Warehouse or a Bottling Works. Its plot becomes **Wrecked**. (Hollis's 6 starting Fields hold Lemon Groves.)
2. The owner can rebuild (cost: 15% of what was invested in that building). The player has until the end of the day after the smash to book it, or the plot goes For Sale at the second dawn. AI rivals decide the morning after: they rebuild if they can afford it and their personality says so, a 40–80% chance by personality, cut by 30 points for each earlier Smash on that plot in the last 7 days. The Raid Planner shows the chance before you raid ("they rebuild: 70%").
3. If not rebuilt, the plot goes **For Sale**. Whoever smashed it gets **First Dibs** until the next dawn at 100% land value (a rival smasher buys at once if it can afford it).
4. Then it goes to a sealed-bid **Auction**, open to every faction, that closes at the next dawn. Bids open at land value; the highest pays what it bid, and a tie goes to the player. With no bids, the plot returns to the Registry, unowned.
The same rules apply to the player's own plots (so defend them). On Laid Back, the player's stands are only ever Busted (closed until repaired at 10% cost), never Wrecked.

Peaceful routes: **Plot Buyout** offers (Rank 4+; the rival asks 2.5× land value in their home district and 2× elsewhere; grudge and personality can nudge it) and **Faction Buyout** (from that rival's HQ rank, at Dot's Diner; see Rivals).

## 11. Defenses (per plot)

Perimeter tiers (each replaces the last; starting values, tune):

| Tier | Name | Unlock | Cost | HP | Effect |
|---|---|---|---|---|---|
| P1 | Picket Fence | Rank 1 | $150 | 150 | Slows the breach |
| P2 | Chain-Link Fence | Rank 2 | $1,200 | 500 | Tougher; defenders can fight through it |
| P3 | Sharpened Stakes (palisade) | Rank 4 | $6,000 | 1,200 | Attackers take 2 damage/second while breaching |
| P4 | Barbed Wire | Rank 6 | $25,000 | 2,500 | Attackers take 4 damage/second while breaching and move 30% slower |
| P5 | Citrus Fortress Wall | Rank 8 | $100,000 | 5,000 | A brick wall with a gate; defenders +25% damage while it stands |

Defenders get +25% damage while any perimeter still stands (P5 adds its own +25%, so +50% total). Gadgets (2 slots per plot, a 3rd at L4):

| Gadget | Unlock | Cost (tune) | What it does |
|---|---|---|---|
| Tin-Can Alarm | Rank 2 | $100 | +15% raid detection |
| Guard Goose ("Honkers") | Rank 2 | $400 | +15% detection; honks and stuns the first attacker for 3 seconds |
| Lemon-Peel Slick | Rank 4 | $250 (+$25 to reset each night) | The first 3 attackers slip and are stunned for 4 seconds |
| Sprinkler Ambush | Rank 4 | $800 | Soaked attackers deal 20% less damage for the fight |
| Floodlights | Rank 5 | $1,500 | Cancels the night stealth bonus |
| Watchtower | Rank 6 | $5,000 | +30% detection; sees 2 plots out; reveals an incoming raid's makeup |

## 12. Crew and combat

Guards (the player's units):
- Hire at the Hiring Hall (Old Town) from a recruit pool that refreshes weekly. Each recruit has a name, a face, one Trait, a hire fee and a daily wage.
- Roster cap: 2 guards before you own a Clubhouse ("Dex sleeps in the shed"), then 2 + Clubhouse capacity.
- Clubhouse (tune): L1 $2,000 (houses 6), L2 $15,000 (12; Training Yard: idle guards earn XP), L3 $80,000 (24; Infirmary: knockouts heal 1 day faster).
- Stats: HP 100, Hit (damage per swing to people), Chop (damage per swing to fences and stands), Speed, Nerve. One swing every 1.5 seconds.
- Weapons (the ladder Ben asked for; unlock globally, then buy per guard):

| Weapon | Unlock | Cost per guard (tune) | Hit | Chop | Notes |
|---|---|---|---|---|---|
| Fists | Start | free | 10 | 5 | Rolled sleeves |
| Clubs | Rank 3 | $150 | 18 | 10 | Wooden bats wrapped in yellow tape |
| Hatchets | Rank 6 | $1,200 | 24 | 40 | Built for chopping fences and stands |

No guns, ever. No other weapon types for the player. Rival factions use reskins of the same three tiers (see Rivals).
- Padding: Padded Vest (Rank 3, $200, +40 HP), Pro Gear (Rank 6, $1,500, +100 HP and −20% damage taken).
- Levels 1–5 (Rookie, Regular, Veteran, Elite, Legend): +10% HP, Hit and Chop per level above 1. XP from fights and the Training Yard. Wages rise with level (tune: about $15/day for a Rookie up to about $90/day for a Legend).
- Traits (one per guard, 13): Tough Cookie (+20% HP), Night Owl (+25% at night), Eagle Eye (+detection when stationed), Hothead (+15% Hit, −Nerve), Loyal (never quits or defects), Butterfingers (10% chance to drop a weapon), Sprinter (+Speed), Gentle Giant (big HP, low Hit, no Reputation loss in daytime raids), Lumberjack (+50% Chop; stacks with the Wrecker specialty), Smooth Talker (better Sit-down terms when assigned as your negotiator), Goose Whisperer (Guard Geese stun twice), Former Rival (+10% against their old faction), Sneaky (+25% stealth on raids; can lead a Sabotage).
- Specialists (promote a guard at Level 3+): **Lookout** (Rank 4: early warning when stationed; scouts rival plots before raids), **Wrecker** (Rank 4: +50% Chop), **Captain** (Rank 6: leads a squad, +20 Nerve and +10% Hit to the squad).
- Dex Moody is your first guard (free, scripted in the campaign) and becomes your crew chief.

Raids (player on offense):
- Unlock at Rank 3. Squad size cap: 5 at Rank 3, 8 at Rank 5, 12 at Rank 7.
- Plan in the Raid Planner: pick a target plot, an objective, a squad, a time (now or tonight) and see the estimated win chance. Unscouted defenses show as "?" (scout with a Lookout or a Gull Flight; see section 25).
- Objectives: **Smash** (bring the stand's HP to 0 → Wrecked), **Shakedown** (steal about 1 day of that stand's profit in cash), **Sabotage** (Rank 4, needs a Lookout or a Sneaky guard: spoil their stock so they can't sell tomorrow; the stand stays up), **HQ Assault** (see Rivals).
- Daytime raids cost Reputation (−0.1 star per raid, −0.2 if you Smash in daytime) because customers see it. Night raids cost no Reputation but defenders may have Floodlights.

How a fight resolves (auto-battle, watchable, about 30–90 seconds). While a fight plays, the game clock slows to 1 game minute per real second at any speed, so a 60-second fight takes 1 game hour:
1. **Approach**: travel takes 1–3 game hours by distance. Detection roll vs the target's alarms, geese, lookouts and towers. Night gives attackers +25% stealth unless Floodlights. Detected → the defender sees the ETA and can send reinforcements. Undetected → attackers get a first strike (+25% damage for 5 seconds).
2. **Breach**: attackers chop the perimeter's HP. Stakes and barbed wire hurt them while they chop. Defenders fight at the fence line with their +25% bonus.
3. **Brawl**: units swing at nearby enemies. KO at 0 HP. When a side has lost half its people, each remaining unit rolls Nerve (Captain +20) or runs.
4. **Objective**: attackers left standing with no defenders up do the objective (chop the stand, grab the till, spoil the stock). A 60-game-minute timer: if time runs out, the stand is only Damaged.
5. **Aftermath**: KO'd guards are Out for 1 day (2 if a hatchet did it). No one dies. Each KO'd attacker left behind has a 10% chance to be **Nabbed**: ransom them, release them (+Reputation), or try to recruit them (unless Loyal). Unpaid guards quit.

Player tactics during a fight (simple buttons, cooldowns): Rally (+Nerve), Fall Back (retreat with fewer KOs), Ring the Bell (defense only: reinforcements leave now). One fight plays at a time: a raid on you that reaches its plot mid-fight waits at the plot's edge and goes in as that fight ends, and your own raids that land meanwhile are fought at once.

Raids on the player:
- Warnings: detected raids show the full ETA; undetected raids still give a minimum notice of 15 game minutes on Classic (30 Laid Back, 5 Cutthroat). A raid warning auto-pauses the game (on by default in Laid Back and Classic, off in Cutthroat; a setting), so the notice is real decision time. Paused first or not, on every difficulty, the notice's last minutes run at fight speed, so Classic's last 15 game minutes take 15 real seconds and Cutthroat's 5-minute notice lasts 5. A detected raid's earlier warning runs at the speed you chose.
- Detection chance = 50% base + Tin-Can Alarm 15% + Guard Goose 15% + stationed Lookout 25% + Watchtower 30% (once, on its plot and your plots within 2) + Eagle Eye guard 10% + Neighborhood Watch 10% + Stronghold 10% (cap 95%), then −25% at night without Floodlights and −25% for a Sneaky raider (never below 0%).
- Reinforcements: guards at a Clubhouse can rush to any of your plots in the same or a bordering district (30–60 game minutes).
- Respect cooldown: a rival whose raid you beat won't raid you for 3 days (5 Laid Back, 1 Cutthroat).

Combat balance anchors, as the sim measures them (npm run combat): a Threat 1 raid (3 fists) nearly always beats an undefended L1 stand, and fails about 78% of the time against a Picket Fence plus 1 fists guard; real Threat 1 parties (2–3 fists) fail about 92%, so the early raids bounce off any fence or guard. A fully kitted L5 plot (4–6 guards with hatchets and Pro Gear, 2–3 gadgets) holds against a Threat 4 raid about 80% of the time behind a P4, and nearly every time behind a P5.

## 13. Rivals

| Faction | Product | Boss | Home and HQ | Personality | Signature move | Henchmen look and weapon reskins |
|---|---|---|---|---|---|---|
| The Sourwood Family | Lemonade (old money) | Vera Sourwood, 78, icy, pearls and a silver-tipped cane; Lottie's ex-best-friend | Hilltop Estates, Sourwood Manor | Cunning and balanced | "Old Money": leans on Mayor Fontaine to fine you or freeze a land sale; from Act 5, elite Stewards on her raids and at her plots (the Manor's own defenders stay regular) | Stewards: bowler hats, white gloves; walking canes (club tier), hatchets |
| Hollis Sweet Tea Co. | Sweet tea | Tilly Hollis, "Big Tilly," farm matriarch with a giant wooden ladle | The Groves, Hollis Homestead | Defensive landholder | "Dig In": cheap tough fences and hay-bale barricades; holds the Field land | Farmhands: straw hats, overalls; shovels (club tier), farm axes |
| FizzCo Beverages | Soda | Preston Fizzwell III, slick CEO glued to his car phone | Downtown, FizzCo Tower (plus the Harbor bottling plant) | Rich and expansionist | "Hostile Takeover": outbids at auctions, buyout offers, marketing blitzes, Cease-and-Desist letters that block your marketing in a district for 3 days | Security Associates: blazers, earpieces, sunglasses; batons (club tier), fire-axe-style hatchets |
| The Cold Brew Collective | Iced coffee | Juniper "Juni" Grind, deadpan artist-barista in a beanie | Campus & Arts, the Grindhouse | Saboteur | "Night Shift": stealthy night raids, spoiled stock, graffiti posters that dent your Reputation | Baristas and skaters: beanies, aprons; skateboards (club tier), hatchets |
| The Boardwalk Blenders | Smoothies | Brock "The Blender" Bodine, beefy surf-gym bro | The Boardwalk, the Blend Shack on the Pier | Aggressive swarm | "Blender Rush": frequent cheap raids with lots of fists | Smoothie Bros: tank tops, visors, zinc noses; paddleboards (club tier), hatchets |

Rival AI (each day at dawn):
- Earn (they run stands under the same economy rules), then spend by personality across three buckets: Grow (land, stand upgrades), Guard (defenses, crew), Strike (raids and schemes).
- Each rival tracks a **Grudge** per faction (rises when hit) and an **Attention** toward the player (from Threat, shared borders, stolen customers and grudge).
- Target choice: the weakest valuable stand near their turf (value divided by defense).
- Rivals raid each other too: about 30% of rival raids target other rivals at Threat 1–3, 15% at Threat 4, 0% once the Syndicate forms.
- Bosses phone your stand to taunt you, and the Bugle reports their moves.

Sit-downs at Dot's Diner (neutral ground, Rank 4+):
- **Truce**: no raids between you and one rival for 7 days; costs tribute (cash) — breaking it costs 1 full star of Reputation and makes every rival distrust you: every Grudge toward you jumps, and no rival accepts a Truce for 14 days.
- **Plot Buyout**: buy one rival plot at their price.
- **Faction Buyout** (opens at that rival's HQ rank: the Blenders at Rank 5, the Cold Brew Collective at 6, Hollis at 7, FizzCo at 8): when a rival is **Weakened** (holds 40% or less of its peak plots, its Net Worth is under 25% of yours, or your daily sales have been at least double theirs for 7 days in a row), offer 1.5× their cash and buildings to buy the business. Land isn't included: every plot they held goes to the Fire Sale, where you get First Dibs. Brock and Tilly accept readily; Juni and Preston haggle: they counter at 2.1×, and if you hold firm they either come down to 1.8×, never lower, or walk out until tomorrow with more Grudge; Vera never sells (except in Sandbox with Peaceful on, where she sells at 3× her cash and buildings once Weakened, so Domination can finish).

Elimination (any of): HQ captured; Faction Buyout accepted; bankrupt for 7 days. On elimination: the boss's exit scene, their remaining plots go to a **Fire Sale** (you get First Dibs at −25% for 2 days, counted from the next dawn if the rival falls after closing, then auction), their HQ becomes your **Trophy** building with a unique perk (Blend Shack: Blender Bar, Frozen recipes sell for 20% more; Grindhouse: Juni's Grapevine, raid warnings arrive 1 game hour earlier; Hollis Homestead: Hollis Orchards, each of your Lemon Groves brings +10% traffic instead of +5%; FizzCo Tower: Bottling Line, bottles fill 25% faster; Sourwood Manor: Family Silver, land, Plot Buyouts and auction bids cost 10% less), and you recover their recipe page. Defeated bosses can later be hired as advisors (v1 stretch).

HQ Assault (each HQ opens at its own rank: Blend Shack Rank 5, Grindhouse 6, Hollis Homestead 7, FizzCo Tower 8, Sourwood Manor 9 through the Big Squeeze; the rival must be Weakened): three stages — the Gate (a wall whose HP rises with HQ difficulty: Blend Shack 2,000, Grindhouse 2,750, Hollis Homestead 3,500, FizzCo Tower 4,250, Sourwood Manor 5,000), the Yard (henchmen a level above the rest of the HQ's), the Boss Room (the boss and bodyguards). Boss moves: Brock "Blender Rush" (charges and knocks 3 guards down), Juni "Espresso Shot" (her crew +50% speed for 10 seconds), Tilly "Hay Bale Wall" (spawns barricades), Preston "Hostile Takeover" (pays 2 of your guards to switch sides mid-fight unless they're Loyal), Vera "Old Money" (calls in Steward reinforcements; her cane disarms one guard). HQ difficulty order: Blend Shack < Grindhouse < Hollis Homestead < FizzCo Tower < Sourwood Manor.

The Syndicate: at Threat 5, remaining rivals stop fighting each other and coordinate multi-front raids (2–3 targets at once, boss-led). In the campaign, Vera forms the Syndicate 14 days into Act 5 on every difficulty (about Day 120 on Classic; on target pacing it lands on the Founders' Day fireworks), and Cutthroat's Threat 4 trigger applies only in Sandbox and Endless, as does Laid Back's Rank 9 trigger (its Threat stops at 4). From Rank 9 the player chooses when to **Call the Big Squeeze** (the finale).

## 14. Success Score, Ranks and Threat

| Rank | Title | SS threshold (tuned) | Key unlocks |
|---|---|---|---|
| 1 | Sidewalk Squeezer | $0 | Sell, price, recipes, weather, supplies, L2, Picket Fence, M1 signs, buy in Maple Row |
| 2 | Corner Hustler | $1,500 | Hire guards (fists), Clubhouse, Chain-Link, Tin-Can Alarm, Guard Goose, local campaigns, buy in Old Town |
| 3 | Block Boss | $6,000 | L3 Kiosk, clubs, Padded Vest, raids (Smash, Shakedown), Local Orders, M2, squad 5, Marisol's Auto-Price, bulk actions, Auto-Repair |
| 4 | Neighborhood Name | $25,000 | Stakes, Lemon-Peel Slick, Sprinkler, Lookouts, Wreckers, Sabotage, Sit-downs, M3 Radio, Warehouse, Dex's Auto-Defend |
| 5 | District Big Shot | $100,000 | L4 Lemon Shack, Bottling Works, Caterer orders, Floodlights, squad 8, Clubhouse L2, the Blend Shack (HQ assault or Faction Buyout once Weakened) |
| 6 | Citrus Baron | $500,000 | Hatchets, Barbed Wire, Watchtower, Pro Gear, Captains, Pad on a Field plot → helicopter VIPs, raid templates, the Grindhouse (assault or buyout) |
| 7 | Lemon Tycoon | $4,500,000 | L5 Citrus Palace, Pier (Dock) → ship contracts, M4 Billboards & TV, squad 12, Clubhouse L3, district policies, Hollis Homestead (assault or buyout) |
| 8 | Juice Magnate | $20,000,000 | Citrus Fortress Wall, Heliport and Cargo Terminal, recurring Supply Deals, M5 Lemon Blimp, FizzCo Tower (assault or buyout), the Lavender auction |
| 9 | Bay Kingpin | $125,000,000 | Mega contracts; in the campaign, Call the Big Squeeze |
| 10 | The Big Squeeze | $200,000,000 | Title rank, golden Citrus Palace skin, endless leaderboards |

Every rank-up: a Bugle headline, confetti, and a choice of 1 of 3 **Lottie's Tips** perks (a pool of about 24 small boosts, e.g. +10% price tolerance, guards heal a day faster, land 10% cheaper, geese stun twice, campaigns last 50% longer, +20% defense at night, buyouts 15% cheaper).

Ranks are never lost: Success Score can fall, but your Rank and its unlocks stay.

Threat (1–5): Ranks 1–2 → 1, Ranks 3–4 → 2, Ranks 5–6 → 3, Ranks 7–8 → 4, Ranks 9–10 → 5. Laid Back −1 (min 1).

| Threat | Nights a week with a raid on you (Classic, measured) | Typical raid |
|---|---|---|
| 1 | about 5 | 2–3 henchmen, fists, scare-offs and shakedowns |
| 2 | about 4 | 3–5, some clubs |
| 3 | about 4–5 | 5–8, clubs, vests, a lookout, real smash attempts |
| 4 | about 2.5–5 | 8–12 in Pro Gear, most with hatchets, sometimes on two plots at once |
| 5 | about 2.5–7.5 strikes | The Syndicate: 12–20 in the same kit across 2–3 targets, boss-led |

Each night's raids are drawn from a base of 1, 2, 3, 4 and 6 a week by Threat (Laid Back ×0.5, Cutthroat ×1.5). After the first raid on Night 3, no more than 2 nights in a row pass without one (4 on Laid Back, 1 on Cutthroat), and a rumor you answer brings its gang on a night the draw gave none. A rival whose raid you beat sits out its Respect cooldown, so the low end of each range is every raid beaten and the high end none. Rivals also run non-raid schemes (price wars, auction snipes, smear posters) more often as Threat rises.

## 15. VIP clients and big orders

| Tier | Unlock | Needs | Size | Pay (tuned) |
|---|---|---|---|---|
| Local Orders | Rank 3 | Any L3+ stand | 300–1,500 cups, 2-day deadline | about 1.5× retail |
| Caterer Trucks | Rank 5 | Warehouse + Bottling Works | 1,000–5,000 bottles | $6 a bottle (2× retail) |
| Helicopter VIPs | Rank 6, 3.5 stars | Pad, Helipad or Heliport on a Field plot | 2,000–10,000 bottles, 3–5 days | $30 a bottle, +0.2 star |
| Ship Contracts | Rank 7, 4.0 stars | Pier on a Dock plot | 10,000–60,000 bottles, multi-day loading | $40 a bottle; recurring Supply Deals at Rank 8 (Cargo Terminal; 200,000 bottles in 4 weekly loads over 28 days at $30, about $6M a deal; several can run at once) |
| Mega Contracts | Rank 9, 4.5 stars | Heliport + Cargo Terminal + premium recipes | 100,000–150,000 bottles | $100 a bottle ($10M–$15M a contract) |

Facilities (tuned): on a Field plot, Pad (Rank 6) $50,000, Helipad (Rank 7) $200,000, Heliport (Rank 8) $800,000; on a Dock plot, Jetty (Rank 7) $250,000, Pier (Rank 7) $750,000, Cargo Terminal (Rank 8) $3,000,000. Once a facility tier stands, its client type offers at least one job every 10 days, and the first Supply Deal is offered as soon as the Cargo Terminal stands. Each Supply Deal ships in 4 weekly loads of 50,000 bottles, paid $1.5M a load, and several can run at once if your bottling keeps up. Appendix A of the spec holds the full balance tables, which override any starting value here.
VIP rules: every offer is optional; pay arrives with each pickup (helicopter trip or ship loading), not at the end; facility tiers are bought one step at a time (Pad, then Helipad, then Heliport).

Clients are fictional and comic: a movie star's pool party, a tech mogul's rooftop launch, a celebrity wedding, a music festival VIP tent, the Citrine Bay Regatta, a cruise line, an overseas export deal, the Governor's Gala, the Bay Centennial.

Facilities (tune): Helipad tiers Pad → Helipad → Heliport (bigger choppers, more per trip, 2 trips a day at Heliport). Pier tiers Jetty → Pier → Cargo Terminal (yachts → cruise ships → freighters). Bottling Works L1–L3 turns supplies into bottles (1,500 / 4,000 / 12,000 a day). A Warehouse tops up your stands in its district while they are open, stores 5 days of their sugar against a Shortage, and is where Caterer Trucks load. Bottles bank in one bay-wide store between pickups. A Lemon Grove (Field, $25,000, up to 2) brings +5% traffic to all your stands ("Grown in Citrine Bay").

Field and Dock land is scarce and owned by rivals at the start (Hollis holds most Fields; FizzCo holds most Docks; Sourwood holds Hilltop's polo lawn and marina). Getting VIPs means taking or buying that land.

Pickup moments: a chopper lands or a ship docks in a 2-hour pickup window. The game auto-pauses only for each client's first arrival (with a Watch button) and for Delivery Raid warnings; routine pickups just land in the alert feed. At Threat 3+, each pickup trip has a 30% chance of a **Delivery Raid** on the pad or pier during loading, or on the Warehouse where a Caterer Truck loads; the raiders go after the trip's biggest load. If it's overrun, the order fails (−0.3 star). Rivals can also bid against you for the same contract (price, delivery time and Reputation decide).

## 16. Economy (starting values, tune)

- Start: $150 cash, Lottie's Corner (land value about $300) with an L1 stand, Classic, Pink and Mint recipes, no guards, no defenses. Starting Net Worth about $525.
- Sources: cup sales, contracts, Shakedown loot, Supply Deals, land appreciation (counts toward SS), selling plots, fair prizes.
- Sinks: supplies, stand upgrades, upkeep, wages, land, defenses, gear, marketing, repairs and rebuilds, loan interest, citations. (No insurance and no property tax: bills with no decision in them were cut, and rebuilds are cheap instead.)
- Loans (Marisol, via the First Bank of Citrine Bay): up to 50% of your non-cash Net Worth, 3% interest per week, 4-week terms. Two missed payments → the bank repossesses your lowest-value plot as Net Worth counts it (never a Trophy, and Lottie's Corner only when no other plot is left), and pays back anything it's worth over the debt.
- Security spend (guards, defenses, repairs) should land around 15–25% of daily income through Acts 1–3 on Classic (a little more in the first weeks, while the first fences and guards go in). Later it falls under 10% of a much bigger income, and the pressure comes from Delivery Raids, the Syndicate and the siege instead.
- **Lottie's Cookie Jar**: if you'd go bankrupt, Lottie bails you out (Laid Back: always; Classic: once per act, or once per season in Sandbox and Endless; Cutthroat: never).
- Bankruptcy: cash below $0 at end of day → "In the Red" with 3 days to fix it (sell, borrow). Otherwise: Game Over ("Squeezed Out"); the campaign reloads the last dawn autosave.

Pacing targets (Classic, a competent player, about 8 real minutes per day including pauses):

| Milestone | Target day | About |
|---|---|---|
| First upgrade to L2 | Day 5 (the upgrade lesson) | 40 min |
| Rank 2 | Day 5 (the Rank lesson) | 40 min |
| Rank 3 | About Day 10 | 1.3 h |
| Rank 4 | About Day 22 | 2.9 h |
| Rank 5 | About Day 37 | 4.9 h |
| Rank 6 | Days 52–58 | 7–7.7 h |
| Rank 7 | Days 71–80 | 9.5–10.7 h |
| Rank 8 | Days 95–105 | 12.7–14 h |
| Rank 9 | Days 125–135 | 16.7–18 h |
| Domination | About Days 140–150, not before 136 | 18.7–20 h |
| Rank 10 | After victory, about Days 150–160 | 20–21 h |

Laid Back runs about 14% faster (×0.86 of Classic's days); Cutthroat about 1% slower (×1.01), with 1.3–1.7× Classic's raids.

These targets are under review: the new pacing sweep reports to /mnt/project-files/gameplay-build/integration/pacing-sweep.txt.

## 17. Progression and automation

Automation unlocks (calm play stays calm as the empire grows): Auto-Restock (Day 2); Marisol's Auto-Price, bulk actions such as "upgrade every Kiosk I can afford" and Auto-Repair (Rank 3); Dex's Auto-Defend (Rank 4: auto-dispatch reinforcements, station guards by priority); raid templates (Rank 6); district policies (Rank 7: Profit, Fortify or Expand presets per district). Auto-Price also picks each stand's recipe card and Sweetness from the forecast; any stand can still be set by hand.

Lottie's Goals: 3 goals always on screen (short, medium, long), each with a small cash or perk reward.

## 18. Narrative

Premise: Summer in Citrine Bay. The drink trade has been carved up for 40 years by five "drink families" under an uneasy truce called the **Pitcher Pact**, enforced by the Sourwood Family. In the Sour Summer of '79, Vera Sourwood, then Lottie Puckett's best friend and business partner, stole 7 pages of Lottie's recipe book and ran her out of business. Now you, Lottie's grandkid, are spending the summer with her. She hands you her folding table, her pitcher and the 3 pages she has left. "When life gives you lemons, you take the whole town."

Cast:
- **Grandma Lottie Puckett** (78): mentor, recipe keeper, sharp tongue, warm heart. Tutorial voice and goal-giver.
- **The Grandkid** (player): default name Charlie Puckett; name, look and pronouns customizable.
- **Dex Moody**: lanky teen neighbor, first guard, becomes crew chief. Loyal, brave, terrified of geese.
- **Marisol Vega**: college student who keeps your books; dry humor; money and loans advisor.
- **Skip Larkin**: loud-blazer realtor; land, auctions and buyouts advisor.
- **Benny Buzz**: fast-talking ad man; marketing advisor.
- **Sheriff Dolores Budd**: weary, fair, loves lemonade; issues Citations when your Reputation tanks.
- **Mayor Gil Fontaine**: smarmy, in Vera's pocket.
- **Captain Squawk**: Lottie's lemonade-thieving pet seagull, your scout (Gull Flight).
- The five bosses (section 13).
Places: Lottie's Corner, Dot's Diner (neutral ground; Dot serves pie and keeps the peace), the Hiring Hall, Citrine Bay Market, Town Hall and the Registry of Deeds, the First Bank of Citrine Bay, the Citrine Bay Bugle, radio station 101.5 The Squeeze.

Acts (campaign; ranks and days are targets):
1. **Lottie's Corner** (Maple Row → Old Town; Days 1–15; Ranks 1–3). Learn the trade. Day 3: a Sourwood Steward kicks over your table as "a reminder" — Lottie: "Well. Guess she remembers me." First fence, Dex joins, first marketing. Day 3: Lottie sells you the side lot by the Corner for $300, table included (your second stand). Climax: the Summer Fair taste-off in Old Town against Brock Bodine; you win Strawberry, Brock swears revenge.
2. **Surf & Turf** (The Boardwalk; Days 15–40; Ranks 3–5). Clubs, bigger raids (the first raid on you came in Act 1, on Night 3), Kiosks, Boardwalk war. Climax (Rank 5): the Blend Shack falls to the first HQ assault or a Faction Buyout. Brock retires to run a surf school.
3. **Grounds for Revenge** (Campus & Arts; Days 40–60; Ranks 5–6). Someone keeps spoiling your stock. Lookouts, sabotage, night defense. Twist: Juni was paid by FizzCo. Take or buy out the Grindhouse (Rank 6); Juni turns informant.
4. **Fields & Fizz** (The Groves, Downtown, The Harbor; Days 60–105; Ranks 6–8). You need Fields for a helipad and Docks for a pier. Tilly Hollis can be beaten or bought out from Rank 7 (she respects hard work), but not before this act's County Fair has run its Taste-Off; until then she won't go bust either, and if she has been in the red for a week by then she folds at the first dawn after the Fair. FizzCo fights with money, lawyers and muscle. First helicopter VIP, first ship. FizzCo Tower falls (Rank 8).
5. **The Big Squeeze** (Hilltop Estates; Days 105–150; Ranks 8–9). It opens with the Hilltop estate auction, where Lavender is won (about $1.5M, roughly a day's income at Rank 8). Two weeks in, Vera forms the Syndicate with whoever is left and the Mayor, and its first boss-led strike hits 2–3 of your plots that night. Harbor Fest (Fall) brings a VIP rush while Syndicate crews go after every delivery. From Rank 9, when ready, you Call the Big Squeeze: a 7-day siege, then the assault on Sourwood Manor. Each siege dawn the Corkboard names that night's 2–3 Syndicate targets; each night you hold them all knocks 10% off the Manor Gate (5,000 HP, down to 1,500 after 7 good nights) and benches one of the Yard's henchmen; each plot you lose adds a Steward to the Boss Room. In the Boss Room, Lottie and Vera face off; the Secret Reserve page reveals the secret ingredient was a pinch of salt and "a friend to share it with." The old friends make up over a glass.
Epilogue: **Endless Summer** — you own the Bay; keep playing.

Endings vary by playstyle: mostly buyouts and high Reputation → "The Bay's Beloved Lemon Mogul"; mostly HQ assaults and smashing → "The Iron Pitcher." The Bugle's final front page and Lottie's last line change.

Writing tone: warm, punny, quick. At most one pun per line. Mob-movie lines delivered by grandmas, teens and surf bros. Sample voices — Lottie: "Sugar's cheap. Respect costs extra." Vera: "Lemonade is a family business, dear. And you're not family." Brock: "Bro. Your stand is in my sun." Juni: "We don't smash. We curate decline." Preston: "Let's circle back to you being out of business." Tilly: "Y'all are on my land. It's all my land."

## 19. Modes, winning and losing

- **Story Campaign** — 5 acts on the hand-made Citrine Bay map; the last act and its finale are called The Big Squeeze.
- **Sandbox: Turf War** — pick map size (Small: 4 districts and 2 rivals; Medium: 6 and 3; Large: 8 and 5; Huge: 10 and 5 with generated layouts), rivals, difficulty and win condition (Domination, Economic: reach a Success Score target, or none). Peaceful toggle here.
- **Endless Summer** — no end; play for Peak Success Score. Starts after any victory ("keep squeezing") or as its own mode. An **Out-of-Towner** faction arrives 14 days after victory and then every 30 days, buying into your thinnest district to keep pressure on. Version 1 ships one: **Snootwater Springs**, a snooty bottled-water chain that fights like Brock's Bros under its own look; more (such as the Kombucha Kollective) are a stretch goal.
- **Challenges** (stretch): short scenarios such as "Heat Wave Hustle: earn $50,000 in 7 days," "Siege of Maple Row: survive 10 nights," "Clean Hands: take Downtown without a single raid."
- **Domination victory ("You Own the Bay")**: every rival eliminated AND Majority control (51%+) in every district. The map paints itself yellow. A 100% "Every Last Plot" achievement exists for completionists.
- **High score**: Peak Success Score (local leaderboard; online is stretch). An "Ironman" save option (one autosave) for leaderboard runs.
- **Loss**: bankruptcy after 3 days In the Red with no Cookie Jar left, or Run Out of Town (no stands left and not enough cash for a new one).

## 20. Events and the living world

Calendar events: Summer Fair (Old Town, Summer week 2, taste-offs; in the first year its Day 14 taste-off is Act 1's climax), County Fair (the Fairgrounds in The Groves, Fall week 1, a harvest fair with taste-offs; its Act 4 edition, Days 71–77 on target pacing, is where Tilly can be won over), Surf Contest (Boardwalk), Founders' Day fireworks (Summer), Campus Homecoming (Fall), Harbor Fest (Fall; VIP bonanza), Winter Lights Market (Old Town), the Spring Marathon (joggers), Election Day (Spring; a new Mayor can change citation rules).
Random events: Heat Wave (3 days), Lemon Blight (lemons ×2 for 5 days), Sugar Shortage, Viral Video (one stand ×2 traffic for 2 days), Food Critic visit, Health Inspection, Power Outage (no ice machines), Storm, late-game Hurricane (structure damage), Celebrity Sighting, Parade Route, Roadworks (−50% traffic on a street), Tourist Bus, Captain Squawk steals a lemon delivery, Kids' Lemonade Day (adorable kid stands pop up; raiding them is a big Reputation hit and Lottie is ashamed of you).
**Taste-Offs**: non-violent duels at both fairs, the Summer Fair and the County Fair. Pick a recipe, sweetness and price to match the judges' hints. The winner, you or a rival, gets a $500 prize, +0.1 Reputation star and +20% traffic in that district for a week. Out-brew Tilly at the County Fair and she sells you any of her Fields at 1.5× land value.

## 21. Player experience (screens and views)

- One continuous **Tycoon Camera**: zoom from the whole bay (Bay View, every plot tinted by owner) down to street level (Street View: customers queuing, guards patrolling, brawls). Rotate in 90° steps or freely.
- **Gull Flight**: fly Captain Squawk over the bay (built with Owl World's flight-camera technique). Scout rival plots (reveals defenses for 3 days), watch helicopter and ship arrivals, photo mode. Optional except one tutorial scouting mission.
- Screens: Morning Bugle (dawn news, forecast, market prices, offers), Ledger (daily profit and loss, charts), Stand panel, Crew roster, Raid Planner, Rivals Corkboard (photos and string), Order Book (contracts), Land Registry (plots, auctions, buyouts), Rank and Perks, Lottie's Goals.
- HUD: top bar with Cash, Success Score and Rank badge, Reputation stars, Threat lemons, day, time, season, weather, speed. Left: alert feed. In-world markers only: price tags, queue counters, mood bubbles, HP bars, raid arrows, owner tint.
- Onboarding: one new idea per day in Act 1 (Day 1 price, with Lottie's free stock; Day 2 recipes, weather and the Market, where you pay for your own supplies from now on; Day 3 the Steward incident, the Picket Fence and Lottie's $300 side lot, before Night 3's first raid; Day 4 Dex; Day 5 upgrade and Rank; Day 6 marketing; Day 7 buying land). Panels appear only when their system unlocks.
- The story is put in front of you from minute one (2026-11-08): Lottie's opening tour tells it in five beats (Vera stole her recipes; five drink gangs run the bay; the nearest gang wants this corner; beat Brock at the Summer Fair on Day 14; then all five, and the recipes come home). The **boss board** in the top bar shows the five bosses, crossed out as each falls, the next one ringed, and the days to the Fair in Act 1. Brock phones on Day 1 and taunts from then on.
- **Day calls** (2026-11-08): one decision on Day 1 and two on every later business day break in at your stands, and the clock waits for your pick. Each choice costs cash, customers, Reputation or a gang's Grudge: a rival undercuts you (cut your price, pay for free samples, or lose walkers), a rival kid heckles your line (pay him off, chase him off for more Grudge, or lose walkers), a thirsty rush (raise the price or keep it fair for Reputation), Sheriff Budd's permit check (pay the fee or gamble on a fine), and a rumor of tonight's raid (rush a fence in at 1.5× its price, post a guard, or bring it on; the rumored rival comes). Numbers in balance-tables.md.
- Every purchase shows its price on the button, and the cash jar drops a red "−$12" when you spend.
- The New Game screen says in one line what each mode and difficulty is.
- Accessibility: pause anytime, colorblind-safe faction colors plus patterns, text size, reduced motion, remappable keys, subtitles, every audio alert has a visual twin.

## 22. Art direction seeds (the art director expands these)

- Working style name: **Kitchen-Table Clay** (replaced Toy-Town Noir on 2026-11-06). Citrine Bay is a plasticine model the grandkid built on Grandma Lottie's kitchen table: a strata-sided clay plinth on a gingham oilcloth, thumbprinted clay, glossy resin water, cardstock awnings and signs, matchstick fences, popsicle-stick structures, masking-tape labels, tilt-shift depth of field. By night the kitchen light goes out, and the desk lamp, amber streetlights, lit windows and string lights carry the scene.
- Faction color and pattern seeds: Player — Lemon Yellow #F6D33C and white stripes. Sourwood — Plum #5B2A6E and Gold #C9A227, diamond damask. Hollis — Tea Amber #B5651D and Gingham Red #D64545, gingham check. FizzCo — Cola Red #C8102E and Chrome #B8C2CC, bubble dots. Cold Brew — Espresso #3B2A20, Oat #E8DCC4 and Neon Pink #FF4FA3, zigzag. Blenders — Mango #FF9F1C and Lagoon Teal #00A6A6, waves.
- World palette seeds (clay): Clay cream #FFF1D6, Lemon clay #F7C948, Flock green #7CC47F, Resin teal #3BB4C1, Terracotta #E8704F, Walnut #8B5E3C, Plum ink #2E2A4F, Lamp amber #FFB55E, Blush pink #F4A3B5. Bold, saturated and playful; owners stay the boldest.
- Characters: clay figures about 2 heads tall (big sphere head, lathe-turned body, arms and legs, bead eyes with a glint, clay-snake brows, a real nose, blush thumbprints). Each family has its own body shape and gait (Sourwood stilt-thin glide, Hollis barrel roll, FizzCo block march, Cold Brew slouched bean on a skateboard, Blenders V-shaped hop), so it reads by silhouette and motion; hats and props carry identity.
- Motion: stop motion on twos (12 fps) with a slight boil; the camera, water and UI stay smooth. Squash before every action, one bounce after.
- HUD: what's lying on the table (coin jar, pitchers, chalkboard price, sugar cubes, lemon bowl, sugar bag, ice tray, egg timer, sticky note, a big round clay OPEN button). Type: Chewy, Fredoka, Gochi Hand. Icons: chunky clay blobs with a sheen, a thumbprint dimple and a plum ink edge.
- Brawls: a cartoon dust cloud of clay puffs with flying stars, lemons and comic sound words (BONK, THWACK, CHOP, SQUISH). KO = squashed flat, spiral eyes, stars, a wobble home.
- Logo motifs: pressed-clay medallions and vintage citrus-crate labels made in clay (every faction's logo is a crate label).

## 23. Music seeds (the music director expands these)

- Working style: **Surf-Noir Lounge** — breezy surf guitar, bossa and lounge by day; spy-movie walking bass, brushed snare and muted trumpet by night and in raids.
- **Lottie's Theme**: a whistled ukulele-and-glockenspiel melody that gains instruments with every rank (10 arrangement layers by Rank 10).
- Faction leitmotifs: Sourwood (harpsichord and string quartet waltz), Hollis (banjo, fiddle, slide guitar), FizzCo (fizzy synth-pop jingles), Cold Brew (lo-fi jazz with vinyl crackle), Blenders (surf rock with party horns).
- Diegetic radio **101.5 The Squeeze**: a DJ comments on the day's news; your M3 jingle airs there.
- The ships' horns play the first 3 notes of Lottie's Theme.
- Adaptive layers: district bed, business intensity, raid alert stinger, brawl loop, night variation, rain variation, Threat tension layer, rank-up fanfare, victory and defeat stingers.

## 24. Scope tiers

- **MVP (prove the fun)**: 3 districts (Maple Row, Old Town, The Boardwalk), 2 rivals (Blenders, plus a light Sourwood presence), stands L1–L5, 3 starting recipes, weather and seasons, supplies with Auto-Restock, pricing, M1–M3 and 2 local campaigns, buying land, Knock it down / buy it up, P1–P4, 3 gadgets, fists/clubs/hatchets, raids (Smash, Shakedown), auto-battle defense with warnings, Success Score and Ranks 1–7, Threat 1–4, one Field plot with a Helipad and one Dock plot with a Pier (basic VIP orders), Domination and Endless, Classic and Laid Back, a short tutorial.
- **Version 1**: the full 8-district campaign, all 5 rivals and the story, all recipes, Sit-downs and buyouts, auctions, specialists, all gadgets, Reputation features (citations, events), contract tiers up to Ships, Bottling Works and Warehouses, events and festivals, one Out-of-Towner in Endless, the Bugle and radio, all automation, Lottie's Tips perks, Sandbox, Cutthroat, Gull Flight, full art and music.
- **Stretch**: Mega contracts, more Out-of-Towners in Endless, Challenges, generated maps, online leaderboards, async "rival empire" multiplayer, defeated bosses as advisors, Franchise prestige (start a new town with Legacy perks), photo mode, mod support.

## 25. Build-facing design decisions (no tech stack; these are design commitments the build must honor)

1. **Camera**: both. The Tycoon Camera is the main way to play (angled top-down, zoom from the whole bay to street level). Gull Flight (Captain Squawk) is built with Owl World's flight-camera technique, for scouting, arrivals and sightseeing; it is never required beyond one tutorial mission.
2. **People on screen**: Street View shows at most about 150 animated people at once on a laptop and about 60 on a phone (customers, crew and henchmen). Visible walkers stand in for the simulated crowd (at busy times one walker represents several simulated customers). Fights show at most 24 fighters per side on a laptop and 12 on a phone; extra fighters join the dust cloud. The busiest phone view should stay within Owl World's busiest phone view (about 130 draw calls and 355k triangles).
3. **Rivals are always AI** in the campaign, Sandbox and Endless. Online features are limited to optional leaderboards (stretch). Async "rival empire" multiplayer is a stretch goal the AI design should not rule out.
4. **Menus are screens, not 3D props**: every management screen is a flat 2D panel over the world, styled like kitchen-table props in clay and card (ledger, newspaper, corkboard, deeds). In-world UI is limited to small floating markers.
5. **Deterministic, tick-based simulation**: 1 tick = 1 in-game minute; all randomness comes from a per-run seed; the world you see is a view of the simulation. The whole economy and rival AI can run with no graphics, fast-forwarded, for balancing and automated tests. (This spec's economy numbers were checked that way.)
6. **Saves**: autosave every dawn (3 rotating) plus manual slots; every save carries a format version and migrates forward so play-forever runs survive updates; Ironman option keeps a single save.
7. **Devices**: a typical laptop first (mouse or trackpad plus keyboard shortcuts), phones second with lower visual quality (fewer walkers, simpler light) and touch controls. Every screen works at phone width. A day is a natural stop point, and the game can be resumed mid-day.
8. **Borrow from Owl World (code and techniques only, never its world)**: how it builds terrain, sky, water, roads, crowds, ships, aircraft and its flight camera. The map, Citrine Bay, is designed fresh for this game, as big or small as its 8 districts and 116 plots need; nothing about Owl World's geography, scale or layout binds it. The ship and aircraft techniques become the ship clients and the helicopter clients (and the look of the helipads).

## 26. Writing rules for the doc (every writer)

- Your section starts with `## <Heading>` (the heading you were given), then a lead sentence that states the point (a decision or rule with a number), never "This section describes…".
- Sentences under 25 words. Paragraphs of 3 sentences at most. Plain words. Bullets only for parallel items. No emoji.
- Specifics over adjectives: numbers with units, names, examples.
- Items with several attributes go in a pipe table (row per item, units in headers). Use `###` subheadings to break up long sections.
- Each mechanics section ends with a line that starts `**Fun check:**` — one or two sentences naming what makes this system fun and the guardrail that keeps it from becoming a chore or frustrating.
- Use the canon names exactly. Never mention a tech stack, engine, library, programming language or code. (Section 25's design commitments are fine to reference in plain words.)
- Do not name existing commercial games or real brands. Keep everything original.
- Prices like $1,500. Times in game hours or days. Stars like 3.5 stars.
- Don't restate big tables owned by another section; refer to the section by name ("see Stands"). Appendix A holds every tuned number.
