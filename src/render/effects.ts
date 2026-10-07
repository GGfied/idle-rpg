import type Phaser from 'phaser';
import type { MotionMode } from './animation/types';
import type { Projection } from './projection';
import type { TreeView } from './views';

/** Inclusive tile rectangle. The object returned by `visibleTiles()` is reused: read it, do not keep it. */
export interface TileRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** The loaded entity window, structurally (the app passes its own richer object). */
export interface LoadedWorld {
  trees: readonly { nodeId: string }[];
}

/** What an effect may use. Built once per scene by the app; `visibleTiles` fills one shared rect per call. */
export interface EffectContext {
  scene: Phaser.Scene;
  camera: Phaser.Cameras.Scene2D.Camera;
  projection: Projection;
  /** The Animations preference, read live (call it each frame). */
  motion(): MotionMode;
  terrainAt(x: number, y: number): string | undefined;
  /** Tile bounds of the camera view (cull by this). */
  visibleTiles(): TileRect;
  /** Live tree view for a node id, or undefined while its chunk is not loaded. */
  tree(nodeId: string): TreeView | undefined;
}

export interface Effect {
  id: string;
  onSceneStart?(ctx: EffectContext): void;
  onFrame?(time: number, ctx: EffectContext): void;
  /** The loaded chunk window changed (also fires once at start, after onSceneStart). */
  onChunksChanged?(loaded: LoadedWorld, ctx: EffectContext): void;
  onDestroy?(): void;
}

const effects: Effect[] = [];

/** Register once at module load; a second call with the same id replaces the first. */
export function registerEffect(effect: Effect): void {
  const i = effects.findIndex((e) => e.id === effect.id);
  if (i >= 0) effects[i] = effect;
  else effects.push(effect);
}

export function registeredEffects(): readonly Effect[] {
  return effects;
}

export interface EffectRunner {
  frame(time: number): void;
  chunksChanged(loaded: LoadedWorld): void;
  destroy(): void;
}

/** One runner per scene; no allocation per frame (loops over the registry array). */
export function startEffects(ctx: EffectContext): EffectRunner {
  for (const e of effects) e.onSceneStart?.(ctx);
  return {
    frame(time) {
      for (const e of effects) e.onFrame?.(time, ctx);
    },
    chunksChanged(loaded) {
      for (const e of effects) e.onChunksChanged?.(loaded, ctx);
    },
    destroy() {
      for (const e of effects) e.onDestroy?.();
    },
  };
}

/** Fills `out` with the tile bounds of a world-pixel view (iso: min/max over the four corners). */
export function tilesInView(
  p: Projection,
  v: { x: number; y: number; right: number; bottom: number },
  out: TileRect,
): TileRect {
  const a = p.worldToTile(v.x, v.y);
  const b = p.worldToTile(v.right, v.y);
  const c = p.worldToTile(v.x, v.bottom);
  const d = p.worldToTile(v.right, v.bottom);
  out.x0 = Math.floor(Math.min(a.tx, b.tx, c.tx, d.tx));
  out.x1 = Math.ceil(Math.max(a.tx, b.tx, c.tx, d.tx));
  out.y0 = Math.floor(Math.min(a.ty, b.ty, c.ty, d.ty));
  out.y1 = Math.ceil(Math.max(a.ty, b.ty, c.ty, d.ty));
  return out;
}
