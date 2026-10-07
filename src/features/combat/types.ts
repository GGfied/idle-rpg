import type { GameEvent } from '@core/contracts';

/** The player's hitpoints. Max HP is not stored: it comes from the Hitpoints level, passed in. */
export interface PlayerHpState {
  current: number;
  /** Ticks spent below (or above) max since the last regen/decay step. Reset at max. */
  regenTicks: number;
}

export interface HpChangedEvent extends GameEvent {
  type: 'hpChanged';
  current: number;
  max: number;
}

export type CombatEvent = HpChangedEvent;
