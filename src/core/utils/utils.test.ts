import { describe, expect, it } from 'vitest';
import { scriptedRng } from '@test-utils/index';
import {
  chebyshev,
  clamp,
  createMinHeap,
  err,
  findDuplicates,
  inBounds,
  isAdjacent,
  isValidId,
  lerp,
  manhattan,
  neighbors,
  ok,
  pointKey,
  pointsEqual,
  rollTable,
} from './index';

describe('rollTable', () => {
  const table = [
    { weight: 1, value: 'a' },
    { weight: 3, value: 'b' },
    { weight: 0, value: 'never' },
  ];
  it.each([
    [0, 'a'],
    [0.2, 'a'],
    [0.26, 'b'],
    [0.999999, 'b'],
  ])('roll %d picks %s', (r, expected) => {
    expect(rollTable(scriptedRng([r]), table)).toBe(expected);
  });

  it('never picks a zero-weight entry, even at the float edge', () => {
    expect(rollTable(scriptedRng([0.9999999999999999]), table)).toBe('b');
  });

  it('single entry always wins; uses one rng call', () => {
    const rng = scriptedRng([0.5, 0.1]);
    expect(rollTable(rng, [{ weight: 5, value: 1 }])).toBe(1);
    expect(rng.getState()).toBe(1);
  });

  it.each([
    ['empty', []],
    ['all zero', [{ weight: 0, value: 1 }]],
    ['negative', [{ weight: -1, value: 1 }]],
  ])('throws for %s table', (_n, t) => {
    expect(() => rollTable(scriptedRng([0]), t)).toThrow();
  });
});

describe('grid helpers', () => {
  it('keys, equality, distances', () => {
    expect(pointKey({ x: 3, y: -1 })).toBe('3,-1');
    expect(pointsEqual({ x: 1, y: 2 }, { x: 1, y: 2 })).toBe(true);
    expect(pointsEqual({ x: 1, y: 2 }, { x: 2, y: 1 })).toBe(false);
    expect(manhattan({ x: 0, y: 0 }, { x: 3, y: -4 })).toBe(7);
    expect(chebyshev({ x: 0, y: 0 }, { x: 3, y: -4 })).toBe(4);
  });

  it('neighbors returns 4 or 8 distinct points', () => {
    expect(neighbors({ x: 5, y: 5 })).toHaveLength(4);
    const eight = neighbors({ x: 5, y: 5 }, true);
    expect(new Set(eight.map(pointKey)).size).toBe(8);
    expect(eight.some((p) => pointsEqual(p, { x: 5, y: 5 }))).toBe(false);
  });

  it.each([
    [{ x: 1, y: 1 }, { x: 1, y: 2 }, false, true],
    [{ x: 1, y: 1 }, { x: 2, y: 2 }, false, false],
    [{ x: 1, y: 1 }, { x: 2, y: 2 }, true, true],
    [{ x: 1, y: 1 }, { x: 1, y: 1 }, true, false],
    [{ x: 1, y: 1 }, { x: 3, y: 1 }, true, false],
  ])('isAdjacent(%j, %j, diag=%s) = %s', (a, b, diag, expected) => {
    expect(isAdjacent(a, b, diag)).toBe(expected);
  });

  it.each([
    [{ x: 0, y: 0 }, true],
    [{ x: 3, y: 1 }, true],
    [{ x: 4, y: 0 }, false],
    [{ x: 0, y: 2 }, false],
    [{ x: -1, y: 0 }, false],
  ])('inBounds 4x2 %j = %s', (p, expected) => {
    expect(inBounds({ width: 4, height: 2 }, p)).toBe(expected);
  });
});

describe('createMinHeap', () => {
  it('pops in sorted order with custom comparator', () => {
    const h = createMinHeap<{ f: number }>((a, b) => a.f - b.f);
    const input = [5, 1, 9, 3, 3, 7, 0, 8, 2];
    input.forEach((f) => h.push({ f }));
    expect(h.size).toBe(input.length);
    expect(h.peek()?.f).toBe(0);
    const out: number[] = [];
    while (h.size > 0) out.push(h.pop()!.f);
    expect(out).toEqual([...input].sort((a, b) => a - b));
  });

  it('empty heap returns undefined', () => {
    const h = createMinHeap<number>((a, b) => a - b);
    expect(h.pop()).toBeUndefined();
    expect(h.peek()).toBeUndefined();
  });

  it('survives interleaved push/pop on random data', () => {
    const h = createMinHeap<number>((a, b) => a - b);
    const rng = scriptedRng(Array.from({ length: 200 }, (_, i) => ((i * 7919) % 1000) / 1000));
    const live: number[] = [];
    for (let i = 0; i < 200; i++) {
      const v = rng.next();
      h.push(v);
      live.push(v);
      if (i % 3 === 0) {
        live.sort((a, b) => a - b);
        expect(h.pop()).toBe(live.shift());
      }
    }
  });
});

describe('ids', () => {
  it.each([
    ['oak_logs', true],
    ['bronze_axe2', true],
    ['x', true],
    ['Oak', false],
    ['oak__logs', false],
    ['_oak', false],
    ['oak_', false],
    ['2oak', false],
    ['', false],
    ['oak-logs', false],
  ])('isValidId(%j) = %s', (id, expected) => expect(isValidId(id)).toBe(expected));

  it('findDuplicates reports each duplicate once', () => {
    expect(findDuplicates(['a', 'b', 'a', 'c', 'a', 'b'])).toEqual(['a', 'b']);
    expect(findDuplicates(['a', 'b'])).toEqual([]);
  });
});

describe('math and Result', () => {
  it('clamp and lerp', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
    expect(lerp(10, 20, 0.25)).toBe(12.5);
  });
  it('ok / err', () => {
    expect(ok(1)).toEqual({ ok: true, value: 1 });
    expect(err('bad')).toEqual({ ok: false, error: 'bad' });
  });
});
