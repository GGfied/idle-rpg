# Runbook: Convert the world view to isometric 2.5D

- **Status:** blocked (starts when `2026-10-08-mvp.md` is done; user: "after qa done. convert to 2.5d")
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
- [ ] `graphics`: iso tilemap (diamond tiles, per-chunk-ready), iso tree/booth/NPC/player views + hit bounds; camera bounds
      (behind a VIEW_MODE flag)
- [ ] `animation`: player rig and tree fall/regrow look right in iso (facing in 4/8 directions)
- [ ] `vfx`: effects positioned/depth-sorted in iso
- [ ] `integrator`: scene switches to the projection API; objectAtPoint/clientToTile use iso picking;
      drag-pan/zoom/follow-offset still correct
- [ ] `performance`: phone FPS before/after
- [ ] `qa`: e2e updated for iso (click tree trunk + canopy, walk, smoothness ±15%, bank, phone, drag)
- [ ] Main session: real play session in Chrome (desktop + phone) + recording

## After this runbook
- First deploy = a single task, NO runbook (USER: "infra (individual no need runbook)"): infra prep is already done
  (wrangler.jsonc, _headers, ci.yml); the main session asks the user for an explicit OK → one normal commit replacing the old
  idle version (history kept; the repo email is personal) → push main → verify the Cloudflare build + `curl -I` headers.
  Tracked as task "First deploy".

## Next step
Wait for `2026-10-08-mvp.md` Status: done. Then set this to in progress and dispatch `graphics` (projection
module + tests first, playable behind a flag), then `animation` + `vfx` + `integrator` in parallel, then `qa`.

## Open questions / blockers
- Blocked on the MVP runbook (QA gate, retro).

## Log
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
