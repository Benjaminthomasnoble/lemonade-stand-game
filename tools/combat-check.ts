// Checks the fight model against the spec. Usage: npm run combat
// 1. The canon combat anchors (canon section 12): T1 raids against L1 plots, T4 raids against a kitted L5 plot.
// 2. The weapon checks (spec "Weapons and padding"): breach and Smash times for clubs and hatchets.
// 3. The HQ assault win rates in docs/HANDOFF.md, over 40 seeds with the model squads.
// The fighters come from src/sim/fighters.ts, the same builders the walkthrough tests (src/sim/walkthrough.test.ts) use.
import { runBattle, winChance } from '../src/sim/combat.ts';
import { HQS, newGame, ownedPlots, stormHQ, STAND_HP, TRAITS, type GadgetId, type GameState, type GearId, type RivalId, type WeaponId } from '../src/sim/economy.ts';
import { battleOf as fight, fencedOf as fenced, guardOf as guard, guardsOf as guards, henchmenOf as henchmen, partyOf as party } from '../src/sim/fighters.ts';

const pct = (x: number) => `${Math.round(x * 100)}%`;

console.log('Canon anchors');
const fists3 = () => henchmen(3, 1, 'fists');
const a1 = winChance(fight({ attackers: fists3(), standHp: STAND_HP[0], detected: false }), 1, 400);
console.log(`  T1 raid (3 fists) vs undefended L1: attackers win ${pct(a1)} (want "usually")`);
for (const detected of [true, false]) {
  const a2 = winChance(fight({ attackers: fists3(), defenders: guards(1, 'def', 'fists'), ...fenced(1), standHp: STAND_HP[0], detected }), 2, 400);
  console.log(`  T1 raid (3 fists) vs Picket + 1 fists guard, ${detected ? 'detected' : 'undetected'}: attackers fail ${pct(1 - a2)} (want ~60%)`);
}
{
  let fails = 0, runs = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const r = runBattle(fight({ attackers: party(1, seed), defenders: guards(1, 'def', 'fists'), ...fenced(1), standHp: STAND_HP[0], objective: seed % 2 ? 'smash' : 'shakedown', detected: seed % 4 < 2 }), { seed });
    runs++; if (r.winner === 'def') fails++;
  }
  console.log(`  Real T1 parties (2-3 fists) vs Picket + 1 fists guard: attackers fail ${pct(fails / runs)} (want ~60%)`);
}
const kit: GadgetId[] = ['goose', 'slick', 'sprinkler'];
for (const tier of [4, 5]) {
  let holds = 0, runs = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const r = runBattle(fight({ attackers: party(4, seed), defenders: guards(5, 'def', 'hatchets', 'pro'), ...fenced(tier), gadgets: kit, standHp: STAND_HP[4], objective: seed % 10 < 7 ? 'smash' : 'shakedown', detected: seed % 5 < 2 }), { seed });
    runs++; if (r.winner === 'def') holds++;
  }
  console.log(`  T4 raids (8-12) vs kitted L5 (P${tier}, 5 L1 hatchets+Pro, goose/slick/sprinkler): defense holds ${pct(holds / runs)} (want ~75%)`);
}

console.log('Weapon checks (spec: 19 s, 75 s, no Smash in 60 min, 16 s)');
const breachTime = (weapon: WeaponId, k: number) => {
  const r = runBattle(fight({ attackers: guards(k, 'att', weapon), perimeter: 2, fenceHp: 2500, standHp: STAND_HP[4] }), { seed: 1 });
  return r.events.find((e) => e.type === 'breach')?.t;
};
console.log(`  5 hatchets breach 2,500 HP at ${breachTime('hatchets', 5)} s; 5 clubs at ${breachTime('clubs', 5)} s`);
for (const weapon of ['clubs', 'hatchets'] as WeaponId[]) {
  const r = runBattle(fight({ attackers: guards(12, 'att', weapon), standHp: STAND_HP[4] }), { seed: 1 });
  console.log(`  12 ${weapon} vs a Citrus Palace (5,000 HP): ${r.outcome} at ${r.duration} s, ${r.standHpLeft} HP left`);
}

console.log('HQ assaults, 40 seeds (HANDOFF: 83 / 75 / 85 / 95%, Sourwood 35% at L4 and 80% at L5)');
function weaken(s: GameState, id: RivalId) {
  const plots = ownedPlots(s, id).filter((p) => p.type !== 'hq');
  for (const p of plots.slice(1)) s.plots[p.id] = { ...s.plots[p.id], owner: null, stand: null };
}
function assault(id: RivalId, size: number, level: number, weapon: WeaponId, gear: GearId, held = 0, seeds = 40) {
  let wins = 0;
  const stalls: Record<string, number> = {};
  for (let seed = 1; seed <= seeds; seed++) {
    const s = newGame(seed);
    s.rank = 10;
    s.cash = 1e9;
    s.day = 78; // after the Act 4 County Fair: the campaign's Tilly won't be stormed before it (calendar.ts tillyWaits)
    weaken(s, id);
    if (id === 'sourwood') s.squeeze = { called: s.day - 7, nights: 7, held, lost: 0, done: s.day }; // the campaign opens the Manor with the Big Squeeze: `held` good nights
    // A mixed crew: traits cycle with the seed, as hires from the Hiring Hall would.
    s.guards = Array.from({ length: size }, (_, i) => guard(weapon, gear, level, TRAITS[(seed * 7 + i * 3) % TRAITS.length]));
    const r = stormHQ(s, id, s.guards.map((g) => g.id));
    if (r && r.won) wins++;
    else if (r) stalls[r.stage] = (stalls[r.stage] ?? 0) + 1;
  }
  return `${pct(wins / seeds)} (stalls ${Object.entries(stalls).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'})`;
}
console.log(`  Blend Shack, 5 L2 clubs: ${assault('blenders', 5, 2, 'clubs', 'none')}`);
console.log(`  Grindhouse, 8 L2 clubs + vests: ${assault('coldbrew', 8, 2, 'clubs', 'vest')}`);
console.log(`  Hollis Homestead, 8 L3 hatchets + vests: ${assault('hollis', 8, 3, 'hatchets', 'vest')}`);
console.log(`  FizzCo Tower, 12 L4 hatchets + Pro Gear: ${assault('fizzco', 12, 4, 'hatchets', 'pro')}`);
console.log(`  Sourwood Manor, 12 L4 hatchets + Pro Gear: ${assault('sourwood', 12, 4, 'hatchets', 'pro')}`);
console.log(`  Sourwood Manor, 12 L5 hatchets + Pro Gear: ${assault('sourwood', 12, 5, 'hatchets', 'pro')}`);
console.log(`  Sourwood Manor after 7 good siege nights (Gate 1,500, Yard ${HQS.sourwood.yard - 7}), 12 L4 hatchets + Pro Gear: ${assault('sourwood', 12, 4, 'hatchets', 'pro', 7)}`);

if (process.env.DEBUG) {
  const r = runBattle(fight({ attackers: party(4, 9), defenders: guards(5, 'def', 'hatchets', 'pro'), ...fenced(4), gadgets: kit, standHp: STAND_HP[4] }), { seed: 9 });
  const ev = r.events.filter((e) => e.type !== 'swing' && e.type !== 'chop' && e.type !== 'move' && e.type !== 'at');
  console.log(r.outcome, r.duration, 'fence', r.fenceHpLeft, JSON.stringify(ev));
}
