# E2E fast-base audit (2026-10-08, read-only, no runs)

Criteria: uses lib.mjs withGame; parallel combos (runParallel/forEachCombo/splitViewports) unless the file is short (<30 s, single viewport); ?tickMs=60 (withGame default; realTime flagged); <=3 fixed sleeps; <=3 Date.now polling loops; budgetMs set; last time < 60 s (tests/e2e/timings.json; "?" = no timing recorded). Counts are static greps (sleep()/setTimeout/wait(ms), Date.now(), screenshot calls), so treat them as upper bounds. "Parallel" via splitViewports is accepted but not verified here.

**Totals: 99 files. COMPLIANT 1, CONVERT-light (lib + <60 s, small gaps) 54, CONVERT-heavy (no lib, or >60 s) 44. In use by other agents: 21 (audited anyway).**

| file | withGame | parallel | fast ticks | fixed sleeps | Date.now loops | screenshots | budgetMs | last time s | in use | verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| animC.e2e.mjs | yes | splitViewports | default 60 + realTime used (justify) | 7 | 0 | 1 | no | 101.4 | Q3-A | CONVERT-heavy: budgetMs; replace 7 sleeps with waitState/waitFor; 101.4s > 60s budget |
| animE.e2e.mjs | yes | sequential | default 60 | 0 | 0 | 0 | no | 253.3 | - | CONVERT-heavy: parallel combos; budgetMs; 253.3s > 60s budget |
| animE2.e2e.mjs | yes | splitViewports | default 60 + realTime used (justify) | 3 | 0 | 1 | no | 84.7 | - | CONVERT-heavy: budgetMs; 84.7s > 60s budget |
| animation.e2e.mjs | NO | sequential | ?tickMs in file | 10 | 3 | 0 | no | 243.1 | - | CONVERT-heavy: port to lib withGame; parallel combos; budgetMs; replace 10 sleeps with waitState/waitFor; 243.1s > 60s budget |
| areas.e2e.mjs | NO | sequential | NONE | 8 | 5 | 0 | no | 66.7 | - | CONVERT-heavy: port to lib withGame; parallel combos; budgetMs; replace 8 sleeps with waitState/waitFor; 5 Date.now polling loops -> waitFor; 66.7s > 60s budget |
| ashesIcon.e2e.mjs | yes | sequential | default 60 | 4 | 0 | 2 | no | 13.4 | - | CONVERT-light: budgetMs; replace 4 sleeps with waitState/waitFor |
| axeSound.e2e.mjs | yes | splitViewports | default 60 + realTime used (justify) | 4 | 2 | 0 | no | 106.2 | Q3-A | CONVERT-heavy: budgetMs; replace 4 sleeps with waitState/waitFor; 106.2s > 60s budget |
| bank.e2e.mjs | NO | sequential | NONE | 25 | 2 | 1 | no | 326.5 | Q3-C1 | CONVERT-heavy: port to lib withGame; parallel combos; budgetMs; replace 25 sleeps with waitState/waitFor; 326.5s > 60s budget |
| bankBooth5.e2e.mjs | yes | sequential | default 60 | 6 | 0 | 1 | no | 40.6 | - | CONVERT-light: parallel combos; budgetMs; replace 6 sleeps with waitState/waitFor |
| bankerGreeting.e2e.mjs | yes | splitViewports | default 60 | 2 | 0 | 3 | no | 107.6 | Q3-A | CONVERT-heavy: budgetMs; 107.6s > 60s budget |
| bigWorld.e2e.mjs | NO | sequential | ?tickMs in file | 14 | 12 | 1 | no | 90.9 | integrator | CONVERT-heavy: port to lib withGame; parallel combos; budgetMs; replace 14 sleeps with waitState/waitFor; 12 Date.now polling loops -> waitFor; 90.9s > 60s budget |
| bigWorldAreas.e2e.mjs | yes | sequential | default 60 | 6 | 2 | 0 | no | 49.7 | - | CONVERT-light: parallel combos; budgetMs; replace 6 sleeps with waitState/waitFor |
| blocked.e2e.mjs | NO | sequential | NONE | 18 | 8 | 0 | no | 111.7 | Q3-A | CONVERT-heavy: port to lib withGame; parallel combos; budgetMs; replace 18 sleeps with waitState/waitFor; 8 Date.now polling loops -> waitFor; 111.7s > 60s budget |
| buildings.e2e.mjs | yes | sequential | default 60 | 4 | 0 | 5 | no | 64.5 | Q3-C1 | CONVERT-heavy: parallel combos; budgetMs; replace 4 sleeps with waitState/waitFor; synth.frames for time-based shots; 64.5s > 60s budget |
| camJerk.e2e.mjs | yes | splitViewports | default 60 + realTime used (justify) | 5 | 0 | 0 | no | 70.3 | Q3-A | CONVERT-heavy: budgetMs; replace 5 sleeps with waitState/waitFor; 70.3s > 60s budget |
| cameraInset.e2e.mjs | yes | sequential | default 60 | 4 | 0 | 0 | no | 40.2 | - | CONVERT-light: parallel combos; budgetMs; replace 4 sleeps with waitState/waitFor |
| canvasRender.e2e.mjs | yes | sequential | default 60 | 2 | 0 | 1 | no | ? | - | CONVERT-light: parallel combos; budgetMs |
| chat.e2e.mjs | NO | sequential | NONE | 19 | 2 | 0 | no | 24.7 | - | CONVERT-heavy: port to lib withGame; budgetMs; replace 19 sleeps with waitState/waitFor |
| chatUi.e2e.mjs | yes | sequential | default 60 | 1 | 0 | 2 | no | 28.2 | - | CONVERT-light: budgetMs |
| chopAnim.e2e.mjs | yes | sequential | default 60 | 1 | 0 | 1 | no | 360.1 | - | CONVERT-heavy: parallel combos; budgetMs; 360.1s > 60s budget |
| coal.e2e.mjs | yes | sequential | default 60 + realTime used (justify) | 4 | 2 | 1 | no | 58 | - | CONVERT-light: parallel combos; budgetMs; replace 4 sleeps with waitState/waitFor |
| cookFire.e2e.mjs | yes | sequential | default 60 | 0 | 0 | 0 | no | 41.1 | - | CONVERT-light: parallel combos; budgetMs |
| cookPose.e2e.mjs | yes | sequential | default 60 | 1 | 3 | 1 | no | ? | - | CONVERT-light: parallel combos; budgetMs |
| cull.e2e.mjs | yes | splitViewports | default 60 | 5 | 0 | 0 | no | 83.3 | Q3-A | CONVERT-heavy: budgetMs; replace 5 sleeps with waitState/waitFor; 83.3s > 60s budget |
| depositChest.e2e.mjs | yes | sequential | default 60 | 0 | 0 | 2 | no | 27.8 | - | CONVERT-light: budgetMs |
| dialogueAvatar.e2e.mjs | yes | sequential | default 60 | 1 | 0 | 1 | no | 28.1 | - | CONVERT-light: budgetMs |
| drops.e2e.mjs | yes | sequential | default 60 | 3 | 0 | 1 | no | 28.5 | - | CONVERT-light: budgetMs |
| examineTexts.e2e.mjs | yes | sequential | default 60 | 0 | 0 | 0 | no | 40.8 | - | CONVERT-light: parallel combos; budgetMs |
| f3.e2e.mjs | yes | sequential | default 60 | 5 | 0 | 4 | no | 21.6 | - | CONVERT-light: budgetMs; replace 5 sleeps with waitState/waitFor; synth.frames for time-based shots |
| fastBase.e2e.mjs | yes | runParallel | default 60 | 1 | 4 | 0 | yes | ? | - | CONVERT-light: 4 Date.now polling loops -> waitFor |
| fernhavenBank.e2e.mjs | yes | sequential | default 60 | 7 | 0 | 0 | no | 48.3 | - | CONVERT-light: parallel combos; budgetMs; replace 7 sleeps with waitState/waitFor |
| fireArt.e2e.mjs | yes | sequential | default 60 | 3 | 0 | 2 | no | 11.9 | - | CONVERT-light: budgetMs |
| fireBlock.e2e.mjs | yes | sequential | default 60 | 5 | 0 | 0 | no | ? | - | CONVERT-light: parallel combos; budgetMs; replace 5 sleeps with waitState/waitFor |
| fireLight.e2e.mjs | yes | splitViewports | default 60 + realTime used (justify) | 8 | 6 | 0 | no | 76 | Q3-A | CONVERT-heavy: budgetMs; replace 8 sleeps with waitState/waitFor; 6 Date.now polling loops -> waitFor; 76s > 60s budget |
| fireVisuals.e2e.mjs | yes | sequential | default 60 + realTime used (justify) | 15 | 0 | 8 | no | 38.7 | - | CONVERT-light: parallel combos; budgetMs; replace 15 sleeps with waitState/waitFor; synth.frames for time-based shots |
| fireWire.e2e.mjs | yes | sequential | default 60 | 7 | 0 | 6 | no | 29.3 | - | CONVERT-light: budgetMs; replace 7 sleeps with waitState/waitFor; synth.frames for time-based shots |
| fishArt.e2e.mjs | yes | sequential | default 60 | 1 | 0 | 1 | no | ? | - | CONVERT-light: parallel combos; budgetMs |
| fishChat.e2e.mjs | yes | splitViewports | default 60 + realTime used (justify) | 1 | 0 | 0 | no | 102.2 | Q3-A | CONVERT-heavy: budgetMs; 102.2s > 60s budget |
| fishFlash.e2e.mjs | yes | sequential | default 60 | 2 | 0 | 1 | no | 44.6 | - | CONVERT-light: parallel combos; budgetMs |
| fishing.e2e.mjs | yes | splitViewports | default 60 | 6 | 2 | 4 | no | 86 | - | CONVERT-heavy: budgetMs; replace 6 sleeps with waitState/waitFor; synth.frames for time-based shots; 86s > 60s budget |
| foldPersist.e2e.mjs | yes | sequential | default 60 | 4 | 0 | 1 | no | 11.1 | - | CONVERT-light: budgetMs; replace 4 sleeps with waitState/waitFor |
| foodIcons.e2e.mjs | yes | runParallel | default 60 | 0 | 0 | 1 | yes | 8.9 | - | COMPLIANT |
| footer.e2e.mjs | NO | sequential | NONE | 6 | 0 | 0 | no | 12.2 | - | CONVERT-heavy: port to lib withGame; budgetMs; replace 6 sleeps with waitState/waitFor |
| gait.e2e.mjs | yes | splitViewports | default 60 + realTime used (justify) | 6 | 0 | 1 | no | 85.3 | - | CONVERT-heavy: budgetMs; replace 6 sleeps with waitState/waitFor; 85.3s > 60s budget |
| gaitB.e2e.mjs | yes | splitViewports | default 60 | 3 | 0 | 1 | no | 152.7 | Q3-A | CONVERT-heavy: budgetMs; 152.7s > 60s budget |
| greatmereEast.e2e.mjs | yes | sequential | default 60 | 1 | 0 | 1 | no | 25.9 | - | CONVERT-light: budgetMs |
| ground.e2e.mjs | yes | splitViewports | default 60 | 6 | 0 | 2 | no | 118.9 | - | CONVERT-heavy: budgetMs; replace 6 sleeps with waitState/waitFor; 118.9s > 60s budget |
| groundItems.e2e.mjs | yes | sequential | default 60 | 8 | 0 | 2 | no | 30.9 | - | CONVERT-light: parallel combos; budgetMs; replace 8 sleeps with waitState/waitFor |
| hud.e2e.mjs | NO | sequential | NONE | 24 | 2 | 1 | no | 72.1 | Q3-A | CONVERT-heavy: port to lib withGame; parallel combos; budgetMs; replace 24 sleeps with waitState/waitFor; 72.1s > 60s budget |
| hudBankDock.e2e.mjs | yes | sequential | default 60 | 1 | 0 | 1 | no | 7.7 | - | CONVERT-light: budgetMs |
| hudFold.e2e.mjs | yes | sequential | default 60 | 6 | 0 | 6 | no | 16.7 | - | CONVERT-light: budgetMs; replace 6 sleeps with waitState/waitFor; synth.frames for time-based shots |
| inventory.e2e.mjs | NO | sequential | ?tickMs in file | 11 | 2 | 0 | no | 18.8 | - | CONVERT-heavy: port to lib withGame; budgetMs; replace 11 sleeps with waitState/waitFor |
| inventorySwap.e2e.mjs | yes | sequential | default 60 | 5 | 0 | 0 | no | 13.9 | - | CONVERT-light: budgetMs; replace 5 sleeps with waitState/waitFor |
| isoBank.e2e.mjs | NO | sequential | ?tickMs in file | 20 | 2 | 1 | no | 64.8 | Q3-C1 | CONVERT-heavy: port to lib withGame; parallel combos; budgetMs; replace 20 sleeps with waitState/waitFor; 64.8s > 60s budget |
| isoBankRules.e2e.mjs | NO | sequential | ?tickMs in file | 11 | 2 | 1 | no | 75.3 | Q3-A | CONVERT-heavy: port to lib withGame; parallel combos; budgetMs; replace 11 sleeps with waitState/waitFor; 75.3s > 60s budget |
| isoCamera.e2e.mjs | NO | sequential | NONE | 17 | 2 | 0 | no | 99.9 | integrator | CONVERT-heavy: port to lib withGame; parallel combos; budgetMs; replace 17 sleeps with waitState/waitFor; 99.9s > 60s budget |
| isoTap.e2e.mjs | NO | sequential | ?tickMs in file | 10 | 2 | 0 | no | 144 | Q3-A | CONVERT-heavy: port to lib withGame; parallel combos; budgetMs; replace 10 sleeps with waitState/waitFor; 144s > 60s budget |
| itemIcons.e2e.mjs | yes | sequential | default 60 | 6 | 0 | 4 | no | 17 | - | CONVERT-light: budgetMs; replace 6 sleeps with waitState/waitFor; synth.frames for time-based shots |
| levelUp.e2e.mjs | NO | sequential | ?tickMs in file | 19 | 9 | 0 | no | 57.5 | - | CONVERT-heavy: port to lib withGame; parallel combos; budgetMs; replace 19 sleeps with waitState/waitFor; 9 Date.now polling loops -> waitFor |
| lightPolish.e2e.mjs | yes | sequential | default 60 | 5 | 3 | 1 | no | ? | - | CONVERT-light: parallel combos; budgetMs; replace 5 sleeps with waitState/waitFor |
| lockedDialogue.e2e.mjs | yes | splitViewports | default 60 | 3 | 0 | 2 | no | 61.1 | Q3-A | CONVERT-heavy: budgetMs; 61.1s > 60s budget |
| lockedMenu.e2e.mjs | yes | sequential | default 60 | 0 | 0 | 1 | no | 40.8 | - | CONVERT-light: parallel combos; budgetMs |
| logPile.e2e.mjs | yes | sequential | default 60 | 3 | 0 | 2 | no | 11.9 | - | CONVERT-light: budgetMs |
| longWalk.e2e.mjs | yes | sequential | default 60 | 0 | 3 | 0 | no | 48.6 | - | CONVERT-light: parallel combos; budgetMs |
| minZoom.e2e.mjs | yes | sequential | default 60 | 8 | 0 | 2 | no | 119 | integrator | CONVERT-heavy: parallel combos; budgetMs; replace 8 sleeps with waitState/waitFor; 119s > 60s budget |
| minimap.e2e.mjs | NO | splitViewports | ?tickMs in file | 21 | 0 | 1 | no | 117.5 | - | CONVERT-heavy: port to lib withGame; budgetMs; replace 21 sleeps with waitState/waitFor; 117.5s > 60s budget |
| minimapLabels.e2e.mjs | yes | sequential | default 60 | 1 | 0 | 1 | no | 47.6 | - | CONVERT-light: parallel combos; budgetMs |
| minimapRegions.e2e.mjs | yes | splitViewports | default 60 | 2 | 0 | 0 | no | 172.6 | - | CONVERT-heavy: budgetMs; 172.6s > 60s budget |
| mining.e2e.mjs | yes | splitViewports | default 60 | 16 | 0 | 1 | no | 281.6 | - | CONVERT-heavy: budgetMs; replace 16 sleeps with waitState/waitFor; 281.6s > 60s budget |
| mmLabel.e2e.mjs | yes | sequential | default 60 | 2 | 0 | 0 | no | 33.8 | - | CONVERT-light: parallel combos; budgetMs |
| mmnet.e2e.mjs | yes | sequential | default 60 | 6 | 0 | 1 | no | 20.2 | - | CONVERT-light: budgetMs; replace 6 sleeps with waitState/waitFor |
| nameplateClamp.e2e.mjs | yes | sequential | default 60 | 1 | 0 | 1 | no | ? | - | CONVERT-light: parallel combos; budgetMs |
| nameplateClampPlay.e2e.mjs | yes | sequential | default 60 | 4 | 2 | 2 | no | ? | - | CONVERT-light: parallel combos; budgetMs; replace 4 sleeps with waitState/waitFor |
| nameplateWalkStartDiag.e2e.mjs | yes | sequential | default 60 | 3 | 0 | 1 | no | ? | - | CONVERT-light: parallel combos; budgetMs |
| netAnim.e2e.mjs | yes | sequential | default 60 | 4 | 0 | 1 | no | 12.4 | - | CONVERT-light: budgetMs; replace 4 sleeps with waitState/waitFor |
| newfish.e2e.mjs | yes | splitViewports | default 60 | 2 | 2 | 3 | no | 144.6 | - | CONVERT-heavy: budgetMs; 144.6s > 60s budget |
| oakTuning.e2e.mjs | yes | splitViewports | default 60 | 1 | 2 | 1 | no | 101.4 | - | CONVERT-heavy: budgetMs; 101.4s > 60s budget |
| orbs.e2e.mjs | yes | sequential | default 60 | 2 | 0 | 0 | no | 21.4 | - | CONVERT-light: budgetMs |
| playerLook.e2e.mjs | yes | sequential | default 60 | 8 | 0 | 1 | no | 46.6 | - | CONVERT-light: parallel combos; budgetMs; replace 8 sleeps with waitState/waitFor |
| respawn.e2e.mjs | yes | splitViewports | default 60 | 4 | 5 | 0 | no | 64 | - | CONVERT-heavy: budgetMs; replace 4 sleeps with waitState/waitFor; 5 Date.now polling loops -> waitFor; 64s > 60s budget |
| rodRest.e2e.mjs | yes | splitViewports | default 60 + realTime used (justify) | 1 | 2 | 1 | no | 115.1 | - | CONVERT-heavy: budgetMs; 115.1s > 60s budget |
| roofs.e2e.mjs | yes | sequential | default 60 | 1 | 0 | 2 | no | ? | - | CONVERT-light: parallel combos; budgetMs |
| saves.e2e.mjs | yes | sequential | default 60 | 8 | 0 | 0 | no | 35.8 | - | CONVERT-light: parallel combos; budgetMs; replace 8 sleeps with waitState/waitFor |
| settings.e2e.mjs | NO | splitViewports | ?tickMs in file | 42 | 7 | 1 | no | 112.6 | - | CONVERT-heavy: port to lib withGame; budgetMs; replace 42 sleeps with waitState/waitFor; 7 Date.now polling loops -> waitFor; 112.6s > 60s budget |
| skillTags.e2e.mjs | yes | sequential | default 60 | 0 | 0 | 1 | no | 13.4 | - | CONVERT-light: budgetMs |
| skillUnlocks.e2e.mjs | yes | sequential | default 60 | 1 | 0 | 1 | no | 12.4 | - | CONVERT-light: budgetMs |
| skills.e2e.mjs | NO | sequential | NONE | 9 | 2 | 0 | no | 38.2 | - | CONVERT-heavy: port to lib withGame; parallel combos; budgetMs; replace 9 sleeps with waitState/waitFor |
| smoke.mjs | NO | sequential | ?tickMs in file | 19 | 9 | 0 | no | 31.7 | - | CONVERT-heavy: port to lib withGame; parallel combos; budgetMs; replace 19 sleeps with waitState/waitFor; 9 Date.now polling loops -> waitFor |
| stacking.e2e.mjs | yes | sequential | default 60 | 11 | 2 | 0 | no | 49 | - | CONVERT-light: parallel combos; budgetMs; replace 11 sleeps with waitState/waitFor |
| tabsSettings.e2e.mjs | yes | sequential | default 60 | 4 | 0 | 6 | no | ? | - | CONVERT-light: parallel combos; budgetMs; replace 4 sleeps with waitState/waitFor; synth.frames for time-based shots |
| treeSway.e2e.mjs | yes | sequential | default 60 + realTime used (justify) | 2 | 0 | 0 | no | 37.1 | - | CONVERT-light: parallel combos; budgetMs |
| trees.e2e.mjs | yes | sequential | default 60 + realTime used (justify) | 1 | 0 | 3 | no | 53.3 | - | CONVERT-light: parallel combos; budgetMs |
| useItem.e2e.mjs | yes | sequential | default 60 | 3 | 0 | 0 | no | 17 | - | CONVERT-light: budgetMs |
| vfxHooks.e2e.mjs | yes | sequential | default 60 + realTime used (justify) | 7 | 0 | 1 | no | 79.3 | vfx | CONVERT-heavy: parallel combos; budgetMs; replace 7 sleeps with waitState/waitFor; 79.3s > 60s budget |
| viewport.e2e.mjs | NO | sequential | NONE | 9 | 2 | 0 | no | 44 | - | CONVERT-heavy: port to lib withGame; parallel combos; budgetMs; replace 9 sleeps with waitState/waitFor |
| visualSmoke.e2e.mjs | yes | sequential | default 60 | 1 | 0 | 2 | no | ? | - | CONVERT-light: parallel combos; budgetMs |
| water.e2e.mjs | yes | sequential | default 60 | 4 | 0 | 1 | no | 53 | - | CONVERT-light: parallel combos; budgetMs; replace 4 sleeps with waitState/waitFor |
| worldEdge.e2e.mjs | yes | sequential | default 60 | 1 | 0 | 1 | no | ? | integrator | CONVERT-light: parallel combos; budgetMs |
| worldmap.e2e.mjs | yes | splitViewports | default 60 | 10 | 0 | 1 | no | 101.2 | - | CONVERT-heavy: budgetMs; replace 10 sleeps with waitState/waitFor; 101.2s > 60s budget |

