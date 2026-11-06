// Headless balance check: plays N days with a simple restocking policy.
// Usage: npm run sim -- [days] [seed]
import { buySupply, newGame, nextDay, openStand, simulateRestOfDay, netWorth, type SupplyId } from '../src/sim/economy.ts';

const days = Number(process.argv[2] ?? 14);
const s = newGame(Number(process.argv[3] ?? 42));
const targets: Record<SupplyId, number> = { lemons: 32, sugar: 24, cups: 80, ice: 250 };
for (let d = 0; d < days; d++) {
  for (const id of Object.keys(targets) as SupplyId[]) {
    while (s.inventory[id] < targets[id] && buySupply(s, id)) continue;
  }
  openStand(s);
  simulateRestOfDay(s);
  const t = s.today;
  console.log(`day ${t.day} ${t.weather.kind.padEnd(8)} ${t.weather.temp}F  passers ${t.passersby}  sold ${t.customers}  missed ${t.missed}  rev $${t.revenue.toFixed(2)}  rep ${t.reputationAfter}  cash $${s.cash.toFixed(2)}  worth $${netWorth(s)}`);
  nextDay(s);
}
