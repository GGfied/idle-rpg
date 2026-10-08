import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { WORLD_DEF } from '@features/world';
import { cappedPixelRatio } from '@platform/viewport';
import { drawWorldMap } from '@render/index';
import type { WorldMapView } from '@render/index';
import { advanceTrail, renderPosition, startTrail } from '@app/scenes/renderTrail';
import type { Trail } from '@app/scenes/renderTrail';
import { CONTENT } from '@app/registry';
import { useRuntime } from '@app/ui/context';
import { minimapMarkers, trailFacing } from '@app/ui/panels/Minimap';
import { worldTerrain } from '@app/ui/worldMapTerrain';
import {
  centreOn,
  initialView,
  panView,
  wheelZoomFactor,
  worldMapKeyIntent,
  zoomView,
} from '@app/ui/worldMapView';

/** Redraw period while open (spots and the player move; terrain is static). */
const REDRAW_MS = 100;

interface ShellProps {
  onClose: () => void;
  onCentre: () => void;
  children: ReactNode;
}

/** Backdrop + frame + buttons. Tapping the backdrop (not the frame) closes. View-only. */
export function WorldMapShell({ onClose, onCentre, children }: ShellProps) {
  return (
    <div
      className="worldmap-backdrop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="worldmap" role="dialog" aria-label="World map">
        {children}
        <button
          type="button"
          className="worldmap-btn worldmap-close"
          aria-label="Close world map"
          onClick={onClose}
        >
          {'✕'}
        </button>
        <button
          type="button"
          className="worldmap-btn worldmap-centre"
          aria-label="Centre on me"
          onClick={onCentre}
        >
          Centre on me
        </button>
      </div>
    </div>
  );
}

/** Whole-world map: drag to pan, wheel/pinch to zoom, centre on me, Escape/outside/X to close. */
export function WorldMapOverlay({ onClose }: { onClose: () => void }) {
  const { store, ticker } = useRuntime();
  const ref = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<WorldMapView | null>(null);
  const meRef = useRef({ x: 0, y: 0 });
  const redraw = useRef<() => void>(() => {});

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const bounds = { width: WORLD_DEF.widthTiles, height: WORLD_DEF.heightTiles };
    let trail: Trail = startTrail(store.getState().game.movement.position, ticker.tick);
    const draw = (): void => {
      const dpr = cappedPixelRatio();
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      const g = store.getState().game;
      trail = advanceTrail(trail, g.movement.position, ticker.tick);
      const me = renderPosition(trail, ticker.alpha());
      meRef.current = me;
      let view = viewRef.current;
      if (!view) view = initialView(w, h, bounds);
      else if (view.w !== w || view.h !== h) view = zoomView({ ...view, w, h }, 1);
      view = { ...view, pixelRatio: dpr };
      viewRef.current = view;
      const t = worldTerrain();
      ctx.clearRect(0, 0, w, h);
      drawWorldMap(
        ctx,
        t.canvas,
        t.image,
        view,
        minimapMarkers(CONTENT, g, me, trailFacing(trail)),
        WORLD_DEF.labels,
      );
    };
    redraw.current = draw;
    draw();
    const id = window.setInterval(draw, REDRAW_MS);

    const pointers = new Map<number, { x: number; y: number }>();
    const dpr = (): number => cappedPixelRatio();
    const local = (e: PointerEvent | WheelEvent): { x: number; y: number } => {
      const r = canvas.getBoundingClientRect();
      return { x: (e.clientX - r.left) * dpr(), y: (e.clientY - r.top) * dpr() };
    };
    const down = (e: PointerEvent): void => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      canvas.setPointerCapture?.(e.pointerId);
    };
    const move = (e: PointerEvent): void => {
      const prev = pointers.get(e.pointerId);
      const view = viewRef.current;
      if (!prev || !view) return;
      const next = { x: e.clientX, y: e.clientY };
      if (pointers.size === 1) {
        viewRef.current = panView(view, (next.x - prev.x) * dpr(), (next.y - prev.y) * dpr());
      } else if (pointers.size === 2) {
        const other = [...pointers.entries()].find(([id2]) => id2 !== e.pointerId)?.[1];
        if (other) {
          const d0 = Math.hypot(prev.x - other.x, prev.y - other.y);
          const d1 = Math.hypot(next.x - other.x, next.y - other.y);
          const r = canvas.getBoundingClientRect();
          const mx = ((next.x + other.x) / 2 - r.left) * dpr();
          const my = ((next.y + other.y) / 2 - r.top) * dpr();
          if (d0 > 0 && d1 > 0) viewRef.current = zoomView(view, d1 / d0, mx, my);
        }
      }
      pointers.set(e.pointerId, next);
      draw();
    };
    const up = (e: PointerEvent): void => {
      pointers.delete(e.pointerId);
    };
    const wheel = (e: WheelEvent): void => {
      e.preventDefault();
      const view = viewRef.current;
      if (!view) return;
      const p = local(e);
      viewRef.current = zoomView(view, wheelZoomFactor(e.deltaY), p.x, p.y);
      draw();
    };
    const key = (e: KeyboardEvent): void => {
      if (worldMapKeyIntent(e.key) === 'close') onClose();
    };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', wheel, { passive: false });
    window.addEventListener('keydown', key);
    return () => {
      window.clearInterval(id);
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      canvas.removeEventListener('wheel', wheel);
      window.removeEventListener('keydown', key);
      redraw.current = () => {};
    };
  }, [store, ticker, onClose]);

  const onCentre = (): void => {
    const view = viewRef.current;
    if (view) viewRef.current = centreOn(view, meRef.current);
    redraw.current();
  };

  return createPortal(
    <WorldMapShell onClose={onClose} onCentre={onCentre}>
      <canvas ref={ref} className="worldmap-canvas" role="img" aria-label="World map" />
    </WorldMapShell>,
    document.body,
  );
}
