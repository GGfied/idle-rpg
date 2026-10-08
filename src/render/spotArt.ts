/**
 * Fishing-spot pixel art, drawn ON the water tile: a bright churned patch with whitecap foam,
 * expanding ripple rings, plus a per-kind look. Net spot: a WIDE shallow churn with a shoal of small
 * fish flicking and silver glints. Bait spot: a TIGHT dark swirl (rotating arcs), big bubbles and a
 * fish that breaks the surface now and then. Pure RGBA painter, one image per animation frame so the loop is just
 * `frame = floor(phase * SPOT_FRAMES)`. Same final-resolution rules as the trees.
 */
import { hash, newCanvas, put } from './pixelArt';
import type { Canvas, Rgb } from './pixelArt';

export type SpotArtKind = 'net_spot' | 'bait_spot';

export const SPOT_TEX_W = 64;
export const SPOT_TEX_H = 36;
/** Centre of the diamond = the view's feet. */
export const SPOT_CX = 32;
export const SPOT_CY = 18;
/**
 * Frames per loop. The ripple/swirl cycle is RIPPLE_FRAMES long and repeats SPOT_FRAMES / RIPPLE_FRAMES
 * times; the fish swim and the bait fish jump on the full loop (one jump per ~3.4 s, see nodeViews).
 */
export const SPOT_FRAMES = 24;
export const RIPPLE_FRAMES = 6;
/** Minimum fish silhouette length (texture px) and the colours the contrast test checks. */
export const FISH_LEN = 12;
export const FISH_SHADOW = [8, 28, 44] as const;
/** Frame the bait fish leaves the water; it is airborne for LEAP_FRAMES. */
export const LEAP_START = 9;
export const LEAP_FRAMES = 5;

/** Hit extent in ART units (x ART_SCALE for px): the whole water tile diamond is tappable. */
export const SPOT_TOP = 11;
export const SPOT_HALF_W = 21;

const WHITE = [240, 250, 252] as const;
const FOAM = [226, 244, 248] as const;
const CHURN = [150, 222, 222] as const;
const LIGHT_CHURN = [190, 238, 228] as const;
const TURBID = [22, 70, 92] as const;
const SILVER = [255, 255, 255] as const;

function ring(c: Canvas, rx: number, alpha: number, thickness = 1.5): void {
  if (alpha <= 0) return;
  const ry = rx / 2;
  for (let y = Math.floor(SPOT_CY - ry - 2); y <= SPOT_CY + ry + 2; y++)
    for (let x = Math.floor(SPOT_CX - rx - 2); x <= SPOT_CX + rx + 2; x++) {
      const d = Math.sqrt(((x + 0.5 - SPOT_CX) / rx) ** 2 + ((y + 0.5 - SPOT_CY) / ry) ** 2);
      if (Math.abs(d - 1) * rx > thickness) continue;
      // lit on the upper-left arc, thinner on the lower right
      const lit = x + y < SPOT_CX + SPOT_CY ? 1 : 0.65;
      put(c, x, y, WHITE, Math.round(alpha * lit));
    }
}

/** Churned water: a tinted base plus whitecap foam that twinkles with the frame phase. */
function churn(c: Canvas, rx: number, base: Rgb, baseA: number, foamA: number, p: number): void {
  const ry = rx / 2;
  for (let y = Math.floor(SPOT_CY - ry); y <= SPOT_CY + ry; y++)
    for (let x = Math.floor(SPOT_CX - rx); x <= SPOT_CX + rx; x++) {
      const d = ((x + 0.5 - SPOT_CX) / rx) ** 2 + ((y + 0.5 - SPOT_CY) / ry) ** 2;
      if (d >= 1) continue;
      const band = Math.ceil((1 - d) * 3) / 3;
      put(c, x, y, base, Math.round(baseA * band));
      const v = (hash(7, x, y) + p) % 1;
      if (v < 0.22 * (1.2 - d)) put(c, x, y, FOAM, Math.round(foamA * (v < 0.11 ? 1 : 0.6)));
    }
}

function bubble(c: Canvas, x: number, y: number, r: number, a: number): void {
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r + 0.5) continue;
      const rim = dx * dx + dy * dy >= (r - 1) * (r - 1) + 0.5 || r === 1;
      put(c, x + dx, y + dy, WHITE, rim ? a : Math.round(a * 0.4));
    }
  put(c, x - Math.max(0, r - 1), y - Math.max(0, r - 1), SILVER, 255); // highlight
}

