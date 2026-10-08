# QA memory index (compacted 2026-10-08; detail lives in topic files)

- [Process rules](qa_process_rules.md) — ports/lsof, frozen vite cacheDir, mutation proofs, diagnosis habits, reporting, gait ratio/angle rules
- [Harness + CDP](qa_harness_cdp.md) — lib.mjs/cdp.mjs usage, phone input quirks, tick control, in-page hooks, selectors, audio spies
- [World/render e2e notes](qa_e2e_world_render.md) — per-feature ports/oracles/mutants: camera, ground, water, trees, minimap, animation, gait, vfx
- [Gameplay/UI e2e notes](qa_e2e_gameplay_ui.md) — per-feature ports/oracles/mutants: gathering, fishing, mining, bank, inventory, dialogue, saves

## Top rules (read before every task)
- 2026-10-08: if `lsof -nP -iTCP:<port> -sTCP:LISTEN` prints anything, ABORT and pick another port (mutants silently hit other agents' servers 5 times).
- 2026-10-08: every vite for tests uses tests/e2e/vite.frozen.config.mjs (own cacheDir); warm it before a timed run (cold "game ready" 25 s timeout).
- 2026-10-08: kill only your own PIDs, never pattern-kill; run e2e foreground, tee to a file, exit via killTracked(); process.exit.
- 2026-10-08: mutants only in a scratchpad copy (mut_<slice>), on port+100, with an independent oracle; the mutant must hit the exact clause changed.
- 2026-10-08: log every run to docs/qa-log.md immediately; milestones to docs/agent-progress.md; lint my e2e files before reporting.
- 2026-10-08: new tests copy tests/e2e/TEMPLATE.e2e.mjs and use lib.mjs; flaky first tap = harness stale point (waitStill) before app bug.
- 2026-10-08: zsh has no PIPESTATUS (use pipestatus or redirect to file then $?); a bogus 'exit 1' may be a shell artefact, verify harness exit via a scratch runMain+report script (pass 0 / fail 1).
