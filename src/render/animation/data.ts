import type { AnimInput, AnimState, AnimStateDef, MotionMode, MotionParams } from './types';

export const TICK_MS = 600;

/** Chop swing: one full back-swing + strike every 4 game ticks. */
export const CHOP_TICKS = 4;
export const CHOP_SWING_PERIOD_MS = CHOP_TICKS * TICK_MS;

/** Walk cycle length (one full left+right step). */
export const WALK_CYCLE_MS = 520;

/** Which gather state a tool kind starts. New skills add an entry here (and a state below). */
export const GATHER_STATE_BY_TOOL: Readonly<Record<string, AnimState>> = {
  axe: 'chop',
};

/** Walking beats gathering (moving cancels a session); gathering beats idle. */
export const ANIM_STATES: Readonly<Record<AnimState, AnimStateDef>> = {
  idle: { priority: 0, applies: () => true },
  chop: {
    priority: 1,
    applies: (i: AnimInput) => i.gathering && GATHER_STATE_BY_TOOL[i.toolKind ?? ''] === 'chop',
  },
  walk: { priority: 2, applies: (i: AnimInput) => i.moving },
};

/** Tool tint by item id; unknown ids use DEFAULT_TOOL_TINT. */
export const TOOL_TINTS: Readonly<Record<string, number>> = {
  bronze_axe: 0xb07a3c,
  iron_axe: 0x8a8f96,
  steel_axe: 0xb9c2cc,
};
export const DEFAULT_TOOL_TINT = 0xb07a3c;
export const AXE_HANDLE_COLOR = 0x6b4a2b;

/** Reduced mode fades are capped well under the 120 ms budget. */
export const REDUCED_FADE_MS = 100;

/** Animation parameters per motion mode. The caller (preferences) picks the mode. */
export const MOTION: Readonly<Record<MotionMode, MotionParams>> = {
  on: {
    walkScale: 1,
    chopStyle: 'swing',
    fallMs: 450,
    fallTiltDeg: 35,
    regrowMs: 280,
    regrowFromScale: 0.6,
  },
  reduced: {
    walkScale: 0,
    chopStyle: 'tap',
    fallMs: REDUCED_FADE_MS,
    fallTiltDeg: 0,
    regrowMs: REDUCED_FADE_MS,
    regrowFromScale: 1,
  },
  off: {
    walkScale: 0,
    chopStyle: 'static',
    fallMs: 0,
    fallTiltDeg: 0,
    regrowMs: 0,
    regrowFromScale: 1,
  },
};
