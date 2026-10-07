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
  bridge: 0x7d5329,
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
  /** Global tile at the image's top-left (windowed images); default 0,0. */
  origin?: { x: number; y: number };
}

/** bit 1 = right neighbour is another region, bit 2 = bottom neighbour is. Row-major y*width+x. */
export interface MinimapEdges {
  width: number;
  height: number;
  edges: Uint8Array;
}

export interface MinimapImageOptions {
  pxPerTile?: number;
  palette?: Record<string, number>;
  /** Region edge bits per tile (e.g. world `regionEdges()`), in the same tile coords as the source (global for windows). */
  edges?: MinimapEdges;
  /** Global tile of image-local (0,0) when `edges` is global; set by buildMinimapWindow. */
  edgeOffset?: { x: number; y: number };
}

/** Subtle light line colour/alpha for region boundaries (baked into the image, 1 image px wide). */
export const MINIMAP_BOUNDARY = { r: 255, g: 255, b: 255, alpha: 0.3 };

function blendPx(data: Uint8ClampedArray, i: number): void {
  const a = MINIMAP_BOUNDARY.alpha;
  data[i] = data[i]! * (1 - a) + MINIMAP_BOUNDARY.r * a;
  data[i + 1] = data[i + 1]! * (1 - a) + MINIMAP_BOUNDARY.g * a;
  data[i + 2] = data[i + 2]! * (1 - a) + MINIMAP_BOUNDARY.b * a;
}

/** Blend a line on the right/bottom edge of every tile flagged in `e` (tile (x,y) -> e at x+dx,y+dy). */
function bakeBoundaries(
  data: Uint8ClampedArray,
  source: MinimapSource,
  ppt: number,
  e: MinimapEdges,
  dx: number,
  dy: number,
): void {
  const width = source.width * ppt;
  for (let ty = 0; ty < source.height; ty++) {
    const gy = ty + dy;
    if (gy < 0 || gy >= e.height) continue;
    for (let tx = 0; tx < source.width; tx++) {
      const gx = tx + dx;
      if (gx < 0 || gx >= e.width) continue;
      const bits = e.edges[gy * e.width + gx]!;
      if (bits === 0 || source.kindAt(tx, ty) === undefined) continue;
      if (bits & 1)
        for (let py = 0; py < ppt; py++)
          blendPx(data, ((ty * ppt + py) * width + tx * ppt + ppt - 1) * 4);
      if (bits & 2)
        for (let px = 0; px < ppt; px++)
          blendPx(data, ((ty * ppt + ppt - 1) * width + tx * ppt + px) * 4);
    }
  }
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
  if (opts.edges)
    bakeBoundaries(data, source, ppt, opts.edges, opts.edgeOffset?.x ?? 0, opts.edgeOffset?.y ?? 0);
  return { width, height, pxPerTile: ppt, data };
}

/**
 * A square window of the world, (2*halfTiles+1) tiles a side, centred on `centre` (global tiles,
 * integer part). Tiles outside the world (kindAt undefined) stay transparent. Rebuild when
 * `minimapWindowCovers` says the view is about to leave it.
 */
export function buildMinimapWindow(
  kindAt: (x: number, y: number) => string | undefined,
  centre: Tile,
  halfTiles: number,
  opts: MinimapImageOptions = {},
): MinimapImage {
  const ox = Math.round(centre.x) - halfTiles;
  const oy = Math.round(centre.y) - halfTiles;
  const n = halfTiles * 2 + 1;
  const img = buildMinimapImage(
    { width: n, height: n, kindAt: (x, y) => kindAt(ox + x, oy + y) },
    { ...opts, edgeOffset: { x: ox, y: oy } },
  );
  img.origin = { x: ox, y: oy };
  return img;
}

