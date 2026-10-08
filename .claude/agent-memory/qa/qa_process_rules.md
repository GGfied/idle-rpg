---
name: qa-process-rules
description: QA process, isolation, ports, mutation-proof and reporting rules (merged from many runs, 2026-10-08)
metadata:
  type: feedback
---

Process and isolation (newest first within each group).

## Ports, servers, processes
- 2026-10-08: LIVE runs use the shared warm server: `node tests/e2e/warmServer.mjs` (idempotent, :5300, pid file $TMPDIR/idle-rpg-warm-5300.pid, `... stop` kills it), then `E2E_SHARED=1 node tests/e2e/<x>.e2e.mjs` (or E2E_URL=...). lib.mjs then starts no vite. Mutants still use their own port+100 server from mut_<slice> (cacheDir already persists per root+port, so a 2nd mutant run is warm). `E2E_TIMING=1` prints game-ready ms. Measured idle machine: cold own vite = 0.4 s up + 0.64 s ready, so the 5 min is the test body (sleeps/reloads), not boot; check that first.
- lsof BEFORE launching any server: if `lsof -nP -iTCP:<port> -sTCP:LISTEN` prints ANYTHING, abort and pick another port (read the output; I ran anyway 5 times and a mutant "passed" against another agent's server). Mutant port = slice port + 100, verify its cwd is the scratch dir. Use unique E2E_PORT/MM_PORT per mutant.
- Every script spawning vite MUST use `--config tests/e2e/vite.frozen.config.mjs` (cacheDir in os.tmpdir per port). CRITICAL: a shared node_modules/.vite re-optimise crashed the user's live :5173 HUD (useContext null). Check node_modules/.vite/deps/_metadata.json mtime unchanged after a run. Plain vite also made other agents' HMR edits cause mid-run 500s/stale camera.
- Kill only your own PIDs (cdp.mjs profiles `idle-rpg-e2e-<nodePid>-`, launchChrome prints Chrome PID). Never pkill/killall/`pkill -f idle-rpg-e2e-` (hung 7 slices once). A fatal exit can leak your vite: kill by PID. `ps` shows other agents' Chromes: judge "mine" by profile dir removed + port free.
- Run e2e in the foreground, tee to a file (never pipe through tail/head on the first run: a 15/17 flake lost its failing lines). End with killTracked(); process.exit(code), 6 min unref hard timeout.
- Cold vite first run times out at "game ready" (25 s): WARM the server before any timed run, then rerun (cost me runs repeatedly; counted against the 2-run cap).
- Shared scratchpad `mut` dir can be wiped by another agent: use mut_<slice>, one unique dir per mutant, never shared.

## Mutation proofs
- Only in a scratchpad copy (recipe: rsync -a --exclude node_modules --exclude dist --exclude '.shots*' (quote in zsh) then ln -s node_modules); never the live tree. Break and restore via python replace (`assert old in s` first; BSD sed -i needs '' and no \n).
- A mutant must exercise the exact clause changed: pair a "fixed axis" mutant with a "shrunk swing" mutant when a floor/threshold changes.
- Oracles must be INDEPENDENT of the mutated code: hardcode anchors (not read from mutated WORLD_DEF), recompute bounds from isoProjection, import tuning constants (BAIT_STACK) rather than hard-code; a key mutant on itemIconSource is circular.
- A guard with two layers only goes red if BOTH are mutated (savingEnabled + canSave). Phaser camera bounds also clamp, so mutating panCamera clamp alone is not red. Mutant that breaks area load shows as "ready timeout": shift the thing instead.
- A baseline needs two clean reruns before being trusted as a mutation baseline (isoTap '17/17').
- Vitest: `--root $SCRATCH/mut <file>`; never `vitest --root /` (scans disk); it swallows console.log (use process.stdout.write); `it.fails` = xfail. xfail in check(): known bug prints XFAIL, XPASS fails the run; remove xfail by editing opts then prettier --check.

## Diagnosis habits
- Flaky first tap / stale points = harness bug first (camera still easing; use waitStill), then app. An undefined import mid-run on phone = Vite HMR from another agent's edit: rerun once, say so.
- A failing e2e is often my selector: check before filing a bug. Re-measure rects before EVERY tap after scrollIntoView. check() auto-closes overlays, so each check reopens its own panel.
- Restore toggled state in finally (a throw left Minimap off and cascaded). Clear idle-rpg:prefs between viewport phases. Print rects/elementFromPoint on failure.
- Load-dependent thresholds flake (rAF ~22 fps while others run; frames>150 lowered to 90; per-frame speed 35% flake): normalise by dt, rerun once, never loop reruns of a deterministic failure (report it).
- Spy-on-draw oracles need unit calibration first; put measured numbers in the PASS note so tolerance is evidence-based (worldmap cost 3 reruns).
- Assert TOTALS (countItem) not slot quantities; load fixtures raw. Select content by kind/name, never index. Store walkTo only for TRAVEL; real input for the behaviour under test.
- A prompt "expected" that REMOVES user-visible behaviour must be checked against runbook/user requests, flag instead of asserting (axeSound: per-swing chat line + sound is the user's explicit request).
- A qa run is not done until `npm run lint` passes on the e2e files I added.
- Append a line to docs/qa-log.md right after every run (user rule), plus docs/agent-progress.md at milestones.
- Use absolute paths; never `cd X && sed`; macOS: no `timeout`, sed -i '', ugrep -E, zsh `echo ==` errors. Python heredocs writing JS template literals: do NOT escape backticks. Build tee/log paths from the absolute scratchpad dir, no `../`.
- Make test baselines/screenshots: SHOTS_DIR dir is shared across slices; set `process.env.SHOTS_DIR ??= tests/e2e/.shots-<name>` (gitignored). Pass `vp` from forEachViewport's 2nd argument into shot names (g.viewportName stays "desktop").
- Screenshots cannot catch frames shorter than ~100 ms: use the numeric in-page hook.
- Gait/rig checks: compare arms to legs as a RATIO (rotation rig gives arms ~62% of leg travel; an absolute px floor false-FAILed); unwrap tool angles at +-180 deg before peak-to-peak.
- Tests under src/app can't import core fixture files (lint boundary): readFileSync(process.cwd()+path) or `import.meta.glob('/src/.../x.json',{eager:true,query:'?raw',import:'default'})`.
- Unit-test helpers: test-utils has runTicks(state, stepFn, n, rng, startTick) (continue tick numbering) and contentRefs. Normal trees fall after 1 log (respawn 12 ticks); scriptedRng([0]) always succeeds. Icon tests compare each svg path's fill+d (Vite returns minified data: URLs).
- 2026-10-08 (main session, overrides the E2E_SHARED note): do NOT use the shared :5300 server for verification. It does not watch files, so it serves code from when it started, which can be older than the fix under test. Measured gain is only ~1 s (boot 0.6 s cold), so the stale-code risk is not worth it. Each slice starts its own frozen-config server. Slice time is the test body (sleeps, real-time ticks, viewport loops) and reruns from script bugs, not server boot.
- 2026-10-08: don't run `npm run test` while e2e/mutant runs or animation agents are editing; a mid-edit or loaded run flaked `playerAnimator.test.ts` "walk bob is multiplied by ART_SCALE" once. For examine/menu tests copy the right-click/long-press pattern from `lockedMenu.e2e.mjs`.
- 2026-10-08: a scratch-copy mutant needs its own copy of `tests/e2e/lib.mjs` (lib resolves ROOT from its own location), so run the scratch copy's own e2e script.
- 2026-10-08 (rodRest): macOS sed has no `\b`; write mutants with perl and confirm the replacement count with grep BEFORE running. A `cd` into a missing scratch dir silently runs the "mutant" on the live tree, so check the count. Clear keep-alive intervals at the start of each check, or a failed check breaks the next one.
- 2026-10-08: orphaned run-all: kill the runner PID FIRST (-9), else it spawns the next file; children reparent to 1 so pgrep -P fails, kill by `pkill -f idle-rpg-e2e-<childpid>-` (that exact profile dir) + the listed vite PIDs. Full suite (86 files) = 6100 s of work: 4 jobs 1585 s; budget needs per-file cuts, not just parallelism.
- 2026-10-08: frozen vite config must define __APP_VERSION__ like vite.config.ts (footer test saw "dev").

## Q3-B e2e speed lessons (2026-10-08)
- macOS has no `timeout` command (exit 127, nothing runs): rely on the harness watchdogs, never prefix `timeout`.
- tests/e2e/splitViewports.mjs: `const VPS = await splitViewports(import.meta.url, PORT, ['desktop','phone'])` then loop/forEachViewport over VPS. Parent spawns one child per name (E2E_VP, E2E_PORT=base+i, own vite+Chrome), exits with the worst code. Names may be checks (newfish c1a..c2b, oakTuning rate, respawn tree/copper/coal, rodRest desktop-front...). Use for any file whose wall time is a sum of independent viewports/checks; keep within the 4-port run-all block. Phone-only child has no document: guard localStorage evals with .catch. Each child prints its own SUMMARY.
- At ?tickMs=60 a gather (chop/mine) session ends in ~1 s before the first hit: use 120-200 ms ticks (swing-gap thresholds scale by tick/600) or a re-tap keep-alive when idle.
- Cheap wins: wait on state not fixed sleeps (minimap frame-stable poll instead of 2.7 s settle); wheel notches clamp at x1.57 so 6 notches reach zoom limits (not 40/90); raise skill level when the check is not about success rate; statistical checks need only one viewport.
- 2026-10-08 Q3-C2: python str.replace edits to a prettier-formatted file silently no-op when indentation differs (a discriminating patch vanished): ALWAYS assert the pattern is in the text; re-grep after prettier. Machine load avg 100-390 (other agents) makes wall budgets unmeasurable: report load next to every timing, sum per-check E2E_TIMING instead.
- 2026-10-08 Q3-C2: rAF-timestamp speed sampling is a load flake: position is placed at the scene's update via performance.now(), so stamp performance.now() at scene 'update' and read at 'render' (worst dev 0.6% vs 9-190% for rAF stamps). Sliding-along-the-diamond clamps never "stop" (do not use a flat-centre stop rule); stop on k>=0.97.
- 2026-10-08 Q3-C2: v1 chop impact comes from the animator after the walk trail settles: wait scene.animState==='chop', then g.synth.freeze + page-side step+sample loop. Fishing spot hop timer = game.fishing.spots[id].moveTimer.respawnAt (0 = hop next tick, 1e9 = never). Ring-pool starvation shows only when ALL 4 spots hop at once.
- 2026-10-08 (Q4): wall times at load avg 150-300 are CPU-contention noise (same file 10-50 s); compare old vs new file interleaved at SAME load, never against a quiet-machine number. Shared Chrome contexts + shared vite were slower at low load (netAnim 13 vs 37 s) and not behaviour-identical (touch drag); never edit cdp.mjs/lib.mjs live mid-run, develop in a copy and swap once (parked 3 lanes).
