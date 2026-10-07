import type { CollisionGrid, Tile, TickContext, TickResult } from '@core/contracts';
import type { Result } from '@core/utils';
import { chebyshev, createMinHeap, err, isAdjacent, ok, pointKey, pointsEqual } from '@core/utils';
import {
  MAX_RUN_ENERGY,
  MAX_SEARCH_NODES,
  MIN_RUN_ENERGY,
  RUN_DRAIN_PER_TILE,
  RUN_REGEN_PER_TICK,
  RUN_SPEED,
  WALK_SPEED,
} from './data';
import type { MovementEvent, MovementState, PathOptions } from './types';

const DIRS: readonly Tile[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 1, y: -1 },
  { x: 1, y: 1 },
  { x: -1, y: 1 },
  { x: -1, y: -1 },
];

const walkable = (grid: CollisionGrid, t: Tile): boolean => grid.isWalkable(t.x, t.y);

/** True if one step from a to b (8-direction) is legal: b walkable, no diagonal corner cutting. */
export function canStep(grid: CollisionGrid, a: Tile, b: Tile): boolean {
  if (chebyshev(a, b) !== 1 || !walkable(grid, b)) return false;
  if (a.x !== b.x && a.y !== b.y) {
    return grid.isWalkable(b.x, a.y) && grid.isWalkable(a.x, b.y);
  }
  return true;
}

const octile = (a: Tile, b: Tile): number => {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
};

interface Node {
  tile: Tile;
  g: number;
  f: number;
  parent: Node | null;
}

const toPath = (node: Node): Tile[] => {
  const out: Tile[] = [];
  for (let n: Node | null = node; n?.parent; n = n.parent) out.unshift(n.tile);
  return out;
};

/**
 * The one A* implementation. Returns the path to the first goal reached, plus the path to the
 * explored node nearest `focus` (fallback when no goal is reachable or the cap is hit).
 */
function search(
  grid: CollisionGrid,
  from: Tile,
  isGoal: (t: Tile) => boolean,
  focus: Tile,
  maxNodes: number,
): { path: Tile[] | null; closest: Tile[] } {
  const start: Node = { tile: from, g: 0, f: octile(from, focus), parent: null };
  const open = createMinHeap<Node>((a, b) => a.f - b.f || b.g - a.g);
  const best = new Map<string, number>([[pointKey(from), 0]]);
  const closed = new Set<string>();
  open.push(start);
  let nearest = start;
  let nearestD = octile(from, focus);
  let expanded = 0;

  while (open.size > 0 && expanded < maxNodes) {
    const node = open.pop() as Node;
    const key = pointKey(node.tile);
    if (closed.has(key)) continue;
    closed.add(key);
    expanded++;
    if (isGoal(node.tile)) return { path: toPath(node), closest: [] };
    const d = octile(node.tile, focus);
    if (d < nearestD || (d === nearestD && node.g < nearest.g)) {
      nearest = node;
      nearestD = d;
    }
    for (const dir of DIRS) {
      const next = { x: node.tile.x + dir.x, y: node.tile.y + dir.y };
      if (!canStep(grid, node.tile, next)) continue;
      const nk = pointKey(next);
      const g = node.g + (dir.x !== 0 && dir.y !== 0 ? Math.SQRT2 : 1);
      if (closed.has(nk) || g >= (best.get(nk) ?? Infinity)) continue;
      best.set(nk, g);
      open.push({ tile: next, g, f: g + octile(next, focus), parent: node });
    }
  }
  return { path: null, closest: toPath(nearest) };
}

/** Shortest path from `from` to `to` (excludes from, includes to), or null if none / cap hit. */
export function findPath(
  grid: CollisionGrid,
  from: Tile,
  to: Tile,
  opts: PathOptions = {},
): Tile[] | null {
  if (!walkable(grid, to)) return null;
  return search(grid, from, (t) => pointsEqual(t, to), to, opts.maxNodes ?? MAX_SEARCH_NODES).path;
}

/** Like findPath, but if `to` is blocked/unreachable, walk to the reachable tile closest to it. */
export function findPathToNearest(
  grid: CollisionGrid,
  from: Tile,
  to: Tile,
  opts: PathOptions = {},
): Tile[] {
  const r = search(grid, from, (t) => pointsEqual(t, to), to, opts.maxNodes ?? MAX_SEARCH_NODES);
  return r.path ?? r.closest;
}

/** True when `position` is 4-adjacent to `target`. */
export const isAdjacentTo = (position: Tile, target: Tile): boolean => isAdjacent(position, target);

/**
 * Path to the nearest walkable tile 4-adjacent to a (typically blocked) target.
 * [] if already adjacent; null if no such tile is reachable.
 */
export function findPathToAdjacent(
  grid: CollisionGrid,
  from: Tile,
  target: Tile,
  opts: PathOptions = {},
): Tile[] | null {
  if (isAdjacentTo(from, target)) return [];
  const goal = (t: Tile): boolean => isAdjacentTo(t, target);
  return search(grid, from, goal, target, opts.maxNodes ?? MAX_SEARCH_NODES).path;
}

