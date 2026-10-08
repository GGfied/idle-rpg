/**
 * Procedural rock pixel art (copper / tin / iron / coal rocks and their depleted rubble): original, seeded
 * and pure (RGBA bytes, no Phaser), drawn at FINAL resolution like the trees (the 1.5x world scale
 * is baked in; texture shown at scale 1, nearest filtering).
 *
 * Look: a boulder of 3-4 boxy lumps, flat-shaded in facets lit from the top-left (same light and
 * 6-band ramp as the trees), horizontal strata cracks, a dark gap between lumps, a contact shadow
 * to the lower right and a silhouette rim. Ore veins are clusters tinted per ore with one bright
 * "glint" pixel each; `glints` lists those pixels so the view can twinkle one at a time.
 * Every lump lies inside the box the tap hit-bounds are derived from (`ROCK_*` consts below).
 */
import { alphaAt, hash, mulberry, newCanvas, paintRim, put, ramp, rgb } from './pixelArt';
import type { Canvas, Rgb } from './pixelArt';

export type RockArtKind = 'copper_rock' | 'tin_rock' | 'iron_rock' | 'coal_rock';

export const ROCK_TEX_W = 64;
export const ROCK_TEX_H = 56;
export const ROCK_FEET_X = 32;
export const ROCK_FEET_Y = 46;
export const ROCK_VARIANTS = 4;

/** Drawn extent in ART units (x ART_SCALE for px): top above the feet and half width. Hit bounds use these. */
export const ROCK_TOP = 20;
export const ROCK_HALF_W = 14;

export interface OreLook {
  /** Stone body colour. */
  stone: number;
  /** Ore vein colour. */
  ore: number;
  /** Optional second vein colour (patina, rust streaks) speckled at vein edges. */
  accent: number;
}

export const ROCK_LOOKS: Readonly<Record<RockArtKind, OreLook>> = {
  copper_rock: { stone: 0x7a6650, ore: 0xff8c1a, accent: 0x2fd49a },
  tin_rock: { stone: 0x62676e, ore: 0xc3ced6, accent: 0xeaf2f7 },
  iron_rock: { stone: 0x3d4148, ore: 0x8a3524, accent: 0x5e2a1e },
  coal_rock: { stone: 0x2a2c33, ore: 0x07070a, accent: 0x93a6c4 },
};

export interface RockPixels {
  readonly data: Uint8ClampedArray;
  /** Texture-space pixels of the bright ore sparkles (empty when depleted). */
  readonly glints: readonly { x: number; y: number }[];
}

/** Deterministic variant 0..ROCK_VARIANTS-1 for a tile (so a rock always looks the same). */
export function rockVariantFor(tx: number, ty: number): number {
  return Math.floor(hash(0x40c, tx, ty) * ROCK_VARIANTS);
}

