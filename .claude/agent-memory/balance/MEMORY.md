# Balance memory
- 2026-10-08 Run balance sims with `npx vitest run --config tests/balance/vitest.config.ts --disable-console-intercept` (root vitest only includes src/**; console hidden on pass otherwise).
- 2026-10-08 xpForLevel table: 1154 XP = level 10, NOT 15 (level 15 = xpForLevel(15)). Always use xpForLevel(), never OSRS constants from memory.
- 2026-10-08 My sim's xp/h included starting XP; subtract start xp when sims start above level 1.
- 2026-10-08 Coordinator rule: log each finding at once with a single `echo >>` line to docs/qa-log.md (`- HH:MM balance <topic> <numbers> <script>`); never rewrite; corrections are appended as new lines.
- 2026-10-08 Iron axe exists in data but no source in game (no shop/loot); only bronze reachable.
- 2026-10-08 Sim helper: real tickGathering/startGather + findPathToAdjacent on createWorldCollisionGrid() works; see tests/balance/woodcuttingPlacement.test.ts.
