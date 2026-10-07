import { describe, expect, it } from 'vitest';
import { stepToVolume, volumeToStep } from './volumeSteps';

describe('volumeSteps', () => {
  it('maps steps to 0, 0.2 .. 1', () => {
    expect([0, 1, 2, 3, 4, 5].map(stepToVolume)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
  });
  it('snaps an existing volume to the nearest step', () => {
    expect(volumeToStep(0.7)).toBe(4);
    expect(volumeToStep(0.69)).toBe(3);
    expect(volumeToStep(0.05)).toBe(0);
    expect(volumeToStep(0.11)).toBe(1);
  });
  it('clamps and survives junk', () => {
    expect(volumeToStep(2)).toBe(5);
    expect(volumeToStep(-1)).toBe(0);
    expect(volumeToStep(NaN)).toBe(0);
    expect(stepToVolume(9)).toBe(1);
    expect(stepToVolume(NaN)).toBe(0);
  });
  it('round-trips every step', () => {
    for (let i = 0; i <= 5; i++) expect(volumeToStep(stepToVolume(i))).toBe(i);
  });
});
