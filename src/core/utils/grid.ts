import type { Point } from '@core/contracts';

export const pointKey = (p: Point): string => `${p.x},${p.y}`;
export const pointsEqual = (a: Point, b: Point): boolean => a.x === b.x && a.y === b.y;
export const manhattan = (a: Point, b: Point): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
export const chebyshev = (a: Point, b: Point): number =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

const CARDINAL: readonly Point[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];
const DIAGONAL: readonly Point[] = [
  { x: 1, y: -1 },
  { x: 1, y: 1 },
  { x: -1, y: 1 },
  { x: -1, y: -1 },
];

/** Neighbouring points (N, E, S, W, then diagonals if requested). Bounds are not checked. */
export function neighbors(p: Point, diagonal = false): Point[] {
  return (diagonal ? [...CARDINAL, ...DIAGONAL] : CARDINAL).map((d) => ({
    x: p.x + d.x,
    y: p.y + d.y,
  }));
}

/** True when b is one step from a (and not the same tile). Cardinal only unless diagonal is set. */
export function isAdjacent(a: Point, b: Point, diagonal = false): boolean {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  return diagonal ? Math.max(dx, dy) === 1 : dx + dy === 1;
}

export const inBounds = (size: { width: number; height: number }, p: Point): boolean =>
  p.x >= 0 && p.y >= 0 && p.x < size.width && p.y < size.height;