## Conversion slices (disjoint files, biggest win first; files in use are held back until their owner finishes)

### Slice C1 (~1541 s of recorded runtime)
- chopAnim.e2e.mjs (360.1 s): runParallel desktop+phone, cut to <60 s (setTickMs/teleport/precondition), add budgetMs
- animation.e2e.mjs (243.1 s): rewrite on TEMPLATE (withGame, g.tapTile/teleportSettled), add budgetMs
- mining.e2e.mjs (281.6 s): swap 16 sleeps for waitState, cut to <60 s (setTickMs/teleport/precondition), add budgetMs
- animE.e2e.mjs (253.3 s): runParallel desktop+phone, cut to <60 s (setTickMs/teleport/precondition), add budgetMs
- settings.e2e.mjs (112.6 s): rewrite on TEMPLATE (withGame, g.tapTile/teleportSettled), add budgetMs
- minimap.e2e.mjs (117.5 s): rewrite on TEMPLATE (withGame, g.tapTile/teleportSettled), add budgetMs
- minimapRegions.e2e.mjs (172.6 s): cut to <60 s (setTickMs/teleport/precondition), add budgetMs

### Slice C2 (~648 s of recorded runtime)
- newfish.e2e.mjs (144.6 s): cut to <60 s (setTickMs/teleport/precondition), add budgetMs
- levelUp.e2e.mjs (57.5 s): rewrite on TEMPLATE (withGame, g.tapTile/teleportSettled), add budgetMs
- ground.e2e.mjs (118.9 s): swap 6 sleeps for waitState, cut to <60 s (setTickMs/teleport/precondition), add budgetMs
- areas.e2e.mjs (66.7 s): rewrite on TEMPLATE (withGame, g.tapTile/teleportSettled), add budgetMs
- rodRest.e2e.mjs (115.1 s): cut to <60 s (setTickMs/teleport/precondition), add budgetMs
- worldmap.e2e.mjs (101.2 s): swap 10 sleeps for waitState, cut to <60 s (setTickMs/teleport/precondition), add budgetMs
- viewport.e2e.mjs (44 s): rewrite on TEMPLATE (withGame, g.tapTile/teleportSettled), add budgetMs

