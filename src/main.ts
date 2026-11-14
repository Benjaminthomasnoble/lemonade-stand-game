import './style.css';
import { answerCall, liveCall } from './sim/calls.ts';
import './screens.css';
import './coach.css';
import { createCoach } from './ui/coach.ts';
import * as THREE from 'three';
import {
  buildStand, buyBrand, buyPlot, buySupply, CLOSE, DISTRICTS, LOTTIES_CORNER, newGame, onMap, OPEN, openStands, PLOT_BY_ID, PLOT_SPACING,
  priceCeiling, runCampaign, fitSpec, SEGMENTS, selectedStand, setPrice, pickRecipe, setSweetness, simulateRestOfDay, sleepUntilDawn,
  tickMinute, upgradeStand, type GameState, type SegmentId, type SimEvent,
  alertTexts, dismissAlert, restockNow, isMajor, QUIET_NIGHT_SPEED, quietNight, raidPauses, calmAudioOn, raidTicks, secondsPerMinute, sleepPlan, startNight, type Alert,
  buildClubhouse, buyGadget, buyPerimeter, equip, fillPosts, fireGuard, hireGuard, planRaid, postGuard, promote, rebuildStand, repairFence, resetSlick,
  battleHeadline, playerWon, welcomeDex, type BattleReport, acceptOrder, buildFacility, declineOrder,
  factionBuyout, haggle, makeTruce, plotBuyout, setNegotiator, hqPlot, HQS, type RivalId, answerBuyout, callBigSqueeze,
  borrow, defaultSettings, keepSqueezing, repayLoan, type Settings,
  setTasteOffEntry, sponsorFestival, forgiveSquawk, nudgeStockTarget, setStockTarget, toggleAutoRestock, setByHand, toggleAutoPrice,
  announceControl, listPlot, placeBid, unlistPlot, withdrawBid,
} from './sim/economy.ts';
import { createBattle } from './world/battle.ts';
import { waitAt } from './sim/clubhouse.ts';
import { ringTheBell } from './sim/reinforce.ts';
import { autoDefendOn, cycleDefendPriority, setAutoDefend } from './sim/autodefend.ts';
import { settleCaptive } from './sim/captives.ts';
import { atOnce, fightCommand, fightFrame, fightStatus, finishFight, liveReport, watchFights } from './sim/fight.ts';
import { RADIO_LINE_MS, soundtrack } from './ui/radio.ts';
import { createAudio, STINGER_CHOKE_SECONDS, TICK_SECONDS, type Motif, type Stinger } from './audio.ts';
import { createTwins, type Twins } from './ui/twins.ts';
import { createVip } from './world/vip.ts';
import { createTraffic } from './world/traffic.ts';
import { bySea, clockText, frontPage, isVip, KIDS_RAID_LINE, loadsAtFacility, pickupPlace, raidKidStand, seasonOf } from './sim/economy.ts';
import { airedToday, morningShow, radioOn, RIVAL_JINGLES, threatLevel } from './sim/economy.ts'; // audio cues (threat layers, radio leitmotifs)
import { approveRepair, toggleAutoRepair, type PlotState } from './sim/economy.ts'; // Damaged buildings and Auto-Repair (src/sim/damage.ts)
import { runBulk, setPolicy, togglePolicyPlot } from './sim/economy.ts'; // land: bulk orders and district policies (src/sim/policies.ts)
import { gullScout, pierTarget, scoutWithLookout } from './sim/scouting.ts';
import { raidTemplate } from './sim/templates.ts';
import { aimGull, trackGull } from './ui/gull.ts';
import {
  clearSave, dawnsOf, loadDawn, loadDawnSlot, loadGame, loadLeaderboard, loadSlot, onSaveTrouble, recordScore, saveDawn, saveGame, saveOnHide, saveSlot,
  saveUnreadable, slotList,
} from './save.ts';
import {
  actionFor, autoPauses, bindKey, defaultKeys, loadOptions, MENU_IDS, saveOptions, TEXT_SIZES, type KeyAction, type MenuId,
  type Options, type PauseKind,
} from './settings.ts';
import { isFullMenu, menuUnlocked } from './ui/menus.ts';
import { newKnob, paperKnob, pauseKnob, resumeKnob, setKnob } from './ui/knob.ts';
import { withKey } from './ui/keys.ts';
import { newWaits, waitStep } from './ui/waits.ts';
import { createHud, type Action } from './ui/hud.ts';
import { walkerInfo, type WalkerInfo } from './ui/stand.ts';
import { createWorld, dirOf, headingOf, STREET_LOOK } from './world/scene.ts';
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
import { RECIPE_COLOR } from './ui/recipes.ts';
import { beginScene, endScene, playingScene, replyScene, SCENE_MAX_SECONDS, sceneReady, type Scene } from './sim/scenes.ts';
import { crewCheer, grandkid, renameCrew } from './sim/grandkid.ts';
import { pickTip, tipsKey } from './sim/perks.ts';
import { takeCall } from './sim/phone.ts';
import { endVictoryShow, victoryStage, victoryTick } from './sim/victory.ts';
import { lessonsOn, storyAfterAct, storyDateline } from './sim/story.ts';
import { answerOffer } from './sim/beats.ts';
import { createGullFlight } from './world/gullflight.ts';
import { setReducedMotion } from './world/clay/kit.ts';
import { gullIcon } from './ui/clay.ts';

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

/** Street View's framing (focusPlot, streetShot): the distance back by stand level (L1 … L5; a plot with no stand as
 * L1), so a Kiosk and a Lemon Shack both fill about a third of the screen, and how far from the street's centre line
 * the camera aims (the sidewalk is at 5.1, the plot's centre at 10). A portrait phone stands further back for width. */
