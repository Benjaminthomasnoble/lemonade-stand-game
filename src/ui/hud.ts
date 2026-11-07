// The HUD in the Kitchen-Table Clay look (spec: Player experience, "Show, don't
// tell"): four props along the top, one goal sticky note, a wooden morning dock,
// a day's-end card and picture-card sheets for Grow and Defend. Words are kept
// to a few per line; exact numbers live in title tooltips (hover or long-press).
// Buttons carry data-action and go through one listener.
import {
  AUTO_RESTOCK_DAY, averageStopChance, BRAND_TIERS, CAMPAIGNS, canBuildStand, canBuyBrand, canBuyPlot, canRunCampaign,
  canUpgradeStand, CLOSE, costPerCup, DISTRICT_BY_ID, expectedCups, expectedPassersby, FACTIONS, lemonsExpiringTomorrow,
  lottieGoals, maxPacks, OPEN, PLOT_BY_ID, playerStands, RECIPES, seasonDay, seasonOf,
  selectedStand, servingsAvailable, STAND_LEVELS, standLevel, stock, successScore, SUPPLIES, WEATHER,
  availableRaiders, canBuildClubhouse, canBuyGadget, canBuyPerimeter, canEquip, canHire, canRaid, CLUBHOUSE, clubhouseBeds,
  fenceRepairCost, GADGET_SLOTS, GADGETS, GEAR, guardReady, guardTitle, guardWage, PERIMETERS, raidOdds,
  RAID_RANK, rebuildCost, rosterCap, SQUAD_CAP, threatLevel, WEAPONS, HIRE_RANK,
  type GadgetId, type GearId, type Guard, type Objective, type WeaponId,
  bottlesNeeded, canBuildFacility, DEAL_LOADS, dealShortfallPerDay, FACILITIES, facilitiesFor, ORDER_TIERS, PLOTS,
  type FacilityKind, RANKS, rebuildChance,
  canAssault, canFactionBuyout, canPlotBuyout, canTruce, factionBuyoutPrice, hasBuilding, HQS, inTruce, isWrecked, plotBuyoutPrice,
  plotPrice, rivalStatus, SITDOWN_RANK, truceCost,
  actName, actOf, canBorrow, cookieJarReady, DIFFICULTY, difficulty, districtControl, dominationProgress, ENDINGS, everyLastPlot,
  isEndless, loanLimit, loanPayment, MAJORITY, MODES, redDaysLeft, winCondition, deliveryRaidRisk, raidPauses,
  type Difficulty, type Mode, type Settings, type WinCondition,
  type Blocker, type CampaignId, type GameState, type RecipeId, type RivalId, type StandLevel, type SupplyId, type Sweetness,
  tasteOffToday, type FestivalId,
} from '../sim/economy.ts';
import type { ScoreEntry, SlotInfo, Slots } from '../save.ts';
import { DEFAULT_OPTIONS, type Options } from '../settings.ts';
import * as A from './clay.ts';
import { alertCards } from './alerts.ts';
import { damageCard, damageHere, damageTickets } from './damage.ts';
import { eveningBar, fenceHere, guardsHere, repairCards } from './evening.ts';
import { schemeNote, schemeTickets } from './schemes.ts';
import { optionsScreen } from './options.ts';
import { recipeRow } from './recipes.ts';
import { calendarHeadline, calendarTickets, tasteOffLine, worldAction, worldSheet, worldTabs, type WorldTab } from './calendar.ts';
import { tripLines, tripNote } from './trips.ts';
import { dawnPicks, savesPanel } from './saves.ts';

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
  | { type: 'repair'; plot: string } // approve a Damaged building's repair
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
  | { type: 'setup' } // open the New Game screen
  | { type: 'start'; settings: Settings }
  | { type: 'cancelSetup' }
  | { type: 'keepSqueezing' }
  | { type: 'reloadDawn'; slot?: number } // a lost run back to a dawn: its newest, or the slot picked
  | { type: 'saveSlot'; slot: number } // Options: save to a manual slot
  | { type: 'loadSlot'; slot: number; dawn?: boolean } // Options: load a manual slot or a dawn autosave
  | { type: 'borrow'; amount: number }
  | { type: 'repay' }
  | { type: 'night' } // the Evening ends: the night runs on the clock
  | { type: 'evening' } // fold the Ledger: the Evening goes on, on the live map
  | { type: 'ledger' } // unfold the Ledger again
  | { type: 'goto'; plot: string } // an alert card's Go There
  | { type: 'dismiss'; id: string } // put an alert card away
  | { type: 'restockNow'; plot: string } // a sold-out card's one action
  | { type: 'watch'; id: string } // a VIP card's Watch: fly there and play the arrival
  | { type: 'options' } // open or close the Options screen
  | { type: 'option'; key: string; value?: string } // flip an option
  | { type: 'entry'; recipe?: RecipeId; sweetness?: Sweetness; delta?: number } // Taste-Off entry
  | { type: 'sponsor'; festival: FestivalId }
  | { type: 'refresh' };

