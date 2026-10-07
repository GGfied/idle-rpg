import type { Preferences } from '@core/persistence';

type Visuals = Preferences['visuals'];

/** What the scene drives from preferences; the real `Vfx` and `PlayerAnimator` satisfy these. */
export interface PrefTargets {
  vfx?: { setMode(mode: Visuals['vfx']): void; setXpDrops(enabled: boolean): void };
  animator?: { setMode(mode: Visuals['animations']): void };
}

/** Pushes the visual and notification preferences into the live render systems (pure glue, no Phaser). */
export function applyVisualPrefs(prefs: Preferences, targets: PrefTargets): void {
  targets.vfx?.setMode(prefs.visuals.vfx);
  targets.vfx?.setXpDrops(prefs.notifications.xpDrops);
  targets.animator?.setMode(prefs.visuals.animations);
}
