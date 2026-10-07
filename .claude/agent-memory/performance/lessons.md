---
name: perf-lessons
description: How to measure frame cost on a throttled phone in this repo, and what was found (Phaser container cost, chunk RTs)
metadata:
  type: project
---

- 2026-10-08: Phaser 3.90 never culls a Container: every tree/NPC view (Container + Graphics) is drawn each frame even off-screen. 163 views = ~19 ms render JS at 4x CPU (p95 frame 33 ms, 12-26% of frames > 20 ms), ~0.11 ms/view. Fixed by `render/viewCull.ts` (`cullToCamera`, called from `makeContainer` in views.ts): p95 33.4 -> 16.7 ms. Any new always-on Container/Graphics view must go through makeContainer (or cullToCamera). Longer term: bake tree Graphics to textures.
- 2026-10-08: Hiding the 9 chunk RenderTextures changed nothing (frame cost was entities, not ground). RTs are 2052x1028x4 = 8.06 MB each: 9 = 72.4 MB (interior), 6 at world edges. Over the ~60 MB guide; not fixed (proposal: load only RTs that intersect the camera view, or 2x2 window; needs zoom-limit rework by integrator).
- 2026-10-08: ensureAround on a new chunk row/column = 7-15 ms at 4x (first load 25-44 ms incl. RT creation); costs at most one 33 ms frame per border. rt.draw is GPU-queued so the JS timing understates GPU work.
- Recipe that works: own Chrome via tests/e2e/cdp.mjs `launchChrome`, `Emulation.setDeviceMetricsOverride` 390x844 dpr3 mobile + `setCPUThrottlingRate` 4, rAF-delta recorder, `scene.ground.ensureAround` wrapped with performance.now, `game.events` prerender/postrender for render JS time, teleport via `__idleRpg.store.setState(position)` (jump to border-4 then step 1 tile/600 ms). Bisect by `setVisible(false)` per object type.
- 2026-10-08: Run vite on an rsync snapshot (`rsync --exclude node_modules` + symlink node_modules), not the live tree: other agents' edits trigger HMR full reloads mid-measurement (window globals vanish). Chrome here is real Apple GPU (ANGLE Metal), so GPU-side phone cost is optimistic; only CPU is throttled.
- zsh: `for p in "a b"; do set -- $p` does not word-split; use `a=(${=p})`.