### Slice C3 (~452 s of recorded runtime)
- oakTuning.e2e.mjs (101.4 s): cut to <60 s (setTickMs/teleport/precondition), add budgetMs
- smoke.mjs (31.7 s): rewrite on TEMPLATE (withGame, g.tapTile/teleportSettled), add budgetMs
- skills.e2e.mjs (38.2 s): rewrite on TEMPLATE (withGame, g.tapTile/teleportSettled), add budgetMs
- chat.e2e.mjs (24.7 s): rewrite on TEMPLATE (withGame, g.tapTile/teleportSettled), add budgetMs
- fishing.e2e.mjs (86 s): swap 6 sleeps for waitState, synth.frames, cut to <60 s (setTickMs/teleport/precondition), add budgetMs
- gait.e2e.mjs (85.3 s): swap 6 sleeps for waitState, cut to <60 s (setTickMs/teleport/precondition), add budgetMs
- animE2.e2e.mjs (84.7 s): cut to <60 s (setTickMs/teleport/precondition), add budgetMs

### Slice C4 (~335 s of recorded runtime)
- inventory.e2e.mjs (18.8 s): rewrite on TEMPLATE (withGame, g.tapTile/teleportSettled), add budgetMs
- footer.e2e.mjs (12.2 s): rewrite on TEMPLATE (withGame, g.tapTile/teleportSettled), add budgetMs
- respawn.e2e.mjs (64 s): swap 4 sleeps for waitState, cut to <60 s (setTickMs/teleport/precondition), add budgetMs
- fireBlock.e2e.mjs (? s): runParallel desktop+phone, swap 5 sleeps for waitState, add budgetMs
- lightPolish.e2e.mjs (? s): runParallel desktop+phone, swap 5 sleeps for waitState, add budgetMs
- nameplateClampPlay.e2e.mjs (? s): runParallel desktop+phone, swap 4 sleeps for waitState, add budgetMs
- tabsSettings.e2e.mjs (? s): runParallel desktop+phone, swap 4 sleeps for waitState, synth.frames, add budgetMs

