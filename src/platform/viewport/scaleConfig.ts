import type Phaser from 'phaser';

/** Cap devicePixelRatio: sharp on retina phones without paying for 3x fill-rate. */
export const MAX_DEVICE_PIXEL_RATIO = 2;

export function cappedPixelRatio(raw: number = globalThis.devicePixelRatio ?? 1): number {
  return Math.min(Math.max(raw, 1), MAX_DEVICE_PIXEL_RATIO);
}

/**
 * Phaser game config `scale` block. `mode: 5` is `Phaser.Scale.RESIZE` (3 is FIT; asserted by scaleConfig.test.ts; written as a literal
 * because platform only imports Phaser types). The canvas follows its parent, so the parent
 * element must fill the viewport (`height: 100dvh`).
 * Phaser 3.90's Scale manager renders at CSS-pixel size; use `cappedPixelRatio()` if the
 * integrator later adds a render-resolution multiplier.
 */
export const phaserScaleConfig: Phaser.Types.Core.ScaleConfig = {
  mode: 5,
  width: '100%',
  height: '100%',
};
