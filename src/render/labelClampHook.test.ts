import { describe, expect, it } from 'vitest';
import { attachLabelClamp } from './labelClampHook';

/** Fake camera: preRender() moves worldView like Phaser, then emits 'prerender'. */
function fakeCamera() {
  const fns = new Set<() => void>();
  const cam = {
    worldView: { left: 0, right: 390 },
    on: (_e: 'prerender', fn: () => void) => fns.add(fn),
    off: (_e: 'prerender', fn: () => void) => fns.delete(fn),
    frame(left: number): void {
      cam.worldView = { left, right: left + 390 }; // camera.preRender()
      fns.forEach((f) => f()); // then the camera 'prerender' event
    },
    listeners: () => fns.size,
  };
  return cam;
}

describe('attachLabelClamp', () => {
  it('clamps against the view of THIS frame, not the previous one', () => {
    const cam = fakeCamera();
    const body = { x: 0, y: 0 };
    const label = { visible: true, x: 0, y: 0, width: 50, height: 16 };
    attachLabelClamp(cam, body, label, 4);
    body.x = 100;
    cam.frame(100); // entity at the left edge of the new view
    expect(body.x + label.x - 25).toBeGreaterThanOrEqual(104);
    cam.frame(160); // fast pan: view jumped 60 px, label must follow in the same frame
    expect(body.x + label.x - 25).toBeGreaterThanOrEqual(164);
    cam.frame(-40); // pan back the other way
    expect(body.x + label.x + 25).toBeLessThanOrEqual(346);
  });

  it('leaves hidden labels alone and unhooks', () => {
    const cam = fakeCamera();
    const label = { visible: false, x: 7, y: 0, width: 50, height: 16 };
    const off = attachLabelClamp(cam, { x: 0, y: 0 }, label, 4);
    cam.frame(300);
    expect(label.x).toBe(7);
    off();
    expect(cam.listeners()).toBe(0);
  });
});
