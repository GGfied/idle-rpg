/**
 * The overhead "blocked" flash is vfx data keyed on `gatherStopped`. Fishing stops with its own
 * `fishingStopped`; re-shape it so the SAME cues (text, cross, throttle) play, with no second copy.
 * spotMoved and cancelled are not blocks: they pass through unchanged (no cue matches them).
 */
const BLOCKING = new Set(['levelTooLow', 'noTool', 'noBait', 'inventoryFull']);

export interface FlashEvent {
  type: string;
  [key: string]: unknown;
}

export function flashEvent(f: FlashEvent): FlashEvent {
  if (f.type !== 'fishingStopped' || typeof f.reason !== 'string' || !BLOCKING.has(f.reason))
    return f;
  const { spotId, ...rest } = f;
  return { ...rest, type: 'gatherStopped', nodeId: spotId };
}
