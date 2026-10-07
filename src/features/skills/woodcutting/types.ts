import type { GatherStopReason } from '@core/skills';

/** Chat text for woodcutting, as data the integrator looks up by event type / stop reason. */
export interface WoodcuttingMessages {
  /** gatherStarted. */
  started: string;
  /** itemGathered, keyed by log item id. */
  gathered: Readonly<Record<string, string>>;
  /** gatherStopped, keyed by reason. `{level}` in levelTooLow is replaced by the tree's level. */
  stopped: Readonly<Record<GatherStopReason, string>>;
}
