import { BLOCKED_TEXT, EFFECTS, EVENT_VFX, REDUCED_LIFE_SCALE } from './data';
import type {
  BlockedLabel,
  EffectDef,
  VfxContext,
  VfxCue,
  VfxEvent,
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
  const nodeId = typeof event.nodeId === 'string' ? event.nodeId : undefined;
  const out: Placement[] = [];
  for (const cue of cues) {
    if (!matches(cue, event)) continue;
    const def = resolveEffect(cue.effect, opts.mode, effects);
    if (!def || (def.kind === 'xpDrop' && !opts.xpDrops)) continue;
    const node = cue.at === 'node' && nodeId ? ctx.nodeWorld?.(nodeId) : undefined;
    const p = node ?? ctx.playerWorld;
    const placement: Placement = { effect: cue.effect, x: p.x, y: p.y };
    if (cue.throttleMs) {
      const key = `${event.type}:${cue.effect}:${JSON.stringify(cue.when ?? {})}`;
      placement.throttle = { key, ms: cue.throttleMs };
    }
    out.push(placement);
  }
  return out;
}

function matches(cue: VfxCue, event: VfxEvent): boolean {
  if (!cue.when) return true;
  return Object.entries(cue.when).every(([k, v]) => event[k] === v);
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
