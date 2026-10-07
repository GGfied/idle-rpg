import type { Facing8 } from '@render/index';

export type AnimState = 'idle' | 'walk' | 'chop';

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
  /** Radians. Axe pivots at the front shoulder; 0 = pointing up. */
  axeAngle: number;
  axeVisible: boolean;
}

/** 'off' = no motion at all: static held tool while chopping, instant tree swaps. 'reduced' = no walk bob, a small tool tap instead of a swing, instant tree swaps with a short fade. */
export type MotionMode = 'on' | 'reduced' | 'off';

/** Per-mode animation parameters (data, see MOTION in data.ts). */
export interface MotionParams {
  /** Multiplies walk bob, leg and arm swing. */
  walkScale: number;
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
