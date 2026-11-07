// Lottie's Corner: the stand (built per level), the grandkid behind it and
// Grandma Lottie in her lawn chair. L1 is the Folding Table; L2's striped
// wooden booth is ready for milestone 2.
import * as THREE from 'three/webgpu';
import { idlePose, MOTION, makePerson } from './people.ts';
import { kiosk, palace, shack } from './standLevels.ts';

export interface Stand {
  group: THREE.Group;
  /** Where a customer stands to buy. */
  servePoint: THREE.Vector3;
  setLevel(level: number): void;
  setBrand(tier: number): void;
  update(opts: { price: number; pitcherFill: number; open: boolean; time: number; hot?: boolean; night?: boolean; ringing?: boolean }): void;
  /** Who's at the stand, for bubbles to follow. Lottie only sits at Lottie's Corner. */
  kid: THREE.Object3D;
  lottie?: THREE.Object3D;
  /** Lottie reacts: cheers a rush or a rank-up, shakes her fist at trouble. */
  react(kind: LottieReaction): void;
  /** The upgrade crate reveal: a crate drops, rattles, bursts, and the new stand boings up. */
  reveal(): void;
  /** Someone kicks the stand over (Day 5's "reminder"); the kid rights it a few seconds later. */
  knock(): void;
}

export type LottieReaction = 'cheer' | 'fist';

const mat = (color: number, roughness = 0.85) => new THREE.MeshStandardMaterial({ color, roughness });

function shadowy<T extends THREE.Mesh>(m: T): T { m.castShadow = true; m.receiveShadow = true; return m; }

function signTexture(text: string, sub: string, crayon: boolean) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 200;
  const g = c.getContext('2d')!;
  g.fillStyle = crayon ? '#d9b98a' : '#fff6c2'; // cardboard or painted board
  g.fillRect(0, 0, c.width, c.height);
  g.textAlign = 'center';
  if (crayon) {
    g.font = 'bold 76px "Comic Sans MS", "Chalkboard SE", cursive';
    g.fillStyle = '#f2c200';
    g.strokeStyle = '#c0392b';
    g.lineWidth = 4;
    g.save(); g.translate(256, 92); g.rotate(-0.04);
    g.fillText(text, 0, 0); g.strokeText(text, 0, 0); g.restore();
    g.fillStyle = '#2d6cdf';
    g.font = 'bold 60px "Comic Sans MS", "Chalkboard SE", cursive';
    g.fillText(sub, 256, 172);
  } else {
    g.strokeStyle = '#d9a400'; g.lineWidth = 12; g.strokeRect(6, 6, c.width - 12, c.height - 12);
    g.fillStyle = '#e0a800'; g.font = 'bold 78px "Trebuchet MS", sans-serif'; g.fillText(text, 256, 100);
    g.fillStyle = '#7a4a12'; g.font = 'bold 50px "Trebuchet MS", sans-serif'; g.fillText(sub, 256, 168);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function folkTable(): THREE.Group {
  const g = new THREE.Group();
  const top = shadowy(new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 0.9), mat(0x2f6d4f)));
  top.position.set(0, 0.78, 0.3);
  g.add(top);
  for (const x of [-0.72, 0.72]) for (const z of [-0.1, 0.7]) {
    const leg = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.78, 6), mat(0x888888, 0.4)));
    leg.position.set(x, 0.39, z);
    g.add(leg);
  }
  // Blue cooler beside the table.
  const cooler = shadowy(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.42, 0.4), mat(0x2d7dd2, 0.5)));
  cooler.position.set(1.15, 0.21, 0.35);
  g.add(cooler);
  const lid = shadowy(new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.08, 0.42), mat(0xf4f4f4, 0.5)));
  lid.position.set(1.15, 0.46, 0.35);
  g.add(lid);
  return g;
}

