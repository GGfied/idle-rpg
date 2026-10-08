---
name: tooling
description: Scaffold decisions and gotchas (versions, audit, ESLint flat config, build without index.html)
metadata:
  type: project
---

- 2026-10-08: Node 20.18.1 -> Vite 6.4 + Vitest 4.1 (Vitest 3.x has critical tinypool audit findings; 4.x is clean and supports Vite 6). Pin with `npm i -E`.
- 2026-10-08: ESLint flat config: later matching blocks REPLACE `no-restricted-imports` entirely, so each zone must restate the full rule. Verified with throwaway bad files, then delete them.
- 2026-10-08: Prove tests fail by mutating source with sed, and ALWAYS restore (I once left tick.ts mutated; prettier hid it). Re-run tests after restoring.
- 2026-10-08: `build` is `tsc --noEmit` until integrator adds index.html; integrator must restore `tsc --noEmit && vite build`.
- 2026-10-08: Events are a discriminated union per module, unioned in app/registry (no declaration merging). Rng interface lives in contracts so core/skills/utils need no engine import.
- 2026-10-08: Check existing enum/reason ids and how callers surface them (startGather errors already become gatherStoppedEvent in app) before adding new ones; B1 needed no new id or app change. "Fits" for weighted yields = any positive-weight yield fits.
- 2026-10-08: Adding fields to an emitted event breaks other modules' exact `toEqual` tests (woodcutting logic.test.ts did); grep `src` for the event type before changing and name owners in the report. startGather returns Result<_, reason> with no event, so extra event data needs an exported builder (`gatherStoppedEvent`) callers use.
- 2026-10-08: Ticker.update ignores nowMs <= last (never moves last back). Prove-can-fail on untracked files: git stash doesn't work; copy to scratchpad, mutate, restore. Discriminating case needs a time after the stale one that differs between buggy/fixed (e.g. 1000, 400, 1600).
- 2026-10-08: ESLint flat config lints .mjs by default; Node globals via /* global */ comments in file clash with config globals (no-redeclare) - declare only ones the files don't. macOS sed -i needs '' (use python for edits); no `timeout` cmd on macOS. `e2e` script = node tests/e2e/smoke.mjs (no run.mjs).
- 2026-10-08: Requirement evaluation lives in contracts/requirements.ts (`evaluateRequirement(req, RequirementContext)`); Requirement gained optional `hidden`/`hint`. Adding to a union via `(A|B) & {...}` keeps narrowing working. Mutants via rsync copy + sed in scratchpad worked well.
- 2026-10-08: screenshots are gitignored via /*.png, tests/e2e/**/*.png, **/.shots*/ (no real PNGs are tracked; if a root-level PNG asset is ever needed, add a negation).
- 2026-10-08: Lint was never 5 min of work: ~20s CPU (eslint 8.5s + prettier 9.7s user, 616 files, no type-aware rules); wall time was machine load 100-150 starving CPU. Fix = cache both + run in parallel (scripts/lint.mjs). Measure user vs wall before hunting waste. Another agent's unformatted tests/e2e file can fail lint; not a tooling fault.
