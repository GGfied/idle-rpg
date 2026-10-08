# Cooking agent memory
- 2026-10-08: BSD sed with multiple s/// and quotes failed silently-ish (names unchanged); use perl -pi -e for scripted edits, then grep to confirm.
- 2026-10-08: food names must start Raw/Cooked/Burnt (user); data.test.ts enforces via registry. Raw fish defs live in fishing, so only raw items cooking defines are checked.
- 2026-10-08: ALWAYS `mkdir -p <abs dir>` before writing; a heredoc after a failed `cd` dropped 4 files in repo root. Use absolute paths only.
- 2026-10-08: prettier reformats files after save; do text-replace edits against the formatted file (my string-replace for items silently missed). Re-grep after scripted edits.
- 2026-10-08: tsc `noUnusedParameters` is on; drop unused params instead of keeping them for symmetry.
- 2026-10-08: scope is plain cooking only (1 raw item -> cooked/burnt, fire); no multi-ingredient recipes (pies etc. belong to crafting later).
- 2026-10-08: first recipe user; runRecipe not yet in core. Extract to core when smithing arrives (rule of two).
- 2026-10-08: mutant check in scratch copy (rsync + symlinked node_modules) works in seconds.
