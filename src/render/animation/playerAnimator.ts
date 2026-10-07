import type Phaser from 'phaser';
import { ART_SCALE, facingScaleX } from '@render/index';
import {
  PLAYER_LOOK,
  figureArmPivots,
  figureLegPivots,
  figureLowerArmRects,
  figureLowerLegRects,
  figureUpperArmRects,
  figureUpperLegRects,
} from '@render/index';
import type { FigureRect, PlayerView } from '@render/index';
import {
  AXE_GRIP_Y,
  BACK_VIEW_SWING_REACH,
  CHOP_SWING_PERIOD_MS,
  MOTION,
  DEFAULT_TOOL_TINT,
  SWING_IMPACT_PHASE,
  TOOL_TINTS,
  axeRects,
} from './data';
import { computePose, facingIsBack, foreshortenSwing, facingIsLeft, makePose } from './logic';
import type { AnimState, MotionMode, SetStateOpts } from './types';

export interface PlayerAnimator {
  setState(state: AnimState, opts?: SetStateOpts): void;
  /** Call every frame with scene time in ms. */
  update(timeMs: number): void;
  /** Switch motion mode at runtime (e.g. when the preference changes). */
  setMode(mode: MotionMode): void;
  /** Fired once per chop swing at the moment the axe lands, in every motion mode (it drives sound). */
  onImpact?: () => void;
  readonly swingPeriodMs: number;
  destroy(): void;
}

/** A Graphics holding the given rects (art px). Built once; never per frame. */
function rectsGraphics(
  scene: Phaser.Scene,
  rects: readonly FigureRect[],
): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  for (const r of rects) g.fillStyle(r.color, 1).fillRect(r.x, r.y, r.w, r.h);
  return g;
}

/**
 * Adds an overlay rig (arms, feet, axe) to the player container. The rig is flipped with
 * facingScaleX; the nameplate is a sibling and is never touched. Body bob moves playerView.body.
 */
