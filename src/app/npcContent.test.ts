import { describe, expect, it } from 'vitest';
import { portraitLook } from '@render/index';
import { NPC_DEFS } from '@features/npc';
import { WORLD_NPC_SPAWNS } from '@features/world';
import { createAppStore } from '@app/store';
import { CONTENT } from '@app/registry';
import { startTalk } from '@app/game/dialogue';
import { newGame } from '@app/game/newGame';

describe('NPC content joins up across layers', () => {
  it('every NpcDef spriteKey has a render look', () => {
    for (const d of NPC_DEFS) expect(portraitLook(d.spriteKey), d.id).toBeDefined();
  });
  it('every world NPC spawn names a registered NpcDef', () => {
    const ids = new Set(NPC_DEFS.map((d) => d.id));
    for (const s of WORLD_NPC_SPAWNS)
      expect(ids.has(s.npcId), `${s.spawnId}: ${s.npcId}`).toBe(true);
  });
  it('a conversation exposes the talked-to NPC sprite key as speakerLook', () => {
    for (const s of WORLD_NPC_SPAWNS) {
      const def = NPC_DEFS.find((d) => d.id === s.npcId)!;
      const store = createAppStore(
        startTalk(newGame(CONTENT), s.spawnId, 'banker_greeting'),
        CONTENT,
      );
      expect(store.getState().speakerLook, s.spawnId).toBe(def.spriteKey);
    }
    expect(createAppStore(newGame(CONTENT), CONTENT).getState().speakerLook).toBeNull();
  });
});
