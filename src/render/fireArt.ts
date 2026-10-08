/**
 * Pure painters (RGBA, no Phaser/DOM) for the campfire: char ring + stacked logs, the three flame
 * layers (outer orange, inner yellow, white-hot core), the additive ground glow, dying embers and
 * the ash heap left behind. Everything is drawn at final pixel size (the world is 64x32 tiles).
 * Every frame of one fire shares the FEET anchor (the tile middle) so the views just stack them.
 */
import { clamp, hash, mulberry, newCanvas, paintRim, ramp, rgb } from './pixelArt';
import type { Canvas, Rgb } from './pixelArt';

/** Base/front/embers frame: 56x40, feet (the tile middle) at (28, 26). */
export const FIRE_FRAME = { w: 56, h: 40, feetX: 28, feetY: 26 } as const;
/** Flame frame: 44x56, flame root (where all layers grow from) at (22, 52). */
export const FLAME_FRAME = { w: 44, h: 56, rootX: 22, rootY: 52 } as const;
/** The flame root sits this many px above the feet (inside the log pile). */
export const FLAME_ROOT_UP = 3;
/** Ground glow frame, centred on the feet. */
export const GLOW_FRAME = { w: 112, h: 56 } as const;
/** Ash heap frame: 48x28, centre (24, 15). */
export const ASHES_FRAME = { w: 48, h: 28, cx: 24, cy: 15 } as const;
/** Drawn extent above the feet / half width, for the pointer hit box. */
export const FIRE_TOP = 42;
export const FIRE_HALF_W = 24;

export type FlameLayer = 'outer' | 'inner' | 'core';
export const FLAME_LAYERS: readonly FlameLayer[] = ['outer', 'inner', 'core'];

const smooth = (a: number, b: number, v: number): number => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Straight-alpha "over" composite of one pixel. */
function over(c: Canvas, x: number, y: number, col: Rgb, a: number): void {
  if (x < 0 || y < 0 || x >= c.w || y >= c.h || a <= 0) return;
  const i = (y * c.w + x) * 4;
  const ea = ((c.data[i + 3] ?? 0) / 255) * (1 - a);
  const oa = a + ea;
  for (let k = 0; k < 3; k++) c.data[i + k] = ((col[k] ?? 0) * a + (c.data[i + k] ?? 0) * ea) / oa;
  c.data[i + 3] = oa * 255;
}

const BARK = rgb(0x86592f);
/** How a log is painted: bark colour and how much fire light falls on it (0 = a cold, unlit pile). */
export interface LogStyle {
  bark: Rgb;
  heat: number;
}
const FIRE_LOG_STYLE: LogStyle = { bark: BARK, heat: 1 };
const WOOD_END = [rgb(0x7a4e26), rgb(0xd0a468), rgb(0xf0d498)] as const;
const mixc = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

interface Log {
  /** End points relative to the feet. */
  a: readonly [number, number];
  b: readonly [number, number];
  r: number;
}

const BACK_LOGS: readonly Log[] = [
  { a: [-17, -7], b: [16, 8], r: 3.7 },
  { a: [-16, 8], b: [17, -7], r: 3.7 },
  { a: [-13, 1], b: [14, 2], r: 3.3 },
];
const FRONT_LOGS: readonly Log[] = [{ a: [-9, 8], b: [8, 9], r: 2.9 }];

