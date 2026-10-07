import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from './events';

type Ev = { type: 'a'; n: number } | { type: 'b'; s: string };

describe('createEventBus', () => {
  it('delivers only matching types, typed', () => {
    const bus = createEventBus<Ev>();
    const onA = vi.fn();
    bus.on('a', (e) => onA(e.n));
    bus.emit({ type: 'b', s: 'x' });
    bus.emit({ type: 'a', n: 3 });
    expect(onA).toHaveBeenCalledTimes(1);
    expect(onA).toHaveBeenCalledWith(3);
  });

  it('onAny sees everything, emitAll keeps order', () => {
    const bus = createEventBus<Ev>();
    const seen: string[] = [];
    bus.onAny((e) => seen.push(e.type));
    bus.emitAll([
      { type: 'b', s: '' },
      { type: 'a', n: 1 },
    ]);
    expect(seen).toEqual(['b', 'a']);
  });

  it('unsubscribe stops delivery, also mid-emit', () => {
    const bus = createEventBus<Ev>();
    const h = vi.fn();
    const off = bus.on('a', h);
    off();
    bus.emit({ type: 'a', n: 1 });
    expect(h).not.toHaveBeenCalled();

    const calls: string[] = [];
    let offSecond = (): void => {};
    bus.on('a', () => {
      calls.push('first');
      offSecond();
    });
    offSecond = bus.on('a', () => calls.push('second'));
    bus.emit({ type: 'a', n: 1 });
    expect(calls).toEqual(['first', 'second']); // snapshot semantics
    bus.emit({ type: 'a', n: 1 });
    expect(calls).toEqual(['first', 'second', 'first']);
  });
});
