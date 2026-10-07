# movement memory
- 2026-10-08: A* single `search()` returns goal path + closest-explored path; findPath/Nearest/Adjacent share it. Hand-computed test expectations went wrong twice (diagonal steps count as 1) - run and sanity-check before asserting.
- 2026-10-08: tick emits one entityMoved per tick (from->final, even when running 2); added extra `movementBlocked` event beyond the two in the brief.
- 2026-10-08: `gridFromAscii` lives in test-utils ('#' blocked); memory dir had no MEMORY.md at start.
- 2026-10-08: serialize/deserialize in logic.ts: wrong shape -> err, bad position -> fallback (per main session); use Object.hasOwn reads.
- 2026-10-08: run energy (hundredths, 0..10000) added to MovementState; constants in data.ts (drain 67/tile, regen 45/tick); old saves w/o runEnergy -> 10000. Adding a per-tick event breaks existing exact-events tests (running from full energy now emits runEnergyChanged) - update them, don't loosen.
