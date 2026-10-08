# QA coverage map

What a player can do and which browser test proves it (real taps/clicks, desktop 1280x800 + phone 390x844 unless noted).
Kept current by the main session. Full history up to 2026-10-08 11:00 (run-by-run notes, mutant details):
`docs/archive/qa-coverage-2026-10-08.md`. Raw results: `docs/qa-log.md`.

Legend: ✅ verified (pass + test proven to fail when broken) · 🔧 code done, browser check owed · ⏳ running · ❌ open/gap ·
➖ unit tests only

## Open now

| Item | Status |
|---|---|
| Closed today (fire/cooking, lighting polish, black water/CANVAS, roofs, nameplates, fish art, world-edge seam, Show HUD, camera inset, cook pose, M1-M3 elbows, e2e speed + #39 fast-base sweep, Q4/Q4b harness, chat flake, fireArt ground, phone label keep-out + banner, lint speed, g.settle conversion) | ✅ — rows archived in docs/archive/qa-coverage-2026-10-08.md |
| Smoke flakes c (swing msg), d (canopy tap → neighbour; `graphics`), h (2-frame jitter) | 🔧 12:08: c now latches swing lines via store.subscribe (chat cap scrolled them out); d failure now prints pending/session tree ids (graphics bug if they differ); h load-induced, no change (0 frames > 15%). Only 1 live run since — flake fix not proven |
| Full e2e suite health | 🔧 every file green in its own slice since the 12:05 full run (28/86 red then). Full run-all CANCELLED by user 23:1x, so the suite total, worldEdge seam and bigWorld phone (73 s) recheck ride on each file's next qa run. Known flakes under load: isoTap, fishChat, camJerk, roofs canvas ridge px |
| Cook pose rear hand (M4) + elbow loose ends (M5) | ❌ M4 parked (qa stopped before any browser ran; not requested, over the ~4 browser cap): rear hand attach/clamp/visibility never checked. ❌ M5 in the #39 sweep: lint newfish + chatUi, cookPose > 60 s budget, add M4's rear-hand check to cookPose |
| Locked dialogue: amber "important" chat lines | ➖ no important lines exist yet |
| Not covered by choice: landscape phone for most rows; GATE of every e2e on one build (user skipped) | — |

## World and movement

| Behaviour | Status | Test |
|---|---|---|
| Page loads, 0 console errors | ✅ | smoke a |
| Tap ground → walk to that diamond (dpr 1/1.6, camera scrolled) | ✅ | isoTap g1, c-flat |
| Tap tree trunk/canopy/below feet → chop the tree you see | ✅ | isoTap t-*, own-*, tv-*, gap-* |
| Tap between trees → walk, no chop | ✅ | isoTap b-* |
| Occlusion, camera follow, drag-pan, edge clamp, zoom limits, no void at min zoom | ✅ | isoCamera, minZoom |
| Smooth walk, no camera jerk (desktop + phone, sheet toggles) | ✅ | isoCamera, camJerk, #48 |
| Run: 2 tiles/tick, energy drain/regen | ✅ | orbs o4 o5 |
| Long walks (re-path legs, exact arrival, water target adjacent) | ✅ | longWalk 11/11 |
| Big world: chunk seams, ≤9 textures, culling without pop-in, phone memory ≤60 MB, p95 16.7 ms | ✅ | bigWorld, cull, rt.mjs, performance |
| Buildings: roof fade inside, see-through walls | ✅ | buildings 43/43 |
| Water + bridge, ground textures, flowers, tree sway (On/Reduced/Off) | ✅ | water, ground, treeSway |
| Layout survives zoom/resize | ✅ | viewport 8/8 |
| Area banner + music/ambience per area | ✅ | areas, bigWorldAreas |

## Skills

| Behaviour | Status | Test |
|---|---|---|
| Woodcutting: chop → log + XP, tree falls + respawns, no axe / level / full bag refused | ✅ | smoke c, animation, blocked a-f, respawn |
| Oak tuning (45 XP, success 48/150) | ✅ | oakTuning 11/11 |
| Mining: rocks, ores, pickaxe tiers, iron/coal gates, one swing line per attempt | ✅ | mining 23/23, coal 11/11 |
| Fishing: net/bait spots, bait use, spot hops, new fish (trout L25, mackerel L30), stop-reason flashes | ✅ | fishing 17/17, newfish 8/8, fishFlash |
| Locked gather menu options ("Requires X N (you: M)") | ✅ | lockedMenu 13/13 |
| Skill sounds + per-attempt chat lines (all 3 skills) | ✅ | axeSound 11/11, 6c 9/9 |
| Skill vfx (chips, dust, splash, ripples) | ✅ | vfxHooks 11/11, skillTags 5/5 |
| Poses: chop/mine two-handed, net, rod; walk/run gait; Off/Reduced | ✅ | gait, gaitB, a3, c2, e2, rod |
| Skill unlock tree (WC/Mining/Fishing): branches, locked = "Unknown" + requirement, same width as skills grid, live unlock | ✅ | skillUnlocks 25/25 |
| Light a fire (tinderbox, oak burns longer, ashes) | ✅ | fireLight 23/23 (firemaking session) |
| Cook on a fire (cooked/burnt, XP) | ✅ | cookFire 17/17 (firemaking session) |
| Smoke: walk, chop, canopy, reload, bank, smoothness, phone portrait + landscape | ✅ 11:19 | smoke 12/12 live7/9/10/11 (stale iso coords fixed in smoke.mjs; mutant flat coords → 3/12). Flakes c/d/h ~1 in 4 (see Open now) |
| Raw/cooked/burnt names + icons (user) | ✅ 11:29 | fireVisuals v5 (8 names, distinct icons, same in inventory/bank/ground, Examine); cooking/data.test.ts names (mutant red); itemIcons "food states visibly different" (mutant red); itemIconsEverywhere 73/73 |
| Fire art / flicker / dying / ashes icon | ✅ 11:29 | fireVisuals (flicker mutant red), ashesIcon 3/3, fireWire 9/9, fireLifecycle unit (mutant red) |
| Lighting kneel + cooking pose | ✅ lighting 12:20 (wing fixed, 8 facings); cook pose ✅ 18:47 (food in hand over the flame, poke motion; cookPose.e2e numeric asserts) | lightPolish sheets; act.test + playerAnimator pivot test (mutants red) |
| Fire vfx (sparks, smoke, steam, burnt puff, embers) | ✅ 11:29 | fireVisuals desktop + phone; vfx unit 55 (5 mutants red) |
| Logs menu: Light, Use, Drop, Examine, Cancel | ✅ 11:29 | fireVisuals menu check desktop + phone; itemMenu.test 3 (2 mutants red) |
| Log pile while lighting, swap to fire, removed on cancel; step aside on lit; no player-in-flames frame | ✅ 12:20 | f3.e2e 5/5 desktop + phone (stub-pile mutant red); lightPolish.e2e lp-overlap pass (integrator run; mutant red) |
| Fires walkable (user 11:55); step-aside W→E→S→N; refused when all 4 blocked | ✅ 12:20 (qa fireBlock 21/21 desktop + phone) | fireBlock.e2e (s1-s4, s6 pass desktop + phone; STEP_ASIDE mutant 7/21 red) |

## Items and inventory

| Behaviour | Status | Test |
|---|---|---|
| Menu (tap/long-press), Drop, Examine, full 28, drag-swap | ✅ | inventory, inventorySwap 11/11 |
| Use item on item/tree/NPC → "Nothing interesting happens." | ✅ | useItem 21/21 |
| Ground items: drop, take, full bag refused, despawn 300 ticks, visible around feet | ✅ | groundItems 11/11, drops 9/9 |
| Stacking rules | ✅ | stacking 11/11 (shim on logs; re-check when a real stackable ships) |
| One icon per item everywhere (inventory = bank = ground) | ✅ | itemIconsEverywhere 73/73, icons e2e 15/15 |
| Examine texts per node type | ✅ | examine 19/19 |

## Bank, NPCs, dialogue

| Behaviour | Status | Test |
|---|---|---|
| Willowbrook + Fernhaven + Greatmere banks: door, booths, menus, deposit/withdraw, walk-away closes, contents survive reload | ✅ | isoBank, isoBankRules, fernhavenBank, bankBooth5 |
| Deposit chest (deposit-only view) | ✅ | depositChest 15/15 |
| Male + female banker per bank, own dialogue face, greeting names the town | ✅ | bankerGreeting 23/23, dialogueAvatar 7/7 |
| Chat + dialogue UI (44 px choices, typewriter) | ✅ | chatUi 9/9, chat 12/12 |
| Locked dialogue choice (dimmed + requirement, keys 1-9, landscape) | ✅ | lockedDialogue 25/25 |

## HUD

| Behaviour | Status | Test |
|---|---|---|
| Skills grid + detail, orbs, level-up popup, XP drops | ✅ | skills, orbs, levelUp, settings d6 |
| Minimap: tap-walk, N button, labels, region boundaries, markers (rocks, spots, tree types), facing arrow | ✅ | minimap, minimapLabels, minimapRegions, mmnet, mmLabel |
| World map overlay (fit, zoom, pan, close) | ✅ | worldmap2 11/11 |
| Settings, footer version, Male/Female look | ✅ | settings, footer, playerLook 17/17 |
| Phone: sheet + chat folded by default, fold state persists, camera inset above HUD | ✅ | collapse 6/6, foldPersist 5/5, cam-inset 9/9 |

## Saves

| Behaviour | Status | Test |
|---|---|---|
| Logs + XP survive reload; old versions upgrade; corrupt save backed up; two tabs don't clobber; far-world progress | ✅ | smoke e, saves |
| Starter kits for new + old saves (pickaxe, net, rod, 500 bait), no save bump | ✅ | regression.test, metaSlice.test |
