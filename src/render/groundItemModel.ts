// Pure ground-item layout and hit maths (no Phaser): piles per tile, badge text, tap target.

/** The structural subset of core/items GroundItem the renderer needs. */
export interface GroundItemLike {
  id: string | number;
  itemId: string;
  qty: number;
  x: number;
  y: number;
}

/** Most items drawn on one tile; the rest are still there, just not drawn. */
export const MAX_PILE = 3;

/** Pile slot offsets in world px (slot 0 = centre, 1 and 2 stack up-left and down-right). */
export const PILE_OFFSETS: readonly { x: number; y: number }[] = [
  { x: 0, y: 0 },
  { x: -7, y: -3 },
  { x: 7, y: -2 },
];

/**
 * Tap target half-sizes in world px around the tile centre: 60x48 px, so >= 44 CSS px at zoom >= 1
 * (the diamond is 64x32; the extra height is the icon standing a little above the ground).
 */
export const HIT_RX = 30;
export const HIT_RY = 24;

/** Item icon size on the ground: about 40% of the 64 px tile width. */
export const ICON_PX = 26;

export interface Placed {
  item: GroundItemLike;
  slot: number;
}

/** Visible items per tile: the first MAX_PILE by id per tile (stable), with their pile slot. Reuses `out`. */
export function planPiles(items: readonly GroundItemLike[], out: Map<string, Placed> = new Map()) {
  out.clear();
  const perTile = new Map<number, GroundItemLike[]>();
  for (const it of items) {
    const key = it.x * 65536 + it.y;
    const list = perTile.get(key);
    if (list) list.push(it);
    else perTile.set(key, [it]);
  }
  for (const list of perTile.values()) {
    if (list.length > 1)
      list.sort((a, b) => String(a.id).localeCompare(String(b.id), 'en', { numeric: true }));
    for (let slot = 0; slot < Math.min(MAX_PILE, list.length); slot++) {
      const item = list[slot]!;
      out.set(String(item.id), { item, slot });
    }
  }
  return out;
}

/** Badge text for a stack: empty for 1, "12", "1.5k", "2M" style above that. */
export function qtyBadge(qty: number): string {
  if (qty <= 1) return '';
  if (qty < 10_000) return String(qty);
  if (qty < 1_000_000) return `${Math.floor(qty / 1000)}k`;
  return `${Math.floor(qty / 1_000_000)}M`;
}

/** Normalised elliptical distance of a world point from a tap target centre; <= 1 is a hit. */
export function hitDistance(px: number, py: number, cx: number, cy: number): number {
  const dx = (px - cx) / HIT_RX;
  const dy = (py - cy) / HIT_RY;
  return Math.hypot(dx, dy);
}
