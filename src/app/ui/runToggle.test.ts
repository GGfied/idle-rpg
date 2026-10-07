import { describe, expect, it } from 'vitest';
import { runTapOutcome } from './runToggle';

describe('runTapOutcome', () => {
  it('rejects turning run on below the minimum energy', () => {
    expect(runTapOutcome(false, 0, 100)).toBe('rejectedLowEnergy');
    expect(runTapOutcome(false, 99, 100)).toBe('rejectedLowEnergy');
  });
  it('allows turning run on at or above the minimum', () => {
    expect(runTapOutcome(false, 100, 100)).toBe('toggle');
  });
  it('always allows turning run off', () => {
    expect(runTapOutcome(true, 0, 100)).toBe('toggle');
  });
});
