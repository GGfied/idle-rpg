# graphics memory
Full history: docs/archive/agent-memory-graphics-2026-10-09.md

## Workflow and verification
- Keep render logic pure (painters -> RGBA/rects, no Phaser), Phaser files thin with `import type Phaser`; tests use small fake scenes.
- Preview art without a server: esbuild-bundle an entry into scratchpad/gfx (own subdir; generic names get overwritten) + `chrome --headless=new --screenshot`. Look at real scale.
- Before blaming own code for an e2e fail, run the same e2e on a HEAD/baseline scratch copy; dump store state around the tap. Rerun when load is high.
- Refactors: record a checksum/golden BEFORE editing (other agents' uncommitted work means git HEAD may differ); add a second golden if the first misses a branch.
- Test thresholds: measure old vs new values first, put the bound between them. Make the mutant-killing input strict (e.g. list the loser first, tall keep-out rect).
- Only save compiling edits; add index.ts exports before importers. Run `npm run lint` not just tsc. Format only own files (never prettier over src/render/*.ts).
- Run only own vitest files when other agents have red work in progress; never `vitest --root /`.
- Grep for an existing source/flag before inventing one.
- Pooled Containers with cullToCamera: uncullFromCamera on release.

## Phaser / renderer gotchas
- User's Chrome runs Phaser CANVAS (no WebGL). CANVAS ignores fillGradientStyle and batchDrawFrame tint. Any new gradient/tint/blend must be checked under CANVAS (repro: getContext('webgl*') -> null; tests/e2e/canvasRender.e2e.mjs). WaterBase.gradient flag + canvasStamp.drawTinted are the fallbacks; flat fills use sub-cells, not 2 triangles.
- Event order: scene 'prerender' -> camera.preRender (follow lerp, worldView) -> camera 'prerender' -> draw. Hook camera 'prerender' to read the current worldView (labelClampHook.ts).
- Phaser tint only multiplies: author textures at the light end.
- Measure frame cost prerender->postrender, not rAF deltas (vsync-capped).

## Camera
- Never roundPixels with lerp follow (judder); setupCamera forces false.
- camera.ts startFollow wrapper: same target -> only lerp.set + setFollowOffset; new target -> save/restore scroll; default offset = cam.followOffset (raw startFollow resets offset and snaps).
- HUD insets: app/scenes/visibleArea.ts (hudInsets, followOffset) + boundsWithInsets/setCameraInsets; don't hardcode px.

## Labels and nameplates
- Flip only the body graphics child, never the container; keep text out of flipped parents.
- labelClampOffset(entityX,halfW,viewL,viewR,margin) moves label.x only. keepOutShift (render/labelKeepOut.ts, setLabelKeepOuts provider, 200 ms TTL) sideways capped at MAX_SIDE_SHIFT=40 CSS px (= 40/zoom world px; e2e oracle must allow it), else down.

## Art
- Figures: figureArt.ts 36x64 grid, looks are data (figureLooks.ts, PLAYER_LOOKS spread from PLAYER_BASE; HairStyle short|long|bald). Torso/shirt colour must equal rig sleeve. Rig flags rigArms (on), rigUpperArms, rigLegs (off until animation has legs). NpcSpriteKey also exists in features/npc/types: keep synced.
- Portraits: render/portrait.ts crops paintFigure head, own PNG encoder -> data URL; import via '@render/index'.
- Icons: ONE generator assets/sprites/gen/gen_items.py (32x32 SVG); everything reads itemIconSource(id) = {key `item_icon_<id>`, url}. New params default off so old SVGs stay byte-identical: generate to scratch, cmp, copy only new files. Raw/cooked/burnt differ by SHAPE; all cooked fish share one warm gold-brown. SVG <4096 B becomes a data: URL (tests match /svg/; React escapes ' as &#x27;). Run src/app/itemIconsEverywhere.test.tsx after icon changes. Skill icons: 16x16 in assets/sprites/skills, accent = SKILLS[].color.
- Nodes: shared painters in render/pixelArt.ts; trees treeArt.ts (texture tree_<kind>_<v>[_stump]); rocks need body colour AND vein colour to differ (copper 0xe88a2c + patina, iron 0x8a5a44, coal dark); fishing spots differ by shape/size, not tint. Set hit-box consts by measuring the painted art.
- Water/ground: no per-tile base texture (shows a grid): shared-corner vertex colours (waterShade.ts) + detail stamps; stamps queued after water base. Ground textures pure (paintGroundPixels).
- World edge: outer ring of REAL chunks (chunkRenderer skirt cache) + backdrop-alpha single polygons per layer (cov(i)=(i/N)^.85); grow clip ~0.05 tile for PAD 2px overhang.
- Buildings: buildingModel.ts pure + buildingRenderer.ts; looks in BUILDING_LOOKS; texture keys keep `bld_wall` prefix (e2e filters). Roof ridge = shadeColor(roofBase, .55), never an accent colour.
- Fire: fireArt.ts; flame layers origin=root; log pile reuses paintLog(LogStyle).
- Ground drops: PILE_OFFSETS on the front half of the tile; hit centre stays tile centre.

## Minimap (render/minimap.ts)
- Tile grid, not iso: Facing8 'se'=0, 's'=pi/4 (facingToMinimapAngle). Integer tile coord = tile middle.
- Shared paint() for circle and world-map rect via Frame. Labels: facilities first, regions sorted by distance to centre, keep-out around player, fonts scale by view.pixelRatio (canvas is CSS x dpr). Tests call clearMinimapLabelCache.
- Markers: rocks = outlined squares, spots = ringed dots, trees mid-tone with ring; stroke before fill.

## Adding kinds (checklists)
- Rock kind: rockArt (ROCK_LOOKS, new kindSeed), views.ts (RockKind, NODE_FOOTPRINTS, PIXEL_HIT_KINDS, VIEW_HIT_BOUNDS), nodeArt/itemIcons/groundItems test lists.
- Object kind: ObjectKind + OBJECT_FOOTPRINTS + VIEW_HIT_BOUNDS + OBJECT_ART (render/objectArt.ts), plus features/world ObjectKind (map owns).
- Terrain kind: palette + tilemap decorate + MINIMAP_PALETTE. New HitKind: VIEW_HIT_BOUNDS. Hit bounds derive from the draw constants; changing them breaks app/objectAtPoint.test (tell integrator).
- Imports inside render/ via @render/*; depth = depthFor (ENTITY + tx+ty + tx*1e-4).

## Shell gotchas (macOS)
- `sed -i` fails/silently skips: use python replace and grep the result. Never start a command with a bare `cat >` (hangs). Check files exist after `a && cat > f`. Don't cp -r dirs holding a node_modules symlink. vitest hides console.log: write to a file.
