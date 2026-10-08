import { asPlayerLookId, PLAYER_LOOKS, type PlayerLookId } from '@render/index';
import type { FigureLook } from '@render/index';

/** What a look switch touches: the body view and the overlay rig (recreated, as it caches the look). */
export interface LookTargets {
  view: { setLook?(look: FigureLook): void };
  /** Destroys the old rig and builds a new one for `look`. */
  rebuildAnimator(look: FigureLook): void;
}

/** The look id a stored pref means (unknown or missing falls back to male). */
export function lookIdFromPrefs(prefs: { playerLook?: unknown }): PlayerLookId {
  return asPlayerLookId(prefs.playerLook);
}

/**
 * Switches the live player to the pref's look when it differs from `current`.
 * Returns the id now shown, so the caller keeps it as `current`.
 */
export function applyPlayerLook(
  prefs: { playerLook?: unknown },
  current: PlayerLookId,
  targets: LookTargets,
): PlayerLookId {
  const next = lookIdFromPrefs(prefs);
  if (next === current) return current;
  const look = PLAYER_LOOKS[next];
  targets.view.setLook?.(look);
  targets.rebuildAnimator(look);
  return next;
}
