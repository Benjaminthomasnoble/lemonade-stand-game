// HTML/CSS interface over the 3D view: top bar, morning prep panel,
// open-day controls and the end-of-day report. Buttons carry a
// data-action attribute and are handled by one delegated listener.
import {
  CUPS_PER_PITCHER, DAY_LENGTH_MIN, DAY_START_MIN, SUPPLIES, WEATHER, fairPrice, netWorth,
  recipeQuality, servingsAvailable, supplyCostPerCup, type GameState, type SupplyId, type WeatherKind,
} from '../sim/economy.ts';

export type Action =
  | { type: 'buy'; id: SupplyId; packs: number }
  | { type: 'recipe'; key: 'lemons' | 'sugar' | 'ice'; delta: number }
  | { type: 'price'; delta: number }
  | { type: 'open' }
  | { type: 'speed'; value: number }
  | { type: 'skip' }
  | { type: 'next' }
  | { type: 'newgame' };

const ICON: Record<WeatherKind, string> = { sunny: '☀️', cloudy: '⛅', rainy: '🌧️', heatwave: '🔥' };
const money = (n: number) => (n < 0 ? '-$' : '$') + Math.abs(n).toFixed(2);
const cents = (n: number) => (n < 1 ? `${Math.round(n * 100)}¢` : money(n));

