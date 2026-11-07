import './style.css';
import './screens.css';
import './coach.css';
import { createCoach } from './ui/coach.ts';
import * as THREE from 'three';
import {
  buildStand, buyBrand, buyPlot, buySupply, CLOSE, DISTRICTS, LOTTIES_CORNER, newGame, OPEN, openStands, PLOT_BY_ID, PLOT_SPACING,
  priceCeiling, runCampaign, SEGMENTS, selectedStand, setPrice, pickRecipe, setSweetness, simulateRestOfDay, sleepUntilDawn,
  tickMinute, upgradeStand, type GameState, type SegmentId, type SimEvent,
  alertTexts, dismissAlert, restockNow, EVENING_REAL_SECONDS, isMajor, QUIET_NIGHT_SPEED, quietNight, raidPauses, secondsPerMinute, startNight, type Alert,
  buildClubhouse, buyGadget, buyPerimeter, equip, fillPosts, fireGuard, hireGuard, planRaid, postGuard, promote, rebuildStand, repairFence,
  battleHeadline, welcomeDex, type BattleReport, acceptOrder, buildFacility, declineOrder,
  factionBuyout, makeTruce, plotBuyout, stormHQ, hqPlot, HQS, type RivalId, answerBuyout, callBigSqueeze,
  borrow, defaultSettings, keepSqueezing, repayLoan, type Settings,
  setTasteOffEntry, sponsorFestival, forgiveSquawk, nudgeStockTarget, setStockTarget, toggleAutoRestock, setByHand, toggleAutoPrice,
  announceControl, listPlot, placeBid, unlistPlot, withdrawBid,
} from './sim/economy.ts';
import { createBattle } from './world/battle.ts';
import { waitAt } from './sim/clubhouse.ts';
import { ringTheBell } from './sim/reinforce.ts';
import { autoDefendOn, cycleDefendPriority, setAutoDefend } from './sim/autodefend.ts';
import { settleCaptive } from './sim/captives.ts';
import { atOnce, fightCommand, fightStatus, finishFight, liveReport, startAssault, stepFight, watchFights } from './sim/fight.ts';
import { createAudio, type Stinger } from './audio.ts';
import { createTwins, type Twins } from './ui/twins.ts';
import { createVip } from './world/vip.ts';
import { createTraffic } from './world/traffic.ts';
import { bySea, clockText, frontPage, isVip, KIDS_RAID_LINE, raidKidStand, seasonOf } from './sim/economy.ts';
import { approveRepair, toggleAutoRepair, type PlotState } from './sim/economy.ts'; // Damaged buildings and Auto-Repair (src/sim/damage.ts)
import { scoutWithLookout } from './sim/scouting.ts';
import {
  clearSave, dawnsOf, loadDawn, loadDawnSlot, loadGame, loadLeaderboard, loadSlot, onSaveTrouble, recordScore, saveDawn, saveGame, saveOnHide, saveSlot,
  saveUnreadable, slotList,
} from './save.ts';
import {
  actionFor, AUTO_CONTINUE_SECONDS, autoPauses, bindKey, defaultKeys, loadOptions, MENU_IDS, saveOptions, TEXT_SIZES, type KeyAction, type MenuId,
  type Options, type PauseKind,
} from './settings.ts';
import { isFullMenu, menuUnlocked } from './ui/menus.ts';
import { createHud, type Action } from './ui/hud.ts';
import { walkerInfo, type WalkerInfo } from './ui/stand.ts';
import { createWorld } from './world/scene.ts';
import { createBay } from './world/bay.ts';
import { CROWD_PHONE, CROWD_POOL, createCrowd, type Gait } from './world/people.ts';
import { setBeatSource } from './world/beat.ts';
import { createMarkers } from './world/markers.ts';
import { createBubbles } from './world/bubbles.ts';
import { FACTIONS, PERIMETERS } from './sim/balance.ts';
import type { Emote } from './ui/emotes.ts';
import { createPhone } from './ui/phone.ts';
import { createBugle } from './ui/bugle.ts';
import { BOSS, BRAWL, CUSTOMER, HENCH, LOTTIE, pick, type BarkMoment } from './world/barks.ts';
import { createAmbient } from './world/ambient.ts';
import { createScenes, type SceneId } from './world/scenes.ts';
import { beginScene, endScene, playingScene, replyScene, SCENE_MAX_SECONDS, sceneReady, type Scene } from './sim/scenes.ts';
import { takeCall } from './sim/phone.ts';
import { lessonsOn, storyAfterAct, storyDateline } from './sim/story.ts';
import { answerOffer } from './sim/beats.ts';
import { createGullFlight } from './world/gullflight.ts';
import { setReducedMotion } from './world/clay/kit.ts';

// Each segment walks as its own clay customer (world/people.ts dresses them: balloons, strollers, bucket hats...).
const LOOK: Record<SegmentId, { scale?: number; speed?: number; gait?: Gait; segment: SegmentId }> = {
  kids: { speed: 1.15, gait: 'skip', segment: 'kids' },
  families: { speed: 0.9, segment: 'families' },
  seniors: { scale: 0.95, speed: 0.7, gait: 'shuffle', segment: 'seniors' },
  students: { segment: 'students' },
  office: { speed: 1.15, gait: 'stride', segment: 'office' },
  workers: { gait: 'stride', segment: 'workers' },
  tourists: { speed: 0.85, gait: 'tourist', segment: 'tourists' },
  highRollers: { speed: 0.9, segment: 'highRollers' },
};
/** Walk-offs carry the reason as a clay reaction icon (see ui/emotes.ts): zzz for not thirsty, an arrow for a rival. */
const MISS_TEXT = { pricey: 'pricey', line: 'line', soldOut: 'soldout', notThirsty: 'zzz', rival: 'rival' } as const satisfies Record<string, Emote>;
/** Most passers-by aren't thirsty: only some nod off in a zzz, or the street turns into a wall of bubbles. */
const ZZZ_CHANCE = 0.3;
/** A rush: this many coins landing within RUSH_MS gets a cheer from Lottie. */
const RUSH_COINS = 5;
const RUSH_MS = 5000;
/** Not every buyer says something, or the street turns into a wall of bubbles. */
const SIP_CHANCE = 0.35;

