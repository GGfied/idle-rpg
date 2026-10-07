import type Phaser from 'phaser';
import { ISO } from './iso';

/**
 * Procedural ground textures for the iso view: original, seeded, deterministic 64x32 diamond
 * pixel art per terrain kind, 4-6 variants each, plus low-frequency world tint and edge-blend data.
 * The pixel painter is pure (no Phaser, no canvas) so it is testable and previewable anywhere;
 * `getGroundTexture` uploads one canvas texture per (kind, variant), once.
 *
 * Textures are authored at the LIGHT end: `tintFor` only darkens/shifts (Phaser tint multiplies), so
 * the average tinted look lands on the palette colour.
 */

export type GroundKind =
  'grass' | 'path' | 'water' | 'waterdetail' | 'sand' | 'wall' | 'flowers' | 'floor' | 'bridge';
type BaseKind = Exclude<GroundKind, 'flowers'>;

export const GROUND_W = ISO.tileWidth;
export const GROUND_H = ISO.tileHeight;

/** Variants per base texture (flowers shares grass). */
export const GROUND_VARIANTS: Readonly<Record<BaseKind, number>> = {
  grass: 6,
  path: 5,
  sand: 5,
  water: 4,
  waterdetail: 6,
  floor: 4,
  wall: 5,
  bridge: 4,
};

export function baseKind(kind: GroundKind): BaseKind {
  return kind === 'flowers' ? 'grass' : kind;
}

export function variantCount(kind: GroundKind): number {
  return GROUND_VARIANTS[baseKind(kind)];
}

type Rgb = readonly [number, number, number];

// ---------- hashing / noise ----------

