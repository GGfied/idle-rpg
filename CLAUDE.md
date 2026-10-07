# CLAUDE.md

Small single-player browser RPG inspired by Old School RuneScape, playable on desktop and on
mobile (browser + installable PWA): a tile world, click/tap-to-move,
gathering and production skills, NPCs with dialogue and a few quests, and tick-based combat
against simple monsters. There is no server; progress is saved to `localStorage`.

The old idle version is in git history at `b1f8068` and is reference only.

## Runbooks (do this every session)

Work must be resumable by a fresh session at any point.

1. **Session start:** open every file in `docs/runbooks/` whose status is `in progress`. Resume
   from its **Next step**. Don't start new work before reading it.
2. **Before starting any task:** create `docs/runbooks/YYYY-MM-DD-<slug>.md` from the template
   below, or add the task to the open runbook it belongs to. Write the runbook first, then the code.
3. **Every time a task completes:** tick it, update **Next step**, **Last updated** and the **Log**
   in the same response, before starting the next task. Record decisions and their reasons as
   they're made, including anything the user decided.
4. **New requests mid-task** go into the runbook as tasks straight away, so nothing is lost if
   the session ends.
5. **When everything is done:** set the status to `done` and keep the file as history.
6. Subagents don't edit runbooks. They report back, and the main session updates the runbook.

```markdown
# Runbook: <title>
- **Status:** in progress | blocked | done
- **Started:** YYYY-MM-DD
- **Last updated:** YYYY-MM-DD
- **Owner:** main session

## Goal
## Decisions          (what was decided, and why)
## Tasks              (- [ ] / - [x] <task> — agent: `<name>`, in the user's order)
## Next step          (exact next action a new session should take)
## Open questions / blockers
## Log                (dated one-liners: what changed, which agent did it, what was verified)
```

## Agentic workflow (the main session writes no code)

- The main session **plans, dispatches, reviews agent reports and updates runbooks**. It owns no
  code. Every file under `src/`, `public/`, `.github/`, `index.html` and the tooling configs is
  owned by an agent in the table below and is changed only by that agent. A PreToolUse hook
  (`.claude/hooks/agents-only.sh`) blocks main-session edits outside `CLAUDE.md`, `CHANGELOG*.md`, `docs/` and `.claude/`.
- **Changelog + versioning (user, 2026-10-08).** Semver (`package.json` `version`, shown in Settings via the build-time
  `__APP_VERSION__`). The main session keeps `CHANGELOG.md` (year index) + `CHANGELOG-YYYY.md` with the `changelog` skill:
  the unpushed commit is the `latest` entry; each release bumps the version, gets an entry and a `vX.Y.Z` tag.
- Run independent agents in parallel (a Workflow or parallel Agent calls), then have `qa` verify.
  The owner fixes `qa`'s findings, and `integrator` wires the result into `app/`.
- Agent files added mid-session are picked up automatically (seen 2026-10-08). If a new agent doesn't
  appear in the agent list, dispatch a general-purpose agent told to act as `.claude/agents/<name>.md`.

## Self-improvement (every agent learns)

