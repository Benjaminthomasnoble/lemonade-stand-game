// Checks the canon combat anchors (section 12). Usage: npm run combat
import { winChance, type Fighter } from '../src/sim/combat.ts';
import { WEAPONS, GEAR, STAND_HP, PERIMETERS, COMBAT, HENCHMEN } from '../src/sim/balance.ts';
const [p1, bd, hb, p4] = process.argv.slice(2).map(Number);
if (p1) PERIMETERS[0].hp = p1; if (!isNaN(bd)) COMBAT.breachDps = bd; if (!isNaN(hb)) COMBAT.homeBonus = hb; if (p4) PERIMETERS[3].hp = p4;

let n = 0;
const f = (side: 'att' | 'def', weapon: keyof typeof WEAPONS = 'fists', gear: keyof typeof GEAR = 'none', level = 1): Fighter => {
  const m = 1 + 0.1 * (level - 1);
  return { id: `${side}${n++}`, name: '', side, weapon, hp: (100 + GEAR[gear].hp) * m, hit: WEAPONS[weapon].hit * m, chop: WEAPONS[weapon].chop * m, nerve: 60, armor: GEAR[gear].armor };
};
const many = (k: number, side: 'att' | 'def', w: keyof typeof WEAPONS, g: keyof typeof GEAR = 'none', lvl = 1) => Array.from({ length: k }, () => f(side, w, g, lvl));

const a1 = winChance({ attackers: many(3, 'att', 'fists'), defenders: [], perimeter: 0, fenceHp: 0, gadgets: [], standHp: STAND_HP[0], objective: 'smash', detected: false }, 1, 400);
console.log(`T1 raid (3 fists) vs undefended L1: attackers win ${(a1 * 100).toFixed(0)}% (want "usually")`);
const a2 = winChance({ attackers: many(3, 'att', 'fists'), defenders: many(1, 'def', 'fists'), perimeter: 1, fenceHp: PERIMETERS[0].hp, gadgets: [], standHp: STAND_HP[0], objective: 'smash', detected: true }, 2, 400);
console.log(`T1 raid vs Picket + 1 fists guard: attackers fail ${((1 - a2) * 100).toFixed(0)}% (want ~60%)`);
// Threat 4 raid: 10 henchmen, 60% clubs 30% hatchets 10% fists.
const H = HENCHMEN[3];
const t4 = () => [...many(1, 'att', 'fists', H.gear, H.level), ...many(7, 'att', 'clubs', H.gear, H.level), ...many(4, 'att', 'hatchets', H.gear, H.level)];
for (const per of [4, 5]) {
  const a3 = winChance({ attackers: t4(), defenders: many(5, 'def', 'hatchets', 'pro', 1), perimeter: per, fenceHp: PERIMETERS[per - 1].hp, gadgets: ['goose', 'slick', 'sprinkler'], standHp: STAND_HP[4], objective: 'smash', detected: true }, 3, 300);
  console.log(`T4 raid (12) vs kitted L5 (P${per}, 5 hatchets+Pro, 3 gadgets): defense holds ${((1 - a3) * 100).toFixed(0)}% (want ~75%)`);
}
if (process.env.DEBUG) {
  const { runBattle } = await import('../src/sim/combat.ts');
  const r = runBattle({ attackers: t4(), defenders: many(5, 'def', 'hatchets', 'pro', 1), perimeter: 4, fenceHp: PERIMETERS[3].hp, gadgets: ['goose', 'slick', 'sprinkler'], standHp: STAND_HP[4], objective: 'smash', detected: true }, { seed: 9 });
  const ev = r.events.filter((e) => e.type !== 'swing' && e.type !== 'chop');
  console.log(r.outcome, r.duration, 'fence', r.fenceHpLeft, JSON.stringify(ev));
}
