# Lemonade Stand Wars — Game Prompt & Design Spec

Nov 6, 2026 · @Benjamin Noble

## At a glance

Lemonade Stand Wars is a laid-back lemonade tycoon with a turf war on top: grow Grandma Lottie's folding table into a citrus empire across Citrine Bay, defend every stand from rival drink gangs, and win by owning the whole map or play forever for a high score.

You start with one stand on a quiet suburban corner. Profits buy stand upgrades (5 levels), marketing, land, fences and a crew. Your rising Success Score (your net worth) unlocks bigger customers, from block parties to movie stars arriving by helicopter, and it also puts a bigger target on your back.

### The big decisions

| Decision | Call |
| --- | --- |
| Title | Lemonade Stand Wars (Ben's pick). "The Big Squeeze" names the top rank and the finale |
| Genre | Real-time-with-pause tycoon and territory builder with auto-battle raids, single player |
| Tone | Cartoon turf-war comedy, rated about E10+. No guns, no blood, nobody dies |
| Difficulty | Laid Back, Classic or Cutthroat: calm by default, real challenge on demand |
| Time | One game day takes about 5 minutes: sell by day, defend by night |
| Meters | Cash, Success Score with 10 ranks, Reputation stars, Threat 1 to 5 |
| World | Citrine Bay: 8 districts, 116 plots, 5 rival drink factions |
| Combat | Fists, then clubs, then hatchets. Fights resolve on their own, with the odds shown first |
| Winning | Eliminate every rival and hold a majority of every district, or play Endless for a high score |
| Look and sound | Kitchen-Table Clay visuals and a Surf-Noir Lounge soundtrack |

### Assumptions

- "Similar to Owl World" means Ben's own game, The Owl and the Seven Scrolls: a source of code and techniques only (how it builds terrain, sky, water, roads, crowds, ships, aircraft and its flight camera), never its world or map. Citrine Bay is designed fresh for this game, at whatever size and shape the game needs, and Owl World's flight camera returns as a scouting seagull.
- The tech stack is out of scope; Design decisions for the build lists the commitments the build must honor.
- Every number is tuned with an economy simulation and collected in Appendix A.

The game prompt below is paste-ready for an AI builder or a team. Everything after it is the spec it points to.

## The game prompt

This is Ben's original idea rewritten as a complete, tech-agnostic brief: paste it into an AI builder or hand it to a team, and point them at this spec for every rule and number.

```markdown
# Lemonade Stand Wars — game prompt

Build Lemonade Stand Wars, a laid-back lemonade-stand tycoon with a cartoon turf war on top. The player turns Grandma Lottie's rickety folding table into a citrus empire across the sunny coastal town of Citrine Bay, defends every stand from rival drink gangs, and wins by owning the whole map, or keeps playing forever for a high score.

## The experience
- Fun first. Easy to learn and calm by default, with real challenge for players who want it (Laid Back, Classic and Cutthroat difficulty).
- Tone: a mob-movie parody played with lemonade, grandmas, surf bros and goofy henchmen. Slapstick only: no guns, no blood, nobody dies. Knocked-out characters see stars and wobble home.
- Real time with pause. One game day takes about 5 minutes: sell by day, defend by night.

## Core loop
1. Start with one stand and a little cash. Pick a recipe, set a price, read the weather forecast, stock lemons, sugar and ice, and sell to passing customers.
2. Spend profits to upgrade the stand through 5 levels: Folding Table, Wooden Stand, Kiosk, Lemon Shack, Citrus Palace. Each level draws more foot traffic, serves more cups, earns a higher price and is tougher to smash.
3. Upgrade marketing (hand-painted signs, flyers, a radio jingle, billboards and TV, a Lemon Blimp) and run local campaigns to pull in more people.
4. Buy land to open new stands and expand district by district.
5. Defend: picket fences, chain-link, sharpened stakes, barbed wire and a fortress wall, gadgets like a Guard Goose, and guards stationed at each stand. Rival henchmen raid your stands, mostly at night, always with a warning first.
6. Fight back: hire guards, arm them with fists, then clubs, then hatchets (never guns), and send squads to smash, shake down or sabotage rival stands. Smash a rival stand and you get first dibs on buying its land.

## Score, threat and big clients
- Success Score is net worth: cash in the bank + land owned + the value of your stands and buildings, minus loans. It sets your rank, from Sidewalk Squeezer to The Big Squeeze (10 ranks).
- A higher score raises your Threat (1 to 5). Rivals raid more often with bigger, better-armed crews, and at the top they team up as the Syndicate.
- A higher score and a good Reputation also bring wealthy clients with huge orders: helicopters that need a helipad on Field land, and yachts, cruise ships and freighters that need a pier on Dock land. That land starts in rival hands.

## World and rivals
- Citrine Bay has 8 districts (a leafy suburb, Old Town, a college campus, downtown, the boardwalk, the harbor, the farmland groves and the hilltop estates) and 116 plots.
- Five rival drink factions, each with a boss, a home district, a headquarters and a personality: the Sourwood Family (old-money lemonade and the final boss), Hollis Sweet Tea Co., FizzCo soda, the Cold Brew Collective and the Boardwalk Blenders.
- Rivals are always AI. They grow, fortify, raid you and each other, hold grudges, taunt you by phone, and can be beaten at their HQ or bought out.

## Winning
- Domination: eliminate every rival and hold a majority of every district, and the whole map turns lemon yellow.
- Endless Summer: play forever for the highest peak Success Score while new out-of-town rivals arrive.
- Story campaign: 5 acts with Grandma Lottie, her old frenemy Vera Sourwood and a stolen recipe book.

## Look and sound
- Kitchen-Table Clay: Citrine Bay is a plasticine model on Grandma Lottie's kitchen table, with thumb-smudged clay people in stop motion and a HUD made of what's lying on the table. Every faction has its own color and pattern.
- Surf-Noir Lounge music: breezy surf guitar and lounge by day, spy-movie bass during raids, and Lottie's whistled theme that grows with every rank.

## Build commitments (no tech stack implied)
- A tycoon camera that zooms from the whole bay down to the street, plus an optional seagull flight for scouting. Borrow Owl World's code and techniques (flight, terrain, sky, water, roads, crowds, ships, aircraft), not its world: the map is designed for this game, at whatever size it needs.
- At most about 150 animated people on screen on a laptop and 60 on a phone.
- Menus are flat screens over the world, styled like props on Grandma Lottie's kitchen table.
- A deterministic, tick-based simulation (1 tick = 1 game minute, seeded randomness) that runs without graphics for balancing and tests.
- Versioned autosaves, so play-forever runs survive updates.
- Laptop first, phone second.
- Everything buildable by an AI agent working from text.

Follow the full design spec for every rule and number.
```

## Game overview

Lemonade Stand Wars is a single-player tycoon about growing, guarding and expanding a lemonade empire, held up by four pillars and one goal: fun that is challenging but laid back.

&#91;embedded content: design pillars · 4 pillars, 1 goal, 1 foundation\]

Each pillar maps to a group of systems later in this spec. The foundation is the tone every system has to respect.

### Logline and player fantasy

Turn Grandma Lottie's rickety folding table into a citrus empire, one street corner at a time, while rival drink gangs try to smash it to pulp. The fantasy is underdog to kingpin: from a card table on Maple Row to a movie star's helicopter landing on your own helipad.

Tagline: "When life gives you lemons, take the whole town."

### Genre and shape

- A real-time-with-pause tycoon: run stands, set prices, read the weather, upgrade.
- A territory builder: buy land, take districts, paint the map yellow.
- Light base defense and auto-battle raids: prepare well, then watch the brawl play out.
- Single player against five AI rival factions, with a story campaign, a sandbox and an endless mode.

### Audience

- Tycoon and management fans who want a little mischief.
- Casual players: Laid Back mode, pause anytime, 5-minute days and plenty of automation.
- Strategy fans: Cutthroat mode, the Syndicate and endless high scores.
- Ages 10 and up. The comedy works for families.

### Tone and content guardrails

- A mob-movie parody played with lemonade, grandmas, teens and surf bros. Warm, punny and quick.
- No guns, explosives, fire or blood. Nobody dies: knocked-out characters see stars and wobble home.
- Hatchets mostly chop wood. Hits on people happen inside a cartoon dust cloud.
- No real brands or people, and no ethnic or regional stereotypes. Villains are funny, not hateful.
- Target rating: ESRB E10+, PEGI 7 to 12.

### What makes it different

- A real lemonade sim (weather, recipes, prices, location) sits under the turf war, so smart business is the backbone of every fight.
- Defense has personality: a Guard Goose, lemon-peel slicks and sprinkler ambushes.
- Success has consequences: the richer you get, the harder rivals push and the bigger the clients.
- Every district can be taken two ways: smash it and buy the rubble, or buy the rivals out.

## Fun first

Every rule in this spec passes one test before any other: does it make the game more fun? Ben's target is a balance between challenging and laid back, so the game is easy to pick up and relaxing by default, with real pressure for players who go looking for it.

### The moments players should remember

| Moment | Why it lands |
| --- | --- |
| The first line of customers at your folding table | Visible success inside the first 2 minutes |
| A stand transforming into the next level | A big, physical change you paid for |
| A raid bouncing off your fence while the Guard Goose honks | Your preparation paid off, and it's funny |
| Smashing the stand that smashed yours | Revenge with slapstick, not cruelty |
| The first helicopter landing on your own helipad | Spectacle that proves you've made it |
| The map turning yellow, district by district | Progress you can see from the whole-bay view |
| Calling the Big Squeeze on Vera | A finale you choose to start |

### Challenging, but laid back

The game starts calm and turns up the heat as you grow. These levers hold the balance:

- **Difficulty presets.** Laid Back halves the raids, gives longer warnings and has no game over. Classic is the intended balance. Cutthroat brings more raids, short warnings and no bailouts. Sandbox adds Peaceful, with no combat at all.
- **Pressure follows success.** Threat climbs with your rank, so tougher raids arrive once you have the tools to meet them.
- **Automation before chores.** Auto-Restock arrives on Day 2, auto-pricing, bulk upgrades and Auto-Repair at Rank 3 and auto-defense at Rank 4, before a growing empire turns into busywork.
- **Optional depth.** Specializations, sit-downs, sabotage and seagull scouting reward curious players, but nobody has to touch them to win.
- **Short, natural sessions.** A day takes about 5 minutes and ends at a clean stopping point.

### Ten rules every system follows

1. It can be explained in one sentence. Depth comes from how systems combine, not from rule count.
2. There is always a next goal within about 5 minutes: Lottie keeps a short, a medium and a long goal on screen.
3. Losses sting but never ruin. On Classic, one raid never costs more than about one day of income.
4. The odds come before the decision: raid win chances, the weather forecast, and why customers walked past.
5. Big moments get spectacle: stand transformations, rank-up headlines, the first helicopter, boss takedowns.
6. A chore gets automated the moment it becomes a chore, by about the fifth stand.
7. Comedy everywhere: taunts, puns, slapstick and the morning paper's headlines.
8. Rivals are characters with grudges and moods, not spreadsheets.
9. The player sets the pace: pause any time, warnings before raids, auto-pause on big alerts.
10. Challenge comes from smart rivals and big goals, never from hidden rules or punishing randomness.

### Anti-frustration guarantees

- No raids on the player on Nights 1–2. The first comes on Night 3, a tutorial raid: two of Brock's Smoothie Bros come for the till. Any fence, or anyone on guard, sends them home, unless your guards Fall Back and give the fight up; an undefended stand loses its till. After that, no more than 2 nights in a row pass without a raid on you on Classic (4 on Laid Back, 1 on Cutthroat).
- Every raid on the player comes with a warning, even an undetected one.
- Major alerts auto-pause the game (a toggle, on by default; raid warnings start off on Cutthroat).
- A rival whose raid you beat backs off for a few days (the Respect cooldown).
- Cheap rebuilds (15% of what was invested), a rebuild window and Lottie's Cookie Jar soften the worst losses.
- On Laid Back, your stands can be busted and closed for repairs, but never wrecked.

### How we'll know it's fun

Playtests should show these signals before anything else gets built on top:

- New players buy a third plot without being told to, inside their first hour.
- Most first sessions run past 30 minutes, and players say "one more day."
- Players laugh at a phone taunt or a headline in their first hour.
- After losing a stand, players rebuild or retaliate instead of quitting.
- Laid Back players finish Act 1 without feeling stressed; Cutthroat players lose a stand at least once and come back to win.

## Core loops and time

Four nested loops run on one clock, and a game day takes about 5 real minutes at 1×.

| Loop | Length | Main decision | Payoff |
| --- | --- | --- | --- |
| Moment | Seconds | Price, recipe, which alert to answer | The queue grows; a raid bounces |
| Day | About 5 minutes at 1× | What to buy, build and guard before night | Profit, then a dawn autosave |
| Session | 4–6 days, 30–50 minutes | Which of Lottie's Goals to chase | A goal reward, often a rank-up |
| Campaign | About 140–150 days, 19–20 hours | Which district and rival to take next | A map painted yellow |

### Clock and speed

The clock runs at 1×, 2× or 3× and pauses any time; each tick is one game minute, 1,440 a day. At 1×, business hours (08:00–20:00) take about 3.5 minutes and night (20:00–08:00) about 1.5 minutes. A game hour lasts about 18 real seconds by day and 8 at night.

When a brawl starts, the clock slows to 1 game minute per real second, so most fights last 30–90 real seconds at any speed. Raid warnings auto-pause by default on Laid Back and Classic, because 15 game minutes of night pass in about 2 real seconds. On every difficulty, paused first or not, the last stretch before a raid lands runs at that fight speed: the final 30 game minutes on Laid Back, 15 on Classic and 5 on Cutthroat last that many real seconds. Before that stretch, a detected raid's longer warning runs at the speed you chose. Quiet nights are skipped: when nothing is coming for you, Sleep goes straight to dawn. A raid night plays at 12× until the warning comes in (a setting, on by default; picking a speed ends it until dawn). Your own raid's trip, fight and walk home play at the speed you chose.

Seasons last 14 days, so a year is 56 days: Summer, Fall, Winter, Spring. Play opens on Summer Day 1, the first day of summer vacation, and the campaign spans about three years. Summer demand runs ×1.2 and Winter ×0.6, so each year breathes: grow in the sun, fortify in the cold.

### Moment to moment

Tap a stand and its panel opens: price, recipe, stock and why people walked past. Nudge the price tag, and within seconds the queue counter and mood bubbles answer. "Too pricey" bubbles say drop it; a line out the door says raise it.

Between taps, the alert feed offers the next small call: a sold-out stand, a Viral Video, a boss on the phone.

### The daily loop

Every day runs the same five beats. Morning Prep and the Day's end card wait for you.

| Beat | Clock | Real time at 1× | What you do |
| --- | --- | --- | --- |
| Morning Prep | 07:00 | Paused until you're ready | Read the Citrine Bay Bugle: headlines, forecast, Market prices, offers. Buy supplies, set recipes and prices, take orders |
| Business hours | 08:00–20:00 | About 3.5 minutes | Sell through the commute, lunch, afternoon-heat and evening-stroll rushes |
| Evening | 20:00 | The Day's end card waits; folded, a moment | Stands close and the day's profit posts. Station guards, approve repairs, send tonight's raids |
| Night defense | 20:00–07:00 | About 1.5 minutes | Rival raids arrive, always warned; repairs run; ice melts |
| Dawn autosave | 07:00 | Instant | The game saves, rivals spend their earnings, and the next Bugle lands |

A toggle auto-continues Morning Prep and the Day's end card for players who like a running clock. Dawn is the natural place to stop.

### The session loop

Lottie always shows 3 goals, each paying a little cash or a perk. Short goals fit in a day, medium ones in a session, and long ones aim at the next rank or act.

Early ranks come fast: Rank 2 on Day 5, Rank 3 on Day 10. Later ranks take several sessions, so goals carry the pacing between them. Every rank-up brings a Bugle headline, confetti and a pick of 1 of 3 Lottie's Tips perks.

### The long-term loop

Over about 140–150 days you climb to Rank 9 through 5 acts while Threat rises from 1 to 5 sour lemons (see Campaign roadmap). After victory, Endless Summer keeps the clock running for Rank 10 and a Peak Success Score.

Your hands rise as the empire grows. Early chores automate first (see Fun first). By Rank 7, raid templates and district policies (Profit, Fortify or Expand) let you steer districts, not cups.

### The core loop

All four loops turn one engine: every cup sold becomes growth, and growth lifts your Success Score. The diagram below follows one full turn, and what a rising score brings back.

&#91;embedded content: the core loop · 8 steps, 2 feedback paths\]

The top path is the reward for success (bigger orders); the bottom path is its price (bigger threats), and winning fights feeds land straight back into selling.

**Fun check:** Every loop pays off on its own clock: seconds for a queue, minutes for a day, a session for a goal. The guardrails are a clock that waits at dawn, auto-pause on big alerts, and automation that arrives before the chores pile up.

## The world

Citrine Bay is a sunny coastal town of 8 districts and 116 plots, and every plot except the 4 civic ones can change hands.

### Built for this game

Citrine Bay is designed fresh for Lemonade Stand Wars; it is not Owl World's map. Owl World supplies code and techniques only, never its world, scale or layout. The build can size and shape the bay however plays best, as long as its 8 districts, 116 plots and 11 borders hold.

### Geography and borders

The bay lies to the south and east. The north row runs west to east from The Groves' farms through Campus & Arts to Hilltop's headland. Maple Row, Old Town and Downtown's towers fill the middle, and The Boardwalk and The Harbor line the beach.

Old Town, the hub, borders 4 districts: Maple Row, Campus & Arts, Downtown and The Boardwalk. Maple Row also borders The Groves and The Boardwalk, and The Harbor borders The Boardwalk and Downtown. Hilltop Estates borders Campus & Arts and Downtown, and The Groves borders Campus & Arts.

Buying land and sending reinforcements both follow borders (see Land and territory). The Groves, The Harbor and Hilltop Estates have just 2 borders each, and they hold every Field and Dock plot. The land VIP clients need is slow to reach and easy to hold.

### Plots and buildings

| Plot | What it offers | Built there |
| --- | --- | --- |
| Street | The district's base traffic and land price | Stands and most buildings |
| Prime | Traffic ×3, land price ×3 | Big stands: L4–L5 pay back here |
| Landmark | One per district; traffic ×5, land price ×8 | The district's showpiece stand |
| Field | Open land, tiny foot traffic | Helipads, Lemon Groves |
| Dock | Waterfront | Piers |
| Industrial | The Harbor and Downtown edges | Bottling Works, Warehouses |
| HQ | A rival's headquarters: captured, never bought | Your Trophy, once taken |
| Civic | Never for sale | Old Town's services |

Each plot holds one building: a Stand (L1–L5), Clubhouse, Warehouse, Bottling Works, Billboard, Lemon Grove, Helipad or Pier. An owned empty plot is a Vacant Lot, and it still counts toward land value and district control.

Stands within 2 plots of each other split passing customers by appeal, whoever owns them. The same reach powers Billboards, the Billboard Roof and the Watchtower. Neighbors sit beside a plot or across the street, and "within 2 plots" means neighbors of neighbors, across district lines too.

Old Town's 4 civic plots serve everyone. Town Hall and the Registry of Deeds handle deeds and auctions; the Citrine Bay Market sells supplies. The Hiring Hall lists recruits, and Dot's Diner hosts Sit-downs on neutral ground (see Rivals).

### One bay for the story, more for Sandbox

The Story Campaign plays on one hand-made Citrine Bay, so every scene, landmark and border sits where the story needs it. Sandbox's Small, Medium and Large maps are cut from the same bay; only Huge maps are generated (stretch). Generated maps keep the bay's recipe: a neutral start, a contested hub, one Landmark per district, and scarce, rival-held Field and Dock land.

### District rundown

Rows follow the order the campaign reaches them.

| District | Start owner | Plots | Street traffic per day | Special land | Customers | Feel |
| --- | --- | --- | --- | --- | --- | --- |
| Maple Row | Nobody: you start here | 12 | 250–400 | Lottie's Corner, your start plot | Kids, families, seniors | Leafy suburb, picket fences, sprinklers; safe and slow |
| Old Town | Contested: each rival has 1–2 stands | 16 (4 civic) | 500–900 | The 4 civic plots | Everyone | Main Street, bandstand, clock tower; everybody's crossroads |
| The Boardwalk | Boardwalk Blenders (the Blend Shack) | 16 | 700–1,400; summer ×1.5, winter ×0.4 | The Pier (Landmark) | Tourists, joggers | Beach, arcade, lifeguard towers; a summer boomtown |
| Campus & Arts | Cold Brew Collective (the Grindhouse) | 14 | 450–800 | — | Students, artists | Murals, the Quad, record shops; quiet days, sneaky nights |
| The Groves | Hollis Sweet Tea Co. (Hollis Homestead) | 16 | 150–350 | 6 Field plots; the Fairgrounds (Landmark) | Farmhands, fair crowds | Lemon and tea fields, barns, windmills; empty roads, precious land |
| Downtown | FizzCo Beverages (FizzCo Tower) | 18 | 800–1,500 | Prime tower plazas | Office workers | Glass towers, lunch rush; the busiest streets |
| The Harbor | FizzCo's bottling plant and Docks; the rest open lots | 14 | 300–600 | 4 Dock plots | Dockhands | Cranes, warehouses, fish market; slow streets, big ships |
| Hilltop Estates | The Sourwood Family (Sourwood Manor) | 10 | 300–600; customers pay ×2 | 1 Field (polo lawn), 1 Dock (yacht marina) | High rollers | Mansions, country club, hedges; few customers, deep pockets |

The map below lays the eight districts out on the bay.

&#91;embedded content: Citrine Bay · 8 districts, 116 plots, 11 borders\]

Every district can be taken. Field land, for helipads, lies in the Groves and on Hilltop's polo lawn; Dock land, for piers, lies in the Harbor and at Hilltop's marina.

**Fun check:** Every district plays differently: a safe suburb, a summer boomtown, empty fields with priceless helipad land. Borders keep expansion readable: the next district you can enter always touches one you hold.

## Running the business

Each day a stand sells the smallest of three numbers: customers who stop, cups it pours in 10 selling hours, and cups in stock. Recipe, price and supplies are your levers; weather, season and Reputation set the stage.

At Morning Prep you give each stand a recipe card, a Sweetness setting, a price and supplies. Then it sells on its own through four rushes: the morning commute, lunch, afternoon heat and the evening stroll. Nudge anything mid-day, and the stand panel answers within seconds.

### How demand works

Demand is three plain steps, and the stand panel shows every number in them.

1. **Passersby** = plot traffic × stand draw (see Stands) × marketing × season × weather foot traffic.
2. **Stop chance** = 25% × thirst (weather) × appeal, where appeal = curb appeal × recipe match × price fit × Reputation.
3. **Cups sold** = the smallest of demand, service (cups per hour × 10 effective selling hours of the 12 open) and stock.

Curb appeal starts at ×1.0; Billboards and Majority push it (see Marketing, and Land and territory). Stands within 2 plots share passing customers by appeal. Customers you share with your own stands stay yours, so only rival neighbors cost you: up to 35% in a crowded rival block.

Eight segments make up the crowd, each with its own price tolerance, patience and peak hours (see Appendix A). Office workers pay ×1.2 but leave if more than 3 people are ahead; seniors pay ×0.9 and wait behind 10. High rollers pay ×2.0 and accept a line of 2.

Every walk-away leaves a reason on the stand panel: too pricey, line too long, not thirsty, went to a rival, or sold out. Tap a walker in Street View to hear it from them.

### Recipe cards

Each stand pours one card. A card gets ×1.2 appeal where it shines: its districts, its season, or wherever an event fills the street with its fans. Matches never stack, and a card's extras (mint, berries, honey, bubbles) are already in its cost per cup, so switching cards wastes no stock.

| Recipe | Cost per cup | Price bonus | Who loves it | Shines in (×1.2 appeal) | How you get it |
| --- | --- | --- | --- | --- | --- |
| Classic Lemonade | $0.21 | 0% | Everyone; families and seniors most | — | Start |
| Pink Lemonade | $0.24 | +5% | Kids, families | Maple Row | Start |
| Mint Lemonade | $0.25 | +5% | Students, joggers | Campus & Arts, The Boardwalk | Start |
| Strawberry Lemonade | $0.32 | +10% | Kids, tourists | Maple Row, The Boardwalk | Win the Summer Fair Taste-Off (Act 1); any fair win in Sandbox |
| Frozen Lemonade | $0.30 | +15% | Tourists, students | The Boardwalk; Summer and Heat Waves | Blenders eliminated |
| Honey-Ginger Hot Lemonade | $0.30 | +10% | Seniors | Maple Row, Old Town; Winter (ignores the Winter penalty) | Cold Brew Collective eliminated |
| Sparkling Lemonade | $0.32 | +15% | Office workers | Downtown | FizzCo eliminated |
| Lavender Lemonade | $0.40 | +25% | High rollers | Hilltop Estates | The Hilltop estate auction (Rank 8; in the campaign, once Act 5 opens) |
| Hollis Half-and-Half | $0.25 | +10% | Workers | The Groves, The Harbor; Summer | Hollis beaten or bought out |
| Lottie's Secret Reserve | $0.45 | +30% | Everyone | Everywhere, at ×1.3 appeal | Sourwood Manor's Boss Room (the finale) |

The **Sweetness** dial (Less, Classic or Extra) shifts appeal 10% by segment. Extra wins kids but costs you seniors and office workers; Less does the reverse, and Classic is neutral. A Maple Row stand might run Less for the morning seniors and Extra for the afternoon kids.

### Pricing: what customers will pay

Each stand has a ceiling, the most its crowd will pay, and the price tag marks it. Ceiling = the stand level's top price × the district's price tolerance × the card's price bonus. Tolerance runs from ×0.9 (Campus & Arts, The Harbor, The Groves) to ×1.2 on The Boardwalk and ×2.0 in Hilltop Estates.

Price fit is ×1.0 at the ceiling. Each 10% under it adds 10% appeal, up to +25%: handy in a price war, though rarely worth it alone. Each 10% over it turns away a quarter of buyers, and nobody buys at 40% over.

Over the ceiling, the thriftiest leave first: kids (×0.8) and students (×0.85), while tourists (×1.3) and high rollers hang on longest. At 40% over even they walk. So Lottie's rule of thumb holds: a line out the door says raise it; "too pricey" bubbles say drop it. Marisol's Auto-Price (Rank 3) holds every stand at that sweet spot.

### Supplies

A cup of Classic costs about $0.21: lemons $0.10, sugar $0.03, ice $0.03, plus a flat $0.05 for the cup and napkin. The Citrine Bay Market opens at dawn, and the Bugle prints the day's prices, up to 20% above or below normal. Lemon Blight and Sugar Shortage double a price for 5 days (see Events and the living world).

Stock ages three ways: ice melts every night, lemons spoil after 3 days, and sugar keeps. A stand holds only so many cups of stock (see Stands), and a sold-out stand turns customers away.

Lottie stocks your table on Day 1. From Day 2 you buy your own, and **Auto-Restock** tops each stand up to a target you set, every dawn at that day's price. Its suggested target is the forecast day's expected sales.

Supplies stay a small bill all game, so nothing exists just to trim them: Lemon Groves bring customers instead of discounts (see Land and territory).

### Weather and seasons

The dawn forecast is about 80% right, and a miss is one step off: Warm instead of Hot, never Storm instead of Hot. The Radio Jingle (M3) adds a 2-day look ahead. Temperatures show in °F, with a °C option.

| Weather | Temperature | Thirst | Foot traffic | Note |
| --- | --- | --- | --- | --- |
| Scorcher | 95°F+ | ×1.6 | ×1.0 | Heat Waves chain 3 in a row |
| Hot | 85–94°F | ×1.3 | ×1.0 |  |
| Warm | 72–84°F | ×1.0 | ×1.0 |  |
| Cloudy | — | ×0.8 | ×0.9 |  |
| Rainy | — | ×0.5 | ×0.7 |  |
| Storm | — | ×0.2 | ×0.4 | L1–L2 stands lose 25% HP (see Stands) |

Seasons scale demand: Summer ×1.2, Fall ×0.9, Winter ×0.6 and Spring ×1.0. The Boardwalk swings to ×1.5 in Summer and ×0.4 in Winter. Each season's weather odds are in Appendix A.

### Reputation

Reputation runs from 1.0 to 5.0 stars and starts at 3.0. It multiplies appeal from ×0.7 at 1 star to ×1.3 at 5. It also gates VIPs: helicopters need 3.5 stars, ships 4.0 and Mega Contracts 4.5.

Each night it drifts 5% of the way to a target: 3.0 stars plus 0.4 per average stand level above L1, capped at 4.6. Service counts too. The night's target drops 0.1 star for every 10% of would-be buyers who left empty-handed (too pricey, line too long, sold out).

| What happened | Stars |
| --- | --- |
| Free Sample Day | +0.1 |
| Taste-Off win | +0.1 |
| Food Critic visit (see Events and the living world) | +0.1 or −0.1 |
| Helicopter VIP delivered | +0.2 |
| Daytime raid you launch | −0.1 (−0.2 for a daytime Smash) |
| Failed or overrun VIP delivery | −0.3 |
| Raiding a Kids' Lemonade Day stand | −0.5 |
| Breaking a Truce | −1.0 |

Releasing a Nabbed raider helps, and Cold Brew's smear posters hurt (see Crew and combat, and Rivals). Below 2.0 stars, each daytime raid you launch earns a Citation from Sheriff Budd. It costs about a day's income and bans your raids for 2 days.

### Worked example: a hot Summer day at Lottie's Corner

It's Day 3, Hot (88°F), at Lottie's Corner: an L1 Folding Table on a Maple Row plot with 400 passersby a day. You pour Pink at Classic sweetness, price at the $1.57 ceiling, and Auto-Restock holds 200 cups. Reputation is 3.0 stars, with no marketing and no rivals nearby.

| Step | Math | Result |
| --- | --- | --- |
| Passersby | 400 × 1.0 (L1 draw) × 1.2 (Summer) × 1.0 (Hot foot traffic) | 480 |
| Stop chance | 25% × 1.3 (Hot thirst) × 1.2 (Pink in Maple Row) × 1.0 (at the ceiling) × 1.0 (3.0 stars) | 39% |
| Demand | 480 × 39% | 187 cups |
| Service | 20 cups an hour × 10 selling hours | 200 cups |
| Cups sold | Smallest of 187, 200 and the 200 in stock | 187 |
| Revenue | 187 × $1.57 (ceiling: $1.50 × 1.0 × 1.05) | $293.59 |
| Supplies | 187 × $0.24, plus 13 cups of ice melting overnight ($0.39) | −$45.27 |
| Upkeep | L1 Folding Table | −$5.00 |
| Profit |  | $243.32 |

On a Scorcher the same table would draw 230 customers but pour only 200, so 30 would leave a long line. A Wooden Stand here sells about 280 cups at $2.10 and clears about $505, repaying its $400 in under 2 such days. On a Rainy day the table sells just 50 cups, and stocking 200 melts $4.50 of ice.

### Day calls

Once on Day 1 and twice on every later business day, a small decision breaks in at one of your stands, and the clock waits for your pick. Every choice costs cash, customers, Reputation or a gang's Grudge: a rival undercuts you, a rival kid heckles your line, a thirsty rush arrives, Sheriff Budd checks your permit, or word comes of tonight's raid, and whatever you answer, that gang comes for that plot. Day 3's second call is the rumor of Night 3's raid. The numbers are in Appendix A.

**Fun check:** Every lever answers in seconds: a price nudge moves the queue, a recipe swap lights mood bubbles, and walk-aways say why. The guardrails are one demand chain you can read off the stand panel, Auto-Restock from Day 2 and Auto-Price at Rank 3.

## Stands

Every stand climbs 5 levels; each upgrade buys more passersby, a faster pour and a higher price ceiling, and pays back in 2–15 days.

### The five levels

| Level | Rank | Cost | Draw (traffic ×) | Service (cups/hour) | Top price | Stock (cups) | HP | Upkeep ($/day) | Guard posts | Payback (days) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| L1 The Folding Table | 1 | $150 to build new | ×1.0 | 20 | $1.50 | 300 | 100 | 5 | 1 | — |
| L2 The Wooden Stand | 1 | $400 | ×1.5 | 50 | $2.00 | 750 | 300 | 15 | 2 | 2–4 |
| L3 The Kiosk | 3 | $3,500 | ×2.3 | 120 | $3.00 | 1,800 | 800 | 60 | 3 | 4–7 |
| L4 The Lemon Shack | 5 | $60,000 | ×3.5 | 300 | $4.50 | 4,500 | 2,000 | 300 | 4 | 4–11 |
| L5 The Citrus Palace | 7 | $650,000 | ×5.0 | 700 | $7.00 | 10,500 | 5,000 | 1,500 | 6 | 11–15 |

Costs are per step, so a Kiosk built on an empty plot costs $150 + $400 + $3,500 = $4,050, paid at once. Upgrades are instant: a crate drops, its slats fall open, and the new level starts selling (see Visual style and art direction).

Stock is the cups of lemons, sugar and ice a stand can hold: one and a half days of selling at full speed. Upkeep is charged at closing every day (see Economy and balance).

Paybacks assume a fitting plot: any Street plot for L2–L3, about 1,800 passersby a day for L4 and 4,000 for L5. Quieter plots stretch them: an L4 on the Maple Row Landmark takes about 14 days.

### What each upgrade feels like

| Level | How play changes |
| --- | --- |
| L1 The Folding Table | Lottie's own card table. At 20 cups an hour, a Scorcher's line outgrows it by mid-afternoon |
| L2 The Wooden Stand | The Day 5 lesson: 1.5× the passersby and 2.5× the pour for $400, repaid in 2–4 days |
| L3 The Kiosk | The workhorse: it pays back almost anywhere, opens the first specialization slot and takes Local Orders (see VIP clients) |
| L4 The Lemon Shack | A plot decision: it wants a busy Prime or Landmark. Its ice machine makes ice as needed, so none melts overnight, and a third gadget slot opens (see Defenses) |
| L5 The Citrus Palace | The showpiece: $1,500 a day in upkeep, so only the busiest plots carry it. It opens a second specialization slot, and Rank 10 gilds its dome |

Ice-machine ice costs the same as Market ice, and a Power Outage stops the machines for a day (see Events and the living world).

### Specializations

A Kiosk opens one slot for $2,000, and a Citrus Palace opens a second for $40,000. Each slot holds one specialization; swapping later costs the slot price again.

| Specialization | Effect | Best on |
| --- | --- | --- |
| Express Window | +30% service (cups/hour) | A stand with a line out the door |
| Fancy Menu | +20% top price | Rich crowds: Downtown, The Boardwalk, Hilltop Estates |
| Fortified Frame | +50% HP | A front-line stand rivals keep targeting |
| Billboard Roof | +15% traffic to your stands within 2 plots | The middle of your own cluster |

### Damage, repairs and rebuilds

A damaged stand sells at its HP share of capacity: at 60% HP it pours 60% of its cups an hour. Damage comes from raids, Storms and the late-game Hurricane, and it shows in steps (see Visual style and art direction).

| State | How it happens | What it means | The fix |
| --- | --- | --- | --- |
| Damaged | Any hit short of 0 HP: a raid that runs out of time, a Storm (L1–L2 stands lose 25% HP), a Hurricane | Open, selling at its HP share | Repair: 15% of what was invested, scaled by the HP lost (half HP costs 7.5%) |
| Busted | Laid Back only: a raid that would have Wrecked your stand | Closed | Repair: 10% of what was invested |
| Wrecked | A Smash takes HP to 0 (Classic and Cutthroat) | Closed: a neat plank pile | Rebuild within 24 game hours: 15% of what was invested. Otherwise the plot goes For Sale |

Repairs and rebuilds happen overnight: approve one by closing time, and the stand opens at dawn as good as new. A stand smashed at night therefore misses a day of sales on top of the bill. Auto-Repair (Rank 3) approves them for you.

A Kiosk ($4,050 invested) at half HP costs $304 to repair; Wrecked, it costs $608 to rebuild.

An unrebuilt plot follows Knock it down, buy it up: First Dibs for whoever smashed it, then an auction (see Land and territory). On Laid Back your stands are only ever Busted, so a raid can close one but never cost you the plot. Rival stands can still be Wrecked on every difficulty.

**Fun check:** Each upgrade is a crate-reveal transformation that pays for itself in days, and matching level to plot is the puzzle. Losses stay bounded: a Smash costs 15% of the stand plus a day, and Laid Back never wrecks.

## Marketing

Marketing multiplies passersby: five permanent brand tiers lift traffic everywhere by up to 50%, and local campaigns aim short bursts. Benny Buzz, your ad man, pitches each one in slogans.

### Brand tiers

Tiers are bought once, in order, and last forever. Each replaces the last, so its bonus is the total: the Radio Jingle means +22%, not +39%.

| Tier | Name | Rank | Cost | Traffic everywhere | Extra |
| --- | --- | --- | --- | --- | --- |
| M1 | Hand-Painted Signs | 1 | $100 | +5% | Benny paints your first sign (the Day 6 lesson) |
| M2 | Flyers & Sidewalk Chalk | 3 | $1,500 | +12% | — |
| M3 | Radio Jingle | 4 | $12,000 | +22% | A 2-day weather forecast; your jingle airs on 101.5 The Squeeze |
| M4 | Billboards & TV Spot | 7 | $90,000 | +35% | Unlocks the Billboard building |
| M5 | The Lemon Blimp | 8 | $500,000 | +50% | A yellow blimp floats over the bay |

### Local campaigns

Campaigns are targeted and temporary, and you can run several at once.

| Campaign | Rank | Cost | Effect | Lasts |
| --- | --- | --- | --- | --- |
| Sandwich-Board Kid | 2 | $40/day | +20% traffic at one L1–L3 stand | 1 day, renewable |
| Free Sample Day | 2 | 100 free cups | +0.1 star; +15% traffic at that stand | 3 days |
| Sunny the Lemon mascot walk | 3 | $300/day | +25% traffic for your stands in one district | 1 day, renewable |
| Coupon Blitz | 4 | Your prices −25% | +40% customers in one district | 1 day |
| Event Sponsorship | 5 | $2,000 per festival day | +50% traffic for your stands in the festival's district | The festival |
| Billboard building | 7 (needs M4) | $25,000 to build | Your stands within 2 plots +20% traffic; rival stands there −10% appeal | Permanent |

There is only one Sunny, so the mascot walks one district a day. Only one Free Sample Day runs at a time across your empire, so its star can't be farmed.

A Coupon Blitz's +40% is appeal, in place of the usual +25% for that price cut (see Running the business). It also wins the split against rival stands nearby, so it answers a rival price war.

Event Sponsorship turns any festival into your party, from the County Fair to the Winter Lights Market (see Events and the living world). A Billboard is a building, so it needs a plot of its own; it does the most good in a contested block.

### How marketing stacks

Every traffic bonus adds into one marketing number: brand tier, campaigns, Billboards, Billboard Roofs and Taste-Off wins. That number multiplies the plot's traffic along with stand draw, season and weather. Surges written as ×2, like a Viral Video, multiply on top.

For example, an Old Town Kiosk on a 700-passerby street draws 700 × 2.3 = 1,610 passersby. With the Radio Jingle (+22%) and Sunny (+25%), that's +47%: 2,367 passersby.

Marketing fills the sidewalk, not the cups. A stand already at its service limit just grows a longer line, so upgrade it or add an Express Window first (see Stands). Campus & Arts at Full Control halves every local campaign's cost (see Land and territory): the cash, a Free Sample Day's cups (50) and a Coupon Blitz's price cut (−12.5% for the same +40%). A Billboard is a building, so it still costs $25,000.

### Rival marketing

Rivals market by the same rules, and FizzCo spends the most.

| Move | Who | What it does | Your answer |
| --- | --- | --- | --- |
| Ad blitz | FizzCo | Campaigns for its own stands pull shared customers its way | Sunny or a Coupon Blitz in the same district |
| Price war | Any rival | Prices under the ceiling win the split near your stands | A Coupon Blitz, or patience: a price war costs them too |
| Cease-and-Desist | FizzCo | Blocks your marketing in one district for 3 days: your tier bonus, campaigns and Billboards count for nothing there | Spend in the next district over; the letters stop when FizzCo falls |
| Smear posters | The Cold Brew Collective | Graffiti posters dent your Reputation | Free Sample Days win the stars back; Lookouts and Floodlights catch the night crews (see Defenses) |

A Cease-and-Desist arrives with a fruit basket, and Lottie keeps the basket.

**Fun check:** Marketing is the instant, visible lever: paint a sign and the sidewalk fills by lunch. Every bonus is a plain percentage that adds up, tiers never expire, and campaigns are optional bursts, never a chore.

## Land and territory

Every plot you own adds its full value to your Success Score, and holding 51% of a district gives your stands there +10% sales. Skip Larkin, your realtor, finds the deals, and deeds go through the Registry of Deeds at Town Hall.

### Where you can buy

Buy any unowned plot in Maple Row from Day 1 and in Old Town from Rank 2. From Rank 3, buy in any district where you hold a Foothold, or that borders one (see The world for the 11 borders).

In the campaign, Rank 3 opens The Boardwalk, The Groves, Campus & Arts and Downtown. The Harbor and Hilltop Estates open once you hold a plot next door. In Sandbox, your start district is open from Day 1, and the border rule starts at Rank 2.

Unowned plots sell at land value, on the spot: tap a For Sale sign or open the Land Registry. Rival plots change hands only through Plot Buyouts, First Dibs, Fire Sales and auctions.

### Prices, growth and tax

| District | Street plot | Special plots |
| --- | --- | --- |
| Maple Row | $600–1,200 | — |
| Old Town | $8,000–16,000 | — |
| The Boardwalk | $12,000–24,000 | — |
| Campus & Arts | $12,000–24,000 | — |
| The Groves | $3,000–6,000 | Field $40,000–80,000 |
| Downtown | $60,000–120,000 | Industrial $20,000–40,000 |
| The Harbor | $6,000–12,000 | Industrial $20,000–40,000; Dock $100,000–200,000 |
| Hilltop Estates | $240,000–480,000 | Field $120,000–240,000; Dock $300,000–600,000 |

A Prime plot costs 3× and the Landmark 8× a Street plot in the same district. Lottie's Corner is worth $300.

Land value grows as a district develops, up to ×2. Development = every faction's stand levels in the district ÷ (4 × its purchasable plots), capped at 1. Each facility tier counts as 2 levels.

Maple Row has 12 plots, so twelve Kiosks (36 levels) lift its land ×1.75, and Lottie's $300 corner becomes $525.

Land carries no tax or upkeep. To sell a plot, put it up for a 24-hour sealed-bid auction with bids opening at land value; if nobody bids, it stays yours.

### District control

Control is your share of a district's purchasable plots; civic and HQ plots don't count. Domination needs Majority in every district (see Game modes and winning).

| Tier | Share | Effect |
| --- | --- | --- |
| Foothold | At least 1 plot | You can buy and raid here; from Rank 3, bordering districts open for buying |
| Majority | 51%+ | Your stands here +10% sales; rival stands here −10% appeal; unowned land here 10% cheaper for you |
| Stronghold | 75%+ | Raids into the district are detected more often, and your reinforcements arrive faster (see Defenses) |
| Full Control | 100% | The district's perk, below |

| District | Perk at Full Control | Effect |
| --- | --- | --- |
| Maple Row | Neighborhood Watch | A free Tin-Can Alarm on every plot you own there; all raids anywhere +10% detection |
| Old Town | Town Favorite | +10% traffic at your stands in Old Town and Maple Row |
| Campus & Arts | Word of Mouth | Local campaigns half price everywhere |
| Downtown | Power Lunch | Lunch rush (12:00–14:00) ×1.5 at your stands in Downtown and Old Town |
| The Boardwalk | Tourist Trap | Tourists pay +20% everywhere |
| The Harbor | Shipping Lane | Ship contracts pay +15% |
| The Groves | Orchard Fresh | +10% traffic at all your stands |
| Hilltop Estates | Old Money | VIP offers 50% more often |

A perk lasts while you hold every plot. Lose one, and it switches off until you win the plot back.

### Vacant Lots

An owned plot with no building is a Vacant Lot. It counts toward land value and control, but it sells nothing and costs no upkeep.

With nothing to smash, a Vacant Lot can't be Wrecked, so it changes hands only by sale or buyout. Lots are a calm way to round a district up to Majority, or to hold a Field until your Rank unlocks its facility.

### For Sale, First Dibs and auctions

Knock it down, buy it up is how land changes hands by force.

1. A Smash leaves any rival building but an HQ Wrecked, from a stand to a Pad or a Lemon Grove.
2. Its owner has 24 game hours to rebuild, at 15% of what was invested. Rivals who can afford it rebuild by personality: the Blenders 40% of the time, Cold Brew 50%, Hollis 60%, FizzCo 70%, the Sourwoods 80%. Each Smash on that plot in the last 7 days cuts the chance by 30 points, and the Raid Planner shows it before you raid ("they rebuild: 70%").
3. If it isn't rebuilt, the plot goes For Sale. Whoever smashed it gets First Dibs: 24 game hours to buy it at 100% of land value.
4. Then a 24-hour sealed-bid Auction opens to every faction, with bids starting at land value. If nobody bids, the plot returns to the Registry, unowned.

The same rules hold for your plots, so guard the ones you love. On Laid Back your stands are only ever Busted, so no raid can cost you a plot.

An eliminated rival's plots go to a Fire Sale: First Dibs for you at 75% of land value for 2 days (see Rivals). The bank repossesses your lowest-value plot after 2 missed loan payments (see Economy and balance). Vera's Old Money can freeze one of your land deals.

### Plot Buyouts

From Rank 4, a Sit-down at Dot's Diner can buy one rival plot at its owner's price. That price is 2.5× land value in the rival's home district and 2× elsewhere. Grudge and personality nudge it: Tilly, won over at the County Fair, sells a Field at 1.5×.

Faction Buyouts, Weakened rivals and Fire Sales are covered in Rivals.

### Field and Dock land

VIP clients land where the open space is: helicopters need a Field plot and ships a Dock plot. Every one of them starts in rival hands.

| Land | Where | Held at the start by | What you build |
| --- | --- | --- | --- |
| Field | 6 plots in The Groves; Hilltop's polo lawn | Hollis Sweet Tea Co.; the Sourwood Family holds the polo lawn | The helipad line: Pad (Rank 6, $50,000), Helipad (Rank 7, $200,000), Heliport (Rank 8, $800,000). Or a Lemon Grove (Rank 5, $25,000): +5% traffic at all your stands, up to 2 Groves |
| Dock | 4 plots in The Harbor; Hilltop's yacht marina | FizzCo Beverages; the Sourwood Family holds the marina | The pier line: Jetty (Rank 7, $250,000), Pier (Rank 7, $750,000), Cargo Terminal (Rank 8, $3,000,000) |

Helicopter VIPs (Rank 6, 3.5 stars) pay $12 a bottle and ships (Rank 7, 4.0 stars) $15. Mega Contracts need a Heliport and a Cargo Terminal, so the biggest orders need both kinds of land (see VIP clients). Bottles come from Bottling Works on Industrial lots, and The Harbor has open ones.

Fields and Docks draw almost no foot traffic, so they earn through facilities, not stands. Buy them out (a $60,000 Groves Field costs $150,000 at Tilly's home-turf price), wait for a Fire Sale, or win an auction. Then defend them: from Threat 3, rivals launch Delivery Raids on pads and piers during loading.

**Fun check:** Land is the score you can see: every deed tints a tile yellow, and finishing a district pays a perk. Borders keep the next move readable, buyouts and Vacant Lots give peaceful routes, and Laid Back never loses a plot to a raid.

## Defenses

Every plot defends itself with one perimeter, 2 gadget slots (3 at L4 and up) and the guards stationed on it. Fences buy time, gadgets buy warning, and guards win the fight.

### The perimeter ladder

Each tier replaces the last at full price, and its HP is the chopping a breach takes. Every raid on the plot, won or lost, adds a repair of 10% of the fence's price. Each night the bill is paid from your cash and the fence is whole by dawn, and a Lemon-Peel Slick that went off is re-laid for $25. Short of cash, both wait (the news says where) until you Patch the fence or Re-lay the Slick by hand. From Rank 3, a plot on Auto-Repair's skip list keeps its chopped fence and sprung Slick for you to fix the same way.

| Tier | Name | Unlock | Cost ($) | HP | Effect | Repair after a raid ($) |
| --- | --- | --- | --- | --- | --- | --- |
| P1 | Picket Fence | Rank 1 | 150 | 150 | Slows the breach; guards swing over it | 15 |
| P2 | Chain-Link Fence | Rank 2 | 1,200 | 500 | Tougher; guards swing through it | 120 |
| P3 | Sharpened Stakes | Rank 4 | 6,000 | 1,200 | Choppers take 2 damage per second | 600 |
| P4 | Barbed Wire | Rank 6 | 25,000 | 2,500 | Choppers take 4 damage per second and move 30% slower | 2,500 |
| P5 | Citrus Fortress Wall | Rank 8 | 100,000 | 5,000 | A brick wall with a gate; defenders get another +25% while it stands | 10,000 |

### The fence line

While a perimeter stands, attackers can't reach your guards or your stand: they must chop through first. Your stationed guards fight at the fence line, hitting the choppers with +25% damage, or +50% behind a Citrus Fortress Wall. When the perimeter falls, the bonus goes with it and the Brawl begins (see Crew and combat).

Stand level sets the guard posts, from 1 to 6 (see Stands), and other buildings have 3. With no perimeter a raid skips the Breach, and with no guards it skips the Brawl.

### Gadgets

Gadgets trigger on their own, with no upkeep.

| Gadget | Unlock | Cost ($) | Effect |
| --- | --- | --- | --- |
| Tin-Can Alarm | Rank 2 | 100 | +15% detection |
| Guard Goose ("Honkers") | Rank 2 | 400 | +15% detection; honks and stuns the first attacker for 3 seconds |
| Lemon-Peel Slick | Rank 4 | 250, plus 25 per nightly reset | The first 3 attackers slip: stunned for 4 seconds |
| Sprinkler Ambush | Rank 4 | 800 | Soaked attackers deal 20% less damage for the fight |
| Floodlights | Rank 5 | 1,500 | Cancels the night stealth bonus |
| Watchtower | Rank 6 | 5,000 | +30% detection here and on your plots within 2 plots (no stacking); reveals a raid's makeup |

### Detection

Detection decides who strikes first and how much warning you get. It starts at 50%; a Tin-Can Alarm adds 15%, a Guard Goose 15%, a stationed Lookout 25% and a Watchtower 30%, up to 95%.

An Eagle Eye guard on the plot adds 10%, Maple Row's Neighborhood Watch adds 10% everywhere, and a Stronghold district adds 10% on your plots there, all before the 95% cap. At night (20:00–08:00) raiders get +25% stealth, which takes 25 points off unless the plot has Floodlights. A Sneaky raider takes off 25 more, though the chance never drops below 0%.

Lottie's Corner with cans and a goose spots 80% of raids by day, 55% at night and 80% under Floodlights. Detected raids show their full ETA, 1–3 game hours out. Undetected raids still warn you, but the attackers get a first strike: +25% damage for 5 seconds.

### Warnings and auto-pause

No raid comes on Nights 1–2, and every raid after is warned. An undetected raid still gives at least 15 game minutes of notice on Classic, 30 on Laid Back and 5 on Cutthroat.

At 1×, 15 game minutes of night pass in about 2 real seconds, so the warning auto-pauses the game. It's a setting: on by default in Laid Back and Classic, off in Cutthroat. Paused first or not, the clock drops to fight speed for the notice's last minutes before the raid lands: Classic's last 15 game minutes take 15 real seconds, and Cutthroat's 5-minute notice 5. A detected raid's earlier warning runs at the speed you chose.

The card names the raider, target and ETA, plus the makeup if a Watchtower sees it, and offers Ring the Bell.

### Reinforcements

Guards waiting at a Clubhouse are your reserve. Ring the Bell, and they reach any of your plots in the same or a bordering district in 30–60 game minutes. Dex's Auto-Defend (Rank 4) rings it for you.

A detected raid gives them time to arrive first; after a 15-minute warning they arrive mid-fight, often in time to swing it. Stronghold districts speed them up (see Land and territory).

### When a stand falls

A lost defense costs what the raid came for, plus the fence repair and a day off for each KO'd guard.

| Raid | What you lose |
| --- | --- |
| Shakedown | The till: about 1 day of that stand's profit |
| Sabotage | The stock: the stand can't sell tomorrow |
| Smash | The stand: Wrecked on Classic and Cutthroat, Busted on Laid Back |
| A Smash that runs out of time | Less: the stand is only Damaged and sells at its HP share until repaired |

A Wrecked stand closes, and you have 24 game hours to rebuild it for 15% of what you invested. Otherwise the plot goes For Sale, and the raider gets First Dibs (see Land and territory).

On Laid Back, your stands are only ever Busted: closed until a 10% repair, never Wrecked or For Sale.

### How a stand holds off a raid

Day 26 on Classic, Threat 2. Lottie's Corner is a Kiosk with Chain-Link, a Tin-Can Alarm and a Guard Goose. Dex and Rosa guard it with clubs and Padded Vests (140 HP each). Brock sends 5 Smoothie Bros on a Shakedown: 2 with paddleboards (club tier), 3 with fists.

1. **02:10:** detection is 50% + 15% + 15% − 25% at night = 55%. The roll misses, so the card gives the 15-minute minimum and the game pauses.
2. **Ring the Bell:** Big Lou, Pip and Marnie leave the Maple Row Clubhouse, 30 game minutes out.
3. **02:25, HONK:** the goose stuns the first Bro for 3 seconds. The rest chop the Chain-Link (500 HP) with their first-strike +25%.
4. **Fence line:** Dex swings through the mesh at 22.5 a hit (18 plus 25%), and Rosa, a Hothead, a bit harder. Both paddleboard Bros drop within 8 seconds.
5. **Nerve:** 2 of 5 down counts as half, so the other 3 roll Nerve. One runs; 2 keep chopping until they drop at 15 seconds, the fence still at 260 HP.
6. **Aftermath:** the reserves jog in to 4 Bros seeing stars, each with a 10% chance to be Nabbed. The night costs $120 of fence repair, and Brock's Respect cooldown keeps him away for 3 days.

With only a Picket Fence and Dex, the raid gets in and takes about $521, a day of the Kiosk's profit.

**Fun check:** Defense is set up by day and pays off at night: the goose honks, the fence holds, the Bros wobble home. Pausing warnings, the Respect cooldown and losses near a day's profit keep it from becoming babysitting.

## Crew and combat

Guards are hired goofballs with a fee, a daily wage from $15 and one quirk. Most fights are auto-battles of about 30–90 seconds, and a lopsided one ends sooner. No guns, no blood, nobody dies: the worst outcome is a day off seeing stars.

### Hiring at the Hiring Hall

From Rank 2 you hire at the Hiring Hall, a civic plot in Old Town. Its 6 recruits refresh every 7 days, and each shows a name, a face, one Trait, a level, a hire fee and a wage.

| Level | Name | Hire fee ($) | Wage ($/day) | HP, Hit and Chop |
| --- | --- | --- | --- | --- |
| 1 | Rookie | 50 | 15 | Base |
| 2 | Regular | 150 | 25 | +10% |
| 3 | Veteran | 400 | 40 | +20% |
| 4 | Elite | 1,000 | 60 | +30% |
| 5 | Legend | 2,500 | 90 | +40% |

Guards gain about 1 level per 35 days of duty, faster with fights and a Training Yard, and wages rise with each level. Unpaid guards quit, except Loyal ones. Dex Moody joins free on Day 4, sleeps in the shed and becomes your crew chief.

You can keep 2 guards before you own a Clubhouse, then 2 plus your Clubhouse beds.

### Stats and traits

Every guard has 100 HP, Hit (damage per swing to people) and Chop (damage per swing to fences and stands). Speed sets how fast they move, and everyone swings once every 1.5 seconds. Nerve is the percent chance to stand firm when a fight turns, and it starts at 50.

| Trait | Effect |
| --- | --- |
| Tough Cookie | +20% HP |
| Night Owl | +25% Hit and Chop at night |
| Eagle Eye | +10% detection on the plot where stationed |
| Hothead | +15% Hit, −20 Nerve |
| Loyal | Never quits or defects, even unpaid; can't be bribed or recruited away |
| Butterfingers | 10% chance per fight to drop the weapon and finish on fists |
| Sprinter | +25% Speed |
| Gentle Giant | +50% HP, −30% Hit; a daytime raid by Gentle Giants alone costs no Reputation |
| Lumberjack | +50% Chop |
| Smooth Talker | Better Truce and buyout terms as your Sit-down negotiator |
| Goose Whisperer | Guard Geese on their plot stun twice |
| Former Rival | +10% Hit and Chop against their old faction |
| Sneaky | +25% stealth on raids; can lead a Sabotage |

### Weapons and padding

Each item unlocks once by Rank, then you buy it per guard. Rival henchmen carry reskins of the same three weapons, from paddleboards to walking canes. No guns, ever.

| Item | Unlock | Cost per guard ($) | Hit | Chop | Notes |
| --- | --- | --- | --- | --- | --- |
| Fists | Rank 1 | 0 | 10 | 5 | Rolled sleeves |
| Clubs | Rank 3 | 150 | 18 | 10 | Wooden bats wrapped in yellow tape |
| Hatchets | Rank 6 | 1,200 | 24 | 40 | Built for fences and stands; their KOs last 2 days |
| Padded Vest | Rank 3 | 200 | — | — | +40 HP |
| Pro Gear | Rank 6 | 1,500 | — | — | +100 HP; damage taken ×0.8 |

Hatchets exist to chop. Five of them breach Barbed Wire (2,500 HP) in 19 seconds, where five clubs take about 74. Twelve clubs can't Smash a Citrus Palace (5,000 HP) inside the 60-game-minute timer; twelve hatchets do it in 16 seconds.

### Specialists, squads and the Clubhouse

From Level 3, a guard can take one specialty. A **Lookout** (Rank 4) adds 25% detection when stationed and scouts raid targets. A **Wrecker** (Rank 4) gets +50% Chop, stacking with the Lumberjack trait. A **Captain** (Rank 6) leads a squad, giving it +20 Nerve and +10% Hit. A Captain who comes with the reserves when you Ring the Bell leads the guards on post too, from contact. Rung mid-fight, the bell's Captain leads only the guards who join.

Raids unlock at Rank 3. Each raid's squad holds up to 5 guards at Rank 3, 8 at Rank 5 and 12 at Rank 7. Guards on a raid leave their posts empty until they return, and the Raid Planner says which.

| Clubhouse | Unlock | Cost ($) | Beds | Extra |
| --- | --- | --- | --- | --- |
| L1 | Rank 2 | 2,000 | 6 | — |
| L2 | Rank 5 | 15,000 | 12 | Training Yard: idle guards earn XP |
| L3 | Rank 7 | 80,000 | 24 | Infirmary: KOs heal 1 day faster |

A Clubhouse fills one Street plot, and you can own several. Guards not on a post wait there as your reserve, for reinforcements and raid squads.

### Raids you send

Plan each raid in the Raid Planner (see Player experience): target, objective, squad, now or tonight, with the win chance shown first.

| Objective | Unlock | To win | Payoff |
| --- | --- | --- | --- |
| Smash | Rank 3 | Chop the stand to 0 HP within 60 game minutes | Wrecked; First Dibs on the plot if they don't rebuild (see Land and territory) |
| Shakedown | Rank 3 | 10 game minutes at the till | About 1 day of that stand's profit, in cash |
| Sabotage | Rank 4 | A Lookout or Sneaky guard, then 10 game minutes with the stock | They can't sell tomorrow; the stand stays up |
| HQ Assault | Rank 5 (Blend Shack) to Rank 9 (Sourwood Manor), one HQ per rank | A Weakened rival: a Gate of 2,000–5,000 HP, the Yard, the Boss Room | The rival is eliminated (see Rivals) |

Customers see daytime raids (08:00–20:00): each costs 0.1 star, or 0.2 for a Smash, and night raids cost nothing. Below 2.0 stars, each daytime raid also earns Sheriff Budd's Citation: a fine of about 1 day of income (the last week's average daily sales, never more than your cash) and no raids or HQ assaults for the rest of that day and the next 2. The ban calls off your raids that haven't set out yet; a squad already on the road, and the raid that earned the Citation, still fight.

A rival who spots your raid sends help: half the guards of each of its other plots and its HQ in the same or a bordering district, nearest first, up to 2 helpers at Threats 3–4 and 3 at Threat 5 (at Threats 1–2, one helper about one raid in three). They set out when your raid does and walk over at raid pace, about 1–2 game hours from a nearby plot, so they're nearly always there by contact. A raid nobody spots gets no help.

Raids on you always come with a warning, which auto-pauses by default on Laid Back and Classic (see Defenses). Beat a rival's raid, and it backs off for a Respect cooldown: 3 days on Classic, 5 on Laid Back, 1 on Cutthroat.

### The fight clock and your buttons

During a fight the clock slows to 1 game minute per real second at any speed, so a 60-second fight takes 1 game hour. You can pause mid-fight, and three buttons steer it. The fight bar shows each side's standing count against the mark where its one Nerve roll comes ("Yours 2/2 standing, breaks at 1"), so you can time a Rally to cover it.

One fight plays at a time. A raid on you that reaches its plot while another fight is on waits at the plot's edge, and goes in live as that fight ends, first come first in; the fight bar names the plot that's next. Your own raids that land meanwhile are fought at once and replayed afterwards.

| Button | Side | Effect | Limit |
| --- | --- | --- | --- |
| Rally | Either | +20 Nerve for 10 seconds | Every 30 seconds |
| Fall Back | Either | Everyone standing retreats, carrying the KO'd; the fight is lost | Once per fight |
| Ring the Bell | Defense | Clubhouse reserves in range leave now | Once per raid |

### Nobody dies

A fighter at 0 HP is KO'd: spiral eyes, 3 circling stars and a wobble home. Hatchets bite wood in bursts of chips, and hits on people stay inside the cartoon dust cloud.

KO'd guards are Out for 1 day, or 2 if a hatchet did it. Each KO'd attacker left behind has a 10% chance to be Nabbed. The captor can ransom them for their hire fee, release them for +0.05 star, or recruit them as a Former Rival (Loyal guards refuse).

### How a fight resolves

1. **Approach:** the squad travels 1–3 game hours. Detection (50% base plus gadgets and Lookouts, up to 95%, −25% at night without Floodlights) sets the warning. Spotted: the defender sees the ETA and sends help. Missed: the attackers get +25% damage for 5 seconds.
2. **Breach:** attackers chop the perimeter, from 150 HP (Picket Fence) to 5,000 (Citrus Fortress Wall). Stakes deal 2 damage a second and Barbed Wire 4 while they chop. Defenders hit them from the fence line with +25% damage.
3. **Brawl:** everyone swings at the nearest enemy every 1.5 seconds, and 0 HP is a KO. When a side has lost half its people (rounded down), each one left rolls Nerve (base 50, Captain +20) or runs.
4. **Objective:** attackers standing with no defender up smash the stand, empty the till or spoil the stock, within 60 game minutes. A Smash that runs out of time leaves the stand only Damaged.
5. **Aftermath:** KO'd guards sit out 1 day, or 2 after a hatchet. KO'd attackers left behind face a 10% Nabbed roll, a beaten rival backs off for its Respect cooldown, and daytime raids cost Reputation.

&#91;embedded content: how a raid resolves · 5 steps\]

The same five steps run when you raid a rival and when a rival raids you; only the side you are on changes.

**Fun check:** Every guard is a character with a face, a quirk and gear you can see, and every raid shows its odds first. Fights take about a minute, pause any time, and cost at worst a day of rest.

## Rivals

Five AI drink families play by the same economy rules as you, and each spends, raids and haggles in its boss's style.

### The five families

Rows run from the easiest HQ to the hardest. Henchmen fight with your crew's three weapon tiers, reskinned (see Visual style and art direction).

| Faction (product) | Boss | Home and HQ | Personality | Grow / Guard / Strike | Signature move | Henchmen |
| --- | --- | --- | --- | --- | --- | --- |
| The Boardwalk Blenders (smoothies) | Brock "The Blender" Bodine | The Boardwalk; the Blend Shack on the Pier | Aggressive swarm | 25 / 15 / 60% | **Blender Rush:** frequent cheap raids with lots of fists | Smoothie Bros |
| The Cold Brew Collective (iced coffee) | Juniper "Juni" Grind | Campus & Arts; the Grindhouse | Saboteur | 25 / 25 / 50% | **Night Shift:** stealthy night raids, spoiled stock, graffiti posters that dent your Reputation | Baristas and skaters |
| Hollis Sweet Tea Co. (sweet tea) | Tilly "Big Tilly" Hollis | The Groves; Hollis Homestead | Defensive landholder | 40 / 50 / 10% | **Dig In:** cheap, tough fences and hay-bale barricades; holds the Field land | Farmhands |
| FizzCo Beverages (soda) | Preston Fizzwell III | Downtown; FizzCo Tower, plus the Harbor bottling plant | Rich and expansionist | 50 / 20 / 30% | **Hostile Takeover:** auction outbids, buyout offers, ad blitzes, and Cease-and-Desist letters that block your marketing in a district for 3 days | Security Associates |
| The Sourwood Family (old-money lemonade) | Vera Sourwood, Lottie's ex-best-friend | Hilltop Estates; Sourwood Manor | Cunning and balanced | 35 / 35 / 30% | **Old Money:** Mayor Fontaine fines you or freezes a land sale; elite Stewards | Stewards |

### How rivals think

Every dawn, each rival banks its takings and spends them by the split above. Grow buys land and upgrades, Guard buys defenses and crew, and Strike funds raids and schemes like price wars and smear posters.

Threat sets how often and how hard raids come at you (see Success Score, ranks and threat). Each boss's **Attention** decides who sends them: it rises with Threat, shared borders, customers you take and Grudge. A broke rival can't pay for a raid, so the next-angriest boss goes instead.

Each rival also keeps a **Grudge** toward every other faction, you included. It rises when that faction raids them, outbids them or takes their land, and cools a little each quiet day. Grudge picks rival-versus-rival targets and raises Plot Buyout prices.

Targets follow one visible rule: the weakest valuable stand near their turf, meaning the highest value divided by defense. The Rivals Corkboard pins each boss's likeliest target, so fortifying is a choice, not a guess.

About 30% of rival raids hit other rivals at Threat 1–3, 15% at Threat 4 and none once the Syndicate forms. Their smashed plots reach auction like yours, so watch the auctions after a feud.

### Phone taunts

Bosses phone Lottie's Corner when their mood shifts, so a call is also a warning: their Grudge or Attention just jumped. The next Bugle reports their moves.

- **Brock**, before a Blender Rush: "Bro. Tonight we blend your stand. Smoothie or chunky, your call."
- **Juni**, when a poster goes up: "It's not graffiti. It's a review."
- **Tilly**, when you buy near her fields: "I own six fields and one ladle, sugar. You're about to meet the ladle."
- **Preston**, after outbidding you: "Hold, please. I'm on the other line, buying your street."
- **Vera**, when your Threat rises: "Charming little stand, dear. I'll ask the Mayor whether it's legal."

### Sit-downs at Dot's Diner

From Rank 4, any boss will meet you at Dot's Diner; a Smooth Talker negotiator gets better terms.

| Deal | Rank | Terms | Fine print |
| --- | --- | --- | --- |
| Truce | 4+ | No raids between you and one rival for 7 days, for a cash tribute set by their Grudge | Breaking it costs 1 full star of Reputation, every rival's Grudge toward you jumps, and none will accept a Truce for 14 days |
| Plot Buyout | 4+ | One rival plot at their price: 2.5× land value in their home district, 2× elsewhere; Grudge and personality can nudge it | Their price, take it or leave it |
| Faction Buyout | 5–8 (the rival's HQ rank) | A Weakened rival's business, its cash and buildings but not its land, for 1.5× (Brock, Tilly) or 1.8× (Juni, Preston); its plots go to the Fire Sale | Brock and Tilly accept readily; Juni and Preston haggle; Vera never sells, except in a Peaceful Sandbox (3× once Weakened) |

### Weakened, elimination and the Fire Sale

A rival is **Weakened** when it holds 40% or less of its peak plots, its Net Worth drops under 25% of yours, or your daily sales have been at least double theirs for 7 days in a row. The Corkboard stamps its photo, and only then can you assault its HQ or buy it out.

A rival is eliminated when you capture its HQ, it accepts a Faction Buyout, or it stays bankrupt for 7 days. The boss's exit scene plays, the HQ becomes your **Trophy** building with a unique perk, and you recover their recipe page. Every plot it held goes to a **Fire Sale**: First Dibs for you at 25% off for 2 days, then an open auction.

Each Trophy brings one perk:

| Trophy | Perk |
| --- | --- |
| Blend Shack | **Blender Bar**: Frozen Lemonade's top price rises 20% |
| Grindhouse | **Juni's Grapevine**: raid warnings arrive 1 game hour earlier |
| Hollis Homestead | **Hollis Orchards**: each of your Lemon Groves brings +10% traffic instead of +5% |
| FizzCo Tower | **Bottling Line**: bottles fill 25% faster |
| Sourwood Manor | **Family Silver**: land, Plot Buyouts and auction bids cost 10% less |

Hiring beaten bosses as advisors is a stretch goal.

### HQ Assault

From Rank 5, the Raid Planner can target a Weakened rival's HQ, each from its own rank: the Blend Shack at Rank 5, the Grindhouse at 6, Hollis Homestead at 7 and FizzCo Tower at 8, with Sourwood Manor saved for the Big Squeeze at 9. A rival's Faction Buyout opens at the same rank. Three stages run back to back: the Gate (a wall of 2,000–5,000 HP), the Yard (elite henchmen) and the Boss Room (boss and bodyguards). Your squad carries its HP from stage to stage, and a failed assault leaves the rival Weakened, so you can regroup and return. Like any raid, an assault fought at Morning Prep, in the Evening or at night is a night fight: it costs no Reputation, and Night Owls hit 25% harder. By day it costs 0.2 star, as a Smash does.

| HQ, easiest first | Boss move in the Boss Room |
| --- | --- |
| The Blend Shack | **Blender Rush:** Brock charges and knocks 3 guards down |
| The Grindhouse | **Espresso Shot:** Juni's crew gets +50% speed for 10 seconds |
| Hollis Homestead | **Hay Bale Wall:** Tilly spawns barricades |
| FizzCo Tower | **Hostile Takeover:** Preston pays 2 of your guards to switch sides mid-fight, unless they're Loyal |
| Sourwood Manor | **Old Money:** Vera calls in Steward reinforcements, and her cane disarms one guard |

### The Syndicate

At Threat 5, the surviving rivals stop raiding each other and form the Syndicate: boss-led raids on 2–3 of your plots at once. In Sandbox and Endless, it forms at Threat 4 on Cutthroat, and at Rank 9 on Laid Back, whose Threat stops at 4. In the campaign, Vera forms it two weeks into Act 5 on every difficulty; you choose when to Call the Big Squeeze, the finale (see Narrative).

**Fun check:** Rivals read like people: you see who is angry, who is broke and what each wants, then beat or buy them. One visible targeting rule, warned raids and Truces keep the pressure fair.

## Success Score, ranks and threat

Success Score is your Net Worth at 1 point per $1. It sets your rank, 1 to 10, and your rank sets Threat.

### What counts

**Success Score = cash + land at market value + 75% of what you invested in buildings + stock at cost − loans owed.**

Buildings means the stands, defenses and facilities on your plots, and the score never drops below 0. You start at $525: $150 cash, Lottie's Corner at $300 and 75% of the $100 folding table.

The formula shapes every purchase:

- Land keeps its full value, so buying a plot moves cash into land without lowering the score. Land then gains up to ×2 as its district develops (see Land and territory).
- Buildings count at 75%. A $400 Wooden Stand dips the score by $100 until its extra sales refill it, and the Rank badge shows that dip as a striped "invested" sliver, not a loss.
- Wages, guard gear and marketing leave the score entirely. They pay back only through sales and safety.
- A loan adds cash and debt in equal measure, so borrowing never buys a rank.
- A plot lost to Knock it down, buy it up takes its land and building value with it. Defense guards your score, not just your income.

### How you see it

The score updates every game minute, so it ticks up with each sale. It sits on the top bar beside the Rank badge, whose rim fills toward the next threshold. Hover or long-press it for the breakdown above, today's change and your Peak Success Score.

The Ledger charts the score day by day. The Rivals Corkboard pins each boss's Success Score, so you can see who you are about to pass.

Crossing a threshold ranks you up on the spot: confetti, the Rank Up stinger and a new layer of Lottie's Theme. You pick 1 of 3 Lottie's Tips perks from a pool of about 24, and the next Bugle runs the headline. Ranks are never lost, so a slump below a threshold keeps your rank and its unlocks.

### The rank ladder

Thresholds climb 4 to 9 times a rank up to Rank 9, so early ranks come days apart and late ones weeks apart; the title rank needs only 1.6 times more and arrives after victory. Progression and unlocks lists every unlock and the pace on each difficulty.

| Rank | Title | Success Score ($) | Simulated Classic day | Key unlocks |
| --- | --- | --- | --- | --- |
| 1 | Sidewalk Squeezer | 0 | 1 | Selling, the Wooden Stand (L2), Picket Fence, Maple Row land |
| 2 | Corner Hustler | 1,500 | 4 | Guards and the Clubhouse, Guard Goose, Old Town land |
| 3 | Block Boss | 6,000 | 9 | The Kiosk (L3), clubs, raids, Local Orders |
| 4 | Neighborhood Name | 25,000 | 19 | Sharpened Stakes, Sit-downs, Sabotage, Plot Buyouts |
| 5 | District Big Shot | 100,000 | 41 | The Lemon Shack (L4), Bottling Works, the Blend Shack (assault or buyout) |
| 6 | Citrus Baron | 500,000 | 58 | Hatchets, Barbed Wire, helicopter VIPs, the Grindhouse |
| 7 | Lemon Tycoon | 4,500,000 | 78 | The Citrus Palace (L5), ship contracts, district policies, Hollis Homestead |
| 8 | Juice Magnate | 20,000,000 | 104 | Citrus Fortress Wall, Supply Deals, FizzCo Tower, the Lavender auction |
| 9 | Bay Kingpin | 125,000,000 | 135 | Mega Contracts; in the campaign, Call the Big Squeeze |
| 10 | The Big Squeeze | 200,000,000 | 157 | Golden Citrus Palace skin, endless leaderboards |

### Threat

Threat, 1 to 5 sour lemons, follows your rank and sets how often rivals raid you and how hard. Ranks 1–2 give Threat 1, 3–4 Threat 2, 5–6 Threat 3, 7–8 Threat 4 and 9–10 Threat 5. Laid Back takes 1 away (down to 1).

| Threat | Triggered by (Classic) | Nights a week with a raid on you | Typical raid | What changes |
| --- | --- | --- | --- | --- |
| 1 | Ranks 1–2 | About 5 | 2–3 henchmen with fists; always a Shakedown | The first raid comes on Night 3 and bounces off any fence or guard |
| 2 | Ranks 3–4 | About 4 | 3–5, some clubs; 30% Smash | Smash attempts begin |
| 3 | Ranks 5–6 | About 4–5 | 5–8 with clubs, vests and a lookout; 60% Smash | Delivery Raids on VIP pickups; the music's tension layer |
| 4 | Ranks 7–8 | About 2.5–5 | 8–12 in Pro Gear, 6 in 10 with hatchets and the rest with clubs; 70% Smash | Raids can hit 2 plots at once; in Sandbox and Endless, Cutthroat's Syndicate forms |
| 5 | Ranks 9–10 | The Syndicate's, below | 12–20 in the same kit, boss-led; all Smash on 2–3 plots | The Syndicate forms on Classic in Sandbox and Endless (on Laid Back at Rank 9); the campaign waits for Act 5 |

Each night's raids are drawn from a base of 1, 2, 3, 4 and 6 a week by Threat (Laid Back ×0.5, Cutthroat ×1.5). After the first raid, no more than 2 nights in a row pass without one on Classic (4 on Laid Back, 1 on Cutthroat), and a rumor you answer brings its gang on a night the draw gave none, so the early Threats see far more raids than their base. A rival whose raid you beat sits out its Respect cooldown, so beating raids thins them: the Threat 4 range runs from every raid beaten to none. The table's nights come from twelve simulated Classic campaigns with every rumor answered; Laid Back sees about 3–4 raid nights a week at Threats 1–2, and Cutthroat about 5.

Schemes that aren't raids, such as price wars, auction snipes and smear posters, also come more often with each lemon. Each boss's Attention, which rises with Threat, decides who sends the raid (see Rivals).

Threat never jumps by surprise: it moves only at a rank-up, and on hover the lemons name the rank that set it.

### The Syndicate

At the top of the ladder, the surviving rivals stop raiding each other and form the Syndicate. In Sandbox and Endless, it forms at Threat 5 on Classic, at Threat 4 on Cutthroat, and at Rank 9 on Laid Back, whose Threat stops at 4. Its boss-led raids hit 2–3 of your plots at once, 6 times a week on Classic, 3 on Laid Back and 9 on Cutthroat. In the simulated Classic campaigns its weeks bring about 2.5 strikes a week when you beat every one, since each member sits out its Respect cooldown, and about 7.5 when you beat none.

In the campaign, Vera forms it two weeks into Act 5 on every difficulty, around Day 120 on Classic, and its first strike comes under the Founders' Day fireworks. The Corkboard ties every string to your photo, the Bugle prints "PACT IS BACK" and a cane tap joins every downbeat.

Holding out is a puzzle across districts. Watchtowers see raids coming, a Clubhouse in or beside each district sends help, and Citrus Fortress Walls guard your best plots. Each rival you eliminate shrinks the Syndicate, and from Rank 9 you choose when to Call the Big Squeeze (see Narrative).

### Peak Success Score

Peak Success Score, the highest your score ever reaches, is the high score (see Game modes and winning). Each leaderboard entry records the peak, the day it was set, the difficulty and whether the run was Ironman. The simulated Classic run passes $200,000,000 (Rank 10) on Day 157 and about $258,000,000 by Day 170, so Endless Summer has plenty of headroom.

**Fun check:** Every rank is a party with new toys, and the badge shows the next one filling up. Threat rises only with rank, shown on the top bar. Pressure grows once you have the tools to meet it, never by surprise.

## VIP clients

Wealthy clients pay $30 to $100 a bottle, 10 to 33 times the price of a Kiosk cup. Their choppers and ships land only on Field and Dock land you own, and every bottle comes from your Bottling Works.

### The order ladder

Offers arrive with the Morning Bugle and wait in the Order Book. Each card names the client, recipe, size, deadline and pay, and flags whether a Delivery Raid is possible. Offers are optional: decline one and another comes along.

| Tier | Unlock | Needs | Order size | Deadline | Pay | One order earns | Offers |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Local Orders | Rank 3 | Any L3+ stand | 300–1,500 cups | 2 days | 1.5× that stand's price | $1,350–$6,750 at a $3.00 Kiosk | About 1 per 2 days |
| Caterer Trucks | Rank 5 | Warehouse and Bottling Works | 1,000–5,000 bottles | 3 days | $6 a bottle | $6,000–$30,000 | About 2 per 5 days |
| Helicopter VIPs | Rank 6, 3.5 stars | A Helipad tier on a Field | 2,000–10,000 bottles | 4 days | $30 a bottle, +0.2 star | $60,000–$300,000 | About 1 per 3 days, never more than 10 days apart |
| Ship Contracts | Rank 7, 4.0 stars | A Pier tier on a Dock | 10,000–60,000 bottles | 7 days | $40 a bottle | $400,000–$2,400,000 | About 1 per 5 days, never more than 10 days apart |
| Supply Deals | Rank 8, 4.0 stars | Cargo Terminal | 200,000 bottles | 28 days | $30 a bottle | $6,000,000 | The first when the Cargo Terminal opens, then about 1 per 7 days |
| Mega Contracts | Rank 9, 4.5 stars | Heliport, Cargo Terminal and 2 premium recipes | 100,000–150,000 bottles | 14 days | $100 a bottle | $10M–$15M | About 1 per 20 days |

Local Orders and Caterer Trucks are the warm-up, filled from stands and the Warehouse. Once a pad or pier tier stands, its clients offer a job at least every 10 days, and the first Supply Deal arrives the day your Cargo Terminal opens. Each Supply Deal ships in 4 weekly loads of 50,000 bottles, paid $1.5M a load, and several can run at once if your bottling keeps up. Harbor Fest brings extra helicopter and ship offers every Fall (see Events and the living world).

### Helicopter clients

Helicopter VIPs need a Pad, the first Helipad tier, on a Field plot. Clients include a movie star's pool party, a tech mogul's rooftop launch, a celebrity wedding and a music festival VIP tent. Each delivered order adds 0.2 star, and a Pad pays for itself with its first order.

Example, at the Helipad tier: a movie star wants 5,000 bottles of Pink for a pool party in 4 days. That order pays $150,000 and loads in one pickup.

### Ship clients

Ship Contracts need a Jetty or Pier on a Dock plot. Clients include the Citrine Bay Regatta, a cruise line and an overseas export deal. Every horn plays the first 3 notes of Lottie's Theme.

Each tier upgrades the last and is paid per step:

| Line | Tier | Rank | Cost ($) | Orders served (bottles) | Loads per day (bottles) | Who comes |
| --- | --- | --- | --- | --- | --- | --- |
| Helipad (Field) | Pad | 6 | 50,000 | 2,000–4,000 | 2,000 | A small chopper |
| Helipad (Field) | Helipad | 7 | 200,000 | 4,000–7,000 | 5,000 | A bigger chopper |
| Helipad (Field) | Heliport | 8 | 800,000 | 7,000–10,000 | 20,000 | Bigger choppers, 2 trips a day |
| Pier (Dock) | Jetty | 7 | 250,000 | 10,000–20,000 | 5,000 | Yachts |
| Pier (Dock) | Pier | 7 | 750,000 | 20,000–40,000 | 10,000 | Cruise ships |
| Pier (Dock) | Cargo Terminal | 8 | 3,000,000 | 40,000–60,000 | 25,000 | Freighters |

### Mega Contracts

Mega Contracts need a Heliport, a Cargo Terminal and 2 premium recipes. Premium means any page won or recovered beyond Classic, Pink, Mint and Strawberry. The Governor's Gala and the Bay Centennial are typical clients, and the whole tier is a stretch goal (see Scope plan).

The star gates follow your stands. Reputation drifts toward 3.0 stars plus 0.4 per average stand level above L1, capped at 4.6. Helicopters want stands averaging above L2, ships about L3.5, and Mega Contracts mostly Citrus Palaces.

### Bulk production

A Bottling Works fills bottles of any recipe you own. A bottle of Classic costs about $0.31: $0.16 of ingredients plus a $0.15 bottle and cap.

| Building | Rank | Cost ($) | Plot | What it does |
| --- | --- | --- | --- | --- |
| Warehouse | 4 | 15,000 | Street or Industrial | Stores bottles and supplies; auto-supplies stands in its district |
| Bottling Works L1 | 5 | 25,000 | Industrial | 1,500 bottles a day |
| Bottling Works L2 | 6 | +100,000 | Industrial | 4,000 bottles a day |
| Bottling Works L3 | 7 | +400,000 | Industrial | 12,000 bottles a day |
| Lemon Grove | 5 | 25,000 | Field | +5% traffic at all your stands; up to 2 Groves count |

Size the Works to your orders. An L1 keeps a Pad busy, ships want L2 or L3, and a Mega Contract can need about 10,700 bottles a day. A Warehouse banks bottles between pickups, and Industrial land lies only on the edges of The Harbor and Downtown.

### Pickups, risks and rivals

Each pickup is a 2-hour window: a chopper lands or a ship docks and loads up to the facility's daily rate. The game pauses only for each client's first arrival, with a Watch button, and for Delivery Raid warnings; routine pickups just post an alert card. The pad or pier plot takes fences, gadgets and guards like any stand.

From Threat 3, a rival may launch a Delivery Raid on the pad or pier during loading, with the usual warning. If the raiders overrun the pickup, the order fails. Rivals also bid for contracts, and the client weighs price, delivery time and Reputation; FizzCo, with the Harbor's Docks and bottling plant, bids hardest.

A failed or overrun order costs 0.3 star and the pay for bottles not yet loaded; earlier pickups stay paid. The star loss can cross a gate: at 3.6 stars, one failure leaves 3.3 and grounds helicopter offers until Reputation recovers.

### Why VIPs pull you outward

All 7 Field plots and all 5 Dock plots lie in The Groves, The Harbor and Hilltop Estates. Hollis, FizzCo and Sourwood hold them at the start, behind just 2 borders each (see Land and territory).

A Groves Field costs $40,000–80,000 and a Harbor Dock $100,000–200,000, and Hilltop's pair cost 3 times as much. Buying from a rival costs 2.5× land value in its home district and 2× elsewhere. First Dibs after a Smash (100%) or a Fire Sale (75%) is cheaper, which makes Act 4, Fields & Fizz, a land war.

Full Control of each district pays off in VIP terms. Shipping Lane (The Harbor) adds 15% to ship pay. Old Money (Hilltop) brings VIP offers 50% more often.

At $30 and $40 a bottle, VIP facilities earn their keep. The simulated player builds every pad and pier tier, lands its first chopper on Day 72 and its first ship on Day 87, both in Act 4, and takes its first Supply Deal the day its Cargo Terminal opens (Day 109). From Day 97 to Day 136, VIP clients bring about a fifth of its revenue.

**Fun check:** A chopper thumping in over the bay and a horn playing your tune are the game's showpieces: paydays you can watch arrive. Offers are optional and show their risk first, and a failure costs 0.3 star and the unloaded pay, never the business.

## Economy and balance

A competent Classic player grows a $525 folding table into a $125,000,000 empire by about Day 135, and every step pays back in days.

### Money in, money out

Cash is the only currency. Success Score is Net Worth, so land and buildings count toward Rank even after the cash is spent.

| Flow | Sources | Sinks |
| --- | --- | --- |
| Selling | Cup sales at every stand | Supplies (about $0.21–$0.45 a cup), upkeep |
| Building | Land appreciation (up to ×2 as a district develops) | Stand upgrades, specializations, marketing |
| Land | Selling plots, Fire Sale bargains | Land, Plot and Faction Buyouts |
| Crew and defense | Shakedown loot | Guards, wages, gear, perimeters, gadgets, Clubhouses, repairs |
| Contracts | Local Orders, Caterer Trucks, helicopter VIPs, ships, Supply Deals, Mega Contracts | Bottling Works, Warehouses, Helipad and Pier lines, bottles |
| Other | Fair prizes, loans | Loan interest, citations, the Lavender auction |

### Income growth by stage

The simulated Classic player's average daily income climbs about 5,000× across the campaign. Each stage has one obvious "next big buy".

| Stage | Days | Stands at the end | Daily income | Main spends |
| --- | --- | --- | --- | --- |
| Ranks 1–2 | 1–8 | 3 Wooden Stands in Maple Row | about $800 | L2 upgrades, the side lot and a third plot, Picket Fences |
| Rank 3 | 9–18 | 9 Wooden Stands | about $2,400 | Plots, L2 upgrades, fences |
| Rank 4 | 19–40 | 11 Kiosks | about $5,100 | Kiosks, fences and guards, land, the first Clubhouse |
| Rank 5 | 41–57 | 20 Kiosks | about $31,000 | Land (the Blend Shack's Fire Sale), defenses, Kiosks |
| Rank 6 | 58–77 | 28 Lemon Shacks, 19 Kiosks | about $260,000 | Lemon Shacks, land, defenses and guards, then the Pad, Warehouse and Bottling Works |
| Rank 7 | 78–103 | 42 Lemon Shacks, 15 Citrus Palaces | about $850,000 | Palaces and Shacks, land, the Helipad, Jetty and Pier, defenses, Clubhouses |
| Rank 8 | 104–134 | 35 Lemon Shacks, 39 Citrus Palaces | about $3.9M | Land, Palaces, Hilltop land for the siege, the Heliport and Cargo Terminal, the $1.5M Lavender auction |
| Rank 9 | 135–143 | The same | about $4.0M (Fall) | Defenses for the siege, repairs |

### Cost curves

From L2 up, each upgrade costs 9–17× the last, while a stand's income rises only about 2–3×. That gap makes plot choice matter: a Lemon Shack needs about 1,800 passersby a day and a Citrus Palace about 4,000.

Paybacks on suitable plots run 2–4 days at L2, 4–7 at L3, 4–11 at L4 and 11–15 at L5 (see Appendix A). A Kiosk pays back almost anywhere.

Land climbs the same way by district. A Maple Row street costs about $1,000, an Old Town street about $12,000, a Downtown street about $90,000 and a Hilltop street about $360,000. Hilltop's dirt is the priciest in the Bay, so Majority there is the last big purchase before Domination.

Defense costs scale with what you protect. A Picket Fence costs $150 and a Citrus Fortress Wall $100,000. Gadgets, weapons and padding stay cheap so a small operation can always afford one more goose.

### Upkeep, wages and loans

- **Upkeep** runs from $5 a day for a Folding Table to $1,500 for a Citrus Palace.
- **Wages** run $15 a day for a Rookie up to $90 for a Legend. Guards level up about once every 35 days of duty.
- **Loans** from Marisol cover up to 50% of non-cash Net Worth at 3% interest per week over 4 weeks. Two missed payments let the bank repossess your lowest-value plot.

Security spend (guards, defenses and repairs) is meant to sit at 15–25% of income through Acts 1–3. In the simulation it runs about a quarter of income in the first weeks, while the first fences, Dex and the first squad go in, then 20–22% to Day 55 and 15% to Day 80. Later it falls under 10% of a much bigger income, and the pressure comes from Delivery Raids, the Syndicate and the siege.

### Lottie's Cookie Jar and bankruptcy

Cash below $0 at the end of a day puts you "In the Red" with 3 days to fix it. If you'd still go under, Lottie's Cookie Jar pays the shortfall plus one day of upkeep and wages. Laid Back has it always, Classic once per act (once per season in Sandbox and Endless), and Cutthroat never.

Without the Cookie Jar the game ends ("Squeezed Out") and the campaign reloads the last dawn autosave. Losses should sting, not ruin. In the simulation, the worst Classic raid after Day 6 cost about a third of a day's income (never more than 0.6 days on 60 maps), and the average cost about 0.1 day.

### Pacing targets vs the simulation

| Milestone | Target day | Simulated Classic day (range on ten maps) |
| --- | --- | --- |
| First upgrade to L2 | 5 (its lesson) | 4 (4–5) |
| Rank 2 | 5 (its lesson) | 4 (3–4) |
| Rank 3 | About 10 | 9 (8–12) |
| Rank 4 | About 22 | 19 (15–34) |
| Rank 5 | About 37 | 41 (26–48) |
| Rank 6 | 52–58 | 58 (48–60) |
| Rank 7 | 71–80 | 78 (67–82) |
| Rank 8 | 95–105 | 104 (87–105) |
| Rank 9 | 125–135 | 135 (123–138) |
| Domination | About 140–150, not before 136 | 143 (131–146) |
| Rank 10 (after victory) | About 150–160 | 157 (148–162) |

Every milestone lands within 15% of its target on the reference map, and Ranks 6–10 and Domination land inside their target windows. The range in brackets covers ten simulated maps. The simulated player is tireless and efficient, so a real player should land a few days later, closer to the targets. The longest stretch without a new rank, unlock or stand level is 7 days, and it is the siege of Sourwood Manor.

These targets are under review, and the simulated days predate the first L2 and Rank 2 moving to their Day 5 lessons: the new pacing sweep reports to /mnt/project-files/gameplay-build/integration/pacing-sweep.txt.

### Difficulty differences

Laid Back halves raids, lowers Threat by 1 and only ever Busts your stands. Ranks 5–9 arrive about 14% sooner (Rank 9 on Day 118), and Domination lands on Day 126 (120–136 across ten maps).

Cutthroat raises raids by half, cuts the raid warning to 5 game minutes, shortens the Respect cooldown to 1 day and has no Cookie Jar; customer traffic and costs stay as on Classic. In Sandbox and Endless its Syndicate forms at Threat 4. Ranks 5–9 arrive at about Classic's pace (Rank 9 on Day 143) under 1.3–1.7 times the raids, and Domination lands on Day 151 (134–163 across ten maps), always before Day 170.

### Anti-snowball and anti-grind levers

Snowball brakes:

- Costs rise faster than income: each stand level, district and VIP tier asks for a much bigger bill.
- Threat climbs with Rank, so success draws bigger raids.
- Upkeep and wages grow with the empire, and rival stands within 2 plots split your customers.
- Late cash has real homes: Hilltop land, Citrus Palaces, Fortress Walls, the $1.5M Lavender auction, and a $3M Cargo Terminal whose Supply Deals pay about $6M each.

Grind breakers:

- Ranks, unlocks and stand levels are spaced so something new arrives about once a week, even in the slowest stretch.
- Local Orders, Caterer Trucks and VIPs give cash spikes and goals between upgrades.
- Automation arrives before the chores pile up: Auto-Restock (Day 2); Auto-Price, bulk upgrades and Auto-Repair (Rank 3); Auto-Defend (Rank 4).
- Fire Sales sell an eliminated rival's plots at 75% of value, so each victory speeds the next.

### How the numbers were checked

A simulation played the full 170 days on all three difficulties across ten versions of the map, and 60 for the key checks. Its player bought what paid back fastest, kept a fifth of income for security and raided rival stands at night. Every number in Appendix A came from tuning that player toward the targets above.

### Pacing chart

&#91;embedded content: pacing.csv · 170 simulated days on each difficulty, from the economy model\]

Late ranks space out because growth slows while the bar keeps rising: net worth grows about sevenfold from Day 90 to Day 120 but only about 2.5-fold from Day 120 to Day 150, and Rank 9 needs about 6 times Rank 8's net worth. Laid Back runs about 14% faster; Cutthroat keeps close to Classic's pace under more raids.

**Fun check:** The fun is a big new buy every few days, from a $400 awning to a $650,000 lemon dome. Paybacks in days, raids that cost well under a day and the Cookie Jar keep it from ever feeling like a grind.

## Progression and unlocks

Every rank opens new toys, and on Classic something new arrives about once a week at the slowest: a rank, an unlock or a stand level. The pacing chart above shows the simulated score crossing each rank threshold, and the table below shows what each crossing opens.

### The first week

Act 1 adds one system a day, each with its own button (see Player experience). Prices come on Day 1 (Lottie stocks that first table free), and on Day 2 recipes, weather and the Market: from then on every lemon costs you. On Day 3 the Steward's visit brings the Picket Fence and Lottie's $300 side lot, and that night Brock's Bros come for the till: any fence or guard sends them home, and an undefended stand loses a day's takings. Dex joins on Day 4, the Wooden Stand and Rank 2 land on Day 5, the first sign goes up on Day 6, and Day 7 opens the Land Registry.

After the first raid, nights stay dangerous: on Classic no more than two nights in a row pass without one. Every business day also brings one or two day calls, small decisions with a price (see Running the business), and Lottie's opening tour tells the story and shows the boss board before the first cup is poured. (Revised 2026-11-08: the earlier plan kept the first hour raid-free, and players found it had no stakes.)

### What unlocks when

Each row lists a rank's unlocks with its Classic target day, then the simulated day and real hours at about 8 minutes a day. Every rank-up also brings a pick of Lottie's Tips perks.

| Rank | Classic day: target / simulated (hours) | Laid Back / Cutthroat day | Grow | Guard and strike | Contracts, deals and helpers |
| --- | --- | --- | --- | --- | --- |
| 1 | Start | Start | Selling, recipes, weather, supplies; Wooden Stand (L2); Hand-Painted Signs (M1); Maple Row land | Picket Fence; fists | Auto-Restock (Day 2) |
| 2 | 5 / 4 (0.5) | 5 / 5 | Old Town land; Sandwich-Board Kid; Free Sample Day | Guards, with Dex free on Day 4; Clubhouse; Chain-Link Fence; Tin-Can Alarm; Guard Goose | — |
| 3 | 10 / 9 (1.2) | 9 / 9 | Kiosk (L3); Flyers & Sidewalk Chalk (M2); Sunny the Lemon; other districts through Footholds and borders | Clubs; Padded Vest; Smash and Shakedown raids; squad of 5 | Local Orders; Marisol's Auto-Price; bulk actions; Auto-Repair |
| 4 | 22 / 19 (2.5) | 19 / 19 | Radio Jingle (M3); Coupon Blitz | Sharpened Stakes; Lemon-Peel Slick; Sprinkler Ambush; Lookouts; Wreckers; Sabotage | Warehouse; Sit-downs (Truce, Plot Buyout); Dex's Auto-Defend |
| 5 | 37 / 41 (5.5) | 31 / 38 | Lemon Shack (L4); Event Sponsorship | Floodlights; squad of 8; Clubhouse L2; the Blend Shack (assault or buyout) | Bottling Works; Caterer Trucks; Lemon Grove |
| 6 | 52–58 / 58 (7.7) | 50 / 59 | — | Hatchets; Barbed Wire; Watchtower; Pro Gear; Captains; the Grindhouse (assault or buyout) | Pad and helicopter VIPs; Bottling Works L2; raid templates |
| 7 | 71–80 / 78 (10.4) | 67 / 81 | Citrus Palace (L5); Billboards & TV (M4); Billboard building | Squad of 12; Clubhouse L3; Hollis Homestead (assault or buyout) | Helipad tier; Jetty, Pier and ship contracts; Bottling Works L3; district policies |
| 8 | 95–105 / 104 (13.9) | 87 / 108 | The Lemon Blimp (M5) | Citrus Fortress Wall; FizzCo Tower (assault or buyout) | Heliport; Cargo Terminal; Supply Deals; the Lavender auction |
| 9 | 125–135 / 135 (18.0) | 118 / 143 | — | The Big Squeeze on Sourwood Manor | Mega Contracts |
| 10 | After victory / 157 (20.9) | 134 / 163 | Golden Citrus Palace skin | — | Endless leaderboards |

Domination lands on Day 143 on Classic, about 19 hours in, against a target of about Days 140–150 (131–146 across ten maps). Laid Back reaches Ranks 5–9 about 14% sooner and wins on Day 126; Cutthroat keeps about Classic's pace under more raids and wins on Day 151 (see Economy and balance).

### Helpers that keep a big empire calm

Each helper arrives as its chore piles up; by Rank 7 the simulated player runs over 40 stands (see Economy and balance).

| Helper | Arrives | Takes over | You still decide |
| --- | --- | --- | --- |
| Auto-Restock | Day 2 | Buying supplies | Each stand's stock target |
| Marisol's Auto-Price | Rank 3 | Prices, recipe cards and Sweetness for the weather and the crowd | Any stand you set by hand |
| Bulk actions | Rank 3 | Group orders, such as "upgrade every Kiosk I can afford" | The group and the budget |
| Auto-Repair | Rank 3 | Overnight repairs | Plots to skip |
| Warehouse | Rank 4 | Supplying every stand in its district | Where to build it |
| Dex's Auto-Defend | Rank 4 | Sending reinforcements and stationing guards | Each plot's priority |
| Raid templates | Rank 6 | Repeat raids in one tap | When to send them |
| District policies | Rank 7 | Profit, Fortify or Expand presets per district | One policy per district |

### Gaps between ranks

Rank gaps grow from 3 days to about a month. The longest is Rank 8 to Rank 9: 31 days, about 4 hours of play. Act 5 fills it with the Lavender auction (Day 105), the first Supply Deal (Day 109), the Heliport (Day 111), the Syndicate's first strike two weeks in and Harbor Fest's VIP rush.

The longest lull with nothing new at all is 7 days, about an hour, and it is the siege of Sourwood Manor (Days 136–143), where the fight fills the days. Across ten maps the longest lull runs 5–10 days.

### Acts and ranks

The five acts ride the rank ladder. From Act 2, each climax needs a rank inside its act, and in the simulation every rank-up lands inside its act.

| Act | Target days | Ranks | Simulated Classic rank-ups | Climax needs |
| --- | --- | --- | --- | --- |
| 1 Lottie's Corner | 1–15 | 1–3 | Rank 2 on Day 4, Rank 3 on Day 9 | The Summer Fair Taste-Off, Day 14 |
| 2 Surf & Turf | 15–40 | 3–5 | Rank 4 on Day 19, Rank 5 on Day 41 | Rank 5 to storm or buy out the Blend Shack |
| 3 Grounds for Revenge | 40–60 | 5–6 | Rank 6 on Day 58 | Rank 6 to storm or buy out the Grindhouse |
| 4 Fields & Fizz | 60–105 | 6–8 | Rank 7 on Day 78, Rank 8 on Day 104 | Rank 8 to storm or buy out FizzCo Tower |
| 5 The Big Squeeze | 105–150 | 8–9 | Rank 9 on Day 135; Rank 10 on Day 157, after victory | Rank 9 to Call the Big Squeeze |

Domination on Day 143 ends the campaign inside Act 5, and Rank 10 follows in Endless Summer. The roadmap below lays the five acts along these days and ranks.

### Campaign roadmap

&#91;embedded content: acts from the spec canon · rank and Domination days from the economy model (Classic, 170 simulated days)\]

From Act 4 on, ranks come three to four weeks apart, so the late game leans on VIP orders, events and the Syndicate for fresh goals between ranks. In the model, the first chopper lands on Day 72 and the first ship on Day 87, both in Act 4, and Domination lands on Day 143, two weeks before Rank 10. Open questions covers when Rank 10 should arrive.

**Fun check:** New toys land every few days, and each helper takes a chore away just as the empire outgrows it. Lottie's 3 goals always point at the next unlock, so even the winter lull has a target.

## Narrative

**The pitch, as the game opens it (2026-11-08):** Forty years ago Vera Sourwood stole Grandma Lottie's recipes. Now five drink gangs run Citrine Bay, and the nearest one wants Lottie's corner. Beat Brock at the Summer Fair on Day 14, then knock out all five, and the recipes come home. Lottie tells it in five taps before the first cup, and the boss board keeps it on screen.

In one line: Lottie's grandkid takes Citrine Bay from five drink families, recovers 7 stolen recipe pages and reunites two feuding grandmas. The story rides inside play: about 20 short, skippable scenes, with everything else told by newspaper, phone and radio.

### Premise and backstory

For 40 years, five drink families have split Citrine Bay under the **Pitcher Pact**, a truce signed on a napkin at Dot's Diner. The Sourwoods took lemonade and enforce the deal.

It started in the **Sour Summer of '79**, when a sign painter asked two best friends whose name went first. Lottie Puckett and Vera Sourwood never agreed. By August, Vera had stolen 7 of Lottie's 10 recipe pages and undercut her out of business.

Vera handed most of the pages out to seal the Pact. Lottie kept Classic, Pink, Mint, a folding table and a grudge she polishes like the good silver. The two still buy lemons at the same Market stall, on alternate days, by arrangement.

Now Lottie's bored grandkid is here for summer vacation. She drags out the table: "When life gives you lemons, you take the whole town."

### Cast

| Character | Role | Personality | Wants | Signature line |
| --- | --- | --- | --- | --- |
| Grandma Lottie Puckett, 78 | Mentor; sets Lottie's Goals | Sharp tongue, warm heart, competitive even about pie | Her pages back; secretly, her friend | "Sugar's cheap. Respect costs extra." |
| The Grandkid (you) | Default Charlie Puckett; fully customizable | Mostly silent; quick replies never change outcomes | A summer worth bragging about | "Okay, Grandma. One town, coming up." |
| Dex Moody | Teen neighbor; first guard, then crew chief | Loyal, brave, terrified of geese, including yours | To be called "Chief" just once | "Nobody touches the Corner. Unless it's a goose. Then I'm getting Lottie." |
| Marisol Vega | College student: books, loans, Auto-Price | Dry, exact, immune to swagger | Tuition and a balanced ledger | "The bank loves you. That's what worries me." |
| Skip Larkin | Loud-blazer realtor: land, auctions, buyouts | Sees a gold mine in every puddle | His commission | "Kid, they're not making any more land. I checked." |
| Benny Buzz | Ad man: marketing | Talks only in slogans | His jingle on 101.5 The Squeeze | "You're not selling lemonade. You're selling sunshine in a cup." |
| Sheriff Dolores Budd | Writes Citations for daytime raids below 2.0 stars | Weary, fair, permanently thirsty | A quiet summer and a cold cup | "I'm not mad. I'm writing you a Citation. Is that Mint?" |
| Mayor Gil Fontaine | Town Hall; Vera's fines and land freezes | Smarmy, loyal to whoever is winning | A ribbon to cut | "I represent all of Citrine Bay. Some of it more than others." |
| Captain Squawk | Lottie's thieving seagull; your Gull Flight scout | Vain, greedy, secretly heroic | Every lemon in the Bay | "SQUAWK." (Lottie: "Six guards. He wants a lemon.") |
| Dot | Diner owner; keeps Sit-downs neutral | Unflappable; has heard every threat twice | Peace in her booths | "Pie first. Threats after pie." |

### The five bosses

Every boss but Vera can be bought out, so the only HQ a gentle player must storm is Sourwood Manor.

| Boss | Motive | How they fight you | Beaten or bought out | Arc and exit |
| --- | --- | --- | --- | --- |
| Brock "The Blender" Bodine | Undefeated until your taste-off; wants his record back | Blender Rush: frequent cheap fist raids; flattens 3 guards at once | Blend Shack (easiest HQ), or an instant buyout | Sore loser turned surf-school owner: "The ocean never raided anybody, bro." |
| Juniper "Juni" Grind | Keep the Grindhouse open; FizzCo pays the rent | Night Shift: silent night raids, spoiled stock, posters that dent Reputation | The Grindhouse, or a haggled buyout "in small bills, for authenticity" | Realizes she sold out to a soda company; turns informant on FizzCo |
| Tilly "Big Tilly" Hollis | Keep the family land whole | Dig In: cheap tough fences and hay bales; rarely attacks, never budges | The Hollis Homestead, or a buyout she takes readily | Tests you, then vouches for you; becomes the County Fair's most feared taste-off judge |
| Preston Fizzwell III | Citrine Bay is one bullet point in his five-year plan | Hostile Takeover: outbids, ad blitzes, Cease-and-Desist letters, then muscle | FizzCo Tower, or a buyout after hard haggling | From the Tower to a tow truck, still on his car phone: "Let's circle back!" |
| Vera Sourwood | Control of the Pact; underneath, 40 years of missing her friend | Old Money: the Mayor's fines and land freezes, elite Stewards, the Syndicate | Never sells in the campaign; only the Big Squeeze ends her | Kept the last page sealed for 40 years; opens it with Lottie and makes up |

### The five acts

Acts advance on their climax; days and ranks are targets. A boss who falls early exits early.

### Act 1: Lottie's Corner

Maple Row → Old Town · Days 1–15 · Ranks 1–3. **Goal:** learn the trade, one idea a day.

1. **Day 1:** Lottie hands you the table, her pitcher and 3 pages, then pulls a spare from her cardigan. Once the stand opens, Brock phones: "Bro. Your stand is in my sun. Summer Fair, Day 14. You lose, you leave." *Teaches pricing.*
2. **Day 3:** Lottie sells you the side lot by the Corner for $300, card table included: "Two tables, twice the trouble. You'll love it." *Teaches a second stand.*
3. **Day 3:** at dawn a Sourwood Steward kicks over your table "as a reminder." Lottie: "Well. Guess she remembers me." It's a scene, not a raid, and costs one spilled pitcher. Lottie: "And Brock's boys come for the till tonight." That night they do. *Teaches the Picket Fence.*
4. **Day 4 and Day 6:** Dex volunteers and moves into the shed, and Benny Buzz paints your first sign. *Teaches guards and marketing.*
5. **Day 7:** Skip finds you an Old Town corner. *Teaches land.*

**Climax:** the Summer Fair taste-off. Brock stakes his Strawberry page against one of Lottie's pies; win, and he swears revenge live on 101.5.

**Unlocks:** Strawberry. Brock has been taunting you on the phone since his Day 1 call.

### Act 2: Surf & Turf

The Boardwalk · Days 15–40 · Ranks 3–5. **Goal:** survive Brock's revenge and take the Boardwalk.

1. **Dex's push:** on the act's first morning Dex wants a Clubhouse: "The shed sleeps one, Miss Lottie. A Clubhouse sleeps six. Just saying." Build one, then hire a squad to fill it. *Teaches the Clubhouse and its reserve.*
2. **Squawk's flight:** the one required Gull Flight, over the Pier. *Teaches scouting.*
3. **Payback:** Dex trades fists for clubs; you Shakedown one Blenders stand and Smash another. *Teaches raids and First Dibs.*
4. **Off-season:** winter empties the Boardwalk. Lottie: "Nobody buys a smoothie in sleet." *Teaches Weakened rivals.*

**Climax:** the first HQ assault, on the Blend Shack, or a buyout at Dot's from Rank 5.

**Unlocks:** Frozen and the Blend Shack Trophy.

### Act 3: Grounds for Revenge

Campus & Arts · Days 40–60 · Ranks 5–6. **Goal:** find out who keeps spoiling your stock.

1. **The mystery:** stock spoils overnight with no raid detected. Dex blames the geese; it is never the geese. *Teaches Lookouts and Floodlights.*
2. **The posters:** every campus wall sneers "LOTTIE'S: LEMONADE FOR PEOPLE WHO LIKE THINGS." *Teaches Reputation repair.*
3. **The handshake:** at Dot's, Preston offers a friendly 7-day Truce for a modest tribute. *Teaches Sit-downs.*
4. **Night flight:** the morning after Cold Brew's first Sabotage raid on you, Squawk reports beanies at your stand at 03:00, which unmasks the mystery's night crew. Lottie: "Two can play, kid." Juni calls: "We don't smash. We curate decline." With no Sabotage on you a week into the act, Juni calls anyway. *Teaches Sabotage.*

**Climax:** take the Grindhouse or haggle a buyout. Juni slides over FizzCo's invoice: "Curated decline, Lottie's Lemonade, 12 nights." Any Truce tribute you paid Preston is on it too.

**Unlocks:** Honey-Ginger Hot Lemonade and Juni's tip calls.

### Act 4: Fields & Fizz

The Groves, Downtown, The Harbor · Days 60–105 · Ranks 6–8. **Goal:** win Fields for a helipad and Docks for a pier, then topple FizzCo.

1. **County Fair:** out-brew Tilly, and she sells you a Field at a friendly 1.5× value instead of her usual 2.5×. *Teaches Plot Buyouts.*
2. **First chopper:** a movie star orders 4,000 bottles of Pink; Juni warns that FizzCo will hit the pad, and FizzCo hits its first pickup. *Teaches Delivery Raids.* Below Threat 3 (Laid Back at Rank 6), or while FizzCo keeps a Truce or sits out its Respect cooldown, nobody hits the pad; Lottie says only: "Have every bottle ready when it lands."
3. **The lawyers:** a Cease-and-Desist arrives with a fruit basket and blocks your Downtown ads for 3 days. *Teaches Cease-and-Desists.*
4. **First ship:** the Regatta flagship's horn plays the first 3 notes of Lottie's Theme; Lottie blames the wind. *Teaches ship contracts.*

**Climax:** FizzCo Tower falls, by assault or hard-haggled buyout. Tilly can fall any time from Rank 7, or join the Syndicate.

**Unlocks:** Sparkling and the FizzCo Tower Trophy.

### Act 5: The Big Squeeze

Hilltop Estates · Days 105–150 · Ranks 8–9. **Goal:** outlast the Syndicate, then Call the Big Squeeze when ready.

1. **The auction:** on the act's first morning at Rank 8, Vera's old harp teacher swaps her Hilltop estate for a houseboat and auctions the Lavender page. Rank 8 in Act 4 waits for FizzCo Tower to fall. Sealed bids close at the next dawn, and with no bids the auction runs again; the winning bid runs about a day's income. *Teaches sealed bids.*
2. **Tea at the Manor:** Vera offers to buy you out. Your three replies: "No," "No, thank you" and "Absolutely not, ma'am."
3. **The Syndicate:** two weeks into the act, Vera unites whoever is left, plus the Mayor, into a Pitcher Pact against you, and its first boss-led strike hits 2–3 of your plots under the Founders' Day fireworks. *Teaches multi-front defense.*
4. **Historic hedges:** the Mayor freezes your Hilltop land deal to protect "historic hedges." *Teaches Old Money.*
5. **Harbor Fest:** choppers and ships queue for the Fall VIP rush while Syndicate crews go after every delivery. Every horn plays Lottie's Theme, and Lottie swears she isn't humming along.
6. **The button:** at Rank 9, Lottie posts one goal with no timer: Call the Big Squeeze. "When you're ready, kid. Not a minute before."

**Climax:** a 7-day siege, then the Manor: Gate, Yard, Boss Room. Each siege dawn the Corkboard names that night's 2–3 targets; every night you hold them all knocks 10% off the Manor Gate (down to 1,500 of its 5,000 HP) and benches one Yard elite, and every plot you lose adds a Steward to the Boss Room. When Vera's cane clatters down, Lottie walks in, and they face off across the tea table.

Vera produces the last page, still sealed: "It said open together." Inside: a pinch of salt and "a friend to share it with." They make up over a glass.

**Unlocks:** Lottie's Secret Reserve and the ending.

### Epilogue: Endless Summer

You own the Bay, and the goal becomes Peak Success Score. The sign over Lottie's Corner now flips each dawn between "Lottie & Vera's" and "Vera & Lottie's."

### Recipe pages

Each recovered page becomes a recipe card and a 20-second scene, and empty slots in Lottie's book show who holds the rest. Her shorthand ("a glug, a smidge") is why no boss ever got them right.

| Page | Held by | How it comes home |
| --- | --- | --- |
| Strawberry | Brock | Staked at the Summer Fair; lose, and it waits at the Blend Shack |
| Frozen | Brock, framed over the blenders | Blenders eliminated |
| Honey-Ginger Hot Lemonade | Juni, taped inside the register | Cold Brew Collective eliminated |
| Hollis Half-and-Half | Tilly, who added the tea and her own name | Hollis beaten or bought out |
| Lavender | Vera's harp teacher; Vera paid for lessons with it in 1980 | The Hilltop estate auction at Rank 8, once Act 5 opens; if outbid, it moves to the winner's HQ |
| Sparkling | Preston, laminated in the boardroom | FizzCo Tower falls or sells |
| Lottie's Secret Reserve | Vera, sealed: "Open together" | Sourwood Manor's Boss Room |

### How the story is told

| Channel | When and how much |
| --- | --- |
| Morning Bugle | Each dawn: 1 headline, 2–3 briefs |
| Phone taunts | 1–2 lines when a boss's mood shifts, on the rotary phone at Lottie's Corner |
| 101.5 The Squeeze | About 1 DJ line per game hour; your M3 jingle airs here |
| Lottie's Goals | Always 3 on screen; story goals wear a page icon |
| Scenes | About 20 per campaign, each under 60 seconds and skippable |

Scenes never interrupt a raid, pickup or rush; they wait for a lull. Skipped scenes leave a one-line recap; voice lines have subtitles. Each day carries at most 1 scene and 1 phone taunt.

### Two endings

Lottie hints at each act's end which way you lean. The Beloved ending needs more buyouts than Smashes and HQ captures, plus 4.0 stars or more; anything else earns the Iron Pitcher. Both are victories and play when the map turns yellow.

| Ending | Bugle's final front page | Lottie's last line |
| --- | --- | --- |
| The Bay's Beloved Lemon Mogul | "TOWN THROWS PARADE FOR BAY'S BELOVED LEMON MOGUL; MOGUL INSISTS ON PAYING" | "You took the whole town, and it still waves at you. Now that's a lemonade stand." |
| The Iron Pitcher | "THE IRON PITCHER: LOTTIE'S RULES EVERY CORNER. CORNERS ADVISED TO BEHAVE." | "You took the whole town, kid. Next summer, try asking it nicely." |

### Tone guide

Warm, punny and quick: mob-movie lines from grandmas, teens and surf bros, one pun per line at most. Jokes land on choices and egos, never on bodies, accents or backgrounds.

| Speaker and moment | Line |
| --- | --- |
| Lottie, Kids' Lemonade Day raid | "We do not rob seven-year-olds in this family. Put the pitcher back." |
| Dex, goose on duty | "Peel Patrol, hold the line! Not you, Honkers. You hold that line over there." |
| Marisol, record day | "Profit's up 40 percent. Please don't celebrate by buying another goose." |
| Brock, raid warning | "Your fence is cute, bro. My guys are gonna do pull-ups on it." |
| Juni, after a Sabotage | "Your stock didn't spoil. It made an artistic choice." |
| Tilly, raided | "Bring all the hatchets you want. I've got hay bales till Tuesday." |
| Preston, Cease-and-Desist | "I'm not threatening you. Legal says I can't. I'm forecasting." |
| Vera, Syndicate forms | "I sent your grandmother a reminder, dear. This is the follow-up." |
| Bugle, Act 1 climax | "FOLDING TABLE STUNS SMOOTHIE EMPIRE AT SUMMER FAIR" |
| Bugle, Act 5 opens | "PACT IS BACK: SOURWOOD SIGNS UP EVERYONE BUT THE KID" |
| DJ, a Scorcher | "Ninety-seven on the Boardwalk, and the Smoothie Bros are jogging in formation. Lock up your sugar, Maple Row." |

### Sandbox and Endless

Sandbox and Endless keep the cast but drop the plot: no acts or scenes, yet bosses keep their personalities, taunts, headlines and exits.

- **Sandbox:** pages return when their holders fall. Strawberry comes from any fair win, as does any page whose holder isn't on the map. With Peaceful on, Vera sells at 3× her cash and buildings once Weakened.
- **Endless:** 14 days after victory, then every 30 days, an Out-of-Towner arrives with a headline and a taunt. Snootwater Springs' boss calls tap water "a cry for help." Beaten bosses cameo, and Lottie's Goals never run dry.

**Fun check:** Grudges make every raid personal and every page worth chasing, adding stakes without chores. No scene runs over 60 seconds, interrupts a raid or hides a goal.

## Game modes and winning

Every mode plays by the same rules and chases one of two goals: own the Bay, or squeeze on for a higher score.

### The modes

| Mode | What you play | How it ends |
| --- | --- | --- |
| Story Campaign | 5 acts on the hand-made map, about 140–150 days (see Narrative) | Domination, then Endless Summer |
| Sandbox: Turf War | Your map size, rivals, difficulty and win condition | Domination, Economic or never |
| Endless Summer | Play for Peak Success Score | Only in a loss |
| Challenges (stretch) | Short scenarios with one goal | Goal met or missed |

Endless Summer follows any victory ("keep squeezing") or starts as its own mode. An **Out-of-Towner** faction arrives 14 days after victory and then every 30 days, buying into your thinnest district. Version 1 ships one, Snootwater Springs, a snooty bottled-water chain that fights like Brock's Bros under its own look; more are a stretch goal. Challenges include Heat Wave Hustle (earn $50,000 in 7 days) and Clean Hands (take Downtown without a raid).

### Sandbox: Turf War

| Map size | Districts | Rivals |
| --- | --- | --- |
| Small | 4 | 2 |
| Medium | 6 | 3 |
| Large | 8 | 5 |
| Huge (stretch) | 10 | 5 |

Small to Large are cut from Citrine Bay; Huge is generated. You start in Maple Row, and each chosen rival brings its home district. Every map keeps at least 1 Field and 1 Dock plot, so VIP clients stay reachable.

You win by Domination, by Economic (a Success Score target picked from the rank thresholds) or never.

**Peaceful** removes combat for everyone: no raids, Sabotage, HQ assaults or Delivery Raids. Rivals compete with prices, marketing and land. They fall only to Faction Buyouts or 7 days bankrupt, and even Vera sells, at 3× her cash and buildings once Weakened.

### Difficulty

Difficulty changes how often rivals come and how hard setbacks land, never the rules.

| Preset | Raids on you | Notice; Respect cooldown | Worst setback | Cookie Jar |
| --- | --- | --- | --- | --- |
| Laid Back | ×0.5; Threat −1 (minimum 1); up to 4 raid-free nights in a row | 30 game minutes; 5 days | Busted: closed until a 10% repair | Always, so no game over |
| Classic | ×1: a base of 1 a week at Threat 1 to 6 at Threat 5, and never more than 2 raid-free nights in a row | 15 game minutes; 3 days | Wrecked: rebuild at 15% within 24 game hours, or the plot goes For Sale | Once per act |
| Cutthroat | ×1.5; at most 1 raid-free night in a row; the Syndicate forms at Threat 4 in Sandbox and Endless | 5 game minutes; 1 day | Wrecked, as Classic | Never |
| Custom | Any value from ×0.5 to ×1.5; up to 2 raid-free nights in a row | Any value from Laid Back's to Cutthroat's | Busted-only on or off | Always, once per act or never |
| Peaceful (Sandbox, on any preset) | None; rivals scheme instead | No combat on either side | Outbid or out-priced | As the preset |

Laid Back reaches Ranks 5–9 about 14% sooner than Classic, and Cutthroat keeps about Classic's pace under more raids (see Economy and balance). With no acts, Sandbox and Endless refill Classic's Cookie Jar once per season.

### Winning and losing

**Domination ("You Own the Bay")** needs every rival eliminated and Majority control (51%+) in every district. The map paints itself yellow, then the ending plays (see Narrative). Owning every purchasable plot earns **Every Last Plot**.

**High score** is Peak Success Score, the best a run ever reaches, so a late slump never erases it. It goes on a local leaderboard (online is stretch). **Ironman** keeps a single save, so leaderboard runs can't undo a bad night.

You can lose two ways, never on Laid Back:

- **Squeezed Out**: end a day below $0 and you have 3 days In the Red to sell or borrow your way out. Fail with the Cookie Jar empty, and it's over.
- **Run Out of Town**: no stands left and less than the $150 a new Folding Table costs.

Any mode can reload the last dawn autosave; an Ironman run just ends.

**Fun check:** Victory is a show you watch as the map turns yellow, and Endless Summer keeps the toys out afterward. A loss takes 3 warned days In the Red or an empty map, and Laid Back never ends a run.

## Events and the living world

Citrine Bay never repeats a day. Weather moves thirst from ×0.2 to ×1.6, and seasons scale demand from ×0.6 to ×1.2.

### Seasons and weather

A year is 4 seasons of 14 days, starting on Summer Day 1, so a campaign sees about 3 summers.

| Season | Days | Demand | Weather leans | Calendar events |
| --- | --- | --- | --- | --- |
| Summer | 1–14 | ×1.2 | Hot, with Scorchers | Summer Fair (Old Town, week 2), Surf Contest (The Boardwalk), Founders' Day fireworks |
| Fall | 15–28 | ×0.9 | Warm and Cloudy | County Fair (the Fairgrounds, week 1), Campus Homecoming (Campus & Arts), Harbor Fest (The Harbor) |
| Winter | 29–42 | ×0.6 (not for Honey-Ginger Hot Lemonade) | Cloudy and Rainy, some Storms | Winter Lights Market (Old Town) |
| Spring | 43–56 | ×1.0 | Warm and Cloudy | Spring Marathon, Election Day |

The Boardwalk swings hardest: ×1.5 in summer, ×0.4 in winter. Dawn forecasts are about 80% right, and the Radio Jingle (M3) adds a 2-day look ahead. Storms damage L1–L2 stands, which then need an overnight repair (see Running the business).

Fairs host Taste-Offs, and festivals fill a district with its favorite crowd, such as students at Homecoming or joggers at the Marathon. Harbor Fest brings extra helicopter and ship offers. Election Day can change the Citation rules for a year, and Event Sponsorship (Rank 5) makes any festival your party (see Marketing).

### Random events

Random events are announced as they start, and each alert card names its counter-play.

| Event | What happens | How long | How to play it |
| --- | --- | --- | --- |
| Heat Wave | Scorchers in a row: thirst ×1.6 | 3 days | Extra ice, higher prices, Frozen |
| Lemon Blight | Lemons ×2, about $0.10 more a cup | 5 days | Buy daily (lemons spoil in 3 days) and nudge prices up |
| Sugar Shortage | Sugar ×2 | 5 days | Sugar keeps: a stocked Warehouse rides it out |
| Viral Video | One stand draws ×2 traffic | 2 days | Stock deep; raise the price |
| Food Critic | A critic tastes at one named stand | 1 day | Short line, fair price, fitting recipe: +0.1 star (or −0.1) |
| Health Inspection | An inspector checks one named stand | 1 day | Repair and restock it, or it closes until dawn |
| Power Outage | Ice machines stop in one district | 1 day | Buy Market ice for those stands |
| Storm | Thirst ×0.2, traffic ×0.4 | 1 day | Stock light; repair L1–L2 stands |
| Hurricane (late game) | Damage to buildings bay-wide | 1 day, forecast 2 days ahead | Fortified Frames; rebuilds cost only 15% |
| Celebrity Sighting | ×2 traffic in one district | 1 day | Send Sunny the Lemon |
| Parade Route | ×2 traffic on one street | 1 day | Restock the route's stands at noon |
| Roadworks | −50% traffic on one street | 3 days | Run campaigns elsewhere |
| Tourist Bus | Tourists fill one district | 1 day | Pour Strawberry, price high |
| Captain Squawk | The gull steals one stand's lemon delivery | Until restocked | Restock; forgive him |

### Taste-Offs

Taste-Offs are non-violent duels at both summer fairs, even in Peaceful. Three judges each give a hint, such as "for the kids," "not too sweet" or "worth a little extra." You answer with a recipe card, a Sweetness setting and a price.

Each hint points at recipe match, Sweetness or price fit: the demand model in miniature. The winner, rivals included, gets +0.1 star and +20% traffic in that district for 7 days. The first year's Day 14 Summer Fair Taste-Off is Act 1's climax (see Narrative).

### The voice of the world

Nothing important arrives unannounced. The Morning Bugle prints the forecast, market prices, the week's calendar and today's events, each with district and length. Mid-day events break in on 101.5 The Squeeze and as an alert card (see Music and sound).

### Kids' Lemonade Day

For 1 day, kid stands pop up on sidewalks across the bay, splitting nearby customers like any stand within 2 plots. Lottie posts a goal: leave them alone until dusk. Raiding one costs 0.5 star, a front page and Lottie's respect (see Narrative), and the Raid Planner shows that cost in red first.

**Fun check:** Events turn ordinary days into stories, like the Heat Wave week the ice ran out, each with a headline and a counter-play. Bad luck never stacks: one harmful event at a time, none before Day 6.

## Player experience

The whole game plays from one camera, one top bar and a stack of paper screens, and nothing appears before its system unlocks.

### Views

| View | What you see | What you do there |
| --- | --- | --- |
| Bay View | Plots tinted by owner, raid arrows, VIP flights | Buy land, read district control, pick raid targets |
| Mid zoom | Price tags, queue counters, HP bars | Price, restock, upgrade, defend |
| Street View | Queues, patrols and brawls | Watch fights; tap a walker to see why they passed |
| Gull Flight | A chase view behind Captain Squawk | Scout rivals; watch VIP arrivals |

The Tycoon Camera glides through the first three in one zoom and rotates in 90° steps or freely.

Gull Flight is optional after one scouting mission in Act 2. Circling a rival plot reveals its defenses for 3 days and pins a snapshot to the Rivals Corkboard. The clock keeps running, and any alert offers a one-tap return.

### Show, don't tell

The UI follows six rules (adopted 2026-11-06; wireframes in the UI plan, `docs/spec/ui-plan.md`):

1. **Three taps a morning.** The morning asks only recipe, price and stock, then Open. Everything else lives behind a tab or in the world.
2. **The stand is the dashboard.** Stock fills the crate, sugar jar and ice tray on the table; the price sits on a chalkboard; the pitcher's colour is the recipe; Reputation stars hang on the stand's sign.
3. **People react, numbers don't.** Walkers show a thought bubble for why they bought or passed: a cup (bought), a coin with a cross (too pricey), zzz (not thirsty), an empty pitcher (sold out), an arrow (went to a rival).
4. **Meters over numbers.** An exact figure appears only where it changes the choice, such as price and cost. Everything else is a bar, pips, a dial or an icon.
5. **Eight-word ceiling.** No line of UI text runs past about eight words. Explanations move to hover or long-press.
6. **Hide what's locked.** No greyed "Needs Rank 4" rows. A thing appears the day it unlocks, with a small fanfare.

### Top bar and alerts

The top bar holds four things: Cash (a coin jar), the Rank badge with its progress meter, the day and clock, and the weather. Reputation moves to the stand's sign; Threat appears only at 2 or more, as sour lemons. Speed buttons sit bottom right while the stand is open. Every meter explains itself on hover or long-press.

Lottie's goals collapse to one goal pill with a progress bar; tap it for the rest. The Bugle headline slides in at dawn as a small banner and slides away; the forecast is the weather chip. Bugle Extras stack small in a corner and fade on their own; only story beats get the big banner.

**Morning dock.** One wooden strip along the bottom: three pitchers (Classic, Pink, Mint) with a three-cube Sweetness toggle, a chalkboard price with − and + and a crowd meter of five little people, three supply buttons (lemons, sugar, ice) that each buy a pack (long-press fills), and a big round Open button. How full each supply is shows on the stand itself (lemon crate, sugar sack, ice cooler), so the dock only buys and warns: a supply button pulses when it will run short; the price chalk turns red below cost.

**Day's end.** One card: the profit as a big number that counts up, cups sold and people turned away, Reputation stars with an up or down tick, the Rank meter, one line from Lottie, "Raiders on the way tonight" when a raid on you is planned, and Sleep. The raiders line names no gang, makeup or time (the warning card in the feed shows who, where and when as they set out), but it carries one fix, at the plot of the first raid to set out that still has one: post a ready guard from the reserve there, or else buy that plot's next fence, greyed out with the reason when cash is short. The card waits for you; "To the map" folds it for the Evening's moment, and the full Ledger sits behind "See the books".

**Tabs.** The stand panel has three tabs, Today, Grow and Defend, and a tab appears only once something in it is unlocked. Grow shows picture cards (the next stand with three growth bars: faster, busier, holds more; local campaigns; brand marketing). Defend shows the crew as faces with level pips and a weapon icon, the Hiring Hall as faces, the next fence, and gadget slots; locked gadgets stay hidden. Marisol's bank is a building on the map, and a Borrow button appears where you're short.

**Plot card.** Name, owner colour and one action; land value, traffic and district share on hover or long-press.

Alerts land as cards in the left feed, each with Go There and one action, such as Ring the Bell. Major alerts auto-pause by default: raids on you (except on Cutthroat), Delivery Raids, each VIP client's first arrival, going In the Red and rank-up perk picks. Each type has its own switch, and full-screen paper pauses too (sound priority: see Music and sound).

Menus are table props in the clay style, drawn flat over the world (see Visual style and art direction). There are ten: Morning Bugle, Ledger, Stand panel, Crew roster, Raid Planner, Rivals Corkboard, Order Book, Land Registry, Rank and Perks, and Lottie's Goals. Each opens from its meter, a hotkey or a tap on the thing it describes.

### Raid Planner

One sheet shows the odds before you commit:

1. **Target**: tap a rival plot in Bay View or on the Corkboard.
2. **Objective**: Smash, Shakedown, Sabotage or HQ Assault. A locked one says why, such as "Sabotage needs a Lookout or a Sneaky guard."
3. **Squad**: guards show as faces; Dex fills it up to your cap (5, 8 or 12) with "Take all"; tap a face to swap.
4. **Time**: now or tonight. A Tonight raid that would get there after 07:00 waits for the stands to open and is fought by day, with its star cost and, below 2.0 stars, a Citation; the Planner says so in red.
5. **Go**: check the win chance (a dial with words: long shot, coin flip, good odds, sure thing; the percentage on hover), travel time, expected loot, and any Reputation cost or Citation risk, shown in red.

Unscouted defenses show "?", and the win chance shows as a range until a Lookout or Gull Flight fills them in. The range puts up the fence and gadgets a rival builds on a stand of that size, with every post filled: only who holds the posts is a guess, from that size's usual kit to the next one up, with help counted. The real chance always falls inside it. Raid templates (Rank 6) save a squad and objective for one-tap repeats.

### Onboarding: the first 30 minutes

Lottie teaches one system a day, and its button appears that day. At about 8 real minutes a day, the first 30 minutes cover Days 1–4 (story beats: see Narrative).

| Day | Lottie teaches | What appears | Her goal |
| --- | --- | --- | --- |
| 1 | Price, the story and the rivals | The price tag, Cash, the alert feed, the boss board, Brock's first call, the first day call | Sell out your first pitcher |
| 2 | Recipes, weather and supplies | Recipe cards, the Sweetness dial, the forecast, the Market (Lottie stocked Day 1 only), Auto-Restock | Match a recipe to the weather |
| 3 | Defense and a second stand | Threat lemons, the Picket Fence, Lottie's $300 side lot by the Corner; that night, the first raid | Fence the Corner |
| 4 | Guards | The Crew roster, with Dex | Station Dex for the night |
| 5 | Upgrades | The upgrade button, the Rank badge | Build the Wooden Stand |
| 6 | Marketing | Hand-Painted Signs | Paint your first sign |
| 7 | Land | The Land Registry | Open a stand in Old Town |

Curious players need not wait: Rank 1 systems, such as upgrades and Maple Row's For Sale signs, answer a tap from Day 1. Returning players can switch the lessons off, and buttons then follow rank unlocks alone.

### Automation

Helpers arrive in the order Fun first sets, ending with district policies at Rank 7. Each one is a switch, a target you set and a one-line Ledger report. Targets include stock levels, guard priorities and a Profit, Fortify or Expand policy per district.

Any single stand can opt out, and Morning Prep previews the day's automatic spending.

### Accessibility

- Pause anywhere, mid-fight and in menus included; speeds run 1×, 2× and 3× (see Core loops and time).
- Faction colors are colorblind-safe and always carry a pattern, so owners read even in grayscale.
- Text scales to 150% without breaking any phone-width screen; reduced motion swaps shakes and flashes for fades.
- Every key is remappable, and every action also works by mouse or touch alone.
- Captions cover voices, the radio and every phone call, and every audio alert has a visual twin (see Music and sound).

### Laptop and phone

| Action | Laptop | Phone |
| --- | --- | --- |
| Pan | Drag, or W A S D | One-finger drag |
| Zoom | Scroll wheel or trackpad pinch | Pinch |
| Rotate | Q and E for 90° steps; right-drag for free | Two-finger twist |
| Select; explain | Click; hover | Tap; long-press |
| Pause; speed | Space; 1, 2, 3 | Top-bar buttons |
| Steer Gull Flight | Mouse | Drag |

On a phone, the top bar folds to Cash, the clock and speed until tapped, and screens open as full-width sheets. Phones get fewer walkers and simpler light (see Design decisions for the build), and any day resumes mid-day.

**Fun check:** The world is the interface: you watch queues grow and fences hold, and every number explains itself on hover. Nothing appears before Lottie teaches it, and automation takes each chore before it becomes one.

## Design decisions for the build

These commitments shape how Lemonade Stand Wars gets built without choosing a tech stack. Several borrow techniques from Ben's Owl World, and every other section assumes them.

| Decision | The call | Why it serves the game |
| --- | --- | --- |
| Camera | Both. The Tycoon Camera is the main view: angled top-down, zooming from the whole bay to street level. Gull Flight (Captain Squawk) is optional, for scouting, VIP arrivals and sightseeing | Tycoon play needs the overview. Flight adds delight and borrows Owl World's flight technique |
| People on screen | At most about 150 animated people in Street View on a laptop and about 60 on a phone. Visible walkers stand in for the simulated crowd | Busy streets read as success without overloading a phone |
| Fights on screen | At most 24 fighters per side on a laptop and 12 on a phone; extras join the dust cloud. Player squads cap at 12 | Brawls stay readable and light |
| Visual budget | The busiest phone view stays within Owl World's busiest phone view: about 130 draw calls and 355,000 triangles | A proven ceiling from Ben's own game |
| Rivals | Always AI, in every mode. Optional online leaderboards later. Async multiplayer stays a stretch goal the AI design must not rule out | Single-player pacing and nothing to host |
| Menus | Flat screens over the world, styled as kitchen-table props in clay and card: ledger, newspaper, corkboard, deeds. In-world UI is limited to small floating markers | Menu-heavy tycoon screens stay clear, clickable and testable |
| Simulation | Deterministic and tick-based: 1 tick = 1 game minute, with all randomness from a per-run seed. The world on screen is a view of the simulation, which can run fast-forwarded with no graphics | Balancing and automated playtests need no person watching. This spec's numbers were checked that way |
| Saves | Autosave every dawn (3 rotating) plus manual slots. Every save carries a format version and migrates forward. Ironman keeps a single save for leaderboard runs | Play-forever runs survive game updates |
| Devices | A typical laptop first (mouse or trackpad plus keyboard shortcuts), phones second with lower visual quality and touch controls. Every screen works at phone width | Plays where Ben's players already are |
| Borrow from Owl World | Code and techniques only, never its world or map: how it builds terrain, sky, water, roads, crowds, ships, aircraft and its flight camera. Citrine Bay is designed fresh for this game, as big or small as its districts and plots need. The ship and aircraft techniques become the ship and helicopter clients | A faster build at a quality already proven |
| Agent-buildable | Every model built from simple shapes, every screen, level and number defined in text, and every system checkable by an agent playing the game | The whole game must be buildable end to end by an AI agent |

Two details follow from the crowd rule. At busy times one visible walker stands for several simulated customers, and queue counters always show the true number. A day is the natural stop point, but the game can also be saved and resumed mid-day.

## Visual style and art direction

**Kitchen-Table Clay** is the style: Citrine Bay is a plasticine model the grandkid built on Grandma Lottie's kitchen table. Thumb-smudged clay people squash and stretch in stop motion, and the HUD is what's lying on the table. Clay makes slapstick plainly harmless, the table ties every screen to Lottie, and bold color keeps it playful on a phone.

It replaced Toy-Town Noir on 2026-11-06, when Ben chose it from four live mockups: Sunday Funnies, Kitchen-Table Clay, Wind-Up Tin Town and Boardwalk Pixel.

The rule is show, don't tell. Pictures, meters, faces, cues in the world and motion carry the information; words come last.

### Built from clay

- **Clay kit.** Spheres, rounded blocks, lathe-turned profiles, clay snakes and slabs, each pushed slightly lumpy so nothing looks machine-made.
- **Craft, not geometry.** One shared smudge texture gives every surface thumbprints, fingerprint ridges and tool dabs. Small detail is pressed into clay, printed on card or written on tape. Smudges stay light, or the town looks dirty.
- **One material.** One clay material covers the model. Each part carries its color and finish (matte clay, glossy bead or resin, matte card or wood) in its vertex colors. The smudge map projects from three sides so it never stretches, and figures get finer thumbprints than buildings.
- **Repeat, recolor, rescale** one tree, lamp, bench, awning and crate across the bay.
- **Three detail levels.** Street View shows everything, mid zoom drops small props and costume details, and Bay View shows each building as one clay block. Phones run one level simpler up close (mid-zoom detail at Street View and while pinching out a little way), with blob shadows and no tilt-shift blur. On every screen, whatever sits far from where the camera looks draws as cached far clay or its district's Bay View block.
- **Crowds.** Street View shows at most 150 animated people on a laptop and 60 on a phone, one walker standing for several customers. A clay person costs about 900 triangles, so 60 cost about 54,000, and each body kind draws as one batch. Fights cap at 24 fighters a side (12 on a phone); extras join the dust cloud.
- **Budget.** The busiest phone view costs no more than Owl World's busiest: about 130 draw calls and 355,000 triangles. The plinth and table are 3 static pieces, and static districts merge by material.
- **Owl World** lends techniques for terrain, sky, water, roads, crowds, ships, aircraft and the flight camera. Citrine Bay's look and geography are its own.

### Light, weather and seasons

Light comes through the kitchen window by day and from a desk lamp by night. Clay catches it softly, with a warm orange edge where light turns to shadow, so it never looks muddy. Shadows lean lilac by day and indigo at night, never gray.

Four lighting scripts blend over one game hour each; dawn holds while Morning Prep waits.

| Script | Hours | Light | Signature touches |
| --- | --- | --- | --- |
| Dawn | 06:00–08:00 | Peach window light, long lilac shadows across the oilcloth | Cotton-wool mist on the resin bay, streetlights clicking off |
| Noon | 08:00–17:00 | High white window light, short crisp shadows, a glint in every bead eye | Resin-bead sprinklers, striped card awning shadows |
| Golden hour | 17:00–20:00 | Low coral and amber light raking across the table | Windows glow; clay-snake neon and string lights come on at 19:30 |
| Night | 20:00–06:00 | The kitchen light goes out; the desk lamp stands in for the moon | Amber streetlight pools, lit windows, string lights, flashlight cones in raids |

Night stays playable: shadows never drop below a quarter of daytime brightness, and owner tints glow at full strength. Lamps wear soft halos and throw warm pools on the ground, so every raid has light to happen in.

| Weather or season | Look |
| --- | --- |
| Scorcher | Heat shimmer, sweat-drop blobs over heads, ice pops sagging like warm clay |
| Rainy | Rain of beaded fishing line, glossy wet streets reflecting lit windows, cone umbrellas |
| Storm | Leaning trees, tumbling cups, the desk lamp flickering for lightning; card awnings flap on L1–L2 stands |
| Summer | Full saturation, beach umbrellas, paper bunting |
| Fall | Coral and butterscotch clay trees, piles of clay-flake leaves, yarn scarves |
| Winter | Bare pipe-cleaner branches, string lights, cotton-wool breath puffs |
| Spring | Clay-bead blossoms, flowering lemon groves, paper kites on thread |

### Palette and patterns

Everything is bold, saturated and playful, and owners stay the boldest. Owner colors appear only on owned things: turf, awnings, flags, labels, hats and crew clothes. Lemon yellow is reserved for lemons, coins, the player's property and the Lemon Blimp.

| World color | Hex | Used for |
| --- | --- | --- |
| Clay cream | #FFF1D6 | Sidewalks, paper, tape, pickets, dust clouds |
| Lemon clay | #F7C948 | Lemons, coins and the HUD's lemon props |
| Flock green | #7CC47F | Lawns, clay-ball trees, hedges |
| Resin teal | #3BB4C1 | Water |
| Terracotta | #E8704F | Roofs, lamp shades, golden hour, alert accents |
| Walnut | #8B5E3C | Plinth sides, tree trunks, wood chips |
| Plum ink | #2E2A4F | Outlines, text, bead eyes, night shadows |
| Lamp amber | #FFB55E | Streetlights, lit windows, raid flashlights |
| Blush pink | #F4A3B5 | Cheeks on every face, sunset sky |

Three extras fill in: Road clay #5F5A74 for streets, Popsicle stick #E9C98F for fences, posts and lamps, and Raspberry #C8325A for display words on tape.

| Owner | Main | Accent | Pattern |
| --- | --- | --- | --- |
| Player | Lemon Yellow #F6D33C | White #FFFFFF | Wide vertical stripes |
| Sourwood | Plum #5B2A6E | Gold #C9A227 | Diamond damask |
| Hollis | Tea Amber #B5651D | Gingham Red #D64545 | Gingham grid |
| FizzCo | Cola Red #C8102E | Chrome #B8C2CC | Bubble dots |
| Cold Brew | Espresso #3B2A20 | Oat #E8DCC4, Neon Pink #FF4FA3 | Diagonal pink zigzag |
| Blenders | Mango #FF9F1C | Lagoon Teal #00A6A6 | Horizontal waves |

Patterns differ in shape and direction, so a grayscale screenshot still shows every owner; every screen gets that grayscale check. Where accent and main share a lightness (Player, Hollis, Blenders), patterns get a thin Plum ink edge. Blenders turf fills with Mango, since Lagoon Teal nearly matches the bay.

Patterns are pressed into the clay or built from it: the Player's wide stripes, Sourwood's gold diamond studs, Hollis gingham squares, FizzCo's chrome bubble buttons, Cold Brew's neon-pink zigzag snake and the Blenders' teal wave snake. They also mark awnings, flags, labels, hatbands and rival vehicles; on Bay View tiles they keep one on-screen size.

### Materials

| Material | Where | How it reads |
| --- | --- | --- |
| Plasticine | People, buildings, trees, vehicles, the plinth | Soft sheen, thumbprints and tool marks, a warm glow at the shadow edge |
| Glossy resin | Water, ice, glass, bead eyes, buttons | Clear and wet with a bright window glint; the bay deepens from shallow teal to deep blue |
| Cardstock | Awnings, signs, roof trim, Downtown's printed glass facades, bunting | Matte, with scalloped edges and printed stripes |
| Popsicle sticks and matchsticks | Fences, posts, lamps, benches, piers, the Ferris wheel, cranes | Raw pale wood; chips show Walnut |
| Masking tape | Labels, numbers, queue counters, headlines | Torn ends and handwritten letters |
| Chalkboard | Price boards, L3 menus | Smudged chalk on green-black |
| Clay-snake neon | L4+ signs, Downtown, Cold Brew turf | Rolled clay letters that glow from golden hour |
| Oilcloth | The kitchen table | Blue gingham, with a mug ring and stray lemon seeds |

### The bay and its districts

Bay View is the whole model on its plinth on the kitchen table. The plinth's cut sides show clay strata like a slice of layer cake, and the resin sea shows at its edge. Each plot is a clay tile in its owner's tint and pressed pattern, outlined in Plum ink. Unowned land stays bare Clay cream, civic plots get a masking-tape border, and landmarks grow 1.5× so players navigate by silhouette.

The table frames the model: a blue gingham oilcloth, a mug ring, stray lemon seeds, a real lemon and a teacup for scale, an opened pack of plasticine bars, a sculpting tool, Lottie's reading glasses and the desk lamp that lights the bay at night.

| District | Signature shapes | Colors | Props | Eye music (what moves) |
| --- | --- | --- | --- | --- |
| Maple Row | Lumpy ball trees, clay cottages with scalloped card trim, matchstick picket rows | Flock green, cream, sky blue | Mailboxes, kiddie pools, flower boxes | Resin-bead sprinklers, a trotting clay dachshund |
| Old Town | Tool-pressed brick fronts, bandstand, clock tower | Soft brick, cream | Market stalls, Dot's Diner | Clock hands, the band |
| Campus & Arts | Sawtooth roofs, the Quad, murals on card | Oat, charcoal, mural brights | Record shops, skate rails | Skaters, seasonal murals |
| Downtown | Towers faced in printed-card glass, plazas | Blue-gray card, chrome | Food carts, revolving doors | The lunch-rush tide |
| The Boardwalk | Popsicle-stick decks, umbrellas, the Pier's popsicle-stick Ferris wheel | Sand, white, sea foam | Surfboards, lifeguard towers, sandcastles | Sculpted clay waves, the wheel |
| The Harbor | Popsicle-stick cranes, warehouses, crate stacks | Rust, gray, cream | Fish market, buoys | Cranes swinging on thread, bobbing soap boats |
| The Groves | Lemon-tree rows, windmills, the Fairgrounds | Green, lemon dots, sage barns | Hay bales, tea rows | Windmills, tractors on button wheels |
| Hilltop Estates | Hedge walls, mansion domes, polo lawn | Deep green, white, lilac | Topiaries, soap yachts | Opening gates, golf carts |

Small details appear from what sits together: bunting between neighboring player stands, laundry lines between houses, gulls on roofs. Trucks are clay boxes stacked with crates, and bikes are pipe-cleaner frames, all on button wheels.

### Characters

Everyone is a clay figure about 2 heads tall: a big sphere head on a lathe-turned body, short arms and legs, round clay hands and round clay shoes. Kids stand about 1.8 heads, Cold Brew's slouched beans 2.5 and Sourwood's stilts over 3. Faces do the telling: bead eyes with a white glint, clay-snake brows, a real nose and pink blush thumbprints on the cheeks. Families vary the parts: heavy lids and a long nose for Sourwood, a potato nose and bushy mustache for Hollis, shades and a square nose for FizzCo, heavy lids for Cold Brew and zinc noses for the Blenders. Skin tones come from a ramp of 8, assigned at random, never tied to faction or villainy.

Expressions swap as whole faces: neutral, yum, pucker, brain-freeze, price-shock (eyes pop) and KO (spiral eyes). Eyes blink every few seconds. There are never X eyes, and no face copies a grin or eye shape from any studio's characters.

Each family has its own body shape and gait, so it reads by silhouette and by motion even at Bay View. Hats and props carry identity: faction hats are hard, iconic shapes; customers wear soft hats or none. Fill a character solid black, and its side still reads from body, hat and tool.

| Crew | Body and gait | Hat | Club tier | Hatchet tier |
| --- | --- | --- | --- | --- |
| Peel Patrol (yours) | Pear body; a bouncy bob, arms crossed on guard | Yellow cap with a green leaf: every head reads as a lemon | Bats in yellow tape | Striped-handle hatchets |
| Sourwood Stewards | Stilt-thin in high white collars and white gloves; a stiff glide | Bowler | Walking canes | Silver-headed hatchets |
| Hollis Farmhands | Barrel in gingham and overalls; rolls side to side | Wide straw disc | Shovels | Farm axes |
| FizzCo Security Associates | A flat-topped block, head included, in a blazer with an earpiece; marches in lockstep | Flat-top hair, wraparound shades | Batons | Chrome-headed hatchets |
| Cold Brew baristas and skaters | S-slouched bean in a hoodie and apron; pushes and coasts on a skateboard | Slouchy beanie | Skateboards | Pink-taped hatchets |
| Smoothie Bros | V-shaped in a tank top on tiny legs; hops | Open visor | Paddleboards | Teal-gripped hatchets |

Customers get the softer bodies: pear-shaped adults bob, round folk roll and kids skip. Their props say who they are: balloons (kids), strollers (families), bucket hats (seniors), backpacks (students), lanyards (office workers), cameras (tourists), lunch pails (workers), tiny dogs (high rollers).

Your crew's gear shows: taped fists, a puffy vest 15% rounder for a Padded Vest, shoulder pads and a helmet for Pro Gear. Levels add clay-snake sleeve chevrons, none for a Rookie up to four for a Legend. Lookouts carry binoculars, Wreckers a tool belt, Captains a whistle.

| Boss | Signature look |
| --- | --- |
| Vera Sourwood | The tallest stilt in town, ramrod straight; silver bun, glossy bead pearls, a silver-tipped cane she taps on every beat |
| Tilly Hollis | The widest barrel in town; picnic-table hat, giant ladle over a shoulder |
| Preston Fizzwell III | A wedge-shaped block; slick hair, brick car phone |
| Juni Grind | The deepest slouch; beanie low, iced coffee, coasting on her board |
| Brock Bodine | The widest V on the tiniest head; visor, zinc nose, a double-bicep flex |

Lottie is short and round in a lemon cardigan, glasses and pearls, under a straw sun hat with a lemon on the band: the logo come to life. From her striped lawn chair she fans herself, knits, sips, cheers a rush, shakes a fist at raiders and nods off under a zzz. The grandkid starts in a lemon cap and a white apron, freckled and gap-toothed: bored on the counter when closed, bouncy when open, cheering every sale.

Marisol hugs a ledger, Skip Larkin's blazer is printed with tiny houses, and Benny Buzz never lowers his megaphone. Sheriff Budd carries a ticket book and a lemonade, never a holster; Mayor Fontaine wears a tiny plum lapel pin.

Lanky Dex stands 3 heads tall in a lemon guard vest. He scans the street in held beats, arms crossed, and hops sideways whenever a goose waddles past. Captain Squawk is a round cream clay gull in a tiny captain's cap, a stolen lemon wedge in his beak.

### Stop motion

Every clay thing poses on twos: 12 new poses a second, with a slight boil as thumbprints shift and each pose jitters a hair every step. The camera, the water and the HUD stay smooth at full frame rate, so the stepping reads as hand-made, not as lag. Stepping also halves the crowd's per-frame work on phones, and shadows re-render only when the poses step.

- Every step squashes about 8% and springs back. Everyone squashes before an action and bounces once after it.
- Idles have attitude and start at random points, so a crowd never moves in unison; only FizzCo march in lockstep, on purpose. Idle bobs follow the music's beat.
- Heads turn to watch a pour, buyers puff their cheeks before the yum face, and walkers clap, point and flinch at what the player does.
- Vehicles squash when they brake and stretch when they launch; builds rise like dough and overshoot.
- Reduced motion stops the boil and swaps shakes and flashes for fades.

### Stands L1–L5

Every upgrade is a crate reveal: a giant popsicle-stick citrus crate drops with a squash, rattles, and its slats fall open like petals. The new stand rises like dough, overshoots and settles. Reveals last 3 seconds (L2–L3) or 6 (L4–L5), skip on a tap, and nearby walkers clap.

| Level | Look | Reveal flourish |
| --- | --- | --- |
| L1 The Folding Table | Card table with a striped lemon skirt, crayon sign on popsicle posts, glass pitcher, cooler, the kid's crate step | Unfolds with a snap |
| L2 The Wooden Stand | Popsicle-stick booth, scalloped striped card awning with string lights | The awning springs down, a bell dings |
| L3 The Kiosk | Two windows, chalkboard menu, juicer | The chalkboard writes its own menu |
| L4 The Lemon Shack | Clay-snake neon LOTTIE'S sign, picnic tables, ice machine | The neon buzzes on letter by letter |
| L5 The Citrus Palace | Lemon-clay dome, giant spinning lemon, drive-up window, resin fountain | The dome rises like a sunrise |

Every stand wears its state, so the stand is the dashboard. Lemons fill the crate, the sugar sack slumps as it empties, and ice sits in an open cooler. The pitcher takes the recipe's color, sugar cubes on the counter count the Sweetness, the price sits on a chalkboard, and Reputation hangs as stars on the sign. Tap OPEN and the card flips to OPEN, any awning springs down, the stand bounces and clay-pellet confetti flies.

Rank 10 gilds the Palace. Rival stands reuse the five silhouettes in faction colors, topped by a bowler, sun-tea jar, soda bottle, coffee cup or surfboard, and dressed in family props: Cold Brew's has a skateboard-deck sign, a drip tower and a quarter-pipe.

Damage shows in steps: a torn card awning at 75% HP, a fallen sign at 50%, dangling sticks and squashed corners at 25%. Wrecked is a neat pile of popsicle sticks and squashed clay with the sign on top.

### Defenses and gadgets

| Perimeter | Look (lemony touch) | Breach |
| --- | --- | --- |
| P1 Picket Fence | Matchstick pickets with lemon-shaped clay tips | Pickets pop like piano keys |
| P2 Chain-Link Fence | Pipe-cleaner diamond mesh, a lemon-shaped clay padlock | Mesh peels like a can lid |
| P3 Sharpened Stakes | Pencil stubs sharpened to points, yellow as lemons | Choppers yelp OUCH |
| P4 Barbed Wire | Twisted pipe-cleaner coils with lemon-seed barbs | Snagged sleeves go RIIIP |
| P5 Citrus Fortress Wall | Tool-pressed clay bricks, lemon-dome turrets, a gate like a citrus press | Bricks pop out |

| Gadget | Look | When triggered |
| --- | --- | --- |
| Tin-Can Alarm | Tiny lemon-label cans strung on thread | CLANK-CLANK |
| Guard Goose ("Honkers") | Clay goose in a striped card neckerchief | HONK rings; the first attacker freezes under stars |
| Lemon-Peel Slick | Glossy clay peels on the path | Attackers spin like tops and flop |
| Sprinkler Ambush | Pop-up lawn heads | Soaked attackers drip under a tiny cotton-wool rain cloud |
| Floodlights | Popsicle-stick poles with lemon-shaped hoods | KA-CHUNK: night turns to day |
| Watchtower | A crate cabin on popsicle-stick stilts | A sweeping beam and a big "!" |

### VIP arrivals

Choppers are chunky clay with lollipop-stick rotors, and they dangle from a visible fishing line like a model on a string. A Pad is a bottle cap with a lemon-wedge clay H and a striped windsock. Helipads add a raised deck and lights; Heliports add a second deck and a yellow carpet.

Each chopper wears its client's comic paint job, with a tiny clay VIP in the window. Rotor wash flattens the clay grass tufts into rings.

Ships are carved-soap hulls pushing a sculpted clay wake through the resin: yachts at a Jetty, pastel cruise ships at a Pier, crate-piled freighters at a Cargo Terminal. Every horn plays the first 3 notes of Lottie's Theme. The Lemon Blimp is a fat lemon-clay blimp with a leaf fin and a sun-hat gondola; at night it glows like a paper lantern.

### Brawls

Fights happen inside a rolling cloud of lumpy cream and sand clay puffs that grows as fighters join. Out fly clay arms, stars, lemons, hats and sound words on cut-paper starbursts: BONK (fists), THWACK (clubs), CHOP (hatchets), SQUISH (lemons), HONK (geese). Each word takes the color of the side that landed it, and a patterned tug-of-war bar counts fighters left.

KO'd fighters squash flat as a pancake, puff back up with spiral eyes and 3 orbiting stars, then wobble home in a zigzag while the winner dusts off. The last KO of a fight gets a brief freeze and a small camera punch. Hatchets are only seen biting wood, in bursts of Walnut chips; hits on people stay inside the cloud. No blood, no bruises, no X eyes, and nobody stays down.

### Table props, type and icons

The HUD is what's lying on the kitchen table: a row of props along the top and a wooden tray of them along the bottom. Layout follows the UI plan in Player experience: four top chips, one goal pill, a headline toast at dawn, the morning dock and the Today, Grow and Defend tabs. This section sets only the look.

| Prop | Shows |
| --- | --- |
| Coin jar with a tape label | Cash; every sale's coin lands in it |
| Clay rosette with a clay-snake meter | Rank and progress to the next |
| Egg timer | Day and time |
| Weather card | Forecast and temperature |
| Sticky note with a Lottie doodle and a pencil-line meter | The goal pill |
| A pitcher per recipe you own | Recipe, by the drink's color; the chosen one glows |
| Sugar cubes | Sweetness, 1 to 3 |
| Chalkboard between a terracotta minus knob and a green plus knob | Price; the chalk turns red below cost |
| Five little clay heads | Expected crowd, filling in |
| Lemon bowl, sugar bag, ice tray | Stock you can count, each with a green clay plus to buy more; a low one pulses with a terracotta "!" |
| Big round lemon-clay OPEN button | Opens the stand; it squashes and turns green while open |

Every prop squashes when pressed and bounces back. Menus are table props too, drawn flat over the world. The Bugle is folded newsprint whose photos are snapshots of your game, the Ledger a notebook with green-ruled pages and red ink for losses, and deeds are cardstock with a pressed-clay seal. The Rivals Corkboard pins instant photos linked by red yarn that thickens with grudge.

Headlines and alerts land as masking-tape strips, slapped on with a bounce; raid alerts get a red torn edge. Outcomes thunk down as crooked rubber stamps: SOLD, SMASHED, CAPTURED, WRECKED, BUSTED, NABBED, TRUCE. In-world markers stay small: chalk price tags, tape queue counters, thought bubbles, owner-colored HP pills and dashed clay-snake raid arrows.

Type has three voices. **Chewy** sets headlines, rank-ups, sound words and the OPEN button. **Fredoka** sets body text and stays legible at 14 px on a phone. **Gochi Hand** writes masking-tape labels, Lottie's notes and handwritten numbers, in even-width digits never smaller than 20 px. No line of UI text runs past about eight words.

Icons are chunky clay blobs: a fat Plum ink edge, a glossy sheen at the top left, a thumbprint dimple and a soft drop shadow. Each is drawn on a 64-unit grid with a 3-unit ink stroke and a fill lit from the top left, bold, high-contrast and readable at 24 px. They look hand-made in the style; there are no generic emoji or stock glyphs. The core set is coin, lemon, sugar cube, ice, crowd, rank rosette, raid cloud and weather sun. Threat counts in grumpy sour clay lemons, on an alarm chip that appears only from Threat 2 (see the UI plan). Faction marks are pressed-clay medallions with their pattern embossed.

### Logo and crate labels

Every logo is a pressed-clay medallion or a citrus-crate label made in clay: an emblem on a sunburst, bordered in the owner's pattern. The title label rolls LEMONADE STAND in clay-snake script above WARS in fat pressed-clay letters, with a hatchet notch in the W.

| Label | Emblem |
| --- | --- |
| Lottie's Lemonade | A smiling lemon in a sun hat |
| Sourwood | A lemon in pearls and a monocle |
| Hollis | A tea jar crossed with a ladle |
| FizzCo | A winking soda bottle |
| Cold Brew | A sleepy coffee bean |
| Blenders | A flexing smoothie cup on a wave |

### Juice and motion

Feedback comes in three sizes: small under 0.3 seconds, medium up to 3, big up to 6 and always skippable. Everything squashes before it acts and lands with one bounce, and every prop has a physical sound to match: a clink, a tick, a boing (see Music and sound).

- **Sales**: a clay coin arcs from each sale into the coin jar, and a masking-tape KA-CHING pops over the stand. Coins merge into bigger ones at 2× and 3×.
- **Thought bubbles**: clay emote blobs pop in, hold and melt away: a heart for bought, a coin with a cross for too pricey, zzz for not thirsty, an empty glass for sold out, and a rival's cup with a clay arrow toward their stand. Thirsty walkers show a sweat drop.
- **Speech bubbles**: barks pop up in a Clay cream bubble with a Plum ink edge and a tail to the speaker, then melt away like the emotes. Crowds speak only Lemonese.
- **Upgrades**: the crate reveal.
- **Rank-ups**: a Chewy headline slaps down on tape, clay-pellet lemon confetti falls, and three Lottie's Tips cards fan out.
- **Raid alerts**: a red-edged tape strip slaps into the feed, and a dashed clay-snake arrow rolls out toward the target with an egg-timer ETA.
- **Captured HQs** are smoothed over by a wave of lemon clay, keeping one relic as the Trophy. At Domination the whole model turns lemon yellow.

### Camera

The Tycoon Camera looks down at the model at a tilt, low and tight enough that in Street View the stand and its walkers fill about a third of the screen. Tilt-shift blur softens the top and bottom of the frame, strongest in Street View and thinnest at Bay View, inside a warm vignette that turns indigo at night. It rotates in eased 90° steps or freely, and Bay View pulls back far enough to show the plinth on the table. Gull Flight drops the blur for a wide, windy chase behind Captain Squawk as he banks over the bay.

### Three mood scenes

**Scorcher noon on the Boardwalk:** white-hot window light makes the sand glow, and the popsicle-stick planks wobble with heat. Sweating tourists, sweat drops over their heads, snake from your Lemon Shack past a Blenders hut. Strawberry Lemonade sells as fast as the ice machine clatters, coins arc into the jar, and Brock flexes from the Pier.

**Night raid on Maple Row:** at 02:00 the kitchen is dark but for the desk lamp, one amber streetlight and a ticking sprinkler. A red tape alert slaps into the feed: three Smoothie Bros hop toward your Wooden Stand. Honkers honks, Dex charges, a yellow THWACK flies from the clay cloud, and three visors wobble home under stars.

**The first helicopter:** golden hour pours through the kitchen window and paints the Groves coral as your crew stacks pink-lemonade crates beside the bottle-cap pad. A pink chopper with a star on its tail swings down on its fishing line, flattening the grass tufts into rings. A movie star's assistant signs for 4,000 bottles, and tomorrow's Bugle prints the moment as a photo.

**Fun check:** Every look answers three questions at a glance, picture first: who owns this, what is happening, and is it good for me? Night never hides the game, celebrations stay short and skippable, and bold color keeps the clay from turning muddy.

## Music and sound

Lemonade Stand Wars sounds like **Surf-Noir Lounge**, and its music tells you the time of day, the danger level and how far you've climbed. One whistled tune, Lottie's Theme, gains a layer at each of the 10 ranks, so success is something you can hum.

### The sound

| Time | Tempo | Instruments | Mood |
| --- | --- | --- | --- |
| Day (08:00–20:00) | 88–124 BPM, straight eighths, major modes | Whistle, ukulele, glockenspiel, surf guitar, upright bass, bossa drums | Sunny, breezy, busy |
| Night (20:00–08:00) | The bed's tempo in half time, swung, minor modes | Walking bass, brushes, finger snaps, muted trumpet, vibraphone | Cool, sneaky, mob-movie |
| Raids and brawls | 132–160 BPM, driving, harmonic minor | Tremolo surf guitar, galloping toms, bongos, brass stabs, slide whistle | Urgent but goofy |

### Lottie's Theme

Lottie's Theme is an 8-bar tune in F major and 4/4, with a straight-eighth bossa-surf feel. It runs at 120 BPM on the title screen and 108 BPM in Maple Row. Its first three notes, F, A and D, are also the ships' horn call.

The melody climbs to a hopeful high note, then repeats its opening and drops an octave like a setting sun. Its one sour note, a D-flat over the minor four chord, is Lottie's sigh for the Sour Summer of '79. Sung, it goes: "When life gives you lemons, take the whole town; one cup at a time till the sun goes down."

Chords: I – VI7 – ii7 – V7 – I – IV, iv6 – ii7, V7 – I. The noir bridge, heard at night and from Rank 9, moves to the relative minor: vi – vi(maj7) – vi7 – vi6 – ii7 – III7 – vi – V7.

| Rank | What joins the arrangement |
| --- | --- |
| 1 Sidewalk Squeezer | Whistle, ukulele and glockenspiel: the folding-table trio |
| 2 Corner Hustler | Upright bass |
| 3 Block Boss | Bossa rim clicks and shaker |
| 4 Neighborhood Name | Reverb surf guitar doubles the tune |
| 5 District Big Shot | Full drum kit and a muted-trumpet countermelody |
| 6 Citrus Baron | Bongos and a lounge organ whose wobble mimics rotor blades |
| 7 Lemon Tycoon | Strings, and a bari sax horn call atop each loop |
| 8 Juice Magnate | Horn-section stabs and a harp glissando for the Lemon Blimp |
| 9 Bay Kingpin | Timpani and the 8-bar noir bridge |
| 10 The Big Squeeze | The town sings it in Lemonese; the last chorus lifts a whole step |

A new layer gets a 2-bar solo spotlight the first time it plays. The title screen plays your best save's arrangement, so the menu grows with you.

### Faction leitmotifs

| Faction | Lead instrument | Mode or scale | Rhythm | Description |
| --- | --- | --- | --- | --- |
| The Sourwood Family | Harpsichord, string quartet | C harmonic minor | 3/4 waltz, 96 BPM, a cane tap on beat one | Prim and icy; smiles while it threatens |
| Hollis Sweet Tea Co. | Banjo, fiddle, slide guitar | G Mixolydian | 2/4 hoedown, 116 BPM, ladle-on-pot backbeat | A stubborn porch stomp |
| FizzCo Beverages | Bubbly synth lead | C Lydian | Four-on-the-floor, 128 BPM, rising arpeggios | A shiny jingle ending on a bottle-cap pop |
| The Cold Brew Collective | Electric piano, vinyl crackle | D Dorian | Lazy swing, 80 BPM, behind the beat | Deadpan lo-fi jazz, coffee-grinder fills |
| The Boardwalk Blenders | Surf guitar, party horns | D Mixolydian | Galloping surf beat, 152 BPM | Beach-bro party rock, blender whirs |

A leitmotif plays when its boss phones you, under its raids, at its HQ and, deflated, in its exit scene. When the Syndicate forms, the surviving motifs stack into one menacing medley.

### District beds

| District | Tempo | Key or mode | Instruments | Feel |
| --- | --- | --- | --- | --- |
| Maple Row | 108 BPM | F major | Lottie's Theme at your rank | Lazy porch afternoon |
| Old Town | 116 BPM | B-flat major | Bandstand brass, tuba, clock chimes | Friendly Main Street bustle |
| Campus & Arts | 88 BPM, swung | D Dorian | Electric piano, upright bass, brushes | Cool mural-painting afternoon |
| Downtown | 124 BPM | C major | Lounge organ, vibraphone, slick synth bass | Glossy lunch-rush hustle |
| The Boardwalk | 120 BPM | D Mixolydian | Surf guitar, bongos, party organ | Endless beach party |
| The Harbor | 96 BPM | G Dorian | Bari sax, accordion, buoy bell | Foggy, salty, hard-working |
| The Groves | 104 BPM | G Mixolydian | Banjo, harmonica, washboard | Breezy fields and windmills |
| Hilltop Estates | 96 BPM, 3/4 | C minor | Harpsichord, string quartet, harp | Snooty garden party with a chill |

Every bed has day, night and rain versions and quotes the horn call once per loop. Take Majority and Lottie's ukulele joins that district's bed; at Full Control, its melody becomes Lottie's Theme.

### Adaptive music

Music is built from synced stems on a shared 4-bar grid, so layers swap seamlessly.

| Layer | Trigger | What you hear |
| --- | --- | --- |
| District bed | The camera's center district in Street View; Lottie's Theme in Bay View | That district's bed |
| Business intensity | Share of your stands with a queue (under 25%, 25–60%, over 60%), held 1 game hour | Quiet: bed only. Busy: hand percussion. Rush: horn stabs and the whistled hook |
| Raid alert | A raid on you is detected, or its minimum notice starts | Raid Incoming stinger, then woodblock ticks each beat, doubling for the last 15 game minutes |
| Brawl | A fight on screen or on your plot | Dust Cloud loop in the bed's key; each KO adds a falling slide whistle |
| Night | 19:30 | Crossfade to the bed's night version over 4 bars |
| Rain | Rainy or Storm weather | Brushes and vibraphone take over; Storm adds low tremolo strings |
| Threat tension | Threat 3 or more | 3: a low guitar drone. 4: creeping pizzicato. 5: a cane tap on every downbeat |
| Rank-up | A new rank | Rank Up stinger, then the theme returns with its new layer |
| VIP arrival | A helicopter lands or a ship docks | Helicopter: a 2-bar brass fanfare. Ship: the horn blows F, A, D and the bed answers C, A, F |
| Victory | Raid won, HQ captured, Domination | Raid Won stinger; boss motifs deflate into Lottie's Theme; Domination paints the map yellow, one district per bar |
| Defeat | Raid lost, Squeezed Out | Raid Lost: a falling slide whistle and sour ukulele strum. Squeezed Out stinger, then Lottie hums the horn call |

Layers enter and leave on bar lines with 1-bar fades. Bed changes crossfade over 2 bars at the next phrase, after the camera rests 2 seconds. Stingers wait at most a beat, duck the bed by 12 dB and hand back over 1 bar.

Every bed key sits within two steps of F on the circle of fifths, so crossfades stay in tune. Game speed never changes tempo; pause keeps the music playing, muffled and 6 dB down.

### Track list

| Title | Where it plays | Length | Description |
| --- | --- | --- | --- |
| When Life Gives You Lemons | Title screen | 0:56 | Horn call, sunny theme, noir bridge, big finish |
| Lottie's Corner | Maple Row; Bay View by day | 2:22 loop | Lottie's Theme in 10 rank layers |
| Morning Bugle | Morning Prep | 1:30 loop | Ukulele under the radio show |
| Main Street Shuffle | Old Town | 2:00 loop | Bandstand brass, clock chimes |
| Mural Hours | Campus & Arts | 2:00 loop | Swung electric piano |
| Power Lunch | Downtown | 2:00 loop | Glossy organ lounge |
| Sunburn Social | The Boardwalk | 2:00 loop | Surf guitar beach party |
| Low Tide Cranes | The Harbor | 2:00 loop | Bari sax, buoy bells |
| Lemon Rows | The Groves | 2:00 loop | Banjo and harmonica |
| Pearls and Polo | Hilltop Estates | 2:00 loop | Chilly harpsichord waltz |
| Streetlight Amber | Bay View at night | 2:00 loop | Walking bass, muted trumpet |
| Hold the Fence | Any raid, from approach to breach | 1:00 loop | Tremolo guitar, galloping toms |
| Dust Cloud | Every brawl | 0:48 loop | Bongos, brass stabs, slide whistles |
| Pie on Neutral Ground | Sit-downs at Dot's Diner | 1:30 loop | Polite jukebox lounge, tense underneath |
| Judges' Table | Taste-Offs | 1:00 loop | Game-show bounce |
| Pool Party Pickup | Helicopter and ship pickups | 1:00 loop | Glamorous brass; ships open with the horn call |
| Knock Knock | HQ assaults | 2:00 loop, 5 versions | Each boss motif, battle-ready |
| Call the Big Squeeze | The siege and Sourwood Manor | 3:00 | Every rival motif against Lottie's Theme |
| A Friend to Share It With | Lottie and Vera make up | 1:30 | The theme as a waltz for whistle and harpsichord |
| Endless Summer | Domination and credits | 2:30 | The Rank 10 arrangement, sung in Lemonese |

### 101.5 The Squeeze

The town's radio station plays during Morning Prep, from radios on L3+ stands, and as an optional soundtrack. DJ **Cal Clementine** is a velvet-voiced gossip who reads the Bugle's headlines and calls turf skirmishes like a ball game. He takes every faction's ad money, never takes sides, and signs off "Stay sweet, Citrine Bay."

Station IDs ride a three-note chime: "All killer, no pulp." "You're squeezed in with Cal Clementine." "Fresh-pressed hits, every morning."

The Radio Jingle tier (M3) puts you on air: Benny Buzz cuts a 10-second spot on the theme's first two bars, ending "Get Lottie's!" It airs in every Morning Prep show and again at lunch, followed by Cal's 2-day forecast.

| Rival | Jingle tag, sung in its leitmotif style |
| --- | --- |
| Sourwood | "Some families are simply better." |
| Hollis | "Brewed slow, stirred with a ladle!" |
| FizzCo | "Bubbles mean business!" |
| Cold Brew | "You probably haven't heard of us." |
| Blenders | "Smoothies so big they need a lifeguard!" |

During a rival's marketing blitz, its jingle opens the morning show, so the radio tips you off. An eliminated rival's jingle retires with one second of on-air silence.

### Sound effects

Every combat sound is a cartoon sound; nothing sounds like real injury.

| Category | Palette |
| --- | --- |
| Business | Pitcher glug, ice clink, a happy Lemonese "ahh", hammer flurry and brass "ta-da" for upgrades |
| Money | Cash-register ding (the theme's top F), coin clatter, deed stamp, auction gavel |
| Combat | Fist bonks, club thwacks, hatchet chops on wood, lemon squish for spoiled stock, slide whistles, KO birdie tweets |
| Defenses | Fence rattles, barbed-wire twang, Honkers' goose honks, tin-can clatter, peel-slick zip and thud |
| World | Seagulls and Captain Squawk, surf, clock tower, soft rotor thumps, ships' horns playing F, A, D |
| UI | Paper props: newspaper snap, page flip, corkboard pin, rubber stamp |

### Voice

Lottie, Dex and the five bosses each get about 20 barks of 1–4 words. Barks fire at rank-ups, raids, KOs, phone taunts and HQ fights; longer lines stay as text.

| Speaker | Sample barks |
| --- | --- |
| Lottie | "Atta kid!" |
| Vera | "How quaint." |
| Tilly | "My land!" |
| Preston | "Let's circle back." |
| Juni | "Mm. Bold." |
| Brock | "Brooo!" |

Crowds, customers and henchmen speak **Lemonese**, a gibberish of soft citrus syllables that imitates no real language. Tone carries the meaning: a rising "Sqwee-ma?" asks the price, "Peela-zip!" says thanks, and a grumbled "Rindo bum" means too pricey. Subtitles are on by default, name each speaker in faction color plus pattern, and caption Lemonese by mood, such as \[delighted\].

### Mix and accessibility

Six sliders set Music, Radio, Voice, Effects, Alerts and Ambience. Voice ducks music and radio by 6 dB; stingers duck the bed by 12 dB.

Alert priority, highest first: game over or victory, raid on you, Delivery Raid, VIP pickup, rank-up, boss phone call, business notices. One alert sound plays at a time; the rest queue, and repeats within 10 seconds merge.

Every audio alert has a visual twin: an alert-feed card, a screen-edge pulse in its color and pattern, and an in-world marker. Raid ticks match the on-screen ETA clock, and the Threat layer matches the Threat lemons. Calm Audio, on by default in Laid Back, removes ticks and tension layers and softens the raid alert.

**Fun check:** The soundtrack is a progress bar you can hum: every rank adds an instrument, and every docking ship plays your tune. Alerts never stack, every sound has a visual twin, and Calm Audio keeps laid-back play laid back.

## Scope plan

The MVP proves the fun on 3 districts with 2 rivals. Version 1 builds the whole bay, the story and the polish, and stretch goals wait until both play well.

| Feature | Tier | Why |
| --- | --- | --- |
| Maple Row, Old Town and The Boardwalk, plus 1 Field and 1 Dock plot | MVP | Home, hub and enemy turf: a whole turf war, small |
| Boardwalk Blenders and a light Sourwood presence, with phone taunts | MVP | One rival to beat, one to dread |
| Stands L1–L5; Classic, Pink and Mint; pricing, weather and seasons | MVP | The selling puzzle is the core |
| Supplies with Auto-Restock | MVP | The first chore handed to automation |
| M1–M3, Sandwich-Board Kid and Free Sample Day | MVP | Ben's ask: marketing that pulls crowds |
| Buying land; Knock it down, buy it up | MVP | Wins must turn into territory |
| P1–P4; Tin-Can Alarm, Guard Goose and Lemon-Peel Slick | MVP | Ben's fence ladder, plus warning and slapstick |
| Guards with fists, clubs and hatchets; Smash and Shakedown | MVP | Ben's weapon ladder and revenge |
| Auto-battle defense with warnings | MVP | Fair losses are the riskiest promise |
| Success Score, Ranks 1–7, Threat 1–4; basic helicopter and ship orders | MVP | Ben's score that draws rivals and VIPs |
| Domination and Endless; Classic and Laid Back; a short tutorial | MVP | Both endings and both moods |
| The 8-district campaign, all 5 rivals, the story and HQ assaults | Version 1 | Content on proven systems |
| All recipes; Sit-downs, buyouts and auctions | Version 1 | Pages to chase and peaceful routes |
| Specialists, all gadgets, all automation, Lottie's Tips perks | Version 1 | Depth that stays calm at 8 districts |
| Citations, events and festivals, the Bugle and 101.5 The Squeeze | Version 1 | A living town that jokes back |
| Contracts up to Ships; Bottling Works and Warehouses | Version 1 | The late-game economy |
| Sandbox, Cutthroat, Gull Flight, one Out-of-Towner in Endless, full art and music | Version 1 | Replay, real challenge and polish |
| Mega contracts, more Out-of-Towners in Endless, Challenges | Stretch | More to chase after victory |
| Generated maps and online leaderboards | Stretch | They need a finished core |
| Async "rival empire" multiplayer | Stretch | Rivals stay AI; the design leaves room |
| Bosses as advisors, Franchise prestige (a new town with Legacy perks), photo mode, mod support | Stretch | Long-tail delight |

### What the MVP must prove

The MVP ships only if new players hit the five playtest signals in Fun first.

| Signal | MVP features under test | First lever if it misses |
| --- | --- | --- |
| A third plot, unprompted, within the first hour | Maple Row For Sale signs, L1 profit | Cheaper Maple Row plots |
| Most first sessions run past 30 minutes | The 5-minute day, Lottie's Goals, the first upgrade | Faster first ranks |
| A laugh at a taunt or headline in the first hour | Brock's calls, the Day 3 Steward visit | More, shorter taunts |
| Losing a stand leads to a rebuild or revenge | The 24-hour rebuild, Smash, First Dibs | Cheaper rebuilds |
| Laid Back stays relaxed through Act 1's 15 days; Cutthroat loses a stand once and comes back | Warnings, Busted versus Wrecked, the Cookie Jar | Raid frequency and notice |

### MVP calls to settle

- **Winning the small map**: without HQ assaults and buyouts, rivals fall only by 7 days bankrupt, and Sourwood has no HQ there. Should the Blend Shack assault join the MVP?
- **Scouting**: Lookouts and Gull Flight are version 1, so MVP raids would show "?" everywhere. Should MVP rival defenses show openly?
- **Bottles**: helicopter and ship orders count bottles, but Bottling Works is version 1. Should MVP orders count cups?
- **Cutthroat**: the last signal needs it, and it only turns MVP levers, so it can run as a test setting.

## Open questions

These calls shape the game and are Ben's to make. Each one says what the spec assumes now and what we recommend.

1. **How does the game make money, if at all?** The spec assumes a game with no in-game purchases: Cash is the only currency, with no premium currency, ads or loot boxes. Recommendation: keep it that way, which keeps the economy honest, and revisit only if the game moves to a store.
2. **Is E10+ the right rating?** Brawls happen inside cartoon dust clouds and hatchets mostly chop fences, but the mob theme and hatchets put the game at the E10+ line. An E rating would likely mean clubs as the top weapon and softer raid names. Recommendation: keep E10+, as written.
3. **Is about 20 hours the right campaign length?** The campaign aims for about 140–150 game days to victory, about 19–20 hours at 8 real minutes a day; the economy model's efficient player wins on Day 143 on Classic and on Day 126, about 17 hours, on Laid Back. A laid-back player may want a shorter arc. Recommendation: keep the full campaign and point shorter games to Sandbox's Small map (4 districts, 2 rivals), which already exists.
4. **Should Rank 10 arrive before or after victory?** In the economy model, Domination lands on Day 143 and Rank 10 on Day 157 (148–162 across ten maps, after victory on every map), so the title rank becomes the first goal of Endless Summer. Landing it at victory would take a threshold of about $150M, barely above Rank 9's $125M, so the two ranks would arrive almost together. Recommendation: keep it after victory, and have Lottie name it as the next goal in the epilogue. Human players will run slower than the model's efficient player, so the builder should check Domination against its Day 140–150 target in playtests.
5. **Do the story beats land on time?** Mostly, after the re-tune. Acts advance on their climax, and each rival's HQ opens at its own rank, from the Blend Shack at Rank 5 to FizzCo Tower at Rank 8. Dex pushes a Clubhouse early in Act 2, so the economy model's efficient player builds one by Day 19. On the reference map the Blend Shack falls on Day 42 and the Grindhouse on Day 61, closing Acts 2 and 3; Hollis Homestead falls on Day 79 and FizzCo Tower on Day 105, closing Act 4. The first chopper lands on Day 72 and the first ship docks on Day 87, both in Act 4, so the Jetty keeps its $250,000 price. The risk is a fast map: Hollis falls the day after Rank 7, so when Rank 7 comes by Day 69 she falls before the County Fair (Days 71–77). That happens on 2 of 10 Classic maps and on most Laid Back maps. Recommendation: keep the rank gates, check the beats in playtests, and if the Fair scene matters, keep Tilly from surrendering before the Fair.
6. **Barks or full voice acting?** The spec gives Lottie, Dex and the five bosses about 20 short barks each, with longer lines as text and Lemonese gibberish for crowds. Full voice acting for story scenes would add warmth but costs more and makes translation harder. Recommendation: barks and text, as written.
7. **Online leaderboards in version 1?** High scores are local, and online boards are a stretch goal. They need a small server, which Ben's planned game platform could host, plus cheat checks. Recommendation: local only for version 1.
8. **The four MVP calls in the Scope plan.** Recommendation: yes to all four. Add the Blend Shack assault so the small map can be won, show rival defenses openly until scouting arrives, count cups for MVP orders, and keep Cutthroat as a test setting.

## Appendix A: Balance tables

Every number below is final for version 1, checked by a 170-day simulation that takes a competent Classic player to Rank 9 on Day 135 and Domination on Day 143 on the reference map (Domination on Days 131–146 across ten shuffled maps).

Dollars are game dollars, days are game days, and "×" multiplies a base value.

### Stands

| Level | Name | Rank | Cost ($) | Draw (traffic ×) | Service (cups/hour) | Top price ($/cup) | Upkeep ($/day) | HP | Guard posts | Typical payback (days) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| L1 | The Folding Table | 1 | 150 to build new | 1.0 | 20 | 1.50 | 5 | 100 | 1 | — |
| L2 | The Wooden Stand | 1 | 400 | 1.5 | 50 | 2.00 | 15 | 300 | 2 | 2–4 |
| L3 | The Kiosk | 3 | 3,500 | 2.3 | 120 | 3.00 | 60 | 800 | 3 | 4–7 |
| L4 | The Lemon Shack | 5 | 60,000 | 3.5 | 300 | 4.50 | 300 | 2,000 | 4 | 4–11 |
| L5 | The Citrus Palace | 7 | 650,000 | 5.0 | 700 | 7.00 | 1,500 | 5,000 | 6 | 11–15 |

Costs are per upgrade step. Paybacks assume a suitable plot: any Street plot for L2–L3, a Prime or Landmark with about 1,800+ passersby a day for L4, and about 4,000+ for L5. Quiet plots pay back slower (an L4 on the Maple Row Landmark takes about 14 days).

### Stand specializations

| Slot | Opens at | Slot cost ($) |
| --- | --- | --- |
| First slot | L3 | 2,000 |
| Second slot | L5 | 40,000 |

| Specialization | Effect |
| --- | --- |
| Express Window | +30% service (cups/hour) |
| Fancy Menu | +20% top price |
| Fortified Frame | +50% HP |
| Billboard Roof | +15% traffic to your stands within 2 plots |

### Marketing tiers (global, permanent)

| Tier | Name | Rank | Cost ($) | Traffic bonus |
| --- | --- | --- | --- | --- |
| M1 | Hand-Painted Signs | 1 | 100 | +5% |
| M2 | Flyers & Sidewalk Chalk | 3 | 1,500 | +12% |
| M3 | Radio Jingle | 4 | 12,000 | +22% and a 2-day forecast |
| M4 | Billboards & TV Spot | 7 | 90,000 | +35%; unlocks the Billboard building |
| M5 | The Lemon Blimp | 8 | 500,000 | +50% |

### Local campaigns

| Campaign | Rank | Cost | Effect | Lasts |
| --- | --- | --- | --- | --- |
| Sandwich-Board Kid | 2 | $40/day | +20% traffic at one L1–L3 stand | 1 day, renewable |
| Free Sample Day | 2 | 100 free cups | +0.1 star; +15% traffic at that stand | 3 days |
| Sunny the Lemon mascot walk | 3 | $300/day | +25% traffic for your stands in one district | 1 day, renewable |
| Coupon Blitz | 4 | Prices −25% | +40% customers in one district | 1 day |
| Event Sponsorship | 5 | $2,000 per festival day | +50% traffic for your stands in the festival district | The festival |
| Billboard building | 7 | $25,000 to build | Your stands within 2 plots +20% traffic; rival stands there −10% appeal | Permanent |

### Perimeter tiers (per plot; each replaces the last)

| Tier | Name | Rank | Cost ($) | HP | Effect | Repair after a raid ($) |
| --- | --- | --- | --- | --- | --- | --- |
| P1 | Picket Fence | 1 | 150 | 150 | Slows the breach | 15 |
| P2 | Chain-Link Fence | 2 | 1,200 | 500 | Defenders fight through it | 120 |
| P3 | Sharpened Stakes | 4 | 6,000 | 1,200 | Attackers take 2 damage/second while breaching | 600 |
| P4 | Barbed Wire | 6 | 25,000 | 2,500 | 4 damage/second; attackers 30% slower | 2,500 |
| P5 | Citrus Fortress Wall | 8 | 100,000 | 5,000 | Defenders +25% damage (+50% total) | 10,000 |

Defenders get +25% damage while any perimeter stands. Repairs run overnight and cost 10% of the tier's price after each raid on that plot.

### Gadgets (2 slots per plot, a 3rd at L4)

| Gadget | Rank | Cost ($) | Effect |
| --- | --- | --- | --- |
| Tin-Can Alarm | 2 | 100 | +15% detection |
| Guard Goose ("Honkers") | 2 | 400 | +15% detection; stuns the first attacker for 3 seconds |
| Lemon-Peel Slick | 4 | 250, plus 25 per nightly reset | First 3 attackers stunned for 4 seconds |
| Sprinkler Ambush | 4 | 800 | Soaked attackers deal 20% less damage |
| Floodlights | 5 | 1,500 | Cancels the night stealth bonus |
| Watchtower | 6 | 5,000 | +30% detection; sees 2 plots out; reveals raid makeup |

Detection = 50% base plus gadgets and a stationed Lookout (+25%), capped at 95%, then −25% at night without Floodlights.

### Weapons and padding (bought per guard)

| Item | Rank | Cost per guard ($) | Hit | Chop | HP bonus | Damage taken |
| --- | --- | --- | --- | --- | --- | --- |
| Fists | 1 | 0 | 10 | 5 | — | ×1.0 |
| Clubs | 3 | 150 | 18 | 10 | — | ×1.0 |
| Hatchets | 6 | 1,200 | 24 | 40 | — | ×1.0 |
| Padded Vest | 3 | 200 | — | — | +40 | ×1.0 |
| Pro Gear | 6 | 1,500 | — | — | +100 | ×0.8 |

### Guards by level

| Level | Name | Hire fee ($) | Wage ($/day) | HP, Hit and Chop |
| --- | --- | --- | --- | --- |
| 1 | Rookie | 50 | 15 | Base |
| 2 | Regular | 150 | 25 | +10% |
| 3 | Veteran | 400 | 40 | +20% |
| 4 | Elite | 1,000 | 60 | +30% |
| 5 | Legend | 2,500 | 90 | +40% |

Guards gain about 1 level every 35 days of duty; fights and the Training Yard speed this up. Dex Moody joins free on Day 4. Unpaid guards quit.

### Clubhouse and squads

| Clubhouse | Rank | Cost ($) | Beds | Extra |
| --- | --- | --- | --- | --- |
| None | — | — | 2 ("Dex sleeps in the shed") | — |
| L1 | 2 | 2,000 | +6 | — |
| L2 | 5 | 15,000 | +12 | Training Yard |
| L3 | 7 | 80,000 | +24 | Infirmary |

| Rank | Raid squad cap (guards) |
| --- | --- |
| 3 | 5 |
| 5 | 8 |
| 7 | 12 |

A Clubhouse uses one Street plot. You may own several. Early in Act 2 (from Day 15) Dex pushes for a first Clubhouse and a squad to fill it; the simulated player builds it on Days 15–19.

### Land prices and traffic by district

| District | Street passersby (per day) | Street land ($) | Special plots, land ($) | Price tolerance (×) | Borders |
| --- | --- | --- | --- | --- | --- |
| Maple Row | 250–400 | 600–1,200 | — | 1.0 | The Groves, Old Town, The Boardwalk |
| Old Town | 500–900 | 8,000–16,000 | — | 1.0 | Maple Row, Campus & Arts, Downtown, The Boardwalk |
| Campus & Arts | 450–800 | 12,000–24,000 | — | 0.9 | Old Town, The Groves, Hilltop Estates |
| Downtown | 800–1,500 | 60,000–120,000 | Industrial 20,000–40,000 | 1.15 | Old Town, Hilltop Estates, The Harbor |
| The Boardwalk | 700–1,400 | 12,000–24,000 | — | 1.2 | Maple Row, Old Town, The Harbor |
| The Harbor | 300–600 | 6,000–12,000 | Industrial 20,000–40,000; Dock 100,000–200,000 | 0.9 | Downtown, The Boardwalk |
| The Groves | 150–350 | 3,000–6,000 | Field 40,000–80,000 | 0.9 | Maple Row, Campus & Arts |
| Hilltop Estates | 300–600 | 240,000–480,000 | Field 120,000–240,000; Dock 300,000–600,000 | 2.0 | Campus & Arts, Downtown |

| Plot type | Traffic (× Street) | Land price (× Street) |
| --- | --- | --- |
| Street | ×1 | ×1 |
| Prime | ×3 | ×3 |
| Landmark | ×5 | ×8 |
| Field, Dock, Industrial | Tiny | See table above |

Lottie's Corner starts at $300 land value with 400 passersby a day; Lottie's side lot next to it (sold to you on Day 3) is also worth $300 and gets 300 passersby a day. Buying rule: Maple Row from the start, Old Town from Rank 2, other districts from Rank 3 through a Foothold or a bordering Foothold.

### Land, repairs and loans

| Rule | Value |
| --- | --- |
| Land appreciation | Value × (1 + development); development = district stand levels ÷ (4 × purchasable plots), capped at 1 (so up to ×2) |
| Facility development | Each facility tier counts as 2 stand levels |
| Majority land discount | −10% |
| First Dibs (after your Smash) | 100% of land value, 24 game hours |
| Fire Sale (rival eliminated, by capture or buyout) | Every plot the rival held: you get First Dibs at 75% of land value for 2 days, then auction |
| Plot Buyout from a rival | 2.5× land value in their home district, 2× elsewhere |
| HQ Assault (rival Weakened) | Each HQ from its own rank: Blend Shack 5, Grindhouse 6, Hollis Homestead 7, FizzCo Tower 8, Sourwood Manor 9 (the Big Squeeze). The same rank opens that rival's Faction Buyout |
| Weakened (needed for HQ Assault and Faction Buyout) | Any one of: the rival holds 40% or less of its peak plots; its Net Worth is under 25% of yours; your daily sales (cups and bottles, in dollars) were at least 2× theirs for 7 days in a row |
| Faction Buyout (rival Weakened) | Opens at that rival's HQ rank: Brock Rank 5, Juni 6, Tilly 7, Preston 8. 1.5× the rival's cash and buildings (Brock, Tilly); 1.8× (Juni, Preston); land is not included and goes to the Fire Sale. Vera never sells in the campaign; in a Peaceful Sandbox she sells at 3× once Weakened |
| Rebuild a Wrecked building | 15% of what was invested in it, within 24 game hours (you and rivals alike) |
| Repair a Damaged building | 15% of what was invested × the share of HP lost (never more than a rebuild) |
| Busted repair (Laid Back) | 10% of what was invested |
| Loans (First Bank of Citrine Bay) | Up to 50% of non-cash Net Worth; 3% interest per week; 4-week terms |

There is no property tax and no insurance: cheap rebuilds take their place.

### Supplies and recipes

| Supply | Cost per cup ($) | Notes |
| --- | --- | --- |
| Lemons | 0.10 | Spoil after 3 days |
| Sugar | 0.03 | Keeps |
| Ice | 0.03 | Melts nightly |
| Cup and napkin | 0.05 | Flat |
| Bottle and cap | 0.15 | For contracts; replaces the cup |

Lemon, sugar and ice prices move ±20% a day at the Citrine Bay Market.

| Recipe | Cost per cup ($) | Price bonus | Shines with (×1.2 appeal) |
| --- | --- | --- | --- |
| Classic Lemonade | 0.21 | 0% | Everyone |
| Pink Lemonade | 0.24 | +5% | Kids, families; Maple Row |
| Mint Lemonade | 0.25 | +5% | Joggers, students; Campus & Arts, The Boardwalk |
| Strawberry Lemonade | 0.32 | +10% | Kids, tourists; Maple Row, The Boardwalk |
| Frozen Lemonade | 0.30 | +15% | The Boardwalk; Summer and heat waves |
| Honey-Ginger Hot Lemonade | 0.30 | +10% | Seniors; Maple Row, Old Town; ignores the Winter penalty |
| Sparkling Lemonade | 0.32 | +15% | Office workers; Downtown |
| Lavender Lemonade | 0.40 | +25% | High rollers; Hilltop Estates |
| Hollis Half-and-Half | 0.25 | +10% | Workers; The Groves, The Harbor; Summer |
| Lottie's Secret Reserve | 0.45 | +30% | Everyone, everywhere (×1.3 appeal) |

The Sweetness dial shifts appeal by 10% for a segment: kids like Extra, seniors and office workers like Less.

### Customer segments

| Segment | Price tolerance (×) | Patience (people in line) | Peak hours | Favorite recipes |
| --- | --- | --- | --- | --- |
| Kids | 0.8 | 4 | 13:00–17:00 | Pink, Strawberry |
| Families | 1.0 | 6 | 17:00–20:00 | Pink, Classic |
| Seniors | 0.9 | 10 | 08:00–11:00 | Honey-Ginger, Classic |
| Students | 0.85 | 6 | 12:00–18:00 | Mint, Frozen |
| Office Workers | 1.2 | 3 | 08:00–09:00 and 12:00–14:00 | Sparkling |
| Tourists | 1.3 | 8 | 11:00–17:00 | Strawberry, Frozen |
| Workers | 0.9 | 5 | 12:00–13:00 and 17:00–18:00 | Half-and-Half |
| High Rollers | 2.0 | 2 | 14:00–19:00 | Lavender, Secret Reserve |

A district's price tolerance in the land table is the blend of its usual crowd. Maple Row's crowd blends to about 0.9, and its table value of 1.0 sets the ceiling there.

### Demand constants

| Constant | Value |
| --- | --- |
| Base stop chance | 25% |
| Effective selling hours | 10 of 12 (peaks, lulls and queues) |
| Reputation multiplier | 0.7 at 1 star to 1.3 at 5 stars |
| Rival stands within 2 plots | Split customers by appeal (up to −35% for a stand in a crowded rival block) |
| Majority bonus | Your stands +10% sales; rival stands −10% appeal |
| Lemon Grove | +5% traffic at all your stands per Grove (up to 2); +10% per Grove with the Hollis Orchards trophy |
| Town Favorite (Old Town at Full Control) | +10% traffic at your stands in Old Town and Maple Row |
| Orchard Fresh (The Groves at Full Control) | +10% traffic at all your stands |
| Power Lunch (Downtown at Full Control) | Lunch rush (12:00–14:00) ×1.5 at your stands in Downtown and Old Town |
| Tourist Trap (The Boardwalk at Full Control) | Tourists pay +20% a cup at all your stands |
| Word of Mouth (Campus & Arts at Full Control) | Local campaigns half price: their cash, a Free Sample Day's cups (50) and a Coupon Blitz's cut (−12.5%); not the Billboard |

### Weather and seasons

| Weather | Thirst (×) | Foot traffic (×) | Summer odds (%) | Fall odds (%) | Winter odds (%) | Spring odds (%) |
| --- | --- | --- | --- | --- | --- | --- |
| Scorcher | 1.6 | 1.0 | 15 | 3 | 0 | 2 |
| Hot | 1.3 | 1.0 | 35 | 15 | 5 | 13 |
| Warm | 1.0 | 1.0 | 30 | 37 | 25 | 40 |
| Cloudy | 0.8 | 0.9 | 12 | 25 | 40 | 25 |
| Rainy | 0.5 | 0.7 | 6 | 15 | 22 | 15 |
| Storm | 0.2 | 0.4 | 2 | 5 | 8 | 5 |

| Season (14 days each) | Demand (×) | The Boardwalk (×) |
| --- | --- | --- |
| Summer | 1.2 | 1.5 |
| Fall | 0.9 | 0.9 |
| Winter | 0.6 | 0.4 |
| Spring | 1.0 | 1.0 |

### Ranks

| Rank | Title | Success Score threshold ($) | Target day | Simulated Classic day | Range on ten maps |
| --- | --- | --- | --- | --- | --- |
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

### Threat and raids on the player (Classic)

| Threat | Base raids a week | Nights a week with a raid (measured) | Henchmen | Gear | Targets per raid | Shakedown share | Smash share |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | About 5 | 2–3 | Fists | 1 | 100% | 0% |
| 2 | 2 | About 4 | 3–5 | 3 in 10 with clubs | 1 | 70% | 30% |
| 3 | 3 | About 4–5 | 5–8 | Padded Vests; 7 in 10 with clubs; 1 lookout | 1 | 40% | 60% |
| 4 | 4 | About 2.5–5 | 8–12 | Pro Gear; 6 in 10 with hatchets, the rest clubs; 1 lookout | 1–2 | 30% | 70% |
| 5 (Syndicate) | 6 | About 2.5–7.5 strikes | 12–20, boss-led | As Threat 4; 2 lookouts | 2–3 | 0% | 100% |

Threat comes from Rank alone: Ranks 1–2 → 1, 3–4 → 2, 5–6 → 3, 7–8 → 4, 9–10 → 5 (Laid Back −1, minimum 1). No raids on Nights 1–2. The first raid on you, Brock's, comes on Night 3: two Smoothie Bros with bare fists come for the till, and any fence or guard sends them home. After it, no more than 2 nights in a row pass without a raid on you (4 on Laid Back, 1 on Cutthroat). Each night's raids are drawn from the base rate, and a rumor you answer brings its gang on a night the draw gave none. The measured nights come from twelve simulated Classic campaigns with every rumor answered: the low end with every raid beaten (the raider sits out its Respect cooldown), the high end with none; the Syndicate's row counts its strikes in the weeks before the siege. Raiders fight at the Threat's level, Level 1 to 5. Most raids come at night. A Shakedown takes about 1 day of that stand's profit; a Smash leaves the stand Wrecked until rebuilt. In the simulation no raid cost more than 0.8 days of income.

### Difficulty

| Setting | Laid Back | Classic | Cutthroat |
| --- | --- | --- | --- |
| Raid frequency | ×0.5 | ×1 | ×1.5 |
| Most raid-free nights in a row (after Night 3) | 4 | 2 | 1 |
| Threat | −1 (min 1) | ±0 | ±0 |
| Syndicate forms at (Sandbox and Endless) | Rank 9 (its Threat stops at 4) | Threat 5 | Threat 4 |
| Respect cooldown | 5 days | 3 days | 1 day |
| Minimum raid warning | 30 game minutes | 15 game minutes | 5 game minutes (5 real seconds at fight speed) |
| A lost raid leaves your stand | Busted (repair 10%) | Wrecked (rebuild 15%) | Wrecked (rebuild 15%) |
| Lottie's Cookie Jar | Always | Once per act | Never |
| Customer traffic | ×1.0 | ×1.0 | ×1.0 |
| Build, land and gear costs | ×1.0 | ×1.0 | ×1.0 |
| Simulated pace (days to Ranks 5–9, median of ten maps) | ×0.86 | ×1.00 | ×1.01 |
| Simulated Domination day (reference map; ten maps) | 126 (120–136) | 143 (131–146) | 151 (134–163) |
| Simulated raids on you in a campaign (twelve runs; every raid beaten to none) | 46–79 | 76–119 | 115–166 |

Fights run in every mode at 1 game minute per real second. In the campaign, the Syndicate forms two weeks into Act 5 on every difficulty. The Threat triggers above apply in Sandbox and Endless, where Classic's Cookie Jar refills once per season instead of once per act.

### Contracts

| Tier | Unlock | Needs | Size | Deadline | Pay per unit ($) | Offers |
| --- | --- | --- | --- | --- | --- | --- |
| Local Orders | Rank 3 | Any L3+ stand | 300–1,500 cups | 2 days | 1.5× that stand's price | About 1 per 2 days |
| Caterer Trucks | Rank 5 | Warehouse + Bottling Works | 1,000–5,000 bottles | 3 days | 6 | About 2 per 5 days |
| Helicopter VIPs | Rank 6, 3.5 stars | Helipad tier on a Field | 2,000–10,000 bottles by pad tier | 4 days | 30, +0.2 star | About 1 per 3 days; never more than 10 days apart |
| Ship Contracts | Rank 7, 4.0 stars | Pier tier on a Dock | 10,000–60,000 bottles by pier tier | 7 days | 40 | About 1 per 5 days; never more than 10 days apart |
| Supply Deals (recurring) | Rank 8, 4.0 stars | Cargo Terminal | 200,000 bottles in 4 weekly loads of 50,000 | 28 days | 30 ($1.5M a load, $6M a deal) | The first as soon as the Cargo Terminal stands, then about 1 per 7 days; never more than 10 days apart; several can run at once if your bottling keeps up |
| Mega Contracts (stretch goal) | Rank 9, 4.5 stars | Heliport + Cargo Terminal + 2 premium recipes | 100,000–150,000 bottles | 14 days | 100 ($10M–$15M a contract) | About 1 per 20 days |

A failed or overrun delivery costs 0.3 star. Premium recipes are any recovered or won page beyond the starting three and Strawberry. Pay arrives with each pickup. Choppers land at 17:30, in the golden hour (the mood scene "The first helicopter"); ships and Supply Deal loads come in at 10:00. Once a facility tier stands, its client type offers at least one job every 10 days; you may still turn any offer down. In the simulation, VIP clients (helicopters, ships and Supply Deals) earn about 11% of revenue on Days 52–96, 18% on Days 97–136 and 20% after that.

### VIP facilities

| Facility | Tier | Rank | Cost ($) | Order size served (bottles) | Loading (bottles/day) |
| --- | --- | --- | --- | --- | --- |
| Helipad line (Field) | Pad | 6 | 50,000 | 2,000–4,000 | 2,000 |
|  | Helipad | 7 | 200,000 | 4,000–7,000 | 5,000 |
|  | Heliport | 8 | 800,000 | 7,000–10,000 | 20,000 (2 trips) |
| Pier line (Dock) | Jetty | 7 | 250,000 | 10,000–20,000 | 5,000 |
|  | Pier | 7 | 750,000 | 20,000–40,000 | 10,000 |
|  | Cargo Terminal | 8 | 3,000,000 | 40,000–60,000 | 25,000 |

| Facility | Rank | Cost ($) | Plot | Effect |
| --- | --- | --- | --- | --- |
| Warehouse | 4 | 15,000 | Street or Industrial | Stores bottles and supplies; auto-supplies stands in its district |
| Bottling Works L1 | 5 | 25,000 | Industrial | 1,500 bottles/day |
| Bottling Works L2 | 6 | +100,000 | Industrial | 4,000 bottles/day |
| Bottling Works L3 | 7 | +400,000 | Industrial | 12,000 bottles/day |
| Lemon Grove | 5 | 25,000 | Field | +5% traffic at all your stands (up to 2 Groves; +10% each with Hollis Orchards) |

On all ten simulated maps the player builds all six helipad and pier tiers; the first chopper lands on Days 63–80 and the first ship docks on Days 73–89, both in Act 4, and the first Supply Deal arrives on Days 105–113, as the Cargo Terminal opens.

### Rivals

| Faction | Starting cash ($) | Rebuild chance after a Smash | HQ assault from | HQ Gate HP | Faction Buyout (× cash and buildings) | Trophy perk |
| --- | --- | --- | --- | --- | --- | --- |
| The Boardwalk Blenders | 10,000 | 40% | Rank 5 | 2,000 | 1.5×, from Rank 5 | Blender Bar: Frozen recipes +20% top price |
| The Cold Brew Collective | 20,000 | 50% | Rank 6 | 2,750 | 1.8×, from Rank 6 | Juni's Grapevine: raid warnings 1 game hour earlier |
| Hollis Sweet Tea Co. | 50,000 | 60% | Rank 7 | 3,500 | 1.5×, from Rank 7 | Hollis Orchards: each Lemon Grove +10% traffic instead of +5% |
| FizzCo Beverages | 1,000,000 | 70% | Rank 8 | 4,250 | 1.8×, from Rank 8 | Bottling Line: bottles fill 25% faster |
| The Sourwood Family | 3,000,000 | 80% | Rank 9 (Big Squeeze) | 5,000 | Never in the campaign (3× once Weakened in a Peaceful Sandbox) | Family Silver: land, Plot Buyouts and auction bids −10% |

A rival's rebuild chance drops 30 points for each Smash on that same plot in the last 7 days (to no less than 0%); the Raid Planner shows the chance. Rival cash grows about 1% a day from their trade. Their stands start at L2 (The Groves L1; Downtown and Hilltop L3), one level higher on Prime and Landmark plots, and rise one level every 30 days (Blenders, Cold Brew and Hollis cap at L4). The Lavender auction at the Hilltop estate opens when you reach Rank 8; expect the winning bid to be about $1,500,000, about a day of income at that rank.

### Reputation

| Rule | Value |
| --- | --- |
| Start | 3.0 stars |
| Daily drift | 5% of the gap toward 3.0 + 0.4 per average stand level above L1 (cap 4.6) |
| Helicopter VIP delivered | +0.2 star |
| Daytime raid | −0.1 star (−0.2 for a daytime Smash) |
| VIP gates | Helicopter 3.5, Ship 4.0, Mega 4.5 stars |

### Starting conditions

| Item | Value |
| --- | --- |
| Cash | $150 |
| Plot | Lottie's Corner, Maple Row ($300 land, 400 passersby a day) |
| Stand | L1 Folding Table (counts as $100 invested) |
| Recipes | Classic, Pink, Mint |
| Reputation | 3.0 stars |
| Crew and defenses | None (Dex joins on Day 4) |
| Starting Net Worth | About $525 |
| Day 3 | Lottie sells you her side lot by the Corner for $300 ($300 land, 300 passersby a day), an L1 table included: your second stand. The offer holds a week, and her table counts as $100 invested, like the Corner's |

### Other rule numbers

These numbers come from the sections above and are collected here so every number has one home.

| System | Rule | Number |
| --- | --- | --- |
| Stands | Stock each level holds, L1 to L5 | 300 / 750 / 1,800 / 4,500 / 10,500 cups |
| Pricing | Appeal when priced under the ceiling | +10% per 10% under, up to +25% |
| Pricing | Buyers lost when priced over the ceiling | A quarter per 10% over; none buy at 40% over, whatever their tolerance |
| Reputation | Buyers who leave without a cup | Target drops 0.1 star per 10% of buyers |
| Weather | Storm damage to L1 and L2 stands | 25% of HP |
| Repairs | A Damaged stand | 15% of what was invested × the share of HP lost |
| Crew | Recruit pool and starting Nerve | 6 recruits; Nerve 50 |
| Crew | Trait numbers | Eagle Eye +10% detection; Sprinter +25% speed; Gentle Giant +50% HP and −30% Hit; Hothead +15% Hit and −20 Nerve; Butterfingers 10% drop chance; Lumberjack +50% Chop |
| Crew | Guard posts on buildings other than stands | 3 |
| Combat | Commands | Rally +20 Nerve for 10 s, every 30 s; Fall Back once per fight; Ring the Bell once per raid |
| Combat | Time on target for a Shakedown or Sabotage | 10 game minutes |
| Combat | Nabbed guards | Ransom equals their hire fee; releasing a captive gives +0.05 star |
| Events | Raiding a kid stand on Kids' Lemonade Day | −0.5 star |
| Rivals | Breaking a Truce | −1 star; no rival accepts a Truce for 14 days |
| Rivals | Trophy perks | Blender Bar +20% top price; Juni's Grapevine 1 game hour; Hollis Orchards +10% traffic per Grove; Bottling Line 25%; Family Silver 10% |
| Rivals | Grow / Guard / Strike splits | See the five factions table in Rivals |

### Day calls

One call breaks in on Day 1 (a rival undercut) and two on every later business day; Day 3 brings a rush or a heckler, then the rumor of Night 3's raid. The clock waits for your pick.

| Call | Choices and what they cost |
| --- | --- |
| Rival undercut | Cut your price 25¢ · Free samples $10, +20% walkers today · Hold firm, −20% walkers today |
| Rival heckler | Pay him off $8 · Chase him off, +6 Grudge with that gang · Ignore him, −15% walkers today |
| Thirsty rush (+30% walkers today either way) | Raise the price 50¢ · Keep it fair, +0.03 stars |
| Sheriff's permit | Pay $15 · Talk her down: half the time nothing, else a $30 fine |
| Raid rumor | Rush the next fence in at 1.5× its price · Post your free guards there · Bring it on. Any answer: that gang comes for that plot tonight |

## Appendix B: Walkthroughs

Two walkthroughs put the tuned numbers to work on Classic. The first is a hot business day on Day 12; the second, a night Shakedown at Rank 4.

### A summer day (Day 12)

You are a Block Boss (Rank 3) with a Success Score of about $7,900, $1,500 in cash and 3.2 stars. You run 5 Wooden Stands in Maple Row: Lottie's Corner (400 passersby a day) and four others with 260–350. Three have Picket Fences, Dex guards the Corner, and Hand-Painted Signs add 5% traffic.

1. **07:00 Morning Prep.** The game waits while you read the Bugle. The forecast says Hot, 91°F, so thirst runs ×1.3 on top of Summer's ×1.2 demand. The headline: "TASTE-OFF IN 2 DAYS: BODINE 'NOT WORRIED, BRO.'"
2. **Lottie's Goals.** Short: sell 1,200 cups today. Medium: open a stand in Old Town, where Skip has found a $9,000 corner. Long: win the Summer Fair Taste-Off on Day 14.
3. **Market prices.** Lemons are up 20%, sugar is down 10%, and ice is flat. Lemons spoil after 3 days, so you don't stock up, and Pink costs $0.26 a cup today instead of $0.24. Auto-Restock fills every stand at these prices.
4. **Recipe and price.** Pink goes on all 5 stands: it shines in Maple Row (×1.2 appeal) and carries a 5% price bonus. Sweetness stays on Classic, since Extra would please the kids but lose the morning seniors. Marisol's Auto-Price posts $2.10: a Wooden Stand's $2.00 top plus Pink's 5%.
5. **08:00 Doors open.** Seniors fill the morning, and business hours run about 3.5 real minutes at 1×. With no rival within 2 plots, the Corner's math is simple. Its 400 passersby × 1.5 draw × 1.05 signs × 1.2 Summer × 1.3 thirst × 25% stop × 1.2 Pink × 1.03 Reputation ≈ 304 cups.
6. **13:00 The rush.** Kids pour in for the afternoon heat. The Corner's queue counter touches 4, the kids' limit, but 50 cups an hour keeps it moving.
7. **13:40 An alert.** A neighbor kid's clip of Captain Squawk stealing a lemon at Park Lane goes viral. That stand gets ×2 traffic for 2 days, so you tap the card's Restock now. You also book a Sandwich-Board Kid there for tomorrow ($40, +20% traffic), worth about 80 more cups if the heat holds.
8. **20:00 The Ledger.** Stands close and the day posts. Park Lane sold 300 cups instead of its usual 200, the five stands sold 1,349, and Lottie ticks off the short goal.

| Line | Amount ($) |
| --- | --- |
| Sales: 1,349 cups at $2.10 | 2,833 |
| Supplies: 1,349 cups at $0.26 | −351 |
| Upkeep: 5 Wooden Stands at $15 | −75 |
| Wages: Dex | −15 |
| Profit | 2,392 |

9. **Evening.** The Rivals Corkboard pins Park Lane, suddenly valuable and unfenced, as the likeliest raid target. You buy a Picket Fence there ($150) and station Dex on it.
10. **Night and dawn.** No raid comes, though at Threat 2 about 4 nights a week bring one. The 07:00 autosave shows $3,742 in cash and a Success Score of about $10,250, under 3 days like this from the Old Town corner.

### A night Shakedown (Day 24)

You are a Neighborhood Name (Rank 4) at Threat 2 and 3.3 stars, with a Clubhouse in Maple Row. Your squad is the Rank 4 cap of 5: Dex (Loyal), Rosa (Hothead), Big Lou (Tough Cookie), Pip (Sprinter) and Marnie (Night Owl). Each carries clubs and a Padded Vest, $350 of kit.

1. **20:00 Pick a target.** In the Raid Planner you tap the Blenders' Kiosk by the arcade, on a Boardwalk Prime plot. Its defenses show "?", so the win chance reads about 49–83%: the Planner knows what a Kiosk's owner builds, but not who holds its posts.
2. **Scout.** You fly Captain Squawk over it, and Gull Flight reveals its defenses for 3 days. It has a Picket Fence, a Tin-Can Alarm, a Guard Goose and 3 Smoothie Bros with paddleboards. The win chance settles at about 80%, counting the detection roll and the help a spotted raid can meet.
3. **Plan.** Objective: Shakedown, with expected loot of about $1,555, one day of the Kiosk's profit. Time: tonight, leaving at 01:00 for a trip of 1.5 game hours across the Maple Row–Boardwalk border. Nothing shows in red: a night raid costs no Reputation, and 3.3 stars is far above the Citation line. The Planner flags that Dex's and Rosa's posts at the Corner sit empty until about 04:20.
4. **01:00 Approach.** The raid arrow crosses the map in about 12 real seconds. Detection is 50% + 15% cans + 15% goose − 25% at night = 55%. The roll misses, so the Blenders get no warning or help, and your squad gets a first strike: +25% damage for 5 seconds.
5. **02:30 Breach.** The clock slows to 1 game minute per real second. HONK: the goose stuns the first guard to the fence, Dex, for 3 seconds ("a tactical pause," he says later). The other 4 chop through the Picket Fence's 150 HP in 3 seconds. Meanwhile the Bros swing over it at 22.5 a hit (18 plus their 25% fence-line bonus), each at the guard across the fence from it: Dex, Rosa and Big Lou take 67.5 each, and Pip and Marnie none.
6. **Brawl.** It's 5 against 3, and the Bros' bonus fell with the fence. The squad spreads its swings the same way, so two Bros drop together at 7.5 seconds. With 2 of 3 down, the last one rolls Nerve and bolts for the pier. None of your guards is knocked out.
7. **Objective.** With no Bro standing, the squad spends 10 game minutes at the till and walks out at 02:48 with about $1,555.
8. **Aftermath.** Everyone walks home on their own feet, so nobody misses a day; a guard KO'd by a club would be Out for 1 day, and by a hatchet 2. Nobody was left behind, so nobody can be Nabbed. The squad is home by 04:20, and the Corner's posts are filled again.
9. **Grudge and Reputation.** Reputation doesn't move because it was night; by day the same raid would cost 0.1 star. Brock's Grudge toward you jumps, and at dawn he calls: "Bro. That was my rent money." The Corkboard pins his likeliest target, and Defenses shows his reply on Day 26.
10. **The money.** Cash and Success Score rise by about $1,555, most of the $1,750 the squad's clubs and vests cost, and the kit is still theirs for the next raid. With nobody hurt, there's no other bill.

## Glossary

These 96 terms are the official game words, so the builder and Ben call each thing by one name.

| Term | What it means |
| --- | --- |
| Act | A campaign chapter: Lottie's Corner, Surf & Turf, Grounds for Revenge, Fields & Fizz or The Big Squeeze. |
| Advisors | Marisol Vega (money and loans), Skip Larkin (land and buyouts) and Benny Buzz (marketing). |
| Alert card | An alert-feed notice with Go There and one action; major ones auto-pause the game. |
| Attention | A rival's focus on you, fed by Threat, shared borders, stolen customers and Grudge. |
| Automation | Chore helpers: Auto-Restock, Marisol's Auto-Price, Dex's Auto-Defend, Auto-Repair, raid templates and district policies. |
| Boardwalk Blenders | Smoothie rivals of The Boardwalk: boss Brock Bodine, HQ the Blend Shack. |
| Brand tier | Permanent marketing, M1–M5: Hand-Painted Signs, Flyers & Sidewalk Chalk, Radio Jingle, Billboards & TV Spot, The Lemon Blimp. |
| Building | One per plot: Stand, Clubhouse, Warehouse, Bottling Works, Billboard, Lemon Grove, Helipad or Pier. |
| Busted | On Laid Back, your stand closes until repaired instead of being Wrecked. |
| Call the Big Squeeze | The finale you choose to start: a siege, then the Sourwood Manor assault. |
| Captain Squawk | Lottie's lemon-thieving seagull, flown in Gull Flight. |
| Citation | Sheriff Budd's fine and raid ban for daytime raids while Reputation is under 2.0 stars. |
| Classic | The intended-balance difficulty; also Classic Lemonade and the middle Sweetness setting. |
| Clubhouse | Guard housing beyond your first two; upgrades add a Training Yard and Infirmary. |
| Cold Brew Collective | Iced-coffee saboteurs of Campus & Arts: boss Juni Grind, HQ the Grindhouse. |
| Contract | A big order with a deadline: Local Orders, Caterer Trucks, Helicopter VIPs, Ship Contracts or Mega Contracts. |
| Cookie Jar | Lottie's bankruptcy bailout: always on Laid Back, limited on Classic, never on Cutthroat. |
| Cutthroat | The hard difficulty: more raids, shorter warnings, no Cookie Jar, and an earlier Syndicate in Sandbox and Endless. |
| Damaged | A stand below full HP, selling in proportion to its HP until repaired. |
| Dex Moody | Your first guard and crew chief: loyal, brave, terrified of geese. |
| Domination | The victory, "You Own the Bay": every rival eliminated (HQ taken, bought out or bankrupt) and Majority in every district. |
| Endless Summer | No-end play for Peak Success Score, after a victory or on its own. |
| Event | A calendar festival or random surprise, like the Summer Fair or a Heat Wave. |
| Faction Buyout | Buying a Weakened rival's business (cash and buildings, not land) at a Sit-down, from that rival's HQ rank; its plots go to the Fire Sale. Vera sells only in Peaceful Sandbox. |
| Fire Sale | An eliminated rival's leftover plots: First Dibs for you at a discount, then auction. |
| First Dibs | First right to buy a plot, for whoever Wrecked it or for you in a Fire Sale. |
| FizzCo Beverages | Soda giant of Downtown and The Harbor: boss Preston Fizzwell III, HQ FizzCo Tower. |
| Foothold | At least one plot in a district, letting you buy and raid there. |
| For Sale | A plot open to buyers; a Wrecked plot not rebuilt in time goes to First Dibs, then a sealed-bid Auction. |
| Full Control | Every purchasable plot in a district, unlocking that district's perk. |
| Gadget | A small plot defense: Tin-Can Alarm, Guard Goose, Lemon-Peel Slick, Sprinkler Ambush, Floodlights or Watchtower. |
| Grudge | A rival's anger at another faction, you included; rises when hit, cools when quiet. |
| Guard | A Peel Patrol crew member, hired at the Hiring Hall and leveled from Rookie to Legend. |
| Guard stats | HP, Hit (damage to people), Chop (damage to fences and stands), Speed and Nerve (courage). |
| Gull Flight | Flying Captain Squawk to scout rival defenses and watch VIP arrivals. |
| Helipad | A Field-plot building for helicopter VIPs, upgraded Pad, Helipad, Heliport. |
| Hollis Sweet Tea Co. | Sweet-tea landholders of The Groves: boss Tilly Hollis, HQ Hollis Homestead. |
| HQ Assault | A three-stage raid on a Weakened rival's HQ: Gate, Yard, then Boss Room. Each HQ opens at its own rank, from Rank 5 (Blend Shack) to Rank 9 (Sourwood Manor). |
| In the Red | Ending a day below $0, which gives 3 days to sell or borrow your way out. |
| Laid Back | The calm difficulty: fewer raids, longer warnings, Busted instead of Wrecked, no game over. |
| Local campaign | Short, targeted marketing, such as Sandwich-Board Kid, Free Sample Day or Coupon Blitz. |
| Lottie Puckett | Grandma Lottie, 78, your mentor; you play her Grandkid, Charlie Puckett by default. |
| Lottie's Tips | Small perks; at every rank-up you pick one of three. |
| Majority | Over half a district's plots: your stands there sell more and rival stands lose appeal. |
| Market | Old Town's Citrine Bay Market, selling Lemons, Sugar and Ice at daily prices. |
| Mayor Gil Fontaine | Citrine Bay's smarmy mayor, in Vera's pocket. |
| Morning Prep | The dawn pause to read the Morning Bugle, buy supplies and set prices. |
| Nabbed | A knocked-out attacker left behind and caught, to be ransomed, released or recruited. |
| Net Worth | Cash plus land, buildings and stock, minus loans; it equals Success Score. |
| Out | A knocked-out guard resting a day or two; nobody is ever really hurt. |
| Peaceful | A Sandbox toggle with no combat; rivals compete with prices, marketing and land. |
| Perimeter | A plot's fence tier: Picket Fence, Chain-Link Fence, Sharpened Stakes, Barbed Wire or Citrus Fortress Wall. |
| Phone taunt | A boss phoning Lottie's Corner to gloat, a sign their Grudge or Attention just rose. |
| Pier | A Dock-plot building for ships, upgraded Jetty, Pier, Cargo Terminal; not The Boardwalk's Pier Landmark. |
| Pitcher Pact | The 40-year truce splitting the drink trade among five families, enforced by the Sourwoods. |
| Player tactics | Fight buttons: Rally (more Nerve), Fall Back (retreat) and Ring the Bell (reinforcements now). |
| Plot | A parcel of land: Street, Prime (busier), Landmark (busiest), Field, Dock, Industrial, HQ (never bought) or Civic (never sold). |
| Plot Buyout | Buying one rival plot at a Sit-down, at the rival's price. |
| Raid | A squad sent to hit a plot, fought as a short, watchable auto-battle. |
| Raid warning | Notice of a raid on you with its ETA; undetected raids still give minimum notice. |
| Rank | One of 10 titles, Sidewalk Squeezer to The Big Squeeze, earned by Success Score. |
| Recipe card | A recipe you own, with its cost, fans, and best season or district. |
| Recipe page | One of Lottie's 10 recipe-book pages; each one recovered adds a recipe card. |
| Reputation | Public opinion of Lottie's Lemonade, 1.0–5.0 stars; it lifts appeal and gates VIPs. |
| Respect cooldown | Days a rival won't raid you after you beat its raid. |
| Sabotage | A raid objective that spoils a stand's stock so it can't sell tomorrow; needs a Lookout or Sneaky guard. |
| Sandbox: Turf War | Custom games: you pick map size, rivals, difficulty and win condition. |
| Screens | Ten paper menus: Morning Bugle, Ledger, Stand panel, Crew roster, Raid Planner, Rivals Corkboard, Order Book, Land Registry, Rank and Perks, Lottie's Goals. |
| Shakedown | A raid objective that grabs about a day of a stand's profit. |
| Sheriff Dolores Budd | The weary, fair sheriff who writes Citations. |
| Sit-down | A Rank 4+ meeting with a boss at Dot's Diner, for a Truce or a buyout. |
| Smash | A raid objective that knocks a stand to 0 HP, leaving it Wrecked. |
| Sour Summer of '79 | When Vera Sourwood stole 7 of Lottie's 10 recipe pages and ruined her business. |
| Sourwood Family | Old-money lemonade rivals of Hilltop Estates: boss Vera Sourwood, HQ Sourwood Manor. |
| Specialist | A Level 3+ guard promoted to Lookout (warnings, scouting), Wrecker (more Chop) or Captain (squad leader). |
| Specialization | Stand bonus slots at L3 and L5: Express Window, Fancy Menu, Fortified Frame or Billboard Roof. |
| Squeezed Out | Game over: still In the Red after the grace days, with no Cookie Jar left. |
| Stand | Your shop, L1–L5: The Folding Table, The Wooden Stand, The Kiosk, The Lemon Shack, The Citrus Palace. |
| Story Campaign | The five-act story on the hand-made Citrine Bay map. |
| Stronghold | At least three quarters of a district's plots: raids there are spotted more and help arrives faster. |
| Success Score (SS) | Your score, equal to Net Worth; it sets Rank, and your best is Peak Success Score. |
| Sweetness | A dial, Less, Classic or Extra, that shifts which customers like a recipe. |
| Syndicate | The surviving rivals united against you, raiding several plots at once: Act 5 in the campaign, otherwise Threat 5 (4 on Cutthroat, Rank 9 on Laid Back). |
| Taste-Off | A non-violent fair duel: match the judges' hints with a recipe, Sweetness and price. |
| Taunt call | See Phone taunt. |
| Threat | How hard rivals come for you, 1–5 sour lemons, set mostly by Rank. |
| Ticket | See Alert card. |
| Top bar | The HUD strip: Cash, the Rank badge and meter, day and clock, and weather; Threat joins at 2+. |
| Trait | One quirk per guard, such as Tough Cookie, Night Owl, Loyal or Sneaky. |
| Trophy | An eliminated rival's HQ, now your building with a unique perk. |
| Truce | A paid Sit-down deal: no raids with one rival for a week; breaking it costs Reputation. |
| Tycoon Camera | The main camera, zooming from Bay View (owner-tinted map) through mid zoom to Street View. |
| Vacant Lot | An owned plot with no building; it still counts for land value and control. |
| Weakened | A rival far below its peak plots or your Net Worth, or outsold two to one by you for a week; needed for HQ Assault and Faction Buyout. |
| Weapon tiers | Fists, Clubs, then Hatchets, bought per guard and reskinned for rivals; no guns, ever. |
| Wrecked | Any building but an HQ at 0 HP; if its owner misses the rebuild window, the plot goes For Sale. |