### Slice C5 (~418 s of recorded runtime)
- nameplateWalkStartDiag.e2e.mjs (? s): runParallel desktop+phone, add budgetMs
- canvasRender.e2e.mjs (? s): runParallel desktop+phone, add budgetMs
- coal.e2e.mjs (58 s): runParallel desktop+phone, swap 4 sleeps for waitState, add budgetMs
- cookPose.e2e.mjs (? s): runParallel desktop+phone, add budgetMs
- fastBase.e2e.mjs (? s): 
- fishArt.e2e.mjs (? s): runParallel desktop+phone, add budgetMs
- nameplateClamp.e2e.mjs (? s): runParallel desktop+phone, add budgetMs

### Slice C6 (~367 s of recorded runtime)
- roofs.e2e.mjs (? s): runParallel desktop+phone, add budgetMs
- visualSmoke.e2e.mjs (? s): runParallel desktop+phone, add budgetMs
- stacking.e2e.mjs (49 s): runParallel desktop+phone, swap 11 sleeps for waitState, add budgetMs
- water.e2e.mjs (53 s): runParallel desktop+phone, swap 4 sleeps for waitState, add budgetMs
- bigWorldAreas.e2e.mjs (49.7 s): runParallel desktop+phone, swap 6 sleeps for waitState, add budgetMs
- fernhavenBank.e2e.mjs (48.3 s): runParallel desktop+phone, swap 7 sleeps for waitState, add budgetMs
- playerLook.e2e.mjs (46.6 s): runParallel desktop+phone, swap 8 sleeps for waitState, add budgetMs

