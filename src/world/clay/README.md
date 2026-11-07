# Clay kit

Kitchen-Table Clay (design spec, "Visual style and art direction") in
three.js on the WebGL renderer. Ported from the clay mockup
(`art-direction/clay-mockup/dirs/clay`). Everything in Citrine Bay is drawn
with these pieces.

## The one material

- `kit()` (kit.ts) is a lazy singleton holding the shared smudge map, the
  materials and the clocks:
  - `world`: vertex-coloured clay for Baker output (buildings, ground).
  - `fig`: figure clay, with finer thumbprints that boil on twos.
  - `peel`, `glass`, `window`, `pool`, `halo`.
  - `glow` (night glow strength), `time` (smooth seconds) and `twos`
    (`f = floor(seconds * 12)`, `t = f / 12`). scene.ts drives all three.
- **The fx channel** is the alpha of the vertex colour: `CLAY` 0 (matte),
  `GLOSS` 2 (resin, beads, glass, chrome), `PAPER` 4 (card, wood, sticks).
  Add 0..1 to make a part glow at night, for example `fx: PAPER + 0.6`.
- `clayPlain(color, { fx, family, roughness, emissive, transparent, map })`
  gives one-colour clay for a mesh that isn't baked.
  `clayFrom(color, roughness, emissive, metalness)` maps an old flat-material
  call onto clay: shiny or metal reads as `GLOSS`. `mat()` in scene.ts is
  `clayFrom`.

## Building models (core.ts)

- `new Baker()`, then `.add(geometry, color, { p, r, s, q, m, fx })` once per
  part, then `.build()` returns one merged geometry: one draw for a whole
  model. Use `new THREE.Mesh(B.build(), kit().world)`.
  `.raw(geometry, matrix)` adds a geometry that is already coloured.
- Shapes: `sph`, `cap`, `cyl`, `box`, `rbox` (rounded block), `cone`, `tor`,
  `lathe(points)`, `snake(points, radius)` (clay snakes),
  `slab(outline, y0, y1)` (an extruded, bevelled slab),
  `outline(cx, cz, w, d, r, n, wobble, seed)` (a wobbly rounded rectangle),
  and `clipAxis` (cuts an outline along x or z).
- Irregularity: `lumpy(geometry, amp, freq, seed)` pushes the surface by
  noise, and `bend(geometry, y => dx)` curves it.
- Helpers: `hash`, `vnoise`, `lcg(seed)`, `shade(hex, k)`,
  `canvasTex(w, h, draw)` (its `userData.redraw` redraws it), `blobPath`,
  `glowTex`, `makeEnv(renderer)`.
- Colours: `P` in palette.ts holds the spec palette plus the mockup's extras.
  It also has `SKINS` (8 tones) and `OWNER` (faction colours, unchanged from
  canon).

## Baking existing models (bake.ts)

- `bakeGroup(root, { labelDistance })` merges every plain clay mesh under
  `root` into one `baked` mesh. Sharp boxes become rounded blocks as they
  bake. Textured labels stay separate and fade out past `labelDistance`
  through a `THREE.LOD`. Bake anything static. To keep a part toggleable,
  bake it as its own group, the way bay.ts does fences and the `sentry`
  watch.
- `collectClay(root, B)` adds every visible clay part under `root`, in world
  space, to a Baker. Bay View uses it to draw a whole district's plots as one
  block. An object with `userData.far` (a cheap baked geometry in its own
  frame) goes in as that instead: stands, fences and wrecks carry one, so a
  district block costs a few hundred triangles a plot.

## Figures (figure.ts)

- `new Figure(spec, kit().fig, { scale, detail })`. Use `detail` 0.5 for
  crowds, which costs about a third of the triangles. Figures share geometry
  per spec and seed.
- Rig: `root > rig > body, neck > head, arms[L, R] > mitten, legs[L, R]`.
  `root.userData` holds `limbs` ([legL, legR, armL, armR] pivots, the same
  order as `makePerson`), `base`, `head` (the neck group), `hands`
  ([left, right]), `rig` and `figure`.
