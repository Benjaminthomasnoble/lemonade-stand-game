// Lottie's Corner and every player stand, in Kitchen-Table Clay: the stand
// itself (one of five clay levels, see clay/stands.ts), its dashboard props
// (stock, pitcher, sugar cubes, chalkboard price, stars, OPEN card), the
// upgrade crate reveal, the damage steps and the smashed pile. The grandkid
// works the counter and Grandma Lottie sits in her lawn chair by the phone.
import * as THREE from 'three';
import { idlePose, MOTION } from './people.ts';
import { Figure, SPECS } from './clay/figure.ts';
import { holdProp } from './clay/cast.ts';
import { Baker, GLOSS, PAPER, box, cap, cyl, rbox, tor } from './clay/core.ts';
import { kit } from './clay/kit.ts';
import { P } from './clay/palette.ts';
import { buildLevel, fallSign, farLevel, type LevelModel } from './clay/stands.ts';
import { createStandProps, type PropState, type StandProps } from './clay/standProps.ts';
import { createRevealCrate } from './clay/crate.ts';
import { wreckPile } from './clay/defenses.ts';
import { cardPlane, clayMesh, crayonSign, stick } from './clay/standKit.ts';

export interface StandUpdate {
  price: number; pitcherFill: number; open: boolean; time: number; hot?: boolean; night?: boolean; ringing?: boolean;
  recipe?: string; sweetness?: PropState['sweetness']; stock?: PropState['stock']; stars?: number;
  /** 0 Street View, 1 mid zoom (drops the small props), 2 Bay View. */
  detail?: number;
}

export interface Stand {
  group: THREE.Group;
  /** Where a customer stands to buy. */
  servePoint: THREE.Vector3;
  /** Change level; gilded is the Rank 10 Palace. */
  setLevel(level: number, gilded?: boolean): void;
  setBrand(tier: number): void;
  update(opts: StandUpdate): void;
  /** Who's at the stand, for bubbles to follow. Lottie only sits at Lottie's Corner. */
  kid: THREE.Object3D;
  lottie?: THREE.Object3D;
  /** The dashboard props on the stand (stock, pitcher, chalkboard, stars). */
  props: StandProps;
  /** The grandkid cheers a sale. */
  cheer(): void;
  /** Lottie reacts: cheers a rush or a rank-up, shakes her fist at trouble. */
  react(kind: LottieReaction): void;
  /** The upgrade crate reveal: a crate drops, rattles, its slats fall open and the new stand rises like dough. */
  reveal(): void;
  /** Skip a reveal that's playing (a tap). */
  skipReveal(): void;
  /** Someone kicks the stand over (Day 5's "reminder"); the kid rights it a few seconds later. */
  knock(): void;
  /** Damage steps by HP share: torn awning at 75%, fallen sign at 50%, dangling sticks and squashed corners at 25%. */
  setDamage(hp: number): void;
  /** Smashed: a neat pile of popsicle sticks and squashed clay with the sign on top. */
  setWrecked(wrecked: boolean): void;
  /** Busted (Laid Back): still standing but battered, taped shut and closed until it's repaired. */
  setBusted(busted: boolean): void;
  /** Free the stand's GPU resources and its tap listener (the kid and Lottie figures are left alone). */
  dispose(): void;
}

/** Dispose every geometry, and every textured or one-off material, under `root`, skipping `keep`. */
function disposeTree(root: THREE.Object3D, keep: Set<THREE.Object3D> = new Set()) {
  const shared = new Set<THREE.Material>([kit().world, kit().fig, kit().glass]);
  const visit = (o: THREE.Object3D) => {
    if (keep.has(o)) return;
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.geometry?.dispose();
      for (const mat of (Array.isArray(m.material) ? m.material : [m.material]) as THREE.MeshStandardMaterial[]) {
        if (!mat || shared.has(mat)) continue;
        mat.map?.dispose();
        mat.dispose();
      }
    }
    const far = o.userData.far as THREE.BufferGeometry | undefined;
    far?.dispose();
    for (const c of o.children) visit(c);
  };
  visit(root);
}

export type LottieReaction = 'cheer' | 'fist';