interface Lump {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

// light from the top-left, toward the viewer (same as trees)
const LX = -0.55;
const LY = -0.65;
const LZ = 0.52;
const BOX = 2.6; // superellipse exponent: boxier than a circle

function paintShadow(c: Canvas, rx: number, ry: number): void {
  const cx = ROCK_FEET_X + 3;
  const cy = ROCK_FEET_Y + 1;
  for (let y = cy - ry - 1; y <= cy + ry + 1; y++)
    for (let x = cx - rx - 1; x <= cx + rx + 1; x++) {
      const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      if (d >= 1) continue;
      put(c, x, y, [10, 12, 10], Math.round(120 * (Math.ceil((1 - d) * 4) / 4)));
    }
}

/** Paint flat-shaded boxy lumps (back to front); returns the light value of every solid pixel. */
function paintLumps(c: Canvas, base: Rgb, seed: number, lumps: readonly Lump[]): Float32Array {
  const light = new Float32Array(c.w * c.h);
  const own = mulberry(seed + 7);
  const top = Math.min(...lumps.map((l) => l.cy - l.ry));
  const span = Math.max(...lumps.map((l) => l.cy + l.ry)) - top;
  const ordered = [...lumps].sort((a, b) => a.cy - b.cy);
  for (const b of ordered) {
    const facetOff = own() * Math.PI;
    for (let y = Math.floor(b.cy - b.ry - 2); y <= Math.ceil(b.cy + b.ry + 2); y++)
      for (let x = Math.floor(b.cx - b.rx - 2); x <= Math.ceil(b.cx + b.rx + 2); x++) {
        const dx = (x + 0.5 - b.cx) / b.rx;
        const dy = (y + 0.5 - b.cy) / b.ry;
        const d = (Math.abs(dx) ** BOX + Math.abs(dy) ** BOX) ** (1 / BOX);
        if (d > 1) {
          // gap shadow on the lump behind
          if (d < 1.14 && dy > -0.35 && alphaAt(c, x, y) > 0) {
            const i = (y * c.w + x) * 4;
            for (let k = 0; k < 3; k++) c.data[i + k] = (c.data[i + k] ?? 0) * 0.78;
          }
          continue;
        }
        if (d > 0.9 && hash(seed + 11, x, y) < (d - 0.9) * 3.4) continue; // chipped edge
        const ang = Math.atan2(dy, dx);
        const q = Math.round((ang + facetOff) / (Math.PI / 3)) * (Math.PI / 3) - facetOff;
        const s = Math.min(1, d * 1.05) ** 1.2;
        const nx = Math.cos(q) * s;
        const ny = Math.sin(q) * s;
        const nz = Math.sqrt(Math.max(0, 1 - s * s)) * 0.9 + 0.1;
        let t = 0.5 + 0.7 * (nx * LX + ny * LY + nz * LZ);
        t -= 0.14 * ((y - top) / span);
        t += (hash(seed + 3, x >> 1, y >> 1) - 0.5) * 0.3 + (hash(seed + 5, x, y) - 0.5) * 0.14;
        if ((y + (seed % 5)) % 6 === 0 && hash(seed + 9, x >> 2, y) < 0.7) t -= 0.17; // strata crack
        put(c, x, y, ramp(base, t));
        light[y * c.w + x] = t;
      }
  }
  return light;
}

function solidAround(c: Canvas, x: number, y: number, r: number): boolean {
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++) if (alphaAt(c, x + dx, y + dy) < 255) return false;
  return true;
}

/** Ore vein clusters; each gets a bright glint pixel at its upper-left. */
function paintVeins(
  c: Canvas,
  look: OreLook,
  light: Float32Array,
  seed: number,
  box: { x0: number; x1: number; y0: number; y1: number },
): { x: number; y: number }[] {
  const rnd = mulberry(seed + 55);
  const ore = rgb(look.ore);
  const accent = rgb(look.accent);
  const glints: { x: number; y: number }[] = [];
  const want = 5 + Math.floor(rnd() * 3);
  for (let tries = 0; tries < 90 && glints.length < want; tries++) {
    const x = Math.round(box.x0 + rnd() * (box.x1 - box.x0));
    const y = Math.round(box.y0 + rnd() * (box.y1 - box.y0));
    if (!solidAround(c, x, y, 2)) continue;
    if (glints.some((g) => Math.abs(g.x - x) + Math.abs(g.y - y) < 7)) continue;
    let px = x;
    let py = y;
    const n = 4 + Math.floor(rnd() * 5);
    const cells: { x: number; y: number }[] = [];
    for (let k = 0; k < n; k++) {
      if (alphaAt(c, px, py) === 255 && solidAround(c, px, py, 1)) cells.push({ x: px, y: py });
      px += Math.floor(rnd() * 3) - 1;
      py += rnd() < 0.5 ? 0 : 1;
    }
    if (cells.length < 3) continue;
    for (const p of cells) {
      const t = (light[p.y * c.w + p.x] ?? 0.5) + 0.12;
      put(c, p.x, p.y, ramp(ore, t));
      if (alphaAt(c, p.x + 1, p.y) === 255 && hash(seed + 63, p.x, p.y) < 0.7)
        put(c, p.x + 1, p.y, ramp(ore, t - 0.12));
      if (alphaAt(c, p.x, p.y + 1) === 255 && hash(seed + 64, p.x, p.y) < 0.5)
        put(c, p.x, p.y + 1, ramp(ore, t - 0.25));
      if (hash(seed + 61, p.x, p.y) < 0.22) put(c, p.x + 1, p.y, ramp(accent, t - 0.05));
    }
    const first = cells.reduce((a, b) => (b.x + b.y < a.x + a.y ? b : a));
    put(c, first.x, first.y, [
      ore[0] * 0.45 + 140,
      ore[1] * 0.45 + 140,
      ore[2] * 0.45 + 140,
    ] as Rgb);
    glints.push(first);
  }
  return glints;
}

