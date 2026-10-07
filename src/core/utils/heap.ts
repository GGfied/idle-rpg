export interface MinHeap<T> {
  push(item: T): void;
  /** Remove and return the smallest item, or undefined when empty. */
  pop(): T | undefined;
  peek(): T | undefined;
  readonly size: number;
}

/** Binary min-heap ordered by `compare` (negative when a should come out before b). Used by A*. */
export function createMinHeap<T>(compare: (a: T, b: T) => number): MinHeap<T> {
  const items: T[] = [];

  const swap = (i: number, j: number): void => {
    [items[i], items[j]] = [items[j] as T, items[i] as T];
  };

  return {
    push(item) {
      items.push(item);
      let i = items.length - 1;
      while (i > 0) {
        const parent = (i - 1) >> 1;
        if (compare(items[i] as T, items[parent] as T) >= 0) break;
        swap(i, parent);
        i = parent;
      }
    },
    pop() {
      if (items.length === 0) return undefined;
      const top = items[0];
      const last = items.pop() as T;
      if (items.length > 0) {
        items[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1;
          const r = l + 1;
          let smallest = i;
          if (l < items.length && compare(items[l] as T, items[smallest] as T) < 0) smallest = l;
          if (r < items.length && compare(items[r] as T, items[smallest] as T) < 0) smallest = r;
          if (smallest === i) break;
          swap(i, smallest);
          i = smallest;
        }
      }
      return top;
    },
    peek: () => items[0],
    get size() {
      return items.length;
    },
  };
}
