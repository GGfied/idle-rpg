import type { FigureLook } from './figureArt';

/** NPC figure art keys (the `spriteKey` on NpcDefs). */
export type NpcSpriteKey = 'banker' | 'banker_f' | 'villager' | 'villager_f';

/** The player. `rigArms`: the animation rig draws both arm segments (rigUpperArms), so the body has no arms. */
export const PLAYER_LOOK: FigureLook = {
  skin: 0xe8b88a,
  hair: 0x5a3b1f,
  hairStyle: 'short',
  outfit: 'tunic',
  top: 0x3a4a8c,
  trim: 0x6a78b8,
  pants: 0x2b2b3a,
  boots: 0x23232f,
  belt: 0x4a3120,
  metal: 0xc9a24a,
  rigArms: true,
  rigUpperArms: true,
  rigLegs: true,
};

/** One look per NPC `spriteKey`: outfit, hair and skin are data, never branches. */
export const NPC_LOOKS: Record<NpcSpriteKey, FigureLook> = {
  banker: {
    skin: 0xe0b08a,
    hair: 0xa8a8b0,
    hairStyle: 'short',
    outfit: 'coat',
    top: 0x1c2230,
    trim: 0x2c3548,
    pants: 0x14171f,
    boots: 0x0f1014,
    metal: 0xe0b84a,
    shirt: 0xeeeae0,
  },
  banker_f: {
    skin: 0xf0c4a2,
    hair: 0x2a1820,
    hairStyle: 'long',
    outfit: 'coat',
    top: 0x1c2230,
    trim: 0x2c3548,
    pants: 0x14171f,
    boots: 0x0f1014,
    metal: 0xe0b84a,
    shirt: 0xf6f2ea,
  },
  villager: {
    skin: 0xd9a073,
    hair: 0x7a4a24,
    hairStyle: 'short',
    outfit: 'tunic',
    top: 0x8a6a3a,
    trim: 0xb89a5a,
    pants: 0x4a3a2a,
    boots: 0x2e2218,
    belt: 0x3a2818,
  },
  villager_f: {
    skin: 0xf0c4a0,
    hair: 0xc8923a,
    hairStyle: 'long',
    outfit: 'tunic',
    top: 0x9a3a46,
    trim: 0xd8b0a0,
    pants: 0x5a3a3a,
    boots: 0x3a2418,
    belt: 0x5a3a24,
    metal: 0xc9a24a,
  },
};
