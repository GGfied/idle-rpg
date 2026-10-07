import type { Requirement } from '@core/contracts';

/** What choosing an option asks the integrator to do. Ids are plain strings owned by other modules. */
export type FacilityIntent =
  { type: 'openPanel'; panel: string } | { type: 'startRecipe'; recipeGroup: string };

/** Where the player may stand to use a facility. `adjacent4` = any walkable 4-adjacent tile. */
export type ReachRule = 'adjacent4';

export interface FacilityOption {
  id: string;
  label: string;
  intent: FacilityIntent;
  /** Locked options stay listed; the integrator shows why and blocks the intent. */
  requires?: Requirement[];
}

export interface FacilityDef {
  kind: string;
  name: string;
  examine: string;
  reach: ReachRule;
  options: FacilityOption[];
}

export type FacilityError = 'unknownFacility' | 'unknownOption';
