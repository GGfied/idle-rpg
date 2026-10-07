import type { Facing8 } from '@render/index';
import type {
  AnimInput,
  AnimState,
  AnimStateDef,
  GaitDef,
  GaitKey,
  MotionMode,
  MotionParams,
  SwayParams,
} from './types';

export const TICK_MS = 600;

/** Chop swing: one full back-swing + strike every 4 game ticks. */
export const CHOP_TICKS = 4;
export const CHOP_SWING_PERIOD_MS = CHOP_TICKS * TICK_MS;
/** Swing phase (0..1) where the strike ends and the axe lands. chopAngle and tapAngle use it too. */
export const SWING_IMPACT_PHASE = 0.68;

/** Walk cycle length (one full left+right step). */
export const WALK_CYCLE_MS = 520;
/** Run covers two tiles a tick, so its cycle is shorter and the feet still do not skate. */
export const RUN_CYCLE_MS = 340;

/**
 * Gaits as data. Legs swing more than arms; the arm trails the opposite leg (contralateral), the forearm
 * trails the upper arm. Walk and run share every phase relation; run is faster, bigger and leans more.
 */
export const GAITS: Readonly<Record<GaitKey, GaitDef>> = {
  walk: {
    cycleMs: WALK_CYCLE_MS,
    thighDeg: 25,
    kneeDeg: 35,
    armDeg: 16,
    elbowDeg: 8,
    armLag: 0.07,
    forearmLag: 0.04,
    bobPx: 0.9,
    leanDeg: 2,
  },
  run: {
    cycleMs: RUN_CYCLE_MS,
    thighDeg: 38,
    kneeDeg: 60,
    armDeg: 28,
    elbowDeg: 30,
    armLag: 0.07,
    forearmLag: 0.05,
    bobPx: 1.4,
    leanDeg: 9,
  },
};

/** Idle breathing: a tiny body bob (art px) and its period. Zero in reduced/off via walkScale. */
export const BREATH_PX = 0.25;
export const BREATH_PERIOD_MS = 2800;

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
/** Forearm-local y of the fist: the axe is gripped here. */
export const AXE_GRIP_Y = 9;
/**
 * Back view: the swing runs towards/away from the camera, so its sideways reach is foreshortened to this
 * fraction (the arm then rises beside the head instead of sticking out across the screen).
 */
export const BACK_VIEW_SWING_REACH = 0.5;

export interface AxeRect {
  x: number;
  y: number;
  w: number;
  h: number;
  color: number;
  alpha: number;
}
/**
 * The axe in art px, origin at the grip, +y pointing away from the shoulder along the arm: the handle runs
 * through the fist and the head sits at the far end, so the arm visibly leads to the blade.
 */
export function axeRects(bladeColor: number): AxeRect[] {
  return [
    { x: -1, y: -3, w: 2, h: 15, color: AXE_HANDLE_COLOR, alpha: 1 }, // handle
    { x: -7, y: 6, w: 6, h: 7, color: bladeColor, alpha: 1 }, // blade on the leading (-x) side of the swing
    { x: -7, y: 6, w: 1, h: 7, color: 0xffffff, alpha: 0.25 }, // edge glint
  ];
}

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
    swayDeg: 2.2,
    swayPeriodMs: 3600,
    gustDeg: 2.5,
  },
  reduced: {
    walkScale: 0,
    chopStyle: 'tap',
    fallMs: REDUCED_FADE_MS,
    fallTiltDeg: 0,
    regrowMs: REDUCED_FADE_MS,
    regrowFromScale: 1,
    swayDeg: 0.8,
    swayPeriodMs: 7000,
    gustDeg: 0,
  },
  off: {
    walkScale: 0,
    chopStyle: 'static',
    fallMs: 0,
    fallTiltDeg: 0,
    regrowMs: 0,
    regrowFromScale: 1,
    swayDeg: 0,
    swayPeriodMs: 7000,
    gustDeg: 0,
  },
};

/**
 * How each of the 8 compass facings maps onto the single left/right-flip figure. `left: null`
 * (straight up/down the screen) keeps the last horizontal side so the figure doesn't snap back.
 * `back` shows the back-of-head overlay (moving or acting away from the camera).
 */
export const FACING_POSE: Readonly<Record<Facing8, { left: boolean | null; back: boolean }>> = {
  n: { left: null, back: true },
  ne: { left: false, back: true },
  e: { left: false, back: false },
  se: { left: false, back: false },
  s: { left: null, back: false },
  sw: { left: true, back: false },
  w: { left: true, back: false },
  nw: { left: true, back: true },
};

/** Px the felled tree's ghost slides away from the player along the iso screen axis. */
export const FALL_SLIDE_PX = 10;
/** Ghost depth above its tree: under one tile step (TIE_WEIGHT 1e-4) so it never passes a nearer entity. */
export const GHOST_DEPTH_EPS = 1e-5;

/** Per-tree sway speed is the base speed times a factor in [1 - SPREAD, 1 + SPREAD], from the tree id. */
export const SWAY_SPEED_SPREAD = 0.25;
/** A gust wave sweeps across the world every GUST_PERIOD_MS; GUST_WAVELENGTH_PX is its length along x. */
export const GUST_PERIOD_MS = 15000;
export const GUST_WAVELENGTH_PX = 1600;

/** Flower sway per mode: smaller and faster than trees. Reduced is barely there; off is still. */
export const FLOWER_SWAY: Readonly<Record<MotionMode, SwayParams>> = {
  on: { swayDeg: 4, swayPeriodMs: 1700, gustDeg: 3 },
  reduced: { swayDeg: 1.2, swayPeriodMs: 4000, gustDeg: 0 },
  off: { swayDeg: 0, swayPeriodMs: 4000, gustDeg: 0 },
};
/** World px beyond the camera view within which flowers still sway. */
export const FLOWER_VIEW_MARGIN = 48;