/** True while a view of `viewHalfTiles` around `centre` is still fully inside the window image. */
export function minimapWindowCovers(
  image: MinimapImage,
  centre: Tile,
  viewHalfTiles: number,
): boolean {
  const o = image.origin ?? { x: 0, y: 0 };
  const w = image.width / image.pxPerTile;
  const h = image.height / image.pxPerTile;
  return (
    centre.x - viewHalfTiles >= o.x - 0.5 &&
    centre.y - viewHalfTiles >= o.y - 0.5 &&
    centre.x + viewHalfTiles <= o.x + w - 0.5 &&
    centre.y + viewHalfTiles <= o.y + h - 0.5
  );
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
  /** Canvas px per CSS px (devicePixelRatio, capped). Scales label text/icons; default 1. */
  pixelRatio?: number;
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
  lineJoin: CanvasLineJoin;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  imageSmoothingEnabled: boolean;
  save(): void;
  restore(): void;
  beginPath(): void;
  arc(x: number, y: number, r: number, start: number, end: number): void;
  clip(): void;
  fill(): void;
  stroke(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  fillText(text: string, x: number, y: number): void;
  strokeText(text: string, x: number, y: number): void;
  measureText(text: string): { width: number };
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

/** Structural label (matches WORLD_DEF.labels): global tile coords, plain text only. */
export interface MinimapLabel {
  text: string;
  x: number;
  y: number;
  kind: 'region' | 'facility';
  icon?: 'bank';
}

/** CSS px sizes (multiplied by view.pixelRatio to canvas px); 10 CSS px keeps text legible on a phone. */
export const MINIMAP_LABEL_FONT_PX = 10;
export const MINIMAP_FACILITY_ICON_PX = 10;
const LABEL_PAD = 1;
const TEXT_GAP = 2;

function dprOf(view: MinimapView): number {
  const d = view.pixelRatio ?? 1;
  return d > 0 && Number.isFinite(d) ? d : 1;
}

/** Canvas-px font size for a pixel ratio (rounded so the cache key is stable). */
export function minimapLabelFontPx(pixelRatio: number): number {
  return Math.round(MINIMAP_LABEL_FONT_PX * pixelRatio);
}

function fontOf(fontPx: number): string {
  return `bold ${fontPx}px sans-serif`;
}

/** Text widths by text; measured once, not per frame. Cleared if it grows past a sane bound. */
const widthCache = new Map<string, number>();
const WIDTH_CACHE_MAX = 512;

function textWidth(ctx: Minimap2D, text: string, fontPx: number): number {
  const key = `${fontPx}|${text}`;
  let w = widthCache.get(key);
  if (w === undefined) {
    if (widthCache.size >= WIDTH_CACHE_MAX) widthCache.clear();
    ctx.font = fontOf(fontPx);
    w = ctx.measureText(text).width;
    widthCache.set(key, w);
  }
  return w;
}

/** Test hook: forget cached widths. */
export function clearMinimapLabelCache(): void {
  widthCache.clear();
}

export interface PlacedLabel {
  label: MinimapLabel;
  /** Canvas px of the label anchor (tile centre). */
  x: number;
  y: number;
  /** Bounding box in canvas px (includes icon and, if shown, its name). */
  left: number;
  top: number;
  w: number;
  h: number;
  /** Facility name drawn beside the icon (false = icon only). */
  showName: boolean;
  /** Where the facility name sits relative to its icon. */
  side: 'right' | 'left' | 'below';
}

function boxInCircle(l: number, t: number, w: number, h: number, r: number): boolean {
  for (const cx of [l, l + w]) {
    for (const cy of [t, t + h]) {
      const dx = cx - r;
      const dy = cy - r;
      if (dx * dx + dy * dy > r * r) return false;
    }
  }
  return true;
}

function overlaps(placed: readonly PlacedLabel[], l: number, t: number, w: number, h: number) {
  for (const p of placed) {
    if (l < p.left + p.w && l + w > p.left && t < p.top + p.h && t + h > p.top) return true;
  }
  return false;
}

/**
 * Decide which labels get drawn: anchor to px via the view, keep only boxes fully inside the circle,
 * skip any box overlapping an already placed one. Facilities are placed first (small, important),
 * then regions; a facility whose name does not fit falls back to icon only.
 */
export function layoutMinimapLabels(
  ctx: Minimap2D,
  labels: readonly MinimapLabel[],
  view: MinimapView,
): PlacedLabel[] {
  const out: PlacedLabel[] = [];
  const r = view.radiusPx;
  const dpr = dprOf(view);
  const fontPx = minimapLabelFontPx(dpr);
  const pad = LABEL_PAD * dpr;
  const gap = TEXT_GAP * dpr;
  const ih = MINIMAP_FACILITY_ICON_PX * dpr;
  for (const pass of ['facility', 'region'] as const) {
    // Regions nearest the view centre (the one the player is in) are placed first, so a far
    // neighbour can never take the spot the current region's label needs.
    const ordered =
      pass === 'region'
        ? labels
            .filter((l) => l.kind === 'region')
            .map((l, i) => ({ l, i, d: Math.hypot(l.x - view.centre.x, l.y - view.centre.y) }))
            .sort((a, b) => a.d - b.d || a.i - b.i)
            .map((e) => e.l)
        : labels;
    for (const label of ordered) {
      if (label.kind !== pass || label.text === '') continue;
      const p = minimapTileToPx({ x: label.x, y: label.y }, view);
      const h = fontPx + pad * 2;
      const tw = textWidth(ctx, label.text, fontPx);
      if (pass === 'region') {
        const w = tw + pad * 2;
        // Try the anchor first, then nudge up/down/sideways so a region rarely disappears.
        for (const [ox = 0, oy = 0] of [
          [0, 0],
          [0, -1],
          [0, 1],
          [0, -2],
          [0, 2],
          [-0.4, 0],
          [0.4, 0],
        ]) {
          const cx = p.x + ox * w;
          const cy = p.y + oy * h;
          const l = cx - w / 2;
          const t = cy - h / 2;
          if (!boxInCircle(l, t, w, h, r) || overlaps(out, l, t, w, h)) continue;
          out.push({ label, x: cx, y: cy, left: l, top: t, w, h, showName: true, side: 'right' });
          break;
        }
        continue;
      }
      const iconL = p.x - ih / 2;
      const iconT = p.y - ih / 2;
      const fits = (l: number, t: number, w: number, hh: number) =>
        boxInCircle(l, t, w, hh, r) && !overlaps(out, l, t, w, hh);
      let placed: PlacedLabel | undefined;
      const base = { label, x: p.x, y: p.y, h, showName: true };
      const fullW = ih + gap + tw;
      if (fits(iconL, p.y - h / 2, fullW, h)) {
        placed = { ...base, left: iconL, top: p.y - h / 2, w: fullW, side: 'right' };
      } else if (fits(iconL - gap - tw, p.y - h / 2, fullW, h)) {
        placed = { ...base, left: iconL - gap - tw, top: p.y - h / 2, w: fullW, side: 'left' };
      } else {
        const bw = Math.max(ih, tw);
        const bh = ih + gap + fontPx + pad;
        if (fits(p.x - bw / 2, p.y - ih / 2, bw, bh)) {
          placed = {
            ...base,
            left: p.x - bw / 2,
            top: p.y - ih / 2,
            w: bw,
            h: bh,
            side: 'below',
          };
        } else if (fits(iconL, iconT, ih, ih)) {
          placed = {
            ...base,
            left: iconL,
            top: iconT,
            w: ih,
            h: ih,
            showName: false,
            side: 'right',
          };
        }
      }
      if (placed) out.push(placed);
    }
  }
  return out;
}

/** Procedural coin with a $ for the bank: gold disc, dark rim, S + bar. Centred on (x, y). */
function drawBankIcon(ctx: Minimap2D, x: number, y: number, dpr: number): void {
  const rad = (MINIMAP_FACILITY_ICON_PX * dpr) / 2;
  ctx.beginPath();
  ctx.arc(x, y, rad - 0.5 * dpr, 0, Math.PI * 2);
  ctx.fillStyle = '#ffd23f';
  ctx.fill();
  ctx.strokeStyle = '#7a5a00';
  ctx.lineWidth = dpr;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + 2 * dpr, y - 2 * dpr);
  ctx.lineTo(x - 2 * dpr, y - 2 * dpr);
  ctx.lineTo(x - 2 * dpr, y);
  ctx.lineTo(x + 2 * dpr, y);
  ctx.lineTo(x + 2 * dpr, y + 2 * dpr);
  ctx.lineTo(x - 2 * dpr, y + 2 * dpr);
  ctx.moveTo(x, y - 3.5 * dpr);
  ctx.lineTo(x, y + 3.5 * dpr);
  ctx.stroke();
}

function drawOutlinedText(ctx: Minimap2D, text: string, x: number, y: number, dpr: number): void {
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 3 * dpr;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, x, y);
}