function woodenBooth(): THREE.Group {
  const g = new THREE.Group();
  const counter = shadowy(new THREE.Mesh(new THREE.BoxGeometry(3, 1.1, 1.1), mat(0xb07a45)));
  counter.position.set(0, 0.55, 0.3);
  g.add(counter);
  const top = shadowy(new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.1, 1.3), mat(0xcf9a5c)));
  top.position.set(0, 1.15, 0.3);
  g.add(top);
  for (const x of [-1.5, 1.5]) for (const z of [-0.2, 0.8]) {
    const post = shadowy(new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.6, 0.12), mat(0x8a5a30)));
    post.position.set(x, 1.3, z);
    g.add(post);
  }
  const awning = new THREE.Group();
  for (let i = 0; i < 8; i++) {
    const s = shadowy(new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.06, 1.7), mat(i % 2 ? 0xffffff : 0xf6d33c, 0.7)));
    s.position.x = -1.8 + (i + 0.5) * 0.45;
    awning.add(s);
  }
  awning.position.set(0, 2.62, 0.45);
  awning.rotation.x = 0.18;
  g.add(awning);
  return g;
}

function lawnChair(): THREE.Group {
  const g = new THREE.Group();
  const frame = mat(0xcccccc, 0.4);
  const webbing = mat(0x2bb3b1, 0.7);
  const seat = shadowy(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.05, 0.55), webbing));
  seat.position.y = 0.38;
  g.add(seat);
  const back = shadowy(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 0.05), webbing));
  back.position.set(0, 0.72, -0.3);
  back.rotation.x = -0.25;
  g.add(back);
  for (const x of [-0.3, 0.3]) for (const z of [-0.25, 0.25]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.38, 5), frame);
    leg.position.set(x, 0.19, z);
    g.add(leg);
  }
  return g;
}

