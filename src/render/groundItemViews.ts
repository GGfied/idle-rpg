import type Phaser from 'phaser';
import type { MotionMode } from './animation/types';
import { itemIconIds, itemIconSource, type ItemIconSource } from './itemIcons';
import { cullToCamera, uncullFromCamera } from './viewCull';
import type { Projection } from './projection';
import {
  hitDistance,
  ICON_PX,
  PILE_OFFSETS,
  planPiles,
  qtyBadge,
  type GroundItemLike,
  type Placed,
} from './groundItemModel';

export interface GroundItemViews {
  /** Make the drawn items match `items`: adds new, removes gone, updates changed qty. Cheap to call every tick. */
  sync(items: readonly GroundItemLike[]): void;
  /** Id of the ground item at a WORLD pixel (topmost/nearest within the tap target), or null. */
  hitTest(worldX: number, worldY: number): string | null;
  destroy(): void;
}

export interface GroundItemViewOptions {
  /** Animations setting; the drop settle tween plays only on 'on'. Default 'on'. */
  motion?: () => MotionMode;
  /** Icon source lookup (default: the shared item icons, the same ones the inventory and bank draw). */
  iconSource?: (itemId: string) => ItemIconSource | undefined;
}

/** Ground items sit under a figure standing on the same tile (building doors use the same -0.5 trick). */
const DEPTH_BIAS = -0.5;
const SLOT_DEPTH = 0.01;
const DROP_PX = 14;
const DROP_MS = 260;
const SHADOW_KEY = 'ground_shadow';
const SACK_KEY = 'ground_sack';
const TEX = 32;

interface View {
  c: Phaser.GameObjects.Container;
  icon: Phaser.GameObjects.Image;
  badge: Phaser.GameObjects.Text;
  itemId: string;
  qty: number;
  slot: number;
  x: number;
  y: number;
  cx: number;
  cy: number;
  depth: number;
  tween?: Phaser.Tweens.Tween;
}

function makeCanvas(
  scene: Phaser.Scene,
  key: string,
  draw: (g: CanvasRenderingContext2D) => void,
): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, TEX, TEX);
  if (!tex) return;
  draw(tex.getContext());
  tex.refresh();
}

