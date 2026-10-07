# movement memory
- 2026-10-08: big world: search keyed by numeric tile index (y*width+x) in one Map, no world arrays; capped search => `destination` on state, tick re-paths at waypoint; closest-by-h waypoint stalls at walls, so a stalled leg retries once with 4x cap (STALL_CAP_FACTOR). Test "cap hit" with a wall spanning the map, not open ground (open ground never hits the cap). Lint forbids `_unused` destructuring: use `{...s}; delete`.
- 2026-10-08: A* single `search()` returns goal path + closest-explored path; findPath/Nearest/Adjacent share it. Hand-computed test expectations went wrong twice (diagonal steps count as 1) - run and sanity-check before asserting.
- 2026-10-08: tick emits one entityMoved per tick (from->final, even when running 2); added extra `movementBlocked` event beyond the two in the brief.
- 2026-10-08: `gridFromAscii` lives in test-utils ('#' blocked); memory dir had no MEMORY.md at start.
- 2026-10-08: serialize/deserialize in logic.ts: wrong shape -> err, bad position -> fallback (per main session); use Object.hasOwn reads.
- 2026-10-08: run energy (hundredths, 0..10000) added to MovementState; constants in data.ts (drain 67/tile, regen 45/tick); old saves w/o runEnergy -> 10000. Adding a per-tick event breaks existing exact-events tests (running from full energy now emits runEnergyChanged) - update them, don't loosen.
