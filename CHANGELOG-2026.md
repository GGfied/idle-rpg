# Changelog 2026

## 2026-10-08

### `latest` · 2026-10-08 SGT

**First playable MVP: woodcutting, bank + NPCs, settings, audio**

Version 0.1.0 - the first public build. Replaces the old idle version (kept in git history at `b1f8068`) with an
OSRS-inspired tile RPG playable on desktop and phone.

#### Added

- **`src/core/engine/`**, **`src/core/contracts/`**, **`src/core/utils/`**, **`src/core/skills/`** - 600 ms game tick, seeded RNG, typed event bus, cross-feature contracts and shared skill machinery (action loop, success chance, depleting/respawning nodes), so every feature runs on one deterministic loop.
- **`src/core/items/`**, **`src/core/inventory/`**, **`src/core/equipment/`**, **`src/core/progression/`** - item registry with id checks, 28-slot inventory with OSRS stacking and a bank, tools/gear with `bestTool`, and the XP curve, skill registry and combat level.
- **`src/core/persistence/`** - versioned saves with migrations and fixtures, untrusted-save validation, a cross-tab storage lease, debounced autosave, a corrupt-save backup, and a separate preferences store, so progress survives reloads and old saves keep loading.
- **`src/features/world/`**, **`src/features/movement/`** - the Willowbrook map with collision, named areas and spawns, and A* click/tap-to-walk with run.
- **`src/features/skills/woodcutting/`**, **`src/features/skills/prayer/`** - woodcutting at OSRS speed (a tree falls after one log, then regrows), and the prayer skill data.
- **`src/features/facilities/`**, **`src/features/npc/`**, **`src/features/story/`**, **`src/features/combat/`** - the bank building with booths, two Banker NPCs with dialogue, and the combat module.
- **`src/render/`**, **`src/render/animation/`**, **`src/render/vfx/`**, **`src/render/iso/`**, **`src/assets/sprites/`** - Phaser world drawing, camera and tick-interpolated smooth movement, entity animations, one-off effects (XP drops, blocked-action feedback), item icons, the minimap renderer, and an isometric projection module (not yet switched on).
- **`src/audio/`** - procedural sound effects, per-area music and ambience with crossfades, and per-channel volume with one audio context per page, so Off really means silent.
- **`src/platform/`** - one input path for mouse and touch (tap, long-press menu, drag-pan, pinch), viewport scaling and page-lifecycle handling.
- **`src/app/`**, **`src/app/game/`**, **`src/app/scenes/`**, **`src/app/ui/`** - registry, Zustand store, runtime and tick wiring, and the React HUD: inventory, bank, skills grid with icons and colours, chat, dialogue, minimap, HP/Prayer/Run orbs and a Settings panel (sound switch, Off and 1-5 volume steps, toggles for screen, notifications and visuals).
- **`src/app/ui/panels/SettingsPanel.tsx`**, **`src/app/ui/panels/SettingsFooter.tsx`**, **`src/app/ui/panels/SettingsFooter.test.tsx`**, **`src/app/ui/styles.css`**, **`src/env.d.ts`**, **`src/env.test.ts`**, **`vite.config.ts`** - the app version is injected at build time from `package.json` (a test pins it to the `package.json` version) and shown at the bottom of Settings with a "What's new" link to this changelog.
- **`src/test-utils/`**, **`tests/e2e/`** - shared test builders, and a dependency-free headless-Chrome harness with smoke, settings, bank and areas suites (`npm run e2e`).
- **`wrangler.jsonc`**, **`public/_headers`**, **`.github/workflows/ci.yml`**, **`.nvmrc`** - Cloudflare Workers Builds static hosting with SPA fallback, strict security headers and CSP, and CI running lint, test and build on Node 20.
- **`eslint.config.js`**, **`.prettierrc.json`**, **`.prettierignore`** - ESLint with import-boundary rules and Prettier, so features only depend on `core/`.
- **`CHANGELOG.md`**, **`CHANGELOG-2026.md`** - this changelog, with a year index.
- **`CLAUDE.md`**, **`docs/runbooks/`**, **`.claude/agents/`**, **`.claude/agent-memory/`**, **`.claude/hooks/`**, **`.claude/settings.json`** - project rules, resumable runbooks, the per-area agent definitions with their learning memory, and hooks that keep the main session out of code and stray files out of the repo root.

#### Changed

- **`package.json`**, **`package-lock.json`** - version `0.1.0`; Phaser 3, React 18, Zustand, Vitest, ESLint/Prettier and the `lint`, `test`, `build` and `e2e` scripts.
- **`index.html`**, **`tsconfig.json`**, **`vite.config.ts`**, **`.gitignore`** - new entry point, strict TypeScript with `@core`/`@features`/`@render`/`@audio`/`@platform`/`@app`/`@test-utils` path aliases, and Vitest config.

#### Removed

- **`src/App.tsx`**, **`src/ErrorBoundary.tsx`**, **`src/IdleRpg.tsx`**, **`src/main.tsx`**, **`src/global.css`**, **`src/components/`**, **`src/constants/`**, **`src/hooks/`**, **`src/types/`**, **`src/utils/`** - the old idle game, replaced by the new architecture above (still in history at `b1f8068`).
- **`public/favicon.png`**, **`public/favicon.svg`**, **`tsconfig.node.json`** - old idle-version assets and config with no use in the new build.
- **`README.md`** - described the old idle game.

---