function drawLabels(ctx: Minimap2D, placed: readonly PlacedLabel[], dpr: number): void {
  const fontPx = minimapLabelFontPx(dpr);
  ctx.font = fontOf(fontPx);
  ctx.lineJoin = 'round';
  ctx.textBaseline = 'middle';
  for (const p of placed) {
    if (p.label.kind === 'region') {
      ctx.textAlign = 'center';
      drawOutlinedText(ctx, p.label.text, p.x, p.y, dpr);
      continue;
    }
    drawBankIcon(ctx, p.x, p.y, dpr); // only 'bank' exists; unknown icons get the same coin
    if (p.showName) {
      const off = (MINIMAP_FACILITY_ICON_PX / 2 + TEXT_GAP) * dpr;
      if (p.side === 'below') {
        ctx.textAlign = 'center';
        drawOutlinedText(ctx, p.label.text, p.x, p.y + off + fontPx / 2, dpr);
      } else {
        ctx.textAlign = p.side === 'left' ? 'right' : 'left';
        const dx = p.side === 'left' ? -off : off;
        drawOutlinedText(ctx, p.label.text, p.x + dx, p.y, dpr);
      }
    }
  }
  ctx.lineJoin = 'miter';
}

export interface MinimapRimArrow {
  /** Radians, canvas space (0 = east, +y = south), from the centre toward the target. */
  angle: number;
}

