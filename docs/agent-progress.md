# Agent progress (append-only)
One line per milestone per agent: `- HH:MM <agent> <item#>: <what happened> — next: <next step>`. See CLAUDE.md.

Older lines: `docs/archive/agent-progress-2026-10-08.md`.

- 23:57 core pre-push v0.1.3: lint ok 6s, test ok 155 files/2603 passed 8s, build ok 12s, lint-script mutant fails exit 1 — next: main session commit/push on user OK
- 23:58 core gitignore: added tests/e2e/timings.json to .gitignore, check-ignore verified — next: none
- 00:01 qa-gate: started run-all v0.1.3, load 4.04 44.21 89.78 — next: run
- 00:21 qa-gate: run-all still running at 10 min (moved to background by harness) — next: wait for finish
- 00:38 qa-gate: run-all ~22 min in, load 400+, many FAILED (likely load); still running — next: wait
- 00:51 qa-gate: run-all ~32 min, 73/103 done — next: wait
- 01:04 qa-gate: ~42 min, 93/103 done
- 01:09 integrator cooking-unlocks: cooking SOURCES + food kind + panel 2 lines + tests; vitest 45 pass, mutant red, lint run — next: report
- 01:09 qa-gate: full run-all done (8/103 ok; load 300-600, Chrome launch timeouts); rerunning named files at JOBS=2 — next: report
- 01:16 qa cookingTree: e2e extended u3-cooking, live 15/15, mutant red, lint ok — next: none
- 01:20 qa-gate: done, report sent
- 01:32 qa run-all: default JOBS 2 + load1 gate (cpus x1.5, max 3 min wait) + peak load printed; lint green; filter run 4/6 ok (fishChat, gait real-time reds under external load 612) — next: gate slice with RUN_ALL_JOBS=2 on a quiet machine
- 01:33 qa gate-R2: started run-all (load1 5.96) — next: wait for summary
- 02:13 qa gate-R2: run-all running, 94 files done, load 16.93 — next: summary
- 02:24 qa gate-R2: done, report sent — next: owners triage axeSound/isoTap/nameplateClampPlay/smoke c,d
- 02:25 graphics T-1: started, rerunning isoTap alone to find root cause — next: read failing assertions
- 02:26 graphics N-1: root cause found = keep-out side shift (40 css px cap = 26 world px at zoom 1.5) on desktop banker label by .topright minimap; intended, test oracle stale — next: run nameplate e2e, report
- 02:30 graphics T-1: isoTap root cause found = test place() leaves stale pendingInteraction, store guard ignores re-tap (evidence PRE/POST diag); now checking smoke c/d + axeSound — next: same cause?
- 02:32 graphics N-1: done, no src change; p3 oracle stale (keep-out shift), reported
- 02:32 graphics T-1: smoke c/d = swing line only on animation impact (needs ~2.4s real) so 60ms-tick runs never see it; rerunning axeSound alone — next: confirm
- 02:32 qa S1 started: shared vite for run-all (scratch mut_s1)
- 02:34 qa n1qa: nameplateClampPlay p3 keep-out allowance + p1 static-banker pan done, 6/6 combos 7/7, mutant (+40px label) red p1+p3 — next: none
- 02:40 graphics T-1: isoTap trunk = stale pendingInteraction race (also on phone); gap flake not reproduced in 3 runs; checking smoke tick rate
- 02:40 animation B1: started, Brave no walk anim; checking reduced mode walkScale 0 — next: reproduce in Brave
- 02:43 animation B1: reduced walkScale 0.5 fix, tests green, mutant red — next: report
- 02:46 graphics T-1: DONE (no edits): all causes in tests/e2e (qa) + maybe app/actions.ts (integrator), not render; see report — next: qa/integrator fix
- 02:49 qa B1-qa: done, reduced walk verified in Brave, mutant red — next: report
- 02:55 qa t8: isoTap place() pendingInteraction:null + smoke c/d wait on session — done, both green, mutant red — next: main session review
- 02:58 qa cpuGate: tests/e2e/cpuGate.mjs + gate in cdp.mjs startChrome, 17 unit tests, 2 mutants red, 6-file live proof max chromes <=4 — next: report
- 03:05 qa cpuGate: started run-all.mjs load gate switch to shared gateDecision (load1+1 <= cpus x0.8) — next: edit, lint, report
- 03:08 qa cpuGate: run-all.mjs switched to shared gate, lint green — done
- 02:58 qa S1: resumed; after1 run done?; merging scratch onto live run-all/cpuGate — next: rebase, after2, swap-in
- 02:58 qa S1: rebased scratch onto live (cpuGate); running before2/after2 on 10 files — next: compare, swap-in
- 03:00 persistence B2: defaults 'on' + prefs v2 migration saved (tsc checked) — next: tests + mutant
- 03:01 persistence B2: done, tests+mutants red/green, lint ok — next: report
- 03:01 integrator T-9: started, repro in scratch showed clean first swing alone; running the real e2e — next: find the missed first impact
- 03:03 integrator T-9: own single-swing trace: first hit+chat land together (8283 ms), gaps 2400; e2e run 1 failed on budget/phone, re-running once capturing t1 — will miss 03:10 target slightly
- 03:06 integrator T-9: ROOT CAUSE found, not an app bug: e2e classify() counts a MUSIC triangle chord note (220 Hz at ~1.7 s) as a 'hit'; real hits+chat are clean 2400 ms. Owner qa (tests/e2e/axeSound.e2e.mjs). No app edit — next: report
03:08 qa T-12: axeSound hit pairing edit saved — next: live run
03:09 qa T-12: live 14/14 pass 28 s — next: mutant
03:12 qa T-12: mutant red t1+t5, done
- 03:14 qa S1: swapped run-all/lib/warmPage into live; running required checks (smoke isoTap nameplateClampPlay skillTags, lint, test, build)
- 03:14 qa S1 STATUS: swapped in; lint+build green, test 2 known reds (prefs/runtime); now running smoke, isoTap, nameplateClampPlay, skillTags — ETA ~10 min, then report
- 03:20 qa S1 done: shared vite swapped in; reporting
- 03:27 b20 hand-off: budgetJudge (cpuGate.mjs) subtracts gate wait; lib.mjs budgetVerdict prints 'budget: wall X - gate wait Y = Z vs limit L'; runParallel subtracts max child/parent gate wait; mutant (no subtract) red 2 tests — next: main session review
- 03:30 integrator B2b: runtime matchMedia auto-pick removed, 2 tests rewritten, src/app green (492) — next: lint
- 03:35 qa t22: smoke check e reload race fixed (old-page marker), live green, mutant red for right reason — next: report
- 03:41 qa B2c: animDefault.e2e.mjs done, live green, mutant red — next: report
- 03:35 core release: version 0.1.3 -> 0.1.4 in package.json + lock — next: lint/test/build
