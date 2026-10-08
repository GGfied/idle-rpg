/** Integer tile coordinates. x grows right, y grows down. */
export interface Point {
  x: number;
  y: number;
}

/** A tile position on the world grid (same shape as Point; the name documents intent). */
export type Tile = Point;

/** Seeded random source. Implemented by core/engine/rng.ts; all game randomness goes through it. */
export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [min, max], both inclusive. */
  int(min: number, max: number): number;
  /** True with probability p (clamped to [0, 1]). */
  chance(p: number): boolean;
  /** Serializable state; restore with core/engine `createRng(seed, state)`. */
  getState(): number;
}

/** What the ticker hands every system on every 600 ms game tick. */
export interface TickContext {
  /** Monotonic tick counter (the tick being processed). */
  tick: number;
  rng: Rng;
}

/** Base shape of every game event: a camelCase past-tense `type` plus a payload. */
export interface GameEvent {
  type: string;
}

export interface TickResult<S, E extends GameEvent = GameEvent> {
  state: S;
  events: E[];
}

/** The shared tick signature: every tickable feature exposes `tick(state, ctx) -> { state, events }`. */
export type System<S, E extends GameEvent = GameEvent> = (
  state: S,
  ctx: TickContext,
) => TickResult<S, E>;

/** Read-only walkability of the world; owned by `map`, consumed by `movement`. */
export interface CollisionGrid {
  readonly width: number;
  readonly height: number;
  /** False for blocked tiles and for anything out of bounds. */
  isWalkable(x: number, y: number): boolean;
}

/** A prerequisite, checked by whoever owns the data it refers to (ids are plain strings). */
export type Requirement = (
  | { type: 'skillLevel'; skill: string; level: number }
  | { type: 'item'; itemId: string; count?: number }
  | { type: 'quest'; questId: string }
  | { type: 'flag'; flag: string }
) & {
  /** Secret: while unmet, the text is "???" (or `hint`) and the current value is withheld. */
  hidden?: boolean;
  hint?: string;
};
