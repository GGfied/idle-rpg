import { buildingAt } from '@features/world';
import { isInsideBuilding } from '@render/index';

/**
 * True for a building's outer-wall tiles: the building renderer draws those, so the chunk renderer
 * skips its grey block there. Interior wall tiles (counters) are not shell and keep their block.
 */
export function isBuildingShell(tx: number, ty: number): boolean {
  const b = buildingAt(tx, ty);
  return b !== null && !isInsideBuilding(b, tx, ty);
}
