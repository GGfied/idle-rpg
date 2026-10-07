import { isoProjection } from '@render/index';

/**
 * Lowest zoom at which the loaded chunks still fill the view. With a (2*radius+1)^2 window the player
 * may stand at a chunk edge, so only `radius * chunkSize` tiles are guaranteed around them: a diamond
 * in screen space. The view rectangle (view px / zoom) must fit inside that diamond, which also keeps
 * the view smaller than the world (no empty space around it, ISO-1).
 */
export function minZoomForWindow(
  view: { width: number; height: number },
  radius: number,
  chunkSize: number,
): number {
  const r = radius * chunkSize;
  const o = isoProjection.tileToWorld(0, 0);
  const halfW = isoProjection.tileToWorld(r, -r).x - o.x;
  const halfH = isoProjection.tileToWorld(r, r).y - o.y;
  if (!(halfW > 0) || !(halfH > 0)) return 0;
  return view.width / 2 / halfW + view.height / 2 / halfH;
}
