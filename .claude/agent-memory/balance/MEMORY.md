# Balance memory
- 2026-10-08 Run balance sims with `npx vitest run --config tests/balance/vitest.config.ts --disable-console-intercept` (root vitest only includes src/**; console hidden on pass otherwise).
- 2026-10-08 xpForLevel table: 1154 XP = level 10, NOT 15 (level 15 = xpForLevel(15)). Always use xpForLevel(), never OSRS constants from memory.
- 2026-10-08 My sim's xp/h included starting XP; subtract start xp when sims start above level 1.
- 2026-10-08 Coordinator rule: log each finding at once with a single `echo >>` line to docs/qa-log.md (`- HH:MM balance <topic> <numbers> <script>`); never rewrite; corrections are appended as new lines.
- 2026-10-08 Iron axe exists in data but no source in game (no shop/loot); only bronze reachable.
- 2026-10-08 Sim helper: real tickGathering/startGather + findPathToAdjacent on createWorldCollisionGrid() works; see tests/balance/woodcuttingPlacement.test.ts.
- 2026-10-08 Mining/fishing sim: tests/balance/miningFishing.test.ts (real tickGathering/tickFishing + path to booth 72,52). vitest filter arg re-runs whole tests/balance dir anyway (~70s); redirect to a file and read it.
- 2026-10-08 Fishing xp/h is a 2-4x outlier vs WC/mining (OSRS-like in isolation, but not the cross-skill feel); hud test caps fishing 99 at 16000 pure xp/h, so any fishing speedup must raise that cap. 1 hour = 6000 ticks.
- 2026-10-08 Throwaway proposal sims hardcoding content ids rot when data lands; delete them once the proposal is applied (miningFishing.test.ts is the standing fishing sim). Spot xp/h from its table: net L1/15/30/60/99 = 3620/5702/8930/11802/15738; bait (L5 min) L5/15/30/60/99 = 5916/7548/9512/12541/16149.
