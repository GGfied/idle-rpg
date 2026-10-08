import { describe, expect, it, vi } from 'vitest';
import { itemMenuOptions } from './itemMenu';

const mk = () => ({
  use: vi.fn(),
  drop: vi.fn(),
  examine: vi.fn(),
  light: vi.fn(),
});

describe('itemMenuOptions', () => {
  it('offers Light first for lightable logs and dispatches the light action', () => {
    const a = mk();
    const opts = itemMenuOptions(a, true);
    expect(opts.map((o) => o.label)).toEqual(['Light', 'Use', 'Drop', 'Examine', 'Cancel']);
    opts[0]!.onSelect();
    expect(a.light).toHaveBeenCalledTimes(1);
    expect(a.use).not.toHaveBeenCalled();
  });
  it('hides Light for non-lightable items', () => {
    const a = mk();
    const labels = itemMenuOptions(a, false).map((o) => o.label);
    expect(labels).toEqual(['Use', 'Drop', 'Examine', 'Cancel']);
  });
  it('omits Use when unavailable', () => {
    const a = { ...mk(), use: undefined };
    expect(itemMenuOptions(a, true).map((o) => o.label)).toEqual([
      'Light',
      'Drop',
      'Examine',
      'Cancel',
    ]);
  });
});
