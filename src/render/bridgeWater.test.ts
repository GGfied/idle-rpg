import { describe, expect, it } from 'vitest';
import { bridgeDeckRect, bridgeRunsAlongY, bridgeSides, railPlacements } from './bridge';
import { paintGround } from './tilemap';
import { isoProjection } from './projection';
import { createWaterOverlay } from './waterOverlay';
import { shoreField } from './waterShade';
import { collectVisibleWater, MAX_WATER_TILES } from './waterModel';

/** Lake with a bridge on row 3 from x=2..4, grass at the ends. */
const kinds = (x: number, y: number) => {
  if (x < 0 || y < 0 || x > 8 || y > 6) return undefined;
  if (y === 3 && x >= 2 && x <= 4) return 'bridge';
  if (x <= 1 || x >= 5) return 'grass';
  return 'water';
};

class FakeG {
  fills: number[] = [];
  lines = 0;
  rects: { a: number }[] = [];
  alpha = 1;
  cleared = 0;
  visible = true;
  destroyed = false;
  fillStyle(c: number, a = 1) {
    this.fills.push(c);
    this.alpha = a;
    return this;
  }
  lineStyle() {
    return this;
  }
  fillPoints() {
    return this;
  }
  tris = 0;
  fillGradientStyle() {
    return this;
  }
  fillTriangle() {
    this.tris++;
    return this;
  }
  strokePoints() {
    return this;
  }
  lineBetween() {
    this.lines++;
    return this;
  }
  fillRect() {
    this.rects.push({ a: this.alpha });
    return this;
  }
  clear() {
    this.cleared++;
    this.rects = [];
    return this;
  }
  setDepth() {
    return this;
  }
  setVisible(v: boolean) {
    this.visible = v;
    return this;
  }
  destroy() {
    this.destroyed = true;
  }
}

describe('bridge', () => {
  it('sees water on the sides across the travel direction and runs along x', () => {
    const s = bridgeSides(kinds, 3, 3);
    expect(s).toEqual({ xMinus: false, xPlus: false, yMinus: true, yPlus: true });
    expect(bridgeRunsAlongY(s)).toBe(false);
    const r = bridgeDeckRect(s);
    expect(r.y0).toBeGreaterThan(-0.5); // water shows under the water-facing edges
    expect(r.x0).toBe(-0.5); // ends meet the next tile
  });

  it('puts one rail per water side: far edge behind, near edge in front of a player on the tile', () => {
    const rails = railPlacements(3, 3, bridgeSides(kinds, 3, 3));
    expect(rails).toHaveLength(2);
    const d = isoProjection.depthFor(3, 3);
    expect(Math.min(...rails.map((r) => r.depth))).toBeLessThan(d);
    expect(Math.max(...rails.map((r) => r.depth))).toBeGreaterThan(d);
  });

  it('paints planks (deck tones), not just water, and nothing for an unknown kind palette miss', () => {
    const g = new FakeG();
    const region = { x0: 0, y0: 0, width: 9, height: 7, kindAt: kinds };
    paintGround(g as never, region, { x: 0, y: 0 });
    const bridgeOnly = new FakeG();
    paintGround(
      bridgeOnly as never,
      { ...region, kindAt: (x, y) => (x === 3 && y === 3 ? 'bridge' : undefined) },
      {
        x: 0,
        y: 0,
      },
    );
    // 1 water diamond + 4 planks, planks are warm brown (r > b), not magenta
    expect(bridgeOnly.fills).toHaveLength(5);
    expect(bridgeOnly.fills.slice(1).every((c) => c >> 16 > (c & 255) && c !== 0xff00ff)).toBe(
      true,
    );
    expect(bridgeOnly.lines).toBeGreaterThan(0);
  });
});

