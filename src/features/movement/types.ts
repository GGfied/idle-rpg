import type { GameEvent, Tile } from '@core/contracts';

export interface MovementState {
  position: Tile;
  /** Remaining steps; excludes the current position, next step first. */
  path: Tile[];
  running: boolean;
  /** Run energy in hundredths of a percent: 0..10000 = 0.00..100.00%. */
  runEnergy: number;
}

export interface EntityMovedEvent extends GameEvent {
  type: 'entityMoved';
  from: Tile;
  to: Tile;
}

export interface DestinationReachedEvent extends GameEvent {
  type: 'destinationReached';
  position: Tile;
}

/** The next step became unwalkable; the path was dropped. */
export interface MovementBlockedEvent extends GameEvent {
  type: 'movementBlocked';
  position: Tile;
}

/** Run energy hit 0 and running was switched off. */
export interface RunDisabledEvent extends GameEvent {
  type: 'runDisabled';
}

/** Emitted only when the displayed whole percent changes. `energy` is in hundredths. */
export interface RunEnergyChangedEvent extends GameEvent {
  type: 'runEnergyChanged';
  energy: number;
}

export type MovementEvent =
  | EntityMovedEvent
  | DestinationReachedEvent
  | MovementBlockedEvent
  | RunDisabledEvent
  | RunEnergyChangedEvent;

export interface PathOptions {
  /** Max nodes expanded before giving up. Default MAX_SEARCH_NODES. */
  maxNodes?: number;
}
