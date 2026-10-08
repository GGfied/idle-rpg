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
export const SPOT_FRAMES = 6;

/** Hit extent in ART units (x ART_SCALE for px): the whole water tile diamond is tappable. */
export const SPOT_TOP = 11;
export const SPOT_HALF_W = 21;

const WHITE = [240, 250, 252] as const;
const FOAM = [226, 244, 248] as const;
const CHURN = [150, 222, 222] as const;
const LIGHT_CHURN = [190, 238, 228] as const;
const TURBID = [22, 70, 92] as const;
const FISH = [18, 48, 62] as const;
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

/** A fish leaping clear of the surface: bright body arc, spray drops, splash ring at the base. */
function leap(c: Canvas, x: number, y: number, h: number): void {
  const body = [214, 228, 236] as const;
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    const bx = x - 3 + i * 2;
    const by = y - Math.round(Math.sin(t * Math.PI) * h);
    put(c, bx, by, body, 255);
    put(c, bx, by + 1, FISH, 230);
    put(c, bx + 1, by, body, 230);
  }
  put(c, x - 4, y - 1, body, 230); // tail
  put(c, x - 4, y - 2, body, 200);
  for (const [dx, dy] of [
    [-5, 1],
    [5, 1],
    [-3, -h],
    [4, -h + 1],
  ] as const)
    put(c, x + dx, y + dy, WHITE, 220); // spray
}

/** Larger shoal fish (6 long, 2 thick) with a pale belly. */
function bigFish(c: Canvas, x: number, y: number, left: boolean): void {
  const s = left ? -1 : 1;
  for (let i = 0; i < 6; i++) {
    put(c, x + s * i, y, FISH, 245);
    if (i > 0 && i < 5) put(c, x + s * i, y + 1, FISH, 235);
  }
  put(c, x + s * 2, y - 1, FISH, 220); // dorsal
  put(c, x + s * 3, y - 1, FISH, 220);
  put(c, x + s * 6, y - 1, FISH, 245); // tail fork
  put(c, x + s * 6, y + 1, FISH, 245);
  put(c, x + s * 2, y + 1, SILVER, 255); // belly flash
  put(c, x + s * 3, y + 1, SILVER, 255);
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
  for (let i = 0; i < 16; i++) {
    const a = i * 2.399;
    const rr = 5 + ((i * 7) % 16);
    const x = Math.round(SPOT_CX + Math.cos(a) * rr);
    const y = Math.round(SPOT_CY + Math.sin(a) * rr * 0.5);
    if ((frame + i) % 3 === 2) continue;
    put(c, x, y, WHITE, 255);
    put(c, x + 1, y, WHITE, 255);
    if ((frame + i) % 3 === 0) put(c, x, y - 1, WHITE, 200);
  }
  for (let i = 0; i < 6; i++) {
    const a = p * Math.PI * 2 * (i % 2 ? 1 : -1) + (i * Math.PI * 2) / 6;
    const rr = 9 + (i % 3) * 4;
    const x = Math.round(SPOT_CX + Math.cos(a) * rr);
    const y = Math.round(SPOT_CY + Math.sin(a) * rr * 0.5);
    const flickRight = i % 2 ? Math.sin(a) > 0 : Math.sin(a) < 0;
    bigFish(c, x, y, !flickRight);
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
  if (frame === 2 || frame === 3) leap(c, SPOT_CX + 1, SPOT_CY + 1, frame === 2 ? 5 : 3);
}

/** Paint one frame (0..SPOT_FRAMES-1) of a spot as RGBA bytes, SPOT_TEX_W x SPOT_TEX_H. */
export function paintSpotPixels(kind: SpotArtKind, frame: number): Uint8ClampedArray {
  const c = newCanvas(SPOT_TEX_W, SPOT_TEX_H);
  const f = ((frame % SPOT_FRAMES) + SPOT_FRAMES) % SPOT_FRAMES;
  const p = f / SPOT_FRAMES;
  if (kind === 'net_spot') paintNet(c, f, p);
  else paintBait(c, f, p);
  return c.data;
}