/** Lottie's striped lawn chair: chrome tubes and green and cream webbing. */
function clayLawnChair(): THREE.Group {
  const B = new Baker();
  for (const s of [-1, 1]) {
    B.add(cap(0.03, 0.9, 2, 6), P.chrome, { p: [s * 0.32, 0.25, 0.05], r: [Math.PI / 2 - 0.5, 0, 0], fx: GLOSS });
    B.add(cap(0.03, 0.9, 2, 6), P.chrome, { p: [s * 0.32, 0.25, 0.05], r: [-(Math.PI / 2 - 0.5), 0, 0], fx: GLOSS });
    B.add(cap(0.03, 0.85, 2, 6), P.chrome, { p: [s * 0.32, 0.72, -0.3], r: [-0.25, 0, 0], fx: GLOSS });
    B.add(rbox(0.08, 0.05, 0.5, 0.02), P.stick, { p: [s * 0.34, 0.58, 0.02], fx: PAPER });
  }
  for (let k = 0; k < 5; k++) B.add(box(0.62, 0.02, 0.1), k % 2 ? P.cream : P.green, { p: [0, 0.38, -0.2 + k * 0.11], fx: PAPER });
  for (let k = 0; k < 6; k++) B.add(box(0.62, 0.1, 0.02), k % 2 ? P.cream : P.green, { p: [0, 0.46 + k * 0.1, -0.3 - k * 0.026], r: [-0.25, 0, 0], fx: PAPER });
  const g = new THREE.Group();
  g.add(clayMesh(B.build(), kit().world));
  return g;
}

/** The hand-painted LOTTIE'S → signs up and down the block (brand tier 1). */
function brandBoards(): THREE.Group {
  const g = new THREE.Group();
  const tex = crayonSign("LOTTIE'S →");
  const B = new Baker();
  for (const [x, flip] of [[-4.8, 1], [4.8, -1]] as const) {
    stick(B, 1.0, [x, 0.5, 0.98], [0, flip * 0.35, 0], P.stick, 0.1, 0.06);
    B.add(rbox(1.2, 0.5, 0.05, 0.03), '#d9b48a', { p: [x, 1.0, 0.95], r: [0, flip * 0.35, 0], fx: PAPER });
    const board = cardPlane(tex, 1.12, 0.44);
    board.position.set(x + Math.sin(flip * 0.35) * 0.03, 1.0, 0.95 + Math.cos(flip * 0.35) * 0.03);
    board.rotation.y = flip * 0.35;
    g.add(board);
  }
  g.add(clayMesh(B.build(), kit().world));
  return g;
}

