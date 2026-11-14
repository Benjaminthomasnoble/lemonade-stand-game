// Story beats played in the world instead of told in text (spec "How the
// story is told": short, skippable scenes that wait for a lull). Each scene
// is a tiny timeline: someone walks on, does a thing, says a line, walks off.
// The Steward and Dex have their own scripts; the townsfolk (Marisol, Skip,
// Benny, Sheriff Budd, Mayor Fontaine) are staged by the story scene's speaker
// (a visit), so any story scene with a speaker gets its figure.
// The 3 a.m. night flight (Captain Squawk over your stand, Cold Brew baristas in
// beanies) and the page scenes (Lottie holds up a won recipe page and reads it)
// are staged here too. The story's scene queue (src/sim/scenes.ts) says when.
import * as THREE from 'three';
import { LOTTIES_CORNER, type GameState } from '../sim/economy.ts';
import type { SceneLine, Speaker } from '../sim/scenes.ts';
import type { PlotView } from './bay.ts';
import { kit } from './clay/kit.ts';
import { makeCrew, makeTownsfolk, signaturePose, TOWNSFOLK } from './clay/cast.ts';
import { clayPlain, PAPER } from './clay/kit.ts';
import { crowdDetail, GAIT_OF, gait, heroDetail, type Figure } from './clay/figure.ts';

export type SceneId = 'steward' | 'dex' | 'visit' | 'nightFlight' | 'page';
/** What a lines-driven scene (the night flight, a page) says, and for a page which recipe it is. */
export interface SceneScript { lines?: SceneLine[]; recipe?: string; color?: string }
/** A townsperson's visit, from the story scene's speaker: they walk on to the plot, say their lines and walk off. */
export interface Visit { who: Speaker; plot: string; lines: SceneLine[] }

export interface SceneHooks {
  say(who: THREE.Object3D, line: string, speaker: string, color: string): void;
  lottie(line: string, react?: 'cheer' | 'fist'): void;
  ring?(): void;
  done?(id: SceneId): void;
  /** Someone on the radio (Brock on 101.5): no figure, a voice from the stand's set. */
  radio?(who: string, line: string): void;
  /** Captain Squawk, for the night flight (ambient lets him be while userData.piloted is set). */
  gull?: THREE.Object3D;
}

/** A camera shot a scene asks for: main.ts hands the camera over (world.pilot) and lights the scene. */
export interface Shot { pos: THREE.Vector3; look: THREE.Vector3; night: boolean }

export interface Scenes {
  update(s: GameState, dt: number, views: Record<string, PlotView>): void;
  /** Start a scene now: the Steward, Dex, the night flight or a page (the last two with their lines). */
  play(id: SceneId, script?: SceneScript): void;
  /** The camera shot the playing scene wants, if any (the night flight's chase view at 3 a.m.). */
  shot(): Shot | null;
  /** Stage a story scene's speaker now: their clay figure, at the scene's plot. */
  visit(v: Visit): void;
  active(): SceneId | null;
  /** Cut the playing scene short (skipped): the actor leaves at once, no done hook. */
  stop(): void;
}

interface Beat { at: number; run: (ctx: Ctx) => void }
interface Ctx { actor: THREE.Group; fig: Figure; views: Record<string, PlotView>; hooks: SceneHooks; from: THREE.Vector3; to: THREE.Vector3 }
/** A staged extra: what moves every frame beyond the actor's walk, and what to tidy away after. */
interface Stage { tick(t: number, dt: number, f: number, tq: number): void; end(): void; shot?: () => Shot | null }

