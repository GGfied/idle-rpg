export const clamp = (n: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, n));

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