/** One round log lit from the upper left, with bark streaks, an end-grain cap, fire-lit edges and char. */
function paintLog(
  c: Canvas,
  lg: Log,
  lift: number,
  seed: number,
  char: number,
  dying: boolean,
  style: LogStyle = FIRE_LOG_STYLE,
): void {
  const ax = FIRE_FRAME.feetX + lg.a[0];
  const ay = FIRE_FRAME.feetY + lg.a[1] - lift;
  const bx = FIRE_FRAME.feetX + lg.b[0];
  const by = FIRE_FRAME.feetY + lg.b[1] - lift;
  const len = Math.hypot(bx - ax, by - ay);
  const ux = (bx - ax) / len;
  const uy = (by - ay) / len;
  // the end nearest the camera (larger y) shows its end grain
  const front = by > ay ? 1 : 0;
  const ex = front ? bx : ax;
  const ey = front ? by : ay;
  for (let y = 0; y < c.h; y++)
    for (let x = 0; x < c.w; x++) {
      const px = x + 0.5 - ax;
      const py = y + 0.5 - ay;
      const u = px * ux + py * uy;
      const v = -px * uy + py * ux;
      const t = v / lg.r;
      let col: Rgb | undefined;
      const endD = Math.hypot((x + 0.5 - ex) / (lg.r * 0.8), (y + 0.5 - ey) / lg.r);
      if (endD <= 1) {
        const ring = 0.5 + 0.5 * Math.cos(endD * 4.2 * Math.PI);
        col = mixc(WOOD_END[0], WOOD_END[1], 0.2 + 0.8 * ring);
        if (endD < 0.16) col = WOOD_END[0];
        col = mixc(col, rgb(0x14100c), char * 0.75);
      } else if (u >= -0.5 && u <= len + 0.5 && Math.abs(t) <= 1) {
        const nz = Math.sqrt(Math.max(0, 1 - t * t));
        const side = -uy * -0.6 + ux * -0.8; // light from the upper left
        let lum = 0.3 + 0.4 * nz - 0.3 * t * Math.sign(side || 1);
        lum += (hash(seed, Math.floor(u / 4), Math.floor((v + 4) * 0.8)) - 0.5) * 0.3;
        if (hash(seed + 1, Math.floor(u / 2), Math.floor(v)) > 0.9) lum -= 0.2; // bark cracks
        col = ramp(style.bark, lum);
        col = mixc(col, rgb(0x16110d), clamp(char * (0.35 + hash(seed + 2, x, y) * 0.6), 0, 1));
      }
      if (!col) continue;
      // fire-lit: surfaces close to the fire's heart glow orange, more so on the upper side
      const heat = clamp(
        1 - Math.hypot(x - FIRE_FRAME.feetX, (y - FIRE_FRAME.feetY + 4) * 2) / 11,
        0,
        1,
      );
      const hot = heat * style.heat * (dying ? 0.5 : 0.55) * (0.55 + 0.45 * hash(seed + 3, x, y));
      col = mixc(col, rgb(dying ? 0xff5a1c : 0xff8a28), hot);
      c.data.set([col[0], col[1], col[2], 255], (y * c.w + x) * 4);
    }
}

function paintLogs(
  logs: readonly Log[],
  lifts: readonly number[],
  seed: number,
  char: number,
  dying: boolean,
  style: LogStyle = FIRE_LOG_STYLE,
): Canvas {
  const c = newCanvas(FIRE_FRAME.w, FIRE_FRAME.h);
  logs.forEach((lg, i) => paintLog(c, lg, lifts[i] ?? 0, seed + i * 11, char, dying, style));
  paintRim(c);
  return c;
}

/** Bark colour per log item id (data, not branches). Unknown ids use `logs`. */
export const LOG_PILE_BARK: Readonly<Record<string, number>> = {
  logs: 0x86592f,
  oak_logs: 0x6b3f22,
};
export const LOG_PILE_DEFAULT = 'logs';

/**
 * The unlit pile a player kneels over before the fire catches: the SAME three back logs as the fire
 * (same geometry, seed, end grain) on a faint shadow, no soot, char or fire light. Same frame/feet as the fire base.
 */
export function paintLogPile(logsId: string): Uint8ClampedArray {
  const c = newCanvas(FIRE_FRAME.w, FIRE_FRAME.h);
  for (let y = 0; y < c.h; y++)
    for (let x = 0; x < c.w; x++) {
      const q = Math.hypot((x + 0.5 - FIRE_FRAME.feetX) / 20, (y + 0.5 - FIRE_FRAME.feetY - 1) / 9);
      if (q < 1) over(c, x, y, rgb(0x120d09), (1 - q) * 0.4 * (0.7 + 0.3 * hash(5, x, y)));
    }
  const bark = rgb(LOG_PILE_BARK[logsId] ?? LOG_PILE_BARK[LOG_PILE_DEFAULT]!);
  const logs = paintLogs(BACK_LOGS, [0, 0, 4.5], 31, 0, false, { bark, heat: 0 });
  for (let i = 0; i < logs.data.length; i += 4) {
    const a = (logs.data[i + 3] ?? 0) / 255;
    if (a > 0)
      over(
        c,
        (i / 4) % c.w,
        Math.floor(i / 4 / c.w),
        [logs.data[i] ?? 0, logs.data[i + 1] ?? 0, logs.data[i + 2] ?? 0],
        a,
      );
  }
  return c.data;
}

