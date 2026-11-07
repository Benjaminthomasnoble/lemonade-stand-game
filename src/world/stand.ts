// Lottie's Corner and every player stand, in Kitchen-Table Clay: the stand
// itself (one of five clay levels, see clay/stands.ts), its dashboard props
// (stock, pitcher, sugar cubes, chalkboard price, stars, OPEN card), the
// upgrade crate reveal, the damage steps and the smashed pile. The grandkid
// works the counter and Grandma Lottie sits in her lawn chair by the phone.
import * as THREE from 'three';
import { idlePose, MOTION, makePerson } from './people.ts';
import { Baker, GLOSS, PAPER, box, cap, cyl, rbox, tor } from './clay/core.ts';
import { clayFrom, kit } from './clay/kit.ts';
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
}

export type LottieReaction = 'cheer' | 'fist';

const mat = (color: number, roughness = 0.85) => clayFrom(color, roughness);

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

export function createStand(opts: { lottie?: boolean } = {}): Stand {
  const group = new THREE.Group();
  const levelRoot = new THREE.Group();
  group.add(levelRoot);
  let model: LevelModel | null = null;
  let level = 0, gilt = false, hpNow = 1, wrecked = false;
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
    kid.visible = true;
    levelRoot.visible = props.group.visible = !wrecked;
    levelRoot.scale.set(1, 1, 1);
    model?.done();
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
    if (burst && flourishFrom < 0) flourishFrom = revealT;
    if (flourishFrom >= 0) model.flourish(Math.floor((revealT - flourishFrom) * 12) / 12);
    if (revealT >= total) {
      endReveal();
      dispatchEvent(new CustomEvent('stand-revealed', { detail: { stand: group, level: model.level } }));
    }
  }
  function onTap() { if (revealT > 0.6) endReveal(); }
  if (typeof addEventListener === 'function') addEventListener('pointerdown', onTap);

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
    props.showSmall(detailNow < 1, hpNow > 0.5);
  }

  // ---------- damage ----------
  function applyDamage() {
    if (!model) return;
    const hp = hpNow;
    if (model.awning) { model.awning.intact.visible = hp > 0.75; model.awning.torn.visible = hp <= 0.75; }
    if (model.tearable) { model.tearable.intact.visible = hp > 0.75; model.tearable.torn.visible = hp <= 0.75; }
    const rest = model.sign.userData.rest as { p: THREE.Vector3; r: THREE.Euler } | undefined;
    if (rest) {
      if (hp <= 0.5) fallSign(model.sign);
      else { model.sign.position.copy(rest.p); model.sign.rotation.copy(rest.r); }
    }
    showSmall();
    model.sticks.visible = hp <= 0.25;
    // Squashed corners: the whole stand slumps a little.
    model.root.scale.set(hp <= 0.25 ? 1.04 : 1, hp <= 0.25 ? 0.9 : 1, 1);
    model.root.rotation.z = hp <= 0.25 ? 0.035 : 0;
  }

  // Awning spring: rolled up at the hinge when shut, springs down when open (stepped on twos).
  const spring = { x: 0, v: 0 };
  function poseAwning(u: number) {
    if (!model?.awning) return;
    const { hinge, open } = model.awning;
    hinge.rotation.x = open - (1 - u) * 0.5;
    hinge.scale.set(1, 1 - (1 - u) * 0.15, Math.max(0.1, 0.1 + 0.9 * u));
  }
  let openNow = false, lastTq = -1;

  const kid = makePerson(0xf6d33c, 0x3c5aa6, undefined, 0.8);
  kid.position.set(0, 0, -0.45);
  group.add(kid);

  // Grandma Lottie: lavender dress, white bun, in a lawn chair.
  const chair = clayLawnChair();
  chair.position.set(-2.0, 0, -0.2);
  chair.rotation.y = 0.5;
  if (opts.lottie !== false) group.add(chair);
  const lottie = makePerson(0xb48ee0, 0xb48ee0, 0xf1c9a5, 0.9);
  lottie.position.set(-2.0, 0.05, -0.15);
  lottie.rotation.y = 0.5;
  const limbs = lottie.userData.limbs as THREE.Mesh[];
  limbs[0].rotation.x = limbs[1].rotation.x = -1.4; // sitting
  lottie.position.y = -0.3;
  const bun = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), mat(0xf4f4f4));
  bun.position.set(0, 1.6, -0.12);
  lottie.add(bun);
  // A paper fan in her right hand and a glass of lemonade on the chair arm.
  const fan = new THREE.Mesh(new THREE.CircleGeometry(0.2, 10, 0, Math.PI), new THREE.MeshStandardMaterial({ color: 0xf6d33c, roughness: 0.7, side: THREE.DoubleSide }));
  fan.position.set(0, -0.5, 0.02);
  fan.rotation.set(0, 0, -Math.PI / 2);
  const lottieArms = { left: limbs[2], right: limbs[3] };
  lottieArms.right.add(fan);
  const lottieGlass = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.16, 10), mat(0xfff3a6, 0.4));
  lottieGlass.position.set(0, -0.5, 0.05);
  lottieGlass.visible = false;
  lottieArms.left.add(lottieGlass);
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
  const SEAT_Y = -0.3;
  function animateLottie(time: number, awake: boolean, hot: boolean) {
    if (pendingReaction) { reaction = { kind: pendingReaction, start: time }; pendingReaction = null; }
    const { left, right } = lottieArms;
    const legs = [limbs[0], limbs[1]];
    lottie.rotation.x = 0;
    lottie.position.y = SEAT_Y;
    fan.visible = false;
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
      lottie.rotation.x = 0.22;
      lottie.rotation.y = 0.5;
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


  const stand: Stand = {
    group,
    kid,
    props,
    lottie: opts.lottie !== false ? lottie : undefined,
    react(kind) { pendingReaction = kind; },
    reveal() { if (!model || wrecked) return; revealT = 0; flourishFrom = -1; levelRoot.visible = false; props.group.visible = false; },
    skipReveal() { if (revealT >= 0) endReveal(); },
    knock() { knockT = 0; },
    servePoint: new THREE.Vector3(0, 0, 1.35),
    setLevel(l, gilded = false) {
      if (l === level && gilded === gilt) return;
      level = l; gilt = gilded;
      levelRoot.clear();
      model = buildLevel(l, 'player', { gilded });
      levelRoot.add(model.root);
      // Bay View's district block draws the cheap far version instead.
      (levelRoot.userData.far as THREE.BufferGeometry | undefined)?.dispose();
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
      if (wreck) { wreck.removeFromParent(); wreck = wreckPile(level, 'player'); wreck.visible = wrecked; group.add(wreck); }
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
      if (w) endReveal(), levelRoot.visible = false, props.group.visible = false;
    },
    update({ price, pitcherFill, open, time, hot, night, ringing, recipe, sweetness, stock, stars, detail = 0 }) {
      if (detail !== detailNow) { detailNow = detail; showSmall(); }
      props.set({ price, pitcherFill, open, ...(recipe ? { recipe } : {}), ...(sweetness ? { sweetness } : {}), ...(stock ? { stock } : {}), ...(stars !== undefined ? { stars } : {}) });
      openNow = open;
      const tq = Math.floor(time * 12) / 12;
      if (tq !== lastTq) {
        const steps = lastTq < 0 ? 1 : Math.max(1, Math.min(4, Math.round((tq - lastTq) * 12)));
        lastTq = tq;
        props.twos(tq);
        if (model?.awning) {
          const target = open ? 1 : 0;
          for (let i = 0; i < steps * 2; i++) { spring.v += (target - spring.x) * 0.5 - spring.v * 0.28; spring.x += spring.v * 0.5; }
          poseAwning(MOTION < 1 ? target : spring.x);
        }
        const b = props.bounce();
        if (revealT < 0 && knockT < 0) levelRoot.scale.set(b.sx, b.sy, b.sx);
        if (spin) spin.rotation.y = tq * 0.8;
      }
      kid.position.y = (kid.userData.baseY ?? 0) + (open ? Math.abs(Math.sin(time * 3)) * 0.03 * MOTION : 0);
      idlePose(kid, time, 0.8);
      const dt = Math.min(0.25, Math.max(0, time - lastTime));
      animateReveal(dt);
      animateKnock(dt);
      lastTime = time;
      animateLottie(time, !night, hot ?? false);
      // Ringing: the handset hops on its cradle.
      const r = ringing ? Math.abs(Math.sin(time * 40)) * 0.05 * MOTION + 0.02 : 0;
      handset.position.y = 0.21 + r;
      phone.rotation.z = ringing ? Math.sin(time * 37) * 0.06 * MOTION : 0;
    },
  };
  stand.setLevel(1);
  return stand;
}
