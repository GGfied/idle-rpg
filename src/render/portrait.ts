/**
 * Head-and-shoulders portraits for the dialogue box. Pure: the SAME `FigureLook` painter as the world
 * sprite (`paintFigure`) is cropped to the head and shoulders and scaled up with nearest-neighbour, then
 * encoded as a PNG data URL by a tiny built-in encoder (no canvas, no Phaser, runs in React and in vitest).
 * Painted at 2x the requested size so it stays crisp at dpr 2. Transparent outside the figure.
 */
import { FIG_W, paintFigure } from './figureArt';
import type { FigureLook } from './figureArt';
import { NPC_LOOKS, PLAYER_LOOKS } from './figureLooks';
import type { PlayerLookId } from './figureLooks';

/** Crop window in figure cells: the head (rows 0-16) plus the shoulders and collar. Square. */
export const PORTRAIT_CROP = { x: 7, y: 0, size: 22 } as const;

/** Look ids: 'player' plus every NPC `spriteKey` (banker, villager, villager_f). */
export const PORTRAIT_LOOK_IDS: readonly string[] = [
  ...Object.keys(PLAYER_LOOKS),
  ...Object.keys(NPC_LOOKS),
];

/** The look behind an id, or undefined for an unknown id. */
export function portraitLook(lookId: string): FigureLook | undefined {
  if (Object.hasOwn(PLAYER_LOOKS, lookId)) return PLAYER_LOOKS[lookId as PlayerLookId];
  return Object.hasOwn(NPC_LOOKS, lookId) ? NPC_LOOKS[lookId as keyof typeof NPC_LOOKS] : undefined;
}

/** RGBA pixels (px x px) of the head-and-shoulders crop of a look. */
export function paintPortraitPixels(look: FigureLook, px: number): Uint8ClampedArray {
  const cells = paintFigure(look, 'front');
  const out = new Uint8ClampedArray(px * px * 4);
  const { x: cx, y: cy, size } = PORTRAIT_CROP;
  for (let y = 0; y < px; y++) {
    const gy = cy + Math.floor((y * size) / px);
    for (let x = 0; x < px; x++) {
      const c = cells[gy * FIG_W + cx + Math.floor((x * size) / px)]!;
      if (c < 0) continue;
      const i = (y * px + x) * 4;
      out[i] = (c >> 16) & 255;
      out[i + 1] = (c >> 8) & 255;
      out[i + 2] = c & 255;
      out[i + 3] = 255;
    }
  }
  return out;
}

let crcTable: Uint32Array | undefined;
function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (const b of bytes) c = crcTable[(c ^ b) & 255]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** Minimal RGBA PNG (zlib "stored" blocks, no compression: portraits are small and cached). */
export function encodePng(rgba: Uint8ClampedArray, w: number, h: number): Uint8Array {
  const stride = w * 4 + 1;
  const raw = new Uint8Array(stride * h);
  for (let y = 0; y < h; y++) raw.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), y * stride + 1);
  const blocks = Math.max(1, Math.ceil(raw.length / 65535));
  const z = new Uint8Array(2 + raw.length + blocks * 5 + 4);
  z[0] = 0x78;
  z[1] = 0x01;
  let p = 2;
  for (let b = 0; b < blocks; b++) {
    const part = raw.subarray(b * 65535, (b + 1) * 65535);
    z[p++] = b === blocks - 1 ? 1 : 0;
    z[p++] = part.length & 255;
    z[p++] = part.length >> 8;
    z[p++] = ~part.length & 255;
    z[p++] = (~part.length >> 8) & 255;
    z.set(part, p);
    p += part.length;
  }
  let a = 1;
  let s = 0;
  for (const v of raw) {
    a = (a + v) % 65521;
    s = (s + a) % 65521;
  }
  new DataView(z.buffer).setUint32(p, ((s << 16) | a) >>> 0);
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w);
  dv.setUint32(4, h);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const parts = [
    Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10),
    chunk('IHDR', ihdr),
    chunk('IDAT', z),
    chunk('IEND', new Uint8Array(0)),
  ];
  const png = new Uint8Array(parts.reduce((n, q) => n + q.length, 0));
  let o = 0;
  for (const q of parts) {
    png.set(q, o);
    o += q.length;
  }
  return png;
}

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

const cache = new Map<string, string>();

/**
 * Cached `data:image/png` URL of a head-and-shoulders portrait for a look id ('player', 'banker',
 * 'villager', 'villager_f' = an NPC's `spriteKey`), `sizePx` CSS px square, painted at 2x. Unknown id -> ''.
 */
export function portraitUrl(lookId: string, sizePx: number): string {
  const key = `${lookId}@${sizePx}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const look = portraitLook(lookId);
  if (!look || !(sizePx > 0)) return '';
  const px = Math.max(1, Math.round(sizePx * 2));
  const url = `data:image/png;base64,${toBase64(encodePng(paintPortraitPixels(look, px), px, px))}`;
  cache.set(key, url);
  return url;
}