function hash(seed: number, x: number, y: number): number {
  let h =
    Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Smooth value noise in [0,1). */
function vnoise(seed: number, x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = smooth(x - x0);
  const fy = smooth(y - y0);
  const a = hash(seed, x0, y0);
  const b = hash(seed, x0 + 1, y0);
  const c = hash(seed, x0, y0 + 1);
  const d = hash(seed, x0 + 1, y0 + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

const KIND_SEED: Record<BaseKind, number> = {
  grass: 11,
  path: 23,
  sand: 37,
  water: 41,
  waterdetail: 47,
  floor: 53,
  wall: 67,
  bridge: 79,
};

function rngFor(kind: BaseKind, variant: number): () => number {
  let a = (KIND_SEED[kind] * 7919 + variant * 104729) | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- pixel buffer ----------

class Buf {
  readonly data = new Uint8ClampedArray(GROUND_W * GROUND_H * 4);
  /** 1 inside the (slightly grown, seam-hiding) diamond. */
  private readonly mask = new Uint8Array(GROUND_W * GROUND_H);
  constructor() {
    for (let y = 0; y < GROUND_H; y++)
      for (let x = 0; x < GROUND_W; x++) {
        const d =
          Math.abs(x + 0.5 - GROUND_W / 2) / (GROUND_W / 2) +
          Math.abs(y + 0.5 - GROUND_H / 2) / (GROUND_H / 2);
        this.mask[y * GROUND_W + x] = d <= 1.03 ? 1 : 0;
      }
  }
  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < GROUND_W && y < GROUND_H && this.mask[y * GROUND_W + x] === 1;
  }
  set(x: number, y: number, c: Rgb, alpha = 1): void {
    x = Math.round(x);
    y = Math.round(y);
    if (!this.inside(x, y)) return;
    const i = (y * GROUND_W + x) * 4;
    const d = this.data;
    d[i] = d[i]! + (c[0] - d[i]!) * alpha;
    d[i + 1] = d[i + 1]! + (c[1] - d[i + 1]!) * alpha;
    d[i + 2] = d[i + 2]! + (c[2] - d[i + 2]!) * alpha;
    d[i + 3] = 255;
  }
  /** Per-pixel fill; `f` gets pixel centre in px plus tile-space (u, v) in [-0.5, 0.5]. */
  fill(f: (x: number, y: number, u: number, v: number) => Rgb): void {
    for (let y = 0; y < GROUND_H; y++)
      for (let x = 0; x < GROUND_W; x++) {
        if (!this.inside(x, y)) continue;
        const px = x + 0.5 - GROUND_W / 2;
        const py = y + 0.5 - GROUND_H / 2;
        const c = f(x, y, (px / 32 + py / 16) / 2, (py / 16 - px / 32) / 2);
        this.set(x, y, c);
      }
  }
}

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const mul = (a: Rgb, f: number): Rgb => [a[0] * f, a[1] * f, a[2] * f];

// ---------- painters ----------

/** Layered (low + mid + per-pixel) lightness factor around 1. */
function lightness(seed: number, x: number, y: number, amp: number): number {
  const n =
    vnoise(seed, x / 9, y / 5) * 0.5 +
    vnoise(seed + 1, x / 3, y / 2) * 0.3 +
    hash(seed + 2, x, y) * 0.2;
  return 1 + (n - 0.5) * 2 * amp;
}

function blade(b: Buf, x: number, y: number, len: number, lean: number, c: Rgb, tip: Rgb): void {
  for (let i = 0; i < len; i++) b.set(x + lean * (i / len), y - i, i === len - 1 ? tip : c);
}

function paintGrass(b: Buf, v: number, rnd: () => number): void {
  const base: Rgb = [92, 158, 68];
  const seed = 100 + v;
  b.fill((x, y) => mul(base, lightness(seed, x, y, 0.2)));
  for (let i = 0; i < 52; i++) {
    const x = rnd() * GROUND_W;
    const y = 3 + rnd() * (GROUND_H - 3);
    const dark = rnd() < 0.5;
    blade(
      b,
      x,
      y,
      2 + Math.floor(rnd() * 2),
      (rnd() - 0.5) * 2,
      dark ? [66, 122, 48] : [112, 182, 80],
      dark ? [80, 140, 58] : [150, 208, 104],
    );
  }
  for (let i = 0; i < 3; i++) {
    // small tuft: three blades fanning out
    const x = 8 + rnd() * (GROUND_W - 16);
    const y = 8 + rnd() * (GROUND_H - 12);
    blade(b, x, y, 4, -1.5, [70, 128, 50], [100, 168, 72]);
    blade(b, x + 1, y, 5, 0, [78, 140, 56], [118, 190, 84]);
    blade(b, x + 2, y, 4, 1.5, [70, 128, 50], [100, 168, 72]);
  }
  if (v % 3 === 2) {
    // clover patch
    const cx = 18 + rnd() * 28;
    const cy = 10 + rnd() * 12;
    const leaf: Rgb = [128, 196, 96];
    for (const [dx, dy] of [
      [0, 0],
      [2, 1],
      [-2, 1],
      [0, -1],
    ] as const) {
      b.set(cx + dx, cy + dy, leaf);
      b.set(cx + dx + 1, cy + dy, mul(leaf, 0.85));
    }
    b.set(cx, cy + 2, [60, 110, 44]);
  }
}

function paintPath(b: Buf, v: number, rnd: () => number): void {
  const base: Rgb = [196, 166, 112];
  const seed = 200 + v;
  b.fill((x, y) => mul(base, lightness(seed, x, y, 0.09)));
  if (v < 2) {
    // faint ruts running along the tile's x axis (down-right in screen space)
    for (const off of [-0.16, 0.16]) {
      for (let t = -0.5; t <= 0.5; t += 0.012) {
        const u = t;
        const vv = off + (v === 0 ? 0 : 0.03 * Math.sin(t * 9));
        b.set(GROUND_W / 2 + (u - vv) * 32, GROUND_H / 2 + (u + vv) * 16, [150, 120, 78], 0.35);
      }
    }
  }
  for (let i = 0; i < 9; i++) {
    const x = 6 + rnd() * (GROUND_W - 12);
    const y = 5 + rnd() * (GROUND_H - 9);
    const pc: Rgb = rnd() < 0.5 ? [150, 140, 128] : [176, 150, 112];
    b.set(x + 1, y + 1, [112, 90, 60], 0.6);
    b.set(x, y, pc);
    b.set(x + 1, y, mul(pc, 0.9));
    b.set(x, y - 1, mul(pc, 1.18), 0.9);
  }
  for (let i = 0; i < 20; i++) b.set(rnd() * GROUND_W, rnd() * GROUND_H, [226, 200, 150], 0.7);
}

function paintSand(b: Buf, v: number, rnd: () => number): void {
  const base: Rgb = [232, 216, 160];
  const seed = 300 + v;
  b.fill((x, y) => mul(base, lightness(seed, x, y, 0.05) * (0.97 + hash(seed + 5, x, y) * 0.06)));
  const ripples = 2 + (v % 2);
  for (let r = 0; r < ripples; r++) {
    const cy = 6 + rnd() * 20;
    const cx = 12 + rnd() * 30;
    const ph = rnd() * 6;
    for (let i = 0; i < 16; i++) {
      const x = cx + i;
      const y = cy + i / 2 + Math.sin(i * 0.6 + ph) * 0.8;
      b.set(x, y, [200, 182, 128], 0.55);
      b.set(x, y - 1, [246, 234, 184], 0.5);
    }
  }
  for (let i = 0; i < 24; i++)
    b.set(rnd() * GROUND_W, rnd() * GROUND_H, rnd() < 0.5 ? [208, 190, 134] : [248, 238, 190], 0.8);
}

function paintWater(b: Buf, v: number, rnd: () => number): void {
  const deep: Rgb = [40, 100, 168];
  const light: Rgb = [66, 136, 202];
  const seed = 400 + v;
  b.fill((x, y) => mix(deep, light, vnoise(seed, x / 10, y / 4) * 0.7 + hash(seed, x, y) * 0.1));
  for (let i = 0; i < 3; i++) {
    const x = 10 + rnd() * 40;
    const y = 6 + rnd() * 18;
    for (let k = 0; k < 4; k++) b.set(x + k, y + k / 2, [130, 188, 232], 0.35);
  }
}

/**
 * Transparent overlay stamped over the shaded water base: soft light/dark streaks along the iso
 * x axis, a few specular glints. Everything stays well inside the diamond and mostly translucent,
 * so neighbouring tiles never show an outline or a repeating tile pattern.
 */
function paintWaterDetail(b: Buf, v: number, rnd: () => number): void {
  const px = (x: number, y: number, c: Rgb, a: number) => {
    x = Math.round(x);
    y = Math.round(y);
    if (!b.inside(x, y)) return;
    const u = Math.abs(x + 0.5 - GROUND_W / 2) / 32 + Math.abs(y + 0.5 - GROUND_H / 2) / 16;
    if (u > 0.78) return; // keep clear of the diamond edge
    const i = (y * GROUND_W + x) * 4;
    const d = b.data;
    const old = d[i + 3]! / 255;
    const na = old + a * (1 - old);
    d[i] = c[0];
    d[i + 1] = c[1];
    d[i + 2] = c[2];
    d[i + 3] = Math.round(na * 255);
  };
  const streak = (len: number, c: Rgb, a: number) => {
    const x = 12 + rnd() * 34;
    const y = 8 + rnd() * 15;
    const ph = rnd() * 6;
    for (let i = 0; i < len; i++) {
      const fade = Math.sin((Math.PI * (i + 0.5)) / len);
      px(x + i, y + i / 2 + Math.sin(i * 0.7 + ph) * 0.5, c, a * fade);
    }
  };
  const lights = 5 + (v % 3);
  for (let i = 0; i < lights; i++)
    streak(5 + Math.floor(rnd() * 9), [196, 230, 250], 0.2 + rnd() * 0.18);
  for (let i = 0; i < 4; i++) streak(6 + Math.floor(rnd() * 8), [16, 52, 112], 0.14 + rnd() * 0.12);
  for (let i = 0; i < 2; i++) {
    // specular glint: a bright 2x1 with a faint halo
    const x = 14 + rnd() * 36;
    const y = 8 + rnd() * 15;
    px(x, y, [255, 255, 255], 0.75);
    px(x + 1, y, [255, 255, 255], 0.55);
    px(x - 1, y, [220, 240, 255], 0.2);
    px(x + 2, y, [220, 240, 255], 0.2);
    px(x, y - 1, [220, 240, 255], 0.18);
  }
}

/** Planks running along the tile's x axis; `gap` > 0 leaves dark gaps (bridge). */
function paintPlanks(
  b: Buf,
  v: number,
  rnd: () => number,
  base: Rgb,
  planks: number,
  gap: number,
  seedBase: number,
): void {
  const seed = seedBase + v;
  const dark: Rgb = [48, 32, 18];
  const jitter = Array.from({ length: planks }, () => 0.9 + rnd() * 0.2);
  const breakAt = Array.from({ length: planks }, () => -0.3 + rnd() * 0.6);
  b.fill((_x, _y, u, vv) => {
    const pv = (vv + 0.5) * planks;
    const idx = Math.min(planks - 1, Math.max(0, Math.floor(pv)));
    const f = pv - idx;
    if (f < gap) return dark;
    const seam = f < 0.14 + gap || f > 0.92;
    const after = u > breakAt[idx]!;
    const grain = 0.94 + vnoise(seed + idx, u * 4 + (after ? 9 : 0), f * 40) * 0.12;
    let c = mul(base, jitter[idx]! * grain * (after ? 0.97 : 1.03));
    if (seam) c = mul(c, 0.72);
    if (Math.abs(u - breakAt[idx]!) < 0.015) c = mul(c, 0.55); // butt joint
    return c;
  });
  for (let i = 0; i < planks && gap > 0; i++) {
    // nails near the ends of each plank
    for (const u of [-0.44, 0.44]) {
      const vv = (i + 0.5) / planks - 0.5;
      b.set(GROUND_W / 2 + (u - vv) * 32, GROUND_H / 2 + (u + vv) * 16, [70, 56, 44], 0.8);
    }
  }
}

function paintStone(b: Buf, v: number, _rnd: () => number): void {
  const base: Rgb = [128, 128, 138];
  const seed = 600 + v;
  const rows = 4;
  b.fill((x, y, u, vv) => {
    const pv = (vv + 0.5) * rows;
    const row = Math.floor(pv);
    const fr = pv - row;
    const pu = (u + 0.5) * 2 + (row % 2) * 0.5;
    const col = Math.floor(pu);
    const fc = pu - col;
    if (fr < 0.1 || fc < 0.07) return [78, 78, 88];
    const tone = 0.88 + hash(seed, col + (row % 2) * 7, row) * 0.26;
    let c = mul(base, tone * lightness(seed + 3, x, y, 0.08));
    if (fr > 0.82 || fc > 0.9) c = mul(c, 0.9);
    if (fr < 0.2 && fc < 0.9) c = mul(c, 1.08);
    return c;
  });
}

const PAINTERS: Record<BaseKind, (b: Buf, v: number, rnd: () => number) => void> = {
  grass: paintGrass,
  path: paintPath,
  sand: paintSand,
  water: paintWater,
  waterdetail: paintWaterDetail,
  floor: (b, v, r) => paintPlanks(b, v, r, [200, 146, 80], 4, 0, 500),
  bridge: (b, v, r) => paintPlanks(b, v, r, [170, 118, 64], 5, 0.07, 700),
  wall: paintStone,
};

/** Pure: RGBA pixels (64x32, outside the diamond transparent) of one ground variant. Deterministic. */
export function paintGroundPixels(kind: GroundKind, variant: number): Uint8ClampedArray {
  const base = baseKind(kind);
  const v = ((variant % GROUND_VARIANTS[base]) + GROUND_VARIANTS[base]) % GROUND_VARIANTS[base];
  const b = new Buf();
  PAINTERS[base](b, v, rngFor(base, v));
  return b.data;
}

// ---------- API ----------

export function groundTextureKey(kind: GroundKind, variant: number): string {
  const base = baseKind(kind);
  const n = GROUND_VARIANTS[base];
  return `ground_${base}_${((variant % n) + n) % n}`;
}

/** Deterministic variant (0..variantCount-1) from tile coords. */
export function variantFor(tx: number, ty: number, kind: GroundKind): number {
  return Math.floor(hash(KIND_SEED[baseKind(kind)], tx, ty) * variantCount(kind));
}

/** Texture key for a variant; generates and uploads the canvas texture on first use. */
export function getGroundTexture(scene: Phaser.Scene, kind: GroundKind, variant: number): string {
  const key = groundTextureKey(kind, variant);
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, GROUND_W, GROUND_H);
  if (!tex) return key;
  const ctx = tex.context;
  const img = ctx.createImageData(GROUND_W, GROUND_H);
  img.data.set(paintGroundPixels(kind, variant));
  ctx.putImageData(img, 0, 0);
  tex.refresh();
  return key;
}

/** Generates every variant up front (call once at boot). Returns elapsed ms and texture bytes. */
export function ensureGroundTextures(scene: Phaser.Scene): {
  ms: number;
  bytes: number;
  count: number;
} {
  const t0 = performance.now();
  let count = 0;
  for (const kind of Object.keys(GROUND_VARIANTS) as BaseKind[])
    for (let v = 0; v < GROUND_VARIANTS[kind]; v++) {
      getGroundTexture(scene, kind, v);
      count++;
    }
  return { ms: performance.now() - t0, bytes: count * GROUND_W * GROUND_H * 4, count };
}

// ---------- world tint ----------

const TINT_SPAN: Record<BaseKind, number> = {
  grass: 0.3,
  path: 0.09,
  sand: 0.07,
  water: 0.05,
  waterdetail: 0,
  floor: 0.06,
  wall: 0.06,
  bridge: 0.05,
};

/** Per-channel multiplier range of `tintFor`: every channel is within [1 - span, 1]. */
export function tintSpan(kind: GroundKind): number {
  return TINT_SPAN[baseKind(kind)];
}

/**
 * Low-frequency world-space colour variation as a Phaser tint (multiplies, so it only darkens/shifts
 * hue, max channel 0xff). Large blobs (~14 tiles) plus a smaller (~5 tiles) octave; grass also
 * drifts between yellow-green and blue-green.
 */
export function tintFor(tx: number, ty: number, kind: GroundKind): number {
  const base = baseKind(kind);
  const span = TINT_SPAN[base];
  const n = vnoise(901, tx / 14, ty / 14) * 0.7 + vnoise(902, tx / 5, ty / 5) * 0.3; // 0..1
  const drift = vnoise(903, tx / 20 + 50, ty / 20) - 0.5; // -0.5..0.5, hue
  const l = 1 - span * (1 - n); // brightness
  const hue = base === 'grass' ? drift * span * 0.6 : 0;
  const ch = (f: number) => Math.round(255 * Math.min(1, Math.max(1 - span, f)));
  return (ch(l - Math.max(0, hue)) << 16) | (ch(l) << 8) | ch(l + Math.min(0, hue));
}

// ---------- edge blending ----------

export type TileSide = 'ne' | 'se' | 'sw' | 'nw';

/** Tile-space delta of the neighbour on each side. */
export const SIDE_DELTA: Readonly<Record<TileSide, { dx: number; dy: number }>> = {
  ne: { dx: 0, dy: -1 },
  se: { dx: 1, dy: 0 },
  sw: { dx: 0, dy: 1 },
  nw: { dx: -1, dy: 0 },
};

/** Edge endpoints in px relative to the tile centre (the diamond sides). */
export const SIDE_EDGE: Record<TileSide, readonly [number, number, number, number]> = {
  ne: [0, -16, 32, 0],
  se: [32, 0, 0, 16],
  sw: [0, 16, -32, 0],
  nw: [-32, 0, 0, -16],
};

export interface EdgeBlend {
  /** Terrain whose overgrowth is drawn (its tuft colours). */
  readonly from: GroundKind;
  /** Tufts per tile edge. */
  readonly count: number;
  /** Max reach into the receiving tile, px. */
  readonly reach: number;
  readonly alpha: number;
  /** Tuft colours, dark to light. */
  readonly colors: readonly number[];
}

export interface Tuft {
  /** Offset from the tile centre in px (blade base). */
  readonly x: number;
  readonly y: number;
  /** Height px (blade goes up, towards -y) and lean px. */
  readonly h: number;
  readonly lean: number;
  readonly color: number;
  readonly alpha: number;
}

const GRASS_BLEND: EdgeBlend = {
  from: 'grass',
  count: 11,
  reach: 8,
  alpha: 1,
  colors: [0x35682a, 0x427a30, 0x5c9a44, 0x78b85a],
};
const GRASS_WATER_BLEND: EdgeBlend = { ...GRASS_BLEND, count: 6, reach: 6, alpha: 0.85 };
const SAND_BLEND: EdgeBlend = {
  from: 'sand',
  count: 8,
  reach: 4,
  alpha: 0.8,
  colors: [0xc8b680, 0xdccb92, 0xefe2b0],
};

const BLEND_RULES: Partial<Record<BaseKind, Partial<Record<BaseKind, EdgeBlend>>>> = {
  // receiving tile -> overhanging neighbour -> blend
  path: { grass: GRASS_BLEND, sand: SAND_BLEND },
  sand: { grass: GRASS_BLEND },
  water: { grass: GRASS_WATER_BLEND },
  floor: { grass: GRASS_BLEND },
};

/**
 * Edge softening info for `self` when `neighbour` touches it: null if nothing overhangs (the
 * receiving tile draws nothing), otherwise how to draw alpha tufts of the neighbour's terrain along
 * the shared edge ONTO `self`. Grass overhangs path/sand/water/floor, sand overhangs path.
 */
export function blendEdge(self: GroundKind, neighbour: GroundKind): EdgeBlend | null {
  return BLEND_RULES[baseKind(self)]?.[baseKind(neighbour)] ?? null;
}

/** Deterministic tufts for one edge of tile (tx, ty); draw them after the ground diamond. */
export function edgeTufts(tx: number, ty: number, side: TileSide, blend: EdgeBlend): Tuft[] {
  const [x0, y0, x1, y1] = SIDE_EDGE[side];
  const salt = side.charCodeAt(0) * 31 + side.charCodeAt(1);
  const out: Tuft[] = [];
  for (let i = 0; i < blend.count; i++) {
    const t = (i + 0.2 + hash(salt, tx * 7 + i, ty) * 0.6) / blend.count;
    // pull the base slightly inside the tile so tufts sit on the receiving ground
    const x = (x0 + (x1 - x0) * t) * 0.93;
    const y = (y0 + (y1 - y0) * t) * 0.93;
    const r = hash(salt + 3, tx + i * 13, ty * 3);
    out.push({
      x,
      y,
      h: 2 + Math.round(r * (blend.reach - 2)),
      lean: Math.round((hash(salt + 5, tx, ty + i) - 0.5) * 3),
      color: blend.colors[Math.floor(r * blend.colors.length)]!,
      alpha: blend.alpha,
    });
  }
  return out;
}
