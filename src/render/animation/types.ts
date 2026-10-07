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
  facingLeft?: boolean;
  /** Item id of the tool (bronze_axe), used only to tint it. */
  toolItemId?: string;
}

/** Pose of the rig in rig-local units, written into a reused object each frame. */
export interface Pose {
  bodyBobY: number;
  /** Radians, positive = clockwise. */
  armAngle: number;
  armAngleBack: number;
  /** Horizontal and vertical foot offsets. */
  legFrontX: number;
  legFrontLift: number;
  legBackX: number;
  legBackLift: number;
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
}