export function createStand(opts: { lottie?: boolean } = {}): Stand {
  const group = new THREE.Group();
  const levelRoot = new THREE.Group();
  group.add(levelRoot);
  let level = 0;
  let surfaceY = 0.81;
  let spin: THREE.Object3D | undefined;

  // The upgrade upCrate: drops in, rattles, bursts into planks.
  const upCrate = new THREE.Group();
  const wood = mat(0x8B5E3C);
  const crateBox = shadowy(new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.0, 1.8), wood));
  crateBox.position.y = 1.0;
  const label = shadowy(new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.7), mat(0xF7C948, 0.6)));
  label.position.set(0, 1.1, 0.91);
  upCrate.add(crateBox, label);
  for (const y of [0.35, 1.65]) { const band = shadowy(new THREE.Mesh(new THREE.BoxGeometry(2.25, 0.16, 1.85), mat(0x6e4a2c))); band.position.y = y; upCrate.add(band); }
  upCrate.visible = false;
  group.add(upCrate);
  const planks = [0, 1, 2, 3, 4, 5].map(() => { const p = shadowy(new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.12, 0.35), wood)); p.visible = false; group.add(p); return p; });
  const plankVel = planks.map(() => new THREE.Vector3());
  let revealT = -1, lastTime = 0, knockT = -1;
  function animateKnock(dt: number) {
    if (knockT < 0) return;
    knockT += dt;
    // Over it goes (on twos), lies there a while, then gets heaved back up.
    const q = Math.floor(knockT * 12) / 12;
    const tip = q < 0.35 ? (q / 0.35) : q < 4.5 ? 1 : Math.max(0, 1 - (q - 4.5) / 0.6);
    levelRoot.rotation.x = -tip * 1.25;
    levelRoot.position.z = -tip * 0.4;
    props.visible = tip < 0.2;
    if (knockT > 5.2) { knockT = -1; levelRoot.rotation.x = 0; levelRoot.position.z = 0; props.visible = true; }
  }
  function animateReveal(time: number) {
    if (revealT < 0) return;
    const dt = Math.min(0.1, Math.max(0, time - lastTime));
    revealT += dt;
    const t = revealT;
    // Stop-motion: the big moves step on twos (12 fps).
    const q = Math.floor(t * 12) / 12;
    if (t < 0.5) {
      upCrate.visible = true; levelRoot.visible = false; props.visible = false;
      const k = q / 0.5;
      upCrate.position.y = 7 * (1 - k * k);
      upCrate.scale.set(1, 1, 1);
    } else if (t < 1.4) {
      upCrate.position.y = 0;
      const land = t < 0.7 ? Math.sin(((q - 0.5) / 0.2) * Math.PI) * 0.18 * MOTION : 0;
      const rattle = t > 0.8 ? Math.sin(q * 70) * 0.05 * MOTION : 0;
      upCrate.scale.set(1 + land * 0.6, 1 - land, 1 + land * 0.6);
      upCrate.rotation.z = rattle;
    } else if (upCrate.visible) {
      // Burst: planks fly, the new stand pops up.
      upCrate.visible = false;
      planks.forEach((p, i) => {
        const a = (i / planks.length) * Math.PI * 2;
        p.visible = true;
        p.position.set(Math.cos(a) * 0.8, 1 + (i % 3) * 0.5, Math.sin(a) * 0.7);
        p.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
        plankVel[i].set(Math.cos(a) * 4, 5 + Math.random() * 2, Math.sin(a) * 3.5);
      });
      levelRoot.visible = true;
      props.visible = true;
    }
    if (t >= 1.4) {
      const k = q - 1.4;
      const pop = k < 0.5 ? [0.2, 0.6, 1.2, 1.15, 0.95, 1.02][Math.min(5, Math.floor(k * 12))] : 1;
      const sc = MOTION < 1 ? 1 : pop;
      levelRoot.scale.set(sc, sc, sc);
      planks.forEach((p, i) => {
        if (!p.visible) return;
        plankVel[i].y -= 18 * dt;
        p.position.addScaledVector(plankVel[i], dt);
        p.rotation.x += dt * 6; p.rotation.z += dt * 4;
        if (p.position.y < 0.06) { p.position.y = 0.06; plankVel[i].set(0, 0, 0); }
      });
      if (t > 3.2) { planks.forEach((p) => { p.visible = false; }); levelRoot.scale.set(1, 1, 1); revealT = -1; window.dispatchEvent(new CustomEvent('stand-revealed', { detail: { stand: group, level } })); }
    }
  }

  // Props that move with the level: pitcher, lemons, cups, sign.
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.11, 0.36, 16, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, roughness: 0.1 }));
  const juice = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.33, 16),
    new THREE.MeshStandardMaterial({ color: 0xfff15a, emissive: 0x554400, roughness: 0.3 }));
  const props = new THREE.Group();
  props.add(glass, juice);
  const lemonMat = mat(0xffe11a, 0.5);
  const lemonGeo = new THREE.SphereGeometry(0.07, 10, 8);
  for (let i = 0; i < 6; i++) {
    const l = new THREE.Mesh(lemonGeo, lemonMat);
    l.scale.set(1.25, 1, 1);
    l.position.set(0.3 + (i % 3) * 0.13, 0.06 + Math.floor(i / 3) * 0.1, 0.25 + (i % 2) * 0.1);
    l.castShadow = true;
    props.add(l);
  }
  for (let i = 0; i < 4; i++) {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.045, 0.13, 10), mat(0xf2f2f2));
    cup.position.set(-0.1, 0.07 + i * 0.04, 0.3);
    props.add(cup);
  }
  glass.position.set(-0.45, 0.18, 0.35);
  juice.position.copy(glass.position);
  group.add(props);

  const signMat = new THREE.MeshStandardMaterial({ roughness: 0.8 });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.55), signMat);
  sign.castShadow = true;
  group.add(sign);

  const kid = makePerson(0xf6d33c, 0x3c5aa6, undefined, 0.8);
  kid.position.set(0, 0, -0.45);
  group.add(kid);

  // Grandma Lottie: lavender dress, white bun, in a lawn chair.
  const chair = lawnChair();
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
  const phone = new THREE.Group();
  const phoneBody = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.28), mat(0xE8704F, 0.5));
  phoneBody.position.y = 0.08;
  const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.02, 14), mat(0xFFF1D6, 0.5));
  dial.position.set(0, 0.17, 0.05);
  const handset = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.3, 4, 8), mat(0xE8704F, 0.5));
  handset.rotation.z = Math.PI / 2;
  handset.position.set(0, 0.21, -0.07);
  const phoneCrate = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.4, 0.36), mat(0x8B5E3C));
  phoneCrate.position.y = -0.2;
  phone.add(phoneBody, dial, handset, phoneCrate);
  phone.position.set(-2.55, 0.4, 0.25);
  phone.traverse((o) => { o.castShadow = true; });
  if (opts.lottie !== false) group.add(phone);
  let reaction: { kind: LottieReaction; start: number } | null = null;
  let pendingReaction: LottieReaction | null = null;
  if (opts.lottie !== false) group.add(lottie);

  // Hand-painted signs (brand tier 1) up and down the block.
  const brandSigns = new THREE.Group();
  const brandMat = new THREE.MeshStandardMaterial({ map: signTexture("LOTTIE'S", 'this way →', true), roughness: 0.8 });
  for (const [x, flip] of [[-4.8, 1], [4.8, -1]] as const) {
    const board = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.45), brandMat);
    board.position.set(x, 0.9, 1.0);
    board.rotation.y = flip * 0.35;
    board.castShadow = true;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.08), mat(0x8a5a30));
    post.position.set(x, 0.45, 0.98);
    brandSigns.add(board, post);
  }
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

  let lastSign = '';
  const stand: Stand = {
    group,
    kid,
    lottie: opts.lottie !== false ? lottie : undefined,
    react(kind) { pendingReaction = kind; },
    reveal() { revealT = 0; levelRoot.visible = false; props.visible = false; },
    knock() { knockT = 0; },
    servePoint: new THREE.Vector3(0, 0, 1.35),
    setLevel(l) {
      if (l === level) return;
      level = l;
      levelRoot.clear();
      spin = undefined;
      if (l >= 3) {
        const m = (l === 3 ? kiosk : l === 4 ? shack : palace)();
        levelRoot.add(m.group);
        surfaceY = m.surfaceY;
        sign.position.copy(m.sign);
        sign.rotation.x = 0;
        spin = m.spin;
      } else {
        levelRoot.add(l === 2 ? woodenBooth() : folkTable());
        surfaceY = l === 2 ? 1.2 : 0.81;
        if (l === 2) { sign.position.set(0, 0.6, 0.86); sign.rotation.x = 0; }
        else { sign.position.set(0, 0.5, 0.76); sign.rotation.x = -0.05; }
      }
      props.position.set(0, surfaceY, l >= 5 ? 0.1 : l >= 3 ? 0.3 : 0);
      // Bigger buildings: the kid works the window, Lottie sits further out.
      kid.position.set(0, l >= 3 ? 0.3 : 0, l >= 3 ? 0.05 : -0.45);
      const out = l >= 5 ? -5 : l === 4 ? -5.2 : l === 3 ? -3 : -2;
      chair.position.x = out;
      lottie.position.x = out;
      phone.position.x = out - 0.55;
      stand.servePoint.z = l === 4 ? 1.5 : 1.35;
      lastSign = '';
    },
    setBrand(tier) {
      brandSigns.visible = tier >= 1;
    },
    update({ price, pitcherFill, open, time, hot, night, ringing }) {
      const label = price < 1 ? `${Math.round(price * 100)}¢` : `$${price.toFixed(2)}`;
      const key = `${level}|${label}`;
      if (key !== lastSign) {
        lastSign = key;
        signMat.map?.dispose();
        signMat.map = signTexture(level >= 2 ? "LOTTIE'S" : 'LEMONADE', label, level < 2);
        signMat.needsUpdate = true;
      }
      const f = Math.max(0.02, pitcherFill);
      juice.scale.y = f;
      juice.position.y = glass.position.y - 0.165 * (1 - f);
      kid.position.y = (level >= 3 ? 0.3 : 0) + (open ? Math.abs(Math.sin(time * 3)) * 0.03 * MOTION : 0);
      idlePose(kid, time, 0.8);
      if (spin) spin.rotation.y = time * 0.8;
      animateReveal(time);
      animateKnock(Math.min(0.1, Math.max(0, time - lastTime)));
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
