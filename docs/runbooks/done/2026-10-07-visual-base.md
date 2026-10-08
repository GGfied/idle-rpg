# Runbook: Visual base (first playable scene)

- **Status:** cancelled
- **Started:** 2026-10-07
- **Last updated:** 2026-10-07
- **Owner:** main session

## Goal
A base the user can open in the browser and see: a small tile world with placeholder art
(grass, paths, water, a town building, trees, rocks, fishing spots), a player that walks there
when you click or tap a tile on a 600 ms tick with smooth movement, a camera that follows, and a
HUD shell (inventory grid, skills list, chat log) that adapts to desktop and phone widths. No
skills or combat yet.

## Decisions
- Scaffold by hand (not `npm create vite`), since the folder already has CLAUDE.md, .claude and docs.
- Versions: Vite 6 (Node is 20.18; Vite 7 needs 20.19+), Vitest 3, React 18, Phaser 3, Zustand 5,
  TypeScript 5, ESLint 9 flat config. Path aliases are defined once in tsconfig and read by
  `vite-tsconfig-paths`.
- Placeholder art is drawn with Phaser shapes, with no image assets yet (`graphics` replaces it later).
- The map is ASCII rows in `features/world/data.ts`; Tiled `.tmj` comes later (`map` agent).
- Import boundaries are enforced with ESLint `no-restricted-imports`. Parent-relative `../` imports
  are banned in `src/`, so anything outside a module must use an alias.
- PWA, long-press, persistence and real skills are out of scope; later agents handle them.
- **Agentic workflow (user correction):** the main session wrote the scaffold and core/ itself, including
  `core/progression`, which belongs to `xp`. The user wants agents to do the work. From now on: a Workflow
  dispatches xp (review/own progression), map, movement and graphics in parallel, `qa` verifies
  across modules, and owners fix. The main session only wires `app/`. Named agent types aren't loaded
  this session, so workflow agents act as `.claude/agents/<name>.md`.

## Tasks
- [x] Scaffold: package.json, tsconfig, vite config (aliases, react, vitest), eslint, prettier,
      .gitignore, .nvmrc, index.html; `npm install`
- [x] core: engine (rng, events, tick), utils (grid, heap), contracts (world), progression (XP
      curve + skill registry), inventory (28 slots)
- [ ] Workflow: xp reviews core/progression; map builds features/world; movement builds features/movement
      (+ test-utils grid helper); graphics builds render/; qa cross-checks; owners fix
- [ ] app: store + registry + tick loop, WorldScene, React HUD (Panel/ItemSlot, inventory,
      skills, chat), responsive CSS
- [ ] Verify: lint, test and build pass; run the dev server; check in the browser (desktop + phone viewport)
- [ ] Update the runbook and report to the user
- [ ] (user request, after base) Add `sound`, `vfx` and `animation` agents (vfx and animation split per the user); update CLAUDE.md

## Next step
None. Cancelled by the user. The user will remove the code; a fresh base will be built by the agents
in a later runbook.

## Open questions / blockers
- none

## Log
- 2026-10-07: Runbook created; the user approved starting the base.
- 2026-10-07: User queued sound + vfx/animation agents for after the base.
- 2026-10-07: User asked to split vfx and animation into two agents.
- 2026-10-07: Scaffold + core done (Vitest bumped to 4.1 for audit fixes; tsc + eslint clean). User
  corrected: use agents. Memory saved; CLAUDE.md gained the agentic-workflow section.
- 2026-10-07: Cancelled by the user (the main session coded instead of using agents). The sound/vfx/animation
  agents task moved to the project-setup runbook.