### Slice C7 (~314 s of recorded runtime)
- trees.e2e.mjs (53.3 s): runParallel desktop+phone, add budgetMs
- fireVisuals.e2e.mjs (38.7 s): runParallel desktop+phone, swap 15 sleeps for waitState, add budgetMs
- longWalk.e2e.mjs (48.6 s): runParallel desktop+phone, add budgetMs
- minimapLabels.e2e.mjs (47.6 s): runParallel desktop+phone, add budgetMs
- bankBooth5.e2e.mjs (40.6 s): runParallel desktop+phone, swap 6 sleeps for waitState, add budgetMs
- fishFlash.e2e.mjs (44.6 s): runParallel desktop+phone, add budgetMs
- cameraInset.e2e.mjs (40.2 s): runParallel desktop+phone, swap 4 sleeps for waitState, add budgetMs

### Slice C8 (~256 s of recorded runtime)
- saves.e2e.mjs (35.8 s): runParallel desktop+phone, swap 8 sleeps for waitState, add budgetMs
- cookFire.e2e.mjs (41.1 s): runParallel desktop+phone, add budgetMs
- examineTexts.e2e.mjs (40.8 s): runParallel desktop+phone, add budgetMs
- lockedMenu.e2e.mjs (40.8 s): runParallel desktop+phone, add budgetMs
- treeSway.e2e.mjs (37.1 s): runParallel desktop+phone, add budgetMs
- groundItems.e2e.mjs (30.9 s): runParallel desktop+phone, swap 8 sleeps for waitState, add budgetMs
- fireWire.e2e.mjs (29.3 s): swap 7 sleeps for waitState, synth.frames, add budgetMs

