/**
 * Shared pure helpers for the procedural pixel painters (trees, rocks, fishing spots): a tiny RGBA
 * canvas, seeded hashes, the 6-band light ramp and the silhouette rim. No Phaser, no DOM.
 */

export type Rgb = readonly [number, number, number];

export interface Canvas {
  readonly data: Uint8ClampedArray;
  readonly w: number;
  readonly h: number;
}

export const rgb = (c: number): Rgb => [(c >> 16) & 255, (c >> 8) & 255, c & 255];

export const clamp = (v: number, lo = 0, hi = 255): number => Math.max(lo, Math.min(hi, v));

export function newCanvas(w: number, h: number): Canvas {
  return { data: new Uint8ClampedArray(w * h * 4), w, h };
}

export function hash(seed: number, x: number, y: number): number {
  let h =
    Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function put(c: Canvas, x: number, y: number, col: Rgb, a = 255): void {
  if (x < 0 || y < 0 || x >= c.w || y >= c.h) return;
  const i = (y * c.w + x) * 4;
  c.data[i] = clamp(col[0]);
  c.data[i + 1] = clamp(col[1]);
  c.data[i + 2] = clamp(col[2]);
  c.data[i + 3] = a;
}

export function alphaAt(c: Canvas, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= c.w || y >= c.h) return 0;
  return c.data[(y * c.w + x) * 4 + 3] ?? 0;
}

/** Map light amount t (0 dark .. 1 bright) onto a colour: cool dark shadow, base, warm highlight. */
export function ramp(base: Rgb, t: number): Rgb {
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

/** Darken silhouette pixels (stronger on the lower/right, lit-away side); runs over a finished sprite. */
export function paintRim(c: Canvas): void {
  const snap = Uint8ClampedArray.from(c.data);
  const had = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < c.w && y < c.h && (snap[(y * c.w + x) * 4 + 3] ?? 0) > 200;
  for (let y = 0; y < c.h; y++)
    for (let x = 0; x < c.w; x++) {
      if (!had(x, y)) continue;
      const lowRight = !had(x, y + 1) || !had(x + 1, y);
      const upLeft = !had(x - 1, y) || !had(x, y - 1);
      if (!lowRight && !upLeft) continue;
      const k = lowRight ? 0.62 : 0.86;
      const i = (y * c.w + x) * 4;
      for (let j = 0; j < 3; j++) c.data[i + j] = (c.data[i + j] ?? 0) * k;
    }
}
