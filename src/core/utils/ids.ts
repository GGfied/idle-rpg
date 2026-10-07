const ID_PATTERN = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;

/** Content ids are global snake_case strings: "oak_logs", "raw_shrimp". */
export const isValidId = (id: string): boolean => ID_PATTERN.test(id);

/** Ids that appear more than once (each reported once, in first-duplicate order). */
export function findDuplicates(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) dupes.add(id);
    seen.add(id);
  }
  return [...dupes];
}