/** The soot ring and the pile of logs behind the flames (opaque, lit by the fire). */
export function paintFireBase(dying: boolean): Uint8ClampedArray {
  const c = newCanvas(FIRE_FRAME.w, FIRE_FRAME.h);
  for (let y = 0; y < c.h; y++)
    for (let x = 0; x < c.w; x++) {
      const q = Math.hypot((x + 0.5 - FIRE_FRAME.feetX) / 23, (y + 0.5 - FIRE_FRAME.feetY) / 11.5);
      if (q > 1.12) continue;
      const n = hash(5, x, y);
      const a = (1 - smooth(0.35, 1.12, q)) * (0.72 + 0.28 * n) * 1.0;
      over(c, x, y, mixc(rgb(0x120d09), rgb(0x261a12), n), a);
      // scorched, rust-red ground close to the fire
      if (q < 0.6) over(c, x, y, rgb(0x7a2a10), (0.6 - q) * 0.3 * n);
    }
  if (dying) {
    // a bed of red-hot coals between the logs
    for (let y = 0; y < c.h; y++)
      for (let x = 0; x < c.w; x++) {
        const q = Math.hypot((x + 0.5 - FIRE_FRAME.feetX) / 12, (y + 0.5 - FIRE_FRAME.feetY) / 5.5);
        if (q > 1) continue;
        const n = hash(8, x >> 1, y);
        over(c, x, y, n > 0.55 ? rgb(0xe8481a) : rgb(0x5a1a0c), 0.85 * (1 - q * q));
      }
  }
  const logs = paintLogs(BACK_LOGS, [0, 0, 4.5], 31, dying ? 0.75 : 0.35, dying);
  for (let i = 0; i < logs.data.length; i += 4) {
    const a = (logs.data[i + 3] ?? 0) / 255;
    if (a > 0)
      over(
        c,
        (i / 4) % c.w,
        Math.floor(i / 4 / c.w),
        [logs.data[i] ?? 0, logs.data[i + 1] ?? 0, logs.data[i + 2] ?? 0],
        a,
      );
  }
  return c.data;
}

/** One short log lying in front of the flame roots (drawn above the flame layers). */
export function paintFireFront(dying: boolean): Uint8ClampedArray {
  return paintLogs(FRONT_LOGS, [0], 77, dying ? 0.75 : 0.4, dying).data;
}

interface Tongue {
  dx: number;
  h: number;
  w: number;
  lean: number;
}
const TONGUES: readonly Tongue[] = [
  { dx: -9, h: 23, w: 7, lean: -3.5 },
  { dx: 0, h: 38, w: 10.5, lean: 2 },
  { dx: 9, h: 28, w: 7.5, lean: 4.5 },
  { dx: -3.5, h: 30, w: 6, lean: -1.5 },
];
const LAYER_LOOK: Record<FlameLayer, { k: number; wk: number; cols: Rgb[]; alpha: number }> = {
  outer: {
    k: 1,
    wk: 1,
    cols: [rgb(0xc8280a), rgb(0xff6a14), rgb(0xffa83a), rgb(0xffcf6a)],
    alpha: 0.92,
  },
  inner: {
    k: 0.68,
    wk: 0.66,
    cols: [rgb(0xff9a1c), rgb(0xffcb30), rgb(0xffe566), rgb(0xfff2a0)],
    alpha: 0.96,
  },
  core: {
    k: 0.34,
    wk: 0.4,
    cols: [rgb(0xffe27a), rgb(0xfff4b8), rgb(0xffffe8), rgb(0xffffff)],
    alpha: 1,
  },
};

/** One flame layer, drawn so all three share the root point; scale each from `FLAME_FRAME.rootX/rootY`. */
export function paintFlameLayer(layer: FlameLayer): Uint8ClampedArray {
  const { k, wk, cols, alpha } = LAYER_LOOK[layer];
  const c = newCanvas(FLAME_FRAME.w, FLAME_FRAME.h);
  const seed = layer === 'outer' ? 3 : layer === 'inner' ? 4 : 5;
  for (let y = 0; y < c.h; y++)
    for (let x = 0; x < c.w; x++) {
      let best = 0;
      let bt = 0;
      for (const tg of TONGUES) {
        if (layer === 'core' && tg.dx !== 0) continue;
        const h = tg.h * k;
        const t = (FLAME_FRAME.rootY - (y + 0.5)) / h;
        if (t < 0 || t > 1) continue;
        const half = tg.w * wk * Math.pow(1 - t, 0.72) * (0.78 + 0.22 * Math.sin(t * 3.1));
        const mid = FLAME_FRAME.rootX + tg.dx * wk + tg.lean * k * t * t;
        const d = 1 - Math.abs(x + 0.5 - mid) / Math.max(half, 0.5);
        if (d <= 0) continue;
        const ragged = 0.82 + 0.3 * hash(seed, x, y);
        const a = smooth(0, 0.65, d) * (1 - Math.pow(t, 3.2)) * ragged;
        if (a > best) [best, bt] = [a, t];
      }
      if (best < 0.04) continue;
      const col = ramp0(cols, 1 - bt * 0.9);
      c.data.set([col[0], col[1], col[2], clamp(best * alpha, 0, 1) * 255], (y * c.w + x) * 4);
    }
  return c.data;
}

