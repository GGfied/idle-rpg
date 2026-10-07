import { isoProjection } from '@render/index';
import type { Facing8 } from '@render/index';
import {
  ANIM_STATES,
  CHOP_SWING_PERIOD_MS,
  FACING_POSE,
  BREATH_PERIOD_MS,
  BREATH_PX,
  FALL_SLIDE_PX,
  GAITS,
  GUST_PERIOD_MS,
  GUST_WAVELENGTH_PX,
  MOTION,
  SWAY_SPEED_SPREAD,
  SWING_IMPACT_PHASE,
} from './data';
import type {
  AnimInput,
  AnimState,
  GaitDef,
  GaitKey,
  MotionMode,
  MotionParams,
  Pose,
  SwayParams,
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
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function easeInOut(t: number): number {
  return t * t * (3 - 2 * t);
}
function easeIn(t: number): number {
  return t * t;
}

/** Axe angle in radians over a swing phase 0..1: slow back-swing, fast strike, recover. */
export function chopAngle(phase: number): number {
  const p = ((phase % 1) + 1) % 1;
  const REST = -25 * DEG;
  const BACK = -115 * DEG;
  const HIT = 55 * DEG;
  if (p < 0.55) return lerp(REST, BACK, easeInOut(p / 0.55)); // wind up
  if (p < SWING_IMPACT_PHASE)
    return lerp(BACK, HIT, easeIn((p - 0.55) / (SWING_IMPACT_PHASE - 0.55))); // strike
  if (p < 0.78) return HIT; // hold on impact
  return lerp(HIT, REST, easeInOut((p - 0.78) / 0.22)); // recover
}

/** Reduced-mode tool tap: two frames only, rest and a small tap while the swing would land. */
export function tapAngle(phase: number): number {
  const p = ((phase % 1) + 1) % 1;
  return p >= SWING_IMPACT_PHASE && p < 0.78 ? 10 * DEG : -25 * DEG;
}

/** Off mode: the axe is held in the rest pose, so chopping is still readable without movement. */
export const STATIC_AXE_ANGLE = -25 * DEG;

/**
 * Foreshorten a swing rotation (Phaser, 0 = hanging down) so its sideways reach is `reach` times the real
 * one while the vertical part is kept. reach 1 returns `angle` unchanged.
 */
export function foreshortenSwing(angle: number, reach: number): number {
  return Math.atan2(reach * Math.sin(angle), Math.cos(angle));
}

function chooseAxeAngle(style: MotionParams['chopStyle'], phase: number): number {
  if (style === 'static') return STATIC_AXE_ANGLE;
  return style === 'tap' ? tapAngle(phase) : chopAngle(phase);
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
  // Front leg phase; the back leg is half a cycle later. The arm on a side is the OPPOSITE leg's
  // phase (+pi) and trails it by armLag.
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

/** Fill `out` for `state` after `elapsedMs` in it. No allocation. `gait` only matters in 'walk'. */
export function computePose(
  state: AnimState,
  elapsedMs: number,
  out: Pose,
  motionScale = 1,
  swingPeriodMs = CHOP_SWING_PERIOD_MS,
  mode: MotionMode = 'on',
  gait: GaitKey = 'walk',
): Pose {
  const params = MOTION[mode];
  motionScale = Math.min(motionScale, params.walkScale);
  resetPose(out);
  if (state === 'walk') {
    gaitPose(elapsedMs, out, motionScale, GAITS[gait]);
  } else if (state === 'chop') {
    out.axeVisible = true;
    const phase = elapsedMs / swingPeriodMs;
    out.axeAngle = chooseAxeAngle(params.chopStyle, phase);
    out.armUpperBack = -0.15; // slightly back; forward-positive, straight elbow
    out.armAngleBack = -0.15;
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
