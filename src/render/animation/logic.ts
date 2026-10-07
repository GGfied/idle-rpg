import { ANIM_STATES, CHOP_SWING_PERIOD_MS, MOTION, WALK_CYCLE_MS } from './data';
import type { AnimInput, AnimState, MotionMode, MotionParams, Pose } from './types';

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
    armAngle: 0,
    armAngleBack: 0,
    legFrontX: 0,
    legFrontLift: 0,
    legBackX: 0,
    legBackLift: 0,
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
  if (p < 0.68) return lerp(BACK, HIT, easeIn((p - 0.55) / 0.13)); // strike
  if (p < 0.78) return HIT; // hold on impact
  return lerp(HIT, REST, easeInOut((p - 0.78) / 0.22)); // recover
}

/** Reduced-mode tool tap: two frames only, rest and a small tap while the swing would land. */
export function tapAngle(phase: number): number {
  const p = ((phase % 1) + 1) % 1;
  return p >= 0.68 && p < 0.78 ? 10 * DEG : -25 * DEG;
}

/** Off mode: the axe is held in the rest pose, so chopping is still readable without movement. */
export const STATIC_AXE_ANGLE = -25 * DEG;

function chooseAxeAngle(style: MotionParams['chopStyle'], phase: number): number {
  if (style === 'static') return STATIC_AXE_ANGLE;
  return style === 'tap' ? tapAngle(phase) : chopAngle(phase);
}

/** Fill `out` for `state` after `elapsedMs` in it. No allocation. */
export function computePose(
  state: AnimState,
  elapsedMs: number,
  out: Pose,
  motionScale = 1,
  swingPeriodMs = CHOP_SWING_PERIOD_MS,
  mode: MotionMode = 'on',
): Pose {
  const params = MOTION[mode];
  motionScale = Math.min(motionScale, params.walkScale);
  out.bodyBobY = 0;
  out.armAngle = 0;
  out.armAngleBack = 0;
  out.legFrontX = 0;
  out.legFrontLift = 0;
  out.legBackX = 0;
  out.legBackLift = 0;
  out.axeAngle = 0;
  out.axeVisible = false;
  if (state === 'walk') {
    const a = (elapsedMs / WALK_CYCLE_MS) * Math.PI * 2;
    const s = Math.sin(a) * motionScale;
    out.bodyBobY = -Math.abs(Math.cos(a)) * 1.5 * motionScale;
    out.legFrontX = s * 3;
    out.legBackX = -s * 3;
    out.legFrontLift = Math.max(0, Math.cos(a)) * 2 * motionScale;
    out.legBackLift = Math.max(0, -Math.cos(a)) * 2 * motionScale;
    out.armAngle = -s * 0.6;
    out.armAngleBack = s * 0.6;
  } else if (state === 'chop') {
    out.axeVisible = true;
    const phase = elapsedMs / swingPeriodMs;
    out.axeAngle = chooseAxeAngle(params.chopStyle, phase);
    out.armAngleBack = 0.15;
  }
  return out;
}
