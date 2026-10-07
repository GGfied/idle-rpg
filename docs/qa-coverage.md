# QA coverage map

What a player can do, and which browser test proves it. Real taps/clicks, desktop 1280x800 + phone 390x844 unless noted.
Kept by the main session and updated in REAL TIME (user rule): ⏳ + port when a slice is dispatched, the result as soon as
it appears in `docs/qa-log.md` (agents append there the moment each run ends) or in a report. After a crash, read
`docs/qa-log.md` first: any line newer than this file's rows is a result not yet folded in.

Legend: ✅ verified (full run + test proven to fail when broken) · ⏳ re-running now · 🔧 fixed in code, browser check
pending · ❌ NOT COVERED (gap) · ➖ unit tests only

✅* = passed in full (17/17 desktop + phone) but the "test fails when broken" proof is not done yet.

Last updated: 2026-10-08 ~06:20 (qa-log folded through line 51). Running now: see "Running now" at the bottom.
(Earlier: the 04:55 session death killed every in-flight run; those rows were re-checked and corrected.)
Health at the audit: tsc clean, vitest 91 files / 1312 tests pass, lint 5 errors (unused vars in axeSound.e2e.mjs ×4,
chatUi.e2e.mjs ×1).

## World and movement (isometric)

| Behaviour | Status | Test |
|---|---|---|
| Page loads, 0 console errors | ✅ | smoke a, every slice's console check |
| Tap ground → walk to exactly that diamond (centre + edges, camera scrolled, dpr 1/1.6) | ✅ desktop + phone (pickTile y+16 → g1 red on both) | isoTap g1 (162 taps), c-flat. The proof run was killed by the 7-min watchdog (2×162 taps under load); qa was told to split it by viewport and then the session died. No result recorded → re-run (desktop and phone as 2 slices) |
| Tap tree trunk / canopy / just below feet → walk adjacent + chop ("the tree you see wins") | ✅ isoTap FINAL: desktop dpr 1 + 1.6 49/49, phone 22/22, 0 errors. t-* chop the target at its own visible point; own-* every target keeps ≥1 own spot (tree_9/tree_10 3/4); tv-* below-feet under a front tree chops the visible tree (tree_11/tree_6); gap-* a transparent gap falls through to the tree behind. Mutants: isOpaqueAt→true → 5 red (t-tree_9-trunk chops tree_6 on all 3 viewports + gap-tree_9); pickTile y+16 desktop → 12 red (g1 52/72 off, b-* ×4, c-flat). Oracle = frontmost opaque tree, 5 px sway margin. HISTORY: ❌ canopy taps FAIL (05:52-05:53): desktop 33 pass / 4 fail (canopy at dpr 1 and 1.6); phone 17/19 then 18/19 (t-tree_10-canopy, -canopy-top; then t-tree_9-canopy-top: flaky, overlapping canopies). PHONE slice reported (PARTIAL): g1 (162 taps), all 4 b-*, c-flat, console pass in both live runs; canopy fails are B1 (P2,
flaky: player arrives adjacent but no chop starts; failing id changes per run; trees overlapping neighbours). Phone mutant
proof DONE: pickTile y+16 in clientToTile → 12/19 (g1, all b-*, c-flat red). Not proven: t-* group (only the already-flaky
id went red). Desktop slice reported 05:59 (INCOMPLETE, stopped for quota): run 1 33/37, run 2 3 fails, all "player adjacent, no chop
session in 14 s"; g1 + b-* pass on desktop; desktop mutant NOT run. Hypothesis T1 (stumps) DISPROVED 06:03 (diag1: every
target standing before every tap). New leads (main, 06:08): (A) a tap on tree_10's TRUNK started a chop on the neighbour
tree_11 and the test counted it as PASS ("AMBIGUOUS"), i.e. a product overlap-resolution issue; (B) "no chop" may be the check
missing a chop that already finished (normal trees fall after 1 log, session clears). qa redirected to log objectAtPoint's
resolved id + logs gained + gathering events per tap. RESULTS: 06:11 diag2 (22/25): spy shows MANY taps resolve to the
NEIGHBOUR tree (tree_11, tree_6, tree_8) = lead (A) CONFIRMED (overlap resolution; user's canopy decision pending).
06:15 diag3 (23/24): the one fail = interactTree(tree_9) fired but tree_9 was already chopped by an earlier check (player
never moved) = stump case is real for that check. run4 06:15:26 → 06:19:01: 37/37 desktop (dpr 1 + 1.6), BUT it still
counts a neighbour chop as PASS (AMBIGUOUS) and each run takes 3.5 min (USER: "isotap is always stuck"). qa told:
?tickMs=60, sample g1 (≈40 taps not 162), target < 60 s/viewport, neighbour chop = FAIL, one run, then report.
06:20 strict run (neighbour chop = FAIL): 23/37, 14 t-* FAIL: taps on tree_10/tree_9 trunk + below-feet chop the
neighbour (tree_11/tree_6) = the product bug, EXPECTED to fail until integrator's "tree you see wins" lands; plus a
"fully covered" oracle culling flake (test). Note: at 06:25 no e2e process of any agent was running.
06:29 run7 (tickMs=60, ~65 s): 25/37. The qa agent then ended WITHOUT a report (its log lines are the record).
06:3x integrator "tree you see wins" LANDED (objectAtPoint + WorldScene.isOpaqueAt): unit 13/13, mutant (pixel check off)
→ 3 red; its isoTap run desktop + phone: trunk taps on tree_9/tree_10 chop themselves, gaps walk. Remaining t-* fails
are OLD test expectations: those canopies are fully hidden behind tree_6/tree_11, and their below-feet spot lies under
opaque leaves of the front tree, so the visible tree is chopped, as decided. → qa updates the expectations + mutant. Logs: scratchpad live.txt / live2.txt / mut.txt | isoTap t-*, smoke c d (same isoTap proof as above) |
| Tap between two trees → walk, no chop | ✅ desktop + phone (mutant → all 4 b-* red on both) | isoTap b-* (4/4 gaps) (same isoTap proof as above) |
| Tap where two tree canopies overlap → may chop the neighbour (nearest wins) | ⚠️ P3 | isoTap AMBIGUOUS cases; visual overlap, consider smaller canopies |
| Player drawn behind/in front of trees and walls correctly | ✅ | isoCamera occlusion |
| Camera follows player, centred | ✅ | isoCamera follow |
| Drag-pan moves camera, does not walk | ✅ | isoCamera, smoke g2 |
| Pan stops at map edges | ✅ | isoCamera clamp |
| Wheel / pinch zoom within limits | ✅ | isoCamera zoom |
| Empty space below the map at minimum zoom | ✅ | minZoom 11/11 desktop + phone after the ISO-1b fix (z3 pan to limits: no void in 6 directions; z2 0 clear px at full density; the dark px were the "You" label). History: minZoom: zoom-out fills the view ✅ (desktop 0.63, phone 0.51 = window-fit bound), resizes ✅, fresh load ✅, tap after zoom-in ✅ (mutant → z1 red). ISO-1b FIXED by integrator (view centre clamped to the iso diamond; panCamera tests + e2e mutant red): z3 green desktop + phone (9261/3180+ in-world samples) → qa re-run (:5191). Phone z2: NOT a flake, deterministic: 1 clear + 8 near-black px at 63,47 (by the chunk border x=64), also without the fix → qa diagnosing (seam vs art) |
| Phone frame time while walking the big world (4x slower CPU) | ✅ | performance: p95 33 → 16.7 ms after culling off-screen views |
| Off-screen views culled without pop-in (walk, 8-way pan, zoom limits), edge taps still chop | ✅ | cull 11/11 (margin-0 mutant → 410 pop-ins) |
| Graphics memory on phone (≤ ~60 MB), no black ground when panning far | ✅ | integrator rt.mjs: walk ~32 MB (was up to 72), pan peak 56 MB, black ground 86% → 0% |
| Minimap N button doesn't cover the HP orb | ✅ | N moved below the minimap; orbs 13/13, minimap m2 + n1 |
| Minimap red destination marker after a tap (d1) | ✅ | fixed (pixelRatio scale, drawn above labels); minimap 15/15 |
| Minimap region boundaries + a label per region (derived from area data) | ✅ | minimapRegions boundary pixel check: edge tiles brighter 28/30 desktop, 27/29 phone, controls 0 (mutant alpha 0 → red) |
| Minimap rim arrow toward an off-circle destination | ✅ | minimap a1 (17/17; destination set via store, not a real long walk) |
| Bridge colour on the minimap | ✅ | palette test: every terrain kind has a minimap colour |
| Every sizable part of a region labelled (e.g. The Wilds near the village) | ✅ | minimapRegions 48/48 desktop + phone after the B1 fix (current region's label placed first; graphics unit test + mutant); every anchor still labelled |
| Walking smooth (no judder) | ✅ | isoCamera smoothness |
| Run: 2 tiles/tick, energy drain/regen, auto-off + message | ✅ | orbs o4 o5 |
| Layout survives zoom / window resize | ✅ | viewport 8/8 + user confirmed in real Chrome (2026-10-08) |
| Bigger world: walk spawn → causeway → Whispering Wood, no seams at 5 chunk borders, chop forest tree, Fernhaven bank by tap, reload far away, ≤9 chunk textures | ✅ | bigWorld 16/16 (2 mutants → red) |
| Buildings: roof outside, roof fades + front walls see-through inside, back on exit (3 buildings), no double walls, behind from north, Animations Off instant, booth from inside | ✅ | buildings 43/43 (2 mutants → red) |
| Bank / hut building looks (bank: stone, columns, coin + BANK sign, gold roof trim) | ✅ (screenshot) | buildings 43/43 still pass; look checked by screenshot |
| Area banner doesn't cover NPC nameplates (desktop) | ✅ | banner moved to the top; buildings 43/43 |
| Long walks across the map (re-path legs): exact arrival, 0 idle ticks between legs, water target stops adjacent, a tap mid-walk cancels | ✅ | longWalk 11/11 desktop + phone ((2,2)→(91,64) 89 tiles, 2 legs; mutant re-path off → t1/t2 red). The far leg is sent as the walkTo intent (no single tap can reach 80+ tiles); the 4x stall-retry branch is not exercised |

## This round: visuals + sound

| Behaviour | Status | Test |
|---|---|---|
| Bridge over the lake: planks + rails, walkable; water taps never put you in water | ✅ | water t1/t2 desktop + phone (walked x35→41 on row 15). Rails across a chunk border: n/a (the bridge sits inside one chunk) |
| Realistic water: depth gradient, shallows, damp shore, no tile grid, no seam at chunk borders, no magenta | ✅ (look by screenshot) | water t5 0 magenta px, t7 border jump 5.4 vs 16.7 interior (desktop) / 6.1 vs 14.8 (phone) |
| Water animation moves; Animations Off = still; phone frame time | ✅ | water t3/t4/t6: On 612/19200 px move, Off 0; phone p95 16.7 ms (mutant motion forced on → t4 red) |
| Ground textures (grass/dirt/sand), no seam at chunk borders, no black/magenta when panning 8 ways | ✅ | ground g5/g6 desktop + phone (grass std 29, path/sand std ~10; seams ≈ control; black ≤0.2%) |
| Flowers drawn + sway; Reduced < On (no double sway); Off = still; flowers don't block taps | ✅ | ground f1-f5 (102 flowers; On 6.5°, Reduced 1.2°, Off 0; mutant → f3/f5 red) |
| Tree sway; Reduced < On; Off = still; chop still works; phone frame time | ✅ | treeSway 5/5 desktop + phone (29/29, 21/21 trees; phone p95 16.7 ms; 2 mutants red) |
| Realistic trees (art): variants per tile, oak art, stump after chop, canopy/trunk tap still chops | ✅ | trees 13/13 desktop + phone (7 variants, 61 oaks own art, stump → standing after respawn, canopy + trunk taps chop; mutant → 4 red). Stump look not seen in a screenshot (only via texture log) |
| Realistic player + NPC art | 🔧 A1 (P2): chop back view: the axe floated beside the head with no raised arm. `animation` 06:07: cause = axe handle drawn from the fist back toward the shoulder (blade by the head) + sideways swing in back view; fix + unit tests green; mutants red (no foreshorten: 3 fail, old axe geometry: 1 fail). 06:08 own browser :5226 desktop + phone (shots3/*-fix-ne-*.png): arm raised, hand grips the handle. 06:12 report: gait 23/23, suite 1332 pass, tsc clean for animation. ❌ OPEN: USER "the chop animation is top to bottom so the hit needs to face down" (the edge faced up at the hit in front + back view); ❌ REGRESSION animation.e2e chop-axe-off desktop + phone (Off axe varies 11.88° by facing). 06:15 v2 fixes both in code (head mirrored to the leading side, Off not foreshortened; unit tests + 2 mutants red). 06:31: gait 23/23, animation.e2e 40/40 (Off regression FIXED) but the shots (bv/shots4/*-v2-*) show the hit STILL edge-up: head above the handle, arm swept past (main viewed desktop-v2-se-0.68.png) → sent back 06:36, then CANCELLED 06:38: USER checked the live game: "its ok back/front axe head down". ✅ by the
user's live check (main's frozen 0.68 frame was past the visible hit). animation told: no v3, revert any v3 edit, report. 06:20 USER: "looks stuck": animation.e2e up 3+ min at ~0% renderer CPU, no log since 06:15 → told to use ?tickMs=60, tee, kill its own pids if hung, one rerun, report. Walk front/back/side OK (2-segment arms on shoulders; legs read as one dark mass); banker OK; no villager NPC exists | live (figureArt + figureLooks, legs + 2-segment arms rigged). No qa slice has checked the look on desktop + phone yet (gait slice took close-up screenshots, report never reached main) |
| Natural walk gait: arms opposite to legs, knee bend, 2 bobs/stride, idle still (USER: same-timing swing looks weird) | ✅ gait 23/23 desktop + phone (05:53): walk 533 ms, run 334 ms, arm-leg corr -0.9; mutant (arm phases swapped) reds g1 on both viewports. g0 frame threshold lowered 150 → 90 (131-134 frames under load). thigh p-p 50° walk / 76° run vs upper arm 32°, knee bends in 63/63 swing frames, straight in 62/62 stance, 2 bobs/cycle, idle + Off 0°. animation.e2e ALL PASS desktop + phone on the new rig (6 face-walk directions, chop axe 170°/87° On, 35° Reduced, 0° Off, scale 1.5) | qa wrote tests/e2e/gait.e2e.mjs (:5209); its memory notes walk period 517 ms / run 333 ms, arm-leg correlation -0.9, mutant (arm phases swapped) reds g1 only. The pass/fail summary never reached main (session died) → one re-run to record the result; animation.e2e (stale 5-child rig) was edited at 05:29, also unconfirmed. Integrator wired `running` (walk ~516 ms, run ~339 ms in its own Chrome). part 2: shoulder-pivoted upper arm + trailing forearm (rigUpperArms), the axe follows the arm chain; render 336 tests, 3 mutants red. part 1: contralateral legs + forearms, knee bend, 2 bobs, run gait, idle still; 16 gait unit tests (4 mutants red). Not browser-checked. Part 2: upper-arm segment (graphics) → animation wires it; integrator passes `running`; animation.e2e is stale (5-child rig) → qa updates it + gait slice |
| Every axe swing: one axe-hit sound + one chat line (USER request); log crack per log; tree fall sound; Sound Off silent | ✅ | axeSound 11/11 desktop + phone: 6 swings → 6 hits (gaps 2399-2401 ms, none in between) + 6 "swing your axe" lines; 1 crack per log; 1 fall; Off = 0 sounds (mutant: per-swing line removed → t5 red). History: B1 extra hits from stopgap audio mappings, fixed by sound; the per-swing line was wrongly removed (main's prompt) and restored |

## Woodcutting and items

| Behaviour | Status | Test |
|---|---|---|
| Chop → log in inventory, XP gained | ✅ | smoke c, skills k8 |
| Tree falls after one log (tilt On, no tilt Reduced, instant Off) | ✅ | animation (39/40) |
| Facing while walking 8 directions, faces tree while chopping, axe swing per mode, scale kept | ✅ | animation 40/40 (A1 was a test route detour, fixed) |
| No axe → refused + message + effect | ✅ | blocked a |
| Level too low (oak 15) → refused + requirement message | ✅ | blocked b |
| Inventory full → refused immediately, no swing | ✅ | blocked c (mutant → red) |
| Effects off/on, no leftover effects after 10 repeats | ✅ | blocked d e f |
| First tap on a tree sometimes ignored on phone | ✅ | B2 was a test bug (stale tap point while camera eased); fixed with lib.mjs waitStill; blocked 3/3 desktop + phone, old loop → red 3/3 |
| Inventory: tap / long-press menu, Drop, Examine, Cancel, full 28, tap size | ✅ | inventory (mutants → 14/22 red) |
| Inventory: drag to swap slots (8 px threshold; long-press still opens menu) | ✅ | inventorySwap 11/11 desktop + phone (swap, move to empty, long-press menu no swap, 5 px = tap, same-slot/outside no-op; mutant threshold 1 px → red) |
| Inventory: "Use" / item-on-item → "Nothing interesting happens." | ✅ | useItem 21/21 desktop + phone (select ring + bar, item/tree/NPC → message + nothing else, same item / ✕ / ground cancel, drop/swap clear; mutant → 10 red). Not covered: Use on a facility object; real phone long-press while Use is active |
| Items on the ground: Drop → on tile, tap/Take picks up, full inventory refused, despawn 300 ticks | ✅ | groundItems 11/11 desktop + phone (drop drawn on tile, tap from 3 tiles walks + takes, long-press Take, full bag refused + item stays, despawn at exactly +300 ticks; mutant 200 → red). Not covered: reload clears them, piles/qty badge, "Walk here" entry |
| Item stacking rules: non-stackables one per slot, stack + badge, bank stacks + withdraw-all into free slots, drop/take whole stack, full bag still stacks | ✅ | stacking 11/11 desktop + phone (mutant: stackable branch off → 6 red). No stackable item ships yet, so 3 checks use a test shim on logs; re-check when coins/arrows exist |

## Bank and NPCs

| Behaviour | Status | Test |
|---|---|---|
| Walk into the bank through the door (no stuck tiles) | ✅ | isoBank door-in, door-diag (mutant door blocked → red) |
| Tap booth → bank opens; deposit all / withdraw 1 / withdraw all | ✅ | isoBank booth-tap, bank-ops (mutant booth intent → red) |
| Long-press / right-click booth and Banker → correct menu | ✅ | isoBank booth-menu-bank + npc-menu-bank (pick "Bank" from the menu → bankOpen + overlay): 3 runs 21/21, 20/21, 21/21 desktop + phone. Mutants: booth menu Bank→examine reds only booth-menu-bank (both viewports); NPC menu → only npc-menu-bank. Flake P3 (test only): phone door-diag "no canvas-visible exit tile (HUD covers all)" ~1 in 3; fix = teleport nearer the door / more candidate tiles. Earlier proof: door mutant → 14/17 red; booth-intent mutant → booth-tap + bank-ops red |
| Tap Banker → dialogue (incl. the first Banker, not the booth) | ✅ | isoBank npc-talk, npc-talk-1 (mutant door blocked → red) |
| Walking away closes the bank | ✅ | isoBankRules (outcome proven; which code path closes it not isolated) |
| Bank contents survive reload | ✅ | isoBankRules (mutant → red) |
| Can't walk behind the counter (8 taps on staff/booth/wall tiles) | ✅ | isoBankRules (mutant → red) |
| Fernhaven bank (door, booths, shared storage with Willowbrook, bankers, counter, walk-away) | ✅ | fernhavenBank 13/13 (mutant → red) |
| Fernhaven banker greeting names Fernhaven | ✅ | bankerGreeting 9/9 desktop + phone (Fernhaven ×2, Willowbrook, bank option; mutant: no place var → 4 red) |

## HUD

| Behaviour | Status | Test |
|---|---|---|
| Chat scrolls (wheel + phone drag), follows new lines only at the bottom | ✅ | chat |
| Skills grid: icons, colours, levels, total + combat level, tap for XP detail | ✅ | skills |
| HP / Prayer / Run orbs, Run toggle, low-energy message | ✅ | orbs |
| Minimap: tap to walk, water/wall taps, dot, toggle | ✅ | minimap m1-m3, d1, t1 |
| Minimap N button re-centres | ✅ | minimap n1 (mutant → red) |
| Minimap correct after walking 60 tiles across chunks | ✅ | minimap w1 (187/187 terrain pixels) |
| Minimap tap far north walks (not blocked by N) | ✅ | minimap m2 + n1 after MM-1 fix (N moved outside the circle) |
| Minimap terrain correct after a long walk (w1) | ✅ | minimap 15/15 (w1 skips label pixels) |
| Minimap labels in Whispering Wood / Fernhaven: shown, ~10 CSS px at every dpr, inside circle, no overlap | ✅ | minimapLabels (mutant → 49 red) |
| Minimap labels at spawn (Willowbrook + bank; phone: bank as coin icon) | ✅ | minimapLabels 74/74 (L1 fixed) |
| Settings: sound switch, volume steps, toggles | ✅ | settings |
| Settings footer version + What's new | ✅ | footer |
| Area name banner + music/ambience per area (village) | ✅ | areas |
| Big-world areas: banner + chat once, ambience kind, re-enter, Off silences, phone layout | ✅ | bigWorldAreas 18/18 (mutant → 10 red) |
| Level-up: popup text, non-blocking, tap/4 s dismiss, chat line, effect on/off, grid, double level-up, Notifications toggle | ✅ | levelUp (mutants → 10/28) |
| XP drops | ✅ | settings d6 |
| Modern chat + dialogue: choices + close ≥44px, tap to choose, typewriter On (tap completes) / Off instant, phone sheet clear of orbs/minimap/tabs, chat scroll unchanged | ✅ | chatUi 9/9 + chat 12/12 (mutants: typewriter + 20px choices → red) |
| Dialogue avatar shows the speaker's face (USER 06:08), not a colour circle | ✅ | dialogueAvatar 7/7 desktop + phone (a1 banker img data:png alt "Banker", round; a2 player "You" portrait differs; a3 choices 44 px, close 44x44, sheet clear of orbs/minimap; 0 errors); chatUi 9/9; mutant speakerPortrait→null reds a1 + a2 both viewports. Face readable but small at 24 px (banker less distinct; 32 px optional). Not checked: other NPC portraits (none ship), img onError fallback in browser. Earlier: 06:08 dialogueAvatar 7/7 desktop + phone (banker + player avatar img, 24 CSS px / 48 device px); chatUi rerun for the avatar layout logged, summary pending; mutant + size verdict pending. USER saw the faces after a refresh. LIVE: graphics portraitUrl (8 unit tests, mutant red; main viewed montage: player, grey-haired banker, villager, blonde villager_f — faces clear); hud SpeakerAvatar in the 24 px circle (34 ui tests). Open: is 24 px big enough to read a face; villagers need a lookId when they get dialogue (npcId ≠ look id in general) |
| One female + one male Banker at each bank (USER 06:27), each with their own dialogue face | ✅ | bankerGreeting.e2e 23/23 desktop + phone, 0 errors: world hair pixels (male grey / female dark-brown) for all 4 bankers, avatar src = portraitUrl(their look), male ≠ female avatar at both banks, greeting names the town, Bank from banker_2/banker_4. Mutants: speakerLookId always 'banker' → 17/23 (av_banker_2/4, av_diff red); banker_4 spawn → 'banker' → 19/23. Not checkable: banker back view (NPCs don't turn). USER checked live: "looks right" | world part live 06:33 (npc def 20/20, look 356/356, spawns 58/58, mutants red; main viewed figures.png). Integrator speakerLook DONE: npcContent.test 3/3 (spriteKey → render look, spawn npcId → NPC_DEFS, speakerLook per spawn); own browser: banker_1/3 male, banker_2/4 female look, dialogue portrait differs male vs female at both banks, Bank opens for all 4. qa slice running |
| Locked dialogue choice (dimmed + requirement), amber important chat lines, landscape phone, keys 1-9 | ❌ NOT COVERED | no locked choice in content yet; rest unchecked |

## Saves

| Behaviour | Status | Test |
|---|---|---|
| Logs + XP survive reload | ✅ | smoke e |
| Old save versions (v1, v2) load in the browser and upgrade to v3 | ✅ | saves load-v1/v2 (desktop + phone) |
| Corrupt save → message, fresh start, bad data kept as backup | ✅ | saves corrupt |
| Two copies of the game don't overwrite each other (lease) | ✅ | saves two-tabs (iframe as tab B; mutant → red) |
| Progress far away in the big world survives reload | ✅ | saves far-world |

## Balance (big-world placement) ✅ reported (tests/balance/woodcuttingPlacement.test.ts, real gathering + pathfinding, 20 seeds)

| Finding | Numbers |
|---|---|
| Crowding near spawn | fine: 12 village normal trees, 0 ticks waiting for respawn in every run; 4 oaks enough (~8 logs each) |
| Oaks near spawn | fine: nearest normal tree 3 tiles, oak 5; level 1 just gets "need level 15" |
| Oak 15 → 30 | village oaks 65 min (~11.1k XP/h) vs village normal trees 53 min (~13.6k XP/h); Oak Ridge oaks 73 min |
| Unnamed pocket | 171 trees (46 oaks) at x63-79, y26-52 east of Greatmere fall outside every zone: no area name/label |
| Fernhaven bank | 70+ tiles from every forest; bank round trip per 28 logs: village 16-36 ticks, Whispering Wood 80-112, Oak Ridge 106-114 |
| Proposals (USER approved all 3; queued, not dispatched: quota pause) | (1) oak xp 37.5→45, success 32/100→48/150 (oak ahead of normal trees at every level; not re-simulated) or keep OSRS numbers; (2) `map`: name the pocket + a bank booth near (72,53); (3) bank/deposit chest near Whispering Wood (48,15) |
| Distances | spawn → normal tree 3 tiles, → oak 5-7 (Oak Grove, 4 oaks); Willowbrook bank 10 from spawn; Whispering Wood 30-48 from spawn / 40-56 from bank; Oak Ridge 44-61 / 53-57; Fernhaven bank 102 from spawn, 68-72 from the woods |
| Woodcutting 1 → 15 | village normal trees 14.6 min walking / 14.1 run (97 logs, 3 bank trips, 0 waiting); Whispering Wood only 17.0 min |
| XP/hour normal tree vs oak | lvl 15: 9932 vs 9485 (oak worse until ~lvl 40); lvl 30: 11735 vs 11682; lvl 99: 18535 vs 21277 → possible tuning issue, wait for balance's proposal |

## Gaps to close (in order)

Done: inventory, level-up, iso bank rules, saves, big-world areas, big-world walk, buildings, Fernhaven bank,
minimap labels (74/74), phone frame time, off-screen culling (11/11), tree sway, chat/dialogue UI, Fernhaven greeting,
trees, water + bridge, flowers + ground textures, minimap boundaries, inventory drag-swap, Use, ground items, region labels (48/48 after B1 fix), long walks, item stacking,
isoBank failure proof (door, booth), ISO-1b fix + minZoom re-run 11/11, per-swing chat line restored + axeSound 11/11,
gait 23/23 (mutant red), isoBank pick-Bank (mutants red), dialogue faces 7/7 (mutant red), e2e lint, balance placement.

The open work is also listed as tasks in `docs/runbooks/2026-10-08-big-world.md` → "HANDOFF tasks". After a crash, read
`docs/qa-log.md` from the bottom first.

06:36-06:37 isoTap FINAL (oracle = frontmost opaque tree): desktop dpr 1 + 1.6 43/43, phone 22/22 (after 2 fixes for
sway/unstable tap points). 06:38 mutant run on :5329 in progress.
~06:35 integrator stopped by main (work logged done, idle on its own background job, no report); main verified: tsc
clean, app tests 35 files / 232 pass, no leftover servers on 5228/5328; its last edits were 06:32-06:33 (store.ts,
app/ui dialoguePortrait.ts + DialoguePanel.tsx [hud's files, minimal speakerLook change], npcContent.test.ts), nothing
half-written after. Browser re-proof: tap rule = the running isoTap final; bankers = other account's qa slice.
(Main's "06:42/06:44" stamps above were estimates; the real clock was ~06:35.)
Running now (06:42): only qa isoTap final (t-* oracle → visible-tree rule + mutants, :5229). animation A1 done
(user-confirmed, v2, 109 tests). Integrator banker_f done. Banker qa slice → OTHER ACCOUNT (user quota 27%).

Still open, in order:
1. ✅ DONE: isoTap (all rows proven on desktop + phone).
2. ❌ A1 axe: USER "the chop animation is top to bottom so the hit needs to face down". 06:15 v2: axe head mirrored to the
   leading side + Off mode no longer foreshortened; unit tests green; mutants red (blade on the wrong side → edge-leads test
   red; Off always foreshortened → Off test red). Still to come: e2e (animation.e2e chop-axe-off) + screenshots main views,
   then the user checks after a refresh.
3. ✅ DONE: lint clean (qa removed the 5 unused vars; prettier-formatted 5 more e2e files; main re-ran `npm run lint`).
4. ✅ DONE: the stray `tests/e2e/shots-trees/` (6 PNGs) was deleted. No script hard-codes it; it came from a manual
   `SHOTS_DIR=tests/e2e/shots-trees`. Convention: `SHOTS_DIR=tests/e2e/.shots-<name>` (ignored).
5. ✅ DONE: isoBank "pick Bank" from the booth + Banker menus (mutants red). New P3: phone door-diag flake ~1/3.
6. One GATE run of every tests/e2e file on one build, so all ✅ rows are proven together. → OTHER ACCOUNT (user 06:21),
   together with the oak/map/bank/deposit-chest work (runbook handoff items 4-8).
7. ✅ Canopy overlap: "the tree you see wins" LIVE + proven (isoTap final 49/49 + 22/22, mutants red). Earlier: USER 06:02 "wait for isoTap result": decide front-tree-wins / smaller canopy / keep nearest
   AFTER the running isoTap investigation says whether overlap causes the failing canopy taps (tree_9, tree_10 overlap).
8. ❌ Locked dialogue choice: close WITHOUT new content: a qa slice pushes a temp dialogue tree with a gated choice in-page
   (story keeps the registry a plain array for this) and checks dimmed + "Requires …" text, tap does nothing, keys 1-9,
   amber important chat lines, landscape phone. Queued (handoff item 10).
