/** Depth layers. Entities sort by y inside the ENTITY band. */
export const LAYERS = {
  GROUND: 0,
  GROUND_DECOR: 10,
  ENTITY: 1000,
  OVERHEAD: 100000,
  VFX: 200000,
  UI: 300000,
} as const;

/** Depth for an entity standing on tileY (accepts fractional y while moving). Lower rows draw first. */
export function depthFor(tileY: number): number {
  return LAYERS.ENTITY + tileY;
}
