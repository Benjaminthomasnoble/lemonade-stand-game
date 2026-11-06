// Headless smoke test (run `npm run build` first).
// Starts `vite preview`, plays one day through the UI and window.__game,
// checks the save survives a reload, and writes screenshots to test-results/.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const PORT = 4173;
const base = process.env.SMOKE_URL ?? `http://localhost:${PORT}/`;
mkdirSync('test-results', { recursive: true });
const server = process.env.SMOKE_URL ? null : spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', '--base', '/'], { stdio: 'ignore' });
const fail = (msg) => { console.error('SMOKE FAIL:', msg); server?.kill(); process.exit(1); };

try {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(base)).ok) break; } catch { await new Promise((r) => setTimeout(r, 200)); }
  }
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${base}?seed=42`);
  await page.waitForSelector('body[data-ready="1"]', { timeout: 30000 });
  await page.waitForSelector('[data-testid="prep"]');
  console.log('backend:', await page.evaluate(() => window.__game.backend));

  for (const id of ['lemons', 'lemons', 'sugar', 'cups', 'ice', 'ice']) {
    await page.click(`[data-action="buy"][data-id="${id}"][data-packs="1"]`);
  }
  await page.screenshot({ path: 'test-results/1-prep.png' });
  await page.click('[data-testid="open"]');
  await page.waitForSelector('[data-testid="daybar"]');
  await page.click('[data-action="speed"][data-value="4"]');
  await page.waitForTimeout(6000);
  const mid = await page.evaluate(() => ({ crowd: window.__game.crowd(), sold: window.__game.state.today.customers }));
  console.log('mid-day:', mid);
  await page.screenshot({ path: 'test-results/2-open.png' });
  if (mid.crowd === 0) fail('no pedestrians on screen');
  await page.evaluate(() => window.__game.fastForward(10000));
  await page.waitForSelector('[data-testid="report"]');
  await page.screenshot({ path: 'test-results/3-report.png' });
  const s = await page.evaluate(() => window.__game.state);
  console.log(`day ${s.day}: sold ${s.today.customers}, cash $${s.cash}`);
  if (s.today.customers === 0) fail('sold nothing');
  await page.click('[data-testid="next"]');
  await page.waitForSelector('[data-testid="prep"]');
  // Reload without the seed so the saved game loads.
  await page.goto(base);
  await page.waitForSelector('body[data-ready="1"]');
  const day = await page.evaluate(() => window.__game.state.day);
  if (day !== 2) fail(`save did not persist (day ${day})`);
  if (errors.length) fail(errors.join('\n'));
  await browser.close();
  console.log('SMOKE OK');
} catch (e) {
  fail(e);
}
server?.kill();
