import type Phaser from 'phaser';

/** World-px slack around the camera rect: figures and trees draw well above their feet (the container origin). */
export const CULL_MARGIN = { left: 96, right: 96, top: 256, bottom: 64 } as const;

export interface CullRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** The camera's world rect from scroll/zoom (worldView lags a frame behind in postupdate). */
export function cameraRect(cam: {
  scrollX: number;
  scrollY: number;
  zoom: number;
  width: number;
  height: number;
}): CullRect {
  const w = cam.width / cam.zoom;
  const h = cam.height / cam.zoom;
  const left = cam.scrollX + (cam.width - w) / 2;
  const top = cam.scrollY + (cam.height - h) / 2;
  return { left, top, right: left + w, bottom: top + h };
}

/** True when a feet position can still show something inside `view` (plus the margin). */
export function isNearView(x: number, y: number, view: CullRect): boolean {
  return (
    x >= view.left - CULL_MARGIN.left &&
    x <= view.right + CULL_MARGIN.right &&
    y >= view.top - CULL_MARGIN.bottom &&
    y <= view.bottom + CULL_MARGIN.top
  );
}

const sets = new WeakMap<Phaser.Scene, Set<Phaser.GameObjects.Container>>();

/**
 * Phaser never culls a Container (it still draws every child, Graphics replays included), so with
 * ~160 tree views in the chunk window an off-screen forest cost ~19 ms/frame at 4x CPU. Registered
 * containers are hidden each frame while their feet are outside the main camera; one shared
 * listener per scene, removed with the scene. Nothing else may toggle a registered container's
 * `visible` (children's visibility is untouched).
 */
export function cullToCamera(scene: Phaser.Scene, container: Phaser.GameObjects.Container): void {
  let set = sets.get(scene);
  if (!set) {
    const live = new Set<Phaser.GameObjects.Container>();
    set = live;
    sets.set(scene, live);
    const run = (): void => {
      const view = cameraRect(scene.cameras.main);
      for (const c of live) c.visible = isNearView(c.x, c.y, view);
    };
    scene.events.on('postupdate', run);
    const stop = (): void => {
      scene.events.off('postupdate', run);
      live.clear();
      sets.delete(scene);
    };
    scene.events.once('shutdown', stop);
    scene.events.once('destroy', stop);
  }
  set.add(container);
  container.once('destroy', () => set.delete(container));
}

/** Stop culling a container (pooled views that are hidden on purpose); register again with cullToCamera. */
export function uncullFromCamera(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
): void {
  sets.get(scene)?.delete(container);
}
