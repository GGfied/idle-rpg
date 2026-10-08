/** Fishing spot placement helpers (pure; no registry import so the registry can use them). */
import type { Tile } from '@core/contracts';
import type { FishingSpotSpawn } from '@features/world';
import type { FishingState } from '@features/skills/fishing';

/** Where a spot is now: its candidate tile at the state's index (index 0 until the spot is tracked). */
export function spotTile(spawn: FishingSpotSpawn, fishing: FishingState): Tile {
  const i = fishing.spots[spawn.spotId]?.tile ?? 0;
  return spawn.tiles[i] ?? spawn.tiles[0]!;
}
