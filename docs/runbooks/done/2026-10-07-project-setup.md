# Runbook: Project setup (CLAUDE.md + subagents)

- **Status:** done
- **Started:** 2026-10-07
- **Last updated:** 2026-10-07
- **Owner:** main session

## Goal
Set up the rebuild of the OSRS-inspired single-player web game: project rules in `CLAUDE.md`
and one subagent per area in `.claude/agents/`, with a maintainable, DRY folder structure.
No game code yet.

## Decisions
- Stack: Vite + TypeScript + Phaser 3 (world) + React 18 (HUD) + Zustand + Vitest. Chosen by
  the user over PixiJS or React-only.
- Small project. Old idle version (`b1f8068`) is reference only; its deleted files are not
  restored.
- The main session integrates; feature agents own one folder each and import only from `core/`.
- 20 agents: story, npc, map, combat, movement, woodcutting, mining, fishing, cooking, smithing,
  crafting, ranged, magic, prayer, xp, equipment, graphics, qa, performance, security. All use
  `model: sonnet` (user's global rule bans Opus 5).
- `equipment` covers both combat gear and skilling tools (my reading of "combat equipment and
  skill equipment"; split into two agents if the user meant that).
- Hosting: Cloudflare Pages + GitHub Actions (repo github.com/GGfied/idle-rpg); GitHub Pages is
  the fallback. Static site only, no backend.
- Folder layout: `core/` (engine, contracts, items, inventory, skills machinery, progression,
  equipment, utils), `features/` (uniform module template), `render/`, `app/` (integration),
  `test-utils/`.

## Tasks
- [x] Write CLAUDE.md (stack, rules, agent table)
- [x] Write the first agents: story, combat, movement, graphics, woodcutting, mining, fishing,
      cooking, qa, performance, security
- [x] Add smithing, ranged, magic, prayer; combat plug-in interfaces (AttackStyle, CombatModifier)
- [x] Add map + npc; move ownership away from story, movement, graphics and combat
- [x] Add xp + equipment (in `core/`); equipment covers skilling tools; add crafting
- [x] Verify the agents' frontmatter and that the CLAUDE.md table matches the files (20/20)
- [x] Restructure CLAUDE.md: maintainable folders, module template, dependency rules, DRY rules
- [x] Add the runbook rule to CLAUDE.md
- [x] Migrate all agent files to the new paths and DRY rules; grep for stale paths
- [x] Verify the agent table, paths and frontmatter again
- [x] (user request) Mobile support: add a `mobile` agent (touch, responsive HUD, PWA) and mobile
      rules in CLAUDE.md; mobile budgets in performance, phone viewports in qa
- [x] (user request) Add an `infra` agent for hosting/cloud and record the hosting decision in CLAUDE.md
- [x] (user request) Add a `persistence` agent (saves/session); move save code out of core/engine
- [x] (user request) Add `sound`, `vfx` and `animation` agents; carve vfx/animation/audio out of `graphics`
- [ ] (cancelled by the user) Build a base the user can see in the browser. Not started: the user
      asked what TS and Phaser are first. It gets its own runbook `2026-10-07-visual-base.md`.

## Next step
Agree with the user how agent-only work is enforced (hook + integrator agent proposal), then restart
the session so all agents load by name.

## Not started (after this runbook)
- Scaffold Vite + TS + Phaser + React + Zustand + Vitest + ESLint path aliases and boundary rules.
- Build the `core/` foundations (engine, items, inventory, skills machinery) before any feature agent runs.

## Log
- 2026-10-07: CLAUDE.md + 20 agents written and verified. The user asked for a DRY/maintainable
  layout and for runbooks; this runbook was created mid-session to capture state.
- 2026-10-07: CLAUDE.md rewritten with core/features/app/render layout, module template,
  import boundaries, DRY rules and the runbook workflow. User asked for a visual base next.
- 2026-10-07: All 20 agents moved to the features/core/app paths, with DRY rules added. Re-verified:
  frontmatter valid, 20/20 match the table, no stale paths. The user asked about TS/Phaser
  before starting the base.
- 2026-10-07: The user confirmed the stack and asked whether it can be played on mobile, and for a mobile agent.
- 2026-10-07: Added the `mobile` agent (21 total), platform/ + public/ in the layout, mobile input rules,
  phone FPS budget and phone-viewport QA. Verified 21/21 match the table.
- 2026-10-07: The user asked for an infra/cloud agent for hosting.
- 2026-10-07: Added the `infra` agent (22 total). Hosting decision: Cloudflare Pages + GitHub Actions
  (repo is github.com/GGfied/idle-rpg); GitHub Pages is the fallback. Verified 22/22 match the table.
- 2026-10-07: The user asked for a persistence/session agent.
- 2026-10-07: Added the `persistence` agent (23 total); save code now in core/persistence. Repointed
  xp/equipment/mobile/security. Verified 23/23 match the table, no core/engine/save refs.
- 2026-10-07: User cancelled the visual base and asked to add the agents first (sound, vfx, animation).
- 2026-10-07: Added sound, vfx and animation (26 agents). graphics narrowed to the map, entity views, camera
  and helpers. Verified 26/26 match the table.
