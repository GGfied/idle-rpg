/**
 * Keep an entity label fully inside the visible world range.
 * `entityX` is the label's natural centre (the entity's world x); returns the x OFFSET to add so
 * [centre - halfWidth, centre + halfWidth] stays within [viewLeft + margin, viewRight - margin].
 * If the label is wider than the view it is centred on the view.
 */
export function labelClampOffset(
  entityX: number,
  halfWidth: number,
  viewLeft: number,
  viewRight: number,
  margin: number,
): number {
  const min = viewLeft + margin + halfWidth;
  const max = viewRight - margin - halfWidth;
  if (min > max) return (viewLeft + viewRight) / 2 - entityX;
  if (entityX < min) return min - entityX;
  if (entityX > max) return max - entityX;
  return 0;
}
