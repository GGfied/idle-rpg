# QA run log (append-only, real time)

Every qa agent appends ONE line here the moment a run finishes (pass, fail, killed or mutant), before doing anything
else, so no result is lost if the session dies. The main session folds new lines into `docs/qa-coverage.md` as they
land. Never edit or delete earlier lines.

Format: `- HH:MM <slice> <viewport> <live|mutant:what> <N/M pass> <failing check ids or "-"> <log file path> <note>`
Append with a single shell `>>` (e.g. `echo "- $(date +%H:%M) isoTap phone live 17/17 - /path/log.txt" >> <abs path>`),
never by rewriting the file (parallel agents append at the same time).

Older lines: `docs/archive/qa-log-2026-10-08.md`.

- 01:09 gate run-all desktop+phone live 8/103 files ok, 95 red (mostly load/harness, see report) /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/16ed089b-4257-46ea-afe5-e719c11205d7/scratchpad/ra/summary.txt wall 4088s load 300-460 self-inflicted, JOBS=6
- 01:16 cookingTree desktop+phone live 15/15 pass - scratchpad/c1.log Food branch 8 nodes, 3 locked ok (~30s, load ~100)
- 01:16 cookingTree desktop+phone mutant:cooking SOURCES removed 14/15 each, u3-cooking red (no cooking tree), lint ok
- 01:20 gate rerun named files (JOBS=2, load 60-190) 1/9 ok (fishChat); bigWorld/camJerk/cookPose/isoTap/roofs/smoke real-or-flaky reds, worldEdge+visualSmoke GAME_READY/GLOBAL timeouts /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/16ed089b-4257-46ea-afe5-e719c11205d7/scratchpad/ra2
- 01:32 run-all-jobs harness live 4/6 files ok fishChat,gait (real-time files, load1 peak 612 from other agents; start load 130-280) /var/folders/26/f7pn00x1383b7g5777sw3g4h0000gq/T/idle-rpg-run-all default JOBS=2 + load gate
- 02:17 gate-R2 run-all both 93/103 ok, wall 2589s, peak load1 72 (gate 12) axeSound camJerk depositChest fishing ground isoTap nameplateClampPlay newfish playerLook smoke /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/16ed089b-4257-46ea-afe5-e719c11205d7/scratchpad/r2
- 02:24 gate-R2 rerun-alone: pass depositChest newfish playerLook camJerk fishing ground; fail axeSound(t1,t5) isoTap(gap-tree_10,t-tree_9-trunk desktop) nameplateClampPlay(p3) smoke(c,d) /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/16ed089b-4257-46ea-afe5-e719c11205d7/scratchpad/r2b
- 02:34 nameplateClampPlay all6 live 42/42 pass - /var/folders/26/f7pn00x1383b7g5777sw3g4h0000gq/T//np.log stale p3 oracle fixed (keep-out allowance only near .topright/.tabs/.chatbox, cap parsed from labelKeepOut.ts), drag-pan at Banker (12,9); 43 s at load 57
- 02:49 B1-qa animReduced desktop+phone (Brave) live 10/10 pass - /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/a2b4870c-a86b-49e7-93ff-7c847e28303f/scratchpad/b1_live4.log on 50/reduced 25/off 0 deg, 38 s
- 02:49 B1-qa animReduced desktop+phone mutant:REDUCED_WALK_SCALE=0 8/10 pass ratio+shot red (both vp) /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/a2b4870c-a86b-49e7-93ff-7c847e28303f/scratchpad/b1_mutant.log
- 02:52 isoTap desktop/desktop16/phone live 26/26x3 pass - /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/16ed089b-4257-46ea-afe5-e719c11205d7/scratchpad/iso.log 49s load~22 (place() clears pendingInteraction)
- 02:52 smoke desktop/phone live 20/20 pass (c,d wait on chop session not swing line) - /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/16ed089b-4257-46ea-afe5-e719c11205d7/scratchpad/smoke.log 26s
- 02:55 isoTap+smoke mutant:interactTree returns early rc=1 red: trunk checks x3 vp, smoke c d e f f2 (h = load flake) - /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/16ed089b-4257-46ea-afe5-e719c11205d7/scratchpad/iso_mut.log
- 02:58 cpuGate (cdp.mjs startChrome) desktop+phone live:6 files x skillTags, E2E_CPU_SHARE=4 12/12 SUMMARY PASS (run4; run3 1 child exit 1 unexplained, run2 max 5 chromes -> fixed with claim lock) - /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/16ed089b-4257-46ea-afe5-e719c11205d7/scratchpad/six4.log max chromes 3-4, peak load1 28.6 (other agents); unit 17/17; mutants (drop +1, cap <=) red
- 03:08 cpuGate run-all.mjs load gate now shared gateDecision (load1+1<=cpus x0.8, E2E_CPU_SHARE), JOBS default 2 kept; lint green, unit 17/17, run-all starts clean with 0 files (no suite run) - n/a
- 03:12 axeSound desktop+phone live 14/14 pass - tests/e2e/axeSound.e2e.mjs 28 s wall; hits paired with swing chat lines (<=100 ms)
- 03:12 axeSound desktop+phone mutant:swingImpact skips every 2nd axe sound t1,t5 red (both viewports) - gaps 4800 ms; /mut12.log
- 03:20 run-all S1 live shared-vite 10 files: after2 6/10 ok wall 343s vs own-vite before2 6/10 wall 396s (reds=budget(CPU-gate queue)/mining m10/isoTap flake) /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/16ed089b-4257-46ea-afe5-e719c11205d7/scratchpad/ra_after2.txt; post-swap smoke/isoTap/skillTags functional green, nameplateClampPlay 6/7 per combo (budget only)
- 03:27 b20 all live budget-gate-wait: smoke run1 rc=1 chain 'e reload keeps logs and XP' TypeError store (flaky, passed run2 9/9), run2 rc=0 20/20; nameplateClampPlay 6 combos x 7/7 rc=0 (wall 157.3-128.5 gate=28.8 s vs 64 s); cpuGate.test 25/25; lint ok
- 03:33 smoke chain:webgl desktop live 9/9 pass - (smoke.mjs 4 combos rc=0, 24 s wall, lint ok) check e reload waits for new page (old-page marker + __idleRpg.store + ready)
- 03:34 mutant:setItem no-op+removeItem save before reload 6/9 pass e,f,f2 (e: 'logs 1 -> 0', no TypeError) mutant port 9204 cwd mut_t22
- 03:40 B2c desktop+phone live 10/10 pass (5 per viewport) - tests/e2e/animDefault.e2e.mjs Brave, reduced-motion emulated; wall 41.9 s (gate wait 16.9 s); first run 3/5 desktop = test-side reload race, fixed
- 03:41 B2c mutant:defaults reduced desktop 2/5 pass c1,c2,c3 red (c1 store reduced) - $SCRATCH/mut_b2c
