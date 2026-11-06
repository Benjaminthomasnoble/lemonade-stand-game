// Headless balance check: plays N days with a simple restocking policy.
// Usage: npm run sim -- [days] [seed]
import {
  buySupply, maxPacks, newGame, openStand, rankFor, selectedStand, simulateRestOfDay, sleepUntilDawn, stock, successScore, battleHeadline, playerStands, rebuildStand, type SupplyId,
} from '../src/sim/economy.ts';

const days = Number(process.argv[2] ?? 14);
const s = newGame(Number(process.argv[3] ?? 42));
const targets: Record<SupplyId, number> = { lemons: 50, sugar: 100, ice: 360 };
for (let d = 0; d < days; d++) {
  for (const id of Object.keys(targets) as SupplyId[]) {
    const st = selectedStand(s);
    while (stock(st, id) < targets[id] && maxPacks(s, st, id) > 0) buySupply(s, id);
  }
  openStand(s);
  simulateRestOfDay(s);
  const t = s.today;
  const w = t.walkedPast;
  const profit = t.revenue - t.supplies - t.cupCosts - t.upkeep;
  console.log(`day ${String(t.day).padStart(2)} ${t.weather.kind.padEnd(8)} ${t.weather.temp}F  passers ${t.passersby}  sold ${t.customers}  out ${w.soldOut} line ${w.line} pricey ${w.pricey} rival ${w.rival}  profit $${profit.toFixed(2)}  rep ${s.reputation}  cash $${s.cash.toFixed(2)}  SS ${successScore(s)} ${rankFor(successScore(s)).title}`);
  const before = s.battles.length ? s.battles[0] : null;
  sleepUntilDawn(s);
  if (s.battles[0] && s.battles[0] !== before) console.log(`   night: ${battleHeadline(s.battles[0])}`);
  for (const p of playerStands(s)) if (s.plots[p.id].stand!.wrecked) rebuildStand(s, p.id);
  s.news.length = 0;
}
