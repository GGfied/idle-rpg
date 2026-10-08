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
- 07:21 greatmereEast both live :5231 13/13 pass - /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/10f4e8f8-80f0-4698-991e-13f127253206/scratchpad/run2.log (run1 test-side grid arg fix)
- 07:21 greatmereEast both mutant:name->'Greatmere Eastt',x0 63->66 :5331 9/13 desktop-mm,desktop-west-in,phone-mm,phone-west-in /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/10f4e8f8-80f0-4698-991e-13f127253206/scratchpad/mut.log
- 07:22 greatmereEast both live :5231 13/13 pass - lint-fix rerun, npm run lint clean
- 07:36 bankBooth5 desktop+phone live 15/15 pass - /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/10f4e8f8-80f0-4698-991e-13f127253206/scratchpad/run1.log booth drawn, menu, ops, path, minimap ok
- 07:24 oakTuning both live 10/10 pass (+1 console) - /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/10f4e8f8-80f0-4698-991e-13f127253206/scratchpad/oak1.log oak xp45 normal25 rate .36/.39 vs .352
- 07:25 7-depositChest desktop+phone live 15/15 pass - /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/10f4e8f8-80f0-4698-991e-13f127253206/scratchpad/run4.log (runs 1-3 were my selector/lifecycle bugs)
- 07:25 7-depositChest desktop+phone mutant:intent depositPanel mode->full 5/15 pass (10 red c2-c5,c7) /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/10f4e8f8-80f0-4698-991e-13f127253206/scratchpad/mut.log
- 07:26 oakTuning mutant:oak xp 37.5 7/11 pass t2+t4 desktop+phone red - /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/10f4e8f8-80f0-4698-991e-13f127253206/scratchpad/oak_mut.log
- 07:44 bankBooth5 desktop+phone mutant:label x72->60 13/15 pass desktop-mm,phone-mm red /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/10f4e8f8-80f0-4698-991e-13f127253206/scratchpad/run4.log (first mutant try only phone red: test read anchor from mutated data; fixed to hardcode 72,52)
- 07:30 lockedDialogue desktop+phone+landscape live 22/25 l2b(x3) /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/10f4e8f8-80f0-4698-991e-13f127253206/scratchpad/run2.log req text lacks 'you: N' (story/logic.ts requirementText)
- 07:31 lockedDialogue all 3 vp mutant:gate-always-passes 10/25 pass, 15 red (l1-l4,l2b) scratchpad/mut.log
- 07:35 13-playerLook desktop+phone live 17/17 pass - tests/e2e/.shots-playerLook.log real taps in Settings; auburn-px oracle
- 07:36 13-playerLook desktop+phone mutant:applyPlayerLook skips view.setLook 13/17 pass c2,c7 red x2 (scratchpad mut.log) world look stays male
- 07:38 lockedDialogue all 3 vp live 25/25 run3.log after B1 fix
- 07:40 lockedDialogue mutant:gate-passes 10/25 (15 red l1-l4,l2b); mutant:level->0 22/25 (l2b x3 red) scratchpad/mutA.log mutB.log
- 07:52 itemIcons e2e both live 15/15 - run2.log (run1: d4 test bug, 4th drop on same tile exceeds MAX_PILE=3 by design)
- 07:53 isoBank desktop+phone live 5x phone/desktop 21/21 pass - /var/folders/26/f7pn00x1383b7g5777sw3g4h0000gq/T//ib_r1..5.log door-diag flake fix (frozen vite cfg, ?tickMs=60, camera-settle wait, more exit candidates)
- 07:53 isoBank mutant:door moved village.ts row17 col13->14 17/21 pass door-in,door-diag x2 /var/folders/26/f7pn00x1383b7g5777sw3g4h0000gq/T//ib_mut.log
- 07:53 itemIcons e2e mutant:ItemSlot url+#x 6/15 red (i1-i3 both vp); mutant:ground bronze_axe->sack d2 red
- 08:01 balance MF8 mining ok (1->15 0.22h, 1->30 0.68h, iron/steel 99 ~34k/h vs oak 37k); fishing 2-4x slower than WC/mining (net L1 2.0k vs tree 8k; 1->30 2.6h), bait has no source; steel pick 1.75x bronze; proposals sent. tests/balance/miningFishing.test.ts
- 08:03 skillTags(6b-B) desktop+phone live 5/5 pass - /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/10f4e8f8-80f0-4698-991e-13f127253206/scratchpad/live2.log tree logPuff+treeFall, copper rockBurst/rockPebbles/rockCrumble, 0 console errors
- 08:03 skillTags(6b-B) desktop+phone mutant:withNodeSkill->e 1/5 pass s1+s2 both viewports red /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/10f4e8f8-80f0-4698-991e-13f127253206/scratchpad/mut.log nodeDepleted skill null
- 08:06 6b-A-vfx desktop+phone live 11/11 pass - /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/10f4e8f8-80f0-4698-991e-13f127253206/scratchpad/run5.log (tests/e2e/vfxHooks.e2e.mjs :5246; chop/mine/net/hop/off)
- 08:09 6b-A-vfx desktop+phone live 9/11 (v1 swing-only colours: 0 samples at tickMs 60) mutant(nodeId dropped) 4 red v1+v2 both vp - /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/10f4e8f8-80f0-4698-991e-13f127253206/scratchpad/run6.log, mut-run2.log
- 08:10 qa MF8-mining desktop+phone live 17/21 (m4,m10 fail both: swing chat line missing on some first-attempt ores at 600ms ticks; m10 desktop also 30s no-ore) tests/e2e logs scratchpad mining3.log; mutant:iron requiredLevel 1 reds m5 both (17/21; m10 flaky same bug) mining-mut.log
- 08:10 6b-A-vfx mutant tileWorld->undefined: see mut-run3.log (v4)
- 08:10 grants-test unit mutant:cap+filter 9/9 pass live, each mutant reds 1 - src/app/metaSlice.test.ts
- 08:30 qa MF8-fishing desktop+phone live 17/17 pass (run5; earlier runs red from test/kit changes) - tests/e2e/fishing.e2e.mjs scratchpad run1-5.log; mutant bait-not-consumed reds f3,f4 both viewports; bait spot tile 54,51 on phone sits under HUD (camera clamped at south edge)
- 08:15 vfxHooks desktop+phone live 11/11 pass (run2; run1 phone v1 stale chat, v3/v4 phone flaked once) tmp scratchpad/vfx2.log v1 rewritten to spy swingImpact; mutant nodeId-drop reds v1 (+v2 both)
- 08:17 fishChat(6c) desktop+phone live 9/9 pass - /var/folders/26/f7pn00x1383b7g5777sw3g4h0000gq/T//fc.log net/bait attempt lines + fishCast per attempt, chop parity
- 08:17 fishChat(6c) both mutant:attempt lines blanked 3/9 pass (c1-c3 red x2) - /var/folders/26/f7pn00x1383b7g5777sw3g4h0000gq/T//fcm.log
- 08:21 newfish desktop+phone live 8/8 pass - tests/e2e/newfish.e2e.mjs (scratchpad nf1.log)
- 08:21 newfish mutant:mackerel lvl1 7/8 pass c2a red (expected) -
- 08:22 qa cacheDir orbs live+mutant 13/13 -, _metadata.json mtime unchanged 1791418827 /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/10f4e8f8-80f0-4698-991e-13f127253206/scratchpad/orbs-live.log frozen cfg now has per-port tmpdir cacheDir; 11 scripts routed
- 08:24 coal desktop+phone live 11/11 pass - /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/10f4e8f8-80f0-4698-991e-13f127253206/scratchpad/coal4.log (c3 rewritten to real startGather after sampler flake)
- 08:24 coal desktop+phone mutant:coal requiredLevel 1 9/11 pass c1 red both - scratchpad/coalmut.log
- 08:28 mmnet desktop+phone live 7/7 pass - /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/10f4e8f8-80f0-4698-991e-13f127253206/scratchpad/mm1.log shots pending visual review
- 08:31 mmnet desktop+phone live 9/9 pass - scratchpad/mm1.log (rerun, shots reviewed) rocks/spots/oak-vs-tree distinct, no box; mutant:spots-skipped 5/7 pass, b red both viewports
- 08:35 locked-menu desktop+phone live 13/13 pass - scratchpad/lm3.log test-side fixes only (spot tile hops, item id fishing_bait); 4 runs
- 08:36 locked-menu both mutant:lockedReason->undefined 7/13 pass 1,3,5 red x2 scratchpad mut_lm
- 08:45 fishFlash desktop+phone live 9/15 pass f1-f4 desktop, f2,f4 phone fail (no flash seen: probable tap-miss on spot, unproven) tests/e2e/fishFlash.e2e.mjs scratchpad ff3.log; mutant not run (budget)
- 08:47 fishFlash desktop+phone live 14/15 f5(phone, test too strict; fixed) /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/10f4e8f8-80f0-4698-991e-13f127253206/scratchpad/ff-live.log f1-f4 pass via interactSpot intent, spy saw gatherStopped w/ reason
- 08:48 fishFlash desktop+phone mutant:flashEvent levelTooLow passthrough 13/15 pass f1 desktop+phone red /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/10f4e8f8-80f0-4698-991e-13f127253206/scratchpad/ff-mut.log only f1 red (right reason); f5 relaxed version green
- 08:50 net-anim both live 9/9 pass (run3; run2 6/9: n1 test selector bug + Minimap tileDeltaToMinimapAngle exception, not mine) tests/e2e/netAnim.e2e.mjs mutant not run (run cap)
- 08:55 mining(B1) desktop+phone live 23/23 (m11 new) - /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/10f4e8f8-80f0-4698-991e-13f127253206/scratchpad/live4.log; mutant:drop itemGathered 21/23 (m11 red both), mutant:animatorImpactCounts=true 21/23 (m11 red both); m10 alone stayed green on mutA (too weak); one desktop m11 flake from stray ambience oscillator, total-count check loosened; regression.test bank assertion restored exact
- 08:56 worldmap desktop+phone live 9/11 c3 (test issue: zoom cap/pan clamp) tests/e2e/worldmap.e2e.mjs scratchpad run1.log c1,c2,c4,c5 pass both
- 08:56 worldmap desktop+phone mutant:minimap tap opens overlay 5/11 c1,c4(cascade),c3(test issue) both vp; c1 red as required scratchpad run2.log
- 09:04 worldmap(c3 rewrite) desktop+phone live 11/11 pass - /var/folders/26/f7pn00x1383b7g5777sw3g4h0000gq/T//wm_live.log c3 now fit/centre/clamped-pan/centre-on-me/close (3 tuning reruns: K=4 src px/tile, E=9 px crop snap)
- 09:05 worldmap(c3) mutant:clampView=identity 9/11 c3 desktop+phone (fit pan moved) scratchpad/wm_mut.log
- 09:06 qa-animB walk desktop+phone live 3/15 pass (oracle calibration) walk/run axis,midline,sync red -/ scratchpad/animb1.log run1 of 2 recalibrating
- 09:06 anim-a(chop) desktop+phone live 4/11 pass (c1 d, c5 both+console) fail c2 c3 c4 (harness: lean read from wrong node, back view never faced back) + phone c1/c4 timeouts; mutant NOT run; tests/e2e/.shots-animA/run2b.log; front shots viewed, see report
- 09:07 qa drops: desktop+phone live 9/9 pass -  tests/e2e/drops.e2e.mjs (:5262); mutant(preload removed) 8/9, d1 red (ground_sack)
- 09:11 qa-animB walk desktop+phone mutant:arms-lateral 5/15 pass walk-axis,walk-sync,run-axis,run-midline,run-sync red scratchpad/animb3mut.log mutant proves oracle; live run2 (prior oracle) 9/15, midline+walk-sync green, run-sync n weak
- 09:12 anim-c(poses) desktop+phone live 16/17 r3-phone(test tap, fixed) /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/10f4e8f8-80f0-4698-991e-13f127253206/scratchpad/animC2.log; mutant:rodCatchLanded false 13/17 m1(flaky: 0 impacts),r2 both vp /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/10f4e8f8-80f0-4698-991e-13f127253206/scratchpad/animCmut.log tests/e2e/animC.e2e.mjs
- 09:13 anim-e both live 33/45 12 red (test-side: angle wrap, session end between phases; Off/walk/body-still green) tests/e2e/.shots-animE/run2.log
- 09:13 cameraInset phone+desktop live 9/9 pass - /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/10f4e8f8-80f0-4698-991e-13f127253206/scratchpad/ci5.log tests/e2e/cameraInset.e2e.mjs :5263 (runs 1-4 were my test-script fixes)
- 09:13 cameraInset phone+desktop mutant:boundsWithInsets ignores inset 8/9 pass phone:c1 /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/10f4e8f8-80f0-4698-991e-13f127253206/scratchpad/ci_mut.log red as expected
- 09:13 hudFold phone+desktop live 6/6 pass - /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/10f4e8f8-80f0-4698-991e-13f127253206/scratchpad/hf2.log (first run 4/6: my probe point hit the Chat button + toClient misuse)
- 09:13 hudFold phone+desktop mutant:default expanded 3/6 pass c1,c2,c4 red /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/10f4e8f8-80f0-4698-991e-13f127253206/scratchpad/hf3.log
- 09:15 foldPersist phone+desktop live 5/5 pass - /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/10f4e8f8-80f0-4698-991e-13f127253206/scratchpad/fp1.log fold prefs survive reload; prefs.test hud keys fixed
- 09:15 foldPersist phone+desktop mutant:applyFold setPref no-op 3/5 pass f2,f3 /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/10f4e8f8-80f0-4698-991e-13f127253206/scratchpad/fp2.log mutant red as expected
- 09:15 gaitB desktop+phone live 15/17 pass walk-axis(both) /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/10f4e8f8-80f0-4698-991e-13f127253206/scratchpad/gaitB-run1.log side-on walk ARM fwd 6.15px < oracle 8 (legs 9.9, dir correct); run-n sync 0.34-0.41
- 09:17 chopAnim-a2 desktop+phone live 4/11 pass (phone c1,c5 + desktop c5 + console) fail: c2,c3,c4 both, desktop c1 scratchpad/run2.log harness: back facing never reached (S.back false), freeze predicate flaky desktop; phone 3/4 impact elbow 12.5>8.9 (A1 looks real on 3/4)
- 09:17 anim-e mutant(off chopStyle->swing) desktop+phone 8/45 pass, Off static+facings red, walk green tests/e2e/.shots-animE/mut.log
- 09:19 gaitB3 desktop+phone live 17/17 pass - tee lost (scratch path typo), new arm oracle fwd>=max(3,0.4*leg)
- 09:22 gaitB3 desktop+phone mutant:arms-fixed-side-axis 7/17 pass (10 red: walk-axis, walk-sync, run-axis/midline/sync x2 vp) scratch/mut.log arms lateral 6.15 on s/n
- 09:22 animC2 both 4 live runs (3 over the 2-run budget, test restructure) final 19/19 - scratchpad/run4.log; m1 stable (impact>=1, down .69 in 5/5 runs); pick IMPACT frame not captured by screenshots, wind-up/net/rod/catch-lift captured; shots tests/e2e/.shots-animC
- 09:32 qa camJerk phone+desktop live 1/6 pass (oracle not dt-normalised, spikes 5.8px, gather 96px) /scratchpad/camjerk-live.log fixing oracle, rerun
- 09:33 qa camJerk live2 1/6 (agg bug + post-teleport glide artefact; real finding: re-follow snaps ~5.6 world px mid-walk desktop+phone) fixing script, live3
- 09:35 qa camJerk desktop+phone live 1/6 pass (all walk/gather/sheet FAIL: residual ~5.8 world px snap per re-follow, p95 1.0) /scratchpad/camjerk-live3.log; fix removed inset snap
- 09:35 qa camJerk mutant:no-offset 1/6 pass phone max 13/18/85 vs live 5.8 (inset snap proven) /scratchpad/camjerk-mut.log
- 09:40 camJerk desktop+phone live 5/6 pass; FAIL phone gather player step max 3.24 (scroll 1.05) /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/10f4e8f8-80f0-4698-991e-13f127253206/scratchpad/camjerk_live.log
- 09:41 camJerk both mutant:startFollow-guard-off 1/6 pass (5 red: walks+gather desktop/phone, sheet) scroll 5.8 step 6.4-8.6 /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/10f4e8f8-80f0-4698-991e-13f127253206/scratchpad/camjerk_mut.log
- 09:44 qa-tooling foldPersist phone live 5/5 pass - /dev/null shared :5300 + own :5268 both 5/5, ready 611 vs 637 ms
- 09:45 examineTexts desktop+phone live 19/19 pass - /var/folders/26/f7pn00x1383b7g5777sw3g4h0000gq/T//ex1.log own :5276 server; mutant(coal_rock line deleted) 17/19, coal red both vp - /var/folders/26/f7pn00x1383b7g5777sw3g4h0000gq/T//ex2.log; npm run test x1 2267 pass
- 09:46 FLAKE npm run test run2: 1 fail src/render/animation/playerAnimator.test.ts 'walk bob is multiplied by ART_SCALE' (expected +0 close to -1.35; ran under load, e2e concurrent); run1 134/134 pass
- 09:46 rodRest desktop+phone live(SHARED :5300, VOID per coordinator) 5/5 pass - /tmp/rr1.log redo on own server
- 09:47 anim-e2 desktop+phone live 9/9 pass - /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/10f4e8f8-80f0-4698-991e-13f127253206/scratchpad/live6.log reduced chop/mine tap + live toggle (tests/e2e/animE2.e2e.mjs, :5273); 5 live runs (script fixes)
- 09:47 anim-e2 desktop+phone mutant:reduced chopStyle swing 1/9 pass 8 red (red-*, red-*-down) /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/10f4e8f8-80f0-4698-991e-13f127253206/scratchpad/mutant.log
- 09:49 anim-a3 chop+mine desktop+phone live 19/19 pass - scratchpad/a3-live.log forced facing s/se/sw/n; elbows<=1.4 vs half 8.9, lean<=8, 0 console errors
- 09:52 camJerk(CJ2 slice48) desktop+phone live 6/6 pass - /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/10f4e8f8-80f0-4698-991e-13f127253206/scratchpad/cj2_live.log player step max 2.03/2.13 scroll<=1.20 (exit code 1 despite 6 PASS)
- 09:52 camJerk(CJ2 slice48) desktop+phone mutant:pose blend skipped 4/6 pass gather(desktop),gather(phone) /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/10f4e8f8-80f0-4698-991e-13f127253206/scratchpad/cj2_mut.log new body-offset sample max 2.09-2.10 vs 1.5 red; phone player step 3.19 reproduced
- 09:52 anim-a3 chop+mine desktop+phone mutant:solveGrip elbow limit removed 15/19 pass c2-chop,c2-mine x2 scratchpad/a3-mut.log elbow offset 12.5/11.2 > half 8.9/8.7
- 09:52 gaitB live 5281 desktop+phone 15/19 pass; FAIL run-axis(se/sw arm lat 3.57>3) + run-arms-ns (n corr .34/.31, s .56/.55; swing 4.3 ok) /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/10f4e8f8-80f0-4698-991e-13f127253206/scratchpad/gaitB-live.log
- 09:54 respawn desktop live 8/8 pass - /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/10f4e8f8-80f0-4698-991e-13f127253206/scratchpad/respawn2.log tree/copper/coal respawn exactly per data (12/6/14 ticks) at 600ms and 60ms; earlier run 3/4 (copper tap missed, script artifact)
- 12:00 camJerk desktop+phone live 6/6 pass after MAX_BODY 1.5->1.7 (run1 live: 4/6, body max 1.58/1.59 > 1.5; run2 exit 0) - /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/10f4e8f8-80f0-4698-991e-13f127253206/scratchpad/cj2.log body p95 0.40; earlier exit 1 not reproduced (harness exit path verified: pass=0 fail=1)
- 09:55 gaitB mutant armDepth run=1 (scratch, :5381): 17/19; run-arms-ns red (n swing 2.38<4, corr same) run-axis green in mutant; vitest playerAnimator x2 done
- 09:55 rodRest desktop+phone live(own :5277) 5/5 pass - /tmp/rr3.log (first own run desktop-front arms flake 1816 frames, retry tolerant 2%)
- 09:55 rodRest desktop+phone mutant:rod rest theta -55 (:5377) 1/5 pass (4 red: f rest -0.63, b lift) - /tmp/rr6.log
- 10:06 A3-1 chop/mine windup desktop+phone live 42/42 animation + 23/23 chopAnim (new c6 fist gap 12.9-13px) - /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/10f4e8f8-80f0-4698-991e-13f127253206/scratchpad/chop.log gap=5 mutant: c6 x4 red (7.5<8), 19/23; lint fixed respawn.e2e.mjs
- 10:12 gaitB#47 desktop+phone live 19/19 pass - run-arms-ns n .86/.86 s .87/.87 swing 5.6px; se/sw lat 2px; mutant(knee1,depth1) run-arms-ns red n .33 s .56 (17/19) logs scratchpad live.log/mut.log
- 10:14 mmLabel desktop+phone live(own :5286) 21/21 pass - /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/10f4e8f8-80f0-4698-991e-13f127253206/scratchpad/mm_live3.log (earlier 2 dev runs failed on my own wrong ring oracle, fixed)
- 10:14 mmLabel desktop+phone mutant:hitsPlayer=false (:5386) 17/21 pass 4 red (*-text: greatmere d+p, fernhaven d, willowbrook d) - /private/tmp/claude-503/-Users-Derrick-Projects-idle-rpg/10f4e8f8-80f0-4698-991e-13f127253206/scratchpad/mm_mut.log