export function createPlayerAnimator(
  scene: Phaser.Scene,
  playerView: PlayerView,
  opts: { mode?: MotionMode } = {},
): PlayerAnimator {
  const container = playerView.container;
  const body = playerView.body;
  /** The body is drawn at 1x and scaled up by graphics; the rig and any bob follow the same factor. */
  const unit = ART_SCALE;

  const rig = scene.add.container(0, 0);
  const pivots = figureLegPivots(PLAYER_LOOK);
  /** A leg = thigh container at the hip, with the shin container at the knee inside it. */
  const makeLeg = (x: number, mirror: boolean) => {
    const thigh = scene.add.container(x, pivots.hipY);
    thigh.add(rectsGraphics(scene, figureUpperLegRects(PLAYER_LOOK, mirror)));
    const shin = scene.add.container(0, pivots.kneeY - pivots.hipY);
    shin.add(rectsGraphics(scene, figureLowerLegRects(PLAYER_LOOK, mirror)));
    thigh.add(shin);
    return { thigh, shin };
  };
  const legBack = makeLeg(-pivots.hipX, true);
  const legFront = makeLeg(pivots.hipX, false);
  const arm = figureArmPivots(PLAYER_LOOK);
  const SHOULDER_X = arm.shoulderX;
  const SHOULDER_Y = arm.shoulderY;
  /** An arm = upper-arm container at the shoulder, with the forearm container at the elbow inside it. */
  const makeArm = (name: string, mirror: boolean) => {
    const upper = scene.add.container(mirror ? -SHOULDER_X : SHOULDER_X, SHOULDER_Y);
    upper.name = `${name}Upper`;
    upper.add(rectsGraphics(scene, figureUpperArmRects(PLAYER_LOOK, mirror)));
    const fore = scene.add.container(0, arm.elbowY);
    fore.name = `${name}Fore`;
    fore.add(rectsGraphics(scene, figureLowerArmRects(PLAYER_LOOK, mirror)));
    upper.add(fore);
    return { upper, fore };
  };
  const armBack = makeArm('armBack', true);
  const armFront = makeArm('armFront', false);
  const axe = scene.add.graphics();
  armFront.fore.add(axe);
  rig.setScale(unit);
  rig.add([legBack.thigh, legFront.thigh, armBack.upper, armFront.upper]);
  // Rig sits right after the body, before the label.
  container.addAt(rig, 1);

  let mode: MotionMode = opts.mode ?? 'on';
  const pose = makePose();
  let state: AnimState = 'idle';
  let startedAt = -1;
  let lastImpactCycle = -1;
  let lastTime = 0;
  let tint = -1;
  let left = false;
  let isBack = false;
  let running = false;

  function drawAxe(color: number): void {
    if (tint === color) return;
    tint = color;
    axe.clear();
    for (const r of axeRects(color)) axe.fillStyle(r.color, r.alpha).fillRect(r.x, r.y, r.w, r.h);
    axe.setPosition(0, AXE_GRIP_Y); // fist (forearm-local)
  }
  drawAxe(DEFAULT_TOOL_TINT);

  const self: PlayerAnimator = {
    swingPeriodMs: CHOP_SWING_PERIOD_MS,
    setMode(next) {
      mode = next;
    },
    setState(next, o) {
      if (o?.facing !== undefined) {
        left = facingIsLeft(o.facing, left);
        const back = facingIsBack(o.facing);
        if (back !== isBack) {
          isBack = back;
          playerView.setBackView?.(back); // redraws the body with the back of the head
        }
      } else if (o?.facingLeft !== undefined) left = o.facingLeft;
      if (o?.facing !== undefined || o?.facingLeft !== undefined) {
        const sx = facingScaleX(left) * unit;
        rig.setScale(sx, unit);
        body.setScale(sx, unit); // the animator owns facing: the view's flip only knows left/right
      }
      if (o?.running !== undefined) running = o.running;
      if (o?.toolItemId !== undefined) drawAxe(TOOL_TINTS[o.toolItemId] ?? DEFAULT_TOOL_TINT);
      if (next !== state) {
        state = next;
        startedAt = -1; // restart the cycle on the next update
        lastImpactCycle = -1;
      }
    },
    update(timeMs) {
      lastTime = timeMs;
      if (startedAt < 0) startedAt = timeMs;
      computePose(
        state,
        timeMs - startedAt,
        pose,
        1,
        CHOP_SWING_PERIOD_MS,
        mode,
        running ? 'run' : 'walk',
      );
      // Lean pivots about the hips (art px, rig-local): the body is rotated and shifted so the hem stays
      // on the legs, and the shoulders follow the same rotation. Rotation sign follows the flip.
      const side = left ? -1 : 1;
      const sin = Math.sin(pose.lean);
      const cos = Math.cos(pose.lean);
      const hip = -pivots.hipY; // height of the hips above the feet
      body.setRotation(pose.lean * side);
      body.x = -hip * sin * side * unit;
      body.y = (hip * (1 - cos) + pose.bodyBobY) * unit;
      rig.y = pose.bodyBobY * unit;
      // Shoulder (+/-SHOULDER_X, SHOULDER_Y) rotated about the hip.
      const dy = SHOULDER_Y - pivots.hipY;
      armFront.upper.setPosition(
        SHOULDER_X * cos - dy * sin,
        pivots.hipY + SHOULDER_X * sin + dy * cos,
      );
      armBack.upper.setPosition(
        -SHOULDER_X * cos - dy * sin,
        pivots.hipY - SHOULDER_X * sin + dy * cos,
      );
      // Shoulder = upper-arm swing; elbow = forearm angle relative to the upper arm. The chop swings the
      // whole straight arm from the shoulder (axeAngle is already Phaser-signed).
      if (pose.axeVisible) {
        armFront.upper.setRotation(
          isBack && MOTION[mode].chopStyle !== 'static'
            ? foreshortenSwing(pose.axeAngle, BACK_VIEW_SWING_REACH)
            : pose.axeAngle,
        );
        armFront.fore.setRotation(0);
      } else {
        armFront.upper.setRotation(-pose.armUpperFront + pose.lean);
        armFront.fore.setRotation(-(pose.armAngle - pose.armUpperFront));
      }
      armBack.upper.setRotation(-pose.armUpperBack + pose.lean);
      armBack.fore.setRotation(-(pose.armAngleBack - pose.armUpperBack));
      // Forward-positive pose angles become Phaser rotation (clockwise = foot back), so negate.
      legFront.thigh.setRotation(-pose.thighFront);
      legFront.shin.setRotation(pose.kneeFront);
      legBack.thigh.setRotation(-pose.thighBack);
      legBack.shin.setRotation(pose.kneeBack);
      axe.setVisible(pose.axeVisible);
      if (state === 'chop') {
        const elapsed = timeMs - startedAt;
        const cycle = Math.floor(elapsed / CHOP_SWING_PERIOD_MS);
        const phase = elapsed / CHOP_SWING_PERIOD_MS - cycle;
        if (cycle > lastImpactCycle && phase >= SWING_IMPACT_PHASE) {
          lastImpactCycle = cycle;
          self.onImpact?.();
        }
      }
    },
    destroy() {
      body.x = 0;
      body.y = 0;
      body.setRotation(0);
      rig.destroy();
      void lastTime;
    },
  };
  return self;
}
