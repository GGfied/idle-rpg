import { useEffect, useRef } from 'react';
import { getLevel } from '@core/progression';
import { MAX_RUN_ENERGY, MIN_RUN_ENERGY } from '@features/movement';
import { WORLD_DEF } from '@features/world';
import { isDepleted } from '@core/skills';
import { cappedPixelRatio } from '@platform/viewport';
import { drawMinimap, minimapPxToTile } from '@render/index';
import type { MinimapMarker, MinimapView } from '@render/index';
import { advanceTrail, renderPosition, startTrail } from '@app/scenes/renderTrail';
import type { Trail } from '@app/scenes/renderTrail';
import { createMinimapTerrain } from '@app/scenes/minimapTerrain';
import { CONTENT } from '@app/registry';
import { useApp, useRuntime } from '@app/ui/context';
import { LOW_ENERGY_MESSAGE, runTapOutcome } from '@app/ui/runToggle';

/** Canvas px per tile, in CSS px, at the circle's native size. */
const TILE_CSS_PX = 4;

/** Round minimap (tap to walk), redrawn every frame, with an "N" label. */
export function Minimap() {
  const { store, ticker } = useRuntime();
  const ref = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<MinimapView | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const terrainFor = createMinimapTerrain(TILE_CSS_PX);
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
      const zoom = (css / 160) * dpr;
      const { image, canvas: terrain } = terrainFor(
        me,
        Math.ceil(px / 2 / (TILE_CSS_PX * zoom)) + 1,
      );
      const view: MinimapView = {
        centre: me,
        radiusPx: px / 2,
        pxPerTile: TILE_CSS_PX,
        zoom,
        pixelRatio: cappedPixelRatio(),
        bounds: { width: WORLD_DEF.widthTiles, height: WORLD_DEF.heightTiles },
      };
      viewRef.current = view;
      const markers: MinimapMarker[] = [];
      for (const o of CONTENT.objects.values())
        markers.push({ kind: 'bank', tile: { x: o.x, y: o.y } });
      for (const t of CONTENT.trees.values()) {
        const node = g.gathering.nodes[t.nodeId];
        markers.push({
          kind: node !== undefined && isDepleted(node) ? 'stump' : 'tree',
          tile: { x: t.x, y: t.y },
        });
      }
      for (const n of CONTENT.npcs.values())
        markers.push({ kind: 'npc', tile: { x: n.x, y: n.y } });
      const dest = g.movement.destination ?? g.movement.path[g.movement.path.length - 1];
      if (dest) markers.push({ kind: 'destination', tile: dest });
      markers.push({ kind: 'player', tile: me });
      ctx.clearRect(0, 0, px, px);
      drawMinimap(ctx, terrain, image, view, markers, WORLD_DEF.labels);
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
        onPointerDown={(e) => e.stopPropagation()}
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
      disabled={!onClick}
      aria-disabled={disabled || undefined}
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
  const say = useApp((s) => s.say);
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
          if (runTapOutcome(running, energy, MIN_RUN_ENERGY) === 'rejectedLowEnergy') {
            say(LOW_ENERGY_MESSAGE);
            return;
          }
          toggleRun();
        }}
      />
    </div>
  );
}
