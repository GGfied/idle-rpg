import { describe, expect, it } from 'vitest';
import { gestureReducer, initialGestureState, type GestureState } from './gestureReducer';
import type { GestureEmission, RawEvent } from './types';

function run(events: [RawEvent, number][]): { state: GestureState; emitted: GestureEmission[] } {
  let state = initialGestureState();
  const emitted: GestureEmission[] = [];
  for (const [ev, t] of events) {
    const r = gestureReducer(state, ev, t);
    state = r.state;
    emitted.push(...r.emitted);
  }
  return { state, emitted };
}

const down = (id: number, x: number, y: number, pointerType = 'touch', button = 0): RawEvent => ({
  type: 'down',
  id,
  x,
  y,
  button,
  pointerType,
});
const move = (id: number, x: number, y: number): RawEvent => ({ type: 'move', id, x, y });
const up = (id: number, x: number, y: number): RawEvent => ({ type: 'up', id, x, y });

describe('gestureReducer', () => {
  it('emits tap for a quick press within the threshold (mouse and touch)', () => {
    for (const pt of ['mouse', 'touch']) {
      const r = run([
        [down(1, 10, 20, pt), 0],
        [up(1, 12, 21), 100],
      ]);
      expect(r.emitted).toEqual([{ type: 'tap', payload: { x: 12, y: 21 } }]);
      expect(r.state.mode).toBe('idle');
    }
  });

  it('does not tap when held too long without long-press (mouse)', () => {
    const r = run([
      [down(1, 0, 0, 'mouse'), 0],
      [up(1, 0, 0), 2000],
    ]);
    expect(r.emitted).toEqual([]);
  });

  it('cancels tap and long-press when the finger moves; emits drag instead', () => {
    const r = run([
      [down(1, 0, 0), 0],
      [move(1, 30, 0), 100],
      [{ type: 'hold' }, 500],
      [up(1, 30, 0), 600],
    ]);
    expect(r.emitted).toEqual([{ type: 'drag', payload: { dx: 30, dy: 0 } }]);
  });

  it('emits incremental drag deltas', () => {
    const r = run([
      [down(1, 0, 0), 0],
      [move(1, 20, 0), 10],
      [move(1, 25, 5), 20],
    ]);
    expect(r.emitted.map((e) => e.payload)).toEqual([
      { dx: 20, dy: 0 },
      { dx: 5, dy: 5 },
    ]);
  });

  it('small jitter below the threshold does not drag', () => {
    const r = run([
      [down(1, 0, 0), 0],
      [move(1, 5, 5), 10],
      [up(1, 5, 5), 50],
    ]);
    expect(r.emitted.map((e) => e.type)).toEqual(['tap']);
  });

  it('long press via touch hold fires once and suppresses tap', () => {
    const r = run([
      [down(1, 5, 6), 0],
      [{ type: 'hold' }, 450],
      [up(1, 5, 6), 600],
    ]);
    expect(r.emitted).toEqual([{ type: 'longPress', payload: { x: 5, y: 6 } }]);
  });

  it('hold fired too early (stale timer) is ignored', () => {
    const r = run([
      [down(1, 0, 0), 0],
      [{ type: 'hold' }, 200],
    ]);
    expect(r.emitted).toEqual([]);
  });

  it('mouse hold never becomes a long press', () => {
    const r = run([
      [down(1, 0, 0, 'mouse'), 0],
      [{ type: 'hold' }, 1000],
    ]);
    expect(r.emitted).toEqual([]);
  });

  it('mouse right-click (contextmenu) emits longPress and no tap', () => {
    const r = run([
      [down(1, 3, 4, 'mouse', 2), 0],
      [{ type: 'contextmenu', x: 3, y: 4 }, 1],
      [up(1, 3, 4), 80],
    ]);
    expect(r.emitted).toEqual([{ type: 'longPress', payload: { x: 3, y: 4 } }]);
  });

  it('contextmenu right after a touch long-press is deduplicated', () => {
    const r = run([
      [down(1, 5, 5), 0],
      [{ type: 'hold' }, 450],
      [{ type: 'contextmenu', x: 5, y: 5 }, 500],
    ]);
    expect(r.emitted.filter((e) => e.type === 'longPress')).toHaveLength(1);
  });

  it('pinch emits incremental scale around the centre; no tap/drag afterwards', () => {
    const r = run([
      [down(1, 0, 0), 0],
      [down(2, 100, 0), 10],
      [move(2, 200, 0), 20],
      [move(2, 100, 0), 30],
      [up(2, 100, 0), 40],
      [move(1, 50, 50), 50],
      [up(1, 50, 50), 60],
    ]);
    expect(r.emitted).toEqual([
      { type: 'pinch', payload: { scale: 2, centerX: 100, centerY: 0 } },
      { type: 'pinch', payload: { scale: 0.5, centerX: 50, centerY: 0 } },
    ]);
    expect(r.state.mode).toBe('idle');
  });

  it('wheel maps to pinch: down zooms out, up zooms in', () => {
    const r = run([
      [{ type: 'wheel', x: 1, y: 2, deltaY: 100 }, 0],
      [{ type: 'wheel', x: 1, y: 2, deltaY: -100 }, 1],
    ]);
    const [out, inn] = r.emitted.map((e) => (e.payload as { scale: number }).scale);
    expect(out).toBeLessThan(1);
    expect(inn).toBeGreaterThan(1);
  });

  it('pointercancel aborts the gesture without emitting', () => {
    const r = run([
      [down(1, 0, 0), 0],
      [{ type: 'cancel', id: 1 }, 10],
      [up(1, 0, 0), 20],
    ]);
    expect(r.emitted).toEqual([]);
    expect(r.state.mode).toBe('idle');
  });

  it('cancel during a long press leaves no stray tap', () => {
    const r = run([
      [down(1, 0, 0), 0],
      [{ type: 'hold' }, 450],
      [{ type: 'cancel', id: 1 }, 460],
    ]);
    expect(r.emitted.map((e) => e.type)).toEqual(['longPress']);
  });
});
