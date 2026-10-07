/**
 * Procedural tree pixel art: original, seeded and deterministic, drawn at FINAL resolution (the
 * 1.5x world scale is baked in, so the texture is shown at scale 1 with nearest filtering and its
 * texels match the ground's). The painter is pure (no Phaser, no canvas): it returns RGBA bytes, so
 * it is testable and previewable anywhere. `treeTextures.ts` uploads one texture per
 * (kind, variant, stump) once.
 *
 * Look: a trunk with bark streaks and a root flare, a layered canopy of overlapping lobes lit from
 * the top-left (dark underside, leaf-clump texture, darker gaps between lobes) and a soft contact
 * shadow thrown to the lower right. Every canopy lobe lies inside the circle the tap hit-box
 * (`VIEW_HIT_BOUNDS`) is derived from, so art never exceeds what a tap covers.
 */

export type TreeArtKind = 'tree' | 'oak_tree';

/** Texture size in px and the feet anchor (where the trunk meets the ground). */
export const TREE_TEX_W = 72;
export const TREE_TEX_H = 84;
export const TREE_FEET_X = 36;
export const TREE_FEET_Y = 66;

/** Variants per kind; the tile hash picks one. */
export const TREE_VARIANTS = 8;

/** Geometry shared with the hit bounds (final px: art units x 1.5). */
export interface TreeShape {
  /** Canopy circle centre, px above the feet, and its radius. */
  canopyUp: number;
  canopyRadius: number;
  /** Trunk half width at mid height. */
  trunkHalf: number;
  /** Base canopy colour (0xRRGGBB) and trunk colour. */
  leaf: number;
  trunk: number;
}

type Rgb = readonly [number, number, number];

const rgb = (c: number): Rgb => [(c >> 16) & 255, (c >> 8) & 255, c & 255];

function hash(seed: number, x: number, y: number): number {
  let h =
    Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Deterministic variant 0..TREE_VARIANTS-1 for a tile (so a tree always looks the same). */
export function treeVariantFor(tx: number, ty: number): number {
  return Math.floor(hash(0x7ee, tx, ty) * TREE_VARIANTS);
}

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, lo = 0, hi = 255): number => Math.max(lo, Math.min(hi, v));

interface Blob {
  cx: number;
  cy: number;
  r: number;
  /** Vertical squash 0.8-1 (ry = r * squash); never wider than r so lobes stay in the hit circle. */
  squash: number;
}

interface Canvas {
  data: Uint8ClampedArray;
}

function put(c: Canvas, x: number, y: number, col: Rgb, a = 255): void {
  if (x < 0 || y < 0 || x >= TREE_TEX_W || y >= TREE_TEX_H) return;
  const i = (y * TREE_TEX_W + x) * 4;
  c.data[i] = clamp(col[0]);
  c.data[i + 1] = clamp(col[1]);
  c.data[i + 2] = clamp(col[2]);
  c.data[i + 3] = a;
}

function alphaAt(c: Canvas, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= TREE_TEX_W || y >= TREE_TEX_H) return 0;
  return c.data[(y * TREE_TEX_W + x) * 4 + 3] ?? 0;
}

/** Map light amount t (0 dark .. 1 bright) onto a colour: cool dark shadow, base, warm highlight. */
function ramp(base: Rgb, t: number): Rgb {
  const q = Math.round(clamp(t, 0, 1) * 5) / 5; // 6 pixel-art bands
  if (q < 0.5) {
    const k = q / 0.5; // 0 = deepest shadow
    return [
      base[0] * (0.32 + 0.68 * k) + 6 * (1 - k),
      base[1] * (0.36 + 0.64 * k) + 8 * (1 - k),
      base[2] * (0.4 + 0.6 * k) + 22 * (1 - k),
    ];
  }
  const k = (q - 0.5) / 0.5; // 1 = brightest
  return [
    base[0] * (1 + 0.38 * k) + 18 * k,
    base[1] * (1 + 0.26 * k) + 14 * k,
    base[2] * (1 + 0.05 * k) - 6 * k,
  ];
}

// light from the top-left, toward the viewer
const LX = -0.55;
const LY = -0.65;
const LZ = 0.52;

function paintShadow(c: Canvas, rx: number, ry: number): void {
  const cx = TREE_FEET_X + 3;
  const cy = TREE_FEET_Y + 1;
  for (let y = cy - ry - 1; y <= cy + ry + 1; y++)
    for (let x = cx - rx - 1; x <= cx + rx + 1; x++) {
      const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      if (d >= 1) continue;
      const level = Math.ceil((1 - d) * 4) / 4; // 4 soft bands
      put(c, x, y, [8, 14, 6], Math.round(120 * level));
    }
}

