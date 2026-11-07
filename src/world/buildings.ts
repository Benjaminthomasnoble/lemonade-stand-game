// The clay builders bay.ts places on plots: rival stands, fences, gadgets and
// wrecks (the models live in clay/). Landmarks, HQs, fields, piers, facilities
// and FOR SALE signs are in landmarks.ts.
import type * as THREE from 'three';
import type { RivalId } from '../sim/economy.ts';
import type { GadgetId } from '../sim/balance.ts';
import { rivalStand as clayRivalStand } from './clay/rivalStands.ts';
import { fenceModel as clayFence, gadgetsModel, wreckPile as clayWreck } from './clay/defenses.ts';
import type { Owner } from './clay/standKit.ts';

/** A rival stand: the same five clay silhouettes as ours, in the faction's dress (clay/rivalStands.ts). */
export function rivalStand(id: RivalId, level: number, hp = 1): THREE.Group {
  return clayRivalStand(id, level, hp);
}

/** Perimeter around a plot (P1 picket … P5 wall), with a gap at the front for the gate (clay/defenses.ts). */
export function fenceModel(tier: number, hp = 1): THREE.Group {
  return clayFence(tier, hp);
}

/** Installed gadgets on a plot. */
export function gadgetModels(ids: readonly GadgetId[]): THREE.Group {
  return gadgetsModel(ids);
}

/** A smashed stand: the neat clay pile with the owner's sign on top. */
export function wreckPile(level: number, owner: Owner): THREE.Group {
  return clayWreck(level, owner);
}

/** A smashed facility: knocked crooked, with a pile of sticks and squashed clay. */
export function wreckLook(building: THREE.Object3D, owner: Owner = 'player'): THREE.Group {
  building.rotation.z = 0.12;
  building.rotation.x = -0.08;
  building.position.y = -0.15;
  building.scale.y = 0.9;
  const g = clayWreck(2, owner);
  g.position.set(0, 0, 1.4);
  return g;
}