function ensureShared(scene: Phaser.Scene): void {
  makeCanvas(scene, SHADOW_KEY, (g) => {
    const grad = g.createRadialGradient(16, 16, 1, 16, 16, 15);
    grad.addColorStop(0, 'rgba(0,0,0,0.45)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, TEX, TEX);
  });
  // Generic sack for items with no icon art (and while an icon is still loading).
  makeCanvas(scene, SACK_KEY, (g) => {
    g.fillStyle = '#2a1c10';
    g.fillRect(8, 10, 16, 16);
    g.fillRect(11, 6, 10, 5);
    g.fillStyle = '#a07a45';
    g.fillRect(9, 11, 14, 14);
    g.fillRect(12, 7, 8, 4);
    g.fillStyle = '#c9a063';
    g.fillRect(11, 13, 5, 8);
    g.fillStyle = '#6b4a26';
    g.fillRect(11, 10, 10, 2);
  });
}

/**
 * Items lying on the ground: the inventory icon on its tile with a soft shadow, up to MAX_PILE per
 * tile as a small offset pile with a qty badge for stacks. One pooled Container per drawn item,
 * depth-sorted with the projection, culled with the shared view cull. Render only: reads the items,
 * never changes them.
 */
export function createGroundItemViews(
  scene: Phaser.Scene,
  projection: Projection,
  options: GroundItemViewOptions = {},
): GroundItemViews {
  const motion = options.motion ?? ((): MotionMode => 'on');
  const sourceOf = options.iconSource ?? itemIconSource;
  ensureShared(scene);

  const live = new Map<string, View>();
  const pool: View[] = [];
  const plan = new Map<string, Placed>();
  const loading = new Set<string>();
  let destroyed = false;

  function textureFor(itemId: string): string {
    const src = sourceOf(itemId);
    if (!src) return SACK_KEY;
    const { key, url } = src;
    if (scene.textures.exists(key)) return key;
    if (!loading.has(itemId) && typeof Image !== 'undefined') {
      loading.add(itemId);
      const img = new Image();
      img.onload = () => {
        if (destroyed || !scene.textures || scene.textures.exists(key)) return;
        const tex = scene.textures.createCanvas(key, TEX, TEX);
        if (!tex) return;
        const g = tex.getContext();
        g.imageSmoothingEnabled = false;
        g.drawImage(img, 0, 0, TEX, TEX);
        tex.refresh();
        for (const v of live.values()) if (v.itemId === itemId) v.icon.setTexture(key);
      };
      img.src = url;
    }
    return SACK_KEY;
  }

  // Decode every icon once now so the real picture is ready before the first drop (no sack flash).
  for (const id of itemIconIds()) textureFor(id);

  function create(): View {
    const shadow = scene.add.image(0, 1, SHADOW_KEY).setDisplaySize(ICON_PX * 1.5, ICON_PX * 0.75);
    const icon = scene.add.image(0, -ICON_PX / 4, SACK_KEY).setDisplaySize(ICON_PX, ICON_PX);
    const badge = scene.add
      .text(ICON_PX / 2, -ICON_PX / 4 + ICON_PX / 2, '', {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: '#ffe36b',
        stroke: '#000000',
        strokeThickness: 2,
        resolution: 2,
      } as Phaser.Types.GameObjects.Text.TextStyle)
      .setOrigin(1, 1);
    const c = scene.add.container(0, 0, [shadow, icon, badge]);
    cullToCamera(scene, c);
    return { c, icon, badge, itemId: '', qty: 0, slot: 0, x: 0, y: 0, cx: 0, cy: 0, depth: 0 };
  }

  function show(v: View, p: Placed, fresh: boolean): void {
    const { item, slot } = p;
    if (fresh || v.itemId !== item.itemId) {
      v.itemId = item.itemId;
      v.icon.setTexture(textureFor(item.itemId)).setDisplaySize(ICON_PX, ICON_PX);
    }
    if (fresh || v.qty !== item.qty) {
      v.qty = item.qty;
      const text = qtyBadge(item.qty);
      v.badge.setText(text).setVisible(text !== '');
    }
    if (fresh || v.x !== item.x || v.y !== item.y || v.slot !== slot) {
      v.x = item.x;
      v.y = item.y;
      v.slot = slot;
      const w = projection.tileToWorld(item.x, item.y);
      const off = PILE_OFFSETS[slot] ?? PILE_OFFSETS[0]!;
      v.cx = w.x;
      v.cy = w.y;
      v.c.setPosition(w.x + off.x, w.y + off.y);
      v.depth = projection.depthFor(item.x, item.y) + DEPTH_BIAS + slot * SLOT_DEPTH;
      v.c.setDepth(v.depth);
    }
  }

  function release(v: View): void {
    v.tween?.stop();
    v.tween = undefined;
    uncullFromCamera(scene, v.c);
    v.c.setVisible(false).setActive(false);
    pool.push(v);
  }

  function drop(v: View): void {
    v.icon.y = -ICON_PX / 4;
    if (motion() !== 'on') return;
    v.icon.y = -ICON_PX / 4 - DROP_PX;
    v.tween = scene.tweens.add({
      targets: v.icon,
      y: -ICON_PX / 4,
      duration: DROP_MS,
      ease: 'Bounce.easeOut',
      onComplete: () => {
        v.tween = undefined;
      },
    });
  }

  return {
    sync(items) {
      if (destroyed) return;
      planPiles(items, plan);
      for (const [id, v] of live) {
        if (!plan.has(id)) {
          live.delete(id);
          release(v);
        }
      }
      for (const [id, p] of plan) {
        let v = live.get(id);
        const fresh = !v;
        if (!v) {
          v = pool.pop() ?? create();
          cullToCamera(scene, v.c);
          v.c.setVisible(true).setActive(true);
          live.set(id, v);
        }
        show(v, p, fresh);
        if (fresh) drop(v);
      }
    },
    hitTest(worldX, worldY) {
      let best: string | null = null;
      let bestD = Infinity;
      let bestDepth = -Infinity;
      for (const [id, v] of live) {
        const d = hitDistance(worldX, worldY, v.cx, v.cy);
        if (d > 1) continue;
        if (d < bestD - 1e-9 || (Math.abs(d - bestD) <= 1e-9 && v.depth > bestDepth)) {
          best = id;
          bestD = d;
          bestDepth = v.depth;
        }
      }
      return best;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const v of live.values()) v.tween?.stop();
      for (const v of [...live.values(), ...pool]) v.c.destroy();
      live.clear();
      pool.length = 0;
    },
  };
}