function paintCanopy(c: Canvas, shape: TreeShape, seed: number, rnd: () => number): void {
  const R = shape.canopyRadius;
  const cx0 = TREE_FEET_X;
  const cy0 = TREE_FEET_Y - shape.canopyUp;
  const hueShift = (rnd() - 0.5) * 0.26; // yellower (+) / bluer (-)
  const value = 0.9 + rnd() * 0.22;
  const l = rgb(shape.leaf);
  const base: Rgb = [
    l[0] * value * (1 + hueShift),
    l[1] * value * (1 + hueShift * 0.15),
    l[2] * value * (1 - hueShift * 0.9),
  ];
  const size = 0.84 + rnd() * 0.16; // never larger than the hit circle
  const Rv = R * size;
  const squash = 0.82 + rnd() * 0.18;
  // lobes: a big centre one plus 4-6 around, each tucked inside the circle, ordered top to bottom
  const blobs: Blob[] = [{ cx: cx0, cy: cy0 + Rv * 0.05, r: Rv * (0.64 + rnd() * 0.1), squash }];
  const n = 4 + Math.floor(rnd() * 3);
  const spin = rnd() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const ang = spin + (i / n) * Math.PI * 2 + (rnd() - 0.5) * 0.7;
    const r = Rv * (0.42 + rnd() * 0.16);
    const dist = (Rv - r) * (0.9 + rnd() * 0.1);
    blobs.push({
      cx: cx0 + Math.cos(ang) * dist,
      cy: cy0 + Math.sin(ang) * dist * squash,
      r,
      squash,
    });
  }
  blobs.sort((a, b) => a.cy - b.cy);
  const top = cy0 - Rv * squash;
  const span = 2 * Rv * squash;
  for (let bi = 0; bi < blobs.length; bi++) {
    const b = blobs[bi];
    if (!b) continue;
    const ry = b.r * b.squash;
    const x0 = Math.floor(b.cx - b.r - 3);
    const x1 = Math.ceil(b.cx + b.r + 3);
    const y0 = Math.floor(b.cy - ry - 3);
    const y1 = Math.ceil(b.cy + ry + 3);
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const dx = (x + 0.5 - b.cx) / b.r;
        const dy = (y + 0.5 - b.cy) / ry;
        const d2 = dx * dx + dy * dy;
        if (d2 > 1) {
          // gap shadow: the lobe behind it darkens where this one overlaps it from above/left
          if (d2 < 1.45 && dy > -0.3 && alphaAt(c, x, y) > 0) {
            const i = (y * TREE_TEX_W + x) * 4;
            for (let k = 0; k < 3; k++) c.data[i + k] = (c.data[i + k] ?? 0) * 0.8;
          }
          continue;
        }
        const edge = Math.sqrt(d2);
        // ragged silhouette: drop some rim pixels
        if (edge > 0.86 && hash(seed + 11, x, y) < (edge - 0.86) * 4.2) continue;
        const nz = Math.sqrt(Math.max(0, 1 - d2));
        let t = 0.5 + 0.62 * (dx * LX + dy * LY + nz * LZ);
        t -= 0.22 * ((y - top) / span); // darker toward the underside
        const clump = hash(seed + 3, Math.floor(x / 3), Math.floor(y / 3)) - 0.5;
        const speck = hash(seed + 5, x, y) - 0.5;
        t += clump * 0.42 + speck * 0.28;
        // clump highlight: top-left texel of each 3x3 leaf cluster is brighter
        if ((x % 3 === 0 || y % 3 === 0) && clump > 0) t += 0.1;
        put(c, x, y, ramp(base, t));
      }
  }
}

/** Darken silhouette pixels (stronger on the lower/right, lit-away side); runs over the finished tree or stump. */
function paintRim(c: Canvas): void {
  const snap = Uint8ClampedArray.from(c.data);
  const had = (x: number, y: number): boolean =>
    x >= 0 &&
    y >= 0 &&
    x < TREE_TEX_W &&
    y < TREE_TEX_H &&
    (snap[(y * TREE_TEX_W + x) * 4 + 3] ?? 0) > 200;
  for (let y = 0; y < TREE_TEX_H; y++)
    for (let x = 0; x < TREE_TEX_W; x++) {
      if (!had(x, y)) continue;
      const lowRight = !had(x, y + 1) || !had(x + 1, y);
      const upLeft = !had(x - 1, y) || !had(x, y - 1);
      if (!lowRight && !upLeft) continue;
      const k = lowRight ? 0.62 : 0.86;
      const i = (y * TREE_TEX_W + x) * 4;
      for (let j = 0; j < 3; j++) c.data[i + j] = (c.data[i + j] ?? 0) * k;
    }
}

/** Width at row `y` of a trunk with a root flare; `up` = px above the feet. */
function trunkHalfAt(half: number, up: number, flare: number): number {
  const flareH = 7;
  const k = Math.max(0, (flareH - up) / flareH);
  return half + flare * k * k;
}

