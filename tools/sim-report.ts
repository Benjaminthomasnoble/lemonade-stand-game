// Headless balance check: plays N days with a simple restocking policy.
// Usage: npm run sim -- [days] [seed]
import {
  buildClubhouse, buySupply, canBuildClubhouse, maxPacks, newGame, openStand, rankFor, selectedStand, simulateRestOfDay, sleepUntilDawn, stock, successScore, battleHeadline, playerStands, rebuildStand, type SupplyId,
  dayProfit,
} from '../src/sim/economy.ts';
import { goalsNow } from '../src/sim/goals.ts';

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
  const profit = dayProfit(t); // the Ledger's profit: supplies as used, not as bought
  console.log(`day ${String(t.day).padStart(2)} ${t.weather.kind.padEnd(8)} ${t.weather.temp}F  passers ${t.passersby}  sold ${t.customers}  out ${w.soldOut} line ${w.line} pricey ${w.pricey} rival ${w.rival}  profit $${profit.toFixed(2)}  rep ${s.reputation}  cash $${s.cash.toFixed(2)}  SS ${successScore(s)} ${rankFor(successScore(s)).title}`);
  const before = s.battles.length ? s.battles[0] : null;
  sleepUntilDawn(s);
  if (s.battles[0] && s.battles[0] !== before) console.log(`   night: ${battleHeadline(s.battles[0])}`);
  for (const p of playerStands(s)) if (s.plots[p.id].stand!.wrecked) rebuildStand(s, p.id);
  // Act 2: Dex pushes for a first Clubhouse (a story goal from Day 15), and the bot builds it once it can (spec: Days 15-19).
  if (goalsNow(s).some((g) => g.text === 'Build Dex a Clubhouse' && !g.done) && canBuildClubhouse(s).ok && buildClubhouse(s)) console.log(`   dawn of day ${s.day}: the first Clubhouse goes up for Dex`);
  s.news.length = 0;
}
