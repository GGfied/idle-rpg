/** OSRS-style volume steps: Off, 1..5 map to 0, 0.2 .. 1 (stored volumes stay 0..1). */
export const STEP_COUNT = 5;

export function stepToVolume(step: number): number {
  const s = Number.isFinite(step) ? Math.min(STEP_COUNT, Math.max(0, Math.round(step))) : 0;
  return s / STEP_COUNT;
}

/** Nearest step for any stored volume, for display. */
export function volumeToStep(volume: number): number {
  if (!Number.isFinite(volume)) return 0;
  return Math.round(Math.min(1, Math.max(0, volume)) * STEP_COUNT);
}
