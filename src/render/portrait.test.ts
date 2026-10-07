import { describe, expect, it } from 'vitest';
import { PORTRAIT_LOOK_IDS, paintPortraitPixels, portraitLook, portraitUrl } from './portrait';
import { NPC_LOOKS, PLAYER_LOOK } from './figureLooks';
import { paintFigure } from './figureArt';

/** Decode our own stored-block PNG: checks signature, IHDR, and that IDAT inflates to w*h*4 + h bytes. */
function decode(url: string): { w: number; h: number; alpha: number[] } {
  const b = Uint8Array.from(atob(url.split(',')[1]!), (c) => c.charCodeAt(0));
  const dv = new DataView(b.buffer);
  expect(String.fromCharCode(b[1]!, b[2]!, b[3]!)).toBe('PNG');
  const w = dv.getUint32(16);
  const h = dv.getUint32(20);
  const len = dv.getUint32(33);
  let p = 41 + 2; // IDAT data after the 2-byte zlib header
  const raw: number[] = [];
  for (;;) {
    const last = b[p]!;
    const n = b[p + 1]! | (b[p + 2]! << 8);
    for (let i = 0; i < n; i++) raw.push(b[p + 5 + i]!);
    p += 5 + n;
    if (last === 1) break;
  }
  expect(raw.length).toBe(w * h * 4 + h);
  expect(len).toBeGreaterThan(raw.length);
  const alpha: number[] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) alpha.push(raw[y * (w * 4 + 1) + 1 + x * 4 + 3]!);
  return { w, h, alpha };
}

describe('portraitUrl', () => {
  it('knows player + every NPC look', () => {
    expect([...PORTRAIT_LOOK_IDS].sort()).toEqual(['player', ...Object.keys(NPC_LOOKS)].sort());
  });

  it.each(PORTRAIT_LOOK_IDS)('%s: valid 2x PNG, has pixels, cached', (id) => {
    const url = portraitUrl(id, 48);
    expect(url.startsWith('data:image/png;base64,')).toBe(true);
    const { w, h, alpha } = decode(url);
    expect([w, h]).toEqual([96, 96]);
    expect(alpha.some((v) => v === 255)).toBe(true);
    expect(portraitUrl(id, 48)).toBe(url);
  });

  it('different looks give different images', () => {
    const urls = PORTRAIT_LOOK_IDS.map((id) => portraitUrl(id, 48));
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('is painted from the look data: skin colour appears in the face', () => {
    const px = paintPortraitPixels(PLAYER_LOOK, 44);
    const hex = (i: number): number => (px[i]! << 16) | (px[i + 1]! << 8) | px[i + 2]!;
    const cols = new Set<number>();
    for (let i = 0; i < px.length; i += 4) if (px[i + 3] === 255) cols.add(hex(i));
    expect(cols.has(PLAYER_LOOK.skin)).toBe(true);
    expect(cols.has(PLAYER_LOOK.top)).toBe(true);
    expect(portraitLook('player')).toBe(PLAYER_LOOK);
  });

  it('banker_f is a distinct, painted look in the banker uniform', () => {
    const m = NPC_LOOKS.banker;
    const f = NPC_LOOKS.banker_f;
    expect([f.outfit, f.top, f.trim, f.metal]).toEqual([m.outfit, m.top, m.trim, m.metal]);
    expect(f.hair).not.toBe(m.hair);
    expect(f.hairStyle).not.toBe(m.hairStyle);
    for (const view of ['front', 'back'] as const) {
      const grid = paintFigure(f, view);
      expect(grid.some((c) => c >= 0)).toBe(true);
      expect(grid.some((c, i) => c !== paintFigure(m, view)[i])).toBe(true);
    }
    expect(portraitLook('banker_f')).toBe(f);
    expect(portraitUrl('banker_f', 48)).not.toBe(portraitUrl('banker', 48));
    expect(portraitUrl('banker_f', 48).startsWith('data:image/png;base64,')).toBe(true);
  });

  it('unknown id or size gives an empty string', () => {
    expect(portraitUrl('nobody', 48)).toBe('');
    expect(portraitUrl('banker', 0)).toBe('');
    expect(portraitLook('toString')).toBeUndefined();
  });
});
