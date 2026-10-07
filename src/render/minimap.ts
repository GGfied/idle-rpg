import type { Tile } from '@core/contracts';
import { FALLBACK_STYLE } from './palette';

/** Flat per-kind colours (0xRRGGBB) for the minimap: water blue, paths light, walls dark. */
export const MINIMAP_PALETTE: Record<string, number> = {
  grass: 0x3f7a30,
  flowers: 0x4a8a38,
  path: 0xcdb27c,
  sand: 0xe0d095,
  water: 0x2458b0,
  wall: 0x33333a,
  floor: 0x9a6d3a,
};

export interface MinimapSource {
  width: number;
  height: number;
  kindAt(x: number, y: number): string | undefined;
}

export interface MinimapImage {
  width: number;
  height: number;
  pxPerTile: number;
  /** RGBA, row-major. Wrap in ImageData(data, width, height). */
  data: Uint8ClampedArray;
}

export interface MinimapImageOptions {
  pxPerTile?: number;
  palette?: Record<string, number>;
}

/** One flat colour per tile (pxPerTile square). Undefined kind = transparent. Build once per region. */
export function buildMinimapImage(
  source: MinimapSource,
  opts: MinimapImageOptions = {},
): MinimapImage {
  const ppt = Math.max(1, Math.floor(opts.pxPerTile ?? 3));
  const palette = opts.palette ?? MINIMAP_PALETTE;
  const width = source.width * ppt;
  const height = source.height * ppt;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let ty = 0; ty < source.height; ty++) {
    for (let tx = 0; tx < source.width; tx++) {
      const kind = source.kindAt(tx, ty);
      if (kind === undefined) continue;
      const c = palette[kind] ?? FALLBACK_STYLE.base;
      const r = (c >> 16) & 255;
      const g = (c >> 8) & 255;
      const b = c & 255;
      for (let py = 0; py < ppt; py++) {
        let i = ((ty * ppt + py) * width + tx * ppt) * 4;
        for (let px = 0; px < ppt; px++, i += 4) {
          data[i] = r;
          data[i + 1] = g;
          data[i + 2] = b;
          data[i + 3] = 255;
        }
      }
    }
  }
  return { width, height, pxPerTile: ppt, data };
}

export type MinimapMarkerKind = 'player' | 'tree' | 'stump' | 'bank' | 'npc' | 'destination';

export interface MinimapMarkerStyle {
  color: string;
  /** Diameter (dot) or side (square) in canvas px. */
  size: number;
  shape: 'dot' | 'square';
  /** Optional outline colour for contrast. */
  outline?: string;
}

export const MINIMAP_MARKERS: Record<MinimapMarkerKind, MinimapMarkerStyle> = {
  player: { color: '#ffffff', size: 5, shape: 'dot', outline: '#000000' },
  tree: { color: '#1f9d3a', size: 3, shape: 'dot' },
  stump: { color: '#8a5a2b', size: 3, shape: 'dot' },
  bank: { color: '#ffd23f', size: 5, shape: 'square', outline: '#7a5a00' },
  npc: { color: '#ffe135', size: 3, shape: 'dot' },
  destination: { color: '#ff2a2a', size: 5, shape: 'dot', outline: '#ffffff' },
};

export interface MinimapView {
  /** Tile at the view centre; integer = middle of that tile; fractional ok (interpolated player). */
  centre: Tile;
  /** Radius of the circular view in canvas px (canvas is 2*radiusPx square, north up). */
  radiusPx: number;
  /** Canvas px per tile at zoom 1 (match the image's pxPerTile for crisp pixels). */
  pxPerTile: number;
  zoom?: number;
  /** World size in tiles; pxToTile returns null outside it. Omit to skip the bounds check. */
  bounds?: { width: number; height: number };
}

function scaleOf(view: MinimapView): number {
  return view.pxPerTile * (view.zoom ?? 1);
}

