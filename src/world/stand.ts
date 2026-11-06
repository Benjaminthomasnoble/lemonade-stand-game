// The level 1 lemonade stand: a wooden counter with a striped awning,
// a price sign, a pitcher whose fill shows cups left, and the owner.
import * as THREE from 'three/webgpu';
import { makePerson } from './people.ts';

export interface Stand {
  group: THREE.Group;
  /** Where a customer stands to buy. */
  servePoint: THREE.Vector3;
  update(opts: { price: number; pitcherFill: number; open: boolean; time: number }): void;
}

function wood(color = 0xb07a45) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
}

function signTexture(text: string, sub: string) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 160;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff6c2';
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = '#d9a400';
  g.lineWidth = 12;
  g.strokeRect(6, 6, c.width - 12, c.height - 12);
  g.fillStyle = '#e0a800';
  g.font = 'bold 74px "Trebuchet MS", sans-serif';
  g.textAlign = 'center';
  g.fillText(text, 256, 88);
  g.fillStyle = '#7a4a12';
  g.font = 'bold 42px "Trebuchet MS", sans-serif';
  g.fillText(sub, 256, 140);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createStand(): Stand {
  const group = new THREE.Group();
  const shadowy = (m: THREE.Mesh) => { m.castShadow = true; m.receiveShadow = true; return m; };

  const counter = shadowy(new THREE.Mesh(new THREE.BoxGeometry(3, 1.1, 1.1), wood()));
  counter.position.set(0, 0.55, 0.3);
  group.add(counter);
  const top = shadowy(new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.1, 1.3), wood(0xcf9a5c)));
  top.position.set(0, 1.15, 0.3);
  group.add(top);
  for (const x of [-1.5, 1.5]) for (const z of [-0.2, 0.8]) {
    const post = shadowy(new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.6, 0.12), wood(0x8a5a30)));
    post.position.set(x, 1.3, z);
    group.add(post);
  }
  // Striped awning, tilted toward the street.
  const awning = new THREE.Group();
  const stripes = 8;
  for (let i = 0; i < stripes; i++) {
    const s = shadowy(new THREE.Mesh(new THREE.BoxGeometry(3.6 / stripes, 0.06, 1.7),
      new THREE.MeshStandardMaterial({ color: i % 2 ? 0xffffff : 0xffd21f, roughness: 0.7 })));
    s.position.x = -1.8 + (i + 0.5) * (3.6 / stripes);
    awning.add(s);
  }
  awning.position.set(0, 2.62, 0.45);
  awning.rotation.x = 0.18;
  group.add(awning);

  const signMat = new THREE.MeshStandardMaterial({ map: signTexture('LEMONADE', '50¢'), roughness: 0.6 });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.75), signMat);
  sign.position.set(0, 0.6, 0.86);
  group.add(sign);

  // Pitcher: glass shell plus a lemonade column that drains as cups sell.
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.15, 0.45, 16, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, roughness: 0.1 }));
  glass.position.set(-0.8, 1.43, 0.35);
  group.add(glass);
  const juice = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.14, 0.42, 16),
    new THREE.MeshStandardMaterial({ color: 0xfff15a, emissive: 0x554400, roughness: 0.3 }));
  juice.position.copy(glass.position);
  group.add(juice);

  // A little pile of lemons and a stack of cups.
  const lemonMat = new THREE.MeshStandardMaterial({ color: 0xffe11a, roughness: 0.5 });
  const lemonGeo = new THREE.SphereGeometry(0.09, 10, 8);
  for (let i = 0; i < 7; i++) {
    const l = new THREE.Mesh(lemonGeo, lemonMat);
    l.scale.set(1.25, 1, 1);
    l.position.set(0.55 + (i % 4) * 0.17, 1.28 + Math.floor(i / 4) * 0.13, 0.25 + (i % 2) * 0.12);
    l.castShadow = true;
    group.add(l);
  }
  for (let i = 0; i < 5; i++) {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.16, 10), new THREE.MeshStandardMaterial({ color: 0xf2f2f2 }));
    cup.position.set(0.1, 1.28 + i * 0.05, 0.3);
    group.add(cup);
  }

  const owner = makePerson(0xff6f61, 0x3c5aa6);
  owner.position.set(0, 0, -0.55);
  group.add(owner);

  const openSign = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.3), new THREE.MeshStandardMaterial({ map: signTexture('OPEN', ''), roughness: 0.6 }));
  openSign.position.set(1.0, 1.9, 0.82);
  group.add(openSign);

  let lastPrice = -1;
  return {
    group,
    servePoint: new THREE.Vector3(0, 0, 1.45),
    update({ price, pitcherFill, open, time }) {
      if (price !== lastPrice) {
        lastPrice = price;
        signMat.map?.dispose();
        const label = price < 1 ? `${Math.round(price * 100)}¢` : `$${price.toFixed(2)}`;
        signMat.map = signTexture('LEMONADE', label);
        signMat.needsUpdate = true;
      }
      const f = Math.max(0.02, pitcherFill);
      juice.scale.y = f;
      juice.position.y = glass.position.y - 0.21 * (1 - f);
      openSign.visible = open;
      owner.position.y = open ? Math.abs(Math.sin(time * 3)) * 0.04 : 0;
    },
  };
}
