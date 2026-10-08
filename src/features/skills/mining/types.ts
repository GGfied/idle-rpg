import type { GatherStopReason } from '@core/skills';

/** Chat text for mining, as data the integrator looks up by event type / stop reason. */
export interface MiningMessages {
  /** gatherStarted. */
  started: string;
  /** itemGathered, keyed by ore item id. */
  gathered: Readonly<Record<string, string>>;
  /** gatherStopped, keyed by reason. `{level}` in levelTooLow is replaced by the rock's level. */
  stopped: Readonly<Record<GatherStopReason, string>>;
}
