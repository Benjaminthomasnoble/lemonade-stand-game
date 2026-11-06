import './style.css';
import * as THREE from 'three/webgpu';
import {
  buySupply, CUPS_PER_PITCHER, DAY_LENGTH_MIN, DAY_START_MIN, newGame, nextDay, openStand, setPrice, setRecipe,
  simulateRestOfDay, tickMinute, type GameState, type SimEvent,
} from './sim/economy.ts';
import { clearSave, loadGame, saveGame } from './save.ts';
import { createHud, type Action } from './ui/hud.ts';
import { createWorld } from './world/scene.ts';
import { createStand } from './world/stand.ts';
import { createCrowd } from './world/people.ts';

/** Real seconds per game minute at 1× speed (an 8-hour day takes 2 minutes). */
const SECONDS_PER_GAME_MINUTE = 0.25;

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

  const handleEvents = (events: SimEvent[], draw: boolean) => {
    if (!draw) return;
    for (const e of events) {
      if (e.type !== 'passerby') continue;
      if (e.buys) crowd.spawn('sale', e.price < 1 ? `+${Math.round(e.price * 100)}¢` : `+$${e.price.toFixed(2)}`);
      else if (e.soldOut) crowd.spawn('soldout', 'Sold out!');
      else crowd.spawn('pass');
    }
  };

  const act = (a: Action) => {
    switch (a.type) {
      case 'buy': buySupply(state, a.id, a.packs); break;
      case 'recipe': setRecipe(state, { [a.key]: state.recipe[a.key] + a.delta }); break;
      case 'price': setPrice(state, state.price + a.delta); break;
      case 'open': openStand(state); acc = 0; if (speed === 0) speed = 1; break;
      case 'speed': speed = a.value; break;
      case 'skip': simulateRestOfDay(state); crowd.clear(); break;
      case 'next': nextDay(state); crowd.clear(); break;
      case 'newgame': clearSave(); state = newGame(); crowd.clear(); break;
    }
    if (state.phase !== 'open') saveGame(state);
    hud.render(state, speed);
  };
  const hud = createHud(document.getElementById('ui')!, act);

  // Debug/test handle for Playwright and agents (same idea as Owl World's).
  (window as unknown as { __game: unknown }).__game = {
    get state() { return state; },
    act,
    backend: world.backend,
    crowd: () => crowd.activeCount(),
    fastForward(minutes: number) { for (let i = 0; i < minutes && state.phase === 'open'; i++) handleEvents(tickMinute(state), false); hud.render(state, speed); },
  };

  const timer = new THREE.Timer();
  world.renderer.setAnimationLoop(() => {
    timer.update();
    const dt = Math.min(timer.getDelta(), 0.1);
    if (state.phase === 'open' && speed > 0) {
      acc += dt * speed;
      let guard = 0;
      while (acc >= SECONDS_PER_GAME_MINUTE && state.phase === 'open' && guard++ < 60) {
        acc -= SECONDS_PER_GAME_MINUTE;
        handleEvents(tickMinute(state), true);
      }
      if (state.phase !== 'open') saveGame(state);
    }
    const dayFrac = state.phase === 'prep' ? 0.05 : (state.minute - DAY_START_MIN) / DAY_LENGTH_MIN;
    world.setWeather(state.phase === 'prep' ? state.forecast.kind : state.weather.kind, dayFrac);
    stand.update({ price: state.price, pitcherFill: state.pitcherCups / CUPS_PER_PITCHER, open: state.phase === 'open', time: timer.getElapsed() });
    crowd.update(dt, state.phase === 'open' ? Math.max(speed, 1) : 1);
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
