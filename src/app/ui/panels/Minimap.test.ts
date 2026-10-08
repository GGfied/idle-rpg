import { describe, expect, it } from 'vitest';
import { resourceMarkers } from '@app/ui/panels/Minimap';

type C = Parameters<typeof resourceMarkers>[0];
type G = Parameters<typeof resourceMarkers>[1];

const content = {
  trees: new Map([
    ['t1', { nodeId: 't1', defId: 'tree', x: 1, y: 1 }],
    ['t2', { nodeId: 't2', defId: 'oak_tree', x: 2, y: 1 }],
    ['t3', { nodeId: 't3', defId: 'mystery_tree', x: 3, y: 1 }],
  ]),
  rocks: new Map(
    (['copper_rock', 'tin_rock', 'iron_rock', 'coal_rock'] as const).map((defId, i) => [
      `r${i}`,
      { nodeId: `r${i}`, defId, x: 10 + i, y: 5 },
    ]),
  ),
  fishingSpots: new Map([
    [
      's_net',
      {
        spotId: 's_net',
        defId: 'net_spot',
        tiles: [
          { x: 20, y: 20 },
          { x: 21, y: 20 },
        ],
      },
    ],
    ['s_bait', { spotId: 's_bait', defId: 'bait_spot', tiles: [{ x: 30, y: 30 }] }],
  ]),
} as unknown as C;

const game = (nodes: object = {}, spots: object = {}): G =>
  ({ gathering: { nodes }, fishing: { spots } }) as unknown as G;

describe('resourceMarkers', () => {
  it('maps each rock def to its ore marker kind', () => {
    const kinds = resourceMarkers(content, game())
      .filter((m) => m.kind.startsWith('rock_'))
      .map((m) => m.kind);
    expect(kinds).toEqual(['rock_copper', 'rock_tin', 'rock_iron', 'rock_coal']);
  });

  it('maps tree defs to per-type kinds, unknown to tree_normal', () => {
    const kinds = resourceMarkers(content, game())
      .filter((m) => m.tile.y === 1)
      .map((m) => m.kind);
    expect(kinds).toEqual(['tree_normal', 'tree_oak', 'tree_normal']);
  });

  it('stumps only the depleted tree', () => {
    const kinds = resourceMarkers(content, game({ t2: { respawnAt: 9 } }))
      .filter((m) => m.tile.y === 1)
      .map((m) => m.kind);
    expect(kinds).toEqual(['tree_normal', 'stump', 'tree_normal']);
  });

  it('maps spot defs to net/bait kinds', () => {
    const kinds = resourceMarkers(content, game())
      .filter((m) => m.kind.startsWith('spot_'))
      .map((m) => m.kind);
    expect(kinds).toEqual(['spot_net', 'spot_bait']);
  });

  it('passes depleted through for rocks and stumps trees', () => {
    const ms = resourceMarkers(content, game({ r1: { respawnAt: 50 }, t1: { respawnAt: 9 } }));
    const rock = (k: string) => ms.find((m) => m.kind === k)!;
    expect(rock('rock_tin').depleted).toBe(true);
    expect(rock('rock_copper').depleted).toBe(false);
    expect(ms.some((m) => m.kind === 'stump')).toBe(true);
  });

  it('moves a spot marker when its tile index changes', () => {
    const at = (tile: number) =>
      resourceMarkers(content, game({}, { s_net: { tile } })).find((m) => m.kind === 'spot_net')!
        .tile;
    expect(at(0)).toEqual({ x: 20, y: 20 });
    expect(at(1)).toEqual({ x: 21, y: 20 });
  });
});
