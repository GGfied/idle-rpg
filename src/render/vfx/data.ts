import { ISO } from '@render/index';
import type { BlockedLabel, EffectDef, VfxCue, VfxLimits } from './types';

/** Same blocked cue plays at most once per this many ms (the game can re-emit every tick). */
export const BLOCKED_THROTTLE_MS = 600;

/** Game event type -> cues to play. New events are new entries here. */
export const EVENT_VFX: Readonly<Record<string, readonly VfxCue[]>> = {
  itemGathered: [{ effect: 'woodChips', at: 'node' }],
  xpGained: [{ effect: 'xpDrop', at: 'player' }],
  levelUp: [
    { effect: 'levelUpRing', at: 'player' },
    { effect: 'levelUpSparkle', at: 'player' },
  ],
  nodeDepleted: [{ effect: 'treeFallDust', at: 'node' }],
  // gatherStopped: depleted / cancelled / unknown reasons match no cue and play nothing.
  gatherStopped: [
    {
      effect: 'blockedCross',
      at: 'node',
      when: { reason: 'levelTooLow' },
      throttleMs: BLOCKED_THROTTLE_MS,
    },
    {
      effect: 'blockedText',
      at: 'player',
      when: { reason: 'levelTooLow' },
      throttleMs: BLOCKED_THROTTLE_MS,
    },
    {
      effect: 'blockedCross',
      at: 'node',
      when: { reason: 'noTool' },
      throttleMs: BLOCKED_THROTTLE_MS,
    },
    {
      effect: 'blockedText',
      at: 'player',
      when: { reason: 'noTool' },
      throttleMs: BLOCKED_THROTTLE_MS,
    },
    {
      effect: 'blockedText',
      at: 'player',
      when: { reason: 'inventoryFull' },
      throttleMs: BLOCKED_THROTTLE_MS,
    },
  ],
};

/** Label per gatherStopped reason. `withField` wins when the event carries that field. */
export const BLOCKED_TEXT: Readonly<Record<string, BlockedLabel>> = {
  levelTooLow: {
    text: 'Level too low',
    withField: { field: 'requiredLevel', text: 'Level {value} needed' },
  },
  noTool: { text: 'No axe', withField: { field: 'tool', text: 'No {value}' } },
  inventoryFull: { text: 'Inventory full' },
};

export const EFFECTS: Readonly<Record<string, EffectDef>> = {
  woodChips: {
    kind: 'burst',
    layer: 'world',
    lift: 24,
    decorative: true,
    count: 6,
    colors: [0x8b5a2b, 0x6b4423, 0xa8772f],
    size: [3, 5],
    spread: 16,
    rise: 14,
    fall: 10,
    lifeMs: 450,
    jitter: 4,
  },
  treeFallDust: {
    kind: 'burst',
    layer: 'world',
    lift: 6,
    decorative: true,
    count: 8,
    colors: [0xc8b89a, 0xb3a384, 0xd9cdb4],
    size: [4, 8],
    spread: 24,
    rise: 6,
    fall: -4,
    lifeMs: 650,
    round: true,
    jitter: 10,
  },
  levelUpSparkle: {
    kind: 'burst',
    layer: 'overhead',
    lift: 40,
    decorative: true,
    count: 12,
    colors: [0xffe14d, 0xffffff, 0xffb830],
    size: [2, 4],
    spread: 30,
    rise: 34,
    fall: -10,
    lifeMs: 800,
    jitter: 6,
  },
  levelUpRing: {
    kind: 'ring',
    layer: 'ground',
    squashY: 0.5,
    color: 0xffe14d,
    radius: [10, 48],
    width: 3,
    lifeMs: 600,
  },
  xpDrop: {
    kind: 'xpDrop',
    layer: 'overhead',
    lift: 56,
    riseY: 34,
    lifeMs: 1100,
    fontPx: 14,
    defaultColor: '#ffffff',
  },
  clickMarker: {
    kind: 'marker',
    layer: 'ground',
    colors: { walk: 0xffee33, interact: 0xff3b30 },
    halfW: ISO.tileWidth / 2,
    halfH: ISO.tileHeight / 2,
    lifeMs: 450,
  },
  blockedCross: {
    kind: 'cross',
    layer: 'world',
    lift: 24,
    color: 0xff3b30,
    half: 9,
    fromScale: 0.5,
    toScale: 1.3,
    lifeMs: 500,
  },
  blockedText: {
    kind: 'blockedText',
    layer: 'overhead',
    lift: 56,
    color: '#ff5a4d',
    fontPx: 14,
    riseY: 14,
    lifeMs: 1000,
    shakePx: 3,
    shakeMs: 50,
    shakes: 3,
  },
};

/** Short XP-drop tag per skill (colour comes from core/progression via createVfx's `skillColor`). Unknown skills use the first 3 letters. */
export const SKILL_TAG: Readonly<Record<string, string>> = {
  woodcutting: 'WC',
  mining: 'MN',
  fishing: 'FS',
  cooking: 'CK',
  smithing: 'SM',
  crafting: 'CR',
};

/** 'reduced' mode shortens kept effects to this fraction of their duration (and removes burst jitter). */
export const REDUCED_LIFE_SCALE = 0.6;

/** Caps. Phones get the smaller set, chosen by data (pass to createVfx). */
export const LIMITS_DESKTOP: VfxLimits = { texts: 20, particles: 64, rings: 8, markers: 4 };
export const LIMITS_MOBILE: VfxLimits = { texts: 12, particles: 32, rings: 4, markers: 3 };

/** Drops spawned within this window stack upward instead of overlapping. */
export const XP_STACK_WINDOW_MS = 700;
export const XP_STACK_LINE_PX = 16;
