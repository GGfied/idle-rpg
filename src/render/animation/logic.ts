import { PLAYER_LOOK, figureArmPivots, figureLegPivots, isoProjection } from '@render/index';
import type { Facing8, FigureLook } from '@render/index';
import { chopPose } from './chop';
import {
  ANIM_STATES,
  AXE_GRIP_Y,
  CHOP_SWING_PERIOD_MS,
  FACING_POSE,
  FACING_SWING,
  BREATH_PERIOD_MS,
  BREATH_PX,
  DIAGONAL_LATERAL_CAP,
  SWING_LEN_MAX,
  SWING_LEN_MIN,
  FALL_SLIDE_PX,
  GAITS,
  GUST_PERIOD_MS,
  GUST_WAVELENGTH_PX,
  MOTION,
  SWAY_SPEED_SPREAD,
  SWING_DEPTH_GAIN,
  SWING_KEYS,
  SWING_TIMELINES,
} from './data';
import type { SwingState } from './data';
import type {
  AnimInput,
  AnimState,
  GaitDef,
  GaitKey,
  MotionMode,
  ChopView,
  Pose,
  RigGeom,
  SwayParams,
  SwingAxis,
} from './types';

const STATE_ORDER = Object.keys(ANIM_STATES) as AnimState[];
const DEG = Math.PI / 180;

/** Pick the state: highest priority that applies; on a tie the current state is kept. */
export function nextAnimState(current: AnimState, input: AnimInput): AnimState {
  let best: AnimState = 'idle';
  let bestPriority = -1;
  for (const s of STATE_ORDER) {
    const def = ANIM_STATES[s];
    if (!def.applies(input)) continue;
    if (def.priority > bestPriority || (def.priority === bestPriority && s === current)) {
      best = s;
      bestPriority = def.priority;
    }
  }
  return best;
}

export function makePose(): Pose {
  return {
    bodyBobY: 0,
    lean: 0,
    armUpperFront: 0,
    armUpperBack: 0,
    armAngle: 0,
    armAngleBack: 0,
    thighFront: 0,
    thighBack: 0,
    kneeFront: 0,
    kneeBack: 0,
    axeAngle: 0,
    axeVisible: false,
    twist: 0,
    gripX: 0,
    gripY: 0,
  };
}

/** Rig measurements for a look (art px). The female body passes its own look; nothing here is male-specific. */
export function rigGeom(look: FigureLook): RigGeom {
  const arm = figureArmPivots(look);
  const leg = figureLegPivots(look);
  return {
    shoulderX: arm.shoulderX,
    elbowY: arm.elbowY,
    handY: AXE_GRIP_Y,
    hipY: leg.hipY,
    kneeY: leg.kneeY,
  };
}
let defaultGeomCache: RigGeom | null = null;
/** Geometry of the default player look, built on first use (not at import, so partial render mocks still load). */
export function defaultGeom(): RigGeom {
  defaultGeomCache ??= rigGeom(PLAYER_LOOK);
  return defaultGeomCache;
}
/** Chop seen face-on: nothing foreshortened. */
export const FRONT_VIEW: ChopView = { reach: 1 };

/** Where a walk/run limb swing runs on screen for a facing, in the flipped rig (x >= 0, y + = toward the camera). */
export function swingAxis(facing: Facing8, out: SwingAxis): SwingAxis {
  const f = FACING_SWING[facing];
  out.x = Math.abs(f.x);
  out.y = f.y;
  return out;
}

/** Projected (screen) components of a limb swung `angle` forward: sideways dx and downward dy, before clamping. */
function swingVec(angle: number, axis: SwingAxis): { dx: number; dy: number } {
  const s = Math.sin(angle);
  swingScratch.dx = axis.x * s;
  swingScratch.dy = SWING_DEPTH_GAIN * axis.y * s + Math.cos(angle);
  return swingScratch;
}
const swingScratch = { dx: 0, dy: 0 };

/**
 * Length factor of a limb swung `angle` forward, seen along `axis`: toward the camera it is drawn longer, away from
 * it shorter (foreshortening), 1 when the swing is sideways on screen. Clamped to SWING_LEN_MIN..MAX.
 */
export function swingLength(angle: number, axis: SwingAxis): number {
  const v = swingVec(angle, axis);
  // A limb pointing up the screen (dy < 0) is as short as it can get, not mirrored back to a long one.
  return Math.min(SWING_LEN_MAX, Math.max(SWING_LEN_MIN, Math.hypot(v.dx, Math.max(0, v.dy))));
}

/**
 * A limb swung `angle` radians forward (0 = hanging down) turns, seen along `axis`, into this Phaser rotation.
 * The sideways reach of its end is exactly the projected one (axis.x * sin(angle) of its length, so a facing with
 * no sideways share keeps the limb on the centre line); the vertical part comes from the foreshortened length.
 */
export function projectSwing(angle: number, axis: SwingAxis): number {
  const dx = swingVec(angle, axis).dx;
  const len = swingLength(angle, axis);
  return -Math.asin(Math.max(-1, Math.min(1, dx / len)));
}

