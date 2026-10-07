import { describe, expect, it, vi } from 'vitest';
import { animateTreeFall, animateTreeRegrow } from './treeAnim';
import type { MotionMode } from './types';

function fake() {
  const tweens = { add: vi.fn(), killTweensOf: vi.fn() };
  const ghostAdds = vi.fn();
  const chain = { setScale: vi.fn(), setAlpha: vi.fn(), x: 0, y: 0, depth: 0 };
  chain.setScale.mockReturnValue(chain);
  chain.setAlpha.mockReturnValue(chain);
  const gfx: Record<string, unknown> = {};
  gfx.fillStyle = () => gfx;
  gfx.fillRect = () => gfx;
  gfx.fillCircle = () => gfx;
  const ghost = { setDepth: () => ghost, add: vi.fn(), destroy: vi.fn(), y: 0 };
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
  return { scene, view, tweens, ghostAdds, chain };
}

const run = (fn: 'fall' | 'regrow', mode: MotionMode) => {
  const f = fake();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = f.scene as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const v = f.view as any;
  void (fn === 'fall' ? animateTreeFall(s, v, {}, { mode }) : animateTreeRegrow(s, v, { mode }));
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
