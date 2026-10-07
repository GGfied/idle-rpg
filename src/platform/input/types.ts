/** Abstract pointer intents emitted for mouse, touch and pen alike. Coordinates are client px. */
export type GestureEvents = {
  tap: { x: number; y: number };
  longPress: { x: number; y: number };
  /** `scale` is the incremental factor since the previous pinch/wheel event (>1 = zoom in). */
  pinch: { scale: number; centerX: number; centerY: number };
  /** Incremental pan delta since the previous drag event, in client px. */
  drag: { dx: number; dy: number };
};

export type GestureEventName = keyof GestureEvents;
export type GestureHandler<K extends GestureEventName> = (payload: GestureEvents[K]) => void;

export type GestureEmission = {
  [K in GestureEventName]: { type: K; payload: GestureEvents[K] };
}[GestureEventName];

export interface GestureOptions {
  /** Max travel (px) for a press to still count as a tap / long-press. Default 10. */
  moveThreshold?: number;
  /** Max press duration (ms) for a tap. Default 500. */
  tapMaxMs?: number;
  /** Touch/pen hold duration (ms) for a long press. Default 450. */
  longPressMs?: number;
  /** Wheel zoom sensitivity: scale = exp(-deltaY * wheelSensitivity). Default 0.0015. */
  wheelSensitivity?: number;
}

export interface GestureInput {
  on<K extends GestureEventName>(event: K, handler: GestureHandler<K>): () => void;
  destroy(): void;
}

/** Raw, DOM-free events fed to the reducer. */
export type RawEvent =
  | { type: 'down'; id: number; x: number; y: number; button: number; pointerType: string }
  | { type: 'move'; id: number; x: number; y: number }
  | { type: 'up'; id: number; x: number; y: number }
  | { type: 'cancel'; id: number }
  | { type: 'hold' }
  | { type: 'contextmenu'; x: number; y: number }
  | { type: 'wheel'; x: number; y: number; deltaY: number };

export type PointerPoint = { x: number; y: number };
