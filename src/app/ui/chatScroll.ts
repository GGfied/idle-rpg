/** Pixels of slack under which the log counts as "at the bottom" (sub-pixel scroll, zoom rounding). */
export const BOTTOM_SLACK_PX = 4;

export interface ScrollMetrics {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
}

/** True when the view shows the newest line, so new lines should keep it pinned there. */
export function isAtBottom(m: ScrollMetrics, slack = BOTTOM_SLACK_PX): boolean {
  return m.scrollHeight - m.clientHeight - m.scrollTop <= slack;
}
