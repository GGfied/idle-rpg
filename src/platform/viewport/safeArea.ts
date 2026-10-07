/**
 * Safe-area CSS approach (no JS needed): the page needs
 *   <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
 * and the HUD pads with `env(safe-area-inset-*)`, e.g.
 *   padding-bottom: env(safe-area-inset-bottom);
 * `applySafeAreaVars()` mirrors the insets into CSS variables (`--safe-top|right|bottom|left`)
 * so stylesheets can use `var(--safe-bottom)` and JS can read them. Returns a cleanup function.
 */
export function applySafeAreaVars(root: HTMLElement = document.documentElement): () => void {
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
    'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.appendChild(probe);

  const update = (): void => {
    const cs = getComputedStyle(probe);
    root.style.setProperty('--safe-top', cs.paddingTop || '0px');
    root.style.setProperty('--safe-right', cs.paddingRight || '0px');
    root.style.setProperty('--safe-bottom', cs.paddingBottom || '0px');
    root.style.setProperty('--safe-left', cs.paddingLeft || '0px');
  };
  update();
  window.addEventListener('resize', update);
  window.addEventListener('orientationchange', update);
  return () => {
    window.removeEventListener('resize', update);
    window.removeEventListener('orientationchange', update);
    probe.remove();
  };
}

/** True when the primary input is coarse (finger). Use for layout choices only, never for logic paths. */
export function isTouchDevice(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true;
}