function lumpsFor(seed: number): Lump[] {
  const r = mulberry(seed);
  const j = (): number => (r() - 0.5) * 3;
  const fx = ROCK_FEET_X;
  const fy = ROCK_FEET_Y;
  return [
    { cx: fx + j(), cy: fy - 13 + j(), rx: 13 + r() * 2, ry: 13 + r() * 1.5 },
    { cx: fx - 10 + j(), cy: fy - 6 + j(), rx: 8 + r() * 2, ry: 6 + r() },
    { cx: fx + 11 + j(), cy: fy - 7 + j(), rx: 7.5 + r() * 1.5, ry: 6 + r() },
    { cx: fx + 3 + j(), cy: fy - 21 + j(), rx: 7 + r() * 2, ry: 6 + r() },
  ];
}

function paintRubble(c: Canvas, base: Rgb, seed: number): void {
  const r = mulberry(seed + 400);
  const lumps: Lump[] = [];
  const spots: [number, number][] = [
    [-9, -3],
    [-1, -4],
    [8, -3],
    [-4, -7],
    [4, -8],
    [12, -1],
  ];
  for (const [ox, oy] of spots)
    lumps.push({
      cx: ROCK_FEET_X + ox + (r() - 0.5) * 3,
      cy: ROCK_FEET_Y + oy + (r() - 0.5) * 2,
      rx: 3.5 + r() * 3,
      ry: 2.5 + r() * 1.8,
    });
  const dark: Rgb = [base[0] * 0.82, base[1] * 0.82, base[2] * 0.85];
  paintLumps(c, dark, seed + 401, lumps);
  // a few loose chips on the ground
  for (let i = 0; i < 5; i++) {
    const x = ROCK_FEET_X - 16 + Math.floor(r() * 32);
    const y = ROCK_FEET_Y + Math.floor(r() * 4);
    if (alphaAt(c, x, y) === 0) put(c, x, y, ramp(dark, 0.3 + r() * 0.4));
  }
}

/** Paint one rock (or its depleted rubble) as RGBA bytes, ROCK_TEX_W x ROCK_TEX_H, row-major. */
export function paintRockPixels(kind: RockArtKind, variant: number, depleted: boolean): RockPixels {
  const look = ROCK_LOOKS[kind];
  const kindSeed =
    kind === 'copper_rock' ? 11 : kind === 'tin_rock' ? 22 : kind === 'iron_rock' ? 33 : 44;
  const seed = kindSeed * 1009 + variant * 7919;
  const rnd = mulberry(seed + 1);
  const stone = rgb(look.stone);
  const v = 0.92 + rnd() * 0.16;
  const base: Rgb = [stone[0] * v, stone[1] * v, stone[2] * v];
  const c = newCanvas(ROCK_TEX_W, ROCK_TEX_H);
  paintShadow(c, depleted ? 17 : 21, depleted ? 5 : 7);
  let glints: { x: number; y: number }[] = [];
  if (depleted) {
    paintRubble(c, base, seed);
  } else {
    const light = paintLumps(c, base, seed, lumpsFor(seed));
    glints = paintVeins(c, look, light, seed, {
      x0: ROCK_FEET_X - 14,
      x1: ROCK_FEET_X + 15,
      y0: ROCK_FEET_Y - 26,
      y1: ROCK_FEET_Y - 3,
    });
  }
  paintRim(c);
  return { data: c.data, glints };
}
