import {
  DEFAULT_GESTURE_OPTIONS,
  gestureReducer,
  initialGestureState,
  type ResolvedGestureOptions,
} from './gestureReducer';
import type {
  GestureEmission,
  GestureEventName,
  GestureHandler,
  GestureInput,
  GestureOptions,
  RawEvent,
} from './types';

type AnyHandler = (payload: never) => void;

/**
 * Wire Pointer Events (mouse, touch, pen) on `target` into the gesture reducer.
 * Target should be the Phaser canvas element and have CSS `touch-action: none`.
 */
export function createGestureInput(
  target: EventTarget,
  options: GestureOptions = {},
): GestureInput {
  const opts: ResolvedGestureOptions = { ...DEFAULT_GESTURE_OPTIONS, ...options };
  const handlers: { [K in GestureEventName]?: Set<AnyHandler> } = {};
  let state = initialGestureState();
  let holdTimer: ReturnType<typeof setTimeout> | undefined;

  const clearHold = (): void => {
    if (holdTimer !== undefined) clearTimeout(holdTimer);
    holdTimer = undefined;
  };

  const emit = (e: GestureEmission): void => {
    handlers[e.type]?.forEach((h) => (h as (p: unknown) => void)(e.payload));
  };

  const feed = (ev: RawEvent): void => {
    const res = gestureReducer(state, ev, performance.now(), opts);
    state = res.state;
    if (state.mode !== 'pending') clearHold();
    res.emitted.forEach(emit);
  };

  const onDown = (e: Event): void => {
    const p = e as PointerEvent;
    feed({
      type: 'down',
      id: p.pointerId,
      x: p.clientX,
      y: p.clientY,
      button: p.button,
      pointerType: p.pointerType,
    });
    if (state.mode === 'pending' && state.pointerType !== 'mouse') {
      clearHold();
      holdTimer = setTimeout(() => feed({ type: 'hold' }), opts.longPressMs);
    }
    // Keep receiving moves/ups even if the finger leaves the canvas.
    try {
      (p.target as Element | null)?.setPointerCapture?.(p.pointerId);
    } catch {
      /* pointer already gone */
    }
  };
  const onMove = (e: Event): void => {
    const p = e as PointerEvent;
    feed({ type: 'move', id: p.pointerId, x: p.clientX, y: p.clientY });
  };
  const onUp = (e: Event): void => {
    const p = e as PointerEvent;
    feed({ type: 'up', id: p.pointerId, x: p.clientX, y: p.clientY });
  };
  const onCancel = (e: Event): void => feed({ type: 'cancel', id: (e as PointerEvent).pointerId });
  const onContextMenu = (e: Event): void => {
    e.preventDefault();
    const m = e as MouseEvent;
    feed({ type: 'contextmenu', x: m.clientX, y: m.clientY });
  };
  const onWheel = (e: Event): void => {
    e.preventDefault();
    const w = e as WheelEvent;
    // Normalise line/page modes to roughly pixels.
    const unit = w.deltaMode === 1 ? 16 : w.deltaMode === 2 ? 400 : 1;
    feed({ type: 'wheel', x: w.clientX, y: w.clientY, deltaY: w.deltaY * unit });
  };

  const listeners: [string, (e: Event) => void, AddEventListenerOptions?][] = [
    ['pointerdown', onDown],
    ['pointermove', onMove],
    ['pointerup', onUp],
    ['pointercancel', onCancel],
    ['contextmenu', onContextMenu],
    ['wheel', onWheel, { passive: false }],
  ];
  listeners.forEach(([name, fn, o]) => target.addEventListener(name, fn, o));

  return {
    on<K extends GestureEventName>(event: K, handler: GestureHandler<K>): () => void {
      const set = (handlers[event] ??= new Set());
      set.add(handler as AnyHandler);
      return () => set.delete(handler as AnyHandler);
    },
    destroy(): void {
      clearHold();
      listeners.forEach(([name, fn]) => target.removeEventListener(name, fn));
      Object.values(handlers).forEach((s) => s?.clear());
      state = initialGestureState();
    },
  };
}