/** Arrow toward a tile that is outside the visible circle; null while it is inside (marker shows). */
export function minimapRimArrow(tile: Tile, view: MinimapView): MinimapRimArrow | null {
  const p = minimapTileToPx(tile, view);
  const dx = p.x - view.radiusPx;
  const dy = p.y - view.radiusPx;
  if (dx * dx + dy * dy <= view.radiusPx * view.radiusPx) return null;
  return { angle: Math.atan2(dy, dx) };
}

function drawRimArrow(ctx: Minimap2D, a: MinimapRimArrow, r: number, d: number): void {
  const style = MINIMAP_MARKERS.destination;
  const tipR = r - 1 * d;
  const baseR = tipR - 6 * d;
  const half = 3.5 * d;
  const c = Math.cos(a.angle);
  const s = Math.sin(a.angle);
  const pt = (rad: number, side: number): [number, number] => [
    r + c * rad - s * side,
    r + s * rad + c * side,
  ];
  ctx.beginPath();
  ctx.moveTo(...pt(tipR, 0));
  ctx.lineTo(...pt(baseR, half));
  ctx.lineTo(...pt(baseR, -half));
  ctx.closePath();
  ctx.fillStyle = style.color;
  ctx.fill();
  if (style.outline) {
    ctx.strokeStyle = style.outline;
    ctx.lineWidth = d;
    ctx.stroke();
  }
}

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
  labels: readonly MinimapLabel[] = [],
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
  const left = (view.centre.x - (image.origin?.x ?? 0) + 0.5 - half) * ppt;
  const top = (view.centre.y - (image.origin?.y ?? 0) + 0.5 - half) * ppt;
  const span = half * 2 * ppt;
  const sx = Math.max(0, left);
  const sy = Math.max(0, top);
  const sw = Math.min(image.width, left + span) - sx;
  const sh = Math.min(image.height, top + span) - sy;
  if (sw > 0 && sh > 0) {
    const k = s / ppt; // canvas px per image px
    ctx.drawImage(canvasImage, sx, sy, sw, sh, (sx - left) * k, (sy - top) * k, sw * k, sh * k);
  }

  if (labels.length > 0) drawLabels(ctx, layoutMinimapLabels(ctx, labels, view), dprOf(view));
  for (const m of markers) {
    if (m.kind === 'destination') {
      const arrow = minimapRimArrow(m.tile, view);
      if (arrow) drawRimArrow(ctx, arrow, r, dprOf(view));
    }
    const style = MINIMAP_MARKERS[m.kind];
    const d = dprOf(view);
    const size = style.size * d;
    const p = minimapTileToPx(m.tile, view);
    const dx = p.x - r;
    const dy = p.y - r;
    if (dx * dx + dy * dy > r * r) continue;
    ctx.fillStyle = style.color;
    if (style.shape === 'dot') {
      ctx.beginPath();
      ctx.arc(p.x, p.y, size / 2, 0, Math.PI * 2);
      ctx.fill();
      if (style.outline) {
        ctx.strokeStyle = style.outline;
        ctx.lineWidth = d;
        ctx.stroke();
      }
    } else {
      const h = size / 2;
      ctx.fillRect(p.x - h, p.y - h, size, size);
      if (style.outline) {
        ctx.strokeStyle = style.outline;
        ctx.lineWidth = d;
        ctx.strokeRect(p.x - h, p.y - h, size, size);
      }
    }
  }
  ctx.restore();
}
