export type AnimMode = 'on' | 'reduced' | 'off';

export interface BannerTimings {
  fadeInMs: number;
  holdMs: number;
  fadeOutMs: number;
}

/** Fade/hold lengths per animation preference: 'off' appears and disappears without fades. */
export function bannerTimings(mode: AnimMode): BannerTimings {
  if (mode === 'off') return { fadeInMs: 0, holdMs: 2000, fadeOutMs: 0 };
  if (mode === 'reduced') return { fadeInMs: 120, holdMs: 2000, fadeOutMs: 200 };
  return { fadeInMs: 300, holdMs: 2000, fadeOutMs: 600 };
}

export const bannerTotalMs = (t: BannerTimings): number => t.fadeInMs + t.holdMs + t.fadeOutMs;

/** A missing preference value means true (older saves). */
export const areaNamesEnabled = (value: boolean | undefined): boolean => value !== false;

/** Whether to render: a banner exists, the pref allows it and it hasn't run its course. */
export function bannerVisible(
  banner: { name: string } | null | undefined,
  enabled: boolean,
  elapsedMs: number,
  t: BannerTimings,
): boolean {
  return !!banner && banner.name.length > 0 && enabled && elapsedMs < bannerTotalMs(t);
}

/** Opacity at a moment of the banner's life (used to document/test the CSS keyframes). */
export function bannerOpacity(elapsedMs: number, t: BannerTimings): number {
  if (elapsedMs < 0 || elapsedMs >= bannerTotalMs(t)) return 0;
  if (elapsedMs < t.fadeInMs) return elapsedMs / t.fadeInMs;
  const out = elapsedMs - t.fadeInMs - t.holdMs;
  return out < 0 ? 1 : 1 - out / t.fadeOutMs;
}
