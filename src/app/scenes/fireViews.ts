/**
 * Fire views for the world scene: graphics' `createFireView` per fire, driven by the shared flame flicker.
 * The lifecycle rules (create, dying for the last 10%, flicker removed before destroy) are pure in fireLifecycle.ts.
 */
import type Phaser from 'phaser';
import { createFireView, createLogPileView } from '@render/index';
import type { HitKind } from '@render/index';
import type { FlameFlicker } from '@render/animation';
import { LIGHTABLE_LOGS } from '@features/facilities';
import type { FireState } from '@features/facilities';
import { createFireLifecycle } from '@app/scenes/fireLifecycle';
import type { LightingLike } from '@app/scenes/fireLifecycle';

/** Hit bounds kind for a fire: render's own fire bounds (the flames and logs). */
export const FIRE_HIT_KIND: HitKind = 'fire';

export interface FireViews {
  /** Make the drawn fires match the game's fires (adds new, removes gone) and their dying state at `tick`. */
  sync(fires: readonly FireState[], tick: number, lighting?: LightingLike | null): void;
  destroy(): void;
}

export function createFireViews(scene: Phaser.Scene, flicker: FlameFlicker): FireViews {
  return createFireLifecycle(
    (tile) => createFireView(scene, tile),
    flicker,
    (logsId) => LIGHTABLE_LOGS[logsId]?.burnTicks,
    (tile, logsId) => createLogPileView(scene, tile, logsId),
  );
}
