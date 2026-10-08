import { LAYERS, isoProjection } from '@render/index';
import { BLOCKED_TEXT, EFFECTS, EVENT_VFX, ITEM_TINT, REDUCED_LIFE_SCALE } from './data';
import type {
  BlockedLabel,
  EffectDef,
  VfxContext,
  VfxCue,
  VfxEvent,
  EffectLayer,
  VfxMode,
  VfxOptions,
} from './types';

export const DEFAULT_OPTIONS: VfxOptions = { mode: 'on', xpDrops: true };

/**
 * The effect to play in a mode, or undefined when it is filtered out.
 * 'off' drops everything; 'reduced' drops decorative bursts and shortens the rest.
 */
export function resolveEffect(
  id: string,
  mode: VfxMode,
  effects: Readonly<Record<string, EffectDef>> = EFFECTS,
): EffectDef | undefined {
  const def = Object.hasOwn(effects, id) ? effects[id] : undefined;
  if (!def || mode === 'off') return undefined;
  if (mode === 'on') return def;
  if (def.kind === 'burst' && def.decorative) return undefined;
  const reduced = { ...def, lifeMs: def.lifeMs * REDUCED_LIFE_SCALE };
  if (reduced.kind === 'burst') reduced.jitter = 0;
  if (reduced.kind === 'blockedText') reduced.shakePx = 0;
  return reduced;
}

export interface Placement {
  effect: string;
  x: number;
  y: number;
  /** Draw depth from the effect's layer and the tile under its feet point. */
  depth: number;
  /** Colour override from the cue's `tintField`, when the event's value has one. */
  tint?: number;
  /** Throttle key and window, when the cue is throttled. */
  throttle?: { key: string; ms: number };
}

/** Event -> effects with resolved world positions. Unknown events and unresolved anchors yield nothing/player. */
export function planEvent(
  event: VfxEvent,
  ctx: VfxContext,
  map: Readonly<Record<string, readonly VfxCue[]>> = EVENT_VFX,
  opts: VfxOptions = DEFAULT_OPTIONS,
  effects: Readonly<Record<string, EffectDef>> = EFFECTS,
): Placement[] {
  if (opts.mode === 'off') return [];
  const cues = Object.hasOwn(map, event.type) ? map[event.type] : undefined;
  if (!cues) return [];
  const nodeId =
    typeof event.nodeId === 'string'
      ? event.nodeId
      : typeof event.spotId === 'string'
        ? event.spotId
        : undefined;
  const out: Placement[] = [];
  for (const cue of cues) {
    if (!matches(cue, event)) continue;
    const def = resolveEffect(cue.effect, opts.mode, effects);
    if (!def || (def.kind === 'xpDrop' && !opts.xpDrops)) continue;
    const p = anchorPoint(cue, event, nodeId, ctx);
    if (!p) continue;
    const placement: Placement = {
      effect: cue.effect,
      x: p.x,
      y: p.y - (def.lift ?? 0),
      depth: effectDepth(def.layer, p.x, p.y),
    };
    const tint = cue.tintField ? tintFor(event[cue.tintField]) : undefined;
    if (tint !== undefined) placement.tint = tint;
    if (cue.throttleMs) {
      const key = `${event.type}:${cue.effect}:${JSON.stringify(cue.when ?? {})}`;
      placement.throttle = { key, ms: cue.throttleMs };
    }
    out.push(placement);
  }
  return out;
}

/**
 * Depth for an effect at a feet-point world pixel. 'overhead' sits above the whole world; the others
 * share the entity depth scale so they sort with it ('ground' just behind an entity on the same tile,
 * 'world' just in front of it).
 */
export function effectDepth(layer: EffectLayer, x: number, y: number): number {
  if (layer === 'overhead') return LAYERS.VFX;
  const t = isoProjection.worldToTile(x, y);
  return isoProjection.depthFor(t.tx, t.ty) + (layer === 'ground' ? -0.5 : 0.5);
}

/** Corner points (relative to the centre) of the iso diamond marker. */
export function diamondPoints(halfW: number, halfH: number): { x: number; y: number }[] {
  return [
    { x: 0, y: -halfH },
    { x: halfW, y: 0 },
    { x: 0, y: halfH },
    { x: -halfW, y: 0 },
  ];
}

function matches(cue: VfxCue, event: VfxEvent): boolean {
  if (cue.unless && Object.entries(cue.unless).some(([k, v]) => event[k] === v)) return false;
  if (!cue.when) return true;
  return Object.entries(cue.when).every(([k, v]) => event[k] === v);
}

/** World point for a cue; 'node' falls back to the player, 'from'/'to' return undefined when unresolved. */
function anchorPoint(
  cue: VfxCue,
  event: VfxEvent,
  nodeId: string | undefined,
  ctx: VfxContext,
): { x: number; y: number } | undefined {
  if (cue.at === 'player') return ctx.playerWorld;
  if (cue.at === 'node') {
    const node = nodeId ? ctx.nodeWorld?.(nodeId) : undefined;
    return node && cue.towardPlayer
      ? towards(node, ctx.playerWorld, cue.towardPlayer)
      : (node ?? ctx.playerWorld);
  }
  const index = event[cue.at];
  return nodeId && typeof index === 'number' ? ctx.tileWorld?.(nodeId, index) : undefined;
}