export const createMovementState = (spawn: Tile): MovementState => ({
  position: { ...spawn },
  path: [],
  running: false,
  runEnergy: MAX_RUN_ENERGY,
});

export const setPath = (state: MovementState, path: Tile[]): MovementState => ({
  ...state,
  path: path.map((t) => ({ ...t })),
});

export const clearPath = (state: MovementState): MovementState => setPath(state, []);

/** Flip run. Turning on is refused (state unchanged) below MIN_RUN_ENERGY. */
export const toggleRun = (state: MovementState): MovementState =>
  !state.running && state.runEnergy < MIN_RUN_ENERGY
    ? state
    : { ...state, running: !state.running };

/** Click-to-move: path to `target`, or to the closest reachable tile if it can't be reached. */
export const setDestination = (
  state: MovementState,
  grid: CollisionGrid,
  target: Tile,
): MovementState => setPath(state, findPathToNearest(grid, state.position, target));

/** Regen while not running-and-moving; drain per tile run; auto-disable run at 0. */
function applyEnergy(
  state: MovementState,
  tilesMoved: number,
  events: MovementEvent[],
): Pick<MovementState, 'running' | 'runEnergy'> {
  const before = state.runEnergy;
  let energy = before;
  let running = state.running;
  if (running && tilesMoved > 0) {
    energy = Math.max(0, energy - RUN_DRAIN_PER_TILE * tilesMoved);
    if (energy === 0) {
      running = false;
      events.push({ type: 'runDisabled' });
    }
  } else {
    energy = Math.min(MAX_RUN_ENERGY, energy + RUN_REGEN_PER_TICK);
  }
  if (Math.floor(energy / 100) !== Math.floor(before / 100)) {
    events.push({ type: 'runEnergyChanged', energy });
  }
  return { running, runEnergy: energy };
}

/** Advance 1 tile (walking) or 2 (running). One entityMoved event per tick that moved. */
export function tickMovement(
  state: MovementState,
  _ctx: TickContext,
  grid: CollisionGrid,
): TickResult<MovementState, MovementEvent> {
  if (state.path.length === 0) {
    if (state.runEnergy >= MAX_RUN_ENERGY) return { state, events: [] };
    const events: MovementEvent[] = [];
    return { state: { ...state, ...applyEnergy(state, 0, events) }, events };
  }
  const events: MovementEvent[] = [];
  const speed = state.running ? RUN_SPEED : WALK_SPEED;
  let position = state.position;
  let i = 0;
  let blocked = false;
  let tilesMoved = 0;
  for (; i < speed && i < state.path.length; i++) {
    const next = state.path[i] as Tile;
    if (!canStep(grid, position, next)) {
      blocked = true;
      break;
    }
    position = next;
    tilesMoved++;
  }
  if (!pointsEqual(position, state.position)) {
    events.push({ type: 'entityMoved', from: state.position, to: position });
  }
  const path = blocked ? [] : state.path.slice(i);
  if (blocked) events.push({ type: 'movementBlocked', position });
  else if (path.length === 0) events.push({ type: 'destinationReached', position });
  const energy = applyEnergy(state, tilesMoved, events);
  return { state: { ...state, position, path, ...energy }, events };
}

/** Save slice: position, run toggle and run energy. The path is dropped. */
export const serializeMovement = (state: MovementState): unknown => ({
  position: { x: state.position.x, y: state.position.y },
  running: state.running,
  runEnergy: state.runEnergy,
});

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const own = (o: Record<string, unknown>, k: string): unknown =>
  Object.hasOwn(o, k) ? o[k] : undefined;

/**
 * Load the save slice (untrusted). Wrong shape or types (non-object, missing/non-number
 * coordinates, non-boolean `running`, present-but-non-integer `runEnergy`) -> err. Missing `runEnergy` -> full. A well-formed position that is not an integer,
 * is out of bounds or is not walkable on `grid` silently becomes `fallback` (nothing is logged).
 * The result always has an empty path; input is never spread.
 */
export function deserializeMovement(
  data: unknown,
  grid: CollisionGrid,
  fallback: Tile,
): Result<MovementState, string> {
  if (!isRecord(data)) return err('movement: save data must be an object');
  const pos = own(data, 'position');
  const running = own(data, 'running');
  if (!isRecord(pos)) return err('movement: position must be an object');
  const x = own(pos, 'x');
  const y = own(pos, 'y');
  if (typeof x !== 'number' || typeof y !== 'number') {
    return err('movement: position x/y must be numbers');
  }
  if (typeof running !== 'boolean') return err('movement: running must be a boolean');
  const valid = Number.isInteger(x) && Number.isInteger(y) && grid.isWalkable(x, y);
  const state = createMovementState(valid ? { x, y } : fallback);
  // Older saves have no runEnergy: default to full. A present but invalid value is an error.
  const energy = own(data, 'runEnergy');
  if (energy === undefined) return ok({ ...state, running });
  if (typeof energy !== 'number' || !Number.isInteger(energy)) {
    return err('movement: runEnergy must be an integer');
  }
  return ok({ ...state, running, runEnergy: Math.min(MAX_RUN_ENERGY, Math.max(0, energy)) });
}