/** Canvas px (relative to the canvas top-left) of the centre of a tile. */
export function minimapTileToPx(tile: Tile, view: MinimapView): { x: number; y: number } {
  const s = scaleOf(view);
  return {
    x: view.radiusPx + (tile.x - view.centre.x) * s,
    y: view.radiusPx + (tile.y - view.centre.y) * s,
  };
}

/** Tile under a canvas px, or null outside the circle, outside the world, or on bad input. */
export function minimapPxToTile(px: number, py: number, view: MinimapView): Tile | null {
  if (!Number.isFinite(px) || !Number.isFinite(py)) return null;
  const s = scaleOf(view);
  if (!(s > 0)) return null;
  const dx = px - view.radiusPx;
  const dy = py - view.radiusPx;
  if (dx * dx + dy * dy > view.radiusPx * view.radiusPx) return null;
  const x = Math.round(view.centre.x + dx / s);
  const y = Math.round(view.centre.y + dy / s);
  if (view.bounds && (x < 0 || y < 0 || x >= view.bounds.width || y >= view.bounds.height)) {
    return null;
  }
  return { x, y };
}

/** The slice of CanvasRenderingContext2D that drawMinimap uses (fakeable in tests). */
export interface Minimap2D {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  imageSmoothingEnabled: boolean;
  save(): void;
  restore(): void;
  beginPath(): void;
  arc(x: number, y: number, r: number, start: number, end: number): void;
  clip(): void;
  fill(): void;
  stroke(): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  drawImage(
    image: CanvasImageSource,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void;
}

export interface MinimapMarker {
  kind: MinimapMarkerKind;
  tile: Tile;
}

export const MINIMAP_BACKGROUND = '#0b0b10';

/**
 * Draw the circular minimap: clip to the circle, background, terrain crop (scaled, no smoothing),
 * then markers in array order (put the player last so it is on top). `canvasImage` is the drawable
 * form of `image` (e.g. an offscreen canvas holding the ImageData).
 */
export function drawMinimap(
  ctx: Minimap2D,
  canvasImage: CanvasImageSource,
  image: MinimapImage,
  view: MinimapView,
  markers: readonly MinimapMarker[],
): void {
  const r = view.radiusPx;
  const s = scaleOf(view);
  ctx.save();
  ctx.beginPath();
  ctx.arc(r, r, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = MINIMAP_BACKGROUND;
  ctx.fillRect(0, 0, r * 2, r * 2);
  ctx.imageSmoothingEnabled = false;

  // Visible rectangle in image px, clamped to the image (drawImage rejects out-of-range sources).
  const ppt = image.pxPerTile;
  const half = r / s; // tiles from centre to edge
  const left = (view.centre.x + 0.5 - half) * ppt;
  const top = (view.centre.y + 0.5 - half) * ppt;
  const span = half * 2 * ppt;
  const sx = Math.max(0, left);
  const sy = Math.max(0, top);
  const sw = Math.min(image.width, left + span) - sx;
  const sh = Math.min(image.height, top + span) - sy;
  if (sw > 0 && sh > 0) {
    const k = s / ppt; // canvas px per image px
    ctx.drawImage(canvasImage, sx, sy, sw, sh, (sx - left) * k, (sy - top) * k, sw * k, sh * k);
  }

  for (const m of markers) {
    const style = MINIMAP_MARKERS[m.kind];
    const p = minimapTileToPx(m.tile, view);
    const dx = p.x - r;
    const dy = p.y - r;
    if (dx * dx + dy * dy > r * r) continue;
    ctx.fillStyle = style.color;
    if (style.shape === 'dot') {
      ctx.beginPath();
      ctx.arc(p.x, p.y, style.size / 2, 0, Math.PI * 2);
      ctx.fill();
      if (style.outline) {
        ctx.strokeStyle = style.outline;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    } else {
      const h = style.size / 2;
      ctx.fillRect(p.x - h, p.y - h, style.size, style.size);
      if (style.outline) {
        ctx.strokeStyle = style.outline;
        ctx.lineWidth = 1;
        ctx.strokeRect(p.x - h, p.y - h, style.size, style.size);
      }
    }
  }
  ctx.restore();
}
