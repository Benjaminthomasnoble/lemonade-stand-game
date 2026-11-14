// Bake the clay portraits (bosses and scene speakers) into public/faces/<id>.png from the real figure builders.
// Run: npm run bake:faces. Re-run after changing a boss or townsperson look in src/world/clay/.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
const root = new URL('..', import.meta.url).pathname;
const port = 4190;
const server = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { stdio: 'ignore', cwd: root });
try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`http://localhost:${port}/`)).ok) break; } catch { await new Promise((r) => setTimeout(r, 250)); } }
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('page error:', String(e)));
  await page.goto(`http://localhost:${port}/tools/faces/bake.html`);
  await page.waitForSelector('body[data-done="1"]', { timeout: 300000 });
  const faces = await page.evaluate(() => window.__faces);
  mkdirSync(`${root}public/faces`, { recursive: true });
  for (const [id, url] of Object.entries(faces)) {
    writeFileSync(`${root}public/faces/${id}.png`, Buffer.from(url.split(',')[1], 'base64'));
    console.log(`public/faces/${id}.png`);
  }
  await browser.close();
} finally { server.kill(); }
