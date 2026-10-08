import { CHOP_KEYS, SWING_KEYS, AXE_HAND_GAP, ELBOW_TUCK_MIN_Y, TWIST_NARROW } from './data';
import type { ChopEase, ChopKey, SwingState } from './data';
import type { MotionParams, Pose, RigGeom } from './types';

const DEG = Math.PI / 180;

const EASE: Readonly<Record<ChopEase, (t: number) => number>> = {
  inOut: (t) => t * t * (3 - 2 * t),
  in: (t) => t * t,
  step: () => 0,
};

/** Two-bone solution scratch (Phaser rotations, torso frame). Reused, never allocated. */
const ik = { upper: 0, fore: 0 };

/**
 * Two-bone arm IK. Hand target (tx, ty) from the shoulder, x forward, y down. The elbow always flexes
 * FORWARD (forearm turned counter-clockwise from the upper arm, so overhead the elbows point forward and the
 * hands sit behind the head). Out of reach targets are clamped, so the hand stops short on the same line.
 * `side` -1 takes the mirror solution (elbow on the other side of the shoulder-hand line).
 * Result in `ik`: upper-arm rotation and forearm rotation, both absolute, Phaser-signed (0 = hanging down).
 */
export function solveArm(
  l1: number,
  l2: number,
  tx: number,
  ty: number,
  side: 1 | -1 = 1,
): typeof ik {
  const r = Math.min(l1 + l2 - 1e-6, Math.max(Math.abs(l1 - l2) + 1e-6, Math.hypot(tx, ty)));
  const toTarget = Math.atan2(-tx, ty);
  const alpha = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + r * r - l2 * l2) / (2 * l1 * r))));
  const beta = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + l2 * l2 - r * r) / (2 * l1 * l2))));
  ik.upper = toTarget + side * alpha;
  ik.fore = ik.upper - side * (Math.PI - beta);
  return ik;
}

/**
 * solveArm for an arm whose shoulder sits at torso x = `shoulderAbs`. The elbow trails (flexes forward) as usual, except
 * when the hand is low (ty >= ELBOW_TUCK_MIN_Y) and that puts the elbow outside the shoulder line (|x| > `limit`): then the
 * mirror solution is used, so a low grip reads as a V with the elbows over the torso, not one arm bulging out.
 */
function solveGrip(g: RigGeom, shoulderAbs: number, tx: number, ty: number): typeof ik {
  const r = solveArm(g.elbowY, g.handY, tx, ty);
  if (ty < ELBOW_TUCK_MIN_Y) return r;
  const x = shoulderAbs - g.elbowY * Math.sin(r.upper);
  if (Math.abs(x) <= g.shoulderX) return r;
  return solveArm(g.elbowY, g.handY, tx, ty, -1);
}

/** Hand position (x forward, y down, relative to the shoulder) for forward-positive upper/forearm angles. */
export function handFromAngles(
  g: RigGeom,
  upperFwd: number,
  foreFwd: number,
  out: { x: number; y: number },
): { x: number; y: number } {
  out.x = g.elbowY * Math.sin(upperFwd) + g.handY * Math.sin(foreFwd);
  out.y = g.elbowY * Math.cos(upperFwd) + g.handY * Math.cos(foreFwd);
  return out;
}

/**
 * Foreshorten a swing rotation (Phaser, 0 = hanging down) so its sideways reach is `reach` times the real
 * one while the vertical part is kept. reach 1 returns `angle` unchanged.
 */
export function foreshortenSwing(angle: number, reach: number): number {
  return Math.atan2(reach * Math.sin(angle), Math.cos(angle));
}

function easedKey(keys: readonly ChopKey[], phase: number): { a: ChopKey; b: ChopKey; t: number } {
  const p = ((phase % 1) + 1) % 1;
  let i = 0;
  while (i + 2 < keys.length && p >= keys[i + 1]!.phase) i++;
  const a = keys[i]!;
  const b = keys[Math.min(i + 1, keys.length - 1)]!;
  const span = b.phase - a.phase;
  return { a, b, t: span > 0 ? EASE[a.ease]((p - a.phase) / span) : 0 };
}
const sel = { a: CHOP_KEYS.static[0]!, b: CHOP_KEYS.static[0]!, t: 0 };

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Lead-to-rear hand spacing along the handle at a swing phase (what chopPose uses). */
export function handGapAt(
  style: MotionParams['chopStyle'],
  phase: number,
  tool: SwingState = 'chop',
): number {
  const k = easedKey(SWING_KEYS[tool][style], phase);
  return mix(k.a.gap ?? AXE_HAND_GAP, k.b.gap ?? AXE_HAND_GAP, k.t);
}

/**
 * Fill the two-handed swing part (chop, or mine with `tool`) of `out` for a swing phase (0..1): body lean, twist, dip (with the knees that make it),
 * the handle angle and both arms, solved so each hand sits on the handle (lead near the head, rear near the
 * butt) all the way through. `reach` foreshortens the swing plane's sideways part (back view).
 * Allocation-free.
 */
export function chopPose(
  style: MotionParams['chopStyle'],
  phase: number,
  out: Pose,
  g: RigGeom,
  reach: number,
  tool: SwingState = 'chop',
): void {
  const keys = SWING_KEYS[tool][style];
  const k = easedKey(keys, phase);
  sel.a = k.a;
  sel.b = k.b;
  sel.t = k.t;
  const { a, b, t } = sel;
  const theta = foreshortenSwing(mix(a.theta, b.theta, t) * DEG, reach);
  const gx = mix(a.gx, b.gx, t) * reach;
  const gy = mix(a.gy, b.gy, t);
  out.axeVisible = true;
  out.axeAngle = theta;
  out.gripX = gx;
  out.gripY = gy;
  out.lean = mix(a.lean, b.lean, t) * DEG;
  out.twist = mix(a.twist, b.twist, t);
  const dip = mix(a.dip, b.dip, t);
  out.bodyBobY = dip;
  legDip(g, dip, out);
  // Rear hand: AXE_HAND_GAP back along the handle (towards the butt); head direction is (-sin, cos).
  const gap = mix(a.gap ?? AXE_HAND_GAP, b.gap ?? AXE_HAND_GAP, t);
  const rx = gx + gap * Math.sin(theta);
  const ry = gy - gap * Math.cos(theta);
  const sx = g.shoulderX * (1 - TWIST_NARROW * out.twist);
  const lead = solveGrip(g, sx, gx - sx, gy);
  out.armUpperFront = -lead.upper;
  out.armAngle = -lead.fore;
  const rear = solveGrip(g, -sx, rx + sx, ry);
  out.armUpperBack = -rear.upper;
  out.armAngleBack = -rear.fore;
}

/**
 * Bend both knees so the hips drop `drop` px while the feet stay put (negative drop = rise on the toes is
 * ignored: legs stay straight). Thigh forward-positive, knee fold >= 0, same convention as the gait.
 */
function legDip(g: RigGeom, drop: number, out: Pose): void {
  if (drop <= 0) return;
  const l1 = g.kneeY - g.hipY;
  const l2 = -g.kneeY;
  const d = Math.max(Math.abs(l1 - l2) + 1e-6, l1 + l2 - drop);
  const cosK = Math.max(-1, Math.min(1, (d * d - l1 * l1 - l2 * l2) / (2 * l1 * l2)));
  const knee = Math.acos(cosK);
  const thigh = Math.atan2(l2 * Math.sin(knee), l1 + l2 * Math.cos(knee));
  out.thighFront = thigh;
  out.thighBack = thigh;
  out.kneeFront = knee;
  out.kneeBack = knee;
}
