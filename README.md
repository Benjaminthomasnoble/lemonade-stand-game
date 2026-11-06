# Lemonade Stand Wars

A browser tycoon game: start with one lemonade stand, grow it into an empire, and defend it from rival stands.

**Play:** https://benjaminthomasnoble.github.io/lemonade-stand-game/

## Status

Milestone 1 of 5 is playable: one stand and the daily economy loop.

1. ✅ One stand and the economy loop (supplies, recipe, price, weather, reputation, day report, saves)
2. Stand and marketing upgrades
3. Rivals, defenses and guards
4. Buying territory
5. Helicopter and ship clients

## Stack

three.js r187 (`WebGPURenderer`, falls back to WebGL 2), Vite + TypeScript, HTML/CSS UI, saves in `localStorage`. Every model is built in code. Fully agent-buildable: everything is text, builds and tests run from the command line.

```
src/sim/      deterministic economy (no DOM; runs in Node and tests)
src/world/    three.js scene, stand, pedestrians
src/ui/       HUD and panels
tools/        smoke.mjs (Playwright), sim-report.ts (balance check)
```

## Commands

```
npm install
npm run dev        # local dev server
npm test           # economy unit tests (Vitest)
npm run build      # type-check + production build
npm run smoke      # headless Playwright playthrough of one day (after build)
npm run sim -- 14  # print a 14-day balance run
```

`?seed=123` in the URL starts a fresh seeded game. `window.__game` exposes state and actions for tests and agents.

## Hosting

Every push to `main` runs tests, builds, and deploys to GitHub Pages (`.github/workflows/deploy.yml`).