### Slice C9 (~137 s of recorded runtime)
- mmLabel.e2e.mjs (33.8 s): runParallel desktop+phone, add budgetMs
- f3.e2e.mjs (21.6 s): swap 5 sleeps for waitState, synth.frames, add budgetMs
- mmnet.e2e.mjs (20.2 s): swap 6 sleeps for waitState, add budgetMs
- itemIcons.e2e.mjs (17 s): swap 6 sleeps for waitState, synth.frames, add budgetMs
- hudFold.e2e.mjs (16.7 s): swap 6 sleeps for waitState, synth.frames, add budgetMs
- inventorySwap.e2e.mjs (13.9 s): swap 5 sleeps for waitState, add budgetMs
- ashesIcon.e2e.mjs (13.4 s): swap 4 sleeps for waitState, add budgetMs

### Slice C10 (~24 s of recorded runtime)
- netAnim.e2e.mjs (12.4 s): swap 4 sleeps for waitState, add budgetMs
- foldPersist.e2e.mjs (11.1 s): swap 4 sleeps for waitState, add budgetMs

### Slice C11 (~234 s of recorded runtime)
- drops.e2e.mjs (28.5 s): add budgetMs
- chatUi.e2e.mjs (28.2 s): add budgetMs
- dialogueAvatar.e2e.mjs (28.1 s): add budgetMs
- depositChest.e2e.mjs (27.8 s): add budgetMs
- greatmereEast.e2e.mjs (25.9 s): add budgetMs
- orbs.e2e.mjs (21.4 s): add budgetMs
- useItem.e2e.mjs (17 s): add budgetMs
- fireArt.e2e.mjs (11.9 s): add budgetMs
- logPile.e2e.mjs (11.9 s): add budgetMs
- skillTags.e2e.mjs (13.4 s): add budgetMs
- skillUnlocks.e2e.mjs (12.4 s): add budgetMs
- hudBankDock.e2e.mjs (7.7 s): add budgetMs

