import type Phaser from 'phaser';
import { facingScaleX } from '@render/index';
import type { PlayerView } from '@render/index';
import { AXE_HANDLE_COLOR, CHOP_SWING_PERIOD_MS, DEFAULT_TOOL_TINT, TOOL_TINTS } from './data';
import { computePose, makePose } from './logic';
import type { AnimState, MotionMode, SetStateOpts } from './types';

export interface PlayerAnimator {
  setState(state: AnimState, opts?: SetStateOpts): void;
  /** Call every frame with scene time in ms. */
  update(timeMs: number): void;
  /** Switch motion mode at runtime (e.g. when the preference changes). */
  setMode(mode: MotionMode): void;
  readonly swingPeriodMs: number;
  destroy(): void;
}

const SKIN = 0xe8b88a;
const SLEEVE = 0x3a4a8c;
const LEG = 0x2b2b3a;

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

  const rig = scene.add.container(0, 0);
  const legBack = scene.add.graphics().fillStyle(LEG, 1).fillRect(-3, -3, 5, 3);
  const legFront = scene.add.graphics().fillStyle(LEG, 1).fillRect(-3, -3, 5, 3);
  const armBack = scene.add.container(-6, -16);
  armBack.add(scene.add.graphics().fillStyle(SLEEVE, 1).fillRect(-2, 0, 4, 8));
  const armFront = scene.add.container(6, -16);
  armFront.add(scene.add.graphics().fillStyle(SLEEVE, 1).fillRect(-2, 0, 4, 7));
  armFront.add(scene.add.graphics().fillStyle(SKIN, 1).fillRect(-2, 7, 4, 3));
  const axe = scene.add.graphics();
  armFront.add(axe);
  rig.add([legBack, legFront, armBack, armFront]);
  // Rig sits right after the body, before the label.
  container.addAt(rig, 1);

  let mode: MotionMode = opts.mode ?? 'on';
  const pose = makePose();
  let state: AnimState = 'idle';
  let startedAt = -1;
  let lastTime = 0;
  let tint = -1;

  function drawAxe(color: number): void {
    if (tint === color) return;
    tint = color;
    axe.clear();
    axe.fillStyle(AXE_HANDLE_COLOR, 1).fillRect(-1, -16, 2, 20); // handle, grip at hand (0,8)
    axe.fillStyle(color, 1).fillRect(1, -17, 6, 7); // blade
    axe.fillStyle(0xffffff, 0.25).fillRect(6, -17, 1, 7); // edge glint
    axe.setPosition(0, 8); // hand
  }
  drawAxe(DEFAULT_TOOL_TINT);

  return {
    swingPeriodMs: CHOP_SWING_PERIOD_MS,
    setMode(next) {
      mode = next;
    },
    setState(next, o) {
      if (o?.facingLeft !== undefined) rig.setScale(facingScaleX(o.facingLeft), 1);
      if (o?.toolItemId !== undefined) drawAxe(TOOL_TINTS[o.toolItemId] ?? DEFAULT_TOOL_TINT);
      if (next !== state) {
        state = next;
        startedAt = -1; // restart the cycle on the next update
      }
    },
    update(timeMs) {
      lastTime = timeMs;
      if (startedAt < 0) startedAt = timeMs;
      computePose(state, timeMs - startedAt, pose, 1, CHOP_SWING_PERIOD_MS, mode);
      body.y = pose.bodyBobY;
      rig.y = pose.bodyBobY;
      legFront.setPosition(0.5 + pose.legFrontX, -pose.legFrontLift);
      legBack.setPosition(-5.5 + pose.legBackX, -pose.legBackLift);
      legFront.setVisible(state === 'walk');
      legBack.setVisible(state === 'walk');
      armBack.setRotation(pose.armAngleBack);
      armFront.setRotation(pose.axeVisible ? pose.axeAngle : pose.armAngle);
      axe.setVisible(pose.axeVisible);
    },
    destroy() {
      body.y = 0;
      rig.destroy();
      void lastTime;
    },
  };
}
