/** Default cap on A* node expansions. */
export const MAX_SEARCH_NODES = 4000;
/** Tiles moved per tick. */
export const WALK_SPEED = 1;
export const RUN_SPEED = 2;

/** Run energy is stored in hundredths of a percent (10000 = 100.00%). */
export const MAX_RUN_ENERGY = 10000;
/** Run can only be switched on at >= 1%. */
export const MIN_RUN_ENERGY = 100;
/** Drain per tile moved while running: ~0.67% (OSRS-ish, weight-free). */
export const RUN_DRAIN_PER_TILE = 67;
/** Regen per tick when not running-and-moving: ~0.45% (OSRS base, no Agility yet). */
export const RUN_REGEN_PER_TICK = 45;
/** When a capped walk stalls (no progress), re-path once with the cap multiplied by this. */
export const STALL_CAP_FACTOR = 4;