/** A recipe page held up to read: cream card stock, a band in the recipe's colour, Lottie's shorthand in pencil. */
function pageProp(color: string): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 160;
  const g = c.getContext('2d');
  if (g) {
    g.fillStyle = '#FFF1D6'; g.fillRect(0, 0, 128, 160);
    g.fillStyle = color; g.fillRect(0, 0, 128, 30);
    g.strokeStyle = 'rgba(46,42,79,0.7)'; g.lineWidth = 3; g.lineCap = 'round';
    for (let y = 50; y < 150; y += 16) { g.beginPath(); g.moveTo(14, y); for (let x = 14; x < 112; x += 8) g.lineTo(x, y + Math.sin(x * 0.7 + y) * 2); g.stroke(); }
    g.fillStyle = color; g.beginPath(); g.arc(98, 128, 12, 0, Math.PI * 2); g.fill(); // a thumbprint of the stuff itself
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.5), clayPlain('#ffffff', { fx: PAPER, map: tex, side: THREE.DoubleSide }));
  m.castShadow = true;
  return m;
}

export function createScenes(scene: THREE.Scene, hooks: SceneHooks): Scenes {
  let current: {
    id: SceneId; t: number; beats: Beat[]; next: number; ctx: Ctx; walk: { a: THREE.Vector3; b: THREE.Vector3; t0: number; dur: number } | null; base: number; f: number;
    /** A visitor: who they are (their signature pose holds all scene long) and which way they face once there. */
    who?: Speaker; face?: number;
    /** The night flight and the pages: no walking actor of their own, a stage instead. */
    stage?: Stage; end?: number;
  } | null = null;
  let forced: { id: SceneId; script?: SceneScript } | null = null;
  let forcedVisit: Visit | null = null;
  const walkTo = (b: THREE.Vector3, dur: number): Beat['run'] => () => { if (current) current.walk = { a: current.ctx.actor.position.clone(), b, t0: current.t, dur }; };
  /** A line from the script: Lottie in her chair, a voice on the radio, or whoever is on stage. */
  const sayLine = (l: SceneLine, onStage: (l: SceneLine) => void): Beat => ({
    at: l.at,
    run: () => (l.who === 'Lottie' ? hooks.lottie(l.text) : /101\.5|radio/i.test(l.who) ? hooks.radio?.(l.who, l.text) : onStage(l)),
  });

  /** A townsperson walks along the sidewalk to the plot (beside the counter if there's a stand), says the scene's lines, and leaves. */
  const startVisit = (v: Visit, views: Record<string, PlotView>) => {
    const view = views[v.plot];
    if (!view) return;
    view.root.updateMatrixWorld(true);
    const at = (x: number, z: number) => view.root.localToWorld(new THREE.Vector3(x, 0.12, z));
    const spot = view.stand ? at(1.6, 1.5) : at(0, 0.6), offstage = at(16, 2.2), street = at(0, 1).sub(at(0, 0));
    const fig = makeTownsfolk(v.who, kit().fig, { detail: heroDetail() });
    const color = TOWNSFOLK[v.who].shirt;
    const lines = [...v.lines].sort((a, b) => a.at - b.at);
    const last = lines.length ? lines[lines.length - 1].at : 0;
    const beats: Beat[] = [
      { at: 0, run: walkTo(spot, 3.4) },
      ...lines.map((l): Beat => ({ at: l.at, run: (c) => (l.who === 'Lottie' ? hooks.lottie(l.text) : hooks.say(c.actor, l.text, l.who, color)) })),
      { at: Math.max(last + 2.8, 3.8), run: walkTo(offstage, 4) },
    ].sort((a, b) => a.at - b.at);
    const actor = fig.root;
    actor.position.copy(offstage);
    scene.add(actor);
    current = { id: 'visit', t: 0, beats, next: 0, ctx: { actor, fig, views, hooks, from: offstage, to: spot }, walk: null, base: 1, f: -1, who: v.who, face: Math.atan2(street.x, street.z) };
  };

  /**
   * 3 a.m. over your stand: a chase view behind Captain Squawk as he circles the Corner in the dark, and three Cold Brew
   * baristas in beanies tiptoeing up to the counter. His second SQUAWK sends them scattering; Lottie has the last word.
   */
  const startNightFlight = (v: PlotView, script: SceneScript) => {
    const gull = hooks.gull;
    const at = (x: number, z: number) => v.root.localToWorld(new THREE.Vector3(x, 0.12, z));
    const home = at(0, 0.3);
    const crew = [0, 1, 2].map((i) => {
      const fig = makeCrew('coldbrew', { weapon: 'fists', onGuard: true, seed: 7 + i }, kit().fig, { detail: crowdDetail() });
      const from = at(-12 + i * 1.6, 7 + i), to = at(-1.4 + i * 1.3, 1.6 + (i % 2) * 0.5), away = at(-18 + i * 5, 14);
      fig.root.position.copy(from);
      scene.add(fig.root);
      return { fig, from, to, away };
    });
    const lines = [...(script.lines ?? [])].sort((a, b) => a.at - b.at);
    const scatterAt = lines.find((l, i) => i > 0 && l.who !== 'Lottie')?.at ?? 4.6; // his second squawk
    const end = Math.max(...lines.map((l) => l.at), 0) + 4;
    const pos = new THREE.Vector3(), look = new THREE.Vector3(), cam = new THREE.Vector3();
    let heading = 0;
    if (gull) gull.userData.piloted = true;
    const stage: Stage = {
      tick(t, dt, f, tq) {
        // Squawk circles low over the stand, the camera riding behind him.
        const a = t * 0.42;
        if (gull) {
          gull.position.set(home.x + Math.cos(a) * 8, 7.5 + Math.sin(t * 1.4) * 0.3, home.z + Math.sin(a) * 8);
          heading = Math.atan2(-Math.sin(a), Math.cos(a));
          gull.rotation.set(0, heading, 0.28);
          const { wl, wr } = gull.userData as { wl?: THREE.Object3D; wr?: THREE.Object3D };
          const flapA = Math.sin(t * (t > scatterAt - 0.3 && t < scatterAt + 1 ? 18 : 4)) * 0.5;
          if (wl && wr) { wl.rotation.z = flapA; wr.rotation.z = -flapA; }
          cam.set(gull.position.x - Math.sin(heading) * 7, gull.position.y + 3, gull.position.z - Math.cos(heading) * 7);
          pos.lerp(cam, t < 0.05 ? 1 : Math.min(1, dt * 3));
          look.copy(gull.position).lerp(home, 0.55);
        } else { pos.set(home.x + 10, 12, home.z + 10); look.copy(home); }
        // The baristas: tiptoe in, freeze and look up at the squawk, then scatter.
        if (f === current?.f) return;
        crew.forEach((c, i) => {
          const r = c.fig.root;
          if (t < scatterAt) {
            const k = Math.min(1, t / (scatterAt - 0.6));
            r.position.lerpVectors(c.from, c.to, k);
            const d = c.to.clone().sub(c.from);
            r.rotation.y = Math.atan2(d.x, d.z);
            if (k < 1) c.fig.pose({ lean: 0.35, sq: Math.abs(Math.sin(tq * 6 + i)) * 0.05, lL: Math.sin(tq * 6 + i) * 0.25, lR: -Math.sin(tq * 6 + i) * 0.25, aL: [-0.6, 0.3], aR: [-0.6, -0.3], headTilt: 0.2 }, f); // on tiptoe
            else c.fig.pose({ aR: [-1.3, -0.2], headTilt: 0.15, headYaw: Math.sin(tq * 2 + i) * 0.3 }, f); // fiddling at the counter
          } else {
            const k = Math.min(1, (t - scatterAt) / 2.2);
            if (k < 0.18) { c.fig.pose({ lift: 0.06, headTilt: -0.6, aL: [-2.4, 0.4], aR: [-2.4, -0.4] }, f); return; } // eep: hands up, looking up
            r.position.lerpVectors(c.to, c.away, (k - 0.18) / 0.82);
            const d = c.away.clone().sub(c.to);
            r.rotation.y = Math.atan2(d.x, d.z);
            gait(c.fig, 'skip', tq * 16 + i, f, tq);
            r.visible = k < 1;
          }
        });
      },
      end() { if (gull) gull.userData.piloted = false; for (const c of crew) scene.remove(c.fig.root); },
      shot: () => ({ pos, look, night: true }),
    };
    const actor = new THREE.Group(); // the lines' bubbles ride on Squawk, so the actor is only a placeholder
    scene.add(actor);
    const beats = lines.map((l) => sayLine(l, (x) => hooks.say(gull ?? actor, x.text, x.who, '#23214A')));
    current = { id: 'nightFlight', t: 0, beats, next: 0, ctx: { actor, fig: null as unknown as Figure, views: {}, hooks, from: home, to: home }, walk: null, base: 1, f: -1, stage, end };
  };

  /** Lottie holds up the page that came home and reads it out; Brock heckles from the radio in the Strawberry one. */
  const startPage = (v: PlotView, script: SceneScript) => {
    const lottie = v.stand?.lottie;
    const page = pageProp(script.color ?? '#F7C948');
    const actor = new THREE.Group();
    actor.add(page);
    scene.add(actor);
    const base = new THREE.Vector3(), up = new THREE.Vector3();
    const lines = [...(script.lines ?? [])].sort((a, b) => a.at - b.at);
    const end = Math.max(...lines.map((l) => l.at), 0) + 4;
    const stage: Stage = {
      tick(t) {
        // Raised over her head at first, then held at reading height, wobbling as she talks.
        if (lottie) { lottie.getWorldPosition(base); lottie.getWorldDirection(up); } else v.root.getWorldPosition(base);
        const lift = t < 0.6 ? t / 0.6 : 1, high = t < 2.4 ? 0.5 : 0;
        actor.position.copy(base).addScaledVector(up, 0.6).setY(base.y + (1.7 + high) * lift);
        actor.rotation.set(-0.15 + Math.sin(t * 2.3) * 0.04, Math.atan2(up.x, up.z), Math.sin(t * 1.7) * 0.06);
        actor.scale.setScalar(Math.max(0.01, lift));
      },
      end() { (page.material as THREE.MeshStandardMaterial).map?.dispose(); page.geometry.dispose(); },
    };
    const beats: Beat[] = [
      { at: 0.1, run: () => v.stand?.react('cheer') },
      ...lines.map((l) => sayLine(l, (x) => hooks.say(actor, x.text, x.who, '#2E2A4F'))),
    ];
    current = { id: 'page', t: 0, beats, next: 0, ctx: { actor, fig: null as unknown as Figure, views: {}, hooks, from: base, to: base }, walk: null, base: 1, f: -1, stage, end };
  };

  const start = (id: SceneId, views: Record<string, PlotView>, script: SceneScript = {}) => {
    const v = views[LOTTIES_CORNER];
    if (!v?.stand || id === 'visit') return;
    v.root.updateMatrixWorld(true);
    if (id === 'nightFlight') return startNightFlight(v, script);
    if (id === 'page') return startPage(v, script);
    const at = (x: number, z: number) => v.root.localToWorld(new THREE.Vector3(x, 0.12, z));
    const counter = at(0.4, 1.4), offstage = at(16, 2.2), lottieSpot = at(-1.2, 1.2);
    let fig: Figure, base = 1;
    let beats: Beat[];
    if (id === 'steward') {
      // A Sourwood Steward: stilt-thin, high white collar, white gloves, bowler and cane.
      fig = makeTownsfolk('steward', kit().fig, { detail: heroDetail() });
      beats = [
        { at: 0, run: walkTo(counter, 4) },
        { at: 4.2, run: (c) => hooks.say(c.actor, 'A reminder. From Mrs. Sourwood.', 'Steward', '#5B2A6E') },
        { at: 5.6, run: (c) => { c.actor.userData.knock = true; c.views[LOTTIES_CORNER]?.stand?.knock(); } },
        { at: 6.0, run: (c) => { c.actor.userData.knock = false; } },
        { at: 6.6, run: () => hooks.lottie('Well. Guess she remembers me.', 'fist') },
        { at: 7.0, run: walkTo(offstage, 4.5) },
        { at: 12, run: () => hooks.lottie('Kid, we\'re gonna need a fence.') },
        { at: 13, run: () => hooks.ring?.() },
      ];
    } else {
      fig = makeTownsfolk('dex', kit().fig, { detail: heroDetail() }); // lanky Dex, 3 heads tall, arms crossed
      base = 1;
      beats = [
        { at: 0, run: walkTo(lottieSpot, 4) },
        { at: 4.2, run: (c) => hooks.say(c.actor, 'Heard you could use some muscle, Miss Lottie.', 'Dex', '#c99a00') },
        { at: 7.4, run: () => hooks.lottie('You\'re hired. Pay\'s in lemonade.', 'cheer') },
        { at: 10, run: (c) => hooks.say(c.actor, 'Nobody touches the Corner.', 'Dex', '#c99a00') },
        { at: 12.5, run: walkTo(counter.clone().add(new THREE.Vector3(1.8, 0, 0.4)), 1.5) },
      ];
    }
    const actor = fig.root;
    actor.position.copy(id === 'dex' ? at(-14, 2.2) : offstage);
    scene.add(actor);
    current = { id, t: 0, beats, next: 0, ctx: { actor, fig, views, hooks, from: offstage, to: counter }, walk: null, base, f: -1 };
  };

  const finish = (done: boolean) => {
    const c = current;
    if (!c) return;
    c.stage?.end();
    scene.remove(c.ctx.actor); // Dex goes on to his guard post, drawn by the bay
    current = null;
    if (done) hooks.done?.(c.id);
  };

  return {
    play(id, script) { forced = { id, script }; },
    visit(v) { forcedVisit = v; },
    active: () => current?.id ?? null,
    shot: () => current?.stage?.shot?.() ?? null,
    stop() { forced = null; forcedVisit = null; finish(false); },
    update(_s, dt, views) {
      if (!current) {
        if (forcedVisit) { const v = forcedVisit; forcedVisit = null; startVisit(v, views); return; }
        if (forced) { const f = forced; forced = null; start(f.id, views, f.script); }
        return;
      }
      const c = current;
      c.t += dt;
      while (c.next < c.beats.length && c.beats[c.next].at <= c.t) c.beats[c.next++].run(c.ctx);
      const a = c.ctx.actor, fig = c.ctx.fig;
      // Clay poses on twos: the actor moves, walks in their family's gait (the Steward glides,
      // Dex bobs) and blinks only when the twos frame changes.
      const f = Math.floor(c.t * 12), tq = f / 12;
      if (c.stage) {
        c.stage.tick(c.t, dt, f, tq);
        c.f = f;
        if (c.t >= (c.end ?? 0) && c.next >= c.beats.length) finish(true);
        return;
      }
      if (f !== c.f) {
        c.f = f;
        if (c.walk) {
          const k = Math.min(1, (tq - c.walk.t0) / c.walk.dur);
          a.position.lerpVectors(c.walk.a, c.walk.b, k);
          const d = c.walk.b.clone().sub(c.walk.a);
          a.rotation.y = Math.atan2(d.x, d.z);
          gait(fig, GAIT_OF[fig.sp.kind], tq * 9, f, tq);
          if (k >= 1) { c.walk = null; a.position.y = 0.12; a.rotation.y = c.face ?? (c.id === 'dex' ? Math.PI * 0.75 : Math.PI); }
        } else {
          const b = Math.sin(tq * 3.2);
          fig.pose({ sq: (b * 0.5 + 0.5) * 0.03, headYaw: Math.sin(tq * 0.6) * 0.2, aR: a.userData.knock ? [-1.4, -0.12] : undefined }, f);
        }
        if (c.who) signaturePose(fig, c.who); // Benny's megaphone never comes down, walking or not
      }
      if (c.next >= c.beats.length && !c.walk) finish(true);
    },
  };
}
