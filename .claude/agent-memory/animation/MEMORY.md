# animation memory
Full history: docs/archive/agent-memory-animation-2026-10-09.md

## Workflow and safety
- Never mutate live files (Vite hot-reloads the user's game): use a scratch rsync copy (`--delete` before each mutant run, fresh cp per mutant); `npx tsc --noEmit` after every save.
- Tests must go red: hardcode limits (not read from ACT_ARMS etc.); feed wild keys via ACT_KEYS (swap + restore in finally).
- Read the e2e's metric and model it in a temp vitest first (`--reporter=verbose --silent=false`; delete after). Never `vitest --root /` (hangs).
- Pose crops: `scene.animate = noop`, drive `animator.setState/update(t0 + phase*period)`; clip via camera.worldView. Phone crops are unusable (camera inset).
- Redirect e2e output to a scratch file and grep it; don't re-run.
- macOS: no `timeout`; use `perl -pi` (never `sed -i -E`); no backticks in `perl -e "..."`.
- Build failing from others' edits: `tsc | grep animation`. Grep wiring (app/scenes/worldEffects.ts) before claiming regressions.

## Imports and architecture
- Import graphics only via `@render/index` (ESLint bans `../x` in render/animation). (PlayerView.body, facingScaleX, ART_SCALE). Rig at container index 1.
- No geometry at module load in logic.ts (hud tests partially mock @render/index): build lazily (defaultGeom()).
- State machine = priority table in data.ts + nextAnimState; new skills add GATHER_STATE_BY_TOOL entry + state def, no branches. Adding one may break app/scenes/animInput.test.ts: tell integrator.
- MotionMode 'on'|'reduced'|'off' is a param (MOTION table); animator never reads matchMedia. 'off' = chopStyle 'static', fallMs/regrowMs 0. Reduced: REDUCED_WALK_SCALE 0.5 + breathScale (idle still); prefs may hold reduced forever.
- Per-frame code: no allocation; change-gate calls into graphics (setBackView redraws).
- Sway: shared ticker (treeSway.ts) rotates art child, skips culled. Flame flicker = FlameTarget/FlameLayer (flame.ts).

## Rig and tools
- Rig: 2-segment arms (armFront/BackUpper + Fore; elbowY 7, handY 9, shoulderX 6 = torso half-width). Elbow rotation is relative. Pose angles forward-positive; animator negates for Phaser.
- Tools = SWING_TOOLS rows + SWING_KEYS entries. New tool/hang/prop changes child counts: update playerAnimator.test and animation.e2e (find by name, never list[length-1]).
- Tests find tools by fillRect (w2,h): axe 20, pick 23, net 22: keep handle heights unique (HANDLE_H from axeRects).
- Before flipping a PLAYER_LOOK flag, grep tests using the look.
- Back view: arms hidden, tool in a layer BELOW the body (addAt 0), swing foreshortened (BACK_VIEW_SWING_REACH).

## Swings (chop/mine/rod/net)
- Two-handed IK (chop.ts): CHOP_KEYS/MINE_KEYS in torso frame (gx, gy, theta, lean, twist, dip, gap?); rear hand = grip - AXE_HAND_GAP along the handle; solveArm returns ONE shared scratch (copy angles before the 2nd solve).
- Hand paths passing within ~2 px of the shoulder hit IK min-reach: add a bowing key. Reach test compares REQUESTED grip distance from the shoulder vs literal 16 (swingReach.test.ts), not solved arm length.
- solveGrip(..., lean) judges elbow tuck in SCREEN frame. Tuck chosen at neighbouring keyframes (tuckAt) and eased with tuckRamp (ELBOW_BLEND_PHASE 0.04); sweep tests allow ELBOW_BLEND_HAND_DRIFT_PX off keys, 0.25 at keys.
- Rear arm drawn OVER lead while gripping (rig.moveTo; test fakes need moveTo).
- Impact = both hands low and together, elbows inside shoulders; judge impact..recoil, not just wind-up. Frozen phase 0.68 is PAST the visible hit: confirm against the live animation/user before calling a pose wrong. Axe head leads (-x), user-approved.
- theta: head dir (-sin, cos), +y down; "raised N deg" = theta -(90+N). Tool angle = theta + lean; reduced tap key = swing interpolated at 0.70.
- Rod: SWING_TIMELINES via swingPhase(); pulse('catch') defers until cast ends, reset by setState; test vs a no-pulse animator.

## Acts (lighting/cooking) and kneel
- act.ts + ACT_KEYS/ACT_PLAN: one prop hand + second hand via solveGrip/legDip; Pose.armsSolved flags solved arms (axeVisible = tool shown). One-shot acts end on idle pose and clamp phase; hang targets gy 16.
- ACT_ARMS per state: frontSide -1 (mirror IK), back upper clamped in WORLD terms (backUpperWorld, lean +- w). Shoulder y includes `sink = 2*hip*(1-cos)` at lean (test: shoulder pivot == rotated body point).
- Kneel = hips drop ~5.6 + lean 30-34 + hands gx 9.5 gy 9.
- Props need a DARK RIM; cook poke keys every 0.25 phase.

## Gait
- Contralateral: arm opposite the leg (armLag 0, forearmLag 0), knee bends only in swing, 2 bobs/cycle (GAITS).
- Swing along the facing: projectSwing/swingLength/FACING_SCREEN (iso 2:1), foreshortening clamped 0.85..1.2, swingLength uses max(0,dy). Diagonals: FACING_SWING with DIAGONAL_LATERAL_CAP 0.15, SWING_DEPTH_GAIN 0.5 (knees invisible there, so gait e2e walks side-on).
- n/s: qa's gaitB measures FOREARM/SHIN vectors; fix = GaitDef depthSwing 2, kneeDepth 0.4, legDepth 1.8, faded by depthFade (0 on diagonals).
- camJerk e2e reads app-owned playerView.container. State switches blend via POSE_BLEND_MS.
