/** What a tap on the Run orb should do. Mirrors the movement rule: run can be turned off any time, on only with enough energy. */
export type RunTap = 'toggle' | 'rejectedLowEnergy';

export const LOW_ENERGY_MESSAGE = "You don't have enough energy to run.";

export function runTapOutcome(running: boolean, energy: number, minEnergy: number): RunTap {
  return !running && energy < minEnergy ? 'rejectedLowEnergy' : 'toggle';
}
