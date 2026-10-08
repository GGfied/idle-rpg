import Phaser from 'phaser';
import { LAYERS } from '@render/index';
import { EVENT_VFX, LIMITS_DESKTOP, SKILL_TAG, XP_STACK_LINE_PX, XP_STACK_WINDOW_MS } from './data';
import {
  ballistic,
  blockedLabel,
  createEmitBudget,
  type EmitBudget,
  createKeyedRegistry,
  createPool,
  createThrottle,
  diamondPoints,
  effectDepth,
  lighten,
  planEvent,
  resolveEffect,
  resolveXpColor,
  stackOffset,
  stackSlot,
} from './logic';
import type {
  BlockedTextEffect,
  BurstEffect,
  CrossEffect,
  FireEffect,
  MarkerKind,
  RingEffect,
  VfxContext,
  VfxEvent,
  VfxLimits,
  VfxMode,
  VfxOptions,
  XpDropEffect,
} from './types';

export interface Vfx {
  handleEvent(event: VfxEvent, ctx: VfxContext): void;
  clickMarker(x: number, y: number, kind: MarkerKind): void;
  /** 'off' clears anything playing and ignores events; 'reduced' keeps info effects, shrunk. */
  setMode(mode: VfxMode): void;
  /** false suppresses XP drops only (the notifications setting). */
  setXpDrops(enabled: boolean): void;
  destroy(): void;
}

type Shape = Phaser.GameObjects.Arc;

/** One running fire's smoke column. */
interface FireFx {
  def: FireEffect;
  x: number;
  y: number;
  emberDepth: number;
  smokeDepth: number;
  budget: EmitBudget;
  timer: Phaser.Time.TimerEvent;
}

