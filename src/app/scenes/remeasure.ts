/** What `watchViewport` needs from the browser; injectable so it runs in node tests. */
export interface ViewportEnv {
  addEventListener(type: 'resize' | 'orientationchange', fn: () => void): void;
  removeEventListener(type: 'resize' | 'orientationchange', fn: () => void): void;
  devicePixelRatio: number;
  matchMedia?(query: string): {
    addEventListener(type: 'change', fn: () => void): void;
    removeEventListener(type: 'change', fn: () => void): void;
  };
  visualViewport?: {
    addEventListener(type: 'resize', fn: () => void): void;
    removeEventListener(type: 'resize', fn: () => void): void;
  } | null;
  requestAnimationFrame(fn: () => void): number;
  cancelAnimationFrame(id: number): void;
}

/**
 * Call `measure` (once per animation frame) whenever the window resizes, the visual viewport
 * resizes, or devicePixelRatio changes (browser zoom, moving between displays). The dpr listener
 * is a `(resolution: Xdppx)` media query that fires once per change, so it is re-armed each time.
 * Returns a disposer.
 */
export function watchViewport(env: ViewportEnv, measure: () => void): () => void {
  let frame: number | null = null;
  let disposed = false;
  const schedule = (): void => {
    if (disposed || frame !== null) return;
    frame = env.requestAnimationFrame(() => {
      frame = null;
      if (!disposed) measure();
    });
  };
  let unwatchDpr = (): void => {};
  const armDpr = (): void => {
    unwatchDpr();
    const mq = env.matchMedia?.(`(resolution: ${env.devicePixelRatio}dppx)`);
    if (!mq) return;
    const onChange = (): void => {
      schedule();
      armDpr();
    };
    mq.addEventListener('change', onChange);
    unwatchDpr = () => mq.removeEventListener('change', onChange);
  };
  env.addEventListener('resize', schedule);
  env.addEventListener('orientationchange', schedule);
  env.visualViewport?.addEventListener('resize', schedule);
  armDpr();
  return () => {
    disposed = true;
    if (frame !== null) env.cancelAnimationFrame(frame);
    unwatchDpr();
    env.removeEventListener('resize', schedule);
    env.removeEventListener('orientationchange', schedule);
    env.visualViewport?.removeEventListener('resize', schedule);
  };
}