function clock(min: number) {
  const h = Math.floor(min / 60), mm = min % 60;
  return `${((h + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

function stars(rep: number) {
  const n = Math.round(rep * 5);
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

export interface Hud {
  render(s: GameState, speed: number): void;
  popup(x: number, y: number, text: string, kind: 'sale' | 'soldout'): void;
}

export function createHud(root: HTMLElement, onAction: (a: Action) => void): Hud {
  root.innerHTML = `<div class="topbar" id="topbar"></div><div id="phase"></div><div id="pops"></div>`;
  const top = root.querySelector('#topbar') as HTMLElement;
  const phaseEl = root.querySelector('#phase') as HTMLElement;
  const pops = root.querySelector('#pops') as HTMLElement;
  let lastPhaseKey = '';

  root.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
    if (!el || (el as HTMLButtonElement).disabled) return;
    const d = el.dataset;
    switch (d.action) {
      case 'buy': onAction({ type: 'buy', id: d.id as SupplyId, packs: Number(d.packs) }); break;
      case 'recipe': onAction({ type: 'recipe', key: d.key as 'lemons' | 'sugar' | 'ice', delta: Number(d.delta) }); break;
      case 'price': onAction({ type: 'price', delta: Number(d.delta) }); break;
      case 'speed': onAction({ type: 'speed', value: Number(d.value) }); break;
      case 'open': case 'skip': case 'next': case 'newgame': onAction({ type: d.action }); break;
    }
  });

  function topbar(s: GameState) {
    const w = s.phase === 'prep' ? s.forecast : s.weather;
    const weatherLabel = s.phase === 'prep' ? 'Forecast' : 'Weather';
    top.innerHTML = `
      <div class="chip title">🍋 Lemonade Stand Wars</div>
      <div class="chip"><span class="label">Day</span>${s.day}</div>
      <div class="chip"><span class="label">${weatherLabel}</span>${ICON[w.kind]} ${WEATHER[w.kind].label}, ${w.temp}°F</div>
      <div class="chip" data-testid="cash"><span class="label">Cash</span>${money(s.cash)}</div>
      <div class="chip hide-sm"><span class="label">Reputation</span><span class="stars">${stars(s.reputation)}</span></div>
      <div class="chip hide-sm"><span class="label">Net worth</span>${money(netWorth(s))}</div>
      <div class="spacer"></div>`;
  }

  function prepPanel(s: GameState) {
    const temp = s.forecast.temp;
    const q = recipeQuality(s.recipe, temp);
    const cost = supplyCostPerCup(s.recipe);
    const servings = servingsAvailable(s);
    const supplyRows = (Object.keys(SUPPLIES) as SupplyId[]).map((id) => {
      const sp = SUPPLIES[id];
      return `<div class="row"><span class="name">${sp.label} <span class="muted">(${s.inventory[id]} ${sp.unit})</span></span>
        <button class="small" data-action="buy" data-id="${id}" data-packs="1" ${s.cash < sp.packPrice ? 'disabled' : ''}
          title="${sp.packSize} ${sp.unit}">+${sp.packSize} · ${money(sp.packPrice)}</button>
        <button class="small ghost" data-action="buy" data-id="${id}" data-packs="5" ${s.cash < sp.packPrice * 5 ? 'disabled' : ''}>×5</button></div>`;
    }).join('');
    const stepper = (key: 'lemons' | 'sugar' | 'ice', label: string, val: number) =>
      `<div class="row"><span class="name">${label}</span>
        <button class="small ghost" data-action="recipe" data-key="${key}" data-delta="-1">−</button>
        <span class="val">${val}</span>
        <button class="small ghost" data-action="recipe" data-key="${key}" data-delta="1">+</button></div>`;
    const taste = q > 0.85 ? '<span class="good">Delicious</span>' : q > 0.6 ? 'Pretty good' : q > 0.3 ? '<span class="bad">Meh</span>' : '<span class="bad">Yuck</span>';
    const fair = fairPrice(temp, q);
    const priceHint = s.price > fair * 1.25 ? '<span class="bad">Pricey for this weather</span>'
      : s.price < fair * 0.7 ? 'A bargain' : 'Fair price';
    const warn = servings === 0
      ? '<p class="warn">You can\'t make any lemonade yet. Buy lemons, sugar and cups.</p>'
      : s.inventory.ice === 0 && s.recipe.ice > 0 ? '<p class="warn">No ice! Warm lemonade won\'t please anyone.</p>' : '';
    return `<div class="panel" data-testid="prep">
      <h2>Morning prep</h2>
      <div class="muted">Today: ${ICON[s.forecast.kind]} ${WEATHER[s.forecast.kind].label}, ${temp}°F (forecasts can be wrong)</div>
      <h3>Supplies</h3>${supplyRows}
      <div class="muted">Ice melts every night.</div>
      <h3>Recipe</h3>
      ${stepper('lemons', 'Lemons per pitcher', s.recipe.lemons)}
      ${stepper('sugar', 'Sugar per pitcher', s.recipe.sugar)}
      ${stepper('ice', 'Ice cubes per cup', s.recipe.ice)}
      <div class="muted">Taste: ${taste} · A pitcher pours ${CUPS_PER_PITCHER} cups · Costs ${cents(cost)} a cup</div>
      <h3>Price per cup</h3>
      <div class="row"><span class="name">${priceHint}</span>
        <button class="small ghost" data-action="price" data-delta="-0.05">−</button>
        <span class="val" data-testid="price">${cents(s.price)}</span>
        <button class="small ghost" data-action="price" data-delta="0.05">+</button></div>
      <div class="muted">You can pour about <b>${servings}</b> cups with what you have.</div>
      ${warn}
      <button class="big" data-action="open" data-testid="open">Open the stand ☀️</button>
    </div>`;
  }

  function dayBar(s: GameState, speed: number) {
    const pct = ((s.minute - DAY_START_MIN) / DAY_LENGTH_MIN) * 100;
    const sb = (v: number, label: string) => `<button class="small ${speed === v ? 'on' : 'ghost'}" data-action="speed" data-value="${v}">${label}</button>`;
    return `<div class="daybar" data-testid="daybar">
      <b>${clock(s.minute)}</b>
      <div class="progress"><div style="width:${pct.toFixed(1)}%"></div></div>
      <span>Sold <b>${s.today.customers}</b></span>
      <span class="muted">${servingsAvailable(s)} cups left · ${s.inventory.ice} ice</span>
      ${sb(0, '⏸')}${sb(1, '1×')}${sb(2, '2×')}${sb(4, '4×')}
      <button class="small ghost" data-action="skip" title="Finish the day instantly">⏭</button>
    </div>`;
  }

  function report(s: GameState) {
    const t = s.history[s.history.length - 1] ?? s.today;
    const profit = t.revenue - t.spent;
    const repDelta = t.reputationAfter - t.reputationBefore;
    const tip = t.missed > 10 ? `You ran out and turned away ${t.missed} thirsty people. Stock up more on days like this.`
      : t.customers === 0 ? 'No sales today. Check your stock, recipe and price.'
      : t.satisfaction < 0.45 ? 'Customers were unhappy. Try a better recipe or a lower price.'
      : t.iceMelted > 150 ? `${t.iceMelted} ice cubes melted overnight. Buy only what you need.`
      : 'Nice work! Keep an eye on tomorrow\'s forecast.';
    return `<div class="modal-bg"><div class="modal" data-testid="report">
      <h2>Day ${t.day} wrap-up</h2>
      <div class="muted">${ICON[t.weather.kind]} ${WEATHER[t.weather.kind].label}, ${t.weather.temp}°F · ${cents(t.price)} a cup</div>
      <table>
        <tr><td>People walking by</td><td>${t.passersby}</td></tr>
        <tr><td>Cups sold</td><td>${t.customers}</td></tr>
        <tr><td>Turned away (sold out)</td><td class="${t.missed ? 'bad' : ''}">${t.missed}</td></tr>
        <tr><td>Sales</td><td class="good">${money(t.revenue)}</td></tr>
        <tr><td>Supplies bought</td><td class="bad">${money(-t.spent)}</td></tr>
        <tr><td>Profit</td><td class="${profit >= 0 ? 'good' : 'bad'}">${money(profit)}</td></tr>
        <tr><td>Reputation</td><td><span class="stars">${stars(t.reputationAfter)}</span> <span class="${repDelta >= 0 ? 'good' : 'bad'}">${repDelta >= 0 ? '▲' : '▼'}</span></td></tr>
        <tr><td>Net worth</td><td>${money(netWorth(s))}</td></tr>
      </table>
      <p class="muted">${tip}</p>
      <button class="big" data-action="next" data-testid="next">Start day ${t.day + 1}</button>
      <div style="text-align:center;margin-top:8px"><button class="small ghost" data-action="newgame">New game</button></div>
    </div></div>`;
  }

  return {
    render(s, speed) {
      topbar(s);
      // Rebuild the phase panel only when something it shows has changed.
      const key = s.phase === 'open'
        ? `open|${s.minute}|${s.today.customers}|${speed}|${s.inventory.ice}|${s.inventory.cups}|${s.pitcherCups}`
        : `${s.phase}|${s.day}|${s.cash}|${JSON.stringify(s.inventory)}|${JSON.stringify(s.recipe)}|${s.price}`;
      if (key === lastPhaseKey) return;
      lastPhaseKey = key;
      phaseEl.innerHTML = s.phase === 'prep' ? prepPanel(s) : s.phase === 'open' ? dayBar(s, speed) : report(s);
    },
    popup(x, y, text, kind) {
      const el = document.createElement('div');
      el.className = `pop ${kind}`;
      el.textContent = text;
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      pops.appendChild(el);
      setTimeout(() => el.remove(), 1300);
    },
  };
}