export function createStand(opts: { lottie?: boolean; level?: number; gilded?: boolean } = {}): Stand {
  const group = new THREE.Group();
  const levelRoot = new THREE.Group();
  group.add(levelRoot);
  let model: LevelModel | null = null;
  let level = 0, gilt = false, hpNow = 1, wrecked = false, busted = false;
  let spin: THREE.Object3D | undefined;
  const props = createStandProps();
  props.group.userData.far = new Baker().build(); // the props are too small to show in a district block
  group.add(props.group);
  const crate = createRevealCrate();
  group.add(crate.group);
  let wreck: THREE.Group | null = null;

  // ---------- the reveal ----------
  let revealT = -1, lastTime = 0, knockT = -1, flourishFrom = -1;
  function endReveal() {
    revealT = -1; flourishFrom = -1;
    crate.hide();
    kid.visible = !wrecked;
    levelRoot.visible = props.group.visible = !wrecked;
    levelRoot.scale.set(1, 1, 1);
    model?.done();
    applyDamage();
  }
  function animateReveal(dt: number) {
    if (revealT < 0 || !model) return;
    revealT += dt;
    const total = model.revealSeconds;
    // Bigger levels get a bigger crate.
    crate.group.scale.setScalar(model.level >= 4 ? 1.8 : model.level === 3 ? 1.3 : 1);
    const { rise, burst } = crate.pose(revealT, total);
    levelRoot.visible = rise > 0;
    kid.visible = rise >= 0.95;
    props.group.visible = rise >= 1 && revealT > 2;
    const r = MOTION < 1 ? (rise > 0 ? 1 : 0) : rise;
    levelRoot.scale.set(1 + (1 - r) * 0.12, Math.max(0.001, r), 1 + (1 - r) * 0.12);
    if (burst && flourishFrom < 0) {
      flourishFrom = revealT;
      // L2's awning springs down from furled as the crate bursts.
      if (model.level === 2) { spring.x = 0; spring.v = 0; springHold = revealT + 2.5; }
    }
    if (flourishFrom >= 0) model.flourish(Math.floor((revealT - flourishFrom) * 12) / 12);
    if (revealT >= total) {
      endReveal();
      listen(false);
      dispatchEvent(new CustomEvent('stand-revealed', { detail: { stand: group, level: model.level } }));
    }
  }
  function onTap() { if (revealT > 0.6) { endReveal(); listen(false); } }
  // Listen only while a reveal plays, so idle stands hold no window listener.
  const listen = (on: boolean) => { if (typeof addEventListener === 'function') (on ? addEventListener : removeEventListener)('pointerdown', onTap); };

  function animateKnock(dt: number) {
    if (knockT < 0) return;
    knockT += dt;
    // Over it goes (on twos), lies there a while, then gets heaved back up.
    const q = Math.floor(knockT * 12) / 12;
    const tip = q < 0.35 ? (q / 0.35) : q < 4.5 ? 1 : Math.max(0, 1 - (q - 4.5) / 0.6);
    levelRoot.rotation.x = -tip * 1.25;
    levelRoot.position.z = -tip * 0.4;
    props.group.visible = tip < 0.2 && !wrecked;
    if (knockT > 5.2) { knockT = -1; levelRoot.rotation.x = 0; levelRoot.position.z = 0; props.group.visible = !wrecked; }
  }

  // Mid zoom drops the small props; a sign knocked down at half HP takes its stars with it.
  let detailNow = 0;
  function showSmall() {
    props.showSmall(detailNow < 1, (busted ? Math.min(hpNow, 0.25) : hpNow) > 0.5);
  }

  // ---------- damage ----------
  // Busted: taped shut with a cream X across the counter.
  const tape = new THREE.Group();
  tape.add(clayMesh(new Baker().add(box(2.2, 0.16, 0.025), P.cream, { r: [0, 0, 0.42], fx: PAPER }).add(box(2.2, 0.16, 0.025), P.cream, { r: [0, 0, -0.42], p: [0, 0, 0.01], fx: PAPER }).build(), kit().world));
  tape.visible = false;
  group.add(tape);
  function applyDamage() {
    if (!model) return;
    const hp = busted ? Math.min(hpNow, 0.25) : hpNow;
    if (model.awning) { model.awning.intact.visible = hp > 0.75; model.awning.torn.visible = hp <= 0.75; }
    if (model.tearable) { model.tearable.intact.visible = hp > 0.75; model.tearable.torn.visible = hp <= 0.75; }
    const rest = model.sign.userData.rest as { p: THREE.Vector3; r: THREE.Euler } | undefined;
    if (rest) {
      if (hp <= 0.5) fallSign(model.sign);
      else { model.sign.position.copy(rest.p); model.sign.rotation.copy(rest.r); }
    }
    showSmall();
    model.sticks.visible = hp <= 0.25;
    // Squashed corners: the whole stand slumps a little, and its props and the kid ride the slump.
    const slump = hp <= 0.25;
    for (const o of [model.root, props.group]) { o.scale.set(slump ? 1.04 : 1, slump ? 0.9 : 1, 1); o.rotation.z = slump ? 0.035 : 0; }
    kid.userData.baseY = model.kid[1] * (slump ? 0.9 : 1);
    const [cx, cy, cz] = model.anchors.card;
    tape.position.set(cx, cy + 0.15, cz + 0.12);
    tape.visible = busted && !wrecked;
  }

  // Awning spring: rolled up at the hinge when shut, springs down when open (stepped on twos).
  const spring = { x: 0, v: 0 };
  let springHold = -1;
  function poseAwning(u: number) {
    if (!model?.awning) return;
    const { hinge, open } = model.awning;
    // Furled: rolled up tight at the hinge, a fat card roll rather than a sliver.
    hinge.rotation.x = open - (1 - u) * 0.5;
    hinge.scale.set(1, 1 + (1 - u) * 1.4, 0.28 + 0.72 * u);
  }
  let openNow = false, lastTq = -1;

  // The grandkid: lemon cap, white apron, freckled and gap-toothed (clay/figure.ts SPECS.kid).
  // A touch taller than the clay kid body, so the grandkid's face clears every counter.
  const KID_SCALE = 1.12;
  const kidFig = new Figure(SPECS.kid, kit().fig, { scale: KID_SCALE });
  const kid = kidFig.root;
  kid.position.set(0, 0, -0.45);
  group.add(kid);
  let kidCheerAt = -9;

  // Grandma Lottie: lemon cardigan, glasses and pearls, straw sun hat with a lemon on the band, in a lawn chair.
  const chair = clayLawnChair();
  chair.position.set(-2.0, 0, -0.2);
  chair.rotation.y = 0.5;
  if (opts.lottie !== false) group.add(chair);
  const lottieFig = new Figure(SPECS.lottie, kit().fig, { scale: 0.9 });
  const lottie = lottieFig.root;
  lottie.position.set(-2.0, 0.05, -0.15);
  lottie.rotation.y = 0.5;
  const limbs = lottie.userData.limbs as THREE.Object3D[];
  limbs[0].rotation.x = limbs[1].rotation.x = -1.4; // sitting
  lottie.position.y = 0.3;
  // A paper fan in her right hand, her knitting, and a glass of lemonade.
  const fan = holdProp(lottieFig, 'fan');
  const knitting = holdProp(lottieFig, 'knitting');
  const lottieArms = { left: limbs[2], right: limbs[3] };
  const lottieGlass = holdProp(lottieFig, 'glassLemon', true);
  lottieGlass.visible = false;
  // The rotary phone by Lottie's chair: the bosses call it to taunt you.
  // The rotary phone by Lottie's chair, on a crate: the bosses call it to taunt you.
  const phone = new THREE.Group();
  {
    const B = new Baker();
    B.add(rbox(0.36, 0.17, 0.3, 0.06), P.terra, { p: [0, 0.085, 0] });
    B.add(cyl(0.1, 0.1, 0.02, 16), P.cream, { p: [0, 0.18, 0.05], fx: GLOSS });
    B.add(tor(0.06, 0.012, 5, 14), P.ink, { p: [0, 0.195, 0.05], r: [Math.PI / 2, 0, 0] });
    B.add(rbox(0.44, 0.4, 0.38, 0.04), P.walnut, { p: [0, -0.2, 0], fx: PAPER });
    phone.add(clayMesh(B.build(), kit().world));
  }
  const handset = clayMesh(new Baker().add(cap(0.035, 0.3, 4, 8), P.terra, { r: [0, 0, Math.PI / 2] }).add(new THREE.SphereGeometry(0.06, 8, 6), P.terra, { p: [-0.18, -0.02, 0], s: [1, 0.6, 1] }).add(new THREE.SphereGeometry(0.06, 8, 6), P.terra, { p: [0.18, -0.02, 0], s: [1, 0.6, 1] }).build(), kit().world);
  handset.position.set(0, 0.21, -0.07);
  phone.add(handset);
  phone.position.set(-2.55, 0.4, 0.25);
  if (opts.lottie !== false) group.add(phone);
  let reaction: { kind: LottieReaction; start: number } | null = null;
  let pendingReaction: LottieReaction | null = null;
  if (opts.lottie !== false) group.add(lottie);

  const brandSigns = brandBoards();
  brandSigns.visible = false;
  group.add(brandSigns);

  /**
   * Lottie's day in her lawn chair: she fans herself on hot days (knits
   * otherwise), sips her lemonade now and then, looks around, and nods off
   * once the stand shuts. Reactions interrupt for a couple of seconds.
   */
  const SEAT_Y = 0.3;
  function animateLottie(time: number, awake: boolean, hot: boolean) {
    if (pendingReaction) { reaction = { kind: pendingReaction, start: time }; pendingReaction = null; }
    // Clay poses on twos: 12 new poses a second, with the figure's little boil.
    const f = Math.floor(time * 12);
    time = f / 12;
    const { left, right } = lottieArms;
    const legs = [limbs[0], limbs[1]];
    // the face first, so blinks and her dozing shut eyes get the last word
    const want = reaction?.kind === 'cheer' ? 'yum' : 'neutral';
    if (lottieFig.current !== want) lottieFig.face(want);
    lottieFig.pose({ lL: -1.4, lR: -1.4, headYaw: Math.sin(time * 0.5) * 0.2, shut: !awake }, f);
    lottie.rotation.x = 0;
    lottie.position.y = SEAT_Y;
    fan.visible = false;
    knitting.visible = false;
    lottieGlass.visible = false;
    if (reaction && time - reaction.start < 2.2) {
      const t = time - reaction.start;
      if (reaction.kind === 'cheer') {
        // Up out of the chair, both arms waving, then back down.
        const up = Math.min(1, t * 5, (2.2 - t) * 5);
        lottie.position.y = SEAT_Y + up * 0.32;
        for (const l of legs) l.rotation.x = -1.4 * (1 - up);
        left.rotation.x = right.rotation.x = Math.PI * 0.95 * up;
        left.rotation.z = -0.3 - Math.sin(t * 14) * 0.25 * MOTION;
        right.rotation.z = 0.3 + Math.sin(t * 14) * 0.25 * MOTION;
        idlePose(lottie, time * 3, 0.9);
      } else {
        // One fist up, shaking.
        for (const l of legs) l.rotation.x = -1.4;
        right.rotation.x = Math.PI * 0.9;
        right.rotation.z = 0.15 + Math.sin(t * 22) * 0.18 * MOTION;
        left.rotation.x = 0; left.rotation.z = 0;
        lottie.rotation.y = 0.2;
        idlePose(lottie, time, 0.9);
      }
      return;
    }
    reaction = null;
    for (const l of legs) l.rotation.x = -1.4;
    left.rotation.z = right.rotation.z = 0;
    if (!awake) {
      // Dozing: head drooped forward, slow breathing.
      lottie.rotation.x = 0.1;
      lottie.rotation.y = 0.5;
      (lottie.userData.head as THREE.Object3D).rotation.x = 0.35;
      left.rotation.x = right.rotation.x = -0.4;
      idlePose(lottie, time * 0.35, 0.9);
      return;
    }
    const beat = time % 20;
    lottie.rotation.y = 0.5 + Math.sin(time * 0.4) * 0.15;
    if (beat < 11) {
      if (hot) {
        fan.visible = true;
        right.rotation.x = -1.6;
        right.rotation.z = 0.5 + Math.sin(time * 16) * 0.35 * MOTION;
      } else {
        // Knitting: both mittens forward, needles clicking.
        knitting.visible = true;
        right.rotation.z = -0.35; left.rotation.z = 0.35;
        right.rotation.x = -1.1 + Math.sin(time * 9) * 0.12 * MOTION;
        left.rotation.x = -1.1 - Math.sin(time * 9) * 0.12 * MOTION;
      }
      if (hot) left.rotation.x = -0.3;
    } else if (beat < 14) {
      lottieGlass.visible = true;
      const k = Math.sin(((beat - 11) / 3) * Math.PI);
      left.rotation.x = -0.5 - k * 2;
      right.rotation.x = -0.3;
    } else {
      left.rotation.x = -0.3;
      right.rotation.x = -0.3;
    }
    idlePose(lottie, time, 0.9);
  }


  /**
   * The grandkid: bored on the counter when closed (chin in hands, sleepy),
   * bouncy when open, and cheering every sale. Poses on twos.
   */
  function animateKid(time: number, open: boolean) {
    const f = Math.floor(time * 12);
    time = f / 12;
    const baseY = (kid.userData.baseY as number | undefined) ?? 0;
    kid.position.y = baseY;
    const cheer = time - kidCheerAt;
    if (cheer >= 0 && cheer < 0.9) {
      const up = Math.sin((cheer / 0.9) * Math.PI);
      kidFig.pose({ lift: up * 0.18, sq: cheer < 0.1 ? 0.1 : 0, aL: [Math.PI * 0.9, 0.4 + Math.sin(time * 30) * 0.2 * MOTION], aR: [Math.PI * 0.9, -0.4 - Math.sin(time * 30) * 0.2 * MOTION], headTilt: -0.15 }, f);
      kidFig.face('yum');
      kid.scale.setScalar(KID_SCALE);
      return;
    }
    kidFig.face('neutral');
    if (!open) {
      kidFig.pose({ lean: 0.25, aL: [-1.7, 0.5], aR: [-1.7, -0.5], headTilt: 0.15, headRoll: Math.sin(time * 0.6) * 0.15 }, f);
      kidFig.blink(f, Math.sin(time * 0.35) > 0.6);
      idlePose(kid, time * 0.4, KID_SCALE);
      return;
    }
    const b = Math.abs(Math.sin(time * 3));
    kidFig.pose({ lift: b * 0.05 * MOTION, sq: (1 - b) * 0.05 * MOTION, aL: [-0.3, 0.2], aR: [-0.3 - b * 0.3, -0.2], headYaw: Math.sin(time * 0.8) * 0.3 }, f);
    idlePose(kid, time, KID_SCALE);
  }

  const stand: Stand = {
    group,
    kid,
    cheer() { kidCheerAt = lastTime; },
    props,
    lottie: opts.lottie !== false ? lottie : undefined,
    react(kind) { pendingReaction = kind; },
    reveal() { if (!model || wrecked) return; revealT = 0; flourishFrom = -1; levelRoot.visible = false; props.group.visible = false; listen(false); listen(true); },
    skipReveal() { if (revealT >= 0) endReveal(); listen(false); },
    knock() { knockT = 0; },
    servePoint: new THREE.Vector3(0, 0, 1.35),
    setLevel(l, gilded = false) {
      if (l === level && gilded === gilt) return;
      level = l; gilt = gilded;
      disposeTree(levelRoot);
      levelRoot.clear();
      model = buildLevel(l, 'player', { gilded });
      levelRoot.add(model.root);
      // Bay View's district block draws the cheap far version instead.
      levelRoot.userData.far = farLevel(l, 'player', gilded);
      spin = model.spin;
      props.place(model.anchors);
      const [kx, ky, kz] = model.kid;
      kid.position.set(kx, ky, kz);
      kid.userData.baseY = ky;
      chair.position.x = model.chairX;
      lottie.position.x = model.chairX;
      phone.position.x = model.chairX - 0.55;
      stand.servePoint.z = model.serveZ;
      spring.x = openNow ? 1 : 0; spring.v = 0;
      poseAwning(spring.x);
      applyDamage();
      if (wreck) { wreck.removeFromParent(); disposeTree(wreck); wreck = wreckPile(level, 'player'); wreck.visible = wrecked; group.add(wreck); }
    },
    setBrand(tier) {
      brandSigns.visible = tier >= 1;
    },
    setDamage(hp) {
      const h = Math.max(0, Math.min(1, hp));
      if (h === hpNow) return;
      hpNow = h;
      applyDamage();
    },
    setWrecked(w) {
      wrecked = w;
      if (w && !wreck) { wreck = wreckPile(level || 1, 'player'); group.add(wreck); }
      if (wreck) wreck.visible = w;
      levelRoot.visible = !w;
      props.group.visible = !w;
      kid.visible = !w;
      if (w) endReveal(), levelRoot.visible = false, props.group.visible = false;
      applyDamage();
    },
    setBusted(b) {
      if (b === busted) return;
      busted = b;
      applyDamage();
    },
    dispose() {
      listen(false);
      disposeTree(group, new Set([kid, lottie]));
    },
    update({ price, pitcherFill, open, time, hot, night, ringing, recipe, sweetness, stock, stars, detail = 0 }) {
      if (detail !== detailNow) { detailNow = detail; showSmall(); }
      if (busted) open = false; // closed for repairs
      props.set({ price, pitcherFill, open, ...(recipe ? { recipe } : {}), ...(sweetness ? { sweetness } : {}), ...(stock ? { stock } : {}), ...(stars !== undefined ? { stars } : {}) });
      openNow = open;
      const tq = Math.floor(time * 12) / 12;
      if (tq !== lastTq) {
        const steps = lastTq < 0 ? 1 : Math.max(1, Math.min(4, Math.round((tq - lastTq) * 12)));
        lastTq = tq;
        props.twos(tq);
        if (model?.awning) {
          const target = open || (revealT >= 0 && revealT < springHold) ? 1 : 0;
          for (let i = 0; i < steps * 2; i++) { spring.v += (target - spring.x) * 0.5 - spring.v * 0.28; spring.x += spring.v * 0.5; }
          poseAwning(MOTION < 1 ? target : spring.x);
        }
        const b = props.bounce();
        if (revealT < 0 && knockT < 0) levelRoot.scale.set(b.sx, b.sy, b.sx);
        if (spin) spin.rotation.y = tq * 0.8;
      }
      animateKid(time, open);
      const dt = Math.min(0.25, Math.max(0, time - lastTime));
      animateReveal(dt);
      animateKnock(dt);
      lastTime = time;
      if (opts.lottie !== false) animateLottie(time, !night, hot ?? false);
      // Ringing: the handset hops on its cradle.
      const r = ringing ? Math.abs(Math.sin(time * 40)) * 0.05 * MOTION + 0.02 : 0;
      handset.position.y = 0.21 + r;
      phone.rotation.z = ringing ? Math.sin(time * 37) * 0.06 * MOTION : 0;
    },
  };
  stand.setLevel(opts.level ?? 1, opts.gilded ?? false);
  return stand;
}
