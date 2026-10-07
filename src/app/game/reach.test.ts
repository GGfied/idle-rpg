import { describe, expect, it } from 'vitest';
import { CONTENT } from '@app/registry';
import { canTalk, findPathToTalk, talkTiles } from '@app/game/reach';

const npc = { x: 12, y: 8 };
const booth = { x: 12, y: 9 };
const isCounter = (t: { x: number; y: number }): boolean => t.x === booth.x && t.y === booth.y;

describe('canTalk', () => {
  it('reaches an adjacent tile', () => {
    expect(canTalk({ x: 11, y: 8 }, npc, isCounter)).toBe(true);
  });
  it('reaches two tiles away in a straight line through a counter', () => {
    expect(canTalk({ x: 12, y: 10 }, npc, isCounter)).toBe(true);
  });
  it('does not reach two tiles away with no counter between', () => {
    expect(canTalk({ x: 12, y: 6 }, npc, isCounter)).toBe(false);
  });
  it('does not reach diagonally or off the line', () => {
    expect(canTalk({ x: 11, y: 10 }, npc, isCounter)).toBe(false);
    expect(canTalk({ x: 13, y: 9 }, npc, isCounter)).toBe(false);
  });
  it('does not reach three tiles away', () => {
    expect(canTalk({ x: 12, y: 11 }, npc, isCounter)).toBe(false);
  });
});

describe('talkTiles / findPathToTalk', () => {
  it('lists the tile beyond a counter', () => {
    expect(talkTiles(npc, isCounter)).toContainEqual({ x: 12, y: 10 });
  });
  it('is [] when already in reach and a real path to the counter side otherwise', () => {
    expect(findPathToTalk(CONTENT.grid, { x: 12, y: 10 }, npc, CONTENT.isCounter)).toEqual([]);
    const p = findPathToTalk(CONTENT.grid, { x: 18, y: 15 }, npc, CONTENT.isCounter);
    expect(p).not.toBeNull();
    expect(canTalk(p![p!.length - 1]!, npc, CONTENT.isCounter)).toBe(true);
  });
  it('is null when nothing around the target is reachable', () => {
    const walled = { ...CONTENT.grid, isWalkable: () => false };
    expect(findPathToTalk(walled, { x: 1, y: 1 }, npc, CONTENT.isCounter)).toBeNull();
  });
});
