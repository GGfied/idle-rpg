function listen(
  target: EventTarget,
  names: string[],
  handler: () => void,
  shouldFire: () => boolean,
): () => void {
  const fn = (): void => {
    if (shouldFire()) handler();
  };
  names.forEach((n) => target.addEventListener(n, fn));
  return () => names.forEach((n) => target.removeEventListener(n, fn));
}

/** Fires when the tab is hidden or the page is being unloaded (visibilitychange hidden + pagehide). */
export function onAppHidden(callback: () => void): () => void {
  const offVis = listen(
    document,
    ['visibilitychange'],
    callback,
    () => document.visibilityState === 'hidden',
  );
  const offHide = listen(window, ['pagehide'], callback, () => true);
  return () => {
    offVis();
    offHide();
  };
}

/** Fires when the tab becomes visible again (visibilitychange visible + pageshow). */
export function onAppVisible(callback: () => void): () => void {
  const offVis = listen(
    document,
    ['visibilitychange'],
    callback,
    () => document.visibilityState === 'visible',
  );
  const offShow = listen(
    window,
    ['pageshow'],
    callback,
    () => document.visibilityState === 'visible',
  );
  return () => {
    offVis();
    offShow();
  };
}
