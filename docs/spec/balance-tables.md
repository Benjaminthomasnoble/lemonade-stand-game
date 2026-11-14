## Appendix A: Balance tables

Every number below is final for version 1, checked by a 170-day simulation that takes a competent Classic player to Rank 9 on Day 135 and Domination on Day 143 on the reference map (Domination on Days 131–146 across ten shuffled maps).

Dollars are game dollars, days are game days, and "×" multiplies a base value.

### Stands

| Level | Name | Rank | Cost ($) | Draw (traffic ×) | Service (cups/hour) | Top price ($/cup) | Stock (cups) | Upkeep ($/day) | HP | Guard posts | Typical payback (days) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| L1 | The Folding Table | 1 | 150 to build new | 1.0 | 20 | 1.50 | 300 | 5 | 100 | 1 | — |
| L2 | The Wooden Stand | 1 | 400 | 1.5 | 50 | 2.00 | 750 | 15 | 300 | 2 | 2–4 |
| L3 | The Kiosk | 3 | 3,500 | 2.3 | 120 | 3.00 | 1,800 | 60 | 800 | 3 | 4–7 |
| L4 | The Lemon Shack | 5 | 60,000 | 3.5 | 300 | 4.50 | 4,500 | 300 | 2,000 | 4 | 4–11 |
| L5 | The Citrus Palace | 7 | 650,000 | 5.0 | 700 | 7.00 | 10,500 | 1,500 | 5,000 | 6 | 11–15 |

Costs are per upgrade step. Paybacks assume a suitable plot: any Street plot for L2–L3, a Prime or Landmark with about 1,800+ passersby a day for L4, and about 4,000+ for L5. Quiet plots pay back slower (an L4 on the Maple Row Landmark takes about 14 days).

Stock is the cups of lemons, sugar and ice a stand holds: a day and a half at full pour (10 selling hours). A restock never fills it past that. From L3 your stands' radios play 101.5 The Squeeze through business hours. From L4 your stands have an ice machine: it makes their ice as they pour, at the Market price, so none melts overnight and Auto-Restock buys none (a Power Outage stops it for the day).

### Stand specializations

| Slot | Opens at | Slot cost ($) |
|---|---|---|
| First slot | L3 | 2,000 |
| Second slot | L5 | 40,000 |

| Specialization | Effect |
|---|---|
| Express Window | +30% service (cups/hour) |
| Fancy Menu | +20% top price |
| Fortified Frame | +50% HP |
| Billboard Roof | +15% traffic to your stands within 2 plots |

### Marketing tiers (global, permanent)

| Tier | Name | Rank | Cost ($) | Traffic bonus |
|---|---|---|---|---|
| M1 | Hand-Painted Signs | 1 | 100 | +5% |
| M2 | Flyers & Sidewalk Chalk | 3 | 1,500 | +12% |
| M3 | Radio Jingle | 4 | 12,000 | +22% and a 2-day forecast |
| M4 | Billboards & TV Spot | 7 | 90,000 | +35%; unlocks the Billboard building |
| M5 | The Lemon Blimp | 8 | 500,000 | +50% |

### Local campaigns

| Campaign | Rank | Cost | Effect | Lasts |
|---|---|---|---|---|
| Sandwich-Board Kid | 2 | $40/day | +20% traffic at one L1–L3 stand | 1 day, renewable |
| Free Sample Day | 2 | 100 free cups, out of the stand's stock | +0.1 star; +15% traffic at that stand | 3 days |
| Sunny the Lemon mascot walk | 3 | $300/day | +25% traffic for your stands in one district | 1 day, renewable |
| Coupon Blitz | 4 | Prices −25% | ×1.4 appeal at your stands in one district, in place of what the cut would win on the price curve; it counts in the split with rival stands nearby | 1 day |
| Event Sponsorship | 5 | $2,000 per festival day left, today included | +50% traffic for your stands in the festival district | The festival |
| Billboard building | 7, once M4 stands | $25,000 to build, on a Street, Prime or Landmark plot of its own; 800 HP (placeholder) | Your stands within 2 plots +20% traffic for each Billboard; other owners' stands there −10% curb appeal, once however many Billboards reach them (placeholder) | Permanent |

A campaign planned at Morning Prep runs today; one planned while the stands are open is booked for tomorrow and paid now, and a booking that can't start (the stand was lost, smashed or grew past L3 for the Sandwich-Board Kid, no stock for the samples, a Cease-and-Desist landed) is called off and its money comes back. There is one Sunny, so the mascot walks one district a day, and one Free Sample Day runs at a time across your stands. A Sandwich-Board Kid already at work on a stand that grows to L4 runs out its day but adds nothing (no refund). A Free Sample Day's cups go on the Ledger's Marketing row at their cost. A Wrecked Billboard counts for nothing until it's rebuilt. Word of Mouth (Campus & Arts at Full Control) halves every local campaign: see Demand constants.

### Perimeter tiers (per plot; each replaces the last)

| Tier | Name | Rank | Cost ($) | HP | Effect | Repair after a raid ($) |
|---|---|---|---|---|---|---|
| P1 | Picket Fence | 1 | 150 | 150 | Slows the breach | 15 |
| P2 | Chain-Link Fence | 2 | 1,200 | 500 | Defenders fight through it | 120 |
| P3 | Sharpened Stakes | 4 | 6,000 | 1,200 | Attackers take 2 damage/second while breaching | 600 |
| P4 | Barbed Wire | 6 | 25,000 | 2,500 | 4 damage/second; attackers 30% slower | 2,500 |
| P5 | Citrus Fortress Wall | 8 | 100,000 | 5,000 | Defenders +25% damage (+50% total) | 10,000 |

Defenders get +25% damage while any perimeter stands. Repairs run overnight and cost 10% of the tier's price after each raid on that plot, and a sprung Lemon-Peel Slick is re-laid the same night for its fee. Both come out of your cash and wait while you can't pay. From Rank 3 they pass over the plots on Auto-Repair's skip list (unless a Fortify policy holds the plot), which you patch by hand. They don't keep back the wage and loan reserve that Auto-Repair's fixes keep: whether they should is an open call for Ben.

### Gadgets (2 slots per plot, a 3rd at L4)

| Gadget | Rank | Cost ($) | Effect |
|---|---|---|---|
| Tin-Can Alarm | 2 | 100 | +15% detection |
| Guard Goose ("Honkers") | 2 | 400 | +15% detection; stuns the first attacker for 3 seconds |
| Lemon-Peel Slick | 4 | 250, plus 25 per nightly reset | First 3 attackers stunned for 4 seconds |
| Sprinkler Ambush | 4 | 800 | Soaked attackers deal 20% less damage |
| Floodlights | 5 | 1,500 | Cancels the night stealth bonus |
| Watchtower | 6 | 5,000 | +30% detection; sees 2 plots out; reveals raid makeup |

Detection = 50% base, plus the plot's own gadgets and a Watchtower on it or on one of the owner's plots within 2 (+30%, once however many reach it). On your plots add a Lookout posted there (+25%, once), an Eagle Eye guard there (+10%), Neighborhood Watch (+10%, with a free Tin-Can Alarm on each Maple Row plot of yours that has none, taking no slot), a Stronghold in the district (+10%, placeholder) and Lottie's Nosy Neighbors tip (+10%). Cap it at 95%, then take off 25% at night without Floodlights and 25% for a Sneaky raider (once per raid); it never goes below 0% (placeholder). A rival raid's lookouts take 10% each off that, though never below 5% on their own (see Raids), and Cold Brew's Night Shift takes 25% more off at night, Floodlights or not.

### Weapons and padding (bought per guard)

| Item | Rank | Cost per guard ($) | Hit | Chop | HP bonus | Damage taken |
|---|---|---|---|---|---|---|
| Fists | 1 | 0 | 10 | 5 | — | ×1.0 |
| Clubs | 3 | 150 | 18 | 10 | — | ×1.0 |
| Hatchets | 6 | 1,200 | 24 | 40 | — | ×1.0 |
| Padded Vest | 3 | 200 | — | — | +40 | ×1.0 |
| Pro Gear | 6 | 1,500 | — | — | +100 | ×0.8 |

### Guards by level

| Level | Name | Hire fee ($) | Wage ($/day) | HP, Hit and Chop |
|---|---|---|---|---|
| 1 | Rookie | 50 | 15 | Base |
| 2 | Regular | 150 | 25 | +10% |
| 3 | Veteran | 400 | 40 | +20% |
| 4 | Elite | 1,000 | 60 | +30% |
| 5 | Legend | 2,500 | 90 | +40% |

Guards gain about 1 level every 35 days of duty; fights and the Training Yard speed this up. Dex Moody joins free on Day 4. Unpaid guards quit. More crew rules are in Crew.

### Clubhouse and squads

| Clubhouse | Rank | Cost ($) | Beds | HP | Extra |
|---|---|---|---|---|---|
| None | — | — | 2 ("Dex sleeps in the shed") | — | — |
| L1 | 2 | 2,000 | +6 | 800 (placeholder) | — |
| L2 | 5 | 15,000 | +12 | 2,000 (placeholder) | Training Yard |
| L3 | 7 | 80,000 | +24 | 5,000 (placeholder) | Infirmary |

Training Yard (L2 and L3): each dawn, a guard who waited at the Clubhouse all day (off post, not Out, not on a raid) earns a day of duty's XP, 1/35 of the way to the next level (placeholder). Infirmary (L3): while one stands, every knockout is Out 1 day less, never below 0 (fit again at the next dawn). Guards waiting at a Clubhouse are your reserve for Ring the Bell (see Combat).

| Rank | Raid squad cap (guards) |
|---|---|
| 3 | 5 |
| 5 | 8 |
| 7 | 12 |

A Clubhouse uses one Street plot. You may own several. Early in Act 2 (from Day 15) Dex pushes for a first Clubhouse and a squad to fill it; the simulated player builds it on Days 15–19 (the target). Today's sim misses it: `npm run sim -- 20` has $1,955–$2,092 at those dawns against the $2,306 for a Street plot and the Clubhouse. Whether to retune Act 2's cash or move the window is an open call for Ben.

### Crew

#### Hiring, pay and levels

