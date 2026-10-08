import {
  FLAME_ALPHA,
  FLAME_DYING,
  FLAME_DYING_BLEND_MS,
  FLAME_GLOW_ALPHA,
  FLAME_GLOW_HZ,
  FLAME_GLOW_SCALE,
  FLAME_MOTION,
  FLAME_OCTAVE,
  FLAME_RATES_HZ,
  FLAME_SCALE_X,
  FLAME_SCALE_Y,
  FLAME_SWAY_HZ,
  FLAME_SWAY_PX,
} from './data';
import { idUnit } from './logic';
import type { MotionMode } from './types';

/** Anything a flame layer can be: a Phaser Image/Sprite/Graphics/Container satisfies it. */
export interface FlameNode {
  setScale(x: number, y?: number): unknown;
  setPosition(x: number, y?: number): unknown;
  setAlpha(a: number): unknown;
}

/**
 * One drawn layer of a fire: the node plus the pose it has when the flame is perfectly still. The flicker scales the
 * node about its own origin, so graphics should put a flame layer's origin at the BOTTOM centre (the flame grows up).
 * Layers are ordered outermost (large, dim, slow) to innermost (small, bright, fast).
 */
export interface FlameLayer {
  node: FlameNode;
  baseX: number;
  baseY: number;
  baseScaleX: number;
  baseScaleY: number;
  baseAlpha: number;
}

/** What the flicker drives for one fire: the flame layers and an optional glow behind them. */
export interface FlameTarget {
  layers: readonly FlameLayer[];
  glow?: FlameLayer;
  /** Optional cull flags (a Phaser container satisfies it): an inactive target is dropped, an invisible one skipped. */
  host?: { active: boolean; visible: boolean };
}

/** The result of sampling one layer (reused scratch, never retained). */
export interface FlameSample {
  scaleX: number;
  scaleY: number;
  dx: number;
  alpha: number;
}

const TWO_PI = Math.PI * 2;

/** Two-octave smooth noise in about [-1, 1]; deterministic in (cycles, phase). */
function noise(cycles: number, phase: number): number {
  return (
    0.65 * Math.sin(TWO_PI * (cycles + phase)) +
    0.35 * Math.sin(TWO_PI * (cycles * FLAME_OCTAVE + phase * 3))
  );
}

/**
 * Flicker of layer `i` of `n` at `timeMs`, for a fire whose id gave `phase` (0..1, see idUnit). `dying` 0..1 blends in
 * the dying look. `amp`/`rate`/`sway` are the motion-mode multipliers. Deterministic and allocation-free (writes `out`).
 * The result is the multiplier on the layer's base scale/alpha and a sway offset in px.
 */
export function flameSample(
  i: number,
  n: number,
  timeMs: number,
  phase: number,
  dying: number,
  m: { amp: number; rate: number; sway: number },
  out: FlameSample,
): FlameSample {
  const rate = m.rate * (1 + (FLAME_DYING.rate - 1) * dying);
  const amp = m.amp * (1 + (FLAME_DYING.amp - 1) * dying);
  const rank = n > 1 ? (i + 1) / n : 1; // inner layers flicker more
  const hz = FLAME_RATES_HZ[Math.min(i, FLAME_RATES_HZ.length - 1)] ?? 3;
  const layerPhase = (phase + idUnit(`flame${i}`)) % 1;
  const t = (timeMs / 1000) * rate;
  const a = noise(t * hz, layerPhase);
  const scale = 1 + (FLAME_DYING.scale - 1) * dying;
  out.scaleY = scale * (1 + FLAME_SCALE_Y * amp * rank * a);
  out.scaleX = scale * (1 - FLAME_SCALE_X * amp * rank * a);
  out.alpha = 1 + FLAME_ALPHA * amp * rank * noise(t * hz * 0.8, layerPhase + 0.31);
  out.dx = FLAME_SWAY_PX * m.sway * rank * Math.sin(TWO_PI * (t * FLAME_SWAY_HZ + phase));
  return out;
}