- Motion: `fig.pose({ lift, sq, lean, sway, headYaw, aL, aR, lL, lR }, f)`
  sets a pose. Call it on twos (`onTwos(seconds)` or `kit().twos`).
  `gait(fig, 'bob' | 'skip' | 'roll' | 'glide' | 'march' | 'skate' | 'hop', phase, f, tq)`
  walks, `fig.blink(f)` blinks, `fig.hold('cup')` gives a prop and
  `fig.flex(true)` flexes.
- Specs: `SPECS` holds the cast (Lottie, the grandkid, the five bosses, Dex
  and a henchman), `CREWS` the six crew looks and `customerSpec(pick, kind)`
  the customers. `GAIT_OF` gives each body kind's walk.

## Vehicles, animals and effects (rides.ts, creatures.ts, fx.ts)

- `rides.ts`: `chopper(paint, scale)` (client paint jobs from `paintFor(client)`,
  a tiny VIP in the open cockpit, `spin(f)` on twos, `hang(top)` runs the
  fishing line), `ship('yacht' | 'cruise' | 'freighter')` (soap hull plus a
  separate clay `wake`), `blimp()`, `truck(cab)` (with a driver) and
  `bike(frame)`, both on button wheels. Neutral vehicles never wear owner
  colours or lemon. Each model is one or two draws; the caller disposes it.
- `creatures.ts`: `gull(captain)` (Captain Squawk gets the cap and lemon
  wedge), `dog()` and `goose()` (Honkers). Their `userData` names the parts
  that animate (wings, tail, neck).
- `fx.ts`: `createFx(scene)` gives `dust`, `chips`, `stars`, `pellets`,
  `splash`, `ring(at, radius)` (rotor wash: grass tufts pressed flat just
  outside `radius`, then springing back) and `word(at, text, fill, edge)`
  (sound words on cut-paper starbursts). Each kind is one instanced draw that
  hides when idle, and everything steps on twos. Pieces fade by shrinking,
  never by going see-through.
- The scenes that use them live one level up: `vip.ts` (chopper and ship
  pickups; ships stay on the resin and grow in from the far water),
  `traffic.ts` (street traffic, which clears for brawls and VIPs, and the
  blimp) and `battle.ts` (brawl replays: fighters draw through one figure
  batch; breach and gadget looks, night flashlights; `BattleHooks` for barks).

## Scene services (scene.ts, lighting.ts, diorama.ts, post.ts)

- `world.render()` draws a frame: the scene, the tilt-shift and the warm
  vignette. `world.stats()` gives the last frame's draws and triangles.
- `world.detail()` (also `scene.userData.detail`) is 0 in Street View, 1 at
  mid zoom and 2 at Bay View (`DETAIL_AT`). Phones run one level simpler.
  `scene.userData.distance` is the camera distance, and
  `scene.userData.shadows` is false when the sun casts none (phones: show
  blob shadows instead).
- At detail 2, every top-level object with `userData.limbs` draws as one
  instanced clay speck, so figures cost nothing at Bay View. bay.ts swaps
  each district's plots for one merged block and hides grass and flowers.
- `world.night()` runs from 0 by day to 1 at night. `kit().glow`,
  `kit().window` and `kit().pool` already follow it.
- Lighting scripts (`LOOKS`, `lookAt(hour)`, `hourOf(phase, minute)`): dawn,
  noon, golden hour and night, each blended over one game hour. Morning Prep
  holds dawn and the report is night, so dawn is tuned as the friendliest
  frame. Day light is warm (cream sky fill, warm sun) like the mockup; each
  script also sets `shade` (the lilac or indigo fill that shadowed clay gets,
  through `CLAY_SHADE` in core.ts, so shadows never go grey), `shadowI` (how
  dark the sun's shadow goes) and `sat` (post saturation, a little above 1).
  One shadow-casting light (the sun, or Lottie's desk lamp at night)
  re-renders its shadows only on twos, and its shadow box snaps to whole
  texels so edges don't crawl while the camera pans.
- The diorama: `TABLE_Y`, `PLINTH`, `DESK_LAMP` and `resinMaterial(time)` for
  water. The table, cloth and props are static and never pickable.
- `createPost(renderer, scene, camera, samples)` returns `tilt(amount,
  vignette, focus)`, `tint(color)` and `saturation(s)`. An amount of 0 skips
  the blur.
- Rebuilding a plot disposes the merged `baked` geometry it replaces; shared
  geometry (figure parts, props) is never disposed.
