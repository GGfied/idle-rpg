import { describe, expect, it } from 'vitest';
import { boundsWithInsets, setCameraInsets, setupCamera } from './camera';

const base = { x: -100, y: 0, width: 1000, height: 500 };

/** Phaser's clamp, reduced: the scroll may go down until the view's bottom reaches the bounds' bottom. */
const maxScrollY = (b: { y: number; height: number }, viewH: number, zoom: number): number =>
  b.y + b.height - viewH / zoom;

describe('boundsWithInsets', () => {
  it('no inset keeps the base bounds', () => {
    expect(boundsWithInsets(base, { right: 0, bottom: 0 }, 2)).toEqual(base);
    expect(boundsWithInsets(base, { right: NaN, bottom: -5 }, 2)).toEqual(base);
  });
  it('lets a south-edge tile scroll above a bottom inset', () => {
    const view = 800;
    const inset = 300;
    const zoom = 2;
    const b = boundsWithInsets(base, { right: 0, bottom: inset }, zoom);
    const scroll = maxScrollY(b, view, zoom);
    const southEdgeScreenY = (500 - scroll) * zoom;
    expect(southEdgeScreenY).toBeLessThanOrEqual(view - inset);
    const old = maxScrollY(base, view, zoom);
    expect((500 - old) * zoom).toBe(view);
  });
  it('extends right for a side panel, in world px', () => {
    expect(boundsWithInsets(base, { right: 200, bottom: 0 }, 4).width).toBe(1050);
  });
});

describe('setCameraInsets', () => {
  it('re-sets bounds from the remembered base for the current zoom', () => {
    const calls: number[][] = [];
    const cam = {
      zoom: 2,
      setBounds: (...a: number[]) => calls.push(a),
      startFollow: () => cam,
      setRoundPixels: () => cam,
    };
    const scene = { cameras: { main: cam } };
    setupCamera(scene as never, {} as never, 1000, 500, -100, 0);
    setCameraInsets(cam as never, { right: 0, bottom: 300 });
    expect(calls.at(-1)).toEqual([-100, 0, 1000, 650]);
    setCameraInsets(cam as never, { right: 0, bottom: 0 });
    expect(calls.at(-1)).toEqual([-100, 0, 1000, 500]);
  });
});

describe('re-follow keeps the HUD follow offset', () => {
  it('passes the current offset to Phaser unless the caller gives one', () => {
    const offsets: Array<[number | undefined, number | undefined]> = [];
    const cam = {
      zoom: 1,
      followOffset: { x: 0, y: 0 },
      setBounds: () => cam,
      startFollow: (
        _t: unknown,
        _r: boolean,
        _lx: number,
        _ly: number,
        ox?: number,
        oy?: number,
      ) => {
        offsets.push([ox, oy]);
        return cam;
      },
      setRoundPixels: () => cam,
    };
    setupCamera({ cameras: { main: cam } } as never, {} as never, 1000, 500);
    cam.followOffset = { x: -5, y: -15.3 };
    cam.startFollow({}, true, 0.15, 0.15, undefined, undefined);
    expect(offsets.at(-1)).toEqual([-5, -15.3]);
    cam.startFollow({}, true, 0.15, 0.15, 1, 2);
    expect(offsets.at(-1)).toEqual([1, 2]);
  });
});

describe('re-follow keeps the lerp lag', () => {
  /** Fake camera whose startFollow behaves like Phaser's: snaps the scroll onto the target. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function makeCam(): any {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cam: any = {
      zoom: 1,
      scrollX: 0,
      scrollY: 0,
      followOffset: { x: 0, y: 0 },
      lerp: { set: (x: number, y: number) => Object.assign(cam.lerpv, { x, y }) },
      lerpv: { x: 0, y: 0 },
      _follow: null,
      snaps: 0,
      setBounds: () => cam,
      setRoundPixels: () => cam,
      setFollowOffset: (x: number, y: number) => (cam.followOffset = { x, y }),
      startFollow: (t: { x: number; y: number }, _r: boolean, lx: number, ly: number) => {
        cam.snaps++;
        cam._follow = t;
        cam.scrollX = t.x;
        cam.scrollY = t.y;
        cam.lerp.set(lx, ly);
        return cam;
      },
    };
    return cam;
  }
  const setup = (cam: unknown, t: unknown) =>
    setupCamera({ cameras: { main: cam } } as never, t as never, 100, 100);

  it('same target: scroll untouched, lerp updated, no Phaser snap', () => {
    const cam = makeCam();
    const t = { x: 50, y: 50 };
    setup(cam, t);
    cam.scrollX = 44;
    cam.scrollY = 45;
    const snaps = cam.snaps;
    cam.startFollow(t, true, 0.3, 0.3);
    expect([cam.scrollX, cam.scrollY, cam.snaps]).toEqual([44, 45, snaps]);
    expect(cam.lerpv).toEqual({ x: 0.3, y: 0.3 });
  });
  it('after a pan (follow dropped) the scroll is restored, not snapped', () => {
    const cam = makeCam();
    const t = { x: 50, y: 50 };
    setup(cam, t);
    cam.scrollX = 10;
    cam.scrollY = 12;
    cam._follow = null;
    cam.startFollow(t);
    expect([cam.scrollX, cam.scrollY]).toEqual([10, 12]);
    expect(cam._follow).toBe(t);
  });
});
