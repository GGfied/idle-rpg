# Integrator memory
Full history: docs/archive/agent-memory-integrator-2026-10-09.md

## Safety (live dev server)
- Edit scripts: absolute paths, full heredocs (never bare `cat >`), types+callers in one script, `npx tsc --noEmit` after every script; grep that edits landed.
- Prettier only on named files (never `src/app` or `game/*.ts` globs: hits hud/others' files); check with `git diff`.
- Don't wire a module whose index doesn't export yet: report blocked. Name foreign red tests/tsc errors as the owner's mid-edit.
- Kill only your own Chrome PID, never pkill a pattern. Max 2 e2e runs per foreground call (600 s cap).
- Follow the latest explicit order from the coordinator; wait for the final word before wiring a sibling's feature.
- Keep the per-swing `say(WOODCUTTING_MESSAGES.started)` in `animator.onImpact` (user's request); confirm before removing on a QA note.
- Don't claim a root cause you could not reproduce.

## Wiring patterns
- Systems take `Content` as a factory arg and import only types from registry (value import registry<->systems crashes).
- Feature events needing chat: handle in the owning system (game/systems.ts), actions cannot emit; store has `say(text)`.
- ESLint: React only in `app/ui`, Phaser only in `app/scenes` (main.tsx calls `ui/mount.tsx` + `scenes/createGame.ts`). Import `@render/index`, `@render/animation`, `@render/vfx`; spread interfaces (`{...e}`) for audio/vfx.
- Transient state (not saved): pendingFacility/pendingNpc, talk, bankOpen+bankMode, ground/pendingGround/tick, fishing/pendingFishing, firemaking{fires,nextId,lighting}/cooking/pendingCook. Intents run on arrival in game/intents.ts applyIntent; cancelActions chains cancelLighting/cancelCooking.
- Requirements: ONE `game/requirements.ts` `requirementContext(game, items?)`; Requirement shape `{type:'skillLevel',skill,level}` (check real types, not the brief). Locked menu: `game/menuLock.ts`.
- Rocks reuse `gatherNode(content,id)`; fishing has its own system; `addSpot` tile arg is an INDEX. `withNodeSkill` only for nodeDepleted/Respawned.
- Starter kits: `starterKits.ts`, no slice; one-time grants in `meta.grants`. `playTimeSystem` must spread meta.
- Adding starting items / changing action signatures breaks qa's slot-count/step tests: list them for qa.
- Facility kinds route by data; a new kind needs only render views.
- Optional new RuntimeEnv hooks so qa's fake envs compile. Parallel sibling API: code against a local minimal interface + normalizer.
- DEV hooks only in main.tsx `import.meta.env.DEV`; prod method is `retime` (RetimeTicker); dist grep for setTickMs/__idleRpg must be empty.

## Scenes and render
- Positions via `isoProjection.tileToWorld`; picks via `pickTile`; hit order `depthFor`; facing `facingFromStep`.
- Taps: `objectAtPoint(x,y,targets,isOpaqueAt)` = render `hitBoundsFor(kind,…)` then drawn-pixel alpha (2px tolerance; at/below feet skip pixel test). `groundAt` runs before objects.
- `platform/viewport` mode 3 = FIT; createGame uses `Phaser.Scale.RESIZE` + `followParentSize`/`remeasureScale`; `watchViewport` refreshes scale. Check Phaser enum values.
- Interpolation keys on TICK number (`renderTrail.ts`); `frameAlpha(ticker, performance.now())` per frame; `snapTrail` when a new fire appears.
- Chunks: `chunkWindow.ts` 3x3 views, `chunkRenderer.ensureVisible(cam.worldView,…)` every frame; camera bounds are the single clamp; ChunkDef needs `{size: CHUNK_SIZE}`. `createWorldEdge` before `createChunkRenderer`.
- Swings derive from what the tick did (`attemptLanded`), ONE source per skill (`animatorImpactCounts`); fishing anim via `playerAnimInput`; rod pulse `rodCatchLanded`; fishing flash via `stopFlash.ts` `flashEvent`.
- Fire views: `fireLifecycle.ts` sync(fires,tick,lighting) on EVERY store change; flicker.remove before view.destroy.
- Player look: rebuild rig via `buildAnimator(look)` on `s.prefs !== this.prefs`.
- Label keep-out: `keepOutRects.ts` provider in watchVisibleArea (skip opacity <0.05).
- Phone sheet: `cam.setFollowOffset` from `visibleArea.ts`.

## Audio and prefs
- Prefs store is the single source; push only CHANGED sound fields to audio. `muted` = user choice only; background uses suspend/unlock, never setMuted.
- One AudioContext per page (`__idleRpgAudioDispose`); `audio.unlock` wrapped in runtime. Area audio in runtime `followArea`.
- Chat filter at write time (`filterNewChat`).

## Saves
- Persistence version bump: add matching SAVE_SCHEMA slices same round; slices need `defaultValue`; test the user's old envelope through real SAVE_SCHEMA.
- Storage lease (`session` key) stops stale tabs; save trigger is `game/saveTrigger.ts`.

## Testing
- Mutants in a uniquely named scratch copy; a mutant that survives needs a fake source/registry (real data can make it equivalent).
- e2e: `tests/e2e/lib.mjs` withGame (tickMs 60 default; pass 600 for poses), E2E_PORT not PORT, frozen vite config; `g.state(path)`, `g.eval` for objects. Phone HUD starts folded: tap `[aria-label="Expand panel"]`. Player pos `s.game.movement.position`.
- Before blaming the app on a flaky e2e, trace all spy records (sound classifiers collide with music) and compare against an unchanged copy over several runs. Run worldEdge per renderer.
- Gather nodes respawn ~12 ticks: assert `session === null`. Bait spot needs fishing xp 400. Item id `raw_shrimp`. Tests can't import `@render/vfx` (Phaser). vitest swallows console.
- Text.getBounds is not screen space; tree canopy overlaps the tile behind (use lone targets). zsh: no `timeout`, quote globs; BSD `sed -i ''`.
- 2026-10-09: Visual defaults never come from matchMedia (user decision); RuntimeEnv has no prefersReducedMotion hook. A runtime-only mutant restoring matchMedia stays green because preferences ignores the flag; the guard lives in persistence tests.
