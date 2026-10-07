import { describe, expect, it, vi } from 'vitest';
import { ART_SCALE } from '@render/index';
import { animateTreeFall, animateTreeRegrow } from './treeAnim';
import type { MotionMode } from './types';

function fake() {
  const tweens = { add: vi.fn(), killTweensOf: vi.fn() };
  const ghostAdds = vi.fn();
  const chain = {
    list: [{ scaleX: 1.5 }],
    setScale: vi.fn(),
    setAlpha: vi.fn(),
    x: 0,
    y: 0,
    depth: 0,
  };
  chain.setScale.mockReturnValue(chain);
  chain.setAlpha.mockReturnValue(chain);
  const gfx: Record<string, unknown> = {};
  gfx.fillStyle = () => gfx;
  gfx.fillRect = () => gfx;
  gfx.fillCircle = () => gfx;
  const ghost = {
    setDepth: vi.fn((_d: number) => ghost),
    setScale: vi.fn((_s: number) => ghost),
    add: vi.fn(),
    destroy: vi.fn(),
    x: 0,
    y: 0,
  };
  const scene = {
    tweens,
    add: {
      container: (...a: unknown[]) => (ghostAdds(...a), ghost),
      graphics: () => gfx,
    },
  };
  const view = {
    container: chain,
    colors: { trunk: 1, leaf: 2 },
    setDepleted: vi.fn(),
  };
  return { scene, view, tweens, ghostAdds, chain, ghost };
}

const run = (fn: 'fall' | 'regrow', mode: MotionMode, awayFrom?: { dx: number; dy: number }) => {
  const f = fake();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = f.scene as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const v = f.view as any;
  void (fn === 'fall'
    ? animateTreeFall(s, v, {}, { mode, awayFrom })
    : animateTreeRegrow(s, v, { mode, awayFrom }));
  return f;
};

describe('tree animations per mode', () => {
  it('on: fall and regrow tween', () => {
    expect(run('fall', 'on').tweens.add.mock.calls[0]?.[0]?.duration).toBe(450);
    expect(run('regrow', 'on').tweens.add.mock.calls[0]?.[0]?.duration).toBe(280);
  });
  it('reduced: short fades', () => {
    expect(
      run('fall', 'reduced').tweens.add.mock.calls[0]?.[0]?.duration ?? 999,
    ).toBeLessThanOrEqual(120);
    expect(
      run('regrow', 'reduced').tweens.add.mock.calls[0]?.[0]?.duration ?? 999,
    ).toBeLessThanOrEqual(120);
  });
  it('off: fall swaps instantly with no ghost and no tween', () => {
    const f = run('fall', 'off');
    expect(f.view.setDepleted).toHaveBeenCalledWith(true);
    expect(f.tweens.add).not.toHaveBeenCalled();
    expect(f.ghostAdds).not.toHaveBeenCalled();
  });
  it('off: regrow swaps instantly at full scale and alpha', () => {
    const f = run('regrow', 'off');
    expect(f.view.setDepleted).toHaveBeenCalledWith(false);
    expect(f.tweens.add).not.toHaveBeenCalled();
    expect(f.chain.setScale).toHaveBeenLastCalledWith(1);
    expect(f.chain.setAlpha).toHaveBeenLastCalledWith(1);
  });
});

describe('tree fall direction (iso)', () => {
  // tree offset from the player in tiles -> screen: x = (dx - dy) * 32, y = (dx + dy) * 16
  const cases: [string, number, number, number, number][] = [
    // name, dx, dy, expected tilt sign, expected slideY sign
    ['tree screen-right of player', 1, -1, 1, 0],
    ['tree screen-left of player', -1, 1, -1, 0],
    ['tree below on screen (+x tile)', 1, 0, 1, 1],
    ['tree above on screen (-x tile)', -1, 0, -1, -1],
    ['tree straight down the screen', 1, 1, 0, 1],
    ['tree straight up the screen', -1, -1, 0, -1],
  ];
  it.each(cases)('%s', (_n, dx, dy, tilt, slideY) => {
    const f = run('fall', 'on', { dx, dy });
    const t = f.tweens.add.mock.calls[0]?.[0];
    expect(Math.sign(Math.round(t.angle * 1000))).toBe(tilt);
    expect(Math.sign(Math.round((t.y - 0) * 1000))).toBe(slideY);
    expect(Math.sign(Math.round(t.x * 1000))).toBe(Math.sign(Math.round(tilt * 1000)));
  });
  it('no player offset keeps the default (falls right, no slide)', () => {
    const t = run('fall', 'on').tweens.add.mock.calls[0]?.[0];
    expect(t.angle).toBe(35);
    expect(t.x).toBe(0);
  });
  it('reduced: no tilt and no slide whatever the direction', () => {
    const t = run('fall', 'reduced', { dx: 1, dy: 0 }).tweens.add.mock.calls[0]?.[0];
    expect(t.angle).toBeCloseTo(0);
    expect(t.x).toBe(0);
    expect(t.y).toBe(0);
  });
  it('ghost is scaled like the tree art and sits just above its tree, below the next tile', () => {
    const f = run('fall', 'on', { dx: 1, dy: 0 });
    expect(f.ghost.setScale).toHaveBeenCalledWith(ART_SCALE);
    const d = f.ghost.setDepth.mock.calls[0]?.[0] as number;
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThan(1e-4);
  });
});