/** Street View's framing (focusPlot): the distance back, and how far from the street's centre line the camera aims. */
const STREET_DIST = { landscape: 14, portrait: 17 };
const STREET_AIM = { landscape: 7, portrait: 7.5 };
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
  watchFights(true); // fights you're in play live on screen (the skips still fight at once)
  // The clock (spec: Clock and speed). speed 0 is a pause, from Space, the ❚❚ knob or an auto-pause on a major
  // alert: the clock, the brawl on screen and any VIP scene all hold still. Full-screen paper pauses too.
  let speed = 1;
  let resumeTo = 1; // the speed a resume goes back to
  let vipResume = 0; // a watched first visit holds the clock (not its scene) until the show is over
  let vipPaused = ''; // the first-arrival card that auto-paused the clock: Watch or dismiss resumes it
  let acc = 0;
  // A save made during business hours or the night picks up where it left off, paused (Space or a speed goes on).
  const midDay = (s: GameState) => s.phase === 'open' || s.phase === 'night';
  if (saved && midDay(saved)) speed = 0;
  let savedHour = -1; // the game hour last saved mid-day (the clock saves once a game hour, and when the page hides)
  let options: Options = loadOptions();
  setReducedMotion(options.reducedMotion); // "Less motion" reaches the world too: no boil, shakes or flashes (src/world/clay/kit.ts)
  let liveFight = false; // the brawl on screen is happening now: the clock runs at fight speed
  const fightQueue: BattleReport[] = []; // tonight's brawls wait their turn on screen
  let onScreen: GameState['fight'] = undefined; // the live fight the 3D view is playing (its clock runs only then)
  let prepWait = 0; // auto-continue: real seconds Morning Prep has waited
  let eveningWait = 0; // the Evening's moment, off the Ledger
  let quietOff = false; // a speed picked during a quiet night: the quiet 3× gives way to it until dawn
  const outcomeUp = () => !!state.outcome && !(state.outcome.result === 'won' && state.endlessSince !== undefined); // as the HUD's outcome screen
  let screenUp = false; // full-screen paper was up last frame
  let screenPaused = false; // ...and it paused the clock, so putting it away brings the speed back
  const pause = () => { if (speed) { resumeTo = speed; speed = 0; } };
  const resume = () => { vipPaused = ''; if (!speed) speed = resumeTo || 1; };
  /** Quiet nights run at 3× by themselves (Options) until an alert comes in, or until you pick a speed. */
  const quiet = () => options.quietNights && !quietOff;
  const setSpeed = (v: number) => {
    if (v <= 0) { pause(); return; }
    vipPaused = ''; // you picked the speed: an old card no longer owns the pause
    if (quiet() && quietNight(state)) quietOff = true;
    speed = v;
  };
  /** The speed the clock actually runs at, for the knobs: a quiet night shows its 3×. */
  const shownSpeed = () => (speed && !liveFight && quiet() && quietNight(state) ? QUIET_NIGHT_SPEED : speed);

  const audio = createAudio();
  // Every stinger has a visual twin (src/ui/twins.ts): a screen-edge pulse in its colour and pattern beside its card.
  let twins: Twins | null = null; // once the HUD is up
  const stinger = (id: Stinger) => { audio.stinger(id); twins?.pulse(id); };
  const wake = () => audio.start();
  window.addEventListener('pointerdown', wake, { once: true });
  window.addEventListener('keydown', wake, { once: true });
  const won = (b: BattleReport) => (b.attacker === 'player') === (b.outcome === 'smashed' || b.outcome === 'robbed');
  /** A raid warning lands: the Raid Incoming stinger and Lottie's fist (the boss's call rings from the sim's phone queue). */
  const raidWarned = () => {
    stinger('raid-incoming');
    lottieSays('raidComing', { react: 'fist' });
  };
  /** A card lands in the alert feed; a major alert auto-pauses when its switch is on. A VIP client's first visit
   * pauses and waits for its card's Watch (see watchVip); dismissing the card skips the show. */
  const onAlert = (a: Alert) => {
    if (a.kind === 'raid' || a.kind === 'delivery') raidWarned();
    if (isMajor(a) && autoPauses(options, state, a.kind)) { pause(); if (a.kind === 'vip') vipPaused = a.id; }
  };
  /** A VIP card's Watch: the camera flies to the pad or pier and the arrival plays. A first visit holds the clock
   * for its show (its own switch); a regular's replays while the clock runs on. */
  const watchVip = (a: Alert) => {
    if (!a.plot || !a.scene || !bay.views[a.plot]) return;
    if (flight.active()) { flight.stop(); gullBtn.classList.remove('on'); }
    hud.ledger = false;
    cutScene(); // the show takes the screen: a story scene stops
    crowd.clear();
    focusPlot(a.plot, a.scene.kind === 'ship' ? 60 : 45);
    playVip(a.scene.kind, a.plot, a.scene.big, a.scene.client ?? '', a.kind === 'vip');
    stinger('raid-won');
    if (a.kind === 'vip' && autoPauses(options, state, 'vip')) vipResume = 1;
    if (vipPaused === a.id) resume();
    dismissAlert(state, a.id);
  };
  /** A raid hit at its minute. Live, the brawl plays (one at a time) and its headline waits for the end. */
  const onFight = (b: BattleReport, live: boolean) => {
    if (b.attacker !== 'player' && b.defender !== 'player') return;
    if (!live) return;
    const i = state.news.indexOf(battleHeadline(b));
    if (i >= 0) state.news.splice(i, 1);
    if (state.fight || (battle.active() && liveFight)) fightQueue.push(b); else playBattle(b, true);
  };
  const stopFights = () => { battle.stop(); bay.release(); fightQueue.length = 0; liveFight = false; };
  /** Swap in a loaded run (a dawn, a slot): whatever was on screen goes, and a mid-day save waits paused. */
  const restore = (s: GameState, line: string) => {
    state = s;
    state.runId ??= `${state.seed.toString(36)}-${Date.now().toString(36)}`;
    hud.inspected = null; vipResume = 0; vipPaused = ''; acc = 0; savedHour = -1;
    crowd.clear(); stopFights(); resetScene(); bubbles.clear(); bay.sync(state); focusPlot(state.selected);
    if (midDay(state)) pause(); else resume();
    hud.toast(line);
  };
  /** 07:00: the dawn autosave, Lottie reads the sky, the Bugle lands. */
  const atDawn = () => {
    saveDawn(state);
    recordScore(state);
    crowd.clear();
    morningLine();
    prepWait = 0;
    const shot = bugle.best(state.day - 1);
    if (shot) bugle.show({ ...shot, edition: storyDateline(state) }, frontPage(state), options.celsius); // world: this morning's headline (a new act's too) and briefs under yesterday's photo
  };
  const afterSleep = () => {
    const fights = state.battles.filter((b) => b.day === state.day - 1);
    if (fights.length) stinger(fights.every(won) ? 'raid-won' : 'squeezed-out');
  };

  const world = await createWorld(document.getElementById('app')!);
  const bay = createBay(world.scene);
  bay.sync(state);
  const home = PLOT_BY_ID[LOTTIES_CORNER];
  // Look from the street side, so the stand faces the player above the dock (Street View's framing, as focusPlot).
  const portrait = world.camera.aspect < 1;
  world.controls.target.set(home.x + 1, 0.8, home.streetZ - home.facing * (portrait ? STREET_AIM.portrait : STREET_AIM.landscape));
  world.camera.position.set(5, 7.7, -11).setLength(portrait ? STREET_DIST.portrait : STREET_DIST.landscape).add(world.controls.target);

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
  const lottieSays = (moment: BarkMoment, opts: { react?: 'cheer' | 'fist'; cooldown?: number; text?: string; ms?: number; icon?: Emote } = {}) => {
    const now = performance.now();
    if (now - (lastBark.get(moment) ?? -1e9) < (opts.cooldown ?? 0)) return;
    const stand = bay.views[LOTTIES_CORNER]?.stand;
    if (!stand?.lottie) return;
    lastBark.set(moment, now);
    if (opts.react) stand.react(opts.react);
    if (opts.icon) bubbles.say(stand.lottie, '', { kind: 'thought', icon: opts.icon, height: 2.0, ms: opts.ms });
    else {
      const line = opts.text ?? pick(LOTTIE[moment]);
      bubbles.say(stand.lottie, line, { who: 'Lottie', color: '#7a4fb0', height: 2.0, ms: opts.ms });
      twins?.caption('Lottie', line);
      audio.babble(line, 0.8, opts.react === 'fist' ? 'grumpy' : opts.react === 'cheer' ? 'happy' : 'flat');
    }
  };

  /** Ask for a photo of this frame for tomorrow's Bugle; the best moment of the day wins. */
  let snapReq: { headline: string; score: number } | null = null;
  let snapBusy = false;
  let rushSnapAt = 0; // a rush is photographed at most once a minute
  const snap = (headline: string, score: number, delay = 0) => {
    const go = () => { if (!snapReq || snapReq.score < score) snapReq = { headline, score }; };
    if (delay) setTimeout(go, delay); else go();
  };

  /** A finished crate reveal: passers-by clap, Lottie cheers, the Bugle gets its photo. */
  let pendingReveal: ReturnType<typeof setTimeout> | undefined;
  const celebrateReveal = (standObj: THREE.Object3D | null) => {
    clearTimeout(pendingReveal);
    pendingReveal = undefined;
    const at = new THREE.Vector3();
    if (standObj) standObj.getWorldPosition(at); else at.copy(bay.views[state.selected]?.serve ?? world.controls.target);
    crowd.cheer(at, 9);
    lottieSays('upgrade', { react: 'cheer' });
    snap('LOTTIE\'S STAND GETS A MAKEOVER; NEIGHBORS GAWK', 4);
  };
  window.addEventListener('stand-revealed', (e) => {
    const d = (e as CustomEvent<{ stand?: THREE.Object3D; level?: number }>).detail;
    celebrateReveal(d?.stand ?? null);
  });

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
      // The grandkid behind that counter cheers the sale.
      let near: { d: number; v: (typeof bay.views)[string] } | null = null;
      for (const v of Object.values(bay.views)) { if (!v.stand) continue; const d = v.serve.distanceTo(pos.clone().setY(0.12)); if (!near || d < near.d) near = { d, v }; }
      if (near && near.d < 3) near.v.stand?.cheer();
      hud.coin(x, y, size, () => audio.ding(size > 1));
      if (coinTimes.length >= RUSH_COINS) { lottieSays('rush', { react: 'cheer', cooldown: 25000 }); if (performance.now() > rushSnapAt) { rushSnapAt = performance.now() + 60000; snap('LINE DOWN THE BLOCK AT LOTTIE\'S LEMONADE', 2, 400); } }
    } else if (kind === 'miss') {
      bubbles.say(who, '', { kind: 'thought', icon: text as Emote, ms: 1800 });
      if (text === MISS_TEXT.pricey && Math.random() < 0.3) audio.babble(pick(CUSTOMER.grumble), 1, 'grumpy');
      if (text === MISS_TEXT.soldOut) lottieSays('soldOut', { react: 'fist', cooldown: 20000 });
    } else if (kind === 'sweat') {
      bubbles.say(who, '', { kind: 'thought', icon: 'sweat', ms: 1400 });
    } else if (kind === 'sip' && Math.random() < SIP_CHANCE) {
      // Most buyers just glow (a clay heart); some say thanks in Lemonese.
      if (Math.random() < 0.5) bubbles.say(who, '', { kind: 'thought', icon: 'bought', ms: 1400 });
      else { const l = pick(CUSTOMER.sip); bubbles.say(who, l, { ms: 1400 }); audio.babble(l, who.scale.y < 0.8 ? 1.7 : 1.1 + Math.random() * 0.4, 'happy'); }
    }
  }, world.quality === 'phone' ? CROWD_PHONE : CROWD_POOL);

  const ambient = createAmbient(world.scene, {
    onSquawkSteal: (gull) => {
      bubbles.say(gull, 'SQUAWK!', { who: 'Captain Squawk', height: 0.9, ms: 1600 });
      setTimeout(() => lottieSays('squawk', { react: 'fist' }), 500);
    },
    onGlare: (who, rival) => { if (Math.random() < 0.5) { const l = pick(HENCH[rival]); bubbles.say(who, l, { ms: 1800 }); audio.babble(l, 0.8, 'grumpy'); } },
  });

  const scenes = createScenes(world.scene, {
    say: (who, line, speaker, color) => { bubbles.say(who, line, { who: speaker, color, height: 2.1 }); audio.babble(line, speaker === 'Dex' ? 1.2 : 0.9, 'flat'); },
    lottie: (line, react) => lottieSays('morning', { text: line, react }),
    // No ring hook: a scene's follow-up call (Vera after the Steward) is queued by the sim when the scene ends.
    done: (id) => { const sc = playingScene(state); if (sc && (id === 'visit' ? !!sc.speaker : sc.world === id)) finishScene(false); },
    driven: true, // the story's scene queue (src/sim/scenes.ts) says when
  });

  // Story scenes wait for a lull: Morning Prep with nothing else on screen. One plays at a time, under a minute.
  let sceneT = 0, sceneWorld = false, sceneSaid = 0;
  const busy = () => !!hud.setup || hud.optionsOpen || isFullMenu(hud.menu) || battle.active() || vip.active() || !!vipResume || phone.ringing() || flight.active() || !!document.querySelector('.frontpage');
  const lull = () => !busy() && !scenes.active() && speed !== 0; // a paused game starts no scene
  const startScene = () => {
    const sc = beginScene(state);
    if (!sc) return;
    sceneT = 0;
    sceneSaid = 0;
    crowd.clear();
    // A townsperson's scene (its speaker) is staged at its plot; the Steward and Dex have their own at the Corner.
    const at = sc.plot && bay.views[sc.plot] ? sc.plot : LOTTIES_CORNER;
    focusPlot(at);
    sceneWorld = sc.speaker ? !!bay.views[at] : !!sc.world && !!bay.views[LOTTIES_CORNER]?.stand;
    if (sceneWorld && sc.speaker) scenes.visit({ who: sc.speaker, plot: at, lines: sc.lines });
    else if (sceneWorld) scenes.play(sc.world as SceneId);
    saveGame(state);
  };
  /** A captions-only scene (Day 1's opening): Lottie says her lines at the Corner as they come up. */
  const sayScene = (sc: Scene) => {
    while (sceneSaid < sc.lines.length && sc.lines[sceneSaid].at <= sceneT) {
      const l = sc.lines[sceneSaid++];
      if (l.who === 'Lottie') lottieSays('morning', { text: l.text });
    }
  };
  const finishScene = (skipped: boolean) => {
    if (skipped) scenes.stop();
    endScene(state, skipped);
    sceneT = 0;
    flushNews();
    if (state.phase === 'prep' || state.phase === 'report') saveGame(state);
  };
  /** A fight replay or a VIP show cuts a scene short. */
  const cutScene = () => { if (playingScene(state)) finishScene(true); };
  /** A new run or a loaded game: the world's actors leave, and a scene saved mid-play replays from its first line. */
  const resetScene = () => { scenes.stop(); sceneT = 0; sceneSaid = 0; sceneWorld = false; };
  let callsQuietUntil = 0; // a rank-up's fanfare outranks a boss's call

  let vipHeadline = '';
  const vip = createVip(world.scene, { onHorn: () => audio.horn(), onPhoto: () => snap(vipHeadline, 5) });
  /** A VIP show; a client's first visit gets the Bugle's photo of the loading (spec mood scene "The first helicopter"). */
  const playVip = (kind: 'heli' | 'ship', plot: string, big: boolean, client: string, first: boolean) => {
    vipHeadline = (kind === 'heli' ? `Chopper lands at Lottie's pad for ${client || 'a VIP'}` : `Lottie's Lemonade ships out for ${client || 'a VIP'}`).toUpperCase();
    vip.play(kind, bay.views[plot], big, state.plots[plot].facility?.level ?? 1, client, first);
  };
  const traffic = createTraffic(world.scene);
  /** What the clock did, on screen. Skips (Finish the day, Sleep till dawn) pass live = false: no scenes, except a
   * VIP client's first visit, which stops the skip (a major alert). A first visit that paused waits for Watch;
   * otherwise the chopper or ship lands in the world while the camera stays put (its card's Watch flies there). */
  const drawEvents = (events: SimEvent[], live = true) => {
    const firsts = new Set(events.flatMap((e) => (e.type === 'alert' && e.alert.kind === 'vip' && e.alert.order ? [e.alert.order] : [])));
    for (const e of events) {
      if (e.type === 'alert') { onAlert(e.alert); continue; }
      if (e.type === 'fight') { onFight(e.report, live); continue; }
      if (e.type === 'dawn') { atDawn(); continue; }
      if (e.type !== 'pickup') continue;
      const o = e.order, first = firsts.has(o.id);
      if (!e.ok || !o.plot || !isVip(o.tier) || (!live && !first)) continue;
      flushNews();
      if (first && autoPauses(options, state, 'vip')) continue; // the show waits for its card's Watch
      playVip(bySea(o.tier) ? 'ship' : 'heli', o.plot, o.qty > 20000, o.client ?? '', first);
      stinger('raid-won');
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
      const look = { ...LOOK[e.segment], info: walkerInfo(state, e) }; // tap a walker to hear why
      const mine = e.owner === 'player';
      // Passing your stand for a rival's: an arrow over their head as they go by yours, walking on toward theirs.
      const toRival = !mine && state.plots[e.plot]?.owner === 'player';
      const away = at.plot.x >= from.plot.x ? 1 : -1;
      if (toRival) crowd.spawn('grumble', { ...route, x0: from.plot.x - away * PLOT_SPACING * 2.5, x1: at.plot.x + away * PLOT_SPACING * 2.5, grumbleX: from.plot.x, serve: from.serve }, MISS_TEXT.rival, look);
      else if (e.buys) crowd.spawn('sale', route, mine ? (e.price < 1 ? `+${Math.round(e.price * 100)}¢` : `+$${e.price.toFixed(2)}`) : '', look);
      else if (mine && (e.reason === 'soldOut' || e.reason === 'line')) crowd.spawn('miss', route, MISS_TEXT[e.reason], look);
      else if (mine && e.reason === 'pricey') crowd.spawn('grumble', route, MISS_TEXT.pricey, look);
      else if (mine && e.reason === 'notThirsty' && Math.random() < ZZZ_CHANCE) crowd.spawn('grumble', route, MISS_TEXT.notThirsty, look);
      else crowd.spawn('pass', route, '', look);
    }
  };

  const sideColor = (o: 'player' | RivalId) => (o === 'player' ? '#c99a00' : `#${FACTIONS[o].color.toString(16).padStart(6, '0')}`);
  const battle = createBattle(world.scene, (pos, text, kind) => { const [x, y] = toScreen(pos); hud.popup(x, y, text, kind); }, world.camera, {
    // Not every KO yelps, or the cloud turns into a wall of bubbles; the last one always does.
    onKO: (who, _side, owner, last) => {
      if (!last && Math.random() > 0.35) return;
      const l = pick(BRAWL.ko[owner]);
      bubbles.say(who, l, { ms: 1500, color: sideColor(owner), height: 1.9 });
      audio.babble(l, owner === 'player' ? 1.1 : 0.85, 'grumpy');
    },
    onHome: (who) => { if (Math.random() < 0.25) bubbles.say(who, '', { kind: 'thought', icon: 'zzz', ms: 1200 }); },
    onWin: (winners, _side, owner) => {
      const l = pick(BRAWL.win[owner]);
      winners.slice(0, 2).forEach((w, i) => setTimeout(() => bubbles.say(w, i ? pick(BRAWL.win[owner]) : l, { ms: 1800, color: sideColor(owner), height: 1.9 }), i * 350));
      audio.babble(l, owner === 'player' ? 1.15 : 0.85, 'happy');
    },
  }, { phone: world.quality === 'phone' });
  /** A plot as it stood before a settled fight: the defender's, standing, at the report's level, fence and gadgets. */
  const beforeFight = (ps: PlotState, b: BattleReport): PlotState => ({
    ...ps,
    owner: b.defender,
    busted: false,
    stand: ps.stand ? { ...ps.stand, wrecked: false, level: b.standLevel || ps.stand.level, hp: ps.stand.wrecked || ps.stand.hp === undefined ? undefined : ps.stand.hp + (b.hpLost ?? 0) } : ps.stand,
    facility: ps.facility ? { ...ps.facility, wrecked: false } : ps.facility,
    defense: { ...ps.defense, tier: b.perimeter || ps.defense.tier, fenceHp: ps.defense.fenceHp > 0 || !b.perimeter ? ps.defense.fenceHp : PERIMETERS[b.perimeter - 1]?.hp ?? 0, gadgets: b.gadgets ?? ps.defense.gadgets },
  });
  /** A fight is over on screen: the headline, the stinger and Lottie (the boss's call rings from the sim's phone queue). */
  const fanfare = (b: BattleReport) => {
    bay.release(b.target); // the dust settles: the plot shows how it came out
    hud.toast(battleHeadline(b)); stinger(won(b) ? 'raid-won' : 'squeezed-out'); bay.sync(state);
    snap(battleHeadline(b).toUpperCase(), 5);
    if (b.attacker === 'player') lottieSays(won(b) ? 'raidWon' : 'raidLost', { react: won(b) ? 'cheer' : 'fist' });
    else if (b.defender === 'player') lottieSays(won(b) ? 'raidHeld' : 'raidLost', { react: won(b) ? 'cheer' : 'fist' });
  };
  /** Play a brawl. live: it's happening now, so the clock runs at fight speed and the next one waits its turn. */
  const playBattle = (b: BattleReport, live = false) => {
    cutScene();
    crowd.clear();
    focusPlot(b.target, 20);
    liveFight = live;
    onScreen = undefined;
    // The sim has already settled this one (a replay, a queued brawl, a stormed HQ): stage the plot as it stood
    // before the fight, so the wreck or the captured HQ only shows when the dust settles.
    bay.release();
    if (state.plots[b.target]) bay.stage(state, b.target, beforeFight(state.plots[b.target], b));
    battle.play(b, bay.views[b.target], () => {
      liveFight = !!state.fight;
      nextOnScreen();
      fanfare(b);
    });
  };
  /** The view is free: a live fight goes on first (its clock waits for it), then the brawls queued behind it. */
  const nextOnScreen = () => {
    if (state.fight) { playLive(); return; }
    const next = fightQueue.shift();
    if (next) setTimeout(() => playBattle(next, true), 0);
  };
  /** The live fight on screen, read from its own clock; each HQ stage follows the last, and the fanfare waits for the end. */
  const playLive = () => {
    const f = state.fight, r = liveReport(state);
    if (!f || !r) return;
    cutScene(); // the fight takes the screen: a story scene stops
    crowd.clear();
    focusPlot(r.target, 20);
    liveFight = true;
    onScreen = f;
    bay.release(); // a live fight settles as it plays: its plot follows the game
    battle.play(r, bay.views[r.target], () => {
      const stage = !!f.hq && state.fight?.hq?.reports === f.hq.reports; // the next door of the same assault
      liveFight = !!state.fight;
      if (!stage) fanfare(r);
      nextOnScreen();
    }, () => (state.fight === f ? f.t : null));
  };
  /** A live fight runs on its own clock: 1 game minute a fight-second whatever the speed (the pause holds it). */
  const runFight = (dt: number) => {
    const from = state.phase;
    const { minutes, ended } = stepFight(state, dt);
    for (let i = 0; i < minutes && state.phase === from && (from === 'open' || from === 'night'); i++) drawEvents(tickMinute(state));
    if (ended) {
      const i = state.news.indexOf(battleHeadline(ended)); // the fanfare says it when the dust settles
      if (i >= 0) state.news.splice(i, 1);
      if (!battle.active()) { liveFight = false; fanfare(ended); }
    }
    if (state.phase !== from) { flushNews(); saveGame(state); bay.sync(state); } else flushNews();
  };
  /** Finish the live fight now (a skip, or sleep): its result lands without the show. */
  const settleFight = () => {
    if (!state.fight) return;
    const done = finishFight(state);
    battle.stop();
    liveFight = false;
    onScreen = undefined;
    for (const b of fightQueue.splice(0)) hud.toast(battleHeadline(b)); // the brawls waiting their turn: just the news
    const last = done[done.length - 1];
    if (last) fanfare(last);
  };

  /** Look at a plot. Street View (no distance given) frames the stand, its queue and the sidewalk in the middle of
   * the screen above the dock, close enough that the stand and its walkers fill about a third of it (spec "Camera");
   * a portrait phone's narrow frame stands a little further back. The aim sits on the stand (7.5 from the street's
   * centre line; the sidewalk is at 5.1), so the road stays at the bottom edge. */
  const focusPlot = (id: string, distance?: number) => {
    const p = PLOT_BY_ID[id];
    const portrait = world.camera.aspect < 1;
    world.focus(p.x, p.streetZ - p.facing * (portrait ? STREET_AIM.portrait : STREET_AIM.landscape), distance ?? (portrait ? STREET_DIST.portrait : STREET_DIST.landscape));
  };

  const act = (a: Action) => {
    const st = selectedStand(state);
    if (state.phase === 'report') eveningWait = 0; // the Evening is a moment after the last thing you did
    switch (a.type) {
      case 'buy': buySupply(state, a.id, a.packs); break;
      case 'recipe': if (pickRecipe(state, st, a.id)) setByHand(state, state.selected, 'card'); break;
      case 'sweet': setSweetness(st, a.value); setByHand(state, state.selected, 'card'); break;
      case 'price': setPrice(st, st.price + a.delta); setByHand(state, state.selected, 'price'); break;
      case 'priceCeiling': setPrice(st, priceCeiling(state, state.selected)); break;
      case 'restock': toggleAutoRestock(state, state.selected); break;
      case 'autoPrice': toggleAutoPrice(state, state.selected); break;
      case 'stockTarget': if (a.delta) nudgeStockTarget(state, state.selected, a.delta > 0 ? 1 : -1); else setStockTarget(state, state.selected, null); break;
      case 'open': if (openStands(state)) { acc = 0; prepWait = 0; resume(); } break;
      case 'speed': setSpeed(a.value); break;
      // The skips run the clock flat out and stop at the next major alert (then the live clock takes over).
      case 'skip': { resume(); settleFight(); const ev = atOnce(() => simulateRestOfDay(state, true)); crowd.clear(); drawEvents(ev, false); break; }
      case 'night': hud.ledger = false; if (startNight(state)) { acc = 0; eveningWait = 0; resume(); } break;
      case 'evening': hud.ledger = false; eveningWait = 0; break;
      case 'ledger': hud.ledger = true; break;
      case 'sleep': {
        cutScene();
        resume(); // a skip means go; the next big alert pauses again
        settleFight();
        stopFights();
        crowd.clear();
        const ev: SimEvent[] = [];
        const dawned = atOnce(() => sleepUntilDawn(state, true, ev));
        drawEvents(ev, false);
        if (dawned) { atDawn(); afterSleep(); }
        break;
      }
      case 'goto': { // an alert card's Go There: the camera goes (Captain Squawk flies home first), the Ledger folds
        if (flight.active()) { flight.stop(); gullBtn.classList.remove('on'); }
        hud.ledger = false; hud.inspected = a.plot; focusPlot(a.plot);
        break;
      }
      case 'dismiss': // dismissing a first arrival's card skips its show, and the clock it paused runs again
        dismissAlert(state, a.id);
        if (vipPaused === a.id) resume();
        break;
      case 'watch': { const card = (state.alerts ?? []).find((x) => x.id === a.id); if (card) watchVip(card); break; }
      case 'restockNow': restockNow(state, a.plot); break; // business hours only (the card hides it after closing)
      case 'options': hud.optionsOpen = !hud.optionsOpen; hud.menu = null; hud.remap = null; break;
      case 'menu': { // a menu from its meter, its key or the corner's list (none before its system unlocks)
        if (hud.setup || outcomeUp()) break;
        const id = a.id;
        if (id === 'stand') { hud.menu = null; hud.inspected = state.selected; focusPlot(state.selected); break; } // the stand's own card
        hud.menu = !id || hud.menu === id || (id !== 'index' && !menuUnlocked(state, id)) ? null : id;
        if (hud.menu) hud.optionsOpen = false;
        break;
      }
      case 'remap': hud.remap = hud.remap === a.key ? null : a.key; break;
      case 'resetKeys': options.keys = defaultKeys(); saveOptions(options); hud.remap = null; break;
      case 'turn': world.turnStep(a.dir); break;
      case 'option': setOption(a.key, a.value); break;
      case 'mute': hud.muted = audio.toggle(); break;
      case 'newgame': case 'setup': hud.setup = { settings: { ...state.settings }, cancel: true }; hud.leaderboard = loadLeaderboard(); break;
      case 'cancelSetup': hud.setup = null; break;
      case 'start': {
        if (state.day > 1) recordScore(state); // the run being left keeps its row on the leaderboard
        clearSave();
        state = freshRun(a.settings);
        hud.setup = null; hud.inspected = null; speed = 1; resumeTo = 1; vipResume = 0; vipPaused = ''; bubbles.clear();
        crowd.clear(); stopFights(); resetScene(); bay.sync(state); focusPlot(state.selected);
        break;
      }
      case 'keepSqueezing': keepSqueezing(state); break;
      case 'reloadDawn': {
        const d = loadDawn(state.runId, a.slot);
        if (d) restore(d, a.slot === undefined ? 'Back to the last dawn. Let\'s try that again.' : `Back to the dawn of day ${d.day}.`);
        break;
      }
      case 'saveSlot': if (saveSlot(state, a.slot)) hud.toast(`Saved in slot ${a.slot + 1}.`); break;
      case 'loadSlot': {
        const s = a.dawn ? loadDawnSlot(a.slot) : loadSlot(a.slot);
        if (!s) { hud.toast("Couldn't read that save."); break; }
        if (state.day > 1 && state.runId !== s.runId) recordScore(state); // the run being left keeps its row
        hud.optionsOpen = false;
        restore(s, `Loaded day ${s.day}${midDay(s) ? ': paused' : ''}.`);
        break;
      }
      case 'borrow': borrow(state, a.amount); break;
      case 'repay': repayLoan(state); break;
      case 'upgrade': {
        const before = selectedStand(state).level;
        upgradeStand(state);
        if (selectedStand(state).level > before) {
          // The stand fires 'stand-revealed' when its crate reveal ends; this is the fallback if it doesn't.
          pendingReveal = setTimeout(() => celebrateReveal(null), 7000);
        }
        break;
      }
      case 'brand': buyBrand(state); break;
      case 'campaign': runCampaign(state, a.id, a.plot); break;
      case 'select': state.selected = a.plot; hud.inspected = a.plot; focusPlot(a.plot); break;
      case 'inspect': // a tap on the map, or a pick from a menu's list (which flies there)
        if (a.plot && hud.menu && hud.menu !== 'goals') focusPlot(a.plot);
        hud.inspected = a.plot;
        if (hud.menu !== 'goals') hud.menu = null;
        break;
      case 'buyPlot': buyPlot(state, a.plot); break;
      case 'build': buildStand(state, a.plot); break;
      case 'view': if (a.target === 'home') focusPlot(state.selected); else world.bayView(); break;
      case 'perimeter': buyPerimeter(state, a.plot); break;
      case 'gadget': buyGadget(state, a.plot, a.id); break;
      case 'repairFence': repairFence(state, a.plot); break;
      case 'rebuild': rebuildStand(state, a.plot); break;
      case 'repair': approveRepair(state, a.plot); break;
      case 'autoRepair': toggleAutoRepair(state, a.plot); break;
      case 'hire': hireGuard(state, a.id); break;
      case 'fire': fireGuard(state, a.id); break;
      case 'post': postGuard(state, a.id, a.plot); break;
      case 'equip': equip(state, a.id, a.item); break;
      case 'promote': promote(state, a.id, a.specialty); break;
      case 'scout': scoutWithLookout(state, a.id, a.plot); break;
      case 'clubhouse': buildClubhouse(state, a.plot); break;
      case 'club': waitAt(state, a.id, a.plot); break;
      case 'defend': fillPosts(state, a.plot); break;
      case 'raid': {
        const r = planRaid(state, a.plot, a.guards, a.objective, a.when);
        if (typeof r === 'object') { hud.inspected = null; onFight(r, true); } // fought at once: shown in its turn
        else if (r) { // the squad travels: it fights when it gets there (live, on screen)
          const out = state.raids.find((x) => x.attacker === 'player' && x.target === a.plot && x.back === undefined);
          hud.toast(out ? `Squad out ${clockText(out.leave!)}, there ~${clockText(out.at!)}.` : `Raid planned on ${PLOT_BY_ID[a.plot].name}.`);
        }
        break;
      }
      case 'truce': makeTruce(state, a.rival); break;
      case 'plotBuyout': plotBuyout(state, a.plot); break;
      case 'takeover': answerBuyout(state, a.plot, a.sell); break;
      case 'factionBuyout': if (factionBuyout(state, a.rival)) stinger('raid-won'); break;
      case 'assault': {
        if (state.fight) { // one fight at a time: with one on, the assault is fought at once and shown after
          const r = stormHQ(state, a.rival, a.guards);
          if (r) { hud.inspected = null; onFight(r.reports[r.reports.length - 1], true); }
        } else if (startAssault(state, a.rival, a.guards)) { hud.inspected = null; playLive(); }
        break;
      }
      case 'callSqueeze': callBigSqueeze(state); break; // Vera answers on the phone, at the next lull
      case 'replay': if (state.battles[a.index] && !state.fight) playBattle(state.battles[a.index]); break;
      case 'fight': if (a.cmd === 'rally' || a.cmd === 'fallBack') fightCommand(state, a.cmd); break;
      case 'bell': ringTheBell(state, a.raid); break;
      case 'autodefend': setAutoDefend(state, !autoDefendOn(state)); break;
      case 'priority': cycleDefendPriority(state, a.plot); break;
      case 'captive': settleCaptive(state, a.id, a.choice); break;
      case 'facility': if (a.kind === 'clubhouse') buildClubhouse(state, a.plot); else buildFacility(state, a.plot, a.kind); break;
      case 'accept': acceptOrder(state, a.id, a.match); break;
      case 'decline': declineOrder(state, a.id); break;
      case 'entry': setTasteOffEntry(state, a); break;
      case 'sponsor': sponsorFestival(state, a.festival); break;
      case 'skipScene': finishScene(true); break;
      case 'storyOffer': answerOffer(state, a.accept); break;
      case 'sceneReply': {
        replyScene(state, a.text);
        const kid = bay.views[LOTTIES_CORNER]?.stand?.kid;
        if (kid) bubbles.say(kid, a.text, { who: 'You', height: 1.6 });
        break;
      }
      case 'forgive': forgiveSquawk(state, a.plot); break;
      case 'kidRaid': if (raidKidStand(state, a.plot)) lottieSays('raidLost', { react: 'fist', text: KIDS_RAID_LINE, ms: 4500 }); break;
      case 'bid': placeBid(state, a.plot, a.amount); break;
      case 'unbid': withdrawBid(state, a.plot); break;
      case 'listPlot': listPlot(state, a.plot); break;
      case 'unlistPlot': unlistPlot(state, a.plot); break;
      case 'refresh': break;
    }
    announceControl(state); // any land that changed hands: Majority and Full Control headlines
    storyAfterAct(state); // a goal met by this tap ticks off now
    bay.sync(state);
    bay.select(hud.inspected);
    flushNews();
    const choosing = hud.setup && !hud.setup.cancel; // first visit: nothing worth saving until they press Start
    if (state.phase !== 'open' && !choosing) saveGame(state);
    if (a.type === 'sleep' || state.outcome) recordScore(state);
    hud.dawns = state.outcome?.result === 'lost' && !state.settings.ironman ? dawnsOf(state.runId) : [];
    hud.canReload = hud.dawns.length > 0;
    if (hud.optionsOpen) hud.slots = slotList();
    hud.render(state, shownSpeed());
  };
  /** Flip an option (src/settings.ts). The raid-warning switch belongs to the run. */
  const setOption = (key: string, value?: string) => {
    if (key === 'raidPause') { state.settings.raidPause = !raidPauses(state.settings); return; }
    if (key === 'lessons') { state.settings.lessons = !lessonsOn(state); return; } // this run's lessons (src/sim/story.ts)
    if (key === 'tour') { hud.optionsOpen = false; coach.replay(); return; } // Lottie's tour from the top (src/ui/coach.ts)
    if (key === 'textSize') { const v = Number(value); if ((TEXT_SIZES as number[]).includes(v)) options.textSize = v as Options['textSize']; }
    else if (key.startsWith('pause.')) { const k = key.slice(6) as PauseKind; if (k in options.pause) options.pause[k] = !options.pause[k]; }
    else if (key === 'autoPause' || key === 'quietNights' || key === 'autoContinue' || key === 'reducedMotion' || key === 'captions' || key === 'celsius') options[key] = !options[key];
    saveOptions(options);
    hud.options = options;
    setReducedMotion(options.reducedMotion);
    prepWait = 0;
  };
  const uiRoot = document.getElementById('ui')!;
  const hud = createHud(uiRoot, act);
  hud.options = options;
  twins = createTwins(uiRoot, () => options.reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches, () => options.captions);
  onSaveTrouble(() => hud.toast("Couldn't save: this browser's storage is full."));
  // Closing the tab or switching away saves where you are (never before a first run has started, and never into a
  // store the player has just wiped).
  const saveNow = () => { if (!hud.setup || hud.setup.cancel) saveOnHide(state); };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveNow(); });
  window.addEventListener('pagehide', saveNow);
  if (saveUnreadable()) hud.toast("Couldn't read your saved game. It's kept aside.");
  const bugle = createBugle(document.getElementById('ui')!);
  const phone = createPhone(document.getElementById('ui')!, (boss, line) => { audio.ring(); setTimeout(() => { audio.babble(line, 0.9, 'flat'); twins?.caption(HQS[boss].boss, line); }, 700); });
  document.getElementById('ui')!.prepend(bubbleLayer);
  // Tape queue counters, HP pills and raid snakes ride over the world, under the HUD (src/world/markers.ts).
  const markerLayer = document.createElement('div');
  document.getElementById('ui')!.prepend(markerLayer);
  const markers = createMarkers(world.scene, markerLayer);
  setBeatSource(() => audio.beat()); // idle bobs land on the theme's beat (src/world/beat.ts)
  // Lottie's tour: the first time you play she shows you the bay and points at each thing to tap (src/ui/coach.ts).
  // A pinned seed (tests, shared links) leaves it off unless the URL asks for it with coach=1.
  const projected = new THREE.Vector3();
  const coach = createCoach(uiRoot, {
    say: (line, mood) => {
      audio.babble(line, 0.8, mood);
      const stand = bay.views[LOTTIES_CORNER]?.stand;
      if (stand?.lottie) stand.react(mood === 'grumpy' ? 'fist' : 'cheer');
    },
    camera: (where, plot) => {
      if (where === 'bay') world.bayView();
      else if (where === 'plot' && plot) focusPlot(plot, 26);
      else focusPlot(LOTTIES_CORNER, 16);
    },
    plotAt: (id) => {
      const p = PLOT_BY_ID[id];
      if (!p) return null;
      projected.set(p.x, 1.2, (p.z + p.streetZ) / 2).project(world.camera);
      if (projected.z > 1 || Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1) return null;
      const el = world.renderer.domElement;
      return [(projected.x * 0.5 + 0.5) * el.clientWidth, (-projected.y * 0.5 + 0.5) * el.clientHeight];
    },
  }, !seedParam || params.get('coach') === '1');
  hud.muted = audio.muted();
  // First visit (no save, no pinned seed): pick a mode and difficulty before the first morning.
  if (!saved && !seedParam) { hud.setup = { settings: defaultSettings(), cancel: false }; hud.leaderboard = loadLeaderboard(); }
  const flushNews = () => {
    if (!state.news.length) return;
    const cards = alertTexts(state); // alerts show as cards in the feed, not as toasts
    while (state.news.length) {
      const n = state.news.shift()!;
      if (cards.has(n)) continue;
      if (n.startsWith('RANK UP') || n.startsWith('YOU OWN THE BAY') || n.startsWith('TARGET HIT')) { stinger('rank-up'); lottieSays('rankUp', { react: 'cheer' }); snap(n, 3, 300); callsQuietUntil = performance.now() + 4500; }
      if (n.startsWith('SQUEEZED OUT') || n.startsWith('RUN OUT OF TOWN')) stinger('squeezed-out');
      hud.toast(n);
    }
  };

  // Click a walker to hear why they passed, or a plot to inspect it (a drag pans the camera instead).
  const canvas = world.renderer.domElement;
  const raycaster = new THREE.Raycaster();
  let down: [number, number] | null = null;
  canvas.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
  canvas.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
    const ndc = new THREE.Vector2((e.clientX / canvas.clientWidth) * 2 - 1, -(e.clientY / canvas.clientHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, world.camera);
    const walker = crowd.pick(raycaster.ray);
    const info = walker?.info as WalkerInfo | undefined;
    if (walker && info) { bubbles.say(walker.who, info.line, { who: SEGMENTS[info.segment].label, icon: info.icon, ms: 2600 }); return; }
    act({ type: 'inspect', plot: bay.pick(ndc, world.camera) });
  });

  // District names float over the map in Bay View.
  const labels = DISTRICTS.map((d) => {
    const el = document.createElement('div');
    el.className = 'district-label';
    el.textContent = d.name;
    document.getElementById('ui')!.prepend(el); // under the HUD, so cards and paper cover it
    return { el, pos: new THREE.Vector3(d.origin[0] + (d.cols * PLOT_SPACING) / 2, 2, d.origin[1]) };
  });

  // Gull Flight: G (or the button) takes Captain Squawk up; G or Esc lands.
  const flight = createGullFlight(world.camera, world.controls, ambient.squawk, canvas);
  const gullBtn = document.createElement('button');
  gullBtn.className = 'gullbtn';
  gullBtn.title = 'Fly Captain Squawk over the bay (G)';
  gullBtn.innerHTML = '<span class="gull-ico" aria-hidden="true"></span><span class="lbl">Fly Squawk</span>';
  gullBtn.addEventListener('click', () => { if (flight.active()) flight.stop(); else flight.start(); gullBtn.classList.toggle('on', flight.active()); });
  document.getElementById('ui')!.appendChild(gullBtn);
  // Keys (every one remappable in Options): Space pauses and resumes, 1-3 set speed, W A S D pan, Q and E turn the
  // view a quarter at a time, G flies the gull, and a letter opens each menu. They work anywhere: mid-fight, at night
  // and in menus. Esc puts away whatever is on top.
  const panning = new Set<KeyAction>();
  const putAway = () => {
    if (hud.remap) hud.remap = null;
    else if (hud.menu) hud.menu = null;
    else if (hud.optionsOpen) hud.optionsOpen = false;
    else if (hud.setup?.cancel) hud.setup = null;
    else if (hud.inspected) hud.inspected = null;
    else return;
    act({ type: 'refresh' });
  };
  window.addEventListener('keydown', (e) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (hud.remap) { // Options is waiting for a key: this one (Esc keeps the old)
      e.preventDefault();
      if (e.code !== 'Escape') { bindKey(options, hud.remap, e.code); saveOptions(options); }
      hud.remap = null;
      act({ type: 'refresh' });
      return;
    }
    if (e.code === 'Escape') { putAway(); return; }
    const k = actionFor(options, e.code);
    if (!k) return;
    if (k === 'panUp' || k === 'panDown' || k === 'panLeft' || k === 'panRight') { panning.add(k); return; }
    if (e.repeat) return;
    if (k === 'pause') { if (speed) pause(); else resume(); e.preventDefault(); }
    else if (k === 'speed1' || k === 'speed2' || k === 'speed3') setSpeed(Number(k.slice(5)));
    else if (k === 'turnLeft' || k === 'turnRight') world.turnStep(k === 'turnLeft' ? -1 : 1);
    else if (k === 'gull') {
      if (hud.setup) return;
      if (flight.active()) flight.stop(); else flight.start();
      gullBtn.classList.toggle('on', flight.active());
    } else if ((MENU_IDS as string[]).includes(k)) act({ type: 'menu', id: k as MenuId });
  });
  window.addEventListener('keyup', (e) => { const k = actionFor(options, e.code); if (k) panning.delete(k); });
  window.addEventListener('blur', () => panning.clear());

  // Debug/test handle for Playwright and agents (same idea as Owl World's).
  (window as unknown as { __game: unknown }).__game = {
    get state() { return state; },
    act,
    backend: world.backend,
    quality: world.quality,
    renderStats: () => world.stats(),
    world,
    view: (x: number, z: number, distance: number) => world.focus(x, z, distance),
    crowd: () => crowd.activeCount(),
    people: () => crowd.stats(),
    bubbles: () => bubbles.count(),
    lottieSays: (m: BarkMoment, ms?: number) => lottieSays(m, { react: 'cheer', ms }),
    bugle: () => { snap('TEST EDITION: LOTTIE\'S CORNER', 9); },
    markers: () => markers.count(),
    showBugle: () => { const b = bugle.best(state.day); if (b) bugle.show(b); return !!b; },
    scene: (id: SceneId) => scenes.play(id),
    ring: (boss: RivalId, mood: 'warn' | 'sore' | 'smashed' | 'gloat' = 'warn') => phone.ring(boss, pick(BOSS[boss][mood])),
    battle: () => battle.active(),
    playBattle: (b: BattleReport) => playBattle(b),
    /** The live fight: its clock, who's up and the buttons (null: none on). */
    fight: () => fightStatus(state),
    /** Fight the live fight (and the rest of an HQ assault) to the end now. */
    finishFight: () => { settleFight(); hud.render(state, shownSpeed()); },
    vip: () => vip.active(),
    hqOf: (id: RivalId) => hqPlot(id).id,
    vipWhere: () => vip.where(),
    vipPlay: (kind: 'heli' | 'ship', plot: string, big = false, level = 1, client = '', first = false) => { focusPlot(plot, kind === 'ship' ? 60 : 45); vip.play(kind, bay.views[plot], big, level, client, first); },
    vipSkip: () => vip.skip(),
    dex: () => welcomeDex(state),
    coach: () => ({ step: coach.current(), seen: [...coach.memory().seen], off: coach.memory().off }),
    focus: (id: string) => focusPlot(id, 18),
    /** Tick the clock (business hours or the night) up to `minutes`, stopping where the phase changes. */
    fastForward(minutes: number) {
      const from = state.phase;
      if (from !== 'open' && from !== 'night') return;
      atOnce(() => { for (let i = 0; i < minutes && state.phase === from; i++) tickMinute(state); });
      if (state.phase !== from) { flushNews(); saveGame(state); if (state.phase === 'prep') atDawn(); }
      hud.render(state, shownSpeed());
    },
    /** The clock as it runs now: real seconds per game minute (Infinity: stopped), and the speed knob. */
    clock: () => ({ phase: state.phase, minute: state.minute, speed, shown: shownSpeed(), spm: secondsPerMinute(state, speed, { fighting: liveFight, quiet: quiet() }) }),
  };

  morningLine();
  const timer = new THREE.Timer();
  world.renderer.setAnimationLoop(() => {
    timer.update();
    const realDt = timer.getDelta();
    const dt = Math.min(realDt, 0.1);
    // Full-screen paper (New Game, Options, a menu, the Bugle's front page) pauses the clock while it runs, with its
    // own switch in Options, and putting it away brings the speed back. Space and 1-3 still work behind it. A won or
    // lost run and the first visit's New Game hold everything.
    const paper = !!hud.setup || hud.optionsOpen || isFullMenu(hud.menu) || !!uiRoot.querySelector('.frontpage');
    if (paper !== screenUp) {
      screenUp = paper;
      if (paper && speed && (state.phase === 'open' || state.phase === 'night') && options.autoPause && options.pause.screens) { pause(); screenPaused = true; }
      else if (!paper && screenPaused) { screenPaused = false; if (!speed) resume(); }
    }
    const frozen = speed === 0 || outcomeUp() || (!!hud.setup && !hud.setup.cancel); // the clock, the brawl and the scenes hold still
    if (panning.size && !flight.active()) {
      const has = (k: KeyAction) => (panning.has(k) ? 1 : 0);
      world.panBy((has('panRight') - has('panLeft')) * Math.min(realDt, 0.1), (has('panUp') - has('panDown')) * Math.min(realDt, 0.1));
    }
    if (state.phase !== 'night' && state.phase !== 'report') quietOff = false; // each night starts quiet again
    // A live fight takes the screen once it's free (the brawl before settles first); its own clock moves the game's.
    if (state.fight && onScreen !== state.fight && !battle.active()) playLive();
    if (state.fight) { if (!frozen && onScreen === state.fight) runFight(dt); acc = 0; }
    else if ((state.phase === 'open' || state.phase === 'night') && !frozen && !vipResume) {
      // Business hours at ~18 real s a game hour, nights at ~8 (quiet nights 3×), fights and warnings at fight speed.
      const from = state.phase;
      const rate = () => secondsPerMinute(state, speed, { fighting: liveFight, quiet: quiet() });
      acc += dt;
      let guard = 0;
      while (acc >= rate() && guard++ < 240) {
        acc -= rate();
        drawEvents(tickMinute(state));
        if (state.phase !== from || speed === 0 || vipResume) { acc = 0; break; }
      }
      if (state.phase !== from) { flushNews(); saveGame(state); bay.sync(state); }
      else flushNews();
      // Any day resumes mid-day: the clock saves once a game hour (and whenever the page is hidden, above).
      const hour = Math.floor(state.minute / 60);
      if (midDay(state) && hour !== savedHour) { savedHour = hour; saveGame(state); }
    } else acc = 0;
    // Morning Prep waits for you, unless the day starts by itself (Options); big alerts at dawn still stop it.
    if (state.phase === 'prep' && options.autoContinue && !frozen && !paper && !state.outcome && !playingScene(state) && !sceneReady(state) && !(state.redDays && autoPauses(options, state, 'red'))) {
      prepWait += realDt;
      if (prepWait >= AUTO_CONTINUE_SECONDS) act({ type: 'open' });
    } else if (state.phase !== 'prep') prepWait = 0;
    // The Evening is a moment: once the Ledger is folded (or with auto-continue on), the night starts by itself.
    if (state.phase === 'report' && !frozen && !paper && !state.outcome && (!hud.ledger || options.autoContinue)) {
      eveningWait += dt * Math.max(speed, 1);
      if (eveningWait >= EVENING_REAL_SECONDS) act({ type: 'night' });
    } else if (state.phase !== 'report') eveningWait = 0;
    const dayFrac = state.phase === 'prep' ? 0 : (state.minute - OPEN) / (CLOSE - OPEN);
    world.setWeather(state.phase === 'prep' ? state.forecast.kind : state.weather.kind, dayFrac);
    world.setClock(state.phase, state.minute);
    bay.update(state, timer.getElapsed(), phone.ringing(), world.controls.target);
    crowd.setWeather(state.phase === 'prep' ? state.forecast.kind : state.weather.kind);
    crowd.setSeason(seasonOf(state.day));
    crowd.update(frozen ? 0 : dt, state.phase === 'open' ? Math.max(speed, 1) : 1);
    battle.update(frozen ? 0 : dt);
    vip.update(frozen ? 0 : Math.min(realDt, 0.5)); // VIP pickups play in real time even when frames are slow
    traffic.update(state, frozen ? 0 : dt, world.controls.target, { hold: battle.active() || vip.active(), camera: world.camera }); // paused: traffic holds still too
    ambient.update(state, dt, timer.getElapsed(), world.controls.target, bay.views);
    flight.update(dt);
    if (!flight.active()) gullBtn.classList.remove('on');
    scenes.update(state, frozen ? 0 : dt, bay.views);
    const sc = playingScene(state);
    if (sc) {
      if (!frozen) sceneT += dt;
      if (!sceneWorld) sayScene(sc);
      if ((!sceneWorld && sceneT >= sc.seconds) || sceneT >= SCENE_MAX_SECONDS) finishScene(false);
    } else if (sceneReady(state) && lull()) startScene();
    hud.sceneTime = sceneT;
    // Boss calls ring at a lull too, one a game day (src/sim/phone.ts picks which); never over a scene, fight or pickup.
    if (!busy() && !playingScene(state) && !sceneReady(state) && performance.now() > callsQuietUntil) {
      const call = takeCall(state);
      if (call) { phone.ring(call.who, call.text || pick(BOSS[call.who][call.mood])); if (state.phase === 'prep' || state.phase === 'report') saveGame(state); }
    }
    if (state.phase === 'report' || state.phase === 'night') lottieSays('night', { cooldown: 9000, icon: 'zzz' });
    bubbles.update(world.camera, canvas.clientWidth, canvas.clientHeight);
    markers.update(state, world.camera, world.controls.target, bay.views, canvas.clientWidth, canvas.clientHeight);
    if (vipResume && !vip.active()) vipResume = 0;
    // A VIP show or a brawl is framed close: phones keep mid-zoom models there instead of Bay View blocks.
    world.capDetail(battle.active() || vip.active() ? 1 : null);
    world.pilot(flight.active()); // Gull Flight steers the camera; the clock, twos, light and detail run on
    world.update(dt);
    const dist = world.camera.position.distanceTo(world.controls.target);
    for (const l of labels) {
      const show = dist > 90;
      l.el.style.display = show ? '' : 'none';
      if (show) { const [x, y] = toScreen(l.pos); l.el.style.left = `${x}px`; l.el.style.top = `${y}px`; }
    }
    world.render();
    hud.playing = battle.active() || vip.active(); // a brawl or a VIP show on screen: the pause knob stays at hand
    if (snapReq) {
      // Only a moment that beats today's best is photographed, and never with a full-size
      // toDataURL in the frame: grab a small bitmap now (right after render, before the
      // buffer clears) and encode it when the browser is idle.
      const req = snapReq, day = state.day;
      snapReq = null;
      const best = bugle.best(day);
      if (!snapBusy && (!best || req.score > best.score) && typeof createImageBitmap === 'function') {
        snapBusy = true;
        createImageBitmap(canvas, { resizeWidth: 360, resizeQuality: 'medium' }).then((bmp) => {
          const encode = () => {
            try {
              const c = document.createElement('canvas');
              c.width = bmp.width; c.height = bmp.height;
              c.getContext('2d')?.drawImage(bmp, 0, 0);
              bugle.offer({ url: c.toDataURL('image/jpeg', 0.75), ...req, day });
            } catch { /* tainted or lost canvas: no photo today */ }
            bmp.close();
            snapBusy = false;
          };
          const idle = (window as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
          if (idle) idle(encode, { timeout: 2000 }); else setTimeout(encode, 0);
        }).catch(() => { snapBusy = false; });
      }
    }
    hud.render(state, shownSpeed());
    coach.update(state, shownSpeed(), busy() || !!playingScene(state) || outcomeUp());
  });
  document.body.dataset.ready = '1';
}

main().catch((err) => {
  console.error(err);
  document.getElementById('ui')!.innerHTML = `<div class="modal-bg"><div class="modal"><h2>Couldn't start the game</h2><p>${String(err)}</p></div></div>`;
});