### Held (in use; convert after owner is done)
- Q3-A:
  - animC.e2e.mjs (101.4 s): swap 7 sleeps for waitState, cut to <60 s (setTickMs/teleport/precondition), add budgetMs
  - axeSound.e2e.mjs (106.2 s): swap 4 sleeps for waitState, cut to <60 s (setTickMs/teleport/precondition), add budgetMs
  - bankerGreeting.e2e.mjs (107.6 s): cut to <60 s (setTickMs/teleport/precondition), add budgetMs
  - blocked.e2e.mjs (111.7 s): rewrite on TEMPLATE (withGame, g.tapTile/teleportSettled), add budgetMs
  - camJerk.e2e.mjs (70.3 s): swap 5 sleeps for waitState, cut to <60 s (setTickMs/teleport/precondition), add budgetMs
  - cull.e2e.mjs (83.3 s): swap 5 sleeps for waitState, cut to <60 s (setTickMs/teleport/precondition), add budgetMs
  - fireLight.e2e.mjs (76 s): swap 8 sleeps for waitState, cut to <60 s (setTickMs/teleport/precondition), add budgetMs
  - fishChat.e2e.mjs (102.2 s): cut to <60 s (setTickMs/teleport/precondition), add budgetMs
  - gaitB.e2e.mjs (152.7 s): cut to <60 s (setTickMs/teleport/precondition), add budgetMs
  - hud.e2e.mjs (72.1 s): rewrite on TEMPLATE (withGame, g.tapTile/teleportSettled), add budgetMs
  - isoBankRules.e2e.mjs (75.3 s): rewrite on TEMPLATE (withGame, g.tapTile/teleportSettled), add budgetMs
  - isoTap.e2e.mjs (144 s): rewrite on TEMPLATE (withGame, g.tapTile/teleportSettled), add budgetMs
  - lockedDialogue.e2e.mjs (61.1 s): cut to <60 s (setTickMs/teleport/precondition), add budgetMs