/** Pooled, event-driven one-shot effects. One runner; effects are data in `EFFECTS`. */
export function createVfx(
  scene: Phaser.Scene,
  limits: VfxLimits = LIMITS_DESKTOP,
  skillColor?: (skill: string) => string,
  mode: VfxMode = 'on',
): Vfx {
  const opts: VfxOptions = { mode, xpDrops: true };
  const kill = (o: Phaser.GameObjects.GameObject): void => {
    scene.tweens.killTweensOf(o);
    o.setActive(false);
    (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(false);
  };
  const dispose = (o: Phaser.GameObjects.GameObject): void => {
    scene.tweens.killTweensOf(o);
    o.destroy();
  };

  // Particles are small Arcs (4 segments reads as a diamond chip; many segments as a puff).
  const particles = createPool<Shape>({
    cap: limits.particles,
    create: () => scene.add.circle(0, 0, 2, 0xffffff).setDepth(LAYERS.VFX).setVisible(false),
    reset: kill,
    dispose,
  });
  const rings = createPool<Shape>({
    cap: limits.rings,
    create: () => scene.add.circle(0, 0, 4).setDepth(LAYERS.VFX).setVisible(false),
    reset: kill,
    dispose,
  });
  const texts = createPool<Phaser.GameObjects.Text & { spawnedAt: number }>({
    cap: limits.texts,
    create: () => {
      const t = scene.add
        .text(0, 0, '', {
          fontFamily: 'sans-serif',
          fontStyle: 'bold',
          fontSize: '14px',
          stroke: '#000000',
          strokeThickness: 3,
          resolution: 2,
        })
        .setOrigin(0.5, 1)
        .setDepth(LAYERS.VFX)
        .setVisible(false);
      return Object.assign(t, { spawnedAt: -Infinity });
    },
    reset: kill,
    dispose,
  });
  const markers = createPool<Phaser.GameObjects.Graphics>({
    cap: limits.markers,
    create: () => scene.add.graphics().setDepth(LAYERS.VFX).setVisible(false),
    reset: kill,
    dispose,
  });

  const fade = <T extends Phaser.GameObjects.GameObject>(
    pool: { release(o: T): void },
    o: T,
    props: object,
  ): void => {
    scene.tweens.add({
      targets: o,
      ...props,
      onComplete: () => pool.release(o),
    } as Phaser.Types.Tweens.TweenBuilderConfig);
  };

  const throttle = createThrottle();
  const timers = new Set<Phaser.Time.TimerEvent>();
  // One running smoke column per fireId; stopping removes its timer (particles in flight finish and pool).
  const fires = createKeyedRegistry<FireFx>(limits.fires, (f) => f.timer.remove(false));

  function burst(def: BurstEffect, x: number, y: number, depth: number, tint?: number): void {
    const ease = ballistic(def.rise, def.fall);
    for (let i = 0; i < def.count; i++) {
      const p = particles.acquire();
      const size = Phaser.Math.FloatBetween(def.size[0], def.size[1]);
      p.setPosition(x + Phaser.Math.FloatBetween(-def.jitter, def.jitter), y)
        .setRadius(size / 2)
        .setFillStyle(
          tint === undefined
            ? (Phaser.Utils.Array.GetRandom(def.colors as number[]) as number)
            : lighten(tint, i % 2 ? 0.45 : 0),
          1,
        )
        .setDepth(depth)
        .setBlendMode(def.additive ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL)
        .setAlpha(def.alpha ?? 1)
        .setScale(1)
        .setActive(true)
        .setVisible(true);
      // 4 segments = diamond chip; round puffs keep Phaser's default smooth circle.
      p.setIterations(def.round ? 0.1 : 1);
      const dx = Phaser.Math.FloatBetween(-def.spread, def.spread) + (def.drift ?? 0);
      fade(particles, p, {
        x: p.x + dx,
        y: { value: p.y + def.fall, ease },
        alpha: 0,
        scale: def.grow ?? (def.round ? 1.8 : 0.6),
        duration: def.lifeMs * Phaser.Math.FloatBetween(0.8, 1.1),
        ease: 'Linear',
      });
    }
  }

  /** A burst that plays `repeat.times` times, `everyMs` apart (the first at once). Timers die with the vfx. */
  function repeatedBurst(
    def: BurstEffect,
    x: number,
    y: number,
    depth: number,
    tint?: number,
  ): void {
    if (!def.repeat || def.repeat.times <= 1) {
      burst(def, x, y, depth, tint);
      return;
    }
    let left = def.repeat.times;
    const timer = scene.time.addEvent({
      delay: def.repeat.everyMs,
      loop: true,
      callback: () => {
        burst(def, x, y, depth, tint);
        if (--left <= 0) {
          timer.remove(false);
          timers.delete(timer);
        }
      },
    });
    timers.add(timer);
    burst(def, x, y, depth, tint);
    left--;
  }

  /** Smoke puff + occasional ember for one fire, each under the fire's particle budget. */
  function emitFire(fire: FireFx): void {
    const { def, x, y, budget } = fire;
    const now = scene.time.now;
    if (budget.tryEmit(now, def.smoke.lifeMs)) {
      const sm = def.smoke;
      const p = particles.acquire();
      const size = Phaser.Math.FloatBetween(sm.size[0], sm.size[1]);
      p.setPosition(x + Phaser.Math.FloatBetween(-3, 3), y - def.smokeLift)
        .setRadius(size / 2)
        .setFillStyle(Phaser.Utils.Array.GetRandom(sm.colors as number[]) as number, 1)
        .setDepth(fire.smokeDepth)
        .setBlendMode(Phaser.BlendModes.NORMAL)
        .setAlpha(sm.alpha)
        .setScale(0.6)
        .setActive(true)
        .setVisible(true);
      p.setIterations(0.1);
      fade(particles, p, {
        x: p.x + sm.drift + Phaser.Math.FloatBetween(-sm.sway, sm.sway),
        y: p.y - sm.rise,
        alpha: 0,
        scale: sm.grow,
        duration: sm.lifeMs * Phaser.Math.FloatBetween(0.85, 1.15),
        ease: 'Sine.easeOut',
      });
    }
    if (Math.random() < def.emberChance && budget.tryEmit(now, def.ember.lifeMs)) {
      const em = def.ember;
      const p = particles.acquire();
      p.setPosition(x + Phaser.Math.FloatBetween(-5, 5), y - 10)
        .setRadius(Phaser.Math.FloatBetween(em.size[0], em.size[1]) / 2)
        .setFillStyle(Phaser.Utils.Array.GetRandom(em.colors as number[]) as number, 1)
        .setDepth(fire.emberDepth)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(1)
        .setScale(1)
        .setActive(true)
        .setVisible(true);
      p.setIterations(1);
      fade(particles, p, {
        x: p.x + Phaser.Math.FloatBetween(-em.sway, em.sway),
        y: p.y - em.rise,
        alpha: 0,
        scale: 0.4,
        duration: em.lifeMs * Phaser.Math.FloatBetween(0.8, 1.1),
        ease: 'Sine.easeOut',
      });
    }
  }

  function startFire(def: FireEffect, key: string, x: number, feetY: number, depth: number): void {
    fires.start(key, () => {
      const fire: FireFx = {
        def,
        x,
        y: feetY,
        emberDepth: depth,
        smokeDepth: effectDepth(def.smokeLayer, x, feetY),
        budget: createEmitBudget(limits.fireParticles),
        timer: undefined as unknown as Phaser.Time.TimerEvent,
      };
      fire.timer = scene.time.addEvent({
        delay: def.tickMs,
        loop: true,
        callback: () => emitFire(fire),
      });
      return fire;
    });
  }

  function ring(def: RingEffect, x: number, y: number, depth: number): void {
    const r = rings.acquire();
    r.setPosition(x, y)
      .setRadius(def.radius[0])
      .setFillStyle()
      .setStrokeStyle(def.width, def.color, 1)
      .setScale(1, def.squashY ?? 1)
      .setDepth(depth)
      .setAlpha(1)
      .setActive(true)
      .setVisible(true);
    fade(rings, r, {
      radius: def.radius[1],
      alpha: 0,
      duration: def.lifeMs,
      ease: 'Quad.easeOut',
    });
  }

  function xpDrop(def: XpDropEffect, x: number, y: number, depth: number, event: VfxEvent): void {
    const amount = typeof event.amount === 'number' ? event.amount : 0;
    const skill = typeof event.skill === 'string' ? event.skill : '';
    const tag = Object.hasOwn(SKILL_TAG, skill)
      ? SKILL_TAG[skill]
      : skill.slice(0, 3).toUpperCase();
    const now = scene.time.now;
    const slot = stackSlot(
      texts.active().map((t) => t.spawnedAt),
      now,
      XP_STACK_WINDOW_MS,
    );
    const t = texts.acquire();
    t.spawnedAt = now;
    const startY = y + stackOffset(slot, XP_STACK_LINE_PX);
    t.setText(tag ? `+${amount} ${tag}` : `+${amount}`)
      .setFontSize(def.fontPx)
      .setColor(resolveXpColor(skill, skillColor, def.defaultColor))
      .setPosition(x, startY)
      .setDepth(depth)
      .setAlpha(1)
      .setActive(true)
      .setVisible(true);
    fade(texts, t, {
      y: startY - def.riseY,
      alpha: { value: 0, delay: def.lifeMs * 0.5 },
      duration: def.lifeMs,
      ease: 'Sine.easeOut',
    });
  }

  function cross(
    x: number,
    y: number,
    depth: number,
    color: number,
    half: number,
    from: number,
    to: number,
    ms: number,
  ): void {
    const g = markers.acquire();
    g.clear()
      .lineStyle(2, color, 1)
      .lineBetween(-half, -half, half, half)
      .lineBetween(-half, half, half, -half)
      .setPosition(x, y)
      .setDepth(depth)
      .setScale(from)
      .setAlpha(1)
      .setActive(true)
      .setVisible(true);
    fade(markers, g, { scale: to, alpha: 0, duration: ms, ease: 'Quad.easeOut' });
  }

  function clickMarker(x: number, y: number, kind: MarkerKind): void {
    const def = resolveEffect('clickMarker', opts.mode);
    if (def?.kind !== 'marker') return;
    const g = markers.acquire();
    g.clear()
      .lineStyle(2, def.colors[kind], 1)
      .strokePoints(diamondPoints(def.halfW, def.halfH), true, true)
      .setPosition(x, y - (def.lift ?? 0))
      .setDepth(effectDepth(def.layer, x, y))
      .setScale(1.3)
      .setAlpha(1)
      .setActive(true)
      .setVisible(true);
    fade(markers, g, { scale: 0.7, alpha: 0, duration: def.lifeMs, ease: 'Quad.easeOut' });
  }

  function crossEffect(def: CrossEffect, x: number, y: number, depth: number): void {
    cross(x, y, depth, def.color, def.half, def.fromScale, def.toScale, def.lifeMs);
  }

  /** Red label above the player; it jitters left-right (we can't move the player view from here). */
  function blockedText(
    def: BlockedTextEffect,
    x: number,
    y: number,
    depth: number,
    event: VfxEvent,
  ): void {
    const label = blockedLabel(event);
    if (!label) return;
    const t = texts.acquire();
    t.spawnedAt = -Infinity; // does not stack with XP drops
    const startY = y;
    t.setText(label)
      .setFontSize(def.fontPx)
      .setColor(def.color)
      .setPosition(x, startY)
      .setDepth(depth)
      .setAlpha(1)
      .setActive(true)
      .setVisible(true);
    scene.tweens.add({
      targets: t,
      x: x + def.shakePx,
      duration: def.shakeMs,
      yoyo: true,
      repeat: def.shakes,
    });
    fade(texts, t, {
      y: startY - def.riseY,
      alpha: { value: 0, delay: def.lifeMs * 0.5 },
      duration: def.lifeMs,
      ease: 'Sine.easeOut',
    });
  }

  const clearAll = (): void => {
    fires.stopAll();
    for (const t of timers) t.remove(false);
    timers.clear();
    particles.releaseAll();
    rings.releaseAll();
    texts.releaseAll();
    markers.releaseAll();
  };

  return {
    handleEvent(event, ctx) {
      for (const { effect, x, y, feetY, depth, tint, persist, throttle: th } of planEvent(
        event,
        ctx,
        EVENT_VFX,
        opts,
      )) {
        const def = resolveEffect(effect, opts.mode);
        if (!def) continue;
        if (th && !throttle.allow(th.key, scene.time.now, th.ms)) continue;
        if (def.kind === 'fire') {
          if (persist?.action === 'start') startFire(def, persist.key, x, feetY, depth);
          else if (persist?.action === 'stop') fires.stop(persist.key);
        } else if (def.kind === 'burst') repeatedBurst(def, x, y, depth, tint);
        else if (def.kind === 'ring') ring(def, x, y, depth);
        else if (def.kind === 'xpDrop') xpDrop(def, x, y, depth, event);
        else if (def.kind === 'cross') crossEffect(def, x, y, depth);
        else if (def.kind === 'blockedText') blockedText(def, x, y, depth, event);
      }
    },
    clickMarker,
    setMode(next) {
      opts.mode = next;
      if (next === 'off') clearAll();
      else if (next === 'reduced') fires.stopAll();
    },
    setXpDrops(enabled) {
      opts.xpDrops = enabled;
      if (!enabled) {
        for (const t of [...texts.active()]) if (t.spawnedAt > -Infinity) texts.release(t);
      }
    },
    destroy() {
      clearAll();
      particles.destroy();
      rings.destroy();
      texts.destroy();
      markers.destroy();
    },
  };
}
