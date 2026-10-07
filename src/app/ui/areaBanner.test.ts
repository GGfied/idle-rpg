import { describe, expect, it } from 'vitest';
import {
  areaNamesEnabled,
  bannerOpacity,
  bannerTimings,
  bannerTotalMs,
  bannerVisible,
} from './areaBanner';

describe('areaBanner helpers', () => {
  it('timings per animation mode', () => {
    expect(bannerTimings('on')).toEqual({ fadeInMs: 300, holdMs: 2000, fadeOutMs: 600 });
    expect(bannerTimings('off')).toMatchObject({ fadeInMs: 0, fadeOutMs: 0 });
    const r = bannerTimings('reduced');
    expect(r.fadeInMs).toBeLessThan(300);
    expect(r.fadeOutMs).toBeLessThan(600);
  });
  it('missing pref means enabled', () => {
    expect(areaNamesEnabled(undefined)).toBe(true);
    expect(areaNamesEnabled(true)).toBe(true);
    expect(areaNamesEnabled(false)).toBe(false);
  });
  it('visibility honours banner, pref and elapsed time', () => {
    const t = bannerTimings('on');
    const b = { name: 'Lake' };
    expect(bannerVisible(b, true, 0, t)).toBe(true);
    expect(bannerVisible(b, true, bannerTotalMs(t) - 1, t)).toBe(true);
    expect(bannerVisible(b, true, bannerTotalMs(t), t)).toBe(false);
    expect(bannerVisible(b, false, 0, t)).toBe(false);
    expect(bannerVisible(null, true, 0, t)).toBe(false);
    expect(bannerVisible({ name: '' }, true, 0, t)).toBe(false);
  });
  it('opacity rises, holds, falls; off is a hard cut', () => {
    const t = bannerTimings('on');
    expect(bannerOpacity(150, t)).toBeCloseTo(0.5);
    expect(bannerOpacity(1000, t)).toBe(1);
    expect(bannerOpacity(300 + 2000 + 300, t)).toBeCloseTo(0.5);
    expect(bannerOpacity(3000, t)).toBe(0);
    const off = bannerTimings('off');
    expect(bannerOpacity(0, off)).toBe(1);
    expect(bannerOpacity(2000, off)).toBe(0);
  });
});
