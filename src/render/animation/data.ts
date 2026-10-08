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
 * Gaits as data. Legs swing more than arms; each arm runs on the SAME phase as the opposite leg
 * (contralateral, armLag 0: forward extreme and zero crossings on the same frame; user 2026-10-08 "in sync with the
 * legs"). Walk and run share every phase relation; run is faster, bigger and leans more.
 */
export const GAITS: Readonly<Record<GaitKey, GaitDef>> = {
  walk: {
    cycleMs: WALK_CYCLE_MS,
    thighDeg: 25,
    kneeDeg: 35,
    armDeg: 16,
    elbowDeg: 8,
    armLag: 0,
    forearmLag: 0,
    bobPx: 0.9,
    leanDeg: 2,
    armDepth: 1,
    depthSwing: 1,
    kneeDepth: 1,
    legDepth: 1,
  },
  run: {
    cycleMs: RUN_CYCLE_MS,
    thighDeg: 38,
    kneeDeg: 60,
    armDeg: 28,
    elbowDeg: 30,
    armLag: 0,
    forearmLag: 0,
    bobPx: 1.4,
    leanDeg: 9,
    armDepth: 1.8,
    depthSwing: 2,
    kneeDepth: 0.4,
    legDepth: 1.8,
  },
};

/** Idle breathing: a tiny body bob (art px) and its period. Zero in reduced/off via walkScale. */
export const BREATH_PX = 0.25;
export const BREATH_PERIOD_MS = 2800;

/** Which gather state a tool kind starts. New skills add an entry here (and a state below). */
export const GATHER_STATE_BY_TOOL: Readonly<Record<string, AnimState>> = {
  axe: 'chop',
  pickaxe: 'mine',
  net: 'fishNet',
  rod: 'fishRod',
  lighting: 'lighting',
  cooking: 'cooking',
};

/** Walking beats gathering (moving cancels a session); gathering beats idle. */
export const ANIM_STATES: Readonly<Record<AnimState, AnimStateDef>> = {
  idle: { priority: 0, applies: () => true },
  chop: {
    priority: 1,
    applies: (i: AnimInput) => i.gathering && GATHER_STATE_BY_TOOL[i.toolKind ?? ''] === 'chop',
  },
  mine: {
    priority: 1,
    applies: (i: AnimInput) => i.gathering && GATHER_STATE_BY_TOOL[i.toolKind ?? ''] === 'mine',
  },
  fishNet: {
    priority: 1,
    applies: (i: AnimInput) => i.gathering && GATHER_STATE_BY_TOOL[i.toolKind ?? ''] === 'fishNet',
  },
  fishRod: {
    priority: 1,
    applies: (i: AnimInput) => i.gathering && GATHER_STATE_BY_TOOL[i.toolKind ?? ''] === 'fishRod',
  },
  lighting: {
    priority: 1,
    applies: (i: AnimInput) => i.gathering && GATHER_STATE_BY_TOOL[i.toolKind ?? ''] === 'lighting',
  },
  cooking: {
    priority: 1,
    applies: (i: AnimInput) => i.gathering && GATHER_STATE_BY_TOOL[i.toolKind ?? ''] === 'cooking',
  },
  walk: { priority: 2, applies: (i: AnimInput) => i.moving },
};

/** Tool tint by item id; unknown ids use DEFAULT_TOOL_TINT. */
export const TOOL_TINTS: Readonly<Record<string, number>> = {
  bronze_axe: 0xb07a3c,
  iron_axe: 0x8a8f96,
  steel_axe: 0xb9c2cc,
  bronze_pickaxe: 0xb07a3c,
  iron_pickaxe: 0x8a8f96,
  steel_pickaxe: 0xb9c2cc,
};
export const DEFAULT_TOOL_TINT = 0xb07a3c;
export const AXE_HANDLE_COLOR = 0x6b4a2b;
/** Forearm-local y of the fist: the axe is gripped here (the LEAD hand, just below the head). */
export const AXE_GRIP_Y = 9;
/** Distance along the handle from the lead hand to the rear hand (which sits near the butt end). */
export const AXE_HAND_GAP = 5;
/** A grip hand at least this far below the shoulder (art px) keeps its elbow over the torso (see chop.ts solveGrip). */
export const ELBOW_TUCK_MIN_Y = 4;
/** Chop twist: shoulders narrow to (1 - this * twist) of their width at full twist (a torso turn seen side-on). */
export const TWIST_NARROW = 0.3;
/** A limb swinging toward/away from the camera is drawn longer/shorter (foreshortening); its length factor stays within these. */
/** How strongly a swing toward/away from the camera moves a limb up/down the screen (1 = the full iso foreshortening). */
export const SWING_DEPTH_GAIN = 0.5;
export const SWING_LEN_MIN = 0.85;
export const SWING_LEN_MAX = 1.2;
/** Most sideways share of a walk swing on the four diagonals: the sprite faces the camera there, so it must not read as a lateral swing. */
export const DIAGONAL_LATERAL_CAP = 0.15;
/**
 * Swing direction on screen per facing (unit vectors, x = sideways, y + = toward the camera). Side-on (e/w) the swing is
 * the plain forward/back arc; facing s/n and the four diagonals (the sprite faces the camera or turns its back) it is
 * mostly up/down with a length change (foreshortening). The diagonals keep only a small sideways part
 * (DIAGONAL_LATERAL_CAP) toward the true screen direction, so a hand or foot never crosses the body's centre line.
 */
export const FACING_SWING: Readonly<Record<Facing8, { x: number; y: number }>> = {
  n: { x: 0, y: -1 },
  ne: { x: DIAGONAL_LATERAL_CAP, y: -0.989 },
  e: { x: 1, y: 0 },
  se: { x: DIAGONAL_LATERAL_CAP, y: 0.989 },
  s: { x: 0, y: 1 },
  sw: { x: -DIAGONAL_LATERAL_CAP, y: 0.989 },
  w: { x: -1, y: 0 },
  nw: { x: -DIAGONAL_LATERAL_CAP, y: -0.989 },
};
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
 * The axe in art px, origin at the LEAD grip, +y towards the head: the handle runs through both fists (the rear
 * one AXE_HAND_GAP behind, near the butt) and the head sits just beyond the lead hand.
 */
export function axeRects(bladeColor: number): AxeRect[] {
  return [
    { x: -1, y: -10, w: 2, h: 20, color: AXE_HANDLE_COLOR, alpha: 1 }, // handle: butt, rear grip, lead grip, head
    { x: -7, y: 3, w: 6, h: 7, color: bladeColor, alpha: 1 }, // blade on the leading (-x) side of the swing
    { x: -7, y: 3, w: 1, h: 7, color: 0xffffff, alpha: 0.25 }, // edge glint
  ];
}

/**
 * The pickaxe in art px, same frame as axeRects (origin at the LEAD grip, +y along the haft towards the head):
 * a wooden haft through both fists and a T-head across its end whose two tips taper to a point. The head's long
 * axis is the swing plane (local x), so one tip leads the strike and, at impact, points down into the rock.
 */
export function pickRects(headColor: number): AxeRect[] {
  return [
    { x: -1, y: -10, w: 2, h: 23, color: AXE_HANDLE_COLOR, alpha: 1 }, // haft: butt, rear grip, lead grip, head
    { x: -4, y: 10, w: 8, h: 3, color: headColor, alpha: 1 }, // head bar
    { x: -6, y: 10.5, w: 2, h: 2, color: headColor, alpha: 1 }, // taper, leading tip side
    { x: 4, y: 10.5, w: 2, h: 2, color: headColor, alpha: 1 }, // taper, trailing tip side
    { x: -8, y: 11, w: 2, h: 1, color: headColor, alpha: 1 }, // point
    { x: 6, y: 11, w: 2, h: 1, color: headColor, alpha: 1 }, // point
    { x: -4, y: 10, w: 8, h: 1, color: 0xffffff, alpha: 0.25 }, // top glint
  ];
}

/**
 * The hand net in art px, same frame as axeRects (origin at the LEAD grip, +y along the pole towards the hoop): a wooden
 * pole through both fists and a small round hoop at its end with a cross-hatched mesh, in the small_fishing_net icon
 * colours (dark rim, tan mesh). Built once; the pole is 22 tall so it is told apart from the pickaxe haft (21).
 */
export function netRects(): AxeRect[] {
  const R = 5.5;
  const cy = 17.5;
  const out: AxeRect[] = [{ x: -1, y: -8, w: 2, h: 22, color: AXE_HANDLE_COLOR, alpha: 1 }];
  for (let y = -6; y <= 6; y++) {
    for (let x = -6; x <= 6; x++) {
      const d = Math.hypot(x, y);
      if (d > R + 0.5) continue;
      if (d > R - 0.7) out.push({ x, y: cy + y, w: 1, h: 1, color: NET_RIM_COLOR, alpha: 1 });
      else if ((x + y) % 2 === 0 || (x - y) % 3 === 0)
        out.push({ x, y: cy + y, w: 1, h: 1, color: NET_MESH_COLOR, alpha: 0.8 });
    }
  }
  return out;
}

/** Rod colours from the fishing_rod icon: dark grip, steel reel, two browns for the shaft, pale line, red/white float. */
export const ROD_GRIP_COLOR = 0x2c2c34;
export const ROD_REEL_COLOR = 0xaab2bb;
export const ROD_SHAFT_COLOR = 0x875a31;
export const ROD_TIP_COLOR = 0xa57743;
export const ROD_LINE_COLOR = 0xdfe6ea;
export const ROD_FLOAT_RED = 0xe23b3b;
export const ROD_FLOAT_WHITE = 0xf4f4f4;
/** Rod-local y of the tip (origin at the LEAD grip, +y towards the tip) and the length of the line hanging from it. */
export const ROD_TIP_Y = 22;
export const ROD_LINE_LEN = 18;

/**
 * The fishing rod in art px, same frame as axeRects: a dark grip through both fists with a small steel reel, a
 * brown shaft that tapers from 2px to 1px, and a pale tip. 30 tall (net pole 22, pickaxe haft 21), so it is told apart.
 */
export function rodRects(): AxeRect[] {
  return [
    { x: -1, y: -8, w: 2, h: 10, color: ROD_GRIP_COLOR, alpha: 1 }, // grip: butt, rear hand, lead hand
    { x: 1, y: -1, w: 2, h: 2, color: ROD_REEL_COLOR, alpha: 1 }, // reel
    { x: -1, y: 2, w: 2, h: 9, color: ROD_SHAFT_COLOR, alpha: 1 }, // thick shaft
    { x: 0, y: 11, w: 1, h: 9, color: ROD_TIP_COLOR, alpha: 1 }, // thin shaft
    { x: 0, y: 20, w: 1, h: 2, color: ROD_LINE_COLOR, alpha: 1 }, // tip
  ];
}

/** The hanging line and its float, in a frame whose origin is the rod tip and +y is straight DOWN (kept upright by the animator). */
export function rodLineRects(): AxeRect[] {
  return [
    { x: 0, y: 0, w: 1, h: ROD_LINE_LEN, color: ROD_LINE_COLOR, alpha: 1 },
    { x: -1, y: ROD_LINE_LEN, w: 3, h: 2, color: ROD_FLOAT_RED, alpha: 1 },
    { x: -1, y: ROD_LINE_LEN + 2, w: 3, h: 1, color: ROD_FLOAT_WHITE, alpha: 1 },
  ];
}
export const NET_RIM_COLOR = 0x1c1108;
export const NET_MESH_COLOR = 0xe3c68b;

export type ChopEase = 'inOut' | 'in' | 'step';
/**
 * One chop pose, all in the TORSO frame (art px, +x forward, +y down, origin between the shoulders).
 * `gx, gy` = lead hand; `theta` = handle angle in degrees as Phaser rotation (0 = head straight below the
 * hands, negative = head forward/up, -90 = forward). The rear hand is derived from them, so both hands are
 * on the handle by construction. `lean` forward lean (deg), `twist` 0..1 shoulder turn, `dip` body drop in px
 * (negative = rise). `ease` shapes the segment that STARTS at this key.
 */
export interface ChopKey {
  phase: number;
  ease: ChopEase;
  gx: number;
  gy: number;
  theta: number;
  lean: number;
  twist: number;
  dip: number;
  /** Distance along the handle from the lead hand to the rear hand (default AXE_HAND_GAP); wider at the wind-up so two fists show. */
  gap?: number;
}
/** Hand spacing at the top of the wind-up: the rear fist is well down the handle, clear of the lead fist and the head. */
export const WINDUP_HAND_GAP = 9;
/**
 * Swing: ready, raise the axe over the shoulder (lean back, rise, shoulders turned), hold, strike (fast), hit
 * at SWING_IMPACT_PHASE with the head below the hands and the edge down, bite/recoil with a body overshoot, settle.
 * The last key repeats the first so the cycle loops. theta runs -125 -> -210 (up and over) -> -62 (clockwise).
 */
export const CHOP_KEYS: Readonly<Record<MotionParams['chopStyle'], readonly ChopKey[]>> = {
  swing: [
    { phase: 0, ease: 'inOut', gx: 4.5, gy: 10.5, theta: -125, lean: 3, twist: 0, dip: 0 },
    { phase: 0.22, ease: 'inOut', gx: 9, gy: 0, theta: -170, lean: -2, twist: 0.5, dip: -0.3 },
    {
      phase: 0.44,
      ease: 'inOut',
      gx: 3,
      gy: -9,
      theta: -210,
      lean: -7,
      twist: 1,
      dip: -0.7,
      gap: WINDUP_HAND_GAP,
    },
    {
      phase: 0.54,
      ease: 'in',
      gx: 3,
      gy: -9,
      theta: -212,
      lean: -8,
      twist: 1,
      dip: -0.7,
      gap: WINDUP_HAND_GAP,
    },
    { phase: 0.62, ease: 'inOut', gx: 10, gy: 1, theta: -135, lean: 4, twist: 0.2, dip: 0 },
    {
      phase: SWING_IMPACT_PHASE,
      ease: 'inOut',
      gx: 4,
      gy: 14.5,
      theta: -76,
      lean: 10,
      twist: 0,
      dip: 0.7,
    },
    { phase: 0.74, ease: 'inOut', gx: 4, gy: 15, theta: -84, lean: 12, twist: 0, dip: 0.9 },
    { phase: 0.86, ease: 'inOut', gx: 3.5, gy: 12.5, theta: -100, lean: 6, twist: 0, dip: 0.25 },
    { phase: 1, ease: 'inOut', gx: 4.5, gy: 10.5, theta: -125, lean: 3, twist: 0, dip: 0 },
  ],
  // Reduced: one step down to the SAME strike pose the swing reaches at 0.70 (tool angle, lean, grip), no wind-up.
  tap: [
    { phase: 0, ease: 'step', gx: 5, gy: 9, theta: -105, lean: 0, twist: 0, dip: 0 },
    {
      phase: SWING_IMPACT_PHASE,
      ease: 'step',
      gx: 4,
      gy: 14.7,
      theta: -78.7,
      lean: 10.7,
      twist: 0,
      dip: 0,
    },
    { phase: 0.78, ease: 'step', gx: 5, gy: 9, theta: -105, lean: 0, twist: 0, dip: 0 },
    { phase: 1, ease: 'step', gx: 5, gy: 9, theta: -105, lean: 0, twist: 0, dip: 0 },
  ],
  static: [{ phase: 0, ease: 'step', gx: 5, gy: 9, theta: -105, lean: 0, twist: 0, dip: 0 }],
};

const REST_TAP: ChopKey = {
  phase: 0,
  ease: 'step',
  gx: 5,
  gy: 9,
  theta: -105,
  lean: 0,
  twist: 0,
  dip: 0,
};
/**
 * Mining swing (same machinery and impact phase as the chop): the same overhead wind-up, then a heavier downward
 * strike at the rock on the ground in front of the feet, so the hands land lower and further forward than the chop's
 * with a deeper dip. The haft ends up pointing forward-down (theta -58), so the leading tip of the head points DOWN into
 * the rock. A short recoil, then back to ready.
 */
export const MINE_KEYS: Readonly<Record<MotionParams['chopStyle'], readonly ChopKey[]>> = {
  swing: [
    { phase: 0, ease: 'inOut', gx: 4.5, gy: 10.5, theta: -125, lean: 3, twist: 0, dip: 0 },
    { phase: 0.22, ease: 'inOut', gx: 9, gy: 0, theta: -165, lean: -2, twist: 0.5, dip: -0.3 },
    {
      phase: 0.44,
      ease: 'inOut',
      gx: 3,
      gy: -9,
      theta: -205,
      lean: -7,
      twist: 1,
      dip: -0.7,
      gap: WINDUP_HAND_GAP,
    },
    {
      phase: 0.54,
      ease: 'in',
      gx: 3,
      gy: -9,
      theta: -207,
      lean: -8,
      twist: 1,
      dip: -0.7,
      gap: WINDUP_HAND_GAP,
    },
    { phase: 0.62, ease: 'inOut', gx: 9, gy: 3, theta: -120, lean: 5, twist: 0.2, dip: 0 },
    {
      phase: SWING_IMPACT_PHASE,
      ease: 'inOut',
      gx: 6,
      gy: 15,
      theta: -58,
      lean: 12,
      twist: 0,
      dip: 1.1,
    },
    { phase: 0.74, ease: 'inOut', gx: 6, gy: 15.5, theta: -64, lean: 13, twist: 0, dip: 1.2 },
    { phase: 0.86, ease: 'inOut', gx: 5, gy: 12.5, theta: -95, lean: 7, twist: 0, dip: 0.3 },
    { phase: 1, ease: 'inOut', gx: 4.5, gy: 10.5, theta: -125, lean: 3, twist: 0, dip: 0 },
  ],
  tap: [
    REST_TAP,
    {
      phase: SWING_IMPACT_PHASE,
      ease: 'step',
      gx: 6,
      gy: 15.2,
      theta: -60,
      lean: 12.3,
      twist: 0,
      dip: 0,
    },
    { phase: 0.78, ease: 'step', gx: 5, gy: 9, theta: -105, lean: 0, twist: 0, dip: 0 },
    { phase: 1, ease: 'step', gx: 5, gy: 9, theta: -105, lean: 0, twist: 0, dip: 0 },
  ],
  static: CHOP_KEYS.static,
};
/**
 * Net fishing (same machinery): a quick two-handed cast of the hoop forward-down toward the water (wind-up behind the
 * shoulder, throw), a hold while it sinks, then a SLOW haul: the hands draw in and the pole comes back upright with a
 * small lean back. No impact beat (fishing runs its own loop; the pose is visual only). Tap = a small dip of the pole.
 */
export const NET_KEYS: Readonly<Record<MotionParams['chopStyle'], readonly ChopKey[]>> = {
  swing: [
    { phase: 0, ease: 'inOut', gx: 4.5, gy: 10.5, theta: -125, lean: 3, twist: 0, dip: 0 },
    { phase: 0.12, ease: 'inOut', gx: 8, gy: 3, theta: -165, lean: -3, twist: 0.4, dip: -0.2 },
    { phase: 0.24, ease: 'inOut', gx: 7, gy: 9, theta: -100, lean: 6, twist: 0.1, dip: 0.3 },
    { phase: 0.3, ease: 'inOut', gx: 8, gy: 12, theta: -66, lean: 9, twist: 0, dip: 0.7 },
    { phase: 0.46, ease: 'inOut', gx: 8, gy: 12.5, theta: -60, lean: 10, twist: 0, dip: 0.8 },
    { phase: 0.78, ease: 'inOut', gx: 3.5, gy: 8, theta: -112, lean: -4, twist: 0.2, dip: 0 },
    { phase: 1, ease: 'inOut', gx: 4.5, gy: 10.5, theta: -125, lean: 3, twist: 0, dip: 0 },
  ],
  tap: [
    REST_TAP,
    { phase: 0.3, ease: 'step', gx: 6, gy: 11, theta: -88, lean: 0, twist: 0, dip: 0 },
    { phase: 0.78, ease: 'step', gx: 5, gy: 9, theta: -105, lean: 0, twist: 0, dip: 0 },
    { phase: 1, ease: 'step', gx: 5, gy: 9, theta: -105, lean: 0, twist: 0, dip: 0 },
  ],
  static: CHOP_KEYS.static,
};
/**
 * Rod fishing (same machinery) on a TIMELINE (see SWING_TIMELINES), not a fixed cycle: phase 0..0.3 is the one-off CAST
 * (the rod tip goes back over the shoulder, then whips forward), 0.3..0.7 is the WAIT loop (rod held out over the water,
 * the tip bobbing slightly; both ends are the same rest pose so it loops), 0.7..1 is the CATCH lift (tip up, hands
 * draw in, settle back to the rest pose). Visual only: no impact beat.
 */
export const ROD_KEYS: Readonly<Record<MotionParams['chopStyle'], readonly ChopKey[]>> = {
  swing: [
    { phase: 0, ease: 'inOut', gx: 4.5, gy: 10.5, theta: -110, lean: 2, twist: 0, dip: 0 },
    { phase: 0.08, ease: 'inOut', gx: 9, gy: 0, theta: -170, lean: -2, twist: 0.5, dip: -0.3 },
    { phase: 0.15, ease: 'in', gx: 3, gy: -9, theta: -208, lean: -7, twist: 1, dip: -0.7 },
    { phase: 0.22, ease: 'inOut', gx: 10, gy: 1, theta: -112, lean: 5, twist: 0.2, dip: 0.2 },
    { phase: 0.3, ease: 'inOut', gx: 8, gy: 8, theta: -113, lean: 4, twist: 0, dip: 0.3 },
    { phase: 0.4, ease: 'inOut', gx: 8, gy: 7.6, theta: -108, lean: 4, twist: 0, dip: 0.3 },
    { phase: 0.55, ease: 'inOut', gx: 8, gy: 8.4, theta: -119, lean: 4, twist: 0, dip: 0.3 },
    { phase: 0.7, ease: 'inOut', gx: 8, gy: 8, theta: -113, lean: 4, twist: 0, dip: 0.3 },
    { phase: 0.78, ease: 'inOut', gx: 7, gy: 2, theta: -148, lean: -3, twist: 0.2, dip: -0.2 },
    { phase: 0.9, ease: 'inOut', gx: 8, gy: 8.5, theta: -106, lean: 5, twist: 0, dip: 0.4 },
    { phase: 1, ease: 'inOut', gx: 8, gy: 8, theta: -113, lean: 4, twist: 0, dip: 0.3 },
  ],
  tap: [
    { phase: 0, ease: 'step', gx: 5, gy: 9, theta: -112, lean: 0, twist: 0, dip: 0 },
    { phase: 0.3, ease: 'step', gx: 6, gy: 9, theta: -113, lean: 0, twist: 0, dip: 0 },
    { phase: 0.5, ease: 'step', gx: 6, gy: 9, theta: -108, lean: 0, twist: 0, dip: 0 },
    { phase: 0.7, ease: 'step', gx: 6, gy: 9, theta: -113, lean: 0, twist: 0, dip: 0 },
    { phase: 0.8, ease: 'step', gx: 5, gy: 8, theta: -142, lean: 0, twist: 0, dip: 0 },
    { phase: 0.9, ease: 'step', gx: 6, gy: 9, theta: -113, lean: 0, twist: 0, dip: 0 },
  ],
  static: CHOP_KEYS.static,
};
/** Timeline of a swing state that is not a plain loop: one-off cast, then a looping wait; the catch pulse plays [waitEnd, 1]. */
export interface SwingTimeline {
  castMs: number;
  waitMs: number;
  catchMs: number;
  /** Key phases where the cast ends (wait starts) and the wait ends (the catch lift starts). */
  castEnd: number;
  waitEnd: number;
}
export const SWING_TIMELINES: Readonly<Partial<Record<AnimState, SwingTimeline>>> = {
  fishRod: { castMs: 1100, waitMs: 2400, catchMs: 800, castEnd: 0.3, waitEnd: 0.7 },
};
/** Swing keys per two-handed tool state; the same chopPose machinery plays any of them. */
export const SWING_KEYS = {
  chop: CHOP_KEYS,
  mine: MINE_KEYS,
  fishNet: NET_KEYS,
  fishRod: ROD_KEYS,
} as const;
export type SwingState = keyof typeof SWING_KEYS;
/** Per swing state: the named rig graphic, how to draw it, and whether the swing fires onImpact (fishing is visual only). */
export const SWING_TOOLS: Readonly<
  Record<
    SwingState,
    {
      name: string;
      rects: (tint: number) => AxeRect[];
      impact: boolean;
      /** A line hanging from the tool tip (rod-local `tipY`), drawn upright in its own graphic named `<name>Line`. */
      hang?: { tipY: number; rects: () => AxeRect[] };
    }
  >
> = {
  chop: { name: 'axe', rects: axeRects, impact: true },
  mine: { name: 'pick', rects: pickRects, impact: true },
  fishNet: { name: 'net', rects: netRects, impact: false },
  fishRod: {
    name: 'rod',
    rects: rodRects,
    impact: false,
    hang: { tipY: ROD_TIP_Y, rects: rodLineRects },
  },
};

/** Reduced motion walks with a gentler gait (half amplitude): less motion, not a character sliding on frozen legs. */
export const REDUCED_WALK_SCALE = 0.5;

/** Reduced mode fades are capped well under the 120 ms budget. */
export const REDUCED_FADE_MS = 100;

/** Animation parameters per motion mode. The caller (preferences) picks the mode. */
export const MOTION: Readonly<Record<MotionMode, MotionParams>> = {
  on: {
    walkScale: 1,
    breathScale: 1,
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
    walkScale: REDUCED_WALK_SCALE,
    breathScale: 0,
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
    breathScale: 0,
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
/**
 * When the animation state changes, the body offset (lean shift, bob) eases from where it was to the new pose over this
 * long instead of snapping (a run's 9 deg lean to a chop's 3 deg moved the body ~1.5 art px in one frame).
 */
export const POSE_BLEND_MS = 160;

// ---------------------------------------------------------------------------------------------------------------
// Acts: lighting a fire and cooking over it (one hand on a prop, not a two-handed swing; see act.ts).
// ---------------------------------------------------------------------------------------------------------------

/** Ticks a lighting action lasts. Mirrors facilities' LIGHT_TICKS (render cannot import features; a test pins both). */
export const LIGHT_TICKS = 3;
/** Ticks per cooked item. Mirrors cooking's TICKS_PER_COOK. */
export const TICKS_PER_COOK = 4;

/**
 * One act pose in the TORSO frame (art px, +x forward, +y down, origin between the shoulders), same frame as ChopKey.
 * `gx, gy` = the front (prop) hand, `bx, by` = the back hand, `theta` = the prop's angle (degrees, Phaser rotation: 0 =
 * hanging straight down the forearm axis, negative = tip forward/up). `dip` = hips drop in px; `kneel` 0..1 puts the
 * back knee on the ground (thigh upright, shin folded back) instead of a plain two-leg squat.
 */
export interface ActKey {
  phase: number;
  ease: ChopEase;
  gx: number;
  gy: number;
  bx: number;
  by: number;
  theta: number;
  lean: number;
  twist: number;
  dip: number;
  kneel: number;
}

/** Arms hanging straight down (shoulder at torso x = +-6): the pose idle and the ends of a lighting cycle use. */
const ACT_HANG = { gx: 6, gy: 16, bx: -6, by: 16, theta: 0, twist: 0 } as const;
/**
 * Kneeling over the log pile: the box held low and CLOSE to the chest (gx 4.5: the back hand, 10.5 px from its shoulder,
 * reaches it with the upper arm hanging along the torso, so it neither crosses the body nor rises like a wing), the
 * back hand cocked / striking it a little behind it.
 */
const LIGHT_KNEEL = { dip: 5.6, kneel: 1, gx: 4.5, gy: 9, theta: 0, twist: 0 } as const;
const LIGHT_COCK = { ...LIGHT_KNEEL, bx: 3, by: 3, lean: 30 } as const;
const LIGHT_HIT = { ...LIGHT_KNEEL, bx: 4, by: 9, lean: 34 } as const;

/**
 * Lighting, one-shot over LIGHT_TICKS: kneel down (0..0.18), four short flint strokes on the tinderbox (cock, hit every
 * 0.08), hold a beat, stand back up (0.8..0.97) so the pose ends on the idle one.
 */
export const LIGHT_KEYS: Readonly<Record<MotionParams['chopStyle'], readonly ActKey[]>> = {
  swing: [
    { phase: 0, ease: 'inOut', ...ACT_HANG, lean: 0, dip: 0, kneel: 0 },
    { phase: 0.18, ease: 'inOut', ...LIGHT_COCK },
    { phase: 0.26, ease: 'inOut', ...LIGHT_HIT },
    { phase: 0.34, ease: 'inOut', ...LIGHT_COCK },
    { phase: 0.42, ease: 'inOut', ...LIGHT_HIT },
    { phase: 0.5, ease: 'inOut', ...LIGHT_COCK },
    { phase: 0.58, ease: 'inOut', ...LIGHT_HIT },
    { phase: 0.66, ease: 'inOut', ...LIGHT_COCK },
    { phase: 0.74, ease: 'inOut', ...LIGHT_HIT },
    { phase: 0.8, ease: 'inOut', ...LIGHT_HIT, lean: 32 },
    { phase: 0.97, ease: 'inOut', ...ACT_HANG, lean: 0, dip: 0, kneel: 0 },
    { phase: 1, ease: 'inOut', ...ACT_HANG, lean: 0, dip: 0, kneel: 0 },
  ],
  tap: [{ phase: 0, ease: 'step', ...LIGHT_HIT }],
  static: [{ phase: 0, ease: 'step', ...LIGHT_HIT, dip: 0, kneel: 0, lean: 6 }],
};

const COOK_HOLD = { bx: -1, by: 14, twist: 0, kneel: 0 } as const;
/** Skewer held out and a little down, the food above the flames. */
const COOK_OVER = { ...COOK_HOLD, gx: 19.5, gy: 8, theta: -54, lean: 9, dip: 2.4 } as const;
/** The poke: hand and food dip into the flame (one per cook tick, TICKS_PER_COOK pokes per cycle minus the check). */
const COOK_POKE = { ...COOK_HOLD, gx: 19, gy: 9.2, theta: -66, lean: 10, dip: 2.7 } as const;
/**
 * Cooking, looping over TICKS_PER_COOK: crouch with the skewer held out over the flames, a small poke into the fire every
 * tick (0.25 of the cycle), and at the last tick a lift-and-check.
 */
export const COOK_KEYS: Readonly<Record<MotionParams['chopStyle'], readonly ActKey[]>> = {
  swing: [
    { phase: 0, ease: 'inOut', ...COOK_OVER },
    { phase: 0.12, ease: 'inOut', ...COOK_POKE },
    { phase: 0.25, ease: 'inOut', ...COOK_OVER },
    { phase: 0.37, ease: 'inOut', ...COOK_POKE },
    { phase: 0.5, ease: 'inOut', ...COOK_OVER },
    { phase: 0.58, ease: 'inOut', ...COOK_POKE },
    { phase: 0.68, ease: 'inOut', ...COOK_HOLD, gx: 12, gy: 1.5, theta: -104, lean: 5, dip: 1.6 },
    { phase: 0.78, ease: 'inOut', ...COOK_HOLD, gx: 11.5, gy: 1.2, theta: -108, lean: 4, dip: 1.5 },
    { phase: 0.92, ease: 'inOut', ...COOK_OVER },
    { phase: 1, ease: 'inOut', ...COOK_OVER },
  ],
  tap: [{ phase: 0, ease: 'step', ...COOK_OVER }],
  static: [{ phase: 0, ease: 'step', ...COOK_OVER, lean: 4, dip: 0 }],
};

/**
 * Per act state, how the arms are solved. `frontSide` is the front arm's elbow side (1 = elbow trails back, -1 = elbow
 * forward and down: a held-close hand then reads as a V with the elbow below the shoulder, not the upper arm swung back
 * above the horizontal). `backUpperWorld` clamps the BACK upper arm to within this many degrees of straight DOWN in the
 * world (the torso lean is added back, so a 30 degree kneeling lean cannot lift the arm like a wing); the forearm then
 * re-aims at the hand target.
 */
export const ACT_ARMS: Readonly<Record<ActState, { frontSide: 1 | -1; backUpperWorld: number }>> = {
  lighting: { frontSide: -1, backUpperWorld: 20 },
  cooking: { frontSide: 1, backUpperWorld: 90 },
};

/** Keys per act state. */
export const ACT_KEYS = { lighting: LIGHT_KEYS, cooking: COOK_KEYS } as const;
export type ActState = keyof typeof ACT_KEYS;

/** Per act state: cycle length, whether it loops (false = plays once and holds its last pose), and the named prop in the hand. */
export const ACT_PLAN: Readonly<
  Record<ActState, { periodMs: number; loop: boolean; prop: string; rects: () => AxeRect[] }>
> = {
  lighting: {
    periodMs: LIGHT_TICKS * TICK_MS,
    loop: false,
    prop: 'tinderbox',
    rects: tinderboxRects,
  },
  cooking: { periodMs: TICKS_PER_COOK * TICK_MS, loop: true, prop: 'food', rects: foodRects },
};

/** The tinderbox in the fist (origin at the hand): a dark box, a lighter lid and a steel striker on top. */
export function tinderboxRects(): AxeRect[] {
  return [
    { x: -3, y: -1, w: 6, h: 4, color: 0x4a3321, alpha: 1 },
    { x: -3, y: -1, w: 6, h: 1, color: 0x7a5a3a, alpha: 1 },
    { x: 1, y: -2, w: 2, h: 1, color: 0xbfc5cc, alpha: 1 },
  ];
}

/**
 * Food on a skewer (origin at the hand, +y along the stick): a dark-edged stick with a plump pale-pink fish at its tip.
 * The dark rim keeps it readable against orange flames and sand, on every facing.
 */
export function foodRects(): AxeRect[] {
  return [
    { x: -0.5, y: -2, w: 1, h: 10, color: 0x4a3018, alpha: 1 },
    { x: -5, y: 5, w: 10, h: 6, color: 0x4a2a1c, alpha: 1 },
    { x: -4, y: 6, w: 8, h: 4, color: 0xf2a58c, alpha: 1 },
    { x: -4, y: 6, w: 8, h: 1, color: 0xffd2bd, alpha: 1 },
    { x: -4, y: 9, w: 8, h: 1, color: 0xc4684a, alpha: 1 },
  ];
}

// ---------------------------------------------------------------------------------------------------------------
// Fire flicker (see flame.ts)
// ---------------------------------------------------------------------------------------------------------------

/** Per layer flicker rates in Hz, from the outermost flame (slow) to the inner tongues (fast). Layers past the end reuse the last. */
export const FLAME_RATES_HZ: readonly number[] = [2.3, 3.4, 4.7, 6.1];
/** Second noise octave: its rate relative to the first (incommensurate, so the pattern never visibly repeats). */
export const FLAME_OCTAVE = 2.37;
/** Peak flicker at amp 1 and a layer's rank 1 (the innermost layer; outer layers get less). */
export const FLAME_SCALE_Y = 0.16;
export const FLAME_SCALE_X = 0.08;
export const FLAME_ALPHA = 0.15;
/** Slow sideways sway of the flame tips (art px at the topmost layer) and its rate. */
export const FLAME_SWAY_PX = 0.9;
export const FLAME_SWAY_HZ = 0.45;
/** Glow behind the fire: alpha and scale pulse, slow. */
export const FLAME_GLOW_ALPHA = 0.18;
export const FLAME_GLOW_SCALE = 0.05;
export const FLAME_GLOW_HZ = 1.25;
/** The dying fire (last stretch of its burn): lower amplitude, smaller flames, dimmer glow, slower. Blends over this long. */
export const FLAME_DYING = { amp: 0.45, scale: 0.78, glow: 0.55, rate: 0.7 } as const;
export const FLAME_DYING_BLEND_MS = 800;

/** Flicker per motion mode: amplitude, rate and sway multipliers (off = flames stand still at their base pose). */
export const FLAME_MOTION: Readonly<
  Record<MotionMode, { amp: number; rate: number; sway: number }>
> = {
  on: { amp: 1, rate: 1, sway: 1 },
  reduced: { amp: 0.3, rate: 0.5, sway: 0 },
  off: { amp: 0, rate: 0, sway: 0 },
};