/** Two-pixel silver flash of a fish turning in the shallows. */
function glint(c: Canvas, x: number, y: number): void {
  put(c, x, y, SILVER, 255);
  put(c, x + 1, y - 1, SILVER, 200);
  put(c, x - 1, y + 1, SILVER, 200);
}

/**
 * A fish as a thick tapered silhouette, head at (x,y) heading `ang` (screen radians, y down). Rasterised by
 * sampling along the body axis so it reads at any heading; `belly` (optional) lights the lower side.
 */
function fish(
  c: Canvas,
  x: number,
  y: number,
  ang: number,
  len: number,
  body: Rgb,
  a: number,
  belly?: Rgb,
): void {
  const dx = Math.cos(ang);
  const dy = Math.sin(ang);
  const th = len * 0.2;
  for (let u = 0; u <= len; u += 0.5) {
    const s = u / len;
    const hw =
      s < 0.7
        ? th * Math.sqrt(Math.max(0, 1 - ((s - 0.38) / 0.38) ** 2)) + 0.4
        : th * (0.3 + (s - 0.7) * 2.6);
    for (let v = -hw; v <= hw; v += 0.5) {
      const px = Math.round(x - dx * u - dy * v);
      const py = Math.round(y - dy * u + dx * v);
      const low = v * dx > hw * 0.2; // the side facing down the screen
      put(c, px, py, belly && low && s < 0.7 ? belly : body, a);
    }
  }
}

/** Splash: an expanding ring plus drops, t in 0..1. */
function splash(c: Canvas, x: number, y: number, t: number): void {
  const r = 2 + t * 8;
  const al = Math.round(255 * (1 - t) ** 0.7);
  for (let k = 0; k < 28; k++) {
    const a = (k / 28) * Math.PI * 2;
    put(c, Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r * 0.5), WHITE, al);
    if (t < 0.7)
      put(
        c,
        Math.round(x + Math.cos(a) * (r - 1.5)),
        Math.round(y + Math.sin(a) * (r - 1.5) * 0.5),
        WHITE,
        Math.round(al * 0.6),
      );
  }
  const rise = Math.sin(Math.min(1, t * 1.6) * Math.PI) * 6;
  for (const dx of [-4, -2, 0, 3, 5] as const)
    if (t < 0.65) put(c, x + dx, Math.round(y - rise * (1 - Math.abs(dx) * 0.08)), WHITE, al);
}

/** The bait fish arcing out of the swirl and back in, with a splash at each end. f = frames since take-off. */
function leap(c: Canvas, f: number): void {
  const x0 = SPOT_CX - 9;
  const x1 = SPOT_CX + 9;
  if (f >= 0 && f < LEAP_FRAMES) {
    const t = (f + 0.5) / LEAP_FRAMES;
    const x = x0 + (x1 - x0) * t;
    const y = SPOT_CY + 2 - Math.sin(t * Math.PI) * 10;
    const ang = Math.atan2(-Math.cos(t * Math.PI) * 10 * Math.PI, x1 - x0); // tangent of the arc
    const len = FISH_LEN + 2;
    fish(
      c,
      x + Math.cos(ang) * len * 0.5,
      y + Math.sin(ang) * len * 0.5,
      ang,
      len,
      [120, 150, 170],
      255,
      SILVER,
    );
  }
  if (f >= 0 && f < 4) splash(c, x0, SPOT_CY + 2, f / 4);
  if (f >= LEAP_FRAMES - 1 && f < LEAP_FRAMES + 4)
    splash(c, x1, SPOT_CY + 2, (f - LEAP_FRAMES + 1) / 4);
}

