import { describe, expect, it } from 'vitest';
// Phaser's own constants source (the root 'phaser' import needs a browser to load).
import scaleModesSource from 'phaser/src/scale/const/SCALE_MODE_CONST.js?raw';
import { phaserScaleConfig } from './scaleConfig';

function phaserScaleMode(name: string): number {
  const match = new RegExp(`^\\s*${name}:\\s*(\\d+),`, 'm').exec(scaleModesSource);
  if (!match) throw new Error(`Phaser ScaleModes.${name} not found`);
  return Number(match[1]);
}

describe('phaserScaleConfig', () => {
  it("uses the installed Phaser's RESIZE value (not FIT)", () => {
    expect(phaserScaleMode('RESIZE')).toBe(5);
    expect(phaserScaleConfig.mode).toBe(phaserScaleMode('RESIZE'));
    expect(phaserScaleConfig.mode).not.toBe(phaserScaleMode('FIT'));
  });
});
