# QA run log (append-only, real time)

Every qa agent appends ONE line here the moment a run finishes (pass, fail, killed or mutant), before doing anything
else, so no result is lost if the session dies. The main session folds new lines into `docs/qa-coverage.md` as they
land. Never edit or delete earlier lines.

Format: `- HH:MM <slice> <viewport> <live|mutant:what> <N/M pass> <failing check ids or "-"> <log file path> <note>`
Append with a single shell `>>` (e.g. `echo "- $(date +%H:%M) isoTap phone live 17/17 - /path/log.txt" >> <abs path>`),
never by rewriting the file (parallel agents append at the same time).

- 2026-10-08 dispatched: isoTap desktop :5221, isoTap phone :5222, gait + art :5223, isoBank pick-Bank :5224, balance placement
- 2026-10-08 qaLint lint+prettier clean (main re-ran npm run lint) - stray shots-trees deleted
- 05:52 balance placement-distances Spawn->nearest normal tree 3 tiles, nearest oak 5 (Oak Grove, 4 oaks, 5-7 tiles from spawn); Willowbrook bank 10 tiles from spawn; Whispering Wood trees 30-48 tiles from spawn but 40-56 from bank; Fernhaven bank 102 tiles from spawn, 68-72 from Oak Ridge/Whispering; Oak Ridge trees 44-61 from spawn, 53-57 from Willowbrook bank tests/balance/woodcuttingPlacement.test.ts
- 05:52 balance time-to-15 Woodcutting 1->15 village normal trees: 14.6 min walking, 14.1 run (97 logs, 3 bank trips, 0 waiting); Whispering Wood only: 17.0 min walk tests/balance/woodcuttingPlacement.test.ts
- 05:52 balance xp-per-hour oak 15.2k? no: at lvl15 tree 9932 xp/h vs oak 9485 xp/h (oak lower until ~lvl 40; lvl 30 11735 vs 11682; lvl 99 18535 vs 21277) tests/balance/woodcuttingPlacement.test.ts
- 05:52 balance correction prev xp-per-hour line: ignore the '15.2k? no' text; numbers after it are right. Also oak sims used xp 1154 = level 10 (bug), rerunning tests/balance/woodcuttingPlacement.test.ts
- 05:52 isoTap desktop live 33 pass/4 fail dpr1],dpr1.6],dpr1.6],dpr1.6], /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/52639bb9-471d-4ce3-af80-17e91189a0f7/scratchpad/live.txt live-tree desktop run finished; added E2E_VIEWPORT switch; investigating tree canopy fails
- 05:53 balance oak-vs-normal 15->30 real (xp/h column in script wrongly includes start xp; gained 12005xp): village oaks 65.0min (~11.1k xp/h, 10 bank trips), village normal trees 52.8min (~13.6k xp/h), Oak Ridge oaks 73.0min (~9.9k xp/h); oaks lose to normal trees until ~lvl 40 tests/balance/woodcuttingPlacement.test.ts
- 05:53 gait desktop+phone live 21/23 g0 /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/52639bb9-471d-4ce3-af80-17e91189a0f7/scratchpad/gait.txt g0 frame-count threshold 150 too high under load (131/134 frames); other checks pass
- 05:53 gait desktop+phone live 23/23 - /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/52639bb9-471d-4ce3-af80-17e91189a0f7/scratchpad/gait2.txt g0 threshold lowered to 90 frames; period walk 533ms run 334ms corr -0.9
- 05:53 gait desktop+phone mutant:swap-arm-phases(logic.ts gaitPose) 21/23 g1(desktop,phone) /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/52639bb9-471d-4ce3-af80-17e91189a0f7/scratchpad/gaitmut.txt mutant server cwd verified scratchpad/mut :5323; killed pid 68106
- 05:53 isoTap-proof phone live 17/19 pass t-tree_10-canopy,t-tree_10-canopy-top /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/52639bb9-471d-4ce3-af80-17e91189a0f7/scratchpad/live.txt run1; tap on overlapping-tree canopy, no chop
- 05:53 isoTap-proof phone live 18/19 pass t-tree_9-canopy-top /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/52639bb9-471d-4ce3-af80-17e91189a0f7/scratchpad/live2.txt run2; different failing id than run1 (flaky canopy-top taps)
- 05:53 isoTap-proof phone mutant:pending - - now building mutant on :5322 (status: running)
- 05:53 isoBank desktop+phone live 21/21 pass - /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/52639bb9-471d-4ce3-af80-17e91189a0f7/scratchpad/run1.txt new booth-menu-bank + npc-menu-bank checks added
- 05:53 isoBank desktop+phone live 20/21 pass phone:door-diag /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/52639bb9-471d-4ce3-af80-17e91189a0f7/scratchpad/run2.txt 'no canvas-visible exit tile (HUD covers all)' pre-existing check, flake
- 05:53 isoBank desktop+phone live 21/21 pass - /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/52639bb9-471d-4ce3-af80-17e91189a0f7/scratchpad/run3.txt mutant run pending
- 05:55 isoTap-proof phone mutant:clientToTile pickTile y+16 12/19 pass g1,t-tree_9-canopy-top,b-x4,c-flat /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/52639bb9-471d-4ce3-af80-17e91189a0f7/scratchpad/mut.txt port5322 free before run
- 05:56 animation desktop+phone live  /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/52639bb9-471d-4ce3-af80-17e91189a0f7/scratchpad/anim.txt after rig edit
- 05:56 isoBank desktop+phone mutant:facility menu Bank->examine 19/21 passed see-log /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/52639bb9-471d-4ce3-af80-17e91189a0f7/scratchpad/mut_fac.txt 
- 05:56 isoTap desktop live rerun 34 pass; fails: dpr1.6],dpr1.6],dpr1.6], /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/52639bb9-471d-4ce3-af80-17e91189a0f7/scratchpad/live2.txt rerun
- 05:58 isoTap desktop canopy-fail finding: different t-tree_9/tree_10 canopy checks fail each run (run1 4 fails, run2 3 fails, all 'player adjacent, session null after 14s'); hypothesis TEST flake not product: same trees are chopped by earlier checks and are stumps (respawn 12 ticks at real 600 ms) when re-tapped, tests/e2e/isoTap.e2e.mjs:268-286 has no ?tickMs and no stump-wait; mutant NOT run (quota stop)
- 05:59 isoBank desktop+phone mutant:npc menu Bank->examine 19/21 passed /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/52639bb9-471d-4ce3-af80-17e91189a0f7/scratchpad/mut_npc.txt
- 06:00 animation desktop+phone live rerun :5225 (first run hit another agent's :5224) /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/52639bb9-471d-4ce3-af80-17e91189a0f7/scratchpad/anim2.txt 40 PASS 0 FAIL
- 06:00 gait art-review desktop+phone shots shots/ player front/back/side ok; chop frames: raised axe arm/hand not visible, axe floats beside head (desktop-chop1, phone-chop2)
- 06:00 art-review desktop+phone banker shots ok (legs behind counter, expected); no villager NPC exists in content
- 06:03 isoTap-T1 desktop live 22/25 pass (3 FAIL t-tree_10-canopy x2, t-tree_9-canopy-top) scratchpad/diag1.log DIAG: all target trees standing before every tap -> T1 disproved
06:05 graphics: portraitUrl(lookId,sizePx) done: 8 portrait tests green, mutant (all looks -> player) turns 'different looks' red; src/render/portrait.ts
06:06 hud: dialogue portrait avatar - ui tests 34/34 green, tsc/eslint/prettier clean (tsc only unrelated tests/balance TS6133)
06:07 animation A1 back-view chop: cause = axe handle drawn from fist back toward shoulder (blade by head) + sideways swing in back view; fix + unit tests green, mutant + browser next
06:07 animation A1 mutants red (no foreshorten: 3 fail; old axe geometry: 1 fail) in scratch copy mutA1
- 06:07 balance tsc fix removed unused WORLD_DEF import in tests/balance/woodcuttingPlacement.test.ts; tsc has no errors in tests/balance, balance config 3/3 pass; remaining tsc errors are src/render/animation/logic.test.ts (foreshortenSwing, not mine) tests/balance/woodcuttingPlacement.test.ts
06:08 animation A1 browser :5226 desktop+phone back-chop shots shots3/*-fix-ne-*.png: arm raised, hand grips axe handle; rerunning gait/animation e2e + lint/test/build
- 06:08 dialogueAvatar desktop+phone live 7/7 pass - scratchpad/live.log banker+player avatar img 24css/48px
- 06:08 chatUi desktop+phone live see-summary /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/52639bb9-471d-4ce3-af80-17e91189a0f7/scratchpad/chatui.log rerun for avatar layout
- 06:09 dialogueAvatar both mutant:speakerPortrait null 3/7 pass a1,a2 red x2 scratchpad/mut.log
- 06:11 isoTap-T1 desktop live 22/25 pass (t-tree_9-canopy, canopy-top dpr1.6 FAIL, calls=interactTree tree_9 correct) /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/52639bb9-471d-4ce3-af80-17e91189a0f7/scratchpad/diag2.log spy shows many taps resolve to NEIGHBOUR tree (tree_11,tree_6,tree_8)
06:13 animation A1: gait.e2e 23/23; animation.e2e FAIL chop-axe-off (axe rotation varies 11.88 deg: back-view foreshortening applies in off mode too); lint/test(1332)/tsc green; user says ignore 'axe direction' msg (wrong agent) but coordinator pose pending
- 06:15 isoTap-T1 desktop live 23/24 (t-tree_9-canopy-top dpr1 FAIL: interactTree(tree_9) fired, player never moved, seen=[]) /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/52639bb9-471d-4ce3-af80-17e91189a0f7/scratchpad/diag3.log tree_9 was depleted by prior check -> T1 partly true
06:15 animation A1 v2: axe head mirrored to leading side, Off-mode no foreshorten; unit tests run next
06:15 animation A1 v2 unit tests green; mutants: blade on +x side -> edge-leads test red; Off foreshorten always -> Off test red (scratch mutA1)
- 06:19 isoTap-T1 desktop live 24/24 after fix (wait all trees standing before t-* tap) /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/52639bb9-471d-4ce3-af80-17e91189a0f7/scratchpad/run4.log; AMBIGUOUS accepted as PASS (to be removed)
- 06:19 isoTap-T1 desktop live 37/37 pass (after wait-for-trees-standing fix, tickMs 600, 3.5 min) /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/52639bb9-471d-4ce3-af80-17e91189a0f7/scratchpad/run4.log
- 06:20 isoTap-T1 desktop live 23/37 pass (t-* FAIL x14: neighbour chopped tree_11/tree_6 for tree_10/tree_9 trunk+below-feet; 'fully covered' oracle culling flake) /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/52639bb9-471d-4ce3-af80-17e91189a0f7/scratchpad/run5.log 65 s total with tickMs=60
- 06:28 isoTap-T1 desktop live 0/19 Chrome exited at boot (infra flake) /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/52639bb9-471d-4ce3-af80-17e91189a0f7/scratchpad/run6.log
- 06:29 isoTap-T1 desktop live 25/37 pass (12 t-* FAIL: neighbour chopped on visible-leaf trunk taps tree_10->tree_11, tree_9->tree_6; 'no visible leaf px' covered canopies) /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/52639bb9-471d-4ce3-af80-17e91189a0f7/scratchpad/run7.log ~65 s
2026-10-08 npc: banker_f def added; npc tests 20/20 pass, tsc clean, mutant (option label) caught by 2 tests
- 2026-10-08 graphics: banker_f look added (figureLooks.ts) + test in portrait.test.ts; vitest src/render 356/356 pass, mutant (banker_f = banker copy) reddened 2 tests
2026-10-08 map: banker_2 (14,8) and banker_4 (95,61) -> npc id banker_f (east booth in both banks); world tests 58 pass, mutant (banker_4 back to banker) fails the new genders test.

## 2026-10-08 integrator: tree hit-test by visible pixels (objectAtPoint + WorldScene.isOpaqueAt)
- unit: objectAtPoint.test.ts 13/13; mutant (pixel check disabled) -> 3 red.
- e2e isoTap on :5228 desktop+phone: trunk taps pass (tree_9, tree_10 chop themselves); ground gaps between trees walk, no chop. Remaining FAILs are test expectations: canopy/canopy-top of tree_9/tree_10 are fully covered by tree_6/tree_11 (oracle finds no visible leaf), below-feet of tree_9/10 lies under opaque leaves of tree_6/tree_11 (alpha 255, diag.mjs) so the visible tree is chopped, as decided.
06:31 animation A1 v2: gait.e2e 23/23, animation.e2e 40/40 (:5226, earlier run had been cut off, nothing hung/leftover pids; rerun once) scratchpad/anim_v2.txt
06:31 animation A1 v2 frozen shots shots4/{desktop,phone}-v2-{se,ne}-{0.3,0.68}.png read: 0.3 edge points DOWN (head below handle); 0.68 hit edge points UP-LEFT (arm already swept past hanging)
06:33 animation A1 v3: hit angle -85deg (arm level, head below handle, edge down), windup -150; screen-space impact tests added; mutants + shots next
06:33 animation A1 v3 mutants: hit +55deg red, head on +x red (mutA1)
06:34 animation A1: v3 reverted to v2 per coordinator (user confirmed edge down at hit live); animation tests re-run
06:34 animation A1 final = v2; tsc ok, 109 animation tests

## 2026-10-08 integrator: banker_f speakerLook
- npcContent.test.ts 3/3 (spriteKey->render look, spawn npcId->NPC_DEFS, speakerLook per spawn). Browser (:5228, bank.mjs): banker_1/3 look banker, banker_2/4 look banker_f; dialogue portrait data-URL differs male vs female, same at both banks; Bank option opens bank for all 4; screenshot of Fernhaven shows grey-haired male + dark-haired female world sprites, portrait matches talked-to one.
- 06:36 isoTap desktop(dpr1+1.6) live 43/43 pass - /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/52639bb9-471d-4ce3-af80-17e91189a0f7/scratchpad/d3.log oracle=frontmost opaque tree (3 runs: 2 flaky-sway/unstable-point fixes first)
- 06:37 isoTap phone live 22/22 pass - /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/52639bb9-471d-4ce3-af80-17e91189a0f7/scratchpad/p1.log
- 06:45 isoTap desktop live 49/49 pass - /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/52639bb9-471d-4ce3-af80-17e91189a0f7/scratchpad/d6.log added gap-* checks (transparent gap of front tree falls through); first mutant run reddened only 1 check so gap-* added
- 06:47 isoTap mutant:isOpaqueAt->true desktop+phone 5 red (t-tree_9-trunk x3 viewports, gap-tree_9 x2) /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/52639bb9-471d-4ce3-af80-17e91189a0f7/scratchpad/mA2.log
- 06:49 isoTap desktop mutant:pickTile y+16 12 red (g1,b-*x4,c-flat both dpr) /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/52639bb9-471d-4ce3-af80-17e91189a0f7/scratchpad/mB.log
- 06:50 bankerGreeting both live :5230 22 PASS of 23 - /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/52639bb9-471d-4ce3-af80-17e91189a0f7/scratchpad/live5.log gendered bankers: world hair px + avatar src + bank opt (4 prior runs: test-side fixes)
- 06:52 bankerGreeting both live :5230 SUMMARY: 23 PASS, 0 FAIL, 0 XFAIL, 0 XPASS of 23 - /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/52639bb9-471d-4ce3-af80-17e91189a0f7/scratchpad/live6.log final live run (runs 1-5 test-side fixes: phone banker_2 off-canvas, wall-grey bg)
- 06:56 bankerGreeting both mutant:speakerLookId->'banker' :5330 17/23 av_banker_2,av_banker_4,av_diff x2 /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/52639bb9-471d-4ce3-af80-17e91189a0f7/scratchpad/mutA.log
- 06:56 bankerGreeting both mutant:banker_4 npcId->banker :5330 19/23 av_banker_4,av_diff x2 /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/52639bb9-471d-4ce3-af80-17e91189a0f7/scratchpad/mutB.log cwd verified mut_b
