import { describe, expect, it } from 'vitest';
import { dragStarted, dropTarget, tapWhileUsing, useHintText } from './slotDrag';

describe('slotDrag', () => {
  it('starts a drag only past the threshold', () => {
    expect(dragStarted(0, 0)).toBe(false);
    expect(dragStarted(5, 5)).toBe(false);
    expect(dragStarted(6, 6)).toBe(true);
    expect(dragStarted(0, -8)).toBe(true);
  });
  it('drop target: other slot only', () => {
    expect(dropTarget(2, 5)).toBe(5);
    expect(dropTarget(2, 2)).toBeNull();
    expect(dropTarget(2, null)).toBeNull();
    expect(dropTarget(2, 0)).toBe(0);
  });
  it('tap while using', () => {
    expect(tapWhileUsing(null, 1)).toBeNull();
    expect(tapWhileUsing(1, 1)).toBe('cancel');
    expect(tapWhileUsing(1, 2)).toBe('useOn');
  });
  it('hint text', () => {
    expect(useHintText('Logs')).toBe('Use Logs → …');
  });
});
