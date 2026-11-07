// Headless balance check: plays N days with a simple restocking policy.
// Usage: npm run sim -- [days] [seed]
//        npm run sim -- pacing [days] [maps] [classic|laidback|cutthroat|all] [-v]: the pacing harness (tools/pacing.ts),
//        a headless player read against the spec's pacing targets and docs/spec/pacing.csv
import { readFileSync } from 'node:fs';
import {
  approveRepair, buildClubhouse, buySupply, canBuildClubhouse, maxPacks, newGame, openStand, PLOTS, rankFor, repairCost, selectedStand, simulateRestOfDay, sleepUntilDawn, stock, successScore, battleHeadline, playerStands, rebuildStand, type SupplyId,
  dayProfit, buyPlot, canBuyPlot, CLUBHOUSE, plotPrice,
} from '../src/sim/economy.ts';
import { clubhouseSite } from '../src/sim/clubhouse.ts';
import { goalsNow } from '../src/sim/goals.ts';
import { pacingReport } from './pacing.ts';

const pacing = process.argv[2] === 'pacing';
const days = pacing ? 0 : Number(process.argv[2] ?? 14);
const s = newGame(Number(process.argv[3] ?? 42));
const targets: Record<SupplyId, number> = { lemons: 50, sugar: 100, ice: 360 };
for (let d = 0; d < days; d++) {
  for (const id of Object.keys(targets) as SupplyId[]) {
    const st = selectedStand(s);
    while (stock(st, id) < targets[id] && maxPacks(s, st, id) > 0) buySupply(s, id);
  }
  openStand(s);
  // Like a player with the Damaged ticket's Repair button (Auto-Repair does it from Rank 3): book the fixes for a Storm's
  // dent at the open or last night's raid, so the stand opens at dawn as good as new.
  const repairs: string[] = [];
  for (const p of PLOTS) {
    const cost = repairCost(s, p.id);
    if (s.plots[p.id].owner === 'player' && approveRepair(s, p.id)) repairs.push(`   repair: ${p.name} booked for tonight, $${cost}`);
  }
  simulateRestOfDay(s);
  const t = s.today;
  const w = t.walkedPast;
  const profit = dayProfit(t); // the Ledger's profit: supplies as used, not as bought
  console.log(`day ${String(t.day).padStart(2)} ${t.weather.kind.padEnd(8)} ${t.weather.temp}F  passers ${t.passersby}  sold ${t.customers}  out ${w.soldOut} line ${w.line} pricey ${w.pricey} rival ${w.rival}  profit $${profit.toFixed(2)}  rep ${s.reputation}  cash $${s.cash.toFixed(2)}  SS ${successScore(s)} ${rankFor(successScore(s)).title}`);
  for (const line of repairs) console.log(line);
  const before = s.battles.length ? s.battles[0] : null;
  sleepUntilDawn(s);
  if (s.battles[0] && s.battles[0] !== before) console.log(`   night: ${battleHeadline(s.battles[0])}`);
  for (const p of playerStands(s)) if (s.plots[p.id].stand!.wrecked) rebuildStand(s, p.id);
  // Act 2: Dex pushes for a first Clubhouse (a story goal from Day 15; spec: Days 15-19). It needs an empty Street plot of
  // yours: the bot buys the cheapest open one once it can pay for the plot and the Clubhouse both, then builds.
  if (goalsNow(s).some((g) => g.text === 'Build Dex a Clubhouse' && !g.done)) {
    const lot = clubhouseSite(s) ? null : PLOTS.filter((p) => p.type === 'street' && !s.plots[p.id].dibs?.table && canBuyPlot(s, p.id).ok).sort((a, b) => plotPrice(s, a.id) - plotPrice(s, b.id))[0];
    if (lot && s.cash >= plotPrice(s, lot.id) + CLUBHOUSE[0].cost && buyPlot(s, lot.id)) console.log(`   dawn of day ${s.day}: bought ${lot.name} for Dex's Clubhouse`);
    if (canBuildClubhouse(s).ok && buildClubhouse(s)) console.log(`   dawn of day ${s.day}: the first Clubhouse goes up for Dex`);
  }
  s.news.length = 0;
}
if (pacing) pacingReport(process.argv.slice(3), readFileSync(new URL('../docs/spec/pacing.csv', import.meta.url), 'utf8'), (line) => console.log(line));