/** Linear ramp over a colour list, t 0..1 (0 = first). Flame colour runs from the root (bright) to the tip (cooler). */
function ramp0(cols: Rgb[], t: number): Rgb {
  const f = clamp(t, 0, 1) * (cols.length - 1);
  const i = Math.min(Math.floor(f), cols.length - 2);
  return mixc(cols[i] ?? cols[0]!, cols[i + 1] ?? cols[0]!, f - i);
}

/** Soft warm ellipse of light on the ground; shown with an ADD blend. */
export function paintFireGlow(): Uint8ClampedArray {
  const c = newCanvas(GLOW_FRAME.w, GLOW_FRAME.h);
  for (let y = 0; y < c.h; y++)
    for (let x = 0; x < c.w; x++) {
      const q = Math.hypot((x + 0.5 - c.w / 2) / (c.w / 2), (y + 0.5 - c.h / 2) / (c.h / 2));
      if (q >= 1) continue;
      const f = Math.pow(1 - q, 2.1);
      c.data.set([255, 150 + 40 * (1 - q), 60 + 30 * (1 - q), f * 150], (y * c.w + x) * 4);
    }
  return c.data;
}

/** Glowing embers scattered over the dying pile (ADD blend), same frame as the base. */
export function paintFireEmbers(): Uint8ClampedArray {
  const c = newCanvas(FIRE_FRAME.w, FIRE_FRAME.h);
  const rnd = mulberry(404);
  for (let i = 0; i < 14; i++) {
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd());
    const x = Math.round(FIRE_FRAME.feetX + Math.cos(a) * r * 16);
    const y = Math.round(FIRE_FRAME.feetY - 2 + Math.sin(a) * r * 6);
    const bright = rnd() > 0.65;
    const core = bright ? rgb(0xffc060) : rgb(0xff6a24);
    over(c, x, y, core, 0.95);
    over(c, x + 1, y, core, 0.7);
    for (const [dx, dy] of [
      [-1, 0],
      [2, 0],
      [0, -1],
      [0, 1],
      [1, 1],
    ] as const)
      over(c, x + dx, y + dy, rgb(0xff3c10), 0.28);
  }
  return c.data;
}

/** The small grey-white heap a burnt-out fire leaves: flat on the tile, specks and a few charcoal lumps. */
export function paintAshesHeap(): Uint8ClampedArray {
  const { w, h, cx, cy } = ASHES_FRAME;
  const c = newCanvas(w, h);
  const base = rgb(0xb4b4b0);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const dx = (x + 0.5 - cx) / 13.5;
      const dy = (y + 0.5 - cy) / 6.8;
      const q = Math.hypot(dx, dy);
      const edge = 1 + 0.16 * Math.sin(dx * 6 + 1) + (hash(9, x, y) - 0.5) * 0.14;
      if (q > edge + 0.25) continue;
      if (q > edge) {
        over(c, x, y, rgb(0x8c8c88), (1 - (q - edge) / 0.25) * 0.35 * hash(10, x, y)); // wind-blown dust
        continue;
      }
      const hgt = Math.sqrt(Math.max(0, 1 - (q / edge) ** 2));
      const lum = 0.28 + 0.42 * hgt - 0.3 * dy * 0.6 - 0.12 * dx + (hash(11, x, y) - 0.5) * 0.18;
      let col = ramp(base, lum);
      const n = hash(12, x, y);
      if (n > 0.93)
        col = mixc(rgb(0x2a2a2c), rgb(0x4a4a4e), hash(13, x, y)); // dark specks
      else if (n < 0.05) col = rgb(0xf4f4f0);
      c.data.set([col[0], col[1], col[2], 255], (y * w + x) * 4);
    }
  for (const [lx, ly, lw] of [
    [18, 12, 3],
    [28, 16, 3],
    [23, 10, 2],
  ] as const)
    for (let j = 0; j < 2; j++)
      for (let i = 0; i < lw; i++)
        c.data.set(
          [...((i + j) % 2 ? rgb(0x2c2c32) : rgb(0x16161a)), 255],
          ((ly + j) * w + lx + i) * 4,
        );
  paintRim(c);
  return c.data;
}
