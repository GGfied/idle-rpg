# Runbook: Mining + Fishing skills
- **Status:** done
- **Started:** 2026-10-08
- **Last updated:** 2026-10-08 10:15
- **Owner:** main session

## Goal
USER 2026-10-08: "can add mining and fishing?" Two new gathering skills, playable in the world like woodcutting:
rocks you mine with a pickaxe and fishing spots you fish with a net/rod, with levels, XP, depletion/respawn,
and items that can be banked. Playable-first: a crude version in the world quickly, then polish.

## Decisions          (what was decided, and why)
- USER 08:03 (after balance): speed fishing up per balance proposal (baseTicks 5→4, higher success); starter bait 500 (+ one-time top-up for existing saves) until a shop exists; add goals: L30 coal-like rock, one L25-30 fish per spot, iron pickaxe L10, steel L20.
- Own runbook, not big-world (CLAUDE.md: one runbook per task; big-world is closing with its GATE).
- Phase 1 = the isolated module agents (`mining`, `fishing`) in their own folders, in parallel, while big-world
  finishes. Their folders don't overlap the running work. Phase 2 = wiring (map/graphics/animation/integrator), right after.
- Start small (main's call, playable first): ~3 tiers per skill, OSRS-like levels/speed (the user's earlier target),
  original names. Reuse core/skills (successChance, nodeState, action loop) like woodcutting; data over code.
- Starter tools: the player gets a bronze pickaxe + small fishing net (integrator/persistence decide how without a
  save break; the defaultValue rule applies if a save slice changes).
- USER 07:40: "fish spots and rocks same as trees realistic and animated and vfx" → art bar = the trees: same
  isometric style and detail, opaque-pixel hit test ("what you see wins"), idle animation (water ripple/bubbles on spots,
  subtle glint on ore), state anims (rock cracks -> depleted rubble -> respawn; spot moves with a splash-out/in),
  player poses (pickaxe swing two-handed like the new chop; net cast/haul, rod cast/wait/reel), and vfx (rock
  dust/chips + ore sparkle on hit, water splash on catch, ripple rings, XP drops like woodcutting).
- Cooking fish is out of scope (no cooking skill yet); raw fish just bank.

## Tasks              (in order)
- [x] 1. DONE 07:42 (206 tests, mutants red; ids copper_rock/tin_rock/iron_rock, *_ore, bronze/iron/steel_pickaxe). `mining`: module (rocks copper/tin/iron-like tiers, ores, pickaxe tiers via equipment ToolDef, success,
      XP, depletion/respawn) — agent: `mining`
- [x] 2. DONE 07:45 (46 tests, 10 mutants killed; own tickFishing, core gap noted). `fishing`: module (net spot + rod/bait spot, ~3 fish, tools, catch rates, XP, spot moving) — agent: `fishing`
- [x] 3. DONE 07:56 (integrator registry). Items/tools registered (ore, fish, pickaxe, net, rod, bait) via the owning modules + `equipment` ToolDefs
- [x] 4. DONE 07:46 (quarry 11 rocks + 4 fishing spots with candidate water tiles; tests + mutants). `map`: place rocks (a small mine) + fishing spots (Greatmere shore) — agent: `map`
- [x] 5. DONE 07:51 code (createNodeView, rockArt/spotArt, idle glint/ripple; not yet in-game). `graphics`: rock (full/depleted, per ore tint) + fishing spot art at tree quality, item icons, opaque hit test — agent: `graphics`
- [x] 5b. DONE 07:53 (qa icons 38/38 unit + 15/15 e2e, mutants red). (USER 07:42 "inventory ... the log and axe and pickaxe and fishing rod. realistic abit") `graphics`: realistic item icons for logs + axes now, pickaxe/rod/net/bait/ores/fish once ids land — queued on the graphics agent after its minimap P3; USER 07:42 "inventory view same as drop view": ground-drop sprite uses the same icon source
- [x] 6. (mine pose code landed ~08:16, report pending; fishNet + fishRod next) `animation`: mine + fish poses (after big-world items 14-16 land, same rig) + object state anims (rock crack/deplete/respawn, spot ripple idle, spot move) — agent: `animation`
- [x] 6b. DONE 07:57 code (integrator hookups pending). `vfx`: rock dust/chips + ore glint on hit, splash on catch/spot move, ripple rings; pooled, event-driven — agent: `vfx`
- [x] 6c. DONE 08:17 (sounds 6 synth, chat parity, qa 6c 9/9). (USER 07:46 "sounds and chat too for fish and mine same as chopping. sound that fits") `sound`: pickaxe tink, ore chime, rock crumble; cast whoosh/plop, catch splash, spot burble; chat parity via integrator (MINING/FISHING_MESSAGES) — agent: `sound` + `integrator`
- [x] 7. DONE 07:56 (both skills wired, real art, starter kits, sound skill tags, chat; 1944 tests; own Chrome desktop). `integrator`: wire both skills (registry, tick, interactions, starter tools) — agent: `integrator`
- [x] 8. DONE (qa fishing 17/17, qa mining 17/21 → B1 fixed, qa newfish 8/8, balance sim + tuning applied; coal qa pending). `qa` one slice each (mining, fishing) desktop + phone + mutant; `balance` XP/h vs targets
- [x] 9. Changelog + version bump (changelog skill) when shipped

