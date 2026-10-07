export { NPC_DEFS, REFERENCED_DIALOGUE_IDS, REFERENCED_PANEL_IDS } from './data';
export { createNpcState, getNpcDef, intentFor, optionsFor, spawnNpcs, tickNpcs } from './logic';
export type {
  BehaviourDef,
  Facing,
  NpcDef,
  NpcEvent,
  NpcInstance,
  NpcIntent,
  NpcOption,
  NpcSpawn,
  NpcSpriteKey,
  NpcState,
} from './types';
