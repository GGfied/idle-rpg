# facilities memory
- 2026-10-08: `mkdir -p` the module dir BEFORE heredoc writes. A failed `cd` made me write into the repo root, where parallel agent `npc` did the same; files collided and I moved npc's files into my folder. Fixed by restoring them to src/features/npc. Always use absolute paths and verify `pwd`/ls after writing.
- 2026-10-08: Pattern that worked: logic fns take an optional `table` param (default = data) so tests prove "new def needs no code" without touching real data. Mutation check done in a sibling copy dir (facilities_mut), deleted after.