/** Net spot: a wide churned teal patch filling the tile, thick foam rings, twinkling whitecaps, a shoal. */
function paintNet(c: Canvas, frame: number, p: number): void {
  churn(c, 25, CHURN, 175, 255, p);
  churn(c, 17, LIGHT_CHURN, 130, 255, p);
  churn(c, 9, TURBID, 95, 0, p);
  // static, broken outer foam ring that shimmers
  for (let y = 4; y < 33; y++)
    for (let x = 4; x < 60; x++) {
      const d = Math.sqrt(((x + 0.5 - SPOT_CX) / 25) ** 2 + ((y + 0.5 - SPOT_CY) / 12.5) ** 2);
      if (Math.abs(d - 0.93) > 0.075) continue;
      if ((hash(11, x, y) + p) % 1 < 0.55) put(c, x, y, WHITE, 235);
    }
  for (const off of [0, 0.5]) {
    const t = (p + off) % 1;
    ring(c, 6 + t * 19, 255 * (1 - t) ** 0.9, 2.3);
  }
  // whitecap flecks (2 px wide), each twinkling on its own cycle
  for (let i = 0; i < 22; i++) {
    const a = i * 2.399;
    const rr = 5 + ((i * 7) % 16);
    const x = Math.round(SPOT_CX + Math.cos(a) * rr);
    const y = Math.round(SPOT_CY + Math.sin(a) * rr * 0.5);
    if ((frame + i) % 3 === 2) continue;
    put(c, x, y, WHITE, 255);
    put(c, x + 1, y, WHITE, 255);
    if ((frame + i) % 3 === 0) put(c, x, y - 1, WHITE, 200);
  }
  // a small school circling slowly on the full loop (swims, never flicks), drawn over the foam
  const pf = frame / SPOT_FRAMES;
  for (let i = 0; i < 3; i++) {
    const a = pf * Math.PI * 2 + (i * Math.PI * 2) / 3;
    const rr = 13 + (i % 2) * 4;
    const px = SPOT_CX + Math.cos(a) * rr;
    const py = SPOT_CY + Math.sin(a) * rr * 0.5;
    // heading = tangent of the ellipse, plus a gentle tail wag
    const ang = Math.atan2(Math.cos(a) * 0.5, -Math.sin(a)) + Math.sin(frame * 1.3 + i) * 0.12;
    fish(
      c,
      px + Math.cos(ang) * 6,
      py + Math.sin(ang) * 6,
      ang,
      FISH_LEN - (i % 2),
      FISH_SHADOW,
      235,
      [96, 150, 170],
    );
  }
  const glints: [number, number][] = [
    [-15, -2],
    [13, -4],
    [-5, 6],
    [16, 3],
    [2, -7],
    [-10, 4],
  ];
  glints.forEach(([dx, dy], i) => {
    if ((frame + i) % 2 === 0) glint(c, SPOT_CX + dx, SPOT_CY + dy);
  });
}

/** Bait spot: a tight dark swirl (rotating arcs), big bubbles, an occasional fish breaking surface. */
function paintBait(c: Canvas, frame: number, p: number): void {
  churn(c, 14, TURBID, 150, 255, p);
  for (const off of [0, 0.5]) {
    const t = (p + off) % 1;
    ring(c, 5 + t * 14, 245 * (1 - t) ** 1.2, 1.7);
  }
  // swirl: three arcs rotating around the core
  for (let k = 0; k < 3; k++)
    for (let s = 0; s < 9; s++) {
      const a = p * Math.PI * 2 + (k * Math.PI * 2) / 3 + s * 0.16;
      const rr = 3 + s * 0.8;
      put(
        c,
        Math.round(SPOT_CX + Math.cos(a) * rr),
        Math.round(SPOT_CY + Math.sin(a) * rr * 0.5),
        WHITE,
        Math.round(250 - s * 18),
      );
    }
  const slots: [number, number, number][] = [
    [-5, 0, 3],
    [4, 0.33, 2],
    [0, 0.66, 3],
    [-8, 0.5, 2],
    [8, 0.85, 2],
  ];
  for (const [dx, phase, r] of slots) {
    const t = (p + phase) % 1;
    const y = Math.round(SPOT_CY + 3 - t * 11);
    bubble(c, SPOT_CX + dx + (t > 0.5 ? 1 : 0), y, r, Math.round(245 * (1 - t * 0.5)));
  }
  // a fish shadow idling round the swirl until it jumps
  const pf = frame / SPOT_FRAMES;
  const a = pf * Math.PI * 2;
  const sx = SPOT_CX + Math.cos(a) * 9;
  const sy = SPOT_CY + 2 + Math.sin(a) * 4.5;
  const ang = Math.atan2(Math.cos(a) * 0.5, -Math.sin(a));
  fish(
    c,
    sx + Math.cos(ang) * 6,
    sy + Math.sin(ang) * 6,
    ang,
    FISH_LEN,
    FISH_SHADOW,
    235,
    [96, 150, 170],
  );
  leap(c, frame - LEAP_START);
}

/** Paint one frame (0..SPOT_FRAMES-1) of a spot as RGBA bytes, SPOT_TEX_W x SPOT_TEX_H. */
export function paintSpotPixels(kind: SpotArtKind, frame: number): Uint8ClampedArray {
  const c = newCanvas(SPOT_TEX_W, SPOT_TEX_H);
  const f = ((frame % SPOT_FRAMES) + SPOT_FRAMES) % SPOT_FRAMES;
  const p = (f % RIPPLE_FRAMES) / RIPPLE_FRAMES;
  if (kind === 'net_spot') paintNet(c, f, p);
  else paintBait(c, f, p);
  return c.data;
}
