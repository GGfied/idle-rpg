import { describe, expect, it } from 'vitest';
import { defaultGeom, makePose } from './logic';
import { EASE, chopPose, handGapAt } from './chop';
import { ACT_KEYS, SWING_KEYS, TWIST_NARROW } from './data';
import type { ActState, SwingState } from './data';

// Upper arm + forearm, art px. Hardcoded on purpose: reading it from the rig would move with the data under test.
const ARM_LENGTH = 16;
// |forearm - upper arm|: a target closer to the shoulder than this folds the arm past its minimum.
const ARM_MIN_REACH = 2;
const g = defaultGeom();
const STYLES = ['swing', 'tap'] as const;
const TOOLS = Object.keys(SWING_KEYS) as SwingState[];
// 0.5% steps, plus the last instant before the wrap.
const PHASES = Array.from({ length: 200 }, (_, i) => i / 200);

/**
 * Requested grip points (the targets handed to solveGrip, relative to each shoulder, torso frame) at a swing phase.
 * Derived from the pose's grip, handle angle and twist plus the lead-to-rear gap, NOT from the solved arm angles:
 * solved lengths can never exceed the arm, so only the request can show a clamped (floating) hand.
 */
function requested(tool: SwingState, style: (typeof STYLES)[number], phase: number) {
  const p = makePose();
  chopPose(style, phase, p, g, 1, tool);
  const sx = g.shoulderX * (1 - TWIST_NARROW * p.twist);
  const gap = handGapAt(style, phase, tool);
  const rx = p.gripX + gap * Math.sin(p.axeAngle);
  const ry = p.gripY - gap * Math.cos(p.axeAngle);
  return {
    lead: Math.hypot(p.gripX - sx, p.gripY),
    rear: Math.hypot(rx + sx, ry),
  };
}

describe('swing grip targets are reachable (no clamped, floating hand)', () => {
  it('the rig arm is 16 px long (update ARM_LENGTH with it)', () => {
    expect(g.elbowY + g.handY).toBe(ARM_LENGTH);
    expect(Math.abs(g.elbowY - g.handY)).toBe(ARM_MIN_REACH);
  });
  it.each(TOOLS.flatMap((t) => STYLES.map((s) => [t, s] as const)))(
    '%s %s: both requested hands are within arm length at every phase',
    (tool, style) => {
      for (const ph of PHASES) {
        const r = requested(tool, style, ph);
        expect(r.lead, `lead target @${ph}`).toBeLessThanOrEqual(ARM_LENGTH);
        expect(r.rear, `rear target @${ph}`).toBeLessThanOrEqual(ARM_LENGTH);
        expect(r.lead, `lead target @${ph}`).toBeGreaterThan(ARM_MIN_REACH);
        expect(r.rear, `rear target @${ph}`).toBeGreaterThan(ARM_MIN_REACH);
      }
    },
  );
});

/** Same, for the lighting and cooking acts: both targets come straight from the interpolated key (gx,gy / bx,by). */
function requestedAct(state: ActState, style: (typeof STYLES)[number], phase: number) {
  const keys = ACT_KEYS[state][style];
  let i = 0;
  while (i + 2 < keys.length && phase >= keys[i + 1]!.phase) i++;
  const a = keys[i]!;
  const b = keys[Math.min(i + 1, keys.length - 1)]!;
  const span = b.phase - a.phase;
  const t = span > 0 ? EASE[a.ease](Math.min(1, Math.max(0, (phase - a.phase) / span))) : 0;
  const mix = (x: number, y: number) => x + (y - x) * t;
  const sx = g.shoulderX * (1 - TWIST_NARROW * mix(a.twist, b.twist));
  return {
    lead: Math.hypot(mix(a.gx, b.gx) - sx, mix(a.gy, b.gy)),
    rear: Math.hypot(mix(a.bx, b.bx) + sx, mix(a.by, b.by)),
  };
}

describe('act grip targets are reachable (no clamped, floating hand)', () => {
  it.each((Object.keys(ACT_KEYS) as ActState[]).flatMap((t) => STYLES.map((s) => [t, s] as const)))(
    '%s %s: both requested hands are within arm length at every phase',
    (state, style) => {
      for (const ph of PHASES) {
        const r = requestedAct(state, style, ph);
        expect(r.lead, `lead target @${ph}`).toBeLessThanOrEqual(ARM_LENGTH);
        expect(r.rear, `rear target @${ph}`).toBeLessThanOrEqual(ARM_LENGTH);
        expect(r.lead, `lead target @${ph}`).toBeGreaterThan(ARM_MIN_REACH);
        expect(r.rear, `rear target @${ph}`).toBeGreaterThan(ARM_MIN_REACH);
      }
    },
  );
});