describe('water', () => {
  const view = { x: -200, y: -50, width: 400, height: 200 };
  it('collects only water tiles in view, within the cap, reusing the array', () => {
    const out: number[] = [];
    const a = collectVisibleWater(view, isoProjection, kinds, out);
    expect(a).toBe(out);
    expect(out.length).toBeGreaterThan(0);
    for (let i = 0; i < out.length; i += 2) {
      expect(kinds(out[i]!, out[i + 1]!)).toBe('water');
      const p = isoProjection.tileToWorld(out[i]!, out[i + 1]!);
      expect(p.x).toBeGreaterThanOrEqual(view.x - 40);
      expect(p.x).toBeLessThanOrEqual(view.x + view.width + 40);
    }
    const far = collectVisibleWater(
      { x: 5000, y: 5000, width: 100, height: 100 },
      isoProjection,
      kinds,
      out,
    );
    expect(far).toHaveLength(0);
    const all = () => 'water';
    collectVisibleWater({ x: -4000, y: -4000, width: 8000, height: 8000 }, isoProjection, all, out);
    expect(out.length / 2).toBe(MAX_WATER_TILES);
  });

  function scene() {
    const g = new FakeG();
    let upd: ((t: number, dt: number) => void) | null = null;
    const s = {
      add: { graphics: () => g },
      events: { on: (_: string, f: typeof upd) => (upd = f), off: () => (upd = null) },
      cameras: { main: { worldView: view } },
    };
    return { s: s as never, g, tick: (dt: number) => upd?.(0, dt), attached: () => upd !== null };
  }

  it('redraws at ~8 fps, only visible water; off draws nothing and clears; destroy detaches', () => {
    const f = scene();
    let mode: 'on' | 'reduced' | 'off' = 'on';
    const w = createWaterOverlay(f.s, isoProjection, { kindAt: kinds, motion: () => mode });
    f.tick(16);
    expect(w.redraws()).toBe(1);
    expect(w.tiles()).toBeGreaterThan(0);
    expect(f.g.rects.length).toBeGreaterThanOrEqual(w.tiles() * 2);
    f.tick(16);
    f.tick(16);
    expect(w.redraws()).toBe(1); // throttled
    f.tick(110);
    expect(w.redraws()).toBe(2);
    mode = 'off';
    f.tick(1000);
    expect(f.g.visible).toBe(false);
    expect(f.g.rects).toHaveLength(0);
    expect(w.redraws()).toBe(2);
    expect(w.tiles()).toBe(0);
    mode = 'on';
    f.tick(16);
    expect(f.g.visible).toBe(true);
    expect(w.redraws()).toBe(3);
    w.destroy();
    expect(f.attached()).toBe(false);
    expect(f.g.destroyed).toBe(true);
  });

  it('reduced is fainter and slower than on', () => {
    const run = (m: 'on' | 'reduced') => {
      const f = scene();
      createWaterOverlay(f.s, isoProjection, { kindAt: kinds, motion: () => m });
      f.tick(16);
      return { max: Math.max(...f.g.rects.map((r) => r.a)), fills: f.g.fills.length };
    };
    expect(run('reduced').max).toBeLessThan(run('on').max);
    const f = scene();
    const w = createWaterOverlay(f.s, isoProjection, { kindAt: kinds, motion: () => 'reduced' });
    f.tick(16);
    f.tick(130);
    expect(w.redraws()).toBe(1); // 4 fps = 250 ms
  });
});

describe('textured ground stamping', () => {
  it('stamps textured kinds (bridge = water under the deck) instead of flat diamonds', () => {
    const g = new FakeG();
    const stamped: string[] = [];
    const region = { x0: 0, y0: 0, width: 9, height: 7, kindAt: kinds };
    paintGround(g as never, region, { x: 0, y: 0 }, undefined, (k) => stamped.push(k));
    expect(stamped.filter((k) => k === 'water').length).toBeGreaterThan(3 * 5); // lake + under bridge
    expect(stamped).toContain('grass');
    expect(stamped).not.toContain('bridge');
    expect(g.fills.length).toBeGreaterThan(0); // deck planks still drawn on top
    expect(stamped).toHaveLength(9 * 7);
  });
});

describe('shaded water base', () => {
  it('paints water and bridge tiles as vertex-shaded triangles plus a detail stamp, never the flat water texture', () => {
    const g = new FakeG();
    const base = new FakeG();
    const stamped: string[] = [];
    const region = { x0: 0, y0: 0, width: 9, height: 7, kindAt: kinds };
    paintGround(g as never, region, { x: 0, y: 0 }, undefined, (k) => stamped.push(k), {
      base: base as never,
      field: shoreField(kinds, 0, 0, 9, 7),
    });
    let waterTiles = 0;
    for (let y = 0; y < 7; y++)
      for (let x = 0; x < 9; x++) if (['water', 'bridge'].includes(kinds(x, y)!)) waterTiles++;
    expect(base.tris).toBe(waterTiles * 2);
    expect(stamped.filter((k) => k === 'waterdetail')).toHaveLength(waterTiles);
    expect(stamped).not.toContain('water');
  });
});
