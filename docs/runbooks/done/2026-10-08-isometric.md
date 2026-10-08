# Runbook: Convert the world view to isometric 2.5D

- **Status:** done
  remaining MVP qa slices; MVP close no longer blocks it)
- **Started:** 2026-10-08
- **Last updated:** 2026-10-08
- **Owner:** main session

## Goal
The world renders as isometric 2.5D (diamond tiles, sprites with height, correct front/back depth) instead of
top-down, with everything that works today still working: tap/click-to-walk and chop (incl. canopy hits),
long-press menus, bank chest, minimap, drag-pan, pinch zoom, smooth movement (no judder: per-frame step
within ±15%, no camera stalls), animations, vfx, phone layout. Game logic is untouched (tile-based).

## Decisions
- USER: convert to 2.5D after the QA gate passes. Style: **isometric in Phaser** (main's recommendation; real
  3D/three.js rejected as much larger). If the user meant real 3D, stop and ask.
- Runs BEFORE `2026-10-08-big-world.md`, so the chunk renderer is built isometric once.
- Render-layer only: `graphics` (projection, tilemap, views, camera, hit bounds), `animation` (rig
  in iso), `vfx` (positions/depth), `integrator` (scene uses the projection API, clientToTile → iso
  picking), minimap stays top-down (OSRS-like) but uses the same tile coords. Movement, skills, saves untouched.
- One source of truth: a pure projection module in `render/` (`tileToScreen`, `screenToTile`, `depthFor`
  in iso), used by everyone; no ad-hoc iso maths elsewhere.
- QA gate + playable first: the game stays playable during the change (behind a projection flag if needed,
  switched over only when qa passes).

## Tasks
- [x] `graphics`: iso projection module + tests (round-trip tile↔screen, picking at tile edges, depth order)
- [x] `graphics`: iso tilemap (diamond tiles, per-chunk-ready), iso tree/booth/NPC/player views + hit bounds; camera bounds
      (no VIEW_MODE flag: the user made iso the only view)
- [x] `animation`: player rig and tree fall/regrow look right in iso (facing in 4/8 directions) — animation e2e 40/40
- [x] `vfx`: effects positioned/depth-sorted in iso
- [x] `integrator`: scene switches to the projection API; objectAtPoint/clientToTile use iso picking;
      drag-pan/zoom/follow-offset still correct (ISO-1b min-zoom pan fixed; minZoom 11/11)
- [x] `performance`: phone frame time p95 33 → 16.7 ms (culling), graphics memory ≤ ~60 MB
- [x] `qa`: e2e updated for iso — isoCamera ✅, isoBank ✅ (proof done), minZoom ✅; OPEN: isoTap failure proof (2 slices),
      isoBank "pick Bank from the booth menu" check
- [-] Main session: real play session in Chrome (desktop + phone) + recording (not done) (NOT DONE: skipped/dropped by the user, 2026-10-08)

## After this runbook
- First deploy = a single task, NO runbook (USER: "infra (individual no need runbook)"): infra prep is already done
  (wrangler.jsonc, _headers, ci.yml); the main session asks the user for an explicit OK → one normal commit replacing the old
  idle version (history kept; the repo email is personal) → push main → verify the Cloudflare build + `curl -I` headers.
  Tracked as task "First deploy".

## Next step
HANDOFF 2026-10-08 05:55: see `2026-10-08-big-world.md` → "HANDOFF tasks" (items 1, 2, 9 belong to this runbook;
isoTap canopy taps currently FAIL, see qa-coverage). Then the main session's play session + recording.

