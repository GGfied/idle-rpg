import type Phaser from 'phaser';
import type { MotionMode } from '@render/animation';
import { blockOriginY, ensureBlockTexture } from './block';
import { paintBankFront, paintWallPattern } from './buildingArt';
import {
  createFade,
  lookOf,
  roofTrim,
  FRONT_WALL_INSIDE_ALPHA,
  planBuilding,
  roofFaces,
  roofStyleOf,
  type BuildingLook,
  type BuildingSource,
  type Fade,
  type WallPart,
} from './buildingModel';
import type { Projection } from './projection';

export interface BuildingRendererOptions {
  /** Current Animations setting; anything but 'on' makes roof/wall fades instant. Default 'on'. */
  motion?: () => MotionMode;
}

export interface BuildingState {
  roofAlpha: number;
  frontWallAlpha: number;
  roofDepth: number;
  inside: boolean;
}

export interface BuildingRenderer {
  /** Draw a building. Idempotent by id: adding an id that exists is a no-op (chunk reloads can re-offer it). */
  add(b: BuildingSource): void;
  remove(id: string): void;
  /** The building the player is standing in (its roof and front walls fade out), or null for none. */
  setInside(id: string | null): void;
  has(id: string): boolean;
  count(): number;
  /** Debug/test: fade state and roof depth of one building. */
  state(id: string): BuildingState | undefined;
  destroyAll(): void;
}

interface Entry {
  roof: Phaser.GameObjects.Graphics;
  walls: { img: Phaser.GameObjects.Image; part: WallPart }[];
  roofFade: Fade;
  wallFade: Fade;
  roofDepth: number;
  inside: boolean;
}

/** House keeps its original keys; other looks get their own textures. */
export function wallKey(look: BuildingLook, roofKey: string, door: WallPart['door']): string {
  const base = look.style === 'house' ? `bld_wall_${roofKey}` : `bld_wall_${look.style}`;
  return `${base}${door ? `_door_${door}` : ''}`;
}

/**
 * Iso buildings drawn from structural `BuildingSource`s: tall block walls (depth-sorted per tile so
 * entities pass behind them), a doorway, and a hip roof. Independent of the chunk renderer, so a
 * building spanning chunks is drawn exactly once. Static art; only alpha changes at runtime.
 */
export function createBuildingRenderer(
  scene: Phaser.Scene,
  projection: Projection,
  opts: BuildingRendererOptions = {},
): BuildingRenderer {
  const entries = new Map<string, Entry>();
  let insideId: string | null = null;
  const instant = () => (opts.motion?.() ?? 'on') !== 'on';

  const apply = (e: Entry) => {
    e.roof.setAlpha(e.roofFade.value).setVisible(e.roofFade.value > 0);
    for (const w of e.walls) {
      if (!w.part.front) continue;
      w.img.setAlpha(e.wallFade.value).setVisible(e.wallFade.value > 0);
    }
  };

  const onUpdate = (_time: number, dt: number) => {
    for (const e of entries.values()) {
      const a = e.roofFade.step(dt);
      const b = e.wallFade.step(dt);
      if (a || b) apply(e);
    }
  };
  scene.events.on('update', onUpdate);

  const retarget = (id: string, e: Entry) => {
    const inside = id === insideId;
    e.inside = inside;
    const now = instant();
    e.roofFade.set(inside ? 0 : 1, now);
    e.wallFade.set(inside ? FRONT_WALL_INSIDE_ALPHA : 1, now);
    apply(e);
  };

  const destroyEntry = (e: Entry) => {
    e.roof.destroy();
    e.walls.forEach((w) => w.img.destroy());
  };

  return {
    add(b) {
      if (entries.has(b.id)) return;
      const style = roofStyleOf(b.roof);
      const look = lookOf(b);
      const wallColor = look.wallColor ?? style.wall;
      const plan = planBuilding(b, projection);
      const roof = scene.add.graphics().setDepth(plan.roofDepth);
      for (const f of roofFaces(b, projection)) {
        roof.fillStyle(f.color, 1).fillPoints(f.points, true);
        roof.lineStyle(1, 0x000000, 0.28).strokePoints(f.points, true);
        for (const [x0, y0, x1, y1] of f.lines) {
          roof.lineStyle(1, 0x000000, 0.2).lineBetween(x0, y0, x1, y1);
        }
      }
      const trim = roofTrim(b, projection);
      roof.lineStyle(2, trim.color, 1);
      for (const [x0, y0, x1, y1] of trim.lines) roof.lineBetween(x0, y0, x1, y1);
      const walls: Entry['walls'] = [];
      for (const part of plan.walls) {
        if (part.gap) continue;
        const key = wallKey(look, style.key, part.door);
        ensureBlockTexture(scene, key, {
          color: wallColor,
          height: look.wallHeight,
          door: part.door ?? undefined,
          doorHeight: look.doorHeight,
          paintFaces: paintWallPattern(look.pattern, wallColor),
          paintFront: look.bankFront ? paintBankFront(wallColor) : undefined,
        });
        const p = projection.tileToWorld(part.x, part.y);
        const img = scene.add
          .image(p.x, p.y, key)
          .setOrigin(0.5, blockOriginY(look.wallHeight))
          .setDepth(part.depth);
        walls.push({ img, part });
      }
      const e: Entry = {
        roof,
        walls,
        roofFade: createFade(1),
        wallFade: createFade(1),
        roofDepth: plan.roofDepth,
        inside: false,
      };
      entries.set(b.id, e);
      retarget(b.id, e);
    },
    remove(id) {
      const e = entries.get(id);
      if (!e) return;
      destroyEntry(e);
      entries.delete(id);
    },
    setInside(id) {
      insideId = id;
      for (const [bid, e] of entries) retarget(bid, e);
    },
    has: (id) => entries.has(id),
    count: () => entries.size,
    state(id) {
      const e = entries.get(id);
      return (
        e && {
          roofAlpha: e.roofFade.value,
          frontWallAlpha: e.wallFade.value,
          roofDepth: e.roofDepth,
          inside: e.inside,
        }
      );
    },
    destroyAll() {
      scene.events.off('update', onUpdate);
      entries.forEach(destroyEntry);
      entries.clear();
    },
  };
}
