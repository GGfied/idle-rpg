export interface InsetRect {
  top: number;
  width: number;
  height: number;
}

/**
 * How many px of the viewport bottom the HUD covers. Only the phone-portrait bottom sheet and chat
 * strip cover the world's lower edge; desktop and phone landscape report 0 (their HUD sits at the sides).
 */
export function bottomInset(viewportH: number, rects: InsetRect[], phonePortrait: boolean): number {
  if (!phonePortrait) return 0;
  let top = viewportH;
  for (const r of rects) if (r.width > 0 && r.height > 0) top = Math.min(top, r.top);
  return Math.max(0, Math.round(viewportH - top));
}
