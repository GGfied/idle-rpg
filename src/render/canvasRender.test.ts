import { describe, expect, it } from 'vitest';
import type Phaser from 'phaser';
import { drawTinted } from './canvasStamp';
import { paintWaterTile, rendererHasGradients, shoreField, type WaterBase } from './waterShade';

/** Records Graphics calls: Phaser's CANVAS renderer fills black unless fillStyle was set. */
class FakeG {
  gradients = 0;
  fills: number[] = [];
  tris = 0;
  fillGradientStyle() {
    this.gradients++;
    return this;
  }
  fillStyle(c: number) {
    this.fills.push(c);
    return this;
  }
  fillTriangle() {
    this.tris++;
    return this;
  }
}

const field = shoreField(() => 'water', 0, 0, 8, 8);
const base = (gradient?: boolean) => {
  const g = new FakeG();
  const w: WaterBase = { base: g as unknown as Phaser.GameObjects.Graphics, field, gradient };
  return { g, w };
};

describe('CANVAS renderer fallbacks', () => {
  it('detects the renderer type (CANVAS = 1; unknown/fakes keep the WebGL path)', () => {
    const at = (type?: number) =>
      ({ sys: { game: { renderer: type === undefined ? undefined : { type } } } }) as never;
    expect(rendererHasGradients(at(1))).toBe(false);
    expect(rendererHasGradients(at(2))).toBe(true);
    expect(rendererHasGradients(at())).toBe(true);
    expect(rendererHasGradients({} as never)).toBe(true);
  });

  it('WebGL path still uses two gradient triangles', () => {
    const { g, w } = base(true);
    paintWaterTile(w, 3, 3, 0, 0, 2);
    expect(g.gradients).toBe(2);
    expect(g.tris).toBe(2);
  });

  it('CANVAS path never relies on a gradient: every triangle gets a non-black blue fill', () => {
    const { g, w } = base(false);
    paintWaterTile(w, 3, 3, 0, 0, 2);
    expect(g.gradients).toBe(0);
    expect(g.tris).toBe(g.fills.length * 2);
    expect(g.fills.length).toBeGreaterThan(2);
    for (const c of g.fills) {
      expect(c).not.toBe(0);
      expect(c & 255).toBeGreaterThan((c >> 16) & 255); // blue beats red: water, not black/grey
    }
  });
});

describe('drawTinted', () => {
  it('draws the frame directly when the tint is white, else multiplies and keeps alpha', () => {
    const ops: string[] = [];
    const mk = () => {
      const ctx = {
        set globalCompositeOperation(v: string) {
          ops.push('op:' + v);
        },
        set fillStyle(v: string) {
          ops.push('fill:' + v);
        },
        drawImage: () => ops.push('draw'),
        fillRect: () => ops.push('rect'),
      };
      return ctx as unknown as CanvasRenderingContext2D;
    };
    const frame = { x: 0, y: 0, width: 4, height: 2 };
    (globalThis as { document?: unknown }).document = {
      createElement: () => ({ width: 0, height: 0, getContext: mk }),
    };
    drawTinted(mk(), {} as CanvasImageSource, frame, 0, 0, 0xffffff);
    expect(ops).toEqual(['draw']);
    ops.length = 0;
    drawTinted(mk(), {} as CanvasImageSource, frame, 0, 0, 0x80c0ff);
    expect(ops).toEqual([
      'op:copy',
      'draw',
      'op:multiply',
      'fill:rgb(128,192,255)',
      'rect',
      'op:destination-in',
      'draw',
      'draw',
    ]);
    delete (globalThis as { document?: unknown }).document;
  });
});
