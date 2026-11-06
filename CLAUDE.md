# Lemonade Stand Wars: notes for agents

Start with `docs/HANDOFF.md` (what's built, what's next, working rules), then the spec in `docs/spec/` (`design-spec.md` is the source of truth; `canon.md` and `balance-tables.md` hold the rules and numbers).

- Push straight to `main`; it deploys to GitHub Pages.
- Check before pushing: `npx tsc --noEmit && npm test && npm run build && npm run smoke`.
- `src/sim/` is a pure, seeded simulation (no DOM). `src/world/` is three.js, `src/ui/` is the HUD.
- Keep tunable numbers in `src/sim/balance.ts`, `src/sim/vip.ts` and `src/sim/rivals.ts` in step with `docs/spec/balance-tables.md`.