/** swingLength with its excursion from 1 (the foreshortening) multiplied by `gain`; gain 1 is plain swingLength. */
export function gainedLength(angle: number, axis: SwingAxis, gain: number): number {
  return 1 + (swingLength(angle, axis) - 1) * gain;
}

/**
 * How much of a gait's depth shaping applies for `axis`: 1 facing straight to/from the camera (s/n), 0 on the diagonals
 * (their sideways cap) and side-on. The diagonals stay unboosted so a limb never swings sideways past its limit there.
 */
export function depthFade(axis: SwingAxis): number {
  return Math.max(0, 1 - axis.x / DIAGONAL_LATERAL_CAP);
}

/** Arm foreshortening multiplier for a gait seen along `axis`: `armDepth` facing straight to/from the camera, 1 elsewhere. */
export function armDepthGain(gait: GaitKey, axis: SwingAxis): number {
  return 1 + (GAITS[gait].armDepth - 1) * depthFade(axis);
}

/** Leg foreshortening multiplier (see armDepthGain). */
export function legDepthGain(gait: GaitKey, axis: SwingAxis): number {
  return 1 + (GAITS[gait].legDepth - 1) * depthFade(axis);
}

/** Share of the knee bend (1 = all) that shows in the leg's projected length for `axis`. */
export function kneeDepthShare(gait: GaitKey, axis: SwingAxis): number {
  return 1 + (GAITS[gait].kneeDepth - 1) * depthFade(axis);
}

/** Writes into `out` the swing axis a gait really swings along: the facing's axis with its depth part stretched by depthSwing. */
export function gaitAxis(gait: GaitKey, axis: SwingAxis, out: SwingAxis): SwingAxis {
  out.x = axis.x;
  out.y = axis.y * (1 + (GAITS[gait].depthSwing - 1) * depthFade(axis));
  return out;
}

function resetPose(out: Pose): void {
  out.bodyBobY = 0;
  out.lean = 0;
  out.armUpperFront = 0;
  out.armUpperBack = 0;
  out.armAngle = 0;
  out.armAngleBack = 0;
  out.thighFront = 0;
  out.thighBack = 0;
  out.kneeFront = 0;
  out.kneeBack = 0;
  out.axeAngle = 0;
  out.axeVisible = false;
  out.twist = 0;
  out.gripX = 0;
  out.gripY = 0;
}

const TWO_PI_ = Math.PI * 2;

/** Knee bend (>= 0): the swing leg (thigh moving forward, cos > 0) folds; straight at heel strike and in stance. */
function kneeBend(phase: number, kneeDeg: number): number {
  return Math.max(0, Math.cos(phase)) * kneeDeg * DEG;
}

/** One arm: upper-arm swing and forearm (swing trailing a little more, plus elbow flex while forward). */
function armSwing(armPhase: number, g: GaitDef, scale: number): { upper: number; fore: number } {
  const upper = Math.sin(armPhase) * g.armDeg * DEG * scale;
  const trail = Math.sin(armPhase - g.forearmLag * TWO_PI_);
  const fore = trail * g.armDeg * DEG * scale + Math.max(0, trail) * g.elbowDeg * DEG * scale;
  return { upper, fore };
}

function gaitPose(elapsedMs: number, out: Pose, scale: number, g: GaitDef): void {
  // Front leg phase; the back leg is half a cycle later. The arm on a side runs on the OPPOSITE leg's
  // phase (the very same clock, + pi) and trails it by armLag (0: forward extremes on the same frame).
  const a = (elapsedMs / g.cycleMs) * TWO_PI_;
  const lagA = g.armLag * TWO_PI_;
  out.thighFront = Math.sin(a) * g.thighDeg * DEG * scale;
  out.thighBack = Math.sin(a + Math.PI) * g.thighDeg * DEG * scale;
  out.kneeFront = kneeBend(a, g.kneeDeg) * scale;
  out.kneeBack = kneeBend(a + Math.PI, g.kneeDeg) * scale;
  const front = armSwing(a + Math.PI - lagA, g, scale);
  const back = armSwing(a - lagA, g, scale);
  out.armUpperFront = front.upper;
  out.armAngle = front.fore;
  out.armUpperBack = back.upper;
  out.armAngleBack = back.fore;
  // Two bobs per cycle: lowest at each foot contact (a = pi/2, 3pi/2), highest at mid-stance.
  out.bodyBobY = -g.bobPx * (0.5 + 0.5 * Math.cos(2 * a)) * scale;
  out.lean = g.leanDeg * DEG * scale;
}

/**
 * Key phase (0..1) of a swing state. A plain swing loops every `periodMs`. A state with a timeline (the rod) plays its
 * cast once, then loops the wait; a catch pulse (`pulseMs` >= 0 since it started, < catchMs) plays the catch segment once.
 */
