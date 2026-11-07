// The HUD in the Kitchen-Table Clay look (spec: Player experience, "Show, don't
// tell"): four props along the top, one goal sticky note, a wooden morning dock,
// a day's-end card and picture-card sheets for Grow and Defend. Words are kept
// to a few per line; exact numbers live in title tooltips (hover or long-press).
// Buttons carry data-action and go through one listener.
import {
  averageStopChance, BRAND_TIERS, campaignCost, CAMPAIGNS, canBuildStand, canBuyBrand, canBuyPlot, canRunCampaign, ceilingFor, priceCeiling, topPriceMods,
  canUpgradeStand, CLOSE, costPerCup, DISTRICT_BY_ID, expectedCups, expectedPassersby, FACTIONS, lemonsExpiringTomorrow,
  lottieGoals, maxPacks, OPEN, PLOT_BY_ID, playerStands, RECIPES, peaceful, customDefaults,
  selectedStand, servingsAvailable, STAND_LEVELS, standLevel, stock, successScore, SUPPLIES, WEATHER,
  isSpoiled, PERIMETERS, SQUAD_CAP, threatLevel,
  type GadgetId, type GearId, type RaidObjective, type Specialty, type WeaponId,
  canBuildFacility, DEAL_LOADS, dealShortfallPerDay, FACILITIES, facilitiesFor, ORDER_TIERS,
  type FacilityKind, RANKS,
  canAssault, canFactionBuyout, canPlotBuyout, canTruce, factionBuyoutPrice, hasBuilding, HQS, isWrecked, plotBuyoutPrice,
  plotPrice, rivalStatus, SITDOWN_RANK, truceCost,
  actName, actOf, canBorrow, cookieJarReady, DIFFICULTY, difficulty, ENDINGS, everyLastPlot,
  isEndless, loanLimit, loanPayment, MODES, redDaysLeft, deliveryRaidRisk, raidPauses,
  type Difficulty, type Mode, type Settings, type WinCondition,
  type Blocker, type CampaignId, type GameState, type RecipeId, type RivalId, type StandLevel, type SupplyId, type Sweetness,
  tasteOffToday, type FestivalId, bugleHeadline, iceMachineOn, hayBales,
} from '../sim/economy.ts';
import type { ScoreEntry, SlotInfo, Slots } from '../save.ts';
import { DEFAULT_OPTIONS, tempText, type KeyAction, type Options } from '../settings.ts';
import * as A from './clay.ts';
import { alertCards } from './alerts.ts';
import { damageHere, damageTickets, rebuildButton, rebuildTickets, stormTicket, wreckNote } from './damage.ts';
import { eveningBar, fenceHere, guardsHere, repairCards } from './evening.ts';
import { schemeNote, schemeTickets } from './schemes.ts';
import { optionsScreen } from './options.ts';
import { recipeRow } from './recipes.ts';
import { calendarTickets, tasteOffLine, worldAction, worldSheet, worldTabs, type WorldTab } from './calendar.ts';
import { tripLines } from './trips.ts';
import { dawnPicks, savesPanel } from './saves.ts';
import { isFullMenu, menuScreen, menuUnlocked, type MenuView } from './menus.ts';
import { keysPanel } from './keys.ts';
import { attachTips } from './tips.ts';
import { cashTip, dayTip, repTip, scoreTip, threatTip } from './meters.ts';
import { customPanel, difficultyLabel, pickCustom } from './custom.ts';
import { standPanel } from './stand.ts';
import { bennyPitch, storyDateline, taught } from '../sim/story.ts';
import { goalCard, offerTicket, sceneTicket, withScene } from './story.ts';
import { eventTickets, kidStandCard } from './events.ts';
import { radioTicket, toggleSoundtrack, tuneRadio } from './radio.ts';
import { clubhouseRoom } from './clubhouse.ts';
import { fightBar } from './fight.ts';
import { bottleStock, matchButton, orderGoods, orderTicket } from './orders.ts';
import { clubKit, crewPanel, crewSheet, defenseSheet, guardFace } from './crew.ts';
import { createRaidPlanner } from './raidPlanner.ts';
import { auctionControls, landNotes, priceTip } from './registry.ts';

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
  | { type: 'campaign'; id: CampaignId; plot?: string } // plot: a ticket's stand (else the selected one)
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
  | { type: 'autoRepair'; plot: string } // Auto-Repair (Rank 3): skip this plot, or take it back on
  | { type: 'hire'; id: string }
  | { type: 'fire'; id: string }
  | { type: 'post'; id: string; plot: string | null }
  | { type: 'equip'; id: string; item: WeaponId | GearId }
  | { type: 'promote'; id: string; specialty: Specialty }
  | { type: 'clubhouse'; plot?: string } // the next beds: a new Clubhouse, or a level on this one
  | { type: 'club'; id: string; plot: string } // a guard off post waits at this Clubhouse
  | { type: 'fight'; cmd: 'rally' | 'fallBack' } // a button on the live fight (src/ui/fight.ts)
  | { type: 'bell'; raid: string } // Ring the Bell: the Clubhouse reserve in range sets out (warning card, fight bar)
  | { type: 'raid'; plot: string; guards: string[]; objective: RaidObjective; when: 'now' | 'tonight' }
  | { type: 'scout'; id: string; plot: string }
  | { type: 'replay'; index: number }
  | { type: 'defend'; plot: string }
  | { type: 'mute' }
  | { type: 'facility'; plot: string; kind: FacilityKind }
  | { type: 'accept'; id: string; match?: boolean } // world: match bids a rival's price for the contract (vip.ts)
  | { type: 'decline'; id: string }
  | { type: 'truce'; rival: RivalId }
  | { type: 'plotBuyout'; plot: string }
  | { type: 'takeover'; plot: string; sell: boolean } // FizzCo's buyout offer: Sell or No
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
  | { type: 'menu'; id: MenuView | null } // open (or put away) a menu; null puts away whatever is up
  | { type: 'remap'; key: KeyAction } // Options: the next key pressed does this
  | { type: 'resetKeys' }
  | { type: 'turn'; dir: 1 | -1 } // the corner's quarter-turn buttons (Q and E)
  | { type: 'priceCeiling' } // set the selected stand's price to its ceiling
  | { type: 'skipScene' }
  | { type: 'sceneReply'; text: string }
  | { type: 'forgive'; plot: string } // Captain Squawk's card: let it go
  | { type: 'kidRaid'; plot: string } // Kids' Lemonade Day: raid a kid stand (0.5 star, a front page, Lottie's respect)
  | { type: 'storyOffer'; accept: boolean } // Act 3: Preston's Truce offer at Dot's
  | { type: 'bid'; plot: string; amount: number }
  | { type: 'unbid'; plot: string }
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

