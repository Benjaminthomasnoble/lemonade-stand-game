import './style.css';
import './screens.css';
import * as THREE from 'three/webgpu';
import {
  buySupply, CLOSE, CUPS_PER_PITCHER, newGame, OPEN, openStand, REAL_SECONDS_PER_MINUTE, setPrice, setRecipe, setSweetness,
  simulateRestOfDay, sleepUntilDawn, tickMinute, type GameState, type SegmentId, type SimEvent,
} from './sim/economy.ts';
import { clearSave, loadGame, saveGame } from './save.ts';
import { createHud, type Action } from './ui/hud.ts';
import { createWorld } from './world/scene.ts';
import { createStand } from './world/stand.ts';
import { createCrowd } from './world/people.ts';

const LOOK: Partial<Record<SegmentId, { scale: number; speed: number }>> = {
  kids: { scale: 0.68, speed: 1.15 },
  seniors: { scale: 0.95, speed: 0.7 },
};
const MISS_TEXT = { pricey: 'Too pricey!', line: 'Line\'s too long!', soldOut: 'Sold out?!' } as const;

async function main() {
  const params = new URLSearchParams(location.search);
  const seedParam = params.get('seed');
  let state: GameState = (seedParam ? null : loadGame()) ?? newGame(seedParam ? Number(seedParam) : undefined);
  let speed = 1;
  let acc = 0;

  const world = await createWorld(document.getElementById('app')!);
  const stand = createStand();
  world.scene.add(stand.group);
  const tmp = new THREE.Vector3();
  const crowd = createCrowd(world.scene, stand.servePoint, (pos, text, kind) => {
    tmp.copy(pos).project(world.camera);
    const el = world.renderer.domElement;
    hud.popup((tmp.x * 0.5 + 0.5) * el.clientWidth, (-tmp.y * 0.5 + 0.5) * el.clientHeight, text, kind);
  });

  const drawEvents = (events: SimEvent[]) => {
    for (const e of events) {
      if (e.type !== 'passerby') continue;
      const look = LOOK[e.segment];
      if (e.buys) crowd.spawn('sale', e.price < 1 ? `+${Math.round(e.price * 100)}¢` : `+$${e.price.toFixed(2)}`, look);
      else if (e.reason === 'soldOut' || e.reason === 'line') crowd.spawn('miss', MISS_TEXT[e.reason], look);
      else if (e.reason === 'pricey') crowd.spawn('grumble', MISS_TEXT.pricey, look);
      else crowd.spawn('pass', '', look);
    }
  };

  const act = (a: Action) => {
    switch (a.type) {
      case 'buy': buySupply(state, a.id, a.packs); break;
      case 'recipe': setRecipe(state, a.id); break;
      case 'sweet': setSweetness(state, a.value); break;
      case 'price': setPrice(state, state.price + a.delta); break;
      case 'open': openStand(state); acc = 0; if (speed === 0) speed = 1; break;
      case 'speed': speed = a.value; break;
      case 'skip': simulateRestOfDay(state); crowd.clear(); break;
      case 'sleep': sleepUntilDawn(state); crowd.clear(); break;
      case 'newgame': clearSave(); state = newGame(); crowd.clear(); break;
    }
    if (state.phase !== 'open') saveGame(state);
    hud.render(state, speed);
  };
  const hud = createHud(document.getElementById('ui')!, act);

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
    fastForward(minutes: number) { for (let i = 0; i < minutes && state.phase === 'open'; i++) tickMinute(state); if (state.phase !== 'open') saveGame(state); hud.render(state, speed); },
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
      if (state.phase !== 'open') saveGame(state);
    }
    const dayFrac = state.phase === 'prep' ? 0 : (state.minute - OPEN) / (CLOSE - OPEN);
    world.setWeather(state.phase === 'prep' ? state.forecast.kind : state.weather.kind, dayFrac);
    stand.setLevel(state.standLevel);
    stand.update({ price: state.price, pitcherFill: state.pitcherCups / CUPS_PER_PITCHER, open: state.phase === 'open', time: timer.getElapsed() });
    crowd.update(state.phase === 'open' && speed === 0 ? 0 : dt, state.phase === 'open' ? Math.max(speed, 1) : 1);
    world.update(dt);
    world.renderer.render(world.scene, world.camera);
    hud.render(state, speed);
  });
  document.body.dataset.ready = '1';
}

main().catch((err) => {
  console.error(err);
  document.getElementById('ui')!.innerHTML = `<div class="modal-bg"><div class="modal"><h2>Couldn't start the game</h2><p>${String(err)}</p></div></div>`;
});
