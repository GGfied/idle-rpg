# map memory
- 2026-10-08: MVP world = ASCII rows in data.ts (legend G . ~ s # f); trees block via createCollisionGrid. Generate rows with a scratch script, then embed.
- 2026-10-08: Run `prettier --write` before sed-based edits on files; prettier reflows imports so sed patterns miss.
- 2026-10-08: Test helper imports must come from './data' (not index) when needing internals like MAP_ROWS; index exports only the public API.
- 2026-10-08: Object spawns (ObjectSpawn/OBJECT_SPAWNS) share createCollisionGrid blocking with trees; bank chest at (20,14), 'bank' location (20,15) on the path. Place objects on grass beside the path, never on it.
- 2026-10-08: Areas = world-coord inclusive rectangles (AREA_ZONES), first match wins, DEFAULT_AREA fallback; chunk-safe, append-only. Repo-wide tsc errors may be other agents' WIP: grep tsc output for features/world.
- 2026-10-08: Bank building = ASCII walls + '=' floor (TerrainKind 'floor'); staff tiles enclosed by '#' dividers, not by distance. Rewrite rows with a node script on MAP_ROWS (rows overwrite flowers fine). Flood-fill tests must skip blocked object tiles inside the interior. NPC_SPAWNS lives in data.ts beside OBJECT_SPAWNS; bank_chest kind kept but unplaced.
