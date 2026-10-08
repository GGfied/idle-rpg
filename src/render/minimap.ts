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

export type MinimapMarkerKind =
  | 'player'
  | 'tree'
  | 'stump'
  | 'tree_normal'
  | 'tree_oak'
  | 'rock_copper'
  | 'rock_tin'
  | 'rock_iron'
  | 'rock_coal'
  | 'spot_net'
  | 'spot_bait'
  | 'bank'
  | 'npc'
  | 'destination';

/** Alpha for a depleted node's marker (rocks). */
export const MINIMAP_DEPLETED_ALPHA = 0.4;

export interface MinimapMarkerStyle {
  color: string;
  /** Diameter (dot) or side (square) in canvas px. */
  size: number;
  shape: 'dot' | 'square';
  /** Optional outline colour for contrast. */
  outline?: string;
  /** Outline width in CSS px (default 1). */
  outlineWidth?: number;
}

export const MINIMAP_MARKERS: Record<MinimapMarkerKind, MinimapMarkerStyle> = {
  player: { color: '#ffffff', size: 5, shape: 'dot', outline: '#000000', outlineWidth: 2 },
  tree: { color: '#1f9d3a', size: 3, shape: 'dot' },
  stump: { color: '#8a5a2b', size: 3, shape: 'dot' },
  // One marker per woodcutting tree def ('tree', 'oak_tree'): both green dots, oak is darker, bigger, brown-ringed.
  tree_normal: { color: '#5fd36b', size: 3, shape: 'dot' },
  tree_oak: { color: '#18892f', size: 4, shape: 'dot', outline: '#8a5a2b' },
  // Rocks: light-grey stone square (trees are green dots) filled with a small ore tint.
  rock_copper: { color: '#e88a2c', size: 4, shape: 'square', outline: '#c9ced3' },
  rock_tin: { color: '#e6edf2', size: 4, shape: 'square', outline: '#7d858c' },
  rock_iron: { color: '#a8452f', size: 4, shape: 'square', outline: '#c9ced3' },
  rock_coal: { color: '#16161a', size: 4, shape: 'square', outline: '#c9ced3' },
  // Fishing spots: white-ringed blue dots, bigger than a tree dot so they read on water.
  spot_net: { color: '#bfefff', size: 6, shape: 'dot', outline: '#ffffff', outlineWidth: 2 },
  spot_bait: { color: '#1e6bff', size: 5, shape: 'dot', outline: '#ffffff', outlineWidth: 2 },
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
  globalAlpha: number;
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
  /** Dim the marker (a depleted rock). */
  depleted?: boolean;
  /**
   * Player marker only: heading in radians, canvas space (0 = east/right, +y = south, so pi/2 is
   * down the canvas), same convention as the rim arrow. Set = a chevron arrow pointing that way;
   * unset (or not finite) = the plain dot. Convert a game facing with `facingToMinimapAngle`, or a
   * tile delta with `tileDeltaToMinimapAngle`.
   */
  facing?: number;
}

/**
 * The minimap is the tile grid itself: +tile x = right, +tile y = down the canvas (NOT rotated to
 * the isometric view). So a heading is the TILE delta's angle, and a game `Facing8` (an isometric
 * SCREEN compass) is rotated 45 degrees from it: iso 'se' is +x tile = canvas east (0), 's' is
 * (+1,+1) = down-right (pi/4), 'sw' is +y = canvas south (pi/2), 'w' = (-1,+1), 'nw' = -x = west,
 * 'n' = (-1,-1), 'ne' = -y = canvas north, 'e' = (+1,-1).
 */
const FACING_ANGLE: Readonly<Record<string, number>> = {
  se: 0,
  s: Math.PI / 4,
  sw: Math.PI / 2,
  w: (3 * Math.PI) / 4,
  nw: Math.PI,
  n: (-3 * Math.PI) / 4,
  ne: -Math.PI / 2,
  e: -Math.PI / 4,
};

/** Minimap marker angle for a game 8-way facing ('n'..'nw', render `Facing8`); undefined if unknown. */
export function facingToMinimapAngle(facing: string): number | undefined {
  return FACING_ANGLE[facing];
}

/** Minimap marker angle for a movement TILE delta (the same thing the facing was derived from); undefined for (0,0). */
export function tileDeltaToMinimapAngle(dx: number, dy: number): number | undefined {
  return dx === 0 && dy === 0 ? undefined : Math.atan2(dy, dx);
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
  /** True when no spot clear of the player marker was found: drawn translucent, under the marker. */
  faded?: boolean;
}

