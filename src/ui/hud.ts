// Flat paper-prop screens over the world (spec 25.4): top bar, Lottie's
// Goals, the Morning Bugle prep screen, the open-day bar and the Ledger.
// Buttons carry data-action and go through one delegated listener.
import {
  averageStopChance, CLOSE, costPerCup, expectedPassersby, lemonsExpiringTomorrow, lottieGoals, maxPacks, OPEN, rankFor,
  RECIPES, seasonDay, seasonOf, servingsAvailable, stand, stock, successScore, SUPPLIES, WEATHER,
  BRAND_TIERS, CAMPAIGNS, canBuyBrand, canRunCampaign, canUpgradeStand, marketingMultiplier, STAND_LEVELS,
  type Blocker, type CampaignId, type StandLevel,
  type GameState, type RecipeId, type SupplyId, type Sweetness, type WeatherKind,
} from '../sim/economy.ts';

export type Action =
  | { type: 'buy'; id: SupplyId; packs: number }
  | { type: 'recipe'; id: RecipeId }
  | { type: 'sweet'; value: Sweetness }
  | { type: 'price'; delta: number }
  | { type: 'open' }
  | { type: 'speed'; value: number }
  | { type: 'skip' }
  | { type: 'sleep' }
  | { type: 'newgame' }
  | { type: 'upgrade' }
  | { type: 'brand' }
  | { type: 'campaign'; id: CampaignId }
  | { type: 'refresh' };

