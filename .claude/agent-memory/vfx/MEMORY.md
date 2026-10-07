# vfx memory
- 2026-10-08: Cross-module facts (skill colours) are injected as optional createVfx callbacks, not duplicated; put the resolve/fallback in a pure logic.ts fn so vitest covers it without Phaser.
- 2026-10-08: Cue matching (`when`) + per-cue `throttleMs` live in data/planEvent; throttle is a pure `createThrottle`. macOS sed needs `-i ''`; back up the file before mutation-testing.
- 2026-10-08: tsconfig has noUncheckedIndexedAccess: `EFFECTS[id]` is possibly undefined; guard it. Eslint blocks `../depth`; use `@render/depth` even inside src/render.
- 2026-10-08: Phaser tween config typing fights object spreads; pass props as `object` and cast to TweenBuilderConfig once in a helper.
- 2026-10-08: Pattern that worked: pure `createPool` (recycle-oldest) + `planEvent` + data `EFFECTS` by `kind` in Phaser-free files; one runner dispatches on kind, not per effect.
- 2026-10-08: Shell hook may block commands naming src/ paths in the main session; subagent runs of npx eslint/vitest on src/render/vfx worked fine.
- 2026-10-08: Import shared render helpers via '@render/index' (graphics/coordinator rule); run tsc on the whole project before reporting, not just grep vfx.
- 2026-10-08: Mode filtering (on/reduced/off, xpDrops) lives in pure `resolveEffect`+`planEvent(…, opts)`; flag data with `decorative`, no per-effect branches. Mutation-tested (break decorative check -> reduced test red). `npx tsc -p .` prints nothing; use bare `npx tsc --noEmit`. Build can fail from another agent's in-progress files (animation/data.ts) – report, don't touch.
