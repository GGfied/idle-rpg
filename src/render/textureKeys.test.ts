import { describe, expect, it } from 'vitest';
import { FLAME_LAYERS } from '@render/fireArt';
import { fireTextureKeys } from '@render/fireTextures';
import { groundTextureKey } from '@render/groundTextures';
import type { GroundKind } from '@render/groundTextures';

const GROUND: GroundKind[] = [
  'grass',
  'path',
  'water',
  'waterdetail',
  'sand',
  'wall',
  'flowers',
  'floor',
  'bridge',
];

describe('generated texture keys', () => {
  it('fire keys never collide with ground/water keys or each other', () => {
    const fire = [
      fireTextureKeys.base(false),
      fireTextureKeys.base(true),
      fireTextureKeys.front(false),
      fireTextureKeys.front(true),
      ...FLAME_LAYERS.map((l) => fireTextureKeys.flame(l)),
      fireTextureKeys.glow,
      fireTextureKeys.embers,
      fireTextureKeys.ashes,
      fireTextureKeys.logPile('logs'),
    ];
    const ground = new Set<string>();
    for (const k of GROUND) for (let v = 0; v < 8; v++) ground.add(groundTextureKey(k, v));
    expect(new Set(fire).size).toBe(fire.length);
    for (const k of fire) expect(ground.has(k), k).toBe(false);
    expect(groundTextureKey('water', 0)).toBe('ground_water_0');
  });
});