(audit 2026-10-08, restart) Iso is live and every build task is done. To close: dispatch qa isoTap proof as 2 slices
(desktop, phone; the single run hit the 7-min watchdog) + add the isoBank pick-Bank check; both are also in
`docs/qa-coverage.md` "Still open". Then the shared GATE run, then the main session's real play session + recording,
then Status → done. Afterwards: "First deploy" (needs the user's explicit OK).

## Open questions / blockers
- None (no longer blocked on the MVP runbook).
- ⚠️ P3 canopy overlap (a tap where two canopies overlap may chop the neighbour): user's call on smaller canopies.

## Log
- 2026-10-08 (restart audit): ticked graphics/animation/vfx/integrator/performance from the log + qa-coverage evidence;
  isoTap proof never finished (watchdog kill, then the session died) → still open. Stale "blocked" lines removed.
- 2026-10-08: qa isoCamera PASS desktop + phone (occlusion trees + walls 0 violations, follow ≤8 px off centre,
  drag-pan exact and no walk, pan clamp exact, zoom 0.5-3.0, smoothness worst 4-7% (one 35% flake under machine load;
  rerun 6%), 0 errors; mutant depthFor → red). ISO-1 P3: empty space below the map at min zoom 0.5 → folded into the
  big-world integrator wiring (task). Note: panCamera's clamp duplicates Phaser's camera bounds (mutant stayed green):
  integrator should remove one.
- 2026-10-08: `integrator` iso switch DONE → the live game is isometric. WorldScene uses isoProjection everywhere
  (tile-space interpolation then projection, per-frame depth), setupCameraFor, clientToTile pickTile, objectAtPoint
  feet-anchored + nearest-depth wins (tests rewritten, below-feet case added), panCamera negative-origin box, facingFromStep
  + animateTreeFall awayFrom wired. tsc clean, 1044 tests. Own headless check :5185: 0 console errors, player centred,
  booth opens bank, trunk + canopy taps chop, occlusion correct, drag-pan = drag/zoom. Main viewed desktop-chop2.png +
  phone-chop.png: correct iso look (diamonds, wall height, depth). Dispatched one qa slice per feature: isoTap :5189,
  isoCamera :5190, isoBank :5191, blocked :5192, animation :5193; ORB-2 → integrator. Tasks [x] graphics, integrator, animation,
  vfx; qa pending.
- 2026-10-08: `vfx` DONE: layers ground/world/overhead + per-effect lift as data, depth via isoProjection, diamond click
  marker (32x16), no API change (feet px in). `animation` DONE: facingFromStep (8-way, back view n/ne/nw), animator owns
  ±ART_SCALE flip, walk bob scaled, animateTreeFall awayFrom (falls away from player on the iso axis), ghost depth +1e-5;
  180 render tests, 4 mutations → 12 red. Both forwarded to `integrator` (wire facing + awayFrom + vfx feet px). `graphics`
  asked to export ART_SCALE from @render/index. Tasks [x] animation, [x] vfx (code; browser check pending integrator + qa).
- 2026-10-08: `graphics` step 2 DONE (iso only per user): src/render/projection.ts `isoProjection` (+ISO, Facing8, from
  @render); tilemap.ts iso ground RenderTexture + 28px depth-sorted wall Images; views.ts feet-origin + ART_SCALE 1.5 +
  iso hitBoundsFor; camera.ts setupCameraFor. tsc clean, render 142 tests, depth mutation red; gap: below-feet click box
  untested (given to integrator). 4 red tests in app objectAtPoint.test.ts (old numbers) → integrator. Live game is
  half-switched until integrator lands. Dispatched in parallel: `integrator` (scene → iso, own headless check :5185 with
  screenshots), `animation` (iso facing 8-dir, chop, tree fall), `vfx` (iso positions/depth, diamond click marker).
- 2026-10-08: USER DECISION: "no default is 2.5D. flag for 3d if ever need a flag" → isometric is THE view: no top-down
  mode, no VIEW_MODE / `?view=iso` switch (replaces the earlier "behind a flag" decision). Keep a small `Projection`
  interface so a 3D projection could slot in later, if ever. Minimap stays a flat map. `graphics` told mid-run. The live
  game switches to iso when `integrator` wires it.
- 2026-10-08: USER: "i want progress. qa IS NOT PROGRESS" → runbook unblocked. Plan: (1) `graphics` builds the shared
  `Projection` (topdown + iso impls) + iso tilemap/views/hit bounds/camera bounds, default stays top-down; (2) `integrator`
  wires a `?view=iso` URL switch so the user can SEE it in the browser at once (playable first); (3) `animation` + `vfx` in
  parallel against the Projection; (4) small qa slices. MVP qa slices keep running in the background, not blocking.
- 2026-10-08: USER impatient with the QA wait → main started the first, ZERO-RISK step early: `graphics` builds the pure iso
  projection module (src/render/iso/*, new files only, imported by nothing, so running QA servers are unaffected). Wiring/switch
  still waits for the MVP close.
- 2026-10-08: `graphics` iso projection DONE (src/render/iso/projection.ts + 18 tests, not yet exported/imported): ISO 64×32,
  elevation 16; tileToScreen/screenToTile (exact inverse), pickTile = round in tile space (half-open edges, bounds, NaN-safe),
  depthKey = ENTITY + tx + ty + tx·1e-4 (diagonal order, stable ties, fractional while moving), worldBounds (40×30 → -960,-16,
  2240×1120, brute-force checked), screenDeltaToTileDelta, facing4/facing8. 138 render tests, build green; 6 mutation checks in a
  copy all red. NEXT (after the MVP close): step 2 = graphics behind a VIEW_MODE flag (export iso, diamond tilemap, iso views +
  depth + hit bounds, camera bounds, drag delta) → integrator switches picking to pickTile → animation facing4/8 → vfx → qa.
- 2026-10-08: USER moved 2.5D BEFORE the first deploy ("maybe 2.5d before infra as im going to shower"). Start as soon as
  the MVP runbook closes; no push without the user's explicit OK.
- 2026-10-08: USER asked if 2.5D is possible; main explained isometric (Phaser) vs 3D (three.js) and recommended
  isometric before the big-world work. USER: "ok after qa done. convert to 2.5d". Runbook created as blocked.
- 2026-10-08: USER: "3d is also possible or no?" then "but i prefer 2.5d" → CONFIRMED isometric 2.5D (3D is
  possible via three.js but not chosen).
- 2026-10-08 10:19 CLOSED at the v0.1.2 release (0d7fcf6): remaining items shipped in v0.1.1/v0.1.2 and QA'd, or skipped by the user (marked [-]).
