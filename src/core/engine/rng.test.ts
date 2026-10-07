import { describe, expect, it } from 'vitest';
import { createRng, seedFromString } from './rng';

describe('createRng', () => {
  it('is deterministic for a seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()]);
  });

  it('differs between seeds', () => {
    expect(createRng(1).next()).not.toBe(createRng(2).next());
  });

  it('stays in [0, 1)', () => {
    const r = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('resumes exactly from serialized state', () => {
    const a = createRng(5);
    a.next();
    a.next();
    const b = createRng(0, a.getState());
    expect([b.next(), b.next()]).toEqual([a.next(), a.next()]);
  });

  it.each([
    [1, 6],
    [-3, 3],
    [5, 5],
  ])('int(%i, %i) is inclusive and integer', (min, max) => {
    const r = createRng(9);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const v = r.int(min, max);
      expect(Number.isInteger(v)).toBe(true);
      seen.add(v);
    }
    expect(Math.min(...seen)).toBe(min);
    expect(Math.max(...seen)).toBe(max);
  });

  it.each([
    [0, false],
    [1, true],
  ])('chance(%d) is %s', (p, expected) => {
    const r = createRng(3);
    for (let i = 0; i < 100; i++) expect(r.chance(p)).toBe(expected);
  });
});

describe('seedFromString', () => {
  it('is stable and distinguishes inputs', () => {
    expect(seedFromString('abc')).toBe(seedFromString('abc'));
    expect(seedFromString('abc')).not.toBe(seedFromString('abd'));
  });
});
