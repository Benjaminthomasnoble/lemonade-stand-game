// Headless smoke test (run `npm run build` first).
// Starts `vite preview`, plays one day through the UI and window.__game,
// checks the save survives a reload, and writes screenshots to test-results/.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const PORT = 4173;
const base = process.env.SMOKE_URL ?? `http://localhost:${PORT}/`;
mkdirSync('test-results', { recursive: true });
// Detached, so stopping its process group also stops the vite child that npx starts (a stray server would serve the next run).
const server = process.env.SMOKE_URL ? null : spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', '--base', '/'], { stdio: 'ignore', detached: true });
const stopServer = () => { if (server) try { process.kill(-server.pid, 'SIGTERM'); } catch { server.kill(); } };
const fail = (msg) => { console.error('SMOKE FAIL:', msg); stopServer(); process.exit(1); };

try {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(base)).ok) break; } catch { await new Promise((r) => setTimeout(r, 200)); }
  }
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
  // SMOKE_SCALE below 1 renders the 3D view at a lower device pixel ratio: SwiftShader is
  // fragment-bound, so 0.5 runs about 2.7x more frames a second on a 4-core container.
  const scale = Number(process.env.SMOKE_SCALE ?? 1) || 1;
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: scale });
  // Software WebGL with the clay HUD can take many seconds a frame on a busy container: give screenshots room.
  page.setDefaultTimeout(600000); // ten minutes: several headless runs can share the container
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  // A day call at one of your stands holds the clock till you pick (src/sim/calls.ts), and which minute it breaks in
  // is the day's dice. Before a wait on game time the smoke lets any waiting call lapse, as a run without a player does.
  const lapseCalls = async () => {
    const lapsed = await page.evaluate(() => (window.__game.state.calls?.list ?? []).filter((c) => c.live && c.picked === undefined).map((c) => { c.picked = -1; return `${c.kind} at ${c.at}`; }));
    if (lapsed.length) console.log('day call lapsed:', lapsed.join(', '));
  };
  await page.goto(`${base}?seed=42`);
  await page.waitForSelector('body[data-ready="1"]', { timeout: 30000 });
  await page.waitForSelector('[data-testid="prep"]');
  console.log('backend:', await page.evaluate(() => window.__game.backend));

  // Day 1: Lottie stocks the table, and the Market waits for Day 2's lesson (LESSON_DAY.market).
  const stocked = await page.evaluate(() => { const st = window.__game.state.plots[window.__game.state.selected].stand; return st.inventory.lemons.length > 0 && st.inventory.sugar > 0 && st.inventory.ice > 0; });
  if (!stocked) fail('Lottie did not stock the table on Day 1');
  if (await page.$('[data-action="buy"]')) fail('the Market shows on Day 1');
  await page.screenshot({ path: 'test-results/1-prep.png' });
  await page.click('[data-testid="open"]');
  await page.waitForSelector('[data-testid="daybar"]');
  await page.click('[data-action="speed"][data-value="3"]');
  // Walkers appear as game time passes, and game time advances per frame: wait for them rather than a fixed time.
  await page.waitForFunction(() => window.__game.crowd() > 0, null, { timeout: 180000 }).catch(() => {});
  const mid = await page.evaluate(() => ({ crowd: window.__game.crowd(), sold: window.__game.state.today.customers }));
  console.log('mid-day:', mid);
  await page.screenshot({ path: 'test-results/2-open.png' });
  if (mid.crowd === 0) fail('no pedestrians on screen');
  await page.evaluate(() => window.__game.fastForward(10000));
  await page.waitForSelector('[data-testid="report"]');
  await page.screenshot({ path: 'test-results/3-report.png' });
  const s = await page.evaluate(() => window.__game.state);
  console.log(`day ${s.day}: sold ${s.today.customers}, cash $${s.cash}`);
  if (s.today.customers === 0) fail('sold nothing');
  await page.click('[data-testid="next"]');
  await page.waitForSelector('[data-testid="prep"]');
  // Reload without the seed so the saved game loads.
  await page.goto(base);
  await page.waitForSelector('body[data-ready="1"]');
  const day = await page.evaluate(() => window.__game.state.day);
  if (day !== 2) fail(`save did not persist (day ${day})`);
  // Milestone 2: upgrade the stand through the UI, then look at every level. Before Day 5's lesson (LESSON_DAY.upgrade) the Grow tab
  // is hidden, and tapping your own stand answers with its upgrade.
  await page.evaluate(() => { const g = window.__game; g.state.cash = 600; g.act({ type: 'inspect', plot: g.state.selected }); });
  await page.click('[data-testid="plotcard"] [data-testid="upgrade"]');
  const lvl = await page.evaluate(() => window.__game.state.plots[window.__game.state.selected].stand.level);
  if (lvl !== 2) fail(`upgrade failed (level ${lvl})`);
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'test-results/4-upgrade.png' });
  for (const l of [3, 4, 5]) {
    await page.evaluate((l) => { window.__game.state.plots[window.__game.state.selected].stand.level = l; window.__game.state.brandTier = 1; window.__game.act({ type: 'refresh' }); }, l);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `test-results/5-level${l}.png` });
  }
  // Milestone 4 groundwork: Bay View, then buy a plot on Maple Row and build a stand.
  await page.evaluate(() => { const g = window.__game; g.state.plots[g.state.selected].stand.level = 2; g.state.cash = 2000; g.act({ type: 'view', target: 'bay' }); });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/6-bay.png' });
  const lot = await page.evaluate(() => Object.keys(window.__game.state.plots).find((id) => id.startsWith('maple') && !window.__game.state.plots[id].owner && !id.startsWith('maple-4n')));
  await page.evaluate((lot) => window.__game.act({ type: 'select', plot: window.__game.state.selected }), lot);
  await page.evaluate((lot) => window.__game.act({ type: 'inspect', plot: lot }), lot);
  await page.click('[data-testid="buy-plot"]');
  await page.click('[data-testid="build"]');
  const stands = await page.evaluate(() => Object.values(window.__game.state.plots).filter((p) => p.owner === 'player' && p.stand).length);
  if (stands !== 2) fail(`expected 2 stands, got ${stands}`);
  await page.evaluate((lot) => window.__game.act({ type: 'select', plot: lot }), lot);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'test-results/7-second-stand.png' });

  // Milestone 3: fence and crew through the UI, then a daytime raid with its replay. Lessons off from here: buttons follow rank alone.
  await page.evaluate(() => { const g = window.__game; g.state.settings.lessons = false; g.state.rank = 3; g.state.cash = 5000; g.dex(); g.act({ type: 'select', plot: g.state.selected }); });
  await page.click('[data-testid="tab-crew"]');
  await page.click('[data-testid="perimeter"]');
  await page.click('[data-testid="hire"]');
  const crew = await page.evaluate(() => window.__game.state.guards.length);
  if (crew < 2) fail(`expected 2 guards, got ${crew}`);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'test-results/8-crew.png' });
  const target = await page.evaluate(() => {
    const st = window.__game.state;
    const theirs = Object.keys(st.plots).filter((id) => { const p = st.plots[id]; return p.owner && p.owner !== 'player' && p.stand && id.startsWith('oldtown'); });
    // Raids need a Foothold in the target's district: the next Old Town stand's lot becomes a bare lot of yours.
    Object.assign(st.plots[theirs[1]], { owner: 'player', stand: null, garrison: 0, garrisonOut: undefined });
    return theirs[0];
  });
  await page.evaluate((t) => { window.__game.act({ type: 'inspect', plot: t }); window.__game.focus(t); }, target);
  await page.waitForSelector('[data-testid="raid-planner"]');
  // Dex fills the squad as the Planner opens: tap in anyone he left out.
  const unpicked = '[data-testid="raid-planner"] [data-action="squad"][aria-pressed="false"]';
  for (let i = 0; i < 12 && await page.$(unpicked); i++) await page.click(unpicked);
  await page.click('[data-testid="raid-now"]');
  // The squad travels 1-3 game hours: open the stands, run the clock to a minute out, and the fight plays on arrival.
  await page.evaluate(() => {
    const g = window.__game;
    if (g.state.phase === 'prep') g.act({ type: 'open' });
    const r = g.state.raids.find((x) => x.attacker === 'player');
    g.act({ type: 'speed', value: 0 });
    if (r) g.fastForward(r.at - g.state.minute - 1);
  });
  await lapseCalls();
  await page.evaluate(() => window.__game.act({ type: 'speed', value: 1 }));
  await page.waitForFunction(() => window.__game.battle(), null, { timeout: 15000 }).catch(() => {});
  if (!(await page.evaluate(() => window.__game.battle()))) fail('battle replay not playing');
  await page.screenshot({ path: 'test-results/9-raid.png' });
  // Play on until a rival raid is planned at closing time. Sleep till dawn stops at its warning in the night; sleep on through it.
  let warned = false;
  for (let d = 0; d < 25 && !warned; d++) {
    warned = await page.evaluate(() => {
      const g = window.__game;
      for (let i = 0; i < 12 && g.state.phase !== 'report'; i++) g.act({ type: g.state.phase === 'prep' ? 'open' : g.state.phase === 'open' ? 'skip' : 'sleep' });
      const hit = g.state.raids.some((r) => r.attacker !== 'player' && g.state.plots[r.target].owner === 'player');
      g.act({ type: 'sleep' });
      return hit && g.state.phase === 'night';
    });
  }
  if (!warned) fail('no raid warning in 25 days');
  await page.waitForSelector('[data-testid="raid-warning"]');
  await page.screenshot({ path: 'test-results/10-raid-warning.png' });
  await page.click('[data-testid="next"]');
  await page.waitForSelector('[data-testid="replay"]');
  await page.evaluate(() => window.__game.act({ type: 'inspect', plot: null })); // the raid planner, still open if they rebuilt, covers the feed
  await page.click('[data-testid="replay"] >> nth=0');
  await page.waitForTimeout(6000);
  await page.screenshot({ path: 'test-results/11-night-replay.png' });

  // Milestone 5: build a Pad and a pier through the plot card, then watch a chopper and a ship pick up.
  const sites = await page.evaluate(() => {
    const g = window.__game, st = g.state;
    for (let i = 0; i < 12 && st.phase !== 'prep'; i++) g.act({ type: st.phase === 'open' ? 'skip' : 'sleep' });
    st.rank = 7; st.reputation = 4.5; st.cash = 2000000;
    const field = Object.keys(st.plots).find((id) => id.startsWith('groves') && st.plots[id].owner === 'hollis' && !st.plots[id].stand);
    const dock = Object.keys(st.plots).find((id) => id.startsWith('harbor') && st.plots[id].owner === 'fizzco' && !st.plots[id].stand);
    for (const id of [field, dock]) st.plots[id].owner = 'player';
    // Hollis's Fields start with Lemon Groves: the plot card's Pad replaces the Grove.
    g.act({ type: 'refresh' });
    // A rank-up's hand of Lottie's Tips waits at the top of the feed: keep one from each, so the VIP cards come up top.
    for (let i = 0; i < 12 && st.story?.tips?.hands?.length; i++) g.act({ type: 'tip', id: st.story.tips.hands[0].cards[0] });
    return { field, dock };
  });
  for (const id of [sites.field, sites.dock]) {
    await page.evaluate((id) => window.__game.act({ type: 'inspect', plot: id }), id);
    await page.click('[data-testid="facility"]');
  }
  const built = await page.evaluate((x) => [window.__game.state.plots[x.field].facility?.kind, window.__game.state.plots[x.dock].facility?.kind].join(','), sites);
  if (built !== 'helipad,pier') fail(`facilities not built: ${built}`);
  // These waits run on game time, which advances per rendered frame: when other headless runs share the
  // container, software WebGL can drop well under 1 fps, so they get minutes, not seconds.
  for (const [tier, plot, minute, shot] of [['heli', sites.field, 17 * 60 + 30, '12-helicopter'], ['ship', sites.dock, 10 * 60, '13-ship']]) {
    await page.waitForFunction(() => !window.__game.vip(), null, { timeout: 120000 });
    await page.evaluate(([tier, plot]) => {
      const g = window.__game, st = g.state;
      for (let i = 0; i < 12 && st.phase !== 'prep'; i++) g.act({ type: st.phase === 'open' ? 'skip' : 'sleep' });
      st.bottles = 50000;
      st.raids = [];
      for (const r of Object.values(st.rivals)) r.respectUntil = st.day + 1; // rivals back off today: no delivery raid in the smoke test (a rank set lower comes right back now)
      // A Pad loads 2,000 bottles a day and a Jetty 5,000: each order goes in one pickup.
      st.orders.push({ id: 'smoke-' + tier, tier, client: `Smoke Test ${tier}`, qty: tier === 'ship' ? 5000 : 2000, pay: 1000, due: st.day, expires: st.day, plot, accepted: true });
      g.act({ type: 'open' });
      g.act({ type: 'speed', value: 0 });
    }, [tier, plot]);
    await page.evaluate((m) => window.__game.fastForward(m - window.__game.state.minute - 1), minute);
    await lapseCalls();
    await page.evaluate(() => window.__game.act({ type: 'speed', value: 1 }));
    // A client's first visit pauses the game and posts a card; its Watch flies there and plays the arrival.
    await page.waitForSelector('[data-testid="vip-watch"]', { timeout: 90000 });
    await page.click('[data-testid="vip-watch"] >> nth=0');
    await page.waitForFunction(() => window.__game.vip(), null, { timeout: 90000 });
    // Pause holds the scene too, so the clock runs on (a client's first visit holds it by itself for the show).
    await page.waitForFunction((t) => (window.__game.vipWhere()?.[3] ?? 99) > t, 3.5, // the loading beat (the shows run 6 s)
      { timeout: 180000 });
    await page.screenshot({ path: `test-results/${shot}.png` });
  }

  // Rival endgame: buy a plot at a sit-down, then storm the weakened Blend Shack with a full squad (the Raid Planner's
  // HQ Assault: it travels on the raid clock and fights live when it gets there).
  await page.waitForFunction(() => !window.__game.vip(), null, { timeout: 120000 });
  const hq = await page.evaluate(() => {
    const g = window.__game, st = g.state;
    for (let i = 0; i < 12 && st.phase !== 'prep'; i++) g.act({ type: st.phase === 'open' ? 'skip' : 'sleep' });
    st.raids = []; st.rank = 7; st.cash = 50000000; // the Blend Shack opens at Rank 5
    const ids = Object.keys(st.plots).filter((id) => st.plots[id].owner === 'blenders');
    const hqId = window.__game.hqOf('blenders');
    const stands = ids.filter((id) => id !== hqId);
    for (const id of stands.slice(1)) { st.plots[id].owner = null; st.plots[id].stand = null; }
    st.guards = Array.from({ length: 12 }, (_, i) => ({ id: 'sg' + i, name: 'Smoke ' + i, trait: 'Loyal', level: 5, xp: 0, weapon: 'hatchets', gear: 'pro', post: null, outUntil: 0, fee: 0 }));
    g.act({ type: 'refresh' });
    return { hqId, buy: stands[0] };
  });
  await page.evaluate((id) => window.__game.act({ type: 'inspect', plot: id }), hq.buy);
  await page.click('[data-testid="plot-buyout"]');
  if (await page.evaluate((id) => window.__game.state.plots[id].owner, hq.buy) !== 'player') fail('plot buyout did not go through');
  await page.evaluate((id) => window.__game.act({ type: 'inspect', plot: id }), hq.hqId);
  await page.waitForSelector('[data-testid="hq-assault"]');
  await page.screenshot({ path: 'test-results/14-hq-panel.png' });
  for (let i = 0; i < 12; i++) { const face = `[data-testid="hq-assault"] [data-action="squad"][data-id="sg${i}"][aria-pressed="false"]`; if (await page.$(face)) await page.click(face); } // Dex's picks stay in
  await page.click('[data-testid="assault"]'); // Now: the squad sets out as the stands open
  const at = await page.evaluate(() => { const g = window.__game; g.act({ type: 'open' }); g.act({ type: 'speed', value: 0 }); return g.state.raids.find((r) => r.assault)?.at ?? 0; });
  if (!at) fail('HQ assault did not set out');
  await page.evaluate((m) => window.__game.fastForward(m - window.__game.state.minute - 1), at);
  await lapseCalls();
  await page.evaluate(() => window.__game.act({ type: 'speed', value: 1 }));
  await page.waitForFunction(() => window.__game.battle(), null, { timeout: 90000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'test-results/15-hq-assault.png' });
  await page.evaluate(() => window.__game.finishFight()); // the assault plays live, stage by stage: settle the rest now
  const out = await page.evaluate(() => [window.__game.state.rivals.blenders.alive, window.__game.state.battles[0]?.hq].join(','));
  console.log('hq assault (blenders alive, last stage):', out);
  if (!/gate|yard|boss/.test(out)) fail(`no HQ battle recorded: ${out}`);

  // Modes and winning: a first visit opens the New Game screen; In the Red, victory and game over each get their screen.
  await page.waitForFunction(() => !window.__game.battle(), null, { timeout: 60000 }).catch(() => {});
  await page.evaluate(() => localStorage.clear());
  await page.goto(base);
  await page.waitForSelector('body[data-ready="1"]');
  await page.waitForSelector('[data-testid="setup"]');
  await page.click('[data-testid="mode-sandbox"]');
  await page.click('[data-testid="difficulty-laidback"]');
  await page.screenshot({ path: 'test-results/16-new-game.png' });
  await page.click('[data-testid="start"]');
  await page.waitForSelector('[data-testid="prep"]');
  const picked = await page.evaluate(() => `${window.__game.state.settings.mode}/${window.__game.state.settings.difficulty}`);
  if (picked !== 'sandbox/laidback') fail(`new game settings not applied: ${picked}`);
  await page.evaluate(() => { const g = window.__game; g.state.cash = -40; g.state.redDays = 1; g.act({ type: 'refresh' }); });
  await page.waitForSelector('[data-testid="in-the-red"]');
  await page.screenshot({ path: 'test-results/17-in-the-red.png' });
  await page.evaluate(() => { const g = window.__game; g.state.cash = 500; g.state.redDays = 0; g.state.settings.mode = 'campaign'; g.state.outcome = { result: 'won', how: 'domination', day: g.state.day, ending: 'beloved' }; g.act({ type: 'refresh' }); });
  await page.waitForSelector('[data-testid="victory"]');
  await page.screenshot({ path: 'test-results/18-victory.png' });
  await page.click('[data-testid="keep-squeezing"]');
  await page.waitForSelector('[data-testid="prep"]');
  if (!(await page.evaluate(() => window.__game.state.endlessSince >= 1))) fail('Keep squeezing did not start Endless Summer');
  await page.evaluate(() => { const g = window.__game; delete g.state.endlessSince; g.state.outcome = { result: 'lost', how: 'squeezed', day: g.state.day }; g.act({ type: 'refresh' }); });
  await page.waitForSelector('[data-testid="game-over"]');
  await page.screenshot({ path: 'test-results/19-game-over.png' });
  await page.click('[data-testid="reload-dawn"]');
  await page.waitForSelector('[data-testid="prep"]');
  if (await page.evaluate(() => !!window.__game.state.outcome)) fail('reloading the last dawn kept the loss');

  if (errors.length) fail(errors.join('\n'));
  await browser.close();
  console.log('SMOKE OK');
} catch (e) {
  fail(e);
}
stopServer();
