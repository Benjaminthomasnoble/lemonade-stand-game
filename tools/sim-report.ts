// Headless balance check: plays N days with a simple restocking policy.
// Usage: npm run sim -- [days] [seed]
//        npm run sim -- pacing [days] [maps] [classic|laidback|cutthroat|all] [-v] [--jobs N] [--keep DIR]: the pacing
//        harness (tools/pacing.ts), a headless player read against the spec's pacing targets and docs/spec/pacing.csv.
//        --jobs N plays the runs N at a time in child processes (each `pacing-run <days> <difficulty> <seed> [-v]`,
//        which prints its run as text) and prints the same report; progress goes to stderr. --keep DIR keeps each
//        played run there, and the same command again plays only the runs it doesn't have (a fresh DIR after a code
//        change). The full sweep on the shared machine, about 9 CPU-minutes a run:
//        nice -n 19 npm run sim -- pacing 170 10 all --jobs 2 --keep runs/ > sweep.txt 2> progress.txt
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  approveRepair, buildClubhouse, buySupply, canBuildClubhouse, maxPacks, newGame, openStand, PLOTS, rankFor, repairCost, selectedStand, simulateRestOfDay, sleepUntilDawn, stock, successScore, battleHeadline, playerStands, rebuildStand, type SupplyId,
  dayProfit, buyPlot, canBuyPlot, CLUBHOUSE, plotPrice, TIPS, type Difficulty,
} from '../src/sim/economy.ts';
import { clubhouseSite } from '../src/sim/clubhouse.ts';
import { hasClubhouse, hasStory, storyAct } from '../src/sim/story.ts';
import { pickTip, tipHand } from '../src/sim/perks.ts';
import { pacingPlan, pacingReport, playRun, runFromText, runToText, type PacingJob, type PacingPlan, type RunResult } from './pacing.ts';

const pacing = process.argv[2] === 'pacing' || process.argv[2] === 'pacing-run';
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
  // Lottie's Tips (perks.ts): like a player who takes the first card of each hand she deals, from the Rank lesson (Day 5).
  for (let h = tipHand(s); h && pickTip(s, h.cards[0]); h = tipHand(s)) console.log(`   dawn of day ${s.day}: Lottie's tip for rank ${h.rank}, ${TIPS[h.cards[0]].name}`);
  // Act 2: Dex pushes for a first Clubhouse (a story goal from Day 15; spec: Days 15-19), on the card or behind the
  // payback. It needs an empty Street plot of yours: the bot buys the cheapest open one once it can pay for the plot
  // and the Clubhouse both, then builds.
  if (hasStory(s) && storyAct(s) >= 2 && !hasClubhouse(s)) {
    const lot = clubhouseSite(s) ? null : PLOTS.filter((p) => p.type === 'street' && !s.plots[p.id].dibs?.table && canBuyPlot(s, p.id).ok).sort((a, b) => plotPrice(s, a.id) - plotPrice(s, b.id))[0];
    if (lot && s.cash >= plotPrice(s, lot.id) + CLUBHOUSE[0].cost && buyPlot(s, lot.id)) console.log(`   dawn of day ${s.day}: bought ${lot.name} for Dex's Clubhouse`);
    if (canBuildClubhouse(s).ok && buildClubhouse(s)) console.log(`   dawn of day ${s.day}: the first Clubhouse goes up for Dex`);
  }
  s.news.length = 0;
}

const jobKey = (j: PacingJob) => `${j.difficulty} ${j.seed}`;

/** Play a plan's runs `plan.jobs` at a time, each in a child process of this script (`pacing-run`), and hand them back
 * by job. A run's process inherits this one's niceness. With --keep, each played run is kept in that folder and a run
 * already there isn't played again. */
function playSplit(plan: PacingPlan): Promise<Map<string, { log: string[]; r: RunResult }>> {
  const out = new Map<string, { log: string[]; r: RunResult }>();
  const kept = (job: PacingJob) => join(plan.keep!, `${job.difficulty}-${job.seed}-${plan.days}${plan.verbose ? '-v' : ''}.json`);
  if (plan.keep) mkdirSync(plan.keep, { recursive: true });
  const queue = plan.runs.filter((job) => {
    if (!plan.keep || !existsSync(kept(job))) return true;
    out.set(jobKey(job), runFromText(readFileSync(kept(job), 'utf8')));
    return false;
  });
  if (out.size) process.stderr.write(`${out.size} of ${plan.runs.length} runs kept in ${plan.keep}\n`);
  const script = fileURLToPath(import.meta.url);
  const start = Date.now();
  const one = (job: PacingJob) => new Promise<void>((resolve, reject) => {
    const args = [...process.execArgv, script, 'pacing-run', String(plan.days), job.difficulty, String(job.seed), ...(plan.verbose ? ['-v'] : [])];
    const child = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'inherit'] });
    const chunks: Buffer[] = [];
    child.stdout.on('data', (c: Buffer) => chunks.push(c));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(`pacing-run ${jobKey(job)} exited with ${code}`));
      const text = Buffer.concat(chunks).toString('utf8');
      out.set(jobKey(job), runFromText(text));
      if (plan.keep) writeFileSync(kept(job), text);
      process.stderr.write(`[${out.size}/${plan.runs.length}] ${job.difficulty} map ${job.seed} played, ${Math.round((Date.now() - start) / 60000)} min in\n`);
      resolve();
    });
  });
  const worker = async () => { for (let job = queue.shift(); job; job = queue.shift()) await one(job); };
  return Promise.all(Array.from({ length: Math.min(plan.jobs, plan.runs.length) }, worker)).then(() => out);
}

if (process.argv[2] === 'pacing-run') { // one run of a split report: its days, difficulty and seed, and -v
  const [runDays, difficulty, seed] = process.argv.slice(3);
  const log: string[] = [];
  const r = playRun({ seed: Number(seed), difficulty: difficulty as Difficulty, days: Number(runDays), log: process.argv.includes('-v') ? (line) => log.push(line) : undefined });
  process.stdout.write(runToText(r, log));
} else if (pacing) {
  const args = process.argv.slice(3);
  const csv = readFileSync(new URL('../docs/spec/pacing.csv', import.meta.url), 'utf8');
  const print = (line: string) => console.log(line);
  const plan = pacingPlan(args);
  if (plan.jobs <= 1 && !plan.keep) pacingReport(args, csv, print);
  else {
    const played = await playSplit(plan);
    pacingReport(args, csv, print, (job) => {
      const run = played.get(jobKey(job))!;
      for (const line of run.log) print(line);
      return run.r;
    });
  }
}
