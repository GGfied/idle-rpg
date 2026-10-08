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
import type { FigureLook, FigureRect, PlayerView } from '@render/index';
import {
  ACT_PLAN,
  AXE_GRIP_Y,
  BACK_VIEW_SWING_REACH,
  CHOP_SWING_PERIOD_MS,
  DEFAULT_TOOL_TINT,
  POSE_BLEND_MS,
  SWING_IMPACT_PHASE,
  SWING_TIMELINES,
  SWING_TOOLS,
  TOOL_TINTS,
  TWIST_NARROW,
} from './data';
import type { ActState, SwingState } from './data';
import {
  computePose,
  facingIsBack,
  facingIsLeft,
  makePose,
  projectSwing,
  armDepthGain,
  gaitAxis,
  gainedLength,
  kneeDepthShare,
  legDepthGain,
  rigGeom,
  swingAxis,
} from './logic';
import type { AnimState, ChopView, MotionMode, SetStateOpts, SwingAxis } from './types';

export interface PlayerAnimator {
  setState(state: AnimState, opts?: SetStateOpts): void;
  /** Call every frame with scene time in ms. */
  update(timeMs: number): void;
  /** Switch motion mode at runtime (e.g. when the preference changes). */
  setMode(mode: MotionMode): void;
  /**
   * Play a one-shot on top of the current state: 'catch' is the rod's lift (then it returns to the wait loop). Ignored in
   * states without a timeline. During the cast it waits for the cast to finish. Call it when a fish is caught.
   */
  pulse(kind: 'catch'): void;
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
  opts: { mode?: MotionMode; look?: FigureLook } = {},
): PlayerAnimator {
  const look = opts.look ?? PLAYER_LOOK;
  const container = playerView.container;
  const body = playerView.body;
  /** The body is drawn at 1x and scaled up by graphics; the rig and any bob follow the same factor. */
  const unit = ART_SCALE;

  const rig = scene.add.container(0, 0);
  const pivots = figureLegPivots(look);
  /** A leg = thigh container at the hip, with the shin container at the knee inside it. */
  const makeLeg = (x: number, mirror: boolean) => {
    const thigh = scene.add.container(x, pivots.hipY);
    thigh.add(rectsGraphics(scene, figureUpperLegRects(look, mirror)));
    const shin = scene.add.container(0, pivots.kneeY - pivots.hipY);
    shin.add(rectsGraphics(scene, figureLowerLegRects(look, mirror)));
    thigh.add(shin);
    return { thigh, shin };
  };
  const legBack = makeLeg(-pivots.hipX, true);
  const legFront = makeLeg(pivots.hipX, false);
  const arm = figureArmPivots(look);
  const geom = rigGeom(look);
  const SHOULDER_X = arm.shoulderX;
  const SHOULDER_Y = arm.shoulderY;
  /** An arm = upper-arm container at the shoulder, with the forearm container at the elbow inside it. */
  const makeArm = (name: string, mirror: boolean) => {
    const upper = scene.add.container(mirror ? -SHOULDER_X : SHOULDER_X, SHOULDER_Y);
    upper.name = `${name}Upper`;
    upper.add(rectsGraphics(scene, figureUpperArmRects(look, mirror)));
    const fore = scene.add.container(0, arm.elbowY);
    fore.name = `${name}Fore`;
    fore.add(rectsGraphics(scene, figureLowerArmRects(look, mirror)));
    upper.add(fore);
    return { upper, fore };
  };
  const armBack = makeArm('armBack', true);
  const armFront = makeArm('armFront', false);
  // One named graphic per two-handed tool (axe, pick, net): in the forearm for the front view, in the layer below.
  const SWING_STATES = Object.keys(SWING_TOOLS) as SwingState[];
  const tools = {} as Record<
    SwingState,
    { hand: Graphics; back: Graphics; handLine?: Graphics; backLine?: Graphics }
  >;
  type Graphics = Phaser.GameObjects.Graphics;
  for (const st of SWING_STATES) {
    const hand = scene.add.graphics();
    hand.name = SWING_TOOLS[st].name;
    armFront.fore.add(hand);
    tools[st] = { hand, back: scene.add.graphics() };
    if (SWING_TOOLS[st].hang) {
      const handLine = scene.add.graphics();
      handLine.name = `${SWING_TOOLS[st].name}Line`;
      armFront.fore.add(handLine);
      tools[st].handLine = handLine;
    }
  }
  // One named prop per act (tinderbox, food): in the front forearm, drawn once, shown only in its act's state.
  const ACT_STATES = Object.keys(ACT_PLAN) as ActState[];
  const props = {} as Record<ActState, Phaser.GameObjects.Graphics>;
  for (const st of ACT_STATES) {
    const g = scene.add.graphics();
    g.name = ACT_PLAN[st].prop;
    for (const r of ACT_PLAN[st].rects())
      g.fillStyle(r.color, r.alpha).fillRect(r.x, r.y, r.w, r.h);
    g.setPosition(0, AXE_GRIP_Y);
    g.setVisible(false);
    armFront.fore.add(g);
    props[st] = g;
  }
  rig.setScale(unit);
  rig.add([legBack.thigh, legFront.thigh, armBack.upper, armFront.upper]);
  // Rig sits right after the body, before the label.
  container.addAt(rig, 1);
  // Back view: the two-handed chop happens in FRONT of the body, so the arms are hidden and the axe lives in a
  // layer BELOW the body (the torso covers it while it is in front of the chest; it shows above the head).
  const axeLayer = scene.add.container(0, 0);
  for (const st of SWING_STATES) {
    const t = tools[st];
    t.back.name = SWING_TOOLS[st].name;
    t.back.setVisible(false);
    axeLayer.add(t.back);
    const hang = SWING_TOOLS[st].hang;
    if (hang) {
      const backLine = scene.add.graphics();
      backLine.name = `${SWING_TOOLS[st].name}Line`;
      backLine.setVisible(false);
      axeLayer.add(backLine);
      t.backLine = backLine;
      for (const g of [t.handLine!, backLine])
        for (const r of hang.rects()) g.fillStyle(r.color, r.alpha).fillRect(r.x, r.y, r.w, r.h);
    }
  }
  axeLayer.setScale(unit);
  container.addAt(axeLayer, 0);

  let mode: MotionMode = opts.mode ?? 'on';
  const pose = makePose();
  let state: AnimState = 'idle';
  let startedAt = -1;
  let lastImpactCycle = -1;
  /** Catch pulse: requested (to start at the next update) and the time it started (-1 = none). */
  let pulseWanted = false;
  let pulseAt = -1;
  let lastTime = 0;
  let tint = -1;
  let left = false;
  let isBack = false;
  let running = false;
  let armsHidden = false;
  let armsOver = false;
  /** Body offset last applied (px) and the carried-over difference from the previous state, easing out (see POSE_BLEND_MS). */
  let lastX = 0;
  let lastY = 0;
  let lastRigY = 0;
  let carryX = 0;
  let carryY = 0;
  let carryRigY = 0;
  let blendAt = -1;
  let blendWanted = false;
  let drawn = false;
  /** Walk swing axis for the facing (see swingAxis) and the chop view; reused, never reallocated. */
  const axis: SwingAxis = { x: 1, y: 0 };
  /** The axis the current gait really swings along (axis with its depth part shaped by the gait; see gaitAxis). */
  const gAxis: SwingAxis = { x: 1, y: 0 };
  const view: ChopView = { reach: 1 };

  function drawAxe(color: number): void {
    if (tint === color) return;
    tint = color;
    for (const st of SWING_STATES) {
      const { hand: g, back: gb } = tools[st];
      g.clear();
      gb.clear();
      for (const r of SWING_TOOLS[st].rects(color)) {
        g.fillStyle(r.color, r.alpha).fillRect(r.x, r.y, r.w, r.h);
        gb.fillStyle(r.color, r.alpha).fillRect(r.x, r.y, r.w, r.h);
      }
      g.setPosition(0, AXE_GRIP_Y); // fist (forearm-local)
    }
  }
  drawAxe(DEFAULT_TOOL_TINT);

  type Arm = { upper: Phaser.GameObjects.Container; fore: Phaser.GameObjects.Container };
  /** Shoulder + elbow rotation (forward-positive angles in, Phaser out). `solved`: angles are already view-space. */
  function limb(
    a: Arm,
    upperFwd: number,
    foreFwd: number,
    lean: number,
    solved: boolean,
    gain = 1,
  ): void {
    if (solved) {
      a.upper.setRotation(-upperFwd + lean);
      a.fore.setRotation(-(foreFwd - upperFwd));
      a.upper.setScale(1, 1);
      a.fore.setScale(1, 1);
      return;
    }
    const u = projectSwing(upperFwd, gAxis);
    a.upper.setRotation(u + lean);
    a.fore.setRotation(projectSwing(foreFwd, gAxis) - u);
    const su = gainedLength(upperFwd, gAxis, gain);
    a.upper.setScale(1, su);
    a.fore.setScale(1, gainedLength(foreFwd, gAxis, gain) / su);
  }
  type Leg = { thigh: Phaser.GameObjects.Container; shin: Phaser.GameObjects.Container };
  function leg(l: Leg, thighFwd: number, knee: number, gain: number, kneeShare: number): void {
    const t = projectSwing(thighFwd, gAxis);
    const shin = thighFwd - knee * kneeShare;
    l.thigh.setRotation(t);
    l.shin.setRotation(projectSwing(shin, gAxis) - t);
    const st = gainedLength(thighFwd, gAxis, gain);
    l.thigh.setScale(1, st);
    l.shin.setScale(1, gainedLength(shin, gAxis, gain) / st);
  }

  const self: PlayerAnimator = {
    swingPeriodMs: CHOP_SWING_PERIOD_MS,
    setMode(next) {
      mode = next;
    },
    pulse() {
      pulseWanted = true;
    },
    setState(next, o) {
      if (o?.facing !== undefined) {
        left = facingIsLeft(o.facing, left);
        swingAxis(o.facing, axis);
        const back = facingIsBack(o.facing);
        if (back !== isBack) {
          isBack = back;
          view.reach = back ? BACK_VIEW_SWING_REACH : 1;
          playerView.setBackView?.(back); // redraws the body with the back of the head
        }
      } else if (o?.facingLeft !== undefined) {
        left = o.facingLeft;
        axis.x = 1;
        axis.y = 0;
      }
      if (o?.facing !== undefined || o?.facingLeft !== undefined) {
        const sx = facingScaleX(left) * unit;
        rig.setScale(sx, unit);
        axeLayer.setScale(sx, unit);
        body.setScale(sx, unit); // the animator owns facing: the view's flip only knows left/right
      }
      if (o?.running !== undefined) running = o.running;
      if (o?.toolItemId !== undefined) drawAxe(TOOL_TINTS[o.toolItemId] ?? DEFAULT_TOOL_TINT);
      if (next !== state) {
        state = next;
        startedAt = -1; // restart the cycle on the next update
        blendWanted = drawn; // nothing to blend from before the first frame
        lastImpactCycle = -1;
        pulseWanted = false;
        pulseAt = -1;
      }
    },
    update(timeMs) {
      lastTime = timeMs;
      if (startedAt < 0) startedAt = timeMs;
      const timeline = SWING_TIMELINES[state];
      if (pulseWanted && timeline) {
        pulseAt = Math.max(timeMs, startedAt + timeline.castMs); // never cuts the cast short
      }
      pulseWanted = false;
      computePose(
        state,
        timeMs - startedAt,
        pose,
        1,
        CHOP_SWING_PERIOD_MS,
        mode,
        running ? 'run' : 'walk',
        geom,
        view,
        pulseAt < 0 ? -1 : timeMs - pulseAt,
      );
      // Lean pivots about the hips (art px, rig-local): the body is rotated and shifted so the hem stays
      // on the legs, and the shoulders follow the same rotation. Rotation sign follows the flip.
      const side = left ? -1 : 1;
      const sin = Math.sin(pose.lean);
      const cos = Math.cos(pose.lean);
      const hip = -pivots.hipY; // height of the hips above the feet
      const tx = -hip * sin * side * unit;
      const ty = (hip * (1 - cos) + pose.bodyBobY) * unit;
      const tr = pose.bodyBobY * unit;
      if (blendWanted) {
        blendWanted = false;
        carryX = lastX - tx;
        carryY = lastY - ty;
        carryRigY = lastRigY - tr;
        blendAt = mode === 'off' ? -1 : timeMs;
      }
      let k = blendAt < 0 ? 0 : 1 - (timeMs - blendAt) / POSE_BLEND_MS;
      if (k <= 0) {
        k = 0;
        blendAt = -1;
      }
      body.setRotation(pose.lean * side);
      lastX = body.x = tx + carryX * k;
      lastY = body.y = ty + carryY * k;
      lastRigY = rig.y = tr + carryRigY * k;
      drawn = true;
      axeLayer.y = rig.y;
      // Shoulders (narrowed by the chop's torso twist) rotated about the hip.
      const sx = SHOULDER_X * (1 - TWIST_NARROW * pose.twist);
      const dy = SHOULDER_Y - pivots.hipY;
      // The body is shifted DOWN by hip*(1-cos) (hem stays on the legs), which is 2*hip*(1-cos) below a pure rotation about the
      // hips: the shoulders ride with it, or at a deep lean (kneeling) they float above the torso and the arm reads as a wing.
      const sink = 2 * hip * (1 - cos);
      armFront.upper.setPosition(sx * cos - dy * sin, pivots.hipY + sx * sin + dy * cos + sink);
      armBack.upper.setPosition(-sx * cos - dy * sin, pivots.hipY - sx * sin + dy * cos + sink);
      // Arms: chop angles are already solved in the view (hands on the handle); a walk swing is projected so
      // it runs along the facing (forward/back on screen, up/down toward the camera), never across the body.
      const chop = pose.armsSolved;
      const gait = running ? 'run' : 'walk';
      gaitAxis(gait, axis, gAxis);
      const gain = armDepthGain(gait, axis);
      limb(armFront, pose.armUpperFront, pose.armAngle, pose.lean, chop, gain);
      limb(armBack, pose.armUpperBack, pose.armAngleBack, pose.lean, chop, gain);
      // Legs always project (idle/chop-without-dip are zero, and the e/w axis is the plain swing).
      const legGain = legDepthGain(gait, axis);
      const kneeShare = kneeDepthShare(gait, axis);
      leg(legFront, pose.thighFront, pose.kneeFront, legGain, kneeShare);
      leg(legBack, pose.thighBack, pose.kneeBack, legGain, kneeShare);
      const active = pose.axeVisible ? (state as SwingState) : null;
      const tool = tools[active ?? 'chop'];
      tool.hand.setRotation(pose.axeAngle + pose.armAngle);
      const hide = pose.axeVisible && isBack;
      if (chop !== armsOver) {
        armsOver = chop;
        // A two-handed grip: the rear arm crosses the chest, so it is drawn OVER the lead arm and its hand shows.
        rig.moveTo(chop ? armBack.upper : armFront.upper, rig.length - 1);
      }
      if (hide !== armsHidden) {
        armsHidden = hide;
        armFront.upper.setVisible(!hide);
        armBack.upper.setVisible(!hide);
      }
      for (const st of ACT_STATES) {
        props[st].setVisible(st === state);
        if (st === state) props[st].setRotation(pose.axeAngle + pose.armAngle);
      }
      for (const st of SWING_STATES) {
        tools[st].back.setVisible(hide && st === active);
        tools[st].hand.setVisible(!isBack && st === active);
        tools[st].backLine?.setVisible(hide && st === active);
        tools[st].handLine?.setVisible(!isBack && st === active);
      }
      // A hanging line stays upright: it starts at the tool tip and cancels the rotation of the chain it sits in.
      const hang = active ? SWING_TOOLS[active].hang : undefined;
      if (hang && active) {
        const h = pose.axeAngle + pose.armAngle;
        const line = tools[active].handLine!;
        line.setPosition(-hang.tipY * Math.sin(h), AXE_GRIP_Y + hang.tipY * Math.cos(h));
        line.setRotation(pose.armAngle - pose.lean);
      }
      if (hide) {
        // The grip point in the rig frame (the arms are not drawn, so the axe follows the grip target).
        const vx = pose.gripX;
        const vy = SHOULDER_Y + pose.gripY - pivots.hipY;
        tool.back.setPosition(vx * cos - vy * sin, pivots.hipY + vx * sin + vy * cos);
        tool.back.setRotation(pose.axeAngle + pose.lean);
        if (hang) {
          const a = pose.axeAngle + pose.lean;
          const bx = vx * cos - vy * sin;
          const by = pivots.hipY + vx * sin + vy * cos;
          tools[active!].backLine!.setPosition(
            bx - hang.tipY * Math.sin(a),
            by + hang.tipY * Math.cos(a),
          );
        }
      }
      if (state in SWING_TOOLS && SWING_TOOLS[state as SwingState].impact) {
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
      axeLayer.destroy();
      void lastTime;
    },
  };
  return self;
}