const ICON: Record<WeatherKind, string> = { scorcher: '🥵', hot: '☀️', warm: '🌤️', cloudy: '☁️', rainy: '🌧️', storm: '⛈️' };
const SEASON_LABEL = { summer: 'Summer', fall: 'Fall', winter: 'Winter', spring: 'Spring' } as const;
const money = (n: number) => (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const whole = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
const cents = (n: number) => (n < 1 ? `${Math.round(n * 100)}¢` : money(n));

function clock(min: number) {
  const h = Math.floor(min / 60) % 24, mm = min % 60;
  return `${((h + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

function stars(rep: number) {
  const full = Math.round(rep);
  return `<span class="stars" title="${rep.toFixed(1)} stars">${'★'.repeat(full)}${'☆'.repeat(5 - full)}</span>`;
}

function headline(s: GameState): string {
  if (s.day === 1) return 'SCHOOL\'S OUT! Lottie\'s grandkid sets up shop on Maple Row';
  const k = s.forecast.kind;
  const pool: Record<WeatherKind, string[]> = {
    scorcher: ['SIZZLER! Sidewalks hot enough to fry an egg', 'Town begs for shade as mercury soars'],
    hot: ['Hot one ahead: thirsty town expected', 'Sun\'s out, cups out'],
    warm: ['Perfect lemonade weather, say experts (Lottie)', 'Nice day for a stroll on Maple Row'],
    cloudy: ['Gray skies, cool heads', 'Clouds roll in; thirst rolls out'],
    rainy: ['Puddle alert! Umbrellas outsell lemonade', 'Rain, rain, go away, says every stand owner'],
    storm: ['STORM WARNING: Batten down the folding tables', 'Thunder over Citrine Bay'],
  };
  const list = pool[k];
  return list[s.day % list.length];
}

export interface Hud {
  render(s: GameState, speed: number): void;
  popup(x: number, y: number, text: string, kind: 'sale' | 'miss'): void;
  /** A Bugle-style headline with confetti (rank-ups, upgrades). */
  toast(text: string): void;
}

export function createHud(root: HTMLElement, onAction: (a: Action) => void): Hud {
  root.innerHTML = `<div class="topbar" id="topbar"></div><div class="goals" id="goals"></div><div class="speedbox" id="speeds"></div><div id="phase"></div><div id="pops"></div>`;
  const top = root.querySelector('#topbar') as HTMLElement;
  const goalsEl = root.querySelector('#goals') as HTMLElement;
  const phaseEl = root.querySelector('#phase') as HTMLElement;
  const pops = root.querySelector('#pops') as HTMLElement;
  const speedsEl = root.querySelector('#speeds') as HTMLElement;
  let tab: 'today' | 'grow' = 'today';
  let lastTop = '', lastGoals = '', lastPhase = '', lastSpeeds = '';

  root.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
    if (!el || (el as HTMLButtonElement).disabled) return;
    const d = el.dataset;
    switch (d.action) {
      case 'buy': onAction({ type: 'buy', id: d.id as SupplyId, packs: Number(d.packs) }); break;
      case 'recipe': onAction({ type: 'recipe', id: d.id as RecipeId }); break;
      case 'sweet': onAction({ type: 'sweet', value: d.value as Sweetness }); break;
      case 'price': onAction({ type: 'price', delta: Number(d.delta) }); break;
      case 'speed': onAction({ type: 'speed', value: Number(d.value) }); break;
      case 'open': case 'skip': case 'sleep': case 'newgame': case 'upgrade': case 'brand': onAction({ type: d.action }); break;
      case 'campaign': onAction({ type: 'campaign', id: d.id as CampaignId }); break;
      case 'tab': tab = d.tab as 'today' | 'grow'; lastPhase = ''; onAction({ type: 'refresh' }); break;
    }
  });

  const set = (el: HTMLElement, html: string, last: string) => { if (html !== last) el.innerHTML = html; return html; };

  function topbar(s: GameState) {
    const w = s.phase === 'prep' ? s.forecast : s.weather;
    const ss = successScore(s);
    const r = rankFor(ss);
    return `
      <div class="chip title">🍋 <span class="hide-sm">Lottie's Lemonade</span></div>
      <div class="chip" data-testid="cash"><span class="label">Cash</span>${money(s.cash)}</div>
      <div class="chip" title="Success Score = your net worth"><span class="badge">R${r.rank}</span>${r.title} · <span data-testid="score">${whole(ss)}</span></div>
      <div class="chip hide-sm"><span class="label">Reputation</span>${stars(s.reputation)}</div>
      <div class="chip hide-sm" title="How hard rivals are coming for you (rivals arrive in a later update)"><span class="label">Threat</span>🍋</div>
      <div class="chip"><span class="label">${SEASON_LABEL[seasonOf(s.day)]} day ${seasonDay(s.day)}</span>${clock(s.minute)}</div>
      <div class="chip">${ICON[w.kind]} ${w.temp}°F</div>`;
  }

  function speeds(s: GameState, speed: number) {
    if (s.phase !== 'open') return '';
    const sb = (v: number, label: string) => `<button class="small ${speed === v ? 'on' : 'ghost'}" data-action="speed" data-value="${v}" title="Speed ${label} (keys: space, 1, 2, 3)">${label}</button>`;
    return `<div class="chip speeds">${sb(0, '⏸')}${sb(1, '1×')}${sb(2, '2×')}${sb(3, '3×')}<button class="small ghost" data-action="skip" title="Finish the day instantly">⏭</button></div>`;
  }

  function goals(s: GameState) {
    return `<div class="card"><div class="card-title">👵 Lottie's Goals</div>${lottieGoals(s).map((g) => `
      <div class="goal ${g.done ? 'done' : ''}"><div>${g.done ? '✅' : '•'} ${g.text}</div>
      <div class="bar"><div style="width:${Math.round(g.progress * 100)}%"></div></div></div>`).join('')}</div>`;
  }

  function prepPanel(s: GameState) {
    const st = stand(s);
    const expiring = lemonsExpiringTomorrow(s);
    const supplyRows = (Object.keys(SUPPLIES) as SupplyId[]).map((id) => {
      const sp = SUPPLIES[id];
      const max = maxPacks(s, id);
      const note = id === 'ice' ? 'melts tonight' : id === 'lemons' ? (expiring ? `<span class="bad">${expiring} spoil tomorrow</span>` : 'keep 3 days') : 'keeps';
      return `<div class="row"><span class="name">${sp.label} <span class="muted">${stock(s, id)}/${st.storage[id]} · ${note}</span></span>
        <button class="small" data-action="buy" data-id="${id}" data-packs="1" ${max < 1 ? 'disabled' : ''}
          title="${sp.pack} ${sp.unit} at ${cents(s.market[id])} each">+${sp.pack} · ${money(sp.pack * s.market[id])}</button>
        <button class="small ghost" data-action="buy" data-id="${id}" data-packs="${Math.max(1, max)}" ${max < 2 ? 'disabled' : ''} title="Fill up">Fill</button></div>`;
    }).join('');
    const cards = (Object.keys(RECIPES) as RecipeId[]).map((id) => {
      const r = RECIPES[id];
      return `<button class="recipe ${s.recipe === id ? 'on' : 'ghost'}" data-action="recipe" data-id="${id}"><b>${r.label}</b><span>${r.blurb}</span></button>`;
    }).join('');
    const sweets = (['less', 'classic', 'extra'] as Sweetness[]).map((v) =>
      `<button class="small ${s.sweetness === v ? 'on' : 'ghost'}" data-action="sweet" data-value="${v}">${v[0].toUpperCase() + v.slice(1)}</button>`).join('');
    const stop = averageStopChance(s, s.forecast);
    const people = expectedPassersby(s, s.forecast);
    const cups = Math.min(Math.round(people * stop), st.capacityPerHour * 12);
    const servings = servingsAvailable(s);
    const warn = servings === 0
      ? '<p class="warn">You can\'t make lemonade yet. Buy lemons and sugar.</p>'
      : s.inventory.ice < RECIPES[s.recipe].icePerCup * Math.min(cups, servings) ? '<p class="warn">Not enough ice for the day. Warm lemonade makes people grumpy.</p>'
      : servings < cups * 0.8 ? `<p class="warn">You might sell out: about ${cups} cups wanted, ${servings} in stock.</p>` : '';
    const tabs = `<div class="tabs"><button class="small ${tab === 'today' ? 'on' : 'ghost'}" data-action="tab" data-tab="today">Today</button><button class="small ${tab === 'grow' ? 'on' : 'ghost'}" data-action="tab" data-tab="grow" data-testid="tab-grow">Stand &amp; marketing</button></div>`;
    if (tab === 'grow') return `<div class="panel" data-testid="prep">${tabs}${growPanel(s)}
      <button class="big" data-action="open" data-testid="open">Open at ${clock(OPEN)} ☀️</button></div>`;
    return `<div class="panel" data-testid="prep">${tabs}
      <div class="bugle"><div class="masthead">The Citrine Bay Bugle</div>
        <div class="dateline">${SEASON_LABEL[seasonOf(s.day)]}, day ${seasonDay(s.day)} · 5¢</div>
        <div class="headline">${headline(s)}</div>
        <div class="muted">Forecast: ${ICON[s.forecast.kind]} ${WEATHER[s.forecast.kind].label}, ${s.forecast.temp}°F (right about 4 days in 5)</div>
        ${s.today.lemonsSpoiled ? `<div class="bad">${s.today.lemonsSpoiled} lemons went bad overnight.</div>` : ''}
      </div>
      <h3>Market (${st.name} storage)</h3>${supplyRows}
      <h3>Recipe</h3><div class="recipes">${cards}</div>
      <div class="row"><span class="name">Sweetness</span>${sweets}</div>
      <h3>Price per cup</h3>
      <div class="row"><span class="name muted">Costs you ${cents(costPerCup(s))} a cup</span>
        <button class="small ghost" data-action="price" data-delta="-0.05">−</button>
        <span class="val" data-testid="price">${cents(s.price)}</span>
        <button class="small ghost" data-action="price" data-delta="0.05">+</button></div>
      <div class="odds">About <b>${Math.round(stop * 100)}%</b> of the ~${Math.round(people)} people walking by should stop: roughly <b>${cups}</b> cups.</div>
      ${warn}
      <button class="big" data-action="open" data-testid="open">Open at ${clock(OPEN)} ☀️</button>
    </div>`;
  }

  function blockBtn(action: string, label: string, b: Blocker, extra = '') {
    return `<div class="act"><button class="small" data-action="${action}" ${extra} ${b.ok ? '' : 'disabled'}>${label}</button>${b.ok ? '' : `<div class="muted">${b.why}</div>`}</div>`;
  }

  function levelStats(l: StandLevel) {
    return `${l.capacityPerHour} cups/hour · draws ×${l.draw} traffic · top price ${money(l.topPrice)} · upkeep ${money(l.upkeep)}/day · holds ${l.storage.lemons} lemons`;
  }

  function growPanel(s: GameState) {
    const cur = stand(s);
    const next = STAND_LEVELS[s.standLevel];
    const brand = s.brandTier ? BRAND_TIERS[s.brandTier - 1] : null;
    const nextBrand = BRAND_TIERS[s.brandTier];
    const campaigns = (Object.keys(CAMPAIGNS) as CampaignId[]).map((id) => {
      const c = CAMPAIGNS[id];
      const cost = c.costPerDay ? money(c.costPerDay) : `${c.samples} free cups`;
      return `<div class="upgrade"><div><b>${c.name}</b> <span class="muted">(${cost})</span><div class="muted">${c.blurb}</div></div>
        ${blockBtn('campaign', 'Run', canRunCampaign(s, id), `data-id="${id}"`)}</div>`;
    }).join('');
    return `
      <h3>Your stand: L${cur.level} ${cur.name}</h3>
      <div class="muted">${levelStats(cur)}</div>
      ${next ? `<div class="upgrade"><div><b>L${next.level} ${next.name}</b> · ${money(next.cost)}<div class="muted">${levelStats(next)}</div></div>
        ${blockBtn('upgrade', 'Upgrade', canUpgradeStand(s), 'data-testid="upgrade"')}</div>` : '<p>Top of the line. 🍋👑</p>'}
      <h3>Brand marketing (everywhere, forever)</h3>
      <div class="muted">Now: ${brand ? `${brand.name}, +${Math.round(brand.traffic * 100)}% traffic` : 'nothing yet'} · total traffic ×${marketingMultiplier(s).toFixed(2)}</div>
      ${nextBrand ? `<div class="upgrade"><div><b>${nextBrand.name}</b> · ${money(nextBrand.cost)}<div class="muted">+${Math.round(nextBrand.traffic * 100)}% foot traffic at every stand</div></div>
        ${blockBtn('brand', 'Buy', canBuyBrand(s), 'data-testid="brand"')}</div>` : ''}
      <h3>Local campaigns</h3>${campaigns}`;
  }

  function dayBar(s: GameState) {
    const pct = ((s.minute - OPEN) / (CLOSE - OPEN)) * 100;
    const w = s.today.walkedPast;
    const why = [['not thirsty', w.notThirsty], ['too pricey', w.pricey], ['line too long', w.line], ['sold out', w.soldOut]]
      .filter(([, n]) => (n as number) > 0).map(([k, n]) => `${n} ${k}`).join(' · ');
    return `<div class="daybar" data-testid="daybar">
      <div class="progress"><div style="width:${pct.toFixed(1)}%"></div></div>
      <span>Sold <b>${s.today.customers}</b> · ${money(s.today.revenue)}</span>
      <span class="muted">${servingsAvailable(s)} cups left · ${s.inventory.ice} ice</span>
      <span class="muted hide-sm">${why ? 'Walked past: ' + why : ''}</span>
    </div>`;
  }

  function ledger(s: GameState) {
    const t = s.history[s.history.length - 1] ?? s.today;
    const costs = t.supplies + t.cupCosts + t.upkeep;
    const profit = t.revenue - costs;
    const repDelta = t.reputationAfter - t.reputationBefore;
    const w = t.walkedPast;
    const ssDelta = successScore(s) - t.scoreBefore;
    const tip = w.soldOut > 10 ? `You turned away ${w.soldOut} thirsty people. Stock up more on days like this.`
      : w.pricey > t.customers ? 'Lots of people said "too pricey". Kids especially watch their pennies.'
      : w.line > 10 ? 'The line got too long. A bigger stand serves more cups an hour.'
      : t.customers === 0 ? 'No sales today. Check your stock and price.'
      : t.iceMelted > 120 ? `${t.iceMelted} ice cubes melted tonight. Buy only what you need.`
      : 'Not bad, kiddo. Check tomorrow\'s Bugle before you buy.';
    return `<div class="modal-bg"><div class="modal ledger" data-testid="report">
      <h2>📒 The Ledger: day ${t.day}</h2>
      <div class="muted">${ICON[t.weather.kind]} ${WEATHER[t.weather.kind].label}, ${t.weather.temp}°F · ${RECIPES[t.recipe].label} at ${cents(t.price)}</div>
      <table>
        <tr><td>People walking by</td><td>${t.passersby}</td></tr>
        <tr><td>Cups sold</td><td>${t.customers}</td></tr>
        <tr><td class="muted">Walked past: not thirsty / too pricey</td><td class="muted">${w.notThirsty} / ${w.pricey}</td></tr>
        <tr><td class="muted">Walked past: line too long / sold out</td><td class="${w.line + w.soldOut ? 'bad' : 'muted'}">${w.line} / ${w.soldOut}</td></tr>
        <tr><td>Sales</td><td class="good">${money(t.revenue)}</td></tr>
        <tr><td>Supplies, cups and upkeep</td><td class="bad">${money(-costs)}</td></tr>
        <tr><td>Profit</td><td class="${profit >= 0 ? 'good' : 'bad'}">${money(profit)}</td></tr>
        <tr><td>Reputation</td><td>${stars(t.reputationAfter)} <span class="${repDelta >= 0 ? 'good' : 'bad'}">${repDelta >= 0 ? '+' : ''}${repDelta.toFixed(2)}</span></td></tr>
        <tr><td>Success Score</td><td>${whole(successScore(s))} <span class="${ssDelta >= 0 ? 'good' : 'bad'}">${ssDelta >= 0 ? '+' : ''}${ssDelta}</span></td></tr>
      </table>
      <p class="lottie">👵 ${tip}</p>
      <button class="big" data-action="sleep" data-testid="next">Sleep till dawn 🌙</button>
      <div style="text-align:center;margin-top:8px"><button class="small ghost" data-action="newgame">New game</button></div>
    </div></div>`;
  }

  return {
    render(s, speed) {
      lastTop = set(top, topbar(s), lastTop);
      lastSpeeds = set(speedsEl, speeds(s, speed), lastSpeeds);
      lastGoals = set(goalsEl, goals(s), lastGoals);
      lastPhase = set(phaseEl, s.phase === 'prep' ? prepPanel(s) : s.phase === 'open' ? dayBar(s) : ledger(s), lastPhase);
    },
    toast(text) {
      const el = document.createElement('div');
      el.className = 'toast';
      el.innerHTML = `<div class="masthead">Bugle Extra!</div><div class="headline"></div>`;
      (el.querySelector('.headline') as HTMLElement).textContent = text;
      root.appendChild(el);
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!reduced) {
        for (let i = 0; i < 40; i++) {
          const c = document.createElement('div');
          c.className = 'confetti';
          c.textContent = ['🍋', '⭐', '🎉', '✨'][i % 4];
          c.style.left = `${10 + Math.random() * 80}%`;
          c.style.animationDelay = `${Math.random() * 0.6}s`;
          c.style.animationDuration = `${1.8 + Math.random() * 1.2}s`;
          root.appendChild(c);
          setTimeout(() => c.remove(), 3800);
        }
      }
      setTimeout(() => el.remove(), 4200);
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