| Rule | Value |
|---|---|
| Hiring Hall | From Rank 2: 6 recruits to pick from, a fresh list every 7 days (Lottie's Help Wanted tip adds 1) |
| Roster | 2 beds without a Clubhouse, plus every Clubhouse's beds |
| Payday | Each dawn, guard by guard in roster order, the Loyal paid last. Wages never take cash below $0: an unpaid guard quits, and a Loyal one stays on unpaid |
| Duty | Each dawn on post, a guard earns 1/35 of the XP to their next level: about 1 level every 35 days |
| Fight XP | 2 for a win, 1 for a loss (×1.5 with Lottie's Quick Study tip) |
| XP to reach L2 / L3 / L4 / L5 | 3 / 8 / 15 / 25 in all (placeholder) |
| Guard posts | A stand's by its level (see Stands); 3 on a facility, a Clubhouse or an HQ; none on a bare lot |

A recruit's level by your Rank (placeholder; the Hall opens at Rank 2):

| Your Rank | L1 | L2 | L3 | L4 | L5 |
|---|---|---|---|---|---|
| 2 | 75% | 25% | — | — | — |
| 3 | 55% | 30% | 15% | — | — |
| 4 | 40% | 30% | 20% | 10% | — |
| 5 | 30% | 30% | 25% | 10% | 5% |
| 6 | 20% | 30% | 25% | 15% | 10% |
| 7 | 15% | 25% | 30% | 20% | 10% |
| 8 | 10% | 20% | 30% | 25% | 15% |
| 9 | 10% | 15% | 30% | 25% | 20% |
| 10 | 5% | 15% | 30% | 25% | 25% |

#### Specialists and traits

From Level 3 a guard can take one specialty, for good. Promotion is free (placeholder).

| Specialist | Rank | Effect |
|---|---|---|
| Lookout | 4 | +25% detection on the plot where posted (several don't stack). Scouts a rival plot by day, off post through the business day; what they saw stays good for 3 days, as does a Gull Flight's look (Squawk circling a rival plot). Can lead a Sabotage |
| Wrecker | 4 | +50% Chop, on top of a Lumberjack's (×2 for both) (placeholder) |
| Captain | 6 | The whole side gets +20 Nerve and +10% Hit, once however many Captains |

| Trait | Outside the brawl |
|---|---|
| Eagle Eye | +10% detection on the plot while they're there |
| Sneaky | −25% to the target's detection on your raid (once per raid, after the 95% cap); can lead a Sabotage |
| Loyal | Paid last and stays on unpaid; a Loyal guard a rival holds walks home, and a Loyal henchman you nab won't switch sides |
| Smooth Talker | Brought to a Sit-down as your negotiator: 15% off a Truce, a Plot Buyout or a Faction Buyout (placeholder) |
| Gentle Giant | A daytime raid by Gentle Giants alone costs no stars |

The traits' fight numbers are in Combat.

#### Your raids

| Rule | Value |
|---|---|
| Raids | From Rank 3, on a rival stand or facility in a district where you hold a Foothold (a plot of yours); the squad cap is in Clubhouse and squads |
| Sabotage | From Rank 4, led by a Lookout or a Sneaky guard: the stand's stock spoils and it can't sell its next day |
| A raid tonight | Sets out at 01:00 (placeholder) and travels by distance (see Raids); the Planner guesses a 20-minute fight for the trip home (placeholder) |
| Raid Planner odds | The raid fought 80 times (an HQ Assault 24 times), each with its own detection roll (a raid that's seen loses its first strike and meets the rival's help). On a plot nobody has scouted they show a range: the plot's own kit row's fence and gadgets with every post filled, from that row's henchmen to the next row's (a level up on the top row) |
| Raid templates | From Rank 6: up to 3 saved squads and objectives for one-tap repeats (placeholder) |
| Grudge | A raid of yours adds 20 Grudge with that rival when it wins, 8 when it fails |
| Daytime raids | A raid fought 08:00–20:00 (Morning Prep and the Evening count as night) costs 0.1 star, 0.2 for a Smash or an HQ Assault; nothing when the squad is all Gentle Giants. A raid tonight that gets there after 07:00 waits for the stands to open and is fought by day |
| Sheriff Budd's Citation | A daytime raid you launch below 2.0 stars: a fine of the last 7 days' average daily sales (never more than your cash), and no raids or HQ assaults for the rest of the day and 2 days more. It calls off your raids that haven't set out; a squad already on its way carries on (placeholder) |
| Election Day | Spring Day 12 (placeholder). Mayor Fontaine wins on one of three platforms, drawn by weight: the same rules (weight 2, Citations below 2.0 stars), "Order in the Bay" (weight 1, below 2.5) or "Let Kids Be Kids" (weight 1, below 1.5), for a year (56 days). Each Citation in the last year adds 1 to "Order in the Bay"'s weight (placeholder) |

### Combat

A fight runs in quarter-second ticks from contact, when the raiders reach the fence (or the guards, or the stand). One fight-second is one game minute, and a fight plays at 1 game minute per real second. Every swing lands for exactly its Hit or Chop times the multipliers below, and everyone swings at the nearest enemy. Nobody dies: a fighter at 0 HP is knocked out. The same rules run when you raid a rival and when a rival raids you. `npm run combat` measures the checks at the end of this section.

#### Fighters and traits

| Fighter | Value |
|---|---|
| Every fighter, guard or henchman | 100 HP, Nerve 50, a swing every 1.5 s (the first at contact) |
| Each level above 1 | +10% HP, Hit and Chop (see Guards by level) |
| Speed | 1/3 plot-length a second (placeholder) |
| Ground | Reach 0.12 and shoulder room 0.1 plot-lengths (placeholders); the perimeter stands 0.4 out from the stand, guards with no perimeter hold at 0.2, and the stand is 0.5 wide |

| Trait | In a fight |
|---|---|
| Tough Cookie | HP ×1.2 |
| Gentle Giant | HP ×1.5, Hit ×0.7 |
| Hothead | Hit ×1.15, Nerve −20 |
| Night Owl | Hit and Chop ×1.25 at night |
| Lumberjack | Chop +50% (with a Wrecker's +50%, Chop ×2) |
| Sprinter | Speed ×1.25 |
| Butterfingers | Once a fight, a 10% chance the weapon slips on one of the first three swings; they finish on fists |
| Goose Whisperer | The Guard Goose stuns the first 2 raiders instead of 1 (never more than 2) |
| Former Rival | +10% Hit and Chop against their old faction: its plots, its raids on you and its HQ |
| Loyal | Hostile Takeover can't turn them |

Eagle Eye, Sneaky, Smooth Talker and the rest of Loyal work outside the brawl (see Crew).

#### How a fight runs

| Rule | Value |
|---|---|
| Breach | Raiders chop the perimeter first; while it stands they can't reach the guards or the stand |
| Fence line | Defenders deal +25% damage while any perimeter stands (+50% behind a Citrus Fortress Wall) |
| Barbed Wire | Raiders within 0.1 plot-lengths of the fence line (placeholder) move at 70% Speed, standing or cut |
| First strike | An undetected raid: +25% on every swing and chop for the first 5 s |
| Guard Goose | Stuns the first raider to arrive for 3 s (the first 2 with a Goose Whisperer on the plot) |
| Lemon-Peel Slick | Stuns the first 3 raiders to arrive for 4 s |
| Sprinkler Ambush | Soaked raiders deal 20% less damage all fight |
| Nerve check | Once a side has lost half its fighters (rounded down; a side of one never checks), each one still standing rolls once and stays if a roll of 0–100 lands under their Nerve (+20 during a Rally); the rest run home |
| Captain | His whole side gets +20 Nerve and +10% Hit, once however many Captains |
| Shakedown or Sabotage | 10 game minutes at the till, once the perimeter is down and no guard is standing |
| Smash | The objective starts when the perimeter is down and no guard is standing; a stand not knocked down 60 game minutes after that is only Damaged |
| Raiders give up | At 120 fight-seconds, if they haven't reached the objective (placeholder) |
| Knocked out | Out 1 day, 2 after a hatchet KO; the Infirmary takes a day off (so does Lottie's Chicken Soup tip), never below 0. Rival henchmen stay on their plot's books and come back the same way |
| Nabbed | Each KO'd raider a beaten raid leaves behind is Nabbed 10% of the time (never a boss). A side that wins, Falls Back or holds the field when time runs out carries its KO'd home. A captive's ransom is their hire fee; releasing one gives +0.05 star; or recruit them as a Former Rival (a Loyal one refuses). A rival holds a guard of yours for 3 days (placeholder), then they go over to it (a Loyal one walks home) |

#### Commands and help

| Command | Rule |
|---|---|
| Rally | +20 Nerve for 10 s, every 30 s, either side |
| Fall Back | Once per fight: everyone standing retreats with the KO'd, nobody is left behind, and the fight is lost |
| Ring the Bell | Defense only, once per raid. The reserve at every Clubhouse in range sets out: 30 game minutes from the same district, 60 from a bordering one (placeholders), half that into a district where you hold a Stronghold (placeholder). Whoever arrives before contact starts in the fight; the rest join as they arrive and count in the Nerve check. A Captain in the bell party leads the guards on post too (rung mid-fight, only the guards who join) |
| Dex's Auto-Defend | From Rank 4. Dex rings the bell when a raid on you is warned, and each Evening posts the idle reserve, most seasoned first, by each plot's priority: 0 (the default, left to the bell) to 3 (placeholder) |
| A rival's help | A rival who spots your raid sends help from its other plots and its HQ in the same or a bordering district: half each one's fit garrison (rounded down), nearest first, capped by Threat at 0.3 / 0.3 / 2 / 2 / 3 henchmen, where a fraction is the chance of one (placeholders). They walk over at raid travel times (see Raids) |
| One fight at a time | One fight plays live. A raid on you that reaches its plot meanwhile waits at the edge and goes in as that fight ends; your own raids that land meanwhile are fought at once and replayed after |

#### HQ assaults

An HQ falls in three fights in a row: the Gate, the Yard and the Boss Room. The squad carries its HP from stage to stage; the KO'd and the runners are done for that assault, and a stall at any stage ends it and adds 30 Grudge. Unseen, the squad strikes first at the Gate, against the HQ's gadgets; past the Gate they know you're in. The Gate is a Smash on the Gate's HP. In the Yard and the Boss Room the squad must beat everyone in the room, then hold it for 10 game minutes, as in a Shakedown.

| HQ | Tier | Gate | Yard | Boss Room | Boss move |
|---|---|---|---|---|---|
| Blend Shack (Blenders) | 1 | 2,000 HP, 2 henchmen | 3 henchmen | Brock + 2 | Blender Rush at 0 s: the 3 guards nearest him are stunned for 4 s |
| Grindhouse (Cold Brew) | 2 | 2,750 HP, 3 | 6 | Juni + 2 | Espresso Shot at 0 s: her side swings and steps 50% faster for 10 s |
| Hollis Homestead | 3 | 3,500 HP, 4 | 4 | Tilly + 3 | Hay Bale Wall at 0 s: a 320-HP hay bale in front of 4 of your guards, who chop through it first |
| FizzCo Tower | 4 | 4,250 HP, 5 | 9 | Preston + 3 | Hostile Takeover at 6 s: 2 of your guards switch sides, unless they're Loyal |
| Sourwood Manor | 4 | 5,000 HP, 5 | 10 | Vera + 3 | Old Money: 3 Stewards join at 1 s (in the campaign, one more for each plot the siege took from you), and her cane disarms one guard at 3 s |

The tiers, Yard sizes, stage sizes and boss moves are placeholders, except the spec's 3 guards for Blender Rush, +50% for 10 s for the Espresso Shot and 2 guards for Hostile Takeover. A boss's move goes off only while the boss is standing. Gate and Boss Room henchmen fight at the HQ's tier and Yard henchmen a level higher (at most 5), with the home kit by level below. Old Money's Stewards are Level 5. In the campaign, Sourwood Manor opens once the Big Squeeze siege is over (see Raids): each night you held every target cuts its Gate by 500 HP (never below 1,500) and benches one Yard henchman.

| Henchman level | Padding | Fists / clubs / hatchets |
|---|---|---|
| 1 | None | 100 / 0 / 0% |
| 2 | None | 70 / 30 / 0% |
| 3 | Padded Vest | 30 / 70 / 0% |
| 4 | Padded Vest | 10 / 60 / 30% |
| 5 | Pro Gear | 0 / 50 / 50% |

| Boss | Value (placeholders) |
|---|---|
| HP | 2.5 × a guard's (250), × the tier scale |
| Hit | 8, × the tier scale |
| Chop, Nerve, padding, weapon | Chop 2; Nerve 200; damage taken ×0.8; clubs |
| Tier scale | 0.75 + 0.25 × the HQ's tier: ×1 at tier 1, ×1.75 at tier 4 |

A boss at the head of a Threat 5 raid on you is the same as in their Boss Room.

#### Measured by `npm run combat`

HQ assaults are fought at Morning Prep, which counts as night (Night Owls hit 25% harder), over 40 seeds.

| Check | Result |
|---|---|
| Threat 1 raid (3 fists) vs an undefended L1 | The raiders win 100% |
| Threat 1 raid (3 fists) vs a Picket Fence and 1 guard with fists, seen or unseen | The raiders fail 78% |
| Real Threat 1 parties (2–3 fists) vs the same | The raiders fail 92% |
| Threat 4 raids (8–12) vs a kitted L5 behind Barbed Wire (5 L1 guards with hatchets and Pro Gear; goose, slick and sprinkler) | The defense holds 80% |
| The same behind a Citrus Fortress Wall | The defense holds 100% |
| 5 hatchets vs Barbed Wire (2,500 HP) | Breached at 18 s |
| 5 clubs vs Barbed Wire | Breached at 73.5 s (about 74 s) |
| 12 clubs vs a Citrus Palace (5,000 HP) | Damaged at 60 s, 200 HP left |
| 12 hatchets vs a Citrus Palace | Smashed at 15 s |
| Blend Shack, 5 L2 guards with clubs | 83% |
| Grindhouse, 8 L2 guards with clubs and vests | 80% |
| Hollis Homestead, 8 L3 guards with hatchets and vests | 83% |
| FizzCo Tower, 12 L4 guards with hatchets and Pro Gear | 98% |
| Sourwood Manor, 12 L4 guards with hatchets and Pro Gear | 33% |
| Sourwood Manor, 12 L5 guards with hatchets and Pro Gear | 85% |
| Sourwood Manor after 7 good siege nights (Gate 1,500 HP, Yard 3), 12 L4 guards | 100% |

### Land prices and traffic by district

| District | Street passersby (per day) | Street land ($) | Special plots, land ($) | Price tolerance (×) | Borders |
|---|---|---|---|---|---|
| Maple Row | 250–400 | 600–1,200 | — | 1.0 | The Groves, Old Town, The Boardwalk |
| Old Town | 500–900 | 8,000–16,000 | — | 1.0 | Maple Row, Campus & Arts, Downtown, The Boardwalk |
| Campus & Arts | 450–800 | 12,000–24,000 | — | 0.9 | Old Town, The Groves, Hilltop Estates |
| Downtown | 800–1,500 | 60,000–120,000 | Industrial 20,000–40,000 | 1.15 | Old Town, Hilltop Estates, The Harbor |
| The Boardwalk | 700–1,400 | 12,000–24,000 | — | 1.2 | Maple Row, Old Town, The Harbor |
| The Harbor | 300–600 | 6,000–12,000 | Industrial 20,000–40,000; Dock 100,000–200,000 | 0.9 | Downtown, The Boardwalk |
| The Groves | 150–350 | 3,000–6,000 | Field 40,000–80,000 | 0.9 | Maple Row, Campus & Arts |
| Hilltop Estates | 300–600 | 240,000–480,000 | Field 120,000–240,000; Dock 300,000–600,000 | 2.0 | Campus & Arts, Downtown |

| Plot type | Traffic (× Street) | Land price (× Street) |
|---|---|---|
| Street | ×1 | ×1 |
| Prime | ×3 | ×3 |
| Landmark | ×5 | ×8 |
| Field, Dock, Industrial | Tiny | See table above |

Lottie's Corner starts at $300 land value with 400 passersby a day; Lottie's side lot next to it (sold to you on Day 3) is also worth $300 and gets 300 passersby a day. Buying rule: Maple Row from the start, Old Town from Rank 2, other districts from Rank 3 through a Foothold or a bordering Foothold.

### Land, repairs and loans

| Rule | Value |
|---|---|
| Land appreciation | Value × (1 + development); development = district stand levels ÷ (4 × purchasable plots), capped at 1 (so up to ×2) |
| Facility development | Each facility tier counts as 2 stand levels |
| Majority land discount | −10% |
| First Dibs (after your Smash) | 100% of land value, 24 game hours |
| Fire Sale (rival eliminated, by capture, buyout or 7 days bankrupt) | Every plot the rival held: you get First Dibs at 75% of land value for 2 days (2 full days when it falls in the Evening or at night), then auction |
| Plot Buyout from a rival | 2.5× land value in their home district, 2× elsewhere, × (1 + their Grudge/200), +0.2 more for the Sourwoods (placeholder) |
| HQ Assault (rival Weakened) | Each HQ from its own rank: Blend Shack 5, Grindhouse 6, Hollis Homestead 7, FizzCo Tower 8, Sourwood Manor 9 (the Big Squeeze). The same rank opens that rival's Faction Buyout |
| Weakened (needed for HQ Assault and Faction Buyout) | Any one of: the rival holds 40% or less of its peak plots; its Net Worth is under 25% of yours; your daily sales (cups and bottles, in dollars) were at least 2× theirs for 7 days in a row |
| Faction Buyout (rival Weakened) | Opens at that rival's HQ rank: Brock Rank 5, Juni 6, Tilly 7, Preston 8. 1.5× the rival's cash and buildings (Brock, Tilly); 1.8× (Juni, Preston, who haggle: they counter at 2.1× and never sign below 1.8×; see Rivals); land is not included and goes to the Fire Sale. Vera never sells in the campaign; in a Peaceful Sandbox she sells at 3× once Weakened |
| Rebuild a Wrecked building | 15% of what was invested in it, within 24 game hours (you and rivals alike) |
| Repair a Damaged building | 15% of what was invested × the share of HP lost (never more than a rebuild) |
| Busted repair (Laid Back) | 10% of what was invested |
| Loans (First Bank of Citrine Bay) | Up to 50% of non-cash Net Worth; 3% interest per week; 4-week terms |

There is no property tax and no insurance: cheap rebuilds take their place.

### Supplies and recipes

| Supply | Cost per cup ($) | Notes |
|---|---|---|
| Lemons | 0.10 | Spoil after 3 days |
| Sugar | 0.03 | Keeps |
| Ice | 0.03 | Melts nightly |
| Cup and napkin | 0.05 | Flat |
| Bottle and cap | 0.15 | For contracts; replaces the cup |

Lemon, sugar and ice prices move ±20% a day at the Citrine Bay Market. The Market and Auto-Restock open on Day 2; Lottie stocks your table on Day 1 only. A pitcher is 10 cups (Day 1's lesson is to sell out your first). Every card pours the same stock, half a lemon, a scoop of sugar and 3 ice cubes a cup, plus its own extra at a flat cost per cup, so switching cards wastes nothing.

| Recipe | Cost per cup ($) | Price bonus | Shines with (×1.2 appeal) |
|---|---|---|---|
| Classic Lemonade | 0.21 | 0% | Everyone |
| Pink Lemonade | 0.24 | +5% | Kids, families; Maple Row |
| Mint Lemonade | 0.25 | +5% | Joggers, students; Campus & Arts, The Boardwalk |
| Strawberry Lemonade | 0.32 | +10% | Kids, tourists; Maple Row, The Boardwalk |
| Frozen Lemonade | 0.30 | +15% | The Boardwalk; Summer and heat waves |
| Honey-Ginger Hot Lemonade | 0.30 | +10% | Seniors; Maple Row, Old Town; Winter (and it ignores the Winter penalty) |
| Sparkling Lemonade | 0.32 | +15% | Office workers; Downtown |
| Lavender Lemonade | 0.40 | +25% | High rollers; Hilltop Estates |
| Hollis Half-and-Half | 0.25 | +10% | Workers; The Groves, The Harbor; Summer |
| Lottie's Secret Reserve | 0.45 | +30% | Everyone, everywhere (×1.3 appeal) |

A card shines in its districts, everywhere through its season (Frozen and Half-and-Half in Summer, Honey-Ginger in Winter), everywhere during a Heat Wave (Frozen), and for a festival or Tourist Bus crowd of its fans. Matches never stack. Honey-Ginger takes no Winter penalty: Winter demand at its stands is ×1, on the Boardwalk too.

The Sweetness dial shifts appeal by 10% for a segment: kids like Extra, seniors and office workers like Less.

### Customer segments

| Segment | Price tolerance (×) | Patience (people in line) | Peak hours | Favorite recipes |
|---|---|---|---|---|
| Kids | 0.8 | 4 | 13:00–17:00 | Pink, Strawberry |
| Families | 1.0 | 6 | 17:00–20:00 | Pink, Classic |
| Seniors | 0.9 | 10 | 08:00–11:00 | Honey-Ginger, Classic |
| Students | 0.85 | 6 | 12:00–18:00 | Mint, Frozen |
| Office Workers | 1.2 | 3 | 08:00–09:00 and 12:00–14:00 | Sparkling |
| Tourists | 1.3 | 8 | 11:00–17:00 | Strawberry, Frozen |
| Workers | 0.9 | 5 | 12:00–13:00 and 17:00–18:00 | Half-and-Half |
| High Rollers | 2.0 | 2 | 14:00–19:00 | Lavender, Secret Reserve |

A district's price tolerance in the land table is the blend of its usual crowd. Maple Row's crowd blends to about 0.9 (0.893), and its table value of 1.0 sets the ceiling; Hilltop Estates' crowd is all high rollers. In its peak hours a segment makes up ×1.8 more of the crowd (placeholder), the rest sharing what's left. Patience is the most people ahead a buyer will wait behind.

### Demand constants

| Constant | Value |
|---|---|
| Base stop chance | 25%, × thirst × appeal, never above 95% (the cap is a placeholder) |
| Price ceiling | The level's top price × the district's price tolerance × (1 + the recipe's price bonus), down to the cent. At your stands the Fancy Menu (+20%), the Blender Bar (Frozen +20%) and Lottie's Sweet Talk tip (+10%) multiply in |
| Priced under the ceiling | +1% appeal per 1% under, up to +25% |
| Priced over the ceiling | A quarter of buyers lost per 10% over, scaled by the district's tolerance ÷ the segment's, so the thriftiest leave first (the scaling is a placeholder); nobody buys at 40% over, tourists and high rollers too |
| Traffic through the day | The day's passersby spread over the business hours by weight, 08:00 to 19:00: 0.9, 0.7, 0.7, 0.9, 1.3, 1.2, 1.1, 1.3, 1.3, 1.0, 1.1, 1.0, out of 12.5 (placeholder) |
| Effective selling hours | 10 of 12 (peaks, lulls and queues) |
| Reputation multiplier | 0.7 at 1 star to 1.3 at 5 stars |
| Rival stands within 2 plots | Split customers by appeal (up to −35% for a stand in a crowded rival block) |
| Majority bonus | Your stands +10% sales; rival stands −10% appeal |
| Lemon Grove | +5% traffic at all your stands per Grove (up to 2); +10% per Grove with the Hollis Orchards trophy |
| Town Favorite (Old Town at Full Control) | +10% traffic at your stands in Old Town and Maple Row |
| Orchard Fresh (The Groves at Full Control) | +10% traffic at all your stands |
| Power Lunch (Downtown at Full Control) | Traffic ×1.5 at your stands in Downtown and Old Town from 12:00 to 14:00 (the window is a placeholder): about ×1.1 over the day |
| Tourist Trap (The Boardwalk at Full Control) | Tourists pay +20% for every cup at your stands, everywhere |
| Word of Mouth (Campus & Arts at Full Control) | Local campaigns half price everywhere: the Sandwich-Board Kid $20 a day, Sunny $150 a day, Event Sponsorship $1,000 a festival day. A Free Sample Day hands out 50 cups, and a Coupon Blitz cuts 12.5% for the same ×1.4 appeal (both placeholders). The $25,000 Billboard isn't halved |

The other district perks are Neighborhood Watch (Maple Row; see Gadgets), Shipping Lane and Old Money (The Harbor and Hilltop Estates; see Contracts).

### Weather and seasons

| Weather | Temperature (°F) | Thirst (×) | Foot traffic (×) | Summer odds (%) | Fall odds (%) | Winter odds (%) | Spring odds (%) |
|---|---|---|---|---|---|---|---|
| Scorcher | 95–104 | 1.6 | 1.0 | 15 | 3 | 0 | 2 |
| Hot | 85–94 | 1.3 | 1.0 | 35 | 15 | 5 | 13 |
| Warm | 72–84 | 1.0 | 1.0 | 30 | 37 | 25 | 40 |
| Cloudy | 62–74 (placeholder) | 0.8 | 0.9 | 12 | 25 | 40 | 25 |
| Rainy | 56–68 (placeholder) | 0.5 | 0.7 | 6 | 15 | 22 | 15 |
| Storm | 55–66 (placeholder) | 0.2 | 0.4 | 2 | 5 | 8 | 5 |

Scorcher, Hot and Warm keep their bands in every season. Cloudy, Rainy and Storm run cooler outside Summer: Fall −8°F, Winter −22°F, Spring −5°F (placeholder). The dawn forecast is right 80% of the time, within ±2°F (placeholder) and inside the kind's band; a miss is one step off along Scorcher, Hot, Warm, Cloudy, Rainy, Storm, to a kind the season has. The Radio Jingle (M3) adds the next 2 days' forecasts. A Storm day (the real weather, not the forecast) takes 25% of max HP off every faction's L1 and L2 stands at the open, never below 1 HP; each sells at its HP share until it's repaired.

| Season (14 days each) | Demand (×) | The Boardwalk (×) |
|---|---|---|
| Summer | 1.2 | 1.5 |
| Fall | 0.9 | 0.9 |
| Winter | 0.6 | 0.4 |
| Spring | 1.0 | 1.0 |

### World and events

A year is 56 days: four seasons of 14 days from Summer Day 1, so Fall starts on Day 15, Winter on Day 29 and Spring on Day 43. Values marked (placeholder) are the build's own where the spec gives none.

#### Festivals

| Festival | Season days (year 1) | District | Crowd | Also |
|---|---|---|---|---|
| Surf Contest | Summer 4–6 (Days 4–6) (placeholder) | The Boardwalk | Tourists (placeholder) | — |
| Summer Fair | Summer 8–14 (Days 8–14) | Old Town | Families (placeholder) | A Taste-Off on its last day |
| Founders' Day | Summer 8 (Day 8) (placeholder) | Downtown (placeholder) | Families (placeholder) | — |
| County Fair | Fall 1–7 (Days 15–21) | The Groves (the Fairgrounds) | Families (placeholder) | A Taste-Off on its last day |
| Campus Homecoming | Fall 10–11 (Days 24–25) (placeholder) | Campus & Arts | Students | — |
| Harbor Fest | Fall 12–14 (Days 26–28) (placeholder) | The Harbor | Workers (placeholder) | The Fall VIP rush (see Contracts) |
| Winter Lights Market | Winter 8–14 (Days 36–42) (placeholder) | Old Town | Seniors (placeholder) | — |
| Spring Marathon | Spring 7 (Day 49) (placeholder) | The Boardwalk (placeholder) | Students: the joggers run with them (placeholder) | — |
| Election Day | Spring 12 (Day 54) (placeholder) | Old Town (placeholder) | None | Can change the Citation rules for a year (see Your raids) |

A festival changes who walks by, not how many: half of its district's passersby are its crowd (placeholder), and a card shines for a crowd of its fans. Event Sponsorship (Rank 5, see Local campaigns) is booked at Morning Prep while a festival runs, needs a stand of yours in its district and pays for every day left.

#### Taste-Offs

Each fair ends in a Taste-Off on its last day. Three judges post their hints at dawn and taste at closing. You enter whatever you set at the fair, else the selected stand's card, Sweetness and price.

| Rule | Value |
|---|---|
| The hints | One names a crowd (the fair's, or one of the district's, with a favorite you own), one a Sweetness, one a price band: a bargain (up to 60% of the booth's top price), fair (up to 85%) or worth a little extra (up to 100%) |
| The booth's top price | Your best stand level's top price × the card's price bonus × the district's price tolerance (× the Blender Bar's +20% for Frozen) |
| Marks (they multiply) | A card the crowd loves ×1.2, any other ×1. Sweetness or price band right ×1.1, one step off ×1, two off ×0.85; over the top price ×0.85 (all placeholders) |
| Rivals | Every rival with a stand in the district enters, else Dot's Diner. Each reads each hint right this often, taking the full mark: Brock 60%, Tilly 65%, Vera 50%, Preston 45%, Juni 45%, Sterling (Snootwater) 60%, Dot 40%. Of the rest, 70% land near it (×1) and the others miss (×0.85) (placeholders). Ties go to you |
| The winner | +0.1 star and +20% traffic for its stands in that district for the next 7 days, rivals included, and a $500 prize (placeholder). Dot's Diner takes neither |
| Act 1 (year 1's Summer Fair) | Brock stakes the Strawberry page, and the judges give the spec's three hints: for the kids, not too sweet, worth a little extra |
| From Act 4 (the County Fair) | Tilly duels you at each County Fair until she's won over. Win, and she sells her Fields at 1.5× land value instead of 2.5×. She neither sells out, falls to an HQ Assault nor goes bust before year 2's County Fair (Days 71–77) has run its Taste-Off; still broke then, she folds the first dawn after it |
| Sandbox and Endless | Open fairs: a win brings home one missing page, Strawberry first, else one whose holder isn't on the map. Beating Tilly at any County Fair wins her over |

#### Random events

| Rule | Value |
|---|---|
| The first | None before Day 6. The first rolls on Days 6–8 (placeholder) |
| How often | About one every 5–7 days after that (placeholder): a pick, by weight, of the events that can happen that day. If none can, the scheduler tries again the next day |
| Weights | Viral Video 1.2, every other rolled event 1 (placeholders). The Heat Wave and Kids' Lemonade Day are planned instead, at each season's first dawn, never before Day 6 and at least 2 days ahead, so the forecast sees them |
| One harmful at a time | A harmful event running, or on its way, holds back the next. None is rolled on a day forecast Storm, except the two that come with notice: the Hurricane, and the Health Inspection, which is never set for a day forecast Storm |
| When it starts | At dawn, in the Bugle; or breaking in mid-day on 101.5 The Squeeze, between 10:00 and 15:00 (placeholder) |
| Where it lands | A district or street event lands in a district where you sell 70% of the time (placeholder), else in any district with stands. A street is 4–6 adjacent columns of one district, both sides (placeholder), through one of your stands when the district has one |
| Traffic surges | Multiply on top of marketing, and with each other |

| Event | Lasts | Where and when | Effect | How to play it |
|---|---|---|---|---|
| Heat Wave (good) | 3 days | The bay. A season has one 40% of the time in Summer, 10% in Fall, 6% in Spring and never in Winter, starting on season days 3–12, 1–4 and 9–12 (placeholders) | 3 Scorchers in a row (thirst ×1.6), and Frozen shines everywhere. The season's other Scorchers are thinned, so the weather table's Scorcher odds hold on average | Extra ice, higher prices, Frozen |
| Lemon Blight (harmful) | 5 days | The bay, at dawn | Lemons cost ×2 at the Market, on top of the day's ±20% | Buy daily (lemons spoil in 3 days) and nudge prices up |
| Sugar Shortage (harmful) | 5 days | The bay, at dawn | Sugar costs ×2 at the Market | Sugar keeps: a stocked Warehouse rides it out |
| Viral Video (good) | 2 days | One of your stands, mid-day | ×2 traffic at that stand | Stock deep, raise the price |
| Celebrity Sighting (good) | 1 day | A district, at dawn | ×2 traffic at every stand there, rivals' too | Send Sunny the Lemon (at Morning Prep; once the stands open, the card offers Restock now) |
| Parade Route (good) | 1 day | A street, at dawn | ×2 traffic on the route | Restock the route's stands at noon |
| Roadworks (harmful) | 3 days | A street, at dawn | Half the traffic on the street | Run campaigns elsewhere |
| Tourist Bus (good) | 1 day | A district, at dawn | ×1.5 traffic there, and tourists are 70% of its walkers (both placeholders) | Pour Strawberry, price high |
| Food Critic (mixed) | 1 day | One of your stands, named at dawn | At closing, +0.1 star if the stand passes all three checks, −0.1 if not (see Reputation) | Short line, fair price, fitting recipe |
| Power Outage (harmful) | 1 day | The district of one of your L4+ stands, at dawn (it needs one) | The ice machines there stop for the day | Buy Market ice for those stands |
| Captain Squawk (harmful) | Until the stand is restocked or you forgive him, 3 days at most (placeholder) | One of your stands, mid-day | The gull takes the stand's newest lemon delivery (nothing, if it holds no lemons) | Restock; forgive him |
| Kids' Lemonade Day (mixed) | 1 day | The bay, in 75% of Summers, on a weekday between season days 3 and 12 (placeholders). Day 1 is a Monday, so the 6th and 7th days of each week are the weekend | One kid stand per district (placeholder) on a free Street, Prime or Landmark lot: within 2 plots of one of your stands where you sell, else anywhere in the district. Each pulls like a Folding Table pouring Classic at $0.50 (placeholder) and splits walkers like a rival stand, inside the 35% cap. Lottie's medium goal for the day is to leave them alone. Raiding one (from Rank 3, with a free guard, before dusk) costs 0.5 star, tomorrow's front page and Lottie's respect. Rivals never raid one | Leave them alone until dusk |
| Hurricane (harmful) | 1 day | The bay, from Rank 7 in Fall and Winter (placeholders), never on a Heat Wave day; forecast 2 days ahead | Its day is a Storm. At the open every faction's standing building loses a share of its own HP, before any Fortified Frame: L1 60%, L2 50%, L3 40%, L4 35%, L5 30%, facilities 30%, never below 1 HP (placeholders). Damaged, never Wrecked; fences and HQs take none, and it takes the place of the Storm's own damage | Fortified Frames; repairs never cost more than a 15% rebuild |
| Health Inspection (harmful) | 1 day | One of your stands, from Rank 2, named the day before, the visit mid-day (placeholders) | The stand passes at full HP with at least an hour's pour in stock (placeholder); otherwise it closes until dawn. A repair approved the day before is done by the visit, and a Storm the forecast missed calls the visit off | Repair and restock it, or it closes until dawn |

### Ranks

| Rank | Title | Success Score threshold ($) | Target day | Simulated Classic day | Range on ten maps |
|---|---|---|---|---|---|
| 1 | Sidewalk Squeezer | 0 | 1 | 1 | 1 |
| 2 | Corner Hustler | 1,500 | 5 | 4 | 3–4 |
| 3 | Block Boss | 6,000 | 10 | 9 | 8–12 |
| 4 | Neighborhood Name | 25,000 | 22 | 19 | 15–34 |
| 5 | District Big Shot | 100,000 | 37 | 41 | 26–48 |
| 6 | Citrus Baron | 500,000 | 52–58 | 58 | 48–60 |
| 7 | Lemon Tycoon | 4,500,000 | 71–80 | 78 | 67–82 |
| 8 | Juice Magnate | 20,000,000 | 95–105 | 104 | 87–105 |
| 9 | Bay Kingpin | 125,000,000 | 125–135 | 135 | 123–138 |
| 10 | The Big Squeeze | 200,000,000 | About 150–160 (after victory) | 157 | 148–162 |

The first L2 upgrade's target is Day 5, its lesson (Days 5–6 across maps). Domination lands on Day 143 on the reference map and on Days 131–146 across ten maps, median 138 (target about 140–150, and not before Day 136): the simulated player calls the Big Squeeze the day after reaching Rank 9, and the 7-day siege follows. Rank 10 stays a goal for after victory. Each rival's HQ falls soon after its assault rank, so the acts follow the ranks: on the reference map the Blend Shack falls on Day 42 (end of Act 2), the Grindhouse on Day 61 (end of Act 3), Hollis Homestead on Day 79 and FizzCo Tower on Day 105 (end of Act 4).

These targets are under review, and the simulated days predate the first L2 and Rank 2 moving to their Day 5 lessons: the new pacing sweep reports to /mnt/project-files/gameplay-build/integration/pacing-sweep.txt.

### Lottie's Tips

Each rank-up from Rank 2 deals a hand of 3 tips you don't hold; you keep one for good, and the other two go back in the pool. A tip that needs a higher rank waits for it, and the tips about raids and guards are never dealt in Peaceful. Seven are canon's numbers; the other seventeen are placeholders. Canon's eighth example, opening at 07:00, isn't in the pool: 07:00 is Morning Prep.

| Tip | What it does | Dealt |
|---|---|---|
| Sweet Talk | +10% price tolerance: your stands' ceilings ×1.1 | Any rank |
| Long Run | A stand's campaign (Sandwich-Board Kid, Free Sample Day) runs 50% more days, rounded up | Any rank |
| Good Dirt | Open land 10% cheaper | Any rank |
| Firm Handshake | Plot and Faction Buyouts 15% cheaper | From Rank 4 |
| Chicken Soup | A knocked-out guard of yours is back a day sooner | Any rank; not in Peaceful |
| Goose Whistle | Your Guard Geese stun twice | Any rank; not in Peaceful |
| Porch Light | +20% HP for your defenders at night, the guards Ring the Bell brings included | Any rank; not in Peaceful |
| Fresh Paint | +5% curb appeal at your stands (placeholder) | Any rank |
| Chatty Regulars | +5% foot traffic at your stands (placeholder) | Any rank |
| Cool Cellar | Lemons keep 2 days longer (placeholder) | Any rank |
| Gold Stars | Lottie's Goals pay 50% more (placeholder) | Any rank |
| Sharp Pencil | An auction you win costs 10% less (placeholder) | From Rank 3 |
| Handy Hands | Repairs to your buildings 25% cheaper (placeholder) | Any rank |
| Steady Pour | Your Bottling Works fill 10% more a day (placeholder) | From Rank 5 |
| Let It Go | Rivals' Grudge toward you cools twice as fast (placeholder) | Any rank |
| Low Profile | Bosses pay you 20% less Attention (placeholder) | Any rank |
| Pep Talk | Guards on post +10 Nerve (placeholder) | Any rank; not in Peaceful |
| Light Sleeper | Raid warnings 30 game minutes sooner (placeholder) | Any rank; not in Peaceful |
| Nosy Neighbors | +10% detection on raids on your plots, before the cap (placeholder) | Any rank; not in Peaceful |
| Lockbox | Shakedowns of your stands take 25% less (placeholder) | Any rank; not in Peaceful |
| Elbow Grease | Your raiders chop 15% harder (placeholder) | From Rank 3; not in Peaceful |
| Quick Study | Your guards earn 50% more fight XP (placeholder) | Any rank; not in Peaceful |
| Help Wanted | One more recruit at each Hiring Hall refresh (placeholder) | Any rank; not in Peaceful |
| Family Rates | Hiring 25% cheaper (placeholder) | Any rank; not in Peaceful |

### Threat and raids on the player (Classic)

| Threat | Raids per week (base rate) | Raid nights a week (simulated) | Henchmen | Fists / clubs / hatchets | Padding | Lookouts | Targets per raid | Shakedown share | Smash share |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | About 5 | 2–3 | 100 / 0 / 0% | None | 0 | 1 | 100% | 0% |
| 2 | 2 | About 4.3 | 3–5 | 70 / 30 / 0% | None | 0 | 1 | 70% | 30% |
| 3 | 3 | 4.3–4.6 | 5–8 | 30 / 70 / 0% | Padded Vest | 1 | 1 | 40% | 60% |
| 4 | 4 | 2.5–5.0 | 8–12 | 0 / 40 / 60% | Pro Gear | 1 | 1 or 2 | 30% | 70% |
| 5 (Syndicate) | 6 | — | 12–20, boss-led | 0 / 40 / 60% | Pro Gear | 2 | 2 or 3 | 0% | 100% |

Threat comes from Rank alone: Ranks 1–2 → 1, 3–4 → 2, 5–6 → 3, 7–8 → 4, 9–10 → 5 (Laid Back −1, minimum 1, so its Threat stops at 4). Henchmen fight at the Threat's level (see Guards by level), each with a weapon drawn from the odds. Threat 4's Pro Gear and three hatchets in five, the lookouts and Threat 4's even odds of one or two targets are placeholders. Threat 5 brings the same kit a level up, with a boss at its head (see Raids); in the game it is nearly always the Syndicate's.

The base rate sets each night's draw (see Raids), and two rules raise what you meet: the quiet-night cap (after the first raid, at most 2 raid-free nights in a row on Classic) and raid rumors (an answered rumor brings its raid on a night the draw gave none). The simulated column is raid nights a week from Night 3 in twelve Classic campaigns with every rumor answered, from all your defenses holding to none holding (a raid you beat keeps that boss away for 3 nights). Two raids can share a night: Threat 4's 2.5–5.0 raid nights brought 2.8–6.2 raids. With every rumor left to lapse it was about 3 raid nights a week at Threats 1–3 and 2.4–3.9 at Threat 4. Laid Back gave 3.5–3.6, 3.2–3.5 and 1.6–4.0 at Threats 1–3; Cutthroat 5.3, 5.1–5.3, 5.4 and 4.3–5.7 at Threats 1–4. Whether answered rumor nights should count against the week's rate is an open call for Ben.

A Shakedown takes about 1 day of that stand's profit; a Smash leaves the stand Wrecked until rebuilt. In the pacing runs on maps 42–44 (`npm run sim -- pacing 170 3 classic`), the worst raid after Day 6 cost 0.43, 0.83 and 0.54 days of the last week's takings. Each came on Days 9–12, at Threat 1 or 2, while three or four stands made the takings. The average raid cost 0.03 days. An earlier pacing bot, which let rumors lapse, saw 0.58, 0.72 and 1.38 days on the same maps, all Threat 1 Shakedowns. This line used to say no simulated raid cost more than 0.8 days, and the pacing check allows 0.6 (`RAID_LOSS` in tools/pacing.ts): whether to soften the early raids or restate both is an open call for Ben.

### Raids

How the raids on you are planned and sent, night by night. Values marked (placeholder) are the build's own where the spec gives none.

| Rule | Value |
|---|---|
| The first nights | No raids on Nights 1–2 |
| The first raid | Night 3: two Smoothie Bros with bare fists (30 HP, Hit 2, Chop 1, Nerve 20), spotted as they set out, for a Shakedown at the plot Day 3's rumor named (Lottie's Corner), else Dex's post, else your weakest plot. Brock sends them if he may raid you, else the next rival who may. Any fence or guard bounces them, unless your guards Fall Back; undefended, they take the till. It is never a Sabotage |
| How many a night | A draw around a seventh of the week's rate, so two raids can come on one night: Raids per week by Threat (the Syndicate's 6 once it stands) × the difficulty's raid frequency |
| The quiet-night cap | After the first raid, at most 2 raid-free nights in a row on Classic (Laid Back 4, Cutthroat 1, Custom 2). The next night one raid comes from a rival who may raid you, paid for or not |
| Raid rumors | From Day 4 a day call names a gang and one of your plots on about 40% of warm or hot business days and 43% of the others; never on a siege day, and only when some gang may raid you. Any answer makes that gang's raid on that plot the night's first, sent free if its Strike can't pay; it adds a raid only on a night the draw gave none. Left to lapse, the rumor does nothing |
| Who may raid you | Any rival still in, unless it is in a Truce with you (made on Day D: no raids through the night of D+6) or backing off. Respect: a boss whose raid you beat on night D sits out nights D+1 to D+3 on Classic (Laid Back 5 nights, Cutthroat 1, Custom 1–5) |
| Who sends it, and where | The keenest boss whose Strike can pay, at its weakest valuable plot near its turf (see Attention and Grudge). Two raids in one night go for different plots while you have another |
| A raid on several plots | Still one raid: its party is dealt round the targets, each part warned and fought on its own, the boss with the first |
| Setting out | Between 20:15 and 01:45, in 15-minute steps (placeholder), from the rival's plot nearest the target (its HQ if it holds no other), so rival raids land between 21:15 and 04:45. Only Delivery Raids come by day |
| Travel | 1–3 game hours by straight-line distance, in 5-minute steps: across the whole bay (about 350 map units) takes 3 hours, Maple Row to the Boardwalk about 1.5 (the scale is a placeholder). Your own raids and a rival's help travel the same way; Ring the Bell's reserve has its own times (see Commands and help) |
| Spotting a raid | Rolled as it sets out, at the plot's detection chance (see Gadgets). Each of the raid's lookouts takes 10% off, never below 5% on their own (placeholder); Cold Brew's Night Shift takes 25% more at night |
| The warning | A spotted raid warns as it sets out, with its ETA. One not spotted warns at the difficulty's minimum notice before it hits (30 / 15 / 5 game minutes on Laid Back / Classic / Cutthroat; Custom 5–30). Juni's Grapevine brings either 1 game hour sooner, and Lottie's Light Sleeper tip 30 minutes more |
| Rival Sabotage | From your Rank 4, once the first raid is behind you, below Threat 5: a rival raid on one of your stands is a Sabotage 40% of the time from Cold Brew and 10% from each other rival (placeholders). It goes for the stock instead of the till, and the stand can't sell its next day. A Syndicate strike never is one |
| Rivals raiding each other | Of all rival raids, 30% go at other rivals at Threats 1–3 and 15% at Threats 4–5 (the Threat 5 share is a placeholder), none once the Syndicate forms: a nightly draw at that share ÷ (1 − share) × your week's rate, each boss at most once a night, Grudge picking who goes and where. Always a Smash, always spotted, landing at 02:00 (placeholder), with the next Threat's crew (Threat 3 at most). The boss pays from Strike, and the target's Grudge toward the raider rises 10 |
| Delivery Raids | From Threat 3, never in Peaceful: one 30% roll for each pad or pier trip (placeholder), a Caterer Truck loading at its Warehouse being a trip of its own. The keenest boss whose Strike can pay sends a crew of the Threat's size after the trip's biggest load, which waits until the raid is fought; they set out as loading starts and hit inside its 2-hour window. If they win, the load is lost and the order fails (see Contracts). In the campaign the movie star's first chopper is FizzCo's to hit, with no roll, if FizzCo may raid you. During Act 5's Harbor Fest, while the Syndicate stands, its keenest member goes after every helicopter and pier trip, paying what it can |
| The Syndicate | In the campaign it forms 14 days into Act 5 on every difficulty. In Sandbox and Endless it forms at Threat 5, at Threat 4 on Cutthroat and at Rank 9 on Laid Back (placeholder); never in Peaceful. Every rival still in joins (an Out-of-Towner never does), led by Vera while she's in, else the biggest boss left. From then on rivals stop raiding each other, and every raid on you is a Syndicate strike: 6 a week × the difficulty's raid frequency, the first on the night it forms |
| A Syndicate strike | A Threat 5 raid whatever the Threat: 12–20 henchmen in Pro Gear, boss-led, always a Smash, on 2 or 3 plots. The sender's Strike pays, else the leader's or any member's; a rumored strike, or the quiet-night cap's, comes free when none can |
| The Big Squeeze | Campaign only: from Rank 9 in Act 5 you call it at Morning Prep, while Vera is in and not in a Truce with you (calling it forms the Syndicate if it hasn't formed). 7 siege nights follow. Each siege dawn names 2 or 3 of your plots, the ones Vera wants most the likeliest, and that night one strike comes at them whatever any Strike holds, the sender's boss with the first part. No other raid on you comes that night, and no raid rumor that day |
| The siege's score | Each night you hold every target (guards who Fall Back don't hold) cuts 500 HP off Sourwood Manor's Gate (5,000 down to 1,500) and benches one Yard henchman. Each plot you lose adds a Steward to the Boss Room, on top of Old Money's 3 (placeholder). After the seventh night the Manor opens for an HQ Assault, Weakened or not |

### Time and nights

| Rule | Value |
|---|---|
| Speeds | Pause, 1×, 2× and 3× |
| Business hours (08:00–20:00) | 17.5 real seconds a game hour at 1×: a business day takes 3.5 real minutes |
| The Evening | Once the Ledger is folded the night starts by itself after 6 real seconds at 1×, 2 at 3× (placeholder). With Auto-continue on, it doesn't wait for the Ledger |
| The night (20:00–07:00) | 8 real seconds a game hour at 1×: about 88 real seconds for the whole night. A night with no raid on you and none of yours out is skipped to dawn |
| Fast raid nights (on by default) | A raid night runs at 12× until something comes in: a raid warning, a card from tonight on the feed or a squad of yours setting out. Your own raid's trip, fight and walk home play at the speed you chose, and picking a speed ends the 12× until dawn |
| Fight speed | 1 game minute a real second, at any speed: while a fight plays on screen, and for the last stretch of a raid warning, inside the difficulty's minimum notice of landing (30, 15 or 5 real seconds), even after an auto-pause. Before that, a spotted raid's longer warning runs at the speed you chose |
| Auto-pause | Major alerts pause by default, each with its own switch: a raid warning, a Delivery Raid, a VIP client's first arrival, going In the Red and a rank-up perk pick. The raid warning's switch starts from the difficulty: on in Laid Back, Classic and Custom (Custom's is a placeholder), off in Cutthroat |
| Morning Prep | Waits for you. With Auto-continue on (off by default), it opens the stands after 5 real seconds (placeholder) |
| Alert feed | Holds 8 cards; past that, the oldest card that isn't a major alert goes (placeholder). Small news (a sell-out, a note, a regular pickup with no show) melts after 90 game minutes (placeholder); a raid warning stays while its raid is out, other big news until you dismiss it or dawn comes |
| Raid countdown | A woodblock tick each beat (0.375 s, a quarter note at 160 BPM), from 3 s after the Raid Incoming stinger until the raid lands, twice as often in its last 15 game minutes. No ticks while paused, during a live fight or during a VIP show |
| Calm Audio | On by default in Laid Back, off in the others: no countdown ticks, and the Raid Incoming stinger at 0.4 volume (about −8 dB) |
| The Day's end card | With a raid on you planned tonight it says "Raiders on the way tonight", with one fix at the first raid's plot: post a ready guard from the reserve there, else buy its next fence. It names no gang, party or time; the warning card does, once they set out |
| Saves | The last 3 dawns autosave in turn, and 3 manual slots (placeholder). The run also saves each game hour of the day and night, so it can resume mid-day |

### Difficulty

| Setting | Laid Back | Classic | Cutthroat | Custom |
|---|---|---|---|---|
| Raid frequency | ×0.5 | ×1 | ×1.5 | ×0.5 to ×1.5 in steps of 0.1 (placeholder); starts at ×1 |
| Threat | −1 (min 1; it stops at 4) | ±0 | ±0 | ±0 (placeholder) |
| Most raid-free nights in a row | 4 | 2 | 1 | 2 |
| Syndicate forms at | Rank 9 (its Threat stops at 4; placeholder) | Threat 5 | Threat 4 | Threat 5 |
| Delivery Raids from (Threat 3) | Rank 7 | Rank 5 | Rank 5 | Rank 5 |
| Respect cooldown | 5 days | 3 days | 1 day | 1 to 5 days in steps of 1 (placeholder); starts at 3 |
| Minimum raid warning | 30 game minutes | 15 game minutes | 5 game minutes (5 real seconds at fight speed) | 5 to 30 game minutes in steps of 5 (placeholder); starts at 15 |
| Raid warnings auto-pause | On | On | Off | On (placeholder) |
| Calm Audio | On | Off | Off | Off |
| A lost raid leaves your stand | Busted (repair 10%) | Wrecked (rebuild 15%) | Wrecked (rebuild 15%) | Your pick; starts Wrecked |
| Lottie's Cookie Jar | Always | Once per act | Never | Your pick; starts Once per act |
| The run can be lost | No | Yes | Yes | Yes, unless the Cookie Jar is Always (placeholder) |
| Customer traffic | ×1.0 | ×1.0 | ×1.0 | ×1.0 |
| Build, land and gear costs | ×1.0 | ×1.0 | ×1.0 | ×1.0 |
| Simulated pace (days to Ranks 5–9, median of ten maps) | ×0.86 | ×1.00 | ×1.01 | — |
| Simulated Domination day (reference map; ten maps) | 126 (120–136) | 143 (131–146) | 151 (134–163) | — |
| Simulated raids on you in a campaign (twelve runs, every rumor answered) | 46–79 | 76–119 | 115–166 | — |

Fights run in every mode at 1 game minute per real second. In the campaign, the Syndicate forms 14 days into Act 5 on every difficulty. The Threat triggers above apply in Sandbox and Endless, where Classic's Cookie Jar refills once per season instead of once per act. Laid Back's Threat stops at 4, so its Syndicate forms at Rank 9, where Classic reaches Threat 5. Delivery Raids need Threat 3, which Laid Back reaches only at Rank 7: before then, the movie star's first chopper draws no FizzCo raid and no tip from Juni. Custom starts from Classic's numbers. The raid counts are from twelve simulated campaigns with business days skipped, from all your defenses holding to none holding; with every rumor left to lapse they were 32–48, 62–96 and 101–137. Every run's first raid came on Night 3.

### Contracts

| Tier | Unlock | Needs | Size | Deadline | Pay per unit ($) | Offers |
|---|---|---|---|---|---|---|
| Local Orders | Rank 3 | Any L3+ stand | 300–1,500 cups | 2 days | 1.5× that stand's price | About 1 per 2 days |
| Caterer Trucks | Rank 5 | Warehouse + Bottling Works | 1,000–5,000 bottles | 3 days | 6 | About 2 per 5 days |
| Helicopter VIPs | Rank 6, 3.5 stars | Helipad tier on a Field | 2,000–10,000 bottles by pad tier | 4 days | 30, +0.2 star | About 1 per 3 days; never more than 10 days apart |
| Ship Contracts | Rank 7, 4.0 stars | Pier tier on a Dock | 10,000–60,000 bottles by pier tier | 7 days | 40 | About 1 per 5 days; never more than 10 days apart |
| Supply Deals (recurring) | Rank 8, 4.0 stars | Cargo Terminal | 200,000 bottles in 4 weekly loads of 50,000 | 28 days | 30 ($1.5M a load, $6M a deal) | The first as soon as the Cargo Terminal stands, then about 1 per 7 days; never more than 10 days apart; several can run at once if your bottling keeps up |
| Mega Contracts (stretch goal) | Rank 9, 4.5 stars | Heliport + Cargo Terminal + 2 premium recipes | 100,000–150,000 bottles | 14 days | 100 ($10M–$15M a contract) | About 1 per 20 days |

A failed or overrun delivery costs 0.3 star. Premium recipes are any recovered or won page beyond the starting three and Strawberry. Pay arrives with each pickup. Choppers land at 17:30, in the golden hour (the mood scene "The first helicopter"); ships and Supply Deal loads come in at 10:00. Once a facility tier stands, its client type offers at least one job every 10 days; you may still turn any offer down. In the simulation, VIP clients (helicopters, ships and Supply Deals) earn about 11% of revenue on Days 52–96, 18% on Days 97–136 and 20% after that.

| Rule | Value |
|---|---|
| Daily chance a client calls | Rolled each dawn while the tier is open: Local Orders 50%, Caterer Trucks 40%, Helicopter VIPs 1 in 3, Ship Contracts 16.8%, Supply Deals 8.2%, Mega Contracts 1 in 20. A chopper, ship or Supply Deal client also calls once 10 days pass without one, and those three chances are set so the average gap, that floor included, comes to about 3, 5 and 7 days |
| Order sizes | Rolled in the tier's range (a pad's or pier's own), in steps of 100. A Local Order goes to one of your working L3+ stands and pours its card; every other client asks for a card from Lottie's book, and a Mega client for a premium one |
| The Order Book | Holds 4 offers (placeholder). Each offer stands today and tomorrow; a new one in a full book lets the oldest go a day early |
| Rival bids (VIP clients only) | Each rival in business bids on an offer 15% of the time, 5% under the client's price, needing 3/4 of the window (rounded up, at least a day). While FizzCo's Harbor bottling plant stands, FizzCo bids 50% of the time, 15% under, needing 1/4 of the window. The client keeps the strongest bid (all placeholders) |
| How a client weighs bids | In stars: the bidder's Reputation, +1 for each 10% under its price, −0.25 for each day it takes (placeholders). Ties go to you, and you may match the rival's price. A lost bid costs no star: the rival does the job, keeps 5% of the pay (placeholder) and counts the pay in its day's sales. An offer you let go with a bid on it goes the same way |
| Shipping Lane (The Harbor at Full Control) | Ship Contracts pay 15% more, at each pickup. Supply Deals and Mega Contracts don't |
| Old Money (Hilltop Estates at Full Control) | VIP clients call 50% more often: daily chances of 1 in 2 for choppers, 29% for ships and 18.7% for Supply Deals (gaps of about 2, 3.3 and 4.7 days, the floor included), and 1.5× for Mega clients |
| Harbor Fest (Fall days 12–14) | A chopper client and a ship client call every Fest day while you have the pad or pier for them (placeholder) |
| Pickups | Each trip opens a 2-hour window and loads up to the facility's daily rate: choppers at 17:30, a Heliport's second trip at 19:30 (placeholder); ships, Supply Deal loads and Mega freighters at 10:00 (a Mega loads at the Cargo Terminal's 25,000 a day). A Local Order pours at its stand from the stand's own stock at 19:00 on each day until it's due, and a Caterer Truck loads the whole order at its Warehouse at 20:00 (both times placeholders) |
| Where trucks load | At your standing Warehouse nearest your working stands (the least distance to them all), else the first one. Bottles bank bay-wide between pickups; no Warehouse holds any |
| Bottling | At dawn, only while an accepted order still needs bottles and as far as your cash goes: each recipe the orders want, the soonest due first, at that recipe's cost per cup less the cup, plus the bottle and cap. A page that has left the book can't be bottled |
| Delivery Raids | See Raids |

### VIP facilities

| Facility | Tier | Rank | Cost ($) | Order size served (bottles) | Loading (bottles/day) | HP |
|---|---|---|---|---|---|---|
| Helipad line (Field) | Pad | 6 | 50,000 | 2,000–4,000 | 2,000 | 800 |
| | Helipad | 7 | 200,000 | 4,000–7,000 | 5,000 | 2,000 |
| | Heliport | 8 | 800,000 | 7,000–10,000 | 20,000 (2 trips of 10,000) | 5,000 |
| Pier line (Dock) | Jetty | 7 | 250,000 | 10,000–20,000 | 5,000 | 1,500 |
| | Pier | 7 | 750,000 | 20,000–40,000 | 10,000 | 3,500 |
| | Cargo Terminal | 8 | 3,000,000 | 40,000–60,000 | 25,000 | 8,000 |

| Facility | Rank | Cost ($) | Plot | HP | Effect |
|---|---|---|---|---|---|
| Warehouse | 4 | 15,000 | Street or Industrial | 1,000 | Keeps your stands in its district stocked, those with Auto-Restock on: every 15 game minutes while open (placeholder), a stand holding less than an hour's pour is topped up, at the Market price, to what it can sell by closing, and the last run before the 19:00 Local Order pour covers the cups the order owes. Stores 5 days of those stands' sugar (placeholder), bought on a dawn when sugar is at or under its usual price and handed out first on a dearer one (a Sugar Shortage), at what it cost; a Warehouse that falls loses its sugar. Caterer Trucks load at it (see Contracts), and it holds no bottles |
| Bottling Works L1 | 5 | 25,000 | Industrial | 1,000 | 1,500 bottles/day |
| Bottling Works L2 | 6 | +100,000 | Industrial | 2,500 | 4,000 bottles/day |
| Bottling Works L3 | 7 | +400,000 | Industrial | 6,000 | 12,000 bottles/day |
| Lemon Grove | 5 | 25,000 | Field | 800 | +5% traffic at all your stands (up to 2 Groves; +10% each with Hollis Orchards) |

HP is the chopping it takes to knock a facility down. The spec gives facilities none, so every facility HP is a placeholder; each has 3 guard posts.

On all ten simulated maps the player builds all six helipad and pier tiers; the first chopper lands on Days 63–80 and the first ship docks on Days 73–89, both in Act 4, and the first Supply Deal arrives on Days 105–113, as the Cargo Terminal opens.

### Rivals

| Faction | Starting cash ($) | Rebuild chance after a Smash | HQ assault from | HQ Gate HP | Faction Buyout (× cash and buildings) | Trophy perk |
|---|---|---|---|---|---|---|
| The Boardwalk Blenders | 10,000 | 40% | Rank 5 | 2,000 | 1.5×, from Rank 5 | Blender Bar: Frozen recipes +20% top price |
| The Cold Brew Collective | 20,000 | 50% | Rank 6 | 2,750 | 1.8×, from Rank 6 | Juni's Grapevine: raid warnings 1 game hour earlier |
| Hollis Sweet Tea Co. | 50,000 | 60% | Rank 7 | 3,500 | 1.5×, from Rank 7 | Hollis Orchards: each Lemon Grove +10% traffic instead of +5% |
| FizzCo Beverages | 1,000,000 | 70% | Rank 8 | 4,250 | 1.8×, from Rank 8 | Bottling Line: bottles fill 25% faster |
| The Sourwood Family | 3,000,000 | 80% | Rank 9 (Big Squeeze) | 5,000 | Never in the campaign (3× once Weakened in a Peaceful Sandbox) | Family Silver: land, Plot Buyouts and auction bids −10% |
| Snootwater Springs (Endless Summer's Out-of-Towner) | A war chest each visit (see The Out-of-Towner) | 40% (placeholder) | No HQ in the Bay | — | 1.5×, from Rank 5 (placeholder) | — |

| Faction | Home | Grow / Guard / Strike | Everyday price (× ceiling) | Stand cap | Brand cap | Auction push | Signature move |
|---|---|---|---|---|---|---|---|
| The Boardwalk Blenders | The Boardwalk | 25 / 15 / 60% | 0.9 | L4 | M2 | 0.85 | Blender Rush |
| The Cold Brew Collective | Campus & Arts | 25 / 25 / 50% | 0.95 | L4 | M3 | 0.9 | Night Shift |
| Hollis Sweet Tea Co. | The Groves | 40 / 50 / 10% | 0.9 | L4 | M3 | 1 | Dig In |
| FizzCo Beverages | Downtown | 50 / 20 / 30% | 1.1 | L5 | M5 | 1.35 | Hostile Takeover |
| The Sourwood Family | Hilltop Estates | 35 / 35 / 30% | 1.0 | L5 | M4 | 1.2 | Old Money |
| Snootwater Springs | Out of town | 25 / 15 / 60% | 0.9 | L4 | M2 | 0.85 | Blender Rush, under its own name |

The everyday prices, brand caps, auction push and every Snootwater number are placeholders. A rival's everyday price is the ceiling a Classic lemonade stand of its level gets in that district (the same formula as yours) times its factor, less 25% while a price war runs there. Their stands start at L2 (The Groves L1; Downtown and Hilltop L3), one level higher on Prime and Landmark plots, never above the faction's cap. A rival's rebuild chance drops 30 points for each other Smash on that same plot in the last 7 days (to no less than 0%); the Raid Planner shows the chance. Rivals hold VIP facilities too: FizzCo's Bottling Works L1 at its Harbor plant (placeholder) and a Jetty, the Sourwoods' Helipad and marina Jetty, and a Lemon Grove on each of Hollis's Fields. The Lavender auction at the Hilltop estate opens when you reach Rank 8; expect the winning bid to be about $1,500,000, about a day of income at that rank.

#### Budgets and growth

Each rival splits its money three ways, by its Grow / Guard / Strike shares: Grow buys land, stands, level-ups and marketing; Guard buys fences, gadgets, henchmen and repairs; Strike pays for raids and schemes. Its starting cash opens the three buckets. Each dawn, whatever moved its cash since the last dawn (trade, upkeep, wages, loot, rebuilds, sales) goes into them by the same split. All placeholders except the 30 days.

| Rule | Value |
|---|---|
| Reserve | 2 days of stand upkeep and henchmen's wages stay out of the buckets |
| Trade | Over a rival's first 7 dawns of trading, its stands' margin is scaled so its opening stands net about 1% of its starting cash on an average day of the year, after upkeep and wages. The scale stays within 0.02–25; above 1 it covers only the opening stands at their opening level |
| Wages | Each dawn every henchman draws a guard's wage at his level (see Guards by level); one the rival can't pay walks off |
| Hiring | $300 a henchman out of Guard, and only while Guard's share of a day's net trade covers his wage |
| Guard spending | Each dawn: fence repairs and Slick re-lays first, at your prices; then, on each of its three most invested plots, one step toward that plot's kit (see Rival kits): the next fence, else a henchman for an empty post, else the next gadget |
| Level-ups | Every 30 days each rival stand is owed one level, up to the faction's cap. Grow pays your build price, cheapest first. An owed level Grow can't pay waits, and a wrecked stand waits for its rebuild |
| Bare lots | An L1 stand ($150 out of Grow) on the busiest bare lot it holds, one a dawn |
| New land | On 25% of dawns after Day 3, the busiest open Street or Prime plot in its home district or a district where it holds a Foothold (never Maple Row): land value plus $150 for the stand, out of Grow |
| Marketing | Its next marketing tier at your price, once your Rank opens it, up to its brand cap, and only while Grow holds twice the price (FizzCo: once) |
| A raid's cost | 1 night of wages for each henchman sent, at the raid's level, out of Strike; a Blender Rush costs half |

Rivals pay your prices, so the small gangs climb slowly: an L3 costs $3,500 and an L4 $60,000, six times the Blenders' starting cash. In three simulated campaigns the Blenders, Cold Brew and Hollis never reached L4 before they fell, FizzCo kept the L4s it starts with, and the Sourwoods built an L5 in one of them, after Day 120.

#### Attention and Grudge

All placeholders.

| Rule | Value |
|---|---|
| Attention on you | 1 per Threat lemon, 0.5 for each district of yours on or beside its turf, 10 × the share of its passers-by who bought from you instead on the last day of trade, and 0.1 per point of its Grudge toward you (Lottie's Low Profile tip: 20% less) |
| Who sends a raid on you | The keenest boss whose Strike can pay: its Attention, plus its Strike share, plus a roll of 0–1 so near-ties go either way. A boss backing off after you beat its raid (Respect) or in a Truce sits it out |
| Where it goes | Your weakest valuable plot near its turf (a district where it holds land, or its home, or one bordering those; anywhere when nothing of yours is near): worth ÷ (1 + 2 × fence tier + 3 × guards posted + gadgets). Worth is land value, what's invested and the stand's last full day of profit. The Rivals Corkboard pins it |
| Grudge | 0–100, toward each faction. It rises when that faction takes its land (+15; a Plot Buyout is a sale, not a taking) or outbids it at auction (+10), and when another rival raids it (+10) or smashes its stand (+10). It cools 1 a day when it didn't rise (toward you twice as fast with Lottie's Let It Go tip). A feud between two rivals makes the Bugle at 50 |
| Grudge toward you | Your raid on it +20 if the raid wins, +8 if it fails; a stalled HQ assault +30; walking out on a haggle +5; turning down FizzCo's offer +10; breaking a Truce +25 with every rival |

#### Schemes

From Day 8, each dawn a rival with no scheme running starts one on 2 / 3.5 / 5 / 6.5 / 8% of dawns at Threat 1–5, if it has a target and Strike can pay. One of your stands outsold it next door yesterday: twice as often, and a price war first. In Peaceful, where schemes stand in for raids: three times as often. A rival in a Truce with you doesn't scheme, and a finished scheme stays on the books 7 days. All placeholders except the Cease-and-Desist's 3 days.

| Scheme | Who | What it does |
|---|---|---|
| Price war | Any rival | Its stands that share passers-by with yours (the same street, within 2 plots) cut prices 25% for 3 days. Strike pays the margin it gives up, and must cover the whole war at the start. Answer with a Coupon Blitz (from Rank 4, at Morning Prep) or wait it out |
| Auction snipe | Any rival | It tops your sealed bid by 5%, the extra out of Strike |
| Smear posters | Cold Brew | $150. Unless the plot's night watch catches the crew (a night raid's detection roll), −0.1 star, and the posters stay up 3 days or until a Free Sample Day there. In Act 3 they go on your busiest Campus & Arts stand |
| Night Shift | Cold Brew | Its night raids take 25% more off your detection, Floodlights or not; 40% of its raids on your stands are a Sabotage (see Raids) |
| Act 3's mystery | Cold Brew (campaign) | Until the Night Shift is unmasked: on the act's first night, then on 35% of nights, every lemon at your stocked stand nearest its turf goes bad, unless your night watch catches the crew (detection less 25%). $150 of Strike a night after the first |
| Ad blitz | FizzCo (any rival in Peaceful) | From your Rank 3: +25% appeal at its stands in one district (where most of them share passers-by with yours) for 3 days, $300 a day of Strike |
| Cease-and-Desist | FizzCo | From Act 4, $2,000 of Strike: your marketing tier and campaigns count for nothing in one district (where they pull the most) for 3 days. The Act 4 letter on Downtown is free, and waits while you hold a Truce with FizzCo |
| Takeover offer | FizzCo | From Act 4, out of Grow: 1.25× the land and building value (and your stock there at cost) for your most valuable plot on or beside its turf, never Lottie's Corner, a Trophy, a wreck or a pad with a pickup booked. The offer stands 2 days; sell at Morning Prep. Turning it down: +10 Grudge |
| Mayor's fine | Sourwood | From Act 5, $500 of Strike: half your average daily sales over the last 7 days, at least $25, never more than your cash |
| Land freeze | Sourwood | From Act 5, $1,500 of Strike: nobody can buy one plot for 3 days, and your First Dibs on it waits the freeze out. In the campaign, Act 5's first Hilltop buy is frozen once for free |
| Old Money's Stewards | Sourwood | From Act 5, Vera's raids and plot guards come one level higher (in that level's padding), each weapon one tier toward hatchets. Sourwood Manor's own defenders don't change |
| Dig In | Hollis | Its fences and their repairs cost 60% of your price, and hay bales give its fences 1.5× HP (the bales don't stay when the land changes hands). It fences every Field it holds, up to a Chain-Link Fence |
| Blender Rush | The Blenders and the Out-of-Towner | Every raid comes at the top of the Threat's party size, each weapon one tier toward fists (hatchets to clubs, clubs to fists), for half the wages. Brock phones first |

#### Sit-downs and buyouts

Sit-downs at Dot's Diner open at Rank 4, any hour but night. A fit Smooth Talker brought along as your negotiator takes 15% off a Truce, a Plot Buyout or a Faction Buyout (placeholder); Lottie's Firm Handshake tip takes 15% off a buyout.

| Deal | Rule |
|---|---|
| Truce | 7 days: made on Day D, no raids from that rival through the night of D+6, and its raids planned on you tonight are called off. Tribute: 2% of your Net Worth (at least $500) × (1 + its Grudge/100), rounded to $100 (placeholder). None in Peaceful |
| Breaking a Truce (raiding them) | −1 star; every rival's Grudge toward you +25 (placeholder); no rival takes a Truce for 14 days |
| Plot Buyout | 2.5× land value in their home district, 2× elsewhere, × (1 + their Grudge/200), and +0.2 more for the Sourwoods (placeholder). What's built on it comes with it. Never an HQ. Hollis's Fields go at 1.5× once Tilly is won over at the County Fair |
| Faction Buyout | Once the rival is Weakened, from its HQ rank: its multiple × its cash and standing buildings. Brock and Tilly sign at 1.5×. Juni and Preston haggle: you open at 1.5×, they counter at 2.1×; shake on that, or hold firm and they come down to 1.8×, the least they sign at, with a chance of 50% less 0.5% per point of Grudge, or else walk out until tomorrow, +5 Grudge (placeholders except the 1.8×). Its cash comes to you with the business, and its buildings stay on their plots for whoever buys them in the Fire Sale |
| Bankrupt | A rival in the red at 7 dawns in a row goes bust. In the campaign Tilly can't go bust before the Act 4 County Fair (still broke, she folds the first dawn after it), and Vera never does: only the Big Squeeze ends her |
| Out of business | Captured, bought out or bust, its HQ becomes your Trophy, its recipe page comes home, and every other plot it held goes to the Fire Sale (see Land, repairs and loans) |

#### Rival kits

What a rival builds up on a plot, by its stand's level (a facility counts as its tier + 2). Henchmen fill the plot's posts as Guard can pay, each one's weapon drawn from the odds. The L3 row is the Day 24 walkthrough's Kiosk (a Picket Fence, cans, a goose and three Smoothie Bros with clubs); the other rows are placeholders.

| Stand level | Fence | Gadgets, in buying order | Henchman level | Padding | Fists / clubs / hatchets |
|---|---|---|---|---|---|
| L1 | Picket Fence | — | 1 | None | 100 / 0 / 0% |
| L2 | Picket Fence | Tin-Can Alarm | 1 | None | 50 / 50 / 0% |
| L3 | Picket Fence | Alarm, Guard Goose | 1 | None | 0 / 100 / 0% |
| L4 | Chain-Link Fence | Alarm, goose, Lemon-Peel Slick | 2 | Padded Vest | 0 / 100 / 0% |
| L5 | Sharpened Stakes | Goose, slick, Sprinkler Ambush | 4 | Pro Gear | 0 / 50 / 50% |

#### The Out-of-Towner

In Endless Summer, Snootwater Springs comes to town 14 days after victory (in a run started as Endless, 14 days after the last of the Bay's five is out), then every 30 days. Each visit it buys 2–3 of the busiest open plots in your thinnest district (your lowest share, among the districts with a plot open to buy) and opens a stand on each, L2 or L3 on a Prime or Landmark plot, with a henchman on guard. Its war chest is $10,000 or 1% of your Net Worth, whichever is more: a fresh one if it had gone home, more money if it's still here. It sits out raids on you the night it arrives, schemes like Brock, and goes home when it is bust or out of plots, back on its next date. All placeholders except the 14 and 30 days.

### Reputation

| Rule | Value |
|---|---|
| Start | 3.0 stars, kept within 1–5 |
| Daily drift | At closing, 5% of the gap toward a target: 3.0 + 0.4 per average stand level above L1 (every stand counts, a wrecked one too), capped at 4.6, less 0.1 star per 10% of the day's would-be buyers who left empty-handed (too pricey, line too long or sold out) |
| Free Sample Day | +0.1 star |
| Taste-Off win | +0.1 star (the winner, rivals included) |
| Food Critic | +0.1 star if the stand passes all three checks for the district's main crowd (a short line, a fair price, a card they love or that shines there); −0.1 if any fails or it sold no cup. The line is short while under 5% of the stand's walkers leave over it (placeholder) |
| Helicopter VIP delivered | +0.2 star (ships, Supply Deals and Mega Contracts add none) |
| A failed or overrun delivery | −0.3 star, once per order |
| Cold Brew's smear posters | −0.1 star (placeholder; see Schemes) |
| Daytime raid | −0.1 star (−0.2 for a daytime Smash or HQ Assault; nothing for a squad of Gentle Giants alone) |
| Raiding a kid stand on Kids' Lemonade Day | −0.5 star |
| Releasing a captive | +0.05 star |
| Breaking a Truce | −1 star |
| VIP gates | Helicopter 3.5, Ship 4.0, Mega 4.5 stars |
| The Beloved ending | 4.0 stars or more at victory, and more buyouts than Smashes and HQ captures; otherwise the Iron Pitcher |

Rivals keep stars by the same rules: their own drift from their stands, and the Taste-Off's +0.1.

### Starting conditions

| Item | Value |
|---|---|
| Cash | $150 |
| Plot | Lottie's Corner, Maple Row ($300 land, 400 passersby a day) |
| Stand | L1 Folding Table (counts as $100 invested) |
| Recipes | Classic, Pink, Mint |
| Reputation | 3.0 stars |
| Crew and defenses | None (Dex joins on Day 4) |
| Starting Net Worth | About $525 |
| Day 3 | Lottie sells you her side lot by the Corner for $300 ($300 land, 300 passersby a day), an L1 table included: your second stand. The offer holds a week, through Day 9 (placeholder), and her table counts as $100 invested, like the Corner's |

### Story

The campaign's five acts are Lottie's Corner, Surf & Turf, Grounds for Revenge, Fields & Fizz and The Big Squeeze, and each ends on its climax. Sandbox and Endless have no acts, so anything that asks for one reads it from rank: Ranks 1–3 Act 1, Rank 4 Act 2, Ranks 5–6 Act 3, Ranks 7–8 Act 4, Ranks 9–10 Act 5.

#### Lessons

One system a day. Each lesson's buttons appear on its day; with lessons switched off, buttons follow rank alone.

| Day | Lesson | Lottie's goal |
|---|---|---|
| 1 | Price, the story and the rivals; Lottie stocks your table | Sell out your first pitcher (10 cups) |
| 2 | Recipes, the forecast, the Market and Auto-Restock | Match a recipe to the weather |
| 3 | Threat lemons, the Picket Fence and Lottie's side lot; the first raid comes that night | Fence the Corner; run both stands with no sell-outs |
| 4 | Guards: Dex Moody joins free | Station Dex for the night |
| 5 | Upgrades and the Rank badge | Build the Wooden Stand |
| 6 | Marketing | Paint your first sign |
| 7 | Land: the Land Registry | Open a stand in Old Town |

#### Lottie's Goals

| Rule | Value |
|---|---|
| Goals | Three at a time: a short one, a medium one and a long one |
| Reward | A share of the last 3 days' average sales, rounded: short 10% (at least $5), medium 25% (at least $20), long 50% (at least $50) (placeholders). Lottie's Gold Stars tip adds 50% |
| Today's sales goal | 90% of the cups every stand should sell on the forecast, set at dawn, and never under a pitcher's 10 (the 90% is a placeholder) |
| Grow Net Worth | 1.25× today's Success Score (placeholder) |
| Top your best | 1.1× your best Success Score (placeholder) |

Act 2's payback goals wait for Rank 3, when raids open, and Dex's push for a Clubhouse comes ahead of them.

#### Beats and scenes

| Beat | Rule |
|---|---|
| Scenes | Each runs under 60 seconds, and skipping one leaves its one-line recap. A recipe page won outright gets a short scene of 5 lines, 4.2 seconds a line (about 21 seconds) |
| Who goes first | A boss's exit, then the dated scenes (the opening, the Steward, Dex), then story beats, then visits (Marisol, Sheriff Budd, Mayor Fontaine, Act 5's land freeze). A visit that misses its day doesn't count as seen |
| Marisol's record day | A day's profit at least 10% over the best day so far (placeholder). Her first in the campaign is a visit the next Morning Prep; if a story beat takes that morning, she comes with the next record. After that it's her line in the day's news |
| Preston's handshake (Act 3) | 3 days into Act 3, once Sit-downs open at Rank 4, FizzCo offers a Truce for the usual tribute. The offer stands for 3 Morning Preps (both placeholders) |
| The night flight (Act 3) | The morning after Cold Brew's first Sabotage on you. With none 7 days into Act 3, Juni calls anyway (placeholder) |
| The first chopper (Act 4) | A movie star's pool party: 4,000 bottles (Pink, if it's in your book) at $30, $120,000, offered to you alone with no rival bid. FizzCo hits its pickup if it may raid you (see Raids) |
| The first ship (Act 4) | The Citrine Bay Regatta's flagship, at the tier's size and pay, offered to you alone. Before Act 4 a Pad or Jetty takes ordinary offers |
| The Lavender auction (Act 5) | Opens the morning Act 5 begins, at Rank 8 (see Land, repairs and loans) |
| Tea at the Manor (Act 5) | The morning the Lavender auction's gavel falls, or 5 days into Act 5 at the latest (placeholder) |
| Victory | The Bay paints itself yellow from Lottie's Corner over 5.5 real seconds before the ending plays (placeholder) |
| Endless cameos | A beaten boss drops by every 5 days, the beaten bosses taking turns (placeholder) |
| Names | The Grandkid's name and the crew's: up to 20 characters (placeholder) |

#### Phone calls

| Call | When |
|---|---|
| A boss in a mood | Their Grudge toward you jumps 8 or more at once (a raid of yours adds 8 or 20) or climbs past 30, spoiling for a fight; or their Attention on you, beyond Threat, is up 0.5 or more from one dawn to the next (all placeholders) |
| After a raid | A boss who hit you last night calls at dawn, gloating, or sore that you held |
| Story calls | Brock on Day 1, once your stand opens; Vera each time Threat rises; Tilly each time you take another plot in The Groves; Preston as Act 4 opens and Vera as Act 5 opens (Juni's first call follows Act 3's night flight) |

Story calls outrank tonight's raid warnings, which outrank a boss in a mood. The Bugle's morning brief and Juni's Endless tips read the same Grudge line of 30.

### Other rule numbers

The design spec's Appendix A collects these from its sections so every number has one home; each is checked against the code.

| System | Rule | Number |
|---|---|---|
| Stands | Stock each level holds, L1 to L5 | 300 / 750 / 1,800 / 4,500 / 10,500 cups |
| Pricing | Appeal when priced under the ceiling | +10% per 10% under, up to +25% |
| Pricing | Buyers lost when priced over the ceiling | A quarter per 10% over; nobody buys at 40% over |
| Reputation | Buyers who leave without a cup | Target drops 0.1 star per 10% of buyers |
| Weather | Storm damage to L1 and L2 stands | 25% of HP |
| Repairs | A Damaged stand | 15% of what was invested × the share of HP lost |
| Crew | Recruit pool and starting Nerve | 6 recruits; Nerve 50 |
| Crew | Trait numbers | Eagle Eye +10% detection; Sprinter +25% speed; Gentle Giant +50% HP and −30% Hit; Hothead +15% Hit and −20 Nerve; Butterfingers 10% drop chance; Lumberjack +50% Chop (the rest are in Combat) |
| Crew | Guard posts on buildings other than stands | 3 |
| Combat | Commands | Rally +20 Nerve for 10 s, every 30 s; Fall Back once per fight; Ring the Bell once per raid |
| Combat | Time on target for a Shakedown or Sabotage | 10 game minutes |
| Combat | Nabbed guards | Ransom equals their hire fee; releasing a captive gives +0.05 star |
| Events | Raiding a kid stand on Kids' Lemonade Day | −0.5 star |
| Rivals | Breaking a Truce | −1 star; no rival accepts a Truce for 14 days |
| Rivals | Trophy perks | Blender Bar +20% top price; Juni's Grapevine 1 game hour; Hollis Orchards +10% traffic per Grove; Bottling Line 25%; Family Silver 10% |
| Rivals | Grow / Guard / Strike splits | See the Rivals table |

### Day calls (src/sim/calls.ts `CALLS`)

One call on Day 1 (a rival undercut), two on every later business day (Day 3: a rush or a heckler, then the rumor of Night 3's raid). Unanswered calls lapse after 60 game minutes with no effect (only without a player: the game waits for a pick).

| Call | Choices and what they cost |
| --- | --- |
| Rival undercut | Cut your price 25¢ · Free samples $10, +20% walkers today · Hold firm, −20% walkers today |
| Rival heckler | Pay him off $8 · Chase him off, +6 Grudge with that gang · Ignore him, −15% walkers today |
| Thirsty rush (+30% walkers today either way) | Raise the price 50¢ · Keep it fair, +0.03 stars |
| Sheriff's permit | Pay $15 · Talk her down: half the time nothing, else a $30 fine |
| Raid rumor | Rush the next fence in at 1.5× its price · Post your free guards · Bring it on. Any answer: that gang comes for that plot tonight |