/** Label alpha when it has to sit under the player marker. */
export const MINIMAP_LABEL_FADED_ALPHA = 0.4;
/** Clear space kept around the player marker for labels, CSS px radius. */
export const MINIMAP_PLAYER_KEEPOUT_PX = 6;

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

/**
 * The shape-specific part of a minimap: where tiles land, what is "inside", how to clip.
 * The circular minimap and the rectangular world map share one painter and one label layout;
 * only the frame differs.
 */
interface Frame {
  /** Canvas size in px. */
  width: number;
  height: number;
  /** Canvas px of the view centre (the player when following). */
  cx: number;
  cy: number;
  /** Canvas px per tile (pxPerTile * zoom). */
  scale: number;
  dpr: number;
  centre: Tile;
  tileToPx(tile: Tile): { x: number; y: number };
  /** Marker anchor is visible. */
  contains(x: number, y: number): boolean;
  /** Box lies fully inside the visible shape. */
  fits(l: number, t: number, w: number, h: number): boolean;
  clip(ctx: Minimap2D): void;
  /** Draw an off-view hint for a tile (circle only). */
  rimArrow?(ctx: Minimap2D, tile: Tile): void;
}

function circleFrame(view: MinimapView): Frame {
  const r = view.radiusPx;
  return {
    width: r * 2,
    height: r * 2,
    cx: r,
    cy: r,
    scale: scaleOf(view),
    dpr: dprOf(view),
    centre: view.centre,
    tileToPx: (t) => minimapTileToPx(t, view),
    contains: (x, y) => (x - r) * (x - r) + (y - r) * (y - r) <= r * r,
    fits: (l, t, w, h) => boxInCircle(l, t, w, h, r),
    clip(ctx) {
      ctx.beginPath();
      ctx.arc(r, r, r, 0, Math.PI * 2);
      ctx.clip();
    },
    rimArrow(ctx, tile) {
      const arrow = minimapRimArrow(tile, view);
      if (arrow) drawRimArrow(ctx, arrow, r, dprOf(view));
    },
  };
}

function rectFrame(view: WorldMapView): Frame {
  const { w, h } = view;
  return {
    width: w,
    height: h,
    cx: w / 2,
    cy: h / 2,
    scale: worldScaleOf(view),
    dpr: worldDprOf(view),
    centre: view.centre,
    tileToPx: (t) => worldMapTileToPx(t, view),
    contains: (x, y) => x >= 0 && y >= 0 && x <= w && y <= h,
    fits: (l, t, bw, bh) => l >= 0 && t >= 0 && l + bw <= w && t + bh <= h,
    clip(ctx) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(w, 0);
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      ctx.clip();
    },
  };
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
  return layoutLabels(ctx, labels, circleFrame(view));
}

