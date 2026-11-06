// Flat paper-prop screens over the world (spec 25.4): top bar, Lottie's
// Goals, the Morning Bugle prep screen, the plot card, the open-day bar
// and the Ledger. Buttons carry data-action and go through one listener.
import {
  AUTO_RESTOCK_DAY, averageStopChance, BRAND_TIERS, CAMPAIGNS, canBuildStand, canBuyBrand, canBuyPlot, canRunCampaign,
  canUpgradeStand, CLOSE, costPerCup, DISTRICT_BY_ID, expectedCups, expectedPassersby, FACTIONS, lemonsExpiringTomorrow,
  lottieGoals, marketingMultiplier, maxPacks, OPEN, PLOT_BY_ID, playerStands, rankFor, RECIPES, seasonDay, seasonOf,
  selectedStand, servingsAvailable, STAND_LEVELS, standLevel, stock, successScore, SUPPLIES, WEATHER,
  availableRaiders, canBuildClubhouse, canBuyGadget, canBuyPerimeter, canEquip, canHire, canRaid, CLUBHOUSE, clubhouseBeds,
  fenceRepairCost, GADGET_SLOTS, GADGETS, GEAR, guardReady, guardTitle, guardWage, incomingRaids, PERIMETERS, raidOdds,
  RAID_RANK, rebuildCost, rosterCap, SQUAD_CAP, threatLevel, WEAPONS, HIRE_RANK,
  type GadgetId, type GearId, type Guard, type Objective, type WeaponId,
  bottlesNeeded, bottlingCapacity, canBuildFacility, FACILITIES, facilityFor, ORDER_TIERS, tierOpen, PLOTS,
  type FacilityKind, type OrderTier,
  canAssault, canFactionBuyout, canPlotBuyout, canTruce, factionBuyoutPrice, hasBuilding, HQS, inTruce, isWrecked, plotBuyoutPrice,
  plotPrice, rivalStatus, SITDOWN_RANK, truceCost,
  type Blocker, type CampaignId, type GameState, type RecipeId, type RivalId, type StandLevel, type SupplyId, type Sweetness,
  type WeatherKind,
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
  | { type: 'restock' }
  | { type: 'select'; plot: string }
  | { type: 'inspect'; plot: string | null }
  | { type: 'buyPlot'; plot: string }
  | { type: 'build'; plot: string }
  | { type: 'view'; target: 'home' | 'bay' }
  | { type: 'perimeter'; plot: string }
  | { type: 'gadget'; plot: string; id: GadgetId }
  | { type: 'repairFence'; plot: string }
  | { type: 'rebuild'; plot: string }
  | { type: 'hire'; id: string }
  | { type: 'fire'; id: string }
  | { type: 'post'; id: string; plot: string | null }
  | { type: 'equip'; id: string; item: WeaponId | GearId }
  | { type: 'clubhouse' }
  | { type: 'raid'; plot: string; guards: string[]; objective: Objective; when: 'now' | 'tonight' }
  | { type: 'replay'; index: number }
  | { type: 'defend'; plot: string }
  | { type: 'mute' }
  | { type: 'facility'; plot: string; kind: FacilityKind }
  | { type: 'accept'; id: string }
  | { type: 'decline'; id: string }
  | { type: 'truce'; rival: RivalId }
  | { type: 'plotBuyout'; plot: string }
  | { type: 'factionBuyout'; rival: RivalId }
  | { type: 'assault'; rival: RivalId; guards: string[] }
  | { type: 'refresh' };

const ICON: Record<WeatherKind, string> = { scorcher: '🥵', hot: '☀️', warm: '🌤️', cloudy: '☁️', rainy: '🌧️', storm: '⛈️' };
const SEASON_LABEL = { summer: 'Summer', fall: 'Fall', winter: 'Winter', spring: 'Spring' } as const;
const money = (n: number) => (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const whole = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
const cents = (n: number) => (n < 1 ? `${Math.round(n * 100)}¢` : money(n));
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');

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
  const pool: Record<WeatherKind, string[]> = {
    scorcher: ['SIZZLER! Sidewalks hot enough to fry an egg', 'Town begs for shade as mercury soars'],
    hot: ['Hot one ahead: thirsty town expected', 'Sun\'s out, cups out'],
    warm: ['Perfect lemonade weather, say experts (Lottie)', 'Nice day for a stroll on Maple Row'],
    cloudy: ['Gray skies, cool heads', 'Clouds roll in; thirst rolls out'],
    rainy: ['Puddle alert! Umbrellas outsell lemonade', 'Rain, rain, go away, says every stand owner'],
    storm: ['STORM WARNING: Batten down the folding tables', 'Thunder over Citrine Bay'],
  };
  const list = pool[s.forecast.kind];
  return list[s.day % list.length];
}

const ownerName = (o: string | null) => (o === 'player' ? "Lottie's Lemonade (you)" : o ? FACTIONS[o as RivalId].name : 'Nobody: for sale');

export interface Hud {
  render(s: GameState, speed: number): void;
  popup(x: number, y: number, text: string, kind: 'sale' | 'miss'): void;
  /** A Bugle-style headline with confetti (rank-ups, upgrades). */
  toast(text: string): void;
  inspected: string | null;
  muted: boolean;
}

export function createHud(root: HTMLElement, onAction: (a: Action) => void): Hud {
  root.innerHTML = `<div class="topbar" id="topbar"></div><div class="goals" id="goals"></div><div id="phase"></div>
    <div class="plotcard" id="plotcard"></div><div class="speedbox" id="speeds"></div><div id="pops"></div>`;
  const top = root.querySelector('#topbar') as HTMLElement;
  const goalsEl = root.querySelector('#goals') as HTMLElement;
  const phaseEl = root.querySelector('#phase') as HTMLElement;
  const plotEl = root.querySelector('#plotcard') as HTMLElement;
  const pops = root.querySelector('#pops') as HTMLElement;
  const speedsEl = root.querySelector('#speeds') as HTMLElement;
  let tab: 'today' | 'grow' | 'crew' = 'today';
  const squad = new Set<string>();
  let objective: Objective = 'smash';
  const oddsMemo = new Map<string, number>();
  let lastTop = '', lastGoals = '', lastPhase = '', lastSpeeds = '', lastPlot = '';

  const hud: Hud = {
    inspected: null,
    muted: false,
    render(s, speed) {
      lastTop = set(top, topbar(s), lastTop);
      lastSpeeds = set(speedsEl, speeds(s, speed), lastSpeeds);
      lastGoals = set(goalsEl, goals(s), lastGoals);
      lastPhase = set(phaseEl, s.phase === 'prep' ? prepPanel(s) : s.phase === 'open' ? dayBar(s) : ledger(s), lastPhase);
      lastPlot = set(plotEl, hud.inspected && s.phase !== 'report' ? plotCard(s, hud.inspected) : '', lastPlot);
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
    toast(text) {
      const el = document.createElement('div');
      el.className = 'toast';
      el.innerHTML = `<div class="masthead">Bugle Extra!</div><div class="headline"></div>`;
      (el.querySelector('.headline') as HTMLElement).textContent = text;
      root.appendChild(el);
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches && /RANK UP|makeover/.test(text)) {
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
  };

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
      case 'campaign': onAction({ type: 'campaign', id: d.id as CampaignId }); break;
      case 'select': onAction({ type: 'select', plot: d.plot! }); break;
      case 'buyPlot': onAction({ type: 'buyPlot', plot: d.plot! }); break;
      case 'build': onAction({ type: 'build', plot: d.plot! }); break;
      case 'close-plot': onAction({ type: 'inspect', plot: null }); break;
      case 'view': onAction({ type: 'view', target: d.target as 'home' | 'bay' }); break;
      case 'tab': tab = d.tab as 'today' | 'grow' | 'crew'; lastPhase = ''; onAction({ type: 'refresh' }); break;
      case 'perimeter': case 'repairFence': case 'rebuild': case 'defend': onAction({ type: d.action, plot: d.plot! }); break;
      case 'gadget': onAction({ type: 'gadget', plot: d.plot!, id: d.id as GadgetId }); break;
      case 'hire': case 'fire': onAction({ type: d.action, id: d.id! }); break;
      case 'post': onAction({ type: 'post', id: d.id!, plot: d.plot || null }); break;
      case 'equip': onAction({ type: 'equip', id: d.id!, item: d.item as WeaponId | GearId }); break;
      case 'clubhouse': onAction({ type: 'clubhouse' }); break;
      case 'squad': if (squad.has(d.id!)) squad.delete(d.id!); else squad.add(d.id!); lastPlot = ''; onAction({ type: 'refresh' }); break;
      case 'objective': objective = d.value as Objective; lastPlot = ''; onAction({ type: 'refresh' }); break;
      case 'raid': onAction({ type: 'raid', plot: d.plot!, guards: [...squad], objective, when: d.when as 'now' | 'tonight' }); squad.clear(); break;
      case 'replay': onAction({ type: 'replay', index: Number(d.index) }); break;
      case 'facility': onAction({ type: 'facility', plot: d.plot!, kind: d.kind as FacilityKind }); break;
      case 'accept': case 'decline': onAction({ type: d.action, id: d.id! }); break;
      case 'truce': case 'factionBuyout': onAction({ type: d.action, rival: d.rival as RivalId }); break;
      case 'plotBuyout': onAction({ type: 'plotBuyout', plot: d.plot! }); break;
      case 'assault': onAction({ type: 'assault', rival: d.rival as RivalId, guards: [...squad] }); squad.clear(); break;
      case 'open': case 'skip': case 'sleep': case 'newgame': case 'upgrade': case 'brand': case 'restock': case 'mute':
        onAction({ type: d.action }); break;
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
      <div class="chip" title="Success Score = your net worth"><span class="badge">R${r.rank}</span><span class="hide-sm">${r.title} ·</span> <span data-testid="score">${whole(ss)}</span></div>
      <div class="chip hide-sm"><span class="label">Reputation</span>${stars(s.reputation)}</div>
      <div class="chip hide-sm" title="How hard rivals are coming for you: more lemons, more raids" data-testid="threat"><span class="label">Threat</span>${'🍋'.repeat(threatLevel(s))}</div>
      <div class="chip"><span class="label">${SEASON_LABEL[seasonOf(s.day)]} day ${seasonDay(s.day)}</span>${clock(s.minute)}</div>
      <div class="chip">${ICON[w.kind]} ${w.temp}°F</div>
      ${s.bottles || bottlingCapacity(s) ? `<div class="chip hide-sm" title="Bottles ready for big orders"><span class="label">Bottles</span>🍾 ${s.bottles.toLocaleString('en-US')}</div>` : ''}`;
  }

  function speeds(s: GameState, speed: number) {
    const views = `<button class="small ghost" data-action="view" data-target="home" title="Back to your stand">🏠</button><button class="small ghost" data-action="view" data-target="bay" title="Bay View">🗺️</button><button class="small ghost" data-action="mute" title="Music on/off">${hud.muted ? '🔇' : '🔊'}</button>`;
    if (s.phase !== 'open') return `<div class="chip speeds">${views}</div>`;
    const sb = (v: number, label: string) => `<button class="small ${speed === v ? 'on' : 'ghost'}" data-action="speed" data-value="${v}" title="Speed ${label} (keys: space, 1, 2, 3)">${label}</button>`;
    return `<div class="chip speeds">${views}${sb(0, '⏸')}${sb(1, '1×')}${sb(2, '2×')}${sb(3, '3×')}<button class="small ghost" data-action="skip" title="Finish the day instantly">⏭</button></div>`;
  }

  function goals(s: GameState) {
    return `<div class="card"><div class="card-title">👵 Lottie's Goals</div>${lottieGoals(s).map((g) => `
      <div class="goal ${g.done ? 'done' : ''}"><div>${g.done ? '✅' : '•'} ${g.text}</div>
      <div class="bar"><div style="width:${Math.round(g.progress * 100)}%"></div></div></div>`).join('')}</div>`;
  }

  function standPicker(s: GameState) {
    const stands = playerStands(s);
    if (stands.length < 2) return '';
    return `<div class="picker">${stands.map((p) => `<button class="small ${p.id === s.selected ? 'on' : 'ghost'}" data-action="select" data-plot="${p.id}">${esc(p.name)} · L${s.plots[p.id].stand!.level}</button>`).join('')}</div>`;
  }

  function prepPanel(s: GameState) {
    const tabs = `<div class="tabs"><button class="small ${tab === 'today' ? 'on' : 'ghost'}" data-action="tab" data-tab="today">Today</button><button class="small ${tab === 'grow' ? 'on' : 'ghost'}" data-action="tab" data-tab="grow" data-testid="tab-grow">Stand &amp; marketing</button><button class="small ${tab === 'crew' ? 'on' : 'ghost'}" data-action="tab" data-tab="crew" data-testid="tab-crew">Defense &amp; crew</button></div>`;
    const open = `<button class="big" data-action="open" data-testid="open">Open ${playerStands(s).length > 1 ? 'all stands' : ''} at ${clock(OPEN)} ☀️</button>`;
    const fights = lastNight(s) ? `<div class="bugle">${lastNight(s)}</div>` : '';
    if (tab === 'grow') return `<div class="panel" data-testid="prep">${tabs}${fights}${standPicker(s)}${growPanel(s)}${open}</div>`;
    if (tab === 'crew') return `<div class="panel" data-testid="prep">${tabs}${fights}${standPicker(s)}${defensePanel(s, s.selected)}${crewPanel(s)}${open}</div>`;
    const st = selectedStand(s);
    const sl = standLevel(st);
    const plotId = s.selected;
    const expiring = lemonsExpiringTomorrow(s, st);
    const supplyRows = (Object.keys(SUPPLIES) as SupplyId[]).map((id) => {
      const sp = SUPPLIES[id];
      const max = maxPacks(s, st, id);
      const note = id === 'ice' ? 'melts tonight' : id === 'lemons' ? (expiring ? `<span class="bad">${expiring} spoil tomorrow</span>` : 'keep 3 days') : 'keeps';
      return `<div class="row"><span class="name">${sp.label} <span class="muted">${stock(st, id)}/${sl.storage[id]} · ${note}</span></span>
        <button class="small" data-action="buy" data-id="${id}" data-packs="1" ${max < 1 ? 'disabled' : ''}
          title="${sp.pack} ${sp.unit} at ${cents(s.market[id])} each">+${sp.pack} · ${money(sp.pack * s.market[id])}</button>
        <button class="small ghost" data-action="buy" data-id="${id}" data-packs="${Math.max(1, max)}" ${max < 2 ? 'disabled' : ''} title="Fill up">Fill</button></div>`;
    }).join('');
    const restock = s.day >= AUTO_RESTOCK_DAY
      ? `<div class="row"><span class="name">Auto-Restock <span class="muted">(Lottie buys what this stand needs each morning)</span></span><button class="small ${st.autoRestock ? 'on' : 'ghost'}" data-action="restock">${st.autoRestock ? 'On' : 'Off'}</button></div>` : '';
    const cards = (Object.keys(RECIPES) as RecipeId[]).map((id) => {
      const r = RECIPES[id];
      return `<button class="recipe ${st.recipe === id ? 'on' : 'ghost'}" data-action="recipe" data-id="${id}"><b>${r.label}</b><span>${r.blurb}</span></button>`;
    }).join('');
    const sweets = (['less', 'classic', 'extra'] as Sweetness[]).map((v) =>
      `<button class="small ${st.sweetness === v ? 'on' : 'ghost'}" data-action="sweet" data-value="${v}">${v[0].toUpperCase() + v.slice(1)}</button>`).join('');
    const stop = averageStopChance(s, plotId, s.forecast);
    const people = expectedPassersby(s, plotId, s.forecast);
    const cups = expectedCups(s, plotId);
    const servings = servingsAvailable(st);
    const warn = servings === 0 && !st.autoRestock
      ? '<p class="warn">This stand can\'t make lemonade yet. Buy lemons and sugar.</p>'
      : !st.autoRestock && st.inventory.ice < RECIPES[st.recipe].icePerCup * Math.min(cups, servings) ? '<p class="warn">Not enough ice for the day. Warm lemonade makes people grumpy.</p>'
      : !st.autoRestock && servings < cups * 0.8 ? `<p class="warn">You might sell out: about ${cups} cups wanted, ${servings} in stock.</p>` : '';
    return `<div class="panel" data-testid="prep">${tabs}
      <div class="bugle"><div class="masthead">The Citrine Bay Bugle</div>
        <div class="dateline">${SEASON_LABEL[seasonOf(s.day)]}, day ${seasonDay(s.day)} · 5¢</div>
        <div class="headline">${headline(s)}</div>
        <div class="muted">Forecast: ${ICON[s.forecast.kind]} ${WEATHER[s.forecast.kind].label}, ${s.forecast.temp}°F (right about 4 days in 5)</div>
        ${s.today.lemonsSpoiled ? `<div class="bad">${s.today.lemonsSpoiled} lemons went bad overnight.</div>` : ''}
        ${lastNight(s)}
      </div>
      ${st.wrecked ? `<p class="warn">This stand was smashed. ${blockBtn('rebuild', `Rebuild for ${whole(rebuildCost(s.plots[plotId]))}`, s.cash >= rebuildCost(s.plots[plotId]) ? { ok: true } : { ok: false, why: 'Not enough cash' }, `data-plot="${plotId}"`)}</p>` : ''}
      ${orders(s)}
      ${standPicker(s)}
      <h3>Market for ${esc(PLOT_BY_ID[plotId].name)} (${sl.name})</h3>${supplyRows}${restock}
      <h3>Recipe</h3><div class="recipes">${cards}</div>
      <div class="row"><span class="name">Sweetness</span>${sweets}</div>
      <h3>Price per cup</h3>
      <div class="row"><span class="name muted">Costs you ${cents(costPerCup(s, st))} a cup</span>
        <button class="small ghost" data-action="price" data-delta="-0.05">−</button>
        <span class="val" data-testid="price">${cents(st.price)}</span>
        <button class="small ghost" data-action="price" data-delta="0.05">+</button></div>
      <div class="odds">About <b>${Math.round(stop * 100)}%</b> of the ~${Math.round(people)} people walking by should stop: roughly <b>${cups}</b> cups after nearby rivals take their share.</div>
      ${warn}
      ${open}
    </div>`;
  }

  function blockBtn(action: string, label: string, b: Blocker, extra = '') {
    return `<div class="act"><button class="small" data-action="${action}" ${extra} ${b.ok ? '' : 'disabled'}>${label}</button>${b.ok ? '' : `<div class="muted">${b.why}</div>`}</div>`;
  }

  function levelStats(l: StandLevel) {
    return `${l.capacityPerHour} cups/hour · draws ×${l.draw} traffic · top price ${money(l.topPrice)} · upkeep ${money(l.upkeep)}/day · holds ${l.storage.lemons} lemons`;
  }

  function growPanel(s: GameState) {
    const cur = standLevel(selectedStand(s));
    const next = STAND_LEVELS[cur.level];
    const brand = s.brandTier ? BRAND_TIERS[s.brandTier - 1] : null;
    const nextBrand = BRAND_TIERS[s.brandTier];
    const campaigns = (Object.keys(CAMPAIGNS) as CampaignId[]).map((id) => {
      const c = CAMPAIGNS[id];
      const cost = c.costPerDay ? money(c.costPerDay) : `${c.samples} free cups`;
      return `<div class="upgrade"><div><b>${c.name}</b> <span class="muted">(${cost})</span><div class="muted">${c.blurb}</div></div>
        ${blockBtn('campaign', 'Run', canRunCampaign(s, id), `data-id="${id}"`)}</div>`;
    }).join('');
    return `
      <h3>${esc(PLOT_BY_ID[s.selected].name)}: L${cur.level} ${cur.name}</h3>
      <div class="muted">${levelStats(cur)}</div>
      ${next ? `<div class="upgrade"><div><b>L${next.level} ${next.name}</b> · ${money(next.cost)}<div class="muted">${levelStats(next)}</div></div>
        ${blockBtn('upgrade', 'Upgrade', canUpgradeStand(s), 'data-testid="upgrade"')}</div>` : '<p>Top of the line. 🍋👑</p>'}
      <h3>Brand marketing (all stands, forever)</h3>
      <div class="muted">Now: ${brand ? `${brand.name}, +${Math.round(brand.traffic * 100)}% traffic` : 'nothing yet'} · this stand's traffic ×${marketingMultiplier(s, 'player', selectedStand(s)).toFixed(2)}</div>
      ${nextBrand ? `<div class="upgrade"><div><b>${nextBrand.name}</b> · ${money(nextBrand.cost)}<div class="muted">+${Math.round(nextBrand.traffic * 100)}% foot traffic at every stand</div></div>
        ${blockBtn('brand', 'Buy', canBuyBrand(s), 'data-testid="brand"')}</div>` : ''}
      <h3>Local campaigns (this stand)</h3>${campaigns}
      <p class="muted">Want another stand? Click an empty plot on the map (FOR SALE sign) to buy it.</p>`;
  }

  function plotCard(s: GameState, id: string) {
    const p = PLOT_BY_ID[id];
    const ps = s.plots[id];
    const d = DISTRICT_BY_ID[p.district];
    const st = ps.stand;
    const typeLabel = { street: 'Street plot', prime: 'Prime plot (traffic ×3)', landmark: 'Landmark (traffic ×5)', field: 'Field (open land)', dock: 'Dock (waterfront)', industrial: 'Industrial', hq: 'Headquarters', civic: 'Civic building' }[p.type];
    let actions = '';
    if (!ps.owner && p.type !== 'civic' && p.type !== 'hq') actions = blockBtn('buyPlot', `Buy for ${whole(plotPrice(s, id))}`, canBuyPlot(s, id), `data-plot="${id}" data-testid="buy-plot"`);
    else if (ps.owner === 'player' && isWrecked(ps)) actions = blockBtn('rebuild', `Rebuild for ${whole(rebuildCost(ps))}`, s.cash >= rebuildCost(ps) ? { ok: true } : { ok: false, why: 'Not enough cash' }, `data-plot="${id}"`) + '<div class="muted">Rebuild by tomorrow or the plot goes For Sale.</div>';
    else if (ps.owner === 'player' && !st) {
      const kind = facilityFor(p.type);
      const lvl = ps.facility?.level ?? 0;
      const fac = kind && lvl < 3 ? blockBtn('facility', `${lvl ? 'Upgrade to' : 'Build'} ${FACILITIES[kind].names[lvl]} (${whole(FACILITIES[kind].costs[lvl])})`, canBuildFacility(s, id, kind), `data-plot="${id}" data-kind="${kind}" data-testid="facility"`) + `<div class="muted">${FACILITIES[kind].blurb[lvl]}</div>` : '';
      const stand = p.type === 'field' || p.type === 'dock' || ps.facility ? '' : blockBtn('build', `Build a Folding Table (${whole(STAND_LEVELS[0].cost)})`, canBuildStand(s, id), `data-plot="${id}" data-testid="build"`);
      actions = stand + fac;
    }
    else if (ps.owner === 'player' && st) actions = id === s.selected ? '<div class="muted">Managing this stand in the panel.</div>' : `<button class="small" data-action="select" data-plot="${id}">Manage this stand</button>`;
    else if (ps.owner && ps.owner !== 'player' && p.type === 'hq') actions = hqPanel(s, ps.owner as RivalId);
    else if (ps.owner && ps.owner !== 'player') actions = (hasBuilding(ps) ? raidPlanner(s, id) : '') + (s.rank >= SITDOWN_RANK ? blockBtn('plotBuyout', `Buy it from them (${whole(plotBuyoutPrice(s, id))})`, canPlotBuyout(s, id), `data-plot="${id}" data-testid="plot-buyout"`) : '');
    const today = st && s.phase !== 'prep' ? `<div class="muted">Today: ${st.day.customers} cups sold of ${st.day.passersby} walking by</div>` : '';
    return `<div class="card" data-testid="plotcard">
      <div class="row"><b class="name">${esc(p.name)}</b><button class="small ghost" data-action="close-plot">✕</button></div>
      <div class="muted">${d.name} · ${typeLabel}</div>
      <div>Owner: <b>${ownerName(ps.owner)}</b></div>
      ${p.type !== 'civic' ? `<div class="muted">~${p.baseTraffic} passersby a day · land ${whole(ps.landValue)}</div>` : `<div class="muted">${d.feel}</div>`}
      ${ps.facility ? `<div>Built: <b>${FACILITIES[ps.facility.kind].names[ps.facility.level - 1]}</b>${ps.facility.wrecked ? ' · <span class="bad">WRECKED</span>' : ''}</div>` : ''}
      ${st ? `<div>Stand: L${st.level} ${standLevel(st).name} · ${cents(st.price)} a cup${st.wrecked ? ' · <span class="bad">WRECKED</span>' : ''}</div>` : ''}
      ${ps.owner && ps.owner !== 'player' && p.type !== 'civic' ? `<div class="muted">Defenses: ${ps.defense.tier ? PERIMETERS[ps.defense.tier - 1].name : 'none'}${ps.garrison ? ` · ${ps.garrison} henchmen on guard` : ''}</div>` : ''}
      ${ps.dibs?.who === 'player' && ps.dibs.until >= s.day ? `<div class="good">${ps.dibs.price !== undefined ? `Fire Sale! First Dibs at ${whole(ps.dibs.price)} through day ${ps.dibs.until}.` : 'You have First Dibs on this plot today!'}</div>` : ''}
      ${today}
      <div style="margin-top:6px">${actions}</div>
    </div>`;
  }

  function dayBar(s: GameState) {
    const pct = ((s.minute - OPEN) / (CLOSE - OPEN)) * 100;
    const w = s.today.walkedPast;
    const why = [['not thirsty', w.notThirsty], ['too pricey', w.pricey], ['line too long', w.line], ['sold out', w.soldOut], ['went to a rival', w.rival]]
      .filter(([, n]) => (n as number) > 0).map(([k, n]) => `${n} ${k}`).join(' · ');
    const left = playerStands(s).reduce((a, p) => a + servingsAvailable(s.plots[p.id].stand!), 0);
    return `<div class="daybar" data-testid="daybar">
      <div class="progress"><div style="width:${pct.toFixed(1)}%"></div></div>
      <span>Sold <b>${s.today.customers}</b></span>
      <span class="muted">${left} cups left</span>
      <span class="muted hide-sm">${why ? 'Walked past: ' + why : ''}</span>
    </div>`;
  }

  function ledger(s: GameState) {
    const t = s.history[s.history.length - 1] ?? s.today;
    const costs = t.supplies + t.cupCosts + t.upkeep + t.tax;
    const revenue = t.revenue;
    const profit = revenue - costs;
    const repDelta = t.reputationAfter - t.reputationBefore;
    const w = t.walkedPast;
    const ssDelta = successScore(s) - t.scoreBefore;
    const tip = w.soldOut > 10 ? `You turned away ${w.soldOut} thirsty people. Stock up more on days like this (or turn on Auto-Restock).`
      : w.rival > t.customers ? 'Rival stands nearby took a lot of your customers. Better prices or a bigger stand win them back.'
      : w.pricey > t.customers ? 'Lots of people said "too pricey". Kids especially watch their pennies.'
      : w.line > 10 ? 'The line got too long. A bigger stand serves more cups an hour.'
      : t.customers === 0 ? 'No sales today. Check your stock and price.'
      : t.iceMelted > 120 ? `${t.iceMelted} ice cubes melted tonight. Buy only what you need.`
      : 'Not bad, kiddo. Check tomorrow\'s Bugle before you buy.';
    const rows = playerStands(s).map((p) => {
      const d = s.plots[p.id].stand!.day;
      return `<tr><td class="muted">${esc(p.name)}</td><td class="muted">${d.customers} cups · ${money(d.revenue)}</td></tr>`;
    }).join('');
    return `<div class="modal-bg"><div class="modal ledger" data-testid="report">
      <h2>📒 The Ledger: day ${t.day}</h2>
      <div class="muted">${ICON[t.weather.kind]} ${WEATHER[t.weather.kind].label}, ${t.weather.temp}°F</div>
      <table>
        <tr><td>People walking by your stands</td><td>${t.passersby}</td></tr>
        <tr><td>Cups sold</td><td>${t.customers}</td></tr>
        ${playerStands(s).length > 1 ? rows : ''}
        <tr><td class="muted">Walked past: not thirsty / too pricey</td><td class="muted">${w.notThirsty} / ${w.pricey}</td></tr>
        <tr><td class="muted">Walked past: line / sold out / a rival</td><td class="${w.line + w.soldOut ? 'bad' : 'muted'}">${w.line} / ${w.soldOut} / ${w.rival}</td></tr>
        <tr><td>Sales</td><td class="good">${money(revenue)}</td></tr>
        <tr><td>Supplies, cups, upkeep, tax</td><td class="bad">${money(-costs)}</td></tr>
        <tr><td>Profit</td><td class="${profit >= 0 ? 'good' : 'bad'}">${money(profit)}</td></tr>
        ${t.land ? `<tr><td class="muted">Invested in land and stands</td><td class="muted">${money(t.land)}</td></tr>` : ''}
        <tr><td>Reputation</td><td>${stars(t.reputationAfter)} <span class="${repDelta >= 0 ? 'good' : 'bad'}">${repDelta >= 0 ? '+' : ''}${repDelta.toFixed(2)}</span></td></tr>
        <tr><td>Success Score</td><td>${whole(successScore(s))} <span class="${ssDelta >= 0 ? 'good' : 'bad'}">${ssDelta >= 0 ? '+' : ''}${ssDelta}</span></td></tr>
      </table>
      <p class="lottie">👵 ${tip}</p>
      ${tonight(s)}
      <button class="big" data-action="sleep" data-testid="next">Sleep till dawn 🌙</button>
      <div style="text-align:center;margin-top:8px"><button class="small ghost" data-action="newgame">New game</button></div>
    </div></div>`;
  }

  function orders(s: GameState) {
    const offers = s.offers.map((o) => `<div class="order"><div><b>${ORDER_TIERS[o.tier].label}:</b> ${esc(o.client)}<div class="muted">${o.qty.toLocaleString('en-US')} ${o.tier === 'local' ? 'cups' : 'bottles'} for <b>${whole(o.pay)}</b>, pickup day ${o.due}${o.tier === 'heli' || o.tier === 'ship' ? ` · +${'0.2'}★ if delivered` : ''}</div></div>
      <div class="acts"><button class="small" data-action="accept" data-id="${o.id}" data-testid="accept">Accept</button><button class="small ghost" data-action="decline" data-id="${o.id}">No thanks</button></div></div>`).join('');
    const need = bottlesNeeded(s);
    const active = s.orders.map((o) => `<div class="muted">📦 ${esc(o.client)}: ${o.qty.toLocaleString('en-US')} ${o.tier === 'local' ? 'cups' : 'bottles'}, ${whole(o.pay)}, pickup day ${o.due}${o.due === s.day ? ' (today!)' : ''}</div>`).join('');
    const short = need > s.bottles ? `<div class="${need - s.bottles > bottlingCapacity(s) * Math.max(1, Math.min(...s.orders.filter((o) => o.tier !== 'local').map((o) => o.due - s.day))) ? 'bad' : 'muted'}">Bottles: ${s.bottles.toLocaleString('en-US')} of ${need.toLocaleString('en-US')} ready (${bottlingCapacity(s).toLocaleString('en-US')} a day bottled overnight)</div>` : '';
    const locked = (Object.keys(ORDER_TIERS) as OrderTier[]).map((t) => ({ t, b: tierOpen(s, t) })).filter((x) => !x.b.ok);
    const hint = locked.length && s.rank >= 2 && !offers && !active ? `<div class="muted">Big orders: ${locked.slice(0, 2).map((x) => `${ORDER_TIERS[x.t].label}s need ${x.b.ok ? '' : x.b.why}`).join('; ')}.</div>` : '';
    if (!offers && !active && !hint) return '';
    return `<div class="orders" data-testid="orders"><h3>Big orders</h3>${offers}${active}${short}${hint}</div>`;
  }

  function lastNight(s: GameState) {
    const fights = s.battles.map((b, i) => ({ b, i })).filter(({ b }) => b.day === s.day - 1 || b.day === s.day);
    if (!fights.length) return '';
    return fights.map(({ b, i }) => {
      const good = (b.attacker === 'player') === (b.outcome === 'smashed' || b.outcome === 'robbed');
      return `<div class="${good ? 'good' : 'bad'} fight">${b.attacker === 'player' ? '⚔️' : '🛡️'} ${esc(fightLine(b))} <button class="small ghost" data-action="replay" data-index="${i}" data-testid="replay">▶ Watch</button></div>`;
    }).join('');
  }

  function fightLine(b: GameState['battles'][number]) {
    const where = PLOT_BY_ID[b.target].name;
    const who = (f: string) => (f === 'player' ? "Lottie's crew" : FACTIONS[f as RivalId].name);
    const verb = { smashed: 'smashed', robbed: `robbed (${whole(b.loot)})`, damaged: 'roughed up', repelled: 'held' }[b.outcome];
    if (b.hq) return b.outcome === 'repelled' ? `HQ assault on ${where}: stalled at the ${b.hq}` : `HQ assault on ${where}: captured!`;
    return b.attacker === 'player' ? `Your raid on ${where}: ${b.outcome === 'repelled' ? 'beaten back' : verb}` : `${who(b.attacker)} hit ${where}: ${b.outcome === 'repelled' ? 'you held them off!' : verb}`;
  }

  function tonight(s: GameState) {
    const incoming = incomingRaids(s);
    const mine = s.raids.filter((r) => r.attacker === 'player');
    if (!incoming.length && !mine.length) return '';
    const warn = incoming.map((r) => {
      const ps = s.plots[r.target];
      const where = esc(PLOT_BY_ID[r.target].name);
      const head = r.detected
        ? `⚠️ <b>${FACTIONS[r.attacker as RivalId].name}</b> are heading for <b>${where}</b> tonight, ETA ${r.eta}: ${r.party!.length} henchmen (${[...new Set(r.party!.map((f) => WEAPONS[f.weapon].name.toLowerCase()))].join(', ')}).`
        : `⚠️ Lottie hears footsteps: someone is planning a raid on <b>${where}</b> tonight. More alarms would tell you who.`;
      const guards = s.guards.filter((g) => g.post === r.target && guardReady(s, g)).length;
      const fence = ps.defense.tier ? `${PERIMETERS[ps.defense.tier - 1].name} (${ps.defense.fenceHp} HP)` : 'no fence';
      const next = PERIMETERS[ps.defense.tier];
      const buy = next ? blockBtn('perimeter', `Put up a ${next.name} (${whole(next.cost)})`, canBuyPerimeter(s, r.target), `data-plot="${r.target}"`) : '';
      const repair = fenceRepairCost(ps) ? `<button class="small" data-action="repairFence" data-plot="${r.target}">Patch fence (${whole(fenceRepairCost(ps))})</button>` : '';
      const station = s.guards.length && guards < s.guards.filter((g) => guardReady(s, g)).length ? `<button class="small" data-action="defend" data-plot="${r.target}">Send all guards here</button>` : '';
      return `<div class="raidwarn" data-testid="raid-warning">${head}<div class="muted">Defending: ${guards} guard${guards === 1 ? '' : 's'}, ${fence}.</div><div class="acts">${buy}${repair}${station}</div></div>`;
    }).join('');
    const out = mine.map((r) => `<div class="muted">⚔️ Your crew raids ${esc(PLOT_BY_ID[r.target].name)} tonight (${r.guards!.length} guard${r.guards!.length === 1 ? '' : 's'}, ${r.objective}).</div>`).join('');
    return `<div class="tonight">${warn}${out}</div>`;
  }

  function defensePanel(s: GameState, id: string) {
    const ps = s.plots[id];
    const cur = ps.defense.tier ? PERIMETERS[ps.defense.tier - 1] : null;
    const next = PERIMETERS[ps.defense.tier];
    const slots = GADGET_SLOTS(ps.stand?.level ?? 1);
    const gadgets = (Object.keys(GADGETS) as GadgetId[]).map((g) => {
      const gd = GADGETS[g];
      if (ps.defense.gadgets.includes(g)) return `<div class="upgrade"><div><b>${gd.name}</b> ✅<div class="muted">${gd.text}</div></div></div>`;
      return `<div class="upgrade"><div><b>${gd.name}</b> · ${whole(gd.cost)}<div class="muted">${gd.text}</div></div>${blockBtn('gadget', 'Install', canBuyGadget(s, id, g), `data-plot="${id}" data-id="${g}"`)}</div>`;
    }).join('');
    const posted = s.guards.filter((g) => g.post === id);
    return `<h3>Defenses at ${esc(PLOT_BY_ID[id].name)}</h3>
      <div class="muted">Fence: ${cur ? `${cur.name}, ${ps.defense.fenceHp}/${cur.hp} HP` : 'none'} · guards posted: ${posted.length ? posted.map((g) => esc(g.name)).join(', ') : 'none'}</div>
      ${fenceRepairCost(ps) ? `<div class="act"><button class="small" data-action="repairFence" data-plot="${id}">Patch the fence (${whole(fenceRepairCost(ps))})</button></div>` : ''}
      ${next ? `<div class="upgrade"><div><b>P${next.tier} ${next.name}</b> · ${whole(next.cost)}<div class="muted">${next.hp} HP${next.breachDps ? `, hurts attackers while they break through` : ''}${next.slow ? ', slows them down' : ''}. Defenders hit 25% harder while it stands.</div></div>
        ${blockBtn('perimeter', ps.defense.tier ? 'Replace' : 'Build', canBuyPerimeter(s, id), `data-plot="${id}" data-testid="perimeter"`)}</div>` : ''}
      <h3>Gadgets <span class="muted">(${ps.defense.gadgets.length}/${slots} slots)</span></h3>${gadgets}`;
  }

  function guardRow(s: GameState, g: Guard) {
    const stands = PLOTS.filter((p) => s.plots[p.id].owner === 'player' && (s.plots[p.id].stand || s.plots[p.id].facility));
    const i = g.post ? stands.findIndex((p) => p.id === g.post) : -1;
    const nextPost = stands[(i + 1) % stands.length];
    const nextWeapon = (['clubs', 'hatchets'] as WeaponId[]).find((w) => WEAPONS[w].hit > WEAPONS[g.weapon].hit);
    const nextGear = (['vest', 'pro'] as GearId[]).find((x) => GEAR[x].hp > GEAR[g.gear].hp);
    const status = guardReady(s, g) ? '' : ` · <span class="bad">knocked out till day ${g.outUntil}</span>`;
    return `<div class="guard" data-testid="guard">
      <div><b>${esc(g.name)}</b> <span class="muted">L${g.level} ${guardTitle(g)} · ${g.trait} · ${WEAPONS[g.weapon].name}${g.gear !== 'none' ? ', ' + GEAR[g.gear].name : ''} · ${whole(guardWage(g))}/day${status}</span></div>
      <div class="acts">
        <button class="small ghost" data-action="post" data-id="${g.id}" data-plot="${nextPost?.id ?? ''}" title="Change post">📍 ${g.post ? esc(PLOT_BY_ID[g.post].name) : 'Clubhouse'}</button>
        ${nextWeapon ? blockBtn('equip', `${WEAPONS[nextWeapon].name} (${whole(WEAPONS[nextWeapon].cost)})`, canEquip(s, g.id, nextWeapon), `data-id="${g.id}" data-item="${nextWeapon}"`) : ''}
        ${nextGear ? blockBtn('equip', `${GEAR[nextGear].name} (${whole(GEAR[nextGear].cost)})`, canEquip(s, g.id, nextGear), `data-id="${g.id}" data-item="${nextGear}"`) : ''}
        ${g.name === 'Dex Moody' ? '' : `<button class="small ghost" data-action="fire" data-id="${g.id}" title="Let them go">✕</button>`}
      </div></div>`;
  }

  function crewPanel(s: GameState) {
    if (s.rank < HIRE_RANK) return `<h3>Crew</h3><p class="muted">Guards come at Rank ${HIRE_RANK}, ${rankFor(0).next?.title ?? ''}. Until then, a Picket Fence keeps the riff-raff out.</p>`;
    const club = CLUBHOUSE[s.clubhouse];
    const recruits = s.recruits.map((g) => `<div class="guard"><div><b>${esc(g.name)}</b> <span class="muted">L${g.level} ${guardTitle(g)} · ${g.trait} · ${whole(guardWage(g))}/day</span></div>
      ${blockBtn('hire', `Hire (${whole(g.fee)})`, canHire(s, g.id), `data-id="${g.id}" data-testid="hire"`)}</div>`).join('');
    return `<h3>Your crew <span class="muted">(${s.guards.length}/${rosterCap(s)} · wages ${whole(s.guards.reduce((a, g) => a + guardWage(g), 0))}/day)</span></h3>
      ${s.guards.map((g) => guardRow(s, g)).join('') || '<p class="muted">No guards yet.</p>'}
      ${club ? `<div class="upgrade"><div><b>Clubhouse L${club.level}</b> · ${whole(club.cost)}<div class="muted">Beds for ${club.beds} guards${s.clubhouse ? ` (now ${clubhouseBeds(s)})` : ''}</div></div>${blockBtn('clubhouse', s.clubhouse ? 'Expand' : 'Build', canBuildClubhouse(s))}</div>` : ''}
      <h3>The Hiring Hall <span class="muted">(new faces every week)</span></h3>${recruits || '<p class="muted">Nobody looking for work this week.</p>'}
      <p class="muted">${s.rank >= RAID_RANK ? 'To raid a rival, click their stand on the map.' : `Raids unlock at Rank ${RAID_RANK}.`}</p>`;
  }

  function squadPicker(s: GameState) {
    const crew = availableRaiders(s);
    for (const g of [...squad]) if (!crew.some((c) => c.id === g)) squad.delete(g);
    return `<div class="acts">${crew.map((g) => `<button class="small ${squad.has(g.id) ? 'on' : 'ghost'}" data-action="squad" data-id="${g.id}">${esc(g.name.split(' ')[0])} · ${WEAPONS[g.weapon].name}</button>`).join('')}</div>`;
  }

  /** A rival's HQ: Dot's Diner sit-downs and the assault. */
  function hqPanel(s: GameState, id: RivalId) {
    const st = rivalStatus(s, id);
    const hq = HQS[id];
    const price = factionBuyoutPrice(s, id);
    const head = `<div class="muted">${st.plots} plots (peak ${st.peak}) · worth about ${whole(st.worth)}${st.weakened ? ' · <span class="good">Weakened</span>' : ''}${st.truce ? ` · truce through day ${st.truce}` : ''}</div>`;
    if (s.rank < SITDOWN_RANK) return head + `<div class="muted">Sit-downs at Dot's Diner open at Rank ${SITDOWN_RANK}.</div>`;
    const sit = `<b>Sit-down at Dot's Diner</b>
      ${blockBtn('truce', `Truce for 7 days (${whole(truceCost(s))} tribute)`, canTruce(s, id), `data-rival="${id}" data-testid="truce"`)}
      ${blockBtn('factionBuyout', price === null ? 'Buy them out' : `Buy them out (${whole(price)})`, canFactionBuyout(s, id), `data-rival="${id}" data-testid="faction-buyout"`)}`;
    const ids = [...squad];
    const assault = `<div class="planner" data-testid="hq-assault"><b>Storm the HQ</b> <span class="muted">(Gate ${hq.gate.toLocaleString('en-US')} HP, the Yard, then ${esc(hq.boss)} and their "${hq.move}" · squad ${ids.length}/${SQUAD_CAP(s.rank)})</span>
      ${squadPicker(s)}
      ${blockBtn('assault', 'Storm it now', canAssault(s, id, ids), `data-rival="${id}" data-testid="assault"`)}</div>`;
    return head + sit + assault;
  }

  function raidPlanner(s: GameState, id: string) {
    if (s.rank < RAID_RANK) return `<div class="muted">Raids unlock at Rank ${RAID_RANK}.</div>`;
    const crew = availableRaiders(s);
    for (const g of [...squad]) if (!crew.some((c) => c.id === g)) squad.delete(g);
    if (!crew.length) return '<div class="muted">No guards free to raid.</div>';
    const ids = [...squad];
    const odds = (night: boolean) => {
      const ps = s.plots[id];
      const key = JSON.stringify([s.day, s.phase === 'open', id, ids, objective, night, ps.defense, ps.garrison, s.guards.map((g) => [g.id, g.weapon, g.gear, g.level])]);
      let v = oddsMemo.get(key);
      if (v === undefined) { v = raidOdds(s, id, ids, objective, night); if (oddsMemo.size > 200) oddsMemo.clear(); oddsMemo.set(key, v); }
      return v;
    };
    const night = odds(true);
    const day = odds(false);
    const can = canRaid(s, id, ids);
    return `<div class="planner" data-testid="raid-planner"><b>Raid Planner</b> <span class="muted">(squad ${ids.length}/${SQUAD_CAP(s.rank)})</span>
      ${squadPicker(s)}
      <div class="acts"><button class="small ${objective === 'smash' ? 'on' : 'ghost'}" data-action="objective" data-value="smash">Smash</button><button class="small ${objective === 'shakedown' ? 'on' : 'ghost'}" data-action="objective" data-value="shakedown">Shakedown</button></div>
      <div class="muted">${objective === 'smash' ? 'Wreck it. If they can\'t rebuild, you get First Dibs on the land.' : 'Grab about a day\'s takings from the till.'}</div>
      ${inTruce(s, s.plots[id].owner as RivalId) ? `<div class="bad">You have a truce with them: raiding breaks it (−1★, and every rival holds a grudge).</div>` : ''}
      <div class="acts">${blockBtn('raid', `Tonight · ${Math.round(night * 100)}% win`, can, `data-plot="${id}" data-when="tonight" data-testid="raid-tonight"`)}
      ${blockBtn('raid', `Now · ${Math.round(day * 100)}% · −${objective === 'smash' ? '0.2' : '0.1'}★`, can, `data-plot="${id}" data-when="now" data-testid="raid-now"`)}</div></div>`;
  }

  return hud;
}
