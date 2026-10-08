/**
 * Placeholder swing timing for mining: a swing lands on every
 * gather ATTEMPT, read from what the tick did (not from a wall-clock timer, which dropped the swing on the
 * tick the rock depleted and the session cleared). The animator's 'mine' pose also fires onImpact, so
 * `animatorImpactCounts` keeps that source out for mining: ONE source per skill (mining = the tick, chop = the animator).
 */
export interface SessionSnap {
  nodeId: string;
  defId: string;
  cooldown: number;
}

interface TickEventLike {
  type: string;
}

/**
 * Did the gather tick that just ran make an attempt? A hit shows as `itemGathered` (even when the node
 * depleted and the session cleared); a miss as a session that was due (`cooldown <= 1`) and carries on.
 * `prev` is the session after the previous tick; a fresh `gatherStarted` makes it stale, so it is ignored.
 */
export function attemptLanded(
  prev: SessionSnap | null,
  post: SessionSnap | null,
  events: readonly TickEventLike[],
): boolean {
  if (events.some((e) => e.type === 'itemGathered')) return true;
  if (events.some((e) => e.type === 'gatherStarted')) return false;
  if (!prev || !post || prev.nodeId !== post.nodeId) return false;
  return prev.cooldown <= 1;
}

/** The audio event for a landed swing: carries the gathered skill so mining plays the pick, not the axe. */
export function swingImpactEvent(skill: string | undefined): {
  type: 'swingImpact';
  skill?: string;
} {
  return skill ? { type: 'swingImpact', skill } : { type: 'swingImpact' };
}

/**
 * Should the animator's onImpact produce a swing? Never for mining: its attempts come from the tick
 * (`attemptLanded`), which also covers misses and the depleting attempt (session already cleared, animator
 * possibly already back to idle). Chopping has no other source, so it stays on the animator.
 */
export function animatorImpactCounts(animState: string, toolKind: string | undefined): boolean {
  return animState !== 'mine' && toolKind !== 'pickaxe';
}