function paintTrunk(
  c: Canvas,
  shape: TreeShape,
  seed: number,
  height: number,
  flare: number,
  shaded: boolean,
): void {
  const bark = rgb(shape.trunk);
  // own stream so a variant's stump has exactly the trunk the full tree has
  const own = mulberry(seed + 99);
  const lean = Math.round((own() - 0.5) * 2);
  const half = shape.trunkHalf * (0.9 + own() * 0.2);
  for (let up = 0; up < height; up++) {
    const y = TREE_FEET_Y - 1 - up;
    const cx = TREE_FEET_X + (up > height * 0.55 ? lean : 0);
    const hw = trunkHalfAt(half, up, flare);
    const x0 = Math.round(cx - hw);
    const x1 = Math.round(cx + hw);
    for (let x = x0; x <= x1; x++) {
      const u = (x - x0) / Math.max(1, x1 - x0); // 0 left (lit) .. 1 right (shade)
      let t = 0.78 - 0.55 * u;
      const streak = hash(seed + 21, x, 0) - 0.5;
      const knot = hash(seed + 23, x, Math.floor(up / 3)) < 0.22 ? -0.2 : 0;
      t += streak * 0.3 + knot + (hash(seed + 25, x, y) - 0.5) * 0.16;
      if (up % 6 === 4 && hash(seed + 27, x, up) < 0.45) t -= 0.18; // faint cracks
      if (shaded && up > height - 7) t -= 0.3; // canopy shadow on the upper trunk
      put(c, x, y, ramp(bark, t));
    }
  }
  // root stubs either side of the base
  const rootL = Math.round(TREE_FEET_X - trunkHalfAt(half, 0, flare));
  const rootR = Math.round(TREE_FEET_X + trunkHalfAt(half, 0, flare));
  for (const [x, dir] of [
    [rootL, -1],
    [rootR, 1],
  ] as const) {
    put(c, x + dir, TREE_FEET_Y - 1, ramp(bark, dir < 0 ? 0.5 : 0.22));
    put(c, x + dir * 2, TREE_FEET_Y, ramp(bark, dir < 0 ? 0.4 : 0.15));
    put(c, x + dir, TREE_FEET_Y, ramp(bark, 0.18));
  }
  // dark ground line under the trunk
  for (let x = rootL; x <= rootR; x++) put(c, x, TREE_FEET_Y, ramp(bark, 0.12));
}

function paintStump(c: Canvas, shape: TreeShape, seed: number): void {
  const bark = rgb(shape.trunk);
  const half = Math.round(shape.trunkHalf);
  const height = 9;
  paintTrunk(c, shape, seed, height, 4, false);
  // cut top: lit wood ellipse with growth rings, over the trunk's upper edge
  const cy = TREE_FEET_Y - 1 - height;
  const rx = half + 2;
  const ry = 3;
  const wood: Rgb = [190, 150, 98];
  for (let y = cy - ry; y <= cy + ry; y++)
    for (let x = TREE_FEET_X - rx; x <= TREE_FEET_X + rx; x++) {
      const d = ((x + 0.5 - TREE_FEET_X) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2;
      if (d > 1) continue;
      const ring = Math.floor(Math.sqrt(d) * 3) % 2 === 0 ? 0.8 : 0.58;
      const t = d > 0.78 ? 0.3 : ring;
      put(c, x, y, ramp(wood, t + (hash(seed + 31, x, y) - 0.5) * 0.12));
    }
  put(c, TREE_FEET_X, cy, ramp(bark, 0.2)); // heart
  // a couple of chips on the ground
  put(c, TREE_FEET_X + half + 4, TREE_FEET_Y, ramp(wood, 0.5));
  put(c, TREE_FEET_X - half - 3, TREE_FEET_Y + 1, ramp(wood, 0.35));
}

/** Paint one tree (or its stump) as RGBA bytes, TREE_TEX_W x TREE_TEX_H, row-major. */
export function paintTreePixels(
  shape: TreeShape,
  kind: TreeArtKind,
  variant: number,
  stump: boolean,
): Uint8ClampedArray {
  const c: Canvas = { data: new Uint8ClampedArray(TREE_TEX_W * TREE_TEX_H * 4) };
  const seed = (kind === 'tree' ? 101 : 202) * 1009 + variant * 7919;
  const rnd = mulberry(seed);
  paintShadow(c, stump ? 11 : Math.round(shape.canopyRadius * 0.78), stump ? 4 : 6);
  if (stump) {
    paintStump(c, shape, seed);
  } else {
    const height = Math.round(shape.canopyUp + shape.canopyRadius * 0.25);
    paintTrunk(c, shape, seed, height, 4, true);
    paintCanopy(c, shape, seed, rnd);
  }
  paintRim(c);
  return c.data;
}
