# npc agent memory (newest first)

- 2026-10-08: In test files import test builders as `@test-utils/index` (alias is `@test-utils/*`; bare `@test-utils` fails tsc/vitest).
- 2026-10-08: Always `mkdir -p` the module dir and chain with `&&`/`|| exit 1` before heredocs; a failed `cd` made a heredoc land in the repo root (cleaned up).
- 2026-10-08: macOS BSD sed has no `0,/re/` or multiline; use `perl -0pi -e` for "prove it fails in a copy" mutations (copy to src/features/npc_copy_tmp, delete after).
- 2026-10-08: Banker slice: NpcDef/behaviour as data; behaviour handlers keyed by `kind` in logic.ts (extension point); no save slice (instances rebuilt from spawns).
- 2026-10-08: Parallel agents share the repo root: NEVER write to root and mv. `mkdir -p` the absolute module path first and write files there by absolute path (a facilities mv once swept my files).
