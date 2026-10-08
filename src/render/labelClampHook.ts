import { labelClampOffset } from '@render/labelClamp';
import { currentKeepOuts, keepOutShift, type Shift } from '@render/labelKeepOut';

/** The slice of a Phaser camera the clamp needs. */
interface ClampCamera {
  worldView: { left: number; right: number; top?: number; width?: number; height?: number };
  on(event: 'prerender', fn: () => void): unknown;
  off(event: 'prerender', fn: () => void): unknown;
}
interface ClampLabel {
  visible: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
}
interface ClampBody {
  x: number;
  y: number;
}

/**
 * Keep `label` inside the camera view that is actually drawn this frame, and out of the HUD keep-out
 * rects (orbs, minimap, tab bar...) published via setLabelKeepOuts.
 * Phaser order per frame: scene 'prerender' -> camera.preRender() (follow lerp, scroll, worldView)
 * -> camera 'prerender' -> draw. The scene event sees LAST frame's worldView (one camera step
 * stale, so labels clip during fast pans); the camera event fires after worldView is current.
 * Returns an unhook function.
 */
export function attachLabelClamp(
  camera: ClampCamera,
  body: ClampBody,
  label: ClampLabel,
  margin: number,
  now: () => number = () => performance.now(),
): () => void {
  const baseY = label.y; // label sits at its natural offset above the entity; keep-out shifts add to it
  const shift: Shift = { dx: 0, dy: 0 };
  const clamp = (): void => {
    if (!label.visible) return;
    const view = camera.worldView;
    label.x = labelClampOffset(body.x, label.width / 2, view.left, view.right, margin);
    label.y = baseY;
    const set = currentKeepOuts(now());
    if (!set || set.rects.length === 0 || !view.width || !view.height) return;
    // world -> canvas CSS px: the view always spans the whole canvas, whatever the zoom
    const kx = set.width / view.width;
    const ky = set.height / view.height;
    const vt = view.top ?? 0;
    const cx = body.x + label.x;
    const l = (cx - label.width / 2 - view.left) * kx;
    const r = (cx + label.width / 2 - view.left) * kx;
    const b = (body.y + baseY - vt) * ky; // origin (0.5, 1): the label's bottom edge is its y
    const t = (body.y + baseY - label.height - vt) * ky;
    keepOutShift(l, t, r, b, set, shift);
    if (shift.dx === 0 && shift.dy === 0) return;
    label.x += shift.dx / kx;
    label.y = baseY + shift.dy / ky;
  };
  camera.on('prerender', clamp);
  return () => camera.off('prerender', clamp);
}
