import { ACT_ARMS, ACT_KEYS, ACT_PLAN, TWIST_NARROW } from './data';
import type { ActKey, ActState } from './data';
import { EASE, foreshortenSwing, legDip, solveArm, solveGrip } from './chop';
import type { MotionParams, Pose, RigGeom } from './types';

const DEG = Math.PI / 180;

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Key pair and eased blend at a phase; the result lives in `sel` (reused, never allocated). */
const sel = { a: undefined as unknown as ActKey, b: undefined as unknown as ActKey, t: 0 };
function select(keys: readonly ActKey[], phase: number): void {
  const p = ((phase % 1) + 1) % 1;
  let i = 0;
  while (i + 2 < keys.length && p >= keys[i + 1]!.phase) i++;
  const a = keys[i]!;
  const b = keys[Math.min(i + 1, keys.length - 1)]!;
  const span = b.phase - a.phase;
  sel.a = a;
  sel.b = b;
  sel.t = span > 0 ? EASE[a.ease](Math.min(1, Math.max(0, (p - a.phase) / span))) : 0;
}

/**
 * Key phase (0..1) of an act state `elapsedMs` after it started. A looping act (cooking) wraps every period; a one-shot
 * (lighting) plays once and then holds its final pose (which is the standing one) if the state outlasts its period.
 */
export function actPhase(state: ActState, elapsedMs: number): number {
  const plan = ACT_PLAN[state];
  const p = elapsedMs / plan.periodMs;
  return plan.loop ? p : Math.min(1, Math.max(0, p));
}

/**
 * Fill the act part of `out` for a state and key phase: hips dip (knees via legDip, or a one-knee kneel), forward lean,
 * both hands solved by IK onto their targets (the prop hand holds the prop at `theta`, the other hand strikes or hangs).
 * `reach` foreshortens the sideways reach for a back view, like the chop. Allocation-free.
 */
export function actPose(
  style: MotionParams['chopStyle'],
  phase: number,
  out: Pose,
  g: RigGeom,
  reach: number,
  state: ActState,
): void {
  select(ACT_KEYS[state][style], phase);
  const { a, b, t } = sel;
  const dip = mix(a.dip, b.dip, t);
  const kneel = mix(a.kneel, b.kneel, t);
  const gx = mix(a.gx, b.gx, t) * reach;
  const gy = mix(a.gy, b.gy, t);
  const bx = mix(a.bx, b.bx, t) * reach;
  const by = mix(a.by, b.by, t);
  out.armsSolved = true;
  out.axeAngle = foreshortenSwing(mix(a.theta, b.theta, t) * DEG, reach);
  out.gripX = gx;
  out.gripY = gy;
  out.lean = mix(a.lean, b.lean, t) * DEG;
  out.twist = mix(a.twist, b.twist, t);
  out.bodyBobY = dip;
  legDip(g, dip, out);
  if (kneel > 0) {
    // Back knee to the ground: thigh near upright, shin folded back along the floor.
    out.thighBack = mix(out.thighBack, 0.08, kneel);
    out.kneeBack = mix(out.kneeBack, Math.PI * 0.48, kneel);
  }
  const sx = g.shoulderX * (1 - TWIST_NARROW * out.twist);
  const arms = ACT_ARMS[state];
  const front =
    arms.frontSide === 1
      ? solveGrip(g, sx, gx - sx, gy)
      : solveArm(g.elbowY, g.handY, gx - sx, gy, arms.frontSide);
  out.armUpperFront = -front.upper;
  out.armAngle = -front.fore;
  const back = solveGrip(g, -sx, bx + sx, by);
  let upper = -back.upper; // forward-positive from here on
  let fore = -back.fore;
  const lo = out.lean - arms.backUpperWorld * DEG; // torso-frame limits: world angle = upper - lean
  const hi = out.lean + arms.backUpperWorld * DEG;
  if (upper < lo || upper > hi) {
    // Clamp the upper arm, then aim the forearm from the new elbow at the hand target (it may stop short or overshoot a little).
    upper = upper < lo ? lo : hi;
    fore = Math.atan2(bx - (-sx + g.elbowY * Math.sin(upper)), by - g.elbowY * Math.cos(upper));
  }
  out.armUpperBack = upper;
  out.armAngleBack = fore;
}