function layoutLabels(
  ctx: Minimap2D,
  labels: readonly MinimapLabel[],
  frame: Frame,
): PlacedLabel[] {
  const out: PlacedLabel[] = [];
  const dpr = frame.dpr;
  const fontPx = minimapLabelFontPx(dpr);
  const pad = LABEL_PAD * dpr;
  const gap = TEXT_GAP * dpr;
  const ih = MINIMAP_FACILITY_ICON_PX * dpr;
  // The player is at the view centre (the map follows them): keep labels off that spot.
  const keep = (MINIMAP_PLAYER_KEEPOUT_PX + 0) * dpr;
  const hitsPlayer = (l: number, t: number, w: number, hh: number) =>
    l < frame.cx + keep &&
    l + w > frame.cx - keep &&
    t < frame.cy + keep &&
    t + hh > frame.cy - keep;
  for (const pass of ['facility', 'region'] as const) {
    // Regions nearest the view centre (the one the player is in) are placed first, so a far
    // neighbour can never take the spot the current region's label needs.
    const ordered =
      pass === 'region'
        ? labels
            .filter((l) => l.kind === 'region')
            .map((l, i) => ({ l, i, d: Math.hypot(l.x - frame.centre.x, l.y - frame.centre.y) }))
            .sort((a, b) => a.d - b.d || a.i - b.i)
            .map((e) => e.l)
        : labels;
    for (const label of ordered) {
      if (label.kind !== pass || label.text === '') continue;
      const before = out.length;
      for (const avoid of [true, false]) {
        if (out.length > before) break;
        const clear = (l: number, t: number, w: number, hh: number) =>
          !avoid || !hitsPlayer(l, t, w, hh);
        const p = frame.tileToPx({ x: label.x, y: label.y });
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
            if (!frame.fits(l, t, w, h) || overlaps(out, l, t, w, h) || !clear(l, t, w, h))
              continue;
            out.push({
              label,
              x: cx,
              y: cy,
              left: l,
              top: t,
              w,
              h,
              showName: true,
              side: 'right',
              ...(avoid ? {} : { faded: true }),
            });
            break;
          }
          continue;
        }
        const iconL = p.x - ih / 2;
        const iconT = p.y - ih / 2;
        const fits = (l: number, t: number, w: number, hh: number) =>
          frame.fits(l, t, w, hh) && !overlaps(out, l, t, w, hh) && clear(l, t, w, hh);
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
        if (placed) out.push(avoid ? placed : { ...placed, faded: true });
      }
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
    ctx.globalAlpha = p.faded ? MINIMAP_LABEL_FADED_ALPHA : 1;
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
  ctx.globalAlpha = 1;
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

/** White chevron arrow (dark outline) centred on (x, y), pointing along `angle`. Same size class as the dot. */
function drawPlayerArrow(ctx: Minimap2D, x: number, y: number, angle: number, d: number): void {
  const style = MINIMAP_MARKERS.player;
  const len = style.size * 2.2 * d; // tip-to-tail
  const half = len * 0.62; // half the width across the back corners
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const pt = (fwd: number, side: number): [number, number] => [
    x + c * fwd - s * side,
    y + s * fwd + c * side,
  ];
  ctx.beginPath();
  ctx.moveTo(...pt(len / 2, 0)); // tip
  ctx.lineTo(...pt(-len / 2, half)); // back corner
  ctx.lineTo(...pt(-len / 6, 0)); // notch
  ctx.lineTo(...pt(-len / 2, -half)); // other back corner
  ctx.closePath();
  // Outline first, then the fill on top, so the dark edge only grows outward and the white stays big.
  ctx.lineJoin = 'round';
  ctx.strokeStyle = style.outline ?? '#000000';
  ctx.lineWidth = 2.4 * d;
  ctx.stroke();
  ctx.fillStyle = style.color;
  ctx.fill();
  ctx.lineJoin = 'miter';
}

/** Shared painter: clip, background, terrain crop, labels above ordinary markers, player last. */
function paint(
  ctx: Minimap2D,
  canvasImage: CanvasImageSource,
  image: MinimapImage,
  frame: Frame,
  markers: readonly MinimapMarker[],
  labels: readonly MinimapLabel[],
): void {
  const s = frame.scale;
  const d = frame.dpr;
  ctx.save();
  frame.clip(ctx);
  ctx.fillStyle = MINIMAP_BACKGROUND;
  ctx.fillRect(0, 0, frame.width, frame.height);
  ctx.imageSmoothingEnabled = false;

  // Visible rectangle in image px, clamped to the image (drawImage rejects out-of-range sources).
  const ppt = image.pxPerTile;
  const halfX = frame.width / 2 / s; // tiles from centre to edge
  const halfY = frame.height / 2 / s;
  const left = (frame.centre.x - (image.origin?.x ?? 0) + 0.5 - halfX) * ppt;
  const top = (frame.centre.y - (image.origin?.y ?? 0) + 0.5 - halfY) * ppt;
  const spanX = halfX * 2 * ppt;
  const spanY = halfY * 2 * ppt;
  const sx = Math.max(0, left);
  const sy = Math.max(0, top);
  const sw = Math.min(image.width, left + spanX) - sx;
  const sh = Math.min(image.height, top + spanY) - sy;
  if (sw > 0 && sh > 0) {
    const k = s / ppt; // canvas px per image px
    ctx.drawImage(canvasImage, sx, sy, sw, sh, (sx - left) * k, (sy - top) * k, sw * k, sh * k);
  }

  // Labels sit above terrain and ordinary markers (trees must not cut the text); the player
  // marker is always drawn last, on top of everything.
  let labelsDrawn = labels.length === 0;
  const flushLabels = () => {
    if (labelsDrawn) return;
    labelsDrawn = true;
    drawLabels(ctx, layoutLabels(ctx, labels, frame), d);
  };
  const ordered = [
    ...markers.filter((m) => m.kind !== 'player'),
    ...markers.filter((m) => m.kind === 'player'),
  ];
  for (const m of ordered) {
    if (m.kind === 'player') flushLabels();
    if (m.kind === 'destination') frame.rimArrow?.(ctx, m.tile);
    const style = MINIMAP_MARKERS[m.kind];
    const size = style.size * d;
    const p = frame.tileToPx(m.tile);
    if (!frame.contains(p.x, p.y)) continue;
    if (m.kind === 'player' && m.facing !== undefined && Number.isFinite(m.facing)) {
      drawPlayerArrow(ctx, p.x, p.y, m.facing, d);
      continue;
    }
    ctx.fillStyle = style.color;
    ctx.globalAlpha = m.depleted ? MINIMAP_DEPLETED_ALPHA : 1;
    if (style.shape === 'dot') {
      ctx.beginPath();
      ctx.arc(p.x, p.y, size / 2, 0, Math.PI * 2);
      ctx.fill();
      if (style.outline) {
        ctx.strokeStyle = style.outline;
        ctx.lineWidth = (style.outlineWidth ?? 1) * d;
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
    ctx.globalAlpha = 1;
  }
  flushLabels();
  ctx.restore();
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
  paint(ctx, canvasImage, image, circleFrame(view), markers, labels);
}

/** Draw the rectangular world map (same terrain, markers and labels as the minimap). */
export function drawWorldMap(
  ctx: Minimap2D,
  canvasImage: CanvasImageSource,
  image: MinimapImage,
  view: WorldMapView,
  markers: readonly MinimapMarker[],
  labels: readonly MinimapLabel[] = [],
): void {
  paint(ctx, canvasImage, image, rectFrame(view), markers, labels);
}

/**
 * Rectangular world view: a w x h canvas (px, north up) showing the tiles around `centre`.
 * Same field meanings as MinimapView; pxPerTile * zoom is the canvas px per tile.
 */
export interface WorldMapView {
  /** Tile at the canvas centre; integer = middle of that tile; fractional ok. */
  centre: Tile;
  /** Canvas size in px. */
  w: number;
  h: number;
  /** Canvas px per tile at zoom 1. */
  pxPerTile: number;
  zoom?: number;
  /** Canvas px per CSS px (label text/icon scale); default 1. */
  pixelRatio?: number;
  /** World size in tiles; worldMapPxToTile returns null outside it. */
  bounds?: { width: number; height: number };
}

/** Largest px per tile the world map can zoom to. */
export const WORLD_MAP_MAX_PX_PER_TILE = 12;

function worldScaleOf(view: WorldMapView): number {
  return view.pxPerTile * (view.zoom ?? 1);
}

function worldDprOf(view: WorldMapView): number {
  const d = view.pixelRatio ?? 1;
  return d > 0 && Number.isFinite(d) ? d : 1;
}

/** Canvas px (relative to the canvas top-left) of the centre of a tile. */
export function worldMapTileToPx(tile: Tile, view: WorldMapView): { x: number; y: number } {
  const s = worldScaleOf(view);
  return {
    x: view.w / 2 + (tile.x - view.centre.x) * s,
    y: view.h / 2 + (tile.y - view.centre.y) * s,
  };
}

/** Tile under a canvas px, or null outside the canvas, outside the world, or on bad input. */
export function worldMapPxToTile(px: number, py: number, view: WorldMapView): Tile | null {
  if (!Number.isFinite(px) || !Number.isFinite(py)) return null;
  const s = worldScaleOf(view);
  if (!(s > 0)) return null;
  if (px < 0 || py < 0 || px > view.w || py > view.h) return null;
  const x = Math.round(view.centre.x + (px - view.w / 2) / s);
  const y = Math.round(view.centre.y + (py - view.h / 2) / s);
  if (view.bounds && (x < 0 || y < 0 || x >= view.bounds.width || y >= view.bounds.height)) {
    return null;
  }
  return { x, y };
}

/**
 * Clamp a px-per-tile value (zoom 1 scale) for the world map: min fits the whole world
 * (view.bounds) inside w x h, max is WORLD_MAP_MAX_PX_PER_TILE. Non-finite input -> min.
 * Without bounds the min is 1. If the world is so small that fitting exceeds the max, max wins.
 */
export function clampWorldMapScale(scale: number, view: WorldMapView): number {
  const fit = view.bounds ? Math.min(view.w / view.bounds.width, view.h / view.bounds.height) : 1;
  const min = Math.min(fit, WORLD_MAP_MAX_PX_PER_TILE);
  if (!Number.isFinite(scale)) return min;
  return Math.min(WORLD_MAP_MAX_PX_PER_TILE, Math.max(min, scale));
}
