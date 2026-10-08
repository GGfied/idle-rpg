# CLAUDE.md

Small single-player browser RPG inspired by Old School RuneScape, for desktop and mobile (browser + PWA): tile world,
tap/click-to-move, gathering and production skills, NPCs, dialogue, quests, tick-based combat. No server; saves go to
`localStorage`. The old idle version (`b1f8068`) is reference only. Full pre-trim text and history: `docs/archive/`.

## Runbooks (every session)

1. **Session start:** read every `docs/runbooks/` file with status `in progress`; resume from its **Next step**.
2. **Before a task:** add it to the open runbook it belongs to, or create `docs/runbooks/YYYY-MM-DD-<slug>.md` from the
   template. Runbook first, then code.
3. **When a task completes:** tick it, update Next step, Last updated and Log in the same response. Record every
   decision and its reason, including the user's.
4. New requests mid-task go into the runbook at once. Subagents never edit runbooks; they report, the main session writes.
5. **Done:** status `done`, move to `docs/runbooks/done/`. Keep the Log short: archive old log lines to `docs/archive/`.

Template: `# Runbook: <title>` · Status / Started / Last updated / Owner · `## Goal` · `## Decisions` (what + why) ·
`## Tasks` (`- [ ] <task> — agent: <name>`, user's order) · `## Next step` · `## Open questions / blockers` ·
`## Log` (dated one-liners: what changed, which agent, what was verified, dispatch→done minutes).

## Tasks + session file (HARD RULE)
1. Always create tasks. 2. Update them in real time (tick when done; partial = note done/pending).
3. Session start (new or after /clear): check `docs/runbooks/` for in-progress runbooks (this project's continuation mds);
   if any, ask the user: continue which one, or new. Create/continue it at once and update it all through the session automatically, never waiting to be asked.
4. Every task goes in it.
5. Trim it and all config mds when they get too big.

## Trim long markdown first (HARD RULE, user 2026-10-09)

Before starting any task, check the size of every md you will read (`wc -c`). If one is over its limit, trim it FIRST:
copy the original to `docs/archive/<name>-YYYY-MM-DD.md`, then keep only what still guides work (merge duplicates,
drop superseded entries and narrative, one line per lesson). Limits: `CLAUDE.md` 16 KB · `.claude/agents/*.md` 6 KB ·
`.claude/agent-memory/*/MEMORY.md` 6 KB · a runbook 8 KB · `docs/qa-coverage.md` 10 KB · `docs/agent-progress.md` and
`docs/qa-log.md` 6 KB (move older lines to the archive). Agents trim their own memory; the main session trims the rest.

## Agentic workflow (the main session writes no code)

- The main session plans, dispatches, reviews reports and updates runbooks. Every file under `src/`, `public/`,
  `.github/`, `tests/`, `index.html` and tooling configs is changed only by its owning agent (table below). A hook
  (`.claude/hooks/agents-only.sh`) blocks main-session edits outside `CLAUDE.md`, `CHANGELOG*.md`, `docs/`, `.claude/`.
- **Changelog + versions (user):** semver in `package.json` (shown in Settings via `__APP_VERSION__`). The main session
  keeps `CHANGELOG.md` (year index) + `CHANGELOG-YYYY.md` with the `changelog` skill; header `### v0.1.1 · YYYY-MM-DD SGT`
  (version, never `latest`/hash); unreleased work goes under the next version. Tags `vX.Y.Z` come from the pipeline on
  push to `main`; never tag by hand.
- Feedback reaches the owner: qa/security/performance findings and every user correction go to the owning agent, which
  fixes it and records the lesson in `.claude/agent-memory/<name>/MEMORY.md` ("Lessons recorded" closes it). A lesson
  seen twice is promoted into that agent's `.claude/agents/<name>.md`, or here if it applies to all.
- New agent files are picked up mid-session; if one isn't listed, use a general-purpose agent told to act as it.

## Rules for every agent and the main session (user rules unless noted)

**Delivery**
- **Playable first.** Every runbook starts with a crude playable build within minutes; each step keeps it playable and
  every report says how to see the change.
- **Wire as you go.** A module isn't done until `integrator` wires it in and it's visible.
- **Build the shared base first** (test harness, shared component, core machinery), then the many instances on top.
- **Complete beats fast.** Never cut an agent short or have it report partial work. Speed comes from slicing up front.
- **Small slices.** One concern, a few files, about 10 minutes per agent run. Different files run in parallel; the same
  file runs in sequence. Never queue follow-ups onto a long-running agent. Every integrator slice gets its own qa slice.
- **Exact targets in every prompt:** files, lines, repro and test file, checks in priority order, a time target.
- **Read only your own area.** An agent reads its owned directories (Agents table), the `index.ts` public API of any
  module it imports, and files its prompt names. No repo-wide reading or grep sweeps. If it needs something
  elsewhere, it asks in its report or reads just that one file.
- **No polish or extra rounds** after a feature passes qa unless the user asks; park ideas and tell the user.

**Running agents**
- **Chase, don't kill.** Every dispatch has a time target. At the target and every ~5 min after, the main session reads
  the agent's progress and pushes it to finish. Never stop, kill or time-box an agent; if one seems stuck, tell the user.
- **No endless loops.** The same run, repro or fix at most twice with nothing changed. A failure not reproduced in 2
  runs is reported as "not reproduced" with evidence. A fix that fails twice → stop and report cause + blocker. Same
  "next" twice in the progress lines = loop → redirect with a concrete next step.
- **Progress in real time.** Agents append `- HH:MM <agent> <item>: <what> — next: <next>` to `docs/agent-progress.md`
  (single `>>`) at start, first compiling save, tests green, mutant result, blocked, done. qa/balance/performance runs
  append one line to `docs/qa-log.md` before reporting. With every report, dispatch and user request the main session
  updates `docs/qa-coverage.md` "Open now" (🔧 code done / ⏳ running / ✅ passed + mutant red / ❌ open) and the task list.
- **Leave 20% CPU for the user.** Test launchers (`tests/e2e/cpuGate.mjs`, used by `cdp.mjs` and `run-all.mjs`) start
  a Chrome/file only if load1 + 1 ≤ cores × 0.8 and < 4 headless Chromes run machine-wide. The main session checks
  `uptime` before dispatching browser agents.
- **Clean up.** Kill your own servers/browsers by PID when done (also on failure), never `pkill`/`killall` by pattern.
  Headless Chrome always `--mute-audio`.

**Testing and QA**
- **QA gate.** Nothing is done or reported as working until `qa` checked it in the browser. One qa agent per feature;
  a too-big feature is split at once. The main session's own checks add to qa, never replace it.
- **Slice checks:** its own e2e file(s) + smoke + full unit suite; lint/test/build pass. Every new or changed test is
  proven red by a mutant. Proof = ONE run of a test that asserts the behaviour + its red mutant; repeat runs ("3× green")
  are never evidence.
- **Full e2e run-all ONLY when the user asks.** Never per slice, runbook or release; never proposed or put in a Next step.
- **Look at the game.** Every qa report and main-session check views screenshots: black, blank, magenta or missing areas
  are bugs until proven otherwise.
- **No speed claims without measurement.** Report measured before/after totals only.
- e2e scripts run in the FOREGROUND (`node tests/e2e/<x>.e2e.mjs`, Bash timeout 420000); never poll a log for a word.

**Never break the live dev server** (the user plays on :5173 while agents work; Vite hot-reloads every save)
- Only save edits that compile (`npx tsc --noEmit` after each save).
- Mutants and break-and-restore checks run in a copy: `rsync -a --exclude node_modules --exclude dist
  /Users/Derrick/Projects/idle-rpg/ "$SCRATCH/mut_<slice>/" && ln -s /Users/Derrick/Projects/idle-rpg/node_modules
  "$SCRATCH/mut_<slice>/node_modules"`, then `npx vitest run --root "$SCRATCH/mut_<slice>" <file>`. Unique name per
  slice; grep the mutation right before and after the run.
- Test servers start only via `tests/e2e/vite.frozen.config.mjs`, each with its own `cacheDir` (a shared
  `node_modules/.vite` re-optimize crashes the live game).
- Absolute paths only; `mkdir -p <abs>`; never `cd X && write` (a failed cd writes into the project root).

**Game rules**
- **Every save slice has a `defaultValue`**; when `persistence` bumps the save version, `integrator` adds the slices to
  `SAVE_SCHEMA` in the same round (missing slices once cost the user their progress).
- **Money is not an item.** Coins are a wallet balance (`economy`: `add`, `spend → Result<'insufficientFunds'>`), shown
  in the player panel; shops, loot (`coins` drop), quests and fees use the wallet. Never an ItemDef or inventory slot.
- **One item image everywhere.** Inventory, bank, ground, shop, tooltip all read ONE icon source per item id via the
  shared `ItemSlot`; a test asserts it.
- **Toggles are positive:** "Sound", "Show HUD", "Minimap"; never "Mute"/"Hide"/"Disable".
- **Locked things stay visible:** greyed with exact requirement and current value ("Requires Woodcutting 15 (you: 5)"),
  from `core`'s Requirement evaluator; secrets "???". Skill-tree locked nodes show "Unknown" + "?" + the requirement.

## Stack, hosting, commands

Vite + TypeScript (strict) · Phaser 3 (world) · React 18 (HUD) · Zustand · vite-plugin-pwa · Vitest · ESLint + Prettier.

Hosting: Cloudflare Workers Builds (static assets), repo `GGfied/idle-rpg`, live https://idle-rpg.chunyuan90.workers.dev
(previews `*-idle-rpg.chunyuan90.workers.dev`; `curl` needs a browser `-A` or Cloudflare returns 1042). Push to `main`
builds + deploys (`wrangler.jsonc`: assets ./dist, SPA fallback); other branches upload previews. `NODE_VERSION=20.18.1`,
headers in `public/_headers`. GitHub Actions runs CI (lint/test/build). **A push deploys: never commit or push without
the user's OK.**

`npm run dev` · `npm run lint` (eslint incl. import boundaries + prettier) · `npm run test` · `npm run build`
(tsc + vite build) · `npm run e2e` (smoke). Done = lint + test + build pass and checked in the dev server on desktop and
a phone viewport if it touches UI or input (`npm run dev -- --host` for a real phone).

## Code structure

```
src/core/       engine/ (tick 600 ms, seeded rng, events) · contracts/ · skills/ (action loop, successChance, runRecipe,
                nodeState) · utils/ · persistence/ · items/ · inventory/ · progression/ · equipment/
src/features/   world/ movement/ npc/ monsters/ story/ combat/ facilities/ economy/ achievements/ tutorial/
                skills/{woodcutting,mining,fishing,cooking,smithing,crafting,ranged,magic,prayer}/
src/render/     Phaser drawing, camera, picking · animation/ · vfx/
src/audio/  src/platform/ (input, viewport, PWA)  src/app/ (registry.ts, store.ts, scenes/, ui/ = React HUD)
src/assets/  public/  .github/workflows/  src/test-utils/  tests/e2e/
```

**Module template** (every `features/*` and `features/skills/*`): `index.ts` (public API only; import a module only
through it) · `types.ts` · `data.ts` (content as typed constants; split to `data/` past ~200 lines) · `logic.ts` (pure
functions; split by concern past ~300 lines) · colocated `*.test.ts`. No `helpers.ts`/`misc.ts`/`utils.ts` in a feature.

**Dependencies** (ESLint-enforced; aliases `@core @features @render @audio @platform @app @test-utils`):
app → features, render, audio, platform, core · platform/audio → core (+ Phaser types) · render → core types only,
never game logic · features → core only, never another feature · core → core/utils + core/contracts only. Features talk
via string ids, events (`core/engine/events.ts`) and interfaces (`core/contracts/`); `app/registry.ts` connects them.

**DRY:** search `core/utils`, `core/skills`, `test-utils` first. Rule of two: a second user moves the logic to `core/` in
the same change. Shared machinery: `successChance(level, low, high)`, `rollTable(rng, table)`, `runRecipe`,
`nodeState` depletion/respawn, `defineItems()`/`defineRecipes()`. Data over code: new content is a `data.ts` entry,
never an `if (id === …)` branch. One source of truth per fact (XP curve in `core/progression`, inventory rules in
`core/inventory`, bonuses in `core/equipment`). HUD panels use `app/ui/components/` (Panel, ItemSlot, Tooltip,
ProgressBar, ContextMenu). Tests use `test-utils` builders (`makeState`, `withInventory`, `withLevels`, `runTicks`,
`seededRng`, `contentRefs`). Don't over-abstract: extract on the second real use; files < ~300 lines.

**Architecture:** game logic is pure TS in `core/` + `features/`; only `render/` and `app/scenes/` import Phaser, only
`app/ui/` imports React. One 600 ms tick drives everything; rendering interpolates. Tickable features expose
`tick(state, ctx) → { state, events }`. All randomness via `core/engine/rng.ts`. `combat` owns the loop + melee;
`ranged`/`magic` provide an `AttackStyle`, `prayer` `CombatModifier`s. Item ids are global snake_case via
`defineItems()`; duplicates fail a test. Saves only via `core/persistence`; any persisted change bumps the version +
migration + test against the previous fixture; loaded saves are untrusted (validate, never eval/spread). Plain-text game
text only. Mobile-first: tap = click, long-press = menu, pinch = zoom, no hover-only info, targets ≥ 44 px, input only via
`platform/input`, responsive CSS on shared components. Keep logic deterministic and input as intents (future
multiplayer, server-authoritative; no backend yet). Original names and art only, no Jagex assets. Don't add libraries
or features nobody asked for.

**Naming:** files `camelCase.ts`, components `PascalCase.tsx`; content ids `snake_case`; events past-tense camelCase
(`treeDepleted`); types `PascalCase`, content definitions end in `Def`.

## Agents (`.claude/agents/`; paths under `src/`; each file's description says what it's for)

| Agent | Owns |
|---|---|
| `core` | `core/` engine, contracts, skills, utils; tooling configs (package.json, tsconfig, vite/vitest, eslint) |
| `items` · `inventory` · `xp` · `equipment` · `persistence` | `core/items` · `core/inventory` · `core/progression` · `core/equipment` · `core/persistence` |
| `integrator` | `app/` except `app/ui`, `index.html` (registry, store, runtime, scenes, wiring) |
| `hud` | `app/ui` (shared components, panels, HUD layout) |
| `mobile` | `platform/`, `public/`, mobile layout in `app/ui` |
| `map` · `movement` · `npc` · `monsters` · `story` · `combat` | `features/world` + `assets/maps` · `features/movement` · `features/npc` · `features/monsters` · `features/story` · `features/combat` |
| `facilities` · `economy` · `achievements` · `tutorial` | `features/facilities` · `features/economy` · `features/achievements` · `features/tutorial` |
| `woodcutting` `mining` `fishing` `cooking` `smithing` `crafting` `ranged` `magic` `prayer` | `features/skills/<skill>` |
| `graphics` | `render/` except animation/vfx, `assets/sprites`, `assets/tilesets` |
| `animation` · `vfx` · `sound` | `render/animation` · `render/vfx` + `assets/vfx` · `audio/` + `assets/audio` |
| `qa` | `test-utils/`, `tests/`, all `*.test.ts`; never fixes production code |
| `infra` | `.github/workflows/`, `public/_headers`, hosting config; asks before anything outward-facing or costly |
| `netcode` · `backend` | `net/` · `server/` (future) |
| `balance` · `performance` · `security` | read-only (balance may write `tests/balance`); report with numbers |

Give each agent one clear task naming the interface, ids or event it must produce. Agents list any helper they add to
`core/utils` or `test-utils`. Flow: owner → `integrator` wires → `qa` verifies → main session updates the runbook.
