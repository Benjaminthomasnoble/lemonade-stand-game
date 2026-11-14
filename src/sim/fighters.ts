// Fighter builders for the fight tests, the walkthrough tests and
// tools/combat-check.ts: guards as the crew fields them, henchmen as a rival
// fields them at a Threat, real raiding parties, and a bare battle input to
// put them in.
import { GEAR, GUARD_BASE, HENCHMEN, PERIMETERS, WEAPONS, type GearId, type Trait, type WeaponId } from './balance.ts';
import type { BattleInput, Fighter, Side } from './combat.ts';
import { guardFighter, raidPartyFor, type Guard } from './crew.ts';
import { newGame, type GameState } from './economy.ts';
import { PLOT_BY_ID, PLOTS } from './map.ts';

let n = 0;

/** A plain fighter: 100 HP, Nerve 50 and the weapon's Hit and Chop. */
export const fighterOf = (side: Side, weapon: WeaponId = 'fists', o: Partial<Fighter> = {}): Fighter => ({
  id: `${side}${n++}`, name: '', side, hp: GUARD_BASE.hp, hit: WEAPONS[weapon].hit, chop: WEAPONS[weapon].chop, nerve: GUARD_BASE.nerve, armor: 0, weapon, ...o,
});

/** A guard for the roster (a Smooth Talker has no fight trait). */
export const guardOf = (weapon: WeaponId = 'fists', gear: GearId = 'none', level = 1, trait: Trait = 'Smooth Talker', o: Partial<Guard> = {}): Guard =>
  ({ id: `g${n++}`, name: '', trait, level, xp: 0, weapon, gear, post: null, outUntil: 0, fee: 0, ...o });

/** k guards as they fight. */
export const guardsOf = (k: number, side: Side, weapon: WeaponId, gear: GearId = 'none', level = 1, night = false): Fighter[] =>
  Array.from({ length: k }, () => guardFighter(guardOf(weapon, gear, level), side, night));

/** Henchmen as a rival fields them at this Threat (crew.ts henchman()), with a fixed weapon. */
export const henchmenOf = (k: number, threat: number, weapon: WeaponId, side: Side = 'att'): Fighter[] => Array.from({ length: k }, () => {
  const h = HENCHMEN[threat - 1], m = 1 + 0.1 * (h.level - 1);
  return { id: `h${n++}`, name: '', side, hp: (GUARD_BASE.hp + GEAR[h.gear].hp) * m, hit: WEAPONS[weapon].hit * m, chop: WEAPONS[weapon].chop * m, nerve: GUARD_BASE.nerve, armor: GEAR[h.gear].armor, weapon };
});

/** A real raiding party at this Threat, as the rivals field them (sizes and weapons by Threat), rolled for this seed. */
export function partyOf(threat: number, seed: number): Fighter[] {
  const s = newGame(seed);
  s.rank = threat * 2 - 1;
  return raidPartyFor(s, 'blenders');
}

/** A fight with nothing in it but what you give it: no fence, no stand, a Smash, detected. */
export const battleOf = (o: Partial<BattleInput> & Pick<BattleInput, 'attackers'>): BattleInput =>
  ({ defenders: [], perimeter: 0, fenceHp: 0, gadgets: [], standHp: 0, objective: 'smash', detected: true, ...o });

/** A perimeter of this tier at full HP. */
export const fencedOf = (tier: number) => ({ perimeter: tier, fenceHp: PERIMETERS[tier - 1].hp });

/** Raids need a Foothold in the target's district (crew's canRaid): a bare lot of yours there, if you hold none. */
export function footholdFor(s: GameState, target: string): string {
  const d = PLOT_BY_ID[target].district;
  const lots = PLOTS.filter((p) => p.district === d && p.type !== 'civic' && p.type !== 'hq');
  const mine = lots.find((p) => s.plots[p.id].owner === 'player');
  if (mine) return mine.id;
  const lot = lots.find((p) => !s.plots[p.id].owner && !s.plots[p.id].stand && !s.plots[p.id].facility)!;
  s.plots[lot.id].owner = 'player';
  return lot.id;
}