export function swingPhase(
  state: AnimState,
  elapsedMs: number,
  periodMs: number,
  pulseMs: number,
): number {
  const tl = SWING_TIMELINES[state];
  if (!tl) return elapsedMs / periodMs;
  if (pulseMs >= 0 && pulseMs < tl.catchMs)
    return tl.waitEnd + (pulseMs / tl.catchMs) * (1 - tl.waitEnd);
  if (elapsedMs < tl.castMs) return (elapsedMs / tl.castMs) * tl.castEnd;
  const loop = ((elapsedMs - tl.castMs) / tl.waitMs) % 1;
  return tl.castEnd + loop * (tl.waitEnd - tl.castEnd);
}

/** Fill `out` for `state` after `elapsedMs` in it. No allocation. `gait` only matters in 'walk'. */
export function computePose(
  state: AnimState,
  elapsedMs: number,
  out: Pose,
  motionScale = 1,
  swingPeriodMs = CHOP_SWING_PERIOD_MS,
  mode: MotionMode = 'on',
  gait: GaitKey = 'walk',
  geom: RigGeom = defaultGeom(),
  view: ChopView = FRONT_VIEW,
  pulseMs = -1,
): Pose {
  const params = MOTION[mode];
  motionScale = Math.min(motionScale, params.walkScale);
  resetPose(out);
  if (state === 'walk') {
    gaitPose(elapsedMs, out, motionScale, GAITS[gait]);
  } else if (state in SWING_KEYS) {
    chopPose(
      params.chopStyle,
      swingPhase(state, elapsedMs, swingPeriodMs, pulseMs),
      out,
      geom,
      params.chopStyle === 'static' ? 1 : view.reach,
      state as SwingState,
    );
  } else {
    out.bodyBobY =
      -BREATH_PX * (0.5 + 0.5 * Math.sin((elapsedMs / BREATH_PERIOD_MS) * TWO_PI_)) * motionScale;
  }
  return out;
}

/** Compass facing for a TILE delta (a step, or toward an interaction target). (0,0) gives 's'. */
export function facingFromStep(dx: number, dy: number): Facing8 {
  return isoProjection.facing(dx, dy);
}

/** Flip side for a facing; straight up/down the screen keeps `previousLeft`. */
export function facingIsLeft(facing: Facing8, previousLeft: boolean): boolean {
  return FACING_POSE[facing].left ?? previousLeft;
}

/** True when the figure shows its back (n, ne, nw). */
export function facingIsBack(facing: Facing8): boolean {
  return FACING_POSE[facing].back;
}

export interface FallVector {
  /** World px the ghost slides (away from the player). */
  slideX: number;
  slideY: number;
  /** -1..1: screen-horizontal share of the fall; multiplies the tilt angle (positive = clockwise). */
  tilt: number;
}

/**
 * Fall direction for a tree at tile offset (dx, dy) from the player: away from the player along
 * the iso screen axis. (0,0) falls to the right.
 */
export function fallVector(dx: number, dy: number, out: FallVector): FallVector {
  const o = isoProjection.tileToWorld(0, 0);
  const t = isoProjection.tileToWorld(dx, dy);
  const sx = t.x - o.x;
  const sy = t.y - o.y;
  const len = Math.hypot(sx, sy);
  if (len === 0) {
    out.slideX = 0;
    out.slideY = 0;
    out.tilt = 1;
    return out;
  }
  out.slideX = (sx / len) * FALL_SLIDE_PX;
  out.slideY = (sy / len) * FALL_SLIDE_PX;
  out.tilt = sx / len;
  return out;
}

/** Deterministic value in [0, 1) from a string id (FNV-1a), so a tree always sways with the same phase. */
export function idUnit(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0x100000000;
}

const TWO_PI = Math.PI * 2;

/** Gust strength 0..1 at world x: a travelling bump that is zero most of the time. */
export function gustEnvelope(timeMs: number, worldX: number): number {
  const s = Math.sin(TWO_PI * (timeMs / GUST_PERIOD_MS - worldX / GUST_WAVELENGTH_PX));
  if (s <= 0) return 0;
  const q = s * s;
  return q * q;
}

/**
 * Sway rotation (radians, positive = lean right) of a standing tree. `phase` and `speed` come from
 * idUnit(id): phase in [0, 1), speed factor in [0, 1). Magnitude never exceeds
 * (swayDeg + gustDeg) degrees. Allocation-free.
 */
export function swayAngle(
  m: SwayParams,
  timeMs: number,
  worldX: number,
  phase: number,
  speed: number,
): number {
  if (m.swayDeg === 0 && m.gustDeg === 0) return 0;
  const cycles = (timeMs / m.swayPeriodMs) * (1 + (speed * 2 - 1) * SWAY_SPEED_SPREAD) + phase;
  const wave = 0.8 * Math.sin(TWO_PI * cycles) + 0.2 * Math.sin(TWO_PI * cycles * 2.7 + phase * 5);
  const gust = m.gustDeg === 0 ? 0 : m.gustDeg * gustEnvelope(timeMs, worldX);
  return (m.swayDeg * wave + gust) * DEG;
}
