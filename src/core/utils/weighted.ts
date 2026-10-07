import type { Rng } from '@core/contracts';

export interface WeightedEntry<T> {
  weight: number;
  value: T;
}

/** Pick one entry with probability proportional to its weight. Consumes exactly one rng call. */
export function rollTable<T>(rng: Rng, table: readonly WeightedEntry<T>[]): T {
  let total = 0;
  for (const e of table) {
    if (!(e.weight >= 0)) throw new Error('rollTable: weights must be >= 0');
    total += e.weight;
  }
  if (table.length === 0 || total <= 0) throw new Error('rollTable: empty or zero-weight table');
  let roll = rng.next() * total;
  for (const e of table) {
    if (roll < e.weight) return e.value;
    roll -= e.weight;
  }
  // Floating-point edge: fall back to the last entry that can be rolled.
  return [...table].reverse().find((e) => e.weight > 0)!.value;
}
