# animation memory
- 2026-10-08: NEVER do break-and-restore proof edits (or perl multi-step edits) on the live file: Vite hot-reloads the user's game. I left data.ts uncompilable for ~1 min. Prove tests fail on a scratch copy or with one atomic edit, and run `npx tsc --noEmit` after every save.
- 2026-10-08: Motion mode is an explicit param (MotionMode 'on'|'reduced', MOTION table in data.ts); the animator never reads matchMedia, the integrator passes the preference.
- 2026-10-08: Import graphics via `@render/index` (not `../views` or `@render`); `facingScaleX` isn't exported there, so the flip is inlined (`left ? -1 : 1`).
- 2026-10-08: Use PlayerView.body, facingScaleX and TreeView.colors from @render/index (graphics added them); overlay rig sits at container index 1.
- 2026-10-08: macOS sed -i needs a suffix; use perl -pi for edits.
- 2026-10-08: State machine = priority table in data.ts + nextAnimState in logic.ts; new skills add a GATHER_STATE_BY_TOOL entry + state def, not branches.
- 2026-10-08: Added MotionMode 'off' as data only (chopStyle 'static', fallMs/regrowMs 0; treeAnim returns early on 0 ms). Never put backticks in a perl -e double-quoted string (shell runs them); use heredocs. Mutation checks done in the scratchpad copy via `vitest run --root`. `npm run build` can fail from other agents' in-progress app/ edits; check `tsc | grep animation` to isolate.