/** Glow pulse for a fire: alpha multiplier and scale multiplier (writes `out.alpha`, `out.scaleX`, `out.scaleY`). */
export function glowSample(
  timeMs: number,
  phase: number,
  dying: number,
  m: { amp: number; rate: number; sway: number },
  out: FlameSample,
): FlameSample {
  const rate = m.rate * (1 + (FLAME_DYING.rate - 1) * dying);
  const s = Math.sin(TWO_PI * ((timeMs / 1000) * rate * FLAME_GLOW_HZ + phase));
  const k = m.amp * (1 + (FLAME_DYING.amp - 1) * dying);
  const level = 1 + (FLAME_DYING.glow - 1) * dying;
  out.alpha = level * (1 + FLAME_GLOW_ALPHA * k * s);
  out.scaleX = out.scaleY = 1 + FLAME_GLOW_SCALE * k * s;
  out.dx = 0;
  return out;
}

interface Entry {
  id: string;
  target: FlameTarget;
  phase: number;
  /** 0 = burning, 1 = dying; eased toward `dyingGoal`. */
  dying: number;
  dyingGoal: number;
}

export interface FlameFlicker {
  /** Start flickering a fire; `id` (the fire id) fixes its phase so fires never sync. Re-adding an id replaces it. */
  add(id: string, target: FlameTarget): void;
  /** Switch a fire between 'burning' and 'dying' (lower amplitude, smaller, dimmer); the change eases in. */
  setDying(id: string, dying: boolean): void;
  /** Stop and restore the base pose. */
  remove(id: string): void;
  /** Once per frame with the scene time in ms. */
  update(timeMs: number): void;
  count(): number;
}

function applyBase(l: FlameLayer): void {
  l.node.setPosition(l.baseX, l.baseY);
  l.node.setScale(l.baseScaleX, l.baseScaleY);
  l.node.setAlpha(l.baseAlpha);
}

/**
 * One shared ticker for fire flames (like createTreeSway). Each frame it sets every layer's scale, sway offset and alpha
 * from flameSample, and the glow from glowSample. `mode` is read each frame (off = still, base pose written once).
 */
export function createFlameFlicker(mode: () => MotionMode): FlameFlicker {
  const entries: Entry[] = [];
  const s: FlameSample = { scaleX: 1, scaleY: 1, dx: 0, alpha: 1 };
  let lastTime = -1;
  const drop = (i: number): void => {
    const last = entries.pop();
    if (last && last !== entries[i] && i < entries.length) entries[i] = last;
  };
  return {
    add(id, target) {
      this.remove(id);
      entries.push({ id, target, phase: idUnit(id), dying: 0, dyingGoal: 0 });
    },
    setDying(id, dying) {
      const e = entries.find((x) => x.id === id);
      if (e) e.dyingGoal = dying ? 1 : 0;
    },
    remove(id) {
      const i = entries.findIndex((e) => e.id === id);
      const e = entries[i];
      if (!e) return;
      for (const l of e.target.layers) applyBase(l);
      if (e.target.glow) applyBase(e.target.glow);
      drop(i);
    },
    update(timeMs) {
      const dt = lastTime < 0 ? 0 : Math.max(0, timeMs - lastTime);
      lastTime = timeMs;
      const m = FLAME_MOTION[mode()];
      for (let k = entries.length - 1; k >= 0; k--) {
        const e = entries[k];
        if (!e) continue;
        const host = e.target.host;
        if (host && !host.active) {
          drop(k);
          continue;
        }
        if (host && !host.visible) continue;
        const step = dt / FLAME_DYING_BLEND_MS;
        e.dying += Math.max(-step, Math.min(step, e.dyingGoal - e.dying));
        const layers = e.target.layers;
        for (let i = 0; i < layers.length; i++) {
          const l = layers[i]!;
          flameSample(i, layers.length, timeMs, e.phase, e.dying, m, s);
          l.node.setPosition(l.baseX + s.dx, l.baseY);
          l.node.setScale(l.baseScaleX * s.scaleX, l.baseScaleY * s.scaleY);
          l.node.setAlpha(Math.min(1, Math.max(0, l.baseAlpha * s.alpha)));
        }
        const g = e.target.glow;
        if (g) {
          glowSample(timeMs, e.phase, e.dying, m, s);
          g.node.setScale(g.baseScaleX * s.scaleX, g.baseScaleY * s.scaleY);
          g.node.setAlpha(Math.min(1, Math.max(0, g.baseAlpha * s.alpha)));
        }
      }
    },
    count: () => entries.length,
  };
}
