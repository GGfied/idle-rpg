import { useEffect, useRef } from 'react';
import { getLevel } from '@core/progression';
import { MAX_RUN_ENERGY, MIN_RUN_ENERGY } from '@features/movement';
import { OBJECT_SPAWNS, TREE_SPAWNS, WORLD, terrainAt } from '@features/world';
import { isDepleted } from '@core/skills';
import { cappedPixelRatio } from '@platform/viewport';
import { buildMinimapImage, drawMinimap, minimapPxToTile } from '@render/index';
import type { MinimapImage, MinimapMarker, MinimapView } from '@render/index';
import { advanceTrail, renderPosition, startTrail } from '@app/scenes/renderTrail';
import type { Trail } from '@app/scenes/renderTrail';
import { CONTENT } from '@app/registry';
import { useApp, useRuntime } from '@app/ui/context';

/** Canvas px per tile, in CSS px, at the circle's native size. */
const TILE_CSS_PX = 4;

let cachedImage: { image: MinimapImage; canvas: HTMLCanvasElement } | null = null;

/** The terrain image is built once per region and kept on an offscreen canvas. */
function terrainImage(): { image: MinimapImage; canvas: HTMLCanvasElement } {
  if (cachedImage) return cachedImage;
  const image = buildMinimapImage(
    { width: WORLD.width, height: WORLD.height, kindAt: terrainAt },
    { pxPerTile: TILE_CSS_PX },
  );
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  canvas
    .getContext('2d')
    ?.putImageData(
      new ImageData(new Uint8ClampedArray(image.data), image.width, image.height),
      0,
      0,
    );
  cachedImage = { image, canvas };
  return cachedImage;
}

/** Round minimap (tap to walk), redrawn every frame, with an "N" label. */
export function Minimap() {
  const { store, ticker } = useRuntime();
  const ref = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<MinimapView | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const { image, canvas: terrain } = terrainImage();
    const start = store.getState().game.movement.position;
    let trail: Trail = startTrail(start, ticker.tick);
    let raf = 0;
    const frame = (): void => {
      const dpr = cappedPixelRatio();
      const css = canvas.clientWidth || 160;
      const px = Math.round(css * dpr);
      if (canvas.width !== px) {
        canvas.width = px;
        canvas.height = px;
      }
      const g = store.getState().game;
      trail = advanceTrail(trail, g.movement.position, ticker.tick);
      const me = renderPosition(trail, ticker.alpha());
      const view: MinimapView = {
        centre: me,
        radiusPx: px / 2,
        pxPerTile: TILE_CSS_PX,
        zoom: (css / 160) * dpr,
        bounds: { width: WORLD.width, height: WORLD.height },
      };
      viewRef.current = view;
      const markers: MinimapMarker[] = [];
      for (const o of OBJECT_SPAWNS) markers.push({ kind: 'bank', tile: { x: o.x, y: o.y } });
      for (const t of TREE_SPAWNS) {
        const node = g.gathering.nodes[t.nodeId];
        markers.push({
          kind: node !== undefined && isDepleted(node) ? 'stump' : 'tree',
          tile: { x: t.x, y: t.y },
        });
      }
      for (const n of CONTENT.npcs.values())
        markers.push({ kind: 'npc', tile: { x: n.x, y: n.y } });
      const dest = g.movement.path[g.movement.path.length - 1];
      if (dest) markers.push({ kind: 'destination', tile: dest });
      markers.push({ kind: 'player', tile: me });
      ctx.clearRect(0, 0, px, px);
      drawMinimap(ctx, terrain, image, view, markers);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [store, ticker]);

  const onTap = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    const canvas = ref.current;
    const view = viewRef.current;
    if (!canvas || !view) return;
    const rect = canvas.getBoundingClientRect();
    const tile = minimapPxToTile(
      ((e.clientX - rect.left) * canvas.width) / rect.width,
      ((e.clientY - rect.top) * canvas.height) / rect.height,
      view,
    );
    if (tile) store.getState().walkTo(tile);
  };

  return (
    <div className="minimap-wrap">
      <canvas
        ref={ref}
        className="minimap"
        role="img"
        aria-label="Minimap. Tap to walk."
        onPointerDown={onTap}
      />
      <button
        type="button"
        className="minimap-n"
        aria-label="Compass: centre the camera on me"
        onClick={() => store.getState().recentreCamera()}
      >
        N
      </button>
    </div>
  );
}

interface OrbProps {
  label: string;
  value: number;
  max: number;
  color: string;
  text?: string;
  onClick?: () => void;
  disabled?: boolean;
  pressed?: boolean;
}

function Orb({ label, value, max, color, text, onClick, disabled, pressed }: OrbProps) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <button
      type="button"
      className="orb"
      style={{ '--orb-color': color, '--orb-pct': `${pct}%` } as React.CSSProperties}
      aria-label={`${label} ${text ?? Math.floor(value)}`}
      aria-pressed={pressed}
      disabled={disabled || !onClick}
      onClick={onClick}
    >
      <span className="orb-value">{text ?? Math.floor(value)}</span>
    </button>
  );
}

/** HP, Prayer and Run orbs beside the minimap. */
export function Orbs() {
  const hp = useApp((s) => s.game.hp.current);
  const prayer = useApp((s) => s.game.prayer.current);
  const progression = useApp((s) => s.game.progression);
  const energy = useApp((s) => s.game.movement.runEnergy);
  const running = useApp((s) => s.game.movement.running);
  const toggleRun = useApp((s) => s.toggleRun);
  const { audio } = useRuntime();
  return (
    <div className="orbs">
      <Orb label="Hit points" value={hp} max={getLevel(progression, 'hitpoints')} color="#c0392b" />
      <Orb label="Prayer" value={prayer} max={getLevel(progression, 'prayer')} color="#2f7fd1" />
      <Orb
        label={running ? 'Run on' : 'Run off'}
        value={energy}
        max={MAX_RUN_ENERGY}
        color={running ? '#f1c40f' : '#a08a2a'}
        text={`${Math.floor(energy / 100)}`}
        pressed={running}
        disabled={!running && energy < MIN_RUN_ENERGY}
        onClick={() => {
          audio.play('uiClick');
          toggleRun();
        }}
      />
    </div>
  );
}