/** `from` moved up to `px` toward `to` (never past it). */
export function towards(
  from: { x: number; y: number },
  to: { x: number; y: number },
  px: number,
): { x: number; y: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const d = Math.hypot(dx, dy);
  if (d === 0) return from;
  const k = Math.min(px, d) / d;
  return { x: from.x + dx * k, y: from.y + dy * k };
}

/** Tint colour for an event field value (an item id), or undefined. */
export function tintFor(value: unknown, table: Readonly<Record<string, number>> = ITEM_TINT) {
  return typeof value === 'string' && Object.hasOwn(table, value) ? table[value] : undefined;
}

/** `color` blended toward white by `amount` (0..1). */
export function lighten(color: number, amount: number): number {
  const mix = (c: number): number => Math.round(c + (255 - c) * amount);
  return (mix((color >> 16) & 255) << 16) | (mix((color >> 8) & 255) << 8) | mix(color & 255);
}

/** Label for a gatherStopped-style event, or undefined when its reason has none. */
export function blockedLabel(
  event: VfxEvent,
  labels: Readonly<Record<string, BlockedLabel>> = BLOCKED_TEXT,
): string | undefined {
  const reason = typeof event.reason === 'string' ? event.reason : '';
  const label = Object.hasOwn(labels, reason) ? labels[reason] : undefined;
  if (!label) return undefined;
  const raw = label.withField ? event[label.withField.field] : undefined;
  if (typeof raw === 'string' || (typeof raw === 'number' && Number.isFinite(raw)))
    return label.withField?.text.replace('{value}', String(raw));
  return label.text;
}

/** Allows a key at most once per window. Keys are few and fixed, so the map does not grow. */
export function createThrottle(): { allow(key: string, now: number, ms: number): boolean } {
  const last = new Map<string, number>();
  return {
    allow(key, now, ms) {
      const t = last.get(key);
      if (t !== undefined && now - t < ms) return false;
      last.set(key, now);
      return true;
    },
  };
}

/** How many recent drops (spawned within windowMs of now) sit above a new one. */
export function stackSlot(spawnTimes: readonly number[], now: number, windowMs: number): number {
  let n = 0;
  for (const t of spawnTimes) if (now - t < windowMs) n++;
  return n;
}

/** Upward pixel offset for a new drop given the stack slot. */
export function stackOffset(slot: number, linePx: number): number {
  return -slot * linePx;
}

/**
 * Easing for a ballistic path: goes up by `rise`, then ends `fall` below the start
 * (fall may be negative = ends above). Returns progress in [0,1] mapped so that y = y0 + fall * e(t).
 */
export function ballistic(rise: number, fall: number): (t: number) => number {
  const k = rise / (fall === 0 ? 1e-3 : fall);
  return (t) => (1 + k) * t * t - k * t;
}

export interface Pool<T> {
  /** Get an item; when exhausted, recycles the oldest active one. */
  acquire(): T;
  /** Return an item. Safe to call twice. */
  release(item: T): void;
  activeCount(): number;
  totalCount(): number;
  /** Active items, oldest first (do not mutate). */
  active(): readonly T[];
  /** Release every active item. */
  releaseAll(): void;
  destroy(): void;
}

export interface PoolOptions<T> {
  cap: number;
  create: () => T;
  /** Called when an item is released or recycled (hide, kill tweens). */
  reset: (item: T) => void;
  dispose: (item: T) => void;
}

export function createPool<T>(opts: PoolOptions<T>): Pool<T> {
  const free: T[] = [];
  const active: T[] = [];
  let total = 0;
  const release = (item: T): void => {
    const i = active.indexOf(item);
    if (i < 0) return;
    active.splice(i, 1);
    opts.reset(item);
    free.push(item);
  };
  return {
    acquire() {
      let item = free.pop();
      if (item === undefined) {
        if (total < opts.cap) {
          item = opts.create();
          total++;
        } else {
          item = active.shift() as T;
          opts.reset(item);
        }
      }
      active.push(item);
      return item;
    },
    release,
    releaseAll() {
      for (const item of [...active]) release(item);
    },
    activeCount: () => active.length,
    totalCount: () => total,
    active: () => active,
    destroy() {
      for (const item of [...active, ...free]) opts.dispose(item);
      active.length = 0;
      free.length = 0;
      total = 0;
    },
  };
}

/** XP-drop colour: the injected skill lookup when given (and it yields a colour), else the neutral fallback. */
export function resolveXpColor(
  skill: string,
  lookup: ((skill: string) => string) | undefined,
  fallback: string,
): string {
  return (skill && lookup?.(skill)) || fallback;
}
