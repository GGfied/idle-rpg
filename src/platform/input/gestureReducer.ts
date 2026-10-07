import type { GestureEmission, GestureOptions, PointerPoint, RawEvent } from './types';

export type ResolvedGestureOptions = Required<GestureOptions>;

export const DEFAULT_GESTURE_OPTIONS: ResolvedGestureOptions = {
  moveThreshold: 10,
  tapMaxMs: 500,
  longPressMs: 450,
  wheelSensitivity: 0.0015,
};

/** Duplicate-longPress guard: browsers fire `contextmenu` after a touch hold we already handled. */
const CONTEXTMENU_DEDUPE_MS = 800;

type Mode = 'idle' | 'pending' | 'dragging' | 'longPressed' | 'pinching' | 'ignored';

export interface GestureState {
  mode: Mode;
  /** Active tracked pointers (primary button only). */
  pointers: Record<number, PointerPoint>;
  /** Where the current single-pointer gesture began. */
  startX: number;
  startY: number;
  startAt: number;
  pointerType: string;
  lastX: number;
  lastY: number;
  /** Distance between the two pinch pointers at the previous step. */
  pinchDist: number;
  lastLongPressAt: number;
}

export function initialGestureState(): GestureState {
  return {
    mode: 'idle',
    pointers: {},
    startX: 0,
    startY: 0,
    startAt: 0,
    pointerType: 'mouse',
    lastX: 0,
    lastY: 0,
    pinchDist: 0,
    lastLongPressAt: Number.NEGATIVE_INFINITY,
  };
}

export interface ReduceResult {
  state: GestureState;
  emitted: GestureEmission[];
}

function pairOf(pointers: Record<number, PointerPoint>): [PointerPoint, PointerPoint] | null {
  const pts = Object.values(pointers);
  const a = pts[0];
  const b = pts[1];
  return a && b ? [a, b] : null;
}

function dist(a: PointerPoint, b: PointerPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Pure gesture state machine. `now` is a millisecond clock supplied by the caller.
 * A `hold` event is the long-press timer firing; the reducer re-checks it, so stale timers are harmless.
 */
export function gestureReducer(
  state: GestureState,
  ev: RawEvent,
  now: number,
  options: ResolvedGestureOptions = DEFAULT_GESTURE_OPTIONS,
): ReduceResult {
  const emitted: GestureEmission[] = [];
  const next: GestureState = { ...state, pointers: { ...state.pointers } };
  const done = (s: GestureState = next): ReduceResult => ({ state: s, emitted });

  switch (ev.type) {
    case 'down': {
      // Mouse: only the primary button starts a gesture (right-click arrives as `contextmenu`).
      if (ev.pointerType === 'mouse' && ev.button !== 0) return done();
      next.pointers[ev.id] = { x: ev.x, y: ev.y };
      const count = Object.keys(next.pointers).length;
      if (count === 1) {
        Object.assign(next, {
          mode: 'pending',
          startX: ev.x,
          startY: ev.y,
          startAt: now,
          pointerType: ev.pointerType,
          lastX: ev.x,
          lastY: ev.y,
        });
      } else if (count === 2) {
        const pair = pairOf(next.pointers);
        next.mode = 'pinching';
        next.pinchDist = pair ? dist(pair[0], pair[1]) : 0;
      } else {
        next.mode = 'ignored';
      }
      return done();
    }
    case 'move': {
      const p = next.pointers[ev.id];
      if (!p) return done();
      next.pointers[ev.id] = { x: ev.x, y: ev.y };
      if (next.mode === 'pending') {
        if (Math.hypot(ev.x - next.startX, ev.y - next.startY) > options.moveThreshold) {
          next.mode = 'dragging';
          // Emit from the start point so the pan doesn't lose the threshold distance.
          emitted.push({
            type: 'drag',
            payload: { dx: ev.x - next.startX, dy: ev.y - next.startY },
          });
          next.lastX = ev.x;
          next.lastY = ev.y;
        }
      } else if (next.mode === 'dragging') {
        emitted.push({
          type: 'drag',
          payload: { dx: ev.x - next.lastX, dy: ev.y - next.lastY },
        });
        next.lastX = ev.x;
        next.lastY = ev.y;
      } else if (next.mode === 'pinching') {
        const pair = pairOf(next.pointers);
        if (pair) {
          const d = dist(pair[0], pair[1]);
          if (next.pinchDist > 0 && d > 0) {
            emitted.push({
              type: 'pinch',
              payload: {
                scale: d / next.pinchDist,
                centerX: (pair[0].x + pair[1].x) / 2,
                centerY: (pair[0].y + pair[1].y) / 2,
              },
            });
          }
          next.pinchDist = d;
        }
      }
      return done();
    }
    case 'up': {
      if (!next.pointers[ev.id]) return done();
      if (
        next.mode === 'pending' &&
        Math.hypot(ev.x - next.startX, ev.y - next.startY) <= options.moveThreshold &&
        now - next.startAt <= options.tapMaxMs
      ) {
        emitted.push({ type: 'tap', payload: { x: ev.x, y: ev.y } });
      }
      return done(releasePointer(next, ev.id));
    }
    case 'cancel': {
      if (!next.pointers[ev.id]) return done();
      return done(releasePointer(next, ev.id));
    }
    case 'hold': {
      if (
        next.mode === 'pending' &&
        next.pointerType !== 'mouse' &&
        now - next.startAt >= options.longPressMs
      ) {
        next.mode = 'longPressed';
        next.lastLongPressAt = now;
        emitted.push({ type: 'longPress', payload: { x: next.lastX, y: next.lastY } });
      }
      return done();
    }
    case 'contextmenu': {
      if (now - next.lastLongPressAt >= CONTEXTMENU_DEDUPE_MS && next.mode !== 'longPressed') {
        next.lastLongPressAt = now;
        // A right-click supersedes any press in progress so it can't also become a tap.
        if (next.mode === 'pending') next.mode = 'ignored';
        emitted.push({ type: 'longPress', payload: { x: ev.x, y: ev.y } });
      }
      return done();
    }
    case 'wheel': {
      if (ev.deltaY !== 0) {
        emitted.push({
          type: 'pinch',
          payload: {
            scale: Math.exp(-ev.deltaY * options.wheelSensitivity),
            centerX: ev.x,
            centerY: ev.y,
          },
        });
      }
      return done();
    }
  }
}

function releasePointer(s: GestureState, id: number): GestureState {
  delete s.pointers[id];
  if (Object.keys(s.pointers).length === 0) {
    s.mode = 'idle';
  } else if (s.mode !== 'idle') {
    // Leftover finger after a pinch/drag must not tap or drag.
    s.mode = 'ignored';
  }
  return s;
}