/** The clay pieces a panel module draws with (crew.ts, raidPlanner.ts). */
export interface Kit {
  ART: typeof ART;
  btn: (action: string, label: string, b?: Blocker, extra?: string, cls?: string) => string;
  card: (art: string, title: string, sub: string, action: string, tip?: string, extra?: string) => string;
  tape: typeof tape; meter: typeof meter; pips: typeof pips; locked: typeof locked; esc: typeof esc; whole: typeof whole;
  GADGET_ART: typeof GADGET_ART; WEAPON_ART: typeof WEAPON_ART;
}

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
  /** The menu that's up (src/ui/menus.ts): full-screen paper, Lottie's goals note, or the list of menus. */
  menu: MenuView | null;
  /** Options: the action waiting for its new key. */
  remap: KeyAction | null;
  /** Seconds into the story scene that's playing (main.ts keeps it). */
  sceneTime: number;
}

export function createHud(root: HTMLElement, onAction: (a: Action) => void): Hud {
  root.classList.add('clay');
  root.innerHTML = `<div class="cl-lens" aria-hidden="true"><i class="t"></i><i class="b"></i><i class="v"></i></div>
    <div id="top"></div><div id="dawn"></div><div id="feed"></div><div id="phase"></div><div id="plotcard"></div><div id="corner"></div><div id="pops"></div>`;
  const q = (id: string) => root.querySelector('#' + id) as HTMLElement;
  attachTips(root); // touch: long-press explains what hover explains
  const topEl = q('top'), dawnEl = q('dawn'), feedEl = q('feed'), phaseEl = q('phase'), plotEl = q('plotcard'), cornerEl = q('corner'), pops = q('pops');
  let tab: 'today' | 'grow' | 'crew' | WorldTab = 'today';
  let books = false, moreOpts = false, standMath = false;
  let ledgerDay = -1; // each Evening opens on its Ledger
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
    menu: null,
    remap: null,
    sceneTime: 0,
    render(s, speed) {
      if (s.phase === 'report' && ledgerDay !== s.day) { ledgerDay = s.day; hud.ledger = true; }
      const modal = hud.setup ? setupScreen(hud.setup.settings, hud.setup.cancel)
        : hud.optionsOpen ? optionsScreen(hud.options, s, savesPanel(s, hud.slots), keysPanel(hud.options, hud.remap))
        : outcomeScreen(s) || (isFullMenu(hud.menu) ? menuScreen(s, hud.menu!, { head: bugleHeadline(s), goals: lottieGoals(s), crew: () => crewPanel(kit, s) || defenseSheet(kit, s, s.selected), options: hud.options }) : '');
      root.toggleAttribute('data-night', s.phase === 'report' || s.phase === 'night');
      if (root.dataset.text !== String(hud.options.textSize)) root.dataset.text = String(hud.options.textSize);
      root.toggleAttribute('data-calm', hud.options.reducedMotion);
      set(topEl, modal && hud.setup ? '' : topbar(s));
      const head = !modal && s.phase === 'prep' ? bugleHeadline(s) : null; // world: the Bugle's headline (sim/media.ts)
      set(dawnEl, head ? `<div class="cl-toast cl-dawn" role="status" data-day="${s.day}">${tape(esc(head[0]), 'cl-big')}${tape(esc(head[1]), 'cl-sub')}</div>` : '');
      set(feedEl, modal ? '' : withScene(feed(s), sceneTicket(s, hud.sceneTime, ART.lottie()) + offerTicket(s)));
      tuneRadio(feedEl, performance.now()); // world: the morning show on 101.5 turns in place (src/ui/radio.ts)
      set(cornerEl, corner(s, speed));
      set(phaseEl, modal || (s.fight ? fightBar({ tape, ART }, s) : s.phase === 'prep' ? prepPanel(s) : s.phase === 'open' ? dayBar(s) : s.phase === 'report' ? (hud.ledger ? dayEnd(s) : eveningBar()) : ''));
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
      case 'campaign': onAction({ type: 'campaign', id: d.id as CampaignId, plot: d.plot }); break;
      case 'select': onAction({ type: 'select', plot: d.plot! }); break;
      case 'buyPlot': onAction({ type: 'buyPlot', plot: d.plot! }); break;
      case 'build': onAction({ type: 'build', plot: d.plot! }); break;
      case 'close-plot': onAction({ type: 'inspect', plot: null }); break;
      case 'view': onAction({ type: 'view', target: d.target as 'home' | 'bay' }); break;
      case 'tab': tab = (tab === d.tab && d.tab !== 'today' ? 'today' : d.tab) as typeof tab; redraw(); break;
      case 'goals': onAction({ type: 'menu', id: 'goals' }); break;
      case 'fold': unfolded = !unfolded; redraw(); break;
      case 'menu': onAction({ type: 'menu', id: (d.menu || null) as MenuView | null }); break;
      case 'inspect': onAction({ type: 'inspect', plot: d.plot! }); break;
      case 'remap': onAction({ type: 'remap', key: d.key as KeyAction }); break;
      case 'resetKeys': onAction({ type: 'resetKeys' }); break;
      case 'turn': onAction({ type: 'turn', dir: d.dir === '-1' ? -1 : 1 }); break;
      case 'radio': toggleSoundtrack(); redraw(); break; // world: 101.5 all day, or mornings only
      case 'books': books = !books; redraw(); break;
      case 'standMath': standMath = !standMath; redraw(); break;
      case 'inspect': onAction({ type: 'inspect', plot: d.plot! }); break;
      case 'more': moreOpts = !moreOpts; redraw(); break;
      case 'perimeter': case 'repairFence': case 'rebuild': case 'defend': onAction({ type: d.action, plot: d.plot! }); break;
      case 'gadget': onAction({ type: 'gadget', plot: d.plot!, id: d.id as GadgetId }); break;
      case 'repair': case 'autoRepair': onAction({ type: d.action, plot: d.plot! }); break;
      case 'hire': case 'fire': onAction({ type: d.action, id: d.id! }); break;
      case 'post': onAction({ type: 'post', id: d.id!, plot: d.plot || null }); break;
      case 'equip': onAction({ type: 'equip', id: d.id!, item: d.item as WeaponId | GearId }); break;
      case 'promote': onAction({ type: 'promote', id: d.id!, specialty: d.value as Specialty }); break;
      case 'clubhouse': onAction({ type: 'clubhouse', plot: d.plot }); break;
      case 'club': onAction({ type: 'club', id: d.id!, plot: d.plot! }); break;
      case 'fight': onAction({ type: 'fight', cmd: d.cmd as 'rally' | 'fallBack' }); break;
      case 'bell': onAction({ type: 'bell', raid: d.raid! }); break;
      case 'squad': case 'squadAll': case 'objective': case 'raid': case 'scout': planner.click(d); break;
      case 'replay': onAction({ type: 'replay', index: Number(d.index) }); break;
      case 'facility': onAction({ type: 'facility', plot: d.plot!, kind: d.kind as FacilityKind }); break;
      case 'accept': case 'decline': onAction({ type: d.action, id: d.id! }); break;
      case 'match': onAction({ type: 'accept', id: d.id!, match: true }); break; // world: bid the rival's price
      case 'truce': case 'factionBuyout': onAction({ type: d.action, rival: d.rival as RivalId }); break;
      case 'plotBuyout': onAction({ type: 'plotBuyout', plot: d.plot! }); break;
      case 'takeover': onAction({ type: 'takeover', plot: d.plot!, sell: d.sell === '1' }); break;
      case 'assault': onAction({ type: 'assault', rival: d.rival as RivalId, guards: [...planner.squad] }); planner.squad.clear(); break;
      case 'sleep': books = false; onAction({ type: 'sleep' }); break;
      case 'night': books = false; onAction({ type: 'night' }); break;
      case 'evening': case 'ledger': onAction({ type: d.action }); break;
      case 'goto': case 'restockNow': onAction({ type: d.action, plot: d.plot! }); break;
      case 'dismiss': case 'watch': onAction({ type: d.action, id: d.id! }); break;
      case 'options': onAction({ type: 'options' }); break;
      case 'option': onAction({ type: 'option', key: d.key!, value: d.value }); break;
      case 'open': case 'skip': case 'newgame': case 'upgrade': case 'brand': case 'restock': case 'mute': case 'priceCeiling':
      case 'setup': case 'cancelSetup': case 'keepSqueezing': case 'repay':
        onAction({ type: d.action }); break;
      case 'reloadDawn': onAction({ type: 'reloadDawn', slot: d.slot === undefined ? undefined : Number(d.slot) }); break;
      case 'saveSlot': onAction({ type: 'saveSlot', slot: Number(d.slot) }); break;
      case 'loadSlot': onAction({ type: 'loadSlot', slot: Number(d.slot), dawn: d.dawn === '1' }); break;
      case 'borrow': onAction({ type: 'borrow', amount: Number(d.amount) }); break;
      case 'entry': case 'sponsor': case 'forgive': case 'kidRaid': onAction(worldAction(d)); break;
      case 'skipScene': onAction({ type: 'skipScene' }); break;
      case 'sceneReply': onAction({ type: 'sceneReply', text: d.text ?? '' }); break;
      case 'storyOffer': onAction({ type: 'storyOffer', accept: d.accept === '1' }); break;
      case 'bid': onAction({ type: 'bid', plot: d.plot!, amount: Number(d.amount) }); break;
      case 'unbid': onAction({ type: 'unbid', plot: d.plot! }); break;
      case 'start': if (hud.setup) { const st = hud.setup.settings; onAction({ type: 'start', settings: { ...st, ...(st.difficulty === 'custom' ? { custom: { ...customDefaults(), ...st.custom } } : {}) } }); } break;
      case 'pick': { // New Game screen choices
        const st = hud.setup?.settings;
        if (!st) break;
        if (d.key === 'mode') st.mode = d.value as Mode;
        if (d.key === 'difficulty') st.difficulty = d.value as Difficulty;
        if (d.key?.startsWith('custom.')) pickCustom(st, d.key.slice(7), d.value); // Custom's sliders (src/ui/custom.ts)
        if (d.key === 'win') st.win = d.value as WinCondition;
        if (d.key === 'target') st.target = Number(d.value);
        if (d.key === 'peaceful') st.peaceful = !st.peaceful;
        if (d.key === 'ironman') st.ironman = !st.ironman;
        if (d.key === 'raidPause') st.raidPause = !raidPauses(st);
        if (d.key === 'lessons') st.lessons = !(st.lessons ?? true);
        redraw();
        break;
      }
    }
  });

  /** A clay button: one verb, optional price, disabled with its reason as a tooltip. */
  function btn(action: string, label: string, b: Blocker = { ok: true }, extra = '', cls = '') {
    return `<button class="cl-b ${cls}" data-action="${action}" ${extra} ${b.ok ? '' : `disabled title="${esc(b.why)}"`}>${label}</button>`;
  }

  // ---------- top: Cash, the Success Score with its Rank badge, Reputation, Threat; then the day, time, season and
  // weather, and Lottie's sticky. Each meter explains itself (hover, or long-press on touch) and opens its menu. On a
  // phone the bar folds to Cash and the clock until tapped (speed sits in the corner).
  let unfolded = false;
  function topbar(s: GameState) {
    const w = s.phase === 'prep' ? s.forecast : s.weather;
    const ss = successScore(s);
    const r = RANKS[s.rank - 1], next = RANKS[s.rank];
    const lo = r.ss, hi = next?.ss ?? r.ss;
    const pct = (v: number) => (hi > lo ? Math.max(0, Math.min(1, (v - lo) / (hi - lo))) : 1);
    const now = pct(ss), peak = Math.max(now, pct(s.peakScore));
    const threat = threatLevel(s);
    const goalsOpen = hud.menu === 'goals';
    const phone = typeof matchMedia === 'function' && matchMedia('(max-width: 640px)').matches;
    const folded = phone && !unfolded;
    // A meter opens its menu (once that menu's system is open); on a folded phone bar, any tap unfolds it.
    const opens = (id: Parameters<typeof menuUnlocked>[1]) => (folded ? ' data-action="fold" role="button"' : menuUnlocked(s, id) ? ` data-action="menu" data-menu="${id}" role="button"` : '');
    const mode = `${MODES[s.settings.mode].label}${isEndless(s) && s.settings.mode !== 'endless' ? ' · Endless Summer' : ''} · ${difficultyLabel(s.settings.difficulty, s.settings.custom)}${s.settings.ironman ? ' · Ironman' : ''}`;
    const time = s.phase === 'open' || s.phase === 'night' ? clock(s.minute) : '';
    const cash = `<div class="cl-chip cl-cash${s.redDays ? ' red' : ''}" title="${esc(cashTip(s))}" data-testid="cash"${opens('ledger')}>${ART.jar()}${tape(`<b>${whole(s.cash)}</b>`, 'cl-t-cash')}</div>`;
    const dateline = storyDateline(s); // the campaign's act
    const day = `<div class="cl-chip cl-day" title="${esc(dayTip(s, mode) + (dateline ? `\n${dateline}` : ''))}"${opens('bugle')}>${ART.egg()}${tape(time && phone ? time : time ? `Day ${s.day} · ${time}` : `Day ${s.day}`)}</div>`;
    const fold = (open: boolean) => `<button class="cl-knob-s" data-action="fold" data-testid="topbar-fold" title="${open ? 'Fold the top bar' : 'The whole top bar'}" aria-label="${open ? 'Fold the top bar' : 'Show the whole top bar'}" aria-expanded="${open}">${A.glyph(open ? 'up' : 'more')}</button>`;
    // Folded, Lottie's goal card still sits at the right edge: there's always a next goal in view.
    if (folded) return `<div class="cl-left">${cash}</div><div class="cl-right">${day}${goalCard(s, goalsOpen, ART.lottie())}${fold(false)}</div>`;
    const temp = tempText(hud.options, w.temp);
    return `<div class="cl-left">
        ${cash}
        ${taught(s, 'rank') ? `<div class="cl-chip cl-rank" title="${esc(scoreTip(s) + (peak > now ? '\n(Striped: invested in buildings, it fills back in)' : ''))}"${opens('rank')}>${ART.rosette()}${tape(`R${s.rank}`, 'cl-t-rank')}<span class="cl-snake" style="--v:${now.toFixed(3)};--p:${peak.toFixed(3)}"><i></i><u></u></span><span class="sr" data-testid="score">${Math.round(ss)}</span></div>` : ''}
        <div class="cl-chip" title="${esc(repTip(s))}" data-testid="reputation">${ART.star(true)}${tape(s.reputation.toFixed(1))}</div>
        ${threat >= 2 && !peaceful(s) && taught(s, 'threat') ? `<div class="cl-chip cl-threat" title="${esc(threatTip(s))}" data-testid="threat"${opens('corkboard')}>${Array.from({ length: threat }, () => ART.sour()).join('')}</div>` : ''}
        ${s.bottles ? `<div class="cl-chip" title="Bottles ready for big orders: ${esc(bottleStock(s))}"${opens('orders')}>${ART.crate()}${tape(s.bottles.toLocaleString('en-US'))}</div>` : ''}
      </div>
      <div class="cl-right">
        ${day}
        ${taught(s, 'forecast') ? `<div class="cl-chip cl-wx" title="${WEATHER[w.kind].label}, ${temp}${s.phase === 'prep' ? '\nForecast: right about 4 days in 5' : ''}">${ART.sky(w.kind)}${tape(temp.slice(0, -1))}</div>` : ''}
        ${goalCard(s, goalsOpen, ART.lottie())}
        ${phone ? fold(true) : ''}
      </div>
`;
  }

  // ---------- bottom right: views, sound, options, new game and (while the clock runs) speed ----------
  function corner(s: GameState, speed: number) {
    const k = (action: string, inner: string, title: string, extra = '', on = false) => `<button class="cl-knob-s${on ? ' on' : ''}" data-action="${action}" ${extra} title="${title}" aria-label="${title}">${inner}</button>`;
    const views = k('view', A.glyph('home'), 'Back to your stand', 'data-target="home"') + k('view', A.glyph('bay'), 'Bay View', 'data-target="bay"')
      + k('turn', A.glyph('turnL'), 'Turn the view left (Q)', 'data-dir="-1"') + k('turn', A.glyph('turnR'), 'Turn the view right (E)', 'data-dir="1"')
      + k('menu', A.glyph('menu'), 'Menus', 'data-menu="index" data-testid="menus"') + k('mute', A.glyph(hud.muted ? 'musicOff' : 'music'), 'Music on/off') + k('options', A.glyph('gear'), 'Options', 'data-testid="options-open"') + k('setup', A.glyph('plus'), 'New game');
    // Pause anywhere the clock (or a show) runs: business hours, the night, the Evening's moment on the map, Morning
    // Prep when it starts the day by itself, and any brawl or VIP scene on screen.
    const counting = !s.outcome && (s.phase === 'prep' ? hud.options.autoContinue : s.phase === 'report' && (!hud.ledger || hud.options.autoContinue));
    const running = s.phase === 'open' || s.phase === 'night' || counting || hud.playing;
    if (!running) return `<div class="cl-corner">${views}</div>`;
    const sb = (v: number, label: string) => k('speed', label, `Speed ${v ? v + '×' : 'pause'} (keys: space, 1, 2, 3)`, `data-value="${v}"`, speed === v);
    const skip = s.phase === 'open' ? k('skip', A.glyph('skip'), 'Finish the day (stops at big alerts)') : s.phase === 'night' ? k('sleep', A.glyph('skip'), 'Skip to dawn (stops at big alerts)', 'data-testid="next"') : '';
    return `<div class="cl-corner">${views}<span class="cl-gap"></span>${sb(0, A.glyph('pause'))}${sb(1, A.glyph('play'))}${sb(2, A.glyph('play2'))}${sb(3, A.glyph('play3'))}${skip}</div>`;
  }

  // ---------- left feed: little tickets for whatever needs you this morning ----------
  function feed(s: GameState) {
    const t: string[] = alertCards(s); // the alert feed (src/ui/alerts.ts), in every phase
    t.push(...schemeTickets(s)); // rival schemes: price wars near you, smear posters (src/ui/schemes.ts)
    t.push(...eventTickets(s)); // world: today's random events, each with its counter-play (src/ui/events.ts)
    const radio = radioTicket(s, hud.options.captions, hud.options.celsius); if (radio) t.push(radio); // world: 101.5 The Squeeze, Cal Clementine on the air, with captions on (src/ui/radio.ts)
    if (s.phase !== 'prep') { // after the morning: repairs to approve, then today's (and tonight's) fights, each with a replay
      if (s.phase === 'report' || s.phase === 'night') t.push(...repairCards(s));
      for (const { b, i } of s.battles.map((b, i) => ({ b, i })).filter(({ b }) => b.day === s.day)) {
        const good = (b.attacker === 'player') === (b.outcome === 'smashed' || b.outcome === 'robbed');
        t.push(`<div class="cl-ticket ${good ? 'good' : 'red'}" title="${esc(fightLine(b))}">${b.attacker === 'player' ? ART.raid() : ART.shield()}<b>${esc(fightShort(b))}</b>${btn('replay', `${A.glyph('play')} Watch`, { ok: true }, `data-index="${i}" data-testid="replay"`)}</div>`);
      }
      return t.length ? `<div class="cl-feed">${t.join('')}</div>` : '';
    }
    const st = selectedStand(s);
    if (s.redDays) {
      const left = redDaysLeft(s);
      const jar = difficulty(s).cookieJar === 'always' || cookieJarReady(s) ? 'Cookie Jar can cover you' : 'Cookie Jar is empty';
      const need = Math.ceil(-s.cash / 50) * 50;
      t.push(`<div class="cl-ticket red" data-testid="in-the-red" title="${jar}">${ART.piggy()}<b>In the Red! ${left} day${left === 1 ? '' : 's'}</b>${need > 0 && canBorrow(s, need).ok ? btn('borrow', `Borrow ${whole(need)}`, { ok: true }, `data-amount="${need}" data-testid="borrow"`) : ''}</div>`);
    }
    t.push(...stormTicket(s), ...rebuildTickets(s), ...damageTickets(s)); // a Storm forecast, smashed and Damaged buildings (src/ui/damage.ts)
    for (const { b, i } of s.battles.map((b, i) => ({ b, i })).filter(({ b }) => b.day === s.day - 1 || b.day === s.day)) {
      const good = (b.attacker === 'player') === (b.outcome === 'smashed' || b.outcome === 'robbed');
      t.push(`<div class="cl-ticket ${good ? 'good' : 'red'}" title="${esc(fightLine(b))}">${b.attacker === 'player' ? ART.raid() : ART.shield()}<b>${esc(fightShort(b))}</b>${btn('replay', `${A.glyph('play')} Watch`, { ok: true }, `data-index="${i}" data-testid="replay"`)}</div>`);
    }
    if (isSpoiled(s, s.plots[s.selected])) t.push(`<div class="cl-ticket red" title="A Sabotage ruined the stock: this stand sells nothing today">${ART.sour()}<b>Stock spoiled: closed today</b></div>`);
    t.push(...calendarTickets(s));
    if (s.today.lemonsSpoiled) t.push(`<div class="cl-ticket">${ART.lemon()}<b>${s.today.lemonsSpoiled} lemons went bad</b></div>`);
    for (const o of s.offers) {
      const short = o.tier === 'deal' ? dealShortfallPerDay(s, o) : 0;
      const when = o.tier === 'deal' ? `in ${DEAL_LOADS} weekly loads` : `by day ${o.due}`;
      const fit = o.tier === 'deal' ? (short > 0 ? `. Your bottling is ${short.toLocaleString('en-US')} a day short` : '. Your bottling covers it') : '';
      const risk = deliveryRaidRisk(s, o) ? `<span class="cl-short" title="Rivals may raid this pickup">${ART.raid()}</span>` : '';
      t.push(`<div class="cl-ticket order${short > 0 ? ' warn' : ''}" data-testid="orders" title="${esc(o.client)}: ${esc(orderGoods(s, o))} ${when}${fit}${risk ? '. Rivals may raid the pickup' : ''}">${ART.crate()}<b>${ORDER_TIERS[o.tier].label}: ${whole(o.pay)}</b>${short > 0 ? `<span class="cl-short" title="Bottling too slow">${ART.sour()}</span>` : ''}${risk}
        <span class="cl-acts">${btn('accept', 'Take it', { ok: true }, `data-id="${o.id}" data-testid="accept"`)}${matchButton(s, o)}${btn('decline', A.glyph('close'), { ok: true }, `data-id="${o.id}" title="No thanks" aria-label="No thanks"`, 'ghost')}</span></div>`);
    }
    for (const o of s.orders) t.push(orderTicket(s, o)); // world: due when, and how far its pickups have loaded (src/ui/orders.ts)
    const servings = servingsAvailable(st);
    if (servings === 0 && !st.autoRestock && !st.wrecked && taught(s, 'market') && !isSpoiled(s, s.plots[s.selected])) t.push(`<div class="cl-ticket">${ART.lottie()}<b>Buy lemons and sugar!</b></div>`);
    return t.length ? `<div class="cl-feed">${t.join('')}</div>` : '';
  }

  // ---------- the morning: tabs, stand picker, Grow/Defend sheets and the wooden dock ----------
  /** Defend opens with Day 5's lesson; with lessons off it follows rank, and the Picket Fence is a Rank 1 unlock. */
  function defendOpen(s: GameState) {
    return taught(s, 'defense') || s.battles.length > 0 || playerStands(s).some((p) => s.plots[p.id].defense.tier > 0);
  }

  function prepPanel(s: GameState) {
    if (tab === 'crew' && !defendOpen(s)) tab = 'today';
    if (tab === 'fair' && !tasteOffToday(s)) tab = 'today';
    if (tab === 'grow' && !taught(s, 'upgrade')) tab = 'today';
    if (tab === 'book' && !taught(s, 'recipes')) tab = 'today';
    const tabs = `<div class="cl-tabs">
      <button class="cl-tab${tab === 'today' ? ' on' : ''}" data-action="tab" data-tab="today">Today</button>
      ${taught(s, 'upgrade') ? `<button class="cl-tab${tab === 'grow' ? ' on' : ''}" data-action="tab" data-tab="grow" data-testid="tab-grow">Grow</button>` : ''}
      ${defendOpen(s) ? `<button class="cl-tab${tab === 'crew' ? ' on' : ''}" data-action="tab" data-tab="crew" data-testid="tab-crew">Defend</button>` : ''}
      ${taught(s, 'recipes') ? worldTabs(s, tab) : ''}
      ${standPicker(s)}</div>`;
    const sheet = tab === 'grow' ? `<div class="cl-sheet">${growPanel(s)}</div>` : tab === 'crew' ? `<div class="cl-sheet">${crewSheet(kit, s, s.selected)}</div>`
      : tab === 'book' || tab === 'fair' || tab === 'bugle' ? `<div class="cl-sheet">${worldSheet(s, tab, hud.options.celsius)}</div>` : '';
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
    const ceiling = priceCeiling(s, plotId);
    const lit = Math.max(1, Math.min(5, Math.ceil((stop / 0.45) * 5)));
    const expiring = lemonsExpiringTomorrow(s, st);
    const short = (id: SupplyId) => {
      if (st.autoRestock) return false;
      if (id === 'ice') return !iceMachineOn(s, plotId) && st.inventory.ice < RECIPES[st.recipe].icePerCup * Math.min(cups, Math.max(servings, 1)); // world: the L4+ ice machine
      return servings < cups * 0.8;
    };
    const lvl = SWEET.indexOf(st.sweetness);
    const cube = (i: number) => `<button class="cl-cube" data-action="sweet" data-value="${SWEET[i]}" aria-pressed="${i <= lvl}" title="Sweetness: ${['less', 'classic', 'extra'][i]}">${ART.cube()}</button>`;
    const art: Record<SupplyId, (l: string) => string> = { lemons: ART.bowl, sugar: ART.bag, ice: ART.tray };
    // The stand's crate, sack and cooler show how full each is; the dock only buys and warns.
    const gauge = (id: SupplyId) => {
      const sp = SUPPLIES[id];
      const max = maxPacks(s, st, id);
      const note = id === 'ice' ? (iceMachineOn(s, plotId) ? 'the ice machine makes it' : 'melts tonight') : id === 'lemons' ? (expiring ? `${expiring} spoil tomorrow` : 'keep 3 days') : 'keeps';
      return `<div class="cl-gauge" title="${sp.label}: ${stock(st, id)}/${sl.storage[id]} (${note})">
        <span class="cl-fill"${short(id) ? ' data-low' : ''} data-fill="${id}" style="--fill:1"><span class="l b">${art[id]('back')}</span><span class="l f">${art[id]('fill')}</span><span class="l t">${art[id]('top')}</span></span>
        <button class="cl-add" data-action="buy" data-id="${id}" data-packs="1" data-fill-packs="${Math.max(1, max)}" ${max < 1 ? 'disabled' : ''} title="+${sp.pack} ${sp.unit} for ${money(sp.pack * s.market[id])} (hold to fill up)" aria-label="Buy ${sp.label}"></button></div>`;
    };
    const restock = `<button class="cl-auto${st.autoRestock ? ' on' : ''}" data-action="restock" title="Auto-Restock: Lottie buys what this stand needs each morning">${tape(st.autoRestock ? 'Auto ✓' : 'Auto')}</button>`;
    const n = playerStands(s).length;
    return `<div class="cl-tray">
      ${taught(s, 'recipes') ? `<div class="cl-sec cl-recipe">${recipeRow(s)}<div class="cl-row cl-cubes">${[0, 1, 2].map(cube).join('')}</div></div>` : ''}
      <div class="cl-sec cl-price"><div class="cl-row"><button class="cl-knob cl-minus" data-action="price" data-delta="-0.05" aria-label="Lower price"></button>
        <div class="cl-chalk${st.price < cost ? ' loss' : ''}${st.price > ceiling + 1e-9 ? ' over' : ''}" data-action="priceCeiling" title="Top price ${cents(ceiling)}: past it, buyers walk off. Costs you ${cents(cost)} a cup. Tap to price at the top"><b data-testid="price">${cents(st.price)}</b><i data-testid="ceiling">top ${cents(ceiling)}</i></div>
        <button class="cl-knob cl-plus" data-action="price" data-delta="0.05" aria-label="Raise price"></button></div>
        <div class="cl-row cl-crowd" data-action="inspect" data-plot="${plotId}" title="About ${Math.round(stop * 100)}% of ~${Math.round(people)} walkers stop: ~${cups} cups. Tap for the math">${[0, 1, 2, 3, 4].map((i) => `<i aria-pressed="${i < lit}">${ART.head(i)}</i>`).join('')}</div></div>
      ${taught(s, 'market') ? `<div class="cl-sec cl-stock"><div class="cl-row">${(Object.keys(SUPPLIES) as SupplyId[]).map(gauge).join('')}</div>${restock}</div>` : ''}
      <button class="cl-open" data-action="open" data-testid="open" aria-label="Open ${n > 1 ? 'all stands' : 'the stand'}" title="Open at ${clock(OPEN)}"><span class="cl-btn"></span>${tape('OPEN', 'cl-t-open')}</button>
    </div>`;
  }

  // ---------- Grow: picture cards ----------
  const card = (art: string, title: string, sub: string, action: string, tip = '', extra = '') => `<div class="cl-card" ${tip ? `title="${esc(tip)}"` : ''} ${extra}><span class="cl-pic">${art}</span><span class="cl-txt"><b>${title}</b>${sub ? `<i>${sub}</i>` : ''}</span>${action}</div>`;
  const kit: Kit = { ART, btn, card, tape, meter, pips, locked, esc, whole, GADGET_ART, WEAPON_ART };
  const clubs = clubKit(kit); // the Clubhouse panels (src/ui/clubhouse.ts) draw with it
  const planner = createRaidPlanner(kit, redraw, onAction);
  function levelStats(l: StandLevel, top: number) {
    return `${l.capacityPerHour} cups/hour · draws ×${l.draw} · top price ${money(top)} here · upkeep ${money(l.upkeep)}/day · holds ${l.storage.lemons} lemons`;
  }
  function growPanel(s: GameState) {
    const st = selectedStand(s);
    const cur = standLevel(st);
    // The top price at this stand: the level's top × the district's tolerance × the card's bonus (the price tag's ceiling).
    const topAt = (l: StandLevel) => ceilingFor(l.level, PLOT_BY_ID[s.selected].district, st.recipe, topPriceMods(s, s.selected));
    const next = STAND_LEVELS[cur.level];
    const top = STAND_LEVELS[STAND_LEVELS.length - 1];
    const bars = (l: StandLevel) => `<span class="cl-bars"><span>${ART.cup()}${meter(l.capacityPerHour / top.capacityPerHour)}</span><span>${ART.head(1)}${meter(l.draw / top.draw)}</span><span>${ART.crate()}${meter(l.storage.lemons / top.storage.lemons)}</span></span>`;
    const up = canUpgradeStand(s);
    const out: string[] = [];
    if (next && !locked(up)) out.push(card(ART.stand(next.level), `${next.name}`, bars(next), btn('upgrade', whole(next.cost), up, 'data-testid="upgrade"', 'go'), `Now: ${levelStats(cur, topAt(cur))}\nNext: ${levelStats(next, topAt(next))}`, 'data-big'));
    else if (!next) out.push(card(ART.stand(cur.level), cur.name, 'Top of the line!', ''));
    for (const id of Object.keys(CAMPAIGNS) as CampaignId[]) {
      const c = CAMPAIGNS[id], b = canRunCampaign(s, id);
      if (locked(b) || (!b.ok && /Only for/.test(b.why)) || !taught(s, 'marketing')) continue;
      const cost = campaignCost(s, id); // Word of Mouth halves it
      out.push(card(id === 'sandwichBoard' ? ART.board() : ART.sample(), c.name.replace('Sandwich-Board Kid', 'Sign kid').replace('Free Sample Day', 'Free samples'), `${c.costPerDay ? `${whole(cost.cash)} a day` : `${cost.samples} cups`}${cost.half ? ' · half off' : ''}`, btn('campaign', 'Run', b, `data-id="${id}"`), `Benny: "${bennyPitch(id)}"\n${c.blurb}${cost.half ? '. Word of Mouth: half price' : ''}`));
    }
    const nb = BRAND_TIERS[s.brandTier], bb = canBuyBrand(s);
    if (nb && !locked(bb) && taught(s, 'marketing')) out.push(card(ART.megaphone(), nb.name, 'every stand', btn('brand', whole(nb.cost), bb, 'data-testid="brand"'), `Benny: "${bennyPitch(nb.tier)}"\n+${Math.round(nb.traffic * 100)}% foot traffic at every stand, forever`));
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

  // ---------- selling: a cup counter; the crowd shows the rest ----------
  function dayBar(s: GameState) {
    const pct = (s.minute - OPEN) / (CLOSE - OPEN);
    const w = s.today.walkedPast;
    const why = [['not thirsty', w.notThirsty], ['too pricey', w.pricey], ['line too long', w.line], ['sold out', w.soldOut], ['went to a rival', w.rival]]
      .filter(([, n]) => (n as number) > 0).map(([k, n]) => `${n} ${k}`).join(', ');
    const left = playerStands(s).reduce((a, p) => a + servingsAvailable(s.plots[p.id].stand!), 0);
    return `<div class="cl-daybar" data-testid="daybar" data-action="inspect" data-plot="${s.selected}" title="${left} cups left${why ? ` · walked past: ${why}` : ''} · tap for your stand">${ART.cup()}${tape(`<b>${s.today.customers}</b>`, 'cl-t-cash')}<span class="cl-sun" style="--v:${pct.toFixed(3)}"><i></i></span></div>`;
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
        ${taught(s, 'rank') ? `<span class="cl-chip cl-rank sm" title="${r.title}: ${whole(ss)} (${ssDelta >= 0 ? '+' : ''}${Math.round(ssDelta)})">${ART.rosette()}${meter(rv)}</span>` : ''}</div>
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
    const verb = b.sabotage ? (b.outcome === 'robbed' ? 'stock spoiled' : 'no time to spoil the stock') : { smashed: 'smashed', robbed: `robbed (${whole(b.loot)})`, damaged: 'roughed up', repelled: 'held' }[b.outcome];
    if (b.hq) return b.outcome === 'repelled' ? `HQ assault on ${where}: stalled at the ${b.hq}` : `HQ assault on ${where}: captured!`;
    return b.attacker === 'player' ? `Your raid on ${where}: ${b.outcome === 'repelled' ? 'beaten back' : verb}` : `${who(b.attacker)} hit ${where}: ${b.outcome === 'repelled' ? 'you held them off!' : verb}`;
  }
  function fightShort(b: GameState['battles'][number]) {
    if (b.hq) return b.outcome === 'repelled' ? 'HQ held out' : 'HQ captured!';
    if (b.sabotage) return b.outcome === 'robbed' ? (b.attacker === 'player' ? 'Spoiled their stock!' : 'Stock spoiled!') : b.attacker === 'player' ? 'Sabotage foiled' : 'Stock saved!';
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
    const tip = [`${d.name} · ${typeLabel}`, `Owner: ${ownerName(ps.owner)}`, p.type !== 'civic' ? `~${p.baseTraffic} passersby a day · land ${whole(ps.landValue)}` : d.feel,
      st ? `Stand: L${st.level} ${standLevel(st).name} · ${cents(st.price)} a cup` : '', ps.facility ? `Built: ${FACILITIES[ps.facility.kind].names[ps.facility.level - 1]}` : '',
      ps.owner && ps.owner !== 'player' && p.type !== 'civic' ? `Defenses: ${ps.defense.tier ? PERIMETERS[ps.defense.tier - 1].name : 'none'}${hayBales(s, id) ? ' and hay bales' : ''}${ps.garrison ? `, ${ps.garrison} henchmen` : ''}` : '',
      st && s.phase !== 'prep' ? `Today: ${st.day.customers} cups of ${st.day.passersby} walking by` : ''].filter(Boolean).join('\n');
    let actions = '';
    if (!ps.owner && ps.auction && (p.district === 'maple' || taught(s, 'land'))) actions = auctionControls(s, id); // bids follow Week 2's land lesson, like Buy
    else if (!ps.owner && p.type !== 'civic' && p.type !== 'hq') { const b = canBuyPlot(s, id), pt = priceTip(s, id); actions = locked(b) || (p.district !== 'maple' && !taught(s, 'land')) ? `<span class="cl-note">Opens later</span>` : btn('buyPlot', `Buy ${whole(plotPrice(s, id))}`, b, `data-plot="${id}" data-testid="buy-plot"${b.ok && pt ? ` title="${esc(pt)}"` : ''}`, 'go'); }
    else if (ps.owner === 'player' && isWrecked(ps)) actions = rebuildButton(s, id, 'cl-b go'); // overnight, or tonight's booking (src/ui/damage.ts)
    else if (ps.owner === 'player' && !st) {
      const lvl = ps.facility?.level ?? 0;
      const kinds = ps.facility ? [ps.facility.kind] : facilitiesFor(p.type);
      const fac = kinds.filter((kind) => lvl < FACILITIES[kind].names.length).map((kind) => ({ kind, b: canBuildFacility(s, id, kind) })).filter(({ b }) => !locked(b))
        .map(({ kind, b }) => btn('facility', `${FACILITIES[kind].names[lvl]} ${whole(FACILITIES[kind].costs[lvl])}`, b, `data-plot="${id}" data-kind="${kind}" data-testid="facility" title="${esc(FACILITIES[kind].blurb[lvl])}"`, 'go')).join('');
      const stand = p.type === 'field' || p.type === 'dock' || ps.facility ? '' : btn('build', `Table ${whole(STAND_LEVELS[0].cost)}`, canBuildStand(s, id), `data-plot="${id}" data-testid="build"`, 'go');
      actions = stand + fac + clubhouseRoom(clubs, s, id) + (ps.facility ? fenceHere(s, id) : ''); // a pad or pier has no stand panel: fence it here
    }
    // In the Evening and at night the card fences the stand (the Ledger has the day); by day it shows the stand panel,
    // and your own stand answers with its next upgrade (before the Grow tab's lesson too).
    else if (ps.owner === 'player' && st) actions = s.phase === 'report' || s.phase === 'night' ? fenceHere(s, id)
      : (id === s.selected ? upgradeHere(s) : btn('select', 'Manage', { ok: true }, `data-plot="${id}"`)) + standPanel(s, id, standMath);
    else if (ps.owner && ps.owner !== 'player' && p.type === 'hq') actions = hqPanel(s, ps.owner as RivalId);
    else if (ps.owner && ps.owner !== 'player') {
      const pb = canPlotBuyout(s, id);
      actions = (hasBuilding(ps) ? planner.panel(s, id) : '') + (s.rank >= SITDOWN_RANK && !locked(pb) ? btn('plotBuyout', `Buy it ${whole(plotBuyoutPrice(s, id))}`, pb, `data-plot="${id}" data-testid="plot-buyout"`) : '');
    }
    actions = damageHere(s, id) + actions; // the building's HP, and your Damaged one's repair (src/ui/damage.ts)
    if (ps.owner === 'player' && (st || ps.facility) && s.guards.length) actions += guardsHere(s, id, (g) => guardFace(kit, s, g)); // station guards from the map
    actions = kidStandCard(s, id) + actions; // world: a kid stand on the sidewalk here (Kids' Lemonade Day), its raid cost in red first
    const dibs = ps.dibs?.who === 'player' && ps.dibs.until >= s.day ? `<span class="cl-note good" title="Only you can buy it ${ps.dibs.until > s.day ? `through day ${ps.dibs.until}` : 'today'}">${ps.dibs.price !== undefined ? `${ps.dibs.table ? 'Side lot' : 'Fire Sale'} ${whole(plotPrice(s, id))}!` : 'First Dibs!'}</span>` : '';
    return `<div class="cl-plot" data-testid="plotcard">
      <div class="cl-plot-head" title="${esc(tip)}"><span class="cl-dot" style="background:${ownerColor(ps.owner)}"></span>${tape(esc(p.name))}<button class="cl-x" data-action="close-plot" aria-label="Close">${A.glyph('close')}</button></div>
      ${dibs}${schemeNote(s, id)}${wreckNote(s, id)}${landNotes(s, id)}
      <div class="cl-plot-acts">${actions}</div></div>`;
  }

  /** Tapping your stand answers with its next upgrade from Day 1, before the Grow tab's lesson. */
  function upgradeHere(s: GameState) {
    const st = selectedStand(s), next = STAND_LEVELS[st.level];
    const up = canUpgradeStand(s);
    const top = next ? ceilingFor(next.level, PLOT_BY_ID[s.selected].district, st.recipe, topPriceMods(s, s.selected)) : 0; // as the Grow card reads it
    return next && s.phase === 'prep' && !locked(up) ? btn('upgrade', `Upgrade ${whole(next.cost)}`, up, `data-testid="upgrade" title="${esc(next.name)}: ${levelStats(next, top)}"`, 'go') : '';
  }

  /** A rival's HQ: Dot's Diner sit-downs and the assault. */
  function hqPanel(s: GameState, id: RivalId) {
    const st = rivalStatus(s, id);
    const hq = HQS[id];
    const price = factionBuyoutPrice(s, id);
    const head = `<span class="cl-note" title="${st.plots} plots (peak ${st.peak}), worth about ${whole(st.worth)}">${st.weakened ? 'Weakened!' : `${st.plots} plots`}${st.truce ? ` · truce to day ${st.truce}` : ''}</span>`;
    if (s.rank < SITDOWN_RANK) return head;
    const tb = canTruce(s, id), fb = canFactionBuyout(s, id);
    const sit = `<div class="cl-acts">${locked(tb) ? '' : btn('truce', `Truce ${whole(truceCost(s))}`, tb, `data-rival="${id}" data-testid="truce" title="7 days of peace for a tribute"`)}${locked(fb) ? '' : btn('factionBuyout', price === null ? 'Buy them out' : `Buy out ${whole(price)}`, fb, `data-rival="${id}" data-testid="faction-buyout"`)}</div>`;
    const ids = [...planner.squad];
    const ab = canAssault(s, id, ids);
    const assault = locked(ab) ? '' : `<div class="cl-planner" data-testid="hq-assault"><b title="Gate ${hq.gate.toLocaleString('en-US')} HP, the Yard, then ${esc(hq.boss)} and their &quot;${esc(hq.move)}&quot;">Storm the HQ</b>
      <span class="cl-stages"><i>Gate</i>▸<i>Yard</i>▸<i>Boss</i></span>${planner.picker(s)}${tape(`${ids.length}/${SQUAD_CAP(s.rank)}`)}
      ${btn('assault', 'Storm it!', ab, `data-rival="${id}" data-testid="assault"`, 'go')}</div>`;
    return head + sit + assault;
  }

  // ---------- New Game, victory and game over ----------
  function setupScreen(st: Settings, cancel: boolean) {
    const modeArt: Record<Mode, string> = { campaign: ART.lottie(), sandbox: ART.fence(2), endless: ART.sky('hot') };
    const modes = (Object.keys(MODES) as Mode[]).map((m) => `<button class="cl-mode${st.mode === m ? ' on' : ''}" data-action="pick" data-key="mode" data-value="${m}" data-testid="mode-${m}" title="${esc(MODES[m].blurb)}"><span class="cl-art">${modeArt[m]}</span>${tape(MODES[m].label.replace('Story Campaign', 'Story').replace('Sandbox: ', ''))}</button>`).join('');
    const diffs = (Object.keys(DIFFICULTY) as Difficulty[]).map((d, i) => `<button class="cl-diff${st.difficulty === d ? ' on' : ''}" data-action="pick" data-key="difficulty" data-value="${d}" data-testid="difficulty-${d}" title="${esc(DIFFICULTY[d].blurb)}"><span>${d === 'custom' ? '<b>±</b>' : Array.from({ length: i + 1 }, () => ART.sour()).join('')}</span>${DIFFICULTY[d].label}</button>`).join('');
    const toggle = (key: string, on: boolean, label: string, tip: string) => `<button class="cl-toggle${on ? ' on' : ''}" data-action="pick" data-key="${key}" title="${esc(tip)}"><i></i>${label}</button>`;
    const sandbox = st.mode === 'sandbox' ? `<div class="cl-row wrap">
        ${([['domination', 'Domination', 'Every rival out, a Majority in every district'], ['economic', 'Score target', 'Reach a Success Score'], ['none', 'No end', 'Just build']] as const).map(([v, l, t]) => `<button class="cl-b ${st.win === v ? 'go' : 'ghost'}" data-action="pick" data-key="win" data-value="${v}" title="${t}">${l}</button>`).join('')}</div>
      ${st.win === 'economic' ? `<div class="cl-row wrap">${RANKS.slice(3).map((r) => `<button class="cl-b tiny ${st.target === r.ss ? 'go' : 'ghost'}" data-action="pick" data-key="target" data-value="${r.ss}" title="${r.title}">${whole(r.ss)}</button>`).join('')}</div>` : ''}
      ${toggle('peaceful', st.peaceful, 'Peaceful', 'No raids, Sabotage or HQ assaults for anyone. Rivals fall to buyouts or bankruptcy, and even Vera sells.')}` : '';
    const scores = hud.leaderboard.length ? `<table class="cl-books">${hud.leaderboard.map((e, i) => `<tr><td>${i + 1}. ${whole(e.peak)}</td><td>${MODES[e.mode].label.split(':')[0]} · ${esc(difficultyLabel(e.difficulty, e.custom))}${e.result === 'won' ? ' · 🏆' : ''}</td></tr>`).join('')}</table>` : '';
    return `<div class="cl-modal-bg"><div class="cl-card-big cl-setup" data-testid="setup">
      <h1 class="cl-title">Lemonade Stand Wars</h1>
      <div class="cl-modes">${modes}</div>
      <div class="cl-diffs">${diffs}</div>
      ${st.difficulty === 'custom' ? customPanel(st) : ''}
      ${moreOpts || st.mode === 'sandbox' ? `<div class="cl-more">${sandbox}${toggle('ironman', st.ironman, 'Ironman', "One save: a lost run can't reload its last dawn")}${toggle('raidPause', raidPauses(st), 'Raid warnings pause', 'Off: the clock drops to fight speed while a warning counts down')}${toggle('lessons', st.lessons !== false, 'Lessons', 'Lottie teaches one system a day. Off: buttons follow rank alone.')}${scores}</div>` : ''}
      <div class="cl-setup-foot"><button class="cl-link" data-action="more">${moreOpts ? 'Fewer options' : 'More options'}</button>
        ${cancel ? '<button class="cl-link" data-action="cancelSetup">Back to my game</button>' : ''}
        <button class="cl-open big" data-action="start" data-testid="start" aria-label="Open the stand"><span class="cl-btn"></span>${tape('START', 'cl-t-open')}</button></div>
    </div></div>`;
  }

  function outcomeScreen(s: GameState) {
    const o = s.outcome;
    if (!o || (o.result === 'won' && s.endlessSince !== undefined)) return '';
    const t = s.tally ?? { buyouts: 0, smashes: 0, hqs: 0 };
    const stats = `<div class="cl-end-row" title="Day ${o.day} · Buyouts ${t.buyouts}, Smashes ${t.smashes}, HQs ${t.hqs} · ${MODES[s.settings.mode].label} · ${esc(difficultyLabel(s.settings.difficulty, s.settings.custom))}"><span>${ART.rosette()}<b>R${s.rank}</b></span><span>${ART.coin()}<b>${whole(s.peakScore)}</b></span><span>${ART.egg()}<b>Day ${o.day}</b></span></div>`;
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