const money = (n: number) => (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const whole = (n: number) => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US');
const cents = (n: number) => (n < 1 ? `${Math.round(n * 100)}¢` : money(n));
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

function clock(min: number) {
  const h = Math.floor(min / 60) % 24, mm = min % 60;
  return `${((h + 11) % 12) + 1}:${String(mm).padStart(2, '0')}${h < 12 ? 'am' : 'pm'}`;
}

function headline(s: GameState): [string, string] {
  if (s.day === 1) return ["SCHOOL'S OUT!", 'Grandkid opens on Maple Row'];
  const cal = calendarHeadline(s); if (cal) return cal;
  const pool: Record<string, [string, string][]> = {
    scorcher: [['SIZZLER!', 'Hot enough to fry an egg'], ['SCORCHER!', 'Town begs for shade']],
    hot: [['HOT ONE!', 'Thirsty town expected'], ["SUN'S OUT!", 'Cups out']],
    warm: [['PERFECT DAY!', 'Lemonade weather, says Lottie'], ['NICE ONE!', 'Strollers on Maple Row']],
    cloudy: [['GRAY SKIES', 'Cool heads, cool cups'], ['CLOUDY', 'Thirst rolls out']],
    rainy: [['PUDDLES!', 'Umbrellas outsell lemonade'], ['RAIN, RAIN', 'Go away, says every stand']],
    storm: [['STORM!', 'Batten down the tables'], ['THUNDER!', 'Over Citrine Bay']],
  };
  const list = pool[s.forecast.kind];
  return list[s.day % list.length];
}

// Every prop is drawn once and reused, so renders compare equal and nothing flickers.
const ART = (() => {
  const once = <T extends unknown[]>(f: (...a: T) => string) => { const m = new Map<string, string>(); return (...a: T) => { const k = JSON.stringify(a); if (!m.has(k)) m.set(k, f(...a)); return m.get(k)!; }; };
  return {
    jar: once(A.jarSVG), rosette: once(A.rosetteSVG), egg: once(A.eggSVG), sky: once(A.skySVG), lottie: once(A.lottieDoodle),
    pitcher: once(A.pitcherSVG), cube: once(A.cubeSVG), bowl: once(A.bowlSVG), bag: once(A.bagSVG), tray: once(A.traySVG),
    head: once((i: number) => { const h = [['#E3A27A', '#3BB4C1'], ['#F6C9A0', '#E8704F'], ['#8A5638', '#F7C948'], ['#F8D3B0', '#7CC47F'], ['#B9784F', '#F4A3B5']][i]; return A.svg(A.headBlob(32, 26, 15, h[0], h[1])); }),
    coin: once(A.coinSVG), cup: once(A.cupSVG), empty: once(A.emptySVG), star: once(A.starSVG), moon: once(A.moonSVG),
    shield: once(A.shieldSVG), fist: once(A.fistSVG), club: once(A.clubSVG), hatchet: once(A.hatchetSVG), raid: once(A.raidSVG),
    goose: once(A.gooseSVG), can: once(A.canSVG), peel: once(A.peelSVG), sprinkler: once(A.sprinklerSVG), lamp: once(A.lampSVG), tower: once(A.towerSVG),
    fence: once(A.fenceSVG), stand: once(A.standSVG), megaphone: once(A.megaphoneSVG), board: once(A.boardSVG), sample: once(A.heartCupSVG),
    piggy: once(A.piggySVG), boom: once(A.boomSVG), moneyBag: once(A.moneyBagSVG), crate: once(A.crateSVG), house: once(A.houseSVG),
    bandage: once(A.bandageSVG), foot: once(A.footSVG), sour: once(A.lemonSourSVG), face: once(A.faceSVG), lemon: once(A.lemonSVG),
  };
})();
const SWEET: Sweetness[] = ['less', 'classic', 'extra'];
const GADGET_ART: Record<GadgetId, () => string> = { alarm: ART.can, goose: ART.goose, slick: ART.peel, sprinkler: ART.sprinkler, floodlights: ART.lamp, watchtower: ART.tower };
const WEAPON_ART: Record<WeaponId, () => string> = { fists: ART.fist, clubs: ART.club, hatchets: ART.hatchet };
const tape = (inner: string, cls = '') => `<span class="cl-tape ${cls}">${inner}</span>`;
/** A locked thing stays hidden (rule 6: no greyed "Needs Rank 4" rows). */
const locked = (b: Blocker) => !b.ok && /Rank \d/.test(b.why);
const pips = (n: number, of: number) => `<span class="cl-pips">${Array.from({ length: of }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`;
const meter = (v: number, cls = '') => `<span class="cl-snake ${cls}" style="--v:${Math.max(0, Math.min(1, v)).toFixed(3)}"><i></i></span>`;
const ownerName = (o: string | null) => (o === 'player' ? "Lottie's (you)" : o ? FACTIONS[o as RivalId].name : 'For sale');
const ownerColor = (o: string | null) => (o === 'player' ? '#F7C948' : o ? hex(FACTIONS[o as RivalId].color) : '#FFF1D6');

export interface Hud {
  render(s: GameState, speed: number): void;
  popup(x: number, y: number, text: string, kind: 'sale' | 'miss'): void;
  /** A coin arcs from a sale up to the cash jar; `onLand` fires as it lands. */
  coin(x: number, y: number, size: 1 | 2 | 3, onLand?: () => void): void;
  /** A headline slapped on like tape, with confetti for rank-ups and upgrades. */
  toast(text: string): void;
  inspected: string | null;
  muted: boolean;
  /** The New Game screen: what's picked so far, and whether there's a game to go back to. */
  setup: { settings: Settings; cancel: boolean } | null;
  leaderboard: ScoreEntry[];
  /** A lost run can reload its last dawn (never in Ironman). */
  canReload: boolean;
  /** That run's dawns, newest first (the older ones are offered too), and what every save slot holds. */
  dawns: { slot: number; info: SlotInfo }[];
  slots: Slots;
  /** The player's options (src/settings.ts), and whether the Options screen is open. */
  options: Options;
  optionsOpen: boolean;
  /** The Evening's Ledger card is up (full-screen paper: the Evening holds while it is). */
  ledger: boolean;
  /** A brawl or a VIP show is on screen: pause stays at hand (it holds them too). */
  playing: boolean;
}

export function createHud(root: HTMLElement, onAction: (a: Action) => void): Hud {
  root.classList.add('clay');
  root.innerHTML = `<div class="cl-lens" aria-hidden="true"><i class="t"></i><i class="b"></i><i class="v"></i></div>
    <div id="top"></div><div id="dawn"></div><div id="feed"></div><div id="phase"></div><div id="plotcard"></div><div id="corner"></div><div id="pops"></div>`;
  const q = (id: string) => root.querySelector('#' + id) as HTMLElement;
  const topEl = q('top'), dawnEl = q('dawn'), feedEl = q('feed'), phaseEl = q('phase'), plotEl = q('plotcard'), cornerEl = q('corner'), pops = q('pops');
  let tab: 'today' | 'grow' | 'crew' | WorldTab = 'today';
  let goalsOpen = false, books = false, moreOpts = false;
  let ledgerDay = -1; // each Evening opens on its Ledger
  const squad = new Set<string>();
  let objective: Objective = 'smash';
  const oddsMemo = new Map<string, number>();
  const last = new Map<HTMLElement, string>();
  const set = (el: HTMLElement, html: string) => { if (last.get(el) !== html) { el.innerHTML = html; last.set(el, html); } };
  const redraw = () => onAction({ type: 'refresh' });

  const hud: Hud = {
    inspected: null,
    muted: false,
    setup: null,
    leaderboard: [],
    canReload: false,
    dawns: [],
    slots: { dawn: [], manual: [] },
    options: { ...DEFAULT_OPTIONS, pause: { ...DEFAULT_OPTIONS.pause } },
    optionsOpen: false,
    ledger: true,
    playing: false,
    render(s, speed) {
      if (s.phase === 'report' && ledgerDay !== s.day) { ledgerDay = s.day; hud.ledger = true; }
      const modal = hud.setup ? setupScreen(hud.setup.settings, hud.setup.cancel) : hud.optionsOpen ? optionsScreen(hud.options, s, savesPanel(s, hud.slots)) : outcomeScreen(s);
      root.toggleAttribute('data-night', s.phase === 'report' || s.phase === 'night');
      if (root.dataset.text !== String(hud.options.textSize)) root.dataset.text = String(hud.options.textSize);
      root.toggleAttribute('data-calm', hud.options.reducedMotion);
      set(topEl, modal && hud.setup ? '' : topbar(s));
      set(dawnEl, !modal && s.phase === 'prep' ? `<div class="cl-toast cl-dawn" role="status" data-day="${s.day}">${tape(headline(s)[0], 'cl-big')}${tape(headline(s)[1], 'cl-sub')}</div>` : '');
      set(feedEl, modal ? '' : feed(s));
      set(cornerEl, corner(s, speed));
      set(phaseEl, modal || (s.phase === 'prep' ? prepPanel(s) : s.phase === 'open' ? dayBar(s) : s.phase === 'report' ? (hud.ledger ? dayEnd(s) : eveningBar()) : ''));
      set(plotEl, hud.inspected && !(s.phase === 'report' && hud.ledger) && !modal ? plotCard(s, hud.inspected) : '');
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
    coin(x, y, size, onLand) {
      const cash = topEl.querySelector('[data-testid="cash"]') as HTMLElement | null;
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches || hud.options.reducedMotion;
      if (!cash || reduce) { onLand?.(); return; }
      const r = cash.getBoundingClientRect();
      const box = root.getBoundingClientRect();
      const tx = r.left - box.left + r.width / 2, ty = r.top - box.top + r.height / 2;
      const el = document.createElement('div');
      el.className = `coin c${size}`;
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      pops.appendChild(el);
      const dx = tx - x, dy = ty - y;
      // Pop up first, then swing over to the cash jar.
      const anim = el.animate([
        { transform: 'translate(-50%, -50%) scale(0.4)', offset: 0 },
        { transform: `translate(calc(-50% + ${dx * 0.15}px), calc(-50% - 50px)) scale(1.15)`, offset: 0.25 },
        { transform: `translate(calc(-50% + ${dx * 0.6}px), calc(-50% + ${dy * 0.45 - 40}px)) scale(1)`, offset: 0.6 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.55)`, offset: 1 },
      ], { duration: 750, easing: 'cubic-bezier(.3,.1,.5,1)' });
      anim.onfinish = () => {
        el.remove();
        cash.classList.remove('bump');
        void cash.offsetWidth; // restart the bump
        cash.classList.add('bump');
        onLand?.();
      };
    },
    toast(text) {
      const el = document.createElement('div');
      el.className = 'cl-toast';
      el.setAttribute('role', 'status');
      el.innerHTML = tape('', 'cl-big');
      (el.querySelector('.cl-big') as HTMLElement).textContent = text;
      root.appendChild(el);
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches && !hud.options.reducedMotion && /RANK UP|makeover/.test(text)) {
        const bits = [ART.lemon(), ART.star(true), ART.coin()];
        for (let i = 0; i < 36; i++) {
          const c = document.createElement('div');
          c.className = 'confetti';
          c.innerHTML = bits[i % 3];
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

  // ---------- input: one click listener, plus long-press to fill up ----------
  let held: number | undefined, heldFired = false;
  root.addEventListener('pointerdown', (e) => {
    const el = (e.target as HTMLElement).closest('[data-fill-packs]') as HTMLElement | null;
    heldFired = false;
    if (!el) return;
    held = window.setTimeout(() => { heldFired = true; onAction({ type: 'buy', id: el.dataset.id as SupplyId, packs: Number(el.dataset.fillPacks) }); }, 450);
  });
  const cancelHold = () => { clearTimeout(held); };
  root.addEventListener('pointerup', cancelHold);
  root.addEventListener('pointerleave', cancelHold);
  root.addEventListener('contextmenu', (e) => { if ((e.target as HTMLElement).closest('[data-fill-packs]')) e.preventDefault(); });

  root.addEventListener('click', (e) => {
    if (heldFired) { heldFired = false; return; }
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
      case 'tab': tab = (tab === d.tab && d.tab !== 'today' ? 'today' : d.tab) as typeof tab; redraw(); break;
      case 'goals': goalsOpen = !goalsOpen; redraw(); break;
      case 'books': books = !books; redraw(); break;
      case 'more': moreOpts = !moreOpts; redraw(); break;
      case 'perimeter': case 'repairFence': case 'rebuild': case 'defend': onAction({ type: d.action, plot: d.plot! }); break;
      case 'gadget': onAction({ type: 'gadget', plot: d.plot!, id: d.id as GadgetId }); break;
      case 'repair': onAction({ type: 'repair', plot: d.plot! }); break;
      case 'hire': case 'fire': onAction({ type: d.action, id: d.id! }); break;
      case 'post': onAction({ type: 'post', id: d.id!, plot: d.plot || null }); break;
      case 'equip': onAction({ type: 'equip', id: d.id!, item: d.item as WeaponId | GearId }); break;
      case 'clubhouse': onAction({ type: 'clubhouse' }); break;
      case 'squad': if (squad.has(d.id!)) squad.delete(d.id!); else squad.add(d.id!); redraw(); break;
      case 'squadAll': { const ids = (d.ids ?? '').split(',').filter(Boolean); const all = ids.every((i) => squad.has(i)); for (const i of ids) { if (all) squad.delete(i); else squad.add(i); } redraw(); break; }
      case 'objective': objective = d.value as Objective; redraw(); break;
      case 'raid': onAction({ type: 'raid', plot: d.plot!, guards: [...squad], objective, when: d.when as 'now' | 'tonight' }); squad.clear(); break;
      case 'replay': onAction({ type: 'replay', index: Number(d.index) }); break;
      case 'facility': onAction({ type: 'facility', plot: d.plot!, kind: d.kind as FacilityKind }); break;
      case 'accept': case 'decline': onAction({ type: d.action, id: d.id! }); break;
      case 'truce': case 'factionBuyout': onAction({ type: d.action, rival: d.rival as RivalId }); break;
      case 'plotBuyout': onAction({ type: 'plotBuyout', plot: d.plot! }); break;
      case 'assault': onAction({ type: 'assault', rival: d.rival as RivalId, guards: [...squad] }); squad.clear(); break;
      case 'sleep': books = false; onAction({ type: 'sleep' }); break;
      case 'night': books = false; onAction({ type: 'night' }); break;
      case 'evening': case 'ledger': onAction({ type: d.action }); break;
      case 'goto': case 'restockNow': onAction({ type: d.action, plot: d.plot! }); break;
      case 'dismiss': case 'watch': onAction({ type: d.action, id: d.id! }); break;
      case 'options': onAction({ type: 'options' }); break;
      case 'option': onAction({ type: 'option', key: d.key!, value: d.value }); break;
      case 'open': case 'skip': case 'newgame': case 'upgrade': case 'brand': case 'restock': case 'mute':
      case 'setup': case 'cancelSetup': case 'keepSqueezing': case 'repay':
        onAction({ type: d.action }); break;
      case 'reloadDawn': onAction({ type: 'reloadDawn', slot: d.slot === undefined ? undefined : Number(d.slot) }); break;
      case 'saveSlot': onAction({ type: 'saveSlot', slot: Number(d.slot) }); break;
      case 'loadSlot': onAction({ type: 'loadSlot', slot: Number(d.slot), dawn: d.dawn === '1' }); break;
      case 'borrow': onAction({ type: 'borrow', amount: Number(d.amount) }); break;
      case 'entry': case 'sponsor': onAction(worldAction(d)); break;
      case 'start': if (hud.setup) onAction({ type: 'start', settings: { ...hud.setup.settings } }); break;
      case 'pick': { // New Game screen choices
        const st = hud.setup?.settings;
        if (!st) break;
        if (d.key === 'mode') st.mode = d.value as Mode;
        if (d.key === 'difficulty') st.difficulty = d.value as Difficulty;
        if (d.key === 'win') st.win = d.value as WinCondition;
        if (d.key === 'target') st.target = Number(d.value);
        if (d.key === 'peaceful') st.peaceful = !st.peaceful;
        if (d.key === 'ironman') st.ironman = !st.ironman;
        if (d.key === 'raidPause') st.raidPause = !raidPauses(st);
        redraw();
        break;
      }
    }
  });

  /** A clay button: one verb, optional price, disabled with its reason as a tooltip. */
  function btn(action: string, label: string, b: Blocker = { ok: true }, extra = '', cls = '') {
    return `<button class="cl-b ${cls}" data-action="${action}" ${extra} ${b.ok ? '' : `disabled title="${esc(b.why)}"`}>${label}</button>`;
  }

  // ---------- top: cash jar, rank rosette, egg timer, weather card, goal sticky ----------
  function topbar(s: GameState) {
    const w = s.phase === 'prep' ? s.forecast : s.weather;
    const ss = successScore(s);
    const r = RANKS[s.rank - 1], next = RANKS[s.rank];
    const lo = r.ss, hi = next?.ss ?? r.ss;
    const pct = (v: number) => (hi > lo ? Math.max(0, Math.min(1, (v - lo) / (hi - lo))) : 1);
    const now = pct(ss), peak = Math.max(now, pct(s.peakScore));
    const threat = threatLevel(s);
    const goals = [...lottieGoals(s), ...(bigGoal(s) ? [bigGoal(s)!] : [])];
    const goal = goals.find((g) => !g.done) ?? goals[0];
    const mode = `${MODES[s.settings.mode].label}${isEndless(s) && s.settings.mode !== 'endless' ? ' · Endless Summer' : ''} · ${DIFFICULTY[s.settings.difficulty].label}${s.settings.ironman ? ' · Ironman' : ''}`;
    const rankTip = `${r.title}: Success Score ${whole(ss)}${next ? `, ${whole(hi - ss)} to ${next.title}` : ''}${peak > now ? ' (striped: invested in buildings, it fills back in)' : ''}`;
    return `<div class="cl-left">
        <div class="cl-chip cl-cash${s.redDays ? ' red' : ''}" title="${s.redDays ? `In the Red: ${redDaysLeft(s)} days to get above $0` : 'Cash'}" data-testid="cash">${ART.jar()}${tape(`<b>${whole(s.cash)}</b>`, 'cl-t-cash')}</div>
        <div class="cl-chip cl-rank" title="${esc(rankTip)}">${ART.rosette()}${tape(`R${s.rank}`, 'cl-t-rank')}<span class="cl-snake" style="--v:${now.toFixed(3)};--p:${peak.toFixed(3)}"><i></i><u></u></span><span class="sr" data-testid="score">${Math.round(ss)}</span></div>
        ${threat >= 2 ? `<div class="cl-chip cl-threat" title="Threat ${threat}: how hard rivals come for you" data-testid="threat">${Array.from({ length: threat }, () => ART.sour()).join('')}</div>` : ''}
        ${s.bottles ? `<div class="cl-chip" title="${s.bottles.toLocaleString('en-US')} bottles ready for big orders">${ART.crate()}${tape(s.bottles.toLocaleString('en-US'))}</div>` : ''}
      </div>
      <div class="cl-right">
        <div class="cl-chip cl-day" title="${esc(mode)} · ${seasonOf(s.day)} day ${seasonDay(s.day)}">${ART.egg()}${tape(s.phase === 'prep' ? `Day ${s.day}` : clock(s.minute))}</div>
        <div class="cl-chip cl-wx" title="${WEATHER[w.kind].label}, ${w.temp}°F${s.phase === 'prep' ? ' (forecast, right about 4 days in 5)' : ''}">${ART.sky(w.kind)}${tape(`${w.temp}°`)}</div>
        <button class="cl-sticky${goalsOpen ? ' open' : ''}" data-action="goals" title="Lottie's goals">
          <span class="cl-doodle">${ART.lottie()}</span><span class="cl-goal">${esc(goal.text)}</span>${meter(goal.progress, 'cl-pencil')}
          ${goalsOpen ? `<span class="cl-goals">${goals.map((g) => `<span class="${g.done ? 'done' : ''}">${g.done ? '✓' : '•'} ${esc(g.text)}</span>`).join('')}</span>` : ''}
        </button>
      </div>
`;
  }

  /** The run's big goal under Lottie's: Domination, a score target, or the Peak to beat. */
  function bigGoal(s: GameState) {
    const win = winCondition(s);
    if (s.outcome?.result === 'won' || win === 'none') {
      if (!isEndless(s)) return null;
      return { text: `Beat your best: ${whole(s.peakScore)}`, progress: Math.min(1, successScore(s) / Math.max(1, s.peakScore)), done: false };
    }
    if (win === 'economic') return { text: `Reach ${whole(s.settings.target)}`, progress: Math.min(1, successScore(s) / s.settings.target), done: false };
    if (s.rank < 3) return null;
    const d = dominationProgress(s);
    const out = 5 - d.rivalsLeft.length;
    return { text: `Own the Bay: ${out}/5 rivals out`, progress: (out / 5 + d.majority / d.districts) / 2, done: false };
  }

  // ---------- bottom right: views, sound, options, new game and (while the clock runs) speed ----------
  function corner(s: GameState, speed: number) {
    const k = (action: string, inner: string, title: string, extra = '', on = false) => `<button class="cl-knob-s${on ? ' on' : ''}" data-action="${action}" ${extra} title="${title}" aria-label="${title}">${inner}</button>`;
    const views = k('view', '⌂', 'Back to your stand', 'data-target="home"') + k('view', '◎', 'Bay View', 'data-target="bay"') + k('mute', hud.muted ? '♪̸' : '♪', 'Music on/off') + k('options', '⚙', 'Options', 'data-testid="options-open"') + k('setup', '✚', 'New game');
    // Pause anywhere the clock (or a show) runs: business hours, the night, the Evening's moment on the map, Morning
    // Prep when it starts the day by itself, and any brawl or VIP scene on screen.
    const counting = !s.outcome && (s.phase === 'prep' ? hud.options.autoContinue : s.phase === 'report' && (!hud.ledger || hud.options.autoContinue));
    const running = s.phase === 'open' || s.phase === 'night' || counting || hud.playing;
    if (!running) return `<div class="cl-corner">${views}</div>`;
    const sb = (v: number, label: string) => k('speed', label, `Speed ${v ? v + '×' : 'pause'} (keys: space, 1, 2, 3)`, `data-value="${v}"`, speed === v);
    const skip = s.phase === 'open' ? k('skip', '⏭', 'Finish the day (stops at big alerts)') : s.phase === 'night' ? k('sleep', '⏭', 'Skip to dawn (stops at big alerts)', 'data-testid="next"') : '';
    return `<div class="cl-corner">${views}<span class="cl-gap"></span>${sb(0, '❚❚')}${sb(1, '▶')}${sb(2, '▶▶')}${sb(3, '▶▶▶')}${skip}</div>`;
  }

  // ---------- left feed: little tickets for whatever needs you this morning ----------
  function feed(s: GameState) {
    const t: string[] = alertCards(s); // the alert feed (src/ui/alerts.ts), in every phase
    t.push(...schemeTickets(s)); // rival schemes: price wars near you, smear posters (src/ui/schemes.ts)
    if (s.phase !== 'prep') { // after the morning: repairs to approve, then today's (and tonight's) fights, each with a replay
      if (s.phase === 'report' || s.phase === 'night') t.push(...repairCards(s));
      for (const { b, i } of s.battles.map((b, i) => ({ b, i })).filter(({ b }) => b.day === s.day)) {
        const good = (b.attacker === 'player') === (b.outcome === 'smashed' || b.outcome === 'robbed');
        t.push(`<div class="cl-ticket ${good ? 'good' : 'red'}" title="${esc(fightLine(b))}">${b.attacker === 'player' ? ART.raid() : ART.shield()}<b>${esc(fightShort(b))}</b>${btn('replay', '▶ Watch', { ok: true }, `data-index="${i}" data-testid="replay"`)}</div>`);
      }
      return t.length ? `<div class="cl-feed">${t.join('')}</div>` : '';
    }
    const st = selectedStand(s);
    const plotId = s.selected;
    if (s.redDays) {
      const left = redDaysLeft(s);
      const jar = difficulty(s).cookieJar === 'always' || cookieJarReady(s) ? 'Cookie Jar can cover you' : 'Cookie Jar is empty';
      const need = Math.ceil(-s.cash / 50) * 50;
      t.push(`<div class="cl-ticket red" data-testid="in-the-red" title="${jar}">${ART.piggy()}<b>In the Red! ${left} day${left === 1 ? '' : 's'}</b>${need > 0 && canBorrow(s, need).ok ? btn('borrow', `Borrow ${whole(need)}`, { ok: true }, `data-amount="${need}" data-testid="borrow"`) : ''}</div>`);
    }
    if (st.wrecked) {
      const ps = s.plots[plotId];
      t.push(`<div class="cl-ticket red">${ART.boom()}<b>${ps.busted ? 'Busted up!' : 'Smashed!'}</b>${btn('rebuild', `${ps.busted ? 'Fix' : 'Rebuild'} ${whole(rebuildCost(ps))}`, s.cash >= rebuildCost(ps) ? { ok: true } : { ok: false, why: 'Not enough cash' }, `data-plot="${plotId}"`)}</div>`);
    }
    t.push(...damageTickets(s)); // Damaged buildings: the HP left and a repair (src/ui/damage.ts)
    for (const { b, i } of s.battles.map((b, i) => ({ b, i })).filter(({ b }) => b.day === s.day - 1 || b.day === s.day)) {
      const good = (b.attacker === 'player') === (b.outcome === 'smashed' || b.outcome === 'robbed');
      t.push(`<div class="cl-ticket ${good ? 'good' : 'red'}" title="${esc(fightLine(b))}">${b.attacker === 'player' ? ART.raid() : ART.shield()}<b>${esc(fightShort(b))}</b>${btn('replay', '▶ Watch', { ok: true }, `data-index="${i}" data-testid="replay"`)}</div>`);
    }
    t.push(...calendarTickets(s));
    if (s.today.lemonsSpoiled) t.push(`<div class="cl-ticket">${ART.lemon()}<b>${s.today.lemonsSpoiled} lemons went bad</b></div>`);
    for (const o of s.offers) {
      const short = o.tier === 'deal' ? dealShortfallPerDay(s, o) : 0;
      const when = o.tier === 'deal' ? `in ${DEAL_LOADS} weekly loads` : `by day ${o.due}`;
      const fit = o.tier === 'deal' ? (short > 0 ? `. Your bottling is ${short.toLocaleString('en-US')} a day short` : '. Your bottling covers it') : '';
      const risk = deliveryRaidRisk(s, o) ? `<span class="cl-short" title="Rivals may raid this pickup">${ART.raid()}</span>` : '';
      t.push(`<div class="cl-ticket order${short > 0 ? ' warn' : ''}" data-testid="orders" title="${esc(o.client)}: ${o.qty.toLocaleString('en-US')} ${o.tier === 'local' ? 'cups' : 'bottles'} ${when}${fit}${risk ? '. Rivals may raid the pickup' : ''}">${ART.crate()}<b>${ORDER_TIERS[o.tier].label}: ${whole(o.pay)}</b>${short > 0 ? `<span class="cl-short" title="Bottling too slow">${ART.sour()}</span>` : ''}${risk}
        <span class="cl-acts">${btn('accept', 'Take it', { ok: true }, `data-id="${o.id}" data-testid="accept"`)}${btn('decline', '✕', { ok: true }, `data-id="${o.id}" title="No thanks"`, 'ghost')}</span></div>`);
    }
    const need = bottlesNeeded(s);
    for (const o of s.orders) {
      t.push(`<div class="cl-ticket order" title="${esc(o.client)}: ${o.qty.toLocaleString('en-US')} ${o.tier === 'local' ? 'cups' : 'bottles'} for ${whole(o.pay)}${o.tier !== 'local' ? `, ${s.bottles.toLocaleString('en-US')} of ${need.toLocaleString('en-US')} bottles ready` : ''}">${ART.crate()}<b>Pickup ${o.due === s.day ? 'today!' : `day ${o.due}`}</b>${o.tier !== 'local' && need ? meter(s.bottles / need) : ''}</div>`);
    }
    const servings = servingsAvailable(st);
    if (servings === 0 && !st.autoRestock && !st.wrecked) t.push(`<div class="cl-ticket">${ART.lottie()}<b>Buy lemons and sugar!</b></div>`);
    return t.length ? `<div class="cl-feed">${t.join('')}</div>` : '';
  }

  // ---------- the morning: tabs, stand picker, Grow/Defend sheets and the wooden dock ----------
  function defendOpen(s: GameState) {
    return s.rank >= 2 || s.day >= 4 || s.battles.length > 0 || playerStands(s).some((p) => s.plots[p.id].defense.tier > 0);
  }

  function prepPanel(s: GameState) {
    if (tab === 'crew' && !defendOpen(s)) tab = 'today';
    if (tab === 'fair' && !tasteOffToday(s)) tab = 'today';
    const tabs = `<div class="cl-tabs">
      <button class="cl-tab${tab === 'today' ? ' on' : ''}" data-action="tab" data-tab="today">Today</button>
      <button class="cl-tab${tab === 'grow' ? ' on' : ''}" data-action="tab" data-tab="grow" data-testid="tab-grow">Grow</button>
      ${defendOpen(s) ? `<button class="cl-tab${tab === 'crew' ? ' on' : ''}" data-action="tab" data-tab="crew" data-testid="tab-crew">Defend</button>` : ''}
      ${worldTabs(s, tab)}
      ${standPicker(s)}</div>`;
    const sheet = tab === 'grow' ? `<div class="cl-sheet">${growPanel(s)}</div>` : tab === 'crew' ? `<div class="cl-sheet">${defensePanel(s, s.selected)}${crewPanel(s)}</div>`
      : tab === 'book' || tab === 'fair' ? `<div class="cl-sheet">${worldSheet(s, tab)}</div>` : '';
    return `<div class="cl-prep" data-testid="prep">${sheet}<div class="cl-bottom">${tabs}${dock(s)}</div></div>`;
  }

  function standPicker(s: GameState) {
    const stands = playerStands(s);
    if (stands.length < 2) return '';
    return `<span class="cl-picker">${stands.map((p) => `<button class="cl-tab small${p.id === s.selected ? ' on' : ''}" data-action="select" data-plot="${p.id}" title="${esc(p.name)}">${esc(p.name.replace(/ lot /, ' '))} · L${s.plots[p.id].stand!.level}</button>`).join('')}</span>`;
  }

  function dock(s: GameState) {
    const st = selectedStand(s);
    const sl = standLevel(st);
    const plotId = s.selected;
    const cups = expectedCups(s, plotId);
    const servings = servingsAvailable(st);
    const stop = averageStopChance(s, plotId, s.forecast);
    const people = expectedPassersby(s, plotId, s.forecast);
    const cost = costPerCup(s, st);
    const lit = Math.max(1, Math.min(5, Math.ceil((stop / 0.45) * 5)));
    const expiring = lemonsExpiringTomorrow(s, st);
    const short = (id: SupplyId) => {
      if (st.autoRestock) return false;
      if (id === 'ice') return st.inventory.ice < RECIPES[st.recipe].icePerCup * Math.min(cups, Math.max(servings, 1));
      return servings < cups * 0.8;
    };
    const lvl = SWEET.indexOf(st.sweetness);
    const cube = (i: number) => `<button class="cl-cube" data-action="sweet" data-value="${SWEET[i]}" aria-pressed="${i <= lvl}" title="Sweetness: ${['less', 'classic', 'extra'][i]}">${ART.cube()}</button>`;
    const art: Record<SupplyId, (l: string) => string> = { lemons: ART.bowl, sugar: ART.bag, ice: ART.tray };
    // The stand's crate, sack and cooler show how full each is; the dock only buys and warns.
    const gauge = (id: SupplyId) => {
      const sp = SUPPLIES[id];
      const max = maxPacks(s, st, id);
      const note = id === 'ice' ? 'melts tonight' : id === 'lemons' ? (expiring ? `${expiring} spoil tomorrow` : 'keep 3 days') : 'keeps';
      return `<div class="cl-gauge" title="${sp.label}: ${stock(st, id)}/${sl.storage[id]} (${note})">
        <span class="cl-fill"${short(id) ? ' data-low' : ''} data-fill="${id}" style="--fill:1"><span class="l b">${art[id]('back')}</span><span class="l f">${art[id]('fill')}</span><span class="l t">${art[id]('top')}</span></span>
        <button class="cl-add" data-action="buy" data-id="${id}" data-packs="1" data-fill-packs="${Math.max(1, max)}" ${max < 1 ? 'disabled' : ''} title="+${sp.pack} ${sp.unit} for ${money(sp.pack * s.market[id])} (hold to fill up)" aria-label="Buy ${sp.label}"></button></div>`;
    };
    const restock = s.day >= AUTO_RESTOCK_DAY ? `<button class="cl-auto${st.autoRestock ? ' on' : ''}" data-action="restock" title="Auto-Restock: Lottie buys what this stand needs each morning">${tape(st.autoRestock ? 'Auto ✓' : 'Auto')}</button>` : '';
    const n = playerStands(s).length;
    return `<div class="cl-tray">
      <div class="cl-sec cl-recipe">${recipeRow(s)}<div class="cl-row cl-cubes">${[0, 1, 2].map(cube).join('')}</div></div>
      <div class="cl-sec cl-price"><div class="cl-row"><button class="cl-knob cl-minus" data-action="price" data-delta="-0.05" aria-label="Lower price"></button>
        <div class="cl-chalk${st.price < cost ? ' loss' : ''}" title="Costs you ${cents(cost)} a cup"><b data-testid="price">${cents(st.price)}</b></div>
        <button class="cl-knob cl-plus" data-action="price" data-delta="0.05" aria-label="Raise price"></button></div>
        <div class="cl-row cl-crowd" title="About ${Math.round(stop * 100)}% of ~${Math.round(people)} walkers stop: ~${cups} cups">${[0, 1, 2, 3, 4].map((i) => `<i aria-pressed="${i < lit}">${ART.head(i)}</i>`).join('')}</div></div>
      <div class="cl-sec cl-stock"><div class="cl-row">${(Object.keys(SUPPLIES) as SupplyId[]).map(gauge).join('')}</div>${restock}</div>
      <button class="cl-open" data-action="open" data-testid="open" aria-label="Open ${n > 1 ? 'all stands' : 'the stand'}" title="Open at ${clock(OPEN)}"><span class="cl-btn"></span>${tape('OPEN', 'cl-t-open')}</button>
    </div>`;
  }

  // ---------- Grow: picture cards ----------
  const card = (art: string, title: string, sub: string, action: string, tip = '', extra = '') => `<div class="cl-card" ${tip ? `title="${esc(tip)}"` : ''} ${extra}><span class="cl-pic">${art}</span><span class="cl-txt"><b>${title}</b>${sub ? `<i>${sub}</i>` : ''}</span>${action}</div>`;
  function levelStats(l: StandLevel) {
    return `${l.capacityPerHour} cups/hour · draws ×${l.draw} · top price ${money(l.topPrice)} · upkeep ${money(l.upkeep)}/day · holds ${l.storage.lemons} lemons`;
  }
  function growPanel(s: GameState) {
    const cur = standLevel(selectedStand(s));
    const next = STAND_LEVELS[cur.level];
    const top = STAND_LEVELS[STAND_LEVELS.length - 1];
    const bars = (l: StandLevel) => `<span class="cl-bars"><span>${ART.cup()}${meter(l.capacityPerHour / top.capacityPerHour)}</span><span>${ART.head(1)}${meter(l.draw / top.draw)}</span><span>${ART.crate()}${meter(l.storage.lemons / top.storage.lemons)}</span></span>`;
    const up = canUpgradeStand(s);
    const out: string[] = [];
    if (next && !locked(up)) out.push(card(ART.stand(next.level), `${next.name}`, bars(next), btn('upgrade', whole(next.cost), up, 'data-testid="upgrade"', 'go'), `Now: ${levelStats(cur)}\nNext: ${levelStats(next)}`, 'data-big'));
    else if (!next) out.push(card(ART.stand(cur.level), cur.name, 'Top of the line!', ''));
    for (const id of Object.keys(CAMPAIGNS) as CampaignId[]) {
      const c = CAMPAIGNS[id], b = canRunCampaign(s, id);
      if (locked(b) || (!b.ok && /Only for/.test(b.why))) continue;
      out.push(card(id === 'sandwichBoard' ? ART.board() : ART.sample(), c.name.replace('Sandwich-Board Kid', 'Sign kid').replace('Free Sample Day', 'Free samples'), c.costPerDay ? `${whole(c.costPerDay)} a day` : `${c.samples} cups`, btn('campaign', 'Run', b, `data-id="${id}"`), c.blurb));
    }
    const nb = BRAND_TIERS[s.brandTier], bb = canBuyBrand(s);
    if (nb && !locked(bb)) out.push(card(ART.megaphone(), nb.name, 'every stand', btn('brand', whole(nb.cost), bb, 'data-testid="brand"'), `+${Math.round(nb.traffic * 100)}% foot traffic at every stand, forever`));
    out.push(bank(s));
    return `<div class="cl-cards">${out.join('')}</div>`;
  }

  /** Marisol's bank only shows up when you owe her or could use her. */
  function bank(s: GameState) {
    const l = s.loan;
    if (l) return card(ART.piggy(), `You owe ${whole(l.principal)}`, `${whole(loanPayment(s))} on day ${l.nextDue}${l.missed ? ' · missed one!' : ''}`, btn('repay', 'Pay off', s.cash >= l.principal && s.phase !== 'open' ? { ok: true } : { ok: false, why: `Needs ${whole(l.principal)}` }, 'data-testid="repay"'), `Marisol's bank: 3% a week over 4 weeks${l.missed ? '. One more miss and the bank takes a plot.' : ''}`);
    const limit = loanLimit(s);
    if (!limit || s.cash > 60) return '';
    const amt = Math.floor(limit / 2 / 50) * 50 || limit;
    return card(ART.piggy(), "Marisol's bank", 'Short on cash?', btn('borrow', `Borrow ${whole(amt)}`, canBorrow(s, amt), `data-amount="${amt}" data-testid="borrow"`), 'Up to half what your land and stands are worth, 3% a week, paid back over 4 weeks');
  }

  // ---------- Defend: the fence, gadget slots, the crew as faces ----------
  function defensePanel(s: GameState, id: string) {
    const ps = s.plots[id];
    const cur = ps.defense.tier ? PERIMETERS[ps.defense.tier - 1] : null;
    const next = PERIMETERS[ps.defense.tier];
    const slots = GADGET_SLOTS(ps.stand?.level ?? 1);
    const pb = canBuyPerimeter(s, id);
    const out: string[] = [];
    out.push(damageCard(s, id)); // the stand itself: its HP, and the repair once it's Damaged (src/ui/damage.ts)
    if (cur) out.push(card(ART.fence(ps.defense.tier), cur.name, cur ? meter(ps.defense.fenceHp / cur.hp, 'hp') : '',
      (fenceRepairCost(ps) ? btn('repairFence', `Patch ${whole(fenceRepairCost(ps))}`, { ok: true }, `data-plot="${id}"`) : ''),
      `${cur.name}: ${ps.defense.fenceHp}/${cur.hp} HP. Defenders hit ${cur.tier === 5 ? 50 : 25}% harder while it stands.`));
    if (next && !locked(pb)) out.push(card(ART.fence(next.tier), next.name, `${next.hp} HP`, btn('perimeter', whole(next.cost), pb, `data-plot="${id}" data-testid="perimeter"`, 'go'), `${next.hp} HP${next.breachDps ? ', hurts attackers breaking through' : ''}${next.slow ? ', slows them down' : ''}`));
    const installed = ps.defense.gadgets.map((g) => `<span class="cl-slot full" title="${GADGETS[g].name}: ${esc(GADGETS[g].text)}">${GADGET_ART[g]()}</span>`).join('');
    const free = Array.from({ length: Math.max(0, slots - ps.defense.gadgets.length) }, () => '<span class="cl-slot">+</span>').join('');
    const shop = (Object.keys(GADGETS) as GadgetId[]).filter((g) => !ps.defense.gadgets.includes(g)).map((g) => ({ g, b: canBuyGadget(s, id, g) })).filter(({ b }) => !locked(b))
      .map(({ g, b }) => `<button class="cl-gadget" data-action="gadget" data-plot="${id}" data-id="${g}" ${b.ok ? '' : `disabled`} title="${GADGETS[g].name}: ${esc(GADGETS[g].text)}${b.ok ? '' : ` (${esc(b.why)})`}">${GADGET_ART[g]()}${tape(whole(GADGETS[g].cost))}</button>`).join('');
    return `<div class="cl-cards">${out.join('')}</div><div class="cl-slots"><span class="cl-label">Gadgets</span>${installed}${free}${ps.defense.gadgets.length < slots ? `<span class="cl-shop">${shop}</span>` : ''}</div>`;
  }

  function guardFace(s: GameState, g: Guard) {
    const out = !guardReady(s, g);
    return `<span class="cl-face${out ? ' out' : ''}">${ART.face(g.id)}${out ? `<span class="cl-band">${ART.bandage()}</span>` : ''}<span class="cl-wpn">${WEAPON_ART[g.weapon]()}</span></span>`;
  }

  function guardRow(s: GameState, g: Guard) {
    const stands = PLOTS.filter((p) => s.plots[p.id].owner === 'player' && (s.plots[p.id].stand || s.plots[p.id].facility));
    const i = g.post ? stands.findIndex((p) => p.id === g.post) : -1;
    const nextPost = stands[(i + 1) % stands.length];
    const nextWeapon = (['clubs', 'hatchets'] as WeaponId[]).find((w) => WEAPONS[w].hit > WEAPONS[g.weapon].hit);
    const nextGear = (['vest', 'pro'] as GearId[]).find((x) => GEAR[x].hp > GEAR[g.gear].hp);
    const wb = nextWeapon ? canEquip(s, g.id, nextWeapon) : null, gb = nextGear ? canEquip(s, g.id, nextGear) : null;
    const tip = `${g.name}: L${g.level} ${guardTitle(g)}, ${g.trait}, ${WEAPONS[g.weapon].name}${g.gear !== 'none' ? ', ' + GEAR[g.gear].name : ''}, ${whole(guardWage(g))}/day${guardReady(s, g) ? '' : `, knocked out till day ${g.outUntil}`}`;
    return `<div class="cl-guard" data-testid="guard" title="${esc(tip)}">${guardFace(s, g)}
      <span class="cl-name">${esc(g.name.split(' ')[0])}</span>${pips(g.level, 5)}
      <span class="cl-acts">
        <button class="cl-b ghost tiny" data-action="post" data-id="${g.id}" data-plot="${nextPost?.id ?? ''}" title="Posted at ${g.post ? esc(PLOT_BY_ID[g.post].name) : 'the Clubhouse'}: tap to move">📍</button>
        ${nextWeapon && wb && !locked(wb) ? `<button class="cl-b tiny" data-action="equip" data-id="${g.id}" data-item="${nextWeapon}" ${wb.ok ? '' : 'disabled'} title="${WEAPONS[nextWeapon].name} for ${whole(WEAPONS[nextWeapon].cost)}${wb.ok ? '' : ` (${esc(wb.why)})`}">${WEAPON_ART[nextWeapon]()}</button>` : ''}
        ${nextGear && gb && !locked(gb) ? `<button class="cl-b tiny" data-action="equip" data-id="${g.id}" data-item="${nextGear}" ${gb.ok ? '' : 'disabled'} title="${GEAR[nextGear].name} for ${whole(GEAR[nextGear].cost)}${gb.ok ? '' : ` (${esc(gb.why)})`}">${ART.shield()}</button>` : ''}
        ${g.name === 'Dex Moody' ? '' : `<button class="cl-b ghost tiny" data-action="fire" data-id="${g.id}" title="Let ${esc(g.name)} go">✕</button>`}
      </span></div>`;
  }

  function crewPanel(s: GameState) {
    if (s.rank < HIRE_RANK && !s.guards.length) return '';
    const club = CLUBHOUSE[s.clubhouse], cb = canBuildClubhouse(s);
    const recruits = s.recruits.map((g) => { const b = canHire(s, g.id); return `<div class="cl-guard recruit" title="${esc(g.name)}: L${g.level} ${guardTitle(g)}, ${g.trait}, ${whole(guardWage(g))}/day">${guardFace(s, g)}<span class="cl-name">${esc(g.name.split(' ')[0])}</span>${pips(g.level, 5)}${btn('hire', whole(g.fee), b, `data-id="${g.id}" data-testid="hire"`, 'go')}</div>`; }).join('');
    return `<div class="cl-crew"><span class="cl-label">Crew ${s.guards.length}/${rosterCap(s)}</span><div class="cl-faces">${s.guards.map((g) => guardRow(s, g)).join('')}</div>
      ${recruits ? `<span class="cl-label">Hiring Hall</span><div class="cl-faces">${recruits}</div>` : ''}
      ${club && !locked(cb) && s.guards.length >= rosterCap(s) - 1 ? `<div class="cl-cards">${card(ART.house(), `Clubhouse L${club.level}`, `${club.beds} beds${s.clubhouse ? ` (now ${clubhouseBeds(s)})` : ''}`, btn('clubhouse', whole(club.cost), cb))}</div>` : ''}</div>`;
  }

  // ---------- selling: a cup counter; the crowd shows the rest ----------
  function dayBar(s: GameState) {
    const pct = (s.minute - OPEN) / (CLOSE - OPEN);
    const w = s.today.walkedPast;
    const why = [['not thirsty', w.notThirsty], ['too pricey', w.pricey], ['line too long', w.line], ['sold out', w.soldOut], ['went to a rival', w.rival]]
      .filter(([, n]) => (n as number) > 0).map(([k, n]) => `${n} ${k}`).join(', ');
    const left = playerStands(s).reduce((a, p) => a + servingsAvailable(s.plots[p.id].stand!), 0);
    return `<div class="cl-daybar" data-testid="daybar" title="${left} cups left${why ? ` · walked past: ${why}` : ''}">${ART.cup()}${tape(`<b>${s.today.customers}</b>`, 'cl-t-cash')}<span class="cl-sun" style="--v:${pct.toFixed(3)}"><i></i></span></div>`;
  }

  // ---------- day's end: one number, one tip, one button ----------
  function dayEnd(s: GameState) {
    const t = s.history[s.history.length - 1] ?? s.today;
    const costs = t.supplies + t.cupCosts + t.upkeep + t.tax;
    const profit = t.revenue - costs;
    const repDelta = t.reputationAfter - t.reputationBefore;
    const w = t.walkedPast;
    const away = w.soldOut + w.line;
    const tip = w.soldOut > 10 ? 'Ran dry! Stock up more tomorrow.'
      : w.rival > t.customers ? 'Rivals took your crowd. Cheaper or bigger?'
      : w.pricey > t.customers ? '"Too pricey," they said. Try lower.'
      : w.line > 10 ? 'Line too long! A bigger stand helps.'
      : t.customers === 0 ? 'No sales. Check stock and price.'
      : t.iceMelted > 120 ? `${t.iceMelted} ice cubes melted. Buy less.`
      : "Not bad, kiddo. Same again?";
    const stars = Math.round(t.reputationAfter);
    const r = RANKS[s.rank - 1], next = RANKS[s.rank];
    const ss = successScore(s);
    const rv = next ? Math.max(0, Math.min(1, (ss - r.ss) / (next.ss - r.ss))) : 1;
    const ssDelta = ss - t.scoreBefore;
    const rows = playerStands(s).map((p) => { const d = s.plots[p.id].stand!.day; return `<tr><td>${esc(p.name)}</td><td>${d.customers} cups · ${money(d.revenue)}</td></tr>`; }).join('');
    const bookTable = `<table class="cl-books">
        <tr><td>People walking by</td><td>${t.passersby}</td></tr><tr><td>Cups sold</td><td>${t.customers}</td></tr>${playerStands(s).length > 1 ? rows : ''}
        <tr><td>Not thirsty / too pricey</td><td>${w.notThirsty} / ${w.pricey}</td></tr><tr><td>Line / sold out / a rival</td><td>${w.line} / ${w.soldOut} / ${w.rival}</td></tr>
        <tr><td>Sales</td><td class="good">${money(t.revenue)}</td></tr><tr><td>Supplies, cups, upkeep, tax</td><td class="bad">${money(-costs)}</td></tr>
        ${t.land ? `<tr><td>Invested in land and stands</td><td>${money(t.land)}</td></tr>` : ''}
        <tr><td>Reputation</td><td>${t.reputationAfter.toFixed(2)} (${repDelta >= 0 ? '+' : ''}${repDelta.toFixed(2)})</td></tr>
        <tr><td>Success Score</td><td>${whole(ss)} (${ssDelta >= 0 ? '+' : ''}${Math.round(ssDelta)})</td></tr></table>`;
    return `<div class="cl-modal-bg"><div class="cl-card-big cl-end" data-testid="report">
      <div class="cl-end-day">${tape(`Day ${t.day}`)}</div>
      <div class="cl-profit ${profit >= 0 ? 'up' : 'down'}" title="Sales ${money(t.revenue)}, costs ${money(costs)}">${profit >= 0 ? '+' : '-'}${whole(Math.abs(profit)).replace('-', '')}</div>
      <div class="cl-end-row"><span title="Cups sold">${ART.cup()}<b>${t.customers}</b></span>${away ? `<span class="bad" title="Turned away: ${w.soldOut} sold out, ${w.line} line too long">${ART.empty()}<b>${away}</b></span>` : ''}</div>
      <div class="cl-end-row"><span class="cl-stars" title="Reputation ${t.reputationAfter.toFixed(2)} stars">${[0, 1, 2, 3, 4].map((i) => ART.star(i < stars)).join('')}</span><span class="cl-tick ${repDelta >= 0 ? 'up' : 'down'}">${repDelta > 0.004 ? '▲' : repDelta < -0.004 ? '▼' : ''}</span>
        <span class="cl-chip cl-rank sm" title="${r.title}: ${whole(ss)} (${ssDelta >= 0 ? '+' : ''}${Math.round(ssDelta)})">${ART.rosette()}${meter(rv)}</span></div>
      <div class="cl-lottie"><span class="cl-doodle">${ART.lottie()}</span><span>${tip}</span></div>
      ${tasteOffLine(s, t.day)}
      ${tonight(s)}
      ${books ? bookTable : ''}
      <button class="cl-sleep" data-action="night" data-testid="night" title="Night falls: it runs on the clock, quiet nights at 3×">${ART.moon()}<span>Sleep</span></button>
      <span class="cl-acts"><button class="cl-link" data-action="sleep" data-testid="next" title="Skip ahead; stops at any big alert">Skip to dawn</button>
      <button class="cl-link" data-action="evening" data-testid="evening-map" title="Station guards, approve repairs and send tonight's raids">To the map</button>
      <button class="cl-link" data-action="books">${books ? 'Close the books' : 'See the books'}</button></span>
    </div></div>`;
  }

  function tonight(s: GameState) {
    // Rival raids warn as they set out, on cards in the alert feed (src/ui/alerts.ts); the Ledger lists your own.
    const out = tripLines(s);
    return out.length ? `<div class="cl-tonight">${out.join('')}</div>` : '';
  }

  function fightLine(b: GameState['battles'][number]) {
    const where = PLOT_BY_ID[b.target].name;
    const who = (f: string) => (f === 'player' ? "Lottie's crew" : FACTIONS[f as RivalId].name);
    const verb = { smashed: 'smashed', robbed: `robbed (${whole(b.loot)})`, damaged: 'roughed up', repelled: 'held' }[b.outcome];
    if (b.hq) return b.outcome === 'repelled' ? `HQ assault on ${where}: stalled at the ${b.hq}` : `HQ assault on ${where}: captured!`;
    return b.attacker === 'player' ? `Your raid on ${where}: ${b.outcome === 'repelled' ? 'beaten back' : verb}` : `${who(b.attacker)} hit ${where}: ${b.outcome === 'repelled' ? 'you held them off!' : verb}`;
  }
  function fightShort(b: GameState['battles'][number]) {
    if (b.hq) return b.outcome === 'repelled' ? 'HQ held out' : 'HQ captured!';
    if (b.attacker === 'player') return b.outcome === 'repelled' ? 'Raid beaten back' : b.outcome === 'robbed' ? `Grabbed ${whole(b.loot)}` : 'Raid: smashed it!';
    return b.outcome === 'repelled' ? 'You held them off!' : b.outcome === 'robbed' ? `Robbed: ${whole(b.loot)}` : 'They hit you!';
  }

  // ---------- the plot card: name, owner colour, one action ----------
  function plotCard(s: GameState, id: string) {
    const p = PLOT_BY_ID[id];
    const ps = s.plots[id];
    const d = DISTRICT_BY_ID[p.district];
    const st = ps.stand;
    const typeLabel = { street: 'Street plot', prime: 'Prime plot (traffic ×3)', landmark: 'Landmark (traffic ×5)', field: 'Field', dock: 'Dock', industrial: 'Industrial', hq: 'Headquarters', civic: 'Civic building' }[p.type];
    const c = districtControl(s, p.district);
    const share = c.total ? `You own ${c.mine} of ${c.total} plots here${c.share >= MAJORITY ? ' (Majority)' : c.mine ? `, ${Math.ceil(c.total * MAJORITY) - c.mine} more for a Majority` : ''}` : '';
    const tip = [`${d.name} · ${typeLabel}`, `Owner: ${ownerName(ps.owner)}`, p.type !== 'civic' ? `~${p.baseTraffic} passersby a day · land ${whole(ps.landValue)}` : d.feel, share,
      st ? `Stand: L${st.level} ${standLevel(st).name} · ${cents(st.price)} a cup` : '', ps.facility ? `Built: ${FACILITIES[ps.facility.kind].names[ps.facility.level - 1]}` : '',
      ps.owner && ps.owner !== 'player' && p.type !== 'civic' ? `Defenses: ${ps.defense.tier ? PERIMETERS[ps.defense.tier - 1].name : 'none'}${ps.garrison ? `, ${ps.garrison} henchmen` : ''}` : '',
      st && s.phase !== 'prep' ? `Today: ${st.day.customers} cups of ${st.day.passersby} walking by` : ''].filter(Boolean).join('\n');
    let actions = '';
    if (!ps.owner && p.type !== 'civic' && p.type !== 'hq') { const b = canBuyPlot(s, id); actions = locked(b) ? `<span class="cl-note">Opens later</span>` : btn('buyPlot', `Buy ${whole(plotPrice(s, id))}`, b, `data-plot="${id}" data-testid="buy-plot"`, 'go'); }
    else if (ps.owner === 'player' && isWrecked(ps)) actions = btn('rebuild', `${ps.busted ? 'Fix' : 'Rebuild'} ${whole(rebuildCost(ps))}`, s.cash >= rebuildCost(ps) ? { ok: true } : { ok: false, why: 'Not enough cash' }, `data-plot="${id}" title="${ps.busted ? 'Busted: closed until you fix it' : 'Rebuild by tomorrow or the plot goes For Sale'}"`, 'go');
    else if (ps.owner === 'player' && !st) {
      const lvl = ps.facility?.level ?? 0;
      const kinds = ps.facility ? [ps.facility.kind] : facilitiesFor(p.type);
      const fac = kinds.filter((kind) => lvl < FACILITIES[kind].names.length).map((kind) => ({ kind, b: canBuildFacility(s, id, kind) })).filter(({ b }) => !locked(b))
        .map(({ kind, b }) => btn('facility', `${FACILITIES[kind].names[lvl]} ${whole(FACILITIES[kind].costs[lvl])}`, b, `data-plot="${id}" data-kind="${kind}" data-testid="facility" title="${esc(FACILITIES[kind].blurb[lvl])}"`, 'go')).join('');
      const stand = p.type === 'field' || p.type === 'dock' || ps.facility ? '' : btn('build', `Table ${whole(STAND_LEVELS[0].cost)}`, canBuildStand(s, id), `data-plot="${id}" data-testid="build"`, 'go');
      actions = stand + fac + (ps.facility ? fenceHere(s, id) : ''); // a pad or pier has no stand panel: fence it here
    }
    else if (ps.owner === 'player' && st) actions = s.phase === 'report' || s.phase === 'night' ? fenceHere(s, id) : id === s.selected ? '' : btn('select', 'Manage', { ok: true }, `data-plot="${id}"`);
    else if (ps.owner && ps.owner !== 'player' && p.type === 'hq') actions = hqPanel(s, ps.owner as RivalId);
    else if (ps.owner && ps.owner !== 'player') {
      const pb = canPlotBuyout(s, id);
      actions = (hasBuilding(ps) ? raidPlanner(s, id) : '') + (s.rank >= SITDOWN_RANK && !locked(pb) ? btn('plotBuyout', `Buy it ${whole(plotBuyoutPrice(s, id))}`, pb, `data-plot="${id}" data-testid="plot-buyout"`) : '');
    }
    actions = damageHere(s, id) + actions; // the building's HP, and your Damaged one's repair (src/ui/damage.ts)
    if (ps.owner === 'player' && (st || ps.facility) && s.guards.length) actions += guardsHere(s, id, (g) => guardFace(s, g)); // station guards from the map
    const dibs = ps.dibs?.who === 'player' && ps.dibs.until >= s.day ? `<span class="cl-note good">${ps.dibs.price !== undefined ? `Fire Sale ${whole(ps.dibs.price)}!` : 'First Dibs!'}</span>` : '';
    return `<div class="cl-plot" data-testid="plotcard">
      <div class="cl-plot-head" title="${esc(tip)}"><span class="cl-dot" style="background:${ownerColor(ps.owner)}"></span>${tape(esc(p.name))}<button class="cl-x" data-action="close-plot" aria-label="Close">✕</button></div>
      ${dibs}${schemeNote(s, id)}${ps.facility?.wrecked || st?.wrecked ? `<span class="cl-note bad">${ps.busted ? 'Busted' : 'Wrecked'}</span>` : ''}
      <div class="cl-plot-acts">${actions}</div></div>`;
  }

  function squadPicker(s: GameState) {
    const crew = availableRaiders(s);
    for (const g of [...squad]) if (!crew.some((c) => c.id === g)) squad.delete(g);
    const ids = crew.map((g) => g.id).join(',');
    return `<div class="cl-squad">${crew.map((g) => `<button class="cl-pick${squad.has(g.id) ? ' on' : ''}" data-action="squad" data-id="${g.id}" title="${esc(g.name)}: L${g.level}, ${WEAPONS[g.weapon].name}" aria-pressed="${squad.has(g.id)}">${guardFace(s, g)}</button>`).join('')}
      ${crew.length > 1 ? `<button class="cl-b ghost tiny" data-action="squadAll" data-ids="${ids}">${crew.every((g) => squad.has(g.id)) ? 'None' : 'Take all'}</button>` : ''}</div>`;
  }

  const oddsWord = (p: number) => (p < 0.25 ? 'Long shot' : p < 0.45 ? 'Risky' : p < 0.6 ? 'Coin flip' : p < 0.85 ? 'Good odds' : 'Sure thing');
  const dial = (p: number) => `<span class="cl-dial" style="--v:${p.toFixed(3)}" title="${Math.round(p * 100)}% to win"><i></i></span><b class="cl-odds">${oddsWord(p)}</b>`;

  /** A rival's HQ: Dot's Diner sit-downs and the assault. */
  function hqPanel(s: GameState, id: RivalId) {
    const st = rivalStatus(s, id);
    const hq = HQS[id];
    const price = factionBuyoutPrice(s, id);
    const head = `<span class="cl-note" title="${st.plots} plots (peak ${st.peak}), worth about ${whole(st.worth)}">${st.weakened ? 'Weakened!' : `${st.plots} plots`}${st.truce ? ` · truce to day ${st.truce}` : ''}</span>`;
    if (s.rank < SITDOWN_RANK) return head;
    const tb = canTruce(s, id), fb = canFactionBuyout(s, id);
    const sit = `<div class="cl-acts">${locked(tb) ? '' : btn('truce', `Truce ${whole(truceCost(s))}`, tb, `data-rival="${id}" data-testid="truce" title="7 days of peace for a tribute"`)}${locked(fb) ? '' : btn('factionBuyout', price === null ? 'Buy them out' : `Buy out ${whole(price)}`, fb, `data-rival="${id}" data-testid="faction-buyout"`)}</div>`;
    const ids = [...squad];
    const ab = canAssault(s, id, ids);
    const assault = locked(ab) ? '' : `<div class="cl-planner" data-testid="hq-assault"><b title="Gate ${hq.gate.toLocaleString('en-US')} HP, the Yard, then ${esc(hq.boss)} and their &quot;${esc(hq.move)}&quot;">Storm the HQ</b>
      <span class="cl-stages"><i>Gate</i>▸<i>Yard</i>▸<i>Boss</i></span>${squadPicker(s)}${tape(`${ids.length}/${SQUAD_CAP(s.rank)}`)}
      ${btn('assault', 'Storm it!', ab, `data-rival="${id}" data-testid="assault"`, 'go')}</div>`;
    return head + sit + assault;
  }

  function raidPlanner(s: GameState, id: string) {
    if (s.rank < RAID_RANK) return '';
    const crew = availableRaiders(s);
    for (const g of [...squad]) if (!crew.some((c) => c.id === g)) squad.delete(g);
    if (!crew.length) return '<span class="cl-note">No guards free</span>';
    const ids = [...squad];
    const odds = (night: boolean) => {
      const ps = s.plots[id];
      const key = JSON.stringify([s.day, s.phase === 'open', id, ids, objective, night, ps.defense, ps.garrison, s.guards.map((g) => [g.id, g.weapon, g.gear, g.level])]);
      let v = oddsMemo.get(key);
      if (v === undefined) { v = raidOdds(s, id, ids, objective, night); if (oddsMemo.size > 200) oddsMemo.clear(); oddsMemo.set(key, v); }
      return v;
    };
    const night = odds(true), day = odds(false);
    const can = canRaid(s, id, ids);
    const obj = (v: Objective, art: string, label: string, tip: string) => `<button class="cl-b ${objective === v ? 'go' : 'ghost'}" data-action="objective" data-value="${v}" title="${tip}">${art}${label}</button>`;
    return `<div class="cl-planner" data-testid="raid-planner">
      <div class="cl-acts">${obj('smash', ART.boom(), 'Smash', `Wreck it. They rebuild ${Math.round(rebuildChance(s, id) * 100)}% of the time; if not, you get First Dibs.`)}${obj('shakedown', ART.moneyBag(), 'Shakedown', "Grab about a day's takings")}</div>
      ${squadPicker(s)}
      ${ids.length ? `<div class="cl-oddsrow">${dial(night)}</div>` : ''}
      ${tripNote(s, id, ids)}
      ${inTruce(s, s.plots[id].owner as RivalId) ? '<span class="cl-note bad" title="Raiding breaks it: −1 star, and every rival holds a grudge">Breaks your truce!</span>' : ''}
      <div class="cl-acts">${btn('raid', `${ART.moon()} Tonight`, can, `data-plot="${id}" data-when="tonight" data-testid="raid-tonight" title="${Math.round(night * 100)}% to win"`, 'go')}
      ${s.phase === 'report' || s.phase === 'night' ? '' : btn('raid', `Now −${objective === 'smash' ? '0.2' : '0.1'}★`, can, `data-plot="${id}" data-when="now" data-testid="raid-now" title="${Math.round(day * 100)}% to win in daylight; costs a little Reputation"`)}</div></div>`;
  }

  // ---------- New Game, victory and game over ----------
  function setupScreen(st: Settings, cancel: boolean) {
    const modeArt: Record<Mode, string> = { campaign: ART.lottie(), sandbox: ART.fence(2), endless: ART.sky('hot') };
    const modes = (Object.keys(MODES) as Mode[]).map((m) => `<button class="cl-mode${st.mode === m ? ' on' : ''}" data-action="pick" data-key="mode" data-value="${m}" data-testid="mode-${m}" title="${esc(MODES[m].blurb)}"><span class="cl-art">${modeArt[m]}</span>${tape(MODES[m].label.replace('Story Campaign', 'Story').replace('Sandbox: ', ''))}</button>`).join('');
    const diffs = (Object.keys(DIFFICULTY) as Difficulty[]).map((d, i) => `<button class="cl-diff${st.difficulty === d ? ' on' : ''}" data-action="pick" data-key="difficulty" data-value="${d}" data-testid="difficulty-${d}" title="${esc(DIFFICULTY[d].blurb)}"><span>${Array.from({ length: i + 1 }, () => ART.sour()).join('')}</span>${DIFFICULTY[d].label}</button>`).join('');
    const toggle = (key: string, on: boolean, label: string, tip: string) => `<button class="cl-toggle${on ? ' on' : ''}" data-action="pick" data-key="${key}" title="${esc(tip)}"><i></i>${label}</button>`;
    const sandbox = st.mode === 'sandbox' ? `<div class="cl-row wrap">
        ${([['domination', 'Domination', 'Every rival out, a Majority in every district'], ['economic', 'Score target', 'Reach a Success Score'], ['none', 'No end', 'Just build']] as const).map(([v, l, t]) => `<button class="cl-b ${st.win === v ? 'go' : 'ghost'}" data-action="pick" data-key="win" data-value="${v}" title="${t}">${l}</button>`).join('')}</div>
      ${st.win === 'economic' ? `<div class="cl-row wrap">${RANKS.slice(3).map((r) => `<button class="cl-b tiny ${st.target === r.ss ? 'go' : 'ghost'}" data-action="pick" data-key="target" data-value="${r.ss}" title="${r.title}">${whole(r.ss)}</button>`).join('')}</div>` : ''}
      ${toggle('peaceful', st.peaceful, 'Peaceful', 'No raids, Sabotage or HQ assaults for anyone. Rivals fall to buyouts or bankruptcy, and even Vera sells.')}` : '';
    const scores = hud.leaderboard.length ? `<table class="cl-books">${hud.leaderboard.map((e, i) => `<tr><td>${i + 1}. ${whole(e.peak)}</td><td>${MODES[e.mode].label.split(':')[0]} · ${DIFFICULTY[e.difficulty].label}${e.result === 'won' ? ' · 🏆' : ''}</td></tr>`).join('')}</table>` : '';
    return `<div class="cl-modal-bg"><div class="cl-card-big cl-setup" data-testid="setup">
      <h1 class="cl-title">Lemonade Stand Wars</h1>
      <div class="cl-modes">${modes}</div>
      <div class="cl-diffs">${diffs}</div>
      ${moreOpts || st.mode === 'sandbox' ? `<div class="cl-more">${sandbox}${toggle('ironman', st.ironman, 'Ironman', "One save: a lost run can't reload its last dawn")}${toggle('raidPause', raidPauses(st), 'Raid warnings pause', 'Off: the clock drops to fight speed while a warning counts down')}${scores}</div>` : ''}
      <div class="cl-setup-foot"><button class="cl-link" data-action="more">${moreOpts ? 'Fewer options' : 'More options'}</button>
        ${cancel ? '<button class="cl-link" data-action="cancelSetup">Back to my game</button>' : ''}
        <button class="cl-open big" data-action="start" data-testid="start" aria-label="Open the stand"><span class="cl-btn"></span>${tape('START', 'cl-t-open')}</button></div>
    </div></div>`;
  }

  function outcomeScreen(s: GameState) {
    const o = s.outcome;
    if (!o || (o.result === 'won' && s.endlessSince !== undefined)) return '';
    const t = s.tally ?? { buyouts: 0, smashes: 0, hqs: 0 };
    const stats = `<div class="cl-end-row" title="Day ${o.day} · Buyouts ${t.buyouts}, Smashes ${t.smashes}, HQs ${t.hqs} · ${MODES[s.settings.mode].label} · ${DIFFICULTY[s.settings.difficulty].label}"><span>${ART.rosette()}<b>R${s.rank}</b></span><span>${ART.coin()}<b>${whole(s.peakScore)}</b></span><span>${ART.egg()}<b>Day ${o.day}</b></span></div>`;
    if (o.result === 'won') {
      const e = o.ending ? ENDINGS[o.ending] : null;
      const bugle = e ? e.bugle : o.how === 'domination' ? 'LOTTIE\'S OWNS THE BAY!' : `PAST ${whole(s.settings.target)}!`;
      return `<div class="cl-modal-bg"><div class="cl-card-big cl-end" data-testid="victory">
        ${tape(esc(bugle), 'cl-big')}
        ${e ? `<div class="cl-lottie"><span class="cl-doodle">${ART.lottie()}</span><span>"${esc(e.lottie)}"</span></div>` : ''}
        ${everyLastPlot(s) ? `<span class="cl-note good">Every Last Plot!</span>` : ''}
        ${stats}
        <button class="cl-sleep" data-action="keepSqueezing" data-testid="keep-squeezing">${ART.sky('hot')}<span>Keep squeezing</span></button>
        <button class="cl-link" data-action="setup">New game</button>
      </div></div>`;
    }
    const lost = o.how === 'squeezed'
      ? { title: 'Squeezed Out', line: 'Three days in the red, kiddo. Even lemons need sugar.' }
      : { title: 'Run Out of Town', line: 'Every empire starts again on a corner.' };
    return `<div class="cl-modal-bg"><div class="cl-card-big cl-end" data-testid="game-over">
      ${tape(lost.title, 'cl-big')}
      <div class="cl-lottie"><span class="cl-doodle">${ART.lottie()}</span><span>"${lost.line}"</span></div>
      ${stats}
      ${hud.canReload ? `<button class="cl-sleep" data-action="reloadDawn" data-testid="reload-dawn">${ART.egg()}<span>Try that day again</span></button>${dawnPicks(hud.dawns)}` : s.settings.ironman ? '<span class="cl-note">Ironman: this run is over.</span>' : ''}
      <button class="cl-link" data-action="setup">New game</button>
    </div></div>`;
  }

  void actName; void actOf; void ORDER_TIERS;
  return hud;
}
