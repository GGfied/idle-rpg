import type { Facing8 } from '@render/index';

export type AnimState =
  'idle' | 'walk' | 'chop' | 'mine' | 'fishNet' | 'fishRod' | 'lighting' | 'cooking';

/** Plain state the integrator passes each frame. Never game logic. */
export interface AnimInput {
  moving: boolean;
  gathering: boolean;
  /** Kind of the tool in use, e.g. 'axe'. Unknown or missing kinds do not start a gather animation. */
  toolKind?: string;
}

export interface AnimStateDef {
  /** Higher wins when several states apply. Equal priority keeps the current state. */
  priority: number;
  applies(input: AnimInput): boolean;
}

export interface SetStateOpts {
  /** Compass facing (see facingFromStep). Wins over facingLeft when both are given. */
  facing?: Facing8;
  facingLeft?: boolean;
  /** Walk state only: run gait instead of walk (two tiles a tick). */
  running?: boolean;
  /** Item id of the tool (bronze_axe), used only to tint it. */
  toolItemId?: string;
}

/** Gait of the walk state: 'run' is the same cycle, faster and bigger. */
export type GaitKey = 'walk' | 'run';

/** One gait as data (see GAITS in data.ts). Angles in degrees, lags in cycle fractions. */
export interface GaitDef {
  cycleMs: number;
  /** Peak thigh swing, forward and back. */
  thighDeg: number;
  /** Peak knee bend of the swing leg (the stance leg stays straight). */
  kneeDeg: number;
  /** Peak upper-arm swing; always smaller than thighDeg. */
  armDeg: number;
  /** Extra forearm flex at the elbow while the arm is forward. */
  elbowDeg: number;
  /** The arm trails the opposite leg by this fraction of a cycle; the forearm trails the upper arm by forearmLag more. */
  armLag: number;
  forearmLag: number;
  /** Body rises this many art px at mid-stance; lowest at each foot contact (2 bobs per cycle). */
  bobPx: number;
  /** Forward lean of the torso. */
  leanDeg: number;
  /**
   * Multiplier on the arm's foreshortening when the swing runs toward/away from the camera (facing s/n): there the
   * arm only grows/shrinks (clamped), so a run reads stiff. 1 = none (walk). Fades out to 1 as the facing turns side-on.
   */
  armDepth: number;
  /**
   * Facing s/n only (fades out toward the diagonals): multiplier on the depth component of the swing axis, so the
   * hand and foot travel further up/down the screen, and the share of the knee bend that still shows (a knee folding
   * toward the camera is barely visible, and shown in full it bends the foot's rise/fall out of step with the arm),
   * and the leg's own foreshortening multiplier (as armDepth). 1 = none (walk).
   */
  depthSwing: number;
  kneeDepth: number;
  legDepth: number;
}

/**
 * Pose of the rig in rig-local units, written into a reused object each frame. Angles are radians,
 * FORWARD-positive (the animator turns them into Phaser rotation). Front = the +x side of the unflipped rig.
 */
export interface Pose {
  bodyBobY: number;
  /** Forward torso lean (radians, about the hips). */
  lean: number;
  /** Upper-arm (shoulder) swing; the elbow flex is armAngle - armUpper. */
  armUpperFront: number;
  armUpperBack: number;
  /** Forearm angle in absolute terms (upper-arm swing + elbow flex); drives the elbow-pivoted arm graphic. */
  armAngle: number;
  armAngleBack: number;
  thighFront: number;
  thighBack: number;
  /** Knee bend, radians >= 0, shin folds backwards. */
  kneeFront: number;
  kneeBack: number;
  /**
   * Chop only. Handle angle in the TORSO frame, Phaser-signed (0 = head straight below the hands, negative =
   * forward). Relative to the front forearm the axe turns by axeAngle + armAngle.
   */
  axeAngle: number;
  axeVisible: boolean;
  /** Chop only: the lead hand's target (the handle's grip point) in the torso frame, art px. */
  gripX: number;
  gripY: number;
  /** Chop only: 0..1 shoulder turn (shoulders narrow by TWIST_NARROW * twist). */
  twist: number;
  /**
   * True when the arms are already solved in view space (hands on a tool or prop): chop-like swings and the
   * lighting/cooking acts. The animator then skips the walk-swing projection and draws the rear arm over the front.
   */
  armsSolved: boolean;
}

/** Rig measurements the arm/leg solvers need, art px (from the look's pivots, never hardcoded to one body). */
export interface RigGeom {
  /** Shoulder offset from the body centre line (the front arm at +, the back arm at -). */
  shoulderX: number;
  /** Upper-arm length (shoulder to elbow). */
  elbowY: number;
  /** Forearm length to the gripping fist. */
  handY: number;
  hipY: number;
  kneeY: number;
}

/** Which way the walk swing runs on screen: |x| of the facing in the (flipped) rig, and y (+ = toward the camera). */
export interface SwingAxis {
  x: number;
  y: number;
}

/** How a chop is viewed: the swing plane's sideways reach (1 front, BACK_VIEW_SWING_REACH facing away). */
export interface ChopView {
  reach: number;
}

/** 'off' = no motion at all: static held tool while chopping, instant tree swaps. 'reduced' = no walk bob, a small tool tap instead of a swing, instant tree swaps with a short fade. */
export type MotionMode = 'on' | 'reduced' | 'off';

/** Per-mode animation parameters (data, see MOTION in data.ts). */
export interface MotionParams {
  /** Multiplies walk bob, leg and arm swing. */
  walkScale: number;
  /** Multiplies the idle breathing bob (0 = perfectly still when standing). */
  breathScale: number;
  chopStyle: 'swing' | 'tap' | 'static';
  fallMs: number;
  /** Degrees the falling crown tilts. */
  fallTiltDeg: number;
  regrowMs: number;
  /** Starting scale of a regrowing tree (1 = no pop). */
  regrowFromScale: number;
  /** Idle tree sway: peak lean in degrees (0 = still), and one sway cycle in ms before per-tree variation. */
  swayDeg: number;
  swayPeriodMs: number;
  /** Extra peak lean in degrees while a gust wave passes (0 = no gusts). */
  gustDeg: number;
}

/** Sway parameters (see swayAngle): peak lean and cycle length in ms, plus extra lean while a gust passes. */
export interface SwayParams {
  swayDeg: number;
  swayPeriodMs: number;
  gustDeg: number;
}
