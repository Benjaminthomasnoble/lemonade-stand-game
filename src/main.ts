import './style.css';
import './screens.css';
import * as THREE from 'three/webgpu';
import {
  buildStand, buyBrand, buyPlot, buySupply, CLOSE, DISTRICTS, LOTTIES_CORNER, newGame, OPEN, openStands, PLOT_BY_ID, PLOT_SPACING,
  REAL_SECONDS_PER_MINUTE, runCampaign, selectedStand, setPrice, setRecipe, setSweetness, simulateRestOfDay, sleepUntilDawn,
  tickMinute, upgradeStand, type GameState, type SegmentId, type SimEvent,
  buildClubhouse, buyGadget, buyPerimeter, equip, fireGuard, guardReady, hireGuard, planRaid, postGuard, rebuildStand, repairFence,
  battleHeadline, welcomeDex, type BattleReport, acceptOrder, buildFacility, declineOrder,
  factionBuyout, makeTruce, plotBuyout, stormHQ, hqPlot, type RivalId,
  borrow, defaultSettings, keepSqueezing, repayLoan, type Settings,
} from './sim/economy.ts';
import { createBattle } from './world/battle.ts';
import { createAudio } from './audio.ts';
import { createVip } from './world/vip.ts';
import { bySea, incomingRaids, isVip } from './sim/economy.ts';
import { clearSave, loadDawn, loadGame, loadLeaderboard, recordScore, saveDawn, saveGame } from './save.ts';
import { createHud, type Action } from './ui/hud.ts';
import { createWorld } from './world/scene.ts';
import { createBay } from './world/bay.ts';
import { createCrowd } from './world/people.ts';
import { createBubbles } from './world/bubbles.ts';
import { BOSS, CUSTOMER, LOTTIE, pick, type BarkMoment } from './world/barks.ts';
import { FACTIONS, type RivalId } from './sim/balance.ts';

const LOOK: Partial<Record<SegmentId, { scale: number; speed: number }>> = {
  kids: { scale: 0.68, speed: 1.15 },
  seniors: { scale: 0.95, speed: 0.7 },
};
const MISS_TEXT = { pricey: CUSTOMER.pricey, line: CUSTOMER.line, soldOut: CUSTOMER.soldOut } as const;
/** A rush: this many coins landing within RUSH_MS gets a cheer from Lottie. */
const RUSH_COINS = 5;
const RUSH_MS = 5000;
/** Not every buyer says something, or the street turns into a wall of bubbles. */
const SIP_CHANCE = 0.35;

/** Draw walkers only for plots this close to what the camera looks at, and only when zoomed in. */
const STREET_VIEW_RADIUS = 45;
const STREET_VIEW_MAX_DIST = 70;

