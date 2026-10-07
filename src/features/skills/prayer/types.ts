import type { GameEvent } from '@core/contracts';

/** Current prayer points. Max is the Prayer level and is passed in by the caller. */
export interface PrayerPointsState {
  current: number;
}

export interface PrayerChangedEvent extends GameEvent {
  type: 'prayerChanged';
  current: number;
  max: number;
}

export type PrayerEvent = PrayerChangedEvent;

/**
 * A prayer, as data. Later this gains an `effect` implementing core/contracts `CombatModifier`
 * (not in contracts yet) and a conflict group; entries go in `PRAYERS`, never in branches.
 */
export interface PrayerDef {
  id: string;
  level: number;
  /** Prayer points drained per tick while active. */
  drainPerTick: number;
}

/** Serialized save slice. */
export interface PrayerPointsSave {
  current: number;
}
