import { describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { MapExpandButton, minimapMarkers, tapToWalk, trailFacing } from '@app/ui/panels/Minimap';
import { WorldMapShell } from '@app/ui/panels/WorldMapOverlay';

type Props = Record<string, unknown> & { children?: unknown };
const props = (el: ReactElement): Props => el.props as Props;
const kids = (el: ReactElement): ReactElement[] =>
  [props(el).children].flat().filter((c): c is ReactElement => typeof c === 'object' && c !== null);

describe('minimap tap vs expand', () => {
  const view = { centre: { x: 50, y: 50 }, radiusPx: 80, pxPerTile: 4 };
  const rect = { left: 0, top: 0, width: 160, height: 160 };
  it('a minimap tap walks and never opens the overlay', () => {
    const walkTo = vi.fn();
    const onOpen = vi.fn();
    expect(
      tapToWalk({ clientX: 80, clientY: 80 }, rect, { width: 160, height: 160 }, view, walkTo),
    ).toBe(true);
    expect(walkTo).toHaveBeenCalledWith({ x: 50, y: 50 });
    expect(onOpen).not.toHaveBeenCalled();
  });
  it('the icon opens it', () => {
    const onOpen = vi.fn();
    (props(MapExpandButton({ onOpen })).onClick as () => void)();
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});

describe('WorldMapShell', () => {
  const make = () => {
    const onClose = vi.fn();
    const onCentre = vi.fn();
    const root = WorldMapShell({ onClose, onCentre, children: null });
    return { root, onClose, onCentre };
  };
  it('tap on the backdrop closes, tap inside does not', () => {
    const { root, onClose } = make();
    const down = props(root).onPointerDown as (e: unknown) => void;
    const el = {};
    down({ target: el, currentTarget: el });
    expect(onClose).toHaveBeenCalledTimes(1);
    down({ target: {}, currentTarget: el });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  it('X closes and Centre on me re-centres', () => {
    const { root, onClose, onCentre } = make();
    const buttons = kids(kids(root)[0]!).filter((c) => c.type === 'button');
    (props(buttons[0]!).onClick as () => void)();
    (props(buttons[1]!).onClick as () => void)();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onCentre).toHaveBeenCalledTimes(1);
  });
});

describe('minimapMarkers', () => {
  it('builds banks, npcs, destination and the player last', () => {
    const content = {
      objects: new Map([['b', { x: 1, y: 1 }]]),
      npcs: new Map([['n', { x: 2, y: 2 }]]),
      trees: new Map(),
      rocks: new Map(),
      fishingSpots: new Map(),
    } as unknown as Parameters<typeof minimapMarkers>[0];
    const g = {
      gathering: { nodes: {} },
      fishing: { spots: {} },
      movement: { destination: { x: 9, y: 9 }, path: [] },
    } as unknown as Parameters<typeof minimapMarkers>[1];
    const m = minimapMarkers(content, g, { x: 5, y: 5 });
    expect(m.map((x) => x.kind)).toEqual(['bank', 'npc', 'destination', 'player']);
    expect(m[3]!.tile).toEqual({ x: 5, y: 5 });
  });
});

describe('player facing', () => {
  it('marker carries the heading of the last step and keeps it when stopped', () => {
    const content = {
      objects: new Map(),
      npcs: new Map(),
      trees: new Map(),
      rocks: new Map(),
      fishingSpots: new Map(),
    } as unknown as Parameters<typeof minimapMarkers>[0];
    const g = {
      gathering: { nodes: {} },
      fishing: { spots: {} },
      movement: { path: [] },
    } as unknown as Parameters<typeof minimapMarkers>[1];
    const east = trailFacing({ from: { x: 1, y: 1 }, to: { x: 2, y: 1 } });
    expect(east).toBeCloseTo(0);
    const south = trailFacing({ from: { x: 2, y: 1 }, to: { x: 2, y: 2 } });
    const stopped = trailFacing({ from: { x: 2, y: 2 }, to: { x: 2, y: 2 } });
    expect(stopped).toBe(south);
    const player = minimapMarkers(content, g, { x: 2, y: 2 }, stopped).find(
      (m) => m.kind === 'player',
    );
    expect(player?.facing).toBeCloseTo(Math.PI / 2);
  });
});
