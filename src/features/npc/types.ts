import type { GameEvent } from '@core/contracts';

/** Sprite keys NPC defs may use (graphics provides the art; keep in step with render's NpcSpriteKey). */
export type NpcSpriteKey = 'banker';

export type Facing = 'north' | 'south' | 'east' | 'west';

/** What choosing an option does. The integrator maps it to the dialogue / panel (ids only). */
export type NpcIntent = { type: 'talk'; dialogueId: string } | { type: 'openPanel'; panel: string };

export interface NpcOption {
  id: string;
  label: string;
  intent: NpcIntent;
}

/**
 * Behaviour as data. Only `idle` exists today. Extension point: add a variant here (e.g. `wander`
 * with a radius) and a handler under the same `kind` in `BEHAVIOUR_HANDLERS` (logic.ts).
 */
export type BehaviourDef = { kind: 'idle' };

export interface NpcDef {
  id: string;
  name: string;
  examine: string;
  /** Sprite key resolved by `graphics`. */
  spriteKey: NpcSpriteKey;
  /** Footprint in tiles (square). */
  size: 1;
  options: NpcOption[];
  behaviour: BehaviourDef;
}

/** A spawn entry as supplied by the integrator from `map`'s NPC_SPAWNS. */
export interface NpcSpawn {
  spawnId: string;
  npcId: string;
  x: number;
  y: number;
  wanderRadius: number;
  /** Direction the NPC faces (e.g. toward the counter). Defaults to 'south'. */
  facing?: Facing;
}

export interface NpcInstance {
  spawnId: string;
  npcId: string;
  x: number;
  y: number;
  facing: Facing;
}

/** NPC runtime state. Not persisted: instances are static and rebuilt from spawns on load. */
export interface NpcState {
  instances: NpcInstance[];
}

/** Reserved for future behaviour events (e.g. an npcWalkIntent for wander). None today. */
export type NpcEvent = GameEvent;
