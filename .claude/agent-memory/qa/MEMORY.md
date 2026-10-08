# QA memory (core rules live in .claude/agents/qa.md; full old text: docs/archive/agent-memory-qa-2026-10-09.md)
Topic files: qa_process_rules.md, qa_harness_cdp.md, qa_e2e_world_render.md (per-feature ports/oracles), qa_e2e_gameplay_ui.md.

## Ports, servers, load
- Never use port 6000 (bad port); use 6001+. E2E_PORT overrides hard-coded ports.
- Warm the frozen vite before a timed run (cold boot hits the 25 s 'game ready' timeout). A killed split child can orphan its vite: lsof your ports again.
- Mutant runs set SHOTS_DIR (default .shots-* is cwd-relative) and default shots go to tests/e2e/.shots-<name>, never repo root. Don't point ground's SHOTS_DIR at a fresh dir (seam shots ENOENT).
- rc=1 with a child's "N PASS, 0 FAIL" = a sibling child died or parent wall > budget: check every child's SUMMARY / `vite did not start`.
- run-all: default 2 jobs + load1 gate (RUN_ALL_MAXLOAD); higher JOBS self-inflicts load 300+. Reds with launchChrome/GAME_READY_TIMEOUT/E2E STUCK are load, rerun alone to sort flake vs real. Wait on the node PID (`pgrep -x`), not `pgrep -f run-all` (matches your shell).
- cpuGate: Chrome cap via ps alone overshoots (spawn shows ~1 s late): check+claim under a mkdir lock with claim files; slide deadlines by waited ms and heartbeat every 30 s. vitest include is src-only (tests/e2e/*.test.mjs added in vite.config.ts).

## Harness + test writing
- runParallel: set VIEWPORTS.<name> before runParallel and branch on the combo name for extra viewports/splits; use withCombos (one load); spies go in withGame({initScripts}).
- Wait helpers eval raw expressions (a `window.__t.` prefix + catch turns waits into silent timeouts). Wait on the specific expected value, never "present" (returns on the old state). 'Label drawn AND still' beats 'still'.
- Measure durations in game ticks via an in-page store.subscribe recorder; tick-cadence checks never poll wall clock. Short actions (3-tick fire light = 180 ms at 60 ms ticks) need a per-frame postupdate recorder; acting inside such a window is a justified g.realTime.
- Pose sampling: in-page waiter freezes (`__e.synth.freeze()`) on the first frame the state holds, then step frames synchronously; freeze BEFORE the store action to catch a short state. Bursts: one drawImage frame sheet, not N screenshots. Trim windows must shrink at fast ticks.
- Pixel oracles: read each frame once into ImageData (not getPixelAlpha per pixel); decode synth frames in-page, not python.
- Game-time UI lifetimes (tracker untilMs) shrink 10x at 60 ms ticks: capture on the event frame. Fast ticks change walks (intermediate area banners, spot hops): judge per segment/frame.
- "Nothing saved" checks: spy the runtime 1000 ms debounce timer; a mutant must remove BOTH guards (runtime savingEnabled + manager canSave).

## Input, camera, HUD gotchas
- Flaky first tap = stale point: g.settle()/waitStill before picking AND tapping (camera easing after walks/viewport switch).
- Taps use isoProjection.tileToWorld, never flat tile*32. After a revert-bisect gives identical reds, check the test's own assumptions first.
- Phone HUD boots folded: slots are 0x0 until a real `.sheet-fold` tap (`.hud[data-folded]`); fold again before canvas taps; chat starts minimized (`.chat-toggle`).
- After a drag-pan the camera stays detached; a store teleport doesn't recentre (only a walk). Camera settle watches fractional scrollX/Y; reproduce glide with camera.lerp.set(0.02,0.02).
- Settings radio: `button[aria-label=Settings]` -> scrollIntoView `.settings .steps` radio by label -> tap -> `Close settings`.
- Dialogue: typewriter needs 2 clicks to reach choices; textContent includes the hidden rest span, so wait on talk nodeId / `.dialogue-continue[data-typing]` / `.dialogue-main` innerHTML.
- Nameplates: HUD keep-out shift allowed only for labels touching HUD rects (cap parsed from src); pan over a static entity (Banker 12,9). layoutLabels draws under-player labels at alpha 0.4 and prefers coin icon: spy globalAlpha.

## Game facts
- Chopping: a successful swing posts the log line, not the swing line; "You swing your axe" posts at impact (~2 s real), so at 60 ms ticks wait on session/log state. Oak falls after 1/8 logs; count attempts, keep-alive re-tap, confirm the tap started a session. Plan taps after every tree is standing (stumps plan 'ground').
- place()-style preconditions also clear pendingInteraction (re-tap on the same node is ignored while set).
- Fire: lit 3 ticks, burn 100-150. Run energy +45/tick vs 100 makes refusal checks a justified realTime.
- Sound spies record the frequency ramp target (spotBurble rising 500 Hz vs fishCast falling 520->220); footsteps add random-pitch bandpass nodes (filter integer Hz). Reduced tap fires once per 4-tick swing. Oscillator spies catch ambient music (triangle 220 Hz): pair a sound with its chat line (in-page store.subscribe recorder, <=100 ms). Skip-every-2nd mutant for per-swing sounds (skip-first still passes).
- 2026-10-09 (S1 shared vite): a static build can't serve e2e (67 files import /src/... modules by path in-page), so run-all shares ONE dev server + warmPage.mjs. Measured: boot-to-ready 29% of file time (735 of 2542 s over 103 logs), checks 71%. zsh does not word-split $VAR (use arrays); SIGTERM on run-all left its vite (handler added); Chrome CPU-gate queueing counts in file wall, so BUDGET reds under it are queueing.
- Reload races: Page.reload then ready() can read the OLD page. Set window.__oldPage=1 first, wait '!__oldPage && __idleRpg?.store' then ready(). A mutant removing the save needs Storage.prototype.setItem no-op too (unload re-saves). (seen: playerLook c6, smoke e)
- Reload-in-test: set window.__preReload=1 before Page.reload and wait for it undefined && ready() (ready() is true on the old page, settle then hits an unbooted scene). g.load() wipes storage, so seed prefs after load then reload. Brave via CHROME_PATH works; Emulation.setEmulatedMedia prefers-reduced-motion persists across reload.