- Q3-C1:
  - bank.e2e.mjs (326.5 s): rewrite on TEMPLATE (withGame, g.tapTile/teleportSettled), add budgetMs
  - buildings.e2e.mjs (64.5 s): runParallel desktop+phone, swap 4 sleeps for waitState, synth.frames, cut to <60 s (setTickMs/teleport/precondition), add budgetMs
  - isoBank.e2e.mjs (64.8 s): rewrite on TEMPLATE (withGame, g.tapTile/teleportSettled), add budgetMs
- integrator:
  - bigWorld.e2e.mjs (90.9 s): rewrite on TEMPLATE (withGame, g.tapTile/teleportSettled), add budgetMs
  - isoCamera.e2e.mjs (99.9 s): rewrite on TEMPLATE (withGame, g.tapTile/teleportSettled), add budgetMs
  - minZoom.e2e.mjs (119 s): runParallel desktop+phone, swap 8 sleeps for waitState, cut to <60 s (setTickMs/teleport/precondition), add budgetMs
  - worldEdge.e2e.mjs (? s): runParallel desktop+phone, add budgetMs
- vfx:
  - vfxHooks.e2e.mjs (79.3 s): runParallel desktop+phone, swap 7 sleeps for waitState, cut to <60 s (setTickMs/teleport/precondition), add budgetMs
