import { err, ok, type Result } from '@core/utils';
import { MAX_XP, SKILL_IDS } from './data';
import { createProgressionState } from './logic';
import type { ProgressionState } from './types';

/** Save slice shape: `{ xp: { [skillId]: number } }`. Plain JSON data. */
export function serializeProgression(state: ProgressionState): unknown {
  return { xp: { ...state.xp } };
}

/**
 * Validates untrusted data. Unknown keys (including `__proto__`) are ignored, so
 * saves from a build that had since-removed skills still load. Skills missing from
 * the data take their `createProgressionState()` default. A present skill whose xp
 * is not a finite number in 0..MAX_XP rejects the whole slice.
 */
export function deserializeProgression(data: unknown): Result<ProgressionState, string> {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return err('progression: expected an object');
  }
  if (!Object.hasOwn(data, 'xp')) return err('progression: missing xp');
  const raw = (data as { xp: unknown }).xp;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return err('progression: xp must be an object');
  }
  const state = createProgressionState();
  for (const id of SKILL_IDS) {
    if (!Object.hasOwn(raw, id)) continue;
    const v = (raw as Record<string, unknown>)[id];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > MAX_XP) {
      return err(`progression: invalid xp for ${id}`);
    }
    state.xp[id] = v;
  }
  return ok(state);
}