async function main() {
  const params = new URLSearchParams(location.search);
  const seedParam = params.get('seed');
  const saved = seedParam ? null : loadGame();
  /** A fresh run: new seed (unless the URL pins one), its own leaderboard row, and a first dawn autosave. */
  const freshRun = (settings: Partial<Settings> = {}, seed?: number) => {
    const s = newGame(seed, settings);
    s.runId = `${s.seed.toString(36)}-${Date.now().toString(36)}`;
    saveDawn(s);
    return s;
  };
  let state: GameState = saved ?? freshRun({}, seedParam ? Number(seedParam) : undefined);
  state.runId ??= `${state.seed.toString(36)}-${Date.now().toString(36)}`; // saves from before the leaderboard
  let speed = 1;
  let vipResume = 0; // speed to restore after a first-visit VIP scene
  let acc = 0;

  const audio = createAudio();
  const wake = () => audio.start();
  window.addEventListener('pointerdown', wake, { once: true });
  window.addEventListener('keydown', wake, { once: true });
  const won = (b: BattleReport) => (b.attacker === 'player') === (b.outcome === 'smashed' || b.outcome === 'robbed');
  /** Stingers for the end of the business day and for last night's fights. */
  const afterClose = () => {
    const raids = incomingRaids(state);
    if (!raids.length) return;
    audio.stinger('raid-incoming');
    const boss = raids.find((r) => r.attacker !== 'player')?.attacker as RivalId | undefined;
    const line = boss ? `${FACTIONS[boss].boss.split(' ')[0]} called: "${pick(BOSS[boss])}"` : undefined;
    lottieSays('raidComing', { react: 'fist', text: line });
  };
  const afterSleep = () => {
    const fights = state.battles.filter((b) => b.day === state.day - 1);
    if (fights.length) audio.stinger(fights.every(won) ? 'raid-won' : 'squeezed-out');
  };

  const world = await createWorld(document.getElementById('app')!);
  const bay = createBay(world.scene);
  bay.sync(state);
  const home = PLOT_BY_ID[LOTTIES_CORNER];
  world.controls.target.set(home.x, 0.8, home.streetZ);
  world.camera.position.set(home.x + 8, 9, home.streetZ + 14);

  const tmp = new THREE.Vector3();
  const toScreen = (pos: THREE.Vector3) => {
    tmp.copy(pos).project(world.camera);
    const el = world.renderer.domElement;
    return [(tmp.x * 0.5 + 0.5) * el.clientWidth, (-tmp.y * 0.5 + 0.5) * el.clientHeight] as const;
  };
  const bubbleLayer = document.createElement('div');
  bubbleLayer.id = 'bubbles'; // joins #ui once the HUD has drawn its frame
  const bubbles = createBubbles(bubbleLayer);

  /** Lottie (at the Corner) says a line for a moment, and maybe reacts in her chair. */
  const lastBark = new Map<BarkMoment, number>();
  const lottieSays = (moment: BarkMoment, opts: { react?: 'cheer' | 'fist'; cooldown?: number; text?: string; ms?: number } = {}) => {
    const now = performance.now();
    if (now - (lastBark.get(moment) ?? -1e9) < (opts.cooldown ?? 0)) return;
    const stand = bay.views[LOTTIES_CORNER]?.stand;
    if (!stand?.lottie) return;
    lastBark.set(moment, now);
    if (opts.react) stand.react(opts.react);
    bubbles.say(stand.lottie, opts.text ?? pick(LOTTIE[moment]), { who: 'Lottie', color: '#7a4fb0', height: 2.0, ms: opts.ms });
  };

  /** Lottie reads the sky each morning. */
  const morningLine = () => {
    if (state.phase !== 'prep') return;
    const k = state.forecast.kind;
    setTimeout(() => lottieSays(k === 'scorcher' || k === 'hot' ? 'morningHot' : k === 'rainy' || k === 'storm' ? 'morningRain' : 'morning'), 600);
  };

  let coinTimes: number[] = [];
  const crowd = createCrowd(world.scene, (pos, text, kind, who) => {
    const [x, y] = toScreen(pos);
    if (kind === 'sale' && text) {
      // A rush stacks coins: the third coin in a quick run is double, the fifth triple.
      const now = performance.now();
      coinTimes = coinTimes.filter((t) => now - t < RUSH_MS);
      coinTimes.push(now);
      const size = coinTimes.length >= RUSH_COINS ? 3 : coinTimes.length >= 3 ? 2 : 1;
      hud.popup(x, y, text, 'sale');
      hud.coin(x, y, size, () => audio.ding(size > 1));
      if (coinTimes.length >= RUSH_COINS) lottieSays('rush', { react: 'cheer', cooldown: 25000 });
    } else if (kind === 'miss') {
      bubbles.say(who, text, { kind: 'thought', ms: 1600 });
      if (text === CUSTOMER.soldOut) lottieSays('soldOut', { react: 'fist', cooldown: 20000 });
    } else if (kind === 'sip' && Math.random() < SIP_CHANCE) {
      bubbles.say(who, pick(CUSTOMER.sip), { ms: 1300 });
    }
  });

  const vip = createVip(world.scene);
  const drawEvents = (events: SimEvent[]) => {
    for (const e of events) {
      if (e.type !== 'pickup') continue;
      flushNews();
      if (e.raid) { playBattle(e.raid); continue; }
      const o = e.order;
      if (!e.ok || !o.plot || !isVip(o.tier)) continue;
      // Only a client's first visit stops the clock for the show; regulars just land and load.
      const seen = (state.seenClients ??= []);
      if (!seen.includes(o.client)) {
        seen.push(o.client);
        crowd.clear();
        focusPlot(o.plot, bySea(o.tier) ? 60 : 45);
        if (speed) { vipResume = speed; speed = 0; }
      }
      vip.play(bySea(o.tier) ? 'ship' : 'heli', bay.views[o.plot], o.qty > 20000, state.plots[o.plot].facility?.level ?? 1);
      audio.stinger('raid-won');
    }
    const t = world.controls.target;
    const zoomedIn = world.camera.position.distanceTo(t) < STREET_VIEW_MAX_DIST;
    if (!zoomedIn) return;
    for (const e of events) {
      if (e.type !== 'passerby') continue;
      const from = bay.views[e.plot], at = bay.views[e.at];
      if (Math.hypot(from.plot.x - t.x, from.plot.z - t.z) > STREET_VIEW_RADIUS) continue;
      const dir = Math.random() < 0.5 ? 1 : -1;
      const route = { x0: from.plot.x - dir * PLOT_SPACING * 2.5, x1: from.plot.x + dir * PLOT_SPACING * 2.5, z: from.sidewalkZ, serve: at.serve, grumbleX: at.plot.x };
      const look = LOOK[e.segment];
      const mine = e.owner === 'player';
      if (e.buys) crowd.spawn('sale', route, mine ? (e.price < 1 ? `+${Math.round(e.price * 100)}¢` : `+$${e.price.toFixed(2)}`) : '', look);
      else if (mine && (e.reason === 'soldOut' || e.reason === 'line')) crowd.spawn('miss', route, MISS_TEXT[e.reason], look);
      else if (mine && e.reason === 'pricey') crowd.spawn('grumble', route, MISS_TEXT.pricey, look);
      else crowd.spawn('pass', route, '', look);
    }
  };

  const battle = createBattle(world.scene, (pos, text, kind) => { const [x, y] = toScreen(pos); hud.popup(x, y, text, kind); });
  const playBattle = (b: BattleReport) => {
    crowd.clear();
    focusPlot(b.target, 20);
    battle.play(b, bay.views[b.target], () => {
      hud.toast(battleHeadline(b)); audio.stinger(won(b) ? 'raid-won' : 'squeezed-out'); bay.sync(state);
      if (b.attacker === 'player') lottieSays(won(b) ? 'raidWon' : 'raidLost', { react: won(b) ? 'cheer' : 'fist' });
      else if (b.defender === 'player') lottieSays(won(b) ? 'raidHeld' : 'raidLost', { react: won(b) ? 'cheer' : 'fist' });
    });
  };

  const focusPlot = (id: string, distance = 22) => {
    const p = PLOT_BY_ID[id];
    world.focus(p.x, (p.z + p.streetZ) / 2, distance);
  };

  const act = (a: Action) => {
    const st = selectedStand(state);
    switch (a.type) {
      case 'buy': buySupply(state, a.id, a.packs); break;
      case 'recipe': setRecipe(st, a.id); break;
      case 'sweet': setSweetness(st, a.value); break;
      case 'price': setPrice(st, st.price + a.delta); break;
      case 'restock': st.autoRestock = !st.autoRestock; break;
      case 'open': openStands(state); acc = 0; if (speed === 0) speed = 1; break;
      case 'speed': speed = a.value; break;
      case 'skip': simulateRestOfDay(state); crowd.clear(); afterClose(); break;
      case 'sleep': if (sleepUntilDawn(state)) saveDawn(state); crowd.clear(); battle.stop(); afterSleep(); morningLine(); break;
      case 'mute': hud.muted = audio.toggle(); break;
      case 'newgame': case 'setup': hud.setup = { settings: { ...state.settings }, cancel: true }; hud.leaderboard = loadLeaderboard(); break;
      case 'cancelSetup': hud.setup = null; break;
      case 'start': {
        if (state.day > 1) recordScore(state); // the run being left keeps its row on the leaderboard
        clearSave();
        state = freshRun(a.settings);
        hud.setup = null; hud.inspected = null; speed = 1; bubbles.clear();
        crowd.clear(); battle.stop(); bay.sync(state); focusPlot(state.selected);
        break;
      }
      case 'keepSqueezing': keepSqueezing(state); break;
      case 'reloadDawn': {
        const d = loadDawn(state.runId);
        if (d) { state = d; hud.inspected = null; crowd.clear(); battle.stop(); bubbles.clear(); hud.toast('Back to the last dawn. Let\'s try that again.'); }
        break;
      }
      case 'borrow': borrow(state, a.amount); break;
      case 'repay': repayLoan(state); break;
      case 'upgrade': {
        const before = selectedStand(state).level;
        upgradeStand(state);
        if (selectedStand(state).level > before) setTimeout(() => lottieSays('upgrade', { react: 'cheer' }), 300); // after the new stand is built
        break;
      }
      case 'brand': buyBrand(state); break;
      case 'campaign': runCampaign(state, a.id); break;
      case 'select': state.selected = a.plot; hud.inspected = a.plot; focusPlot(a.plot); break;
      case 'inspect': hud.inspected = a.plot; break;
      case 'buyPlot': buyPlot(state, a.plot); break;
      case 'build': buildStand(state, a.plot); break;
      case 'view': if (a.target === 'home') focusPlot(state.selected); else world.focus(40, -15, 285); break;
      case 'perimeter': buyPerimeter(state, a.plot); break;
      case 'gadget': buyGadget(state, a.plot, a.id); break;
      case 'repairFence': repairFence(state, a.plot); break;
      case 'rebuild': rebuildStand(state, a.plot); break;
      case 'hire': hireGuard(state, a.id); break;
      case 'fire': fireGuard(state, a.id); break;
      case 'post': postGuard(state, a.id, a.plot); break;
      case 'equip': equip(state, a.id, a.item); break;
      case 'clubhouse': buildClubhouse(state); break;
      case 'defend': for (const g of state.guards) if (guardReady(state, g)) postGuard(state, g.id, a.plot); break;
      case 'raid': {
        const r = planRaid(state, a.plot, a.guards, a.objective, a.when);
        if (typeof r === 'object') { hud.inspected = null; playBattle(r); }
        else if (r) hud.toast(`Raid planned for tonight on ${PLOT_BY_ID[a.plot].name}.`);
        break;
      }
      case 'truce': makeTruce(state, a.rival); break;
      case 'plotBuyout': plotBuyout(state, a.plot); break;
      case 'factionBuyout': if (factionBuyout(state, a.rival)) audio.stinger('raid-won'); break;
      case 'assault': {
        const r = stormHQ(state, a.rival, a.guards);
        if (r) { hud.inspected = null; playBattle(r.reports[r.reports.length - 1]); }
        break;
      }
      case 'replay': if (state.battles[a.index]) playBattle(state.battles[a.index]); break;
      case 'facility': buildFacility(state, a.plot, a.kind); break;
      case 'accept': acceptOrder(state, a.id); break;
      case 'decline': declineOrder(state, a.id); break;
      case 'refresh': break;
    }
    bay.sync(state);
    bay.select(hud.inspected);
    flushNews();
    const choosing = hud.setup && !hud.setup.cancel; // first visit: nothing worth saving until they press Start
    if (state.phase !== 'open' && !choosing) saveGame(state);
    if (a.type === 'sleep' || state.outcome) recordScore(state);
    hud.canReload = state.outcome?.result === 'lost' && !!loadDawn(state.runId);
    hud.render(state, speed);
  };
  const hud = createHud(document.getElementById('ui')!, act);
  document.getElementById('ui')!.prepend(bubbleLayer);
  hud.muted = audio.muted();
  // First visit (no save, no pinned seed): pick a mode and difficulty before the first morning.
  if (!saved && !seedParam) { hud.setup = { settings: defaultSettings(), cancel: false }; hud.leaderboard = loadLeaderboard(); }
  const flushNews = () => {
    while (state.news.length) {
      const n = state.news.shift()!;
      if (n.startsWith('RANK UP') || n.startsWith('YOU OWN THE BAY') || n.startsWith('TARGET HIT')) { audio.stinger('rank-up'); lottieSays('rankUp', { react: 'cheer' }); }
      if (n.startsWith('SQUEEZED OUT') || n.startsWith('RUN OUT OF TOWN')) audio.stinger('squeezed-out');
      hud.toast(n);
    }
  };

  // Click a plot to inspect it (a drag pans the camera instead).
  const canvas = world.renderer.domElement;
  let down: [number, number] | null = null;
  canvas.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
  canvas.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
    const ndc = new THREE.Vector2((e.clientX / canvas.clientWidth) * 2 - 1, -(e.clientY / canvas.clientHeight) * 2 + 1);
    act({ type: 'inspect', plot: bay.pick(ndc, world.camera) });
  });

  // District names float over the map in Bay View.
  const labels = DISTRICTS.map((d) => {
    const el = document.createElement('div');
    el.className = 'district-label';
    el.textContent = d.name;
    document.getElementById('ui')!.appendChild(el);
    return { el, pos: new THREE.Vector3(d.origin[0] + (d.cols * PLOT_SPACING) / 2, 2, d.origin[1]) };
  });

  // Keyboard: space pauses, 1-3 set speed.
  window.addEventListener('keydown', (e) => {
    if (state.phase !== 'open' || hud.setup) return;
    if (e.code === 'Space') { speed = speed === 0 ? 1 : 0; e.preventDefault(); }
    if (['Digit1', 'Digit2', 'Digit3'].includes(e.code)) speed = Number(e.code.slice(5));
  });

  // Debug/test handle for Playwright and agents (same idea as Owl World's).
  (window as unknown as { __game: unknown }).__game = {
    get state() { return state; },
    act,
    backend: world.backend,
    crowd: () => crowd.activeCount(),
    bubbles: () => bubbles.count(),
    lottieSays: (m: BarkMoment, ms?: number) => lottieSays(m, { react: 'cheer', ms }),
    battle: () => battle.active(),
    vip: () => vip.active(),
    hqOf: (id: RivalId) => hqPlot(id).id,
    vipWhere: () => vip.where(),
    dex: () => welcomeDex(state),
    focus: (id: string) => focusPlot(id, 18),
    fastForward(minutes: number) {
      for (let i = 0; i < minutes && state.phase === 'open'; i++) tickMinute(state);
      if (state.phase !== 'open') { flushNews(); saveGame(state); }
      hud.render(state, speed);
    },
  };

  morningLine();
  const timer = new THREE.Timer();
  world.renderer.setAnimationLoop(() => {
    timer.update();
    const dt = Math.min(timer.getDelta(), 0.1);
    if (state.phase === 'open' && speed > 0) {
      acc += dt * speed;
      let guard = 0;
      while (acc >= REAL_SECONDS_PER_MINUTE && state.phase === 'open' && guard++ < 60) {
        acc -= REAL_SECONDS_PER_MINUTE;
        drawEvents(tickMinute(state));
      }
      if (state.phase !== 'open') { flushNews(); saveGame(state); bay.sync(state); afterClose(); }
    }
    const dayFrac = state.phase === 'prep' ? 0 : (state.minute - OPEN) / (CLOSE - OPEN);
    world.setWeather(state.phase === 'prep' ? state.forecast.kind : state.weather.kind, dayFrac);
    bay.update(state, timer.getElapsed());
    crowd.update(state.phase === 'open' && speed === 0 ? 0 : dt, state.phase === 'open' ? Math.max(speed, 1) : 1);
    battle.update(dt);
    vip.update(dt);
    if (state.phase === 'report') lottieSays('night', { cooldown: 9000 });
    bubbles.update(world.camera, canvas.clientWidth, canvas.clientHeight);
    if (vipResume && !vip.active()) { speed = vipResume; vipResume = 0; }
    world.update(dt);
    const dist = world.camera.position.distanceTo(world.controls.target);
    for (const l of labels) {
      const show = dist > 90;
      l.el.style.display = show ? '' : 'none';
      if (show) { const [x, y] = toScreen(l.pos); l.el.style.left = `${x}px`; l.el.style.top = `${y}px`; }
    }
    world.renderer.render(world.scene, world.camera);
    hud.render(state, speed);
  });
  document.body.dataset.ready = '1';
}

main().catch((err) => {
  console.error(err);
  document.getElementById('ui')!.innerHTML = `<div class="modal-bg"><div class="modal"><h2>Couldn't start the game</h2><p>${String(err)}</p></div></div>`;
});
