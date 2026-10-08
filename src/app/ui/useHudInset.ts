import { useEffect } from 'react';
import { bottomInset, type InsetRect } from '@app/ui/hudInset';

const PHONE_PORTRAIT = '(max-width: 767px) and (orientation: portrait)';
export const HUD_INSET_VAR = '--hud-bottom-inset';

/**
 * Publishes the px the HUD covers at the bottom of the screen as `--hud-bottom-inset` on :root
 * (read by the camera). Re-measured when `deps` change, the sheet/chat resize, or the viewport does.
 */
export function useHudInset(deps: unknown[]): void {
  useEffect(() => {
    const root = document.documentElement;
    const els = Array.from(document.querySelectorAll('.hud, .chatbox'));
    const measure = (): void => {
      const rects: InsetRect[] = els.map((e) => e.getBoundingClientRect());
      const px = bottomInset(window.innerHeight, rects, window.matchMedia(PHONE_PORTRAIT).matches);
      root.style.setProperty(HUD_INSET_VAR, `${px}px`);
    };
    measure();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    els.forEach((e) => ro?.observe(e));
    window.addEventListener('resize', measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, deps);
}
