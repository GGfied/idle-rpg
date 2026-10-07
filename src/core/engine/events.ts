import type { GameEvent } from '@core/contracts';

type Handler<E> = (event: E) => void;

export interface EventBus<E extends GameEvent> {
  /** Subscribe to one event type. Returns an unsubscribe function. */
  on<T extends E['type']>(type: T, handler: Handler<Extract<E, { type: T }>>): () => void;
  /** Subscribe to every event (audio, vfx, chat log). Returns an unsubscribe function. */
  onAny(handler: Handler<E>): () => void;
  emit(event: E): void;
  emitAll(events: readonly E[]): void;
}

/**
 * Typed event bus. `E` is a discriminated union on `type`.
 *
 * Extension pattern: each module declares its own events as `{ type: 'treeDepleted'; ... }` types
 * and exports a union (`WoodcuttingEvent`). `app/registry.ts` unions them
 * (`type AppEvent = SkillEvent | WoodcuttingEvent | ...`) and creates `createEventBus<AppEvent>()`.
 * Modules never import each other's events; they only emit data that matches `GameEvent`.
 */
export function createEventBus<E extends GameEvent>(): EventBus<E> {
  const byType = new Map<string, Set<Handler<never>>>();
  const any = new Set<Handler<E>>();

  return {
    on(type, handler) {
      const set = byType.get(type) ?? new Set();
      set.add(handler as Handler<never>);
      byType.set(type, set);
      return () => {
        set.delete(handler as Handler<never>);
      };
    },
    onAny(handler) {
      any.add(handler);
      return () => {
        any.delete(handler);
      };
    },
    emit(event) {
      // Copy so handlers may unsubscribe while being called.
      for (const h of [...(byType.get(event.type) ?? [])]) (h as Handler<E>)(event);
      for (const h of [...any]) h(event);
    },
    emitAll(events) {
      for (const e of events) this.emit(e);
    },
  };
}
