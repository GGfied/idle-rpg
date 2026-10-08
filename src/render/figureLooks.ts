import type { FigureLook } from './figureArt';

/** NPC figure art keys (the `spriteKey` on NpcDefs). */
export type NpcSpriteKey = 'banker' | 'banker_f' | 'villager' | 'villager_f';

/** Selectable player looks (Settings). Same rigged outfit, different hair and skin: data only. */
export type PlayerLookId = 'player' | 'player_f';

const PLAYER_BASE: FigureLook = {
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
  // The animation rig draws both arm segments and both legs, so the body has none of them.
  rigArms: true,
  rigUpperArms: true,
  rigLegs: true,
};

/** Player looks by id. The outfit (top/trim/pants/boots) must stay equal: the rig sleeve/boots match it. */
export const PLAYER_LOOKS: Record<PlayerLookId, FigureLook> = {
  player: PLAYER_BASE,
  player_f: { ...PLAYER_BASE, skin: 0xf0c4a2, hair: 0x7a3a22, hairStyle: 'long' },
};

/** The default (male) player look. */
export const PLAYER_LOOK: FigureLook = PLAYER_LOOKS.player;

/** Narrow a saved/unknown string to a player look id (default 'player'). */
export function asPlayerLookId(id: unknown): PlayerLookId {
  return typeof id === 'string' && Object.hasOwn(PLAYER_LOOKS, id)
    ? (id as PlayerLookId)
    : 'player';
}

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