- Every agent has `memory: project`, so its lessons live in `.claude/agent-memory/<name>/MEMORY.md`.
  It reads them before each task and records new ones after (see each agent's "Learning loop").
- **Feedback reaches the owner.** `qa`, `security` and `performance` findings, and every correction
  from the user, are passed by the main session to the owning agent, which fixes the issue *and*
  records the lesson. A finding is not closed until its owner reports "Lessons recorded".
- **Promotion.** When an agent proposes a rule change (a lesson seen twice), the main session adds
  it to that agent's `.claude/agents/<name>.md` and notes it in the runbook log. Lessons that apply
  to everyone go into this file instead.
- **Retro.** At the end of each runbook, the main session asks each agent involved for its top lesson,
  and records any promotions in the runbook's Log.

### Promoted lessons (all agents)

- **Playable first (user rule).** Every runbook starts with a crude playable build the user can open in
  the browser within minutes (stub data is fine). Each later step keeps it playable, and every report to
  the user says how to see the change. Building modules and tests for a long time with nothing visible is
  a failure, however good the tests are. (User, 2026-10-08.)
- **Every save slice ships with a `defaultValue`** (unless it genuinely can't have one), and when
  `persistence` bumps the save version, `integrator` adds the matching slices to `SAVE_SCHEMA` in the same
  round. Otherwise the running game writes current-version saves missing a slice, which later fail to load.
  (Seen twice, v2 and v3, 2026-10-08; it cost the user their progress once.)
- **QA gate (user rule, always).** No change counts as done, and nothing is reported to the user as
  working, until `qa` has run `npm run lint && npm run test && npm run build` plus the browser smoke test
  (`npm run e2e`, desktop + phone viewport) on the change and reported. Every integrator round is followed by
  a `qa` round; its findings go to the owners, and the fix gets another `qa` round. The main session's own
  browser checks add to qa; they don't replace it. (User, 2026-10-08: "we need enforce qa always".)
- **Money is not an item (user rule).** Coins/currency are a player balance (a "wallet" save slice owned by `economy`:
  balance, `add`, `spend → Result<'insufficientFunds'>`), shown in the player's info panel; never an ItemDef, never in an
  inventory or bank slot. Shops, loot tables (a `coins` drop entry credits the wallet), quests and fees all go through
  the wallet API. Not built yet. (User, 2026-10-08.)
- **Toggles are positive (user rule).** A setting's label names the thing, and On means it's active or shown
  ("Sound", "Show HUD", "Minimap"); never negative labels like "Mute", "Hide" or "Disable". (User, 2026-10-08.)
- **Locked things stay visible (user rule).** Unlock lists, achievements, quests and perk nodes show
  locked entries greyed with their exact requirements and the player's current value ("Requires
  Woodcutting 15 (you: 5)"); secrets show as "???" (optional hint) until revealed. Requirement status
  comes only from `core`'s generic Requirement evaluator (met/unmet, reason, current value).
- **Never break the live dev server.** The user plays on the dev server while agents work, and Vite hot-reloads
  every saved file. Only save edits that compile (`npx tsc --noEmit` after each save). Do break-and-restore
  "prove the test fails" checks in a copy, never in the live tree. Recipe (seconds, works with uncommitted
  files): `rsync -a --exclude node_modules --exclude dist /Users/Derrick/Projects/idle-rpg/ "$SCRATCH/mut/" &&
  ln -s /Users/Derrick/Projects/idle-rpg/node_modules "$SCRATCH/mut/node_modules"`, mutate there, then
  `npx vitest run --root "$SCRATCH/mut" <file>`. "A copy is too much work" is not a reason to mutate live files. Use absolute paths in generated edit scripts. (Seen 3×, 2026-10-08: integrator's stray CSS file,
  the half-built sidebar, animation's mangled data.ts.)
- **Clean up background processes.** Any agent that starts a dev server or headless browser kills it when done (also on
  failure); headless Chrome always runs with `--mute-audio`. (2026-10-08: orphaned test browsers played game audio on the
  user's speakers; the main session had to kill 7.)
- **Wire as you go.** A finished module isn't done until `integrator` has wired it into the running game
  and it's visible. Don't queue several finished modules for one big integration round later. (User,
  2026-10-08: "sound, graphics, vfx, animations require integrator too? because i don't see it".)

- **Absolute paths, never `cd`-then-write.** Create folders with `mkdir -p <absolute path>` and write
  files by absolute path. A failed `cd X && …` silently runs the rest in the project root, where
  parallel agents overwrite each other's files. (Seen by `items` and `equipment`, 2026-10-08.)

## Stack

Vite + TypeScript (strict) · Phaser 3 for the world · React 18 for the HUD panels · Zustand for
shared state · vite-plugin-pwa for install/offline · Vitest for tests · ESLint + Prettier.

**Hosting:** a static site (`dist/`) on **Cloudflare Workers Builds (static assets)**, connected by the user
(2026-10-08) to the personal repo `GGfied/idle-rpg`: every push to `main` builds (`npm run build`) and deploys
(`npx wrangler deploy`, config `wrangler.jsonc`: assets ./dist, SPA fallback); other branches upload preview
versions (`npx wrangler versions upload`). `NODE_VERSION=20.18.1`, Vite `base: '/'`, headers in `public/_headers`.
No deploy workflow; no backend yet. GitHub Actions runs CI (lint/test/build) on pushes/PRs. **A push deploys**, so never commit or push
without the user's OK. Full deploy setup (headers, CI, first push of the new game) is scheduled after the 2.5D
runbook (user decision).

## Commands

```bash
npm install
npm run dev     # dev server
npm run lint    # eslint (includes import-boundary rules) + prettier --check
npm run test    # vitest run
npm run build   # tsc --noEmit && vite build
```

A change is done only when `npm run lint && npm run test && npm run build` pass and you have
checked it in the running dev server, on desktop and in a phone viewport if it touches UI or input.
Use `npm run dev -- --host` to open it on a real phone on the same Wi-Fi.

## Folder structure

```
docs/runbooks/             One runbook per task: resumable state (see above)   (main session)
src/
  core/                    Shared foundations. No game content, no Phaser/React.
    engine/                tick.ts (600 ms loop), rng.ts (seeded), events.ts (typed bus) (core)
    persistence/           Save schema + versions, migrations, validation, storage
                           adapter, autosave, slots, export/import, session resume (persistence)
    contracts/             Interfaces between features: AttackStyle, CombatModifier,
                           CollisionGrid, Requirement, ...                     (core)
    items/                 ItemDef schema, defineItems(), registry, ref checks,
                           ground items, value rules                          (items)
    inventory/             28-slot inventory, stacking, use-on intents, bank   (inventory)
    skills/                Shared skill machinery: action loop, successChance(),
                           recipe/"make X" runner, depleting/respawning nodes  (core)
    progression/           XP curve, levels, skill registry, requirements      (xp)
    equipment/             Gear + tool types, equip/unequip, bonuses, bestTool  (equipment)
    utils/                 Generic pure helpers: weighted tables, math, Result,
                           tick timers, id helpers                             (core; any agent may add)
  features/                Gameplay modules. Every one follows the module template below.
    world/                 Regions, collision grid, locations, spawns, doors   (map)
    movement/              Pathfinding, click-to-move, adjacency               (movement)
    npc/                   Friendly NPC definitions, behaviour, spawning, shops (npc)
    monsters/              Monster definitions, aggression AI, spawn tables, respawn (monsters)
    story/                 Dialogue trees, quests, quest flags                 (story)
    combat/                Combat loop, melee, monster combat profiles, loot   (combat)
    skills/
      woodcutting/  mining/  fishing/  cooking/  smithing/  crafting/          (one agent each)
      ranged/  magic/  prayer/                                                 (one agent each)
  render/                  Phaser drawing: map/tiles, entity views, camera, depth
                           layers, pointer → tile, shared render helpers       (graphics)
    animation/             Anim definitions, entity anim state machine, facing,
                           tick interpolation, object state anims             (animation)
    vfx/                   Event-driven one-off effects: hit splats, XP drops,
                           projectiles, particles, markers, shake (pooled)    (vfx)
  audio/                   Event → sound dispatcher, music/ambience, volume,
                           mobile audio unlock                                (sound)
  platform/                Device layer: unified mouse/touch gestures, viewport
                           scaling, safe areas, PWA lifecycle               (mobile)
  app/                     Integration layer.                                  (integrator)
    registry.ts            The one list of features, attack styles and modifiers to load
    store.ts               Zustand store that joins feature state
    scenes/                Phaser scenes: wire features + render together
    ui/                    React HUD (hud). components/ (shared Panel, ItemSlot, Tooltip, ProgressBar,
                           ContextMenu) + panels/ (inventory, skills, equipment, chat, dialogue, ...)
  assets/                  sprites/ tilesets/ (graphics) · vfx/ (vfx) · audio/ (sound) · maps/*.tmj (map)
public/                    PWA manifest + icons (mobile) · _headers, _redirects (infra)
.github/workflows/         CI + deploy pipelines                               (infra)
  test-utils/              Shared builders: makeState(), seededRng(), withInventory(),
                           withLevels(), runTicks(), contentRefs()            (qa; any agent may add)
tests/e2e/                 Browser smoke tests                                 (qa)
```

### Module template (every folder in `features/` and `features/skills/`)

```
<module>/
  index.ts        Public API only: re-exports. Other code imports from here and never deeper.
  types.ts        Types for this module's data and state.
  data.ts         Content (nodes, recipes, items, monsters, dialogue) as typed constants.
                  Becomes data/ with one file per category when it grows past ~200 lines.
  logic.ts        Pure functions over state. Split by concern (e.g. ai.ts, shops.ts) past ~300 lines.
  *.test.ts       Colocated tests: logic.test.ts, data.test.ts.
```

Same names in every module, so anyone can find the content, the rules and the API without
reading the code. Don't create `helpers.ts`, `misc.ts` or `utils.ts` inside a feature.
Something general enough to need that name belongs in `core/utils`.

## Dependency rules (enforced by ESLint `no-restricted-imports` and path aliases)

```
app         →  features, render, audio, platform, core
platform    →  core only (plus Phaser types for scale config)
render      →  core (types only); reads state, never game logic
               (render/animation and render/vfx may also use shared render/ helpers)
audio       →  core only (plus Phaser sound types); reacts to events, never game logic
features/*  →  core only. Never another feature, render or app.
core/*      →  core/utils and core/contracts only; never features, render or app
```

Path aliases: `@core/*`, `@features/*`, `@render/*`, `@audio/*`, `@platform/*`, `@app/*`, `@test-utils/*`. Use them instead
of `../../..`. Import a module only through its `index.ts`.

Features talk to each other through **string ids** (items, npcs, locations, skills), **events** on
`core/engine/events.ts`, and **interfaces** in `core/contracts/`. `app/registry.ts` connects them.

## DRY and reuse rules

1. **Check `core/` before writing a helper.** Search `core/utils`, `core/skills` and `test-utils`
   first. If something close exists, extend it instead of writing a second version.
2. **Rule of two.** If a second module needs the same logic, move it to `core/` (`core/utils` if
   it's generic, the matching `core/<system>` if it's game machinery) in the same change, and point
   both callers at it. Never copy-paste between features.
3. **Shared game machinery lives in `core/skills`.** The intended reuse:
   - `successChance(level, low, high)`: the OSRS-style interpolated roll used for chopping, mining,
     catching fish and cooking burn rates.
   - `rollTable(rng, table)` (in `core/utils`): one weighted-table roller for loot drops, fish
     catches and gem rolls.
   - `runRecipe(state, recipe)` / "make X": consumes inputs, checks tools and levels, grants XP and
     outputs. Used by cooking, smithing, crafting and smelting.
   - `nodeState` helpers: depletion and respawn-after-N-ticks, shared by trees, rocks, fishing-spot
     moves and NPC respawns.
   - `defineItems()` / `defineRecipes()`: typed builders that validate ids at load time.
   A skill module then contains only data plus truly skill-specific rules (bait use, spot moving,
   burn levels).
4. **Data over code.** New trees, rocks, fish, recipes, monsters, spells or quests are new entries
   in a `data.ts`, never new functions or `if (id === ...)` branches. Needing a branch means the
   machinery is missing a generic option. Add the option to `core/` instead.
5. **One source of truth per fact.** The XP curve is only in `core/progression`, the inventory
   rules only in `core/inventory`, and gear bonuses only in `core/equipment`. Item ids are declared
   once by the owning module and referenced everywhere else as string ids, never redefined.
6. **Shared UI pieces.** HUD panels use `app/ui/components/`. A panel never hand-rolls its own
   slot grid, tooltip or progress bar.
7. **Shared test builders.** Tests build state with `test-utils/` (`makeState`, `withInventory`,
   `withLevels`, `runTicks`, `seededRng`) instead of writing state literals in each test.
   Content-reference checks use one generic `contentRefs()` validator.
8. **Don't over-abstract either.** Extract on the second real use, not in anticipation. Prefer a
   plain function to a class or framework. Keep files under ~300 lines and functions short.

## Architecture rules

- **Game logic is pure TS** in `core/` and `features/`. Only `render/` and `app/scenes/` import
  Phaser; only `app/ui/` imports React.
- **One 600 ms game tick** (`core/engine/tick.ts`) drives skills, combat, movement and NPCs.
  Rendering interpolates between ticks. Game logic never runs on frame time.
- **Every tickable feature** exposes `tick(state, ctx) → { state, events }` with the same signature,
  so `app/registry.ts` can loop over them.
- **All randomness** goes through `core/engine/rng.ts` (seeded), so tests can replay results.
- **Combat plug-ins**: `combat` owns the loop and melee. `ranged` and `magic` provide an
  `AttackStyle`; `prayer` provides `CombatModifier`s (both from `core/contracts/`).
- **Item ids are global snake_case strings** (`"oak_logs"`, `"raw_shrimp"`), registered through
  `defineItems()`. Duplicate ids fail a test.
- **Saves** go only through `core/persistence`. Each feature exposes `serialize`/`deserialize` for
  its own slice. Any change to persisted state bumps the version and adds a migration plus a test
  against the previous version's fixture, in the same change. Loaded saves are untrusted: validate their
  shape and never `eval` them or spread them into prototypes. Render all game text as plain text
  (no `dangerouslySetInnerHTML`).
- **Mobile-first input.** Every interaction works with touch: tap = left-click, long-press =
  right-click menu, pinch = zoom. No hover-only information. Tap targets ≥44px. Input goes only
  through `platform/input`, so there's one code path for every device. The HUD uses responsive
  CSS on shared components, never separate mobile components.
- **Future: multiplayer + server persistence (user's stated direction, 2026-10-08).** Don't block it: game logic
  stays pure, deterministic (seeded RNG, the tick drives everything, no wall-clock in rules) and serializable, so it
  can later run server-authoritative (e.g. Cloudflare Workers + Durable Objects, D1). Player input stays as
  intents (walkTo, interact, …), never direct state mutation from the UI; save slices stay the unit of
  persistence. Not built yet: no backend until its own runbook.
- Use original names and art only. No Jagex assets.
- Keep it small. Don't add libraries or features nobody asked for.

## Naming

- Files and folders: `camelCase.ts`, with React components as `PascalCase.tsx`. Module files use
  the fixed template names.
- Content ids: `snake_case` strings. Events: `camelCase` past tense (`treeDepleted`, `levelUp`).
- Types: `PascalCase`; content definitions end in `Def` (`ItemDef`, `ToolDef`, `MonsterDef`).

## Subagents (`.claude/agents/`)

| Agent | Owns | Use for |
|---|---|---|
| `core` | `core/` (engine, contracts, skills, utils), tooling configs | Project setup, tick/RNG/events, contracts between features (incl. the one generic `Requirement` evaluator), skill machinery, shared helpers, lint/test/build config |
| `items` | `core/items` | ItemDef schema, item registry and reference checks, ground items (drops, despawn, pick-up), item values, drop tables (one shared format + roll, referenced by id from monsters/chests/rewards) |
| `inventory` | `core/inventory` | 28-slot inventory, stacking, move/drop, use-item-on intents, bank, item-count queries |
| `integrator` | `app/` (not `app/ui`), `index.html` | Registry, store + actions, runtime/tick/save wiring, Phaser scenes; wires finished features into the game |
| `hud` | `app/ui` | React HUD: shared components, panels (inventory, bank, skills, chatbox, tracker, popups, settings), HUD layout desktop + phone |
| `facilities` | `features/facilities` | Interactive world objects (bank chest, loot chests, furnace, range, anvil, altar, fires) as data: options, interaction rules, object state |
| `netcode` | `net/` (future) | Multiplayer: shared protocol, server-authoritative tick, snapshot/delta sync, prediction/interpolation for latency, reconnect, cheat-resistant intent validation |
| `backend` | `server/` (future, repo root) | Cloud: Cloudflare Workers + Durable Objects (rooms), D1/KV/R2 (accounts, cloud saves), auth, rate limits, server migrations, cost |
| `achievements` | `features/achievements` | Achievements as data (counts, level goals, one-offs), progress from events, completion + rewards by id, titles/unlocks; perk trees only if adopted |
| `tutorial` | `features/tutorial` | First-time onboarding steps, hint targets, step completion from events, skip/replay, progress flags |
| `balance` | read-only (+ `tests/balance`) | Simulates XP/hour, time-to-level and rates against targets; proposes data changes to owners with numbers |
| `story` | `features/story` | Dialogue, quests (stages, requirements, rewards as data), quest flags, story text |
| `npc` | `features/npc` | Friendly NPCs (villagers, shopkeepers, quest givers): definitions, options (a shopkeeper's "Trade" points to a shop id), simple behaviour, spawning |
| `economy` | `features/economy` | Wallet (coins are a balance, not an item), shops (stock, restock, buy/sell, pricing), coin rewards, later trading/market |
| `monsters` | `features/monsters` | Hostile creatures: definitions, aggression/wander/flee/leash AI, spawn tables per area, death + respawn |
| `map` | `features/world`, `assets/maps` | Regions, Tiled maps, collision grid, named locations, spawn points, doors and stairs, teleport destinations |
| `combat` | `features/combat` | Combat loop, melee, combat profiles for monsters, damage, rolling a monster's drop table on death, player HP + death |
| `movement` | `features/movement` | Pathfinding on `map`'s collision grid, click-to-move, walk/run, adjacency |
| `woodcutting` | `features/skills/woodcutting` | Trees, axes, logs, chop rates |
| `mining` | `features/skills/mining` | Rocks, pickaxes, ores, depletion/respawn |
| `fishing` | `features/skills/fishing` | Fishing spots, rods/nets/bait, catch rates |
| `cooking` | `features/skills/cooking` | Recipes, burn chance, fire vs range, healing values |
| `smithing` | `features/skills/smithing` | Smelting, smithing at an anvil, metal tiers, gear stats it produces |
| `crafting` | `features/skills/crafting` | Leather armour, gem cutting, jewellery |
| `ranged` | `features/skills/ranged` | Bows, ammo, ranged `AttackStyle`, ammo recovery |
| `magic` | `features/skills/magic` | Runes, spellbook, combat spells (`AttackStyle`), utility spells |
| `prayer` | `features/skills/prayer` | Burying bones, prayer points, prayers as `CombatModifier`s |
| `xp` | `core/progression` | XP curve, levels, skill registry, requirements, combat level, level-up events, XP tuning |
| `equipment` | `core/equipment` | Combat and skilling gear: slots, `EquipmentDef`/`ToolDef` types, equip/unequip rules, bonus totals, `bestTool`/`hasTool` |
| `graphics` | `render/` (not animation/vfx), `assets/sprites`, `assets/tilesets` | Sprites, tilesets, drawing maps, entity views, camera, depth layers, pointer → tile, visual polish |
| `animation` | `render/animation` | Animation definitions, entity animation state machine, facing, tick interpolation, object state animations |
| `vfx` | `render/vfx`, `assets/vfx` | Hit splats, XP drops, projectiles, particles, click markers, level-up effects, screen shake |
| `sound` | `audio/`, `assets/audio` | Event-driven sound effects, region music and ambience, volume settings, mobile audio unlock |
| `qa` | `test-utils/`, `tests/`, all `*.test.ts` | Writes and runs tests, plays the game in the browser, reports bugs. Doesn't fix production code. |
| `performance` | read-only by default | Measures FPS, tick cost, memory, bundle size and save size; proposes or makes fixes backed by before/after numbers |
| `mobile` | `platform/`, `public/`, mobile layout in `app/ui` | Touch gestures, responsive HUD, scaling/safe areas, PWA install + offline, mobile verification |
| `infra` | `.github/workflows/`, `public/_headers`, hosting config | Cloudflare Pages hosting (Git-connected), CI/CD, security/cache headers, releases. Asks before anything outward-facing or costly. |
| `persistence` | `core/persistence` | Save schema, versions and migrations, save validation, storage adapter, autosave, save slots, export/import, session resume, offline progress |
| `security` | read-only | Dependency audit, save/import validation, XSS in rendered text, CSP, secrets in the bundle. Reports findings. |

Paths in this table are relative to `src/`. Give each agent one clear task, and name the
interface, item ids or event it must produce. Every agent follows the module template, the
dependency rules and the DRY rules above. When an agent adds a helper to `core/utils` or
`test-utils`, it lists it in its report. When it's done, `integrator` wires the result into
`app/` (registry, store, scenes, UI), `qa` verifies, and the main session updates the runbook. Use
`performance` after big features or when something feels slow.
