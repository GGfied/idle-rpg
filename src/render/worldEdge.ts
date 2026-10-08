import type Phaser from 'phaser';

/** Camera clear colour and the colour the world edge fades into (a dark, slightly green fog, never black). */
export const WORLD_BACKDROP = 0x1b2a1c;
/** Half-tile rings (finer rings = no visible banding); the fade is EDGE_STEPS * EDGE_RING tiles wide (18). */
export const EDGE_STEPS = 36;
export const EDGE_RING = 0.5;
/** Backdrop coverage at ring i (0 = touching the map): ((i + 1) / EDGE_STEPS) ^ EDGE_EASE. */
const EDGE_EASE = 0.85;

/** Backdrop coverage (0..1) over ring `i` (0 = touching the map, EDGE_STEPS = beyond the fade). */
export function edgeCoverage(i: number): number {
  return Math.min(1, Math.pow(i / EDGE_STEPS, EDGE_EASE));
}

/**
 * Per-layer alpha of the backdrop layers. Layer j covers everything OUTSIDE the map grown by
 * (j + 1) * EDGE_RING tiles, so ring i (between growth i and i + 1 half tiles) sits under layers 0..i-1 and its
 * composite coverage is 1 - prod(1 - a_j), j < i. Solving for a_j: (1 - a_j) = (1 - cov(j + 1)) / (1 - cov(j)).
 * The last layer is opaque (everything beyond the fade is the backdrop). Each layer is ONE polygon per chunk,
 * so there are no shared edges that antialias into hairlines.
 */
export function edgeLayerAlphas(): number[] {
  const out: number[] = [];
  for (let j = 0; j < EDGE_STEPS; j++) {
    const next = 1 - edgeCoverage(j + 1);
    out.push(j === EDGE_STEPS - 1 ? 1 : 1 - next / (1 - edgeCoverage(j)));
  }
  return out;
}

/** Composite backdrop coverage over ring `i` produced by `edgeLayerAlphas()` (what the player sees). */
export function edgeCompositeCoverage(i: number, alphas = edgeLayerAlphas()): number {
  let keep = 1;
  for (let j = 0; j < i && j < alphas.length; j++) keep *= 1 - alphas[j]!;
  return 1 - keep;
}

export type TileRect = { x0: number; y0: number; x1: number; y1: number };
export type TilePt = readonly [number, number];

/**
 * Layer `j` for one chunk: the chunk's tile rectangle (tile-space edges: tile middle = integer, so a tile spans
 * +-0.5) minus the grown map, as ONE polygon (the chunk lies outside the map, so the remainder is a rectangle or
 * an L). Returns null when nothing of the chunk is outside the grown map. Pure.
 */
export function edgeLayerPoly(
  j: number,
  cols: number,
  rows: number,
  chunk: TileRect,
): TilePt[] | null {
  const grow = (j + 1) * EDGE_RING;
  const i = {
    x0: Math.max(chunk.x0, -0.5 - grow),
    y0: Math.max(chunk.y0, -0.5 - grow),
    x1: Math.min(chunk.x1, cols - 0.5 + grow),
    y1: Math.min(chunk.y1, rows - 0.5 + grow),
  };
  const rect = (x0: number, y0: number, x1: number, y1: number): TilePt[] =>
    x1 > x0 && y1 > y0
      ? [
          [x0, y0],
          [x1, y0],
          [x1, y1],
          [x0, y1],
        ]
      : [];
  const c = chunk;
  if (i.x1 <= i.x0 || i.y1 <= i.y0) return rect(c.x0, c.y0, c.x1, c.y1);
  const fullX = i.x0 === c.x0 && i.x1 === c.x1;
  const fullY = i.y0 === c.y0 && i.y1 === c.y1;
  if (fullX && fullY) return null;
  if (fullX) return i.y0 > c.y0 ? rect(c.x0, c.y0, c.x1, i.y0) : rect(c.x0, i.y1, c.x1, c.y1);
  if (fullY) return i.x0 > c.x0 ? rect(c.x0, c.y0, i.x0, c.y1) : rect(i.x1, c.y0, c.x1, c.y1);
  // corner chunk: the grown map reaches the corner of the chunk that faces the map
  const ax = i.x1 === c.x1 ? c.x1 : c.x0;
  const ay = i.y1 === c.y1 ? c.y1 : c.y0;
  const ox = ax === c.x1 ? c.x0 : c.x1;
  const oy = ay === c.y1 ? c.y0 : c.y1;
  const px = ax === c.x1 ? i.x0 : i.x1;
  const py = ay === c.y1 ? i.y0 : i.y1;
  return [
    [ax, oy],
    [ox, oy],
    [ox, ay],
    [px, ay],
    [px, py],
    [ax, py],
  ];
}

/**
 * Sets the camera clear colour to the backdrop the skirt chunks fade into. The skirt itself is the chunk
 * renderer's outer ring of REAL ground (same textures, tints and water shade as the map, then covered by
 * `edgeLayerAlphas` layers of backdrop), so the edge is a gradual fade and not a pasted stripe. Flat
 * alpha fills only: identical under WebGL and CANVAS.
 */
export function createWorldEdge(
  scene: Phaser.Scene,
  /** Kept for the existing call site; the chunk renderer now draws the skirt (it has terrainAt itself). */
  ..._legacy: [unknown?, number?, number?, ((x: number, y: number) => string | undefined)?]
): void {
  scene.cameras.main.setBackgroundColor(WORLD_BACKDROP);
}
