import './style.css';
import './screens.css';
import * as THREE from 'three/webgpu';
import {
  buildStand, buyBrand, buyPlot, buySupply, CLOSE, DISTRICTS, LOTTIES_CORNER, newGame, OPEN, openStands, PLOT_BY_ID, PLOT_SPACING,
  REAL_SECONDS_PER_MINUTE, runCampaign, selectedStand, setPrice, setRecipe, setSweetness, simulateRestOfDay, sleepUntilDawn,
  tickMinute, upgradeStand, type GameState, type SegmentId, type SimEvent,
} from './sim/economy.ts';
import { clearSave, loadGame, saveGame } from './save.ts';
import { createHud, type Action } from './ui/hud.ts';
import { createWorld } from './world/scene.ts';
import { createBay } from './world/bay.ts';
import { createCrowd } from './world/people.ts';

const LOOK: Partial<Record<SegmentId, { scale: number; speed: number }>> = {
  kids: { scale: 0.68, speed: 1.15 },
  seniors: { scale: 0.95, speed: 0.7 },
};
const MISS_TEXT = { pricey: 'Too pricey!', line: 'Line\'s too long!', soldOut: 'Sold out?!' } as const;
/** Draw walkers only for plots this close to what the camera looks at, and only when zoomed in. */
const STREET_VIEW_RADIUS = 45;
const STREET_VIEW_MAX_DIST = 70;

async function main() {
  const params = new URLSearchParams(location.search);
  const seedParam = params.get('seed');
  let state: GameState = (seedParam ? null : loadGame()) ?? newGame(seedParam ? Number(seedParam) : undefined);
  let speed = 1;
  let acc = 0;

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
  const crowd = createCrowd(world.scene, (pos, text, kind) => {
    if (kind === 'sale' || kind === 'miss') { const [x, y] = toScreen(pos); hud.popup(x, y, text, kind); }
  });

  const drawEvents = (events: SimEvent[]) => {
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
      case 'skip': simulateRestOfDay(state); crowd.clear(); break;
      case 'sleep': sleepUntilDawn(state); crowd.clear(); break;
      case 'newgame': clearSave(); state = newGame(); crowd.clear(); hud.inspected = null; break;
      case 'upgrade': upgradeStand(state); break;
      case 'brand': buyBrand(state); break;
      case 'campaign': runCampaign(state, a.id); break;
      case 'select': state.selected = a.plot; hud.inspected = a.plot; focusPlot(a.plot); break;
      case 'inspect': hud.inspected = a.plot; break;
      case 'buyPlot': buyPlot(state, a.plot); break;
      case 'build': buildStand(state, a.plot); break;
      case 'view': if (a.target === 'home') focusPlot(state.selected); else world.focus(40, -15, 285); break;
      case 'refresh': break;
    }
    bay.sync(state);
    bay.select(hud.inspected);
    flushNews();
    if (state.phase !== 'open') saveGame(state);
    hud.render(state, speed);
  };
  const hud = createHud(document.getElementById('ui')!, act);
  const flushNews = () => { while (state.news.length) hud.toast(state.news.shift()!); };

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
    if (state.phase !== 'open') return;
    if (e.code === 'Space') { speed = speed === 0 ? 1 : 0; e.preventDefault(); }
    if (['Digit1', 'Digit2', 'Digit3'].includes(e.code)) speed = Number(e.code.slice(5));
  });

  // Debug/test handle for Playwright and agents (same idea as Owl World's).
  (window as unknown as { __game: unknown }).__game = {
    get state() { return state; },
    act,
    backend: world.backend,
    crowd: () => crowd.activeCount(),
    fastForward(minutes: number) {
      for (let i = 0; i < minutes && state.phase === 'open'; i++) tickMinute(state);
      if (state.phase !== 'open') { flushNews(); saveGame(state); }
      hud.render(state, speed);
    },
  };

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
      if (state.phase !== 'open') { flushNews(); saveGame(state); bay.sync(state); }
    }
    const dayFrac = state.phase === 'prep' ? 0 : (state.minute - OPEN) / (CLOSE - OPEN);
    world.setWeather(state.phase === 'prep' ? state.forecast.kind : state.weather.kind, dayFrac);
    bay.update(state, timer.getElapsed());
    crowd.update(state.phase === 'open' && speed === 0 ? 0 : dt, state.phase === 'open' ? Math.max(speed, 1) : 1);
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
