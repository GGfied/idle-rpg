/** The slice of Phaser's ScaleManager we need (structural, so platform stays type-only on Phaser). */
export interface ScaleLike {
  getParentBounds(): boolean;
  refresh(): void;
}

/** What `followParentSize` needs from the browser; injectable so it runs in node tests. */
export interface FollowEnv {
  ResizeObserver?: new (cb: () => void) => { observe(el: unknown): void; disconnect(): void };
  requestAnimationFrame(fn: () => void): number;
  cancelAnimationFrame(id: number): void;
}

/**
 * Re-measure the canvas against its parent. `refresh()` alone reuses Phaser's cached parent size,
 * so the parent bounds must be re-read first (the cause of the canvas staying 1280px wide after
 * the HUD was shown again).
 */
export function remeasureScale(scale: ScaleLike): void {
  scale.getParentBounds();
  scale.refresh();
}

/**
 * Keep the Phaser canvas sized to `parent` whenever the parent's box changes (HUD hide/show,
 * phone sheet fold, layout settling), not only on window resize. Coalesced to one re-measure
 * per animation frame. Returns a disposer.
 */
export function followParentSize(
  parent: unknown,
  scale: ScaleLike,
  env: FollowEnv = globalThis as unknown as FollowEnv,
): () => void {
  if (!env.ResizeObserver) return () => {};
  let frame: number | null = null;
  let disposed = false;
  const observer = new env.ResizeObserver(() => {
    if (disposed || frame !== null) return;
    frame = env.requestAnimationFrame(() => {
      frame = null;
      if (disposed) return;
      try {
        remeasureScale(scale);
      } catch {
        // The game may already be destroyed.
      }
    });
  });
  observer.observe(parent);
  return () => {
    disposed = true;
    if (frame !== null) env.cancelAnimationFrame(frame);
    observer.disconnect();
  };
}