const STREET_DIST = { landscape: [13, 13, 14, 14.5, 15.5], portrait: [15.5, 16, 17, 19, 20] };
const STREET_AIM = { landscape: 7, portrait: 8 };
/** A VIP arrival's framing (watchVip): a laptop at mid zoom; a phone closer in and from higher up, so the shot sees
 * less of the town behind, which keeps a late-game phone within its budget. */
const SHOW_SHOT = { heli: { laptop: 45, phone: 40 }, ship: { laptop: 60, phone: 44 }, phonePitch: 0.85 };
/** Draw walkers only for plots this close to what the camera looks at, and only when zoomed in. */
const STREET_VIEW_RADIUS = 45;
const STREET_VIEW_MAX_DIST = 70;

async function main() {
  const params = new URLSearchParams(location.search);
  const seedParam = params.get('seed');
  const saved = seedParam ? null : loadGame();
  /** A fresh run: new seed (unless the URL pins one), its own leaderboard row, and a first dawn autosave. */
  const freshRun = (settings: Partial<Settings> = {}, seed?: number) => {
    const s = newGame(seed ?? (Date.now() & 0x7fffffff), settings); // the run's seed comes from the clock here, not in src/sim
    s.runId = `${s.seed.toString(36)}-${Date.now().toString(36)}`;
    saveDawn(s);
    return s;
  };
  let state: GameState = saved ?? freshRun({}, seedParam ? Number(seedParam) : undefined);
  state.runId ??= `${state.seed.toString(36)}-${Date.now().toString(36)}`; // saves from before the leaderboard
  watchFights(true); // fights you're in play live on screen (the skips still fight at once)
  // The clock (spec: Clock and speed). speed 0 is a pause, from Space, the ❚❚ knob or an auto-pause on a major
  // alert: the clock, the brawl on screen and any VIP scene all hold still. Full-screen paper pauses too, and the
  // knob knows who holds the pause (src/ui/knob.ts): putting the paper away resumes only a pause the paper made.
  const knob = newKnob();
  let vipResume = 0; // a watched first visit holds the clock (not its scene) until the show is over
  let vipPaused = ''; // the first-arrival card that auto-paused the clock: Watch or dismiss resumes it
  let acc = 0;
  // A save made during business hours or the night picks up where it left off, paused (Space or a speed goes on).
  const midDay = (s: GameState) => s.phase === 'open' || s.phase === 'night';
  if (saved && midDay(saved)) knob.speed = 0;
  let savedHour = -1; // the game hour last saved mid-day (the clock saves once a game hour, and when the page hides)
  let options: Options = loadOptions();
  setReducedMotion(options.reducedMotion); // "Less motion" reaches the world too: no boil, shakes or flashes (src/world/clay/kit.ts)
  let liveFight = false; // the brawl on screen is happening now: the clock runs at fight speed
  const fightQueue: BattleReport[] = []; // tonight's brawls wait their turn on screen
  let onScreen: GameState['fight'] = undefined; // the live fight the 3D view is playing (its clock runs only then)
  const waits = newWaits(); // Morning Prep's auto-continue and the Evening's moment (src/ui/waits.ts)
  let quietOff = false; // a speed picked during a quiet night: the quiet 12× gives way to it until dawn
  const outcomeUp = () => !!state.outcome && !(state.outcome.result === 'won' && state.endlessSince !== undefined) && victoryStage(state) !== 'scenes'; // as the HUD's outcome screen (the Domination show's fight and exits play first)
  const pause = () => pauseKnob(knob); // a load, an alert or a key: it outlasts the paper (src/ui/knob.ts)
  const resume = () => { vipPaused = ''; resumeKnob(knob); };
  /** Fast raid nights (Options): a quiet night runs at 12× by itself until an alert comes in, or until you pick a speed. */
  const quiet = () => options.quietNights && !quietOff;
  const setSpeed = (v: number) => {
    if (v <= 0) { pause(); return; }
    vipPaused = ''; // you picked the speed: an old card no longer owns the pause
    if (quiet() && quietNight(state)) quietOff = true;
    setKnob(knob, v);
  };
  /** The speed the clock actually runs at, for the knobs: a quiet night shows its 12×. */
  const shownSpeed = () => (knob.speed && !liveFight && quiet() && quietNight(state) ? QUIET_NIGHT_SPEED : knob.speed);

  const audio = createAudio(() => calmAudioOn(state.settings)); // Calm Audio belongs to the run, like the raid pause
  // Every stinger has a visual twin (src/ui/twins.ts): a screen-edge pulse in its colour and pattern beside its card.
  let twins: Twins | null = null; // once the HUD is up
  const stinger = (id: Stinger) => { audio.stinger(id); twins?.pulse(id); };
  /** The alert's mark in the world (markers.ts stamp): set once the markers exist. */
  let stampAt: (plot: string, text: string, tone: 'good' | 'bad' | 'gold') => void = () => {};
  const stamped = new Set<string>(); // a fight shown live isn't stamped again at dawn
  const stampFight = (b: BattleReport) => { const k = `${b.day}|${b.target}|${b.attacker}`; if (stamped.has(k)) return; stamped.add(k); stampAt(b.target, won(b) ? (b.attacker === 'player' ? 'WON!' : 'HELD!') : 'SQUEEZED', won(b) ? 'good' : 'bad'); };
  const wake = () => audio.start();
  window.addEventListener('pointerdown', wake, { once: true });
  window.addEventListener('keydown', wake, { once: true });
  const won = playerWon; // crew.ts: a side that Fell Back lost the fight, whatever became of the stand
  /** A raid warning lands: the Raid Incoming stinger and Lottie's fist (the boss's call rings from the sim's phone queue). */
  let tickHold = 0; // performance.now() while the Raid Incoming stinger plays: the countdown's ticks take over after
  let tickIn = 0; // real seconds till the countdown's next tick
  const raidWarned = () => {
    stinger('raid-incoming');
    tickHold = performance.now() + STINGER_CHOKE_SECONDS * 1000;
    lottieSays('raidComing', { react: 'fist' });
  };
  /** A card lands in the alert feed; a major alert auto-pauses when its switch is on. A VIP client's first visit
   * pauses and waits for its card's Watch (see watchVip); dismissing the card skips the show. */
  const onAlert = (a: Alert) => {
    if (a.kind === 'raid' || a.kind === 'delivery') raidWarned();
    if (isMajor(a) && autoPauses(options, state, a.kind)) { pause(); if (a.kind === 'vip') vipPaused = a.id; }
  };
  /** A rank-up's hand of Lottie's Tips came up to pick from (src/sim/perks.ts): it pauses like its alert, wherever it
   * came from (the clock, a tap, the dawn, a skip), once a hand. Picking brings up the next hand, if there is one. */
  let tipsSeen = tipsKey(state);
  const tipsCheck = () => {
    const k = tipsKey(state);
    if (k === tipsSeen) return;
    tipsSeen = k;
    if (k && autoPauses(options, state, 'perk')) pause();
  };
  /** A VIP card's Watch: the camera flies to the pad or pier and the arrival plays. A first visit holds the clock
   * for its show (its own switch); a regular's replays while the clock runs on. */
  const watchVip = (a: Alert) => {
    if (!a.plot || !a.scene || !bay.views[a.plot]) return;
    if (flight.active()) { flight.stop(); gullBtn.classList.remove('on'); }
    hud.ledger = false;
    cutScene(); // the show takes the screen: a story scene stops
    crowd.clear();
    playVip(a.scene.kind, a.plot, a.scene.big, a.scene.client ?? '', a.kind === 'vip');
    showShot(a.plot, a.scene.kind);
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
    hud.inspected = null; vipResume = 0; vipPaused = ''; acc = 0; savedHour = -1; tipsSeen = tipsKey(state);
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
    waits.prep = 0;
    tipsCheck(); // the Rank lesson's morning brings up a hand dealt before it
    const shot = bugle.best(state.day - 1);
    if (shot) bugle.show({ ...shot, edition: storyDateline(state) }, frontPage(state), options.celsius); // world: this morning's headline (a new act's too) and briefs under yesterday's photo
  };
  const afterSleep = () => {
    const fights = state.battles.filter((b) => b.day === state.day - 1);
    if (fights.length) stinger(fights.every(won) ? 'raid-won' : 'squeezed-out');
    fights.forEach(stampFight);
  };

  const world = await createWorld(document.getElementById('app')!);
  const bay = createBay(world.scene, world.quality === 'phone');
  bay.sync(state);
  /** Street View's shot of a plot: where the camera aims, how far back it stands (by the stand's level), and the
   * heading that looks at the stand's front from the street. */
  const streetShot = (id: string) => {
    const p = PLOT_BY_ID[id], portrait = world.camera.aspect < 1;
    const level = Math.min(5, Math.max(1, state.plots[id]?.stand?.level ?? 1));
    return {
      x: p.x, z: p.streetZ - p.facing * (portrait ? STREET_AIM.portrait : STREET_AIM.landscape),
      distance: (portrait ? STREET_DIST.portrait : STREET_DIST.landscape)[level - 1],
      face: STREET_LOOK.heading + (p.facing > 0 ? Math.PI : 0),
    };
  };
  // The opening shot: Street View on Lottie's Corner, from the street side above the dock.
  const opening = streetShot(LOTTIES_CORNER);
  world.controls.target.set(opening.x, 0.8, opening.z);
  world.camera.position.copy(dirOf(opening.face, STREET_LOOK.pitch)).multiplyScalar(opening.distance).add(world.controls.target);

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
    onSquawkSteal: (gull, plot) => {
      bubbles.say(gull, 'SQUAWK!', { who: 'Captain Squawk', height: 0.9, ms: 1600 });
      if (plot === LOTTIES_CORNER) setTimeout(() => lottieSays('squawk', { react: 'fist' }), 500); // she sees it from her chair
    },
    onGlare: (who, rival) => { if (Math.random() < 0.5) { const l = pick(HENCH[rival]); bubbles.say(who, l, { ms: 1800 }); audio.babble(l, 0.8, 'grumpy'); } },
  });

  const scenes = createScenes(world.scene, {
    say: (who, line, speaker, color) => { bubbles.say(who, line, { who: speaker, color, height: 2.1 }); audio.babble(line, speaker === 'Dex' ? 1.2 : 0.9, 'flat'); twins?.caption(speaker, line); },
    lottie: (line, react) => lottieSays('morning', { text: line, react }),
    // No ring hook: a scene's follow-up call (Vera after the Steward) is queued by the sim when the scene ends.
    done: (id) => { const sc = playingScene(state); if (sc && (id === 'visit' ? !!sc.speaker : sc.world === id)) finishScene(false); },
    radio: (who, line) => { const st = bay.views[LOTTIES_CORNER]?.stand; if (st) bubbles.say(st.group, line, { who, height: 2.6, ms: 3800 }); audio.babble(line, 0.75, 'grumpy'); twins?.caption(who, line); },
    gull: ambient.squawk,
  });

  // Story scenes wait for a lull: Morning Prep with nothing else on screen. One plays at a time, under a minute.
  let sceneT = 0, sceneWorld = false, sceneSaid = 0;
  let shotHeld = false; // a scene had the camera last frame
  const busy = () => !!hud.setup || hud.optionsOpen || isFullMenu(hud.menu) || battle.active() || vip.active() || !!vipResume || phone.ringing() || flight.active() || !!document.querySelector('.frontpage');
  const lull = () => !busy() && !scenes.active() && knob.speed !== 0; // a paused game starts no scene
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
    else if (sceneWorld) scenes.play(sc.world as SceneId, { lines: sc.lines, color: (RECIPE_COLOR as Record<string, string>)[sc.id.replace(/^page-/, '')] });
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
      // a Caterer Truck loads at your Warehouse at closing: it plays in the world, the camera stays put
      if (e.ok && live && o.plot && loadsAtFacility(o) && pickupPlace(o) === 'Warehouse' && bay.views[o.plot] && !vip.active()) { vip.play('truck', bay.views[o.plot], false); continue; }
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
      const wins = owner === 'player' ? BRAWL.win.player.map((t) => crewCheer(state, t)) : BRAWL.win[owner]; // your crew cheers its own name (sim/grandkid.ts)
      const l = pick(wins);
      winners.slice(0, 2).forEach((w, i) => setTimeout(() => bubbles.say(w, i ? pick(wins) : l, { ms: 1800, color: sideColor(owner), height: 1.9 }), i * 350));
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
    stampFight(b);
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
  /** A live fight runs on its own clock: 1 game minute a fight-second whatever the speed; paused, the fight and the
   * clock both hold still (fight.ts fightFrame). */
  const runFight = (dt: number, paused: boolean) => {
    const from = state.phase;
    const frame = fightFrame(state, dt, paused, (ev) => drawEvents(ev));
    if (!frame) return;
    const { ended } = frame;
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
   * a portrait phone's narrow frame stands a little further back. The aim sits on the stand (7-8 from the street's
   * centre line; the sidewalk is at 5.1), so the road stays at the bottom edge. A plot across the street swings the
   * camera round to its front (streetShot); `pitch` looks from higher up (a phone's VIP shot). */
  const focusPlot = (id: string, distance?: number, pitch?: number) => {
    const s = streetShot(id);
    world.focus(s.x, s.z, distance ?? s.distance, { face: s.face, pitch });
  };
  /** A VIP arrival on screen (after vip.play): framed on its stage (vip.stage(): the pad, or the ship's berth), the
   * pad from the plot's street side, a ship from behind its pier looking out at the berth (a turned dock's berth is
   * round the side). The shot's heading and pitch hold for the show; the next look goes back to the ones before. */
  const showShot = (plot: string, kind: 'heli' | 'ship') => {
    const ph = world.quality === 'phone', dist = SHOW_SHOT[kind][ph ? 'phone' : 'laptop'], pitch = ph ? SHOW_SHOT.phonePitch : undefined;
    const p = PLOT_BY_ID[plot], at = vip.stage();
    if (!at) { focusPlot(plot, dist, pitch); return; }
    const out = new THREE.Vector3(p.x - at.x, 0, p.z - at.z);
    const ship = kind === 'ship' && out.lengthSq() > 4;
    const k = ship ? 0.6 : 1; // a ship: between the pier and the berth, nearer the berth
    world.focus(p.x + (at.x - p.x) * k, p.z + (at.z - p.z) * k, dist, { heading: ship ? headingOf(out) : streetShot(plot).face, pitch });
  };

  const act = (a: Action) => {
    const st = selectedStand(state);
    if (state.phase === 'report') waits.evening = 0; // the Evening is a moment after the last thing you did
    switch (a.type) {
      case 'buy': buySupply(state, a.id, a.packs); break;
      case 'call': answerCall(state, a.pick, { postGuards: (p) => fillPosts(state, p) }); break;
      case 'recipe': if (pickRecipe(state, st, a.id)) setByHand(state, state.selected, 'card'); break;
      case 'sweet': setSweetness(st, a.value); setByHand(state, state.selected, 'card'); break;
      case 'price': setPrice(st, st.price + a.delta); setByHand(state, state.selected, 'price'); break;
      case 'priceCeiling': setPrice(st, priceCeiling(state, state.selected)); break;
      case 'restock': toggleAutoRestock(state, state.selected); break;
      case 'autoPrice': toggleAutoPrice(state, state.selected); break;
      case 'stockTarget': if (a.delta) nudgeStockTarget(state, state.selected, a.delta > 0 ? 1 : -1); else setStockTarget(state, state.selected, null); break;
      case 'open': if (openStands(state)) { acc = 0; waits.prep = 0; resume(); } break;
      case 'speed': setSpeed(a.value); break;
      // The skips run the clock flat out and stop at the next major alert (then the live clock takes over).
      case 'skip': { resume(); settleFight(); const ev = atOnce(() => simulateRestOfDay(state, true)); crowd.clear(); drawEvents(ev, false); break; }
      case 'night': { // nothing coming tonight: Sleep skips to dawn; a raid night plays, racing to the warning
        hud.ledger = false;
        const plan = sleepPlan(state);
        if (plan === 'dawn') act({ type: 'sleep' });
        else if (plan === 'night' && startNight(state)) { acc = 0; waits.evening = 0; resume(); }
        break;
      }
      case 'evening': hud.ledger = false; waits.evening = 0; break;
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
      case 'resetKeys': options.keys = defaultKeys(); saveOptions(options); hud.remap = null; gullTip(); break;
      case 'turn': world.turnStep(a.dir); break;
      case 'option': setOption(a.key, a.value); break;
      case 'mute': hud.muted = audio.toggle(); break;
      case 'newgame': case 'setup': hud.setup = { settings: { ...state.settings }, cancel: true }; hud.leaderboard = loadLeaderboard(); hud.menu = null; break; // no paper left open under the New Game screen
      case 'cancelSetup': hud.setup = null; break;
      case 'start': {
        if (state.day > 1) recordScore(state); // the run being left keeps its row on the leaderboard
        clearSave();
        state = freshRun(a.settings);
        hud.setup = null; hud.inspected = null; hud.menu = null; Object.assign(knob, newKnob()); vipResume = 0; vipPaused = ''; bubbles.clear();
        crowd.clear(); stopFights(); resetScene(); bay.sync(state); focusPlot(state.selected);
        break;
      }
      case 'keepSqueezing': keepSqueezing(state); break;
      case 'victoryNext': endVictoryShow(state); break; // the ending's Continue: the victory screen (src/ui/ending.ts)
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
      case 'spec': fitSpec(state, state.selected, a.slot, a.id); break;
      case 'select': state.selected = a.plot; hud.inspected = a.plot; focusPlot(a.plot); break;
      case 'inspect': // a tap on the map, or a pick from a menu's list (which flies there)
        if (a.plot && hud.menu && hud.menu !== 'goals') focusPlot(a.plot);
        hud.inspected = a.plot;
        if (hud.menu !== 'goals') hud.menu = null;
        break;
      case 'buyPlot': buyPlot(state, a.plot); break;
      case 'build': buildStand(state, a.plot, a.level); break;
      case 'view': if (a.target === 'home') focusPlot(state.selected); else world.bayView(); break;
      case 'perimeter': buyPerimeter(state, a.plot); break;
      case 'gadget': buyGadget(state, a.plot, a.id); break;
      case 'repairFence': repairFence(state, a.plot); break;
      case 'resetSlick': resetSlick(state, a.plot); break;
      case 'rebuild': rebuildStand(state, a.plot); break;
      case 'repair': approveRepair(state, a.plot); break;
      case 'autoRepair': toggleAutoRepair(state, a.plot); break;
      case 'bulk': runBulk(state, a.order); break; // land: a bulk order from the Grow tab
      case 'policy': setPolicy(state, a.district, a.kind, a.budget); break; // land: a district's policy, or its budget
      case 'policyPlot': togglePolicyPlot(state, a.plot); break;
      case 'hire': hireGuard(state, a.id); break;
      case 'fire': fireGuard(state, a.id); break;
      case 'post': postGuard(state, a.id, a.plot); break;
      case 'equip': equip(state, a.id, a.item); break;
      case 'promote': promote(state, a.id, a.specialty); break;
      case 'scout': scoutWithLookout(state, a.id, a.plot); break;
      case 'gullTo': flyOver(a.plot); break; // crew: Gull Flight from the Raid Planner
      case 'gullLand': if (flight.active()) { flight.stop(); gullBtn.classList.remove('on'); } break;
      case 'gullScout': gullScout(state, a.plot); break;
      case 'template': raidTemplate(state, a); break; // crew: raid templates (Rank 6)
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
      case 'factionBuyout': if (factionBuyout(state, a.rival)) { stinger('raid-won'); stampAt(hqPlot(a.rival).id, 'SOLD', 'good'); } break;
      case 'negotiator': setNegotiator(state, a.id); break;
      case 'haggle': if (haggle(state, a.rival, a.move) && a.move === 'firm') { stinger('raid-won'); stampAt(hqPlot(a.rival).id, 'WON!', 'good'); } break;
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
      case 'tip': pickTip(state, a.id); break; // keep one of Lottie's Tips (src/sim/perks.ts)
      case 'crewName': renameCrew(state, a.name); break; // the Crew roster's name field (src/sim/grandkid.ts)
      case 'sceneReply': {
        replyScene(state, a.text);
        const kid = bay.views[LOTTIES_CORNER]?.stand?.kid;
        if (kid) bubbles.say(kid, a.text, { who: grandkid(state).first, height: 1.6 });
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
    tipsCheck(); // a rank-up from this tap (a buyout, a sale), or the next hand after a pick
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
  /** Flip an option (src/settings.ts). The raid-warning and Calm Audio switches belong to the run. */
  const setOption = (key: string, value?: string) => {
    if (key === 'raidPause') { state.settings.raidPause = !raidPauses(state.settings); return; }
    if (key === 'calmAudio') { state.settings.calmAudio = !calmAudioOn(state.settings); return; } // on in Laid Back till you switch it
    if (key === 'lessons') { state.settings.lessons = !lessonsOn(state); return; } // this run's lessons (src/sim/story.ts)
    if (key === 'tour') { hud.optionsOpen = false; coach.replay(); return; } // Lottie's tour from the top (src/ui/coach.ts)
    if (key === 'textSize') { const v = Number(value); if ((TEXT_SIZES as number[]).includes(v)) options.textSize = v as Options['textSize']; }
    else if (key.startsWith('pause.')) { const k = key.slice(6) as PauseKind; if (k in options.pause) options.pause[k] = !options.pause[k]; }
    else if (key === 'autoPause' || key === 'quietNights' || key === 'autoContinue' || key === 'reducedMotion' || key === 'captions' || key === 'celsius') options[key] = !options[key];
    saveOptions(options);
    hud.options = options;
    setReducedMotion(options.reducedMotion);
    waits.prep = 0;
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
  // A boss's call opens on their gang's leitmotif (spec: Faction leitmotifs), then the ring.
  const phone = createPhone(document.getElementById('ui')!, (boss, line) => {
    audio.motif(boss);
    const lead = 1600;
    setTimeout(() => { audio.ring(); setTimeout(() => { audio.babble(line, 0.9, 'flat'); twins?.caption(HQS[boss].boss, line); }, 700); }, lead);
  });
  document.getElementById('ui')!.prepend(bubbleLayer);
  // Tape queue counters, HP pills and raid snakes ride over the world, under the HUD (src/world/markers.ts).
  const markerLayer = document.createElement('div');
  document.getElementById('ui')!.prepend(markerLayer);
  const markers = createMarkers(world.scene, markerLayer);
  stampAt = (plot, text, tone) => markers.stamp(plot, text, tone);
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
  // Music cues from the sim (spec: Adaptive music): the Threat level's tension layers, the rival jingles' leitmotifs and
  // a retired jingle's second of dead air as their lines air on 101.5, Snootwater's motif when it comes to town, and
  // the first ship's horn (the first 3 notes of Lottie's Theme) as it docks.
  let cueWait = 0, lastLine = '', snootHere = -1, docked: boolean | undefined;
  const motifOf = (text: string) => (Object.keys(RIVAL_JINGLES) as RivalId[]).find((r) => text.includes(RIVAL_JINGLES[r])) as Motif | undefined;
  const audioCues = (realDt: number) => {
    audio.threat(state.outcome ? 0 : threatLevel(state));
    if ((cueWait -= realDt) > 0) return;
    cueWait = 0.5;
    const dock = !!state.story?.vip?.docked;
    if (docked === false && dock) audio.horn();
    docked = dock;
    const snoot = Object.values(state.plots).filter((p) => p.owner === 'snootwater').length;
    if (snootHere === 0 && snoot > 0) audio.motif('snootwater');
    snootHere = snoot;
    if (!radioOn(state, soundtrack())) { lastLine = ''; return; }
    const show = state.phase === 'prep' ? morningShow(state) : airedToday(state).slice(-1);
    const on = state.phase === 'prep' ? show[Math.floor(performance.now() / RADIO_LINE_MS) % Math.max(1, show.length)] : show[0];
    if (!on || on.text === lastLine) return;
    const first = lastLine === '';
    lastLine = on.text;
    if (first) return; // tuning in mid-line plays nothing
    if (on.kind === 'rival') { const m = motifOf(on.text); if (m) audio.motif(m); }
    else if (on.kind === 'silence') audio.deadAir(1);
  };

  const flushNews = () => {
    if (!state.news.length) return;
    const cards = alertTexts(state); // alerts show as cards in the feed, not as toasts
    while (state.news.length) {
      const n = state.news.shift()!;
      if (cards.has(n)) continue;
      if (n.startsWith('RANK UP') || n.startsWith('YOU OWN THE BAY') || n.startsWith('TARGET HIT')) { stinger('rank-up'); stampAt(LOTTIES_CORNER, n.startsWith('RANK UP') ? 'RANK UP!' : n.startsWith('TARGET HIT') ? 'TARGET HIT!' : 'THE BAY!', 'gold'); lottieSays('rankUp', { react: 'cheer' }); snap(n, 3, 300); callsQuietUntil = performance.now() + 4500; }
      if (n.startsWith('SQUEEZED OUT') || n.startsWith('RUN OUT OF TOWN')) { stinger('squeezed-out'); stampAt(LOTTIES_CORNER, 'SQUEEZED', 'bad'); }
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
    return { el, id: d.id, pos: new THREE.Vector3(d.origin[0] + (d.cols * PLOT_SPACING) / 2, 2, d.origin[1]) };
  });

  // Gull Flight: G (or the button) takes Captain Squawk up; G or Esc lands.
  const flight = createGullFlight(world.camera, world.controls, ambient.squawk, canvas);
  const flightLook = new THREE.Vector3(), flightFwd = new THREE.Vector3();
  /** During Gull Flight: the ground about 20 m ahead of the camera, so street life near the gull wakes. */
  const flightFocus = () => {
    world.camera.getWorldDirection(flightFwd);
    flightFwd.y = 0;
    if (flightFwd.lengthSq() < 1e-6) flightFwd.set(0, 0, 1);
    return flightLook.copy(world.camera.position).addScaledVector(flightFwd.normalize(), 20).setY(0.8);
  };
  const gullBtn = document.createElement('button');
  gullBtn.className = 'gullbtn';
  const gullTip = () => { gullBtn.title = withKey('Fly Captain Squawk over the bay', options, 'gull'); }; // its key as remapped
  gullTip();
  gullBtn.innerHTML = `${gullIcon()}<span class="lbl">Fly Squawk</span>`;
  gullBtn.addEventListener('click', () => { if (flight.active()) flight.stop(); else takeOff(); gullBtn.classList.toggle('on', flight.active()); });
  document.getElementById('ui')!.appendChild(gullBtn);
  /** The Raid Planner's Fly over (crew): Squawk takes off on a circle round the plot, heading north on its east side,
   * so holding a left turn (A, or a drag left) keeps him on it; a full circle scouts it (src/ui/gull.ts). */
  const flyOver = (id: string) => {
    const p = PLOT_BY_ID[id];
    if (flight.active()) flight.stop();
    hud.inspected = null;
    flight.start({ x: p.x, z: p.z }); // Squawk takes off beside the plot, heading for it
    gullBtn.classList.add('on');
    aimGull(id);
  };
  /** G or the button: in Act 2's flight over the Pier, Squawk takes off beside the Blenders plot Lottie sent him to (crew). */
  const takeOff = () => { const pier = pierTarget(state); if (pier) flyOver(pier); else flight.start(); };
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
      if (e.code !== 'Escape') { bindKey(options, hud.remap, e.code); saveOptions(options); gullTip(); }
      hud.remap = null;
      act({ type: 'refresh' });
      return;
    }
    if (e.code === 'Escape') { putAway(); return; }
    const k = actionFor(options, e.code);
    if (!k) return;
    if (k === 'panUp' || k === 'panDown' || k === 'panLeft' || k === 'panRight') { panning.add(k); return; }
    if (e.repeat) return;
    if (k === 'pause') { if (knob.speed) pause(); else resume(); e.preventDefault(); }
    else if (k === 'speed1' || k === 'speed2' || k === 'speed3') setSpeed(Number(k.slice(5)));
    else if (k === 'turnLeft' || k === 'turnRight') world.turnStep(k === 'turnLeft' ? -1 : 1);
    else if (k === 'gull') {
      if (hud.setup) return;
      if (flight.active()) flight.stop(); else takeOff();
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
    stamp: (plot: string, text = 'HELD!', tone: 'good' | 'bad' | 'gold' = 'good') => markers.stamp(plot, text, tone),
    showBugle: () => { const b = bugle.best(state.day); if (b) bugle.show(b); return !!b; },
    sceneOn: () => scenes.active(),
    scene: (id: SceneId, script?: { lines?: { who: string; text: string; at: number }[]; color?: string }) => scenes.play(id, script),
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
    vipPlay: (kind: 'heli' | 'ship' | 'truck', plot: string, big = false, level = 1, client = '', first = false) => { vip.play(kind, bay.views[plot], big, level, client, first); if (kind === 'truck') focusPlot(plot, 30); else showShot(plot, kind); },
    vipSkip: () => vip.skip(),
    dex: () => welcomeDex(state),
    coach: () => ({ step: coach.current(), seen: [...coach.memory().seen], off: coach.memory().off }),
    focus: (id: string) => focusPlot(id, 18),
    /** Tick the clock (business hours or the night) up to `minutes`, stopping where the phase changes. */
    fastForward(minutes: number) {
      const from = state.phase;
      if (from !== 'open' && from !== 'night') return;
      atOnce(() => { for (let i = 0; i < minutes && state.phase === from; i++) tickMinute(state); });
      tipsCheck();
      if (state.phase !== from) { flushNews(); saveGame(state); if (state.phase === 'prep') atDawn(); }
      hud.render(state, shownSpeed());
    },
    /** The clock as it runs now: real seconds per game minute (Infinity: stopped), and the speed knob. */
    clock: () => ({ phase: state.phase, minute: state.minute, speed: knob.speed, shown: shownSpeed(), spm: secondsPerMinute(state, knob.speed, { fighting: liveFight, quiet: quiet() }) }),
  };

  morningLine();
  const timer = new THREE.Timer();
  world.renderer.setAnimationLoop(() => {
    timer.update();
    const realDt = timer.getDelta();
    const dt = Math.min(realDt, 0.1);
    // Full-screen paper (New Game, Options, a menu, the Bugle's front page) pauses the clock while it runs, with its
    // own switch in Options, and putting it away brings the speed back, unless a load, an alert's auto-pause or a key
    // took the pause over meanwhile (src/ui/knob.ts). Space and 1-3 still work behind it. A won or lost run and the
    // first visit's New Game hold everything.
    const paper = !!hud.setup || hud.optionsOpen || isFullMenu(hud.menu) || !!uiRoot.querySelector('.frontpage');
    if (paperKnob(knob, paper, (state.phase === 'open' || state.phase === 'night') && options.autoPause && options.pause.screens)) vipPaused = '';
    const frozen = knob.speed === 0 || outcomeUp() || (!!hud.setup && !hud.setup.cancel) // the clock, the brawl and the scenes hold still
      || (!!liveCall(state) && !state.fight); // a day call waits for your pick (src/sim/calls.ts)
    if (panning.size && !flight.active()) {
      const has = (k: KeyAction) => (panning.has(k) ? 1 : 0);
      world.panBy((has('panRight') - has('panLeft')) * Math.min(realDt, 0.1), (has('panUp') - has('panDown')) * Math.min(realDt, 0.1));
    }
    if (state.phase !== 'night' && state.phase !== 'report') quietOff = false; // each night starts quiet again
    // A live fight takes the screen once it's free (the brawl before settles first); its own clock moves the game's.
    if (state.fight && onScreen !== state.fight && !battle.active()) playLive();
    if (state.fight) { runFight(dt, frozen || onScreen !== state.fight); acc = 0; }
    else if ((state.phase === 'open' || state.phase === 'night') && !frozen && !vipResume && victoryStage(state) !== 'scenes') { // the Domination show holds the clock
      // Business hours at ~18 real s a game hour, nights at ~8 (quiet stretches 12×), fights and warnings at fight speed.
      const from = state.phase;
      const rate = () => secondsPerMinute(state, knob.speed, { fighting: liveFight, quiet: quiet() });
      acc += dt;
      let guard = 0;
      while (acc >= rate() && guard++ < 240) {
        acc -= rate();
        drawEvents(tickMinute(state));
        if (state.phase !== from || knob.speed === 0 || vipResume) { acc = 0; break; }
      }
      tipsCheck(); // its alert paused already (drawEvents); a hand dealt at closing has none
      if (state.phase !== from) { flushNews(); saveGame(state); bay.sync(state); }
      else flushNews();
      // Any day resumes mid-day: the clock saves once a game hour (and whenever the page is hidden, above).
      const hour = Math.floor(state.minute / 60);
      if (midDay(state) && hour !== savedHour) { savedHour = hour; saveGame(state); }
    } else acc = 0;
    // The raid countdown's woodblock (spec: Adaptive music): once the Raid Incoming stinger chokes, a tick each beat
    // while a warned raid is still coming for you and the clock runs, twice as often in its last 15 game minutes.
    const ticks = !state.fight && (state.phase === 'open' || state.phase === 'night') && !frozen && !vipResume && performance.now() >= tickHold ? raidTicks(state) : 0;
    if (!ticks) tickIn = 0;
    else if ((tickIn -= realDt) <= 0) { audio.tick(); tickIn = Math.max(tickIn, -0.05) + TICK_SECONDS / ticks; }
    audioCues(realDt);
    // Morning Prep waits for you, unless the day starts by itself (Options); big alerts at dawn still stop it. The
    // Evening is a moment: once the Ledger is folded (or with auto-continue on), the night starts by itself.
    const due = waitStep(state, options, { ledger: hud.ledger, frozen, paper, speed: knob.speed }, waits, realDt, dt);
    if (due) act({ type: due });
    const dayFrac = state.phase === 'prep' ? 0 : (state.minute - OPEN) / (CLOSE - OPEN);
    world.setWeather(state.phase === 'prep' ? state.forecast.kind : state.weather.kind, dayFrac);
    const nightShot = scenes.shot()?.night; // the 3 a.m. night flight lights the bay for 03:00 whatever the hour
    world.setClock(nightShot ? 'night' : state.phase, nightShot ? 27 * 60 : state.minute);
    // What the world wakes around: the orbit target, or during Gull Flight the ground just ahead of the gull.
    const focus = flight.active() ? flightFocus() : world.controls.target;
    bay.update(state, timer.getElapsed(), phone.ringing(), focus);
    crowd.setWeather(state.phase === 'prep' ? state.forecast.kind : state.weather.kind);
    crowd.setSeason(seasonOf(state.day));
    crowd.update(frozen ? 0 : dt, state.phase === 'open' ? Math.max(knob.speed, 1) : 1);
    battle.update(frozen ? 0 : dt);
    vip.update(frozen ? 0 : Math.min(realDt, 0.5)); // VIP pickups play in real time even when frames are slow
    traffic.update(state, frozen ? 0 : dt, focus, { hold: battle.active() || vip.active(), camera: world.camera }); // paused: traffic holds still too
    ambient.update(state, dt, timer.getElapsed(), focus, bay.views);
    flight.update(dt);
    if (!flight.active()) gullBtn.classList.remove('on');
    const circled = trackGull(state, flight.active(), ambient.squawk.position.x, ambient.squawk.position.z, dt); // crew: a full circle scouts a rival plot
    if (circled) act({ type: 'gullScout', plot: circled });
    scenes.update(state, frozen ? 0 : dt, bay.views);
    const sc = playingScene(state);
    if (sc) {
      if (!frozen) sceneT += dt;
      if (!sceneWorld) sayScene(sc);
      if ((!sceneWorld && sceneT >= sc.seconds) || sceneT >= SCENE_MAX_SECONDS) finishScene(false);
    } else if (sceneReady(state) && lull()) startScene();
    if (victoryTick(state, !busy() && !playingScene(state), realDt)) { bay.sync(state); saveGame(state); } // the Domination show: exits, paint, ending (src/sim/victory.ts)
    hud.sceneTime = sceneT;
    // Boss calls ring at a lull too, one a game day (src/sim/phone.ts picks which); never over a scene, fight or pickup.
    if (!busy() && !playingScene(state) && !sceneReady(state) && performance.now() > callsQuietUntil) {
      const call = takeCall(state);
      if (call) { phone.ring(call.who, call.text || pick(BOSS[call.who][call.mood])); if (state.phase === 'prep' || state.phase === 'report') saveGame(state); }
    }
    if (state.phase === 'report' || state.phase === 'night') lottieSays('night', { cooldown: 9000, icon: 'zzz' });
    bubbles.update(world.camera, canvas.clientWidth, canvas.clientHeight);
    markers.update(state, world.camera, focus, bay.views, canvas.clientWidth, canvas.clientHeight);
    if (vipResume && !vip.active()) vipResume = 0;
    // Gull Flight steers the camera, or a staged scene's shot does (the night flight); the clock, twos, light and detail run on.
    const shot = scenes.shot();
    world.pilot(flight.active() || !!shot);
    if (shot) { world.camera.position.copy(shot.pos); world.camera.lookAt(shot.look); shotHeld = true; }
    else if (shotHeld) { shotHeld = false; focusPlot(LOTTIES_CORNER); } // the shot's over: back to the Corner
    world.update(dt);
    const dist = world.camera.position.distanceTo(world.controls.target);
    // Far out (Bay View, or Gull Flight up high, judged by altitude not the take-off target): the HUD tucks its feed
    // into icons so the whole plinth shows, and district names float over the map.
    const far = flight.active() ? world.camera.position.y > 40 : dist > 90;
    document.body.classList.toggle('bay-view', far);
    for (const l of labels) {
      const show = far && onMap(state, l.id); // land: a Sandbox map names only its own districts
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