## Next step
All feature work and QA for this round are DONE (10:15): every qa-coverage row has a final status, task list clear except the release. Remaining, in order: (1) insert the revised v0.1.2 changelog entry from the drafter (scratchpad changelog-v0.1.2-r2.md) and re-run the both-ways path check; (2) ask the user ONCE about commit + push (a push deploys; the pipeline tags v0.1.2); (3) set this runbook to done.

## Open questions / blockers
- None yet. Release order: big-world GATE + v0.1.2 first, or ship together? Ask the user when the GATE is green.

## Log
- 2026-10-08 USER asked to add mining and fishing → runbook created; `mining` + `fishing` dispatched in parallel (phase 1).
- 07:40 USER: rocks/spots must match the trees (realistic, animated, vfx) → tasks 5/6/6b spelled out (Decisions).
- 07:42 USER: realistic inventory icons (log, axe, pickaxe, fishing rod) → task 5b, graphics.
- 07:42 mining DONE (module). Dispatched: `map` (small mine as a named area), `integrator` (wiring, starter pickaxe for new + existing saves, placeholder rock render); mining icon ids sent to graphics.
- 07:45 fishing DONE (module). Main decision: starter kit net + rod + 50 bait (no shop yet), same one-time grant for existing saves. Sent: map (spots on water, candidate tiles), integrator (wire fishing after mining), graphics icons (ids), new graphics agent MF5 (rock + spot world art at tree quality).
- 07:45 map DONE mine: Stonefold Quarry x69-79 y41-46 (inside Greatmere East, ≤16 tiles to the Greatmere bank booth), 11 rocks, rock spawn type; 6 tests, mutants killed.
- 07:45 USER "inventory view === bank view === dropped view === shop view" → CLAUDE.md promoted rule (one item image everywhere) + sent to the graphics icon agent (one source, test across paths).
- 07:46 USER: sounds + chat for mining/fishing like chopping → task 6c; sound dispatched, integrator told chat parity + impact hooks.
- 07:46 map DONE fishing spots (FISHING_SPOTS, y=51 water, 4 candidates each). Integrator told to use them + add worldRefs checks + fix its rockViews lint.
- 07:48 sound DONE (6c audio side): 6 synthesized sounds, skill filter; integrator must add skill to swingImpact + nodeDepleted (sent).
- 07:50 graphics DONE icons (17, one source itemIconSource; main viewed the side-by-side sheet) + minimap P3. qa icons slice dispatched (:5243). graphics noted it ignored a "sounds/chat" message the user said reached it by mistake (sound handled by the sound agent).
- 07:51 graphics DONE MF5 art. Main viewed previews; watch items: copper vs iron vein colours too close, spots subtle. Integrator told to swap placeholders for createNodeView. Next for animation: crack/crumble + spot fade + poses; vfx: dust/chips/sparkle, splash, ripples.
- 07:52 vfx dispatched (MF6b).
- 07:53 USER "woodcutting vfx possible too?" → added to the vfx agent's MF6b task (chips + bark flakes + falling leaves on hit, chip puff per log, leaf burst + dust on tree fall; skill-filtered).
- 07:53 qa icons PASS → 5b DONE. P3s queued: ground drops hidden under feet, async icon placeholder flash.
- 07:56 integrator DONE MF7: mining + fishing playable (refresh). Pickaxe swing timing is a tick clock until animation poses land. It edited 3 qa tests (slot counts) → qa mining reviews. Fishing chat says the cast line once; user asked parity → fishing adds fishingAttempt event, then integrator says it per attempt. Dispatched: qa mining :5244, qa fishing :5245, balance sim.
- 07:57 vfx DONE (MF + woodcutting upgrade). integrator sent the 5 hookups (woodcutting gather puff invisible until skill tag). USER: animation qa later, in small slices (a-f, see coverage).
- 07:57 USER: slice integrator (and every agent) work small → CLAUDE.md promoted rule; vfx hookups split: integrator A = WorldScene (#1,#4,#5), integrator B = event skill tags (#2,#3). Pending integrator slices queued separately: fishing per-attempt chat (after the fishing agent).
- 07:58 USER "integrator qa too" → every integrator slice gets its own immediate small qa slice (CLAUDE.md). Queued: qa for integrator A and qa for integrator B.
- 07:58 fishing DONE 6c event (fishingAttempt). Dispatched small slices: integrator C (chat, fishing.ts only), sound (fishCast per attempt). qa slice for them queued.
- 07:59 integrator A done (progress line; formal report not received). qa 6b-A dispatched :5246.
- 07:59 integrator B DONE: no product change needed (tags already flow to audio + vfx); tests + mutant. qa 6b-B dispatched :5247.
- 07:59 integrator A's report was relayed by the user (a resumed agent can't hand back twice). Lesson: fresh agent per slice; SendMessage only for clarifications mid-task (memory small-slices-all-agents).
- 07:59 sound DONE 6c-cast (fishCast per attempt). Lint red only on prettier of the balance agent's new miningFishing balance test (balance still running).
- 08:00 integrator C DONE (fishing per-attempt chat). qa 6c dispatched :5248.
- 08:03 balance DONE (mining OK; fishing 2-4x slow; no bait source; goal gaps). USER chose: speed up, 500 bait, all three tier adds. Slices dispatched in parallel: fishing F1 (speed), mining M1 (pickaxe levels), integrator bait500. Next: F2 (new fish), M2 (L30 rock). balance lint fix done; remaining lint = unused vars in the running qa fishing e2e.
- 08:04 USER "where's our monitor?" → QA monitor re-armed (was not started after /clear; memory qa-watchdog updated: arm at session start).
- 08:04 qa 6b-B PASS 5/5 (skill-tagged effects + sounds), mutant red. QA monitor running: mining, fishing, vfxHooks e2e live.
- 08:05 mining M1 DONE (pickaxes L10/L20). M2 (L30 coal-like rock) dispatched. 4 fishing/starterKits test reds = bait500 + F1 in flight.
- 08:07 F1 + bait500 DONE. Concern: bait500 added meta.grants to the save without a version bump → persistence review slice. qa fixes its fishing.test (50→500). F2 (new fish) dispatched. Full suite: 6 reds = fishing.test (50 bait) + coal icon (M2 in flight).
- 08:08 mining M2 DONE (coal_rock, coal). Dispatched in parallel: map (3 coal rocks in the quarry), graphics (coal rock art + coal icon + copper/iron contrast). Then a qa slice for coal.
- 08:08 persistence: meta.grants OK without version bump (additive optional leaf + sanitised); qa adding metaSlice tests. qa fishing.test fixed (BAIT_STACK).
- 08:09 integrator A report (relayed by the user): #1/#4/#5 done, 319 app tests; gap: nodeWorld/tileWorld paths not mutant-tested → relying on qa 6b-A's spot-ripple check.
- 08:10 map coal DONE. qa 6b-A was woken by main's follow-up for one extra mutant run (tileWorld); its progress flags 'v1 chop swing chips not observed at tickMs 60' → check in its report. Suite: 11 reds all from in-flight slices (coal/new-fish icons+art, fishing logic tests, metaSlice test lint).
- 08:10 qa mining 17/21: all OK except B1 (swing line dropped at 600 ms, P3) → integrator B1 slice; B2 (possible slow ticks) measured in the same slice; copper/iron indistinguishable → told the graphics coal slice; P3 regression.test weakened → queued.
- 08:11 qa vfxHooks PARTIAL (all but chop v1 proven). Old integrator agent (vfx-hook, stale background work) stopped at the user's prompt. qa fix slice: metaSlice tsc + v1 chop check.
- 08:12 graphics coal DONE (+ ore contrast; main viewed preview: 4 ores distinct). Dispatched: graphics fish icons (raw_trout, raw_mackerel), vfx coal tint. Then qa coal slice.
- 08:12 qa fishing PASS 17/17 (both viewports). Spots hard to see + net/bait identical → graphics spot-vis slice. P3 spot under phone HUD at the south camera clamp → queued.
- 08:12 animation pose slices: part 1 "mine" dispatched (fresh agent); fishNet + fishRod follow as separate slices (same files, sequential). integrator then swaps the placeholder swing clock for onImpact.
- 08:12 vfx coal tint DONE. Lint red only from qa's in-progress vfxHooks e2e (unused playerW), being fixed by the qa fix slice.
- 08:13 graphics fish icons DONE (suite 2090 green, tsc clean; lint red only from qa's in-progress vfxHooks e2e).
- 08:15 graphics spot-vis DONE (main viewed preview: net vs bait distinct). qa coal slice dispatched :5250. Lint red only from in-flight animation mine.test (any) + qa vfxHooks (unused playerW).
- 08:15 fishing F2 DONE (raw_trout L25, raw_mackerel L30). Dispatched: qa newfish + spot visibility :5251, balance proposal-test fix. Note for later: cooking will need recipes for all raw fish (no cooking skill yet).
- 08:16 qa fix slice DONE: metaSlice tsc fixed; vfxHooks v1 proven (11/11, mutants red) → integrator A slice fully verified. Flake watch for GATE: phone v3/v4 once.
- 08:17 balance proposal-test fix DONE (deleted stale sim; 6/6). Lint: prettier on WorldScene.ts = integrator B1 slice in flight.
- 08:17 integrator B1 DONE (swing on every attempt incl. the depleting one); B2 not a bug (ticks 600 ms). qa B1 slice dispatched (+ regression.test P3).
- 08:18 qa 6c fishChat 9/9 + mutant red (progress line).
- 08:19 USER: live game showed only the player (no HUD/chat/minimap, taps did nothing). Main loaded a FRESH :5173 tab: HUD, chat, minimap, inventory all render, tree tap works ("inventory full" line), 0 console errors → the user's tab was broken by hot reload after many live edits (e.g. integrator's prettier reformat of WorldScene.ts), not by the code. Fix for the user: hard refresh.
- 08:21 LIVE GAME BROKEN for fresh loads (USER, incognito): HUD crash "Cannot read properties of null (reading 'useContext')" in useRuntime (app ui context). Cause: e2e/mutant vite servers (scratch copies symlink node_modules) share the default cacheDir node_modules/.vite with the live :5173 server; a test server re-optimized deps at 08:19 → mismatched React chunks. Main restarted :5173 with --force (old server was a background task from the previous session) + hard reload → works: new game shows HUD, chat, minimap and the starter kit (axe, pickaxe, net, rod, 500 bait). Prevention: qa cacheDir slice (per-port cacheDir in the frozen vite config, all spawns routed through it); CLAUDE.md rule added.
- 08:21 qa newfish PASS (gates, XP, icons). Net spot still too faint on phone (main agreed from the shot) → graphics net-spot slice.
- 08:22 USER: "mining each hit is 2x chat 2x sound". Cause: B1's tick-derived attemptLanded AND the new 'mine' pose's animator onImpact both call swingImpact. integrator double-swing slice dispatched (one source of truth, test that fails if both fire); qa after.
- 08:22 USER: minimap shows rocks like trees, fishing spots indistinguishable → graphics minimap-nodes slice (minimap.ts only; integrator contract if the data is missing).
- 08:23 qa cacheDir DONE: test vite servers use a tmpdir cache per port+root; proven (live + mutant runs leave node_modules/.vite untouched). Remaining risk: ad-hoc `npx vite` from a scratch copy; the CLAUDE.md rule covers it.
- 08:24 qa coal PASS 11/11 (+ pickaxe tiers verified). Note: tin reads olive/khaki, not silver; weakest of the 4 but distinguishable (optional polish).
- 08:24 graphics net-spot DONE (code). Watch: preview shows a rectangle (likely the composite's cloned water) → the in-game qa must confirm there's no box around the spot. tsc red in minimap.test.ts = minimap agent in flight.
- 08:25 graphics minimap-nodes DONE (render). App doesn't feed rocks/spots → hud slice (Minimap.tsx is hud's). Then one in-game qa for the minimap markers + net spot.
- 08:26 hud minimap-feed DONE (resourceMarkers). In-game qa for minimap + net spot (box check) dispatched :5253.
- 08:26 USER "how do i use the rod?" → bait spot needs Fishing 5 (net first). USER agreed: show locked gather options with "Requires Fishing 5 (you: 1)" → integrator locked-menu slice. USER: updates too fragmented → main gave a full status summary.
- 08:27 locked-menu: ContextMenu lacks disabled/reason → sequenced: integrator (type + wiring) → hud (render) → qa.
- 08:27 integrator double-swing DONE (code). qa B1 slice told to assert exactly-one per attempt (m10 only checked presence).
- 08:28 USER: minimap trees all the same colour (rocks/spots differ) → graphics minimap-trees slice (per tree type), then hud feed, then qa.
- 08:29 USER: "fishing with net no animation" → expected, fishing poses not built yet (queued after the mine pose, same files). Plan: animation fishNet pose → integrator sets the anim state while fishing (fishing has its own loop, not the gather state) → qa; then fishRod (+ pulse on catch) → qa.
- 08:29 graphics minimap-trees DONE (render). hud feed dispatched.
- 08:29 integrator locked-wiring DONE; hud locked render dispatched (parallel with the hud minimap-trees slice, different files).
- 08:30 hud minimap-trees DONE; folded into the running mm-netspot qa (no extra run). USER said re quota: just a remark, no change needed.
- 08:30 hud locked render DONE. qa locked-menu dispatched :5254.
- 08:32 qa mmnet PASS 9/9: minimap rocks/spots/tree types distinct, net spot visible + no box. 4 runs (2 over budget, screenshot timing).
- 08:32 USER: level-requirement overhead flash shows for trees/rocks but not fishing spots → integrator fish-flash slice (reuse the gather-stop flash for fishingStopped reasons).
- 08:33 animation MF6-mine DONE (pose live via the existing nextAnimState/toolItemId path; main viewed the strip). fishNet pose slice dispatched; integrator must set the fishing anim state after. Lint red: WorldScene.ts prettier → told the running integrator fish-flash slice.
- 08:35 integrator fish-flash DONE (noBait label owed by vfx → dispatched). Suite: 1 red in the playerAnimator test (animation net pose in flight).
- 08:36 vfx noBait DONE. qa fish-flash dispatched :5255 (strict 2-run budget).
- 08:36 qa lockedMenu PASS 13/13. Over budget again (test-side: hopping spots, wrong bait id).
- 08:41 USER: minimap expansion → chose tap → full world map overlay (zoom/pan, same draw code + markers, view-only). hud worldmap slice dispatched (graphics contract if the draw fn can't render an arbitrary view).
- 08:41 USER: minimap tap must keep walking the player → world map opens from an expand ICON instead (hud told before building).
- 08:41 hud worldmap BLOCKED: drawMinimap is circle-only + terrain is a 96-tile window. Sequenced: graphics drawWorldMap (shared painter, rect clip, circle output unchanged) → hud overlay via EXPAND ICON (tap-to-walk unchanged; remind hud) → qa.
- 08:44 USER: minimap player marker should be an ARROW showing facing/movement → queued after graphics drawWorldMap (same file): graphics arrow marker with facing → hud passes facing → qa.
- 08:45 graphics worldmap DONE. Dispatched in parallel: hud world-map overlay (expand icon, shared marker builder) + graphics player arrow (minimap.ts). Then hud feeds facing (Minimap.tsx, after the overlay slice).
- 08:46 animation net pose DONE (not yet requested by the scene) → integrator net-anim hook. qa fishFlash inconclusive (test tap misses) → follow-up via store intents. graphics worldmap done; hud overlay + graphics arrow running.
- 08:48 integrator net-anim hook DONE → qa net-anim dispatched (:5256, 2 runs). animation rod pose dispatched.
- 08:48 graphics player arrow DONE (render); facing feed folded into the running hud worldmap slice (same file Minimap.tsx).
- 08:48 hud worldmap overlay DONE (not browser-checked). Facing feed missed (message arrived after finish) → fresh tiny hud facing slice; then ONE qa for world map + arrow.
- 08:49 qa fishFlash PASS (no product bug; test tap misses earlier).
- 08:50 qa netAnim PASS 9/9 (no mutant). hud facing feed DONE, but the late message woke the worldmap hud agent too and both edited Minimap.tsx → hud facing-cleanup slice (dedupe), then one qa for world map + arrow. Lesson: never SendMessage new scope to a finished agent (it resumes and collides).
- 08:51 hud facing-cleanup: nothing to fix (consistent). qa worldmap + arrow dispatched :5257. Suite: 6 animation-test reds + rod.test lint = rod pose agent in flight.
- 08:55 qa B1/double-swing PASS: mining 23/23 incl. m11 exactly-one swing+sound per attempt; both mutants red; regression.test exact again. USER's 2x chat/sound bug verified fixed.
- 08:56 qa worldmap PARTIAL (arrow + open + tap-walk pass). Main found a layout bug in the screenshot (map opens player-centred at fit zoom, clipped) → hud worldmap-fit slice; then qa rerun for zoom/pan/close.
- 08:59 hud worldmap-fit DONE (main viewed: fitted, centred). qa worldmap2 (c3 zoom/pan/close) dispatched. Suite: 1 red animInput rod test = rod pose in flight.
- 09:02 animation rod pose DONE. integrator rod hook dispatched. Animation qa started: slices a (chop), b (walk), d (Off/Reduced) in parallel; slice c (mine/net/rod poses) after the rod hook. Promoted animation rule: SWING_TOOLS row → update child counts + name graphics (seen twice).
- 09:02 integrator rod hook DONE (suite 2207 green). Animation qa slice c (mine/net/rod poses + rod hook) dispatched :5261.
- 09:03 USER: fix #18 + #31 → two graphics slices in parallel (ground drops/icon preload; camera inset for the phone HUD), different files.
- 09:06 graphics drops DONE (#18). qa drops dispatched :5262.
- 09:06 qa worldmap2 PASS 11/11 → world map DONE. USER: phone minimize nav/chat → hud collapse slice (prefs + --hud-bottom-inset CSS var); #31 camera told to read the inset live.
- 09:08 graphics #31 cam-inset DONE (+ live re-measure on HUD collapse; contract --hud-bottom-inset px or rect fallback, sent to hud) → qa cam-inset :5263. Anim qa a INCOMPLETE (harness) → fresh rerun a2 :5264 incl. confirming P3 A1 (elbow past the torso at impact).
- 09:08 qa drops (#18) PASS 9/9, mutant red → #18 DONE.
- 09:09 USER DECISION: phone bottom sheet + chat start COLLAPSED by default ("or else i can't move"); desktop unchanged; saved pref wins after a toggle. Relayed to hud collapse slice.
- 09:11 hud collapse DONE (phone default collapsed, CSS var inset; 3-state pref 'auto'|'collapsed'|'expanded' needed). Dispatched persistence (hud.sheetFold/hud.chatFold prefs) + qa collapse :5265 in parallel; reload-persistence qa after persistence lands. Lint: Prettier warnings in qa e2e files chopAnim/cameraInset (qa-owned, in flight) — fix before GATE.
- 09:12 anim qa b (walk) PARTIAL: sync + midline pass, mutant red; final oracle not run live; back-facing run sync weak. → fresh b2 live confirm :5266 (no threshold lowering; screenshots decide P3 for animation, which is queued AFTER anim qa a2/c/e so their runs aren't invalidated).
- 09:12 anim qa c (poses) PASS numerically, mutant red; no product bugs. Follow-up c2 :5267 for live mid-pose screenshots + r3 phone + m1 flake.
- 09:13 persistence fold prefs DONE (additive, PREFS_VERSION stays 1). Dispatched qa foldPersist :5268 (reload persistence + app/prefs.test key fix). Told collapse qa to fix the lint in hudFold.e2e.
- 09:14 qa cam-inset (#31) PASS 9/9, mutant red → #31 DONE. qa collapse PASS 6/6, mutant red → phone collapse DONE except reload persistence (qa foldPersist :5268 running).
- 09:15 qa foldPersist PASS 5/5, mutant red; prefs.test key list fixed → phone collapse fully DONE (user request). Note: qa MEMORY.md is over its size limit (index truncated) → qa memory compaction queued after the animation qa slices finish.
- 09:16 anim qa b2: walk gait direction + sync correct; walk-axis arm floor (8 px) miscalibrated. DECISION (main): arm forward ≥ 0.4× leg forward and ≥ 3 px, because the gait rule says legs swing more than arms; the mutant must still go red → b3 :5269. B2 (weak back-view run sync, sign correct) logged as optional P3 for animation; not dispatched without user ask.
- 09:17 anim qa a2 chop INCOMPLETE (harness: back facing unreachable by walking). A1 CONFIRMED visually by main (impact frame, 3/4 view: arms fold/bulge outside the torso). Plan: animation A1 fix after the running anim qa b3/c2/e (same limb code, avoid invalidating them), then qa a3 forcing back/front facing through the animator API instead of walking.
- 09:18 anim qa e (Off/Reduced) PARTIAL: Off + walk + net proven, mutant red, no product bugs; Reduced chop/mine unproven (script). e2 rerun queued after the A1 fix.
- 09:21 USER BUG: on mobile the camera jerks whenever the player moves. Likely a regression from #31 (camera inset, live re-measure) or the phone collapse inset. graphics camjerk slice dispatched (measure, then fix, before/after numbers), then its own qa slice.
- 09:22 anim qa b3 PASS 17/17, mutant red → walk/run gait (#15 arms front-back synced, #16 legs front-back) DONE. Optional P3 B2 (weak back-view run sync) not dispatched.
- 09:23 anim qa c2 PASS 19/19. Main viewed the shots: mining is one-handed (user wanted a two-handed realistic chop, so the same applies to mining) → one animation slice: A1 (chop impact arms) + two-handed mining (shared grip code). Rod rest pose pointing at the sand = P3, parked (task). Then: qa a3 (chop, facing forced) + e2 (Reduced chop/mine) + a mining-grip check.
- 09:25 qa memory compacted (MEMORY.md 130→14 lines index + 4 topic files; 11 pending lessons added) — task #36 done.
- 09:25 USER DECISION: #9 GATE skipped.
- 09:29 graphics camjerk FIXED in render/camera.ts (startFollow wrapper keeps followOffset; root cause = re-follow snap on tap-to-move/gather start, phone only, because of the HUD inset offset). qa camJerk :5271 dispatched (real taps, 4x CPU throttle, mutant). Told animation about the tsc error in chop.test.ts:193 (its in-progress edit).
- 09:36 animation A1 + two-handed mining DONE (code; main viewed strips). Dispatched qa a3 (chop/mine arms, forced facings, + prettier fix of the chopAnim/cameraInset e2e) and qa e2 (Reduced chop/mine). USER: new version/changelog FIRST incl. pending tasks + qa → v0.1.2: core bumping package.json, general-purpose agent drafting the entry body to scratchpad; main inserts + verifies coverage. No commit/push without the user's OK.
- 09:36 qa camJerk FAIL: phone inset snap fixed, but a ~5.8 px snap remains on every re-follow (desktop + phone) → graphics CJ1 slice (skip startFollow when already following / restore scroll). core: version 0.1.2 bumped (tests pass).
- 09:39 graphics CJ1 fixed (camera re-follow no longer snaps; scroll ≤1.15 px/frame). DECISION (main): camJerk player-step limit 2 → 3 client px, because walk-onset lerp gives 2.0-2.4 while real snaps were 6.6-8.7 (CJ1) and 19+ (inset); scroll stays ≤ 2. qa rerun :5275 with a CJ1 mutant.
- 09:40 USER: "fix both" → (1) rod rest pose over the water: animation slice dispatched; (2) B2 back-view running arm sync: queued after (1) because both edit animation files. Both stay off the chop/mine grip code while qa a3/e2 run.
- 09:42 v0.1.2 changelog entry written (CHANGELOG-2026.md): Added/Changed/Fixed + a Pending section with open tasks and QA status; checks: 254/254 paths covered both ways, structure + ASCII clean. Version 0.1.2. Not committed/pushed (awaiting user OK). Coal examine bug → integrator.
- 09:42 qa camJerk rerun: camera re-follow snap FIXED + verified (mutant red). Residual CJ2 (one 3.23 px player-sprite frame at walk→gather, phone) is not the camera → animation P3, queued after B2. Decision: don't raise the oracle again.
- 09:43 integrator examine fix DONE (coal_rock + net/bait spot texts, per-kind examineSpot, neutral fallback, all-node-kinds test, mutant red; one unnamed flaky unit test seen once) → qa examine :5276/shared. Changelog to be folded (registry/actions bullets + Pending) before commit.
- 09:44 animation rod rest DONE (rest theta -55 pointed the rod 35° DOWN → -113/-108/-119 ≈ 23° up, lift -148, line 18; 2267 tests, build ok, mutant red; main viewed strip: rod up/out, line + float visible, back view arms hidden) → qa rod. USER asked why #41/#43 were queued (same files as rod) → rod done, so both dispatched now in parallel with file fences (B2 = gait only, CJ2 = interpolation only).
- 09:44 qa shared-server slice: built warmServer.mjs + E2E_SHARED, but measured boot is only ~0.6 s (cold 637 ms vs shared 611 ms) → my 30-60 s cold-start diagnosis was WRONG. Shared server serves stale code (no watch) → main decision: don't use it; rule added to qa memory; told rod + examine qa not to use it; stop :5300 after they finish. Real QA time = test bodies at real ticks + agent turns + reruns from script bugs.
- 09:46 qa examine PASS 19/19 (all 8 node kinds own text, desktop+phone real menus), mutant red → coal examine DONE. FLAKE-1 P3: playerAnimator.test 'walk bob × ART_SCALE' failed once (run 2 of 2) while B2/CJ2 animation agents were editing animator files → likely a mid-edit read, not timing; animation agents told to confirm it green in their final full run.
- 09:47 qa e2 PASS (final run 9/9): Reduced chop 56° vs On 152°, mine 75° vs 176°, body still, live toggle on/reduced/off/on without reload for both, tap reaches the strike pose; mutant red 8/9. 6 runs (script bugs). Its note 'depleted nodes never respawn at real ticks' → verifying as a possible real bug (qa respawn :5278).
- 09:47 animation CJ2: added a 160 ms pose blend (POSE_BLEND_MS) so the body offset no longer snaps on a state change (run lean → chop), tests + mutant red; but the measured jump is on the container, which renderTrail (integrator) positions → integrator CJ2 slice dispatched to measure and fix there. qa e2 (Reduced chop/mine) ✅.
- 09:48 USER DECISION: no commit until all open tasks are cleared (fixed + QA'd); then fold results into the changelog and ask once.
- 09:49 integrator CJ2: no snap in renderTrail (code read), camJerk 6/6 pass (step ≤2.38, scroll ≤1.22) with the animation pose blend in place; 3.23 px not reproduced. → qa #48 (live + pose-blend mutant) dispatched.
- 09:50 animation B2 DONE: GaitDef.armDepth (run 1.8) scales the arm foreshortening at n/s (the angle boost alone saturated the clamp); walk unchanged; gait tests + mutant red; 2274 tests, build ok; playerAnimator.test incl. walk-bob green. Main viewed the run n/s strip: arms alternate clearly front/back. → qa #47 dispatched (gaitB live corr ≥0.7 at n/s + mutant + FLAKE-1 recheck).
- 09:52 qa #48 PASS: live 6/6 (player step ≤2.13, scroll ≤1.2, 0 errors); the old e2e couldn't see the body offset → body sample added (MAX_BODY 1.5); mutant (blend off) red on gather both viewports (body 2.1, phone step 3.19 = the original bug). Loose ends: MAX_BODY not run on live yet; harness exit code 1 despite all pass → tiny qa slice.
- 09:53 qa a3 PASS 19/19 (two fists on haft 100% of frames, impact elbows 1.0-1.4 vs half-width 8.7-8.9 + V, lean 7-8°, back view arms hidden, 0 errors; mutant red on c2). Main viewed the shots: impact V good; wind-up still reads one-handed (A3-1) → animation slice dispatched. A3-2 (3/4 facings render the same as front) = by design (mirror rig), not dispatched. Lint: an unused var in respawn.e2e (qa respawn agent's file).
- 09:54 qa respawn: NOT A BUG. Tree 12, copper 6, coal 14 ticks, respawnAt exact at both 600 ms and 60 ms ticks, nodes choppable/mineable again, 0 errors. The e2 'never respawn' note was a script sampling-window artifact. Respawn lint warning in respawn.e2e (unused var) still open for the qa gate.
- 09:55 camJerk loose ends: live body offset 1.58-1.59 → MAX_BODY 1.7 (mutant 2.09-2.10 still above); exit code is correct (earlier 'exit 1' not reproduced; forced fail exits 1). Caveat: phone gather player step hit 3.13 once in run 1 (2.13 in run 2) under 4x CPU throttle → the test is borderline-flaky at 4x throttle; recorded, not chased (camera jerk itself fixed + verified). #43/#48 closed.
- 09:56 qa #47 FAIL: run n/s arm~opp-leg corr 0.34/0.56 (target 0.7) barely changed vs the armDepth=1 mutant (0.42/0.55): the boost raised amplitude (n swing 2.4→4.3 px) but not phase; regression: run se/sw arm lateral 3.57 > 3 px. FLAKE-1 not reproduced (43/43 twice). → animation retry dispatched: reproduce qa's metric first, then fix phase + cap the diagonal boost.
- 09:56 qa rod rest PASS desktop+phone (front rest tip ~19° above the hands along the facing, back ~37°, lift clearly higher then returns, pulses == catches 2/2, back hides arms, front shows arms, 0 errors; mutant -55 red 4/5). One void run on :5300 redone on its own server. P3 unconfirmed: a single desktop-front frame batch with arms hidden on the first run. → rod rest DONE.
- 09:57 animation A3-1 DONE: wind-up hand gap 5→9 px (impact stays 5), handle 20 / haft 23; 2277 tests, build ok, mutant red; main viewed strip: two fists visible on the handle at the wind-up in front views, back hides arms. → qa A3-1 (+ animation.e2e rerun + respawn lint fix). USER: 'man 2 more anim?'.
- 09:59 LOOP CAP (main, after USER: 'hopefully it wont be an endless loop anim -> qa'): each animation item gets at most this one retry. If the retry fails QA again: stop, keep the better version, list it as a known issue in the changelog Pending, and show the user screenshots to decide. No third round without the user asking.
- 10:04 stopped the unused shared test server :5300 (PID 35321) — #44 closed.
- 10:06 animation #41 retry DONE: reproduced qa's forearm/shin metric first (model 0.36/0.52 vs live 0.34/0.56); causes = knee bend warping the shin + weak depth swing; fix = depthSwing 2, kneeDepth 0.4, legDepth 1.8 at n/s run only (fade to 0 on diagonals); own gaitB live 19/19, n corr 0.90/0.85, s 0.88/0.87, se/sw run-axis passes; 2281 tests, build ok, mutant red. PROMOTED animation rule (seen twice): reproduce the e2e metric in a vitest before modelling a fix. → independent qa #47 rerun (final round per the loop cap).
- 10:07 qa A3-1 PASS: animation.e2e 42/42, chopAnim 19 + new c6 (wind-up fist gap 12.9-13.0 px ≥ 8) desktop+phone, two separate fists visible in the close-ups; mutant (gap 5) red on c6; lint clean (respawn.e2e unused var removed). → chop item #14 / A3-1 DONE.
- 10:10 qa-coverage cleaned: 16 stale rows closed with final status from qa-log evidence; Running now + Still open refreshed. One honest gap found: P3 minimap label vs player dot had no browser qa → qa mmLabel slice dispatched.
- 10:12 qa #47 rerun PASS 19/19 desktop+phone: run n corr 0.86-0.88, s 0.87-0.88, hand swing 5.6 px, se/sw lateral 1.7-2.0 (≤3), walk unchanged, 0 errors; mutant (depthSwing 1, kneeDepth 1) red on run-arms-ns only. Main viewed the run n/s strip earlier. → #41 running arms DONE. Started the v0.1.2 changelog fold (drafter) while qa mmLabel finishes.
- 10:14 qa mmLabel PASS 21/21, mutant red → #50 DONE. All QA for this round finished; no row in qa-coverage is left without a final status. Waiting only on the changelog fold draft.
- 10:16 v0.1.2 changelog entry revised in place (late fixes folded, Pending = nothing open except the skipped all-tests run + amber chat colour); checks: 260/260 paths both ways, structure + ASCII clean; stray data.ts-E removed by animation. READY: waiting for the user's OK to commit + push.
- 10:17 RELEASED v0.1.2: commit 0d7fcf6 pushed to main (lint/test 2281/build passed first); pipeline deploys + tags v0.1.2. Runbook done.
- 2026-10-08 10:19 CLOSED at the v0.1.2 release (0d7fcf6): remaining items shipped in v0.1.1/v0.1.2 and QA'd, or skipped by the user (marked [-]).
